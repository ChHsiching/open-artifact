import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { CopiedRowsDrawing, clippedBoxStyle } from '../grid/grid-drawing.ts';
import { FilterButtonsLayer } from './filter-buttons-layer.ts';
import { useLingeringValue } from '../agent/done-by-agent.ts';
export function useHasScrolledWhileHeld(scroll?: Dynamic, place?: Dynamic) {
  let [seen, setSeen] = React.useState({
    scroll: scroll,
    place: place,
    hasScrolled: false,
  });
  if (scroll === seen.scroll && place === seen.place) return seen.hasScrolled;
  let hasScrolled = seen.scroll !== null && scroll !== seen.scroll;
  setSeen({
    scroll: scroll,
    place: place,
    hasScrolled: hasScrolled,
  });
  return hasScrolled;
}
export function CellsOfCopy({ part: part, className: className, body: body, density: density }: Dynamic) {
  return jsx('div', {
    className: 'sheet-cells-of-copy',
    children: jsxs('div', {
      className: className,
      style: {
        position: 'absolute',
        left: -body.left,
        top: -body.top,
        width: body.left + part.width,
      },
      children: [
        jsx(CopiedRowsDrawing, {
          rows: part.rows,
          borderLines: part.borderLines,
          body: body,
          density: density,
        }),
        jsx(FilterButtonsLayer, {
          buttons: part.filterButtons,
          filteredTablesDrawn: NO_TABLES_DRAWN_ON_COPY,
          pointedAt: null,
          body: body,
          onListAsked: doNothingOnCopy,
          onGoingWithCaret: doNothingOnCopy,
        }),
      ],
    }),
  });
}
export function CellsHeld({ held: held, body: body, density: density }: Dynamic) {
  let bodyBox = React.useMemo(
    () => ({
      left: body.left,
      top: body.top,
      width: body.width,
      height: body.height,
    }),
    [body.left, body.top, body.width, body.height],
  );
  let lingering = useLingeringValue(held);
  let [firstPane] = lingering?.shown.panes ?? [];
  let hasScrolled = useHasScrolledWhileHeld(
    lingering?.shown.scroll ?? null,
    firstPane === undefined ? null : `${firstPane.at.left} ${firstPane.at.top}`,
  );
  let [heldAtStart, setHeldAtStart] = React.useState(held);
  if ((held === null) !== (heldAtStart === null)) setHeldAtStart(held);
  if (lingering === null) return null;
  let { shown: shown, isLeaving: isLeaving } = lingering;
  let { homeAt: homeAt, home: home, handle: handle } = shown;
  let bodyCorner = {
    left: bodyBox.left,
    top: bodyBox.top,
  };
  let comesFrom = (at?: Dynamic, landingAt?: Dynamic) =>
    shown === heldAtStart
      ? {
          left: at.left - landingAt.left + homeAt.left,
          top: at.top - landingAt.top + homeAt.top,
        }
      : at;
  return jsxs('div', {
    'aria-hidden': true,
    inert: true,
    className: 'sheet-cells-held',
    'data-is-leaving': isLeaving || undefined,
    'data-has-scrolled': hasScrolled || undefined,
    children: [
      home !== null &&
        !isLeaving &&
        jsx('div', {
          className: 'sheet-home-of-cells-held',
          style: clippedBoxStyle(home, bodyBox),
        }),
      shown.panes.map(
        ({ key: key, showsIn: showsIn, landingAt: landingAt, at: at, part: part, headerKept: headerKept }: Dynamic) =>
          jsxs(
            'div',
            {
              className: 'sheet-pane-of-copy',
              style: {
                clipPath: `inset(${bodyBox.top + showsIn.top}px ${bodyBox.width - showsIn.left - showsIn.width}px ${bodyBox.height - showsIn.top - showsIn.height}px ${bodyBox.left + showsIn.left}px)`,
              },
              children: [
                jsx('div', {
                  className: 'sheet-copy-of-held-cells',
                  'data-is-table': shown.isTable || undefined,
                  style: {
                    ...bodyCorner,
                    width: part.width,
                    height: part.height,
                    ...copyPlaceStyle(at, comesFrom(at, landingAt)),
                  },
                  children: jsx(CellsOfCopy, {
                    part: part,
                    body: bodyBox,
                    density: density,
                  }),
                }),
                headerKept !== null &&
                  jsx('div', {
                    className: 'sheet-header-kept-of-copy',
                    style: {
                      ...bodyCorner,
                      width: headerKept.part.width,
                      height: headerKept.part.height,
                      ...copyPlaceStyle({
                        left: at.left,
                        top: headerKept.top,
                      }),
                    },
                    children: jsx(CellsOfCopy, {
                      className: 'sheet-header-kept-cells',
                      part: headerKept.part,
                      body: bodyBox,
                      density: density,
                    }),
                  }),
              ],
            },
            key,
          ),
      ),
      handle !== null &&
        firstPane !== undefined &&
        jsx('div', {
          className: 'sheet-handle-of-table',
          'data-is-on-copy': true,
          'data-is-over-row-number': handle.isAtRowNumbers ? 'plain' : undefined,
          style: {
            ...bodyCorner,
            width: handle.width,
            height: handle.height,
            ...copyPlaceStyle(handle, comesFrom(handle, firstPane.landingAt)),
          },
        }),
    ],
  });
}
export const NO_TABLES_DRAWN_ON_COPY: Dynamic = [];
export const doNothingOnCopy = () => {};
export const copyPlaceStyle = (at?: Dynamic, comesFrom: Dynamic = at) => ({
  '--sheet-place-of-copy': `${at.left}px ${at.top}px`,
  '--sheet-copy-comes-from': `${comesFrom.left}px ${comesFrom.top}px`,
});
