import type { Dynamic } from '../dynamic.ts';
export const FORMAT_MENUS_KEEPING_ENTRY_SELECTION = new (Set as Dynamic)([
  'fontSize',
  'align',
  'textWrapping',
  'numberFormat',
  'textColor',
  'fillColor',
  'borders',
]);
export const isFormatMenuKeepingEntrySelection = (menuName?: Dynamic) => FORMAT_MENUS_KEEPING_ENTRY_SELECTION.has(menuName);
export const isFormatChoiceKeepingEntrySelection = (choice?: Dynamic) =>
  !('toggle' in choice) && !('checkbox' in choice) && !('dateToPick' in choice) && !('removesDropdown' in choice);
