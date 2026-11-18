/**
 * What the table's menus offer for a cell, worked out from the editor state: each entry's label, whether it shows,
 * why it is unavailable, and what it does. The grips, the cell button and the right-click menu draw from it.
 */
import type { Node as PMNode } from 'prosemirror-model';
import { type EditorState, Selection, type Transaction } from 'prosemirror-state';
import {
  CellSelection,
  TableMap,
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  cellAround,
  deleteColumn,
  deleteRow,
  deleteTable,
  mergeCells,
  selectedRect,
  splitCell,
} from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import {
  CELL_COLORS,
  COLUMN_WIDTHS,
  MOVE_DIRS,
  MOVE_LABELS,
  type MoveDir,
  type SortDir,
  canSort,
  columnWidth,
  hasHeaderColumn,
  headerRowCount,
  headersForInsert,
  landingIndex,
  moveDoneText,
  moveRefusalText,
  planMove,
  replaceRows,
  rowsSortedBy,
  rowsWithColumnMoved,
  rowsWithRowMoved,
  setCellsAttr,
  setColumnWidths,
  sortedBodyOrder,
  toggleHeaderColumn,
  toggleHeaderRow,
} from './table-ops.ts';

/** Names of the icons the menus draw (the view maps them to icons). */
export type TableIcon =
  | 'rowAbove'
  | 'rowBelow'
  | 'colLeft'
  | 'colRight'
  | 'move'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'width'
  | 'delete'
  | 'sortAsc'
  | 'sortDesc'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'merge'
  | 'split'
  | 'headerRow'
  | 'headerColumn';

/** Reads a message out (the page wires it to its announcer). */
export type Say = (text: string) => void;

export interface TableAction {
  key: string;
  label: string;
  icon?: TableIcon;
  danger?: boolean;
  checked?: boolean;
  /** Why it can't run now; the entry shows, disabled, with this as its tip. */
  disabledReason?: string;
  run(view: EditorView): void;
}

/** Where a menu was opened: a cell, found again by its id (or position) when an entry runs. */
export interface CellRef {
  bid: string | null;
  pos: number;
}

export interface CellTarget {
  tablePos: number;
  table: PMNode;
  cellPos: number;
  cell: PMNode;
  row: number;
  col: number;
}

export function targetOf(state: EditorState, cellPos: number): CellTarget | null {
  if (cellPos < 0 || cellPos > state.doc.content.size) return null;
  const $cell = state.doc.resolve(cellPos);
  const cell = $cell.nodeAfter;
  if (!cell || cell.type.spec.tableRole !== 'cell') return null;
  const table = $cell.node(-1);
  if (table.type.spec.tableRole !== 'table') return null;
  const tablePos = $cell.before(-1);
  const rect = TableMap.get(table).findCell(cellPos - tablePos - 1);
  return { tablePos, table, cellPos, cell, row: rect.top, col: rect.left };
}

/** The cell the selection is in (a cell selection's head cell). */
export function selectionCell(state: EditorState): CellTarget | null {
  const selection = state.selection;
  if (selection instanceof CellSelection) return targetOf(state, selection.$headCell.pos);
  const $cell = cellAround(selection.$head);
  return $cell ? targetOf(state, $cell.pos) : null;
}

export function refOf(target: CellTarget): CellRef {
  return { bid: (target.cell.attrs.bid as string | null) ?? null, pos: target.cellPos };
}

/** Finds a cell again: by its id, else at its position. */
export function resolveRef(state: EditorState, ref: CellRef): CellTarget | null {
  if (ref.bid) {
    let found: number | null = null;
    state.doc.descendants((node, pos) => {
      if (found !== null) return false;
      if (node.type.spec.tableRole === 'cell' && node.attrs.bid === ref.bid) found = pos;
      return found === null && !node.isTextblock;
    });
    if (found !== null) return targetOf(state, found);
  }
  return targetOf(state, ref.pos);
}

/** The cells an edit applies to: the selected ones, or the cursor's. */
export function selectedCells(state: EditorState, fallback?: CellTarget | null): Array<{ pos: number; node: PMNode }> {
  const selection = state.selection;
  const out: Array<{ pos: number; node: PMNode }> = [];
  if (selection instanceof CellSelection) selection.forEachCell((node, pos) => out.push({ pos, node }));
  else {
    const target = fallback ?? selectionCell(state);
    if (target) out.push({ pos: target.cellPos, node: target.cell });
  }
  return out;
}

/** Whether a cell selection holds the cell at `cellPos`. */
export const cellSelectionHas = (state: EditorState, cellPos: number): boolean => {
  const selection = state.selection;
  if (!(selection instanceof CellSelection)) return false;
  let has = false;
  selection.forEachCell((_node, pos) => {
    if (pos === cellPos) has = true;
  });
  return has;
};

/** Puts the caret in the first text position of a cell. */
export function caretIn(tr: Transaction, cellPos: number): Transaction {
  const inside = Selection.findFrom(tr.doc.resolve(cellPos + 1), 1, true);
  return inside ? tr.setSelection(inside) : tr;
}

/** Puts the caret in the cell at `row` × `col` of the table at `tablePos`. */
export function caretAt(tr: Transaction, tablePos: number, row: number, col: number): Transaction {
  const table = tr.doc.nodeAt(tablePos);
  if (!table) return tr;
  const map = TableMap.get(table);
  const r = Math.min(Math.max(row, 0), map.height - 1);
  const c = Math.min(Math.max(col, 0), map.width - 1);
  return caretIn(tr, tablePos + 1 + map.map[r * map.width + c]!);
}

/**
 * Makes the target cell the one the table commands act on: the caret goes into it, unless a cell selection already
 * holds it. Answers the state to run on.
 */
function focusTarget(view: EditorView, ref: CellRef): CellTarget | null {
  const target = resolveRef(view.state, ref);
  if (!target) return null;
  if (!cellSelectionHas(view.state, target.cellPos)) {
    const tr = caretIn(view.state.tr, target.cellPos);
    if (!tr.selection.eq(view.state.selection)) view.dispatch(tr);
  }
  return resolveRef(view.state, ref);
}

type PMCommand = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

/** Runs a table command, then lets `after` amend the same transaction. */
function runTableCommand(view: EditorView, command: PMCommand, after?: (tr: Transaction) => void): boolean {
  let done: Transaction | null = null;
  const ran = command(view.state, tr => {
    done = tr;
  });
  if (!ran || !done) return false;
  const tr = done as Transaction;
  after?.(tr);
  view.dispatch(tr.scrollIntoView());
  return true;
}

export interface SwatchModel {
  /** The colour every target cell has (undefined when they differ). */
  current: string | null | undefined;
  pick(view: EditorView, value: string | null): void;
}

export interface WidthModel {
  key: string;
  label: string;
  checked: boolean;
  run(view: EditorView): void;
}

/** Everything the cell menu offers. */
export interface CellMenuModel {
  target: CellTarget;
  insert: TableAction[];
  move: TableAction[];
  widths: WidthModel[];
  remove: TableAction[];
  sort: TableAction[];
  align: TableAction[];
  color: SwatchModel;
  structure: TableAction[];
}

export const INSERT_LABELS = {
  addRowBefore: 'Insert row above',
  addRowAfter: 'Insert row below',
  addColumnBefore: 'Insert column left',
  addColumnAfter: 'Insert column right',
} as const;

const INSERT_DONE = {
  addRowBefore: 'Row inserted above',
  addRowAfter: 'Row inserted below',
  addColumnBefore: 'Column inserted left',
  addColumnAfter: 'Column inserted right',
} as const;

type InsertKind = keyof typeof INSERT_LABELS;

const INSERT_COMMANDS: Record<InsertKind, PMCommand> = { addRowBefore, addRowAfter, addColumnBefore, addColumnAfter };

const INSERT_ICONS: Record<InsertKind, TableIcon> = { addRowBefore: 'rowAbove', addRowAfter: 'rowBelow', addColumnBefore: 'colLeft', addColumnAfter: 'colRight' };

export function insertAction(kind: InsertKind, ref: CellRef, say: Say): TableAction {
  return {
    key: kind,
    label: INSERT_LABELS[kind],
    icon: INSERT_ICONS[kind],
    run: view => {
      const target = focusTarget(view, ref);
      if (!target) return say('That cell is gone.');
      lastInsert = kind;
      const rect = selectedRect(view.state);
      const row = kind === 'addRowBefore' ? rect.top : kind === 'addRowAfter' ? rect.bottom : null;
      const col = kind === 'addColumnBefore' ? rect.left : kind === 'addColumnAfter' ? rect.right : null;
      const before = { rows: headerRowCount(target.table), column: hasHeaderColumn(target.table) };
      const done = runTableCommand(view, INSERT_COMMANDS[kind], tr => {
        if (row !== null) {
          headersForInsert(tr, target.tablePos, { kind: 'row', index: row }, before);
          caretAt(tr, target.tablePos, row, target.col);
        } else if (col !== null) {
          headersForInsert(tr, target.tablePos, { kind: 'col', index: col }, before);
          caretAt(tr, target.tablePos, target.row, col);
        }
      });
      if (done) say(INSERT_DONE[kind]);
    },
  };
}

/** Rows (or columns) the delete entries take: the selection's, or the target's one. */
function deleteCount(state: EditorState, kind: 'row' | 'col', target: CellTarget): number {
  if (!(state.selection instanceof CellSelection) || !cellSelectionHas(state, target.cellPos)) return 1;
  const rect = selectedRect(state);
  return kind === 'row' ? rect.bottom - rect.top : rect.right - rect.left;
}

export function deleteLabel(kind: 'row' | 'col', count: number): string {
  if (count <= 1) return kind === 'row' ? 'Delete row' : 'Delete column';
  return kind === 'row' ? `Delete ${count} rows` : `Delete ${count} columns`;
}

export function deleteAction(kind: 'row' | 'col', ref: CellRef, count: number, say: Say): TableAction {
  return {
    key: kind === 'row' ? 'deleteRow' : 'deleteColumn',
    label: deleteLabel(kind, count),
    icon: 'delete',
    run: view => {
      const target = focusTarget(view, ref);
      if (!target) return say('That cell is gone.');
      const rect = selectedRect(view.state);
      const every = kind === 'row' ? rect.top === 0 && rect.bottom === rect.map.height : rect.left === 0 && rect.right === rect.map.width;
      if (every) {
        say(`That would delete every ${kind === 'row' ? 'row' : 'column'}, so nothing was deleted. To delete the whole table, choose Delete table.`);
        return;
      }
      const n = kind === 'row' ? rect.bottom - rect.top : rect.right - rect.left;
      if (runTableCommand(view, kind === 'row' ? deleteRow : deleteColumn))
        say(kind === 'row' ? (n === 1 ? 'Row deleted' : 'Rows deleted') : n === 1 ? 'Column deleted' : 'Columns deleted');
    },
  };
}

export function deleteTableAction(ref: CellRef, say: Say): TableAction {
  return {
    key: 'deleteTable',
    label: 'Delete table',
    danger: true,
    run: view => {
      if (!focusTarget(view, ref)) return say('That cell is gone.');
      if (runTableCommand(view, deleteTable)) say('Table deleted');
    },
  };
}

/** Moves a row or column one step, keeping the caret in the moved cell. */
export function runMove(view: EditorView, ref: CellRef, dir: MoveDir, say: Say): void {
  const target = resolveRef(view.state, ref);
  if (!target) return say('That cell is gone.');
  const plan = planMove(target.table, target.row, target.col, dir);
  if (!plan.ok) return say(moveRefusalText(plan));
  moveTo(view, target, plan.kind, plan.boundary, say, dir);
}

/** Moves the target's row or column to the line `boundary`. */
export function moveTo(view: EditorView, target: CellTarget, kind: 'row' | 'col', boundary: number, say: Say, dir?: MoveDir): boolean {
  const from = kind === 'row' ? target.row : target.col;
  const landed = landingIndex(from, boundary);
  if (landed === from) return false;
  const rows = kind === 'row' ? rowsWithRowMoved(target.table, from, boundary) : rowsWithColumnMoved(target.table, from, boundary);
  const tr = view.state.tr;
  replaceRows(tr, target.tablePos, rows);
  caretAt(tr, target.tablePos, kind === 'row' ? landed : target.row, kind === 'row' ? target.col : landed);
  view.dispatch(tr.scrollIntoView());
  const map = TableMap.get(target.table);
  const step: MoveDir = dir ?? (kind === 'row' ? (landed < from ? 'up' : 'down') : landed < from ? 'left' : 'right');
  say(moveDoneText(step, landed + 1, kind === 'row' ? map.height : map.width));
  return true;
}

export function sortAction(ref: CellRef, dir: SortDir, say: Say): TableAction {
  return {
    key: dir === 'asc' ? 'sortAsc' : 'sortDesc',
    label: dir === 'asc' ? 'Sort column ascending' : 'Sort column descending',
    icon: dir === 'asc' ? 'sortAsc' : 'sortDesc',
    run: view => {
      const target = resolveRef(view.state, ref);
      if (!target || !canSort(target.table)) return;
      const rows = rowsSortedBy(target.table, target.col, dir);
      const done = dir === 'asc' ? 'Column sorted ascending' : 'Column sorted descending';
      if (!rows) return say(done);
      const order = sortedBodyOrder(target.table, target.col, dir);
      const tr = view.state.tr;
      replaceRows(tr, target.tablePos, rows);
      const headers = headerRowCount(target.table);
      const landed = target.row < headers ? target.row : headers + order.indexOf(target.row);
      caretAt(tr, target.tablePos, landed, target.col);
      view.dispatch(tr.scrollIntoView());
      say(done);
    },
  };
}

const ALIGNS = [
  { value: null, label: 'Align left', icon: 'alignLeft', done: 'Aligned left' },
  { value: 'center', label: 'Align center', icon: 'alignCenter', done: 'Aligned center' },
  { value: 'right', label: 'Align right', icon: 'alignRight', done: 'Aligned right' },
] as const;

/** Builds the cell menu for the cell at `cellPos` (or the selection's cell). */
export function cellMenu(state: EditorState, say: Say, cellPos?: number): CellMenuModel | null {
  const target = cellPos === undefined ? selectionCell(state) : targetOf(state, cellPos);
  if (!target) return null;
  const ref = refOf(target);
  const cells = selectedCells(state, cellSelectionHas(state, target.cellPos) ? null : target);

  const move: TableAction[] = MOVE_DIRS.map(dir => {
    const plan = planMove(target.table, target.row, target.col, dir);
    return { key: `move-${dir}`, label: MOVE_LABELS[dir], icon: dir, disabledReason: plan.ok ? undefined : moveRefusalText(plan), run: view => runMove(view, ref, dir, say) };
  });

  const rect = cellSelectionHas(state, target.cellPos) ? selectedRect(state) : null;
  const cols = rect ? Array.from({ length: rect.right - rect.left }, (_, index) => rect.left + index) : [target.col];
  const current = cols.map(col => columnWidth(target.table, col));
  const same = current.every(value => value === current[0]) ? current[0]! : undefined;
  const width = (label: string, key: string, px: number | null): WidthModel => ({
    key,
    label,
    checked: same === px,
    run: view => {
      const now = resolveRef(view.state, ref);
      if (!now) return say('That cell is gone.');
      const tr = view.state.tr;
      if (setColumnWidths(tr, now.tablePos, cols, px)) view.dispatch(tr);
      say(`Column width set to ${label}`);
    },
  });
  const widths = [...COLUMN_WIDTHS.map(preset => width(preset.label, preset.key, preset.px)), width('Auto', 'auto', null)];

  const remove = [deleteAction('row', ref, deleteCount(state, 'row', target), say), deleteAction('col', ref, deleteCount(state, 'col', target), say), deleteTableAction(ref, say)];

  const sort = canSort(target.table) ? [sortAction(ref, 'asc', say), sortAction(ref, 'desc', say)] : [];

  const aligns = new Set(cells.map(cell => (cell.node.attrs.align as string | null) ?? null));
  const align: TableAction[] = ALIGNS.map(item => ({
    key: item.icon,
    label: item.label,
    icon: item.icon,
    checked: aligns.size === 1 && aligns.has(item.value),
    run: view => {
      if (!resolveRef(view.state, ref)) return say('That cell is gone.');
      const tr = view.state.tr;
      if (setCellsAttr(tr, selectedCells(view.state, cellSelectionHas(view.state, target.cellPos) ? null : resolveRef(view.state, ref)), 'align', item.value)) view.dispatch(tr);
      say(item.done);
    },
  }));

  const colors = new Set(cells.map(cell => (cell.node.attrs.background as string | null) ?? null));
  const color: SwatchModel = {
    current: colors.size === 1 ? [...colors][0]! : undefined,
    pick: (view, value) => {
      const now = resolveRef(view.state, ref);
      if (!now) return say('That cell is gone.');
      const tr = view.state.tr;
      if (setCellsAttr(tr, selectedCells(view.state, cellSelectionHas(view.state, now.cellPos) ? null : now), 'background', value)) view.dispatch(tr);
      const name = CELL_COLORS.find(item => item.value === value)?.label;
      say(value === null ? 'Cell color removed' : `Cell color ${name ?? value}`);
    },
  };

  const structure: TableAction[] = [];
  if (state.selection instanceof CellSelection && mergeCells(state))
    structure.push({
      key: 'merge',
      label: 'Merge cells',
      icon: 'merge',
      run: view => {
        if (runTableCommand(view, mergeCells)) say('Cells merged');
      },
    });
  if ((target.cell.attrs.colspan ?? 1) > 1 || (target.cell.attrs.rowspan ?? 1) > 1)
    structure.push({
      key: 'split',
      label: 'Split cell',
      icon: 'split',
      run: view => {
        const now = resolveRef(view.state, ref);
        if (!now) return say('That cell is gone.');
        view.dispatch(caretIn(view.state.tr, now.cellPos));
        if (runTableCommand(view, splitCell)) say('Cell split');
      },
    });
  const header = (column: boolean): TableAction => ({
    key: column ? 'headerColumn' : 'headerRow',
    label: column ? 'Toggle header column' : 'Toggle header row',
    icon: column ? 'headerColumn' : 'headerRow',
    checked: column ? hasHeaderColumn(target.table) : headerRowCount(target.table) > 0,
    run: view => {
      const now = resolveRef(view.state, ref);
      if (!now) return say('That cell is gone.');
      const tr = view.state.tr;
      if (!(column ? toggleHeaderColumn(tr, now.tablePos) : toggleHeaderRow(tr, now.tablePos))) return;
      view.dispatch(tr);
      const table = view.state.doc.nodeAt(now.tablePos);
      const on = table ? (column ? hasHeaderColumn(table) : headerRowCount(table) > 0) : false;
      say(column ? (on ? 'Header column on' : 'Header column off') : on ? 'Header row on' : 'Header row off');
    },
  });
  structure.push(header(false), header(true));

  const insert = (['addRowBefore', 'addRowAfter', 'addColumnBefore', 'addColumnAfter'] as const).map(kind => insertAction(kind, ref, say));
  return { target, insert, move, widths, remove, sort, align, color, structure };
}

/** The last row or column a table menu inserted, which Mod-Y inserts again at the cursor's cell. */
let lastInsert: InsertKind | null = null;

/** Inserts again what a table menu last inserted, at the cursor's cell. */
export function repeatTableInsert(view: EditorView, say: Say): boolean {
  const target = lastInsert && view.editable ? selectionCell(view.state) : null;
  if (!lastInsert || !target) return false;
  insertAction(lastInsert, refOf(target), say).run(view);
  return true;
}

/** What a row's or column's grip menu offers. */
export function gripMenu(state: EditorState, kind: 'row' | 'col', cellPos: number, say: Say): TableAction[] {
  const target = targetOf(state, cellPos);
  if (!target) return [];
  const ref = refOf(target);
  const count = deleteCount(state, kind, target);
  return kind === 'row'
    ? [insertAction('addRowBefore', ref, say), insertAction('addRowAfter', ref, say), deleteAction('row', ref, count, say)]
    : [insertAction('addColumnBefore', ref, say), insertAction('addColumnAfter', ref, say), deleteAction('col', ref, count, say)];
}

/** Selects the whole row or column of a cell (what a grip does when pressed). */
export function selectLine(state: EditorState, kind: 'row' | 'col', cellPos: number): Transaction | null {
  const target = targetOf(state, cellPos);
  if (!target) return null;
  const map = TableMap.get(target.table);
  const start = target.tablePos + 1;
  const $first = state.doc.resolve(start + (kind === 'row' ? map.map[target.row * map.width]! : map.map[target.col]!));
  const $last = state.doc.resolve(start + (kind === 'row' ? map.map[target.row * map.width + map.width - 1]! : map.map[(map.height - 1) * map.width + target.col]!));
  const selection = kind === 'row' ? CellSelection.rowSelection($first, $last) : CellSelection.colSelection($first, $last);
  return state.tr.setSelection(selection);
}

