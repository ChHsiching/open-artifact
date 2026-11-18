import type { Dynamic } from '../dynamic.ts';
import { translateMessage } from './messages.ts';
import { dropdownPaneMessages, cellColorName } from './format-labels.ts';
import { DROPDOWN_OPTION_SETS, STATUS_OPTION_SET } from '../chips/dropdown-presets.ts';
export function dropdownPresetName(preset?: Dynamic) {
  switch (preset) {
    case 'status':
      return translateMessage({
        defaultMessage: 'Status',
        id: 'SgkL8mZWEy',
      });
    case 'priority':
      return translateMessage({
        defaultMessage: 'Priority',
        id: 'JLsKyLlnLt',
      });
    case 'yesNo':
      return translateMessage({
        defaultMessage: 'Yes / No',
        id: '9VJcM5aKsz',
      });
    case 'approval':
      return translateMessage({
        defaultMessage: 'Approval',
        id: 'OINjBG1LQD',
      });
    case 'health':
      return translateMessage({
        defaultMessage: 'Health',
        id: 'uQgYkO+hAY',
      });
    case 'size':
      return translateMessage({
        defaultMessage: 'Size',
        id: 'UBahCp+LOr',
      });
  }
}
export function dropdownPresetOptionLabel(optionKey?: Dynamic) {
  switch (optionKey) {
    case 'notStarted':
      return translateMessage({
        defaultMessage: 'Not started',
        id: 'KV98WTt9HG',
      });
    case 'inProgress':
      return translateMessage({
        defaultMessage: 'In progress',
        id: 'RsCTKkON7P',
      });
    case 'blocked':
      return translateMessage({
        defaultMessage: 'Blocked',
        id: 'VfkBEJfMJz',
      });
    case 'done':
      return translateMessage({
        defaultMessage: 'Done',
        id: 'E8+1eZ+ib0',
      });
    case 'low':
      return translateMessage({
        defaultMessage: 'Low',
        id: 'NkYDsMlhGz',
      });
    case 'medium':
      return translateMessage({
        defaultMessage: 'Medium',
        id: 'aMIwtNQZ4U',
      });
    case 'high':
      return translateMessage({
        defaultMessage: 'High',
        id: 'c4a5NqEk7R',
      });
    case 'yes':
      return translateMessage({
        defaultMessage: 'Yes',
        id: 'cO9FmwXjPg',
      });
    case 'no':
      return translateMessage({
        defaultMessage: 'No',
        id: 'S4ap9EIwn7',
      });
    case 'pending':
      return translateMessage({
        defaultMessage: 'Pending',
        id: 'CN5k/QcesU',
      });
    case 'approved':
      return translateMessage({
        defaultMessage: 'Approved',
        id: 'YcbD+FfOku',
      });
    case 'rejected':
      return translateMessage({
        defaultMessage: 'Rejected',
        id: 'BSEpvYkQvj',
      });
    case 'onTrack':
      return translateMessage({
        defaultMessage: 'On track',
        id: 'phfUMOJdWT',
      });
    case 'atRisk':
      return translateMessage({
        defaultMessage: 'At risk',
        id: '0iUayl6kJM',
      });
    case 'offTrack':
      return translateMessage({
        defaultMessage: 'Off track',
        id: '63UBTStjtt',
      });
    case 'small':
      return translateMessage({
        defaultMessage: 'S',
        id: '1cZ8tqv/S9',
      });
    case 'mediumSize':
      return translateMessage({
        defaultMessage: 'M',
        id: 'd+mdfwe1bv',
      });
    case 'large':
      return translateMessage({
        defaultMessage: 'L',
        id: 'yoA4eGR83G',
      });
    case 'extraLarge':
      return translateMessage({
        defaultMessage: 'XL',
        id: 'z2yNZQ1Xxc',
      });
  }
}
export function dropdownOptionsAddedForCellsText({ count: count, skipped: skipped, isFull: isFull }: Dynamic, cells?: Dynamic) {
  if (skipped === 0)
    return translateMessage(
      {
        defaultMessage: '{count, plural, one {# option added for {cells}} other {# options added for {cells}}}',
        id: 'Bejxh9q0n2',
      },
      {
        count: count,
        cells: cells,
      },
    );
  return isFull
    ? translateMessage(
        {
          defaultMessage:
            '{count, plural, one {# option added for {cells}, {skipped, number} skipped. A dropdown can have up to 100 options.} other {# options added for {cells}, {skipped, number} skipped. A dropdown can have up to 100 options.}}',
          id: 'HcIfGRClaP',
        },
        {
          count: count,
          skipped: skipped,
          cells: cells,
        },
      )
    : translateMessage(
        {
          defaultMessage:
            '{count, plural, one {# option added for {cells}, {skipped, number} skipped} other {# options added for {cells}, {skipped, number} skipped}}',
          id: 'GC/TNaD6ta',
        },
        {
          count: count,
          skipped: skipped,
          cells: cells,
        },
      );
}
export function dropdownOptionRemovedText({ label: label, isSaved: isSaved, onlyIn: onlyIn }: Dynamic) {
  if (onlyIn === null)
    return isSaved
      ? translateMessage(
          {
            defaultMessage: '{label} removed',
            id: 'TbV92pVIDf',
          },
          {
            label: label,
          },
        )
      : translateMessage(
          {
            defaultMessage: 'Removing {label}…',
            id: 'D8EnMKaN46',
          },
          {
            label: label,
          },
        );
  return isSaved
    ? translateMessage(
        {
          defaultMessage: '{label} removed for {cells}',
          id: '20Y1875V32',
        },
        {
          label: label,
          cells: onlyIn,
        },
      )
    : translateMessage(
        {
          defaultMessage: 'Removing {label} for {cells}…',
          id: '18SzHGtWS5',
        },
        {
          label: label,
          cells: onlyIn,
        },
      );
}
export function dropdownOptionsAddedText(added?: Dynamic) {
  let { count: count, skipped: skipped, isFull: isFull, onlyIn: onlyIn } = added;
  if (onlyIn !== null && count > 0) return dropdownOptionsAddedForCellsText(added, onlyIn);
  if (skipped === 0)
    return translateMessage(
      {
        defaultMessage: '{count, plural, one {# option added} other {# options added}}',
        id: 'fYWNJMyaET',
      },
      {
        count: count,
      },
    );
  return isFull
    ? translateMessage(
        {
          defaultMessage:
            '{count, plural, =0 {No options added, {skipped, number} skipped. A dropdown can have up to 100 options.} one {# option added, {skipped, number} skipped. A dropdown can have up to 100 options.} other {# options added, {skipped, number} skipped. A dropdown can have up to 100 options.}}',
          id: 'nibirqsMdi',
        },
        {
          count: count,
          skipped: skipped,
        },
      )
    : translateMessage(
        {
          defaultMessage:
            '{count, plural, =0 {No options added, {skipped, number} skipped} one {# option added, {skipped, number} skipped} other {# options added, {skipped, number} skipped}}',
          id: 'Ny0xdVQMrn',
        },
        {
          count: count,
          skipped: skipped,
        },
      );
}
export function dropdownCellsRefusalText(refusal?: Dynamic) {
  switch (refusal.why) {
    case 'ofAnotherDropdown':
      return translateMessage({
        defaultMessage: 'Some of those cells have another dropdown. Choose cells without one.',
        id: '4SdStSH7s/',
      });
    case 'holdFormula':
      return translateMessage({
        defaultMessage: 'Some of those cells have a formula. Choose cells without one.',
        id: 'MWpiJWaTAz',
      });
    case 'holdNoOption':
      return translateMessage({
        defaultMessage: 'Some of those cells have content that isn’t an option. Choose other cells, or add it as an option.',
        id: '2Mdw/VhtyD',
      });
    case 'headingIsNoOption':
      return translateMessage({
        defaultMessage: 'This heading can’t be an option. You can edit it or remove an option.',
        id: 'yCbTcGS1N3',
      });
    case 'notFound':
      return translateMessage(
        {
          defaultMessage: '“{typed}” doesn’t name any cells in this sheet. Try something like C2:C20.',
          id: 'eUp4N+4rRP',
        },
        {
          typed: refusal.typed,
        },
      );
  }
}
export function personRowLabel(name?: Dynamic, who?: Dynamic, isHeldByCell?: Dynamic) {
  if (who === 'you')
    return isHeldByCell
      ? translateMessage(
          {
            defaultMessage: '{name}, you, already in this cell',
            id: 'tSRj477kGB',
          },
          {
            name: name,
          },
        )
      : translateMessage(
          {
            defaultMessage: '{name}, you',
            id: '2V/02EhhX+',
          },
          {
            name: name,
          },
        );
  if (who === 'guest')
    return isHeldByCell
      ? translateMessage(
          {
            defaultMessage: '{name}, guest, already in this cell',
            id: '700YyKou/7',
          },
          {
            name: name,
          },
        )
      : translateMessage(
          {
            defaultMessage: '{name}, guest',
            id: 'Tj7buc6HSP',
          },
          {
            name: name,
          },
        );
  return isHeldByCell
    ? translateMessage(
        {
          defaultMessage: '{name}, already in this cell',
          id: 'b2FdOsDZh2',
        },
        {
          name: name,
        },
      )
    : name;
}
export const localizeDropdownPreset = ({ key: key, options: options }: Dynamic) => ({
  key: key,
  options: options.map(
    (option?: Dynamic) => ({
      label: dropdownPresetOptionLabel(option.key),
      color: option.color,
    }),
  ),
});
export const dropdownPresetChosenText = (preset?: Dynamic, optionCount?: Dynamic) =>
  preset === 'custom'
    ? translateMessage({
        defaultMessage: 'Custom: type your own options',
        id: 'mKDhqTncT7',
      })
    : translateMessage(
        {
          defaultMessage: '{optionCount, plural, one {{set} preset: # option} other {{set} preset: # options}}',
          id: 'wvCrx7vsJu',
        },
        {
          set: dropdownPresetName(preset),
          optionCount: optionCount,
        },
      );
export const dropdownPresetButtonLabel = (chosen?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Preset: {chosen}',
      id: 'tXt7SnGmJt',
    },
    {
      chosen: chosen === 'custom' ? dropdownPaneMessages.customOptions() : dropdownPresetName(chosen),
    },
  );
export const localizedDropdownPresets = () =>
  DROPDOWN_OPTION_SETS.map(
    (preset?: Dynamic) => ({
      label: dropdownPresetName(preset.key),
      set: localizeDropdownPreset(preset),
    }),
  );
export const newDropdownFormat = () => ({
  dropdown: true,
  firstSet: localizeDropdownPreset(STATUS_OPTION_SET),
  setsByName: localizedDropdownPresets(),
});
export const toolUnavailableText = (tool?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{tool} isn’t available for the selected cells.',
      id: 'OjVl8psG8l',
    },
    {
      tool: tool,
    },
  );
export const newDropdownFormatOpeningList = () => ({
  ...newDropdownFormat(),
  replacesFormulas: true,
  thenOpens: 'list',
});
export const dropdownOptionsForCellLabel = (cell?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Options for {cell}',
      id: 'XX8Kx3pmzc',
    },
    {
      cell: cell,
    },
  );
export const optionListForCellLabel = (cell?: Dynamic, optionCount?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{optionCount, plural, one {List of # option for {cell}} other {List of # options for {cell}}}',
      id: 'h5Z2oh9cY7',
    },
    {
      cell: cell,
      optionCount: optionCount,
    },
  );
export const addOptionText = (text?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Add “{text}”',
      id: 'oY52ahYifg',
    },
    {
      text: text,
    },
  );
export const optionColorName = (color?: Dynamic) =>
  color.kind !== 'standard'
    ? cellColorName('fillColor', color)
    : translateMessage(
        {
          defaultMessage:
            '{hue, select, gray {Gray} red {Red} orange {Orange} yellow {Yellow} green {Green} teal {Teal} blue {Blue} purple {Purple} magenta {Magenta} other {Other}}',
          id: '57+0RleDvz',
        },
        {
          hue: color.hue,
        },
      );
export const dropdownCellsButtonLabel = (chosen?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Cells: {chosen}',
      id: 'zHGk+7S5VH',
    },
    {
      chosen: chosen,
    },
  );
export const onlyCellsLabel = (cells?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Only {cells}',
      id: '7FeNQfMC4C',
    },
    {
      cells: cells,
    },
  );
export const optionAlreadyExistsText = (option?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '“{option}” is already an option.',
      id: 'F1OPOBT5CH',
    },
    {
      option: option,
    },
  );
export const optionNumberLabel = (number?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Option {number, number}',
      id: '8/pRdQ3zFj',
    },
    {
      number: number,
    },
  );
export const optionColorButtonLabel = (number?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Option {number, number} color',
      id: 'c8ATfwcTzC',
    },
    {
      number: number,
    },
  );
export const optionColorButtonHeardAs = (number?: Dynamic, color?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Option {number, number} color, {color}',
      id: 'ya0bzzyz5p',
    },
    {
      number: number,
      color: cellColorName('fillColor', color),
    },
  );
export const reorderOptionLabel = (number?: Dynamic, label?: Dynamic) =>
  label.trim() === ''
    ? translateMessage(
        {
          defaultMessage: 'Reorder option {number, number}',
          id: 'V/W03J+8oN',
        },
        {
          number: number,
        },
      )
    : translateMessage(
        {
          defaultMessage: 'Reorder {label}',
          id: 'Cxw6Low+ad',
        },
        {
          label: label.trim(),
        },
      );
export const removeOptionLabel = (number?: Dynamic, label?: Dynamic) =>
  label.trim() === ''
    ? translateMessage(
        {
          defaultMessage: 'Remove option {number, number}',
          id: 'Ieu729Co2l',
        },
        {
          number: number,
        },
      )
    : translateMessage(
        {
          defaultMessage: 'Remove {label}',
          id: 't8XK4f/n97',
        },
        {
          label: label.trim(),
        },
      );
export const peoplePickerMessages = {
  searching: () =>
    translateMessage({
      defaultMessage: 'Searching…',
      id: 'R5W/gP878D',
    }),
  found: (count?: Dynamic) =>
    translateMessage(
      {
        defaultMessage: '{count, plural, =0 {No people found} one {# person listed} other {# people listed}}',
        id: 'kE0OOmcExu',
      },
      {
        count: count,
      },
    ),
  noMatches: () =>
    translateMessage({
      defaultMessage: 'No matches',
      id: '05nEyZDrRm',
    }),
  noMatchingPeople: () =>
    translateMessage({
      defaultMessage: 'No matching people',
      id: 'BWAIVccO+E',
    }),
  keepTyping: () =>
    translateMessage({
      defaultMessage: 'Keep typing to search people',
      id: '3uisiQfQ47',
    }),
  addPeople: () =>
    translateMessage({
      defaultMessage: 'Add people',
      id: 'XK/aWA01DN',
    }),
  addMore: () =>
    translateMessage({
      defaultMessage: 'Add more',
      id: 'AS+Bobws/Y',
    }),
  you: () =>
    translateMessage({
      defaultMessage: 'You',
      id: 'xJE9TB9PQY',
    }),
  guest: () =>
    translateMessage({
      defaultMessage: 'Guest',
      id: 'Zo/z4eGuKq',
    }),
};
export const morePeopleCountText = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {+#} other {+#}}',
      id: 'vCW45oQJS9',
    },
    {
      count: count,
    },
  );
