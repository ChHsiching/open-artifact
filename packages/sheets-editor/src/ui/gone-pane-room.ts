import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
export function onPointerAwayWhileFocused(element?: Dynamic, callback?: Dynamic) {
  let ownerDocument = element.ownerDocument;
  let notifyIfAway = (isPointerOver?: Dynamic) => {
    if (ownerDocument.hasFocus() && !isPointerOver) callback();
  };
  let handleWindowFocus = () => notifyIfAway(element.matches(':hover'));
  let handlePointerOver = ({ target: target }: Dynamic) => notifyIfAway(element.contains(target));
  ownerDocument.defaultView?.addEventListener('focus', handleWindowFocus);
  ownerDocument.addEventListener('pointerover', handlePointerOver);
  handleWindowFocus();
  return () => {
    ownerDocument.defaultView?.removeEventListener('focus', handleWindowFocus);
    ownerDocument.removeEventListener('pointerover', handlePointerOver);
  };
}
export function onDocumentFocused(ownerDocument?: Dynamic, callback?: Dynamic) {
  let notifyIfFocused = () => {
    if (ownerDocument.hasFocus()) callback();
  };
  ownerDocument.defaultView?.addEventListener('focus', notifyIfFocused);
  notifyIfFocused();
  return () => ownerDocument.defaultView?.removeEventListener('focus', notifyIfFocused);
}
export function nextGonePaneRoom(previous?: Dynamic, current?: Dynamic) {
  let paneJustGone = previous.wasPaneDrawn && !current.isPaneDrawn;
  let isKept =
    current.isChatOverBar && !current.isPaneDrawn && (paneJustGone ? !current.hasPageKeyboard && previous.wasPersonAtPane : previous.isKept);
  let wasPersonAtPane = current.isPaneDrawn && (previous.wasPersonAtPane || previous.isKept || current.hasPageKeyboard);
  return isKept === previous.isKept && current.isPaneDrawn === previous.wasPaneDrawn && wasPersonAtPane === previous.wasPersonAtPane
    ? previous
    : {
        wasPaneDrawn: current.isPaneDrawn,
        wasPersonAtPane: wasPersonAtPane,
        isKept: isKept,
      };
}
export function useRoomKeptForGonePane({
  isPaneDrawn: isPaneDrawn,
  isChatOverBar: isChatOverBar,
  isMenuOpen: isMenuOpen,
  bar: bar,
}: Dynamic) {
  let [storedRoom, setRoom] = React.useState({
    wasPaneDrawn: isPaneDrawn,
    wasPersonAtPane: false,
    isKept: false,
  });
  let room = nextGonePaneRoom(storedRoom, {
    isPaneDrawn: isPaneDrawn,
    isChatOverBar: isChatOverBar,
    hasPageKeyboard:
      bar === null || bar.ownerDocument.hasFocus() || bar.ownerDocument.documentElement.hasAttribute(NO_ROOM_KEPT_FOR_GONE_PANE_ATTRIBUTE),
  });
  if (room !== storedRoom) setRoom(room);
  let { isKept: isKept } = room;
  let awaitsPersonAtPane = room.wasPaneDrawn && !room.wasPersonAtPane;
  React.useEffect(
    () =>
      awaitsPersonAtPane && bar !== null
        ? onDocumentFocused(
            bar.ownerDocument,
            () =>
              setRoom(
                (previous?: Dynamic) =>
                  previous.wasPaneDrawn && !previous.wasPersonAtPane
                    ? {
                        ...previous,
                        wasPersonAtPane: true,
                      }
                    : previous,
              ),
          )
        : undefined,
    [awaitsPersonAtPane, bar],
  );
  React.useEffect(
    () =>
      isKept && !isMenuOpen && bar !== null
        ? onPointerAwayWhileFocused(
            bar,
            () =>
              setRoom(
                (previous?: Dynamic) => ({
                  ...previous,
                  isKept: false,
                }),
              ),
          )
        : undefined,
    [isKept, isMenuOpen, bar],
  );
  return isKept;
}
export const NO_ROOM_KEPT_FOR_GONE_PANE_ATTRIBUTE = 'data-no-room-kept-for-gone-pane';
