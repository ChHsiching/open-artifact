import type { Dynamic } from '../../dynamic.ts';
import { cellFontStyle, fillPaintStyle, textPaintStyle } from '../../grid/cell-drawing.ts';
import { DEFAULT_CELL_FORMAT } from '../../model/cell-format.ts';
import { cellColorPair, colorScaleCellColors, colorScaleStepAt, fillColorPair } from '../cell-colors.ts';
import { NO_COLOR } from '../../model/colors.ts';
import { jsx, Fragment, jsxs } from 'react/jsx-runtime';
import { CONDITIONAL_FORMATTING_WORDS } from '../../messages/conditional-format.ts';
export function ruleSampleFontStyle({ font: font }: Dynamic) {
  let {
    fontWeight: fontWeight,
    fontStyle: fontStyle,
    textDecorationLine: textDecorationLine,
    textDecorationStyle: textDecorationStyle,
  } = cellFontStyle({
    ...DEFAULT_CELL_FORMAT.font,
    ...font,
  });
  return {
    fontWeight: fontWeight,
    fontStyle: fontStyle,
    textDecorationLine: textDecorationLine,
    textDecorationStyle: textDecorationStyle,
  };
}
export function ruleFormatSampleProps(format?: Dynamic) {
  let { fill: fill, text: textPaint } = cellColorPair(format.fillColor ?? NO_COLOR, format.font?.color ?? NO_COLOR);
  return {
    'data-has-fill': fill !== null || undefined,
    'data-has-text-paint': textPaint !== null || undefined,
    style: {
      ...fillPaintStyle(fill),
      ...textPaintStyle(textPaint),
      ...ruleSampleFontStyle(format),
    },
  };
}
export function colorScaleStripes([firstColor = NO_COLOR, ...otherColors]: Dynamic, count?: Dynamic) {
  let colorStops = [firstColor, ...otherColors].map(
    (color?: Dynamic, index?: Dynamic) => ({
      at: index / otherColors.length,
      color: color,
    }),
  );
  let [
    firstStop = {
      at: 0,
      color: firstColor,
    },
    ...otherStops
  ] = colorStops;
  return fillsToStripes(
    Array.from<Dynamic, Dynamic>(
      {
        length: count,
      },
      (input?: Dynamic, stripeIndex?: Dynamic) =>
        colorScaleCellColors(colorScaleStepAt([firstStop, ...otherStops], stripeIndex / (count - 1)), NO_COLOR).fill,
    ),
  );
}
export function RuleSampleStripes({ stripes: stripes }: Dynamic) {
  return jsx(Fragment, {
    children: stripes.map(
      ({ place: place, fill: fill }: Dynamic) =>
        jsx(
          'span',
          {
            className: 'sheet-rule-sample-stripe',
            'data-has-fill': fill !== null || undefined,
            style: fillPaintStyle(fill),
          },
          place,
        ),
    ),
  });
}
export function RuleEffectSample({ does: does, isSwatch = false }: Dynamic) {
  if (does.kind === 'colorScale')
    return jsxs('span', {
      'aria-hidden': true,
      className: 'sheet-rule-sample',
      'data-is-swatch': isSwatch || undefined,
      children: [
        jsx(RuleSampleStripes, {
          stripes: colorScaleStripes(does.colors, isSwatch ? 18 : 30),
        }),
        !isSwatch &&
          jsx('span', {
            className: 'sheet-rule-sample-over-stripes',
            children: CONDITIONAL_FORMATTING_WORDS.sample(),
          }),
      ],
    });
  return jsx('span', {
    'aria-hidden': true,
    className: 'sheet-rule-sample',
    'data-is-swatch': isSwatch || undefined,
    ...ruleFormatSampleProps(does.format),
    children: isSwatch ? CONDITIONAL_FORMATTING_WORDS.sampleLetter() : CONDITIONAL_FORMATTING_WORDS.sample(),
  });
}
export function SeveralRulesSample({ rules: rules, isSwatch = false }: Dynamic) {
  let fills = rules.map(({ does: does }: Dynamic) => (does.kind === 'colorScale' ? does.colors[0] : does.format.fillColor));
  let [firstRule] = rules;
  if (firstRule !== undefined && fills.every((fill?: Dynamic) => fillColorPair(fill ?? NO_COLOR) === null))
    return jsx(RuleEffectSample, {
      does: firstRule.does,
      isSwatch: isSwatch,
    });
  return jsx('span', {
    'aria-hidden': true,
    className: 'sheet-rule-sample',
    'data-is-swatch': isSwatch || undefined,
    'data-is-striped': !isSwatch || undefined,
    children: jsx(RuleSampleStripes, {
      stripes: fillsToStripes(fills.map((input?: Dynamic) => fillColorPair(input ?? NO_COLOR))),
    }),
  });
}
export function RuleSample({ rules: rules, isSwatch = false }: Dynamic) {
  switch (rules.kind) {
    case 'one':
      return jsx(RuleEffectSample, {
        does: rules.rule.does,
        isSwatch: isSwatch,
      });
    case 'several':
      return jsx(RuleEffectSample, {
        does: rules.first.does,
        isSwatch: isSwatch,
      });
    case 'oneColorForEach':
      return jsx('span', {
        'aria-hidden': true,
        className: 'sheet-rule-sample',
        'data-is-swatch': isSwatch || undefined,
        children: jsx(RuleSampleStripes, {
          stripes: fillsToStripes(rules.fills.map(fillColorPair)),
        }),
      });
  }
}
export const fillsToStripes = (fills?: Dynamic) =>
  fills.map(
    (fill?: Dynamic, place?: Dynamic) => ({
      place: place,
      fill: fill,
    }),
  );
