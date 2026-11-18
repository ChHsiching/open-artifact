import type { Dynamic } from '../dynamic.ts';
import { tokenizeFormulaText, upperCaseAsciiLetters, isSignToken } from './tokenizer.ts';
import { findFormulaReferences, referenceCoversCell, isWholeLineReference } from './references.ts';
import { FUNCTIONS_AGENT_MAY_NOT_WRITE, PLAIN_ARRAY_FUNCTIONS } from './agent-prompt.ts';
import { isNonNullObject } from '../utils/objects.ts';
import { hasSpaceBetweenOperands } from './word-tokens.ts';
import { findFormulaFault } from './typed-faults.ts';
import { describeFunction } from './function-help.ts';
import { A1_CELL_PATTERN } from '../model/a1-references.ts';
import { ARRAY_FUNCTION_NAMES } from './agent-prompt-values.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function mightFormulaSpill(text?: Dynamic, decimalSign?: Dynamic) {
  if (!ARRAY_FORMULA_PATTERN.test(text)) return false;
  let { tokens: tokens2 } = tokenizeFormulaText(text, decimalSign);
  return hasQuoteCharsOutsideTexts(text) || !quotesMatchTokens(text, tokens2, decimalSign) || tokensMakeArray(tokens2);
}
export function commaNumbersIn(formula?: Dynamic) {
  let { tokens: tokens2 } = tokenizeFormulaText(formula, 'comma');
  return tokens2.flatMap(({ kind: kind, text: text }: Dynamic, index?: Dynamic) => {
    if (kind === 'text') return /[\d.,]/.test(text) ? [text] : [];
    if (kind === 'number' && /^[1-9]\d{0,2},\d{3}(?:[eE]|$)/.test(text)) return [text];
    let [next, afterNext] = [tokens2[index + 1], tokens2[index + 2]];
    let isSeparatorNext = next?.kind === 'betweenArguments' || (next?.kind === 'betweenValues' && next.text !== ';');
    let looksLikeSplitNumber =
      kind === 'number' && /^\d+$/.test(text) && afterNext?.kind === 'number' && (!afterNext.text.includes(',') || /^\d{3},/.test(afterNext.text));
    return isSeparatorNext && looksLikeSplitNumber ? [`${text};${afterNext.text}`] : [];
  });
}
export function bringsNewCommaNumbers(answer?: Dynamic, formulasBefore?: Dynamic) {
  let numbersBefore = formulasBefore.flatMap(commaNumbersIn);
  return commaNumbersIn(answer).some((number?: Dynamic) => {
    let index = numbersBefore.indexOf(number);
    if (index !== -1) numbersBefore.splice(index, 1);
    return index === -1;
  });
}
export function addsVolatileFunction(answer?: Dynamic, before?: Dynamic, decimalSign?: Dynamic) {
  let answerTokens = tokenizeFormulaText(answer, decimalSign).tokens;
  let beforeTokens = tokenizeFormulaText(before, decimalSign).tokens;
  let namesBefore = new (Set as Dynamic)(
    beforeTokens.flatMap(({ kind: kind, text: text }: Dynamic) => (kind === 'name' ? [upperCaseAsciiLetters(text)] : [])),
  );
  return answerTokens.some((token?: Dynamic, index?: Dynamic) => {
    let name = upperCaseAsciiLetters(token.text);
    return isFunctionCallAt(answerTokens, index) && VOLATILE_FUNCTIONS.has(name) && !namesBefore.has(name);
  });
}
export function quotesMatchTokens(formula?: Dynamic, tokens2?: Dynamic, decimalSign?: Dynamic) {
  let { quoted: quoted } = findFormulaReferences(formula, decimalSign);
  let texts = tokens2.filter(({ kind: kind }: Dynamic) => kind === 'text');
  return (
    quoted.length === texts.length &&
    quoted.every(
      ({ start: start, end: end, isClosed: isClosed }: Dynamic, index?: Dynamic) =>
        isClosed && formula.slice(start, end) === texts[index]?.text,
    )
  );
}
export function isSafeArrayFormula(formula?: Dynamic, decimalSign?: Dynamic) {
  let { tokens: tokens2 } = tokenizeFormulaText(formula, decimalSign);
  return (
    !hasQuoteCharsOutsideTexts(formula) &&
    tokensMakeArray(tokens2) &&
    isPlainArrayFormula(tokens2) &&
    quotesMatchTokens(formula, tokens2, decimalSign)
  );
}
export function usesFunctionAgentMayNotWrite(formula?: Dynamic, decimalSign?: Dynamic) {
  let { tokens: tokens2 } = tokenizeFormulaText(formula, decimalSign);
  let firstIndex = tokens2.findIndex(({ kind: kind, text: text }: Dynamic) => kind !== 'open' && !/^[-+]$/.test(text));
  return (
    tokensMakeArray(tokens2.slice(firstIndex, firstIndex + 2)) ||
    tokens2.some(
      ({ text: text }: Dynamic, index?: Dynamic) =>
        isFunctionCallAt(tokens2, index) && FUNCTIONS_AGENT_MAY_NOT_WRITE.has(upperCaseAsciiLetters(text)),
    )
  );
}
export function acceptFormulaFromAgent(answer: Dynamic, reads: WorkbookReads, sheetId?: Dynamic, cell?: Dynamic) {
  let formula = isNonNullObject(answer) ? answer.formula : null;
  if (typeof formula !== 'string' || !/^=[^=@]/.test(formula)) return null;
  if (formula.length > MAX_FORMULA_ANSWER_LENGTH || ODD_FORMULA_CHAR_PATTERN.test(formula)) return null;
  if (hasQuoteCharsOutsideTexts(formula)) return null;
  let sheets = reads.listSheets();
  if (hasSpaceBetweenOperands(formula)) return null;
  if (findFormulaFault(formula, sheets, sheetId, 'point', null) !== null) return null;
  let { tokens: tokens2 } = tokenizeFormulaText(formula, 'point');
  if (tokens2.some(({ kind: kind, text: text }: Dynamic) => kind === 'sign' && text === '\\')) return null;
  if (
    !tokens2.every(({ kind: kind, text: text }: Dynamic, index?: Dynamic) => {
      if (kind !== 'name') return true;
      let name = upperCaseAsciiLetters(text);
      if (tokens2[index + 1]?.kind === 'open') return describeFunction(name) !== null && !FUNCTIONS_AGENT_MAY_NOT_WRITE.has(name);
      return A1_CELL_PATTERN.test(text) || BOOLEAN_NAME_PATTERN.test(name);
    })
  )
    return null;
  if (tokensMakeArray(tokens2) && !isSafeArrayFormula(formula, 'point')) return null;
  let sheetName = sheets.find(({ sheetId: sheetId2 }: Dynamic) => sheetId2 === sheetId)?.name.toLowerCase();
  let { references: references } = findFormulaReferences(formula, 'point');
  return references.some(
    (reference?: Dynamic) =>
      (reference.sheetName === null || reference.sheetName.toLowerCase() === sheetName) && referenceCoversCell(reference, cell),
  ) || references.some(isWholeLineReference)
    ? null
    : reads.formulaAsTyped(formula);
}
export const MAX_FORMULA_ANSWER_LENGTH = 1000;
export const ODD_FORMULA_CHAR_PATTERN = /(?! )[\u2800\p{C}\p{Z}\p{Default_Ignorable_Code_Point}]| {2}/u;
export const QUOTED_TEXT_PATTERN = /"(?:[^"]|"")*"/g;
export const BOOLEAN_NAME_PATTERN = /^(?:TRUE|FALSE)$/;
export const hasQuoteCharsOutsideTexts = (formula?: Dynamic) => /['!‘’“”]/.test(formula.replaceAll(QUOTED_TEXT_PATTERN, ''));
export const isFunctionCallAt = (tokens2?: Dynamic, index?: Dynamic) =>
  tokens2[index]?.kind === 'name' && tokens2[index + 1]?.kind === 'open';
export const tokensMakeArray = (tokens2?: Dynamic) =>
  tokens2.some(
    (token?: Dynamic, index?: Dynamic) =>
      isSignToken(token, '{') || (isFunctionCallAt(tokens2, index) && describeFunction(upperCaseAsciiLetters(token.text))?.answers === 'anArray'),
  );
export const ARRAY_FORMULA_PATTERN = new (RegExp as Dynamic)(`\\{|\\b(?:${ARRAY_FUNCTION_NAMES.join('|')})[^A-Za-z0-9]*\\(`, 'i');
export const VOLATILE_FUNCTIONS = new (Set as Dynamic)(['NOW', 'TODAY', 'RAND', 'RANDBETWEEN']);
export const VOLATILE_CALL_PATTERN = new (RegExp as Dynamic)(`\\b(?:${[...VOLATILE_FUNCTIONS].join('|')})[ \\t\\n\\r]*\\(`, 'i');
export const callsVolatileFunction = (formula?: Dynamic) => VOLATILE_CALL_PATTERN.test(formula);
export const COMPARISON_SIGN_PATTERN = /^[=<>]$/;
export const isPlainArrayFormula = (tokens2?: Dynamic) =>
  tokens2.every(({ kind: kind, text: text }: Dynamic, index?: Dynamic) => {
    if (isFunctionCallAt(tokens2, index)) return PLAIN_ARRAY_FUNCTIONS.has(upperCaseAsciiLetters(text));
    if (kind === 'sign') return text !== '&';
    let isCompared = [tokens2[index - 1], tokens2[index + 1]].some(
      (token?: Dynamic) => token?.kind === 'sign' && COMPARISON_SIGN_PATTERN.test(token.text),
    );
    return kind !== 'text' || isCompared;
  });
