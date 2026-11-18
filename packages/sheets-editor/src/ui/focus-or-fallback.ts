import type { Dynamic } from '../dynamic.ts';
export function focusOrFallback(target?: Dynamic, canFocus?: Dynamic, getFallback?: Dynamic, getActiveElement?: Dynamic) {
  if (target === null || !canFocus(target)) return false;
  target.focus({
    preventScroll: true,
    focusVisible: true,
  });
  if (getActiveElement() === target) return true;
  let fallback = getFallback();
  fallback?.focus({
    preventScroll: true,
    focusVisible: false,
  });
  return fallback !== null && getActiveElement() === fallback;
}
