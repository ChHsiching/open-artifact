import type { Dynamic } from '../../dynamic.ts';
import { tableBoundsOf, rowRangeOfTable } from '../../tables/finding.ts';
import { cellValueOf } from '../../model/cell-values.ts';
import { columnLetters } from '../../model/a1-references.ts';
import { numberFormatOfCell } from '../../model/workbook.ts';
import { withDecimalSign } from '../number-signs.ts';
import { areRangesOneSameColumn, isWholeRowRule, testedColumnOf, firstColumnOfRule } from './conditions.ts';
import { areasToA1AsStored } from '../../formulas/from-words/where.ts';
import { ownRowOrderOfSheet } from '../../model/line-ids.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
export function areaOfRuleRange(reads: WorkbookReads, sheetId: Dynamic, { topLeft: topLeft, bottomRight: bottomRight }: Dynamic) {
  let topLeftPosition = reads.positionOfCell({
    sheetId: sheetId,
    rowId: topLeft.r,
    columnId: topLeft.c,
  });
  let bottomRightPosition = reads.positionOfCell({
    sheetId: sheetId,
    rowId: bottomRight.r,
    columnId: bottomRight.c,
  });
  if (topLeftPosition === null || bottomRightPosition === null) return null;
  let [topRowIndex, leftColumnIndex] = [
    Math.min(topLeftPosition.rowIndex, bottomRightPosition.rowIndex),
    Math.min(topLeftPosition.columnIndex, bottomRightPosition.columnIndex),
  ];
  return {
    topRowIndex: topRowIndex,
    leftColumnIndex: leftColumnIndex,
    rowCount: Math.abs(topLeftPosition.rowIndex - bottomRightPosition.rowIndex) + 1,
    columnCount: Math.abs(topLeftPosition.columnIndex - bottomRightPosition.columnIndex) + 1,
  };
}
export function tableOfCells(reads: WorkbookReads, sheetId?: Dynamic, cells?: Dynamic) {
  let sheet = reads.sheetAsItStands(sheetId);
  let knownTables = (sheet === null ? undefined : tablesFoundBySheet.get(sheet)) ?? [];
  let tableHasCell = ({ table: table }: Dynamic, { rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) => {
    let shape = tableBoundsOf(table, reads);
    if (shape === null) return false;
    let [rows, { columns: columns }] = [rowRangeOfTable(shape), shape];
    return rowIndex >= rows.first && rowIndex <= rows.last && columnIndex >= columns.first && columnIndex <= columns.last;
  };
  for (let cell of cells as Dynamic) {
    let table = knownTables.find((table2?: Dynamic) => tableHasCell(table2, cell));
    if (table !== undefined) return table;
  }
  for (let { cellId: cell } of cells as Dynamic) {
    let table = reads.tableAtCell(cell);
    if (table === null) continue;
    if (sheet !== null && !knownTables.includes(table)) tablesFoundBySheet.set(sheet, [...knownTables, table]);
    return table;
  }
  return null;
}
export function columnNameInTable(reads: WorkbookReads, { table: table, columns: columns }: Dynamic, columnId?: Dynamic, columnIndex?: Dynamic) {
  let header = tableBoundsOf(table, reads)?.header ?? null;
  if (header === null) return null;
  let headerValues = Array.from<Dynamic, Dynamic>(
    {
      length: header.last - header.first + 1,
    },
    (unused?: Dynamic, offset?: Dynamic) => {
      let cellId = reads.cellIdAt(table.sheetId, header.first + offset, columnIndex);
      return cellId === null ? null : cellValueOf(reads.cellOnShowIn(cellId));
    },
  ).filter((value?: Dynamic) => value !== null);
  let knownName = columns.find(({ c: c }: Dynamic) => c === columnId)?.name ?? null;
  if (headerValues.some(({ kind: kind }: Dynamic) => kind !== 'text')) return knownName;
  let headerTexts = headerValues
    .flatMap((value?: Dynamic) => (value.kind === 'text' ? [value.value.trim().replaceAll(/\s+/g, ' ')] : []))
    .filter((text?: Dynamic) => text !== '');
  return knownName !== null && (headerTexts.includes(knownName) || headerTexts.join(' · ') === knownName) ? knownName : (headerTexts.at(-1) ?? null);
}
export function tableColumnNameOf({ reads: reads, sheetId: sheetId, topRowIndex: topRowIndex, areas = [] }: Dynamic, c?: Dynamic) {
  let columnIndex = reads.columnIndexOf(sheetId, c);
  if (columnIndex === null || topRowIndex === null) return null;
  let { topRowIndex: areaTop, rowCount: areaRowCount } = areas.find(
    ({ leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) =>
      columnIndex >= leftColumnIndex && columnIndex < leftColumnIndex + columnCount,
  ) ??
    areas.find((area?: Dynamic) => area.topRowIndex === topRowIndex) ?? {
      topRowIndex: topRowIndex,
      rowCount: 1,
    };
  let topCells = Array.from<Dynamic, Dynamic>(
    {
      length: Math.min(areaRowCount, MAX_ROWS_SCANNED_FOR_TABLE),
    },
    (unused?: Dynamic, offset?: Dynamic) => {
      let cellId = reads.cellIdAt(sheetId, areaTop + offset, columnIndex);
      return cellId === null || cellValueOf(reads.cellOnShowIn(cellId)) === null
        ? []
        : [
            {
              cellId: cellId,
              rowIndex: areaTop + offset,
              columnIndex: columnIndex,
            },
          ];
    },
  ).flat();
  let table = tableOfCells(reads, sheetId, topCells.slice(0, MAX_CELLS_FOR_TABLE));
  return table === null
    ? null
    : {
        name: columnNameInTable(reads, table, c, columnIndex),
      };
}
export function describeColumn(place?: Dynamic, c?: Dynamic) {
  let { reads: reads, sheetId: sheetId, topRowIndex: topRowIndex } = place;
  let columnIndex = reads.columnIndexOf(sheetId, c);
  if (columnIndex === null)
    return {
      kind: 'gone',
    };
  let lettered = {
    kind: 'lettered',
    letters: columnLetters(columnIndex),
  };
  let inTable = tableColumnNameOf(place, c);
  if (inTable !== null)
    return inTable.name === null
      ? lettered
      : {
          kind: 'named',
          name: inTable.name,
        };
  let shownValueAt = (rowIndex?: Dynamic) => {
    let cellId = reads.cellIdAt(sheetId, rowIndex, columnIndex);
    return cellId === null ? null : cellValueOf(reads.cellOnShowIn(cellId));
  };
  let hasValueAbove = (rowIndex?: Dynamic) => rowIndex > 0 && shownValueAt(rowIndex - 1) !== null;
  let startRow = topRowIndex ?? 0;
  let headingRow: Dynamic = startRow;
  while (startRow - headingRow < MAX_ROWS_UP_TO_HEADING && hasValueAbove(headingRow)) headingRow -= 1;
  let headingValue = headingRow === startRow || hasValueAbove(headingRow) ? null : shownValueAt(headingRow);
  let headingText = headingValue?.kind === 'text' ? headingValue.value.trim() : '';
  return headingText === ''
    ? lettered
    : {
        kind: 'named',
        name: headingText,
      };
}
export function numberFormatAtTopOfColumn({ reads: reads, sheetId: sheetId, topRowIndex: topRowIndex }: Dynamic, c?: Dynamic) {
  let columnIndex = c === null ? null : reads.columnIndexOf(sheetId, c);
  let cellId = columnIndex === null || topRowIndex === null ? null : reads.cellIdAt(sheetId, topRowIndex, columnIndex);
  return cellId === null ? null : numberFormatOfCell(reads, cellId);
}
export function showNumberInColumnFormat(place?: Dynamic, number?: Dynamic, c?: Dynamic) {
  let pattern = numberFormatAtTopOfColumn(place, c)?.pattern ?? 'General';
  return (
    place.reads.shownWithRoomForAll(
      {
        kind: 'number',
        value: number,
      },
      pattern,
    ) ?? withDecimalSign(String(number), place.reads.decimalSign)
  );
}
export function describeOperand(place?: Dynamic, operand?: Dynamic, c?: Dynamic) {
  switch (operand.kind) {
    case 'sameRowInColumn':
      return {
        kind: 'column',
        column: describeColumn(place, operand.c),
      };
    case 'daysFromToday':
      if (operand.days === 0)
        return {
          kind: 'today',
        };
      return {
        kind: operand.days > 0 ? 'daysFromToday' : 'daysAgo',
        days: Math.abs(operand.days),
      };
    case 'number':
      return {
        kind: 'shown',
        text: showNumberInColumnFormat(place, operand.number, c),
      };
  }
}
export function describeCondition(place?: Dynamic, condition?: Dynamic, c?: Dynamic) {
  switch (condition.kind) {
    case 'numberIs':
      return {
        ...condition,
        operand: describeOperand(place, condition.operand, c),
      };
    case 'numberIsBetween':
    case 'numberIsNotBetween':
      return {
        ...condition,
        oneEnd: describeOperand(place, condition.oneEnd, c),
        otherEnd: describeOperand(place, condition.otherEnd, c),
      };
    case 'isBlank':
    case 'isNotBlank':
    case 'appearsMoreThanOnce':
    case 'isAnError':
    case 'textIs':
    case 'textIsNot':
    case 'textContains':
    case 'textDoesNotContain':
    case 'textStartsWith':
    case 'textEndsWith':
    case 'booleanIs':
    case 'isAmongTheLargest':
    case 'isAmongTheSmallest':
      return condition;
  }
}
export function describeRuleTest(place?: Dynamic, test?: Dynamic, rangeColumn?: Dynamic, isAcrossColumns?: Dynamic) {
  let c = test.tested.kind === 'theCellItself' ? rangeColumn : test.tested.c;
  let formatKind = numberFormatAtTopOfColumn(place, c)?.kind;
  return {
    column:
      c === null || (test.tested.kind === 'theCellItself' && isAcrossColumns)
        ? {
            kind: 'eachCell',
          }
        : describeColumn(place, c),
    isOfDates: formatKind === 'date' || formatKind === 'dateAndTime' || isRelativeDateCondition(test.condition),
    condition: describeCondition(place, test.condition, c),
  };
}
export function describeColumnCondition(place?: Dynamic, c?: Dynamic, column?: Dynamic, condition?: Dynamic) {
  let formatKind = numberFormatAtTopOfColumn(place, c)?.kind;
  return {
    column: column,
    isOfDates: formatKind === 'date' || formatKind === 'dateAndTime' || isRelativeDateCondition(condition),
    condition: describeCondition(place, condition, c),
  };
}
export function describeRule(reads: WorkbookReads, sheetId?: Dynamic, rule?: Dynamic, matches?: Dynamic) {
  let areas = areasOfRuleRanges(reads, sheetId, rule.ranges);
  let topRowIndex = areas.length === 0 ? null : (Math.min as Dynamic)(...areas.map((area?: Dynamic) => area.topRowIndex));
  let place = {
    reads: reads,
    sheetId: sheetId,
    topRowIndex: topRowIndex,
    areas: areas,
  };
  let isAcrossColumns = !areRangesOneSameColumn(rule.ranges);
  let rangeColumn = rule.ranges[0]?.topLeft.c ?? null;
  let { effect: effect } = rule;
  let [firstTest, ...moreTests] = effect.kind === 'formatWhere' ? effect.allOf : [];
  return {
    cells: areasToA1AsStored(areas, ownRowOrderOfSheet(reads, sheetId)),
    isWholeRow: isWholeRowRule(rule),
    matches: matches,
    outOf: {
      cells: areas.reduce((total: Dynamic, { rowCount: rowCount, columnCount: columnCount }: Dynamic) => total + rowCount * columnCount, 0),
      rows: areas.reduce((total: Dynamic, { rowCount: rowCount }: Dynamic) => total + rowCount, 0),
    },
    does:
      effect.kind === 'formatWhere' && firstTest !== undefined
        ? {
            kind: 'formatWhere',
            tests: [
              describeRuleTest(place, firstTest, rangeColumn, isAcrossColumns),
              ...moreTests.map((test?: Dynamic) => describeRuleTest(place, test, rangeColumn, isAcrossColumns)),
            ],
            format: effect.format,
          }
        : {
            kind: 'colorScale',
            column:
              rangeColumn === null || isAcrossColumns
                ? {
                    kind: 'eachCell',
                  }
                : describeColumn(place, rangeColumn),
            colors:
              effect.kind === 'colorScale'
                ? [effect.lowest, effect.middle, effect.highest].flatMap((point?: Dynamic) => (point === null ? [] : [point.color]))
                : [],
          },
  };
}
export function oneColorPerTextColumn(rules?: Dynamic) {
  let testedColumns = rules.map((rule?: Dynamic) => {
    let { effect: effect } = rule;
    if (effect.kind !== 'formatWhere' || effect.allOf.length > 1) return null;
    let [test] = effect.allOf;
    return test.condition.kind === 'textIs' && effect.format.fillColor !== undefined ? testedColumnOf(test, firstColumnOfRule(rule)) : null;
  });
  let [firstColumn = null] = testedColumns;
  return testedColumns.every((c?: Dynamic) => c === firstColumn) ? firstColumn : null;
}
export function describeRules(reads: WorkbookReads, sheetId?: Dynamic, rules?: Dynamic, matches?: Dynamic) {
  let firstDescribed = describeRule(reads, sheetId, rules[0], matches);
  if (rules.length === 1)
    return {
      kind: 'one',
      rule: firstDescribed,
    };
  let areas = rules.flatMap(({ ranges: ranges }: Dynamic) => areasOfRuleRanges(reads, sheetId, ranges));
  let cells = areasToA1AsStored(
    areas.filter(
      (area?: Dynamic, areaIndex?: Dynamic) =>
        !areas.some(
          (otherArea?: Dynamic, otherIndex?: Dynamic) =>
            isRuleAreaWithin(area, otherArea) && (otherIndex < areaIndex || !isRuleAreaWithin(otherArea, area)),
        ),
    ),
    ownRowOrderOfSheet(reads, sheetId),
  );
  if (oneColorPerTextColumn(rules) === null || firstDescribed.does.kind !== 'formatWhere')
    return {
      kind: 'several',
      first: firstDescribed,
      cells: cells,
      ruleCount: rules.length,
    };
  return {
    kind: 'oneColorForEach',
    column: firstDescribed.does.tests[0].column,
    isWholeRow: firstDescribed.isWholeRow,
    cells: cells,
    fills: rules.flatMap(
      ({ effect: effect }: Dynamic) =>
        effect.kind === 'formatWhere' && effect.format.fillColor !== undefined ? [effect.format.fillColor] : [],
    ),
    ruleCount: rules.length,
  };
}
export const areasOfRuleRanges = (reads: WorkbookReads, sheetId?: Dynamic, ranges?: Dynamic) =>
  ranges.flatMap((range?: Dynamic) => {
    let area = areaOfRuleRange(reads, sheetId, range);
    return area === null ? [] : [area];
  });
export const MAX_ROWS_UP_TO_HEADING = 200;
export const MAX_ROWS_SCANNED_FOR_TABLE = 10;
export const MAX_CELLS_FOR_TABLE = 3;
export const tablesFoundBySheet = new (WeakMap as Dynamic)();
export const isRelativeDateCondition = (condition?: Dynamic) =>
  (condition.kind === 'numberIs' && condition.operand.kind === 'daysFromToday') ||
  ((condition.kind === 'numberIsBetween' || condition.kind === 'numberIsNotBetween') &&
    (condition.oneEnd.kind === 'daysFromToday' || condition.otherEnd.kind === 'daysFromToday'));
export const isRuleAreaWithin = (area?: Dynamic, outer?: Dynamic) =>
  area.topRowIndex >= outer.topRowIndex &&
  area.leftColumnIndex >= outer.leftColumnIndex &&
  area.topRowIndex + area.rowCount <= outer.topRowIndex + outer.rowCount &&
  area.leftColumnIndex + area.columnCount <= outer.leftColumnIndex + outer.columnCount;
