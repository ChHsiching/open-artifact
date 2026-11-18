import type { Dynamic } from '../dynamic.ts';
import { layoutOfView } from '../grid/layout.ts';
import { rangeSpansOnScreen, frozenColumnsWidth, frozenRowsHeight } from '../grid/geometry.ts';
import { cutSidesOfTableSpans } from './table-drawing.ts';
import { drawnOwnFiltersOfSheet, ownFilterNotDrawnYet } from './own-filters.ts';
import { areaOfFilteredTable } from './finding.ts';
import { isAreaWithin } from '../selection/several-ranges.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function clipOutlineSpan(span?: Dynamic) {
  let { start: start, end: end, showFrom: showFrom, showTo: showTo } = span;
  if (end <= start || end <= showFrom || start >= showTo) return null;
  let from = Math.max(start, showFrom - OUTLINE_OVERHANG);
  return [from, Math.min(end, showTo + OUTLINE_OVERHANG), isSpanAtHeaders(span) ? -OUTLINE_OVERHANG : Math.max(showFrom - from, -OUTLINE_OVERHANG)];
}
export function tableOutlinesOf(tables: Dynamic, view: Dynamic, reads: ReadsWithTextMeasurer) {
  if (tables.length === 0) return NO_TABLE_OUTLINES;
  let layout = layoutOfView(view, reads);
  return tables.flatMap(({ key: key, where: where, more: more }: Dynamic) => {
    let spans = where === null ? null : rangeSpansOnScreen(where, view, layout, view);
    let [across, down] = spans === null ? [null, null] : [clipOutlineSpan(spans.across), clipOutlineSpan(spans.down)];
    if (across === null || down === null) return [];
    let [[leftX, rightX, cutAtLeft], [topY, bottomY, cutAtTop]] = [across, down];
    let sidesCut = spans === null ? [] : cutSidesOfTableSpans(spans, layout);
    return [
      {
        tableKey: key,
        left: leftX,
        top: topY,
        width: rightX - leftX,
        height: bottomY - topY,
        cutAtLeft: cutAtLeft,
        cutAtTop: cutAtTop,
        frozenAcross: (view.scrollLeft === 0 ? 0 : frozenColumnsWidth(layout)) - leftX,
        frozenDown: (view.scrollTop === 0 ? 0 : frozenRowsHeight(layout)) - topY,
        sidesCut: sidesCut.length === 0 ? null : sidesCut.join(' '),
        isAtRowNumbers: spans !== null && isSpanAtHeaders(spans.across),
        isAtColumnLetters: spans !== null && isSpanAtHeaders(spans.down),
        ...more,
      },
    ];
  });
}
export function tableCardPlacement(
  {
    body: body,
    filteredTableOutlines: filteredTableOutlines2,
    outlineOfFilterNotDrawnYet: outlineOfFilterNotDrawnYet2 = null,
    filterButtons = [],
  }: Dynamic,
  tableKey?: Dynamic,
  zoom: Dynamic = 1,
  cardWidth: Dynamic = 0,
) {
  let outline =
    outlineOfFilterNotDrawnYet2?.tableKey === tableKey
      ? outlineOfFilterNotDrawnYet2
      : filteredTableOutlines2.find((outline2?: Dynamic) => outline2.tableKey === tableKey);
  if (outline === undefined) return null;
  let gap = TABLE_CARD_GAP / zoom;
  let openButton =
    outline === outlineOfFilterNotDrawnYet2
      ? filterButtons.find(({ isOfFoundTable: isOfFoundTable, isListOpen: isListOpen }: Dynamic) => isOfFoundTable && isListOpen)
      : undefined;
  let x = Math.max(outline.left + outline.width, (openButton?.cell.left ?? 0) + (openButton?.cell.width ?? 0)) + gap;
  let fitsBeside = x + cardWidth / zoom + gap <= body.width;
  let y = openButton === undefined ? 0 : body.top + openButton.cell.top + (fitsBeside ? -gap : openButton.cell.height);
  return {
    x: body.left + Math.min(x, body.width - gap),
    y: y,
    byButton:
      openButton === undefined
        ? null
        : {
            underRowOfHeight: fitsBeside ? null : openButton.cell.height,
            cell: `${openButton.r} ${openButton.c}`,
          },
  };
}
export function fitHungCardVertically(
  hungAt?: Dynamic,
  cardHeight?: Dynamic,
  windowHeight?: Dynamic,
  previous?: Dynamic,
  topAtLeast: Dynamic = Number.NEGATIVE_INFINITY,
) {
  let topLimit = Math.max(TABLE_CARD_MARGIN - TABLE_CARD_GAP, topAtLeast);
  let bottomLimit = windowHeight - TABLE_CARD_MARGIN - cardHeight - TABLE_CARD_GAP;
  let rowTop = hungAt.y - (hungAt.underRowOfHeight ?? 0) - TABLE_CARD_GAP;
  let overY = rowTop - cardHeight - TABLE_CARD_GAP;
  let clearAtFoot = Math.max(0, windowHeight - rowTop - TABLE_CARD_MARGIN);
  let place = previous ?? {
    y: hungAt.y,
    where: hungAt.underRowOfHeight === null ? 'level' : 'under',
    clearAtFoot: 0,
  };
  if (place.where === 'over')
    return {
      y: Math.min(place.y, Math.max(Math.min(overY, bottomLimit), topLimit)),
      where: 'over',
      clearAtFoot: clearAtFoot,
    };
  if (place.y <= bottomLimit) return place;
  if (place.where === 'under') {
    let hasRoomUnder = windowHeight - hungAt.y >= TABLE_CARD_MIN_ROOM;
    if (previous !== null && hasRoomUnder) return place;
    let fitsAbove = isClearOfFoot(rowTop, windowHeight);
    if (fitsAbove && overY >= topLimit)
      return {
        y: overY,
        where: 'over',
        clearAtFoot: clearAtFoot,
      };
    if (hasRoomUnder) return place;
    if (fitsAbove && rowTop - topLimit - TABLE_CARD_GAP >= TABLE_CARD_MIN_ROOM)
      return {
        y: topLimit,
        where: 'over',
        clearAtFoot: clearAtFoot,
      };
  }
  return {
    y: Math.min(place.y, Math.max(bottomLimit, topLimit)),
    where: 'level',
    clearAtFoot: 0,
  };
}
export function refitHungCard(state?: Dynamic, windowHeight?: Dynamic, measureCardHeight?: Dynamic, topAtLeast?: Dynamic) {
  if (state.hungAt === null || (!state.isDrawnSince && windowHeight >= state.fittedTo)) return null;
  let previous = state.isDrawnSince ? state.ofFirst : state.place;
  let place = fitHungCardVertically(state.hungAt, measureCardHeight(), windowHeight, previous, topAtLeast);
  return {
    ...state,
    ofFirst: state.isFirst ? place : state.ofFirst,
    place: place,
    isDrawnSince: false,
    fittedTo: windowHeight,
  };
}
export function keepCardOpenPlace(previous?: Dynamic, isCardOpen?: Dynamic, y?: Dynamic) {
  if (previous === null)
    return isCardOpen
      ? {
          y: y,
          isCardOpen: isCardOpen,
        }
      : null;
  if (previous.isCardOpen === isCardOpen) return previous;
  return {
    y: isCardOpen ? y : previous.y,
    isCardOpen: isCardOpen,
  };
}
export const OUTLINE_OVERHANG = 32;
export const isSpanAtHeaders = ({ start: start, showFrom: showFrom }: Dynamic) => start === 0 && showFrom === 0;
export const isAreaInFilteredTable = (view: Dynamic, reads: WorkbookReads, area?: Dynamic) =>
  drawnOwnFiltersOfSheet(view, view.sheetId).some((ownFilter?: Dynamic) => {
    let filteredArea = areaOfFilteredTable(reads, ownFilter);
    return filteredArea !== null && isAreaWithin(area, filteredArea);
  });
export const NO_TABLE_OUTLINES: Dynamic = [];
export const filteredTableOutlines = (view: Dynamic, reads: ReadsWithTextMeasurer) =>
  tableOutlinesOf(
    drawnOwnFiltersOfSheet(view, view.sheetId).map(
      (ownFilter?: Dynamic) => ({
        key: ownFilter.key,
        where: areaOfFilteredTable(reads, ownFilter),
        more: {},
      }),
    ),
    view,
    reads,
  );
export const outlineOfFilterNotDrawnYet = (view: Dynamic, reads: ReadsWithTextMeasurer) =>
  tableOutlinesOf(
    [ownFilterNotDrawnYet(view)].flatMap(
      (ownFilter?: Dynamic) =>
        ownFilter === null
          ? []
          : [
              {
                key: ownFilter.key,
                where: areaOfFilteredTable(reads, ownFilter),
                more: {},
              },
            ],
    ),
    view,
    reads,
  )[0] ?? null;
export const TABLE_CARD_GAP = 6;
export const isCardHungAnew = (lastHung?: Dynamic, tableKey?: Dynamic, byButton?: Dynamic) =>
  lastHung?.tableKey !== tableKey || (byButton !== null && lastHung.cellOfButton !== null && byButton.cell !== lastHung.cellOfButton);
export const hungCardUnderFilterButton = ({ tableKey: tableKey, c: c, hangsFrom: hangsFrom }: Dynamic) => ({
  x: hangsFrom.x,
  y: hangsFrom.y + hangsFrom.height,
  whose: `${tableKey} ${c}`,
  byButton: {
    underRowOfHeight: hangsFrom.height,
    cell: `${tableKey} ${c}`,
  },
});
export const TABLE_CARD_MARGIN = 5;
export const TABLE_CARD_MIN_ROOM = 240;
export const isClearOfFoot = (top?: Dynamic, windowHeight?: Dynamic) => top <= windowHeight - TABLE_CARD_MARGIN;
export const newHungCardState = (hungAt?: Dynamic) => ({
  hungAt: hungAt,
  ofFirst: null,
  place: null,
  isFirst: true,
  isDrawnSince: true,
  hasStepped: false,
  fittedTo: 0,
});
export const rowFollowingCardY = ({ hungAt: hungAt, place: place }: Dynamic, windowHeight?: Dynamic) =>
  hungAt !== null &&
  hungAt.underRowOfHeight !== null &&
  place?.where === 'level' &&
  isClearOfFoot(hungAt.y - hungAt.underRowOfHeight - TABLE_CARD_GAP, windowHeight)
    ? hungAt.y
    : null;
export const hasHungPlaceMoved = (state?: Dynamic, y?: Dynamic) => state.hungAt !== null && state.hungAt.y !== y;
export const markHungCardDrawn = (state?: Dynamic, isFirst?: Dynamic) =>
  isFirst
    ? {
        ...state,
        ofFirst: state.hasStepped ? state.ofFirst : null,
        isFirst: isFirst,
        isDrawnSince: true,
      }
    : {
        ...state,
        isFirst: isFirst,
        isDrawnSince: true,
        hasStepped: true,
      };
export const cardTopLimit = (top?: Dynamic, bottomInset?: Dynamic, barsInset?: Dynamic) =>
  bottomInset > barsInset ? undefined : top;
export const foundTableOutlines = (view: Dynamic, reads: ReadsWithTextMeasurer, foundTables?: Dynamic) =>
  tableOutlinesOf(
    foundTables.map(
      ({ key: key, area: area, comesLater: comesLater }: Dynamic) => ({
        key: key,
        where: area,
        more: {
          comesLater: comesLater,
        },
      }),
    ),
    view,
    reads,
  );
