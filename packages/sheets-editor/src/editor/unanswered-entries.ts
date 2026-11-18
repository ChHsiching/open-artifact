import type { Dynamic } from '../dynamic.ts';
import { TEXT_PREFIX_QUOTE } from '../model/cell-text.ts';
import { isSameCell } from '../selection/model.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function markEditByPage(edit?: Dynamic) {
  return (EDITS_BY_PAGE.add(edit), edit);
}
export function plainTextOfEntry(input?: Dynamic) {
  if (input.kind === 'text') return input.text;
  if (input.kind !== 'textWithLooks') return '';
  return input.paragraphs.map(({ runs: runs }: Dynamic) => runs.map(({ text: text }: Dynamic) => text).join('')).join(`
`);
}
export function cellWithListOfEntry({ cell: cell, entry: entry }: Dynamic, reads: WorkbookReads) {
  if (entry.kind !== 'textWithLooks') return null;
  let lists = entry.paragraphs.map(({ list: list }: Dynamic) => list);
  let text = plainTextOfEntry(entry);
  if (!text.startsWith(TEXT_PREFIX_QUOTE) || lists.every(({ kind: kind }: Dynamic) => kind === 'none')) return null;
  let isAtStart: Dynamic = true;
  let paragraphs = entry.paragraphs.map(
    ({ list: list, runs: runs }: Dynamic) => ({
      list: list,
      runs: runs.flatMap((run?: Dynamic) => {
        let runText = isAtStart && run.text !== '' ? run.text.slice(TEXT_PREFIX_QUOTE.length) : run.text;
        return (
          (isAtStart &&= run.text === ''),
          runText === ''
            ? []
            : {
                ...run,
                text: runText,
              }
        );
      }),
    }),
  );
  return {
    ...cell,
    input: {
      kind: 'richText',
      paragraphs: paragraphs,
    },
    value: {
      kind: 'text',
      value: text.slice(TEXT_PREFIX_QUOTE.length),
    },
    numbersOfListLines: (reads.listLinesAsKept(lists) ?? []).map(({ number: number }: Dynamic) => number),
  };
}
export function readsWithUnansweredEntries(reads: WorkbookReads, { entriesUnanswered: entriesUnanswered }: Dynamic) {
  if (entriesUnanswered.length === 0) return reads;
  let cellOf = (cell?: Dynamic) => {
    let unanswered = entriesUnanswered.findLast((entry?: Dynamic) => isSameCell(entry.cellId, cell));
    if (unanswered === undefined) return reads.cellOf(cell);
    let { text: unansweredText, cellWithList: cellWithList } = unanswered;
    let { rowId: rowId, columnId: columnId } = cell;
    return (
      cellWithList ??
      (unansweredText === ''
        ? null
        : {
            r: rowId,
            c: columnId,
            input: {
              kind: 'text',
              value: unansweredText,
            },
          })
    );
  };
  return {
    ...reads,
    cellOf: cellOf,
    cellOnShowIn: (cell?: Dynamic) => cellOf(cell) ?? reads.spilledCellOf(cell),
    columnIndexesOnShowIn(sheetId?: Dynamic, rowIndex?: Dynamic) {
      let unansweredColumnIndexes = entriesUnanswered.flatMap(({ cellId: cellId }: Dynamic) => {
        let position = cellId.sheetId === sheetId ? reads.positionOfCell(cellId) : null;
        return position?.rowIndex === rowIndex ? [position.columnIndex] : [];
      });
      let columnIndexes = reads.columnIndexesOnShowIn(sheetId, rowIndex);
      if (unansweredColumnIndexes.length === 0) return columnIndexes;
      let allColumnIndexes = [...new (Set as Dynamic)([...columnIndexes, ...unansweredColumnIndexes])];
      allColumnIndexes.sort((index?: Dynamic, otherIndex?: Dynamic) => index - otherIndex);
      return allColumnIndexes;
    },
  };
}
export const EDITS_BY_PAGE = new (WeakSet as Dynamic)();
export const isEditByPage = (edit?: Dynamic) =>
  (edit.kind === 'declareCellTable' && edit.isAskedFor !== true) || EDITS_BY_PAGE.has(edit);
export const unansweredEntryOf = (entry?: Dynamic) => ({
  cellId: {
    sheetId: entry.sheetId,
    rowId: entry.cell.r,
    columnId: entry.cell.c,
  },
  text: plainTextOfEntry(entry.entry),
});
export const textOfUnansweredEntryAt = ({ entriesUnanswered: entriesUnanswered }: Dynamic, cell?: Dynamic) =>
  entriesUnanswered.findLast((unanswered?: Dynamic) => isSameCell(unanswered.cellId, cell))?.text ?? null;
export const isEntryWorkPending = (
  { entriesUnanswered: entriesUnanswered }: Dynamic,
  { areFormulasLeft: areFormulasLeft }: Dynamic,
) => areFormulasLeft || entriesUnanswered.length > 0;
