import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { QUICK_FOCUS_RETURN_MS } from '../app/press-tracker.ts';
import { POPUP_EDGE_GAP } from '../ui/popup-placement.ts';
export let keyboardInset: Dynamic;
export let bottomSafeAreaInset: Dynamic;
export let isBottomSafeAreaTold: Dynamic;
export let currentFootInset: Dynamic;
export let barsInsetAtFoot: Dynamic;
export let safeAreaSettlesAt: Dynamic;
export let hasSafeAreaSettled: Dynamic;
export function setKeyboardInset(inset?: Dynamic) {
  keyboardInset = inset;
  for (let listener of bottomInsetListeners as Dynamic) listener();
}
export function setBottomSafeAreaInset(inset?: Dynamic) {
  isBottomSafeAreaTold = true;
  if (inset === bottomSafeAreaInset) return;
  if (inset === 0) {
    safeAreaSettlesAt = -1 / 0;
    hasSafeAreaSettled = false;
  }
  bottomSafeAreaInset = inset;
  for (let listener of bottomInsetListeners as Dynamic) listener();
}
export function setBarsInsetAtFoot(inset?: Dynamic) {
  if (inset === barsInsetAtFoot) return;
  barsInsetAtFoot = inset;
  for (let listener of bottomInsetListeners as Dynamic) listener();
}
export function setCurrentFootInset(inset?: Dynamic) {
  if (inset === currentFootInset) return;
  currentFootInset = inset;
  for (let listener of bottomInsetListeners as Dynamic) listener();
}
export function useFootInsetOf(footElement?: Dynamic) {
  React.useLayoutEffect(() => (setCurrentFootInset(footElement?.offsetHeight ?? 0), () => setCurrentFootInset(0)), [footElement]);
}
export function subscribeBottomInsets(listener?: Dynamic) {
  bottomInsetListeners.add(listener);
  return () => void bottomInsetListeners.delete(listener);
}
export function useCoveredUnderCellsProperty(elementRef?: Dynamic) {
  React.useLayoutEffect(() => {
    let writeProperty = () => elementRef.current?.style.setProperty('--sheet-covered-under-cells', `${getCoveredUnderCells()}px`);
    writeProperty();
    return subscribeBottomInsets(writeProperty);
  }, [elementRef]);
}
export function waitForSafeAreaToSettle(clock: Dynamic = DEFAULT_INSET_CLOCK) {
  if (bottomSafeAreaInset === 0 || hasSafeAreaSettled) return;
  let settlesAt = clock.now() + SAFE_AREA_SETTLE_MS;
  safeAreaSettlesAt = settlesAt;
  clock.callAfter(SAFE_AREA_SETTLE_MS, () => {
    if (safeAreaSettlesAt !== settlesAt) return;
    safeAreaSettlesAt = -1 / 0;
    hasSafeAreaSettled = true;
    for (let listener of bottomInsetListeners as Dynamic) listener();
  });
}
export function onActsWhileFootCovered(target?: Dynamic, act?: Dynamic, isFootCovered: Dynamic = hasBottomSafeArea) {
  let actIfCovered = () => {
    if (isFootCovered() !== false) act();
  };
  actIfCovered();
  let eventTypes = ['pointerdown', 'click', 'keydown'];
  for (let eventType of eventTypes as Dynamic) target.addEventListener(eventType, actIfCovered, true);
  return () => {
    for (let eventType of eventTypes as Dynamic) target.removeEventListener(eventType, actIfCovered, true);
  };
}
export function callAgainOnQuickReturn(
  win?: Dynamic,
  call?: Dynamic,
  shouldCallAgain?: Dynamic,
  isFootCovered: Dynamic = hasBottomSafeArea,
  nowMs2: Dynamic = DEFAULT_INSET_CLOCK.now,
) {
  call();
  if (win.document.hasFocus() || !shouldCallAgain()) return () => {};
  let calledAt = nowMs2();
  let stopListening = () => win.removeEventListener('focus', onFocus);
  function onFocus() {
    stopListening();
    if (nowMs2() - calledAt <= QUICK_FOCUS_RETURN_MS && isFootCovered() !== false) call();
  }
  win.addEventListener('focus', onFocus);
  return stopListening;
}
export function useBottomInsetWhileOpen(isOpen?: Dynamic, followsHover: Dynamic = true, afterSettling: Dynamic = false) {
  let readInset = afterSettling ? bottomInsetAfterSettling : getBottomInset;
  let [inset, setInset] = React.useState(0);
  let [wasOpen, setWasOpen] = React.useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setInset(readInset());
  }
  React.useEffect(() => {
    if (!isOpen) return;
    let updateCoveredHeight = () => {
      let next = readInset();
      let isHoverOff = followsHover && (document as Dynamic).querySelector(`${OPEN_PORTAL_POPUP_SELECTOR}:hover`) === null;
      setInset((current?: Dynamic) => (next > current || isHoverOff ? next : current));
    };
    let unsubscribe = subscribeBottomInsets(updateCoveredHeight);
    if (!followsHover) return unsubscribe;
    (document as Dynamic).addEventListener('pointerover', updateCoveredHeight);
    (document as Dynamic).documentElement.addEventListener('pointerleave', updateCoveredHeight);
    return () => {
      unsubscribe();
      (document as Dynamic).removeEventListener('pointerover', updateCoveredHeight);
      (document as Dynamic).documentElement.removeEventListener('pointerleave', updateCoveredHeight);
    };
  }, [isOpen, followsHover, readInset]);
  return inset;
}
export function popupPropsUnderHeader() {
  return NO_POPUP_PROPS;
}
export const NO_POPUP_PROPS: Dynamic = {};
export function usePopupRoomAtFoot(isOpen?: Dynamic, getAnchor?: Dynamic, afterSettling: Dynamic = false) {
  let inset = useBottomInsetWhileOpen(isOpen, true, afterSettling);
  if (inset === 0) return null;
  return {
    sideOffset: ({ side: side, anchor: anchor }: Dynamic) => {
      let anchorElement = getAnchor();
      if (side !== 'top' || anchorElement === null || anchorElement === undefined) return POPUP_SIDE_OFFSET;
      let bounds = anchorElement.getBoundingClientRect();
      let centerTop = bounds.top + (bounds.height - anchor.height) / 2;
      let roomTop = anchorElement.ownerDocument.documentElement.clientHeight - inset;
      return POPUP_SIDE_OFFSET + Math.max(0, centerTop - roomTop);
    },
    collisionPadding: popupCollisionPadding(inset),
    collisionAvoidance: {
      fallbackAxisSide: 'none',
    },
  };
}
keyboardInset = 0;
bottomSafeAreaInset = 0;
isBottomSafeAreaTold = false;
currentFootInset = 0;
barsInsetAtFoot = 0;
export const bottomInsetListeners = new (Set as Dynamic)();
export const getBottomSafeAreaInset = () => bottomSafeAreaInset;
export const hasBottomSafeArea = () => (isBottomSafeAreaTold ? bottomSafeAreaInset > 0 : null);
export const getKeyboardInset = () => keyboardInset;
export const getBottomInset = () => Math.max(keyboardInset, bottomSafeAreaInset);
export const zeroBottomInset = () => 0;
export const useBottomInset = () => React.useSyncExternalStore(subscribeBottomInsets, getBottomInset, zeroBottomInset);
export const getBarsInsetAtFoot = () => barsInsetAtFoot;
export const useBarsInsetAtFoot = () => React.useSyncExternalStore(subscribeBottomInsets, getBarsInsetAtFoot, zeroBottomInset);
export const getCoveredUnderCells = () => getBottomInset() + currentFootInset;
export const useCoveredUnderCells = () => React.useSyncExternalStore(subscribeBottomInsets, getCoveredUnderCells, zeroBottomInset);
export const SAFE_AREA_SETTLE_MS = 750;
safeAreaSettlesAt = -1 / 0;
hasSafeAreaSettled = false;
export const DEFAULT_INSET_CLOCK = {
  now: () => performance.now(),
  callAfter: (delayMs?: Dynamic, run?: Dynamic) => void setTimeout(run, delayMs),
};
export const bottomInsetAfterSettling = (now: Dynamic = performance.now()) =>
  now < safeAreaSettlesAt ? keyboardInset : getBottomInset();
export const OPEN_PORTAL_POPUP_SELECTOR = '[data-base-ui-portal] :is([role="menu"], [role="dialog"], [role="listbox"])';
export const popupCollisionPadding = (bottomInset?: Dynamic) => ({
  top: POPUP_EDGE_GAP,
  right: POPUP_EDGE_GAP,
  bottom: POPUP_EDGE_GAP + bottomInset,
  left: POPUP_EDGE_GAP,
});
export const POPUP_SIDE_OFFSET = 6;
