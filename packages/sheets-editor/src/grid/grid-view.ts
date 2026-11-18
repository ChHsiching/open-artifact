import type { Dynamic } from '../dynamic.ts';
import { columnsOfTableMoving, columnGripsOfTables } from '../selection/move-table-columns.ts';
import { readsWithColumnsMoved, columnsRidingOf } from './moved-columns.ts';
import { readsWithUnansweredEntries } from '../editor/unanswered-entries.ts';
import { ROW_HEADER_WIDTH } from './cell-metrics-values.ts';
import {
  COLUMN_HEADER_HEIGHT,
  cellTextInsets,
  hasRoomForText,
  charsThatFitWidth,
  listIndentOfLines,
  textRoomPastPadding,
  CELL_TEXT_PADDING_X,
  editorTextInsets as editorTextInsetsImported,
} from './cell-metrics.ts';
import {
  cellsAreaWidth,
  cellsAreaHeight,
  extraReachOfShift,
  rowPanes,
  columnPanes,
  rangeSpansOnScreen,
  isInSpan,
  shownColumnIndicesInPane,
  shownRowIndicesInPane,
  boxOfCellRange,
  paneRect,
  lastShownLineWhere,
  cellsHeightAboveFloats,
  frozenRowsHeight,
  resizedRowEndOnScreen,
  resizedColumnEndOnScreen,
  rowEdgeOnScreen,
  columnEdgeOnScreen,
  frozenColumnsWidth,
  columnResizeGrip,
  rowResizeGrip,
  columnsEndOnScreen,
  rowsEndOnScreen,
  maxScrollWithFloats,
  columnEndOnScreen,
  rowFreezeGripSpan,
  columnFreezeGripSpan,
} from './geometry.ts';
import { ownRowOrderOfSheet, lowerBoundIndex } from '../model/line-ids.ts';
import { layoutOfView, hiddenByBorderAtFoot, lineResizeOfView, sheetOfView, rowsHiddenByOwnFilters } from './layout.ts';
import {
  mergedAreaOrCellOf,
  selectedArea,
  activeAnchorCell,
  isSameArea,
  areaOfPosition,
  unionOfAreas,
  withRoomUnderNoticesAtFoot,
  editorScaleOf,
  isSameCell,
} from '../selection/model.ts';
import { areasOfAllRanges, someAreaHasCell, hasOtherRanges } from '../selection/several-ranges.ts';
import { shownUnderPatternOf, withShownUnderPattern } from '../format/number-format-choices.ts';
import { selectedAreaAsSeen, cachedSelectedArea, peerFlagLook } from '../presence/selections.ts';
import { drawnFormatsOf } from '../format/conditional/drawn-looks.ts';
import { conditionalFormatsGivenNow, areasOfRuleBeingEdited } from '../format/conditional/pane-reducer.ts';
import {
  makeHasFilterButton,
  makeIsFilterHeaderArea,
  makeIsInTable,
  makeTableEdgeColumnsOfRow,
  makeCornersOfTable,
  makeIsColumnLineInTable,
  doesHeaderTextWrapBesideButton,
  filterButtonRoomInCell,
  filterButtonsInView,
} from '../tables/table-drawing.ts';
import { tablesToOutline, makeIsInTableHeader, tableAreaOfFilledBody } from '../tables/tables-in-view.ts';
import { looksWithoutHeaderGray } from './header-gray-fill.ts';
import {
  makeIsCellMarkedForAttention,
  withEndsNotUnderFrozenLines,
  drawnBoxOfSpans,
  BIG_BOX_MARGIN_PAST_SIGHT,
  boxInScrolledPane,
  indentToCenterIn,
  textColorNameOf,
  checkboxMiddleInBox,
  clipSpanToShown,
  BOX_MARGIN_PAST_SIGHT,
  paneWithExtraReach,
  editorBoxOfSpans,
  NO_EDITOR_LAYOUT,
  clipBoxToShown,
  startAndSizeOf,
  cellDrawKey,
  makeIsAreaMarkedByEntry,
} from './view-boxes.ts';
import { shownLineAtOrAfter, isLineShown } from '../model/line-sizes.ts';
import { cellWithFormulaShown } from './formulas-shown.ts';
import { cellsOfFixes, fixPillOfActiveCell, fixPillShown, fixAreasToDraw } from '../formulas/fix/fixes-on-cells.ts';
import { cellKeyText, cellExplained, isExplainingBlocked } from '../state/explained-under-cell.ts';
import { cellValueOf, usersOfCell, listLinesOfCell, NO_LIST_LINES } from '../model/cell-values.ts';
import { readCellLink } from '../links/cell-links.ts';
import { resolvedHorizontalAlignment } from '../format/toolbar-choices.ts';
import { shownCellText } from '../format/shown-text.ts';
import { textOverflowAround, cellTextLayout, cellsJoinForOverflow, shareOverflowWidth, NO_TEXT_OVERFLOW, mayCellTextFade } from './text-overflow.ts';
import {
  chipPersonOf,
  doColumnSpansOverlap,
  NO_LINES_IN_TEXT_BOX,
  NO_OTHER_PEOPLE,
  NO_BORDER_LINES,
  linesAroundIndexes,
  selectionSummaryPlace,
  errorsOfferCornerPlace,
  ERRORS_OFFER_WIDTH,
  FIX_PILL_REACH,
  FIX_PILL_ROOM_ABOVE,
  ERRORS_OFFER_HEIGHT,
  rectOfSpans,
  sideForExplainedCard,
  NO_NUMBERS_OF_LINES,
  isBoxShownOrEmpty,
  COMMENT_CARD_ROOM_AT_FOOT,
} from './cards-place.ts';
import { isCheckboxFormat } from '../chips/checkboxes.ts';
import { booleanOfValue } from '../chips/checkbox-presses.ts';
import { isFormulaCell, areasOverlap } from '../model/workbook.ts';
import { dropdownAtCell } from '../chips/dropdown-options.ts';
import { NO_COLOR } from '../model/colors.ts';
import { dropdownChipColors, cellColorsOfFormat, NO_CELL_COLORS, defaultTextColorsOnFill, contrastingShades } from '../format/cell-colors.ts';
import { dropdownChipExtraWidth } from './chip-metrics.ts';
import { cellShownText } from '../clipboard/text-escaping.ts';
import { joinPeopleNames, roomAboveGridForFind } from '../ui/find.ts';
import { cellTextLinks } from '../links/text-links.ts';
import { showsRealError, errorCodeOfCell } from '../formulas/error-tells.ts';
import { rowNumberAsStored, columnLetters } from '../model/a1-references.ts';
import { isCalendarFormat, doesCellTakeCalendar } from '../chips/calendar.ts';
import { isFormatComingToCell } from '../presence/follow-person.ts';
import { isPeopleCell, peopleChipsOfListCell, isEntryAmongPeople } from '../chips/people-list.ts';
import { hasFontFormatting, withFontMarks } from '../model/cell-format.ts';
import {
  commentAtActiveCell,
  doesCommentEndAtSelectionCorner,
  isCommentWithAgent,
  isCommentMarkedOnGrid,
  canCommentModePickNow,
} from '../comments/comment-state.ts';
import { buildBorderPaths } from './borders.ts';
import { ownFiltersOfSheet, drawnOwnFiltersOfSheet } from '../tables/own-filters.ts';
import { areaOfFilteredTable } from '../tables/finding.ts';
import { dropdownEditorOfPane } from '../state/queries.ts';
import { spillOutlineOfEntry, endOfWrappedTextIfCut, isCellEntryBlank, entryHintRoomOf, GRID_PIXEL_SLACK } from './entry-hints.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { selectedChartInputAreas, placedViewsToDraw } from '../charts/placed-views.ts';
import { stuckHeadersOfView, stuckHeadersBottom, isRowUnderStuckHeader } from './sticky-headers.ts';
import { startOfAreaToChart } from '../selection/table-select.ts';
import { FLAG_HEIGHT, placeSelectionFlag, AGENT_FLAG_WIDTH, layOutSelectionFlags } from '../presence/flags.ts';
import { fillHandleBox, fillAreaOfDrag } from '../selection/fill-handle.ts';
import { areaCoveringChanges, MAX_CHANGE_GROUPS_APART, changesSpanWholeLines } from '../agent/changes-by-agent.ts';
import { cellsShownByAgent } from '../agent/shown-by-agent.ts';
import { movingLinesDropIndex, selectedWholeLines } from '../selection/move-lines.ts';
import { entryLooksOf, textAtStartOfEntry } from '../editor/entry-looks.ts';
import {
  isEntryExpanded,
  isExpandOfferedInEntry as isExpandOfferedInEntryImported,
  EXPAND_BUTTON_ROOM,
  EXPANDED_ENTRY_PADDING,
  expandedEntryLayout,
  isExpandOfferedAtActiveCell,
} from '../editor/expanded-entry.ts';
import { fontMarksWhere, fontMarksOfStyle } from '../editor/text-looks.ts';
import { wordsOfferedNow } from '../editor/words-offered.ts';
import { editorLayoutOf } from '../editor/editor-box.ts';
import { proposedFixesOf } from '../formulas/from-words/actions.ts';
import { dropdownAtActiveCell } from '../chips/dropdowns.ts';
import { isTimeCell } from '../editor/time-list.ts';
import { addRowsControlBox, rowsAddableAtEnd, addColumnsControlBox } from './lines-at-end.ts';
import { landingAreaOfMovingCells, moveGrabStrips, tableHandles, tableHandleBox } from '../selection/move-cells.ts';
import { errorsOfferShown } from '../formulas/fix/errors-offer.ts';
import {
  mayOfferAtSelection,
  isAreaJustActiveCell,
  isChosenCellAlone,
  placeOfSelectionOffer,
  isSelectionOfferCovered,
} from '../state/offers-at-selection.ts';
import { areCellLinesCut, hasCellSeveralLines } from './wrapped-rows.ts';
import { isSumWithFormulaCell } from '../selection/figures.ts';
import { lastShownColumnEdge } from './resize-lines.ts';
import { isIdleOrTapping } from '../state/transitions.ts';
import { markImportedCells } from '../import/marks-of-import.ts';
import { filteredTableOutlines, outlineOfFilterNotDrawnYet, foundTableOutlines, isAreaInFilteredTable } from '../tables/table-outlines.ts';
import { ownFilterSeamPositions, hiddenLineSeamPositions } from './outline-groups.ts';
import { shownChartBeingMade } from '../charts/chart-being-made-state.ts';
import { POINTER_DRAG_KINDS } from '../selection/pointer.ts';
import { doesEntryReadSigns } from '../editor/start-entry.ts';
import { workingCardRoom } from '../agent/turn-of-agent.ts';
import { newMovedCellsParts, movedCellsCopy, windowOfLines } from './moved-cells-copy.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function gridViewOf(state: PageState, reads: ReadsWithTextMeasurer, selectionSummary?: Dynamic, isReadOnly?: Dynamic, shift: Dynamic = null) {
  let columnsMoving = columnsOfTableMoving(state, reads);
  let moveUnanswered = state.moveOfColumnsUnanswered?.before === reads ? state.moveOfColumnsUnanswered.moved : null;
  let columnsMove = columnsMoving ?? moveUnanswered;
  let movedColumns = columnsMove === null ? null : readsWithColumnsMoved(reads, columnsMove);
  let readsMoved = movedColumns?.reads ?? reads;
  let readsNow = readsWithUnansweredEntries(readsMoved, state);
  let body = {
    left: ROW_HEADER_WIDTH,
    top: COLUMN_HEADER_HEIGHT,
    width: cellsAreaWidth(state),
    height: cellsAreaHeight(state),
  };
  let { sheetId: sheetId } = state;
  let ownRowOrder = ownRowOrderOfSheet(readsNow, sheetId);
  let layout = layoutOfView(state, readsMoved);
  let [rowReach, columnReach] = [extraReachOfShift(shift?.y ?? 0), extraReachOfShift(shift?.x ?? 0)];
  let [rowPaneSpans, columnPaneSpans] = [rowPanes(state, layout, state, rowReach), columnPanes(state, layout, state, columnReach)];
  let spansOfArea = (area?: Dynamic) => rangeSpansOnScreen(area, state, layout, state);
  let isActiveCellInSheet = state.activeCell.sheetId === sheetId;
  let activeArea = isActiveCellInSheet ? mergedAreaOrCellOf(readsNow, state.activeCell) : null;
  let areaOfSelection = isActiveCellInSheet ? selectedArea(state, readsNow) : null;
  let selectedAreas = isActiveCellInSheet ? areasOfAllRanges(state, readsNow) : [];
  let shownUnderPattern = shownUnderPatternOf(state);
  let isRowSelected = (rowIndex?: Dynamic) =>
    selectedAreas.some(({ topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic) => isInSpan(rowIndex, topRowIndex, rowCount));
  let isColumnSelected = (columnIndex?: Dynamic) =>
    selectedAreas.some(
      ({ leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) => isInSpan(columnIndex, leftColumnIndex, columnCount),
    );
  let commentAreas = (state.comments ?? []).flatMap(
    ({ cells: cells, isResolved: isResolved }: Dynamic) =>
      isResolved || cells.activeCell.sheetId !== sheetId ? [] : (selectedAreaAsSeen(cells, readsNow) ?? []),
  );
  let areasWrittenByAgent = state.writtenInTurnOfAgent.flatMap(
    (cells?: Dynamic) => (cells.activeCell.sheetId !== sheetId ? [] : (cachedSelectedArea(cells, readsNow) ?? [])),
  );
  let cellIdAt = (rowIndex?: Dynamic, columnIndex?: Dynamic) => {
    let cellId = readsNow.cellIdAt(sheetId, rowIndex, columnIndex);
    if (cellId === null) throw Error('a cell to draw is not in the sheet');
    return cellId;
  };
  let formatsByIndex = new (Map as Dynamic)();
  let drawnFormats = drawnFormatsOf(readsNow, sheetId, conditionalFormatsGivenNow(state, readsNow));
  let drawnFormatsBefore = movedColumns === null ? drawnFormats : drawnFormatsOf(reads, sheetId, conditionalFormatsGivenNow(state, reads));
  let drawnFormatsMoved =
    movedColumns === null
      ? drawnFormats
      : {
          formatOf: (cell?: Dynamic) => drawnFormats.formatOver(readsNow.formatOf(cell), movedColumns.layBefore(cell)),
          formatOver: (format?: Dynamic, cell?: Dynamic) => drawnFormats.formatOver(format, movedColumns.layBefore(cell)),
          lookOf(cell?: Dynamic, position?: Dynamic) {
            let cellBefore = movedColumns.layBefore(cell);
            if (cellBefore === cell) return drawnFormats.lookOf(cell, position);
            return drawnFormatsBefore.lookOf(cellBefore, reads.positionOfCell(cellBefore) ?? position);
          },
        };
  let hasFilterButton = makeHasFilterButton(state, readsNow, layout);
  let isFilterHeaderArea = makeIsFilterHeaderArea(state, readsNow, layout);
  let outlinedTables = tablesToOutline(state, readsNow);
  let isInTableHeader = makeIsInTableHeader(outlinedTables);
  let headerGroundOf = (area?: Dynamic) => (isFilterHeaderArea(area) ? 'header' : isInTableHeader(area) ? 'foundHeader' : 'sheet');
  let looks = looksWithoutHeaderGray(drawnFormatsMoved, readsNow, (area?: Dynamic) => headerGroundOf(area) !== 'sheet');
  let isInTable = makeIsInTable(state, readsNow, outlinedTables);
  let tableEdgeColumnsOfRow = makeTableEdgeColumnsOfRow(state, readsNow, layout, outlinedTables);
  let cornersOfTable = makeCornersOfTable(state, readsNow, layout, outlinedTables);
  let isCellMarkedForAttention = makeIsCellMarkedForAttention(state, readsNow);
  let isColumnLineInTable = makeIsColumnLineInTable(state, readsNow, layout, outlinedTables);
  let isBorderedPastArea = ({ leftColumnIndex: leftColumnIndex, columnCount: columnCount, ...restOfArea }: Dynamic) =>
    leftColumnIndex + columnCount !== layout.frozenColumnCount &&
    cornersOfTable({
      ...restOfArea,
      leftColumnIndex: shownLineAtOrAfter(layout.columnEdges, leftColumnIndex + columnCount),
      columnCount: 1,
    })?.includes('left') === true;
  let formatAt = (rowIndex?: Dynamic, columnIndex?: Dynamic) => {
    let key = rowIndex * layout.columnCount + columnIndex;
    let format = formatsByIndex.get(key) ?? looks.formatOf(cellIdAt(rowIndex, columnIndex));
    formatsByIndex.set(key, format);
    return format;
  };
  let editedCellPosition =
    state.mode.kind === 'editing' && isActiveCellInSheet ? readsNow.positionOfCell(activeAnchorCell(state, readsNow)) : null;
  let cellAsShown = (cell?: Dynamic, format?: Dynamic) => (state.areFormulasShown ? cellWithFormulaShown(cell, format) : cell);
  let fixCells = state.fixesOnCells.stage?.sheetId === sheetId ? cellsOfFixes(state) : [];
  let fixByCellKey = new (Map as Dynamic)(fixCells.map((fix?: Dynamic) => [cellKeyText(fix.cellId), fix]));
  let activeCellFixPill = fixPillOfActiveCell(state, readsNow);
  let keyOfFixWithKeys = activeCellFixPill === null ? null : cellKeyText(activeCellFixPill.cellId);
  let fixPill = fixPillShown(state, readsNow);
  let keyOfFixPill = fixPill === null ? null : cellKeyText(fixPill.cellId);
  let fixPillTexts: Dynamic = [];
  let fixTextEnds = new (Map as Dynamic)();
  let doesTextOverflowCell = (rowIndex?: Dynamic, columnIndex?: Dynamic) => {
    if (
      isInTableHeader({
        topRowIndex: rowIndex,
        leftColumnIndex: columnIndex,
        rowCount: 1,
        columnCount: 1,
      })
    )
      return false;
    let cellId = cellIdAt(rowIndex, columnIndex);
    let cell = readsNow.cellOf(cellId);
    let format = formatAt(rowIndex, columnIndex);
    let fixFormula = fixByCellKey.get(cellKeyText(cellId))?.formula ?? null;
    let cellShown = cellAsShown(cell, format);
    let cellOrSpill = cellShown ?? readsNow.spilledCellOf(cellId);
    let isTextLike =
      (fixFormula !== null || (cellValueOf(cellOrSpill)?.kind === 'text' && readCellLink(cellShown, format) === null)) &&
      format.cellControl.kind !== 'dropdown' &&
      usersOfCell(cell).length === 0;
    let alignment =
      fixFormula !== null || cellShown !== cell ? 'left' : resolvedHorizontalAlignment(format.alignment.horizontal, cellValueOf(cellOrSpill));
    let rowHeight = layout.rowEdges.sizeOf(rowIndex);
    return (
      isTextLike &&
      !format.alignment.wrap &&
      readsNow.mergedAreaAt(sheetId, {
        rowIndex: rowIndex,
        columnIndex: columnIndex,
      }) === null &&
      doesHeaderTextWrapBesideButton(readsNow, fixFormula ?? shownCellText(cellOrSpill, 0, readsNow.decimalSign).text, format.font, {
        cellWidth: layout.columnEdges.sizeOf(columnIndex),
        clearAtLeft: cellTextInsets(rowHeight, format.font.size, state.density, alignment).left,
      })
    );
  };
  let columnIndexes = columnPaneSpans.flatMap((columnPane?: Dynamic) => shownColumnIndicesInPane(columnPane, layout));
  let rowsToDraw =
    layout.columnCount === 0
      ? []
      : rowPaneSpans.flatMap(
          (rowPane?: Dynamic) =>
            shownRowIndicesInPane(rowPane, layout).map(
              (rowIndex?: Dynamic) => ({
                rowIndex: rowIndex,
                span: rowPane,
              }),
            ),
        );
  let rowIndexes = rowsToDraw.map(({ rowIndex: rowIndex }: Dynamic) => rowIndex);
  let columnIdByIndex = new (Map as Dynamic)(
    layout.rowCount === 0 ? [] : columnIndexes.map((columnIndex?: Dynamic) => [columnIndex, cellIdAt(0, columnIndex).columnId]),
  );
  let mergedAreas = [
    ...new (Set as Dynamic)(
      rowPaneSpans.flatMap(
        (rowPane?: Dynamic) =>
          columnPaneSpans.flatMap(
            (columnPane?: Dynamic) =>
              readsNow.mergedAreasIn(sheetId, {
                topRowIndex: rowPane.first,
                rowCount: rowPane.count,
                leftColumnIndex: columnPane.first,
                columnCount: columnPane.count,
              }),
          ),
      ),
    ),
  ];
  let mergedAreaAnchors = new (Map as Dynamic)(
    mergedAreas.map(
      (mergedArea?: Dynamic) => [
        mergedArea,
        {
          rowIndex: rowIndexes.find((rowIndex?: Dynamic) => isInSpan(rowIndex, mergedArea.topRowIndex, mergedArea.rowCount)),
          columnIndex: columnIndexes.find(
            (columnIndex?: Dynamic) => isInSpan(columnIndex, mergedArea.leftColumnIndex, mergedArea.columnCount),
          ),
        },
      ],
    ),
  );
  function cellsOfRow(rowIndex?: Dynamic, rowId?: Dynamic, rowPane?: Dynamic, columnPane?: Dynamic) {
    let scroll = {
      scrollLeft: columnPane.scroll,
      scrollTop: rowPane.scroll,
    };
    let columnsOfPane = {
      leftColumnIndex: columnPane.first,
      columnCount: columnPane.count,
    };
    let paneEnd = columnsOfPane.leftColumnIndex + columnsOfPane.columnCount;
    let columnIndexesOfPane = shownColumnIndicesInPane(columnPane, layout);
    let mergedAreasInRow = mergedAreas.filter(
      (mergedArea?: Dynamic) => isInSpan(rowIndex, mergedArea.topRowIndex, mergedArea.rowCount),
    );
    let commentAreasInRow = commentAreas.filter(
      (commentArea?: Dynamic) => isInSpan(rowIndex, commentArea.topRowIndex, commentArea.rowCount),
    );
    let blocksInRow =
      editedCellPosition?.rowIndex === rowIndex
        ? [
            ...mergedAreasInRow,
            {
              leftColumnIndex: editedCellPosition.columnIndex,
              columnCount: 1,
            },
          ]
        : mergedAreasInRow;
    let tableEdgeColumns = tableEdgeColumnsOfRow(rowIndex);
    let cells: Dynamic = [];
    let nextFreeColumn: Dynamic = 0;
    let columnsWithContent = readsNow.columnIndexesOnShowIn(sheetId, rowIndex);
    let lastColumnBefore = columnsWithContent[lowerBoundIndex(columnsWithContent, columnsOfPane.leftColumnIndex) - 1];
    let columnsToDraw = columnPane.areFrozen
      ? columnIndexesOfPane
      : [
          lastColumnBefore !== undefined && lastColumnBefore >= layout.frozenColumnCount ? lastColumnBefore : [],
          columnIndexesOfPane,
          columnsWithContent[lowerBoundIndex(columnsWithContent, paneEnd)] ?? [],
        ]
          .flat()
          .filter((columnIndex?: Dynamic) => isLineShown(layout.columnEdges, columnIndex));
    let isMergedBefore = (columnIndex?: Dynamic) => {
      let firstColumn = Math.min(columnIndex, paneEnd);
      let columnCount = Math.max(columnIndex + 1, columnsOfPane.leftColumnIndex) - firstColumn;
      let betweenArea = {
        topRowIndex: rowIndex,
        rowCount: 1,
        leftColumnIndex: firstColumn,
        columnCount: columnCount,
      };
      return readsNow.mergedAreasIn(sheetId, betweenArea).length > 0;
    };
    let overflowRoomLeftOf = (columnIndex?: Dynamic) => {
      let cellId = cellIdAt(rowIndex, columnIndex);
      let cell = readsNow.cellOf(cellId);
      let cellOrSpill = cell ?? readsNow.spilledCellOf(cellId);
      let value = cellValueOf(cellOrSpill);
      let columnWidth = layout.columnEdges.sizeOf(columnIndex);
      let { cellControl: cellControl, alignment: alignment, font: font } = formatAt(rowIndex, columnIndex);
      if (
        cellAsShown(cell, {
          cellControl: cellControl,
        }) !== cell
      )
        return 0;
      if ((fixByCellKey.get(cellKeyText(cellId))?.formula ?? null) !== null) return 0;
      return textOverflowAround(
        cellTextLayout(value, {
          isMerged: mergedAreasInRow.some((mergedArea?: Dynamic) => mergedArea.leftColumnIndex === columnIndex),
          isTypedIn: editedCellPosition?.rowIndex === rowIndex && editedCellPosition.columnIndex === columnIndex,
          isOfDropdown: cellControl.kind === 'dropdown',
          hasFilterButton: hasFilterButton(rowIndex, cellId.columnId),
          isPerson: usersOfCell(cell).length > 0,
          linkDrawnAs:
            readCellLink(cell, {
              cellControl: cellControl,
            })?.drawnAs ?? null,
          isFormulaShown: false,
          isWrappedByFormat: alignment.wrap,
          holdsList: listLinesOfCell(cell).length > 0,
          hasRoomToWrap: hasRoomForText(columnWidth, font.size),
        }),
        resolvedHorizontalAlignment(alignment.horizontal, value),
        shownCellText(cellOrSpill, charsThatFitWidth(columnWidth, font), readsNow.decimalSign).text,
        columnWidth - listIndentOfLines(listLinesOfCell(cell), font.size),
        font.size,
      ).toLeft;
    };
    let overflowSpanOf = (
      columnIndex?: Dynamic,
      cellRect?: Dynamic,
      textReach?: Dynamic,
      blockingColumns?: Dynamic,
      leftmostColumn: Dynamic = columnsOfPane.leftColumnIndex,
    ) => {
      let contentIndex = lowerBoundIndex(columnsWithContent, columnIndex);
      let leftColumn = (Math.max as Dynamic)(
        layout.columnEdges.indexAt(cellRect.left - textReach.toLeft),
        (columnsWithContent[contentIndex - 1] ?? -1) + 1,
        ...blocksInRow.map((block?: Dynamic) => (block.leftColumnIndex < columnIndex ? block.leftColumnIndex + block.columnCount : 0)),
        ...blockingColumns.map((column?: Dynamic) => (column < columnIndex ? column + 1 : 0)),
        nextFreeColumn,
        Math.min(columnIndex, leftmostColumn),
      );
      let nextContentColumn = columnsWithContent[contentIndex + 1] ?? layout.columnCount;
      let rightLimit = (Math.min as Dynamic)(
        nextContentColumn,
        ...blocksInRow.map((block?: Dynamic) => (block.leftColumnIndex > columnIndex ? block.leftColumnIndex : layout.columnCount)),
        ...blockingColumns.map((column?: Dynamic) => (column >= columnIndex ? column + 1 : layout.columnCount)),
      );
      let canBorrowRight =
        textReach.toRight > 0 &&
        rightLimit === nextContentColumn &&
        !tableEdgeColumns.includes(nextContentColumn - 1) &&
        nextContentColumn < layout.columnCount &&
        cellsJoinForOverflow(formatAt(rowIndex, nextContentColumn - 1), formatAt(rowIndex, nextContentColumn), !isReadOnly);
      let rightRoom = shareOverflowWidth(
        layout.columnEdges.startOf(nextContentColumn) - cellRect.right,
        textReach.toRight,
        canBorrowRight ? overflowRoomLeftOf(nextContentColumn) : 0,
      );
      let lastColumn = layout.columnEdges.indexAt(cellRect.right + rightRoom.width - 1);
      let endColumn = Math.min(
        rightRoom.isShared && cellRect.right + rightRoom.width - layout.columnEdges.startOf(lastColumn) < layout.columnEdges.sizeOf(lastColumn) / 2
          ? lastColumn
          : lastColumn + 1,
        rightLimit,
        Math.max(columnIndex + 1, paneEnd),
      );
      return {
        leftColumnIndex: leftColumn,
        columnCount: endColumn - leftColumn,
      };
    };
    let sameLookSpanOf = (columnIndex?: Dynamic, format?: Dynamic, span?: Dynamic) => {
      let leftColumn: Dynamic = columnIndex;
      for (let lookSoFar: Dynamic = format; leftColumn > span.leftColumnIndex; leftColumn -= 1) {
        let look = formatAt(rowIndex, leftColumn - 1);
        if (!cellsJoinForOverflow(look, lookSoFar, !isReadOnly)) break;
        lookSoFar = look;
      }
      let endOfSpan = span.leftColumnIndex + span.columnCount;
      let endColumn: Dynamic = columnIndex + 1;
      for (let lookSoFar: Dynamic = format; endColumn < endOfSpan; endColumn += 1) {
        let look = formatAt(rowIndex, endColumn);
        if (!cellsJoinForOverflow(lookSoFar, look, !isReadOnly)) break;
        lookSoFar = look;
      }
      return {
        leftColumnIndex: leftColumn,
        columnCount: endColumn - leftColumn,
      };
    };
    let overflowStartOf = (
      columnIndex?: Dynamic,
      format?: Dynamic,
      cellRect?: Dynamic,
      textReach?: Dynamic,
      blockingColumns?: Dynamic,
    ) => {
      let { leftColumnIndex: leftColumn } = sameLookSpanOf(
        columnIndex,
        format,
        overflowSpanOf(columnIndex, cellRect, textReach, blockingColumns, 0),
      );
      let columnCount = columnIndex - leftColumn;
      let betweenArea = {
        topRowIndex: rowIndex,
        rowCount: 1,
        leftColumnIndex: leftColumn,
        columnCount: columnCount,
      };
      return (Math.max as Dynamic)(
        leftColumn,
        ...(columnCount === 0 ? [] : readsNow.mergedAreasIn(sheetId, betweenArea)).map(
          (mergedArea?: Dynamic) => mergedArea.leftColumnIndex + mergedArea.columnCount,
        ),
      );
    };
    for (let columnIndex of columnsToDraw as Dynamic) {
      let isInPane = isInSpan(columnIndex, columnsOfPane.leftColumnIndex, columnsOfPane.columnCount);
      let mergedArea = mergedAreasInRow.find(
        ({ leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) => isInSpan(columnIndex, leftColumnIndex, columnCount),
      );
      let mergeAnchor = mergedArea === undefined ? undefined : mergedAreaAnchors.get(mergedArea);
      if (mergedArea !== undefined && !(mergeAnchor?.rowIndex === rowIndex && mergeAnchor.columnIndex === columnIndex)) continue;
      let area = mergedArea ?? {
        topRowIndex: rowIndex,
        leftColumnIndex: columnIndex,
        rowCount: 1,
        columnCount: 1,
      };
      let cellRect = boxOfCellRange(area, layout);
      let footBorderHidden = hiddenByBorderAtFoot(state, readsNow, layout, area);
      let mergedSpans = mergedArea === undefined ? null : withEndsNotUnderFrozenLines(spansOfArea(mergedArea));
      let mergedBox = mergedSpans === null ? null : drawnBoxOfSpans(mergedSpans, BIG_BOX_MARGIN_PAST_SIGHT);
      let cellBox = mergedSpans === null ? boxInScrolledPane(scroll, cellRect) : mergedBox;
      if (cellBox === null) continue;
      let position = {
        rowIndex: mergedArea?.topRowIndex ?? rowIndex,
        columnIndex: mergedArea?.leftColumnIndex ?? columnIndex,
      };
      let columnId = columnIdByIndex.get(columnIndex);
      let cellId =
        mergedArea === undefined && columnId !== undefined
          ? {
              sheetId: sheetId,
              rowId: rowId,
              columnId: columnId,
            }
          : cellIdAt(position.rowIndex, position.columnIndex);
      let cell = readsNow.cellOf(cellId);
      let { format: format, paints: paints, isTextColorFromRule: isTextColorFromRule } = looks.lookOf(cellId, position);
      let { formula: fixFormula = null, shownWhileItWaits = null } = fixByCellKey.get(cellKeyText(cellId)) ?? {};
      let cellShown =
        fixFormula === null
          ? cellAsShown(cell, format)
          : {
              input: {
                kind: 'text',
                value: fixFormula,
              },
            };
      let isFormulaShown = cellShown !== cell;
      let cellOrSpill = cellShown ?? readsNow.spilledCellOf(cellId);
      let valueSource =
        shownUnderPattern !== null &&
        !isFormulaShown &&
        selectedAreas.some(
          (area2?: Dynamic) =>
            isInSpan(position.rowIndex, area2.topRowIndex, area2.rowCount) &&
            isInSpan(position.columnIndex, area2.leftColumnIndex, area2.columnCount),
        )
          ? withShownUnderPattern(cellOrSpill, shownUnderPattern)
          : cellOrSpill;
      let value = cellValueOf(valueSource);
      let isOfDropdown = format.cellControl.kind === 'dropdown';
      let people = usersOfCell(cell).map((userId?: Dynamic) => chipPersonOf(state.profilesById, userId));
      let [firstPerson = null] = people;
      let { url: linkUrl = null, drawnAs: linkDrawnAs = null } = readCellLink(cellShown, format) ?? {};
      let checkboxState = isCheckboxFormat(format) ? booleanOfValue(value) : null;
      let cellWidth = cellRect.right - cellRect.left;
      let isCheckboxReadOnly = checkboxState !== null && isFormulaCell(readsNow, cellId);
      let hasFilterButton2 = mergedArea === undefined && hasFilterButton(rowIndex, cellId.columnId);
      let filterButtonRoom = hasFilterButton2 && !doesTextOverflowCell(rowIndex, columnIndex) ? filterButtonRoomInCell(cellWidth) : 0;
      let textFlowAsks = {
        isMerged: mergedArea !== undefined,
        isTypedIn: editedCellPosition?.rowIndex === position.rowIndex && editedCellPosition.columnIndex === position.columnIndex,
        isOfDropdown: isOfDropdown,
        hasFilterButton: hasFilterButton2 && filterButtonRoomInCell(cellWidth) > 0,
        isPerson: firstPerson !== null,
        linkDrawnAs: linkDrawnAs,
        isFormulaShown: isFormulaShown,
        isWrappedByFormat: format.alignment.wrap,
        holdsList: listLinesOfCell(cell).length > 0,
        hasRoomToWrap: hasRoomForText(cellWidth, format.font.size),
      };
      let textFlow = cellTextLayout(value, textFlowAsks);
      if (!isInPane && textFlow !== 'overflow') continue;
      let isActive = position.rowIndex === activeArea?.topRowIndex && position.columnIndex === activeArea.leftColumnIndex;
      let opensDropdownList = isOfDropdown && !isReadOnly && dropdownAtCell(readsNow, cellId) !== null;
      let placeholderColor = opensDropdownList && valueSource === null ? NO_COLOR : null;
      let pillColor = cell?.dropdownOption?.color ?? placeholderColor;
      let pill = pillColor === null ? null : dropdownChipColors(paints.fill, pillColor);
      let pillRoom = dropdownChipExtraWidth(pill !== null, opensDropdownList);
      let shownText = shownCellText(
        valueSource,
        charsThatFitWidth(cellWidth - pillRoom - filterButtonRoom, format.font),
        readsNow.decimalSign,
        (text2?: Dynamic) =>
          pillRoom === 0 && readsNow.widthOfCharacters(text2, format.font) > textRoomPastPadding(cellWidth - filterButtonRoom),
      );
      let textColor = isTextColorFromRule ? null : shownText.textColor;
      let text = checkboxState === null ? (firstPerson?.name ?? shownText.text) : '';
      let spokenValue =
        firstPerson === null
          ? cellShownText(valueSource, readsNow.decimalSign)
          : joinPeopleNames(people.map(({ name: name }: Dynamic) => name));
      let spokenText = checkboxState === null ? spokenValue : text;
      let alignment = isFormulaShown ? 'left' : resolvedHorizontalAlignment(format.alignment.horizontal, value);
      let parts = cellTextLinks(cell, format, text, linkUrl).parts;
      let listLines = parts.length === 0 ? NO_LIST_LINES : listLinesOfCell(cell);
      let textReach = textOverflowAround(
        textFlow,
        alignment,
        text,
        cellWidth - listIndentOfLines(listLines, format.font.size),
        format.font.size,
      );
      let blockingColumns = isFormulaShown ? [] : tableEdgeColumns;
      let overflowSpan =
        textReach === NO_TEXT_OVERFLOW
          ? null
          : sameLookSpanOf(columnIndex, format, overflowSpanOf(columnIndex, cellRect, textReach, blockingColumns));
      if (!(isInPane || (overflowSpan !== null && doColumnSpansOverlap(overflowSpan, columnsOfPane) && !isMergedBefore(columnIndex)))) continue;
      let overflowStart =
        overflowSpan !== null && overflowSpan.leftColumnIndex === Math.min(columnIndex, columnsOfPane.leftColumnIndex)
          ? overflowStartOf(columnIndex, format, cellRect, textReach, blockingColumns)
          : null;
      let isOverflowing = overflowSpan !== null && overflowSpan.columnCount > 1;
      let textBox = isOverflowing
        ? boxInScrolledPane(
            scroll,
            boxOfCellRange(
              {
                topRowIndex: rowIndex,
                rowCount: 1,
                ...overflowSpan,
              },
              layout,
            ),
          )
        : cellBox;
      if (keyOfFixPill === cellKeyText(cellId))
        fixPillTexts.push({
          left: textBox.left,
          width: Math.ceil(readsNow.widthOfCharacters(text, format.font)) + CELL_TEXT_PADDING_X,
          room: textBox.width - (isOverflowing ? 0 : pillRoom + filterButtonRoom),
        });
      if (isOverflowing && fixFormula !== null)
        fixTextEnds.set(
          `${rowIndex} ${columnIndex}`,
          Math.min(textBox.left + textBox.width, cellBox.left + Math.ceil(readsNow.widthOfCharacters(text, format.font)) + CELL_TEXT_PADDING_X),
        );
      if (isOverflowing) {
        nextFreeColumn = overflowSpan.leftColumnIndex + overflowSpan.columnCount;
        for (let index: Dynamic = cells.length - 1; index >= 0; index -= 1) {
          let drawnCell = cells[index];
          if (drawnCell === undefined || drawnCell.columnNumber - 1 < overflowSpan.leftColumnIndex) break;
          cells[index] = {
            ...drawnCell,
            hasLineAtRight: false,
          };
        }
      }
      let isHeading = isFilterHeaderArea(area) || isInTableHeader(area);
      let indentToCenter =
        alignment === 'center'
          ? indentToCenterIn(
              mergedSpans?.across ?? {
                start: cellRect.left - scroll.scrollLeft,
                end: cellRect.right - scroll.scrollLeft,
              },
              textBox,
            )
          : 0;
      let looksLikeError = fixFormula === null && showsRealError(cell ?? valueSource);
      let isCellInTable = isInTable(area);
      let cutByViewAt = cellBox.left + cellBox.width - 1 > cellsAreaWidth(state) ? Math.max(0, cellsAreaWidth(state) - cellBox.left) : null;
      let textCutByViewAt =
        cutByViewAt === null && isOverflowing && textBox.left + textBox.width >= cellsAreaWidth(state)
          ? Math.max(0, cellsAreaWidth(state) - textBox.left)
          : null;
      cells.push({
        key: cellId.columnId,
        rowNumber: position.rowIndex + 1,
        rowNumberWritten: rowNumberAsStored(position.rowIndex, ownRowOrder),
        columnNumber: position.columnIndex + 1,
        left: cellBox.left,
        width: cellBox.width,
        top: cellBox.top - (layout.rowEdges.startOf(rowIndex) - rowPane.scroll),
        height: cellBox.height,
        hiddenByBorderAtFoot: footBorderHidden,
        isBehindBars: false,
        mergedFromRowNumber: mergedArea === undefined ? null : position.rowIndex + 1,
        mergedRowCount: mergedArea?.rowCount ?? null,
        mergedColumnCount: mergedArea?.columnCount ?? null,
        hiddenAtLeft: mergedBox === null ? 0 : Math.max(0, mergedBox.showsIn.left - cellBox.left),
        hiddenAtTop: mergedBox === null ? 0 : Math.max(0, mergedBox.showsIn.top - cellBox.top),
        text: text,
        spokenText: spokenText === text ? null : spokenText,
        textColor: textColor === null ? null : textColorNameOf(textColor),
        opensCalendar: !isReadOnly && isCalendarFormat(format, readsNow, cellId),
        isCalendarOpen: isActive && state.calendar !== null,
        pill: pill,
        opensDropdownList: opensDropdownList,
        isDropdownListOpen: isActive && state.dropdown !== null,
        ...(isFormatComingToCell(state, cellId) && {
          comesAtKey: true,
        }),
        opensPeopleList:
          (firstPerson !== null && !isReadOnly && isPeopleCell(readsNow, cellId)) || (isActive && peopleChipsOfListCell(state, readsNow) !== null),
        isPeopleListOpen: isActive && state.peopleList !== null,
        textLeft: textBox.left,
        textWidth: textBox.width,
        isTextWrapped: textFlow === 'wrap',
        areLinesCut: textFlow === 'wrap' && !format.alignment.wrap,
        textLeftInWholeRow: overflowStart === null ? textBox.left : layout.columnEdges.startOf(overflowStart) - scroll.scrollLeft,
        wouldTextWrapIfToldTo:
          textFlow !== 'wrap' &&
          cellTextLayout(value, {
            ...textFlowAsks,
            isWrappedByFormat: true,
          }) === 'wrap',
        alignment: alignment,
        isCutAtEndOnly: value?.kind === 'number' && pillRoom === 0,
        mayTextFade:
          (isCellInTable || textCutByViewAt !== null) &&
          mayCellTextFade(
            {
              text: text,
              format: format,
              textWidth: textBox.width,
              textCutByViewAt: textCutByViewAt,
              indentToCenter: indentToCenter,
              mergedColumnCount: mergedArea?.columnCount ?? null,
              takenAtRight: filterButtonRoom,
              isTextWrapped: textFlow === 'wrap',
              isPerson: firstPerson !== null,
              pill: pill,
              opensDropdownList: opensDropdownList,
              linkDrawnAs: linkDrawnAs,
            },
            readsNow,
          ),
        textCutByViewAt: textCutByViewAt,
        cutByViewAt: cutByViewAt,
        takenAtRight: textFlow === 'wrap' && format.alignment.wrap ? 0 : filterButtonRoom,
        hasTintOfFilterHeader: isFilterHeaderArea(area),
        hasGroundOfFoundHeader: isInTableHeader(area),
        isInTable: isCellInTable,
        isInHand:
          columnsMoving !== null &&
          isInSpan(rowIndex, columnsMoving.area.topRowIndex, columnsMoving.area.rowCount) &&
          isInSpan(columnIndex, columnsMoving.landsAt, columnsMoving.count),
        cornersOfTable: cornersOfTable(area),
        isHeadingOfTable: isHeading,
        hasColorOfHeading: isHeading && !hasFontFormatting(format) && !isCellMarkedForAttention(cellId, area),
        indentToCenter: indentToCenter,
        linesInTextBox: isOverflowing
          ? columnIndexesOfPane
              .filter(
                (columnIndex2?: Dynamic) =>
                  isInSpan(columnIndex2, overflowSpan.leftColumnIndex, overflowSpan.columnCount - 1) && !isColumnLineInTable(rowIndex, columnIndex2),
              )
              .map(
                (columnIndex2?: Dynamic) =>
                  layout.columnEdges.startOf(columnIndex2 + 1) - 1 - layout.columnEdges.startOf(overflowSpan.leftColumnIndex),
              )
          : NO_LINES_IN_TEXT_BOX,
        hasLineAtRight:
          columnIndex >= nextFreeColumn - 1 &&
          (![area.topRowIndex, area.topRowIndex + area.rowCount - 1].every(
            (rowIndex2?: Dynamic) => isColumnLineInTable(rowIndex2, area.leftColumnIndex + area.columnCount - 1),
          ) ||
            isBorderedPastArea(area)),
        format: format,
        isPerson: firstPerson !== null,
        checkbox:
          checkboxState === null
            ? null
            : {
                isChecked: checkboxState,
                ...checkboxMiddleInBox(
                  mergedSpans === null
                    ? cellBox
                    : {
                        left: mergedSpans.across.start,
                        top: mergedSpans.down.start,
                      },
                  cellRect,
                  cellBox,
                  footBorderHidden,
                ),
                canBeChanged: !isReadOnly && !isCheckboxReadOnly,
                isNamedReadOnly: !isReadOnly && isCheckboxReadOnly,
              },
        avatarUrl: firstPerson?.avatarUrl ?? null,
        otherPeople: people.length < 2 ? NO_OTHER_PEOPLE : people.slice(1),
        linkUrl: linkUrl,
        linkDrawnAs: linkDrawnAs,
        linkCellKey: linkDrawnAs === 'words' || parts.length > 0 ? cellKeyText(cellId) : null,
        partsWithLinks: parts,
        listLines: listLines,
        paints: paints,
        frozenBy: rowPane.areFrozen && columnPane.areFrozen ? 'both' : rowPane.areFrozen ? 'row' : columnPane.areFrozen ? 'column' : null,
        isActive: isActive,
        elementId: isActive ? `cell-${cellId.rowId}-${cellId.columnId}` : null,
        isSaidToHaveComment: isActive
          ? commentAtActiveCell(state, readsNow) !== null
          : someAreaHasCell(mergedArea === undefined ? commentAreasInRow : commentAreas, position.rowIndex, position.columnIndex),
        isSelected: someAreaHasCell(selectedAreas, rowIndex, columnIndex),
        isError: fixFormula === null && errorCodeOfCell(cell ?? valueSource) !== null,
        looksLikeError: looksLikeError,
        isErrorMuted: looksLikeError && someAreaHasCell(areasWrittenByAgent, rowIndex, columnIndex),
        isFormulaOfFix: fixFormula !== null,
        shownForFixThatWaits: shownWhileItWaits,
        areKeysForFix: keyOfFixWithKeys === cellKeyText(cellId),
        markOfImport: null,
        markOfImportDelayMs: 0,
      });
    }
    return cells;
  }
  let rows = rowsToDraw.map(({ rowIndex: rowIndex, span: pane }: Dynamic) => {
    let { rowId: rowId } = cellIdAt(rowIndex, 0);
    let top = layout.rowEdges.startOf(rowIndex) - pane.scroll;
    let height = layout.rowEdges.sizeOf(rowIndex);
    let [shownTop, shownHeight] = clipSpanToShown(top, height, pane.showFrom, pane.showTo);
    return {
      key: rowId,
      headerText: String(rowNumberAsStored(rowIndex, ownRowOrder)),
      rowNumber: rowIndex + 1,
      top: top,
      height: height,
      outOfViewAbove: shownTop - top,
      outOfViewBelow: top + height - (shownTop + shownHeight),
      isActive: isRowSelected(rowIndex),
      isFrozen: pane.areFrozen,
      isNumberBehindBars: false,
      isBehindBars: false,
      cells: columnPaneSpans.flatMap((columnPane?: Dynamic) => cellsOfRow(rowIndex, rowId, pane, columnPane)),
    };
  });
  let borderLines = !readsNow.hasBorderLine(sheetId)
    ? NO_BORDER_LINES
    : rowPaneSpans.flatMap(
        (rowPane?: Dynamic) =>
          columnPaneSpans.flatMap((columnPane?: Dynamic) => {
            let paneLeft = -columnPane.scroll - columnPane.showFrom;
            let paneTop = -rowPane.scroll - rowPane.showFrom;
            let rowLimit = rowPane.areFrozen ? rowPane.count : layout.rowCount;
            let columnLimit = columnPane.areFrozen ? columnPane.count : layout.columnCount;
            let lines = buildBorderPaths({
              rows: linesAroundIndexes(shownRowIndicesInPane(rowPane, layout), layout.rowEdges),
              columns: linesAroundIndexes(shownColumnIndicesInPane(columnPane, layout), layout.columnEdges),
              formatAt: ({ rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) =>
                isInSpan(rowIndex, 0, rowLimit) && isInSpan(columnIndex, 0, columnLimit) ? formatAt(rowIndex, columnIndex) : null,
              mergedAreas: mergedAreas,
              leftOfColumn: (columnIndex?: Dynamic) => paneLeft + layout.columnEdges.startOf(columnIndex),
              topOfRow: (rowIndex?: Dynamic) => paneTop + layout.rowEdges.startOf(rowIndex),
            });
            return lines.length === 0
              ? []
              : [
                  {
                    key: `${rowPane.areFrozen} ${columnPane.areFrozen}`,
                    box: paneRect(columnPane, rowPane),
                    lines: lines,
                  },
                ];
          }),
      );
  let activeCellBox = activeArea === null ? null : drawnBoxOfSpans(spansOfArea(activeArea), BIG_BOX_MARGIN_PAST_SIGHT);
  let explainedCell = cellExplained(state, readsNow);
  let explainedArea = explainedCell === null ? null : mergedAreaOrCellOf(readsNow, explainedCell.cellId);
  let selectionBox =
    areaOfSelection === null || (activeArea !== null && isSameArea(areaOfSelection, activeArea) && !hasOtherRanges(state))
      ? null
      : drawnBoxOfSpans(spansOfArea(areaOfSelection));
  let lastColumnsWithText = [
    ...rowIndexes.map(
      (rowIndex?: Dynamic) =>
        lastShownLineWhere(readsNow.columnIndexesOnShowIn(sheetId, rowIndex), layout.columnEdges, (columnIndex?: Dynamic) => {
          let cellId = cellIdAt(rowIndex, columnIndex);
          let value = cellValueOf(readsNow.cellOf(cellId) ?? readsNow.spilledCellOf(cellId));
          return value?.kind !== 'text' || value.value !== '';
        }),
    ),
    ...mergedAreas
      .filter(
        (mergedArea?: Dynamic) =>
          mergedAreaAnchors.get(mergedArea)?.rowIndex !== undefined &&
          readsNow.columnIndexesOnShowIn(sheetId, mergedArea.topRowIndex).includes(mergedArea.leftColumnIndex),
      )
      .map(({ leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) => leftColumnIndex + columnCount - 1),
    ...[
      ...ownFiltersOfSheet(state, sheetId).flatMap((filter?: Dynamic) => areaOfFilteredTable(readsNow, filter) ?? []),
      ...outlinedTables.map(({ area: area }: Dynamic) => area),
    ]
      .filter(
        ({ topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic) =>
          rowIndexes.some((rowIndex?: Dynamic) => isInSpan(rowIndex, topRowIndex, rowCount)),
      )
      .map(({ leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) => leftColumnIndex + columnCount - 1),
  ].filter((columnIndex?: Dynamic) => columnIndex !== null);
  let otherRangeBoxes = (isActiveCellInSheet ? state.otherRanges : []).flatMap((range?: Dynamic) => {
    let area = selectedArea(range, readsNow);
    let box = area === null ? null : drawnBoxOfSpans(spansOfArea(area));
    let { activeCell: activeCell, selectionCorner: selectionCorner } = range;
    let key = `${activeCell.rowId} ${activeCell.columnId} ${selectionCorner.rowId} ${selectionCorner.columnId}`;
    return box === null
      ? []
      : [
          {
            key: key,
            box: box,
          },
        ];
  });
  let columnHeaders = columnPaneSpans.flatMap(
    (columnPane?: Dynamic) =>
      shownColumnIndicesInPane(columnPane, layout).flatMap((columnIndex?: Dynamic) => {
        let columnId = columnIdByIndex.get(columnIndex);
        if (columnId === undefined) return [];
        return [
          {
            key: columnId,
            text: columnLetters(columnIndex),
            columnNumber: columnIndex + 1,
            left: layout.columnEdges.startOf(columnIndex) - columnPane.scroll,
            width: layout.columnEdges.sizeOf(columnIndex),
            isActive: isColumnSelected(columnIndex),
            isFrozen: columnPane.areFrozen,
          },
        ];
      }),
  );
  let dropdownEditor = dropdownEditorOfPane(state);
  let dropdownStretches = dropdownEditor?.stretches ?? [];
  let boxesReachedByEditor = [
    ...(dropdownStretches.length < 2
      ? []
      : dropdownStretches.filter(
          (stretch?: Dynamic, index?: Dynamic) => dropdownEditor?.reach !== 'ownStretch' || index === dropdownEditor.indexOfOwnStretch,
        )
    ).flatMap(({ top: top, bottom: bottom }: Dynamic) => {
      let topPosition = readsNow.positionOfCell({
        sheetId: sheetId,
        rowId: top.r,
        columnId: top.c,
      });
      let bottomPosition = readsNow.positionOfCell({
        sheetId: sheetId,
        rowId: bottom.r,
        columnId: bottom.c,
      });
      if (topPosition === null || bottomPosition === null) return [];
      let area = {
        topRowIndex: topPosition.rowIndex,
        leftColumnIndex: topPosition.columnIndex,
        rowCount: bottomPosition.rowIndex - topPosition.rowIndex + 1,
        columnCount: 1,
      };
      return [drawnBoxOfSpans(spansOfArea(area))].filter((box?: Dynamic) => box !== null);
    }),
    ...areasOfRuleBeingEdited(state, readsNow)
      .map((area?: Dynamic) => drawnBoxOfSpans(spansOfArea(area)))
      .filter((box?: Dynamic) => box !== null),
  ];
  let isFixAwaited = fixCells.some(({ formula: formula }: Dynamic) => formula === null);
  let fixAreas = (fixCells.length === 0 ? [] : fixAreasToDraw(state, readsNow)).flatMap((area?: Dynamic) => {
    let box = drawnBoxOfSpans(spansOfArea(area));
    if (box === null) return [];
    let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount } = area;
    let textEnds = Array.from<Dynamic, Dynamic>(
      {
        length: rowCount,
      },
      (input?: Dynamic, rowOffset?: Dynamic) => {
        let textEnd = fixTextEnds.get(`${topRowIndex + rowOffset} ${leftColumnIndex}`);
        return textEnd === undefined ? 0 : textEnd - box.left;
      },
    );
    let roomToRight = box.showsIn.left + box.showsIn.width + BOX_MARGIN_PAST_SIGHT - box.left;
    return [
      {
        area: area,
        box: {
          ...box,
          width: Math.min(roomToRight, (Math.max as Dynamic)(box.width, ...textEnds)),
        },
      },
    ];
  });
  let marksOfFixes = fixAreas.map(
    ({ area: { key: key }, box: box }: Dynamic) => ({
      key: key,
      box: box,
      isAwaited: isFixAwaited,
    }),
  );
  let fixPillArea = fixPill === null ? null : mergedAreaOrCellOf(readsNow, fixPill.cellId);
  let fixPillCellBox = fixPillArea === null ? null : drawnBoxOfSpans(spansOfArea(fixPillArea));
  let fixAreaOfPill = fixAreas.find(({ area: area }: Dynamic) => fixPillArea !== null && areasOverlap(area, fixPillArea));
  let fixPillBox =
    fixPillCellBox === null
      ? null
      : {
          ...fixPillCellBox,
          width: (fixAreaOfPill?.box ?? fixPillCellBox).width,
        };
  let [firstFixPillText] = fixPillTexts;
  let isFixPillTextWhole =
    fixPillCellBox !== null &&
    firstFixPillText !== undefined &&
    firstFixPillText.width <= firstFixPillText.room &&
    firstFixPillText.left >= fixPillCellBox.showsIn.left &&
    firstFixPillText.left + firstFixPillText.width <= fixPillCellBox.showsIn.left + fixPillCellBox.showsIn.width &&
    fixPillCellBox.top >= fixPillCellBox.showsIn.top &&
    fixPillCellBox.top + fixPillCellBox.height <= Math.min(fixPillCellBox.showsIn.top + fixPillCellBox.showsIn.height, cellsHeightAboveFloats(state));
  let entryCellId = activeAnchorCell(state, readsNow);
  let spill = isActiveCellInSheet ? spillOutlineOfEntry(state, readsNow, entryCellId) : null;
  let tableOfSpill = spill?.kind === 'fills' ? tableAreaOfFilledBody(spill.area, outlinedTables, state, readsNow) : null;
  let spillBox = spill === null || tableOfSpill !== null ? null : drawnBoxOfSpans(spansOfArea(spill.area));
  let referenceMarks = new (Map as Dynamic)();
  let { stage: formulaFromWords } = state.formulaFromWords;
  let arrivingFormula = formulaFromWords?.kind === 'proposed' && formulaFromWords.isArriving ? formulaFromWords : null;
  for (let reference of state.referencesInEntry as Dynamic) {
    let { sheetId: refSheetIdOrHue, area: refAreaOrKey, hue: refHueOrBox } = reference;
    if (reference.pieces !== undefined) {
      for (let piece of (refSheetIdOrHue === sheetId ? reference.pieces : []) as Dynamic) {
        let pieceBox = drawnBoxOfSpans(spansOfArea(piece));
        if (pieceBox === null) continue;
        let pieceKey = areaToA1AsStored(piece, null);
        if (!referenceMarks.has(pieceKey))
          referenceMarks.set(pieceKey, {
            cells: pieceKey,
            box: pieceBox,
            hue: refHueOrBox,
            leavesTextAsItIs: false,
            arrivesAtPart: null,
          });
      }
      continue;
    }
    let refKey = areaToA1AsStored(refAreaOrKey, null);
    if (refSheetIdOrHue !== sheetId || referenceMarks.has(refKey)) continue;
    let isOneCell = refAreaOrKey.rowCount === 1 && refAreaOrKey.columnCount === 1;
    let position = {
      rowIndex: refAreaOrKey.topRowIndex,
      columnIndex: refAreaOrKey.leftColumnIndex,
    };
    let areaShown = (isOneCell ? readsNow.mergedAreaAt(sheetId, position) : null) ?? refAreaOrKey;
    let refBox = drawnBoxOfSpans(spansOfArea(areaShown));
    let leavesTextAsItIs = reference.isNamedInWords === true;
    let arrivesAtPart = arrivingFormula?.lightsAtPart[refKey] ?? null;
    if (refBox !== null)
      referenceMarks.set(refKey, {
        cells: refKey,
        box: refBox,
        hue: refHueOrBox,
        leavesTextAsItIs: leavesTextAsItIs,
        arrivesAtPart: arrivesAtPart,
      });
  }
  for (let { area: reference, hue: refSheetIdOrHue } of (state.referencesInEntry.length > 0
    ? []
    : selectedChartInputAreas(state, readsNow)) as Dynamic) {
    let [refAreaOrKey, refHueOrBox] = [areaToA1AsStored(reference, null), drawnBoxOfSpans(spansOfArea(reference))];
    if (refHueOrBox !== null && !referenceMarks.has(refAreaOrKey))
      referenceMarks.set(refAreaOrKey, {
        cells: refAreaOrKey,
        box: refHueOrBox,
        hue: refSheetIdOrHue,
        leavesTextAsItIs: true,
        arrivesAtPart: null,
      });
  }
  let stuckHeaders = stuckHeadersOfView(state, readsNow, layout, shift?.y);
  let tableOutlineOf = (area?: Dynamic) => {
    let box = drawnBoxOfSpans(spansOfArea(area));
    if (box === null) return null;
    let stuckHeader = stuckHeaders.find(
      (stuckHeader2?: Dynamic) => stuckHeader2.firstRowIndex === area.topRowIndex && stuckHeader2.firstColumnIndex === area.leftColumnIndex,
    );
    if (stuckHeader === undefined)
      return {
        ...box,
        overHeader: null,
      };
    let { top: shownTop } = box.showsIn;
    return {
      ...box,
      top: shownTop,
      height: box.top + box.height - shownTop,
      overHeader: stuckHeader.key,
    };
  };
  let chartAreaStart = startOfAreaToChart(state, readsNow);
  let tableOutlineOfSpill = tableOfSpill === null ? null : tableOutlineOf(tableOfSpill);
  let flagRoomOf = (area?: Dynamic) => {
    let { left: left, top: top, right: right, bottom: bottom } = boxOfCellRange(area, layout);
    let position = {
      rowIndex: area.topRowIndex,
      columnIndex: area.leftColumnIndex,
    };
    return {
      roomAbove: top < frozenRowsHeight(layout) ? top : top - frozenRowsHeight(layout),
      isOneCell: isSameArea(area, readsNow.mergedAreaAt(sheetId, position) ?? areaOfPosition(position)),
      widthOfAll: right - left,
      heightOfAll: bottom - top,
      heightCovered: stuckHeadersBottom(area, stuckHeaders),
    };
  };
  let boxWithFlagRoom = ({ across: across, down: down }: Dynamic) => {
    let [showFrom, showTo] = [down.showFrom - FLAG_HEIGHT, down.showTo + FLAG_HEIGHT];
    let box = drawnBoxOfSpans({
      across: across,
      down: {
        ...down,
        showFrom: showFrom,
        showTo: showTo,
      },
    });
    return box === null
      ? null
      : {
          ...box,
          showsIn: paneRect(across, down),
        };
  };
  let reachingBoxOf =
    (boxOfSpans?: Dynamic) =>
    (area?: Dynamic) => {
      let { across: across, down: down } = spansOfArea(area);
      let box = boxOfSpans({
        across: paneWithExtraReach(across, columnReach),
        down: paneWithExtraReach(down, rowReach),
      });
      return box === null
        ? null
        : {
            ...box,
            showsIn: paneRect(across, down),
          };
    };
  let [flagBoxReaching, drawnBoxReaching] = [reachingBoxOf(boxWithFlagRoom), reachingBoxOf(drawnBoxOfSpans)];
  let selectedAreaOf = (cells?: Dynamic) => (cells.activeCell.sheetId === sheetId ? selectedAreaAsSeen(cells, readsNow) : null);
  let commentBoxOf = (cells?: Dynamic) => {
    let area = selectedAreaOf(cells);
    let box = area === null ? null : drawnBoxOfSpans(spansOfArea(area));
    return box === null || box.height === 0 ? null : box;
  };
  let marksOfComments = (state.comments ?? []).flatMap(
    ({ handle: handle, cells: cells, isResolved: isResolved, isOpen: isOpen }: Dynamic) => {
      let box = isResolved && !isOpen ? null : commentBoxOf(cells);
      if (box === null) return [];
      let endsAt = (area?: Dynamic) => doesCommentEndAtSelectionCorner(cells, area, state, readsNow, layout);
      let endsAtActiveCell = endsAt(activeArea) ? 'activeCell' : null;
      let endsWith = endsAt(areaOfSelection) ? 'selection' : endsAtActiveCell;
      let isPointedAt = state.commentsPointedAt.includes(handle);
      let isWithAgent = isCommentWithAgent(state, handle);
      return [
        {
          ...box,
          key: handle,
          isOpen: isOpen,
          isPointedAt: isPointedAt,
          isWithAgent: isWithAgent,
          endsWith: endsWith,
        },
      ];
    },
  );
  let wouldCommentBeInTheWay =
    isExplainingBlocked({
      ...state,
      isSteppedOutOfCells: false,
    }) || state.newCommentOn !== null;
  let fillHandle = fillHandleBox(state, readsNow, isReadOnly);
  let isSelectionInOpenComment = [
    ...(state.newCommentOn === null ? [] : [state.newCommentOn]),
    ...(state.comments ?? []).flatMap((comment?: Dynamic) => (isCommentMarkedOnGrid(state, comment) ? [comment.cells] : [])),
  ].some((cells?: Dynamic) => {
    let area = selectedAreaOf(cells);
    return areaOfSelection !== null && area !== null && isSameArea(unionOfAreas(areaOfSelection, area), area);
  });
  let selectionsOfOthers = state.selectionsOfOthers.flatMap((selectionOfOther?: Dynamic) => {
    let { tabKey: tabKey, userId: userId, selection: selection, movedAtMs: movedAtMs } = selectionOfOther;
    if (selection.activeCell.sheetId !== sheetId) return [];
    let area = selectedAreaAsSeen(selection, readsNow);
    let box = area === null ? null : boxWithFlagRoom(spansOfArea(area));
    let flagLook = box === null ? null : peerFlagLook(selectionOfOther, state.profilesById);
    if (area === null || box === null || flagLook === null) return [];
    let isUnderOwnOutline = activeArea !== null && isSameArea(area, activeArea);
    return [
      {
        key: tabKey,
        userId: userId,
        box: box,
        ...flagRoomOf(area),
        movedAtMs: movedAtMs,
        isUnderOwnOutline: isUnderOwnOutline,
        ...flagLook,
      },
    ];
  });
  let marksOfChangesByAgent = state.changesByAgent
    .filter(({ isOfLayoutAlone: isOfLayoutAlone }: Dynamic) => isOfLayoutAlone !== true)
    .flatMap(
      ({
        revision: revision,
        group: group,
        cells: cells,
        fadeBeginsAtMs: fadeBeginsAtMs,
        joinedWith: joinedWith,
        stoodAsOneMark: stoodAsOneMark,
        isOfWholeLines: isOfWholeLines,
      }: Dynamic) => {
        if (cells.activeCell.sheetId !== sheetId) return [];
        let ownArea = cachedSelectedArea(cells, readsNow);
        let joinedArea = areaCoveringChanges(joinedWith, readsNow);
        let area = ownArea === null || joinedArea === null ? (ownArea ?? joinedArea) : unionOfAreas(ownArea, joinedArea);
        let box = area === null ? null : flagBoxReaching(area);
        if (area === null || box === null) return [];
        let ownBox = ownArea === null ? null : drawnBoxReaching(ownArea);
        let grewFrom = joinedArea === null ? null : stoodAsOneMark ? flagBoxReaching(joinedArea) : box;
        let joinedRevisions = joinedWith.map((joined?: Dynamic) => joined.revision);
        let key = `${revision} ${group}`;
        let withFlags = flagRoomOf(area);
        return [
          {
            key: key,
            revision: revision,
            fadeBeginsAtMs: fadeBeginsAtMs,
            box: box,
            all: area,
            withFlags: withFlags,
            area: ownArea ?? area,
            isOfWholeLines: isOfWholeLines,
            isOfPlaceShown: false,
            ownBox: ownBox,
            grewFrom: grewFrom,
            joinedRevisions: joinedRevisions,
          },
        ];
      },
    );
  let revisionDropped = marksOfChangesByAgent.at(-MAX_CHANGE_GROUPS_APART - 1)?.revision;
  let recentMarks = marksOfChangesByAgent
    .slice(-MAX_CHANGE_GROUPS_APART)
    .filter(({ revision: revision }: Dynamic) => revision !== revisionDropped);
  let agentShownCells = cellsShownByAgent(state);
  let shownArea = agentShownCells?.activeCell.sheetId === sheetId ? cachedSelectedArea(agentShownCells, readsNow) : null;
  let shownBox = shownArea === null ? null : flagBoxReaching(shownArea);
  let marksOnChangesByAgent =
    agentShownCells === null || shownArea === null || shownBox === null
      ? recentMarks
      : [
          ...recentMarks,
          {
            key: 'shown',
            revision: 0,
            fadeBeginsAtMs: null,
            box: shownBox,
            all: shownArea,
            withFlags: flagRoomOf(shownArea),
            area: shownArea,
            isOfWholeLines: changesSpanWholeLines(
              [
                {
                  cells: agentShownCells,
                },
              ],
              readsNow,
            ),
            isOfPlaceShown: true,
            ownBox: null,
            grewFrom: null,
            joinedRevisions: [],
          },
        ];
  let copiedArea = state.copiedCells?.activeCell.sheetId === sheetId ? selectedArea(state.copiedCells, readsNow) : null;
  let outlinesOfOthers = [...selectionsOfOthers];
  outlinesOfOthers.reverse();
  let lineResize = lineResizeOfView(state, readsNow);
  let heldEdgeAt =
    lineResize === null
      ? null
      : lineResize.isA === 'row'
        ? resizedRowEndOnScreen(lineResize, state, layout, state)
        : resizedColumnEndOnScreen(lineResize, state, layout, state);
  let areGripsShown = !isReadOnly && state.mode.kind !== 'editing';
  let dropIndexOfMovingLines = movingLinesDropIndex(state, readsNow);
  let landingLine =
    dropIndexOfMovingLines === null || state.dragging?.kind !== 'movingLines'
      ? null
      : state.dragging.what === 'rows'
        ? {
            between: 'rows',
            offset: rowEdgeOnScreen(dropIndexOfMovingLines, state, layout, state),
          }
        : {
            between: 'columns',
            offset: columnEdgeOnScreen(dropIndexOfMovingLines, state, layout, state),
          };
  let entryPosition = readsNow.positionOfCell(entryCellId);
  let entryLooks =
    entryCellId.sheetId === sheetId ? looks : drawnFormatsOf(readsNow, entryCellId.sheetId, readsNow.formatsGivenIn(entryCellId.sheetId));
  let { format: entryFormat, paints: entryPaints } =
    entryPosition === null
      ? {
          format: readsNow.formatOf(entryCellId),
          paints: cellColorsOfFormat(readsNow.formatOf(entryCellId)),
        }
      : entryLooks.lookOf(entryCellId, entryPosition);
  let entryLooksOfMode = entryLooksOf(state.mode);
  let entryFormatWith = (marks?: Dynamic) =>
    entryLooks.formatOver(withFontMarks(readsNow.formatOf(entryCellId), marks), entryCellId);
  let entryCellFormat = entryLooksOfMode === undefined ? entryFormat : entryFormatWith([]);
  let isExpanded = isEntryExpanded(state.mode);
  let editorFormat = isExpanded
    ? {
        ...entryCellFormat,
        alignment: {
          ...entryCellFormat.alignment,
          vertical: 'top',
        },
      }
    : entryCellFormat;
  let editorPaints = isExpanded ? NO_CELL_COLORS : entryPaints;
  let editorFormatWithLooks =
    entryLooksOfMode === undefined
      ? entryFormat
      : entryFormatWith(
          fontMarksWhere((mark?: Dynamic) => entryLooksOfMode.stretches.some(({ marks: marks }: Dynamic) => marks.includes(mark))),
        );
  let pageSize = {
    width: body.width,
    height: cellsHeightAboveFloats(state),
  };
  let placeFlag = (box?: Dynamic, area?: Dynamic, withFlags?: Dynamic) => {
    let placeAt = (flagBox?: Dynamic) =>
      placeSelectionFlag(
        flagBox,
        {
          ...withFlags,
          flagWidth: AGENT_FLAG_WIDTH,
        },
        pageSize.height,
        frozenRowsHeight(layout),
      );
    if (shift === null) return placeAt(box);
    let scrolledOn = {
      scrollLeft: state.scrollLeft + shift.x,
      scrollTop: state.scrollTop + shift.y,
    };
    let [spansNow, spansOnArrival] = [spansOfArea(area), rangeSpansOnScreen(area, scrolledOn, layout, state)];
    let boxOnArrival = boxWithFlagRoom(spansOnArrival);
    let placed = boxOnArrival === null ? null : placeAt(boxOnArrival);
    if (placed === null) return placeAt(box);
    let left = placed.box.left + spansNow.across.start - spansOnArrival.across.start;
    let top = placed.box.top + spansNow.down.start - spansOnArrival.down.start;
    return {
      ...placed,
      box: {
        ...placed.box,
        left: left,
        top: top,
      },
    };
  };
  let clearPageSize = {
    width: body.width,
    height: cellsHeightAboveFloats(withRoomUnderNoticesAtFoot(state, readsNow)),
  };
  let editorScale = editorScaleOf(state, readsNow, editorFormat.font.size);
  let editorTextInsets = editorTextInsetsImported(
    (activeCellBox?.height ?? 0) / editorScale,
    editorFormat.font.size,
    state.density,
    activeArea === null ? 0 : hiddenByBorderAtFoot(state, readsNow, layout, activeArea),
  );
  let areWordsOffered = !isReadOnly && wordsOfferedNow(state) !== null;
  let isExpandOfferedInEntry = !isReadOnly && !areWordsOffered && isExpandOfferedInEntryImported(state, readsNow);
  let expandButtonRoom = isExpandOfferedInEntry ? EXPAND_BUTTON_ROOM : 0;
  let editorKeepsClear = isExpanded
    ? EXPANDED_ENTRY_PADDING
    : {
        ...editorTextInsets,
        right: editorTextInsets.right + expandButtonRoom,
      };
  let expandedLayout =
    state.mode.kind === 'editing' && isExpanded && activeArea !== null
      ? expandedEntryLayout(
          state.mode,
          activeCellBox ?? editorBoxOfSpans(spansOfArea(activeArea)),
          clearPageSize,
          editorFormatWithLooks.font,
          readsNow,
        )
      : null;
  let {
    editorBox: editorBox,
    editorLineCount: editorLineCount,
    editorFoldsAt: editorFoldsAt,
  } = expandedLayout !== null
    ? {
        editorBox: {
          ...expandedLayout.text,
          showsIn: {
            left: 0,
            top: 0,
            ...clearPageSize,
          },
        },
        editorLineCount: expandedLayout.lineCount,
        editorFoldsAt: {
          width: expandedLayout.text.width,
          isLineFolded: true,
        },
      }
    : state.mode.kind === 'editing' && activeCellBox !== null
      ? editorLayoutOf(
          state.mode,
          activeCellBox,
          clearPageSize,
          editorFormatWithLooks,
          editorKeepsClear,
          readsNow,
          areWordsOffered,
          editorScale,
          state.isOnPhone && state.isNarrowByTouch,
          expandButtonRoom,
          proposedFixesOf(state.formulaFromWords).map(({ formula: formula }: Dynamic) => formula),
        )
      : NO_EDITOR_LAYOUT;
  let isEditorAComboBox =
    dropdownAtActiveCell(state, readsNow) !== null || isTimeCell(readsNow, activeAnchorCell(state, readsNow)) || isEntryAmongPeople(state, readsNow);
  let addRowsControl = addRowsControlBox(state, layout, isReadOnly);
  let roomForSummary =
    addRowsControl === null
      ? pageSize
      : {
          ...pageSize,
          height: Math.min(pageSize.height, addRowsControl.top),
        };
  let summaryPlace = selectionSummary === null || selectionBox === null ? null : selectionSummaryPlace(selectionBox, roomForSummary);
  let fillArea = fillAreaOfDrag(state, readsNow);
  let landingAreaOfCells = landingAreaOfMovingCells(state, readsNow);
  let explainedCellBoxUnclipped = explainedArea === null ? null : drawnBoxOfSpans(spansOfArea(explainedArea));
  let offeredErrors = isReadOnly ? null : errorsOfferShown(state, readsNow);
  let lastErrorArea = offeredErrors === null ? null : mergedAreaOrCellOf(readsNow, offeredErrors.endOfTable ?? offeredErrors.last);
  let firstErrorArea = offeredErrors === null ? null : mergedAreaOrCellOf(readsNow, offeredErrors.firstWithAnError);
  let errorsOfferArea = firstErrorArea === null || lastErrorArea === null ? lastErrorArea : unionOfAreas(firstErrorArea, lastErrorArea);
  let wholeInViewRect = {
    left: state.scrollLeft === 0 ? 0 : frozenColumnsWidth(layout),
    top:
      (state.scrollTop === 0 ? 0 : frozenRowsHeight(layout)) +
      (Math.max as Dynamic)(0, ...stuckHeaders.map((stuckHeader?: Dynamic) => stuckHeader.top + stuckHeader.height - stuckHeader.showFrom)),
    right: roomForSummary.width,
    bottom: roomForSummary.height,
  };
  let { stage: fixesStage } = state.fixesOnCells;
  let fixCellsAsked = fixesStage?.isOfSelection === true ? fixesStage.asked : null;
  let isFixBoxAt = (left?: Dynamic, top?: Dynamic) =>
    fixAreas.some(({ box: box }: Dynamic) => left === box.left && top >= box.top && top < box.top + box.height);
  let cellBoxesForOffer =
    lastErrorArea === null && explainedArea === null
      ? []
      : rows.flatMap(
          (row?: Dynamic) =>
            row.cells
              .filter(({ text: text, pill: pill, checkbox: checkbox }: Dynamic) => text !== '' || pill !== null || checkbox !== null)
              .flatMap((cell?: Dynamic) => {
                let { left: left, width: width, height: height, frozenBy: frozenBy } = cell;
                let isInError = cell.looksLikeError || cell.isFormulaOfFix;
                let top = row.top + cell.top;
                let cellBox = {
                  left: left,
                  top: top,
                  width: width,
                  height: height,
                  isInError: isInError,
                  isOfOffer: isInError && cell.text !== '#N/A' && (fixCellsAsked === null || isFixBoxAt(left, top)),
                  isWholeInView:
                    (frozenBy === 'column' || frozenBy === 'both' || wholeInViewRect.left <= left) &&
                    (frozenBy === 'row' || frozenBy === 'both' || wholeInViewRect.top <= top) &&
                    left + width <= wholeInViewRect.right &&
                    top + height <= wholeInViewRect.bottom,
                };
                let textBox = {
                  ...cellBox,
                  left: cell.textLeft,
                  width: cell.textWidth,
                  isInError: false,
                  isOfOffer: false,
                  ...(isInError && {
                    runsOnFromError: true,
                  }),
                };
                return cell.textWidth > width ? [cellBox, textBox] : [cellBox];
              }),
        );
  let placedViews = placedViewsToDraw(state, readsNow, isReadOnly);
  let placedViewBoxes = placedViews.flatMap(({ box: box, isInView: isInView }: Dynamic) => (isInView ? [clipBoxToShown(box)] : []));
  let errorsOfferCornerOf = (explainedCard?: Dynamic) => {
    let lastArea = offeredErrors === null ? null : mergedAreaOrCellOf(readsNow, offeredErrors.last);
    let askedAreas = (fixCellsAsked ?? []).flatMap((cellId?: Dynamic) => mergedAreaOrCellOf(readsNow, cellId) ?? []);
    let firstArea = askedAreas[0] ?? firstErrorArea;
    if (firstArea === null || lastArea === null) return null;
    return errorsOfferCornerPlace(
      wholeInViewRect,
      {
        areMoreBelow:
          (fixCellsAsked === null
            ? Math.min(spansOfArea(lastArea).down.end, lastErrorArea === null ? 1 / 0 : spansOfArea(lastErrorArea).down.end)
            : (Math.max as Dynamic)(...askedAreas.map((area?: Dynamic) => spansOfArea(area).down.end))) > wholeInViewRect.bottom,
        leftOfFirst: spansOfArea(firstArea).across.start,
        rightOfFixes: (Math.max as Dynamic)(0, ...fixAreas.map(({ box: box }: Dynamic) => box.left + box.width)),
      },
      state.zoom,
      explainedCard,
      cellBoxesForOffer,
      placedViewBoxes,
    );
  };
  let cornerOfErrorsOffered =
    errorsOfferCornerOf(activeCellBox) ??
    (state.fixesOnCells.stage === null
      ? null
      : (errorsOfferCornerOf(null) ??
        (offeredErrors === null
          ? null
          : {
              left: wholeInViewRect.left,
              top: 0,
            })));
  let isFixPillOnLeft =
    cornerOfErrorsOffered !== null &&
    fixPillBox !== null &&
    fixPillBox.left + fixPillBox.width < cornerOfErrorsOffered.left + ERRORS_OFFER_WIDTH / state.zoom &&
    cornerOfErrorsOffered.left < fixPillBox.left + fixPillBox.width + FIX_PILL_REACH / state.zoom &&
    fixPillBox.left < cornerOfErrorsOffered.left &&
    fixPillBox.top - (isFixPillTextWhole ? 0 : FIX_PILL_ROOM_ABOVE / state.zoom) < cornerOfErrorsOffered.top + ERRORS_OFFER_HEIGHT / state.zoom &&
    cornerOfErrorsOffered.top < fixPillBox.top + fixPillBox.height;
  let explainedRect = explainedArea === null ? null : rectOfSpans(spansOfArea(explainedArea));
  let sideOfExplainedCell =
    explainedRect === null ? 'right' : (sideForExplainedCard(explainedRect, roomForSummary, state.zoom, cellBoxesForOffer) ?? 'under');
  let offersAtSelection =
    areaOfSelection !== null && (selectionBox ?? activeCellBox) !== null && mayOfferAtSelection(state, readsNow, explainedCell);
  let isSingleCellSelected = offersAtSelection && isAreaJustActiveCell(state, readsNow, areaOfSelection);
  let activeDrawnCell =
    !isReadOnly && areaOfSelection !== null && isChosenCellAlone(state, readsNow, areaOfSelection)
      ? rows
          .find(({ cells: cells }: Dynamic) => cells.some(({ isActive: isActive }: Dynamic) => isActive))
          ?.cells.find(({ isActive: isActive }: Dynamic) => isActive)
      : undefined;
  let endOfTextCut =
    activeDrawnCell?.wouldTextWrapIfToldTo === true
      ? endOfWrappedTextIfCut(activeDrawnCell, readsNow)
      : activeDrawnCell?.areLinesCut === true && areCellLinesCut(state.activeCell, layout, readsNow)
        ? activeDrawnCell.textLeft + activeDrawnCell.textWidth
        : null;
  let endOfCutText = isSingleCellSelected ? endOfTextCut : null;
  let isExpandOfferedAtCell =
    activeDrawnCell !== undefined &&
    isExpandOfferedAtActiveCell(state, readsNow) &&
    (endOfTextCut !== null || hasCellSeveralLines(state.activeCell, layout, readsNow));
  let offerPlaceBeside = (side?: Dynamic) => {
    let place = !offersAtSelection
      ? null
      : placeOfSelectionOffer(spansOfArea(areaOfSelection), roomForSummary, state.zoom, {
          side: side,
          endOfCutText: endOfCutText,
        });
    return place !== null && isSelectionOfferCovered(place, placedViewBoxes, state.zoom, side) ? null : place;
  };
  let explainedCellBox = explainedCellBoxUnclipped === null ? null : clipBoxToShown(explainedCellBoxUnclipped);
  let explainedTop = explainedCell?.link?.box.y ?? (explainedCellBox === null ? null : body.top + explainedCellBox.top);
  let roomAboveExplainedCell = explainedTop === null ? 0 : Math.max(0, explainedTop - Math.max(body.top, roomAboveGridForFind(state)));
  let selectionSummaryView =
    selectionSummary === null || summaryPlace === null || state.menu !== null
      ? null
      : {
          summary: selectionSummary,
          opensMenu: !isReadOnly && isSumWithFormulaCell(selectionSummary),
          ...summaryPlace,
        };
  return {
    body: body,
    yetToGlide: shift,
    density: state.density,
    rowCount: layout.rowCount,
    columnCount: layout.columnCount,
    ownRowOrder: ownRowOrder,
    columnHeaders: columnHeaders,
    columnEdgeGrips: (areGripsShown ? columnHeaders : []).flatMap(({ key: key, columnNumber: columnNumber }: Dynamic) => {
      let grip = columnResizeGrip(columnNumber - 1, state, layout);
      if (grip === null) return [];
      let { start: start, end: end, edge: edge } = grip;
      let isOfFrozen = columnNumber <= layout.frozenColumnCount;
      return [
        {
          key: key,
          isOfFrozen: isOfFrozen,
          left: start,
          width: end - start,
          edgeFromLeft: edge - start,
        },
      ];
    }),
    gripOfColumnsForFingerAt: lineResize?.isByFinger === true ? heldEdgeAt : (lastShownColumnEdge(state, readsNow, isReadOnly)?.edge ?? null),
    rowEdgeGrips: (areGripsShown ? rows : []).flatMap(({ key: key, rowNumber: rowNumber }: Dynamic) => {
      let grip = rowResizeGrip(rowNumber - 1, state, layout);
      return grip === null || isRowUnderStuckHeader(rowNumber - 1, state, readsNow, layout)
        ? []
        : [
            {
              key: key,
              isOfFrozen: rowNumber <= layout.frozenRowCount,
              top: grip.start,
              height: grip.end - grip.start,
              edgeFromTop: grip.edge - grip.start,
            },
          ];
    }),
    edgeHeldOf: state.dragging?.kind === 'resizing' ? state.dragging.line.isA : null,
    heldEdgeIsOf: lineResize?.isA ?? null,
    heldEdgeAt: heldEdgeAt,
    linesToTakeHoldOf:
      areGripsShown && (isIdleOrTapping(state) || state.dragging?.kind === 'movingLines')
        ? (selectedWholeLines(state, readsNow)?.what ?? null)
        : null,
    areLinesDragged: state.dragging?.kind === 'movingLines' && state.dragging.landing !== null,
    landingLine:
      landingLine === null || landingLine.offset === null
        ? null
        : {
            between: landingLine.between,
            offset: landingLine.offset,
          },
    rows: markImportedCells(rows, state),
    endOfFrozenRows:
      layout.frozenRowCount === 0
        ? null
        : {
            at: frozenRowsHeight(layout),
            length: Math.min(cellsAreaWidth(state), Math.max(frozenColumnsWidth(layout), columnsEndOnScreen(state, layout))),
            isOverCells: state.scrollTop > 0,
          },
    endOfFrozenColumns:
      layout.frozenColumnCount === 0
        ? null
        : {
            at: frozenColumnsWidth(layout),
            length: Math.min(cellsAreaHeight(state), Math.max(frozenRowsHeight(layout), rowsEndOnScreen(state, layout))),
            isOverCells: state.scrollLeft > 0,
          },
    areGridlinesHidden: sheetOfView(state, readsNow)?.areGridlinesHidden === true,
    filterButtons: filterButtonsInView(state, readsNow, stuckHeaders, (rowIndex?: Dynamic, columnIndex?: Dynamic) => {
      let format = formatAt(rowIndex, columnIndex);
      let mergedArea = readsNow.mergedAreaAt(sheetId, {
        rowIndex: rowIndex,
        columnIndex: columnIndex,
      });
      let position =
        mergedArea === null
          ? {
              rowIndex: rowIndex,
              columnIndex: columnIndex,
            }
          : {
              rowIndex: mergedArea.topRowIndex,
              columnIndex: mergedArea.leftColumnIndex,
            };
      let { fill: fill } = looks.lookOf(cellIdAt(position.rowIndex, position.columnIndex), position).paints;
      let doesTextOverflow = doesTextOverflowCell(rowIndex, columnIndex);
      let hasGround = format.alignment.wrap || mergedArea !== null || doesTextOverflow;
      let area = mergedArea ?? {
        topRowIndex: rowIndex,
        rowCount: 1,
        leftColumnIndex: columnIndex,
        columnCount: 1,
      };
      return {
        text: {
          fontSizeInPoints: format.font.size,
          isAt: format.alignment.vertical,
          hiddenByBorderAtFoot: hiddenByBorderAtFoot(state, readsNow, layout, area),
        },
        ink: defaultTextColorsOnFill(fill),
        ground: hasGround ? (fill ?? headerGroundOf(area)) : null,
        groundOverText: fill ?? headerGroundOf(area),
        givesWayToText: doesTextOverflow,
        isInActiveCell: activeArea?.topRowIndex === rowIndex && activeArea.leftColumnIndex === columnIndex,
        atRest: fill === null ? null : contrastingShades(fill),
      };
    }),
    filteredTableOutlines: filteredTableOutlines(state, readsNow),
    filteredTablesDrawn: drawnOwnFiltersOfSheet(state, sheetId),
    outlineOfFilterNotDrawnYet: outlineOfFilterNotDrawnYet(state, readsNow),
    foundTableOutlines: foundTableOutlines(state, readsNow, outlinedTables),
    seamsOfOwnFilters: ownFilterSeamPositions(state, layout, rowsHiddenByOwnFilters(state, readsNow, sheetId)),
    seams: {
      rows: hiddenLineSeamPositions(state, layout, 'rows'),
      columns: hiddenLineSeamPositions(state, layout, 'columns'),
    },
    pagesTurnedForReader: state.pagesTurnedForReader,
    scroll: {
      rows: {
        by: state.scrollTop,
        most: maxScrollWithFloats(layout, state).scrollTop,
        from: frozenRowsHeight(layout),
        to: cellsAreaHeight(state),
        room: cellsHeightAboveFloats(state) - frozenRowsHeight(layout),
      },
      columns: {
        by: state.scrollLeft,
        most: maxScrollWithFloats(layout, state).scrollLeft,
        from: frozenColumnsWidth(layout),
        to: cellsAreaWidth(state),
        room: cellsAreaWidth(state) - frozenColumnsWidth(layout),
      },
    },
    isMoreToTheRight: lastColumnsWithText.some(
      (columnIndex?: Dynamic) => columnEndOnScreen(columnIndex, state, layout) > cellsAreaWidth(state),
    ),
    freezeBars: areGripsShown
      ? {
          rows: startAndSizeOf(rowFreezeGripSpan(layout)),
          columns: startAndSizeOf(columnFreezeGripSpan(layout)),
        }
      : null,
    freezeBarHeld: state.dragging?.kind === 'freezing' ? state.dragging.what : null,
    placedViews: placedViews,
    chartBeingMade: shownChartBeingMade(state, readsNow, placedViews),
    placedViewHeldBy: state.dragging?.kind === 'movingPlacedView' ? 'all' : state.dragging?.kind === 'sizingPlacedView' ? state.dragging.sides : null,
    borderLines: borderLines,
    activeCellBox: activeCellBox,
    selectionBox: selectionBox,
    isSelectionJustImported: state.isSelectionJustImported,
    isSelectionInOpenComment: isSelectionInOpenComment,
    otherRangeBoxes: otherRangeBoxes,
    copiedCellsBox: copiedArea === null ? null : drawnBoxOfSpans(spansOfArea(copiedArea)),
    fillHandleBox: fillHandle,
    isFlagInSquareOfFillHandle: fillHandle !== null && marksOfComments.some(({ endsWith: endsWith }: Dynamic) => endsWith === 'selection'),
    offersAtSelection: !offersAtSelection
      ? null
      : {
          nthSelection: state.offersAtSelection.nthSelection,
          cells: areaToA1AsStored(areaOfSelection, ownRowOrderOfSheet(readsNow, state.sheetId)),
          isOneCell: isSingleCellSelected,
          isTextCutOff: endOfCutText !== null,
          comes: state.offersAtSelection.areCellsSelectedByPointer ? 'atOnce' : 'afterRest',
          beside: offerPlaceBeside('full'),
          besideIfShort: isSingleCellSelected ? offerPlaceBeside('short') : null,
        },
    fillPreviewBox: fillArea === null ? null : drawnBoxOfSpans(spansOfArea(fillArea)),
    isFillHandleHeld: state.dragging?.kind === 'filling',
    edgesToMoveCellsBy: moveGrabStrips(state, readsNow, isReadOnly, outlinedTables),
    handlesOfTables: canCommentModePickNow(state) ? [] : tableHandles(outlinedTables, state, readsNow, isReadOnly),
    headingsOfColumns: canCommentModePickNow(state) ? [] : columnGripsOfTables(state, readsNow, isReadOnly),
    areColumnsDrawnAsLanded: columnsMove !== null,
    columnsRiding:
      columnsMoving === null
        ? null
        : columnsRidingOf(state, reads, columnsMoving, {
            rows: rows,
            sheet: layout,
            reads: readsNow,
          }),
    areCellsHeld: state.dragging?.kind === 'movingCells',
    landingOfCellsBox: landingAreaOfCells === null ? null : drawnBoxOfSpans(spansOfArea(landingAreaOfCells)),
    isDragToldOfWhileStill: state.dragging !== null && POINTER_DRAG_KINDS.has(state.dragging.kind),
    isFillHandleOnlyTouched: state.dragging?.kind === 'filling' && state.dragging.tap !== null,
    isTapYetToBeTold: state.dragging?.kind === 'tapping',
    isFingerSelecting:
      (state.dragging?.kind === 'selecting' && state.dragging.isByFinger === true) ||
      (state.dragging?.kind === 'tapping' && state.dragging.isOnActiveCell),
    editorBox: editorBox,
    editorLineCount: editorLineCount,
    editorFoldsAt: editorFoldsAt,
    editorScale: editorScale,
    expandedEntryCard: expandedLayout?.card ?? null,
    expandButtonStandsIn: isExpandOfferedInEntry && editorBox !== null ? 'entry' : isExpandOfferedAtCell ? 'cell' : null,
    isExpandButtonAfterPress: isExpandOfferedAtCell && state.offersAtSelection.areCellsSelectedByPointer,
    editorFlagStands: null,
    clearBodyHeight: clearPageSize.height,
    editorFormat: editorFormat,
    editorLooks: state.mode.kind === 'editing' ? state.mode.looks : undefined,
    doesEntryReadSigns: doesEntryReadSigns(state, readsNow),
    textHeldAsEntryOpened: textAtStartOfEntry(state.mode),
    areSignsLeftAsTyped: state.mode.kind === 'editing' && state.mode.areSignsLeftAsTyped === true,
    editorCaretToPut: (state.mode.kind === 'editing' ? state.mode.caretToPut : undefined) ?? null,
    editorNumbersOfLines: (state.mode.kind === 'editing' ? state.mode.numbersOfLines : undefined) ?? NO_NUMBERS_OF_LINES,
    areEditorLooksSeen: entryLooksOfMode !== undefined,
    marksOfEntryCell: fontMarksOfStyle(readsNow.formatOf(entryCellId)),
    editorKeepsClear: editorKeepsClear,
    editorPaints: editorPaints,
    isEditorAComboBox: isEditorAComboBox,
    isEntryAmongPeople: isEntryAmongPeople(state, readsNow),
    isEditorOverCalendar: doesCellTakeCalendar(readsNow, activeAnchorCell(state, readsNow)),
    entryHintRoom:
      editorBox === null ||
      activeCellBox === null ||
      activeArea === null ||
      isReadOnly ||
      isEditorAComboBox ||
      editorPaints.fill !== null ||
      state.calendar !== null ||
      isExpanded ||
      !isCellEntryBlank(state.mode)
        ? null
        : entryHintRoomOf(
            editorScale === 1
              ? editorBox
              : {
                  ...activeCellBox,
                  left: editorBox.left,
                  width: activeCellBox.left + activeCellBox.width - editorBox.left,
                },
            {
              format: editorFormat,
              frozenBy:
                rows.flatMap(({ cells: cells }: Dynamic) => cells).find(({ isActive: isActive }: Dynamic) => isActive)?.frozenBy ??
                null,
              canHintReachOn: activeArea.rowCount * activeArea.columnCount === 1 && editorBox.height <= activeCellBox.height + GRID_PIXEL_SLACK,
            },
            rows,
            editorBox.showsIn.left,
            editorBox.showsIn.left + editorBox.showsIn.width,
            editorScale === 1
              ? undefined
              : {
                  scale: editorScale,
                  width: editorBox.width,
                },
          ),
    dropdownAnchorBox: state.dropdown === null ? null : (editorBox ?? activeCellBox),
    explainedCellBox: explainedCellBox,
    sideOfExplainedCell: sideOfExplainedCell,
    cornerOfErrorsOffered: cornerOfErrorsOffered,
    areCellsOfErrorsOfferInView:
      errorsOfferArea !== null &&
      (isBoxShownOrEmpty(spansOfArea(errorsOfferArea)) ||
        rows.some(({ cells: cells }: Dynamic) => cells.some((cell?: Dynamic) => cell.looksLikeError && cell.text !== '#N/A'))),
    roomAboveExplainedCell: roomAboveExplainedCell * state.zoom,
    boxesReachedByEditor: boxesReachedByEditor,
    marksOfFixes: marksOfFixes,
    pillOfFix:
      fixPill === null || fixPillBox === null
        ? null
        : {
            key: cellKeyText(fixPill.cellId),
            box: fixPillBox,
            side: isFixPillOnLeft ? 'left' : 'right',
            shown: fixPill.shown,
            formulaIfCut: isFixPillTextWhole ? null : fixPill.formula,
            areKeysForIt: fixPill === activeCellFixPill,
          },
    spillOutline:
      spill === null || spillBox === null
        ? null
        : {
            box: spillBox,
            isBlocked: spill.kind === 'blocked',
            isIfKept: spill.kind === 'ifKept',
          },
    tableOutline:
      tableOutlineOfSpill !== null
        ? {
            ...tableOutlineOfSpill,
            isOfFormula: true,
          }
        : chartAreaStart === null || isAreaInFilteredTable(state, readsNow, chartAreaStart)
          ? null
          : tableOutlineOf(chartAreaStart),
    marksOfReferences: [...referenceMarks.values()],
    outlinesOfOthers: outlinesOfOthers,
    nameFlagsOfOthers: layOutSelectionFlags(selectionsOfOthers, pageSize.height, frozenRowsHeight(layout), rows),
    marksOfComments: marksOfComments,
    markOfNewComment: state.newCommentOn === null ? null : commentBoxOf(state.newCommentOn),
    lowestFootWithRoomForCommentCard:
      cellsHeightAboveFloats({
        ...state,
        heightUnderWhatFloats: state.heightUnderCardAtFoot,
      }) -
      COMMENT_CARD_ROOM_AT_FOOT / state.zoom,
    wouldCommentBeInTheWay: wouldCommentBeInTheWay,
    mayCommentBePreviewed: !wouldCommentBeInTheWay && !(state.comments ?? []).some(({ isOpen: isOpen }: Dynamic) => isOpen),
    tintsOfFind: (state.find?.hits ?? []).flatMap(({ cellId: cellId }: Dynamic) => {
      let area = cellId.sheetId === state.sheetId ? mergedAreaOrCellOf(readsNow, cellId) : null;
      let box = area === null ? null : drawnBoxOfSpans(spansOfArea(area));
      return box === null || box.height === 0
        ? []
        : [
            {
              ...box,
              key: cellDrawKey(cellId),
              isCellFound: isSameCell(cellId, state.activeCell),
            },
          ];
    }),
    marksOnChangesByAgent: marksOnChangesByAgent.map(
      (mark?: Dynamic, index?: Dynamic) => ({
        key: mark.key,
        revision: mark.revision,
        fadeBeginsAtMs: mark.fadeBeginsAtMs,
        box: mark.box,
        area: mark.area,
        isOfWholeLines: mark.isOfWholeLines,
        isOfPlaceShown: mark.isOfPlaceShown,
        ownBox: mark.ownBox,
        grewFrom: mark.grewFrom,
        joinedRevisions: mark.joinedRevisions,
        name: index === recentMarks.length - 1 || mark.isOfPlaceShown ? placeFlag(mark.box, mark.all, mark.withFlags) : null,
      }),
    ),
    changedInTurnOffered: (state.undoOfTurnOffered?.blocks ?? []).flatMap((cells?: Dynamic) => {
      let area = cells.activeCell.sheetId === sheetId ? cachedSelectedArea(cells, readsNow) : null;
      return area === null ? [] : (drawnBoxOfSpans(spansOfArea(area)) ?? []);
    }),
    latestRevisionByAgent: state.changesByAgent.at(-1)?.revision ?? 0,
    changesAskedFor: state.changesAskedFor,
    selectionSummary: selectionSummaryView,
    roomOfAgentAtWork: workingCardRoom(state, readsNow, isReadOnly),
    roomOfWhatAddsRows: addRowsControl,
    mostRowsToAdd: addRowsControl === null ? 0 : rowsAddableAtEnd(state, readsNow, layout),
    headerThatAddsColumns: addColumnsControlBox(state, layout, isReadOnly),
  };
}
export function keptHeaderViewsOf(state: PageState, reads: ReadsWithTextMeasurer, isReadOnly?: Dynamic, filterButtonsOfView?: Dynamic, shift?: Dynamic) {
  let outlinedTables = tablesToOutline(state, reads);
  let isAreaMarkedByEntry = makeIsAreaMarkedByEntry(state, reads);
  let layout = layoutOfView(state, reads);
  return stuckHeadersOfView(state, reads, layout, shift?.y).map((stuckHeader?: Dynamic) => {
    let { firstRowIndex: firstRowIndex, rowCount: rowCount, firstColumnIndex: firstColumnIndex, columnCount: columnCount } = stuckHeader;
    let isOfFoundTable = outlinedTables.some(({ key: key }: Dynamic) => key === stuckHeader.key);
    let {
      rows: rows,
      borderLines: borderLines,
      selectionBox: selectionBox,
      otherRangeBoxes: otherRangeBoxes,
      marksOfReferences: marksOfReferences,
      filterButtons: filterButtons,
    } = gridViewOf(
      {
        ...state,
        scrollTop: stuckHeader.topInSheet - stuckHeader.showFrom,
        gridHeight: stuckHeader.showFrom === 0 ? COLUMN_HEADER_HEIGHT + stuckHeader.height : state.gridHeight,
        selectionsOfOthers: [],
        changesByAgent: [],
        marksOfImport: null,
      },
      reads,
      null,
      isReadOnly,
    );
    return {
      key: stuckHeader.key,
      top: stuckHeader.showFrom,
      height: stuckHeader.top + stuckHeader.height - stuckHeader.showFrom,
      leavesBy: stuckHeader.showFrom - stuckHeader.top,
      parts: stuckHeader.parts,
      areRowNumbersItsOwn: stuckHeader.areRowNumbersItsOwn,
      isOfFoundTable: isOfFoundTable,
      rows: rows.flatMap((row?: Dynamic) => {
        if (!isInSpan(row.rowNumber - 1, firstRowIndex, rowCount)) return [];
        let cells = row.cells.flatMap(
          (cell?: Dynamic) =>
            isInSpan(cell.columnNumber - 1, firstColumnIndex, columnCount)
              ? [keptHeaderCellOf(cell, isOfFoundTable, isAreaMarkedByEntry, reads)]
              : [],
        );
        return [
          {
            ...row,
            cells: cells,
          },
        ];
      }),
      borderLines: borderLines,
      selectionBoxes: [
        ...(selectionBox === null
          ? []
          : [
              {
                key: 'selection',
                box: selectionBox,
              },
            ]),
        ...otherRangeBoxes,
      ].filter(({ box: box }: Dynamic) => box.top < stuckHeader.showFrom + stuckHeader.height),
      marksOfReferences: marksOfReferences.filter(({ box: box }: Dynamic) => box.top < stuckHeader.showFrom + stuckHeader.height),
      groundsOfButtonsHeld: filterButtons.flatMap(
        ({ tableKey: tableKey, heldInView: heldInView, groundsWhereHeld: groundsWhereHeld }: Dynamic) =>
          tableKey === stuckHeader.key &&
          heldInView !== null &&
          filterButtonsOfView.some(({ headerKept: headerKept }: Dynamic) => headerKept === stuckHeader.key)
            ? [
                {
                  box: heldInView,
                  grounds: groundsWhereHeld,
                },
              ]
            : [],
      ),
    };
  });
}
export function startOfMovedCells(state: Dynamic, { scrollAtPress: scrollAtPress }: Dynamic = {}, heldArea: Dynamic, reads: ReadsWithTextMeasurer) {
  let stateAtPress = {
    ...state,
    ...scrollAtPress,
    dragging: null,
  };
  let outlinedTables = tablesToOutline(stateAtPress, reads);
  let headerKept = stuckHeadersOfView(stateAtPress, reads).find(
    ({ firstRowIndex: firstRowIndex, firstColumnIndex: firstColumnIndex }: Dynamic) =>
      isInSpan(firstRowIndex, heldArea.topRowIndex, heldArea.rowCount) && isInSpan(firstColumnIndex, heldArea.leftColumnIndex, heldArea.columnCount),
  );
  return {
    parts: newMovedCellsParts(),
    isFoundTable: outlinedTables.some(({ area: area }: Dynamic) => isSameArea(area, heldArea)),
    headerKept:
      headerKept === undefined
        ? null
        : {
            firstIndex: headerKept.firstRowIndex,
            count: headerKept.rowCount,
            isOfFoundTable: outlinedTables.some(({ key: key }: Dynamic) => key === headerKept.key),
          },
    inHeaderKept: new WeakMap(),
  };
}
export function linesOfPaneWithin(pane?: Dynamic, firstIndex?: Dynamic, count?: Dynamic) {
  let from = Math.max(firstIndex, pane.first);
  let to = Math.min(firstIndex + count, pane.first + pane.count);
  return to > from
    ? {
        firstIndex: from,
        count: to - from,
      }
    : null;
}
export function movedCellsView(state: PageState, reads: ReadsWithTextMeasurer, isReadOnly?: Dynamic) {
  let { dragging: dragging } = state;
  if (dragging?.kind !== 'movingCells' || dragging.landing === null) return null;
  let heldArea = selectedArea(state, reads);
  if (heldArea === null) return null;
  let start = movedCellsStartByPress.get(dragging.press) ?? startOfMovedCells(state, dragging, heldArea, reads);
  movedCellsStartByPress.set(dragging.press, start);
  let layout = layoutOfView(state, reads);
  let { rowEdges: rowEdges, columnEdges: columnEdges } = layout;
  let landingArea = landingAreaOfMovingCells(state, reads) ?? heldArea;
  let [rowsMovedBy, columnsMovedBy] = [
    landingArea.topRowIndex - heldArea.topRowIndex,
    landingArea.leftColumnIndex - heldArea.leftColumnIndex,
  ];
  let [landingLeft, landingTop] = [columnEdges.startOf(landingArea.leftColumnIndex), rowEdges.startOf(landingArea.topRowIndex)];
  let restedAt = landingArea === heldArea || dragging.restedOn === null ? null : reads.positionOfCell(dragging.restedOn);
  let landing =
    restedAt === null
      ? heldArea
      : {
          ...heldArea,
          topRowIndex: restedAt.rowIndex,
          leftColumnIndex: restedAt.columnIndex,
        };
  let copyOf = (rows?: Dynamic, columns?: Dynamic) =>
    movedCellsCopy(
      start.parts,
      {
        rows: rows,
        columns: columns,
      },
      {
        held: heldArea,
        landing: landing,
      },
      {
        sheetId: state.sheetId,
        layout: layout,
      },
      state,
      reads,
      (stateOfCopy?: Dynamic, readsOfCopy?: Dynamic) => gridViewOf(stateOfCopy, readsOfCopy, null, isReadOnly),
    );
  let inHeaderKept = (part?: Dynamic, isOfFoundTable?: Dynamic) => {
    let kept = start.inHeaderKept.get(part);
    if (kept !== undefined) return kept;
    let cellOf = (cell?: Dynamic) => keptHeaderCellOf(cell, isOfFoundTable, () => false, reads);
    let made = {
      ...part,
      rows: part.rows.map(
        (row?: Dynamic) => ({
          ...row,
          cells: row.cells.map(cellOf),
        }),
      ),
    };
    return (start.inHeaderKept.set(part, made), made);
  };
  let panes = rowPanes(state, layout, state).flatMap(
    (rowPane?: Dynamic) =>
      columnPanes(state, layout, state).flatMap((columnPane?: Dynamic) => {
        let rowsInPane = linesOfPaneWithin(rowPane, landingArea.topRowIndex, landingArea.rowCount);
        let columnsInPane = linesOfPaneWithin(columnPane, landingArea.leftColumnIndex, landingArea.columnCount);
        if (rowsInPane === null || columnsInPane === null) return [];
        let rowsOfCopy = windowOfLines(
          {
            firstIndex: heldArea.topRowIndex,
            count: heldArea.rowCount,
          },
          {
            ...rowsInPane,
            firstIndex: rowsInPane.firstIndex - rowsMovedBy,
          },
        );
        let columnsOfCopy = windowOfLines(
          {
            firstIndex: heldArea.leftColumnIndex,
            count: heldArea.columnCount,
          },
          {
            ...columnsInPane,
            firstIndex: columnsInPane.firstIndex - columnsMovedBy,
          },
        );
        let part = copyOf(rowsOfCopy, columnsOfCopy);
        if (part === null) return [];
        let firstRowShown = part.rows.find(
          ({ rowNumber: rowNumber }: Dynamic) => rowNumber - 1 + rowsMovedBy >= rowsInPane.firstIndex,
        );
        let at = {
          left: columnEdges.startOf(columnsOfCopy.firstIndex + columnsMovedBy) - columnPane.scroll,
          top:
            firstRowShown === undefined
              ? rowEdges.startOf(rowsOfCopy.firstIndex + rowsMovedBy) - rowPane.scroll
              : rowEdges.startOf(firstRowShown.rowNumber - 1 + rowsMovedBy) - rowPane.scroll - firstRowShown.top,
        };
        let landingAt = {
          left: landingLeft - columnPane.scroll,
          top: landingTop - rowPane.scroll,
        };
        let headerPart = rowPane.areFrozen || start.headerKept === null ? null : copyOf(start.headerKept, columnsOfCopy);
        let isHeaderKept =
          headerPart !== null &&
          start.headerKept !== null &&
          rowEdges.startOf(start.headerKept.firstIndex + rowsMovedBy) - rowPane.scroll < rowPane.showFrom;
        return [
          {
            key: `${rowPane.areFrozen} ${columnPane.areFrozen}`,
            showsIn: paneRect(columnPane, rowPane),
            landingAt: landingAt,
            at: at,
            part: part,
            headerKept: isHeaderKept
              ? {
                  top: rowPane.showFrom,
                  part: inHeaderKept(headerPart, start.headerKept.isOfFoundTable),
                }
              : null,
          },
        ];
      }),
  );
  if (panes.length === 0) return null;
  let [landingSpans, homeSpans] = [
    rangeSpansOnScreen(landingArea, state, layout, state),
    rangeSpansOnScreen(heldArea, state, layout, state),
  ];
  let headerShown = panes.find((pane?: Dynamic) => pane.headerKept !== null)?.headerKept ?? null;
  let firstRow =
    headerShown?.part.rows[0] ?? panes[0]?.part.rows.find(({ rowNumber: rowNumber }: Dynamic) => rowNumber - 1 === heldArea.topRowIndex);
  let handleBox = tableHandleBox(landingSpans, firstRow?.height ?? 0, landingArea);
  let isHandleShown =
    firstRow !== undefined &&
    (handleBox.isAtRowNumbers ? headerShown === null : handleBox.left >= landingSpans.across.showFrom) &&
    handleBox.top + handleBox.height <= landingSpans.down.showTo &&
    (headerShown !== null || landingSpans.down.start + firstRow.height > landingSpans.down.showFrom);
  return {
    panes: panes,
    home: drawnBoxOfSpans(homeSpans),
    homeAt: {
      left: homeSpans.across.start,
      top: homeSpans.down.start,
    },
    handle: start.isFoundTable && isHandleShown ? handleBox : null,
    isTable: start.isFoundTable,
    scroll: `${state.scrollLeft} ${state.scrollTop}`,
  };
}
export const isKeptHeaderUnderEditor = (
  { top: top, height: height, parts: parts }: Dynamic,
  editorBox?: Dynamic,
  editorFoldsAt?: Dynamic,
) =>
  editorBox !== null &&
  editorBox.top < top + height &&
  editorBox.top + editorBox.height > top &&
  parts.some(
    ({ left: left, width: width }: Dynamic) =>
      editorBox.left < left + width && editorBox.left + Math.max(editorBox.width, editorFoldsAt?.width ?? 0) > left,
  );
export const keptHeaderCellOf = (cell?: Dynamic, isOfFoundTable?: Dynamic, isAreaMarkedByEntry?: Dynamic, reads?: Dynamic) => ({
  ...cell,
  elementId: null,
  isActive: false,
  isSelected: false,
  hasGroundOfFoundHeader: isOfFoundTable,
  isInTable: true,
  cornersOfTable: null,
  isHeadingOfTable: isOfFoundTable || cell.hasTintOfFilterHeader,
  hasColorOfHeading:
    (isOfFoundTable || cell.hasTintOfFilterHeader) &&
    !hasFontFormatting(cell.format) &&
    !isAreaMarkedByEntry({
      topRowIndex: cell.rowNumber - 1,
      leftColumnIndex: cell.columnNumber - 1,
      rowCount: cell.mergedRowCount ?? 1,
      columnCount: cell.mergedColumnCount ?? 1,
    }),
  hasLineAtRight: false,
  linesInTextBox: NO_LINES_IN_TEXT_BOX,
  mayTextFade: mayCellTextFade(cell, reads),
});
export const movedCellsStartByPress = new WeakMap();
