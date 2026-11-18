/**
 * What a doc comment hangs on, as stored in a thread's `anchor`: words of a tab (their first and last character ids,
 * plus any other places the same words were pasted), a table cell, several cells of one table (a range, a row, a
 * column or the whole table: `{tab, table, cells: [ids]}`), or a block with no words yet (an empty paragraph).
 */
import type { JsonRecord } from '@open-artifact/runtime';

/** Another place of a thread's words: a copy pasted elsewhere in the same tab. */
export interface AnchorPlace {
  id: string;
  range: [string, string];
}

export type DocAnchor =
  | { kind: 'words'; tab: string; range: [string, string]; places: AnchorPlace[] }
  | { kind: 'cell'; tab: string; cell: string }
  /** Several cells of one table (`table`: its block id, when known), in the table's order. */
  | { kind: 'cells'; tab: string; cells: string[]; table?: string }
  | { kind: 'block'; tab: string; block: string }
  /** Nothing readable: shown as a comment on the whole doc. */
  | { kind: 'doc'; tab: string | null };

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 64;
const isRange = (value: unknown): value is [string, string] => Array.isArray(value) && value.length === 2 && isId(value[0]) && isId(value[1]);

/** The most cells one thread hangs on; a bigger selection keeps its first ones. */
export const CELLS_MAX = 1000;

export function parseAnchor(text: string): DocAnchor {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'doc', tab: null };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'doc', tab: null };
  const record = raw as Record<string, unknown>;
  const tab = isId(record.tab) ? record.tab : null;
  if (!tab) return { kind: 'doc', tab: null };
  if (isRange(record.range)) {
    const places = Array.isArray(record.places)
      ? record.places.flatMap(place => {
          const item = place as Record<string, unknown> | null;
          return item && isId(item.id) && isRange(item.range) ? [{ id: item.id, range: [item.range[0], item.range[1]] as [string, string] }] : [];
        })
      : [];
    return { kind: 'words', tab, range: [record.range[0], record.range[1]], places };
  }
  if (isId(record.cell)) return { kind: 'cell', tab, cell: record.cell };
  if (Array.isArray(record.cells)) {
    const cells = [...new Set(record.cells.filter(isId))].slice(0, CELLS_MAX);
    if (cells.length) return { kind: 'cells', tab, cells, ...(isId(record.table) ? { table: record.table } : {}) };
  }
  if (isId(record.block)) return { kind: 'block', tab, block: record.block };
  return { kind: 'doc', tab };
}

export function serializeAnchor(anchor: DocAnchor): string {
  switch (anchor.kind) {
    case 'words':
      return JSON.stringify(anchor.places.length ? { tab: anchor.tab, range: anchor.range, places: anchor.places } : { tab: anchor.tab, range: anchor.range });
    case 'cell':
      return JSON.stringify({ tab: anchor.tab, cell: anchor.cell });
    case 'cells':
      return JSON.stringify(anchor.table ? { tab: anchor.tab, table: anchor.table, cells: anchor.cells } : { tab: anchor.tab, cells: anchor.cells });
    case 'block':
      return JSON.stringify({ tab: anchor.tab, block: anchor.block });
    case 'doc':
      return JSON.stringify(anchor.tab ? { tab: anchor.tab } : {});
  }
}

/**
 * The block the agent is pointed at, stored as the thread's `location`; on several cells, the table (or the first
 * cell, when the table's id is not known) and the cells.
 */
export function anchorLocation(anchor: DocAnchor, block: string | null): JsonRecord {
  if (!anchor.tab) return {};
  if (anchor.kind === 'cell') return { tab: anchor.tab, block: anchor.cell };
  if (anchor.kind === 'cells') return { tab: anchor.tab, block: anchor.table ?? anchor.cells[0]!, cells: [...anchor.cells] };
  if (anchor.kind === 'block') return { tab: anchor.tab, block: anchor.block };
  return block ? { tab: anchor.tab, block } : { tab: anchor.tab };
}

/** A place id that no other place of the thread has. */
export function newPlaceId(taken: readonly AnchorPlace[]): string {
  for (;;) {
    const id = `p${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.some(place => place.id === id)) return id;
  }
}

/** The anchor with one more place for its words. */
export function withPlace(anchor: DocAnchor, range: [string, string]): DocAnchor {
  if (anchor.kind !== 'words') return anchor;
  if (sameRange(anchor.range, range) || anchor.places.some(place => sameRange(place.range, range))) return anchor;
  return { ...anchor, places: [...anchor.places, { id: newPlaceId(anchor.places), range }] };
}

/**
 * The anchor without one of its places (`null`: its first range). Removing the first range moves the next place up;
 * an anchor with a single range keeps it.
 */
export function withoutPlace(anchor: DocAnchor, placeId: string | null): DocAnchor {
  if (anchor.kind !== 'words' || anchor.places.length === 0) return anchor;
  if (placeId === null) {
    const [next, ...rest] = anchor.places;
    return { ...anchor, range: next!.range, places: rest };
  }
  return { ...anchor, places: anchor.places.filter(place => place.id !== placeId) };
}

export const sameRange = (a: readonly [string, string], b: readonly [string, string]) => a[0] === b[0] && a[1] === b[1];

/** Every range of a words anchor: its first (`place: null`), then its places. */
export function anchorRanges(anchor: DocAnchor): Array<{ place: string | null; range: [string, string] }> {
  if (anchor.kind !== 'words') return [];
  return [{ place: null, range: anchor.range }, ...anchor.places.map(place => ({ place: place.id, range: place.range }))];
}

/** Longest quote a thread's label keeps. */
export const LABEL_MAX = 80;
/** Longest context the agent reads with a thread. */
export const DETAIL_MAX = 1200;

/** The quoted words as a thread's label: one line, cut with an ellipsis. */
export function quoteLabel(words: string): string {
  const line = words.replace(/\s+/g, ' ').trim();
  return line.length > LABEL_MAX ? `${line.slice(0, LABEL_MAX - 1).trimEnd()}…` : line;
}

/** What the agent reads about the anchored words: the words, and the paragraph around them when that says more. */
export function quoteDetail(words: string, around: string): string {
  const quote = words.trim().slice(0, DETAIL_MAX);
  const context = around.trim();
  if (!context || context === quote) return `On “${quote}”`;
  return `On “${quote}” in: ${context.slice(0, DETAIL_MAX)}`;
}

/** What a selection of several cells of one table is, for its thread's label. */
export type CellsShape =
  | { kind: 'table' }
  /** One whole column (`header`: the words of its first cell, `''` when it has none). */
  | { kind: 'column'; header: string }
  /** One whole row (`header`: the words of its first cell). */
  | { kind: 'row'; header: string }
  | { kind: 'cells'; n: number };

/** Longest header a label keeps. */
const HEADER_MAX = 40;

/** A row's or column's header as a label shows it: one line, cut with an ellipsis. */
export function headerWords(words: string): string {
  const line = words.replace(/\s+/g, ' ').trim();
  return line.length > HEADER_MAX ? `${line.slice(0, HEADER_MAX - 1).trimEnd()}…` : line;
}

/** The label of a thread on several cells: “Table · Region column”, “Table · row”, “Table · 4 cells”, “Table”. */
export function cellsLabel(shape: CellsShape): string {
  switch (shape.kind) {
    case 'table':
      return 'Table';
    case 'column':
      return shape.header ? `Table · ${shape.header} column` : 'Table · column';
    case 'row':
      return shape.header ? `Table · ${shape.header} row` : 'Table · row';
    case 'cells':
      return `Table · ${shape.n} ${shape.n === 1 ? 'cell' : 'cells'}`;
  }
}

/** Where a thread on several cells is, in a sentence: “On the table’s “Region” column”, “On 4 table cells”. */
export function cellsPlace(shape: CellsShape): string {
  switch (shape.kind) {
    case 'table':
      return 'On a table';
    case 'column':
      return shape.header ? `On the table’s “${shape.header}” column` : 'On a table column';
    case 'row':
      return shape.header ? `On the table’s “${shape.header}” row` : 'On a table row';
    case 'cells':
      return shape.n === 1 ? 'On a table cell' : `On ${shape.n} table cells`;
  }
}

/** What the agent reads about the anchored cells: where they are, then their words (a line per row). */
export function cellsDetail(shape: CellsShape, words: string): string {
  const text = words.trim();
  const place = cellsPlace(shape);
  return text ? `${place}:\n${text.slice(0, DETAIL_MAX)}` : place;
}
