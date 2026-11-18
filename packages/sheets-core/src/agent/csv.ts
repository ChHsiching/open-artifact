/**
 * One sheet as CSV text: what each cell shows, its formulas worked out, in RFC 4180 quoting (a field with a comma, a
 * quote or a line break goes in quotes, a quote doubled). A merged range's text is in its top-left cell only. The rows
 * and columns go as far as the last cell that holds something; lines end in CRLF.
 */

import { shownText } from './cells.ts';
import { type EngineMessage, isObject } from './engine.ts';
import type { SheetView } from './workbook.ts';

const field = (text: string): string => (/[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text);

/** The text a cell shows in a CSV file: its shown text, else its value as written. */
function textOf(cell: EngineMessage): string {
  const shown = shownText(cell);
  if (shown !== undefined) return shown;
  const value = isObject(cell.value) ? cell.value : isObject(cell.input) ? cell.input : null;
  if (!value) return '';
  if (value.kind === 'boolean') return value.value === true ? 'TRUE' : 'FALSE';
  return typeof value.value === 'string' || typeof value.value === 'number' ? String(value.value) : '';
}

export function csvOf(view: SheetView): string {
  const block = view.filledBlock();
  if (!block) return '';
  const rows = block.bottom + 1;
  const columns = block.right + 1;
  const grid: string[][] = Array.from({ length: rows }, () => Array<string>(columns).fill(''));
  for (const { row, column, cell } of view.filled()) grid[row]![column] = textOf(cell);
  // A merged range shows its top-left cell's text over the whole range: the others are blank.
  for (const { range } of view.contents.mergedRanges ?? []) {
    const span = view.lineSpan({ first: range.topLeft.r, last: range.bottomRight.r }, 'rows');
    const width = view.lineSpan({ first: range.topLeft.c, last: range.bottomRight.c }, 'columns');
    if (!span || !width) continue;
    for (let r = span[0]; r <= span[1] && r < rows; r++) for (let c = width[0]; c <= width[1] && c < columns; c++) if (r !== span[0] || c !== width[0]) grid[r]![c] = '';
  }
  return `${grid.map((line) => line.map(field).join(',')).join('\r\n')}\r\n`;
}
