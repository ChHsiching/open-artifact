import type { Dynamic } from '../dynamic.ts';
import { arrayColumnSeparator, formulaArgumentSeparator } from '../format/number-signs.ts';
export function tokenizeFormula(text?: Dynamic, decimalSign?: Dynamic) {
  let tokens2: Dynamic = [];
  let position: Dynamic = 0;
  let isInArray: Dynamic = false;
  let readMatch = (pattern?: Dynamic) => {
    pattern.lastIndex = position;
    let match = pattern.exec(text);
    if (match !== null) position += match[0].length;
    return match;
  };
  while (position < text.length) {
    if (readMatch(FORMULA_SPACE_PATTERN) !== null) continue;
    if (text[position] === '"') {
      let value = readMatch(FORMULA_TEXT_PATTERN);
      if (value === null)
        return {
          tokens: tokens2,
          isQuotationLeftOpen: true,
        };
      tokens2.push({
        kind: 'text',
        text: value[0],
      });
      continue;
    }
    if (text[position] === "'") {
      let value = readMatch(QUOTED_SHEET_NAME_PATTERN)?.[1];
      if (value === undefined)
        return {
          tokens: [
            ...tokens2,
            {
              kind: 'sign',
              text: "'",
            },
          ],
          isQuotationLeftOpen: false,
        };
      tokens2.push({
        kind: 'sheetName',
        text: value.replaceAll("''", "'"),
      });
      continue;
    }
    let errorMatch = readMatch(FORMULA_ERROR_PATTERN);
    if (errorMatch !== null) {
      tokens2.push({
        kind: 'error',
        text: upperCaseAsciiLetters(errorMatch[0]),
      });
      continue;
    }
    let nameMatch = readMatch(FORMULA_NAME_PATTERN);
    if (nameMatch !== null) {
      let value = text[position] === '!' && text[position + 1] !== '=';
      if (value) position += 1;
      tokens2.push({
        kind: value ? 'sheetName' : 'name',
        text: nameMatch[0],
      });
      continue;
    }
    let followsValue = VALUE_ENDING_TOKEN_KINDS.has(tokens2.at(-1)?.kind ?? 'open') || isSignToken(tokens2.at(-1), '%}');
    let numberMatch =
      readMatch(FORMULA_NUMBER_PATTERNS[decimalSign]) ?? (followsValue ? null : readMatch(FORMULA_FRACTION_PATTERNS[decimalSign]));
    if (numberMatch !== null) {
      tokens2.push({
        kind: 'number',
        text: numberMatch[0],
      });
      continue;
    }
    let sign = readMatch(FORMULA_ANY_CHARACTER_PATTERN)?.[0] ?? '';
    if (isInArray && [arrayColumnSeparator(decimalSign), ';'].includes(sign)) {
      tokens2.push({
        kind: 'betweenValues',
        text: sign,
      });
      continue;
    }
    if (sign === '{' || sign === '}') isInArray = sign === '{';
    let kind = sign === formulaArgumentSeparator(decimalSign) ? 'betweenArguments' : (PARENTHESIS_TOKEN_KINDS[sign] ?? 'sign');
    tokens2.push({
      kind: kind,
      text: sign,
    });
  }
  return {
    tokens: tokens2,
    isQuotationLeftOpen: false,
  };
}
export function findArrayLiterals(tokens2?: Dynamic) {
  let arrays: Dynamic = [];
  let openArray: Dynamic = null;
  for (let [index, token] of tokens2.entries() as Dynamic)
    if (openArray === null) {
      if (isSignToken(token, '{'))
        openArray = {
          from: index,
          rows: [[[]]],
        };
    } else if (isSignToken(token, '}')) {
      arrays.push({
        ...openArray,
        to: index + 1,
      });
      openArray = null;
    } else if (token.kind !== 'betweenValues') openArray.rows.at(-1)?.at(-1)?.push(token);
    else if (token.text === ';') openArray.rows.push([[]]);
    else openArray.rows.at(-1)?.push([]);
  return {
    arrays: arrays,
    isOneLeftOpen: openArray !== null,
  };
}
export const FORMULA_SPACE_PATTERN = /[ \t\n\r]+/y;
export const FORMULA_TEXT_PATTERN = /"(?:[^"]|"")*"/y;
export const QUOTED_SHEET_NAME_PATTERN = /'((?:[^']|'')+)'!/y;
export const FORMULA_ERROR_PATTERN = /#(?:NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|ERROR!|TIMEOUT!)/iy;
export const FORMULA_NAME_PATTERN = /[$\p{L}_][\p{L}\p{N}_.$]*/uy;
export const FORMULA_NUMBER_PATTERNS = {
  point: /\d+\.?\d*(?:[eE][+-]?\d+)?/y,
  comma: /\d+(?:,\d+)?(?:[eE][+-]?\d+)?/y,
};
export const FORMULA_FRACTION_PATTERNS = {
  point: /\.\d+(?:[eE][+-]?\d+)?/y,
  comma: /,\d+(?:[eE][+-]?\d+)?/y,
};
export const VALUE_ENDING_TOKEN_KINDS = new (Set as Dynamic)(['text', 'name', 'number', 'error', 'close']);
export const FORMULA_ANY_CHARACTER_PATTERN = /./suy;
export const PARENTHESIS_TOKEN_KINDS = {
  '(': 'open',
  ')': 'close',
};
export const isSignToken = (token?: Dynamic, signs?: Dynamic) => token?.kind === 'sign' && signs.includes(token.text);
export const upperCaseAsciiLetters = (text?: Dynamic) =>
  text.replaceAll(/[a-z]/g, (input?: Dynamic) => input.toUpperCase());
export const withoutLeadingEquals = (text?: Dynamic) => (text.startsWith('=') ? text.slice(1) : text);
export const tokenizeFormulaText = (text?: Dynamic, decimalSign?: Dynamic) =>
  tokenizeFormula(withoutLeadingEquals(text), decimalSign);
export const tokenizeFormulaWithReferences = ({ textBetweenReferences: textBetweenReferences, references: references }: Dynamic) =>
  textBetweenReferences.flatMap((text?: Dynamic, index?: Dynamic) => {
    let reference = references[index];
    return [
      ...tokenizeFormula(index === 0 ? withoutLeadingEquals(text) : text, 'point').tokens,
      ...(reference === undefined
        ? []
        : [
            {
              kind: 'reference',
              reference: reference,
            },
          ]),
    ];
  });
