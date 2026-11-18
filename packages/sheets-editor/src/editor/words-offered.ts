import type { Dynamic } from '../dynamic.ts';
import { entryLooksOf } from './entry-looks.ts';
import { conditionalFormatsGivenNow } from '../format/conditional/pane-reducer.ts';
import { drawnFormatsOf } from '../format/conditional/drawn-looks.ts';
import { isHeaderGrayHidden } from '../grid/header-gray-fill.ts';
import { NO_CELL_COLORS } from '../format/cell-colors.ts';
import { usersOfCell, cellPlainText } from '../model/cell-values.ts';
import { placedTablesOfSheet, hasTableHeadings } from '../tables/finding.ts';
import { activeAnchorCell, isSameCell } from '../selection/model.ts';
import { withEntryText } from './text-looks.ts';
import { addTextPrefixQuote } from '../model/cell-text.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function isCellPlainForWordsOffer(state: PageState, reads: ReadsWithTextMeasurer, cellRef?: Dynamic) {
  let position = reads.positionOfCell(cellRef);
  if (position === null || entryLooksOf(state.mode) !== undefined) return false;
  let { sheetId: sheetId } = cellRef;
  let formats = sheetId === state.sheetId ? conditionalFormatsGivenNow(state, reads) : reads.formatsGivenIn(sheetId);
  let look = drawnFormatsOf(reads, sheetId, formats).lookOf(cellRef, position);
  let paints = isHeaderGrayHidden(state, reads, cellRef, position, look) ? NO_CELL_COLORS : look.paints;
  let { numberFormat: numberFormat, cellControl: cellControl } = look.format;
  let isTimeFormat =
    numberFormat.kind === 'date' || numberFormat.kind === 'dateAndTime' || numberFormat.kind === 'time' || numberFormat.kind === 'duration';
  return (
    cellControl.kind !== 'dropdown' &&
    !isTimeFormat &&
    usersOfCell(reads.cellOf(cellRef)).length === 0 &&
    paints.fill === null &&
    paints.text === null
  );
}
export function isWordsOfferFor(typed?: Dynamic, candidate?: Dynamic) {
  let rest = candidate.slice(typed.length);
  return (
    candidate.slice(0, typed.length).toLowerCase() === typed.toLowerCase() &&
    /^\P{M}/u.test(rest) &&
    /[^\s\p{M}\p{Cf}]/u.test(rest) &&
    candidate.length <= MAX_OFFERED_WORDS_LENGTH &&
    candidate.trim() === candidate &&
    !/[\r\n]/.test(candidate) &&
    !RTL_TEXT_PATTERN.test(candidate)
  );
}
export function headingRowTest(state: Dynamic, reads: WorkbookReads, { sheetId: sheetId }: Dynamic, columnIndex: Dynamic) {
  let headings = placedTablesOfSheet(state, reads, sheetId).all.flatMap(
    ({ table: table, header: header, columns: columns }: Dynamic) =>
      hasTableHeadings(table) && columnIndex >= columns.first && columnIndex <= columns.last ? [header] : [],
  );
  return (rowIndex?: Dynamic) => headings.some(({ first: first, last: last }: Dynamic) => rowIndex >= first && rowIndex <= last);
}
export function wordsToOfferAt(typed: Dynamic, state: Dynamic, reads: WorkbookReads, cellRef?: Dynamic) {
  let position = reads.positionOfCell(cellRef);
  if (position === null) return null;
  let isHeadingRow = headingRowTest(state, reads, cellRef, position.columnIndex);
  let offered: Dynamic = null;
  for (let distance: Dynamic = 1; distance <= MAX_ROWS_SEARCHED_FOR_WORDS; distance += 1)
    for (let rowIndex of [position.rowIndex - distance, position.rowIndex + distance] as Dynamic) {
      let cellId = isHeadingRow(rowIndex) ? null : reads.cellIdAt(cellRef.sheetId, rowIndex, position.columnIndex);
      let text = cellId === null ? null : cellPlainText(reads.cellOf(cellId));
      if (text !== null && isTypedInFull(typed, text)) return null;
      if (text !== null && offered === null && isWordsOfferFor(typed, text)) offered = text;
    }
  return offered;
}
export function refreshWordsOffered(state: PageState, reads: ReadsWithTextMeasurer, { text: text, isOpenToOffer: isOpenToOffer }: Dynamic) {
  let { mode: mode, wordsOffered: wordsOffered } = state;
  if (mode.kind !== 'editing' || mode.typingIn !== 'cell' || mode.text !== text) return state;
  if (mode.isExpanded === true) return state;
  let cellId = activeAnchorCell(state, reads);
  let offered =
    isOpenToOffer && mayOfferWordsFor(text) && isCellPlainForWordsOffer(state, reads, cellId) ? wordsToOfferAt(text, state, reads, cellId) : null;
  if (offered === null) return withoutWordsOffered(state);
  let isShown = wordsOffered?.offered === offered && wordsOffered.isShown && !wordsOffered.isGone;
  let isKeyDrawn = isShown && wordsOffered.isKeyDrawn;
  return {
    ...state,
    wordsOffered: {
      cellId: cellId,
      typed: text,
      offered: offered,
      isShown: isShown,
      isKeyDrawn: isKeyDrawn,
      isGone: false,
    },
  };
}
export function matchingWordsOffered(state?: Dynamic, offer?: Dynamic) {
  let current = wordsOfferedNow(state);
  return current !== null && isSameCell(current.cellId, offer.cellId) && current.typed === offer.typed && current.offered === offer.offered
    ? current
    : null;
}
export function showWordsOffered(state?: Dynamic, offer?: Dynamic) {
  let current = matchingWordsOffered(state, offer);
  if (current === null) return state;
  let isKeyDrawn = offer.isWithNoKey !== true;
  return {
    ...state,
    wordsOffered: {
      ...current,
      isShown: true,
      isKeyDrawn: isKeyDrawn,
    },
  };
}
export function acceptWordsOffered(state: PageState) {
  let offered = wordsOfferedNow(state);
  return offered === null || state.mode.kind !== 'editing'
    ? state
    : {
        ...state,
        wordsOffered: null,
        mode: withEntryText(state.mode, addTextPrefixQuote(offered.offered)),
      };
}
export function doesTabAcceptWordsOffered(state?: Dynamic, keyEvent?: Dynamic) {
  let isPlainKey = !keyEvent.isShiftHeld && !keyEvent.isModifierHeld && !keyEvent.isAltHeld && !keyEvent.isRepeat;
  let offered = wordsOfferedNow(state);
  return isPlainKey && keyEvent.key === 'Tab' && offered?.isShown === true && offered.isKeyDrawn;
}
export function keepWordsOffered(before: Dynamic, state: PageState, reads: ReadsWithTextMeasurer, isTypingOn?: Dynamic) {
  let { wordsOffered: wordsOffered, mode: mode } = state;
  if (wordsOffered === null) return state;
  let isStillAtCell =
    mode.kind === 'editing' &&
    mode.typingIn === 'cell' &&
    (mode.text === wordsOffered.typed || (isTypingOn && !wordsOffered.isGone)) &&
    isSameCell(wordsOffered.cellId, activeAnchorCell(state, reads)) &&
    state.menu === null &&
    state.peopleList === null &&
    state.dropdown === null;
  let isViewStill =
    state.scrollTop === before.scrollTop && state.scrollLeft === before.scrollLeft && state.workbookChangeCount === before.workbookChangeCount;
  if (!isStillAtCell) return withoutWordsOffered(state);
  let isStillOffered = wordsOffered.isGone || isCellPlainForWordsOffer(state, reads, wordsOffered.cellId);
  return isViewStill && isStillOffered ? state : hideWordsOffered(state);
}
export const MAX_ROWS_SEARCHED_FOR_WORDS = 1000;
export const MAX_OFFERED_WORDS_LENGTH = 50;
export const RTL_TEXT_PATTERN =
  /[\u0590-\u08FF\u200E\u200F\u202A-\u202E\u2066-\u2069\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
export const isTypedInFull = (typed?: Dynamic, text?: Dynamic) =>
  text.slice(0, typed.length).toLowerCase() === typed.toLowerCase() && text.slice(typed.length).trimEnd() === '';
export const mayOfferWordsFor = (text?: Dynamic) => !text.startsWith('=') && !text.startsWith('@') && /\p{L}/u.test(text);
export const wordsOfferedNow = ({ mode: mode, wordsOffered: wordsOffered }: Dynamic) =>
  mode.kind === 'editing' && wordsOffered?.typed === mode.text && !wordsOffered.isGone ? wordsOffered : null;
export const withoutWordsOffered = (state: PageState) =>
  state.wordsOffered === null
    ? state
    : {
        ...state,
        wordsOffered: null,
      };
export const hideWordsOffered = (state: PageState) =>
  state.wordsOffered?.isShown === true
    ? {
        ...state,
        wordsOffered: {
          ...state.wordsOffered,
          isGone: true,
        },
      }
    : withoutWordsOffered(state);
