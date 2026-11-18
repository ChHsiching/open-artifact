import type { Dynamic } from '../dynamic.ts';
import { formulaArgumentSeparator } from '../format/number-signs.ts';
import { upperCaseAsciiLetters } from './tokenizer.ts';
import { FUNCTION_CATALOG } from './function-catalog.ts';
export function requiredArgumentsAfterRepeats({ arguments: functionArguments }: Dynamic) {
  let lastRepeatIndex = functionArguments.findLastIndex(({ repeats: repeats }: Dynamic) => repeats);
  return lastRepeatIndex === -1
    ? []
    : functionArguments.slice(lastRepeatIndex + 1).filter(({ isOptional: isOptional }: Dynamic) => !isOptional);
}
export function acceptsArgumentCount({ arguments: functionArguments }: Dynamic, argumentCount?: Dynamic) {
  let repeatingCount = functionArguments.filter(({ repeats: repeats }: Dynamic) => repeats).length;
  let optionalCount = functionArguments.filter(({ isOptional: isOptional }: Dynamic) => isOptional).length;
  let requiredCount = functionArguments.length - optionalCount;
  if (repeatingCount === 0) return argumentCount >= requiredCount && argumentCount <= functionArguments.length;
  return argumentCount >= requiredCount && (argumentCount - requiredCount) % repeatingCount <= optionalCount;
}
export function describedArgumentAt(described?: Dynamic, argumentIndex?: Dynamic, argumentCount?: Dynamic) {
  let { arguments: functionArguments } = described;
  let firstRepeatIndex = functionArguments.findIndex(({ repeats: repeats }: Dynamic) => repeats);
  let repeatingCount = functionArguments.filter(({ repeats: repeats }: Dynamic) => repeats).length;
  if (repeatingCount === 0 || argumentIndex < firstRepeatIndex + repeatingCount) return functionArguments[argumentIndex];
  let trailingRequired = requiredArgumentsAfterRepeats(described);
  if (argumentCount !== null && acceptsArgumentCount(described, argumentCount) && argumentIndex >= argumentCount - trailingRequired.length)
    return trailingRequired[argumentIndex - (argumentCount - trailingRequired.length)];
  return functionArguments[firstRepeatIndex + ((argumentIndex - firstRepeatIndex) % repeatingCount)];
}
export function scanBracketChar(scan?: Dynamic, text?: Dynamic, position?: Dynamic, argumentSeparator?: Dynamic) {
  let char = text[position];
  if (scan.quotedBy !== null) {
    if (char === scan.quotedBy) scan.quotedBy = null;
  } else if (char === '"' || char === "'") scan.quotedBy = char;
  else if (char === '{' || char === '}') scan.isBetweenCurlyBrackets = char === '{';
  else if (char === '(')
    scan.open.push({
      at: position,
      dividedAt: [],
    });
  else if (char === ')') scan.open.pop();
  else if (char === argumentSeparator && !scan.isBetweenCurlyBrackets) scan.open.at(-1)?.dividedAt.push(position);
}
export function scanBrackets(text?: Dynamic, argumentSeparator?: Dynamic) {
  let scan = {
    open: [],
    quotedBy: null,
    isBetweenCurlyBrackets: false,
  };
  for (let position: Dynamic = 0; position < text.length; position += 1) scanBracketChar(scan, text, position, argumentSeparator);
  return scan;
}
export function isOutsideQuotesAndArrays(text?: Dynamic) {
  let { quotedBy: quotedBy, isBetweenCurlyBrackets: isBetweenCurlyBrackets } = scanBrackets(text, null);
  return quotedBy === null && !isBetweenCurlyBrackets;
}
export function functionNameBefore(text?: Dynamic, bracketAt?: Dynamic) {
  let nameEnd: Dynamic = bracketAt;
  while (nameEnd > 0 && FORMULA_SPACE.test(text.charAt(nameEnd - 1))) nameEnd -= 1;
  let nameStart: Dynamic = nameEnd;
  while (nameStart > 0 && FUNCTION_NAME_CHAR.test(text.charAt(nameStart - 1))) nameStart -= 1;
  while (nameStart < nameEnd && !FUNCTION_NAME_START.test(text.charAt(nameStart))) nameStart += 1;
  return nameStart === nameEnd
    ? null
    : {
        name: text.slice(nameStart, nameEnd).toUpperCase(),
        start: nameStart,
      };
}
export function nameBeingTyped(textBeforeCaret?: Dynamic) {
  let typed = NAME_TYPED_AT_END.exec(textBeforeCaret)?.[1];
  if (typed === undefined || NA_ERROR_AT_END.test(textBeforeCaret)) return null;
  if (!isOutsideQuotesAndArrays(textBeforeCaret)) return null;
  return {
    start: textBeforeCaret.length - typed.length,
    typed: typed,
  };
}
export function isTypingNameArgument(
  textBeforeCaret: Dynamic,
  textAfterCaret: Dynamic,
  { start: typedStart, typed: typed }: Dynamic,
  decimalSign?: Dynamic,
) {
  let argumentSeparator = formulaArgumentSeparator(decimalSign);
  let { open: openBrackets } = scanBrackets(textBeforeCaret, argumentSeparator);
  return openBrackets
    .flatMap((bracket?: Dynamic) => {
      let described = describeFunction(functionNameBefore(textBeforeCaret, bracket.at)?.name ?? '');
      return described !== null && takesNameArgument(described)
        ? [
            {
              bracket: bracket,
              described: described,
            },
          ]
        : [];
    })
    .some(({ bracket: { at: bracketAt, dividedAt: dividedAt }, described: described }: Dynamic) => {
      let takesNameAt = (argumentIndex?: Dynamic) => describedArgumentAt(described, argumentIndex, null)?.takes === 'aName';
      let argumentTextBefore = (argumentIndex?: Dynamic, end?: Dynamic) =>
        textBeforeCaret.slice((dividedAt[argumentIndex - 1] ?? bracketAt) + 1, end).replaceAll(EDGE_SPACES, '');
      let currentArgumentIndex = dividedAt.length;
      let isTypingCurrentName =
        bracketAt === openBrackets.at(-1)?.at &&
        takesNameAt(currentArgumentIndex) &&
        argumentTextBefore(currentArgumentIndex, typedStart) === '' &&
        (currentArgumentIndex === 0 || NEXT_NON_SPACE_CHAR.exec(textAfterCaret)?.[1] === argumentSeparator);
      let repeatsEarlierName = dividedAt
        .slice(0, -1)
        .some(
          (dividerAt?: Dynamic, argumentIndex?: Dynamic) =>
            takesNameAt(argumentIndex) && upperCaseAsciiLetters(argumentTextBefore(argumentIndex, dividerAt)) === upperCaseAsciiLetters(typed),
        );
      return isTypingCurrentName || repeatsEarlierName;
    });
}
export function enclosingCallAtEnd(textBeforeCaret?: Dynamic, decimalSign?: Dynamic) {
  let { open: openBrackets } = scanBrackets(textBeforeCaret, formulaArgumentSeparator(decimalSign));
  for (let bracketIndex: Dynamic = openBrackets.length - 1; bracketIndex >= 0; bracketIndex -= 1) {
    let bracket = openBrackets[bracketIndex];
    let call = bracket === undefined ? null : functionNameBefore(textBeforeCaret, bracket.at);
    if (bracket !== undefined && call !== null)
      return {
        ...call,
        argumentAt: bracket.dividedAt.length,
      };
  }
  return null;
}
export function isBareNameArgumentAtCaret(textBeforeCaret?: Dynamic, textAfterCaret?: Dynamic, decimalSign?: Dynamic) {
  let argumentSeparator = formulaArgumentSeparator(decimalSign);
  let scan = scanBrackets(textBeforeCaret, argumentSeparator);
  let callBracket = scan.open.findLast(({ at: bracketAt }: Dynamic) => functionNameBefore(textBeforeCaret, bracketAt) !== null);
  if (callBracket === undefined) return false;
  let wholeText = `${textBeforeCaret}${textAfterCaret}`;
  let argumentStart = (callBracket.dividedAt.at(-1) ?? callBracket.at) + 1;
  let dividerCount = callBracket.dividedAt.length;
  let outerBrackets = scan.open.slice(0, scan.open.indexOf(callBracket));
  let argumentEnd: Dynamic = null;
  for (let scanAt: Dynamic = textBeforeCaret.length; scanAt < wholeText.length; scanAt += 1) {
    scanBracketChar(scan, wholeText, scanAt, argumentSeparator);
    let hasLeftArgument = !scan.open.includes(callBracket) || callBracket.dividedAt.length > dividerCount;
    if (argumentEnd === null && hasLeftArgument) argumentEnd = scanAt;
  }
  if (argumentEnd !== null && wholeText[argumentEnd] !== ')') return false;
  if (argumentEnd !== null && !outerBrackets.some((outerBracket?: Dynamic) => scan.open.includes(outerBracket))) return true;
  return !BARE_NAME_OR_EMPTY.test(wholeText.slice(argumentStart, argumentEnd ?? wholeText.length));
}
export function bracketPairAtCaret(text?: Dynamic, caret?: Dynamic) {
  if (!/[()]/.test(text.slice(Math.max(0, caret - 1), caret + 1))) return null;
  let scan = {
    open: [],
    quotedBy: null,
    isBetweenCurlyBrackets: false,
  };
  let pairAfterCaret: Dynamic = null;
  for (let position: Dynamic = 0; position < text.length; position += 1) {
    let [innermost, openCount] = [scan.open.at(-1), scan.open.length];
    scanBracketChar(scan, text, position, null);
    if (innermost === undefined || scan.open.length >= openCount) continue;
    let pair = {
      opensAt: innermost.at,
      closesAt: position,
    };
    if (pair.opensAt === caret - 1 || pair.closesAt === caret - 1) return pair;
    if (pair.opensAt === caret || pair.closesAt === caret) pairAfterCaret = pair;
  }
  return pairAfterCaret;
}
export const CATALOG_FUNCTIONS_BY_NAME = new (Map as Dynamic)(
  FUNCTION_CATALOG.map((catalogEntry?: Dynamic) => [catalogEntry.name, catalogEntry]),
);
export const describeFunction = (functionName?: Dynamic) => CATALOG_FUNCTIONS_BY_NAME.get(functionName) ?? null;
export const isBooleanLiteralName = (functionName?: Dynamic) => functionName === 'TRUE' || functionName === 'FALSE';
export const takesNameArgument = ({ arguments: functionArguments }: Dynamic) =>
  functionArguments.some(({ takes: takes }: Dynamic) => takes === 'aName');
export const FORMULA_SPACE_CLASS = '[ \\t\\n\\r]';
export const FORMULA_SPACE = new (RegExp as Dynamic)(FORMULA_SPACE_CLASS);
export const NAME_TYPED_AT_END = new (RegExp as Dynamic)(`(?:^=|[-+*/(,;^<>&=])${FORMULA_SPACE_CLASS}*([A-Za-z][A-Za-z0-9_.]*)$`);
export const OPERAND_EXPECTED_AT_END = new (RegExp as Dynamic)(`(?:^=|[-+*/(,;^<>&=])${FORMULA_SPACE_CLASS}*$`);
export const NA_ERROR_AT_END = /#N\/A$/i;
export const OPEN_BRACKET_AHEAD = new (RegExp as Dynamic)(`^${FORMULA_SPACE_CLASS}*\\(`);
export const NEXT_NON_SPACE_CHAR = new (RegExp as Dynamic)(`^${FORMULA_SPACE_CLASS}*([^])`);
export const EDGE_SPACES = new (RegExp as Dynamic)(`^${FORMULA_SPACE_CLASS}+|${FORMULA_SPACE_CLASS}+$`, 'g');
export const FUNCTION_NAME_CHAR = /[A-Za-z0-9_.]/;
export const FUNCTION_NAME_START = /[A-Za-z_]/;
export const BARE_NAME_OR_EMPTY = new (RegExp as Dynamic)(
  `^${FORMULA_SPACE_CLASS}*(?:[A-Za-z_\\P{ASCII}][A-Za-z0-9_.\\P{ASCII}]*${FORMULA_SPACE_CLASS}*)?$`,
  'u',
);
export const isInsideArrayLiteral = (text?: Dynamic) => scanBrackets(text, null).isBetweenCurlyBrackets;
export const expectsOperandAtEnd = (textBeforeCaret?: Dynamic) =>
  OPERAND_EXPECTED_AT_END.test(textBeforeCaret) && isOutsideQuotesAndArrays(textBeforeCaret);
export const openBracketAhead = (textAfterCaret?: Dynamic) => OPEN_BRACKET_AHEAD.exec(textAfterCaret)?.[0] ?? null;
