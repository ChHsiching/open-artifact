import type { Dynamic } from '../dynamic.ts';
import { isSameToldSelection, selectionInRowOrder } from './selections.ts';
import { isViewFreeToFollow, showChangeByAgent, doesPersonTakeViewBack, stepFollowAgent } from '../agent/follow-agent.ts';
import { isSameCell, isSameSelection } from '../selection/model.ts';
import { stepShownByAgent } from '../agent/shown-by-agent.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function changedSelectionOfUser(before?: Dynamic, state?: Dynamic, userId?: Dynamic) {
  let selectionsBefore = new (Map as Dynamic)(
    toldSelectionsOfUser(before, userId).map((told?: Dynamic) => [told.tabKey, told.selection]),
  );
  return toldSelectionsOfUser(state, userId).findLast(({ tabKey: tabKey, selection: selection }: Dynamic) => {
    let selectionBefore = selectionsBefore.get(tabKey);
    return selectionBefore === undefined || !isSameToldSelection(selectionBefore, selection);
  })?.selection;
}
export function stepFollowPerson(before: Dynamic, step: Dynamic, event: Dynamic, { reads: reads }: Dynamic) {
  let { state: state } = step;
  if (event.kind === 'followAsked') {
    let { tabKey: tabKey, userId: userId } = event;
    if (tabKey === null)
      return {
        ...state,
        followed: null,
      };
    let toldOfUser = userId === null ? [] : toldSelectionsOfUser(state, userId);
    let told = toldOfUser.find((told2?: Dynamic) => told2.tabKey === tabKey) ?? toldOfUser.at(-1);
    if (userId === null || told === undefined || !isViewFreeToFollow(state)) return state;
    let followed = {
      userId: userId,
      tabKey: tabKey,
      cells: told.selection,
    };
    let followingState = {
      ...state,
      followed: followed,
      isFollowingAgent: false,
      followsOnOneSheet: 'no',
      hasPersonTakenViewBack: true,
      leftByCaret: null,
      placementSelected: null,
    };
    return showChangeByAgent(followingState, reads, {
      cells: selectionInRowOrder('seen', told.selection, reads),
    });
  }
  if (state.followed === null) return state;
  let { userId: followedUserId } = state.followed;
  let isTakenBack =
    event.kind === 'keyPressed' || (!isAnswerKeepingView(before, state, event) && doesPersonTakeViewBack(before, step, event));
  if (toldSelectionsOfUser(state, followedUserId).length === 0 || isTakenBack)
    return {
      ...state,
      followed: null,
    };
  let withoutAgent = state.isFollowingAgent
    ? {
        ...state,
        isFollowingAgent: false,
        followsOnOneSheet: 'no',
      }
    : state;
  let selection = changedSelectionOfUser(before, state, followedUserId);
  if (selection !== undefined)
    return showChangeByAgent(
      {
        ...withoutAgent,
        followed: {
          ...state.followed,
          cells: selection,
        },
      },
      reads,
      {
        cells: selectionInRowOrder('seen', selection, reads),
      },
    );
  return event.kind === 'workbookChanged'
    ? showChangeByAgent(withoutAgent, reads, {
        cells: selectionInRowOrder('seen', state.followed.cells, reads),
      })
    : withoutAgent;
}
export function withTellOthersWhomViewFollows(before: Dynamic, { state: state, effects: effects }: Dynamic, event?: Dynamic) {
  let tabKey = state.followed?.tabKey ?? null;
  if (tabKey === (before.followed?.tabKey ?? null) && event.kind !== 'followAsked')
    return {
      state: state,
      effects: effects,
    };
  return {
    state: state,
    effects: [
      ...effects,
      {
        kind: 'tellOthersWhomViewFollows',
        tabKey: tabKey,
      },
    ],
  };
}
export function readsWithFormatsToCome(reads: WorkbookReads, { entriesUnanswered: entriesUnanswered }: Dynamic) {
  let toCome = formatsToComeOf({
    entriesUnanswered: entriesUnanswered,
  });
  if (toCome.length === 0) return reads;
  let held = readsWithFormatsToComeCache.get(reads);
  if (held?.entriesUnanswered === entriesUnanswered) return held.shown;
  let formatsShown = new Map();
  let toComeAt = (cellId?: Dynamic) => toCome.find((format?: Dynamic) => isSameCell(format.cellId, cellId));
  let cellOf = (cellId?: Dynamic) => {
    let cell = reads.cellOf(cellId);
    if (cell?.input.kind === 'boolean' || cell?.input.kind === 'formula' || toComeAt(cellId)?.look.cellControl?.kind !== 'checkbox') return cell;
    return {
      r: cellId.rowId,
      c: cellId.columnId,
      input: {
        kind: 'boolean',
        value: false,
      },
    };
  };
  let shown = {
    ...reads,
    formatOf(cellId?: Dynamic) {
      let [format, coming] = [reads.formatOf(cellId), toComeAt(cellId)];
      if (coming === undefined) return format;
      let formatToShow = formatsShown.get(cellId) ?? {
        ...format,
        ...coming.look,
      };
      return (formatsShown.set(cellId, formatToShow), formatToShow);
    },
    dropdownOf: (cellId?: Dynamic) => reads.dropdownOf(toComeAt(cellId)?.dropdownOf ?? cellId),
    cellOf: cellOf,
    cellOnShowIn: (cellId?: Dynamic) => cellOf(cellId) ?? reads.spilledCellOf(cellId),
    columnIndexesOnShowIn(sheetId?: Dynamic, rowIndex?: Dynamic) {
      let onShow = reads.columnIndexesOnShowIn(sheetId, rowIndex);
      let comingIndexes = toCome.flatMap(({ cellId: cellId }: Dynamic) => {
        let position = cellId.sheetId === sheetId ? reads.positionOfCell(cellId) : null;
        return position?.rowIndex === rowIndex && cellOf(cellId) !== null ? [position.columnIndex] : [];
      });
      if (comingIndexes.length === 0) return onShow;
      let indexes = [...new Set([...onShow, ...comingIndexes])];
      return (indexes.sort((a?: Dynamic, b?: Dynamic) => a - b), indexes);
    },
  };
  return (
    readsWithFormatsToComeCache.set(reads, {
      entriesUnanswered: entriesUnanswered,
      shown: shown,
    }),
    shown
  );
}
export const toldSelectionsOfUser = ({ selectionsOfOthers: selectionsOfOthers }: Dynamic, userId?: Dynamic) =>
  selectionsOfOthers.filter((told?: Dynamic) => told.userId === userId);
export const isAnswerKeepingView = (before: Dynamic, state: PageState, { kind: kind }: Dynamic) =>
  (kind === 'editAnswered' || kind === 'undoOrRedoAnswered' || kind === 'takeBackAnswered') &&
  isViewFreeToFollow(state) &&
  isSameSelection(before, state) &&
  state.placementSelected === before.placementSelected;
export const stepViewFollowing = (before?: Dynamic, step?: Dynamic, event?: Dynamic, context?: Dynamic) => {
  let afterShown = stepShownByAgent(before, step, event, context);
  let afterAgent =
    (afterShown.shownByAgent?.place ?? null) === null
      ? stepFollowAgent(
          before,
          {
            ...step,
            state: afterShown,
          },
          event,
          context,
        )
      : afterShown;
  let afterPerson = stepFollowPerson(
    before,
    {
      ...step,
      state: afterAgent,
    },
    event,
    context,
  );
  let state = step.state;
  if (!(afterPerson.sheetId !== state.sheetId || afterPerson.scrollLeft !== state.scrollLeft || afterPerson.scrollTop !== state.scrollTop))
    return afterPerson;
  let followsOnOneSheet = afterPerson.followsOnOneSheet === 'no' ? 'no' : 'hasMoved';
  return {
    ...afterPerson,
    followsOnOneSheet: followsOnOneSheet,
    movesOfViewByItself: afterPerson.movesOfViewByItself + 1,
  };
};
export const formatsToComeOf = ({ entriesUnanswered: entriesUnanswered }: Dynamic) =>
  entriesUnanswered.flatMap(({ formatsToCome: formatsToCome = [] }: Dynamic) => formatsToCome);
export const readsWithFormatsToComeCache = new WeakMap();
export const isFormatComingToCell = ({ entriesUnanswered: entriesUnanswered }: Dynamic, cellId?: Dynamic) =>
  entriesUnanswered.some(
    ({ formatsToCome: formatsToCome = [] }: Dynamic) =>
      formatsToCome.some((format?: Dynamic) => format.isOfEntry !== true && isSameCell(format.cellId, cellId)),
  );
