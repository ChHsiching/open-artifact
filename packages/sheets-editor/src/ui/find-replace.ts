import type { Dynamic } from '../dynamic.ts';
import {
  textMatchesFind,
  MAX_FIND_SHOWN_CHARACTERS,
  isFindHit,
  numberTextMatchesFind,
  findQueryOf,
  isModalOpen,
  findHitsReadyToStep,
  indexOfActiveFindHit,
  stepFindHit,
} from './find.ts';
import { formulaTextOf, cellInputText, cellValueOf } from '../model/cell-values.ts';
import { stripTextPrefixQuote, textAsTypedInput, sanitizeCellText } from '../model/cell-text.ts';
import { stripGroupSeparators, parsePlainNumber } from '../format/number-signs.ts';
import { shownCellText } from '../format/shown-text.ts';
import { cellRefOf, isFormulaCell } from '../model/workbook.ts';
import { withNoEffects } from '../state/transitions.ts';
import { queueEdit, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { withoutOtherRanges } from '../selection/several-ranges.ts';
import { selectionAtCell } from '../selection/model.ts';
import { shownCellOf } from '../grid/formulas-shown.ts';
import { makeIsCellFilteredOut } from '../tables/filtered-rows.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function replaceInFormulaText(formulaText?: Dynamic, pattern?: Dynamic, replacement?: Dynamic) {
  let replaced = formulaText.replaceAll(pattern, () => replacement);
  if (replaced === formulaText) return 'same';
  return /^=\s*\S/u.test(replaced)
    ? {
        write: replaced,
      }
    : 'skipped';
}
export function isMatchInHiddenFormula({ areFormulasShown: areFormulasShown }: Dynamic, reads: WorkbookReads, cellRef?: Dynamic, find?: Dynamic) {
  if (!find.isInFormulas || areFormulasShown) return false;
  let cell = reads.cellOf(cellRef);
  return cell?.input.kind === 'formula' && textMatchesFind(formulaTextOf(cell), find);
}
export function replacementOfCell(
  state: PageState,
  reads: WorkbookReads,
  cellRef?: Dynamic,
  find?: Dynamic,
  pattern?: Dynamic,
  replacement?: Dynamic,
) {
  let cell = reads.cellOf(cellRef);
  if (cell === null || reads.formatOf(cellRef).cellControl.kind !== 'none') return 'skipped';
  let { kind: inputKind } = cell.input;
  if (inputKind === 'formula' && state.areFormulasShown) return replaceInFormulaText(formulaTextOf(cell), pattern, replacement);
  if (isMatchInHiddenFormula(state, reads, cellRef, find)) return replaceInFormulaText(formulaTextOf(cell), pattern, replacement);
  if (inputKind !== 'text' && inputKind !== 'number' && inputKind !== 'boolean') return 'skipped';
  let { decimalSign: decimalSign } = reads;
  let inputText = cellInputText(cell, decimalSign);
  let isTextShownOtherwise = cell.input.kind === 'text' && inputText !== cell.input.value;
  let textToSearch = isTextShownOtherwise ? stripTextPrefixQuote(inputText) : inputText;
  let shownText = stripGroupSeparators(shownCellText(cell, MAX_FIND_SHOWN_CHARACTERS, decimalSign).text, decimalSign);
  if (inputKind === 'number' && !shownText.includes(textToSearch.replace(/^-/u, '').replace(/%$/u, ''))) return 'skipped';
  let replaced = textToSearch.replaceAll(pattern, () => replacement);
  if (replaced === textToSearch) return textToSearch.search(pattern) === -1 ? 'skipped' : 'same';
  let typedBack = textAsTypedInput(replaced, decimalSign);
  let isTextFormat = reads.formatOf(cellRef).numberFormat.kind === 'text';
  if (isTextShownOtherwise)
    return typedBack === replaced && /\d/u.test(replaced) && !isTextFormat
      ? 'skipped'
      : {
          write: typedBack,
        };
  let written =
    inputKind === 'number' && textToSearch.endsWith('%') && parsePlainNumber(replaced, decimalSign) !== null ? `${replaced}%` : replaced;
  return written === inputText
    ? 'skipped'
    : {
        write: written,
      };
}
export function* cellsToSearch(state: PageState, reads: WorkbookReads, find?: Dynamic): Generator<Dynamic, Dynamic, Dynamic> {
  let { sheetId: sheetId } = state;
  let rowCount = reads.listSheets().find((sheet?: Dynamic) => sheet.sheetId === sheetId)?.rowCount ?? 0;
  for (let rowIndex: Dynamic = 0; rowIndex < rowCount; rowIndex += 1)
    for (let columnIndex of reads.columnIndexesOnShowIn(sheetId, rowIndex) as Dynamic) {
      let cellId = reads.cellIdAt(sheetId, rowIndex, columnIndex);
      if (
        cellId === null ||
        !isFindHit(
          state,
          reads,
          {
            cellId: cellId,
            rowIndex: rowIndex,
            columnIndex: columnIndex,
          },
          find,
        )
      )
        continue;
      let mergedArea = reads.mergedAreaAt(sheetId, {
        rowIndex: rowIndex,
        columnIndex: columnIndex,
      });
      if (mergedArea === null || (mergedArea.topRowIndex === rowIndex && mergedArea.leftColumnIndex === columnIndex)) yield cellId;
    }
}
export function replaceAllEdits(state: PageState, reads: WorkbookReads, find?: Dynamic, replacement?: Dynamic) {
  let pattern = findPatternOf(find.text, find);
  let cells: Dynamic = [];
  let shownByFormulas = new (Map as Dynamic)();
  let leftCount: Dynamic = 0;
  let isOutOfScope = outOfFindScope(state, reads, find);
  for (let cellRef of cellsToSearch(state, reads, find) as Dynamic) {
    if (isOutOfScope(cellRef)) {
      leftCount += 1;
      continue;
    }
    let outcome = replacementOfCell(state, reads, cellRef, find, pattern, replacement);
    if (outcome === 'skipped') leftCount += 1;
    if (outcome === 'skipped' && isMatchInShownCell(state, reads, cellRef, find))
      shownByFormulas.set(findCellKeyOf(cellRef), shownTextOf(reads, cellRef));
    if (typeof outcome === 'string') continue;
    if (
      cells.push({
        ...cellRefOf(cellRef),
        text: outcome.write,
      }) > MAX_CELLS_REPLACED
    )
      return null;
  }
  return {
    cells: cells,
    leftCount: leftCount,
    shownByFormulas: shownByFormulas,
  };
}
export function isStillMatching(cell?: Dynamic, find?: Dynamic, pattern?: Dynamic, decimalSign?: Dynamic) {
  let shownText = shownCellText(cell, MAX_FIND_SHOWN_CHARACTERS, decimalSign).text.replaceAll(
    pattern,
    `
`,
  );
  if (textMatchesFind(shownText, find)) return true;
  return cellValueOf(cell)?.kind === 'number' && numberTextMatchesFind(shownText, find, decimalSign);
}
export function countLeftAfterReplaceAll(
  { undoOffer: undoOffer, ofReplaceAll: ofReplaceAll }: Dynamic,
  state: Dynamic,
  { reads: reads, areFormulasLeft: areFormulasLeft }: Dynamic,
) {
  if (undoOffer?.kind !== 'replacedInCells' || ofReplaceAll === undefined || areFormulasLeft) return undoOffer;
  let { sheetId: sheetId, areFormulasShown: areFormulasShown, asked: asked, text: text, shownByFormulas: shownByFormulas } = ofReplaceAll;
  let find = findQueryOf(asked, reads, sheetId);
  let stateAsAsked = {
    ...state,
    sheetId: sheetId,
    areFormulasShown: areFormulasShown,
  };
  let pattern = text === '' ? null : findPatternOf(text, find);
  let { leftCount: leftCount }: Dynamic = undoOffer;
  let isOutOfScope = outOfFindScope(stateAsAsked, reads, find);
  for (let cellRef of cellsToSearch(stateAsAsked, reads, find) as Dynamic) {
    if (isOutOfScope(cellRef) || !isMatchInShownCell(stateAsAsked, reads, cellRef, find)) continue;
    if (
      pattern === null ||
      shownByFormulas.get(findCellKeyOf(cellRef)) === shownTextOf(reads, cellRef) ||
      isStillMatching(reads.cellOnShowIn(cellRef), find, pattern, reads.decimalSign)
    )
      leftCount += 1;
  }
  return {
    ...undoOffer,
    leftCount: leftCount,
  };
}
export function replaceInEveryCell(
  state: PageState,
  { reads: reads, areFormulasLeft: areFormulasLeft }: Dynamic,
  find?: Dynamic,
  replacement?: Dynamic,
) {
  let findInSheet = findQueryOf(find, reads, state.sheetId);
  let found = replaceAllEdits(state, reads, findInSheet, replacement);
  if (found === null)
    return withNoEffects({
      ...state,
      notice: {
        kind: 'editRefused',
        why: 'tooLargeForOneEdit',
        asked: 'otherEdit',
      },
    });
  let { cells: cells, leftCount: leftCount, shownByFormulas: shownByFormulas } = found;
  let leftNotShown = leftCount - shownByFormulas.size;
  if (cells.length === 0) {
    let countLeft = areFormulasLeft ? leftNotShown : leftCount;
    return withNoEffects(
      countLeft === 0
        ? state
        : {
            ...state,
            notice: {
              kind: 'matchesNotReplaced',
              count: countLeft,
            },
          },
    );
  }
  return queueEdit(
    {
      ...state,
      lastDone: null,
    },
    pasteTextsEdit(state, reads, cells),
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      done: null,
      ...(isFindOverWholeSheet(findInSheet) && {
        reachesRowsOutOfView: true,
      }),
      undoOffer: {
        kind: 'replacedInCells',
        count: cells.length,
        leftCount: leftNotShown,
      },
      ...(!areFormulasLeft && {
        ofReplaceAll: {
          sheetId: state.sheetId,
          areFormulasShown: state.areFormulasShown,
          asked: {
            text: find.text,
            options: find.options,
          },
          text: replacement,
          shownByFormulas: shownByFormulas,
        },
      }),
      thenEvent: {
        kind: 'findLookedAgain',
      },
    },
  );
}
export function dropReplacementsNotShown(state: PageState, edit?: Dynamic, textThatNoCellShows?: Dynamic, ifQueued?: Dynamic) {
  let { done: done, undoOffer: undoOffer, ofReplaceAll: ofReplaceAll } = ifQueued;
  if (edit.kind !== 'pasteTexts') return null;
  let unshownKeys = new (Set as Dynamic)(textThatNoCellShows === 'tooMany' ? [] : textThatNoCellShows.map(findCellKeyOfRc));
  let unshownTexts = new (Set as Dynamic)(
    edit.cells.filter((cell?: Dynamic) => unshownKeys.has(findCellKeyOfRc(cell))).map(({ text: text }: Dynamic) => text),
  );
  let keptCells = edit.cells.filter(
    ({ text: text }: Dynamic) => (textThatNoCellShows === 'tooMany' ? !text.startsWith('=') : !unshownTexts.has(text)),
  );
  let droppedCount = edit.cells.length - keptCells.length;
  if (droppedCount === 0) return null;
  if (done === 'replaced')
    return withNoEffects({
      ...state,
      notice: {
        kind: 'matchesNotReplaced',
        count: 1,
      },
    });
  if (undoOffer?.kind !== 'replacedInCells') return null;
  let leftCount = undoOffer.leftCount + droppedCount;
  if (keptCells.length === 0) {
    let notReplacedCount = leftCount + (ofReplaceAll?.shownByFormulas.size ?? 0);
    return withNoEffects({
      ...state,
      notice: {
        kind: 'matchesNotReplaced',
        count: notReplacedCount,
      },
    });
  }
  return queueEdit(
    state,
    {
      ...edit,
      cells: keptCells,
    },
    {
      ...ifQueued,
      undoOffer: {
        ...undoOffer,
        count: keptCells.length,
        leftCount: leftCount,
      },
    },
  );
}
export function replaceFound(state: PageState, context: Dynamic, { text: text, where: where }: Dynamic) {
  let { reads: reads, areFormulasLeft: areFormulasLeft } = context;
  let { mode: mode, dragging: dragging, find: find } = state;
  if (mode.kind !== 'navigating' || isModalOpen(state) || dragging !== null || find === null || find.text === '') return withNoEffects(state);
  let [findInSheet, replacement] = [findQueryOf(find, reads, state.sheetId), sanitizeCellText(text)];
  if (where === 'everyCell') return replaceInEveryCell(state, context, find, replacement);
  let stateLooked = findHitsReadyToStep(state, 1, reads);
  let outcome =
    indexOfActiveFindHit(stateLooked) === null
      ? 'same'
      : replacementOfCell(stateLooked, reads, stateLooked.activeCell, findInSheet, findPatternOf(findInSheet.text, findInSheet), replacement);
  if (typeof outcome === 'string') {
    let stateStepped = stepFindHit(stateLooked, 1, reads);
    let notice = {
      kind: 'matchesNotReplaced',
      count: 1,
    };
    let isNoticeShown =
      outcome === 'skipped' && !(areFormulasLeft && isMatchInShownCell(stateLooked, reads, stateLooked.activeCell, findInSheet));
    return withNoEffects(
      isNoticeShown
        ? {
            ...stateStepped,
            notice: notice,
          }
        : stateStepped,
    );
  }
  let stateAtCell = {
    ...withoutOtherRanges(stateLooked),
    ...selectionAtCell(stateLooked.activeCell),
  };
  return queueEdit(
    stateAtCell,
    pasteTextsEdit(stateLooked, reads, [
      {
        ...cellRefOf(stateLooked.activeCell),
        text: outcome.write,
      },
    ]),
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      done: 'replaced',
      thenEvent: {
        kind: 'findStepped',
        by: 1,
      },
    },
  );
}
export const REGEX_SPECIAL_PATTERN = /[.*+?^${}()|[\]\\]/g;
export const findPatternOf = (text: Dynamic, { matchesCase: matchesCase }: Dynamic) =>
  new (RegExp as Dynamic)(text.replaceAll(REGEX_SPECIAL_PATTERN, String.raw`\$&`), matchesCase ? 'gu' : 'giu');
export const MAX_CELLS_REPLACED = 3000;
export const findCellKeyOf = ({ rowId: rowId, columnId: columnId }: Dynamic) => `${rowId} ${columnId}`;
export const shownTextOf = (reads: WorkbookReads, cellRef?: Dynamic) =>
  shownCellText(reads.cellOnShowIn(cellRef), MAX_FIND_SHOWN_CHARACTERS, reads.decimalSign).text;
export const isMatchInShownCell = (state: Dynamic, reads: WorkbookReads, cellRef?: Dynamic, find?: Dynamic) =>
  isFormulaCell(reads, cellRef) &&
  shownCellOf(state, reads, cellRef) === reads.cellOnShowIn(cellRef) &&
  !isMatchInHiddenFormula(state, reads, cellRef, find);
export const isFindOverWholeSheet = ({ within: within }: Dynamic) => within === null;
export const outOfFindScope = (state: PageState, reads: WorkbookReads, find?: Dynamic) =>
  isFindOverWholeSheet(find) ? () => false : makeIsCellFilteredOut(state, reads);
export const pasteTextsEdit = (state: PageState, reads: WorkbookReads, cells?: Dynamic) => ({
  kind: 'pasteTexts',
  sheetId: state.sheetId,
  cells: [...cells],
  pastedTextIs: 'asTyped',
  localeOfTexts: reads.locale,
});
export const findCellKeyOfRc = ({ r: rowId, c: columnId }: Dynamic) => `${rowId} ${columnId}`;
