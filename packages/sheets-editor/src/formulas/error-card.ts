import { Popover } from '../kit/popover.tsx';
import { AgentMark } from '../kit/agent-mark.tsx';
import { Tooltip } from '../kit/tooltip.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { CELL_POPUP_SIDE_OFFSETS } from '../ui/popup-placement.ts';
import { MOUSE_STILL_SLOP } from '../comments/mouse-around.ts';
import { askAgentToFixSelection, askFixInPlace } from '../agent/ask-agent-menu.ts';
import { useLastNonNull, withListTabStops, isWithinPressGuard, isWithinClickAfterUp } from '../ui/list-under-cell.ts';
import { useBottomInset, popupCollisionPadding } from '../shell/bottom-insets.ts';
import { useTouchBelowSm } from '../app/media-queries.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { errorExplanationWords } from '../messages/formula-errors.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { preventMouseDownDefault } from '../ui/dom-events.ts';
import { swallowRestOfPress } from '../ui/press-swallow.ts';
export function createErrorCardHover(store?: Dynamic) {
  let restTimer: Dynamic = null;
  let cellRestedOn: Dynamic = null;
  let cardElement: Dynamic = null;
  let onCardShut: Dynamic;
  let cardBounds: Dynamic;
  let leaveTimer: Dynamic = null;
  let isMouseOnCard: Dynamic = false;
  let isLinkCard: Dynamic = false;
  let lastPressMs: Dynamic = Number.NEGATIVE_INFINITY;
  let value = () => {
    if (restTimer !== null) clearTimeout(restTimer.timer);
    restTimer = null;
  };
  let value2 = () => {
    if (leaveTimer !== null) clearTimeout(leaveTimer);
    leaveTimer = null;
  };
  let value3 = ({ cell: cell, at: at }: Dynamic) => {
    restTimer = {
      timer: setTimeout(
        () => {
          restTimer = null;
          value2();
          cellRestedOn = cell;
          store.dispatch({
            kind: 'pointerRested',
            at: at,
          });
        },
        Math.max(
          lastPressMs + FIX_PRESS_SETTLE_MS - performance.now(),
          isLinkCard || cardElement !== null ? ERROR_CARD_REST_AFTER_CARD_MS : ERROR_CARD_REST_MS,
        ),
      ),
      cell: cell,
      from: at,
    };
  };
  let value4 = (input: Dynamic = true) => {
    value2();
    if (cellRestedOn === null) return;
    cellRestedOn = null;
    store.dispatch({
      kind: 'pointerRested',
      at: null,
    });
    if (input) onCardShut?.();
  };
  let value5 = ({ x: x, y: y }: Dynamic) => {
    let [items, items2] = [cardElement?.()?.getBoundingClientRect(), cardBounds?.()];
    return (
      items !== undefined &&
      items2 !== undefined &&
      x >= Math.min(items.left, items2.left) &&
      x <= Math.max(items.right, items2.right) &&
      y >= Math.min(items.top, items2.top) &&
      y <= Math.max(items.bottom, items2.bottom)
    );
  };
  let value6 = (input: Dynamic = null) => {
    if (cellRestedOn === null) return;
    if (input !== null && value5(input)) value2();
    leaveTimer ??= setTimeout(value4, ERROR_CARD_LEAVE_MS);
  };
  let value7 = ({ x: x, y: y }: Dynamic) => {
    let value8 = cardElement?.()?.getBoundingClientRect();
    return (
      value8 !== undefined &&
      x >= value8.left - CELL_POPUP_SIDE_OFFSETS.right &&
      x <= value8.right &&
      y >= value8.top - CELL_POPUP_SIDE_OFFSETS.under &&
      y <= value8.bottom + CELL_POPUP_SIDE_OFFSETS.under
    );
  };
  return {
    tell(input?: Dynamic, options?: Dynamic) {
      if (
        restTimer !== null &&
        restTimer.cell === input?.cell &&
        Math.hypot(input.at.x - restTimer.from.x, input.at.y - restTimer.from.y) <= MOUSE_STILL_SLOP
      )
        return false;
      value();
      if (cardElement !== null) {
        isMouseOnCard = options !== undefined && value7(options);
        if (isMouseOnCard || input !== null) value2();
        else value6(options);
        if (!isMouseOnCard && input !== null && input.cell !== cellRestedOn) value3(input);
        return isMouseOnCard;
      }
      if (cellRestedOn === (input?.cell ?? null)) return false;
      let value8 = cellRestedOn !== null;
      let value9 = value8 && input?.cell.hasAttribute('data-looks-like-error') === true ? input : null;
      cellRestedOn = value9?.cell ?? null;
      if (value8)
        store.dispatch({
          kind: 'pointerRested',
          at: value9?.at ?? null,
        });
      if (value9 === null && input !== null) value3(input);
      return false;
    },
    cardIs(input?: Dynamic, options?: Dynamic, context?: Dynamic) {
      cardElement = input;
      onCardShut = options;
      cardBounds = context;
      if (input === null && (isMouseOnCard || leaveTimer !== null)) value4();
      if (input === null) isMouseOnCard = false;
    },
    isAt(input?: Dynamic) {
      if (cardElement === null) return;
      isMouseOnCard = input !== null && value7(input);
      if (!isMouseOnCard) return value6(input);
      value();
      return value2();
    },
    cardIsPutAway() {
      value2();
      cellRestedOn = null;
    },
    mouseIsPressed() {
      value();
      value4(false);
      lastPressMs = performance.now();
    },
    linkCardIs(input?: Dynamic) {
      isLinkCard = input;
    },
    stop() {
      value();
      value2();
    },
  };
}
export function useErrorCardHover(store?: Dynamic, linkCard?: Dynamic) {
  let hover = React.useMemo(() => createErrorCardHover(store), [store]);
  React.useEffect(() => hover.linkCardIs(linkCard), [hover, linkCard]);
  React.useEffect(() => hover.stop, [hover]);
  return hover;
}
export function useCardShownAfterDelay(key?: Dynamic, by?: Dynamic) {
  let [shownKey, setShownKey] = React.useState(null);
  React.useEffect(() => {
    if (key === null) return;
    let value = setTimeout(() => setShownKey(key), ERROR_CARD_KEYBOARD_DELAY_MS);
    return () => {
      clearTimeout(value);
      setShownKey(null);
    };
  }, [key]);
  return by === 'pointer' || shownKey === key;
}
export function askAgentToFixErrorOfCard(store?: Dynamic, askComposer?: Dynamic, cardOf?: Dynamic) {
  let errorExplained = store.getView().errorExplained;
  if (errorExplained?.cellKey !== cardOf || store.isEventUnfinished()) return false;
  store.dispatch({
    kind: 'fixOfErrorAsked',
    cardOf: cardOf,
  });
  if (store.getView().selectionByAddress?.range !== errorExplained.cells) return false;
  askAgentToFixSelection(askComposer, store);
  return true;
}
export function fixErrorOfCardHere(store?: Dynamic, cardOf?: Dynamic) {
  let errorExplained = store.getView().errorExplained;
  if (errorExplained?.cellKey !== cardOf || !errorExplained.canBeFixedHere || store.isEventUnfinished()) return false;
  return askFixInPlace(store, cardOf);
}
export function nextErrorCardSide(state?: Dynamic, of?: Dynamic, side?: Dynamic) {
  if (of !== null && of === state.of) return state;
  let next = {
    of: of,
    side: side ?? state.side,
  };
  return next.of === state.of && next.side === state.side ? state : next;
}
export function nextErrorCardState(state?: Dynamic, of?: Dynamic, context?: Dynamic, value?: Dynamic) {
  if (of === null)
    return state.of === null
      ? state
      : {
          ...ERROR_CARD_START_STATE,
          isCard: state.isCard,
        };
  if (of !== state.of)
    return {
      ...ERROR_CARD_START_STATE,
      of: of,
      isCard: context && value,
    };
  if (state.hasMouseLeft)
    return context
      ? state
      : {
          ...state,
          hasMouseLeft: false,
        };
  return !state.isCard && context && value
    ? {
        ...state,
        isCard: true,
      }
    : state;
}
export const ERROR_CARD_REST_MS = 100;
export const ERROR_CARD_REST_AFTER_CARD_MS = 300;
export const ERROR_CARD_KEYBOARD_DELAY_MS = 300;
export const ERROR_CARD_LEAVE_MS = 300;
export const FIX_PRESS_SETTLE_MS = 500;
export const errorCellUnderMouse = ({ pointerType: pointerType, buttons: buttons, target: target }: Dynamic) =>
  pointerType === 'mouse' && buttons === 0 && target instanceof Element ? target.closest('[data-is-error]') : null;
export const askFixOfErrorCard = (store?: Dynamic, askComposer?: Dynamic, cardOf?: Dynamic, isFixedHere?: Dynamic) =>
  isFixedHere ? fixErrorOfCardHere(store, cardOf) : askAgentToFixErrorOfCard(store, askComposer, cardOf);
export const ERROR_CARD_START_STATE = {
  of: null,
  isCard: false,
  hasMouseLeft: false,
};
export const ERROR_CARD_SIDE_START = {
  of: null,
  side: 'right',
};
export const errorCardAfterMouseLeft = ({ of: of }: Dynamic) => ({
  of: of,
  isCard: false,
  hasMouseLeft: true,
});
export const ErrorCard = React.memo(function ({
  error: error,
  by: by,
  cellKey: cellKey,
  canPersonEdit: canPersonEdit,
  isHeldBack: isHeldBack,
  anchor: anchor,
  side: side,
  placeOfCell: placeOfCell,
  isFixOffered: isFixOffered,
  isFixedHere: isFixedHere,
  canAttach: canAttach,
  mouse: mouse,
  onFixAsked: onFixAsked,
  onPutAway: onPutAway,
  onWheelTurned: onWheelTurned,
}: Dynamic) {
  let isShownNow = useCardShownAfterDelay(cellKey, by);
  let shownError = useLastNonNull(error);
  let bottomInset = useBottomInset();
  let isOpen = error !== null && isShownNow && !isHeldBack;
  let isTouchSmall = useTouchBelowSm();
  let isFixShown = (isFixOffered || isFixedHere) && error?.code !== '#TIMEOUT!';
  let isFixInCard = !isTouchSmall && isFixShown;
  let [cardState, setCardState] = React.useState(ERROR_CARD_START_STATE);
  let nextCardState = nextErrorCardState(cardState, isOpen ? cellKey : null, by === 'pointer', isFixInCard);
  if (nextCardState !== cardState) setCardState(nextCardState);
  let { isCard: isCard } = nextCardState;
  let isCardShown = useLastNonNull(isOpen ? isCard : null) ?? false;
  let cardOf = isOpen && isCard ? cellKey : null;
  let [sideState, setSideState] = React.useState(ERROR_CARD_SIDE_START);
  let nextSideState = nextErrorCardSide(sideState, cardOf === null ? null : `${cardOf} ${placeOfCell} ${bottomInset}`, isOpen ? side : null);
  if (nextSideState !== sideState) setSideState(nextSideState);
  let side2 = nextSideState.side;
  let cardRef = React.useRef(null);
  let hasCard = cardOf !== null;
  React.useEffect(() => {
    if (!hasCard) return mouse.cardIs(null);
    return mouse.cardIs(
      () => cardRef.current,
      () => setCardState(errorCardAfterMouseLeft),
      () => anchor.getBoundingClientRect(),
    );
  }, [mouse, hasCard, anchor]);
  let fixTimerRef = React.useRef(null);
  let finishFixPress = React.useCallback(() => {
    if (fixTimerRef.current === null) return;
    clearTimeout(fixTimerRef.current.timer);
    onPutAway(fixTimerRef.current.of);
    fixTimerRef.current = null;
  }, [onPutAway]);
  React.useEffect(
    () => () => {
      if (fixTimerRef.current !== null) clearTimeout(fixTimerRef.current.timer);
    },
    [],
  );
  let shownAtRef = React.useRef(0);
  React.useLayoutEffect(() => {
    if (cardOf !== null) shownAtRef.current = performance.now();
  }, [cardOf]);
  let pressAtRef = React.useRef(null);
  let cardRefCallback = React.useCallback(
    (element?: Dynamic) => {
      if (element === null) return;
      cardRef.current = element;
      element.parentElement?.style.setProperty('pointer-events', 'none');
      let value = (event?: Dynamic) => {
        if (onWheelTurned(event)) event.preventDefault();
      };
      element.addEventListener('wheel', value, {
        passive: false,
      });
      let value2 = ({ pointerType: pointerType, clientX: clientX, clientY: clientY }: Dynamic) => {
        if (pointerType === 'mouse')
          mouse.isAt({
            x: clientX,
            y: clientY,
          });
      };
      let value3 = ({ pointerType: pointerType }: Dynamic) => {
        if (pointerType === 'mouse') mouse.isAt(null);
      };
      let ownerDocument = element.ownerDocument;
      ownerDocument.addEventListener('pointermove', value2, true);
      ownerDocument.documentElement.addEventListener('pointerleave', value3);
      return () => {
        cardRef.current = null;
        element.removeEventListener('wheel', value);
        ownerDocument.removeEventListener('pointermove', value2, true);
        ownerDocument.documentElement.removeEventListener('pointerleave', value3);
      };
    },
    [onWheelTurned, mouse],
  );
  let errorWords =
    shownError === null
      ? ''
      : jsx('span', {
          'aria-hidden': true,
          children: errorExplanationWords(shownError, canPersonEdit),
        });
  let placement = {
    anchor: anchor,
    side: side2 === 'right' ? 'right' : 'bottom',
    align: 'start',
    sideOffset: CELL_POPUP_SIDE_OFFSETS[side2],
    collisionPadding: popupCollisionPadding(bottomInset),
  };
  let canFix = (canAttach || isFixedHere) && isFixShown;
  let isFixedHereShown = useLastNonNull(isOpen ? isFixedHere : null) ?? false;
  return jsxs(Fragment, {
    children: [
      jsx(Tooltip, {
        ...placement,
        content: errorWords,
        open: isOpen && isTouchSmall,
        multiline: true,
        className: 'max-w-[320px]',
      }),
      withListTabStops(
        jsx(Popover.Root, {
          open: isOpen && !isTouchSmall,
          children: jsxs(Popover.Popup, {
            ...placement,
            ref: cardRefCallback,
            'data-error-card': true,
            collisionAvoidance: {
              fallbackAxisSide: 'none',
            },
            padding: 'md',
            initialFocus: false,
            finalFocus: false,
            keepFocus: true,
            'aria-label': sheetMessages.errorInThisCell(),
            'aria-hidden': !isCardShown,
            className: 'pointer-events-none flex max-w-[320px] min-w-[240px] flex-col items-start gap-2',
            onPointerDownCapture: () => {
              let value = performance.now();
              pressAtRef.current = isWithinPressGuard(shownAtRef.current, value) ? value : null;
            },
            onClickCapture: (input?: Dynamic) => {
              let current = pressAtRef.current;
              pressAtRef.current = null;
              if (current === null || !isWithinClickAfterUp(current, performance.now())) return;
              input.stopPropagation();
              mouse.cardIsPutAway();
              if (cardOf !== null) onPutAway(cardOf);
            },
            children: [
              errorWords,
              isCardShown &&
                jsx(Button, {
                  variant: 'secondary',
                  size: 'sm',
                  icon: jsx(AgentMark, {
                    size: 14,
                    ...(!canFix && {
                      color: 'currentColor',
                    }),
                  }),
                  'aria-disabled': !canFix,
                  className: `pointer-events-auto ${canFix ? '' : 'opacity-disabled'}`,
                  tabIndex: -1,
                  onMouseDown: preventMouseDownDefault,
                  onClick: (input?: Dynamic) => {
                    if (!canFix || cardOf === null || fixTimerRef.current?.of === cardOf) return;
                    finishFixPress();
                    if (!onFixAsked(cardOf, isFixedHereShown)) return;
                    swallowRestOfPress(input);
                    mouse.cardIsPutAway();
                    fixTimerRef.current = {
                      of: cardOf,
                      timer: setTimeout(finishFixPress, FIX_PRESS_SETTLE_MS),
                    };
                  },
                  children: isFixedHereShown ? sheetMessages.fixWithAgent() : sheetMessages.askAgentToFix(),
                }),
            ],
          }),
        }),
      ),
    ],
  });
});
