import type { Dynamic } from '../dynamic.ts';
export function stopReplayedKeydowns(target?: Dynamic, isTargetOurs?: Dynamic) {
  let onKeydown = (event?: Dynamic) => {
    if (Reflect.get(event, 'isReplay') === true && isTargetOurs(event.target)) event.stopPropagation();
  };
  target.addEventListener('keydown', onKeydown, true);
}
