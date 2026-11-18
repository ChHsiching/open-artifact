import type { Dynamic } from '../dynamic.ts';
import {
  rowsThatAreNotRecords,
  MOST_NAME_CHARACTERS,
  RULE_WORDS_NOT_READ,
  tableAtCellCached,
  tableHoldsOf,
  isTooMuchToRead,
  MOST_RULE_RANGES,
} from './table-holds.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { numberFormatOfCell } from '../model/workbook.ts';
import { MOST_CHARACTERS_OF_WORDS } from './vocabulary.ts';
import { parseA1AreaAsSeen } from '../model/a1-references.ts';
import { areasOfRuleRanges, describeRule } from '../format/conditional/descriptions.ts';
import { readRuleFromWords, namesAColumn, columnsOfConditionClause } from './read-rule.ts';
import { measureOfColumn } from './column-holds.ts';
import { suggestedRulesFor } from '../format/conditional/rule-edits.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function isMoreOnTheSheetThan(
  reads: WorkbookReads,
  sheetId: Dynamic,
  { topRowIndex: topRowIndex, rowCount: rowCount, columnCount: columnCount }: Dynamic,
) {
  for (let [rowId, cellsHeld] of reads.cellsHeldByRow(sheetId) as Dynamic) {
    if (cellsHeld.size < 2) continue;
    let rowIndex = reads.rowIndexOf(sheetId, rowId);
    if (!(rowIndex !== null && rowIndex >= topRowIndex && rowIndex < topRowIndex + rowCount) || cellsHeld.size >= columnCount + 2) return true;
  }
  return false;
}
export function recordsAroundTableCached(reads: WorkbookReads, sheetId?: Dynamic, tableArea?: Dynamic, recordsArea?: Dynamic) {
  let sheetNow = reads.sheetAsItStands(sheetId);
  let cacheKey = JSON.stringify([tableArea, recordsArea]);
  let cached = sheetNow === null ? undefined : recordsAroundTableCache.get(sheetNow)?.get(cacheKey);
  if (cached !== undefined) return cached;
  let around = {
    noRecords: rowsThatAreNotRecords(reads, sheetId, tableArea),
    isMoreOnTheSheet: isMoreOnTheSheetThan(reads, sheetId, recordsArea),
  };
  if (sheetNow !== null)
    recordsAroundTableCache.set(sheetNow, (recordsAroundTableCache.get(sheetNow) ?? new (Map as Dynamic)()).set(cacheKey, around));
  return around;
}
export function hasMixedNumberKinds(
  reads: WorkbookReads,
  sheetId: Dynamic,
  { topRowIndex: topRowIndex, rowCount: rowCount, leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic,
) {
  let kindsSeen = new (Set as Dynamic)();
  for (let rowOffset: Dynamic = 0; rowOffset < rowCount; rowOffset += 1) {
    if (rowOffset === MOST_ROWS_SCANNED_EACH_END && rowCount > 2 * rowOffset) rowOffset = rowCount - MOST_ROWS_SCANNED_EACH_END;
    for (let columnOffset: Dynamic = 0; columnOffset < columnCount; columnOffset += 1) {
      let cellId = reads.cellIdAt(sheetId, topRowIndex + rowOffset, leftColumnIndex + columnOffset);
      let shown = cellId === null ? null : cellValueOf(reads.cellOnShowIn(cellId));
      if (shown?.kind === 'text' && /\d/.test(shown.value)) return true;
      if (cellId === null || shown?.kind !== 'number') continue;
      let { kind: kind, pattern: pattern } = numberFormatOfCell(reads, cellId);
      if (kind === 'time' || kind === 'duration') return true;
      kindsSeen.add(kind + (/[$€£¥]/.exec(pattern)?.[0] ?? ''));
      if (kindsSeen.size > 1) return true;
    }
  }
  return false;
}
export function numbersSaidIn(words?: Dynamic) {
  let numbers = Array.from<Dynamic, Dynamic>(
    words.matchAll(/(\d[\d,]*(?:\.\d+)?|\.\d+)(k)?/gi),
    ([, digits = '', thousands]: Dynamic) => Number(digits.replaceAll(',', '')) * (thousands === undefined ? 1 : 1000),
  );
  return new (Set as Dynamic)([...(/\b(?:zero|negative|positive)\b/i.test(words) ? [0] : []), ...numbers]);
}
export function doesDateTextMatchWords(text?: Dynamic, words?: Dynamic) {
  let digitRuns = digitRunsOf(text);
  if (/^-?[\d.,]+$/.test(text) || digitRuns.length + (/\p{L}/u.test(text) ? 1 : 0) < 3) return false;
  let datesSaid = words.match(/(?<![\d/.-])\d{1,2}(?:\/\d{1,2}|([/.-])\d{1,2}\1\d{1,4})(?![\d/])/g) ?? [];
  return (
    /\p{L}/u.test(text) ||
    (digitRuns[0] ?? 0) > 31 ||
    datesSaid.length === 0 ||
    datesSaid.some(
      (dateSaid?: Dynamic) =>
        digitRunsOf(dateSaid).every((run?: Dynamic, runIndex?: Dynamic) => run % 100 === (digitRuns[runIndex] ?? -1) % 100),
    )
  );
}
export function areDescribedNumbersInWords(rule?: Dynamic, words?: Dynamic, decimalSign?: Dynamic) {
  if (rule.does.kind !== 'formatWhere') return true;
  let numbersSaid = numbersSaidIn(words);
  return rule.does.tests.every(
    ({ isOfDates: isOfDates, condition: condition }: Dynamic) =>
      Object.values(condition).every((operand?: Dynamic) => {
        if (
          typeof operand !== 'object' ||
          operand === null ||
          !('kind' in operand) ||
          operand.kind !== 'shown' ||
          !('text' in operand) ||
          typeof operand.text !== 'string'
        )
          return true;
        if (isOfDates) return doesDateTextMatchWords(operand.text, words);
        let [groupMark, decimalMark] = decimalSign === 'comma' ? ['.', ','] : [',', '.'];
        let plainText = operand.text.replaceAll(groupMark, '').replace(decimalMark, '.');
        let [, numberText] = /^[^\d:]*?(\d+(?:\.\d+)?)[^\d:]*$/.exec(plainText) ?? [];
        return numberText !== undefined && numbersSaid.has(Number(numberText));
      }),
  );
}
export function isColumnInThousands({ name: name }: Dynamic, isScaleWordAllowed?: Dynamic) {
  if (name === null || name.length > MOST_NAME_CHARACTERS) return false;
  if (/\bin\s+(?:thousands|millions|billions)\b/i.test(name)) return true;
  let [, noteText = ''] = /\(([^(]*)$/.exec(name) ?? /(\S*[$€£¥].*)$/.exec(name) ?? [];
  let hasCurrency = noteText.search(currencyMarkPattern) !== -1;
  return noteText
    .replace(currencyMarkPattern, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .some(
      (word?: Dynamic) =>
        /^(?:k|mn|bn|000s?|thousands?|millions?|billions?)$/i.test(word) ||
        ((hasCurrency || isScaleWordAllowed) && /^(?:mm?|b)$/i.test(word)) ||
        (isScaleWordAllowed && /^km$/i.test(word)),
    );
}
export function withoutParenthesesInColumnNames(holds?: Dynamic) {
  let cached = holdsWithoutNameNotesCache.get(holds);
  if (cached !== undefined) return cached;
  let trimmed = {
    ...holds,
    columns: holds.columns.map((column?: Dynamic) => {
      let { name: name } = column;
      return name === null || name.length > MOST_NAME_CHARACTERS || !trailingParenthesisPattern.test(name)
        ? column
        : {
            ...column,
            name: name.replace(/\s*\([^()]*\)\s*$/, ''),
          };
    }),
  };
  holdsWithoutNameNotesCache.set(holds, trimmed);
  return trimmed;
}
export function readConditionalFormatFromWords(reads: WorkbookReads, words?: Dynamic, context?: Dynamic) {
  let { inTable: inTable, viewer: viewer, today: today2, lookToStartFrom: lookToStartFrom } = context;
  let { sheetId: sheetId } = inTable;
  if (words.length > MOST_CHARACTERS_OF_WORDS) return RULE_WORDS_NOT_READ;
  let isQuoted = /["“”]/.test(words);
  let [rangeSaid, ...moreRangesSaid] = isQuoted ? [] : (words.match(cellRangeInWordsPattern) ?? []);
  let sheet = reads.listSheets().find((sheet2?: Dynamic) => sheet2.sheetId === sheetId);
  let rangeAreaSaid =
    rangeSaid === undefined || sheet === undefined ? null : parseA1AreaAsSeen(rangeSaid.replace(/^.*\s/s, '').replaceAll('$', ''), sheet);
  if (rangeSaid !== undefined && (rangeAreaSaid === null || moreRangesSaid.length > 0)) return RULE_WORDS_NOT_READ;
  let targetArea = rangeAreaSaid ?? context.selected;
  let isOneCellOnly = rangeAreaSaid === null && context.isOneCellSelected;
  let wordsWithoutRange = rangeSaid === undefined ? words : words.replace(rangeSaid, ' ');
  let wordsToRead = isQuoted ? wordsWithoutRange : wordsWithoutRange.replaceAll(wholeColumnInWordsPattern, 'column $1');
  let tableAt = tableAtCellCached(reads, inTable);
  if (tableAt === null || tableAt.table.header === null) return RULE_WORDS_NOT_READ;
  let { table: table } = tableAt;
  let { header: header } = tableAt.table;
  let bodyRange = {
    topLeft: {
      r: table.firstRowOfBody,
      c: table.firstColumn,
    },
    bottomRight: {
      r: table.lastRowOfBody,
      c: table.lastColumn,
    },
  };
  let [bodyArea] = areasOfRuleRanges(reads, sheetId, [bodyRange]);
  let headerRowIndex = reads.rowIndexOf(sheetId, header.firstRow);
  let lines = reads.linesOf(sheetId);
  if (bodyArea === undefined || headerRowIndex === null || lines === null) return RULE_WORDS_NOT_READ;
  let bodyEndRow = bodyArea.topRowIndex + bodyArea.rowCount;
  let isTargetInTable =
    targetArea !== null &&
    targetArea.leftColumnIndex >= bodyArea.leftColumnIndex &&
    targetArea.leftColumnIndex + targetArea.columnCount <= bodyArea.leftColumnIndex + bodyArea.columnCount &&
    targetArea.topRowIndex < bodyEndRow &&
    targetArea.topRowIndex + targetArea.rowCount > headerRowIndex;
  let selectedColumnIds = isTargetInTable
    ? Array.from<Dynamic, Dynamic>(
        {
          length: targetArea.columnCount,
        },
        (input?: Dynamic, columnOffset?: Dynamic) => lines.columns.idAt(targetArea.leftColumnIndex + columnOffset) ?? [],
      ).flat()
    : [];
  let holds = tableHoldsOf(reads, tableAt);
  if (isTooMuchToRead(holds)) return RULE_WORDS_NOT_READ;
  let readContext = {
    today: today2,
    signsOfNumbers: reads.signsOfNumbers,
    isMonthFirst: reads.locale === 'en-US',
    selected: selectedColumnIds,
    areSeveralCellsSelected: isTargetInTable && !isOneCellOnly,
    columnLettered: (letters?: Dynamic) => {
      let area = parseA1AreaAsSeen(letters + '1', {
        ownRowOrder: null,
        rowCount: lines.rows.count,
        columnCount: lines.columns.count,
      });
      return area === null ? null : lines.columns.idAt(area.leftColumnIndex);
    },
  };
  let read = readRuleFromWords(wordsToRead, holds, viewer, readContext);
  let readUsed =
    read.kind === 'read' || !holds.columns.some(({ name: name }: Dynamic) => trailingParenthesisPattern.test(name ?? ''))
      ? read
      : readRuleFromWords(wordsToRead, withoutParenthesesInColumnNames(holds), viewer, readContext);
  if (readUsed.kind === 'notRead') return read.kind === 'notRead' ? read : readUsed;
  let isColumnNamedInWords = namesAColumn(wordsToRead, holds) || namesAColumn(wordsToRead, withoutParenthesesInColumnNames(holds));
  if (!header.isSure && !isColumnNamedInWords) return RULE_WORDS_NOT_READ;
  if (rangeAreaSaid !== null && !readUsed.isAboutSelected) return RULE_WORDS_NOT_READ;
  let recordsArea = {
    ...bodyArea,
    topRowIndex: headerRowIndex,
    rowCount: bodyArea.topRowIndex + bodyArea.rowCount - headerRowIndex,
  };
  let recordsAround = recordsAroundTableCached(reads, sheetId, bodyArea, recordsArea);
  let goesPastRecords = targetArea !== null && targetArea.topRowIndex + targetArea.rowCount > recordsArea.topRowIndex + recordsArea.rowCount;
  if (recordsAround.isMoreOnTheSheet && (!isTargetInTable || (goesPastRecords && !isOneCellOnly))) return RULE_WORDS_NOT_READ;
  if (recordsAround.noRecords.isOneEmpty) return RULE_WORDS_NOT_READ;
  let firstRowIndex = rangeAreaSaid?.topRowIndex ?? Math.max(bodyArea.topRowIndex, targetArea?.topRowIndex ?? 0);
  let endRowIndex =
    rangeAreaSaid === null
      ? Math.min(bodyEndRow, (targetArea?.topRowIndex ?? 0) + (targetArea?.rowCount ?? 0))
      : firstRowIndex + rangeAreaSaid.rowCount;
  let isPartOfColumn =
    !isOneCellOnly &&
    isTargetInTable &&
    wordsToRead === wordsWithoutRange &&
    firstRowIndex < endRowIndex &&
    (firstRowIndex !== bodyArea.topRowIndex || endRowIndex !== bodyEndRow);
  let [firstRowId, lastRowId] = isPartOfColumn
    ? [lines.rows.idAt(firstRowIndex), lines.rows.idAt(endRowIndex - 1)]
    : [lines.rows.idAt(bodyArea.topRowIndex), lines.rows.idAt(bodyEndRow - 1)];
  if (firstRowId === null || lastRowId === null) return RULE_WORDS_NOT_READ;
  let lastColumnId = readUsed.isAboutSelected ? (selectedColumnIds.at(-1) ?? readUsed.c) : readUsed.c;
  let ruleRange = readUsed.isForRows
    ? {
        topLeft: {
          r: firstRowId,
          c: table.firstColumn,
        },
        bottomRight: {
          r: lastRowId,
          c: table.lastColumn,
        },
      }
    : {
        topLeft: {
          r: firstRowId,
          c: readUsed.c,
        },
        bottomRight: {
          r: lastRowId,
          c: lastColumnId,
        },
      };
  let endAtLastRecord = rangeAreaSaid === null && !isPartOfColumn;
  let { rule: rule } = readUsed;
  let columnsUsed =
    rule.kind === 'colorScale' ? [] : [...(readUsed.isAboutSelected ? selectedColumnIds : []), ...rule.allOf.flatMap(columnsOfConditionClause)];
  if (/\dk\b/i.test(wordsToRead) && holds.columns.some((column?: Dynamic) => isColumnInThousands(column, columnsUsed.includes(column.c))))
    return RULE_WORDS_NOT_READ;
  let rankedColumns =
    rule.kind === 'colorScale'
      ? [readUsed.c]
      : rule.allOf.flatMap(({ c: c, condition: { kind: kind } }: Dynamic) => (RANKED_CONDITION_KINDS.has(kind) ? [c] : []));
  let [ruleArea] = areasOfRuleRanges(reads, sheetId, [ruleRange]);
  if (ruleArea === undefined) return RULE_WORDS_NOT_READ;
  let nonRecordRows = recordsAround.noRecords.rows.filter(
    (rowIndex?: Dynamic) => rowIndex >= ruleArea.topRowIndex && rowIndex < ruleArea.topRowIndex + ruleArea.rowCount,
  );
  let mostRanges = Math.min(MOST_RULE_RANGES, reads.limitsOfConditionalFormats().mostRangesInAConditionalFormat);
  if (nonRecordRows.length > mostRanges) return RULE_WORDS_NOT_READ;
  if (rankedColumns.length > 0 && (nonRecordRows.length > 0 || recordsAround.noRecords.isMiddleUnread)) return RULE_WORDS_NOT_READ;
  let numberColumns =
    rule.kind === 'colorScale'
      ? [readUsed.c]
      : rule.allOf.flatMap(
          (test?: Dynamic) =>
            'operand' in test.condition ||
            'oneEnd' in test.condition ||
            'count' in test.condition ||
            (test.condition.kind === 'appearsMoreThanOnce' &&
              measureOfColumn(
                tableAt.columns.find(({ c: c }: Dynamic) => c === test.c) ?? {
                  kind: 'text',
                },
              ) !== null)
              ? columnsOfConditionClause(test)
              : [],
        );
  let columnArea = (columnId?: Dynamic) => {
    let columnIndex = reads.columnIndexOf(sheetId, columnId);
    if (readUsed.isAboutSelected) return ruleArea;
    return columnIndex === null
      ? null
      : {
          ...ruleArea,
          leftColumnIndex: columnIndex,
          columnCount: 1,
        };
  };
  if (
    numberColumns.some((columnId?: Dynamic) => {
      let area = columnArea(columnId);
      return area === null || hasMixedNumberKinds(reads, sheetId, area);
    })
  )
    return RULE_WORDS_NOT_READ;
  if (rule.kind === 'colorScale')
    return {
      kind: 'read',
      rules: [suggestedRulesFor([ruleRange]).scale],
      endAtLastRecord: endAtLastRecord,
    };
  if (rule.allOf.length > reads.limitsOfConditionalFormats().mostTestsInAConditionalFormat) return RULE_WORDS_NOT_READ;
  let toTest = ({ c: c, condition: condition }: Dynamic) => ({
    tested:
      !readUsed.isForRows && c === readUsed.c
        ? {
            kind: 'theCellItself',
          }
        : {
            kind: 'sameRowInColumn',
            c: c,
          },
    condition: condition,
  });
  let [firstTest, ...otherTests] = rule.allOf;
  let effect = {
    kind: 'formatWhere',
    allOf: [toTest(firstTest), ...otherTests.map(toTest)],
    format: rule.format ?? lookToStartFrom,
  };
  let ruleToAdd = {
    ranges: [ruleRange],
    effect: effect,
  };
  if (!areDescribedNumbersInWords(describeRule(reads, sheetId, ruleToAdd, null), wordsWithoutRange, reads.decimalSign)) return RULE_WORDS_NOT_READ;
  let columnsOfRule = [...(readUsed.isAboutSelected ? selectedColumnIds : []), ...rule.allOf.flatMap(columnsOfConditionClause)];
  let hasValueInRow = (rowIndex?: Dynamic) =>
    columnsOfRule.some((columnId?: Dynamic) => {
      let columnIndex = reads.columnIndexOf(sheetId, columnId);
      let cellId = columnIndex === null ? null : reads.cellIdAt(sheetId, rowIndex, columnIndex);
      return cellId !== null && reads.cellOnShowIn(cellId) !== null;
    });
  if (nonRecordRows.some(hasValueInRow)) return RULE_WORDS_NOT_READ;
  let rowRangesAt = (rowIndex?: Dynamic) => {
    let rowId = lines.rows.idAt(rowIndex);
    return rowId === null
      ? []
      : [
          {
            topLeft: {
              ...ruleRange.topLeft,
              r: rowId,
            },
            bottomRight: {
              ...ruleRange.bottomRight,
              r: rowId,
            },
          },
        ];
  };
  let [firstRowRange, ...otherRowRanges] = nonRecordRows.flatMap(rowRangesAt);
  let givenOnRows =
    firstRowRange === undefined
      ? null
      : reads.formatsGivenAsIf(sheetId, [
          {
            ranges: [firstRowRange, ...otherRowRanges],
            effect: effect,
            inPlaceOf: null,
          },
        ]);
  if (firstRowRange !== undefined && (givenOnRows?.matches[0]?.cells ?? 1) > 0) return RULE_WORDS_NOT_READ;
  if (readUsed.isAboutSelected && selectedColumnIds.length > 1)
    return {
      kind: 'read',
      rules: [ruleToAdd],
      endAtLastRecord: endAtLastRecord,
    };
  let bodyColumnsRange = {
    topLeft: {
      ...ruleRange.topLeft,
      r: table.firstRowOfBody,
    },
    bottomRight: {
      ...ruleRange.bottomRight,
      r: table.lastRowOfBody,
    },
  };
  let isMergedInRow = (rowIndex?: Dynamic) =>
    columnsOfRule.some((columnId?: Dynamic) => {
      let columnIndex = reads.columnIndexOf(sheetId, columnId);
      let mergedArea =
        columnIndex === null
          ? null
          : reads.mergedAreaAt(sheetId, {
              rowIndex: rowIndex,
              columnIndex: columnIndex,
            });
      return mergedArea !== null && mergedArea.rowCount > 1;
    });
  let rowsLeftOut =
    rankedColumns.length > 0 || recordsAround.noRecords.isMiddleUnread || recordsAround.noRecords.rows.some(isMergedInRow)
      ? []
      : recordsAround.noRecords.rows.slice(0, mostRanges);
  let [firstLeftOut, ...otherLeftOut] = rowsLeftOut.flatMap(rowRangesAt);
  let given = reads.formatsGivenAsIf(
    sheetId,
    firstLeftOut === undefined
      ? [
          {
            ranges: [bodyColumnsRange],
            effect: effect,
            inPlaceOf: null,
          },
        ]
      : [
          {
            ranges: [bodyColumnsRange],
            effect: effect,
            inPlaceOf: null,
          },
          {
            ranges: [firstLeftOut, ...otherLeftOut],
            effect: effect,
            inPlaceOf: null,
          },
        ],
  );
  let matchedLeftOut = firstLeftOut === undefined ? 0 : (given?.matches[1]?.rows ?? NaN);
  let matchedRows = (given?.matches[0]?.rows ?? NaN) - matchedLeftOut;
  let filtered = reads.filteredRows(table, {
    allOf: [filterClauseOfRuleTest(firstTest), ...otherTests.map(filterClauseOfRuleTest)],
  });
  if (filtered?.kind !== 'filteredRows') return RULE_WORDS_NOT_READ;
  let rowsOutOfView = filtered.rowsOutOfView;
  let isRowInView = (rowIndex?: Dynamic) => {
    let rowId = lines.rows.idAt(rowIndex) ?? '';
    return !rowsOutOfView.some(({ base: base, first: first, count: count }: Dynamic) => {
      let number = Number(rowId.slice(base.length + 1));
      return rowId.startsWith(base + '.') && number >= first && number < first + count;
    });
  };
  return (firstLeftOut === undefined
    ? filtered.recordsInView
    : bodyArea.rowCount -
      rowsOutOfView.reduce((total: Dynamic, { count: count }: Dynamic) => total + count, 0) -
      rowsLeftOut.filter(isRowInView).length) === matchedRows
    ? {
        kind: 'read',
        rules: [ruleToAdd],
        endAtLastRecord: endAtLastRecord,
      }
    : RULE_WORDS_NOT_READ;
}
export const recordsAroundTableCache = new (WeakMap as Dynamic)();
export const MOST_ROWS_SCANNED_EACH_END = 300;
export const digitRunsOf = (text?: Dynamic) => (text.match(/\d+/g) ?? []).map(Number);
export const RANKED_CONDITION_KINDS = new (Set as Dynamic)(['isAmongTheLargest', 'isAmongTheSmallest', 'appearsMoreThanOnce']);
export const currencyMarkPattern = /[$€£¥]|usd|eur|gbp|jpy|cad|aud|chf/gi;
export const trailingParenthesisPattern = /\S\s*\([^()]*\)\s*$/;
export const holdsWithoutNameNotesCache = new (WeakMap as Dynamic)();
export const filterClauseOfRuleTest = ({ c: c, condition: condition }: Dynamic) => ({
  anyOf: [
    {
      c: c,
      asked: {
        kind: 'meets',
        condition: condition,
      },
    },
  ],
});
export const cellRangeInWordsPattern = /(?:\b(?:in|on|for|of|cells|range)\s+)*\$?[a-z]{1,3}\$?\d+:\$?[a-z]{1,3}\$?\d+(?![\w:])/gi;
export const wholeColumnInWordsPattern = /(?<![\w:$])\$?([a-z]{1,3}):\$?\1(?![\w:])/gi;
