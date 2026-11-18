import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { isFormulaText } from '../chips/dropdown-pane-edits.ts';
export function formulaBarLinesOf(
  text: Dynamic,
  {
    lineCountFolded: lineCountFolded,
    lineCountFoldedInCard: lineCountFoldedInCard,
    isFirstLineCut: isFirstLineCut,
    widthOfFirstLine: widthOfFirstLine,
  }: Dynamic,
  isCardOpen: Dynamic = false,
) {
  let [firstLine = '', ...otherLines] = text.split(`
`);
  let lineCount = 1 + otherLines.length;
  let areLinesFolded = isCardOpen || !isFormulaText(text);
  return {
    opensAsCard: Math.max(lineCount, areLinesFolded ? lineCountFolded : 0) > 1,
    lineCountWithCaret: areLinesFolded ? Math.max(lineCount, lineCountFoldedInCard) : lineCount,
    areLinesFolded: areLinesFolded,
    isFirstLineCut: isFirstLineCut,
    widthOfFirstLineOfSeveral:
      lineCount > 1 && !isFirstLineCut && widthOfFirstLine > 0 && !FOLDED_LINE_RTL_PATTERN.test(firstLine) ? widthOfFirstLine : null,
  };
}
export function measureFoldedLines(field?: Dynamic, text?: Dynamic, widths?: Dynamic) {
  let view = field.ownerDocument.defaultView;
  if (text === '' || view === null) return NO_FOLDED_LINES;
  let measurer = field.ownerDocument.createElement('textarea');
  measurer.className = field.className;
  measurer.toggleAttribute('data-shows-formula', field.hasAttribute('data-shows-formula'));
  measurer.dataset.measures = 'foldedLines';
  measurer.value = text;
  field.after(measurer);
  let lineHeight = Number.parseFloat(view.getComputedStyle(measurer).lineHeight);
  measurer.style.width = `${widths.ofCard}px`;
  let lineCountInCard = Math.round(measurer.scrollHeight / lineHeight);
  measurer.style.width = `${widths.atRest}px`;
  let lineCountAtRest = Math.round(measurer.scrollHeight / lineHeight);
  let [firstLine = ''] = text.split(`
`);
  measurer.dataset.measures = 'firstLine';
  measurer.value = firstLine.trimEnd();
  let isFirstLineCut =
    lineCountAtRest >
      text.split(`
`).length && measurer.scrollWidth > measurer.clientWidth;
  let hasSeveralLines = text.includes(`
`);
  if (hasSeveralLines) measurer.style.width = '0';
  let widthOfFirstLine = hasSeveralLines ? measurer.scrollWidth : 0;
  measurer.remove();
  return Number.isFinite(lineCountAtRest)
    ? {
        lineCountFolded: lineCountAtRest,
        lineCountFoldedInCard: lineCountInCard,
        isFirstLineCut: isFirstLineCut,
        widthOfFirstLine: widthOfFirstLine,
      }
    : NO_FOLDED_LINES;
}
export function useFormulaBarLines({
  field: field,
  text: text,
  toolsAtEnd: toolsAtEnd,
  areToolsAtEnd: areToolsAtEnd,
  isCardAsWideAsStrip: isCardAsWideAsStrip,
  isOnlyRead: isOnlyRead,
}: Dynamic) {
  let [lines, setLines] = React.useState(NO_FOLDED_LINES);
  React.useLayoutEffect(() => {
    let strip = field.current?.parentElement ?? null;
    let view = strip?.ownerDocument.defaultView ?? null;
    if (strip === null || view === null) return;
    let stripWidth = () => strip.getBoundingClientRect().width;
    let widthAtRest = () => stripWidth() - (toolsAtEnd.current?.getBoundingClientRect().width ?? 0);
    let measure = () => {
      if (field.current === null) return;
      let measured = measureFoldedLines(field.current, text, {
        atRest: widthAtRest(),
        ofCard: isCardAsWideAsStrip ? stripWidth() : widthAtRest(),
      });
      setLines(
        (linesBefore?: Dynamic) =>
          linesBefore.lineCountFolded === measured.lineCountFolded &&
          linesBefore.lineCountFoldedInCard === measured.lineCountFoldedInCard &&
          linesBefore.isFirstLineCut === measured.isFirstLineCut &&
          linesBefore.widthOfFirstLine === measured.widthOfFirstLine
            ? linesBefore
            : measured,
      );
    };
    measure();
    let lastWidthAtRest: Dynamic = widthAtRest();
    let resizeObserver = new (view.ResizeObserver as Dynamic)(() => {
      if (widthAtRest() !== lastWidthAtRest) measure();
      lastWidthAtRest = widthAtRest();
    });
    resizeObserver.observe(strip);
    if (areToolsAtEnd && toolsAtEnd.current !== null) resizeObserver.observe(toolsAtEnd.current);
    let mutationObserver = new (view.MutationObserver as Dynamic)(measure);
    mutationObserver.observe(strip, {
      attributeFilter: ['style'],
    });
    let { fonts: documentFonts } = strip.ownerDocument;
    documentFonts.addEventListener('loadingdone', measure);
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      documentFonts.removeEventListener('loadingdone', measure);
    };
  }, [field, text, toolsAtEnd, areToolsAtEnd, isCardAsWideAsStrip]);
  return formulaBarLinesOf(text, lines, isOnlyRead);
}
export const NO_FOLDED_LINES = {
  lineCountFolded: 0,
  lineCountFoldedInCard: 0,
  isFirstLineCut: false,
  widthOfFirstLine: 0,
};
export const FOLDED_LINE_RTL_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
export const firstLineWidthStyle = (lines?: Dynamic) =>
  lines === null
    ? undefined
    : {
        '--sheet-formula-first-line-width': `${lines}px`,
      };
