import type { Dynamic } from '../dynamic.ts';
import { translateMessage } from '../i18n/messages.ts';
export function truncateShownValue(text?: Dynamic) {
  let [shown, count]: Dynamic = ['', 0];
  for (let { segment: segment } of new (Intl.Segmenter as Dynamic)().segment(text) as Dynamic) {
    if (count === MAX_SHOWN_VALUE_GRAPHEMES) return `${shown}…`;
    shown += segment;
    count += 1;
  }
  return text;
}
export function twoFormulaReadingsHint([formula, value]: Dynamic, [otherFormula, otherValue]: Dynamic, canAskAgent?: Dynamic) {
  let [shownValue, otherShownValue] = [truncateShownValue(value), truncateShownValue(otherValue)];
  return canAskAgent
    ? translateMessage(
        {
          defaultMessage:
            'This may read as {formula}, which comes to {value}, or as {otherFormula}, which comes to {otherValue}. Press the up arrow to choose one, Enter to have Agent write one, or Tab to keep typing.',
          id: 'y9FjgpINoc',
        },
        {
          formula: formula,
          value: shownValue,
          otherFormula: otherFormula,
          otherValue: otherShownValue,
        },
      )
    : translateMessage(
        {
          defaultMessage:
            'This may read as {formula}, which comes to {value}, or as {otherFormula}, which comes to {otherValue}. Press the up arrow to choose one, or Tab to keep typing.',
          id: 'BQnMZqWtza',
        },
        {
          formula: formula,
          value: shownValue,
          otherFormula: otherFormula,
          otherValue: otherShownValue,
        },
      );
}
export const formulaOptionsLabel = () =>
  translateMessage({
    defaultMessage: 'Formula options',
    id: '4AZxGSJGMS',
  });
export const writeThisFormulaLabel = () =>
  translateMessage({
    defaultMessage: 'Write this formula',
    id: 'bcmFE/0Voj',
  });
export const keepTypingLabel = () =>
  translateMessage({
    defaultMessage: 'Keep typing',
    id: 'dwWRQvktyy',
  });
export const escapeKeyHint = () =>
  translateMessage({
    defaultMessage: 'Esc',
    id: 'qf2cH+C0rv',
  });
export const writingFormulaWords = () =>
  translateMessage({
    defaultMessage: 'Writing a formula…',
    id: '6X8YFtJs5V',
  });
export const stopWritingFormulaLabel = () =>
  translateMessage({
    defaultMessage: 'Stop',
    id: 'EQV1kDGXjE',
  });
export const writingFormulaForWords = (words?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Writing a formula for “{words}”…',
      id: '0T3Og9F4nR',
    },
    {
      words: words,
    },
  );
export const keepFormulaLabel = () =>
  translateMessage({
    defaultMessage: 'Keep',
    id: 'XIImjuZhtC',
  });
export const discardFormulaLabel = () =>
  translateMessage({
    defaultMessage: 'Discard',
    id: '3qNOm7mVWg',
  });
export const MAX_SHOWN_VALUE_GRAPHEMES = 100;
export const formulaResultPreview = (value?: Dynamic) =>
  value === ''
    ? null
    : translateMessage(
        {
          defaultMessage: '= {shown}',
          id: 'kAAJ3Umys8',
        },
        {
          shown: truncateShownValue(value),
        },
      );
export const formulaNotWrittenWords = () =>
  translateMessage({
    defaultMessage: 'Couldn’t write a formula. Try again.',
    id: 'Kwp8TcMZyZ',
  });
export const formulaAgentUnavailableWords = () =>
  translateMessage({
    defaultMessage: 'Agent isn’t available in this Sheet. You can type the formula yourself.',
    id: 'tmy+W4NpPE',
  });
export const formulaSheetTooLargeWords = () =>
  translateMessage({
    defaultMessage: 'This sheet is too large for Agent to read. You can type the formula yourself.',
    id: 'A43oCof2fM',
  });
export const formulaMakesAddressWords = () =>
  translateMessage({
    defaultMessage: 'Agent can’t write formulas that make web addresses. You can type the formula yourself.',
    id: 'vMv7I7F2kK',
  });
export const formulaRanOutOfTimeWords = () =>
  translateMessage({
    defaultMessage: 'Formulas took too long, so Agent’s formula wasn’t added. You can type the formula yourself.',
    id: 'i3BIwujuPX',
  });
export const formulaNotReadWords = () =>
  translateMessage({
    defaultMessage: 'Couldn’t turn that into a formula. Try saying it another way.',
    id: 'slp+LQYT2d',
  });
export const formulaNotWrittenReason = (failure?: Dynamic) =>
  (
    ({
      noFormula: formulaNotReadWords,
      makesAnAddress: formulaMakesAddressWords,
      ranOutOfTime: formulaRanOutOfTimeWords,
      notAvailable: formulaAgentUnavailableWords,
      sheetTooLarge: formulaSheetTooLargeWords,
    }) as Dynamic
  )[failure]();
export const notAFormulaHint = () =>
  translateMessage({
    defaultMessage: 'This isn’t a formula. Press Enter to have Agent write one, or Tab to keep typing.',
    id: '/GqwOJuhfW',
  });
export const formulaReadingHint = (formula?: Dynamic, value?: Dynamic) =>
  value === ''
    ? translateMessage(
        {
          defaultMessage: 'This reads as {formula}. Press Enter to use it, or Tab to keep typing.',
          id: 'cKNR/p1emB',
        },
        {
          formula: formula,
        },
      )
    : translateMessage(
        {
          defaultMessage: 'This reads as {formula}. It comes to {value}. Press Enter to use it, or Tab to keep typing.',
          id: 'WNsDeIughX',
        },
        {
          formula: formula,
          value: truncateShownValue(value),
        },
      );
export const formulaOfferGoneWords = () =>
  translateMessage({
    defaultMessage: 'The offer to write a formula is gone.',
    id: 'azRxl7z6fF',
  });
export const agentWritingFormulaWords = () =>
  translateMessage({
    defaultMessage: 'Agent is writing a formula. Press Escape to stop.',
    id: 'J4yZ1kZIYm',
  });
export const agentWroteFormulaWords = (count?: Dynamic, formula?: Dynamic, value?: Dynamic) =>
  value === ''
    ? translateMessage(
        {
          defaultMessage:
            '{count, plural, one {Agent wrote # fix to choose from.} other {Agent wrote # fixes to choose from.}} The first is {formula}. Press the down arrow for the next, Enter to keep the one you’re on, or Escape to discard them all.',
          id: 'nnTWnPd3Qs',
        },
        {
          count: count,
          formula: formula,
        },
      )
    : translateMessage(
        {
          defaultMessage:
            '{count, plural, one {Agent wrote # fix to choose from.} other {Agent wrote # fixes to choose from.}} The first is {formula}. It comes to {value}. Press the down arrow for the next, Enter to keep the one you’re on, or Escape to discard them all.',
          id: 'dkB3y5nP3q',
        },
        {
          count: count,
          formula: formula,
          value: truncateShownValue(value),
        },
      );
export const agentWroteOneFormulaWords = (formula?: Dynamic, value?: Dynamic) =>
  value === ''
    ? translateMessage(
        {
          defaultMessage: 'Agent wrote {formula}. Press Enter to keep it, or Escape to discard it.',
          id: 'jXbHJC875P',
        },
        {
          formula: formula,
        },
      )
    : translateMessage(
        {
          defaultMessage: 'Agent wrote {formula}. It comes to {value}. Press Enter to keep it, or Escape to discard it.',
          id: 'YIuX8lEiPB',
        },
        {
          formula: formula,
          value: truncateShownValue(value),
        },
      );
