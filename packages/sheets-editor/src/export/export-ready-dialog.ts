import { Dialog } from '../kit/dialog.tsx';
import { Icon } from '../kit/icon.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { ExcelFileIcon } from '../import/file-sources.ts';
import { translateMessage, MESSAGE_LOCALE } from '../i18n/messages.ts';
export function ExportRowContents({ mark: mark, name: rowName, detail: detail, atEnd: atEnd }: Dynamic) {
  return jsxs(Fragment, {
    children: [
      jsx('span', {
        'aria-hidden': true,
        className: 'flex size-6 shrink-0 items-center justify-center text-secondary',
        children: mark,
      }),
      jsxs('span', {
        className: 'flex min-w-0 flex-1 flex-col',
        children: [
          jsx('bdi', {
            className: 'truncate text-body-medium text-primary',
            children: rowName,
          }),
          jsx('span', {
            className: 'truncate text-footnote text-muted first-letter:uppercase',
            children: detail,
          }),
        ],
      }),
      jsx('span', {
        'aria-hidden': true,
        className: 'flex shrink-0 text-secondary',
        children: atEnd,
      }),
    ],
  });
}
export function ExportReadySummary({
  file: file,
  isAtOnce: isAtOnce,
  onListAsked: onListAsked,
  onShut: onShut,
  rowOfListRef: rowOfListRef,
}: Dynamic) {
  let { went: went, filename: filename } = file;
  let differences = exportDifferences(file.notCarriedOver);
  let differenceNames = differences.map((difference?: Dynamic) => difference.name);
  let onDonePressed = (event?: Dynamic) => {
    if (event.detail <= 1) onShut();
    else event.preventDefault();
  };
  let shownName = filename;
  let fileRow = jsx(ExportRowContents, {
    mark: jsx(ExcelFileIcon, {
      className: 'size-5',
    }),
    name: shownName,
    detail: exportReadyMessages.kindOfFile(went),
    atEnd: jsx(ExportDoneMark, {
      isAtOnce: isAtOnce,
    }),
  });
  return jsxs('div', {
    className: 'flex flex-col gap-xs',
    children: [
      jsx('div', {
        className: '-mx-[var(--ui-gap-xs)] flex min-w-0 items-center gap-xs px-xs py-1',
        children: fileRow,
      }),
      differences.length > 0 &&
        jsx('button', {
          ref: rowOfListRef,
          type: 'button',
          'aria-label': exportReadyMessages.differencesSaid(went, differenceNames),
          className:
            '-mx-[var(--ui-gap-xs)] flex min-w-0 items-center gap-xs rounded px-xs py-1 text-start outline-none hover:bg-fill-ghost-hover focus-visible:shadow-focus focus-visible:outline-hidden',
          onClick: onListAsked,
          children: jsx(ExportRowContents, {
            mark: jsx(Icon, {
              name: 'Info',
              size: 'md',
            }),
            name: exportReadyMessages.isDifferent(went, differences.length),
            detail: exportReadyMessages.namesOfDifferences(differenceNames),
            atEnd: jsx(Icon, {
              name: 'CaretRight',
              size: 'sm',
            }),
          }),
        }),
      jsxs(Dialog.Footer, {
        align: 'end',
        children: [
          jsx(Button, {
            variant: 'primary',
            onClick: onDonePressed,
            children: exportReadyMessages.done(),
          }),
        ],
      }),
    ],
  });
}
export function ExportDifferencesList({ file: file }: Dynamic) {
  return jsx('ul', {
    className: 'flex flex-col gap-xs',
    children: exportDifferences(file.notCarriedOver).map(
      ({ what: what, icon: icon, sentence: sentence }: Dynamic) =>
        jsxs(
          'li',
          {
            className: 'sheet-listed-row flex items-start gap-xs text-body text-secondary',
            children: [
              jsx('span', {
                'aria-hidden': true,
                className: 'flex h-[1lh] flex-none items-center',
                children: jsx(Icon, {
                  name: icon,
                  size: 'sm',
                }),
              }),
              jsx('span', {
                className: 'min-w-0',
                children: sentence,
              }),
            ],
          },
          what,
        ),
    ),
  });
}
export function ExportReadyContent({ file: file, onShut: onShut }: Dynamic) {
  let { went: went } = file;
  let [isListShown, setListShown] = React.useState(false);
  let [hasSwitched, setSwitched] = React.useState(false);
  let backButtonRef = React.useRef(null);
  let listRowRef = React.useRef(null);
  let showList = (showsList?: Dynamic) => {
    ReactDOM.flushSync(() => {
      setListShown(showsList);
      setSwitched(true);
    });
    (showsList ? backButtonRef : listRowRef).current?.focus();
  };
  return jsxs(Fragment, {
    children: [
      isListShown
        ? jsxs('div', {
            className: 'flex items-start gap-1',
            children: [
              jsx('div', {
                className: '-mt-[var(--ui-pad-sm)]',
                children: jsx(Button, {
                  ref: backButtonRef,
                  variant: 'ghost',
                  flush: 'start',
                  iconOnly: true,
                  icon: 'CaretLeft',
                  'aria-label': exportReadyMessages.back(),
                  onClick: () => showList(false),
                }),
              }),
              jsx('div', {
                className: 'min-w-0 flex-1',
                children: jsx(Dialog.Header, {
                  className: 'ms-0 ps-0',
                  children: exportReadyMessages.titleOfDifferences(went),
                }),
              }),
            ],
          })
        : jsx(Dialog.Header, {
            children: exportReadyMessages.title(went),
          }),
      isListShown
        ? jsx(ExportDifferencesList, {
            file: file,
          })
        : jsx(ExportReadySummary, {
            file: file,
            isAtOnce: hasSwitched,
            rowOfListRef: listRowRef,
            onListAsked: () => showList(true),
            onShut: onShut,
          }),
    ],
  });
}
export const dropdownOptionsLabel = () =>
  translateMessage({
    defaultMessage: 'Dropdown options',
    id: 'aRfMkoNP+5',
  });
export const EXPORT_DIFFERENCES = {
  formulasWrittenAsValues: {
    icon: 'Sigma',
    sentence: () =>
      translateMessage({
        defaultMessage: 'Some formulas are saved as their values.',
        id: '+n3e+e7vmU',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'some formulas',
        id: 'ZHi6hkzYff',
      }),
  },
  randomNumbersThatStay: {
    icon: 'Shuffle',
    sentence: () =>
      translateMessage({
        defaultMessage: 'Random numbers change when the file is opened.',
        id: '3B76el8vry',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'random numbers',
        id: 'pBOiYbd8nQ',
      }),
  },
  users: {
    icon: 'User',
    sentence: () =>
      translateMessage({
        defaultMessage: 'People appear as their names.',
        id: 'vWkNiH++g7',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'people',
        id: 'YGR2pgvmJT',
      }),
  },
  checkboxes: {
    icon: 'CheckSquare',
    sentence: () =>
      translateMessage({
        defaultMessage: 'Checkboxes appear as TRUE or FALSE.',
        id: 'JT2iZcFrEx',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'checkboxes',
        id: 'VUvUrYsBT0',
      }),
  },
  colorsOfDropdownOptions: {
    icon: 'Dropdown',
    sentence: () =>
      translateMessage({
        defaultMessage: 'Dropdown options have no colors.',
        id: 'kPD72hapyo',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'dropdown colors',
        id: 'Kf3M9QMQT6',
      }),
  },
  sheetNames: {
    icon: 'TextT',
    sentence: () =>
      translateMessage({
        defaultMessage: 'Some sheet names are shortened or changed.',
        id: 'h7FqlVFI5d',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'sheet names',
        id: 'O4LD9WBbpQ',
      }),
  },
  looksOfSomeBlankCells: {
    icon: 'PaintBucket',
    sentence: () =>
      translateMessage({
        defaultMessage: 'Some empty cells have no formatting.',
        id: 'VnoW7zboYb',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'empty cell formatting',
        id: '34CW96ONEl',
      }),
  },
  linksOfPartsOfTexts: {
    icon: 'Link',
    sentence: () =>
      translateMessage({
        defaultMessage: 'Links on part of a cell’s text become one link for the whole cell.',
        id: 'obuyTd2GF1',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'links on part of a cell',
        id: 'UN/LE6HcnT',
      }),
  },
  linksOfSomeCells: {
    icon: 'Link',
    sentence: () =>
      translateMessage({
        defaultMessage: 'Some links aren’t included.',
        id: 'wL1EQ5oPOG',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'some links',
        id: 'hRFDssCX3B',
      }),
  },
  listsInTexts: {
    icon: 'ListBullet',
    sentence: () =>
      translateMessage({
        defaultMessage: 'Lists in a cell’s text appear as typed characters, like “• item” or “☐ item”.',
        id: 'HhgtVBqRvJ',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'lists in a cell',
        id: 'ccLJDsHNYU',
      }),
  },
  sizesOfTheLargestRowsAndColumns: {
    icon: 'ColumnWidth',
    sentence: () =>
      translateMessage({
        defaultMessage: 'Very tall rows and wide columns are made smaller.',
        id: 'VMeIwtDvD+',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'large rows and columns',
        id: 'VCi5gQwvMj',
      }),
  },
  conditionalFormats: {
    icon: 'ConditionalFormat',
    sentence: () =>
      translateMessage({
        defaultMessage: 'Conditional formatting isn’t included.',
        id: 'uvf+GBAyAU',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'conditional formatting',
        id: 'E+DXShh2hl',
      }),
  },
  placedViews: {
    icon: 'Chart',
    sentence: () =>
      translateMessage({
        defaultMessage: 'Charts aren’t included.',
        id: 'CW3GC3q8Kb',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'charts',
        id: 'iwCU69jmkh',
      }),
  },
  looksOfCharts: {
    icon: 'Brush',
    sentence: () =>
      translateMessage({
        defaultMessage: 'Included charts look different.',
        id: 'UbOeo8MhnJ',
      }),
    name: () =>
      translateMessage({
        defaultMessage: 'chart styles',
        id: 'PJ4gAUhM0f',
      }),
  },
};
export const SOME_CHARTS_DIFFERENCE = {
  icon: 'Chart',
  sentence: () =>
    translateMessage({
      defaultMessage: 'Some charts aren’t included.',
      id: 'zCfnVEvy5Z',
    }),
  name: () =>
    translateMessage({
      defaultMessage: 'some charts',
      id: 'C/UUWGH5c1',
    }),
};
export const exportDifferenceTable = EXPORT_DIFFERENCES;
export const exportDifferences = (notCarriedOver?: Dynamic) =>
  notCarriedOver.flatMap((what?: Dynamic) => {
    let difference =
      what === 'placedViews' && notCarriedOver.includes('looksOfCharts') ? SOME_CHARTS_DIFFERENCE : exportDifferenceTable[what];
    if (difference === undefined) return [];
    let { icon: icon, sentence: sentence, name: nameOfDifference } = difference;
    return [
      {
        what: what,
        icon: icon,
        sentence: sentence(),
        name: nameOfDifference(),
      },
    ];
  });
export const exportReadyMessages = {
  title: (went?: Dynamic) =>
    went === 'downloaded'
      ? translateMessage({
          defaultMessage: 'Your Excel file is ready',
          id: 'pj5c0eNv9T',
        })
      : translateMessage({
          defaultMessage: 'Your copy in Google Sheets is ready',
          id: 'X/QVStNB3y',
        }),
  kindOfFile: (went?: Dynamic) =>
    went === 'downloaded'
      ? translateMessage({
          defaultMessage: 'Editable .xlsx spreadsheet',
          id: 'kExKdN/QFN',
        })
      : translateMessage({
          defaultMessage: 'Editable copy in your Google Drive',
          id: 'e4rkg0Uz9b',
        }),
  isDifferent: (went?: Dynamic, count?: Dynamic) =>
    went === 'downloaded'
      ? translateMessage(
          {
            defaultMessage: '{count, plural, one {# thing is different in Excel} other {# things are different in Excel}}',
            id: 'u3PpkQ98CK',
          },
          {
            count: count,
          },
        )
      : translateMessage(
          {
            defaultMessage: '{count, plural, one {# thing is different in Google Sheets} other {# things are different in Google Sheets}}',
            id: '0H3JhBPxcM',
          },
          {
            count: count,
          },
        ),
  titleOfDifferences: (went?: Dynamic) =>
    went === 'downloaded'
      ? translateMessage({
          defaultMessage: 'What’s different in Excel',
          id: '2u5onSQwK/',
        })
      : translateMessage({
          defaultMessage: 'What’s different in Google Sheets',
          id: '5+CuFP6955',
        }),
  namesOfDifferences: (names?: Dynamic) =>
    new (Intl.ListFormat as Dynamic)(MESSAGE_LOCALE, {
      type: 'unit',
    }).format(names),
  differencesSaid: (went?: Dynamic, differenceNames?: Dynamic) =>
    translateMessage(
      {
        defaultMessage: '{line}: {names}',
        id: 'XSINOPZGKT',
      },
      {
        line: exportReadyMessages.isDifferent(went, differenceNames.length),
        names: exportReadyMessages.namesOfDifferences(differenceNames),
      },
    ),
  openNamed: (fileName?: Dynamic) =>
    translateMessage(
      {
        defaultMessage: 'Open {name} in Google Sheets',
        id: 'NjaeuKEoXt',
      },
      {
        name: fileName,
      },
    ),
  back: () =>
    translateMessage({
      defaultMessage: 'Back',
      id: 'JK9HjYXqNQ',
    }),
  done: () =>
    translateMessage({
      defaultMessage: 'Done',
      id: 'ZjPnurAt9s',
    }),
};
export const ExportDoneMark = ({ isAtOnce: isAtOnce }: Dynamic) =>
  jsx('span', {
    className: `flex text-success ${isAtOnce ? '' : 'transition-[clip-path] delay-[450ms] duration-base ease-out motion-reduce:transition-none starting:[clip-path:inset(0_100%_0_0)]'} [clip-path:inset(0)]`,
    children: jsx(Icon, {
      name: 'CheckCircleFilled',
      size: 'md',
    }),
  });
export const ExportReadyDialog = React.memo(function ({
  file: file,
  whatHasCaretAfter: whatHasCaretAfter,
  onShut: onShut,
}: Dynamic) {
  let [keptFile, setKeptFile] = React.useState({
    file: file,
    count: 0,
  });
  if (file !== null && file !== keptFile.file)
    setKeptFile({
      file: file,
      count: keptFile.count + 1,
    });
  let shownFile = file ?? keptFile.file;
  let notCarriedOverSentences = exportDifferences(shownFile?.notCarriedOver ?? []).map(
    ({ sentence: sentence }: Dynamic) => sentence,
  );
  let popupRef = React.useRef(null);
  let [isAlertNeeded, setAlertNeeded] = React.useState(false);
  if (file === null && isAlertNeeded) setAlertNeeded(false);
  let openedAtRef = React.useRef(0);
  let lastFileRef = React.useRef(file);
  React.useLayoutEffect(() => {
    let [popup, wasOpen] = [popupRef.current, lastFileRef.current !== null];
    lastFileRef.current = file;
    openedAtRef.current = performance.now();
    if (file === null || !wasOpen || popup === null) return;
    let ownerDocument = popup.ownerDocument;
    if (ownerDocument.activeElement === ownerDocument.body && ownerDocument.hasFocus()) popup.focus();
    setAlertNeeded(!popup.contains(ownerDocument.activeElement));
  }, [file]);
  return jsx(Dialog.Root, {
    open: file !== null,
    disablePointerDismissal: true,
    onOpenChange: (isOpen: Dynamic, { event: event }: Dynamic) => {
      let isMultiClick = event instanceof UIEvent && event.detail > 1;
      if (!isOpen && event.timeStamp > openedAtRef.current && !isMultiClick) onShut();
    },
    children: jsxs(Dialog.Popup, {
      ref: popupRef,
      size: 'sm',
      initialFocus: () => {
        let isPageFocused = popupRef.current?.ownerDocument.hasFocus() === true;
        setAlertNeeded(!isPageFocused);
        return isPageFocused && popupRef.current;
      },
      finalFocus: whatHasCaretAfter,
      onFocus: () => setAlertNeeded(false),
      children: [
        shownFile !== null &&
          jsx(
            ExportReadyContent,
            {
              file: shownFile,
              onShut: onShut,
            },
            keptFile.count,
          ),
        notCarriedOverSentences.length > 0 &&
          jsx(Dialog.Description, {
            className: 'sr-only',
            render: jsx('div', {}),
            children: notCarriedOverSentences.map(
              (sentence?: Dynamic) =>
                jsx(
                  'p',
                  {
                    children: sentence,
                  },
                  sentence,
                ),
            ),
          }),
        isAlertNeeded &&
          shownFile !== null &&
          jsxs(
            'div',
            {
              role: 'alert',
              className: 'sr-only',
              children: [
                jsx('p', {
                  children: exportReadyMessages.title(shownFile.went),
                }),
                notCarriedOverSentences.map(
                  (sentence?: Dynamic) =>
                    jsx(
                      'p',
                      {
                        children: sentence,
                      },
                      sentence,
                    ),
                ),
              ],
            },
            `said ${keptFile.count}`,
          ),
      ],
    }),
  });
});
