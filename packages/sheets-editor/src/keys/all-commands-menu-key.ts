import type { Dynamic } from '../dynamic.ts';
import { jsx } from 'react/jsx-runtime';
import { useCoarseBarIconSize, BarIconButton } from '../ui/bar-buttons.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
export function allCommandsMenuKeyAction(press?: Dynamic) {
  if (press.isPointerCoarse || !press.canPersonEdit) return null;
  let isAllMenuOpen = press.menu?.holds === 'all' && press.menu.isOfContextBar !== true;
  if (!isAllMenuOpen && !press.isFromCells) return null;
  if (press.isRepeat) return 'nothing';
  return isAllMenuOpen ? 'shuts' : 'opens';
}
export function HideKeyboardButton({ onPressed: onPressed }: Dynamic) {
  return jsx('span', {
    className:
      'sheet-hide-keyboard -my-1 flex flex-none border-s border-divider py-1 ps-1 transition-opacity duration-base ease-out motion-reduce:transition-none starting:opacity-0',
    'data-size': useCoarseBarIconSize(),
    children: jsx(BarIconButton, {
      icon: 'Keyboard',
      label: sheetMessages.hideKeyboard(),
      tooltipSide: 'top',
      whyNot: null,
      onClick: onPressed,
    }),
  });
}
export const isAllCommandsMenuKey = (
  { key: key, code: code, shiftKey: shiftKey, altKey: altKey, metaKey: metaKey, ctrlKey: ctrlKey }: Dynamic,
  isMac?: Dynamic,
) => altKey && !shiftKey && !metaKey && !ctrlKey && (key === '/' || (isMac && key === '÷' && code === 'Slash'));
