import type { Dynamic } from '../dynamic.ts';
export function afterNextFrameOrTimeout(targetWindow?: Dynamic, callback?: Dynamic, timeoutMs: Dynamic = 100) {
  let hasRun: Dynamic = false;
  let runOnce = () => {
    if (hasRun) return;
    hasRun = true;
    callback();
  };
  targetWindow.requestAnimationFrame(() => void targetWindow.setTimeout(runOnce));
  targetWindow.setTimeout(runOnce, timeoutMs);
}
