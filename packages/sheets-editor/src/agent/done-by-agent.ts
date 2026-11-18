import { Surface } from '../kit/surface.tsx';
import { UiRoot } from '../kit/theme.tsx';
import { useReducedMotion } from '../kit/platform.ts';
import { useUiWindow } from '../kit/theme.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { pointInZoomedElement } from '../grid/zoom.ts';
import { jsx, Fragment, jsxs } from 'react/jsx-runtime';
import { RidingRowsDrawing } from '../grid/grid-drawing.ts';
import { agentUpdatedCellsText } from '../i18n/agent-turn-labels.ts';
import { MODIFIER_KEYS } from '../state/escape.ts';
import { CELLS_AREA_SELECTOR } from '../ui/leave-cells-hint.ts';
import { PRESS_READY_DELAY_MS } from '../ui/list-under-cell.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
export function useLingeringValue(value?: Dynamic) {
  let [lingering, setLingering] = React.useState(value);
  if (value !== null && value !== lingering) setLingering(value);
  React.useEffect(() => {
    if (value !== null || lingering === null) return;
    let timer = setTimeout(() => setLingering(null), CARD_LINGER_MS);
    return () => clearTimeout(timer);
  }, [value, lingering]);
  return lingeringShown(lingering, value);
}
export function cellOfGripPressed(target: Dynamic, { headingsOfColumns: headingsOfColumns }: Dynamic) {
  let key = (target instanceof Element ? target.closest(`[${GRIP_OF_HEADING_ATTRIBUTE}]`) : null)?.getAttribute(GRIP_OF_HEADING_ATTRIBUTE);
  return headingsOfColumns.find((heading?: Dynamic) => heading.key === key)?.cell;
}
export function headingKeyCalledAt(point: Dynamic, { headingsOfColumns: headingsOfColumns, body: body }: Dynamic, calledBefore?: Dynamic) {
  let [x, y] = [point.x - body.left, point.y - body.top];
  let calledHeading = headingsOfColumns.find(({ key: key }: Dynamic) => key === calledBefore);
  if (calledHeading !== undefined) {
    let grip = gripPlaceOfHeading(calledHeading);
    if (x >= grip.left && x < grip.left + COLUMN_GRIP_WIDTH && y >= grip.top && y < grip.top + COLUMN_GRIP_HEIGHT) return calledBefore;
  }
  return (
    headingsOfColumns.find(
      ({ left: left, top: top, width: width, height: height }: Dynamic) => x >= left && x < left + width && y >= top && y < top + height,
    )?.key ?? null
  );
}
export function useColumnGripCalled({ drawn: drawn, gridRef: gridRef, zoom: zoom }: Dynamic) {
  let pointerRef = React.useRef(null);
  let [calledFor, setCalledFor] = React.useState(null);
  let updateCalled = React.useCallback(() => {
    let [pointer, grid] = [pointerRef.current, gridRef.current];
    let isNone = pointer === null || grid === null || drawn.headingsOfColumns.length === 0;
    setCalledFor(
      (calledBefore?: Dynamic) => (isNone ? null : headingKeyCalledAt(pointInZoomedElement(grid, zoom, pointer), drawn, calledBefore)),
    );
  }, [drawn, gridRef, zoom]);
  React.useLayoutEffect(updateCalled, [updateCalled]);
  let pointerMovedTo = React.useCallback(
    (event?: Dynamic) => {
      pointerRef.current =
        event === null
          ? null
          : {
              clientX: event.clientX,
              clientY: event.clientY,
            };
      updateCalled();
    },
    [updateCalled],
  );
  return {
    calledFor: calledFor,
    pointerMovedTo: pointerMovedTo,
  };
}
export function ColumnGrips({ grid: { headingsOfColumns: headingsOfColumns, body: body }, calledFor: calledFor }: Dynamic) {
  return jsx(Fragment, {
    children: headingsOfColumns.map((heading?: Dynamic) => {
      let isCalled = heading.key === calledFor;
      let { left: left, top: top } = gripPlaceOfHeading(heading);
      return jsxs(
        React.Fragment,
        {
          children: [
            jsx('div', {
              'aria-hidden': true,
              className: 'sheet-grip-of-column',
              'data-is-called': isCalled ? '' : undefined,
              ...(isCalled && {
                [GRIP_OF_HEADING_ATTRIBUTE]: heading.key,
              }),
              style: {
                left: body.left + left,
                top: body.top + top,
              },
            }),
            jsx('div', {
              'aria-hidden': true,
              className: 'sheet-extent-of-column',
              style: {
                left: body.left + heading.left,
                width: heading.width,
                top: body.top + heading.extent.from,
                height: heading.extent.to - heading.extent.from,
              },
            }),
          ],
        },
        heading.key,
      );
    }),
  });
}
export function useColumnsMovedAnimation(columnsRiding?: Dynamic, gridRef?: Dynamic) {
  let isReducedMotion = useReducedMotion();
  let previousRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let [previous, grid] = [previousRef.current, gridRef.current];
    previousRef.current = columnsRiding;
    if (previous === null || columnsRiding === null || grid === null || previous.key !== columnsRiding.key) return;
    if (isReducedMotion) return;
    let leftBefore = new Map(previous.order.map(({ holdsCellsOf: holdsCellsOf, left: left }: Dynamic) => [holdsCellsOf, left]));
    let moves = columnsRiding.order.flatMap(({ columnIndex: columnIndex, holdsCellsOf: holdsCellsOf, left: left }: Dynamic) => {
      let by = (leftBefore.get(holdsCellsOf) ?? left) - left;
      return by === 0
        ? []
        : [
            {
              columnIndex: columnIndex,
              by: by,
            },
          ];
    });
    if (moves.length === 0) return;
    for (let row of grid.querySelectorAll('.sheet-row')) {
      let rowIndex = Number(row.getAttribute('aria-rowindex')) - 2;
      if (rowIndex < columnsRiding.firstRowIndex || rowIndex > columnsRiding.lastRowIndex) continue;
      if (row.closest('.sheet-columns-riding') !== null) continue;
      for (let { columnIndex: columnIndex, by: by } of moves)
        row.querySelector(`:scope > [aria-colindex="${columnIndex + 2}"]:not([data-is-in-hand])`)?.animate(
          [
            {
              transform: `translateX(${by}px)`,
            },
            {
              transform: 'none',
            },
          ],
          COLUMNS_RIDE_ANIMATION,
        );
    }
  }, [columnsRiding, gridRef, isReducedMotion]);
}
export function ColumnsRiding({
  grid: { columnsRiding: columnsRiding, body: body, density: density },
  gridRef: gridRef,
  zoom: zoom,
}: Dynamic) {
  useColumnsMovedAnimation(columnsRiding, gridRef);
  let lingeringRiding = useLingeringValue(columnsRiding);
  let copyRef = React.useRef(null);
  let pointerXRef = React.useRef(null);
  let bodyLeft = body.left;
  let placeCopy = React.useCallback(() => {
    let [copy, pointerX] = [copyRef.current, pointerXRef.current];
    if (copy === null || columnsRiding === null) return;
    let left =
      pointerX === null
        ? columnsRiding.homeLeft
        : Math.max(
            columnsRiding.leastLeft,
            Math.min(pointerX - columnsRiding.gripFromLeft - bodyLeft, columnsRiding.endOfRun - columnsRiding.room.width),
          );
    copy.style.translate = `${left - columnsRiding.room.left}px 0`;
  }, [bodyLeft, columnsRiding]);
  React.useLayoutEffect(placeCopy, [placeCopy]);
  let placeCopyRef = React.useRef(placeCopy);
  React.useLayoutEffect(() => void (placeCopyRef.current = placeCopy), [placeCopy]);
  let ridingKey = columnsRiding?.key ?? null;
  React.useEffect(() => {
    let grid = gridRef.current;
    let view = grid?.ownerDocument.defaultView ?? null;
    if (ridingKey === null || grid === null || view === null) return;
    pointerXRef.current = null;
    let onPointerMove = (event?: Dynamic) => {
      pointerXRef.current = pointInZoomedElement(grid, zoom, event).x;
      placeCopyRef.current();
    };
    view.addEventListener('pointermove', onPointerMove, true);
    return () => view.removeEventListener('pointermove', onPointerMove, true);
  }, [ridingKey, gridRef, zoom]);
  let bodyBox = React.useMemo(
    () => ({
      left: body.left,
      top: body.top,
      width: body.width,
      height: body.height,
    }),
    [body.left, body.top, body.width, body.height],
  );
  if (lingeringRiding === null) return null;
  let { shown: shown, isLeaving: isLeaving } = lingeringRiding;
  let { room: room, rows: rows, borderLines: borderLines } = shown;
  let roomBox = {
    left: bodyBox.left + room.left,
    top: bodyBox.top + room.top,
    width: room.width,
    height: room.height,
  };
  return jsxs('div', {
    'aria-hidden': true,
    inert: true,
    className: 'sheet-columns-riding',
    'data-is-leaving': isLeaving || undefined,
    children: [
      !isLeaving &&
        jsx('div', {
          className: 'sheet-room-for-columns-riding',
          style: roomBox,
        }),
      jsxs('div', {
        ref: copyRef,
        className: 'sheet-copy-of-columns-riding',
        style: {
          ...roomBox,
          ...(isLeaving && {
            translate: '0 0',
          }),
        },
        children: [
          jsx('div', {
            className: 'sheet-cells-of-columns-riding',
            children: jsx('div', {
              style: {
                position: 'absolute',
                left: -bodyBox.left,
                top: -bodyBox.top,
                width: bodyBox.left + room.width,
              },
              children: jsx(RidingRowsDrawing, {
                rows: rows,
                borderLines: borderLines,
                body: bodyBox,
                density: density,
              }),
            }),
          }),
          jsx('div', {
            className: 'sheet-grip-of-column',
            'data-is-called': '',
            'data-is-held': '',
            style: {
              left: room.width / 2 - COLUMN_GRIP_WIDTH / 2,
              top: -COLUMN_GRIP_HEIGHT / 2,
            },
          }),
        ],
      }),
    ],
  });
}
export function DoneByAgentCard({ done: done }: Dynamic) {
  let lingeringDone = useLingeringValue(done);
  if (lingeringDone === null) return null;
  return jsx(UiRoot, {
    density: 'comfortable',
    children: jsx(Surface, {
      'aria-hidden': true,
      elevation: 'panel',
      className: 'sheet-done-by-agent',
      'data-is-leaving': lingeringDone.isLeaving || undefined,
      children: jsx('span', {
        className: 'text-secondary',
        children: agentUpdatedCellsText(lingeringDone.shown),
      }),
    }),
  });
}
export function watchPersonActs(doc?: Dynamic, onAct?: Dynamic) {
  let lastPointerAt: Dynamic = null;
  let onEvent = (event?: Dynamic) => {
    let { type: type, screenX: screenX, screenY: screenY, key: key = '' } = event;
    let [pointerBefore, pointerNow] = [lastPointerAt, `${screenX} ${screenY}`];
    if (type === 'pointermove') lastPointerAt = pointerNow;
    if (type === 'keydown' && MODIFIER_KEYS.has(key)) return;
    let isInCells = event.target?.matches?.(CELLS_AREA_SELECTOR) === true;
    if (type !== 'pointermove' || (pointerBefore !== null && pointerBefore !== pointerNow)) onAct(true, type === 'keydown' && isInCells);
  };
  let onGone = () => {
    lastPointerAt = null;
    onAct(false, false);
  };
  let onMouseLeave = () => {
    if (!doc.hasFocus()) onGone();
  };
  let onVisibilityChange = () => {
    if (doc.visibilityState === 'hidden') onGone();
  };
  for (let eventType of PERSON_ACT_EVENTS) doc.addEventListener(eventType, onEvent, PERSON_ACT_LISTEN_OPTIONS);
  doc.addEventListener('visibilitychange', onVisibilityChange);
  doc.documentElement.addEventListener('mouseleave', onMouseLeave);
  doc.defaultView?.addEventListener('blur', onGone);
  return () => {
    for (let eventType of PERSON_ACT_EVENTS) doc.removeEventListener(eventType, onEvent, PERSON_ACT_LISTEN_OPTIONS);
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    doc.documentElement.removeEventListener('mouseleave', onMouseLeave);
    doc.defaultView?.removeEventListener('blur', onGone);
  };
}
export function takePressesAfterDelay(element?: Dynamic, view?: Dynamic) {
  element.removeAttribute('data-takes-presses');
  let timer: Dynamic;
  let frame = view.requestAnimationFrame(() => {
    timer = view.setTimeout(() => element.setAttribute('data-takes-presses', ''), PRESS_READY_DELAY_MS);
  });
  return () => {
    view.cancelAnimationFrame(frame);
    view.clearTimeout(timer);
  };
}
export function UndoAgentTurnCard({ offer: offer, ...cardProps }: Dynamic) {
  let lingeringOffer = useLingeringValue(offer);
  if (lingeringOffer === null) return null;
  return jsx(UiRoot, {
    density: 'comfortable',
    children: jsx(
      UndoAgentTurnSurface,
      {
        offer: lingeringOffer.shown,
        isLeaving: lingeringOffer.isLeaving,
        ...cardProps,
      },
      lingeringOffer.shown.key,
    ),
  });
}
export function UndoAgentTurnSurface({
  ref: ref,
  offer: offer,
  isLeaving: isLeaving,
  isBeingTaken: isBeingTaken,
  onTaken: onTaken,
  onKeyDown: onKeyDown,
  onLeftAlone: onLeftAlone,
  wait: wait,
  ...restProps
}: Dynamic) {
  let { title: title, undoLabel: undoLabel } = offer;
  let undoButtonRef = React.useRef(null);
  let titleId = React.useId();
  let onGoneWithKeyboard = React.useEffectEvent(restProps.onGoneWithKeyboard);
  let onSeenLongEnough = React.useEffectEvent(restProps.onSeenLongEnough);
  let [actCount, setActCount] = React.useState(null);
  let [isPointerIn, setIsPointerIn] = React.useState(false);
  let [isFocusIn, setIsFocusIn] = React.useState(false);
  React.useEffect(() => {
    let doc = undoButtonRef.current?.ownerDocument;
    if (doc === undefined) return;
    return watchPersonActs(doc, (...act: Dynamic[]) => setActCount((count?: Dynamic) => nextActCount(count, ...act)));
  }, []);
  let stillCount = actCountUnlessHeld(actCount, isPointerIn, isFocusIn, isBeingTaken, isLeaving);
  let view = useUiWindow();
  React.useEffect(() => {
    if (stillCount === null || wait === null || view === undefined) return;
    let timer = view.setTimeout(() => onSeenLongEnough(wait), wait.ms);
    return () => view.clearTimeout(timer);
  }, [stillCount, wait, view]);
  React.useLayoutEffect(() => {
    let undoButton = undoButtonRef.current;
    let tellIfCaretGone = () => {
      if (undoButton !== null && undoButton === undoButton.ownerDocument.activeElement) onGoneWithKeyboard();
    };
    if (isLeaving) tellIfCaretGone();
    return tellIfCaretGone;
  }, [isLeaving]);
  return jsx(Surface, {
    ref: ref,
    elevation: 'panel',
    className: 'sheet-done-by-agent',
    'data-has-undo': true,
    'data-is-leaving': isLeaving || undefined,
    onKeyDown: onKeyDown,
    onPointerEnter: () => setIsPointerIn(true),
    onPointerLeave: () => {
      setIsPointerIn(false);
      onLeftAlone();
    },
    onFocus: () => setIsFocusIn(true),
    onBlur: () => {
      setIsFocusIn(false);
      onLeftAlone();
    },
    children: jsxs('div', {
      className: 'contents',
      inert: isLeaving,
      children: [
        jsx('span', {
          id: titleId,
          className: 'text-secondary',
          children: title,
        }),
        jsx(Button, {
          ref: undoButtonRef,
          variant: 'ghost',
          size: 'sm',
          'aria-label': undoLabel,
          'aria-describedby': titleId,
          busy: isBeingTaken,
          onClick: ({ currentTarget: currentTarget }: Dynamic) => {
            if (currentTarget.closest('[data-takes-presses]') !== null) onTaken();
          },
          children: sheetMessages.undo(),
        }),
      ],
    }),
  });
}
export const CARD_LINGER_MS = 200;
export const lingeringShown = (lingered?: Dynamic, current?: Dynamic) =>
  current !== null
    ? {
        shown: current,
        isLeaving: false,
      }
    : lingered === null
      ? null
      : {
          shown: lingered,
          isLeaving: true,
        };
export const COLUMN_GRIP_WIDTH = 24;
export const COLUMN_GRIP_HEIGHT = 14;
export const GRIP_OF_HEADING_ATTRIBUTE = 'data-grip-of-heading';
export const gripPlaceOfHeading = ({ left: left, top: top, width: width }: Dynamic) => ({
  left: left + width / 2 - COLUMN_GRIP_WIDTH / 2,
  top: top - COLUMN_GRIP_HEIGHT / 2,
});
export const COLUMNS_RIDE_ANIMATION = {
  duration: 200,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
};
export const PERSON_ACT_EVENTS = ['pointermove', 'pointerdown', 'wheel', 'keydown'];
export const PERSON_ACT_LISTEN_OPTIONS = {
  capture: true,
  passive: true,
};
export const nextActCount = (count?: Dynamic, isActing?: Dynamic, isKeyInCells?: Dynamic) => {
  if (!isActing) return null;
  return count === null || isKeyInCells ? (count ?? 0) + 1 : count;
};
export const actCountUnlessHeld = (count?: Dynamic, ...holds: Dynamic[]) => (holds.includes(true) ? null : count);
