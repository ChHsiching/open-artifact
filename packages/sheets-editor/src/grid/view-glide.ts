import type { Dynamic } from '../dynamic.ts';
export function createViewGlide(windowOf?: Dynamic, onMoved?: Dynamic) {
  let glides: Dynamic = [];
  let elapsedMs: Dynamic = 0;
  let lastFrameAt: Dynamic = null;
  let frame: Dynamic = null;
  let yetToGo: Dynamic = null;
  let leftAlong = (axis?: Dynamic) =>
    Math.round(
      glides.reduce(
        (total?: Dynamic, { by: by, sinceMs: sinceMs, takesMs: takesMs }: Dynamic = {}) =>
          total + by[axis] * (1 - easeInOutCubic((elapsedMs - sinceMs) / takesMs)),
        0,
      ),
    ) + 0;
  let leftToGo = () =>
    glides.length === 0
      ? null
      : {
          x: leftAlong('x'),
          y: leftAlong('y'),
        };
  let stop = () => {
    frame?.of.cancelAnimationFrame(frame.id);
    [glides, elapsedMs, lastFrameAt, frame, yetToGo] = [[], 0, null, null, null];
  };
  let askForFrame = () => {
    let window = windowOf();
    if (window === null) stop();
    else
      frame = {
        of: window,
        id: window.requestAnimationFrame(onFrame),
      };
  };
  function onFrame(at?: Dynamic) {
    frame = null;
    let sinceLast = lastFrameAt === null ? 0 : Math.max(0, at - lastFrameAt);
    lastFrameAt = at;
    elapsedMs += sinceLast;
    glides = glides.filter(({ sinceMs: sinceMs, takesMs: takesMs }: Dynamic = {}) => elapsedMs < sinceMs + takesMs);
    let before = yetToGo;
    if (glides.length === 0) stop();
    else {
      let left = leftToGo();
      if (left?.x !== before?.x || left?.y !== before?.y) yetToGo = left;
      askForFrame();
    }
    if (yetToGo !== before) onMoved();
  }
  return {
    viewMovedBy(by?: Dynamic, reach?: Dynamic, scale?: Dynamic) {
      if (windowOf() === null) return stop();
      let isBeyondReach = Math.abs(by.x) > reach.x || Math.abs(by.y) > reach.y;
      let clamped = {
        x: clampWithin(by.x, reach.x),
        y: clampWithin(by.y, reach.y),
      };
      let takesMs = glideMsOfDistance(Math.hypot(clamped.x, clamped.y) * scale);
      glides = [
        ...(isBeyondReach ? [] : glides),
        {
          by: clamped,
          sinceMs: elapsedMs,
          takesMs: takesMs,
        },
      ];
      yetToGo = leftToGo();
      if (frame === null) askForFrame();
      return;
    },
    yetToGo: () => yetToGo,
    stop: stop,
  };
}
export const glideMsOfDistance = (distance?: Dynamic) => Math.round(Math.min(900, Math.max(300, 18 * Math.sqrt(distance))));
export const easeInOutCubic = (progress?: Dynamic) => {
  let clamped = Math.min(1, Math.max(0, progress));
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2;
};
export const clampWithin = (value?: Dynamic, reach?: Dynamic) => Math.max(-reach, Math.min(reach, value));
