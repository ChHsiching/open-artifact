import type { Dynamic } from '../dynamic.ts';
import { IS_APPLE_PLATFORM } from '../ui/dom-events.ts';
export function listenForCopySheetLinkShortcut(target?: Dynamic, copySheetLink?: Dynamic, platform: Dynamic = IS_APPLE_PLATFORM) {
  let onKeyDown = (event?: Dynamic) => {
    if (!isCopySheetLinkShortcut(event, platform)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) copySheetLink();
  };
  target.addEventListener('keydown', onKeyDown, true);
  return () => target.removeEventListener('keydown', onKeyDown, true);
}
export function syncShownSheetWithLinks(sheetLinks?: Dynamic, store?: Dynamic) {
  let sheetIdShown: Dynamic = null;
  let lastSheetPointedIn: Dynamic = null;
  let unsubscribe = store.subscribe(() => {
    let { lastDone: lastDone, listedSheets: listedSheets, sheetPointedIn: sheetPointedIn } = store.getView();
    let sheetPointedBefore = lastSheetPointedIn;
    lastSheetPointedIn = sheetPointedIn;
    let sheetToShow =
      listedSheets.find(({ holdsOpenEntry: holdsOpenEntry }: Dynamic) => holdsOpenEntry) ??
      listedSheets.find(({ isShown: isShown }: Dynamic) => isShown);
    if (sheetToShow === undefined || sheetToShow.sheetId === sheetIdShown) return;
    let sheetShownBefore = sheetIdShown;
    sheetIdShown = sheetToShow.sheetId;
    let isFromSheetChange =
      ((lastDone?.what === 'sheetShown' && lastDone.name === sheetToShow.name) || sheetToShow.sheetId === sheetPointedBefore) &&
      listedSheets.some((sheet?: Dynamic) => sheet.sheetId === sheetShownBefore);
    sheetLinks.sheetOnShowIs(sheetToShow.sheetId, isFromSheetChange);
  });
  sheetLinks.onSheetAskedFor((askedSheetId?: Dynamic) => {
    if (!store.getView().listedSheets.some((sheet?: Dynamic) => sheet.sheetId === askedSheetId)) return;
    store.dispatch({
      kind: 'sheetNameLeft',
    });
    store.dispatch({
      kind: 'entryLeft',
    });
    store.dispatch({
      kind: 'sheetChosen',
      sheetId: askedSheetId,
      canPoint: false,
    });
  });
  return () => {
    sheetLinks.onSheetAskedFor(null);
    unsubscribe();
  };
}
export const isCopySheetLinkShortcut = (event?: Dynamic, isMac?: Dynamic) =>
  event.altKey &&
  !event.shiftKey &&
  (isMac ? event.metaKey && !event.ctrlKey && event.code === 'KeyL' : event.ctrlKey && !event.metaKey && (event.key === 'l' || event.key === 'L'));
