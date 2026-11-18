import type { Dynamic } from '../dynamic.ts';
import { DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
import {
  trueOrFalseTextOf,
  readingFittingTexts,
  dataLineNumbers,
  isSameJson,
  importColumnTexts,
  fitOfReading,
  questionColumnIndexes,
} from './column-readings.ts';
import { parseBooleanText } from '../model/cell-text.ts';
import { truncateToCleanText } from './import-basics.ts';
export function previewCellOfValue(input?: Dynamic, numberFormat?: Dynamic, core?: Dynamic) {
  if (input.kind === 'number') {
    let pattern = (numberFormat ?? DEFAULT_CELL_FORMAT.numberFormat).pattern;
    return {
      kind: 'number',
      shown: core.shownWithRoomForAll(input, pattern) ?? '',
    };
  }
  return {
    kind: 'text',
    shown: input.kind === 'text' ? input.value : '',
  };
}
export function previewCellsUnderReading(reading?: Dynamic, texts?: Dynamic, core?: Dynamic) {
  if (reading.kind === 'trueOrFalse')
    return texts.map((text?: Dynamic) => {
      let trueOrFalseText = trueOrFalseTextOf(text) ?? '';
      let shownCell =
        parseBooleanText(trueOrFalseText) === null
          ? {
              kind: 'keptAsText',
              shown: text,
            }
          : {
              kind: 'trueOrFalse',
              shown: trueOrFalseText,
            };
      let cell =
        trueOrFalseText === ''
          ? {
              kind: 'blank',
            }
          : shownCell;
      return {
        cell: cell,
        held: cell,
        hasAFormatOfItsOwn: false,
      };
    });
  let read = core.textsUnderAColumnReading(reading, texts);
  return texts.map((text?: Dynamic, index?: Dynamic) => {
    let read2 = read?.read[index];
    if (read2?.kind === 'blank')
      return {
        cell: {
          kind: 'blank',
        },
        held: null,
        hasAFormatOfItsOwn: false,
      };
    if (read2?.kind === 'fits') {
      let numberFormat = read2.numberFormat ?? read?.numberFormat ?? null;
      return {
        cell: previewCellOfValue(read2.input, numberFormat, core),
        held: read2.input,
        hasAFormatOfItsOwn: read2.numberFormat !== null,
      };
    }
    return {
      cell: {
        kind: 'keptAsText',
        shown: text,
      },
      held: text,
      hasAFormatOfItsOwn: false,
    };
  });
}
export function exampleOfReading(reading?: Dynamic, texts?: Dynamic, core?: Dynamic) {
  let sampleTexts: Dynamic = [];
  for (let text of texts as Dynamic) if (text.trim() !== '' && sampleTexts.push(text) === EXAMPLE_TEXTS_TRIED) break;
  let example = previewCellsOf(readingFittingTexts(reading, texts), sampleTexts, core).find(
    (cell?: Dynamic) => cell.kind !== 'blank' && cell.kind !== 'keptAsText',
  );
  return example === undefined
    ? null
    : shortenInMiddle(truncateToCleanText(example.shown, example.shown.length), EXAMPLE_MAX_GRAPHEMES, EXAMPLE_TAIL_GRAPHEMES);
}
export function shortenInMiddle(text?: Dynamic, maxLength?: Dynamic, tailLength?: Dynamic) {
  let graphemes =
    'Segmenter' in Intl
      ? Array.from<Dynamic, Dynamic>(
          new (Intl.Segmenter as Dynamic)(undefined, {
            granularity: 'grapheme',
          }).segment(text),
          ({ segment: segment }: Dynamic) => segment,
        )
      : Array.from<Dynamic>(text);
  if (graphemes.length <= maxLength) return text;
  return `${graphemes
    .slice(0, maxLength - tailLength - 1)
    .join('')
    .trimEnd()}…${graphemes.slice(-tailLength).join('')}`;
}
export function shortenImportLabel(text?: Dynamic) {
  let clipped =
    text.length <= LABEL_MAX_GRAPHEMES * 8 ? text : text.slice(0, LABEL_MAX_GRAPHEMES * 4) + text.slice(-LABEL_TAIL_GRAPHEMES * 4);
  return shortenInMiddle(truncateToCleanText(clipped, clipped.length), LABEL_MAX_GRAPHEMES, LABEL_TAIL_GRAPHEMES);
}
export function withDropdownOptionCells(cells?: Dynamic, texts?: Dynamic, core?: Dynamic, colorsOf?: Dynamic) {
  let labels = core.labelsOfADropdownColumn(texts) ?? [];
  let options = colorsOf(labels);
  return cells.map((cell?: Dynamic) => {
    if (cell.kind !== 'text') return cell;
    let labelsAfterCell = (core.labelsOfADropdownColumn([cell.shown, ...labels]) ?? []).slice(1);
    let option = options[labels.findIndex((label?: Dynamic, index?: Dynamic) => labelsAfterCell[index] !== label)];
    return option === undefined
      ? cell
      : {
          kind: 'option',
          shown: option.label,
          color: option.color,
        };
  });
}
export function previewImportColumns(file?: Dynamic, plan?: Dynamic, core?: Dynamic, previous?: Dynamic, colorsOf?: Dynamic) {
  let records = dataLineNumbers(file, plan);
  let isSameLines =
    previous !== null && previous.plan.headerLine === plan.headerLine && isSameJson(previous.plan.linesLeftOut, plan.linesLeftOut);
  let columns = plan.columns
    .slice(0, MAX_PREVIEW_COLUMNS)
    .map(({ name: name, reading: reading }: Dynamic, columnIndex?: Dynamic) => {
      let previousColumn = isSameLines ? previous.preview.columns[columnIndex] : undefined;
      if (previousColumn !== undefined && isSameJson(previousColumn.reading, reading)) {
        let { reading: previousReading } = previousColumn;
        let { cells: cells, keptAsTextCount: keptAsTextCount, optionCount: optionCount } = previousColumn;
        return previousColumn.name === name
          ? previousColumn
          : {
              columnIndex: columnIndex,
              name: name,
              reading: previousReading,
              cells: cells,
              keptAsTextCount: keptAsTextCount,
              optionCount: optionCount,
            };
      }
      let texts = importColumnTexts(file, records, columnIndex);
      let fittingReading = readingFittingTexts(reading, texts);
      let fit = fitOfReading(fittingReading, texts, core);
      let previewCells = previewCellsOf(fittingReading, texts.slice(0, PREVIEW_ROW_COUNT), core);
      return {
        columnIndex: columnIndex,
        name: name,
        reading: fittingReading,
        cells:
          fittingReading.kind === 'dropdown'
            ? withDropdownOptionCells(previewCells, texts, core, (labels?: Dynamic) => colorsOf(fittingReading, labels))
            : previewCells,
        keptAsTextCount: fit?.notFitting ?? 0,
        optionCount: fit?.options ?? null,
      };
    });
  let linesIn = new (Set as Dynamic)(plan.headerLine === null ? records : [plan.headerLine, ...records]);
  let linesLeftOut = file.lines.flatMap(
    (line?: Dynamic, index?: Dynamic) =>
      !linesIn.has(index + 1) && line.some((cell?: Dynamic) => cell.trim() !== '') ? [index + 1] : [],
  );
  return {
    columns: columns,
    columnCount: plan.columns.length,
    linesOfFirstRows: records.slice(0, PREVIEW_ROW_COUNT),
    rowCount: records.length,
    lineLeftOutCount: linesLeftOut.length,
    linesLeftOut: linesLeftOut.slice(0, MAX_LINES_LEFT_OUT_LISTED),
  };
}
export function examplesOfQuestion(file?: Dynamic, plan?: Dynamic, question?: Dynamic, core?: Dynamic) {
  let records = dataLineNumbers(file, plan);
  let examplesOfColumn = (columnIndex?: Dynamic) => {
    let columnTexts = importColumnTexts(file, records, columnIndex);
    let texts2 = [
      ...new (Set as Dynamic)(columnTexts.slice(0, QUESTION_TEXTS_SAMPLED).filter((text?: Dynamic) => text.trim() !== '')),
    ];
    let underEach2 = question.options.map(({ readings: readings }: Dynamic) => {
      let reading = readings.find((optionReading?: Dynamic) => optionReading.columnIndex === columnIndex)?.reading ??
        plan.columns[columnIndex]?.reading ?? {
          kind: 'text',
        };
      return previewCellsUnderReading(readingFittingTexts(reading, columnTexts), texts2, core);
    });
    return {
      texts: texts2,
      underEach: underEach2,
      differsIn: (key?: Dynamic, index?: Dynamic) =>
        underEach2.some((cells?: Dynamic) => !isSameJson(cells[index]?.[key], underEach2[0]?.[index]?.[key])),
    };
  };
  let chosen: Dynamic;
  for (let columnIndex of questionColumnIndexes(question).slice(0, QUESTION_COLUMNS_TRIED) as Dynamic) {
    let columnExamples = examplesOfColumn(columnIndex);
    chosen ??= columnExamples;
    if (columnExamples.texts.some((text?: Dynamic, index?: Dynamic) => columnExamples.differsIn('held', index))) {
      chosen = columnExamples;
      break;
    }
  }
  if (chosen === undefined) return question.options.map(() => []);
  let { texts: texts, underEach: underEach, differsIn: differsIn } = chosen;
  let distinctHeldCount = (index?: Dynamic) =>
    new (Set as Dynamic)(underEach.map((cells?: Dynamic) => JSON.stringify(cells[index]?.held))).size;
  let ranks = texts.map(
    (text?: Dynamic, index?: Dynamic) => (differsIn('held', index) ? -distinctHeldCount(index) : differsIn('cell', index) ? 0 : 1),
  );
  let shownIndexes = texts
    .map((input?: Dynamic, index?: Dynamic) => index)
    .toSorted((a?: Dynamic, b2?: Dynamic) => (ranks[a] ?? 0) - (ranks[b2] ?? 0))
    .slice(0, QUESTION_EXAMPLES_SHOWN);
  return underEach.map(
    (cells?: Dynamic) =>
      shownIndexes.map((index?: Dynamic) => {
        let cell = cells[index]?.cell;
        let isRead = cell !== undefined && cell.kind !== 'blank' && cell.kind !== 'keptAsText';
        return {
          text: truncateToCleanText(texts[index] ?? '', QUESTION_EXAMPLE_LENGTH),
          becomes: isRead ? truncateToCleanText(cell.shown, QUESTION_EXAMPLE_LENGTH) : null,
        };
      }),
  );
}
export const PREVIEW_ROW_COUNT = 50;
export const MAX_PREVIEW_COLUMNS = 100;
export const MAX_LINES_LEFT_OUT_LISTED = 40;
export const previewCellsOf = (reading?: Dynamic, texts?: Dynamic, core?: Dynamic) =>
  previewCellsUnderReading(reading, texts, core).map(({ cell: cell }: Dynamic) => cell);
export const EXAMPLE_TEXTS_TRIED = 5;
export const EXAMPLE_MAX_GRAPHEMES = 14;
export const EXAMPLE_TAIL_GRAPHEMES = 7;
export const LABEL_MAX_GRAPHEMES = 60;
export const LABEL_TAIL_GRAPHEMES = 20;
export const QUESTION_TEXTS_SAMPLED = 200;
export const QUESTION_EXAMPLES_SHOWN = 2;
export const QUESTION_EXAMPLE_LENGTH = 40;
export const QUESTION_COLUMNS_TRIED = 8;
