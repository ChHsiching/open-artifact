import * as React from 'react';
import { cn } from './cn.ts';
import { subscribeSheetMedia, usesCoarsePointer } from './platform.ts';

export type HandleX = 'left' | 'right' | null;
export type HandleY = 'top' | 'bottom' | null;

/** A point on a frame's outline: a corner, or the middle of a side when one axis is null. */
export interface SelectionHandle {
  x: HandleX;
  y: HandleY;
}

export interface SelectionFrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SelectionFrameState = 'selected' | 'hover';

export interface SelectionFrameProps {
  /** The frame in unscaled page pixels. */
  frame: SelectionFrameBox;
  /** How much the content is zoomed; the outline and grips keep their screen size. */
  scale?: number;
  state?: SelectionFrameState;
  /** Which grips to draw on a selected frame. */
  grips?: 'corners' | 'none';
  /** Pressing a grip or a side starts resizing from that handle. */
  onResizeStart?: (handle: SelectionHandle, event: React.PointerEvent<HTMLDivElement>) => void;
  /** Sides can be dragged too, not only the corners. */
  edgeStrips?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const RING_WIDTH: Readonly<Record<SelectionFrameState, number>> = { selected: 2, hover: 1.5 };
const GRIP_SIZE = 12;
const GRIP_RADIUS = 1;
const GRIP_HIT = 24;
const GRIP_HIT_TOUCH = 40;
const EDGE_HIT = 8;

const CORNER_HANDLES: readonly SelectionHandle[] = [
  { x: 'left', y: 'top' },
  { x: 'right', y: 'top' },
  { x: 'right', y: 'bottom' },
  { x: 'left', y: 'bottom' },
];
const EDGE_HANDLES: readonly SelectionHandle[] = [
  { x: null, y: 'top' },
  { x: 'right', y: null },
  { x: null, y: 'bottom' },
  { x: 'left', y: null },
];

const RESIZE_CURSOR_CYCLE = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const;

/** The resize cursor for dragging a handle of a frame turned by `rotation` radians. */
export function rotatedResizeCursor(handle: SelectionHandle, rotation = 0): string {
  const dx = handle.x === 'left' ? -1 : handle.x === 'right' ? 1 : 0;
  const dy = handle.y === 'top' ? -1 : handle.y === 'bottom' ? 1 : 0;
  const step = Math.round((Math.atan2(dy, dx) + rotation) / (Math.PI / 4));
  return RESIZE_CURSOR_CYCLE[((step % 4) + 4) % 4] ?? 'ew-resize';
}

const handleKey = (handle: SelectionHandle): string => `${handle.x ?? 'mid'}-${handle.y ?? 'mid'}`;

const gripHitSize = (frame: SelectionFrameBox, scale: number, isCoarse: boolean): number => {
  if (isCoarse) return GRIP_HIT_TOUCH;
  const half = (Math.min(frame.w, frame.h) * scale) / 2;
  return Math.max(GRIP_SIZE, Math.min(GRIP_HIT, half));
};

function Grip({ stroke }: { stroke: number }): React.ReactElement {
  return (
    <span
      data-selection-grip=""
      className="pointer-events-none absolute top-1/2 left-1/2 box-border block -translate-x-1/2 -translate-y-1/2 outline-fill-accent"
      style={{
        width: GRIP_SIZE,
        height: GRIP_SIZE,
        borderRadius: GRIP_RADIUS,
        backgroundColor: 'var(--ui-on-accent)',
        outlineStyle: 'solid',
        outlineWidth: stroke,
        outlineOffset: -stroke,
      }}
    />
  );
}

/** The outline of a selected or hovered object on a zoomed page, with grips to resize it. */
export function SelectionFrame({
  frame,
  scale: rawScale = 1,
  state = 'selected',
  grips,
  onResizeStart,
  edgeStrips = true,
  className,
  style,
}: SelectionFrameProps): React.ReactElement {
  const isCoarse = React.useSyncExternalStore(subscribeSheetMedia, () => usesCoarsePointer(), () => false);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  const stroke = RING_WIDTH[state];
  const gripHandles = state === 'selected' && grips !== 'none' ? CORNER_HANDLES : [];
  const isResizable = state === 'selected' && onResizeStart !== undefined;
  const width = frame.w * scale;
  const height = frame.h * scale;
  const hit = gripHitSize(frame, scale, isCoarse);
  const longEnough = (length: number): boolean => length >= 3 * EDGE_HIT;
  const strips =
    !isResizable || isCoarse || !edgeStrips || gripHandles.length === 0
      ? []
      : EDGE_HANDLES.filter((handle) => (handle.x === null ? longEnough(height) : longEnough(width)));
  const gripInset = hit / 2;

  return (
    <div
      aria-hidden="true"
      data-ui="SelectionRing"
      data-state={state}
      className={cn('outline-fill-accent', className)}
      style={{
        ...style,
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        transformOrigin: '0 0',
        transform: `translate(${frame.x}px, ${frame.y}px) scale(${1 / scale})`,
        outlineWidth: stroke,
        outlineStyle: 'solid',
        outlineOffset: 0,
        pointerEvents: 'none',
      }}
    >
      {strips.map((handle) => {
        const isHorizontal = handle.x === null;
        const box: React.CSSProperties = isHorizontal
          ? { left: gripInset, width: Math.max(0, width - 2 * gripInset), top: (handle.y === 'top' ? 0 : height) - EDGE_HIT / 2, height: EDGE_HIT }
          : { top: gripInset, height: Math.max(0, height - 2 * gripInset), left: (handle.x === 'left' ? 0 : width) - EDGE_HIT / 2, width: EDGE_HIT };
        return (
          <div
            key={`strip-${handleKey(handle)}`}
            data-resize-handle=""
            data-resize-strip=""
            className="touch-none"
            style={{ ...box, position: 'absolute', pointerEvents: 'auto', cursor: rotatedResizeCursor(handle) }}
            onPointerDown={(event) => onResizeStart?.(handle, event)}
          />
        );
      })}
      {gripHandles.map((handle) => {
        const left = handle.x === 'left' ? '0%' : '100%';
        const top = handle.y === 'top' ? '0%' : '100%';
        if (!isResizable)
          return (
            <span key={handleKey(handle)} className="absolute block size-0" style={{ left, top }}>
              <Grip stroke={stroke} />
            </span>
          );
        return (
          <div
            key={handleKey(handle)}
            data-resize-handle=""
            className="touch-none"
            style={{
              position: 'absolute',
              left: `calc(${left} - ${hit / 2}px)`,
              top: `calc(${top} - ${hit / 2}px)`,
              width: hit,
              height: hit,
              pointerEvents: 'auto',
              cursor: rotatedResizeCursor(handle),
            }}
            onPointerDown={(event) => onResizeStart(handle, event)}
          >
            <Grip stroke={stroke} />
          </div>
        );
      })}
    </div>
  );
}
