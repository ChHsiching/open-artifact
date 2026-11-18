import type { Dynamic } from '../dynamic.ts';
export function createFrameScheduler(window?: Dynamic, backupFrameOf?: Dynamic) {
  let cancelBackups = new Map();
  let cancelAnimationFrame = (id?: Dynamic) => {
    window.cancelAnimationFrame(id);
    cancelBackups.get(id)?.();
    cancelBackups.delete(id);
  };
  return {
    performance: window.performance,
    requestAnimationFrame(callback?: Dynamic) {
      let onFrame = (at?: Dynamic) => {
        if (!cancelBackups.has(id)) return;
        cancelAnimationFrame(id);
        callback(at);
      };
      let id = window.requestAnimationFrame(onFrame);
      return (cancelBackups.set(id, backupFrameOf(onFrame)), id);
    },
    cancelAnimationFrame: cancelAnimationFrame,
  };
}
export function frameSchedulerOf(element?: Dynamic) {
  let window = element?.ownerDocument.defaultView ?? null;
  return element === null || window === null ? null : createFrameScheduler(window, timelineFrameOf(element, window));
}
export const timelineFrameOf =
  (element?: Dynamic, { performance: performance }: Dynamic = {}) =>
  (callback?: Dynamic) => {
    if (typeof element.animate !== 'function') return () => {};
    let animation = element.animate([], {
      duration: 1,
    });
    animation.startTime = element.ownerDocument.timeline.currentTime;
    animation.onfinish = () => {
      let { currentTime: currentTime } = element.ownerDocument.timeline;
      callback(typeof currentTime === 'number' ? currentTime : performance.now());
    };
    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
  };
