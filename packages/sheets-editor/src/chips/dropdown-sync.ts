import type { Dynamic } from '../dynamic.ts';
import { dropdownEditorOfPane } from '../state/queries.ts';
import { EMPTY_TYPED_OPTION, readySetKeyOf, DROPDOWN_SCROLL_SLOP } from './dropdown-pane-edits.ts';
import { withDropdownPane, dropdownAtActiveCell, dropdownCard, closeSidePane, closeDropdownList, openDropdownList } from './dropdowns.ts';
import { activeAnchorCell, mergedAreaOrCellOf, isSameSelection, isSameCell } from '../selection/model.ts';
import { colorOfOptionIn } from './dropdown-editor.ts';
import { colorsEqual } from '../model/colors.ts';
import { isRangeInSight } from '../grid/geometry.ts';
import { layoutOfView } from '../grid/layout.ts';
import { dropUndrawableCard } from '../ui/list-cards.ts';
import { withNoEffects } from '../state/transitions.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function refreshDropdownEditor(state: PageState, reads: WorkbookReads, thenInEditor?: Dynamic) {
  let editor = dropdownEditorOfPane(state);
  if (editor === null) return state;
  let typed = thenInEditor === 'goesOn' ? editor.typed : thenInEditor === 'startsOption' ? EMPTY_TYPED_OPTION : null;
  return withDropdownPane(
    state,
    dropdownEditorForEntryCell(
      state,
      reads,
      {
        ...editor,
        typed: typed,
        isCustom: false,
      },
      true,
    ),
  );
}
export function dropdownEditorForEntryCell(state: PageState, reads: WorkbookReads, previousEditor?: Dynamic, keepsTyping?: Dynamic) {
  let entryCell = activeAnchorCell(state, reads);
  let dropdown = reads.dropdownOf(entryCell);
  let cellsOfDropdown = dropdown === null ? null : reads.cellsOfTheDropdownAt(entryCell);
  if (dropdown === null || cellsOfDropdown === null) return keepsTyping && previousEditor?.dropdownId === null ? previousEditor : null;
  let typed = keepsTyping ? (previousEditor?.typed ?? null) : null;
  let isTypedStillThere =
    typed === null || typed.optionId === null || dropdown.options.some(({ optionId: optionId }: Dynamic) => optionId === typed.optionId);
  return {
    dropdownId: dropdown.dropdownId,
    options: dropdown.options,
    stretches: cellsOfDropdown.stretches,
    indexOfOwnStretch: cellsOfDropdown.indexOfTheStretchWithTheCell,
    reach: previousEditor?.dropdownId === dropdown.dropdownId ? previousEditor.reach : 'everyCell',
    ...(previousEditor?.lastInColor !== undefined &&
      previousEditor.dropdownId === dropdown.dropdownId &&
      dropdown.options.every((input?: Dynamic) => {
        let value = colorOfOptionIn(previousEditor.lastInColor, input);
        return input.color.kind === 'none' || (value !== undefined && colorsEqual(input.color, value));
      }) && {
        lastInColor: previousEditor.lastInColor,
      }),
    typed: isTypedStillThere ? typed : null,
    ...(keepsTyping &&
    previousEditor !== null &&
    cellsOfDropdown.stretches.length === 1 &&
    previousEditor.dropdownId === dropdown.dropdownId &&
    previousEditor.stretches[previousEditor.indexOfOwnStretch]?.range ===
      cellsOfDropdown.stretches[cellsOfDropdown.indexOfTheStretchWithTheCell]?.range
      ? {
          ...(previousEditor.cellsTyped !== undefined && {
            cellsTyped: previousEditor.cellsTyped,
          }),
          ...(previousEditor.cellsRefused !== undefined &&
            previousEditor.cellsRefused.why !== 'headingIsNoOption' && {
              cellsRefused: previousEditor.cellsRefused,
            }),
        }
      : {}),
    isCustom:
      keepsTyping && previousEditor?.isCustom === true && readySetKeyOf(state, dropdown.options) === readySetKeyOf(state, previousEditor.options),
  };
}
export function isDropdownListOutOfPlace(state: PageState, reads: ReadsWithTextMeasurer, scrollAsItOpened?: Dynamic) {
  let merge = mergedAreaOrCellOf(reads, activeAnchorCell(state, reads));
  return (
    merge === null ||
    !isRangeInSight(merge, state, layoutOfView(state, reads), state) ||
    Math.hypot(state.scrollLeft - scrollAsItOpened.scrollLeft, state.scrollTop - scrollAsItOpened.scrollTop) > DROPDOWN_SCROLL_SLOP / state.zoom
  );
}
export function reconcileDropdownList(previousState: Dynamic, state: PageState, reads: ReadsWithTextMeasurer) {
  let dropdown = state.dropdown;
  if (dropdown === null) return state;
  if (
    !(
      (previousState.dropdown !== dropdown || isSameSelection(previousState, state)) &&
      dropdownAtActiveCell(state, reads) !== null &&
      !isDropdownListOutOfPlace(state, reads, dropdown.scrollAsItOpened) &&
      state.menu === null
    )
  )
    return {
      ...state,
      dropdown: null,
    };
  let isPointerCardStale = dropdown.isCardOfPointerAlone && previousState.dropdown?.highlighted !== dropdown.highlighted;
  return dropUndrawableCard(dropdownCard, isPointerCardStale ? dropdownCard.withCard(state, null) : state, reads);
}
export function reconcileDropdownPane(previousState: Dynamic, state: PageState, reads: WorkbookReads) {
  if (state.sidePane?.kind !== 'dropdown') return state;
  let isSameSelection2 = isSameSelection(previousState, state);
  let isSameWorkbook = state.workbookChangeCount === previousState.workbookChangeCount;
  let isUnchanged = previousState.sidePane?.kind === 'dropdown' && isSameSelection2 && isSameWorkbook;
  let hasEditorGone = state.sidePane.editor !== null && dropdownEditorOfPane(previousState) === null;
  if (isUnchanged || hasEditorGone) return state;
  let editor = dropdownEditorForEntryCell(state, reads, state.sidePane.editor, isSameSelection2);
  if (editor === null && !isSameSelection2 && isSameWorkbook) return closeSidePane(state);
  return editor === state.sidePane.editor ? state : withDropdownPane(state, editor);
}
export function toggleDropdownListOnClick(
  previousState: Dynamic,
  { state: state, effects: effects }: Dynamic,
  event: Dynamic,
  reads: WorkbookReads,
) {
  if (
    !isPlainCellClick(
      {
        state: state,
        effects: effects,
      },
      event,
    )
  )
    return {
      state: state,
      effects: effects,
    };
  let isOnOpenCell = previousState.dropdown !== null && isSameCell(state.activeCell, previousState.activeCell);
  return withNoEffects(isOnOpenCell ? closeDropdownList(state) : openDropdownList(state, reads));
}
export const hasLeftDropdownPane = (previousState: Dynamic, state: PageState) =>
  state.sidePane?.kind !== 'dropdown' || state.sheetId !== previousState.sheetId || !isSameSelection(previousState, state);
export const reconcileDropdownState = (previousState: Dynamic, state: PageState, reads: ReadsWithTextMeasurer) =>
  reconcileDropdownPane(previousState, reconcileDropdownList(previousState, state, reads), reads);
export const isPlainCellClick = ({ state: state, effects: effects }: Dynamic, isNotPlainClick?: Dynamic) =>
  !isNotPlainClick &&
  effects.length === 0 &&
  state.mode.kind === 'navigating' &&
  state.dragging?.kind === 'selecting' &&
  state.dragging.what === 'cells';
