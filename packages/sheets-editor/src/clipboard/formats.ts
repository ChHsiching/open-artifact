import type { Dynamic } from '../dynamic.ts';
import { TEXT_PREFIX_QUOTE } from '../model/cell-text.ts';
import { DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
export function textRunToHtml({ text: text, marks: marks, url: url, isLinkOnWords: isLinkOnWords }: Dynamic) {
  let marked = marks.reduceRight(
    (inner?: Dynamic, mark?: Dynamic) => `<${FONT_MARK_TAGS[mark]}>${inner}</${FONT_MARK_TAGS[mark]}>`,
    escapeCellHtml(text),
  );
  if (url === null || !isLinkOnWords) return marked;
  return `<a href="${url.replaceAll(/[&<>"]/g, (char?: Dynamic) => HTML_ESCAPES[char] ?? '')}">${marked}</a>`;
}
export function cellContentHtml(text?: Dynamic, runs: Dynamic = []) {
  return runs.map(({ text: text2 }: Dynamic) => text2).join('') === text ? runs.map(textRunToHtml).join('') : escapeCellHtml(text);
}
export function openingTableTagOf(html?: Dynamic) {
  let tableAt = html.indexOf('<table');
  let tagEnd = tableAt === -1 ? -1 : html.indexOf('>', tableAt);
  return tagEnd === -1 ? '' : html.slice(tableAt, tagEnd + 1);
}
export function copiedCellsLocaleOf(html?: Dynamic) {
  let locale = matchCopiedCellsAttribute(html)?.[1] ?? '';
  return locale === '' ? null : locale;
}
export function keepDaysReadAsOthersAsText(tsv?: Dynamic, html?: Dynamic) {
  let dayCellList = DAYS_READ_AS_OTHERS_PATTERN.exec(openingTableTagOf(html))?.[1];
  if (dayCellList === undefined) return tsv;
  let cells = parseTsvCells(tsv);
  for (let cellKey of dayCellList.split(';') as Dynamic) {
    let [rowIndex, columnIndex] = cellKey.split(' ').map(Number);
    let row = cells[rowIndex ?? -1];
    let text = row?.[columnIndex ?? -1];
    if (row !== undefined && columnIndex !== undefined && text !== undefined) row[columnIndex] = TEXT_PREFIX_QUOTE + text;
  }
  return cellsToTsv(cells);
}
export function cellsToHtmlTable(texts?: Dynamic, styles?: Dynamic, locale?: Dynamic, daysReadAsOthers?: Dynamic, richCells?: Dynamic) {
  let partsByCell = new (Map as Dynamic)(
    richCells.map(({ rowIndex: rowIndex, columnIndex: columnIndex, parts: parts }: Dynamic) => [`${rowIndex} ${columnIndex}`, parts]),
  );
  let escapedLocale = locale.replaceAll(/[&<>"]/g, (char?: Dynamic) => HTML_ESCAPES[char] ?? '');
  let dayCellList = daysReadAsOthers
    .map(({ rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) => `${rowIndex} ${columnIndex}`)
    .join(';');
  let daysAttribute = dayCellList === '' ? '' : ` ${DAYS_READ_AS_OTHERS_ATTRIBUTE}="${dayCellList}"`;
  let copiedAttributes = `${COPIED_CELLS_ATTRIBUTE}="${escapedLocale}"${daysAttribute}`;
  if ((styles ?? texts).flat().filter((cell?: Dynamic) => cell !== null).length === 1) {
    let text = texts[0]?.[0] ?? '';
    let contentHtml = cellContentHtml(text, partsByCell.get('0 0'));
    return /[\r\n]/.test(text)
      ? `<table ${copiedAttributes}><tbody><tr><td>${contentHtml}</td></tr></tbody></table>`
      : `<${ONE_CELL_TABLE_TAG} ${copiedAttributes}>${contentHtml}</${ONE_CELL_TABLE_TAG}>`;
  }
  let hasStyles = styles !== null;
  let rowsHtml = texts
    .map(
      (row?: Dynamic, rowIndex?: Dynamic) =>
        row.map((text?: Dynamic, columnIndex?: Dynamic) => {
          let style = hasStyles ? styles[rowIndex]?.[columnIndex] : '';
          return style === null ? '' : `<td${style ?? ''}>${cellContentHtml(text, partsByCell.get(`${rowIndex} ${columnIndex}`))}</td>`;
        }),
    )
    .map((cells?: Dynamic) => `${hasStyles ? COPIED_ROW_OPEN_TAG : '<tr>'}${cells.join('')}</tr>`)
    .join('');
  return `<table ${copiedAttributes}${hasStyles ? COPIED_TABLE_ATTRIBUTES : ''}><tbody>${rowsHtml}</tbody></table>`;
}
export function cellsToTsv(texts?: Dynamic) {
  let rows = texts.map(
    (row?: Dynamic) =>
      row.map((text?: Dynamic) => (TSV_QUOTE_NEEDED_PATTERN.test(text) ? `"${text.replaceAll('"', '""')}"` : text)).join('\t'),
  ).join(`
`);
  return rows.endsWith(`
`)
    ? `${rows}
`
    : rows;
}
export function parseTsv(text?: Dynamic, acceptsQuoted?: Dynamic) {
  let normalized = normalizeLineEnds(text).replace(/\n$/, '');
  if (normalized === '') return [];
  let row: Dynamic = [];
  let rows = [row];
  for (let index: Dynamic = 0; ; index += 1) {
    TSV_QUOTED_FIELD_PATTERN.lastIndex = index;
    TSV_PLAIN_FIELD_PATTERN.lastIndex = index;
    let quotedMatch = TSV_QUOTED_FIELD_PATTERN.exec(normalized);
    let quoted = quotedMatch?.[1] !== undefined && acceptsQuoted(quotedMatch[1]) ? quotedMatch : null;
    let field = quoted?.[0] ?? TSV_PLAIN_FIELD_PATTERN.exec(normalized)?.[0] ?? '';
    row.push(quoted?.[1]?.replaceAll('""', '"') ?? field);
    index += field.length;
    if (index >= normalized.length) return rows;
    if (
      normalized[index] ===
      `
`
    )
      rows.push((row = []));
  }
}
export function parseTsvCells(text?: Dynamic) {
  return parseTsv(text, () => true);
}
export function parseTsvQuotedOnlyIfNeeded(text?: Dynamic) {
  return parseTsv(text, (inner?: Dynamic) => /[\t\n]/.test(inner));
}
export const EMPTY_CLIPBOARD_CONTENT = {
  cutToken: null,
  copiedCellsAsText: null,
  valuesOfCopiedCells: null,
  textWithNumbersWhole: '',
  localeOfTexts: null,
  typed: '',
  text: '',
  html: '',
};
export const clipboardContentOf = (
  copiedCellsAsText?: Dynamic,
  valuesOfCopiedCells?: Dynamic,
  localeOfTexts?: Dynamic,
  typedRows?: Dynamic,
  textRows?: Dynamic,
  htmlTexts?: Dynamic,
  htmlStyles: Dynamic = null,
  wholeNumberRows: Dynamic = textRows,
  daysReadAsOthers: Dynamic = [],
  richCells: Dynamic = [],
) => {
  let text = cellsToTsv(textRows);
  return {
    cutToken: null,
    copiedCellsAsText: copiedCellsAsText,
    valuesOfCopiedCells: valuesOfCopiedCells,
    textWithNumbersWhole: wholeNumberRows === textRows ? text : cellsToTsv(wholeNumberRows),
    localeOfTexts: localeOfTexts,
    typed: cellsToTsv(typedRows),
    text: text,
    html: cellsToHtmlTable(htmlTexts, htmlStyles, localeOfTexts, daysReadAsOthers, richCells),
  };
};
export const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};
export const MSO_LINE_BREAK = '<br style="mso-data-placement:same-cell">';
export const escapeCellHtml = (text?: Dynamic) =>
  text.replaceAll(/[&<>]/g, (char?: Dynamic) => HTML_ESCAPES[char] ?? '').replaceAll(/\r\n?|\n/g, MSO_LINE_BREAK);
export const FONT_MARK_TAGS = {
  bold: 'b',
  italic: 'i',
  underline: 'u',
  strikethrough: 's',
};
export const COPIED_CELLS_ATTRIBUTE = 'data-copied-cells';
export const COPIED_CELLS_ATTRIBUTE_PATTERN = new (RegExp as Dynamic)(String.raw`\s${COPIED_CELLS_ATTRIBUTE}(?:="([^"]*)"|[\s=>])`);
export const matchCopiedCellsAttribute = (html?: Dynamic) => COPIED_CELLS_ATTRIBUTE_PATTERN.exec(openingTableTagOf(html));
export const isCopiedFromSheets = (html?: Dynamic) => matchCopiedCellsAttribute(html) !== null;
export const DAYS_READ_AS_OTHERS_ATTRIBUTE = 'data-days-read-as-others';
export const DAYS_READ_AS_OTHERS_PATTERN = new (RegExp as Dynamic)(String.raw`\s${DAYS_READ_AS_OTHERS_ATTRIBUTE}="(\d+ \d+(?:;\d+ \d+)*)"`);
export const COPIED_TABLE_ATTRIBUTES = ` cellspacing="0" cellpadding="3" style="border-collapse:collapse;font-size:${DEFAULT_CELL_FORMAT.font.size}pt"`;
export const COPIED_ROW_OPEN_TAG = '<tr style="height:20px;vertical-align:top">';
export const ONE_CELL_TABLE_TAG = 'table-of-one-cell';
export const TSV_QUOTE_NEEDED_PATTERN = /^"|[\t\n\r]/;
export const normalizeLineEnds = (text?: Dynamic) =>
  text.replaceAll(
    /\r\n?/g,
    `
`,
  );
export const TSV_QUOTED_FIELD_PATTERN = /"((?:""|[^"])*)"(?=[\t\n]|$)/y;
export const TSV_PLAIN_FIELD_PATTERN = /[^\t\n]*/y;
