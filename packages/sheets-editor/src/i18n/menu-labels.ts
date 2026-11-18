import { AGENT_NAME } from '../agent/agent-name.ts';
import type { Dynamic } from '../dynamic.ts';
import { translateMessage, MESSAGE_LOCALE } from './messages.ts';
import { localizedDropdownPresets, localizeDropdownPreset } from './chip-labels.ts';
import { dropdownPaneMessages, numberFormatChoiceLabel } from './format-labels.ts';
import { STATUS_OPTION_SET } from '../chips/dropdown-presets.ts';
import { sheetMessages } from './sheet-messages.ts';
import { isoDayOfDate } from '../chips/calendar.ts';
import { truncateGraphemes, PERSON_NAME_IN_NOTICE_MAX_CHARACTERS } from './grid-action-labels.ts';
export function atMenuSectionTitle(section?: Dynamic) {
  switch (section) {
    case 'agent':
      return null;
    case 'people':
      return translateMessage({
        defaultMessage: 'People',
        id: '/jCWnHyUPU',
      });
    case 'dates':
      return translateMessage({
        defaultMessage: 'Dates',
        id: 'UJySni+xnd',
      });
    case 'dropdowns':
      return translateMessage({
        defaultMessage: 'Dropdowns',
        id: '/dIwCVJ82W',
      });
    case 'controls':
      return translateMessage({
        defaultMessage: 'Controls',
        id: 'kN2SksN/UM',
      });
  }
}
export function atMenuOffers(today2?: Dynamic, isAskAgentOffered: Dynamic = false) {
  let presetOffers = localizedDropdownPresets().map(
    ({ label: label, set: set }: Dynamic) => ({
      kind: 'dropdownOfSet',
      set: set,
      label: label,
      alsoFoundBy: dropdownPaneMessages.presets(),
    }),
  );
  return [
    ...(isAskAgentOffered ? [askAgentAtMenuOffer()] : []),
    {
      kind: 'calendar',
      label: translateMessage({
        defaultMessage: 'Date',
        id: 'LkRUflzvmY',
      }),
    },
    {
      kind: 'day',
      day: dayOffsetFrom(today2, 0),
      label: translateMessage({
        defaultMessage: 'Today’s date',
        id: 'eYlK1+Lopf',
      }),
    },
    {
      kind: 'day',
      day: dayOffsetFrom(today2, 1),
      label: translateMessage({
        defaultMessage: 'Tomorrow’s date',
        id: 'gfuloSQ26K',
      }),
    },
    {
      kind: 'day',
      day: dayOffsetFrom(today2, -1),
      label: translateMessage({
        defaultMessage: 'Yesterday’s date',
        id: 'KW4hqJrARz',
      }),
    },
    {
      kind: 'newDropdown',
      set: localizeDropdownPreset(STATUS_OPTION_SET),
      label: translateMessage({
        defaultMessage: 'Dropdown',
        id: 'OK4kYxjHuD',
      }),
    },
    ...presetOffers.slice(0, PRESET_OFFERS_SHOWN),
    {
      kind: 'several',
      offers: presetOffers.slice(PRESET_OFFERS_SHOWN),
      label: translateMessage({
        defaultMessage: 'See more',
        id: '20ZZODSS/l',
      }),
      spokenLabel: translateMessage({
        defaultMessage: 'See more dropdowns',
        id: 'Ew10yMPoHq',
      }),
    },
    {
      kind: 'checkbox',
      label: sheetMessages.checkboxCells(),
    },
  ];
}
export function peopleOnSheetText(names?: Dynamic) {
  let namedPeople = names.slice(0, MAX_PEOPLE_NAMED_ON_SHEET);
  let othersCount = names.length - namedPeople.length;
  if (othersCount === 0)
    return translateMessage(
      {
        defaultMessage: '{count, plural, one {{people} is on this sheet} other {{people} are on this sheet}}',
        id: 'cR64atl6TQ',
      },
      {
        count: namedPeople.length,
        people: new (Intl.ListFormat as Dynamic)(MESSAGE_LOCALE).format(namedPeople),
      },
    );
  return translateMessage(
    {
      defaultMessage: '{count, plural, one {{people}, and # other are on this sheet} other {{people}, and # others are on this sheet}}',
      id: 'EzYLgEF4wB',
    },
    {
      count: othersCount,
      people: new (Intl.ListFormat as Dynamic)(MESSAGE_LOCALE, {
        type: 'unit',
      }).format(namedPeople),
    },
  );
}
export const dayOffsetFrom = (date?: Dynamic, days?: Dynamic) =>
  isoDayOfDate(new (Date as Dynamic)(date.getFullYear(), date.getMonth(), date.getDate() + days));
export const PRESET_OFFERS_SHOWN = 3;
export const askAgentAtMenuOffer = () => ({
  kind: 'askAgent',
  label: translateMessage({
    defaultMessage: 'Ask Agent',
    id: 'pwtGzlHJMi',
  }),
});
export const opensMoreRowsLabel = (label?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{label}, opens more rows',
      id: 'oXICBakKDO',
    },
    {
      label: label,
    },
  );
export const editCardHeadingLabel = (option?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Edit {option}',
      id: 'WVUwMFglWP',
    },
    {
      option: option,
    },
  );
export const cardAndRowLabel = (card?: Dynamic, row?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{card}. {row}',
      id: 'fSKAM1cnMI',
    },
    {
      card: card,
      row: row,
    },
  );
export const deleteCardHeadingLabel = (option?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Delete {option}',
      id: '7y6U7TetAq',
    },
    {
      option: option,
    },
  );
export const optionPlaceInListLabel = (option?: Dynamic, place?: Dynamic, optionCount?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{option}, {place, number} of {optionCount, number}',
      id: '4kKFlX4npa',
    },
    {
      option: option,
      place: place,
      optionCount: optionCount,
    },
  );
export const optionRightArrowToEditLabel = (option?: Dynamic, place?: Dynamic, optionCount?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{option}, {place, number} of {optionCount, number}. Right arrow to edit',
      id: 'QwfwnEkvai',
    },
    {
      option: option,
      place: place,
      optionCount: optionCount,
    },
  );
export const currentColorLabel = (label?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{label}, current color',
      id: 'WhCMCmtTnC',
    },
    {
      label: label,
    },
  );
export const keepAsTextLabel = (text?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Keep “{text}” as text',
      id: 'jnI/lD2ukb',
    },
    {
      text: truncateGraphemes(text, PERSON_NAME_IN_NOTICE_MAX_CHARACTERS),
    },
  );
export const peopleForCellLabel = (cell?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'People for {cell}',
      id: 'zPCqem0JFu',
    },
    {
      cell: cell,
    },
  );
export const personAlreadyInCellText = (name?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{name} is already in this cell.',
      id: 'II4UxahKqO',
    },
    {
      name: name,
    },
  );
export const personChipRemoveHint = (name?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{name}. Press Backspace or Delete to remove.',
      id: 'DjP1zpZgSM',
    },
    {
      name: name,
    },
  );
export const cellsAddedToMessageText = (cells?: Dynamic, isPauseToBeTold?: Dynamic) =>
  isPauseToBeTold
    ? translateMessage(
        {
          defaultMessage:
            '{cells} added to your message to Agent. Typing in the Sheet is paused. The message box is outside the Sheet. Press Escape to go back to the cells.',
          id: 'sM+EzWDy/k',
        },
        {
          cells: cells,
        },
      )
    : translateMessage(
        {
          defaultMessage: '{cells} added to your message to Agent.',
          id: '/uD0bjYgMc',
        },
        {
          cells: cells,
        },
      );
export const removeItemLabel = (item?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Remove {item}',
      id: '+oQ+9icbbr',
    },
    {
      item: item,
    },
  );
export const insertInCellLabel = (cell?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Insert in {cell}',
      id: 'KPbSQMBZ0/',
    },
    {
      cell: cell,
    },
  );
export const foldedFlagsCountText = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {+#} other {+#}}',
      id: 'znKBNLz3SP',
    },
    {
      count: count,
    },
  );
export const sheetTabCommentsLabel = (name?: Dynamic, count?: Dynamic) =>
  count === 0
    ? undefined
    : translateMessage(
        {
          defaultMessage: '{count, plural, one {{name}, # open comment} other {{name}, # open comments}}',
          id: 'qs1Fjy3o4Q',
        },
        {
          name: name,
          count: count,
        },
      );
export const MAX_PEOPLE_NAMED_ON_SHEET = 7;
export const agentFlagName = () => AGENT_NAME;
export const timesForCellLabel = (cell?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Times for {cell}',
      id: '0X6RnZlcBJ',
    },
    {
      cell: cell,
    },
  );
export const suggestionHeardAs = (words?: Dynamic, isKeyDrawn?: Dynamic) =>
  isKeyDrawn
    ? translateMessage(
        {
          defaultMessage: 'Suggestion: “{words}”. Press Tab to enter it.',
          id: 'PrniwBoBqs',
        },
        {
          words: words,
        },
      )
    : translateMessage(
        {
          defaultMessage: 'Suggestion: “{words}”, with a button to use it.',
          id: 'bSqv9WVmSQ',
        },
        {
          words: words,
        },
      );
export const useSuggestionLabel = (words?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Use “{words}”',
      id: 'EF/PCUg7m9',
    },
    {
      words: words,
    },
  );
export const suggestionGoneText = () =>
  translateMessage({
    defaultMessage: 'The suggestion is gone.',
    id: 'WZWzllJlbg',
  });
export const tabKeyLabel = () =>
  translateMessage({
    defaultMessage: 'Tab',
    id: '3e4DfmbESG',
  });
export const numberFormatButtonLabel = (format?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{format}, Number format',
      id: 'pT4EJYrulE',
    },
    {
      format: format === 'person' ? sheetMessages.personCells() : numberFormatChoiceLabel(format),
    },
  );
export const fontSizeText = (size?: Dynamic) => (size === null ? sheetMessages.signOfMixedFontSizes() : String(size));
export const numberFormatExampleLabel = (format?: Dynamic, example?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{format}, {example}',
      id: 'WeysxCROSe',
    },
    {
      format: numberFormatChoiceLabel(format),
      example: example,
    },
  );
export const fontSizeButtonLabel = (size?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{isMixed, select, true {Font size, Mixed} other {Font size, {size}}}',
      id: 'BGctnjZ5Q9',
    },
    {
      isMixed: String(size === null),
      size: size ?? 0,
    },
  );
