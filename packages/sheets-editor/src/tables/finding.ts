import type { Dynamic } from '../dynamic.ts';
import { spanCutsOwnRowOrder, coveringRowSpanIn, ownRowOrderOfSheet } from '../model/line-ids.ts';
import { layoutOfView } from '../grid/layout.ts';
import { isInSpan, isRangeInSight } from '../grid/geometry.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function tableBoundsOf(table: Dynamic, book: WorkbookReads) {
  let positionAt = (rowId?: Dynamic, columnId?: Dynamic) =>
    book.positionOfCell({
      sheetId: table.sheetId,
      rowId: rowId,
      columnId: columnId,
    });
  let bodyStart = positionAt(table.firstRowOfBody, table.firstColumn);
  let bodyEnd = positionAt(table.lastRowOfBody, table.lastColumn);
  if (bodyStart === null || bodyEnd === null) return null;
  let body = {
    first: bodyStart.rowIndex,
    last: bodyEnd.rowIndex,
  };
  let columns = {
    first: bodyStart.columnIndex,
    last: bodyEnd.columnIndex,
  };
  if (body.first > body.last || columns.first > columns.last) return null;
  if (table.header === null)
    return {
      header: null,
      body: body,
      columns: columns,
    };
  let headerStart = positionAt(table.header.firstRow, table.firstColumn);
  let headerEnd = positionAt(table.header.lastRow, table.firstColumn);
  if (headerStart === null || headerEnd === null) return null;
  return {
    header:
      headerStart.rowIndex <= headerEnd.rowIndex && headerEnd.rowIndex < body.first
        ? {
            first: headerStart.rowIndex,
            last: headerEnd.rowIndex,
            isSure: table.header.isSure,
          }
        : null,
    body: body,
    columns: columns,
  };
}
export function areaOfFilteredTable(book: WorkbookReads, { table: table, columns: columns }: Dynamic) {
  let { sheetId: sheetId, header: header } = table;
  let rowIndexOf = (rowId?: Dynamic) => (rowId === null ? null : book.rowIndexOf(sheetId, rowId));
  let columnIndexes = [table.firstColumn, ...columns.map(({ c: c }: Dynamic) => c), table.lastColumn].flatMap(
    (columnId?: Dynamic) => book.columnIndexOf(sheetId, columnId) ?? [],
  );
  let bodyRowIndexes = [table.firstRowOfBody, table.lastRowOfBody].flatMap((rowId?: Dynamic) => rowIndexOf(rowId) ?? []);
  let headerFirstRow = rowIndexOf(header.firstRow);
  let headerLastRow = rowIndexOf(header.lastRow) ?? headerFirstRow;
  if (columnIndexes.length === 0 || headerLastRow === null) return null;
  let firstBodyRow = headerLastRow + 1;
  let underBodyRow = rowIndexOf(table.rowUnderTheBody);
  let lastRow = Math.max(firstBodyRow, underBodyRow === null ? (Math.max as Dynamic)(...bodyRowIndexes) : underBodyRow - 1);
  let topRow = headerFirstRow ?? headerLastRow;
  let leftColumn = (Math.min as Dynamic)(...columnIndexes);
  return {
    topRowIndex: topRow,
    leftColumnIndex: leftColumn,
    rowCount: lastRow - topRow + 1,
    columnCount: (Math.max as Dynamic)(...columnIndexes) - leftColumn + 1,
    rowIndexOfButtons: headerLastRow,
  };
}
export function hasCellsOnShowIn(sheetId: Dynamic, rows: Dynamic, columns: Dynamic, book: WorkbookReads) {
  for (let rowIndex: Dynamic = rows.first; rowIndex <= rows.last; rowIndex += 1)
    if (
      book
        .columnIndexesOnShowIn(sheetId, rowIndex)
        .some((columnIndex?: Dynamic) => columnIndex >= columns.first && columnIndex <= columns.last)
    )
      return true;
  return false;
}
export function lastRowIndexOfTableRead(table: Dynamic, header: Dynamic, rows: Dynamic) {
  let [firstPart, lastPart] = [table.body.at(0), table.body.at(-1)];
  if (firstPart === undefined || lastPart === undefined) return header.last;
  let firstBodyIndex = header.last + 1;
  let cached = bodyRunsCache.get(table);
  let stretches = cached?.runs.flatMap((run?: Dynamic) => rows.stretchesOf(run)) ?? [];
  if (
    cached !== undefined &&
    stretches.reduce((sum: Dynamic, { count: count }: Dynamic) => sum + count, 0) === cached.count &&
    stretches.every(
      (stretch?: Dynamic) => stretch.firstIndex >= firstBodyIndex && stretch.firstIndex + stretch.count <= firstBodyIndex + cached.count,
    )
  )
    return header.last + cached.count;
  let [firstIndex, lastIndex] = [rows.indexOf(firstPart.firstRow), rows.indexOf(lastPart.lastRow)];
  if (firstIndex === null || lastIndex === null || firstIndex < firstBodyIndex || lastIndex < firstIndex) return null;
  let count = lastIndex - header.last;
  bodyRunsCache.set(table, {
    count: count,
    runs: rows.runsIn({
      firstIndex: firstBodyIndex,
      count: count,
    }),
  });
  return lastIndex;
}
export function placeTableRead(sheetId: Dynamic, table: Dynamic, { rows: rows, columns: columnLines }: Dynamic) {
  let rowSpanOf = ({ firstRow: firstRow, lastRow: lastRow }: Dynamic) => {
    let [first, last] = [rows.indexOf(firstRow), rows.indexOf(lastRow)];
    return first === null || last === null || first > last
      ? null
      : {
          first: first,
          last: last,
        };
  };
  let { headerRows: headerRows, footerRows: footerRows, firstColumn: firstColumn, lastColumn: lastColumn } = table;
  let header = rowSpanOf(headerRows);
  let columnIndexes = [...table.columns.map(({ c: c }: Dynamic) => c), lastColumn].flatMap(
    (columnId?: Dynamic) => columnLines.indexOf(columnId) ?? [],
  );
  if (header === null || columnIndexes.length === 0) return null;
  let columns = {
    first: (Math.min as Dynamic)(...columnIndexes),
    last: (Math.max as Dynamic)(...columnIndexes),
  };
  let footer = footerRows === null ? null : rowSpanOf(footerRows);
  let lastRowIndex = footerRows === null ? lastRowIndexOfTableRead(table, header, rows) : (footer?.last ?? null);
  if (lastRowIndex === null || (footer !== null && footer.first <= header.last)) return null;
  let lastPart = table.body.at(-1);
  let lastBodyIndex = ((lastPart?.role === 'blank' ? rows.indexOf(lastPart.firstRow) : null) ?? footer?.first ?? lastRowIndex + 1) - 1;
  return {
    key: tableKeyOf(headerRows.firstRow, firstColumn),
    sheetId: sheetId,
    table: table,
    header: header,
    body:
      lastBodyIndex > header.last
        ? {
            first: header.last + 1,
            last: lastBodyIndex,
          }
        : null,
    columns: columns,
    area: areaOfRowsAndColumns(
      {
        first: header.first,
        last: lastRowIndex,
      },
      columns,
    ),
  };
}
export function placedTableAsSeen(ownOrder: Dynamic, placed: Dynamic) {
  let { header: header, body: body, columns: columns, area: area, table: table } = placed;
  let firstBodyIndex = header.last + 1;
  let bodySpan = {
    firstIndex: firstBodyIndex,
    count: area.topRowIndex + area.rowCount - firstBodyIndex,
  };
  if (
    spanCutsOwnRowOrder(ownOrder, {
      firstIndex: header.first,
      count: firstBodyIndex - header.first,
    })
  )
    return null;
  if (!spanCutsOwnRowOrder(ownOrder, bodySpan)) return placed;
  if (table.footerRows !== null) return null;
  let seenBody = coveringRowSpanIn('seen', ownOrder, bodySpan);
  let lastSeenIndex = seenBody.firstIndex + seenBody.count - 1;
  return {
    ...placed,
    body:
      body === null
        ? null
        : {
            first: body.first,
            last: lastSeenIndex,
          },
    area: areaOfRowsAndColumns(
      {
        first: header.first,
        last: lastSeenIndex,
      },
      columns,
    ),
  };
}
export function placedTablesOfSheet({ tablesRead: tablesRead }: Dynamic, reads: WorkbookReads, sheetId?: Dynamic) {
  let [tables, lines] = [tablesRead.get(sheetId)?.tables, reads.linesOf(sheetId)];
  if (tables === undefined || lines === null) return NO_TABLES_PLACED;
  let cached = placedTablesCache.get(tables);
  if (cached?.rows === lines.rows && cached.columns === lines.columns) return cached.placed;
  let ownOrder = ownRowOrderOfSheet(reads, sheetId);
  let placedOrNot = tables.map((table?: Dynamic) => {
    if (ownOrder === null) return placeTableRead(sheetId, table, lines);
    let placed = placeTableRead(sheetId, table, {
      ...lines,
      rows: ownOrder.stored,
    });
    return placed === null ? null : placedTableAsSeen(ownOrder, placed);
  });
  let all = placedOrNot.filter((placed?: Dynamic) => placed !== null);
  let placedTables = {
    all: all,
    certain: all.filter(({ table: table }: Dynamic) => isTableCertain(table)),
    lost: tables.filter((table?: Dynamic, at?: Dynamic) => placedOrNot[at] === null),
  };
  placedTablesCache.set(tables, {
    rows: lines.rows,
    columns: lines.columns,
    placed: placedTables,
  });
  return placedTables;
}
export function tablesInSightOf(view: Dynamic, reads: ReadsWithTextMeasurer) {
  let cached = tablesInSightCache.get(view);
  if (cached?.reads === reads) return cached.tables;
  let [layout, activeCell] = [layoutOfView(view, reads), reads.positionOfCell(view.activeCell)];
  let holdsActiveCell = (area?: Dynamic) =>
    activeCell !== null &&
    isInSpan(activeCell.rowIndex, area.topRowIndex, area.rowCount) &&
    isInSpan(activeCell.columnIndex, area.leftColumnIndex, area.columnCount);
  let tables = placedTablesOfSheet(view, reads, view.sheetId).all.filter(
    ({ area: area }: Dynamic) => holdsActiveCell(area) || isRangeInSight(area, view, layout, view),
  );
  tablesInSightCache.set(view, {
    reads: reads,
    tables: tables,
  });
  return tables;
}
export function tablesReadState({ tablesRead: tablesRead }: Dynamic, sheetId?: Dynamic) {
  let read = tablesRead.get(sheetId);
  if (read === undefined) return 'neverRead';
  return read.isLatest ? 'asTheyAre' : 'behind';
}
export const rowRangeOfTable = ({ header: header, body: body }: Dynamic) => ({
  first: (header ?? body).first,
  last: body.last,
});
export const indexRangesOverlap = (a?: Dynamic, b2?: Dynamic) => a.first <= b2.last && b2.first <= a.last;
export const NO_TABLES_PLACED = {
  all: [],
  certain: [],
  lost: [],
};
export const isTableCertain = ({ basis: basis }: Dynamic) => basis.kind !== 'assumed';
export const hasTableHeadings = ({ basis: basis }: Dynamic) => basis.kind !== 'assumed' || basis.whyNotRecognized !== 'noHeadings';
export const tableEdgesOf = ({
  headerRows: headerRows,
  firstColumn: firstColumn,
  lastColumn: lastColumn,
  footerRows: footerRows,
}: Dynamic) => ({
  headerRows: headerRows,
  firstColumn: firstColumn,
  lastColumn: lastColumn,
  footerRows: footerRows,
});
export const tableKeyOf = (firstRow?: Dynamic, firstColumn?: Dynamic) => `${firstRow} ${firstColumn}`;
export const areaOfRowsAndColumns = (rows?: Dynamic, columns?: Dynamic) => ({
  topRowIndex: rows.first,
  rowCount: rows.last - rows.first + 1,
  leftColumnIndex: columns.first,
  columnCount: columns.last - columns.first + 1,
});
export const bodyRunsCache = new WeakMap();
export const placedTablesCache = new WeakMap();
export const tablesInSightCache = new WeakMap();
