/** What the find bar holds between openings: the words, the replacement, match case, and how the last press went. */
import { create } from 'zustand';
import type { ReplaceOutcome } from './search.ts';

export interface FindBarState {
  query: string;
  replacement: string;
  caseSensitive: boolean;
  /** Raised each time find is asked for, so the bar takes the keyboard again. */
  summons: number;
  /** Which field the last summons was for. */
  summoned: 'find' | 'replace';
  outcome: ReplaceOutcome | null;
  /** The replacement text of the last Replace all that wrote something. */
  lastReplaceAll: string | null;
  /** Replacements made from the bar that ⌘Z there may undo, and undone ones ⇧⌘Z may redo. */
  undoable: number;
  redoable: number;
  /** A tab was picked from the other tabs' list: show its first match once it opens. */
  firstOnOpen: boolean;
}

export const useFindBar = create<FindBarState>(() => ({
  query: '',
  replacement: '',
  caseSensitive: false,
  summons: 0,
  summoned: 'find',
  outcome: null,
  lastReplaceAll: null,
  undoable: 0,
  redoable: 0,
  firstOnOpen: false,
}));

export const setFindBar = useFindBar.setState;
export const getFindBar = useFindBar.getState;
