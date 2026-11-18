import type { Dynamic } from '../dynamic.ts';
import { isCheckboxFormat } from '../chips/checkboxes.ts';
import { booleanOfValue } from '../chips/checkbox-presses.ts';
import { cellValueOf, formulaTextOf } from '../model/cell-values.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function shownCellOf({ areFormulasShown: areFormulasShown }: Dynamic, reads: WorkbookReads, cellId?: Dynamic) {
  let cell = areFormulasShown ? reads.cellOf(cellId) : null;
  return cell?.input.kind === 'formula' ? cellWithFormulaShown(cell, reads.formatOf(cellId)) : reads.cellOnShowIn(cellId);
}
export const cellWithFormulaShown = (cell?: Dynamic, format?: Dynamic) =>
  cell?.input.kind === 'formula' && !(isCheckboxFormat(format) && booleanOfValue(cellValueOf(cell)) !== null)
    ? {
        input: {
          kind: 'text',
          value: formulaTextOf(cell),
        },
      }
    : cell;
export const toggleFormulasShown = (state: PageState) => ({
  ...state,
  areFormulasShown: !state.areFormulasShown,
  lastDone: {
    what: state.areFormulasShown ? 'resultsShown' : 'formulasShown',
  },
});
