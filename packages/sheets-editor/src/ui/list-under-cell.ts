import { Popover } from '../kit/popover.tsx';
import { MENU_GROUP_LABEL_CLASSES, MENU_ITEM_FORCED_COLORS_HIGHLIGHT_CLASSES, Menu, menuItemVariants } from '../kit/menu.tsx';
import { useUiWindow } from '../kit/theme.tsx';
import { OverflowTooltip } from '../kit/tooltip.tsx';
import { Icon, LeadingIcon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { pushTopLayerClose } from '../shell/top-layer-close.ts';
import { editCardHeadingLabel, deleteCardHeadingLabel, currentColorLabel, cardAndRowLabel } from '../i18n/menu-labels.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { useCoveredUnderCells, popupCollisionPadding } from '../shell/bottom-insets.ts';
import { cachedOptionChipColors, setSwatchColors } from '../format/cell-colors.ts';
import { fillPaintStyle, textPaintStyle } from '../grid/cell-drawing.ts';
import { dropdownPaneMessages } from '../i18n/format-labels.ts';
import { optionColorName } from '../i18n/chip-labels.ts';
import { useCoarsePointer } from '../app/media-queries.ts';
export let lastPointerPoint: Dynamic;
export let didPressBeginInListUnderCell: Dynamic;
export let scrollTopUnderListCard: Dynamic;
export let rowNotToScrollIntoView: Dynamic;
export function reportTimeAfterNextPaint(win?: Dynamic, report?: Dynamic) {
  if (win === undefined) {
    report(performance.now());
    return () => {};
  }
  let isPending: Dynamic = true;
  let reportNow = () => {
    if (isPending) report(win.performance.now());
    isPending = false;
  };
  report(Number.POSITIVE_INFINITY);
  let timeoutId: Dynamic;
  let frameId = win.requestAnimationFrame(() => {
    timeoutId = win.setTimeout(reportNow);
  });
  return () => {
    win.cancelAnimationFrame(frameId);
    win.clearTimeout(timeoutId);
    reportNow();
  };
}
export function useTopLayerClose(isOpen?: Dynamic, close?: Dynamic) {
  let closeRef = React.useRef(close);
  React.useLayoutEffect(() => {
    closeRef.current = close;
  });
  React.useEffect(() => (isOpen ? pushTopLayerClose(() => closeRef.current()) : undefined), [isOpen]);
}
export function useLastNonNull(value?: Dynamic) {
  let [lastNonNull, setLastNonNull] = React.useState(value);
  if (value !== null && value !== lastNonNull) setLastNonNull(value);
  return value ?? lastNonNull;
}
export function listAnnouncement(list?: Dynamic) {
  let highlightedRow = list?.rows[list.highlightedRow ?? -1];
  let headingWords = list?.heading !== undefined && list.isAsOpened === true ? editCardHeadingLabel(list.heading) : null;
  if (list === null || highlightedRow === undefined) return headingWords;
  let rowLabel = optionLabelText(highlightedRow.label);
  let isChosenColor = highlightedRow.isChosen && colorOfferedOf(highlightedRow.label) !== null;
  let rowWords =
    isRemovingOption(highlightedRow.label) && list.heading !== undefined
      ? deleteCardHeadingLabel(list.heading)
      : isChosenColor
        ? currentColorLabel(rowLabel)
        : rowLabel;
  return headingWords === null ? rowWords : cardAndRowLabel(headingWords, rowWords);
}
export function roomForListRows(anchorRect?: Dynamic, windowHeight?: Dynamic) {
  let roomBelow = windowHeight - anchorRect.bottom - LIST_SIDE_OFFSET - LIST_EDGE_PADDING;
  let roomAbove = anchorRect.top - LIST_SIDE_OFFSET - LIST_EDGE_PADDING;
  return roomBelow >= LIST_MIN_ROOM_BELOW ? roomBelow : Math.max(roomBelow, roomAbove);
}
export function shouldDropListClick(rows?: Dynamic, press?: Dynamic, click?: Dynamic) {
  let isPressCounting = isPressStillCounting(click.atMs, press);
  let { actBeforeAtMs: actBeforeAtMs, actBeforeBeganAtMs: actBeforeBeganAtMs } = isPressCounting ? press : click;
  let judged = isPressCounting
    ? {
        atMs: press.downAtMs,
        wereRowsComing: press.wereRowsComing,
      }
    : {
        atMs: click.atMs,
        wereRowsComing: rows.areComing,
      };
  let lastActAtMs = actBeforeAtMs ?? Number.NEGATIVE_INFINITY;
  let isTooSoonAfterAct = !rows.doesQuietEnd && judged.atMs - (actBeforeBeganAtMs ?? Number.NEGATIVE_INFINITY) < LIST_ACT_GAP_MS;
  return (
    judged.wereRowsComing ||
    isTooSoonAfterListAnswer(
      {
        answerShownAtMs: rows.cameAtMs,
        lastActAtMs: lastActAtMs,
      },
      judged.atMs,
    ) ||
    isTooSoonAfterAct
  );
}
export function hasRoomForCardBesideList(listRect?: Dynamic, windowWidth?: Dynamic) {
  let roomNeeded = LIST_CARD_BESIDE_GAP + LIST_CARD_BESIDE_WIDTH + LIST_EDGE_PADDING;
  return listRect.right + roomNeeded <= windowWidth || listRect.left >= roomNeeded;
}
export function watchAncestorStyles(element?: Dynamic, onStyleChange?: Dynamic) {
  let ownerDocument = element.ownerDocument;
  let observer = ownerDocument.defaultView === null ? null : new (ownerDocument.defaultView.MutationObserver as Dynamic)(onStyleChange);
  for (let ancestor: Dynamic = element.parentElement; ancestor !== null && ancestor !== ownerDocument.body; ancestor = ancestor.parentElement)
    observer?.observe(ancestor, {
      attributes: true,
      attributeFilter: ['style'],
    });
  return () => observer?.disconnect();
}
export function ListRowsBox({
  ref: ref,
  id: id,
  label: label,
  sizeOfRows: sizeOfRows,
  doHeadingsStayInSight: doHeadingsStayInSight,
  leastHeightOfRows: leastHeightOfRows,
  mostHeightOfRows: mostHeightOfRows,
  foot: foot,
  under: under,
  onScroll: onScroll,
  onAllScrolled: onAllScrolled,
  children: children,
}: Dynamic) {
  let { className: rowsClassName } = doHeadingsStayInSight ? listRowsWithStickyHeadingsProps : listRowsScrollProps;
  if (under !== undefined)
    return jsxs('div', {
      'data-holds-list-box': true,
      'data-size': sizeOfRows,
      className: 'flex min-h-0 flex-col overflow-y-auto',
      onScroll: onAllScrolled,
      style: {
        maxHeight: 'var(--sheet-room-for-rows)',
      },
      children: [
        jsx('div', {
          ref: ref,
          id: id,
          role: 'listbox',
          'aria-label': label,
          className: rowsClassName,
          'data-rows-that-scroll': true,
          onScroll: onScroll,
          tabIndex: -1,
          style: {
            minHeight: leastHeightOfRows,
            maxHeight: mostHeightOfRows,
          },
          children: children,
        }),
        under,
      ],
    });
  if (foot === undefined || foot === null || foot === false)
    return jsx('div', {
      ref: ref,
      id: id,
      role: 'listbox',
      'aria-label': label,
      'data-size': sizeOfRows,
      className: rowsClassName,
      'data-rows-that-scroll': true,
      onScroll: onScroll,
      tabIndex: -1,
      style: {
        maxHeight:
          mostHeightOfRows === undefined ? 'var(--sheet-room-for-rows)' : `min(var(--sheet-room-for-rows, ${mostHeightOfRows}), ${mostHeightOfRows})`,
      },
      children: children,
    });
  return jsxs('div', {
    ref: ref,
    id: id,
    role: 'listbox',
    'aria-label': label,
    'data-size': sizeOfRows,
    className: 'flex min-h-0 flex-col',
    style: {
      maxHeight: 'var(--sheet-room-for-rows)',
    },
    children: [
      jsx('div', {
        role: 'presentation',
        className: rowsClassName,
        'data-rows-that-scroll': true,
        onScroll: onScroll,
        style: {
          maxHeight: mostHeightOfRows,
        },
        children: children,
      }),
      foot,
    ],
  });
}
export function ListUnderCell({
  id: id,
  isOpen: isOpen,
  anchor: anchor,
  cellElementId: cellElementId,
  label: label,
  className: className,
  isMovedOnlyAsFarAsNeeded = false,
  onShut: onShut,
  canBeShut = true,
  foot: foot,
  under: under,
  leastHeightOfRows: leastHeightOfRows,
  mostHeightOfRows: mostHeightOfRows,
  doHeadingsStayInSight = false,
  onRowsScrolled: onRowsScrolled,
  onRoomBesideMeasured: onRoomBesideMeasured,
  onPointerInOrOut: onPointerInOrOut,
  hasRows = true,
  rowsAre: rowsAre,
  doesQuietEnd = false,
  areRowsComing = false,
  onClickDropped: onClickDropped,
  onPressJudged: onPressJudged,
  onPressLetGo: onPressLetGo,
  children: children,
}: Dynamic) {
  let [roomForRows2, setRoomForRows] = React.useState(null);
  let coveredAtFoot = useCoveredUnderCells();
  let rowSize = listRowSize();
  let shutOnBack = React.useCallback(() => onShut(new (Event as Dynamic)('back')), [onShut]);
  useTopLayerClose(isOpen && canBeShut, shutOnBack);
  let openedForRef = React.useRef({
    ofCell: null,
    sinceMs: 0,
  });
  let pressGuardStartRef = React.useRef(null);
  let pointersDownRef = React.useRef(new (Set as Dynamic)());
  React.useLayoutEffect(() => {
    let openForCell = isOpen && hasRows ? cellElementId : null;
    if (openForCell === openedForRef.current.ofCell) return;
    openedForRef.current = {
      ofCell: openForCell,
      sinceMs: performance.now(),
    };
    pressGuardStartRef.current = null;
    pointersDownRef.current.clear();
  }, [isOpen, hasRows, cellElementId]);
  let rowsAreSinceRef = React.useRef({
    are: rowsAre,
    sinceMs: 0,
  });
  let win = useUiWindow();
  React.useLayoutEffect(() => {
    if (rowsAre === rowsAreSinceRef.current.are) return;
    return reportTimeAfterNextPaint(win, (atMs?: Dynamic) => {
      rowsAreSinceRef.current = {
        are: rowsAre,
        sinceMs: atMs,
      };
    });
  }, [rowsAre, win]);
  let pressRef = React.useRef(null);
  let lastActAtRef = React.useRef(null);
  let lastActBeganAtRef = React.useRef(null);
  let measureRowsBox = React.useCallback(
    (element?: Dynamic) => {
      if (element === null) return;
      let ownerDocument = element.ownerDocument;
      let win2 = ownerDocument.defaultView;
      let measureRoomBeside = () => {
        let cardRect = listBoxFrameOf(element)?.getBoundingClientRect();
        if (cardRect !== undefined) onRoomBesideMeasured?.(hasRoomForCardBesideList(cardRect, ownerDocument.documentElement.clientWidth));
      };
      let tellsRoomBeside = onRoomBesideMeasured !== undefined;
      let measureRoom = () => {
        setRoomForRows(roomForListRows(anchor.getBoundingClientRect(), ownerDocument.documentElement.clientHeight - coveredAtFoot));
        if (tellsRoomBeside) measureRoomBeside();
      };
      measureRoom();
      let stopWatchingStyles = tellsRoomBeside ? watchAncestorStyles(element, measureRoomBeside) : null;
      win2?.addEventListener('resize', measureRoom);
      return () => {
        stopWatchingStyles?.();
        win2?.removeEventListener('resize', measureRoom);
      };
    },
    [anchor, onRoomBesideMeasured, coveredAtFoot],
  );
  let roomStyle =
    roomForRows2 === null
      ? undefined
      : {
          '--sheet-room-for-rows': `calc(${String(roomForRows2)}px - 2 * var(--ui-pad-xs))`,
        };
  return withListTabStops(
    jsx(Popover.Root, {
      open: isOpen,
      onOpenChange: (open: Dynamic, { event: event }: Dynamic) => {
        let target = 'relatedTarget' in event && event.relatedTarget !== null ? event.relatedTarget : event.target;
        let targetNode = target instanceof Node ? target : null;
        let card = listBoxFrameOf(targetNode?.ownerDocument?.getElementById(listCardIdOf(id)) ?? null);
        let isInCard = targetNode !== null && card?.contains(targetNode) === true;
        let outsidePress = {
          isClick: event.type === 'click',
          isInCard: isInCard,
          didPressBeginInListOrCard: didPressBeginInListUnderCell,
        };
        if (!open && shouldShutListOnOutside(outsidePress)) onShut(event);
      },
      children: jsx(Popover.Popup, {
        anchor: anchor,
        side: 'bottom',
        align: 'start',
        ...(isMovedOnlyAsFarAsNeeded && {
          collisionAvoidance: SHIFT_ONLY_COLLISION,
        }),
        sideOffset: LIST_SIDE_OFFSET,
        collisionPadding: popupCollisionPadding(coveredAtFoot),
        padding: 'xs',
        scrollFade: false,
        initialFocus: false,
        finalFocus: false,
        keepFocus: true,
        role: 'presentation',
        'data-list-under-cell': true,
        className: `flex flex-col ${className}`,
        style: roomStyle,
        onPointerEnter: () => onPointerInOrOut?.(true),
        onPointerLeave: ({ pointerId: pointerId }: Dynamic) => {
          pointersDownRef.current.delete(pointerId);
          onPointerInOrOut?.(false);
        },
        onPointerDownCapture: ({ isPrimary: isPrimary, button: button, pointerId: pointerId }: Dynamic) => {
          let nowMs2 = performance.now();
          pointersDownRef.current.add(pointerId);
          let isPressGuarded = (!isOpen || hasRows) && isWithinPressGuard(openedForRef.current.sinceMs, nowMs2);
          pressGuardStartRef.current = isPressGuarded ? nowMs2 : null;
          onPressJudged?.(isPressGuarded);
          let lastActAtMs = lastActAtRef.current;
          let lastActBeganAtMs = lastActBeganAtRef.current;
          lastActAtRef.current = nowMs2;
          lastActBeganAtRef.current = nowMs2;
          if (!isPrimary || button !== 0) return;
          pressRef.current = {
            downAtMs: nowMs2,
            wereRowsComing: areRowsComing,
            upAtMs: null,
            actBeforeAtMs: lastActAtMs,
            actBeforeBeganAtMs: lastActBeganAtMs,
          };
        },
        onPointerCancelCapture: ({ pointerId: pointerId }: Dynamic) => {
          pointersDownRef.current.delete(pointerId);
          pressRef.current = null;
        },
        onPointerUpCapture: ({ isPrimary: isPrimary, button: button, pointerId: pointerId }: Dynamic) => {
          let nowMs2 = performance.now();
          lastActAtRef.current = nowMs2;
          if (!pointersDownRef.current.delete(pointerId)) lastActBeganAtRef.current = nowMs2;
          onPressLetGo?.();
          if (isPrimary && button === 0 && pressRef.current !== null)
            pressRef.current = {
              ...pressRef.current,
              upAtMs: nowMs2,
            };
        },
        onClickCapture: (event?: Dynamic) => {
          let pressGuardStart = pressGuardStartRef.current;
          pressGuardStartRef.current = null;
          let press = pressRef.current;
          pressRef.current = null;
          let nowMs2 = performance.now();
          if (pressGuardStart !== null && isWithinClickAfterUp(pressGuardStart, nowMs2)) {
            event.stopPropagation();
            onShut(event.nativeEvent);
            return;
          }
          let actBeforeAtMs = lastActAtRef.current;
          let actBeforeBeganAtMs = lastActBeganAtRef.current;
          if (!isPressStillCounting(nowMs2, press)) {
            lastActAtRef.current = nowMs2;
            lastActBeganAtRef.current = nowMs2;
          }
          let rows = {
            cameAtMs: rowsAreSinceRef.current.sinceMs,
            areComing: areRowsComing,
            doesQuietEnd: doesQuietEnd,
          };
          if (
            rowsAre !== undefined &&
            shouldDropListClick(rows, press, {
              atMs: nowMs2,
              actBeforeAtMs: actBeforeAtMs,
              actBeforeBeganAtMs: actBeforeBeganAtMs,
            })
          ) {
            event.stopPropagation();
            onClickDropped?.();
          }
        },
        children: jsx(ListRowsBox, {
          ref: measureRowsBox,
          id: id,
          label: label,
          sizeOfRows: rowSize,
          doHeadingsStayInSight: doHeadingsStayInSight,
          leastHeightOfRows: leastHeightOfRows,
          mostHeightOfRows: mostHeightOfRows,
          foot: foot,
          under: under,
          onScroll:
            onRowsScrolled === undefined
              ? undefined
              : ({ currentTarget: currentTarget }: Dynamic) => {
                  if (hasListScrolledSinceCard(currentTarget.scrollTop)) onRowsScrolled(currentTarget);
                },
          onAllScrolled:
            onRowsScrolled === undefined ? undefined : ({ currentTarget: currentTarget }: Dynamic) => onRowsScrolled(currentTarget),
          children: children,
        }),
      }),
    }),
  );
}
export function notePointerMove({ clientX: clientX, clientY: clientY }: Dynamic) {
  lastPointerPoint = {
    x: clientX,
    y: clientY,
    isWhereItWas: clientX === lastPointerPoint.x && clientY === lastPointerPoint.y,
  };
}
export function notePressStart({ target: target }: Dynamic) {
  didPressBeginInListUnderCell = target instanceof Element && isInListUnderCell(target);
}
export function cancelListHoverTimers() {
  for (let cancelTimer of listHoverTimerCancelers as Dynamic) cancelTimer();
}
export function shutListCardsOnResize() {
  for (let shutCard of listCardShutters as Dynamic) shutCard();
}
export function listenForListUnderCellEvents(element?: Dynamic) {
  let win = element?.ownerDocument.defaultView ?? null;
  if (win === null) return;
  win.addEventListener('pointermove', notePointerMove, true);
  win.addEventListener('pointerdown', notePressStart, true);
  win.addEventListener('keydown', cancelListHoverTimers, true);
  win.addEventListener('resize', shutListCardsOnResize);
  return () => {
    win.removeEventListener('pointermove', notePointerMove, true);
    win.removeEventListener('pointerdown', notePressStart, true);
    win.removeEventListener('keydown', cancelListHoverTimers, true);
    win.removeEventListener('resize', shutListCardsOnResize);
  };
}
export function noteScrollTopUnderListCard(scrollTop?: Dynamic) {
  scrollTopUnderListCard = scrollTop;
}
export function keepRowFromScrollingIntoView(row?: Dynamic) {
  rowNotToScrollIntoView = row;
}
export function scrollHighlightedRowIntoView(row?: Dynamic) {
  if (row === null) return;
  let isSpared = row === rowNotToScrollIntoView;
  rowNotToScrollIntoView = null;
  if (!isSpared)
    row.scrollIntoView({
      block: 'nearest',
    });
}
export function ListRow({
  id: id,
  name: name,
  placeInList: placeInList,
  rowsInList: rowsInList,
  isHighlighted: isHighlighted,
  hasCardOpen = false,
  tellsOfEveryMove = false,
  onChosen: onChosen,
  isEveryClickHeard = false,
  onPointedAt: onPointedAt,
  isOnlyTintedByPointer = onPointedAt === undefined,
  onPointerLeave: onPointerLeave,
  children: children,
}: Dynamic) {
  return jsx('button', {
    ref: isHighlighted ? scrollHighlightedRowIntoView : undefined,
    type: 'button',
    role: 'option',
    id: id,
    'aria-label': name,
    'aria-posinset': placeInList,
    'aria-setsize': rowsInList,
    'aria-selected': isHighlighted,
    'aria-disabled': onChosen === null || undefined,
    tabIndex: -1,
    className: isOnlyTintedByPointer && onChosen !== null ? `${LIST_ROW_CLASS} hover:bg-fill-ghost-hover` : LIST_ROW_CLASS,
    'data-highlighted': isHighlighted || undefined,
    'data-popup-open': hasCardOpen || undefined,
    onPointerMove:
      (isHighlighted && !tellsOfEveryMove) || onPointedAt === undefined ? undefined : highlightRowOnPointerMove(onPointedAt, !isOnlyTintedByPointer),
    onPointerLeave: onPointerLeave,
    onClick: ({ detail: detail }: Dynamic) => {
      if (detail <= 1 || isEveryClickHeard) onChosen?.();
    },
    children: children,
  });
}
export function ListRowTooltip({ className: className, dir: dir, children: children }: Dynamic) {
  let anchorRef = React.useRef(null);
  return jsx(OverflowTooltip, {
    ref: anchorRef,
    side: 'right',
    sideOffset: ({ side: side }: Dynamic) => {
      let rowRect = anchorRef.current?.getBoundingClientRect();
      let listRect = anchorRef.current?.closest('[role="menu"], [role="listbox"]')?.getBoundingClientRect();
      if (rowRect === undefined || listRect === undefined) return 4;
      if (side === 'right') return 8 + listRect.right - rowRect.right;
      return side === 'left' ? 8 + rowRect.left - listRect.left : 4;
    },
    dir: dir,
    className: className,
    children: children,
  });
}
export function useListCardHover({
  rowsListed: rowsListed,
  isOpen: isOpen,
  onAsked: onAsked,
  onShut: onShut,
  isKeptOpen: isKeptOpen,
}: Dynamic) {
  let timerRef = React.useRef(null);
  let setTimer = (delayMs?: Dynamic, then?: Dynamic) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = delayMs === null ? null : setTimeout(then, delayMs);
  };
  let cancelTimer = React.useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  React.useEffect(() => (rowsListed === null ? undefined : cancelTimer), [rowsListed, cancelTimer]);
  React.useEffect(
    () => (listHoverTimerCancelers.add(cancelTimer), () => void listHoverTimerCancelers.delete(cancelTimer)),
    [cancelTimer],
  );
  let shutUnlessKept = React.useCallback(() => {
    if (isKeptOpen?.() !== true) onShut();
  }, [isKeptOpen, onShut]);
  React.useEffect(() => {
    if (!isOpen) return;
    listCardShutters.add(shutUnlessKept);
    return () => void listCardShutters.delete(shutUnlessKept);
  }, [isOpen, shutUnlessKept]);
  useTopLayerClose(isOpen, onShut);
  return {
    overOpener: (row?: Dynamic) => setTimer(isOpen ? null : LIST_CARD_OPEN_DELAY_MS, () => onAsked(row)),
    offOpener: () => (isOpen ? undefined : setTimer(null, onShut)),
    overOtherRow: () => setTimer(isOpen ? LIST_CARD_SHUT_DELAY_MS : null, shutUnlessKept),
    overCard: () => setTimer(null, onShut),
    rowsScrolled(row?: Dynamic) {
      keepRowFromScrollingIntoView(row);
      setTimer(null, onShut);
      onShut();
    },
  };
}
export function listCardPadding(anchorRect?: Dynamic, listRect?: Dynamic, windowHeight?: Dynamic, coveredAtFoot?: Dynamic) {
  let leastBottom = LIST_EDGE_PADDING + coveredAtFoot;
  return listRect.top >= anchorRect.top
    ? {
        ...LIST_CARD_PADDING,
        top: listRect.top,
        bottom: leastBottom,
      }
    : {
        ...LIST_CARD_PADDING,
        top: LIST_EDGE_PADDING,
        bottom: Math.max(windowHeight - listRect.bottom, leastBottom),
      };
}
export function OptionsListCard({
  listId: listId,
  card: card,
  lead: lead,
  onRowChosen: onRowChosen,
  onRowPointedAt: onRowPointedAt,
  ...cardProps
}: Dynamic) {
  return jsx(ListCard, {
    listId: listId,
    ...cardProps,
    children: card.rows.flatMap(
      ({ key: key, label: label, marks: marks, isChosen: isChosen }: Dynamic, rowIndex?: Dynamic) => [
        ...(isRemovingOption(label) ? [jsx(ListSeparator, {}, 'rule')] : []),
        jsxs(
          ListRow,
          {
            id: listRowIdOf(listId, key),
            placeInList: rowIndex + 1,
            rowsInList: card.rows.length,
            isHighlighted: rowIndex === card.highlightedRow,
            tellsOfEveryMove: true,
            isOnlyTintedByPointer: true,
            onChosen: () => onRowChosen(key),
            onPointedAt: onRowPointedAt,
            children: [
              optionLead(label) ?? lead,
              jsx(ListRowLabel, {
                children: optionLabelText(label),
              }),
              jsx(ListRowSwatches, {
                marks: marks,
              }),
              isChosen &&
                jsx(Icon, {
                  name: 'Check',
                  size: 'sm',
                  bold: true,
                  className: 'text-accent',
                }),
            ],
          },
          key,
        ),
      ],
    ),
  });
}
export function optionLead(label?: Dynamic) {
  let color = colorOfferedOf(label);
  if (color !== null)
    return jsx(ListRowLead, {
      icon: jsx(OptionColorSwatch, {
        color: color,
      }),
    });
  return isRemovingOption(label)
    ? jsx(ListRowLead, {
        icon: 'Trash',
      })
    : null;
}
export function OptionColorSwatch({ color: color }: Dynamic) {
  let chipColors = cachedOptionChipColors(color);
  return jsx('span', {
    'aria-hidden': true,
    className: 'sheet-swatch sheet-swatch-of-option flex-none',
    'data-has-fill': color.kind !== 'none' || undefined,
    style: {
      ...fillPaintStyle(chipColors.fill),
      ...textPaintStyle(chipColors.text),
    },
  });
}
export function ListCard({
  listId: listId,
  label: label,
  rowId: rowId,
  cell: cell,
  isBeside: isBeside,
  head: head,
  onPointerInOrOut: onPointerInOrOut,
  children: children,
}: Dynamic) {
  let coveredAtFoot = useCoveredUnderCells();
  let rowSize = listRowSize();
  let cardRef = React.useRef(null);
  let [padding, setPadding] = React.useState(LIST_CARD_PADDING);
  let attachCard = React.useCallback(
    (element?: Dynamic) => {
      cardRef.current = element;
      let ownerDocument = element?.ownerDocument;
      let row = ownerDocument?.getElementById(rowId) ?? null;
      if (element === null || ownerDocument === undefined || row === null) return;
      noteScrollTopUnderListCard(row.closest('[data-rows-that-scroll]')?.scrollTop ?? null);
      let fitPadding = () => {
        let listRect = listBoxFrameOf(row)?.getBoundingClientRect();
        if (listRect !== undefined)
          setPadding(listCardPadding(cell.getBoundingClientRect(), listRect, ownerDocument.documentElement.clientHeight, coveredAtFoot));
      };
      fitPadding();
      let stopWatchingRow = watchAncestorStyles(row, fitPadding);
      let stopWatchingCard = watchAncestorStyles(
        element,
        () =>
          element.querySelector('[aria-selected=true]')?.scrollIntoView({
            block: 'nearest',
          }),
      );
      return () => {
        stopWatchingRow();
        stopWatchingCard();
        noteScrollTopUnderListCard(null);
      };
    },
    [cell, rowId, coveredAtFoot],
  );
  let anchor = {
    getBoundingClientRect() {
      let ownerDocument = cardRef.current?.ownerDocument;
      let row = ownerDocument?.getElementById(rowId) ?? null;
      let listBox = listBoxFrameOf(row);
      let win = ownerDocument?.defaultView ?? null;
      if (row === null || listBox === null || win === null) return new (DOMRect as Dynamic)();
      if (!isBeside) return row.getBoundingClientRect();
      let { left: left, width: width } = listBox.getBoundingClientRect();
      let { top: top, height: height } = row.getBoundingClientRect();
      let padTop = Number.parseFloat(win.getComputedStyle(listBox).paddingTop);
      return new (DOMRect as Dynamic)(left, top - padTop, width, height + 2 * padTop);
    },
  };
  return withListTabStops(
    jsx(Popover.Root, {
      open: true,
      children: jsxs(Popover.Popup, {
        anchor: anchor,
        ...listCardSide(isBeside, isBeside ? popupCollisionPadding(coveredAtFoot) : padding),
        sideOffset: LIST_CARD_BESIDE_GAP,
        padding: 'xs',
        initialFocus: false,
        finalFocus: false,
        keepFocus: true,
        role: 'presentation',
        'data-list-under-cell': true,
        style: {
          width: LIST_CARD_BESIDE_WIDTH,
        },
        onPointerEnter: () => onPointerInOrOut?.(true),
        onPointerLeave: () => onPointerInOrOut?.(false),
        children: [
          head !== undefined &&
            jsxs('div', {
              'data-size': rowSize,
              children: [head, jsx(ListSeparator, {})],
            }),
          jsx('div', {
            ref: attachCard,
            id: listCardIdOf(listId),
            role: 'listbox',
            'aria-label': label,
            'data-size': rowSize,
            children: children,
          }),
        ],
      }),
    }),
  );
}
export const PRESS_READY_DELAY_MS = 300;
export const LIST_ACT_GAP_MS = 500;
export const LIST_ANSWER_SETTLE_MS = 1500;
export const NO_LIST_ANSWER_TIMES = {
  answerShownAtMs: Number.NEGATIVE_INFINITY,
  lastActAtMs: Number.NEGATIVE_INFINITY,
};
export const isTooSoonAfterListAnswer = ({ answerShownAtMs: answerShownAtMs, lastActAtMs: lastActAtMs }: Dynamic, atMs?: Dynamic) =>
  atMs - answerShownAtMs < 300 || (atMs - answerShownAtMs < 1500 && atMs - lastActAtMs < 500);
export const listAnswerSettlesAtMs = ({ answerShownAtMs: answerShownAtMs, lastActAtMs: lastActAtMs }: Dynamic) =>
  Math.max(answerShownAtMs + 300, Math.min(lastActAtMs + 500, answerShownAtMs + 1500));
export const withListTabStops = (children?: Dynamic) =>
  jsx('div', {
    className: 'contents',
    'data-tab-stops-of-list-under-cell': true,
    children: children,
  });
export const colorOfferedOf = (label?: Dynamic) =>
  typeof label === 'object' && 'colorOffered' in label ? label.colorOffered : null;
export const isRemovingOption = (label?: Dynamic) => typeof label === 'object' && 'removes' in label;
export const optionLabelText = (label?: Dynamic) => {
  if (typeof label === 'string') return label;
  return 'removes' in label ? dropdownPaneMessages.deleteOption() : optionColorName(label.colorOffered);
};
export const listCardIdOf = (listId?: Dynamic) => `${listId}-card`;
export const listRowIdOf = (listId?: Dynamic, rowKey?: Dynamic) => `${listCardIdOf(listId)}-${rowKey.replaceAll(' ', '-')}`;
export const withListCardIds = (listbox?: Dynamic, card?: Dynamic) => {
  let highlightedRow = card?.rows[card.highlightedRow ?? -1];
  if (card === null) return listbox;
  return {
    id: `${listbox.id} ${listCardIdOf(listbox.id)}`,
    highlightedRowId: highlightedRow === undefined ? listbox.highlightedRowId : listRowIdOf(listbox.id, highlightedRow.key),
  };
};
export const withHighlightedRowIdOr = (listbox?: Dynamic, highlightedRowId?: Dynamic) => ({
  ...listbox,
  highlightedRowId: listbox.highlightedRowId ?? highlightedRowId,
});
export const comboboxAriaProps = (isCombobox?: Dynamic, listbox?: Dynamic) => ({
  ...(isCombobox && {
    role: 'combobox',
    'aria-expanded': listbox !== null,
  }),
  ...((isCombobox || listbox !== null) && {
    'aria-haspopup': 'listbox',
    'aria-autocomplete': 'list',
  }),
  ...(listbox !== null && {
    'aria-controls': listbox.id,
    'aria-activedescendant': listbox.highlightedRowId ?? undefined,
  }),
});
export const SHIFT_ONLY_COLLISION = {
  align: 'shift',
};
export const LIST_SIDE_OFFSET = 2;
export const LIST_EDGE_PADDING = 8;
export const LIST_MIN_ROOM_BELOW = 260;
export const PRESS_TOO_SOON_MS = 300;
export const isWithinPressGuard = (sinceMs?: Dynamic, nowMs2?: Dynamic) => nowMs2 - sinceMs < PRESS_TOO_SOON_MS;
export const CLICK_AFTER_UP_MS = 1000;
export const isWithinClickAfterUp = (upAtMs?: Dynamic, nowMs2?: Dynamic) => nowMs2 - upAtMs < CLICK_AFTER_UP_MS;
export const isPressStillCounting = (nowMs2?: Dynamic, press?: Dynamic) =>
  press !== null && (press.upAtMs === null || isWithinClickAfterUp(press.upAtMs, nowMs2));
export const LIST_CARD_BESIDE_WIDTH = 200;
export const LIST_CARD_BESIDE_GAP = 2;
export const listRowSize = () => (useCoarsePointer() ? 'lg' : undefined);
export const listBoxFrameOf = (element?: Dynamic) => {
  let listBox = element?.closest('[role=listbox]')?.parentElement ?? null;
  return listBox?.hasAttribute('data-holds-list-box') === true ? listBox.parentElement : listBox;
};
export const listRowsScrollProps = {
  className: 'scroll-fade-y relative min-h-0 overflow-y-auto',
};
export const listRowsWithStickyHeadingsProps = {
  className: `${listRowsScrollProps.className} scroll-fade-hide-top scroll-pt-[calc(var(--ui-leading-footnote)+0.5rem)]`,
};
export const PlainListBox = ({ id: id, label: label, children: children }: Dynamic) =>
  jsx('div', {
    id: id,
    role: 'listbox',
    'aria-label': label,
    children: children,
  });
export const isInListUnderCell = (element?: Dynamic) => element !== null && element.closest('[data-list-under-cell]') !== null;
export const isListUnderCellRow = (element?: Dynamic) =>
  element instanceof HTMLElement && element.matches('[role="option"]') && isInListUnderCell(element);
export const isRowFocusOnIos = ({
  isWebKitOfIos: isWebKitOfIos,
  isRow: isRow,
  isPressUnderWay: isPressUnderWay,
  isEntryOpen: isEntryOpen,
}: Dynamic) => isWebKitOfIos && isRow && !isPressUnderWay && !isEntryOpen;
export const LIST_ROW_CLASS = menuItemVariants({
  className: `overflow-clip text-start data-[popup-open]:bg-fill-ghost-hover ${MENU_ITEM_FORCED_COLORS_HIGHLIGHT_CLASSES}`,
});
lastPointerPoint = {
  x: Number.NaN,
  y: Number.NaN,
  isWhereItWas: false,
};
export const getLastPointerPoint = () => lastPointerPoint;
export const POINTER_STILL_MAX_PX = 6;
export const isPointerStillAt = (point?: Dynamic) =>
  point !== null && (point === lastPointerPoint || Math.hypot(point.x - lastPointerPoint.x, point.y - lastPointerPoint.y) < POINTER_STILL_MAX_PX);
didPressBeginInListUnderCell = false;
export const shouldShutListOnOutside = ({
  isClick: isClick,
  isInCard: isInCard,
  didPressBeginInListOrCard: didPressBeginInListOrCard,
}: Dynamic) => !isInCard && !(isClick && didPressBeginInListOrCard);
export const listHoverTimerCancelers = new (Set as Dynamic)();
export const listCardShutters = new (Set as Dynamic)();
scrollTopUnderListCard = null;
export const hasListScrolledSinceCard = (scrollTop?: Dynamic) => scrollTop !== scrollTopUnderListCard;
rowNotToScrollIntoView = null;
export const highlightRowOnPointerMove =
  (onPointedAt?: Dynamic, sparesRow?: Dynamic) =>
  ({ currentTarget: currentTarget }: Dynamic) => {
    if (lastPointerPoint.isWhereItWas) return;
    if (sparesRow) keepRowFromScrollingIntoView(currentTarget);
    onPointedAt();
  };
export const ListRowLead = (lead?: Dynamic) =>
  jsx(LeadingIcon, {
    icon:
      'isQuiet' in lead && lead.isQuiet
        ? jsx(Icon, {
            name: lead.icon,
            size: 'auto',
            className: 'text-secondary',
          })
        : lead.icon,
  });
export const ListRowLabel = ({ children: children }: Dynamic) =>
  jsx(ListRowTooltip, {
    className: 'min-w-0 flex-1',
    children: children,
  });
export const ListRowQuietText = ({ isKey = false, children: children }: Dynamic) =>
  jsx('span', {
    className: `sheet-quiet-text-in-row shrink-0 text-footnote text-muted ${isKey ? 'pointer-coarse:hidden' : ''}`,
    children: children,
  });
export const ListRowSwatches = ({ marks: marks }: Dynamic) =>
  jsx('span', {
    'aria-hidden': true,
    className: 'flex gap-[3px]',
    children: marks.map(
      (mark?: Dynamic) =>
        jsx(
          'span',
          {
            className: 'sheet-swatch sheet-swatch-of-set',
            'data-has-fill': true,
            style: fillPaintStyle(setSwatchColors(mark.color)),
          },
          mark.key,
        ),
    ),
  });
export const ListHeading = ({ children: children }: Dynamic) =>
  jsx('div', {
    'aria-hidden': true,
    className: MENU_GROUP_LABEL_CLASSES,
    children: children,
  });
export const ListGroup = ({
  headingId: headingId,
  heading: heading,
  doesHeadingStayInSight = false,
  children: children,
}: Dynamic) =>
  jsxs('div', {
    ...(heading !== null && {
      role: 'group',
      'aria-labelledby': headingId,
    }),
    children: [
      heading !== null &&
        jsx('div', {
          id: headingId,
          className: doesHeadingStayInSight ? `${MENU_GROUP_LABEL_CLASSES} sticky top-0 z-1 bg-surface-3` : MENU_GROUP_LABEL_CLASSES,
          children: heading,
        }),
      children,
    ],
  });
export const ListSeparator = () =>
  jsx('div', {
    'aria-hidden': true,
    children: jsx(Menu.Separator, {}),
  });
export const LIST_CARD_OPEN_DELAY_MS = 100;
export const LIST_CARD_SHUT_DELAY_MS = 300;
export const ListRowCaret = ({ isCardBeside: isCardBeside }: Dynamic) =>
  jsx('span', {
    className: 'ms-md -me-1 flex shrink-0 text-muted',
    children: jsx(Icon, {
      name: isCardBeside ? 'CaretRight' : 'CaretDown',
      size: 'sm',
    }),
  });
export const LIST_CARD_PADDING = {
  top: LIST_EDGE_PADDING,
  right: LIST_EDGE_PADDING,
  bottom: LIST_EDGE_PADDING,
  left: LIST_EDGE_PADDING,
};
export const NO_FALLBACK_AXIS = {
  fallbackAxisSide: 'none',
};
export const listCardSide = (isBeside?: Dynamic, collisionPadding?: Dynamic) =>
  isBeside
    ? {
        side: 'inline-end',
        align: 'start',
        collisionPadding: collisionPadding,
      }
    : {
        side: 'bottom',
        align: 'end',
        collisionAvoidance: NO_FALLBACK_AXIS,
        collisionPadding: collisionPadding,
      };
