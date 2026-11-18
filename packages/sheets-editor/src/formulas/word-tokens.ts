import type { Dynamic } from '../dynamic.ts';
import { formulaArgumentSeparator } from '../format/number-signs.ts';
import { describeFunction, describedArgumentAt } from './function-help.ts';
import { upperCaseAsciiLetters } from './tokenizer.ts';
export function endOfQuotedWord(text?: Dynamic, start?: Dynamic) {
  let quote = text[start];
  let position: Dynamic = start + 1;
  while (position < text.length)
    if (text[position] !== quote) position += 1;
    else if (text[position + 1] === quote) position += 2;
    else return position + 1;
  return null;
}
export function tokenizeFormulaWords(text?: Dynamic) {
  let tokens2: Dynamic = [];
  let position: Dynamic = 0;
  let isAfterSpace: Dynamic = false;
  let takeMatch = (pattern?: Dynamic) => {
    pattern.lastIndex = position;
    let match = pattern.exec(text)?.[0] ?? null;
    if (match !== null) position += match.length;
    return match;
  };
  let matchesHere = (pattern?: Dynamic) => ((pattern.lastIndex = position), pattern.test(text));
  let pushToken = (kind?: Dynamic, tokenText?: Dynamic) => {
    tokens2.push({
      kind: kind,
      text: tokenText,
      isAfterSpace: isAfterSpace,
    });
    isAfterSpace = false;
  };
  let takeSheetBang = () => {
    if (text[position] !== '!' || text[position + 1] === '=') return false;
    position += 1;
    takeMatch(WORD_NAME_AT);
    return true;
  };
  while (position < text.length) {
    if (takeMatch(WORD_SPACES_AT) !== null) {
      isAfterSpace = true;
      continue;
    }
    let tokenStart = position;
    if (text[position] === '"' || text[position] === "'") {
      position = endOfQuotedWord(text, position) ?? text.length;
      if (text[tokenStart] === "'") takeSheetBang();
      pushToken('operand', text.slice(tokenStart, position));
      continue;
    }
    let nameMatch = takeMatch(WORD_NAME_AT);
    if (nameMatch !== null) {
      if (takeSheetBang()) pushToken('operand', text.slice(tokenStart, position));
      else if (matchesHere(WORD_CALL_BRACKET_AT)) pushToken('call', nameMatch);
      else {
        let isWord = nameMatch.length > 1 && LETTERS_ONLY_WORD.test(nameMatch) && !BOOLEAN_WORD.test(nameMatch);
        pushToken(isWord ? 'word' : 'operand', nameMatch);
      }
      continue;
    }
    let numberOrError = takeMatch(WORD_NUMBER_AT) ?? takeMatch(WORD_ERROR_AT);
    if (numberOrError !== null) {
      pushToken('operand', numberOrError);
      continue;
    }
    position += 1;
    pushToken(text[tokenStart] === ')' ? 'close' : 'sign', text.slice(tokenStart, position));
  }
  return tokens2;
}
export function hasSpaceBetweenOperands(formula?: Dynamic) {
  let tokens2 = tokenizeFormulaWords(formula.slice(1));
  return tokens2.some((token?: Dynamic, tokenIndex?: Dynamic) => isSpaceBetweenOperands(tokens2[tokenIndex - 1], token));
}
export function namesDeclaredInNameArguments(tokens2?: Dynamic, decimalSign?: Dynamic) {
  let isSignToken2 = (candidate?: Dynamic, sign?: Dynamic) => candidate?.kind === 'sign' && candidate.text === sign;
  let argumentSeparator = formulaArgumentSeparator(decimalSign);
  let declaredNames = new (Set as Dynamic)();
  let openCalls: Dynamic = [];
  let isInArrayLiteral: Dynamic = false;
  for (let [tokenIndex, token] of tokens2.entries() as Dynamic) {
    let [previousToken, nextToken, innermostCall] = [tokens2[tokenIndex - 1], tokens2[tokenIndex + 1], openCalls.at(-1)];
    if (isSignToken2(token, '{') || isSignToken2(token, '}')) isInArrayLiteral = token.text === '{';
    if (isInArrayLiteral) continue;
    if (token.kind === 'close') openCalls.pop();
    else if (isSignToken2(token, '('))
      openCalls.push({
        called: previousToken?.kind === 'call' ? describeFunction(upperCaseAsciiLetters(previousToken.text)) : null,
        argumentAt: 0,
      });
    else if (isSignToken2(token, argumentSeparator) && innermostCall !== undefined) innermostCall.argumentAt += 1;
    if (
      !(
        token.kind === 'word' &&
        (isSignToken2(previousToken, '(') || isSignToken2(previousToken, argumentSeparator)) &&
        (nextToken === undefined || isSignToken2(nextToken, argumentSeparator))
      ) ||
      innermostCall === undefined ||
      innermostCall.called === null
    )
      continue;
    if (describedArgumentAt(innermostCall.called, innermostCall.argumentAt, null)?.takes === 'aName') declaredNames.add(token.text);
  }
  return declaredNames;
}
export function formulaReadsAsWords(formula?: Dynamic, sheetNames?: Dynamic, decimalSign?: Dynamic) {
  if (!formula.startsWith('=')) return false;
  let tokens2 = tokenizeFormulaWords(formula.slice(1));
  let declaredNames = namesDeclaredInNameArguments(tokens2, decimalSign);
  return tokens2.some((token?: Dynamic, tokenIndex?: Dynamic) => {
    let previousToken = tokens2[tokenIndex - 1];
    if (isSpaceBetweenOperands(previousToken, token) && (previousToken.kind === 'word' || token.kind === 'word')) return true;
    return (
      token.kind === 'word' &&
      SCRIPT_WITHOUT_SPACES.test(token.text) &&
      ![...sheetNames, ...declaredNames].some((knownName?: Dynamic) => knownName.startsWith(token.text))
    );
  });
}
export const WORD_SPACES_AT = /[ \t\n\r]+/y;
export const WORD_NAME_AT = /[$\p{L}_][\p{L}\p{M}\p{N}_.$]*(?:['’][\p{L}\p{M}]+)*/uy;
export const WORD_NUMBER_AT = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?%*/y;
export const WORD_ERROR_AT = /#[\w/]+[!?]?/y;
export const WORD_CALL_BRACKET_AT = /[ \t\n\r]*\(/y;
export const LETTERS_ONLY_WORD = /^\p{L}[\p{L}\p{M}]*(?:['’][\p{L}\p{M}]+)*$/u;
export const BOOLEAN_WORD = /^(?:true|false)$/i;
export const SCRIPT_WITHOUT_SPACES =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
export const KINDS_BEFORE_SPACE = new (Set as Dynamic)(['word', 'operand', 'close']);
export const KINDS_AFTER_SPACE = new (Set as Dynamic)(['word', 'operand', 'call']);
export const isSpaceBetweenOperands = (previousToken?: Dynamic, token?: Dynamic) =>
  previousToken !== undefined && token.isAfterSpace && KINDS_BEFORE_SPACE.has(previousToken.kind) && KINDS_AFTER_SPACE.has(token.kind);
