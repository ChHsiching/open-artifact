import type { SheetId } from '@open-artifact/sheets-core';
import type { PageState } from './initial-state.ts';
import type { CellId, WorkbookReads } from '../model/workbook.ts';
import type { CellArea } from '../selection/model.ts';
import { nonEmptyValueOfCell, DATE_TIME_FORMAT_KINDS, sumFigures } from '../selection/figures.ts';
import { numberFormatOfCell } from '../model/workbook.ts';
import { isGeneralPattern } from '../model/cell-format.ts';
import { isSameCell, mergedAreaOrCellOf, isSameArea, isSameSelection } from '../selection/model.ts';
import { areasOfAllRanges, coveredCellCount } from '../selection/several-ranges.ts';
import { shownPiecesOfArea, makeIsCellFilteredOut } from '../tables/filtered-rows.ts';
export function figuresOfShownCells(
  reads: WorkbookReads,
  sheetId: SheetId,
  ranges: readonly CellArea[],
  isLeftOut: (cell: CellId) => boolean,
): Figures | null {
  let seenCells = ranges.length > 1 ? new Set<string>() : null;
  let numbers: number[] = [];
  let count: number = 0;
  let pattern: string | null = null;
  let value: boolean = true;
  for (let item of ranges)
    for (let value5 of reads.cellsOnShowIn(sheetId, item)) {
      let nonEmptyValueOfCell2 = nonEmptyValueOfCell(reads, value5);
      if (nonEmptyValueOfCell2 === null || isLeftOut(value5)) continue;
      let value6 = seenCells === null ? '' : `${value5.rowId} ${value5.columnId}`;
      if (seenCells?.has(value6) === true) continue;
      seenCells?.add(value6);
      count += 1;
      if (nonEmptyValueOfCell2.kind !== 'number') continue;
      let numberFormatOfCell2 = numberFormatOfCell(reads, value5);
      if (DATE_TIME_FORMAT_KINDS.has(numberFormatOfCell2.kind)) continue;
      pattern = numbers.length === 0 || pattern === numberFormatOfCell2.pattern ? numberFormatOfCell2.pattern : null;
      value &&= isGeneralPattern(numberFormatOfCell2.pattern);
      numbers.push(nonEmptyValueOfCell2.value);
    }
  if (count === 0) return null;
  let state: FiguresOfCount = {
    count: {
      value: count,
      written: null,
    },
  };
  let value2 = numbers.length === 0 ? null : sumFigures(numbers, value);
  if (value2 === null) return state;
  let value3 = value ? null : pattern;
  let value4 = (figureValue: number, valueWritten: number = figureValue): Figure => {
    let value5 =
      value3 === null
        ? null
        : reads.shownWithRoomForAll(
            {
              kind: 'number',
              value: valueWritten,
            },
            value3,
          );
    return {
      value: figureValue,
      written: value5 === '' ? null : value5,
    };
  };
  return {
    sum: value4(value2.sum),
    average: value4(value2.average, value2.sum / numbers.length),
    min: value4(value2.min),
    max: value4(value2.max),
    ...state,
  };
}
export function updateFiguresOfSelection(stateBefore: PageState | null, state: PageState, reads: WorkbookReads, isDue: boolean): PageState {
  let figuresOfSelection2 = state.figuresOfSelection;
  let value =
    stateBefore !== null &&
    state.workbookChangeCount === stateBefore.workbookChangeCount &&
    state.formulasWorkedOutCount === stateBefore.formulasWorkedOutCount;
  if (
    (stateBefore !== null &&
      value &&
      state.sheetId === stateBefore.sheetId &&
      state.mode.kind === stateBefore.mode.kind &&
      isSameCell(state.activeCell, stateBefore.activeCell) &&
      isSameCell(state.selectionCorner, stateBefore.selectionCorner) &&
      state.rangeWalked === stateBefore.rangeWalked &&
      state.otherRanges === stateBefore.otherRanges &&
      state.rowsOutOfViewByOwnFilters === stateBefore.rowsOutOfViewByOwnFilters &&
      !(isDue && figuresOfSelection2.areDue)) ||
    state.mode.kind === 'editing'
  )
    return state;
  let value2 = (nextFigures: FiguresOfSelection): PageState =>
    nextFigures === figuresOfSelection2
      ? state
      : {
          ...state,
          figuresOfSelection: nextFigures,
        };
  let areasOfAllRanges2 = areasOfAllRanges(state, reads);
  let [firstArea] = areasOfAllRanges2;
  let mergedAreaOrCellOf2 = mergedAreaOrCellOf(reads, state.activeCell);
  let value3 =
    areasOfAllRanges2.length === 1 && firstArea !== undefined && mergedAreaOrCellOf2 !== null && isSameArea(firstArea, mergedAreaOrCellOf2);
  let coveredCellCount2 = coveredCellCount(areasOfAllRanges2);
  if (coveredCellCount2 < 2 || value3 || coveredCellCount2 > MAX_CELLS_FIGURED) return value2(NO_FIGURES_OF_SELECTION);
  let value4 = [
    state.sheetId,
    ...areasOfAllRanges2.flatMap(
      (area) => shownPiecesOfArea(state, reads, area).map((piece: CellArea) => Object.values(piece).join(',')),
    ),
  ].join(' ');
  let value5 = `${state.workbookChangeCount} ${state.formulasWorkedOutCount}`;
  let value6 = value ? value4 === figuresOfSelection2.ofCells : stateBefore !== null && isSameSelection(stateBefore, state);
  if (value6 && value5 === figuresOfSelection2.ofWorkbook && !figuresOfSelection2.areDue) return state;
  if (!isDue && coveredCellCount2 > MAX_CELLS_FIGURED_AT_ONCE) {
    if (value6 && figuresOfSelection2.areDue) return state;
    return value2({
      ...figuresOfSelection2,
      figures: value6 ? figuresOfSelection2.figures : null,
      areDue: true,
      ofCells: value4,
    });
  }
  let value7 = figuresOfShownCells(reads, state.sheetId, areasOfAllRanges2, makeIsCellFilteredOut(state, reads));
  return value2({
    figures: value7,
    areDue: false,
    ofCells: value4,
    ofWorkbook: value5,
  });
}
export const MAX_CELLS_FIGURED_AT_ONCE = 5000;
export const MAX_CELLS_FIGURED = 500000;
export const NO_FIGURES_OF_SELECTION: FiguresOfSelection = {
  figures: null,
  areDue: false,
  ofCells: '',
  ofWorkbook: '',
};
export interface Figure {
  value: number;
  written: string | null;
}
export interface CountFigure {
  value: number;
  written: null;
}
export interface FiguresOfCount {
  count: CountFigure;
}
export interface FiguresOfNumbers extends FiguresOfCount {
  sum: Figure;
  average: Figure;
  min: Figure;
  max: Figure;
}
export type Figures = FiguresOfCount | FiguresOfNumbers;
export interface FiguresOfSelection {
  figures: Figures | null;
  areDue: boolean;
  ofCells: string;
  ofWorkbook: string;
}
