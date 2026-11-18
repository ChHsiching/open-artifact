import { shortcutKeycapClassName } from '../kit/shortcut.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { entryGridlineOverlap, cellEntryBoxStyle } from '../grid/grid-drawing.ts';
import { entryFontStyle } from '../grid/cell-drawing.ts';
import { afterNextFrameOrTimeout } from '../utils/next-frame.ts';
import { isSameCell } from '../selection/model.ts';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useSuggestionLabel, suggestionGoneText, suggestionHeardAs, tabKeyLabel } from '../i18n/menu-labels.ts';
import { OFFER_ANNOUNCE_DELAY_MS } from '../formulas/from-words/offer-list.ts';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
import { TAP_HOLD_LIMIT_MS } from '../selection/finger-taps.ts';
export function wordsOfferedPlaceProps({
  body: body,
  editorKeepsClear: editorKeepsClear,
  editorBox: editorBox,
  editorScale: editorScale,
  editorFormat: editorFormat,
}: Dynamic) {
  if (editorBox === null) return null;
  return {
    'data-starts-on-line-at-left': entryGridlineOverlap(editorBox, editorScale).x > 0 || undefined,
    style: {
      ...cellEntryBoxStyle(editorBox, body, editorFormat, editorKeepsClear, {
        lineCount: 1,
        foldsAt: null,
        scale: editorScale,
      }),
      ...entryFontStyle(editorFormat.font, false),
    },
  };
}
export function WordsOffered({ grid: grid, offered: offered, isKeyDrawn: isKeyDrawn, store: store }: Dynamic) {
  let { body: body, clearBodyHeight: clearBodyHeight, editorLineCount: editorLineCount, editorScale: editorScale } = grid;
  let wordsRef = React.useRef(null);
  let [bodyRight, bodyBottom] = [body.left + body.width + 1, body.top + clearBodyHeight + 1];
  React.useLayoutEffect(() => {
    if (offered === null) return;
    let wordsElement = wordsRef.current;
    let editorElement = wordsElement?.nextElementSibling ?? null;
    if (
      !(
        editorLineCount === 1 &&
        wordsElement !== null &&
        editorElement !== null &&
        doWordsOfferedFit(wordsElement, editorElement, {
          right: bodyRight,
          bottom: bodyBottom,
          scale: editorScale,
        })
      )
    )
      store.dispatch({
        kind: 'wordsOfferedWithdrawn',
        isOutOfView: true,
      });
  });
  let [offeredCellId, offeredTyped, offeredWords] = [offered?.cellId, offered?.typed, offered?.offered];
  let isWaitingToShow = offered?.isShown === false;
  let [lastShown, setLastShown] = React.useState(null);
  React.useEffect(() => {
    let defaultView = wordsRef.current?.ownerDocument.defaultView ?? null;
    if (!isWaitingToShow || defaultView === null) return;
    if (offeredCellId === undefined || offeredTyped === undefined || offeredWords === undefined) return;
    let timer: Dynamic;
    let isCancelled: Dynamic = false;
    let unlessCancelled =
      (callback?: Dynamic) =>
      () => {
        if (!isCancelled) callback();
      };
    afterNextFrameOrTimeout(
      defaultView,
      unlessCancelled(() => {
        timer = defaultView.setTimeout(() => {
          setLastShown({
            cellId: offeredCellId,
            typed: offeredTyped,
            offered: offeredWords,
          });
          afterNextFrameOrTimeout(
            defaultView,
            unlessCancelled(
              () =>
                store.dispatch({
                  kind: 'wordsOfferedShown',
                  cellId: offeredCellId,
                  typed: offeredTyped,
                  offered: offeredWords,
                  ...(!isKeyDrawn && {
                    isWithNoKey: true,
                  }),
                }),
            ),
          );
        }, WORDS_OFFERED_SHOW_DELAY_MS);
      }),
    );
    return () => {
      isCancelled = true;
      defaultView.clearTimeout(timer);
      setLastShown(null);
    };
  }, [store, isWaitingToShow, offeredCellId, offeredTyped, offeredWords, isKeyDrawn]);
  let placeProps = wordsOfferedPlaceProps(grid);
  if (placeProps === null || offered === null) return null;
  let wasShownBefore =
    lastShown !== null && isSameCell(lastShown.cellId, offered.cellId) && lastShown.typed === offered.typed && lastShown.offered === offered.offered;
  return jsxs('span', {
    ref: wordsRef,
    'aria-hidden': true,
    className: 'sheet-words-offered',
    ...placeProps,
    children: [
      jsx('span', {
        className: 'invisible',
        children: offered.typed,
      }),
      jsx(RestOfWordsOffered, {
        rest: offered.rest,
        keyIs: !isKeyDrawn ? 'leftOut' : offered.isShown || wasShownBefore ? 'seen' : 'unseen',
      }),
    ],
  });
}
export function trackWordsOfferedPresses(ownerDocument?: Dynamic, pressRef?: Dynamic) {
  let onPointerDown = ({ target: target, isPrimary: isPrimary, pointerType: pointerType, timeStamp: timeStamp }: Dynamic) => {
    pressRef.current = {
      beganOnButton: isPrimary && isOnWordsOfferedButton(target),
      cameDownAtMs: pointerType === 'mouse' ? null : timeStamp,
      wasLetGoAtMs: null,
    };
  };
  let onPointerUp = ({ timeStamp: timeStamp }: Dynamic) => {
    pressRef.current =
      pressRef.current === null
        ? NO_WORDS_OFFERED_PRESS
        : {
            ...pressRef.current,
            wasLetGoAtMs: timeStamp,
          };
  };
  let onPointerCancel = () => {
    pressRef.current = NO_WORDS_OFFERED_PRESS;
  };
  let onClick = () => {
    pressRef.current = null;
  };
  ownerDocument.addEventListener('pointerdown', onPointerDown, true);
  ownerDocument.addEventListener('pointerup', onPointerUp, true);
  ownerDocument.addEventListener('pointercancel', onPointerCancel, true);
  ownerDocument.addEventListener('click', onClick);
  return () => {
    ownerDocument.removeEventListener('pointerdown', onPointerDown, true);
    ownerDocument.removeEventListener('pointerup', onPointerUp, true);
    ownerDocument.removeEventListener('pointercancel', onPointerCancel, true);
    ownerDocument.removeEventListener('click', onClick);
  };
}
export function WordsOfferedButton({ grid: grid, offered: offered, isKeyDrawn: isKeyDrawn, onPressed: onPressed }: Dynamic) {
  let pressRef = React.useRef(null);
  let stopTrackingRef = React.useRef(null);
  let holderRef = React.useCallback((holder?: Dynamic) => {
    stopTrackingRef.current?.();
    pressRef.current = null;
    stopTrackingRef.current = holder === null ? null : trackWordsOfferedPresses(holder.ownerDocument, pressRef);
  }, []);
  let placeProps = wordsOfferedPlaceProps(grid);
  if (placeProps === null || offered === null || isKeyDrawn) return null;
  let { style: placeStyle } = placeProps;
  return jsxs(Fragment, {
    children: [
      jsx('span', {
        ref: holderRef,
        hidden: true,
      }),
      offered.isShown &&
        jsxs('span', {
          className: 'sheet-words-offered',
          'data-holds-only-button': true,
          ...placeProps,
          style:
            grid.editorScale > 1
              ? placeStyle
              : {
                  ...placeStyle,
                  maxWidth: placeStyle.minWidth,
                },
          children: [
            jsx('span', {
              children: offered.typed,
            }),
            jsx('button', {
              type: 'button',
              tabIndex: -1,
              className: WORDS_OFFERED_BUTTON_CLASS,
              'aria-label': useSuggestionLabel(offered.offered),
              onClick: ({ timeStamp: timeStamp }: Dynamic) => {
                if (isWordsOfferedTap(pressRef.current)) onPressed(offered, timeStamp);
              },
              children: jsx('span', {
                className: 'invisible',
                children: jsx(RestOfWordsOffered, {
                  rest: offered.rest,
                  keyIs: 'leftOut',
                }),
              }),
            }),
          ],
        }),
    ],
  });
}
export function useWordsOfferedDelayPassed(isOn?: Dynamic, delayMs?: Dynamic) {
  let [hasDelayPassed, setDelayPassed] = React.useState(false);
  if (!isOn && hasDelayPassed) setDelayPassed(false);
  React.useEffect(() => {
    if (!isOn) return;
    let timer = setTimeout(() => setDelayPassed(true), delayMs);
    return () => clearTimeout(timer);
  }, [isOn, delayMs]);
  return isOn && hasDelayPassed;
}
export function WordsOfferedAnnouncer({ words: words, hasGone: hasGone, isKeyDrawn: isKeyDrawn }: Dynamic) {
  let isGoneLongEnough = useWordsOfferedDelayPassed(hasGone, OFFER_ANNOUNCE_DELAY_MS);
  return jsx(LiveAnnouncer, {
    words: words === null ? isGoneLongEnough && suggestionGoneText() : suggestionHeardAs(words, isKeyDrawn),
  });
}
export function useCellEntryFieldEvents(store?: Dynamic) {
  let isComposingRef = React.useRef(false);
  return React.useMemo(
    () => ({
      onKeyDown: ({ nativeEvent: nativeEvent, keyCode: keyCode }: Dynamic) => {
        isComposingRef.current = nativeEvent.isComposing || keyCode === 229;
      },
      onSelect: ({ currentTarget: currentTarget }: Dynamic) => {
        if (!isCaretAtEndOfField(currentTarget))
          store.dispatch({
            kind: 'wordsOfferedWithdrawn',
          });
      },
      onInput: ({ currentTarget: currentTarget, nativeEvent: nativeEvent }: Dynamic) => {
        let isComposing = isComposingRef.current || ('isComposing' in nativeEvent && nativeEvent.isComposing === true);
        let typedEvent = {
          kind: 'cellEntryTyped',
          text: currentTarget.value,
          isOpenToOffer: !isComposing && isCaretAtEndOfField(currentTarget),
        };
        queueMicrotask(() => store.dispatch(typedEvent));
      },
    }),
    [store],
  );
}
export const WORDS_OFFERED_SHOW_DELAY_MS = 300;
export const doWordsOfferedFit = (
  wordsElement: Dynamic,
  editorElement: Dynamic,
  { right: right, bottom: bottom, scale: scale }: Dynamic,
) =>
  wordsElement.scrollWidth <= wordsElement.clientWidth &&
  editorElement.scrollWidth <= editorElement.clientWidth &&
  wordsElement.offsetLeft + wordsElement.offsetWidth * scale <= right &&
  wordsElement.offsetTop + wordsElement.offsetHeight * scale <= bottom;
export const RestOfWordsOffered = ({ rest: rest, keyIs: keyIs }: Dynamic) =>
  jsxs(Fragment, {
    children: [
      jsx('span', {
        className: 'sheet-rest-of-words-offered text-secondary',
        children: rest,
      }),
      keyIs !== 'leftOut' &&
        jsx('span', {
          className: `sheet-key-that-takes-words ml-1 text-caption ${shortcutKeycapClassName('Tab')} ${keyIs === 'seen' ? '' : 'invisible'}`,
          children: tabKeyLabel(),
        }),
    ],
  });
export const isWordsOfferedKeyDrawn = (offered?: Dynamic, isKeyDrawnNow?: Dynamic) =>
  offered?.isShown === true ? offered.isKeyDrawn : isKeyDrawnNow;
export const WORDS_OFFERED_BUTTON_CLASS = 'sheet-button-over-words-offered';
export const isOnWordsOfferedButton = (target?: Dynamic) =>
  target instanceof Element && target.closest(`.${WORDS_OFFERED_BUTTON_CLASS}`) !== null;
export const NO_WORDS_OFFERED_PRESS = {
  beganOnButton: false,
  cameDownAtMs: null,
  wasLetGoAtMs: null,
};
export const isWordsOfferedTap = (press?: Dynamic) =>
  press === null ||
  (press.beganOnButton &&
    (press.cameDownAtMs === null || (press.wasLetGoAtMs !== null && press.wasLetGoAtMs - press.cameDownAtMs <= TAP_HOLD_LIMIT_MS)));
export const isCaretAtEndOfField = (field?: Dynamic) =>
  field.selectionStart === field.value.length && field.selectionEnd === field.value.length;
