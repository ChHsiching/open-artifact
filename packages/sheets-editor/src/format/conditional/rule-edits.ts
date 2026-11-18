import type { Dynamic } from '../../dynamic.ts';
import { testedColumnOf, firstColumnOfRule, findColumnStats, defaultConditionForColumn } from './conditions.ts';
import { NO_COLOR } from '../../model/colors.ts';
import { measureOfColumn } from '../../words/column-holds.ts';
export function rangesNarrowedToColumn({ ranges: [firstRange, ...moreRanges] }: Dynamic, c?: Dynamic) {
  let toColumn = ({ topLeft: topLeft, bottomRight: bottomRight }: Dynamic) => ({
    topLeft: {
      r: topLeft.r,
      c: c,
    },
    bottomRight: {
      r: bottomRight.r,
      c: c,
    },
  });
  return [toColumn(firstRange), ...moreRanges.map(toColumn)];
}
export function updateRuleTest(effect?: Dynamic, testIndex?: Dynamic, update?: Dynamic) {
  let [firstTest, ...moreTests] = effect.allOf.map(
    (test?: Dynamic, index?: Dynamic) => (index === testIndex ? update(test) : test),
  );
  return firstTest === undefined
    ? effect
    : {
        ...effect,
        allOf: [firstTest, ...moreTests],
      };
}
export function removeRuleTest(effect?: Dynamic, testIndex?: Dynamic) {
  let [firstTest, ...moreTests] = effect.allOf.filter((test?: Dynamic, index?: Dynamic) => index !== testIndex);
  return firstTest === undefined
    ? effect
    : {
        ...effect,
        allOf: [firstTest, ...moreTests],
      };
}
export function testOfUnusedColumn(rule?: Dynamic, columnStats?: Dynamic) {
  let testedColumns = new (Set as Dynamic)(
    rule.effect.allOf.map((test?: Dynamic) => testedColumnOf(test, firstColumnOfRule(rule))),
  );
  return {
    kind: 'sameRowInColumn',
    c: (columnStats.columns.find(({ c: c }: Dynamic) => !testedColumns.has(c)) ?? columnStats.columns[0]).c,
  };
}
export function withRuleFont(format?: Dynamic, font?: Dynamic) {
  let { font: oldFont, ...rest } = format;
  return Object.keys(font).length === 0
    ? rest
    : {
        ...rest,
        font: font,
      };
}
export function withFormatColor(format?: Dynamic, target?: Dynamic, color?: Dynamic) {
  if (target === 'fillColor') {
    let { fillColor: oldFill, ...rest } = format;
    return color.kind === 'none'
      ? rest
      : {
          ...rest,
          fillColor: color,
        };
  }
  let { color: oldColor, ...otherFont } = format.font ?? {};
  return withRuleFont(
    format,
    color.kind === 'none'
      ? otherFont
      : {
          ...otherFont,
          color: color,
        },
  );
}
export function isFontStyleOn({ font: font }: Dynamic, style?: Dynamic) {
  let value = font?.[style];
  return value !== undefined && value !== false && value !== 'none';
}
export function toggleFontStyle(format?: Dynamic, style?: Dynamic) {
  let { [style]: oldValue, ...otherFont } = format.font ?? {};
  if (isFontStyleOn(format, style)) return withRuleFont(format, otherFont);
  return withRuleFont(format, {
    ...otherFont,
    [style]: style === 'underline' ? 'single' : true,
  });
}
export function withScalePointColor(scale?: Dynamic, point?: Dynamic, color?: Dynamic) {
  if (point === 'middle')
    return scale.middle === null
      ? scale
      : {
          ...scale,
          middle: {
            ...scale.middle,
            color: color,
          },
        };
  return {
    ...scale,
    [point]: {
      ...scale[point],
      color: color,
    },
  };
}
export function withScalePointAnchor(scale?: Dynamic, point?: Dynamic, anchorKind?: Dynamic, number?: Dynamic) {
  let anchor =
    anchorKind === 'number'
      ? {
          kind: 'number',
          number: number,
        }
      : {
          kind: 'percentile',
          percentile: point === 'lowest' ? 0 : point === 'highest' ? 100 : MIDPOINT_PERCENTILE,
        };
  switch (point) {
    case 'lowest':
      return {
        ...scale,
        lowest: {
          ...scale.lowest,
          anchor:
            anchorKind === 'end'
              ? {
                  kind: 'smallestNumber',
                }
              : anchor,
        },
      };
    case 'highest':
      return {
        ...scale,
        highest: {
          ...scale.highest,
          anchor:
            anchorKind === 'end'
              ? {
                  kind: 'largestNumber',
                }
              : anchor,
        },
      };
    case 'middle':
      return scale.middle === null || anchorKind === 'end'
        ? scale
        : {
            ...scale,
            middle: {
              ...scale.middle,
              anchor: anchor,
            },
          };
  }
}
export function orderScaleAnchors(scale?: Dynamic) {
  let anchors = [scale.lowest.anchor, scale.middle?.anchor, scale.highest.anchor];
  let numbers = sortedNumbers(anchors.flatMap((anchor?: Dynamic) => (anchor?.kind === 'number' ? [anchor.number] : [])));
  let percentiles = sortedNumbers(
    anchors.flatMap((anchor?: Dynamic) => (anchor?.kind === 'percentile' ? [anchor.percentile] : [])),
  );
  if (hasRepeatedNeighbor(numbers) || hasRepeatedNeighbor(percentiles)) return null;
  let orderedAnchor = (anchor?: Dynamic, earlierAnchors?: Dynamic) => {
    let rank = earlierAnchors.filter((earlier?: Dynamic) => earlier?.kind === anchor.kind).length;
    if (anchor.kind === 'number')
      return {
        kind: 'number',
        number: numbers[rank] ?? anchor.number,
      };
    if (anchor.kind === 'percentile')
      return {
        kind: 'percentile',
        percentile: percentiles[rank] ?? anchor.percentile,
      };
    return anchor;
  };
  let { lowest: lowest, middle: middle, highest: highest } = scale;
  return {
    ...scale,
    lowest: {
      ...lowest,
      anchor: orderedAnchor(lowest.anchor, []),
    },
    middle:
      middle === null
        ? null
        : {
            ...middle,
            anchor: orderedAnchor(middle.anchor, [lowest.anchor]),
          },
    highest: {
      ...highest,
      anchor: orderedAnchor(highest.anchor, [lowest.anchor, middle?.anchor]),
    },
  };
}
export function columnForColorScale(rule?: Dynamic, columnStats?: Dynamic) {
  let c = testedColumnOfRule(rule);
  let column = findColumnStats(columnStats, c);
  return column !== null && isScaleColumn(column) ? c : (columnStats.columns.find(isScaleColumn)?.c ?? c);
}
export function ruleWithEffectKind(rule?: Dynamic, effectKind?: Dynamic, columnStats?: Dynamic) {
  if (rule.effect.kind === effectKind) return null;
  let [{ topLeft: topLeft, bottomRight: bottomRight }, ...moreRanges] = rule.ranges;
  let isOneRowRange = moreRanges.length === 0 && topLeft.r === bottomRight.r && topLeft.c !== bottomRight.c;
  if (effectKind === 'colorScale')
    return {
      ranges: isOneRowRange ? rule.ranges : rangesNarrowedToColumn(rule, columnForColorScale(rule, columnStats)),
      effect: DEFAULT_COLOR_SCALE,
    };
  let column = findColumnStats(columnStats, firstColumnOfRule(rule)) ?? columnStats.columns[0];
  return {
    ranges: isOneRowRange ? rule.ranges : rangesNarrowedToColumn(rule, column.c),
    effect: {
      kind: effectKind,
      allOf: [
        {
          tested: {
            kind: 'theCellItself',
          },
          condition: defaultConditionForColumn(column),
        },
      ],
      format: tintFormatOf('yellow'),
    },
  };
}
export const NEW_TEST_INDEX = -1;
export const withAddedTest = (effect?: Dynamic, test?: Dynamic) => ({
  ...effect,
  allOf: [...effect.allOf, test],
});
export const standardColorOf = (hue?: Dynamic, shade?: Dynamic) => ({
  kind: 'standard',
  hue: hue,
  shade: shade,
});
export const tintFormatOf = (hue?: Dynamic) => ({
  fillColor: standardColorOf(hue, 100),
  font: {
    color: standardColorOf(hue, 800),
  },
});
export const RULE_FORMAT_PRESETS = [
  {
    key: 'red',
    format: tintFormatOf('red'),
  },
  {
    key: 'yellow',
    format: tintFormatOf('yellow'),
  },
  {
    key: 'green',
    format: tintFormatOf('green'),
  },
  {
    key: 'blue',
    format: tintFormatOf('blue'),
  },
  {
    key: 'grayStruckThrough',
    format: {
      font: {
        color: standardColorOf('gray', 600),
        strikethrough: true,
      },
    },
  },
  {
    key: 'bold',
    format: {
      font: {
        bold: true,
      },
    },
  },
];
export const defaultRuleForRanges = (ranges?: Dynamic) => ({
  ranges: ranges,
  effect: {
    kind: 'formatWhere',
    allOf: [
      {
        tested: {
          kind: 'theCellItself',
        },
        condition: {
          kind: 'isNotBlank',
        },
      },
    ],
    format: tintFormatOf('yellow'),
  },
});
export const ruleOfCellCondition = (ranges?: Dynamic, condition?: Dynamic, format?: Dynamic) => ({
  ranges: ranges,
  effect: {
    kind: 'formatWhere',
    allOf: [
      {
        tested: {
          kind: 'theCellItself',
        },
        condition: condition,
      },
    ],
    format: format,
  },
});
export const suggestedRulesFor = (ranges?: Dynamic) => ({
  scale: {
    ranges: ranges,
    effect: DEFAULT_COLOR_SCALE,
  },
  ofNegatives: ruleOfCellCondition(
    ranges,
    {
      kind: 'numberIs',
      comparison: 'lessThan',
      operand: {
        kind: 'number',
        number: 0,
      },
    },
    tintFormatOf('red'),
  ),
  ofTheLargest: ruleOfCellCondition(
    ranges,
    {
      kind: 'isAmongTheLargest',
      count: 1,
    },
    {
      fillColor: standardColorOf('blue', 100),
      font: {
        bold: true,
      },
    },
  ),
  ofAnyNumber: ruleOfCellCondition(
    ranges,
    {
      kind: 'numberIs',
      comparison: 'greaterThan',
      operand: {
        kind: 'number',
        number: -Number.MAX_VALUE,
      },
    },
    {
      font: {
        bold: true,
      },
    },
  ),
});
export const isFormatNonEmpty = (format?: Dynamic) => Object.keys(format).length > 0;
export const MIDPOINT_PERCENTILE = 50;
export const DEFAULT_COLOR_SCALE = {
  kind: 'colorScale',
  lowest: {
    anchor: {
      kind: 'smallestNumber',
    },
    color: NO_COLOR,
  },
  middle: null,
  highest: {
    anchor: {
      kind: 'largestNumber',
    },
    color: {
      kind: 'standard',
      hue: 'green',
      shade: 300,
    },
  },
};
export const DEFAULT_SCALE_MIDPOINT = {
  anchor: {
    kind: 'percentile',
    percentile: MIDPOINT_PERCENTILE,
  },
  color: {
    kind: 'standard',
    hue: 'yellow',
    shade: 300,
  },
};
export const withScaleMidpoint = (scale?: Dynamic, hasMiddle?: Dynamic) => ({
  ...scale,
  middle: hasMiddle ? (scale.middle ?? DEFAULT_SCALE_MIDPOINT) : null,
});
export const sortedNumbers = (numbers?: Dynamic) => numbers.toSorted((a?: Dynamic, b2?: Dynamic) => a - b2);
export const hasRepeatedNeighbor = (numbers?: Dynamic) =>
  numbers.some((number?: Dynamic, index?: Dynamic) => index > 0 && number === numbers[index - 1]);
export const isScaleColumn = (column?: Dynamic) => measureOfColumn(column) !== null;
export const testedColumnOfRule = (rule?: Dynamic) =>
  rule.effect.kind === 'formatWhere' ? testedColumnOf(rule.effect.allOf[0], firstColumnOfRule(rule)) : firstColumnOfRule(rule);
