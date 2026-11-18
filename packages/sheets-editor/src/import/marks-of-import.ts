import type { Dynamic } from '../dynamic.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function importMarksToCome(edit: Dynamic, reads: WorkbookReads) {
  if (edit.kind !== 'importTableIntoSheet') return null;
  let { sheetId: sheetId, columns: columns, how: how } = edit.table;
  let changes = reads.whatATableChanges(edit.table);
  if (changes === null || changes.kind === 'refused') return null;
  let isReplacingRows = how.kind === 'replaceRows';
  return {
    sheetId: sheetId,
    updated: new (Set as Dynamic)(
      isReplacingRows
        ? []
        : changes.rows.flatMap(
            (row?: Dynamic) =>
              row.kind !== 'changes'
                ? []
                : row.columns.flatMap((column?: Dynamic) => {
                    let value = columns[column];
                    return value === null || value === undefined ? [] : [`${row.row} ${value.column}`];
                  }),
          ),
    ),
    columns: new (Set as Dynamic)(columns.flatMap((column?: Dynamic) => (column === null ? [] : [column.column]))),
    rowsBefore: new (Set as Dynamic)(isReplacingRows ? [] : reads.rowsAsTheyStand(sheetId).keys()),
  };
}
export function updateImportMarks(state: PageState, event: Dynamic, reads: WorkbookReads) {
  let { marksOfImport: marksOfImport, marksOfImportToCome: marksOfImportToCome } = state;
  if (event.kind !== 'editAnswered' || event.edit.kind !== 'importTableIntoSheet' || marksOfImportToCome === null)
    return marksOfImport !== null && (event.kind === 'marksOfImportOver' || !areImportMarksStillShown(state, marksOfImport))
      ? {
          ...state,
          marksOfImport: null,
        }
      : state;
  let value = event.outcome.kind === 'editQueued' ? event.outcome.placeChanged?.area : null;
  if (value === null || value === undefined)
    return {
      ...state,
      marksOfImport: null,
      marksOfImportToCome: null,
    };
  let { sheetId: sheetId, updated: updated, columns: columns, rowsBefore: rowsBefore } = marksOfImportToCome;
  return {
    ...state,
    marksOfImportToCome: null,
    marksOfImport: {
      sheetId: sheetId,
      updated: updated,
      columns: columns,
      addedRows: new (Set as Dynamic)([...reads.rowsAsTheyStand(sheetId).keys()].filter((input?: Dynamic) => !rowsBefore.has(input))),
      rowNumbersWritten: {
        first: value.topRowIndex + 1,
        last: value.topRowIndex + value.rowCount,
      },
      stateWhenSet: {
        changesAskedFor: state.changesAskedFor,
        sheetId: state.sheetId,
        scrollTop: state.scrollTop,
        scrollLeft: state.scrollLeft,
        gridWidth: state.gridWidth,
        gridHeight: state.gridHeight,
        zoom: state.zoom,
      },
    },
  };
}
export function markImportedCells(marks: Dynamic, { marksOfImport: marksOfImport, sheetId: sheetId }: Dynamic) {
  if (marksOfImport === null || marksOfImport.sheetId !== sheetId) return marks;
  let value = (input?: Dynamic, options?: Dynamic) =>
    marksOfImport.addedRows.has(input.key) &&
    input.rowNumber >= marksOfImport.rowNumbersWritten.first &&
    input.rowNumber <= marksOfImport.rowNumbersWritten.last
      ? marksOfImport.columns.has(options)
        ? 'added'
        : null
      : marksOfImport.updated.has(`${input.key} ${options}`)
        ? 'updated'
        : null;
  let marksOnSheet = marks.filter((mark?: Dynamic) => mark.cells.some((cell?: Dynamic) => value(mark, cell.key) !== null));
  let staggerMs = Math.min(120, 1200 / marksOnSheet.length);
  return marks.map((mark?: Dynamic) => {
    let value2 = marksOnSheet.indexOf(mark);
    return value2 < 0
      ? mark
      : {
          ...mark,
          cells: mark.cells.map((cell?: Dynamic) => {
            let value3 = value(mark, cell.key);
            return value3 === null
              ? cell
              : {
                  ...cell,
                  markOfImport: value3,
                  markOfImportDelayMs: Math.round(value2 * staggerMs),
                };
          }),
        };
  });
}
export const IMPORT_MARKS_VIEW_KEYS = ['changesAskedFor', 'sheetId', 'scrollTop', 'scrollLeft', 'gridWidth', 'gridHeight', 'zoom'];
export const IMPORT_MARKS_SHOWN_MS = 2400;
export const areImportMarksStillShown = (state: Dynamic, { stateWhenSet: stateWhenSet }: Dynamic) =>
  IMPORT_MARKS_VIEW_KEYS.every((input?: Dynamic) => state[input] === stateWhenSet[input]) &&
  state.mode.kind !== 'editing' &&
  state.importOfAFile === null;
