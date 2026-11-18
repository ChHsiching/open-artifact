import { prefersReducedMotion } from '../kit/platform.ts';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
export function overscrollOnAxis({ by: by, most: most }: Dynamic, delta: Dynamic) {
  let beyond = by + delta - Math.min(Math.max(by + delta, 0), Math.max(most, 0));
  return delta > 0 ? Math.min(Math.max(beyond, 0), delta) : Math.max(Math.min(beyond, 0), delta);
}
export function easedProgress([x1, y1, x2, y2]: Dynamic, progress: Dynamic) {
  let [low, high]: Dynamic = [0, 1];
  for (let step: Dynamic = 0; step < 24; step += 1) {
    let middle = (low + high) / 2;
    if (cubicBezierAt(x1, x2, middle) < progress) low = middle;
    else high = middle;
  }
  return cubicBezierAt(y1, y2, (low + high) / 2);
}
export function createOverscrollBounce(
  isOn: Dynamic,
  elementsOf: Dynamic,
  zoomOf: Dynamic,
  now: Dynamic,
  isMotionReduced: Dynamic = () => false,
) {
  if (!isOn) return INERT_OVERSCROLL_BOUNCE;
  let pulled: Dynamic = NO_STRETCH;
  let playing: Dynamic = null;
  let pullSpeed: Dynamic = NO_STRETCH;
  let roomOf = () => {
    let [first] = elementsOf();
    return first === undefined
      ? NO_STRETCH
      : {
          x: first.clientWidth * zoomOf(),
          y: first.clientHeight * zoomOf(),
        };
  };
  let stretchOfPull = ({ x: x, y: y }: Dynamic) => ({
    x: -rubberBandOffset(x, roomOf().x),
    y: -rubberBandOffset(y, roomOf().y),
  });
  let stretchPlayingNow = () => {
    if (playing === null) return NO_STRETCH;
    let startTime = playing.played[0]?.startTime;
    let elapsed: Dynamic = typeof startTime === 'number' ? now() - startTime : 0;
    for (let { from: from, to: to, ms: ms, curve: curve } of playing.legs) {
      if (elapsed < ms) {
        let eased = easedProgress(curve, Math.max(elapsed, 0) / ms);
        return {
          x: from.x + (to.x - from.x) * eased,
          y: from.y + (to.y - from.y) * eased,
        };
      }
      elapsed -= ms;
    }
    playing = null;
    return NO_STRETCH;
  };
  let stopPlaying = () => {
    for (let animation of playing?.played ?? []) animation.cancel();
    playing = null;
  };
  let play = (legs?: Dynamic) => {
    stopPlaying();
    let duration = legs.reduce((total: Dynamic, { ms: ms }: Dynamic) => total + ms, 0);
    let played = elementsOf().map((element?: Dynamic) => {
      Object.assign(element.style, {
        translate: '',
        zIndex: '',
      });
      let offset: Dynamic = 0;
      let keyframes = legs.map(({ from: from, ms: ms, curve: curve }: Dynamic) => {
        let keyframe = {
          ...stretchStyle(from, element),
          offset: offset,
          easing: `cubic-bezier(${curve.join(', ')})`,
        };
        offset += ms / duration;
        return keyframe;
      });
      return element.animate([...keyframes, stretchStyle(legs.at(-1)?.to ?? NO_STRETCH, element)], {
        duration: duration,
      });
    });
    playing = {
      legs: legs,
      played: played,
    };
  };
  let drawPulled = () => {
    stopPlaying();
    for (let element of elementsOf())
      Object.assign(
        element.style,
        {
          translate: '',
          zIndex: '',
        },
        isNoStretch(pulled) ? {} : stretchStyle(stretchOfPull(pulled), element),
      );
  };
  let holdAgain = () => {
    let stretch = stretchPlayingNow();
    if (!isStretchShown(stretch)) return;
    pulled = {
      x: pullOfRubberBandOffset(-stretch.x, roomOf().x),
      y: pullOfRubberBandOffset(-stretch.y, roomOf().y),
    };
    drawPulled();
  };
  return {
    easedBy(delta?: Dynamic) {
      holdAgain();
      let takenBack = {
        x: stretchTakenBack(delta.x, pulled.x),
        y: stretchTakenBack(delta.y, pulled.y),
      };
      if (isNoStretch(takenBack)) return delta;
      pulled = {
        x: pulled.x + takenBack.x,
        y: pulled.y + takenBack.y,
      };
      drawPulled();
      return {
        x: delta.x - takenBack.x,
        y: delta.y - takenBack.y,
      };
    },
    pulledBy(overscroll?: Dynamic, delta?: Dynamic) {
      pullSpeed = {
        x: pullSpeed.x * PULL_AXIS_DECAY + Math.abs(delta.x),
        y: pullSpeed.y * PULL_AXIS_DECAY + Math.abs(delta.y),
      };
      let pull = {
        x: pullSpeed.y >= pullSpeed.x * PULL_AXIS_DOMINANCE ? 0 : overscroll.x,
        y: pullSpeed.x >= pullSpeed.y * PULL_AXIS_DOMINANCE ? 0 : overscroll.y,
      };
      if (isNoStretch(pull) || elementsOf().length === 0) return;
      pulled = {
        x: pulled.x + pull.x,
        y: pulled.y + pull.y,
      };
      drawPulled();
    },
    letGo() {
      pullSpeed = NO_STRETCH;
      let stretch = isNoStretch(pulled) ? stretchPlayingNow() : stretchOfPull(pulled);
      if (!isNoStretch(pulled))
        play([
          {
            from: stretch,
            to: NO_STRETCH,
            ...SPRING_BACK_LEG,
          },
        ]);
      pulled = NO_STRETCH;
      return {
        x: flingAfterLetGo(stretch.x),
        y: flingAfterLetGo(stretch.y),
      };
    },
    bumpedAt(speed?: Dynamic) {
      let bump = {
        x: bumpOffsetOfSpeed(speed.x),
        y: bumpOffsetOfSpeed(speed.y),
      };
      if (Math.hypot(bump.x, bump.y) < BUMP_MIN_PX || isMotionReduced() || isStretchShown(stretchPlayingNow())) return;
      play([
        {
          from: NO_STRETCH,
          to: bump,
          ...BUMP_OUT_LEG,
        },
        {
          from: bump,
          to: NO_STRETCH,
          ...SPRING_BACK_LEG,
        },
      ]);
    },
    isOnWayBack: () => isStretchShown(stretchPlayingNow()),
    heldAgain: holdAgain,
  };
}
export function useOverscrollBounce(gridRef: Dynamic, zoomOf: Dynamic, isOn: Dynamic) {
  let bounce = React.useMemo(
    () =>
      createOverscrollBounce(
        isOn,
        () => {
          if (gridRef.current === null) return [];
          let withMargins = gridRef.current.closest('.sheet-with-group-margins');
          let margins = [...(withMargins?.querySelectorAll('.sheet-group-margin') ?? [])];
          return [
            gridRef.current,
            ...(withMargins?.querySelectorAll('.sheet-import-proposal > *') ?? []),
            ...margins.map(
              (margin?: Dynamic) => ({
                liesOnGrid: true,
                style: margin.style,
                clientWidth: margin.clientWidth,
                clientHeight: margin.clientHeight,
                animate: (keyframes?: Dynamic, options?: Dynamic) => margin.animate(keyframes, options),
              }),
            ),
          ];
        },
        zoomOf,
        bounceClockNow,
        prefersReducedMotion,
      ),
    [gridRef, zoomOf, isOn],
  );
  React.useEffect(() => {
    let letGo = () => void bounce.letGo();
    for (let type of ['blur', 'pagehide', 'resize']) window.addEventListener(type, letGo);
    document.addEventListener('visibilitychange', letGo);
    return () => {
      for (let type of ['blur', 'pagehide', 'resize']) window.removeEventListener(type, letGo);
      document.removeEventListener('visibilitychange', letGo);
    };
  }, [bounce]);
  return bounce;
}
export const RUBBER_BAND_FACTOR = 0.5;
export const SPRING_BACK_LEG = {
  ms: 500,
  curve: [0.45, 0.9, 0.45, 0.95],
};
export const BUMP_PX_PER_SPEED_SQUARED = 12.5;
export const BUMP_MAX_PX = 120;
export const BUMP_MIN_PX = 3;
export const BUMP_OUT_LEG = {
  ms: 100,
  curve: [0, 0.6, 0.4, 1],
};
export const PULL_AXIS_DECAY = 0.7;
export const PULL_AXIS_DOMINANCE = 2;
export const STRETCH_SHOWN_PX = 2;
export const rubberBandOffset = (pull?: Dynamic, room?: Dynamic) =>
  room <= 0 ? 0 : Math.sign(pull) * (1 - 1 / ((Math.abs(pull) * RUBBER_BAND_FACTOR) / room + 1)) * room;
export const pullOfRubberBandOffset = (offset?: Dynamic, room?: Dynamic) =>
  room <= 0 || Math.abs(offset) >= room ? 0 : (Math.sign(offset) * (1 / (1 - Math.abs(offset) / room) - 1) * room) / RUBBER_BAND_FACTOR;
export const overscrollOf = ({ rows: rows, columns: columns }: Dynamic, delta?: Dynamic) => ({
  x: columns.most <= 0 ? 0 : overscrollOnAxis(columns, delta.x),
  y: overscrollOnAxis(rows, delta.y),
});
export const cubicBezierAt = (p1?: Dynamic, p2?: Dynamic, t?: Dynamic) =>
  3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;
export const stretchTakenBack = (delta?: Dynamic, pull?: Dynamic) =>
  delta * pull < 0 ? Math.sign(delta) * Math.min(Math.abs(delta), Math.abs(pull)) : 0;
export const bumpOffsetOfSpeed = (speed?: Dynamic) =>
  -Math.sign(speed) * Math.min(BUMP_PX_PER_SPEED_SQUARED * speed ** 2, BUMP_MAX_PX);
export const flingAfterLetGo = (stretch?: Dynamic) => (Math.abs(stretch) > STRETCH_SHOWN_PX ? -Math.sign(stretch) : 0);
export const bounceClockNow = () => performance.now();
export const NO_STRETCH = {
  x: 0,
  y: 0,
};
export const isNoStretch = ({ x: x, y: y }: Dynamic) => x === 0 && y === 0;
export const isStretchShown = ({ x: x, y: y }: Dynamic) => Math.hypot(x, y) > STRETCH_SHOWN_PX;
export const stretchStyle = ({ x: x, y: y }: Dynamic, { liesOnGrid: liesOnGrid }: Dynamic) => ({
  translate: `${x}px ${y}px`,
  ...(liesOnGrid && {
    zIndex: '1',
  }),
});
export const INERT_OVERSCROLL_BOUNCE = {
  easedBy: (delta?: Dynamic) => delta,
  pulledBy: () => {},
  letGo: () => NO_STRETCH,
  bumpedAt: () => {},
  isOnWayBack: () => false,
  heldAgain: () => {},
};
