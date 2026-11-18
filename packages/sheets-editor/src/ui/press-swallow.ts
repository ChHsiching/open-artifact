import type { Dynamic } from '../dynamic.ts';
import { afterNextFrameOrTimeout } from '../utils/next-frame.ts';
import { MODIFIER_KEYS } from '../state/escape.ts';
export function createRestOfPressTracker(press?: Dynamic, isStrict: Dynamic = false) {
  let lastTimeStamp: Dynamic = press.timeStamp;
  let phase: Dynamic = null;
  let wasHeld: Dynamic = false;
  let isOver: Dynamic = false;
  return {
    isOver: () => isOver,
    afterKey() {
      if (phase === 'lifted') phase = null;
    },
    isPartOfRepeat(input?: Dynamic) {
      if (isOver) return false;
      if (input.type === 'pointercancel') {
        let value = phase === 'held';
        if (value) lastTimeStamp = input.timeStamp;
        phase = null;
        return value;
      }
      if (isZeroPointPointerEvent(input)) return false;
      if (input.type === 'pointerdown' && ((input.button ?? 0) !== 0 || input.ctrlKey === true)) {
        isOver = true;
        return false;
      }
      if (input.type === 'pointerdown') {
        let value = Math.hypot(input.clientX - press.clientX, input.clientY - press.clientY);
        isOver =
          (isStrict && wasHeld) ||
          (input.isMeantAnew === true && value >= PRESS_MOVE_ANEW_MAX_PX) ||
          value >= PRESS_MOVE_MAX_PX ||
          input.timeStamp - lastTimeStamp > PRESS_REPEAT_MAX_MS;
        phase = isOver ? null : 'held';
        wasHeld = !isOver;
        return !isOver;
      }
      if (phase === 'lifted') return input.timeStamp - lastTimeStamp <= PRESS_LIFT_REPEAT_MAX_MS;
      if (phase === null) return false;
      if (input.type === 'pointerup') {
        phase = 'lifted';
        lastTimeStamp = input.timeStamp;
      }
      return true;
    },
  };
}
export function swallowRestOfPress(event?: Dynamic, isMeantAnew: Dynamic = () => false, isStrict: Dynamic = false) {
  let win = event.currentTarget.ownerDocument.defaultView;
  if (win === null || isZeroPointPointerEvent(event)) return;
  let { isPartOfRepeat: isPartOfRepeat, afterKey: afterKey, isOver: isOver } = createRestOfPressTracker(event, isStrict);
  let eventTypes = ['pointerdown', ...PRESS_FOLLOW_UP_EVENT_TYPES];
  let onEvent = (event2?: Dynamic) => {
    let { type: value, clientX: value2, clientY: value3, timeStamp: value4, button: value5, ctrlKey: value6 } = event2;
    let value7 = value === 'pointerdown' && isMeantAnew(event2.target);
    if (
      isPartOfRepeat({
        type: value,
        clientX: value2,
        clientY: value3,
        timeStamp: value4,
        button: value5,
        ctrlKey: value6,
        isMeantAnew: value7,
      })
    ) {
      event2.preventDefault();
      event2.stopImmediatePropagation();
    }
    if (!isOver()) return;
    for (let value8 of eventTypes as Dynamic) win.removeEventListener(value8, onEvent, true);
    win.removeEventListener('keydown', afterKey, true);
  };
  for (let value of eventTypes as Dynamic) win.addEventListener(value, onEvent, true);
  win.addEventListener('keydown', afterKey, true);
}
export function swallowRestOfPressFromEvent(event?: Dynamic, isStrict?: Dynamic) {
  if (!('clientX' in event) || !(event.target instanceof Element)) return;
  let { clientX: clientX, clientY: clientY, timeStamp: timeStamp, target: target } = event;
  swallowRestOfPress(
    {
      clientX: clientX,
      clientY: clientY,
      timeStamp: timeStamp,
      currentTarget: target,
    },
    undefined,
    isStrict,
  );
}
export function swallowPressAfterItemPress(reason?: Dynamic, event?: Dynamic) {
  if (reason === 'item-press') swallowRestOfPressFromEvent(event, false);
}
export function swallowPressAfterTriggerPress(reason?: Dynamic, event?: Dynamic) {
  if (reason === 'trigger-press') swallowRestOfPressFromEvent(event, true);
}
export function swallowRepeatedDeleteKeys(win?: Dynamic, onEventsFinished?: Dynamic) {
  if (win === null || win === undefined) return;
  let swallowFrom: Dynamic = Number.POSITIVE_INFINITY;
  onEventsFinished(
    () =>
      afterNextFrameOrTimeout(win, () => {
        swallowFrom = win.performance.now();
      }),
  );
  let eventTypes = ['keydown', 'keyup', 'pointerdown'];
  let onEvent = (event?: Dynamic) => {
    let key = 'key' in event && typeof event.key === 'string' ? event.key : null;
    let isDeleteKey = key === 'Delete' || key === 'Backspace';
    let isSoon = event.timeStamp - swallowFrom <= PRESS_REPEAT_MAX_MS;
    if (isDeleteKey) swallowFrom = Math.max(swallowFrom, event.timeStamp);
    if (event.type === 'keyup' || (key !== null && isModifierOrFnKey(key))) return;
    if (isDeleteKey && isSoon) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    for (let type of eventTypes as Dynamic) win.removeEventListener(type, onEvent, true);
  };
  for (let type of eventTypes as Dynamic) win.addEventListener(type, onEvent, true);
}
export const PRESS_MOVE_MAX_PX = 24;
export const PRESS_MOVE_ANEW_MAX_PX = 6;
export const PRESS_REPEAT_MAX_MS = 1000;
export const PRESS_LIFT_REPEAT_MAX_MS = 400;
export const isZeroPointPointerEvent = ({ clientX: clientX, clientY: clientY }: Dynamic) => clientX === 0 && clientY === 0;
export const PRESS_FOLLOW_UP_EVENT_TYPES = [
  'mousedown',
  'pointerup',
  'pointercancel',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
];
export const isModifierOrFnKey = (key?: Dynamic) => MODIFIER_KEYS.has(key) || key === 'Fn' || key === 'FnLock';
