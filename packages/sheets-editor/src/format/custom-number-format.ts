import type { Dynamic } from '../dynamic.ts';
import { UNREADABLE_PATTERN_REFUSALS, sampleValueOfFormatKind, choiceOfPattern, EMPTY_SHOWN_UNDER_PATTERN } from './number-format-choices.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { activeAnchorCell, isSameSelection } from '../selection/model.ts';
import { isGeneralPattern, DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
import { newAwaitedHold, asLandedHold } from './answer-holds.ts';
import { checkAgentForFormulas } from '../formulas/from-words/offer.ts';
import { withNoEffects } from '../state/transitions.ts';
import { sanitizeCellText } from '../model/cell-text.ts';
import {
  MAX_PATTERN_LENGTH_FOR_AGENT,
  looksLikeWordsNotPattern,
  numberFormatFromWordsRequest,
  currencySignPlacement,
  ownDatePatternOf,
  SAMPLE_DATE_SERIAL,
  readPatternAnswer,
} from './custom-format-agent.ts';
import { dayMonthOrderOf } from '../import/import-basics.ts';
import { DEFAULT_TIME_OF_DAY_PATTERN } from '../model/workbook.ts';
import { ADDRESS_LIKE_PATTERN } from '../formulas/from-words/ask-agent.ts';
import { cleanTextForAgent } from '../agent/prompt-text.ts';
import type { PageState } from '../state/initial-state.ts';
export function whyPatternRefused(refusal?: Dynamic) {
  if (refusal === 'characterNeedsQuotes') return 'textNeedsQuotationMarks';
  if (refusal === 'numberFormatNotPrintedYet') return 'notPrintedYet';
  return UNREADABLE_PATTERN_REFUSALS.has(refusal) ? 'unreadable' : 'notJudged';
}
export function readTypedPattern(state: PageState, sheet?: Dynamic, typed?: Dynamic) {
  if (typed === '')
    return {
      kind: 'nothingTyped',
    };
  let activeValue = cellValueOf(sheet.cellOnShowIn(activeAnchorCell(state, sheet)));
  let read = sheet.patternRead(
    isGeneralPattern(typed) ? DEFAULT_CELL_FORMAT.numberFormat.pattern : typed,
    (formatKind?: Dynamic) => (activeValue?.kind === 'number' ? activeValue.value : sampleValueOfFormatKind(formatKind)),
  );
  if (read === null)
    return {
      kind: 'refused',
      why: 'notJudged',
    };
  if (read.kind === 'refused')
    return {
      kind: 'refused',
      why: whyPatternRefused(read.refusal),
    };
  let { numberFormat: numberFormat, shown: shown } = read;
  if (shown.kind === 'text')
    return {
      kind: 'numberFormat',
      numberFormat: numberFormat,
      example: shown.text,
    };
  return shown.reason === 'notPrintedYet'
    ? {
        kind: 'refused',
        why: 'notPrintedYet',
      }
    : {
        kind: 'numberFormat',
        numberFormat: numberFormat,
        example: null,
      };
}
export function nextAnswerHold(agent?: Dynamic, hold?: Dynamic, typedIn?: Dynamic) {
  if (agent?.kind === 'asked') return hold?.answerId === agent.askId ? hold : newAwaitedHold(agent.askId);
  if (!(agent?.kind === 'wrote' || (agent?.kind === 'cameToNothing' && (agent.why === 'callFailed' || typedIn === 'list')))) return null;
  return hold?.stands === 'seen' ? hold : asLandedHold(hold ?? newAwaitedHold(0));
}
export function sharedCustomPatternOf({ formatOfSelection: formatOfSelection }: Dynamic) {
  let pattern = formatOfSelection.shared.numberFormat?.pattern;
  return pattern === undefined || pattern === DEFAULT_CELL_FORMAT.numberFormat.pattern ? null : pattern;
}
export function listAskOfPattern({ customNumberFormat: customNumberFormat }: Dynamic, pattern?: Dynamic) {
  if (customNumberFormat?.typedIn !== 'list' || customNumberFormat.pattern.trim() !== pattern) return null;
  return customNumberFormat.agent?.kind === 'cameToNothing' && customNumberFormat.agent.why === 'noFormat'
    ? {
        ...customNumberFormat.agent,
        isOfAskInList: true,
      }
    : null;
}
export function openCustomFormatDialog(state?: Dynamic, sheet?: Dynamic, pattern: Dynamic = null) {
  let opened = {
    ...state,
    pickForWorkbook: null,
    lastDone: null,
    notice: null,
  };
  if (pattern !== null)
    return checkAgentForFormulas(
      withNoEffects(
        withCustomPatternTyped(
          opened,
          sheet,
          sanitizeCellText(pattern),
          {
            hasHeldTextOfOthers: false,
            typedIn: 'dialog',
          },
          listAskOfPattern(state, pattern),
        ),
      ),
    );
  let sharedPattern = sharedCustomPatternOf(state);
  let hasShared = sharedPattern !== null;
  return checkAgentForFormulas(
    withNoEffects(
      withCustomPatternTyped(
        opened,
        sheet,
        sharedPattern ?? '',
        {
          hasHeldTextOfOthers: hasShared,
          typedIn: 'dialog',
        },
        hasShared
          ? {
              kind: 'typedOn',
            }
          : null,
      ),
    ),
  );
}
export function keepsTypedOn(
  { pattern: pattern, agent: agent, hasHeldTextOfOthers: hasHeldTextOfOthers }: Dynamic,
  typed?: Dynamic,
  isOfUndoOrRedo?: Dynamic,
) {
  if (isOfUndoOrRedo) return hasHeldTextOfOthers;
  let startsAnew = typed.length <= 1 || (pattern[0] !== typed[0] && pattern.at(-1) !== typed.at(-1));
  return (agent?.kind === 'wrote' || agent?.kind === 'typedOn') && !startsAnew;
}
export function typeCustomPattern(state: PageState, sheet?: Dynamic, typed?: Dynamic, isOfUndoOrRedo?: Dynamic) {
  let customNumberFormat = state.customNumberFormat;
  if (customNumberFormat === null) return withNoEffects(state);
  let cleanTyped = sanitizeCellText(typed);
  let agentMark = keepsTypedOn(customNumberFormat, cleanTyped, isOfUndoOrRedo)
    ? {
        kind: 'typedOn',
      }
    : null;
  return withNoEffects(withCustomPatternTyped(state, sheet, cleanTyped, customNumberFormat, agentMark));
}
export function typeCustomPatternInList(state: PageState, sheet?: Dynamic, typed?: Dynamic) {
  let clipped = typed.slice(0, MAX_TYPED_PATTERN_LENGTH).replace(/[\uD800-\uDBFF]$/, '');
  let customNumberFormat = state.customNumberFormat;
  if (customNumberFormat?.typedIn === 'dialog' || state.contextBarMenu !== 'numberFormat') return withNoEffects(state);
  if (clipped.trim() === '')
    return withNoEffects({
      ...state,
      customNumberFormat: null,
    });
  if (customNumberFormat === null)
    return checkAgentForFormulas(
      withNoEffects(
        withCustomPatternTyped(state, sheet, sanitizeCellText(clipped), {
          hasHeldTextOfOthers: false,
          typedIn: 'list',
        }),
      ),
    );
  let withWords =
    customNumberFormat.agent?.kind === 'wrote' ? withCustomPatternTyped(state, sheet, customNumberFormat.agent.words, customNumberFormat) : state;
  return typeCustomPattern(withWords, sheet, clipped, false);
}
export function customPatternListText({ customNumberFormat: customNumberFormat }: Dynamic) {
  if (customNumberFormat?.typedIn !== 'list') return '';
  return customNumberFormat.agent?.kind === 'wrote' ? customNumberFormat.agent.words : customNumberFormat.pattern;
}
export function closeListCustomFormat(before?: Dynamic, step?: Dynamic, action?: Dynamic) {
  let { customNumberFormat: customNumberFormat, contextBarMenu: contextBarMenu } = step.state;
  if (contextBarMenu !== 'numberFormat')
    return customNumberFormat?.typedIn !== 'list'
      ? step
      : withStopAskingEffect(step.state, {
          ...step,
          state: {
            ...step.state,
            customNumberFormat: null,
          },
        });
  return customNumberFormat === null &&
    before.customNumberFormat?.typedIn === 'list' &&
    (action.kind === 'editAnswered' || action.kind === 'customNumberFormatEntered')
    ? {
        ...step,
        state: {
          ...step.state,
          contextBarMenu: null,
        },
      }
    : step;
}
export function canAskAgentForFormat({ customNumberFormat: customNumberFormat, formulaFromWords: formulaFromWords }: Dynamic) {
  if (customNumberFormat === null || formulaFromWords.agent !== 'available') return false;
  let { pattern: pattern, reading: reading, agent: agent } = customNumberFormat;
  return (
    (agent === null || (agent.kind === 'cameToNothing' && agent.why === 'callFailed')) &&
    pattern.length <= MAX_PATTERN_LENGTH_FOR_AGENT &&
    reading.kind === 'refused' &&
    (reading.why === 'textNeedsQuotationMarks' || reading.why === 'unreadable') &&
    looksLikeWordsNotPattern(pattern)
  );
}
export function askAgentForNumberFormat(state: PageState, sheet?: Dynamic) {
  let { customNumberFormat: customNumberFormat, formulaFromWords: formulaFromWords } = state;
  if (customNumberFormat === null) return withNoEffects(state);
  let askId = formulaFromWords.askCount + 1;
  let sharedPattern = sharedCustomPatternOf(state);
  let isSharedReadable = sharedPattern !== null && readTypedPattern(state, sheet, sharedPattern).kind === 'numberFormat';
  return {
    state: {
      ...withAgentOfCustomFormat(
        state,
        {
          ...customNumberFormat,
          isRefusalTold: false,
        },
        {
          kind: 'asked',
          askId: askId,
        },
      ),
      formulaFromWords: {
        ...formulaFromWords,
        askCount: askId,
      },
    },
    effects: [
      {
        kind: 'askAgentForANumberFormat',
        askId: askId,
        asked: numberFormatFromWordsRequest(customNumberFormat.pattern.trim(), isSharedReadable ? sharedPattern : null, {
          orderOfDayAndMonth: dayMonthOrderOf(sheet),
          signsOfNumbers: sheet.signsOfNumbers,
          currencySign: currencySignPlacement(sheet.locale),
          clock: sheet.patternOfATimeOfDay === DEFAULT_TIME_OF_DAY_PATTERN ? 'twelveHours' : 'twentyFourHours',
          ownDate: ownDatePatternOf(
            sheet.shownWithRoomForAll(
              {
                kind: 'number',
                value: SAMPLE_DATE_SERIAL,
              },
              'm/d/yyyy',
            ),
          ),
        }),
      },
    ],
  };
}
export function patternShowsOddText(sheet?: Dynamic, pattern?: Dynamic) {
  let testNumbers = [...pattern.matchAll(CONDITION_NUMBER_PATTERN)]
    .map(([, digits]: Dynamic) => Number(digits))
    .flatMap((number?: Dynamic) => [number - 1, number, number + 1, number * 2, number / 2])
    .filter((number?: Dynamic) => Number.isFinite(number))
    .map(
      (number?: Dynamic) => ({
        kind: 'number',
        value: number,
      }),
    );
  return [
    pattern,
    ...[...PATTERN_TEST_VALUES, ...testNumbers].map((testValue?: Dynamic) => sheet.shownWithRoomForAll(testValue, pattern)),
  ].some((shown?: Dynamic) => shown !== null && ADDRESS_LIKE_PATTERN.test(shown));
}
export function patternEchoesWords(sheet?: Dynamic, pattern?: Dynamic, words?: Dynamic) {
  let shownHuge = sheet.shownWithRoomForAll(
    {
      kind: 'number',
      value: 1000000000000000000000000000000,
    },
    pattern,
  );
  return shownHuge !== null && normalizedWords(shownHuge) === normalizedWords(cleanTextForAgent(words));
}
export function takeNumberFormatAnswer(state: PageState, sheet?: Dynamic, askId?: Dynamic, reply?: Dynamic) {
  let { customNumberFormat: customNumberFormat, formulaFromWords: formulaFromWords } = state;
  if (customNumberFormat?.agent?.kind !== 'asked' || customNumberFormat.agent.askId !== askId) return state;
  let cameToNothing = (why?: Dynamic) =>
    withAgentOfCustomFormat(state, customNumberFormat, {
      kind: 'cameToNothing',
      why: why,
    });
  switch (reply.kind) {
    case 'notToBeHad':
      return {
        ...cameToNothing('notAvailable'),
        formulaFromWords: {
          ...formulaFromWords,
          agent: 'notToBeHad',
        },
      };
    case 'stopped':
      return withAgentOfCustomFormat(state, customNumberFormat, null);
    case 'failed':
      return cameToNothing('callFailed');
    case 'answered': {
      let pattern = readPatternAnswer(reply.answer);
      if (pattern === null) return cameToNothing('noFormat');
      let wrote = {
        kind: 'wrote',
        words: customNumberFormat.pattern,
      };
      let withPattern = withCustomPatternTyped(state, sheet, pattern, customNumberFormat, wrote);
      return withPattern.customNumberFormat?.reading.kind === 'numberFormat' &&
        !patternShowsOddText(sheet, pattern) &&
        !patternEchoesWords(sheet, pattern, customNumberFormat.pattern)
        ? withPattern
        : cameToNothing('noFormat');
    }
  }
}
export function leaveCustomFormat(state: PageState, sheet?: Dynamic) {
  let customNumberFormat = state.customNumberFormat;
  if (customNumberFormat === null) return state;
  if (canAskAgentForFormat(state) && customNumberFormat.typedIn === 'list') return state;
  if (canAskAgentForFormat(state))
    return customNumberFormat.isRefusalTold
      ? {
          ...state,
          customNumberFormat: null,
        }
      : withAgentOfCustomFormat(state, customNumberFormat, {
          kind: 'wavedOff',
        });
  let isNothingOfDialog = customNumberFormat.agent?.kind === 'cameToNothing' && !customNumberFormat.agent.isOfAskInList;
  if (customNumberFormat.agent?.kind === 'asked' || isNothingOfDialog) return withAgentOfCustomFormat(state, customNumberFormat, null);
  if (customNumberFormat.agent?.kind === 'wrote') return withCustomPatternTyped(state, sheet, customNumberFormat.agent.words, customNumberFormat);
  return {
    ...state,
    customNumberFormat: null,
  };
}
export function withStopAskingEffect(before?: Dynamic, step?: Dynamic) {
  let agent = before.customNumberFormat?.agent;
  return agent?.kind !== 'asked' || step.state.customNumberFormat?.agent === agent
    ? step
    : {
        ...step,
        effects: [
          ...step.effects,
          {
            kind: 'stopAskingAgentForAFormula',
          },
        ],
      };
}
export function formatOfCustomPattern({ reading: reading }: Dynamic, sheet?: Dynamic) {
  if (reading.kind !== 'numberFormat') return null;
  let choice = choiceOfPattern(reading.numberFormat.pattern, sheet);
  return choice === null
    ? {
        customNumberFormat: reading.numberFormat,
      }
    : {
        numberFormatChoice: choice,
      };
}
export function afterFormatApplied(customNumberFormat?: Dynamic, numberFormat?: Dynamic, refusal?: Dynamic) {
  if (customNumberFormat === null || !isCustomPatternApplied(customNumberFormat, numberFormat)) return customNumberFormat;
  if (refusal !== 'numberFormatNotPrintedYet') return null;
  let reading = {
    kind: 'refused',
    why: whyPatternRefused(refusal),
  };
  let { hold: hold, ...rest } = withPatternReading(customNumberFormat, reading);
  let isNewHold = hold !== null && hold !== customNumberFormat.hold;
  return {
    ...rest,
    hold: isNewHold
      ? {
          ...hold,
          actsHeld: hold.actsHeld + 1,
        }
      : hold,
    isRefusalTold: true,
  };
}
export function rereadCustomPattern(before: Dynamic, state: PageState, sheet?: Dynamic) {
  let customNumberFormat = state.customNumberFormat;
  if (customNumberFormat === null || customNumberFormat !== before.customNumberFormat) return state;
  if (!isSameSelection(before, state))
    return {
      ...state,
      customNumberFormat: null,
    };
  if (state.workbookChangeCount === before.workbookChangeCount && state.formulasWorkedOutCount === before.formulasWorkedOutCount) return state;
  let reading = readTypedPattern(state, sheet, patternToRead(customNumberFormat));
  return customNumberFormat.reading.kind === 'refused' && reading.kind === 'numberFormat'
    ? state
    : {
        ...state,
        customNumberFormat: withPatternReading(customNumberFormat, reading),
      };
}
export const patternToRead = ({ pattern: pattern, typedIn: typedIn, agent: agent }: Dynamic) =>
  typedIn === 'list' && agent?.kind !== 'wrote' ? pattern.trim() : pattern;
export const withCustomPatternTyped = (
  state: PageState,
  sheet: Dynamic,
  pattern: Dynamic,
  { hasHeldTextOfOthers: hasHeldTextOfOthers, typedIn: typedIn }: Dynamic,
  agent: Dynamic = null,
) => ({
  ...state,
  customNumberFormat: {
    pattern: pattern,
    reading: readTypedPattern(
      state,
      sheet,
      patternToRead({
        pattern: pattern,
        typedIn: typedIn,
        agent: agent,
      }),
    ),
    isRefusalTold: false,
    agent: agent,
    hold: nextAnswerHold(agent, state.customNumberFormat?.hold ?? null, typedIn),
    hasHeldTextOfOthers: hasHeldTextOfOthers || (agent?.kind === 'wrote' && typedIn === 'dialog'),
    typedIn: typedIn,
    shownUnderPattern: EMPTY_SHOWN_UNDER_PATTERN,
  },
});
export const MAX_TYPED_PATTERN_LENGTH = 300;
export const withAgentOfCustomFormat = (state?: Dynamic, customNumberFormat?: Dynamic, agent?: Dynamic) => ({
  ...state,
  customNumberFormat: {
    ...customNumberFormat,
    agent: agent,
    hold: nextAnswerHold(agent, customNumberFormat.hold, customNumberFormat.typedIn),
  },
});
export const PATTERN_TEST_VALUES = [
  {
    kind: 'number',
    value: 1234.5,
  },
  {
    kind: 'number',
    value: -1234.5,
  },
  {
    kind: 'number',
    value: 1e9,
  },
  {
    kind: 'number',
    value: -1e9,
  },
  {
    kind: 'number',
    value: 0.3,
  },
  {
    kind: 'number',
    value: -0.3,
  },
  {
    kind: 'number',
    value: 0,
  },
  {
    kind: 'text',
    value: 'a',
  },
];
export const CONDITION_NUMBER_PATTERN = /\[(?:<=|>=|<>|[<>=])\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*\]/gi;
export const normalizedWords = (words?: Dynamic) => words.replaceAll(/\s+/gu, ' ').trim().toLowerCase();
export const withRefusalTold = (customNumberFormat?: Dynamic) =>
  customNumberFormat.reading.kind === 'refused'
    ? {
        ...customNumberFormat,
        isRefusalTold: true,
      }
    : customNumberFormat;
export const withPatternReading = (customNumberFormat?: Dynamic, reading?: Dynamic) => ({
  ...customNumberFormat,
  reading: reading,
  hold:
    customNumberFormat.hold !== null &&
    customNumberFormat.hold.stands !== 'awaited' &&
    customNumberFormat.typedIn === 'list' &&
    reading.kind !== customNumberFormat.reading.kind
      ? {
          ...asLandedHold(customNumberFormat.hold),
          answerId: -customNumberFormat.hold.answerId - 1,
        }
      : customNumberFormat.hold,
});
export const isCustomPatternApplied = (customNumberFormat?: Dynamic, change?: Dynamic) =>
  customNumberFormat.reading.kind === 'numberFormat' &&
  change.kind === 'formatCells' &&
  change.format.numberFormat?.pattern === customNumberFormat.reading.numberFormat.pattern;
