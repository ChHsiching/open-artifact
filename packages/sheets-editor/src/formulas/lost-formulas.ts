import type { Dynamic } from '../dynamic.ts';
import { readsAsStored } from '../model/workbook.ts';
import { areaToA1AsStored } from './from-words/where.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { cellKeyOf } from './error-tells.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function actThatMayLoseFormulas(edit: Dynamic, workbook: WorkbookReads) {
  let word = WORD_OF_LINE_ACT[edit.kind];
  if (word !== undefined && 'sheetId' in edit)
    return {
      act: {
        kind: 'cellsKeepWhatTheyHold',
        sheetId: edit.sheetId,
      },
      word: word,
    };
  if (edit.kind !== 'sortRows' && edit.kind !== 'sortCells') return null;
  let sheetId = edit.kind === 'sortRows' ? edit.sheetId : edit.cells.sheetId;
  let sheet = workbook.listSheets().find((sheet2?: Dynamic) => sheet2.sheetId === sheetId);
  if (sheet === undefined) return null;
  let [oneRow = null, otherRow = null] = (
    edit.kind === 'sortRows' ? [edit.oneRow, edit.otherRow] : [edit.cells.oneCorner.r, edit.cells.otherCorner.r]
  ).map((rowId?: Dynamic) => workbook.rowIndexOf(sheetId, rowId));
  let columnIndexOf = (columnId?: Dynamic) => workbook.columnIndexOf(sheetId, columnId);
  let [oneColumn = null, otherColumn = null] =
    edit.kind === 'sortRows' ? [0, sheet.columnCount - 1] : [edit.cells.oneCorner.c, edit.cells.otherCorner.c].map(columnIndexOf);
  let keyColumns = [edit.byColumn, ...(edit.thenBy ?? []).map(({ byColumn: byColumn }: Dynamic) => byColumn)].map(columnIndexOf);
  let keyColumnIndexes = keyColumns.filter((columnIndex?: Dynamic) => columnIndex !== null);
  if (oneRow === null || otherRow === null) return null;
  if (oneColumn === null || otherColumn === null) return null;
  if (keyColumnIndexes.length < keyColumns.length) return null;
  let topRowIndex = Math.max(Math.min(oneRow, otherRow), sheet.frozenRowCount);
  let area = {
    topRowIndex: topRowIndex,
    leftColumnIndex: Math.min(oneColumn, otherColumn),
    rowCount: Math.max(oneRow, otherRow) - topRowIndex + 1,
    columnCount: Math.abs(oneColumn - otherColumn) + 1,
  };
  return {
    act: {
      kind: 'sorted',
      sheetId: sheetId,
      area: area,
      keyColumnIndexes: keyColumnIndexes,
    },
    word: 'sort',
  };
}
export function rowInputsKey(
  workbook: WorkbookReads,
  sheetId: Dynamic,
  { leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic,
  rowIndex?: Dynamic,
) {
  let inputs: Dynamic = [];
  for (let index: Dynamic = 0; index < columnCount; index += 1) {
    let cellId = workbook.cellIdAt(sheetId, rowIndex, leftColumnIndex + index);
    let input = cellId === null ? undefined : workbook.cellOf(cellId)?.input;
    inputs.push(input === undefined ? null : input.kind === 'formula' ? 'formula' : input);
  }
  return JSON.stringify(inputs);
}
export function sortSourceRowsById(before: Dynamic, after: Dynamic, { sheetId: sheetId, area: area }: Dynamic) {
  let sources = Array.from<Dynamic, Dynamic>(
    {
      length: area.rowCount,
    },
    (item?: Dynamic, offset?: Dynamic) => {
      let cellId = after.cellIdAt(sheetId, area.topRowIndex + offset, area.leftColumnIndex);
      let rowIndexBefore = cellId === null ? null : before.rowIndexOf(sheetId, cellId.rowId);
      return rowIndexBefore === null ? null : rowIndexBefore - area.topRowIndex;
    },
  );
  return sources.every((source?: Dynamic, offset?: Dynamic) => source === offset) ? null : sources;
}
export function sortSourceRows(before?: Dynamic, after?: Dynamic, sorted?: Dynamic) {
  let sourcesById = sortSourceRowsById(before, after, sorted);
  if (sourcesById !== null) return sourcesById;
  let { sheetId: sheetId, keyColumnIndexes: keyColumnIndexes } = sorted;
  let areaOnShow = before.areaOnShowIn(sheetId, sorted.area) ?? sorted.area;
  let { leftColumnIndex: leftColumnIndex, columnCount: columnCount } = areaOnShow;
  let area = {
    ...sorted.area,
    leftColumnIndex: leftColumnIndex,
    columnCount: columnCount,
  };
  let rowsByKey = new (Map as Dynamic)();
  for (let offset: Dynamic = 0; offset < area.rowCount; offset += 1) {
    let rowIndex = area.topRowIndex + offset;
    let key = rowInputsKey(before, sheetId, area, rowIndex);
    let isKeyPlain = keyColumnIndexes.every((columnIndex?: Dynamic) => {
      let cellId = before.cellIdAt(sheetId, rowIndex, columnIndex);
      return cellId !== null && before.cellOf(cellId)?.input.kind !== 'formula';
    });
    let entry = rowsByKey.get(key) ?? {
      rows: [],
      isOrderKept: true,
    };
    entry.rows.push(offset);
    entry.isOrderKept &&= isKeyPlain;
    rowsByKey.set(key, entry);
  }
  let takenByKey = new (Map as Dynamic)();
  return Array.from<Dynamic, Dynamic>(
    {
      length: area.rowCount,
    },
    (item?: Dynamic, offset?: Dynamic) => {
      let key = rowInputsKey(after, sheetId, area, area.topRowIndex + offset);
      let entry = rowsByKey.get(key);
      if (entry === undefined || (entry.rows.length > 1 && !entry.isOrderKept)) return null;
      let taken = takenByKey.get(key) ?? 0;
      takenByKey.set(key, taken + 1);
      return entry.rows[taken] ?? null;
    },
  );
}
export function formulasLostToSort(before?: Dynamic, after?: Dynamic, sorted?: Dynamic) {
  let { sheetId: sheetId, area: area } = sorted;
  let broken: Dynamic = [];
  let rowsBefore = before.cellsHeldByRow(sheetId);
  for (let [id, cellsOrRow] of after.cellsHeldByRow(sheetId) as Dynamic) {
    if (rowsBefore.get(id) === cellsOrRow) continue;
    for (let [column, cellOrSourceRow] of cellsOrRow as Dynamic) {
      if (!isFormulaWithRefError(cellOrSourceRow)) continue;
      let cellIdOrRowIndex = {
        sheetId: sheetId,
        rowId: id,
        columnId: column,
      };
      let positionOrSourceCellId = after.positionOfCell(cellIdOrRowIndex);
      if (positionOrSourceCellId === null) continue;
      let [rowOffsetOrSourceCell, columnOffsetOrFormula] = [
        positionOrSourceCellId.rowIndex - area.topRowIndex,
        positionOrSourceCellId.columnIndex - area.leftColumnIndex,
      ];
      if (
        rowOffsetOrSourceCell >= 0 &&
        rowOffsetOrSourceCell < area.rowCount &&
        columnOffsetOrFormula >= 0 &&
        columnOffsetOrFormula < area.columnCount
      )
        broken.push({
          cellId: cellIdOrRowIndex,
          row: rowOffsetOrSourceCell,
          columnIndex: positionOrSourceCellId.columnIndex,
        });
    }
  }
  let lost = new (Map as Dynamic)();
  if (broken.length === 0) return lost;
  let sources = sortSourceRows(before, after, sorted);
  for (let { cellId: id, row: cellsOrRow, columnIndex: column } of broken as Dynamic) {
    let cellOrSourceRow = sources[cellsOrRow] ?? null;
    if (cellOrSourceRow === null) continue;
    let cellIdOrRowIndex = area.topRowIndex + cellOrSourceRow;
    let positionOrSourceCellId = before.cellIdAt(sheetId, cellIdOrRowIndex, column);
    let rowOffsetOrSourceCell = positionOrSourceCellId === null ? null : before.cellOf(positionOrSourceCellId);
    let columnOffsetOrFormula = after.cellOf(id)?.formulaText ?? '';
    if (
      rowOffsetOrSourceCell?.formulaText !== undefined &&
      !isFormulaWithRefError(rowOffsetOrSourceCell) &&
      isSameFormulaShape(rowOffsetOrSourceCell.formulaText, columnOffsetOrFormula)
    )
      lost.set(id, {
        text: rowOffsetOrSourceCell.formulaText,
        input: rowOffsetOrSourceCell.input,
        cell: addressOfCellAt(cellIdOrRowIndex, column),
        cameTo: rowOffsetOrSourceCell.value ?? null,
      });
  }
  return lost;
}
export function formulasLostToLineEdit(before?: Dynamic, after?: Dynamic, sheetId?: Dynamic) {
  let lost = new (Map as Dynamic)();
  let rowsBefore = before.cellsHeldByRow(sheetId);
  for (let [rowId, cells] of after.cellsHeldByRow(sheetId) as Dynamic) {
    if (rowsBefore.get(rowId) === cells) continue;
    for (let [columnId, cell] of cells as Dynamic) {
      if (!isFormulaWithRefError(cell)) continue;
      let cellId = {
        sheetId: sheetId,
        rowId: rowId,
        columnId: columnId,
      };
      let cellBefore = before.cellOf(cellId);
      let positionBefore = before.positionOfCell(cellId);
      if (cellBefore?.formulaText !== undefined && positionBefore !== null && !isFormulaWithRefError(cellBefore))
        lost.set(cellId, {
          text: cellBefore.formulaText,
          input: cellBefore.input,
          cell: addressOfCellAt(positionBefore.rowIndex, positionBefore.columnIndex),
          cameTo: cellBefore.value ?? null,
        });
    }
  }
  return lost;
}
export function noteFormulasLostToLastAct(state: PageState, event: Dynamic, workbook: WorkbookReads) {
  if (event.kind !== 'editAnswered' || event.outcome.kind !== 'editQueued') return state;
  let { before: before } = event;
  let lost =
    before === undefined ? new (Map as Dynamic)() : formulasLostToAct(readsAsStored(before.reads), readsAsStored(workbook), before.act);
  if (before === undefined || lost.size === 0)
    return state.formulasLostToLastAct === null
      ? state
      : {
          ...state,
          formulasLostToLastAct: null,
        };
  let { act: act, word: word } = before;
  return {
    ...state,
    formulasLostToLastAct: {
      act: word,
      cells:
        act.kind === 'sorted' && event.edit.kind === 'sortCells' ? areaToA1AsStored(act.area, ownRowOrderOfSheet(workbook, state.sheetId)) : null,
      ...(event.edit.kind === 'deleteColumns' && {
        areColumnsDeleted: true,
      }),
      byCell: new (Map as Dynamic)([...lost].map(([cellId, formula]: Dynamic) => [cellKeyOf(cellId), formula])),
      atChangeCount: state.workbookChangeCount,
    },
  };
}
export const WORD_OF_LINE_ACT = {
  deleteRows: 'delete',
  deleteColumns: 'delete',
  moveRows: 'move',
  moveColumns: 'move',
};
export const LOST_REF_ERROR_TEXT = '#REF!';
export const isFormulaWithRefError = (cell?: Dynamic) =>
  cell?.input.kind === 'formula' && cell.formulaText?.includes(LOST_REF_ERROR_TEXT) === true;
export const REFERENCE_OR_REF_ERROR_PATTERN = /\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?|#REF!/g;
export const isSameFormulaShape = (formula?: Dynamic, otherFormula?: Dynamic) =>
  formula.replace(REFERENCE_OR_REF_ERROR_PATTERN, '@') === otherFormula.replace(REFERENCE_OR_REF_ERROR_PATTERN, '@');
export const addressOfCellAt = (rowIndex?: Dynamic, columnIndex?: Dynamic) =>
  areaToA1AsStored(
    {
      topRowIndex: rowIndex,
      leftColumnIndex: columnIndex,
      rowCount: 1,
      columnCount: 1,
    },
    null,
  );
export const formulasLostToAct = (before?: Dynamic, after?: Dynamic, act?: Dynamic) =>
  act.kind === 'sorted' && sortSourceRowsById(before, after, act) === null
    ? formulasLostToSort(before, after, act)
    : formulasLostToLineEdit(before, after, act.sheetId);
