import { Popover } from '../../kit/popover.tsx';
import { AgentMark } from '../../kit/agent-mark.tsx';
import { Button } from '../../kit/button.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { IS_APPLE_PLATFORM, preventMouseDownDefault } from '../../ui/dom-events.ts';
import { isEntryUntouched } from '../reference-pointing.ts';
import { askAgentToFixSelection } from '../../agent/ask-agent-menu.ts';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
import { writingFormulasLabel, keepFixesLabel, errorCountLabel } from '../../i18n/grid-action-labels.ts';
import { escapeKeyHint } from '../../messages/formula-writing.ts';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import {
  listRowSize,
  useLastNonNull,
  getLastPointerPoint,
  isWithinPressGuard,
  isPointerStillAt,
  isWithinClickAfterUp,
  withListTabStops,
} from '../../ui/list-under-cell.ts';
import { OfferRow, OfferWand, RowsThatFold, useOfferPressGuard } from '../from-words/offer-list.ts';
import { doesKeyStepBackIntoCells } from '../../state/escape.ts';
import { CanTakeFocusContext } from '../../ui/popup-given-up-on-blur.ts';
import { useBottomInset, popupCollisionPadding } from '../../shell/bottom-insets.ts';
import { useActHoldAtAnswer } from '../../agent/answer-holds.ts';
import { LiveAnnouncer } from '../../ui/live-announcer.ts';
import { agentWritingFixesText, agentWroteFixesText } from '../../i18n/formula-fix-labels.ts';
import { CELL_POPUP_SIDE_OFFSETS } from '../../ui/popup-placement.ts';
import { swallowRestOfPress } from '../../ui/press-swallow.ts';
import { DangerWarningIcon } from '../../ui/warning-icon.ts';
export function readErrorsKnownOf(getStorage?: Dynamic) {
  let storedText = getStorage().getItem('sheets-errors-known-of') ?? '{}';
  let knownOf: Dynamic = null;
  try {
    knownOf = JSON.parse(storedText);
  } catch {}
  if (typeof knownOf !== 'object' || knownOf === null) return {};
  return Object.fromEntries(Object.entries(knownOf).filter((entry?: Dynamic) => typeof entry[1] === 'number'));
}
export function noteErrorsKnownOf(sheetId?: Dynamic, count?: Dynamic, getStorage: Dynamic = errorsKnownOfStorage) {
  try {
    getStorage().setItem(
      'sheets-errors-known-of',
      JSON.stringify({
        ...readErrorsKnownOf(getStorage),
        [sheetId]: count,
      }),
    );
  } catch {}
}
export function areMoreErrorsThanKnown(sheetId?: Dynamic, count?: Dynamic, getStorage: Dynamic = errorsKnownOfStorage) {
  try {
    let knownCount = readErrorsKnownOf(getStorage)[sheetId] ?? 0;
    if (count < knownCount) noteErrorsKnownOf(sheetId, count, getStorage);
    return count > knownCount;
  } catch {
    return count > 0;
  }
}
export function trackErrorsOfferSighting(seenWithCount?: Dynamic, countOffered?: Dynamic, isInView?: Dynamic, isShown?: Dynamic) {
  let isSeen = (isInView && isShown) || seenWithCount === countOffered;
  return {
    seenWithCount: isSeen ? countOffered : null,
    hasLeftView: isSeen && !isInView,
  };
}
export function scheduleErrorsOfferAnnounce(count?: Dynamic, announce?: Dynamic) {
  if (count === null) return;
  let timer = setTimeout(announce, 6000);
  return () => clearTimeout(timer);
}
export function partStepOfTabInEntry(event?: Dynamic, mode?: Dynamic, cameInByPartTab?: Dynamic, isApple: Dynamic = IS_APPLE_PLATFORM) {
  if (event.key !== 'Tab' || hasShortcutModifier(event, isApple) || event.repeat) return null;
  if (!cameInByPartTab || !isEntryUntouched(mode)) return null;
  return event.shiftKey ? 'partBefore' : 'nextPart';
}
export async function askAgentToFixOfferedErrors(store?: Dynamic, chat?: Dynamic, when?: Dynamic): Promise<Dynamic> {
  let isAtOpening = when === 'atOpening';
  let view = store.getView();
  let offer = isAtOpening ? view.errorsAtOpening : view.errorsOffered;
  if (offer === null || store.isEventUnfinished()) return false;
  store.dispatch({
    kind: isAtOpening ? 'fixOfErrorsAtOpeningAsked' : 'fixOfErrorsAsked',
  });
  if (store.getView().selectionByAddress?.range !== offer.cells) return false;
  let wasAsked = await askAgentToFixSelection(chat, store);
  if (wasAsked)
    store.dispatch(
      view.errorsAtOpening !== null && isAtOpening
        ? {
            kind: 'errorsAtOpeningPutAway',
            sheetId: view.errorsAtOpening.sheetId,
          }
        : {
            kind: 'errorsOfferPutAway',
          },
    );
  return wasAsked;
}
export function focusPlaceForFixes(focusState?: Dynamic) {
  if (shouldFocusFixChoices(focusState)) return 'inRows';
  return focusState.wouldFetchKeyboard ? 'outsideFrame' : 'elsewhere';
}
export function fixChoiceRowsOf(stage?: Dynamic, count?: Dynamic, hasRowFocus?: Dynamic, onActedOn?: Dynamic) {
  let discardWords = count === 1 ? sheetMessages.discardFix() : sheetMessages.discardAllFixes();
  if (stage === 'asked')
    return [
      {
        words: writingFormulasLabel(count),
        isShimmering: true,
        isStopAtEnd: true,
        isKeyOfStopUnheard: !hasRowFocus,
        onChosen: () => onActedOn('ended'),
      },
      {
        words: discardWords,
        onChosen: null,
      },
    ];
  return [
    {
      words: keepFixesLabel(count),
      isKeyOfStopUnheard: !hasRowFocus,
      onChosen: () => onActedOn('kept'),
    },
    {
      words: discardWords,
      hint: hasRowFocus ? escapeKeyHint() : '',
      onChosen: () => onActedOn('ended'),
    },
  ];
}
export function FixChoices({
  stage: stage,
  count: count,
  ids: [keepRowId, endRowId],
  rowWithFocus: rowWithFocus,
  onActedOn: onActedOn,
}: Dynamic) {
  let [firstRow, secondRow] = fixChoiceRowsOf(stage, count, rowWithFocus !== null, onActedOn);
  let isAsked = stage === 'asked';
  return jsxs('div', {
    role: 'listbox',
    'aria-label': sheetMessages.fixErrors(),
    'data-size': listRowSize(),
    children: [
      jsx(OfferRow, {
        row: firstRow,
        id: keepRowId,
        placeInList: 1,
        rowsInList: isAsked ? 1 : 2,
        isHighlighted: rowWithFocus === 1,
        isEveryClickHeard: true,
        isListNew: false,
        children:
          stage === 'asked' &&
          jsx(OfferWand, {
            kind: 'asked',
          }),
      }),
      jsx(RowsThatFold, {
        isFolded: isAsked,
        doesEase: true,
        children: jsx(OfferRow, {
          row: secondRow,
          id: endRowId,
          placeInList: 2,
          isHighlighted: rowWithFocus === 2,
          isEveryClickHeard: true,
          isListNew: false,
        }),
      }),
    ],
  });
}
export const errorsKnownOfStorage = () => localStorage;
export const nextErrorsOfferAnnounceStage = (announceStage?: Dynamic, isOffered?: Dynamic, isShown?: Dynamic) => {
  if (!isOffered) return 'notYet';
  return announceStage === 'now' && !isShown ? 'already' : announceStage;
};
export const ERRORS_NOTICE_TAB_STOP_ATTRIBUTE = 'data-tab-stop-of-errors-notice';
export const didFocusLeaveByTab = (relatedTarget?: Dynamic, lastKeyEvent?: Dynamic, isPointerDown?: Dynamic) =>
  !isPointerDown &&
  ((relatedTarget?.hasAttribute?.(ERRORS_NOTICE_TAB_STOP_ATTRIBUTE) === true && lastKeyEvent === null) ||
    (lastKeyEvent?.key === 'Tab' && !lastKeyEvent.defaultPrevented && lastKeyEvent.target === relatedTarget));
export const hasShortcutModifier = (event?: Dynamic, isApple: Dynamic = IS_APPLE_PLATFORM) =>
  (event.altKey && !isApple) || event.ctrlKey || event.metaKey;
export const isTrustedPlainTab = (event?: Dynamic, hasWindowCaretReturned?: Dynamic, isApple: Dynamic = IS_APPLE_PLATFORM) =>
  event.key === 'Tab' && hasWindowCaretReturned && event.isTrusted && !event.isComposing && !hasShortcutModifier(event, isApple);
export const doesKeyStepBackIntoCellsButF6 = (key?: Dynamic) => doesKeyStepBackIntoCells(key) && key !== 'F6';
export const isPlainTabWhileNavigating = (
  event?: Dynamic,
  mode?: Dynamic,
  isPointerDown?: Dynamic,
  isApple: Dynamic = IS_APPLE_PLATFORM,
) => event.key === 'Tab' && !hasShortcutModifier(event, isApple) && mode.kind === 'navigating' && !isPointerDown;
export const ERRORS_NOTICE_TAB_STOP_PROPS = {
  type: 'button',
  tabIndex: 0,
  'aria-hidden': true,
  [ERRORS_NOTICE_TAB_STOP_ATTRIBUTE]: '',
  className: 'sr-only',
};
export const ERRORS_NOTICE_PLACE_ATTRIBUTE = 'data-place-of-errors-notice';
export const ERRORS_OFFERED_ATTRIBUTE = 'data-errors-offered';
export const UNDECIDED_FIXES_OFFER_DELAY_MS = 1000;
export const ERRORS_OFFER_BUTTON_LABELS = {
  chat: sheetMessages.askAgentToFix,
  offered: sheetMessages.fixErrors,
};
export const ERRORS_OFFER_OPTION_SELECTOR = '[role=option]:not([aria-disabled])';
export const shouldFocusFixChoices = (focusState?: Dynamic) =>
  (focusState.stage === 'asked' || focusState.stage === 'waiting') &&
  !focusState.wouldFetchKeyboard &&
  (focusState.isFocusWithin || focusState.isPressFresh);
export const errorsPressGuardStandOf = (isShownNow?: Dynamic, stage?: Dynamic) => {
  if (!isShownNow) return null;
  if (stage === 'asked') return 'whileAgentWrites';
  return stage === 'waiting' ? 'withAnswer' : 'otherwise';
};
export const optionIdOf = (target?: Dynamic) => (target instanceof Element ? target.closest('[role=option]')?.id : undefined);
export const cancelEscapeDismissal = (open?: Dynamic, details?: Dynamic) => {
  if (details.reason !== 'escape-key') return;
  details.cancel();
  if (details.event.currentTarget instanceof Document) details.allowPropagation();
};
export const ErrorsOfferNotice = React.memo(function ({
  count: count,
  countOffered: countOffered,
  isHeldBack: isHeldBack,
  areItsCellsInView: areItsCellsInView,
  canAttach: canAttach,
  isChatToBeHad: isChatToBeHad,
  anchor: anchor,
  place: place,
  stageOfFixes: stageOfFixes,
  countOfFixes: countOfFixes,
  pressForFixes: pressForFixes,
  holdOnFixes: holdOnFixes,
  onActHeldAtFixes: onActHeldAtFixes,
  onFixesActedOn: onFixesActedOn,
  onFixAsked: onFixAsked,
  onPutAway: onPutAway,
  onWheelTurned: onWheelTurned,
  onKeyPressed: onKeyPressed,
  onGoneWithFocus: onGoneWithFocus,
}: Dynamic) {
  let lastCount = useLastNonNull(count);
  let [lastSettledStage, setLastSettledStage] = React.useState(null);
  if ((stageOfFixes === 'offered' || stageOfFixes === null) && stageOfFixes !== lastSettledStage) setLastSettledStage(stageOfFixes);
  let stage = stageOfFixes === 'undecided' ? lastSettledStage : stageOfFixes;
  let [isUndecidedLongEnough, setIsUndecidedLongEnough] = React.useState(false);
  React.useEffect(() => {
    if (stageOfFixes !== 'undecided' || !isChatToBeHad) return;
    let timer = setTimeout(() => setIsUndecidedLongEnough(true), UNDECIDED_FIXES_OFFER_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setIsUndecidedLongEnough(false);
    };
  }, [stageOfFixes, isChatToBeHad]);
  let areFixesUnderWay = stage === 'asked' || stage === 'waiting';
  let [highlightedRow, setHighlightedRow] = React.useState(null);
  if (!areFixesUnderWay && highlightedRow !== null) setHighlightedRow(null);
  let wouldFocusFetchKeyboard = React.useContext(CanTakeFocusContext);
  let [fixesAnnouncement, setFixesAnnouncement] = React.useState(null);
  if (!areFixesUnderWay && fixesAnnouncement !== null) setFixesAnnouncement(null);
  let hasFocusRef = React.useRef(false);
  let [frozenFixCount, setFrozenFixCount] = React.useState(null);
  let waitingFixCount = stage === 'waiting' ? (frozenFixCount ?? countOfFixes) : null;
  if (waitingFixCount !== frozenFixCount) setFrozenFixCount(waitingFixCount);
  let labelId = React.useId();
  let [keepRowId, endRowId] = [`${labelId}-first`, `${labelId}-second`];
  let safeAreaInsets = useBottomInset();
  let [isOpen, setIsOpen] = React.useState(false);
  let mayOpen = count !== null && !isHeldBack && !(stageOfFixes === 'undecided' && !isOpen && !isUndecidedLongEnough);
  let [seenWithCount, setSeenWithCount] = React.useState(null);
  let { seenWithCount: nextSeenWithCount, hasLeftView: hasLeftView } = trackErrorsOfferSighting(
    seenWithCount,
    countOffered,
    areItsCellsInView || areFixesUnderWay,
    mayOpen && (isOpen || canAttach),
  );
  if (nextSeenWithCount !== seenWithCount) setSeenWithCount(nextSeenWithCount);
  let isShown = mayOpen && !hasLeftView && (isOpen || canAttach);
  if (isShown !== isOpen) setIsOpen(isShown);
  let shownStage = useLastNonNull(isShown ? (stage ?? 'chat') : null);
  let isChoiceListShown = shownStage === 'asked' || shownStage === 'waiting';
  let shownFixCount = useLastNonNull(areFixesUnderWay ? countOfFixes : null) ?? countOfFixes;
  let [announceStage, setAnnounceStage] = React.useState('notYet');
  let nextAnnounceStage = nextErrorsOfferAnnounceStage(announceStage, countOffered !== null, isShown);
  if (nextAnnounceStage !== announceStage) setAnnounceStage(nextAnnounceStage);
  let canAct = stage !== null || canAttach;
  let countToAnnounce = isShown && canAct && !areFixesUnderWay && nextAnnounceStage === 'notYet' ? count : null;
  React.useEffect(
    () =>
      scheduleErrorsOfferAnnounce(
        countToAnnounce,
        () => setAnnounceStage((announceStage2?: Dynamic) => (announceStage2 === 'notYet' ? 'now' : announceStage2)),
      ),
    [countToAnnounce],
  );
  let [toldCount, setToldCount] = React.useState(null);
  let countToTell = countOffered === null || areFixesUnderWay ? null : (count ?? toldCount);
  if (countToTell !== toldCount) setToldCount(countToTell);
  let isAskingRef = React.useRef(false);
  let lastChangeRef = React.useRef({
    place: null,
    stage: null,
    atMs: 0,
    pointer: null,
  });
  React.useLayoutEffect(() => {
    let { place: lastPlace, stage: lastStage } = lastChangeRef.current;
    if (!isShown)
      lastChangeRef.current = {
        place: null,
        stage: null,
        atMs: 0,
        pointer: null,
      };
    else if (lastPlace !== place || lastStage !== stage)
      lastChangeRef.current = {
        place: place,
        stage: stage,
        atMs: performance.now(),
        pointer: getLastPointerPoint(),
      };
  }, [isShown, place, stage]);
  let pressStartRef = React.useRef(null);
  let popupRef = React.useRef(null);
  let [isPopupMounted, setIsPopupMounted] = React.useState(false);
  let [tabStopBeforeRef, tabStopAfterRef] = [React.useRef(null), React.useRef(null)];
  let focusableRows = React.useCallback(
    () => [...(popupRef.current?.querySelectorAll(`${ERRORS_OFFER_OPTION_SELECTOR}, button:not([role=option])`) ?? [])],
    [],
  );
  let focusRowAt = React.useCallback(
    (index?: Dynamic) =>
      focusableRows().at(index)?.focus({
        preventScroll: true,
      }),
    [focusableRows],
  );
  let onTabStopFocus = ({ relatedTarget: relatedTarget }: Dynamic, index?: Dynamic) => {
    if ((relatedTarget instanceof Node && popupRef.current?.contains(relatedTarget)) !== true) focusRowAt(index);
  };
  let latestRef = React.useRef({
    onGoneWithFocus: onGoneWithFocus,
    pressForFixes: pressForFixes,
    wouldFocusFetchKeyboard: wouldFocusFetchKeyboard,
  });
  React.useLayoutEffect(() => {
    latestRef.current = {
      onGoneWithFocus: onGoneWithFocus,
      pressForFixes: pressForFixes,
      wouldFocusFetchKeyboard: wouldFocusFetchKeyboard,
    };
  });
  React.useLayoutEffect(() => {
    let popup = popupRef.current;
    if (!isShown && popup !== null && popup.contains(popup.ownerDocument.activeElement)) latestRef.current.onGoneWithFocus();
  }, [isShown]);
  let isFocusInside = React.useCallback(() => {
    let popup = popupRef.current;
    let activeElement = popup?.ownerDocument.activeElement;
    return popup !== null && hasFocusRef.current && (activeElement === popup.ownerDocument.body || popup.contains(activeElement ?? null));
  }, []);
  let wereFixesUnderWayRef = React.useRef(false);
  React.useLayoutEffect(() => {
    let wereUnderWay = wereFixesUnderWayRef.current;
    wereFixesUnderWayRef.current = areFixesUnderWay;
    if (!wereUnderWay || areFixesUnderWay) return;
    latestRef.current.pressForFixes.forget();
    let hadFocus = isFocusInside();
    hasFocusRef.current = false;
    if (hadFocus && !latestRef.current.wouldFocusFetchKeyboard()) latestRef.current.onGoneWithFocus();
  }, [areFixesUnderWay, isFocusInside]);
  React.useLayoutEffect(() => {
    if (!isPopupMounted || !isShown || (stage !== 'asked' && stage !== 'waiting')) return;
    let { pressForFixes: pressForFixes2, wouldFocusFetchKeyboard: wouldFocusFetchKeyboard2 } = latestRef.current;
    let focusState = {
      stage: stage,
      isPressFresh: pressForFixes2.isFresh(),
      isFocusWithin: isFocusInside(),
      wouldFetchKeyboard: wouldFocusFetchKeyboard2(),
    };
    pressForFixes2.forget();
    setFixesAnnouncement(
      (previous?: Dynamic) =>
        previous?.stage === stage
          ? previous
          : {
              stage: stage,
              are: focusPlaceForFixes(focusState),
            },
    );
    if (shouldFocusFixChoices(focusState)) focusRowAt(0);
  }, [stage, isPopupMounted, isShown, isFocusInside, focusRowAt]);
  let stageAtPressRef = React.useRef('none');
  let actHold = useActHoldAtAnswer({
    hold: holdOnFixes,
    tellOfActHeld: onActHeldAtFixes,
    isNoAct: () => false,
  });
  let pressGuard = useOfferPressGuard(errorsPressGuardStandOf(isShown && isPopupMounted, stage), popupRef, onActHeldAtFixes);
  let isClickDroppedRef = React.useRef(false);
  let noteStageAtPress = ({ currentTarget: currentTarget }: Dynamic, endEventType?: Dynamic) => {
    stageAtPressRef.current = stage;
    let defaultView = currentTarget.ownerDocument.defaultView;
    let forgetStage = () => void defaultView?.setTimeout(() => void (stageAtPressRef.current = 'none'));
    defaultView?.addEventListener(endEventType, forgetStage, {
      once: true,
      capture: true,
    });
  };
  let attachPopup = React.useCallback(
    (popup?: Dynamic) => {
      popupRef.current = popup;
      if (popup === null) return;
      popup.parentElement?.style.setProperty('pointer-events', 'none');
      let onWheel = (event?: Dynamic) => {
        if (onWheelTurned(event)) event.preventDefault();
      };
      popup.addEventListener('wheel', onWheel, {
        passive: false,
      });
      setIsPopupMounted(true);
      return () => {
        popup.removeEventListener('wheel', onWheel);
        setIsPopupMounted(false);
      };
    },
    [onWheelTurned],
  );
  let popover = jsxs(Popover.Root, {
    open: isShown,
    onOpenChange: cancelEscapeDismissal,
    children: [
      jsx(LiveAnnouncer, {
        words: areFixesUnderWay
          ? fixesAnnouncement?.stage === stage &&
            (stage === 'asked'
              ? agentWritingFixesText(fixesAnnouncement.are)
              : agentWroteFixesText(waitingFixCount ?? countOfFixes, fixesAnnouncement.are))
          : countToTell !== null && errorCountLabel(countToTell),
      }),
      jsx(LiveAnnouncer, {
        words: nextAnnounceStage === 'now' && !areFixesUnderWay && ERRORS_OFFER_BUTTON_LABELS[stage === 'offered' ? 'offered' : 'chat'](),
      }),
      jsx(Popover.Popup, {
        ref: attachPopup,
        anchor: anchor,
        side: 'bottom',
        align: 'start',
        sideOffset: CELL_POPUP_SIDE_OFFSETS.under,
        collisionPadding: popupCollisionPadding(safeAreaInsets),
        collisionAvoidance: {
          side: 'none',
          fallbackAxisSide: 'none',
        },
        padding: isChoiceListShown ? 'xs' : 'none',
        initialFocus: false,
        finalFocus: false,
        keepFocus: true,
        role: 'group',
        'aria-label': sheetMessages.errorsOnThisSheet(),
        'data-errors-offered': true,
        className: isChoiceListShown
          ? 'pointer-events-auto flex w-[304px] flex-col'
          : 'pointer-events-none flex h-9 items-center gap-1 ps-2.5 pe-1 whitespace-nowrap',
        onMouseDown: isChoiceListShown ? preventMouseDownDefault : undefined,
        onFocus: ({ target: target }: Dynamic) => {
          setAnnounceStage('already');
          setHighlightedRow(target.id === keepRowId ? 1 : target.id === endRowId ? 2 : null);
          hasFocusRef.current = true;
        },
        onBlur: ({ relatedTarget: relatedTarget }: Dynamic) => {
          setHighlightedRow(null);
          if (relatedTarget !== null) hasFocusRef.current = false;
        },
        onPointerDownCapture: (event?: Dynamic) => {
          pressGuard.onPointerDownCapture?.(event);
          actHold.handlers.onPointerDownCapture(event);
          let now = performance.now();
          pressStartRef.current = isWithinPressGuard(lastChangeRef.current.atMs, now) ? now : null;
          isClickDroppedRef.current =
            optionIdOf(event.target) === endRowId &&
            event.pointerType === 'mouse' &&
            event.buttons !== 0 &&
            isPointerStillAt(lastChangeRef.current.pointer);
          noteStageAtPress(event, 'pointerup');
        },
        onPointerMoveCapture: pressGuard.onPointerMoveCapture,
        onPointerUpCapture: actHold.handlers.onPointerUpCapture,
        onPointerCancelCapture: (event?: Dynamic) => {
          pressGuard.onPointerCancelCapture?.(event);
          actHold.handlers.onPointerCancelCapture();
          isClickDroppedRef.current = false;
        },
        onTransitionEndCapture: pressGuard.onTransitionEndCapture,
        onKeyDownCapture: actHold.handlers.onKeyDownCapture,
        onKeyUpCapture: actHold.handlers.onKeyUpCapture,
        onClickCapture: (event?: Dynamic) => {
          actHold.handlers.onClickCapture();
          pressGuard.onClickCapture?.(event);
          let [pressStart, stageAtPress] = [pressStartRef.current, stageAtPressRef.current];
          [pressStartRef.current, stageAtPressRef.current] = [null, 'none'];
          let isDropped = isClickDroppedRef.current;
          isClickDroppedRef.current = false;
          if (event.isPropagationStopped()) return;
          let hasStageChanged = stageAtPress !== 'none' && stageAtPress !== stage;
          let now = performance.now();
          let isQuickClick = pressStart !== null && isWithinClickAfterUp(pressStart, now);
          if (hasStageChanged || isQuickClick || isWithinPressGuard(lastChangeRef.current.atMs, now)) return event.stopPropagation();
          if (isDropped && event.detail > 0) {
            lastChangeRef.current.pointer = null;
            onActHeldAtFixes();
            swallowRestOfPress(event, (target?: Dynamic) => optionIdOf(target) === keepRowId, true);
            return event.stopPropagation();
          }
          let isOnOption = event.target instanceof Element && event.target.closest(ERRORS_OFFER_OPTION_SELECTOR) !== null;
          let mayAct = stage === 'asked' || !actHold.isActRefused();
          return isOnOption && mayAct ? swallowRestOfPress(event) : undefined;
        },
        onKeyDown: (event?: Dynamic) => {
          if (event.ctrlKey || event.metaKey || (event.altKey && event.key !== 'Tab')) return onKeyPressed(event);
          let isActivationKey = event.key === 'Enter' || event.key === ' ';
          if (isActivationKey && (event.repeat || isWithinPressGuard(lastChangeRef.current.atMs, performance.now()))) {
            actHold.noteKeyThatTakesNothing();
            return event.preventDefault();
          }
          if (isActivationKey) noteStageAtPress(event, 'keyup');
          if (event.key === 'Escape' && areFixesUnderWay) {
            event.preventDefault();
            return !event.repeat && !isWithinPressGuard(lastChangeRef.current.atMs, performance.now())
              ? onFixesActedOn('ended', actHold.howActBegan())
              : actHold.noteKeyThatTakesNothing();
          }
          let rows = focusableRows();
          let matchIndex = rows.findIndex((row?: Dynamic) => row === event.target);
          let [nextKey, previousKey] = areFixesUnderWay ? ['ArrowDown', 'ArrowUp'] : ['ArrowRight', 'ArrowLeft'];
          let step =
            event.key === nextKey || (event.key === 'Tab' && !event.shiftKey) ? 1 : event.key === previousKey || event.key === 'Tab' ? -1 : 0;
          let target = step === 0 ? undefined : rows[matchIndex + step];
          let tabStop = (step === 1 ? tabStopAfterRef : tabStopBeforeRef).current;
          if (target === undefined && event.key === 'Tab' && tabStop !== null && !event.defaultPrevented)
            return tabStop.focus({
              preventScroll: true,
            });
          if (target === undefined) return step !== 0 ? undefined : onKeyPressed(event);
          event.preventDefault();
          return target.focus({
            preventScroll: true,
          });
        },
        children: isChoiceListShown
          ? jsx(FixChoices, {
              stage: shownStage,
              count: shownFixCount,
              ids: [keepRowId, endRowId],
              rowWithFocus: highlightedRow,
              onActedOn: (act?: Dynamic) => onFixesActedOn(act, actHold.howActBegan()),
            })
          : jsxs(Fragment, {
              children: [
                jsx(DangerWarningIcon, {}),
                jsx('span', {
                  id: labelId,
                  className: 'ps-0.5 pe-1.5',
                  children: lastCount === null ? '' : errorCountLabel(lastCount),
                }),
                jsx(Button, {
                  variant: 'secondary',
                  size: 'sm',
                  icon: jsx(AgentMark, {
                    size: 14,
                    ...(!canAct && {
                      color: 'currentColor',
                    }),
                  }),
                  'aria-disabled': !canAct,
                  'aria-describedby': labelId,
                  className: `pointer-events-auto ${canAct ? '' : 'opacity-disabled'}`,
                  tabIndex: -1,
                  onMouseDown: preventMouseDownDefault,
                  onClick: () => {
                    if (count === null) return;
                    if (stage === 'offered') return onFixesActedOn('asked');
                    if (!canAttach || isAskingRef.current) return;
                    isAskingRef.current = true;
                    onFixAsked().finally(() => {
                      isAskingRef.current = false;
                    });
                    return;
                  },
                  children: ERRORS_OFFER_BUTTON_LABELS[shownStage === 'offered' ? 'offered' : 'chat'](),
                }),
                jsx(Button, {
                  variant: 'ghost',
                  size: 'sm',
                  iconOnly: true,
                  icon: 'X',
                  tooltip: false,
                  tabIndex: -1,
                  'aria-label': sheetMessages.dismissErrorsOffer(),
                  className: 'pointer-events-auto text-secondary',
                  onMouseDown: preventMouseDownDefault,
                  onClick: onPutAway,
                }),
              ],
            }),
      }),
    ],
  });
  return jsxs('span', {
    className: 'contents',
    ...{
      [ERRORS_NOTICE_PLACE_ATTRIBUTE]: '',
    },
    children: [
      isShown &&
        jsx('button', {
          ...ERRORS_NOTICE_TAB_STOP_PROPS,
          ref: tabStopBeforeRef,
          onFocus: (event?: Dynamic) => onTabStopFocus(event, 0),
          onKeyUp: () => focusRowAt(0),
        }),
      withListTabStops(popover),
      isShown &&
        jsx('button', {
          ...ERRORS_NOTICE_TAB_STOP_PROPS,
          ref: tabStopAfterRef,
          onFocus: (event?: Dynamic) => onTabStopFocus(event, -1),
          onKeyUp: () => focusRowAt(-1),
        }),
    ],
  });
});
