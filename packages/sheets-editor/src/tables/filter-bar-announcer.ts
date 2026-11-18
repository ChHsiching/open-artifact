import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { filterMessages, sortMessages, rowsInViewOfAllText } from './filter-messages.ts';
import { sortedByWords } from './sort-filter-labels.ts';
import { LAST_DONE_SETTLE_MS } from '../ui/last-done-announcer.ts';
import { jsx } from 'react/jsx-runtime';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
export function filterBarAnnouncement(bar?: Dynamic, previous?: Dynamic) {
  let { sheetId: sheetId, records: records } = bar;
  let { sort: sort = null, isNothingAsked: isNothingAsked = false } = bar;
  if (bar.isRefreshOffered) {
    let words = sort === null ? filterMessages.refreshFilter() : sortMessages.refresh(!isNothingAsked);
    return {
      sheetId: sheetId,
      isOfAllRows: false,
      words: words,
    };
  }
  if (sort !== null && isNothingAsked)
    return {
      sheetId: sheetId,
      isOfAllRows: false,
      words: sortedByWords(sort.said),
    };
  if (records !== null)
    return {
      sheetId: sheetId,
      isOfAllRows: false,
      words: rowsInViewOfAllText(records),
    };
  let isSameSheet = previous?.sheetId === sheetId;
  if (isSameSheet && previous.isOfAllRows) return previous;
  let words = isSameSheet ? filterMessages.allRowsAreShowing() : filterMessages.filterOnWithAllRows();
  return {
    sheetId: sheetId,
    isOfAllRows: true,
    words: words,
  };
}
export function createFilterBarAnnouncer(announce?: Dynamic) {
  let lastAnnouncement: Dynamic = null;
  let lastSeen: Dynamic = '';
  let isOnlySorted: Dynamic = false;
  let timer: Dynamic;
  return {
    give({ bar: bar, isCleared: isCleared }: Dynamic) {
      let isNotDrawnYet = bar?.isNotDrawnYet === true && bar.records === null;
      let seen = JSON.stringify([
        bar === null ? null : [bar.sheetId, bar.records, bar.isRefreshOffered, isNotDrawnYet, bar.sort?.said],
        isCleared,
      ]);
      if (seen === lastSeen) return;
      lastSeen = seen;
      if (bar !== null) isOnlySorted = (bar.sort ?? null) !== null && bar.isNothingAsked === true;
      clearTimeout(timer);
      if ((bar === null && !isCleared) || (isNotDrawnYet && lastAnnouncement === null)) {
        lastAnnouncement = null;
        return announce(null);
      }
      timer = setTimeout(() => {
        lastAnnouncement = bar === null ? null : filterBarAnnouncement(bar, lastAnnouncement);
        announce(lastAnnouncement?.words ?? (isOnlySorted ? sortMessages.cleared() : filterMessages.filterCleared()));
      }, LAST_DONE_SETTLE_MS);
    },
    stop() {
      lastSeen = '';
      clearTimeout(timer);
    },
  };
}
export function FilterBarAnnouncer({ bar: bar, isCleared: isCleared }: Dynamic) {
  let [words, setWords] = React.useState(null);
  let [announcer] = React.useState(() => createFilterBarAnnouncer(setWords));
  React.useEffect(
    () =>
      announcer.give({
        bar: bar,
        isCleared: isCleared,
      }),
    [announcer, bar, isCleared],
  );
  React.useEffect(() => announcer.stop, [announcer]);
  return jsx(LiveAnnouncer, {
    words: words,
  });
}
export const filterBarToAnnounce = (
  { ownFilterBar: ownFilterBar, hasFilterNotDrawnYet: hasFilterNotDrawnYet, recordsUnderFilterNotDrawnYet: recordsUnderFilterNotDrawnYet }: Dynamic,
  sheetId?: Dynamic,
) =>
  !hasFilterNotDrawnYet || sheetId === null || (recordsUnderFilterNotDrawnYet === null && ownFilterBar !== null)
    ? ownFilterBar
    : {
        sheetId: sheetId,
        records: recordsUnderFilterNotDrawnYet,
        isRefreshOffered: false,
        isNotDrawnYet: true,
      };
