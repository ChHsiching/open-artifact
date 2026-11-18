import type { Dynamic } from '../dynamic.ts';
import { DRAG_START_DISTANCE } from '../grid/geometry.ts';
import { getKeyboardInset } from './bottom-insets.ts';
export function shouldPreventTouchScroll({ dx: dx, dy: dy, field: field, overflow: overflow, isKeyboardUp: isKeyboardUp }: Dynamic) {
  let scrollsDown = field.scrollHeight - field.clientHeight > 1 && isScrollableOverflow(overflow.y);
  let scrollsAcross = Math.abs(dx) > Math.abs(dy) && field.scrollWidth - field.clientWidth > 1 && isScrollableOverflow(overflow.x);
  return isKeyboardUp && !scrollsDown && !scrollsAcross;
}
export function preventPageScrollOverField(field?: Dynamic) {
  let touchStart: Dynamic = null;
  let isPrevented: Dynamic = null;
  let onTouchStart = ({ targetTouches: targetTouches }: Dynamic) => {
    let [touch] = targetTouches;
    isPrevented = null;
    touchStart =
      touch === undefined || targetTouches.length > 1
        ? null
        : {
            x: touch.clientX,
            y: touch.clientY,
          };
  };
  let onTouchMove = (touchEvent?: Dynamic) => {
    let [touch] = touchEvent.targetTouches;
    if (touchStart === null || touch === undefined || touchEvent.targetTouches.length > 1) return;
    if (isPrevented === null) {
      let [dx, dy] = [touch.clientX - touchStart.x, touch.clientY - touchStart.y];
      if (Math.hypot(dx, dy) < DRAG_START_DISTANCE) return;
      let { overflowX: overflowX, overflowY: overflowY } = getComputedStyle(field);
      isPrevented = shouldPreventTouchScroll({
        dx: dx,
        dy: dy,
        field: field,
        overflow: {
          x: overflowX,
          y: overflowY,
        },
        isKeyboardUp: getKeyboardInset() > 0,
      });
    }
    if (isPrevented && touchEvent.cancelable) touchEvent.preventDefault();
  };
  field.addEventListener('touchstart', onTouchStart, {
    passive: true,
  });
  field.addEventListener('touchmove', onTouchMove, {
    passive: false,
  });
  return () => {
    field.removeEventListener('touchstart', onTouchStart);
    field.removeEventListener('touchmove', onTouchMove);
  };
}
export const isScrollableOverflow = (overflow?: Dynamic) => overflow === 'auto' || overflow === 'scroll';
