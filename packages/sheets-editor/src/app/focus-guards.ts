import type { Dynamic } from '../dynamic.ts';
export function patchMethodUntilUndone(target?: Dynamic, methodName?: Dynamic, wrap?: Dynamic) {
  let original = target[methodName];
  let patched = wrap(original);
  target[methodName] = patched;
  return () => {
    if (target[methodName] === patched) target[methodName] = original;
  };
}
export function holdProgrammaticFocus(view?: Dynamic, shouldHold?: Dynamic, onHeld: Dynamic = () => {}) {
  let isActive: Dynamic = true;
  let isHolding = () => isActive && shouldHold();
  let elementClasses = [view.HTMLElement, view.SVGElement, view.MathMLElement];
  let undoPatches = [
    ...[view, ...elementClasses.flatMap((elementClass?: Dynamic) => elementClass?.prototype ?? [])].map(
      (target?: Dynamic) =>
        patchMethodUntilUndone(
          target,
          'focus',
          (originalFocus?: Dynamic) =>
            function (this: Dynamic, focusOptions?: Dynamic) {
              if (isHolding()) onHeld(this);
              else originalFocus.call(this, focusOptions);
            },
        ),
    ),
    ...[view.HTMLInputElement, view.HTMLTextAreaElement].map(
      ({ prototype: prototype }: Dynamic) =>
        patchMethodUntilUndone(
          prototype,
          'select',
          (originalSelect?: Dynamic) =>
            function (this: Dynamic) {
              if (!isHolding()) originalSelect.call(this);
            },
        ),
    ),
  ];
  return () => {
    isActive = false;
    undoPatches.forEach((undo2?: Dynamic) => undo2());
  };
}
export function createScrollGestureTimer(now: Dynamic = () => performance.now()) {
  let startedAt: Dynamic = Number.NEGATIVE_INFINITY;
  return {
    begin: () => void (startedAt = now()),
    end: () => void (startedAt = Number.NEGATIVE_INFINITY),
    isUnderWay: () => now() - startedAt < SCROLL_GESTURE_HOLD_MS,
  };
}
export function watchWindowFocusLeft(view?: Dynamic, now: Dynamic = () => performance.now()) {
  let leftAt: Dynamic = view.document.hasFocus() ? null : Number.NEGATIVE_INFINITY;
  let hadFocusLeft: Dynamic = false;
  let onBlur = () => {
    leftAt = now();
  };
  let onFocus = () => {
    leftAt = null;
  };
  let onVisibilityChange = () => {
    hadFocusLeft = view.document.visibilityState === 'hidden' && leftAt !== null && now() - leftAt > 500;
  };
  view.addEventListener('blur', onBlur);
  view.addEventListener('focus', onFocus);
  view.addEventListener('visibilitychange', onVisibilityChange);
  return {
    hadFocusLeftBefore: () => hadFocusLeft,
    stop() {
      view.removeEventListener('blur', onBlur);
      view.removeEventListener('focus', onFocus);
      view.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
export const isTrustedPointerDownEvent = ({ event: event }: Dynamic) => event?.isTrusted === true && event.type === 'pointerdown';
export const SCROLL_GESTURE_HOLD_MS = 500;
