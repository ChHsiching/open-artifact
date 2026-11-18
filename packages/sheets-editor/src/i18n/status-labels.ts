import { likelyHasKeyboard } from '../kit/platform.ts';
import type { Dynamic } from '../dynamic.ts';
import { translateMessage } from './messages.ts';
import { figureWithValueLabel, truncateGraphemes, HEADING_LABEL_MAX_CHARACTERS } from './grid-action-labels.ts';
import { formatNumberWithSigns } from '../format/number-signs.ts';
import { selectionWithHiddenLinesWords } from '../messages/line-groups.ts';
export function selectionSummaryText(summary?: Dynamic) {
  switch (summary.kind) {
    case 'errors':
      return translateMessage(
        {
          defaultMessage: '{count, plural, one {# error} other {# errors}}',
          id: 'VlW3/QLJ2H',
        },
        {
          count: summary.count,
        },
      );
    case 'sum':
      return summary.heading === null
        ? figureWithValueLabel('sum', formatNumberWithSigns(summary.sum, summary.signsOfNumbers))
        : translateMessage(
            {
              defaultMessage: '{heading}: Sum {sum}',
              id: 'IYVyDT2oVV',
            },
            {
              heading: truncateGraphemes(summary.heading, HEADING_LABEL_MAX_CHARACTERS),
              sum: formatNumberWithSigns(summary.sum, summary.signsOfNumbers),
            },
          );
    case 'checked':
      return translateMessage(
        {
          defaultMessage: '{count, plural, one {#/{checkboxCount, number} checked} other {#/{checkboxCount, number} checked}}',
          id: '3IgPf1umXu',
        },
        {
          count: summary.count,
          checkboxCount: summary.checkboxCount,
        },
      );
    case 'duplicates':
      return translateMessage(
        {
          defaultMessage: '{count, plural, one {# duplicate} other {# duplicates}}',
          id: '0vvS3iBWRO',
        },
        {
          count: summary.count,
        },
      );
    case 'empty':
      return translateMessage(
        {
          defaultMessage: '{count, plural, one {# empty} other {# empty}}',
          id: 'JnYooKJLr5',
        },
        {
          count: summary.count,
        },
      );
  }
}
export function severalRangesSelectedText(
  { rangeCount: rangeCount, cellCount: cellCount, lastRange: lastRange }: Dynamic,
  summary?: Dynamic,
) {
  let selected = translateMessage(
    {
      defaultMessage: '{rangeCount, plural, one {# group selected} other {# groups selected}}, {cellCount, number} cells. Latest: {lastRange}',
      id: 'MnTMWToY1E',
    },
    {
      rangeCount: rangeCount,
      cellCount: cellCount,
      lastRange: lastRange,
    },
  );
  return summary === null
    ? selected
    : translateMessage(
        {
          defaultMessage: '{selected}. {summary}',
          id: '6NKrsJFlKx',
        },
        {
          selected: selected,
          summary: selectionSummaryText(summary),
        },
      );
}
export function selectionWithSummaryText(selection?: Dynamic, summary?: Dynamic, hiddenLines?: Dynamic) {
  let selected = selectionWithHiddenLinesWords(selection, hiddenLines);
  if (summary === null) return selected;
  return summary.kind === 'checked'
    ? translateMessage(
        {
          defaultMessage:
            '{count, plural, one {{selected}. # of {checkboxCount, number} checked} other {{selected}. # of {checkboxCount, number} checked}}',
          id: 'IZnh+fTHlb',
        },
        {
          selected: selected,
          count: summary.count,
          checkboxCount: summary.checkboxCount,
        },
      )
    : translateMessage(
        {
          defaultMessage: '{selected}. {summary}',
          id: 'CPIFAHrIzO',
        },
        {
          selected: selected,
          summary: selectionSummaryText(summary),
        },
      );
}
export function pointedCellText({ cells: cells, text: text }: Dynamic, isInFormula?: Dynamic) {
  let pointed =
    text === null
      ? cells
      : text === ''
        ? translateMessage(
            {
              defaultMessage: '{cell}, empty',
              id: '1NyVfQCn1h',
            },
            {
              cell: cells,
            },
          )
        : translateMessage(
            {
              defaultMessage: '{cell}, {text}',
              id: 's03n3MrVYF',
            },
            {
              cell: cells,
              text: text,
            },
          );
  return isInFormula
    ? translateMessage(
        {
          defaultMessage: '{pointed}. Press F2 to move in the formula',
          id: '8KUzE6J2o7',
        },
        {
          pointed: pointed,
        },
      )
    : pointed;
}
export function githubLinkKindLabel(linkKind?: Dynamic) {
  switch (linkKind) {
    case 'pullRequest':
      return translateMessage({
        defaultMessage: 'Pull request',
        id: 'nciwKFdl5d',
      });
    case 'issue':
      return translateMessage({
        defaultMessage: 'Issue',
        id: 'yFcH/QqsJW',
      });
  }
}
export const cellsSelectedText = (
  cells?: Dynamic,
  summary?: Dynamic,
  hiddenLines: Dynamic = {
    rowCount: 0,
    columnCount: 0,
  },
) =>
  hiddenLines.rowCount > 0 || hiddenLines.columnCount > 0
    ? selectionWithSummaryText(cells, summary, hiddenLines)
    : summary === null
      ? translateMessage(
          {
            defaultMessage: '{cells} selected',
            id: '4z9c+Fys6D',
          },
          {
            cells: cells,
          },
        )
      : summary.kind === 'checked'
        ? translateMessage(
            {
              defaultMessage:
                '{count, plural, one {{cells} selected. # of {checkboxCount, number} checked} other {{cells} selected. # of {checkboxCount, number} checked}}',
              id: 'sf9FYLeOYn',
            },
            {
              cells: cells,
              count: summary.count,
              checkboxCount: summary.checkboxCount,
            },
          )
        : translateMessage(
            {
              defaultMessage: '{cells} selected. {summary}',
              id: 'KxkbBoGyod',
            },
            {
              cells: cells,
              summary: selectionSummaryText(summary),
            },
          );
export const savingStoppedText = () =>
  translateMessage({
    defaultMessage: 'Changes can’t be saved from this page any more. Reload it to keep working.',
    id: 'qftXaMTs+h',
  });
export const githubLinkTitle = ({ owner: owner, repository: repository, number: number }: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{owner}/{repository} #{number}',
      id: 'YmXS4Uj0KT',
    },
    {
      owner: owner,
      repository: repository,
      number: number,
    },
  );
export const builtLinkAddressLabel = (address?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{address}. Address built by a formula',
      id: 'tBP5zE+Gav',
    },
    {
      address: address,
    },
  );
export const builtLinkWarning = (address?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{address}. A formula sets this address. Check the formula before you open the link.',
      id: '12if/u+wKE',
    },
    {
      address: address,
    },
  );
export const openLinkHint = (isMac?: Dynamic) =>
  isMac
    ? translateMessage({
        defaultMessage: '⌘-click to open',
        id: 'Adc9dTwTfv',
      })
    : translateMessage({
        defaultMessage: 'Ctrl-click to open',
        id: '8z6tlNVybF',
      });
export const linkPositionText = (position?: Dynamic, count?: Dynamic, address?: Dynamic, isListOpen?: Dynamic) =>
  isListOpen && count > 1
    ? translateMessage(
        {
          defaultMessage: 'Link {position} of {count}: {address}. Up and Down to move, Enter to open, Escape to go back to the cells.',
          id: 'bmfkjg66kG',
        },
        {
          position: position,
          count: count,
          address: address,
        },
      )
    : translateMessage(
        {
          defaultMessage: '{count, plural, one {Link: {address}} other {Link {position} of {count}: {address}}}',
          id: 'NCL6sXT5xv',
        },
        {
          position: position,
          count: count,
          address: address,
        },
      );
export const linkCountLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {Contains a link} other {Contains # links}}',
      id: 'dCj8XZT0If',
    },
    {
      count: count,
    },
  );
export const commentModeHint = (hasKeyboard: Dynamic = likelyHasKeyboard()) =>
  hasKeyboard
    ? translateMessage({
        defaultMessage: 'Click a cell to comment. Press Esc to exit.',
        id: 'E/mXoTcPld',
      })
    : translateMessage({
        defaultMessage: 'Tap a cell to comment.',
        id: 'ZOVxl27AHu',
      });
export const readOnlyText = () =>
  translateMessage({
    defaultMessage: 'You can’t edit this Sheet. Ask an owner for edit access.',
    id: '6GbxQyLQKU',
  });
