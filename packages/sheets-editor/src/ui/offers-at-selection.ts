import { Surface } from '../kit/surface.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { DOUBLE_TAP_GAP_MS } from '../selection/finger-taps.ts';
import { useCoarsePointer } from '../app/media-queries.ts';
import { jsx } from 'react/jsx-runtime';
import { preventMouseDownDefault } from './dom-events.ts';
import { isWithinPressGuard, isWithinClickAfterUp } from './list-under-cell.ts';
import { clipBoxToShown } from '../grid/view-boxes.ts';
import { EXPAND_BUTTON_SIZE } from '../editor/expanded-entry.ts';
import { outlineBoxInBody } from '../grid/grid-drawing.ts';
import { shortcutKeysFor } from '../keys/shortcut-list.ts';
import { stopEnterOrSpacePropagation } from '../tables/filter-buttons-layer.ts';
import { contrastingShades } from '../format/cell-colors.ts';
import { paintDataAttributes, fillPaintStyle, textPaintStyle } from '../grid/cell-drawing.ts';
import { translateMessage } from '../i18n/messages.ts';
import { swallowRestOfPress } from './press-swallow.ts';
export function focusNeighbourOffer(offer?: Dynamic, step?: Dynamic) {
  if (!(offer instanceof HTMLElement)) return;
  let offers = [...(offer.closest('.sheet-grid')?.querySelectorAll(OFFERS_AT_SELECTION_BUTTONS_SELECTOR) ?? [])];
  offers[offers.indexOf(offer) + step]?.focus({
    preventScroll: true,
  });
}
export function offersAtSelectionStyle(anchor?: Dynamic, gridBody?: Dynamic, zoom?: Dynamic) {
  if (anchor === null) return null;
  let { left: anchorLeft, middle: anchorMiddle, top: anchorTop, bottom: anchorBottom2 } = anchor;
  return {
    scale: 1 / zoom,
    transformOrigin: '0 0',
    left: gridBody.left + anchorLeft,
    top: gridBody.top + anchorMiddle,
    translate: `0 clamp(${anchorTop - anchorMiddle}px, ${-50 / zoom}%, calc(${anchorBottom2 - anchorMiddle}px - ${100 / zoom}%))`,
  };
}
export function useOffersHeldAfterPress({
  holder: holder,
  wasLastPressByMouse: wasLastPressByMouse,
  isAfterPressOnCells: isAfterPressOnCells,
}: Dynamic) {
  let [isHeld, setHeld] = React.useState(isAfterPressOnCells);
  let isLastPressByMouse = React.useEffectEvent(wasLastPressByMouse);
  React.useEffect(() => {
    let ownerDocument = holder.current?.ownerDocument;
    if (ownerDocument === undefined || !isAfterPressOnCells) return;
    if (!isLastPressByMouse()) {
      let timer = setTimeout(() => setHeld(false), DOUBLE_TAP_GAP_MS);
      return () => clearTimeout(timer);
    }
    let firstPointer: Dynamic = null;
    let onPointerMove = ({ clientX: clientX, clientY: clientY }: Dynamic) => {
      firstPointer ??= {
        x: clientX,
        y: clientY,
      };
      if (Math.hypot(clientX - firstPointer.x, clientY - firstPointer.y) <= POINTER_STILL_PX) return;
      ownerDocument.removeEventListener('pointermove', onPointerMove);
      setHeld(false);
    };
    ownerDocument.addEventListener('pointermove', onPointerMove, {
      passive: true,
    });
    return () => ownerDocument.removeEventListener('pointermove', onPointerMove);
  }, [holder, isAfterPressOnCells]);
  return isHeld && isAfterPressOnCells;
}
export function OffersAtSelection({
  grid: { body: gridBody, offersAtSelection: offersAtSelection },
  zoom: zoom,
  offers: offers,
  isHeldBack: isHeldBack,
  wasLastPressByMouse: wasLastPressByMouse,
  onCaretLost: onCaretLost,
}: Dynamic) {
  let isShown = offersAtSelection !== null && !isHeldBack && offers.length > 0;
  let [selectionPressed, setSelectionPressed] = React.useState(null);
  let isShort = !useCoarsePointer() && offersAtSelection?.isOneCell === true;
  let barStyle = isShown
    ? offersAtSelectionStyle(isShort ? offersAtSelection.besideIfShort : offersAtSelection.beside, gridBody, zoom)
    : null;
  let nthSelectionShown = isShown && barStyle !== null ? offersAtSelection.nthSelection : null;
  let caretHolderRef = React.useRef(null);
  let loseCaret = React.useEffectEvent(onCaretLost);
  let nthSelectionRef = React.useRef(nthSelectionShown);
  React.useEffect(() => {
    if (nthSelectionRef.current === nthSelectionShown) return;
    nthSelectionRef.current = nthSelectionShown;
    let caretHolder = caretHolderRef.current;
    caretHolderRef.current = null;
    if (caretHolder !== null && caretHolder.activeElement === caretHolder.body) loseCaret();
  });
  if (!isShown || barStyle === null) return null;
  return jsx(
    OffersAtSelectionBar,
    {
      comes: offersAtSelection.comes,
      isShort: isShort,
      isBackAfterOwnPress: selectionPressed === offersAtSelection.nthSelection,
      onPressed: () => setSelectionPressed(offersAtSelection.nthSelection),
      style: barStyle,
      offers: offers,
      wasLastPressByMouse: wasLastPressByMouse,
      onCaretChange: (caretHolder?: Dynamic) => void (caretHolderRef.current = caretHolder),
      onEscape: onCaretLost,
    },
    nthSelectionShown,
  );
}
export function OffersAtSelectionBar({
  comes: comes,
  isShort: isShort,
  isBackAfterOwnPress: isBackAfterOwnPress,
  onPressed: onPressed,
  style: style,
  offers: offers,
  wasLastPressByMouse: wasLastPressByMouse,
  onCaretChange: onCaretChange,
  onEscape: onEscape,
}: Dynamic) {
  let barRef = React.useRef(null);
  let guardUntilMsRef = React.useRef(0);
  let placeKeyRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let placeKey = [style.left, style.top, ...offers.map(({ label: label }: Dynamic) => label)].join();
    if (placeKey === placeKeyRef.current) return;
    let guardMs = placeKeyRef.current === null && comes === 'afterRest' ? OFFERS_AFTER_REST_GUARD_MS : 0;
    guardUntilMsRef.current = Math.max(guardUntilMsRef.current, performance.now() + guardMs);
    placeKeyRef.current = placeKey;
  });
  let pressAtMsRef = React.useRef(null);
  let isHeldAfterPress = useOffersHeldAfterPress({
    holder: barRef,
    wasLastPressByMouse: wasLastPressByMouse,
    isAfterPressOnCells: comes === 'atOnce' && !isBackAfterOwnPress,
  });
  let iconSize = 'sm';
  let gapSize = 'xxs';
  return jsx(Surface, {
    ref: barRef,
    elevation: 'popover',
    className: `sheet-offers-at-selection flex-col gap-0.5 ${isShort ? 'rounded-lg p-0.5' : 'p-1'}`,
    ...{
      [OFFERS_AT_SELECTION_ATTRIBUTE]: true,
    },
    'data-is-short': isShort || undefined,
    'data-comes': comes,
    style: isHeldAfterPress
      ? {
          ...style,
          pointerEvents: 'none',
        }
      : style,
    onMouseDown: preventMouseDownDefault,
    onFocus: ({ currentTarget: currentTarget }: Dynamic) => onCaretChange(currentTarget.ownerDocument),
    onBlur: () => onCaretChange(null),
    onKeyDownCapture: (event?: Dynamic) => {
      if (event.key === 'Escape') onEscape();
    },
    onPointerDownCapture: () => {
      let nowMs2 = performance.now();
      pressAtMsRef.current = isWithinPressGuard(guardUntilMsRef.current, nowMs2) ? nowMs2 : null;
    },
    onClickCapture: (event?: Dynamic) => {
      let pressAtMs = pressAtMsRef.current;
      pressAtMsRef.current = null;
      if (pressAtMs !== null && isWithinClickAfterUp(pressAtMs, performance.now())) event.stopPropagation();
    },
    children: offers.map(
      ({ id: id, icon: icon, label: label, canAct: canAct, whyNot: whyNot, onPress: onPress }: Dynamic) =>
        jsx(
          Button,
          {
            variant: 'ghost',
            size: isShort ? gapSize : iconSize,
            iconOnly: true,
            icon: icon(isShort ? SHORT_OFFER_ICON_SIZE : OFFER_ICON_SIZE),
            'aria-label': label,
            tooltip: canAct ? label : (whyNot ?? label),
            tooltipSide: 'right',
            'aria-disabled': !canAct,
            'aria-description': canAct ? undefined : (whyNot ?? undefined),
            className: canAct ? undefined : 'opacity-disabled',
            tabIndex: -1,
            onClick: (event?: Dynamic) => {
              onPressed();
              if (canAct) onPress(event);
            },
          },
          id,
        ),
    ),
  });
}
export function expandButtonRoomOf(box?: Dynamic) {
  let shown = clipBoxToShown(box);
  return shown.width >= 2 * EXPAND_BUTTON_SIZE && shown.height >= EXPAND_BUTTON_SIZE ? shown : null;
}
export function useEntryWidth(entryBoxRef: Dynamic, isMeasured: Dynamic, zoom: Dynamic) {
  let [width, setWidth] = React.useState(null);
  React.useLayoutEffect(() => {
    let entryBox = entryBoxRef.current;
    let win = entryBox?.ownerDocument.defaultView ?? null;
    if (!isMeasured || entryBox === null || win === null) return;
    let measure = () => setWidth(entryBox.getBoundingClientRect().width / zoom);
    measure();
    let observer = new win.ResizeObserver(measure);
    observer.observe(entryBox);
    return () => {
      observer.disconnect();
      setWidth(null);
    };
  }, [entryBoxRef, isMeasured, zoom]);
  return width;
}
export function ExpandedEntryFinishButton({ grid: { body: body, expandedEntryCard: expandedEntryCard }, onFinished: onFinished }: Dynamic) {
  if (expandedEntryCard === null) return null;
  return jsx('div', {
    className: 'sheet-expanded-entry',
    style: outlineBoxInBody(expandedEntryCard, body),
    ...{
      [EXPANDED_ENTRY_ATTRIBUTE]: '',
    },
    children: jsx(Button, {
      variant: 'ghost',
      size: 'xs',
      tabIndex: -1,
      shortcut: shortcutKeysFor('finishExpandedCell'),
      onKeyDown: stopEnterOrSpacePropagation,
      onKeyUp: stopEnterOrSpacePropagation,
      onClick: pressSwallowingRest(onFinished),
      children: expandCellMessages.finish(),
    }),
  });
}
export function ExpandButtonAtSelection({ grid: grid, entryBoxRef: entryBoxRef, zoom: zoom, isHeldBack: isHeldBack, ...rest }: Dynamic) {
  let {
    body: body,
    activeCellBox: activeCellBox,
    editorBox: editorBox,
    expandedEntryCard: expandedEntryCard,
    expandButtonStandsIn: expandButtonStandsIn,
  } = grid;
  let entryWidth = useEntryWidth(entryBoxRef, expandButtonStandsIn === 'entry', zoom);
  let box =
    expandedEntryCard ??
    (expandButtonStandsIn === 'cell' && activeCellBox !== null && !isHeldBack
      ? expandButtonRoomOf(activeCellBox)
      : expandButtonStandsIn === 'entry' && editorBox !== null && entryWidth !== null
        ? expandButtonRoomOf(entryBoxAsWide(editorBox, entryWidth, body))
        : null);
  return box === null
    ? null
    : jsx(ExpandButton, {
        grid: grid,
        of: box,
        ...rest,
      });
}
export function ExpandButton({
  grid: {
    body: body,
    editorPaints: editorPaints,
    expandedEntryCard: expandedEntryCard,
    expandButtonStandsIn: expandButtonStandsIn,
    isExpandButtonAfterPress: isExpandButtonAfterPress,
  },
  of: box,
  wasLastPressByMouse: wasLastPressByMouse,
  onPressed: onPressed,
}: Dynamic) {
  let buttonRef = React.useRef(null);
  let isHeldAfterPress = useOffersHeldAfterPress({
    holder: buttonRef,
    wasLastPressByMouse: wasLastPressByMouse,
    isAfterPressOnCells: isExpandButtonAfterPress,
  });
  let isExpanded = expandedEntryCard !== null;
  let { fill: fill } = editorPaints;
  let paints = {
    fill: fill,
    text: fill === null ? null : contrastingShades(fill),
  };
  return jsx(Button, {
    ref: buttonRef,
    variant: 'ghost',
    size: 'xxs',
    iconOnly: true,
    icon: isExpanded ? 'Collapse' : 'Expand',
    tabIndex: -1,
    className: 'sheet-expand-button',
    'aria-label': isExpanded ? expandCellMessages.collapse() : expandCellMessages.expand(),
    shortcut: shortcutKeysFor('expandCell'),
    'data-stands-in': isExpanded ? 'card' : expandButtonStandsIn,
    ...paintDataAttributes(paints),
    style: {
      ...expandButtonPlace(outlineBoxInBody(box, body), isExpanded ? EXPAND_BUTTON_CARD_INSET : 0),
      ...fillPaintStyle(paints.fill),
      ...textPaintStyle(paints.text),
      ...(isHeldAfterPress && {
        pointerEvents: 'none',
      }),
    },
    onKeyDown: stopEnterOrSpacePropagation,
    onKeyUp: stopEnterOrSpacePropagation,
    onClick: pressSwallowingRest(onPressed),
    ...{
      [EXPANDED_ENTRY_ATTRIBUTE]: '',
    },
  });
}
export const expandCellMessages = {
  expand: () =>
    translateMessage({
      defaultMessage: 'Expand cell',
      id: 'zkU0dCLYF6',
    }),
  collapse: () =>
    translateMessage({
      defaultMessage: 'Collapse cell',
      id: 'Mhm03XO/j3',
    }),
  finish: () =>
    translateMessage({
      defaultMessage: 'Done',
      id: 'jUjL/MeZiM',
    }),
};
export const OFFERS_AT_SELECTION_ATTRIBUTE = 'data-is-offers-at-selection';
export const OFFERS_AT_SELECTION_BUTTONS_SELECTOR = `[${OFFERS_AT_SELECTION_ATTRIBUTE}] button`;
export const isInOffersAtSelection = (element?: Dynamic) =>
  element instanceof Element && element.closest(`[${OFFERS_AT_SELECTION_ATTRIBUTE}]`) !== null;
export const OFFER_ICON_SIZE = 20;
export const SHORT_OFFER_ICON_SIZE = 16;
export const OFFERS_AFTER_REST_GUARD_MS = 250;
export const POINTER_STILL_PX = 3;
export const EXPANDED_ENTRY_ATTRIBUTE = 'data-is-of-expanded-entry';
export const isInExpandedEntry = (element?: Dynamic) =>
  element instanceof Element && element.closest(`[${EXPANDED_ENTRY_ATTRIBUTE}]`) !== null;
export const EXPAND_BUTTON_INSET = 3;
export const EXPAND_BUTTON_CARD_INSET = 4;
export const expandButtonPlace = ({ left: left, top: top, width: width, height: height }: Dynamic, inset?: Dynamic) => ({
  left: left + width - EXPAND_BUTTON_INSET - inset - EXPAND_BUTTON_SIZE / 2,
  top: top + Math.min(height / 2, EXPAND_BUTTON_INSET + 1 + inset + EXPAND_BUTTON_SIZE / 2),
});
export const entryBoxAsWide = (editorBox?: Dynamic, width?: Dynamic, body?: Dynamic) => ({
  ...editorBox,
  width: width - (outlineBoxInBody(editorBox, body).width - editorBox.width),
  showsIn: {
    ...editorBox.showsIn,
    width: body.width - editorBox.showsIn.left,
    height: body.height - editorBox.showsIn.top,
  },
});
export const pressSwallowingRest =
  (action?: Dynamic) =>
  (event?: Dynamic) => {
    swallowRestOfPress(event);
    action();
  };
