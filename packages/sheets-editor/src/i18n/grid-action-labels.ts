import type { Dynamic } from '../dynamic.ts';
import { translateMessage, joinMessageParts } from './messages.ts';
import { columnLetters } from '../model/a1-references.ts';
export function sortOrderLabel(valuesKind?: Dynamic, direction?: Dynamic) {
  switch (valuesKind) {
    case 'numbers':
      return direction === 'ascending'
        ? translateMessage({
            defaultMessage: 'Smallest first',
            id: 'Dw2eST8ryY',
          })
        : translateMessage({
            defaultMessage: 'Largest first',
            id: '5ntEturiZu',
          });
    case 'dates':
      return direction === 'ascending'
        ? translateMessage({
            defaultMessage: 'Oldest first',
            id: 'rH3J9mFvuI',
          })
        : translateMessage({
            defaultMessage: 'Newest first',
            id: 'POmx2LHTRA',
          });
    case 'times':
      return direction === 'ascending'
        ? translateMessage({
            defaultMessage: 'Earliest first',
            id: 'wnHGxKx4K3',
          })
        : translateMessage({
            defaultMessage: 'Latest first',
            id: 'zaF1FJicD3',
          });
    case 'text':
      return direction === 'ascending'
        ? translateMessage({
            defaultMessage: 'A to Z',
            id: 'NvvytC4Xjo',
          })
        : translateMessage({
            defaultMessage: 'Z to A',
            id: '4+oWddGEIp',
          });
    case 'options':
      return direction === 'ascending'
        ? translateMessage({
            defaultMessage: 'List order',
            id: 'sp1gaZg+Nr',
          })
        : translateMessage({
            defaultMessage: 'Reverse list order',
            id: 'LUQJmnjGT7',
          });
  }
}
export function truncateGraphemes(text?: Dynamic, maxCharacters?: Dynamic) {
  let graphemes = Array.from<Dynamic, Dynamic>(
    new (Intl.Segmenter as Dynamic)().segment(text),
    ({ segment: segment }: Dynamic) => segment,
  );
  return graphemes.length <= maxCharacters ? text : `${graphemes.slice(0, maxCharacters).join('').trimEnd()}…`;
}
export function rowsFieldTextParts(count?: Dynamic) {
  let parts = translateMessage(
    {
      defaultMessage: '{count, plural, one {{field} row} other {{field} rows}}',
      id: 'p6tL7SIpHA',
    },
    {
      count: count,
      field: ROWS_FIELD_PLACEHOLDER,
    },
  );
  let fieldIndex = Math.max(
    0,
    parts.findIndex((part?: Dynamic) => typeof part !== 'string'),
  );
  return [joinMessageParts(parts.slice(0, fieldIndex)), joinMessageParts(parts.slice(fieldIndex))];
}
export const editingCellOnSheetLabel = (cell?: Dynamic, sheet?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Editing {cell} on {sheet}',
      id: 'KdQvTZ1aJx',
    },
    {
      cell: cell,
      sheet: sheet,
    },
  );
export const editingCellLabel = (cell?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Editing {cell}',
      id: 'j2ODfneE/9',
    },
    {
      cell: cell,
    },
  );
export const cellEditorShortHint = () =>
  translateMessage({
    defaultMessage: '@ to insert, = for a formula',
    id: '7Z1ogKFTrY',
  });
export const cellEditorHint = () =>
  translateMessage({
    defaultMessage: 'Type a value, = for a formula, or @ to insert a person, date, or dropdown',
    id: 'QZbreTiH/4',
  });
export const insertChipLabel = (what?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{what, select, dropdown {Insert dropdown} person {Insert person} date {Insert date} other {Insert checkbox}}',
      id: '/i4/uUaF8f',
    },
    {
      what: what,
    },
  );
export const insertLinesLabel = (lines?: Dynamic, count?: Dynamic) =>
  lines === 'rows'
    ? translateMessage(
        {
          defaultMessage: '{count, plural, one {Insert row} other {Insert rows}}',
          id: 'Q3VbcqYIqZ',
        },
        {
          count: count,
        },
      )
    : translateMessage(
        {
          defaultMessage: '{count, plural, one {Insert column} other {Insert columns}}',
          id: 'MzJcardNCt',
        },
        {
          count: count,
        },
      );
export const rowsAboveLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Row above} other {# rows above}}',
      id: 'HK+wML55am',
    },
    {
      count: count,
    },
  );
export const rowsBelowLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Row below} other {# rows below}}',
      id: 'pl2WRHN6wS',
    },
    {
      count: count,
    },
  );
export const columnsLeftLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Column to the left} other {# columns to the left}}',
      id: 'U2UeVGJDIo',
    },
    {
      count: count,
    },
  );
export const columnsRightLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Column to the right} other {# columns to the right}}',
      id: 'pUQuQXuso3',
    },
    {
      count: count,
    },
  );
export const rowCountLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Row} other {# rows}}',
      id: '5d4jfHzofP',
    },
    {
      count: count,
    },
  );
export const columnCountLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Column} other {# columns}}',
      id: '85/7jzCQg0',
    },
    {
      count: count,
    },
  );
export const insertRowsAboveLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Insert row above} other {Insert # rows above}}',
      id: 't+8FgWIKbE',
    },
    {
      count: count,
    },
  );
export const insertRowsBelowLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Insert row below} other {Insert # rows below}}',
      id: 'T6lJpY+VG0',
    },
    {
      count: count,
    },
  );
export const insertColumnsLeftLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Insert column left} other {Insert # columns left}}',
      id: '8n3iyc4p5Q',
    },
    {
      count: count,
    },
  );
export const insertColumnsRightLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Insert column right} other {Insert # columns right}}',
      id: 'hs1s70jfcr',
    },
    {
      count: count,
    },
  );
export const moveRowsUpLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Move row up} other {Move # rows up}}',
      id: 'IbnRqui2Nr',
    },
    {
      count: count,
    },
  );
export const moveRowsDownLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Move row down} other {Move # rows down}}',
      id: 'rO+L5Cj9l0',
    },
    {
      count: count,
    },
  );
export const moveColumnsLeftLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Move column left} other {Move # columns left}}',
      id: '7hdWcV7tXS',
    },
    {
      count: count,
    },
  );
export const moveColumnsRightLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Move column right} other {Move # columns right}}',
      id: '9kHSuGumH4',
    },
    {
      count: count,
    },
  );
export const deleteRowsLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Delete row} other {Delete # rows}}',
      id: 'opogheqCkG',
    },
    {
      count: count,
    },
  );
export const deleteColumnsLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Delete column} other {Delete # columns}}',
      id: 'kyBgJLr3/O',
    },
    {
      count: count,
    },
  );
export const resizeColumnsLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Resize column} other {Resize # columns}}',
      id: 'lae8GCUBBJ',
    },
    {
      count: count,
    },
  );
export const rowsFromFirstLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, =0 {No rows} =1 {1 row} =2 {2 rows} one {Rows 1 to {last}} other {Rows 1 to {last}}}',
      id: 'H+TSuNytIa',
    },
    {
      count: count,
      last: String(count),
    },
  );
export const columnsFromFirstLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, =0 {No columns} =1 {1 column} =2 {2 columns} one {Columns A to {last}} other {Columns A to {last}}}',
      id: 'kpbrVkwPET',
    },
    {
      count: count,
      last: columnLetters(Math.max(0, count - 1)),
    },
  );
export const freezeRowsLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, =0 {Unfreeze rows} =1 {Freeze row 1} one {Freeze rows 1 to {last}} other {Freeze rows 1 to {last}}}',
      id: 'CjXNX8GOTo',
    },
    {
      count: count,
      last: String(count),
    },
  );
export const freezeColumnsLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage:
        '{count, plural, =0 {Unfreeze columns} =1 {Freeze column A} one {Freeze columns A to {last}} other {Freeze columns A to {last}}}',
      id: 'dirtHX//XU',
    },
    {
      count: count,
      last: columnLetters(Math.max(0, count - 1)),
    },
  );
export const timeValueLabel = (time?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Time, {time}',
      id: 'j464aluuLS',
    },
    {
      time: time,
    },
  );
export const decimalPlacesLimitText = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {The limit is # decimal place.} other {The limit is # decimal places.}}',
      id: 'Th/e4hWhfR',
    },
    {
      count: count,
    },
  );
export const toolUnavailableLabel = (tool?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{tool}, unavailable.',
      id: 'psVfNzWiwz',
    },
    {
      tool: tool,
    },
  );
export const enterTimeHint = (example?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Enter a time, such as {example}.',
      id: 'j3Pq7nfqyh',
    },
    {
      example: example,
    },
  );
export const resizeRowsLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Resize row} other {Resize # rows}}',
      id: 'mdCNqlRGF+',
    },
    {
      count: count,
    },
  );
export const sortMenuLabel = () =>
  translateMessage({
    defaultMessage: 'Sort',
    id: 'xn8Q2qgLFE',
  });
export const sortTableUnclearHint = () =>
  translateMessage({
    defaultMessage: 'The table for this cell isn’t clear. Select all the cells to sort, then use Custom sort.',
    id: 'F1NZETubq4',
  });
export const sortRangeLabel = () =>
  translateMessage({
    defaultMessage: 'Sort range',
    id: 'btjrqFR8AZ',
  });
export const sortSheetLabel = () =>
  translateMessage({
    defaultMessage: 'Sort sheet',
    id: 'Tmgcec9uzN',
  });
export const byColumnLabel = (column?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'By column {column}',
      id: 'EInADw5Q0O',
    },
    {
      column: column,
    },
  );
export const byHeadingLabel = (heading?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'By “{heading}”',
      id: 'xTNJFt/EuR',
    },
    {
      heading: heading,
    },
  );
export const ascendingLabel = () =>
  translateMessage({
    defaultMessage: 'Ascending',
    id: 'I9vb5JJE/U',
  });
export const descendingLabel = () =>
  translateMessage({
    defaultMessage: 'Descending',
    id: 'Kv55Kps4Ah',
  });
export const sortByText = () =>
  translateMessage({
    defaultMessage: 'Sort by',
    id: 'a9fGMOM8q8',
  });
export const columnLetterLabel = (column?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Column {column}',
      id: 'Z+DwYSfjt8',
    },
    {
      column: column,
    },
  );
export const sortCellsInsteadQuestion = (cells?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Sort {cells} instead?',
      id: 'VwuU2X9CVu',
    },
    {
      cells: cells,
    },
  );
export const dataNextToCellsWarning = (cells?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'There’s data next to {cells}. Sorting only these cells would separate them from the rest of their rows.',
      id: 'TCypuuEHx9',
    },
    {
      cells: cells,
    },
  );
export const sortCellsLabel = (cells?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Sort {cells}',
      id: 'KWMVKbOBfw',
    },
    {
      cells: cells,
    },
  );
export const sortCellsOnlyLabel = (cells?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Sort {cells} only',
      id: 'HwOXC9bT1e',
    },
    {
      cells: cells,
    },
  );
export const wholeNumberBetweenHint = (smallest?: Dynamic, largest?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Enter a whole number from {smallest} to {largest}.',
      id: 'BXrulCaiQs',
    },
    {
      smallest: smallest,
      largest: largest,
    },
  );
export const digitsBetweenHint = (smallest?: Dynamic, largest?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Enter digits only, from {smallest} to {largest}, such as 120.',
      id: 'QJItV7rV7f',
    },
    {
      smallest: smallest,
      largest: largest,
    },
  );
export const HEADING_LABEL_MAX_CHARACTERS = 24;
export const SHEET_NAME_IN_NOTICE_MAX_CHARACTERS = 32;
export const DROPDOWN_OPTION_IN_NOTICE_MAX_CHARACTERS = 32;
export const PLACED_VIEW_NAME_IN_NOTICE_MAX_CHARACTERS = 32;
export const PERSON_NAME_IN_NOTICE_MAX_CHARACTERS = 32;
export const figureNameLabel = (figure?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{figure, select, sum {Sum} average {Average} min {Min} max {Max} other {Count}}',
      id: 'SJ8F3Yr1VZ',
    },
    {
      figure: figure,
    },
  );
export const figureWithValueLabel = (figure?: Dynamic, written?: Dynamic) =>
  translateMessage(
    {
      defaultMessage:
        '{figure, select, sum {Sum {written}} average {Average {written}} min {Min {written}} max {Max {written}} other {Count {written}}}',
      id: '3VSiQ3ZdeR',
    },
    {
      figure: figure,
      written: written,
    },
  );
export const figureForSelectionLabel = (figure?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{figure} for the selected cells',
      id: 'V4PmjXrr/k',
    },
    {
      figure: figure,
    },
  );
export const selectionSummaryLabel = () =>
  translateMessage({
    defaultMessage: 'Summary of the selected cells',
    id: 'fX2hBE5ED9',
  });
export const addFormulaUnderNumbersLabel = (heading?: Dynamic) =>
  heading === null
    ? translateMessage({
        defaultMessage: 'Add a formula under the numbers',
        id: '8zcgxGIHkK',
      })
    : translateMessage(
        {
          defaultMessage: '{heading}: add a formula under the numbers',
          id: 'TL92B5GFil',
        },
        {
          heading: truncateGraphemes(heading, HEADING_LABEL_MAX_CHARACTERS),
        },
      );
export const shortHeadingLabel = (heading?: Dynamic) => truncateGraphemes(heading, HEADING_LABEL_MAX_CHARACTERS);
export const ROWS_FIELD_PLACEHOLDER = [
  {
    setApart: '',
  },
];
export const addColumnsLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Add # column} other {Add # columns}}',
      id: 'iyP9oa5IB5',
    },
    {
      count: count,
    },
  );
export const upToAtATimeHint = (most?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Up to {most, number} at a time',
      id: 'YHxAbKkvU/',
    },
    {
      most: most,
    },
  );
export const enterNumberUpToHint = (most?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Enter a number from 1 to {most, number}',
      id: 'G12J9/sb70',
    },
    {
      most: most,
    },
  );
export const errorCountLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {# error} other {# errors}}',
      id: 'NGpjD2CoP3',
    },
    {
      count: count,
    },
  );
export const writingFormulasLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Writing # formula…} other {Writing # formulas…}}',
      id: 'EY+f+rW9dH',
    },
    {
      count: count,
    },
  );
export const keepFixesLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, =1 {Keep} one {Keep all # fix} other {Keep all # fixes}}',
      id: 'Lj0j+SWLX4',
    },
    {
      count: count,
    },
  );
