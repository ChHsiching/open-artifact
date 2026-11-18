import type { Dynamic } from '../dynamic.ts';
import { sortOrderLabel } from '../i18n/grid-action-labels.ts';
import { translateMessage, joinMessageParts, MESSAGE_LOCALE } from '../i18n/messages.ts';
import { filterMessages, describeFilterLineAlternatives } from './filter-messages.ts';
import { ruleColumnName } from '../messages/conditional-format.ts';
export function sortDirectionWords(holds?: Dynamic, direction?: Dynamic) {
  if (holds !== null) return sortOrderLabel(holds, direction);
  return direction === 'ascending'
    ? translateMessage({
        defaultMessage: 'Ascending',
        id: 'N4wJOxRnC1',
      })
    : translateMessage({
        defaultMessage: 'Descending',
        id: '/A2U0xMiaS',
      });
}
export function filterViewChoiceLabel(choice?: Dynamic) {
  switch (choice.kind) {
    case 'mine':
      return sortAndFilterMessages.onlyMine();
    case 'mineSorted':
      return translateMessage(
        {
          defaultMessage: 'Only mine, by {column}',
          id: 'graNsSixAp',
        },
        {
          column: choice.column,
        },
      );
    case 'allBut':
      return translateMessage(
        {
          defaultMessage: 'Not {label}',
          id: 'KVj+dGOBuC',
        },
        {
          label: choice.label,
        },
      );
    case 'only':
      return choice.label;
    case 'sorted':
      return translateMessage(
        {
          defaultMessage: 'Sort by {column}',
          id: '260esUZfLY',
        },
        {
          column: choice.column,
        },
      );
  }
}
export function sortKeysWords([firstKey, ...otherKeys]: Dynamic, isAlone?: Dynamic) {
  if (firstKey === undefined) return null;
  let firstWords = isAlone
    ? translateMessage(
        {
          defaultMessage: 'Sort by {column}',
          id: '+epa2/KNxw',
        },
        {
          column: sortKeyWords(firstKey),
        },
      )
    : translateMessage(
        {
          defaultMessage: 'by {column}',
          id: 'LUBWLcPY35',
        },
        {
          column: sortKeyWords(firstKey),
        },
      );
  return withThenByWords(firstWords, otherKeys);
}
export function withThenByWords(firstWords?: Dynamic, otherKeys?: Dynamic) {
  return otherKeys.reduce(
    (input?: Dynamic, options?: Dynamic) =>
      translateMessage(
        {
          defaultMessage: '{before}, then {column}',
          id: 'qzFZJnigGD',
        },
        {
          before: input,
          column: sortKeyWords(options),
        },
      ),
    firstWords,
  );
}
export function filterAndSortSummaryParts({ lines: lines, sortBy: sortBy }: Dynamic) {
  let sortWords = sortKeysWords(sortBy, lines.length === 0);
  return lines.length === 0
    ? {
        first: sortWords ?? filterMessages.allRows(),
        thenSort: null,
      }
    : {
        first: joinAsUnitList(lines.map((input?: Dynamic) => joinMessageParts(describeFilterLineAlternatives(input)))),
        thenSort: sortWords,
      };
}
export function filterAndSortSummary(filterAndSort?: Dynamic) {
  let { first: first, thenSort: thenSort } = filterAndSortSummaryParts(filterAndSort);
  return thenSort === null ? first : joinAsUnitList([first, thenSort]);
}
export const customSortMessages = {
  customSort: () =>
    translateMessage({
      defaultMessage: 'Custom sort',
      id: '+l/tNxISuS',
    }),
  appliesTo: () =>
    translateMessage({
      defaultMessage: 'Applies to',
      id: 'jAyRMyAVC2',
    }),
  cells: () =>
    translateMessage({
      defaultMessage: 'Cells',
      id: 'hbm0DNvbHH',
    }),
  useSelection: () =>
    translateMessage({
      defaultMessage: 'Use selection',
      id: 'BK7RNr6G8G',
    }),
  cellsNotFound: () =>
    translateMessage({
      defaultMessage: 'Enter cells like A2:D20.',
      id: 'cJipJxw0Mp',
    }),
  headerRow: () =>
    translateMessage({
      defaultMessage: 'Header row',
      id: '5M5/edml3D',
    }),
  sortBy: () =>
    translateMessage({
      defaultMessage: 'Sort by',
      id: 'UttQy+KeSu',
    }),
  thenBy: () =>
    translateMessage({
      defaultMessage: 'Then by',
      id: 'UJcjXcwLqv',
    }),
  addColumn: () =>
    translateMessage({
      defaultMessage: 'Sort by another column',
      id: '85Lqd+Uir5',
    }),
  sortCells: () =>
    translateMessage({
      defaultMessage: 'Sort',
      id: 'R9nmYgVXF2',
    }),
  keysThatMove: () =>
    translateMessage({
      defaultMessage: 'Use the up and down arrow keys to move it.',
      id: 'uWw+xP0N6j',
    }),
};
export const columnLettersLabel = (letters?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Column {letters}',
      id: 'ZRJxTihJCV',
    },
    {
      letters: letters,
    },
  );
export const labeledSortColumnWords = (label?: Dynamic, column?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{label}: {column}',
      id: 'uejRhJTxo2',
    },
    {
      label: label,
      column: column,
    },
  );
export const sortOrderOfColumnLabel = (column?: Dynamic, direction?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Order of {column}: {direction}',
      id: 'gCmbSkn1um',
    },
    {
      column: column,
      direction: direction,
    },
  );
export const removeSortColumnLabel = (column?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Remove {column} from the sort',
      id: 'wUpSuFcVVg',
    },
    {
      column: column,
    },
  );
export const reorderSortColumnLabel = (column?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Reorder {column}',
      id: 'KM4xGxgZK2',
    },
    {
      column: column,
    },
  );
export const quotedFilterWords = (words?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '“{words}”',
      id: 'IHDZaAzRxR',
    },
    {
      words: words,
    },
  );
export const sortAndFilterMessages = {
  sortAndFilter: () =>
    translateMessage({
      defaultMessage: 'Filter',
      id: 'IO44/rneD7',
    }),
  whichRowsToShow: () =>
    translateMessage({
      defaultMessage: 'Which rows to show',
      id: 'PK7wQVCsG7',
    }),
  filtered: () =>
    translateMessage({
      defaultMessage: 'Filtered',
      id: 'dfSMJvXi2E',
    }),
  filterByColumn: () =>
    translateMessage({
      defaultMessage: 'Filter by column',
      id: 'KvzUM89dCa',
    }),
  sayWhichRowsToShow: () =>
    translateMessage({
      defaultMessage: 'Say which rows to show, and in what order',
      id: 'I2Oo96/H7a',
    }),
  waysToSortAndFilter: () =>
    translateMessage({
      defaultMessage: 'Ways to sort and filter',
      id: '4oRCynJ3pr',
    }),
  suggested: () =>
    translateMessage({
      defaultMessage: 'Suggested',
      id: 'wJ7vhypTBr',
    }),
  onlyMine: () =>
    translateMessage({
      defaultMessage: 'Only mine',
      id: 'Hg4/vPCyV1',
    }),
  noTable: () =>
    translateMessage({
      defaultMessage: 'No table here to filter',
      id: 'IWeLjLwBqR',
    }),
  notUnderstood: () =>
    translateMessage({
      defaultMessage: 'Couldn’t understand that. Try naming a column.',
      id: '2jBU8SX6lY',
    }),
  agentIsWorking: () =>
    translateMessage({
      defaultMessage: 'Agent is working…',
      id: 'vc0IHKihpG',
    }),
  callFailed: () =>
    translateMessage({
      defaultMessage: 'Couldn’t reach Agent. Try again.',
      id: 'A5SkxctgGc',
    }),
  callRateLimited: () =>
    translateMessage({
      defaultMessage: 'Agent is temporarily unavailable. Try again later.',
      id: 'LUJnRAzRGK',
    }),
  wordsNotUnderstood: (input?: Dynamic) =>
    translateMessage(
      {
        defaultMessage: 'Couldn’t understand {words}.',
        id: 'PsmATlHCcO',
      },
      {
        words: new (Intl.ListFormat as Dynamic)(MESSAGE_LOCALE).format(input.map(quotedFilterWords)),
      },
    ),
  tableHasBlankRows: (input?: Dynamic) =>
    translateMessage(
      {
        defaultMessage:
          '{count, plural, one {Can’t sort this table while it has a blank row.} other {Can’t sort this table while it has blank rows.}}',
        id: '2/P/UNgigV',
      },
      {
        count: input,
      },
    ),
  cannotEdit: () =>
    translateMessage({
      defaultMessage: 'Can’t sort because you can’t edit this Sheet.',
      id: 'TG4yDHr/Jn',
    }),
};
export const sortByColumnLabel = ({ column: column, direction: direction, holds: holds }: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Sort by {column}: {direction}',
      id: 'cWmPG/xFlY',
    },
    {
      column: ruleColumnName(column),
      direction: sortDirectionWords(holds, direction),
    },
  );
export const rowCountWords = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {# row} other {# rows}}',
      id: 'gSxh2fW9E+',
    },
    {
      count: count,
    },
  );
export const sortKeyWords = ({ column: column, direction: direction, holds: holds }: Dynamic) =>
  direction === 'ascending'
    ? ruleColumnName(column)
    : translateMessage(
        {
          defaultMessage: '{column} ({direction})',
          id: 'WXXyHiMuTQ',
        },
        {
          column: ruleColumnName(column),
          direction: sortDirectionWords(holds, direction),
        },
      );
export const sortedByWords = ([firstKey, ...otherKeys]: Dynamic) =>
  withThenByWords(
    translateMessage(
      {
        defaultMessage: 'Sorted by {column}',
        id: '8Vfzelj23h',
      },
      {
        column: sortKeyWords(firstKey),
      },
    ),
    otherKeys,
  );
export const joinAsUnitList = (parts?: Dynamic) =>
  new (Intl.ListFormat as Dynamic)(MESSAGE_LOCALE, {
    type: 'unit',
  }).format(parts);
