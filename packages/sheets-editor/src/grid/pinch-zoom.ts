import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { clampZoom, isNearFullZoom, pointInZoomedElement } from './zoom.ts';
import { frameSchedulerOf } from './frame-scheduler.ts';
export function pinchZoomAndScroll(pinchStart?: Dynamic, firstFinger?: Dynamic, secondFinger?: Dynamic) {
  let { apart: apart, middle: middle } = fingersApartAndMiddle(firstFinger, secondFinger);
  let zoomAsPinched = pinchStart.apart > 0 ? clampZoom((pinchStart.zoom * apart) / pinchStart.apart) : pinchStart.zoom;
  let zoom = isNearFullZoom(zoomAsPinched) && (pinchStart.zoom === 1 || !isNearFullZoom(pinchStart.zoom)) ? 1 : zoomAsPinched;
  return {
    zoom: zoom,
    scroll: {
      x: pinchStart.under.x - middle.x / zoom,
      y: pinchStart.under.y - middle.y / zoom,
    },
  };
}
export function createPinchZoom(view?: Dynamic, getWindow?: Dynamic) {
  let fingers = new (Map as Dynamic)();
  let pinch: Dynamic = null;
  let fingerLeft: Dynamic = null;
  let frame: Dynamic = null;
  let cancelFrame = () => {
    frame?.of.cancelAnimationFrame(frame.id);
    frame = null;
  };
  let fingersOnGrid = () => [...fingers.values()].map((finger?: Dynamic) => view.placeOnGrid(finger));
  let startPinch = () => {
    let [firstFinger, secondFinger] = fingersOnGrid();
    let place = view.place();
    pinch =
      firstFinger === undefined || firstFinger === null || secondFinger === undefined || secondFinger === null || place === null
        ? null
        : {
            ...pinchStartOf(firstFinger, secondFinger, view.zoom(), place.scroll),
            sheetId: place.sheetId,
          };
  };
  let askFrame = () => {
    if (frame !== null) return;
    let frameWindow = getWindow();
    if (frameWindow === null) followPinch();
    else
      frame = {
        of: frameWindow,
        id: frameWindow.requestAnimationFrame(followPinch),
      };
  };
  function followPinch() {
    cancelFrame();
    if (pinch !== null && view.place()?.sheetId !== pinch.sheetId) startPinch();
    let [firstFinger, secondFinger] = fingersOnGrid();
    if (pinch === null || firstFinger === undefined || firstFinger === null) return;
    if (secondFinger === undefined || secondFinger === null) return;
    let { zoom: zoom, scroll: scroll } = pinchZoomAndScroll(pinch, firstFinger, secondFinger);
    if (!view.goTo(zoom, scroll) && getWindow() !== null) askFrame();
  }
  let forgetPinch = () => {
    cancelFrame();
    fingers.clear();
    pinch = null;
    fingerLeft = null;
  };
  return {
    firstCameDown(finger?: Dynamic) {
      forgetPinch();
      fingers.set(finger.pointerId, finger);
    },
    secondCameDown(finger?: Dynamic, canPinch?: Dynamic) {
      if (fingers.size !== 1) return false;
      fingers.set(finger.pointerId, finger);
      fingerLeft = null;
      if (canPinch) startPinch();
      return pinch !== null;
    },
    fingerMovedTo(finger?: Dynamic, atMs?: Dynamic) {
      if (!fingers.has(finger.pointerId)) return 'isOfNoPinch';
      let { pointerId: pointerId, clientX: clientX, clientY: clientY } = finger;
      fingers.set(pointerId, {
        pointerId: pointerId,
        clientX: clientX,
        clientY: clientY,
      });
      if (fingerLeft?.pointerId === pointerId) {
        if (atMs - fingerLeft.sinceMs <= PINCH_FINGER_LAG_MS) return 'isOfPinch';
        fingerLeft = null;
        return 'isFirstAfterPinch';
      }
      if (pinch === null) return 'isOfNoPinch';
      askFrame();
      return 'isOfPinch';
    },
    fingerLifted(pointerId?: Dynamic, atMs?: Dynamic) {
      if (!fingers.has(pointerId)) return;
      if (frame !== null) followPinch();
      cancelFrame();
      fingers.delete(pointerId);
      let [fingerLeftId] = fingers.keys();
      fingerLeft =
        pinch !== null && fingerLeftId !== undefined
          ? {
              pointerId: fingerLeftId,
              sinceMs: atMs,
            }
          : null;
      pinch = null;
    },
    onlyFingerDown: () => (fingers.size === 1 ? ([...fingers.values()][0] ?? null) : null),
    forget: forgetPinch,
    isOn: () => pinch !== null,
  };
}
export function usePinchZoom({ store: store, grid: grid, gridZoom: gridZoom }: Dynamic) {
  let pinchZoom = React.useMemo(() => {
    let place = () => {
      let scrollOnShow = store.scrollOnShow();
      return scrollOnShow === null
        ? null
        : {
            sheetId: scrollOnShow.sheetId,
            scroll: {
              x: scrollOnShow.scrollLeft,
              y: scrollOnShow.scrollTop,
            },
          };
    };
    let view = {
      zoom: gridZoom.now,
      place: place,
      placeOnGrid: (finger?: Dynamic) => (grid.current === null ? null : pointInZoomedElement(grid.current, 1, finger)),
      goTo(zoom?: Dynamic, scroll?: Dynamic) {
        if (store.isEventUnfinished()) return false;
        gridZoom.set(zoom, true);
        let scrollNow = place()?.scroll;
        if (scrollNow !== undefined)
          store.dispatch({
            kind: 'wheelTurned',
            deltaX: scroll.x - scrollNow.x,
            deltaY: scroll.y - scrollNow.y,
            isByFinger: true,
          });
        return true;
      },
    };
    return createPinchZoom(view, () => frameSchedulerOf(grid.current));
  }, [store, grid, gridZoom]);
  React.useEffect(() => () => pinchZoom.forget(), [pinchZoom]);
  return pinchZoom;
}
export const PINCH_FINGER_LAG_MS = 150;
export const fingersApartAndMiddle = (first?: Dynamic, second?: Dynamic) => ({
  apart: Math.hypot(first.x - second.x, first.y - second.y),
  middle: {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  },
});
export const pinchStartOf = (first?: Dynamic, second?: Dynamic, zoom?: Dynamic, scroll?: Dynamic) => {
  let { apart: apart, middle: middle } = fingersApartAndMiddle(first, second);
  return {
    apart: apart,
    zoom: zoom,
    under: {
      x: scroll.x + middle.x / zoom,
      y: scroll.y + middle.y / zoom,
    },
  };
};
