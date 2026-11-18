import { AlertDialog } from '../kit/dialog.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { importReviewMessages } from './csv-file.ts';
export function DiscardImportDialog({
  isAsked: isAsked,
  whatHasCaretAfter: whatHasCaretAfter,
  onKept: onKept,
  onDropped: onDropped,
}: Dynamic) {
  let keepButtonRef = React.useRef(null);
  return jsx(AlertDialog.Root, {
    open: isAsked,
    onOpenChange: (isOpen?: Dynamic) => {
      if (!isOpen) onKept();
    },
    children: jsxs(AlertDialog.Popup, {
      size: 'sm',
      className: 'text-balance',
      ...{
        [INITIAL_FOCUS_IS_SAFE_ATTRIBUTE]: '',
      },
      initialFocus: keepButtonRef,
      finalFocus: whatHasCaretAfter,
      onKeyDown: (event?: Dynamic) => {
        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
      },
      children: [
        jsx(AlertDialog.Header, {
          showClose: false,
          className: 'mb-1',
          children: importReviewMessages.discardAsked(),
        }),
        jsx(AlertDialog.Description, {
          children: importReviewMessages.whatDiscardCosts(),
        }),
        jsxs(AlertDialog.Footer, {
          align: 'end',
          children: [
            jsx(AlertDialog.Close, {
              render: jsx(Button, {
                ref: keepButtonRef,
                'data-initial-focus': true,
                variant: 'secondary',
                children: importReviewMessages.keepEditing(),
              }),
            }),
            jsx(Button, {
              variant: 'danger',
              onClick: onDropped,
              children: importReviewMessages.discard(),
            }),
          ],
        }),
      ],
    }),
  });
}
export const INITIAL_FOCUS_IS_SAFE_ATTRIBUTE = 'data-initial-focus-is-safe';
