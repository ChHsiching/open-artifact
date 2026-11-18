import { AgentMark } from '../kit/agent-mark.tsx';
import { Avatar } from '../kit/avatar.tsx';
import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import {
  withListCardIds,
  ListRowLead,
  ListRowLabel,
  ListRowCaret,
  ListRowSwatches,
  ListRowQuietText,
  OptionsListCard,
  ListRow,
  ListHeading,
  ListGroup,
  ListSeparator,
  useLastNonNull,
  useListCardHover,
  ListUnderCell,
} from '../ui/list-under-cell.ts';
import {
  personAlreadyInCellText,
  keepAsTextLabel,
  opensMoreRowsLabel,
  atMenuSectionTitle,
  peopleForCellLabel,
  insertInCellLabel,
} from '../i18n/menu-labels.ts';
import { peoplePickerMessages, personRowLabel } from '../i18n/chip-labels.ts';
import {
  isPeopleSearchLongEnough,
  optionMarksOfOffer,
  peopleListRowKey,
  groupOfInsertOffer,
  groupOfPeopleListRow,
  PEOPLE_LIST_GROUP_ORDER,
} from './people-list.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { ASK_AGENT_ICON_SIZE } from '../agent/ask-agent-menu.ts';
export function peopleListCardIds({ rows: rows, highlightedRow: highlightedRow, card: card }: Dynamic) {
  let row = rows[highlightedRow];
  let highlightedRowId = row === undefined ? null : peopleListRowElementId(row);
  return withListCardIds(
    {
      id: PEOPLE_LIST_ID,
      highlightedRowId: highlightedRowId,
    },
    card,
  );
}
export function peopleListNote({
  isNothingFound: isNothingFound,
  foundInField: foundInField,
  isOfPeopleAlone: isOfPeopleAlone,
  searchedFor: searchedFor,
}: Dynamic) {
  if (foundInField !== null) return personAlreadyInCellText(foundInField.name);
  if (!isNothingFound) return null;
  if (!isOfPeopleAlone) return peoplePickerMessages.noMatches();
  return isPeopleSearchLongEnough(searchedFor) ? peoplePickerMessages.noMatchingPeople() : peoplePickerMessages.keepTyping();
}
export function peopleListRowWords(row?: Dynamic) {
  switch (row.kind) {
    case 'keepAsText':
      return keepAsTextLabel(row.text);
    case 'offer':
      return row.offer.kind === 'several' ? opensMoreRowsLabel(row.offer.spokenLabel) : row.offer.label;
    case 'person':
      return personRowLabel(row.profile.name, personTagOf(row.profile), row.isHeldByCell);
  }
}
export function PeopleListRowContent({ row: row, isCardBeside = true }: Dynamic) {
  if (row.kind === 'keepAsText')
    return jsxs(Fragment, {
      children: [
        jsx(ListRowLead, {
          icon: 'PlainText',
          isQuiet: true,
        }),
        jsx(ListRowLabel, {
          children: keepAsTextLabel(row.text),
        }),
      ],
    });
  if (row.kind === 'offer' && row.offer.kind === 'several')
    return jsxs(Fragment, {
      children: [
        jsx('span', {
          'aria-hidden': true,
          className: 'flex min-w-0 flex-1 text-secondary',
          children: jsx(ListRowLabel, {
            children: row.offer.label,
          }),
        }),
        jsx('span', {
          className: 'sr-only',
          children: opensMoreRowsLabel(row.offer.spokenLabel),
        }),
        jsx(ListRowCaret, {
          isCardBeside: isCardBeside,
        }),
      ],
    });
  if (row.kind === 'offer' && row.offer.kind === 'askAgent')
    return jsxs(Fragment, {
      children: [
        jsx(ListRowLead, {
          icon: jsx(AgentMark, {
            size: ASK_AGENT_ICON_SIZE,
          }),
        }),
        jsx(ListRowLabel, {
          children: row.offer.label,
        }),
      ],
    });
  if (row.kind === 'offer') {
    let { kind: offerKind } = row.offer;
    return jsxs(Fragment, {
      children: [
        jsx(ListRowLead, {
          icon: offerKind === 'calendar' || offerKind === 'day' ? 'Calendar' : offerKind === 'checkbox' ? 'CheckSquare' : 'Dropdown',
          isQuiet: true,
        }),
        jsx(ListRowLabel, {
          children: row.offer.label,
        }),
        row.offer.kind === 'dropdownOfSet' &&
          jsx(ListRowSwatches, {
            marks: optionMarksOfOffer(row.offer),
          }),
      ],
    });
  }
  let { name: personName, avatarUrl: avatarUrl } = row.profile;
  let personTag = personTagOf(row.profile);
  return jsxs(Fragment, {
    children: [
      jsx(ListRowLead, {
        icon: jsx(Avatar, {
          name: personName,
          src: avatarUrl,
          size: 'xs',
          'aria-hidden': true,
        }),
      }),
      jsxs('span', {
        'aria-hidden': true,
        className: 'flex min-w-0 flex-1 items-center gap-xs',
        children: [
          jsx(ListRowLabel, {
            children: personName,
          }),
          personTag !== null &&
            jsx(ListRowQuietText, {
              children: peoplePickerMessages[personTag](),
            }),
          row.isHeldByCell &&
            jsx(Icon, {
              name: 'Check',
              size: 'sm',
              bold: true,
              className: 'text-accent',
            }),
        ],
      }),
      jsx('span', {
        className: 'sr-only',
        children: personRowLabel(personName, personTag, row.isHeldByCell),
      }),
    ],
  });
}
export function peopleListSections({
  rows: rows,
  highlightedRow: highlightedRow,
  card: card,
  search: search,
  isNothingFound: isNothingFound,
  foundInField: foundInField,
  isOfPeopleAlone: isOfPeopleAlone,
  searchedFor: searchedFor,
  anchor: anchor,
  isCardBeside: isCardBeside,
  onRowChosen: onRowChosen,
  onRowPointedAt: onRowPointedAt,
  onOpenerLeft: onOpenerLeft,
  onCardRowChosen: onCardRowChosen,
  onCardRowPointedAt: onCardRowPointedAt,
  onPointerInOrOut: onPointerInOrOut,
}: Dynamic) {
  let cardOfRow = (row?: Dynamic) =>
    card !== null &&
    card.ofRow === peopleListRowKey(row) &&
    row.kind === 'offer' &&
    jsx(
      OptionsListCard,
      {
        listId: PEOPLE_LIST_ID,
        card: card,
        label: atMenuSectionTitle(groupOfInsertOffer(row.offer)) ?? row.offer.label,
        rowId: peopleListRowElementId(row),
        cell: anchor,
        isBeside: isCardBeside,
        lead: DROPDOWN_ROW_LEAD,
        onRowChosen: onCardRowChosen,
        onRowPointedAt: onCardRowPointedAt,
        onPointerInOrOut: onPointerInOrOut,
      },
      card.ofRow,
    );
  let rowElements = rows.map(
    (row?: Dynamic, rowIndex?: Dynamic) => ({
      section: groupOfPeopleListRow(row),
      element: jsx(
        ListRow,
        {
          id: peopleListRowElementId(row),
          placeInList: rowIndex + 1,
          rowsInList: rows.length,
          isHighlighted: rowIndex === highlightedRow && (card === null || card.highlightedRow === null),
          hasCardOpen: card?.ofRow === peopleListRowKey(row),
          onChosen: () => onRowChosen(peopleListRowKey(row)),
          isOnlyTintedByPointer: true,
          tellsOfEveryMove: true,
          onPointedAt: () => onRowPointedAt(peopleListRowKey(row)),
          ...(row.kind === 'offer' &&
            row.offer.kind === 'several' && {
              onPointerLeave: onOpenerLeft,
            }),
          children: jsx(PeopleListRowContent, {
            row: row,
            isCardBeside: isCardBeside,
          }),
        },
        peopleListRowKey(row),
      ),
    }),
  );
  let note = peopleListNote({
    isNothingFound: isNothingFound,
    foundInField: foundInField,
    isOfPeopleAlone: isOfPeopleAlone,
    searchedFor: searchedFor,
  });
  return {
    cardOfRow: rows.map(cardOfRow),
    sections: jsxs(Fragment, {
      children: [
        note !== null &&
          jsx(ListHeading, {
            children: note,
          }),
        PEOPLE_LIST_GROUP_ORDER.map((section?: Dynamic) => {
          let sectionRows = rowElements.filter((rowElement?: Dynamic) => rowElement.section === section);
          return sectionRows.length === 0
            ? null
            : jsx(
                ListGroup,
                {
                  headingId: `${PEOPLE_LIST_ID}-heading-${section}`,
                  heading: isOfPeopleAlone ? null : atMenuSectionTitle(section),
                  children: sectionRows.map(({ element: element }: Dynamic) => element),
                },
                section,
              );
        }),
      ],
    }),
    foot: jsxs(Fragment, {
      children: [
        search === 'underWay' &&
          jsx(ListHeading, {
            children: peoplePickerMessages.searching(),
          }),
        rowElements.some(({ section: section }: Dynamic) => section === null) &&
          (isNothingFound || search === 'underWay' || rowElements.some(({ section: section }: Dynamic) => section !== null)) &&
          jsx(ListSeparator, {}),
        rowElements.filter(({ section: section }: Dynamic) => section === null).map(({ element: element }: Dynamic) => element),
      ],
    }),
  };
}
export function peopleListMostHeight(rows?: Dynamic) {
  let sections = rows.map(groupOfPeopleListRow).filter((section?: Dynamic) => section !== null);
  let dropdownSections = sections.filter((section?: Dynamic) => PEOPLE_LIST_GROUP_ORDER.indexOf(section) <= DROPDOWNS_GROUP_INDEX);
  if (sections.length - dropdownSections.length <= 1) return;
  let headingsHeight =
    new (Set as Dynamic)(dropdownSections.filter((section?: Dynamic) => atMenuSectionTitle(section) !== null)).size *
      GROUP_HEADING_HEIGHT_PX +
    PEOPLE_LIST_EXTRA_HEIGHT_PX;
  return `calc(${String(dropdownSections.length)} * var(--ui-h-control) + ${String(headingsHeight)}px)`;
}
export function peopleListRowHandlers(
  { rows: rows, card: card, isCardOfPointerAlone: isCardOfPointerAlone }: Dynamic,
  isPointerFine?: Dynamic,
  cardPlace?: Dynamic,
  handlers?: Dynamic,
) {
  return {
    onRowChosen(rowKey?: Dynamic) {
      cardPlace.overCard();
      if (!isPointerFine && card?.ofRow === rowKey) handlers.onCardShut();
      else handlers.onRowChosen(rowKey);
    },
    onRowPointedAt(rowKey?: Dynamic) {
      if (!isPointerFine) return;
      let row = rows.find((row2?: Dynamic) => peopleListRowKey(row2) === rowKey);
      if (row?.kind === 'offer' && row.offer.kind === 'several') cardPlace.overOpener(rowKey);
      else cardPlace.overOtherRow();
    },
    onCardRowPointedAt: cardPlace.overCard,
    onRowsScrolled(rowsElement?: Dynamic) {
      if (card === null) return;
      if (!isCardOfPointerAlone) return cardPlace.rowsScrolled(rowsElement.ownerDocument.getElementById(peopleListElementId(card.ofRow)));
      cardPlace.overCard();
      return handlers.onCardShut();
    },
    onPointerInOrOut(isIn?: Dynamic) {
      if (isIn) cardPlace.overCard();
      else if (isCardOfPointerAlone) cardPlace.overOtherRow();
    },
  };
}
export const PEOPLE_LIST_ID = 'people-list';
export const peopleListElementId = (rowKey?: Dynamic) => `${PEOPLE_LIST_ID}-${rowKey}`;
export const peopleListRowElementId = (row?: Dynamic) => peopleListElementId(peopleListRowKey(row));
export const EMPTY_PEOPLE_LIST = {
  cell: '',
  under: 'cell',
  rows: [],
  highlightedRow: 0,
  card: null,
  isCardOfPointerAlone: false,
  isNothingFound: false,
  search: 'none',
  searchedFor: '',
  isOfPeopleAlone: false,
  inField: null,
  chipGoneTo: null,
  foundInField: null,
};
export const personTagOf = ({ isViewer: isViewer, isGuest: isGuest }: Dynamic) => (isViewer ? 'you' : isGuest ? 'guest' : null);
export const isPeopleListShown = ({ inField: inField, rows: rows, isNothingFound: isNothingFound, search: search }: Dynamic) =>
  inField === null || rows.length > 0 || isNothingFound || search === 'underWay';
export const peopleListLabel = ({ isOfPeopleAlone: isOfPeopleAlone, cell: cell }: Dynamic) =>
  isOfPeopleAlone ? peopleForCellLabel(cell) : insertInCellLabel(cell);
export const DROPDOWN_ROW_LEAD = jsx(ListRowLead, {
  icon: 'Dropdown',
  isQuiet: true,
});
export const DROPDOWNS_GROUP_INDEX = PEOPLE_LIST_GROUP_ORDER.indexOf('dropdowns');
export const GROUP_HEADING_HEIGHT_PX = 25;
export const PEOPLE_LIST_EXTRA_HEIGHT_PX = 28;
export const PeopleList = React.memo(function ({
  list: list,
  cellAnchor: cellAnchor,
  formulaBarAnchor: formulaBarAnchor,
  cellElementId: cellElementId,
  isCardBeside: isCardBeside,
  onRoomBesideMeasured: onRoomBesideMeasured,
  onRowChosen: onRowChosen,
  onCardAsked: onCardAsked,
  onCardRowChosen: onCardRowChosen,
  onCardShut: onCardShut,
  onShut: onShut,
}: Dynamic) {
  let listShown = useLastNonNull(list) ?? EMPTY_PEOPLE_LIST;
  let rowsListed = list?.rows.map((row?: Dynamic) => (row.kind === 'keepAsText' ? row.text : peopleListRowKey(row))).join() ?? null;
  let cardPlace = useListCardHover({
    rowsListed: rowsListed,
    isOpen: list !== null && list.card !== null,
    onAsked: onCardAsked,
    onShut: onCardShut,
  });
  let { onRowsScrolled: onRowsScrolled, ...rowHandlers } = peopleListRowHandlers(listShown, isCardBeside, cardPlace, {
    onRowChosen: onRowChosen,
    onCardShut: onCardShut,
  });
  let anchor = listShown.under === 'cell' ? cellAnchor : formulaBarAnchor;
  let {
    sections: sections,
    foot: foot,
    cardOfRow: cardOfRow,
  } = peopleListSections({
    ...listShown,
    anchor: anchor,
    isCardBeside: isCardBeside,
    ...rowHandlers,
    onOpenerLeft: cardPlace.offOpener,
    onCardRowChosen: onCardRowChosen,
  });
  let listUnderCell = jsx(ListUnderCell, {
    id: PEOPLE_LIST_ID,
    isOpen: list !== null && isPeopleListShown(list),
    hasRows: listShown.rows.length > 0,
    anchor: anchor,
    cellElementId: cellElementId,
    label: peopleListLabel(listShown),
    className:
      (listShown.inField === null ? 'w-[280px]' : 'w-[var(--anchor-width)] max-w-none min-w-[280px]') +
      (listShown.searchedFor === '' ? '' : ' max-h-[min(450px,var(--available-height))]'),
    isMovedOnlyAsFarAsNeeded: listShown.inField !== null,
    onShut: onShut,
    foot: foot,
    mostHeightOfRows: listShown.searchedFor === '' ? peopleListMostHeight(listShown.rows) : undefined,
    onRowsScrolled: onRowsScrolled,
    onRoomBesideMeasured: onRoomBesideMeasured,
    onPointerInOrOut: rowHandlers.onPointerInOrOut,
    children: sections,
  });
  return jsxs(Fragment, {
    children: [listUnderCell, list !== null && cardOfRow],
  });
});
