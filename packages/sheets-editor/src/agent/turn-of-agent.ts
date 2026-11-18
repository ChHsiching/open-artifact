import type { Dynamic } from '../dynamic.ts';
import { mergeChangedCellAreas, changesSpanWholeLines, AGENT_CHANGE_MAX_WAIT_MS, mergeChangesByAgent } from './changes-by-agent.ts';
import { areaOfPosition, areaGrownOverMerges, unionOfAreas } from '../selection/model.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { cellsAreaWidth, cellsAreaHeight } from '../grid/geometry.ts';
import { findSheetById } from '../grid/layout.ts';
import { canCommentModePickNow } from '../comments/comment-state.ts';
import { keyActInState } from '../keys/key-pressed.ts';
import { filterButtonAtActiveCell } from '../tables/own-filter-list.ts';
import { withNoEffects } from '../state/transitions.ts';
import { startTakingBack } from '../history/version-history.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function placesOfDoneCells(cellIds: Dynamic, sheetId: Dynamic, workbook: WorkbookReads) {
  if (cellIds.length > MOST_DONE_CELLS) return [];
  let positions = cellIds.flatMap((cellId?: Dynamic) => workbook.positionOfCell(cellId) ?? []);
  if (positions.length < cellIds.length) return [];
  let mergedAreas = mergeChangedCellAreas(positions, sheetId, workbook);
  if (mergedAreas !== null && mergedAreas.length <= MOST_DONE_PLACES) return mergedAreas;
  let [firstArea, ...otherAreas] = mergedAreas ?? positions.map(areaOfPosition);
  return firstArea === undefined ? [] : [areaGrownOverMerges(workbook, sheetId, otherAreas.reduce(unionOfAreas, firstArea))];
}
export function doneByAgentOf(changes: Dynamic, sheetId: Dynamic, { reads: reads, revisionHeld: revisionHeld }: Dynamic) {
  if (changes === null) return null;
  let cellsOfSheet = (sheetId2?: Dynamic) => changes.cellsBySheet?.get(sheetId2) ?? [];
  let cellCountOf = (sheetId2?: Dynamic) => cellsOfSheet(sheetId2).length;
  let [firstSheet, ...otherSheets] = reads.listSheets().filter(({ sheetId: sheetId2 }: Dynamic) => cellCountOf(sheetId2) > 0);
  let wait = {
    ms: DONE_CARD_WAIT_MS,
  };
  if (firstSheet === undefined)
    return {
      cells: null,
      isCardUp: true,
      wait: wait,
    };
  let count = [firstSheet, ...otherSheets].reduce(
    (total: Dynamic, { sheetId: sheetId2 }: Dynamic) => total + cellCountOf(sheetId2),
    0,
  );
  let sheetsWithPlaces = revisionHeld === null || count > MOST_DONE_CELLS ? [] : [firstSheet, ...otherSheets];
  let placesBySheet = new (Map as Dynamic)(
    sheetsWithPlaces.map(({ sheetId: sheetId2 }: Dynamic) => [sheetId2, placesOfDoneCells(cellsOfSheet(sheetId2), sheetId2, reads)]),
  );
  return {
    cells: {
      count: count,
      isInSeveralSheets: otherSheets.length > 0,
      otherSheet: otherSheets.length === 0 && firstSheet.sheetId !== sheetId ? firstSheet.name : null,
      sheetNames: [firstSheet, ...otherSheets].map(({ name: name }: Dynamic) => name),
      placesBySheet: placesBySheet,
      places:
        otherSheets.length === 0
          ? (placesBySheet.get(firstSheet.sheetId) ?? []).map((area?: Dynamic) => areaToA1AsStored(area, firstSheet.ownRowOrder))
          : [],
    },
    isCardUp: true,
    wait: wait,
  };
}
export function undoOfTurnOf({ edits: edits }: Dynamic, { cells: cells, wait: wait }: Dynamic, workbook: WorkbookReads) {
  if (edits === null) return null;
  let [firstSheetName = null] = cells?.sheetNames ?? [];
  let otherSheet = cells?.isInSeveralSheets === false && workbook.listSheets().length > 1 ? firstSheetName : null;
  let blocks = Array.from<Dynamic, Dynamic>(
    cells?.placesBySheet ?? [],
    ([sheetId, areas]: Dynamic) =>
      areas.flatMap(
        ({ topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount }: Dynamic) => {
          let activeCell = workbook.cellIdAt(sheetId, topRowIndex, leftColumnIndex);
          let selectionCorner = workbook.cellIdAt(sheetId, topRowIndex + rowCount - 1, leftColumnIndex + columnCount - 1);
          return activeCell === null || selectionCorner === null
            ? []
            : [
                {
                  activeCell: activeCell,
                  selectionCorner: selectionCorner,
                },
              ];
        },
      ),
  ).flat();
  return {
    cells:
      cells === null
        ? null
        : {
            ...cells,
            otherSheet: otherSheet,
          },
    edits: edits,
    blocks: blocks,
    wait: {
      ...wait,
    },
  };
}
export function workingLineAt(elapsedMs?: Dynamic, lineCount?: Dynamic) {
  let sinceFirst = elapsedMs - WORKING_LINE_FIRST_MS;
  if (sinceFirst < 0)
    return {
      line: 0,
      forMs: -sinceFirst,
    };
  let sinceRound = sinceFirst - (lineCount - 1) * WORKING_LINE_MS;
  let [lineOffset, intoPeriod, periodMs] = sinceRound < 0 ? [1, sinceFirst, WORKING_LINE_MS] : [0, sinceRound, WORKING_LINE_LATER_MS];
  return {
    line: (lineOffset + Math.floor(intoPeriod / periodMs)) % lineCount,
    forMs: periodMs - (intoPeriod % periodMs),
  };
}
export function workingCardRoom(state: PageState, workbook: WorkbookReads, view?: Dynamic) {
  let room = {
    width: cellsAreaWidth(state),
    height: cellsAreaHeight(state) - state.heightUnderWhatFloats,
  };
  return room.width >= WORKING_CARD_SIZE.width && room.height >= WORKING_CARD_SIZE.height && showsWorkingOnBlankSheet(state, workbook, view)
    ? room
    : null;
}
export function writtenInTurnOfAgentWith(written: Dynamic, changes: Dynamic, workbook: WorkbookReads, moreChanges: Dynamic = []) {
  let changesOfViewer = changes.filter(
    ({ isOfViewer: isOfViewer, cells: cells }: Dynamic) =>
      isOfViewer === true &&
      !changesSpanWholeLines(
        [
          {
            cells: cells,
          },
        ],
        workbook,
      ),
  );
  if (changesOfViewer.length + moreChanges.length === 0) return;
  return {
    writtenInTurnOfAgent: [...written, ...[...moreChanges, ...changesOfViewer].map(({ cells: cells }: Dynamic) => cells)],
    waitForNextEditOfAgent: {
      ms: AGENT_CHANGE_MAX_WAIT_MS,
    },
  };
}
export function setAgentWorking(
  state: PageState,
  isWorking?: Dynamic,
  turnChanges?: Dynamic,
  writtenBefore?: Dynamic,
  turnContext?: Dynamic,
) {
  if (isWorking === state.isAgentWorking) return state;
  let done = isWorking || turnContext.refusalOfEveryEdit !== null ? null : doneByAgentOf(turnChanges, state.sheetId, turnContext);
  let undoOfTurn =
    done === null || turnChanges === null || state.isUndoOfTurnNotToBeHad ? null : undoOfTurnOf(turnChanges, done, turnContext.reads);
  let doneShown =
    done !== null && undoOfTurn !== null
      ? {
          ...done,
          isCardUp: false,
        }
      : done;
  let workingState = {
    ...state,
    isAgentWorking: isWorking,
    turnOfAgent: 'nothingSaid',
    writtenInTurnOfAgent: [],
    waitForNextEditOfAgent: null,
    ...(isWorking && writtenInTurnOfAgentWith([], state.changesByAgent.filter(isChangeOfAgentSettled), turnContext.reads, writtenBefore)),
    doneByAgent: doneShown,
    undoOfTurnOffered: undoOfTurn,
  };
  if (isWorking) {
    let hasEdited = turnContext.refusalOfEveryEdit === null && state.changesByAgent.some(isChangeOfAgentSettled);
    if (isAgentWorkingOnBlank(workingState, turnContext))
      return {
        ...workingState,
        turnOfAgent: hasEdited ? 'saidAndHasEdited' : 'saidToBeWorking',
        saidOfAgent: {
          what: 'isWorking',
          staysWhileCursorShows: true,
        },
      };
    return hasEdited ? sayAgentHasEdited(workingState) : workingState;
  }
  if (doneShown !== null)
    return {
      ...workingState,
      saidOfAgent: {
        what: 'madeChanges',
        done: doneShown,
        ...(undoOfTurn !== null && {
          isUndoOffered: true,
        }),
      },
    };
  if (state.turnOfAgent === 'saidAndHasEdited')
    return {
      ...workingState,
      saidOfAgent: {
        what: 'madeChanges',
      },
    };
  return state.saidOfAgent?.what === 'isWorking'
    ? {
        ...workingState,
        saidOfAgent: null,
      }
    : workingState;
}
export function pointDoneCardAtSheet(state: PageState, workbook: WorkbookReads) {
  let { doneByAgent: doneByAgent, saidOfAgent: saidOfAgent } = state;
  if (doneByAgent === null || doneByAgent.cells === null || doneByAgent.cells.isInSeveralSheets) return state;
  let [sheetName = null] = doneByAgent.cells.sheetNames;
  let otherSheet = sheetName === findSheetById(workbook, state.sheetId)?.name ? null : sheetName;
  let done = {
    ...doneByAgent,
    cells: {
      ...doneByAgent.cells,
      otherSheet: otherSheet,
    },
  };
  let said =
    saidOfAgent?.what === 'madeChanges'
      ? {
          ...saidOfAgent,
          done: done,
        }
      : saidOfAgent;
  return {
    ...state,
    doneByAgent: done,
    saidOfAgent: said,
  };
}
export function changesByAgentArrived(state: PageState, changes: Dynamic, { refusalOfEveryEdit: refusalOfEveryEdit, reads: reads }: Dynamic) {
  let merged = mergeChangesByAgent(state.changesByAgent, changes, reads);
  let stateMerged = {
    ...state,
    changesByAgent: merged,
    ...(state.isAgentWorking && writtenInTurnOfAgentWith(state.writtenInTurnOfAgent, merged.filter(isChangeNotYetCounted(state)), reads)),
  };
  if (!changes.some(isChangeNotYetCounted(state)) || !state.isAgentWorking || refusalOfEveryEdit !== null) return stateMerged;
  return state.turnOfAgent === 'nothingSaid'
    ? sayAgentHasEdited(stateMerged)
    : {
        ...stateMerged,
        turnOfAgent: 'saidAndHasEdited',
      };
}
export function doesEventKeepUndoOffer(state: PageState, event?: Dynamic, context?: Dynamic) {
  if (event.kind === 'menuAsked') return event.inContextBar !== undefined;
  if (event.kind === 'pointerPressed') return canCommentModePickNow(state);
  if (event.kind !== 'keyPressed') return false;
  let isPlainKey = !event.isShiftHeld && !event.isModifierHeld && !event.isAltHeld && !event.isRepeat;
  if (event.key === 'Enter' && isPlainKey && canCommentModePickNow(state)) return true;
  let keyAct = keyActInState(state, event, context);
  let opensFilterList =
    keyAct?.kind === 'showSheetBeside' && keyAct.by === 1 && filterButtonAtActiveCell(state, context.reads, state.activeCell) !== null;
  return keyAct === null || (KEY_ACTS_KEEPING_UNDO_OFFER.has(keyAct.kind) && !opensFilterList);
}
export function dropUndoOfTurnOnEdit(before: Dynamic, state: PageState, event?: Dynamic, effects?: Dynamic, context?: Dynamic) {
  let isTakingBackTurn = before.takingBack?.what.kind === 'turnOfAgent' || state.takingBack?.what.kind === 'turnOfAgent';
  if (state.undoOfTurnOffered === null || isTakingBackTurn) return state;
  let isEntryUnchanged = event.kind === 'editTextChanged' && state.mode.kind === 'editing' && state.mode.text === state.mode.textAtStart;
  return (state.mode.kind === 'editing' &&
    (before.mode.kind !== 'editing' || (before.mode.text === before.mode.textAtStart && before.mode.text !== state.mode.text)) &&
    !EVENTS_KEEPING_UNDO_WHILE_EDITING.has(event.kind) &&
    !isEntryUnchanged) ||
    effects.some(({ kind: kind }: Dynamic) => kind === 'queueEdit') ||
    (doesEventDropDoneCard(event) && !doesEventKeepUndoOffer(before, event, context))
    ? {
        ...state,
        undoOfTurnOffered: null,
      }
    : state;
}
export function dropDoneCardOnEvent(state: PageState, event: Dynamic) {
  let { doneByAgent: doneByAgent, mode: mode, isChatBehindButton: isChatBehindButton, isComposerOpen: isComposerOpen } = state;
  let isDroppedByEvent = mode.kind === 'editing' || doesEventDropDoneCard(event);
  let isChatShown = !isChatBehindButton || isComposerOpen;
  return doneByAgent?.isCardUp === true && (isDroppedByEvent || isChatShown)
    ? {
        ...state,
        doneByAgent: {
          ...doneByAgent,
          isCardUp: false,
        },
      }
    : state;
}
export const DONE_CARD_WAIT_MS = 8000;
export const MOST_DONE_PLACES = 3;
export const MOST_DONE_CELLS = 1e4;
export const undoTurnOfAgent = (state: PageState, workbook: ReadsWithTextMeasurer) =>
  state.undoOfTurnOffered === null
    ? withNoEffects(state)
    : startTakingBack(state, workbook, {
        kind: 'turnOfAgent',
        edits: state.undoOfTurnOffered.edits,
      });
export const KEY_ACTS_KEEPING_UNDO_OFFER = new (Set as Dynamic)([
  'move',
  'extendSelection',
  'jump',
  'selectAll',
  'selectTableOrAll',
  'selectWhole',
  'showOrHideFormulas',
  'showSheetBeside',
  'goOnOutOfGrid',
  'letGo',
  'cancelEdit',
  'collapseEntry',
  'undoOrRedo',
]);
export const EVENTS_KEEPING_UNDO_WHILE_EDITING = new (Set as Dynamic)(['focusCameBack', 'entryOfPageBeforeFound']);
export const dropUndoOfTurnWaitedOut = (state: PageState, wait?: Dynamic) =>
  state.undoOfTurnOffered?.wait === wait && state.takingBack?.what.kind !== 'turnOfAgent'
    ? {
        ...state,
        undoOfTurnOffered: null,
      }
    : state;
export const agentActivityChangedEvent = (activity?: Dynamic) => ({
  kind: 'agentActivityChanged',
  isWorking: activity.isWorking,
  ...(activity.changedInTurn !== null && {
    changedInTurn: activity.changedInTurn,
  }),
  ...(activity.isFirstWord
    ? {
        isAsSpreadsheetOpens: true,
      }
    : undefined),
  ...(activity.isSheetJustMade && !activity.hasPersonActedInSheet
    ? {
        isSheetJustMade: true,
      }
    : undefined),
  ...(activity.isFirstWord && activity.hasShellAnswered
    ? {
        hasShellAnswered: true,
      }
    : undefined),
});
export const showsWorkingOnBlankSheet = (
  { isAgentWorking: isAgentWorking, mode: mode }: Dynamic,
  reads: WorkbookReads,
  isEveryEditRefused?: Dynamic,
) => isAgentWorking && reads.isEveryCellBlank && mode.kind === 'navigating' && !isEveryEditRefused;
export const WORKING_CARD_SIZE = {
  width: 176,
  height: 56,
};
export const WORKING_LINE_FIRST_MS = 3000;
export const WORKING_LINE_MS = 5000;
export const WORKING_LINE_LATER_MS = 1e4;
export const isAgentWorkingOnBlank = (state: Dynamic, { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic) =>
  showsWorkingOnBlankSheet(state, reads, refusalOfEveryEdit !== null);
export const sayAgentHasEdited = (state?: Dynamic) => ({
  ...state,
  turnOfAgent: 'saidAndHasEdited',
  saidOfAgent: {
    what: 'isWorking',
    staysWhileCursorShows: false,
  },
});
export const isChangeOfAgentSettled = ({ fadeBeginsAtMs: fadeBeginsAtMs }: Dynamic) => fadeBeginsAtMs === null;
export const isChangeNotYetCounted =
  ({ changesByAgent: changesByAgent }: Dynamic) =>
  ({ revision: revision }: Dynamic) =>
    !changesByAgent.some(
      (change?: Dynamic) => [change, ...change.joinedWith].some((joinedChange?: Dynamic) => joinedChange.revision === revision),
    );
export const stopSayingWorkingWhenCursorGone = (state: PageState, turnContext?: Dynamic) =>
  state.saidOfAgent?.what === 'isWorking' && state.saidOfAgent.staysWhileCursorShows && !isAgentWorkingOnBlank(state, turnContext)
    ? {
        ...state,
        saidOfAgent: {
          what: 'isWorking',
          staysWhileCursorShows: false,
        },
      }
    : state;
export const EVENTS_THAT_DROP_DONE_CARD = new (Set as Dynamic)([
  'keyPressed',
  'pointerPressed',
  'copyChosen',
  'cutChosen',
  'pasteChosen',
  'chartPasteChosen',
  'menuAsked',
  'linesAtEndAsked',
]);
export const doesEventDropDoneCard = (event?: Dynamic) =>
  EVENTS_THAT_DROP_DONE_CARD.has(event.kind) || (event.kind === 'placedViewActedOn' && event.act.kind === 'takeHold' && !event.act.isByFinger);
export const isMadeChangesWaitingFor = (said?: Dynamic, doneByAgent?: Dynamic) =>
  said?.what === 'madeChanges' && said.done !== undefined && said.done.wait === doneByAgent?.wait;
