import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { translateMessage, MESSAGE_LOCALE } from '../i18n/messages.ts';
import { createInitialPageState } from '../state/initial-state.ts';
import { clampScrollOfView } from '../grid/layout.ts';
import { showSheet } from '../state/sheet-tabs.ts';
import { pageViewOf } from '../view/page-view.ts';
import { loadSheetsEngineOnce } from '../engine/loader.ts';
import { createWorkbookReader, newIdCode } from '../engine/core-reads.ts';
import { importPreviewOnGrid, NOTHING_DRAWN_ANYWAY } from './bring-in.ts';
import { importPlanSoFar, isImportPlanComing } from './import-review.ts';
import { importPictureLineCount } from './picture-lines-and-focus.ts';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { gridlinesDataAttribute, PlainGridDrawing } from '../grid/grid-drawing.ts';
import { zoomedStyle } from '../grid/zoom.ts';
import { joinImportWordsWithCommas, moreImportColumnsWords } from './csv-file.ts';
import { MAX_PREVIEW_COLUMNS } from './preview.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function fingerMoveFrom(finger?: Dynamic, touches?: Dynamic) {
  let touch = touches.find(({ identifier: identifier }: Dynamic) => identifier === finger?.id);
  if (finger === null || touch === undefined) return null;
  return {
    right: finger.x - touch.clientX,
    down: finger.y - touch.clientY,
    finger: {
      id: finger.id,
      x: touch.clientX,
      y: touch.clientY,
    },
  };
}
export function importQuestionHeading(about?: Dynamic, example?: Dynamic, names?: Dynamic) {
  if (about === 'date' && example !== null)
    return translateMessage(
      {
        defaultMessage: 'Which date is {text}?',
        id: 'qyIa4M7BE7',
      },
      {
        text: example,
      },
    );
  if (about === 'number' && example !== null)
    return translateMessage(
      {
        defaultMessage: 'Which number is {text}?',
        id: 'qeaKXe/8nl',
      },
      {
        text: example,
      },
    );
  return translateMessage(
    {
      defaultMessage: 'How should {names} be read?',
      id: '6MIRbUR0Ka',
    },
    {
      names: new (Intl.ListFormat as Dynamic)(MESSAGE_LOCALE).format(names.map(quotedName)),
    },
  );
}
export function canScrollAroundPicture(target?: Dynamic, deltaY?: Dynamic) {
  let scroller = target instanceof Element ? target.closest(`[${SCROLLS_AROUND_PICTURE_ATTRIBUTE}]`) : null;
  if (scroller === null) return false;
  return deltaY > 0 ? scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1 : scroller.scrollTop > 0;
}
export function cellsThatStayTextIn(reads: WorkbookReads, sheetId?: Dynamic, rowsToScan?: Dynamic) {
  let cells: Dynamic = [];
  for (let columnIndex: Dynamic = 0; ; columnIndex += 1) {
    let headingCellId = reads.cellIdAt(sheetId, 0, columnIndex);
    let firstCellId = reads.cellIdAt(sheetId, 1, columnIndex);
    if (headingCellId === null || firstCellId === null || reads.cellOf(headingCellId) === null) return cells;
    let { kind: numberFormatKind }: Dynamic = reads.formatOf(firstCellId).numberFormat;
    if (numberFormatKind === 'text') continue;
    let textCells: Dynamic = [];
    let hasTrueOrFalse: Dynamic = false;
    for (let rowIndex: Dynamic = 1; rowIndex < rowsToScan; rowIndex += 1) {
      let cellId = reads.cellIdAt(sheetId, rowIndex, columnIndex);
      if (cellId === null) break;
      let input = reads.cellOf(cellId)?.input;
      if (input?.kind === 'text')
        textCells.push({
          rowNumber: rowIndex + 1,
          columnDrawn: columnIndex,
          text: input.value,
        });
      if (numberFormatKind === 'general' && input !== undefined) {
        let cellFormatKind = reads.formatOf(cellId).numberFormat.kind;
        if (cellFormatKind !== 'text') numberFormatKind = cellFormatKind;
      }
      if (input?.kind === 'boolean') hasTrueOrFalse = true;
    }
    if (numberFormatKind !== 'general' || hasTrueOrFalse) (cells.push as Dynamic)(...textCells);
  }
}
export function importPictureView({ reads: reads, sheetId: sheetId }: Dynamic, size?: Dynamic, scroll?: Dynamic) {
  let workbook = createInitialPageState(reads, null);
  return workbook === null
    ? null
    : clampScrollOfView(
        {
          ...showSheet(workbook, reads, sheetId),
          ...size,
          ...scroll,
        },
        reads,
      );
}
export function importPictureColumnWidths(picture?: Dynamic, size?: Dynamic) {
  let view = importPictureView(
    picture,
    {
      ...size,
      gridWidth: WIDE_PICTURE_WIDTH,
      gridHeight: PICTURE_COLUMN_MEASURE_HEIGHT,
    },
    TOP_LEFT_SCROLL,
  );
  return view === null ? [] : pageViewOf(view, picture.reads, null).grid.columnHeaders.map(({ width: width }: Dynamic) => width);
}
export async function fillImportPictureCore(
  open?: Dynamic,
  locale?: Dynamic,
  unfolded?: Dynamic,
  isStillWanted?: Dynamic,
  columnWidths: Dynamic = null,
): Promise<Dynamic> {
  let engine = await loadSheetsEngineOnce();
  if (engine.kind !== 'loaded') return null;
  let core = await engine.newCore();
  if (!isStillWanted()) return 'notWanted';
  let reader = createWorkbookReader(core, engine.utilities);
  let readEverything = () => ({
    ...reader.readEverything(),
    ...NO_TEXT_MEASURES,
  });
  let queueEdit2 = (edit?: Dynamic) =>
    core.answer({
      kind: 'queueEdit',
      opId: crypto.randomUUID(),
      newIdCode: newIdCode(),
      edit: edit,
    });
  queueEdit2({
    kind: 'setLocale',
    locale: locale,
  });
  let maxColumnWidth = columnWidths !== null ? MIN_IMPORT_COLUMN_WIDTH : importColumnWidthOf(open);
  let importEdit = importPreviewOnGrid(open, readEverything(), maxColumnWidth, unfolded, columnWidths === null ? null : 0);
  let answer = importEdit === null ? null : queueEdit2(importEdit);
  if (answer?.kind !== 'editQueued' || answer.placeChanged === null) return null;
  let { sheetId: sheetId } = answer.placeChanged;
  let reads = columnWidths === null ? null : readEverything();
  for (let [edit, width] of (columnWidths ?? []).entries() as Dynamic) {
    let columnId = reads?.cellIdAt(sheetId, 0, edit)?.columnId;
    if (columnId !== undefined)
      queueEdit2({
        kind: 'setColumnWidths',
        sheetId: sheetId,
        oneColumn: columnId,
        otherColumn: columnId,
        widthInPixels: width,
      });
  }
  return {
    reads: readEverything(),
    sheetId: sheetId,
  };
}
export function useImportPicture({ open: open, locale: locale, size: size, zoom: zoom, unfolded: unfolded, isPlayed: isPlayed }: Dynamic) {
  let [openShown, setOpenShown] = React.useState(open);
  if (!isSameImportOpen(open, openShown)) setOpenShown(open);
  let [drawnPicture, setDrawnPicture] = React.useState(null);
  let [cannotDraw, setCannotDraw] = React.useState(null);
  let filledRef = React.useRef(null);
  let playedRef = React.useRef(null);
  let isPlayedRef = React.useRef(isPlayed);
  React.useEffect(() => {
    isPlayedRef.current = isPlayed;
    if (!isPlayed) playedRef.current = null;
  }, [isPlayed]);
  let scrollRef = React.useRef(TOP_LEFT_SCROLL);
  let mostScrollTopRef = React.useRef(0);
  let sizeRef = React.useRef(size);
  let zoomRef = React.useRef(zoom);
  React.useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  let plainPictureAt = React.useCallback((scroll?: Dynamic) => {
    let played = playedRef.current?.filled ?? null;
    let view =
      played === null
        ? null
        : importPictureView(played, sizeRef.current, {
            scrollTop: scroll.scrollTop,
            scrollLeft: scroll.scrollLeft,
          });
    return played === null || view === null ? null : pageViewOf(view, played.reads, null).grid;
  }, []);
  React.useEffect(() => {
    if (openShown === null) return;
    let run = {
      isStill: true,
    };
    let isStill = () => run.isStill;
    (async (): Promise<Dynamic> => {
      try {
        let value = await fillImportPictureCore(openShown, locale, unfolded, () => run.isStill);
        if (!run.isStill || value === 'notWanted') return;
        let value2 = value === null ? null : importPictureView(value, sizeRef.current, scrollRef.current);
        if (value === null || value2 === null) return setCannotDraw(openShown);
        if (isPlayedRef.current) {
          let value3 = importPictureColumnWidths(value, sizeRef.current);
          let { headerLine: plan, linesLeftOut: plan2 } = importPlanSoFar(openShown).plan;
          let value4 = JSON.stringify([plan, plan2, unfolded, value3]);
          if (playedRef.current?.of !== value4) {
            let value5 = await fillImportPictureCore(openShown, locale, unfolded, isStill, value3);
            if (!isStill() || value5 === 'notWanted') return;
            playedRef.current =
              value5 === null
                ? null
                : {
                    of: value4,
                    filled: value5,
                  };
          }
        }
        filledRef.current = value;
        setDrawnPicture({
          of: openShown,
          cellsThatStayText: cellsThatStayTextIn(
            value.reads,
            value.sheetId,
            importPictureLineCount(openShown, importColumnWidthOf(openShown), unfolded.lines.length),
          ),
          unfolded: unfolded,
          picture: pageViewOf(value2, value.reads, null).grid,
          plain: plainPictureAt(value2),
        });
        setCannotDraw(null);
      } catch {
        if (run.isStill) setCannotDraw(openShown);
      }
    })();
    return () => {
      run.isStill = false;
    };
  }, [openShown, locale, unfolded, plainPictureAt]);
  let endAtRef = React.useRef(END_AT_INFINITY);
  let redraw = React.useCallback(() => {
    let filled = filledRef.current;
    if (filled === null) return;
    let pictureAt = (scroll?: Dynamic, size2?: Dynamic) => {
      let view = importPictureView(filled, size2, scroll);
      if (view === null) return null;
      if (size2 === sizeRef.current)
        scrollRef.current = {
          scrollTop: view.scrollTop,
          scrollLeft: view.scrollLeft,
        };
      return pageViewOf(view, filled.reads, null).grid;
    };
    let picture = pictureAt(scrollRef.current, sizeRef.current);
    if (picture === null) return;
    let rowHeight = picture.rowsDrawn.find(({ rowNumber: rowNumber }: Dynamic) => rowNumber > 1)?.height ?? 0;
    let mostScrollTop = Math.max(0, endAtRef.current.row * rowHeight - picture.body.height + PICTURE_END_SLACK_PX);
    mostScrollTopRef.current = mostScrollTop;
    let { scrollTop: scrollTop, scrollLeft: scrollLeft } = scrollRef.current;
    let endColumn = (
      scrollLeft === 0
        ? null
        : pictureAt(TOP_LEFT_SCROLL, {
            ...sizeRef.current,
            gridWidth: WIDE_PICTURE_WIDTH,
          })
    )?.columnHeaders.find(({ columnNumber: columnNumber }: Dynamic) => columnNumber === endAtRef.current.column);
    let mostScrollLeft =
      endColumn === undefined ? scrollLeft : Math.max(0, endColumn.left + endColumn.width - picture.body.width + PICTURE_END_SLACK_PX);
    let clampedPicture =
      scrollTop > mostScrollTop || scrollLeft > mostScrollLeft
        ? pictureAt(
            {
              scrollTop: Math.min(scrollTop, mostScrollTop),
              scrollLeft: Math.min(scrollLeft, mostScrollLeft),
            },
            sizeRef.current,
          )
        : picture;
    if (clampedPicture === null) return;
    let plain = plainPictureAt(scrollRef.current);
    setDrawnPicture(
      (drawn?: Dynamic) =>
        drawn === null
          ? null
          : {
              ...drawn,
              picture: clampedPicture,
              plain: plain,
            },
    );
  }, [plainPictureAt]);
  let endAt = React.useCallback(
    (end?: Dynamic) => {
      endAtRef.current = end;
      redraw();
    },
    [redraw],
  );
  React.useEffect(() => {
    sizeRef.current = size;
    redraw();
  }, [size, redraw]);
  let showColumn = React.useCallback(
    (columnIndex?: Dynamic) => {
      let filled = filledRef.current;
      let view =
        filled === null
          ? null
          : importPictureView(
              filled,
              {
                ...sizeRef.current,
                gridWidth: WIDE_PICTURE_WIDTH,
              },
              TOP_LEFT_SCROLL,
            );
      if (filled === null || view === null) return;
      let { columnHeaders: columnHeaders, body: body } = pageViewOf(view, filled.reads, null).grid;
      let columnHeader = columnHeaders.find(({ columnNumber: columnNumber }: Dynamic) => columnNumber - 1 === columnIndex);
      if (columnHeader === undefined) return;
      let bodyWidth = sizeRef.current.gridWidth - body.left;
      let { scrollLeft: scrollLeft } = scrollRef.current;
      let leastScrollLeft = columnHeader.left + columnHeader.width - bodyWidth;
      scrollRef.current = {
        ...scrollRef.current,
        scrollLeft: Math.max(Math.min(scrollLeft, columnHeader.left), leastScrollLeft, 0),
      };
      redraw();
    },
    [redraw],
  );
  let scrollTopBeforeShowRowRef = React.useRef(null);
  let showRow = React.useCallback(
    (rowNumber?: Dynamic) => {
      let filled = filledRef.current;
      let view = filled === null ? null : importPictureView(filled, sizeRef.current, TOP_LEFT_SCROLL);
      if (filled === null || view === null) return;
      let { rowsDrawn: rowsDrawn } = pageViewOf(view, filled.reads, null).grid;
      let rowHeight = rowsDrawn.find((row?: Dynamic) => row.rowNumber === 2)?.height ?? 0;
      scrollTopBeforeShowRowRef.current ??= scrollRef.current.scrollTop;
      scrollRef.current = {
        ...scrollRef.current,
        scrollTop: Math.max(0, (rowNumber - 1 - ROWS_ABOVE_SHOWN_ROW) * rowHeight),
      };
      redraw();
    },
    [redraw],
  );
  let showRowNoLonger = React.useCallback(() => {
    if (scrollTopBeforeShowRowRef.current === null) return;
    scrollRef.current = {
      ...scrollRef.current,
      scrollTop: scrollTopBeforeShowRowRef.current,
    };
    scrollTopBeforeShowRowRef.current = null;
    redraw();
  }, [redraw]);
  let pictureFromTheTop = React.useCallback((size2?: Dynamic) => {
    let filled = filledRef.current;
    let view = filled === null ? null : importPictureView(filled, size2, TOP_LEFT_SCROLL);
    return filled === null || view === null ? null : pageViewOf(view, filled.reads, null).grid;
  }, []);
  let table = openShown?.table;
  let isTableNotDrawable = table !== undefined && cannotDraw?.table === table;
  React.useEffect(() => {
    if (table === undefined || isTableNotDrawable) return;
    let frame: Dynamic = 0;
    let scrollBy = (right?: Dynamic, down?: Dynamic) => {
      let { activeElement: activeElement } = document;
      if (activeElement instanceof HTMLInputElement && activeElement.closest(IMPORT_HEADINGS_SELECTOR) !== null && (document as Dynamic).hasFocus())
        activeElement.parentElement?.querySelector('button')?.focus({
          preventScroll: true,
        });
      scrollTopBeforeShowRowRef.current = null;
      scrollRef.current = {
        scrollTop: scrollRef.current.scrollTop + down,
        scrollLeft: scrollRef.current.scrollLeft + right,
      };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(redraw);
    };
    let isForPageToScroll = (target?: Dynamic, right?: Dynamic, down?: Dynamic) =>
      Math.abs(down) > Math.abs(right) &&
      (down > 0 ? scrollRef.current.scrollTop >= mostScrollTopRef.current : scrollRef.current.scrollTop <= 0) &&
      canScrollAroundPicture(target, down);
    let onWheel = (event?: Dynamic) => {
      if (event.ctrlKey) return;
      if (!isInPictureBox(event.target)) return;
      if (isForPageToScroll(event.target, event.deltaX, event.deltaY)) return;
      event.preventDefault();
      let scale = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 1 / zoomRef.current : LINE_SCROLL_PX;
      scrollBy(event.deltaX * scale, event.deltaY * scale);
    };
    let finger: Dynamic = null;
    let onTouchStart = ({ touches: touches, target: target }: Dynamic) => {
      let isOutsideCells = !isInPictureBox(target) || (target instanceof Element && target.closest(IMPORT_HEADINGS_SELECTOR) !== null);
      finger = singleFingerOf([...touches], isOutsideCells);
    };
    let onTouchMove = (event?: Dynamic) => {
      let move = fingerMoveFrom(finger, [...event.touches]);
      if (move === null) return;
      if (isForPageToScroll(event.target, move.right, move.down)) {
        finger = null;
        return;
      }
      event.preventDefault();
      scrollBy(move.right / zoomRef.current, move.down / zoomRef.current);
      finger = move.finger;
    };
    let onTouchEnd = () => {
      finger = null;
    };
    (window as Dynamic).addEventListener('wheel', onWheel, {
      passive: false,
    });
    (window as Dynamic).addEventListener('touchstart', onTouchStart, {
      passive: true,
    });
    (window as Dynamic).addEventListener('touchmove', onTouchMove, {
      passive: false,
    });
    (window as Dynamic).addEventListener('touchend', onTouchEnd);
    (window as Dynamic).addEventListener('touchcancel', onTouchEnd);
    return () => {
      cancelAnimationFrame(frame);
      (window as Dynamic).removeEventListener('wheel', onWheel);
      (window as Dynamic).removeEventListener('touchstart', onTouchStart);
      (window as Dynamic).removeEventListener('touchmove', onTouchMove);
      (window as Dynamic).removeEventListener('touchend', onTouchEnd);
      (window as Dynamic).removeEventListener('touchcancel', onTouchEnd);
      filledRef.current = null;
      scrollRef.current = TOP_LEFT_SCROLL;
      scrollTopBeforeShowRowRef.current = null;
    };
  }, [table, isTableNotDrawable, redraw]);
  let isPictureOfOpen = open !== null && drawnPicture?.of.table === open.table;
  return {
    picture: isPictureOfOpen ? drawnPicture.picture : null,
    pictureFromTheTop: pictureFromTheTop,
    showColumn: showColumn,
    isPlanDrawn: isPictureOfOpen && isSameImportOpen(drawnPicture.of, open),
    plainPicture: isPictureOfOpen && isPlayed ? drawnPicture.plain : null,
    unfoldedInPicture: isPictureOfOpen ? drawnPicture.unfolded : NOTHING_DRAWN_ANYWAY,
    cellsThatStayText: isPictureOfOpen ? drawnPicture.cellsThatStayText : NO_CELLS_THAT_STAY_TEXT,
    showRow: showRow,
    showRowNoLonger: showRowNoLonger,
    endAt: endAt,
    cannotBeDrawn: open !== null && cannotDraw?.table === open.table,
  };
}
export function lastColumnEdges({ body: body, columnHeaders: columnHeaders }: Dynamic, endOfTable?: Dynamic) {
  let lastColumnHeader = columnHeaders.find(({ columnNumber: columnNumber }: Dynamic) => columnNumber === endOfTable?.column);
  let endOfLastColumn = lastColumnHeader === undefined ? null : body.left + lastColumnHeader.left + lastColumnHeader.width;
  let doesLastColumnRunOn = endOfLastColumn !== null && body.left + body.width - endOfLastColumn < LAST_COLUMN_RUN_ON_PX;
  return {
    endOfLastColumn: endOfLastColumn,
    doesLastColumnRunOn: doesLastColumnRunOn,
    boxOfColumn: (columnIndex?: Dynamic) => {
      let columnHeader = columnHeaders.find(({ columnNumber: columnNumber }: Dynamic) => columnNumber - 1 === columnIndex);
      if (columnHeader === undefined) return null;
      let width = columnHeader === lastColumnHeader && doesLastColumnRunOn ? body.width - columnHeader.left : columnHeader.width;
      return {
        left: body.left + columnHeader.left,
        width: width,
      };
    },
  };
}
export function revealedColumnsEdge(picture?: Dynamic, endOfTable?: Dynamic, columnsRevealed?: Dynamic) {
  let { body: body, columnHeaders: columnHeaders } = picture;
  let box = lastColumnEdges(picture, endOfTable).boxOfColumn(columnsRevealed - 1);
  if (box !== null) return box.left + box.width;
  return columnsRevealed < (columnHeaders[0]?.columnNumber ?? 1) ? body.left : body.left + body.width;
}
export function ImportShimmer(props?: Dynamic) {
  let { picture: picture, endOfTable: endOfTable, columnsRevealed: columnsRevealed, isGone: isGone, zoom: zoom } = props;
  let { left: bodyLeft, top: bodyTop, width: bodyWidth, height: bodyHeight } = picture.body;
  let lastColumnBox = lastColumnEdges(picture, endOfTable).boxOfColumn(endOfTable.column - 1);
  let roomWidth = lastColumnBox === null ? bodyWidth : lastColumnBox.left + lastColumnBox.width - bodyLeft;
  let lastRow = picture.rowsDrawn.find(({ rowNumber: rowNumber }: Dynamic) => rowNumber === endOfTable.row);
  let roomHeight = bodyTop + (lastRow === undefined ? bodyHeight : lastRow.top + lastRow.height);
  let revealedWidth = revealedColumnsEdge(picture, endOfTable, columnsRevealed) - bodyLeft;
  let shimmerAt = revealedWidth >= roomWidth ? roomWidth + IMPORT_SHIMMER_WIDTH_PX / zoom : revealedWidth;
  return jsxs('div', {
    'aria-hidden': true,
    className: 'sheet-import-shimmer-room',
    style: {
      left: bodyLeft * zoom,
      width: roomWidth * zoom,
      height: roomHeight * zoom,
    },
    children: [
      jsx('div', {
        className: 'sheet-import-shimmer',
        'data-crosses': true,
        'data-is-gone': columnsRevealed > 0 || isGone || undefined,
      }),
      jsx('div', {
        className: 'sheet-import-shimmer',
        'data-is-gone': columnsRevealed === 0 || isGone || undefined,
        style: {
          transform: `translateX(${Math.max(IMPORT_SHIMMER_WIDTH_PX, shimmerAt * zoom)}px)`,
        },
      }),
    ],
  });
}
export function ImportProposalOverlay({
  picture: picture,
  columnInHand: columnInHand,
  columnsLit: columnsLit,
  cellsThatStayText = NO_CELLS_THAT_STAY_TEXT,
  rowsUnfolded: rowsUnfolded,
  columnsUnfolded: columnsUnfolded,
  recordsDrawn: recordsDrawn,
  recordsNotDrawn: recordsNotDrawn,
  columnsNotDrawn: columnsNotDrawn,
  zoom: zoom,
  endOfTable: endOfTable,
  played = null,
}: Dynamic) {
  if (picture === null) return null;
  let { body: body, rowsDrawn: rowsDrawn } = picture;
  let {
    endOfLastColumn: endOfLastColumn,
    doesLastColumnRunOn: doesLastColumnRunOn,
    boxOfColumn: boxOfColumn,
  } = lastColumnEdges(picture, endOfTable);
  let columnInHandBox = boxOfColumn(columnInHand);
  let playedEdge = played === null ? null : revealedColumnsEdge(picture, endOfTable, played.columnsRevealed);
  let rowAfterRecords = rowsDrawn.find(({ rowNumber: rowNumber }: Dynamic) => rowNumber === recordsDrawn + 1);
  let lastTableRow = rowsDrawn.find(({ rowNumber: rowNumber }: Dynamic) => rowNumber === endOfTable?.row);
  let rowBeforeMore = recordsNotDrawn > 0 ? rowAfterRecords : lastTableRow;
  let namesRow = rowsDrawn.find(({ rowNumber: rowNumber }: Dynamic) => rowNumber === 1);
  let namesRowBottom = namesRow === undefined ? 0 : namesRow.top + namesRow.height;
  let rowsByNumber = new (Map as Dynamic)(rowsDrawn.map((input?: Dynamic) => [input.rowNumber, input]));
  let boxOfCell = ({ rowNumber: rowNumber, columnDrawn: columnDrawn }: Dynamic) => {
    let row = rowsByNumber.get(rowNumber);
    let columnBox = row === undefined ? null : boxOfColumn(columnDrawn);
    if (row === undefined || columnBox === null) return null;
    let hiddenHeight = Math.max(0, namesRowBottom - row.top);
    return hiddenHeight >= row.height
      ? null
      : {
          ...columnBox,
          top: body.top + row.top,
          height: row.height,
          hidden: hiddenHeight,
        };
  };
  return jsx('div', {
    'aria-hidden': true,
    inert: true,
    className: 'sheet-grid sheet-import-proposal',
    ...gridlinesDataAttribute(picture),
    children: jsxs('div', {
      style: zoomedStyle(zoom),
      children: [
        played === null || playedEdge === null
          ? jsx(PlainGridDrawing, {
              grid: picture,
            })
          : jsxs(Fragment, {
              children: [
                jsx('div', {
                  className: 'sheet-import-proposal-layer',
                  children: jsx(PlainGridDrawing, {
                    grid: played.plain,
                  }),
                }),
                jsx('div', {
                  className: 'sheet-import-proposal-layer',
                  style: {
                    clipPath: `inset(0 calc(100% - ${playedEdge}px) 0 0)`,
                  },
                  children: jsx(PlainGridDrawing, {
                    grid: picture,
                  }),
                }),
              ],
            }),
        played === null &&
          columnInHandBox !== null &&
          jsx(
            'div',
            {
              className: 'sheet-import-proposal-in-hand',
              style: columnInHandBox,
            },
            columnInHand,
          ),
        played === null &&
          cellsThatStayText.map((cell?: Dynamic) => {
            let box = boxOfCell(cell);
            return box === null
              ? null
              : jsx(
                  'div',
                  {
                    className: 'sheet-import-proposal-stays-text',
                    style: {
                      left: box.left,
                      top: box.top,
                      width: box.width,
                      height: box.height,
                      clipPath: `inset(${box.hidden}px 1px 1px 0)`,
                    },
                  },
                  `${cell.rowNumber} ${cell.columnDrawn}`,
                );
          }),
        columnsLit.map((columnIndex?: Dynamic) => {
          let box = boxOfColumn(columnIndex);
          return box === null
            ? null
            : jsx(
                'div',
                {
                  className: 'sheet-import-proposal-lit',
                  style: box,
                },
                columnIndex,
              );
        }),
        columnsUnfolded.map((columnIndex?: Dynamic) => {
          let box = boxOfColumn(columnIndex);
          return box === null
            ? null
            : jsx(
                'div',
                {
                  className: 'sheet-import-proposal-left-out',
                  style: {
                    ...box,
                    top: 0,
                    bottom: 0,
                  },
                },
                columnIndex,
              );
        }),
        rowsDrawn
          .filter(({ rowNumber: rowNumber }: Dynamic) => rowsUnfolded.includes(rowNumber))
          .map(
            ({ key: key, top: top, height: height }: Dynamic) =>
              jsx(
                'div',
                {
                  className: 'sheet-import-proposal-left-out',
                  style: {
                    top: body.top + top,
                    height: height,
                    left: 0,
                    right: 0,
                  },
                },
                key,
              ),
          ),
        endOfLastColumn !== null &&
          !doesLastColumnRunOn &&
          jsx('div', {
            className: 'sheet-import-past-the-table',
            style: {
              left: endOfLastColumn,
              top: 0,
            },
          }),
        endOfLastColumn !== null &&
          doesLastColumnRunOn &&
          jsxs(Fragment, {
            children: [
              jsx('div', {
                className: 'sheet-import-no-line',
                'data-is-on-headers': true,
                style: {
                  left: endOfLastColumn - 1,
                  top: 0,
                  height: body.top - 1,
                },
              }),
              rowsDrawn.map(
                ({ key: key, top: top, height: height, rowNumber: rowNumber }: Dynamic) =>
                  jsx(
                    'div',
                    {
                      className: 'sheet-import-no-line',
                      'data-is-frozen': rowNumber === 1 || undefined,
                      style: {
                        left: endOfLastColumn - 1,
                        top: body.top + top,
                        height: height - 1,
                      },
                    },
                    key,
                  ),
              ),
            ],
          }),
        lastTableRow !== undefined &&
          jsx('div', {
            className: 'sheet-import-past-the-table',
            style: {
              left: 0,
              top: body.top + lastTableRow.top + lastTableRow.height,
            },
          }),
        recordsNotDrawn + columnsNotDrawn > 0 &&
          rowBeforeMore !== undefined &&
          jsx('div', {
            className: 'sheet-import-proposal-more',
            style: {
              top: body.top + rowBeforeMore.top + rowBeforeMore.height,
              left: body.left,
            },
            children: joinImportWordsWithCommas([
              ...(recordsNotDrawn > 0 ? [moreRowsLabel(recordsNotDrawn)] : []),
              ...(columnsNotDrawn > 0 ? [moreImportColumnsWords(columnsNotDrawn)] : []),
            ]),
          }),
      ],
    }),
  });
}
export const singleFingerOf = ([firstTouch, secondTouch]: Dynamic, isOutsideCells?: Dynamic) =>
  firstTouch === undefined || secondTouch !== undefined || isOutsideCells
    ? null
    : {
        id: firstTouch.identifier,
        x: firstTouch.clientX,
        y: firstTouch.clientY,
      };
export const NO_TEXT_MEASURES = {
  lineCountsOfWrappedTexts: (texts?: Dynamic) => texts.map(() => 1),
  widthOfCharacters: () => 0,
};
export const quotedName = (name?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '“{name}”',
      id: '9dQoGQZQEq',
    },
    {
      name: name,
    },
  );
export const importDialogLabels = {
  apply: () =>
    translateMessage({
      defaultMessage: 'Apply',
      id: 'BbM/u7dITQ',
    }),
  importCsv: () =>
    translateMessage({
      defaultMessage: 'Import CSV',
      id: 'Ge8FxxsPo8',
    }),
  whatToDo: () =>
    translateMessage({
      defaultMessage: 'A preview of your new sheet. Change column types, headings or rows before you apply.',
      id: 'Z4baBNLyK6',
    }),
  columnsToCheck: () =>
    translateMessage({
      defaultMessage: 'Columns to check',
      id: '+OeUgANjWY',
    }),
  discard: () =>
    translateMessage({
      defaultMessage: 'Discard',
      id: 'dfmH4faikb',
    }),
  sheet: () =>
    translateMessage({
      defaultMessage: 'Sheet',
      id: '40Qvd5GZiU',
    }),
  empty: () =>
    translateMessage({
      defaultMessage: 'Empty',
      id: 'OpzlbeZf1O',
    }),
  importTitle: () =>
    translateMessage({
      defaultMessage: 'Import',
      id: '6NxWwU70kQ',
    }),
};
export const columnsToCheckLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {# column to check} other {# columns to check}}',
      id: 'LSa7gkQzV2',
    },
    {
      count: count,
    },
  );
export const columnNthLabel = (nth?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Column {nth, number}',
      id: 'Q+VabMaG/a',
    },
    {
      nth: nth,
    },
  );
export const addBackColumnLabel = (nth?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Add back column {nth, number}',
      id: '+ctqvSRUxj',
    },
    {
      nth: nth,
    },
  );
export const notInSheetLabel = (sheetName?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Not in {sheetName}',
      id: 'Pi6p8qrQLi',
    },
    {
      sheetName: sheetName,
    },
  );
export const addBackLineLabel = (line?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Add back line {line, number}',
      id: 'C+wRun33Z7',
    },
    {
      line: line,
    },
  );
export const rowsAndColumnsLabel = (rowCount?: Dynamic, columnCount?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{rows}, {columns}',
      id: 'hX//3Owf+3',
    },
    {
      rows: importRowCountLabel(rowCount),
      columns: translateMessage(
        {
          defaultMessage: '{count, plural, one {# column} other {# columns}}',
          id: 'utQTtS3cKE',
        },
        {
          count: columnCount,
        },
      ),
    },
  );
export const importRowCountLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {# row} other {# rows}}',
      id: '11/Nh1thhB',
    },
    {
      count: count,
    },
  );
export const moreRowsLabel = (count?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{count, plural, one {# more row} other {# more rows}}',
      id: 'SMumWlrxR+',
    },
    {
      count: count,
    },
  );
export const previewBeingReadLabel = (fileName?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'A preview of “{fileName}”. Nothing is saved yet. Agent is reading it.',
      id: 'IvYPDtSb0g',
    },
    {
      fileName: fileName,
    },
  );
export const readyToApplyWords = (sheetName?: Dynamic, rowCount?: Dynamic, openCount?: Dynamic) =>
  [
    translateMessage(
      {
        defaultMessage:
          '{rowCount, plural, one {“{sheetName}” is ready to apply, with # row.} other {“{sheetName}” is ready to apply, with # rows.}}',
        id: 'GfjxJmDh3f',
      },
      {
        sheetName: sheetName,
        rowCount: rowCount,
      },
    ),
    translateMessage(
      {
        defaultMessage:
          '{openCount, plural, =0 {Nothing is saved yet.} one {Nothing is saved yet. # setting is left to check.} other {Nothing is saved yet. # settings are left to check.}}',
        id: 'cCcimqDdJA',
      },
      {
        openCount: openCount,
      },
    ),
    translateMessage({
      defaultMessage: 'Apply it to read its cells. Undo removes it again.',
      id: 'sAQu5gAf9J',
    }),
  ].join(' ');
export const IMPORT_TABLE_WIDTH_BUDGET = 4000;
export const MIN_IMPORT_COLUMN_WIDTH = 60;
export const importColumnWidth = ({ table: table }: Dynamic) =>
  Math.max(MIN_IMPORT_COLUMN_WIDTH, Math.floor(IMPORT_TABLE_WIDTH_BUDGET / Math.min(table.columnCount, MAX_PREVIEW_COLUMNS)));
export const importColumnWidthOf = (open?: Dynamic) =>
  isImportPlanComing(open) ? MIN_IMPORT_COLUMN_WIDTH : importColumnWidth(open);
export const POPUP_SURFACE_SELECTOR = '[role=menu],[role=listbox],[role=alertdialog],[data-ui=Popover]';
export const PICTURE_BOX_CLASS = 'sheet-import-picture-box';
export const SCROLLS_AROUND_PICTURE_ATTRIBUTE = 'data-scrolls-around-the-picture';
export const IMPORT_HEADINGS_SELECTOR = '.sheet-import-headings';
export const WIDE_PICTURE_WIDTH = 1e5;
export const PICTURE_END_SLACK_PX = 48;
export const LAST_COLUMN_RUN_ON_PX = 48;
export const END_AT_INFINITY = {
  row: 1 / 0,
  column: 1 / 0,
};
export const ROWS_ABOVE_SHOWN_ROW = 8;
export const LINE_SCROLL_PX = 24;
export const isInPictureBox = (target?: Dynamic) =>
  target instanceof Element && target.closest(`.${PICTURE_BOX_CLASS}`) !== null && target.closest(POPUP_SURFACE_SELECTOR) === null;
export const TOP_LEFT_SCROLL = {
  scrollTop: 0,
  scrollLeft: 0,
};
export const NO_CELLS_THAT_STAY_TEXT: Dynamic = [];
export const isSameImportOpen = (first?: Dynamic, second?: Dynamic) =>
  first === second ||
  (first !== null &&
    second !== null &&
    first.table === second.table &&
    first.plan === second.plan &&
    first.soFar?.plan === second.soFar?.plan &&
    first.byHand === second.byHand &&
    first.answers === second.answers &&
    first.destinationChosen === second.destinationChosen);
export const PICTURE_COLUMN_MEASURE_HEIGHT = 96;
export const IMPORT_SHIMMER_WIDTH_PX = 100;
