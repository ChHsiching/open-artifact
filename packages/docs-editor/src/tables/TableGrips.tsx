/**
 * The grips on the top and left edges of the table under the pointer, over the hovered cell's column and row. A press
 * selects the column or row; a click opens its menu; a drag moves it to the line nearest the pointer.
 */
import { announce } from '@open-artifact/editor-kit';
import { Tip } from '@open-artifact/editor-kit/react';
import { GripHorizontal, GripVertical } from 'lucide-react';
import { cellAround } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useEditor } from '../editor/format.ts';
import { AnchoredMenu } from './AnchoredMenu.tsx';
import { GripMenuItems } from './CellMenu.tsx';
import { cellElement, lineOffsets, nearestLine, tableElement } from './geometry.ts';
import { type CellRef, moveTo, refOf, resolveRef, selectLine, targetOf } from './table-menu.ts';
import { type MoveKind, landingIndex, moveRefusalText, planDrop } from './table-ops.ts';

/** How far the pointer goes before a press on a grip becomes a drag. */
const DRAG_SLOP = 4;
const GRIP_LONG = 24;
const GRIP_SHORT = 14;

const TIPS: Record<MoveKind, string> = {
  col: 'Click for column options · drag to move',
  row: 'Click for row options · drag to move',
};

interface Drag {
  kind: MoveKind;
  ref: CellRef;
  boundary: number;
}

type Hover = CellRef | 'keep' | null;

/** The cell under the pointer; `keep` over a grip or the table's own borders. */
function hoverAt(view: EditorView, x: number, y: number): Hover {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;
  if (element.closest('[data-table-grip]')) return 'keep';
  if (!view.dom.contains(element)) return null;
  const cell = element.closest('td, th');
  if (!cell) return element.closest('table, .tableWrapper') ? 'keep' : null;
  const hit = view.posAtCoords({ left: x, top: y });
  const $cell = hit ? cellAround(view.state.doc.resolve(hit.pos)) : null;
  const target = $cell ? targetOf(view.state, $cell.pos) : null;
  return target ? refOf(target) : null;
}

export function TableGrips(): ReactNode {
  const view = useEditor(hold => hold.view);
  const state = useEditor(hold => hold.state);
  const [hover, setHover] = useState<CellRef | null>(null);
  const [menu, setMenu] = useState<{ kind: MoveKind; ref: CellRef } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const held = useRef(false);
  held.current = menu !== null || drag !== null;

  useEffect(() => {
    const scroller = view?.dom.closest('[data-doc-scroll]');
    if (!view || !scroller) return undefined;
    let frame = 0;
    let pointer = { x: 0, y: 0 };
    const track = () => {
      frame = 0;
      if (held.current || !view.editable) return;
      const next = hoverAt(view, pointer.x, pointer.y);
      if (next !== 'keep') setHover(before => (before && next && before.bid === next.bid && before.pos === next.pos ? before : next));
    };
    const move = (event: Event) => {
      const { clientX, clientY } = event as MouseEvent;
      pointer = { x: clientX, y: clientY };
      if (!frame) frame = requestAnimationFrame(track);
    };
    const clear = () => {
      if (!held.current) setHover(null);
    };
    scroller.addEventListener('mousemove', move, { passive: true });
    scroller.addEventListener('mouseleave', clear);
    view.dom.addEventListener('keydown', clear);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('mousemove', move);
      scroller.removeEventListener('mouseleave', clear);
      view.dom.removeEventListener('keydown', clear);
    };
  }, [view]);

  useEffect(() => setHover(null), [view]);

  if (!view || !state || !view.editable) return null;
  const shown = menu?.ref ?? drag?.ref ?? hover;
  const target = shown ? resolveRef(state, shown) : null;
  const page = view.dom.closest('.doc-page');
  const cellBox = target ? cellElement(view, target.cellPos)?.getBoundingClientRect() : null;
  const tableBox = target ? tableElement(view, target)?.getBoundingClientRect() : null;
  if (!target || !page || !cellBox || !tableBox) return null;
  const pageBox = page.getBoundingClientRect();
  const ref = refOf(target);

  const colGrip = { left: cellBox.left + cellBox.width / 2 - pageBox.left, top: tableBox.top - pageBox.top };
  const rowGrip = { left: tableBox.left - pageBox.left, top: cellBox.top + cellBox.height / 2 - pageBox.top };

  const press = (event: ReactPointerEvent, kind: MoveKind) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const selected = selectLine(view.state, kind, target.cellPos);
    if (selected) view.dispatch(selected);
    view.focus();
    const start = { x: event.clientX, y: event.clientY };
    let boundary: number | null = null;
    const onMove = (move: PointerEvent) => {
      if (boundary === null && Math.hypot(move.clientX - start.x, move.clientY - start.y) < DRAG_SLOP) return;
      const now = resolveRef(view.state, ref);
      if (!now) return;
      boundary = nearestLine(lineOffsets(view, now, kind), kind === 'row' ? move.clientY : move.clientX);
      setDrag({ kind, ref, boundary });
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      document.body.style.removeProperty('cursor');
      setDrag(null);
    };
    const onUp = () => {
      stop();
      if (boundary === null) setMenu({ kind, ref });
      else drop(view, ref, kind, boundary);
    };
    const onCancel = () => stop();
    const onKey = (key: KeyboardEvent) => {
      if (key.key !== 'Escape') return;
      key.preventDefault();
      key.stopPropagation();
      stop();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    document.body.style.cursor = 'grabbing';
  };

  const grip = (kind: MoveKind, at: { left: number; top: number }) => {
    const wide = kind === 'col';
    return (
      <Tip label={TIPS[kind]} side={wide ? 'top' : 'left'} disabled={menu !== null || drag !== null}>
        <button
          type="button"
          tabIndex={-1}
          aria-label={kind === 'col' ? 'Column options' : 'Row options'}
          data-table-grip=""
          data-active={menu?.kind === kind || drag?.kind === kind ? '' : undefined}
          className="table-grip absolute z-20 flex cursor-grab items-center justify-center rounded-[5px] border border-chrome-line bg-chrome text-chrome-muted shadow-chrome hover:bg-chrome-hover hover:text-chrome-fg data-[active]:bg-chrome-accent data-[active]:text-white"
          style={{
            left: at.left - (wide ? GRIP_LONG : GRIP_SHORT) / 2,
            top: at.top - (wide ? GRIP_SHORT : GRIP_LONG) / 2,
            width: wide ? GRIP_LONG : GRIP_SHORT,
            height: wide ? GRIP_SHORT : GRIP_LONG,
          }}
          onPointerDown={event => press(event, kind)}
        >
          {wide ? <GripHorizontal className="size-3.5" strokeWidth={2} /> : <GripVertical className="size-3.5" strokeWidth={2} />}
        </button>
      </Tip>
    );
  };

  return (
    <>
      {grip('col', colGrip)}
      {grip('row', rowGrip)}
      {drag ? <DropLine view={view} drag={drag} page={pageBox} table={tableBox} /> : null}
      {menu ? (
        <AnchoredMenu
          left={menu.kind === 'col' ? colGrip.left - GRIP_LONG / 2 : rowGrip.left + GRIP_SHORT / 2}
          top={menu.kind === 'col' ? colGrip.top + GRIP_SHORT / 2 : rowGrip.top - GRIP_LONG / 2}
          side={menu.kind === 'col' ? 'bottom' : 'right'}
          open
          onClose={() => {
            setMenu(null);
            requestAnimationFrame(() => {
              if (!view.isDestroyed) view.focus();
            });
          }}
        >
          <GripMenuItems view={view} cell={menu.ref} kind={menu.kind} />
        </AnchoredMenu>
      ) : null}
    </>
  );
}

/** Drops the dragged row or column on the line `boundary`, or says why it can't go there. */
function drop(view: EditorView, ref: CellRef, kind: MoveKind, boundary: number): void {
  const target = resolveRef(view.state, ref);
  if (!target) return;
  const from = kind === 'row' ? target.row : target.col;
  if (landingIndex(from, boundary) === from) return;
  const plan = planDrop(target.table, kind, from, boundary);
  if (!plan.ok) {
    announce(moveRefusalText(plan));
    return;
  }
  moveTo(view, target, kind, boundary, announce);
}

/** The line a dragged row or column would land on. */
function DropLine({ view, drag, page, table }: { view: EditorView; drag: Drag; page: DOMRect; table: DOMRect }): ReactNode {
  const target = resolveRef(view.state, drag.ref);
  if (!target) return null;
  const from = drag.kind === 'row' ? target.row : target.col;
  if (landingIndex(from, drag.boundary) === from) return null;
  const line = lineOffsets(view, target, drag.kind)[drag.boundary];
  if (line === undefined) return null;
  const ok = planDrop(target.table, drag.kind, from, drag.boundary).ok;
  const row = drag.kind === 'row';
  return (
    <div
      aria-hidden="true"
      data-allowed={ok ? '' : undefined}
      className="table-drop-line pointer-events-none absolute z-20 rounded-full"
      style={
        row
          ? { left: table.left - page.left, top: line - page.top - 1, width: table.width, height: 2 }
          : { left: line - page.left - 1, top: table.top - page.top, width: 2, height: table.height }
      }
    />
  );
}
