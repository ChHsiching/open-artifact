/**
 * Unsaved-edit recovery, the pure part: while edits wait to be saved, the
 * artboards and canvas index that differ from the saved files are copied
 * (a "stash"). If the tab closes before the save lands, the next visit
 * compares the stash with what was loaded and offers to bring it back.
 * Storage, age and JSON comparison are `@open-artifact/editor-kit`'s.
 */

import { normalizeJson, stashFresh, storedJson, type StoredJson } from '@open-artifact/editor-kit';

export { STASH_KEEP_MS } from '@open-artifact/editor-kit';

/** A stored copy of unsaved work. */
export interface Stash {
  v: 1;
  at: number;
  title: string;
  /** The unsaved canvas.json text, when the canvas differed. */
  canvas?: string;
  /** Artboard path → its unsaved source. */
  boards: Record<string, string>;
}

/** What a stash is built from: the document store's view of each file. */
export interface StashInput {
  title: string;
  canvasText: string;
  canvasSavedText: string;
  boards: Record<string, { source: string | null; saved: string | null }>;
}

/** The stash of unsaved work, or `null` when everything is saved. */
export function buildStash(input: StashInput, now: number): Stash | null {
  const boards: Record<string, string> = {};
  for (const [path, board] of Object.entries(input.boards)) {
    if (board.source !== null && board.source !== board.saved) boards[path] = board.source;
  }
  const canvas = input.canvasText !== input.canvasSavedText ? input.canvasText : undefined;
  if (!canvas && !Object.keys(boards).length) return null;
  return { v: 1, at: now, title: input.title, ...(canvas ? { canvas } : {}), boards };
}

/** A stored stash, validated (`null` when malformed). */
export function readStash(value: unknown): Stash | null {
  if (!value || typeof value !== 'object') return null;
  const stash = value as Partial<Stash>;
  if (stash.v !== 1 || typeof stash.at !== 'number' || !stash.boards || typeof stash.boards !== 'object') return null;
  if (stash.canvas !== undefined && typeof stash.canvas !== 'string') return null;
  if (Object.values(stash.boards).some((text) => typeof text !== 'string')) return null;
  return { v: 1, at: stash.at, title: typeof stash.title === 'string' ? stash.title : '', ...(stash.canvas !== undefined ? { canvas: stash.canvas } : {}), boards: stash.boards as Record<string, string> };
}

/** What restoring a stash would change in the loaded design. */
export interface StashDiff {
  canvas: boolean;
  boards: string[];
}

/**
 * What of a stash differs from the design as loaded (`canvasText`, artboard
 * sources). `null` when it is too old or would change nothing.
 */
export function stashDiff(stash: Stash, loaded: { canvasText: string; boards: Record<string, string | null> }, now: number): StashDiff | null {
  if (!stashFresh(stash.at, now)) return null;
  const canvas = stash.canvas !== undefined && normalizeJson(stash.canvas) !== normalizeJson(loaded.canvasText);
  const boards = Object.keys(stash.boards)
    .filter((path) => stash.boards[path] !== loaded.boards[path])
    .sort();
  return canvas || boards.length ? { canvas, boards } : null;
}

/** The question offered for a stash: "Restore your unsaved changes to X?". */
export function stashPrompt(diff: StashDiff, title: string, boardTitle: (path: string) => string): string {
  const names = diff.boards.map(boardTitle);
  const what = names.length === 1 && !diff.canvas ? names[0]! : names.length === 0 ? title || 'this design' : names.length <= 2 && !diff.canvas ? names.join(' and ') : title || `${names.length} artboards`;
  return `Restore your unsaved changes to ${what}?`;
}

/** Where stashes are kept: `localStorage` under one key, every access guarded. */
export type StashStorage = StoredJson<Stash>;

/**
 * A stash store under `key` (e.g. `open-artifact-design:recovery:<path>`).
 * Storage that is missing, full or blocked reads as empty and ignores writes.
 */
export function stashStorage(key: string, storage: () => Storage | undefined = () => globalThis.localStorage): StashStorage {
  return storedJson(key, readStash, storage);
}
