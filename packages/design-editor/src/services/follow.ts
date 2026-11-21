/**
 * Binds the agent-work follower (`lib/follow.ts`) to the editor: the agent's
 * busy status, canvas.json changes from elsewhere, the camera, the page, and
 * the viewer's touches on the canvas. `useFollow` is what the chip renders.
 */

import { boardsOnPage, notesOnPage, type Rect } from '@open-artifact/design-core';
import { useSyncExternalStore } from 'react';
import { createFollower, IDLE, type Follower, type FollowState } from '../lib/follow.ts';
import { noteBounds } from '../lib/notes.ts';
import { useDocument } from '../state/document.ts';
import { MIN_ZOOM, useView } from '../state/view.ts';
import { useAgent } from './agent.ts';
import { glideTo, haltGlide, viewportSize } from './viewport.ts';

/** Height of an artboard's title above it, framed with the artboard. */
const TITLE_HEIGHT = 28;

let follower: Follower | null = null;
/** Chip subscribers; they outlive the follower, which starts after the first render. */
const listeners = new Set<() => void>();

/** Boxes on the current page: artboards by path, notes by `#` + id. */
function pageBoxes(): Map<string, Rect> {
  const { canvas } = useDocument.getState();
  const { page } = useView.getState();
  const out = new Map<string, Rect>();
  for (const path of boardsOnPage(canvas, page)) {
    const entry = canvas.boards[path]!;
    out.set(path, { x: entry.x, y: entry.y - TITLE_HEIGHT, w: entry.w, h: entry.h + TITLE_HEIGHT });
  }
  for (const id of notesOnPage(canvas, page)) out.set(`#${id}`, noteBounds(canvas.notes[id]!));
  return out;
}

/** True when a key press is only a modifier. */
const modifierOnly = (key: string) => key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta' || key === 'CapsLock';

/** Starts following. Runs once, after the project has loaded. */
export function startFollow(): () => void {
  if (follower) return () => undefined;
  const instance = createFollower({
    now: () => performance.now(),
    after(ms, run) {
      const timer = setTimeout(run, ms);
      return () => clearTimeout(timer);
    },
    boxes: pageBoxes,
    screen: () => ({ w: viewportSize.width, h: viewportSize.height }),
    camera: () => useView.getState().camera,
    go: (camera) => {
      if (useView.getState().mode === 'canvas') glideTo(camera);
    },
    halt: haltGlide,
    minZoom: MIN_ZOOM,
  });
  follower = instance;
  const offState = instance.subscribe(() => {
    for (const listener of listeners) listener();
  });
  instance.working(useAgent.getState().status.busy);

  const offAgent = useAgent.subscribe((state, previous) => {
    if (state.status.busy !== previous.status.busy) instance.working(state.status.busy);
  });
  const offView = useView.subscribe((state, previous) => {
    if (state.page !== previous.page) instance.paged();
    else if (state.camera !== previous.camera) instance.viewChanged();
  });

  // A press, wheel or key on the canvas is the viewer taking over.
  const onCanvas = (target: EventTarget | null) => target instanceof Element && target.closest('[data-canvas-surface]') !== null;
  const press = (event: Event): void => {
    if (onCanvas(event.target)) instance.touched();
  };
  // Keys typed into a field (the composer, a panel) or pressed on the chip do not.
  const key = (event: KeyboardEvent): void => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest('[data-follow-chip]'))) return;
    if (!modifierOnly(event.key)) instance.touched();
  };
  window.addEventListener('pointerdown', press, true);
  window.addEventListener('wheel', press, { capture: true, passive: true });
  window.addEventListener('keydown', key, true);

  return () => {
    offState();
    offAgent();
    offView();
    window.removeEventListener('pointerdown', press, true);
    window.removeEventListener('wheel', press, true);
    window.removeEventListener('keydown', key, true);
    instance.dispose();
    follower = null;
  };
}

/** canvas.json changed from elsewhere (called by sync after the merge). */
export function remoteCanvasChanged(): void {
  follower?.remoteChanged();
}

/** A key pressed inside an artboard frame also takes over. */
export function frameKeyPressed(key: string): void {
  if (!modifierOnly(key)) follower?.touched();
}

/** The agent is drawing this artboard: the camera brings it into view while it follows. */
export function focusAgentWork(path: string): void {
  follower?.focus(path);
}

/** Goes to the new work and follows again. */
export function showAgentWork(): void {
  follower?.show();
}

/** Stops following. */
export function stopFollowingAgent(): boolean {
  return follower?.stop() ?? false;
}

/** Hides the unseen count; the view stays where it is. */
export function dismissAgentWork(): void {
  follower?.dismiss();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = (): FollowState => follower?.state() ?? IDLE;

/** The follower state, for the chip. */
export function useFollow(): FollowState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
