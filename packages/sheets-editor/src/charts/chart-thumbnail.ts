import type { Dynamic } from '../dynamic.ts';
import { jsx } from 'react/jsx-runtime';
export function barThumbnailPaths(series?: Dynamic, isStacked?: Dynamic) {
  let columns = (series[0] ?? []).map(
    (input?: Dynamic, options?: Dynamic) => series.map((input2?: Dynamic) => input2[options] ?? 0),
  );
  let columnTotals = columns.map((input?: Dynamic) => (isStacked ? sumNumbers(input) : (Math.max as Dynamic)(...input)));
  let yScale = thumbnailYScale((Math.min as Dynamic)(0, ...columns.flat()), (Math.max as Dynamic)(0, ...columnTotals));
  let slotWidth = 17.5 / columns.length;
  let barWidth = (slotWidth - 1.5) / (isStacked ? 1 : series.length);
  return series.map(
    (row?: Dynamic, seriesIndex?: Dynamic) => ({
      color: chartCategoricalColor(seriesIndex),
      isLine: false,
      path: columns
        .map((column?: Dynamic, columnIndex?: Dynamic) => {
          let base = isStacked ? sumNumbers(column.slice(0, seriesIndex)) : 0;
          let [fromY, toY] = [yScale(base), yScale(base + (column[seriesIndex] ?? 0))];
          let barHeight = Math.max(Math.abs(fromY - toY), 0.5);
          return `M${2 + columnIndex * slotWidth + (isStacked ? 0 : seriesIndex * barWidth)} ${Math.min(fromY, toY)}h${barWidth}v${barHeight}h${-barWidth}z`;
        })
        .join(''),
    }),
  );
}
export function lineThumbnailPaths(series?: Dynamic) {
  let yScale = thumbnailYScale((Math.min as Dynamic)(...series.flat()), (Math.max as Dynamic)(...series.flat()));
  return series.map(
    (points?: Dynamic, seriesIndex?: Dynamic) => ({
      color: chartCategoricalColor(seriesIndex),
      isLine: true,
      path: points
        .map(
          (point?: Dynamic, pointIndex?: Dynamic) =>
            `${pointIndex === 0 ? 'M' : 'L'}${2 + (16 * pointIndex) / Math.max(points.length - 1, 1)} ${yScale(point)}`,
        )
        .join(''),
    }),
  );
}
export function pieThumbnailPaths(slices?: Dynamic) {
  let total = Math.max(sumNumbers(slices), Number.MIN_VALUE);
  let [center, radius] = [10, 8];
  let innerRadius = 0.6 * radius;
  let pointOnCircle = (fraction?: Dynamic, circleRadius?: Dynamic) =>
    `${center + circleRadius * Math.sin(2 * Math.PI * fraction)} ${center - circleRadius * Math.cos(2 * Math.PI * fraction)}`;
  return slices.map((slice?: Dynamic, sliceIndex?: Dynamic) => {
    let startFraction = sumNumbers(slices.slice(0, sliceIndex)) / total;
    let endFraction = sumNumbers(slices.slice(0, sliceIndex + 1)) / total;
    let largeArcFlag = endFraction - startFraction > 0.5 ? 1 : 0;
    return {
      color: chartCategoricalColor(sliceIndex),
      isLine: false,
      path: `M${pointOnCircle(startFraction, radius)}A${radius} ${radius} 0 ${largeArcFlag} 1 ${pointOnCircle(endFraction, radius)}L${pointOnCircle(endFraction, innerRadius)}A${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${pointOnCircle(startFraction, innerRadius)}z`,
    };
  });
}
/** Lines, each over a fill of the ground under it. */
export function areaThumbnailPaths(series?: Dynamic) {
  let yScale = thumbnailYScale((Math.min as Dynamic)(0, ...series.flat()), (Math.max as Dynamic)(...series.flat()));
  return series.flatMap((points?: Dynamic, seriesIndex?: Dynamic) => {
    let line = points
      .map(
        (point?: Dynamic, pointIndex?: Dynamic) =>
          `${pointIndex === 0 ? 'M' : 'L'}${2 + (16 * pointIndex) / Math.max(points.length - 1, 1)} ${yScale(point)}`,
      )
      .join('');
    let color = chartCategoricalColor(seriesIndex);
    return [
      { color: color, isLine: false, opacity: 0.3, path: `${line}L${points.length > 1 ? 18 : 2} ${yScale(0)}L2 ${yScale(0)}z` },
      { color: color, isLine: true, path: line },
    ];
  });
}
/** Bars laid from the left, a group of them for each row. */
export function horizontalBarThumbnailPaths(series?: Dynamic) {
  let rows = (series[0] ?? []).map((input?: Dynamic, rowIndex?: Dynamic) => series.map((values?: Dynamic) => values[rowIndex] ?? 0));
  let most = Math.max(Number.MIN_VALUE, ...rows.flat());
  let slotHeight = 16 / Math.max(rows.length, 1);
  let barHeight = (slotHeight - 1.5) / Math.max(series.length, 1);
  return series.map((values?: Dynamic, seriesIndex?: Dynamic) => ({
    color: chartCategoricalColor(seriesIndex),
    isLine: false,
    path: rows
      .map(
        (row?: Dynamic, rowIndex?: Dynamic) =>
          `M2 ${2 + rowIndex * slotHeight + seriesIndex * barHeight}h${Math.max((16 * Math.max(0, row[seriesIndex] ?? 0)) / most, 0.5)}v${barHeight}h${-Math.max((16 * Math.max(0, row[seriesIndex] ?? 0)) / most, 0.5)}z`,
      )
      .join(''),
  }));
}
/** Dots: the first series says how far along each lies, each other series how high. */
export function scatterThumbnailPaths(series?: Dynamic) {
  let [across = [], ...others] = series;
  let xScale = (value?: Dynamic) =>
    2 + (16 * (value - Math.min(...across))) / Math.max(Math.max(...across) - Math.min(...across), Number.MIN_VALUE);
  let yScale = thumbnailYScale((Math.min as Dynamic)(...others.flat()), (Math.max as Dynamic)(...others.flat()));
  let dot = (x?: Dynamic, y?: Dynamic) => `M${x - 1.4} ${y}a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0`;
  return others.map((values?: Dynamic, seriesIndex?: Dynamic) => ({
    color: chartCategoricalColor(seriesIndex),
    isLine: false,
    path: values.map((value?: Dynamic, index?: Dynamic) => dot(xScale(across[index] ?? 0), yScale(value))).join(''),
  }));
}
export function chartThumbnailPaths({ kind: kind, series: series }: Dynamic) {
  if (kind === 'line') return lineThumbnailPaths(series);
  if (kind === 'area') return areaThumbnailPaths(series);
  if (kind === 'pie') return pieThumbnailPaths(series[0] ?? []);
  if (kind === 'horizontalBar') return horizontalBarThumbnailPaths(series);
  if (kind === 'scatter') return scatterThumbnailPaths(series);
  return barThumbnailPaths(series, kind === 'stackedBar');
}
export function ChartThumbnail({ chart: chart, size: size, isOutOfUse: isOutOfUse }: Dynamic) {
  return jsx('svg', {
    viewBox: '0 0 20 20',
    width: size,
    height: size,
    'aria-hidden': true,
    className: isOutOfUse ? 'flex-none grayscale' : 'flex-none',
    children: chartThumbnailPaths(chart).map(
      ({ color: color, path: path, isLine: isLine, opacity: opacity }: Dynamic, index?: Dynamic) =>
        isLine
          ? jsx(
              'path',
              {
                d: path,
                fill: 'none',
                stroke: color,
                strokeWidth: 1.5,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
              },
              `${color}-${String(index)}`,
            )
          : jsx(
              'path',
              {
                d: path,
                fill: color,
                ...(opacity !== undefined && {
                  fillOpacity: opacity,
                }),
              },
              `${color}-${String(index)}`,
            ),
    ),
  });
}
export const chartCategoricalColor = (seriesIndex?: Dynamic) => `var(--ui-chart-categorical-${seriesIndex + 1})`;
export const sumNumbers = (input?: Dynamic) => input.reduce((total?: Dynamic, value?: Dynamic) => total + value, 0);
export const thumbnailYScale =
  (min?: Dynamic, max?: Dynamic) =>
  (value?: Dynamic) =>
    2 + 16 * (1 - (max === min ? 0 : (value - min) / (max - min)));
export const chartThumbnailIcon = (chart?: Dynamic, isOutOfUse?: Dynamic) =>
  function (size?: Dynamic) {
    return jsx(ChartThumbnail, {
      chart: chart,
      size: size,
      isOutOfUse: isOutOfUse,
    });
  };
