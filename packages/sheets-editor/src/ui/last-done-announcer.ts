import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { lastDoneWorthKeeping } from '../state/transitions.ts';
export function announcementOfLastDone(lastDone?: Dynamic, store?: Dynamic) {
  if (shouldAnnounceInFull(lastDone, store))
    return isUndoShowingSheet(lastDone)
      ? {
          what: 'sheetShown',
          name: lastDone.sheetShown,
        }
      : lastDone;
  return isUndoShowingSheet(lastDone)
    ? {
        what: lastDone.what,
        cells: null,
      }
    : null;
}
export function watchLastDoneToAnnounce(input?: Dynamic, options?: Dynamic, context?: Dynamic, value?: Dynamic) {
  let storeState: Dynamic = options();
  let lastDone: Dynamic = storeState.lastDone;
  let value2: Dynamic;
  let value3 = input(() => {
    let { lastDone: value4, nameBoxText: value5, mode: value6 } = options();
    if (value4 === storeState.lastDone && value5 === storeState.nameBoxText && value6 === storeState.mode) return;
    let value7 = value4 === storeState.lastDone;
    storeState = {
      lastDone: value4,
      nameBoxText: value5,
      mode: value6,
    };
    clearTimeout(value2);
    if (!isAnnounceableLastDone(value4) || isUnsavedEmptying(value4)) return;
    if (value7 && !isAlwaysAnnounced(value4)) {
      lastDone = value4;
      context(null);
    }
    if (value4 === lastDone) return;
    value2 = setTimeout(() => {
      lastDone = value4;
      if (isAlwaysAnnounced(value4) || (value() && options().nameBoxText === value4.cell)) context(value4);
    }, LAST_DONE_SETTLE_MS);
  });
  return () => {
    value3();
    clearTimeout(value2);
  };
}
export function useAnnouncedLastDone(store?: Dynamic, canAnnounce?: Dynamic) {
  let [announcement, setAnnouncement] = React.useState(null);
  let value = React.useEffectEvent(canAnnounce);
  React.useEffect(() => watchLastDoneToAnnounce(store.subscribe, store.getView, setAnnouncement, () => value()), [store]);
  return announcement;
}
export const isLastDoneAboutCells = (input?: Dynamic) =>
  input?.what === 'entryEmptiedCell' ||
  lastDoneWorthKeeping({
    lastDone: input,
  }) !== null;
export const LAST_DONE_SETTLE_MS = 500;
export const isUndoShowingSheet = (input?: Dynamic) =>
  (input?.what === 'undone' || input?.what === 'redone') && input.sheetShown !== undefined;
export const isFixesDecision = (input?: Dynamic) => input?.what === 'fixesKept' || input?.what === 'fixesDiscarded';
export const isAlwaysAnnounced = (input?: Dynamic) =>
  isLastDoneAboutCells(input) || isUndoShowingSheet(input) || isFixesDecision(input);
export const isAnnounceableLastDone = (input?: Dynamic) =>
  isAlwaysAnnounced(input) || input?.what === 'ownCellMoved' || input?.what === 'ownCellRemoved';
export const isUnsavedEmptying = (input?: Dynamic) => input.what === 'entryEmptiedCell' && !input.isSaved;
export const shouldAnnounceInFull = (input?: Dynamic, options?: Dynamic) => !isAnnounceableLastDone(input) || input === options;
