import type { Dynamic } from '../dynamic.ts';
import { isFormulaCell } from '../model/workbook.ts';
import { isCheckboxCell } from '../chips/checkboxes.ts';
import { activeAnchorCell, isSameCell } from '../selection/model.ts';
import { cleanEnteredCellText } from '../format/shown-text.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { timeOfDayFraction, timesTypedAs, timesFrom, shownTimeIn, secondsOfTime, timeTypedAs, shownTimeFor } from '../chips/time-of-day.ts';
import { withEntryText } from './text-looks.ts';
import { isDropdownListOutOfPlace } from '../chips/dropdown-sync.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function isTimeCell(reads: WorkbookReads, cell?: Dynamic) {
  let { numberFormat: numberFormat, cellControl: cellControl } = reads.formatOf(cell);
  return numberFormat.kind === 'time' && cellControl.kind !== 'dropdown' && !isFormulaCell(reads, cell) && !isCheckboxCell(reads, cell);
}
export function typedTimeText(state: PageState, reads: WorkbookReads) {
  let { mode: mode } = state;
  if (mode.kind !== 'editing' || !isTimeCell(reads, activeAnchorCell(state, reads))) return null;
  return mode.text === mode.textAtStart && (mode.isTypedOverCell !== true || mode.text === '') ? null : cleanEnteredCellText(mode.text);
}
export function timeInCell(reads: WorkbookReads, cell?: Dynamic) {
  let value = cellValueOf(reads.cellOf(cell));
  return value?.kind === 'number' ? timeOfDayFraction(value.value) : null;
}
export function timesForTyped({ mode: mode }: Dynamic, typed?: Dynamic, most?: Dynamic) {
  if (mode.kind !== 'editing' || mode.isTypedOverCell === true) return timesTypedAs(typed, most);
  let halfOfDayAtStart = / (AM|PM)$/.exec(mode.textAtStart)?.[1];
  if (halfOfDayAtStart === undefined) return timesTypedAs(typed, most);
  let isInSameHalf = ({ hour: hour }: Dynamic) => hour >= 12 === (halfOfDayAtStart === 'PM');
  let times = timesTypedAs(typed, 1 / 0);
  let timesInOtherHalf = times.filter((time?: Dynamic) => !isInSameHalf(time));
  return [...times.filter(isInSameHalf), ...timesInOtherHalf].slice(0, most);
}
export function timeListRows(state: PageState, reads: WorkbookReads) {
  let { mode: mode } = state;
  let cell = activeAnchorCell(state, reads);
  if (mode.kind !== 'editing' || mode.typingIn !== 'cell' || !isTimeCell(reads, cell)) return [];
  let typed = typedTimeText(state, reads);
  let times =
    typed === null
      ? timesFrom(timeInCell(reads, cell)?.time ?? DEFAULT_LIST_TIME, TIME_LIST_STEP_MINUTES, TIME_LIST_ROWS)
      : timesForTyped(state, typed, TIME_LIST_ROWS);
  let { pattern: pattern } = reads.formatOf(cell).numberFormat;
  let rows = times.map(
    (time?: Dynamic) => ({
      time: time,
      shown: shownTimeIn(reads, time, pattern),
    }),
  );
  return rows.filter(
    ({ shown: shown }: Dynamic, index?: Dynamic) => rows.findIndex((row?: Dynamic) => row.shown === shown) === index,
  );
}
export function openTimeList(state: PageState, reads: WorkbookReads) {
  let rows = timeListRows(state, reads);
  let [firstRow] = rows;
  if (firstRow === undefined)
    return state.timeList === null
      ? state
      : {
          ...state,
          timeList: null,
        };
  let cell = activeAnchorCell(state, reads);
  let typed = typedTimeText(state, reads);
  let highlighted = (typed === null ? timeInCell(reads, cell)?.isExact === true : !isDigitsOnly(typed))
    ? secondsOfTime(firstRow.time)
    : null;
  return {
    ...state,
    timeList: {
      cellId: cell,
      rows: rows,
      highlighted: highlighted,
      isChosen: false,
      pointedAt: null,
    },
  };
}
export function moveInTimeList(state: PageState, how?: Dynamic, stepTo?: Dynamic) {
  let { timeList: timeList } = state;
  if (timeList === null) return state;
  let { rows: rows } = timeList;
  let focusIndex = rows.findIndex(({ time: time }: Dynamic) => secondsOfTime(time) === timeListFocusOf(timeList));
  let row = rows[stepTo(focusIndex === -1 ? null : focusIndex, rows.length) ?? -1];
  if (row === undefined) return state;
  let timeKey = secondsOfTime(row.time);
  return {
    ...state,
    timeList:
      how === 'chosen'
        ? {
            ...timeList,
            highlighted: timeKey,
            isChosen: true,
            pointedAt: null,
          }
        : {
            ...timeList,
            pointedAt: timeKey,
          },
  };
}
export function takeTimeFromList(state: PageState, reads: WorkbookReads, how?: Dynamic) {
  let { mode: mode, timeList: timeList } = state;
  let stateShut =
    timeList === null
      ? state
      : {
          ...state,
          timeList: null,
        };
  if (mode.kind !== 'editing') return stateShut;
  let chosenKey = timeList?.isChosen === true ? timeList.highlighted : null;
  let takenKey = (how === 'key' ? timeList?.pointedAt : null) ?? chosenKey;
  let takenRow = timeList?.rows.find(({ time: time2 }: Dynamic) => secondsOfTime(time2) === takenKey);
  let typed = typedTimeText(state, reads);
  let cell = activeAnchorCell(state, reads);
  let timeAtStart =
    isTimeCell(reads, cell) && timeInCell(reads, cell)?.isExact === true && mode.textAtStart.includes(':') ? timeTypedAs(mode.textAtStart) : null;
  let typedTime = typed === null || isDigitsOnly(typed) ? null : (timesForTyped(state, typed, 1)[0] ?? null);
  let time = takenRow?.time ?? (typed === null ? timeAtStart : typedTime);
  if (time === null && timeAtStart === null) return stateShut;
  let { pattern: pattern } = reads.formatOf(cell).numberFormat;
  let shownTimeOf = (time2?: Dynamic) => (time2 === null ? null : shownTimeFor(reads, time2, pattern));
  let text = shownTimeOf(time) ?? mode.text;
  let textAtStart = shownTimeOf(timeAtStart) ?? mode.textAtStart;
  return {
    ...stateShut,
    mode: {
      ...withEntryText(mode, text),
      textAtStart: textAtStart,
    },
  };
}
export function keepTimeListInStep(stateBefore: Dynamic, state: PageState, reads: ReadsWithTextMeasurer) {
  let { timeList: timeList } = state;
  if (timeList === null) return state;
  let isOnSameCell = stateBefore.timeList !== null && isSameCell(stateBefore.timeList.cellId, timeList.cellId);
  let isOnlyScrolled =
    state.gridHeight === stateBefore.gridHeight &&
    state.gridWidth === stateBefore.gridWidth &&
    state.heightUnderWhatFloats === stateBefore.heightUnderWhatFloats &&
    (state.scrollTop !== stateBefore.scrollTop || state.scrollLeft !== stateBefore.scrollLeft);
  let rows = timeListRows(state, reads);
  if (
    !(
      isSameCell(timeList.cellId, activeAnchorCell(state, reads)) &&
      !(isOnSameCell && isOnlyScrolled) &&
      !isDropdownListOutOfPlace(state, reads, state) &&
      state.menu === null &&
      state.peopleList === null &&
      state.dragging?.kind !== 'resizing' &&
      rows.length > 0
    )
  )
    return {
      ...state,
      timeList: null,
    };
  if (rows.length === timeList.rows.length && rows.every((row?: Dynamic, index?: Dynamic) => isSameTimeRow(row, timeList.rows[index])))
    return state;
  return timeList.isChosen && rows.some(({ time: time }: Dynamic) => secondsOfTime(time) === timeList.highlighted)
    ? {
        ...state,
        timeList: {
          ...timeList,
          rows: rows,
          pointedAt: null,
        },
      }
    : openTimeList(state, reads);
}
export const TIME_LIST_ROWS = 5;
export const TIME_LIST_STEP_MINUTES = 30;
export const DEFAULT_LIST_TIME = {
  hour: 9,
  minute: 0,
  second: 0,
};
export const timeListFocusOf = ({ pointedAt: pointedAt, highlighted: highlighted }: Dynamic) => pointedAt ?? highlighted;
export const isDigitsOnly = (text?: Dynamic) => /^\d+$/u.test(text.trim());
export const isSameTimeRow = (row?: Dynamic, otherRow?: Dynamic) =>
  row.shown === otherRow?.shown && secondsOfTime(row.time) === secondsOfTime(otherRow.time);
