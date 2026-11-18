import { Menu } from '../kit/menu.tsx';
import { ShimmerText } from '../kit/shimmer-text.tsx';
import { useUiWindow } from '../kit/theme.tsx';
import { parseSingleShortcut } from '../kit/shortcut.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { translateMessage } from '../i18n/messages.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { OfferWand, WordsInTurn } from '../formulas/from-words/offer-list.ts';
import { StopKeyHint, stopKeyHintOf } from '../agent/agent-rows.ts';
import { stopWritingFormulaLabel, escapeKeyHint } from '../messages/formula-writing.ts';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
import { formatPreviewText, customFormatProblemText } from '../i18n/format-labels.ts';
import { useActHoldAtAnswer } from '../agent/answer-holds.ts';
import { customPatternListText } from './custom-number-format.ts';
import { isSafariLateEnter } from '../ui/menu-with-field.ts';
import { swallowRestOfPress } from '../ui/press-swallow.ts';
export function formatWritingProblemText(why?: Dynamic) {
  switch (why) {
    case 'noFormat':
      return translateMessage({
        defaultMessage: 'Couldn’t turn that into a format. Try other words.',
        id: '2u+qMfkqr7',
      });
    case 'callFailed':
      return translateMessage({
        defaultMessage: 'Couldn’t write a format. Try again.',
        id: '6eKF5ZeB5N',
      });
    case 'notAvailable':
      return translateMessage({
        defaultMessage: 'Agent isn’t available in this Sheet.',
        id: 'Ww081c1sOn',
      });
  }
}
export function customFormatStage(agent?: Dynamic, isOffered?: Dynamic) {
  if (isOffered)
    return {
      kind: 'offered',
      hasCallFailed: agent?.kind === 'cameToNothing',
    };
  if (agent?.kind === 'asked')
    return {
      kind: 'asked',
    };
  return agent?.kind === 'cameToNothing' && agent.why !== 'callFailed'
    ? {
        kind: 'cameToNothing',
        why: agent.why,
      }
    : null;
}
export function useOfferTakesEnter(isEnterForOffer2?: Dynamic) {
  let [isReady, setIsReady] = React.useState(false);
  React.useEffect(() => {
    if (!isEnterForOffer2) return;
    let timer = setTimeout(() => setIsReady(true), OFFER_ENTER_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setIsReady(false);
    };
  }, [isEnterForOffer2]);
  return isEnterForOffer2 && isReady;
}
export function CustomFormatAgentRow({ id: id, stage: stage, onAgentAsked: onAgentAsked, onStopped: onStopped }: Dynamic) {
  if (stage.kind === 'cameToNothing')
    return jsx('p', {
      id: id,
      className: `sheet-line-under-field box-content min-h-[1lh] text-footnote ${stage.why === 'noFormat' ? 'text-danger' : 'text-secondary'}`,
      children: formatWritingProblemText(stage.why),
    });
  let isOffered = stage.kind === 'offered';
  let hasCallFailed = isOffered && stage.hasCallFailed;
  let offerText = hasCallFailed ? formatWritingProblemText('callFailed') : writeThisFormatLabel();
  return jsxs('button', {
    id: id,
    type: 'button',
    tabIndex: -1,
    className: `sheet-line-under-field flex w-full cursor-default items-start gap-1.5 text-start text-footnote text-primary *:min-h-[1lh] ${isOffered ? 'sheet-line-under-enter' : ''}`,
    onMouseDown: (event?: Dynamic) => event.preventDefault(),
    onClick: isOffered ? onAgentAsked : onStopped,
    children: [
      jsx(OfferWand, {
        kind: stage.kind,
      }),
      jsx('span', {
        className: hasCallFailed ? 'min-w-0 flex-1' : 'min-w-0 flex-1 truncate',
        children: isOffered
          ? offerText
          : jsx(ShimmerText, {
              children: writingFormatLabel(),
            }),
      }),
      jsx(StopKeyHint, {
        word: stopWritingFormulaLabel(),
        isSmall: true,
        keyInWords: escapeKeyHint(),
        isShown: !isOffered,
      }),
    ],
  });
}
export function CustomFormatAnnouncer({ entry: { pattern: pattern, agent: agent }, isOfferSaid: isOfferSaid, example: example }: Dynamic) {
  let doesOfferTakeEnter = useOfferTakesEnter(isOfferSaid && agent === null);
  if (agent === null)
    return jsx(LiveAnnouncer, {
      words: doesOfferTakeEnter && notAFormatAnnouncement(),
    });
  if (agent.kind === 'asked')
    return jsx(LiveAnnouncer, {
      words: agentWritingFormatAnnouncement(),
    });
  if (agent.kind !== 'wrote')
    return jsx(LiveAnnouncer, {
      words: null,
    });
  let exampleText = example === '' ? '' : ` ${formatPreviewText(example)}`;
  return jsx(LiveAnnouncer, {
    words: agentWroteFormatAnnouncement(pattern) + exampleText,
  });
}
export function useCustomFormatList({ entry: entry, isAgentOffered: isAgentOffered, told: told }: Dynamic, takesTypedPattern?: Dynamic) {
  let stage = customFormatStage(entry?.agent ?? null, entry !== null && isAgentOffered);
  let actGate = useActHoldAtAnswer({
    hold: entry?.hold ?? null,
    tellOfActHeld: () => told.onActHeld({}),
    isNoAct: isFieldInput,
  });
  let compositionEndRef = React.useRef(Number.NEGATIVE_INFINITY);
  let ownWindow = useUiWindow();
  let ownDocument = ownWindow?.document;
  let hasEntry = entry !== null;
  React.useEffect(() => {
    if (!hasEntry) return;
    let noteCompositionEnd = ({ timeStamp: timeStamp }: Dynamic) => {
      compositionEndRef.current = timeStamp;
    };
    ownDocument?.addEventListener('compositionend', noteCompositionEnd, true);
    return () => ownDocument?.removeEventListener('compositionend', noteCompositionEnd, true);
  }, [ownDocument, hasEntry]);
  return {
    entry: entry,
    text: customPatternListText({
      customNumberFormat: entry,
    }),
    onTyped: told.onTyped,
    stage: stage,
    takesTypedPattern: takesTypedPattern,
    handlers: actGate.handlers,
    noteKeyThatTakesNothing: actGate.noteKeyThatTakesNothing,
    isLateEnterOfInputMethod({ key: key, timeStamp: timeStamp }: Dynamic) {
      let msSinceComposition = timeStamp - compositionEndRef.current;
      compositionEndRef.current = Number.NEGATIVE_INFINITY;
      return key === 'Enter' && isSafariLateEnter(msSinceComposition, (ownWindow ?? window).navigator.vendor);
    },
    stepBack: told.onEscaped,
    ...customFormatActs(actGate, told),
  };
}
export function customFormatRowLabel(list?: Dynamic) {
  let { entry: entry, stage: stage } = list;
  if (entry !== null && isTypedPatternTaken(list)) return entry.pattern.trim();
  return stage?.kind === 'offered' && !stage.hasCallFailed ? writeThisFormatLabel() : null;
}
export function customFormatKeyAction(press?: Dynamic, list?: Dynamic, canOffer?: Dynamic) {
  let { entry: entry, stage: stage } = list;
  if (entry === null || press.isOfInputMethod || press.isWithModifier) return null;
  let isAsked = stage?.kind === 'asked';
  if (press.key === 'Escape') return isAsked || isAgentFormatWritten(entry) ? 'stepBack' : null;
  if (!(press.key === 'Enter' || (press.key === ' ' && press.on === 'thisRow'))) return null;
  let listsOnceSeen = entry.hold !== null && entry.hold.stands !== 'awaited' ? 'listsOnceSeen' : null;
  if (press.on === 'anotherRow') return listsOnceSeen;
  if (press.isHeldDown || isAsked) return 'nothing';
  let canTake = isAgentFormatWritten(entry) || isTypedPatternTaken(list);
  if (press.on === 'thisRow') return null;
  let isOfferLive = canOffer && (stage?.kind === 'offered' || isTypedPatternTaken(list));
  if (!isAgentBusyOrDone(list) && !isOfferLive) return listsOnceSeen;
  return canTake ? 'take' : 'ask';
}
export function handleCustomFormatKey(list?: Dynamic, event?: Dynamic, canOffer?: Dynamic) {
  let action = customFormatKeyAction(
    {
      key: event.key,
      on: isFieldInput(event.target)
        ? 'field'
        : event.target instanceof Element && event.target.hasAttribute(CUSTOM_FORMAT_ROW_ATTRIBUTE)
          ? 'thisRow'
          : 'anotherRow',
      isHeldDown: event.repeat,
      isWithModifier: event.shiftKey || event.altKey || event.ctrlKey || event.metaKey,
      isOfInputMethod: list.isLateEnterOfInputMethod(event.nativeEvent) || event.nativeEvent.isComposing || event.keyCode === 229,
    },
    list,
    canOffer,
  );
  if (action === 'stepBack') list.stepBack();
  if (action === 'ask') list.ask();
  if (action === 'take') list.take();
  if (action === 'nothing') list.noteKeyThatTakesNothing();
  return action === 'listsOnceSeen' ? list.isActTooSoon() : action !== null;
}
export function customFormatRowProblemText({ entry: entry, stage: stage }: Dynamic) {
  if (hasOfferCallFailed(stage)) return formatCallFailedAnnouncement();
  if (stage?.kind === 'cameToNothing') return formatWritingProblemText(stage.why);
  return entry?.reading.kind === 'refused' && entry.isRefusalTold ? customFormatProblemText(entry.reading.why) : null;
}
export function agentRowWords(stage?: Dynamic) {
  if (stage.kind === 'asked')
    return {
      words: writingFormatLabel(),
      isShimmering: true,
      takeAPlace: true,
    };
  return stage.hasCallFailed
    ? {
        words: formatWritingProblemText('callFailed'),
        isShimmering: false,
        takeAPlace: true,
        doWordsWrap: true,
      }
    : {
        words: writeThisFormatLabel(),
        isShimmering: false,
        takeAPlace: false,
      };
}
export function CustomFormatRow({ list: list, isUnderEnter: isUnderEnter, rowToDialog: rowToDialog, ref: ref }: Dynamic) {
  let { entry: entry, stage: stage } = list;
  let isPatternTaken = entry !== null && (isAgentFormatWritten(entry) || isTypedPatternTaken(list));
  let stopTrailing = stopKeyHintOf({
    word: stopWritingFormulaLabel(),
    ...stopHintOfAgentRow(isPatternTaken ? null : (stage?.kind ?? null)),
  });
  if (entry !== null && isPatternTaken)
    return jsx(Menu.Item, {
      ref: ref,
      icon: 'Sliders',
      labelDir: 'auto',
      hint: patternExample(entry),
      hintDir: 'auto',
      keepOpen: true,
      ...CUSTOM_FORMAT_ROW_PROPS,
      ...((isAgentFormatWritten(entry) || isUnderEnter) && ROW_UNDER_ENTER_PROPS),
      onClick: list.take,
      children: jsx(WordsInTurn, {
        ...writtenFormatWords(entry),
      }),
    });
  if (stage === null || stage.kind === 'cameToNothing') return rowToDialog(customFormatRowProblemText(list));
  let isOffered = stage.kind === 'offered';
  return jsx(Menu.Item, {
    ref: ref,
    icon: jsx(OfferWand, {
      kind: stage.kind,
    }),
    keepOpen: true,
    ...CUSTOM_FORMAT_ROW_PROPS,
    label: '',
    ...(isEnterForOffer(stage, isUnderEnter) && ROW_UNDER_ENTER_PROPS),
    ...agentRowTrailingProps(stage.kind, stopTrailing),
    onClick: isOffered ? list.ask : list.stepBack,
    children: jsx(WordsInTurn, {
      ...agentRowWords(stage),
    }),
  });
}
export function CustomFormatRowInView(props?: Dynamic) {
  let { list: list } = props;
  let rowRef = React.useRef(null);
  let agentKind = isAgentBusyOrDone(list) ? list.entry?.agent?.kind : undefined;
  React.useLayoutEffect(() => {
    if (agentKind !== undefined)
      rowRef.current?.scrollIntoView({
        block: 'nearest',
      });
  }, [agentKind]);
  return jsx(CustomFormatRow, {
    ...props,
    ref: rowRef,
  });
}
export function CustomFormatListAnnouncer({ list: list }: Dynamic) {
  let { entry: entry } = list;
  let isPatternShown = entry !== null && (entry.agent?.kind !== 'wrote' || isAgentFormatWritten(entry));
  return jsxs(Fragment, {
    children: [
      jsx(CustomFormatAnnouncer, {
        entry: isPatternShown
          ? entry
          : {
              pattern: '',
              agent: null,
            },
        isOfferSaid: false,
        example: isPatternShown ? patternExample(entry) : '',
      }),
      jsx(LiveAnnouncer, {
        words: customFormatRowProblemText(list),
      }),
    ],
  });
}
export const writeThisFormatLabel = () =>
  translateMessage({
    defaultMessage: 'Write this format',
    id: 'kJZgFjVxco',
  });
export const writingFormatLabel = () =>
  translateMessage({
    defaultMessage: 'Writing a format…',
    id: 'p5Hhwaq81X',
  });
export const notAFormatAnnouncement = () =>
  translateMessage({
    defaultMessage: 'This isn’t a format. Press Enter to have Agent write one.',
    id: 'o9Pai+4K+d',
  });
export const formatCallFailedAnnouncement = () =>
  translateMessage({
    defaultMessage: 'Couldn’t write a format. Press Enter to try again.',
    id: 'Wr0uXzdBvJ',
  });
export const agentWritingFormatAnnouncement = () =>
  translateMessage({
    defaultMessage: 'Agent is writing the format. Press Escape to stop.',
    id: 'RdODbmvZWg',
  });
export const agentWroteFormatAnnouncement = (pattern?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Agent wrote {pattern}. Press Enter to apply it, or Escape to discard it.',
      id: '9kXOV5bfN+',
    },
    {
      pattern: pattern,
    },
  );
export const withoutOfferWhenTyping = (stage?: Dynamic, isTyping?: Dynamic) =>
  isTyping && stage?.kind === 'offered' ? null : stage;
export const OFFER_ENTER_DELAY_MS = 300;
export const isFieldInput = (target?: Dynamic) => target instanceof HTMLInputElement;
export const CUSTOM_FORMAT_ROW_ATTRIBUTE = 'data-is-custom-format-row';
export const CUSTOM_FORMAT_ROW_PROPS = {
  [CUSTOM_FORMAT_ROW_ATTRIBUTE]: '',
};
export const isEnterForOffer = (stage?: Dynamic, isEnterThisRows?: Dynamic) =>
  stage?.kind === 'offered' && (isEnterThisRows || stage.hasCallFailed);
export const customFormatActs = (actGate?: Dynamic, told?: Dynamic) => ({
  ask: () => told.onAgentAsked(actGate.howActBegan()),
  take(event?: Dynamic) {
    if (!actGate.isActRefused()) {
      if (event !== undefined) swallowRestOfPress(event);
      told.onTaken();
    }
    told.onEntered(actGate.howActBegan());
  },
  isActTooSoon() {
    if (!actGate.isActRefused()) return false;
    told.onActHeld(actGate.howActBegan());
    return true;
  },
});
export const isAgentFormatWritten = (entry?: Dynamic) => entry?.agent?.kind === 'wrote' && entry.reading.kind === 'numberFormat';
export const isTypedPatternTaken = ({ entry: entry, takesTypedPattern: takesTypedPattern }: Dynamic) =>
  takesTypedPattern && entry?.reading.kind === 'numberFormat' && entry.agent?.kind !== 'wrote';
export const patternExample = ({ reading: reading }: Dynamic) =>
  reading.kind === 'numberFormat' ? (reading.example?.trim() ?? '') : '';
export const hasOfferCallFailed = (stage?: Dynamic) => stage?.kind === 'offered' && stage.hasCallFailed;
export const isAgentBusyOrDone = ({ entry: entry, stage: stage }: Dynamic) =>
  stage?.kind === 'asked' || isAgentFormatWritten(entry) || hasOfferCallFailed(stage);
export const ROW_UNDER_ENTER_PROPS = {
  className: 'sheet-row-under-enter',
};
export const writtenFormatWords = (entry?: Dynamic) => ({
  words: entry.pattern.trim(),
  isShimmering: false,
  takeAPlace: false,
  doWordsWrap: true,
});
export const stopHintOfAgentRow = (stageKind?: Dynamic) => ({
  isShown: stageKind === 'asked',
  goesAtOnce: stageKind !== 'asked' && stageKind !== 'offered',
});
export const agentRowTrailingProps = (stageKind?: Dynamic, trailing?: Dynamic) => ({
  ...(trailing !== null && {
    trailing: trailing,
  }),
  ...(stageKind === 'asked' && {
    'aria-keyshortcuts': parseSingleShortcut('esc', false),
  }),
});
