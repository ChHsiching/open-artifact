import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
export function createPressGuardAfterViewMove(now?: Dynamic) {
  let viewMovedAtMs: Dynamic = null;
  let swallowedPress: Dynamic = null;
  let wasPressSwallowed: Dynamic = false;
  let isSoonAfter = (atMs?: Dynamic) => atMs !== null && now() - atMs < PRESS_AFTER_VIEW_MOVE_MS;
  let isPressSettling = () => swallowedPress !== null && now() - swallowedPress.atMs < SWALLOWED_PRESS_SETTLE_MS;
  return {
    viewMovedByItself: () => void (viewMovedAtMs = now()),
    isPressSwallowed(isPressing?: Dynamic, isOfFinger?: Dynamic) {
      let isSoonAfterMove = isSoonAfter(viewMovedAtMs);
      let isSoonAfterSwallowed = swallowedPress !== null && swallowedPress.isSoonAfterMove && isSoonAfter(swallowedPress.atMs);
      wasPressSwallowed = swallowedPress !== null;
      swallowedPress =
        isPressing && (isSoonAfterMove || isSoonAfterSwallowed)
          ? {
              atMs: now(),
              isSoonAfterMove: isSoonAfterMove,
              isOfFinger: isOfFinger,
            }
          : null;
      return swallowedPress !== null;
    },
    isRestOfPressSwallowed: () => swallowedPress !== null,
    isClickSwallowed: (isPartOfPress?: Dynamic) =>
      swallowedPress !== null && (isPartOfPress || (swallowedPress.isOfFinger && isPressSettling())),
    isDoubleClickSwallowed: () => swallowedPress !== null || wasPressSwallowed,
    isMenuSwallowed: isPressSettling,
  };
}
export function watchViewMovesByItself(store?: Dynamic, pressGuard?: Dynamic) {
  let wasGliding: Dynamic = false;
  return store.subscribe(() => {
    let { grid: grid, isFollowingAgent: isFollowingAgent, isFollowingPerson: isFollowingPerson } = store.getView();
    let isGliding = grid.yetToGlide !== null;
    if (isGliding || (wasGliding && (isFollowingAgent || isFollowingPerson))) pressGuard.viewMovedByItself();
    wasGliding = isGliding;
  });
}
export function usePressGuardAfterViewMove(store?: Dynamic, movesOfViewByItself?: Dynamic, gridRef?: Dynamic) {
  let [pressGuard] = React.useState(() => createPressGuardAfterViewMove(() => performance.now()));
  React.useEffect(() => watchViewMovesByItself(store, pressGuard), [store, pressGuard]);
  React.useLayoutEffect(() => {
    if (movesOfViewByItself === 0) return;
    pressGuard.viewMovedByItself();
    let ownWindow = gridRef.current?.ownerDocument.defaultView ?? null;
    if (ownWindow === null) return;
    let noteFollowing = () => {
      let { isFollowingAgent: isFollowingAgent, isFollowingPerson: isFollowingPerson } = store.getView();
      if (isFollowingAgent || isFollowingPerson) pressGuard.viewMovedByItself();
    };
    let frame: Dynamic = ownWindow.requestAnimationFrame(() => {
      noteFollowing();
      frame = ownWindow.requestAnimationFrame(noteFollowing);
    });
    return () => ownWindow.cancelAnimationFrame(frame);
  }, [store, pressGuard, movesOfViewByItself, gridRef]);
  return pressGuard;
}
export const PRESS_AFTER_VIEW_MOVE_MS = 500;
export const SWALLOWED_PRESS_SETTLE_MS = 1000;
