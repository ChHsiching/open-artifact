import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
export function giveUpPopupAround(element?: Dynamic) {
  for (let node: Dynamic = isElementLike(element) ? element : null; node !== null; node = node.parentElement) {
    let entry = popupGiveUpHandlers.get(node);
    if (entry !== undefined) return entry();
  }
}
export function usePopupGivenUpOnBlur(isOpen?: Dynamic, giveUp?: Dynamic) {
  let [isGivenUp, setIsGivenUp] = React.useState(false);
  if (!isOpen && isGivenUp) setIsGivenUp(false);
  let ref = React.useRef(false);
  let ref2 = React.useRef({
    isOpen: isOpen,
    giveUp: giveUp,
  });
  React.useLayoutEffect(() => {
    ref2.current = {
      isOpen: isOpen,
      giveUp: giveUp,
    };
  });
  React.useLayoutEffect(() => {
    if (!isOpen) return;
    ref.current = false;
    let value2 = () => setIsGivenUp(false);
    (window as Dynamic).addEventListener('focus', value2);
    return () => (window as Dynamic).removeEventListener('focus', value2);
  }, [isOpen]);
  let [value] = React.useState(
    () => ({
      holdPopup: (input?: Dynamic) => {
        if (input === null) return;
        registerPopupGiveUp(input, () => {
          if (!ref2.current.isOpen || ref.current) return;
          setIsGivenUp(true);
          ref2.current.giveUp();
        });
      },
      noteFocus: () => {
        ref.current = true;
      },
    }),
  );
  return {
    isGivenUp: isGivenUp,
    ...value,
  };
}
export function useShutOnWindowBlur(isOpen?: Dynamic, shut?: Dynamic) {
  let [isShut, setIsShut] = React.useState(false);
  if (!isOpen && isShut) setIsShut(false);
  let ref = React.useRef(false);
  let value = React.useEffectEvent(() => {
    if (ref.current || (document as Dynamic).activeElement instanceof HTMLIFrameElement) return;
    setIsShut(true);
    shut();
  });
  React.useLayoutEffect(() => {
    if (!isOpen) return;
    ref.current = false;
    let value3 = () => value();
    let value4 = () => setIsShut(false);
    (window as Dynamic).addEventListener('blur', value3);
    (window as Dynamic).addEventListener('focus', value4);
    return () => {
      (window as Dynamic).removeEventListener('blur', value3);
      (window as Dynamic).removeEventListener('focus', value4);
    };
  }, [isOpen]);
  let [value2] = React.useState(
    () => () => {
      ref.current = true;
    },
  );
  return {
    isShut: isShut,
    noteFocus: value2,
  };
}
export const CanTakeFocusContext = React.createContext(() => false);
export const isElementLike = (input?: Dynamic) => typeof input === 'object' && input !== null && 'parentElement' in input;
export const popupGiveUpHandlers = new (WeakMap as Dynamic)();
export const registerPopupGiveUp = (input?: Dynamic, options?: Dynamic) => void popupGiveUpHandlers.set(input, options);
