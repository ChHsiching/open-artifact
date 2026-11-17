/**
 * Three-way merge of `canvas.json`.
 *
 * When a save is rejected because someone else (another viewer, or the
 * agent) wrote the index since we read it, the editor merges instead of
 * overwriting: keys only one side changed take that side; boards, notes,
 * pages and design systems merge entry by entry; when both sides changed
 * the same entry, ours (the later writer) wins.
 */

import { normalizeCanvas, type Canvas } from './canvas.ts';

/** Structural equality of JSON values. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((value, index) => jsonEqual(value, other[index]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every((key) => jsonEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Merges one value: whichever side changed it wins; both changed → ours. */
function pick<T>(base: T | undefined, ours: T | undefined, theirs: T | undefined): T | undefined {
  if (jsonEqual(ours, base)) return theirs;
  return ours;
}

/** Merges a keyed record entry by entry. */
export function mergeRecords<T>(
  base: Record<string, T>,
  ours: Record<string, T>,
  theirs: Record<string, T>,
): Record<string, T> {
  const out: Record<string, T> = {};
  const keys = new Set([...Object.keys(theirs), ...Object.keys(ours), ...Object.keys(base)]);
  for (const key of keys) {
    const value = pick(base[key], ours[key], theirs[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Merges a list of objects keyed by `keyOf`, keeping theirs order and adding ours new entries. */
function mergeKeyedList<T>(base: T[], ours: T[], theirs: T[], keyOf: (item: T) => string): T[] {
  const toRecord = (list: T[]): Record<string, T> => Object.fromEntries(list.map((item) => [keyOf(item), item]));
  const merged = mergeRecords(toRecord(base), toRecord(ours), toRecord(theirs));
  const keys = mergeOrder(base.map(keyOf), ours.map(keyOf), theirs.map(keyOf));
  return keys.filter((key) => key in merged).map((key) => merged[key]!);
}

/**
 * Merges an ordering: start from theirs, drop what ours removed, place what
 * ours added right after its predecessor in ours (or first), and apply our
 * moves when theirs kept the base order.
 */
export function mergeOrder(base: readonly string[], ours: readonly string[], theirs: readonly string[]): string[] {
  if (jsonEqual(ours, base)) return [...theirs];
  if (jsonEqual(theirs, base)) return [...ours];
  const removed = new Set(base.filter((key) => !ours.includes(key)));
  const result = theirs.filter((key) => !removed.has(key));
  ours.forEach((key, index) => {
    if (base.includes(key) || result.includes(key)) return;
    const before = ours.slice(0, index).reverse().find((candidate) => result.includes(candidate));
    result.splice(before === undefined ? 0 : result.indexOf(before) + 1, 0, key);
  });
  return result;
}

/** Merges three versions of the index. */
export function mergeCanvas(base: Canvas, ours: Canvas, theirs: Canvas): Canvas {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(theirs), ...Object.keys(ours), ...Object.keys(base)]);
  for (const key of keys) {
    const b = base[key];
    const o = ours[key];
    const t = theirs[key];
    if (jsonEqual(o, b)) {
      if (t !== undefined) out[key] = t;
      continue;
    }
    if (jsonEqual(t, b)) {
      if (o !== undefined) out[key] = o;
      continue;
    }
    switch (key) {
      case 'boards':
        out.boards = mergeRecords(base.boards, ours.boards, theirs.boards);
        break;
      case 'notes':
        out.notes = mergeRecords(base.notes, ours.notes, theirs.notes);
        break;
      case 'order':
        out.order = mergeOrder(base.order, ours.order, theirs.order);
        break;
      case 'pages':
        out.pages = mergeKeyedList(base.pages, ours.pages, theirs.pages, (page) => page.id);
        break;
      case 'designSystems':
        out.designSystems = mergeKeyedList(base.designSystems, ours.designSystems, theirs.designSystems, (ds) => ds.namespace);
        break;
      default:
        if (o !== undefined) out[key] = o;
    }
  }
  // Normalizing re-establishes `order` ⇔ `boards` consistency after the merge.
  return normalizeCanvas(out);
}
