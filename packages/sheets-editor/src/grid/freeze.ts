import type { Dynamic } from '../dynamic.ts';
import { layoutOfView, sheetOfViewOrEmpty, clampScrollOfView } from './layout.ts';
import { frozenCountsThatFit, freezeGripAt, dropIndexAtPointer } from './geometry.ts';
import { selectedArea } from '../selection/model.ts';
import { queueEdit, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { shownCellText } from '../format/shown-text.ts';
import { cellBlockOfCorners } from '../model/cell-blocks.ts';
import { areaRefBetween } from '../model/workbook.ts';
import { LIGHT_GRAY_HEX } from '../model/cell-format.ts';
import { withNoEffects } from '../state/transitions.ts';
import { holdFreezingAndKeepActiveCellInView } from '../selection/keep-in-view.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function freezeChoiceList(countInForce?: Dynamic, countUpToSelection?: Dynamic, roomFor?: Dynamic, shownCount?: Dynamic) {
  let counts = [...new (Set as Dynamic)([...FREEZE_COUNTS_OFFERED, countUpToSelection])].filter(
    (count?: Dynamic) => count < shownCount && count !== countInForce,
  );
  counts.push(countInForce);
  counts.sort((count?: Dynamic, otherCount?: Dynamic) => count - otherCount);
  return counts.map(
    (count?: Dynamic) => ({
      count: count,
      isInForce: count === countInForce,
      isRoom: count <= roomFor,
      isUpToSelection: count === countUpToSelection,
    }),
  );
}
export function suggestedFreezeChoice(choices?: Dynamic) {
  let countInForce = choices.find((choice?: Dynamic) => choice.isInForce)?.count ?? 0;
  let upToSelection = choices.find((choice?: Dynamic) => choice.isUpToSelection && choice.count > countInForce);
  if (upToSelection?.isRoom === true || countInForce === 0) return upToSelection ?? null;
  return choices.find((choice?: Dynamic) => choice.count === 0) ?? null;
}
export function freezeChoicesOf(state: PageState, workbook: ReadsWithTextMeasurer) {
  let layout = layoutOfView(state, workbook);
  let frozen = sheetOfViewOrEmpty(state, workbook);
  let fitting = frozenCountsThatFit(
    {
      frozenRowCount: layout.rowCount,
      frozenColumnCount: layout.columnCount,
    },
    layout,
    state,
  );
  let selectedArea2 = selectedArea(state, workbook);
  return {
    rows: freezeChoiceList(
      frozen.frozenRowCount,
      selectedArea2 === null ? 0 : selectedArea2.topRowIndex + selectedArea2.rowCount,
      fitting.frozenRowCount,
      layout.rowCount,
    ),
    columns: freezeChoiceList(
      frozen.frozenColumnCount,
      selectedArea2 === null ? 0 : selectedArea2.leftColumnIndex + selectedArea2.columnCount,
      fitting.frozenColumnCount,
      layout.columnCount,
    ),
  };
}
export function queueFreezeEdit(state: PageState, workbook: WorkbookReads, what?: Dynamic, count?: Dynamic, ifQueued?: Dynamic) {
  let { sheetId: sheetId } = state;
  let lastFrozenCell = what === 'rows' ? workbook.cellIdAt(sheetId, count - 1, 0) : workbook.cellIdAt(sheetId, 0, count - 1);
  let settings =
    what === 'rows'
      ? {
          lastFrozenRow: lastFrozenCell?.rowId ?? null,
        }
      : {
          lastFrozenColumn: lastFrozenCell?.columnId ?? null,
        };
  return queueEdit(
    state,
    {
      kind: 'setSheetSettings',
      sheetId: sheetId,
      settings: settings,
    },
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      ...ifQueued,
    },
  );
}
export function headerDressingEdits(workbook: WorkbookReads, sheetId?: Dynamic, rowCount?: Dynamic) {
  let headers: Dynamic = [];
  while (headers.length < MOST_HEADER_COLUMNS_DRESSED) {
    let cellId = workbook.cellIdAt(sheetId, rowCount - 1, headers.length);
    let cell = cellId === null ? null : workbook.cellOf(cellId);
    if (cellId === null || cell === null) break;
    headers.push({
      cellId: cellId,
      text: shownCellText(cell, 1 / 0, workbook.decimalSign).text,
    });
  }
  let firstCell = workbook.cellIdAt(sheetId, 0, 0);
  let lastHeader = headers.at(-1);
  let headerArea =
    firstCell === null || lastHeader === undefined ? null : cellBlockOfCorners(workbook, areaRefBetween(firstCell, lastHeader.cellId));
  if (firstCell === null || lastHeader === undefined || headerArea === null) return [];
  let hasLongTextBelow = (columnIndex?: Dynamic) =>
    Array.from<Dynamic, Dynamic>(
      {
        length: ROWS_SCANNED_FOR_LONG_TEXT,
      },
      (input?: Dynamic, rowIndex?: Dynamic) => workbook.cellIdAt(sheetId, rowIndex, columnIndex),
    ).some((cellId?: Dynamic) => {
      let cell = cellId === null ? null : workbook.cellOf(cellId);
      return cell !== null && shownCellText(cell, 1 / 0, workbook.decimalSign).text.length > HEADER_WIDTH_CAP.inCharacters;
    });
  return [
    {
      kind: 'formatCells',
      cells: headerArea,
      format: {
        fillColor: {
          kind: 'rgb',
          hex: LIGHT_GRAY_HEX,
        },
      },
    },
    {
      kind: 'fitColumns',
      sheetId: sheetId,
      oneColumn: firstCell.columnId,
      otherColumn: lastHeader.cellId.columnId,
      noNarrowerThan: headers.map(
        ({ cellId: cellId, text: text }: Dynamic) => ({
          column: cellId.columnId,
          widthInPixels: Math.min(HEADER_WIDTH_CAP.inPixels, Math.ceil(text.length * HEADER_FIT_WIDTHS.ofACharacter) + HEADER_FIT_WIDTHS.besideText),
        }),
      ),
    },
    ...headers.flatMap(
      ({ cellId: { columnId: columnId } }: Dynamic, columnIndex?: Dynamic) =>
        hasLongTextBelow(columnIndex)
          ? [
              {
                kind: 'setColumnWidths',
                sheetId: sheetId,
                oneColumn: columnId,
                otherColumn: columnId,
                widthInPixels: HEADER_WIDTH_CAP.inPixels,
              },
            ]
          : [],
    ),
  ];
}
export function applyFreezeChoice(state: PageState, workbook: ReadsWithTextMeasurer, { what: what, count: count }: Dynamic) {
  let choice = freezeChoicesOf(state, workbook)[what].find((choice2?: Dynamic) => choice2.count === count);
  if (choice === undefined || !choice.isRoom || choice.isInForce) return withNoEffects(state);
  return queueFreezeEdit(state, workbook, what, count, {
    done: {
      what: what === 'rows' ? 'rowsFrozen' : 'columnsFrozen',
      count: count,
    },
  });
}
export function startFreezeDrag(state: PageState, pointer: Dynamic, { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic) {
  if (refusalOfEveryEdit !== null || state.mode.kind === 'editing' || pointer.isByFinger) return null;
  let layout = layoutOfView(state, reads);
  let what = freezeGripAt(pointer, layout);
  if (what === null) return null;
  let { sheetId: sheetId } = state;
  let pressedAt = {
    x: pointer.x,
    y: pointer.y,
  };
  let countAtPress = what === 'rows' ? layout.frozenRowCount : layout.frozenColumnCount;
  return {
    ...state,
    menu: null,
    calendar: null,
    dropdown: null,
    peopleList: null,
    dragging: {
      kind: 'freezing',
      sheetId: sheetId,
      what: what,
      pressedAt: pressedAt,
      countAtPress: countAtPress,
      count: null,
    },
  };
}
export function dragFreezeTo(state: Dynamic, dragging: Dynamic, pointer: Dynamic, reads: ReadsWithTextMeasurer) {
  let scrolled = scrollToStartAlong(state, dragging.what);
  let layout = layoutOfView(scrolled, reads);
  let shownCount = dragging.what === 'rows' ? layout.rowCount : layout.columnCount;
  let count = Math.min(dropIndexAtPointer(pointer, scrolled, layout, scrolled, dragging.what), shownCount - 1);
  let fitting = frozenCountsThatFit(
    {
      frozenRowCount: count,
      frozenColumnCount: count,
    },
    layout,
    scrolled,
  );
  let countThatFits = dragging.what === 'rows' ? fitting.frozenRowCount : fitting.frozenColumnCount;
  return countThatFits === dragging.count
    ? state
    : {
        ...state,
        dragging: {
          ...dragging,
          count: countThatFits,
        },
      };
}
export function finishFreezeDrag(state: Dynamic, drag: Dynamic, { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic) {
  let view = clampScrollOfView(
    {
      ...state,
      dragging: null,
    },
    reads,
  );
  if (drag.count === null || drag.count === drag.countAtPress) return withNoEffects(view);
  if (drag.sheetId !== view.sheetId) return withNoEffects(view);
  if (refusalOfEveryEdit !== null)
    return withNoEffects({
      ...view,
      notice: {
        kind: 'editRefused',
        why: refusalOfEveryEdit,
        asked: 'otherEdit',
      },
    });
  let scrolledView = scrollToStartAlong(
    {
      ...view,
      lastDone: null,
    },
    drag.what,
  );
  let { rowCount: rowCount, columnCount: columnCount } = layoutOfView(view, reads);
  let count = Math.min(drag.count, (drag.what === 'rows' ? rowCount : columnCount) - 1);
  let { scrollLeft: scrollLeft, scrollTop: scrollTop } = view;
  let scrollIfRefused = {
    scrollLeft: scrollLeft,
    scrollTop: scrollTop,
  };
  let queued = queueFreezeEdit(scrolledView, reads, drag.what, count, {
    done: null,
    scrollIfRefused: scrollIfRefused,
  });
  return holdFreezingAndKeepActiveCellInView(
    scrolledView,
    queued,
    {
      ...drag,
      count: count,
    },
    reads,
  );
}
export const FREEZE_COUNTS_OFFERED = [0, 1, 2];
export const freezeFirstRows = (state: PageState, workbook: WorkbookReads, rowCount: Dynamic, { isThenDressed: isThenDressed }: Dynamic) =>
  queueFreezeEdit(state, workbook, 'rows', rowCount, {
    done: null,
    isOfOneAct: true,
    ...(isThenDressed && {
      thenEdits: headerDressingEdits(workbook, state.sheetId, rowCount),
      undoOffer: state.undoOffer,
      isOnlyDressing: true,
      isLeftUnselectedByUndo: true,
    }),
  });
export const HEADER_FIT_WIDTHS = {
  ofACharacter: 7.6,
  besideText: 44,
};
export const HEADER_WIDTH_CAP = {
  inCharacters: 48,
  inPixels: 360,
};
export const ROWS_SCANNED_FOR_LONG_TEXT = 60;
export const MOST_HEADER_COLUMNS_DRESSED = 1000;
export const scrollToStartAlong = (state?: Dynamic, what?: Dynamic) =>
  what === 'rows'
    ? {
        ...state,
        scrollTop: 0,
      }
    : {
        ...state,
        scrollLeft: 0,
      };
