import type { Dynamic } from '../dynamic.ts';
import { isMobileTouchDevice } from '../comments/card-places.ts';
export function keyHandoffAction(keyPress?: Dynamic) {
  if (keyPress.isAimedWithin || isModifierKeyName(keyPress.key)) return null;
  if (keyPress.isTakenAlready || keyPress.isHeldDown) return 'nothing';
  if (keyPress.key === 'Escape') return 'shuts';
  if (/^(Enter|Tab|F\d+)$/.test(keyPress.key)) return 'onlyBringsKeyboard';
  return keyPress.isChord && !/^[acvx]$/i.test(keyPress.key) ? 'onlyBringsKeyboard' : 'bringsKeyboard';
}
export function listenForKeysToHandOff(target?: Dynamic, options?: Dynamic) {
  function stopListening() {
    target.removeEventListener('keydown', onKeyDown, true);
    target.removeEventListener('focusin', onFocusIn, true);
  }
  function onFocusIn(event?: Dynamic) {
    if (options.holds(event.target)) stopListening();
  }
  function onKeyDown(event?: Dynamic) {
    if (options.takes?.(event) === false) return;
    let action = keyHandoffAction({
      key: event.key,
      isAimedWithin: options.holds(event.target),
      isTakenAlready: event.defaultPrevented,
      isHeldDown: event.repeat,
      isChord: (event.metaKey || event.ctrlKey) && !event.altKey,
    });
    if (action === null) return;
    event.stopPropagation();
    if (action !== 'bringsKeyboard') event.preventDefault();
    if (action === 'nothing') return;
    if (action === 'shuts') {
      stopListening();
      return options.shut();
    }
    if (!options.takeKeyboard(event)) return event.preventDefault();
    return options.handOn?.(event);
  }
  target.addEventListener('keydown', onKeyDown, true);
  target.addEventListener('focusin', onFocusIn, true);
  return stopListening;
}
export function keyboardHandoffOutcome(state?: Dynamic) {
  if (!state.isStillInPage) return 'givesUp';
  if (state.isKeyboardInsideAlready) return 'leaves';
  if (state.hasPointerGoneDownElsewhere) return 'givesUp';
  return state.isKeyboardWhereItWas || !state.hasKeyGoneDown ? 'takes' : 'givesUp';
}
export function offerKeyboardWhenReady(element?: Dynamic, giveKeyboard?: Dynamic, options: Dynamic = {}) {
  let ownerDocument = element.ownerDocument;
  let view = ownerDocument.defaultView;
  if (view === null)
    return () => {
      return;
    };
  if (isMobileTouchDevice(view.navigator)) {
    giveKeyboard();
    return () => {
      return;
    };
  }
  let activeElementAtStart = ownerDocument.activeElement;
  let isInsideElement = (input?: Dynamic) => input !== element && element.contains(input);
  let isSettled: Dynamic = false;
  let inputState = {
    hasKeyGoneDown: false,
    hasPointerGoneDownElsewhere: false,
  };
  let onInputEvent = (event?: Dynamic) => {
    if (event.type === 'keydown') {
      let isModifierKey = 'key' in event && isModifierKeyName(event.key);
      let isRepeat = 'repeat' in event && event.repeat === true;
      if (!isModifierKey && !isRepeat) inputState.hasKeyGoneDown = true;
    } else if (!element.contains(event.target)) {
      inputState.hasPointerGoneDownElsewhere = true;
      settle(false);
    }
  };
  function callOff() {
    isSettled = true;
    view?.cancelAnimationFrame(frame);
    for (let value of timers as Dynamic) view?.clearTimeout(value);
    stopKeyHandoff();
    element.removeAttribute(AWAITS_KEYBOARD_ATTRIBUTE);
    for (let value of KEYBOARD_HANDOFF_EVENTS as Dynamic) ownerDocument.removeEventListener(value, onInputEvent, true);
  }
  function settle(isKeyboardWhereItWas?: Dynamic) {
    if (isSettled) return element.contains(ownerDocument.activeElement);
    callOff();
    let activeElement = ownerDocument.activeElement;
    let outcome = keyboardHandoffOutcome({
      isStillInPage: element.isConnected,
      isKeyboardInsideAlready: isInsideElement(activeElement),
      isKeyboardWhereItWas:
        isKeyboardWhereItWas || [activeElementAtStart, element, ownerDocument.body, null].some((input?: Dynamic) => input === activeElement),
      ...inputState,
    });
    if (outcome === 'takes') giveKeyboard();
    if (outcome === 'givesUp') options.onGivenUp?.();
    return element.contains(ownerDocument.activeElement);
  }
  let settleByTimer = () => void settle(false);
  let timers = [view.setTimeout(settleByTimer, KEYBOARD_HANDOFF_DELAY_MS)];
  let frame = view.requestAnimationFrame(() => void timers.push(view.setTimeout(settleByTimer)));
  let { keys: keys } = options;
  let stopKeyHandoff =
    keys === undefined
      ? () => {
          return;
        }
      : listenForKeysToHandOff(ownerDocument, {
          holds: (input?: Dynamic) => element.contains(input),
          takeKeyboard: () => settle(true),
          shut() {
            callOff();
            keys.onShut();
          },
          ...(keys.handOn !== undefined && {
            handOn: keys.handOn,
          }),
        });
  element.setAttribute(AWAITS_KEYBOARD_ATTRIBUTE, '');
  for (let value of KEYBOARD_HANDOFF_EVENTS as Dynamic) ownerDocument.addEventListener(value, onInputEvent, true);
  return callOff;
}
export function offerKeyboardToField(element?: Dynamic, field?: Dynamic, onShut?: Dynamic) {
  let view = element.ownerDocument.defaultView;
  if (view === null || isMobileTouchDevice(view.navigator))
    return {
      answer: field,
      callOff: () => {
        return;
      },
    };
  return {
    answer: false,
    callOff: offerKeyboardWhenReady(element, () => field.focus(), {
      keys: {
        onShut: onShut,
      },
    }),
  };
}
export function createOpeningEdgeDetector() {
  let wasOpenBefore: Dynamic = false;
  return (isOpen?: Dynamic, isOpenElsewhere?: Dynamic) => {
    let isOpeningEdge = isOpen && !wasOpenBefore;
    wasOpenBefore = isOpen || isOpenElsewhere;
    return isOpeningEdge;
  };
}
export const isModifierKeyName = (key?: Dynamic) => typeof key === 'string' && /^(Shift|Control|Alt|Meta)$/.test(key);
export const AWAITS_KEYBOARD_ATTRIBUTE = 'data-awaits-keyboard';
export const hasElementAwaitingKeyboard = (container?: Dynamic) =>
  container.querySelector(`[${AWAITS_KEYBOARD_ATTRIBUTE}]`) !== null;
export const KEYBOARD_HANDOFF_DELAY_MS = 100;
export const KEYBOARD_HANDOFF_EVENTS = ['keydown', 'pointerdown'];
