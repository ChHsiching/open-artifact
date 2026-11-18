import type { PageState } from './initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import { findSheetById } from '../grid/layout.ts';
import { mergedAreaOrCellOf, selectedArea, isSameArea } from '../selection/model.ts';
import { hasOtherRanges } from '../selection/several-ranges.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
export function ownCellLostNotice(stateBefore: PageState, readsBefore: WorkbookReads, state: PageState, reads: WorkbookReads): OwnCellLost | null {
  if (stateBefore.mode.kind !== 'navigating') return null;
  if (findSheetById(reads, stateBefore.sheetId) === undefined) {
    let sheetName = findSheetById(reads, state.sheetId)?.name;
    return sheetName === undefined
      ? null
      : {
          what: 'ownSheetRemoved',
          name: sheetName,
        };
  }
  let areaBefore = mergedAreaOrCellOf(readsBefore, stateBefore.activeCell);
  let area = mergedAreaOrCellOf(reads, state.activeCell);
  let areaSelected = selectedArea(state, reads);
  if (state.sheetId !== stateBefore.sheetId || areaBefore === null || area === null || areaSelected === null) return null;
  if (hasOtherRanges(state) || !isSameArea(area, areaSelected)) return null;
  let cellAddress = areaToA1AsStored(
    {
      ...area,
      rowCount: 1,
      columnCount: 1,
    },
    ownRowOrderOfSheet(reads, state.sheetId),
  );
  if (reads.positionOfCell(stateBefore.activeCell) === null)
    return {
      what: 'ownCellRemoved',
      cell: cellAddress,
    };
  return areaBefore.topRowIndex === area.topRowIndex && areaBefore.leftColumnIndex === area.leftColumnIndex
    ? null
    : {
        what: 'ownCellMoved',
        cell: cellAddress,
      };
}
/** What was done last when the page's own cell went away under an edit not asked for here: told to screen readers. */
export type OwnCellLost =
  | { what: 'ownSheetRemoved'; name: string }
  | { what: 'ownCellRemoved' | 'ownCellMoved'; cell: string };
