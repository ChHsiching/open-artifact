import { likelyHasKeyboard } from '../kit/platform.ts';
import type { Dynamic } from '../dynamic.ts';
import { commentMarksAtPoint, clipBoxToShown } from '../grid/view-boxes.ts';
import { pointInZoomedElement, boxOnScreen } from '../grid/zoom.ts';
import { COMMENT_LAYER_ATTR, boxInBody, COMMENT_CORNER_ATTR } from '../grid/grid-drawing.ts';
import { isNarrowByTouch } from '../app/media-queries.ts';
import { COMMENT_CARD_ROOM_AT_FOOT } from '../grid/cards-place.ts';
import { popupTopNearRow, boundsAboveKeyboard } from '../ui/popup-room.ts';
import { getKeyboardInset } from '../shell/bottom-insets.ts';
export function markCommentLayersUnderMouse({ grid: grid, gridElement: gridElement, zoom: zoom }: Dynamic, mousePoint?: Dynamic) {
  let layerKeysUnderMouse = mousePoint === null ? [] : commentMarksAtPoint(grid, pointInZoomedElement(gridElement, zoom, mousePoint));
  for (let layerElement of gridElement.querySelectorAll(`[${COMMENT_LAYER_ATTR}]`) as Dynamic)
    layerElement.toggleAttribute('data-is-under-mouse', layerKeysUnderMouse.includes(layerElement.getAttribute(COMMENT_LAYER_ATTR) ?? ''));
  return layerKeysUnderMouse.at(-1) ?? null;
}
export function commentCardPointOnItsPoint(cellsRect?: Dynamic, edges?: Dynamic) {
  let rightX = cellsRect.x + cellsRect.width + COMMENT_CARD_GAP;
  if (rightX + COMMENT_CARD_WIDTH <= Math.min(edges.body, edges.frame - COMMENT_CARD_FRAME_MARGIN)) return rightX;
  let leftX = cellsRect.x - COMMENT_CARD_GAP - COMMENT_CARD_WIDTH;
  return leftX >= Math.max(edges.bodyLeft, COMMENT_CARD_FRAME_MARGIN) ? leftX : null;
}
export function commentCardPointBesideCells(
  cellsRect?: Dynamic,
  dropsBelowCells?: Dynamic,
  lift?: Dynamic,
  edges?: Dynamic,
  mayGoBeside: Dynamic = true,
) {
  let [rightEdge, bottomEdge] = [cellsRect.x + cellsRect.width, cellsRect.y + cellsRect.height];
  let besideX = commentCardPointOnItsPoint(cellsRect, edges);
  if (mayGoBeside && besideX !== null)
    return {
      x: besideX - COMMENT_CARD_GAP,
      y: cellsRect.y - lift,
    };
  if (!dropsBelowCells)
    return {
      x: besideX === null ? rightEdge : besideX - COMMENT_CARD_GAP,
      y: bottomEdge,
    };
  let frameEdgeLimit = edges.frame - COMMENT_CARD_ROOM_AT_FRAME_EDGE;
  let fitsFromCellsLeft = cellsRect.x + COMMENT_CARD_WIDTH <= Math.min(edges.body, frameEdgeLimit);
  let leftOfRightEdge =
    rightEdge <= frameEdgeLimit
      ? Math.max(0, rightEdge - COMMENT_CARD_WIDTH - COMMENT_CARD_GAP)
      : Math.min(rightEdge + COMMENT_CARD_GAP, edges.frame - 1);
  return {
    x: fitsFromCellsLeft ? cellsRect.x - COMMENT_CARD_GAP : leftOfRightEdge,
    y: bottomEdge + COMMENT_CARD_DROP - lift,
  };
}
export function commentPreviewPointOnItsPoint(cellsRect?: Dynamic, edges?: Dynamic, room?: Dynamic) {
  let besideX = commentCardPointOnItsPoint(cellsRect, edges);
  if (besideX !== null) {
    let highestTop = room.lowestFoot - (room.heightOfPreview ?? DEFAULT_COMMENT_PREVIEW_HEIGHT);
    let top = cellsRect.y <= highestTop ? cellsRect.y : room.heightOfPreview === null ? room.underFrame : Math.max(0, highestTop);
    return {
      x: besideX,
      y: top,
    };
  }
  return {
    x:
      cellsRect.x + COMMENT_CARD_WIDTH <= Math.min(edges.body, edges.frame - COMMENT_CARD_ROOM_AT_FRAME_EDGE)
        ? cellsRect.x
        : Math.max(0, cellsRect.x + cellsRect.width - COMMENT_CARD_WIDTH),
    y: cellsRect.y + cellsRect.height + COMMENT_CARD_DROP,
  };
}
export function commentMarkRectOnPage(mark: Dynamic, { grid: grid, gridElement: gridElement, zoom: zoom }: Dynamic) {
  let { left: left, top: top, width: width, height: height } = boxInBody(clipBoxToShown(mark), grid.body);
  return {
    cells: boxOnScreen(gridElement, zoom, {
      x: left,
      y: top,
      width: width,
      height: height,
    }),
    edges: {
      bodyLeft: isNarrowByTouch()
        ? 1 / 0
        : boxOnScreen(gridElement, zoom, {
            x: grid.body.left,
            y: 0,
            width: 0,
            height: 0,
          }).x,
      body: boxOnScreen(gridElement, zoom, {
        x: grid.body.left + grid.body.width,
        y: 0,
        width: 0,
        height: 0,
      }).x,
      frame: gridElement.ownerDocument.defaultView?.innerWidth ?? 1 / 0,
    },
  };
}
export function placeCommentCard(
  openMode: Dynamic,
  mark: Dynamic,
  { grid: grid, gridElement: gridElement, zoom: zoom }: Dynamic,
  cardHeight: Dynamic = null,
) {
  let { cells: cellsRect, edges: edges } = commentMarkRectOnPage(mark, {
    grid: grid,
    gridElement: gridElement,
    zoom: zoom,
  });
  let ownerDocument = gridElement.ownerDocument;
  let rootFontSize = () => {
    let fontSize = Number.parseFloat(ownerDocument.defaultView?.getComputedStyle(ownerDocument.documentElement).fontSize ?? '');
    return Number.isNaN(fontSize) ? 16 : fontSize;
  };
  let lift = openMode === 'box' ? -(2.25 * rootFontSize() + COMMENT_CARD_GAP) : COMMENT_CARD_GAP;
  let topOfBarAtFoot =
    boxOnScreen(gridElement, zoom, {
      x: 0,
      y: grid.body.top + grid.lowestFootWithRoomForCommentCard,
      width: 0,
      height: 0,
    }).y + COMMENT_CARD_ROOM_AT_FOOT;
  let placedTop =
    openMode !== 'cardOnItsPoint' && isNarrowByTouch() && commentCardPointOnItsPoint(cellsRect, edges) === null
      ? popupTopNearRow(
          {
            top: cellsRect.y,
            foot: cellsRect.y + cellsRect.height,
          },
          boundsAboveKeyboard({
            height: ownerDocument.defaultView?.innerHeight ?? 0,
            topOfPage: ownerDocument.body.getBoundingClientRect().top,
            heightUnderKeyboard: getKeyboardInset(),
            topOfBarAtFoot: topOfBarAtFoot,
            rem: rootFontSize(),
          }),
          lift,
          openMode === 'box' ? null : (cardHeight ?? DEFAULT_COMMENT_CARD_HEIGHT),
        )
      : null;
  let { x: pointX, y: pointY } =
    openMode === 'cardOnItsPoint'
      ? commentPreviewPointOnItsPoint(cellsRect, edges, {
          heightOfPreview: cardHeight,
          lowestFoot: topOfBarAtFoot - COMMENT_PREVIEW_FOOT_GAP,
          underFrame: (ownerDocument.defaultView?.innerHeight ?? 0) + COMMENT_PREVIEW_UNDER_FRAME,
        })
      : commentCardPointBesideCells(
          cellsRect,
          placedTop !== null ||
            isCommentMarkAboveCardFoot(mark, {
              grid: grid,
            }),
          lift,
          edges,
          mayCommentCardGoBeside(openMode, clipBoxToShown(mark).top, grid.lowestFootWithRoomForCommentCard),
        );
  let { scrollX = 0, scrollY = 0 } = ownerDocument.defaultView ?? {};
  return {
    x: Math.round(pointX + scrollX),
    y: Math.round((placedTop ?? pointY) + scrollY),
  };
}
export function shutCommentBoxNowAndOnFocus(ownerDocument?: Dynamic, shutCommentBox?: Dynamic) {
  shutCommentBox();
  if (ownerDocument.hasFocus()) return stopWaitingForNothing;
  let abortController = new (AbortController as Dynamic)();
  setTimeout(() => abortController.abort(), 1000);
  ownerDocument.defaultView?.addEventListener('focus', shutCommentBox, {
    once: true,
    signal: abortController.signal,
  });
  return () => abortController.abort();
}
export function previewCommentCardOnItsPoint(commentCards?: Dynamic, commentKey?: Dynamic, placeContext?: Dynamic) {
  let mark = placeContext.grid.marksOfComments.find(({ key: markKey }: Dynamic) => markKey === commentKey);
  if (mark === undefined) return;
  let [markRect, { cells: cellsRect, edges: edges }] = [clipBoxToShown(mark), commentMarkRectOnPage(mark, placeContext)];
  let room = {
    lowestFootWithRoom: placeContext.grid.lowestFootWithRoomForCommentCard,
    zoom: placeContext.zoom,
  };
  if (doesCommentCardFitRightOf(commentCardPointOnItsPoint(cellsRect, edges) !== null, markRect.top + markRect.height, room))
    commentCards.preview(commentKey, placeCommentCard('cardOnItsPoint', mark, placeContext, commentCards.heightOfPreview(commentKey)));
}
export const isMobileTouchDevice = ({ userAgent: userAgent, maxTouchPoints: maxTouchPoints }: Dynamic) =>
  !userAgent.includes(' Electron/') && (/Android|iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1));
export const commentCornerKeyOf = (node?: Dynamic) => (node instanceof Element ? node.getAttribute(COMMENT_CORNER_ATTR) : null);
export const COMMENT_CARD_GAP = 4;
export const COMMENT_CARD_WIDTH = 300;
export const COMMENT_CARD_FRAME_MARGIN = 8;
export const COMMENT_PREVIEW_FOOT_GAP = 8;
export const COMMENT_CARD_DROP = 2;
export const COMMENT_CARD_ROOM_AT_FRAME_EDGE = 320;
export const DEFAULT_COMMENT_PREVIEW_HEIGHT = 480;
export const COMMENT_PREVIEW_UNDER_FRAME = 32;
export const isCommentMarkAboveCardFoot = (mark: Dynamic, { grid: grid }: Dynamic) => {
  let markRect = clipBoxToShown(mark);
  return markRect.top + markRect.height <= grid.lowestFootWithRoomForCommentCard;
};
export const mayCommentCardGoBeside = (openMode?: Dynamic, markTop?: Dynamic, lowestFoot?: Dynamic) =>
  openMode === 'box' || (openMode === 'card' && markTop <= lowestFoot);
export const DEFAULT_COMMENT_CARD_HEIGHT = 176;
export const commentCardPlaces = (
  placeContext: Dynamic,
  { asked: asked, onItsPoint: onItsPoint, heightOfCard: heightOfCard, heightOfPreview: heightOfPreview }: Dynamic,
) => ({
  ofComments: Object.fromEntries(
    placeContext.grid.marksOfComments.map(
      (mark?: Dynamic) => [
        mark.key,
        placeCommentCard(
          mark.key === onItsPoint ? 'cardOnItsPoint' : mark.key === asked ? 'card' : 'cardUnasked',
          mark,
          placeContext,
          (mark.key === onItsPoint ? heightOfPreview : heightOfCard)(mark.key),
        ),
      ],
    ),
  ),
  ofBox: placeContext.grid.markOfNewComment === null ? null : placeCommentCard('box', placeContext.grid.markOfNewComment, placeContext),
});
export const commentOpenModeFor = (device?: Dynamic) => (device.hasKeyboard && !isMobileTouchDevice(device) ? 'reply' : 'card');
export const stopWaitingForNothing = () => {};
export const didMouseLeaveIntoOverlay = (event?: Dynamic, overlayRect?: Dynamic) => {
  let { relatedTarget: relatedTarget, clientX: clientX, clientY: clientY } = event.nativeEvent;
  let isInsideOverlay =
    clientX > overlayRect.left + 2 && clientX < overlayRect.right - 2 && clientY > overlayRect.top + 2 && clientY < overlayRect.bottom - 2;
  let isOntoOverlay =
    relatedTarget === null || (relatedTarget instanceof Element && relatedTarget.closest('[data-comments-layer]') !== null);
  return isOntoOverlay && isInsideOverlay;
};
export const COMMENT_PREVIEW_ROOM_BELOW = 80;
export const doesCommentCardFitRightOf = (
  fitsBeside?: Dynamic,
  markFoot?: Dynamic,
  { lowestFootWithRoom: lowestFootWithRoom, zoom: zoom }: Dynamic = {},
) => fitsBeside || markFoot <= lowestFootWithRoom + COMMENT_PREVIEW_ROOM_BELOW / zoom;
export const createSheetCommentActions = (commentCards?: Dynamic, placeContextNow?: Dynamic) => {
  let stopWaitingForFocus: Dynamic = stopWaitingForNothing;
  return {
    openBox({ anchor: anchor, cells: cells, sheetNumber: sheetNumber, isForAgent: isForAgent }: Dynamic) {
      let placeContext = placeContextNow();
      let box = placeContext?.grid.selectionBox ?? placeContext?.grid.activeCellBox ?? null;
      if (placeContext === null || box === null) return;
      stopWaitingForFocus();
      let boxPoint = placeCommentCard('box', box, placeContext);
      let boxToOpen = {
        anchor: anchor,
        at: boxPoint,
        label: cells,
        sheetNumber: sheetNumber,
        isForAgent: isForAgent,
      };
      commentCards.openBox(boxToOpen);
    },
    open(commentKey?: Dynamic, isFromPage?: Dynamic) {
      let placeContext = placeContextNow();
      let mark = placeContext?.grid.marksOfComments.find(({ key: markKey }: Dynamic) => markKey === commentKey);
      if (placeContext === null || mark === undefined) return;
      stopWaitingForFocus();
      commentCards.open(
        commentKey,
        commentCards.heightOfPreview(commentKey) === null
          ? placeCommentCard('card', mark, placeContext, commentCards.heightOfCard(commentKey))
          : placeCommentCard('cardOnItsPoint', mark, placeContext, commentCards.heightOfPreview(commentKey)),
        isFromPage
          ? 'page'
          : commentOpenModeFor({
              hasKeyboard: likelyHasKeyboard(),
              userAgent: (navigator as Dynamic).userAgent,
              maxTouchPoints: (navigator as Dynamic).maxTouchPoints,
            }),
      );
    },
    shut: () => commentCards.shut(),
    endMode: (mode?: Dynamic) => commentCards.endMode(mode),
    shutBox() {
      let ownerDocument = placeContextNow()?.gridElement.ownerDocument;
      if (ownerDocument === undefined) commentCards.shutBox();
      else stopWaitingForFocus = shutCommentBoxNowAndOnFocus(ownerDocument, () => commentCards.shutBox());
    },
  };
};
