/** What edit mode says about keys and clicks (pure: no DOM). */

export const LINK_HINT_MAX = 56;

const modName = (apple: boolean): string => (apple ? '⌘' : 'Ctrl');

/** The tip over a control or link on the page: ⌘/Ctrl-click uses it, goes there, or opens its address. */
export function describeClickThrough(href: string | null, apple: boolean): string {
  const key = modName(apple);
  if (href === null) return `${key}-click to use`;
  if (href === '' || href.startsWith('#')) return `${key}-click to go there`;
  const shown = href.replace(/^https?:\/\//, '');
  return `${key}-click to open: ${shown.length > LINK_HINT_MAX ? `${shown.slice(0, LINK_HINT_MAX - 1)}…` : shown}`;
}

/** How a piece can be worked with from the keyboard. */
export interface PieceKeys {
  /** A card: Delete removes it, Shift+F10 opens its menu. */
  block: boolean;
  /** Words that Enter opens for typing. */
  typing: boolean;
  /** A control or link inside that ⌘/Ctrl+Enter uses. */
  usable: boolean;
}

/** What the screen reader says of a piece: its name, then the keys that work on it. */
export function describePieceKeys(name: string, { block, typing, usable }: PieceKeys, apple: boolean): string {
  if (block) return `${name}, Delete to remove, Shift+F10 for more`;
  const enter = 'Enter';
  const keys = usable ? (apple ? `⌘${enter}` : `Ctrl+${enter}`) : null;
  if (keys === null) return typing ? `${name}, ${enter} to edit` : name;
  return typing ? `${name}, ${enter} to edit, ${keys} to use` : `${name}, ${keys} to use`;
}

/** What a key does to the picked piece when no words are being typed in. */
export type PieceKeyAction = 'type' | 'use' | 'source' | 'tab' | 'delete' | 'refuse' | 'unpick' | null;

export interface PieceKeyInput {
  key: string;
  kind: 'words' | 'drawing' | 'block';
  /** The piece sits in a tab that isn't open. */
  inactiveTab: boolean;
  /** The piece has a source to show. */
  sourced: boolean;
}

/** Enter or a letter types into words (or opens a closed tab), Enter shows a source, Delete removes, Escape unpicks. */
export function pieceKeyAction({ key, kind, inactiveTab, sourced }: PieceKeyInput): PieceKeyAction {
  const printable = key.length === 1;
  if (key === 'Escape') return 'unpick';
  if (kind !== 'words' && key === 'Enter' && !inactiveTab && sourced) return 'source';
  if (inactiveTab && key === 'Enter') return 'tab';
  if (!inactiveTab && kind === 'words' && (key === 'Enter' || printable)) return 'type';
  if (kind === 'drawing' && (key === 'Enter' || printable)) return 'refuse';
  if (kind !== 'words' && (key === 'Delete' || key === 'Backspace')) return 'delete';
  return null;
}
