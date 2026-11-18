import { AlertDialog } from '../kit/dialog.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { sheetMessages } from '../i18n/sheet-messages.ts';
export function preventRepeatedPress(keyEvent?: Dynamic) {
  if (keyEvent.repeat && (keyEvent.key === 'Enter' || keyEvent.key === ' ')) keyEvent.preventDefault();
}
export const NO_HIDDEN_TEXT_ROWS = {
  nth: 0,
  rows: [],
};
export const SCROLL_KEY_STEPS = new (Map as Dynamic)([
  ['ArrowDown', 0.1],
  ['ArrowUp', -0.1],
  ['PageDown', 0.9],
  ['PageUp', -0.9],
]);
export const HiddenTextPasteDialog = React.memo(function ({
  shown: shown,
  whatHasCaretAfter: whatHasCaretAfter,
  onAnswered: onAnswered,
}: Dynamic) {
  let [lastShown, setLastShown] = React.useState(NO_HIDDEN_TEXT_ROWS);
  if (shown !== null && shown !== lastShown) setLastShown(shown);
  let { nth: nth, rows: rows } = shown ?? lastShown;
  let cancelRef = React.useRef(null);
  let rowsBoxRef = React.useRef(null);
  let scrollRowsByKey = React.useCallback((keyEvent?: Dynamic) => {
    let rowsBox = rowsBoxRef.current;
    if (rowsBox === null || keyEvent.target === rowsBox) return;
    let pagesToScroll = SCROLL_KEY_STEPS.get(keyEvent.key);
    if (pagesToScroll === undefined) return;
    keyEvent.preventDefault();
    rowsBox.scrollBy({
      top: pagesToScroll * rowsBox.clientHeight,
    });
  }, []);
  let onOpenChange = React.useCallback(
    (open?: Dynamic) => {
      if (!open) onAnswered(nth, false);
    },
    [nth, onAnswered],
  );
  let pasteAnyway = React.useCallback(
    (clickEvent?: Dynamic) => {
      if (clickEvent.detail <= 1) onAnswered(nth, true);
    },
    [nth, onAnswered],
  );
  return jsx(AlertDialog.Root, {
    open: shown !== null,
    onOpenChange: onOpenChange,
    children: jsxs(
      AlertDialog.Popup,
      {
        initialFocus: cancelRef,
        finalFocus: whatHasCaretAfter,
        onKeyDown: scrollRowsByKey,
        children: [
          jsx(AlertDialog.Title, {
            children: sheetMessages.pasteCellsWithHiddenText(),
          }),
          jsxs(AlertDialog.Description, {
            render: jsx('div', {}),
            className: 'flex min-h-0 flex-col gap-md',
            children: [
              jsx('p', {
                children: sheetMessages.cellsContainTextNotShown(),
              }),
              jsx('div', {
                className: 'flex min-h-0 flex-col rounded bg-alpha-1',
                children: jsx('div', {
                  ref: rowsBoxRef,
                  className: 'scroll-fade-y min-h-0 overflow-y-auto p-md',
                  children: jsx('ul', {
                    className: 'flex flex-col gap-sm text-primary',
                    children: rows.map(
                      ({ key: key, address: address, written: written }: Dynamic) =>
                        jsxs(
                          'li',
                          {
                            className: 'flex gap-md',
                            children: [
                              jsx('span', {
                                className: 'min-w-12 shrink-0 text-secondary tabular-nums',
                                children: address,
                              }),
                              jsx('span', {
                                dir: 'ltr',
                                className: 'min-w-0 wrap-anywhere whitespace-pre-wrap',
                                children: written.map(
                                  (piece?: Dynamic) =>
                                    'seen' in piece
                                      ? piece.seen
                                      : jsx(
                                          'span',
                                          {
                                            className: `mx-px rounded bg-alpha-2 box-decoration-clone px-xs text-footnote text-secondary ${piece.unseen.spelled === null ? 'whitespace-nowrap' : ''}`,
                                            children: sheetMessages.charactersNotSeen(piece.unseen),
                                          },
                                          piece.from,
                                        ),
                                ),
                              }),
                            ],
                          },
                          key,
                        ),
                    ),
                  }),
                }),
              }),
            ],
          }),
          jsxs(AlertDialog.Footer, {
            align: 'end',
            children: [
              jsx(AlertDialog.Close, {
                render: jsx(Button, {
                  ref: cancelRef,
                  variant: 'secondary',
                  'data-initial-focus': '',
                  onKeyDown: preventRepeatedPress,
                  children: sheetMessages.cancel(),
                }),
              }),
              jsx(Button, {
                variant: 'primary',
                onKeyDown: preventRepeatedPress,
                onClick: pasteAnyway,
                children: sheetMessages.pasteAnyway(),
              }),
            ],
          }),
        ],
      },
      nth,
    ),
  });
});
