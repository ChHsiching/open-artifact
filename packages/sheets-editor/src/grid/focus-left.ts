import type { Dynamic } from '../dynamic.ts';
export let focusLeftChecksHeld: Dynamic;
export let windowBlurCount: Dynamic;
export function holdFocusLeftChecksForATick() {
  focusLeftChecksHeld += 1;
  setTimeout(() => {
    focusLeftChecksHeld -= 1;
  });
}
export function checkWhereFocusWent(doc?: Dynamic, element?: Dynamic, onLeft?: Dynamic, evenWithoutCharts: Dynamic = false) {
  if (element === null) windowBlurCount += 1;
  if (focusLeftChecksHeld > 0) return;
  if (!hasChartFrame(doc) && !evenWithoutCharts) {
    onLeft(false);
    return;
  }
  let value = windowBlurCount;
  setTimeout(() => {
    let [items, items2] = [doc.activeElement, doc.hasFocus()];
    if (
      focusLeftChecksHeld === 0 &&
      !(items2 && (element === null || (items === element && windowBlurCount !== value))) &&
      items?.matches('iframe.sheet-chart-frame') !== true
    )
      onLeft(items2);
  });
}
focusLeftChecksHeld = 0;
windowBlurCount = 0;
export const hasChartFrame = (element?: Dynamic) => element.querySelector('iframe.sheet-chart-frame') !== null;
export const areFocusLeftChecksHeld = () => focusLeftChecksHeld > 0;
export const whenBlurredToNothing = (element?: Dynamic, options?: Dynamic) =>
  checkWhereFocusWent(element.ownerDocument, element, options);
export const whenBlurredToNothingChecked = (element?: Dynamic, options?: Dynamic) =>
  checkWhereFocusWent(element.ownerDocument, element, options, true);
export const whenWindowBlurred = (input?: Dynamic, options?: Dynamic) => checkWhereFocusWent(input, null, options);
export const isFocusWithinSameMenu = (input?: Dynamic, options?: Dynamic) =>
  input.closest('[role="menu"]')?.contains(options) === true;
