import { AlertDialog } from '../kit/dialog.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { usePopupGivenUpOnBlur } from '../ui/popup-given-up-on-blur.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { dataNextToCellsWarning, sortCellsInsteadQuestion, sortCellsOnlyLabel, sortCellsLabel } from '../i18n/grid-action-labels.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
export const SortScopeDialog = React.memo(function ({
  asked: asked,
  whatHasCaretAfter: whatHasCaretAfter,
  onChosen: onChosen,
}: Dynamic) {
  let [shownAsked, value] = React.useState(asked);
  if (asked !== null && asked !== shownAsked) value(asked);
  let primaryRef = React.useRef(null);
  let {
    isGivenUp: isGivenUp,
    holdPopup: holdPopup,
    noteFocus: noteFocus,
  } = usePopupGivenUpOnBlur(asked !== null, () => onChosen(null));
  return jsx(AlertDialog.Root, {
    open: asked !== null && !isGivenUp,
    onOpenChange: (input?: Dynamic) => {
      if (!input) onChosen(null);
    },
    children: jsx(AlertDialog.Popup, {
      size: 'sm',
      initialFocus: primaryRef,
      finalFocus: () => whatHasCaretAfter(shownAsked?.change === 'sortByKeysOfPane'),
      ref: holdPopup,
      onFocus: noteFocus,
      onKeyDown: (event?: Dynamic) => {
        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
      },
      children:
        shownAsked !== null &&
        jsxs(Fragment, {
          children: [
            jsx(AlertDialog.Header, {
              description: dataNextToCellsWarning(shownAsked.selection),
              children: sortCellsInsteadQuestion(shownAsked.table),
            }),
            jsxs(AlertDialog.Footer, {
              align: 'end',
              className: 'flex-wrap',
              children: [
                jsx(AlertDialog.Close, {
                  render: jsx(Button, {
                    variant: 'secondary',
                    children: sheetMessages.cancel(),
                  }),
                }),
                jsx(Button, {
                  variant: 'secondary',
                  onClick: () => onChosen('selection'),
                  children: sortCellsOnlyLabel(shownAsked.selection),
                }),
                jsx(Button, {
                  ref: primaryRef,
                  'data-initial-focus': true,
                  variant: 'primary',
                  onClick: () => onChosen('table'),
                  children: sortCellsLabel(shownAsked.table),
                }),
              ],
            }),
          ],
        }),
    }),
  });
});
