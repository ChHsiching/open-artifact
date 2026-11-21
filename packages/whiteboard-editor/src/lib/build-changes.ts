/**
 * What of an element the build show replays when the agent writes it
 * (services/build-show.ts): all of a new element; of a changed one, only its
 * text when the change was to its words (and the size they take), all of it
 * when the change was to anything else. A move alone replays nothing (the
 * element glides to its new place).
 *
 * Pure: unit-tested without a DOM.
 */

import type { BoardElement } from '@open-artifact/whiteboard-core';

/** `whole`: replay the element; `text`: only its text; null: nothing. */
export type ElementReplay = 'whole' | 'text' | null;

/** Fields a move changes, or that never show. */
const MOVE = new Set(['x', 'y', 'turn']);
/** Fields of the element's words. */
const WORDS = new Set(['text', 'label']);
/** Fields that change with the words (the box they fit in). */
const FIT = new Set(['w', 'h', 'wrap']);

const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/** What to replay of `after`, which was `before` (undefined: it is new). */
export function elementReplay(before: BoardElement | undefined, after: BoardElement): ElementReplay {
  if (!before) return 'whole';
  if (before === after) return null;
  const a = before as unknown as Record<string, unknown>;
  const b = after as unknown as Record<string, unknown>;
  const changed = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !MOVE.has(key) && !same(a[key], b[key]));
  if (changed.length === 0) return null;
  if (changed.some((key) => WORDS.has(key)) && changed.every((key) => WORDS.has(key) || FIT.has(key))) return 'text';
  return 'whole';
}
