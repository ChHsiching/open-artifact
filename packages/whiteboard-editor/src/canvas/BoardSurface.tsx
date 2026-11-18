/**
 * The board surface: the viewport element. It measures itself, wires
 * wheel/trackpad/pinch gestures, applies the camera to the board layer and
 * routes each press to the active tool's gesture (see `tools/gesture.ts`).
 *
 * Layers, back to front: paper, grid, the camera layer (elements, in board
 * units) and the screen-space overlay (handles, cursors, pins).
 *
 * With the canvas engine (see `engine/board.ts`) the canvas sits between
 * the camera layer and the overlay and draws the board and its grid (the
 * DOM grid is left out, so holes show plain paper); the camera layer
 * keeps the element views whose text shows through the canvas's holes,
 * and a second camera layer above the canvas holds the live elements and
 * the other board-unit content (`children`), kept on the engine's camera
 * every frame.
 */

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { COMMENT_CURSOR } from '@open-artifact/editor-kit/react';
import { startEngineBoard } from '../engine/board.ts';
import { engineOwnsPress, useEngineView } from '../engine/mode.ts';
import { cameraLayerTransform } from '../lib/camera.ts';
import { useCamera } from '../state/camera.ts';
import { effectiveTool, useTool } from '../state/tool.ts';
import { attachViewportGestures } from '../services/viewport.ts';
import { sampleOf, toolPress, type Gesture } from '../tools/gesture.ts';
import { panGesture } from '../tools/hand.ts';
import { Grid } from './Grid.tsx';
import { PlaceGhost } from './PlaceGhost.tsx';
import { boardGestureCanceller, surfaceRef } from './surface.ts';

export { surfaceRef } from './surface.ts';

/** Props of {@link BoardSurface}. */
export interface BoardSurfaceProps {
  /** The element layer, in board units (under the engine canvas when it runs). */
  elements?: ReactNode;
  /** Elements that stay interactive DOM above the engine canvas, in board units (engine only). */
  live?: ReactNode;
  /** Other content in board units, above the elements. */
  children?: ReactNode;
  /** Content in screen units, above the board. */
  overlay?: ReactNode;
}

/** The board's viewport. */
export function BoardSurface({ elements, live, children, overlay }: BoardSurfaceProps) {
  const surface = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const liveLayer = useRef<HTMLDivElement>(null);
  const tool = useTool((state) => effectiveTool(state));
  const commenting = useTool((state) => state.commentMode);
  const status = useEngineView((state) => state.status);
  const engine = status === 'starting' || status === 'on';

  // The canvas engine (unless `?open_artifact_engine=off`; the DOM draws the board when it cannot start).
  useEffect(() => {
    const element = surface.current;
    if (!engine || !element || !canvas.current || !liveLayer.current) return;
    const abort = new AbortController();
    let stop: (() => void) | undefined;
    void startEngineBoard({ surface: element, canvas: canvas.current, live: liveLayer.current }, abort.signal).then((board) => {
      if (board) stop = () => board.destroy();
    });
    return () => {
      abort.abort();
      stop?.();
    };
  }, [engine]);

  // Size and pointer coarseness.
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    surfaceRef.current = element;
    const coarse = matchMedia('(pointer: coarse)');
    const measure = (): void => {
      const bounds = element.getBoundingClientRect();
      useCamera.getState().setViewport(bounds.width, bounds.height, coarse.matches);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    coarse.addEventListener('change', measure);
    measure();
    return () => {
      observer.disconnect();
      coarse.removeEventListener('change', measure);
      if (surfaceRef.current === element) surfaceRef.current = null;
    };
  }, []);

  // The camera transform, applied without re-rendering.
  useEffect(() => {
    const element = layer.current;
    if (!element) return;
    const apply = (): void => {
      const { camera } = useCamera.getState();
      element.style.transform = cameraLayerTransform(camera, window.devicePixelRatio || 1);
      element.toggleAttribute('data-wb-zoomed-out', camera.zoom < 1);
      liveLayer.current?.toggleAttribute('data-wb-zoomed-out', camera.zoom < 1);
    };
    apply();
    return useCamera.subscribe((state, previous) => {
      if (state.camera !== previous.camera) apply();
    });
  }, []);

  // Wheel, trackpad and pinch; a pinch cancels the one-finger gesture in progress.
  const active = useRef<{ pointerId: number; gesture: Gesture } | null>(null);
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    return attachViewportGestures({
      element,
      onGestureStart: () => {
        active.current?.gesture.cancel?.();
        active.current = null;
      },
      // The engine pans and zooms on its own canvas.
      skipWheel: (event) => event.target === canvas.current,
    });
  }, []);

  // Press → gesture routing.
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const onDown = (event: PointerEvent): void => {
      if (active.current || element.dataset.wbPinching !== undefined || engineOwnsPress(event)) return;
      // Only presses on the board itself; chrome inside the surface opts out.
      if (event.target instanceof Element && event.target.closest('[data-wb-chrome],[data-no-pan]')) return;
      const sample = sampleOf(event, element);
      const middle = event.button === 1;
      if (event.button !== 0 && !middle) return;
      const name = middle ? 'hand' : effectiveTool();
      const gesture = middle ? panGesture(sample) : (toolPress(name)?.(sample) ?? null);
      if (!gesture) return;
      event.preventDefault();
      active.current = { pointerId: event.pointerId, gesture };
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        /* synthetic events cannot be captured */
      }
    };
    const onMove = (event: PointerEvent): void => {
      const current = active.current;
      if (!current || current.pointerId !== event.pointerId) return;
      // Coalesced events keep pen strokes smooth at high pointer rates.
      const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
      for (const each of events.length ? events : [event]) current.gesture.move?.(sampleOf(each, element));
    };
    const onUp = (event: PointerEvent): void => {
      const current = active.current;
      if (!current || current.pointerId !== event.pointerId) return;
      active.current = null;
      current.gesture.up?.(sampleOf(event, element));
    };
    const onCancel = (event: PointerEvent): void => {
      const current = active.current;
      if (!current || current.pointerId !== event.pointerId) return;
      active.current = null;
      current.gesture.cancel?.();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !active.current) return;
      const current = active.current;
      active.current = null;
      current.gesture.cancel?.();
      event.stopPropagation();
    };
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onCancel);
    element.addEventListener('lostpointercapture', onCancel);
    window.addEventListener('keydown', onKey, { capture: true });
    const cancel = (): void => {
      const current = active.current;
      active.current = null;
      current?.gesture.cancel?.();
    };
    boardGestureCanceller.current = cancel;
    return () => {
      if (boardGestureCanceller.current === cancel) boardGestureCanceller.current = null;
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onCancel);
      element.removeEventListener('lostpointercapture', onCancel);
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, []);

  // Pointer position for paste targets and cursor chat.
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const onMove = (event: PointerEvent): void => {
      const bounds = element.getBoundingClientRect();
      useCamera.getState().setPointer({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    };
    const onLeave = (): void => useCamera.getState().setPointer(null);
    element.addEventListener('pointermove', onMove, { passive: true });
    element.addEventListener('pointerleave', onLeave);
    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div
      ref={surface}
      className={`wb-surface wb-tool-${tool}${commenting ? ' wb-commenting' : ''}`}
      // Comment mode's pointer is the comments' speech bubble, as in every editor (styles.css).
      style={commenting ? ({ '--wb-comment-cursor': COMMENT_CURSOR } as CSSProperties) : undefined}
      tabIndex={-1}
      data-testid="board-surface"
      data-wb-engine={engine ? status : undefined}
    >
      {engine ? null : <Grid />}
      <div ref={layer} className="wb-layer">
        {elements}
        {engine ? null : children}
      </div>
      {engine ? <canvas ref={canvas} className="wb-engine-canvas" data-testid="board-canvas" /> : null}
      {engine ? (
        <div ref={liveLayer} className="wb-layer wb-live-layer">
          {live}
          {children}
        </div>
      ) : null}
      <PlaceGhost surface={surface} />
      <div className="wb-overlay">{overlay}</div>
    </div>
  );
}
