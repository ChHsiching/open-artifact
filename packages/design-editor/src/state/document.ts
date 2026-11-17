/**
 * The document store: `canvas.json`, every artboard source, the undo
 * history and what has reached the server.
 *
 * Paths here are project paths (`Main.dc.html`, `canvas.json`); the
 * artifact API uses `project/<path>`.
 *
 * Saving works on three numbers per artboard: `source` (what the viewer
 * sees), `saved` (what the server holds, with its `hash`) and `pending`
 * (the operations that turn `saved` into `source`). Pending operations are
 * what lets a remote change be merged instead of overwritten: take their
 * version, replay ours on top.
 */

import { create } from 'zustand';
import { emptyCanvas, mergeCanvas, normalizeCanvas, type Canvas } from '@open-artifact/design-core';
import { applyOp, replayOps, type BoardOp, type OpResult } from '../lib/ops.ts';

/** One artboard file. */
export interface BoardDoc {
  /** Current source; `null` while the file has not arrived yet. */
  source: string | null;
  /** Source the server holds. */
  saved: string | null;
  /** Hash of `saved` on the server; `null` when the server has no such file. */
  hash: string | null;
  /** Unsaved operations, oldest first. */
  pending: BoardOp[];
}

/** Save state shown in the toolbar. */
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'offline' | 'readonly';

/** One undo step. */
export type HistoryEntry =
  | { scope: 'canvas'; before: Canvas; after: Canvas }
  | { scope: 'board'; path: string; before: { source: string; pending: BoardOp[] }; after: { source: string; pending: BoardOp[] }; key?: string };

/** Longest undo history kept. */
const HISTORY_LIMIT = 200;

export interface DocumentState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  title: string;
  readOnly: boolean;
  canvas: Canvas;
  /** The canvas the server holds (base of the three-way merge). */
  canvasSaved: Canvas;
  canvasHash: string | null;
  /** `canvas.json` could not be parsed; the editor shows the error and does not overwrite it. */
  canvasError: string | null;
  boards: Record<string, BoardDoc>;
  /** Artboards this tab deleted, not yet deleted on the server. */
  trash: string[];
  undo: HistoryEntry[];
  redo: HistoryEntry[];
  /** Hand edits made in this tab (reported in the view context). */
  edits: number;
  save: SaveState;
  /** Bumped on every local change; the sync service saves after it. */
  revision: number;
  /** Canvas before the current gesture (drag, resize), if one is running. */
  gesture: Canvas | null;
}

export interface DocumentActions {
  /** Loads the project. */
  load(input: { title: string; readOnly: boolean; canvas: { text: string | null; hash: string | null }; boards: Record<string, { text: string; hash: string }> }): void;
  fail(message: string): void;
  /**
   * Applies an edit to an artboard; returns `null` when it does not apply.
   * Consecutive edits with the same `coalesce` key share one undo step.
   */
  editBoard(path: string, op: BoardOp, options?: { coalesce?: string }): OpResult | null;
  /** Changes the canvas. Outside a gesture each call is one undo step. */
  updateCanvas(recipe: (canvas: Canvas) => Canvas): void;
  /** Starts coalescing canvas changes into one undo step. */
  beginGesture(): void;
  /** Ends the gesture, recording one undo step when something changed. */
  endGesture(): void;
  /** Adds a new artboard file and its canvas entry. */
  createBoard(path: string, source: string, entry: Canvas['boards'][string]): void;
  /** Removes artboards from the canvas and deletes their files on save. */
  deleteBoards(paths: readonly string[]): void;
  undoLast(): HistoryEntry | null;
  redoLast(): HistoryEntry | null;
  /** Someone else changed an artboard: take theirs, replay our pending operations. Returns dropped count. */
  remoteBoard(path: string, text: string | null, hash: string | null): number;
  /** Someone else changed the canvas: three-way merge. */
  remoteCanvas(text: string | null, hash: string | null): void;
  /** A save went through. */
  acknowledge(sent: SentBatch, hashes: Record<string, string | null>): void;
  setSave(save: SaveState): void;
  setTitle(title: string): void;
}

/** What one save sent, to reconcile when it returns. */
export interface SentBatch {
  canvas: { canvas: Canvas; text: string } | null;
  boards: Record<string, { source: string; pendingCount: number }>;
  deleted: string[];
}

const parse = (text: string | null): { canvas: Canvas; error: string | null } => {
  if (text === null) return { canvas: emptyCanvas(), error: null };
  try {
    return { canvas: normalizeCanvas(JSON.parse(text)), error: null };
  } catch (error) {
    return { canvas: emptyCanvas(), error: error instanceof Error ? error.message : String(error) };
  }
};

const push = (list: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] => [...list.slice(-(HISTORY_LIMIT - 1)), entry];

export const useDocument = create<DocumentState & DocumentActions>()((set, get) => ({
  status: 'loading',
  error: null,
  title: '',
  readOnly: false,
  canvas: emptyCanvas(),
  canvasSaved: emptyCanvas(),
  canvasHash: null,
  canvasError: null,
  boards: {},
  trash: [],
  undo: [],
  redo: [],
  edits: 0,
  save: 'saved',
  revision: 0,
  gesture: null,

  load({ title, readOnly, canvas, boards }) {
    const parsed = parse(canvas.text);
    const docs: Record<string, BoardDoc> = {};
    for (const [path, file] of Object.entries(boards)) docs[path] = { source: file.text, saved: file.text, hash: file.hash, pending: [] };
    set({
      status: 'ready',
      title: parsed.canvas.title || title,
      readOnly,
      canvas: parsed.canvas,
      canvasSaved: parsed.canvas,
      canvasHash: canvas.hash,
      canvasError: parsed.error,
      boards: docs,
      save: readOnly ? 'readonly' : 'saved',
    });
  },

  fail(message) {
    set({ status: 'error', error: message });
  },

  editBoard(path, op, options = {}) {
    const state = get();
    const board = state.boards[path];
    if (state.readOnly || !board?.source) return null;
    const result = applyOp(board.source, op);
    if (!result || result.source === board.source) return result;
    const after = { source: result.source, pending: [...board.pending, op] };
    const last = state.undo[state.undo.length - 1];
    const merge = options.coalesce && last?.scope === 'board' && last.path === path && last.key === options.coalesce && last.after.source === board.source;
    const before = merge ? last.before : { source: board.source, pending: board.pending };
    const entry: HistoryEntry = { scope: 'board', path, before, after, ...(options.coalesce ? { key: options.coalesce } : {}) };
    set({
      boards: { ...state.boards, [path]: { ...board, ...after } },
      undo: merge ? [...state.undo.slice(0, -1), entry] : push(state.undo, entry),
      redo: [],
      edits: state.edits + 1,
      revision: state.revision + 1,
    });
    return result;
  },

  updateCanvas(recipe) {
    const state = get();
    if (state.readOnly || state.canvasError) return;
    const next = recipe(state.canvas);
    if (next === state.canvas) return;
    set({
      canvas: next,
      ...(state.gesture ? {} : { undo: push(state.undo, { scope: 'canvas', before: state.canvas, after: next }), redo: [] }),
      revision: state.revision + 1,
    });
  },

  beginGesture() {
    if (!get().gesture) set({ gesture: get().canvas });
  },

  endGesture() {
    const { gesture, canvas, undo } = get();
    if (!gesture) return;
    set({ gesture: null, ...(gesture !== canvas ? { undo: push(undo, { scope: 'canvas', before: gesture, after: canvas }), redo: [] } : {}) });
  },

  createBoard(path, source, entry) {
    const state = get();
    if (state.readOnly) return;
    const existing = state.boards[path];
    const canvas: Canvas = {
      ...state.canvas,
      boards: { ...state.canvas.boards, [path]: entry },
      order: [...state.canvas.order.filter((p) => p !== path), path],
    };
    set({
      boards: { ...state.boards, [path]: { source, saved: existing?.saved ?? null, hash: existing?.hash ?? null, pending: [] } },
      canvas,
      trash: state.trash.filter((p) => p !== path),
      undo: push(state.undo, { scope: 'canvas', before: state.canvas, after: canvas }),
      redo: [],
      edits: state.edits + 1,
      revision: state.revision + 1,
    });
  },

  deleteBoards(paths) {
    const state = get();
    if (state.readOnly || paths.length === 0) return;
    const boards = { ...state.canvas.boards };
    for (const path of paths) delete boards[path];
    const canvas: Canvas = { ...state.canvas, boards, order: state.canvas.order.filter((p) => !paths.includes(p)) };
    set({
      canvas,
      trash: [...new Set([...state.trash, ...paths])],
      undo: push(state.undo, { scope: 'canvas', before: state.canvas, after: canvas }),
      redo: [],
      edits: state.edits + 1,
      revision: state.revision + 1,
    });
  },

  undoLast() {
    const state = get();
    const entry = state.undo[state.undo.length - 1];
    if (!entry || state.readOnly) return null;
    if (entry.scope === 'canvas') {
      // Revert our change on top of whatever else changed since (three-way).
      const canvas = mergeCanvas(entry.after, entry.before, state.canvas);
      set({ canvas, undo: state.undo.slice(0, -1), redo: push(state.redo, entry), revision: state.revision + 1 });
    } else {
      const board = state.boards[entry.path];
      if (!board) return null;
      set({
        boards: { ...state.boards, [entry.path]: { ...board, ...entry.before } },
        undo: state.undo.slice(0, -1),
        redo: push(state.redo, entry),
        revision: state.revision + 1,
      });
    }
    return entry;
  },

  redoLast() {
    const state = get();
    const entry = state.redo[state.redo.length - 1];
    if (!entry || state.readOnly) return null;
    if (entry.scope === 'canvas') {
      const canvas = mergeCanvas(entry.before, entry.after, state.canvas);
      set({ canvas, redo: state.redo.slice(0, -1), undo: push(state.undo, entry), revision: state.revision + 1 });
    } else {
      const board = state.boards[entry.path];
      if (!board) return null;
      set({
        boards: { ...state.boards, [entry.path]: { ...board, ...entry.after } },
        redo: state.redo.slice(0, -1),
        undo: push(state.undo, entry),
        revision: state.revision + 1,
      });
    }
    return entry;
  },

  remoteBoard(path, text, hash) {
    const state = get();
    const board = state.boards[path];
    // Their change rewrites the history of this artboard: our undo steps would revert it.
    const clear = (list: HistoryEntry[]) => list.filter((entry) => entry.scope !== 'board' || entry.path !== path);
    if (text === null) {
      if (!board) return 0;
      set({ boards: { ...state.boards, [path]: { ...board, saved: null, hash: null, ...(board.pending.length ? {} : { source: null }) } } });
      return 0;
    }
    const replay = board?.pending.length ? replayOps(text, board.pending) : { source: text, kept: [], dropped: 0 };
    set({
      boards: { ...state.boards, [path]: { source: replay.source, saved: text, hash, pending: replay.kept } },
      undo: clear(state.undo),
      redo: clear(state.redo),
      ...(replay.kept.length ? { revision: state.revision + 1 } : {}),
    });
    return replay.dropped;
  },

  remoteCanvas(text, hash) {
    const state = get();
    const parsed = parse(text);
    if (parsed.error) {
      set({ canvasError: parsed.error, canvasHash: hash });
      return;
    }
    const dirty = state.canvas !== state.canvasSaved;
    const canvas = dirty ? mergeCanvas(state.canvasSaved, state.canvas, parsed.canvas) : parsed.canvas;
    set({
      canvas,
      canvasSaved: parsed.canvas,
      canvasHash: hash,
      canvasError: null,
      title: parsed.canvas.title || state.title,
      ...(dirty ? { revision: state.revision + 1 } : {}),
    });
  },

  acknowledge(sent, hashes) {
    const state = get();
    const boards = { ...state.boards };
    for (const [path, { source, pendingCount }] of Object.entries(sent.boards)) {
      const board = boards[path];
      if (!board || !(path in hashes)) continue;
      boards[path] = { ...board, saved: source, hash: hashes[path] ?? null, pending: board.pending.slice(pendingCount) };
    }
    for (const path of sent.deleted) {
      const board = boards[path];
      if (board) boards[path] = { ...board, saved: null, hash: null };
    }
    set({
      boards,
      trash: state.trash.filter((path) => !sent.deleted.includes(path)),
      ...(sent.canvas && 'canvas.json' in hashes ? { canvasSaved: sent.canvas.canvas, canvasHash: hashes['canvas.json'] ?? null } : {}),
    });
  },

  setSave(save) {
    if (get().save !== save) set({ save });
  },

  setTitle(title) {
    set({ title });
  },
}));

/** True when something has not reached the server. */
export function isDirty(state: DocumentState): boolean {
  if (state.readOnly) return false;
  if (state.canvas !== state.canvasSaved) return true;
  if (state.trash.some((path) => state.boards[path]?.hash)) return true;
  return Object.entries(state.boards).some(([path, board]) => board.source !== null && boardNeedsWrite(state, path, board));
}

/** An artboard must be written: changed, or listed on the canvas but missing on the server. */
export function boardNeedsWrite(state: DocumentState, path: string, board: BoardDoc): boolean {
  if (board.source === null) return false;
  if (board.source !== board.saved) return true;
  return board.hash === null && path in state.canvas.boards;
}
