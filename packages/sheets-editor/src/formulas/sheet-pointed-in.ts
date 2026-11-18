import type { Dynamic } from '../dynamic.ts';
import { clampScrollOfView, findSheetById } from '../grid/layout.ts';
import { activeAnchorCell, areaOfPosition, selectedArea, scrollToShowActiveCell, selectionAtCell } from '../selection/model.ts';
import { areaToA1AsStored } from './from-words/where.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { isPointingPossible, pointAtCell, dragPointedReference } from './reference-pointing.ts';
import { firstPlaceInSheet } from '../state/places.ts';
import { isFormulaAskedOrProposed } from './from-words/actions.ts';
import { selectionAtPointer } from '../selection/pointer.ts';
import { withNoEffects } from '../state/transitions.ts';
import { endEntryOnPointerPress, pointerSelectRequest } from '../editor/commit-entry.ts';
import { showSheet } from '../state/sheet-tabs.ts';
import { withIfQueued } from '../model/edit-effects.ts';
import { isFormulaText } from '../chips/dropdown-pane-edits.ts';
import { carryFormulaOfAgentDiscarded } from '../agent/discarded-formula-note.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function showSheetPointedIn(state: PageState, workbook: ReadsWithTextMeasurer) {
  let place = state.placesLeft.find(({ sheetId: sheetId2 }: Dynamic) => sheetId2 === state.sheetPointedIn);
  if (place === undefined) return state;
  let { sheetId: sheetId, scrollLeft: scrollLeft, scrollTop: scrollTop } = place;
  return clampScrollOfView(
    {
      ...state,
      sheetId: sheetId,
      scrollLeft: scrollLeft,
      scrollTop: scrollTop,
    },
    workbook,
  );
}
export function restoreEntrySheet(entryState?: Dynamic, shown?: Dynamic, next?: Dynamic) {
  if (next === shown) return entryState;
  let { sheetId: sheetId, scrollLeft: scrollLeft, scrollTop: scrollTop } = entryState;
  let placesLeft = entryState.placesLeft.map(
    (place?: Dynamic) =>
      place.sheetId === next.sheetId
        ? {
            ...place,
            scrollLeft: next.scrollLeft,
            scrollTop: next.scrollTop,
          }
        : place,
  );
  return {
    ...next,
    sheetId: sheetId,
    scrollLeft: scrollLeft,
    scrollTop: scrollTop,
    placesLeft: placesLeft,
  };
}
export function actOnSheetPointedIn(state: PageState, workbook: ReadsWithTextMeasurer, act?: Dynamic) {
  if (state.sheetPointedIn === null) return act(state);
  let shown = showSheetPointedIn(state, workbook);
  return restoreEntrySheet(state, shown, act(shown));
}
export function sheetShownLastDone(state: PageState, workbook: WorkbookReads, pointedSheetId?: Dynamic) {
  let entrySheetName = findSheetById(workbook, state.sheetId)?.name;
  if (entrySheetName === undefined) return null;
  if (pointedSheetId === null)
    return {
      what: 'sheetShown',
      name: entrySheetName,
    };
  let pointedSheetName = findSheetById(workbook, pointedSheetId)?.name;
  let position = workbook.positionOfCell(activeAnchorCell(state, workbook));
  if (pointedSheetName === undefined || position === null) return null;
  let entryCell = areaToA1AsStored(areaOfPosition(position), ownRowOrderOfSheet(workbook, state.sheetId));
  return {
    what: 'sheetShownForFormula',
    name: pointedSheetName,
    entryCell: entryCell,
    entrySheet: entrySheetName,
  };
}
export function canSwitchSheetWhileEditing(mode?: Dynamic, caret?: Dynamic, isBackToEntrySheet?: Dynamic, mayPoint?: Dynamic) {
  if (mode.kind !== 'editing') return false;
  return isBackToEntrySheet || (mayPoint && isPointingPossible(mode, caret));
}
export function sheetIdAtOffset(sheetId: Dynamic, workbook: WorkbookReads, offset?: Dynamic) {
  let sheets = workbook.listSheets();
  return sheets[sheets.findIndex((sheet?: Dynamic) => sheet.sheetId === sheetId) + offset]?.sheetId;
}
export function sheetsToPointInFor(state: PageState, workbook: WorkbookReads, allowsAnother?: Dynamic) {
  let { sheetId: sheetId, sheetPointedIn: sheetPointedIn } = state;
  let targetAt = (offset?: Dynamic) => {
    let targetSheetId = sheetIdAtOffset(sheetPointedIn ?? sheetId, workbook, offset);
    if (targetSheetId === undefined || firstPlaceInSheet(workbook, targetSheetId) === null) return null;
    if (targetSheetId === sheetId) return 'entrysOwn';
    return allowsAnother && !isFormulaAskedOrProposed(state) ? 'another' : null;
  };
  return {
    before: targetAt(-1),
    after: targetAt(1),
  };
}
export function switchSheetWhileEditing(state: PageState, workbook: ReadsWithTextMeasurer, sheetId?: Dynamic, caret?: Dynamic, allowsAnother?: Dynamic) {
  let { mode: mode, placesLeft: placesLeft, sheetPointedIn: sheetPointedIn } = state;
  let isBackToEntrySheet = sheetId === state.sheetId && sheetPointedIn !== null;
  let mayPoint = allowsAnother && !isFormulaAskedOrProposed(state);
  if (!canSwitchSheetWhileEditing(mode, caret, isBackToEntrySheet, mayPoint)) return null;
  if (sheetId === (sheetPointedIn ?? state.sheetId)) return state;
  if (isBackToEntrySheet) return withSheetPointedIn(state, workbook, null);
  let placeLeft = placesLeft.find((place2?: Dynamic) => place2.sheetId === sheetId);
  let place = placeLeft !== undefined && selectedArea(placeLeft, workbook) !== null ? placeLeft : firstPlaceInSheet(workbook, sheetId);
  if (place === null) return null;
  return {
    ...withSheetPointedIn(scrollToShowActiveCell(state, workbook), workbook, sheetId),
    placesLeft:
      placeLeft === undefined ? [place, ...placesLeft] : placesLeft.map((place2?: Dynamic) => (place2 === placeLeft ? place : place2)),
  };
}
export function switchToNextSheetWhileEditing(state: PageState, workbook: ReadsWithTextMeasurer, offset?: Dynamic, caret?: Dynamic) {
  let sheetId = sheetIdAtOffset(state.sheetPointedIn ?? state.sheetId, workbook, offset);
  return sheetId === undefined ? state : (switchSheetWhileEditing(state, workbook, sheetId, caret, true) ?? state);
}
export function pressCellsInSheetPointedIn(state: PageState, shown: Dynamic, workbook: ReadsWithTextMeasurer, pointer?: Dynamic) {
  let selection = selectionAtPointer(shown, workbook, pointer);
  if (selection === null) return withNoEffects(state);
  let selected = 'activeCell' in selection ? selection : selectionAtCell(selection);
  let ended = endEntryOnPointerPress(state, workbook, null);
  let { lastDone: lastDone } = ended.state;
  let discardNotice = lastDone?.what === 'formulaOfAgentDiscarded' ? lastDone : null;
  if (ended.state.mode.kind !== 'editing')
    return withNoEffects({
      ...showSheet(ended.state, workbook, shown.sheetId),
      ...selected,
      lastDone: discardNotice,
    });
  let ifQueued = {
    ...('activeCell' in selection
      ? pointerSelectRequest(selection)
      : {
          select: selected,
          foundBy: 'pointer',
        }),
    thenSheet: shown.sheetId,
  };
  let effects = ended.effects.map((effect?: Dynamic) => withIfQueued(effect, ifQueued));
  return {
    state: ended.state,
    effects: effects,
  };
}
export function stepInSheetPointedIn(state: PageState, event: Dynamic, { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic) {
  if (state.sheetPointedIn === null) return null;
  let shown = showSheetPointedIn(state, reads);
  if (event.kind === 'pointerPressed') {
    let pointedOrScrollTop = refusalOfEveryEdit === null && !isFormulaAskedOrProposed(state) ? pointAtCell(shown, event, reads) : null;
    return pointedOrScrollTop === null
      ? pressCellsInSheetPointedIn(state, shown, reads, event)
      : withNoEffects(restoreEntrySheet(state, shown, pointedOrScrollTop));
  }
  if (event.kind === 'pointerDragged') {
    if (state.dragging?.kind !== 'pointing') return withNoEffects(state);
    return withNoEffects(restoreEntrySheet(state, shown, dragPointedReference(shown, event, reads)));
  }
  if (event.kind === 'wheelTurned') {
    let scrollLeft = shown.scrollLeft + event.deltaX;
    let pointedOrScrollTop = shown.scrollTop + event.deltaY;
    let pagesTurnedForReader = shown.pagesTurnedForReader + (event.isPageForReader === true ? 1 : 0);
    let clamped = clampScrollOfView(
      {
        ...shown,
        scrollLeft: scrollLeft,
        scrollTop: pointedOrScrollTop,
        pagesTurnedForReader: pagesTurnedForReader,
      },
      reads,
    );
    let isUnmoved = clamped.scrollLeft === shown.scrollLeft && clamped.scrollTop === shown.scrollTop;
    return withNoEffects(restoreEntrySheet(state, shown, isUnmoved ? shown : clamped));
  }
  if (event.kind === 'menuAsked' && event.at !== null) return pressCellsInSheetPointedIn(state, shown, reads, event.at);
  return event.kind === 'pointerPressedTwice' ? withNoEffects(state) : null;
}
export function dropSheetPointedInWhenDone(state: PageState, workbook: WorkbookReads) {
  let { sheetPointedIn: sheetPointedIn, mode: mode } = state;
  if (sheetPointedIn === null) return state;
  if (sheetPointedIn === state.sheetId)
    return {
      ...state,
      sheetPointedIn: null,
    };
  if (!(mode.kind === 'editing' && isFormulaText(mode.text)) || firstPlaceInSheet(workbook, sheetPointedIn) === null)
    return carryFormulaOfAgentDiscarded(state, withSheetPointedIn(state, workbook, null));
  return state.calendar === null
    ? state
    : {
        ...state,
        calendar: null,
      };
}
export const withSheetPointedIn = (state: PageState, workbook: WorkbookReads, sheetId?: Dynamic) => ({
  ...state,
  sheetPointedIn: sheetId,
  dragging: null,
  lastDone: sheetShownLastDone(state, workbook, sheetId),
});
