import { Tabs } from '../../kit/tabs.tsx';
import { Counter } from '../../kit/counter.tsx';
import { PreviewCard } from '../../kit/preview-card.tsx';
import { Menu } from '../../kit/menu.tsx';
import { Button } from '../../kit/button.tsx';
import { OverflowTooltip, Tooltip } from '../../kit/tooltip.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { sheetMessages, moreOptionsForSheetLabel } from '../../i18n/sheet-messages.ts';
import { useSheenDelayStyle } from '../../agent/changes-by-agent-marks.ts';
import { sheetNameRefusedText } from '../../i18n/notice-labels.ts';
import { SheetNameField, SheetTabMenuItems } from './tab-menu.ts';
import { usePopupRoomAtFoot } from '../../shell/bottom-insets.ts';
import { useReorderRows } from '../reorder-rows.ts';
import { othersOnSheetDescription, TabFaces } from './tab-badges.ts';
import { sheetTabCommentsLabel } from '../../i18n/menu-labels.ts';
import { isTouchBelowSm } from '../../app/media-queries.ts';
import { swallowRestOfPress, swallowPressAfterItemPress } from '../press-swallow.ts';
import { opensMenuAtPointer, preventMouseDownDefault } from '../dom-events.ts';
import { isRepeatedEnterOrSpace } from '../repeated-key-guards.ts';
import { MENU_CARETS } from '../menu-trigger.ts';
import { isSyntheticEscapeClose } from '../../app/page-guards.ts';
import { menuTakesInitialCaret } from '../menu-initial-focus.ts';
export function createTabKeyFocusTracker() {
  let hasKeyBroughtFocus: Dynamic = false;
  let wasTabKey: Dynamic;
  return {
    keyPressed: (event?: Dynamic) => {
      hasKeyBroughtFocus = isTabStripArrowKey(event);
      clearTimeout(wasTabKey);
      if (hasKeyBroughtFocus) wasTabKey = setTimeout(() => (hasKeyBroughtFocus = false));
    },
    hasKeyBroughtFocus: () => {
      let brought = hasKeyBroughtFocus;
      hasKeyBroughtFocus = false;
      return brought;
    },
  };
}
export function scrollSheetTabsTo(scroller?: Dynamic, scrollLeft?: Dynamic) {
  let clampedLeft = Math.max(0, Math.min(scrollLeft, scroller.scrollWidth - scroller.clientWidth));
  if (clampedLeft === scroller.scrollLeft && clampedLeft === settledSheetTabScrollLeft(scroller)) return;
  sheetTabScrollsUnderWay.set(scroller, {
    from: scroller.scrollLeft,
    to: clampedLeft,
    atMs: performance.now(),
  });
  scroller.scrollLeft = clampedLeft;
}
export function settledSheetTabScrollLeft(scroller?: Dynamic) {
  let { scrollLeft: scrollLeft, scrollWidth: scrollWidth, clientWidth: clientWidth } = scroller;
  let scrollUnderWay = sheetTabScrollsUnderWay.get(scroller);
  if (scrollUnderWay === undefined || performance.now() - scrollUnderWay.atMs > SHEET_TAB_SCROLL_SETTLE_MS) return scrollLeft;
  return scrollLeft >= Math.min(scrollUnderWay.from, scrollUnderWay.to) - 1 && scrollLeft <= Math.max(scrollUnderWay.from, scrollUnderWay.to) + 1
    ? Math.min(scrollUnderWay.to, scrollWidth - clientWidth)
    : scrollLeft;
}
export function scrollSheetTabIntoView(scroller?: Dynamic, tab?: Dynamic) {
  let tabBox = tab?.getBoundingClientRect();
  if (scroller === null || tabBox === undefined) return;
  let { left: scrollerLeft, right: scrollerRight } = scroller.getBoundingClientRect();
  let [tabLeft, tabRight] = [scrollerLeft + SHEET_TAB_EDGE_ROOM, scrollerRight - SHEET_TAB_EDGE_ROOM];
  if (tabBox.left < tabLeft || tabBox.width > tabRight - tabLeft) scrollSheetTabsTo(scroller, scroller.scrollLeft - (tabLeft - tabBox.left));
  else if (tabBox.right > tabRight) scrollSheetTabsTo(scroller, scroller.scrollLeft + (tabBox.right - tabRight));
}
export function SheetTabScrollArrows({ scroller: scroller }: Dynamic) {
  let [canScrollBack, setCanScrollBack] = React.useState(false);
  let [canScrollOn, setCanScrollOn] = React.useState(false);
  let [heldArrow, setHeldArrow] = React.useState(null);
  let [focusedArrow, setFocusedArrow] = React.useState(null);
  let lingerTimerRef = React.useRef(undefined);
  React.useEffect(() => () => clearTimeout(lingerTimerRef.current), []);
  React.useEffect(() => {
    let scrollerElement = scroller.current;
    let tabList = scrollerElement?.firstElementChild ?? null;
    if (scrollerElement === null || tabList === null) return;
    let updateArrows = () => {
      setCanScrollBack(scrollerElement.scrollLeft > 1);
      setCanScrollOn(scrollerElement.scrollLeft + scrollerElement.clientWidth < scrollerElement.scrollWidth - 1);
    };
    let resizeObserver = new (ResizeObserver as Dynamic)(updateArrows);
    resizeObserver.observe(scrollerElement);
    resizeObserver.observe(tabList);
    scrollerElement.addEventListener('scroll', updateArrows, {
      passive: true,
    });
    return () => {
      resizeObserver.disconnect();
      scrollerElement.removeEventListener('scroll', updateArrows);
    };
  }, [scroller]);
  let arrowButtonProps = (direction?: Dynamic, label?: Dynamic) =>
    jsx('span', {
      className: 'sheet-tab-arrow',
      'data-end': direction === 1 ? 'later' : 'earlier',
      'data-is-unseen': !label && focusedArrow !== direction,
      children: jsx(Button, {
        variant: 'ghost',
        iconOnly: true,
        icon: direction === 1 ? 'CaretRight' : 'CaretLeft',
        'aria-label': direction === 1 ? sheetMessages.showLaterTabs() : sheetMessages.showEarlierTabs(),
        tooltip: false,
        tabIndex: -1,
        'aria-hidden': (!label && focusedArrow !== direction) || undefined,
        'aria-disabled': !label || undefined,
        className: 'aria-disabled:opacity-disabled',
        onFocus: () => setFocusedArrow(direction),
        onBlur: () => setFocusedArrow(null),
        onWheel: () => setHeldArrow(null),
        onClick: () => {
          clearTimeout(lingerTimerRef.current);
          lingerTimerRef.current = setTimeout(() => setHeldArrow(null), SHEET_TAB_ARROW_LINGER_MS);
          setHeldArrow(direction);
          let scrollerElement = scroller.current;
          if (label && scrollerElement !== null)
            scrollSheetTabsTo(scrollerElement, scrollerElement.scrollLeft + direction * scrollerElement.clientWidth * SHEET_TAB_PAGE_FRACTION);
        },
      }),
    });
  return jsxs(Fragment, {
    children: [
      (canScrollBack || heldArrow === -1 || focusedArrow === -1) && arrowButtonProps(-1, canScrollBack),
      (canScrollOn || heldArrow === 1 || focusedArrow === 1) && arrowButtonProps(1, canScrollOn),
    ],
  });
}
export function sheetTabTooltipOffset(tab?: Dynamic, tooltip?: Dynamic, side?: Dynamic) {
  let offset = tab?.querySelector('[data-ui="OverflowTooltip"]') ?? null;
  if (tab === null || offset === null || !side || tooltip !== 'top') return SHEET_TAB_TOOLTIP_GAP;
  return offset.getBoundingClientRect().top - tab.getBoundingClientRect().top + 24 + SHEET_TAB_TOOLTIP_GAP;
}
export function refocusChosenSheetTab(scroller?: Dynamic, tabList?: Dynamic) {
  let ownerDocument = scroller.ownerDocument;
  ownerDocument.defaultView?.queueMicrotask(() => {
    if (ownerDocument.hasFocus() && ownerDocument.activeElement === tabList)
      findChosenSheetTab(scroller)?.focus({
        preventScroll: true,
      });
  });
}
export function SheetTabName({ name: sheetName, shimmers: shimmers }: Dynamic) {
  return jsx('span', {
    'data-shimmers': shimmers || undefined,
    style: useSheenDelayStyle(shimmers),
    children: sheetName,
  });
}
export function SheetNameOverTab({ sheetId: sheetId, isOpen: isOpen, renaming: renaming, dispatch: dispatch }: Dynamic) {
  let tooltipId = React.useId();
  let tabElement = renaming.refused === null ? null : sheetNameRefusedText(renaming.refused);
  let tooltipRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let tab = findSheetTab(tooltipRef.current?.parentElement ?? null, sheetId);
    if (tooltipRef.current === null || tab === null) return;
    tooltipRef.current.style.left = `${tab.offsetLeft}px`;
    tooltipRef.current.style.width = `${tab.offsetWidth}px`;
  });
  return jsxs('div', {
    ref: tooltipRef,
    role: 'presentation',
    className: 'sheet-name-over-tab font-control text-body font-medium',
    children: [
      jsx(Tooltip, {
        content: tabElement,
        side: 'top',
        hoverable: true,
        open: tabElement !== null,
        children: jsx('span', {
          className: `flex min-w-0 flex-1 ${isOpen ? SHEET_TAB_BOLD_CLASS : ''}`,
          children: jsx(SheetNameField, {
            renaming: renaming,
            whyNotId: tooltipId,
            dispatch: dispatch,
          }),
        }),
      }),
      tabElement !== null &&
        jsx('p', {
          id: tooltipId,
          role: 'alert',
          className: 'sr-only',
          children: tabElement,
        }),
    ],
  });
}
export function SheetTabStrip({
  listedSheets: listedSheets,
  viewOnlyBecause: viewOnlyBecause,
  tabListRef: tabListRef,
  isListOpen: isListOpen,
  isAddMenuOpen: isAddMenuOpen,
  isUnfinishedFormulaOpen: isUnfinishedFormulaOpen,
  whatHasCaretAfterMenu: whatHasCaretAfterMenu,
  timesRenameBegunElsewhere: timesRenameBegunElsewhere,
  onMenuOpenChange: onMenuOpenChange,
  dispatchAfterEntry: dispatchAfterEntry,
  lookOnceEventsAreFinished: lookOnceEventsAreFinished,
  isChosenForFormula: isChosenForFormula,
  dispatch: dispatch,
}: Dynamic) {
  let scrollerRef = React.useRef(null);
  let { sheetId: shownSheetId = null, name: shownName } = listedSheets.find(({ isShown: isShown }: Dynamic) => isShown) ?? {};
  let canEdit = viewOnlyBecause === null;
  let lastScrollKeyRef = React.useRef('');
  let lastShownSheetIdRef = React.useRef(shownSheetId);
  React.useLayoutEffect(() => {
    let shownIndex = listedSheets.findIndex(({ isShown: isShown }: Dynamic) => isShown);
    let scrollKey = `${shownSheetId} ${shownIndex} ${listedSheets.length} ${shownName}`;
    if (lastScrollKeyRef.current === scrollKey) return;
    lastScrollKeyRef.current = scrollKey;
    let scroller = scrollerRef.current;
    let chosenTab = findChosenSheetTab(scroller);
    scrollSheetTabIntoView(scroller, chosenTab);
    let previousTab = findSheetTab(scroller, lastShownSheetIdRef.current);
    lastShownSheetIdRef.current = shownSheetId;
    let previousTabBox = scroller?.ownerDocument.activeElement ?? null;
    if (scroller === null || previousTabBox !== previousTab || previousTabBox === chosenTab) return;
    let defaultView = scroller.ownerDocument.defaultView;
    if (scroller.ownerDocument.hasFocus()) refocusChosenSheetTab(scroller, previousTabBox);
    else if (defaultView !== null && previousTabBox instanceof defaultView.HTMLElement) previousTabBox.blur();
  });
  let openTabPlaceRef = React.useRef({
    sheets: '',
    counts: '',
    startOfOpenTab: 0,
    endOfOpenTab: 0,
  });
  React.useLayoutEffect(() => {
    let [scroller, chosenTab] = [scrollerRef.current, findChosenSheetTab(scrollerRef.current)];
    let sheetsUpToShown = listedSheets.slice(0, listedSheets.findIndex(({ isShown: isShown }: Dynamic) => isShown) + 1);
    let tabStart = SHEET_TAB_STRIP_INSET + (chosenTab?.offsetLeft ?? 0);
    let [previousPlace, place] = [
      openTabPlaceRef.current,
      {
        sheets: sheetsUpToShown.map(({ sheetId: sheetId }: Dynamic) => sheetId).join(),
        counts: sheetsUpToShown.map(({ openCommentCount: openCommentCount }: Dynamic) => openCommentCount).join(),
        startOfOpenTab: tabStart,
        endOfOpenTab: tabStart + (chosenTab?.offsetWidth ?? 0),
      },
    ];
    openTabPlaceRef.current = place;
    if (scroller === null || place.sheets !== previousPlace.sheets || place.counts === previousPlace.counts) return;
    let scrollLeft = settledSheetTabScrollLeft(scroller);
    let wasInView =
      previousPlace.endOfOpenTab - scrollLeft > SHEET_TAB_EDGE_ROOM &&
      previousPlace.startOfOpenTab - scrollLeft < scroller.clientWidth - SHEET_TAB_EDGE_ROOM;
    if ((place.startOfOpenTab !== previousPlace.startOfOpenTab || place.endOfOpenTab !== previousPlace.endOfOpenTab) && wasInView)
      scrollSheetTabIntoView(scroller, chosenTab);
  });
  React.useEffect(() => {
    let scroller = scrollerRef.current;
    if (scroller === null) return;
    let resizeObserver = new (ResizeObserver as Dynamic)(() => scrollSheetTabIntoView(scroller, findChosenSheetTab(scroller)));
    resizeObserver.observe(scroller);
    return () => resizeObserver.disconnect();
  }, []);
  let [keyFocusTracker] = React.useState(createTabKeyFocusTracker);
  let [menuSheetId, setMenuSheetId] = React.useState(null);
  let [menuKey, setMenuKey] = React.useState(0);
  let isMenuByKeyboardRef = React.useRef(false);
  let pressedControlRef = React.useRef(null);
  let isMenuFromKeyboard = () => isMenuByKeyboardRef.current || pressedControlRef.current?.getAttribute('role') === 'tab';
  let menuOpenedHereRef = React.useRef(false);
  let menuSheetOnPressRef = React.useRef(null);
  let menuCloseReasonRef = React.useRef(null);
  let focusTabIfFocusInList = (tab?: Dynamic) => {
    let { activeElement: activeElement } = tab.ownerDocument;
    let isFocusInList = tabListRef.current?.contains(activeElement) === true && tab.ownerDocument.hasFocus();
    if (activeElement === tabListRef.current || isFocusInList)
      tab.focus({
        preventScroll: true,
      });
  };
  let openSheetMenu = (sheetId?: Dynamic, event?: Dynamic, byKeyboard?: Dynamic) => {
    if (isChosenForFormula(sheetId))
      return dispatchAfterEntry({
        kind: 'sheetChosen',
        sheetId: sheetId,
      });
    isMenuByKeyboardRef.current = byKeyboard;
    let ownerDocument = scrollerRef.current?.ownerDocument;
    let pressedControl = ownerDocument?.hasFocus() === true ? ownerDocument.activeElement : null;
    pressedControlRef.current = pressedControl instanceof HTMLElement && pressedControl.matches('button, [readonly]') ? pressedControl : null;
    if (menuCloseReasonRef.current === 'windowLeft') menuCloseReasonRef.current = null;
    if (isUnfinishedFormulaOpen && !byKeyboard) return;
    scrollSheetTabIntoView(scrollerRef.current, findSheetTab(scrollerRef.current, sheetId));
    if (canEdit || sheetId !== shownSheetId)
      dispatchAfterEntry({
        kind: 'sheetChosen',
        sheetId: sheetId,
      });
    setMenuSheetId(sheetId);
    setMenuKey((count?: Dynamic) => count + 1);
    menuOpenedHereRef.current = true;
    onMenuOpenChange(true, event);
  };
  let closeSheetMenu = (event?: Dynamic, reason: Dynamic = null) => {
    menuCloseReasonRef.current = reason;
    menuOpenedHereRef.current = false;
    setMenuSheetId(null);
    onMenuOpenChange(false, event);
  };
  let closeSheetMenuEvent = React.useEffectEvent(closeSheetMenu);
  let popupRoom = usePopupRoomAtFoot(menuSheetId !== null, () => findSheetTab(scrollerRef.current, menuSheetId));
  React.useEffect(() => {
    let defaultView = scrollerRef.current?.ownerDocument.defaultView ?? null;
    if (menuSheetId === null || defaultView === null) return;
    let onWindowBlur = (event?: Dynamic) => {
      closeSheetMenuEvent(event, 'windowLeft');
      setMenuKey((count?: Dynamic) => count + 1);
    };
    defaultView.addEventListener('blur', onWindowBlur);
    return () => defaultView.removeEventListener('blur', onWindowBlur);
  }, [menuSheetId]);
  let menuSheet = listedSheets.find(({ sheetId: sheetId }: Dynamic) => sheetId === menuSheetId);
  let menuSheetState = {
    sheet: menuSheet,
    among: listedSheets,
  };
  let [keptMenuSheet, setKeptMenuSheet] = React.useState(menuSheetState);
  if (menuSheet !== undefined && (menuSheet !== keptMenuSheet.sheet || listedSheets !== keptMenuSheet.among)) setKeptMenuSheet(menuSheetState);
  let { sheet: shownMenuSheet, among: shownMenuAmong } = menuSheet === undefined ? keptMenuSheet : menuSheetState;
  if (menuSheetId !== null && (menuSheet === undefined || isAddMenuOpen)) setMenuSheetId(null);
  React.useLayoutEffect(() => {
    if (menuSheetId !== null || !menuOpenedHereRef.current) return;
    menuOpenedHereRef.current = false;
    if (!isAddMenuOpen) onMenuOpenChange(false, new (Event as Dynamic)('sheetgone'));
  }, [menuSheetId, isAddMenuOpen, onMenuOpenChange]);
  let renamingSheet = isListOpen ? undefined : listedSheets.find(({ renaming: renaming }: Dynamic) => renaming !== null);
  let renamingSheetId = renamingSheet?.sheetId;
  let wasListOpenRef = React.useRef(false);
  React.useLayoutEffect(() => {
    let wasListOpen = wasListOpenRef.current;
    wasListOpenRef.current = isListOpen;
    if (renamingSheetId === undefined) return;
    if (wasListOpen) isMenuByKeyboardRef.current = false;
    scrollSheetTabIntoView(scrollerRef.current, findSheetTab(scrollerRef.current, renamingSheetId));
  }, [isListOpen, renamingSheetId, isMenuByKeyboardRef, wasListOpenRef]);
  let timesRenameBegunRef = React.useRef(timesRenameBegunElsewhere);
  React.useLayoutEffect(() => {
    if (timesRenameBegunRef.current === timesRenameBegunElsewhere) return;
    timesRenameBegunRef.current = timesRenameBegunElsewhere;
    isMenuByKeyboardRef.current = false;
    pressedControlRef.current = null;
  }, [timesRenameBegunElsewhere, timesRenameBegunRef, isMenuByKeyboardRef, pressedControlRef]);
  let lastRenamingSheetIdRef = React.useRef(renamingSheet?.sheetId);
  let isRenameEndDeferredRef = React.useRef(false);
  React.useLayoutEffect(() => {
    let lastSheetId = lastRenamingSheetIdRef.current;
    lastRenamingSheetIdRef.current = renamingSheet?.sheetId;
    let ownerDocument = scrollerRef.current?.ownerDocument;
    if (lastSheetId === undefined || renamingSheet !== undefined || ownerDocument === undefined) return;
    let focusAfterRename = () => {
      if (ownerDocument.activeElement !== ownerDocument.body || !ownerDocument.hasFocus()) return;
      let focusTarget = !listedSheets.some(({ sheetId: sheetId }: Dynamic) => sheetId === lastSheetId)
        ? tabListRef.current
        : isMenuFromKeyboard()
          ? findChosenSheetTab(scrollerRef.current)
          : whatHasCaretAfterMenu();
      if (focusTarget !== null && focusTarget !== false)
        focusTarget.focus({
          preventScroll: true,
        });
    };
    if (isRenameEndDeferredRef.current) ownerDocument.defaultView?.setTimeout(focusAfterRename);
    else focusAfterRename();
    isRenameEndDeferredRef.current = false;
  });
  let pressedSheetIdRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let pressedSheetId = pressedSheetIdRef.current;
    if (pressedSheetId === null || listedSheets.some(({ sheetId: sheetId }: Dynamic) => sheetId === pressedSheetId)) return;
    pressedSheetIdRef.current = null;
    let scroller = scrollerRef.current;
    let ownerDocument = scroller?.ownerDocument;
    if (scroller === null || ownerDocument === undefined) return;
    if (ownerDocument.activeElement !== ownerDocument.body || !ownerDocument.hasFocus()) return;
    tabListRef.current?.focus({
      preventScroll: true,
    });
    refocusChosenSheetTab(scroller, tabListRef.current);
  });
  let canReorder = canEdit && !isUnfinishedFormulaOpen && renamingSheet === undefined && listedSheets.length > 1;
  let reorder = useReorderRows({
    listRef: tabListRef,
    keys: canReorder ? listedSheets.map(({ sheetId: sheetId }: Dynamic) => sheetId) : [],
    way: 'across',
    onMoved: (sheetId?: Dynamic, toIndex?: Dynamic, byKeyboard?: Dynamic) => {
      dispatchAfterEntry({
        kind: 'sheetChosen',
        sheetId: sheetId,
      });
      dispatchAfterEntry({
        kind: 'sheetMoveChosen',
        sheetId: sheetId,
        toIndex: toIndex,
      });
      lookOnceEventsAreFinished(() => byKeyboard(true));
    },
    roomKeptAtEnds: ({ scrollLeft: scrollLeft, clientWidth: clientWidth, scrollWidth: scrollWidth }: Dynamic, options?: Dynamic) =>
      clientWidth - 2 * SHEET_TAB_EDGE_ROOM < 2 * options
        ? null
        : {
            start: Math.min(SHEET_TAB_EDGE_ROOM, SHEET_TAB_STRIP_INSET + scrollLeft),
            end: Math.min(SHEET_TAB_EDGE_ROOM, SHEET_TAB_STRIP_INSET + scrollWidth - clientWidth - scrollLeft),
          },
  });
  let areTooltipsOff = isListOpen || isAddMenuOpen || menuSheetId !== null || renamingSheet !== undefined || reorder.isRowHeld;
  return jsxs(Tabs.Root, {
    className: 'relative min-w-0',
    value: shownSheetId,
    onValueChange: (sheetId?: Dynamic) =>
      dispatchAfterEntry({
        kind: 'sheetChosen',
        sheetId: sheetId,
      }),
    children: [
      jsx('div', {
        ref: scrollerRef,
        className: 'sheet-scroller scroll-fade-x scroll-fade-size-8 -mx-1',
        tabIndex: -1,
        onPointerDownCapture: () => {
          menuSheetOnPressRef.current = menuSheetId;
        },
        onFocus: ({ target: target, currentTarget: currentTarget }: Dynamic) => {
          if (target.classList.contains('sheet-name-field')) isRenameEndDeferredRef.current = false;
          if (target.getAttribute('role') !== 'tab') return;
          scrollSheetTabIntoView(currentTarget, target);
          pressedSheetIdRef.current = target.dataset.sheetTab ?? null;
        },
        onBlur: ({ target: target, relatedTarget: relatedTarget }: Dynamic) => {
          if (target.isConnected) pressedSheetIdRef.current = null;
          if (relatedTarget === null && target.classList.contains('sheet-name-field')) isRenameEndDeferredRef.current = true;
        },
        children: jsxs('div', {
          role: 'presentation',
          className: 'relative w-max',
          onKeyDownCapture: keyFocusTracker.keyPressed,
          children: [
            jsx(Tabs.List, {
              ref: tabListRef,
              'aria-label': sheetMessages.sheets(),
              tabIndex: -1,
              activateOnFocus: false,
              children: listedSheets.map(
                (
                  { sheetId: sheetId, name: sheetName, isShown: isShown, facesOfOthers: facesOfOthers, ...restOfSheet }: Dynamic,
                  rowIndex?: Dynamic,
                ) =>
                  jsxs(
                    PreviewCard.Root,
                    {
                      delay: 300,
                      closeDelay: 0,
                      hoverable: false,
                      disabled: facesOfOthers.length === 0 || areTooltipsOff,
                      children: [
                        jsx(PreviewCard.Trigger, {
                          render: jsxs(Tabs.Tab, {
                            ...othersOnSheetDescription(sheetId, facesOfOthers),
                            ...reorder.ofRow(sheetId, rowIndex),
                            onPointerDown: (pressEvent?: Dynamic) => {
                              if (!isChosenForFormula(sheetId)) reorder.pressOnRowItself(pressEvent, sheetId, rowIndex);
                            },
                            onFocus: () => {
                              if (keyFocusTracker.hasKeyBroughtFocus() && !isShown)
                                dispatchAfterEntry({
                                  kind: 'sheetChosen',
                                  sheetId: sheetId,
                                });
                            },
                            value: sheetId,
                            'data-sheet-tab': sheetId,
                            'aria-label':
                              sheetTabCommentsLabel(sheetName, restOfSheet.openCommentCount) ??
                              (renamingSheet?.sheetId === sheetId ? sheetName : undefined),
                            'aria-haspopup': isShown || menuSheetId === sheetId ? 'menu' : undefined,
                            'aria-expanded': isShown || menuSheetId === sheetId ? menuSheetId === sheetId : undefined,
                            onClick: (event?: Dynamic) => {
                              let { target: target, currentTarget: tab, nativeEvent: nativeEvent } = event;
                              focusTabIfFocusInList(tab);
                              let isKeyboardClick = nativeEvent.detail === 0;
                              let isOnChevron = target instanceof Element && target.closest('.sheet-tab-chevron') !== null;
                              if (!(isKeyboardClick ? isShown : isOnChevron)) return;
                              if (menuSheetOnPressRef.current === sheetId && !isKeyboardClick) return;
                              if (isTouchBelowSm()) swallowRestOfPress(event);
                              openSheetMenu(sheetId, nativeEvent, isKeyboardClick);
                            },
                            onContextMenu: (event?: Dynamic) => {
                              event.preventDefault();
                              focusTabIfFocusInList(event.currentTarget);
                              openSheetMenu(sheetId, event.nativeEvent, !opensMenuAtPointer(event));
                            },
                            onDoubleClick: ({ target: target }: Dynamic) => {
                              let isOnChevron = target instanceof Element && target.closest('.sheet-tab-chevron') !== null;
                              if (!canEdit || isOnChevron || isChosenForFormula(sheetId)) return;
                              isMenuByKeyboardRef.current = false;
                              pressedControlRef.current = null;
                              dispatchAfterEntry({
                                kind: 'sheetRenameChosen',
                                sheetId: sheetId,
                              });
                            },
                            onKeyDown: (event?: Dynamic) => {
                              if (isRepeatedEnterOrSpace(event)) {
                                event.preventDefault();
                                event.preventBaseUIHandler();
                                return;
                              }
                              let canRename = canEdit && isShown && menuSheetId === null && !isChosenForFormula(sheetId);
                              if (isRenameKey(event) && !event.repeat && canRename) {
                                event.preventDefault();
                                isMenuByKeyboardRef.current = true;
                                dispatchAfterEntry({
                                  kind: 'sheetRenameChosen',
                                  sheetId: sheetId,
                                });
                                return;
                              }
                              if (!(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) return;
                              event.preventDefault();
                              openSheetMenu(sheetId, event.nativeEvent, true);
                            },
                            children: [
                              jsx('span', {
                                'aria-hidden': true,
                                className: 'sheet-tab-card',
                              }),
                              jsxs('span', {
                                className: `flex items-center gap-xs ${renamingSheet?.sheetId === sheetId ? 'invisible' : ''}`,
                                children: [
                                  jsxs('span', {
                                    className: 'sheet-tab-name grid min-w-0',
                                    children: [
                                      jsx('span', {
                                        'aria-hidden': true,
                                        className: `invisible col-start-1 row-start-1 truncate ${SHEET_TAB_BOLD_CLASS}`,
                                        children: sheetName,
                                      }),
                                      jsx(OverflowTooltip, {
                                        className: `col-start-1 row-start-1 ${isShown ? SHEET_TAB_BOLD_CLASS : ''} ${areTooltipsOff ? 'pointer-events-none' : ''}`,
                                        sideOffset: ({ side: side }: Dynamic) =>
                                          sheetTabTooltipOffset(findSheetTab(scrollerRef.current, sheetId), side, facesOfOthers.length > 0),
                                        children: jsx(SheetTabName, {
                                          name: sheetName,
                                          shimmers: restOfSheet.isWhereAgentWorks,
                                        }),
                                      }),
                                    ],
                                  }),
                                  jsx(Counter, {
                                    'aria-hidden': true,
                                    value: restOfSheet.openCommentCount,
                                    variant: 'neutral',
                                    size: 'xxs',
                                  }),
                                  jsx('span', {
                                    className: 'sheet-tab-chevron',
                                    children: MENU_CARETS.tab,
                                  }),
                                ],
                              }),
                            ],
                          }),
                        }),
                        jsx(PreviewCard.Popup, {
                          side: 'top',
                          align: 'center',
                          sideOffset: 4,
                          padding: 'none',
                          className: 'sheet-faces-over-tab [--ui-page-bg:var(--ui-surface-2)] [--preview-card-min-w:0px]',
                          children: jsx(TabFaces, {
                            faces: facesOfOthers,
                          }),
                        }),
                      ],
                    },
                    sheetId,
                  ),
              ),
            }),
            renamingSheet !== undefined &&
              renamingSheet.renaming !== null &&
              jsx(SheetNameOverTab, {
                sheetId: renamingSheet.sheetId,
                isOpen: renamingSheet.isShown,
                renaming: renamingSheet.renaming,
                dispatch: dispatch,
              }),
          ],
        }),
      }),
      renamingSheet === undefined &&
        jsx(SheetTabScrollArrows, {
          scroller: scrollerRef,
        }),
      jsx(
        Menu.Root,
        {
          modal: false,
          sheetTitle: shownMenuSheet?.name,
          open: menuSheet !== undefined,
          onOpenChange: (isOpen: Dynamic, { reason: reason, event: event }: Dynamic) => {
            swallowPressAfterItemPress(reason, event);
            let isPressOutside = reason === 'outside-press' || isSyntheticEscapeClose(reason, event);
            if (!isOpen) closeSheetMenu(event, isPressOutside ? 'pressOutside' : null);
          },
          children: jsx(Menu.Popup, {
            'aria-label': menuSheet === undefined ? undefined : moreOptionsForSheetLabel(menuSheet.name),
            anchor: () => findSheetTab(scrollerRef.current, menuSheetId),
            side: 'top',
            align: 'start',
            ...popupRoom,
            initialFocus: () => isMenuByKeyboardRef.current || menuTakesInitialCaret(scrollerRef.current, whatHasCaretAfterMenu()),
            finalFocus: () => {
              if (menuCloseReasonRef.current === 'windowLeft') return false;
              let caretTarget = whatHasCaretAfterMenu();
              if (menuCloseReasonRef.current === 'pressOutside')
                return scrollerRef.current?.ownerDocument.activeElement?.matches('body, [role="menu"], [role="menu"] *') !== false && caretTarget;
              let nameField = scrollerRef.current?.querySelector('.sheet-name-field');
              if (nameField !== null && nameField !== undefined) return nameField;
              if (isMenuFromKeyboard()) return findChosenSheetTab(scrollerRef.current) ?? true;
              let pressedControl = caretTarget === false ? null : pressedControlRef.current;
              pressedControl?.focus({
                preventScroll: true,
              });
              return pressedControl !== null && pressedControl === pressedControl.ownerDocument.activeElement ? pressedControl : caretTarget;
            },
            onMouseDown: preventMouseDownDefault,
            onContextMenu: (event?: Dynamic) => event.preventDefault(),
            onKeyDownCapture: (event?: Dynamic) => {
              let isRepeatedPress = (event.key === 'Enter' || event.key === ' ') && event.repeat;
              if (event.key !== 'Tab' && !isRepeatedPress) return;
              event.preventDefault();
              event.stopPropagation();
              if (event.key === 'Tab') closeSheetMenu(event.nativeEvent);
            },
            onFocus: ({ target: target, currentTarget: currentTarget, relatedTarget: relatedTarget }: Dynamic) => {
              if (!isMenuByKeyboardRef.current || target !== currentTarget) return;
              if (currentTarget.contains(relatedTarget)) return;
              currentTarget.querySelector('[role^="menuitem"]')?.focus();
            },
            children:
              shownMenuSheet !== undefined &&
              jsx(SheetTabMenuItems, {
                sheet: shownMenuSheet,
                isOnlySheet: shownMenuAmong.length === 1,
                placeAmongTabs: {
                  index: shownMenuAmong.indexOf(shownMenuSheet),
                  count: shownMenuAmong.length,
                },
                viewOnlyBecause: viewOnlyBecause,
                dispatch: dispatch,
              }),
          }),
        },
        menuKey,
      ),
    ],
  });
}
export const isTabStripArrowKey = ({ key: key, shiftKey: shiftKey, ctrlKey: ctrlKey, altKey: altKey, metaKey: metaKey }: Dynamic) =>
  (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End') && !(shiftKey || ctrlKey || altKey || metaKey);
export const isRenameKey = ({ key: key, shiftKey: shiftKey, ctrlKey: ctrlKey, altKey: altKey, metaKey: metaKey }: Dynamic) =>
  key === 'F2' && !(shiftKey || ctrlKey || altKey || metaKey);
export const SHEET_TAB_EDGE_ROOM = 48;
export const SHEET_TAB_STRIP_INSET = 4;
export const SHEET_TAB_PAGE_FRACTION = 0.8;
export const SHEET_TAB_ARROW_LINGER_MS = 1000;
export const sheetTabScrollsUnderWay = new (WeakMap as Dynamic)();
export const SHEET_TAB_SCROLL_SETTLE_MS = 1000;
export const findSheetTab = (scroller?: Dynamic, sheetId?: Dynamic) =>
  sheetId === null ? null : (scroller?.querySelector(`[data-sheet-tab="${CSS.escape(sheetId)}"]`) ?? null);
export const SHEET_TAB_TOOLTIP_GAP = 4;
export const findChosenSheetTab = (scroller?: Dynamic) => scroller?.querySelector('[aria-selected="true"]') ?? null;
export const SHEET_TAB_BOLD_CLASS = 'font-bold [font-synthesis:weight]';
