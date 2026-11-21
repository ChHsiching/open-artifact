/**
 * The build show on the stage (`build-show.ts` of the editor kit).
 *
 * When slides arrive from the agent while it writes (or slides its outline
 * planned), the stage shows each in turn, in deck order, and replays how it
 * goes together: its blocks appear one after another, each drawn in by the
 * agent's cursor. Between slides the cursor waits where it stopped.
 *
 * The stage starts a slide's show in a layout effect (`beginSlideBuild`), so
 * the slide never paints whole first. Once the viewer presses or types
 * anywhere on the page, the stage stops going to arriving slides until the
 * agent's next writing session; a press on the stage also shows the slide
 * being drawn at once. Readers who ask for less motion see no show.
 */

import { SLIDE_HEIGHT, SLIDE_WIDTH } from '@open-artifact/slides-core';
import { collectBlocks, planBuild, playBuild, prefersReducedMotion, type BuildPoint, type BuildRun } from '@open-artifact/editor-kit';
import { deckOrder, useDeck } from '../state/deck.ts';
import { useView } from '../state/view.ts';
import { useAgent } from './agent.ts';
import { useSlideBuild } from './build-state.ts';
import { useCreation } from './creation.ts';

export { useSlideBuild } from './build-state.ts';

/** How long one slide's show may take, alone or with more waiting, ms. */
const BUDGET_MS = 3400;
const BUDGET_QUEUED_MS = 2600;
/** A slide sent to the stage that has not started its show by then is skipped, ms. */
const STAGE_TIMEOUT_MS = 1200;

let started = false;
const queue: string[] = [];
let running: { id: string; run: BuildRun } | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
/** The viewer took over the stage in this writing session. */
let tookOver = false;
/** The cursor's last place, in slide units. */
let cursor: BuildPoint | null = null;

const writing = (): boolean => useCreation.getState().writing || useAgent.getState().status.busy;

function updateIdle(): void {
  const state = useSlideBuild.getState();
  if (state.show || state.pending) return;
  const at = writing() && !tookOver ? cursor ?? { x: SLIDE_WIDTH * 0.08, y: SLIDE_HEIGHT * 0.1 } : null;
  const was = state.idle?.at ?? null;
  if (at?.x !== was?.x || at?.y !== was?.y) useSlideBuild.setState({ idle: at ? { at } : null });
}

function pump(): void {
  const state = useSlideBuild.getState();
  if (running || state.pending) return;
  for (;;) {
    const id = queue.shift();
    if (!id) break;
    const view = useView.getState();
    if (!useDeck.getState().slides[id] || view.mode !== 'edit' || view.presenting) continue;
    if (tookOver && view.current !== id) continue;
    useSlideBuild.setState({ pending: id, idle: null });
    if (view.current !== id) view.showSlide(id);
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      if (useSlideBuild.getState().pending !== id) return;
      useSlideBuild.setState({ pending: null });
      pump();
    }, STAGE_TIMEOUT_MS);
    return;
  }
  updateIdle();
}

/**
 * The stage drew slide `id`, which waits for its show, in `root` (the slide's
 * root element). Called in a layout effect, before the slide first paints.
 */
export function beginSlideBuild(root: HTMLElement, id: string): void {
  if (useSlideBuild.getState().pending !== id) return;
  clearTimeout(pendingTimer);
  const box = root.getBoundingClientRect();
  const scale = box.width / SLIDE_WIDTH || 1;
  const frame = { w: SLIDE_WIDTH, h: SLIDE_HEIGHT };
  const blocks = collectBlocks(root, frame, { origin: { x: box.left, y: box.top }, scale });
  if (!blocks.length) {
    useSlideBuild.setState({ pending: null });
    queueMicrotask(pump);
    return;
  }
  const plan = planBuild(blocks, frame, { start: cursor ?? undefined, budget: queue.length ? BUDGET_QUEUED_MS : BUDGET_MS, max: 22 });
  const run = playBuild(blocks, plan);
  running = { id, run };
  useSlideBuild.setState({ pending: null, show: { plan, startedAt: run.startedAt }, slideId: id, idle: null });
  void run.done.then(() => {
    const last = plan.steps[plan.steps.length - 1];
    if (last) cursor = last.to;
    if (running?.run === run) running = null;
    useSlideBuild.setState({ show: null, slideId: null });
    pump();
  });
}

/** Ends the running show at once. */
export function finishSlideBuild(): void {
  running?.run.finish();
}

/** Whether the stage is showing the agent's slides as they arrive (agent following then waits). */
export { slideBuildActive } from './build-state.ts';

/** Follows arriving slides. Call once the deck is loaded. */
export function startBuildShow(): void {
  if (started) return;
  started = true;
  useDeck.subscribe((state, previous) => {
    if (state.slides === previous.slides || previous.status !== 'ready') return;
    if (running && state.slides[running.id]?.slide !== previous.slides[running.id]?.slide) finishSlideBuild();
    const arrived = Object.keys(state.slides).filter((id) => !previous.slides[id]);
    if (!arrived.length || prefersReducedMotion()) return;
    const planned = new Set(previous.index.order);
    const take = arrived.filter((id) => planned.has(id) || writing());
    if (!take.length) return;
    const order = deckOrder(state);
    queue.push(...take.filter((id) => !queue.includes(id)));
    queue.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    pump();
  });
  useCreation.subscribe((state, previous) => {
    if (state.writing && !previous.writing) tookOver = false;
    if (state.writing !== previous.writing) updateIdle();
  });
  useAgent.subscribe((state, previous) => {
    if (state.status.busy !== previous.status.busy) updateIdle();
  });
  useView.subscribe((state, previous) => {
    if (running && state.current !== running.id) finishSlideBuild();
    if ((state.mode !== previous.mode && state.mode !== 'edit') || (state.presenting && !previous.presenting)) {
      finishSlideBuild();
      queue.length = 0;
    }
  });
  // The viewer pressing or typing takes the stage back.
  const takeOver = (): void => {
    if (!writing() && !running && !queue.length) return;
    tookOver = true;
    queue.length = 0;
    useSlideBuild.setState({ idle: null });
  };
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (event.target instanceof Element && event.target.closest('.oa-build-show')) return;
      if (event.target instanceof Element && event.target.closest('[data-open-artifact-stage]')) finishSlideBuild();
      takeOver();
    },
    true,
  );
  window.addEventListener(
    'keydown',
    (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) return;
      takeOver();
    },
    true,
  );
}
