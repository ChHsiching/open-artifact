import { FieldRoot } from '../kit/field.tsx';
import { TextInput } from '../kit/text-input.tsx';
import { Switch } from '../kit/switch.tsx';
import { Tooltip, TooltipGroup } from '../kit/tooltip.tsx';
import { Button } from '../kit/button.tsx';
import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { useCoarsePointer } from '../app/media-queries.ts';
import {
  customSortMessages,
  removeSortColumnLabel,
  reorderSortColumnLabel,
  labeledSortColumnWords,
  sortOrderOfColumnLabel,
  sortDirectionWords,
  columnLettersLabel,
} from './sort-filter-labels.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { REORDER_LIFT_PROPS, useReorderRows } from '../ui/reorder-rows.ts';
import {
  PaneRow,
  PaneSelect,
  PaneTableButton,
  revealInSidePane,
  useSidePaneCaret,
  focusPaneStart,
  SidePane,
  PaneSection,
  PaneRowNote,
} from '../ui/side-pane/side-pane.ts';
import { whenBlurredToNothing } from '../grid/focus-left.ts';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
import { savingChangesText } from '../i18n/notice-labels.ts';
export function SortKeyRow(props?: Dynamic) {
  let {
    sortKey: sortKey,
    index: index,
    columns: columns,
    isAlone: isAlone,
    reorder: reorder,
    keysThatMoveSaidBy: keysThatMoveSaidBy,
    onAct: onAct,
    onRemoved: onRemoved,
  } = props;
  let { keyId: keyId, columnId: columnId, direction: direction, holds: holds } = sortKey;
  let isPointerCoarse = useCoarsePointer();
  let column = columns.find((candidateColumn?: Dynamic) => candidateColumn.columnId === columnId);
  let columnLabel = column === undefined ? '' : sortColumnLabel(column);
  let sortByWords = index === 0 ? customSortMessages.sortBy() : customSortMessages.thenBy();
  let { className: rowClassName, ...rowProps } = reorder.ofRow(keyId, index);
  let { className: handleClassName, ...handleProps } = reorder.ofHandle(keyId, index);
  return jsxs('li', {
    ...rowProps,
    className: `group/key py-1.5 first:pt-0 ${rowClassName}`,
    children: [
      jsx('span', {
        ...REORDER_LIFT_PROPS,
        className: `${REORDER_LIFT_PROPS.className} ${index > 0 ? 'top-[22px]' : ''}`,
      }),
      index > 0 &&
        jsx('p', {
          className: `${isPointerCoarse ? 'ps-[calc(var(--ui-pad-lg)+40px)]' : 'ps-[calc(var(--ui-pad-lg)+32px)]'} pb-1 text-footnote text-secondary select-none ${reorder.isRowHeld ? 'invisible' : ''}`,
          children: sortByWords,
        }),
      jsx(TooltipGroup, {
        closeDelay: 0,
        children: jsxs(PaneRow, {
          ...(!isAlone && {
            trailing: jsx(TooltipGroup, {
              closeDelay: 0,
              children: jsx(Button, {
                variant: 'ghost',
                iconOnly: true,
                icon: 'Minus',
                'aria-label': removeSortColumnLabel(columnLabel),
                className: 'text-secondary',
                onClick: () =>
                  reorder.gliding(
                    (event?: Dynamic) =>
                      onAct(
                        {
                          kind: 'removeKey',
                          keyId: keyId,
                        },
                        event,
                      ),
                    (isGlided?: Dynamic) => isGlided && onRemoved(index),
                  ),
              }),
            }),
          }),
          children: [
            !isAlone &&
              jsx(Tooltip, {
                content: reorderSortColumnLabel(columnLabel),
                ...(reorder.areTooltipsOfHandlesShut
                  ? {
                      open: false,
                    }
                  : {}),
                children: jsx(Button, {
                  variant: 'ghost',
                  ...(!isPointerCoarse && {
                    size: 'xs',
                  }),
                  iconOnly: true,
                  icon: jsx(Icon, {
                    name: 'Reorder',
                    size: 'xs',
                    className:
                      'text-muted group-hover/key:text-primary group-has-focus-visible/key:text-primary group-data-reorder/key:text-primary touch:text-primary',
                  }),
                  'aria-label': reorderSortColumnLabel(columnLabel),
                  'aria-describedby': keysThatMoveSaidBy,
                  tooltip: false,
                  ...handleProps,
                  ...{
                    [KEY_HANDLE_ATTRIBUTE]: keyId,
                  },
                  className: handleClassName,
                }),
              }),
            jsxs('div', {
              className: 'grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-1',
              children: [
                jsx('div', {
                  ...{
                    [KEY_COLUMN_ATTRIBUTE]: true,
                  },
                  className: 'flex min-w-0',
                  children: jsx(PaneSelect, {
                    name: labeledSortColumnWords(sortByWords, columnLabel),
                    value: columnId,
                    items: columns.map(sortColumnItem),
                    onChange: (pickedColumnId?: Dynamic) =>
                      onAct({
                        kind: 'setColumn',
                        keyId: keyId,
                        columnId: pickedColumnId,
                      }),
                  }),
                }),
                jsx(PaneSelect, {
                  name: sortOrderOfColumnLabel(columnLabel, sortDirectionWords(holds, direction)),
                  value: direction,
                  items: SORT_PANE_DIRECTIONS.map(
                    (directionOption?: Dynamic) => ({
                      value: directionOption,
                      label: sortDirectionWords(holds, directionOption),
                    }),
                  ),
                  onChange: (pickedDirection?: Dynamic) =>
                    onAct({
                      kind: 'setDirection',
                      keyId: keyId,
                      direction: pickedDirection,
                    }),
                }),
              ],
            }),
          ],
        }),
      }),
    ],
  });
}
export function SortCellsField({ cells: cells, cellsTyped: cellsTyped, whyNotSaidBy: whyNotSaidBy, onAct: onAct }: Dynamic) {
  return jsx(FieldRoot, {
    invalid: whyNotSaidBy !== null,
    className: 'min-w-0 flex-1',
    children: jsx(TextInput, {
      fullWidth: true,
      className: '[&_input]:text-ellipsis',
      dir: 'auto',
      'aria-label': customSortMessages.cells(),
      'aria-describedby': whyNotSaidBy ?? undefined,
      autoComplete: 'off',
      autoCapitalize: 'off',
      autoCorrect: 'off',
      spellCheck: false,
      value: cellsTyped ?? cells,
      slotEnd: jsx(PaneTableButton, {
        name: customSortMessages.useSelection(),
        onPressed: () =>
          onAct({
            kind: 'useSelection',
          }),
      }),
      onChange: (event?: Dynamic) =>
        onAct({
          kind: 'typeCells',
          text: event.target.value,
        }),
      onBlur: ({ relatedTarget: relatedTarget, currentTarget: currentTarget }: Dynamic) => {
        if (relatedTarget !== null)
          onAct({
            kind: 'enterCells',
          });
        else
          whenBlurredToNothing(
            currentTarget,
            () =>
              onAct({
                kind: 'enterCells',
              }),
          );
      },
      onKeyDown: (event?: Dynamic) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          onAct({
            kind: 'enterCells',
          });
        }
        if (event.key === 'Escape' && cellsTyped !== null) {
          event.preventDefault();
          event.stopPropagation();
          onAct({
            kind: 'dropTypedCells',
          });
        }
        return;
      },
    }),
  });
}
export const SORT_PANE_DIRECTIONS = ['ascending', 'descending'];
export const SORT_BUTTON_ATTRIBUTE = 'data-sort-button';
export const KEY_COLUMN_ATTRIBUTE = 'data-column-of-key';
export const KEY_HANDLE_ATTRIBUTE = 'data-handle-of-key';
export const sortColumnLabel = ({ heading: heading, letters: letters }: Dynamic) =>
  heading === '' ? columnLettersLabel(letters) : heading;
export const sortColumnItem = (column?: Dynamic) =>
  column.heading === ''
    ? {
        value: column.columnId,
        label: sortColumnLabel(column),
      }
    : {
        value: column.columnId,
        label: column.heading,
        hint: column.letters,
      };
export const CustomSortPane = React.memo(function ({
  pane: pane,
  timesAsked: timesAsked,
  paneRef: paneRef,
  takesNoTyping: takesNoTyping,
  paneWidth: paneWidth,
  onPaneWidthChange: onPaneWidthChange,
  onKeyDownInPane: onKeyDownInPane,
  whatHasCaretAfter: whatHasCaretAfter,
  wasPointerPressedLast: wasPointerPressedLast,
  onAct: onAct,
  onShut: onShut,
}: Dynamic) {
  let keyListRef = React.useRef(null);
  let keysThatMoveId = React.useId();
  let cellsWhyNotId = React.useId();
  let sortKeys = pane?.keys ?? [];
  let focusAfterChangeRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let focusAfterChange = focusAfterChangeRef.current;
    focusAfterChangeRef.current = null;
    if (focusAfterChange === null) return;
    let columnButtons = keyListRef.current?.querySelectorAll(`[${KEY_COLUMN_ATTRIBUTE}] button`);
    let focusTarget =
      typeof focusAfterChange === 'number'
        ? (columnButtons?.[focusAfterChange] ?? columnButtons?.[focusAfterChange - 1])
        : 'added' in focusAfterChange
          ? columnButtons?.[focusAfterChange.added]
          : (keyListRef.current?.querySelector(`[${KEY_HANDLE_ATTRIBUTE}="${focusAfterChange.handleOf}"]`) ?? undefined);
    focusTarget?.focus({
      preventScroll: true,
      focusVisible: !wasPointerPressedLast(),
    });
    if (focusTarget !== undefined) revealInSidePane(paneRef.current, focusTarget, true);
  });
  let reorder = useReorderRows({
    listRef: keyListRef,
    keys: sortKeys.map(({ keyId: keyId }: Dynamic) => keyId),
    onMoved: (keyId?: Dynamic, toIndex?: Dynamic, onDone?: Dynamic) =>
      onAct(
        {
          kind: 'moveKey',
          keyId: keyId,
          toIndex: toIndex,
        },
        (isDone?: Dynamic) => {
          if (isDone)
            focusAfterChangeRef.current = {
              handleOf: keyId,
            };
          onDone(isDone);
        },
      ),
  });
  useSidePaneCaret({
    isOpen: pane !== null,
    timesAsked: timesAsked,
    paneRef: paneRef,
    putCaretWhereToStart: () => {
      let firstColumnButton = keyListRef.current?.querySelector(`[${KEY_COLUMN_ATTRIBUTE}] button`) ?? null;
      let isByPointer = wasPointerPressedLast();
      if (firstColumnButton === null)
        focusPaneStart(paneRef.current, 'start', {
          isByPointer: isByPointer,
        });
      else
        firstColumnButton.focus({
          preventScroll: true,
          focusVisible: !isByPointer,
        });
    },
    whatHasCaretAfter: whatHasCaretAfter,
  });
  if (pane === null) return null;
  let {
    cells: cells,
    cellsTyped: cellsTyped,
    areCellsTypedRefused: areCellsTypedRefused,
    hasHeaderRow: hasHeaderRow,
    columns: columns,
  } = pane;
  let keyColumnIds = new (Set as Dynamic)(sortKeys.map(({ columnId: columnId }: Dynamic) => columnId));
  return jsxs(SidePane, {
    ref: paneRef,
    title: customSortMessages.customSort(),
    takesNoTyping: takesNoTyping,
    width: paneWidth,
    onWidthChange: onPaneWidthChange,
    onClose: onShut,
    onKeyDown: onKeyDownInPane,
    wasPointerPressedLast: wasPointerPressedLast,
    children: [
      jsxs(PaneSection, {
        title: customSortMessages.appliesTo(),
        children: [
          jsx(PaneRow, {
            label: customSortMessages.cells(),
            children: jsx(SortCellsField, {
              cells: cells,
              cellsTyped: cellsTyped,
              whyNotSaidBy: areCellsTypedRefused ? cellsWhyNotId : null,
              onAct: onAct,
            }),
          }),
          areCellsTypedRefused &&
            jsx(PaneRowNote, {
              id: cellsWhyNotId,
              isRefusal: true,
              children: customSortMessages.cellsNotFound(),
            }),
          jsx(LiveAnnouncer, {
            words: areCellsTypedRefused && customSortMessages.cellsNotFound(),
          }),
          jsx(PaneRow, {
            label: customSortMessages.headerRow(),
            children: jsx(Switch, {
              size: 'sm',
              checked: hasHeaderRow,
              onCheckedChange: (checked?: Dynamic) =>
                onAct({
                  kind: 'setHeaderRow',
                  isOn: checked,
                }),
            }),
          }),
        ],
      }),
      jsxs(PaneSection, {
        title: customSortMessages.sortBy(),
        actions: jsx(Button, {
          variant: 'ghost',
          iconOnly: true,
          icon: 'Add',
          'aria-label': customSortMessages.addColumn(),
          className: 'text-secondary',
          disabled: !pane.canAddKey,
          tooltip: true,
          onClick: () =>
            onAct(
              {
                kind: 'addKey',
              },
              (isDone?: Dynamic) => {
                if (isDone)
                  focusAfterChangeRef.current = {
                    added: sortKeys.length,
                  };
              },
            ),
        }),
        children: [
          jsx('ul', {
            ref: keyListRef,
            className: 'flex flex-col',
            children: sortKeys.map(
              (sortKey?: Dynamic, index?: Dynamic) =>
                jsx(
                  SortKeyRow,
                  {
                    sortKey: sortKey,
                    index: index,
                    columns: columns.filter(
                      ({ columnId: columnId }: Dynamic) => columnId === sortKey.columnId || !keyColumnIds.has(columnId),
                    ),
                    isAlone: sortKeys.length === 1,
                    reorder: reorder,
                    keysThatMoveSaidBy: keysThatMoveId,
                    onAct: onAct,
                    onRemoved: (removedIndex?: Dynamic) => void (focusAfterChangeRef.current = removedIndex),
                  },
                  sortKey.keyId,
                ),
            ),
          }),
          jsx('span', {
            id: keysThatMoveId,
            hidden: true,
            children: customSortMessages.keysThatMove(),
          }),
          jsx('div', {
            className: 'pt-1',
            children: jsx(PaneRow, {
              children: jsx(Button, {
                variant: 'secondary',
                className: 'w-full',
                disabled: !pane.canSort && !pane.isLargeEditBeingSaved,
                busy: pane.isLargeEditBeingSaved,
                busyLabel: savingChangesText(),
                ...{
                  [SORT_BUTTON_ATTRIBUTE]: true,
                },
                onClick: () =>
                  onAct({
                    kind: 'sort',
                  }),
                children: customSortMessages.sortCells(),
              }),
            }),
          }),
        ],
      }),
    ],
  });
});
