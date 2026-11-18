import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { isNonNullObject } from '../utils/objects.ts';
import { DRAG_START_DISTANCE } from './geometry.ts';
import { useKeysOffCells, doCellsTakeNoText } from '../app/keys-off-cells.ts';
export function caretOffsetAtPoint(element: Dynamic, { x: x, y: y }: Dynamic) {
  if (element.offsetAtPoint !== undefined)
    return element.offsetAtPoint({
      x: x,
      y: y,
    });
  let entry = Reflect.get(element.ownerDocument, 'caretPositionFromPoint');
  if (typeof entry !== 'function') return null;
  let value = Reflect.apply(entry, element.ownerDocument, [x, y]);
  if (!isNonNullObject(value) || value.offsetNode !== element) return null;
  return typeof value.offset === 'number' ? value.offset : null;
}
export function createFingerTapCaret() {
  let value: Dynamic = null;
  return {
    fingerCameDownIn: (input?: Dynamic, options?: Dynamic, context?: Dynamic) => {
      value = {
        box: input,
        pointerId: options,
        at: context,
      };
    },
    fingerLifted: (input: Dynamic, { x: x, y: y }: Dynamic) => {
      if (value?.pointerId !== input) return false;
      let { box: value2, at: value3 } = value;
      value = null;
      if (Math.hypot(x - value3.x, y - value3.y) >= DRAG_START_DISTANCE) return false;
      if (value2.ownerDocument.activeElement === value2) return false;
      let value4 = caretOffsetAtPoint(value2, {
        x: x,
        y: y,
      });
      if (value4 === null) return false;
      value2.focus({
        preventScroll: true,
      });
      value2.setSelectionRange(value4, value4);
      return true;
    },
    forget: () => {
      value = null;
    },
  };
}
export function refocusInContextBar(input?: Dynamic, options?: Dynamic, context?: Dynamic) {
  let value = input === null || input.isConnected ? input : context();
  if (value === null) return false;
  if (value.closest('[data-part-of-context-bar]:not([data-ending-style])') === null) return false;
  value.focus({
    preventScroll: true,
  });
  return options() === value;
}
export function createWindowFocusCheck({
  check: check,
  isDialogOpen: isDialogOpen,
  isDialogOwedCaret: isDialogOwedCaret,
  timesFocusLeft: timesFocusLeft,
}: Dynamic) {
  let value: Dynamic;
  return {
    windowGotFocus() {
      clearTimeout(value);
      if (isDialogOpen() && !isDialogOwedCaret()) return check();
      let value2 = timesFocusLeft();
      let value3: Dynamic = false;
      let value4 = () => {
        if (value3) return;
        value3 = true;
        if (timesFocusLeft() === value2) check();
      };
      queueMicrotask(value4);
      value = setTimeout(value4);
    },
    stop: () => clearTimeout(value),
  };
}
export function useCaretAfterComment(input?: Dynamic) {
  let { doCellsTakeNoText: value, hasKeyboardLeft: value2 } = useKeysOffCells();
  let ref = React.useRef(false);
  let value3 = React.useEffectEvent(input);
  React.useEffect(() => {
    if (value || !ref.current) return;
    ref.current = false;
    if (!value2 && (document as Dynamic).hasFocus()) value3();
  }, [value, value2]);
  return {
    noteCommentChosen: React.useCallback(() => void (ref.current = doCellsTakeNoText()), []),
    isCaretLeft: React.useCallback(() => ref.current && doCellsTakeNoText(), []),
  };
}
export function createFingerPressTracker() {
  let value: Dynamic = null;
  return {
    notePress: ({ pointerId: pointerId, isByFinger: isByFinger, isOnChart: isOnChart, hadCaret: hadCaret }: Dynamic) => (
      (value =
        isByFinger && !isOnChart
          ? {
              pointerId: pointerId,
              hadCaret: hadCaret,
            }
          : null),
      value === null
    ),
    noteLift: (input?: Dynamic, options?: Dynamic) => {
      if (value?.pointerId !== input) return false;
      let { hadCaret: value2 } = value;
      value = null;
      return options === null || options === value2;
    },
  };
}
export const pickFocusTarget = (input?: Dynamic, options?: Dynamic, context?: Dynamic) =>
  options === false ? false : (input ?? context());
export const isFocusOutsideSearchOrErrors = (input?: Dynamic) =>
  ['search', '[data-errors-offered]'].every((input2?: Dynamic) => (input?.closest(input2) ?? null) === null);
