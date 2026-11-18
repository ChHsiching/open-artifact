import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { DRAG_START_DISTANCE } from './geometry.ts';
import { unzoomLength } from './zoom.ts';
import { frameSchedulerOf } from './frame-scheduler.ts';
export function flingStepAfter(speed?: Dynamic, elapsedMs?: Dynamic) {
  let decay = FLING_DECAY_PER_MS ** elapsedMs;
  let distanceFactor = (decay - 1) / Math.log(FLING_DECAY_PER_MS);
  return {
    by: {
      x: speed.x * distanceFactor,
      y: speed.y * distanceFactor,
    },
    speed: {
      x: speed.x * decay,
      y: speed.y * decay,
    },
  };
}
export function flingSpeedAtLift(samples?: Dynamic, liftedAtMs?: Dynamic, { restsUpTo: restsUpTo, endsAt: endsAt }: Dynamic = {}) {
  let lastSample = samples.at(-1);
  if (lastSample === undefined || liftedAtMs - lastSample.atMs > FLING_LIFT_STALE_MS) return null;
  let weighted = samples.map(
    ({ at: at, atMs: atMs }: Dynamic) => ({
      at: at,
      ms: atMs - lastSample.atMs,
      weight: Math.exp((atMs - lastSample.atMs) / FLING_SAMPLE_WEIGHT_MS),
    }),
  );
  let weightedSum = (valueOf?: Dynamic) =>
    weighted.reduce((sum?: Dynamic, sample?: Dynamic) => sum + sample.weight * valueOf(sample), 0);
  let totalWeight = weightedSum(() => 1);
  let [meanMs, meanX, meanY] = [
    weightedSum((sample?: Dynamic) => sample.ms) / totalWeight,
    weightedSum((sample?: Dynamic) => sample.at.x) / totalWeight,
    weightedSum((sample?: Dynamic) => sample.at.y) / totalWeight,
  ];
  let msSpread = weightedSum((sample?: Dynamic) => (sample.ms - meanMs) ** 2);
  let [speedX, speedY] = [
    -weightedSum((sample?: Dynamic) => (sample.ms - meanMs) * (sample.at.x - meanX)) / msSpread,
    -weightedSum((sample?: Dynamic) => (sample.ms - meanMs) * (sample.at.y - meanY)) / msSpread,
  ];
  if (
    Math.max(...samples.map(({ at: at }: Dynamic) => Math.hypot(at.x - (samples[0]?.at ?? at).x, at.y - (samples[0]?.at ?? at).y))) <
    DRAG_START_DISTANCE
  )
    return null;
  let speed = Math.hypot(speedX, speedY);
  let scale = Math.min((speed - restsUpTo) / FLING_SPEED_RAMP, 1, FLING_MAX_START_SPEED / speed);
  if (!(speed * scale >= endsAt)) return null;
  return {
    x: Math.abs(speedY) >= Math.abs(speedX) * FLING_AXIS_LOCK_RATIO ? 0 : speedX * scale,
    y: Math.abs(speedX) >= Math.abs(speedY) * FLING_AXIS_LOCK_RATIO ? 0 : speedY * scale,
  };
}
export function createFingerFling(
  scrollBy?: Dynamic,
  scrollPlace?: Dynamic,
  viewOf?: Dynamic,
  zoom?: Dynamic,
  feel: Dynamic = FLING_FEEL_BY_PLATFORM.onApple,
  onStandstill: Dynamic = () => {},
) {
  let samples: Dynamic = [];
  let frame: Dynamic = null;
  let stopFling = () => {
    let wasFlinging = frame !== null;
    frame?.of.cancelAnimationFrame(frame.id);
    frame = null;
    samples = [];
    return wasFlinging;
  };
  let flingOn = (speed?: Dynamic, fromMs?: Dynamic, fromPlace?: Dynamic) => {
    let step = (nowMs2?: Dynamic) => {
      frame = null;
      if (scrollPlace() !== fromPlace) return;
      if (nowMs2 <= fromMs) return flingOn(speed, fromMs, fromPlace);
      if (nowMs2 - fromMs > FLING_MAX_FRAME_GAP_MS) return;
      let stepped = flingStepAfter(speed, Math.min(nowMs2 - fromMs, FLING_MAX_FRAME_MS));
      scrollBy({
        x: unzoomLength(stepped.by.x, zoom()),
        y: unzoomLength(stepped.by.y, zoom()),
      });
      let placeNow = scrollPlace();
      let isSlowEnough = Math.hypot(stepped.speed.x, stepped.speed.y) < feel.endsAt;
      if (placeNow !== fromPlace && !isSlowEnough) flingOn(stepped.speed, nowMs2, placeNow);
      if (placeNow === fromPlace) onStandstill(stepped.speed);
      return;
    };
    let view = viewOf();
    frame =
      view === null
        ? null
        : {
            of: view,
            id: view.requestAnimationFrame(step),
          };
  };
  return {
    fingerMovedTo({ clientX: clientX, clientY: clientY }: Dynamic, atMs?: Dynamic) {
      samples = [
        ...samples.filter(
          (sample?: Dynamic) => atMs - sample.atMs <= FLING_SAMPLE_WINDOW_MS && atMs - sample.atMs >= FLING_SAMPLE_MIN_GAP_MS,
        ),
        {
          at: {
            x: clientX,
            y: clientY,
          },
          atMs: atMs,
        },
      ];
    },
    fingerLifted(
      atMs?: Dynamic,
      heldBy: Dynamic = {
        x: 0,
        y: 0,
      },
    ) {
      let [liftSpeed, lastSample] = [flingSpeedAtLift(samples, atMs, feel), samples.at(-1)];
      stopFling();
      let nowMs2 = viewOf()?.performance.now();
      if (liftSpeed === null || lastSample === undefined || nowMs2 === undefined) return;
      let startSpeed = {
        x: heldBy.x * liftSpeed.x > 0 ? 0 : liftSpeed.x,
        y: heldBy.y * liftSpeed.y > 0 ? 0 : liftSpeed.y,
      };
      if (startSpeed.x === 0 && startSpeed.y === 0) return;
      let lagMs = Math.min(atMs - lastSample.atMs, FLING_MAX_LIFT_LAG_MS);
      flingOn(startSpeed, nowMs2 - lagMs, scrollPlace());
    },
    stop: stopFling,
  };
}
export function useFingerFling({ store: store, grid: grid, gridZoom: gridZoom, isOnApple: isOnApple, atStandstill: atStandstill }: Dynamic) {
  let fling = React.useMemo(
    () =>
      createFingerFling(
        ({ x: x, y: y }: Dynamic) =>
          store.dispatch({
            kind: 'wheelTurned',
            deltaX: x,
            deltaY: y,
            isByFinger: true,
          }),
        () => {
          let place = store.place();
          return place === null ? '' : `${place.sheetId} ${place.scrollLeft} ${place.scrollTop}`;
        },
        () => frameSchedulerOf(grid.current),
        gridZoom.now,
        FLING_FEEL_BY_PLATFORM[isOnApple ? 'onApple' : 'elsewhere'],
        atStandstill,
      ),
    [store, grid, gridZoom, isOnApple, atStandstill],
  );
  React.useEffect(() => () => void fling.stop(), [fling]);
  return fling;
}
export const FLING_SAMPLE_WINDOW_MS = 100;
export const FLING_SAMPLE_MIN_GAP_MS = 3;
export const FLING_SAMPLE_WEIGHT_MS = 24;
export const FLING_LIFT_STALE_MS = 50;
export const FLING_FEEL_BY_PLATFORM = {
  onApple: {
    restsUpTo: 0.2,
    endsAt: 0.02,
  },
  elsewhere: {
    restsUpTo: 0.1,
    endsAt: 0.06,
  },
};
export const FLING_SPEED_RAMP = 0.1;
export const FLING_MAX_START_SPEED = 8;
export const FLING_DECAY_PER_MS = 0.998;
export const FLING_AXIS_LOCK_RATIO = 2;
export const FLING_MAX_FRAME_MS = 64;
export const FLING_MAX_LIFT_LAG_MS = 17;
export const FLING_MAX_FRAME_GAP_MS = 500;
