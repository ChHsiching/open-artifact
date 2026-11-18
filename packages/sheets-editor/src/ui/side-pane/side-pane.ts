import { PropertyRow, PropertySection } from '../../kit/property.tsx';
import { Menu } from '../../kit/menu.tsx';
import { ResizeHandle } from '../../kit/resize-handle.tsx';
import { Button } from '../../kit/button.tsx';
import { Tooltip, TooltipGroup } from '../../kit/tooltip.tsx';
import { Icon } from '../../kit/icon.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { focusOrFallback } from '../focus-or-fallback.ts';
import { CanTakeFocusContext } from '../popup-given-up-on-blur.ts';
import { createOpeningEdgeDetector, offerKeyboardWhenReady } from '../keyboard-handoff.ts';
import { useTooltipHeldAsPaneOpens } from './held-tooltip.ts';
import { useTopLayerClose } from '../list-under-cell.ts';
import { ContentsBox } from '../contents-box.ts';
import { opensMenuAtPointer, preventMouseDownDefault } from '../dom-events.ts';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
import { HIDDEN_SCROLLBAR_CLASSES, OverlayScrollbar } from '../overlay-scrollbar.ts';
import { storeSidePaneWidth, readStoredSidePaneWidth } from './stored-width.ts';
import { useCoarsePointer } from '../../app/media-queries.ts';
import { blockRepeatedEnterOrSpace } from '../repeated-key-guards.ts';
export function nearestScrollableAncestor(container?: Dynamic, element?: Dynamic) {
  for (let ancestor: Dynamic = element.parentElement; ancestor !== null && ancestor !== container; ancestor = ancestor.parentElement) {
    let { overflowY: overflowY } = getComputedStyle(ancestor);
    if (overflowY === 'auto' || overflowY === 'scroll') return container.contains(ancestor) ? ancestor : null;
  }
  return null;
}
export function measureInScroller(container?: Dynamic, element?: Dynamic) {
  let scroller = nearestScrollableAncestor(container, element);
  return scroller === null
    ? null
    : {
        scroller: scroller,
        box: element.getBoundingClientRect(),
        view: scroller.getBoundingClientRect(),
      };
}
export function scrollNeededToReveal({ scroller: scroller, box: box, view: view }: Dynamic, ignoreFade?: Dynamic) {
  let hasFade = !ignoreFade && scroller.classList.contains(SCROLL_FADE_CLASS);
  let overflowBelow = box.bottom + (hasFade ? SIDE_PANE_FADE_SCROLL_MARGIN : SIDE_PANE_SCROLL_MARGIN) - view.bottom;
  return overflowBelow > 0 ? overflowBelow : Math.max(overflowBelow, Math.min(0, box.top - view.top - SIDE_PANE_SCROLL_MARGIN));
}
export function revealInSidePane(container?: Dynamic, element?: Dynamic, isInstant: Dynamic = false) {
  let measured = container === null ? null : measureInScroller(container, element);
  if (measured === null) return;
  let scrollNeeded = scrollNeededToReveal(measured, isInstant);
  if (scrollNeeded === 0) return;
  let prefersReducedMotion2 = measured.scroller.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion:reduce)').matches;
  let isFocusInside = element.contains(element.ownerDocument.activeElement);
  let isSmooth = prefersReducedMotion2 === false && !isFocusInside;
  measured.scroller.scrollBy({
    top: scrollNeeded,
    behavior: isSmooth ? 'smooth' : 'instant',
  });
}
export function caretPlaceInPane(container?: Dynamic) {
  let activeElement = container.ownerDocument.activeElement;
  if (activeElement === null || !container.contains(activeElement)) return null;
  let measured = measureInScroller(container, activeElement);
  if (measured === null || measured.box.bottom <= measured.view.top || measured.box.top >= measured.view.bottom) return null;
  let downView = measured.box.top - measured.view.top;
  return {
    element: activeElement,
    downView: downView,
    downList: downView + measured.scroller.scrollTop,
  };
}
export function keepCaretInPlace(container?: Dynamic, caretPlace?: Dynamic, isWindowResize?: Dynamic) {
  if (caretPlace === null || container.ownerDocument.activeElement !== caretPlace.element) return caretPlace;
  let measured = measureInScroller(container, caretPlace.element);
  if (measured === null) return null;
  let drift = measured.box.top - measured.view.top - caretPlace.downView;
  let hasMovedInView =
    Math.abs(drift) >= 1 && Math.abs(drift + caretPlace.downView + measured.scroller.scrollTop - caretPlace.downList) >= 1;
  let maxScroll = isWindowResize ? 1 / 0 : hasMovedInView ? Math.abs(drift) : 0;
  let scrollNeeded = scrollNeededToReveal(measured, false);
  let scrollBy = isWindowResize || scrollNeeded * drift > 0 ? Math.sign(scrollNeeded) * Math.min(Math.abs(scrollNeeded), maxScroll) : 0;
  if (scrollBy !== 0)
    measured.scroller.scrollBy({
      top: scrollBy,
      behavior: 'instant',
    });
  return caretPlaceInPane(container);
}
export function useKeepCaretInView(paneRef?: Dynamic, isOpen?: Dynamic, isCaretMovedByUser?: Dynamic) {
  let caretPlaceRef = React.useRef(null);
  let keepCaret = React.useEffectEvent((isWindowResize?: Dynamic) => {
    let pane = paneRef.current;
    if (pane === null) return;
    caretPlaceRef.current = isCaretMovedByUser() ? caretPlaceInPane(pane) : keepCaretInPlace(pane, caretPlaceRef.current, isWindowResize);
  });
  React.useLayoutEffect(() => {
    if (isOpen) keepCaret(false);
  });
  React.useEffect(() => {
    let [pane, view] = [paneRef.current, paneRef.current?.ownerDocument.defaultView];
    if (!isOpen || pane === null) return;
    let recordCaretPlace = () => void (caretPlaceRef.current = caretPlaceInPane(pane));
    let onWindowResize = () => keepCaret(true);
    recordCaretPlace();
    pane.addEventListener('focusin', recordCaretPlace);
    pane.addEventListener('scroll', recordCaretPlace, {
      capture: true,
      passive: true,
    });
    view?.addEventListener('resize', onWindowResize);
    return () => {
      caretPlaceRef.current = null;
      pane.removeEventListener('focusin', recordCaretPlace);
      pane.removeEventListener('scroll', recordCaretPlace, {
        capture: true,
      });
      view?.removeEventListener('resize', onWindowResize);
    };
  }, [isOpen, paneRef]);
}
export function useRevealCaretOnShrink(paneRef?: Dynamic) {
  React.useEffect(() => {
    let [pane, view] = [paneRef.current, paneRef.current?.ownerDocument.defaultView];
    if (pane === null || view === null || view === undefined) return;
    let lastClientHeight: Dynamic = pane.clientHeight;
    let isCaretInView: Dynamic = false;
    let recordCaretInView = () => void (isCaretInView = caretPlaceInPane(pane) !== null);
    let resizeObserver = new (view.ResizeObserver as Dynamic)(() => {
      let activeElement = pane.ownerDocument.activeElement;
      if (pane.clientHeight < lastClientHeight && isCaretInView && activeElement !== null) revealInSidePane(pane, activeElement, true);
      lastClientHeight = pane.clientHeight;
    });
    recordCaretInView();
    pane.addEventListener('focusin', recordCaretInView);
    pane.addEventListener('focusout', recordCaretInView);
    pane.addEventListener('scroll', recordCaretInView, {
      capture: true,
      passive: true,
    });
    resizeObserver.observe(pane);
    return () => {
      pane.removeEventListener('focusin', recordCaretInView);
      pane.removeEventListener('focusout', recordCaretInView);
      pane.removeEventListener('scroll', recordCaretInView, {
        capture: true,
      });
      resizeObserver.disconnect();
    };
  }, [paneRef]);
}
export function PaneButton(buttonProps?: Dynamic) {
  return jsx(Button, {
    ...buttonProps,
    ...{
      [HOLDS_TOOLTIP_ATTRIBUTE]: true,
    },
    ...React.useContext(PaneButtonPropsContext),
  });
}
export function focusPaneStart(pane?: Dynamic, where?: Dynamic, { isByPointer = false }: Dynamic = {}) {
  if (pane === null) return false;
  let BUTTON_SELECTOR = 'button:not(:disabled)';
  let lastFocused = where === 'lastUsed' ? (lastFocusedInPane.get(pane) ?? null) : null;
  for (let candidate of [
    lastFocused,
    lastFocused?.querySelector(BUTTON_SELECTOR) ?? null,
    pane.querySelector(`[${PANE_SECTION_ACTIONS_ATTRIBUTE}] ${BUTTON_SELECTOR}[${PANE_START_ATTRIBUTE}]`),
    pane.querySelector(`[${PANE_START_ATTRIBUTE}]`),
    pane.querySelector(`[${PANE_SECTION_ACTIONS_ATTRIBUTE}] ${BUTTON_SELECTOR}`),
    pane.querySelector(BUTTON_SELECTOR),
  ] as Dynamic) {
    candidate?.focus({
      preventScroll: true,
      focusVisible: !isByPointer || (candidate instanceof HTMLInputElement && candidate.type === 'text'),
    });
    if (candidate === null || candidate !== pane.ownerDocument.activeElement) continue;
    revealInSidePane(pane, candidate);
    return true;
  }
  return false;
}
export function focusSidePaneOrTitle(pane?: Dynamic, target?: Dynamic) {
  if (pane === null) return false;
  let ownerDocument = pane.ownerDocument;
  let title = pane.querySelector(`[${SIDE_PANE_TITLE_ATTRIBUTE}]`);
  let untabTitle = () => {
    title?.removeAttribute('tabindex');
    ownerDocument.removeEventListener('focusin', onFocusIn, true);
    ownerDocument.removeEventListener('pointerdown', untabTitle, true);
  };
  let onFocusIn = ({ target: target2 }: Dynamic) => {
    if (target2 !== title) untabTitle();
  };
  let didFocus = focusOrFallback(
    target,
    (input?: Dynamic) => pane.contains(input) || lastFocusedInPane.get(pane) === input,
    () => (
      title?.setAttribute('tabindex', '-1'),
      ownerDocument.addEventListener('focusin', onFocusIn, true),
      ownerDocument.addEventListener('pointerdown', untabTitle, true),
      title
    ),
    () => (ownerDocument.activeElement?.matches(':disabled') === true ? null : ownerDocument.activeElement),
  );
  if (ownerDocument.activeElement !== title) untabTitle();
  return didFocus;
}
export function useWasJustOpened(isOpen?: Dynamic, isOpenElsewhere: Dynamic = false) {
  let isPaneOpenedByUser = React.useContext(CanTakeFocusContext);
  let onSidePaneShut = React.useContext(SidePaneShutContext);
  let [detectOpeningEdge] = React.useState(createOpeningEdgeDetector);
  let wasJustOpenedRef = React.useRef(false);
  React.useLayoutEffect(() => {
    wasJustOpenedRef.current = detectOpeningEdge(isOpen, isOpenElsewhere) && isPaneOpenedByUser();
    if (wasJustOpenedRef.current) onSidePaneShut();
  });
  let [wasJustOpened] = React.useState(() => () => wasJustOpenedRef.current);
  return wasJustOpened;
}
export function useSidePaneCaret({
  isOpen: isOpen,
  isOpenInAnotherForm = false,
  isCaretLeftAsItOpens = false,
  timesAsked: timesAsked,
  paneRef: paneRef,
  putCaretWhereToStart: putCaretWhereToStart,
  whatHasCaretAfter: whatHasCaretAfter,
}: Dynamic) {
  let wasJustOpened = useWasJustOpened(isOpen, isOpenInAnotherForm);
  let onSidePaneShut = React.useContext(SidePaneShutContext);
  let putCaretWhereToStartEvent = React.useEffectEvent(putCaretWhereToStart);
  let lastTimesAskedRef = React.useRef(null);
  let callOffHandoffRef = React.useRef(null);
  React.useEffect(() => {
    let timesAskedNow = isOpen ? timesAsked : null;
    if (lastTimesAskedRef.current === timesAskedNow) return;
    let isFirstAsk = lastTimesAskedRef.current === null;
    lastTimesAskedRef.current = timesAskedNow;
    callOffHandoffRef.current?.();
    callOffHandoffRef.current = null;
    if (timesAskedNow === null || wasJustOpened() || (isFirstAsk && isCaretLeftAsItOpens)) return;
    let pane = paneRef.current;
    if (isFirstAsk && pane !== null)
      callOffHandoffRef.current = offerKeyboardWhenReady(pane, putCaretWhereToStartEvent, {
        keys: {
          onShut: onSidePaneShut,
        },
      });
    else putCaretWhereToStartEvent();
  });
  React.useEffect(() => () => callOffHandoffRef.current?.(), []);
  React.useEffect(() => {
    if (!isOpen) return;
    let ownerDocument = paneRef.current?.ownerDocument;
    return () => {
      let caretTarget = ownerDocument?.activeElement === ownerDocument?.body ? whatHasCaretAfter() : false;
      if (caretTarget !== false)
        caretTarget.focus({
          preventScroll: true,
        });
    };
  }, [isOpen, paneRef, whatHasCaretAfter]);
}
export function SidePane(props?: Dynamic) {
  let {
    ref: ref,
    title: title,
    takesNoTyping: takesNoTyping,
    width: width,
    onWidthChange: onWidthChange,
    onClose: onClose,
    onKeyDown: onKeyDown,
  } = props;
  let {
    beforeTitle: beforeTitle,
    actions: actions,
    foot: foot,
    view: view,
    onPressed: onPressed,
    wasPointerPressedLast: wasPointerPressedLast,
    children: children,
  } = props;
  let busyClass = takesNoTyping ? 'opacity-disabled' : '';
  let windowWidth = React.useSyncExternalStore(subscribeSidePaneWindowResize, getWindowInnerWidth, getServerWindowWidth);
  let maxWidth = sidePaneMaxWidthFor(windowWidth);
  let closeButtonRef = React.useRef(null);
  let heldTooltip = useTooltipHeldAsPaneOpens();
  let close = React.useCallback(() => {
    if (ref.current?.contains(ref.current.ownerDocument.activeElement) === true)
      closeButtonRef.current?.focus({
        preventScroll: true,
      });
    onClose();
  }, [ref, onClose]);
  useTopLayerClose(windowWidth < 600, close);
  let shownWidth = Math.min(width, maxWidth);
  let [aroundScrollerRef, scrollerRef] = [React.useRef(null), React.useRef(null)];
  let lastViewRef = React.useRef(view);
  React.useLayoutEffect(() => {
    if (lastViewRef.current === view) return;
    lastViewRef.current = view;
    for (let value of [aroundScrollerRef.current, scrollerRef.current] as Dynamic)
      value?.scrollTo({
        top: 0,
        behavior: 'instant',
      });
  });
  useRevealCaretOnShrink(ref);
  let widthAtResizeStartRef = React.useRef(shownWidth);
  let draftWidthRef = React.useRef(shownWidth);
  let widthHostRef = React.useRef(null);
  let setDraftWidth = (width2?: Dynamic) => {
    if (widthHostRef.current instanceof HTMLElement) widthHostRef.current.style.setProperty(SIDE_PANE_WIDTH_VAR, sidePaneWidthCss(width2));
  };
  let lastFocusedRef = React.useRef(null);
  React.useEffect(() => {
    let [lastFocused, ownerDocument] = [lastFocusedRef.current, ref.current?.ownerDocument];
    if (lastFocused === null || (lastFocused.isConnected && !lastFocused.matches(':disabled'))) return;
    let activeElement = ownerDocument?.activeElement ?? null;
    if (activeElement !== ownerDocument?.body && activeElement !== lastFocused) {
      if (!lastFocused.isConnected) lastFocusedRef.current = ref.current?.contains(activeElement) === true ? activeElement : null;
      return;
    }
    lastFocusedRef.current = null;
    if (ownerDocument?.hasFocus() !== true) return;
    focusPaneStart(ref.current, 'start', {
      isByPointer: wasPointerPressedLast(),
    });
  });
  return jsx(ContentsBox, {
    onFocus: ({ target: target }: Dynamic) => {
      lastFocusedRef.current = target;
      if (target.closest(`[${HOLDS_TOOLTIP_ATTRIBUTE}]`) === null) heldTooltip.end();
      if (ref.current?.contains(target) === true && !target.hasAttribute(SIDE_PANE_TITLE_ATTRIBUTE)) lastFocusedInPane.set(ref.current, target);
    },
    onBlur: ({ target: target, relatedTarget: relatedTarget }: Dynamic) => {
      let isStayingInPane = ref.current?.contains(relatedTarget) === true;
      let wasDisabledUnderFocus = relatedTarget === null && target.matches(':disabled');
      lastFocusedRef.current = isStayingInPane ? relatedTarget : wasDisabledUnderFocus ? target : null;
    },
    onKeyDown: (event?: Dynamic) => {
      if (event.target instanceof Node && ref.current?.contains(event.target) === true) onKeyDown(event);
    },
    onClick: ({ target: target }: Dynamic) => {
      if (target instanceof Element && ref.current?.contains(target) === true && target.closest('button[type="submit"]') === null) onPressed?.();
    },
    onContextMenu: (event?: Dynamic) => {
      if ((event.target instanceof Element && ref.current?.contains(event.target)) === true && opensMenuAtPointer(event)) onPressed?.();
    },
    onSubmit: () => onPressed?.(),
    children: jsxs('aside', {
      ref: ref,
      'aria-label': title,
      'aria-busy': takesNoTyping || undefined,
      onPointerEnter: heldTooltip.end,
      className:
        '@container-[size] absolute end-0 bottom-0 flex flex-col border-alpha-2 bg-surface-panel min-[600px]:top-0 min-[600px]:w-[312px] min-[768px]:w-(--sheet-side-pane-width) min-[600px]:border-s max-[600px]:h-(--sheet-side-pane-at-foot) max-[600px]:w-full max-[600px]:border-t max-[600px]:pb-[var(--sheet-strip-at-foot,0px)]',
      children: [
        jsx('div', {
          className: `flex min-h-10 min-w-0 shrink-0 items-center gap-xs pe-sm max-[600px]:pointer-coarse:py-md min-[600px]:min-h-(--sheet-formula-row-height) ${beforeTitle === undefined ? 'ps-lg' : 'ps-sm'} ${busyClass}`,
          children: jsxs(TooltipGroup, {
            children: [
              beforeTitle,
              jsx('h2', {
                ...{
                  [SIDE_PANE_TITLE_ATTRIBUTE]: true,
                },
                className: 'min-w-0 flex-1 truncate text-body-semibold text-primary outline-none',
                children: title,
              }),
              actions,
              jsx(Button, {
                ref: closeButtonRef,
                variant: 'ghost',
                iconOnly: true,
                icon: jsx(Icon, {
                  name: 'X',
                  size: 'sm',
                }),
                'aria-label': sheetMessages.close(),
                ...{
                  [HOLDS_TOOLTIP_ATTRIBUTE]: true,
                },
                ...heldTooltip.ofButton,
                className: 'text-secondary',
                onClick: onClose,
              }),
            ],
          }),
        }),
        jsxs('div', {
          ref: aroundScrollerRef,
          ...SHORT_PANE_LAYOUT.aroundWhatScrollsAndFoot,
          children: [
            jsxs('div', {
              ref: scrollerRef,
              className: `${SCROLL_FADE_CLASS} scroll-fade-hide-top flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-alpha-2 pb-3 ${SHORT_PANE_LAYOUT.whatScrolls.className} ${HIDDEN_SCROLLBAR_CLASSES} ${busyClass}`,
              children: [
                jsx(PaneButtonPropsContext, {
                  value: heldTooltip.ofButton,
                  children: children,
                }),
                jsx(OverlayScrollbar, {}),
              ],
            }),
            foot !== undefined &&
              jsx('div', {
                className: `flex shrink-0 flex-col gap-sm border-t border-alpha-2 py-md ps-lg pe-md ${busyClass}`,
                children: foot,
              }),
          ],
        }),
        jsx(ResizeHandle, {
          side: 'inline-start',
          'aria-label': sheetMessages.resizePane(),
          'aria-valuenow': shownWidth,
          'aria-valuemin': SIDE_PANE_MIN_WIDTH,
          'aria-valuemax': maxWidth,
          className: '[--ui-ring-inner:0px] [--ui-ring-outer:1px] max-[768px]:hidden',
          onResizeStart: () => {
            widthAtResizeStartRef.current = shownWidth;
            widthHostRef.current = ref.current?.offsetParent ?? null;
          },
          onResize: (delta?: Dynamic) => {
            let pane = ref.current;
            if (pane === null) return;
            let widthDelta = getComputedStyle(pane).direction === 'rtl' ? delta : -delta;
            let nextWidth = Math.round(widthAtResizeStartRef.current + widthDelta);
            draftWidthRef.current = Math.max(SIDE_PANE_MIN_WIDTH, Math.min(maxWidth, nextWidth));
            let isUnchanged = draftWidthRef.current === widthAtResizeStartRef.current;
            setDraftWidth(isUnchanged ? width : draftWidthRef.current);
          },
          onResizeEnd: (didResize?: Dynamic) => {
            if (!didResize) setDraftWidth(width);
            if (!didResize || draftWidthRef.current === widthAtResizeStartRef.current) return;
            onWidthChange(draftWidthRef.current);
            storeSidePaneWidth(draftWidthRef.current);
          },
        }),
      ],
    }),
  });
}
export function PaneSection(props?: Dynamic) {
  let { title: title, actions: actions, className = '', above: above, doesTitleStay: doesTitleStay, children: children } = props;
  let hasOwnHead = above !== undefined || doesTitleStay === true;
  return jsxs(PropertySection, {
    className: `${PANE_PROPERTY_PAD_VARS} ${hasOwnHead ? '[&:not(:first-child)]:pt-0' : ''} ${className}`,
    ...(!hasOwnHead && {
      title: title,
    }),
    ...(!hasOwnHead &&
      actions !== undefined && {
        actions: jsx('span', {
          ...{
            [PANE_SECTION_ACTIONS_ATTRIBUTE]: true,
          },
          className: 'contents font-normal',
          children: actions,
        }),
      }),
    children: [
      hasOwnHead &&
        jsxs(Fragment, {
          children: [
            above !== undefined &&
              jsx('p', {
                className: `pt-3 text-footnote leading-snug text-secondary ${PANE_GUTTER_CLASSES}`,
                children: above,
              }),
            jsxs('div', {
              className: `flex min-h-10 min-w-0 shrink-0 items-center gap-xs py-2 select-none ${PANE_GUTTER_CLASSES} ${doesTitleStay === true ? 'sticky top-0 z-1 bg-surface-panel' : ''}`,
              children: [
                jsx('h3', {
                  className: 'min-w-0 flex-1 truncate text-body-semibold text-primary',
                  children: title,
                }),
                actions !== undefined &&
                  jsx('span', {
                    ...{
                      [PANE_SECTION_ACTIONS_ATTRIBUTE]: true,
                    },
                    className: '-my-1 flex shrink-0 items-center gap-0.5',
                    children: actions,
                  }),
              ],
            }),
          ],
        }),
      children,
    ],
  });
}
export function PaneRow(props?: Dynamic) {
  let { label: label, labelInFull: labelInFull, labelEnd: labelEnd, hasDot = false, trailing: trailing } = props;
  let { isPointedAt = false, children: children } = props;
  return jsx(PropertyRow, {
    className: `relative ${PANE_PROPERTY_PAD_VARS} ${label === undefined ? '' : PANE_ROW_LABEL_COLUMNS} ${trailing === undefined ? '[--cmp-property-trailing:initial]' : '[--cmp-property-trailing:var(--ui-h-control)]'}`,
    ...(label !== undefined && {
      label: jsxs('span', {
        className: 'flex min-w-0 gap-1',
        title: labelInFull,
        children: [
          hasDot &&
            jsx('span', {
              className: 'absolute inset-y-0 start-[7px] my-auto size-0 rounded-full border-[3px] border-[color:var(--ui-fill-accent)]',
            }),
          jsx('span', {
            dir: 'auto',
            className: 'min-w-0 truncate',
            children: label,
          }),
          labelEnd !== undefined &&
            jsx('span', {
              className: 'shrink-0',
              children: labelEnd,
            }),
        ],
      }),
    }),
    ...(trailing !== undefined && {
      trailing: trailing,
    }),
    children: jsx('div', {
      className: isPointedAt ? `flex min-w-0 flex-1 items-center gap-2 rounded ${POINTED_AT_MARK.className}` : 'contents',
      ...(isPointedAt && POINTED_AT_MARK.mark),
      children: children,
    }),
  });
}
export function PaneTableButton({ name: name, onPressed: onPressed }: Dynamic) {
  let isTouch = useCoarsePointer();
  return jsx(Button, {
    variant: 'ghost',
    size: isTouch ? 'sm' : 'xs',
    iconOnly: true,
    icon: 'Table',
    'aria-label': name,
    className: `text-secondary ${isTouch ? 'relative after:absolute after:inset-x-[calc(50%-20px)] after:-inset-y-0.5' : ''}`,
    onMouseDown: preventMouseDownDefault,
    onClick: onPressed,
  });
}
export function useNoteKeptInView(noteRef: Dynamic, isRefusal: Dynamic) {
  React.useEffect(() => {
    let [note, pane] = [noteRef.current, noteRef.current?.closest('aside') ?? null];
    let win = pane?.ownerDocument.defaultView ?? null;
    if (!isRefusal || note === null || pane === null || win === null) return;
    let describedSelector = `[aria-describedby~="${note.id}"]`;
    let lastHeight: Dynamic = null;
    let wasInView: Dynamic = true;
    let isInView = (element?: Dynamic) => {
      let measured = element === null ? null : measureInScroller(pane, element);
      return measured !== null && measured.box.bottom > measured.view.top && measured.box.top < measured.view.bottom;
    };
    let onScroll = () => {
      if (lastHeight === null) return;
      wasInView = isInView(note) || isInView(pane.querySelector(describedSelector));
    };
    let observer = new win.ResizeObserver(() => {
      if (pane.clientHeight === lastHeight) return;
      lastHeight = pane.clientHeight;
      let focused = pane.ownerDocument.activeElement;
      if (wasInView && (focused?.matches(describedSelector) === true || !pane.contains(focused))) revealInSidePane(pane, note);
    });
    observer.observe(pane);
    pane.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      observer.disconnect();
      pane.removeEventListener('scroll', onScroll, {
        capture: true,
      });
    };
  }, [noteRef, isRefusal]);
}
export function PaneRowNote({ id: id, isRefusal = false, isInRow = false, children: children }: Dynamic) {
  let noteRef = React.useRef(null);
  useNoteKeptInView(noteRef, isRefusal);
  let note = jsx('p', {
    ref: noteRef,
    id: id,
    className: `col-start-2 min-w-0 ps-md text-caption leading-snug [overflow-wrap:anywhere] ${isRefusal ? 'text-danger' : 'text-secondary'} ${isInRow ? 'pt-0.5 pb-0.5' : ''}`,
    children: children,
  });
  if (isInRow) return note;
  return jsx('div', {
    className: `grid shrink-0 ${PANE_ROW_LABEL_COLUMNS} gap-x-sm pb-1 ${PANE_GUTTER_CLASSES}`,
    children: note,
  });
}
export function PaneSelect(props?: Dynamic) {
  let {
    name: name,
    value: value,
    items: items,
    hasLongRows: hasLongRows,
    isSamePickTold: isSamePickTold,
    isOff = false,
    isFlush: isFlush,
  } = props;
  let {
    heading: heading,
    suggested: suggested,
    heard: heard,
    lastRow: lastRow,
    beforeCaret: beforeCaret,
    tooltip: tooltip,
    onChange: onChange,
  } = props;
  let { longestLabelInCharacters: longestLabelInCharacters } = props;
  let selectId = React.useId();
  let heardIdOf = (item?: Dynamic) => `${selectId}-${items.indexOf(item)}`;
  let picked = items.find((input?: Dynamic) => input.value === value);
  let pickedExample = picked?.inBox === undefined && beforeCaret === undefined ? picked?.example : undefined;
  let renderItem = (item?: Dynamic) =>
    jsx(
      Menu.Item,
      {
        ...(item.icon !== undefined && {
          icon:
            item.isIconTurned === true
              ? jsx(Icon, {
                  name: item.icon,
                  size: 'auto',
                  rotate: 90,
                })
              : item.icon,
        }),
        checked: item.value === value,
        checkedRole: 'radio',
        label: item.label,
        description: item.description ?? null,
        ...(item.example !== undefined && {
          hint: item.example,
          hintDir: 'auto',
        }),
        ...(item.heard !== undefined && {
          'aria-describedby': heardIdOf(item),
        }),
        onClick: () => {
          if (item.value !== value || isSamePickTold === true) onChange(item.value);
        },
        children: jsxs('span', {
          className: `flex min-w-0 flex-1 items-center ${hasLongRows !== true ? 'gap-1.5' : longestLabelInCharacters === undefined ? 'justify-between gap-lg' : 'gap-lg'}`,
          children: [
            jsx('span', {
              dir: 'auto',
              className: hasLongRows === true ? 'max-w-full shrink-0 truncate' : 'min-w-0 truncate',
              ...(longestLabelInCharacters !== undefined &&
                item.hint !== undefined && {
                  style: {
                    minWidth: `${longestLabelInCharacters}ch`,
                  },
                }),
              children: item.label,
            }),
            item.heard !== undefined &&
              jsx('span', {
                id: heardIdOf(item),
                hidden: true,
                children: item.heard,
              }),
            item.value === suggested?.value &&
              jsxs('span', {
                className: 'sr-only',
                children: [' ', suggested.inWords],
              }),
            item.hint !== undefined &&
              jsx('span', {
                className: `text-footnote text-muted ${hasLongRows === true ? 'min-w-0 truncate' : 'shrink-0'}`,
                children: item.hint,
              }),
          ],
        }),
      },
      item.value,
    );
  let trigger = jsx(Menu.Trigger, {
    render: jsxs('button', {
      type: 'button',
      'aria-label': name,
      'aria-describedby': heard === undefined ? undefined : selectId,
      disabled: isOff,
      className: `${(isFlush === true ? PANE_SELECT_FLUSH_TRIGGER_CLASSES : PANE_SELECT_TRIGGER_CLASSES).className} ${hasLongRows === true ? 'min-h-control py-1 leading-snug pointer-coarse:min-h-10' : PANE_SELECT_HEIGHT_CLASSES.className}`,
      children: [
        picked?.icon !== undefined &&
          jsx(Icon, {
            name: picked.icon,
            size: 'sm',
            rotate: picked.isIconTurned === true ? 90 : 0,
            className: 'shrink-0 text-secondary',
          }),
        jsxs('span', {
          dir: 'auto',
          className: `min-w-0 ${isFlush === true ? '' : 'flex-1'} ${hasLongRows === true ? 'line-clamp-3' : 'truncate'} ${pickedExample === undefined ? '' : '-me-1'}`,
          children: [
            picked?.inBox ??
              picked?.label ??
              jsx('span', {
                className: 'text-muted',
                children: props.placeholder,
              }),
            pickedExample !== undefined &&
              jsxs('span', {
                className: 'text-footnote text-muted',
                children: [' ', pickedExample],
              }),
          ],
        }),
        beforeCaret,
        jsx(PaneSelectCaret, {}),
      ],
    }),
  });
  return jsxs(Menu.Root, {
    children: [
      tooltip === undefined
        ? trigger
        : jsx(Tooltip, {
            ...(tooltip ?? {
              content: null,
            }),
            children: trigger,
          }),
      heard !== undefined &&
        jsx('span', {
          id: selectId,
          hidden: true,
          children: heard,
        }),
      jsxs(Menu.Popup, {
        align: 'start',
        className:
          hasLongRows === true
            ? 'w-auto max-w-[min(32rem,var(--available-width))] min-w-[var(--anchor-width)]'
            : 'w-max max-w-[var(--available-width)] min-w-[max(var(--anchor-width),12rem)]',
        onKeyDownCapture: blockRepeatedEnterOrSpace,
        children: [
          suggested === undefined
            ? jsxs(Menu.Group, {
                children: [
                  heading !== undefined &&
                    jsx(Menu.GroupLabel, {
                      children: heading,
                    }),
                  items.map(renderItem),
                ],
              })
            : jsxs(Menu.Group, {
                'aria-label': heading,
                children: [
                  suggested.caption,
                  items.filter((input?: Dynamic) => input.value === suggested.value).map(renderItem),
                  jsx(Menu.Separator, {}),
                  jsx(Menu.Header, {
                    children: suggested.captionOfTheRest,
                  }),
                  items.filter((input?: Dynamic) => input.value !== suggested.value).map(renderItem),
                ],
              }),
          lastRow !== undefined &&
            jsxs(Fragment, {
              children: [
                jsx(Menu.Separator, {}),
                jsx(Menu.Item, {
                  label: lastRow.label,
                  onClick: lastRow.onPicked,
                  children: lastRow.label,
                }),
              ],
            }),
        ],
      }),
    ],
  });
}
export function PaneEmptyState({ title: title, hint: hint, action: action, isSaid: isSaid }: Dynamic) {
  return jsxs('div', {
    className: `flex flex-col items-center justify-center text-center text-footnote text-secondary ${title === '' && hint === '' ? '' : 'flex-1 px-lg py-12'}`,
    children: [
      jsxs(isSaid === true ? 'output' : 'div', {
        className: 'flex flex-col gap-xs',
        children: [
          title !== '' &&
            jsx('span', {
              className: 'text-body text-primary',
              children: title,
            }),
          hint !== '' &&
            jsx('span', {
              children: hint,
            }),
        ],
      }),
      jsx('div', {
        className: 'pt-md empty:hidden',
        children: action,
      }),
    ],
  });
}
export const SIDE_PANE_DEFAULT_WIDTH = 312;
export const SIDE_PANE_MIN_WIDTH = 285;
export const SIDE_PANE_MAX_WIDTH = 560;
export const initialSidePaneWidth = () =>
  readStoredSidePaneWidth(SIDE_PANE_MIN_WIDTH, SIDE_PANE_MAX_WIDTH) ?? SIDE_PANE_DEFAULT_WIDTH;
export const SIDE_PANE_WIDTH_VAR = '--sheet-side-pane-width';
export const sidePaneWidthCss = (width?: Dynamic) => `min(${width}px,max(${SIDE_PANE_MIN_WIDTH}px,50vw))`;
export const sidePaneMaxWidthFor = (windowWidth?: Dynamic) =>
  Math.max(SIDE_PANE_MIN_WIDTH, Math.min(SIDE_PANE_MAX_WIDTH, Math.floor(windowWidth / 2)));
export const subscribeSidePaneWindowResize = (onResize?: Dynamic) => (
  (window as Dynamic).addEventListener('resize', onResize),
  () => (window as Dynamic).removeEventListener('resize', onResize)
);
export const getWindowInnerWidth = () => (window as Dynamic).innerWidth;
export const getServerWindowWidth = () => 1 / 0;
export const sheetBesideSidePaneProps = (width?: Dynamic, isPaneOpen?: Dynamic) => ({
  className: isPaneOpen ? 'min-[600px]:pe-[312px] min-[768px]:pe-(--sheet-side-pane-width) max-[600px]:pb-(--sheet-side-pane-at-foot)' : '',
  style: {
    [SIDE_PANE_WIDTH_VAR]: sidePaneWidthCss(width),
  },
});
export const SHEET_BEHIND_SIDE_PANE_CLASS = 'sheet-behind-side-pane';
export const SIDE_PANE_SCROLL_MARGIN = 12;
export const SIDE_PANE_FADE_SCROLL_MARGIN = 32;
export const SCROLL_FADE_CLASS = 'scroll-fade-y';
export const SHORT_PANE_LAYOUT = {
  aroundWhatScrollsAndFoot: {
    className: 'flex min-h-0 flex-1 flex-col [@container(max-height:280px)]:overflow-y-auto',
  },
  whatScrolls: {
    className: '[@container(max-height:280px)]:flex-none [@container(max-height:280px)]:overflow-y-visible [@container(max-height:280px)]:mask-none',
  },
};
export const PANE_SECTION_ACTIONS_ATTRIBUTE = 'data-actions-of-pane-section';
export const PANE_START_ATTRIBUTE = 'data-start-of-pane';
export const lastFocusedInPane = new (WeakMap as Dynamic)();
export const HOLDS_TOOLTIP_ATTRIBUTE = 'data-holds-tooltip-as-pane-opens';
export const PaneButtonPropsContext: React.Context<Record<string, unknown> | null> = React.createContext<Record<string, unknown> | null>(null);
export const SIDE_PANE_TITLE_ATTRIBUTE = 'data-title-of-side-pane';
export const SidePaneShutContext = React.createContext(() => {});
export const PANE_GUTTER_CLASSES = 'ps-[var(--sheet-pane-gutter,var(--ui-pad-lg))] pe-[var(--sheet-pane-gutter,var(--ui-pad-md))]';
export const POINTED_AT_MARK = {
  className: 'sheet-pointed-at',
  mark: {
    'data-is-pointed-at': true,
  },
};
export const PANE_ROW_LABEL_COLUMNS = 'grid-cols-[80px_minmax(0,1fr)]';
export const PANE_PROPERTY_PAD_VARS =
  '[--cmp-property-pad-start:var(--sheet-pane-gutter,var(--ui-pad-lg))] [--cmp-property-pad-end:var(--sheet-pane-gutter,var(--ui-pad-md))]';
export const ELLIPSIS_INPUT_CLASSES = 'text-ellipsis [&_input]:text-ellipsis';
export const PANE_SELECT_TRIGGER_CLASSES = {
  className:
    'group/select flex w-full min-w-0 flex-1 cursor-default items-center gap-1.5 rounded bg-fill-field ps-md pe-sm text-start text-body text-primary shadow-field-ring outline-none transition duration-fast hover:shadow-field-hover focus-visible:shadow-focus focus-visible:outline-hidden disabled:opacity-disabled aria-expanded:shadow-field-hover forced-colors:outline-1 forced-colors:-outline-offset-1 forced-colors:outline-solid',
};
export const PANE_SELECT_FLUSH_TRIGGER_CLASSES = {
  className:
    'group/select flex min-w-0 cursor-default items-center gap-1 rounded px-xs text-start text-body text-primary outline-none transition duration-fast hover:bg-fill-ghost-hover focus-visible:shadow-focus focus-visible:outline-hidden disabled:opacity-disabled aria-expanded:bg-fill-ghost-selected',
};
export const PANE_SELECT_HEIGHT_CLASSES = {
  className: 'h-control pointer-coarse:h-10',
};
export const PaneSelectCaret = () =>
  jsx(Icon, {
    name: 'CaretDown',
    size: 'sm',
    className: 'me-0.5 shrink-0 text-muted transition-colors duration-fast group-hover/select:text-secondary',
  });
