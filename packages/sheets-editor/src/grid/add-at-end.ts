import { TextInput } from '../kit/text-input.tsx';
import { Button } from '../kit/button.tsx';
import { Tooltip, TooltipGroup } from '../kit/tooltip.tsx';
import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { DEFAULT_LINES_TO_ADD, parseLineCount } from './lines-at-end.ts';
import { MESSAGE_LOCALE } from '../i18n/messages.ts';
import { rowsFieldTextParts, enterNumberUpToHint } from '../i18n/grid-action-labels.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
import { MENU_CARETS } from '../ui/menu-trigger.ts';
import { boxInBody } from './grid-drawing.ts';
export function focusAtEndOfSheetField(field?: Dynamic, step?: Dynamic) {
  if (!(field instanceof HTMLElement)) return false;
  let fields = [...(field.closest('.sheet-grid')?.querySelectorAll(AT_END_OF_SHEET_FIELDS) ?? [])];
  let fieldToFocus = fields[fields.indexOf(field) + step];
  fieldToFocus?.focus({
    preventScroll: true,
  });
  return fieldToFocus !== undefined;
}
export function AtEndOfSheet({
  adds: adds,
  isOutOfView: isOutOfView,
  className: className,
  style: style,
  onCaretAtEnd: onCaretAtEnd,
  onCaretLost: onCaretLost,
  children: children,
}: Dynamic) {
  let boxRef = React.useRef(null);
  let onCaretLostNow = React.useEffectEvent(onCaretLost);
  React.useLayoutEffect(() => {
    let { current: box } = boxRef;
    return () => {
      if (box?.contains(box.ownerDocument.activeElement) === true) onCaretLostNow();
    };
  }, []);
  return jsx('div', {
    ref: boxRef,
    className: className,
    ...{
      [AT_END_OF_SHEET_ATTRIBUTE]: true,
    },
    style: style,
    onFocus: () => onCaretAtEnd(adds),
    onBlur: ({ currentTarget: currentTarget, relatedTarget: relatedTarget }: Dynamic) => {
      let activeElement = isOutOfView ? currentTarget.ownerDocument.activeElement : null;
      if (!currentTarget.contains(relatedTarget ?? activeElement)) onCaretAtEnd(null, relatedTarget);
    },
    children: children,
  });
}
export function AddRowsAtFoot({ most: most, onAdd: onAdd }: Dynamic) {
  let defaultCountTyped = Math.min(DEFAULT_LINES_TO_ADD, most).toLocaleString(MESSAGE_LOCALE);
  let [countTyped, setCountTyped] = React.useState(defaultCountTyped);
  let hintId = React.useId();
  let isSelectedOnFocusRef = React.useRef(false);
  let count = parseLineCount(countTyped);
  if (count !== null && count > most) setCountTyped(most.toLocaleString(MESSAGE_LOCALE));
  let isCountInvalid = countTyped.trim() !== '' && count === null;
  let addRows = () => {
    if (count !== null) onAdd('rows', count);
  };
  let [countLimitNote, countHint] = rowsFieldTextParts(count ?? DEFAULT_LINES_TO_ADD);
  return jsxs(Fragment, {
    children: [
      jsx(Button, {
        variant: 'ghost',
        icon: 'Add',
        tabIndex: AT_END_TAB_INDEX,
        'aria-label': count === null ? undefined : sheetMessages.addRowsAtFoot(count),
        onClick: addRows,
        children: sheetMessages.add(),
      }),
      !isCountInvalid && countLimitNote,
      jsx(TextInput, {
        className: 'sheet-add-rows-count',
        fullWidth: false,
        inputMode: 'numeric',
        'aria-label': sheetMessages.rowsToAdd(),
        'aria-describedby': hintId,
        'aria-invalid': isCountInvalid,
        value: countTyped,
        onChange: ({ currentTarget: { value: typed } }: Dynamic) => {
          isSelectedOnFocusRef.current = false;
          setCountTyped(typed);
        },
        onFocus: ({ currentTarget: currentTarget }: Dynamic) => {
          currentTarget.select();
          isSelectedOnFocusRef.current = true;
        },
        onMouseUp: (event?: Dynamic) => {
          if (isSelectedOnFocusRef.current) event.preventDefault();
          isSelectedOnFocusRef.current = false;
        },
        onBlur: () => setCountTyped(count?.toLocaleString(MESSAGE_LOCALE) ?? defaultCountTyped),
        onKeyDown: ({ key: key, keyCode: keyCode, repeat: repeat, nativeEvent: nativeEvent }: Dynamic) => {
          let isComposing = nativeEvent.isComposing || keyCode === 229;
          if (key === 'Enter' && !repeat && !isComposing) addRows();
        },
      }),
      jsx('span', {
        id: hintId,
        children: isCountInvalid ? enterNumberUpToHint(most) : countHint,
      }),
      jsx(LiveAnnouncer, {
        words: isCountInvalid && enterNumberUpToHint(most),
      }),
    ],
  });
}
export function AddColumnsButtons({
  isColumnCountCardOpen: isColumnCountCardOpen,
  onAdd: onAdd,
  onColumnCountAsked: onColumnCountAsked,
}: Dynamic) {
  return jsxs(TooltipGroup, {
    children: [
      jsx(Tooltip, {
        content: sheetMessages.addColumn(),
        side: 'top',
        hoverable: false,
        children: jsx('button', {
          type: 'button',
          className: 'sheet-add-column',
          tabIndex: AT_END_TAB_INDEX,
          'aria-label': sheetMessages.addColumn(),
          onClick: () => onAdd('columns', 1),
          children: jsx(Icon, {
            name: 'Add',
            size: 'xs',
          }),
        }),
      }),
      jsx(Tooltip, {
        content: sheetMessages.addMoreColumns(),
        side: 'top',
        hoverable: false,
        ...(isColumnCountCardOpen
          ? {
              open: false,
            }
          : {}),
        children: jsx('button', {
          type: 'button',
          id: ADD_MORE_COLUMNS_BUTTON_ID,
          className: 'sheet-add-more-columns',
          tabIndex: AT_END_TAB_INDEX,
          'aria-label': sheetMessages.addMoreColumns(),
          'aria-haspopup': 'dialog',
          'aria-expanded': isColumnCountCardOpen,
          onClick: ({ detail: detail }: Dynamic) => onColumnCountAsked(detail === 0),
          children: MENU_CARETS.tab,
        }),
      }),
    ],
  });
}
export function AddAtEndOfSheet({ grid: grid, onCaretAtEnd: onCaretAtEnd, onCaretLost: onCaretLost, ...addProps }: Dynamic) {
  let {
    body: body,
    mostRowsToAdd: mostRowsToAdd,
    roomOfWhatAddsRows: roomOfWhatAddsRows,
    headerThatAddsColumns: headerThatAddsColumns,
  } = grid;
  return jsxs(Fragment, {
    children: [
      roomOfWhatAddsRows !== null &&
        jsx(AtEndOfSheet, {
          adds: 'rows',
          isOutOfView: roomOfWhatAddsRows.top >= body.height,
          className: 'sheet-add-rows',
          style: boxInBody(roomOfWhatAddsRows, body),
          onCaretAtEnd: onCaretAtEnd,
          onCaretLost: onCaretLost,
          children: jsx(AddRowsAtFoot, {
            most: mostRowsToAdd,
            ...addProps,
          }),
        }),
      headerThatAddsColumns !== null &&
        jsx(AtEndOfSheet, {
          adds: 'columns',
          isOutOfView: headerThatAddsColumns.left >= body.width,
          className: 'sheet-add-columns',
          style: {
            left: body.left + headerThatAddsColumns.left,
            width: headerThatAddsColumns.width,
            height: body.top,
          },
          onCaretAtEnd: onCaretAtEnd,
          onCaretLost: onCaretLost,
          children: jsx(AddColumnsButtons, {
            ...addProps,
          }),
        }),
    ],
  });
}
export const AT_END_OF_SHEET_ATTRIBUTE = 'data-is-at-end-of-sheet';
export const AT_END_OF_SHEET_FIELDS = `[${AT_END_OF_SHEET_ATTRIBUTE}] :is(button,input)`;
export const isInAtEndOfSheet = (target?: Dynamic) => target instanceof Element && target.closest(AT_END_OF_SHEET_FIELDS) !== null;
export const isAtEndOfSheetInput = (target?: Dynamic) => target instanceof HTMLInputElement && isInAtEndOfSheet(target);
export const ADD_MORE_COLUMNS_BUTTON_ID = 'asks-how-many-columns';
export const AT_END_TAB_INDEX = 0;
