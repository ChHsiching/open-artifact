import type { Dynamic } from '../dynamic.ts';
import { cleanEnteredCellText, flattenEnteredText } from '../format/shown-text.ts';
import { isMentionText, mentionQueryOf } from '../chips/people-typing.ts';
import {
  isPeopleListOnActiveCell,
  activeAnchorCell,
  mergedAreaOrCellOf,
  moveActiveCellTo,
  selectionAtCell,
  keyMoveOriginOf,
  selectedArea,
  selectionOfArea,
} from '../selection/model.ts';
import { isFormulaText } from '../chips/dropdown-pane-edits.ts';
import { dropdownAtCell, isOptionText } from '../chips/dropdown-options.ts';
import { usersOfCell, listLinesOfCell } from '../model/cell-values.ts';
import { doesCellTakeCalendar } from '../chips/calendar.ts';
import { isTimeCell, takeTimeFromList } from './time-list.ts';
import { formulaHasMoreReferencesThan } from '../formulas/references.ts';
import { cellHasPicker, doesEntryReadSigns, isSelectionMoreThanActiveCell } from './start-entry.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { withNoEffects, lastDoneWorthKeeping, clearPassingNotice, NAVIGATING_MODE } from '../state/transitions.ts';
import { hasEntryLists, entryInputWithLooks, formatDoneByMarksToType, toggleEntryCheckbox, areEntryLooksUnchanged } from './entry-looks.ts';
import { cellBlockOfSelection } from '../model/cell-blocks.ts';
import { queueEdit, enterEntryEdit, IF_QUEUED_DEFAULTS, withIfQueued } from '../model/edit-effects.ts';
import { selectionOfShownPieces } from '../tables/filtered-rows.ts';
import { areasOfAllRanges, withoutOtherRanges, actOnEveryRange } from '../selection/several-ranges.ts';
import { isCheckboxCell } from '../chips/checkboxes.ts';
import { cellRefOf } from '../model/workbook.ts';
import { markEditByPage } from './unanswered-entries.ts';
import { isFormulaUnfinishedInEntry, withFormulaBracketsClosed, isBareEqualsSign } from './formula-closing.ts';
import { closeDropdownList } from '../chips/dropdowns.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function isBareMentionEntry({ mode: mode }: Dynamic) {
  if (mode.kind !== 'editing') return false;
  if (mode.isTypedOverCell !== true && mode.textAtStart !== '') return false;
  let text = cleanEnteredCellText(mode.text);
  return isMentionText(text) && mentionQueryOf(text) === '';
}
export function isEntryRefusedByCell(state: PageState, reads: WorkbookReads) {
  let { mode: mode } = state;
  if (mode.kind !== 'editing') return false;
  if (isPeopleListOnActiveCell(state, reads)) return true;
  let cell = activeAnchorCell(state, reads);
  let text = cleanEnteredCellText(mode.text);
  if (text === '' || isFormulaText(text)) return false;
  let dropdown = dropdownAtCell(reads, cell);
  if (dropdown !== null) return mode.typingIn === 'cell' && !isOptionText(dropdown, text);
  if (mode.isTypedOverCell !== true) return false;
  if (usersOfCell(reads.cellOf(cell)).length === 0) return false;
  return isMentionText(text) || (!doesCellTakeCalendar(reads, cell) && !isTimeCell(reads, cell));
}
export function doesEntryExceedReferences(text: Dynamic, { activeCell: activeCell }: Dynamic, reads: WorkbookReads) {
  let input = reads.cellOf(activeCell)?.input;
  if (input?.kind !== 'formula') return false;
  return formulaHasMoreReferencesThan(text, reads.decimalSign, activeCell.sheetId, reads.listSheets(), input.formula.references);
}
export function isPlainValueText(text?: Dynamic) {
  let cleaned = cleanEnteredCellText(text);
  return cleaned !== '' && !isFormulaText(cleaned) && !/^(?:true|false)$/i.test(cleaned);
}
export function areaHasPickerCell(
  reads: WorkbookReads,
  sheetId: Dynamic,
  { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount }: Dynamic,
) {
  for (let rowIndex: Dynamic = topRowIndex; rowIndex < topRowIndex + rowCount; rowIndex += 1)
    for (let columnIndex: Dynamic = leftColumnIndex; columnIndex < leftColumnIndex + columnCount; columnIndex += 1) {
      let cellId = reads.cellIdAt(sheetId, rowIndex, columnIndex);
      if (cellId !== null && cellHasPicker(reads, cellId)) return true;
    }
  return false;
}
export function entryEmptiedNotice(state: PageState, reads: WorkbookReads) {
  let cellArea = mergedAreaOrCellOf(reads, state.activeCell);
  let isEmptied =
    state.mode.kind === 'editing' && enteredTextOf(state.mode.text) === '' && state.mode.textAtStart !== '' && !isEntryUnchanged(state, reads);
  return cellArea !== null && isEmptied
    ? {
        what: 'entryEmptiedCell',
        cells: areaToA1AsStored(cellArea, ownRowOrderOfSheet(reads, state.sheetId)),
        isSaved: false,
      }
    : null;
}
export function typedTextNotice(state: PageState, reads: WorkbookReads) {
  let cellArea = mergedAreaOrCellOf(reads, state.activeCell);
  if (cellArea === null) return null;
  if (isEntryUnchanged(state, reads))
    return {
      what: 'typedTextChangedNothing',
      cells: areaToA1AsStored(cellArea, ownRowOrderOfSheet(reads, state.sheetId)),
    };
  return state.mode.kind !== 'editing' || enteredTextOf(state.mode.text) === ''
    ? null
    : {
        what: 'typedTextEntered',
        cells: areaToA1AsStored(cellArea, ownRowOrderOfSheet(reads, state.sheetId)),
      };
}
export function commitEntryAndMove(
  state: PageState,
  reads: ReadsWithTextMeasurer,
  moveTo?: Dynamic,
  how: Dynamic = 'key',
  notice: Dynamic = null,
  keepsFormulaOfAgent: Dynamic = false,
) {
  let stateWithTime = takeTimeFromList(state, reads, how);
  if (stateWithTime.mode.kind !== 'editing') return withNoEffects(moveActiveCellTo(stateWithTime, reads, moveTo, how));
  let isTypedNotice = notice?.what === 'typedTextEntered' || notice?.what === 'typedTextChangedNothing';
  let done = entryEmptiedNotice(stateWithTime, reads) ?? (isTypedNotice ? typedTextNotice(stateWithTime, reads) : notice);
  let changedNothing = done?.what === 'typedTextChangedNothing';
  if (shouldDropEntry(stateWithTime, reads, keepsFormulaOfAgent)) {
    let dropped = moveActiveCellTo(dropEntry(stateWithTime, reads), reads, moveTo, how);
    return withNoEffects(
      changedNothing
        ? {
            ...dropped,
            lastDone: done,
          }
        : dropped,
    );
  }
  if (how === 'pointer' && isEntryRefusedByCell(stateWithTime, reads))
    return withNoEffects(moveActiveCellTo(leaveEntryAndPeopleList(stateWithTime), reads, moveTo, how));
  return commitEntry(stateWithTime, reads, moveTo, how, changedNothing ? null : done, keepsFormulaOfAgent);
}
export function wrapForNewLines(state: PageState, reads: WorkbookReads, selection?: Dynamic) {
  let { mode: mode } = state;
  if (mode.kind !== 'editing' || isFormulaText(mode.text) || hasEntryLists(mode)) return {};
  let isCellOfLists = listLinesOfCell(reads.cellOf(selection.activeCell)).length > 0;
  let textBefore = mode.isTypedOverCell === true || isCellOfLists ? '' : mode.textAtStart;
  if (!(lineBreakCount(cleanEnteredCellText(mode.text)) > lineBreakCount(cleanEnteredCellText(textBefore)))) return {};
  let sharedFormat = reads.sharedFormatBetween(selection.activeCell, selection.selectionCorner);
  let cells = cellBlockOfSelection(state, reads, selection);
  if (sharedFormat?.alignment.wrap === true || cells === null) return {};
  let wrapEdit = {
    kind: 'formatCells',
    cells: cells,
    format: {
      alignment: {
        wrap: true,
      },
    },
  };
  return mode.savedWhileOpen === 'typedText'
    ? {
        editsBefore: [
          {
            edit: wrapEdit,
            isPointedAt: false,
          },
        ],
      }
    : {
        editsThatGoAlong: [wrapEdit],
      };
}
export function enterEntryText(state: PageState, reads: ReadsWithTextMeasurer, text?: Dynamic, commit?: Dynamic, keepsFormulaOfAgent?: Dynamic) {
  let isAgentsFormula = isAgentsFormulaProposed(state);
  if (isAgentsFormula && !keepsFormulaOfAgent) {
    let discarded = discardAgentsFormula(state, reads);
    let { select: select, foundBy: foundBy } = commit;
    return withNoEffects(select === null ? discarded : moveActiveCellTo(discarded, reads, select.activeCell, foundBy));
  }
  let cellArea = mergedAreaOrCellOf(reads, state.activeCell);
  let areaOfAgentsFormula = isAgentsFormula ? cellArea : null;
  let { stage: stage } = state.formulaFromWords;
  let isAgentsFix = isAgentsFormula && stage?.kind === 'proposed' && stage.isFix === true;
  let input = entryInputWithLooks(state, reads, state.activeCell, enteredTextOf(text), doesEntryReadSigns(state, reads));
  let doneByMarks =
    cellArea === null ? null : formatDoneByMarksToType(state.mode, areaToA1AsStored(cellArea, ownRowOrderOfSheet(reads, state.sheetId)));
  return queueEdit(
    state,
    enterEntryEdit(state.activeCell, input),
    {
      ...commit,
      ...(doneByMarks !== null && {
        done: doneByMarks,
      }),
      ...(areaOfAgentsFormula !== null && {
        done: {
          what: 'formulaOfAgentEntered',
          cells: areaToA1AsStored(areaOfAgentsFormula, ownRowOrderOfSheet(reads, state.sheetId)),
        },
      }),
      ...(isAgentsFormula && {
        isKeepOfAgentsFormula: true,
      }),
      ...(isAgentsFix && {
        isKeepOfAgentsFix: true,
      }),
      endsEntryAtOnce: true,
    },
    wrapForNewLines(state, reads, selectionAtCell(state.activeCell)),
  );
}
export function commitEntry(
  state: PageState,
  reads: ReadsWithTextMeasurer,
  moveTo?: Dynamic,
  how?: Dynamic,
  done: Dynamic = null,
  keepsFormulaOfAgent: Dynamic = false,
) {
  if (state.mode.kind !== 'editing') return withNoEffects(moveActiveCellTo(state, reads, moveTo, how));
  if (isTextEntryForCheckbox(state, reads)) return withNoEffects(moveActiveCellTo(leaveEntryNotForCheckbox(state), reads, moveTo, how));
  let commit = {
    ...IF_QUEUED_DEFAULTS,
    select: selectionAtCell(moveTo),
    foundBy: how,
    done: done,
    ...(done === null
      ? {
          keepsWordsOnEntryBefore: true,
        }
      : {}),
  };
  return enterEntryText(state, reads, state.mode.text, commit, keepsFormulaOfAgent);
}
export function commitEntryToSelection(state: PageState, workbook: ReadsWithTextMeasurer) {
  let { mode: mode } = takeTimeFromList(state, workbook, 'key');
  let selection = selectionOfShownPieces(state, workbook, 'allOfIt');
  let areas = areasOfAllRanges(selection, workbook);
  let isSeveralRanges = !isSelectionMoreThanActiveCell(selection, workbook);
  if (mode.kind !== 'editing' || isSeveralRanges) return commitEntryAndMove(withoutOtherRanges(state), workbook, keyMoveOriginOf(state));
  if (
    (isBlankText(mode.text) && areas.some((area?: Dynamic) => areaHasPickerCell(workbook, state.sheetId, area))) ||
    isBareMentionEntry(state)
  )
    return withNoEffects(leaveEntryAndPeopleList(state));
  if (
    isPlainValueText(mode.text) &&
    areas.some(
      (area?: Dynamic) => workbook.filledCellsIn(state.sheetId, area).some((cellId?: Dynamic) => isCheckboxCell(workbook, cellId)),
    )
  )
    return withNoEffects(leaveEntryNotForCheckbox(state));
  if (
    isBareEqualsEntry({
      mode: mode,
    })
  )
    return withNoEffects(leaveEntryEditing(state));
  if (isAgentsFormulaProposed(state)) return withNoEffects(discardAgentsFormula(state, workbook));
  let typedIn = cellRefOf(state.activeCell);
  let { marksToTypeIn: marksToTypeIn, ...modeWithoutMarks } = mode;
  let entered = entryInputWithLooks(
    {
      ...state,
      mode: modeWithoutMarks,
    },
    workbook,
    state.activeCell,
    enteredTextOf(mode.text),
    false,
  );
  return actOnEveryRange(state, (selectingState?: Dynamic) => {
    let area = selectedArea(selectingState, workbook);
    let rangeOfArea = area === null ? null : selectionOfArea(selectingState, workbook, area);
    let cells = rangeOfArea === null ? null : cellBlockOfSelection(selectingState, workbook, rangeOfArea);
    if (rangeOfArea === null || cells === null) return withNoEffects(selectingState);
    return queueEdit(
      selectingState,
      entered.kind === 'textWithLooks'
        ? {
            kind: 'enterTextWithLooksInCells',
            cells: cells,
            typedIn: typedIn,
            textWithLooks: {
              paragraphs: entered.paragraphs,
            },
          }
        : {
            kind: 'enterInCells',
            cells: cells,
            typedIn: typedIn,
            text: enteredTextOf(mode.text),
          },
      {
        ...IF_QUEUED_DEFAULTS,
        select: selectingState,
        done: null,
        keepsWordsOnEntryBefore: true,
      },
      wrapForNewLines(state, workbook, rangeOfArea),
    );
  });
}
export function commitEntryInPlace(state: PageState, workbook: ReadsWithTextMeasurer, isKeepOfAgentsFormula: Dynamic = false) {
  let picked = takeTimeFromList(state, workbook, 'pointer');
  if (picked.mode.kind !== 'editing' || shouldDropEntry(picked, workbook, isKeepOfAgentsFormula)) return withNoEffects(dropEntry(picked, workbook));
  if (isEntryRefusedByCell(picked, workbook)) return withNoEffects(leaveEntryAndPeopleList(picked));
  let withLastDone = {
    ...picked,
    lastDone: lastDoneWorthKeeping(picked),
  };
  let done = entryEmptiedNotice(picked, workbook);
  let ifQueued = {
    ...IF_QUEUED_DEFAULTS,
    select: null,
    done: done,
  };
  return enterEntryText(withLastDone, workbook, picked.mode.text, ifQueued, isKeepOfAgentsFormula);
}
export function historyStepOfInputType(inputType?: Dynamic) {
  if (inputType === 'historyUndo') return 'undo';
  return inputType === 'historyRedo' ? 'redo' : undefined;
}
export function insertHoldsTextOfOthers(textOfOthers?: Dynamic, before?: Dynamic, after?: Dynamic) {
  let shorterLength = Math.min(before.length, after.length);
  let sameAtStart: Dynamic = 0;
  while (sameAtStart < shorterLength && before[sameAtStart] === after[sameAtStart]) sameAtStart += 1;
  let sameAtEnd: Dynamic = 0;
  while (sameAtEnd < shorterLength - sameAtStart && before.at(-1 - sameAtEnd) === after.at(-1 - sameAtEnd)) sameAtEnd += 1;
  let inserted = after.slice(sameAtStart, after.length - sameAtEnd);
  if (inserted.length > LONGEST_INSERT_TAKEN_AS_TYPED) return true;
  for (let at: Dynamic = 0; at + OTHERS_TEXT_MATCH_LENGTH <= inserted.length; at += 1)
    if (textOfOthers.includes(inserted.slice(at, at + OTHERS_TEXT_MATCH_LENGTH))) return true;
  return false;
}
export function withTextOfOthersFlag(
  { mode: before }: Dynamic,
  after: Dynamic,
  { isOfHistory: isOfHistory, isNotTyped: isNotTyped }: Dynamic,
) {
  if (after.mode.kind !== 'editing') return after;
  let modeAfter = {
    ...after.mode,
    ...(isNotTyped === true && {
      holdsWhatWasNotTyped: true,
    }),
  };
  if (before.kind !== 'editing')
    return {
      ...after,
      mode: modeAfter,
    };
  let { textOfOthersHeld: textOfOthersHeld } = before;
  return !(
    isOfHistory === true ||
    (textOfOthersHeld !== undefined && (isNotTyped === true || insertHoldsTextOfOthers(textOfOthersHeld, before.text, after.mode.text)))
  ) || before.text.includes(after.mode.text)
    ? {
        ...after,
        mode: modeAfter,
      }
    : {
        ...after,
        mode: {
          ...modeAfter,
          mayHoldTextOfOthers: true,
        },
      };
}
export function entryEditToSave(state: PageState, reads: WorkbookReads) {
  let isNotForCell = isEntryForPicker(state, reads) || isTextEntryForCheckbox(state, reads) || isEntryRefusedByCell(state, reads);
  if (state.mode.kind !== 'editing' || isNotForCell) return null;
  if (state.formulaFromWords.stage !== null) return null;
  if (enteredTextOf(state.mode.text) === '') return null;
  if (state.peopleList !== null && isMentionText(cleanEnteredCellText(state.mode.text))) return null;
  let input = entryInputWithLooks(state, reads, state.activeCell, enteredTextOf(state.mode.text), doesEntryReadSigns(state, reads));
  return enterEntryEdit(state.activeCell, input);
}
export function saveEntryLeavingItOpen(state: PageState, reads: WorkbookReads) {
  let stateWithTime = takeTimeFromList(state, reads, 'pointer');
  let edit = shouldDropEntry(stateWithTime, reads, false) ? null : entryEditToSave(stateWithTime, reads);
  if (state.mode.kind !== 'editing' || edit === null) return withNoEffects(state);
  let stateSaved = {
    ...state,
    mode: {
      ...state.mode,
      savedWhileOpen: 'typedText',
    },
  };
  return queueEdit(stateSaved, markEditByPage(edit), {
    ...IF_QUEUED_DEFAULTS,
    select: null,
    done: null,
    leavesEntryOpen: true,
    isSaveOfOpenEntry: true,
  });
}
export function toggleEntryCheckboxAndSave(state: PageState, reads: WorkbookReads, selectedInBox?: Dynamic, line?: Dynamic) {
  let toggled = toggleEntryCheckbox(state, selectedInBox, line);
  if (toggled === state || toggled.mode.kind !== 'editing') return withNoEffects(toggled);
  let { marksToTypeIn: marksToTypeIn, ...modeWithoutMarks } = toggled.mode;
  let edit = entryEditToSave(
    {
      ...toggled,
      mode: modeWithoutMarks,
    },
    reads,
  );
  if (edit === null) return withNoEffects(toggled);
  let { text: text, textAtStart: textAtStart, savedWhileOpen: savedWhileOpenBefore = 'boxesAlone' } = toggled.mode;
  let savedWhileOpen = text === textAtStart ? savedWhileOpenBefore : 'typedText';
  let modeSaved = {
    ...toggled.mode,
    savedWhileOpen: savedWhileOpen,
    textAtStart: text,
  };
  return queueEdit(
    {
      ...toggled,
      mode: modeSaved,
    },
    edit,
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      done: null,
      leavesEntryOpen: true,
    },
  );
}
export function endEntryOnPointerPress(state: Dynamic, workbook: ReadsWithTextMeasurer, target?: Dynamic) {
  let undragged = {
    ...state,
    dragging: null,
  };
  if (isFormulaUnfinishedInEntry(state)) return withNoEffects(undragged);
  if (target !== null && !('activeCell' in target)) return commitEntryAndMove(undragged, workbook, target, 'pointer');
  let committed = commitEntryInPlace(undragged, workbook);
  if (target === null) return committed;
  if (committed.state.mode.kind !== 'editing')
    return {
      ...committed,
      state: {
        ...withoutOtherRanges(committed.state),
        ...target,
        cameToMergedCellsAt: null,
      },
    };
  let selectRequest = pointerSelectRequest(target);
  return {
    ...committed,
    effects: committed.effects.map((effect?: Dynamic) => withIfQueued(effect, selectRequest)),
  };
}
export const isBlankText = (text?: Dynamic) => text !== '' && cleanEnteredCellText(text).trim() === '';
export const isBlankEntryOverPicker = (state: PageState, reads: WorkbookReads) =>
  state.mode.kind === 'editing' && isBlankText(state.mode.text) && cellHasPicker(reads, activeAnchorCell(state, reads));
export const isEntryForPicker = (state: PageState, reads: WorkbookReads) =>
  isBlankEntryOverPicker(state, reads) || isBareMentionEntry(state) || isPeopleListOnActiveCell(state, reads);
export const entryCellTextAsEdited = ({ mode: mode, textToEditOfEntryCell: textToEditOfEntryCell }: Dynamic) =>
  mode.kind === 'editing' && mode.isInBoxOfOneLine === true ? flattenEnteredText(textToEditOfEntryCell) : textToEditOfEntryCell;
export const isEntryUnchanged = (state: PageState, reads: WorkbookReads) =>
  state.mode.kind === 'editing' &&
  ((state.mode.text === state.mode.textAtStart &&
    (state.mode.savedWhileOpen !== 'typedText' || entryCellTextAsEdited(state) === state.mode.textAtStart) &&
    areEntryLooksUnchanged(state, reads) &&
    withFormulaBracketsClosed(state.mode.text) === state.mode.text &&
    !doesEntryExceedReferences(state.mode.text, state, reads)) ||
    isEntryForPicker(state, reads));
export const isSavedEntryUnchanged = (state: PageState, reads: WorkbookReads) =>
  state.mode.kind === 'editing' && state.mode.savedWhileOpen !== undefined && isEntryUnchanged(state, reads) && !isEntryForPicker(state, reads);
export const isBareEqualsEntry = ({ mode: mode }: Dynamic) =>
  mode.kind === 'editing' && isBareEqualsSign(cleanEnteredCellText(mode.text));
export const isTextEntryForCheckbox = (state: PageState, reads: WorkbookReads) =>
  state.mode.kind === 'editing' && isPlainValueText(state.mode.text) && isCheckboxCell(reads, activeAnchorCell(state, reads));
export const shouldDropEntry = (state: PageState, reads: WorkbookReads, keepsFormulaOfAgent?: Dynamic) =>
  (keepsFormulaOfAgent || !isAgentsFormulaProposed(state)) &&
  (isEntryUnchanged(state, reads) ||
    isBareEqualsEntry(state) ||
    state.formulaFromWords.stage?.kind === 'asked' ||
    isTextEntryForCheckbox(state, reads));
export const leaveEntryEditing = (state: PageState) => ({
  ...clearPassingNotice(state),
  mode: NAVIGATING_MODE,
});
export const leaveEntryAndPeopleList = (state: PageState) => ({
  ...closeDropdownList(leaveEntryEditing(state)),
  peopleList: null,
});
export const leaveEntryNotForCheckbox = (state: PageState) => ({
  ...leaveEntryAndPeopleList(state),
  notice: {
    kind: 'entryNotForCheckbox',
  },
});
export const dropEntry = (state: PageState, reads: WorkbookReads) => {
  if (isEntryForPicker(state, reads)) return leaveEntryAndPeopleList(state);
  return isTextEntryForCheckbox(state, reads) ? leaveEntryNotForCheckbox(state) : leaveEntryEditing(state);
};
export const enteredTextOf = (text?: Dynamic) => withFormulaBracketsClosed(cleanEnteredCellText(text));
export const lineBreakCount = (text?: Dynamic) =>
  text.split(`
`).length - 1;
export const isHistoryOrDropInputType = (inputType?: Dynamic) =>
  /^(?:history|format)|^insertFrom(?:Drop|Yank)$/.test(inputType ?? '');
export const isTypingInputType = (inputType?: Dynamic) =>
  /^(?:insert(?:Text|ReplacementText|LineBreak|Paragraph|CompositionText|FromComposition)$|delete)/.test(inputType ?? '');
export const OTHERS_TEXT_MATCH_LENGTH = 8;
export const LONGEST_INSERT_TAKEN_AS_TYPED = 500;
export const keepsAgentsFormula = ({ effects: effects }: Dynamic) =>
  effects.some((effect?: Dynamic) => effect.kind === 'queueEdit' && effect.ifQueued.isKeepOfAgentsFormula === true);
export const commitEntryKeepingAgentsFormula = (state: PageState, workbook: ReadsWithTextMeasurer) =>
  state.mode.kind === 'editing' ? commitEntryInPlace(state, workbook, true) : null;
export const isAgentsFormulaProposed = ({ mode: mode, formulaFromWords: { stage: stage } }: Dynamic) =>
  mode.kind === 'editing' && stage?.kind === 'proposed';
export const discardAgentsFormula = (state: PageState, workbook: WorkbookReads) => ({
  ...dropEntry(state, workbook),
  lastDone: {
    what: 'formulaOfAgentDiscarded',
  },
});
export const commitEntryInPlaceIfEditing = (state: PageState, workbook: ReadsWithTextMeasurer) =>
  state.mode.kind === 'editing' ? commitEntryInPlace(state, workbook) : null;
export const cancelEntryIfEditing = (state: PageState, workbook: WorkbookReads) =>
  state.mode.kind === 'editing' ? dropEntry(state, workbook) : state;
export const stopAskingForFix = (state: PageState, workbook: WorkbookReads) =>
  state.formulaFromWords.stage?.kind === 'asked' && state.formulaFromWords.stage.isFix === true ? withNoEffects(dropEntry(state, workbook)) : null;
export const commitProposedFix = (state: PageState, workbook: ReadsWithTextMeasurer) =>
  state.formulaFromWords.stage?.kind === 'proposed' && state.formulaFromWords.stage.isFix === true
    ? commitEntryInPlaceIfEditing(state, workbook)
    : null;
export const pointerSelectRequest = (target?: Dynamic) => ({
  select: target,
  foundBy: 'pointer',
  isViewLeftAsItIs: true,
  isSelectedAlone: true,
  keepsWordsOnEntryBefore: true,
});
