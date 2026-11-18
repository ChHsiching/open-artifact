import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import {
  newHungCardState,
  cardTopLimit,
  refitHungCard,
  rowFollowingCardY,
  markHungCardDrawn,
  isCardHungAnew,
  hasHungPlaceMoved,
  keepCardOpenPlace,
} from './table-outlines.ts';
import { useBarsInsetAtFoot, useBottomInsetWhileOpen } from '../shell/bottom-insets.ts';
export function measureFullAvailableHeight(element?: Dynamic) {
  element.style.setProperty(AVAILABLE_HEIGHT_PROPERTY, '100vh');
  let { offsetHeight: offsetHeight } = element;
  element.style.removeProperty(AVAILABLE_HEIGHT_PROPERTY);
  return offsetHeight + 1;
}
export function useHungTableCardPlace({
  placeOnScreen: placeOnScreen,
  tableKey: tableKey,
  byButton: byButton,
  goesWithRow = false,
  zoom: zoom,
  grid: grid,
}: Dynamic) {
  let placeRef = React.useRef(null);
  let hungForRef = React.useRef(null);
  let hungRef = React.useRef(newHungCardState(null));
  let cardRef = React.useRef(null);
  let bottomInsetRef = React.useRef(0);
  let barsInsetRef = React.useRef(0);
  let [{ clearAtFoot: clearAtFoot, isOverBars: isOverBars, fits: fits }, setFit] = React.useState({
    clearAtFoot: 0,
    isOverBars: false,
    fits: 0,
  });
  let fitCard = React.useCallback(() => {
    let [place, card] = [placeRef.current, cardRef.current];
    let win = card?.isConnected === true ? card.ownerDocument.defaultView : null;
    if (place === null || card === null || win === null || hasAvailableHeightSet(card)) return;
    let gridElement = grid.current;
    let topAtLeast =
      gridElement === null
        ? undefined
        : cardTopLimit(gridElement.getBoundingClientRect().top + gridElement.clientTop, bottomInsetRef.current, barsInsetRef.current);
    let roomHeight = win.innerHeight - bottomInsetRef.current;
    let hung = refitHungCard(hungRef.current, roomHeight, () => measureFullAvailableHeight(card), topAtLeast);
    if (hung === null) return;
    hungRef.current = hung;
    let rowY = goesWithRow ? rowFollowingCardY(hung, roomHeight) : null;
    placeRef.current = {
      ...place,
      y: rowY ?? hung.place.y,
    };
    let clearAtFootNow = hung.place.clearAtFoot === 0 ? 0 : bottomInsetRef.current + hung.place.clearAtFoot;
    setFit(
      (fit?: Dynamic) => ({
        clearAtFoot: clearAtFootNow,
        isOverBars: rowY !== null,
        fits: fit.fits + 1,
      }),
    );
  }, [grid, goesWithRow]);
  let noteCardDrawn = React.useCallback(
    (card?: Dynamic, isFirstCard?: Dynamic) => {
      if (card === null) return;
      cardRef.current = card;
      hungRef.current = markHungCardDrawn(hungRef.current, isFirstCard);
      fitCard();
    },
    [fitCard],
  );
  let noteFirstCardDrawn = React.useCallback((card?: Dynamic) => noteCardDrawn(card, true), [noteCardDrawn]);
  let noteColumnsCardDrawn = React.useCallback((card?: Dynamic) => noteCardDrawn(card, false), [noteCardDrawn]);
  let isForTable = tableKey !== null;
  let [isByButton, rowHeightUnderButton, cellOfButton] = [byButton !== null, byButton?.underRowOfHeight ?? null, byButton?.cell ?? null];
  let barsInset = useBarsInsetAtFoot();
  let barsInsetWhileOpen = isForTable ? barsInset : 0;
  let bottomInset = Math.max(useBottomInsetWhileOpen(isForTable, false, isByButton && !goesWithRow), barsInsetWhileOpen);
  React.useLayoutEffect(() => {
    let { y: top } = placeOnScreen.getBoundingClientRect();
    bottomInsetRef.current = bottomInset;
    barsInsetRef.current = barsInsetWhileOpen;
    let isHungAnew =
      tableKey !== null &&
      isCardHungAnew(
        hungForRef.current,
        tableKey,
        cellOfButton === null
          ? null
          : {
              cell: cellOfButton,
            },
      );
    if (tableKey === null) hungForRef.current = null;
    else if (isHungAnew || cellOfButton !== null)
      hungForRef.current = {
        tableKey: tableKey,
        cellOfButton: cellOfButton,
      };
    if (isHungAnew || (goesWithRow && isForTable && hasHungPlaceMoved(hungRef.current, top))) {
      placeRef.current = null;
      setFit(
        (fit?: Dynamic) =>
          fit.clearAtFoot === 0 && !fit.isOverBars
            ? fit
            : {
                ...fit,
                clearAtFoot: 0,
                isOverBars: false,
              },
      );
      hungRef.current = newHungCardState(
        isByButton
          ? {
              y: top,
              underRowOfHeight: rowHeightUnderButton === null ? null : rowHeightUnderButton * zoom,
            }
          : null,
      );
    }
    placeRef.current = keepCardOpenPlace(placeRef.current, isForTable, top);
    fitCard();
  }, [
    isForTable,
    tableKey,
    placeOnScreen,
    isByButton,
    rowHeightUnderButton,
    cellOfButton,
    goesWithRow,
    zoom,
    bottomInset,
    barsInsetWhileOpen,
    fitCard,
  ]);
  React.useEffect(() => {
    let win = isForTable ? grid.current?.ownerDocument.defaultView : null;
    win?.addEventListener('resize', fitCard);
    return () => win?.removeEventListener('resize', fitCard);
  }, [isForTable, grid, fitCard]);
  return {
    anchor: React.useMemo(
      () => ({
        fits: fits,
        getBoundingClientRect() {
          let { x: x, y: y } = placeOnScreen.getBoundingClientRect();
          return new (DOMRect as Dynamic)(x, placeRef.current?.y ?? y, 0, 0);
        },
      }),
      [placeOnScreen, fits],
    ),
    clearAtFoot: isOverBars ? 0 : Math.max(barsInset, clearAtFoot),
    noteFirstCardDrawn: noteFirstCardDrawn,
    noteColumnsCardDrawn: noteColumnsCardDrawn,
  };
}
export const TABLE_CARD_WIDTH = 320;
export const AVAILABLE_HEIGHT_PROPERTY = '--available-height';
export const hasAvailableHeightSet = (element?: Dynamic) => element.style.getPropertyValue(AVAILABLE_HEIGHT_PROPERTY) !== '';
