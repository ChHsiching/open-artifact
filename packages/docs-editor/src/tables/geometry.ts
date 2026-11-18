/** Where a table's cells, rows and column lines are on screen. */
import { TableMap } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import type { CellTarget } from './table-menu.ts';

export const cellElement = (view: EditorView, cellPos: number): HTMLElement | null => {
  const dom = view.nodeDOM(cellPos);
  return dom instanceof HTMLElement ? dom : null;
};

export const tableElement = (view: EditorView, target: CellTarget): HTMLTableElement | null =>
  cellElement(view, target.cellPos)?.closest('table') ?? null;

/** The client x (columns) or y (rows) of each line between rows or columns, from the first edge to the last. */
export function lineOffsets(view: EditorView, target: CellTarget, kind: 'row' | 'col'): number[] {
  const table = tableElement(view, target);
  if (!table) return [];
  const box = table.getBoundingClientRect();
  const map = TableMap.get(target.table);
  const start = target.tablePos + 1;
  const lines: number[] = [];
  if (kind === 'row') {
    for (let row = 0; row < map.height; row++) {
      const element = cellElement(view, start + map.map[row * map.width]!)?.closest('tr');
      lines.push(element ? element.getBoundingClientRect().top : (lines.at(-1) ?? box.top));
    }
    lines.push(box.bottom);
  } else {
    for (let col = 0; col < map.width; col++) {
      let left: number | null = null;
      for (let row = 0; row < map.height && left === null; row++) {
        const offset = map.map[row * map.width + col]!;
        if (map.findCell(offset).left !== col) continue;
        const element = cellElement(view, start + offset);
        if (element) left = element.getBoundingClientRect().left;
      }
      lines.push(left ?? lines.at(-1) ?? box.left);
    }
    lines.push(box.right);
  }
  return lines;
}

/** The line nearest to `at`. */
export function nearestLine(lines: readonly number[], at: number): number {
  let best = 0;
  lines.forEach((line, index) => {
    if (Math.abs(line - at) < Math.abs(lines[best]! - at)) best = index;
  });
  return best;
}
