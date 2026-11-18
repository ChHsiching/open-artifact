import { Tooltip } from '../kit/tooltip.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { SMALL_BAR_SELECTOR } from './toolbar/fold.ts';
import { MODIFIER_KEYS } from '../state/escape.ts';
import { jsx } from 'react/jsx-runtime';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { TOAST_SELECTOR } from '../shell/ui-root.ts';
export function touchPlaceOf(target?: Dynamic, isKey?: Dynamic, lastPlace?: Dynamic) {
  let holder = target.closest(TOUCH_PLACES_SELECTOR);
  let place = TOUCH_PLACES.find(([, selector]: Dynamic) => holder?.matches(selector) === true)?.[0];
  let typed = place === 'menu' ? Reflect.get(holder?.querySelector('input') ?? {}, 'value') : '';
  if (typeof typed === 'string' && typed !== '') return 'menu_search';
  let isMoreOpen = () =>
    lastPlace === 'bar_more' || (target.closest(':root')?.querySelector(`${MORE_TOOLS_SELECTOR}:not([data-ending-style])`) ?? null) !== null;
  if (place === 'bar' && target.closest(PORTAL_SELECTOR) !== null && isMoreOpen()) return 'bar_more';
  if (place === 'bar' && (target.closest(':root')?.querySelector(SMALL_BAR_SELECTOR) ?? null) !== null) return 'bar_small';
  if (place !== undefined && !(place === 'cells' && isKey)) return place;
  if (target.closest(PORTAL_SELECTOR) !== null) return lastPlace === 'cells' || lastPlace === 'key' ? 'card' : lastPlace;
  return isKey ? 'key' : 'other';
}
export function watchTouchedPlaces(win?: Dynamic, countAct?: Dynamic, isLoading?: Dynamic) {
  let lastPlace: Dynamic = 'other';
  let onEvent = (event?: Dynamic) => {
    let key = Reflect.get(event, 'key');
    if (MODIFIER_KEYS.has(String(key)) || Reflect.get(event, 'isReplay') === true) return;
    if (event.type === 'drop') lastPlace = 'dropped_file';
    else if (hasClosestMethod(event.target)) lastPlace = touchPlaceOf(event.target, key !== undefined, lastPlace);
    countAct('touched', lastPlace);
    for (let pointerType of COUNTED_POINTER_TYPES as Dynamic)
      if (Reflect.get(event, 'pointerType') === pointerType) countAct(`pointer_${pointerType}`, 'page');
    if (
      (event.type === 'pointerdown' || event.type === 'mousedown') &&
      isLoading() &&
      hasClosestMethod(event.target) &&
      event.target.closest(PLACEHOLDER_MOUNT_SELECTOR) !== null
    )
      countAct('pressed_while_loading', 'page');
  };
  for (let type of TOUCH_EVENT_TYPES as Dynamic)
    win.addEventListener(type, onEvent, {
      capture: true,
      passive: true,
    });
  win.addEventListener('message', ({ data: data }: Dynamic) => {
    if (typeof data === 'object' && data !== null && '__frame_chrome_cmd' in data) lastPlace = 'host';
  });
  return () => lastPlace;
}
export function nextToolArrowKey({ currentTarget: currentTarget, relatedTarget: relatedTarget }: Dynamic) {
  let toolbar = currentTarget.closest('[role="toolbar"]');
  if (toolbar === null || isWithinToolbarOrContextBar(toolbar, relatedTarget) || !currentTarget.matches(':focus-visible')) return null;
  return currentTarget.ownerDocument.defaultView?.getComputedStyle(toolbar).direction === 'rtl' ? 'left' : 'right';
}
export function ToolbarTooltip({ name: name, shortcut: shortcut, side: side, isShut = false, children: children }: Dynamic) {
  let [nextToolKey, setNextToolKey] = React.useState(null);
  let childProps = children.props;
  let handlers = {
    onFocus: (event?: Dynamic) => {
      childProps.onFocus?.(event);
      setNextToolKey(nextToolArrowKey(event));
    },
    onBlur: (event?: Dynamic) => {
      childProps.onBlur?.(event);
      setNextToolKey(null);
    },
    onPointerDown: (event?: Dynamic) => {
      childProps.onPointerDown?.(event);
      setNextToolKey(null);
    },
    onPointerMove: (event?: Dynamic) => {
      childProps.onPointerMove?.(event);
      setNextToolKey(null);
    },
    onKeyDownCapture: (event?: Dynamic) => {
      childProps.onKeyDownCapture?.(event);
      if (!event.repeat && event.key !== 'Shift') setNextToolKey(null);
    },
  };
  return jsx(Tooltip, {
    content: name,
    ...(shortcut !== undefined && {
      shortcut: shortcut,
    }),
    ...(nextToolKey !== null &&
      side !== 'bottom' && {
        secondaryHint: {
          label: sheetMessages.nextTool(),
          shortcut: nextToolKey,
        },
      }),
    side: side,
    hoverable: false,
    ...(isShut && {
      open: false,
    }),
    children: React.cloneElement(children, handlers),
  });
}
export const CONTEXT_BAR_PART_ATTRIBUTE = 'data-part-of-context-bar';
export const isInClosingContextBar = (element?: Dynamic) =>
  (element?.closest('[data-part-of-context-bar][data-ending-style]') ?? null) !== null;
export const isWithinToolbarOrContextBar = (toolbar?: Dynamic, relatedTarget?: Dynamic) =>
  relatedTarget !== null && (toolbar.contains(relatedTarget) || relatedTarget.closest('[data-part-of-context-bar]') !== null);
export const MORE_TOOLS_SELECTOR = `[${CONTEXT_BAR_PART_ATTRIBUTE}=more]`;
export const TOUCH_PLACES = [
  ['bar_more', MORE_TOOLS_SELECTOR],
  ['bar', '.sheet-menu-at-tool'],
  ['menu', '.sheet-menu-with-field'],
  ['bar', `.sheet-context-bar,[${CONTEXT_BAR_PART_ATTRIBUTE}]`],
  ['top', '.sheet-formula-row,.sheet-view-tools'],
  ['tabs', '.sheet-bar'],
  ['filter_bar', '.sheet-own-filter-bar'],
  ['find_box', '.sheet-find-over-grid'],
  ['first_screen', '.sheet-ways-in'],
  ['pane', 'aside'],
  ['dialog', '[data-ui=Dialog],[data-ui=ConfirmationDialog]'],
  ['toast', TOAST_SELECTOR],
  ['undo_card', '.sheet-done-by-agent'],
  ['cells', '.sheet-grid,.sheet-group-margin'],
];
export const TOUCH_PLACES_SELECTOR = TOUCH_PLACES.map(([, selector]: Dynamic) => selector).join(',');
export const PORTAL_SELECTOR = '[data-base-ui-portal]';
export const hasClosestMethod = (value?: Dynamic) => typeof value === 'object' && value !== null && 'closest' in value;
export const TOUCH_EVENT_TYPES = ['keydown', 'pointerdown', 'mousedown', 'wheel', 'drop'];
export const COUNTED_POINTER_TYPES = ['touch', 'pen'];
export const PLACEHOLDER_MOUNT_SELECTOR = '.sheet-placeholder-mount';
