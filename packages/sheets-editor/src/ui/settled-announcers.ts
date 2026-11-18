import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { describeLastDone } from '../i18n/last-done-labels.ts';
import { undoableDoneText } from '../i18n/notice-labels.ts';
import { LAST_DONE_SETTLE_MS } from './last-done-announcer.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { LiveAnnouncer } from './live-announcer.ts';
export function isUndoOfferAnnounced({ kind: kind }: Dynamic) {
  switch (kind) {
    case 'sheetDeleted':
    case 'placedViewDeleted':
    case 'rowsDeleted':
    case 'columnsDeleted':
    case 'mergeClearedCells':
    case 'tableImportedIntoSheet':
    case 'tableImportedAsNewSheet':
    case 'versionRestored':
    case 'textsConverted':
    case 'optionsGoneClearedCells':
    case 'sortChangedResults':
    case 'moveOfColumnsChangedResults':
      return true;
    case 'filledByFinger':
    case 'clearedWithNoKeyboard':
    case 'sortedWithNoKeyboard':
    case 'dropdownClearedCells':
    case 'dropdownOptionDeleted':
    case 'replacedInCells':
    case 'moveReplacedCells':
      return false;
  }
}
export function undoOfferWords(undoOffer?: Dynamic, saving?: Dynamic) {
  if (undoOffer === null || !isUndoOfferAnnounced(undoOffer)) return null;
  if (!('isSaved' in undoOffer) && saving !== 'allSaved') return null;
  let undoWords = describeLastDone({
    what: 'undoOfferMade',
    offer: undoOffer,
  });
  return 'isSaved' in undoOffer && !undoOffer.isSaved && undoOffer.kind !== 'sortChangedResults' && undoOffer.kind !== 'moveOfColumnsChangedResults'
    ? undoWords
    : undoableDoneText(undoWords);
}
export function announceWhenSettled(subscribe?: Dynamic, readState?: Dynamic, say?: Dynamic, subscribeToFocus?: Dynamic) {
  let { words: words, about: about, nameBoxText: nameBoxText, mode: mode }: Dynamic = readState();
  let lastSaid: Dynamic = null;
  let timer: Dynamic;
  let sayWhenSettled = () => {
    clearTimeout(timer);
    if (words === null || words === lastSaid) return;
    let wordsToSay = words;
    timer = setTimeout(() => {
      lastSaid = wordsToSay;
      say(wordsToSay);
    }, LAST_DONE_SETTLE_MS);
  };
  let unsubscribe = subscribe(() => {
    let { words: nextWords, about: nextAbout, nameBoxText: nextNameBoxText, mode: nextMode } = readState();
    let isNewWords = nextWords !== words || nextAbout !== about;
    if (!isNewWords && nextNameBoxText === nameBoxText && nextMode === mode) return;
    if (isNewWords && lastSaid !== null) {
      lastSaid = null;
      say(null);
    }
    words = nextWords;
    about = nextAbout;
    nameBoxText = nextNameBoxText;
    mode = nextMode;
    sayWhenSettled();
  });
  let unsubscribeFocus = subscribeToFocus(sayWhenSettled);
  sayWhenSettled();
  return () => {
    unsubscribe();
    unsubscribeFocus();
    clearTimeout(timer);
  };
}
export function UndoOfferAnnouncer({ store: store, inPageOf: inPageOf }: Dynamic) {
  let [undoWords, setUndoWords] = React.useState(null);
  React.useEffect(() => announceUndoOffers(store.subscribe, store.getView, setUndoWords, subscribeToFocusIn(inPageOf)), [store, inPageOf]);
  return jsx(LiveAnnouncer, {
    words: undoWords,
  });
}
export function SettledWordsAnnouncer({ words: words, about: about, store: store, inPageOf: inPageOf }: Dynamic) {
  let [settledWords, setSettledWords] = React.useState(null);
  React.useEffect(() => {
    if (words === null) return;
    let readState = () => {
      let { nameBoxText: nameBoxText, mode: mode } = store.getView();
      return {
        words: words,
        about: about,
        nameBoxText: nameBoxText,
        mode: mode,
      };
    };
    let stopAnnouncing = announceWhenSettled(store.subscribe, readState, setSettledWords, subscribeToFocusIn(inPageOf));
    return () => {
      stopAnnouncing();
      setSettledWords(null);
    };
  }, [words, about, store, inPageOf]);
  return jsx(LiveAnnouncer, {
    words: settledWords,
  });
}
export function OpenedWordsAnnouncer({ words: words, isEntryOpen: isEntryOpen, store: store, inPageOf: inPageOf }: Dynamic) {
  let [state, setState] = React.useState({
    wasSilent: words === false,
    openedWith: false,
  });
  let stateNow = openedWordsState(
    {
      words: words,
      isEntryOpen: isEntryOpen,
    },
    state,
  );
  if (stateNow.wasSilent !== state.wasSilent || stateNow.openedWith !== state.openedWith) setState(stateNow);
  return jsxs(Fragment, {
    children: [
      jsx(SettledWordsAnnouncer, {
        words: stateNow.openedWith === false ? null : stateNow.openedWith,
        about: null,
        store: store,
        inPageOf: inPageOf,
      }),
      jsx(LiveAnnouncer, {
        words: stateNow.openedWith === false && words,
      }),
    ],
  });
}
export const subscribeToFocusIn =
  (pageRef?: Dynamic) =>
  (onFocusIn?: Dynamic) => {
    let pageDocument = pageRef.current?.ownerDocument;
    pageDocument?.addEventListener('focusin', onFocusIn, true);
    return () => pageDocument?.removeEventListener('focusin', onFocusIn, true);
  };
export const announceUndoOffers = (subscribe?: Dynamic, getView?: Dynamic, say?: Dynamic, subscribeToFocus?: Dynamic) =>
  announceWhenSettled(
    subscribe,
    () => {
      let { undoOffer: undoOffer, saving: saving, nameBoxText: nameBoxText, mode: mode } = getView();
      return {
        words: undoOfferWords(undoOffer, saving),
        nameBoxText: nameBoxText,
        mode: mode,
      };
    },
    say,
    subscribeToFocus,
  );
export const openedWordsState = (
  { words: words, isEntryOpen: isEntryOpen }: Dynamic,
  { wasSilent: wasSilent, openedWith: openedWith }: Dynamic,
) => ({
  wasSilent: words === false,
  openedWith: !isEntryOpen && (wasSilent ? words : openedWith === words && words),
});
