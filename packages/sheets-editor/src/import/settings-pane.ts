import { Skeleton, SkeletonGroup } from '../kit/skeleton.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { PaneSection, PANE_GUTTER_CLASSES, PaneSelect } from '../ui/side-pane/side-pane.ts';
import { importSettingsLabels, optionNthLabel, labelAndExample, labelAndChosen, importLineLabel } from './destination.ts';
import {
  importReviewMessages,
  columnNameAndKindLabel,
  columnReadingWithNoteLabel,
  joinImportWordsWithSemicolons,
  importColumnMessages,
  columnReadingKindLabel,
  textBecomesWords,
} from './csv-file.ts';
import { lastDataLineNumber } from './column-readings.ts';
import { truncateToCleanText } from './import-basics.ts';
export function AgentsReadSection(props?: Dynamic) {
  let { summary: summary, isSummaryWhole: isSummaryWhole, isPlanIn: isPlanIn, notes: notes, agentAtWorkInWords: agentAtWorkInWords } = props;
  let isSummaryPartial = summary !== null && !isSummaryWhole;
  return jsx(PaneSection, {
    title: jsxs(Fragment, {
      children: [
        jsx('span', {
          'aria-hidden': true,
          children: importSettingsLabels.summary(),
        }),
        jsx('span', {
          className: 'sr-only',
          children: importSettingsLabels.summaryByAgent(),
        }),
      ],
    }),
    actions: jsx('span', {
      'aria-hidden': true,
      className: 'text-footnote text-secondary',
      children: importSettingsLabels.byAgent(),
    }),
    className: 'sheet-import-is-there-from-the-start',
    doesTitleStay: true,
    children: jsxs('div', {
      className: `sheet-import-agents-read flex min-w-0 flex-col gap-1.5 py-px ${PANE_GUTTER_CLASSES}`,
      'data-is-being-written': !isPlanIn || undefined,
      children: [
        (summary === null ? !isPlanIn : isSummaryPartial) &&
          jsx('span', {
            className: 'sr-only',
            children: agentAtWorkInWords,
          }),
        (summary === null ? !isPlanIn : isSummaryPartial) &&
          jsxs(SkeletonGroup, {
            decorative: true,
            className: `sheet-import-agents-read-bars flex-col justify-around ${isSummaryPartial ? 'hidden motion-reduce:flex' : 'flex'}`,
            children: [
              jsx(Skeleton, {
                width: '100%',
                className: 'text-footnote',
              }),
              jsx(Skeleton, {
                width: '92%',
                className: 'text-footnote',
              }),
              jsx(Skeleton, {
                width: '48%',
                className: 'text-footnote',
              }),
            ],
          }),
        summary !== null &&
          jsx('p', {
            dir: 'auto',
            'aria-hidden': isSummaryPartial || undefined,
            className: `${AGENT_READ_TEXT_CLASS.className} text-primary ${isSummaryPartial ? 'motion-reduce:hidden' : ''}`,
            children: summary,
          }),
        isPlanIn &&
          notes.length > 0 &&
          jsx('ul', {
            className: 'flex min-w-0 list-disc flex-col gap-1.5',
            children: notes.map(
              (note?: Dynamic) =>
                jsx(
                  'li',
                  {
                    dir: 'auto',
                    className: `ms-4 ${AGENT_READ_TEXT_CLASS.className} text-primary`,
                    children: note,
                  },
                  note,
                ),
            ),
          }),
      ],
    }),
  });
}
export function AgentsReadFailed({ why: why, onAskedAgain: onAskedAgain }: Dynamic) {
  return jsx(PaneSection, {
    title: importSettingsLabels.summary(),
    className: 'sheet-import-is-there-from-the-start',
    children: jsxs('div', {
      className: `flex min-w-0 flex-col items-start gap-2 py-px ${PANE_GUTTER_CLASSES}`,
      children: [
        jsx('p', {
          className: `${AGENT_READ_TEXT_CLASS.className} text-primary`,
          children: why,
        }),
        onAskedAgain !== null &&
          jsx(Button, {
            variant: 'secondary',
            onClick: onAskedAgain,
            children: importReviewMessages.tryAgain(),
          }),
      ],
    }),
  });
}
export function columnsNamedWords(question?: Dynamic, columns?: Dynamic) {
  let columnWords = columns
    .filter(({ columnIndex: columnIndex }: Dynamic) => question?.columns.includes(columnIndex) === true)
    .map(
      ({ name: name, reading: reading, optionCount: optionCount, keptAsTextCount: keptAsTextCount }: Dynamic) =>
        columnNameAndKindLabel(name, columnReadingWithNoteLabel(reading, optionCount, keptAsTextCount)),
    );
  return columnWords.length > 0 && joinImportWordsWithSemicolons(columnWords);
}
export function dateOrderLabel(reading?: Dynamic) {
  if (reading.kind !== 'date' && reading.kind !== 'dateAndTime') return null;
  switch (reading.order) {
    case 'dayMonthYear':
      return importColumnMessages.dayFirst();
    case 'monthDayYear':
      return importColumnMessages.monthFirst();
    case 'yearMonthDay':
      return importColumnMessages.yearFirst();
  }
}
export function decimalSignLabel(reading?: Dynamic) {
  if (!('decimalSign' in reading)) return null;
  return reading.decimalSign === 'comma' ? importSettingsLabels.commaDecimal() : importSettingsLabels.periodDecimal();
}
export function readingsThatDiffer(question?: Dynamic) {
  let readingsAt = (readingIndex?: Dynamic) =>
    question.options.map((option?: Dynamic) => option.readings[readingIndex]?.reading);
  let differingIndex = question.options[0]?.readings.findIndex(
    (reading?: Dynamic, readingIndex?: Dynamic) =>
      new (Set as Dynamic)(readingsAt(readingIndex).map((reading2?: Dynamic) => JSON.stringify(reading2))).size > 1,
  );
  return readingsAt(Math.max(0, differingIndex ?? 0));
}
export function questionOptionLabels(question?: Dynamic, examples?: Dynamic) {
  let readings = readingsThatDiffer(question);
  let isOnlyOfItsKind = (reading?: Dynamic) =>
    readings.filter((other?: Dynamic) => other?.kind === reading.kind).length === 1;
  let labelParts = readings.map((reading?: Dynamic, optionIndex?: Dynamic) => {
    let becomes = examples[optionIndex]?.[0]?.becomes ?? null;
    let kindLabel =
      reading === undefined
        ? null
        : isOnlyOfItsKind(reading)
          ? columnReadingKindLabel(reading.kind)
          : (dateOrderLabel(reading) ?? decimalSignLabel(reading));
    let exampleLabel = becomes === null ? null : withoutYear(becomes, reading);
    return [kindLabel, exampleLabel].filter((part?: Dynamic) => part !== null);
  });
  let isUnique = (parts?: Dynamic) =>
    labelParts.filter(
      (other?: Dynamic) =>
        other.join(`
`) ===
        parts.join(`
`),
    ).length === 1;
  return labelParts.map((parts?: Dynamic, optionIndex?: Dynamic) => {
    let [label = '', ...rest] = parts.length > 0 && isUnique(parts) ? parts : [optionNthLabel(optionIndex + 1), ...parts];
    let [example = null, becomes] = rest;
    return {
      label: label,
      example: example !== null && becomes !== undefined ? labelAndExample(example, becomes) : example,
    };
  });
}
export function HeadingsLineSelect(props?: Dynamic) {
  let { table: table, headerLine: headerLine, linesLeftOut: linesLeftOut, isOff: isOff, onPicked: onPicked } = props;
  let lineText = (lineNumber?: Dynamic) =>
    (table.lines[lineNumber - 1] ?? []).filter((text?: Dynamic) => text.trim() !== '').join(', ');
  let firstTableLine = lastDataLineNumber(table, linesLeftOut) ?? 0;
  let lineChoices: Dynamic = [];
  for (let lineNumber: Dynamic = 1; lineNumber <= Math.min(table.lines.length, HEADING_SCAN_LINES); lineNumber++) {
    if (lineChoices.length === MAX_HEADING_CHOICES) break;
    if (lineNumber < firstTableLine && lineText(lineNumber) !== '') lineChoices.push(lineNumber);
  }
  if (headerLine !== null && !lineChoices.includes(headerLine)) lineChoices.push(headerLine);
  return jsx(PaneSelect, {
    name: labelAndChosen(importSettingsLabels.headings(), headerLine === null ? importSettingsLabels.noHeadings() : importLineLabel(headerLine)),
    hasLongRows: true,
    longestLabelInCharacters: (Math.max as Dynamic)(0, ...lineChoices.map((lineNumber?: Dynamic) => importLineLabel(lineNumber).length)),
    isOff: isOff,
    value: headerLine === null ? 'none' : String(headerLine),
    items: [
      ...lineChoices.map(
        (lineNumber?: Dynamic) => ({
          value: String(lineNumber),
          label: importLineLabel(lineNumber),
          hint: truncateToCleanText(lineText(lineNumber), HEADING_HINT_CHARS),
        }),
      ),
      {
        value: 'none',
        label: importSettingsLabels.noHeadings(),
      },
    ],
    onChange: (value?: Dynamic) => onPicked(value === 'none' ? null : Number(value)),
  });
}
export const AGENT_READ_TEXT_CLASS = {
  className: 'text-footnote leading-snug [overflow-wrap:anywhere]',
};
export const askedAgainColumns = (previous?: Dynamic, columns?: Dynamic) => ({
  columns: columns,
  times: (previous?.times ?? 0) + 1,
});
export const columnsAskedAgainAfterChange = (previous?: Dynamic, change?: Dynamic) =>
  change.kind === 'column' && change.reading !== undefined ? askedAgainColumns(previous, [change.columnIndex]) : null;
export const withoutYear = (text?: Dynamic, reading?: Dynamic) => (reading?.kind === 'date' ? text.replace(/,? \d{4}$/, '') : text);
export const heardBecomesWords = (examples?: Dynamic) =>
  examples.map(
    ([example]: Dynamic) =>
      example === undefined || example.becomes === null ? undefined : textBecomesWords(example.text, example.becomes),
  );
export const MAX_HEADING_CHOICES = 12;
export const HEADING_SCAN_LINES = 200;
export const HEADING_HINT_CHARS = 70;
