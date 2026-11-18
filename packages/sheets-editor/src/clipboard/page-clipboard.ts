import type { Dynamic } from '../dynamic.ts';
import { readHtmlTags, decodeHtmlEntities, rowspanOf, colspanOf } from './html-reading.ts';
import { readCellsOfAnotherProgram } from './other-programs.ts';
import { isCopiedFromSheets, keepDaysReadAsOthersAsText, copiedCellsLocaleOf, cellsToTsv, normalizeLineEnds } from './formats.ts';
import { encodeChartForClipboard, decodeChartFromClipboard } from './chart-marker.ts';
import { escapeClipboardCellText } from './text-escaping.ts';
import { programOfHtmlTag } from './css-looks.ts';
import { isOverByteLimit } from '../agent/prompt-text.ts';
import { EN_US_LOCALE } from '../format/number-signs.ts';
export function readPlainHtmlTable(html?: Dynamic) {
  let rows: Dynamic = [];
  let lastRowOfColumns: Dynamic = [];
  let cellCount: Dynamic = 0;
  let isOnlySpaceSoFar: Dynamic = true;
  let [tableWidth, rowOfWidth]: Dynamic = [0, 0];
  let isInTable: Dynamic = false;
  let isTableClosed: Dynamic = false;
  let columnIndex: Dynamic = 0;
  let textColumn: Dynamic = null;
  let cellText: Dynamic = '';
  for (let token of readHtmlTags(html) as Dynamic) {
    if (token.kind === 'unreadable') return null;
    if (token.kind === 'styleSheet') continue;
    let { name: tagName, isClosing: isClosing, attributes: attributes } = token;
    if (isHtmlOfOfficeProgram(tagName, attributes)) return null;
    if (isOnlySpaceSoFar && attributes.get('class') === 'Apple-interchange-newline') return null;
    if (textColumn !== null) {
      let textOrRowSpan = decodeHtmlEntities(token.writtenBefore);
      if (textOrRowSpan === null) return null;
      isOnlySpaceSoFar &&= !/\S/.test(textOrRowSpan);
      cellText += textOrRowSpan + (tagName === 'img' ? (attributes.get('alt') ?? '') : '');
    }
    let isTable = tagName === 'table';
    if (isTable && (isClosing ? !isInTable : isInTable || isTableClosed)) return null;
    if (!isTable && !(isInTable && HTML_TABLE_PART_TAGS.has(tagName))) continue;
    let lastRow = rows.at(-1);
    if (textColumn !== null && lastRow !== undefined && (tagName !== 'caption' || /\S/.test(cellText))) lastRow[textColumn] = cellText;
    textColumn = null;
    if (isTable) {
      isInTable = !isClosing;
      isTableClosed = isClosing;
    } else if (tagName === 'thead' || tagName === 'tbody' || tagName === 'tfoot') lastRowOfColumns = [];
    else if ((tagName === 'tr' || tagName === 'caption') && !isClosing) {
      rows.push([]);
      cellCount += 1;
      columnIndex = 0;
      if (tagName === 'caption') [textColumn, cellText, columnIndex] = [0, '', 1];
    } else if ((tagName === 'td' || tagName === 'th') && !isClosing) {
      let textOrRowSpan = rowspanOf(attributes);
      let columnSpan = colspanOf(attributes);
      if (lastRow === undefined || textOrRowSpan === null) return null;
      let firstColumnOfCell = columnIndex;
      while ((lastRowOfColumns[columnIndex] ?? 0) >= rows.length) columnIndex += 1;
      textColumn = columnIndex;
      cellText = '';
      columnIndex += columnSpan;
      if (rowOfWidth === 0) rowOfWidth = rows.length;
      if (rowOfWidth === rows.length) tableWidth = columnIndex;
      else if (columnIndex > tableWidth) return null;
      cellCount += columnIndex - firstColumnOfCell;
      for (let column: Dynamic = textColumn; column < columnIndex; column += 1)
        lastRowOfColumns[column] = Math.max(lastRowOfColumns[column] ?? 0, rows.length - 1 + textOrRowSpan);
    }
    if (cellCount > MAX_PASTED_HTML_TABLE_CELLS) return null;
  }
  let filledRows = rows.filter((row?: Dynamic) => row.length > 0);
  return isTableClosed && !(filledRows.length === 2 && !/\S/.test(filledRows[1]?.[0] ?? '')) ? filledRows : null;
}
export function cellsOfPlainTextByHtmlTable(html?: Dynamic, plainText?: Dynamic) {
  let htmlRows = /<table[\s>]/i.test(html) ? readPlainHtmlTable(html) : null;
  if (htmlRows === null) return null;
  let wordPattern = /\S+/g;
  let rows: Dynamic = [];
  for (let htmlRow of htmlRows as Dynamic) {
    let row: Dynamic = [];
    for (let htmlCell of htmlRow as Dynamic) {
      let cellLetters = (htmlCell ?? '').replaceAll(/\s+/g, '').toUpperCase();
      let cellStart: Dynamic = null;
      for (let index: Dynamic = 0; index < cellLetters.length; ) {
        let match = wordPattern.exec(plainText);
        let word = match?.[0].toUpperCase() ?? '';
        if (match === null || !cellLetters.startsWith(word, index)) return null;
        cellStart ??= match.index;
        if (wordPattern.lastIndex - cellStart > MAX_PASTED_HTML_CELL_SPAN) return null;
        index += word.length;
      }
      row.push(cellStart === null ? '' : tidyPastedCellSpaces(plainText.slice(cellStart, wordPattern.lastIndex)));
    }
    rows.push(row);
  }
  return wordPattern.lastIndex === 0 || wordPattern.test(plainText) ? null : rows;
}
export function wasExecCommandHandled(ownerDocument?: Dynamic, commandName?: Dynamic) {
  let wasHandled: Dynamic = false;
  let onCommand = (event?: Dynamic) => {
    wasHandled = event.defaultPrevented;
  };
  ownerDocument.defaultView?.addEventListener(commandName, onCommand);
  try {
    ownerDocument.execCommand(commandName);
    return wasHandled;
  } finally {
    ownerDocument.defaultView?.removeEventListener(commandName, onCommand);
  }
}
export function readCutToken(clipboardData?: Dynamic) {
  let cutToken = clipboardData?.getData(CUT_TOKEN_MIME) ?? '';
  return cutToken === '' ? null : cutToken;
}
export function readCopiedCellsText(clipboardData?: Dynamic) {
  let cellsText = clipboardData?.getData(SHEETS_CELLS_MIME) ?? '';
  return cellsText === '' || isPastedTextTooLarge(cellsText) || CONTROL_OR_SURROGATE_CHAR_PATTERN.test(cellsText) ? null : cellsText;
}
export function readPasteOfAnotherProgram(clipboardData?: Dynamic) {
  let html = clipboardData?.getData('text/html') ?? '';
  let plainText = clipboardData?.getData('text/plain') ?? '';
  if (html === '' || isPastedTextTooLarge(html) || isPastedTextTooLarge(plainText)) return null;
  let compactTable = clipboardData?.getData(GOOGLE_SHEETS_COMPACT_TABLE_MIME) ?? '';
  return readCellsOfAnotherProgram(html, plainText, isPastedTextTooLarge(compactTable) ? '' : compactTable);
}
export function readTextWrittenFromCells(clipboardData?: Dynamic) {
  let typedText = clipboardData?.getData(TYPED_WITH_NUMBER_FORMATS_MIME) ?? '';
  if (typedText !== '') {
    let locale = clipboardData?.getData(LOCALE_OF_TEXTS_MIME) ?? '';
    return {
      text: typedText,
      isPlainText: false,
      pastedTextIs: 'writtenFromACell',
      localeOfTexts: localeOfTextsOrDefault(locale === '' ? null : locale),
    };
  }
  let html = clipboardData?.getData('text/html') ?? '';
  if (!isCopiedFromSheets(html)) return null;
  let plainText = clipboardData?.getData('text/plain') ?? '';
  return {
    text: !isPastedTextTooLarge(html) && !isPastedTextTooLarge(plainText) ? keepDaysReadAsOthersAsText(plainText, html) : plainText,
    isPlainText: true,
    pastedTextIs: 'writtenFromACell',
    localeOfTexts: localeOfTextsOrDefault(copiedCellsLocaleOf(html)),
  };
}
export function readPastedText(clipboardData?: Dynamic) {
  let fromCells = readTextWrittenFromCells(clipboardData);
  if (fromCells !== null) return fromCells;
  let html = clipboardData?.getData('text/html') ?? '';
  let plainText = clipboardData?.getData('text/plain') ?? '';
  let htmlTableRows =
    html !== '' && !isPastedTextTooLarge(html) && !isPastedTextTooLarge(plainText) ? cellsOfPlainTextByHtmlTable(html, plainText) : null;
  return {
    text: htmlTableRows === null ? plainText : cellsToTsv(htmlTableRows),
    isPlainText: true,
    pastedTextIs: 'asTyped',
    localeOfTexts: null,
  };
}
export function pasteChosenFrom(clipboard?: Dynamic, clipboardData?: Dynamic, plainOnly?: Dynamic) {
  let chosenData = plainOnly && clipboardData !== null ? plainTextPartOf(clipboardData) : clipboardData;
  let keptOfLastPut = clipboard.keptOfLastPutAtPasteOf(chosenData);
  let pasted = readPastedText(chosenData);
  return {
    kind: 'pasteChosen',
    cutToken: readCutToken(chosenData),
    copiedCellsAsText: readCopiedCellsText(chosenData),
    ofAnotherProgram: readPasteOfAnotherProgram(chosenData),
    valuesOfCopiedCells: keptOfLastPut?.valuesOfCopiedCells ?? null,
    ...pasted,
    ...(keptOfLastPut !== null && {
      text: keptOfLastPut.textWithNumbersWhole,
    }),
    ...(keptOfLastPut === null &&
      readTextWrittenFromCells(clipboardData) === null &&
      readPasteOfAnotherProgram(clipboardData) === null &&
      pasted.text === (chosenData?.getData('text/plain') ?? '') && {
        markdownIs: plainOnly ? 'wordsAlone' : 'read',
      }),
    localeOfTexts: chosenData === clipboardData ? pasted.localeOfTexts : (readTextWrittenFromCells(clipboardData)?.localeOfTexts ?? null),
  };
}
export function pasteOfLastPutHere(clipboard?: Dynamic, pasteWhat?: Dynamic) {
  let lastPut = clipboard.lastPutHere();
  if (lastPut === null) return null;
  if (pasteWhat === 'all') return pasteChosenFrom(clipboard, lastPut, false);
  let valuesOfLastPut = clipboard.valuesOfLastPutHere();
  if (valuesOfLastPut === null) return null;
  return {
    ...pasteChosenFrom(clipboard, lastPut, true),
    valuesOfCopiedCells: valuesOfLastPut,
  };
}
export function createSheetClipboard(ownerDocument: Dynamic = null, chartKeyPromise: Dynamic = null) {
  let chartKey: Dynamic = null;
  chartKeyPromise?.then((key?: Dynamic) => {
    chartKey = key;
    return;
  });
  let clipboardDataOfCopy: Dynamic = null;
  let isBrowserAskedForCells: Dynamic = false;
  let keptOfLastPut: Dynamic = null;
  let lastPutHere: Dynamic = null;
  let lastPutListeners = new (Set as Dynamic)();
  let setLastPutHere = (entries?: Dynamic) => {
    if (entries === lastPutHere) return;
    lastPutHere = entries;
    for (let listener of lastPutListeners as Dynamic) listener();
  };
  return {
    putOnClipboard(copied?: Dynamic) {
      let {
        cutToken: cutToken,
        copiedCellsAsText: copiedCellsAsText,
        valuesOfCopiedCells: valuesOfCopiedCells,
        textWithNumbersWhole: textWithNumbersWhole,
        localeOfTexts: localeOfTexts,
        typed: typed,
        text: text,
        html: html,
      } = copied;
      if (clipboardDataOfCopy === null) return setLastPutHere(null);
      let entries = new (Map as Dynamic)();
      if (cutToken !== null) entries.set(CUT_TOKEN_MIME, cutToken);
      if (copiedCellsAsText !== null) entries.set(SHEETS_CELLS_MIME, copiedCellsAsText);
      entries.set(TYPED_WITH_NUMBER_FORMATS_MIME, typed);
      if (localeOfTexts !== null) entries.set(LOCALE_OF_TEXTS_MIME, localeOfTexts);
      entries.set('text/plain', text);
      entries.set('text/html', html);
      let isNothingCopied = text === '' && html === '';
      if (isNothingCopied) entries.set(NOTHING_COPIED_MIME, '-');
      for (let [mimeType, data] of entries as Dynamic) clipboardDataOfCopy.setData(mimeType, data);
      keptOfLastPut = {
        text: normalizeLineEnds(text),
        textWithNumbersWhole: textWithNumbersWhole,
        valuesOfCopiedCells: valuesOfCopiedCells,
      };
      setLastPutHere(isNothingCopied ? null : entries);
    },
    putChartOnClipboard(chart?: Dynamic, chartTitle?: Dynamic) {
      keptOfLastPut = null;
      if (chartKey !== null) clipboardDataOfCopy?.setData(SHEETS_CHART_MIME, encodeChartForClipboard(chart, chartKey));
      clipboardDataOfCopy?.setData('text/plain', cellsToTsv([[escapeClipboardCellText(chartTitle)]]));
    },
    chartAtPasteOf: (clipboardData?: Dynamic) => decodeChartFromClipboard(clipboardData?.getData(SHEETS_CHART_MIME) ?? '', chartKey),
    keptOfLastPutAtPasteOf(clipboardData?: Dynamic) {
      if (normalizeLineEnds(clipboardData?.getData('text/plain') ?? '') !== keptOfLastPut?.text) {
        keptOfLastPut = null;
        setLastPutHere(null);
      }
      return keptOfLastPut !== null && keptOfLastPut.text !== '' && holdsOnlyPlainText(clipboardData) ? keptOfLastPut : null;
    },
    duringCopy(clipboardData?: Dynamic, copy?: Dynamic) {
      setLastPutHere(null);
      clipboardDataOfCopy = clipboardData;
      try {
        copy();
      } finally {
        clipboardDataOfCopy = null;
      }
    },
    askBrowserToCopyOrCutCells(commandName?: Dynamic) {
      isBrowserAskedForCells = true;
      try {
        return ownerDocument !== null && wasExecCommandHandled(ownerDocument, commandName);
      } finally {
        isBrowserAskedForCells = false;
      }
    },
    isBrowserAskedForCells: () => isBrowserAskedForCells,
    lastPutHere() {
      let entries = lastPutHere;
      if (entries === null) return null;
      return {
        types: Array.from<Dynamic>(entries.keys()),
        getData: (mimeType?: Dynamic) => entries.get(mimeType) ?? '',
      };
    },
    whatLastPutHereHolds() {
      if (lastPutHere === null) return null;
      return lastPutHere.has(CUT_TOKEN_MIME) ? 'cutCells' : 'copiedCells';
    },
    valuesOfLastPutHere: () => (lastPutHere === null ? null : (keptOfLastPut?.valuesOfCopiedCells ?? null)),
    forgetLastPutHere: () => setLastPutHere(null),
    somethingElseCopiedHere() {
      keptOfLastPut = null;
      setLastPutHere(null);
    },
    onLastPutHereChange(listener?: Dynamic) {
      lastPutListeners.add(listener);
      return () => void lastPutListeners.delete(listener);
    },
  };
}
export const MAX_PASTED_HTML_TABLE_CELLS = 200000;
export const MAX_PASTED_HTML_CELL_SPAN = 250000;
export const HTML_TABLE_PART_TAGS = new (Set as Dynamic)('caption col colgroup tbody td tfoot th thead tr'.split(' '));
export const isHtmlOfOfficeProgram = (tagName?: Dynamic, attributes?: Dynamic) =>
  programOfHtmlTag(tagName, attributes) !== null || (tagName === 'meta' && /^(?:progid|generator)$/i.test(attributes.get('name') ?? ''));
export const tidyPastedCellSpaces = (text?: Dynamic) =>
  text.replaceAll(
    /\s+/g,
    (spaces?: Dynamic) =>
      /[\n\r]/.test(spaces)
        ? `
`
        : spaces.replaceAll(/[\t\u{a0}]/gu, ' '),
  );
export const TYPED_WITH_NUMBER_FORMATS_MIME = 'application/x-sheets-typed-with-number-formats';
export const SHEETS_CELLS_MIME = 'application/x-sheets-cells';
export const LOCALE_OF_TEXTS_MIME = 'application/x-sheets-locale-of-texts';
export const NOTHING_COPIED_MIME = 'application/x-sheets-nothing';
export const CUT_TOKEN_MIME = 'application/x-sheets-cut-token';
export const SHEETS_CHART_MIME = 'application/x-sheets-chart';
export const MAX_PASTED_TEXT_BYTES = 16777216;
export const isPastedTextTooLarge = (text?: Dynamic) => isOverByteLimit(text, MAX_PASTED_TEXT_BYTES);
export const CONTROL_OR_SURROGATE_CHAR_PATTERN = /[\p{Cc}\p{Cs}]/u;
export const GOOGLE_SHEETS_COMPACT_TABLE_MIME = 'application/x-vnd.google-spreadsheet-compact-table+json';
export const localeOfTextsOrDefault = (locale?: Dynamic) => locale ?? EN_US_LOCALE;
export const holdsOnlyPlainText = (clipboardData?: Dynamic) =>
  clipboardData?.types.length === 1 && clipboardData.types[0] === 'text/plain';
export const plainTextPartOf = (clipboardData?: Dynamic) => ({
  types: clipboardData.types.filter((mimeType?: Dynamic) => mimeType === 'text/plain'),
  getData: (mimeType?: Dynamic) => (mimeType === 'text/plain' ? clipboardData.getData(mimeType) : ''),
});
