/**
 * Table edits that work on the table node itself: header rows and columns, moving a row or column, sorting by a
 * column, column widths and cell colours. Rows and cells are moved as the nodes they are, so their ids go with them.
 */
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { TableMap } from 'prosemirror-tables';

export type MoveDir = 'up' | 'down' | 'left' | 'right';
export type MoveKind = 'row' | 'col';
export type MoveRefusal = 'edge' | 'header' | 'spans';

export type MovePlan =
  | { dir: MoveDir; kind: MoveKind; from: number; ok: true; boundary: number }
  | { dir: MoveDir; kind: MoveKind; from: number; ok: false; reason: MoveRefusal };

export type SortDir = 'asc' | 'desc';

export const MOVE_DIRS: readonly MoveDir[] = ['up', 'down', 'left', 'right'];

export const MOVE_LABELS: Record<MoveDir, string> = {
  up: 'Move row up',
  down: 'Move row down',
  left: 'Move column left',
  right: 'Move column right',
};

export function moveRefusalText(plan: Extract<MovePlan, { ok: false }>): string {
  switch (plan.reason) {
    case 'edge':
      if (plan.dir === 'up') return 'This row is already at the top.';
      if (plan.dir === 'down') return 'This row is already at the bottom.';
      return plan.dir === 'left' ? 'This column is already at the far left.' : 'This column is already at the far right.';
    case 'header':
      return 'Header rows stay at the top.';
    case 'spans':
      return plan.kind === 'row' ? 'Rows with cells merged across rows can’t move.' : 'Columns with merged cells can’t move.';
  }
}

export function moveDoneText(dir: MoveDir, place: number, count: number): string {
  const what = dir === 'up' || dir === 'down' ? 'Row' : 'Column';
  return `${what} moved ${dir}, ${place} of ${count}`;
}

/** A column width the menu offers, in pixels. */
export interface ColumnWidthPreset {
  key: 'narrow' | 'medium' | 'wide' | 'extraWide';
  label: string;
  px: number;
}

const FULL_WIDTH = 672;

export const COLUMN_WIDTHS: readonly ColumnWidthPreset[] = [
  { key: 'narrow', label: 'Narrow', px: Math.floor(FULL_WIDTH / 6) },
  { key: 'medium', label: 'Medium', px: Math.floor(FULL_WIDTH / 3) },
  { key: 'wide', label: 'Wide', px: Math.floor(FULL_WIDTH / 2) },
  { key: 'extraWide', label: 'Extra wide', px: FULL_WIDTH },
];

const MIN_WIDTH = 48;
const MAX_WIDTH = 4000;

/** A cell colour: what the cell stores (`#rrggbb`, or null for none) and its name. */
export interface CellColor {
  label: string;
  value: string | null;
}

export const CELL_COLORS: readonly CellColor[] = [
  { label: 'None', value: null },
  { label: 'Gray', value: '#f0efec' },
  { label: 'Red', value: '#fbebeb' },
  { label: 'Orange', value: '#f9ece7' },
  { label: 'Yellow', value: '#f9eeda' },
  { label: 'Green', value: '#e5f4e4' },
  { label: 'Blue', value: '#e7f1fb' },
  { label: 'Purple', value: '#efedff' },
];

export const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

const isHeaderRow = (row: PMNode) => {
  if (!row.childCount) return false;
  let all = true;
  row.forEach(cell => {
    if (cell.attrs.header !== true) all = false;
  });
  return all;
};

/** How many rows at the top are header rows. */
export function headerRowCount(table: PMNode): number {
  let count = 0;
  while (count < table.childCount && isHeaderRow(table.child(count))) count++;
  return count;
}

/** Whether every row's first cell is a header cell. */
export function hasHeaderColumn(table: PMNode): boolean {
  const map = TableMap.get(table);
  if (!map.height) return false;
  for (let row = 0; row < map.height; row++) if (table.nodeAt(map.map[row * map.width]!)?.attrs.header !== true) return false;
  return true;
}

/** Each cell of the table, where it starts (inside the table) and the rectangle it covers. */
export function tableCells(table: PMNode): Array<{ node: PMNode; pos: number; row: number; left: number; right: number; top: number; bottom: number }> {
  const map = TableMap.get(table);
  const out: Array<{ node: PMNode; pos: number; row: number; left: number; right: number; top: number; bottom: number }> = [];
  let rowPos = 0;
  table.forEach((row, _offset, rowIndex) => {
    row.forEach((cell, cellOffset) => {
      const pos = rowPos + 1 + cellOffset;
      const rect = map.findCell(pos);
      out.push({ node: cell, pos, row: rowIndex, ...rect });
    });
    rowPos += row.nodeSize;
  });
  return out;
}

/** Turns the header row on (every cell of the first row) or off. */
export function toggleHeaderRow(tr: Transaction, tablePos: number): boolean {
  const table = tr.doc.nodeAt(tablePos);
  if (!table || table.type.spec.tableRole !== 'table' || !table.childCount) return false;
  const first = table.child(0);
  const on = !isHeaderRow(first);
  const rowStart = tablePos + 2;
  first.forEach((cell, offset) => {
    if (cell.attrs.header !== on) tr.setNodeMarkup(rowStart + offset, undefined, { ...cell.attrs, header: on });
  });
  return true;
}

/** Turns the header column on (the first cell of every row) or off. */
export function toggleHeaderColumn(tr: Transaction, tablePos: number): boolean {
  const table = tr.doc.nodeAt(tablePos);
  if (!table || table.type.spec.tableRole !== 'table' || !table.childCount) return false;
  const on = !hasHeaderColumn(table);
  for (const cell of tableCells(table)) {
    if (cell.left !== 0 || cell.node.attrs.header === on) continue;
    tr.setNodeMarkup(tablePos + 1 + cell.pos, undefined, { ...cell.node.attrs, header: on });
  }
  return true;
}

/** After a row or column is put in, makes the new cells header cells where the rows or column around them are. */
export function headersForInsert(tr: Transaction, tablePos: number, inserted: { kind: MoveKind; index: number }, before: { rows: number; column: boolean }): void {
  const table = tr.doc.nodeAt(tablePos);
  if (!table) return;
  for (const cell of tableCells(table)) {
    const fresh = inserted.kind === 'row' ? cell.top === inserted.index : cell.left === inserted.index;
    if (!fresh) continue;
    const header = inserted.kind === 'row' ? inserted.index < before.rows || (before.column && cell.left === 0) : cell.top < before.rows || (before.column && inserted.index === 0);
    if (cell.node.attrs.header !== header) tr.setNodeMarkup(tablePos + 1 + cell.pos, undefined, { ...cell.node.attrs, header });
  }
}

/** No cell crosses the line above row `index` (0 and the height always clear). */
export function rowBoundaryClear(table: PMNode, index: number): boolean {
  const map = TableMap.get(table);
  if (index <= 0 || index >= map.height) return index === 0 || index === map.height;
  for (let col = 0; col < map.width; col++) if (map.map[(index - 1) * map.width + col] === map.map[index * map.width + col]) return false;
  return true;
}

/** No cell crosses the line left of column `index`. */
export function colBoundaryClear(table: PMNode, index: number): boolean {
  const map = TableMap.get(table);
  if (index <= 0 || index >= map.width) return index === 0 || index === map.width;
  for (let row = 0; row < map.height; row++) if (map.map[row * map.width + index - 1] === map.map[row * map.width + index]) return false;
  return true;
}

/**
 * Whether a row or column can move one step in `dir`, and the line it lands on: header rows stay on top, a row or
 * column with merged cells stays, and one at the edge goes no further.
 */
export function planMove(table: PMNode, row: number, col: number, dir: MoveDir): MovePlan {
  const map = TableMap.get(table);
  const kind: MoveKind = dir === 'up' || dir === 'down' ? 'row' : 'col';
  const from = kind === 'row' ? row : col;
  const size = kind === 'row' ? map.height : map.width;
  const back = dir === 'up' || dir === 'left';
  const headers = kind === 'row' ? headerRowCount(table) : 0;
  const refuse = (reason: MoveRefusal): MovePlan => ({ dir, kind, from, ok: false, reason });
  if (from < 0 || from >= size) return refuse('edge');
  if (from < headers || (back && headers > 0 && from === headers)) return refuse('header');
  if (back ? from === 0 : from === size - 1) return refuse('edge');
  const clear = (index: number) => (kind === 'row' ? rowBoundaryClear(table, index) : colBoundaryClear(table, index));
  if (!clear(from) || !clear(from + 1)) return refuse('spans');
  if (back) {
    for (let index = from - 1; index >= headers; index--) if (clear(index)) return { dir, kind, from, ok: true, boundary: index };
  } else {
    for (let index = from + 2; index <= size; index++) if (clear(index)) return { dir, kind, from, ok: true, boundary: index };
  }
  return refuse(headers > 0 ? 'header' : 'edge');
}

/** Whether a drag can drop row or column `from` on the line `boundary`, by the same rules as a one-step move. */
export function planDrop(table: PMNode, kind: MoveKind, from: number, boundary: number): MovePlan {
  const map = TableMap.get(table);
  const size = kind === 'row' ? map.height : map.width;
  const back = boundary <= from;
  const dir: MoveDir = kind === 'row' ? (back ? 'up' : 'down') : back ? 'left' : 'right';
  const refuse = (reason: MoveRefusal): MovePlan => ({ dir, kind, from, ok: false, reason });
  if (from < 0 || from >= size || boundary < 0 || boundary > size) return refuse('edge');
  const headers = kind === 'row' ? headerRowCount(table) : 0;
  if (from < headers || boundary < headers) return refuse('header');
  const clear = (index: number) => (kind === 'row' ? rowBoundaryClear(table, index) : colBoundaryClear(table, index));
  if (!clear(from) || !clear(from + 1) || !clear(boundary)) return refuse('spans');
  return { dir, kind, from, ok: true, boundary };
}

/** Where row or column `from` sits once moved to the line `boundary`. */
export const landingIndex = (from: number, boundary: number) => (boundary > from ? boundary - 1 : boundary);

/** The table's rows with row `from` moved to the line `boundary`. */
export function rowsWithRowMoved(table: PMNode, from: number, boundary: number): PMNode[] {
  const rows: PMNode[] = [];
  table.forEach(row => rows.push(row));
  const [moved] = rows.splice(from, 1);
  rows.splice(landingIndex(from, boundary), 0, moved!);
  return rows;
}

/** The table's rows with column `from` moved to the line `boundary` (the column's cells span one column only). */
export function rowsWithColumnMoved(table: PMNode, from: number, boundary: number): PMNode[] {
  const cells = tableCells(table);
  const rows: PMNode[] = [];
  table.forEach((row, _offset, rowIndex) => {
    const inRow = cells.filter(cell => cell.row === rowIndex);
    const moving = inRow.find(cell => cell.left === from);
    if (!moving) {
      rows.push(row);
      return;
    }
    const rest = inRow.filter(cell => cell !== moving);
    const at = rest.findIndex(cell => cell.left >= boundary);
    rest.splice(at < 0 ? rest.length : at, 0, moving);
    rows.push(row.copy(Fragment.from(rest.map(cell => cell.node))));
  });
  return rows;
}

/** Puts `rows` in place of the table's rows. */
export function replaceRows(tr: Transaction, tablePos: number, rows: readonly PMNode[]): void {
  const table = tr.doc.nodeAt(tablePos);
  if (!table) return;
  tr.replaceWith(tablePos + 1, tablePos + table.nodeSize - 1, Fragment.from(rows));
}

/** A cell's text as sorting reads it: its words, a date as its day. */
export function cellText(cell: PMNode | null | undefined): string {
  if (!cell) return '';
  return cell
    .textBetween(0, cell.content.size, ' ', leaf => (leaf.type.name === 'date' && typeof leaf.attrs.ts === 'string' ? leaf.attrs.ts : ''))
    .trim();
}

/** A cell's number, when its text is one (currency and percent signs and thousands commas allowed). */
export function numericValue(text: string): number | null {
  let value = text.replace(/[$€£%]/g, '').trim();
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(value)) value = value.replaceAll(',', '');
  if (!value || /[,\s]/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** A table sorts when it has two body rows or more and no merged cell reaches into the body across rows. */
export function canSort(table: PMNode): boolean {
  const map = TableMap.get(table);
  const headers = headerRowCount(table);
  if (map.height - headers < 2) return false;
  if (map.problems?.some(problem => problem.type !== 'colwidth mismatch')) return false;
  for (let index = 0; index < table.childCount; index++) {
    let spans = false;
    table.child(index).forEach(cell => {
      if ((cell.attrs.rowspan ?? 1) > 1 && index + (cell.attrs.rowspan as number) > headers) spans = true;
    });
    if (spans) return false;
  }
  return true;
}

/**
 * The body rows' order once sorted by column `col`: numbers by value when every filled cell is one, text otherwise
 * (natural order, case and accents aside); empty cells last, ties in their old order.
 */
export function sortedBodyOrder(table: PMNode, col: number, dir: SortDir): number[] {
  const map = TableMap.get(table);
  const headers = headerRowCount(table);
  const keys: string[] = [];
  for (let row = headers; row < map.height; row++) keys.push(cellText(table.nodeAt(map.map[row * map.width + col]!)));
  const numbers = keys.map(numericValue);
  const numeric = keys.some(Boolean) && keys.every((key, index) => !key || numbers[index] !== null);
  const sign = dir === 'asc' ? 1 : -1;
  return keys
    .map((key, index) => ({ key, index }))
    .sort((a, b) => {
      if (!a.key || !b.key) return a.key ? -1 : b.key ? 1 : a.index - b.index;
      const order = numeric ? numbers[a.index]! - numbers[b.index]! : a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: 'base' });
      return sign * order || a.index - b.index;
    })
    .map(item => headers + item.index);
}

/** The table's rows sorted by column `col`, or null when the order would not change. */
export function rowsSortedBy(table: PMNode, col: number, dir: SortDir): PMNode[] | null {
  const order = sortedBodyOrder(table, col, dir);
  const headers = headerRowCount(table);
  if (order.every((row, index) => row === headers + index)) return null;
  const rows: PMNode[] = [];
  for (let row = 0; row < headers; row++) rows.push(table.child(row));
  for (const row of order) rows.push(table.child(row));
  return rows;
}

/** The width every cell of column `col` has, or null when it is automatic or mixed. */
export function columnWidth(table: PMNode, col: number): number | null {
  let width: number | null | undefined;
  for (const cell of tableCells(table)) {
    if (col < cell.left || col >= cell.right) continue;
    const widths = cell.node.attrs.colwidth as number[] | null;
    const value = Array.isArray(widths) && widths[col - cell.left] ? widths[col - cell.left]! : null;
    if (width === undefined) width = value;
    else if (width !== value) return null;
  }
  return width ?? null;
}

/** Sets the width of columns `cols` (null: automatic) on every cell that covers them. */
export function setColumnWidths(tr: Transaction, tablePos: number, cols: readonly number[], px: number | null): boolean {
  if (px !== null && !Number.isFinite(px)) return false;
  const table = tr.doc.nodeAt(tablePos);
  if (!table) return false;
  const width = px === null ? 0 : Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.trunc(px)));
  let changed = false;
  for (const cell of tableCells(table)) {
    const covered = cols.filter(col => col >= cell.left && col < cell.right);
    if (!covered.length) continue;
    const span = cell.right - cell.left;
    const before = cell.node.attrs.colwidth as number[] | null;
    const next = Array.from({ length: span }, (_, index) => (Array.isArray(before) ? Number(before[index]) || 0 : 0));
    for (const col of covered) next[col - cell.left] = width;
    const value = next.some(Boolean) ? next : null;
    if (JSON.stringify(value) === JSON.stringify(before ?? null)) continue;
    tr.setNodeMarkup(tablePos + 1 + cell.pos, undefined, { ...cell.node.attrs, colwidth: value });
    changed = true;
  }
  return changed;
}

/** Sets one attr on cells (positions in the doc). */
export function setCellsAttr(tr: Transaction, cells: ReadonlyArray<{ pos: number; node: PMNode }>, name: string, value: unknown): boolean {
  let changed = false;
  for (const { pos, node } of cells) {
    if ((node.attrs[name] ?? null) === value) continue;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, [name]: value });
    changed = true;
  }
  return changed;
}
