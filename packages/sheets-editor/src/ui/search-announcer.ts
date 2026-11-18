import { useUiWindow } from '../kit/theme.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx } from 'react/jsx-runtime';
import { LiveAnnouncer } from './live-announcer.ts';
export function createTypedSearchAnnouncer(announce?: Dynamic) {
  let announced: Dynamic = NO_TYPED_SEARCH_ANNOUNCEMENT;
  let lastGiven: Dynamic = null;
  let announceTimer: Dynamic;
  let setAnnounced = (next?: Dynamic) => {
    announced = next;
    announce(next);
  };
  let clearWords = () => {
    if (announced.words !== null)
      setAnnounced({
        ...announced,
        words: null,
      });
  };
  return {
    give(typed?: Dynamic, found?: Dynamic) {
      if (lastGiven?.typed === typed && lastGiven.found === found) return;
      lastGiven = {
        typed: typed,
        found: found,
      };
      clearTimeout(announceTimer);
      if (found === false) return clearWords();
      announceTimer = setTimeout(
        () =>
          setAnnounced({
            words: found,
            times: announced.times + 1,
          }),
        TYPED_SEARCH_ANNOUNCE_DELAY_MS,
      );
    },
    stop() {
      lastGiven = null;
      clearTimeout(announceTimer);
    },
  };
}
export function useTextFieldFocusState() {
  let pageWindow = useUiWindow();
  let subscribeFocusIn = React.useCallback(
    (input?: Dynamic) => (
      pageWindow?.document.addEventListener('focusin', input, true),
      () => pageWindow?.document.removeEventListener('focusin', input, true)
    ),
    [pageWindow],
  );
  let isInField = React.useSyncExternalStore(
    subscribeFocusIn,
    () => pageWindow !== undefined && pageWindow.document.activeElement instanceof pageWindow.HTMLInputElement,
    () => false,
  );
  let [isComposing, setIsComposing] = React.useState(false);
  React.useEffect(() => {
    let ownerDocument = pageWindow?.document;
    let onCompositionStart = () => setIsComposing(true);
    let onCompositionEndOrFocus = () => setIsComposing(false);
    ownerDocument?.addEventListener('compositionstart', onCompositionStart, true);
    ownerDocument?.addEventListener('compositionend', onCompositionEndOrFocus, true);
    ownerDocument?.addEventListener('focusin', onCompositionEndOrFocus, true);
    return () => {
      ownerDocument?.removeEventListener('compositionstart', onCompositionStart, true);
      ownerDocument?.removeEventListener('compositionend', onCompositionEndOrFocus, true);
      ownerDocument?.removeEventListener('focusin', onCompositionEndOrFocus, true);
    };
  }, [pageWindow]);
  return {
    isInField: isInField,
    isComposing: isComposing,
  };
}
export function TypedSearchAnnouncer({ typed: typed, found: found, atOnce = null }: Dynamic) {
  let [announced, setAnnounced] = React.useState(NO_TYPED_SEARCH_ANNOUNCEMENT);
  let [announcer] = React.useState(() => createTypedSearchAnnouncer(setAnnounced));
  let { isInField: isInField, isComposing: isComposing } = useTextFieldFocusState();
  let foundWords = isInField && found(!isComposing);
  React.useEffect(() => announcer.give(typed, foundWords), [announcer, typed, foundWords]);
  React.useEffect(() => announcer.stop, [announcer]);
  return jsx(LiveAnnouncer, {
    words: atOnce ?? (foundWords !== false && announced.words),
    timesSaid: announced.times,
  });
}
export const TYPED_SEARCH_ANNOUNCE_DELAY_MS = 1400;
export const NO_TYPED_SEARCH_ANNOUNCEMENT = {
  words: null,
  times: 0,
};
