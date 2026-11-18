import type { Dynamic } from '../dynamic.ts';
export function yieldF6ToToasts(target?: Dynamic, shouldYield?: Dynamic) {
  target.addEventListener('keydown', (event?: Dynamic) => {
    if (event.key === 'F6' && shouldYield()) event.stopImmediatePropagation();
  });
}
