import { useUiWindow } from '../kit/theme.tsx';
import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { cleanOptionLabel, labelsOfPastedText } from './dropdown-pane-edits.ts';
import {
  withListCardIds,
  ListRowTooltip,
  ListRowLead,
  ListRowLabel,
  ListRowCaret,
  ListRow,
  ListSeparator,
  useLastNonNull,
  useListCardHover,
  ListUnderCell,
  PlainListBox,
  OptionsListCard,
  listRowIdOf,
} from '../ui/list-under-cell.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { CellChip } from '../grid/cell-drawing.ts';
import { cachedOptionChipColors } from '../format/cell-colors.ts';
import { dropdownPaneMessages } from '../i18n/format-labels.ts';
import { optionListForCellLabel, addOptionText, optionAlreadyExistsText, dropdownOptionsForCellLabel } from '../i18n/chip-labels.ts';
import { optionRightArrowToEditLabel, optionPlaceInListLabel, opensMoreRowsLabel, editCardHeadingLabel } from '../i18n/menu-labels.ts';
import { optionIdOfMenuKey, menuItemKey, MAX_DROPDOWN_OPTIONS, optionMenuKey } from './dropdown-options.ts';
import { IS_IOS_BROWSER } from '../grid/cell-drawing-values.ts';
import { isOptionLabelTaken } from './dropdowns.ts';
import { isCopiedFromSheets } from '../clipboard/formats.ts';
import { fieldInListAfterListChange, FieldInList } from '../ui/field-in-list.ts';
import { useReorderRows, isDropAPressOnRow } from '../ui/reorder-rows.ts';
import { colorForAddedOption } from './dropdown-colors.ts';
export function splitDropdownListRows({ rows: rows, highlightedRow: highlightedRow }: Dynamic) {
  let highlighted = rows[highlightedRow ?? -1];
  let rowsOfKind = (isOther?: Dynamic) => {
    let kindRows = rows.filter(({ kind: kind }: Dynamic) => (kind !== 'option' && kind !== 'add') === isOther);
    let highlightedAt = highlighted === undefined ? -1 : kindRows.indexOf(highlighted);
    return {
      rows: kindRows,
      highlightedRow: highlightedAt === -1 ? null : highlightedAt,
    };
  };
  let [optionRows, otherRows] = [rowsOfKind(false), rowsOfKind(true)];
  return optionRows.rows.length === 0 ? [otherRows, null] : [optionRows, otherRows];
}
export function areOptionsNamedInList(list: Dynamic, { dropdownId: dropdownId, optionId: optionId, labels: labels }: Dynamic) {
  if (labels.length > 1 || list?.dropdownId !== dropdownId) return true;
  let label = cleanOptionLabel(labels[0] ?? '').trim();
  return list.rows.some((row?: Dynamic) => row.kind === 'option' && row.label === label && (optionId === null || row.optionId === optionId));
}
export function dropdownListIds(list?: Dynamic) {
  let highlighted = list.rows[list.highlightedRow ?? -1];
  let highlightedRowId = highlighted === undefined ? null : dropdownListRowId(highlighted);
  let listIds = withListCardIds(
    {
      id: DROPDOWN_LIST_ID,
      highlightedRowId: highlightedRowId,
    },
    list.card,
  );
  return splitDropdownListRows(list)[1] === null
    ? listIds
    : {
        ...listIds,
        id: `${listIds.id} ${DROPDOWN_LIST_OTHERS_ID}`,
      };
}
export function DropdownListRowContent({ row: row, isCardBeside: isCardBeside, hasCard: hasCard }: Dynamic) {
  switch (row.kind) {
    case 'option':
      return jsxs(Fragment, {
        children: [
          jsx('span', {
            className: 'flex min-w-0 flex-1',
            children: jsx(CellChip, {
              optionPaints: cachedOptionChipColors(row.color),
              children: jsx(ListRowTooltip, {
                className: 'block',
                children: row.label,
              }),
            }),
          }),
          hasCard &&
            jsx('span', {
              'aria-hidden': true,
              className: 'w-6 flex-none pointer-coarse:w-9',
            }),
        ],
      });
    case 'add':
      return jsxs(Fragment, {
        children: [
          jsx(ListRowLead, {
            icon: 'Add',
          }),
          jsx(ListRowLabel, {
            children: dropdownListRowWords(row),
          }),
        ],
      });
    case 'addOption':
      return jsxs(Fragment, {
        children: [
          jsx(ListRowLead, {
            icon: 'Add',
          }),
          jsx(ListRowLabel, {
            children: dropdownListRowWords(row),
          }),
        ],
      });
    case 'editOptions':
      return jsxs(Fragment, {
        children: [
          jsx(ListRowLead, {
            icon: 'Edit',
          }),
          jsx(ListRowLabel, {
            children: dropdownListRowWords(row),
          }),
        ],
      });
    case 'startFromSet':
      return jsxs(Fragment, {
        children: [
          jsx(ListRowLead, {
            icon: 'Templates',
          }),
          jsx('span', {
            'aria-hidden': true,
            className: 'flex min-w-0 flex-1',
            children: jsx(ListRowLabel, {
              children: dropdownPaneMessages.presets(),
            }),
          }),
          jsx('span', {
            className: 'sr-only',
            children: dropdownListRowWords(row),
          }),
          jsx(ListRowCaret, {
            isCardBeside: isCardBeside,
          }),
        ],
      });
  }
}
export function dropdownListCardHandlers(
  { card: card, isCardOfPointerAlone: isCardOfPointerAlone }: Dynamic,
  isCardBeside?: Dynamic,
  cardHover?: Dynamic,
  handlers?: Dynamic,
  isCaretInOptionField: Dynamic = false,
) {
  return {
    onRowChosen(row?: Dynamic) {
      cardHover.overCard();
      if (!isCardBeside && row === 'startFromSet' && card?.ofRow === row) handlers.onCardShut();
      else handlers.onRowChosen(row);
    },
    onCardOfOptionAsked(row?: Dynamic) {
      cardHover.overCard();
      handlers.onCardOfOptionAsked(row);
    },
    onRowPointedAt(row?: Dynamic) {
      if (!isCardBeside) return;
      if (row === 'startFromSet') cardHover.overOpener(row);
      else if (row === card?.ofRow || isCaretInOptionField) cardHover.overCard();
      else cardHover.overOtherRow();
    },
    onOpenerLeft: cardHover.offOpener,
    onCardRowPointedAt: cardHover.overCard,
    onRowsScrolled(element?: Dynamic) {
      if (card === null) return;
      if (!isCardOfPointerAlone) return cardHover.rowsScrolled(element.ownerDocument.getElementById(dropdownListRowIdOfKey(card.ofRow)));
      cardHover.overCard();
      return handlers.onCardShut();
    },
    onPointerInOrOut(isIn?: Dynamic) {
      if (isIn) cardHover.overCard();
      else if (isCardOfPointerAlone) cardHover.overOtherRow();
    },
  };
}
export function dropdownListSpokenWords({
  cell: cell,
  rows: rows,
  highlightedRow: highlightedRow,
  isCueForCardsDue: isCueForCardsDue,
}: Dynamic) {
  let optionRows = rows.filter(({ kind: kind }: Dynamic) => kind === 'option');
  let highlighted = rows[highlightedRow ?? -1];
  if (highlighted === undefined) return optionListForCellLabel(cell, optionRows.length);
  if (highlighted.kind !== 'option') return dropdownListRowWords(highlighted);
  return (isCueForCardsDue ? optionRightArrowToEditLabel : optionPlaceInListLabel)(
    highlighted.label,
    optionRows.indexOf(highlighted) + 1,
    optionRows.length,
  );
}
export const DROPDOWN_LIST_ID = 'dropdown-list';
export const dropdownListRowId = (input?: Dynamic) =>
  input.kind === 'option' ? `${DROPDOWN_LIST_ID}-option-${input.optionId}` : `${DROPDOWN_LIST_ID}-${input.kind}`;
export const DROPDOWN_LIST_OTHERS_ID = `${DROPDOWN_LIST_ID}-others`;
export const dropdownListRowIdOfKey = (input?: Dynamic) => {
  let value = optionIdOfMenuKey(input);
  return value === null ? `${DROPDOWN_LIST_ID}-${input}` : `${DROPDOWN_LIST_ID}-option-${value}`;
};
export const firstDropdownListRowId = ({ rows: [row] }: Dynamic) => (row === undefined ? null : dropdownListRowId(row));
export const NO_DROPDOWN_LIST = {
  cell: '',
  rows: [],
  highlightedRow: null,
  card: null,
  haveOptionsCards: false,
  isCueForCardsDue: false,
  isCardOfPointerAlone: false,
  isNewOptionBeingNamed: false,
  timesNewOptionAsked: 0,
  ofCell: null,
  dropdownId: null,
};
export const dropdownListRowWords = (row?: Dynamic) => {
  switch (row.kind) {
    case 'option':
      return row.label;
    case 'add':
      return addOptionText(row.label);
    case 'addOption':
      return dropdownPaneMessages.addOption();
    case 'editOptions':
      return dropdownPaneMessages.editOptions();
    case 'startFromSet':
      return opensMoreRowsLabel(dropdownPaneMessages.presets());
  }
};
export const OptionCardOpener = ({ isOpen: isOpen, onPressed: onPressed }: Dynamic) =>
  jsx('button', {
    type: 'button',
    'aria-hidden': true,
    tabIndex: -1,
    'data-popup-open': isOpen || undefined,
    className:
      'ui-reset absolute inset-y-0.5 end-0.5 grid w-7 place-items-center rounded text-muted hover:bg-fill-ghost-hover hover:text-primary active:bg-fill-ghost-selected data-[popup-open]:bg-fill-ghost-selected data-[popup-open]:text-primary pointer-coarse:w-10 forced-colors:data-[popup-open]:outline-2 forced-colors:data-[popup-open]:-outline-offset-2 forced-colors:data-[popup-open]:outline-[color:Highlight] forced-colors:data-[popup-open]:outline-solid',
    onPointerDown: (input?: Dynamic) => input.stopPropagation(),
    onClick: ({ detail: detail }: Dynamic) => {
      if (detail <= 1) onPressed();
    },
    children: jsx(Icon, {
      name: 'DotsHorizontal',
      size: 'sm',
    }),
  });
export const HELD_ROW_CLASSES = {
  className: 'data-[reorder=held]:opacity-70',
};
export const withHeldRowClasses = (input?: Dynamic) => ({
  ...input,
  className: `${input.className} ${HELD_ROW_CLASSES.className}`,
});
export const DropdownListRows = ({
  rows: rows,
  highlightedRow: highlightedRow,
  card: card,
  haveOptionsCards: haveOptionsCards,
  isCardBeside: isCardBeside,
  onRowChosen: onRowChosen,
  onCardOfOptionAsked: onCardOfOptionAsked,
  onRowPointedAt: onRowPointedAt,
  onOpenerLeft: onOpenerLeft,
  reorder: reorder,
  arePlacesInNames: arePlacesInNames = IS_IOS_BROWSER,
}: Dynamic) => {
  let optionRows = rows.filter(({ kind: kind }: Dynamic) => kind === 'option');
  return rows.flatMap((row?: Dynamic, index?: Dynamic) => {
    let rowElement = jsx(ListRow, {
      id: dropdownListRowId(row),
      name: arePlacesInNames && row.kind === 'option' ? optionPlaceInListLabel(row.label, optionRows.indexOf(row) + 1, optionRows.length) : undefined,
      placeInList: index + 1,
      rowsInList: rows.length,
      isHighlighted: index === highlightedRow && (card === null || card.highlightedRow === null),
      hasCardOpen: card?.ofRow === menuItemKey(row),
      onChosen: () => onRowChosen(menuItemKey(row)),
      onPointedAt: () => onRowPointedAt(menuItemKey(row)),
      isOnlyTintedByPointer: true,
      tellsOfEveryMove: true,
      ...(row.kind === 'startFromSet' && {
        onPointerLeave: onOpenerLeft,
      }),
      children: jsx(DropdownListRowContent, {
        row: row,
        isCardBeside: isCardBeside,
        hasCard: haveOptionsCards,
      }),
    });
    return [
      ...((row.kind !== 'option' && rows[index - 1]?.kind === 'option') || rows[index - 1]?.kind === 'addOption'
        ? [jsx(ListSeparator, {}, 'rule')]
        : []),
      jsxs(
        'div',
        {
          role: 'presentation',
          className: 'relative',
          ...(row.kind === 'option' &&
            reorder !== undefined && {
              ...withHeldRowClasses(reorder.ofRow(row.optionId, index)),
              onPointerDown(input?: Dynamic) {
                reorder.pressOnRowItself(input, row.optionId, index);
              },
            }),
          ...(row.kind === 'option' &&
            haveOptionsCards && {
              onContextMenu(event?: Dynamic) {
                event.preventDefault();
                event.stopPropagation();
                if (card?.ofRow !== menuItemKey(row)) onCardOfOptionAsked(row.optionId);
              },
            }),
          children: [
            rowElement,
            row.kind === 'option' &&
              haveOptionsCards &&
              jsx(OptionCardOpener, {
                isOpen: card?.ofRow === menuItemKey(row),
                onPressed: () => onCardOfOptionAsked(row.optionId),
              }),
          ],
        },
        menuItemKey(row),
      ),
    ];
  });
};
export const NO_ROOM_AT_LIST_ENDS = {
  start: 0,
  end: 0,
};
export const DROPDOWN_ROW_HEIGHT_PX = 28;
export const DropdownListUnderCell = React.memo(function ({
  list: list,
  anchor: anchor,
  cellElementId: cellElementId,
  isCardBeside: isCardBeside,
  onRoomBesideMeasured: onRoomBesideMeasured,
  onRowChosen: onRowChosen,
  onCardAsked: onCardAsked,
  onCardOfOptionAsked: onCardOfOptionAsked,
  onOptionsNamed: onOptionsNamed,
  onNewOptionNoLongerNamed: onNewOptionNoLongerNamed,
  onOptionMoved: onOptionMoved,
  onCaretGivenBack: onCaretGivenBack,
  onCardRowChosen: onCardRowChosen,
  onCardShut: onCardShut,
  onShut: onShut,
}: Dynamic) {
  let shownList = useLastNonNull(list) ?? NO_DROPDOWN_LIST;
  let isCardOpen = list !== null && list.card !== null;
  let rowKeys = list?.rows.map(menuItemKey).join() ?? null;
  let fieldInFocusRef = React.useRef(null);
  let [isCaretInOptionField, setIsCaretInOptionField] = React.useState(false);
  let [isCaretInNewOption, setIsCaretInNewOption] = React.useState(false);
  if (isCaretInNewOption && list?.isNewOptionBeingNamed !== true) setIsCaretInNewOption(false);
  let cardRow = list?.card?.ofRow ?? null;
  let [lastCardRow, setLastCardRow] = React.useState(cardRow);
  if (cardRow !== lastCardRow) {
    setLastCardRow(cardRow);
    setIsCaretInOptionField(false);
  }
  let isCardKeptOpen = React.useCallback(() => fieldInFocusRef.current !== null && fieldInFocusRef.current.ofOption !== null, []);
  let cardHover = useListCardHover({
    rowsListed: rowKeys,
    isOpen: isCardOpen,
    onAsked: onCardAsked,
    onShut: onCardShut,
    isKeptOpen: isCardKeptOpen,
  });
  let {
    onPointerInOrOut: onPointerInOrOut,
    onRowsScrolled: onRowsScrolled,
    onCardRowPointedAt: onCardRowPointedAt,
    ...rowHandlers
  } = dropdownListCardHandlers(
    shownList,
    isCardBeside,
    cardHover,
    {
      onRowChosen: onRowChosen,
      onCardOfOptionAsked: onCardOfOptionAsked,
      onCardShut: onCardShut,
    },
    isCaretInOptionField,
  );
  let rowsProps = {
    ...rowHandlers,
    isCardBeside: isCardBeside,
  };
  let [mainRows, otherRows] = splitDropdownListRows(
    isCaretInNewOption
      ? {
          ...shownList,
          highlightedRow: null,
        }
      : shownList,
  );
  let optionRows = shownList.rows.filter((input?: Dynamic) => input.kind === 'option');
  let whyOptionRefused = (optionId?: Dynamic, label?: Dynamic) => {
    if (isOptionLabelTaken(optionRows, optionId, label)) return optionAlreadyExistsText(label.trim());
    return optionId === null && optionRows.length >= MAX_DROPDOWN_OPTIONS ? dropdownPaneMessages.mostOptionsReached() : null;
  };
  let { ofCell: ofCell, dropdownId: dropdownId } = shownList;
  let nameOptions = (optionId?: Dynamic, labels?: Dynamic, onDone?: Dynamic) => {
    if (dropdownId === null || ofCell === null) return onDone(false);
    let naming = {
      ofCell: ofCell,
      dropdownId: dropdownId,
      optionId: optionId,
      labels: labels,
    };
    return onOptionsNamed(naming, (listAfter?: Dynamic) => onDone(areOptionsNamedInList(listAfter, naming)));
  };
  let optionFieldProps = (optionId?: Dynamic) => ({
    asTyped: cleanOptionLabel,
    namesPasted: (clipboard?: Dynamic) => labelsOfPastedText(clipboard.getData('text'), isCopiedFromSheets(clipboard.getData('text/html'))),
    whyRefused: (label?: Dynamic) => whyOptionRefused(optionId, label),
    onEntered: (labels?: Dynamic, onDone?: Dynamic) => nameOptions(optionId, labels, onDone),
    onCaretChange(hasCaret?: Dynamic, field?: Dynamic) {
      fieldInFocusRef.current = hasCaret
        ? {
            ofOption: optionId,
            typed: null,
            field: field,
          }
        : null;
      setIsCaretInOptionField(hasCaret && optionId !== null);
      setIsCaretInNewOption(hasCaret && optionId === null);
    },
    onTypedChange(typed?: Dynamic) {
      if (fieldInFocusRef.current?.ofOption === optionId)
        fieldInFocusRef.current = {
          ...fieldInFocusRef.current,
          typed: typed,
        };
    },
  });
  let pageDocument = useUiWindow()?.document;
  let isShut = list === null;
  React.useLayoutEffect(() => {
    let fieldInFocus = fieldInFocusRef.current;
    if (fieldInFocus === null || pageDocument === undefined) return;
    let afterChange = fieldInListAfterListChange(fieldInFocus.typed, {
      isFieldGone: !fieldInFocus.field.isConnected,
      isCaretOnBody: pageDocument.activeElement === pageDocument.body,
      isListShutting: isShut,
    });
    if (afterChange === 'staysAsItIs') return;
    fieldInFocusRef.current = null;
    if (afterChange === 'textIsEnteredAndCaretGoesBack' && fieldInFocus.typed !== null)
      nameOptions(fieldInFocus.ofOption, [fieldInFocus.typed], () => {});
    onCaretGivenBack();
  });
  let newOptionIndex = shownList.isNewOptionBeingNamed ? optionRows.length : null;
  React.useLayoutEffect(() => {
    let listElement = pageDocument?.getElementById(DROPDOWN_LIST_ID) ?? null;
    if (newOptionIndex !== null && listElement !== null) listElement.scrollTop = listElement.scrollHeight;
  }, [newOptionIndex, pageDocument]);
  let rowsListRef = React.useRef(null);
  let canReorder = shownList.haveOptionsCards && optionRows.length > 1;
  let reorder = useReorderRows({
    listRef: rowsListRef,
    keys: canReorder ? optionRows.map(({ optionId: optionId }: Dynamic) => optionId) : [],
    onMoved(optionId?: Dynamic, toIndex?: Dynamic, onDone?: Dynamic) {
      if (dropdownId === null || ofCell === null) onDone(false);
      else
        onOptionMoved(
          {
            ofCell: ofCell,
            dropdownId: dropdownId,
            optionId: optionId,
            toIndex: toIndex,
          },
          onDone,
        );
    },
    isRowPutBackPressed: false,
    onDragEnded(heldRow?: Dynamic) {
      if (isDropAPressOnRow(heldRow)) rowHandlers.onRowChosen(optionMenuKey(heldRow.key));
    },
    roomKeptAtEnds: () => NO_ROOM_AT_LIST_ENDS,
  });
  let isPressJudgedRef = React.useRef(false);
  let notePressJudged = React.useCallback((isJudged?: Dynamic) => {
    isPressJudgedRef.current = isJudged;
  }, []);
  let rowPressProps = {
    ofRow: reorder.ofRow,
    pressOnRowItself(...pressArgs: Dynamic[]) {
      if (!isPressJudgedRef.current) (reorder.pressOnRowItself as Dynamic)(...pressArgs);
    },
  };
  let { isRowHeld: isRowHeld } = reorder;
  React.useEffect(() => {
    if (isRowHeld && isCardOpen) onCardShut();
  }, [isRowHeld, isCardOpen, onCardShut]);
  let cardOption = optionRows.find((option?: Dynamic) => menuItemKey(option) === shownList.card?.ofRow);
  return jsxs(Fragment, {
    children: [
      jsx(ListUnderCell, {
        id: DROPDOWN_LIST_ID,
        isOpen: list !== null,
        onPressJudged: notePressJudged,
        anchor: anchor,
        cellElementId: cellElementId,
        label: dropdownOptionsForCellLabel(shownList.cell),
        className: 'w-[220px] max-h-[var(--available-height)]',
        mostHeightOfRows: '252px',
        leastHeightOfRows: `${Math.min(mainRows.rows.length, 2) * DROPDOWN_ROW_HEIGHT_PX}px`,
        onShut: onShut,
        onRowsScrolled: onRowsScrolled,
        onRoomBesideMeasured: onRoomBesideMeasured,
        onPointerInOrOut: onPointerInOrOut,
        under: jsxs(Fragment, {
          children: [
            shownList.isNewOptionBeingNamed &&
              React.createElement(FieldInList, {
                ...optionFieldProps(null),
                key: dropdownId,
                name: dropdownPaneMessages.optionName(),
                value: '',
                placeholder: dropdownPaneMessages.optionName(),
                isForNew: true,
                asChip: (typed?: Dynamic) => ({
                  paints: cachedOptionChipColors(colorForAddedOption(cleanOptionLabel(typed).trim(), optionRows)),
                  isPillDrawn: typed.trim() !== '',
                }),
                doesPressAskForNext: ({ id: id }: Dynamic) =>
                  id ===
                  dropdownListRowId({
                    kind: 'addOption',
                  }),
                timesAsked: shownList.timesNewOptionAsked,
                onOverWithoutKey: onNewOptionNoLongerNamed,
                onLeftByKey: () => {
                  onNewOptionNoLongerNamed();
                  onCaretGivenBack();
                },
              }),
            otherRows !== null &&
              jsxs(Fragment, {
                children: [
                  otherRows.rows[0]?.kind !== 'addOption' && jsx(ListSeparator, {}),
                  jsx(PlainListBox, {
                    id: DROPDOWN_LIST_OTHERS_ID,
                    label: dropdownPaneMessages.moreForDropdown(),
                    children: jsx(DropdownListRows, {
                      ...shownList,
                      ...otherRows,
                      ...rowsProps,
                    }),
                  }),
                ],
              }),
          ],
        }),
        children: jsx('div', {
          ref: rowsListRef,
          role: 'presentation',
          children: jsx(DropdownListRows, {
            ...shownList,
            ...mainRows,
            ...rowsProps,
            reorder: canReorder ? rowPressProps : undefined,
          }),
        }),
      }),
      list !== null &&
        shownList.card !== null &&
        jsx(OptionsListCard, {
          listId: DROPDOWN_LIST_ID,
          card: shownList.card,
          label: shownList.card.heading === undefined ? dropdownPaneMessages.presets() : editCardHeadingLabel(shownList.card.heading),
          rowId: dropdownListRowIdOfKey(shownList.card.ofRow),
          head:
            cardOption === undefined
              ? undefined
              : React.createElement(FieldInList, {
                  ...optionFieldProps(cardOption.optionId),
                  key: cardOption.optionId,
                  name: dropdownPaneMessages.optionName(),
                  value: cardOption.label,
                  doesPressDropText: ({ id: id }: Dynamic) => id === listRowIdOf(DROPDOWN_LIST_ID, `${cardOption.optionId} remove`),
                  onLeftByKey: () => {
                    onCaretGivenBack();
                    onCardShut();
                  },
                }),
          cell: anchor,
          isBeside: isCardBeside,
          onRowChosen: onCardRowChosen,
          onRowPointedAt: onCardRowPointedAt,
          onPointerInOrOut: onPointerInOrOut,
        }),
    ],
  });
});
