import type { Dynamic } from '../dynamic.ts';
import { cellValueOf } from '../model/cell-values.ts';
export const isCheckboxFormat = ({ cellControl: cellControl }: Dynamic) => cellControl?.kind === 'checkbox';
export const isCheckboxCell = (sheet?: Dynamic, cellId?: Dynamic) =>
  isCheckboxFormat(sheet.formatOf(cellId)) && cellValueOf(sheet.cellOf(cellId))?.kind === 'boolean';
export const isShownCheckboxCell = (sheet?: Dynamic, cellId?: Dynamic) =>
  isCheckboxFormat(sheet.formatOf(cellId)) && cellValueOf(sheet.cellOnShowIn(cellId))?.kind === 'boolean';
export const CHECKBOX_FORMAT = {
  cellControl: {
    kind: 'checkbox',
  },
};
