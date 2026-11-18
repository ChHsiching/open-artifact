import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { peoplePickerMessages } from '../i18n/chip-labels.ts';
import { peopleListNote } from './people-list-view.ts';
import { jsx } from 'react/jsx-runtime';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
export function nextSearchSaid(previous?: Dynamic, list?: Dynamic) {
  if (list === null || list.search === 'none') return NOTHING_SAID_OF_SEARCH;
  if (list.search === 'underWay') {
    let slowAt = previous.slowAt === list.searchedFor ? previous.slowAt : null;
    return {
      said: previous.said === 'searching' || slowAt !== null ? 'searching' : 'nothing',
      slowAt: slowAt,
    };
  }
  let peopleFound = list.rows.filter(({ kind: kind }: Dynamic) => kind === 'person').length;
  return {
    said: previous.said === 'searching' ? peopleFound : previous.said,
    slowAt: null,
  };
}
export function peopleListAnnouncement(list?: Dynamic, said?: Dynamic) {
  if (said === 'searching') return peoplePickerMessages.searching();
  return peopleListNote(list) ?? (said === 'nothing' ? null : peoplePickerMessages.found(said));
}
export function PeopleListAnnouncer({ list: list }: Dynamic) {
  let [announced, setAnnounced] = React.useState(NOTHING_SAID_OF_SEARCH);
  let next = nextSearchSaid(announced, list);
  if (next.said !== announced.said || next.slowAt !== announced.slowAt) setAnnounced(next);
  let searchUnderWayFor = list?.search === 'underWay' ? list.searchedFor : null;
  React.useEffect(() => {
    if (searchUnderWayFor === null) return;
    let timer = setTimeout(
      () => setAnnounced((current?: Dynamic) => withSearchSlowAt(current, searchUnderWayFor)),
      PEOPLE_SEARCH_SLOW_MS,
    );
    return () => clearTimeout(timer);
  }, [searchUnderWayFor]);
  return jsx(LiveAnnouncer, {
    words: list !== null && peopleListAnnouncement(list, next.said),
  });
}
export const PEOPLE_SEARCH_SLOW_MS = 1000;
export const NOTHING_SAID_OF_SEARCH = {
  said: 'nothing',
  slowAt: null,
};
export const withSearchSlowAt = (announced?: Dynamic, slowAt?: Dynamic) => ({
  ...announced,
  slowAt: slowAt,
});
