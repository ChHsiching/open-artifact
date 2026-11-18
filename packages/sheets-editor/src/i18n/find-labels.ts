import type { Dynamic } from '../dynamic.ts';
import { translateMessage } from './messages.ts';
export function findMatchCounterText({ count: count, isCapped: isCapped, at: at }: Dynamic) {
  if (at === null && count > 0)
    return isCapped
      ? translateMessage(
          {
            defaultMessage: '{count}+',
            id: 'Rxin/NZUDF',
          },
          {
            count: count,
          },
        )
      : String(count);
  return isCapped
    ? translateMessage(
        {
          defaultMessage: '{at}/{count}+',
          id: 'JILpWSomXg',
        },
        {
          at: at ?? 0,
          count: count,
        },
      )
    : translateMessage(
        {
          defaultMessage: '{at}/{count}',
          id: 'qXhlpeqnk8',
        },
        {
          at: at ?? 0,
          count: count,
        },
      );
}
export function findMatchHeardAs({ count: count, isCapped: isCapped, at: at, cell: cell, shown: shown }: Dynamic) {
  if (count === 0) return findBarMessages.noMatches();
  if (at === null)
    return isCapped
      ? translateMessage(
          {
            defaultMessage: '{count, plural, one {# or more matches} other {# or more matches}}',
            id: 'YOSM40CxnE',
          },
          {
            count: count,
          },
        )
      : translateMessage(
          {
            defaultMessage: '{count, plural, one {# match} other {# matches}}',
            id: 'Q1nX2g7C+W',
          },
          {
            count: count,
          },
        );
  return isCapped
    ? translateMessage(
        {
          defaultMessage: '{at} of {count} or more, cell {cell}, {shown}',
          id: 'lja8oqQTRX',
        },
        {
          at: at,
          count: count,
          cell: cell,
          shown: shown,
        },
      )
    : translateMessage(
        {
          defaultMessage: '{at} of {count}, cell {cell}, {shown}',
          id: 'TCkgeNsG1X',
        },
        {
          at: at,
          count: count,
          cell: cell,
          shown: shown,
        },
      );
}
export const findBarMessages = {
  find: () =>
    translateMessage({
      defaultMessage: 'Find in sheet',
      id: 'ZQtn1aosGs',
    }),
  previous: () =>
    translateMessage({
      defaultMessage: 'Previous match',
      id: '9ajKg3qihT',
    }),
  next: () =>
    translateMessage({
      defaultMessage: 'Next match',
      id: 'VgEY4XvgJZ',
    }),
  close: () =>
    translateMessage({
      defaultMessage: 'Close find bar',
      id: 'vYu0l/x15+',
    }),
  findAndReplace: () =>
    translateMessage({
      defaultMessage: 'Find and replace',
      id: 'GGkRUQQ+ft',
    }),
  findWhat: () =>
    translateMessage({
      defaultMessage: 'Find',
      id: 'b8wdwj63ze',
    }),
  replaceWith: () =>
    translateMessage({
      defaultMessage: 'Replace with',
      id: 'yNFRVG7Hon',
    }),
  searchIn: () =>
    translateMessage({
      defaultMessage: 'Search in',
      id: 'D64RliqaNm',
    }),
  thisSheet: () =>
    translateMessage({
      defaultMessage: 'This sheet',
      id: '2a3YfbeIkL',
    }),
  allSheets: () =>
    translateMessage({
      defaultMessage: 'All sheets',
      id: 'RkfyweuDCN',
    }),
  matchCase: () =>
    translateMessage({
      defaultMessage: 'Match case',
      id: 'SjVqylw3Oc',
    }),
  matchEntireCell: () =>
    translateMessage({
      defaultMessage: 'Match entire cell',
      id: 'ac0y/wXfss',
    }),
  alsoInFormulas: () =>
    translateMessage({
      defaultMessage: 'Also search in formulas',
      id: '510inlY1/c',
    }),
  whyAlsoInFormulas: () =>
    translateMessage({
      defaultMessage: 'Always on while formulas are shown',
      id: 'wyKvKbI5mc',
    }),
  toReplace: () =>
    translateMessage({
      defaultMessage: 'Replace',
      id: '/6KCZWg5ww',
    }),
  replace: () =>
    translateMessage({
      defaultMessage: 'Replace',
      id: '78fr0I0BBX',
    }),
  replaceAllInSheet: () =>
    translateMessage({
      defaultMessage: 'Replace all in sheet',
      id: 'CyHZ52mtka',
    }),
  replaceAll: () =>
    translateMessage({
      defaultMessage: 'Replace all',
      id: 'T1EmXtRT0s',
    }),
  noMatches: () =>
    translateMessage({
      defaultMessage: 'No matches',
      id: 'ZaXupTffZD',
    }),
};
export const selectedCellsScopeLabel = (cells?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Selected cells ({cells})',
      id: 'i88OuJg/Bg',
    },
    {
      cells: cells,
    },
  );
export const searchInButtonLabel = (chosen?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Search in: {chosen}',
      id: 'sm0Pl92YNe',
    },
    {
      chosen: chosen,
    },
  );
