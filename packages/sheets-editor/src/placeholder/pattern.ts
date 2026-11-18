import type { Dynamic } from '../dynamic.ts';
import { jsx } from 'react/jsx-runtime';
export let PATTERN_FADE_IN_SECONDS: Dynamic;
export let PATTERN_FADE_OUT_SECONDS: Dynamic;
export function shufflePatternMotifs(random?: Dynamic, rowCount?: Dynamic) {
  let direction = random() < 0.5 ? 1 : -1;
  let randomOffset = () => Math.floor(random() * 24);
  let [offsetA, offsetB, offsetC, offsetD] = [randomOffset(), randomOffset(), randomOffset(), randomOffset()];
  let [peaksA, peaksB, noise] = [
    localPeaksOfNoise(createCellNoise(random)),
    localPeaksOfNoise(createCellNoise(random)),
    createCellNoise(random),
  ];
  let motifs = [
    (column?: Dynamic, row?: Dynamic) => wrapModulo(row + direction * 4 * column + offsetB, 9) === 0,
    (column?: Dynamic, row?: Dynamic) => wrapModulo(row + 4 * (2 - Math.abs(wrapModulo(column + offsetC, 4) - 2)) + offsetC, 11) === 0,
    (column?: Dynamic, row?: Dynamic) => wrapModulo(row - direction * 2 * column + offsetD, 10) === 0,
    peaksA,
    (column?: Dynamic, row?: Dynamic) =>
      peaksB(column, row) && noise(column, row) < 1.05 - 0.95 * (direction === 1 ? row / rowCount : 1 - row / rowCount),
  ].map(
    (motif?: Dynamic) => ({
      motif: motif,
      place: random(),
    }),
  );
  motifs.sort((input?: Dynamic, options?: Dynamic) => input.place - options.place);
  return [
    (column?: Dynamic, row?: Dynamic) =>
      wrapModulo(row + 4 * column + offsetA, 16) === 0 || wrapModulo(row - 4 * column + offsetA, 16) === 0,
    ...motifs.map(({ motif: motif }: Dynamic) => motif),
  ];
}
export function drawPlaceholderPattern(element?: Dynamic, previous?: Dynamic) {
  let ownerDocument = element.ownerDocument;
  let view = ownerDocument.defaultView;
  if (view === null || view.matchMedia('(prefers-reduced-motion:reduce)').matches) return previous;
  let style = view.getComputedStyle(element);
  let readPixels = (property?: Dynamic) => Number.parseFloat(style.getPropertyValue(property));
  let headersWidth = readPixels('--sheet-placeholder-headers-width');
  let headersHeight = readPixels('--sheet-placeholder-headers-height');
  let columnWidth = readPixels('--sheet-placeholder-column-width');
  let rowHeight = readPixels('--sheet-placeholder-row-height');
  let { width: width, height: height } = element.getBoundingClientRect();
  let rowsUnderHeaders = Math.ceil(headersHeight / rowHeight);
  let columnCount = Math.ceil((width - headersWidth) / columnWidth) + 1;
  let rowCount = Math.ceil((height - headersHeight) / rowHeight) + rowsUnderHeaders;
  let cells = `${columnCount} ${rowCount}`;
  if (!(columnCount > 1 && rowCount > rowsUnderHeaders) || cells === previous.cells) return previous;
  let isFirstDraw = previous.cells === '';
  previous.takeOff();
  let stepOfColumn = (column?: Dynamic) =>
    Math.round((0.5 + (headersWidth + (column - 0.5) * columnWidth) / width) / 0.16666666666666666);
  let pens: Dynamic = [];
  let fades: Dynamic = [];
  for (let index: Dynamic = 0, endColumn: Dynamic = 0; index < columnCount; index = endColumn + 1) {
    endColumn = index;
    while (endColumn + 1 < columnCount && stepOfColumn(endColumn + 1) === stepOfColumn(index)) endColumn += 1;
    let canvas = ownerDocument.createElement('canvas');
    [canvas.width, canvas.height] = [endColumn - index + 1, rowCount];
    canvas.style.top = `${headersHeight - rowsUnderHeaders * rowHeight}px`;
    canvas.style.left = `${headersWidth + (index - 1) * columnWidth}px`;
    canvas.style.width = `${canvas.width * columnWidth}px`;
    canvas.style.height = `${rowCount * rowHeight}px`;
    element.append(canvas);
    fades.push(
      canvas.animate(
        [
          {
            opacity: 0,
            offset: 0,
            easing: 'ease-in-out',
          },
          {
            opacity: 1,
            offset: PATTERN_FADE_IN_SECONDS / 2,
            easing: 'ease-in-out',
          },
          {
            opacity: 0,
            offset: (PATTERN_FADE_IN_SECONDS + PATTERN_FADE_OUT_SECONDS) / 2,
          },
          {
            opacity: 0,
            offset: 1,
          },
        ],
        {
          duration: 2000,
          delay: (stepOfColumn(index) * 0.16666666666666666 - PATTERN_FADE_IN_SECONDS - 4) * 1000,
          iterations: 1 / 0,
        },
      ),
    );
    let pen = canvas.getContext('2d');
    if (pen === null) continue;
    pens.push({
      pen: pen,
      from: index,
      to: endColumn,
      step: stepOfColumn(index),
      pass: null,
    });
  }
  let mount = element.closest('.sheet-placeholder-mount') ?? element.parentElement;
  let shimmers = (
    typeof mount?.getAnimations === 'function'
      ? mount.getAnimations({
          subtree: true,
        })
      : []
  ).filter((input?: Dynamic) => 'animationName' in input && input.animationName === 'ui-skeleton-sheen' && input.playState === 'running');
  if (isFirstDraw) for (let value of shimmers as Dynamic) value.startTime = Number(ownerDocument.timeline.currentTime) - 450;
  let [shimmer] = shimmers;
  shimmer?.ready.then(() => {
    for (let fade of fades as Dynamic) if (fade.playState === 'running') fade.startTime = shimmer.startTime;
    return;
  }, ignorePatternOutcome);
  let motifs = shufflePatternMotifs(mulberry32Random(PATTERN_SEED), rowCount);
  let secondsIn = () => Number((shimmer ?? fades[0])?.currentTime ?? 0) / 1000;
  let firstPass = previous.first ?? Math.floor(secondsIn() / 2);
  let paint = (isRedraw?: Dynamic) => {
    for (let band of pens as Dynamic) {
      let cycle = (secondsIn() - (band.step * 0.16666666666666666 - PATTERN_FADE_IN_SECONDS)) / 2;
      let isHidden = (cycle - Math.floor(cycle)) * 2 < PATTERN_FADE_IN_SECONDS + PATTERN_FADE_OUT_SECONDS;
      let pass = Math.floor(cycle) + (isHidden ? 0 : 1);
      if ((isHidden && !isRedraw) || pass === band.pass) continue;
      let motif = motifs[Math.max(0, pass - firstPass) % motifs.length];
      if (motif === undefined) continue;
      band.pass = pass;
      let { pen: pen, from: fromColumn, to: toColumn } = band;
      pen.clearRect(0, 0, toColumn - fromColumn + 1, rowCount);
      pen.fillStyle = style.color;
      for (let column: Dynamic = fromColumn; column <= toColumn; column += 1)
        for (let row: Dynamic = 0; row < rowCount; row += 1) {
          if (!motif(column, Math.max(row, rowsUnderHeaders - 1))) continue;
          for (let alpha of [1, 0.3] as Dynamic) {
            pen.globalAlpha = alpha;
            pen.fillRect(column - fromColumn, row, 1, 1);
          }
        }
    }
  };
  let modeObserver = new (view.MutationObserver as Dynamic)(() => {
    for (let band of pens as Dynamic) band.pass = null;
    paint(true);
  });
  modeObserver.observe(ownerDocument.documentElement, {
    attributes: true,
    attributeFilter: ['data-mode'],
  });
  let [timer, frame]: Dynamic = [0, 0];
  let schedule = () => {
    view.cancelAnimationFrame(frame);
    frame = view.requestAnimationFrame(() => paint(false));
    timer = view.setTimeout(schedule, ((2 - PATTERN_FADE_IN_SECONDS - PATTERN_FADE_OUT_SECONDS) / 2) * 1000);
  };
  paint(true);
  schedule();
  return {
    cells: cells,
    first: firstPass,
    takeOff() {
      modeObserver.disconnect();
      view.clearTimeout(timer);
      view.cancelAnimationFrame(frame);
      for (let fade of fades as Dynamic) fade.cancel();
      element.replaceChildren();
    },
  };
}
export function PlaceholderPattern() {
  return jsx('div', {
    className: 'sheet-pattern',
    ref: placeholderPatternRef,
    'aria-hidden': true,
  });
}
export const PATTERN_SEED = Math.floor(Math.random() * 4294967296);
[PATTERN_FADE_IN_SECONDS, PATTERN_FADE_OUT_SECONDS] = [0.5, 0.5];
export const mulberry32Random = (seed?: Dynamic) => {
  let state: Dynamic = seed >>> 0;
  return () => {
    state = (state + 1831565813) >>> 0;
    let mixed: Dynamic = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};
export const wrapModulo = (value?: Dynamic, modulus?: Dynamic) => ((value % modulus) + modulus) % modulus;
export const createCellNoise = (random?: Dynamic) => {
  let salt = Math.floor(random() * 4294967296);
  return (column?: Dynamic, row?: Dynamic) => {
    let hash: Dynamic = Math.imul(column + 101, 2654435761) ^ Math.imul(row + 211, 2246822507) ^ salt;
    hash = Math.imul(hash ^ (hash >>> 15), 739982445);
    hash = Math.imul(hash ^ (hash >>> 12), 695872825);
    return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
  };
};
export const localPeaksOfNoise =
  (noise?: Dynamic) =>
  (column?: Dynamic, row?: Dynamic) => {
    for (let rowStep: Dynamic = -1; rowStep <= 1; rowStep += 1)
      for (let columnStep: Dynamic = -1; columnStep <= 1; columnStep += 1)
        if ((columnStep !== 0 || rowStep !== 0) && noise(column + columnStep, row + rowStep) >= noise(column, row)) return false;
    return true;
  };
export const ignorePatternOutcome = () => {
  return;
};
export const PATTERN_RESIZE_DELAY_MS = 150;
export const placeholderPatternRef = (element?: Dynamic) => {
  let view = element?.ownerDocument.defaultView ?? null;
  if (element === null || view === null) return;
  let pattern: Dynamic = {
    cells: '',
    first: null,
    takeOff: ignorePatternOutcome,
  };
  let timer: Dynamic = 0;
  let observer = new (view.ResizeObserver as Dynamic)(([entry]: Dynamic) => {
    view.clearTimeout(timer);
    if (entry?.contentRect.width === 0) return;
    if (pattern.cells === '') pattern = drawPlaceholderPattern(element, pattern);
    else
      timer = view.setTimeout(() => {
        pattern = drawPlaceholderPattern(element, pattern);
      }, PATTERN_RESIZE_DELAY_MS);
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
    view.clearTimeout(timer);
    pattern.takeOff();
  };
};
