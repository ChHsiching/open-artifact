import { Surface } from '../kit/surface.tsx';
import { Skeleton } from '../kit/skeleton.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx, Fragment, jsxs } from 'react/jsx-runtime';
export let SKETCH_WIDTH: Dynamic;
export let SKETCH_HEIGHT: Dynamic;
export let MARK_DELAY_BASE_S: Dynamic;
export let MARK_DELAY_SPAN_S: Dynamic;
export let SKETCH_PIE_OUTER_RADIUS: Dynamic;
export let SKETCH_PIE_INNER_RADIUS: Dynamic;
export function barSketch(nth?: Dynamic) {
  let heights = SKETCH_BAR_HEIGHTS[nth] ?? SKETCH_BAR_HEIGHTS[0];
  let [slotWidth, barWidth] = [SKETCH_WIDTH / heights.length, 34];
  return heights.map((height?: Dynamic, index?: Dynamic) => {
    let x = index * slotWidth + (slotWidth - barWidth) / 2;
    return {
      id: String(index),
      at: (x + barWidth / 2) / SKETCH_WIDTH,
      risesFromFoot: true,
      drawn: jsx('path', {
        d: sketchBarPath(x, barWidth, SKETCH_HEIGHT * (1 - height / 100), SKETCH_HEIGHT, true),
        fillOpacity: SKETCH_OPACITIES[0],
      }),
    };
  });
}
export function stackedBarSketch(nth?: Dynamic) {
  let heights = SKETCH_BAR_HEIGHTS[nth] ?? SKETCH_BAR_HEIGHTS[0];
  let [slotWidth, barWidth] = [SKETCH_WIDTH / SKETCH_STACK_COLUMNS.length, 44];
  return SKETCH_STACK_COLUMNS.map((column?: Dynamic, index?: Dynamic) => {
    let x = index * slotWidth + (slotWidth - barWidth) / 2;
    let columnHeight = (SKETCH_HEIGHT * (heights[column] ?? 0)) / 100;
    let shares = SKETCH_STACK_SHARES[(index + nth) % SKETCH_STACK_SHARES.length] ?? SKETCH_STACK_SHARES[0];
    let top: Dynamic = SKETCH_HEIGHT;
    return {
      id: String(index),
      at: (x + barWidth / 2) / SKETCH_WIDTH,
      risesFromFoot: true,
      drawn: jsx(Fragment, {
        children: shares.map((share?: Dynamic, part?: Dynamic) => {
          let [bottom, isTopPart] = [top, part === shares.length - 1];
          top -= columnHeight * share;
          return jsx(
            'path',
            {
              d: sketchBarPath(x, barWidth, top + (isTopPart ? 0 : SKETCH_STACK_GAP), bottom, isTopPart),
              fillOpacity: SKETCH_OPACITIES[part],
            },
            share,
          );
        }),
      }),
    };
  });
}
export function lineSketch(nth?: Dynamic) {
  return [SKETCH_BAR_HEIGHTS[nth] ?? SKETCH_BAR_HEIGHTS[0], SKETCH_SECOND_LINE[nth] ?? SKETCH_SECOND_LINE[0]].flatMap(
    (values?: Dynamic, lineIndex?: Dynamic) => {
      let points = values.map(
        (value?: Dynamic, index?: Dynamic) => ({
          x: 20 + ((SKETCH_WIDTH - 40) * index) / (values.length - 1),
          y: SKETCH_HEIGHT * (1 - value / 100),
        }),
      );
      return points.slice(1).map((point?: Dynamic, index?: Dynamic) => {
        let previous = points[index] ?? point;
        return {
          id: `${String(lineIndex)}-${String(index)}`,
          at: (previous.x + point.x) / 2 / SKETCH_WIDTH,
          risesFromFoot: false,
          drawn: jsx('path', {
            d: `M${previous.x} ${previous.y}L${point.x} ${point.y}`,
            className: 'sheet-line-of-chart-being-made',
            strokeOpacity: SKETCH_LINE_OPACITIES[lineIndex],
          }),
        };
      });
    },
  );
}
export function pieMarksOfChartBeingMade(nth?: Dynamic) {
  let slices = SKETCH_PIE_SLICES[nth] ?? SKETCH_PIE_SLICES[0];
  let [radius, ringWidth] = [(SKETCH_PIE_OUTER_RADIUS + SKETCH_PIE_INNER_RADIUS) / 2, SKETCH_PIE_OUTER_RADIUS - SKETCH_PIE_INNER_RADIUS];
  let sliceStart: Dynamic = 0;
  return slices.map((share?: Dynamic, index?: Dynamic) => {
    let startOfSlice = sliceStart;
    sliceStart += share;
    return {
      id: String(index),
      at: 0.5 + (radius * Math.sin(((startOfSlice + share / 2) / 100) * 2 * Math.PI)) / SKETCH_WIDTH,
      risesFromFoot: false,
      drawn: jsx('circle', {
        cx: SKETCH_WIDTH / 2,
        cy: SKETCH_HEIGHT / 2,
        r: radius,
        pathLength: 100,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: ringWidth,
        strokeDasharray: `${share - SKETCH_PIE_GAP} 100`,
        strokeDashoffset: -startOfSlice,
        strokeOpacity: SKETCH_OPACITIES[index],
        transform: `rotate(-90 ${SKETCH_WIDTH / 2} ${SKETCH_HEIGHT / 2})`,
      }),
    };
  });
}
export function timeOfEaseOutQuartProgress(progress?: Dynamic) {
  let [low, high]: Dynamic = [0, 1];
  for (let step: Dynamic = 0; step < 24; step += 1) {
    let mid = (low + high) / 2;
    if (3 * (1 - mid) * (1 - mid) * mid * 0.84 + 3 * (1 - mid) * mid * mid + mid * mid * mid < progress) low = mid;
    else high = mid;
  }
  let solvedTime = (low + high) / 2;
  return (
    3 * (1 - solvedTime) * (1 - solvedTime) * solvedTime * 0.165 +
    3 * (1 - solvedTime) * solvedTime * solvedTime * 0.44 +
    solvedTime * solvedTime * solvedTime
  );
}
export function ChartBeingMadeShape({ shape: { kind: kind, nth: nth }, stands: stands, hasFoot: hasFoot }: Dynamic) {
  return jsxs('svg', {
    viewBox: `0 0 ${String(SKETCH_WIDTH)} ${String(SKETCH_HEIGHT)}`,
    'data-stands': stands,
    ...(kind !== 'pie' && {
      preserveAspectRatio: 'none',
    }),
    children: [
      hasFoot &&
        kind !== 'pie' &&
        jsx('g', {
          style: changeReachesMarkStyle(0.5),
          children: chartBeingMadeFootLine,
        }),
      marksOfChartBeingMade(kind, nth).map(
        (mark?: Dynamic) =>
          jsx(
            'g',
            {
              'data-rises-from-foot': mark.risesFromFoot,
              style: changeReachesMarkStyle(mark.at),
              children: mark.drawn,
            },
            mark.id,
          ),
      ),
    ],
  });
}
export function ChartBeingMadePass({ kind: kind, pass: pass }: Dynamic) {
  let shapes = shapesOfChartKind(kind);
  let shapeOfPass = (passIndex?: Dynamic) =>
    shapes[passIndex % shapes.length] ?? {
      kind: 'bar',
      nth: 0,
    };
  let [previousShape, currentShape] = [pass === 0 ? null : shapeOfPass(pass - 1), shapeOfPass(pass)];
  let showsFootAlone = isChartShapeWithFoot(currentShape) && (previousShape === null || isChartShapeWithFoot(previousShape));
  return jsxs(Fragment, {
    children: [
      showsFootAlone &&
        jsx('svg', {
          viewBox: `0 0 ${String(SKETCH_WIDTH)} ${String(SKETCH_HEIGHT)}`,
          preserveAspectRatio: 'none',
          children: jsx('g', {
            children: chartBeingMadeFootLine,
          }),
        }),
      previousShape !== null &&
        jsx(
          ChartBeingMadeShape,
          {
            shape: previousShape,
            stands: previousShape.kind === currentShape.kind && isChartShapeWithFoot(currentShape) ? 'going' : 'fading',
            hasFoot: !showsFootAlone,
          },
          pass - 1,
        ),
      jsx(
        ChartBeingMadeShape,
        {
          shape: currentShape,
          stands: previousShape === null ? 'atRest' : 'coming',
          hasFoot: !showsFootAlone,
        },
        pass,
      ),
    ],
  });
}
export function ChartBeingMadeCard({
  drawn: { nth: nth, box: box, kind: kind, isAdded: isAdded, isInView: isInView },
  beingMade: beingMade,
  body: body,
  placesToldOf: placesToldOf,
  onGone: onGone,
}: Dynamic) {
  let [isLeaving, setIsLeaving] = React.useState(false);
  let [settledStands, setSettledStands] = React.useState(null);
  let isBeingMade = beingMade !== null;
  let { hasLandedElsewhere = false } = beingMade ?? {};
  let [placementId, setPlacementId] = React.useState(null);
  let newPlacementId = beingMade?.placementId ?? null;
  if (newPlacementId !== null && newPlacementId !== placementId) setPlacementId(newPlacementId);
  if (
    !isLeaving &&
    settledStands === null &&
    isChartBeingMadeDone({
      isBeingMade: isBeingMade,
      placementId: placementId,
      hasLandedElsewhere: hasLandedElsewhere,
      placesToldOf: placesToldOf,
    })
  )
    setIsLeaving(true);
  let stands = settledStands ?? (isLeaving ? 'leaving' : isAdded || placementId !== null ? 'untilChartIsDrawn' : 'whileAgentWrites');
  return jsx('div', {
    'aria-hidden': true,
    className: 'sheet-room-of-placed-view',
    style: {
      left: body.left + box.showsIn.left,
      top: body.top + box.showsIn.top,
      width: box.showsIn.width,
      height: box.showsIn.height,
    },
    children: jsx('div', {
      className: 'sheet-placed-view sheet-place-of-chart-being-made',
      'data-stands': stands,
      style: {
        left: box.left - box.showsIn.left,
        top: box.top - box.showsIn.top,
        width: box.width,
        height: box.height,
      },
      onAnimationStart: ({ target: target, currentTarget: currentTarget, animationName: animationName }: Dynamic) => {
        let standsOfAnimation = STANDS_OF_CHART_BEING_MADE_ANIMATION.get(animationName);
        if (target === currentTarget && standsOfAnimation !== undefined && standsOfAnimation === stands) setSettledStands(standsOfAnimation);
      },
      onAnimationEnd: ({ target: target, currentTarget: currentTarget }: Dynamic) => {
        if (target === currentTarget) onGone(nth);
      },
      children: jsx('div', {
        className: 'sheet-face-of-chart-being-made size-full',
        children: jsx(Surface, {
          elevation: 'panel',
          className: 'sheet-ground-of-chart size-full',
          children:
            isInView &&
            jsxs('div', {
              className: 'sheet-chart-on-its-way',
              'data-comes-at-once': true,
              children: [
                jsx(Skeleton, {
                  decorative: true,
                  width: '45%',
                  className: 'flex-none text-heading',
                }),
                jsx(ChartBeingMadeSketch, {
                  kind: kind,
                }),
              ],
            }),
        }),
      }),
    }),
  });
}
export function ChartBeingMade(props?: Dynamic) {
  let { beingMade: beingMade, onGone: onGone } = props;
  let [drawn, setDrawn] = React.useState(beingMade);
  let [goneNth, setGoneNth] = React.useState(null);
  if (beingMade !== null && beingMade !== drawn && beingMade.nth !== goneNth) setDrawn(beingMade);
  if (drawn === null) return null;
  return jsx(
    ChartBeingMadeCard,
    {
      ...props,
      beingMade: beingMade?.nth === drawn.nth ? beingMade : null,
      drawn: drawn,
      onGone: (nth?: Dynamic) => {
        setGoneNth(nth);
        setDrawn((current?: Dynamic) => (current?.nth === nth ? null : current));
        onGone(nth);
      },
    },
    drawn.nth,
  );
}
[SKETCH_WIDTH, SKETCH_HEIGHT] = [432, 188];
[MARK_DELAY_BASE_S, MARK_DELAY_SPAN_S] = [0.08, 1.863];
export const MARK_DELAY_EASE_SCALE = 0.85;
export const SKETCHES_PER_KIND = 8;
export const SKETCH_BAR_HEIGHTS = [
  [38, 52, 44, 66, 58, 80, 72, 92],
  [90, 72, 78, 58, 64, 44, 50, 32],
  [34, 54, 74, 92, 84, 66, 48, 38],
  [86, 66, 48, 36, 42, 58, 76, 90],
  [62, 40, 74, 50, 86, 58, 94, 68],
  [58, 88, 76, 62, 68, 48, 54, 40],
  [30, 42, 56, 64, 78, 90, 70, 82],
  [44, 70, 56, 38, 60, 88, 72, 50],
];
export const SKETCH_SECOND_LINE = [
  [18, 24, 34, 30, 44, 40, 56, 52],
  [50, 54, 42, 44, 32, 34, 20, 18],
  [20, 30, 40, 52, 48, 38, 30, 26],
  [48, 38, 30, 22, 20, 30, 40, 50],
  [26, 22, 36, 30, 46, 38, 54, 48],
  [30, 50, 44, 36, 38, 28, 30, 22],
  [16, 20, 28, 36, 40, 52, 44, 46],
  [24, 36, 30, 20, 32, 48, 40, 28],
];
export const SKETCH_PIE_SLICES = [
  [34, 24, 18, 14, 10],
  [44, 32, 24],
  [28, 24, 18, 14, 10, 6],
  [40, 26, 20, 14],
  [30, 22, 20, 16, 12],
  [38, 34, 28],
  [46, 20, 14, 12, 8],
  [32, 28, 22, 18],
];
export const SKETCH_STACK_SHARES = [
  [0.44, 0.33, 0.23],
  [0.52, 0.26, 0.22],
  [0.36, 0.38, 0.26],
];
export const SKETCH_STACK_COLUMNS = [0, 1, 2, 4, 5, 7];
export const SKETCH_OPACITIES = [0.53, 0.37, 0.24, 0.37, 0.24, 0.37];
export const SKETCH_LINE_OPACITIES = [0.8, 0.45];
export const SKETCH_FOOT_OPACITY = 0.45;
export const SKETCH_BAR_CORNER_RADIUS = 4;
export const SKETCH_STACK_GAP = 1.5;
export const SKETCH_PIE_GAP = 1.2;
[SKETCH_PIE_OUTER_RADIUS, SKETCH_PIE_INNER_RADIUS] = [SKETCH_HEIGHT / 2 - 4, 0.6 * (SKETCH_HEIGHT / 2 - 4)];
export const ANY_KIND_SKETCHES = [
  {
    kind: 'bar',
    nth: 0,
  },
  {
    kind: 'line',
    nth: 2,
  },
  {
    kind: 'pie',
    nth: 0,
  },
  {
    kind: 'stackedBar',
    nth: 4,
  },
  {
    kind: 'bar',
    nth: 7,
  },
  {
    kind: 'line',
    nth: 5,
  },
  {
    kind: 'pie',
    nth: 1,
  },
  {
    kind: 'stackedBar',
    nth: 6,
  },
];
export const sketchBarPath = (x?: Dynamic, width?: Dynamic, top?: Dynamic, bottom?: Dynamic, isRoundedTop?: Dynamic) =>
  isRoundedTop
    ? `M${x} ${bottom}V${top + SKETCH_BAR_CORNER_RADIUS}q0 ${-SKETCH_BAR_CORNER_RADIUS} ${SKETCH_BAR_CORNER_RADIUS} ${-SKETCH_BAR_CORNER_RADIUS}H${x + width - SKETCH_BAR_CORNER_RADIUS}q${SKETCH_BAR_CORNER_RADIUS} 0 ${SKETCH_BAR_CORNER_RADIUS} ${SKETCH_BAR_CORNER_RADIUS}V${bottom}z`
    : `M${x} ${bottom}V${top}H${x + width}V${bottom}z`;
export const marksOfChartBeingMade = (kind?: Dynamic, nth?: Dynamic) =>
  (
    ({
      bar: barSketch,
      stackedBar: stackedBarSketch,
      line: lineSketch,
      pie: pieMarksOfChartBeingMade,
      area: lineSketch,
      horizontalBar: barSketch,
      scatter: lineSketch,
    }) as Dynamic
  )[kind](nth);
export const secondsUntilChangeReaches = (at?: Dynamic) =>
  MARK_DELAY_BASE_S + MARK_DELAY_SPAN_S * timeOfEaseOutQuartProgress(at * MARK_DELAY_EASE_SCALE);
export const shapesOfChartKind = (kind?: Dynamic) =>
  kind === 'any'
    ? ANY_KIND_SKETCHES
    : Array.from<Dynamic, Dynamic>(
        {
          length: SKETCHES_PER_KIND,
        },
        (unused?: Dynamic, nth?: Dynamic) => ({
          kind: kind,
          nth: nth,
        }),
      );
export const changeReachesMarkStyle = (at?: Dynamic) => ({
  '--sheet-change-reaches-mark': `${secondsUntilChangeReaches(at).toFixed(3)}s`,
});
export const chartBeingMadeFootLine = jsx('path', {
  d: `M0 ${String(SKETCH_HEIGHT)}H${String(SKETCH_WIDTH)}`,
  className: 'sheet-foot-of-chart-being-made',
  strokeOpacity: SKETCH_FOOT_OPACITY,
});
export const isChartShapeWithFoot = ({ kind: kind }: Dynamic) => kind !== 'pie';
export const CHART_BEING_MADE_CLOCK_ANIMATION = 'sheet-clock-of-chart-being-made';
export const ChartBeingMadeSketch = React.memo(function ({ kind: kind }: Dynamic) {
  let [pass, setPass] = React.useState(0);
  return jsx('div', {
    'aria-hidden': true,
    className: 'sheet-chart-being-made',
    onAnimationIteration: ({ target: target, currentTarget: currentTarget, animationName: animationName }: Dynamic) => {
      if (target === currentTarget && animationName === CHART_BEING_MADE_CLOCK_ANIMATION) setPass((count?: Dynamic) => count + 1);
    },
    children: jsx(ChartBeingMadePass, {
      kind: kind,
      pass: pass,
    }),
  });
});
export const isChartBeingMadeDone = (state?: Dynamic) =>
  !state.isBeingMade || state.hasLandedElsewhere || (state.placementId !== null && state.placesToldOf.has(state.placementId));
export const STANDS_OF_CHART_BEING_MADE_ANIMATION = new (Map as Dynamic)([
  ['sheet-chart-being-made-goes-unfinished', 'whileAgentWrites'],
  ['sheet-chart-being-made-goes-at-last', 'untilChartIsDrawn'],
]);
