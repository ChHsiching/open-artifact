/**
 * Following the agent's work on the canvas.
 *
 * While the agent works, the artboards and notes it adds on the current page
 * are "fresh". Once its changes have been quiet for a moment, the camera
 * glides to frame them: all of them when that fits at no less than half the
 * zoom the viewer had, otherwise the newest one not yet seen. Following stops
 * as soon as the viewer touches the canvas (pointer, wheel, keys), switches
 * page or presses Stop; nothing moves the camera again until they ask
 * (`show`). Fresh work that stays out of view is counted, with the side it
 * lies on, for the "New while the agent works" chip.
 *
 * This module is pure: time, timers, the camera and the canvas come from a
 * {@link FollowHost}, so it runs under a fake clock in tests.
 */

import type { Rect } from '@open-artifact/design-core';

/** How long after the agent stops its work still counts as this ask. */
export const WORK_END_MS = 120_000;
/** The agent's changes must be quiet this long before the camera moves. */
export const QUIET_MS = 1500;
/** A frame waits at most this long for quiet; then it gives up. */
export const MAX_WAIT_MS = 60_000;
/** Following stays on this long after the agent stops. */
export const LINGER_MS = 30_000;
/** A pause shorter than this is the same piece of work resuming. */
export const RESUME_MS = 3000;
/** Items the camera is gliding to are not counted as unseen for this long. */
export const GLIDE_HOLD_MS = 2000;
/** Following zooms out to at most this fraction of the viewer's zoom. */
export const MIN_ZOOM_FACTOR = 0.5;
/** Screen padding around a framed area, px. */
export const FRAME_PADDING = 56;
/** Retry interval while waiting for quiet. */
const RETRY_MS = 100;

/** The side of the view something lies on. */
export type Heading = 'n' | 'e' | 's' | 'w';

/** A camera: screen = world × zoom + (x, y). */
export interface FollowCamera {
  x: number;
  y: number;
  zoom: number;
}

/** What the follower needs from the editor. */
export interface FollowHost {
  now(): number;
  /** Runs `run` after `ms`; returns a cancel function. */
  after(ms: number, run: () => void): () => void;
  /**
   * The boxes on the current page, keyed by artboard path or `#` + note id,
   * in creation order (newest last).
   */
  boxes(): Map<string, Rect>;
  /** The viewport size in screen px. */
  screen(): { w: number; h: number };
  /** The current camera. */
  camera(): FollowCamera;
  /** Moves the camera (the editor glides there). */
  go(camera: FollowCamera): void;
  /** Stops a running glide. */
  halt(): void;
  /** Smallest zoom the editor allows. */
  minZoom: number;
}

/** What the chip shows. */
export interface FollowState {
  /** The camera follows the agent. */
  following: boolean;
  /** Fresh items out of view (artboards when there are any, else notes). */
  unseen: number;
  of: 'artboards' | 'notes';
  heading: Heading;
}

export const IDLE: FollowState = { following: false, unseen: 0, of: 'artboards', heading: 's' };

/** True for a note key. */
export const isNoteKey = (key: string): boolean => key.startsWith('#');

/** The visible world rect of a camera. */
export function viewOf(camera: FollowCamera, screen: { w: number; h: number }): Rect {
  return { x: -camera.x / camera.zoom, y: -camera.y / camera.zoom, w: screen.w / camera.zoom, h: screen.h / camera.zoom };
}

/** A box counts as shown when it fits and is fully inside, or is bigger and has its centre inside. */
export function shownIn(box: Rect, view: Rect): boolean {
  if (box.w <= view.w && box.h <= view.h) return box.x >= view.x && box.y >= view.y && box.x + box.w <= view.x + view.w && box.y + box.h <= view.y + view.h;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return cx >= view.x && cx <= view.x + view.w && cy >= view.y && cy <= view.y + view.h;
}

/** Which side of the view a box lies on, judged against the view's own shape. */
export function directionOf(box: Rect, view: Rect): Heading {
  const dx = box.x + box.w / 2 - (view.x + view.w / 2);
  const dy = box.y + box.h / 2 - (view.y + view.h / 2);
  if (Math.abs(dx) * view.h > Math.abs(dy) * view.w) return dx > 0 ? 'e' : 'w';
  return dy > 0 ? 's' : 'n';
}

function union(rects: readonly Rect[]): Rect | undefined {
  if (!rects.length) return undefined;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}

const inside = (box: Rect, area: Rect) => box.x >= area.x && box.y >= area.y && box.x + box.w <= area.x + area.w && box.y + box.h <= area.y + area.h;

/** The camera that centres `area` at the largest zoom in range that shows it whole. */
export function cameraFor(area: Rect, zoom: { min: number; max: number }, screen: { w: number; h: number }): FollowCamera {
  const z = Math.min(zoom.max, Math.max(zoom.min, Math.min(screen.w / Math.max(1, area.w), screen.h / Math.max(1, area.h))));
  return { zoom: z, x: screen.w / 2 - (area.x + area.w / 2) * z, y: screen.h / 2 - (area.y + area.h / 2) * z };
}

/** The follower's controls. */
export interface Follower {
  /** The agent started or stopped working. */
  working(busy: boolean): void;
  /** canvas.json changed from elsewhere (the agent). */
  remoteChanged(): void;
  /** The viewer touched the canvas: stop following. */
  touched(): void;
  /** The camera moved (by anyone): recount what is in view. */
  viewChanged(): void;
  /** The viewer switched page: start over. */
  paged(): void;
  /** Go to the new work and follow again (the chip's button). */
  show(): void;
  /** Stop following; returns whether it was following. */
  stop(): boolean;
  /** Forget the unseen count (the chip's Hide). */
  dismiss(): void;
  state(): FollowState;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export function createFollower(host: FollowHost): Follower {
  let working = false;
  let allowed = true;
  let ended = false;
  let gaveUp = false;
  let stoppedAt: number | undefined;
  let lastRemoteAt = -Infinity;
  let lingerUntil = -Infinity;
  let boxes = host.boxes();
  let fresh: string[] = [];
  const seen = new Set<string>();
  const considered = new Set<string>();
  const holding = new Set<string>();
  let pending: { since: number; atOnce: boolean } | undefined;
  let baseZoom: number | undefined;
  let cancelRetry: (() => void) | undefined;
  let cancelHold: (() => void) | undefined;
  let cancelEnd: (() => void) | undefined;
  let cancelLinger: (() => void) | undefined;
  let state = IDLE;
  const listeners = new Set<() => void>();

  const view = () => viewOf(host.camera(), host.screen());

  /** Marks fresh items now in view as seen; returns the others. */
  const unseenItems = (): string[] => {
    const rect = view();
    const out: string[] = [];
    for (const key of fresh) {
      const box = boxes.get(key);
      if (!box || seen.has(key)) continue;
      if (shownIn(box, rect)) {
        seen.add(key);
        holding.delete(key);
      } else out.push(key);
    }
    return out;
  };

  const refresh = (): void => {
    const counted = unseenItems().filter((key) => !holding.has(key) && pending === undefined);
    const artboards = counted.filter((key) => !isNoteKey(key));
    const area = union(counted.map((key) => boxes.get(key)!));
    const next: FollowState = {
      following: allowed && !ended && !gaveUp && fresh.length > 0 && (working || pending !== undefined || holding.size > 0 || host.now() < lingerUntil),
      unseen: artboards.length || counted.length,
      of: artboards.length > 0 || counted.length === 0 ? 'artboards' : 'notes',
      heading: area ? directionOf(area, view()) : state.heading,
    };
    const settled = next.following || next.unseen > 0 ? next : IDLE;
    if (settled.following === state.following && settled.unseen === state.unseen && settled.of === state.of && settled.heading === state.heading) return;
    state = settled;
    for (const listener of listeners) listener();
  };

  const cancelPending = (): void => {
    cancelRetry?.();
    cancelRetry = undefined;
    pending = undefined;
  };

  const releaseHolding = (): void => {
    cancelHold?.();
    cancelHold = undefined;
    holding.clear();
  };

  const reset = (): void => {
    cancelPending();
    releaseHolding();
    fresh = [];
    seen.clear();
    considered.clear();
    gaveUp = false;
    baseZoom = undefined;
  };

  /** All fresh items when they fit at the lowest zoom, else the newest unseen artboard. */
  const frameTarget = (): FollowCamera | undefined => {
    const rect = view();
    const candidates = fresh.filter((key) => boxes.has(key) && (!seen.has(key) || shownIn(boxes.get(key)!, rect)));
    const area = union(candidates.map((key) => boxes.get(key)!));
    if (!area) return undefined;
    baseZoom ??= host.camera().zoom;
    const zoom = { min: Math.max(host.minZoom, baseZoom * MIN_ZOOM_FACTOR), max: baseZoom };
    const screen = host.screen();
    const padded = (r: Rect, scale: number): Rect => ({ x: r.x - FRAME_PADDING / scale, y: r.y - FRAME_PADDING / scale, w: r.w + (2 * FRAME_PADDING) / scale, h: r.h + (2 * FRAME_PADDING) / scale });
    const fits = (r: Rect) => Math.min(screen.w / padded(r, zoom.min).w, screen.h / padded(r, zoom.min).h) >= zoom.min;
    const newest = (keys: string[]) => [...keys].reverse().find((key) => !isNoteKey(key)) ?? keys[keys.length - 1];
    const focus = newest(candidates.filter((key) => !seen.has(key))) ?? newest(candidates)!;
    const target = padded(fits(area) ? area : boxes.get(focus)!, zoom.max);
    for (const key of fresh) {
      considered.add(key);
      const box = boxes.get(key);
      if (box && !seen.has(key) && inside(box, target)) holding.add(key);
    }
    return cameraFor(target, zoom, screen);
  };

  const tryFrame = (): void => {
    cancelRetry = undefined;
    if (!pending) return;
    if (!allowed || (ended && !pending.atOnce)) {
      cancelPending();
      refresh();
      return;
    }
    const now = host.now();
    if (now - pending.since > MAX_WAIT_MS) {
      for (const key of fresh) considered.add(key);
      gaveUp = true;
      cancelPending();
      refresh();
      return;
    }
    const quietFor = now - lastRemoteAt;
    if (!pending.atOnce && quietFor < QUIET_MS) {
      cancelRetry = host.after(Math.max(RETRY_MS, QUIET_MS - quietFor), tryFrame);
      refresh();
      return;
    }
    cancelPending();
    releaseHolding();
    gaveUp = false;
    const camera = frameTarget();
    if (camera) {
      cancelHold = host.after(GLIDE_HOLD_MS, () => {
        cancelHold = undefined;
        holding.clear();
        refresh();
      });
      host.go(camera);
    }
    refresh();
  };

  const request = (atOnce = false): void => {
    const hasNew = () => unseenItems().some((key) => !considered.has(key));
    if (allowed && (atOnce || (working && !ended && hasNew()))) {
      pending ??= { since: host.now(), atOnce };
      if (atOnce) pending.atOnce = true;
      if (!cancelRetry) tryFrame();
    }
    refresh();
  };

  const stopFollowing = (): boolean => {
    if (!allowed) return false;
    const was = state.following;
    allowed = false;
    cancelPending();
    releaseHolding();
    host.halt();
    return was;
  };

  return {
    working(busy) {
      const now = host.now();
      if (!busy) {
        if (!working) return;
        working = false;
        stoppedAt = now;
        lingerUntil = now + LINGER_MS;
        cancelLinger?.();
        cancelLinger = host.after(LINGER_MS, refresh);
        cancelEnd?.();
        cancelEnd = host.after(WORK_END_MS, () => {
          ended = true;
          cancelPending();
          refresh();
        });
        refresh();
        return;
      }
      if (working) return;
      const resumed = stoppedAt !== undefined && now - stoppedAt < RESUME_MS;
      working = true;
      ended = false;
      cancelEnd?.();
      cancelEnd = undefined;
      stoppedAt = undefined;
      if (resumed) {
        refresh();
        return;
      }
      reset();
      boxes = host.boxes();
      allowed = true;
      refresh();
    },
    remoteChanged() {
      const previous = boxes;
      boxes = host.boxes();
      if (fresh.some((key) => !boxes.has(key))) {
        fresh = fresh.filter((key) => boxes.has(key));
        for (const set of [seen, considered, holding]) for (const key of set) if (!boxes.has(key)) set.delete(key);
      }
      if (!working) {
        refresh();
        return;
      }
      lastRemoteAt = host.now();
      for (const key of boxes.keys()) if (!previous.has(key) && !fresh.includes(key)) fresh.push(key);
      request();
    },
    touched() {
      // Touching while the agent works (or while following) declines this
      // run; touching an idle canvas changes nothing.
      if (working || state.following || holding.size > 0) stopFollowing();
      refresh();
    },
    viewChanged() {
      if (fresh.length) refresh();
    },
    paged() {
      reset();
      host.halt();
      boxes = host.boxes();
      stopFollowing();
      refresh();
    },
    show() {
      allowed = true;
      ended = false;
      gaveUp = false;
      baseZoom = undefined;
      if (!working && stoppedAt !== undefined) {
        cancelEnd?.();
        cancelEnd = host.after(WORK_END_MS, () => {
          ended = true;
          cancelPending();
          refresh();
        });
        lingerUntil = host.now() + LINGER_MS;
      }
      request(true);
    },
    stop() {
      const was = stopFollowing();
      refresh();
      return was;
    },
    dismiss() {
      for (const key of fresh) seen.add(key);
      releaseHolding();
      refresh();
    },
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      cancelPending();
      releaseHolding();
      cancelEnd?.();
      cancelLinger?.();
      listeners.clear();
    },
  };
}
