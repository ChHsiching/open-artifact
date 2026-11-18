import type { Dynamic } from '../dynamic.ts';
import { areaAsSeen, areasAsSeen } from '../model/a1-references.ts';
export function execStickyAt(pattern?: Dynamic, text?: Dynamic, position?: Dynamic) {
  pattern.lastIndex = position;
  return pattern.exec(text);
}
export function quotedSpanAt(text?: Dynamic, start?: Dynamic, quote?: Dynamic) {
  let position: Dynamic = start + 1;
  while (position < text.length)
    if (text[position] !== quote) position += 1;
    else if (text[position + 1] === quote) position += 2;
    else
      return {
        start: start,
        end: position + 1,
        isClosed: true,
      };
  return {
    start: start,
    end: text.length,
    isClosed: false,
  };
}
export function sheetPrefixAt(text?: Dynamic, start?: Dynamic) {
  let isQuoted = text[start] === "'";
  let nameEnd = isQuoted ? quotedSpanAt(text, start, "'").end : start + (execStickyAt(SHEET_NAME_AT, text, start)?.[0].length ?? 0);
  if (nameEnd === start || text[nameEnd] !== '!') return null;
  return {
    name: isQuoted ? text.slice(start + 1, nameEnd - 1).replaceAll("''", "'") : text.slice(start, nameEnd),
    end: nameEnd + 1,
  };
}
export function cellReferencePartsAt(text?: Dynamic, start?: Dynamic) {
  let sheetPrefix = sheetPrefixAt(text, start);
  let match = execStickyAt(A1_REFERENCE_AT, text, sheetPrefix?.end ?? start);
  if (match === null) return null;
  let [matchedText, cellColumnDollar, cellLetters, cellRowDollar, cellDigits, ...otherGroups] = match;
  let [columnDollar, columnLetters2, rowDollar, rowDigits] = otherGroups;
  let [letters, digits] = [cellLetters ?? columnLetters2 ?? '', cellDigits ?? rowDigits ?? ''];
  if (columnLettersToBigInt(letters) > MAX_REFERENCE_INDEX || BigInt(digits) > MAX_REFERENCE_INDEX) return null;
  return {
    sheetName: sheetPrefix?.name ?? null,
    start: match.index,
    end: match.index + matchedText.length,
    dollarOfColumn: cellColumnDollar ?? columnDollar ?? '',
    letters: letters,
    dollarOfRow: cellRowDollar ?? rowDollar ?? '',
    digits: digits,
  };
}
export function parseReferenceAt(formula?: Dynamic, start?: Dynamic) {
  let firstEnd = cellReferencePartsAt(formula, start);
  if (firstEnd === null) return null;
  let secondEnd = formula[firstEnd.end] === ':' ? cellReferencePartsAt(formula, firstEnd.end + 1) : null;
  let otherEnd = secondEnd !== null && endsReferenceAt(formula, secondEnd.end) ? secondEnd : null;
  let isCell = firstEnd.letters !== '' && firstEnd.digits !== '';
  if (otherEnd === null && !(isCell && endsReferenceAt(formula, firstEnd.end))) return null;
  let { end: lastEnd } = otherEnd ?? firstEnd;
  let rows = lineSpanOfEnds(rowIndexOfReferenceEnd(firstEnd), rowIndexOfReferenceEnd(otherEnd ?? firstEnd));
  let columns = lineSpanOfEnds(columnIndexOfReferenceEnd(firstEnd), columnIndexOfReferenceEnd(otherEnd ?? firstEnd));
  if (rows.count === null && columns.count === null)
    return {
      end: lastEnd,
      reference: null,
    };
  let parsed = {
    start: start,
    end: lastEnd,
    sheetName: firstEnd.sheetName,
    otherSheetName: otherEnd?.sheetName ?? null,
    ends: otherEnd === null ? [firstEnd] : [firstEnd, otherEnd],
    rows: rows,
    columns: columns,
  };
  return {
    end: lastEnd,
    reference: parsed,
  };
}
export function commaDecimalsToDots(formula?: Dynamic) {
  let result: Dynamic = '';
  let lastChar: Dynamic;
  let index: Dynamic = 0;
  while (index < formula.length) {
    let char = formula.charAt(index);
    let numberText =
      ASCII_DIGIT.test(char) || lastChar === undefined || !OPERAND_END_CHAR.test(lastChar)
        ? execStickyAt(COMMA_DECIMAL_NUMBER_AT, formula, index)?.[0]
        : undefined;
    let pieceEnd =
      numberText !== undefined
        ? index + numberText.length
        : char === '"' || char === "'"
          ? quotedSpanAt(formula, index, char).end
          : Math.max(endOfNameChars(formula, index), index + 1);
    let piece = formula.slice(index, pieceEnd);
    result += numberText === undefined ? piece : piece.replace(',', '.');
    lastChar = LAST_NON_SPACE_CHAR.exec(piece)?.[0] ?? lastChar;
    index = pieceEnd;
  }
  return result;
}
export function findFormulaReferences(formula?: Dynamic, decimalSign?: Dynamic) {
  let dotted = decimalSign === 'comma' ? commaDecimalsToDots(formula) : formula;
  let references: Dynamic = [];
  let quoted: Dynamic = [];
  let index: Dynamic = 0;
  while (index < dotted.length) {
    let parsed = parseReferenceAt(dotted, index);
    let char = dotted[index];
    if (parsed !== null) {
      if ((index === 0 || endOfNameChars(dotted, index - 1) === index - 1) && parsed.reference !== null) references.push(parsed.reference);
      index = parsed.end;
    } else if (char === '"' || char === "'") {
      let piece = quotedSpanAt(dotted, index, char);
      quoted.push(piece);
      index = piece.end;
    } else {
      let piece = index + (execStickyAt(DOT_DECIMAL_NUMBER_AT, dotted, index)?.[0].length ?? 0);
      index = piece > index ? piece : Math.max(endOfNameChars(dotted, index), index + 1);
    }
  }
  return {
    references: references,
    quoted: quoted,
  };
}
export function formulaMatchesOutsideReferences(formula?: Dynamic, pattern?: Dynamic, decimalSign?: Dynamic) {
  if (!pattern.test(formula)) return false;
  let { references: references, quoted: quoted } = findFormulaReferences(formula, decimalSign);
  let spans = [...references, ...quoted];
  spans.sort((a?: Dynamic, b2?: Dynamic) => b2.start - a.start);
  return pattern.test(
    spans.reduce((text: Dynamic, { start: start, end: end }: Dynamic) => `${text.slice(0, start)},${text.slice(end)}`, formula),
  );
}
export function lineCountWithin({ first: first, count: count }: Dynamic, lineCount?: Dynamic) {
  let spanCount = count ?? lineCount - first;
  return spanCount > 0 && first + spanCount <= lineCount ? spanCount : null;
}
export function resolveFormulaReference(
  { sheetName: sheetName, otherSheetName: otherSheetName, rows: rows, columns: columns }: Dynamic,
  ownSheetId?: Dynamic,
  sheets?: Dynamic,
) {
  let sheet =
    sheetName === null ? sheets.find(({ sheetId: sheetId }: Dynamic) => sheetId === ownSheetId) : findSheetNamed(sheetName, sheets);
  let isSameSheet = otherSheetName === null || findSheetNamed(otherSheetName, sheets) === sheet;
  if (sheet === undefined || !isSameSheet) return null;
  let rowCount = lineCountWithin(rows, sheet.rowCount);
  let columnCount = lineCountWithin(columns, sheet.columnCount);
  if (rowCount === null || columnCount === null) return null;
  let area = {
    topRowIndex: rows.first,
    leftColumnIndex: columns.first,
    rowCount: rowCount,
    columnCount: columnCount,
  };
  let { ownRowOrder: ownRowOrder } = sheet;
  return {
    sheet: sheet,
    area: areaAsSeen(area, ownRowOrder),
    pieces: areasAsSeen(area, ownRowOrder),
  };
}
export function formulaHasMoreReferencesThan(
  formula?: Dynamic,
  decimalSign?: Dynamic,
  ownSheetId?: Dynamic,
  sheets?: Dynamic,
  knownReferences?: Dynamic,
) {
  let resolved = findFormulaReferences(formula, decimalSign).references.filter(
    (reference?: Dynamic) => resolveFormulaReference(reference, ownSheetId, sheets) !== null,
  );
  let knownWholeLines = knownReferences.filter(({ kind: kind }: Dynamic) => kind === 'columns' || kind === 'rows');
  return resolved.length > knownReferences.length || resolved.filter(isWholeLineReference).length > knownWholeLines.length;
}
export const NAME_CHARS_AT = /[A-Za-z0-9_.$\u0080-\uffff]*/y;
export const SHEET_NAME_AT = /[A-Za-z_\u0080-\uffff][A-Za-z0-9_.\u0080-\uffff]*/y;
export const DOT_DECIMAL_NUMBER_AT = /(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?/y;
export const COMMA_DECIMAL_NUMBER_AT = /(?:[0-9]+(?:,[0-9]*)?|,[0-9]+)(?:[Ee][+-]?[0-9]+)?/y;
export const ASCII_DIGIT = /[0-9]/;
export const OPERAND_END_CHAR = /[A-Za-z0-9_.$\u0080-\uffff)}"'%!]/;
export const LAST_NON_SPACE_CHAR = /\S(?=\s*$)/;
export const A1_REFERENCE_AT = /(\$?)([A-Za-z]+)(\$?)([1-9][0-9]*)|(\$?)([A-Za-z]+)|(\$?)([1-9][0-9]*)/y;
export const REFERENCE_CALL_BRACKET_AT = /[ \t\n\r]*\(/y;
export const COLUMN_LETTER_RADIX = 26n;
export const MAX_REFERENCE_INDEX = 2n ** 64n - 1n;
export const endOfNameChars = (text?: Dynamic, start?: Dynamic) =>
  start + (execStickyAt(NAME_CHARS_AT, text, start)?.[0].length ?? 0);
export const columnLettersToBigInt = (letters?: Dynamic) =>
  Array.from<Dynamic>(letters.toUpperCase()).reduce(
    (total?: Dynamic, letter?: Dynamic) => ((total * COLUMN_LETTER_RADIX) as Dynamic) + BigInt(letter.charCodeAt(0) - 64),
    0n,
  );
export const rowIndexOfReferenceEnd = ({ digits: digits }: Dynamic) => (digits === '' ? null : Number(digits) - 1);
export const columnIndexOfReferenceEnd = ({ letters: letters }: Dynamic) =>
  letters === '' ? null : Number(columnLettersToBigInt(letters)) - 1;
export const endsReferenceAt = (formula?: Dynamic, index?: Dynamic) =>
  endOfNameChars(formula, index) === index && execStickyAt(REFERENCE_CALL_BRACKET_AT, formula, index) === null;
export const lineSpanOfEnds = (oneIndex?: Dynamic, otherIndex?: Dynamic) =>
  oneIndex === null || otherIndex === null
    ? {
        first: oneIndex ?? otherIndex ?? 0,
        count: null,
      }
    : {
        first: Math.min(oneIndex, otherIndex),
        count: Math.abs(oneIndex - otherIndex) + 1,
      };
export const sheetPrefixForFormula = (sheetName?: Dynamic) =>
  execStickyAt(SHEET_NAME_AT, sheetName, 0)?.[0] === sheetName ? `${sheetName}!` : `'${sheetName.replaceAll("'", "''")}'!`;
export const lowerCaseAsciiLetters = (text?: Dynamic) =>
  text.replaceAll(/[A-Z]/g, (letter?: Dynamic) => letter.toLowerCase());
export const findSheetNamed = (name?: Dynamic, sheets?: Dynamic) =>
  sheets.find((sheet?: Dynamic) => sheet.name === name) ??
  sheets.find((sheet?: Dynamic) => lowerCaseAsciiLetters(sheet.name) === lowerCaseAsciiLetters(name));
export const isWholeLineReference = ({ rows: rows, columns: columns }: Dynamic) => rows.count === null || columns.count === null;
export const isIndexInLineSpan = (index: Dynamic, { first: first, count: count }: Dynamic) =>
  index >= first && (count === null || index < first + count);
export const referenceCoversCell = (
  { rows: rows, columns: columns }: Dynamic,
  { rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic,
) => isIndexInLineSpan(rowIndex, rows) && isIndexInLineSpan(columnIndex, columns);
