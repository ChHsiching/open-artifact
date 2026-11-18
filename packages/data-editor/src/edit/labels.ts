/** Edit mode's words for the person (pure: no DOM). */

export const REFUSE_FROM_DATA =
  'This comes from the data, so it can’t be edited. You can delete it, or ask the agent to change what it shows.';
export const REFUSE_PAGE_WRITTEN = 'The page writes this, so it can’t be edited. You can delete it, or ask the agent to change it.';
export const REFUSE_CUT = 'What the page writes can’t be cut. You can delete it, or ask the agent to move it.';
export const CHAPTER_NEEDS_WORDS = 'A chapter needs words. Ask the agent to delete the chapter.';

/** Words that can't be emptied: the selector they sit in and why. */
export const LABEL_REQUIRED_REFUSALS: readonly (readonly [selector: string, refusal: string])[] = [
  ['thead', 'A column needs a heading. Ask the agent to delete the column.'],
  ['[role="tab"]', 'A tab needs a label. Ask the agent to delete the tab.'],
  ['summary', 'A section needs a label. Ask the agent to delete the section.'],
  ['button', 'A button needs a label. Ask the agent to delete the button.'],
];

/** Why emptied words can't go, from what they sit in (`within(selector)`: the words are inside it). */
export function emptiedRefusal(within: (selector: string) => boolean): string | null {
  return LABEL_REQUIRED_REFUSALS.find(([selector]) => within(selector))?.[1] ?? null;
}

/** Why typing into a written value is refused. */
export const uneditableRefusalFor = (fromData: boolean): string => (fromData ? REFUSE_FROM_DATA : REFUSE_PAGE_WRITTEN);

/** The hover label of an atom inside words: what it is, or null for words. */
export function describeUneditableKind(atom: { written: boolean; fromData: boolean; control: boolean }): string | null {
  if (atom.written) return atom.fromData ? 'From the data' : 'Written by the page';
  return atom.control ? 'Part of the page’s controls' : null;
}

export const CLICK_IN_TEXT_FIRST = 'Click in the text first.';
export const LINK_CANT_HOLD_WRITTEN = 'A link can’t include what the page writes.';
export const SELECT_TEXT_FIRST = 'Select some text first.';
export const LINK_URL_HINT = 'Enter an http:// or https:// address';

export const EDIT_GROUP_LABEL = 'Page, editing';
export const DRAG_TO_MOVE = 'Drag to move';
export const MORE_ACTIONS = 'More actions';
export const MOVE_CARD_EARLIER = 'Move card earlier';
export const MOVE_CARD_LATER = 'Move card later';
export const DELETE_CARD = 'Delete card';
export const DELETE_LABEL = 'Delete';
export const SELECTION_ACTIONS = 'Selection actions';
export const BOLD_LABEL = 'Bold';
export const ITALIC_LABEL = 'Italic';
export const LINK_LABEL = 'Link';
export const LINK_URL_LABEL = 'Link URL';
export const OPEN_LINK_LABEL = 'Open link';
export const REMOVE_LINK_LABEL = 'Remove link';
export const REMOVE_LINK_TIP = 'Remove the link';
export const CANCEL_LINK_LABEL = 'Cancel link';
export const CANCEL_LINK_TIP = 'Cancel (Esc)';
export const EDIT_PILL_LABEL = 'Edit';
export const EDIT_PILL_TITLE = 'Edit the page';
export const SOURCE_INSPECT_LABEL = 'See where this comes from';

/** "Revenue card moved earlier." and the like, for the live region. */
export const cardMovedMessage = (name: string, how: 'moved' | 'earlier' | 'later' | 'deleted'): string =>
  how === 'moved' ? `${name} moved.` : how === 'deleted' ? `${name} deleted.` : `${name} moved ${how}.`;

/** "Bold (⌘B)". */
export const withShortcut = (name: string, shortcut: string): string => `${name} (${shortcut})`;
