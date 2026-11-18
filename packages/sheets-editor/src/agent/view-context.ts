import type { Dynamic } from '../dynamic.ts';
import { hasOtherRanges } from '../selection/several-ranges.ts';
import { selectedArea, activeAnchorCell, areaOfPosition, isSameCell } from '../selection/model.ts';
import { hasFilteredRowsIn } from '../tables/filtered-rows.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { wholeAreaToA1AsStored } from '../model/a1-references.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { selectedPlacedViewId } from '../charts/placed-views.ts';
import type { PageState } from '../state/initial-state.ts';
export function selectionForAgent(state: PageState, context?: Dynamic) {
  let { reads: reads, revisionHeld: revisionHeld } = context;
  if (revisionHeld === null || !canTellAgentSelection(state, context) || hasOtherRanges(state)) return null;
  let { sheetId: sheetId } = state.activeCell;
  let sheetIndex = reads.listSheets().findIndex((input?: Dynamic) => input.sheetId === sheetId);
  let selected = selectedArea(state, reads);
  let entryPosition = reads.positionOfCell(activeAnchorCell(state, reads));
  if (sheetIndex < 0 || selected === null || entryPosition === null) return null;
  if (hasFilteredRowsIn(state, reads, selected)) return null;
  let ownRowOrder = ownRowOrderOfSheet(reads, sheetId);
  let range = wholeAreaToA1AsStored(selected, ownRowOrder);
  if (range === null) return null;
  return {
    sheetNumber: sheetIndex + 1,
    range: range,
    activeCell: areaToA1AsStored(areaOfPosition(entryPosition), ownRowOrder),
    revision: revisionHeld,
  };
}
export function withSelectionToldToAgent(previousState: Dynamic, { state: state, effects: effects }: Dynamic, context?: Dynamic) {
  let { selectedToldToAgent: told } = state;
  if (
    told !== null &&
    isSameCell(state.activeCell, previousState.activeCell) &&
    isSameCell(state.selectionCorner, previousState.selectionCorner) &&
    state.rangeWalked === previousState.rangeWalked &&
    state.otherRanges === previousState.otherRanges &&
    state.placementSelected === previousState.placementSelected &&
    state.rowsOutOfViewByOwnFilters === previousState.rowsOutOfViewByOwnFilters &&
    state.entriesUnanswered === previousState.entriesUnanswered &&
    state.workbookChangeCount === previousState.workbookChangeCount &&
    (told.byAddress?.revision ?? null) === context.revisionHeld
  )
    return {
      state: state,
      effects: effects,
    };
  let byAddress = selectionForAgent(state, context);
  let chartId = context.revisionHeld === null ? null : selectedPlacedViewId(state, context.reads);
  if (
    told !== null &&
    told.chartId === chartId &&
    told.byAddress?.sheetNumber === byAddress?.sheetNumber &&
    told.byAddress?.range === byAddress?.range &&
    told.byAddress?.activeCell === byAddress?.activeCell &&
    told.byAddress?.revision === byAddress?.revision
  )
    return {
      state: state,
      effects: effects,
    };
  return {
    state: {
      ...state,
      selectedToldToAgent: {
        byAddress: byAddress,
        chartId: chartId,
      },
    },
    effects: [
      ...effects,
      {
        kind: 'tellAgentWhatIsSelected',
        selected: {
          byAddress: byAddress,
          chartId: chartId,
        },
      },
    ],
  };
}
export const VIEW_ID_PATTERN = /^viw_[a-z0-9]{8,16}\.\d{1,10}$/;
export const isViewId = (viewId?: Dynamic) => VIEW_ID_PATTERN.test(viewId);
export const canTellAgentSelection = ({ entriesUnanswered: entriesUnanswered }: Dynamic, { revisionHeld: revisionHeld }: Dynamic) =>
  revisionHeld !== null && entriesUnanswered.length === 0;
