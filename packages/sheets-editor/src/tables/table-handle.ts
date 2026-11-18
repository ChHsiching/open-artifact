import { useReducedMotion } from '../kit/platform.ts';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { tableHandleUnderPointer } from '../selection/move-cells.ts';
import { pointInZoomedElement } from '../grid/zoom.ts';
import { jsx, Fragment } from 'react/jsx-runtime';
export function useTableHandleCall({ drawn: drawn, gridRef: gridRef, zoom: zoom }: Dynamic) {
  let pointerRef = React.useRef(null);
  let [calledFor, setCalledFor] = React.useState(null);
  let recheck = React.useCallback(
    (hasPointerMoved2: Dynamic = false) => {
      let [pointer, grid] = [pointerRef.current, gridRef.current];
      let isNothingToCall = pointer === null || grid === null || drawn.handlesOfTables.length === 0;
      if (isNothingToCall && pointer !== null && !hasPointerMoved2) return;
      setCalledFor(
        (previous?: Dynamic) =>
          isNothingToCall ? null : tableHandleUnderPointer(pointInZoomedElement(grid, zoom, pointer), drawn, previous),
      );
    },
    [drawn, gridRef, zoom],
  );
  React.useLayoutEffect(recheck, [recheck]);
  let pointerMovedTo = React.useCallback(
    (pointer?: Dynamic) => {
      let previous = pointerRef.current;
      pointerRef.current =
        pointer === null
          ? null
          : {
              clientX: pointer.clientX,
              clientY: pointer.clientY,
            };
      recheck(previous?.clientX !== pointer?.clientX || previous?.clientY !== pointer?.clientY);
    },
    [recheck],
  );
  let menuOfHandleShut = React.useCallback(() => {
    let handle = gridRef.current?.querySelector(`[${TABLE_OF_HANDLE_ATTRIBUTE}]`);
    let tableKey = handle?.getAttribute(TABLE_OF_HANDLE_ATTRIBUTE) ?? null;
    if (handle === null || handle === undefined || tableKey === null) return;
    let { left: left, top: top, width: width, height: height } = handle.getBoundingClientRect();
    pointerRef.current = {
      clientX: left + width / 2,
      clientY: top + height / 2,
    };
    setCalledFor(tableKey);
  }, [gridRef]);
  return {
    calledFor: calledFor,
    pointerMovedTo: pointerMovedTo,
    menuOfHandleShut: menuOfHandleShut,
  };
}
export function TableHandle({
  grid: { handlesOfTables: handlesOfTables, body: body, rowsDrawn: rowsDrawn },
  calledFor: calledFor,
  isMenuOpen: isMenuOpen,
}: Dynamic) {
  let called = handlesOfTables.find(({ table: table }: Dynamic) => table.key === calledFor);
  let isMotionReduced = useReducedMotion();
  let [shownBefore, setShown] = React.useState({
    called: null,
    going: null,
  } as Dynamic);
  let shown = tableHandlesShownNext(shownBefore, called?.table.key ?? null, isMotionReduced);
  if (shown !== shownBefore) setShown(shown);
  let goingEnded = React.useCallback(
    (event?: Dynamic) => {
      if (event.propertyName === 'opacity' && event.currentTarget.hasAttribute('data-is-going')) setShown(withoutTableHandleGoing);
    },
    [setShown],
  );
  React.useEffect(() => {
    if (shown.going === null) return;
    let timer = setTimeout(() => setShown(withoutTableHandleGoing), TABLE_HANDLE_GOING_MS);
    return () => clearTimeout(timer);
  }, [shown.going]);
  let going = handlesOfTables.find(
    ({ table: table, rowNumberUnder: rowNumberUnder }: Dynamic) => table.key === shown.going && rowNumberUnder === null,
  );
  return jsx(Fragment, {
    children: handlesOfTables
      .filter((handle?: Dynamic) => handle === called || handle === going)
      .map(
        (handle?: Dynamic) =>
          jsx(
            'div',
            {
              'aria-hidden': true,
              className: 'sheet-handle-of-table',
              'data-is-beside-header-kept': handle.isBesideHeaderKept || undefined,
              'data-is-going': handle === called ? undefined : '',
              onTransitionEnd: goingEnded,
              'data-is-over-row-number': !handle.isOverRowNumbers
                ? undefined
                : rowsDrawn.some((row?: Dynamic) => row.isActive && row.rowNumber === handle.table.area.topRowIndex + 1)
                  ? 'active'
                  : 'plain',
              'data-is-menu-open': isMenuOpen && handle === called ? '' : undefined,
              ...(handle === called && {
                [TABLE_OF_HANDLE_ATTRIBUTE]: handle.table.key,
              }),
              style: {
                left: body.left + handle.left,
                top: body.top + handle.top,
                width: handle.width,
                height: handle.height,
              },
            },
            handle.table.key,
          ),
      ),
  });
}
export const TABLE_HANDLE_GOING_MS = 500;
export const TABLE_OF_HANDLE_ATTRIBUTE = 'data-table-of-handle';
export const tableKeyOfHandleAt = (target?: Dynamic) =>
  (target instanceof Element ? target.closest(`[${TABLE_OF_HANDLE_ATTRIBUTE}]`) : null)?.getAttribute(TABLE_OF_HANDLE_ATTRIBUTE) ?? undefined;
export const isAtTableHandleOverRowNumber = (target?: Dynamic) =>
  target instanceof Element && target.closest(`[${TABLE_OF_HANDLE_ATTRIBUTE}][data-is-over-row-number]`) !== null;
export const rowNumberUnderTableHandle = (
  { handlesOfTables: handlesOfTables, cellsHeld: cellsHeld }: Dynamic,
  tableKey?: Dynamic,
) =>
  handlesOfTables.find(({ table: table }: Dynamic) => table.key === tableKey)?.rowNumberUnder ?? cellsHeld?.handle?.rowNumberUnder ?? null;
export const tableHandlesShownNext = (shown?: Dynamic, called?: Dynamic, isMotionReduced?: Dynamic) => {
  if (called === shown.called) return shown;
  if (isMotionReduced)
    return {
      called: called,
      going: null,
    };
  let leaving = shown.called ?? shown.going;
  return {
    called: called,
    going: leaving === called ? null : leaving,
  };
};
export const withoutTableHandleGoing = (shown?: Dynamic) =>
  shown.going === null
    ? shown
    : {
        ...shown,
        going: null,
      };
