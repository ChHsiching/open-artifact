import { Avatar } from '../kit/avatar.tsx';
import { useUiWindow } from '../kit/theme.tsx';
import { AGENT_NAME } from '../agent/agent-name.ts';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { translateMessage } from '../i18n/messages.ts';
import { truncateGraphemes } from '../i18n/grid-action-labels.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { SettledWordsAnnouncer } from '../ui/settled-announcers.ts';
import { MountedToast } from '../ui/mounted-toast.ts';
export function sorterNameText(sorter?: Dynamic) {
  if (sorter?.kind === 'agent') return AGENT_NAME;
  return sorter === null || sorter.name === '' ? null : isolatedSortHeading(sorter.name);
}
export function sortedByHeadingText(sorterName?: Dynamic, heading?: Dynamic) {
  return sorterName === null
    ? translateMessage(
        {
          defaultMessage: 'Someone sorted by {heading}',
          id: '3bXb9jkGLo',
        },
        {
          heading: isolatedSortHeading(heading),
        },
      )
    : translateMessage(
        {
          defaultMessage: '{name} sorted by {heading}',
          id: '0V+HA1+yH9',
        },
        {
          name: sorterName,
          heading: isolatedSortHeading(heading),
        },
      );
}
export function sortedByColumnText(sorterName?: Dynamic, letters?: Dynamic) {
  return sorterName === null
    ? translateMessage(
        {
          defaultMessage: 'Someone sorted by column {letters}',
          id: 'imYqi5RV8O',
        },
        {
          letters: letters,
        },
      )
    : translateMessage(
        {
          defaultMessage: '{name} sorted by column {letters}',
          id: 'XMO2wwiUkQ',
        },
        {
          name: sorterName,
          letters: letters,
        },
      );
}
export function sortByOtherText({ by: by, column: column, firstRow: firstRow, lastRow: lastRow }: Dynamic) {
  let sorterName = sorterNameText(by);
  if (column !== null)
    return column.heading === null || truncateGraphemes(column.heading, SORT_HEADING_MAX_GRAPHEMES) !== column.heading
      ? sortedByColumnText(sorterName, column.letters)
      : sortedByHeadingText(sorterName, column.heading);
  return sorterName === null
    ? translateMessage(
        {
          defaultMessage: 'Someone reordered rows {firstRow} to {lastRow}',
          id: 'W4DnVv/g0c',
        },
        {
          firstRow: firstRow,
          lastRow: lastRow,
        },
      )
    : translateMessage(
        {
          defaultMessage: '{name} reordered rows {firstRow} to {lastRow}',
          id: 'FAUkgBhbRZ',
        },
        {
          name: sorterName,
          firstRow: firstRow,
          lastRow: lastRow,
        },
      );
}
export function SortsByOthersToast({
  source: source,
  sheetId: sheetId,
  isHeldBack: isHeldBack,
  store: store,
  inPageOf: inPageOf,
  onToastUp: onToastUp,
  onTakenDown: onTakenDown,
}: Dynamic) {
  let sortsByOthers = React.useSyncExternalStore(source.onChanged, source.now, source.now);
  let ownerDocument = useUiWindow()?.document;
  let [isPageHidden, setPageHidden] = React.useState(() => ownerDocument?.hidden ?? false);
  React.useEffect(() => {
    if (ownerDocument === undefined) return;
    let updateHidden = () => setPageHidden(ownerDocument.hidden);
    updateHidden();
    ownerDocument.addEventListener('visibilitychange', updateHidden);
    return () => ownerDocument.removeEventListener('visibilitychange', updateHidden);
  }, [ownerDocument]);
  let sortByOther = sheetId === undefined || isPageHidden || isHeldBack ? undefined : sortsByOthers.get(sheetId);
  let toastWords = sortByOther === undefined ? null : sortByOtherText(sortByOther);
  let onToastUpEvent = React.useEffectEvent(onToastUp);
  React.useEffect(() => {
    if (sortByOther !== undefined) onToastUpEvent();
  }, [sortByOther]);
  return jsxs(Fragment, {
    children: [
      jsx(SettledWordsAnnouncer, {
        words: toastWords,
        about: sortByOther === undefined ? null : String(sortByOther.nth),
        store: store,
        inPageOf: inPageOf,
      }),
      sortByOther !== undefined &&
        toastWords !== null &&
        jsx(
          MountedToast,
          {
            words: toastWords,
            ...(hasSorterFace(sortByOther.by) && {
              icon: jsx(SorterAvatar, {
                by: sortByOther.by,
              }),
            }),
            staysUntilClosed: false,
            onOver: () => source.told(sortByOther),
            onTakenDown: () => {
              source.told(sortByOther);
              onTakenDown();
            },
          },
          sortByOther.nth,
        ),
    ],
  });
}
export const SORT_HEADING_MAX_GRAPHEMES = 32;
export const isolatedSortHeading = (heading?: Dynamic) => `⁨${truncateGraphemes(heading, SORT_HEADING_MAX_GRAPHEMES)}⁩`;
export const hasSorterFace = (sorter?: Dynamic) => sorter !== null && (sorter.kind === 'agent' || sorter.name !== '');
export const SorterAvatar = ({ by: by }: Dynamic) =>
  by.kind === 'agent'
    ? jsx(Avatar, {
        'aria-hidden': true,
        size: 'xs',
        variant: 'agent',
        name: '',
      })
    : jsx(Avatar, {
        'aria-hidden': true,
        size: 'xs',
        name: by.name,
        src: by.avatarUrl,
      });
