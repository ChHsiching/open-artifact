import { useUiWindow } from '../kit/theme.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
export function createPlanArrivalFlash({ afterMs: afterMs, atNextFrame: atNextFrame, onChange: onChange }: Dynamic) {
  let lastDrawn: Dynamic = null;
  let cancelFlash: Dynamic = null;
  let flash = () => {
    let wasOn = cancelFlash !== null;
    cancelFlash?.();
    cancelFlash = atNextFrame(() => {
      cancelFlash = afterMs(PLAN_ARRIVAL_FLASH_MS, () => {
        cancelFlash = null;
        onChange(false);
      });
    });
    if (!wasOn) onChange(true);
  };
  return {
    drawn(drawnState?: Dynamic) {
      let isSame =
        lastDrawn?.isOpen === drawnState.isOpen &&
        lastDrawn.isAwaited === drawnState.isAwaited &&
        lastDrawn.plansHeardCount === drawnState.plansHeardCount &&
        !(lastDrawn.isWishOut && !drawnState.isWishOut);
      lastDrawn = drawnState;
      if (drawnState.isOpen && !isSame) flash();
    },
    isOn: () => cancelFlash !== null,
    stop() {
      cancelFlash?.();
      cancelFlash = null;
      lastDrawn = null;
    },
  };
}
export function usePlanArrivalFlash({
  isOpen: isOpen,
  isAwaited: isAwaited,
  isWishOut: isWishOut,
  plansHeardCount: plansHeardCount,
}: Dynamic) {
  let pageWindow = useUiWindow();
  let [isOn, setOn] = React.useState(false);
  let flash = React.useMemo(
    () =>
      pageWindow === undefined
        ? null
        : createPlanArrivalFlash({
            afterMs: (ms?: Dynamic, callback?: Dynamic) => {
              let timer = pageWindow.setTimeout(callback, ms);
              return () => pageWindow.clearTimeout(timer);
            },
            atNextFrame: (callback?: Dynamic) => {
              let frame = pageWindow.requestAnimationFrame(callback);
              return () => pageWindow.cancelAnimationFrame(frame);
            },
            onChange: setOn,
          }),
    [pageWindow],
  );
  React.useEffect(() => () => flash?.stop(), [flash]);
  React.useLayoutEffect(() => {
    flash?.drawn({
      isOpen: isOpen,
      isAwaited: isAwaited,
      isWishOut: isWishOut,
      plansHeardCount: plansHeardCount,
    });
  }, [flash, isOpen, isAwaited, isWishOut, plansHeardCount]);
  let isOnNow = React.useCallback(() => flash?.isOn() ?? false, [flash]);
  return React.useMemo(
    () => ({
      isOn: isOn,
      isOnNow: isOnNow,
    }),
    [isOn, isOnNow],
  );
}
export const PLAN_ARRIVAL_FLASH_MS = 400;
