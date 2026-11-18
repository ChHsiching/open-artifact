import type { Dynamic } from '../dynamic.ts';
import { resetScrollForFreezeDrag, layoutOfView } from './layout.ts';
import { showSheetPointedIn } from '../formulas/sheet-pointed-in.ts';
import { rowPanes, columnPanes } from './geometry.ts';
import { errorsOfferShown } from '../formulas/fix/errors-offer.ts';
import { a1OfFirstAndLast } from '../view/page-view.ts';
import { GRID_PIXEL_SLACK } from './entry-hints.ts';
import { profileOfUser } from '../chips/people-list.ts';
import { CELL_POPUP_SIDE_OFFSETS, POPUP_EDGE_GAP } from '../ui/popup-placement.ts';
import { drawnBoxOfSpans } from './view-boxes.ts';
import { shownLineAtOrBefore, shownLineAtOrAfter } from '../model/line-sizes.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
import type { PageState } from '../state/initial-state.ts';
export function linesOnShowOf(state: PageState, reads: ReadsWithTextMeasurer) {
  let view = resetScrollForFreezeDrag(showSheetPointedIn(state, reads));
  let [layout, lines] = [layoutOfView(view, reads), reads.linesOf(view.sheetId)];
  return {
    sheetId: view.sheetId,
    rows: axisLinesOnShow(lines?.rows, layout.rowEdges, layout.rowsOutOfSight, rowPanes(view, layout, view)),
    columns: axisLinesOnShow(lines?.columns, layout.columnEdges, layout.columnsOutOfSight, columnPanes(view, layout, view)),
  };
}
export function sideForExplainedCard(cellBox?: Dynamic, pageSize?: Dynamic, zoom?: Dynamic, boxesInTheWay?: Dynamic) {
  let [cardWidth, cardHeight] = [EXPLAINED_CARD_SIZE.width / zoom, EXPLAINED_CARD_SIZE.height / zoom];
  let margins = EXPLAINED_CARD_MARGINS;
  let places = [
    {
      side: 'right',
      left: cellBox.left + cellBox.width,
      top: cellBox.top,
    },
    {
      side: 'under',
      left: cellBox.left,
      top: cellBox.top + cellBox.height,
    },
  ];
  let isInTheWay = ({ left: left, top: top }: Dynamic, box?: Dynamic) =>
    !isSameBoxCorner(box, cellBox) &&
    left < box.left + box.width &&
    box.left < left + cardWidth &&
    top < box.top + box.height &&
    box.top < top + cardHeight;
  let placesThatFit = places.filter(
    (place?: Dynamic) =>
      place.side === 'right'
        ? place.left + cardWidth + margins.right / zoom <= pageSize.width && cellBox.top + EXPLAINED_CARD_MIN_ROOM / zoom <= pageSize.height
        : place.top + cardHeight + margins.under / zoom <= pageSize.height,
  );
  return (
    (placesThatFit.find((place?: Dynamic) => !boxesInTheWay.some((box?: Dynamic) => isInTheWay(place, box))) ?? placesThatFit[0])
      ?.side ?? null
  );
}
export function errorsOfferedView(state: PageState, reads: ReadsWithTextMeasurer) {
  let errorsArea = errorsOfferShown(state, reads);
  let cells = errorsArea === null ? null : a1OfFirstAndLast(errorsArea, reads);
  return cells === null
    ? null
    : {
        count: state.errorsOffered?.count ?? 0,
        cells: cells,
      };
}
export function errorsOfferCornerPlace(
  selectionRect: Dynamic,
  { areMoreBelow: areMoreBelow, leftOfFirst: leftOfFirst, rightOfFixes: rightOfFixes }: Dynamic,
  zoom?: Dynamic,
  explainedCard?: Dynamic,
  cellBoxes?: Dynamic,
  otherBoxes?: Dynamic,
) {
  let [offerHeight, offerWidth] = [ERRORS_OFFER_HEIGHT / zoom, ERRORS_OFFER_WIDTH / zoom];
  let lowestTop = selectionRect.bottom - offerHeight;
  let rightmostLeft = Math.max(selectionRect.left, selectionRect.right - offerWidth);
  let freePlaceFrom = (boxes?: Dynamic, left2?: Dynamic, startTop?: Dynamic, direction?: Dynamic) => {
    let boxesInColumn = boxes.filter(
      (box?: Dynamic) => left2 + GRID_PIXEL_SLACK < box.left + box.width && box.left < left2 + offerWidth,
    );
    let freeTopFrom = (top2?: Dynamic, boxes2?: Dynamic) => {
      let overlapping = boxes2.filter(
        (box?: Dynamic) => top2 + GRID_PIXEL_SLACK < box.top + box.height && box.top + GRID_PIXEL_SLACK < top2 + offerHeight,
      );
      if (overlapping.length === 0) return top2;
      return freeTopFrom(
        direction === 'down'
          ? (Math.max as Dynamic)(...overlapping.map((box?: Dynamic) => box.top + box.height))
          : (Math.min as Dynamic)(...overlapping.map((box?: Dynamic) => box.top)) - offerHeight,
        boxes2.filter((box?: Dynamic) => !overlapping.includes(box)),
      );
    };
    let top = freeTopFrom(startTop, boxesInColumn);
    return (direction === 'down' || selectionRect.top <= top) && top <= lowestTop
      ? {
          left: left2,
          top: top,
        }
      : null;
  };
  let cardTopPart = (ERRORS_OFFER_HEIGHT - ERRORS_OFFER_TOP_PART) / zoom;
  let cardBoxes =
    explainedCard === null
      ? []
      : [
          {
            ...explainedCard,
            top: explainedCard.top + cardTopPart,
            height: explainedCard.height - cardTopPart,
          },
        ];
  let boxesInTheWay = [...cardBoxes, ...cellBoxes, ...otherBoxes].filter((box?: Dynamic) => !('runsOnFromError' in box));
  let boxesInError = [...cardBoxes, ...cellBoxes.filter(({ isInError: isInError }: Dynamic) => isInError)];
  let offeredBoxes = cellBoxes.filter((box?: Dynamic) => box.isOfOffer && box.isWholeInView);
  let lastOffered = offeredBoxes.reduce(
    (last?: Dynamic, box?: Dynamic) =>
      last === null || box.top > last.top + 0.5 || (box.top > last.top - 0.5 && box.left > last.left) ? box : last,
    null,
  );
  if (lastOffered !== null) {
    let [items, items2] = [lastOffered.left + lastOffered.width, lastOffered.top + lastOffered.height];
    let value = areMoreBelow
      ? null
      : freePlaceFrom(
          boxesInTheWay,
          lastOffered.left <= rightmostLeft ? lastOffered.left : Math.max(selectionRect.left, items - offerWidth),
          items2,
          'down',
        );
    if (value !== null && value.top - items2 <= ERRORS_OFFER_MAX_DROP / zoom) return value;
    let value2 = areMoreBelow || items > rightmostLeft ? null : freePlaceFrom(boxesInTheWay, items, lastOffered.top, 'down');
    if (value2?.top === lastOffered.top) return value2;
    let value3 = (Math.max as Dynamic)(...offeredBoxes.map((box?: Dynamic) => box.left + box.width));
    let value4 = Math.max(value3, rightOfFixes);
    let value5 = (Math.min as Dynamic)(...offeredBoxes.map((box?: Dynamic) => box.left)) - offerWidth;
    let value6 =
      (value4 <= rightmostLeft ? freePlaceFrom(boxesInError, value4, lowestTop, 'up') : null) ??
      (value3 <= rightmostLeft ? freePlaceFrom(boxesInError, value3, lowestTop, 'up') : null) ??
      (selectionRect.left <= value5 ? freePlaceFrom(boxesInError, value5, lowestTop, 'up') : null);
    if (value6 !== null) return value6;
  }
  let left = clampWithinBounds(selectionRect.left, leftOfFirst, rightmostLeft);
  return freePlaceFrom(boxesInError, left, lowestTop, 'up') ?? freePlaceFrom(cardBoxes, left, lowestTop, 'up');
}
export function selectionSummaryPlace(box?: Dynamic, pageSize?: Dynamic) {
  let height = SELECTION_SUMMARY_HEIGHT;
  let right = Math.min(box.left + box.width, pageSize.width);
  let topBelow = box.top + box.height + SELECTION_SUMMARY_GAP;
  let topAbove = box.top - SELECTION_SUMMARY_GAP - height;
  let lowestTop = pageSize.height - SELECTION_SUMMARY_GAP - height;
  return {
    center: (Math.max(box.left, 0) + right) / 2,
    top: topBelow <= lowestTop ? topBelow : topAbove >= SELECTION_SUMMARY_GAP && topAbove <= lowestTop ? topAbove : lowestTop,
    height: height,
  };
}
export function chipPersonOf(profilesById?: Dynamic, askedUserId?: Dynamic) {
  let { userId: userId, name: name, avatarUrl: avatarUrl } = profileOfUser(profilesById, askedUserId);
  return {
    userId: userId,
    name: name,
    avatarUrl: avatarUrl === '' ? null : avatarUrl,
  };
}
export const SELECTION_SUMMARY_HEIGHT = 20;
export const ERRORS_OFFER_HEIGHT = 84;
export const ERRORS_OFFER_TOP_PART = 44;
export const ERRORS_OFFER_WIDTH = 304;
export const ERRORS_OFFER_MAX_DROP = 120;
export const EXPLAINED_CARD_MIN_ROOM = 52;
export const COMMENT_CARD_ROOM_AT_FOOT = 340;
export const EXPLAINED_CARD_SIZE = {
  width: 320,
  height: 120,
};
export const EXPLAINED_CARD_MARGINS = {
  right: CELL_POPUP_SIDE_OFFSETS.right + POPUP_EDGE_GAP,
  under: CELL_POPUP_SIDE_OFFSETS.under + POPUP_EDGE_GAP,
};
export const isSameBoxCorner = (first?: Dynamic, second?: Dynamic) =>
  Math.abs(first.left - second.left) < 0.5 && Math.abs(first.top - second.top) < 0.5;
export const isBoxShownOrEmpty = (spans?: Dynamic) =>
  drawnBoxOfSpans(spans) !== null || spans.across.end === spans.across.start || spans.down.end === spans.down.start;
export const rectOfSpans = ({ across: across, down: down }: Dynamic) => ({
  left: across.start,
  top: down.start,
  width: across.end - across.start,
  height: down.end - down.start,
});
export const clampWithinBounds = (low?: Dynamic, value?: Dynamic, high?: Dynamic) => Math.max(low, Math.min(value, high));
export const FIX_PILL_REACH = 260;
export const FIX_PILL_ROOM_ABOVE = 64;
export const SELECTION_SUMMARY_GAP = 3;
export const doColumnSpansOverlap = (first?: Dynamic, second?: Dynamic) =>
  first.leftColumnIndex < second.leftColumnIndex + second.columnCount && second.leftColumnIndex < first.leftColumnIndex + first.columnCount;
export const NO_LINES_IN_TEXT_BOX: Dynamic = [];
export const NO_NUMBERS_OF_LINES: Dynamic = [];
export const NO_OTHER_PEOPLE: Dynamic = [];
export const NO_BORDER_LINES: Dynamic = [];
export const linesAroundIndexes = (indexes?: Dynamic, edges?: Dynamic) => ({
  before: shownLineAtOrBefore(edges, (indexes[0] ?? 0) - 1),
  indexes: indexes,
  after: shownLineAtOrAfter(edges, (indexes.at(-1) ?? 0) + 1),
});
export const axisLinesOnShow = (order?: Dynamic, edges?: Dynamic, outOfSight?: Dynamic, panes?: Dynamic) => ({
  order: order ?? null,
  outOfSight: outOfSight,
  edges: edges,
  frozenCount: panes.find(({ areFrozen: areFrozen }: Dynamic) => areFrozen)?.count ?? 0,
  scroll: panes.find(({ areFrozen: areFrozen }: Dynamic) => !areFrozen)?.scroll ?? 0,
});
