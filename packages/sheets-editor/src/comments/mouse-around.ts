import type { Dynamic } from '../dynamic.ts';
export function createHoverOpenTimer(options?: Dynamic) {
  let { open: open, shut: shut, restMs: restMs, leaveMs: leaveMs, after: after } = options;
  let openTimer: Dynamic = null;
  let shutTimer: Dynamic = null;
  let isMenuOpen: Dynamic = false;
  let hasLeft: Dynamic = false;
  let restPoint: Dynamic = {
    x: 0,
    y: 0,
  };
  let cancelOpen = () => {
    openTimer?.cancel();
    openTimer = null;
  };
  let cancelShut = () => {
    shutTimer?.cancel();
    shutTimer = null;
  };
  let shutAfterLeave = () => {
    if (shutTimer !== null || isMenuOpen) return;
    shutTimer = after(leaveMs, () => {
      shutTimer = null;
      shut();
    });
  };
  return {
    restedOn(x?: Dynamic, y?: Dynamic) {
      if (openTimer !== null && Math.hypot(x - restPoint.x, y - restPoint.y) <= 3) return;
      cancelOpen();
      restPoint = {
        x: x,
        y: y,
      };
      hasLeft = false;
      openTimer = after(restMs, () => {
        openTimer = null;
        open();
      });
    },
    movedOff: cancelOpen,
    entered() {
      hasLeft = false;
      cancelShut();
    },
    left() {
      hasLeft = true;
      shutAfterLeave();
    },
    menuIsOpen(isOpen?: Dynamic) {
      isMenuOpen = isOpen;
      if (isOpen) cancelShut();
      else if (hasLeft) shutAfterLeave();
    },
    stop() {
      cancelOpen();
      cancelShut();
    },
  };
}
export function createMouseAroundComments(options?: Dynamic) {
  let {
    shown: shown,
    isCardShown: isCardShown,
    isMouseOnShown: isMouseOnShown,
    show: show,
    showCard: showCard,
    hide: hide,
    after: after,
  } = options;
  let isMouseOnPreview: Dynamic = false;
  let hasLeftGrid: Dynamic = false;
  let markUnderMouse: Dynamic = null;
  let markToIgnore: Dynamic = null;
  let ignoreNextMark: Dynamic = false;
  let press: Dynamic = null;
  let showTimer: Dynamic = null;
  let hideTimer: Dynamic = null;
  let cancelShow = () => {
    showTimer?.cancel();
    showTimer = null;
  };
  let cancelHide = () => {
    hideTimer?.cancel();
    hideTimer = null;
  };
  let hideNow = () => {
    cancelHide();
    if (shown() !== null) hide();
  };
  let showAfterDelay = (markKey?: Dynamic, point?: Dynamic, isForCard: Dynamic = false) => {
    showTimer = {
      ...after(COMMENT_PREVIEW_SHOW_DELAY_MS, () => {
        showTimer = null;
        hasLeftGrid = false;
        (isForCard ? showCard : show)(markKey);
      }),
      of: markKey,
      from: point,
      isForCard: isForCard,
    };
  };
  let isCardComing = () => isCardShown() || showTimer?.isForCard === true;
  let putAwayNow = () => {
    let wasMouseOnShown = isMouseOnPreview && isMouseOnShown();
    let shownCard = isCardShown() ? shown() : null;
    let putAway = showTimer?.isForCard === true ? showTimer.of : shownCard;
    cancelShow();
    hideNow();
    [markToIgnore, ignoreNextMark] = [markUnderMouse, wasMouseOnShown];
    return putAway;
  };
  let hideSoon = () => {
    if (shown() === null || isCardShown()) return;
    hideTimer ??= after(COMMENT_PREVIEW_HIDE_DELAY_MS, () => {
      hideTimer = null;
      if (!(isMouseOnPreview && isMouseOnShown())) hideNow();
    });
  };
  return {
    isOver(markKey?: Dynamic, point?: Dynamic) {
      isMouseOnPreview = false;
      markUnderMouse = markKey;
      press = null;
      if (ignoreNextMark) markToIgnore = markKey;
      ignoreNextMark = false;
      if (markKey !== markToIgnore) markToIgnore = null;
      if (markKey !== null && markKey === shown()) {
        cancelShow();
        cancelHide();
        return;
      }
      hideSoon();
      if (markKey === null || markKey === markToIgnore) return cancelShow();
      if (showTimer?.of === markKey && Math.hypot(point.x - showTimer.from.x, point.y - showTimer.from.y) <= MOUSE_STILL_SLOP) return;
      cancelShow();
      showAfterDelay(markKey, point);
    },
    hasLeftGrid(isOnPreview?: Dynamic) {
      hasLeftGrid = true;
      isMouseOnPreview = isOnPreview;
      [markUnderMouse, markToIgnore, ignoreNextMark, press] = [null, null, false, null];
      cancelShow();
      if (isOnPreview) cancelHide();
      hideSoon();
    },
    hostSaysItIsOnPreview(isOnPreview?: Dynamic) {
      if (!isOnPreview && isMouseOnPreview) hideSoon();
      if (!isOnPreview || hasLeftGrid) return;
      isMouseOnPreview = true;
      cancelShow();
      cancelHide();
    },
    putAway() {
      press = null;
      return putAwayNow();
    },
    putAwayAtDraw(keepCard: Dynamic = false) {
      if (press === null && !(keepCard && isCardComing())) putAwayNow();
    },
    isPressedOnCells(point?: Dynamic) {
      isMouseOnPreview = false;
      press =
        markUnderMouse === null
          ? null
          : {
              of: markUnderMouse,
              at: point,
            };
      if (press === null) putAwayNow();
    },
    isDraggedTo(point?: Dynamic) {
      if (press === null || Math.hypot(point.x - press.at.x, point.y - press.at.y) <= MOUSE_STILL_SLOP) return;
      press = null;
      putAwayNow();
    },
    isLetGo(markKey?: Dynamic) {
      let press2 = press;
      press = null;
      cancelShow();
      if (press2 === null || markKey !== press2.of) {
        if (press2 !== null) hideNow();
        [markUnderMouse, markToIgnore, ignoreNextMark] = [markKey, markKey, false];
        return;
      }
      [markUnderMouse, markToIgnore, ignoreNextMark] = [markKey, null, false];
      if (shown() === markKey) return;
      hideNow();
      showAfterDelay(markKey, press2.at);
    },
    isPressLost() {
      if (press === null) return;
      press = null;
      putAwayNow();
    },
    isTappedByFinger(markKey?: Dynamic, point?: Dynamic) {
      cancelShow();
      showAfterDelay(markKey, point, true);
    },
    isUp: () => shown() !== null,
    stop() {
      cancelShow();
      hideNow();
    },
  };
}
export function createCommentCardOnTap(options?: Dynamic) {
  let { cardAskedFor: cardAskedFor, mayCome: mayCome, hasPageKeyboard: hasPageKeyboard, open: open, shut: shut } = options;
  let cardOpenedByTap: Dynamic = null;
  let cardOfTap = () => {
    if (cardAskedFor() !== cardOpenedByTap) cardOpenedByTap = null;
    return cardOpenedByTap;
  };
  return {
    of: cardOfTap,
    show(markKey?: Dynamic) {
      if (!mayCome() || cardAskedFor() !== null) return;
      open(markKey);
      if (cardAskedFor() === markKey) cardOpenedByTap = markKey;
    },
    hide() {
      if (cardOfTap() === null) return false;
      if (!hasPageKeyboard()) return true;
      cardOpenedByTap = null;
      shut();
      return true;
    },
    forget() {
      cardOpenedByTap = null;
    },
  };
}
export const MOUSE_STILL_SLOP = 3;
export const COMMENT_PREVIEW_SHOW_DELAY_MS = 300;
export const COMMENT_PREVIEW_HIDE_DELAY_MS = 300;
export const noMouseAroundComments = {
  isOver() {},
  hasLeftGrid() {},
  hostSaysItIsOnPreview() {},
  putAway: () => null,
  putAwayAtDraw() {},
  isPressedOnCells() {},
  isDraggedTo() {},
  isLetGo() {},
  isPressLost() {},
  isTappedByFinger() {},
  isUp: () => false,
  stop() {},
};
