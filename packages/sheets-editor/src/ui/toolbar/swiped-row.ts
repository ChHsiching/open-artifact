import { prefersReducedMotion } from '../../kit/platform.ts';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { getBottomSafeAreaInset } from '../../shell/bottom-insets.ts';
import { isDockedBarChoice } from '../docked-bar.ts';
import { isSyntheticEscape } from '../../app/page-guards.ts';
import { useTopLayerClose } from '../list-under-cell.ts';
export function markToolRowScrollEdges(scroller?: Dynamic) {
  scroller.toggleAttribute('data-has-more-at-start', scroller.scrollLeft > 1);
  scroller.toggleAttribute('data-has-more-at-end', scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 1);
}
export function toolRowScrollForPress(pointerX?: Dynamic, scroller?: Dynamic, isChoicesInPlace?: Dynamic) {
  let maxScroll = scroller.scrollWidth - scroller.clientWidth;
  let pageStep = scroller.clientWidth - 2 * TOOL_ROW_SCROLL_MARGIN_PX;
  if (pointerX > scroller.right - TOOL_ROW_EDGE_PX && scroller.scrollLeft < maxScroll - 1) return Math.min(maxScroll, scroller.scrollLeft + pageStep);
  if (!isChoicesInPlace && pointerX < scroller.left + TOOL_ROW_EDGE_PX && scroller.scrollLeft > 1) return Math.max(0, scroller.scrollLeft - pageStep);
  return null;
}
export function useSwipedToolRow({
  isSwipedRow: isSwipedRow,
  isEntryOpen: isEntryOpen,
  openMenu: openMenu,
  scrollerRef: scrollerRef,
  closeMenu: closeMenu,
}: Dynamic) {
  let [lastOpenMenu, setLastOpenMenu] = React.useState(openMenu);
  let [choicesShownInRow, setChoicesShownInRow] = React.useState(false);
  if (openMenu !== lastOpenMenu) {
    setLastOpenMenu(openMenu);
    let isUnderComposer = getBottomSafeAreaInset() > 0;
    setChoicesShownInRow(
      showsChoicesInRow(openMenu, {
        isSwipedRow: isSwipedRow,
        isEntryOpen: isEntryOpen,
        isUnderComposer: isUnderComposer,
      }),
    );
  }
  let choicesInPlace = choicesShownInRow && isDockedBarChoice(openMenu) ? openMenu : null;
  React.useLayoutEffect(() => {
    if (choicesInPlace !== null && !isSwipedRow) closeMenu(choicesInPlace);
  }, [choicesInPlace, isSwipedRow, closeMenu]);
  let hadCaretRef = React.useRef(false);
  let noteFocusAsChoicesGo = React.useCallback(() => {
    let scroller = scrollerRef.current;
    hadCaretRef.current = scroller?.contains(scroller.ownerDocument.activeElement) === true;
  }, [scrollerRef]);
  let lastChoicesRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let scroller = scrollerRef.current;
    if (scroller === null) return;
    let ownerDocument = scroller.ownerDocument;
    if (choicesInPlace !== null) {
      lastChoicesRef.current = choicesInPlace;
      if (scroller.contains(ownerDocument.activeElement))
        scroller.querySelector('button')?.focus({
          preventScroll: true,
        });
      return;
    }
    if (hadCaretRef.current && ownerDocument.activeElement === ownerDocument.body && ownerDocument.hasFocus())
      scroller.querySelector(`[data-tool="${lastChoicesRef.current}"] button`)?.focus({
        preventScroll: true,
      });
    hadCaretRef.current = false;
  }, [choicesInPlace, scrollerRef]);
  let pressGuardUntilRef = React.useRef(0);
  let edgeGuardUntilRef = React.useRef(0);
  let toolsScrollLeftRef = React.useRef(0);
  React.useLayoutEffect(() => {
    let scroller = scrollerRef.current;
    if (scroller === null || !isSwipedRow) return;
    scroller.scrollTo({
      left: choicesInPlace === null ? toolsScrollLeftRef.current : 0,
      behavior: 'instant',
    });
    let pressedButton = choicesInPlace === null ? null : scroller.querySelector('[aria-pressed="true"]');
    let overflowRight =
      pressedButton === null ? 0 : pressedButton.getBoundingClientRect().right - scroller.getBoundingClientRect().right + TOOL_ROW_SCROLL_MARGIN_PX;
    if (overflowRight > 0)
      scroller.scrollTo({
        left: overflowRight,
        behavior: 'instant',
      });
    pressGuardUntilRef.current = nowInWindowOf(scroller) + TOOL_ROW_SCROLL_SETTLE_MS;
  }, [choicesInPlace, isSwipedRow, scrollerRef]);
  React.useLayoutEffect(() => {
    let scroller = scrollerRef.current;
    if (!isSwipedRow || scroller === null) return;
    let observer = new (ResizeObserver as Dynamic)(() => markToolRowScrollEdges(scroller));
    observer.observe(scroller);
    if (scroller.firstElementChild !== null) observer.observe(scroller.firstElementChild);
    return () => observer.disconnect();
  }, [isSwipedRow, scrollerRef]);
  React.useEffect(() => {
    let view = scrollerRef.current?.ownerDocument.defaultView ?? null;
    if (choicesInPlace === null || view === null) return;
    let onKeyDown = (event?: Dynamic) => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return;
      if (isSyntheticEscape(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMenu(choicesInPlace);
    };
    let onBlur = () => closeMenu(choicesInPlace);
    view.addEventListener('keydown', onKeyDown, true);
    view.addEventListener('blur', onBlur);
    return () => {
      view.removeEventListener('keydown', onKeyDown, true);
      view.removeEventListener('blur', onBlur);
    };
  }, [choicesInPlace, closeMenu, scrollerRef]);
  React.useEffect(() => {
    let scroller = scrollerRef.current;
    let view = scroller?.ownerDocument.defaultView ?? null;
    if (choicesInPlace === null || scroller === null || view === null) return;
    let observer = new (view.ResizeObserver as Dynamic)(() => {
      if (scroller.clientWidth === 0) closeMenu(choicesInPlace);
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [choicesInPlace, closeMenu, scrollerRef]);
  let goBackToTools = React.useCallback(() => {
    if (choicesInPlace !== null) closeMenu(choicesInPlace);
  }, [choicesInPlace, closeMenu]);
  let showAllChoices = React.useCallback(() => setChoicesShownInRow(false), []);
  useTopLayerClose(choicesInPlace !== null, goBackToTools);
  let guardedPressRef = React.useRef(null);
  let guardPress = (event?: Dynamic) => {
    let scroller = event.currentTarget;
    if (!isSwipedRow || !(event.target instanceof Node) || !scroller.contains(event.target)) return null;
    let wasGuarded = event.type === 'pointerdown' ? null : guardedPressRef.current;
    if (event.type === 'click') guardedPressRef.current = null;
    if (event.type === 'click' && event.detail === 0 && wasGuarded === null) return null;
    let { left: left, right: right } = scroller.getBoundingClientRect();
    let { scrollLeft: scrollLeft, clientWidth: clientWidth, scrollWidth: scrollWidth } = scroller;
    let scrollTarget = toolRowScrollForPress(
      event.clientX,
      {
        left: left,
        right: right,
        scrollLeft: scrollLeft,
        clientWidth: clientWidth,
        scrollWidth: scrollWidth,
      },
      choicesInPlace !== null,
    );
    let isNearEdge = event.clientX > right - TOOL_ROW_EDGE_PX || event.clientX < left + TOOL_ROW_EDGE_PX;
    let isGuarded =
      wasGuarded === true ||
      scrollTarget !== null ||
      nowInWindowOf(scroller) < pressGuardUntilRef.current ||
      (isNearEdge && nowInWindowOf(scroller) < edgeGuardUntilRef.current);
    if (event.type === 'pointerdown') guardedPressRef.current = isGuarded;
    if (!isGuarded) return null;
    event.preventDefault();
    event.stopPropagation();
    return scrollTarget;
  };
  return {
    choicesInPlace: choicesInPlace,
    goBackToTools: goBackToTools,
    showAllChoices: showAllChoices,
    noteFocusAsChoicesGo: noteFocusAsChoicesGo,
    ofScroller: {
      onScroll: ({ currentTarget: scroller }: Dynamic) => {
        if (choicesInPlace === null) toolsScrollLeftRef.current = scroller.scrollLeft;
        if (isSwipedRow) markToolRowScrollEdges(scroller);
        if (nowInWindowOf(scroller) < edgeGuardUntilRef.current) edgeGuardUntilRef.current = nowInWindowOf(scroller) + TOOL_ROW_SCROLL_SETTLE_MS;
      },
      onPointerDownCapture: guardPress,
      onPointerCancelCapture: () => {
        guardedPressRef.current = null;
      },
      onMouseDownCapture: guardPress,
      onClickCapture: (event?: Dynamic) => {
        let scrollTarget = guardPress(event);
        if (scrollTarget === null) return;
        event.currentTarget.scrollTo({
          left: scrollTarget,
          behavior: prefersReducedMotion() ? 'instant' : 'smooth',
        });
        edgeGuardUntilRef.current = nowInWindowOf(event.currentTarget) + TOOL_ROW_SCROLL_SETTLE_MS;
      },
    },
  };
}
export const TOOL_ROW_EDGE_PX = 24;
export const TOOL_ROW_SCROLL_MARGIN_PX = 48;
export const TOOL_ROW_SCROLL_SETTLE_MS = 350;
export const nowInWindowOf = (element?: Dynamic) => element.ownerDocument.defaultView?.performance.now() ?? 0;
export const showsChoicesInRow = (openMenu?: Dynamic, where?: Dynamic) =>
  where.isSwipedRow && (where.isEntryOpen || where.isUnderComposer) && isDockedBarChoice(openMenu);
