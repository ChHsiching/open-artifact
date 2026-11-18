import type { Dynamic } from '../dynamic.ts';
import { translateMessage } from './messages.ts';
export function copiedSheetNameAffixes() {
  let [beforeName = '', afterName = ''] = copiedSheetName(SHEET_NAME_PLACEHOLDER).split(SHEET_NAME_PLACEHOLDER);
  return {
    beforeName: beforeName,
    afterName: afterName,
  };
}
export const defaultSheetName = () =>
  translateMessage({
    defaultMessage: 'Sheet',
    id: '5oHo/izHhB',
  });
export const copiedSheetName = (sheetName?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{name} (copy)',
      id: 'T5o8lrUVTN',
    },
    {
      name: sheetName,
    },
  );
export const SHEET_NAME_PLACEHOLDER = '\x00';
