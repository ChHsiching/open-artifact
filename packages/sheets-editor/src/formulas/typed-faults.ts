import type { Dynamic } from '../dynamic.ts';
import { isSignToken, upperCaseAsciiLetters, findArrayLiterals, tokenizeFormulaText } from './tokenizer.ts';
import { A1_CELL_PATTERN, isA1CellInSheet, normalizeA1Reference, columnLetters } from '../model/a1-references.ts';
import { formulaArgumentSeparator } from '../format/number-signs.ts';
import { findFormulaReferences, isWholeLineReference, resolveFormulaReference, formulaHasMoreReferencesThan } from './references.ts';
export function lastOrFirstIndex({ first: first, count: count }: Dynamic, index?: Dynamic) {
  let last = first + (count ?? 1) - 1;
  return last >= index ? last : first;
}
export function isConstantTokens(tokens2?: Dynamic) {
  let [first, second] = tokens2;
  if (tokens2.length === 2) return isSignToken(first, '+-') && second?.kind === 'number';
  if (tokens2.length !== 1 || first === undefined) return false;
  return ['number', 'text', 'error'].includes(first.kind) || (first.kind === 'name' && ['TRUE', 'FALSE'].includes(upperCaseAsciiLetters(first.text)));
}
export function faultOfArrayLiteral({ rows: rows }: Dynamic) {
  let nonConstants = rows.flat().filter((input?: Dynamic) => !isConstantTokens(input));
  if (nonConstants.some(isArrayLiteralItem)) return null;
  if (nonConstants.length > 0)
    return {
      cause: 'notOnlyValuesInCurlyBrackets',
    };
  return rows.some((items?: Dynamic) => items.length !== rows[0]?.length)
    ? {
        cause: 'rowsOfDifferentLengthsInCurlyBrackets',
      }
    : null;
}
export function findArrayLiteralFaults(tokens2?: Dynamic) {
  let { arrays: arrays, isOneLeftOpen: isOneLeftOpen } = findArrayLiterals(tokens2);
  let outside: Dynamic = [];
  let fault: Dynamic = null;
  let index: Dynamic = 0;
  for (let array of arrays as Dynamic) {
    fault ??= faultOfArrayLiteral(array);
    (outside.push as Dynamic)(...tokens2.slice(index, array.from + 1));
    index = array.to - 1;
  }
  (outside.push as Dynamic)(...tokens2.slice(index));
  return {
    fault:
      fault ??
      (isOneLeftOpen
        ? {
            cause: 'curlyBracketNotClosed',
          }
        : null),
    outside: outside,
  };
}
export function findFormulaFault(text?: Dynamic, sheets?: Dynamic, sheetId?: Dynamic, decimalSign?: Dynamic, cell?: Dynamic) {
  let { tokens: tokens2, isQuotationLeftOpen: isQuotationLeftOpen } = tokenizeFormulaText(text, decimalSign);
  if (isQuotationLeftOpen)
    return {
      cause: 'quotationMarkNotClosed',
    };
  if (tokens2.some((input?: Dynamic) => isSignToken(input, QUOTE_CHARACTERS))) return null;
  let countOfKind = (kind?: Dynamic) => tokens2.filter((input?: Dynamic) => input.kind === kind).length;
  if (countOfKind('open') > countOfKind('close'))
    return {
      cause: 'parenthesisNotClosed',
    };
  if (countOfKind('close') > countOfKind('open'))
    return {
      cause: 'tooManyClosingParentheses',
    };
  let sheetNames = sheets.map(({ name: name }: Dynamic) => name.toLowerCase());
  let unknownSheet = tokens2.find(({ kind: kind, text: text2 }: Dynamic, index?: Dynamic) => {
    let before = tokens2[index - 1];
    let isAtOperandStart =
      before === undefined || before.kind === 'open' || before.kind === 'betweenArguments' || isSignToken(before, '+-*/^=<>');
    let lowerText = text2.toLowerCase();
    return (
      kind === 'sheetName' &&
      isAtOperandStart &&
      !A1_CELL_PATTERN.test(text2) &&
      !text2.includes('$') &&
      !sheetNames.some((input?: Dynamic) => input.endsWith(lowerText))
    );
  });
  if (unknownSheet !== undefined)
    return {
      cause: 'noSuchSheet',
      name: unknownSheet.text,
    };
  let sheet = sheets.find(({ sheetId: sheetId2 }: Dynamic) => sheetId2 === sheetId);
  let outsideRange = tokens2.find((token?: Dynamic, index?: Dynamic) => {
    let isRangeEnd = isSignToken(tokens2[index - 1], ':') || isSignToken(tokens2[index + 1], ':');
    let isAfterSheetName =
      isSheetNameToken(tokens2[index - 1]) || (isSignToken(tokens2[index - 1], ':') && isSheetNameToken(tokens2[index - 3]));
    return (
      isCellAddressToken(token) &&
      tokens2[index + 1]?.kind !== 'open' &&
      isRangeEnd &&
      !isAfterSheetName &&
      sheet !== undefined &&
      !isA1CellInSheet(token.text, sheet)
    );
  });
  if (outsideRange !== undefined)
    return {
      cause: 'noSuchCellInARange',
      address: normalizeA1Reference(outsideRange.text),
    };
  let { fault: fault, outside: outside } = findArrayLiteralFaults(tokens2);
  if (fault !== null) return fault;
  if (outside.some((input?: Dynamic) => isSignToken(input, decimalSign === 'comma' ? ',' : ';')))
    return {
      cause: 'wrongSignBetweenArguments',
      rightSign: formulaArgumentSeparator(decimalSign),
    };
  if (isSignToken(tokens2.at(-1), '+-*/^&=<>'))
    return {
      cause: 'somethingMissingAtTheEnd',
    };
  let outsideReference = findFormulaReferences(text, decimalSign).references.find(
    (input?: Dynamic) =>
      input.sheetName === null &&
      input.otherSheetName === null &&
      isWholeLineReference(input) &&
      input.ends.every(({ letters: letters }: Dynamic) => letters.length <= 3) &&
      resolveFormulaReference(input, sheetId, sheets) === null,
  );
  if (outsideReference !== undefined && sheet !== undefined)
    return {
      cause: 'noSuchCellInARange',
      address: addressOfReferenceEnd(outsideReference, sheet),
    };
  return cell !== null && formulaHasMoreReferencesThan(text, decimalSign, sheetId, sheets, cell)
    ? {
        cause: 'readIfEnteredAgain',
      }
    : null;
}
export const QUOTE_CHARACTERS = "'‘’“”";
export const isCellAddressToken = (token?: Dynamic) => token.kind === 'name' && A1_CELL_PATTERN.test(token.text);
export const isSheetNameToken = (token?: Dynamic) => token?.kind === 'sheetName' || isSignToken(token, '!');
export const addressOfReferenceEnd = ({ rows: rows, columns: columns }: Dynamic, sheet?: Dynamic) =>
  `${columnLetters(lastOrFirstIndex(columns, sheet.columnCount))}${lastOrFirstIndex(rows, sheet.rowCount) + 1}`;
export const isArrayLiteralItem = (items?: Dynamic) =>
  items.every((token?: Dynamic) => isSignToken(token, ',\\') || isConstantTokens([token]));
