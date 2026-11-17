/**
 * Whether the board draws with the WebGL canvas engine, and what the DOM
 * still draws next to it.
 *
 * With the engine on, the canvas draws the grid, every element's body,
 * text sprites while the camera moves, selection, hover, marquee, guides
 * and peers. The DOM keeps two element layers: under the canvas, the views
 * of elements in view whose text shows through holes while the camera is
 * still (`dom`); above it, live elements that must stay interactive DOM
 * (embeds, the timer, the element being typed in, a table being edited:
 * `live`). `?open_artifact_engine=off` keeps the plain DOM board, and so does a
 * browser where the engine cannot start.
 */

import { create } from 'zustand';
import type { CanvasEngine } from '@open-artifact/canvas-engine';
import type { ElementId, ElementsById } from '@open-artifact/whiteboard-core';

/** The engine's lifecycle: not wanted, loading, drawing, or given up on (the DOM draws). */
export type EngineStatus = 'off' | 'starting' | 'on' | 'failed';

export interface EngineViewState {
  status: EngineStatus;
  /** The camera is moving (pan, zoom, glide): DOM text is hidden and sprites draw. */
  moving: boolean;
  /** Elements the DOM layer under the canvas draws while the camera is still. */
  dom: ReadonlySet<ElementId>;
  /** Elements drawn as interactive DOM above the canvas, in draw order. */
  live: readonly ElementId[];
}

const NONE: ReadonlySet<ElementId> = new Set();

/** True unless the page asks for the DOM board (`?open_artifact_engine=off`); false outside a browser. */
export function engineRequested(search: string | undefined = typeof location === 'undefined' ? undefined : location.search): boolean {
  return search !== undefined && new URLSearchParams(search).get('open_artifact_engine') !== 'off';
}

/** The engine view state ('starting' from the first render when the engine is wanted, so the DOM never draws the whole board first). */
export const useEngineView = create<EngineViewState>()(() => ({ status: engineRequested() ? 'starting' : 'off', moving: false, dom: NONE, live: [] }));

/** The running engine, once started, and the elements it last drew (a drag's preview included). */
export const engineRef: { current: CanvasEngine | null; drawn: ElementsById | null } = { current: null, drawn: null };

/** True while the engine draws the board. */
export function engineOn(): boolean {
  return useEngineView.getState().status === 'on';
}

const enginePresses = new WeakSet<Event>();

/** Marks a press as the engine's, so the board's own tools leave it alone. */
export function claimPress(event: Event): void {
  enginePresses.add(event);
}

/** True when the engine runs this press. */
export function engineOwnsPress(event: Event): boolean {
  return enginePresses.has(event);
}
