import type { Dynamic } from '../dynamic.ts';
import { shownLineAtOrBefore, shownLineAtOrAfter } from '../model/line-sizes.ts';
import { colorKey, NO_COLOR } from '../model/colors.ts';
import { textColorsOnFill } from '../format/cell-colors.ts';
import { isInSpan } from './geometry.ts';
import { DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
export function strongerBorder(first?: Dynamic, second?: Dynamic) {
  if (first.kind === 'none') return second.kind === 'none' ? null : second;
  if (second.kind === 'none') return first;
  return borderStyleRank(second.style) > borderStyleRank(first.style) ? second : first;
}
export function borderOverhangBelow(
  { topRowIndex: topRowIndex, rowCount: rowCount, leftColumnIndex: leftColumnIndex }: Dynamic,
  layout?: Dynamic,
  bordersAt?: Dynamic,
) {
  let endRow = topRowIndex + rowCount;
  let lastRow = Math.max(topRowIndex, shownLineAtOrBefore(layout.rowEdges, endRow - 1));
  let nextRow = shownLineAtOrAfter(layout.rowEdges, endRow);
  let border = strongerBorder(
    bordersAt(lastRow, leftColumnIndex).bottom,
    nextRow < layout.rowCount
      ? bordersAt(nextRow, leftColumnIndex).top
      : {
          kind: 'none',
        },
  );
  return border === null ? 0 : BORDER_LOOKS[border.style].width - 1;
}
export function borderLineKey(line?: Dynamic) {
  let cached = BORDER_LINE_KEY_CACHE.get(line);
  if (cached !== undefined) return cached;
  let key = `${line.style} ${colorKey(line.color)}`;
  BORDER_LINE_KEY_CACHE.set(line, key);
  return key;
}
export function borderPaint({ color: color }: Dynamic) {
  let cached = BORDER_PAINT_CACHE.get(colorKey(color));
  if (cached !== undefined) return cached;
  let paint = textColorsOnFill(color, NO_COLOR);
  BORDER_PAINT_CACHE.set(colorKey(color), paint);
  return paint;
}
export function borderRunsAlongLine({ before: before, indexes: indexes, after: after }: Dynamic, lineAt?: Dynamic) {
  let runs: Dynamic = [];
  indexes.forEach((index?: Dynamic, position?: Dynamic) => {
    let line = lineAt(index);
    if (line === null) return;
    let next = indexes[position + 1] ?? after;
    let lastRun = runs.at(-1);
    if (lastRun?.afterLast === index && borderLineKey(lastRun.line) === borderLineKey(line) && BORDER_LOOKS[line.style].dashes === null)
      lastRun.afterLast = next;
    else
      runs.push({
        line: line,
        beforeFirst: indexes[position - 1] ?? before,
        first: index,
        afterLast: next,
      });
  });
  return runs;
}
export function buildBorderPaths(grid?: Dynamic) {
  let { rows: rows, columns: columns, formatAt: formatAt, mergedAreas: mergedAreas, leftOfColumn: leftOfColumn, topOfRow: topOfRow } = grid;
  let lineBetween = (first?: Dynamic, second?: Dynamic, firstSide?: Dynamic, secondSide?: Dynamic) => {
    let line = strongerBorder(
      formatAt(first)?.border[firstSide] ?? {
        kind: 'none',
      },
      formatAt(second)?.border[secondSide] ?? {
        kind: 'none',
      },
    );
    return line === null || isInsideOneMergedArea(mergedAreas, first, second) ? null : line;
  };
  let lineBetweenRows = (upperRow?: Dynamic, lowerRow?: Dynamic, columnIndex?: Dynamic) =>
    lineBetween(
      {
        rowIndex: upperRow,
        columnIndex: columnIndex,
      },
      {
        rowIndex: lowerRow,
        columnIndex: columnIndex,
      },
      'bottom',
      'top',
    );
  let lineBetweenColumns = (leftColumn?: Dynamic, rightColumn?: Dynamic, rowIndex?: Dynamic) =>
    lineBetween(
      {
        rowIndex: rowIndex,
        columnIndex: leftColumn,
      },
      {
        rowIndex: rowIndex,
        columnIndex: rightColumn,
      },
      'right',
      'left',
    );
  let pathsByKey = new (Map as Dynamic)();
  let addRun = (
    { line: line, first: first, afterLast: afterLast }: Dynamic,
    isHorizontal?: Dynamic,
    crossIndex?: Dynamic,
    crossingLines?: Dynamic,
  ) => {
    let { width: width, strokes: strokes } = BORDER_LOOKS[line.style];
    let [alongEdge, crossEdge] = isHorizontal ? [leftOfColumn, topOfRow] : [topOfRow, leftOfColumn];
    let crossingWidths = crossingLines.map((input?: Dynamic) => (input === null ? 0 : BORDER_LOOKS[input.style].width));
    let start = Math.max(alongEdge(first) - (Math.max as Dynamic)(...crossingWidths, 1), alongEdge(0));
    let end = alongEdge(afterLast);
    let middle = clampLineOffset(crossEdge(crossIndex), crossEdge(0), width) - width / 2;
    let entry = pathsByKey.get(borderLineKey(line)) ?? {
      line: line,
      strokes: [],
    };
    pathsByKey.set(borderLineKey(line), entry);
    for (let stroke of strokes as Dynamic) {
      let offset = middle + stroke;
      entry.strokes.push(isHorizontal ? `M${start} ${offset}H${end}` : `M${offset} ${start}V${end}`);
    }
  };
  for (let [previousIndex, lineIndex] of neighbourIndexPairs(rows) as Dynamic) {
    let runs = borderRunsAlongLine(columns, (input?: Dynamic) => lineBetweenRows(previousIndex, lineIndex, input));
    for (let run of runs as Dynamic)
      addRun(
        run,
        true,
        lineIndex,
        [previousIndex, lineIndex].map((input?: Dynamic) => lineBetweenColumns(run.beforeFirst, run.first, input)),
      );
  }
  for (let [previousIndex, lineIndex] of neighbourIndexPairs(columns) as Dynamic) {
    let runs = borderRunsAlongLine(rows, (input?: Dynamic) => lineBetweenColumns(previousIndex, lineIndex, input));
    for (let run of runs as Dynamic)
      addRun(
        run,
        false,
        lineIndex,
        [previousIndex, lineIndex].map((input?: Dynamic) => lineBetweenRows(run.beforeFirst, run.first, input)),
      );
  }
  let paths = [...pathsByKey];
  paths.sort(([, input]: Dynamic, [, options]: Dynamic) => borderStyleRank(input.line.style) - borderStyleRank(options.line.style));
  return paths.map(
    ([key, { line: line, strokes: strokes }]: Dynamic) => ({
      key: key,
      path: strokes.join(''),
      strokeWidth: BORDER_LOOKS[line.style].strokeWidth,
      dashes: BORDER_LOOKS[line.style].dashes,
      paint: borderPaint(line),
    }),
  );
}
export function summarizeAreaBorders(lines?: Dynamic, isFromSample?: Dynamic) {
  if (isFromSample)
    return [...OUTER_BORDER_SIDES, ...INNER_BORDER_SIDES].some((input?: Dynamic) => lines[input] === 'all' || lines[input] === 'part')
      ? 'some'
      : 'unsure';
  let allAre = (sides?: Dynamic, state?: Dynamic) =>
    sides.every((input?: Dynamic) => lines[input] === null || lines[input] === state);
  if (allAre(OUTER_BORDER_SIDES, 'none') && allAre(INNER_BORDER_SIDES, 'none')) return 'none';
  if (allAre(OUTER_BORDER_SIDES, 'all') && allAre(INNER_BORDER_SIDES, 'all')) return 'all';
  if (allAre(OUTER_BORDER_SIDES, 'all') && allAre(INNER_BORDER_SIDES, 'none')) return 'outer';
  if (allAre(OUTER_BORDER_SIDES, 'none') && allAre(INNER_BORDER_SIDES, 'all')) return 'inner';
  let [onlySide, ...otherSides] = [...OUTER_BORDER_SIDES, ...INNER_BORDER_SIDES].filter(
    (input?: Dynamic) => lines[input] !== 'none' && lines[input] !== null,
  );
  return onlySide !== undefined && otherSides.length === 0 && lines[onlySide] === 'all' ? onlySide : 'some';
}
export function sampleEvenly(items?: Dynamic, count?: Dynamic) {
  if (items.length <= count) return items;
  let sample: Dynamic = [];
  for (let index: Dynamic = 0; index < count; index += 1) {
    let item = items[Math.round((index * (items.length - 1)) / (count - 1))];
    if (item === undefined) throw Error('a list cannot be spread over fewer than two');
    sample.push(item);
  }
  return sample;
}
export function borderLineCandidates(start?: Dynamic, count?: Dynamic, bases?: Dynamic, offsets?: Dynamic) {
  let indexes = [
    ...new (Set as Dynamic)(
      [start, ...bases.flatMap((input?: Dynamic) => offsets.map((input2?: Dynamic) => input + input2))].filter(
        (input?: Dynamic) => isInSpan(input, start, count),
      ),
    ),
  ];
  indexes.sort((input?: Dynamic, options?: Dynamic) => input - options);
  return indexes;
}
export function readAreaBorders({
  area: area,
  formatAt: formatAt,
  mergedAreas: mergedAreas,
  bordersMayChangeBefore: bordersMayChangeBefore,
}: Dynamic) {
  let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount } = area;
  let isFromSample: Dynamic = false;
  let rowBreaks = [
    ...bordersMayChangeBefore.rows,
    ...mergedAreas.flatMap((input?: Dynamic) => [input.topRowIndex, input.topRowIndex + input.rowCount]),
  ];
  let columnBreaks = [
    ...bordersMayChangeBefore.columns,
    ...mergedAreas.flatMap((input?: Dynamic) => [input.leftColumnIndex, input.leftColumnIndex + input.columnCount]),
  ];
  let rowLines = borderLineCandidates(topRowIndex, rowCount, rowBreaks, [0]);
  let columnLines = borderLineCandidates(leftColumnIndex, columnCount, columnBreaks, [0]);
  let readLines = (isHorizontal?: Dynamic, lineIndexes?: Dynamic) => {
    let [beforeSide, afterSide] = isHorizontal ? ['bottom', 'top'] : ['right', 'left'];
    let crossIndexes = isHorizontal ? columnLines : rowLines;
    let sampledLines = sampleEvenly(
      lineIndexes,
      Math.max(Math.floor(MAX_BORDER_SAMPLES / crossIndexes.length), MIN_BORDER_SAMPLES_PER_LINE),
    );
    let sampledCross = sampleEvenly(crossIndexes, Math.floor(MAX_BORDER_SAMPLES / Math.max(sampledLines.length, 1)));
    let hasLine: Dynamic = false;
    let hasGap: Dynamic = false;
    for (let lineIndex of sampledLines as Dynamic)
      for (let crossIndex of sampledCross as Dynamic) {
        let cellAt = (index?: Dynamic) =>
          isHorizontal
            ? {
                rowIndex: index,
                columnIndex: crossIndex,
              }
            : {
                rowIndex: crossIndex,
                columnIndex: index,
              };
        if (isInsideOneMergedArea(mergedAreas, cellAt(lineIndex - 1), cellAt(lineIndex))) continue;
        if (
          strongerBorder(
            formatAt(cellAt(lineIndex - 1))?.border[beforeSide] ?? {
              kind: 'none',
            },
            formatAt(cellAt(lineIndex))?.border[afterSide] ?? {
              kind: 'none',
            },
          ) === null
        )
          hasGap = true;
        else hasLine = true;
        if (hasLine && hasGap) return 'part';
      }
    if (sampledLines.length < lineIndexes.length || sampledCross.length < crossIndexes.length) isFromSample = true;
    if (hasLine) return 'all';
    return hasGap ? 'none' : null;
  };
  let innerOffsets = [0, 1];
  return {
    lines: {
      top: readLines(true, [topRowIndex]),
      bottom: readLines(true, [topRowIndex + rowCount]),
      left: readLines(false, [leftColumnIndex]),
      right: readLines(false, [leftColumnIndex + columnCount]),
      horizontal: readLines(true, borderLineCandidates(topRowIndex + 1, rowCount - 1, rowBreaks, innerOffsets)),
      vertical: readLines(false, borderLineCandidates(leftColumnIndex + 1, columnCount - 1, columnBreaks, innerOffsets)),
    },
    isFromSample: isFromSample,
  };
}
export const BORDER_STYLE_ORDER = ['dotted', 'dashed', 'thin', 'medium', 'double', 'thick'];
export const borderStyleRank = (style?: Dynamic) => BORDER_STYLE_ORDER.indexOf(style);
export const solidBorderLook = (width?: Dynamic) => ({
  width: width,
  strokeWidth: width,
  strokes: [0],
  dashes: null,
});
export const BORDER_LOOKS = {
  thin: solidBorderLook(1),
  medium: solidBorderLook(2),
  thick: solidBorderLook(3),
  dashed: {
    ...solidBorderLook(1),
    dashes: '4 3',
  },
  dotted: {
    ...solidBorderLook(1),
    dashes: '1 2',
  },
  double: {
    width: 3,
    strokeWidth: 1,
    strokes: [-1, 1],
    dashes: null,
  },
};
export const borderStyleWidth = (style?: Dynamic) => BORDER_LOOKS[style].width;
export const MAX_BORDER_WIDTH = (Math.max as Dynamic)(...Object.values(BORDER_LOOKS).map(({ width: width }: Dynamic) => width));
export const bordersAtCellOf =
  (sheet?: Dynamic, sheetId?: Dynamic) =>
  (rowIndex?: Dynamic, columnIndex?: Dynamic) => {
    let cellId = sheet.cellIdAt(sheetId, rowIndex, columnIndex);
    return (cellId === null ? DEFAULT_CELL_FORMAT : sheet.formatOf(cellId)).border;
  };
export const isInsideOneMergedArea = (mergedAreas?: Dynamic, first?: Dynamic, second?: Dynamic) =>
  mergedAreas.some(
    (area?: Dynamic) =>
      [first, second].every(
        ({ rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) =>
          isInSpan(rowIndex, area.topRowIndex, area.rowCount) && isInSpan(columnIndex, area.leftColumnIndex, area.columnCount),
      ),
  );
export const BORDER_LINE_KEY_CACHE = new (WeakMap as Dynamic)();
export const BORDER_PAINT_CACHE = new (Map as Dynamic)();
export const neighbourIndexPairs = ({ before: before, indexes: indexes, after: after }: Dynamic) =>
  indexes.length === 0 ? [] : [...indexes, after].map((index?: Dynamic, position?: Dynamic) => [indexes[position - 1] ?? before, index]);
export const clampLineOffset = (value?: Dynamic, start?: Dynamic, width?: Dynamic) => Math.max(value, start + width);
export const NO_AREA_BORDERS = {
  top: 'none',
  bottom: 'none',
  left: 'none',
  right: 'none',
  horizontal: null,
  vertical: null,
};
export const OUTER_BORDER_SIDES = ['top', 'bottom', 'left', 'right'];
export const INNER_BORDER_SIDES = ['horizontal', 'vertical'];
export const MAX_BORDER_SAMPLES = 500;
export const MIN_BORDER_SAMPLES_PER_LINE = Math.floor(Math.sqrt(MAX_BORDER_SAMPLES));
