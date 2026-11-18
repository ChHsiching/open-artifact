/** A query's saved versions (this viewer's own `history-<id>` document) and how each differs from the query now. */

import type { QuerySource } from '@open-artifact/data-core';
import { argumentViewsEqual, hasRestorableArguments, jsonArgumentsEqual, type QueryArgumentView } from './args.ts';
import {
  EDITED_QUERY_TITLE,
  NOT_IN_QUERY_NOW_NOTE,
  NOW_TYPED_NOTE,
  ORIGINAL_QUERY_TITLE,
  historyDifferenceLabel,
  nowSetByPageNote,
  nowValueNote,
} from './words.ts';

export interface QueryHistoryRecord {
  at: number;
  /** The arguments as stored (JSON text). */
  args: string;
  /** The query was written as `kind: "call"` when this version was saved. */
  call?: true;
}

export interface QueryHistoryItem {
  id: string;
  at: number;
  entry: QueryHistoryRecord;
}

export interface TextDiffLine {
  mark: '' | '−' | '+';
  text: string;
}

/** Versions older than this are dropped (90 days). */
export const QUERY_HISTORY_RETENTION_MS = 7_776_000_000;
/** The history document stays under this size; the oldest versions go first. */
export const MAX_QUERY_HISTORY_BYTES = 204_800;

/** The own document a query's history is kept in. */
export function queryHistoryDocumentName(id: string): string {
  return `history-${id}`;
}

const JSON_HTML_ESCAPE_PATTERN = /[<>&]/g;
const JSON_LINE_ESCAPE_PATTERN = new RegExp('[\\u2028\\u2029]', 'g');

/** A value's size as stored JSON, counting the escapes a store adds for `<`, `>`, `&` and line separators. */
export function escapedJsonByteSize(value: unknown): number {
  const text = JSON.stringify(value) ?? '';
  const escapes = 5 * (text.match(JSON_HTML_ESCAPE_PATTERN)?.length ?? 0) + 3 * (text.match(JSON_LINE_ESCAPE_PATTERN)?.length ?? 0);
  return new TextEncoder().encode(text).length + escapes;
}

export function parseQueryHistoryEntry(value: unknown): QueryHistoryRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const { at, args, call } = value as { at?: unknown; args?: unknown; call?: unknown };
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0 || typeof args !== 'string') return null;
  try {
    JSON.parse(args);
  } catch {
    return null;
  }
  return { at, args, ...(call === true ? { call: true as const } : {}) };
}

/** The versions kept: the last 90 days, oldest first, and no more than fit the size limit (the newest always). */
export function trimQueryHistory(entries: readonly QueryHistoryRecord[], now: number): QueryHistoryRecord[] {
  const kept = entries.filter((entry) => entry.at >= now - QUERY_HISTORY_RETENTION_MS).sort((left, right) => left.at - right.at);
  while (kept.length > 1 && escapedJsonByteSize({ entries: kept }) > MAX_QUERY_HISTORY_BYTES) kept.shift();
  return kept;
}

/** A stored history document (`{entries}`, newest first) as versions, oldest first. */
export function parseQueryHistory(value: unknown, now: number): QueryHistoryRecord[] {
  const entries = typeof value === 'object' && value !== null ? (value as { entries?: unknown }).entries : undefined;
  return trimQueryHistory(
    (Array.isArray(entries) ? entries : []).map(parseQueryHistoryEntry).filter((entry): entry is QueryHistoryRecord => entry !== null),
    now,
  );
}

/**
 * The history with new versions added: each is skipped when it is the same as the last one, and comes after it. Returns
 * `null` when nothing was added.
 */
export function appendQueryHistoryEntries(
  stored: readonly QueryHistoryRecord[],
  added: readonly QueryHistoryRecord[],
): QueryHistoryRecord[] | null {
  const next = added.reduce<QueryHistoryRecord[]>(
    (entries, entry) => {
      const last = entries.at(-1);
      if (last !== undefined && jsonArgumentsEqual(last.args, entry.args) && (last.call === true) === (entry.call === true)) return entries;
      return [...entries, { at: Math.max(entry.at, (last?.at ?? 0) + 1), args: entry.args, ...(entry.call === true ? { call: true as const } : {}) }];
    },
    [...stored],
  );
  return next.length === stored.length ? null : next;
}

/** The document to store: the trimmed versions, newest first. */
export function queryHistoryDocument(entries: readonly QueryHistoryRecord[], now: number): { entries: QueryHistoryRecord[] } {
  return { entries: trimQueryHistory(entries, now).reverse() };
}

/** The versions as listed: newest first, each with an id. */
export function toQueryHistoryItems(entries: readonly QueryHistoryRecord[]): QueryHistoryItem[] {
  return entries.map((entry, index) => ({ id: `e${index}`, at: entry.at, entry })).reverse();
}

export function getOldestHistoryItemId(items: readonly QueryHistoryItem[]): string | undefined {
  return items.at(-1)?.id;
}

export function queryHistoryEntryTitle(id: string, oldest: string | undefined): string {
  return id === oldest ? ORIGINAL_QUERY_TITLE : EDITED_QUERY_TITLE;
}

/** A saved version restores only into a query written the same way (a `kind: "call"` source or a plain one). */
export function isHistoryEntrySameFormat(item: QueryHistoryItem, request: Pick<QuerySource, 'call'>): boolean {
  return (item.entry.call === true) === (request.call === true);
}

export function isHistoryEntryRestorable(item: QueryHistoryItem, request: QuerySource): boolean {
  return isHistoryEntrySameFormat(item, request) && hasRestorableArguments(item.entry.args, request.template ?? request.args);
}

function startOfLocalDay(at: number): number {
  return new Date(at).setHours(0, 0, 0, 0);
}

/** "3:05 PM" today, "Yesterday 3:05 PM", else "Mar 4". */
export function formatQueryHistoryTime(at: number, now: number): string {
  const time = new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(at)) / 86_400_000);
  if (days <= 0) return time;
  return days === 1 ? `Yesterday ${time}` : new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** A line diff of two texts (longest common subsequence): kept lines, lines only in `before` (−), lines only in `after` (+). */
export function diffTextLines(before: string, after: string): TextDiffLine[] {
  const left = before.split('\n');
  const right = after.split('\n');
  const common: number[][] = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
  const at = (i: number, j: number): number => common[i]?.[j] ?? 0;
  for (let i = left.length - 1; i >= 0; i--) {
    const row = common[i];
    if (row === undefined) continue;
    for (let j = right.length - 1; j >= 0; j--) row[j] = left[i] === right[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  }
  const lines: TextDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      lines.push({ mark: '', text: left[i] ?? '' });
      i++;
      j++;
    } else if (j >= right.length || (i < left.length && at(i + 1, j) >= at(i, j + 1))) {
      lines.push({ mark: '−', text: left[i] ?? '' });
      i++;
    } else {
      lines.push({ mark: '+', text: right[j] ?? '' });
      j++;
    }
  }
  return lines;
}

/** How a saved version's argument differs from the query now ("" when it doesn't). */
export function describeHistoryArgumentDifference(saved: QueryArgumentView, now?: QueryArgumentView): string {
  if (now === undefined) return NOT_IN_QUERY_NOW_NOTE;
  if (argumentViewsEqual(saved, now)) return '';
  if (now.param !== null) return nowSetByPageNote(now.param);
  if (saved.param !== null && now.long) return NOW_TYPED_NOTE;
  if (saved.param !== null || (!saved.long && !now.long)) return nowValueNote(now.text);
  const lines = diffTextLines(saved.text, now.text);
  const count = (mark: '−' | '+'): number => lines.filter((line) => line.mark === mark).length;
  return historyDifferenceLabel(Math.max(count('−'), count('+'), 1));
}
