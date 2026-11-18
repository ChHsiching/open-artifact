import type { Dynamic } from '../dynamic.ts';
import { ownFilterByKey, restoreHeldOwnFilter, applyOwnFilter, heldOwnFilterSnapshot } from './own-filters.ts';
import { isSameCell } from '../selection/model.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function withPlaceBeforeTry(
  state: PageState,
  reads: WorkbookReads,
  { placeBefore: placeBefore, placeAfterTry: placeAfterTry }: Dynamic,
  undone?: Dynamic,
) {
  let canPlaceBefore = reads.positionOfCell(placeBefore.activeCell) !== null && reads.positionOfCell(placeBefore.selectionCorner) !== null;
  if (placeAfterTry === null) return undone;
  if (!canPlaceBefore || !isSameSelectionPlace(selectionPlaceOf(state), placeAfterTry)) return undone;
  let scrollTop = state.scrollTop === placeAfterTry.scrollTop ? placeBefore.scrollTop : undone.scrollTop;
  return {
    ...undone,
    ...placeBefore,
    scrollTop: scrollTop,
  };
}
export function undoOwnFilterTry(state: PageState, reads: ReadsWithTextMeasurer, tried?: Dynamic) {
  let heldNow = ownFilterByKey(state, tried.before.held.key);
  if (heldNow === null || heldNow.filter === tried.before.held.filter) return state;
  return withPlaceBeforeTry(state, reads, tried, restoreHeldOwnFilter(state, reads, tried.before));
}
export function tryOwnFilter(state: PageState, reads: ReadsWithTextMeasurer, held?: Dynamic, tried?: Dynamic, filter?: Dynamic) {
  if (held.filter === filter)
    return {
      state: state,
      tried: tried,
    };
  let stateBeforeTry = tried === null ? state : undoOwnFilterTry(state, reads, tried);
  let heldBefore = ownFilterByKey(stateBeforeTry, held.key) ?? held;
  let triedState = applyOwnFilter(stateBeforeTry, reads, heldBefore, filter);
  let heldAfter = ownFilterByKey(triedState, held.key);
  if (heldAfter === null || heldAfter.filter === heldBefore.filter)
    return {
      state: applyOwnFilter(state, reads, held, filter),
      tried: tried,
    };
  return {
    state: triedState,
    tried: {
      before: tried === null ? heldOwnFilterSnapshot(state, held) : tried.before,
      placeBefore: tried === null ? selectionPlaceOf(state) : tried.placeBefore,
      placeAfterTry: selectionPlaceOf(triedState),
    },
  };
}
export function ownFiltersBeforeTry(ownFilters?: Dynamic, tried?: Dynamic) {
  if (tried === null) return ownFilters;
  let cached = ownFiltersBeforeTryCache.get(tried);
  if (cached?.of === ownFilters) return cached.kept;
  let restored = new (Map as Dynamic)(
    Array.from<Dynamic, Dynamic>(
      ownFilters,
      ([sheetId, filters]: Dynamic) => [
        sheetId,
        filters.map((filter?: Dynamic) => (filter.key === tried.before.held.key ? tried.before.held : filter)),
      ],
    ),
  );
  ownFiltersBeforeTryCache.set(tried, {
    of: ownFilters,
    kept: restored,
  });
  return restored;
}
export const selectionPlaceOf = ({
  sheetId: sheetId,
  activeCell: activeCell,
  selectionCorner: selectionCorner,
  otherRanges: otherRanges,
  rangeWalked: rangeWalked,
  scrollTop: scrollTop,
}: Dynamic) => ({
  sheetId: sheetId,
  activeCell: activeCell,
  selectionCorner: selectionCorner,
  otherRanges: otherRanges,
  rangeWalked: rangeWalked,
  scrollTop: scrollTop,
});
export const isSameSelectionPlace = (place?: Dynamic, other?: Dynamic) =>
  place.sheetId === other.sheetId &&
  isSameCell(place.activeCell, other.activeCell) &&
  isSameCell(place.selectionCorner, other.selectionCorner) &&
  place.otherRanges === other.otherRanges;
export const wasOwnFilterTryUndone = (before?: Dynamic, after?: Dynamic) =>
  before.ownFilterTried !== null && after.ownFilterTried === null && isSameSelectionPlace(selectionPlaceOf(after), before.ownFilterTried.placeBefore);
export const ownFiltersBeforeTryCache = new (WeakMap as Dynamic)();
