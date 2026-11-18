import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { unzoomLength } from './zoom.ts';
import {
  OVERLAY_SCROLLBAR_INSET_PX,
  OVERLAY_SCROLLBAR_MIN_THUMB_PX,
  useOverlayScrollbarVisibility,
  OVERLAY_SCROLLBAR_WIDTH_PX,
  OverlayScrollbarThumb,
  thumbDragToScroll,
} from '../ui/overlay-scrollbar.ts';
import { jsx, jsxs } from 'react/jsx-runtime';
export function gridScrollbarThumb({ by: by, most: most, from: from, to: to, room: room }: Dynamic, zoom: Dynamic = 1) {
  let track = to - from - unzoomLength(OVERLAY_SCROLLBAR_INSET_PX + GRID_SCROLLBAR_ROOM_PX, zoom);
  let minThumbLength = unzoomLength(OVERLAY_SCROLLBAR_MIN_THUMB_PX, zoom);
  if (most <= 0 || track <= minThumbLength) return null;
  let thumbLength = Math.max(minThumbLength, Math.round((track * room) / (most + room)));
  let way = track - thumbLength;
  return {
    start: from + unzoomLength(OVERLAY_SCROLLBAR_INSET_PX, zoom) + Math.round((way * Math.min(by, most)) / most),
    length: thumbLength,
    way: way,
  };
}
export function GridScrollbars({
  grid: { body: body, scroll: scroll, isMoreToTheRight: isMoreToTheRight },
  store: store,
  zoom: zoom,
}: Dynamic) {
  let layerRef = React.useRef(null);
  let { areShown: areShown, moved: showMoved, held: hold } = useOverlayScrollbarVisibility(layerRef);
  let byAtHoldRef = React.useRef(0);
  let { by: rowsBy } = scroll.rows;
  let { by: columnsBy } = scroll.columns;
  let lastScrollRef = React.useRef({
    down: rowsBy,
    right: columnsBy,
  });
  React.useEffect(() => {
    if (lastScrollRef.current.down !== rowsBy || lastScrollRef.current.right !== columnsBy) showMoved();
    lastScrollRef.current = {
      down: rowsBy,
      right: columnsBy,
    };
  }, [rowsBy, columnsBy, showMoved]);
  let scrollbarAlong = (axis?: Dynamic) => {
    let scrollOfAxis = scroll[axis];
    let thumb = gridScrollbarThumb(scrollOfAxis, zoom);
    if (thumb === null) return null;
    let [width, inset] = [OVERLAY_SCROLLBAR_WIDTH_PX, OVERLAY_SCROLLBAR_INSET_PX].map(
      (input?: Dynamic) => unzoomLength(input, zoom),
    );
    return jsx(OverlayScrollbarThumb, {
      along: axis === 'rows' ? 'y' : 'x',
      isShown: areShown || (axis === 'columns' && isMoreToTheRight),
      isForFingersToo: false,
      style:
        axis === 'rows'
          ? {
              width: width,
              right: inset,
              top: body.top + thumb.start,
              height: thumb.length,
            }
          : {
              height: width,
              bottom: inset,
              left: body.left + thumb.start,
              width: thumb.length,
            },
      onHeld: (input?: Dynamic) => {
        byAtHoldRef.current = scrollOfAxis.by;
        hold(input);
      },
      onDragged: (dragged?: Dynamic) => {
        let delta =
          scrollForThumbDrag(unzoomLength(dragged, zoom), byAtHoldRef.current, scrollOfAxis.most, thumb) - store.getView().grid.scroll[axis].by;
        store.dispatch({
          kind: 'wheelTurned',
          deltaX: axis === 'columns' ? delta : 0,
          deltaY: axis === 'rows' ? delta : 0,
        });
      },
    });
  };
  return jsxs('div', {
    ref: layerRef,
    'aria-hidden': true,
    className: 'pointer-events-none absolute inset-0 z-7',
    children: [scrollbarAlong('rows'), scrollbarAlong('columns')],
  });
}
export const GRID_SCROLLBAR_ROOM_PX = OVERLAY_SCROLLBAR_WIDTH_PX + 2 * OVERLAY_SCROLLBAR_INSET_PX;
export const scrollForThumbDrag = (dragged?: Dynamic, byAtHold?: Dynamic, most?: Dynamic, thumb?: Dynamic) =>
  byAtHold +
  thumbDragToScroll(
    dragged,
    {
      scrollHeight: most + thumb.way + thumb.length,
      clientHeight: thumb.way + thumb.length,
    },
    thumb.length,
  );
