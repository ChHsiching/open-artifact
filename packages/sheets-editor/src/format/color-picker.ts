import { Tabs } from '../kit/tabs.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { scrollDeltaToReveal } from '../links/link-hover-card.ts';
import { sampleNumberText } from '../i18n/format-labels.ts';
import { cellColorPair, fillColorPair, optionChipColors } from './cell-colors.ts';
import { GRAYSCALE_COLORS, colorsEqual, NO_COLOR } from '../model/colors.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { ColorSwatches } from './color-picker/swatches.ts';
import { CustomColorPicker } from './color-picker/custom-color.ts';
export function scrollFocusedIntoPopup(element?: Dynamic, popup?: Dynamic) {
  let scroller: Dynamic = popup === null ? null : element.parentElement;
  while (scroller !== null && scroller.scrollHeight <= scroller.clientHeight + 1) scroller = scroller === popup ? null : scroller.parentElement;
  if (scroller === null) return;
  let { top: top, bottom: bottom } = element.getBoundingClientRect();
  let scrollerBounds = scroller.getBoundingClientRect();
  let margin = Math.min(COLOR_FOCUS_SCROLL_MARGIN, (scrollerBounds.bottom - scrollerBounds.top - (bottom - top)) / 2);
  scroller.scrollTop += scrollDeltaToReveal(scrollerBounds, {
    top: top - margin,
    bottom: bottom + margin,
  });
}
export function SheetColorPicker(props?: Dynamic) {
  let {
    property: property,
    color: color,
    whatIsColored: whatIsColored,
    whatItShows: whatItShows,
    onChosen: onChosen,
    onDone: onDone,
  } = props;
  let { hexColorsInSheet: hexColorsInSheet, textOfActiveCell: textOfActiveCell } = whatItShows();
  let cellSample = (input?: Dynamic) => ({
    shape: 'cell',
    text: textOfActiveCell === '' ? sampleNumberText() : textOfActiveCell,
    paintsWith: (input2?: Dynamic) => {
      let [value, value2] = property === 'fillColor' ? [input2, input] : [input, input2];
      return cellColorPair(value, value2);
    },
  });
  let isStandard =
    color?.kind !== 'rgb' || GRAYSCALE_COLORS.some((input?: Dynamic) => colorsEqual(color, input)) || hexColorsInSheet.includes(color.hex);
  let [tab, setTab] = React.useState(isStandard ? 'standard' : 'custom');
  let isPointerFocusRef = React.useRef(false);
  return jsxs(Tabs.Root, {
    className: 'sheet-color-picker',
    value: tab,
    onValueChange: (input?: Dynamic) => setTab(input),
    onPointerDownCapture: () => {
      isPointerFocusRef.current = true;
    },
    onKeyDownCapture: () => {
      isPointerFocusRef.current = false;
    },
    onFocus: ({ target: target }: Dynamic) => {
      if (isPointerFocusRef.current || !target.matches(':focus-visible')) return;
      let value = target.closest('.sheet-color-square') ?? target;
      scrollFocusedIntoPopup(value, target.closest('[role="dialog"]'));
    },
    children: [
      jsxs(Tabs.List, {
        'aria-label': sheetMessages.kindsOfColor(),
        size: 'sm',
        children: [
          jsx(Tabs.Tab, {
            value: 'standard',
            children: sheetMessages.standardColors(),
          }),
          jsx(Tabs.Tab, {
            value: 'custom',
            children: sheetMessages.customColor(),
          }),
        ],
      }),
      jsx(Tabs.Panel, {
        value: 'standard',
        tabIndex: -1,
        children: jsx(ColorSwatches, {
          property: property,
          current: color,
          colorsInSheet: hexColorsInSheet.map(
            (input?: Dynamic) => ({
              kind: 'rgb',
              hex: input,
            }),
          ),
          onChosen: (input?: Dynamic) => {
            onChosen(input);
            onDone();
          },
        }),
      }),
      jsx(Tabs.Panel, {
        value: 'custom',
        tabIndex: -1,
        children: jsx(CustomColorPicker, {
          startsAt: (fillColorPair(color ?? NO_COLOR) ?? fillColorPair(DEFAULT_CUSTOM_COLOR))?.onLight ?? '#000000',
          sample:
            whatIsColored.kind === 'cells'
              ? cellSample(whatIsColored.otherColor ?? NO_COLOR)
              : {
                  shape: 'pill',
                  text: whatIsColored.label,
                  paintsWith: optionChipColors,
                },
          onChosen: onChosen,
        }),
      }),
    ],
  });
}
export const COLOR_POPUP_PADDING = 'md';
export const DEFAULT_CUSTOM_COLOR = {
  kind: 'standard',
  hue: 'blue',
  shade: 400,
};
export const COLOR_FOCUS_SCROLL_MARGIN = 32;
