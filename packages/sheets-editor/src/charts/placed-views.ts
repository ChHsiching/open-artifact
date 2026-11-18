import type { Dynamic } from '../dynamic.ts';
import { readsAsStored, cellRefOf } from '../model/workbook.ts';
import { areasAsSeen } from '../model/a1-references.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { referenceHue } from '../formulas/reference-pointing.ts';
import { layoutOfView, clampScrollOfView } from '../grid/layout.ts';
import {
  rangeSpansOnScreen,
  cellsAreaWidth,
  cellsAreaHeight,
  scrollToShowBoxInCell,
  clampBetween,
  DRAG_START_DISTANCE,
  freezeCountAtPointer,
  cellUnderPointer,
  columnsEndOnScreen,
  rowsEndOnScreen,
  cellsHeightAboveFloats,
} from '../grid/geometry.ts';
import { heightCoveredByStickyHeaders } from '../grid/sticky-headers.ts';
import { ROW_HEADER_WIDTH } from '../grid/cell-metrics-values.ts';
import { COLUMN_HEADER_HEIGHT } from '../grid/cell-metrics.ts';
import { scrollPositionAtPixel, pixelOfScrollPosition, lineNextToScrollPosition, clampPixelsPast } from '../model/line-sizes.ts';
import { withNoEffects } from '../state/transitions.ts';
import { queueEdit, IF_QUEUED_DEFAULTS, holdUntilAnswered } from '../model/edit-effects.ts';
import { scrollToShowSelection, scrollToShowPosition, BOTH_AXES, isSameCell, isSameSelection } from '../selection/model.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function placedViewKeyAct({ key: key, isShiftHeld: isShiftHeld, isModifierHeld: isModifierHeld, isAltHeld: isAltHeld }: Dynamic) {
  if (isModifierHeld || isAltHeld) return null;
  let direction = Object.hasOwn(ARROW_KEY_DIRECTIONS, key) ? ARROW_KEY_DIRECTIONS[key] : undefined;
  if (direction !== undefined)
    return {
      kind: isShiftHeld ? 'sizeByStep' : 'moveByStep',
      toward: direction,
    };
  if (isShiftHeld) return null;
  if (key === 'Escape')
    return {
      kind: 'leave',
      isForCells: true,
    };
  return key === 'Delete' || key === 'Backspace'
    ? {
        kind: 'delete',
        isByKey: true,
      }
    : null;
}
export function selectedPlacedViewId(state: PageState, reads: WorkbookReads) {
  let { placementSelected: placementSelected } = state;
  if (placementSelected === null) return null;
  return placementById(state, reads, placementSelected)?.viewId ?? null;
}
export function selectedChartInputAreas(state: PageState, reads: WorkbookReads) {
  let viewId = selectedPlacedViewId(state, reads);
  let viewAsItStands = viewId === null ? null : reads.viewAsItStands(viewId);
  let element = viewAsItStands?.view.elements[0];
  if (viewAsItStands === null || element === undefined) return [];
  let inputsOfElement = 'refusal' in viewAsItStands.inputs ? undefined : viewAsItStands.inputs.byElement.get(element.elementId);
  let readsStored = readsAsStored(reads);
  return element.inputs.flatMap(
    ({ name: inputName, range: { sheetId: sheetId, topLeft: topLeft, bottomRight: bottomRight } }: Dynamic, index?: Dynamic) => {
      let values = inputsOfElement?.[inputName] ?? [];
      let [topRow, bottomRow] = [readsStored.rowIndexOf(sheetId, topLeft.r), readsStored.rowIndexOf(sheetId, bottomRight.r)];
      let [leftColumn, rightColumn] = [reads.columnIndexOf(sheetId, topLeft.c), reads.columnIndexOf(sheetId, bottomRight.c)];
      let topRowIndex = lowerIndexOrFallback(topRow, bottomRow, isIndexAfter(leftColumn, rightColumn));
      let leftColumnIndex = lowerIndexOrFallback(leftColumn, rightColumn, isIndexAfter(topRow, bottomRow));
      return sheetId !== state.sheetId || topRowIndex === null || leftColumnIndex === null || values[0] === undefined
        ? []
        : areasAsSeen(
            {
              topRowIndex: topRowIndex,
              leftColumnIndex: leftColumnIndex,
              rowCount: values.length,
              columnCount: values[0].length,
            },
            ownRowOrderOfSheet(reads, sheetId),
          ).map(
            (area?: Dynamic) => ({
              area: area,
              hue: referenceHue(index),
            }),
          );
    },
  );
}
export function placementAsDragged(state: PageState, reads: WorkbookReads, placement?: Dynamic) {
  let held = isDraggingPlacedView(state) ? state.dragging : state.heldUntilAnswered?.held;
  if (held?.kind === 'movingPlacedView' && held.placementId === placement.placementId) {
    if (held.landing === null) return placement;
    let { topLeft: topLeft, offsetFromAnchorCell: landing } = held.landing;
    let position = reads.positionOfCell(topLeft);
    return position === null
      ? placement
      : {
          ...placement,
          ...position,
          offsetFromAnchorCell: landing,
        };
  }
  if (held?.kind === 'sizingPlacedView' && held.placementId === placement.placementId) {
    if (held.sized === null) return placement;
    let { topLeft: topLeft, ...sized } = held.sized;
    let position = reads.positionOfCell(topLeft);
    return position === null
      ? placement
      : {
          ...placement,
          ...position,
          ...sized,
        };
  }
  return placement;
}
export function placedViewBox(state: PageState, reads: ReadsWithTextMeasurer, placement?: Dynamic) {
  let { rowIndex: rowIndex, columnIndex: columnIndex } = placement;
  let anchorArea = {
    topRowIndex: rowIndex,
    leftColumnIndex: columnIndex,
    rowCount: 1,
    columnCount: 1,
  };
  let layout = layoutOfView(state, reads);
  let { across: across, down: down } = rangeSpansOnScreen(anchorArea, state, layout, state);
  let offset = anchorOffsetPixels(layout, placement);
  return {
    left: across.start + offset.left,
    top: down.start + offset.top,
    width: placement.widthInPixels,
    height: placement.heightInPixels,
    showsIn: {
      left: across.showFrom,
      top: down.showFrom,
      width: cellsAreaWidth(state) - across.showFrom,
      height: cellsAreaHeight(state) - down.showFrom,
    },
  };
}
export function scrollToPlacedView(state: PageState, reads: ReadsWithTextMeasurer, placement?: Dynamic, shownUnder: Dynamic = 0) {
  let layout = layoutOfView(state, reads);
  let { widthInPixels: width, heightInPixels: height } = placement;
  let heightUnder = shownUnder === 'askBox' ? (ASK_BOX_SIZE.gap + ASK_BOX_SIZE.height) / state.zoom : shownUnder;
  let target = {
    ...anchorOffsetPixels(layout, placement),
    width: width,
    height: height,
    heightShownUnder: heightUnder,
    around: PLACED_VIEW_MARGIN,
  };
  let placementCovered = {
    ...placement,
    heightCovered: heightCoveredByStickyHeaders(state, reads, placement, layout),
  };
  return {
    ...state,
    ...scrollToShowBoxInCell(state, placementCovered, target, layout, state),
  };
}
export function isPointOnSelectedPlacement(state: PageState, reads: ReadsWithTextMeasurer, point?: Dynamic) {
  let { placementSelected: placementSelected } = state;
  let placement = placementSelected === null ? null : placementById(state, reads, placementSelected);
  if (placement === null) return false;
  let { left: left, top: top, width: width, height: height, showsIn: showsIn } = placedViewBox(state, reads, placement);
  let [x, y] = [point.x - ROW_HEADER_WIDTH, point.y - COLUMN_HEADER_HEIGHT];
  return x >= Math.max(left, showsIn.left) && x < left + width && y >= Math.max(top, showsIn.top) && y < top + height;
}
export function chartOfView(viewAsItStands?: Dynamic) {
  let element = viewAsItStands?.view.elements[0];
  let nodeId = element === undefined ? null : nodeIdOfRef(element.embed.ref);
  if (viewAsItStands === null || element === undefined || nodeId === null)
    return {
      kind: 'none',
      why: 'notAChart',
    };
  if ('refusal' in viewAsItStands.inputs) {
    let { refusal: refusal } = viewAsItStands.inputs;
    return {
      kind: 'none',
      why: refusal === 'tooManyRowsInAnInput' || refusal === 'inputTooLarge' ? 'tooMuchToRead' : 'inputsNotRead',
    };
  }
  let inputs = viewAsItStands.inputs.byElement.get(element.elementId);
  return inputs === undefined
    ? {
        kind: 'none',
        why: 'notAChart',
      }
    : {
        kind: 'code',
        nodeId: nodeId,
        inputs: inputs,
      };
}
export function cachedChartOfView(viewAsItStands?: Dynamic) {
  let cached = viewAsItStands === null ? undefined : chartOfViewCache.get(viewAsItStands);
  if (cached !== undefined) return cached;
  let chart = chartOfView(viewAsItStands);
  if (viewAsItStands !== null) chartOfViewCache.set(viewAsItStands, chart);
  return chart;
}
export function askBoxStand(
  { left: left, top: top, width: width, height: height, showsIn: showsIn }: Dynamic,
  zoom?: Dynamic,
  bottomLimit?: Dynamic,
) {
  let gap = ASK_BOX_SIZE.gap / zoom;
  let boxWidth = ASK_BOX_SIZE.width / zoom;
  let [minLeft, minTop] = [showsIn.left + gap, showsIn.top + gap];
  let maxLeft = showsIn.left + showsIn.width - gap - boxWidth;
  let maxTop = Math.min(showsIn.top + showsIn.height, bottomLimit) - ASK_BOX_SIZE.height / zoom;
  return {
    left: clampBetween(left + (width - boxWidth) / 2, minLeft, maxLeft) - left,
    top: clampBetween(top + height + gap, minTop, maxTop) - top,
    width: boxWidth,
    isRoomEnough: maxLeft >= minLeft && maxTop >= minTop,
  };
}
export function placementTopLeftCell(state: PageState, reads: ReadsWithTextMeasurer, placement?: Dynamic) {
  let { rowEdges: rowEdges, columnEdges: columnEdges } = layoutOfView(state, reads);
  return {
    rowIndex: scrollPositionAtPixel(rowEdges, pixelOfScrollPosition(rowEdges, rowAnchorOf(placement))).index,
    columnIndex: scrollPositionAtPixel(columnEdges, pixelOfScrollPosition(columnEdges, columnAnchorOf(placement))).index,
  };
}
export function movePlacedView(state: PageState, reads: ReadsWithTextMeasurer, placement?: Dynamic, target?: Dynamic) {
  let { sheetId: sheetId } = state;
  let topLeftCell = reads.cellIdAt(sheetId, target.rowIndex, target.columnIndex);
  if (topLeftCell === null || isSameAnchor(target, placement)) return withNoEffects(state);
  let cellAddress = cellAddressAt(placementTopLeftCell(state, reads, target), ownRowOrderOfSheet(reads, sheetId));
  return queueEdit(
    state,
    {
      kind: 'movePlacedView',
      sheetId: sheetId,
      placementId: placement.placementId,
      topLeft: cellRefOf(topLeftCell),
      offsetFromAnchorCell: target.offsetFromAnchorCell,
    },
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      done: {
        what: 'placedViewMoved',
        name: placedViewName(reads, placement),
        cell: cellAddress,
      },
    },
  );
}
export function resizePlacedView(state: PageState, reads: WorkbookReads, placement?: Dynamic, target?: Dynamic) {
  let { sheetId: sheetId } = state;
  let topLeftCell = reads.cellIdAt(sheetId, target.rowIndex, target.columnIndex);
  let { widthInPixels: widthInPixels, heightInPixels: heightInPixels } = target;
  let isUnchanged =
    isSameAnchor(target, placement) && widthInPixels === placement.widthInPixels && heightInPixels === placement.heightInPixels;
  if (topLeftCell === null || isUnchanged) return withNoEffects(state);
  return queueEdit(
    state,
    {
      kind: 'resizePlacedView',
      sheetId: sheetId,
      placementId: placement.placementId,
      topLeft: cellRefOf(topLeftCell),
      offsetFromAnchorCell: target.offsetFromAnchorCell,
      widthInPixels: widthInPixels,
      heightInPixels: heightInPixels,
    },
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      done: {
        what: 'placedViewSized',
        name: placedViewName(reads, placement),
        widthInPixels: widthInPixels,
        heightInPixels: heightInPixels,
      },
    },
  );
}
export function showPlacedViewChange(state: PageState, reads: ReadsWithTextMeasurer, placementId?: Dynamic, how?: Dynamic) {
  let placement = placementById(state, reads, placementId);
  if (placement === null) return null;
  let what = how === 'undone' ? 'placedViewChangeUndone' : 'placedViewChangeRedone';
  return {
    ...scrollToPlacedView(selectPlacement(state, placementId), reads, placement),
    lastDone: {
      what: what,
      name: placedViewName(reads, placement),
    },
  };
}
export function clampPlacementSide(reads: WorkbookReads, pixels?: Dynamic) {
  let { smallestSideOfAPlacementInPixels: smallest, largestSideOfAPlacementInPixels: largest } = reads.limitsOfPlacements();
  return Math.max(smallest, Math.min(Math.round(pixels), largest));
}
export function stepPlacementAnchor(state: PageState, reads: ReadsWithTextMeasurer, placement?: Dynamic, direction?: Dynamic) {
  let { rowEdges: rowEdges, columnEdges: columnEdges } = layoutOfView(state, reads);
  let side = direction === 'up' || direction === 'left' ? 'before' : 'after';
  if (direction === 'up' || direction === 'down') {
    let rowIndex = lineNextToScrollPosition(rowEdges, rowAnchorOf(placement), side);
    return rowIndex === null
      ? null
      : placementAnchorOf(columnAnchorOf(placement), {
          index: rowIndex,
          pixelsPast: 0,
        });
  }
  let columnIndex = lineNextToScrollPosition(columnEdges, columnAnchorOf(placement), side);
  return columnIndex === null
    ? null
    : placementAnchorOf(
        {
          index: columnIndex,
          pixelsPast: 0,
        },
        rowAnchorOf(placement),
      );
}
export function reducePlacedViewAct(
  state: PageState,
  { placementId: placementId, act: act }: Dynamic,
  { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic,
) {
  if (act.kind === 'leave') {
    if (state.placementSelected !== placementId) return withNoEffects(state);
    let state2 = {
      ...state,
      placementSelected: null,
      menu: state.menu?.ofChart === undefined ? state.menu : null,
    };
    return withNoEffects(act.isForCells && !isDraggingPlacedView(state) ? scrollToShowSelection(state2, reads) : state2);
  }
  let placement = placementById(state, reads, placementId);
  if (placement === null) return withNoEffects(state);
  let selectedState =
    state.placementSelected === placementId && state.menu === null
      ? state
      : {
          ...state,
          placementSelected: placementId,
          menu: null,
        };
  switch (act.kind) {
    case 'select': {
      if (isDraggingPlacedView(state)) return withNoEffects(selectedState);
      let value = selectPlacement(state, placementId);
      let shownUnder = act.isForAskBox === true ? 'askBox' : act.hasJustArrived === true ? heightOfAddedChartCard(state) : 0;
      let value2 =
        act.isByKey || act.isForAskBox === true || !isBoxInView(placedViewBox(state, reads, placement))
          ? scrollToPlacedView(value, reads, placement, shownUnder)
          : value;
      return withNoEffects(
        act.hasJustArrived === true
          ? {
              ...value2,
              scrolledForNewChart: {
                placementId: placementId,
                cell: state.activeCell,
                from: scrollPositionOf(state),
                to: scrollPositionOf(value2),
              },
            }
          : value2,
      );
    }
    case 'takeHold': {
      if (refusalOfEveryEdit !== null) return withNoEffects(selectedState);
      let { at: value, sides: value2 } = act;
      let { left: value3, top: value4, showsIn: value5 } = placedViewBox(state, reads, placement);
      let state2 = {
        placementId: placementId,
        pressedAt: value,
        leastDrag: (act.isByFinger ? DRAG_START_DISTANCE : PLACED_VIEW_LEAST_DRAG) / state.zoom,
        isCornerUnderFrozenLines: {
          columns: value3 < value5.left,
          rows: value4 < value5.top,
        },
      };
      if (value2 !== null)
        return withNoEffects({
          ...selectedState,
          dragging: {
            ...state2,
            kind: 'sizingPlacedView',
            sides: value2,
            sized: null,
          },
        });
      let state3 = {
        x: value.x - ROW_HEADER_WIDTH - value3,
        y: value.y - COLUMN_HEADER_HEIGHT - value4,
      };
      return withNoEffects({
        ...selectedState,
        dragging: {
          ...state2,
          kind: 'movingPlacedView',
          grip: state3,
          landing: null,
        },
      });
    }
    case 'moveByStep': {
      let value = stepPlacementAnchor(state, reads, placement, act.toward);
      if (value === null) return withNoEffects(selectedState);
      return movePlacedView(
        scrollToPlacedView(selectedState, reads, {
          ...placement,
          ...value,
        }),
        reads,
        placement,
        value,
      );
    }
    case 'sizeByStep': {
      let { widthInPixels: value, heightInPixels: value2 } = placement;
      let value3 = act.toward === 'right' || act.toward === 'down' ? 1 : -1;
      let value4 = act.toward === 'left' || act.toward === 'right';
      let value5 = value3 * PLACED_VIEW_SIZE_STEP;
      return resizePlacedView(selectedState, reads, placement, {
        ...placement,
        widthInPixels: value4 ? clampPlacementSide(reads, value + value5) : value,
        heightInPixels: value4 ? value2 : clampPlacementSide(reads, value2 + value5),
      });
    }
    case 'askForMenu': {
      if (refusalOfEveryEdit !== null) return withNoEffects(selectedState);
      if (act.isForNobody === true || state.mode.kind === 'editing') return withNoEffects(selectedState);
      let selected = selectPlacement(state, placementId);
      let scrolled = act.at === null ? scrollToPlacedView(selected, reads, placement) : selected;
      let { left: left, top: top, showsIn: showsIn } = placedViewBox(scrolled, reads, placement);
      let inset = CHART_MENU_INSET / state.zoom;
      return withNoEffects({
        ...scrolled,
        menu: {
          at: act.at ?? {
            x: ROW_HEADER_WIDTH + Math.max(left, showsIn.left) + inset,
            y: COLUMN_HEADER_HEIGHT + Math.max(top, showsIn.top) + inset,
          },
          side: null,
          isAskedByKey: act.at === null,
          holds: 'chart',
          ofChart: {
            placementId: placementId,
            canAgentChangeIt: act.canAgentChangeIt,
          },
        },
      });
    }
    case 'delete': {
      let state2 = {
        ...selectedState,
        placementSelected: null,
      };
      let value3 = state.scrolledForNewChart?.placementId === placementId ? scrollBackFromNewChart(state2, reads) : state2;
      return queueEdit(
        act.isByKey ? scrollToShowSelection(value3, reads) : value3,
        {
          kind: 'deletePlacedView',
          sheetId: state.sheetId,
          placementId: placementId,
        },
        {
          ...IF_QUEUED_DEFAULTS,
          select: null,
          done: null,
          undoOffer: {
            kind: 'placedViewDeleted',
            name: placedViewName(reads, placement),
            isSaved: false,
          },
        },
      );
    }
  }
}
export function anchorAtPoint(
  state: PageState,
  reads: ReadsWithTextMeasurer,
  point: Dynamic,
  { isCornerUnderFrozenLines: isCornerUnderFrozenLines }: Dynamic,
  placement?: Dynamic,
) {
  let layout = layoutOfView(state, reads);
  let { left: left, top: top } = placedViewBox(state, reads, placement);
  return placementAnchorOf(
    Math.abs(point.x - ROW_HEADER_WIDTH - left) < 0.5
      ? columnAnchorOf(placement)
      : freezeCountAtPointer(point, state, layout, 'columns', isCornerUnderFrozenLines.columns),
    Math.abs(point.y - COLUMN_HEADER_HEIGHT - top) < 0.5
      ? rowAnchorOf(placement)
      : freezeCountAtPointer(point, state, layout, 'rows', isCornerUnderFrozenLines.rows),
  );
}
export function autoScrollWhileDragging(state: PageState, reads: ReadsWithTextMeasurer, { pressedAt: pressedAt }: Dynamic, pointer?: Dynamic) {
  let layout = layoutOfView(state, reads);
  let scrollTarget = cellUnderPointer(pointer, state, layout, state);
  let { scrollLeft: scrollLeft, scrollTop: scrollTop } = scrollToShowPosition(state, reads, scrollTarget, BOTH_AXES, 'pointer');
  let [x, y] = [pointer.x - ROW_HEADER_WIDTH, pointer.y - COLUMN_HEADER_HEIGHT];
  let isXInView = x >= Math.max(0, columnsEndOnScreen(state, layout)) && x < cellsAreaWidth(state);
  let isYInView = y >= Math.max(0, rowsEndOnScreen(state, layout)) && y < cellsAreaHeight(state);
  return {
    ...state,
    scrollLeft: !isXInView && (scrollLeft - state.scrollLeft) * (pointer.x - pressedAt.x) > 0 ? scrollLeft : state.scrollLeft,
    scrollTop: !isYInView && (scrollTop - state.scrollTop) * (pointer.y - pressedAt.y) > 0 ? scrollTop : state.scrollTop,
  };
}
export function dragPlacedView(state: PageState, dragging: Dynamic, pointer: Dynamic, reads: ReadsWithTextMeasurer) {
  let placement = placementById(state, reads, dragging.placementId);
  if (placement === null) return state;
  if (dragging.landing === null && isWithinLeastDrag(dragging, pointer)) return state;
  let scrolledState = autoScrollWhileDragging(state, reads, dragging, pointer);
  let gripPoint = {
    x: pointer.x - dragging.grip.x,
    y: pointer.y - dragging.grip.y,
  };
  let {
    rowIndex: rowIndex,
    columnIndex: columnIndex,
    offsetFromAnchorCell: offsetFromAnchorCell,
  } = anchorAtPoint(scrolledState, reads, gripPoint, dragging, placement);
  let topLeftCell = reads.cellIdAt(state.sheetId, rowIndex, columnIndex);
  return topLeftCell === null ||
    (dragging.landing !== null &&
      isSameCell(topLeftCell, dragging.landing.topLeft) &&
      isSameOffset(offsetFromAnchorCell, dragging.landing.offsetFromAnchorCell) &&
      scrolledState.scrollLeft === state.scrollLeft &&
      scrolledState.scrollTop === state.scrollTop)
    ? state
    : {
        ...scrolledState,
        dragging: {
          ...dragging,
          landing: {
            topLeft: topLeftCell,
            offsetFromAnchorCell: offsetFromAnchorCell,
          },
        },
      };
}
export function sizePlacedView(state: PageState, dragging: Dynamic, pointer: Dynamic, reads: ReadsWithTextMeasurer) {
  let placement = placementById(state, reads, dragging.placementId);
  if (placement === null) return state;
  if (dragging.sized === null && isWithinLeastDrag(dragging, pointer)) return state;
  let { left: left, top: top } = placedViewBox(state, reads, placement);
  let [isLeftSide, isTopSide] = [dragging.sides.x === 'left', dragging.sides.y === 'top'];
  let [dragX, dragY] = [pointer.x - dragging.pressedAt.x, pointer.y - dragging.pressedAt.y];
  let sizeChange = (isMovingSide?: Dynamic, size?: Dynamic, drag?: Dynamic) =>
    isMovingSide ? clampPlacementSide(reads, size - drag) - size : 0;
  let cornerPoint = {
    x: ROW_HEADER_WIDTH + left - sizeChange(isLeftSide, placement.widthInPixels, dragX),
    y: COLUMN_HEADER_HEIGHT + top - sizeChange(isTopSide, placement.heightInPixels, dragY),
  };
  let anchor = isLeftSide || isTopSide ? anchorAtPoint(state, reads, cornerPoint, dragging, placement) : placement;
  let movedBox =
    anchor === placement
      ? {
          left: left,
          top: top,
        }
      : placedViewBox(state, reads, {
          ...placement,
          ...anchor,
        });
  let widthInPixels = clampPlacementSide(reads, placement.widthInPixels + (dragging.sides.x === 'right' ? dragX : left - movedBox.left));
  let heightInPixels = clampPlacementSide(reads, placement.heightInPixels + (dragging.sides.y === 'bottom' ? dragY : top - movedBox.top));
  let topLeftCell = reads.cellIdAt(state.sheetId, anchor.rowIndex, anchor.columnIndex);
  if (topLeftCell === null) return state;
  let { offsetFromAnchorCell: offsetFromAnchorCell } = anchor;
  let sized = dragging.sized;
  return sized !== null &&
    isSameCell(sized.topLeft, topLeftCell) &&
    isSameOffset(sized.offsetFromAnchorCell, offsetFromAnchorCell) &&
    sized.widthInPixels === widthInPixels &&
    sized.heightInPixels === heightInPixels
    ? state
    : {
        ...state,
        dragging: {
          ...dragging,
          sized: {
            topLeft: topLeftCell,
            offsetFromAnchorCell: offsetFromAnchorCell,
            widthInPixels: widthInPixels,
            heightInPixels: heightInPixels,
          },
        },
      };
}
export function dropPlacedView(state: PageState, dragging: Dynamic, { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic) {
  let stateDropped = {
    ...state,
    dragging: null,
  };
  let placement = placementById(state, reads, dragging.placementId);
  let placementAsDragged2 = placement === null ? null : placementAsDragged(state, reads, placement);
  if (placement === null || placementAsDragged2 === null || placementAsDragged2 === placement) return withNoEffects(stateDropped);
  if (refusalOfEveryEdit !== null)
    return withNoEffects({
      ...stateDropped,
      notice: {
        kind: 'editRefused',
        why: refusalOfEveryEdit,
        asked: 'otherEdit',
      },
    });
  return holdUntilAnswered(
    dragging.kind === 'movingPlacedView'
      ? movePlacedView(stateDropped, reads, placement, placementAsDragged2)
      : resizePlacedView(stateDropped, reads, placement, placementAsDragged2),
    dragging,
  );
}
export function reconcilePlacementSelection(previousState: Dynamic, state: PageState, event: Dynamic, reads: WorkbookReads) {
  let { placementSelected: placementSelected, dragging: dragging } = state;
  let isDraggingPlacement = dragging?.kind === 'movingPlacedView' || dragging?.kind === 'sizingPlacedView';
  if (placementSelected === null && !isDraggingPlacement) return state;
  let keepsSelection =
    placementSelected !== null &&
    event.kind !== 'pointerPressed' &&
    state.mode.kind !== 'editing' &&
    (placementSelected !== previousState.placementSelected ||
      (state.sheetId === previousState.sheetId &&
        ((event.kind === 'workbookChanged' && event.isUnasked) || isSameSelection(previousState, state)))) &&
    placementById(state, reads, placementSelected) !== null;
  if (keepsSelection && (!isDraggingPlacement || dragging.placementId === placementSelected)) return state;
  return {
    ...state,
    placementSelected: keepsSelection ? placementSelected : null,
    dragging: isDraggingPlacement ? null : dragging,
  };
}
export function scrollBackFromNewChart(state: PageState, reads: ReadsWithTextMeasurer) {
  let { scrolledForNewChart: scrolledForNewChart } = state;
  let state2 = {
    ...state,
    scrolledForNewChart: null,
  };
  if (
    !(
      scrolledForNewChart !== null &&
      isSameCell(scrolledForNewChart.cell, state.activeCell) &&
      scrolledForNewChart.to.scrollLeft === state.scrollLeft &&
      scrolledForNewChart.to.scrollTop === state.scrollTop
    )
  )
    return state2;
  let scrolledBack = clampScrollOfView(
    {
      ...state2,
      ...scrolledForNewChart.from,
    },
    reads,
  );
  return scrolledBack.scrollLeft !== state.scrollLeft || scrolledBack.scrollTop !== state.scrollTop
    ? {
        ...scrolledBack,
        movesOfViewByItself: state.movesOfViewByItself + 1,
      }
    : scrolledBack;
}
export function scrollBackIfNewChartGone(state: PageState, reads: ReadsWithTextMeasurer) {
  let { scrolledForNewChart: scrolledForNewChart } = state;
  return scrolledForNewChart !== null &&
    !reads
      .placementsIn(scrolledForNewChart.cell.sheetId)
      .some(({ placementId: placementId }: Dynamic) => placementId === scrolledForNewChart.placementId)
    ? scrollBackFromNewChart(state, reads)
    : state;
}
export const ARROW_KEY_DIRECTIONS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};
export const isUndoOrFormulasToggle = ({ kind: kind }: Dynamic) => kind === 'undoOrRedo' || kind === 'showOrHideFormulas';
export const PLACED_VIEW_SIZE_STEP = 10;
export const PLACED_VIEW_LEAST_DRAG = 3;
export const placementById = ({ sheetId: state }: Dynamic, reads: WorkbookReads, placementId?: Dynamic) =>
  reads.placementsIn(state).find((input?: Dynamic) => input.placementId === placementId) ?? null;
export const placedViewName = (reads: WorkbookReads, { viewId: viewId }: Dynamic) => reads.viewAsItStands(viewId)?.view.name ?? '';
export const lowerIndexOrFallback = (first?: Dynamic, second?: Dynamic, prefersSecond?: Dynamic) =>
  first !== null && second !== null ? Math.min(first, second) : prefersSecond ? second : first;
export const isIndexAfter = (first?: Dynamic, second?: Dynamic) => first !== null && second !== null && first > second;
export const columnAnchorOf = ({ columnIndex: columnIndex, offsetFromAnchorCell: offsetFromAnchorCell }: Dynamic) => ({
  index: columnIndex,
  pixelsPast: offsetFromAnchorCell.xInPixels,
});
export const rowAnchorOf = ({ rowIndex: rowIndex, offsetFromAnchorCell: offsetFromAnchorCell }: Dynamic) => ({
  index: rowIndex,
  pixelsPast: offsetFromAnchorCell.yInPixels,
});
export const placementAnchorOf = (column?: Dynamic, row?: Dynamic) => ({
  rowIndex: row.index,
  columnIndex: column.index,
  offsetFromAnchorCell: {
    xInPixels: column.pixelsPast,
    yInPixels: row.pixelsPast,
  },
});
export const anchorOffsetPixels = ({ columnEdges: columnEdges, rowEdges: rowEdges }: Dynamic, placement?: Dynamic) => ({
  left: clampPixelsPast(columnEdges, columnAnchorOf(placement)),
  top: clampPixelsPast(rowEdges, rowAnchorOf(placement)),
});
export const scrollPositionOf = ({ scrollLeft: scrollLeft, scrollTop: scrollTop }: Dynamic) => ({
  scrollLeft: scrollLeft,
  scrollTop: scrollTop,
});
export const isDraggingPlacedView = ({ dragging: dragging }: Dynamic) =>
  dragging?.kind === 'movingPlacedView' || dragging?.kind === 'sizingPlacedView';
export const CHART_MENU_INSET = 16;
export const PLACED_VIEW_MARGIN = 8;
export const ASK_BOX_SIZE = {
  gap: 12,
  height: 249,
  width: 312,
};
export const ADDED_CHART_CARD_SIZE = {
  height: 40,
  gap: 8,
};
export const heightOfAddedChartCard = ({ zoom: zoom }: Dynamic) =>
  (ADDED_CHART_CARD_SIZE.gap + ADDED_CHART_CARD_SIZE.height) / zoom;
export const isBoxInView = ({ left: left, top: top, width: width, height: height, showsIn: showsIn }: Dynamic) =>
  left + width > showsIn.left && top + height > showsIn.top && left < showsIn.left + showsIn.width && top < showsIn.top + showsIn.height;
export const NODE_REF_PATTERN = /^node\/(.+)$/;
export const nodeIdOfRef = (ref?: Dynamic) => NODE_REF_PATTERN.exec(ref)?.[1] ?? null;
export const nodeRefOf = (nodeId?: Dynamic) => `node/${nodeId}`;
export const chartOfViewCache = new (WeakMap as Dynamic)();
export const placedViewsToDraw = (state: PageState, reads: ReadsWithTextMeasurer, isReadOnly?: Dynamic) =>
  reads.placementsIn(state.sheetId).map((placement?: Dynamic) => {
    let { placementId: placementId, viewId: viewId } = placement;
    let box = placedViewBox(state, reads, placementAsDragged(state, reads, placement));
    let { dragging: dragging } = state;
    return {
      placementId: placementId,
      viewId: viewId,
      name: placedViewName(reads, placement),
      caption: reads.viewAsItStands(viewId)?.view.elements[0]?.embed.caption ?? '',
      box: box,
      isInView: isBoxInView(box),
      chart: cachedChartOfView(reads.viewAsItStands(viewId)),
      isSelected: state.placementSelected === placementId,
      canBeChanged: !isReadOnly,
      doesMouseBringTools: !isReadOnly && state.mode.kind === 'navigating' && dragging === null,
      isHeld: (dragging?.kind === 'movingPlacedView' || dragging?.kind === 'sizingPlacedView') && dragging.placementId === placementId,
      isHeldOnTheSpot: dragging?.kind === 'movingPlacedView' && dragging.placementId === placementId && dragging.landing === null,
      askBoxStands: isReadOnly ? null : askBoxStand(box, state.zoom, cellsHeightAboveFloats(state)),
    };
  });
export const cellAddressAt = ({ rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic, ownRowOrder?: Dynamic) =>
  areaToA1AsStored(
    {
      topRowIndex: rowIndex,
      leftColumnIndex: columnIndex,
      rowCount: 1,
      columnCount: 1,
    },
    ownRowOrder,
  );
export const isSameOffset = (offset?: Dynamic, otherOffset?: Dynamic) =>
  offset.xInPixels === otherOffset.xInPixels && offset.yInPixels === otherOffset.yInPixels;
export const isSameAnchor = (target?: Dynamic, placement?: Dynamic) =>
  target.rowIndex === placement.rowIndex &&
  target.columnIndex === placement.columnIndex &&
  isSameOffset(target.offsetFromAnchorCell, placement.offsetFromAnchorCell);
export const selectPlacement = (state: PageState, placementId?: Dynamic) => ({
  ...state,
  placementSelected: placementId,
  menu: state.menu?.ofChart?.placementId === placementId ? state.menu : null,
  contextBarMenu: null,
});
export const isWithinLeastDrag = ({ pressedAt: dragging, leastDrag: leastDrag }: Dynamic, pointer?: Dynamic) =>
  Math.hypot(pointer.x - dragging.x, pointer.y - dragging.y) < leastDrag;
