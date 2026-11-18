/**
 * What a comment on table cells hangs on: the cells a cell selection covers (their ids, in the table's order), the
 * table's id, and whether they make a whole row, a whole column or the whole table. And whether a text selection mixes
 * cells with text outside them, which a comment cannot hang on.
 */
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import { type CellSelection, TableMap } from 'prosemirror-tables';
import { CELLS_MAX, type CellsShape, headerWords } from '../comments/anchor.ts';

export interface CommentCells {
  /** The table's block id, when it has one. */
  table: string | null;
  /** The cells' block ids, row by row. */
  cells: string[];
  shape: CellsShape;
  /** The cells' words: a line per row, ` | ` between the cells of a row. */
  words: string;
}

const isCell = (node: PMNode): boolean => node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell';

/** One line of a cell's words. */
const cellWords = (cell: PMNode): string => cell.textBetween(0, cell.content.size, ' ', ' ').replace(/\s+/g, ' ').trim();

/**
 * The cells of a cell selection, for a comment; `null` when one of them has no block id yet (the model has not caught
 * up). A selection of more than {@link CELLS_MAX} cells keeps its first ones.
 */
export function commentCells(selection: CellSelection): CommentCells | null {
  const $anchor = selection.$anchorCell;
  const table = $anchor.node(-1);
  const start = $anchor.start(-1);
  const map = TableMap.get(table);
  const rect = map.rectBetween($anchor.pos - start, selection.$headCell.pos - start);
  const offsets = map.cellsInRect(rect);
  const cells: string[] = [];
  const rows = new Map<number, string[]>();
  for (const offset of offsets) {
    const cell = table.nodeAt(offset);
    const bid = cell?.attrs.bid as string | null | undefined;
    if (!cell || !bid) return null;
    if (cells.length < CELLS_MAX && !cells.includes(bid)) cells.push(bid);
    const row = map.findCell(offset).top;
    rows.set(row, [...(rows.get(row) ?? []), cellWords(cell)]);
  }
  if (!cells.length) return null;
  const words = [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, line]) => line.join(' | '))
    .join('\n');
  const headerAt = (offset: number | undefined) => {
    const cell = offset === undefined ? null : table.nodeAt(offset);
    return cell ? headerWords(cellWords(cell)) : '';
  };
  const wholeRows = rect.left === 0 && rect.right === map.width;
  const wholeColumns = rect.top === 0 && rect.bottom === map.height;
  let shape: CellsShape;
  if (wholeRows && wholeColumns) shape = { kind: 'table' };
  else if (wholeColumns && rect.right - rect.left === 1) shape = { kind: 'column', header: headerAt(map.map[rect.left]) };
  else if (wholeRows && rect.bottom - rect.top === 1) shape = { kind: 'row', header: headerAt(map.map[rect.top * map.width]) };
  else shape = { kind: 'cells', n: cells.length };
  return { table: (table.attrs.bid as string | null | undefined) ?? null, cells, shape, words };
}

/** The cell a position is in, if any. */
function cellOf($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth--) if (isCell($pos.node(depth))) return $pos.before(depth);
  return null;
}

/**
 * Whether the words between two positions take in table cells along with something outside them (text around a
 * table, or two tables): a comment hangs on words, or on cells inside one table, not on both.
 */
export function mixesCellsAndText(doc: PMNode, from: number, to: number): boolean {
  const inFrom = cellOf(doc.resolve(from));
  const inTo = cellOf(doc.resolve(to));
  if (inFrom !== null && inFrom === inTo) return false;
  if (inFrom !== null || inTo !== null) return true;
  let found = false;
  doc.nodesBetween(from, to, node => {
    if (found) return false;
    if (node.type.spec.tableRole === 'table') found = true;
    return !found && !node.isTextblock;
  });
  return found;
}
