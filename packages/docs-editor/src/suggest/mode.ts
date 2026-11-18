/**
 * Editing or Suggesting: whether the person's own edits change the text or become suggestions of theirs. The mode is
 * remembered per doc in this browser; only someone who may edit the doc suggests (a commenter's page writes nothing).
 * The page also keeps the suggestions it started, so their cards are the person's before the tab is read again.
 */
import { announce } from '@open-artifact/editor-kit';
import { create } from 'zustand';
import { getDocs, useDocs } from '../app/store.ts';

export const MODE_WORDS = {
  editing: 'Editing',
  editingHint: 'Change the text directly',
  commenting: 'Commenting',
  commentingHint: 'Comment without changing the text',
  suggesting: 'Suggesting',
  suggestingHint: 'Your edits become suggestions',
  what: 'mode',
  tip: 'Mode',
  saidOn: 'Suggesting on',
  saidOff: 'Suggesting off',
} as const;

interface ModeState {
  /** The doc the mode is for. */
  doc: string | null;
  suggesting: boolean;
}

export const useSuggestMode = create<ModeState>(() => ({ doc: null, suggesting: false }));

const keyOf = (doc: string) => `open-artifact.docs.suggesting.${doc}`;

function remembered(doc: string): boolean {
  try {
    return globalThis.localStorage?.getItem(keyOf(doc)) === '1';
  } catch {
    return false;
  }
}

function remember(doc: string, on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(keyOf(doc), '1');
    else globalThis.localStorage?.removeItem(keyOf(doc));
  } catch {
    // Not kept: the mode lasts while the page is open.
  }
}

/** Whether the person's edits become suggestions now: Suggesting is on and they may write. */
export const suggestingNow = (): boolean => useSuggestMode.getState().suggesting && getDocs().writable;

/** Switches the mode (and says so); remembered for the doc. */
export function setSuggesting(on: boolean): void {
  const { doc, suggesting } = useSuggestMode.getState();
  if (suggesting === on) return;
  useSuggestMode.setState({ suggesting: on });
  if (doc) remember(doc, on);
  announce(on ? MODE_WORDS.saidOn : MODE_WORDS.saidOff);
}

// The mode follows the doc the page shows.
function follow(): void {
  const doc = getDocs().project?.id ?? null;
  if (doc === useSuggestMode.getState().doc) return;
  useSuggestMode.setState({ doc, suggesting: doc ? remembered(doc) : false });
}
follow();
useDocs.subscribe(follow);

// ---- the page's own suggestions ---------------------------------------------------------------------------------

const started = new Set<string>();

/** A new suggestion's id, kept as one this page started. */
export function newSuggestionId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  const id = `sg_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
  started.add(id);
  return id;
}

/** Whether this page started the suggestion (its record may not name the person until the tab is read again). */
export const startedHere = (id: string): boolean => started.has(id);
