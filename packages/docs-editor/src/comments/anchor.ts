/**
 * What a doc comment hangs on, as stored in a thread's `anchor`: words of a tab (their first and last character ids,
 * plus any other places the same words were pasted), a table cell, or a block with no words yet (an empty paragraph).
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
  | { kind: 'block'; tab: string; block: string }
  /** Nothing readable: shown as a comment on the whole doc. */
  | { kind: 'doc'; tab: string | null };

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 64;
const isRange = (value: unknown): value is [string, string] => Array.isArray(value) && value.length === 2 && isId(value[0]) && isId(value[1]);

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
  if (isId(record.block)) return { kind: 'block', tab, block: record.block };
  return { kind: 'doc', tab };
}

export function serializeAnchor(anchor: DocAnchor): string {
  switch (anchor.kind) {
    case 'words':
      return JSON.stringify(anchor.places.length ? { tab: anchor.tab, range: anchor.range, places: anchor.places } : { tab: anchor.tab, range: anchor.range });
    case 'cell':
      return JSON.stringify({ tab: anchor.tab, cell: anchor.cell });
    case 'block':
      return JSON.stringify({ tab: anchor.tab, block: anchor.block });
    case 'doc':
      return JSON.stringify(anchor.tab ? { tab: anchor.tab } : {});
  }
}

/** The block the agent is pointed at, stored as the thread's `location`. */
export function anchorLocation(anchor: DocAnchor, block: string | null): JsonRecord {
  if (!anchor.tab) return {};
  if (anchor.kind === 'cell') return { tab: anchor.tab, block: anchor.cell };
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
