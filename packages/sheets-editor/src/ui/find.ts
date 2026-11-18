import type { Dynamic } from '../dynamic.ts';
import { lastAtOrBefore } from '../model/line-ids.ts';
import { usersOfCell, cellValueOf } from '../model/cell-values.ts';
import { profileOfUser } from '../chips/people-list.ts';
import { shownCellText } from '../format/shown-text.ts';
import { shownCellOf } from '../grid/formulas-shown.ts';
import { rangeSpansOnScreen } from '../grid/geometry.ts';
import { COLUMN_HEADER_HEIGHT } from '../grid/cell-metrics.ts';
import { ROW_HEADER_WIDTH } from '../grid/cell-metrics-values.ts';
import { mergedAreaOrCellOf, moveActiveCellTo, selectedArea, isSameCell } from '../selection/model.ts';
import { layoutOfView } from '../grid/layout.ts';
import { showSheet } from '../state/sheet-tabs.ts';
import { withoutOtherRanges } from '../selection/several-ranges.ts';
import { withCalendarShut } from '../chips/calendar.ts';
import { stripGroupSeparators, normalizeNoBreakSpaces } from '../format/number-signs.ts';
import { isMenuHoldingField } from '../state/transitions.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function joinTouchingStretches(stretches?: Dynamic) {
  stretches.sort((input?: Dynamic, options?: Dynamic) => input.firstIndex - options.firstIndex);
  let joined: Dynamic = [];
  for (let stretch of stretches as Dynamic) {
    let last = joined[joined.length - 1];
    if (last !== undefined && last.firstIndex + last.count === stretch.firstIndex)
      joined[joined.length - 1] = {
        ...last,
        count: last.count + stretch.count,
      };
    else joined.push(stretch);
  }
  return joined;
}
export function stretchesOfFindWithin(workbook: WorkbookReads, sheetId: Dynamic, { rows: rows, columns: columns }: Dynamic) {
  let lines = workbook.linesOf(sheetId);
  return {
    rows: joinTouchingStretches(rows.flatMap((input?: Dynamic) => lines?.rows.stretchesOf(input) ?? [])),
    columns: joinTouchingStretches(columns.flatMap((input?: Dynamic) => lines?.columns.stretchesOf(input) ?? [])),
  };
}
export function isIndexInStretches(stretches?: Dynamic, index?: Dynamic) {
  let stretch = lastAtOrBefore(stretches, ({ firstIndex: firstIndex }: Dynamic) => firstIndex, index);
  if (stretch === undefined) return false;
  return index >= stretch.firstIndex && index < stretch.firstIndex + stretch.count;
}
export function spanOfStretches(stretches?: Dynamic) {
  let [firstStretch, lastStretch] = [stretches[0], stretches[stretches.length - 1]];
  if (firstStretch === undefined || lastStretch === undefined) return null;
  return {
    firstIndex: firstStretch.firstIndex,
    count: lastStretch.firstIndex + lastStretch.count - firstStretch.firstIndex,
  };
}
export function relocateFindArea(workbook: WorkbookReads, sheetId?: Dynamic, findWithin?: Dynamic) {
  let stretches = stretchesOfFindWithin(workbook, sheetId, findWithin);
  let [rowSpan, columnSpan] = [spanOfStretches(stretches.rows), spanOfStretches(stretches.columns)];
  if (rowSpan === null || columnSpan === null) return null;
  let area = {
    topRowIndex: rowSpan.firstIndex,
    leftColumnIndex: columnSpan.firstIndex,
    rowCount: rowSpan.count,
    columnCount: columnSpan.count,
  };
  return {
    ...findWithin,
    at: area,
  };
}
export function peopleNamesOfCell(cell?: Dynamic, profilesById?: Dynamic) {
  let userIds = usersOfCell(cell);
  if (userIds.length === 0) return null;
  return joinPeopleNames(userIds.map((input?: Dynamic) => profileOfUser(profilesById, input).name));
}
export function cellMatchesFind(cell?: Dynamic, query?: Dynamic, profilesById?: Dynamic, decimalSign?: Dynamic) {
  let text = peopleNamesOfCell(cell, profilesById) ?? shownCellText(cell, MAX_FIND_SHOWN_CHARACTERS, decimalSign).text;
  if (textMatchesFind(text, query)) return true;
  return cellValueOf(cell)?.kind === 'number' && numberTextMatchesFind(text, query, decimalSign);
}
export function textMatchesFind(text: Dynamic, { text: findText, matchesCase: matchesCase, isWholeCell: isWholeCell }: Dynamic) {
  let [haystack, needle] = matchesCase ? [text, findText] : [text.toLowerCase(), findText.toLowerCase()];
  return isWholeCell ? haystack === needle : haystack.includes(needle);
}
export function isFindHit(
  state: PageState,
  workbook: WorkbookReads,
  { cellId: cellId, rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic,
  query?: Dynamic,
) {
  let { within: within } = query;
  if (within !== null && !(isIndexInStretches(within.rows, rowIndex) && isIndexInStretches(within.columns, columnIndex))) return false;
  let cell = shownCellOf(state, workbook, cellId);
  if (cellMatchesFind(cell, query, state.profilesById, workbook.decimalSign)) return true;
  if (!query.isInFormulas || state.areFormulasShown) return false;
  let cellWithFormulasShown = shownCellOf(STATE_WITH_FORMULAS_SHOWN, workbook, cellId);
  return cellWithFormulasShown !== cell && cellMatchesFind(cellWithFormulasShown, query, state.profilesById, workbook.decimalSign);
}
export function* rowsToFindIn(state: PageState, workbook: WorkbookReads, by?: Dynamic) {
  let sheets = workbook.listSheets();
  let start = activeCellPositionOrOrigin(state, workbook);
  if (start.sheetIndex === -1) return;
  let sheetCount = state.find?.options.within === 'allSheets' ? sheets.length : 1;
  for (let step: Dynamic = 0; step <= sheetCount; step += 1) {
    let sheetIndex = step === sheetCount ? start.sheetIndex : (start.sheetIndex + by * step + sheets.length) % sheets.length;
    let sheet = sheets[sheetIndex];
    if (sheet === undefined) return;
    let { sheetId: sheetId, rowCount: rowCount, columnCount: columnCount } = sheet;
    let wholeSheet = {
      topRowIndex: 0,
      leftColumnIndex: 0,
      rowCount: rowCount,
      columnCount: columnCount,
    };
    let hasMerged = workbook.mergedAreasIn(sheetId, wholeSheet).length > 0;
    let [firstRowIndex, lastRowIndex] = by === 1 ? [0, rowCount - 1] : [rowCount - 1, 0];
    let fromRowIndex = step === 0 ? start.rowIndex : firstRowIndex;
    let toRowIndex = step === sheetCount ? start.rowIndex : lastRowIndex;
    for (let rowIndex: Dynamic = fromRowIndex; by * (toRowIndex - rowIndex) >= 0; rowIndex += by) {
      let columnIndexes = workbook.columnIndexesOnShowIn(sheetId, rowIndex);
      let isStartRow = sheetIndex === start.sheetIndex && rowIndex === start.rowIndex;
      let isFromStart = by === 1 ? step === 0 : step === sheetCount;
      let columnIndexesToFind = columnIndexes.filter(
        (columnIndex?: Dynamic) => !isStartRow || (isFromStart ? columnIndex >= start.columnIndex : columnIndex < start.columnIndex),
      );
      if (by === -1) columnIndexesToFind.reverse();
      yield {
        sheetId: sheetId,
        sheetIndex: sheetIndex,
        rowIndex: rowIndex,
        columnIndexes: columnIndexesToFind,
        hasMerged: hasMerged,
      };
    }
  }
}
export function collectFindHits(state: PageState, workbook: WorkbookReads, text: Dynamic, { by: by, most: most }: Dynamic) {
  let options = state.find?.options ?? DEFAULT_FIND_OPTIONS;
  let query = findQueryOf(
    {
      text: text,
      options: options,
    },
    workbook,
    state.sheetId,
  );
  let hits: Dynamic = [];
  for (let row of rowsToFindIn(state, workbook, by) as Dynamic) {
    let { sheetId: sheetId, sheetIndex: sheetIndex, rowIndex: rowIndex, hasMerged: hasMerged } = row;
    for (let columnIndex of row.columnIndexes as Dynamic) {
      let cellId = workbook.cellIdAt(sheetId, rowIndex, columnIndex);
      if (
        cellId === null ||
        !isFindHit(
          state,
          workbook,
          {
            cellId: cellId,
            rowIndex: rowIndex,
            columnIndex: columnIndex,
          },
          query,
        )
      )
        continue;
      let mergedArea = hasMerged
        ? workbook.mergedAreaAt(sheetId, {
            rowIndex: rowIndex,
            columnIndex: columnIndex,
          })
        : null;
      if (mergedArea !== null && (mergedArea.topRowIndex !== rowIndex || mergedArea.leftColumnIndex !== columnIndex)) continue;
      hits.push({
        cellId: cellId,
        sheetIndex: sheetIndex,
        rowIndex: rowIndex,
        columnIndex: columnIndex,
      });
      if (hits.length === most) return hits;
    }
  }
  return hits;
}
export function findHits(state: PageState, workbook: WorkbookReads, text?: Dynamic) {
  if (text === '') return NO_FIND_HITS;
  let found = collectFindHits(state, workbook, text, {
    by: 1,
    most: MAX_FIND_HITS + 1,
  });
  let hits = found.slice(0, MAX_FIND_HITS);
  let isCapped = found.length > hits.length;
  let [first, last] = [hits[0], hits[hits.length - 1]];
  let ends =
    isCapped && first !== undefined && last !== undefined
      ? {
          first: first,
          last: last,
        }
      : null;
  hits.sort(compareFindPositions);
  return {
    hits: hits,
    isCapped: isCapped,
    ends: ends,
    editsSinceLooked: 0,
  };
}
export function findHitsAroundActiveCell(state: PageState, workbook: WorkbookReads, text?: Dynamic) {
  let after = collectFindHits(state, workbook, text, {
    by: 1,
    most: MAX_FIND_HITS / 2,
  });
  let before = collectFindHits(state, workbook, text, {
    by: -1,
    most: MAX_FIND_HITS / 2,
  });
  let [first, last] = [before[before.length - 1], after[after.length - 1]];
  if (first === undefined || last === undefined) return NO_FIND_HITS;
  if (after.some((input?: Dynamic) => compareFindPositions(input, first) === 0)) return findHits(state, workbook, text);
  let hits = [...before, ...after];
  hits.sort(compareFindPositions);
  return {
    hits: hits,
    isCapped: true,
    ends: {
      first: first,
      last: last,
    },
    editsSinceLooked: 0,
  };
}
export function shortenFoundText(text?: Dynamic) {
  let words = text.trim().split(/\s+/);
  let characters = Array.from<Dynamic>(words.slice(0, MAX_WORDS_IN_FOUND_TEXT).join(' '));
  return words.length > MAX_WORDS_IN_FOUND_TEXT || characters.length > MAX_CHARACTERS_IN_FOUND_TEXT
    ? `${characters.slice(0, MAX_CHARACTERS_IN_FOUND_TEXT).join('')}…`
    : words.join(' ');
}
export function roomNeededUnderFindBar(state: PageState, cellArea?: Dynamic, layout?: Dynamic) {
  if (state.find?.isReplaceShown === true) return 0;
  let { across: across, down: down } = rangeSpansOnScreen(cellArea, state, layout, state);
  if (down.start < down.showFrom) return 0;
  let cellTop = COLUMN_HEADER_HEIGHT + down.start;
  let cellLeft = ROW_HEADER_WIDTH + Math.max(across.showFrom, across.start);
  let cellRight = ROW_HEADER_WIDTH + across.end;
  let barRight = state.gridWidth - FIND_BAR_BOX.fromRight / state.zoom;
  let barLeft = barRight - FIND_BAR_BOX.width / state.zoom;
  let isUnderBar = cellRight > cellLeft && cellLeft < barRight && cellRight > barLeft;
  let roomNeeded = (FIND_BAR_BOX.top + FIND_BAR_BOX.height + FIND_BAR_GAP) / state.zoom;
  return isUnderBar ? Math.max(0, roomNeeded - cellTop) : 0;
}
export function makeRoomForFindBar(state: PageState, workbook: ReadsWithTextMeasurer, find?: Dynamic) {
  let activeArea = mergedAreaOrCellOf(workbook, state.activeCell);
  if (activeArea === null)
    return {
      ...state,
      find: {
        ...find,
        roomAboveGrid: 0,
      },
    };
  let layout = layoutOfView(state, workbook);
  let roomNeeded = roomNeededUnderFindBar(state, activeArea, layout);
  let scrollBy = activeArea.topRowIndex < layout.frozenRowCount ? 0 : Math.min(roomNeeded, state.scrollTop);
  return {
    ...state,
    scrollTop: state.scrollTop - scrollBy,
    find: {
      ...find,
      roomAboveGrid: roomNeeded - scrollBy,
    },
  };
}
export function goToFindHit(state: PageState, workbook: ReadsWithTextMeasurer, hit?: Dynamic) {
  if (state.mode.kind !== 'navigating' || isModalOpen(state) || state.dragging !== null || state.find === null) return state;
  if (hit === undefined)
    return {
      ...state,
      find: {
        ...state.find,
        roomAboveGrid: 0,
      },
    };
  let { sheetId: sheetId } = hit.cellId;
  if (sheetId !== state.sheetId && state.sheetBeingRenamed !== null) return state;
  let shown = showSheet(state, workbook, sheetId);
  if (shown.sheetId !== sheetId) return state;
  let find =
    sheetId === state.sheetId
      ? state.find
      : {
          ...state.find,
          selectedAtFirst: null,
        };
  let lastDone = state.lastDone?.what === 'replaced' ? state.lastDone : shown.lastDone;
  let nextState = {
    ...shown,
    find: find,
    lastDone: lastDone,
    notice: state.notice,
  };
  return makeRoomForFindBar(moveActiveCellTo(withoutOtherRanges(nextState), workbook, hit.cellId), workbook, find);
}
export function selectedAreaToFindIn(state: PageState, workbook: WorkbookReads) {
  let area = selectedArea(state, workbook);
  if (area === null || area.rowCount * area.columnCount === 1) return null;
  let mergedArea = workbook.mergedAreaAt(state.sheetId, {
    rowIndex: area.topRowIndex,
    columnIndex: area.leftColumnIndex,
  });
  return mergedArea?.rowCount === area.rowCount && mergedArea.columnCount === area.columnCount ? null : area;
}
export function findWithinOfSelection(state: PageState, workbook: WorkbookReads) {
  let area = selectedAreaToFindIn(state, workbook);
  let lines = workbook.linesOf(state.sheetId);
  if (area === null || lines === null) return null;
  return {
    rows: lines.rows.runsIn({
      firstIndex: area.topRowIndex,
      count: area.rowCount,
    }),
    columns: lines.columns.runsIn({
      firstIndex: area.leftColumnIndex,
      count: area.columnCount,
    }),
    at: area,
  };
}
export function openFind(state: PageState, workbook: WorkbookReads) {
  if (state.find !== null || isModalOpen(state)) return state;
  return {
    ...withCalendarShut(state),
    menu: null,
    find: {
      text: '',
      options: DEFAULT_FIND_OPTIONS,
      selectedAtFirst: findWithinOfSelection(state, workbook),
      roomAboveGrid: 0,
      isReplaceShown: false,
      ...NO_FIND_HITS,
    },
  };
}
export function showFindReplace(state: PageState, isShown: Dynamic, workbook: ReadsWithTextMeasurer) {
  if (state.find === null || state.find.isReplaceShown === isShown) return state;
  let find = {
    ...state.find,
    isReplaceShown: isShown,
  };
  let nextState = isShown
    ? {
        ...state,
        find: {
          ...find,
          roomAboveGrid: 0,
        },
      }
    : refreshFindHits(
        {
          ...state,
          find: {
            ...find,
            options: DEFAULT_FIND_OPTIONS,
          },
        },
        workbook,
      );
  return indexOfActiveFindHit(nextState) === null || nextState.find === null ? nextState : makeRoomForFindBar(nextState, workbook, nextState.find);
}
export function changeFindText(state: PageState, { text: text, goesToCellFound: goesToCellFound }: Dynamic, workbook: ReadsWithTextMeasurer) {
  if (state.find === null) return state;
  let { find: find } = state;
  let activeCellPosition = activeCellPositionOrOrigin(state, workbook);
  let narrowsLastFind =
    find.text !== '' &&
    !find.isCapped &&
    find.editsSinceLooked === 0 &&
    !find.options.isWholeCell &&
    (find.options.matchesCase ? text.startsWith(find.text) : text.toLowerCase().startsWith(find.text.toLowerCase()));
  let query = findQueryOf(
    {
      text: text,
      options: find.options,
    },
    workbook,
    state.sheetId,
  );
  let found = narrowsLastFind
    ? {
        ...find,
        hits: find.hits.filter((input?: Dynamic) => isFindHit(state, workbook, input, query)),
      }
    : findHits(state, workbook, text);
  let nextState = {
    ...state,
    find: {
      ...find,
      ...found,
      text: text,
    },
  };
  if (!goesToCellFound) return nextState;
  let hitsOnSheet = found.hits.filter(({ cellId: cellId }: Dynamic) => cellId.sheetId === state.sheetId);
  return goToFindHit(
    nextState,
    workbook,
    hitsOnSheet.find((input?: Dynamic) => compareFindPositions(input, activeCellPosition) >= 0) ?? hitsOnSheet[0],
  );
}
export function changeFindOptions(state: PageState, options: Dynamic, workbook: WorkbookReads) {
  if (state.find?.isReplaceShown !== true) return state;
  let { within: within, ...otherOptions } = options;
  let nextWithin =
    within === undefined
      ? state.find.options.within
      : within === 'sheet'
        ? null
        : within === 'allSheets'
          ? within
          : (findWithinOfSelection(state, workbook) ?? state.find.selectedAtFirst);
  let nextOptions = {
    ...state.find.options,
    ...otherOptions,
    within: nextWithin,
  };
  let selectedAtFirst = findWithinOf(nextOptions) ?? state.find.selectedAtFirst;
  return refreshFindHits(
    {
      ...state,
      find: {
        ...state.find,
        options: nextOptions,
        selectedAtFirst: selectedAtFirst,
      },
    },
    workbook,
  );
}
export function refreshFindHits(state: PageState, workbook: WorkbookReads) {
  if (state.find === null) return state;
  return {
    ...state,
    find: {
      ...state.find,
      ...findHits(state, workbook, state.find.text),
    },
  };
}
export function findHitsReadyToStep(state: PageState, step: Dynamic, workbook: WorkbookReads) {
  let current = (state.find?.editsSinceLooked ?? 0) > 0 ? refreshFindHits(state, workbook) : state;
  let ends = current.find?.ends ?? null;
  if (current.find === null || ends === null) return current;
  let activeCellPosition = activeCellPositionOrOrigin(current, workbook);
  let [fromFirst, toLast] = [compareFindPositions(activeCellPosition, ends.first), compareFindPositions(ends.last, activeCellPosition)];
  let isAfterFirst = step === 1 ? fromFirst >= 0 : fromFirst > 0;
  let isBeforeLast = step === 1 ? toLast > 0 : toLast >= 0;
  if (compareFindPositions(ends.first, ends.last) > 0 ? isAfterFirst || isBeforeLast : isAfterFirst && isBeforeLast) return current;
  return {
    ...current,
    find: {
      ...current.find,
      ...findHitsAroundActiveCell(current, workbook, current.find.text),
    },
  };
}
export function stepFindHit(state: PageState, step: Dynamic, workbook: ReadsWithTextMeasurer) {
  let current = findHitsReadyToStep(state, step, workbook);
  let hits = current.find?.hits ?? [];
  if (hits.length === 0) return goToFindHit(current, workbook, undefined);
  let activeHitIndex = indexOfActiveFindHit(current);
  if (activeHitIndex !== null) return goToFindHit(current, workbook, hits[(activeHitIndex + step + hits.length) % hits.length]);
  let activeCellPosition = activeCellPositionOrOrigin(current, workbook);
  let nextHitIndex = hits.findIndex((input?: Dynamic) => compareFindPositions(input, activeCellPosition) >= 0);
  let hitIndex = step === 1 ? (nextHitIndex === -1 ? 0 : nextHitIndex) : (nextHitIndex === -1 ? hits.length : nextHitIndex) - 1;
  return goToFindHit(current, workbook, hits[(hitIndex + hits.length) % hits.length]);
}
export function settleFind(before: Dynamic, state: PageState, workbook: ReadsWithTextMeasurer, canEdit?: Dynamic) {
  if (state.find?.isReplaceShown === true && !canEdit) return showFindReplace(state, false, workbook);
  if (state.find === null || state.find !== before.find) return state;
  if (state.sheetId !== before.sheetId) {
    let isInAllSheets = state.find.options.within === 'allSheets';
    let optionsOnNewSheet = isInAllSheets
      ? state.find.options
      : {
          ...state.find.options,
          within: null,
        };
    let findOnNewSheet = {
      ...state.find,
      options: optionsOnNewSheet,
      selectedAtFirst: null,
      roomAboveGrid: 0,
    };
    return isInAllSheets &&
      !findOnNewSheet.isCapped &&
      state.workbookChangeCount === before.workbookChangeCount &&
      state.formulasWorkedOutCount === before.formulasWorkedOutCount &&
      state.areFormulasShown === before.areFormulasShown
      ? {
          ...state,
          find: findOnNewSheet,
        }
      : refreshFindHits(
          {
            ...state,
            find: findOnNewSheet,
          },
          workbook,
        );
  }
  if (state.areFormulasShown !== before.areFormulasShown) return refreshFindHits(state, workbook);
  if (state.workbookChangeCount === before.workbookChangeCount && state.formulasWorkedOutCount === before.formulasWorkedOutCount) return state;
  let { options: findOptions, selectedAtFirst: selectedAtFirst, editsSinceLooked: editsSinceLooked } = state.find;
  let findWithin = findWithinOf(findOptions);
  let within = findWithin === null ? findOptions.within : (relocateFindArea(workbook, state.sheetId, findWithin) ?? findWithin);
  let nextFind = {
    ...state.find,
    options: {
      ...findOptions,
      within: within,
    },
    selectedAtFirst: selectedAtFirst === null ? null : relocateFindArea(workbook, state.sheetId, selectedAtFirst),
    editsSinceLooked: editsSinceLooked + 1,
  };
  return {
    ...state,
    find: nextFind,
  };
}
export const MAX_FIND_HITS = 1000;
export const DEFAULT_FIND_OPTIONS = {
  matchesCase: false,
  isWholeCell: false,
  isInFormulas: false,
  within: null,
};
export const findWithinOf = ({ within: within }: Dynamic) => (within === 'allSheets' ? null : within);
export const findQueryOf = ({ text: text, options: options }: Dynamic, workbook: WorkbookReads, sheetId?: Dynamic) => {
  let within = findWithinOf(options);
  return {
    ...options,
    text: text,
    within: within === null ? null : stretchesOfFindWithin(workbook, sheetId, within),
  };
};
export const NO_FIND_HITS = {
  hits: [],
  isCapped: false,
  ends: null,
  editsSinceLooked: 0,
};
export const MAX_FIND_SHOWN_CHARACTERS = 1000;
export const joinPeopleNames = (names?: Dynamic) => names.join(', ');
export const numberTextMatchesFind = (text?: Dynamic, query?: Dynamic, decimalSign?: Dynamic) =>
  textMatchesFind(stripGroupSeparators(text, decimalSign), query) || textMatchesFind(normalizeNoBreakSpaces(text), query);
export const STATE_WITH_FORMULAS_SHOWN = {
  areFormulasShown: true,
};
export const compareFindPositions = (one?: Dynamic, other?: Dynamic) =>
  one.sheetIndex !== other.sheetIndex
    ? one.sheetIndex - other.sheetIndex
    : one.rowIndex !== other.rowIndex
      ? one.rowIndex - other.rowIndex
      : one.columnIndex - other.columnIndex;
export const MAX_WORDS_IN_FOUND_TEXT = 10;
export const MAX_CHARACTERS_IN_FOUND_TEXT = 80;
export const FIND_BAR_BOX = {
  top: 8,
  fromRight: 12,
  width: 380,
  height: 36,
};
export const FIND_BAR_GAP = 8;
export const roomAboveGridForFind = ({ find: find, zoom: zoom }: Dynamic) =>
  find === null || find.isReplaceShown ? 0 : Math.max(0, (FIND_BAR_BOX.top + FIND_BAR_BOX.height + FIND_BAR_GAP) / zoom - find.roomAboveGrid);
export const activeCellPositionOrOrigin = ({ sheetId: sheetId, activeCell: activeCell }: Dynamic, workbook: WorkbookReads) => ({
  ...(workbook.positionOfCell(activeCell) ?? {
    rowIndex: 0,
    columnIndex: 0,
  }),
  sheetIndex: workbook.listSheets().findIndex((input?: Dynamic) => input.sheetId === sheetId),
});
export const indexOfActiveFindHit = ({ find: find, activeCell: activeCell }: Dynamic) => {
  let hitIndex = find === null ? -1 : find.hits.findIndex(({ cellId: cellId }: Dynamic) => isSameCell(cellId, activeCell));
  return hitIndex === -1 ? null : hitIndex;
};
export const isModalOpen = ({
  menu: menu,
  customNumberFormat: customNumberFormat,
  pasteThatWaits: pasteThatWaits,
  pickForWorkbook: pickForWorkbook,
  importOfAFile: importOfAFile,
  fileAwaited: fileAwaited,
  isListOfKeysOpen: isListOfKeysOpen,
  cellHistory: cellHistory,
  xlsxFileReady: xlsxFileReady,
}: Dynamic) =>
  isMenuHoldingField(menu) ||
  customNumberFormat?.typedIn === 'dialog' ||
  pasteThatWaits !== null ||
  pickForWorkbook !== null ||
  importOfAFile !== null ||
  fileAwaited !== null ||
  isListOfKeysOpen ||
  cellHistory !== null ||
  xlsxFileReady !== null;
export const isModalOpenBesidesCellHistory = (state?: Dynamic) =>
  isModalOpen({
    ...state,
    cellHistory: null,
  });
export const isModalOrVersionLookOpen = (state?: Dynamic) =>
  isModalOpenBesidesCellHistory(state) || (state.versionHistory?.look ?? null) !== null;
export const areaFindLooksIn = (state: PageState, workbook: WorkbookReads) =>
  selectedAreaToFindIn(state, workbook) ?? state.find?.selectedAtFirst?.at ?? null;
export const closeFind = (state?: Dynamic) => ({
  ...state,
  find: null,
});
