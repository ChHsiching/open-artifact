import { Dialog } from '../kit/dialog.tsx';
import { Shortcut } from '../kit/shortcut.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { NUMBER_FORMAT_SHORTCUTS } from '../keys/key-acts.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { shortcutActionLabel, shortcutListMessages, shortcutGroupLabel } from '../messages/shortcut-labels.ts';
import { IS_APPLE_PLATFORM } from './dom-events.ts';
import { KEYS_LISTED } from '../keys/shortcut-list.ts';
import { useCoarsePointerMedia } from '../app/media-queries.ts';
export function isKeyboardShortcutsKey(
  { key: key, code: code, shiftKey: shiftKey, altKey: altKey, metaKey: metaKey, ctrlKey: ctrlKey }: Dynamic,
  isMac?: Dynamic,
) {
  if (key !== '/' || altKey || (isMac ? !metaKey || ctrlKey : !ctrlKey || metaKey)) return false;
  return !shiftKey || !ctrlKey || NUMBER_FORMAT_SHORTCUTS[code.replace(/^Digit/, '')] === undefined;
}
export function ShortcutListRow({ row: props }: Dynamic) {
  return jsxs('li', {
    className: 'sheet-listed-key flex flex-wrap items-center justify-between gap-x-md gap-y-0 py-xs break-inside-avoid',
    children: [
      jsx('span', {
        className: 'text-body flex-1',
        children: shortcutActionLabel(props.does),
      }),
      jsx('span', {
        className: 'ms-auto flex shrink-0 items-center gap-sm',
        children: ((IS_APPLE_PLATFORM ? props.keysOnAMac : undefined) ?? props.keys).map(
          (keys?: Dynamic, keysIndex?: Dynamic) =>
            jsxs(
              React.Fragment,
              {
                children: [
                  keysIndex > 0 &&
                    jsx('span', {
                      className: 'text-secondary text-caption',
                      children: shortcutListMessages.or(),
                    }),
                  jsx(Shortcut, {
                    keys: keys,
                  }),
                ],
              },
              keys,
            ),
        ),
      }),
    ],
  });
}
export function ShortcutListGroup({ group: group, rows: rows }: Dynamic) {
  let headingId = React.useId();
  return jsxs('div', {
    className: 'mb-lg flex break-inside-avoid flex-col gap-sm',
    children: [
      jsx('h3', {
        id: headingId,
        className: 'text-secondary text-caption',
        children: shortcutGroupLabel(group),
      }),
      jsx('ul', {
        'aria-labelledby': headingId,
        children: rows.map(
          (row?: Dynamic) =>
            jsx(
              ShortcutListRow,
              {
                row: row,
              },
              row.does,
            ),
        ),
      }),
    ],
  });
}
export const isElementLiveAndNotInert = (element?: Dynamic) => element.isConnected && element.closest('[inert]') === null;
export const SHORTCUT_GROUPS_ALL = KEYS_LISTED;
export const SHORTCUT_GROUPS_FOR_VIEWERS = SHORTCUT_GROUPS_ALL.map(
  ({ group: group, rows: rows }: Dynamic) => ({
    group: group,
    rows: rows.filter((row?: Dynamic) => row.isForViewersToo === true),
  }),
).filter(({ rows: rows }: Dynamic) => rows.length > 0);
export const KeyboardShortcutsDialog = React.memo(function ({
  isOpen: isOpen,
  isViewOnly: isViewOnly,
  hasComments: hasComments,
  whatHasCaretAfter: whatHasCaretAfter,
  onShut: onShut,
}: Dynamic) {
  let isPointerCoarse = useCoarsePointerMedia();
  let onOpenChange = React.useCallback(
    (willOpen?: Dynamic) => {
      if (!willOpen) onShut();
    },
    [onShut],
  );
  return jsx(Dialog.Root, {
    open: isOpen,
    onOpenChange: onOpenChange,
    children: jsxs(Dialog.Popup, {
      size: '2xl',
      finalFocus: whatHasCaretAfter,
      children: [
        jsx(Dialog.Header, {
          children: shortcutListMessages.title(),
        }),
        jsx('div', {
          className: 'gap-x-xl sm:columns-2',
          children: (isViewOnly ? SHORTCUT_GROUPS_FOR_VIEWERS : SHORTCUT_GROUPS_ALL).map(
            ({ group: group, rows: rows }: Dynamic) =>
              jsx(
                ShortcutListGroup,
                {
                  group: group,
                  rows: rows.filter(
                    (row?: Dynamic) =>
                      (hasComments || row.isOnlyWithComments !== true) && (!isPointerCoarse || row.isNotForAFinger !== true),
                  ),
                },
                group,
              ),
          ),
        }),
      ],
    }),
  });
});
