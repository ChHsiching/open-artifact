import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx } from 'react/jsx-runtime';
export function overlayScrollbarThumb(
  { scrollHeight: scrollHeight, clientHeight: clientHeight, scrollTop: scrollTop }: Dynamic,
  padding?: Dynamic,
) {
  if (scrollHeight <= clientHeight + 1) return null;
  let thumbHeight = Math.max(OVERLAY_SCROLLBAR_MIN_THUMB_PX, Math.round((clientHeight / scrollHeight) * clientHeight));
  return {
    top: Math.round((scrollTop / (scrollHeight - clientHeight)) * (clientHeight - thumbHeight)) - clientHeight + padding.bottom,
    height: thumbHeight,
    fromEnd: OVERLAY_SCROLLBAR_INSET_PX - padding.inlineEnd,
  };
}
export function thumbDragToScroll(
  dragDelta: Dynamic,
  { scrollHeight: scrollHeight, clientHeight: clientHeight }: Dynamic,
  thumbHeight?: Dynamic,
) {
  let trackRoom = clientHeight - thumbHeight;
  return trackRoom <= 0 ? 0 : (dragDelta * (scrollHeight - clientHeight)) / trackRoom;
}
export function useOverlayScrollbarVisibility(anchorRef?: Dynamic) {
  let [areShown, setAreShown] = React.useState(false);
  let isPointerOverRef = React.useRef(false);
  let isHeldRef = React.useRef(false);
  let hideTimerRef = React.useRef(null);
  let hideLater = React.useCallback(() => {
    let view = anchorRef.current?.ownerDocument.defaultView ?? null;
    if (view === null) return;
    if (hideTimerRef.current !== null) view.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = view.setTimeout(() => {
      hideTimerRef.current = null;
      if (!isPointerOverRef.current && !isHeldRef.current) setAreShown(false);
    }, OVERLAY_SCROLLBAR_HIDE_DELAY_MS);
  }, [anchorRef]);
  let moved = React.useCallback(() => {
    setAreShown(true);
    hideLater();
  }, [hideLater]);
  let held = React.useCallback(
    (isHeld?: Dynamic) => {
      if (isHeldRef.current === isHeld) return;
      isHeldRef.current = isHeld;
      moved();
    },
    [moved],
  );
  React.useEffect(() => {
    let scroller = anchorRef.current?.parentElement ?? null;
    let view = scroller?.ownerDocument.defaultView ?? null;
    if (scroller === null || view === null) return;
    let onPointerEnter = () => {
      isPointerOverRef.current = true;
      setAreShown(true);
    };
    let onPointerLeave = () => {
      isPointerOverRef.current = false;
      if (!isHeldRef.current) hideLater();
    };
    scroller.addEventListener('pointerenter', onPointerEnter);
    scroller.addEventListener('pointerleave', onPointerLeave);
    return () => {
      scroller.removeEventListener('pointerenter', onPointerEnter);
      scroller.removeEventListener('pointerleave', onPointerLeave);
      if (hideTimerRef.current !== null) view.clearTimeout(hideTimerRef.current);
    };
  }, [anchorRef, hideLater]);
  return {
    areShown: areShown,
    moved: moved,
    held: held,
  };
}
export function OverlayScrollbarThumb({
  along: along,
  isShown: isShown,
  isForFingersToo = true,
  style: style,
  onHeld: onHeld,
  onDragged: onDragged,
}: Dynamic) {
  let [isDragged, setIsDragged] = React.useState(false);
  let dragRef = React.useRef(null);
  let releaseOnUnmount = React.useEffectEvent(() => {
    if (dragRef.current?.isOver === false) onHeld(false);
  });
  React.useEffect(() => () => releaseOnUnmount(), []);
  let pointerPosition = (input?: Dynamic) => (along === 'y' ? input.clientY : input.clientX);
  let endDrag = (event?: Dynamic) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    let { isOver: wasOver } = dragRef.current;
    let hadCapture = event.currentTarget.hasPointerCapture(event.pointerId);
    dragRef.current = hadCapture
      ? {
          ...dragRef.current,
          isOver: true,
        }
      : null;
    if (hadCapture) event.currentTarget.releasePointerCapture(event.pointerId);
    if (wasOver) return;
    setIsDragged(false);
    onHeld(false);
  };
  return jsx('div', {
    role: 'presentation',
    'data-along': along,
    'data-is-shown': isShown,
    'data-dragged': isDragged ? '' : undefined,
    className: `absolute cursor-default touch-none rounded-full bg-alpha-3 transition-opacity duration-150 select-none hover:bg-alpha-4 data-dragged:bg-alpha-4 motion-reduce:transition-none forced-colors:border-3 ${isShown ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`,
    style: style,
    onMouseDown: (event?: Dynamic) => event.preventDefault(),
    onDoubleClick: (input?: Dynamic) => input.stopPropagation(),
    onPointerDown: (event?: Dynamic) => {
      let isUnwantedTouch = !isForFingersToo && event.pointerType === 'touch';
      if (event.button !== 0 || event.ctrlKey || isUnwantedTouch) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
      dragRef.current = {
        from: pointerPosition(event),
        pointerId: event.pointerId,
        isOver: false,
      };
      setIsDragged(true);
      onHeld(true);
    },
    onPointerMove: (event?: Dynamic) => {
      if (dragRef.current?.pointerId !== event.pointerId || dragRef.current.isOver) return;
      if ((event.buttons & 1) === 0) endDrag(event);
      else onDragged(pointerPosition(event) - dragRef.current.from);
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onLostPointerCapture: endDrag,
  });
}
export function OverlayScrollbar() {
  let anchorRef = React.useRef(null);
  let [thumb, setThumb] = React.useState(null);
  let { areShown: areShown, moved: moved, held: held } = useOverlayScrollbarVisibility(anchorRef);
  let scrollTopAtHoldRef = React.useRef(0);
  React.useEffect(() => {
    let scroller = anchorRef.current?.parentElement ?? null;
    let view = scroller?.ownerDocument.defaultView ?? null;
    if (scroller === null || view === null) return;
    let frame: Dynamic = null;
    let measureSoon = () => {
      frame ??= view.requestAnimationFrame(() => {
        frame = null;
        let { paddingBottom: paddingBottom, paddingInlineEnd: paddingInlineEnd } = view.getComputedStyle(scroller);
        let nextThumb = overlayScrollbarThumb(scroller, {
          bottom: parseCssNumberOrZero(paddingBottom),
          inlineEnd: parseCssNumberOrZero(paddingInlineEnd),
        });
        setThumb((input?: Dynamic) => (isSameThumb(input, nextThumb) ? input : nextThumb));
      });
    };
    let onScroll = () => {
      measureSoon();
      moved();
    };
    scroller.addEventListener('scroll', onScroll, {
      passive: true,
    });
    scroller.addEventListener('pointerenter', measureSoon);
    let resizeObserver = new (view.ResizeObserver as Dynamic)(measureSoon);
    resizeObserver.observe(scroller);
    let mutationObserver = new (view.MutationObserver as Dynamic)(measureSoon);
    mutationObserver.observe(scroller, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    measureSoon();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('pointerenter', measureSoon);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (frame !== null) view.cancelAnimationFrame(frame);
    };
  }, [moved]);
  return jsx('div', {
    ref: anchorRef,
    'aria-hidden': true,
    className: 'sticky bottom-0 h-0 w-full shrink-0 overflow-visible',
    children:
      thumb !== null &&
      jsx(OverlayScrollbarThumb, {
        along: 'y',
        isShown: areShown,
        style: {
          width: OVERLAY_SCROLLBAR_WIDTH_PX,
          insetInlineEnd: thumb.fromEnd,
          top: thumb.top,
          height: thumb.height,
        },
        onHeld: (isHeld?: Dynamic) => {
          scrollTopAtHoldRef.current = anchorRef.current?.parentElement?.scrollTop ?? 0;
          held(isHeld);
        },
        onDragged: (dragDelta?: Dynamic) => {
          let scroller = anchorRef.current?.parentElement ?? null;
          if (scroller === null) return;
          scroller.scrollTo({
            top: scrollTopAtHoldRef.current + thumbDragToScroll(dragDelta, scroller, thumb.height),
            behavior: 'instant',
          });
        },
      }),
  });
}
export const HIDDEN_SCROLLBAR_CLASSES = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
export const OVERLAY_SCROLLBAR_WIDTH_PX = 6;
export const OVERLAY_SCROLLBAR_INSET_PX = 2;
export const OVERLAY_SCROLLBAR_MIN_THUMB_PX = 24;
export const OVERLAY_SCROLLBAR_HIDE_DELAY_MS = 800;
export const parseCssNumberOrZero = (cssValue?: Dynamic) => {
  let parsed = Number.parseFloat(cssValue);
  return Number.isNaN(parsed) ? 0 : parsed;
};
export const isSameThumb = (thumb?: Dynamic, otherThumb?: Dynamic) =>
  thumb?.top === otherThumb?.top && thumb?.height === otherThumb?.height && thumb?.fromEnd === otherThumb?.fromEnd;
