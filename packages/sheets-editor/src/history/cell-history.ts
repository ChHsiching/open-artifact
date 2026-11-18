import type { Dynamic } from '../dynamic.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { rowNumberAsStored, columnLetters } from '../model/a1-references.ts';
import { selectedArea, mergedAreaOrCellOf, isSameArea, activeAnchorCell, scrollToShowActiveCell, isSameCell } from '../selection/model.ts';
import { hasOtherRanges } from '../selection/several-ranges.ts';
import { isModalOpen } from '../ui/find.ts';
import { withNoEffects } from '../state/transitions.ts';
import { MOST_LOOKS_IN_VAIN, authorsToLookUp, withoutAuthors, authorShown } from './version-history.ts';
import { stickyHeadersOverRow } from '../grid/sticky-headers.ts';
import { headingTextAt } from '../ui/sort-menu.ts';
import { lookStampOfWorkbook } from '../tables/own-filters.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { cellInputText } from '../model/cell-values.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export let lastShownCellHistory: Dynamic;
export function cellHistoryPlace(cellId: Dynamic, workbook: WorkbookReads) {
  let position = workbook.positionOfCell(cellId);
  let ownRowOrder = ownRowOrderOfSheet(workbook, cellId.sheetId);
  return position === null
    ? null
    : {
        address: singleCellAddress(position, ownRowOrder),
        rowNumber: rowNumberAsStored(position.rowIndex, ownRowOrder),
      };
}
export function rowHeldNow({ sheetId: sheetId, rowId: rowId }: Dynamic, workbook: WorkbookReads) {
  let rowIndex = workbook.rowIndexOf(sheetId, rowId);
  let columnCount = workbook.linesOf(sheetId)?.columns.count ?? 0;
  if (rowIndex === null) return '';
  let held: Dynamic = [];
  for (let columnIndex: Dynamic = 0; columnIndex < columnCount; columnIndex += 1) {
    let cellId = workbook.cellIdAt(sheetId, rowIndex, columnIndex);
    let shown = cellId === null ? '' : shownTextOfCell(cellId, workbook);
    if (cellId !== null && shown !== '') held.push([cellId.columnId, shown]);
  }
  held.sort(([columnIdA]: Dynamic, [columnIdB]: Dynamic) => columnIdA.localeCompare(columnIdB));
  return JSON.stringify(held);
}
export function canOpenCellHistory(state: PageState, workbook: WorkbookReads) {
  let area = selectedArea(state, workbook);
  let cellArea = mergedAreaOrCellOf(workbook, state.activeCell);
  return (
    state.mode.kind === 'navigating' &&
    !hasOtherRanges(state) &&
    area !== null &&
    cellArea !== null &&
    (isSameArea(area, cellArea) || (area.rowCount === 1 && area.topRowIndex === cellArea.topRowIndex))
  );
}
export function openCellHistory(state: PageState, workbook: ReadsWithTextMeasurer) {
  let cell = activeAnchorCell(state, workbook);
  let place = cellHistoryPlace(cell, workbook);
  if (
    place === null ||
    !canOpenCellHistory(state, workbook) ||
    isModalOpen({
      ...state,
      menu: null,
    })
  )
    return state;
  return {
    ...scrollToShowActiveCell(state, workbook, 'cellAlone'),
    menu: null,
    cellHistory: {
      cell: cell,
      scope: 'row',
      ...place,
      canRowBeRead: true,
      heldNow: heldNowInScope(cell, 'row', workbook),
      heldAtChangeCount: state.workbookChangeCount,
      awaited: 'toBePut',
      read: null,
      hasChangedSinceAsked: false,
      looksInVainInARow: 0,
      authorsLookedUp: new (Set as Dynamic)(),
      authorsAwaited: new (Set as Dynamic)(),
    },
  };
}
export function setCellHistoryScope(state: PageState, workbook: WorkbookReads, scope?: Dynamic) {
  let cellHistory = state.cellHistory;
  if (cellHistory === null || cellHistory.scope === scope) return state;
  return {
    ...state,
    cellHistory: {
      ...cellHistory,
      scope: scope,
      heldNow: heldNowInScope(cellHistory.cell, scope, workbook),
      heldAtChangeCount: state.workbookChangeCount,
      awaited: 'toBePut',
      read: null,
      hasChangedSinceAsked: false,
      looksInVainInARow: 0,
    },
  };
}
export function followCellHistory(state: PageState, workbook: WorkbookReads) {
  let cellHistory = state.cellHistory;
  if (cellHistory === null) return state;
  let place =
    isSameCell(cellHistory.cell, activeAnchorCell(state, workbook)) &&
    !isModalOpen({
      ...state,
      cellHistory: null,
    })
      ? cellHistoryPlace(cellHistory.cell, workbook)
      : null;
  if (place === null)
    return {
      ...state,
      cellHistory: null,
    };
  let changeCount = state.workbookChangeCount;
  let heldNow =
    changeCount === cellHistory.heldAtChangeCount ? cellHistory.heldNow : heldNowInScope(cellHistory.cell, cellHistory.scope, workbook);
  if (place.address === cellHistory.address && heldNow === cellHistory.heldNow && changeCount === cellHistory.heldAtChangeCount) return state;
  let hasChanged = cellHistory.hasChangedSinceAsked || heldNow !== cellHistory.heldNow;
  return {
    ...state,
    cellHistory: {
      ...cellHistory,
      ...place,
      heldNow: heldNow,
      heldAtChangeCount: changeCount,
      hasChangedSinceAsked: hasChanged,
    },
  };
}
export function cellHistoryAnswered(state: PageState, workbook: WorkbookReads, askId?: Dynamic, answer?: Dynamic) {
  let cellHistory = state.cellHistory;
  if (cellHistory === null || cellHistory.awaited !== askId) return withNoEffects(state);
  if (cellHistory.scope === 'row' && answer.kind === 'notRead' && answer.why === 'storeDoesNotKnowHow') {
    let rowUnreadable = {
      ...state,
      cellHistory: {
        ...cellHistory,
        canRowBeRead: false,
      },
    };
    return withNoEffects(setCellHistoryScope(rowUnreadable, workbook, 'cell'));
  }
  let looksInVain = cellHistory.looksInVainInARow + 1;
  if (answer.kind === 'notRead' && cellHistory.read?.kind === 'read' && looksInVain < MOST_LOOKS_IN_VAIN)
    return withNoEffects({
      ...state,
      cellHistory: {
        ...cellHistory,
        awaited: null,
        hasChangedSinceAsked: true,
        looksInVainInARow: looksInVain,
      },
    });
  let authors = answer.kind === 'read' ? answer.changes.flatMap(({ author: author }: Dynamic) => author ?? []) : [];
  let authorsToLookUp2 = authorsToLookUp(state, cellHistory, authors);
  return {
    state: {
      ...state,
      cellHistory: {
        ...cellHistory,
        awaited: null,
        read: answer,
        looksInVainInARow: 0,
        authorsLookedUp: new (Set as Dynamic)([...cellHistory.authorsLookedUp, ...authorsToLookUp2]),
        authorsAwaited: new (Set as Dynamic)([...cellHistory.authorsAwaited, ...authorsToLookUp2]),
      },
    },
    effects:
      authorsToLookUp2.length === 0
        ? []
        : [
            {
              kind: 'lookUpPeople',
              userIds: authorsToLookUp2,
            },
          ],
  };
}
export function askForCellHistory({ state: state, effects: effects }: Dynamic, workbook: WorkbookReads) {
  let followed = followCellHistory(state, workbook);
  let cellHistory = followed.cellHistory;
  if (cellHistory === null || cellHistory.awaited !== 'toBePut' || followed.saving === 'saving')
    return {
      state: followed,
      effects: effects,
    };
  let askId = followed.versionHistoryAskCount + 1;
  let asking = {
    ...followed,
    versionHistoryAskCount: askId,
    cellHistory: {
      ...cellHistory,
      awaited: askId,
      hasChangedSinceAsked: false,
    },
  };
  if (followed.saving === 'allSaved')
    return {
      state: asking,
      effects: [
        ...effects,
        {
          kind: 'readCellHistory',
          askId: askId,
          cell: cellHistory.cell,
          scope: cellHistory.scope,
        },
      ],
    };
  let answered = cellHistoryAnswered(asking, workbook, askId, {
    kind: 'notRead',
    why: 'noAnswer',
  });
  return {
    state: answered.state,
    effects: [...effects, ...answered.effects],
  };
}
export function cellHistoryAuthorsArrived(state: PageState, userIds?: Dynamic) {
  let cellHistory = state.cellHistory;
  if (cellHistory === null) return state;
  let awaited = withoutAuthors(cellHistory.authorsAwaited, userIds);
  return awaited === cellHistory.authorsAwaited
    ? state
    : {
        ...state,
        cellHistory: {
          ...cellHistory,
          authorsAwaited: awaited,
        },
      };
}
export function headingNamesOfColumns(state: PageState, workbook: WorkbookReads, rowIndex?: Dynamic, columnIndexes?: Dynamic) {
  let headings = stickyHeadersOverRow(state, workbook, rowIndex).flatMap(
    ({ header: header, columns: columns }: Dynamic) =>
      Array.from<Dynamic, Dynamic>(
        {
          length: columns.last - columns.first + 1,
        },
        (input?: Dynamic, offset?: Dynamic) => {
          let columnIndex = columns.first + offset;
          let heading = headingTextAt(
            state,
            workbook,
            {
              rowIndex: header.last,
              columnIndex: columnIndex,
            },
            true,
          );
          return [columnIndex, heading];
        },
      ),
  );
  let allColumnIndexes = new (Set as Dynamic)([...columnIndexes, ...headings.map(([columnIndex]: Dynamic) => columnIndex)]);
  let nameCounts = new (Map as Dynamic)();
  for (let name of [...[...allColumnIndexes].map(columnLetters), ...headings.map(([, heading]: Dynamic) => heading)] as Dynamic)
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  return new (Map as Dynamic)(headings.filter(([, heading]: Dynamic) => heading !== '' && nameCounts.get(heading) === 1));
}
export function columnsOfCellChanges(state: PageState, workbook: WorkbookReads, { sheetId: sheetId, rowId: rowId }: Dynamic, changes?: Dynamic) {
  let columns = [
    ...new (Set as Dynamic)(
      changes.flatMap(({ cells: cells }: Dynamic) => cells.map(({ columnId: columnId }: Dynamic) => columnId)),
    ),
  ].flatMap((columnId?: Dynamic) => {
    let position = workbook.positionOfCell({
      sheetId: sheetId,
      rowId: rowId,
      columnId: columnId,
    });
    return position === null
      ? []
      : [
          {
            columnId: columnId,
            at: position,
          },
        ];
  });
  let rowIndex = workbook.rowIndexOf(sheetId, rowId);
  let columnIndexes = columns.map(({ at: position }: Dynamic) => position.columnIndex);
  let headingNames = rowIndex === null ? null : headingNamesOfColumns(state, workbook, rowIndex, columnIndexes);
  return new (Map as Dynamic)(
    columns.map(({ columnId: columnId, at: position }: Dynamic) => {
      let headingName = headingNames?.get(position.columnIndex);
      return [
        columnId,
        {
          columnIndex: position.columnIndex,
          address: singleCellAddress(position, ownRowOrderOfSheet(workbook, sheetId)),
          column:
            headingName === undefined
              ? {
                  kind: 'lettered',
                  letters: columnLetters(position.columnIndex),
                }
              : {
                  kind: 'named',
                  name: headingName,
                },
        },
      ];
    }),
  );
}
export function changedCellsShown(cells?: Dynamic, columns?: Dynamic) {
  let shownCells = cells.flatMap(({ columnId: columnId, held: held }: Dynamic) => {
    let column = columns.get(columnId);
    return column === undefined
      ? []
      : [
          {
            columnId: columnId,
            held: held,
            ...column,
          },
        ];
  });
  shownCells.sort((cellA?: Dynamic, cellB?: Dynamic) => cellA.columnIndex - cellB.columnIndex);
  return shownCells.map(
    ({ columnId: columnId, held: held, address: address, column: column }: Dynamic) => ({
      columnId: columnId,
      held: held,
      address: address,
      column: column,
    }),
  );
}
export function shownCellHistory(state: PageState, workbook: WorkbookReads) {
  let {
    cellHistory: cellHistory,
    profilesById: profilesById,
    tablesRead: tablesRead,
    ownFilters: ownFilters,
    workbookChangeCount: workbookChangeCount,
  } = state;
  if (cellHistory === null) {
    lastShownCellHistory = null;
    return null;
  }
  let behindAtChangeCount = isCellHistoryOutdated(state) ? workbookChangeCount : null;
  let asOfWorkbook = lookStampOfWorkbook(state);
  let isSameOpen =
    lastShownCellHistory !== null &&
    isSameOpenCellHistory(lastShownCellHistory.open, cellHistory) &&
    lastShownCellHistory.profilesById === profilesById &&
    lastShownCellHistory.behindAtChangeCount === behindAtChangeCount;
  if (
    isSameOpen &&
    lastShownCellHistory?.asOfWorkbook === asOfWorkbook &&
    lastShownCellHistory.tablesRead === tablesRead &&
    lastShownCellHistory.ownFilters === ownFilters
  )
    return lastShownCellHistory.shown;
  let { read: read } = cellHistory;
  let columns = columnsOfCellChanges(state, workbook, cellHistory.cell, read?.kind === 'read' ? read.changes : []);
  let places = JSON.stringify([...columns]);
  if (isSameOpen && lastShownCellHistory?.places === places) {
    lastShownCellHistory = {
      ...lastShownCellHistory,
      tablesRead: tablesRead,
      ownFilters: ownFilters,
      asOfWorkbook: asOfWorkbook,
    };
    return lastShownCellHistory.shown;
  }
  let shown = {
    address: cellHistory.address,
    rowNumber: cellHistory.rowNumber,
    scope: cellHistory.scope,
    canRowBeRead: cellHistory.canRowBeRead,
    isAwaited: cellHistory.awaited !== null,
    changes:
      read?.kind !== 'read'
        ? null
        : read.changes.flatMap(({ revision: revision, atMs: atMs, cells: cells, author: author }: Dynamic) => {
            let shownCells = changedCellsShown(cells, columns);
            if (shownCells.length === 0) return [];
            return [
              {
                revision: revision,
                atMs: atMs,
                cells: shownCells,
                author: author === null ? null : authorShown(author, profilesById, cellHistory.authorsAwaited),
              },
            ];
          }),
    areEarlierLeftOut: read?.kind === 'read' && read.areEarlierLeftOut,
    whyNotRead: read?.kind === 'notRead' ? read.why : null,
    behindAtChangeCount: behindAtChangeCount,
  };
  lastShownCellHistory = {
    open: cellHistory,
    profilesById: profilesById,
    tablesRead: tablesRead,
    ownFilters: ownFilters,
    asOfWorkbook: asOfWorkbook,
    behindAtChangeCount: behindAtChangeCount,
    places: places,
    shown: shown,
  };
  return shown;
}
export const singleCellAddress = (position?: Dynamic, ownRowOrder?: Dynamic) =>
  areaToA1AsStored(
    {
      topRowIndex: position.rowIndex,
      leftColumnIndex: position.columnIndex,
      rowCount: 1,
      columnCount: 1,
    },
    ownRowOrder,
  );
export const shownTextOfCell = (cellId: Dynamic, workbook: WorkbookReads) =>
  cellInputText(workbook.cellOf(cellId), workbook.decimalSign);
export const heldNowInScope = (cellId: Dynamic, scope: Dynamic, workbook: WorkbookReads) =>
  scope === 'row' ? rowHeldNow(cellId, workbook) : shownTextOfCell(cellId, workbook);
export const askCellHistoryAgain = (state: PageState) =>
  state.cellHistory === null || state.cellHistory.awaited !== null
    ? state
    : {
        ...state,
        cellHistory: {
          ...state.cellHistory,
          awaited: 'toBePut',
          looksInVainInARow: 0,
        },
      };
export const isCellHistoryOutdated = ({ cellHistory: cellHistory, saving: saving }: Dynamic) =>
  cellHistory !== null &&
  cellHistory.read?.kind === 'read' &&
  cellHistory.awaited === null &&
  cellHistory.hasChangedSinceAsked &&
  saving === 'allSaved';
export const refreshCellHistory = (state: PageState) =>
  state.cellHistory !== null && isCellHistoryOutdated(state)
    ? {
        ...state,
        cellHistory: {
          ...state.cellHistory,
          awaited: 'toBePut',
        },
      }
    : state;
export const isCellHistoryAwaiting = ({ cellHistory: cellHistory }: Dynamic, askId?: Dynamic) => cellHistory?.awaited === askId;
lastShownCellHistory = null;
export const isSameOpenCellHistory = (lastOpen?: Dynamic, cellHistory?: Dynamic) =>
  lastOpen.cell === cellHistory.cell &&
  lastOpen.scope === cellHistory.scope &&
  lastOpen.address === cellHistory.address &&
  lastOpen.canRowBeRead === cellHistory.canRowBeRead &&
  (lastOpen.awaited === null) === (cellHistory.awaited === null) &&
  lastOpen.read === cellHistory.read &&
  lastOpen.authorsAwaited === cellHistory.authorsAwaited;
