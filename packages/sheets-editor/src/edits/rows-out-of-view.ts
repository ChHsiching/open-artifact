import type { Dynamic } from '../dynamic.ts';
import { selectedArea, mergedAreaOrCellOf } from '../selection/model.ts';
import { withNoEffects } from '../state/transitions.ts';
import { shownRowRunsOfSpan, spansLeftByOwnFilters } from '../model/cell-blocks.ts';
import { layoutOfView, rowsHiddenByOwnFilters } from '../grid/layout.ts';
import { shownLineAtOrAfter, shownLineAtOrBefore } from '../model/line-sizes.ts';
import { ownRowOrderOfSheet, rowStretchesIn, rowSpansIn } from '../model/line-ids.ts';
import { queueEdit, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { rowLabelEnds, wholeAreaToA1AsStored, columnLabelEnds } from '../model/a1-references.ts';
import { areasOfAllRanges, allRangesOf } from '../selection/several-ranges.ts';
import { filteredRowRunsIn, shownRowCountIn } from '../tables/filtered-rows.ts';
import { editsOfQueued } from '../engine/cause-of-error-cache.ts';
import { isSelectionOneCell } from '../selection/keyboard.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function deleteSelectedLines(state: PageState, reads: ReadsWithTextMeasurer, kind?: Dynamic) {
  let area = selectedArea(state, reads);
  if (area === null) return withNoEffects(state);
  let { sheetId: sheetId } = state;
  let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount } = area;
  let firstCellId = reads.cellIdAt(sheetId, topRowIndex, leftColumnIndex);
  let lastCellId = reads.cellIdAt(sheetId, topRowIndex + rowCount - 1, leftColumnIndex + columnCount - 1);
  let rows = shownRowRunsOfSpan(state, reads, sheetId, {
    firstIndex: topRowIndex,
    count: rowCount,
  });
  if (firstCellId === null || lastCellId === null || rows === null) return withNoEffects(state);
  let layout = layoutOfView(state, reads);
  let isRows = kind === 'deleteRows';
  let [firstIndex, count, lineCount, lineEdges] = isRows
    ? [topRowIndex, rowCount, layout.rowCount, layout.rowEdges]
    : [leftColumnIndex, columnCount, layout.columnCount, layout.columnEdges];
  let countLeft = lineCount - count;
  let nextShownLine = shownLineAtOrAfter(lineEdges, firstIndex + count);
  let newFirstIndex = nextShownLine < lineCount ? nextShownLine - count : Math.max(0, shownLineAtOrBefore(lineEdges, firstIndex - 1));
  let newCount = Math.min(count, countLeft - newFirstIndex);
  let ownRowOrder = ownRowOrderOfSheet(reads, state.sheetId);
  return isRows
    ? queueEdit(
        state,
        {
          kind: 'deleteRows',
          sheetId: sheetId,
          rows: rows,
        },
        {
          ...IF_QUEUED_DEFAULTS,
          select: {
            ...area,
            topRowIndex: newFirstIndex,
            rowCount: newCount,
          },
          done: null,
          undoOffer: {
            kind: 'rowsDeleted',
            ...rowLabelEnds(area, ownRowOrder),
            ...(wholeAreaToA1AsStored(area, ownRowOrder) === null && {
              countInView: count,
            }),
            isSaved: false,
          },
        },
      )
    : queueEdit(
        state,
        {
          kind: 'deleteColumns',
          sheetId: sheetId,
          oneColumn: firstCellId.columnId,
          otherColumn: lastCellId.columnId,
        },
        {
          ...IF_QUEUED_DEFAULTS,
          select: {
            ...area,
            leftColumnIndex: newFirstIndex,
            columnCount: newCount,
          },
          done: null,
          undoOffer: {
            kind: 'columnsDeleted',
            ...columnLabelEnds(area),
            isSaved: false,
          },
        },
      );
}
export function isOwnSortInTheWay(state: PageState, reads: WorkbookReads, act?: Dynamic) {
  let ownRowOrder = ownRowOrderOfSheet(reads, state.sheetId);
  let runsIn = act === 'cut' ? rowStretchesIn : rowSpansIn;
  return (
    ownRowOrder !== null &&
    areasOfAllRanges(state, reads).some(
      ({ topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic) =>
        runsIn('stored', ownRowOrder, {
          firstIndex: topRowIndex,
          count: rowCount,
        }).length > 1,
    )
  );
}
export function deleteSelectedRows(state: PageState, reads: ReadsWithTextMeasurer) {
  let result = deleteSelectedLines(state, reads, 'deleteRows');
  let area = selectedArea(state, reads);
  if (area === null || filteredRowRunsIn(state, reads, area).length === 0) return result;
  let undoOffer = {
    kind: 'rowsDeleted',
    ...rowLabelEnds(area, ownRowOrderOfSheet(reads, state.sheetId)),
    countInView: shownRowCountIn(state, reads, area),
    isSaved: false,
  };
  let [queueEffect] = result.effects;
  return queueEffect?.kind !== 'queueEdit'
    ? result
    : {
        ...result,
        effects: [
          {
            ...queueEffect,
            ifQueued: {
              ...queueEffect.ifQueued,
              select: null,
              undoOffer: undoOffer,
            },
          },
        ],
      };
}
export function editTouchesRowsOutOfView(edit: Dynamic, state: PageState, reads: WorkbookReads) {
  let rowsHiddenOn = (sheetId?: Dynamic) => rowsHiddenByOwnFilters(state, reads, sheetId);
  let isCellOutOfView = (sheetId?: Dynamic, rowId?: Dynamic, columnId?: Dynamic) => {
    let area = mergedAreaOrCellOf(reads, {
      sheetId: sheetId,
      rowId: rowId,
      columnId: columnId,
    });
    return (
      area !== null &&
      spansLeftByOwnFilters(state, reads, sheetId, {
        firstIndex: area.topRowIndex,
        count: area.rowCount,
      }).length === 0
    );
  };
  if (edit.kind === 'moveRows') return rowsHiddenOn(edit.sheetId).length > 0;
  if (edit.kind === 'importTableIntoSheet') return edit.table.how.kind !== 'addRows' && rowsHiddenOn(edit.table.sheetId).length > 0;
  if (edit.kind === 'pasteTexts')
    return rowsHiddenOn(edit.sheetId).length > 0 && edit.cells.some(({ r: r2, c: c }: Dynamic) => isCellOutOfView(edit.sheetId, r2, c));
  return (
    (edit.kind === 'enter' ||
      edit.kind === 'addUserToCell' ||
      edit.kind === 'removeUserFromCell' ||
      edit.kind === 'addDropdownOption' ||
      edit.kind === 'setListLineChecked') &&
    isCellOutOfView(edit.sheetId, edit.cell.r, edit.cell.c)
  );
}
export function guardEditsAgainstRowsOutOfView(state: Dynamic, result: Dynamic, reads: WorkbookReads, isRefusedQuietly?: Dynamic) {
  if (result.state.rowsOutOfViewByOwnFilters.size === 0) return result;
  let [edit] = result.effects.flatMap(
    (effect?: Dynamic) =>
      effect.kind === 'queueEdit' && effect.ifQueued.reachesRowsOutOfView !== true
        ? editsOfQueued(effect).filter((edit2?: Dynamic) => editTouchesRowsOutOfView(edit2, result.state, reads))
        : [],
  );
  if (edit === undefined) return result;
  let act = actOfEdit(edit);
  return isRefusedQuietly || edit.kind === 'importTableIntoSheet'
    ? {
        ...noticeRowsOutOfViewInTheWay(result.state, act),
        effects: result.effects.filter(({ kind: kind }: Dynamic) => kind !== 'queueEdit'),
      }
    : noticeRowsOutOfViewInTheWay(
        {
          ...state,
          dragging: null,
          menu: null,
        },
        act,
      );
}
export const noticeRowsOutOfViewInTheWay = (state?: Dynamic, act?: Dynamic) =>
  withNoEffects({
    ...state,
    lastDone: null,
    notice: {
      kind: 'rowsOutOfViewInTheWay',
      act: act,
    },
  });
export const refuseIfRowsOutOfViewInTheWay = (state: PageState, reads: WorkbookReads, act?: Dynamic) =>
  isOwnSortInTheWay(state, reads, act)
    ? withNoEffects({
        ...state,
        lastDone: null,
        notice: {
          kind: 'ownSortInTheWay',
          act: act,
        },
      })
    : allRangesOf(state).some((range?: Dynamic) => {
          let area = selectedArea(range, reads);
          return area !== null && !isSelectionOneCell(range, reads) && filteredRowRunsIn(state, reads, area).length > 0;
        })
      ? noticeRowsOutOfViewInTheWay(state, act)
      : null;
export const ACT_OF_EDIT_KIND = {
  mergeCells: 'mergeCells',
  fillCells: 'fill',
  moveCells: 'moveCells',
  moveRows: 'moveRows',
  pasteRowsOfTexts: 'paste',
  pasteCopiedCells: 'paste',
  pasteValuesOfCopiedCells: 'paste',
  pasteCellsOfAnotherProgram: 'paste',
};
export const actOfEdit = ({ kind: kind }: Dynamic) => ACT_OF_EDIT_KIND[kind] ?? 'otherEdit';
