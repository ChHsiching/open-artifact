import type { Dynamic } from '../dynamic.ts';
import { ownRowOrderOfSheet, wholeRowSpanIn } from '../model/line-ids.ts';
import { selectedArea, isSameCell } from '../selection/model.ts';
import { peerColorOf } from './colors.ts';
import { inkOnPeerColor } from '@open-artifact/editor-kit';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { SelectionToRead } from '../selection/model.ts';
export function withSelectionsOfOthers(state: PageState, heard?: Dynamic, nowMs2?: Dynamic) {
  let isSame =
    heard.length === state.selectionsOfOthers.length &&
    heard.every((heardOne?: Dynamic, index?: Dynamic) => {
      let known = state.selectionsOfOthers[index];
      return (
        known?.tabKey === heardOne.tabKey &&
        known.userId === heardOne.userId &&
        known.colorClaimed === heardOne.colorClaimed &&
        isSameToldSelection(known.selection, heardOne.selection)
      );
    });
  let userIdsToLookUp = [...new (Set as Dynamic)(heard.map(({ userId: userId }: Dynamic) => userId))].filter(
    (userId?: Dynamic) => (state.profilesById.get(userId)?.name ?? '') === '',
  );
  return {
    state: isSame
      ? state
      : {
          ...state,
          selectionsOfOthers: heard.map((heardOne?: Dynamic) => {
            let known = state.selectionsOfOthers.find(
              ({ userId: userId, selection: selection }: Dynamic) =>
                userId === heardOne.userId && isSameToldSelection(selection, heardOne.selection),
            );
            return {
              ...heardOne,
              movedAtMs: known?.movedAtMs ?? nowMs2,
            };
          }),
        },
    effects:
      userIdsToLookUp.length === 0
        ? []
        : [
            {
              kind: 'lookUpPeople',
              userIds: userIdsToLookUp,
            },
          ],
  };
}
export function withOwnSelectionTold({ state: state, effects: effects }: Dynamic, reads: WorkbookReads) {
  let { activeCell: activeCell, selectionCorner: selectionCorner, selectionToldToOthers: told } = state;
  let selection = selectionInRowOrder(
    'stored',
    {
      activeCell: activeCell,
      selectionCorner: selectionCorner,
    },
    reads,
  );
  if (told !== null && isSameToldSelection(told, selection))
    return {
      state: state,
      effects: effects,
    };
  if (told !== null && state.followed !== null)
    return {
      state: state,
      effects: effects,
    };
  return {
    state: {
      ...state,
      selectionToldToOthers: selection,
    },
    effects: [
      ...effects,
      {
        kind: 'tellOthersOwnSelection',
        selection: selection,
      },
    ],
  };
}
export function selectionInRowOrder(order: Dynamic, selection: Dynamic, reads: WorkbookReads) {
  let { activeCell: activeCell, selectionCorner: selectionCorner } = selection;
  let ownRowOrder = ownRowOrderOfSheet(reads, activeCell.sheetId);
  if (ownRowOrder === null || activeCell.rowId === selectionCorner.rowId) return selection;
  let fromOrder = order === 'seen' ? ownRowOrder.stored : ownRowOrder.seen;
  let [activeIndex, cornerIndex] = [fromOrder.indexOf(activeCell.rowId), fromOrder.indexOf(selectionCorner.rowId)];
  if (activeIndex === null || cornerIndex === null) return selection;
  let span = wholeRowSpanIn(order, ownRowOrder, {
    firstIndex: Math.min(activeIndex, cornerIndex),
    count: Math.abs(activeIndex - cornerIndex) + 1,
  });
  if (span === null)
    return {
      activeCell: activeCell,
      selectionCorner: activeCell,
    };
  let [firstRowId, lastRowId] = [ownRowOrder[order].idAt(span.firstIndex), ownRowOrder[order].idAt(span.firstIndex + span.count - 1)];
  if (firstRowId === null || lastRowId === null) return selection;
  return {
    activeCell: {
      ...activeCell,
      rowId: activeIndex < cornerIndex ? firstRowId : lastRowId,
    },
    selectionCorner: {
      ...selectionCorner,
      rowId: activeIndex < cornerIndex ? lastRowId : firstRowId,
    },
  };
}
export function selectedAreaAsSeen(selection: Dynamic, reads: WorkbookReads) {
  let cached = selectionAsSeenCache.get(selection);
  let seen = cached?.reads === reads ? cached.seen : selectionInRowOrder('seen', selection, reads);
  selectionAsSeenCache.set(selection, {
    reads: reads,
    seen: seen,
  });
  return cachedSelectedArea(seen, reads);
}
export function cachedSelectedArea(state: SelectionToRead, reads: WorkbookReads) {
  let cached = selectedAreaCache.get(state);
  if (cached?.reads === reads) return cached.area;
  let area = selectedArea(state, reads);
  selectedAreaCache.set(state, {
    reads: reads,
    area: area,
  });
  return area;
}
export function peerFlagLook({ userId: userId, colorClaimed: colorClaimed }: Dynamic, profilesById?: Dynamic) {
  let { name: personName = '', color: usualColor = null } = profilesById.get(userId) ?? {};
  if (personName === '') return null;
  let color = peerColorOf(colorClaimed, usualColor, userId);
  return {
    name: personName,
    color: color,
    inkColor: inkOnPeerColor(color),
  };
}
export function peerFlagsOnSheet(sheetId: Dynamic, { selectionsOfOthers: selectionsOfOthers, profilesById: profilesById }: Dynamic) {
  let cached = peerFlagsCache.get(selectionsOfOthers);
  if (cached?.profilesById === profilesById) return cached.bySheet.get(sheetId) ?? NO_PEER_FLAGS;
  let flagsBySheet = new (Map as Dynamic)();
  for (let heard of selectionsOfOthers as Dynamic) {
    let { userId: userId, selection: selection } = heard;
    let flagsOnSheet = flagsBySheet.get(selection.activeCell.sheetId) ?? [];
    if (flagsOnSheet.some((input?: Dynamic) => input.userId === userId)) continue;
    let look = peerFlagLook(heard, profilesById);
    if (look === null) continue;
    let avatarUrl = profilesById.get(userId)?.avatarUrl ?? '';
    let shownAvatarUrl = avatarUrl.startsWith('data:') ? '' : avatarUrl;
    flagsBySheet.set(selection.activeCell.sheetId, [
      ...flagsOnSheet,
      {
        ...look,
        userId: userId,
        avatarUrl: shownAvatarUrl,
      },
    ]);
  }
  peerFlagsCache.set(selectionsOfOthers, {
    profilesById: profilesById,
    bySheet: flagsBySheet,
  });
  return flagsBySheet.get(sheetId) ?? NO_PEER_FLAGS;
}
export const inertRoomPresence = {
  tellOwnSelection() {},
  tellAgentWhatIsSelected() {},
  tellWhomViewFollows() {},
  personWithTab: () => null,
  onSelectionsChanged: () => () => {},
};
export const isSameToldSelection = (selection?: Dynamic, otherSelection?: Dynamic) =>
  isSameCell(selection.activeCell, otherSelection.activeCell) && isSameCell(selection.selectionCorner, otherSelection.selectionCorner);
export const selectedAreaCache = new (WeakMap as Dynamic)();
export const peerFlagsCache = new (WeakMap as Dynamic)();
export const NO_PEER_FLAGS: Dynamic = [];
export const selectionAsSeenCache = new (WeakMap as Dynamic)();
