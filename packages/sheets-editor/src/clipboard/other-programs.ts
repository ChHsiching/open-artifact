import type { Dynamic } from '../dynamic.ts';
import { isWellFormedText, readGoogleSheetsClipboard } from './google-sheets-data.ts';
import {
  EXCEL_NAMED_NUMBER_FORMATS,
  CELL_BORDER_SIDES,
  EMPTY_CSS_LOOK,
  lookOfCss,
  mergeCssLooks,
  formatOfCssLook,
  MOST_NUMBER_FORMAT_LENGTH,
  programOfHtmlTag,
} from './css-looks.ts';
import { isCopiedFromSheets, parseTsvQuotedOnlyIfNeeded, normalizeLineEnds, parseTsvCells } from './formats.ts';
import { parseCssDeclarations, rowspanOf, colspanOf, readHtmlTags, readCssClassRules } from './html-reading.ts';
import { richTextOfPastedCell, emptyRichTextReading, readTagIntoRichText } from './rich-text-paste.ts';
export function parseJsonAttribute(attributeValue?: Dynamic) {
  try {
    let parsed = JSON.parse(attributeValue ?? '');
    return new (Map as Dynamic)(typeof parsed === 'object' && parsed !== null ? Object.entries(parsed) : []);
  } catch {
    return new (Map as Dynamic)();
  }
}
export function googleSheetsValueOf(attributes?: Dynamic) {
  let sheetsValue = parseJsonAttribute(attributes.get('data-sheets-value'));
  let [text, number, flag] = [sheetsValue.get('2'), sheetsValue.get('3'), sheetsValue.get('4')];
  switch (sheetsValue.get('1')) {
    case 2:
      return isWellFormedText(text)
        ? {
            kind: 'text',
            value: text,
          }
        : null;
    case 3:
      return typeof number === 'number' && Number.isFinite(number)
        ? {
            kind: 'number',
            value: number,
          }
        : null;
    case 4:
      return {
        kind: 'boolean',
        value: flag === true || flag === 1,
      };
    default:
      return null;
  }
}
export function googleSheetsCellOf(attributes?: Dynamic) {
  let numberFormat = parseJsonAttribute(attributes.get('data-sheets-numberformat')).get('2');
  return {
    value: googleSheetsValueOf(attributes),
    isError: false,
    formulaByOffsets: attributes.get('data-sheets-formula') ?? null,
    numberFormatPattern: typeof numberFormat === 'string' ? numberFormat : null,
  };
}
export function excelValueOf(attributes?: Dynamic, text?: Dynamic) {
  let number = Number(attributes.get('x:num') ?? '');
  if ((attributes.get('x:num') ?? '') !== '' && Number.isFinite(number))
    return {
      kind: 'number',
      value: number,
    };
  let flag = attributes.get('x:bool');
  if (flag !== undefined)
    return {
      kind: 'boolean',
      value: flag.toUpperCase() === 'TRUE',
    };
  return attributes.has('x:str')
    ? {
        kind: 'text',
        value: text,
      }
    : null;
}
export function excelCellOf(attributes?: Dynamic, text?: Dynamic, look?: Dynamic) {
  let { pattern: pattern } = look;
  return {
    value: excelValueOf(attributes, text),
    isError: false,
    formulaByOffsets: null,
    numberFormatPattern: pattern === undefined ? null : (EXCEL_NAMED_NUMBER_FORMATS.get(pattern) ?? pattern),
  };
}
export function googleSheetsDefaultLook({ value: value, isError: isError }: Dynamic) {
  return {
    horizontal:
      value === null
        ? isError
          ? 'center'
          : 'general'
        : (
            {
              text: 'left',
              number: 'right',
              boolean: 'center',
            } as Dynamic
          )[value.kind],
    vertical: 'bottom',
    hexOfGridLine: '#cccccc',
  };
}
export function bordersOnOuterEdges(look?: Dynamic, edges?: Dynamic) {
  let { border: border, ...lookWithoutBorder } = look;
  if (border === undefined) return look;
  let kept: Dynamic = {};
  for (let side of CELL_BORDER_SIDES as Dynamic) {
    let sideBorder = border[side];
    if (edges[side] && sideBorder !== undefined) kept[side] = sideBorder;
  }
  return Object.keys(kept).length === 0
    ? lookWithoutBorder
    : {
        ...lookWithoutBorder,
        border: kept,
      };
}
export function alignmentOfMergedCell(look?: Dynamic, columnSpan?: Dynamic, rowSpan?: Dynamic) {
  let { alignment: alignment, ...lookWithoutAlignment } = look;
  if (alignment === undefined) return look;
  let { horizontal: horizontal, vertical: vertical, wrap: wrap } = alignment;
  let kept = {
    ...(horizontal !== undefined &&
      columnSpan === 1 && {
        horizontal: horizontal,
      }),
    ...(vertical !== undefined &&
      rowSpan === 1 && {
        vertical: vertical,
      }),
    ...(wrap !== undefined &&
      columnSpan === 1 && {
        wrap: wrap,
      }),
  };
  return Object.keys(kept).length === 0
    ? lookWithoutAlignment
    : {
        ...lookWithoutAlignment,
        alignment: kept,
      };
}
export function isNumberRoundedInShown(number?: Dynamic, shown?: Dynamic) {
  let exponent = /E[+-]\d+/.exec(shown)?.[0] ?? '';
  let [digits, ...moreDigitRuns] = shown.replace(exponent, '').match(DIGIT_RUN_PATTERN) ?? [];
  if (digits === undefined || moreDigitRuns.length > 0) return false;
  let scaled = (Math.abs(number) * (shown.includes('%') ? 100 : 1)) / Number(`1${exponent}`);
  let shownDigits = Number(digits.replaceAll(/\D/g, ''));
  let matchesAtDecimals = (decimals?: Dynamic) => Math.abs(scaled * 10 ** decimals - shownDigits) <= 0.5;
  let plainMatch = /^(?:\d+|\d{1,3}(?:,\d{2,3})*,\d{3})(?:\.(\d+))?$/.exec(digits);
  if (plainMatch !== null && matchesAtDecimals(plainMatch[1]?.length ?? 0)) return false;
  return matchesAtDecimals(0) || matchesAtDecimals(digits.split(/\D/).at(-1)?.length ?? 0);
}
export function readCellsOfAnotherProgram(html?: Dynamic, plainText?: Dynamic, sheetsJson: Dynamic = '') {
  if (isCopiedFromSheets(html) || !isWellFormedText(html) || !isWellFormedText(plainText)) return null;
  let plainGrid = parseTsvQuotedOnlyIfNeeded(plainText);
  let sheetsData: Dynamic = null;
  let hasReadSheetsData: Dynamic = sheetsJson === '';
  let classLooks = new (Map as Dynamic)();
  let numberFormatIndexes = new (Map as Dynamic)();
  let lookIndexes = new (Map as Dynamic)();
  let looks: Dynamic = [];
  let lookIndexFor = (format?: Dynamic, numberFormatPattern?: Dynamic, numberFormatIndex?: Dynamic) => {
    let isPlain = Object.keys(format).length === 0;
    if (isPlain && numberFormatPattern === null) return null;
    let key = `${numberFormatIndex} ${JSON.stringify(format)}`;
    let known = lookIndexes.get(key);
    if (known !== undefined) return known;
    lookIndexes.set(key, looks.length);
    return (
      looks.push({
        format: isPlain ? null : format,
        numberFormatPattern: numberFormatPattern,
      }) - 1
    );
  };
  let rows: Dynamic = [];
  let program: Dynamic = null;
  let cellsSeen: Dynamic = 0;
  let tableDepth: Dynamic = 0;
  let isLastRowHidden: Dynamic = false;
  let isInCellAfterText: Dynamic = false;
  let rowIndex: Dynamic = -1;
  let columnIndex: Dynamic = 0;
  let openCell: Dynamic = null;
  let linkLength: Dynamic = 0;
  let runCount: Dynamic = 0;
  let lookOfAttributes = (attributes?: Dynamic) =>
    (attributes.get('class') ?? '')
      .split(/\s+/)
      .map((className?: Dynamic) => classLooks.get(className) ?? EMPTY_CSS_LOOK)
      .concat(lookOfCss(parseCssDeclarations(attributes.get('style') ?? '')))
      .reduce(mergeCssLooks);
  let fontOfAttributes = (attributes?: Dynamic) =>
    attributes.has('class') || attributes.has('style') ? lookOfAttributes(attributes).font : {};
  let finishCell = ({ cell: cell, parts: parts }: Dynamic) => {
    cell.shownWithLooks = richTextOfPastedCell(cell.shown, parts);
    for (let { runs: runs } of (cell.shownWithLooks?.paragraphs ?? []) as Dynamic) {
      runCount += runs.length;
      for (let { link: link, text: text } of runs as Dynamic) linkLength += (link?.length ?? 0) * text.split('\n').length;
    }
  };
  let startCell = (program2?: Dynamic, attributes?: Dynamic) => {
    let row = (rows[rowIndex] ??= []);
    while (row[columnIndex] !== undefined) columnIndex += 1;
    let shown = plainGrid[rowIndex]?.[columnIndex] ?? '';
    let isAfterPlainText = plainGrid[rowIndex]?.[columnIndex] === undefined;
    let look = lookOfAttributes(attributes);
    let rowSpan = rowspanOf(attributes) ?? 1;
    let columnSpan = colspanOf(attributes);
    let mergesSpan = look.isRunningOnAndNotMerged !== true;
    let pastedCell =
      program2 === 'excel'
        ? excelCellOf(attributes, shown, look)
        : (sheetsData?.cells[rowIndex * sheetsData.columnCount + columnIndex] ?? googleSheetsCellOf(attributes));
    let { value: value, formulaByOffsets: formulaByOffsets } = pastedCell;
    let format = formatOfCssLook(look, program2 === 'excel' ? EXCEL_DEFAULT_LOOK : googleSheetsDefaultLook(pastedCell));
    let spanFormat = mergesSpan ? alignmentOfMergedCell(format, columnSpan, rowSpan) : format;
    let numberFormatPattern = pastedCell.numberFormatPattern;
    let safePattern =
      numberFormatPattern !== null && numberFormatPattern.length <= MOST_NUMBER_FORMAT_LENGTH && isWellFormedText(numberFormatPattern)
        ? numberFormatPattern
        : null;
    let numberFormatIndex = numberFormatIndexes.get(safePattern) ?? numberFormatIndexes.size;
    numberFormatIndexes.set(safePattern, numberFormatIndex);
    cellsSeen += rowSpan * columnSpan;
    if (cellsSeen > MOST_PASTED_CELLS) return null;
    let cell = {
      ...EMPTY_PASTED_CELL,
      shown: shown,
      value: value,
      formulaByOffsets: formulaByOffsets,
    };
    for (let rowOffset: Dynamic = 0; rowOffset < rowSpan; rowOffset += 1) {
      let spannedRow = (rows[rowIndex + rowOffset] ??= []);
      for (let columnOffset: Dynamic = 0; columnOffset < columnSpan; columnOffset += 1) {
        let isTopLeft = rowOffset === 0 && columnOffset === 0;
        let edges = {
          top: rowOffset === 0,
          bottom: rowOffset === rowSpan - 1,
          left: columnOffset === 0,
          right: columnOffset === columnSpan - 1,
        };
        let spannedCell = isTopLeft
          ? cell
          : {
              ...EMPTY_PASTED_CELL,
            };
        spannedCell.look = mergesSpan
          ? lookIndexFor(bordersOnOuterEdges(spanFormat, edges), safePattern, numberFormatIndex)
          : isTopLeft
            ? lookIndexFor(spanFormat, safePattern, numberFormatIndex)
            : null;
        spannedRow[columnIndex + columnOffset] = spannedCell;
      }
    }
    return {
      cell: cell,
      isAfterPlainText: isAfterPlainText,
      parts: emptyRichTextReading(look.font),
    };
  };
  for (let piece of readHtmlTags(html) as Dynamic) {
    if (piece.kind === 'unreadable') return null;
    if (piece.kind === 'styleSheet') {
      for (let { classNames: classNames2, declarations: declarations } of readCssClassRules(piece.text) as Dynamic) {
        let look = lookOfCss(declarations);
        for (let className of classNames2 as Dynamic) classLooks.set(className, mergeCssLooks(classLooks.get(className) ?? EMPTY_CSS_LOOK, look));
      }
      continue;
    }
    let { name: tagName, isClosing: isClosing, attributes: attributes } = piece;
    if (isInCellAfterText && piece.isAfterText) return null;
    if (openCell !== null) readTagIntoRichText(openCell.parts, piece, fontOfAttributes);
    if (openCell !== null && TABLE_HTML_TAGS.has(tagName)) {
      finishCell(openCell);
      openCell = null;
    }
    if (tagName === 'td' || tagName === 'th') isInCellAfterText = false;
    program ??= programOfHtmlTag(tagName, attributes);
    if (program === 'googleSheets' && !hasReadSheetsData) {
      sheetsData = readGoogleSheetsClipboard(sheetsJson, MOST_PASTED_CELLS);
      hasReadSheetsData = true;
    }
    if (tagName === 'table') {
      tableDepth += isClosing ? -1 : 1;
      if (program === null || tableDepth > 1 || (!isClosing && rowIndex !== -1)) return null;
    } else if (isClosing || program === null) continue;
    else if (tagName === 'tr' && tableDepth === 1) {
      isLastRowHidden = parseCssDeclarations(attributes.get('style') ?? '').get('display') === 'none';
      rowIndex += 1;
      columnIndex = 0;
    } else if ((tagName === 'td' || tagName === 'th') && tableDepth === 1) {
      openCell = rowIndex === -1 ? null : startCell(program, attributes);
      if (openCell === null) return null;
      isInCellAfterText = openCell.isAfterPlainText;
    } else if (tagName === 'span' && tableDepth === 0 && attributes.has('data-sheets-root')) {
      if (rowIndex !== -1) return null;
      rowIndex = 0;
      openCell = startCell(program, attributes);
      if (openCell === null) return null;
      isInCellAfterText = openCell.isAfterPlainText;
    }
  }
  if (openCell !== null) finishCell(openCell);
  if (isLastRowHidden) {
    rows.length = Math.min(rows.length, rowIndex);
    rowIndex -= 1;
  }
  let rowCount = Math.max(rows.length, rowIndex + 1);
  let columnCount = rows.reduce((most?: Dynamic, row?: Dynamic) => Math.max(most, row.length), 0);
  if (columnCount === 0 || rowCount * columnCount > MOST_PASTED_CELLS) return null;
  let isSheetsDataOff = sheetsData?.rowCount !== rowCount || sheetsData.columnCount !== columnCount;
  if (
    sheetsData !== null &&
    (isSheetsDataOff ||
      (() =>
        rows.some(
          (row?: Dynamic) =>
            row.some((cell?: Dynamic) => cell?.value?.kind === 'number' && isNumberRoundedInShown(cell.value.value, cell.shown)),
        ))())
  )
    return readCellsOfAnotherProgram(html, plainText);
  let lastPlainRow = plainGrid.at(-1) ?? [];
  let isLastRowShort = lastPlainRow.length < columnCount && !lastPlainRow.some((text?: Dynamic) => text.includes('\t'));
  if (
    !(
      plainGrid.length <= rowCount &&
      plainGrid.slice(0, -1).every((row?: Dynamic) => row.length === columnCount) &&
      (lastPlainRow.length === columnCount || isLastRowShort)
    )
  )
    return null;
  let keptRowCount: Dynamic = rowCount;
  while (
    keptRowCount > Math.max(plainGrid.length, 1) &&
    (rows[keptRowCount - 1] ?? []).every((cell?: Dynamic) => cell?.look === null && cell.formulaByOffsets === null)
  )
    keptRowCount -= 1;
  let keepsRichText = linkLength <= MOST_PASTED_LINK_LENGTH && runCount <= MOST_PASTED_RUNS;
  return {
    rows: Array.from<Dynamic, Dynamic>(
      {
        length: keptRowCount,
      },
      (input?: Dynamic, rowIndex2?: Dynamic) =>
        Array.from<Dynamic, Dynamic>(
          rows[rowIndex2] ?? [],
          (cell?: Dynamic) =>
            cell === undefined
              ? EMPTY_PASTED_CELL
              : keepsRichText
                ? cell
                : {
                    ...cell,
                    shownWithLooks: null,
                  },
        ),
    ),
    looks: looks,
  };
}
export function plainerPasteOfAnotherProgram(reading?: Dynamic) {
  let cells = reading.rows.flat();
  if (hasPastedLinks(reading.rows))
    return {
      ...reading,
      rows: withoutPastedLinks(reading.rows),
    };
  let plainer = hasPastedRichText(reading.rows)
    ? {
        shownWithLooks: null,
      }
    : cells.some((cell?: Dynamic) => cell.formulaByOffsets !== null)
      ? {
          formulaByOffsets: null,
        }
      : cells.some((cell?: Dynamic) => cell.value !== null) && {
          value: null,
        };
  if (plainer === false) return null;
  return {
    ...reading,
    rows: reading.rows.map(
      (row?: Dynamic) =>
        row.map(
          (cell?: Dynamic) => ({
            ...cell,
            ...plainer,
          }),
        ),
    ),
  };
}
export function readMarkdownTables(text?: Dynamic) {
  if (!/\|[ \t]*:?-/.test(text)) return null;
  let lines = normalizeLineEnds(text).split('\n');
  let rows: Dynamic = [];
  let addLinesOutOfTables = (from?: Dynamic, to?: Dynamic, isAtEnd?: Dynamic) => {
    let joined = lines.slice(from, to).join('\n');
    let cells = parseTsvCells(isAtEnd ? `x\n${joined}` : `${joined}\nx`);
    let kept = isAtEnd ? cells.slice(1) : cells.slice(0, -1);
    if (from < to)
      for (let row of kept as Dynamic)
        rows.push({
          cells: row,
          isOfTable: false,
        });
  };
  let [readTo, cellCount]: Dynamic = [0, 0];
  let fence: Dynamic = null;
  for (let index = 0; index < lines.length; index += 1) {
    let [, fenceMark = null, fenceInfo = ''] = MARKDOWN_CODE_FENCE_PATTERN.exec(lines[index] ?? '') ?? [];
    if (fence === null) fence = fenceMark;
    else if (fenceMark?.startsWith(fence) === true && fenceInfo === '') fence = null;
    if (fence !== null || !isMarkdownTableStartAt(lines, index)) continue;
    addLinesOutOfTables(readTo, index, false);
    let header = markdownTableRowCells(lines[index] ?? '');
    rows.push({
      cells: header,
      isOfTable: true,
    });
    for (index += 2; MARKDOWN_TABLE_ROW_PATTERN.test(lines[index] ?? ''); index += 1) {
      let row = markdownTableRowCells(lines[index] ?? '');
      if (((cellCount += Math.max(header.length, row.length)), cellCount > MOST_MARKDOWN_TABLE_CELLS)) return null;
      rows.push({
        cells: [...row, ...header.slice(row.length).map(() => '')],
        isOfTable: true,
      });
    }
    readTo = index;
    index -= 1;
  }
  if (readTo === 0) return null;
  if (parseTsvCells(text).some((row?: Dynamic) => row.some(hasMarkdownTableDivider))) return null;
  return (addLinesOutOfTables(readTo, lines.length, true), rows);
}
export const EXCEL_DEFAULT_LOOK = {
  horizontal: 'general',
  vertical: null,
  hexOfGridLine: null,
};
export const MOST_PASTED_CELLS = 20000;
export const MOST_PASTED_LINK_LENGTH = 1048576;
export const MOST_PASTED_RUNS = 1e5;
export const DIGIT_RUN_PATTERN = /\d[\d.,'’\s]*\d|\d/g;
export const TABLE_HTML_TAGS = new (Set as Dynamic)('table tbody td tfoot th thead tr'.split(' '));
export const EMPTY_PASTED_CELL = {
  shown: '',
  shownWithLooks: null,
  value: null,
  formulaByOffsets: null,
  look: null,
};
export const hasPastedLinks = (rows?: Dynamic) =>
  rows.some(
    (row?: Dynamic) =>
      row.some(
        (cell?: Dynamic) =>
          (cell.shownWithLooks?.paragraphs ?? []).some(
            ({ runs: runs }: Dynamic) => runs.some(({ link: link }: Dynamic) => link !== null),
          ),
      ),
  );
export const withoutPastedLinks = (rows?: Dynamic) =>
  rows.map(
    (row?: Dynamic) =>
      row.map(
        (cell?: Dynamic) =>
          cell.shownWithLooks === null
            ? cell
            : {
                ...cell,
                shownWithLooks: {
                  paragraphs: cell.shownWithLooks.paragraphs.map(
                    (paragraph?: Dynamic) => ({
                      ...paragraph,
                      runs: paragraph.runs.map(
                        (run?: Dynamic) => ({
                          ...run,
                          link: null,
                        }),
                      ),
                    }),
                  ),
                },
              },
      ),
  );
export const hasPastedRichText = (rows?: Dynamic) =>
  rows.some((row?: Dynamic) => row.some((cell?: Dynamic) => cell.shownWithLooks !== null));
export const MARKDOWN_TABLE_ROW_PATTERN = /^\s*\|.*\|\s*$/;
export const MARKDOWN_TABLE_DIVIDER_PATTERN = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/;
export const MARKDOWN_CODE_FENCE_PATTERN = /^\s*(`{3,}|~{3,})\s*(\S?)/;
export const MOST_MARKDOWN_TABLE_CELLS = 1e5;
export const markdownTableRowCells = (line?: Dynamic) =>
  line
    .trim()
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell?: Dynamic) => cell.trim().replaceAll('\\|', '|'));
export const isMarkdownTableStartAt = (lines?: Dynamic, index?: Dynamic) => {
  let [header = '', divider = ''] = [lines[index], lines[index + 1]];
  return (
    MARKDOWN_TABLE_DIVIDER_PATTERN.test(divider) &&
    MARKDOWN_TABLE_ROW_PATTERN.test(header) &&
    markdownTableRowCells(header).length === markdownTableRowCells(divider).length
  );
};
export const hasMarkdownTableDivider = (text?: Dynamic) =>
  text.includes('\n') && text.split('\n').some((line?: Dynamic) => MARKDOWN_TABLE_DIVIDER_PATTERN.test(line));
