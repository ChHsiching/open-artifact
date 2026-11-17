/**
 * Three-way merges of files both this page and someone else (the agent,
 * another viewer) changed since the page last read them.
 *
 * - `design-system.json`: key-level, ours winning a key both changed
 *   ({@link mergeIndexText}). The index is small and mostly edited in
 *   different places.
 * - `tokens.json`: per token ({@link mergeTokensText}). Objects merge key by
 *   key and lists of named entries (`tokens`, `groups`, `styles`, `fonts`,
 *   `themes`) entry by entry, so a color the agent changed and a usage note
 *   the viewer wrote both survive. Two different edits of the same field are
 *   a conflict.
 * - Any other text file: line by line (`mergeLines` from
 *   `@open-artifact/editor-kit`). Changes to different lines merge, even
 *   adjacent ones; changes to the same lines conflict.
 *
 * A conflict is never resolved silently: the caller shows the conflict bar.
 */

import { mergeLines } from '@open-artifact/editor-kit';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/* -------------------------------------------------------------------------- */
/* design-system.json                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Merges `ours` into `theirs` relative to `base`: a key we changed takes
 * our value, every other key keeps theirs. Objects listed in `deep`
 * (`assetGroups`, `sections`, `blobs`) merge one level further, entry by entry.
 */
export function mergeJson(base: Json, ours: Json, theirs: Json, deep: readonly string[] = ['assetGroups', 'sections', 'blobs']): Json {
  const out: Json = { ...theirs };
  for (const key of new Set([...Object.keys(base), ...Object.keys(ours)])) {
    if (same(base[key], ours[key])) continue;
    if (deep.includes(key) && isObject(ours[key]) && isObject(theirs[key])) {
      out[key] = mergeJson(isObject(base[key]) ? (base[key] as Json) : {}, ours[key] as Json, theirs[key] as Json, []);
    } else if (key in ours) {
      out[key] = ours[key];
    } else {
      delete out[key];
    }
  }
  return out;
}

/** Merges index texts; `null` when one side is not valid JSON. */
export function mergeIndexText(base: string, ours: string, theirs: string): string | null {
  try {
    const [b, o, t] = [JSON.parse(base || '{}'), JSON.parse(ours), JSON.parse(theirs)] as unknown[];
    if (!isObject(b) || !isObject(o) || !isObject(t)) return null;
    return `${JSON.stringify(mergeJson(b, o, t), null, 2)}\n`;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Structural JSON merge (tokens.json)                                         */
/* -------------------------------------------------------------------------- */

/** Fields that identify the entries of a list, tried in order. */
const ID_FIELDS = ['name', 'id', 'file'] as const;

/** The field every entry of every given list has, unique within its list; `null` when none does. */
function identityField(...lists: unknown[]): string | null {
  const arrays = lists.filter(Array.isArray) as unknown[][];
  if (!arrays.length || arrays.every((list) => !list.length)) return null;
  for (const field of ID_FIELDS) {
    const ok = arrays.every((list) => {
      const seen = new Set<string>();
      for (const item of list) {
        if (!isObject(item) || typeof item[field] !== 'string' || seen.has(item[field] as string)) return false;
        seen.add(item[field] as string);
      }
      return true;
    });
    if (ok) return field;
  }
  return null;
}

/** Merges one value; pushes the paths it could not merge onto `conflicts` (and keeps ours there). */
function merge3(base: unknown, ours: unknown, theirs: unknown, path: string, conflicts: string[]): unknown {
  if (same(ours, theirs)) return ours;
  if (same(base, ours)) return theirs;
  if (same(base, theirs)) return ours;
  if (isObject(ours) && isObject(theirs) && (isObject(base) || base === undefined)) {
    const from = (base ?? {}) as Json;
    const out: Json = {};
    // Their key order, with keys only we added at the end.
    for (const key of new Set([...Object.keys(theirs), ...Object.keys(ours)])) {
      const value = merge3(
        Object.hasOwn(from, key) ? from[key] : undefined,
        Object.hasOwn(ours, key) ? ours[key] : undefined,
        Object.hasOwn(theirs, key) ? theirs[key] : undefined,
        path ? `${path}.${key}` : key,
        conflicts,
      );
      if (value !== undefined) out[key] = value;
    }
    return out;
  }
  if (Array.isArray(ours) && Array.isArray(theirs) && (Array.isArray(base) || base === undefined)) {
    const field = identityField(base, ours, theirs);
    if (field) return mergeNamedList((base ?? []) as Json[], ours as Json[], theirs as Json[], field, path, conflicts);
  }
  conflicts.push(path || '(file)');
  return ours;
}

/** Merges lists of entries identified by `field`, entry by entry. */
function mergeNamedList(base: Json[], ours: Json[], theirs: Json[], field: string, path: string, conflicts: string[]): Json[] {
  const id = (item: Json): string => item[field] as string;
  const byId = (list: Json[]): Map<string, Json> => new Map(list.map((item) => [id(item), item]));
  const [b, o, t] = [byId(base), byId(ours), byId(theirs)];
  const at = (name: string): string => `${path}[${field}=${name}]`;

  const merged = new Map<string, Json>();
  for (const name of new Set([...o.keys(), ...t.keys(), ...b.keys()])) {
    const value = merge3(b.get(name), o.get(name), t.get(name), at(name), conflicts);
    if (value !== undefined) merged.set(name, value as Json);
  }

  // Order: whichever side reordered the entries both kept; theirs when both or neither did.
  const order = (list: Json[], keep: (name: string) => boolean): string[] => list.map(id).filter(keep);
  const common = (name: string): boolean => b.has(name) && o.has(name) && t.has(name);
  const oursReordered = !same(order(base, common), order(ours, common));
  const theirsReordered = !same(order(base, common), order(theirs, common));
  const primary = oursReordered && !theirsReordered ? ours : theirs;
  const secondary = primary === ours ? theirs : ours;

  const names = primary.map(id).filter((name) => merged.has(name));
  // Entries only the other side has go right after the entry they follow there.
  const others = secondary.map(id);
  others.forEach((name, index) => {
    if (!merged.has(name) || names.includes(name)) return;
    let after = -1;
    for (let k = index - 1; k >= 0; k--) {
      const found = names.indexOf(others[k]!);
      if (found >= 0) {
        after = found;
        break;
      }
    }
    names.splice(after + 1, 0, name);
  });
  return names.map((name) => merged.get(name)!);
}

/** Result of a structural merge. */
export interface JsonMerge {
  value: unknown;
  /** Paths both sides changed differently (`color.tokens[name=ink].value`). Empty: merged cleanly. */
  conflicts: string[];
}

/** Merges three parsed JSON values. */
export function mergeJsonValues(base: unknown, ours: unknown, theirs: unknown): JsonMerge {
  const conflicts: string[] = [];
  const value = merge3(base, ours, theirs, '', conflicts);
  return { value, conflicts };
}

/**
 * Merges three texts of `tokens.json` token by token. `null` when one side
 * is not valid JSON; otherwise the merged text (written the way the page
 * writes tokens) and the conflicting paths.
 */
export function mergeTokensText(base: string, ours: string, theirs: string): { text: string; conflicts: string[] } | null {
  let parsed: unknown[];
  try {
    parsed = [base.trim() ? JSON.parse(base) : {}, JSON.parse(ours), JSON.parse(theirs)];
  } catch {
    return null;
  }
  const { value, conflicts } = mergeJsonValues(parsed[0], parsed[1], parsed[2]);
  return { text: `${JSON.stringify(value, null, 2)}\n`, conflicts };
}

/**
 * Merges a file both sides changed, by kind. `null` when it cannot be
 * merged cleanly (the caller raises a conflict).
 */
export function autoMerge(path: string, base: string, ours: string, theirs: string): string | null {
  if (path === 'design-system.json') return mergeIndexText(base, ours, theirs);
  if (path === 'tokens.json') {
    const result = mergeTokensText(base, ours, theirs);
    return result && !result.conflicts.length ? result.text : null;
  }
  if (/\.(json)$/i.test(path)) {
    try {
      const { value, conflicts } = mergeJsonValues(JSON.parse(base || '{}'), JSON.parse(ours), JSON.parse(theirs));
      return conflicts.length ? null : `${JSON.stringify(value, null, 2)}\n`;
    } catch {
      return mergeLines(base, ours, theirs);
    }
  }
  return mergeLines(base, ours, theirs);
}
