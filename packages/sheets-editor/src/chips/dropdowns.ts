import type { Dynamic } from '../dynamic.ts';
import { activeAnchorCell, selectionAtCell, scrollToShowActiveCell, moveActiveCellTo } from '../selection/model.ts';
import { cleanEnteredCellText } from '../format/shown-text.ts';
import {
  dropdownMenuItems,
  itemToHighlightForTyped,
  optionMenuKey,
  menuItemKey,
  optionIdOfMenuKey,
  dropdownAtCell,
  MAX_DROPDOWN_OPTIONS,
  isValidOptionLabel,
  isSameOptionLabel,
} from './dropdown-options.ts';
import { withNoEffects, clearPassingNotice, NAVIGATING_MODE } from '../state/transitions.ts';
import { openCardAtRow, listCardOfRow } from '../ui/list-cards.ts';
import { queueEdit, enterEntryEdit, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { cellRefOf } from '../model/workbook.ts';
import { colorForAddedOption, DROPDOWN_COLOR_CHOICES } from './dropdown-colors.ts';
import { colorKey, colorsEqual } from '../model/colors.ts';
import { commitDropdownOptions, startDropdownFromSet } from './dropdown-editor.ts';
import { pasteOptionLabels, cleanOptionLabel, readySetKeyOf } from './dropdown-pane-edits.ts';
import { dropdownEditorOfPane } from '../state/queries.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function dropdownMenuItemsAt(state: PageState, reads: WorkbookReads, { options: options }: Dynamic) {
  let cellText =
    reads.cellOf(activeAnchorCell(state, reads))?.dropdownOption !== undefined ? '' : cleanEnteredCellText(state.textToEditOfEntryCell);
  let hasReadySets = (state.readySets ?? []).length > 0;
  return dropdownMenuItems(options, typedTextInCell(state), cellText, hasReadySets);
}
export function dropdownListRows(state: PageState, reads: WorkbookReads) {
  let dropdown = state.dropdown === null ? null : dropdownAtActiveCell(state, reads);
  return dropdown === null ? null : dropdownMenuItemsAt(state, reads, dropdown);
}
export function openDropdownList(state: PageState, reads: WorkbookReads) {
  let dropdown = dropdownAtActiveCell(state, reads);
  if (dropdown === null) return closeDropdownList(state);
  let typed = typedTextInCell(state);
  let firstTypedRows = typed === null ? null : itemToHighlightForTyped(dropdownMenuItemsAt(state, reads, dropdown), typed);
  let chosenOptionId = reads.cellOf(activeAnchorCell(state, reads))?.dropdownOption?.optionId;
  let chosenRowKey = chosenOptionId === undefined ? null : optionMenuKey(chosenOptionId);
  let firstTypedRowKey = firstTypedRows === null ? null : menuItemKey(firstTypedRows);
  let highlighted = typed === null ? chosenRowKey : firstTypedRowKey;
  let { scrollLeft: scrollLeft, scrollTop: scrollTop } = state;
  return {
    ...state,
    dropdown: {
      highlighted: highlighted,
      scrollAsItOpened: {
        scrollLeft: scrollLeft,
        scrollTop: scrollTop,
      },
      card: null,
      isCardOfPointerAlone: false,
      isWalkedByKeys: false,
      cueForCards: 'toCome',
      isNewOptionBeingNamed: false,
      timesNewOptionAsked: 0,
    },
  };
}
export function highlightDropdownRow(state: PageState, highlighted?: Dynamic) {
  if (state.dropdown === null) return state;
  let mayCueCards = optionIdOfMenuKey(highlighted) !== null && isCellTextUntouched(state) && state.mode.kind === 'navigating';
  let { cueForCards: cueForCards } = state.dropdown;
  let nextCueForCards = cueForCards === 'toCome' ? (mayCueCards ? 'now' : cueForCards) : 'given';
  return {
    ...state,
    dropdown: {
      ...state.dropdown,
      highlighted: highlighted,
      isWalkedByKeys: true,
      cueForCards: nextCueForCards,
    },
  };
}
export function openDropdownEditorAt(state: PageState, reads: ReadsWithTextMeasurer, cell?: Dynamic) {
  let dropdown = reads.dropdownOf(cell);
  let cellsOfDropdown = dropdown === null ? null : reads.cellsOfTheDropdownAt(cell);
  if (dropdown === null || cellsOfDropdown === null) return state;
  return openDropdownEditor(state, reads, {
    dropdownId: dropdown.dropdownId,
    options: dropdown.options,
    stretches: cellsOfDropdown.stretches,
    indexOfOwnStretch: cellsOfDropdown.indexOfTheStretchWithTheCell,
    reach: 'everyCell',
    typed: null,
    isCustom: false,
  });
}
export function pickDropdownRow(state: PageState, reads: ReadsWithTextMeasurer, rowKey?: Dynamic, selectAfter?: Dynamic, foundBy?: Dynamic) {
  let dropdown = state.dropdown === null ? null : dropdownAtActiveCell(state, reads);
  let pickedRow = (dropdown === null ? [] : dropdownMenuItemsAt(state, reads, dropdown)).find(
    (input?: Dynamic) => menuItemKey(input) === rowKey,
  );
  let closedState = closeDropdownList(state);
  if (rowKey === 'addOption' && pickedRow === undefined && state.dropdown !== null)
    return withNoEffects({
      ...state,
      dropdown: {
        ...state.dropdown,
        isNewOptionBeingNamed: false,
      },
    });
  if (dropdown === null || pickedRow === undefined) return withNoEffects(closedState);
  let entryCell = activeAnchorCell(state, reads);
  if (pickedRow.kind === 'editOptions')
    return withNoEffects(
      openDropdownEditorAt(
        {
          ...clearPassingNotice(closedState),
          mode: NAVIGATING_MODE,
        },
        reads,
        entryCell,
      ),
    );
  if (pickedRow.kind === 'addOption')
    return withNoEffects({
      ...state,
      dropdown:
        state.dropdown === null
          ? null
          : {
              ...state.dropdown,
              card: null,
              isNewOptionBeingNamed: true,
              timesNewOptionAsked: state.dropdown.timesNewOptionAsked + 1,
            },
    });
  if (pickedRow.kind === 'startFromSet') {
    let card = openCardAtRow(rowKey, readySetCardRows(state, reads), foundBy);
    let stateWithCard = dropdownCard.withCard(state, card);
    return withNoEffects(highlightStartFromSet(unpinCardFromPointer(stateWithCard)));
  }
  let { sheetId: sheetId } = entryCell;
  let { label: label } = pickedRow;
  return queueEdit(
    closedState,
    pickedRow.kind === 'option'
      ? enterEntryEdit(entryCell, {
          kind: 'dropdownOption',
          optionId: pickedRow.optionId,
        })
      : {
          kind: 'addDropdownOption',
          sheetId: sheetId,
          cell: cellRefOf(entryCell),
          label: label,
          color: colorForAddedOption(label, dropdown.options),
        },
    {
      ...IF_QUEUED_DEFAULTS,
      select: selectionAtCell(selectAfter),
      foundBy: foundBy,
      done: null,
    },
  );
}
export function readySetCardRows(state: PageState, reads: WorkbookReads) {
  let chosenSetKey = chosenReadySetKey(state, dropdownAtActiveCell(state, reads)?.options ?? []);
  return (state.readySets ?? []).map(
    ({ label: label, set: set }: Dynamic) => ({
      key: set.key,
      label: label,
      marks: set.options.map(
        (input?: Dynamic) => ({
          key: input.label,
          color: input.color,
        }),
      ),
      isChosen: set.key === chosenSetKey,
    }),
  );
}
export function optionColorCardRows(state: PageState, reads: WorkbookReads, optionId?: Dynamic) {
  let options = dropdownAtActiveCell(state, reads)?.options ?? [];
  let option = options.find((input?: Dynamic) => input.optionId === optionId);
  if (option === undefined || !isCellTextUntouched(state)) return [];
  return [
    ...DROPDOWN_COLOR_CHOICES.map(
      (input?: Dynamic) => ({
        key: `${optionId} ${colorKey(input)}`,
        label: {
          colorOffered: input,
        },
        marks: [],
        isChosen: colorsEqual(input, option.color),
      }),
    ),
    ...(options.length === 1
      ? []
      : [
          {
            key: `${optionId} remove`,
            label: {
              removes: 'option',
            },
            marks: [],
            isChosen: false,
          },
        ]),
  ];
}
export function drawDropdownCard(state: PageState, reads: WorkbookReads, rows?: Dynamic) {
  let card = listCardOfRow(
    state.dropdown?.card ?? null,
    rows.map(menuItemKey),
    (input?: Dynamic) => dropdownCardRowsAt(state, reads, input),
  );
  let cardRow = rows.find((input?: Dynamic) => menuItemKey(input) === card?.ofRow);
  if (card === null || card.rows.length === 0) return null;
  return cardRow?.kind === 'option'
    ? {
        ...card,
        heading: cardRow.label,
      }
    : card;
}
export function openOptionColorCard(state: PageState, reads: WorkbookReads, optionId?: Dynamic) {
  let rowKey = optionMenuKey(optionId);
  let colorRows = optionColorCardRows(state, reads, optionId);
  if (state.dropdown === null || colorRows.length === 0) return state;
  let chosenKey = colorRows.find(({ isChosen: isChosen }: Dynamic) => isChosen)?.key ?? null;
  let card = {
    ofRow: rowKey,
    wentTo: chosenKey,
    isAsOpened: true,
  };
  return {
    ...state,
    dropdown: {
      ...state.dropdown,
      card: card,
      isCardOfPointerAlone: false,
      isWalkedByKeys: true,
      cueForCards: 'given',
    },
  };
}
export function resolveDropdownAt(state: PageState, reads: WorkbookReads, { ofCell: ofCell, dropdownId: dropdownId }: Dynamic) {
  let dropdown = ofCell.sheetId === state.sheetId ? dropdownAtCell(reads, ofCell) : null;
  let cellsOfDropdown = reads.cellsOfTheDropdownAt(ofCell);
  if (dropdown === null || cellsOfDropdown === null || dropdown.dropdownId !== dropdownId) return null;
  return {
    options: dropdown.options,
    everywhere: dropdownEditTarget(dropdown, cellsOfDropdown),
  };
}
export function moveDropdownOption(state: PageState, reads: WorkbookReads, { optionId: optionId, toIndex: toIndex, ...target }: Dynamic) {
  let found = resolveDropdownAt(state, reads, target);
  let option = found?.options.find((input?: Dynamic) => input.optionId === optionId);
  if (found === null || option === undefined) return withNoEffects(state);
  let { options: options, everywhere: everywhere } = found;
  let others = options.filter((input?: Dynamic) => input !== option);
  let index = Math.max(0, Math.min(toIndex, others.length));
  if (options[index] === option) return withNoEffects(state);
  let reordered = [...others.slice(0, index), option, ...others.slice(index)];
  return commitDropdownOptions(state, reads, everywhere, reordered, 'goesOn', undefined, {
    what: 'dropdownOptionMoved',
    label: option.label,
    place: index + 1,
    optionCount: options.length,
  });
}
export function nameDropdownOptions(state: PageState, reads: WorkbookReads, { optionId: optionId, labels: labels, ...target }: Dynamic) {
  let found = resolveDropdownAt(state, reads, target);
  if (found === null) return withNoEffects(state);
  let { options: options, everywhere: everywhere } = found;
  if (optionId === null) {
    let { pasted: pasted, ...added } = pasteOptionLabels(options, options.length, labels, null);
    let lastDone = {
      what: 'dropdownOptionsAdded',
      ...added,
    };
    if (added.count === 0)
      return withNoEffects(
        labels.length > 1
          ? {
              ...state,
              lastDone: {
                ...lastDone,
                onlyIn: null,
              },
            }
          : state,
      );
    let stateForAdding =
      pasted.length >= MAX_DROPDOWN_OPTIONS && state.dropdown !== null
        ? {
            ...state,
            dropdown: {
              ...state.dropdown,
              isNewOptionBeingNamed: false,
            },
          }
        : state;
    return commitDropdownOptions(stateForAdding, reads, everywhere, pasted, 'goesOn', undefined, lastDone);
  }
  let label = cleanOptionLabel(labels[0] ?? '').trim();
  let option = options.find((input?: Dynamic) => input.optionId === optionId);
  if (option === undefined || option.label === label || !isValidOptionLabel(label)) return withNoEffects(state);
  if (isOptionLabelTaken(options, optionId, label)) return withNoEffects(state);
  let { color: color } = option;
  let renamed = options.map(
    (input?: Dynamic) =>
      input === option
        ? {
            optionId: optionId,
            label: label,
            color: color,
          }
        : input,
  );
  return commitDropdownOptions(state, reads, everywhere, renamed, 'goesOn');
}
export function takeColorCardRow(state: PageState, reads: WorkbookReads, optionId?: Dynamic, rowKey?: Dynamic) {
  let dropdown = dropdownAtActiveCell(state, reads);
  let cellsOfDropdown = reads.cellsOfTheDropdownAt(activeAnchorCell(state, reads));
  let cardRow = optionColorCardRows(state, reads, optionId).find(({ key: key }: Dynamic) => key === rowKey);
  let option = dropdown?.options.find((input?: Dynamic) => input.optionId === optionId);
  if (dropdown === null || cellsOfDropdown === null || option === undefined) return withNoEffects(state);
  let card = state.dropdown?.card ?? null;
  if (cardRow === undefined || card === null) return withNoEffects(state);
  let everywhere = dropdownEditTarget(dropdown, cellsOfDropdown);
  if (typeof cardRow.label === 'object' && 'colorOffered' in cardRow.label) {
    let { colorOffered: colorOffered } = cardRow.label;
    let stateWithCard = dropdownCard.withCard(state, {
      ofRow: card.ofRow,
      wentTo: rowKey,
    });
    let stateUnpinned = unpinCardFromPointer(stateWithCard);
    if (cardRow.isChosen) return withNoEffects(stateUnpinned);
    let recolored = dropdown.options.map(
      (input?: Dynamic) =>
        input === option
          ? {
              ...input,
              color: colorOffered,
            }
          : input,
    );
    return commitDropdownOptions(stateUnpinned, reads, everywhere, recolored, 'goesOn');
  }
  let otherOptions = dropdown.options.filter((input?: Dynamic) => input !== option);
  let stateWithoutCard = dropdownCard.withCard(state, null);
  let value = reads.cellOf(activeAnchorCell(state, reads))?.dropdownOption?.optionId;
  let value2 = value === undefined || value === optionId ? null : optionMenuKey(value);
  let value3 =
    stateWithoutCard.dropdown === null
      ? stateWithoutCard
      : {
          ...stateWithoutCard,
          dropdown: {
            ...stateWithoutCard.dropdown,
            highlighted: value2,
          },
        };
  return commitDropdownOptions(value3, reads, everywhere, otherOptions, 'goesOn', undefined, {
    what: 'dropdownOptionRemoved',
    label: option.label,
    isSaved: false,
  });
}
export const rangesOtherThanIndex = (stretches?: Dynamic, ownIndex?: Dynamic) =>
  stretches.filter((stretch?: Dynamic, index?: Dynamic) => index !== ownIndex).map(({ range: range }: Dynamic) => range);
export const dropdownAtActiveCell = (state: PageState, reads: WorkbookReads) => dropdownAtCell(reads, activeAnchorCell(state, reads));
export const typedTextInCell = ({ mode: mode }: Dynamic) =>
  mode.kind === 'editing' && mode.text !== mode.textAtStart ? cleanEnteredCellText(mode.text) : null;
export const isCellTextUntouched = (state?: Dynamic) => typedTextInCell(state) === null;
export const closeDropdownList = (state: PageState) =>
  state.dropdown === null
    ? state
    : {
        ...state,
        dropdown: null,
      };
export const closeSidePane = (state: PageState) =>
  state.sidePane === null
    ? state
    : {
        ...state,
        sidePane: null,
      };
export const withDropdownPane = (state?: Dynamic, editor?: Dynamic) => ({
  ...state,
  sidePane: {
    kind: 'dropdown',
    editor: editor,
  },
});
export const entryCellHasDropdown = (state: PageState, reads: WorkbookReads) => reads.dropdownOf(activeAnchorCell(state, reads)) !== null;
export const toggleDropdownPane = (state: PageState, reads: WorkbookReads) =>
  state.sidePane?.kind !== 'dropdown' && entryCellHasDropdown(state, reads) ? withDropdownPane(state, null) : closeSidePane(state);
export const openDropdownEditor = (state: PageState, reads: ReadsWithTextMeasurer, editor?: Dynamic) =>
  withDropdownPane(
    {
      ...clearPassingNotice(scrollToShowActiveCell(state, reads)),
      dropdown: null,
      timesSidePaneAsked: state.timesSidePaneAsked + 1,
    },
    editor,
  );
export const openDropdownListOrEditor = (state: PageState, reads: ReadsWithTextMeasurer) =>
  dropdownAtActiveCell(state, reads) === null
    ? openDropdownEditorAt(closeDropdownList(state), reads, activeAnchorCell(state, reads))
    : openDropdownList(scrollToShowActiveCell(state, reads), reads);
export const editDropdownOfEntryCell = (state: PageState, reads: ReadsWithTextMeasurer) =>
  openDropdownEditorAt(state, reads, activeAnchorCell(state, reads));
export const chosenReadySetKey = (state: PageState, options?: Dynamic) =>
  dropdownEditorOfPane(state)?.isCustom === true ? null : readySetKeyOf(state, options);
export const dropdownCardRowsAt = (state: PageState, reads: WorkbookReads, rowKey?: Dynamic) => {
  let optionId = optionIdOfMenuKey(rowKey);
  if (optionId !== null) return optionColorCardRows(state, reads, optionId);
  return rowKey === 'startFromSet' ? readySetCardRows(state, reads) : [];
};
export const highlightStartFromSet = (state: PageState) =>
  state.dropdown === null
    ? state
    : {
        ...state,
        dropdown: {
          ...state.dropdown,
          highlighted: 'startFromSet',
        },
      };
export const unpinCardFromPointer = (state: PageState) =>
  state.dropdown?.isCardOfPointerAlone === true
    ? {
        ...state,
        dropdown: {
          ...state.dropdown,
          isCardOfPointerAlone: false,
        },
      }
    : state;
export const dropdownCard = {
  card: (input?: Dynamic) => input.dropdown?.card ?? null,
  isCardOfPointerAlone: (input?: Dynamic) => input.dropdown?.isCardOfPointerAlone === true,
  doKeysGoRound: (input?: Dynamic) => optionIdOfMenuKey(input.dropdown?.card?.ofRow ?? null) === null,
  withCard(state: PageState, card?: Dynamic) {
    if (state.dropdown === null) return state;
    let isPointerAlone = card !== null && (state.dropdown.card?.ofRow !== card.ofRow || state.dropdown.isCardOfPointerAlone);
    return {
      ...state,
      dropdown: {
        ...state.dropdown,
        card: card,
        isCardOfPointerAlone: isPointerAlone,
      },
    };
  },
  rowsAt: dropdownCardRowsAt,
  drawn: (state: PageState, reads: WorkbookReads) => drawDropdownCard(state, reads, dropdownListRows(state, reads) ?? []),
  take(state: PageState, reads: ReadsWithTextMeasurer, rowKey?: Dynamic, cell?: Dynamic, foundBy?: Dynamic, goesToCell?: Dynamic) {
    let optionId = optionIdOfMenuKey(state.dropdown?.card?.ofRow ?? null);
    let closedState = {
      ...clearPassingNotice(state),
      mode: NAVIGATING_MODE,
    };
    if (optionId !== null && goesToCell) return withNoEffects(moveActiveCellTo(closeDropdownList(closedState), reads, cell));
    if (optionId !== null) return takeColorCardRow(state, reads, optionId, rowKey);
    let readySet = state.readySets?.find(({ set: set }: Dynamic) => set.key === rowKey);
    if (readySet === undefined) return withNoEffects(state);
    let stateHighlighted = highlightStartFromSet(dropdownCard.withCard(closedState, null));
    return startDropdownFromSet(stateHighlighted, reads, readySet.set, cell);
  },
};
export const openCardOfHighlighted = (state: PageState, reads: WorkbookReads) => {
  let optionId = optionIdOfMenuKey(state.dropdown?.highlighted ?? null);
  return optionId === null ? state : openOptionColorCard(state, reads, optionId);
};
export const toggleOptionColorCard = (state: PageState, reads: WorkbookReads, optionId?: Dynamic) =>
  state.dropdown?.card?.ofRow === optionMenuKey(optionId) ? dropdownCard.withCard(state, null) : openOptionColorCard(state, reads, optionId);
export const dropdownEditTarget = ({ dropdownId: dropdownId }: Dynamic, cellsOfDropdown?: Dynamic) => ({
  dropdownId: dropdownId,
  stretches: cellsOfDropdown.stretches,
  indexOfOwnStretch: cellsOfDropdown.indexOfTheStretchWithTheCell,
  reach: 'everyCell',
});
export const isOptionLabelTaken = (options?: Dynamic, optionId?: Dynamic, label?: Dynamic) =>
  options.some((input?: Dynamic) => input.optionId !== optionId && isSameOptionLabel(input.label, cleanOptionLabel(label).trim()));
export const withReadySetsAsked = ({ state: state, effects: effects }: Dynamic) =>
  state.readySets !== null || (state.dropdown === null && state.sidePane === null)
    ? {
        state: state,
        effects: effects,
      }
    : {
        state: state,
        effects: [
          ...effects,
          {
            kind: 'readOffersUnderAt',
          },
        ],
      };
export const readySetsInOffers = (offers?: Dynamic) =>
  offers.flatMap((input?: Dynamic) => {
    if (input.kind === 'several') return readySetsInOffers(input.offers);
    return input.kind === 'dropdownOfSet'
      ? [
          {
            label: input.label,
            set: input.set,
          },
        ]
      : [];
  });
export const withReadySets = (state?: Dynamic, offers?: Dynamic) => ({
  ...state,
  readySets: readySetsInOffers(offers),
});
