import { Dialog } from '../kit/dialog.tsx';
import { Form } from '../kit/form.tsx';
import { RadioGroup } from '../kit/radio-group.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { resizeRowsLabel } from '../i18n/grid-action-labels.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { PixelsInput } from '../ui/pixels-input.ts';
import { MIN_ROW_HEIGHT, MAX_ROW_HEIGHT } from '../model/line-sizes.ts';
import { DensityPicker } from '../ui/density-menu.ts';
export function chosenRowHeight({ goesBy: goesBy, height: height, isAsOpened: isAsOpened }: Dynamic, isChanged?: Dynamic) {
  if (isAsOpened && !isChanged) return null;
  if (goesBy === 'text')
    return {
      heightInPixels: null,
    };
  return height === null
    ? undefined
    : {
        heightInPixels: height,
      };
}
export const heightPickAsOpened = (height?: Dynamic) => ({
  goesBy: 'height',
  height: height,
  isAsOpened: true,
});
export const followGivenHeight = (heightPick?: Dynamic, height?: Dynamic) =>
  heightPick.isAsOpened && heightPick.height !== height ? heightPickAsOpened(height) : heightPick;
export const changedHeightPick = (heightPick?: Dynamic, change?: Dynamic) => ({
  ...heightPick,
  ...change,
  isAsOpened: false,
});
export const RowHeightDialog = React.memo(function ({
  isOpen: isOpen,
  rowCount: rowCount,
  heightInPixels: heightInPixels,
  isHeightGiven: isHeightGiven,
  density: density,
  onDensityChosen: onDensityChosen,
  whatHasCaretAfter: whatHasCaretAfter,
  onHeightChosen: onHeightChosen,
}: Dynamic) {
  let [heightPick, setHeightPick] = React.useState(heightPickAsOpened(heightInPixels));
  let [wasOpen, setWasOpen] = React.useState(false);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setHeightPick(heightPickAsOpened(heightInPixels));
  } else if (isOpen && followGivenHeight(heightPick, heightInPixels) !== heightPick) setHeightPick(followGivenHeight(heightPick, heightInPixels));
  let heightInputRef = React.useRef(null);
  let goesByRef = React.useRef(null);
  let heightChosen = chosenRowHeight(heightPick, isHeightGiven);
  let chooseHeight = () => {
    if (heightChosen !== undefined) onHeightChosen(heightChosen);
  };
  return jsx(Dialog.Root, {
    open: isOpen,
    onOpenChange: (open?: Dynamic) => {
      if (!open) onHeightChosen(null);
    },
    children: jsx(Dialog.Popup, {
      size: 'sm',
      initialFocus: heightInputRef,
      finalFocus: whatHasCaretAfter,
      children: jsxs(Form, {
        className: 'contents',
        onSubmit: chooseHeight,
        onKeyDown: (keyEvent?: Dynamic) => {
          if (keyEvent.key !== 'Enter') return;
          if (keyEvent.repeat) keyEvent.preventDefault();
          else if (keyEvent.target instanceof Node && goesByRef.current?.contains(keyEvent.target) === true) chooseHeight();
        },
        children: [
          jsx(Dialog.Header, {
            children: resizeRowsLabel(rowCount),
          }),
          jsxs('div', {
            className: 'flex flex-col gap-md',
            children: [
              jsxs(RadioGroup.Root, {
                ref: goesByRef,
                'aria-label': sheetMessages.rowHeight(),
                value: heightPick.goesBy,
                onValueChange: (goesByPicked?: Dynamic) =>
                  setHeightPick(
                    changedHeightPick(heightPick, {
                      goesBy: goesByPicked === 'text' ? 'text' : 'height',
                    }),
                  ),
                children: [
                  jsx(RadioGroup.Item, {
                    value: 'height',
                    label: sheetMessages.setHeight(),
                  }),
                  jsx(RadioGroup.Item, {
                    value: 'text',
                    label: sheetMessages.fitToText(),
                  }),
                ],
              }),
              jsx(PixelsInput, {
                ref: heightInputRef,
                label: sheetMessages.heightInPixels(),
                smallest: MIN_ROW_HEIGHT,
                largest: MAX_ROW_HEIGHT,
                disabled: heightPick.goesBy === 'text',
                value: heightPick.height,
                onValueChange: (height?: Dynamic) => {
                  if (height !== heightPick.height)
                    setHeightPick(
                      changedHeightPick(heightPick, {
                        height: height,
                      }),
                    );
                },
              }),
              jsx(DensityPicker, {
                density: density,
                onDensityChosen: onDensityChosen,
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
                disabled: heightChosen === undefined,
                children: resizeRowsLabel(rowCount),
              }),
            ],
          }),
        ],
      }),
    }),
  });
});
