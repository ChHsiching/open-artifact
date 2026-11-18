import type { Dynamic } from '../../dynamic.ts';
import { columnLetters } from '../../model/a1-references.ts';
import { describeRule, areasOfRuleRanges, tableColumnNameOf } from './descriptions.ts';
import {
  areRangesOneSameColumn,
  firstColumnOfRule,
  comparableOtherColumns,
  operandChoiceOf,
  operandChoicesFor,
  operatorsForColumnKind,
  operatorOfCondition,
  isWholeRowRule,
  findColumnStats,
  testedColumnOf,
} from './conditions.ts';
import { numberFormatOfCell } from '../../model/workbook.ts';
import { withDecimalSign } from '../number-signs.ts';
import { NEW_TEST_INDEX, RULE_FORMAT_PRESETS } from './rule-edits.ts';
import { isSameJsonValue } from '../../model/same-json.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
export function conditionalFormatFieldValue(rule?: Dynamic, field?: Dynamic) {
  let { effect: effect } = rule;
  if (field === 'cells') return rule.ranges;
  if (field === 'lowest' || field === 'middle' || field === 'highest') return effect.kind === 'colorScale' ? (effect[field]?.anchor ?? null) : null;
  let [testIndex = '', part = ''] = field.split('.');
  let condition = effect.kind === 'formatWhere' ? effect.allOf[Number(testIndex)]?.condition : undefined;
  if (condition === undefined) return null;
  if (part === 'count') return 'count' in condition ? condition.count : null;
  if (part === 'text') return 'text' in condition ? condition.text : null;
  return part === 'operand' || part === 'oneEnd' || part === 'otherEnd' ? numberConditionOperand(condition, part) : null;
}
export function numberConditionOperand(condition?: Dynamic, field?: Dynamic) {
  if (condition.kind === 'numberIs') return field === 'operand' ? condition.operand : null;
  if (condition.kind !== 'numberIsBetween' && condition.kind !== 'numberIsNotBetween') return null;
  return field === 'operand' ? null : condition[field];
}
export function columnLabelOf(reads: Pick<WorkbookReads, 'columnIndexOf'>, sheetId: Dynamic, { c: columnId, name: name }: Dynamic) {
  if (name !== null)
    return {
      kind: 'named',
      name: name,
    };
  let columnIndex = reads.columnIndexOf(sheetId, columnId);
  return columnIndex === null
    ? {
        kind: 'gone',
      }
    : {
        kind: 'lettered',
        letters: columnLetters(columnIndex),
      };
}
export function conditionalFormatEditorView(
  reads: WorkbookReads,
  sheetId: Dynamic,
  rule: Dynamic,
  { table: table, typed: typed, refused = [], cellsPickedByPage: cellsPickedByPage, testThatWaits: testThatWaits }: Dynamic,
  matches?: Dynamic,
) {
  let { effect: effect } = rule;
  let summary = describeRule(reads, sheetId, rule, matches);
  let areas = areasOfRuleRanges(reads, sheetId, rule.ranges);
  let testsEachCell = !areRangesOneSameColumn(rule.ranges);
  let firstColumnId = firstColumnOfRule(rule);
  let topRowIndex = areas.length === 0 ? null : (Math.min as Dynamic)(...areas.map((area?: Dynamic) => area.topRowIndex));
  let columnOption = ({ c: columnId, name: name }: Dynamic) =>
    columnLabelOf(reads, sheetId, {
      c: columnId,
      name: (
        tableColumnNameOf(
          {
            reads: reads,
            sheetId: sheetId,
            topRowIndex: topRowIndex,
            areas: areas,
          },
          columnId,
        ) ?? {
          name: name,
        }
      ).name,
    });
  let fieldState = (field?: Dynamic, text?: Dynamic) => {
    if (typed?.field === field)
      return {
        field: field,
        text: typed.text,
        isBeingTyped: true,
        isReadable: typed.rule !== null,
      };
    let refusal = refused.find((refusal2?: Dynamic) => refusal2.field === field);
    return refusal === undefined
      ? {
          field: field,
          text: text,
          isBeingTyped: false,
          isReadable: true,
        }
      : {
          field: field,
          text: refusal.text,
          isBeingTyped: false,
          isReadable: false,
        };
  };
  let numberShown = (number?: Dynamic, columnId?: Dynamic) => {
    let cellId = {
      sheetId: sheetId,
      rowId: rule.ranges[0].topLeft.r,
      columnId: columnId,
    };
    let { pattern: pattern } = numberFormatOfCell(reads, cellId);
    return (
      reads.shownWithRoomForAll(
        {
          kind: 'number',
          value: number,
        },
        pattern,
      ) ?? withDecimalSign(String(number), reads.decimalSign)
    );
  };
  let dayShown = (number?: Dynamic) =>
    reads.shownWithRoomForAll(
      {
        kind: 'number',
        value: number,
      },
      ISO_DAY_PATTERN,
    );
  let operandValue = (field?: Dynamic, operand?: Dynamic, summary2?: Dynamic, columnChoices?: Dynamic) => {
    switch (operand.kind) {
      case 'sameRowInColumn':
        return {
          kind: 'column',
          c: operand.c,
          columns: (columnChoices.some(({ c: columnId }: Dynamic) => columnId === operand.c)
            ? columnChoices
            : [tableColumnSummary(table, operand.c), ...columnChoices]
          ).map(
            (summary3?: Dynamic) => ({
              value: summary3.c,
              column: columnOption(summary3),
            }),
          ),
        };
      case 'daysFromToday':
        return operand.days === 0
          ? null
          : {
              kind: 'days',
              ...fieldState(field, String(Math.abs(operand.days))),
            };
      case 'number': {
        if (summary2.kind !== 'date')
          return {
            kind: 'number',
            ...fieldState(field, numberShown(operand.number, summary2.c)),
          };
        return {
          kind: 'day',
          day: dayShown(operand.number),
        };
      }
    }
  };
  let operandView = (testIndex?: Dynamic, slot?: Dynamic, operand?: Dynamic, summary2?: Dynamic) => {
    let columnChoices = table === null ? [] : comparableOtherColumns(table, summary2);
    let choice = operandChoiceOf(operand, summary2.kind === 'date');
    return {
      slot: slot,
      choice: choice,
      choices: withChoiceIncluded(
        operandChoicesFor(summary2.kind).filter((choice2?: Dynamic) => choice2 !== 'column' || columnChoices.length > 0),
        choice,
      ),
      value: operandValue(`${testIndex}.${slot}`, operand, summary2, columnChoices),
    };
  };
  let testView = (test?: Dynamic, index?: Dynamic) => {
    let summary2 = testedColumnSummary(rule, table, test);
    let { condition: condition } = test;
    let offersWords = summary2.kind === 'fewWords' && (condition.kind === 'textIs' || condition.kind === 'textIsNot');
    let otherColumns = (table?.columns ?? []).filter(({ c: columnId }: Dynamic) => testsEachCell || columnId !== firstColumnId);
    let tested = test.tested.kind === 'theCellItself' || (!testsEachCell && test.tested.c === firstColumnId) ? null : test.tested.c;
    let isTestedListed = tested === null || otherColumns.some(({ c: columnId }: Dynamic) => columnId === summary2.c);
    let ownColumnOption = {
      value: null,
      column: testsEachCell
        ? {
            kind: 'eachCell',
          }
        : columnOption(tableColumnSummary(table, firstColumnId)),
    };
    return {
      index: index,
      tested: tested,
      columns: [
        ownColumnOption,
        ...(isTestedListed ? otherColumns : [summary2, ...otherColumns]).map(
          (summary3?: Dynamic) => ({
            value: summary3.c,
            column: columnOption(summary3),
          }),
        ),
      ],
      isOfDates: summary2.kind === 'date',
      choices: withChoiceIncluded(operatorsForColumnKind(summary2.kind), operatorOfCondition(condition)),
      choice: operatorOfCondition(condition),
      operands: NUMBER_OPERAND_FIELDS.flatMap((slot?: Dynamic) => {
        let operand = numberConditionOperand(condition, slot);
        return operand === null ? [] : [operandView(index, slot, operand, summary2)];
      }),
      text:
        'text' in condition
          ? {
              ...fieldState(`${index}.text`, condition.text),
              offered: offersWords ? withChoiceIncluded(summary2.commonest, condition.text) : null,
            }
          : null,
      count: 'count' in condition ? fieldState(`${index}.count`, String(condition.count)) : null,
    };
  };
  let waitingTestView = (tested?: Dynamic) => {
    let test = {
      tested: tested,
      condition: {
        kind: 'isNotBlank',
      },
    };
    return {
      ...testView(test, NEW_TEST_INDEX),
      choices: operatorsForColumnKind(testedColumnSummary(rule, table, test).kind),
      choice: null,
    };
  };
  let isOfDates = tableColumnSummary(table, firstColumnId).kind === 'date';
  let textColumnIndexes = new (Set as Dynamic)(
    (table?.columns ?? []).flatMap(
      ({ c: columnId, numbers: numbers }: Dynamic) => (numbers === 0 ? (reads.columnIndexOf(sheetId, columnId) ?? []) : []),
    ),
  );
  let holdsNoNumbers = areas.every(
    ({ leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) =>
      columnCount <= textColumnIndexes.size &&
      Array.from<Dynamic, Dynamic>(
        {
          length: columnCount,
        },
        (input?: Dynamic, offset?: Dynamic) => leftColumnIndex + offset,
      ).every((columnIndex?: Dynamic) => textColumnIndexes.has(columnIndex)),
  );
  let stopView = (stop: Dynamic, { anchor: anchor, color: color }: Dynamic) => ({
    stop: stop,
    color: color,
    choices: stop === 'middle' ? ['number', 'percentile'] : ['end', 'number', 'percentile'],
    choice: anchor.kind === 'smallestNumber' || anchor.kind === 'largestNumber' ? 'end' : anchor.kind,
    isOfDates: isOfDates,
    at:
      anchor.kind === 'number'
        ? isOfDates
          ? {
              kind: 'day',
              day: dayShown(anchor.number),
            }
          : {
              kind: 'typed',
              ...fieldState(stop, numberShown(anchor.number, firstColumnId)),
            }
        : anchor.kind === 'percentile'
          ? {
              kind: 'typed',
              ...fieldState(stop, String(anchor.percentile)),
            }
          : null,
  });
  return {
    cells: fieldState('cells', summary.cells),
    cellsPickedByPage:
      cellsPickedByPage !== null && effect.kind === 'colorScale' && typed?.field !== 'cells'
        ? {
            column: columnOption(tableColumnSummary(table, firstColumnId)),
          }
        : null,
    does:
      effect.kind === 'formatWhere'
        ? {
            kind: 'formatWhere',
            isWholeRow: isWholeRowRule(rule),
            tests: [...effect.allOf.map(testView), ...(testThatWaits === null ? [] : [waitingTestView(testThatWaits)])],
            canTestBeAdded: effect.allOf.length < reads.limitsOfConditionalFormats().mostTestsInAConditionalFormat,
            format: effect.format,
            preset: RULE_FORMAT_PRESETS.find(({ format: format }: Dynamic) => isSameJsonValue(format, effect.format))?.key ?? null,
          }
        : {
            kind: 'colorScale',
            stops: COLOR_SCALE_STOPS.flatMap((stop?: Dynamic) => {
              let stopValue = effect[stop];
              return stopValue === null ? [] : [stopView(stop, stopValue)];
            }),
            hasNumbersToColor: !holdsNoNumbers,
          },
    matches: summary.matches,
    outOf: summary.outOf,
  };
}
export const UNKNOWN_COLUMN_SUMMARY = {
  name: null,
  kind: 'text',
  filled: 0,
  numbers: 0,
  blank: 0,
  commonest: [],
  smallest: null,
  middle: null,
  largest: null,
};
export const tableColumnSummary = (table?: Dynamic, columnId?: Dynamic) =>
  (table === null ? null : findColumnStats(table, columnId)) ?? {
    c: columnId,
    ...UNKNOWN_COLUMN_SUMMARY,
  };
export const testedColumnSummary = (rule?: Dynamic, table?: Dynamic, test?: Dynamic) =>
  tableColumnSummary(table, testedColumnOf(test, firstColumnOfRule(rule)));
export const ISO_DAY_PATTERN = 'yyyy-mm-dd';
export const NUMBER_OPERAND_FIELDS = ['operand', 'oneEnd', 'otherEnd'];
export const COLOR_SCALE_STOPS = ['lowest', 'middle', 'highest'];
export const withChoiceIncluded = (choices?: Dynamic, choice?: Dynamic) =>
  choices.includes(choice) ? choices : [choice, ...choices];
