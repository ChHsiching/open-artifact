import type { Dynamic } from '../dynamic.ts';
import { shortcutKeysFor } from './shortcut-list.ts';
export function latinKeyOf(
  { key: key, code: code, altKey: isAltHeld, shiftKey: isShiftHeld, ctrlKey: isCtrlHeld }: Dynamic,
  isShortcut?: Dynamic,
) {
  if (!isShortcut || isAltHeld) return key;
  let letter = KEY_LETTER_CODE_PATTERN.exec(code)?.[1];
  if (letter !== undefined && !isAsciiKey(key)) return letter.toLowerCase();
  if (code === 'Semicolon' && !isAsciiKey(key)) return ';';
  if (code === 'Backquote' && (!isAsciiKey(key) || key === 'Dead')) return '`';
  let digit = isShiftHeld && !SIGN_KEY_PATTERN.test(key) ? DIGIT_CODE_PATTERN.exec(code)?.[1] : undefined;
  if (digit === undefined) return key;
  return isCtrlHeld ? digit : code;
}
export function signOfMacAltKey(key?: Dynamic, code?: Dynamic, keyCode?: Dynamic) {
  return (code === 'Equal' ? key === '=' || key === '≠' : code === 'Minus' && (key === '-' || key === '–')) ? (KEY_CODE_SIGNS[keyCode] ?? '') : '';
}
export function altCommandKeyOf(event?: Dynamic, isMac?: Dynamic) {
  let { key: key, code: code, keyCode: keyCode, altKey: isAltHeld, shiftKey: isShiftHeld, ctrlKey: isCtrlHeld, metaKey: isMetaHeld } = event;
  if (!isAltHeld || isMetaHeld !== isMac || isCtrlHeld === isMac) return null;
  if (isMac ? isShiftHeld : event.getModifierState('AltGraph') || NUMPAD_CODE_PATTERN.test(code)) return null;
  if (key === 'Enter') return key;
  let commandKey = isMac ? signOfMacAltKey(key, code, keyCode) : key;
  return isAltCommandKey(commandKey) ? commandKey : null;
}
export function readKeyPress(event?: Dynamic, isMac?: Dynamic) {
  let { key: key, code: code, altKey: isAltKeyHeld, shiftKey: isShiftHeld, ctrlKey: isCtrlHeld, repeat: isRepeat } = event;
  let altCommandKey = altCommandKeyOf(event, isMac);
  if (altCommandKey !== null)
    return {
      key: altCommandKey,
      isShiftHeld: isShiftHeld,
      isModifierHeld: true,
      isAltHeld: true,
      isRepeat: isRepeat,
    };
  let isCommand = isCommandHeld(event);
  let isAltHeld = isAltKeyHeld && !isCtrlHeld && !(isMac && key === '=');
  let latinKey = latinKeyOf(event, isCommand);
  return {
    key: isCommand && isAltHeld && isAltCommandKey(latinKey) ? code : latinKey,
    isShiftHeld: isShiftHeld,
    isModifierHeld: isCommand,
    isAltHeld: isAltHeld,
    isRepeat: isRepeat,
  };
}
export function isFillDownOrRightKey(event?: Dynamic, isMac?: Dynamic) {
  let isCommand = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey;
  let hasNoOtherModifier = !event.shiftKey && !event.altKey;
  return isCommand && hasNoOtherModifier && ['d', 'r'].includes(latinKeyOf(event, true).toLowerCase());
}
export function isBrowserReservedKey(event?: Dynamic) {
  if (/^F(?:5|11|12)$/.test(event.key)) return event.key !== 'F11' || !event.shiftKey;
  let latinKey = latinKeyOf(event, true);
  return (event.ctrlKey || event.metaKey) && (/^[tnwq]$/i.test(latinKey) || (event.shiftKey && /^r$/i.test(latinKey)) || isZoomKey(event));
}
export const ALT_COMMAND_ACTS = ['insertRowsOrColumns', 'deleteRowsOrColumns', 'clearFormatting', 'addSheet'];
export const shortcutFor = (act?: Dynamic) => shortcutKeysFor(act);
export const ALT_COMMAND_SHORTCUTS = ALT_COMMAND_ACTS.map((act?: Dynamic) => {
  let parts = shortcutFor(act).split('+');
  let key = parts.at(-1) ?? '';
  return {
    act: act,
    key: /^f\d+$/.test(key) ? key.toUpperCase() : key,
    isWithCommand: parts.includes('cmd'),
    isWithAlt: parts.includes('alt'),
    isWithShift: parts.includes('shift'),
  };
});
export const isAltCommandKey = (key?: Dynamic) =>
  ALT_COMMAND_SHORTCUTS.some((shortcut?: Dynamic) => shortcut.isWithCommand && shortcut.isWithAlt && shortcut.key === key);
export const altCommandActOf = ({
  key: key,
  isShiftHeld: isShiftHeld,
  isModifierHeld: isModifierHeld,
  isAltHeld: isAltHeld,
}: Dynamic) =>
  ALT_COMMAND_SHORTCUTS.find(
    (shortcut?: Dynamic) =>
      shortcut.key === key &&
      shortcut.isWithCommand === isModifierHeld &&
      shortcut.isWithAlt === isAltHeld &&
      ((isModifierHeld && isAltHeld) || shortcut.isWithShift === isShiftHeld),
  )?.act ?? null;
export const KEY_LETTER_CODE_PATTERN = /^Key([A-Z])$/;
export const DIGIT_CODE_PATTERN = /^Digit([0-9])$/;
export const NUMPAD_CODE_PATTERN = /^Numpad/;
export const SIGN_KEY_PATTERN = /^[-+=]$/;
export const isAsciiKey = (key?: Dynamic) => (key.codePointAt(0) ?? 0) < 128;
export const KEY_CODE_SIGNS = {
  187: '=',
  61: '=',
  171: '=',
  189: '-',
  173: '-',
};
export const isCommandHeld = ({ ctrlKey: ctrlKey, altKey: altKey, metaKey: metaKey }: Dynamic) => metaKey || (ctrlKey && !altKey);
export const isTypingKey = (event?: Dynamic, allowsAlt?: Dynamic) =>
  event.key.length === 1 && !isCommandHeld(event) && (allowsAlt || !event.altKey || event.getModifierState('AltGraph'));
export const isAltCommandPress = ({ key: key, isModifierHeld: isModifierHeld, isAltHeld: isAltHeld }: Dynamic, isMac?: Dynamic) =>
  isMac && isModifierHeld && isAltHeld && isAltCommandKey(key);
export const isZoomKey = ({ key: key, code: code, altKey: altKey }: Dynamic) =>
  !altKey && (/^[-+=_0]$/.test(key) || (/^(?:Minus|Equal|Digit0)$/.test(code) && !isAsciiKey(key)));
