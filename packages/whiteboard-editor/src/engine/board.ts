/**
 * Runs the board on the canvas engine: starts it over the surface, mirrors
 * the shown board into it, keeps the two cameras together, decides what
 * the DOM still draws, and turns the engine's gestures into board edits.
 *
 * Camera: the engine owns pan and zoom on the canvas (wheel, pinch, middle
 * button, Space and the Hand tool) and reports the camera to `useCamera`;
 * camera changes made elsewhere (zoom buttons, fit, follow) are pushed to
 * the engine.
 *
 * Text: at readable zooms, DOM views under the canvas draw text through
 * holes, including while the view moves. Small boards keep these views across
 * the whole board; larger boards limit them to the last settled viewport.
 * Sprites draw the rest. The renderer choice is refreshed after the
 * camera settles; below `TEXT_SPRITE_MIN_ZOOM` sprites leave text out.
 *
 * Presses: on the canvas, with the Select tool, a mouse or pen press
 * without ⌥/⌘/Ctrl goes to the engine when the engine and the board's own
 * hit test agree on what is under it and that is neither an arrow nor
 * locked. The engine draws marquees and handles moves on canvas-only
 * scenes. Resize handles and moves in mixed scenes use the board's own
 * gestures so the DOM and canvas see the same element geometry.
 */

import { CanvasEngine, parseColor, type CanvasEvents, type CommitIntent, type Peer, type Tool } from '@open-artifact/canvas-engine';
import {
  applyMoveDrag,
  arrowBoundsBox,
  elementBoundsWithTitle,
  placementRectsOverlap,
  expandSelectionToGroups,
  hitSlop,
  isElementLocked,
  type BoardElement,
  type Box,
  type ElementId,
  type ElementsById,
} from '@open-artifact/whiteboard-core';
import { cameraLayerTransform, GRID_BASE_PITCH, GRID_FADE_END_PX, GRID_FADE_START_PX, sameCamera, screenToBoard, type Camera, type Point } from '../lib/camera.ts';
import { useCollabPeers } from '../collab/peers.ts';
import { CURSOR_HIDE_MS } from '../collab/PeerCursors.tsx';
import { layerOrder } from '../elements/ElementsLayer.tsx';
import { useElementView } from '../elements/view-state.ts';
import { announce, movedMessage } from '../services/announce.ts';
import { boardElements, canEditBoard, editContent, selectedIds } from '../services/actions.ts';
import { maybeSession } from '../services/session.ts';
import { AREA_FILL_OPACITY } from '../selection/area-marquee.ts';
import { useInteraction } from '../selection/store.ts';
import { useBoard } from '../state/board.ts';
import { useCamera, zoomRange } from '../state/camera.ts';
import { currentMeasures, useMeasures } from '../state/measures.ts';
import { usePresence } from '../state/presence.ts';
import { useSelection } from '../state/selection.ts';
import { shownById, useShown } from '../state/shown.ts';
import { useTheme } from '../state/theme.ts';
import { effectiveTool, useTool } from '../state/tool.ts';
import { containerAtPoint, hitContext, pressTargetAt } from '../tools/hit.ts';
import { createTextAt, placeElement } from '../tools/place.ts';
import { clickStartsTyping, hasModifier, marqueePick, openElement, rectBetween, startMove, stopTyping, type MoveState } from '../tools/select.ts';
import { isAlwaysLive, itemOwner, sectionTitleSpot } from './items.ts';
import { useStickerParty } from '../lib/sticker-party.ts';
import { BoardMirror } from './mirror.ts';
import { claimPress, engineRef, engineRequested, useEngineView } from './mode.ts';
import { spriteBucket } from './sprite-keys.ts';
import { SpritePainter } from './sprites.ts';

/** Zoom below which the DOM never draws text (sprites do). */
export const DOM_TEXT_MIN_ZOOM = 0.35;
/** Most elements with text the DOM draws at once; with more in view, sprites draw them all. */
export const DOM_TEXT_MAX = 300;

/** The surface parts the engine board works with. */
export interface EngineBoardParts {
  surface: HTMLElement;
  canvas: HTMLCanvasElement;
  /** The element layer under the canvas, visible through its holes. */
  elements: HTMLElement;
  /** The live DOM layer above the canvas (camera transform, every frame). */
  live: HTMLElement;
}

/** A started engine board. */
export interface EngineBoard {
  engine: CanvasEngine;
  destroy(): void;
}

/** The shown elements in draw order, with their index. */
function shownBoard(): { elements: BoardElement[]; byId: ElementsById } {
  const state = useBoard.getState();
  const overrides = useShown.getState().overrides;
  const byId = shownById(state.byId, overrides);
  const elements: BoardElement[] = [];
  for (const id of layerOrder(state.board.content.elements)) {
    const element = byId.get(id);
    if (element) elements.push(element);
  }
  for (const [id, element] of overrides) if (element && !state.byId.has(id)) elements.push(element);
  return { elements, byId };
}

/** Engine colors from the surface's CSS tokens. */
function engineTheme(surface: HTMLElement, scheme: 'light' | 'dark') {
  const css = getComputedStyle(surface);
  const token = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
  const select = token('--wb-select', '#2563eb');
  return {
    background: token('--wb-paper', scheme === 'dark' ? '#191919' : '#ffffff'),
    grid: token('--wb-grid', 'rgba(0,0,0,0.02)'),
    selection: select,
    handle: scheme === 'dark' ? '#191919' : '#ffffff',
    guide: token('--wb-sel-guide', '#e5484d'),
    // The engine fills the marquee with this colour: translucent, as the DOM board's rubber band.
    marquee: ((parseColor(select) & 0xffffff00) | Math.round(AREA_FILL_OPACITY * 255)) >>> 0,
  };
}

/**
 * Starts the engine over `parts.canvas`. Resolves `null` when it cannot
 * start (marking the engine failed, so the DOM draws the board) or when
 * `signal` aborted meanwhile.
 */
export async function startEngineBoard(parts: EngineBoardParts, signal: AbortSignal): Promise<EngineBoard | null> {
  const { surface, canvas, elements: elementLayer, live: liveLayer } = parts;
  const scheme = (): 'light' | 'dark' => useTheme.getState().scheme;
  let engine: CanvasEngine;
  try {
    const range = zoomRange();
    engine = await CanvasEngine.create(canvas, {
      selection: 'controlled',
      dragEvents: true,
      marquee: 'intersect',
      // As the DOM grid (.wb-grid): 1px lines; each level doubles, the in-between lines fading in between these pitches.
      grid: 'lines',
      gridSpacing: GRID_BASE_PITCH,
      gridMajor: 2,
      gridFade: [GRID_FADE_START_PX, GRID_FADE_END_PX],
      wheelZoom: false,
      // As `wheelZoomFactor`: exp(-deltaY × 0.01), at most 1.25× per event.
      zoomSpeed: 0.01,
      wheelZoomMax: 1.25,
      settleMs: 150,
      cameraEventMs: 50,
      minZoom: range.min,
      maxZoom: range.max,
      theme: engineTheme(surface, scheme()),
    });
  } catch (error) {
    if (signal.aborted) return null;
    console.warn('Whiteboard: the canvas engine could not start; drawing the board with the DOM.', error);
    useEngineView.setState({ status: 'failed' });
    return null;
  }
  if (signal.aborted) {
    // The surface went away while the engine loaded.
    engine.destroy();
    return null;
  }
  engineRef.current = engine;
  const offs: Array<() => void> = [];
  const mirror = new BoardMirror(engine);

  /* ---------------------------------------------------------------- camera */

  engine.setCamera(useCamera.getState().camera);
  let echo = false;
  const pullCamera = (): void => {
    const { x, y, zoom } = engine.camera;
    echo = true;
    useCamera.getState().setCamera({ x, y, zoom });
    echo = false;
  };
  offs.push(
    engine.on('camera', pullCamera),
    useCamera.subscribe((state, previous) => {
      if (state.compact !== previous.compact) {
        const { min, max } = zoomRange(state);
        engine.setOptions({ minZoom: min, maxZoom: max });
      }
      if (echo || state.camera === previous.camera || sameCamera(state.camera, engine.camera)) return;
      engine.setCamera(state.camera);
    }),
  );
  const applyLayerTransforms = (camera: Camera): void => {
    const transform = cameraLayerTransform(camera);
    elementLayer.style.transform = transform;
    liveLayer.style.transform = transform;
    elementLayer.toggleAttribute('data-wb-zoomed-out', camera.zoom < 1);
    liveLayer.toggleAttribute('data-wb-zoomed-out', camera.zoom < 1);
  };
  applyLayerTransforms(engine.camera);

  /* ------------------------------------------------------------ mirroring */

  let settled = { view: engine.viewport(), bucket: spriteBucket(engine.camera.zoom, window.devicePixelRatio || 1) };
  /** Elements whose text shows through a canvas hole now. */
  let holes: ReadonlySet<ElementId> = new Set();
  let preview: { move: MoveState; dx: number; dy: number } | null = null;

  const liveIds = (elements: readonly BoardElement[], byId: ElementsById): Set<ElementId> => {
    const ids = new Set<ElementId>();
    for (const element of elements) if (isAlwaysLive(element)) ids.add(element.id);
    // A sticker playing its animation (the timer ran out) is drawn as DOM while it plays.
    for (const id of useStickerParty.getState().playing.keys()) ids.add(id);
    const { editing, cropping } = useSelection.getState();
    if (editing) ids.add(editing.id);
    if (cropping) ids.add(cropping);
    // The live layer sits above the canvas. Keep overlapping foreground elements above it in board order.
    if (ids.size) {
      const regions: Box[] = [];
      const measures = currentMeasures();
      const { zoom } = useCamera.getState().camera;
      for (const element of elements) {
        if (!regions.length && !ids.has(element.id)) continue;
        const box = element.type === 'arrow' ? arrowBoundsBox(element, byId, measures) : elementBoundsWithTitle(element, measures, false, zoom);
        if (box && (ids.has(element.id) || regions.some((liveBox) => placementRectsOverlap(box, liveBox, 2)))) {
          ids.add(element.id);
          regions.push(box);
        }
      }
    }
    return ids;
  };

  /** Publishes the live list in draw order. */
  const pushLive = (elements: readonly BoardElement[], byId: ElementsById): Set<ElementId> => {
    const live = liveIds(elements, byId);
    const liveList = elements.filter((element) => live.has(element.id)).map((element) => element.id);
    const current = useEngineView.getState().live;
    if (liveList.length !== current.length || liveList.some((id, index) => id !== current[index])) useEngineView.setState({ live: liveList });
    return live;
  };

  const sync = (): void => {
    let { elements, byId } = shownBoard();
    if (preview) {
      const moved = applyMoveDrag({ elements }, { dx: preview.dx, dy: preview.dy, origins: preview.move.origins, freeEnds: preview.move.freeEnds });
      elements = moved.elements as BoardElement[];
      byId = new Map(elements.map((element) => [element.id, element]));
    }
    const live = pushLive(elements, byId);
    engineRef.drawn = byId;
    mirror.sync({
      elements,
      byId,
      measures: currentMeasures(),
      scheme: scheme(),
      editable: canEditBoard(),
      zoom: useCamera.getState().camera.zoom,
      bucket: settled.bucket,
      view: settled.view,
      dom: holes,
      live,
      backdrops: useElementView.getState().backdrops,
    });
    // A new element may have been selected before the engine had it.
    pushSelection();
  };
  let syncFrame = 0;
  const scheduleSync = (): void => {
    if (syncFrame === 0) syncFrame = requestAnimationFrame(() => {
      syncFrame = 0;
      sync();
    });
  };
  offs.push(
    useBoard.subscribe((state, previous) => {
      if (state.board !== previous.board) {
        // Element transforms update both DOM geometry and the matching canvas holes in the same frame.
        const { transform } = useInteraction.getState();
        if (transform === 'resize' || transform === 'move') sync();
        else scheduleSync();
        scheduleDomRefresh();
      }
    }),
    useShown.subscribe(scheduleSync),
    useCamera.subscribe((state, previous) => {
      if (state.camera.zoom !== previous.camera.zoom) scheduleSync();
    }),
    useStickerParty.subscribe(scheduleSync),
    useMeasures.subscribe(scheduleSync),
    useElementView.subscribe((state, previous) => {
      if (state.backdrops !== previous.backdrops) scheduleSync();
    }),
    useSelection.subscribe((state, previous) => {
      if (state.editing === previous.editing && state.cropping === previous.cropping) return;
      // Now, in the same render as the edit: an editor first mounted under the canvas would be
      // mounted again above it a frame later, and lose its focus (and the edit) on the way.
      const { elements, byId } = shownBoard();
      pushLive(elements, byId);
      scheduleSync();
    }),
    useTheme.subscribe(() => {
      engine.setOptions({ theme: engineTheme(surface, scheme()) });
      scheduleSync();
    }),
  );

  const painter = new SpritePainter(engine, {
    current: (id) => mirror.sprite(id),
    byId: () => mirror.frame?.byId ?? new Map(),
    measures: currentMeasures,
    scheme,
    backdrops: () => useElementView.getState().backdrops,
    titleSpot: (element) => (element.type === 'container' ? sectionTitleSpot(element, currentMeasures(), useCamera.getState().camera.zoom) : undefined),
    faceName: (id) => {
      const session = maybeSession();
      if (session && (id === session.viewer.id || id === session.peerId)) return session.viewer.name;
      for (const peer of usePresence.getState().peers.values()) if (peer.id === id) return peer.name;
      return undefined;
    },
  });
  offs.push(engine.on('textureNeeded', ({ keys }) => painter.want(keys)), () => painter.stop());

  /* ------------------------------------------------- what the DOM draws */

  let gesture: 'move' | 'resize' | 'marquee' | 'pan' | 'pinch' | null = null;
  let revealFrame = 0;
  let domTimer: ReturnType<typeof setTimeout> | undefined;

  /** Text views and the items that overlap their holes (see the module notes). */
  const domSet = (): Set<ElementId> => {
    const { zoom } = engine.camera;
    const out = new Set<ElementId>();
    if (zoom < DOM_TEXT_MIN_ZOOM || gesture === 'move') return out;
    const elements = mirror.frame?.elements ?? [];
    const owners = elements.length <= DOM_TEXT_MAX
      ? elements.map(({ id }) => id)
      : new Set(engine.queryRect(engine.viewport()).map(itemOwner));
    const texts: ElementId[] = [];
    for (const id of owners) if (mirror.sprite(id) && !mirror.sprite(id)!.place.picture) texts.push(id);
    if (texts.length > DOM_TEXT_MAX) return out;
    for (const id of texts) {
      out.add(id);
      for (const under of engine.queryRect(mirror.sprite(id)!.place.box)) out.add(itemOwner(under));
    }
    for (const id of useEngineView.getState().live) out.delete(id);
    return out;
  };

  const markMoving = (): void => {
    surface.dataset.wbMoving = '';
    if (!useEngineView.getState().moving) useEngineView.setState({ moving: true });
  };

  /** The camera settled: lays the DOM out for the new view, then opens holes onto it once it has drawn. */
  let settleQueued = false;
  const settle = (): void => {
    // The camera's last event and the end of its move come together: settle once.
    if (settleQueued) return;
    settleQueued = true;
    queueMicrotask(() => {
      settleQueued = false;
      settleNow();
    });
  };
  const settleNow = (): void => {
    if (engine.moving || gesture === 'move' || useInteraction.getState().transform === 'resize') return;
    pullCamera();
    const { zoom } = engine.camera;
    settled = { view: engine.viewport(), bucket: spriteBucket(zoom, window.devicePixelRatio || 1) };
    const dom = domSet();
    // Views leaving the DOM go now: close their holes first.
    holes = new Set([...holes].filter((id) => dom.has(id)));
    sync();
    useEngineView.setState({ dom, moving: false });
    delete surface.dataset.wbMoving;
    if (revealFrame !== 0) cancelAnimationFrame(revealFrame);
    // Two frames: React renders the views, then they are laid out and painted.
    revealFrame = requestAnimationFrame(() => {
      revealFrame = requestAnimationFrame(() => {
        revealFrame = 0;
        holes = dom;
        sync();
        // Sprites of what the DOM draws now, for the next pan.
        const keys: string[] = [];
        for (const id of dom) {
          const key = mirror.spriteKeyAt(id, settled.bucket);
          if (key) keys.push(key);
        }
        painter.want(keys);
      });
    });
  };
  const scheduleDomRefresh = (): void => {
    clearTimeout(domTimer);
    domTimer = setTimeout(() => {
      if (!engine.moving && gesture === null) settle();
    }, 200);
  };
  offs.push(
    engine.on('moving', ({ moving }) => (moving ? markMoving() : settle())),
    engine.on('frame', () => applyLayerTransforms(engine.camera)),
    engine.on('camera', ({ settled: still }) => {
      if (still) settle();
    }),
    () => {
      clearTimeout(domTimer);
      if (revealFrame !== 0) cancelAnimationFrame(revealFrame);
      if (syncFrame !== 0) cancelAnimationFrame(syncFrame);
    },
  );

  /* ----------------------------------------------------------- selection */

  const pushSelection = (): void => {
    const ids = useSelection.getState().ids.filter((id) => {
      const element = mirror.frame?.byId.get(id);
      return element !== undefined && element.type !== 'arrow' && !mirror.frame?.live.has(id);
    });
    const current = engine.selection;
    if (ids.length !== current.length || ids.some((id, index) => id !== current[index])) engine.setSelection(ids);
  };
  offs.push(
    useSelection.subscribe((state, previous) => {
      if (state.ids !== previous.ids) pushSelection();
    }),
  );

  /* --------------------------------------------------------------- tools */

  let tool: Tool = 'select';
  const idleTool = (): Tool => {
    const name = effectiveTool();
    if (name === 'hand') return 'pan';
    return name === 'select' && !useTool.getState().commentMode ? 'select' : 'none';
  };
  const setTool = (next: Tool): void => {
    if (next === tool) return;
    tool = next;
    engine.setTool(next);
  };
  let pressing: number | null = null;
  offs.push(
    useTool.subscribe(() => {
      if (pressing === null) setTool(idleTool());
    }),
  );
  setTool(idleTool());

  /* ------------------------------------------------------------- presses */

  /** The press the engine runs. */
  let press: { hit: BoardElement | undefined; board: Point; at: Point } | null = null;
  let lastVia: 'engine' | 'board' = 'board';
  let pointer: Point = { x: 0, y: 0 };
  /** The engine's press became a drag (move, resize or marquee). */
  let gestured = false;

  const localPoint = (event: { clientX: number; clientY: number }): Point => {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  /** Decides who runs a press on the canvas. */
  const engineTakes = (event: PointerEvent, hit: BoardElement | undefined, at: Point): boolean => {
    if (event.button === 1) return true;
    if (event.button !== 0 || event.pointerType === 'touch') return false;
    const name = effectiveTool();
    if (name === 'hand') return true;
    if (name !== 'select' || useTool.getState().commentMode || event.altKey || hasModifier(event) || !canEditBoard()) return false;
    if (hit) {
      if (hit.type === 'arrow' || isElementLocked(hit)) return false;
      const { dom, live } = useEngineView.getState();
      // A moved item can carry or cross DOM elements. Move them using the same board state.
      if (dom.size > 0 || live.length > 0) return false;
    }
    const engineHit = engine.hitTest(at);
    return (engineHit === null ? undefined : itemOwner(engineHit)) === hit?.id;
  };

  const onDownCapture = (event: PointerEvent): void => {
    if (event.target !== canvas) {
      // A press on DOM over the canvas (a live element, chrome): not the engine's.
      press = null;
      return;
    }
    pullCamera();
    const at = localPoint(event);
    const board = screenToBoard(engine.camera, at);
    const context = hitContext();
    const editable = canEditBoard();
    const hit = pressTargetAt(context, board, event.pointerType, editable && !event.shiftKey && !hasModifier(event));
    if (engineTakes(event, hit, at)) {
      claimPress(event);
      lastVia = 'engine';
      press = { hit, board, at };
      gestured = false;
      const editing = useSelection.getState().editing;
      if (editing && editing.id !== hit?.id) stopTyping();
      return;
    }
    lastVia = 'board';
    press = null;
    pressing = event.pointerId;
    setTool('none');
  };
  const onUp = (event: PointerEvent): void => {
    if (pressing !== event.pointerId) return;
    pressing = null;
    setTool(idleTool());
  };
  /** After the engine saw a click: a click on an untitled section's title band starts typing its title (as the board's own tool does). */
  const onEngineUp = (event: PointerEvent): void => {
    const done = press;
    if (!done || lastVia !== 'engine' || gestured || event.shiftKey) return;
    // A click on empty board clears the selection. The engine proposes that only when its own
    // selection changes, and it never holds live DOM elements (an animated sticker, a timer).
    if (!done.hit) {
      if (event.button === 0 && effectiveTool() === 'select' && useSelection.getState().ids.length > 0) useSelection.getState().clear();
      return;
    }
    if (clickStartsTyping(done.hit)) {
      useSelection.getState().edit({ kind: 'element', id: done.hit.id });
      return;
    }
    if (done.hit.type !== 'container' || done.hit.text.trim() !== '') return;
    const { ids } = useSelection.getState();
    const context = hitContext();
    if (ids.length === 1 && ids[0] === done.hit.id && containerAtPoint([done.hit], done.board, hitSlop('mouse', context.zoom), context.measures, context.zoom, true)) {
      useSelection.getState().edit({ kind: 'element', id: done.hit.id });
    }
  };
  const onMove = (event: PointerEvent): void => {
    if (event.target === canvas || press) pointer = localPoint(event);
  };
  const onDoubleClick = ({ world: board }: CanvasEvents['dblclick']): void => {
    if (lastVia !== 'engine' || effectiveTool() !== 'select') return;
    const editable = canEditBoard();
    const hit = pressTargetAt(hitContext(), board, 'mouse', editable);
    if (hit) openElement(hit, null);
    else if (editable) placeElement(createTextAt(board), { label: 'Add text', keepTool: true });
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || gesture === null || gesture === 'pan' || gesture === 'pinch') return;
    engine.cancelGesture();
    event.stopPropagation();
  };
  surface.addEventListener('pointerdown', onDownCapture, { capture: true });
  window.addEventListener('pointerup', onUp, { capture: true });
  window.addEventListener('pointercancel', onUp, { capture: true });
  window.addEventListener('pointermove', onMove, { capture: true, passive: true });
  window.addEventListener('pointerup', onEngineUp);
  window.addEventListener('keydown', onKey, { capture: true });
  offs.push(engine.on('dblclick', onDoubleClick), () => {
    surface.removeEventListener('pointerdown', onDownCapture, { capture: true });
    window.removeEventListener('pointerup', onUp, { capture: true });
    window.removeEventListener('pointercancel', onUp, { capture: true });
    window.removeEventListener('pointermove', onMove, { capture: true });
    window.removeEventListener('pointerup', onEngineUp);
    window.removeEventListener('keydown', onKey, { capture: true });
  });

  /* ------------------------------------------------------------ gestures */

  offs.push(
    engine.on('gesture', ({ kind, phase }) => {
      if (phase === 'start') {
        gesture = kind;
        if (kind !== 'pan' && kind !== 'pinch') gestured = true;
        if (kind === 'move') {
          const move = press?.hit ? startMove(press.hit.id, press.board, { additive: false, duplicate: false }) : undefined;
          if (!move) {
            engine.cancelGesture();
            return;
          }
          preview = { move, dx: 0, dy: 0 };
          useInteraction.getState().setTransform('move');
          markMoving();
        }
        return;
      }
      const was = gesture;
      gesture = null;
      if (was === 'move') {
        preview = null;
        useInteraction.getState().reset();
        scheduleSync();
        if (!engine.moving) settle();
      }
    }),
    engine.on('dragging', ({ dx, dy }) => {
      if (!preview) return;
      preview = { ...preview, dx, dy };
      sync();
    }),
    engine.on('commit', (intent) => applyCommit(intent)),
  );

  const applyCommit = (intent: CommitIntent): void => {
    switch (intent.op) {
      case 'select': {
        const elements = boardElements();
        const selection = selectedIds();
        const { shift } = intent.modifiers;
        if (gesture === 'marquee' && press) {
          const rect = rectBetween(press.board, screenToBoard(engine.camera, pointer));
          const picked = marqueePick(hitContext(), rect, shift ? selection : new Set(), shift, canEditBoard());
          useSelection.getState().select([...picked]);
        } else if (!press?.hit) {
          if (!shift) useSelection.getState().clear();
        } else {
          const picked = expandSelectionToGroups(elements, new Set([press.hit.id]), selection);
          if (!shift) useSelection.getState().select([...picked]);
          else if ([...picked].every((id) => selection.has(id))) useSelection.getState().select([...selection].filter((id) => !picked.has(id)));
          else useSelection.getState().select([...selection, ...[...picked].filter((id) => !selection.has(id))]);
        }
        // The engine only proposed: show what the board chose.
        pushSelection();
        return;
      }
      case 'move': {
        const move = preview?.move;
        if (!move) return;
        const drag = { dx: intent.dx, dy: intent.dy, origins: move.origins, freeEnds: move.freeEnds };
        editContent((content) => applyMoveDrag(content, drag), { label: move.label, coalesce: move.key });
        announce(movedMessage(intent.dx, intent.dy));
        return;
      }
    }
  };

  /* --------------------------------------------------------------- peers */

  const pushPeers = (): void => {
    const now = Date.now();
    const peers: Peer[] = [...useCollabPeers.getState().peers.values()].map((peer) => ({
      color: peer.color,
      cursor: peer.pointer && now - peer.movedAt <= CURSOR_HIDE_MS ? peer.pointer : null,
      selection: peer.selection.filter((id) => mirror.frame?.byId.has(id)),
    }));
    engine.setPeers(peers);
  };
  offs.push(useCollabPeers.subscribe(pushPeers));

  /* ---------------------------------------------------------------- start */

  sync();
  pushSelection();
  pushPeers();
  useEngineView.setState({ status: 'on' });
  settle();

  return {
    engine,
    destroy() {
      for (const off of offs.splice(0)) off();
      engine.destroy();
      if (engineRef.current === engine) Object.assign(engineRef, { current: null, drawn: null });
      useEngineView.setState({ status: engineRequested() ? 'starting' : 'off', moving: false, dom: new Set(), live: [] });
      delete surface.dataset.wbMoving;
    },
  };
}
