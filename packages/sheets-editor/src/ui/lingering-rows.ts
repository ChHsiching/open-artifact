import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { OFF_SCREEN_TOP } from '../view/page-view.ts';
export function lingeringStillDue(lingering: Dynamic, { rows: rows, pagesTurned: pagesTurned, isTimeUp: isTimeUp }: Dynamic) {
  let offScreenRows = offScreenRowsByKey(rows);
  let kept = lingering.filter(
    ({ row: row, leftAt: leftAt, saidOfActiveCell: saidOfActiveCell }: Dynamic) =>
      (!isTimeUp && pagesTurned - leftAt < LINGER_PAGE_TURNS) ||
      (saidOfActiveCell !== null && saidOfActiveCell === cellsSignatureOf(offScreenRows.get(row.key))),
  );
  return kept.length === lingering.length ? lingering : kept;
}
export function lingeringAfterTimeUp(state?: Dynamic) {
  let offScreenRows = offScreenRowsByKey(state.rows);
  return {
    ...state,
    isTimeUp: true,
    lingering: lingeringStillDue(state.lingering, {
      ...state,
      isTimeUp: true,
    }).map(({ row: row, leftAt: leftAt, saidOfActiveCell: saidOfActiveCell }: Dynamic) => {
      let keysStillDrawn = offScreenRows.get(row.key)?.cells.map(({ key: key }: Dynamic) => key) ?? [];
      let cellsStillDrawn = row.cells.filter(({ key: key }: Dynamic) => keysStillDrawn.includes(key));
      return {
        row: rowWithCells(row, cellsStillDrawn),
        leftAt: leftAt,
        saidOfActiveCell: saidOfActiveCell,
      };
    }),
  };
}
export function lingeringAfterRows(state: Dynamic, rows: Dynamic, pagesTurned: Dynamic) {
  if (rows === state.rows && pagesTurned === state.pagesTurned) return state;
  if (pagesTurned === state.pagesTurned) {
    if (state.lingering.length === 0)
      return {
        ...state,
        rows: rows,
      };
    return rowsOnScreenSignature(rows) === rowsOnScreenSignature(state.rows)
      ? {
          ...state,
          rows: rows,
          lingering: lingeringStillDue(state.lingering, {
            ...state,
            rows: rows,
          }),
        }
      : {
          ...state,
          rows: rows,
          lingering: [],
        };
  }
  let keysOnScreen = new Set(rows.filter(isRowOnScreen).map(({ key: key }: Dynamic) => key));
  let offScreenRows = offScreenRowsByKey(rows);
  let next = {
    rows: rows,
    pagesTurned: pagesTurned,
    isTimeUp: false,
  };
  let justLeft = state.rows.filter(isRowOnScreen).map(
    (row?: Dynamic) => ({
      row: rowMovedOffScreen(row),
      leftAt: pagesTurned,
      saidOfActiveCell: cellsSignatureOf(offScreenRows.get(row.key)),
    }),
  );
  return {
    ...next,
    lingering: lingeringStillDue([...state.lingering, ...justLeft], next).filter(({ row: row }: Dynamic) => !keysOnScreen.has(row.key)),
  };
}
export function lingeringCellUpdated(cell: Dynamic, cellNow: Dynamic) {
  let isActive = cellNow !== undefined;
  let elementId = cellNow?.elementId ?? null;
  let isBehindBars = !isActive && cell.isBehindBars;
  return cell.isActive === isActive && cell.elementId === elementId && cell.isBehindBars === isBehindBars
    ? cell
    : {
        ...cell,
        isActive: isActive,
        elementId: elementId,
        isBehindBars: isBehindBars,
      };
}
export function rowsWithLingering({ rows: rows, lingering: lingering }: Dynamic) {
  if (lingering.length === 0) return rows;
  let offScreenRows = offScreenRowsByKey(rows);
  let lingeringRows = lingering.map(({ row: row }: Dynamic) => {
    let rowNow = offScreenRows.get(row.key);
    let cellNowOf = (cell?: Dynamic) => rowNow?.cells.find(({ key: key }: Dynamic) => key === cell.key);
    let cells = row.cells.map((cell?: Dynamic) => lingeringCellUpdated(cell, cellNowOf(cell)));
    if (rowNow === undefined) return rowWithCells(row, cells);
    let cellsOnlyNow = rowNow.cells.filter(
      ({ key: key }: Dynamic) => row.cells.every((cell?: Dynamic) => cell.key !== key),
    );
    return {
      ...row,
      isBehindBars: rowNow.isBehindBars,
      isNumberBehindBars: rowNow.isNumberBehindBars,
      cells:
        cellsOnlyNow.length === 0
          ? cells
          : [...cells, ...cellsOnlyNow].toSorted((a?: Dynamic, b?: Dynamic) => a.columnNumber - b.columnNumber),
    };
  });
  let lingeringKeys = new Set(lingeringRows.map(({ key: key }: Dynamic) => key));
  return [...rows.filter(({ key: key }: Dynamic) => !lingeringKeys.has(key)), ...lingeringRows].toSorted(
    (a?: Dynamic, b?: Dynamic) => a.rowNumber - b.rowNumber,
  );
}
export function useLingeringRows(rows: Dynamic, pagesTurned: Dynamic, isOn: Dynamic) {
  let [state, setState] = React.useState({
    rows: rows,
    pagesTurned: pagesTurned,
    lingering: [],
    isTimeUp: false,
  });
  let stateNow = isOn ? lingeringAfterRows(state, rows, pagesTurned) : state;
  if (stateNow !== state) setState(stateNow);
  let isLingering = stateNow.lingering.length > 0;
  React.useEffect(() => {
    if (!isLingering) return;
    let timer = setTimeout(
      () => setState((current?: Dynamic) => (current.pagesTurned === pagesTurned ? lingeringAfterTimeUp(current) : current)),
      LINGER_MS,
    );
    return () => clearTimeout(timer);
  }, [isLingering, pagesTurned]);
  return isOn ? rowsWithLingering(stateNow) : rows;
}
export const LINGER_MS = 1e4;
export const LINGER_PAGE_TURNS = 2;
export const isRowOnScreen = ({ top: top }: Dynamic) => top > OFF_SCREEN_TOP / 2;
export const rowMovedOffScreen = (row?: Dynamic) => ({
  ...row,
  top: OFF_SCREEN_TOP,
});
export const rowWithCells = (row?: Dynamic, cells?: Dynamic) => ({
  ...row,
  cells: cells,
});
export const rowsOnScreenSignature = (rows?: Dynamic) =>
  rows
    .filter(isRowOnScreen)
    .map(({ key: key, rowNumber: rowNumber }: Dynamic) => `${key} ${rowNumber}`)
    .join();
export const offScreenRowsByKey = (rows?: Dynamic) =>
  new Map(rows.filter((row?: Dynamic) => !isRowOnScreen(row)).map((row?: Dynamic) => [row.key, row]));
export const cellsSignatureOf = (row?: Dynamic) => (row === undefined ? null : JSON.stringify(row.cells));
