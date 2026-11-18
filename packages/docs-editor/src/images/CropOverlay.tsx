/**
 * Crop mode: the whole picture over the text, the part kept framed and the rest dimmed. Each edge of the frame
 * drags; Enter (or Done, or a click elsewhere) keeps the crop, Escape cancels it, Reset frames the whole picture.
 */
import { Card, ChromeButton } from '@open-artifact/editor-kit/react';
import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef } from 'react';
import { useEditor } from '../editor/format.ts';
import { applyCrop, cancelCrop, findTarget, setCropRect } from './actions.ts';
import { type CropEdge, type CropRect, FULL_CROP, dragCropEdge } from './geometry.ts';
import { type CropSession, getImages } from './store.ts';

const EDGES: readonly CropEdge[] = ['n', 's', 'w', 'e'];
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph', 'Fn', 'Tab']);
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Mod-Z: leaves crop mode without keeping the crop. */
function isUndo(event: KeyboardEvent): boolean {
  const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  return mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z';
}

interface Drag {
  edge: CropEdge;
  pointer: number;
  /** The crop when this drag began, put back by Escape. */
  before: CropRect;
}

const percent = (value: number) => `${value * 100}%`;

export function CropOverlay({ session }: { session: CropSession }): ReactNode {
  const frame = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const state = useEditor(hold => hold.state);
  const { rect } = session;

  useEffect(() => frame.current?.focus({ preventScroll: true }), []);

  // The picture changed under crop mode (deleted, replaced, moved, or its tab closed): the frame no longer fits it.
  useEffect(() => {
    const current = getImages().crop;
    if (current && findTarget(current)?.pos !== current.pos) cancelCrop();
  }, [state]);

  // A press anywhere else keeps the crop, and goes on to do what it does there.
  useEffect(() => {
    const press = (event: PointerEvent) => {
      const at = event.target as Node | null;
      if (at && (frame.current?.contains(at) || bar.current?.contains(at))) return;
      applyCrop();
    };
    document.addEventListener('pointerdown', press, true);
    return () => document.removeEventListener('pointerdown', press, true);
  }, []);

  const pointAt = (event: ReactPointerEvent) => {
    const box = frame.current!.getBoundingClientRect();
    return { fx: (event.clientX - box.left) / box.width, fy: (event.clientY - box.top) / box.height };
  };

  const down = (edge: CropEdge) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { edge, pointer: event.pointerId, before: { ...rect } };
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const crop = getImages().crop;
    if (!current || !crop || current.pointer !== event.pointerId) return;
    const { fx, fy } = pointAt(event);
    setCropRect(dragCropEdge(crop.rect, current.edge, fx, fy, crop.entry));
  };

  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (MODIFIERS.has(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (event.key === 'Escape') {
      const current = drag.current;
      if (current) {
        drag.current = null;
        setCropRect(current.before);
      } else cancelCrop();
    } else if (event.key === 'Enter' && !drag.current) applyCrop();
    else if (isUndo(event)) cancelCrop();
  };

  const whole = rect.x === 0 && rect.y === 0 && rect.w === 1 && rect.h === 1;
  const { left, top, width, height } = session.frame;

  return (
    <>
      <div
        ref={frame}
        className="doc-crop absolute z-30"
        style={{ left, top, width, height }}
        tabIndex={-1}
        role="group"
        aria-label="Crop image"
        aria-description="Drag an edge of the image to crop it. Enter keeps the crop, Escape cancels it."
        onKeyDown={key}
      >
        <img className="doc-crop-image" src={session.src} alt="" draggable={false} />
        <div className="doc-crop-window" style={{ left: percent(rect.x), top: percent(rect.y), width: percent(rect.w), height: percent(rect.h) }}>
          {EDGES.map(edge => (
            <div
              key={edge}
              className={`doc-crop-handle doc-crop-handle-${edge}`}
              onPointerDown={down(edge)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            />
          ))}
        </div>
      </div>
      <Card
        ref={bar}
        className="absolute z-30 p-1"
        style={{ left: left + width / 2, top: top + height + 8, transform: 'translateX(-50%)' }}
        onMouseDown={event => event.preventDefault()}
      >
        <ChromeButton disabled={whole} onClick={() => setCropRect({ ...FULL_CROP })}>
          Reset
        </ChromeButton>
        <ChromeButton onClick={() => applyCrop()} className="font-medium text-chrome-accent">
          Done
        </ChromeButton>
      </Card>
    </>
  );
}
