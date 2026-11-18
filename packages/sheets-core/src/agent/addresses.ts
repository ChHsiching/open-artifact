/** A1 addresses: cells, ranges, rows and columns as the agent writes them, and places from 0 as the code counts them. */

import { AgentError } from './errors.ts';

/** 0 → A, 25 → Z, 26 → AA. */
export function columnLetters(index: number): string {
  let letters = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

/** A → 0, Z → 25, AA → 26. */
export function columnIndexOf(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** The address of a cell by its row and column, from 0: (0, 0) → A1. */
export const a1 = (row: number, column: number): string => `${columnLetters(column)}${row + 1}`;

/** A rectangle of cells, its edges included, from 0. */
export interface Block {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export const blockA1 = (b: Block): string => (b.top === b.bottom && b.left === b.right ? a1(b.top, b.left) : `${a1(b.top, b.left)}:${a1(b.bottom, b.right)}`);

export const CELL_ADDRESS = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/;
const COLUMN = /^[A-Z]{1,3}$/;
const ROW = /^[1-9][0-9]{0,6}$/;

const RANGE_HELP = 'is a range such as "A1:C4", or one cell such as "B2": both corners, with no $ and no sheet name';

/** `A1:C4` or `B2`, the corners in either order. */
export function parseRange(text: unknown, key = 'range'): Block {
  if (typeof text !== 'string') throw new AgentError('rangeNotReadable', `${key} ${RANGE_HELP}.`);
  const [one, other = one, more] = text.split(':');
  const p = CELL_ADDRESS.exec(one ?? '');
  const q = CELL_ADDRESS.exec(other ?? '');
  if (more !== undefined || !p || !q) throw new AgentError('rangeNotReadable', `"${text}" is not read as a range: ${key} ${RANGE_HELP}.`);
  const [r1, c1, r2, c2] = [Number(p[2]) - 1, columnIndexOf(p[1]!), Number(q[2]) - 1, columnIndexOf(q[1]!)];
  return { top: Math.min(r1, r2), bottom: Math.max(r1, r2), left: Math.min(c1, c2), right: Math.max(c1, c2) };
}

/** `3:4` or `3` → the first and last row, from 0. */
export function parseRows(text: unknown, key = 'rows'): [number, number] {
  const parts = typeof text === 'string' ? text.split(':') : [];
  if (parts.length < 1 || parts.length > 2 || !parts.every((p) => ROW.test(p))) throw new AgentError('rowsNotReadable', `${key} is rows such as "3:4" or "3", with no $ and no sheet name.`);
  const [a, b] = [Number(parts[0]) - 1, Number(parts.at(-1)) - 1];
  return [Math.min(a, b), Math.max(a, b)];
}

/** `B:C` or `B` → the first and last column, from 0. */
export function parseColumns(text: unknown, key = 'columns'): [number, number] {
  const parts = typeof text === 'string' ? text.split(':') : [];
  if (parts.length < 1 || parts.length > 2 || !parts.every((p) => COLUMN.test(p))) throw new AgentError('columnsNotReadable', `${key} is columns such as "B:C" or "B", in capitals, with no $ and no sheet name.`);
  const [a, b] = [columnIndexOf(parts[0]!), columnIndexOf(parts.at(-1)!)];
  return [Math.min(a, b), Math.max(a, b)];
}

const linesText = (first: number, last: number, of: (i: number) => string): string => (first === last ? of(first) : `${of(first)}:${of(last)}`);
/** Rows from 0 as the agent writes them: (2, 3) → "3:4". */
export const rowsText = (first: number, last: number): string => linesText(first, last, (i) => String(i + 1));
/** Columns from 0 as the agent writes them: (1, 2) → "B:C". */
export const columnsText = (first: number, last: number): string => linesText(first, last, columnLetters);

/** Where two blocks overlap, or null. */
export function overlap(a: Block, b: Block): Block | null {
  const o = { top: Math.max(a.top, b.top), bottom: Math.min(a.bottom, b.bottom), left: Math.max(a.left, b.left), right: Math.min(a.right, b.right) };
  return o.top <= o.bottom && o.left <= o.right ? o : null;
}
