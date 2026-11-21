/**
 * The build show on the canvas (`build-show.ts` of the editor kit).
 *
 * When an artboard arrives from the agent while it works (or one it planned in
 * canvas.json before writing it), the canvas replays how the artboard goes
 * together: its blocks appear one after another, each drawn in by the agent's
 * cursor, and the camera brings it into view while it follows the agent.
 * Between artboards the cursor waits on the next one canvas.json plans.
 *
 * One artboard at a time, in the order they arrive. Until its show starts an
 * arriving artboard stays invisible (its frame boots hidden), so nothing
 * flashes; it is kept live and out of snapshots until the show ends. A press
 * on the canvas, a change of the artboard's source or a text edit in it shows
 * everything at once. Readers who ask for less motion see no show.
 */

import { boardsOnPage, pageOf, type Rect } from '@open-artifact/design-core';
import {
  collectBlocks,
  planBuild,
  playBuild,
  prefersReducedMotion,
  shiftPlan,
  type BuildIdle,
  type BuildPoint,
  type BuildRun,
  type BuildShowView,
} from '@open-artifact/editor-kit';
import { create } from 'zustand';
import { useDocument } from '../state/document.ts';
import { useView } from '../state/view.ts';
import { useAgent } from './agent.ts';
import { focusAgentWork } from './follow.ts';
import { frameOf } from './frames.ts';
import { holdLive } from './live.ts';

/** Artboards that arrive this soon after the agent stopped are still its work, ms. */
const AFTER_BUSY_MS = 8000;
/** An arriving artboard whose frame has not booted by then shows without a show, ms. */
const BOOT_TIMEOUT_MS = 8000;
/** How long one artboard's show may take, alone or with more waiting, ms. */
const BUDGET_MS = 5600;
const BUDGET_QUEUED_MS = 3000;

interface BuildState {
  /** Arriving artboards kept invisible until their show starts. */
  hidden: ReadonlySet<string>;
  /** The show running, in world units. */
  show: BuildShowView | null;
  /** Where the cursor waits, in world units; null: no cursor. */
  idle: BuildIdle | null;
}

export const useBuild = create<BuildState>()(() => ({ hidden: new Set(), show: null, idle: null }));

let started = false;
const queue: string[] = [];
let running: { path: string; run: BuildRun | null; skip: boolean } | null = null;
/** The cursor's last place, in world units. */
let cursor: BuildPoint | null = null;
let lastBusyAt = -Infinity;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

const agentActive = (): boolean => useAgent.getState().status.busy || performance.now() - lastBusyAt < AFTER_BUSY_MS;

function reveal(path: string): void {
  const hidden = useBuild.getState().hidden;
  if (!hidden.has(path)) return;
  const next = new Set(hidden);
  next.delete(path);
  useBuild.setState({ hidden: next });
}

/** The cursor's place between shows: the next artboard canvas.json plans on this page, else where it is. */
function updateIdle(): void {
  clearTimeout(idleTimer);
  if (running) return;
  if (!agentActive() && queue.length === 0) {
    if (useBuild.getState().idle) useBuild.setState({ idle: null });
    return;
  }
  if (!useAgent.getState().status.busy) idleTimer = setTimeout(updateIdle, Math.max(100, AFTER_BUSY_MS - (performance.now() - lastBusyAt)));
  const { canvas, boards } = useDocument.getState();
  const next = boardsOnPage(canvas, useView.getState().page).find((path) => boards[path]?.source == null && !queue.includes(path));
  const entry = next ? canvas.boards[next] : undefined;
  let idle: BuildIdle | null = null;
  if (entry) {
    const rect: Rect = { x: entry.x, y: entry.y, w: entry.w, h: entry.h };
    idle = { at: { x: entry.x + Math.min(56, entry.w * 0.1), y: entry.y + Math.min(44, entry.h * 0.08) }, rect };
  } else if (cursor) idle = { at: cursor };
  useBuild.setState({ idle });
}

/** Resolves true once the artboard's frame booted, false after `ms`. */
function whenBooted(path: string, ms: number): Promise<boolean> {
  if (useView.getState().frames[path]?.booted) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      off();
      resolve(false);
    }, ms);
    const off = useView.subscribe((state) => {
      if (!state.frames[path]?.booted) return;
      clearTimeout(timer);
      off();
      resolve(true);
    });
  });
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Waits a little for the frame's fonts, so blocks are measured where they end up. */
async function settle(doc: Document): Promise<void> {
  await nextFrame();
  await Promise.race([doc.fonts?.ready.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 400))]);
  await nextFrame();
}

/** Plays one artboard's show; resolves when it ends. */
async function play(path: string): Promise<void> {
  const release = holdLive(path);
  try {
    focusAgentWork(path);
    const booted = await whenBooted(path, BOOT_TIMEOUT_MS);
    const doc = frameOf(path)?.contentDocument;
    if (!booted || !doc?.body || running?.path !== path || running.skip) return;
    await settle(doc);
    const { canvas } = useDocument.getState();
    const entry = canvas.boards[path];
    if (!entry || running?.path !== path || running.skip || pageOf(canvas, entry) !== useView.getState().page) return;
    const blocks = collectBlocks(doc.body, { w: entry.w, h: entry.h });
    if (!blocks.length) return;
    const start = cursor ? { x: cursor.x - entry.x, y: cursor.y - entry.y } : undefined;
    const plan = planBuild(blocks, { w: entry.w, h: entry.h }, { start, budget: queue.length ? BUDGET_QUEUED_MS : BUDGET_MS });
    const run = playBuild(blocks, plan);
    running.run = run;
    // The animations hide the blocks in this same task, so showing the frame now flashes nothing.
    reveal(path);
    useBuild.setState({ show: { plan: shiftPlan(plan, entry.x, entry.y), startedAt: run.startedAt }, idle: null });
    await run.done;
    const last = plan.steps[plan.steps.length - 1];
    if (last) cursor = { x: last.to.x + entry.x, y: last.to.y + entry.y };
  } finally {
    reveal(path);
    release();
  }
}

async function pump(): Promise<void> {
  if (running) return;
  const path = queue.shift();
  if (!path) {
    updateIdle();
    return;
  }
  running = { path, run: null, skip: false };
  try {
    await play(path);
  } catch (error) {
    console.warn('The build show stopped.', error);
  } finally {
    running = null;
    useBuild.setState({ show: null });
    updateIdle();
    void pump();
  }
}

/** Ends the running show at once: everything it hides shows. */
export function finishBuild(): void {
  if (!running) return;
  running.skip = true;
  running.run?.finish();
}

/**
 * An artboard's source arrived from elsewhere where it had none (called by
 * sync after the merge). `planned`: canvas.json listed it before its file.
 */
export function boardArrived(path: string, planned: boolean): void {
  if (!started || prefersReducedMotion()) return;
  if (!planned && !agentActive()) return;
  const { canvas } = useDocument.getState();
  const entry = canvas.boards[path];
  const view = useView.getState();
  if (!entry || pageOf(canvas, entry) !== view.page || view.mode !== 'canvas' || queue.includes(path) || running?.path === path) return;
  const hidden = new Set(useBuild.getState().hidden);
  hidden.add(path);
  useBuild.setState({ hidden });
  queue.push(path);
  void pump();
}

/** Starts following arrivals. Runs once, after the project has loaded. */
export function startBuildShow(): () => void {
  if (started) return () => undefined;
  started = true;
  if (useAgent.getState().status.busy) lastBusyAt = performance.now();
  const offAgent = useAgent.subscribe((state, previous) => {
    if (state.status.busy === previous.status.busy) return;
    lastBusyAt = performance.now();
    updateIdle();
  });
  const offDocument = useDocument.subscribe((state, previous) => {
    if (running && state.boards[running.path]?.source !== previous.boards[running.path]?.source) finishBuild();
    if (state.canvas !== previous.canvas || state.boards !== previous.boards) updateIdle();
  });
  const offView = useView.subscribe((state, previous) => {
    if (running && state.textEdit && state.textEdit.board === running.path) finishBuild();
    if (state.page !== previous.page || state.mode !== previous.mode) {
      finishBuild();
      for (const path of queue.splice(0)) reveal(path);
      updateIdle();
    }
  });
  // A press on the canvas is the viewer taking over the artboard being drawn.
  const press = (event: Event): void => {
    if (event.target instanceof Element && event.target.closest('[data-canvas-surface]')) finishBuild();
  };
  window.addEventListener('pointerdown', press, true);
  updateIdle();
  return () => {
    started = false;
    offAgent();
    offDocument();
    offView();
    window.removeEventListener('pointerdown', press, true);
    finishBuild();
    for (const path of queue.splice(0)) reveal(path);
    clearTimeout(idleTimer);
  };
}
