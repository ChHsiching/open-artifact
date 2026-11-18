import { ShimmerText } from '../kit/shimmer-text.tsx';
import { AgentMark } from '../kit/agent-mark.tsx';
import { useUiWindow } from '../kit/theme.tsx';
import { Shortcut } from '../kit/shortcut.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { CardRowTexts, CardSectionHeading, cardRowFrameProps, cardRowButtonProps } from '../ui/card-rows.ts';
import { STANDS_FOR_BUTTON_PROPS } from '../ui/ask-list/spent-input-guard.ts';
import { useCoarsePointer } from '../app/media-queries.ts';
import { isPressTaken } from '../ui/ask-agent-to-fix-button.ts';
import { isRepeatedEnterOrSpace } from '../ui/repeated-key-guards.ts';
import { reportTimeAfterNextPaint, isWithinClickAfterUp, isWithinPressGuard } from '../ui/list-under-cell.ts';
export function SampleRow({ row: row }: Dynamic) {
  let { sample: sample, title: title, second: second } = row;
  return jsxs(Fragment, {
    children: [
      sample,
      jsx(CardRowTexts, {
        title: title,
        ...(second !== undefined && {
          second: second,
        }),
      }),
    ],
  });
}
export function stopKeyHintOf({
  word: word,
  isSmall: isSmall = false,
  keyInWords: keyInWords,
  isKeyUnheard: isKeyUnheard = false,
  isShown: isShown,
  goesAtOnce: goesAtOnce = false,
}: Dynamic) {
  let [shownState, setShownState] = React.useState({
    wasShown: isShown,
    isGoing: false,
  });
  let isGoing = !goesAtOnce && (shownState.wasShown === isShown ? shownState.isGoing : !isShown);
  if (shownState.wasShown !== isShown || shownState.isGoing !== isGoing)
    setShownState({
      wasShown: isShown,
      isGoing: isGoing,
    });
  if (!isShown && !isGoing) return null;
  let hint = jsxs('span', {
    'data-size': isSmall ? 'xs' : undefined,
    className:
      '-my-1 flex flex-none items-center font-control text-body font-normal whitespace-nowrap text-primary [--ui-shortcut-cap-ink:var(--ui-text-secondary)]',
    children: [
      word,
      keyInWords !== undefined &&
        !isKeyUnheard &&
        jsxs('span', {
          className: 'sr-only pointer-coarse:hidden',
          children: [' ', keyInWords],
        }),
      !isKeyUnheard &&
        jsx(Shortcut, {
          'aria-hidden': true,
          keys: 'esc',
          className: 'ms-1 pointer-coarse:hidden',
        }),
    ],
  });
  if (isShown)
    return jsx(
      'span',
      {
        ...STANDS_FOR_BUTTON_PROPS,
        className: 'sheet-stop-that-comes -my-2 -me-2 flex flex-none self-center py-2 pe-2',
        children: hint,
      },
      'shown',
    );
  return jsx(
    'span',
    {
      'aria-hidden': true,
      className: 'relative flex-none',
      children: jsx('span', {
        ref: (element?: Dynamic) => {
          let view = element?.ownerDocument.defaultView;
          if (element !== null && view?.getComputedStyle(element).animationName === 'none')
            setShownState({
              wasShown: false,
              isGoing: false,
            });
        },
        className: 'sheet-stop-that-goes flex',
        onAnimationEnd: () =>
          setShownState({
            wasShown: false,
            isGoing: false,
          }),
        children: hint,
      }),
    },
    'going',
  );
}
export function AgentRowContent(props?: Dynamic) {
  let { icon: icon, isAmongSamples = false, end: end, children: children } = props;
  return jsxs(Fragment, {
    children: [
      jsx('span', {
        className: `flex flex-none items-center justify-center ${isAmongSamples ? 'me-2 w-8' : 'size-icon'}`,
        children: icon,
      }),
      jsx('span', {
        className: 'min-w-0 flex-1 truncate',
        children: children,
      }),
      end,
    ],
  });
}
export function SuggestedHeading(props?: Dynamic) {
  let { id: id, words: words, isSaidInFull: isSaidInFull } = props;
  return jsx(CardSectionHeading, {
    id: id,
    className: 'sheet-comes-in-pane',
    children: isSaidInFull
      ? jsx(DrawnAndSaid, {
          drawn: words.suggested,
          said: words.suggestedSaid,
        })
      : jsx('span', {
          children: words.suggested,
        }),
  });
}
export function AgentWritingRow(props?: Dynamic) {
  let { words: words, isAmongRowsOfList = false, sizeOfWandInList = 14, onStopped: onStopped } = props;
  let { isStopARow = false } = props;
  let isCoarsePointer2 = useCoarsePointer();
  let win = useUiWindow();
  let nowMs2 = () => (win ?? globalThis).performance.now();
  let mountedAtRef = React.useRef(Number.NEGATIVE_INFINITY);
  React.useLayoutEffect(() => {
    mountedAtRef.current = (win ?? globalThis).performance.now();
  }, [win]);
  let downAtRef = React.useRef(null);
  let stopPressProps = {
    onPointerDown: ({ isPrimary: isPrimary, button: button }: Dynamic) => {
      downAtRef.current = isPrimary && button === 0 ? nowMs2() : null;
    },
    onPointerCancel: () => {
      downAtRef.current = null;
    },
    onMouseDown: (event?: Dynamic) => {
      if (!isPressTaken(mountedAtRef.current, downAtRef.current, nowMs2())) event.preventDefault();
    },
    onClick: () => {
      let isTaken = isPressTaken(mountedAtRef.current, downAtRef.current, nowMs2());
      downAtRef.current = null;
      if (isTaken) onStopped();
    },
  };
  let writingText = jsx(ShimmerText, {
    children: words.writes,
  });
  let stopButton = jsx(Button, {
    variant: 'ghost',
    ...(!isCoarsePointer2 &&
      !isAmongRowsOfList && {
        size: 'xs',
      }),
    shortcut: 'esc',
    ...stopPressProps,
    children: words.stop,
  });
  let writingLine = jsxs('div', {
    className: 'flex min-h-control w-full items-center gap-2 px-md py-1 text-body text-primary',
    children: [
      jsx('span', {
        className: 'flex w-5 flex-none justify-center',
        children: jsx(AgentMark, {
          size: sizeOfWandInList,
        }),
      }),
      jsx('span', {
        className: 'min-w-0 flex-1 truncate',
        children: writingText,
      }),
      !isStopARow &&
        jsx('span', {
          className: '-my-1 -me-1.25 flex flex-none',
          children: stopButton,
        }),
    ],
  });
  if (isAmongRowsOfList && isStopARow)
    return jsxs(Fragment, {
      children: [
        writingLine,
        jsxs('button', {
          type: 'button',
          className:
            'flex min-h-control w-full items-center gap-2 rounded px-md py-1 text-start font-control text-body font-normal text-primary select-none outline-fill-accent hover:bg-fill-ghost-hover focus-visible:outline-2 focus-visible:-outline-offset-2',
          ...stopPressProps,
          children: [
            jsx('span', {
              className: 'w-5 flex-none',
            }),
            jsx('span', {
              className: 'min-w-0 flex-1 truncate',
              children: words.stop,
            }),
            jsx('span', {
              className: 'shrink-0 text-footnote text-muted',
              children: jsx(Shortcut, {
                'aria-hidden': true,
                keys: 'esc',
                variant: 'text',
                className: 'pointer-coarse:hidden',
              }),
            }),
          ],
        }),
      ],
    });
  if (isAmongRowsOfList) return writingLine;
  return jsx('div', {
    className: cardRowFrameProps.className,
    children: jsx('div', {
      className: agentRowClassProps.className,
      children: jsx(AgentRowContent, {
        icon: jsx(AgentMark, {
          size: AGENT_ROW_WAND_SIZE,
        }),
        end: stopButton,
        children: writingText,
      }),
    }),
  });
}
export function KeepOrDiscardBar({ words: words, onKept: onKept, onDiscarded: onDiscarded }: Dynamic) {
  return jsxs('div', {
    className: 'sheet-comes-in-pane flex items-center justify-end gap-xs',
    children: [
      jsx(Button, {
        variant: 'ghost',
        shortcut: 'esc',
        onClick: onDiscarded,
        children: words.discard,
      }),
      jsx(Button, {
        variant: 'primary',
        shortcut: 'enter',
        onClick: onKept,
        children: words.keep,
      }),
    ],
  });
}
export function askFieldKeyAction(event?: Dynamic, field?: Dynamic) {
  let { typed: typed, stands: stands, isRowHighlighted = false } = field;
  if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase()))
    return stands === 'atRest' && typed !== '' ? 'isOfField' : null;
  if (event.key === 'Enter') {
    if (isRepeatedEnterOrSpace(event) || stands === 'whileAgentWrites') return 'nothing';
    if (stands === 'withDraft') return 'keep';
    if (isRowHighlighted) return null;
    return typed.trim() === '' ? 'nothing' : 'ask';
  }
  if (event.key !== 'Escape' || stands !== 'atRest' || typed === '') return null;
  return event.repeat ? 'nothing' : 'empty';
}
export function useFocusAskField(fieldRef?: Dynamic) {
  let isCoarsePointer2 = useCoarsePointer();
  return () => {
    if (!isCoarsePointer2)
      fieldRef.current?.focus({
        preventScroll: true,
      });
  };
}
export function useLastByKey(value?: Dynamic, keyOf?: Dynamic) {
  let [lastNonNull, setLastNonNull] = React.useState(value);
  if (value !== null && (lastNonNull === null || keyOf(value) !== keyOf(lastNonNull))) setLastNonNull(value);
  return value ?? lastNonNull;
}
export function clampedEventTime(timeStamp?: Dynamic) {
  let nowMs2 = performance.now();
  return timeStamp <= nowMs2 && nowMs2 - timeStamp <= CLICK_TIME_SKEW_MS ? timeStamp : nowMs2;
}
export function useClickGuardOnComingRows({ rows: rows, whereRowsCome: whereRowsCome, easeInMs: easeInMs }: Dynamic) {
  let win = useUiWindow();
  let rowsCameAtRef = React.useRef(-1 / 0);
  let pressRef = React.useRef(null);
  let rowKeys = rowKeysStamp(rows);
  React.useLayoutEffect(
    () =>
      rowKeys === ''
        ? undefined
        : reportTimeAfterNextPaint(win, (atMs?: Dynamic) => {
            rowsCameAtRef.current = atMs;
          }),
    [rowKeys, win],
  );
  return {
    onPointerDownCapture: ({ timeStamp: timeStamp, isPrimary: isPrimary }: Dynamic) => {
      if (isPrimary)
        pressRef.current = {
          atMs: clampedEventTime(timeStamp),
          endedAtMs: null,
        };
    },
    onPointerUpCapture: ({ timeStamp: timeStamp, isPrimary: isPrimary }: Dynamic) => {
      if (isPrimary && pressRef.current !== null) pressRef.current.endedAtMs = clampedEventTime(timeStamp);
    },
    onClickCapture: (event?: Dynamic) => {
      let [press, rowsStart, { target: target }] = [pressRef.current, whereRowsCome.current, event];
      pressRef.current = null;
      if (press === null || press.endedAtMs === null) return;
      if (!isWithinClickAfterUp(press.endedAtMs, clampedEventTime(event.timeStamp))) return;
      let isOnComingRows =
        target instanceof Node &&
        (target === rowsStart || ((rowsStart?.compareDocumentPosition(target) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
      let prefersReducedMotion2 = win?.matchMedia('(prefers-reduced-motion:reduce)').matches === true;
      let isGuarded = isRowsEaseInGuarded(rowsCameAtRef.current, {
        atMs: press.atMs,
        easeInMs: prefersReducedMotion2 ? 0 : easeInMs,
      });
      if (isOnComingRows && isGuarded) event.stopPropagation();
    },
  };
}
export const StopKeyHint = (props?: Dynamic) => stopKeyHintOf(props);
export const DrawnAndSaid = ({ drawn: drawn, said: said }: Dynamic) =>
  jsxs('span', {
    className: 'relative',
    children: [
      jsx('span', {
        'aria-hidden': true,
        children: drawn,
      }),
      jsx('span', {
        className: 'absolute inset-0 overflow-hidden whitespace-nowrap opacity-0 select-none',
        children: said,
      }),
    ],
  });
export const rowKeysStamp = (rows?: Dynamic) => rows.map(({ key: key }: Dynamic) => key).join();
export const agentRowButtonProps = cardRowButtonProps;
export const AGENT_ROW_WAND_SIZE = 14;
export const agentRowClassProps = {
  className:
    'flex min-h-control min-w-0 flex-1 cursor-default items-center gap-xs rounded px-2 text-start font-control text-body font-normal text-primary outline-none focus-visible:shadow-focus focus-visible:outline-hidden pointer-coarse:min-h-12',
};
export const WriteWithAgentRow = ({ words: words }: Dynamic) =>
  jsx(AgentRowContent, {
    icon: jsx(AgentMark, {
      size: AGENT_ROW_WAND_SIZE,
    }),
    children: words.write,
  });
export const agentRowHighlightProps = {
  className:
    'bg-fill-ghost-selected forced-colors:outline-2 forced-colors:-outline-offset-2 forced-colors:outline-[color:Highlight] forced-colors:outline-solid',
};
export const AskForMoreRow = ({ words: words }: Dynamic) =>
  jsx(AgentRowContent, {
    icon: jsx(AgentMark, {
      size: AGENT_ROW_WAND_SIZE,
    }),
    isAmongSamples: true,
    children: words.askForMore,
  });
export const LineWhileAgentLooks = ({ isOnBox = false }: Dynamic) =>
  jsx('span', {
    'aria-hidden': true,
    className: 'sheet-line-while-agent-looks',
    'data-is-on-box': isOnBox || undefined,
  });
export const isRowsEaseInGuarded = (sinceMs?: Dynamic, click?: Dynamic) => isWithinPressGuard(sinceMs + click.easeInMs, click.atMs);
export const CLICK_TIME_SKEW_MS = 1000;
