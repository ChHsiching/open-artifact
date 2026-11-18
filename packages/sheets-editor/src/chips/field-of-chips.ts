import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { isWithinPressGuard } from '../ui/list-under-cell.ts';
import { TAP_TOTAL_MS } from '../selection/finger-taps.ts';
import { useTextWidth, DEFAULT_CELL_FONT_STYLE, CellChip } from '../grid/cell-drawing.ts';
import { DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { removeItemLabel } from '../i18n/menu-labels.ts';
import { firstLineHeight } from '../grid/cell-metrics-values.ts';
import { isTextInputOrEntryEditor, entryEditorOf } from '../dom/entry-editor.ts';
import { preventMouseDownDefault } from '../ui/dom-events.ts';
export function isChipRemoveClickGenuine(click?: Dynamic, pointerDown?: Dynamic, fieldShownAtMs?: Dynamic) {
  if (click.detail > 1) return false;
  if (pointerDown?.pointerType === 'mouse') return !isWithinPressGuard(fieldShownAtMs, pointerDown.atMs);
  if (pointerDown !== null) return pointerDown.atMs - fieldShownAtMs > TAP_TOTAL_MS;
  if (click.pointerType === undefined) return click.atMs - fieldShownAtMs > TAP_TOTAL_MS;
  return click.pointerType === '';
}
export function FieldOfChips({
  place: place,
  mostWidth: mostWidth,
  within: within,
  chips: chips,
  onChipRemoved: onChipRemoved,
  onSized: onSized,
  typed: typed,
  hint: hint,
  children: children,
}: Dynamic) {
  let fieldRef = React.useRef(null);
  let shownAtMsRef = React.useRef(0);
  let widestSoFarRef = React.useRef(0);
  let removePressRef = React.useRef(null);
  let textWidth = useTextWidth();
  let isPlaced = place !== null;
  let { left: withinLeft, right: withinRight } = within;
  let roomWidth = withinRight - withinLeft;
  let {
    left: left,
    top: top,
    width: cellWidth,
  } = place ?? {
    left: 0,
    top: 0,
    width: 0,
  };
  let leastWidth = Math.min(cellWidth, roomWidth);
  let mostWidthInRoom = Math.min(Math.max(cellWidth, mostWidth), roomWidth);
  let measure = React.useCallback(() => {
    let field = fieldRef.current;
    if (field === null || !isPlaced) return;
    let { offsetWidth: offsetWidth, offsetHeight: offsetHeight } = field;
    let computedWidth = Number.parseFloat(field.ownerDocument.defaultView?.getComputedStyle(field).width ?? '');
    if (computedWidth > widestSoFarRef.current) {
      widestSoFarRef.current = computedWidth;
      field.style.setProperty(FIELD_WIDTH_SO_FAR_PROPERTY, `${String(computedWidth)}px`);
    }
    onSized({
      left: Math.max(withinLeft, Math.min(left, withinRight - offsetWidth)),
      top: top,
      width: offsetWidth,
      height: offsetHeight,
    });
  }, [onSized, isPlaced, left, top, withinLeft, withinRight]);
  React.useLayoutEffect(measure);
  React.useLayoutEffect(() => {
    let field = fieldRef.current;
    let defaultView = field?.ownerDocument.defaultView ?? null;
    if (field === null || defaultView === null || !isPlaced) return;
    shownAtMsRef.current = performanceNowOf(field);
    removePressRef.current = null;
    let resizeObserver = new (defaultView.ResizeObserver as Dynamic)(measure);
    resizeObserver.observe(field);
    return () => {
      resizeObserver.disconnect();
      widestSoFarRef.current = 0;
      field.style.removeProperty(FIELD_WIDTH_SO_FAR_PROPERTY);
      onSized(null);
    };
  }, [onSized, isPlaced, measure]);
  let fieldStyle =
    place === null
      ? CHIP_FIELD_HIDDEN_STYLE
      : {
          ...DEFAULT_CELL_FONT_STYLE,
          ...place.clearOfText,
          left: left,
          top: top,
          translate: `clamp(${String(withinLeft - left)}px, ${String(withinRight - left)}px - 100%, 0px)`,
          minHeight: place.height,
          alignContent: CHIPS_AT_ALIGN_CONTENT[place.chipsAt],
          '--sheet-least-width-of-field': `${String(leastWidth)}px`,
          '--sheet-most-width-of-field': `${String(mostWidthInRoom)}px`,
          '--sheet-line-over-field': `${String(place.linesBefore.y)}px`,
          '--sheet-line-before-field': `${String(place.linesBefore.x)}px`,
          '--sheet-width-of-typed': `${String(Math.ceil(Math.max(textWidth(hint, DEFAULT_CELL_FORMAT.font), typed === null ? 0 : textWidth(typed.text, typed.font))) + TYPED_WIDTH_SLACK_PX)}px`,
          ...(place.clipPath !== undefined && {
            clipPath: place.clipPath,
          }),
        };
  return jsxs('div', {
    ref: fieldRef,
    role: 'presentation',
    className: isPlaced ? 'sheet-field-of-chips' : undefined,
    style: fieldStyle,
    ...(isPlaced && CHIP_FIELD_EVENT_FENCE),
    children: [
      (isPlaced ? chips : []).map(
        ({ key: key, name: name, isGoneTo: isGoneTo, chip: chip }: Dynamic) =>
          jsx(
            'span',
            {
              className: 'sheet-field-of-chips-chip',
              'data-is-gone-to': isGoneTo || undefined,
              children: jsx(CellChip, {
                ...chip,
                after: jsx('button', {
                  type: 'button',
                  tabIndex: -1,
                  className: 'sheet-chip-remove',
                  'aria-label': removeItemLabel(name),
                  onPointerDown: ({ pointerType: pointerType, currentTarget: currentTarget }: Dynamic) => {
                    removePressRef.current = {
                      key: key,
                      atMs: performanceNowOf(currentTarget),
                      pointerType: pointerType,
                    };
                  },
                  onPointerCancel: () => {
                    removePressRef.current = null;
                  },
                  onClick: ({ detail: detail, currentTarget: currentTarget, nativeEvent: nativeEvent }: Dynamic) => {
                    let removePress = removePressRef.current?.key === key ? removePressRef.current : null;
                    removePressRef.current = null;
                    let pointerType = 'pointerType' in nativeEvent ? String(nativeEvent.pointerType) : undefined;
                    let click = {
                      detail: detail,
                      atMs: performanceNowOf(currentTarget),
                      pointerType: pointerType,
                    };
                    if (isChipRemoveClickGenuine(click, removePress, shownAtMsRef.current)) onChipRemoved(key);
                  },
                  children: jsx(Icon, {
                    name: 'X',
                    size: 'xs',
                  }),
                }),
              }),
            },
            key,
          ),
      ),
      children,
      isPlaced &&
        typed === null &&
        jsx('span', {
          'aria-hidden': true,
          className: 'sheet-field-of-chips-caret',
          'data-is-away': chips.some(({ isGoneTo: isGoneTo }: Dynamic) => isGoneTo) || undefined,
          children: hint,
        }),
    ],
  });
}
export const CHIP_FIELD_LINE_HEIGHT = firstLineHeight(DEFAULT_CELL_FORMAT.font.size);
export const CHIPS_AT_ALIGN_CONTENT = {
  top: 'flex-start',
  center: 'center',
  bottom: 'flex-end',
};
export const FIELD_WIDTH_SO_FAR_PROPERTY = '--sheet-width-of-field-so-far';
export const TYPED_WIDTH_SLACK_PX = 8;
export const performanceNowOf = (element?: Dynamic) => element.ownerDocument.defaultView?.performance.now() ?? 0;
export const stopChipFieldEvent = (input?: Dynamic) => input.stopPropagation();
export const CHIP_FIELD_EVENT_FENCE = {
  onMouseDown(event?: Dynamic) {
    if (!isTextInputOrEntryEditor(entryEditorOf(event.target))) preventMouseDownDefault(event);
    stopChipFieldEvent(event);
  },
  onPointerDown: stopChipFieldEvent,
  onPointerUp: stopChipFieldEvent,
  onPointerMove: stopChipFieldEvent,
  onClick: stopChipFieldEvent,
  onDoubleClick: stopChipFieldEvent,
  onContextMenu: stopChipFieldEvent,
};
export const CHIP_FIELD_HIDDEN_STYLE = {
  display: 'contents',
};
