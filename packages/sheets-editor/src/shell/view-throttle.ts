import type { Dynamic } from '../dynamic.ts';
export function throttleViewChanges(onView?: Dynamic, targetWindow?: Dynamic) {
  let pending: Dynamic = null;
  let timer: Dynamic;
  let wasThrottled: Dynamic = false;
  return (view?: Dynamic, throttled?: Dynamic) => {
    let shouldWait = throttled && (!wasThrottled || pending !== null);
    wasThrottled = throttled;
    if (!shouldWait) {
      targetWindow.clearTimeout(timer);
      pending = null;
      onView(view);
      return;
    }
    if (pending === null)
      timer = targetWindow.setTimeout(() => {
        let value = pending;
        pending = null;
        if (value !== null) onView(value.view);
      }, VIEW_CHANGE_THROTTLE_MS);
    pending = {
      view: view,
    };
  };
}
export const VIEW_CHANGE_THROTTLE_MS = 100;
