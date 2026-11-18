import type { Dynamic } from '../dynamic.ts';
export function dropLastGrapheme(text?: Dynamic) {
  let lastGrapheme = [...new (Intl.Segmenter as Dynamic)().segment(text)].at(-1);
  return lastGrapheme === undefined ? text : text.slice(0, lastGrapheme.index);
}
export function entryTextAfterKey(text?: Dynamic, keyPress?: Dynamic) {
  if (keyPress.isModifierHeld) return null;
  if (keyPress.key.length === String.fromCodePoint(keyPress.key.codePointAt(0) ?? 0).length) return text + keyPress.key;
  if (keyPress.isAltHeld) return null;
  if (keyPress.key === 'Backspace') return dropLastGrapheme(text);
  return KEYS_THAT_KEEP_ENTRY_TEXT.has(keyPress.key) ? text : null;
}
export const BLANK_AND_FORMULA_ENTRY_MODES = ['', '=A1'].map(
  (text?: Dynamic) => ({
    kind: 'editing',
    text: text,
    textAtStart: '',
    typingIn: 'cell',
  }),
);
export const KEYS_THAT_KEEP_ENTRY_TEXT = new (Set as Dynamic)(['Delete', 'End', 'ArrowRight', 'F4']);
