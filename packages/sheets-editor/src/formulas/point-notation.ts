import type { Dynamic } from '../dynamic.ts';
import { findFormulaReferences } from './references.ts';
export function formulaInPointNotation(
  { input: input, formulaText: formulaText }: Dynamic,
  decimalSign?: Dynamic,
  formulaAsTyped?: Dynamic,
) {
  if (input.kind !== 'formula' || formulaText === undefined) return null;
  if (decimalSign === 'point') return formulaText;
  let { references: references, quoted: quoted } = findFormulaReferences(formulaText, decimalSign);
  let textOutsideQuotes = quoted.reduce(
    (text: Dynamic, { start: start, end: end }: Dynamic) => text.slice(0, start) + ' '.repeat(end - start) + text.slice(end),
    formulaText,
  );
  if (quoted.some(({ isClosed: isClosed }: Dynamic) => !isClosed)) return null;
  if (/,|\d\.|\.\d/.test(textOutsideQuotes)) return null;
  let { textBetweenReferences: textBetweenReferences, references: formulaReferences } = input.formula;
  let pointText: Dynamic = '';
  let offset: Dynamic = 0;
  for (let [referenceIndex, between] of textBetweenReferences.entries() as Dynamic) {
    pointText += between;
    offset += between.length;
    if (referenceIndex === formulaReferences.length) break;
    let referenceEnd = formulaText.startsWith(REF_ERROR_TEXT, offset)
      ? offset + REF_ERROR_TEXT.length
      : references.find(({ start: start }: Dynamic) => start === offset)?.end;
    if (referenceEnd === undefined) return null;
    pointText += formulaText.slice(offset, referenceEnd);
    offset = referenceEnd;
  }
  return offset === formulaText.length && formulaAsTyped(pointText) === formulaText ? pointText : null;
}
export const REF_ERROR_TEXT = '#REF!';
