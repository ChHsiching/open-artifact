import { prefersReducedMotion } from '../kit/platform.ts';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { getKeyboardInset, subscribeBottomInsets } from './bottom-insets.ts';
export let phoneTouchMedia: Dynamic;
export let cachedWindowSize: Dynamic;
export function useTabsAway(isAskedAway?: Dynamic) {
  let isPhoneTouch = usePhoneTouch();
  let isKeyboardUp = useIsKeyboardUp();
  let windowSize = useWindowSize();
  let [areTabsAway, setTabsAway] = React.useState(false);
  let [fullWindowSize, setFullWindowSize] = React.useState(windowSize);
  let keptFullSize = keptFullWindowSize(fullWindowSize, windowSize, isAskedAway || areTabsAway);
  if (keptFullSize !== fullWindowSize) setFullWindowSize(keptFullSize);
  let isShortened = isFrameShortenedBy(keptFullSize, windowSize);
  let shouldTabsGo = isPhoneTouch && (isKeyboardUp || isShortened) && (isAskedAway || areTabsAway);
  if (shouldTabsGo !== areTabsAway) setTabsAway(shouldTabsGo);
  return {
    areTabsAway: shouldTabsGo,
    isFrameShortened: shouldTabsGo && isShortened,
  };
}
export function slideFromTo(
  element: Dynamic,
  { from: from, to: to, isKeyboardComing: isKeyboardComing }: Dynamic,
  keyframeStyle: Dynamic = {},
) {
  slideAnimations.get(element)?.cancel();
  if (from === to || prefersReducedMotion()) return;
  let style = getComputedStyle(element);
  let cssValue = (property?: Dynamic, fallback?: Dynamic) => {
    let value = style.getPropertyValue(property).trim();
    return value === '' ? fallback : value;
  };
  let duration = cssValue('--ui-dur-sheet', '300ms');
  let animation = element.animate(
    [
      {
        ...keyframeStyle,
        transform: `translateY(${from}px)`,
      },
      {
        ...keyframeStyle,
        transform: `translateY(${to}px)`,
      },
    ],
    {
      duration: Number.parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000),
      easing: isKeyboardComing ? cssValue('--ui-ease-out', 'ease-out') : SLIDE_EASING,
    },
  );
  slideAnimations.set(element, animation);
}
export function placeWithoutSlide(element?: Dynamic) {
  let [{ top: top, height: height }, slideOffset] = [element.getBoundingClientRect(), slideOffsetNow(element)];
  return {
    top: top - slideOffset,
    height: height,
    under: slideOffset,
  };
}
export function watchKeyboardSlides(frame?: Dynamic) {
  let overGrid = frame?.querySelector('.sheet-over-grid') ?? null;
  let tabs = frame?.querySelector('.sheet-bar') ?? null;
  if (frame === null || overGrid === null || tabs === null) return;
  let measure = () => {
    if (tabs.getClientRects().length === 0) return null;
    let card = frame.querySelector('.sheet-foot');
    return {
      roomUnderLayout: getKeyboardInset(),
      heightOfFrame: frame.ownerDocument.documentElement.clientHeight,
      areTabsAway: frame.hasAttribute('data-are-tabs-away'),
      card: card === null ? null : placeWithoutSlide(card),
      tabs: placeWithoutSlide(tabs),
    };
  };
  let last: Dynamic = measure();
  let observer = new (ResizeObserver as Dynamic)(() => {
    let [before, after] = [last, measure()];
    last = after;
    if (before === null || after === null || !getPhoneTouchMedia().matches) return;
    if (before.roomUnderLayout === after.roomUnderLayout && before.areTabsAway === after.areTabsAway) return;
    let isKeyboardComing = after.roomUnderLayout > before.roomUnderLayout || after.heightOfFrame < before.heightOfFrame;
    let card = frame.querySelector('.sheet-foot');
    if (card !== null && before.card !== null && after.card !== null) {
      let cardFrom = bottomOfPlace(before.card) - bottomOfPlace(after.card) + after.card.under;
      slideFromTo(card, {
        from: cardFrom,
        to: 0,
        isKeyboardComing: isKeyboardComing,
      });
    }
    let tabsFrom = before.tabs.top - after.tabs.top + after.tabs.under;
    if (after.areTabsAway && !before.areTabsAway && Math.abs(tabsFrom) > 0.5)
      slideFromTo(
        tabs,
        {
          from: tabsFrom,
          to: tabsFrom + before.tabs.height,
          isKeyboardComing: isKeyboardComing,
        },
        {
          visibility: 'visible',
        },
      );
    else if (!after.areTabsAway && !before.areTabsAway)
      slideFromTo(tabs, {
        from: tabsFrom,
        to: 0,
        isKeyboardComing: isKeyboardComing,
      });
    else slideAnimations.get(tabs)?.cancel();
  });
  observer.observe(frame.ownerDocument.body);
  observer.observe(overGrid);
  return () => observer.disconnect();
}
export const SMALL_DEVICE_QUERY = ['(max-device-width:599px)', '(max-device-height:599px)'].join(' or ');
export const PHONE_TOUCH_QUERY = ['(pointer:coarse)', `(${SMALL_DEVICE_QUERY})`].join(' and ');
export const getPhoneTouchMedia = () => (phoneTouchMedia ??= matchMedia(PHONE_TOUCH_QUERY));
export const subscribePhoneTouch = (onChange?: Dynamic) => (
  getPhoneTouchMedia().addEventListener('change', onChange),
  () => getPhoneTouchMedia().removeEventListener('change', onChange)
);
export const falseOnServer = () => false;
export const usePhoneTouch = () =>
  React.useSyncExternalStore(subscribePhoneTouch, () => getPhoneTouchMedia().matches, falseOnServer);
export const useIsKeyboardUp = () =>
  React.useSyncExternalStore(subscribeBottomInsets, () => getKeyboardInset() > 0, falseOnServer);
export const ZERO_WINDOW_SIZE = {
  width: 0,
  height: 0,
};
cachedWindowSize = null;
export const readWindowSize = () =>
  (cachedWindowSize = {
    width: innerWidth,
    height: innerHeight,
  });
export const subscribeWindowResize = (onResize?: Dynamic) => {
  let onWindowResize = () => {
    readWindowSize();
    if (getPhoneTouchMedia().matches) onResize();
  };
  addEventListener('resize', onWindowResize);
  return () => removeEventListener('resize', onWindowResize);
};
export const useWindowSize = () =>
  React.useSyncExternalStore(
    subscribeWindowResize,
    () => cachedWindowSize ?? readWindowSize(),
    () => ZERO_WINDOW_SIZE,
  );
export const KEYBOARD_HEIGHT_MIN = 150;
export const isFrameShortenedBy = (fullSize?: Dynamic, size?: Dynamic) => fullSize.height - size.height >= KEYBOARD_HEIGHT_MIN;
export const keptFullWindowSize = (kept?: Dynamic, size?: Dynamic, mayKeep?: Dynamic) =>
  mayKeep && size.width === kept.width && size.height < kept.height ? kept : size;
export const slideAnimations = new (WeakMap as Dynamic)();
export const slideOffsetNow = (element?: Dynamic) =>
  slideAnimations.get(element)?.playState === 'running' ? new (DOMMatrixReadOnly as Dynamic)(getComputedStyle(element).transform).m42 : 0;
export const SLIDE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
export const bottomOfPlace = ({ top: top, height: height }: Dynamic) => top + height;
