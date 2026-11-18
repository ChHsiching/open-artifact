import { Combobox } from '../kit/combobox.tsx';
import { Popover } from '../kit/popover.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { roomForMoreLines, parseLineCount } from '../grid/lines-at-end.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { MESSAGE_LOCALE } from '../i18n/messages.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { enterNumberUpToHint, upToAtATimeHint, addColumnsLabel } from '../i18n/grid-action-labels.ts';
import { LiveAnnouncer } from './live-announcer.ts';
import { isTrustedEscapeClose } from '../app/page-guards.ts';
import { popupPropsUnderHeader } from '../shell/bottom-insets.ts';
import { wrapTabFocusInBar } from './dom-events.ts';
export function AddColumnsList({ columnCount: columnCount, onCountChosen: onCountChosen }: Dynamic) {
  let [typed, setTyped] = React.useState('');
  let maxColumns = roomForMoreLines('columns', columnCount);
  let typedCount = parseLineCount(typed);
  let isTypedInvalid = typed.trim() !== '' && typedCount === null;
  let captionId = React.useId();
  let [isPresetHighlighted, setIsPresetHighlighted] = React.useState(false);
  let presets = COLUMN_COUNT_PRESETS.filter((input?: Dynamic) => input <= maxColumns);
  let counts =
    typedCount === null
      ? presets
      : [typedCount, ...presets.filter((input?: Dynamic) => input !== typedCount)].slice(0, Math.max(1, presets.length));
  let shownCounts = isPresetHighlighted ? [] : counts;
  return jsxs('div', {
    className: 'flex w-[232px] flex-col p-[var(--ui-menu-gutter,0.25rem)] [[data-presentation=sheet]_&]:w-full',
    children: [
      jsxs(Combobox.Root, {
        inline: true,
        open: true,
        filter: null,
        items: shownCounts,
        autoHighlight: typedCount !== null,
        inputValue: typed,
        onInputValueChange: (text?: Dynamic) => {
          setTyped((parseLineCount(text) ?? 0) > maxColumns ? maxColumns.toLocaleString(MESSAGE_LOCALE) : text);
        },
        onItemHighlighted: (count: Dynamic, { reason: reason }: Dynamic) =>
          setIsPresetHighlighted(count !== undefined && typedCount === null && reason === 'none'),
        onValueChange: (count?: Dynamic, details?: Dynamic) => {
          details.cancel();
          if (count !== null) onCountChosen(count);
        },
        children: [
          jsx(Combobox.PopupSearch, {
            placeholder: sheetMessages.columnsToAdd(),
            'aria-label': sheetMessages.columnsToAdd(),
            inputMode: 'numeric',
            'aria-describedby': captionId,
            'aria-invalid': isTypedInvalid,
          }),
          jsx(Combobox.List, {
            'aria-label': sheetMessages.addMoreColumns(),
            children: jsxs(Combobox.Group, {
              children: [
                jsx(Combobox.GroupLabel, {
                  id: captionId,
                  children: isTypedInvalid ? enterNumberUpToHint(maxColumns) : upToAtATimeHint(maxColumns),
                }),
                shownCounts.map(
                  (input?: Dynamic) =>
                    jsx(
                      Combobox.Item,
                      {
                        value: input,
                        children: addColumnsLabel(input),
                      },
                      input,
                    ),
                ),
              ],
            }),
          }),
        ],
      }),
      jsx(LiveAnnouncer, {
        words: isTypedInvalid && enterNumberUpToHint(maxColumns),
      }),
    ],
  });
}
export function AddColumnsPopover({
  isOpen: isOpen,
  opener: opener,
  onShut: onShut,
  onKeyPressed: onKeyPressed,
  onCountChosen: onCountChosen,
  whatHasCaretAfter: whatHasCaretAfter,
  columnCount: columnCount,
}: Dynamic) {
  let wasShutByPointerRef = React.useRef(false);
  return jsx(Popover.Root, {
    open: isOpen,
    onOpenChange: (open: Dynamic, { reason: reason, event: event }: Dynamic) => {
      wasShutByPointerRef.current = isTrustedEscapeClose(reason, event);
      if (!open) onShut();
    },
    children: jsx(Popover.Popup, {
      ...popupPropsUnderHeader(),
      anchor: () => anchorInsideGrid(opener),
      side: 'bottom',
      align: 'start',
      padding: 'none',
      collisionAvoidance: {
        fallbackAxisSide: 'none',
      },
      'aria-label': sheetMessages.addMoreColumns(),
      finalFocus: () => (wasShutByPointerRef.current ? opener() : whatHasCaretAfter()),
      onKeyDownCapture: (input?: Dynamic) => onKeyPressed(input.key),
      onKeyDown: (event?: Dynamic) => {
        wrapTabFocusInBar(event);
        if (event.key === 'F6' && !event.altKey) event.preventDefault();
      },
      children: jsx(AddColumnsList, {
        columnCount: columnCount,
        onCountChosen: (input?: Dynamic) => {
          wasShutByPointerRef.current = false;
          onShut();
          onCountChosen(input);
        },
      }),
    }),
  });
}
export const COLUMN_COUNT_PRESETS = [5, 10, 50];
export const anchorInsideGrid = (getOpener?: Dynamic) => {
  let lastRect: Dynamic = new (DOMRect as Dynamic)();
  return {
    contextElement: getOpener() ?? undefined,
    getBoundingClientRect() {
      let opener = getOpener();
      if (opener === null) return lastRect;
      let { x: x, y: y, width: width, height: height } = opener.getBoundingClientRect();
      let gridRight = opener.closest('.sheet-grid')?.getBoundingClientRect().right ?? 1 / 0;
      lastRect = new (DOMRect as Dynamic)(Math.min(x, gridRight - width), y, width, height);
      return lastRect;
    },
  };
};
