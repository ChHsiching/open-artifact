import type { Dynamic } from '../../dynamic.ts';
import { MODIFIER_KEYS } from '../../state/escape.ts';
export function createPressForFixesTracker(now: Dynamic = () => performance.now()) {
  let noted: Dynamic = null;
  let forget = () => {
    for (let eventType of PRESS_EVENT_TYPES as Dynamic) noted?.heardBy.removeEventListener(eventType, onPressAfter, true);
    noted = null;
  };
  function onPressAfter(pressEvent?: Dynamic) {
    if (pressEvent.type !== 'keydown' || !isRepeatOrModifierKey(pressEvent)) forget();
  }
  return {
    note: (heardBy?: Dynamic) => {
      forget();
      if (heardBy === null) return;
      noted = {
        heardBy: heardBy,
        atMs: now(),
      };
      for (let eventType of PRESS_EVENT_TYPES as Dynamic) heardBy.addEventListener(eventType, onPressAfter, true);
    },
    isFresh: () => noted !== null && now() - noted.atMs < PRESS_FOR_FIXES_FRESH_MS,
    forget: forget,
  };
}
export const PRESS_EVENT_TYPES = ['pointerdown', 'keydown'];
export const PRESS_FOR_FIXES_FRESH_MS = 3000;
export const isRepeatOrModifierKey = (pressEvent?: Dynamic) =>
  ('repeat' in pressEvent && pressEvent.repeat === true) ||
  ('key' in pressEvent && typeof pressEvent.key === 'string' && MODIFIER_KEYS.has(pressEvent.key));
