import type { Dynamic } from '../dynamic.ts';
import { isCheckboxFormat } from '../chips/checkboxes.ts';
import { cellValueOf, usersOfCell, richTextBoldItalic } from '../model/cell-values.ts';
import { profileOfUser, isPeopleCell } from '../chips/people-list.ts';
import { personChipsWidth, dropdownChipExtraWidth } from './chip-metrics.ts';
import { CELL_TEXT_PADDING_X, TEXT_PADDING_BESIDE_TOTAL, listIndentOfLevel, textRoomInWidth } from './cell-metrics.ts';
import { readCellLink } from '../links/cell-links.ts';
import { githubReferenceOf, urlForDisplay } from '../links/url-display.ts';
import { shownCellText } from '../format/shown-text.ts';
import { dropdownAtCell } from '../chips/dropdown-options.ts';
import { wrappedTextOfCell } from './wrapped-rows.ts';
import { flattenLineBreaks } from './text-overflow.ts';
import { sheetOfView } from './layout.ts';
import { mergedCellsToSkipTest, mergeAnchorCellsTest } from '../selection/merged-cells.ts';
import { drawnFormatsOf } from '../format/conditional/drawn-looks.ts';
import { selectedArea, selectionOfArea } from '../selection/model.ts';
import { withNoEffects, withFormulasLeftToWorkOut } from '../state/transitions.ts';
import { IF_QUEUED_DEFAULTS, queueEdit } from '../model/edit-effects.ts';
import { selectAfterEdit } from '../state/edit-answers.ts';
import { resizeLineUnderPointer, columnsToResizeForLine, queueResizeEdit } from './resize-lines.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
export function textToFitOfCell(state: PageState, workbook: WorkbookReads, cellId?: Dynamic, format?: Dynamic, mergeAnchorOf?: Dynamic) {
  let cell = workbook.cellOf(cellId);
  let shownCell = cell ?? workbook.spilledCellOf(cellId);
  if (isCheckboxFormat(format) && cellValueOf(shownCell)?.kind === 'boolean') return 'box';
  let users = usersOfCell(cell);
  if (users.length > 0) {
    let names = users.map((userId?: Dynamic) => profileOfUser(state.profilesById, userId).name);
    let chipsWidth = personChipsWidth(users.length, isPeopleCell(workbook, cellId), format.font.size);
    let besideText = CELL_TEXT_PADDING_X + chipsWidth;
    return {
      text: names.join(''),
      wrapsInColumnAt: null,
      font: format.font,
      besideText: besideText,
    };
  }
  let shown = shownCell?.shown;
  if (shown?.kind === 'cannotBeShown' && shown.reason !== 'notPrintedYet') return null;
  let link = readCellLink(cell, format);
  let text =
    link === null || link.drawnAs === 'words' || githubReferenceOf(link.url) !== null
      ? shownCellText(shownCell, 1 / 0, workbook.decimalSign).text
      : urlForDisplay(link.url, link.drawnAs === 'addressWithoutScheme');
  if (text.trim() === '') return null;
  let isDropdownOption = cell?.dropdownOption !== undefined;
  let boldItalic = richTextBoldItalic(cell);
  let font = {
    ...format.font,
    bold: format.font.bold || isDropdownOption || boldItalic.bold,
    italic: format.font.italic || boldItalic.italic,
  };
  let hasDropdown = format.cellControl.kind === 'dropdown' && dropdownAtCell(workbook, cellId) !== null;
  let wrapped = isDropdownOption ? null : wrappedTextOfCell(cellId, mergeAnchorOf(cellId), workbook);
  if (wrapped !== null) {
    let wrapsInColumnAt = wrapped.areLinesCut === true ? null : workbook.columnIndexOf(state.sheetId, cellId.columnId);
    let { levelsInLists: levelsInLists } = wrapped;
    if (levelsInLists === undefined)
      return {
        text: wrapped.text,
        wrapsInColumnAt: wrapsInColumnAt,
        font: font,
        besideText: TEXT_PADDING_BESIDE_TOTAL,
      };
    return wrapped.text
      .split(
        `
`,
      )
      .map(
        (line?: Dynamic, lineIndex?: Dynamic) => ({
          text: line,
          wrapsInColumnAt: wrapsInColumnAt,
          font: font,
          besideText: TEXT_PADDING_BESIDE_TOTAL + Math.ceil(listIndentOfLevel(levelsInLists[lineIndex] ?? null, font.size)),
        }),
      );
  }
  return {
    text: isDropdownOption || hasDropdown ? text.replaceAll(/[ \t\r\n]+/g, ' ').replaceAll(/^ | $/g, '') : flattenLineBreaks(text),
    wrapsInColumnAt: null,
    font: font,
    besideText: (isDropdownOption ? CELL_TEXT_PADDING_X : TEXT_PADDING_BESIDE_TOTAL) + dropdownChipExtraWidth(isDropdownOption, hasDropdown),
  };
}
export function cachedCharacterWidths(workbook: ReadsWithTextMeasurer, font?: Dynamic) {
  let widths = new (Map as Dynamic)();
  return (text?: Dynamic) => {
    let cached = widths.get(text);
    if (cached !== undefined) return cached;
    let width = workbook.widthOfCharacters(text, font);
    widths.set(text, width);
    return width;
  };
}
export function widestWordAndLine(text?: Dynamic, widthOf?: Dynamic) {
  let wordWidth: Dynamic = 0;
  let lineWidth: Dynamic = 0;
  let widestWord: Dynamic = 0;
  let widestLine: Dynamic = 0;
  for (let character of text as Dynamic) {
    let isLineBreak =
      character ===
      `
`;
    let width = isLineBreak ? 0 : widthOf(character);
    wordWidth = isLineBreak || character === ' ' ? 0 : wordWidth + width;
    lineWidth = isLineBreak ? 0 : lineWidth + width;
    if (wordWidth > widestWord) widestWord = wordWidth;
    if (lineWidth > widestLine) widestLine = lineWidth;
  }
  return {
    word: widestWord,
    line: widestLine,
  };
}
export function fitColumnsEdit(state: PageState, workbook: ReadsWithTextMeasurer, oneColumn?: Dynamic, otherColumn?: Dynamic) {
  let { sheetId: sheetId } = state;
  let oneIndex = workbook.columnIndexOf(sheetId, oneColumn);
  let otherIndex = workbook.columnIndexOf(sheetId, otherColumn);
  let layout = sheetOfView(state, workbook);
  if (oneIndex === null || otherIndex === null || layout === undefined) return null;
  let { rowCount: rowCount, columnEdges: columnEdges } = layout;
  let leftColumnIndex = Math.min(oneIndex, otherIndex);
  let columnCount = Math.abs(oneIndex - otherIndex) + 1;
  let area = {
    topRowIndex: 0,
    rowCount: rowCount,
    leftColumnIndex: leftColumnIndex,
    columnCount: columnCount,
  };
  let isSkippedCell = mergedCellsToSkipTest(workbook, sheetId, area);
  let mergeAnchorOf = mergeAnchorCellsTest(workbook, sheetId, area);
  let formats = drawnFormatsOf(workbook, sheetId, workbook.formatsGivenIn(sheetId));
  let cells = workbook.cellsOnShowIn(sheetId, area);
  let texts: Dynamic = [];
  let hasAny: Dynamic = cells.length > MOST_CELLS_MEASURED_TO_FIT;
  for (let value of cells.slice(0, MOST_CELLS_MEASURED_TO_FIT) as Dynamic) {
    let value2 = isSkippedCell(value) ? null : textToFitOfCell(state, workbook, value, formats.formatOf(value), mergeAnchorOf);
    if (value2 === null) continue;
    hasAny = true;
    if (value2 !== 'box')
      for (let text of [value2].flat() as Dynamic)
        texts.push({
          ...text,
          columnId: value.columnId,
        });
  }
  if (!hasAny) return null;
  let fontGroups = new (Map as Dynamic)();
  let fontGroupOf = (font?: Dynamic) => {
    let key = `${font.size} ${font.bold} ${font.italic}`;
    let group = fontGroups.get(key) ?? {
      font: font,
      text: '',
      widthOfCharacter: cachedCharacterWidths(workbook, font),
    };
    fontGroups.set(key, group);
    return group;
  };
  for (let { text: value, font: value2 } of texts as Dynamic) fontGroupOf(value2).text += value;
  for (let { text: value, font: value2 } of fontGroups.values() as Dynamic) workbook.widthOfCharacters(value, value2);
  let widthNeeded = ({ text: text, wrapsInColumnAt: wrapsInColumnAt, font: font, besideText: besideText }: Dynamic) => {
    if (wrapsInColumnAt === null) return Math.ceil(workbook.widthOfCharacters(text, font)) + besideText;
    let { word: wordWidth, line: lineWidth } = widestWordAndLine(text, fontGroupOf(font).widthOfCharacter);
    let columnWidth = columnEdges.sizeOf(wrapsInColumnAt);
    let indent = besideText - TEXT_PADDING_BESIDE_TOTAL;
    return Math.ceil(wordWidth) + indent <= textRoomInWidth(columnWidth)
      ? Math.min(Math.ceil(lineWidth) + besideText, columnWidth)
      : Math.ceil(wordWidth) + besideText;
  };
  let widthByColumn = new (Map as Dynamic)();
  for (let value of texts as Dynamic) widthByColumn.set(value.columnId, Math.max(widthByColumn.get(value.columnId) ?? 0, widthNeeded(value)));
  let noNarrowerThan = [...widthByColumn].map(
    ([column, width]: Dynamic) => ({
      column: column,
      widthInPixels: width,
    }),
  );
  return {
    kind: 'fitColumns',
    sheetId: sheetId,
    oneColumn: oneColumn,
    otherColumn: otherColumn,
    noNarrowerThan: noNarrowerThan,
  };
}
export function fitSelectedColumnsToText(state: PageState, reads: ReadsWithTextMeasurer) {
  let area = selectedArea(state, reads);
  let selection = area === null ? null : selectionOfArea(state, reads, area);
  if (selection === null) return withNoEffects(state);
  let { activeCell: activeCell, selectionCorner: selectionCorner } = selection;
  let fitEdit = fitColumnsEdit(state, reads, activeCell.columnId, selectionCorner.columnId);
  let queueOptions = {
    ...IF_QUEUED_DEFAULTS,
    select: state,
    done: {
      what: 'columnsSized',
      widthInPixels: null,
    },
  };
  return fitEdit === null ? withNoEffects(selectAfterEdit(state, reads, queueOptions, null)) : queueEdit(state, fitEdit, queueOptions);
}
export function fitColumnToTextOnDoublePress(state: PageState, action?: Dynamic, context?: Dynamic) {
  let resizeLine = action.isByFinger ? null : resizeLineUnderPointer(state, action, context)?.line;
  if (resizeLine?.isA !== 'column') return null;
  let { reads: reads, areFormulasLeft: areFormulasLeft } = context;
  if (areFormulasLeft) return withFormulasLeftToWorkOut(state, action);
  let fitEdit = (fitColumnsEdit as Dynamic)(state, reads, ...columnsToResizeForLine(state, reads, resizeLine));
  return fitEdit === null ? withNoEffects(state) : queueResizeEdit(state, fitEdit);
}
export const MOST_CELLS_MEASURED_TO_FIT = 1e5;
