/**
 * The build show on the board (`build-show.ts` of the editor kit).
 *
 * When the agent writes elements, the board replays how they go together
 * instead of showing them in one frame: their blocks (a note's paper, its
 * words, a shape, a line) appear one after another, each drawn in by the
 * agent's cursor. A new element replays whole; of an element the agent
 * changed, only its words when the change was to them, all of it when the
 * change was to anything else, and nothing for a move (it glides). Between
 * shows, while the agent works, its cursor waits where it stopped.
 *
 * An element counts as the agent's when the agent wrote its document and it
 * changed on the board at about the same time; the two signals may come in
 * either order. Each element view tells the show once it is drawn
 * ({@link elementDrawn}, in a layout effect), and the show starts in a
 * microtask after that commit, before the board paints, so nothing flashes.
 * What arrives while a show runs waits hidden for the next one, which takes
 * everything waiting at once.
 *
 * The show plays where the viewer looks and never moves the camera: what
 * the agent writes out of view just appears there. A press on the board
 * shows everything at once. Readers who ask for less motion see no show.
 */

import {
  collectElements,
  keepBlocks,
  planBuild,
  playBuild,
  prefersReducedMotion,
  shiftPlan,
  type BuildBlock,
  type BuildIdle,
  type BuildPoint,
  type BuildRun,
  type BuildShowView,
} from '@open-artifact/editor-kit';
import type { BoardElement, ElementId } from '@open-artifact/whiteboard-core';
import { create } from 'zustand';
import { surfaceRef } from '../canvas/surface.ts';
import { elementDomId } from '../elements/item.tsx';
import { elementReplay, type ElementReplay } from '../lib/build-changes.ts';
import { useAgent } from '../services/agent.ts';
import { maybeSession } from '../services/session.ts';
import { onRemoteChange, useBoard } from '../state/board.ts';
import { useCamera } from '../state/camera.ts';
import { writtenElements } from './activity.ts';

/** How long one show may take, ms. */
const BUDGET_MS = 3600;
/** Most blocks the cursor draws in one show (the rest appear with them). */
const MAX_STEPS = 24;
/** How long one signal (written, changed) waits for the other, ms. */
const MATCH_WINDOW_MS = 2000;
/** How long an element may wait hidden for its show, ms (a show that never ends lets it go). */
const HOLD_MS = 60_000;

interface BoardBuildState {
  /** The show running, in board units. */
  show: BuildShowView | null;
  /** Where the cursor waits, in board units; null: no cursor. */
  idle: BuildIdle | null;
}

/** What the board's build show is doing (drawn by `BuildLayer.tsx`). */
export const useBoardBuild = create<BoardBuildState>()(() => ({ show: null, idle: null }));

let started = false;
/** Elements the agent wrote, and when (epoch ms). */
const wrote = new Map<ElementId, number>();
/** Elements a remote change touched, with what they were before it. */
const changed = new Map<ElementId, { before: BoardElement | undefined; at: number }>();
/** Changed elements drawn since the last flush. */
const drawn = new Set<ElementId>();
let flushing = false;
/** Elements waiting for their show, in the order they came, with what to replay. */
const waiting = new Map<ElementId, Exclude<ElementReplay, null>>();
/** The animations that keep waiting elements hidden. */
const holds = new Map<ElementId, Animation>();
let running: BuildRun | null = null;
/** The cursor's last place, in board units. */
let cursor: BuildPoint | null = null;

function updateIdle(): void {
  const state = useBoardBuild.getState();
  if (state.show) return;
  const at = useAgent.getState().busy ? cursor : null;
  if (at !== (state.idle?.at ?? null)) useBoardBuild.setState({ idle: at ? { at } : null });
}

function hold(id: ElementId): void {
  if (holds.has(id)) return;
  const el = document.getElementById(elementDomId(id));
  try {
    const animation = el?.animate?.([{ opacity: 0 }, { opacity: 0 }], { duration: HOLD_MS, fill: 'both' });
    if (animation) holds.set(id, animation);
  } catch {
    /* no Web Animations */
  }
}

function release(id: ElementId): void {
  holds.get(id)?.cancel();
  holds.delete(id);
}

/** Shows everything now: the running show ends and what waits appears. */
export function finishBoardBuild(): void {
  waiting.clear();
  for (const id of [...holds.keys()]) release(id);
  running?.finish();
}

/** Starts the show of everything waiting, when none runs. */
function play(): void {
  if (running || waiting.size === 0) return;
  const items = [...waiting];
  waiting.clear();
  const surface = surfaceRef.current;
  // Shown again first: blocks are found by what is visible, and the show hides them again in this same task.
  for (const [id] of items) release(id);
  if (!surface) return;
  const { camera } = useCamera.getState();
  const zoom = camera.zoom || 1;
  const box = surface.getBoundingClientRect();
  // Planned in the units of the board in view (top-left at 0, 0), then moved to board units.
  const frame = { w: box.width / zoom, h: box.height / zoom };
  const blocks: BuildBlock[] = [];
  for (const [id, replay] of items) {
    const el = document.getElementById(elementDomId(id));
    if (!el) continue;
    let mine = collectElements([el], frame, { origin: { x: box.left, y: box.top }, scale: zoom });
    if (replay === 'text') mine = keepBlocks(mine, (block) => block.kind === 'text');
    const offset = blocks.length;
    for (const block of mine) blocks.push({ ...block, parent: block.parent >= 0 ? block.parent + offset : -1 });
  }
  if (blocks.length === 0) return updateIdle();
  const start = cursor ? { x: cursor.x - camera.x, y: cursor.y - camera.y } : undefined;
  const plan = planBuild(blocks, frame, { start, budget: BUDGET_MS, max: MAX_STEPS });
  const run = playBuild(blocks, plan);
  const shown = shiftPlan(plan, camera.x, camera.y);
  running = run;
  useBoardBuild.setState({ show: { plan: shown, startedAt: run.startedAt }, idle: null });
  void run.done.then(() => {
    const last = shown.steps[shown.steps.length - 1];
    if (last) cursor = last.to;
    if (running === run) running = null;
    useBoardBuild.setState({ show: null });
    play();
    updateIdle();
  });
}

function prune(now: number): void {
  for (const [id, at] of wrote) if (now - at > MATCH_WINDOW_MS) wrote.delete(id);
  for (const [id, entry] of changed) if (now - entry.at > MATCH_WINDOW_MS) changed.delete(id);
}

/** After the commit that drew changed elements, before the board paints. */
function flush(): void {
  flushing = false;
  prune(Date.now());
  const byId = useBoard.getState().byId;
  for (const id of drawn) {
    const change = changed.get(id);
    const element = byId.get(id);
    if (!change || !element || !wrote.has(id)) continue;
    changed.delete(id);
    const replay = elementReplay(change.before, element);
    if (!replay) continue;
    if (replay === 'whole' || !waiting.has(id)) waiting.set(id, replay);
  }
  drawn.clear();
  if (running) for (const id of waiting.keys()) hold(id);
  else play();
}

/**
 * The view of element `id` was drawn (a layout effect of the element view,
 * after each change of its element).
 */
export function elementDrawn(id: ElementId): void {
  if (!changed.has(id)) return;
  drawn.add(id);
  if (flushing) return;
  flushing = true;
  queueMicrotask(flush);
}

/** Starts following the agent's writes; returns a function that stops. */
export function startBuildShow(): () => void {
  const db = maybeSession()?.db;
  if (!db || started) return () => {};
  started = true;
  const offDb = db.onChange((event) => {
    if (event.author !== 'agent' || prefersReducedMotion()) return;
    const now = Date.now();
    for (const [id] of writtenElements(event.changes)) wrote.set(id, now);
  });
  const offRemote = onRemoteChange((next, previous) => {
    if (next.content.elements === previous.content.elements || prefersReducedMotion()) return;
    const now = Date.now();
    prune(now);
    const before = new Map(previous.content.elements.map((element) => [element.id, element] as const));
    for (const element of next.content.elements) {
      const was = before.get(element.id);
      if (was !== element && !changed.has(element.id)) changed.set(element.id, { before: was, at: now });
    }
  });
  const offAgent = useAgent.subscribe((state, previous) => {
    if (state.busy === previous.busy) return;
    if (!state.busy) cursor = null;
    updateIdle();
  });
  // A press on the board shows everything at once.
  const onPress = (event: PointerEvent): void => {
    if (!running && holds.size === 0) return;
    if (event.target instanceof Node && surfaceRef.current?.contains(event.target)) finishBoardBuild();
  };
  window.addEventListener('pointerdown', onPress, true);
  return () => {
    offDb();
    offRemote();
    offAgent();
    window.removeEventListener('pointerdown', onPress, true);
    finishBoardBuild();
    wrote.clear();
    changed.clear();
    drawn.clear();
    cursor = null;
    useBoardBuild.setState({ show: null, idle: null });
    started = false;
  };
}
