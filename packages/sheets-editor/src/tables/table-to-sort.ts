import type { Dynamic } from '../dynamic.ts';
import { boundsOfTableToSort } from '../selection/table-select.ts';
import { layoutOfView, sheetOfViewOrEmpty } from '../grid/layout.ts';
import { COLUMN_HEADER_HEIGHT } from '../grid/cell-metrics.ts';
import { cellsHeightAboveFloats, rowPanes, shownRowIndicesInPane, columnPanes, shownColumnIndicesInPane } from '../grid/geometry.ts';
import { formulaTextOf, cellValueOf } from '../model/cell-values.ts';
import { findFormulaReferences, formulaMatchesOutsideReferences, resolveFormulaReference } from '../formulas/references.ts';
import { areasOverlap } from '../model/workbook.ts';
import { isAreaWithin, hasOtherRanges } from '../selection/several-ranges.ts';
import { cachedSelectedArea } from '../presence/selections.ts';
import { isSameArea, selectedArea } from '../selection/model.ts';
import { ownFiltersOfSheet } from './own-filters.ts';
import { areaOfFilteredTable } from './finding.ts';
import { headingRowCountByFreeze, sortHoldsOfColumn } from './sort.ts';
import { withNoEffects, sortColumnOfMenu } from '../state/transitions.ts';
import { openSortPane, sortTableWithKeys } from './sort-pane.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function headedTableBoundsAtCell(workbook: WorkbookReads, cellId?: Dynamic) {
  let table = workbook.tableAtCell(cellId)?.table;
  if (table === undefined || table.header === null) return null;
  let {
    sheetId: sheetId,
    header: header,
    firstColumn: firstColumn,
    lastColumn: lastColumn,
    firstRowOfBody: firstRowOfBody,
    lastRowOfBody: lastRowOfBody,
    runs: runs,
  } = table;
  let ids = {
    firstRowOfHeader: header.firstRow,
    firstRecord: firstRowOfBody,
    lastRecord: lastRowOfBody,
    firstColumn: firstColumn,
    lastColumn: lastColumn,
  };
  let bounds = boundsOfTableToSort(workbook, sheetId, ids);
  if (bounds === null || workbook.rowIndexOf(sheetId, header.lastRow) !== bounds.records.topRowIndex - 1) return null;
  return {
    ...bounds,
    ids: ids,
    isHeaderSure: header.isSure,
    holdsRecordsOnly: runs.every(({ role: role }: Dynamic) => role === 'record' || role === 'spacer'),
    holdsBlankRows: runs.some(({ role: role }: Dynamic) => role === 'spacer'),
  };
}
export function shownRowIndexesWithoutFloats(state: PageState, workbook: ReadsWithTextMeasurer) {
  let layout = layoutOfView(state, workbook);
  let stateWithoutFloats = {
    ...state,
    gridHeight: COLUMN_HEADER_HEIGHT + cellsHeightAboveFloats(state),
    heightUnderWhatFloats: 0,
  };
  return rowPanes(state, layout, stateWithoutFloats).flatMap((input?: Dynamic) => shownRowIndicesInPane(input, layout));
}
export function isAreaInView(state: PageState, workbook: ReadsWithTextMeasurer, area?: Dynamic) {
  let layout = layoutOfView(state, workbook);
  let stateWithoutFloats = {
    ...state,
    gridHeight: COLUMN_HEADER_HEIGHT + cellsHeightAboveFloats(state),
    heightUnderWhatFloats: 0,
  };
  return (
    shownRowIndexesWithoutFloats(state, workbook).some((input?: Dynamic) => isIndexWithinSpan(input, area.topRowIndex, area.rowCount)) &&
    columnPanes(state, layout, stateWithoutFloats).some(
      (input?: Dynamic) =>
        shownColumnIndicesInPane(input, layout).some(
          (input2?: Dynamic) => isIndexWithinSpan(input2, area.leftColumnIndex, area.columnCount),
        ),
    )
  );
}
export function isCellWithoutRealTable(workbook: WorkbookReads, cellId?: Dynamic) {
  let table = workbook.tableAtCell(cellId)?.table;
  return table === undefined || (table.header === null && table.firstRowOfBody === table.lastRowOfBody);
}
export function columnRunsOf(columnIndexes?: Dynamic) {
  let runs: Dynamic = [];
  for (let columnIndex of columnIndexes as Dynamic) {
    let lastRun = runs.at(-1);
    if (lastRun !== undefined && columnIndex === lastRun.leftColumnIndex + lastRun.columnCount)
      runs[runs.length - 1] = {
        ...lastRun,
        columnCount: lastRun.columnCount + 1,
      };
    else
      runs.push({
        leftColumnIndex: columnIndex,
        columnCount: 1,
      });
  }
  return runs;
}
export function isFormulaRunTiedToRecords(
  workbook: WorkbookReads,
  sheets?: Dynamic,
  sheetId?: Dynamic,
  run?: Dynamic,
  records?: Dynamic,
  tiedRuns?: Dynamic,
) {
  let cells = Array.from<Dynamic, Dynamic>(
    {
      length: run.columnCount,
    },
    (input?: Dynamic, offset?: Dynamic) => {
      let cellId = workbook.cellIdAt(sheetId, run.topRowIndex, run.leftColumnIndex + offset);
      return cellId === null ? null : workbook.cellOnShowIn(cellId);
    },
  );
  let formulas = cells.map(
    (input?: Dynamic) => (input !== null && 'input' in input && input.input.kind === 'formula' ? formulaTextOf(input) : null),
  );
  let presentFormulas = formulas.filter((input?: Dynamic) => input !== null);
  let startsWithFormulaOrText = formulas[0] !== null || cellValueOf(cells[0] ?? null)?.kind === 'text';
  if (presentFormulas.length === 0 || formulas.lastIndexOf(null) > 0 || !startsWithFormulaOrText) return false;
  if (presentFormulas.some((items?: Dynamic) => items.length > MAX_FORMULA_LENGTH_FOR_TIED_CHECK)) return false;
  let parsedFormulas = presentFormulas.map((input?: Dynamic) => findFormulaReferences(input, workbook.decimalSign));
  if (presentFormulas.some((input?: Dynamic) => formulaMatchesOutsideReferences(input, POSITION_FORMULA_PATTERN, workbook.decimalSign)))
    return false;
  let references = parsedFormulas.flatMap((input?: Dynamic) => input.references);
  if (
    references.some(
      ({ ends: [input, input2 = input] }: Dynamic) =>
        input.digits !== '' && input2.digits !== '' && input.dollarOfRow !== input2.dollarOfRow,
    )
  )
    return false;
  let resolvedReferences = references.map((input?: Dynamic) => resolveFormulaReference(input, sheetId, sheets));
  if (resolvedReferences.includes(null)) return false;
  let areasOnSheet = resolvedReferences.flatMap((input?: Dynamic) => (input?.sheet.sheetId === sheetId ? [input.area] : []));
  let areasInRecords = areasOnSheet.filter((input?: Dynamic) => areasOverlap(input, records));
  let spansRecordRows = ({ topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic) =>
    topRowIndex <= records.topRowIndex && topRowIndex + rowCount >= records.topRowIndex + records.rowCount;
  if (!areasInRecords.every(spansRecordRows)) return false;
  if (
    areasOnSheet.some(
      (input?: Dynamic) =>
        !areasInRecords.includes(input) && input.rowCount > 1 && isIndexWithinSpan(run.topRowIndex, input.topRowIndex, input.rowCount),
    )
  )
    return false;
  let rowAbove = {
    ...run,
    topRowIndex: run.topRowIndex - 1,
  };
  let overlapsTiedRun = (input?: Dynamic) => tiedRuns.some((input2?: Dynamic) => areasOverlap(input, input2));
  return areasInRecords.length > 0 || (overlapsTiedRun(rowAbove) && areasOnSheet.some(overlapsTiedRun));
}
export function formulaRunsTiedToRecords(workbook: WorkbookReads, sheetId: Dynamic, { table: table, records: records }: Dynamic, area?: Dynamic) {
  let rowIndexes = Array.from<Dynamic, Dynamic>(
    {
      length: table.rowCount,
    },
    (input?: Dynamic, options?: Dynamic) => table.topRowIndex + options,
  );
  let tableColumnIndexes = new (Set as Dynamic)(
    rowIndexes.flatMap((input?: Dynamic) => workbook.columnIndexesOnShowIn(sheetId, input)),
  );
  let tableRightEdge = table.leftColumnIndex + table.columnCount;
  let tiedRuns: Dynamic = [];
  let tiedRunsByRow = new (Map as Dynamic)();
  let sheets = workbook.listSheets();
  let [rowsWithTiedRuns, cellsChecked]: Dynamic = [0, 0];
  for (let value of rowIndexes as Dynamic) {
    for (let value2 of columnRunsOf(workbook.columnIndexesOnShowIn(sheetId, value)) as Dynamic) {
      let runArea = {
        ...value2,
        topRowIndex: value,
        rowCount: 1,
      };
      let runEnd2 = runArea.leftColumnIndex + runArea.columnCount;
      let isOutsideTable = runArea.leftColumnIndex >= tableRightEdge || runEnd2 <= table.leftColumnIndex;
      let adjacentColumnIndex = runArea.leftColumnIndex >= tableRightEdge ? runArea.leftColumnIndex - 1 : runEnd2;
      if (!isOutsideTable || tableColumnIndexes.has(adjacentColumnIndex)) continue;
      cellsChecked += runArea.columnCount;
      if (cellsChecked > MAX_CELLS_CHECKED_FOR_TIED_FORMULAS) return new (Map as Dynamic)();
      if (!isFormulaRunTiedToRecords(workbook, sheets, sheetId, runArea, records, tiedRuns)) continue;
      tiedRuns.push(runArea);
      tiedRunsByRow.set(value, [...(tiedRunsByRow.get(value) ?? []), runArea]);
    }
    if (tiedRunsByRow.has(value) && isIndexWithinSpan(value, area.topRowIndex, area.rowCount)) rowsWithTiedRuns += 1;
    if (rowsWithTiedRuns * 2 > area.rowCount) return new (Map as Dynamic)();
  }
  let isRecordRow = (input?: Dynamic) => isIndexWithinSpan(input, records.topRowIndex, records.rowCount);
  let isBackedByNeighbors = (run?: Dynamic) =>
    [run.topRowIndex - 1, run.topRowIndex + 1].filter(isRecordRow).every(
      (input?: Dynamic) =>
        workbook
          .columnIndexesOnShowIn(sheetId, input)
          .filter((input2?: Dynamic) => isIndexWithinSpan(input2, run.leftColumnIndex, run.columnCount))
          .every(
            (input2?: Dynamic) =>
              (tiedRunsByRow.get(input) ?? []).some(
                (input3?: Dynamic) => isIndexWithinSpan(input2, input3.leftColumnIndex, input3.columnCount),
              ),
          ),
    );
  let toCheck = [...tiedRuns];
  for (let value: Dynamic = toCheck.pop(); value !== undefined; value = toCheck.pop()) {
    let value2 = tiedRunsByRow.get(value.topRowIndex) ?? [];
    if (!value2.includes(value) || isBackedByNeighbors(value)) continue;
    tiedRunsByRow.set(
      value.topRowIndex,
      value2.filter((input?: Dynamic) => input !== value),
    );
    (toCheck.push as Dynamic)(...(tiedRunsByRow.get(value.topRowIndex - 1) ?? []), ...(tiedRunsByRow.get(value.topRowIndex + 1) ?? []));
  }
  return new (Map as Dynamic)(
    [...tiedRunsByRow].filter(([input, items]: Dynamic) => items.length > 0 && isIndexWithinSpan(input, area.topRowIndex, area.rowCount)),
  );
}
export function areFormulasBesideUntied(workbook: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let sheets = workbook.listSheets();
  let cellsChecked: Dynamic = 0;
  for (let rowIndex: Dynamic = area.topRowIndex; rowIndex < area.topRowIndex + area.rowCount; rowIndex += 1)
    for (let columnIndex of workbook.columnIndexesOnShowIn(sheetId, rowIndex) as Dynamic) {
      if (isIndexWithinSpan(columnIndex, area.leftColumnIndex, area.columnCount)) continue;
      let cellId = workbook.cellIdAt(sheetId, rowIndex, columnIndex);
      let cell = cellId === null ? null : workbook.cellOnShowIn(cellId);
      if (cell === null) continue;
      if (!('input' in cell)) return false;
      if (cell.input.kind !== 'formula') continue;
      cellsChecked += 1;
      if (cellsChecked > MAX_CELLS_CHECKED_FOR_TIED_FORMULAS) return false;
      let formulaText = formulaTextOf(cell);
      if (formulaText.length > MAX_FORMULA_LENGTH_FOR_TIED_CHECK) return false;
      let { quoted: quoted, references: references } = findFormulaReferences(formulaText, workbook.decimalSign);
      let unquotedText = quoted.reduceRight(
        (text: Dynamic, { start: start, end: end }: Dynamic) => text.slice(0, start) + text.slice(end),
        formulaText,
      );
      if (POSITION_FORMULA_PATTERN.test(unquotedText)) return false;
      if (
        !references.every((reference?: Dynamic) => {
          let resolved = resolveFormulaReference(reference, sheetId, sheets);
          if (resolved === null) return false;
          let { area: referenceArea } = resolved;
          let isOnSheet = resolved.sheet.sheetId === sheetId;
          let isOwnRowOnly =
            isOnSheet &&
            referenceArea.rowCount === 1 &&
            referenceArea.topRowIndex === rowIndex &&
            reference.ends.every(({ dollarOfRow: dollarOfRow }: Dynamic) => dollarOfRow === '');
          let hasFixedRows = reference.ends.every(
            ({ digits: digits, dollarOfRow: dollarOfRow }: Dynamic) => digits === '' || dollarOfRow !== '',
          );
          let overlapsRows =
            referenceArea.topRowIndex < area.topRowIndex + area.rowCount && area.topRowIndex < referenceArea.topRowIndex + referenceArea.rowCount;
          return !isOnSheet || isOwnRowOnly || (hasFixedRows && !overlapsRows);
        })
      )
        return false;
    }
  return true;
}
export function doFormulasInAreaReachOut(workbook: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let sheets = workbook.listSheets();
  let cellsChecked: Dynamic = 0;
  for (let rowIndex: Dynamic = area.topRowIndex; rowIndex < area.topRowIndex + area.rowCount; rowIndex += 1)
    for (let columnIndex of workbook.columnIndexesOnShowIn(sheetId, rowIndex) as Dynamic) {
      if (!isIndexWithinSpan(columnIndex, area.leftColumnIndex, area.columnCount)) continue;
      let cellId = workbook.cellIdAt(sheetId, rowIndex, columnIndex);
      let cell = cellId === null ? null : workbook.cellOnShowIn(cellId);
      if (cell === null || !('input' in cell) || cell.input.kind !== 'formula') continue;
      cellsChecked += 1;
      if (cellsChecked > MAX_CELLS_CHECKED_FOR_TIED_FORMULAS) return null;
      if (
        findFormulaReferences(formulaTextOf(cell), workbook.decimalSign).references.some((reference?: Dynamic) => {
          let resolved = resolveFormulaReference(reference, sheetId, sheets);
          if (resolved?.sheet.sheetId !== sheetId) return false;
          let { area: referenceArea } = resolved;
          let isWithinColumns =
            referenceArea.leftColumnIndex >= area.leftColumnIndex &&
            referenceArea.leftColumnIndex + referenceArea.columnCount <= area.leftColumnIndex + area.columnCount;
          let isOwnRowOnly =
            referenceArea.rowCount === 1 &&
            referenceArea.topRowIndex === rowIndex &&
            reference.ends.every(({ dollarOfRow: dollarOfRow }: Dynamic) => dollarOfRow === '');
          let overlapsRows =
            referenceArea.topRowIndex < area.topRowIndex + area.rowCount && area.topRowIndex < referenceArea.topRowIndex + referenceArea.rowCount;
          return !isWithinColumns && !isOwnRowOnly && overlapsRows;
        })
      )
        return true;
    }
  return false;
}
export function sortMoveForTable(state: PageState, workbook: WorkbookReads, tableBounds?: Dynamic, area?: Dynamic) {
  let { table: table, records: records } = tableBounds;
  let { sheetId: sheetId } = state;
  let rowsArea = {
    ...area,
    leftColumnIndex: 0,
    columnCount: 1 / 0,
  };
  let reachesOutside = ({ leftColumnIndex: leftColumnIndex2, columnCount: columnCount2 }: Dynamic) =>
    leftColumnIndex2 < area.leftColumnIndex || leftColumnIndex2 + columnCount2 > area.leftColumnIndex + area.columnCount;
  if (workbook.mergedAreasIn(sheetId, rowsArea).some((input?: Dynamic) => reachesOutside(input) || input.rowCount > 1)) return null;
  let { leftColumnIndex: leftColumnIndex, columnCount: columnCount } = area;
  let shownRowsArea = workbook.areaOnShowIn(sheetId, rowsArea);
  if (shownRowsArea === null || !reachesOutside(shownRowsArea))
    return {
      moves: 'rows',
      leftColumnIndex: leftColumnIndex,
      columnCount: columnCount,
    };
  if (area.rowCount > MAX_RECORD_ROWS_FOR_CELL_SORT) return null;
  let sameRowsTables: Dynamic = [];
  let otherTables: Dynamic = [];
  let tiedRuns = formulaRunsTiedToRecords(workbook, sheetId, tableBounds, area);
  let [checkedCount, hasEmptyTableBeside]: Dynamic = [0, false];
  for (let topRowIndex: Dynamic = area.topRowIndex; topRowIndex < area.topRowIndex + area.rowCount; topRowIndex += 1)
    for (let value of workbook.columnIndexesOnShowIn(sheetId, topRowIndex) as Dynamic) {
      let cellArea = {
        topRowIndex: topRowIndex,
        leftColumnIndex: value,
        rowCount: 1,
        columnCount: 1,
      };
      if (!reachesOutside(cellArea)) continue;
      if (
        [sameRowsTables, otherTables, tiedRuns.get(topRowIndex) ?? []].some(
          (input?: Dynamic) => input.some((input2?: Dynamic) => isAreaWithin(cellArea, input2)),
        )
      )
        continue;
      if (checkedCount === MAX_CELLS_BESIDE_TABLE_CHECKED) return null;
      checkedCount += 1;
      let cellId = workbook.cellIdAt(sheetId, topRowIndex, value);
      if (cellId === null) return null;
      let tableBeside = headedTableBoundsAtCell(workbook, cellId);
      if (tableBeside?.isHeaderSure !== true) {
        if (!isCellWithoutRealTable(workbook, cellId)) return null;
        hasEmptyTableBeside = true;
        continue;
      }
      let isSameRowsTable =
        tableBeside.holdsRecordsOnly &&
        tableBeside.table.topRowIndex === table.topRowIndex &&
        tableBeside.records.topRowIndex === records.topRowIndex &&
        tableBeside.records.rowCount === records.rowCount;
      let overlapsHeader = tableBeside.table.topRowIndex < records.topRowIndex && table.topRowIndex < tableBeside.records.topRowIndex;
      if (!isSameRowsTable && overlapsHeader) return null;
      (isSameRowsTable ? sameRowsTables : otherTables).push(tableBeside.table);
    }
  if (otherTables.length === 0 && tiedRuns.size === 0) {
    let value = Math.min(leftColumnIndex, shownRowsArea.leftColumnIndex);
    let value2 = Math.max(leftColumnIndex + columnCount, shownRowsArea.leftColumnIndex + shownRowsArea.columnCount);
    return {
      moves: 'rows',
      leftColumnIndex: value,
      columnCount: value2 - value,
    };
  }
  let hasComment = (state.comments ?? []).some(({ cells: cells }: Dynamic) => {
    let value = cells.activeCell.sheetId === sheetId ? cachedSelectedArea(cells, workbook) : null;
    return value !== null && areasOverlap(value, area);
  });
  return hasEmptyTableBeside || sameRowsTables.length > 0 || hasComment
    ? null
    : {
        moves: 'cells',
        leftColumnIndex: leftColumnIndex,
        columnCount: columnCount,
      };
}
export function columnBlockAtColumn(workbook: WorkbookReads, sheetId?: Dynamic, table?: Dynamic, records?: Dynamic, columnIndex?: Dynamic) {
  if (table.rowCount > MAX_RECORD_ROWS_FOR_CELL_SORT) return table;
  let headerColumns = new (Set as Dynamic)();
  let recordColumnCounts = new (Map as Dynamic)();
  let recordRowCount: Dynamic = 0;
  for (let rowIndex: Dynamic = table.topRowIndex; rowIndex < records.topRowIndex + records.rowCount; rowIndex += 1) {
    let columnIndexes = workbook.columnIndexesOnShowIn(sheetId, rowIndex);
    if (
      rowIndex >= records.topRowIndex &&
      columnIndexes.some((index?: Dynamic) => isIndexWithinSpan(index, table.leftColumnIndex, table.columnCount))
    )
      recordRowCount += 1;
    for (let index of columnIndexes as Dynamic)
      if (rowIndex < records.topRowIndex) headerColumns.add(index);
      else recordColumnCounts.set(index, (recordColumnCounts.get(index) ?? 0) + 1);
  }
  let isInBlock = (index?: Dynamic) =>
    headerColumns.has(index) || (recordColumnCounts.get(index) ?? 0) >= Math.max(recordRowCount, 1);
  if (!isInBlock(columnIndex))
    return recordColumnCounts.has(columnIndex)
      ? {
          leftColumnIndex: columnIndex,
          columnCount: 1,
        }
      : table;
  let [left, right]: Dynamic = [columnIndex, columnIndex + 1];
  while (left > table.leftColumnIndex && isInBlock(left - 1)) left -= 1;
  while (right < table.leftColumnIndex + table.columnCount && isInBlock(right)) right += 1;
  return {
    leftColumnIndex: left,
    columnCount: right - left,
  };
}
export function tableToSortAtCell(state: PageState, workbook: ReadsWithTextMeasurer, cellId?: Dynamic, askedFrom: Dynamic = 'cell') {
  let position = workbook.positionOfCell(cellId);
  if (position === null) return null;
  let cellArea = {
    topRowIndex: position.rowIndex,
    leftColumnIndex: position.columnIndex,
    rowCount: 1,
    columnCount: 1,
  };
  let tableBounds = headedTableBoundsAtCell(workbook, cellId);
  if (tableBounds === null || !tableBounds.holdsRecordsOnly || !isAreaWithin(cellArea, tableBounds.table)) return null;
  let { table: table, records: records } = tableBounds;
  let boundsAtLastRecord = headedTableBoundsAtCell(workbook, {
    ...cellId,
    rowId: tableBounds.ids.lastRecord,
  });
  if (boundsAtLastRecord === null || !isSameArea(boundsAtLastRecord.table, table) || !isSameArea(boundsAtLastRecord.records, records)) return null;
  if (
    ownFiltersOfSheet(state, state.sheetId).some((comment?: Dynamic) => {
      let area = areaOfFilteredTable(workbook, comment);
      return area !== null && isAreaWithin(cellArea, area) && !isSameArea(area, table);
    })
  )
    return null;
  if (!isAreaInView(state, workbook, cellArea) || !isAreaInView(state, workbook, records)) return null;
  let isHeaderKnown = tableBounds.isHeaderSure || records.topRowIndex === headingRowCountByFreeze(state, workbook);
  let firstRecordIndex = Math.max(records.topRowIndex, sheetOfViewOrEmpty(state, workbook).frozenRowCount);
  let recordCount = records.topRowIndex + records.rowCount - firstRecordIndex;
  let firstRecordRowId = workbook.cellIdAt(state.sheetId, firstRecordIndex, position.columnIndex)?.rowId;
  if (!isHeaderKnown || recordCount < 2 || firstRecordRowId === undefined) return null;
  let move = sortMoveForTable(state, workbook, tableBounds, {
    ...records,
    topRowIndex: firstRecordIndex,
    rowCount: recordCount,
  });
  if (move === null) return null;
  if (askedFrom === 'cell' && move.moves === 'rows') {
    let block = {
      ...columnBlockAtColumn(
        workbook,
        state.sheetId,
        table,
        {
          topRowIndex: firstRecordIndex,
          rowCount: recordCount,
        },
        position.columnIndex,
      ),
      topRowIndex: firstRecordIndex,
      rowCount: recordCount,
    };
    if (
      (move.leftColumnIndex < block.leftColumnIndex || move.leftColumnIndex + move.columnCount > block.leftColumnIndex + block.columnCount) &&
      (!areFormulasBesideUntied(workbook, state.sheetId, block) || doFormulasInAreaReachOut(workbook, state.sheetId, block) === true)
    )
      return null;
  }
  let lastColumnIndex = move.leftColumnIndex + move.columnCount - 1;
  let firstColumnId = workbook.cellIdAt(state.sheetId, firstRecordIndex, move.leftColumnIndex)?.columnId;
  let lastColumnId = workbook.cellIdAt(state.sheetId, firstRecordIndex, lastColumnIndex)?.columnId;
  return firstColumnId === undefined || lastColumnId === undefined
    ? null
    : {
        ...tableBounds.ids,
        firstRecord: firstRecordRowId,
        firstColumn: firstColumnId,
        lastColumn: lastColumnId,
        moves: move.moves,
      };
}
export function withTableToSortInMenu(state: PageState, workbook: ReadsWithTextMeasurer) {
  let { menu: menu } = state;
  return menu?.holds !== 'all' || state.selectionSeen.shape !== 'cell'
    ? state
    : {
        ...state,
        menu: {
          ...menu,
          tableToSort: tableToSortAtActiveCell(state, workbook),
        },
      };
}
export function sortTableFromMenu(state: PageState, workbook: ReadsWithTextMeasurer, menu?: Dynamic, command?: Dynamic, isWithoutKeyboard?: Dynamic) {
  let table = tableToSortAtActiveCell(state, workbook);
  let tableInMenu = menu?.tableToSort === undefined ? table : menu.tableToSort;
  let bounds = table === null ? null : boundsOfTableToSort(workbook, state.sheetId, table);
  if (table === null || bounds === null || tableInMenu === null || !isSameTableToSort(table, tableInMenu))
    return withNoEffects(openSortPane(state, workbook, 'range'));
  let columnId = sortColumnOfMenu(menu, 'sheet') ?? state.activeCell.columnId;
  let direction = command === 'sortAscending' ? 'ascending' : 'descending';
  let sortTarget = {
    cells: bounds.records,
    hasHeaderRow: false,
    movesWholeRows: table.moves === 'rows',
  };
  return sortTableWithKeys(
    state,
    workbook,
    sortTarget,
    [
      {
        columnId: columnId,
        direction: direction,
      },
    ],
    isWithoutKeyboard,
  );
}
export function holdsOfTableSortColumn(state: PageState, workbook: WorkbookReads) {
  let table = state.menu?.tableToSort ?? null;
  let bounds = table === null ? null : boundsOfTableToSort(workbook, state.sheetId, table);
  if (bounds === null) return null;
  let columnId = sortColumnOfMenu(state.menu, 'sheet') ?? state.activeCell.columnId;
  return sortHoldsOfColumn(
    workbook,
    {
      sheetId: state.sheetId,
      columnId: columnId,
    },
    bounds.records,
  );
}
export function areaOfTableAtCell(workbook: WorkbookReads, cellId?: Dynamic) {
  let table = workbook.tableAtCell(cellId)?.table;
  if (table === undefined) return null;
  let {
    sheetId: sheetId,
    header: header,
    firstRowOfBody: firstRowOfBody,
    lastRowOfBody: lastRowOfBody,
    firstColumn: firstColumn,
    lastColumn: lastColumn,
  } = table;
  let topRowIndex = workbook.rowIndexOf(sheetId, header?.firstRow ?? firstRowOfBody);
  let bottomRowIndex = workbook.rowIndexOf(sheetId, lastRowOfBody);
  let leftColumnIndex = workbook.columnIndexOf(sheetId, firstColumn);
  let rightColumnIndex = workbook.columnIndexOf(sheetId, lastColumn);
  return topRowIndex === null || bottomRowIndex === null || leftColumnIndex === null || rightColumnIndex === null
    ? null
    : {
        topRowIndex: topRowIndex,
        leftColumnIndex: leftColumnIndex,
        rowCount: bottomRowIndex - topRowIndex + 1,
        columnCount: rightColumnIndex - leftColumnIndex + 1,
      };
}
export function areCellsBesideTableLoose(workbook: WorkbookReads, sheetId: Dynamic, { table: table, records: records }: Dynamic) {
  let [columnsBeside, headerColumnsBeside] = [new (Set as Dynamic)(), new (Set as Dynamic)()];
  for (let rowIndex: Dynamic = table.topRowIndex; rowIndex < table.topRowIndex + table.rowCount; rowIndex += 1)
    for (let columnIndex of workbook.columnIndexesOnShowIn(sheetId, rowIndex) as Dynamic) {
      if (isIndexWithinSpan(columnIndex, table.leftColumnIndex, table.columnCount)) continue;
      columnsBeside.add(columnIndex);
      if (rowIndex < records.topRowIndex) headerColumnsBeside.add(columnIndex);
      else if (!headerColumnsBeside.has(columnIndex)) {
        let cellId = workbook.cellIdAt(sheetId, rowIndex, columnIndex);
        if (cellValueOf(cellId === null ? null : workbook.cellOnShowIn(cellId))?.kind !== 'text') return false;
      }
    }
  let columnIndexes = [...columnsBeside];
  columnIndexes.sort((one?: Dynamic, other?: Dynamic) => one - other);
  return columnRunsOf(columnIndexes).every(({ columnCount: columnCount }: Dynamic) => columnCount === 1);
}
export function recordsSortableAsCells(state: PageState, workbook: WorkbookReads, { table: table, records: records }: Dynamic) {
  let firstRecordCellId = workbook.cellIdAt(state.sheetId, records.topRowIndex, records.leftColumnIndex);
  let bounds = firstRecordCellId === null ? null : headedTableBoundsAtCell(workbook, firstRecordCellId);
  if (
    !(
      bounds !== null &&
      bounds.table.topRowIndex === table.topRowIndex &&
      bounds.records.topRowIndex === records.topRowIndex &&
      bounds.records.rowCount >= records.rowCount
    )
  )
    return null;
  let [leftEdge, rightEdge] = [table.leftColumnIndex, table.leftColumnIndex + table.columnCount];
  let boundsRightEdge = bounds.table.leftColumnIndex + bounds.table.columnCount;
  let hasCellAtEdge = (rowIndex?: Dynamic) =>
    workbook
      .columnIndexesOnShowIn(state.sheetId, rowIndex)
      .some((columnIndex?: Dynamic) => columnIndex === leftEdge - 1 || columnIndex === rightEdge);
  let rowIndexes = Array.from<Dynamic, Dynamic>(
    {
      length: table.rowCount,
    },
    (input?: Dynamic, index?: Dynamic) => table.topRowIndex + index,
  );
  let isSameColumns = bounds.table.leftColumnIndex === leftEdge && boundsRightEdge === rightEdge;
  let isWithinBounds = bounds.table.leftColumnIndex <= leftEdge && boundsRightEdge >= rightEdge;
  if (!isSameColumns && (!isWithinBounds || table.rowCount > MAX_RECORD_ROWS_FOR_CELL_SORT || rowIndexes.some(hasCellAtEdge))) return null;
  let move = sortMoveForTable(
    state,
    workbook,
    {
      table: table,
      records: records,
    },
    records,
  );
  return move?.moves === 'rows' &&
    areCellsBesideTableLoose(workbook, state.sheetId, {
      table: table,
      records: records,
    }) &&
    !hasDeclaredTableBeside(workbook, state.sheetId, records) &&
    areFormulasBesideUntied(workbook, state.sheetId, records) &&
    doFormulasInAreaReachOut(workbook, state.sheetId, records) === false
    ? {
        ...records,
        leftColumnIndex: move.leftColumnIndex,
        columnCount: move.columnCount,
      }
    : null;
}
export function hasEmptyColumnWithoutHeading(workbook: WorkbookReads, sheetId: Dynamic, { table: table, records: records }: Dynamic) {
  let headingColumnIndexes = new (Set as Dynamic)(workbook.columnIndexesOnShowIn(sheetId, records.topRowIndex - 1));
  return Array.from<Dynamic, Dynamic>(
    {
      length: table.columnCount,
    },
    (input?: Dynamic, options?: Dynamic) => table.leftColumnIndex + options,
  ).some(
    (input?: Dynamic) =>
      !headingColumnIndexes.has(input) &&
      workbook.areaOnShowIn(sheetId, {
        ...table,
        leftColumnIndex: input,
        columnCount: 1,
      }) === null,
  );
}
export function hasFilledNeighborOutsideTables(workbook: WorkbookReads, cellId?: Dynamic, rowIndex?: Dynamic, columnIndex?: Dynamic) {
  let shownColumnIndexes = workbook.columnIndexesOnShowIn(cellId.sheetId, rowIndex);
  return (
    workbook.tableAtCell(cellId) === null &&
    shownColumnIndexes.includes(columnIndex) &&
    (shownColumnIndexes.includes(columnIndex + 1) || shownColumnIndexes.includes(columnIndex - 1))
  );
}
export function firstShownRecordCell(state: PageState, workbook: ReadsWithTextMeasurer, area: Dynamic, { records: records }: Dynamic) {
  let { frozenRowCount: frozenRowCount } = sheetOfViewOrEmpty(state, workbook);
  let rowIndex = shownRowIndexesWithoutFloats(state, workbook).find(
    (input?: Dynamic) => input >= Math.max(records.topRowIndex, frozenRowCount) && input < records.topRowIndex + records.rowCount,
  );
  let fromColumnIndex = Math.max(area.leftColumnIndex, records.leftColumnIndex);
  let toColumnIndex = Math.min(area.leftColumnIndex + area.columnCount, records.leftColumnIndex + records.columnCount);
  let columnIndex = Array.from<Dynamic, Dynamic>(
    {
      length: Math.max(0, toColumnIndex - fromColumnIndex),
    },
    (input?: Dynamic, options?: Dynamic) => fromColumnIndex + options,
  ).find(
    (input?: Dynamic) =>
      workbook.areaOnShowIn(state.sheetId, {
        ...records,
        leftColumnIndex: input,
        columnCount: 1,
      }) !== null,
  );
  return rowIndex === undefined || columnIndex === undefined ? null : workbook.cellIdAt(state.sheetId, rowIndex, columnIndex);
}
export function tableUnderSelectedColumns(state: PageState, workbook: ReadsWithTextMeasurer, area?: Dynamic) {
  let { sheetId: sheetId } = state;
  let overlapsAreaColumns = ({ leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) =>
    leftColumnIndex < area.leftColumnIndex + area.columnCount && area.leftColumnIndex < leftColumnIndex + columnCount;
  let seenTables: Dynamic = [];
  let found: Dynamic = null;
  let checkedCount: Dynamic = 0;
  for (let rowIndex of shownRowIndexesWithoutFloats(state, workbook) as Dynamic)
    for (let columnIndex of workbook.columnIndexesOnShowIn(sheetId, rowIndex) as Dynamic) {
      let cellArea = singleCellArea(rowIndex, columnIndex);
      if (seenTables.some((input?: Dynamic) => isAreaWithin(cellArea, input))) continue;
      let cellId = workbook.cellIdAt(sheetId, rowIndex, columnIndex);
      if (cellId === null || checkedCount === MAX_CELLS_CHECKED_UNDER_COLUMNS) return null;
      checkedCount += 1;
      if (hasFilledNeighborOutsideTables(workbook, cellId, rowIndex, columnIndex)) return null;
      if (isCellWithoutRealTable(workbook, cellId)) continue;
      let tableBounds = headedTableBoundsAtCell(workbook, cellId);
      let tableArea = tableBounds?.table ?? areaOfTableAtCell(workbook, cellId);
      if (tableArea === null) return null;
      if (tableBounds === null || !isAreaWithin(cellArea, tableArea)) {
        if (overlapsAreaColumns(tableArea)) return null;
        if (isAreaWithin(cellArea, tableArea)) seenTables.push(tableArea);
        continue;
      }
      let lastRecordCell = {
        ...cellId,
        rowId: tableBounds.ids.lastRecord,
      };
      if (hasFilledNeighborOutsideTables(workbook, lastRecordCell, tableBounds.records.topRowIndex + tableBounds.records.rowCount - 1, columnIndex)) {
        let recordCellInArea = firstShownRecordCell(state, workbook, area, tableBounds);
        if (recordCellInArea === null) return null;
        workbook.tableAtCell(recordCellInArea);
        workbook.tableAtCell({
          ...recordCellInArea,
          rowId: tableBounds.ids.lastRecord,
        });
        workbook.cellTableAt(recordCellInArea);
        return null;
      }
      let boundsAtLastRecord = headedTableBoundsAtCell(workbook, lastRecordCell);
      if (
        boundsAtLastRecord !== null &&
        isSameArea(boundsAtLastRecord.table, tableBounds.table) &&
        isSameArea(boundsAtLastRecord.records, tableBounds.records)
      ) {
        seenTables.push(tableBounds.table);
        if (!overlapsAreaColumns(tableBounds.table)) continue;
        if (found !== null) return null;
        found = tableBounds;
        continue;
      }
      if (rowIndex < tableBounds.records.topRowIndex) {
        seenTables.push({
          ...tableBounds.table,
          rowCount: tableBounds.records.topRowIndex - tableBounds.table.topRowIndex,
        });
        continue;
      }
      if (overlapsAreaColumns(tableBounds.table) || (boundsAtLastRecord !== null && overlapsAreaColumns(boundsAtLastRecord.table))) return null;
    }
  let { table: foundTable } = found ?? {
    table: null,
  };
  return ownFiltersOfSheet(state, sheetId).some((input?: Dynamic) => {
    let value = areaOfFilteredTable(workbook, input);
    return value !== null && overlapsAreaColumns(value) && (foundTable === null || !isSameArea(value, foundTable));
  })
    ? null
    : found;
}
export function tableToSortOfColumns(state: PageState, workbook: ReadsWithTextMeasurer) {
  let area = state.selectionSeen.shape === 'columns' && !hasOtherRanges(state) ? selectedArea(state, workbook) : null;
  let tableBounds = area === null ? null : tableUnderSelectedColumns(state, workbook, area);
  if (area === null || tableBounds === null) return null;
  if (!tableBounds.isHeaderSure) return null;
  if (tableBounds.holdsBlankRows || hasEmptyColumnWithoutHeading(workbook, state.sheetId, tableBounds)) return null;
  let { records: records } = tableBounds;
  let { frozenRowCount: frozenRowCount } = sheetOfViewOrEmpty(state, workbook);
  let recordCellId = firstShownRecordCell(state, workbook, area, tableBounds);
  let tableToSort = recordCellId === null ? null : tableToSortAtCell(state, workbook, recordCellId, 'letters');
  let bounds = tableToSort === null ? null : boundsOfTableToSort(workbook, state.sheetId, tableToSort);
  if (recordCellId === null || tableToSort === null || bounds === null) return null;
  return bounds.table.topRowIndex === tableBounds.table.topRowIndex &&
    bounds.table.rowCount === tableBounds.table.rowCount &&
    bounds.records.topRowIndex === Math.max(records.topRowIndex, frozenRowCount) &&
    isAreaWithin(
      {
        ...bounds.table,
        leftColumnIndex: records.leftColumnIndex,
        columnCount: records.columnCount,
      },
      bounds.table,
    )
    ? {
        table: tableToSort,
        columnId: recordCellId.columnId,
        at: recordCellId,
        extent: tableBounds.table,
      }
    : null;
}
export function sortTableOfColumns(state: PageState, workbook: ReadsWithTextMeasurer, pick?: Dynamic, keys?: Dynamic, isWithoutKeyboard?: Dynamic) {
  let columnTable = tableToSortOfColumns(state, workbook);
  let bounds = columnTable === null ? null : boundsOfTableToSort(workbook, state.sheetId, columnTable.table);
  if (columnTable === null || bounds === null || columnTable.columnId !== pick.columnId || !isSameTableToSort(columnTable.table, pick.table))
    return withNoEffects(openSortPane(state, workbook, 'sheet'));
  let sortTarget = {
    cells: bounds.records,
    hasHeaderRow: false,
    movesWholeRows: columnTable.table.moves === 'rows',
  };
  return sortTableWithKeys(state, workbook, sortTarget, keys, isWithoutKeyboard);
}
export const MAX_RECORD_ROWS_FOR_CELL_SORT = 5000;
export const MAX_CELLS_BESIDE_TABLE_CHECKED = 8;
export const MAX_CELLS_CHECKED_FOR_TIED_FORMULAS = 500;
export const MAX_FORMULA_LENGTH_FOR_TIED_CHECK = 250;
export const isIndexWithinSpan = (index?: Dynamic, firstIndex?: Dynamic, count?: Dynamic) =>
  index >= firstIndex && index < firstIndex + count;
export const POSITION_FORMULA_PATTERN = /\b(?:ROW|COLUMN|OFFSET|INDIRECT)\s*\(/i;
export const tableToSortAtActiveCell = (state: PageState, workbook: ReadsWithTextMeasurer) =>
  state.selectionSeen.shape === 'cell' ? tableToSortAtCell(state, workbook, state.activeCell) : null;
export const isSameTableToSort = (one?: Dynamic, other?: Dynamic) => JSON.stringify(one) === JSON.stringify(other);
export const hasDeclaredTableBeside = (workbook: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) =>
  workbook.cellTablesDeclaredIn(sheetId).some(({ liveCellTable: liveCellTable }: Dynamic) => {
    let firstColumnIndex = workbook.columnIndexOf(sheetId, liveCellTable.firstColumn);
    let lastColumnIndex = workbook.columnIndexOf(sheetId, liveCellTable.lastColumn);
    let headerRowIndex = workbook.rowIndexOf(sheetId, liveCellTable.headerRows.firstRow);
    if (firstColumnIndex === null || lastColumnIndex === null || headerRowIndex === null) return true;
    return (
      (lastColumnIndex < area.leftColumnIndex || firstColumnIndex >= area.leftColumnIndex + area.columnCount) &&
      headerRowIndex < area.topRowIndex + area.rowCount
    );
  });
export const MAX_CELLS_CHECKED_UNDER_COLUMNS = 12;
export const singleCellArea = (rowIndex?: Dynamic, columnIndex?: Dynamic) => ({
  topRowIndex: rowIndex,
  leftColumnIndex: columnIndex,
  rowCount: 1,
  columnCount: 1,
});
