import type { Dynamic } from '../dynamic.ts';
import { MODIFIER_KEYS } from '../state/escape.ts';
export function createPersonInputWatch(win?: Dynamic, now?: Dynamic) {
  let hasInputCome: Dynamic = false;
  let lastInputAt: Dynamic = -1 / 0;
  let hadRested: Dynamic = false;
  let wasPointerPressedLast: Dynamic = false;
  let onInput = (event?: Dynamic) => {
    hasInputCome = true;
    if (MODIFIER_KEYS.has(String(Reflect.get(event, 'key')))) return;
    let time = Math.min(event.timeStamp, now());
    hadRested = Reflect.get(event, 'repeat') !== true && time - lastInputAt >= INPUT_REST_MS;
    lastInputAt = Math.max(lastInputAt, time);
  };
  for (let eventType of PERSON_INPUT_EVENTS as Dynamic) win.addEventListener(eventType, onInput, true);
  return {
    hasAnyCome: () => hasInputCome || win.navigator.userActivation?.hasBeenActive !== false,
    hadRestedBeforeLast: () => hadRested,
    restBeginsNow: () => void (lastInputAt = now()),
    notePointerPressedLast: (isPointer?: Dynamic) => void (wasPointerPressedLast = isPointer),
    wasPointerPressedLast: () => wasPointerPressedLast,
  };
}
export const PERSON_INPUT_EVENTS = ['keydown', 'pointerdown', 'mousedown'];
export const INPUT_REST_MS = 1000;
