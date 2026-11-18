import { Menu } from '../kit/menu.tsx';
import { Badge } from '../kit/badge.tsx';
import { Icon } from '../kit/icon.tsx';
import { Tooltip } from '../kit/tooltip.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import {
  importLinesWithRowLabels,
  cellsStayTextWords,
  joinImportWordsWithCommas,
  columnReadingKindLabel,
  formatOfColumnLabel,
  columnReadingWithNoteLabel,
  kindWithNoteLabel,
  importColumnMessages,
  columnNameAndKindLabel,
  columnReadingLabel,
  rowAndLineOfFileLabel,
  lineOfFileLabel,
} from './csv-file.ts';
import { translateMessage } from '../i18n/messages.ts';
import { MenuItemWithWhyOff } from '../ui/menu-item-why-off.ts';
import { CellChip } from '../grid/cell-drawing.ts';
import { cachedOptionChipColors } from '../format/cell-colors.ts';
import { MENU_CARETS } from '../ui/menu-trigger.ts';
import { PANE_SELECT_TRIGGER_CLASSES, PANE_SELECT_HEIGHT_CLASSES, PaneSelectCaret } from '../ui/side-pane/side-pane.ts';
import { notCheckedYetLabel } from './destination.ts';
import { blockRepeatedEnterOrSpace } from '../ui/repeated-key-guards.ts';
import { dateShownAsForOrder } from './column-readings.ts';
import { importCellWasLabel, moreRowsChangeWords, rowsStayWords, importMessages, importRowChangeLabel } from '../messages/import.ts';
import { DrawnAndSaid } from '../agent/agent-rows.ts';
export function KeptAsTextCountInBox(count?: Dynamic) {
  return jsxs('span', {
    className: 'sheet-import-count-in-box text-caption text-muted',
    'aria-hidden': 'true',
    children: [
      jsx(Icon, {
        name: 'TextT',
        size: 'xs',
      }),
      jsx('span', {
        style: {
          minInlineSize: `${count.digits}ch`,
        },
        children: count.count,
      }),
    ],
  });
}
export function keptAsTextTooltip({ picked: picked, count: count, note = null, cells: cells }: Dynamic) {
  let keptAsTextLines = importLinesWithRowLabels(cells, count);
  return {
    content: jsxs('span', {
      className: 'flex flex-wrap gap-x-1.5',
      children: [
        picked,
        count > 0 &&
          jsx('span', {
            className: 'text-secondary',
            children: cellsStayTextWords(count),
          }),
        note !== null &&
          jsx('span', {
            className: 'text-secondary',
            children: note,
          }),
      ],
    }),
    ...(keptAsTextLines.lines.length > 0 && {
      detail: jsxs('span', {
        className: 'grid grid-cols-[auto_minmax(0,1fr)] gap-x-1.5',
        children: [
          keptAsTextLines.lines.map(
            ({ row: row, text: text }: Dynamic) =>
              jsxs(
                React.Fragment,
                {
                  children: [
                    jsx('span', {
                      className: 'text-primary',
                      children: row,
                    }),
                    jsx('span', {
                      dir: 'auto',
                      className: 'truncate text-left',
                      children: text,
                    }),
                  ],
                },
                row,
              ),
          ),
          keptAsTextLines.more !== null &&
            jsx('span', {
              className: 'col-span-2',
              children: keptAsTextLines.more,
            }),
        ],
      }),
    }),
  };
}
export function digitsNoteWords(digitsNote?: Dynamic) {
  let { digits: digits, count: count, filled: filled } = digitsNote;
  if (digits === 'decimalPlaces') {
    let { shown: shown } = digitsNote;
    if (shown === 0)
      return translateMessage(
        {
          defaultMessage:
            '{count, plural, one {# of {filled, number} has decimal places not shown} other {{count, number} of {filled, number} have decimal places not shown}}',
          id: 'affinMCpk3',
        },
        {
          count: count,
          filled: filled,
        },
      );
    if (shown === 1)
      return translateMessage(
        {
          defaultMessage:
            '{count, plural, one {# of {filled, number} has more places than the 1 shown} other {{count, number} of {filled, number} have more places than the 1 shown}}',
          id: 'eX6lw/m5E4',
        },
        {
          count: count,
          filled: filled,
        },
      );
    return translateMessage(
      {
        defaultMessage:
          '{count, plural, one {# of {filled, number} has more places than the {shown} shown} other {{count, number} of {filled, number} have more places than the {shown} shown}}',
        id: 'N3D0mONqPY',
      },
      {
        count: count,
        filled: filled,
        shown: shown,
      },
    );
  }
  let { isKept: isKept } = digitsNote;
  if (digits === 'leadingZeros')
    return isKept
      ? translateMessage(
          {
            defaultMessage:
              '{count, plural, one {# of {filled, number} keeps its leading 0} other {{count, number} of {filled, number} keep their leading 0}}',
            id: '44RLtQSXZp',
          },
          {
            count: count,
            filled: filled,
          },
        )
      : translateMessage(
          {
            defaultMessage:
              '{count, plural, one {# of {filled, number} loses its leading 0} other {{count, number} of {filled, number} lose their leading 0}}',
            id: 'e3wN+03cZU',
          },
          {
            count: count,
            filled: filled,
          },
        );
  return isKept
    ? translateMessage(
        {
          defaultMessage:
            '{count, plural, one {# of {filled, number} has over 15 digits, all kept} other {{count, number} of {filled, number} have over 15 digits, all kept}}',
          id: 'mM5zIVESoQ',
        },
        {
          count: count,
          filled: filled,
        },
      )
    : translateMessage(
        {
          defaultMessage:
            '{count, plural, one {# of {filled, number} loses digits after the 15th} other {{count, number} of {filled, number} lose digits after the 15th}}',
          id: 'AhMffB8C5n',
        },
        {
          count: count,
          filled: filled,
        },
      );
}
export function ReadingKindLabel({ kind: kind, label: label, isInPaneSelect: isInPaneSelect }: Dynamic) {
  return jsxs('span', {
    className: `flex min-w-0 items-center ${isInPaneSelect ? 'gap-1.5' : 'gap-xs'}`,
    children: [
      jsx(Icon, {
        name: READING_KIND_ICONS[kind].icon,
        size: 'sm',
        className: 'shrink-0 text-secondary',
      }),
      jsx('span', {
        className: 'min-w-0 truncate',
        children: label,
      }),
    ],
  });
}
export function ReadingKindMenuItems(props?: Dynamic) {
  let { name: name, reading: reading, keptAsTextCount: keptAsTextCount, offered: offered, noteUnderText = null, onPicked: onPicked } = props;
  let menuItemOf = (offer?: Dynamic) => {
    let { kind: kind } = offer.reading;
    let isChecked = kind === reading.kind;
    let keptAsText = isChecked ? keptAsTextCount : offer.fitting > 0 ? offer.notFitting : 0;
    let notes = [
      ...offer.digits.map(digitsNoteWords),
      ...(keptAsText > 0 ? [cellsStayTextWords(keptAsText)] : []),
      ...(isChecked && kind === 'text' && noteUnderText !== null ? [noteUnderText] : []),
    ];
    return jsxs(
      MenuItemWithWhyOff,
      {
        icon: READING_KIND_ICONS[kind].icon,
        checked: isChecked,
        checkedRole: 'radio',
        description: notes.length === 0 ? null : joinImportWordsWithCommas(notes),
        disabled: offer.fitting === 0 && offer.notFitting > 0 && !isChecked && !offer.isAgentsPick,
        whyOff: formatSuggestionLabels.doesNotFit(),
        ...(offer.example !== null && {
          hint: offer.example,
          hintDir: 'auto',
        }),
        onClick: () => {
          if (!isChecked) onPicked(offer.reading);
        },
        children: [
          columnReadingKindLabel(kind),
          offer.isAgentsPick &&
            jsxs('span', {
              className: 'sr-only',
              children: [' ', formatSuggestionLabels.suggestedByAgent()],
            }),
        ],
      },
      kind,
    );
  };
  let agentsPicks = offered.filter((offer?: Dynamic) => offer.isAgentsPick);
  if (agentsPicks.length === 0)
    return jsxs(Menu.Group, {
      children: [
        jsx(Menu.GroupLabel, {
          children: formatOfColumnLabel(name),
        }),
        offered.map(menuItemOf),
      ],
    });
  return jsxs(Menu.Group, {
    'aria-label': formatOfColumnLabel(name),
    children: [
      jsx(SuggestedByAgentHeader, {}),
      agentsPicks.map(menuItemOf),
      jsx(Menu.Separator, {}),
      jsx(Menu.Header, {
        children: formatSuggestionLabels.otherFormats(),
      }),
      offered.filter((offer?: Dynamic) => !offer.isAgentsPick).map(menuItemOf),
    ],
  });
}
export function alignmentOfReading({ kind: kind }: Dynamic) {
  if (kind === 'text' || kind === 'dropdown') return 'start';
  return kind === 'trueOrFalse' ? 'middle' : 'end';
}
export function ImportCellContent({ cell: cell }: Dynamic) {
  if (cell.kind === 'blank') return '';
  if (cell.kind !== 'option') return cell.shown;
  return jsx(CellChip, {
    optionPaints: cachedOptionChipColors(cell.color),
    fillsCell: true,
    after: MENU_CARETS.chipInCell,
    children: cell.shown,
  });
}
export function ColumnKindMenu({
  column: { columnIndex: columnIndex, name: name, reading: reading, optionCount: optionCount, keptAsTextCount: keptAsTextCount },
  kinds: kinds,
  isLeftOut: isLeftOut,
  mustComeIn: mustComeIn,
  isTabStop: isTabStop2,
  onKindsWanted: onKindsWanted,
  onChanged: onChanged,
  nameField: nameField,
  showsIconAlone = false,
  isLeftOpen = false,
  noteUnderText = null,
  digitsOfCountInBox = null,
  firstTextCells = NO_FIRST_TEXT_CELLS,
}: Dynamic) {
  let wantsRenameRef = React.useRef(false);
  let changeColumn = (change?: Dynamic) =>
    onChanged?.({
      kind: 'column',
      columnIndex: columnIndex,
      ...change,
    });
  let readingLabel = readingLabelOfColumn({
    reading: reading,
    optionCount: optionCount,
  });
  let readingDescription = columnReadingWithNoteLabel(reading, optionCount, keptAsTextCount);
  let readingTitle = noteUnderText === null ? readingDescription : kindWithNoteLabel(readingDescription, noteUnderText);
  let shownLabel = isLeftOut ? importColumnMessages.leftOut() : readingLabel;
  let offered =
    kinds?.some((kind?: Dynamic) => kind.reading.kind === reading.kind) === true
      ? kinds
      : [
          {
            reading: reading,
            fitting: 0,
            notFitting: 0,
            isAgentsPick: false,
            digits: [],
            example: null,
          },
          ...(kinds ?? []),
        ];
  let trigger = jsx(Menu.Trigger, {
    render: jsxs('button', {
      type: 'button',
      className: isTabStop2 === null ? `${PANE_SELECT_TRIGGER_CLASSES.className} ${PANE_SELECT_HEIGHT_CLASSES.className}` : 'sheet-import-cap',
      ...(isTabStop2 !== null && {
        tabIndex: isTabStop2 ? 0 : -1,
      }),
      disabled: onChanged === null,
      'aria-label': isLeftOpen
        ? notCheckedYetLabel(columnNameAndKindLabel(name, readingTitle))
        : columnNameAndKindLabel(name, isLeftOut ? shownLabel : readingTitle),
      ...(isTabStop2 !== null && {
        title: readingTitle,
      }),
      children: [
        jsx('span', {
          className: `min-w-0 truncate ${isTabStop2 === null ? 'flex-1' : ''}`,
          children: isLeftOut
            ? shownLabel
            : jsx(ReadingKindLabel, {
                kind: reading.kind,
                label: showsIconAlone ? '' : shownLabel,
                isInPaneSelect: isTabStop2 === null,
              }),
        }),
        digitsOfCountInBox !== null &&
          keptAsTextCount > 0 &&
          jsx(KeptAsTextCountInBox, {
            count: keptAsTextCount,
            digits: digitsOfCountInBox,
          }),
        isTabStop2 === null
          ? jsx(PaneSelectCaret, {})
          : jsx(Icon, {
              name: 'CaretDownSmall',
              size: 'sm',
              className: 'shrink-0 text-muted',
            }),
      ],
    }),
  });
  return jsxs(Menu.Root, {
    onOpenChange: (isOpen?: Dynamic) => {
      if (isOpen) onKindsWanted(columnIndex);
    },
    children: [
      isTabStop2 === null
        ? jsx(Tooltip, {
            ...keptAsTextTooltip({
              picked: columnReadingLabel(reading, optionCount),
              count: keptAsTextCount,
              note: noteUnderText,
              cells: firstTextCells,
            }),
            children: trigger,
          })
        : trigger,
      jsxs(Menu.Popup, {
        align: 'start',
        className: 'w-[21rem] max-w-[var(--available-width)]',
        onKeyDownCapture: blockRepeatedEnterOrSpace,
        finalFocus: () => {
          let nameInput = wantsRenameRef.current ? nameField?.() : undefined;
          wantsRenameRef.current = false;
          nameInput?.select();
          return nameInput ?? true;
        },
        children: [
          jsx(ReadingKindMenuItems, {
            name: name,
            reading: reading,
            keptAsTextCount: keptAsTextCount,
            offered: offered,
            noteUnderText: noteUnderText,
            onPicked: (reading2?: Dynamic) =>
              changeColumn({
                reading: reading2,
              }),
          }),
          (reading.kind === 'date' || reading.kind === 'dateAndTime') &&
            jsxs(Fragment, {
              children: [
                jsx(Menu.Separator, {}),
                jsx(Menu.Group, {
                  children: DATE_ORDER_CHOICES.map(
                    ([order, label, example]: Dynamic) =>
                      jsx(
                        Menu.Item,
                        {
                          icon: null,
                          checked: reading.order === order,
                          checkedRole: 'radio',
                          hint: example,
                          onClick: () => {
                            if (order === reading.order) return;
                            changeColumn({
                              reading: {
                                ...reading,
                                order: order,
                                shownAs: dateShownAsForOrder(order),
                              },
                            });
                          },
                          children: label(),
                        },
                        order,
                      ),
                  ),
                }),
              ],
            }),
          jsx(Menu.Separator, {}),
          nameField !== null &&
            jsx(Menu.Item, {
              icon: 'Edit',
              onClick: () => void (wantsRenameRef.current = true),
              children: importColumnMessages.rename(),
            }),
          jsx(Menu.Item, {
            icon: isLeftOut ? 'Eye' : 'EyeSlash',
            disabled: mustComeIn && !isLeftOut,
            onClick: () =>
              changeColumn({
                isLeftOut: !isLeftOut,
              }),
            children: isLeftOut ? importColumnMessages.bringColumnBack() : importColumnMessages.leaveColumnOut(),
          }),
        ],
      }),
    ],
  });
}
export function LineNumberMenu(props?: Dynamic) {
  let {
    rowNumber: rowNumber,
    line: line,
    becomes: becomes,
    isLastRow: isLastRow,
    isOnlyRow: isOnlyRow,
    isTabStop: isTabStop2,
    onChanged: onChanged,
  } = props;
  return jsx(Fragment, {
    children: jsxs(Menu.Root, {
      children: [
        jsx(Menu.Trigger, {
          render: jsxs('button', {
            type: 'button',
            className: 'sheet-import-line-number',
            'data-line': line,
            tabIndex: isTabStop2 ? 0 : -1,
            disabled: onChanged === null || (becomes === 'row' && isOnlyRow === true),
            'data-has-no-menu': (becomes === 'row' && isOnlyRow === true) || undefined,
            'aria-label': rowAndLineOfFileLabel(rowNumber, line),
            children: [
              rowNumber,
              jsx(Icon, {
                name: 'CaretRight',
                size: 'xs',
                className: 'sheet-import-line-caret',
              }),
            ],
          }),
        }),
        jsx(Menu.Popup, {
          align: 'start',
          side: 'inline-end',
          className: 'min-w-[13rem]',
          children: jsxs(Menu.Group, {
            children: [
              jsx(Menu.GroupLabel, {
                children: lineOfFileLabel(line),
              }),
              becomes === 'names'
                ? jsx(Menu.Item, {
                    onClick: () =>
                      onChanged?.({
                        kind: 'headings',
                        line: null,
                      }),
                    children: importColumnMessages.notHeadings(),
                  })
                : isLastRow !== true &&
                  jsx(Menu.Item, {
                    icon: 'Heading1',
                    onClick: () =>
                      onChanged?.({
                        kind: 'headings',
                        line: line,
                      }),
                    children: importColumnMessages.asHeadings(),
                  }),
              becomes === 'row' &&
                isOnlyRow !== true &&
                jsx(Menu.Item, {
                  icon: 'EyeSlash',
                  onClick: () =>
                    onChanged?.({
                      kind: 'line',
                      line: line,
                      isLeftOut: true,
                    }),
                  children: importColumnMessages.leaveRowOut(),
                }),
            ],
          }),
        }),
      ],
    }),
  });
}
export function ImportChangedCell({ cell: { cell: cell, before: before } }: Dynamic) {
  return jsxs('td', {
    'data-place': CELL_KIND_ALIGNMENT[cell.kind],
    ...(before !== null && {
      'data-is-changed': true,
    }),
    children: [
      before !== null &&
        jsxs('span', {
          className: 'sheet-import-text sheet-import-was text-footnote',
          children: [
            jsx('span', {
              className: 'sr-only',
              children: importCellWasLabel(before),
            }),
            jsx('s', {
              'aria-hidden': true,
              children: before,
            }),
          ],
        }),
      jsx('span', {
        className: 'sheet-import-text',
        children: jsx(ImportCellContent, {
          cell: cell,
        }),
      }),
    ],
  });
}
export const formatSuggestionLabels = {
  suggested: () =>
    translateMessage({
      defaultMessage: 'Suggested',
      id: 'K8UcT1+bHw',
    }),
  suggestedByAgent: () =>
    translateMessage({
      defaultMessage: 'Suggested by Agent',
      id: 'u19kydsgzq',
    }),
  otherFormats: () =>
    translateMessage({
      defaultMessage: 'Other formats',
      id: 'alGRTYEWzZ',
    }),
  doesNotFit: () =>
    translateMessage({
      defaultMessage: 'This format doesn’t fit this column',
      id: 'vYHd9sQ30d',
    }),
};
export const READING_KIND_ICONS = {
  text: {
    icon: 'TextT',
  },
  number: {
    icon: 'Numbers',
  },
  currency: {
    icon: 'DollarSign',
  },
  percent: {
    icon: 'PercentSign',
  },
  date: {
    icon: 'Calendar',
  },
  dateAndTime: {
    icon: 'CalendarClock',
  },
  timeOfDay: {
    icon: 'Clock',
  },
  trueOrFalse: {
    icon: 'CheckSquare',
  },
  dropdown: {
    icon: 'Dropdown',
  },
};
export const SuggestedByAgentHeader = () =>
  jsx(Menu.Header, {
    children: jsx(DrawnAndSaid, {
      drawn: formatSuggestionLabels.suggested(),
      said: formatSuggestionLabels.suggestedByAgent(),
    }),
  });
export const cascadeDelayStyle = (index?: Dynamic) => ({
  animationDelay: `${Math.min(index * 60, 900)}ms`,
});
export const CELL_KIND_ALIGNMENT = {
  blank: 'start',
  text: 'start',
  keptAsText: 'start',
  trueOrFalse: 'middle',
  number: 'end',
  option: 'start',
};
export const DATE_ORDER_CHOICES = [
  ['dayMonthYear', importColumnMessages.dayFirst, '31/12/2026'],
  ['monthDayYear', importColumnMessages.monthFirst, '12/31/2026'],
  ['yearMonthDay', importColumnMessages.yearFirst, '2026-12-31'],
];
export const NO_FIRST_TEXT_CELLS: Dynamic = [];
export const readingLabelOfColumn = ({ reading: reading, optionCount: optionCount }: Dynamic) =>
  reading.kind === 'dropdown' ? columnReadingKindLabel('dropdown') : columnReadingWithNoteLabel(reading, optionCount, 0);
export const IMPORT_LINE_NUMBER_SELECTOR = '.sheet-import-line-number';
export const ROW_CHANGE_BADGE_VARIANTS = {
  added: 'success',
  changed: 'warning',
  gone: 'danger',
};
export const ImportChangesTable = React.memo(function ({ changes: changes }: Dynamic) {
  let { columns: columns, rows: rows } = changes;
  let footLines = [
    {
      about: 'more',
      line: moreRowsChangeWords(changes),
    },
    {
      about: 'stay',
      line: rowsStayWords(changes),
    },
  ].filter(({ line: line }: Dynamic) => line !== null);
  return jsxs('div', {
    className: `flex flex-col gap-sm ${rows.length > 0 ? '[&>p]:px-md' : 'pt-md [&>p]:px-xl'}`,
    children: [
      rows.length > 0 &&
        jsx('div', {
          children: jsxs('table', {
            className: 'sheet-import-grid',
            children: [
              jsx('thead', {
                children: jsxs('tr', {
                  children: [
                    jsx('th', {
                      scope: 'col',
                      children: importMessages.change(),
                    }),
                    columns.map(
                      ({ columnIndexInTheFile: columnIndexInTheFile, name: name, reading: reading }: Dynamic) =>
                        jsx(
                          'th',
                          {
                            scope: 'col',
                            'data-is-name': true,
                            'data-place': alignmentOfReading(reading),
                            children: jsx('span', {
                              className: 'sheet-import-text',
                              title: name,
                              children: name,
                            }),
                          },
                          columnIndexInTheFile,
                        ),
                    ),
                  ],
                }),
              }),
              jsx('tbody', {
                children: rows.map(
                  ({ id: id, kind: kind, cells: cells }: Dynamic, rowIndex?: Dynamic) =>
                    jsxs(
                      'tr',
                      {
                        className: 'sheet-import-comes',
                        'data-change': kind,
                        style: cascadeDelayStyle(rowIndex),
                        children: [
                          jsx('th', {
                            scope: 'row',
                            children: jsx(Badge, {
                              variant: ROW_CHANGE_BADGE_VARIANTS[kind],
                              children: importRowChangeLabel(kind),
                            }),
                          }),
                          cells.map(
                            (cell?: Dynamic, cellIndex?: Dynamic) =>
                              jsx(
                                ImportChangedCell,
                                {
                                  cell: cell,
                                },
                                columns[cellIndex]?.columnIndexInTheFile ?? cellIndex,
                              ),
                          ),
                        ],
                      },
                      id,
                    ),
                ),
              }),
            ],
          }),
        }),
      footLines.map(
        ({ about: about, line: line }: Dynamic) =>
          jsx(
            'p',
            {
              className: 'text-footnote text-secondary',
              ...(rows.length > 0 && {
                className: 'sheet-import-comes text-footnote text-secondary',
                style: cascadeDelayStyle(rows.length),
              }),
              children: line,
            },
            `${about} under ${rows[0]?.id ?? ''}`,
          ),
      ),
    ],
  });
});
