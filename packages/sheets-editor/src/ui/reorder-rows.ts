import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
export function stepsTravelled(lengths?: Dynamic, from?: Dynamic, step?: Dynamic, distance?: Dynamic) {
  let [steps, travelled]: Dynamic = [0, 0];
  for (let index: Dynamic = from + step; index >= 0 && index < lengths.length; index += step) {
    let rowLength = lengths[index] ?? 0;
    if (distance <= travelled + rowLength / 2) break;
    steps += 1;
    travelled += rowLength;
  }
  return steps;
}
export function reorderTarget(drag?: Dynamic) {
  let { from: from, lengths: lengths } = drag;
  let [mostBack, mostOn] = [-sumOf(lengths.slice(0, from)), sumOf(lengths.slice(from + 1))];
  let travel = Math.max(mostBack, Math.min(drag.travel, mostOn));
  let way = travel < 0 ? -1 : 1;
  let to = from + way * stepsTravelled(lengths, from, way, Math.abs(travel));
  let stoppedAt = drag.travel <= mostBack ? 'first' : drag.travel >= mostOn ? 'last' : null;
  return {
    travel: travel,
    to: to,
    stoppedAt: stoppedAt,
  };
}
export function reachOutside(row?: Dynamic, room?: Dynamic) {
  return {
    start: Math.max(0, room.start - row.start),
    end: Math.max(0, row.start + row.length - room.end),
  };
}
export function clampTravelToRoom(drag?: Dynamic, room?: Dynamic, outside?: Dynamic) {
  let least = room.start - outside.start;
  return Math.max(least, Math.min(drag.wanted, room.end + outside.end - drag.length));
}
export function autoScrollSpeed(pointerAt: Dynamic, { start: start, end: end }: Dynamic) {
  let edge = Math.min(AUTO_SCROLL_EDGE, (end - start) / 3);
  if (edge <= 0) return 0;
  let [intoStart, intoEnd] = [start + edge - pointerAt, pointerAt - (end - edge)];
  if (intoStart > 0) return -AUTO_SCROLL_MAX_SPEED * Math.min(1, intoStart / edge);
  return intoEnd > 0 ? AUTO_SCROLL_MAX_SPEED * Math.min(1, intoEnd / edge) : 0;
}
export function reorderRowProps(drag?: Dynamic, key?: Dynamic, index?: Dynamic, way: Dynamic = 'down') {
  if (drag === null || drag.phase === 'pressed') return {};
  if (drag.key === key)
    return {
      'data-reorder': drag.phase,
    };
  if (drag.phase === 'landing') return {};
  let shift = shiftOfRow(index, drag);
  let offset = shift * (drag.lengths[drag.from] ?? 0);
  return shift === 0
    ? {}
    : {
        style: {
          transform: `${REORDER_AXES[way].translate}(${offset}px)`,
        },
      };
}
export function scrollerAround(element?: Dynamic, way?: Dynamic) {
  for (let ancestor: Dynamic = element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
    let overflow = getComputedStyle(ancestor)[REORDER_AXES[way].overflow];
    if (overflow === 'auto' || overflow === 'scroll') return ancestor;
  }
  return null;
}
export function swallowNextClick(view?: Dynamic, isByKey?: Dynamic) {
  let listenerOptions = {
    capture: true,
  };
  let stopSwallowing = () => {
    view.removeEventListener('click', swallow, listenerOptions);
    view.removeEventListener('pointerdown', stopSwallowing, listenerOptions);
    view.removeEventListener('keydown', stopSwallowing, listenerOptions);
  };
  let swallow = (event?: Dynamic) => {
    event.preventDefault();
    event.stopPropagation();
    stopSwallowing();
  };
  view.addEventListener('click', swallow, listenerOptions);
  view.addEventListener('pointerdown', stopSwallowing, listenerOptions);
  if (!isByKey) view.addEventListener('keydown', stopSwallowing, listenerOptions);
}
export function autoScrollSpeedOf({ pointerAt: pointerAt, scroller: scroller }: Dynamic, way?: Dynamic) {
  if (scroller === null) return 0;
  let bounds = scroller.getBoundingClientRect();
  return autoScrollSpeed(pointerAt, {
    start: bounds[REORDER_AXES[way].start],
    end: bounds[REORDER_AXES[way].end],
  });
}
export function useReorderRows({
  listRef: listRef,
  keys: keys,
  way = 'down',
  onMoved: onMoved,
  onDragEnded: onDragEnded,
  isRowPutBackPressed = true,
  roomKeptAtEnds: roomKeptAtEnds,
}: Dynamic) {
  let [drag, setDrag] = React.useState(null);
  let [areHandleTooltipsShut, setHandleTooltipsShut] = React.useState(false);
  let pressRef = React.useRef(null);
  if (drag !== null && drag.phase !== 'landing' && keys[drag.from] !== drag.key) {
    setDrag(null);
    setHandleTooltipsShut(false);
  }
  let startsBeforeRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let startsBefore = startsBeforeRef.current;
    startsBeforeRef.current = null;
    if (startsBefore === null) return;
    let rows = [...startsBefore.keys()].filter((row?: Dynamic) => row.isConnected);
    for (let row of rows as Dynamic) {
      row.style.removeProperty(REORDER_TRAVEL_PROPERTY);
      row.style.transition = 'none';
    }
    let { start: startSide, translate: translate } = REORDER_AXES[way];
    let shifts = rows.map((row?: Dynamic) => (startsBefore.get(row) ?? 0) - row.getBoundingClientRect()[startSide]);
    for (let [row, rowElement] of rows.entries() as Dynamic) rowElement.style.transform = `${translate}(${shifts[row] ?? 0}px)`;
    listRef.current?.getBoundingClientRect();
    for (let row of rows as Dynamic) {
      row.style.transition = '';
      row.style.transform = '';
    }
    if (drag?.phase !== 'landing') return;
    let landing = drag;
    let animations = rows.find((row?: Dynamic) => row.dataset.reorder !== undefined)?.getAnimations() ?? [];
    Promise.allSettled(animations.map(({ finished: finished }: Dynamic) => finished)).then(
      () => setDrag((drag2?: Dynamic) => (drag2 === landing ? null : drag2)),
    );
  });
  let latestRef = React.useRef({
    keys: keys,
    onMoved: onMoved,
    onDragEnded: onDragEnded,
    isRowPutBackPressed: isRowPutBackPressed,
    roomKeptAtEnds: roomKeptAtEnds,
  });
  React.useLayoutEffect(() => {
    latestRef.current = {
      keys: keys,
      onMoved: onMoved,
      onDragEnded: onDragEnded,
      isRowPutBackPressed: isRowPutBackPressed,
      roomKeptAtEnds: roomKeptAtEnds,
    };
  });
  let isHeld = drag?.phase === 'held';
  let isPressed = isHeld || drag?.phase === 'pressed';
  React.useEffect(() => {
    let view = listRef.current?.ownerDocument.defaultView ?? null;
    if (!isPressed || view === null) return;
    let clampTravel = (press2?: Dynamic, travel?: Dynamic) => {
      let [list, rowLength] = [listRef.current, press2.lengths[press2.from] ?? 0];
      if (list === null || press2.scroller === null) return travel;
      let roomKept = latestRef.current.roomKeptAtEnds?.(press2.scroller, rowLength) ?? null;
      if (roomKept === null) return travel;
      let { start: startSide, end: endSide } = REORDER_AXES[way];
      let bounds = press2.scroller.getBoundingClientRect();
      let room = {
        start: bounds[startSide] + roomKept.start,
        end: bounds[endSide] - roomKept.end,
      };
      let rowStart = list.getBoundingClientRect()[startSide] + sumOf(press2.lengths.slice(0, press2.from));
      press2.reachWhenTaken ??= reachOutside(
        {
          start: rowStart,
          length: rowLength,
        },
        room,
      );
      let wantedStart = rowStart + travel;
      return (
        clampTravelToRoom(
          {
            wanted: wantedStart,
            length: rowLength,
          },
          room,
          press2.reachWhenTaken,
        ) - rowStart
      );
    };
    let followPointer = () => {
      let press2 = pressRef.current;
      if (press2 === null || !press2.isRowTaken) return;
      let scrolledSincePress = (press2.scroller?.[REORDER_AXES[way].scrolled] ?? 0) - press2.scrolledAtPress;
      let {
        travel: travel,
        to: to,
        stoppedAt: stoppedAt,
      } = reorderTarget({
        from: press2.from,
        lengths: press2.lengths.slice(0, latestRef.current.keys.length),
        travel: press2.pointerAt - press2.pressedAt + scrolledSincePress,
      });
      press2.row.style.setProperty(REORDER_TRAVEL_PROPERTY, `${clampTravel(press2, travel)}px`);
      [press2.to, press2.stoppedAt] = [to, stoppedAt];
      press2.hasLeftItsPlace ||= to !== press2.from;
      setDrag(
        (drag2?: Dynamic) =>
          drag2 === null || drag2.to === to
            ? drag2
            : {
                ...drag2,
                to: to,
              },
      );
    };
    let endPress = (how?: Dynamic, isByKey: Dynamic = false, letGoAt: Dynamic = null) => {
      let press2 = pressRef.current;
      if (press2 === null) return;
      pressRef.current = null;
      if (!press2.isRowTaken) {
        setDrag(null);
        return;
      }
      let isLetGoOverRow = letGoAt !== null && isPointInRect(press2.row.getBoundingClientRect(), letGoAt);
      let { key: key, from: from, to: to, lengths: lengths, holder: holder, pointerId: pointerId, hasMoved: hasMoved } = press2;
      if (holder.hasPointerCapture(pointerId)) holder.releasePointerCapture(pointerId);
      let isPutBack = isPutBackPress({
        how: how,
        isBackInItsPlace: to === from,
        isRowPutBackPressed: latestRef.current.isRowPutBackPressed,
      });
      if (press2.pressed === 'rowItself' && !isPutBack) swallowNextClick(view, isByKey);
      let land = () => {
        startsBeforeRef.current = rowStartsOf(listRef.current, way);
        press2.row.style.transition = 'none';
        setDrag({
          key: key,
          from: from,
          to: to,
          lengths: lengths,
          phase: 'landing',
        });
      };
      if (how === 'dropped' && hasMoved && to !== from) latestRef.current.onMoved(key, to, land);
      else land();
      let { hasLeftItsPlace: hasLeftItsPlace } = press2;
      latestRef.current.onDragEnded?.({
        key: key,
        how: how,
        hasLeftItsPlace: hasLeftItsPlace,
        isLetGoOverRow: isLetGoOverRow,
      });
    };
    let isOwnPointer = ({ pointerId: pointerId }: Dynamic) => pointerId === pressRef.current?.pointerId;
    let onPointerMove = (event?: Dynamic) => {
      let press2 = pressRef.current;
      if (press2 === null || !isOwnPointer(event)) return;
      if (event.buttons === 0) {
        endPress('canceled');
        return;
      }
      press2.pointerAt = event[REORDER_AXES[way].pointer];
      let travel = press2.pointerAt - press2.pressedAt;
      if (!press2.isRowTaken) {
        if (!isFarEnoughToTake(travel)) return;
        press2.isRowTaken = true;
        press2.holder.setPointerCapture(press2.pointerId);
        setDrag(
          (drag2?: Dynamic) =>
            drag2 === null
              ? drag2
              : {
                  ...drag2,
                  phase: 'held',
                },
        );
      }
      press2.hasMoved ||= Math.abs(travel) >= REORDER_MOVE_SLOP;
      let scrollSpeed = autoScrollSpeedOf(press2, way);
      press2.mayScrollToStart ||= mayAutoScroll(-1, scrollSpeed, travel);
      press2.mayScrollToEnd ||= mayAutoScroll(1, scrollSpeed, travel);
      followPointer();
    };
    let onPointerUp = (event?: Dynamic) => {
      if (isOwnPointer(event)) endPress('dropped', false, event);
    };
    let onPointerCancel = (event?: Dynamic) => {
      if (isOwnPointer(event)) endPress('canceled');
    };
    let cancel = () => endPress('canceled');
    let noteMoved = () => {
      if (pressRef.current !== null) pressRef.current.hasMoved = true;
    };
    let onKeyDown = (event?: Dynamic) => {
      if (isScrollKey(event)) noteMoved();
      if (event.key !== 'Escape' || pressRef.current?.isRowTaken !== true) return;
      event.preventDefault();
      event.stopPropagation();
      endPress('canceled', true);
    };
    let onScroll = () => followPointer();
    let listenerOptions = {
      capture: true,
    };
    view.addEventListener('pointermove', onPointerMove, listenerOptions);
    view.addEventListener('pointerup', onPointerUp, listenerOptions);
    view.addEventListener('pointercancel', onPointerCancel, listenerOptions);
    view.addEventListener('lostpointercapture', onPointerCancel, listenerOptions);
    view.addEventListener('pointerdown', cancel, listenerOptions);
    view.addEventListener('keydown', onKeyDown, listenerOptions);
    view.addEventListener('scroll', onScroll, listenerOptions);
    view.addEventListener('wheel', noteMoved, {
      capture: true,
      passive: true,
    });
    view.addEventListener('blur', cancel);
    let [lastFrameAt, scrollCarry]: Dynamic = [view.performance.now(), 0];
    let autoScrollFrame = (frameAt?: Dynamic) => {
      frameRequest = view.requestAnimationFrame(autoScrollFrame);
      let [press2, elapsed] = [pressRef.current, frameAt - lastFrameAt];
      lastFrameAt = frameAt;
      if (press2 === null || press2.scroller === null || !press2.isRowTaken || !press2.hasMoved) return;
      let speed = autoScrollSpeedOf(press2, way);
      let mayScroll = speed < 0 ? press2.mayScrollToStart : press2.mayScrollToEnd;
      if (speed === 0 || !mayScroll || press2.stoppedAt === (speed < 0 ? 'first' : 'last')) {
        scrollCarry = 0;
        return;
      }
      scrollCarry += speed * elapsed;
      let scrollStep = Math.trunc(scrollCarry);
      if (scrollStep === 0) return;
      scrollCarry -= scrollStep;
      press2.scroller.scrollBy({
        [REORDER_AXES[way].start]: scrollStep,
        behavior: 'instant',
      });
      followPointer();
    };
    let frameRequest: Dynamic = view.requestAnimationFrame(autoScrollFrame);
    return () => {
      view.removeEventListener('pointermove', onPointerMove, listenerOptions);
      view.removeEventListener('pointerup', onPointerUp, listenerOptions);
      view.removeEventListener('pointercancel', onPointerCancel, listenerOptions);
      view.removeEventListener('lostpointercapture', onPointerCancel, listenerOptions);
      view.removeEventListener('pointerdown', cancel, listenerOptions);
      view.removeEventListener('keydown', onKeyDown, listenerOptions);
      view.removeEventListener('scroll', onScroll, listenerOptions);
      view.removeEventListener('wheel', noteMoved, listenerOptions);
      view.removeEventListener('blur', cancel);
      view.cancelAnimationFrame(frameRequest);
      let press2 = pressRef.current;
      pressRef.current = null;
      press2?.row.style.removeProperty(REORDER_TRAVEL_PROPERTY);
      if (press2?.holder.hasPointerCapture(press2.pointerId) === true) press2.holder.releasePointerCapture(press2.pointerId);
    };
  }, [isPressed, listRef, way]);
  React.useEffect(() => {
    let view = listRef.current?.ownerDocument.defaultView ?? null;
    if (!areHandleTooltipsShut || isHeld || view === null) return;
    let onPointerMove = ({ target: target }: Dynamic) => {
      if (!(target instanceof view.Element) || target.closest(`[${REORDER_HANDLE_ATTRIBUTE}]`) === null) setHandleTooltipsShut(false);
    };
    view.addEventListener('pointermove', onPointerMove);
    return () => view.removeEventListener('pointermove', onPointerMove);
  }, [areHandleTooltipsShut, isHeld, listRef]);
  React.useEffect(() => {
    let list = listRef.current;
    list?.toggleAttribute(IS_REORDERING_ATTRIBUTE, isHeld);
    return () => void list?.toggleAttribute(IS_REORDERING_ATTRIBUTE, false);
  }, [isHeld, listRef]);
  let gliding = (move?: Dynamic, onLanded?: Dynamic) =>
    move((hasMoved?: Dynamic) => {
      if (hasMoved) startsBeforeRef.current = rowStartsOf(listRef.current, way);
      onLanded?.(hasMoved);
    });
  let press = (event?: Dynamic, key?: Dynamic, index?: Dynamic, pressed?: Dynamic) => {
    let rows = [...(listRef.current?.children ?? [])];
    let row = rows[index];
    if (event.button !== 0 || event.ctrlKey || !event.isPrimary) return;
    if (pressRef.current !== null || isHeld) return;
    if (!(row instanceof HTMLElement) || keys[index] !== key) return;
    let phase = pressPhase(pressed, event.pointerType);
    if (phase === null) return;
    let takesRowAtOnce = phase === 'held';
    let { pointer: pointerSide, length: lengthSide, scrolled: scrolledSide } = REORDER_AXES[way];
    let scroller = scrollerAround(row, way);
    let lengths = rows.map((row2?: Dynamic) => row2.getBoundingClientRect()[lengthSide]);
    if (takesRowAtOnce) event.currentTarget.setPointerCapture(event.pointerId);
    pressRef.current = {
      pointerId: event.pointerId,
      key: key,
      from: index,
      row: row,
      scroller: scroller,
      lengths: lengths,
      pressedAt: event[pointerSide],
      reachWhenTaken: null,
      scrolledAtPress: scroller?.[scrolledSide] ?? 0,
      pointerAt: event[pointerSide],
      pressed: pressed,
      isRowTaken: takesRowAtOnce,
      hasMoved: false,
      hasLeftItsPlace: false,
      mayScrollToStart: false,
      mayScrollToEnd: false,
      to: index,
      stoppedAt: null,
      holder: event.currentTarget,
    };
    if (takesRowAtOnce) setHandleTooltipsShut(true);
    setDrag({
      key: key,
      from: index,
      to: index,
      lengths: lengths,
      phase: phase,
    });
  };
  return {
    areTooltipsOfHandlesShut: areHandleTooltipsShut,
    gliding: gliding,
    ofRow: (key?: Dynamic, index?: Dynamic) => ({
      ...reorderRowProps(drag, key, index, way),
      className: `${REORDER_ROW_CLASS.className} ${REORDER_HELD_TRANSLATE_CLASS[way]}`,
    }),
    isRowHeld: isHeld,
    pressOnRowItself: (event?: Dynamic, key?: Dynamic, index?: Dynamic) => press(event, key, index, 'rowItself'),
    ofHandle: (key?: Dynamic, index?: Dynamic) => ({
      className: 'cursor-grab touch-none',
      [REORDER_HANDLE_ATTRIBUTE]: true,
      onPointerDown: (event?: Dynamic) => press(event, key, index, 'handle'),
      onKeyDown: (event?: Dynamic) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        if (event.ctrlKey && event.altKey) return;
        event.preventDefault();
        if (event.repeat || pressRef.current !== null || isHeld) return;
        let to = index + (event.key === 'ArrowUp' ? -1 : 1);
        if (to < 0 || to >= keys.length) return;
        gliding(
          (onDone?: Dynamic) => onMoved(key, to, onDone),
          (hasMoved?: Dynamic) => {
            if (hasMoved)
              setDrag({
                key: key,
                from: to,
                to: to,
                lengths: [],
                phase: 'landing',
              });
          },
        );
      },
    }),
  };
}
export const AUTO_SCROLL_EDGE = 40;
export const AUTO_SCROLL_MAX_SPEED = 0.6;
export const REORDER_MOVE_SLOP = 3;
export const REORDER_TAKE_DISTANCE = 6;
export const AUTO_SCROLL_ARM_DISTANCE = 12;
export const REORDER_TRAVEL_PROPERTY = '--sheet-reorder-travel';
export const isScrollKey = ({ key: key }: Dynamic) =>
  key === 'PageUp' || key === 'PageDown' || key === 'Home' || key === 'End' || key === 'ArrowUp' || key === 'ArrowDown' || key === ' ';
export const IS_REORDERING_ATTRIBUTE = 'data-is-reordering';
export const REORDER_HANDLE_ATTRIBUTE = 'data-reorder-handle';
export const REORDER_AXES = {
  down: {
    pointer: 'clientY',
    start: 'top',
    end: 'bottom',
    length: 'height',
    scrolled: 'scrollTop',
    overflow: 'overflowY',
    translate: 'translateY',
  },
  across: {
    pointer: 'clientX',
    start: 'left',
    end: 'right',
    length: 'width',
    scrolled: 'scrollLeft',
    overflow: 'overflowX',
    translate: 'translateX',
  },
};
export const sumOf = (numbers?: Dynamic) => numbers.reduce((sum?: Dynamic, number?: Dynamic) => sum + number, 0);
export const shiftOfRow = (index: Dynamic, { from: from, to: to }: Dynamic) => {
  if (index > from && index <= to) return -1;
  return index < from && index >= to ? 1 : 0;
};
export const mayAutoScroll = (direction?: Dynamic, speed?: Dynamic, travel?: Dynamic) =>
  speed * direction <= 0 || speed * direction >= AUTO_SCROLL_MAX_SPEED || travel * direction >= AUTO_SCROLL_ARM_DISTANCE;
export const pressPhase = (pressed?: Dynamic, pointerType?: Dynamic) =>
  pressed === 'handle' ? 'held' : pointerType === 'touch' ? null : 'pressed';
export const isFarEnoughToTake = (travel?: Dynamic) => Math.abs(travel) >= REORDER_TAKE_DISTANCE;
export const isPutBackPress = (end?: Dynamic) => end.how === 'dropped' && end.isBackInItsPlace && end.isRowPutBackPressed;
export const isPointInRect = (rect: Dynamic, { clientX: clientX, clientY: clientY }: Dynamic) =>
  clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
export const isDropAPressOnRow = ({ how: how, hasLeftItsPlace: hasLeftItsPlace, isLetGoOverRow: isLetGoOverRow }: Dynamic) =>
  how === 'dropped' && !hasLeftItsPlace && isLetGoOverRow;
export const REORDER_ROW_CLASS = {
  className:
    'group/reorder relative isolate transition-[opacity,transform,translate] duration-base ease-out motion-reduce:transition-none data-reorder:z-1 data-[reorder=held]:cursor-grabbing data-[reorder=held]:transition-none',
};
export const REORDER_HELD_TRANSLATE_CLASS = {
  down: 'data-[reorder=held]:translate-y-(--sheet-reorder-travel)',
  across: 'data-[reorder=held]:translate-x-(--sheet-reorder-travel)',
};
export const REORDER_LIFT_PROPS = {
  'aria-hidden': true,
  className:
    'pointer-events-none absolute inset-x-1 inset-y-0 -z-1 rounded bg-surface-popover opacity-0 shadow-panel-sm transition-opacity duration-snap ease-out motion-reduce:transition-none group-data-reorder/reorder:opacity-100 forced-colors:outline forced-colors:-outline-offset-1',
};
export const rowStartsOf = (list?: Dynamic, way?: Dynamic) =>
  new (Map as Dynamic)(
    [...(list?.children ?? [])]
      .filter((child?: Dynamic) => child instanceof HTMLElement)
      .map((child?: Dynamic) => [child, child.getBoundingClientRect()[REORDER_AXES[way].start]]),
  );
