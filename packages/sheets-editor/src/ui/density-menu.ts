import { Menu } from '../kit/menu.tsx';
import { Combobox } from '../kit/combobox.tsx';
import { Separator } from '../kit/separator.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { preventMouseDownDefault } from './dom-events.ts';
import { blockRepeatedEnterOrSpace, blockRepeatedTyping } from './repeated-key-guards.ts';
export function DensitySubmenu({ density: density, onDensityChosen: onDensityChosen, picked: picked }: Dynamic) {
  return jsxs(Menu.Submenu, {
    children: [
      jsx(Menu.SubmenuTrigger, {
        hint: densityLabel(density),
        children: sheetMessages.layout(),
      }),
      jsx(Menu.Popup, {
        onMouseDown: preventMouseDownDefault,
        onKeyDownCapture: blockRepeatedEnterOrSpace,
        children: jsx(Menu.Group, {
          'aria-label': sheetMessages.layout(),
          children: DENSITIES.map(
            (choice?: Dynamic) =>
              jsx(
                Menu.Item,
                {
                  checkedRole: 'radio',
                  checked: choice === density,
                  onClick: picked(() => onDensityChosen(choice)),
                  children: densityLabel(choice),
                },
                choice,
              ),
          ),
        }),
      }),
    ],
  });
}
export function DensityPicker({ density: density, onDensityChosen: onDensityChosen }: Dynamic) {
  let [labelId, hintId] = [React.useId(), React.useId()];
  let densityItems = React.useMemo(
    () =>
      DENSITIES.map(
        (choice?: Dynamic) => ({
          value: choice,
          label: densityLabel(choice),
        }),
      ),
    [],
  );
  return jsxs(Fragment, {
    children: [
      jsx(Separator, {}),
      jsxs('div', {
        className: 'flex items-center justify-between gap-md',
        onKeyDownCapture: blockRepeatedTyping,
        children: [
          jsx('span', {
            id: labelId,
            className: 'text-body font-medium',
            children: sheetMessages.layout(),
          }),
          jsx(Combobox, {
            'aria-labelledby': labelId,
            'aria-describedby': hintId,
            searchable: false,
            fullWidth: false,
            align: 'end',
            items: densityItems,
            value: density,
            onChange: (choice?: Dynamic) => {
              if (choice !== null) onDensityChosen(choice);
            },
          }),
          jsx('span', {
            id: hintId,
            hidden: true,
            children: sheetMessages.onlyForYou(),
          }),
        ],
      }),
    ],
  });
}
export const densityLabel = (density?: Dynamic) => (density === 'compact' ? sheetMessages.compact() : sheetMessages.comfortable());
export const DENSITIES = ['comfortable', 'compact'];
