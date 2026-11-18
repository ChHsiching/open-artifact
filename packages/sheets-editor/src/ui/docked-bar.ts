import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { BarIconButton, BarSeparator } from './bar-buttons.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { FONT_SIZE_CHOICES, VERTICAL_ALIGN_CHOICES } from '../format/toolbar-size-choices.ts';
import { HORIZONTAL_ALIGNMENTS } from '../format/toolbar-choices.ts';
import { HORIZONTAL_ALIGN_ICONS, VERTICAL_ALIGN_ICONS, isWrapTextOn, wrapTextToggled } from './toolbar/text-menus.ts';
import { horizontalAlignmentLabel, verticalAlignmentLabel, cellColorName } from '../i18n/format-labels.ts';
import { numberFormatExampleLabel } from '../i18n/menu-labels.ts';
import { exampleOfChoice } from '../format/number-format-choices.ts';
import { colorsEqual, STANDARD_HUE_COLORS, NO_COLOR, BLACK_COLOR } from '../model/colors.ts';
import { fillPaintStyle } from '../grid/cell-drawing.ts';
import { shownCellColor } from '../format/cell-colors.ts';
export function DockedBarChoices({
  of: of,
  shared: shared,
  numberFormatOfSelection: numberFormatOfSelection,
  examplesOfNumberFormats: examplesOfNumberFormats,
  onChosen: onChosen,
  onBack: onBack,
  onAllAsked: onAllAsked,
  onGoing: onGoing,
}: Dynamic) {
  React.useLayoutEffect(() => onGoing, [onGoing]);
  let currentColor = of === 'fillColor' ? shared.fillColor : shared.font.color;
  return jsxs(Fragment, {
    children: [
      jsx('span', {
        className: 'sheet-back-in-docked-bar',
        children: jsx(BarIconButton, {
          ...DOCKED_TOOL_PROPS,
          icon: 'CaretLeft',
          label: sheetMessages.backToTools(),
          onClick: onBack,
        }),
      }),
      of === 'fontSize' &&
        FONT_SIZE_CHOICES.map(
          (size?: Dynamic) =>
            jsx(
              Button,
              {
                variant: 'ghost',
                pressed: shared.font.size === size,
                onClick: () =>
                  onChosen({
                    fontSizeInPoints: size,
                  }),
                children: jsx('span', {
                  className: 'tabular-nums',
                  children: size,
                }),
              },
              size,
            ),
        ),
      of === 'align' &&
        jsxs(Fragment, {
          children: [
            HORIZONTAL_ALIGNMENTS.map(
              (alignment?: Dynamic) =>
                jsx(
                  BarIconButton,
                  {
                    ...DOCKED_TOOL_PROPS,
                    icon: HORIZONTAL_ALIGN_ICONS[alignment],
                    label: horizontalAlignmentLabel(alignment),
                    pressed: shared.alignment.horizontal === alignment,
                    onClick: () =>
                      onChosen({
                        horizontalAlignment: alignment,
                      }),
                  },
                  alignment,
                ),
            ),
            jsx(BarSeparator, {}),
            VERTICAL_ALIGN_CHOICES.map(
              (alignment?: Dynamic) =>
                jsx(
                  BarIconButton,
                  {
                    ...DOCKED_TOOL_PROPS,
                    icon: VERTICAL_ALIGN_ICONS[alignment],
                    label: verticalAlignmentLabel(alignment),
                    pressed: shared.alignment.vertical === alignment,
                    onClick: () =>
                      onChosen({
                        verticalAlignment: alignment,
                      }),
                  },
                  alignment,
                ),
            ),
            jsx(BarSeparator, {}),
            jsx(BarIconButton, {
              ...DOCKED_TOOL_PROPS,
              icon: 'TextWrap',
              label: sheetMessages.wrapText(),
              pressed: isWrapTextOn(shared),
              onClick: () => onChosen(wrapTextToggled(shared)),
            }),
          ],
        }),
      of === 'numberFormat' &&
        DOCKED_NUMBER_FORMATS.map(
          (format?: Dynamic) =>
            jsx(
              Button,
              {
                variant: 'ghost',
                'aria-label': numberFormatExampleLabel(format, exampleOfChoice(examplesOfNumberFormats, format)),
                pressed: numberFormatOfSelection === format,
                onClick: () =>
                  onChosen({
                    numberFormatChoice: format,
                  }),
                children: jsx('span', {
                  className: 'tabular-nums',
                  children: exampleOfChoice(examplesOfNumberFormats, format),
                }),
              },
              format,
            ),
        ),
      (of === 'textColor' || of === 'fillColor') &&
        DOCKED_COLORS[of].map(
          (color?: Dynamic) =>
            jsx(
              'button',
              {
                type: 'button',
                className: 'sheet-swatch sheet-swatch-in-docked-bar',
                'aria-label': cellColorName(of, color),
                'aria-pressed': currentColor !== null && colorsEqual(currentColor, color),
                'data-has-fill': color.kind !== 'none' || undefined,
                style: fillPaintStyle(shownCellColor(of, color)),
                onClick: () =>
                  onChosen(
                    of === 'fillColor'
                      ? {
                          fillColor: color,
                        }
                      : {
                          textColor: color,
                        },
                  ),
              },
              JSON.stringify(color),
            ),
        ),
      of !== 'fontSize' &&
        of !== 'align' &&
        jsxs(Fragment, {
          children: [
            jsx(BarSeparator, {}),
            jsx(Button, {
              variant: 'ghost',
              'aria-label': DOCKED_ALL_CHOICES_LABELS[of](),
              onClick: onAllAsked,
              children: sheetMessages.allChoices(),
            }),
          ],
        }),
    ],
  });
}
export const DOCKED_BAR_CHOICES = ['align', 'fontSize', 'numberFormat', 'textColor', 'fillColor'];
export const isDockedBarChoice = (choice?: Dynamic) => choice !== null && DOCKED_BAR_CHOICES.includes(choice);
export const DOCKED_NUMBER_FORMATS = ['general', 'number', 'currency', 'percent', 'date', 'time'];
export const standardColorsOfShade = (shade?: Dynamic) =>
  STANDARD_HUE_COLORS.filter((color?: Dynamic) => color.kind === 'standard' && color.shade === shade);
export const DOCKED_COLORS = {
  textColor: [
    NO_COLOR,
    BLACK_COLOR,
    {
      kind: 'standard',
      hue: 'gray',
      shade: 600,
    },
    ...standardColorsOfShade(600),
  ],
  fillColor: [
    NO_COLOR,
    {
      kind: 'standard',
      hue: 'gray',
      shade: 100,
    },
    ...standardColorsOfShade(100),
  ],
};
export const DOCKED_TOOL_PROPS = {
  tooltipSide: 'top',
  whyNot: null,
};
export const DOCKED_ALL_CHOICES_LABELS = {
  numberFormat: sheetMessages.allNumberFormats,
  textColor: sheetMessages.allTextColors,
  fillColor: sheetMessages.allCellColors,
};
