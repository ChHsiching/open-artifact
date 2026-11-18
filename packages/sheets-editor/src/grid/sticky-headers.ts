import type { Dynamic } from '../dynamic.ts';
import { areaOfFilteredTable, tableKeyOf, indexRangesOverlap, placedTablesOfSheet, isTableCertain, hasCellsOnShowIn } from '../tables/finding.ts';
import {
  cellsHeightAboveFloats,
  frozenRowsHeight,
  columnPanes,
  cellUnderPointer,
  cellsAreaHeight,
  freezeGripAt,
  isInSpan,
  rowResizeLineAt,
} from './geometry.ts';
import { layoutOfView } from './layout.ts';
import { COLUMN_HEADER_HEIGHT } from './cell-metrics.ts';
import { ROW_HEADER_WIDTH } from './cell-metrics-values.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function unformattedMarksInHeader({ sheetId: sheetId, header: header, columns: columns }: Dynamic, marks: Dynamic, book: WorkbookReads) {
  return marks.filter((mark?: Dynamic) => {
    let position = mark.sheetId === sheetId ? book.positionOfCell(mark) : null;
    if (position === null || position.rowIndex < header.first || position.rowIndex > header.last) return false;
    return position.columnIndex >= columns.first && position.columnIndex <= columns.last;
  });
}
export function stickyHeaderOfFilter(filter: Dynamic, book: WorkbookReads) {
  let { table: table } = filter;
  let area = areaOfFilteredTable(book, filter);
  if (area === null) return null;
  let header = {
    first: area.topRowIndex,
    last: area.rowIndexOfButtons,
  };
  if ([table.firstRowOfBody, table.lastRowOfBody].some((rowId?: Dynamic) => (book.rowIndexOf(table.sheetId, rowId) ?? 1 / 0) <= header.last))
    return null;
  let { leftColumnIndex: leftColumnIndex, columnCount: columnCount } = area;
  return {
    key: tableKeyOf(table.header.firstRow, table.firstColumn),
    header: header,
    lastRowIndex: area.topRowIndex + area.rowCount - 1,
    columns: {
      first: leftColumnIndex,
      last: leftColumnIndex + columnCount - 1,
    },
  };
}
export function cachedStickyHeaderOfFilter(filter: Dynamic, book: WorkbookReads) {
  let lines = book.linesOf(filter.table.sheetId);
  if (lines === null) return [];
  let { rows: rows, columns: columns } = lines;
  let cached = filterStickyHeaderCache.get(filter);
  let isCached = cached?.rows === rows && cached.columns === columns;
  let found = isCached ? cached.found : stickyHeaderOfFilter(filter, book);
  if (!isCached)
    filterStickyHeaderCache.set(filter, {
      rows: rows,
      columns: columns,
      found: found,
    });
  return found === null ? [] : [found];
}
export function clipStickyHeaderToNext(header?: Dynamic, others?: Dynamic) {
  let { header: rows } = header;
  let below = others.filter(
    (other?: Dynamic) => indexRangesOverlap(other.columns, header.columns) && other.lastRowIndex >= rows.first,
  );
  let lastRowIndex = (Math.min as Dynamic)(header.lastRowIndex, ...below.map((other?: Dynamic) => other.header.first - 1));
  return lastRowIndex > rows.last
    ? [
        {
          ...header,
          lastRowIndex: lastRowIndex,
        },
      ]
    : [];
}
export function columnRangeOfTable(sheetId: Dynamic, { firstColumn: firstColumn, lastColumn: lastColumn }: Dynamic = {}, book: WorkbookReads) {
  let first = book.columnIndexOf(sheetId, firstColumn);
  let last = book.columnIndexOf(sheetId, lastColumn);
  if (first === null || last === null)
    return {
      first: 0,
      last: 1 / 0,
    };
  return {
    first: Math.min(first, last),
    last: Math.max(first, last),
  };
}
export function stickyHeadersOnSheet(state: PageState, book: WorkbookReads) {
  let { sheetId: sheetId, tablesNotFormatted: tablesNotFormatted } = state;
  let [placed, filters] = [placedTablesOfSheet(state, book, sheetId), state.ownFilters.get(sheetId)];
  let cached = stickyHeadersOnSheetCache.get(tablesNotFormatted);
  if (cached?.tables === placed && cached.reads === book && cached.filtered === filters) return cached.found;
  let tableHeaders = placed.certain
    .filter((table?: Dynamic) => hasNoUnformattedMark(state, table, book))
    .map(
      ({ key: key, header: header, columns: columns, area: area }: Dynamic) => ({
        key: key,
        header: header,
        columns: columns,
        lastRowIndex: area.topRowIndex + area.rowCount - 1,
      }),
    );
  let lostColumns = placed.lost.filter(isTableCertain).map((table?: Dynamic) => columnRangeOfTable(sheetId, table, book));
  let filterHeaders = (filters ?? [])
    .flatMap((filter?: Dynamic) => cachedStickyHeaderOfFilter(filter, book))
    .filter(
      ({ columns: columns }: Dynamic) => lostColumns.every((tableColumns?: Dynamic) => !indexRangesOverlap(tableColumns, columns)),
    );
  let clippedFilterHeaders = filterHeaders.flatMap(
    (header?: Dynamic) =>
      clipStickyHeaderToNext(header, [...tableHeaders, ...filterHeaders.filter((other?: Dynamic) => other !== header)]),
  );
  let found = [...tableHeaders, ...clippedFilterHeaders].filter(
    ({ header: header, columns: columns }: Dynamic) => hasCellsOnShowIn(sheetId, header, columns, book),
  );
  stickyHeadersOnSheetCache.set(tablesNotFormatted, {
    tables: placed,
    reads: book,
    filtered: filters,
    found: found,
  });
  return found;
}
export function stickyHeadersOverRow(state: Dynamic, book: WorkbookReads, rowIndex?: Dynamic) {
  return stickyHeadersOnSheet(
    {
      ...state,
      tablesNotFormatted: NO_TABLES_NOT_FORMATTED,
    },
    book,
  ).filter(({ header: header, lastRowIndex: lastRowIndex }: Dynamic) => rowIndex > header.last && rowIndex <= lastRowIndex);
}
export function stickyHeadersOfView(view: Dynamic, book: WorkbookReads, layout?: Dynamic, isWanted: Dynamic = () => true) {
  if (view.sheetPointedIn !== null) return [];
  let headers = stickyHeadersOnSheet(view, book).filter(isWanted);
  let roomBelowFrozen = cellsHeightAboveFloats(view) - frozenRowsHeight(layout);
  let { rowEdges: rowEdges } = layout;
  return headers.flatMap(({ key: key, header: header, lastRowIndex: lastRowIndex, columns: columns }: Dynamic) => {
    if (header.first < layout.frozenRowCount) return [];
    let topInSheet = rowEdges.startOf(header.first);
    let height = rowEdges.startOf(header.last + 1) - topInSheet;
    if (height <= 0 || height > roomBelowFrozen * MAX_STICKY_HEADER_SHARE) return [];
    return [
      {
        key: key,
        firstRowIndex: header.first,
        rowCount: header.last - header.first + 1,
        firstColumnIndex: columns.first,
        columnCount: columns.last - columns.first + 1,
        lastRowIndex: lastRowIndex,
        height: height,
        topInSheet: topInSheet,
        endOfTable: rowEdges.startOf(lastRowIndex + 1),
      },
    ];
  });
}
export function stickyHeaderPartsInPanes(
  { firstColumnIndex: firstColumnIndex, columnCount: columnCount }: Dynamic,
  view?: Dynamic,
  layout?: Dynamic,
) {
  let start = layout.columnEdges.startOf(firstColumnIndex);
  let end = layout.columnEdges.startOf(firstColumnIndex + columnCount);
  return columnPanes(view, layout, view).flatMap(({ scroll: scroll, showFrom: showFrom, showTo: showTo }: Dynamic) => {
    let left = Math.max(start - scroll, showFrom);
    let width = Math.min(end - scroll, showTo) - left;
    let goesOnAtLeft = start - scroll < showFrom;
    let goesOnAtRight = end - scroll > showTo;
    return width > 0
      ? [
          {
            startOfPane: showFrom,
            left: left,
            width: width,
            goesOnAtLeft: goesOnAtLeft,
            goesOnAtRight: goesOnAtRight,
          },
        ]
      : [];
  });
}
export function editedCellBoxInGrid(
  position: Dynamic,
  view: Dynamic,
  book: WorkbookReads,
  { rowEdges: rowEdges, columnEdges: columnEdges, frozenRowCount: frozenRowCount, frozenColumnCount: frozenColumnCount }: Dynamic,
) {
  let { rowIndex: rowIndex, columnIndex: columnIndex } = position;
  let { rowCount: rowCount } = book.mergedAreaAt(view.sheetId, position) ?? {
    rowCount: 1,
  };
  if (rowIndex < frozenRowCount) return null;
  return {
    top: rowEdges.startOf(rowIndex) - view.scrollTop,
    bottom: rowEdges.startOf(rowIndex + rowCount) - view.scrollTop,
    left: columnEdges.startOf(columnIndex) - (columnIndex < frozenColumnCount ? 0 : view.scrollLeft),
  };
}
export function stuckHeadersOfView(view: Dynamic, book: ReadsWithTextMeasurer, layout: Dynamic = layoutOfView(view, book), pulledDownBy: Dynamic = 0) {
  let frozenHeight = frozenRowsHeight(layout);
  let topOfScrolled = view.scrollTop + frozenHeight;
  let active = book.positionOfCell(view.activeCell);
  let isEditing = view.mode.kind === 'editing';
  let editedBox = isEditing && active !== null ? editedCellBoxInGrid(active, view, book, layout) : null;
  let rowAtTop = layout.rowEdges.indexAt(topOfScrolled);
  let stuck = stickyHeadersOfView(
    view,
    book,
    layout,
    ({ header: header, lastRowIndex: lastRowIndex }: Dynamic) => header.first <= rowAtTop && rowAtTop <= lastRowIndex,
  ).flatMap((header?: Dynamic) => {
    let { topInSheet: topInSheet, endOfTable: endOfTable, height: height } = header;
    if (topInSheet >= topOfScrolled || endOfTable <= topOfScrolled) return [];
    if (
      (topInSheet + height > topOfScrolled + Math.max(0, pulledDownBy) || isEditing) &&
      active !== null &&
      stickyHeaderSpansPosition(header, active)
    )
      return [];
    let topEdge = frozenHeight + Math.min(0, endOfTable - topOfScrolled - height);
    let parts = stickyHeaderPartsInPanes(header, view, layout);
    let isOverEditor =
      editedBox !== null &&
      editedBox.top < topEdge + height &&
      editedBox.bottom > frozenHeight &&
      parts.some(({ left: left, width: width }: Dynamic) => left + width > editedBox.left);
    return parts.length === 0 || isOverEditor
      ? []
      : [
          {
            ...header,
            top: topEdge,
            showFrom: frozenHeight,
            parts: parts,
          },
        ];
  });
  let [first] = stuck;
  let isAllAlike = stuck.every(
    ({ firstRowIndex: firstRowIndex, rowCount: rowCount, top: topEdge }: Dynamic) =>
      firstRowIndex === first?.firstRowIndex && rowCount === first.rowCount && topEdge === first.top,
  );
  return stuck.map(
    (header?: Dynamic, index?: Dynamic) =>
      Object.assign(header, {
        areRowNumbersItsOwn: index === 0 && isAllAlike,
      }),
  );
}
export function bottomOfStuckHeadersInSheet(view: Dynamic, book: ReadsWithTextMeasurer, cover?: Dynamic, layout?: Dynamic) {
  let bottom = stuckHeadersBottom(cover, stuckHeadersOfView(view, book, layout));
  return bottom === 0 ? null : view.scrollTop + frozenRowsHeight(layout) + bottom;
}
export function pointedPositionClearOfStuckHeaders(
  position: Dynamic,
  { of: of, fromRow: fromRow }: Dynamic,
  view: Dynamic,
  book: ReadsWithTextMeasurer,
  layout?: Dynamic,
) {
  let { rowEdges: rowEdges } = layout;
  if (of === 'columns' || position.rowIndex < layout.frozenRowCount) return position;
  let topEdge = rowEdges.startOf(position.rowIndex) - view.scrollTop;
  let roomBelowFrozen = cellsHeightAboveFloats(view) - frozenRowsHeight(layout);
  if (topEdge > frozenRowsHeight(layout) + roomBelowFrozen * MAX_STICKY_HEADER_SHARE) return position;
  let cover = of === 'rows' ? 'rowNumbers' : of(position.columnIndex);
  let headersBottom = bottomOfStuckHeadersInSheet(view, book, cover, layout);
  if (headersBottom === null) return position;
  let rowIndex = rowPushedBelowHeaders(position.rowIndex, rowEdges.indexAt(headersBottom), fromRow);
  return rowEdges.startOf(rowIndex) < headersBottom && rowEdges.startOf(rowIndex + 1) > headersBottom
    ? {
        ...position,
        rowIndex: rowIndex,
        isToComeClearOf: cover,
      }
    : {
        ...position,
        rowIndex: rowIndex,
      };
}
export function dragPositionClearOfStuckHeaders(point: Dynamic, view: Dynamic, book: ReadsWithTextMeasurer, layout?: Dynamic, drag?: Dynamic) {
  let position = cellUnderPointer(point, view, layout, view, drag.grownSoFar ?? null);
  if (drag.of === 'columns' || position.rowIndex < layout.frozenRowCount) return position;
  if (!isPointerOverFrozenRows(point, layout)) return pointedPositionClearOfStuckHeaders(position, drag, view, book, layout);
  let cover = drag.of === 'rows' ? 'rowNumbers' : drag.of(position.columnIndex);
  let headersBottom = bottomOfStuckHeadersInSheet(view, book, cover, layout);
  if (headersBottom === null)
    return {
      ...position,
      isToComeClearOf: cover,
    };
  let { rowEdges: rowEdges } = layout;
  let yInGrid = point.y - COLUMN_HEADER_HEIGHT;
  let rowIndex = rowEdges.indexAt(headersBottom + Math.min(-1, yInGrid));
  let rowToShow =
    rowEdges.startOf(rowIndex + 1) > headersBottom && rowEdges.sizeOf(rowIndex) > cellsAreaHeight(view) - (headersBottom - view.scrollTop)
      ? rowEdges.indexAt(rowEdges.startOf(rowIndex) - 1)
      : rowIndex;
  return {
    ...position,
    rowIndex: rowPushedBelowHeaders(position.rowIndex, rowToShow, drag.fromRow),
    isToComeClearOf: cover,
  };
}
export function stuckHeaderAtPoint(point: Dynamic, view: Dynamic, book: ReadsWithTextMeasurer) {
  let y = point.y - COLUMN_HEADER_HEIGHT;
  let x = point.x - ROW_HEADER_WIDTH;
  let layout = layoutOfView(view, book);
  if (freezeGripAt(point, layout) !== null) return;
  return stuckHeadersOfView(view, book, layout).findLast(
    ({ showFrom: showFrom, top: topEdge, height: height, parts: parts, areRowNumbersItsOwn: areRowNumbersItsOwn }: Dynamic) =>
      isInSpan(y, showFrom, topEdge + height - showFrom) &&
      (x < 0 ? areRowNumbersItsOwn : parts.some(({ left: left, width: width }: Dynamic) => isInSpan(x, left, width))),
  );
}
export function scrollToStuckHeaderOnPress(
  pressEvent: Dynamic,
  view: Dynamic,
  { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic,
) {
  let isPress = pressEvent.kind === 'pointerPressed' || pressEvent.kind === 'pointerPressedTwice';
  let isMenuAsked = pressEvent.kind === 'menuAsked' && pressEvent.inContextBar === undefined;
  let point = isPress ? pressEvent : isMenuAsked ? pressEvent.at : null;
  if (point === null || (!isPress && !isMenuAsked)) return view;
  let draggingKind = view.dragging?.kind;
  if (draggingKind !== undefined && draggingKind !== 'tapping' && draggingKind !== 'selecting') return view;
  let mayStartEditing =
    pressEvent.kind === 'pointerPressed' && !pressEvent.isByFinger && refusalOfEveryEdit === null && view.mode.kind !== 'editing';
  let layout = layoutOfView(view, reads);
  if (mayStartEditing && (rowResizeLineAt(point, view, layout) ?? 1 / 0) < layout.frozenRowCount) return view;
  let header = stuckHeaderAtPoint(point, view, reads);
  let isOtherHeader = pressEvent.madeOver !== undefined && pressEvent.madeOver.headerKept !== header?.key;
  if (header === undefined || isOtherHeader) return view;
  return {
    ...view,
    scrollTop: Math.max(0, header.topInSheet - header.top),
  };
}
export function isRowUnderStuckHeader(rowIndex: Dynamic, view: Dynamic, book: ReadsWithTextMeasurer, layout?: Dynamic) {
  let [first] = stuckHeadersOfView(view, book, layout);
  let rowBottom = layout.rowEdges.startOf(rowIndex + 1) - view.scrollTop;
  return first?.areRowNumbersItsOwn === true && rowIndex >= layout.frozenRowCount && rowBottom <= first.top + first.height;
}
export const MAX_STICKY_HEADER_SHARE = 0.3333333333333333;
export const hasNoUnformattedMark = ({ tablesNotFormatted: tablesNotFormatted }: Dynamic, placed: Dynamic, book: WorkbookReads) =>
  placed.table.basis.kind === 'declared' || unformattedMarksInHeader(placed, tablesNotFormatted, book).length === 0;
export const filterStickyHeaderCache = new (WeakMap as Dynamic)();
export const stickyHeadersOnSheetCache = new (WeakMap as Dynamic)();
export const NO_TABLES_NOT_FORMATTED: Dynamic = [];
export const stickyHeaderSpansColumn = (header?: Dynamic, columnIndex?: Dynamic) =>
  isInSpan(columnIndex, header.firstColumnIndex, header.columnCount);
export const stickyHeaderSpansPosition = (header: Dynamic, { rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) =>
  isInSpan(rowIndex, header.firstRowIndex, header.rowCount) && stickyHeaderSpansColumn(header, columnIndex);
export const stickyHeaderHeightAboveRow = (
  { height: height, topInSheet: topInSheet }: Dynamic,
  rowIndex: Dynamic,
  { rowEdges: rowEdges }: Dynamic,
) => Math.min(height, rowEdges.startOf(rowIndex) - topInSheet);
export const heightCoveredByStickyHeaders = (
  view: Dynamic,
  book: WorkbookReads,
  position?: Dynamic,
  layout?: Dynamic,
  how: Dynamic = 'key',
) =>
  (Math.max as Dynamic)(
    0,
    ...stickyHeadersOfView(view, book, layout)
      .filter(
        (header?: Dynamic) =>
          stickyHeaderSpansColumn(header, position.columnIndex) &&
          position.rowIndex >= header.firstRowIndex + (how === 'key' ? 0 : header.rowCount) &&
          position.rowIndex <= header.lastRowIndex,
      )
      .map((header?: Dynamic) => stickyHeaderHeightAboveRow(header, position.rowIndex, layout)),
  );
export const tallestStickyHeaderOverColumn = (view: Dynamic, book: WorkbookReads, columnIndex?: Dynamic, layout?: Dynamic) =>
  (Math.max as Dynamic)(
    0,
    ...stickyHeadersOfView(view, book, layout)
      .filter((header?: Dynamic) => stickyHeaderSpansColumn(header, columnIndex))
      .map(({ height: height }: Dynamic) => height),
  );
export const stuckHeaderCovers = (header?: Dynamic, cover?: Dynamic) =>
  cover === 'rowNumbers'
    ? header.areRowNumbersItsOwn
    : header.firstColumnIndex < cover.leftColumnIndex + cover.columnCount && cover.leftColumnIndex < header.firstColumnIndex + header.columnCount;
export const stuckHeadersBottom = (cover?: Dynamic, stuck?: Dynamic) =>
  (Math.max as Dynamic)(
    0,
    ...stuck
      .filter((header?: Dynamic) => stuckHeaderCovers(header, cover))
      .map(({ top: topEdge, height: height, showFrom: showFrom }: Dynamic) => topEdge + height - showFrom),
  );
export const heightCoveredByStuckHeaders = (
  view: Dynamic,
  book: ReadsWithTextMeasurer,
  rowIndex?: Dynamic,
  cover?: Dynamic,
  layout?: Dynamic,
) =>
  (Math.max as Dynamic)(
    0,
    ...stuckHeadersOfView(view, book, layout)
      .filter((header?: Dynamic) => stuckHeaderCovers(header, cover) && rowIndex <= header.lastRowIndex)
      .map((header?: Dynamic) => stickyHeaderHeightAboveRow(header, rowIndex, layout)),
  );
export const columnSpanAt = (columnIndex?: Dynamic) => ({
  leftColumnIndex: columnIndex,
  columnCount: 1,
});
export const rowPushedBelowHeaders = (rowIndex?: Dynamic, candidate?: Dynamic, fromRow?: Dynamic) =>
  Math.max(rowIndex, fromRow >= rowIndex ? Math.min(candidate, fromRow) : candidate);
export const isPointerOverFrozenRows = (point?: Dynamic, layout?: Dynamic) =>
  point.y - COLUMN_HEADER_HEIGHT < frozenRowsHeight(layout);
