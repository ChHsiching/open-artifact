import { Menu } from '../kit/menu.tsx';
import type { Dynamic } from '../dynamic.ts';
import { columnsQuestionDecides, wasQuestionAskedBefore, stoodByHandChanges, importPlanSoFar, importLinesLeftOut } from './import-review.ts';
import { questionColumnIndexes } from './column-readings.ts';
import { importColumnsLeftOut } from './bring-in.ts';
import { questionOptionLabels, heardBecomesWords, readingsThatDiffer } from './settings-pane.ts';
import {
  importSettingsLabels,
  labelAndExample,
  labelAndChosen,
  formatUnitList,
  plusCountLabel,
  notCheckedYetLabel,
  lineCountLabel,
  importLineLabel,
  moreLinesLeftOutLabel,
} from './destination.ts';
import {
  importReviewMessages,
  cellsStayTextWords,
  textStaysTextWords,
  joinImportWordsWithCommas,
  columnReadingKindLabel,
  kindWithNoteLabel,
  formatOfColumnLabel,
} from './csv-file.ts';
import { READING_KIND_ICONS, SuggestedByAgentHeader, formatSuggestionLabels, KeptAsTextCountInBox, keptAsTextTooltip } from './preview-table.ts';
import { jsx, jsxs } from 'react/jsx-runtime';
import { PaneRow, PaneSelect, PANE_SELECT_TRIGGER_CLASSES, PANE_SELECT_HEIGHT_CLASSES, PaneSelectCaret } from '../ui/side-pane/side-pane.ts';
import { columnsNamedInNote } from './by-hand.ts';
import { importPlacesLeft } from './import-flow.ts';
import { shortenImportLabel } from './preview.ts';
import { blockRepeatedEnterOrSpace } from '../ui/repeated-key-guards.ts';
import { truncateToCleanText } from './import-basics.ts';
export function ImportQuestionRow(props?: Dynamic) {
  let {
    open: open,
    plan: plan,
    question: question,
    examples: examples,
    isOpen: isOpen,
    isOff: isOff,
    isShortInBox = false,
    onAnswered: onAnswered,
  } = props;
  let columnsOfQuestion = columnsQuestionDecides(question);
  let columns = columnsOfQuestion.length > 0 ? columnsOfQuestion : questionColumnIndexes(question);
  let columnsLeftOut = columns.filter((input?: Dynamic) => open.byHand.columns[input]?.reading === undefined);
  let [firstColumn = 0] = columns;
  let firstLeftOutColumn = columnsLeftOut.length > 0 ? undefined : plan.columns[firstColumn]?.reading;
  let columnsAsked = firstLeftOutColumn === undefined ? columnsLeftOut : columns;
  let columnNames = columnsAsked.map((input?: Dynamic) => plan.columns[input]?.name ?? '');
  let leftOutColumns = importColumnsLeftOut(open, plan);
  let columnsComingIn = columnsAsked.filter((input?: Dynamic) => !leftOutColumns.includes(input));
  let { cellsThatStayText: cellsThatStayText } = props;
  let stayTextNote =
    cellsThatStayText !== undefined &&
    columnsComingIn.length === 1 &&
    columnsComingIn[0] === cellsThatStayText.columnIndex &&
    cellsThatStayText.count > 0
      ? cellsThatStayText
      : null;
  let stayTextCount = stayTextNote?.count ?? 0;
  let [firstName = '', ...otherNames] = columnNames;
  let optionLabels = questionOptionLabels(question, examples);
  let wasAskedBefore = wasQuestionAskedBefore(open, question);
  let pickedValue =
    firstLeftOutColumn === undefined ? String(open.answers[question.id] ?? question.recommendedIndex) : IMPORT_ANSWER_OTHERWISE;
  let descriptionOf = (optionIndex?: Dynamic) => {
    let firstExample = examples[optionIndex]?.[0];
    let parts = [
      ...(optionIndex !== question.recommendedIndex ? [] : [wasAskedBefore ? importSettingsLabels.notCertain() : importReviewMessages.recommended()]),
      ...(String(optionIndex) === pickedValue && stayTextCount > 0
        ? [cellsStayTextWords(stayTextCount)]
        : firstExample?.becomes === null
          ? [textStaysTextWords(firstExample.text)]
          : []),
    ];
    return parts.length === 0
      ? {}
      : {
          description: joinImportWordsWithCommas(parts),
        };
  };
  let heardBecomes = heardBecomesWords(examples);
  let readingsThatDiffer2 = readingsThatDiffer(question);
  let items = [
    ...question.options.map((label?: Dynamic, optionIndex?: Dynamic) => {
      let readingKind = readingsThatDiffer2[optionIndex]?.kind;
      return {
        value: String(optionIndex),
        label: optionLabels[optionIndex]?.label ?? '',
        ...(typeof optionLabels[optionIndex]?.example === 'string' && {
          example: optionLabels[optionIndex].example,
        }),
        ...(isShortInBox &&
          readingKind !== undefined &&
          readingsThatDiffer2.filter((input?: Dynamic) => input?.kind === readingKind).length === 1 && {
            inBox: columnReadingKindLabel(readingKind),
          }),
        ...(heardBecomes[optionIndex] !== undefined && {
          heard: heardBecomes[optionIndex],
        }),
        ...(readingKind !== undefined && READING_KIND_ICONS[readingKind]),
        ...descriptionOf(optionIndex),
      };
    }),
    ...(firstLeftOutColumn === undefined
      ? []
      : [
          {
            value: IMPORT_ANSWER_OTHERWISE,
            label: columnReadingKindLabel(firstLeftOutColumn.kind),
            ...READING_KIND_ICONS[firstLeftOutColumn.kind],
            ...(stayTextCount > 0 && {
              description: cellsStayTextWords(stayTextCount),
            }),
          },
        ]),
  ];
  let picked = items.find((input?: Dynamic) => input.value === pickedValue);
  let pickedLabel = picked !== undefined && 'example' in picked ? labelAndExample(picked.label, picked.example) : (picked?.label ?? '');
  let fullName = labelAndChosen(
    formatUnitList(columnNames),
    stayTextCount > 0 ? kindWithNoteLabel(pickedLabel, cellsStayTextWords(stayTextCount)) : pickedLabel,
  );
  return jsx(PaneRow, {
    label: firstName,
    labelInFull: formatUnitList(columnNames),
    ...(otherNames.length > 0 && {
      labelEnd: plusCountLabel(otherNames.length),
    }),
    hasDot: isOpen,
    isPointedAt: stoodByHandChanges(open).some((input?: Dynamic) => input.kind === 'column' && columns.includes(input.columnIndex)),
    children: jsx(PaneSelect, {
      name: isOpen ? notCheckedYetLabel(fullName) : fullName,
      ...(!wasAskedBefore && {
        heard: question.ask,
      }),
      heading: formatOfColumnLabel(formatUnitList(columnNames)),
      ...(wasAskedBefore && {
        suggested: {
          value: String(question.recommendedIndex),
          caption: jsx(SuggestedByAgentHeader, {}),
          inWords: formatSuggestionLabels.suggestedByAgent(),
          captionOfTheRest: formatSuggestionLabels.otherFormats(),
        },
      }),
      ...(stayTextNote !== null && {
        beforeCaret: jsx(KeptAsTextCountInBox, {
          count: stayTextNote.count,
          digits: stayTextNote.digits,
        }),
      }),
      ...(cellsThatStayText !== undefined && {
        tooltip:
          stayTextNote === null
            ? null
            : keptAsTextTooltip({
                picked: pickedLabel,
                count: stayTextNote.count,
                cells: stayTextNote.first,
              }),
      }),
      isSamePickTold: true,
      isOff: isOff,
      value: pickedValue,
      items: items,
      onChange: (input?: Dynamic) => onAnswered(Number(input)),
    }),
  });
}
export function previewColumnsOfImportNotes(open?: Dynamic) {
  let { preview: preview } = importPlanSoFar(open);
  let columnIndexes = new (Set as Dynamic)(open.plan.questions.flatMap((input?: Dynamic) => questionColumnIndexes(input)));
  return open.plan.notes.map((note?: Dynamic) => {
    let columnsNamed = columnsNamedInNote(note, open.plan.columns).flatMap((columnName?: Dynamic) => {
      let column = preview.columns.find((input?: Dynamic) => input.columnIndex === columnName);
      return column === undefined || columnIndexes.has(columnName) ? [] : [column];
    });
    for (let { columnIndex: columnIndex } of columnsNamed as Dynamic) columnIndexes.add(columnIndex);
    return columnsNamed;
  });
}
export function namesOfStoodSettings(open: Dynamic, { stood: stood, namesOfStood: namesOfStood }: Dynamic) {
  let isStood = (kind?: Dynamic) => stood.some((input?: Dynamic) => input.kind === kind);
  let sheetNameLabels = isStood('sheetName') ? [importSettingsLabels.name()] : [];
  let hasPlacesLeft = importPlacesLeft(open).length > 0;
  let questionColumns = open.plan.questions.flatMap((input?: Dynamic) => questionColumnIndexes(input));
  let columnOrder = [
    ...questionColumns,
    ...importColumnsInSettings(open)
      .filter((input?: Dynamic) => !questionColumns.includes(input))
      .toSorted((left?: Dynamic, right?: Dynamic) => left - right),
  ];
  let orderOfColumn = (columnIndex?: Dynamic) =>
    columnOrder.includes(columnIndex) ? columnOrder.indexOf(columnIndex) : columnOrder.length + columnIndex;
  let names = [
    ...(hasPlacesLeft ? [] : sheetNameLabels),
    ...(isStood('headings') ? [importSettingsLabels.headings()] : []),
    ...(isStood('line') ? [importSettingsLabels.leftOut()] : []),
    ...(isStood('destination') ? [importSettingsLabels.importAs()] : []),
    ...(hasPlacesLeft ? sheetNameLabels : []),
    ...stood
      .flatMap((input?: Dynamic) => (input.kind === 'column' ? [input.columnIndex] : []))
      .toSorted((left?: Dynamic, right?: Dynamic) => orderOfColumn(left) - orderOfColumn(right))
      .map((input?: Dynamic) => namesOfStood[input] ?? ''),
  ];
  return [...new (Set as Dynamic)(names)].map(shortenImportLabel).filter((input?: Dynamic) => input !== '');
}
export function LeftOutLinesMenu({ open: open, isOff: isOff, onSet: onSet }: Dynamic) {
  let { lines: lines, moreCount: moreCount } = importLinesLeftOut(open);
  let lineTextOf = (lineNumber?: Dynamic) =>
    (open.table.lines[lineNumber - 1] ?? []).filter((input?: Dynamic) => input.trim() !== '').join(', ');
  let leftOutCountLabel = lineCountLabel(importPlanSoFar(open).preview.lineLeftOutCount);
  return jsx(PaneRow, {
    label: importSettingsLabels.leftOut(),
    isPointedAt: stoodByHandChanges(open).some(({ kind: kind }: Dynamic) => kind === 'line'),
    children: jsxs(Menu.Root, {
      children: [
        jsx(Menu.Trigger, {
          render: jsxs('button', {
            type: 'button',
            disabled: isOff,
            'aria-label': labelAndChosen(importSettingsLabels.leftOut(), leftOutCountLabel),
            className: `${PANE_SELECT_TRIGGER_CLASSES.className} ${PANE_SELECT_HEIGHT_CLASSES.className}`,
            children: [
              jsx('span', {
                className: 'min-w-0 flex-1 truncate',
                children: leftOutCountLabel,
              }),
              jsx(PaneSelectCaret, {}),
            ],
          }),
        }),
        jsx(Menu.Popup, {
          align: 'start',
          className: 'w-auto max-w-[min(26rem,var(--available-width))] min-w-[var(--anchor-width)]',
          onKeyDownCapture: blockRepeatedEnterOrSpace,
          children: jsxs(Menu.Group, {
            'aria-label': importSettingsLabels.leftOut(),
            children: [
              lines.map(
                ({ line: line, isLeftOut: isLeftOut, canComeBack: canComeBack }: Dynamic) =>
                  jsx(
                    Menu.Item,
                    {
                      checked: isLeftOut,
                      disabled: !canComeBack,
                      disabledReason: importSettingsLabels.aboveTheHeadings(),
                      keepOpen: true,
                      onClick: () => onSet(line, !isLeftOut),
                      children: jsxs('span', {
                        className: 'flex min-w-0 flex-1 items-baseline gap-sm',
                        children: [
                          jsx('span', {
                            className: 'shrink-0',
                            children: importLineLabel(line),
                          }),
                          jsx('span', {
                            dir: 'auto',
                            className: 'min-w-0 truncate text-footnote text-muted',
                            title: truncateToCleanText(lineTextOf(line), LEFT_OUT_LINE_TITLE_CHARS),
                            children: truncateToCleanText(lineTextOf(line), LEFT_OUT_LINE_PREVIEW_CHARS),
                          }),
                        ],
                      }),
                    },
                    line,
                  ),
              ),
              moreCount > 0 &&
                jsx(Menu.Item, {
                  disabled: true,
                  children: moreLinesLeftOutLabel(moreCount),
                }),
            ],
          }),
        }),
      ],
    }),
  });
}
export const IMPORT_ANSWER_OTHERWISE = 'otherwise';
export const importColumnsInSettings = (open?: Dynamic) => [
  ...open.plan.questions.flatMap((question?: Dynamic) => questionColumnIndexes(question)),
  ...(open.isPlanByAgent
    ? previewColumnsOfImportNotes(open)
        .flat()
        .map((column?: Dynamic) => column.columnIndex)
    : []),
];
export const LEFT_OUT_LINE_PREVIEW_CHARS = 48;
export const LEFT_OUT_LINE_TITLE_CHARS = 300;
