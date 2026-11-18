import type { Dynamic } from '../../dynamic.ts';
import { areasOfRuleRanges } from './descriptions.ts';
import { measureOfColumn } from '../../words/column-holds.ts';
import { cornerCellIdsOf, tableColumnsInAbout, isSameRulesJson } from './pane-state.ts';
import { dropdownColorRuleLists, suggestionsForCells } from './suggestions.ts';
import { isSelectionOneCell } from '../../selection/keyboard.ts';
import { asNewRules } from './agent-rules.ts';
import type { PageState } from '../../state/initial-state.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
export function isOneTextColumnTable(reads: WorkbookReads, sheetId?: Dynamic, table?: Dynamic) {
  let [recordsArea] = areasOfRuleRanges(reads, sheetId, [table.records]);
  let [firstColumn, ...otherColumns] = table.columns;
  return otherColumns.length === 0 && firstColumn.kind === 'text' && (recordsArea?.rowCount ?? 0) < 2;
}
export function looksLikeRecordsTable(reads: WorkbookReads, sheetId?: Dynamic, table?: Dynamic) {
  let [recordsArea] = areasOfRuleRanges(reads, sheetId, [table.records]);
  let filledColumns = table.columns.filter(isColumnFilled);
  return (
    recordsArea !== undefined &&
    recordsArea.rowCount > 1 &&
    recordsArea.columnCount === table.columns.length &&
    filledColumns.some(
      ({ kind: kind, name: name }: Dynamic) =>
        name !== null &&
        measureOfColumn({
          kind: kind,
        }) !== 'numbers',
    )
  );
}
export function mainTableCornersOnSheet(reads: WorkbookReads, sheetId?: Dynamic) {
  let heldRows = [...reads.cellsHeldByRow(sheetId)].flatMap(([rowId, cells]: Dynamic) => {
    let rowIndex = reads.rowIndexOf(sheetId, rowId);
    return cells.size === 0 || rowIndex === null
      ? []
      : [
          {
            rowId: rowId,
            at: rowIndex,
            cells: cells,
          },
        ];
  });
  heldRows.sort(
    (row?: Dynamic, otherRow?: Dynamic) =>
      row.cells.size === otherRow.cells.size ? row.at - otherRow.at : otherRow.cells.size - row.cells.size,
  );
  let tablesSeen: Dynamic = [];
  let oneRowTable: Dynamic = null;
  for (let { rowId: rowId, at: rowIndex, cells: cells } of heldRows as Dynamic) {
    if (tablesSeen.length === MOST_TABLES_LOOKED_AT) break;
    let leftmostCell: Dynamic = null;
    for (let columnId of cells.keys() as Dynamic) {
      let columnIndex = reads.columnIndexOf(sheetId, columnId);
      if (columnIndex === null || (leftmostCell !== null && columnIndex >= leftmostCell.at)) continue;
      if (!tablesSeen.some((tableArea?: Dynamic) => isCellInArea(tableArea, rowIndex, columnIndex)))
        leftmostCell = {
          columnId: columnId,
          at: columnIndex,
        };
    }
    if (leftmostCell === null) continue;
    let cell = {
      sheetId: sheetId,
      rowId: rowId,
      columnId: leftmostCell.columnId,
    };
    let table = reads.conditionalFormatSuggestions(cell, cell)?.table ?? null;
    if (table === null) return null;
    let [recordsArea] = areasOfRuleRanges(reads, sheetId, [table.records]);
    if (recordsArea === undefined) return cornerCellIdsOf(sheetId, table.records);
    let isSmallOneColumnTable =
      recordsArea.columnCount === 1 && recordsArea.rowCount <= MOST_ROWS_OF_ONE_COLUMN_TABLE && (oneRowTable?.columnCount ?? 1) > 1;
    if (recordsArea.rowCount > 1 && !isSmallOneColumnTable) return cornerCellIdsOf(sheetId, table.records);
    if (recordsArea.rowCount === 1)
      oneRowTable ??= {
        records: table.records,
        columnCount: recordsArea.columnCount,
      };
    tablesSeen.push({
      ...recordsArea,
      topRowIndex: recordsArea.topRowIndex - 1,
      rowCount: recordsArea.rowCount + 1,
    });
  }
  return oneRowTable === null ? null : cornerCellIdsOf(sheetId, oneRowTable.records);
}
export function tableInPlaceOfEmptySelection(reads: WorkbookReads, sheetId?: Dynamic, suggestions?: Dynamic) {
  if (tableColumnsInAbout(suggestions).some(isColumnFilled)) return null;
  let { about: about } = suggestions;
  if (areasOfRuleRanges(reads, sheetId, [about]).some((area?: Dynamic) => reads.filledCellsIn(sheetId, area).length > 0)) return null;
  return suggestions.table.columns.some(isColumnFilled)
    ? cornerCellIdsOf(sheetId, suggestions.table.records)
    : mainTableCornersOnSheet(reads, sheetId);
}
export function tableInPlaceOfSelection(reads: WorkbookReads, sheetId?: Dynamic, suggestions?: Dynamic, hasOneCellSelected?: Dynamic) {
  let inPlaceOfEmpty = tableInPlaceOfEmptySelection(reads, sheetId, suggestions);
  if (!hasOneCellSelected || !isOneTextColumnTable(reads, sheetId, suggestions.table)) return inPlaceOfEmpty;
  let mainTable = mainTableCornersOnSheet(reads, sheetId);
  let mainSuggestions = mainTable === null ? null : (reads.conditionalFormatSuggestions as Dynamic)(...mainTable);
  return mainSuggestions !== null && looksLikeRecordsTable(reads, sheetId, mainSuggestions.table) ? mainTable : inPlaceOfEmpty;
}
export function stretchRangeToAreaEnd(reads: WorkbookReads, sheetId?: Dynamic, selectionArea?: Dynamic) {
  let lastRowIndex = selectionArea === null ? null : selectionArea.topRowIndex + selectionArea.rowCount - 1;
  let lastRowId = lastRowIndex === null ? null : (reads.linesOf(sheetId)?.rows.idAt(lastRowIndex) ?? null);
  if (selectionArea === null || lastRowIndex === null || lastRowId === null) return (range?: Dynamic) => range;
  return (range?: Dynamic) => {
    let [topRowIndex, bottomRowIndex] = [range.topLeft.r, range.bottomRight.r].map(
      (rowId?: Dynamic) => reads.rowIndexOf(sheetId, rowId),
    );
    return topRowIndex !== null &&
      topRowIndex !== undefined &&
      bottomRowIndex !== null &&
      bottomRowIndex !== undefined &&
      topRowIndex >= selectionArea.topRowIndex &&
      bottomRowIndex < lastRowIndex
      ? {
          ...range,
          bottomRight: {
            ...range.bottomRight,
            r: lastRowId,
          },
        }
      : range;
  };
}
export function stretchSuggestionsToSelection(reads: WorkbookReads, sheetId?: Dynamic, selectionArea?: Dynamic, suggestions?: Dynamic) {
  let stretchRange = stretchRangeToAreaEnd(reads, sheetId, selectionArea);
  let stretchRule = (rule?: Dynamic) => {
    let [firstRange, ...otherRanges] = rule.ranges;
    return isBlankCellsRule(rule)
      ? rule
      : {
          ...rule,
          ranges: [stretchRange(firstRange), ...otherRanges.map(stretchRange)],
        };
  };
  return {
    ...suggestions,
    suggestions: suggestions.suggestions.map((suggestion?: Dynamic) => {
      if (dropdownColorRuleLists.has(suggestion.rules)) return suggestion;
      let [firstRule, ...otherRules] = suggestion.rules;
      let stretchedRules = [stretchRule(firstRule), ...otherRules.map(stretchRule)];
      originalOfStretchedRules.set(stretchedRules, suggestion.rules);
      return {
        ...suggestion,
        rules: stretchedRules,
      };
    }),
    ruleToStartFrom: stretchRule(suggestions.ruleToStartFrom),
  };
}
export function canRulesRunToSheetEnd(reads: WorkbookReads, sheetId?: Dynamic, lastRowId?: Dynamic, rules?: Dynamic, matches?: Dynamic) {
  let lastRowIndex = reads.rowIndexOf(sheetId, lastRowId);
  let rows = reads.linesOf(sheetId)?.rows;
  let sheetEndRowId = rows?.idAt(rows.count - 1) ?? null;
  if (rows === undefined || sheetEndRowId === null || matches === null) return false;
  if (
    !areasOfRuleRanges(
      reads,
      sheetId,
      rules.flatMap(({ ranges: ranges }: Dynamic) => ranges),
    ).every((area?: Dynamic) => {
      let endRowIndex = area.topRowIndex + area.rowCount;
      let areaBelow = {
        ...area,
        topRowIndex: endRowIndex,
        rowCount: rows.count - endRowIndex,
      };
      return endRowIndex - 1 === lastRowIndex && reads.cellsOnShowIn(sheetId, areaBelow).length === 0;
    })
  )
    return false;
  let rulesToSheetEnd = withRuleRangesMapped(
    rules,
    (range?: Dynamic) => ({
      ...range,
      bottomRight: {
        ...range.bottomRight,
        r: sheetEndRowId,
      },
    }),
  );
  return isSameRulesJson(matches, matchesOfRules(reads, sheetId, rulesToSheetEnd));
}
export function doesSelectionGoPastTable(reads: WorkbookReads, sheetId: Dynamic, { about: about, table: table }: Dynamic) {
  let [, bottomRightCell] = cornerCellIdsOf(sheetId, about);
  return reads.conditionalFormatSuggestions(bottomRightCell, bottomRightCell)?.table.records.topLeft.r !== table.records.topLeft.r;
}
export function isAreaApartFromTable(area?: Dynamic, tableArea?: Dynamic) {
  if (area === null || tableArea === undefined) return false;
  let rowGap = spanGapLength(area.topRowIndex, area.rowCount, tableArea.topRowIndex - 1, tableArea.rowCount + 1);
  let columnGap = spanGapLength(area.leftColumnIndex, area.columnCount, tableArea.leftColumnIndex, tableArea.columnCount);
  return rowGap > 0 || columnGap > 0;
}
export function rulesForSelection(
  reads: WorkbookReads,
  anchorCell?: Dynamic,
  focusCell?: Dynamic,
  mergedArea?: Dynamic,
  hasOneCellSelected?: Dynamic,
) {
  let { sheetId: sheetId } = anchorCell;
  let suggestions = suggestionsForCells(reads, anchorCell, focusCell, mergedArea);
  if (suggestions === null) return null;
  let [aboutArea] = areasOfRuleRanges(reads, sheetId, [suggestions.about]);
  let suggestionsInTable =
    mergedArea !== null &&
    aboutArea !== undefined &&
    aboutArea.topRowIndex + aboutArea.rowCount < mergedArea.topRowIndex + mergedArea.rowCount &&
    doesSelectionGoPastTable(reads, sheetId, suggestions)
      ? {
          ...suggestions,
          isOverSeveralTables: true,
        }
      : stretchSuggestionsToSelection(reads, sheetId, mergedArea, suggestions);
  let tableInPlace = tableInPlaceOfSelection(reads, sheetId, suggestionsInTable, hasOneCellSelected);
  let suggestionsInPlace = tableInPlace === null ? null : (suggestionsForCells as Dynamic)(reads, ...tableInPlace);
  if (suggestionsInPlace === null)
    return hasOneCellSelected && looksLikeRecordsTable(reads, sheetId, suggestionsInTable.table)
      ? {
          ...suggestionsInTable,
          toAskAgentAbout: suggestionsInTable.table.records,
        }
      : suggestionsInTable;
  return {
    ...suggestionsInPlace,
    ruleToStartFrom: suggestionsInTable.ruleToStartFrom,
    isInPlaceOfWhatIsSelected: true,
    ...(isAreaApartFromTable(mergedArea, areasOfRuleRanges(reads, sheetId, [suggestionsInPlace.table.records])[0]) && {
      isFarFromWhatIsSelected: true,
    }),
  };
}
export const isColumnFilled = ({ filled: filled }: Dynamic) => filled > 0;
export const MOST_TABLES_LOOKED_AT = 4;
export const MOST_ROWS_OF_ONE_COLUMN_TABLE = 3;
export const isCellInArea = (area?: Dynamic, rowIndex?: Dynamic, columnIndex?: Dynamic) =>
  rowIndex >= area.topRowIndex &&
  rowIndex < area.topRowIndex + area.rowCount &&
  columnIndex >= area.leftColumnIndex &&
  columnIndex < area.leftColumnIndex + area.columnCount;
export const isOneCellSelectedOnly = (state: PageState, reads: WorkbookReads) =>
  state.otherRanges.length === 0 && isSelectionOneCell(state, reads);
export const isBlankCellsRule = ({ effect: effect }: Dynamic) =>
  effect.kind === 'formatWhere' && effect.allOf.every(({ condition: condition }: Dynamic) => condition.kind === 'isBlank');
export const originalOfStretchedRules = new (WeakMap as Dynamic)();
export const originalRulesOf = (rules?: Dynamic) => originalOfStretchedRules.get(rules) ?? rules;
export const withRuleRangesMapped = (rules?: Dynamic, mapRange?: Dynamic) => {
  if (rules.some(({ ranges: ranges }: Dynamic) => ranges.some((range?: Dynamic) => mapRange(range) === range))) return rules;
  let withRangesMapped = ({ ranges: [firstRange, ...otherRanges], ...rule }: Dynamic) => ({
    ...rule,
    ranges: [mapRange(firstRange), ...otherRanges.map(mapRange)],
  });
  let [firstRule, ...otherRules] = rules;
  return [withRangesMapped(firstRule), ...otherRules.map(withRangesMapped)];
};
export const matchesOfRules = (reads: WorkbookReads, sheetId?: Dynamic, rules?: Dynamic) =>
  reads.formatsGivenAsIf(sheetId, asNewRules(rules))?.matches.slice(0, rules.length) ?? null;
export const spanGapLength = (start?: Dynamic, length?: Dynamic, otherStart?: Dynamic, otherLength?: Dynamic) =>
  Math.max(0, otherStart - (start + length), start - (otherStart + otherLength));
