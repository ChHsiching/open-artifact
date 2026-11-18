import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { isNearFullZoom, clampZoom } from './zoom.ts';
export function nextWheelZoom(run: Dynamic, { zoomNow: zoomNow, factor: factor, atMs: atMs }: Dynamic) {
  let baseRun = run !== null && atMs - run.lastAtMs <= ZOOM_WHEEL_RUN_MS && run.shown === zoomNow ? run : zoomAsked(zoomNow);
  let nextRun = zoomAskedTimes(baseRun, baseRun.asked * factor);
  return {
    ...nextRun,
    shown: zoomShown(nextRun),
    lastAtMs: atMs,
  };
}
export function useGridZoomGestures({ gridRef: gridRef, overGridRef: overGridRef, gridZoom: gridZoom, zoomTo: zoomTo }: Dynamic) {
  let zoomToEvent = React.useEffectEvent(zoomTo);
  React.useEffect(() => {
    let scroller = gridRef.current?.parentElement;
    let overGrid = overGridRef.current;
    let defaultView = scroller?.ownerDocument.defaultView;
    if (scroller === null || scroller === undefined || overGrid === null) return;
    if (defaultView === null || defaultView === undefined) return;
    let targets = [scroller, overGrid];
    let zoomAtGestureStart: Dynamic = 1;
    let gestureRun: Dynamic = zoomAsked(1);
    let { NEGATIVE_INFINITY: lastGestureAt, NEGATIVE_INFINITY: lastPlainWheelAt }: Dynamic = Number;
    let lastWheel: Dynamic = {
      deltaY: 0,
      timeStamp: Number.NEGATIVE_INFINITY,
    };
    let isModifierHeldForZoom: Dynamic = false;
    let wheelRun: Dynamic = null;
    let touchPointers = new (Set as Dynamic)();
    let onWheel = (event?: Dynamic) => {
      let isRightAfterGesture = event.timeStamp - lastGestureAt <= GESTURE_WHEEL_GUARD_MS;
      if (!isZoomModifier(event)) lastPlainWheelAt = event.timeStamp;
      if (!event.ctrlKey && !event.metaKey) isModifierHeldForZoom = false;
      let isPinchWheel =
        isZoomModifier(event) && !isModifierHeldForZoom && isPinchWheelContinuing(scroller.ownerDocument.hasFocus(), event, lastWheel);
      let isScrollWheel = !isZoomModifier(event) || isModifierHeldForZoom || isPinchWheel;
      if (isScrollWheel)
        lastWheel = {
          deltaY: event.deltaY,
          timeStamp: event.timeStamp,
        };
      if (isPinchWheel && event.ctrlKey) event.preventDefault();
      if (!isRightAfterGesture && isScrollWheel) return;
      event.preventDefault();
      event.stopPropagation();
      if (isRightAfterGesture) return;
      let deltaUnit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? WHEEL_LINE_PIXELS
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? defaultView.innerHeight
            : 1;
      wheelRun = nextWheelZoom(wheelRun, {
        zoomNow: gridZoom.now(),
        factor: wheelZoomFactor(event.deltaY * deltaUnit),
        atMs: event.timeStamp,
      });
      zoomToEvent(wheelRun.shown, event);
    };
    let onModifierKey = (event?: Dynamic) => {
      if ((event.key !== 'Control' && event.key !== 'Meta') || event.repeat) return;
      if (event.type === 'keydown') isModifierHeldForZoom ||= event.timeStamp - lastPlainWheelAt <= ZOOM_WHEEL_RUN_MS;
      else if (!event.ctrlKey && !event.metaKey) isModifierHeldForZoom = false;
    };
    let onWindowBlur = () => {
      isModifierHeldForZoom = false;
    };
    let onTouchPointer = (event?: Dynamic) => {
      if ('touches' in event) return void (event.touches.length === 0 && touchPointers.clear());
      if (event.pointerType !== 'touch') return;
      if (event.type === 'pointerup') return void touchPointers.delete(event.pointerId);
      if (event.isPrimary) touchPointers.clear();
      return void touchPointers.add(event.pointerId);
    };
    let onGesture = (event?: Dynamic) => {
      if (touchPointers.size === 0 || event.currentTarget !== overGrid) event.preventDefault();
      if (touchPointers.size > 0) {
        if (isGestureEvent(event) && event.scale > 0) zoomAtGestureStart = gridZoom.now() / event.scale;
        gestureRun = zoomAsked(gridZoom.now());
        return;
      }
      lastGestureAt = event.type === 'gestureend' ? Number.NEGATIVE_INFINITY : event.timeStamp;
      if (event.type === 'gestureend') return;
      if (event.type === 'gesturestart') {
        zoomAtGestureStart = gridZoom.now();
        gestureRun = zoomAsked(zoomAtGestureStart);
      } else if (isGestureEvent(event)) {
        gestureRun = zoomAskedTimes(gestureRun, zoomAtGestureStart * event.scale);
        zoomToEvent(zoomShown(gestureRun), event);
      }
    };
    for (let target of targets as Dynamic)
      target.addEventListener('wheel', onWheel, {
        capture: true,
        passive: false,
      });
    let gestureEvents = ['gesturestart', 'gesturechange', 'gestureend'];
    for (let target of targets as Dynamic)
      for (let eventName of gestureEvents as Dynamic)
        target.addEventListener(eventName, onGesture, {
          passive: false,
        });
    let pointerEvents = ['pointerdown', 'pointerup', 'touchend', 'touchcancel'];
    for (let target of pointerEvents as Dynamic) defaultView.addEventListener(target, onTouchPointer, true);
    for (let target of ['keydown', 'keyup'] as Dynamic) defaultView.addEventListener(target, onModifierKey, true);
    defaultView.addEventListener('blur', onWindowBlur);
    return () => {
      for (let target of targets as Dynamic) {
        target.removeEventListener('wheel', onWheel, true);
        for (let eventName of gestureEvents as Dynamic) target.removeEventListener(eventName, onGesture);
      }
      for (let target of pointerEvents as Dynamic) defaultView.removeEventListener(target, onTouchPointer, true);
      for (let target of ['keydown', 'keyup'] as Dynamic) defaultView.removeEventListener(target, onModifierKey, true);
      defaultView.removeEventListener('blur', onWindowBlur);
    };
  }, [gridRef, overGridRef, gridZoom]);
}
export const wheelZoomFactor = (wheelDelta?: Dynamic) => Math.min(1.25, Math.max(0.8, Math.exp(-wheelDelta * 0.01)));
export const isZoomModifier = ({ ctrlKey: ctrlKey, metaKey: metaKey, altKey: altKey, shiftKey: shiftKey }: Dynamic) =>
  (ctrlKey || metaKey) && !altKey && !shiftKey;
export const WHEEL_LINE_PIXELS = 16;
export const GESTURE_WHEEL_GUARD_MS = 1000;
export const ZOOM_WHEEL_RUN_MS = 200;
export const isPinchWheelContinuing = (isPageFocused?: Dynamic, wheelEvent?: Dynamic, lastWheel?: Dynamic) =>
  !isPageFocused &&
  wheelEvent.timeStamp - lastWheel.timeStamp <= ZOOM_WHEEL_RUN_MS &&
  (!wheelEvent.ctrlKey || (wheelEvent.deltaY * lastWheel.deltaY >= 0 && Math.abs(wheelEvent.deltaY) <= Math.abs(lastWheel.deltaY)));
export const zoomAsked = (askedZoom?: Dynamic) => ({
  asked: askedZoom,
  isAway: !isNearFullZoom(askedZoom),
});
export const zoomAskedTimes = ({ isAway: isAway }: Dynamic, nextZoom?: Dynamic) => {
  let clampedZoom = clampZoom(nextZoom);
  return {
    asked: clampedZoom,
    isAway: isAway || !isNearFullZoom(clampedZoom),
  };
};
export const zoomShown = ({ asked: asked, isAway: isAway }: Dynamic) => (isAway && isNearFullZoom(asked) ? 1 : asked);
export const isGestureEvent = (gestureEvent?: Dynamic) =>
  'scale' in gestureEvent &&
  typeof gestureEvent.scale === 'number' &&
  'clientX' in gestureEvent &&
  typeof gestureEvent.clientX === 'number' &&
  'clientY' in gestureEvent &&
  typeof gestureEvent.clientY === 'number';
