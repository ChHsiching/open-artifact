import { Menu } from '../../kit/menu.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { newDropdownFormatOpeningList, toolUnavailableText } from '../../i18n/chip-labels.ts';
import { dropdownPaneMessages, numberFormatChoiceLabel, numberFormatGroupLabel, numberFormatGroupHeardAs } from '../../i18n/format-labels.ts';
import { oneRangeNeededText } from '../../i18n/notice-labels.ts';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
import { NUMBER_FORMAT_MENU_SECTIONS, groupOfChoice, exampleOfChoice, NUMBER_FORMAT_GROUPS } from '../../format/number-format-choices.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { focusCheckedItemRef } from '../menu-scroll.ts';
import { barSubmenu } from './text-menus.ts';
import { MenuItemWithWhyOff } from '../menu-item-why-off.ts';
import { languageNameOfLocale, localeMessages } from '../../messages/locale.ts';
import { shortTimeZoneLabel, timeZoneMessages } from '../locale-time-zone-pick.ts';
export function insertCellControl(
  what: Dynamic,
  { onToolUsed: onToolUsed, onFormatChosen: onFormatChosen, onPersonChosen: onPersonChosen }: Dynamic,
) {
  onToolUsed();
  if (what === 'dropdown') onFormatChosen(newDropdownFormatOpeningList());
  if (what === 'person') onPersonChosen();
  if (what === 'date')
    onFormatChosen({
      dateToPick: true,
    });
  if (what === 'checkbox')
    onFormatChosen({
      checkbox: true,
    });
}
export function numberFormatIconOf(choice?: Dynamic) {
  if (choice === 'dropdown' || choice === 'checkbox' || choice === 'person') return CELL_CONTROL_ICONS[choice];
  return NUMBER_FORMAT_ICONS[choice === 'mixed' ? 'general' : choice];
}
export const CELL_CONTROL_ICONS = {
  dropdown: {
    icon: 'Dropdown',
  },
  person: {
    icon: 'User',
  },
  date: {
    icon: 'Calendar',
  },
  checkbox: {
    icon: 'CheckSquare',
  },
};
export const CONTEXT_TOOL_OF_CELL_CONTROL = {
  dropdown: 'asDropdown',
  checkbox: 'asCheckbox',
};
export const cellControlInsertChoices = ({
  formatsThatFit: formatsThatFit,
  takesDropdown: takesDropdown,
  isOneRangeNeeded: isOneRangeNeeded,
}: Dynamic) => [
  {
    what: 'dropdown',
    ...CELL_CONTROL_ICONS.dropdown,
    label: dropdownPaneMessages.dropdown(),
    fits: takesDropdown,
    ...(isOneRangeNeeded && {
      whyNotNow: oneRangeNeededText('dropdown'),
    }),
  },
  {
    what: 'person',
    ...CELL_CONTROL_ICONS.person,
    label: sheetMessages.personCells(),
    fits: true,
  },
  {
    what: 'date',
    ...CELL_CONTROL_ICONS.date,
    label: sheetMessages.dateCells(),
    fits: formatsThatFit.includes('date'),
  },
  {
    what: 'checkbox',
    ...CELL_CONTROL_ICONS.checkbox,
    label: sheetMessages.checkboxCells(),
    fits: formatsThatFit.includes('checkbox'),
  },
];
export const CELL_CONTROLS_IN_MENU_ORDER = ['checkbox', 'dropdown', 'person'];
export const cellControlsInMenuOrder = (choices?: Dynamic) =>
  CELL_CONTROLS_IN_MENU_ORDER.flatMap((input?: Dynamic) => choices.filter((input2?: Dynamic) => input2.what === input));
export const NUMBER_FORMAT_ICONS = {
  general: {
    icon: 'Numbers',
  },
  number: {
    icon: 'Numbers',
  },
  roundedNumber: {
    icon: 'Numbers',
  },
  numberInParentheses: {
    icon: 'Numbers',
  },
  currency: {
    icon: 'DollarSign',
  },
  roundedCurrency: {
    icon: 'DollarSign',
  },
  percent: {
    icon: 'PercentSign',
  },
  scientific: {
    icon: 'Exponent',
  },
  fraction: {
    icon: 'Numbers',
  },
  date: {
    icon: 'Calendar',
  },
  mediumDate: {
    icon: 'Calendar',
  },
  longDate: {
    icon: 'Calendar',
  },
  monthAndDay: {
    icon: 'Calendar',
  },
  monthAndYear: {
    icon: 'Calendar',
  },
  time: {
    icon: 'Clock',
  },
  dateAndTime: {
    icon: 'CalendarClock',
  },
  duration: {
    icon: 'Timer',
  },
  text: {
    icon: 'PlainText',
  },
};
export const NUMBER_FORMAT_GROUP_ICONS = {
  numbers: {
    icon: 'Numbers',
  },
  currencies: {
    icon: 'DollarSign',
  },
  datesAndTimes: {
    icon: 'Calendar',
  },
};
export const NUMBER_FORMAT_SUBMENU_WIDTH = {
  className: 'max-w-[min(24rem,var(--available-width))]',
};
export const NumberFormatMenuItems = React.memo(function ({
  choiceOfSelection: choiceOfSelection,
  inPlaceOfFormat: inPlaceOfFormat,
  onInsertChosen: onInsertChosen,
  formatsThatFit: formatsThatFit,
  onChosen: onChosen,
  workbookInFormatMenu: { locale: locale, examples: examples, onLocaleAsked: onLocaleAsked, timeZone: timeZone, onTimeZoneAsked: onTimeZoneAsked },
}: Dynamic) {
  let sections = formatsThatFit.includes('general') ? NUMBER_FORMAT_MENU_SECTIONS : [];
  let groupOfSelection = groupOfChoice(choiceOfSelection) ?? 'customFormat';
  let formatItem = (input?: Dynamic) =>
    jsx(
      Menu.Item,
      {
        ref: input === choiceOfSelection ? focusCheckedItemRef : undefined,
        icon: NUMBER_FORMAT_ICONS[input].icon,
        checkedRole: 'radio',
        checked: choiceOfSelection === input,
        hint: exampleOfChoice(examples, input),
        onClick: () =>
          onChosen({
            numberFormatChoice: input,
          }),
        children: numberFormatChoiceLabel(input),
      },
      input,
    );
  let sectionEntry = (input?: Dynamic) => {
    if (input === 'general') return formatItem(input);
    if (input === 'customFormat')
      return jsx(
        Menu.Item,
        {
          ref: input === groupOfSelection ? focusCheckedItemRef : undefined,
          icon: 'Sliders',
          onClick: () =>
            onChosen({
              patternToType: true,
            }),
          children: sheetMessages.customFormat(),
        },
        input,
      );
    let value = NUMBER_FORMAT_GROUPS[input];
    let match = value.find((input2?: Dynamic) => input2 === choiceOfSelection);
    return jsx(
      React.Fragment,
      {
        children: barSubmenu(
          numberFormatGroupLabel(input),
          match === undefined ? null : exampleOfChoice(examples, match),
          jsx(Menu.Group, {
            'aria-label': numberFormatGroupLabel(input),
            children: value.map(formatItem),
          }),
          {
            icon: NUMBER_FORMAT_GROUP_ICONS[input].icon,
            listWidth: NUMBER_FORMAT_SUBMENU_WIDTH,
            ...(match !== undefined &&
              numberFormatChoiceLabel(match) !== numberFormatGroupLabel(input) && {
                heardAs: numberFormatGroupHeardAs(input, match),
              }),
            ...(input === groupOfSelection && {
              rowRef: focusCheckedItemRef,
            }),
          },
        ),
      },
      input,
    );
  };
  return jsxs(Fragment, {
    children: [
      jsxs(Menu.Group, {
        'aria-label': sheetMessages.numberFormat(),
        children: [
          inPlaceOfFormat.map(
            ({ what: what, icon: icon, label: label, fits: fits, whyNotNow: whyNotNow }: Dynamic) =>
              jsx(
                MenuItemWithWhyOff,
                {
                  ref: what === groupOfSelection ? focusCheckedItemRef : undefined,
                  icon: icon,
                  checkedRole: 'radio',
                  checked: choiceOfSelection === what,
                  disabled: !fits || whyNotNow !== undefined,
                  whyOff: fits ? (whyNotNow ?? null) : toolUnavailableText(label),
                  onClick: () => onInsertChosen(what),
                  children: label,
                },
                what,
              ),
          ),
          sections.map(
            (input?: Dynamic, options?: Dynamic) =>
              jsxs(
                React.Fragment,
                {
                  children: [(options > 0 || inPlaceOfFormat.length > 0) && jsx(Menu.Separator, {}), input.map(sectionEntry)],
                },
                input[0],
              ),
          ),
        ],
      }),
      (sections.length > 0 || inPlaceOfFormat.length > 0) && jsx(Menu.Separator, {}),
      jsxs(Menu.Group, {
        children: [
          jsx(Menu.GroupLabel, {
            children: sheetMessages.sheetSettings(),
          }),
          jsx(Menu.Item, {
            icon: 'Globe',
            hint: languageNameOfLocale(locale),
            onClick: onLocaleAsked,
            children: localeMessages.locale(),
          }),
          jsx(Menu.Item, {
            icon: 'Clock',
            hint: shortTimeZoneLabel(timeZone),
            onClick: onTimeZoneAsked,
            children: timeZoneMessages.timeZone(),
          }),
        ],
      }),
    ],
  });
});
