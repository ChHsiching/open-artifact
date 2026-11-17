/**
 * Which element of the chain under the pointer a click selects.
 *
 * The chain runs from the artboard's top element down to the innermost
 * template element hit. Like a design tool's groups, a click does not dive
 * straight to the innermost element:
 *
 * - with nothing related selected, it takes the top level (the level under
 *   the artboard's single root, when it has one);
 * - a selected element on the chain stays the pick, and a click beside the
 *   selection picks at the selection's level: the child of the deepest
 *   chain element that holds it;
 * - `click` (a plain click and the hover under the pointer) picks as
 *   `plain`, then, when that element is not editable text, goes on down the
 *   chain to the first element that is: pointing at a heading or a paragraph
 *   takes it at once;
 * - `deeper` (double-click) goes one level below the selected element;
 * - `deep` (⌘/Ctrl-click) takes the innermost element.
 */

export type PickMode = 'plain' | 'click' | 'deeper' | 'deep';

/**
 * Index into a chain of `length` elements (top first) to select.
 * `rootFirst`: the chain's first element is the artboard's single root.
 * `selected`: deepest index that is a selected element, or -1.
 * `holder`: deepest index that holds a selected element (an ancestor of it), or -1.
 * `textEditable`: whether the chain element at an index is editable text (`click` only).
 * Returns -1 for an empty chain.
 */
export function pickDepth(
  length: number,
  rootFirst: boolean,
  selected: number,
  holder: number,
  mode: PickMode,
  textEditable: (index: number) => boolean = () => false,
): number {
  if (length <= 0) return -1;
  if (mode === 'click') {
    const level = pickDepth(length, rootFirst, selected, holder, 'plain');
    if (level < 0 || textEditable(level)) return level;
    for (let index = level + 1; index < length; index++) if (textEditable(index)) return index;
    return level;
  }
  if (mode === 'deep') return length - 1;
  if (mode === 'deeper' && selected >= 0) return Math.min(selected + 1, length - 1);
  const level = Math.max(selected, holder >= 0 ? holder + 1 : -1);
  if (level >= 0) return Math.min(level, length - 1);
  return rootFirst && length > 1 ? 1 : 0;
}
