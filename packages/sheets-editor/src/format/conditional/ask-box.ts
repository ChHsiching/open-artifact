import { Collapsible } from '../../kit/collapsible.tsx';
import { FieldDescription, FieldError, FieldRoot } from '../../kit/field.tsx';
import { TextInput } from '../../kit/text-input.tsx';
import { TextLink } from '../../kit/text-link.tsx';
import { useUiWindow } from '../../kit/theme.tsx';
import { Icon } from '../../kit/icon.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { cardRowFrameProps, CARD_ROW_HOVER_CLASSES } from '../../ui/card-rows.ts';
import {
  agentRowHighlightProps,
  agentRowButtonProps,
  SampleRow,
  agentRowClassProps,
  AskForMoreRow,
  useFocusAskField,
  askFieldKeyAction,
  useLastByKey,
  rowKeysStamp,
  useClickGuardOnComingRows,
  SuggestedHeading,
  LineWhileAgentLooks,
  AgentWritingRow,
  WriteWithAgentRow,
  AgentRowContent,
} from '../../agent/agent-rows.ts';
import { useCoarsePointer } from '../../app/media-queries.ts';
import { useSpentInputGuard } from '../../ui/ask-list/spent-input-guard.ts';
import { NO_LIST_ANSWER_TIMES, isTooSoonAfterListAnswer, reportTimeAfterNextPaint, isWithinClickAfterUp } from '../../ui/list-under-cell.ts';
import { ContentsBox } from '../../ui/contents-box.ts';
import { LiveAnnouncer } from '../../ui/live-announcer.ts';
export function withPointerAt(rest?: Dynamic, pointer?: Dynamic) {
  let at = {
    x: pointer.x,
    y: pointer.y,
  };
  if (rest.at === null)
    return {
      ...rest,
      at: at,
    };
  if (rest.at.x === at.x && rest.at.y === at.y) return rest;
  return {
    ...rest,
    at: at,
    lastMovedOnTo: {
      row: pointer.row,
    },
  };
}
export function AgentDraftRow(props?: Dynamic) {
  let { answer: answer, name: listName, isTakenByEnter: isTakenByEnter, onPressed: onPressed } = props;
  return jsxs('div', {
    className: 'sheet-comes-in-pane flex min-w-0 flex-col pb-2',
    children: [
      jsx('div', {
        className: `${cardRowFrameProps.className} ${CARD_ROW_HOVER_CLASSES} ${isTakenByEnter ? agentRowHighlightProps.className : ''}`,
        children: jsx('button', {
          type: 'button',
          'data-stop-of-walk': true,
          className: agentRowButtonProps.className,
          onKeyDown: (event?: Dynamic) => {
            if (event.repeat && event.key === 'Enter') event.preventDefault();
          },
          onClick: onPressed,
          children: jsx(SampleRow, {
            row: answer.toTake,
          }),
        }),
      }),
      answer.shown.length > 0 &&
        jsx('ul', {
          'aria-label': listName,
          className: 'flex flex-col',
          children: answer.shown.map(
            (row?: Dynamic) =>
              jsx(
                'li',
                {
                  className: cardRowFrameProps.className,
                  children: jsx('div', {
                    className: agentRowButtonProps.className,
                    children: jsx(SampleRow, {
                      row: row,
                    }),
                  }),
                },
                row.key,
              ),
          ),
        }),
    ],
  });
}
export function SuggestionRow(props?: Dynamic) {
  let { row: row, onPointedAt: onPointedAt, onTaken: onTaken } = props;
  let { key: key } = row;
  return jsx('li', {
    className: `${cardRowFrameProps.className} ${CARD_ROW_HOVER_CLASSES}`,
    children: jsx('button', {
      type: 'button',
      'data-stop-of-walk': true,
      'data-suggestion': true,
      className: agentRowButtonProps.className,
      onKeyDown: (event?: Dynamic) => {
        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
      },
      onPointerMove: () => onPointedAt(key),
      onPointerLeave: () => onPointedAt(null),
      onFocus: () => onPointedAt(key),
      onBlur: () => onPointedAt(null),
      onClick: () => onTaken(key),
      children: jsx(SampleRow, {
        row: row,
      }),
    }),
  });
}
export function AskForMoreButton(props?: Dynamic) {
  let { words: words, onAsked: onAsked } = props;
  return jsx('div', {
    className: `${cardRowFrameProps.className} ${CARD_ROW_HOVER_CLASSES}`,
    children: jsx('button', {
      type: 'button',
      'data-stop-of-walk': true,
      className: agentRowClassProps.className,
      onClick: onAsked,
      children: jsx(AskForMoreRow, {
        words: words,
      }),
    }),
  });
}
export function GoToChatInstead({ whyNotHere: whyNotHere, goThere: goThere, onTaken: onTaken, ...linkProps }: Dynamic) {
  return jsxs(Fragment, {
    children: [
      whyNotHere,
      ' ',
      jsx(TextLink, {
        inheritColor: true,
        className: 'whitespace-nowrap',
        onMouseDown: (event?: Dynamic) => event.preventDefault(),
        onClick: onTaken,
        ...linkProps,
        children: goThere,
      }),
    ],
  });
}
export function RuleAskBox(props?: Dynamic) {
  let {
    words: words,
    typed: typed,
    onTyped: onTyped,
    changesAskedFor: changesAskedFor,
    fieldRef: fieldRef,
    markOfStart: markOfStart,
    agent: agent,
    draft: draft,
  } = props;
  let { own: own, ofAgent: ofAgent, kindsToSetUp: kindsToSetUp, ofAgentRef: ofAgentRef, chatInstead: chatInstead } = props;
  let { onAsked: onAsked, onStopped: onStopped, onKept: onKept, onDiscarded: onDiscarded, onKindSetUp: onKindSetUp } = props;
  let { onTaken: onTaken, onAskedForMore: onAskedForMore, deafToPointer: deafToPointer } = props;
  let pointedRef = React.useRef(null);
  let pointAt = (key?: Dynamic) => {
    if (key !== null || pointedRef.current !== null) props.onPointedAt(key);
    pointedRef.current = key;
  };
  let isCoarse = useCoarsePointer();
  let [isFieldFocused, setFieldFocused] = React.useState(false);
  let [wordsAsked, setWordsAsked] = React.useState(null);
  let headingId = React.useId();
  let boxRef = React.useRef(null);
  let keepFieldFocus = useFocusAskField(fieldRef);
  let trimmed = typed.trim();
  let canAsk = agent !== 'writes' && draft === null;
  let hasFailed = agent === 'hasFailed';
  let isFailedForTyped = hasFailed && typed === wordsAsked;
  let isForChat = isFailedForTyped && chatInstead !== null;
  let ask = () => {
    if (trimmed === '' || !canAsk) return;
    keepFieldFocus();
    if (isForChat) return chatInstead.onAsked(trimmed);
    setWordsAsked(typed);
    return onAsked(trimmed);
  };
  let walkByArrows = (event?: Dynamic) => {
    let stops = [...(boxRef.current?.querySelectorAll('[data-stop-of-walk]') ?? [])];
    let stopIndex = stops.findIndex((stop?: Dynamic) => stop === event.target);
    if (stopIndex < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.length === 1 && event.key !== ' ' && event.target !== fieldRef.current)
      fieldRef.current?.focus({
        preventScroll: true,
      });
    if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || event.shiftKey) return;
    let nextStop = stops[stopIndex + (event.key === 'ArrowDown' ? 1 : -1)];
    event.stopPropagation();
    if (nextStop === undefined) return;
    event.preventDefault();
    nextStop.focus({
      focusVisible: true,
    });
  };
  let hasDraft = draft !== null;
  let spentPresses = useSpentInputGuard({
    box: boxRef,
    field: fieldRef,
    stands: agent === 'writes' ? 'whileAgentWrites' : hasDraft ? 'withAnswer' : 'otherwise',
  });
  let timesRef = React.useRef(NO_LIST_ANSWER_TIMES);
  let noteAct = (atMs?: Dynamic) => {
    timesRef.current = {
      ...timesRef.current,
      lastActAtMs: atMs,
    };
  };
  let pressRef = React.useRef(null);
  let isPressOnFieldRef = React.useRef(false);
  let pointerUpAtRef = React.useRef(null);
  let spaceDownAtRef = React.useRef(null);
  let lastPressRef = React.useRef(null);
  let isTooSoon = ({ beganAtMs: beganAtMs, actBeforeAtMs: actBeforeAtMs }: Dynamic) =>
    isTooSoonAfterListAnswer(
      {
        ...timesRef.current,
        lastActAtMs: actBeforeAtMs,
      },
      beganAtMs,
    );
  let keep = (press?: Dynamic) => {
    if (!isTooSoon(press)) onKept();
  };
  let askNow = (press?: Dynamic) => {
    if (!isFailedForTyped || !isTooSoon(press)) ask();
  };
  let isAgentWriting = agent === 'writes';
  let wasWritingRef = React.useRef(isAgentWriting);
  let pageWindow = useUiWindow();
  React.useLayoutEffect(() => {
    let isAnswerShown = hasDraft || hasFailed || (wasWritingRef.current && !isAgentWriting);
    wasWritingRef.current = isAgentWriting;
    if (!isAnswerShown) return;
    return reportTimeAfterNextPaint(pageWindow, (shownAtMs?: Dynamic) => {
      timesRef.current = {
        ...timesRef.current,
        answerShownAtMs: shownAtMs,
      };
    });
  }, [hasDraft, hasFailed, isAgentWriting, pageWindow]);
  let emptiedRef = React.useRef(null);
  let onFieldKeyDown = (event?: Dynamic) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return event.stopPropagation();
    let isUndoKey = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
    let undone = typed === '' ? undoneWordsFor(emptiedRef.current, changesAskedFor) : null;
    if (isUndoKey && undone !== null) {
      event.preventDefault();
      event.stopPropagation();
      spentPresses.forget();
      pointAt(null);
      onTyped(undone);
      emptiedRef.current = null;
      return;
    }
    let press = {
      beganAtMs: event.timeStamp,
      actBeforeAtMs: timesRef.current.lastActAtMs,
      isByMouse: false,
    };
    if (event.key === 'Enter') noteAct(event.timeStamp);
    let isEnterSpent = event.key === 'Enter' ? spentPresses.isEnterSpent() : spentPresses.forget();
    let stands = draft !== null ? 'withDraft' : canAsk ? 'atRest' : 'whileAgentWrites';
    let isUndoOrRedoKey = (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase());
    let keyAct = askFieldKeyAction(event, {
      typed: typed,
      stands: isUndoOrRedoKey && stands === 'withDraft' ? 'atRest' : stands,
    });
    if (keyAct === null) return;
    event.stopPropagation();
    if (keyAct === 'isOfField') return;
    event.preventDefault();
    if (keyAct === 'ask' && isEnterSpent !== true) askNow(press);
    if (keyAct === 'keep' && isEnterSpent !== true) keep(press);
    if (keyAct === 'empty') {
      emptiedRef.current = {
        words: typed,
        changesAskedFor: changesAskedFor,
      };
      onTyped('');
    }
    return;
  };
  let isAtRest = canAsk && trimmed === '';
  let isMoreLookedFor = props.moreOfAgent === 'isLookedFor';
  let more = isMoreLookedFor ? null : props.moreOfAgent;
  let hasSuggestions = ofAgent.length > 0 || more !== null;
  let shownSuggestions = useLastByKey(
    hasSuggestions
      ? {
          rows: ofAgent,
          more: more,
        }
      : null,
    ({ rows: rows, more: more2 }: Dynamic) => `${more2} ${rowKeysStamp(rows)}`,
  ) ?? {
    rows: [],
    more: null,
  };
  let shownRows = useLastByKey(ofAgent.length > 0 ? ofAgent : null, rowKeysStamp) ?? [];
  let suggestionsRef = React.useRef(null);
  let moreSuggestionsRef = React.useRef(null);
  let rowsEaseIn = useClickGuardOnComingRows({
    rows: ofAgent,
    whereRowsCome: suggestionsRef,
    easeInMs: own.length === 0 ? 0 : SUGGESTIONS_EASE_IN_MS,
  });
  let rowsKey = rowKeysStamp(ofAgent);
  let answerShownAtRef = React.useRef(Number.NEGATIVE_INFINITY);
  let answerKey = isAtRest ? rowsKey : '';
  let answerKeyRef = React.useRef(answerKey);
  React.useLayoutEffect(() => {
    let lastAnswerKey = answerKeyRef.current;
    answerKeyRef.current = answerKey;
    if (answerKey === '' || answerKey === lastAnswerKey) return;
    let isMotionReduced = pageWindow?.matchMedia('(prefers-reduced-motion:reduce)').matches === true;
    return reportTimeAfterNextPaint(pageWindow, (shownAtMs?: Dynamic) => {
      answerShownAtRef.current = shownAtMs + (isMotionReduced ? 0 : SUGGESTIONS_EASE_IN_MS);
    });
  }, [answerKey, pageWindow]);
  let take = (key?: Dynamic) => {
    let lastPress = lastPressRef.current;
    if (
      !(
        lastPress !== null &&
        ofAgent.some((row?: Dynamic) => row.key === key) &&
        isTooSoonAfterListAnswer(
          {
            answerShownAtMs: answerShownAtRef.current,
            lastActAtMs: lastPress.actBeforeAtMs,
          },
          lastPress.beganAtMs,
        )
      )
    )
      onTaken(key);
  };
  let pointerRestRef = React.useRef(NO_POINTER_REST);
  let isPointerAway = (target?: Dynamic) => {
    let row = suggestionButtonOf(target);
    return row !== null && !isPointerStillOn(pointerRestRef.current, row);
  };
  let rowsChangeKey = `${isAtRest} ${rowKeysStamp(own)} ${rowsKey}`;
  let rowsChangeKeyRef = React.useRef(rowsChangeKey);
  React.useLayoutEffect(() => {
    if (rowsChangeKey === rowsChangeKeyRef.current) return;
    rowsChangeKeyRef.current = rowsChangeKey;
    pointerRestRef.current = withRowsChanged(pointerRestRef.current);
  }, [rowsChangeKey]);
  React.useEffect(() => {
    let ownerDocument = boxRef.current?.ownerDocument;
    let wheelAt: Dynamic = Number.NEGATIVE_INFINITY;
    let onWheel = ({ timeStamp: timeStamp }: Dynamic) => {
      wheelAt = timeStamp;
    };
    let onScroll = ({ target: target, timeStamp: timeStamp }: Dynamic) => {
      let { at: pointerAt } = pointerRestRef.current;
      if (pointerAt === null || !(target instanceof Node) || !target.contains(boxRef.current)) return;
      let isWheelScroll = timeStamp - wheelAt < SCROLL_AFTER_WHEEL_MS;
      if (isWheelScroll) wheelAt = timeStamp;
      let elementUnderPointer = isWheelScroll ? (ownerDocument?.elementFromPoint(pointerAt.x, pointerAt.y) ?? null) : null;
      pointerRestRef.current = withMovedOnTo(pointerRestRef.current, elementUnderPointer === null ? null : suggestionButtonOf(elementUnderPointer));
    };
    let onPointerMove = (event?: Dynamic) => {
      if (event.pointerType !== 'mouse' || event.buttons !== 0 || event.target === null) return;
      let [clientX, clientY] = [event.clientX, event.clientY];
      pointerRestRef.current = withPointerAt(pointerRestRef.current, {
        x: clientX,
        y: clientY,
        row: suggestionButtonOf(event.target),
      });
    };
    ownerDocument?.addEventListener('pointermove', onPointerMove, {
      capture: true,
      passive: true,
    });
    ownerDocument?.addEventListener('wheel', onWheel, {
      capture: true,
      passive: true,
    });
    ownerDocument?.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      ownerDocument?.removeEventListener('pointermove', onPointerMove, {
        capture: true,
      });
      ownerDocument?.removeEventListener('wheel', onWheel, {
        capture: true,
      });
      ownerDocument?.removeEventListener('scroll', onScroll, {
        capture: true,
      });
    };
  }, []);
  let focusField = React.useCallback(() => {
    ((isCoarse ? null : fieldRef.current) ?? boxRef.current?.querySelector('button[data-stop-of-walk]'))?.focus({
      preventScroll: true,
    });
  }, [isCoarse, fieldRef]);
  React.useLayoutEffect(() => {
    let hasFocusInSuggestions = [suggestionsRef.current, moreSuggestionsRef.current].some(
      (list?: Dynamic) => list?.contains(list.ownerDocument.activeElement) === true,
    );
    if (!hasSuggestions && hasFocusInSuggestions) focusField();
  }, [hasSuggestions, focusField]);
  let suggestionRow2 = (row?: Dynamic) =>
    jsx(
      SuggestionRow,
      {
        row: row,
        onPointedAt: pointAt,
        onTaken: take,
      },
      row.key,
    );
  let moreState = own.length === 0 ? shownSuggestions.more : more;
  let moreFailedNote =
    moreState === 'hasFailed' &&
    jsx('p', {
      'aria-hidden': true,
      className: 'pt-1 ps-lg pe-md text-footnote text-secondary',
      children: words.moreHasFailed,
    });
  let askForMore =
    moreState !== null &&
    jsx(AskForMoreButton, {
      words: words,
      onAsked: () => {
        focusField();
        onAskedForMore();
      },
    });
  let suggestedHeading = (isSaidInFull?: Dynamic) =>
    jsx(SuggestedHeading, {
      id: headingId,
      words: words,
      isSaidInFull: isSaidInFull,
    });
  return jsxs(ContentsBox, {
    ref: boxRef,
    onKeyDown: walkByArrows,
    onPointerDownCapture: (event?: Dynamic) => {
      if (event.isPrimary) {
        pressRef.current = {
          beganAtMs: event.timeStamp,
          actBeforeAtMs: timesRef.current.lastActAtMs,
          isByMouse: event.pointerType === 'mouse',
        };
        pointerUpAtRef.current = null;
        isPressOnFieldRef.current = event.target instanceof Element && event.target.closest('[data-ui=TextInput]') !== null;
        if (!isPressOnFieldRef.current) noteAct(event.timeStamp);
      }
      deafToPointer.onPointerDownCapture(event);
      rowsEaseIn.onPointerDownCapture(event);
    },
    onKeyDownCapture: (event?: Dynamic) => {
      if (event.target !== fieldRef.current) spentPresses.forget();
      pressRef.current = null;
      if (event.key !== ' ' || event.target === fieldRef.current) spaceDownAtRef.current = null;
      else if (!event.repeat) spaceDownAtRef.current = event.timeStamp;
      deafToPointer.onKeyDownCapture();
    },
    onKeyUpCapture: (event?: Dynamic) => {
      if (event.key === ' ')
        setTimeout(() => {
          spaceDownAtRef.current = null;
        });
    },
    onPointerMoveCapture: spentPresses.onPointerMoved,
    onBlurCapture: (event?: Dynamic) => {
      spentPresses.onCaretLeft(event);
      if (!(event.relatedTarget instanceof Node && boxRef.current?.contains(event.relatedTarget) === true)) spaceDownAtRef.current = null;
    },
    onMouseDownCapture: (event?: Dynamic) => {
      deafToPointer.onMouseDownCapture(event);
      if (pressRef.current?.isByMouse === true && isPointerAway(event.target)) event.preventDefault();
    },
    onPointerUpCapture: (event?: Dynamic) => {
      deafToPointer.onPointerUpCapture(event);
      rowsEaseIn.onPointerUpCapture(event);
      if (!event.isPrimary) return;
      pointerUpAtRef.current = event.timeStamp;
      if (!isPressOnFieldRef.current) noteAct(event.timeStamp);
      if (event.button !== 0) pressRef.current = null;
    },
    onPointerCancelCapture: (event?: Dynamic) => {
      spentPresses.forget();
      deafToPointer.onPointerCancelCapture();
      if (!event.isPrimary || pressRef.current === null) return;
      pressRef.current = null;
      if (!isPressOnFieldRef.current) noteAct(event.timeStamp);
    },
    onClickCapture: (event?: Dynamic) => {
      let pointerUpAt = pointerUpAtRef.current;
      let pointerPress = pointerUpAt === null || isWithinClickAfterUp(pointerUpAt, event.timeStamp) ? pressRef.current : null;
      lastPressRef.current = pointerPress ?? {
        beganAtMs: spaceDownAtRef.current ?? event.timeStamp,
        actBeforeAtMs: timesRef.current.lastActAtMs,
        isByMouse: false,
      };
      pressRef.current = null;
      spaceDownAtRef.current = null;
      let isOnField = event.target instanceof Element && event.target.closest('[data-ui=TextInput]') !== null;
      if (!isOnField && !(pointerPress !== null && isPressOnFieldRef.current)) noteAct(event.timeStamp);
      if (isOnField) spentPresses.forget();
      else if (
        spentPresses.isPressSpent({
          clientX: event.clientX,
          clientY: event.clientY,
          isByMouse: lastPressRef.current.isByMouse,
          wentDownAtMs: lastPressRef.current.beganAtMs,
          shownAtMs: timesRef.current.answerShownAtMs,
        })
      ) {
        event.stopPropagation();
        keepFieldFocus();
      }
      deafToPointer.onClickCapture(event);
      rowsEaseIn.onClickCapture(event);
      if (lastPressRef.current.isByMouse && isPointerAway(event.target)) event.stopPropagation();
    },
    children: [
      jsxs('section', {
        className: 'flex min-w-0 shrink-0 flex-col pt-md',
        children: [
          agent !== null &&
            jsxs(FieldRoot, {
              invalid: isFailedForTyped && !isForChat,
              className: `${cardRowFrameProps.className} flex-col items-stretch px-2`,
              children: [
                jsxs('div', {
                  className: 'relative',
                  children: [
                    jsx(TextInput, {
                      ref: fieldRef,
                      'data-stop-of-walk': true,
                      fullWidth: true,
                      dir: 'auto',
                      'aria-label': words.placeholder,
                      autoComplete: 'off',
                      spellCheck: false,
                      enterKeyHint: 'go',
                      placeholder: words.placeholder,
                      readOnly: agent === 'writes',
                      value: typed,
                      ...(!isCoarse && markOfStart),
                      onFocus: () => setFieldFocused(true),
                      onBlur: () => {
                        emptiedRef.current = null;
                        setFieldFocused(false);
                      },
                      onChange: (event?: Dynamic) => {
                        emptiedRef.current = null;
                        pointAt(null);
                        if (draft !== null) onDiscarded();
                        onTyped(event.target.value);
                      },
                      onKeyDown: onFieldKeyDown,
                    }),
                    isMoreLookedFor &&
                      jsx(LineWhileAgentLooks, {
                        isOnBox: true,
                      }),
                  ],
                }),
                isFailedForTyped &&
                  !isForChat &&
                  jsx(FieldError, {
                    match: true,
                    className: 'leading-4',
                    children: words.hasFailed,
                  }),
                isForChat &&
                  jsx(FieldDescription, {
                    className: 'leading-4',
                    children: jsx(GoToChatInstead, {
                      whyNotHere: chatInstead.whyNotHere,
                      goThere: chatInstead.goThere,
                      'data-stop-of-walk': true,
                      onTaken: () => {
                        if (lastPressRef.current !== null) askNow(lastPressRef.current);
                      },
                    }),
                  }),
              ],
            }),
          jsxs('div', {
            className: 'flex min-w-0 flex-col pt-2',
            children: [
              agent === 'writes' &&
                jsx(AgentWritingRow, {
                  words: words,
                  onStopped: () => {
                    keepFieldFocus();
                    onStopped();
                  },
                }),
              canAsk &&
                agent !== null &&
                trimmed !== '' &&
                !isForChat &&
                jsx('div', {
                  className: `${cardRowFrameProps.className} ${CARD_ROW_HOVER_CLASSES} ${isFieldFocused ? agentRowHighlightProps.className : ''}`,
                  children: jsx('button', {
                    type: 'button',
                    'data-stop-of-walk': true,
                    className: agentRowClassProps.className,
                    onClick: () => {
                      if (lastPressRef.current !== null) askNow(lastPressRef.current);
                    },
                    children: jsx(WriteWithAgentRow, {
                      words: words,
                    }),
                  }),
                }),
              draft !== null &&
                jsx(AgentDraftRow, {
                  answer: draft,
                  name: words.draftSaid,
                  isTakenByEnter: isFieldFocused,
                  onPressed: () => {
                    if (lastPressRef.current !== null) keep(lastPressRef.current);
                  },
                }),
              agent !== 'writes' &&
                kindsToSetUp.map(
                  ({ key: key, icon: icon, label: label }: Dynamic, index?: Dynamic) =>
                    jsx(
                      'div',
                      {
                        className: `${cardRowFrameProps.className} ${CARD_ROW_HOVER_CLASSES}`,
                        children: jsx('button', {
                          type: 'button',
                          'data-stop-of-walk': true,
                          className: agentRowClassProps.className,
                          ...(index === 0 && (agent === null || isCoarse) && markOfStart),
                          onKeyDown: (event?: Dynamic) => {
                            if (event.repeat && event.key === 'Enter') event.preventDefault();
                          },
                          onClick: () => onKindSetUp(key),
                          children: jsx(AgentRowContent, {
                            icon: jsx(Icon, {
                              name: icon,
                              size: 'md',
                            }),
                            children: label,
                          }),
                        }),
                      },
                      key,
                    ),
                ),
            ],
          }),
        ],
      }),
      isAtRest &&
        own.length === 0 &&
        jsx(Collapsible.Root, {
          open: hasSuggestions,
          children: jsx(Collapsible.Panel, {
            ref: suggestionsRef,
            inert: !hasSuggestions,
            children: jsxs('section', {
              className: 'flex min-w-0 shrink-0 flex-col pb-2',
              children: [
                moreFailedNote,
                askForMore,
                shownSuggestions.rows.length > 0 && suggestedHeading(true),
                jsx(Collapsible.Root, {
                  open: ofAgent.length > 0,
                  children: jsx(Collapsible.Panel, {
                    inert: ofAgent.length === 0,
                    children: jsx('ul', {
                      ref: ofAgentRef,
                      'aria-labelledby': headingId,
                      className: 'flex flex-col',
                      children: shownRows.map((row?: Dynamic) => suggestionRow2(row)),
                    }),
                  }),
                }),
              ],
            }),
          }),
        }),
      isAtRest &&
        own.length > 0 &&
        jsxs('section', {
          className: 'flex min-w-0 shrink-0 flex-col pb-2',
          children: [
            suggestedHeading(false),
            jsx(Collapsible.Root, {
              open: ofAgent.length > 0,
              children: jsx(Collapsible.Panel, {
                ref: suggestionsRef,
                inert: ofAgent.length === 0,
                children: jsx('ul', {
                  ref: ofAgentRef,
                  'aria-label': words.suggestedSaid,
                  className: 'flex flex-col',
                  children: shownRows.slice(0, 1).map((row?: Dynamic) => suggestionRow2(row)),
                }),
              }),
            }),
            jsx('ul', {
              'aria-labelledby': headingId,
              className: 'flex flex-col',
              children: own.map((row?: Dynamic) => suggestionRow2(row)),
            }),
            jsx(Collapsible.Root, {
              open: ofAgent.length > 1,
              children: jsx(Collapsible.Panel, {
                ref: moreSuggestionsRef,
                inert: ofAgent.length < 2,
                children: jsx('ul', {
                  'aria-label': words.suggestedSaid,
                  className: 'flex flex-col',
                  children: shownRows.slice(1).map((row?: Dynamic) => suggestionRow2(row)),
                }),
              }),
            }),
            moreFailedNote,
            askForMore,
          ],
        }),
      jsx(LiveAnnouncer, {
        words: isForChat && goToChatInsteadWords(chatInstead),
      }),
    ],
  });
}
export const NO_POINTER_REST = {
  at: null,
  lastMovedOnTo: null,
  haveRowsChanged: false,
};
export const withRowsChanged = (rest?: Dynamic) => ({
  ...rest,
  haveRowsChanged: true,
});
export const withMovedOnTo = (rest?: Dynamic, row?: Dynamic) => ({
  ...rest,
  lastMovedOnTo: {
    row: row,
  },
});
export const isPointerStillOn = (rest?: Dynamic, row?: Dynamic) =>
  rest.lastMovedOnTo === null ? !rest.haveRowsChanged : rest.lastMovedOnTo.row === row;
export const SUGGESTIONS_EASE_IN_MS = 200;
export const SCROLL_AFTER_WHEEL_MS = 300;
export const suggestionButtonOf = (target?: Dynamic) =>
  target instanceof Element ? target.closest('button[data-suggestion]') : null;
export const undoneWordsFor = (emptied?: Dynamic, changesAskedFor?: Dynamic) =>
  emptied?.changesAskedFor === changesAskedFor ? emptied.words : null;
export const goToChatInsteadWords = ({ whyNotHere: whyNotHere, goThere: goThere }: Dynamic) => `${whyNotHere} ${goThere}`;
