/**
 * Registry of mounted artboard frames, so canvas code can reach a board's
 * runtime (`window.__dc` inside the frame) by path.
 */

import type { BoardApi } from '@open-artifact/dc';

const frames = new Map<string, HTMLIFrameElement>();

/** Records the frame of an artboard (the canvas and the focused view each mount one; the last wins). */
export function registerFrame(path: string, iframe: HTMLIFrameElement): () => void {
  frames.set(path, iframe);
  return () => {
    if (frames.get(path) === iframe) frames.delete(path);
  };
}

/** The frame element of an artboard. */
export function frameOf(path: string): HTMLIFrameElement | null {
  return frames.get(path) ?? null;
}

/** The runtime API of an artboard, once it booted. */
export function boardApi(path: string): BoardApi | null {
  try {
    return frames.get(path)?.contentWindow?.__dc ?? null;
  } catch {
    return null;
  }
}

/** Tells every mounted board that some artboards changed (for `<dc-import>` children). */
export function invalidateAll(paths: readonly string[]): void {
  for (const path of frames.keys()) boardApi(path)?.invalidate(paths);
}
