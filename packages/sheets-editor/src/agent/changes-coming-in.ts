import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { CHANGE_HOLD_BASE_MS, CHANGE_HOLD_MAX_GROWTH_MS, CHANGE_HOLD_PER_CELL_MS, CHANGE_HOLD_TAIL_MS } from './changes-by-agent.ts';
import { ariaIndex } from '../grid/cell-drawing.ts';
import { NO_CELLS_AS_BEFORE } from '../grid/grid-drawing.ts';
import { LINES_SLIDE_ANIMATION_ID } from '../grid/lines-slide.ts';
import { DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
import { cellColorsOfFormat } from '../format/cell-colors.ts';
export function openingSteps(items?: Dynamic, options?: Dynamic) {
  return items.flatMap((input?: Dynamic, options2?: Dynamic) => {
    let value = items[options2 + 1];
    if (value === undefined) return [];
    let value2 = value.neededAfterMs - input.neededAfterMs;
    let value3 = Math.min(value.neededAfterMs, Math.max(CHANGE_HOLD_BASE_MS, STEP_DURATION_SHARE * value2));
    return [
      {
        opensBy: (options2 + 2 === items.length ? options : value.size) - input.size,
        beginsAfterMs: value.neededAfterMs - value3,
        takesMs: value3,
      },
    ];
  });
}
export function comingInPlan(mark?: Dynamic, rows?: Dynamic, cellsBefore?: Dynamic) {
  let { revision: value, box: value2, area: value3, grewFrom: value4 } = mark;
  let value5 = mark.ownBox ?? value2;
  let mapped = rows
    .filter((input?: Dynamic) => isInChangeSpan(input.rowNumber, value3.topRowIndex, value3.rowCount))
    .map(
      (input?: Dynamic) => ({
        row: input,
        cells: input.cells.filter((input2?: Dynamic) => isInChangeSpan(input2.columnNumber, value3.leftColumnIndex, value3.columnCount)),
      }),
    );
  let value6 = mapped[0];
  if (value6 === undefined || value6.cells.length === 0) return null;
  let value7 = mapped.reduce((input: Dynamic, { cells: cells }: Dynamic) => input + cells.length, 0);
  let value8 = Math.min(CHANGE_HOLD_MAX_GROWTH_MS, value7 * CHANGE_HOLD_PER_CELL_MS) / mapped.length;
  let value9 = value4 === null || (value4.left === value2.left && value4.top === value2.top);
  let value10 = value4 !== null && value9 && (value4.width < value2.width || value4.height < value2.height) ? CHANGE_HOLD_BASE_MS : 0;
  let value11 = (input?: Dynamic, options?: Dynamic) =>
    value10 + value8 * (input + clampToSize(options.left - value5.left, value5.width) / value5.width);
  return {
    stepsRight: !value9
      ? []
      : openingSteps(
          withGrownFrom(
            value4?.width,
            value6.cells.map(
              (input?: Dynamic) => ({
                size: clampToSize(input.left + input.width - value2.left, value2.width),
                neededAfterMs: value11(0, input),
              }),
            ),
          ),
          value2.width,
        ),
    stepsDown: !value9
      ? []
      : openingSteps(
          withGrownFrom(
            value4?.height,
            mapped.map(
              ({ row: row }: Dynamic, options?: Dynamic) => ({
                size: clampToSize(row.top + row.height - value2.top, value2.height),
                neededAfterMs: value10 + value8 * options,
              }),
            ),
          ),
          value2.height,
        ),
    cells: mapped.flatMap(
      ({ row: row, cells: cells }: Dynamic, options?: Dynamic) =>
        cells
          .filter((input?: Dynamic) => input.text !== '' && cellsBefore.get(cellKeyInRow(row, input))?.text !== input.text)
          .map(
            (input?: Dynamic) => ({
              rowNumber: row.rowNumber,
              columnNumber: input.columnNumber,
              comesAfterMs: value11(options, input),
            }),
          ),
    ),
    cellsAsBefore: mapped.flatMap(
      ({ row: row, cells: cells }: Dynamic, options?: Dynamic) =>
        cells.flatMap((input?: Dynamic) => {
          let value12 = cellsBefore.get(cellKeyInRow(row, input)) ?? blankDrawnCell(input);
          if (!(value12.text !== '' && value12.text !== input.text) && cellLooksKey(value12) === cellLooksKey(input)) return [];
          let value13 = value11(options, input);
          return [
            {
              keyOfMark: mark.key,
              revision: value,
              rowKey: row.key,
              cell: value12,
              goesAfterMs: value13,
            },
          ];
        }),
    ),
  };
}
export function scrollKeyOfRows({ rows: rows }: Dynamic) {
  let frozenBottom = (Math.max as Dynamic)(0, ...rows.flatMap((row?: Dynamic) => (row.isFrozen ? row.top + row.height : [])));
  let match = rows.find(({ isFrozen: isFrozen, top: top, height: height }: Dynamic) => !isFrozen && top + height > frozenBottom);
  let cells = match?.cells ?? [];
  let frozenRight = (Math.max as Dynamic)(
    0,
    ...cells.flatMap((cell?: Dynamic) => (cell.frozenBy === 'column' ? cell.left + cell.width : [])),
  );
  let value = cells.find(
    ({ left: left, width: width, frozenBy: frozenBy }: Dynamic) => frozenBy !== 'column' && left + width > frozenRight,
  );
  return [match?.rowNumber, match?.top, value?.columnNumber, value?.left].join();
}
export function movedByGlideAlone(drawn?: Dynamic, before?: Dynamic) {
  let [{ x: glideX, y: glideY }, { x: glideXBefore, y: glideYBefore }] = [drawn.yetToGlide ?? NO_GLIDE, before.yetToGlide ?? NO_GLIDE];
  let rowsBefore = new (Map as Dynamic)(before.rows.map((row?: Dynamic) => [row.key, row]));
  let row = drawn.rows.find(({ key: key, isFrozen: isFrozen }: Dynamic) => !isFrozen && rowsBefore.get(key)?.isFrozen === false);
  let rowBefore = row === undefined ? undefined : rowsBefore.get(row.key);
  if (row === undefined || rowBefore === undefined) return false;
  let cellsBefore = new (Map as Dynamic)(rowBefore.cells.map((cell?: Dynamic) => [cell.key, cell]));
  let cell = row.cells.find(
    ({ key: key, frozenBy: frozenBy }: Dynamic) =>
      frozenBy !== 'column' && cellsBefore.has(key) && cellsBefore.get(key)?.frozenBy !== 'column',
  );
  let cellBefore = cell === undefined ? undefined : cellsBefore.get(cell.key);
  return (
    cell !== undefined &&
    cellBefore !== undefined &&
    row.rowNumber === rowBefore.rowNumber &&
    cell.columnNumber === cellBefore.columnNumber &&
    isWithinHalfPixel(row.top - glideY, rowBefore.top - glideYBefore) &&
    isWithinHalfPixel(cell.left - glideX, cellBefore.left - glideXBefore)
  );
}
export function marksMovedOrResized(input?: Dynamic, options?: Dynamic) {
  let isGlideAlone = (input.yetToGlide !== null || options.yetToGlide !== null) && movedByGlideAlone(input, options);
  let value = !isGlideAlone && scrollKeyOfRows(input) !== scrollKeyOfRows(options);
  let [glide, glideBefore] = [input.yetToGlide ?? NO_GLIDE, options.yetToGlide ?? NO_GLIDE];
  let staysPut = (edge?: Dynamic, edgeBefore?: Dynamic, axis?: Dynamic, shownEdge?: Dynamic) =>
    isWithinHalfPixel(edge - glide[axis], edgeBefore - glideBefore[axis]) || (isWithinHalfPixel(edge, edgeBefore) && edge <= shownEdge);
  return input.marksOnChangesByAgent.filter(({ key: key, box: box }: Dynamic) => {
    let value2 = options.marksOnChangesByAgent.find((input2?: Dynamic) => input2.key === key)?.box;
    if (value2 === undefined) return false;
    if (!isGlideAlone) return value || value2.width !== box.width || value2.height !== box.height;
    let { showsIn: showsIn } = box;
    return (
      !staysPut(box.left + box.width, value2.left + value2.width, 'x', showsIn.left + showsIn.width) ||
      !staysPut(box.top + box.height, value2.top + value2.height, 'y', showsIn.top + showsIn.height)
    );
  });
}
export function animateComingIn(element?: Dynamic, options?: Dynamic, context?: Dynamic, value?: Dynamic, extra?: Dynamic) {
  let animatedParts = [
    ['paddingRight', context.stepsRight],
    ['paddingBottom', context.stepsDown],
  ];
  for (let value2 of roomsOfChangeMark(element, options) as Dynamic)
    for (let [value3, value4] of animatedParts as Dynamic)
      for (let { opensBy: value5, beginsAfterMs: value6, takesMs: value7 } of value4 as Dynamic)
        value2.animate(
          {
            [value3]: [`${value5}px`, '0px'],
          },
          {
            delay: value6,
            duration: value7,
            fill: 'backwards',
            easing: CHANGE_STEP_EASING,
            composite: 'add',
          },
        );
  let entries = new (Map as Dynamic)();
  for (let { rowNumber: value2, columnNumber: value3, comesAfterMs: value4 } of context.cells as Dynamic) {
    if (!entries.has(value2)) {
      let element2 = element.querySelector(`.sheet-rows > .sheet-row[aria-rowindex="${ariaIndex(value2)}"]`);
      entries.set(value2, [...(element2?.children ?? [])]);
    }
    let value5 = entries
      .get(value2)
      ?.find((element2?: Dynamic) => element2.getAttribute('aria-colindex') === `${ariaIndex(value3)}`);
    if (value5 === undefined || value.has(value5)) continue;
    value.add(value5);
    for (let value7 of (extra.get(value5) ?? []) as Dynamic) value7.finish();
    let value6 = value5.querySelectorAll('.sheet-text-that-runs-on .sheet-link-among-text');
    let mapped = [value5, ...value5.children, ...value6].map(
      (input?: Dynamic) =>
        input.animate(
          input === value5 || input.matches('.sheet-text-that-runs-on')
            ? [
                {
                  color: 'transparent',
                },
                {},
              ]
            : {
                opacity: [0, 1],
              },
          {
            delay: value4,
            duration: CHANGE_HOLD_TAIL_MS,
            fill: 'backwards',
            easing: 'ease-out',
          },
        ),
    );
    extra.set(value5, mapped);
  }
  for (let value2 of element.querySelectorAll(`.sheet-cell-as-before[data-mark="${options}"]`) as Dynamic)
    value2.animate(
      {
        visibility: ['visible', 'visible'],
      },
      Number(value2.dataset.goesAfterMs),
    );
}
export function cellsAsBeforeOf(input?: Dynamic, options?: Dynamic) {
  let marksOnChangesByAgent = input.marksOnChangesByAgent;
  let matches = marksOnChangesByAgent.filter((input2?: Dynamic) => input2.revision > options.drawn.latestRevisionByAgent);
  if (options.cellsAsBefore.length === 0 && matches.length === 0) return NO_CELLS_AS_BEFORE;
  let value = drawnCellsByKey(input.rows);
  let value2 =
    input.changesAskedFor === options.drawn.changesAskedFor
      ? options.cellsAsBefore.filter(
          (input2?: Dynamic) =>
            marksOnChangesByAgent.some(
              ({ revision: revision, joinedRevisions: joinedRevisions }: Dynamic) =>
                revision === input2.revision || joinedRevisions.includes(input2.revision),
            ) && value.has(cellAsBeforeKey(input2)),
        )
      : [];
  if (matches.length === 0) return value2.length === 0 ? NO_CELLS_AS_BEFORE : value2;
  let value3 = drawnCellsByKey(options.drawn.rows);
  let value4 = matches.flatMap((input2?: Dynamic) => comingInPlan(input2, input.rows, value3)?.cellsAsBefore ?? []);
  return [...new (Map as Dynamic)([...value2, ...value4].map((input2?: Dynamic) => [cellAsBeforeKey(input2), input2])).values()];
}
export function useCellsAsBefore(drawn?: Dynamic) {
  let [state, setState] = React.useState({
    drawn: drawn,
    cellsAsBefore: NO_CELLS_AS_BEFORE,
  });
  if (state.drawn !== drawn)
    setState({
      drawn: drawn,
      cellsAsBefore: cellsAsBeforeOf(drawn, state),
    });
  return state.cellsAsBefore;
}
export function useChangesComingIn(containerRef?: Dynamic, drawn?: Dynamic) {
  let previousDrawnRef = React.useRef(drawn);
  let runningByKey = React.useRef(new (Map as Dynamic)());
  React.useLayoutEffect(() => {
    let current = previousDrawnRef.current;
    previousDrawnRef.current = drawn;
    let current2 = containerRef.current;
    if (current2 === null) return;
    try {
      let value = drawn.changesAskedFor !== current.changesAskedFor;
      let value2 = (value ? drawn.marksOnChangesByAgent : marksMovedOrResized(drawn, current))
        .flatMap(({ key: key }: Dynamic) => roomsOfChangeMark(current2, key))
        .flatMap((input?: Dynamic) => input.getAnimations().filter(({ id: id }: Dynamic) => id !== LINES_SLIDE_ANIMATION_ID));
      for (let value4 of value2 as Dynamic) value4.finish();
      let matches = [...runningByKey.current].filter(
        ([, input]: Dynamic) => value || input.every((input2?: Dynamic) => input2.playState === 'finished'),
      );
      for (let [value4, value5] of matches as Dynamic) {
        for (let value6 of value5 as Dynamic) value6.finish();
        runningByKey.current.delete(value4);
      }
      let matches2 = drawn.marksOnChangesByAgent.filter((input?: Dynamic) => input.revision > current.latestRevisionByAgent);
      if (matches2.length === 0 || current2.ownerDocument.hidden) return;
      if (current2.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion:reduce)')?.matches !== false) return;
      let value3 = drawnCellsByKey(current.rows);
      let values = new (Set as Dynamic)();
      matches2.reverse();
      for (let value4 of matches2 as Dynamic) {
        let value5 = comingInPlan(value4, drawn.rows, value3);
        if (value5 !== null) animateComingIn(current2, value4.key, value5, values, runningByKey.current);
      }
    } catch (value: Dynamic) {
      Promise.reject(value);
    }
  });
}
export const STEP_DURATION_SHARE = 0.8;
export const CHANGE_STEP_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';
export const isInChangeSpan = (input?: Dynamic, options?: Dynamic, context?: Dynamic) =>
  input > options && input <= options + context;
export const clampToSize = (input?: Dynamic, options?: Dynamic) => Math.max(0, Math.min(input, options));
export const cellKeyInRow = (input?: Dynamic, options?: Dynamic) => `${input.key} ${options.key}`;
export const cellLooksKey = (input?: Dynamic) =>
  JSON.stringify([
    input.textColor,
    {
      ...input.format,
      border: null,
    },
    input.pill,
    input.opensDropdownList,
    input.opensPeopleList,
    input.checkbox,
    input.isPerson,
    input.avatarUrl,
    input.otherPeople,
    input.linkUrl,
    input.linkDrawnAs,
    input.mergedRowCount,
    input.mergedColumnCount,
  ]);
export const blankDrawnCell = (input?: Dynamic) => ({
  ...input,
  text: '',
  spokenText: null,
  textColor: null,
  isError: false,
  looksLikeError: false,
  isErrorMuted: false,
  format: DEFAULT_CELL_FORMAT,
  paints: cellColorsOfFormat(DEFAULT_CELL_FORMAT),
  pill: null,
  opensDropdownList: false,
  opensPeopleList: false,
  opensCalendar: false,
  checkbox: null,
  isPerson: false,
  avatarUrl: null,
  otherPeople: [],
  linkUrl: null,
  linkDrawnAs: null,
  linkCellKey: null,
  partsWithLinks: [],
  listLines: [],
});
export const drawnCellsByKey = (input?: Dynamic) =>
  new (Map as Dynamic)(
    input.flatMap((input2?: Dynamic) => input2.cells.map((input3?: Dynamic) => [cellKeyInRow(input2, input3), input3])),
  );
export const withGrownFrom = (input?: Dynamic, options?: Dynamic) =>
  input === undefined
    ? options
    : [
        {
          size: input,
          neededAfterMs: 0,
        },
        ...options.filter(({ size: size }: Dynamic) => size > input),
      ];
export const roomsOfChangeMark = (input?: Dynamic, options?: Dynamic) => [
  ...input.querySelectorAll(`.sheet-room-of-change-by-agent[data-mark="${options}"]`),
];
export const cellAsBeforeKey = (input?: Dynamic) => `${input.rowKey} ${input.cell.key}`;
export const isWithinHalfPixel = (value?: Dynamic, other?: Dynamic) => Math.abs(value - other) < 0.5;
export const NO_GLIDE = {
  x: 0,
  y: 0,
};
