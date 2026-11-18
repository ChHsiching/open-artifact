import type { Dynamic } from '../dynamic.ts';
import { toggledFontMark } from '../editor/text-looks.ts';
import {
  toggleListInEntry,
  canChangeEntryLists,
  canSetMarkOnEntrySelection,
  setMarkOnEntrySelection,
  canSetMarkToTypeIn,
  setMarkToTypeIn,
  applyTogglesToEntry,
} from '../editor/entry-looks.ts';
import { textToEditAt, startEntryEditing } from '../editor/start-entry.ts';
import { activeAnchorCell, selectedArea, selectionOfArea, moveActiveCellTo, mergedAreaOrCellOf } from '../selection/model.ts';
import { withNoEffects } from '../state/transitions.ts';
import { actOnEveryRange, refuseWhenSeveralRanges, hasOtherRanges } from '../selection/several-ranges.ts';
import { clearFormattingOfSelection } from './clear-formatting.ts';
import { commitEntryInPlaceIfEditing } from '../editor/commit-entry.ts';
import { removeDropdownOfSelection } from '../selection/cells-seen.ts';
import { refuseIfRowsOutOfViewInTheWay } from '../edits/rows-out-of-view.ts';
import { makeDropdownFromSelection, headerAboveDropdownCells } from '../chips/dropdown-editor.ts';
import { openCustomFormatDialog } from './custom-number-format.ts';
import { sharedFormatOfAllRanges } from '../selection/shared-format.ts';
import { cellBlockOfSelection } from '../model/cell-blocks.ts';
import { queueEdit, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { CHECKBOX_FORMAT } from '../chips/checkboxes.ts';
import { isDateNumberFormat, doesCellTakeCalendar, withCalendarOpen } from '../chips/calendar.ts';
import { isFormulaCell } from '../model/workbook.ts';
import { formatOfToolbarChoice } from './toolbar-choices.ts';
import { isRangeInSight } from '../grid/geometry.ts';
import { layoutOfView } from '../grid/layout.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function fitKindOfFormatCommand(command?: Dynamic) {
  if ('dropdown' in command) return 'dropdown';
  if ('checkbox' in command) return 'checkbox';
  if ('dateToPick' in command) return 'date';
  return 'toggle' in command || 'patternToType' in command || 'stepOfDecimalPlaces' in command ? null : (command.numberFormatChoice ?? null);
}
export function formatOfFormatCommand({ formatOfSelection: formatOfSelection }: Dynamic, command?: Dynamic) {
  if ('toggle' in command) return toggledFontMark(command.toggle, formatOfSelection.shared);
  if (!('stepOfDecimalPlaces' in command)) return command;
  let decimalPlaces = formatOfSelection.decimalPlaces[command.stepOfDecimalPlaces];
  return decimalPlaces === null
    ? null
    : {
        decimalPlaces: decimalPlaces,
      };
}
export function toggleListInCellOrEntry(state: PageState, workbook: ReadsWithTextMeasurer, list?: Dynamic, caretInEntry?: Dynamic) {
  if (state.mode.kind === 'editing') return toggleListInEntry(state, workbook, list, caretInEntry);
  let text = textToEditAt(state, workbook, activeAnchorCell(state, workbook));
  let started = startEntryEditing(state, workbook, text, 'cell');
  let caret = {
    text: text,
    start: 0,
    end: text.length,
    isComposing: false,
  };
  if (started.mode.kind !== 'editing' || !canChangeEntryLists(started.mode, caret)) return state;
  let toggled = toggleListInEntry(started, workbook, list, caret);
  if (toggled.mode.kind !== 'editing') return state;
  let caretAtEnd = {
    start: text.length,
    end: text.length,
  };
  return {
    ...toggled,
    mode: {
      ...toggled.mode,
      selectedInEntry: caretAtEnd,
    },
  };
}
export function applyFormatCommand(state: PageState, workbook: ReadsWithTextMeasurer, command?: Dynamic, caretInEntry?: Dynamic) {
  if ('toggle' in command && canSetMarkOnEntrySelection(state, caretInEntry))
    return withNoEffects(setMarkOnEntrySelection(state, workbook, command.toggle, caretInEntry));
  if ('toggle' in command && canSetMarkToTypeIn(state, workbook, caretInEntry))
    return withNoEffects(setMarkToTypeIn(state, workbook, command.toggle, caretInEntry));
  if ('list' in command) return withNoEffects(toggleListInCellOrEntry(state, workbook, command.list, caretInEntry));
  if ('clearsFormatting' in command) {
    let outcome = actOnEveryRange(state, (rangeState?: Dynamic) => clearFormattingOfSelection(rangeState, workbook));
    return {
      ...outcome,
      state: applyTogglesToEntry(outcome.state, CLEARED_FONT_MARKS),
    };
  }
  if ('removesDropdown' in command) return commitEntryInPlaceIfEditing(state, workbook) ?? removeDropdownOfSelection(state, workbook);
  let fitKind = fitKindOfFormatCommand(command);
  let replacesWithDropdown = 'dropdown' in command && command.replacesFormulas === true && state.formatOfSelection.takesDropdownFromInsert;
  if (fitKind !== null && !replacesWithDropdown && !state.formatOfSelection.formatsThatFit.includes(fitKind)) return withNoEffects(state);
  if ('dropdown' in command)
    return (
      commitEntryInPlaceIfEditing(state, workbook) ??
      refuseWhenSeveralRanges(state, 'dropdown') ??
      refuseIfRowsOutOfViewInTheWay(state, workbook, 'dropdown') ??
      makeDropdownFromSelection(state, workbook, command)
    );
  if ('patternToType' in command)
    return commitEntryInPlaceIfEditing(state, workbook) ?? openCustomFormatDialog(state, workbook, command.typedSoFar ?? null);
  if (sharedFormatOfAllRanges(state, workbook) === null) return withNoEffects(state);
  let { shared: sharedFormat } = state.formatOfSelection;
  let formatSelection = (
    format2?: Dynamic,
    ifQueuedOf?: Dynamic,
    { leavesHeadingOut: leavesHeadingOut }: Dynamic = {
      leavesHeadingOut: false,
    },
  ) =>
    actOnEveryRange(state, (rangeState?: Dynamic) => {
      let area = selectedArea(rangeState, workbook);
      let header = area === null || !leavesHeadingOut || hasOtherRanges(state) ? null : headerAboveDropdownCells(rangeState, workbook, area);
      let corners = header?.corners ?? (area === null ? null : selectionOfArea(rangeState, workbook, area));
      let cells = corners === null ? null : cellBlockOfSelection(rangeState, workbook, corners);
      if (cells === null) return withNoEffects(rangeState);
      return queueEdit(
        rangeState,
        {
          kind: 'formatCells',
          cells: cells,
          format: format2,
        },
        {
          ...IF_QUEUED_DEFAULTS,
          ...ifQueuedOf(rangeState, header?.top ?? 0),
        },
        format2.numberFormat === undefined
          ? {}
          : {
              makesRoomForNumbersIn: state.sheetId,
            },
      );
    });
  if ('checkbox' in command)
    return (
      commitEntryInPlaceIfEditing(state, workbook) ??
      formatSelection(
        CHECKBOX_FORMAT,
        (rangeState?: Dynamic, headingRowCount?: Dynamic) => ({
          select: null,
          done: {
            what: 'checkboxesMade',
            headingRowCount: headingRowCount,
          },
        }),
        {
          leavesHeadingOut: true,
        },
      )
    );
  if ('dateToPick' in command) {
    let outcome = commitEntryInPlaceIfEditing(state, workbook);
    if (outcome !== null) return outcome;
    let { thenGoesOnTo: thenGoesOnTo } = command;
    let activeCell = activeAnchorCell(state, workbook);
    if (
      sharedFormat.numberFormat !== null &&
      isDateNumberFormat(sharedFormat.numberFormat) &&
      sharedFormat.cellControl?.kind === 'none' &&
      doesCellTakeCalendar(workbook, activeCell)
    ) {
      let stateWithoutNotice = {
        ...state,
        notice: null,
        lastDone: null,
      };
      return withNoEffects(
        thenGoesOnTo === undefined ? withCalendarOpen(stateWithoutNotice, workbook) : moveActiveCellTo(stateWithoutNotice, workbook, thenGoesOnTo),
      );
    }
    let opensCalendar = !isFormulaCell(workbook, activeCell);
    return formatSelection(
      formatOfToolbarChoice(DATE_NUMBER_FORMAT_CHOICE, workbook),
      (rangeState?: Dynamic) => ({
        select: null,
        done: {
          what: 'formatted',
          format: DATE_NUMBER_FORMAT_CHOICE,
        },
        ...(rangeState === state &&
          thenGoesOnTo !== undefined && {
            thenGoesOnTo: thenGoesOnTo,
          }),
        ...(rangeState === state &&
          thenGoesOnTo === undefined &&
          opensCalendar && {
            thenCalendar: 'opens',
          }),
      }),
    );
  }
  let format = formatOfFormatCommand(state, command);
  if (format === null) return withNoEffects(state);
  let done = {
    what: 'formatted',
    format: format,
  };
  let cellArea =
    format.fontSizeInPoints !== undefined || format.wrapText === true || format.bold !== undefined || format.italic !== undefined
      ? mergedAreaOrCellOf(workbook, state.activeCell)
      : null;
  let isCellInSight2 = cellArea !== null && isRangeInSight(cellArea, state, layoutOfView(state, workbook), state);
  let result = formatSelection(
    formatOfToolbarChoice(format, workbook),
    (rangeState?: Dynamic) => ({
      select: isCellInSight2 ? rangeState : null,
      done: done,
      leavesEntryOpen: true,
    }),
  );
  return {
    ...result,
    state: applyTogglesToEntry(result.state, format),
  };
}
export const DATE_NUMBER_FORMAT_CHOICE = {
  numberFormatChoice: 'date',
};
export const CLEARED_FONT_MARKS = {
  bold: false,
  italic: false,
  underline: 'none',
  strikethrough: false,
};
