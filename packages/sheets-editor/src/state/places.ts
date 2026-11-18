import type { IdRun, Reference, SheetId } from '@open-artifact/sheets-core';
import type { CellId, WorkbookReads } from '../model/workbook.ts';
import type { CellArea, CellSelection, RangeWalked } from '../selection/model.ts';
import type { SavedPlace } from './initial-state.ts';
import { findSheetById } from '../grid/layout.ts';
import { leadingRunCount, collapsedIndexRuns } from '../grid/line-runs.ts';
import { selectionAtCell, isSameCell, selectionAreaAndKind } from '../selection/model.ts';
/** Where the page stands on a sheet: the selection and how far the grid is scrolled. */
export interface Place {
  sheetId: SheetId;
  activeCell: CellId;
  selectionCorner: CellId;
  rangeWalked?: RangeWalked | null;
  scrollLeft: number;
  scrollTop: number;
}
/** A place with the whole selection told, as a sheet opens on it. */
export type PlaceAtCell = Place & CellSelection;
/** A place kept as it was left, without the fingerprint of the lines its selection took. */
export type PlaceRestored = Place | Omit<SavedPlace, 'lines'>;
/** How many formulas of other sheets read a sheet, and the names of those sheets. */
export interface FormulasReadingSheet {
  count: number;
  sheetNames: [string, ...string[]];
}
export function formulasReadingSheet(workbook: WorkbookReads, sheetId: SheetId): FormulasReadingSheet | null {
  let readsSheet = (reference: Reference) =>
    reference.sheetId === sheetId &&
    (reference.kind !== 'cell' ||
      (workbook.rowIndexOf(sheetId, reference.cell.r) !== null && workbook.columnIndexOf(sheetId, reference.cell.c) !== null));
  let formulaCount: number = 0;
  let sheetNames: string[] = [];
  for (let { sheetId: otherSheetId, name: otherSheetName } of workbook.listSheets()) {
    if (otherSheetId === sheetId) continue;
    let countBefore = formulaCount;
    for (let row of workbook.cellsHeldByRow(otherSheetId).values())
      for (let { input: input } of row.values())
        if (input.kind === 'formula' && input.formula.references.some(readsSheet)) formulaCount += 1;
    if (formulaCount > countBefore) sheetNames.push(otherSheetName);
  }
  let [firstName, ...otherNames] = sheetNames;
  return firstName === undefined
    ? null
    : {
        count: formulaCount,
        sheetNames: [firstName, ...otherNames],
      };
}
export function firstPlaceInSheet(workbook: WorkbookReads, sheetId: SheetId): PlaceAtCell | null {
  let sheet = findSheetById(workbook, sheetId);
  let firstCell = workbook.cellIdAt(
    sheetId,
    leadingRunCount(collapsedIndexRuns(sheet?.rowGroups ?? [])),
    leadingRunCount(collapsedIndexRuns(sheet?.columnGroups ?? [])),
  );
  return firstCell === null
    ? null
    : {
        sheetId: sheetId,
        ...selectionAtCell(firstCell),
        scrollLeft: 0,
        scrollTop: 0,
      };
}
export function firstPlaceInWorkbook(workbook: WorkbookReads): PlaceAtCell | null {
  for (let { sheetId: sheetId } of workbook.listSheets()) {
    let place = firstPlaceInSheet(workbook, sheetId);
    if (place !== null) return place;
  }
  return null;
}
export function fingerprintLineRuns(runs: readonly IdRun[]): string {
  let merged: IdRun[] = [];
  for (let run of runs) {
    let lastRun = merged.at(-1);
    if (lastRun !== undefined && lastRun.base === run.base && lastRun.first + lastRun.count === run.first)
      merged[merged.length - 1] = {
        ...lastRun,
        count: lastRun.count + run.count,
      };
    else merged.push(run);
  }
  let [hash, lineCount]: [number, number] = [2166136261, 0];
  for (let { base: base, first: first, count: count } of merged) {
    lineCount += count;
    let key = `${base}.${first}+${count};`;
    for (let index: number = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  }
  return `${lineCount}:${(hash >>> 0).toString(36)}`;
}
export function selectionLinesFingerprint(selectionState: Pick<CellSelection, 'activeCell' | 'selectionCorner'>, workbook: WorkbookReads): string | null {
  if (isSameCell(selectionState.activeCell, selectionState.selectionCorner)) return null;
  let area: CellArea | undefined = selectionAreaAndKind(selectionState, workbook)?.area;
  let lines = workbook.linesOf(selectionState.activeCell.sheetId);
  if (area === undefined || lines === null) return null;
  let rowRuns = lines.rows.runsIn({
    firstIndex: area.topRowIndex,
    count: area.rowCount,
  });
  let columnRuns = lines.columns.runsIn({
    firstIndex: area.leftColumnIndex,
    count: area.columnCount,
  });
  return `${fingerprintLineRuns(rowRuns)} ${fingerprintLineRuns(columnRuns)}`;
}
export function restoredPlace(workbook: WorkbookReads, place: SavedPlace | null): PlaceRestored | null {
  if (place === null) return firstPlaceInWorkbook(workbook);
  let { lines: lines, ...placeWithoutLines } = place;
  if (workbook.positionOfCell(placeWithoutLines.activeCell) === null)
    return firstPlaceInSheet(workbook, placeWithoutLines.sheetId) ?? firstPlaceInWorkbook(workbook);
  return lines !== null && lines === selectionLinesFingerprint(placeWithoutLines, workbook)
    ? placeWithoutLines
    : {
        ...placeWithoutLines,
        ...selectionAtCell(placeWithoutLines.activeCell),
      };
}
