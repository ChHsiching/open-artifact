import { Button } from '../kit/button.tsx';
import { Icon } from '../kit/icon.tsx';
import { TooltipGroup } from '../kit/tooltip.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { filterButtonAtPoint } from './table-drawing.ts';
import { pointInZoomedElement } from '../grid/zoom.ts';
import { FILTER_BUTTON_SIZE } from './filter-buttons-place.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { isElementFocused } from './own-filter-bar-view.ts';
import { ContentsBox } from '../ui/contents-box.ts';
import { preventMouseDownDefault } from '../ui/dom-events.ts';
import { FilterButtonGround } from '../grid/grid-drawing.ts';
import { sortAndFilterMessages } from './sort-filter-labels.ts';
import { filterByColumnLabel } from './filter-messages.ts';
import { textPaintStyle, fillPaintStyle } from '../grid/cell-drawing.ts';
export function noteKeysDrawn(seenKeys?: Dynamic, list?: Dynamic) {
  seenKeys.splice(0, seenKeys.length, ...keysOfList(list));
}
export function keysNewlyDrawn(seenKeys?: Dynamic, list?: Dynamic) {
  let newKeys = list.flatMap(({ key: key }: Dynamic) => (seenKeys.includes(key) ? [] : [key]));
  return newKeys.length === 0 ? NO_KEYS_NEWLY_DRAWN : newKeys;
}
export function noteRevisionTime(revisionTimes?: Dynamic, revision?: Dynamic, atMs?: Dynamic) {
  if (revision <= (revisionTimes.at(-1)?.revision ?? 0)) return;
  revisionTimes.push({
    revision: revision,
    atMs: atMs,
  });
  if (revisionTimes.length > 50) revisionTimes.shift();
}
export function delayOfLaterOutline(
  revisionTimes: Dynamic,
  { revisionOfMark: revisionOfMark, afterMs: afterMs }: Dynamic,
  nowMs2?: Dynamic,
) {
  let markedAtMs = revisionTimes.find(({ revision: revision }: Dynamic) => revision >= revisionOfMark)?.atMs ?? nowMs2;
  let delayMs = afterMs - (nowMs2 - markedAtMs);
  return delayMs > -200 ? delayMs : null;
}
export function useFilterButtonPointedAt({ drawn: drawn, gridRef: gridRef, zoom: zoom }: Dynamic) {
  let pointerRef = React.useRef(null);
  let [pointedAt, setPointedAt] = React.useState(null);
  let lookAtPointer = React.useCallback(() => {
    let [pointer, grid] = [pointerRef.current, gridRef.current];
    let buttonPointedAt =
      pointer === null || grid === null || drawn.filterButtons.length === 0
        ? null
        : filterButtonAtPoint(pointInZoomedElement(grid, zoom, pointer), drawn);
    setPointedAt(
      (previous?: Dynamic) =>
        previous?.tableKey === buttonPointedAt?.tableKey && previous?.c === buttonPointedAt?.c ? previous : buttonPointedAt,
    );
  }, [drawn, gridRef, zoom]);
  React.useLayoutEffect(lookAtPointer, [lookAtPointer]);
  let pointerMovedTo = React.useCallback(
    (moveEvent?: Dynamic) => {
      pointerRef.current =
        moveEvent === null
          ? null
          : {
              clientX: moveEvent.clientX,
              clientY: moveEvent.clientY,
            };
      lookAtPointer();
    },
    [lookAtPointer],
  );
  return {
    pointedAt: pointedAt,
    pointerMovedTo: pointerMovedTo,
  };
}
export function filterButtonClearAtStyle({ top: top, right: right, bottom: bottom, left: left }: Dynamic) {
  let halfButton = FILTER_BUTTON_SIZE / 2;
  return {
    '--sheet-shows-above-middle': `${top + halfButton}px`,
    '--sheet-shows-right-of-middle': `${right + halfButton}px`,
    '--sheet-shows-below-middle': `${bottom + halfButton}px`,
    '--sheet-shows-left-of-middle': `${left + halfButton}px`,
  };
}
export function useKeysNewlyDrawn(list?: Dynamic) {
  let [seenKeys] = React.useState(() => keysOfList(list));
  React.useLayoutEffect(() => {
    noteKeysDrawn(seenKeys, list);
  }, [seenKeys, list]);
  return keysNewlyDrawn(seenKeys, list);
}
export function useComesInPlaceProps(comesInPlace?: Dynamic) {
  let [isComingInPlace, setIsComingInPlace] = React.useState(comesInPlace);
  return {
    'data-comes-in-place': isComingInPlace || undefined,
    onAnimationEnd: ({ target: target, currentTarget: currentTarget }: Dynamic) => {
      if (target === currentTarget) setIsComingInPlace(false);
    },
  };
}
export function ButtonThatComesInPlace({ comesInPlace: comesInPlace, ...buttonProps }: Dynamic) {
  return jsx(Button, {
    ...buttonProps,
    ...useComesInPlaceProps(comesInPlace),
  });
}
export function outlineClipPolygon(left: Dynamic, top: Dynamic, innerLeft: Dynamic, innerTop: Dynamic) {
  if (innerLeft === left && innerTop === top) return null;
  let farEdge = 'calc(100% + 100vmax)';
  return `polygon(${left}px ${top}px, ${farEdge} ${top}px, ${farEdge} ${innerTop}px, ${innerLeft}px ${innerTop}px, ${innerLeft}px ${farEdge}, ${left}px ${farEdge})`;
}
export function outlineClipPaths({
  cutAtLeft: cutAtLeft,
  cutAtTop: cutAtTop,
  frozenAcross: frozenAcross,
  frozenDown: frozenDown,
  isAtRowNumbers: isAtRowNumbers,
  isAtColumnLetters: isAtColumnLetters,
}: Dynamic) {
  let [headersLeft, headersTop] = [isAtRowNumbers ? 0 : cutAtLeft, isAtColumnLetters ? 0 : cutAtTop];
  let [clipLeft, clipTop] = [Math.max(frozenAcross, headersLeft), Math.max(frozenDown, headersTop)];
  return {
    rest: `inset(${clipTop}px -100vmax -100vmax ${clipLeft}px)`,
    overFrozen: outlineClipPolygon(headersLeft, headersTop, clipLeft, clipTop),
    overHeaders: outlineClipPolygon(cutAtLeft, cutAtTop, headersLeft, headersTop),
  };
}
export function FilterTableOutline({
  comesLater: comesLater,
  revisionsDrawn: revisionsDrawn,
  isOfFoundTable: isOfFoundTable,
  isOverFrozen: isOverFrozen,
  isOverHeaders: isOverHeaders,
  sidesCut: sidesCut,
  comesInPlace: comesInPlace,
  style: style,
}: Dynamic) {
  let [animationDelayMs] = React.useState(
    () => (comesLater === null ? null : delayOfLaterOutline(revisionsDrawn, comesLater, performance.now())),
  );
  let comesInPlaceProps = useComesInPlaceProps(comesInPlace);
  return jsx('div', {
    'aria-hidden': true,
    className: 'sheet-own-filter-outline',
    'data-is-of-found-table': isOfFoundTable,
    'data-comes-later': animationDelayMs !== null || undefined,
    ...comesInPlaceProps,
    'data-is-over-frozen': isOverFrozen,
    'data-is-over-headers': isOverHeaders,
    'data-sides-cut': sidesCut,
    style:
      animationDelayMs === null
        ? style
        : {
            ...style,
            animationDelay: `${animationDelayMs}ms`,
          },
  });
}
export const FILTER_ADD_ICON = {
  name: 'FilterAdd',
  viewBox: 16,
  paths: [
    {
      d: 'M2.625 4.375L6.375 4.375M4.625 8.875L11.375 8.875M6.125 13.375L9.875 13.375',
      strokeWidth: 1,
    },
    {
      d: 'M11.625 2.625L11.625 6.125M9.875 4.375L13.375 4.375',
      strokeWidth: 1,
    },
  ],
};
export const filterAddIconElement = jsx(Icon, {
  customIcon: FILTER_ADD_ICON,
  size: 'xs',
});
export const NO_KEYS_NEWLY_DRAWN: Dynamic = [];
export const keysOfList = (list?: Dynamic) => list.map(({ key: key }: Dynamic) => key);
export const startRevisionTimes = (revision?: Dynamic) => [
  {
    revision: revision,
    atMs: -1 / 0,
  },
];
export const stopFilterButtonEvent = (buttonEvent?: Dynamic) => buttonEvent.stopPropagation();
export const stopEnterOrSpacePropagation = (keyEvent?: Dynamic) => {
  if (keyEvent.key === 'Enter' || keyEvent.key === ' ') keyEvent.stopPropagation();
};
export const atRestMarkStyle = (mark?: Dynamic) =>
  mark === null
    ? {}
    : {
        '--sheet-mark-on-light': mark.onLight,
        '--sheet-mark-on-dark': mark.onDark,
      };
export const groundBesideButtonStyle = ({ left: left, cell: cell }: Dynamic) => ({
  '--sheet-ground-past-button': `${Math.max(0, cell.left + cell.width - 1 - left - FILTER_BUTTON_SIZE)}px`,
  '--sheet-ground-before-button': `${Math.max(0, Math.min(8, left - cell.left))}px`,
});
export const NO_FILTERED_TABLES_DRAWN: Dynamic = [];
export const FilterButtonsLayer = React.memo(function ({
  buttons: buttons,
  filteredTablesDrawn: filteredTablesDrawn,
  pointedAt: pointedAt,
  body: body,
  onListAsked: onListAsked,
  onGoingWithCaret: onGoingWithCaret,
}: Dynamic) {
  let caretGoesOnRef = React.useCallback(
    (button?: Dynamic) =>
      () => {
        if (isElementFocused(button)) onGoingWithCaret();
      },
    [onGoingWithCaret],
  );
  let tablesNewlyDrawn = useKeysNewlyDrawn(filteredTablesDrawn);
  return jsxs(ContentsBox, {
    onPointerDown: stopFilterButtonEvent,
    onMouseDown: (mouseEvent?: Dynamic) => {
      stopFilterButtonEvent(mouseEvent);
      preventMouseDownDefault(mouseEvent);
    },
    onPointerUp: stopFilterButtonEvent,
    onClick: stopFilterButtonEvent,
    onDoubleClick: stopFilterButtonEvent,
    onContextMenu: stopFilterButtonEvent,
    onKeyDown: stopEnterOrSpacePropagation,
    onKeyUp: stopEnterOrSpacePropagation,
    children: [
      buttons.map(
        ({ r: r2, c: c, heldInView: heldInView, groundsWhereHeld: groundsWhereHeld, headerKept: headerKept }: Dynamic) =>
          heldInView !== null &&
          headerKept === null &&
          jsx(
            FilterButtonGround,
            {
              box: heldInView,
              grounds: groundsWhereHeld,
              body: body,
            },
            `${r2} ${c}`,
          ),
      ),
      jsx(TooltipGroup, {
        children: buttons.map(
          ({
            tableKey: tableKey,
            r: r2,
            isOfFoundTable: isOfFoundTable,
            c: c,
            column: column,
            left: left,
            top: top,
            clearAt: clearAt,
            cell: cell,
            isOn: isOn,
            isListOpen: isListOpen,
            ink: ink,
            ground: ground,
            givesWayToText: givesWayToText,
            isInActiveCell: isInActiveCell,
            atRest: atRest,
            headerKept: headerKept,
          }: Dynamic) =>
            jsx(
              ButtonThatComesInPlace,
              {
                ref: caretGoesOnRef,
                comesInPlace: tablesNewlyDrawn.includes(tableKey),
                variant: 'ghost',
                size: 'xxs',
                iconOnly: true,
                icon: isOfFoundTable
                  ? filterAddIconElement
                  : jsx(Icon, {
                      name: 'Filter',
                      size: 'xs',
                    }),
                tabIndex: -1,
                className: 'sheet-own-filter-button',
                'aria-label': isOfFoundTable ? sortAndFilterMessages.sortAndFilter() : filterByColumnLabel(column, isOn),
                'aria-haspopup': 'dialog',
                'aria-expanded': isListOpen,
                'data-is-on': isOn || undefined,
                'data-is-of-found-table': isOfFoundTable || undefined,
                'data-gives-way-to-text': givesWayToText || undefined,
                'data-is-called-for': isInActiveCell || (pointedAt?.tableKey === tableKey && pointedAt.c === c) || undefined,
                'data-has-text-paint': ink !== null || undefined,
                'data-is-over-header-kept': headerKept !== null || undefined,
                'data-ground': ground === null ? undefined : typeof ground === 'string' ? ground : 'fill',
                style: {
                  left: body.left + left + FILTER_BUTTON_SIZE / 2,
                  top: body.top + top + FILTER_BUTTON_SIZE / 2,
                  ...filterButtonClearAtStyle(clearAt),
                  ...(givesWayToText &&
                    groundBesideButtonStyle({
                      left: left,
                      cell: cell,
                    })),
                  ...textPaintStyle(ink),
                  ...atRestMarkStyle(atRest),
                  ...fillPaintStyle(typeof ground === 'string' ? null : ground),
                },
                onClick: () =>
                  onListAsked({
                    tableKey: tableKey,
                    r: r2,
                    c: c,
                    isOfFoundTable: isOfFoundTable,
                    isListOpen: isListOpen,
                  }),
              },
              `${r2} ${c}`,
            ),
        ),
      }),
    ],
  });
});
export const FilterTableOutlines = React.memo(function ({
  outlines: outlines,
  body: body,
  areOfFoundTables: areOfFoundTables,
  latestRevisionByAgent = 0,
  filteredTablesDrawn = NO_FILTERED_TABLES_DRAWN,
}: Dynamic) {
  let [revisionTimes] = React.useState(() => startRevisionTimes(latestRevisionByAgent));
  React.useLayoutEffect(() => {
    noteRevisionTime(revisionTimes, latestRevisionByAgent, performance.now());
  }, [revisionTimes, latestRevisionByAgent]);
  let tablesNewlyDrawn = useKeysNewlyDrawn(filteredTablesDrawn);
  return jsx(Fragment, {
    children: outlines.map((outline?: Dynamic) => {
      let { tableKey: tableKey, left: left, top: top, width: width, height: height } = outline;
      let { rest: restClip, overFrozen: overFrozenClip, overHeaders: overHeadersClip } = outlineClipPaths(outline);
      let outlineStyle = {
        left: body.left + left,
        top: body.top + top,
        width: width - 1,
        height: height - 1,
        clipPath: restClip,
      };
      let outlineProps = {
        comesLater: outline.comesLater ?? null,
        revisionsDrawn: revisionTimes,
        isOfFoundTable: areOfFoundTables,
        sidesCut: outline.sidesCut ?? undefined,
        comesInPlace: tablesNewlyDrawn.includes(tableKey),
      };
      return jsxs(
        React.Fragment,
        {
          children: [
            jsx(FilterTableOutline, {
              ...outlineProps,
              style: outlineStyle,
            }),
            overFrozenClip !== null &&
              jsx(FilterTableOutline, {
                ...outlineProps,
                isOverFrozen: true,
                style: {
                  ...outlineStyle,
                  clipPath: overFrozenClip,
                },
              }),
            overHeadersClip !== null &&
              jsx(FilterTableOutline, {
                ...outlineProps,
                isOverHeaders: true,
                style: {
                  ...outlineStyle,
                  clipPath: overHeadersClip,
                },
              }),
          ],
        },
        tableKey,
      );
    }),
  });
});
