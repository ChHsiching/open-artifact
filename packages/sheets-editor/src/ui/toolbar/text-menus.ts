import { Menu } from '../../kit/menu.tsx';
import type { Dynamic } from '../../dynamic.ts';
import { FONT_MARK_SHORTCUTS } from '../../editor/text-looks.ts';
import {
  fontSizesMatchingTyped,
  FONT_SIZE_CHOICES,
  SMALLEST_FONT_SIZE,
  LARGEST_FONT_SIZE,
  VERTICAL_ALIGN_CHOICES,
} from '../../format/toolbar-size-choices.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
import { textWrappingLabel, textWrappingButtonLabel, horizontalAlignmentLabel, verticalAlignmentLabel } from '../../i18n/format-labels.ts';
import { HORIZONTAL_ALIGNMENTS } from '../../format/toolbar-choices.ts';
import { translateMessage } from '../../i18n/messages.ts';
import { preventMouseDownDefault } from '../dom-events.ts';
import { blockRepeatedEnterOrSpace } from '../repeated-key-guards.ts';
import { CONTEXT_BAR_PART_ATTRIBUTE } from '../toolbar-tooltip.ts';
import { MENU_MAX_VISIBLE_ITEMS } from '../menu-scroll.ts';
import { fontSizeText, fontSizeButtonLabel } from '../../i18n/menu-labels.ts';
export function formatToggleShortcut(toggle?: Dynamic) {
  let { letter: letter, isWithShift: isWithShift } = FONT_MARK_SHORTCUTS[toggle];
  return isWithShift ? `cmd+shift+${letter}` : `cmd+${letter}`;
}
export function FontSizeItems({ shared: shared, onChosen: onChosen, typed = '' }: Dynamic) {
  let isTyped = typed.trim() !== '';
  let sizes = isTyped ? fontSizesMatchingTyped(typed) : FONT_SIZE_CHOICES;
  if (sizes.length === 0)
    return jsx('p', {
      className: 'py-sm text-footnote text-muted compact:px-2 comfortable:px-2.5',
      children: fontSizeRangeMessage(SMALLEST_FONT_SIZE, LARGEST_FONT_SIZE),
    });
  return jsx(Menu.Group, {
    'aria-label': sheetMessages.fontSize(),
    children: sizes.map(
      (input?: Dynamic, index?: Dynamic) =>
        jsx(
          Menu.Item,
          {
            checkedRole: 'radio',
            checked: shared.font.size === input,
            ...(isTyped &&
              index === 0 && {
                className: 'sheet-row-under-enter',
              }),
            onClick: () =>
              onChosen({
                fontSizeInPoints: input,
              }),
            children: input,
          },
          input,
        ),
    ),
  });
}
export function TextWrappingItems({ shared: shared, onChosen: onChosen, hasHeading: hasHeading }: Dynamic) {
  let wrapping = textWrappingOf(shared);
  return jsxs(Menu.Group, {
    ...(!hasHeading && {
      'aria-label': sheetMessages.textWrapping(),
    }),
    children: [
      hasHeading &&
        jsx(Menu.GroupLabel, {
          children: sheetMessages.textWrapping(),
        }),
      TEXT_WRAPPING_CHOICES.map(
        (input?: Dynamic) =>
          jsx(
            Menu.Item,
            {
              checkedRole: 'radio',
              checked: wrapping === input,
              onClick: () => onChosen(textWrappingChange(input)),
              children: textWrappingLabel(input),
            },
            input,
          ),
      ),
    ],
  });
}
export function TextWrappingSubmenu({ shared: shared, onChosen: onChosen, hasIcon: hasIcon }: Dynamic) {
  let wrapping = textWrappingOf(shared);
  return barSubmenu(
    sheetMessages.textWrapping(),
    wrapping === null ? sheetMessages.signOfMixedTextWrappings() : textWrappingLabel(wrapping),
    jsx(TextWrappingItems, {
      shared: shared,
      onChosen: onChosen,
      hasHeading: false,
    }),
    {
      heardAs: textWrappingButtonLabel(wrapping),
      ...(hasIcon && {
        icon: 'TextWrap',
      }),
    },
  );
}
export function AlignMenuItems({ shared: shared, onChosen: onChosen, hasRowsWithLists: hasRowsWithLists }: Dynamic) {
  return jsxs(Fragment, {
    children: [
      jsx(Menu.Group, {
        'aria-label': sheetMessages.align(),
        children: HORIZONTAL_ALIGNMENTS.map(
          (input?: Dynamic) =>
            jsx(
              Menu.Item,
              {
                icon: HORIZONTAL_ALIGN_ICONS[input],
                description: input === 'general' ? sheetMessages.alignedByWhatCellHolds() : null,
                checkedRole: 'radio',
                checked: shared.alignment.horizontal === input,
                onClick: () =>
                  onChosen({
                    horizontalAlignment: input,
                  }),
                children: horizontalAlignmentLabel(input),
              },
              input,
            ),
        ),
      }),
      jsx(Menu.Separator, {}),
      jsx(Menu.Group, {
        'aria-label': sheetMessages.alignVertically(),
        children: VERTICAL_ALIGN_CHOICES.map(
          (input?: Dynamic) =>
            jsx(
              Menu.Item,
              {
                icon: VERTICAL_ALIGN_ICONS[input],
                checkedRole: 'radio',
                checked: shared.alignment.vertical === input,
                onClick: () =>
                  onChosen({
                    verticalAlignment: input,
                  }),
                children: verticalAlignmentLabel(input),
              },
              input,
            ),
        ),
      }),
      hasRowsWithLists &&
        jsxs(Fragment, {
          children: [
            jsx(Menu.Separator, {}),
            jsx(FontSizeSubmenu, {
              shared: shared,
              onChosen: onChosen,
              hasIcon: true,
            }),
            jsx(TextWrappingSubmenu, {
              shared: shared,
              onChosen: onChosen,
              hasIcon: true,
            }),
          ],
        }),
    ],
  });
}
export const TEXT_WRAPPING_CHOICES = ['overflow', 'wrap'];
export const textWrappingOf = ({ alignment: { wrap: wrap } }: Dynamic) => (wrap === null ? null : wrap ? 'wrap' : 'overflow');
export const textWrappingChange = (wrapping?: Dynamic) => ({
  wrapText: wrapping === 'wrap',
});
export const typeASizeLabel = () =>
  translateMessage({
    defaultMessage: 'Type a size',
    id: 'LzGipBZBU9',
  });
export const fontSizeRangeMessage = (smallest?: Dynamic, largest?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Enter a whole number from {smallest} to {largest}.',
      id: '+QvZFPuqQu',
    },
    {
      smallest: smallest,
      largest: largest,
    },
  );
export const TEXT_ALIGN_ICONS = {
  left: 'TextAlignLeft',
  center: 'TextAlignCenter',
  right: 'TextAlignRight',
};
export const GENERAL_ALIGN_ICON = {
  icon: 'Automatic',
};
export const HORIZONTAL_ALIGN_ICONS = {
  ...TEXT_ALIGN_ICONS,
  general: GENERAL_ALIGN_ICON.icon,
};
export const VERTICAL_ALIGN_ICONS = {
  top: 'AlignStart',
  center: 'AlignCenter',
  bottom: 'AlignEnd',
};
export const BAR_SUBMENU_POPUP_PROPS = {
  onMouseDown: preventMouseDownDefault,
  onKeyDownCapture: blockRepeatedEnterOrSpace,
  [CONTEXT_BAR_PART_ATTRIBUTE]: true,
};
export const BAR_SUBMENU_LIST_WIDTH = {
  className: 'data-[side=bottom]:min-w-[var(--anchor-width)] data-[side=top]:min-w-[var(--anchor-width)]',
};
export const barSubmenu = (
  label?: Dynamic,
  hint?: Dynamic,
  items?: Dynamic,
  { heardAs: heardAs, icon: icon, mostRowsInView = MENU_MAX_VISIBLE_ITEMS, rowRef: rowRef, listWidth: listWidth }: Dynamic = {},
) =>
  jsxs(Menu.Submenu, {
    children: [
      jsx(Menu.SubmenuTrigger, {
        ...(rowRef !== undefined && {
          ref: rowRef,
        }),
        ...(icon !== undefined && {
          icon: icon,
        }),
        ...(hint !== null && {
          hint: hint,
        }),
        ...(heardAs !== undefined && {
          'aria-label': heardAs,
        }),
        children: label,
      }),
      jsx(Menu.Popup, {
        ...BAR_SUBMENU_POPUP_PROPS,
        className: `${BAR_SUBMENU_LIST_WIDTH.className} ${listWidth?.className ?? ''}`,
        maxVisibleItems: mostRowsInView,
        children: items,
      }),
    ],
  });
export const FontSizeSubmenu = ({ shared: shared, onChosen: onChosen, hasIcon: hasIcon }: Dynamic) =>
  barSubmenu(
    sheetMessages.fontSize(),
    fontSizeText(shared.font.size),
    jsx(FontSizeItems, {
      shared: shared,
      onChosen: onChosen,
    }),
    {
      heardAs: fontSizeButtonLabel(shared.font.size),
      ...(hasIcon && {
        icon: 'TextAa',
      }),
      mostRowsInView: FONT_SIZE_CHOICES.length,
    },
  );
export const isWrapTextOn = (format?: Dynamic) => format.alignment.wrap === true;
export const wrapTextToggled = (format?: Dynamic) => ({
  wrapText: !isWrapTextOn(format),
});
