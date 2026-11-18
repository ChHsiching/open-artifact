import { CoachMark } from '../kit/coach-mark.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { asThemeMode, THEME_CHOSEN_ATTRIBUTE, chooseSheetsTheme } from '../shell/root-theme.ts';
import { sheetThemeFollowedNotice } from '../i18n/change-labels.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { LiveAnnouncer } from './live-announcer.ts';
export function rememberThemeDrawn(themeMode?: Dynamic, isChosen?: Dynamic, storage: Dynamic = themeNoticeStorage) {
  try {
    let store = storage();
    let lastDrawn = asThemeMode(store.getItem(THEME_LAST_DRAWN_KEY));
    store.setItem(THEME_LAST_DRAWN_KEY, themeMode);
    if (isChosen) store.setItem(THEME_CHANGE_TOLD_KEY, 'chosen');
    return lastDrawn === themeMode || store.getItem(THEME_CHANGE_TOLD_KEY) !== null ? null : lastDrawn;
  } catch {
    return null;
  }
}
export function markThemeChangeTold(storage: Dynamic = themeNoticeStorage) {
  try {
    storage().setItem(THEME_CHANGE_TOLD_KEY, 'told');
  } catch {}
}
export function createThemeChangeWatch(getElement?: Dynamic) {
  let noticeState: Dynamic = {
    change: null,
    isOpen: false,
  };
  let onChange: Dynamic = null;
  let lastSeen: Dynamic = '';
  let setChange = (change?: Dynamic) => {
    if (change === null && !noticeState.isOpen) return;
    noticeState =
      change === null
        ? {
            ...noticeState,
            isOpen: false,
          }
        : {
            change: change,
            isOpen: true,
          };
    onChange?.();
  };
  let checkTheme = (defaultView?: Dynamic) => {
    let doc = defaultView.document;
    if (doc.visibilityState !== 'visible' || defaultView.matchMedia('print').matches) return;
    if ((getElement()?.getClientRects().length ?? 0) === 0) return;
    let root = doc.documentElement;
    let chosenTheme = asThemeMode(root.getAttribute(THEME_CHOSEN_ATTRIBUTE));
    let systemTheme = defaultView.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
    let drawnTheme = chosenTheme ?? asThemeMode(root.getAttribute('data-theme')) ?? systemTheme;
    if (lastSeen === `${drawnTheme} ${chosenTheme}`) return;
    lastSeen = `${drawnTheme} ${chosenTheme}`;
    let changedFrom = rememberThemeDrawn(drawnTheme, chosenTheme !== null);
    setChange(
      changedFrom === null
        ? null
        : {
            from: changedFrom,
            to: drawnTheme,
          },
    );
  };
  return {
    subscribe(onChanged?: Dynamic) {
      let defaultView = getElement()?.ownerDocument.defaultView ?? null;
      if (defaultView === null)
        return () => {
          return;
        };
      onChange = onChanged;
      let timer: Dynamic;
      let checkSoon = () => {
        clearTimeout(timer);
        timer = setTimeout(() => checkTheme(defaultView), THEME_CHECK_DELAY_MS);
      };
      let mutationObserver = new (defaultView.MutationObserver as Dynamic)(checkSoon);
      mutationObserver.observe(defaultView.document.documentElement, {
        attributeFilter: [THEME_CHOSEN_ATTRIBUTE, 'data-theme'],
      });
      let darkQuery = defaultView.matchMedia('(prefers-color-scheme:dark)');
      darkQuery.addEventListener('change', checkSoon);
      defaultView.document.addEventListener('visibilitychange', checkSoon);
      checkSoon();
      return () => {
        onChange = null;
        clearTimeout(timer);
        mutationObserver.disconnect();
        darkQuery.removeEventListener('change', checkSoon);
        defaultView.document.removeEventListener('visibilitychange', checkSoon);
      };
    },
    now: () => noticeState,
    isOver: () => setChange(null),
  };
}
export const THEME_LAST_DRAWN_KEY = 'sheets-theme-last-drawn';
export const THEME_CHANGE_TOLD_KEY = 'sheets-theme-change-told';
export const themeNoticeStorage = () => localStorage;
export const THEME_CHECK_DELAY_MS = 1000;
export const NO_THEME_CHANGE = {
  change: null,
  isOpen: false,
};
export const ThemeChangeNotice = React.memo(function ({
  zoomButton: zoomButton,
  side: side,
  isEntryOpen: isEntryOpen,
  whatHasCaretAfter: whatHasCaretAfter,
}: Dynamic) {
  let [themeWatch] = React.useState(() => createThemeChangeWatch(zoomButton));
  let { change: change, isOpen: isOpen } = React.useSyncExternalStore(themeWatch.subscribe, themeWatch.now, () => NO_THEME_CHANGE);
  let isShown = isOpen && !isEntryOpen;
  let noticeText2 = React.useMemo(() => (change === null ? null : sheetThemeFollowedNotice(change.to)), [change]);
  let coachMarkRef = React.useRef(null);
  let onOpenChange = React.useCallback(
    (nextOpen?: Dynamic) => {
      if (!nextOpen) themeWatch.isOver();
    },
    [themeWatch],
  );
  let finalFocus = React.useCallback(() => {
    let coachMark = coachMarkRef.current;
    let activeElement = coachMark?.ownerDocument.activeElement ?? null;
    return coachMark !== null && (coachMark.contains(activeElement) || activeElement === coachMark.ownerDocument.body) ? whatHasCaretAfter() : false;
  }, [whatHasCaretAfter]);
  let keepOtherButton = React.useMemo(
    () =>
      change !== null &&
      noticeText2 !== null &&
      jsx(Button, {
        variant: 'secondary',
        size: 'sm',
        onClick: ({ currentTarget: currentTarget }: Dynamic) => {
          chooseSheetsTheme(currentTarget.ownerDocument.documentElement, change.from);
          themeWatch.isOver();
        },
        children: noticeText2.keepOther,
      }),
    [change, noticeText2, themeWatch],
  );
  return jsxs(Fragment, {
    children: [
      jsx(LiveAnnouncer, {
        words: isShown && noticeText2 !== null && noticeText2.said,
      }),
      noticeText2 !== null &&
        jsx(
          CoachMark,
          {
            ref: coachMarkRef,
            open: isShown,
            onOpenChange: onOpenChange,
            onShown: markThemeChangeTold,
            anchor: zoomButton,
            finalFocus: finalFocus,
            side: side,
            align: 'end',
            variant: 'neutral',
            'aria-label': noticeText2.title,
            title: noticeText2.title,
            showClose: true,
            lightDismiss: true,
            action: keepOtherButton,
            children: noticeText2.whereToChange,
          },
          side,
        ),
    ],
  });
});
