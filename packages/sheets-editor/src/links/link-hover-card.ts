import { Popover } from '../kit/popover.tsx';
import { MENU_ITEM_FORCED_COLORS_HIGHLIGHT_CLASSES } from '../kit/menu.tsx';
import { Tooltip, TooltipGroup } from '../kit/tooltip.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { isWithinPressGuard, useLastNonNull, isWithinClickAfterUp } from '../ui/list-under-cell.ts';
import { MOUSE_STILL_SLOP } from '../comments/mouse-around.ts';
import { DRAG_START_DISTANCE } from '../grid/geometry.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { splitUrlForDisplay, shortenedUrlRest, urlsShownAlike } from './url-display.ts';
import { breakableUrl, LinkUrlText, LINK_AMONG_TEXT_ATTR, LINK_ELEMENT_SELECTOR, breakableUrlText } from './cell-links-view.ts';
import { translateMessage } from '../i18n/messages.ts';
import { describeWhyNot } from '../ui/why-not.ts';
import { useCardShownAfterDelay } from '../formulas/error-card.ts';
import { useCoarsePointer } from '../app/media-queries.ts';
import { useBottomInset, popupCollisionPadding } from '../shell/bottom-insets.ts';
import { preventMouseDownDefault, IS_APPLE_PLATFORM } from '../ui/dom-events.ts';
import { BarSeparator } from '../ui/bar-buttons.ts';
import { openLinkHint } from '../i18n/status-labels.ts';
export function useLinkCardSeen(rootRef?: Dynamic) {
  let seen = React.useMemo(() => createLinkCardSeen(), []);
  React.useEffect(() => {
    let value = rootRef.current?.ownerDocument;
    let value2 = () => seen.startsOver();
    value?.addEventListener('visibilitychange', value2);
    return () => value?.removeEventListener('visibilitychange', value2);
  }, [seen, rootRef]);
  return seen;
}
export function createLinkCardSeen(now: Dynamic = () => performance.now()) {
  let current: Dynamic = null;
  let isNew = () => current === null || isWithinPressGuard(current.sinceMs, now());
  return {
    shows(input?: Dynamic) {
      let [items, items2] = [current, now()];
      if (input === null) current = null;
      else if (items === null || input.cellKey !== items.cellKey || !sameItemsInOrder(input.urls, items.urls))
        current = {
          ...input,
          sinceMs: items2,
          cameAtMs: items2,
        };
      else if (input.marked !== items.marked || !sameItemsInOrder(input.whole, items.whole))
        current = {
          ...items,
          ...input,
          sinceMs: items2,
        };
      return current !== items;
    },
    startsOver() {
      if (current !== null)
        current = {
          ...current,
          sinceMs: now(),
        };
    },
    hasShown: ({ cellKey: cellKey, url: url, isForWords: isForWords }: Dynamic) =>
      current !== null &&
      current.cellKey === cellKey &&
      current.urls.includes(url) &&
      current.whole.includes(url) &&
      (isForWords !== true || current.urls.length === 1 || current.urls[current.marked ?? -1] === url) &&
      !isNew(),
    isNew: isNew,
    hasJustCome: () => current !== null && isWithinPressGuard(current.cameAtMs, now()),
  };
}
export function useLinksWhollyInSight() {
  let [whollyInSight, setWhollyInSight] = React.useState(new (Map as Dynamic)());
  let observerRef = React.useRef(null);
  return [
    React.useCallback((element?: Dynamic) => {
      let value = element?.ownerDocument.defaultView ?? null;
      if (element === null || value === null) return;
      observerRef.current ??= new (value.IntersectionObserver as Dynamic)(
        (input?: Dynamic) =>
          setWhollyInSight((input2?: Dynamic) => {
            let entries = new (Map as Dynamic)(input2);
            for (let { target: value4, boundingClientRect: value5, intersectionRect: value6 } of input as Dynamic)
              if (value4.isConnected) entries.set(addressOfRow(value4) ?? '', isWholeLinkInSight(value5, value6));
            return [...entries].every(([input3, input4]: Dynamic) => input2.get(input3) === input4) ? input2 : entries;
          }),
        {
          threshold: LINK_VISIBILITY_THRESHOLDS,
        },
      );
      let value2 = addressOfRow(element) ?? '';
      let value3 = () =>
        setWhollyInSight(
          (input?: Dynamic) =>
            input.has(value2) ? new (Map as Dynamic)([...input].filter(([input2]: Dynamic) => input2 !== value2)) : input,
        );
      value3();
      observerRef.current.observe(element);
      return () => {
        observerRef.current?.unobserve(element);
        value3();
      };
    }, []),
    whollyInSight,
  ];
}
export function scrollableAddressList(cardElement?: Dynamic) {
  let list = cardElement.querySelector(`[${ROW_OF_ADDRESS_ATTRIBUTE}]`)?.parentElement ?? null;
  return list !== null && list.scrollHeight > list.clientHeight + 1 ? list : null;
}
export function createLinkCardHover(deps?: Dynamic) {
  let { dispatch: dispatch, after: after } = deps;
  let cardOf: Dynamic = null;
  let isCardInSight: Dynamic = false;
  let cardOfMouse: Dynamic = null;
  let restTimer: Dynamic = null;
  let leaveTimer: Dynamic = null;
  let cellRestedOn: Dynamic = null;
  let wasPressed: Dynamic = false;
  let value = () => {
    restTimer?.timer.cancel();
    restTimer = null;
  };
  let value2 = () => {
    leaveTimer?.cancel();
    leaveTimer = null;
  };
  let value3 = (input?: Dynamic) => {
    if (leaveTimer !== null || (cellRestedOn === null && input === null)) return;
    let value4 = () => {
      leaveTimer = null;
      cellRestedOn = null;
      dispatch({
        kind: 'linkCardLeftByPointer',
        cardOf: input,
      });
    };
    if (isCardInSight) leaveTimer = after(LINK_CARD_LEAVE_MS, value4);
    else value4();
  };
  return {
    isOver(input?: Dynamic) {
      if (input === null) {
        value();
        value3(cardOf);
        return;
      }
      value2();
      let { cell: value4, at: value5, link: value6 } = input;
      if (restTimer?.cell === value4 && Math.hypot(value5.x - restTimer.from.x, value5.y - restTimer.from.y) <= MOUSE_STILL_SLOP) return;
      value();
      if (value4 === cellRestedOn && !wasPressed) return;
      restTimer = {
        timer: after(LINK_CARD_REST_MS, () => {
          restTimer = null;
          cellRestedOn = value4;
          wasPressed = false;
          dispatch({
            kind: 'pointerRested',
            at: value5,
            ...(value6 !== undefined && {
              link: value6,
            }),
          });
        }),
        cell: value4,
        from: value5,
      };
    },
    isPressed() {
      value();
      wasPressed = true;
    },
    isOnCard() {
      value2();
      cardOfMouse = cardOf;
    },
    isOffCard: () => value3(cardOfMouse),
    cardIsOf(input?: Dynamic) {
      cardOf = input;
    },
    cardIsInSight(input?: Dynamic) {
      isCardInSight = input;
    },
    stop() {
      value();
      value2();
    },
  };
}
export function useLinkCardHover(store?: Dynamic, cardOf?: Dynamic) {
  let hover = React.useMemo(
    () =>
      createLinkCardHover({
        dispatch: (input?: Dynamic) => store.dispatch(input),
        after(input?: Dynamic, options?: Dynamic) {
          let value = setTimeout(options, input);
          return {
            cancel: () => clearTimeout(value),
          };
        },
      }),
    [store],
  );
  React.useEffect(() => hover.cardIsOf(cardOf), [hover, cardOf]);
  React.useEffect(() => () => hover.stop(), [hover]);
  return hover;
}
export function copyTextWithExecCommand(doc?: Dynamic, text?: Dynamic) {
  let wasCopied: Dynamic = false;
  let onCopy = (event?: Dynamic) => {
    event.clipboardData?.setData('text/plain', text);
    wasCopied = event.clipboardData !== null;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  doc.addEventListener('beforecopy', preventDefaultEvent, true);
  doc.addEventListener('copy', onCopy, true);
  try {
    doc.execCommand('copy');
    return wasCopied;
  } finally {
    doc.removeEventListener('beforecopy', preventDefaultEvent, true);
    doc.removeEventListener('copy', onCopy, true);
  }
}
export function createTouchSwipeWatch() {
  let touchDown: Dynamic = null;
  let wasSwipe: Dynamic = false;
  return {
    cameDown({ pointerType: pointerType, pointerId: pointerId, clientX: clientX, clientY: clientY }: Dynamic) {
      touchDown =
        pointerType === 'touch'
          ? {
              pointerId: pointerId,
              at: {
                x: clientX,
                y: clientY,
              },
            }
          : null;
      wasSwipe = false;
    },
    hasBegunToSwipe({ pointerId: pointerId, clientX: clientX, clientY: clientY }: Dynamic) {
      if (touchDown?.pointerId !== pointerId) return false;
      if (Math.hypot(clientX - touchDown.at.x, clientY - touchDown.at.y) < DRAG_START_DISTANCE) return false;
      touchDown = null;
      wasSwipe = true;
      return true;
    },
    wasSwipe: () => wasSwipe,
  };
}
export function BuiltLinkAddressInfo({ isOnTouch: isOnTouch }: Dynamic) {
  let [isOpen, setOpen] = React.useState(false);
  let tooltipId = React.useId();
  let rootRef = React.useRef(null);
  React.useEffect(() => {
    let value = rootRef.current?.ownerDocument;
    if (!isOnTouch || !isOpen || value === undefined) return;
    let value2 = (input?: Dynamic) => {
      if (rootRef.current === null || !input.composedPath().includes(rootRef.current)) setOpen(false);
    };
    value.addEventListener('click', value2, true);
    return () => value.removeEventListener('click', value2, true);
  }, [isOnTouch, isOpen]);
  return jsxs('span', {
    ref: rootRef,
    className: `flex ${isOnTouch ? '-my-1' : '-my-0.5'}`,
    children: [
      jsx(Tooltip, {
        content: sheetMessages.whyBuiltLinkAddressIsMarked(),
        side: 'bottom',
        sideOffset: ({ side: side }: Dynamic) => {
          let value = rootRef.current?.getBoundingClientRect();
          let value2 = rootRef.current?.closest(`[${LINK_CARD_ATTRIBUTE}]`)?.getBoundingClientRect();
          if (value === undefined || value2 === undefined) return BUILT_LINK_INFO_OFFSET;
          return BUILT_LINK_INFO_OFFSET + (side === 'top' ? value.top - value2.top : value2.bottom - value.bottom);
        },
        hoverable: true,
        closeOnClick: false,
        open: isOpen,
        onOpenChange: setOpen,
        children: jsx(Button, {
          variant: 'ghost',
          size: isOnTouch ? 'xs' : 'xxs',
          iconOnly: true,
          icon: 'Info',
          tooltip: false,
          tabIndex: -1,
          'aria-label': sheetMessages.aboutBuiltLinkAddress(),
          'aria-describedby': tooltipId,
          className: 'text-muted',
          ...(isOnTouch && {
            'aria-expanded': isOpen,
            onClick: () => setOpen((input?: Dynamic) => !input),
          }),
        }),
      }),
      jsx('span', {
        id: tooltipId,
        hidden: true,
        children: sheetMessages.whyBuiltLinkAddressIsMarked(),
      }),
    ],
  });
}
export function LinkAddressButton({
  url: url,
  isOnTouch: isOnTouch,
  isWrapped: isWrapped,
  isGivenTwoLines: isGivenTwoLines,
  isBuilt: isBuilt,
  onOpened: onOpened,
  className: className,
  ref: ref,
}: Dynamic) {
  let { origin: origin, rest: rest, isSiteLong: isSiteLong } = splitUrlForDisplay(url);
  let restShown = isGivenTwoLines ? breakableUrl(shortenedUrlRest(url)) : rest;
  let addressText =
    isWrapped || isGivenTwoLines || isOnTouch || isSiteLong
      ? jsxs('span', {
          className: 'block wrap-anywhere',
          children: [
            jsx('span', {
              className: 'text-primary',
              children: origin.replaceAll('.', '.​'),
            }),
            jsx('span', {
              className: 'text-secondary',
              children: restShown,
            }),
          ],
        })
      : jsxs('span', {
          className: 'flex min-w-0',
          children: [
            jsx('span', {
              className: 'max-w-full flex-none wrap-anywhere text-primary',
              children: origin,
            }),
            jsx('span', {
              className: 'truncate text-secondary',
              children: restShown,
            }),
          ],
        });
  let addressButton = jsx('button', {
    type: 'button',
    tabIndex: -1,
    className:
      'block min-w-0 cursor-pointer rounded px-xs py-1 text-start text-footnote leading-5 select-none hover:bg-fill-ghost-hover hover:underline',
    onClick: onOpened,
    children: addressText,
  });
  return jsxs('span', {
    ref: ref,
    className: `flex min-w-0 flex-col ${className}`,
    children: [
      isOnTouch
        ? addressButton
        : jsx(Tooltip, {
            content: jsx(LinkUrlText, {
              url: url,
            }),
            side: 'top',
            hoverable: false,
            children: addressButton,
          }),
      isBuilt &&
        jsxs('span', {
          className: 'flex items-center gap-1 px-xs pb-1 text-caption text-muted',
          children: [
            sheetMessages.linkAddressIsBuilt(),
            jsx(BuiltLinkAddressInfo, {
              isOnTouch: isOnTouch,
            }),
          ],
        }),
    ],
  });
}
export const linkEditMessages = {
  insertLink: () =>
    translateMessage({
      defaultMessage: 'Add link',
      id: 'cKtNXtBXwr',
    }),
  removeLink: () =>
    translateMessage({
      defaultMessage: 'Remove link',
      id: 'RtcoEMjdsC',
    }),
  whyNoLinkByHand: () =>
    translateMessage({
      defaultMessage: 'This cell holds a formula. To add or change a link, edit the formula.',
      id: 'gijycVhqlA',
    }),
  text: () =>
    translateMessage({
      defaultMessage: 'Text',
      id: 'H1M/OeDin2',
    }),
  link: () =>
    translateMessage({
      defaultMessage: 'Link',
      id: 'kkQos7Tefy',
    }),
  pasteALink: () =>
    translateMessage({
      defaultMessage: 'Paste a link',
      id: 'bvvaAZCFt7',
    }),
  notALink: () =>
    translateMessage({
      defaultMessage: 'That doesn’t look like a link',
      id: '7z29Y4QE1K',
    }),
  linkTooLong: () =>
    translateMessage({
      defaultMessage: 'Link too long',
      id: 'hvWZ9hAVxb',
    }),
  cancel: () =>
    translateMessage({
      defaultMessage: 'Cancel',
      id: 'tWatDbQ50x',
    }),
  save: () =>
    translateMessage({
      defaultMessage: 'Save',
      id: '4OyfNAHVdw',
    }),
};
export const sameItemsInOrder = (items?: Dynamic, others?: Dynamic) =>
  items.length === others.length && items.every((input?: Dynamic, options?: Dynamic) => input === others[options]);
export const LINK_VISIBILITY_STEPS = 1000;
export const LINK_VISIBILITY_THRESHOLDS = Array.from<Dynamic, Dynamic>(
  {
    length: LINK_VISIBILITY_STEPS / 10 + 1,
  },
  (input?: Dynamic, options?: Dynamic) => (LINK_VISIBILITY_STEPS * 0.9 + options) / LINK_VISIBILITY_STEPS,
);
export const isWholeLinkInSight = (bounds?: Dynamic, inSight?: Dynamic) =>
  Math.min(bounds.width, bounds.height) > 0 &&
  Math.max(bounds.width, bounds.height) <= LINK_VISIBILITY_STEPS &&
  bounds.width - inSight.width < 1 &&
  bounds.height - inSight.height < 1;
export const NO_TOUCH_ACTION_CLASSES = 'touch-none [&_*]:touch-none';
export const LINK_CARD_SIDE_OFFSET = 2;
export const LINK_CARD_REST_PADDING = 20;
export const linkCardSide = (roomAbove?: Dynamic, needed?: Dynamic) =>
  roomAbove >= needed + LINK_CARD_SIDE_OFFSET ? 'top' : 'bottom';
export const LINK_CARD_REST_MS = 300;
export const LINK_CARD_LEAVE_MS = 300;
export const linkElementOf = (target?: Dynamic) =>
  target instanceof Element
    ? (target.closest(`[${LINK_AMONG_TEXT_ATTR}]`) ??
      target.closest(`[role=gridcell]:has(:is(${LINK_ELEMENT_SELECTOR}):not([${LINK_AMONG_TEXT_ATTR}]))`))
    : null;
export const linkUnderMouse = ({ pointerType: pointerType, buttons: buttons, target: target }: Dynamic) =>
  pointerType === 'mouse' && buttons === 0 ? linkElementOf(target) : null;
export const linkAtPointerPoint = ({
  pointerType: pointerType,
  buttons: buttons,
  clientX: clientX,
  clientY: clientY,
  currentTarget: currentTarget,
}: Dynamic) =>
  pointerType === 'mouse' && buttons === 0 ? linkElementOf(currentTarget.ownerDocument.elementFromPoint(clientX, clientY)) : null;
export const LINK_CARD_ATTRIBUTE = 'data-link-card';
export const ROW_OF_ADDRESS_ATTRIBUTE = 'data-row-of-address';
export const addressOfRow = (element?: Dynamic) =>
  element.closest(`[${ROW_OF_ADDRESS_ATTRIBUTE}]`)?.getAttribute(ROW_OF_ADDRESS_ATTRIBUTE) ?? null;
export const scrollDeltaToReveal = (bounds?: Dynamic, wanted?: Dynamic) =>
  Math.max(Math.min(wanted.bottom - bounds.bottom, wanted.top - bounds.top), 0) -
  Math.max(Math.min(bounds.top - wanted.top, bounds.bottom - wanted.bottom), 0);
export const preventDefaultEvent = (event?: Dynamic) => event.preventDefault();
export const onlyForMouse =
  (action?: Dynamic) =>
  ({ pointerType: pointerType }: Dynamic) => {
    if (pointerType === 'mouse') action();
  };
export const LinkCardButton = ({
  icon: icon,
  label: label,
  detail: detail,
  idOfAddress: idOfAddress,
  whyNot: whyNot,
  tooltipSide: tooltipSide,
  onClick: onClick,
}: Dynamic) =>
  jsx(Tooltip, {
    content: label,
    detail: detail,
    side: tooltipSide,
    hoverable: false,
    children: jsx(Button, {
      variant: 'ghost',
      size: 'sm',
      iconOnly: true,
      icon: icon,
      tooltip: false,
      tabIndex: -1,
      'aria-label': label,
      'aria-describedby': idOfAddress,
      disabled: typeof whyNot === 'string',
      disabledReason: whyNot === undefined ? undefined : describeWhyNot(label, whyNot),
      disabledReasonSide: tooltipSide,
      onClick: onClick,
    }),
  });
export const BUILT_LINK_INFO_OFFSET = 4;
export const isWholeAddressOffered = (cutAmount: Dynamic, { isOnTouch: isOnTouch, isBuilt: isBuilt }: Dynamic) =>
  cutAmount === 'much' || (cutAmount === 'some' && (isOnTouch || isBuilt));
export const LinkCard = React.memo(function ({
  urls: urls,
  urlsOnWords: urlsOnWords,
  isInWords: isInWords,
  isBuilt: isBuilt,
  by: by,
  cellKey: cellKey,
  marked: marked,
  isHeldBack: isHeldBack,
  isBroughtByFingerOrPen: isBroughtByFingerOrPen,
  anchor: anchor,
  roomAbove: roomAbove,
  seen: seen,
  mouse: mouse,
  onLinkOpened: onLinkOpened,
  onLinkCopied: onLinkCopied,
  onEditChosen: onEditChosen,
  onRemoveChosen: onRemoveChosen,
  onPressedTooSoon: onPressedTooSoon,
  onWheelTurned: onWheelTurned,
  onFingerCameDown: onFingerCameDown,
  onSwipedByFinger: onSwipedByFinger,
}: Dynamic) {
  let isShownNow = useCardShownAfterDelay(cellKey, by) || marked !== null;
  let isOpen = urls !== null && isShownNow && !isHeldBack;
  React.useEffect(() => mouse.cardIsInSight(isOpen), [mouse, isOpen]);
  let shownUrls = useLastNonNull(urls);
  let shownCellKey = useLastNonNull(cellKey);
  let shownIsInWords = useLastNonNull(isInWords);
  let shownIsBuilt = useLastNonNull(isBuilt) === true;
  let shownUrlsOnWords = useLastNonNull(urls === null ? null : urlsOnWords) ?? [];
  let isOnTouch = useCoarsePointer() || isBroughtByFingerOrPen;
  let cardKey = `${shownCellKey} ${shownUrls?.join(' ')}`;
  let [onlyUrl = null] = shownUrls?.length === 1 ? shownUrls : [];
  let leftOut = onlyUrl === null ? 'nothing' : splitUrlForDisplay(onlyUrl).leftOut;
  let isWholeOffered = isWholeAddressOffered(leftOut, {
    isOnTouch: isOnTouch,
    isBuilt: shownIsBuilt,
  });
  let urlsGivenTwoLines = urlsShownAlike(shownUrls ?? []);
  let [wholeShownAt, setWholeShownAt] = React.useState(null);
  let openKey = isOpen ? cardKey : null;
  let [lastOpenKey, setLastOpenKey] = React.useState(openKey);
  if (lastOpenKey !== openKey) {
    setLastOpenKey(openKey);
    if (openKey !== null) setWholeShownAt(null);
  }
  let isWholeShown = isWholeOffered && wholeShownAt !== null;
  let [cardHeight, setCardHeight] = React.useState(0);
  let side =
    useLastNonNull(urls === null || (isWholeShown && wholeShownAt === roomAbove) ? null : linkCardSide(roomAbove, cardHeight)) ?? 'top';
  let idBase = React.useId();
  let addressId = (input?: Dynamic) => `${idBase}-address-${input}`;
  let bottomInset = useBottomInset();
  let pressRef = React.useRef(null);
  let [swipeWatch] = React.useState(createTouchSwipeWatch);
  let isFingerDownTaken = React.useRef(false);
  let [rowRef, wholeInSight] = useLinksWhollyInSight();
  let urlsWhollySeen = React.useMemo(
    () => (urls ?? []).filter((input?: Dynamic) => wholeInSight.get(input) === true),
    [urls, wholeInSight],
  );
  React.useLayoutEffect(() => {
    if (
      seen.shows(
        isOpen && cellKey !== null
          ? {
              cellKey: cellKey,
              urls: urls,
              marked: marked,
              whole: urlsWhollySeen,
            }
          : null,
      )
    )
      pressRef.current = null;
  }, [isOpen, cellKey, urls, marked, urlsWhollySeen, seen]);
  let whyKeptBack = (input?: Dynamic) =>
    isInWords === true && wholeInSight.get(input) === false ? sheetMessages.whyLinkIsKeptBack() : null;
  let cardRef = React.useRef(null);
  let shownMarked = useLastNonNull(urls === null ? null : (marked ?? -1));
  React.useLayoutEffect(() => {
    if (!isOpen || cardHeight === 0) return;
    let value = marked === null ? null : cardRef.current?.querySelector(`[${ROW_OF_ADDRESS_ATTRIBUTE}][data-is-marked]`);
    let value2 = value?.parentElement ?? null;
    if (value !== null && value !== undefined && value2 !== null)
      value2.scrollTop += scrollDeltaToReveal(value2.getBoundingClientRect(), value.getBoundingClientRect());
  }, [marked, isOpen, cardHeight]);
  let wholeRef = React.useRef(null);
  let rowElementRef = React.useRef(null);
  let [rowHeight, setRowHeight] = React.useState(0);
  let wholeStyle = {
    '--sheet-rest-of-link-card': `${rowHeight + LINK_CARD_REST_PADDING}px`,
  };
  let cardRefCallback = React.useCallback(
    (element?: Dynamic) => {
      cardRef.current = element;
      let value = element?.ownerDocument.defaultView ?? null;
      if (element === null || value === null) return;
      let value2 = () => {
        setCardHeight(element.offsetHeight);
        setRowHeight(rowElementRef.current?.offsetHeight ?? 0);
      };
      value2();
      let value3 = new (value.ResizeObserver as Dynamic)(() => ReactDOM.flushSync(value2));
      value3.observe(element);
      let value4 = (event?: Dynamic) => {
        let current = wholeRef.current;
        if (
          current !== null &&
          current.scrollHeight > current.clientHeight &&
          event.composedPath().includes(current) &&
          Math.abs(event.deltaY) >= Math.abs(event.deltaX) &&
          !(event.ctrlKey || event.altKey || event.shiftKey || event.metaKey)
        )
          return;
        let value5 = scrollableAddressList(element);
        if (value5 !== null && event.deltaY !== 0) {
          let { scrollTop: value6, clientHeight: value7, scrollHeight: value8 } = value5;
          if (event.deltaY < 0 ? value6 <= 0 : value6 + value7 >= value8 - 1) event.preventDefault();
          return;
        }
        if (onWheelTurned(event)) event.preventDefault();
      };
      element.addEventListener('wheel', value4, {
        passive: false,
      });
      return () => {
        value3.disconnect();
        element.removeEventListener('wheel', value4);
      };
    },
    [onWheelTurned],
  );
  return jsx(Popover.Root, {
    open: isOpen,
    children: jsxs(Popover.Popup, {
      ref: cardRefCallback,
      anchor: anchor,
      side: side,
      align: 'start',
      sideOffset: LINK_CARD_SIDE_OFFSET,
      collisionPadding: popupCollisionPadding(bottomInset),
      padding: 'xs',
      scrollFade: false,
      initialFocus: false,
      finalFocus: false,
      keepFocus: true,
      'aria-label': sheetMessages.link(),
      className: `flex max-w-[min(420px,calc(100vw-16px))] ${isWholeShown && side === 'top' ? 'flex-col-reverse' : 'flex-col'} ${onlyUrl === null ? 'gap-1' : NO_TOUCH_ACTION_CLASSES}`,
      ...{
        [LINK_CARD_ATTRIBUTE]: true,
      },
      onMouseDown: preventMouseDownDefault,
      onPointerEnter: onlyForMouse(mouse.isOnCard),
      onPointerLeave: onlyForMouse(mouse.isOffCard),
      onScrollCapture: (input?: Dynamic) => {
        if (input.target !== wholeRef.current) seen.startsOver();
      },
      onPointerDownCapture: (event?: Dynamic) => {
        pressRef.current = seen.isNew()
          ? {
              atMs: performance.now(),
              hadCardJustCome: seen.hasJustCome(),
            }
          : null;
        swipeWatch.cameDown(event);
        isFingerDownTaken.current = event.pointerType === 'touch' && event.isPrimary && onFingerCameDown();
      },
      onPointerMove: (event?: Dynamic) => {
        if (!swipeWatch.hasBegunToSwipe(event)) return;
        let isInWhole = event.target instanceof Node && wholeRef.current?.contains(event.target) === true;
        if (onlyUrl !== null && !isInWhole) onSwipedByFinger(event.pointerId);
      },
      onClickCapture: (input?: Dynamic) => {
        let current = pressRef.current;
        pressRef.current = null;
        if (input.detail > 0 && (swipeWatch.wasSwipe() || isFingerDownTaken.current)) return input.stopPropagation();
        if (current === null || !isWithinClickAfterUp(current.atMs, performance.now())) return;
        input.stopPropagation();
        if (current.hadCardJustCome) onPressedTooSoon();
      },
      children: [
        shownUrls?.map((input?: Dynamic, options?: Dynamic) => {
          let value = isWholeOffered || splitUrlForDisplay(input).isSiteLong;
          let value2 = value ? 'bottom' : 'top';
          return jsxs(
            'div',
            {
              ref: onlyUrl === null ? null : rowElementRef,
              className: `flex items-start gap-1 rounded-lg ${value ? 'flex-wrap' : ''} data-[highlighted]:bg-fill-ghost-selected ${MENU_ITEM_FORCED_COLORS_HIGHLIGHT_CLASSES}`,
              'data-highlighted': options === shownMarked || undefined,
              'data-is-marked': options === shownMarked || undefined,
              ...{
                [ROW_OF_ADDRESS_ATTRIBUTE]: input,
              },
              children: [
                jsx(LinkAddressButton, {
                  ref: rowRef,
                  className: value ? 'basis-full' : 'flex-1',
                  url: input,
                  isOnTouch: isOnTouch,
                  isWrapped: shownIsInWords === true,
                  isGivenTwoLines: urlsGivenTwoLines.includes(input),
                  isBuilt: shownIsBuilt,
                  onOpened: () => onLinkOpened(input),
                }),
                jsxs('div', {
                  className: 'flex flex-none items-center gap-1',
                  children: [
                    isWholeOffered &&
                      jsx(Button, {
                        variant: 'ghost',
                        size: 'sm',
                        tabIndex: -1,
                        icon: isWholeShown === (side === 'top') ? 'CaretDown' : 'CaretUp',
                        'aria-expanded': isWholeShown,
                        onClick: () => setWholeShownAt(isWholeShown ? null : roomAbove),
                        children: sheetMessages.wholeLinkAddress(),
                      }),
                    (isWholeOffered || !value) && jsx(BarSeparator, {}),
                    shownUrls.length > 1 &&
                      jsx('span', {
                        id: addressId(options),
                        hidden: true,
                        children: input,
                      }),
                    jsxs(TooltipGroup, {
                      children: [
                        jsx(LinkCardButton, {
                          icon: 'ArrowOutSquare',
                          label: sheetMessages.openLink(),
                          detail: openLinkHint(IS_APPLE_PLATFORM),
                          ...(shownUrls.length > 1 && {
                            idOfAddress: addressId(options),
                          }),
                          whyNot: whyKeptBack(input),
                          tooltipSide: value2,
                          onClick: () => onLinkOpened(input),
                        }),
                        jsx(LinkCardButton, {
                          icon: 'Copy',
                          label: sheetMessages.copyLinkAddress(),
                          ...(shownUrls.length > 1 && {
                            idOfAddress: addressId(options),
                          }),
                          whyNot: whyKeptBack(input),
                          tooltipSide: value2,
                          onClick: () => onLinkCopied(input),
                        }),
                        onEditChosen !== null &&
                          (shownUrlsOnWords.includes(input) ||
                          options === shownUrls.findIndex((url?: Dynamic) => !shownUrlsOnWords.includes(url))
                            ? jsx(LinkCardButton, {
                                icon: 'Edit',
                                label: sheetMessages.editLink(),
                                ...(shownUrls.length > 1 &&
                                  shownUrlsOnWords.includes(input) && {
                                    idOfAddress: addressId(options),
                                  }),
                                tooltipSide: value2,
                                onClick: () => onEditChosen(input),
                              })
                            : jsx('span', {
                                className: 'size-7 flex-none',
                              })),
                        onRemoveChosen !== null &&
                          (shownUrlsOnWords.includes(input) || shownUrlsOnWords.length === 0
                            ? jsx(LinkCardButton, {
                                icon: 'Disconnect',
                                label: linkEditMessages.removeLink(),
                                ...(shownUrls.length > 1 && {
                                  idOfAddress: addressId(options),
                                }),
                                tooltipSide: value2,
                                onClick: () => onRemoveChosen(input),
                              })
                            : jsx('span', {
                                className: 'size-7 flex-none',
                              })),
                      ],
                    }),
                  ],
                }),
              ],
            },
            `${shownCellKey} ${shownIsBuilt} ${input}`,
          );
        }),
        isWholeShown &&
          onlyUrl !== null &&
          jsx('div', {
            ref: wholeRef,
            style: wholeStyle,
            className: `touch-pan-y! max-h-[max(48px,min(160px,calc(var(--available-height)-var(--sheet-rest-of-link-card))))] overflow-y-auto overscroll-contain border-alpha-2 px-xs py-1.5 text-footnote wrap-anywhere text-secondary ${side === 'top' ? 'mb-1.5 border-b' : 'mt-1.5 border-t'}`,
            children: breakableUrlText(onlyUrl),
          }),
      ],
    }),
  });
});
