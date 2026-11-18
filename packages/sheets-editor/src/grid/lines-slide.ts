import { useReducedMotion } from '../kit/platform.ts';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { PRESS_LIFT_REPEAT_MAX_MS } from '../ui/press-swallow.ts';
export let slideTiming: Dynamic;
export function bandClipPath(axis?: Dynamic, bodyStart?: Dynamic, band?: Dynamic, covered: Dynamic = 0) {
  let [from, to] = [`${bodyStart + band.start}px`, `calc(100% - ${bodyStart + band.start + band.size - covered}px)`];
  return axis === 'rows' ? `inset(${from} 0 ${to} 0)` : `inset(0 ${to} 0 ${from})`;
}
export function startOfHiddenRunAt(index?: Dynamic, outOfSight?: Dynamic) {
  let [low, high]: Dynamic = [0, outOfSight.length - 1];
  while (low < high) {
    let middle = Math.ceil((low + high) / 2);
    if ((outOfSight[middle]?.firstIndex ?? 0) <= index) low = middle;
    else high = middle - 1;
  }
  return outOfSight[low]?.firstIndex ?? index;
}
export function bandsOfSlide(lines?: Dynamic, moves?: Dynamic, isNow?: Dynamic) {
  let byOfKey = new Map(moves.map(({ key: key, by: by }: Dynamic) => [key, by]));
  let bands: Dynamic = [];
  for (let { key: key, start: start, size: size } of lines) {
    let [by, last] = [byOfKey.get(key) ?? (isNow ? 0 : null), bands.at(-1)];
    if (by === null) continue;
    if (last?.by === by && last.start + last.size === start)
      bands[bands.length - 1] = {
        ...last,
        size: last.size + size,
      };
    else
      bands.push({
        start: start,
        size: size,
        by: by,
        covered: 0,
      });
  }
  if (!isNow) return bands;
  return bands.map(
    ({ start: start, size: size, by: by }: Dynamic, index?: Dynamic) => ({
      start: start,
      size: size,
      by: by,
      covered: Math.max(0, by - (bands[index + 1]?.by ?? by)),
    }),
  );
}
export function spanOfLinesFrom(lines?: Dynamic, firstIndex?: Dynamic) {
  let [first, last] = [lines.find(({ index: index }: Dynamic) => index >= firstIndex), lines.at(-1)];
  return first === undefined || last === undefined ? null : [first.start, last.start + last.size];
}
export function slideDistances(lines?: Dynamic, frozenCount?: Dynamic, span?: Dynamic) {
  let distances = lines.map(({ start: start, elsewhere: elsewhere }: Dynamic) => elsewhere - start);
  if (span === null) return distances;
  let firstAfter = lines.findIndex(
    ({ index: index, elsewhere: elsewhere }: Dynamic) => index >= frozenCount && elsewhere >= span[1],
  );
  let lastBefore: Dynamic = -1;
  return (
    lines.forEach(({ index: index, size: size, elsewhere: elsewhere }: Dynamic, position?: Dynamic) => {
      if (index >= frozenCount && elsewhere + size <= span[0]) lastBefore = position;
    }),
    distances.map((distance?: Dynamic, position?: Dynamic) => {
      let [after, before] = [lines[firstAfter], lines[lastBefore]];
      if (after !== undefined && position >= firstAfter) return span[1] - after.start;
      return before !== undefined && position <= lastBefore && (lines[position]?.index ?? 0) >= frozenCount
        ? span[0] - before.start - before.size
        : distance;
    })
  );
}
export function startElsewhere({ index: index, start: start }: Dynamic, [linesThere, linesHere]: Dynamic = []) {
  let there = lineSpanOf(linesHere, index);
  if (there.size > 0) return there.start;
  return start + there.start - lineSpanOf(linesThere, startOfHiddenRunAt(index, linesHere.outOfSight)).start;
}
export function slideOfAxis(axis?: Dynamic, [gridBefore, gridNow]: Dynamic = [], [linesBefore, linesNow]: Dynamic = []) {
  let [drawnBefore, drawnNow] = [linesDrawnOf(gridBefore, axis), linesDrawnOf(gridNow, axis)];
  let frozenCount = Math.max(linesBefore.frozenCount, linesNow.frozenCount);
  let wasOutOfSight = (line?: Dynamic) => lineSpanOf(linesBefore, line.index).size === 0;
  let nowWithPlaceBefore = drawnNow.map(
    (line?: Dynamic) => ({
      ...line,
      elsewhere: startElsewhere(line, [linesNow, linesBefore]),
    }),
  );
  let distancesNow = slideDistances(nowWithPlaceBefore, frozenCount, spanOfLinesFrom(drawnBefore, frozenCount));
  let now = drawnNow.flatMap((line?: Dynamic, position?: Dynamic) => {
    let by = distancesNow[position] ?? 0;
    return by === 0 && !wasOutOfSight(line)
      ? []
      : [
          {
            key: line.key,
            by: by,
          },
        ];
  });
  let keysNow = new Set(drawnNow.map(({ key: key }: Dynamic) => key));
  let gone = drawnBefore.filter(({ key: key }: Dynamic) => !keysNow.has(key));
  let distancesGone = slideDistances(
    gone.map(
      (line?: Dynamic) => ({
        ...line,
        elsewhere: startElsewhere(line, [linesBefore, linesNow]),
      }),
    ),
    frozenCount,
    spanOfLinesFrom(drawnNow, frozenCount),
  );
  let asBefore = gone.map(
    ({ key: key, index: index }: Dynamic, position?: Dynamic) => ({
      key: key,
      by: distancesGone[position] ?? 0,
      isOutOfSight: lineSpanOf(linesNow, index).size === 0,
    }),
  );
  return now.length === 0 && asBefore.length === 0
    ? null
    : {
        axis: axis,
        now: now,
        asBefore: asBefore,
        bandsNow: bandsOfSlide(drawnNow, now, true),
        bandsAsBefore: bandsOfSlide(drawnBefore, asBefore, false),
      };
}
export function slideBetween(before?: Dynamic, now?: Dynamic) {
  let [linesBefore, linesNow] = [before.lines, now.lines];
  if (linesBefore.sheetId !== linesNow.sheetId) return null;
  let axis = ['rows', 'columns'].find(
    (lineAxis?: Dynamic) =>
      linesBefore[lineAxis].order !== null &&
      linesBefore[lineAxis].order === linesNow[lineAxis].order &&
      !areSameOutOfSight(linesBefore[lineAxis].outOfSight, linesNow[lineAxis].outOfSight),
  );
  return axis === undefined ? null : slideOfAxis(axis, [before.grid, now.grid], [linesBefore[axis], linesNow[axis]]);
}
export function mostCommonOf(values?: Dynamic) {
  let counts = new Map();
  for (let value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].reduce((most?: Dynamic, entry?: Dynamic) => (entry[1] > most[1] ? entry : most), [0, 0])[0];
}
export function haveLinesMoved(before?: Dynamic, now?: Dynamic) {
  let [linesBefore, linesNow] = [before.lines, now.lines];
  if (linesBefore.sheetId !== linesNow.sheetId) return true;
  if (
    ['rows', 'columns'].some(
      (axis?: Dynamic) =>
        linesBefore[axis].order !== linesNow[axis].order || !areSameOutOfSight(linesBefore[axis].outOfSight, linesNow[axis].outOfSight),
    )
  )
    return true;
  let [row, column] = [
    now.grid.rows.find(({ isFrozen: isFrozen }: Dynamic) => !isFrozen),
    now.grid.columnHeaders.find(({ isFrozen: isFrozen }: Dynamic) => !isFrozen),
  ];
  return (
    (row !== undefined && lineSpanOf(linesBefore.rows, row.rowNumber - 1).start !== row.top) ||
    (column !== undefined && lineSpanOf(linesBefore.columns, column.columnNumber - 1).start !== column.left)
  );
}
export function veilsOfSlide(grid?: Dynamic, { axis: axis, asBefore: asBefore }: Dynamic = {}) {
  let byOfKey = new Map(
    asBefore.flatMap(({ key: key, by: by, isOutOfSight: isOutOfSight }: Dynamic) => (isOutOfSight ? [[key, by]] : [])),
  );
  let veils: Dynamic = [];
  for (let { key: key, start: start, size: size } of linesDrawnOf(grid, axis)) {
    let [by, last] = [byOfKey.get(key), veils.at(-1)];
    if (by === undefined) continue;
    if (last?.by === by && last.start + last.size === start) last.size += size;
    else
      veils.push({
        start: start,
        size: size,
        by: by,
      });
  }
  return veils;
}
export function linesAsBeforeOf(grid?: Dynamic, slide?: Dynamic) {
  let byOfKey = new Map(slide.asBefore.map(({ key: key, by: by }: Dynamic) => [key, by]));
  let veils = veilsOfSlide(grid, slide);
  if (slide.axis === 'columns')
    return {
      grid: grid,
      slide: slide,
      veils: veils,
      groups: [
        {
          by: mostCommonOf([...byOfKey.values()]),
          rows: grid.rows.map(
            (row?: Dynamic) => ({
              ...row,
              cells: row.cells.filter(({ key: key }: Dynamic) => byOfKey.has(key)),
            }),
          ),
        },
      ],
      columnHeaders: grid.columnHeaders.filter(({ key: key }: Dynamic) => byOfKey.has(key)),
    };
  let groups: Dynamic = [];
  for (let row of grid.rows) {
    let [by, last] = [byOfKey.get(row.key), groups.at(-1)];
    if (by === undefined) continue;
    if (last?.by === by) last.rows.push(row);
    else
      groups.push({
        by: by,
        rows: [row],
      });
  }
  return {
    groups: groups,
    columnHeaders: [],
    veils: veils,
    grid: grid,
    slide: slide,
  };
}
export function paceAfterSlide(pace?: Dynamic, tookMs?: Dynamic, nowMs?: Dynamic) {
  if (!pace.isFirstPlayOver)
    return {
      ...pace,
      isFirstPlayOver: true,
    };
  if (tookMs <= SLIDE_SETTLE_MS)
    return {
      ...pace,
      inARow: 0,
      nextRestMs: FIRST_SLIDE_REST_MS,
    };
  if (pace.inARow === 0)
    return {
      ...pace,
      inARow: 1,
    };
  return {
    ...pace,
    inARow: 0,
    nextRestMs: Math.min(4 * pace.nextRestMs, LONGEST_SLIDE_REST_MS),
    restUntilMs: nowMs + pace.nextRestMs,
  };
}
export function createSlideTold() {
  let slide: Dynamic = null;
  let listeners = new Set();
  return {
    tell(slideNow?: Dynamic) {
      if (slideNow === slide) return;
      slide = slideNow;
      for (let listener of listeners) listener();
    },
    now: () => slide,
    subscribe(listener?: Dynamic) {
      return (listeners.add(listener), () => void listeners.delete(listener));
    },
  };
}
export function marksOfGrid(element?: Dynamic) {
  let marks = new Map();
  for (let mark of element.closest('.sheet-with-group-margins')?.querySelectorAll(MARKS_THAT_SLIDE) ?? [])
    if ((mark instanceof HTMLElement || mark instanceof SVGElement) && mark.closest(MARKS_INSIDE_LINES) === null)
      marks.set(mark, [
        Number.parseFloat(mark.style.top),
        Number.parseFloat(mark.style.left),
        Number.parseFloat(mark.style.height),
        Number.parseFloat(mark.style.width),
      ]);
  return marks;
}
export function marksMovedBy(slide?: Dynamic, [marksBefore, marksNow]: Dynamic = [], parent?: Dynamic, body?: Dynamic) {
  let [place, bodyStart] = slide.axis === 'rows' ? [0, body.top] : [1, body.left];
  return [...marksNow].flatMap(([mark, placeNow]: Dynamic) => {
    let by =
      mark.parentElement === parent
        ? slideByAt(slide, placeNow[place] - bodyStart + 2)
        : (marksBefore.get(mark)?.[place] ?? placeNow[place]) - placeNow[place];
    let scale = mark instanceof HTMLElement ? Number.parseFloat(mark.style.scale) : Number.NaN;
    return by === 0 || Number.isNaN(by) ? [] : [[mark, Number.isNaN(scale) ? by : by / scale]];
  });
}
export function filterOutlinesResized({ axis: axis }: Dynamic, [marksBefore, marksNow]: Dynamic = []) {
  let place = axis === 'rows' ? 2 : 3;
  return [...marksNow].flatMap(
    ([mark, placeNow]: Dynamic) =>
      mark.matches(OWN_FILTER_OUTLINE_SELECTOR) && marksBefore.get(mark)?.[place] !== placeNow[place] ? [mark] : [],
  );
}
export function slideTimingOf(element?: Dynamic) {
  return (slideTiming ??= readSlideTiming(element));
}
export function readSlideTiming(element?: Dynamic) {
  let style = (element.ownerDocument.defaultView ?? window).getComputedStyle(element);
  let duration = style.getPropertyValue('--ui-dur-base').trim();
  let easing = style.getPropertyValue('--ui-ease-out').trim();
  let durationMs = Number.parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
  return {
    duration: Number.isNaN(durationMs) ? 200 : durationMs,
    easing: easing === '' ? 'ease-out' : easing,
  };
}
export function linesMovedBy({ axis: axis }: Dynamic, moves?: Dynamic, parent?: Dynamic, columnHeaders?: Dynamic) {
  let byOfKey = new Map(moves.map(({ key: key, by: by }: Dynamic) => [key, by]));
  if (axis === 'rows')
    return [...parent.querySelectorAll(':scope > [data-row]')].flatMap((row?: Dynamic) => {
      let by = byOfKey.get(row.getAttribute('data-row') ?? '');
      return by === undefined ? [] : [[row, by]];
    });
  let byOfColumn = new Map(
    columnHeaders.map(({ key: key, columnNumber: columnNumber }: Dynamic) => [String(columnNumber + 1), byOfKey.get(key) ?? 0]),
  );
  let rowBy = mostCommonOf([0, ...byOfColumn.values()]);
  let moved: Dynamic = [];
  for (let row of parent.querySelectorAll(':scope > [role="row"]')) {
    moved.push([row, rowBy]);
    for (let cell of row.children) moved.push([cell, (byOfColumn.get(cell.getAttribute('aria-colindex') ?? '') ?? 0) - rowBy]);
  }
  return moved;
}
export function nextSlideState(
  { now: before, drawnAgain: drawnAgain }: Dynamic,
  grid?: Dynamic,
  lines?: Dynamic,
  parent?: Dynamic,
  isReducedMotion?: Dynamic,
) {
  let now =
    lines === null
      ? null
      : {
          grid: grid,
          lines: lines,
        };
  let still = {
    grid: grid,
    before: before,
    now: now,
    slide: null,
    marksBefore: NO_MARKS,
    drawnAgain: drawnAgain,
  };
  if (before === null || now === null || parent === null || isReducedMotion) return still;
  let slide = slideBetween(before, now);
  let plannedAtMs = slide === null ? 0 : performance.now();
  if (slide === null || plannedAtMs < slidePaceByAxis[slide.axis].restUntilMs) return still;
  return {
    grid: grid,
    before: before,
    now: now,
    slide: slide,
    marksBefore: marksOfGrid(parent),
    drawnAgain: {
      slide: slide,
      from: before.grid,
      plannedAtMs: plannedAtMs,
    },
  };
}
export function useLinesSlide({ grid: grid, lines: lines, slideTold: { tell: tell, now: slideNow, subscribe: subscribe } }: Dynamic) {
  let [element, setElement] = React.useState(null);
  let parent = element?.parentElement ?? null;
  let win = element?.ownerDocument.defaultView ?? null;
  let [slideState, setSlideState] = React.useState(NO_SLIDE_STATE);
  let isReducedMotion = useReducedMotion();
  if (slideState.grid !== grid) setSlideState(nextSlideState(slideState, grid, lines, parent, isReducedMotion));
  let [slideEnded, setSlideEnded] = React.useState(null);
  let { drawnAgain: drawnAgain } = slideState;
  let asBefore = React.useMemo(
    () => (drawnAgain === null || drawnAgain.slide === slideEnded ? NO_LINES_AS_BEFORE : linesAsBeforeOf(drawnAgain.from, drawnAgain.slide)),
    [drawnAgain, slideEnded],
  );
  let animations = React.useRef({
    staying: [],
    going: [],
  });
  let slideOn = React.useRef(null);
  let slidePlayed = React.useRef(null);
  let pausedByPress = React.useRef(null);
  let endSlide = React.useCallback(() => {
    if (slideOn.current === null) return;
    setSlideEnded(slideOn.current);
    slideOn.current = null;
    pausedByPress.current = null;
    for (let animation of animations.current.staying) animation.cancel();
    for (let animation of animations.current.going) if (animation.playState === 'paused') animation.finish();
    animations.current = {
      staying: [],
      going: [],
    };
    tell(null);
  }, [tell]);
  let animateStaying = React.useCallback(
    (target?: Dynamic, keyframes?: Dynamic, options?: Dynamic) =>
      void animations.current.staying.push(
        target.animate(keyframes, {
          ...options,
          id: LINES_SLIDE_ANIMATION_ID,
        }),
      ),
    [],
  );
  React.useLayoutEffect(() => {
    let { before: before, now: now, slide: slide, marksBefore: marksBefore } = slideState;
    if (now === null || before === null || parent === null) return;
    if (slide === null) {
      if (haveLinesMoved(before, now)) endSlide();
      return;
    }
    endSlide();
    slideOn.current = slide;
    queueMicrotask(() => {
      if (slideOn.current !== slide) return;
      for (let [line, by] of linesMovedBy(slide, slide.now, parent, now.grid.columnHeaders)) {
        if (by === 0 && slide.axis === 'columns') continue;
        animateStaying(
          line,
          [
            {
              transform: translateAlong(slide.axis, by),
            },
            {
              transform: 'none',
            },
          ],
          slideTimingOf(parent),
        );
      }
      let marks = [marksBefore, marksOfGrid(parent)];
      for (let [mark, by] of marksMovedBy(slide, marks, parent, now.grid.body))
        animateStaying(
          mark,
          [
            {
              transform: translateAlong(slide.axis, by),
            },
            {
              transform: 'none',
            },
          ],
          slideTimingOf(parent),
        );
      for (let outline of filterOutlinesResized(slide, marks))
        animateStaying(outline, FADE_IN_LATE, {
          ...slideTimingOf(parent),
          easing: 'linear',
        });
      tell(slide);
    });
  }, [slideState, parent, endSlide, animateStaying, tell]);
  let slideShown = React.useSyncExternalStore(subscribe, slideNow, slideNow);
  return (
    React.useLayoutEffect(() => {
      if (slideShown === null || slideShown !== asBefore.slide || slideShown !== slideOn.current || element === null) return;
      if (slidePlayed.current === slideShown) return;
      slidePlayed.current = slideShown;
      let { axis: axis, asBefore: movesBefore } = slideShown;
      let timing = {
        ...slideTimingOf(element),
        fill: 'forwards',
      };
      let animateGoing = (target?: Dynamic, by?: Dynamic, extra: Dynamic = [{}, {}]) =>
        void animations.current.going.push(
          target.animate(
            [
              {
                transform: 'none',
                ...extra[0],
              },
              {
                transform: translateAlong(axis, by),
                ...extra[1],
              },
            ],
            timing,
          ),
        );
      let byOfColumn = new Map(
        asBefore.columnHeaders.map(
          ({ key: key, columnNumber: columnNumber }: Dynamic) => [
            String(columnNumber + 1),
            movesBefore.find((move?: Dynamic) => move.key === key)?.by,
          ],
        ),
      );
      for (let group of element.querySelectorAll(':scope > .sheet-lines-that-go')) {
        let groupBy = Number(group.getAttribute('data-goes-by'));
        animateGoing(group, groupBy);
        for (let cell of axis === 'rows' ? [] : group.querySelectorAll(':scope > [role="row"] > *')) {
          let cellBy = byOfColumn.get(cell.getAttribute('aria-colindex') ?? '') ?? groupBy;
          if (cellBy !== groupBy) animateGoing(cell, cellBy - groupBy);
        }
      }
      for (let veil of element.querySelectorAll(':scope > .sheet-veil-over-lines-that-go'))
        animateGoing(veil, Number(veil.getAttribute('data-goes-by')), [
          {
            opacity: 0,
          },
          {
            opacity: VEIL_OPACITY,
          },
        ]);
      let bandsIn = (container?: Dynamic) => [...(container?.querySelectorAll(':scope > [data-band]') ?? [])];
      bandsIn(element).forEach((band?: Dynamic, index?: Dynamic) => animateGoing(band, slideShown.bandsAsBefore[index]?.by ?? 0));
      let bodyStart = axis === 'rows' ? asBefore.grid?.body.top : asBefore.grid?.body.left;
      let [firstStaying] = animations.current.staying;
      let bandAnimations: Dynamic = [];
      bandsIn(element.parentElement).forEach((band?: Dynamic, index?: Dynamic) => {
        let bandNow = slideShown.bandsNow[index];
        if (bandNow === undefined || bodyStart === undefined) return;
        let keyframes = [
          {
            transform: translateAlong(axis, bandNow.by),
            clipPath: bandClipPath(axis, bodyStart, bandNow, bandNow.covered),
          },
          {
            transform: 'none',
            clipPath: bandClipPath(axis, bodyStart, bandNow),
          },
        ];
        bandAnimations.push(band.animate(keyframes, slideTimingOf(band)));
      });
      animations.current.staying.push(...bandAnimations);
      let these = animations.current;
      let all = [...these.staying, ...these.going];
      if (firstStaying !== undefined) for (let animation of bandAnimations) animation.pause();
      let plannedAtMs = slideState.drawnAgain?.plannedAtMs ?? performance.now();
      let isPaceNoted: Dynamic = false;
      let notePace = () => {
        if (!isPaceNoted) slidePaceByAxis[axis] = paceAfterSlide(slidePaceByAxis[axis], performance.now() - plannedAtMs, performance.now());
        isPaceNoted = true;
      };
      let endIfStill = () => void (animations.current === these && pausedByPress.current === null && endSlide());
      firstStaying?.ready.then(
        () => {
          notePace();
          if (animations.current !== these) return;
          win?.setTimeout(endIfStill, Number(timing.duration) + SLIDE_SETTLE_MS);
          if (pausedByPress.current === null) for (let animation of bandAnimations) animation.startTime = firstStaying.startTime;
          return;
        },
        () => void (animations.current === these && endSlide()),
      );
      if (firstStaying === undefined) win?.setTimeout(endIfStill, Number(timing.duration) + SLIDE_SETTLE_MS);
      win?.setTimeout(() => {
        if (firstStaying?.pending !== true) return;
        notePace();
        endIfStill();
      }, START_WAIT_MS);
      Promise.allSettled(all.map(({ finished: finished }: Dynamic) => finished)).then(() => {
        if (animations.current === these) endSlide();
        return;
      });
    }, [slideShown, asBefore, element, win, slideState, endSlide]),
    React.useLayoutEffect(() => {
      if (element === null || win === null) return;
      slideTimingOf(element);
      let endAfter = (these?: Dynamic, ms?: Dynamic) =>
        void win.setTimeout(() => void (animations.current === these && endSlide()), ms);
      let onPointerDown = ({ target: target, button: button, isPrimary: isPrimary, pointerId: pointerId }: Dynamic) => {
        if (slideOn.current === null || !isWithin(target, GRID_AREA_SELECTOR)) return;
        if (button !== 0 || !isPrimary || !isWithin(target, PRESSABLE_SELECTOR) || isWithin(target, '.sheet-row')) return endSlide();
        let these = animations.current;
        pausedByPress.current = {
          these: these,
          pointerId: pointerId,
        };
        for (let animation of [...these.staying, ...these.going]) animation.pause();
        return endAfter(these, PAUSED_PRESS_MS);
      };
      let onPointerUp = ({ pointerId: pointerId }: Dynamic) => {
        if (pausedByPress.current?.pointerId === pointerId) endAfter(pausedByPress.current.these, PRESS_LIFT_REPEAT_MAX_MS);
      };
      let onClick = () => void (pausedByPress.current !== null && endSlide());
      let onPointerCancel = ({ pointerId: pointerId }: Dynamic) =>
        void (pausedByPress.current?.pointerId === pointerId && endSlide());
      let onKeyDown = ({ target: target }: Dynamic) => void (isWithin(target, DIALOG_SELECTOR) || endSlide());
      let onBlur = ({ target: target }: Dynamic) => void (target === win && endSlide());
      let listening = new AbortController();
      let options = {
        capture: true,
        signal: listening.signal,
      };
      return (
        win.addEventListener('pointerdown', onPointerDown, options),
        win.addEventListener('pointerup', onPointerUp, options),
        win.addEventListener('pointercancel', onPointerCancel, options),
        win.addEventListener('click', onClick, options),
        win.addEventListener('keydown', onKeyDown, options),
        win.addEventListener('blur', onBlur, options),
        win.addEventListener('contextmenu', endSlide, options),
        win.addEventListener('dragstart', endSlide, options),
        win.document.addEventListener('visibilitychange', endSlide, options),
        () => {
          listening.abort();
          endSlide();
        }
      );
    }, [element, win, endSlide]),
    [asBefore, setElement]
  );
}
export const LINES_SLIDE_ANIMATION_ID = 'lines-slide';
export const linesDrawnOf = (grid?: Dynamic, axis?: Dynamic) =>
  axis === 'rows'
    ? grid.rows.map(
        (row?: Dynamic) => ({
          key: row.key,
          index: row.rowNumber - 1,
          start: row.top,
          size: row.height,
        }),
      )
    : grid.columnHeaders.map(
        (column?: Dynamic) => ({
          key: column.key,
          index: column.columnNumber - 1,
          start: column.left,
          size: column.width,
        }),
      );
export const lineSpanOf = ({ edges: edges, frozenCount: frozenCount, scroll: scroll }: Dynamic, index?: Dynamic) => ({
  start: edges.startOf(index) - (index < frozenCount ? 0 : scroll),
  size: edges.sizeOf(index),
});
export const areSameOutOfSight = (one?: Dynamic, other?: Dynamic) =>
  one === other ||
  (one.length === other.length &&
    one.every(
      ({ firstIndex: firstIndex, count: count }: Dynamic, index?: Dynamic) =>
        firstIndex === other[index]?.firstIndex && count === other[index].count,
    ));
export const slideByAt = ({ bandsNow: bandsNow }: Dynamic, at?: Dynamic) =>
  bandsNow.find(({ start: start, size: size }: Dynamic) => at >= start && at < start + size)?.by ?? 0;
export const NO_LINES_AS_BEFORE = {
  groups: [],
  columnHeaders: [],
  veils: [],
  grid: null,
  slide: null,
};
export const groupIndexAt = ({ groups: groups }: Dynamic, top?: Dynamic) =>
  Math.max(
    0,
    groups.findLastIndex(({ rows: rows }: Dynamic) => (rows[0]?.top ?? 0) <= top),
  );
export const SLIDE_SETTLE_MS = 150;
export const FIRST_SLIDE_REST_MS = 30000;
export const LONGEST_SLIDE_REST_MS = 64 * FIRST_SLIDE_REST_MS;
export const SLIDE_PACE_START = {
  isFirstPlayOver: false,
  inARow: 0,
  nextRestMs: FIRST_SLIDE_REST_MS,
  restUntilMs: 0,
};
export const MARKS_THAT_SLIDE = [
  'selection',
  'selection-summary',
  'active-cell-outline',
  'edge-to-move-cells-by',
  'fill-handle',
  'fill-preview',
  'copied-cells',
  'table-outline',
  'handle-of-table',
  'spill-outline',
  'own-filter-outline',
  'own-filter-button',
  'ground-of-filter-button-held',
  'outline-of-other',
  'name-flags-of-others',
  'room-of-change-by-agent',
  'agent-at-work',
  'comment-wash',
  'comment-mark',
  'found',
  'mark-of-reference',
  'text-under-mark-of-reference',
  'reach-of-editor',
  'offers-at-selection',
  'placed-view',
  'group-bracket',
  'group-mark',
  'seam',
]
  .map((name?: Dynamic) => `.sheet-${name}`)
  .join(',');
export const MARKS_INSIDE_LINES =
  '.sheet-row, .sheet-header-row, .sheet-header-kept, .sheet-cells-held, .sheet-lines-as-before, [data-is-in-view="false"]';
export const NO_MARKS = new Map();
export const OWN_FILTER_OUTLINE_SELECTOR = '.sheet-own-filter-outline';
export const FADE_IN_LATE = [
  {
    opacity: 0,
  },
  {
    opacity: 0,
    offset: 0.5,
  },
  {
    opacity: 1,
  },
];
slideTiming = null;
export const VEIL_OPACITY = 0.4;
export const translateAlong = (axis?: Dynamic, by?: Dynamic) => (axis === 'rows' ? `translateY(${by}px)` : `translateX(${by}px)`);
export const NO_SLIDE_STATE = {
  grid: null,
  before: null,
  now: null,
  slide: null,
  marksBefore: NO_MARKS,
  drawnAgain: null,
};
export const PRESSABLE_SELECTOR = ['button', 'a', '[role="button"]'].join(',');
export const GRID_AREA_SELECTOR = '.sheet-grid-zoomed, .sheet-group-lanes';
export const PAUSED_PRESS_MS = 1000;
export const START_WAIT_MS = 500;
export const slidePaceByAxis = {
  rows: SLIDE_PACE_START,
  columns: SLIDE_PACE_START,
};
export const DIALOG_SELECTOR = '[role="dialog"]';
export const isWithin = (target?: Dynamic, selector?: Dynamic) => target instanceof Element && target.closest(selector) !== null;
