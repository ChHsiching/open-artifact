import type { Dynamic } from '../dynamic.ts';
import { cellExplained, linkAddressesAt } from '../state/explained-under-cell.ts';
import { isSameCell, anchorCellOf, isAnchorOfActiveCell } from '../selection/model.ts';
import { doesCellTakeCalendar } from './calendar.ts';
import { dropdownAtCell } from './dropdown-options.ts';
import { isPeopleCell, refreshPeopleList } from './people-list.ts';
import { commentAtActiveCell, isActiveCellInOpenComment, doesCommentModePick } from '../comments/comment-state.ts';
import { asOneCellSelection, editEndsOnAnotherCell } from '../editor/commit-moves.ts';
import { hitTestGrid } from '../grid/geometry.ts';
import { layoutOfView } from '../grid/layout.ts';
import { withNoEffects } from '../state/transitions.ts';
import { textToEditAt, startEntryEditing } from '../editor/start-entry.ts';
import { toggleableCheckboxValue } from './checkbox-presses.ts';
import { fixAtCell } from '../formulas/fix/fixes-on-cells.ts';
import { isFormulaText } from './dropdown-pane-edits.ts';
import { openDropdownList } from './dropdowns.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function isLinkCardOfCellShown(state: PageState, reads: WorkbookReads, cellId?: Dynamic) {
  let card = cellExplained(state, reads);
  if (card === null || linkAddressesAt(state, reads, card.cellId).length === 0) return false;
  return card.isByPress || isSameCell(card.cellId, cellId);
}
export function doesCellOpenItsOwnOnPress(state: PageState, reads: WorkbookReads, cell?: Dynamic) {
  let anchorCell = anchorCellOf(reads, cell);
  return (
    (state.isOnPhone && doesCellTakeCalendar(reads, anchorCell)) ||
    dropdownAtCell(reads, anchorCell) !== null ||
    isPeopleCell(reads, anchorCell) ||
    commentAtActiveCell(state, reads) !== null ||
    isActiveCellInOpenComment(state, reads, cell) ||
    isLinkCardOfCellShown(state, reads, anchorCell)
  );
}
export function openListOfPressedActiveCell(state: PageState, reads: WorkbookReads, select?: Dynamic) {
  let oneCell = asOneCellSelection(select);
  return oneCell !== null && isAnchorOfActiveCell(state, reads, oneCell.activeCell) ? openListOfActiveCell(state, reads) : state;
}
export function openListOnPress(
  before: Dynamic,
  step: Dynamic,
  event: Dynamic,
  { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic,
) {
  if (refusalOfEveryEdit !== null || !editEndsOnAnotherCell(before, step, event.isShiftHeld)) return step;
  if (hitTestGrid(event, before, layoutOfView(before, reads))?.kind !== 'cell') return step;
  let { state: state, effects: effects } = step;
  return effects.length > 0
    ? {
        state: state,
        effects: effects.map(opensListOfPressedCell),
      }
    : withNoEffects(openListOfActiveCell(state, reads));
}
export function openEntryOfActiveCell(state: PageState, reads: ReadsWithTextMeasurer) {
  let anchorCell = anchorCellOf(reads, state.activeCell),
    text = textToEditAt(state, reads, state.activeCell);
  return state.mode.kind !== 'navigating' ||
    toggleableCheckboxValue(reads, anchorCell) !== null ||
    doesCommentModePick(state) ||
    doesCellOpenItsOwnOnPress(state, reads, state.activeCell) ||
    fixAtCell(state, anchorCell) !== null ||
    text !== '' ||
    reads.spilledCellOf(anchorCell) !== null
    ? state
    : startEntryEditing(state, reads, text, 'cell', 'pointer');
}
export function openEntryOfPressedActiveCell(state: PageState, reads: ReadsWithTextMeasurer, select?: Dynamic) {
  let oneCell = asOneCellSelection(select);
  return oneCell !== null && isAnchorOfActiveCell(state, reads, oneCell.activeCell) ? openEntryOfActiveCell(state, reads) : state;
}
export function openEntryOnPress(
  before: Dynamic,
  step: Dynamic,
  event: Dynamic,
  { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic,
) {
  if (
    !event.isByFinger ||
    !before.isOnPhone ||
    refusalOfEveryEdit !== null ||
    before.mode.kind !== 'editing' ||
    before.mode.typingIn !== 'cell' ||
    isFormulaText(before.mode.text) ||
    event.caretInEntry?.isComposing === true ||
    !editEndsOnAnotherCell(before, step, event.isShiftHeld)
  )
    return step;
  if (hitTestGrid(event, before, layoutOfView(before, reads))?.kind !== 'cell') return step;
  let { state: state, effects: effects } = step;
  return effects.length > 0
    ? {
        state: state,
        effects: effects.map(opensEntryOfPressedCell),
      }
    : withNoEffects(openEntryOfActiveCell(state, reads));
}
export const openListOfActiveCell = (state: PageState, reads: WorkbookReads) => refreshPeopleList(openDropdownList(state, reads), reads);
export const opensListOfPressedCell = (effect?: Dynamic) =>
  effect.kind === 'queueEdit' && asOneCellSelection(effect.ifQueued.select) !== null
    ? {
        ...effect,
        ifQueued: {
          ...effect.ifQueued,
          thenListOfPressedCell: 'opens',
        },
      }
    : effect;
export const opensEntryOfPressedCell = (effect?: Dynamic) =>
  effect.kind === 'queueEdit' && asOneCellSelection(effect.ifQueued.select) !== null
    ? {
        ...effect,
        ifQueued: {
          ...effect.ifQueued,
          thenEntryOfPressedCell: 'opens',
        },
      }
    : effect;
export const withoutEntryOfPressedCell = (effect?: Dynamic) => {
  if (effect.kind !== 'queueEdit' || effect.ifQueued.thenEntryOfPressedCell === undefined) return effect;
  let { thenEntryOfPressedCell: _thenEntryOfPressedCell, ...ifQueued } = effect.ifQueued;
  return {
    ...effect,
    ifQueued: ifQueued,
  };
};
