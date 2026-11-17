/**
 * Unsaved-edit recovery (the pure part is lib/stash.ts): while edits wait to
 * be saved, the artboards and canvas.json that differ from the saved files
 * are copied to localStorage (debounced, and at once when the page is
 * hidden). A landed save clears the copy. If the tab closed before the save
 * landed, the next visit offers "Restore your unsaved changes to X?".
 * Restoring is one edit per file, so it can be undone.
 */

import { create } from 'zustand';
import { normalizeCanvas, serializeCanvas } from '@open-artifact/design-core';
import { isDirty, useDocument } from '../state/document.ts';
import { buildStash, stashDiff, stashPrompt, stashStorage, type Stash, type StashDiff } from '../lib/stash.ts';
import { announce } from './announce.ts';

/** Debounce of copies while editing, ms. */
const WRITE_DELAY = 1500;

/** This design's stash (one design per editor page). */
const stored = () => stashStorage(`open-artifact-design:recovery:${location.pathname}`);

interface RecoveryOffer {
  stash: Stash;
  diff: StashDiff;
  prompt: string;
}

/** The restore offer shown at the top of the canvas. */
export const useRecovery = create<{ offer: RecoveryOffer | null }>()(() => ({ offer: null }));

const readStored = (): Stash | null => stored().read();
const clearStored = (): void => stored().clear();

function writeNow(): void {
  const state = useDocument.getState();
  if (state.readOnly || state.status !== 'ready') return;
  // An offer still waiting keeps its copy until it is answered.
  if (useRecovery.getState().offer) return;
  const stash = buildStash(
    {
      title: state.title,
      canvasText: serializeCanvas(state.canvas),
      canvasSavedText: serializeCanvas(state.canvasSaved),
      boards: Object.fromEntries(Object.entries(state.boards).map(([path, board]) => [path, { source: board.source, saved: board.saved }])),
    },
    Date.now(),
  );
  stored().write(stash);
}

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

/**
 * Checks for a stash from an earlier visit (offering it when it would change
 * something), then keeps the copy current. Call once the design has loaded.
 */
export function startRecovery(): void {
  if (started) return;
  started = true;
  const state = useDocument.getState();
  if (state.readOnly) return;
  const stash = readStored();
  if (stash) {
    const diff = stashDiff(stash, { canvasText: serializeCanvas(state.canvas), boards: Object.fromEntries(Object.entries(state.boards).map(([path, board]) => [path, board.source])) }, Date.now());
    if (diff && !state.canvasError) {
      const prompt = stashPrompt(diff, stash.title || state.title, (path) => state.canvas.boards[path]?.title || path.replace(/\.dc\.html$/, ''));
      useRecovery.setState({ offer: { stash, diff, prompt } });
      announce(prompt);
    } else clearStored();
  }
  useDocument.subscribe((next, previous) => {
    if (next.revision === previous.revision && next.save === previous.save) return;
    if (next.save === 'saved' && !isDirty(next)) {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!useRecovery.getState().offer) clearStored();
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      writeNow();
    }, WRITE_DELAY);
  });
  window.addEventListener('pagehide', () => {
    if (isDirty(useDocument.getState())) writeNow();
  });
}

/** Brings the offered unsaved changes back (undoable). */
export function restoreRecovery(): void {
  const offer = useRecovery.getState().offer;
  if (!offer) return;
  useRecovery.setState({ offer: null });
  const { stash, diff } = offer;
  const doc = useDocument.getState();
  if (diff.canvas && stash.canvas !== undefined) {
    try {
      const canvas = normalizeCanvas(JSON.parse(stash.canvas));
      doc.updateCanvas(() => canvas);
    } catch {
      // A stash that no longer parses leaves the canvas as it is.
    }
  }
  for (const path of diff.boards) {
    const text = stash.boards[path]!;
    const state = useDocument.getState();
    if (state.boards[path]?.source != null) state.editBoard(path, { kind: 'source', text });
    else {
      // A file created here that never reached the server.
      const entry = state.canvas.boards[path] ?? { x: 0, y: 0, w: 1280, h: 800 };
      state.createBoard(path, text, entry);
    }
  }
  clearStored();
  announce('Unsaved changes restored');
}

/** Drops the offered copy. */
export function discardRecovery(): void {
  useRecovery.setState({ offer: null });
  clearStored();
  writeNow();
}
