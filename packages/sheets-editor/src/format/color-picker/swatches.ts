import { Tooltip, TooltipGroup } from '../../kit/tooltip.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { NO_COLOR, GRAYSCALE_COLORS, STANDARD_HUE_COLORS, colorsEqual } from '../../model/colors.ts';
import { swallowRestOfPress } from '../../ui/press-swallow.ts';
import { cellColorName } from '../../i18n/format-labels.ts';
import { jsx, jsxs } from 'react/jsx-runtime';
import { fillPaintStyle } from '../../grid/cell-drawing.ts';
import { shownCellColor } from '../cell-colors.ts';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
export function elementStartCorner(element?: Dynamic) {
  let bounds = element.getBoundingClientRect();
  return [getComputedStyle(element).direction === 'rtl' ? bounds.right : bounds.left, bounds.top];
}
export function nearestElementInDirection(from: Dynamic, candidates: Dynamic, [stepX, stepY]: Dynamic) {
  let [fromX, fromY] = elementStartCorner(from);
  let nearest: Dynamic = null;
  for (let candidate of candidates as Dynamic) {
    let [x, y] = elementStartCorner(candidate);
    let along = (x - fromX) * stepX + (y - fromY) * stepY;
    let across = Math.abs((x - fromX) * stepY) + Math.abs((y - fromY) * stepX);
    if (along < 1 || (stepY === 0 && across >= 1)) continue;
    let distance = along * 1000 + across;
    if (nearest === null || distance < nearest.distance)
      nearest = {
        element: candidate,
        distance: distance,
      };
  }
  return nearest?.element ?? null;
}
export function moveFocusAmongSwatches(event?: Dynamic) {
  let step = ARROW_KEY_FOCUS_STEPS.get(event.key);
  if (step === undefined || (event.ctrlKey && event.altKey)) return;
  event.preventDefault();
  event.stopPropagation();
  let swatch = event.currentTarget;
  let otherSwatches = [...(swatch.closest(`.${SWATCHES_CLASS_NAME}`)?.querySelectorAll('button') ?? [])].filter(
    (input?: Dynamic) => input !== swatch,
  );
  nearestElementInDirection(swatch, otherSwatches, step)?.focus({
    preventScroll: true,
  });
}
export function ColorSwatches(props?: Dynamic) {
  let { property: property, current: current, colorsInSheet: colorsInSheet, onChosen: onChosen } = props;
  let [focusedKey, setFocusedKey] = React.useState(swatchColorKey(current ?? NO_COLOR));
  let colors = [NO_COLOR, ...GRAYSCALE_COLORS, ...STANDARD_HUE_COLORS, ...colorsInSheet];
  let tabStopKey = swatchColorKey(
    colors.find((input?: Dynamic) => swatchColorKey(input) === focusedKey) ??
      colors.find((input?: Dynamic) => current !== null && colorsEqual(current, input)) ??
      NO_COLOR,
  );
  let swatchProps = (input?: Dynamic) => ({
    type: 'button',
    'aria-pressed': current !== null && colorsEqual(current, input),
    tabIndex: swatchColorKey(input) === tabStopKey ? 0 : -1,
    onFocus: () => setFocusedKey(swatchColorKey(input)),
    onKeyDown: moveFocusAmongSwatches,
    onClick: (input2?: Dynamic) => {
      swallowRestOfPress(input2);
      onChosen(input);
    },
  });
  let renderSwatches = (input?: Dynamic) =>
    input.map((input2?: Dynamic) => {
      let value = cellColorName(property, input2);
      return jsx(
        Tooltip,
        {
          content: value,
          side: 'top',
          hoverable: false,
          children: jsx('button', {
            ...swatchProps(input2),
            'aria-label': value,
            className: 'sheet-swatch',
            'data-has-fill': true,
            style: fillPaintStyle(shownCellColor(property, input2)),
          }),
        },
        swatchColorKey(input2),
      );
    });
  return jsx(TooltipGroup, {
    children: jsxs('div', {
      className: SWATCHES_CLASS_NAME,
      children: [
        jsxs('button', {
          ...swatchProps(NO_COLOR),
          className: 'sheet-no-color',
          children: [
            jsx('span', {
              'aria-hidden': true,
              className: 'sheet-swatch',
            }),
            cellColorName(property, NO_COLOR),
          ],
        }),
        jsx('fieldset', {
          'aria-label': sheetMessages.neutrals(),
          className: 'sheet-swatch-grid',
          children: renderSwatches(GRAYSCALE_COLORS),
        }),
        jsx('fieldset', {
          'aria-label': sheetMessages.colors(),
          className: 'sheet-swatch-grid',
          children: renderSwatches(STANDARD_HUE_COLORS),
        }),
        colorsInSheet.length > 0 &&
          jsxs('fieldset', {
            className: 'sheet-swatch-grid',
            children: [
              jsx('legend', {
                className: 'sheet-swatch-caption',
                children: sheetMessages.colorsInThisSheet(),
              }),
              renderSwatches(colorsInSheet),
            ],
          }),
      ],
    }),
  });
}
export const swatchColorKey = (color?: Dynamic) => JSON.stringify(color);
export const ARROW_KEY_FOCUS_STEPS = new (Map as Dynamic)([
  ['ArrowLeft', [-1, 0]],
  ['ArrowRight', [1, 0]],
  ['ArrowUp', [0, -1]],
  ['ArrowDown', [0, 1]],
]);
export const SWATCHES_CLASS_NAME = 'sheet-swatches';
