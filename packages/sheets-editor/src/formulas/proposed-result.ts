import type { Dynamic } from '../dynamic.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { cellShownText } from '../clipboard/text-escaping.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function proposedFormulaResult(reads: WorkbookReads, cellId?: Dynamic, formula?: Dynamic) {
  if (reads.calculationTookTooLong) return 'ranOutOfTime';
  let proposed = reads.proposedFormulaValue(cellId, formula);
  if (proposed === null) return null;
  let value = cellValueOf(proposed.cell);
  if (value?.kind === 'error') return value.value === '#TIMEOUT!' ? 'ranOutOfTime' : 'error';
  return {
    shown: cellShownText(proposed.cell, reads.decimalSign),
    text: value?.kind === 'text' ? value.value : null,
    ...(value !== null && {
      result: value,
    }),
    ...(value?.kind === 'boolean' && {
      isTrueOrFalse: true,
    }),
    ...(proposed.cell?.spill !== undefined && {
      fillsOtherCells: true,
    }),
    ...(proposed.cell?.spill?.kind === 'fills' && {
      fillsTo: proposed.cell.spill.to,
    }),
  };
}
