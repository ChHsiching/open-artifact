import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { areFocusLeftChecksHeld } from '../../grid/focus-left.ts';
export function watchWindowLeave(
  target: Dynamic,
  { windowLeft: windowLeft, drawShut: drawShut, close: close, staysOpen: staysOpen }: Dynamic,
) {
  let isClosing: Dynamic = false;
  let onBlur = ({ isTrusted: isTrusted }: Dynamic) => {
    if (!isTrusted || areFocusLeftChecksHeld()) return;
    windowLeft(true);
    if (isClosing || staysOpen()) return;
    isClosing = true;
    drawShut();
    close();
  };
  let onFocus = ({ isTrusted: isTrusted }: Dynamic) => {
    if (!isTrusted) return;
    windowLeft(false);
    if (isClosing) close();
  };
  target.addEventListener('blur', onBlur);
  target.addEventListener('focus', onFocus);
  return {
    stop: () => {
      target.removeEventListener('blur', onBlur);
      target.removeEventListener('focus', onFocus);
    },
  };
}
export function useShutOnWindowLeave({ isOpen: isOpen, placeAsked: placeAsked, close: close, staysOpen: staysOpen }: Dynamic) {
  let [isShut, setIsShut] = React.useState(false);
  let [isWindowLeft, setIsWindowLeft] = React.useState(false);
  if (isWindowLeft && !isOpen) setIsWindowLeft(false);
  let [seenPlaceAsked, setSeenPlaceAsked] = React.useState(placeAsked);
  if (placeAsked !== seenPlaceAsked) setSeenPlaceAsked(placeAsked);
  if (isShut && (!isOpen || placeAsked !== seenPlaceAsked)) setIsShut(false);
  let openPlace = isOpen ? placeAsked : null;
  React.useLayoutEffect(() => {
    if (openPlace === null) return;
    return watchWindowLeave(window, {
      windowLeft: setIsWindowLeft,
      drawShut: () => setIsShut(true),
      close: () => close(openPlace),
      staysOpen: staysOpen,
    }).stop;
  }, [openPlace, close, staysOpen]);
  return {
    isShut: isOpen && isShut,
    isWindowLeft: isWindowLeft,
  };
}
