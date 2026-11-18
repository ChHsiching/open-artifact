import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { pointInZoomedElement } from '../grid/zoom.ts';
import { NO_FLAGS_HIDDEN } from './flags-at-pointer.ts';
export function useNameFlagsAtPointer({ store: store, drawn: drawn, gridRef: gridRef, zoom: zoom }: Dynamic) {
  let pointerRef = React.useRef(null);
  let [flagsAtPointer, setFlagsAtPointer] = React.useState(NO_NAME_FLAGS_AT_POINTER);
  let hasFlagsOrMarks = drawn.nameFlagsOfOthers.length + drawn.marksOnChangesByAgent.length > 0;
  let lookAtPointer = React.useCallback(() => {
    let [pointer, grid] = [pointerRef.current, gridRef.current];
    let flagsNow =
      pointer === null || grid === null || !hasFlagsOrMarks
        ? NO_NAME_FLAGS_AT_POINTER
        : store.nameFlagsByPointer(pointInZoomedElement(grid, zoom, pointer));
    setFlagsAtPointer((flagsBefore?: Dynamic) => (JSON.stringify(flagsBefore) === JSON.stringify(flagsNow) ? flagsBefore : flagsNow));
  }, [store, gridRef, zoom, hasFlagsOrMarks]);
  React.useLayoutEffect(lookAtPointer, [lookAtPointer, drawn]);
  let pointerMovedTo = React.useCallback(
    (pointerEvent?: Dynamic) => {
      pointerRef.current =
        pointerEvent === null
          ? null
          : {
              clientX: pointerEvent.clientX,
              clientY: pointerEvent.clientY,
            };
      lookAtPointer();
    },
    [lookAtPointer],
  );
  return {
    ...flagsAtPointer,
    pointerMovedTo: pointerMovedTo,
  };
}
export const NO_NAME_FLAGS_AT_POINTER = {
  cornerOnTop: null,
  cornersCalledUp: [],
  flagsHidden: NO_FLAGS_HIDDEN,
};
