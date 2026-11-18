import { ContextMenu } from '../kit/context-menu.tsx';
import { Tooltip } from '../kit/tooltip.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
export function boundsOfRowAndMenus(side: Dynamic, { row: row, menu: menu, otherMenus: otherMenus }: Dynamic) {
  let anchorBox = side === 'beside' ? row : menu;
  let left = (Math.min as Dynamic)(anchorBox.left, ...otherMenus.map((box?: Dynamic) => box.left));
  let right = (Math.max as Dynamic)(anchorBox.right, ...otherMenus.map((box?: Dynamic) => box.right));
  if (side === 'beside')
    return {
      left: left,
      right: right,
      top: row.top,
      bottom: row.bottom,
    };
  let top = (Math.min as Dynamic)(menu.top, ...otherMenus.map((box?: Dynamic) => box.top));
  return {
    left: left,
    right: right,
    top: top,
    bottom: top,
  };
}
export function whyOffTooltipPlacement(bounds?: Dynamic) {
  let { widthOfWindow: widthOfWindow, heightOfTooltip: heightOfTooltip } = bounds;
  let { left: left, right: right } = boundsOfRowAndMenus('beside', bounds);
  let widthBeside = Math.max(left, widthOfWindow - right) - WHY_OFF_SIDE_OFFSET - WHY_OFF_EDGE_MARGIN;
  if (widthBeside >= WHY_OFF_MIN_SIDE_WIDTH)
    return {
      side: 'beside',
      mostWidth: Math.min(widthBeside, WHY_OFF_TOOLTIP_MAX_WIDTH),
    };
  if (
    boundsOfRowAndMenus('above', bounds).top - WHY_OFF_SIDE_OFFSET - WHY_OFF_EDGE_MARGIN >= heightOfTooltip &&
    widthOfWindow >= WHY_OFF_TOOLTIP_MAX_WIDTH + 2 * WHY_OFF_EDGE_MARGIN
  )
    return {
      side: 'above',
      mostWidth: WHY_OFF_TOOLTIP_MAX_WIDTH,
    };
  return widthBeside >= WHY_OFF_NARROW_SIDE_WIDTH
    ? {
        side: 'beside',
        mostWidth: widthBeside,
      }
    : null;
}
export function measureWhyOffTooltip(rowElement?: Dynamic, textElement?: Dynamic) {
  let menuElement = closestMenuElement(rowElement);
  if (rowElement === null || menuElement === null || textElement === null) return null;
  let ownerDocument = rowElement.ownerDocument;
  return {
    row: rowElement.getBoundingClientRect(),
    menu: menuElement.getBoundingClientRect(),
    otherMenus: [...ownerDocument.querySelectorAll('[role=menu]')]
      .filter((menuElement2?: Dynamic) => menuElement2 !== menuElement)
      .map((menuElement2?: Dynamic) => menuElement2.getBoundingClientRect())
      .filter((box?: Dynamic) => box.width > 0),
    widthOfWindow: ownerDocument.documentElement.clientWidth,
    heightOfTooltip: textElement.offsetHeight,
  };
}
export function WhyOffTooltipText({ mostWidth: mostWidth }: Dynamic) {
  let whyOff = React.use(WhyOffContext);
  let [lastWhyOff, setLastWhyOff] = React.useState(whyOff);
  if (whyOff !== null && whyOff !== lastWhyOff) setLastWhyOff(whyOff);
  return jsx('span', {
    ...(mostWidth < WHY_OFF_TOOLTIP_MAX_WIDTH && {
      className: 'block',
      style: {
        maxWidth: `calc(${mostWidth}px - 1rem)`,
      },
    }),
    children: whyOff ?? lastWhyOff,
  });
}
export function MenuItemWithWhyOff({ whyOff: whyOff, isPointerCoarse = false, ...itemProps }: Dynamic) {
  let describedById = React.useId();
  let rowRef = React.useRef(null);
  let textRef = React.useRef(null);
  let [positioning, setPositioning] = React.useState(DEFAULT_WHY_OFF_POSITIONING);
  let showsWhyOff = whyOff !== null && itemProps.disabled === true;
  return jsx(WhyOffContext, {
    value: whyOff,
    children: jsx(Tooltip, {
      content:
        showsWhyOff && !isPointerCoarse
          ? () => {
              let [rowElement, textElement] = [rowRef.current, textRef.current];
              let measure = () => measureWhyOffTooltip(rowElement, textElement);
              let bounds = measure();
              let placement = bounds === null ? null : whyOffTooltipPlacement(bounds);
              if (placement === null) return null;
              setPositioning(
                whyOffTooltipPositioning(placement.side, measure, placement.side === 'above' ? closestMenuElement(rowElement) : rowElement),
              );
              return jsx(WhyOffTooltipText, {
                mostWidth: placement.mostWidth,
              });
            }
          : undefined,
      multiline: true,
      closeOnClick: false,
      sideOffset: WHY_OFF_SIDE_OFFSET,
      ...positioning,
      children: jsxs('div', {
        ref: rowRef,
        role: 'none',
        children: [
          jsx(ContextMenu.Item, {
            ...itemProps,
            ...(showsWhyOff && {
              'aria-describedby': describedById,
            }),
          }),
          showsWhyOff &&
            jsx('span', {
              className: 'invisible fixed size-0 overflow-hidden',
              children: jsx('span', {
                ref: textRef,
                id: describedById,
                className: 'absolute w-max px-2 py-1.5 text-[0.8125rem]/[1.125rem] break-words',
                style: {
                  maxWidth: WHY_OFF_TOOLTIP_MAX_WIDTH,
                },
                children: whyOff,
              }),
            }),
        ],
      }),
    }),
  });
}
export const WHY_OFF_TOOLTIP_MAX_WIDTH = 240;
export const WHY_OFF_MIN_SIDE_WIDTH = 136;
export const WHY_OFF_NARROW_SIDE_WIDTH = 96;
export const WHY_OFF_SIDE_OFFSET = 4;
export const WHY_OFF_EDGE_MARGIN = 8;
export const closestMenuElement = (element?: Dynamic) => element?.closest('[role=menu]') ?? null;
export const WHY_OFF_BESIDE_COLLISION_AVOIDANCE = {
  fallbackAxisSide: 'none',
};
export const WHY_OFF_ABOVE_COLLISION_AVOIDANCE = {
  side: 'none',
  align: 'shift',
  fallbackAxisSide: 'none',
};
export const whyOffTooltipPositioning = (side?: Dynamic, boundsOf?: Dynamic, contextElement?: Dynamic) => ({
  side: side === 'above' ? 'top' : 'inline-end',
  collisionAvoidance: side === 'above' ? WHY_OFF_ABOVE_COLLISION_AVOIDANCE : WHY_OFF_BESIDE_COLLISION_AVOIDANCE,
  anchor: {
    ...(contextElement !== null && {
      contextElement: contextElement,
    }),
    getBoundingClientRect() {
      let bounds = boundsOf();
      let {
        left: left,
        right: right,
        top: top,
        bottom: bottom,
      } = bounds === null
        ? {
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
          }
        : boundsOfRowAndMenus(side, bounds);
      return {
        left: left,
        right: right,
        top: top,
        bottom: bottom,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
    },
  },
});
export const DEFAULT_WHY_OFF_POSITIONING = whyOffTooltipPositioning('beside', () => null, null);
export const WhyOffContext = React.createContext(null);
