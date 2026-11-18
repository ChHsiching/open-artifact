import type { Dynamic } from '../dynamic.ts';
import { isFormulaText } from '../chips/dropdown-pane-edits.ts';
export function unclosedBraceTail(formula?: Dynamic) {
  let braceAt = formula.lastIndexOf('{');
  return braceAt > formula.lastIndexOf('}') ? formula.slice(braceAt + 1) : null;
}
export function isFormulaUnfinished(text?: Dynamic) {
  if (!isFormulaText(text)) return false;
  let masked = text.replaceAll(quotedOrSheetRefPattern, '0');
  return (
    quoteMarkInFormulaPattern.test(masked) ||
    openParenthesesCount(masked) > 0 ||
    unclosedBraceTail(masked) !== null ||
    trailingOperatorPattern.test(masked)
  );
}
export function withFormulaBracketsClosed(text?: Dynamic) {
  if (!isFormulaText(text)) return text;
  let masked = text.replaceAll(quotedOrSheetRefPattern, '0');
  let isOpenAtEnd = quoteMarkInFormulaPattern.test(masked) || trailingOperatorPattern.test(masked);
  let braceTail = unclosedBraceTail(masked);
  let isBraceTailOdd = braceTail !== null && (/[()]/.test(braceTail) || trailingBackslashPattern.test(braceTail));
  if (isOpenAtEnd || isBraceTailOdd) return text;
  return text + (braceTail === null ? '' : '}') + ')'.repeat(Math.max(0, openParenthesesCount(masked)));
}
export const quotedOrSheetRefPattern = /"[^"]*"|'[^']*'|#[\w/]+!/g;
export const trailingOperatorPattern = /[=+\-*/^&<>({,;:!]\s*$/;
export const trailingBackslashPattern = /\\\s*$/;
export const quoteMarkInFormulaPattern = /["']/;
export const openParenthesesCount = (formula?: Dynamic) => formula.split('(').length - formula.split(')').length;
export const isBareEqualsSign = (text?: Dynamic) => /^=\s*$/.test(text);
export const isFormulaUnfinishedInEntry = ({ mode: mode, formulaFromWords: formulaFromWords }: Dynamic) =>
  mode.kind === 'editing' && mode.isBegunToListFunctions !== true && formulaFromWords.stage?.kind !== 'asked' && isFormulaUnfinished(mode.text);
