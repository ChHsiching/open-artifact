import { Dialog } from '../kit/dialog.tsx';
import { Form } from '../kit/form.tsx';
import { RadioGroup } from '../kit/radio-group.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { resizeColumnsLabel } from '../i18n/grid-action-labels.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { PixelsInput } from '../ui/pixels-input.ts';
import { MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH } from '../model/line-sizes.ts';
export const ColumnWidthDialog = React.memo(function ({
  isOpen: isOpen,
  columnCount: columnCount,
  widthInPixels: widthInPixels,
  whatHasCaretAfter: whatHasCaretAfter,
  onWidthChosen: onWidthChosen,
}: Dynamic) {
  let [width, setWidth] = React.useState(widthInPixels);
  let [goesBy, setGoesBy] = React.useState('width');
  let [wasOpen, setWasOpen] = React.useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setWidth(widthInPixels);
      setGoesBy('width');
    }
  }
  let widthInputRef = React.useRef(null);
  let isFitToText = goesBy === 'text';
  let widthChosen = isFitToText ? 'fitToText' : width;
  let chooseWidth = () => {
    if (widthChosen !== null) onWidthChosen(widthChosen);
  };
  return jsx(Dialog.Root, {
    open: isOpen,
    onOpenChange: (open?: Dynamic) => {
      if (!open) onWidthChosen(null);
    },
    children: jsx(Dialog.Popup, {
      size: 'sm',
      initialFocus: widthInputRef,
      finalFocus: whatHasCaretAfter,
      children: jsxs(Form, {
        className: 'contents',
        onSubmit: chooseWidth,
        onKeyDown: (keyEvent?: Dynamic) => {
          if (keyEvent.key !== 'Enter') return;
          if (keyEvent.repeat) keyEvent.preventDefault();
          else if (keyEvent.target instanceof Element && keyEvent.target.role === 'radio') chooseWidth();
        },
        children: [
          jsx(Dialog.Header, {
            children: resizeColumnsLabel(columnCount),
          }),
          jsxs('div', {
            className: 'flex flex-col gap-md',
            children: [
              jsxs(RadioGroup.Root, {
                'aria-label': sheetMessages.columnWidth(),
                value: goesBy,
                onValueChange: (goesByPicked?: Dynamic) => setGoesBy(goesByPicked === 'text' ? 'text' : 'width'),
                children: [
                  jsx(RadioGroup.Item, {
                    value: 'width',
                    label: sheetMessages.setWidth(),
                  }),
                  jsx(RadioGroup.Item, {
                    value: 'text',
                    label: sheetMessages.fitColumnToText(),
                  }),
                ],
              }),
              jsx(PixelsInput, {
                ref: widthInputRef,
                label: sheetMessages.widthInPixels(),
                smallest: MIN_COLUMN_WIDTH,
                largest: MAX_COLUMN_WIDTH,
                disabled: isFitToText,
                value: width,
                onValueChange: setWidth,
              }),
            ],
          }),
          jsxs(Dialog.Footer, {
            align: 'end',
            children: [
              jsx(Dialog.Close, {
                render: jsx(Button, {
                  variant: 'secondary',
                  children: sheetMessages.cancel(),
                }),
              }),
              jsx(Button, {
                type: 'submit',
                variant: 'primary',
                disabled: widthChosen === null,
                children: resizeColumnsLabel(columnCount),
              }),
            ],
          }),
        ],
      }),
    }),
  });
});
