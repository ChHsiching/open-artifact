import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { IS_APPLE_PLATFORM } from '../ui/dom-events.ts';
import { placementIdOfElement } from '../charts/placed-views-layer.ts';
import { isInAtEndOfSheet } from '../grid/add-at-end.ts';
import { SELECTION_SUMMARY_ID } from '../grid/cell-drawing.ts';
export function listenForCommentShortcut(
  view: Dynamic,
  { isOffered: isOffered, comment: comment }: Dynamic,
  isMac: Dynamic = IS_APPLE_PLATFORM,
) {
  let onKeyDown = (event?: Dynamic) => {
    if (!isCommentShortcut(event, isMac) || !isOffered(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) comment();
  };
  view.addEventListener('keydown', onKeyDown, true);
  return () => view.removeEventListener('keydown', onKeyDown, true);
}
export function leaveCommentModeOnPress(view: Dynamic, { mayLeave: mayLeave, leave: leave, readMark: readMark, later: later }: Dynamic) {
  let isLeavingPress = (target?: Dynamic) => mayLeave() && closestOf(target, LEAVES_COMMENT_MODE_SELECTOR) !== null;
  let leaveAndReadLater = () => {
    leave(true);
    later(readMark, 800);
  };
  let releaseTypes = ['pointerup', 'pointercancel'];
  let onRelease = ({ type: type }: Dynamic) => {
    for (let releaseType of releaseTypes as Dynamic) view.removeEventListener(releaseType, onRelease, true);
    later(type === 'pointercancel' ? readMark : leaveAndReadLater, 0);
  };
  let onPointerDown = ({ target: target }: Dynamic) => {
    if (!isLeavingPress(target)) return;
    leave(false);
    for (let releaseType of releaseTypes as Dynamic) view.addEventListener(releaseType, onRelease, true);
  };
  let onLeavingAct = (event?: Dynamic) => {
    if (
      !(event.type === 'click'
        ? 'detail' in event && event.detail === 0
        : event.type === 'keydown'
          ? 'key' in event && event.key === 'Escape'
          : closestOf(event.target, FORMULA_FIELD_SELECTOR) !== null) ||
      !isLeavingPress(event.target)
    )
      return;
    leave(false);
    leaveAndReadLater();
  };
  view.addEventListener('pointerdown', onPointerDown, true);
  view.addEventListener('click', onLeavingAct, true);
  view.addEventListener('beforeinput', onLeavingAct, true);
  view.addEventListener('keydown', onLeavingAct, true);
  return () => {
    view.removeEventListener('pointerdown', onPointerDown, true);
    view.removeEventListener('click', onLeavingAct, true);
    view.removeEventListener('beforeinput', onLeavingAct, true);
    view.removeEventListener('keydown', onLeavingAct, true);
    for (let releaseType of releaseTypes as Dynamic) view.removeEventListener(releaseType, onRelease, true);
  };
}
export function useCommentMode(editor?: Dynamic, frameRef?: Dynamic, isLeavingAllowed?: Dynamic) {
  React.useEffect(() => {
    let documentElement = frameRef.current?.ownerDocument.documentElement;
    let view = documentElement?.ownerDocument.defaultView ?? null;
    if (documentElement === undefined || view === null) return;
    let isCommentModeOn = () => documentElement.hasAttribute(COMMENT_MODE_ATTRIBUTE);
    let readMark = () =>
      editor.dispatch({
        kind: 'commentModeChanged',
        isOn: isCommentModeOn(),
      });
    readMark();
    let markTimer: Dynamic;
    let observer = new (view.MutationObserver as Dynamic)(() => {
      clearTimeout(markTimer);
      markTimer = setTimeout(readMark, 0);
    });
    observer.observe(documentElement, {
      attributes: true,
      attributeFilter: [COMMENT_MODE_ATTRIBUTE],
    });
    let swallowPress = (event?: Dynamic) => {
      let { target: target } = event;
      if (event.type === 'click' && 'detail' in event && event.detail === 0) return;
      if (!(target instanceof view.Element) || target.closest(COMMENT_PASS_SELECTOR) !== null) return;
      if (
        !(placementIdOfElement(target) !== null || isInAtEndOfSheet(target) || target.id === SELECTION_SUMMARY_ID) ||
        !editor.getView().isPressOrEnterAComment
      )
        return;
      event.preventDefault();
      event.stopPropagation();
    };
    let timers = new (Set as Dynamic)();
    let stopLeaving = leaveCommentModeOnPress(view, {
      mayLeave: () =>
        editor.getView().doesCommentModePickCells &&
        editor.getView().viewOnlyBecause === null &&
        editor.getView().mode.kind === 'navigating' &&
        isLeavingAllowed(),
      leave: (isReleased?: Dynamic) =>
        editor.dispatch({
          kind: 'commentModeLeftByPress',
          isReleased: isReleased,
        }),
      readMark: readMark,
      later: (callback?: Dynamic, delay?: Dynamic) => void timers.add(setTimeout(callback, delay)),
    });
    let pressTypes = ['pointerdown', 'mousedown', 'click', 'contextmenu'];
    for (let pressType of pressTypes as Dynamic) documentElement.addEventListener(pressType, swallowPress, true);
    let stopShortcut = listenForCommentShortcut(view, {
      isOffered: (target?: Dynamic) =>
        editor.getView().isCommentOffered &&
        target instanceof view.Node &&
        frameRef.current?.contains(target) === true &&
        placementIdOfElement(target) === null,
      comment: () =>
        editor.dispatch({
          kind: 'commentChosen',
        }),
    });
    return () => {
      observer.disconnect();
      clearTimeout(markTimer);
      for (let item of timers as Dynamic) clearTimeout(item);
      stopLeaving();
      for (let item of pressTypes as Dynamic) documentElement.removeEventListener(item, swallowPress, true);
      stopShortcut();
    };
  }, [editor, frameRef, isLeavingAllowed]);
}
export const COMMENT_MODE_ATTRIBUTE = 'data-comment-mode';
export const COMMENT_PASS_SELECTOR = '[data-comment-pass]';
export const FORMULA_FIELD_SELECTOR = '.sheet-formula-field';
export const LEAVES_COMMENT_MODE_SELECTOR = `[role=toolbar], ${FORMULA_FIELD_SELECTOR}`;
export const isCommentShortcut = (event?: Dynamic, isMac?: Dynamic) =>
  event.altKey &&
  !event.shiftKey &&
  (isMac ? event.metaKey && !event.ctrlKey && event.code === 'KeyM' : event.ctrlKey && !event.metaKey && (event.key === 'm' || event.key === 'M'));
export const canClosest = (target?: Dynamic) => target !== null && 'closest' in target;
export const closestOf = (target?: Dynamic, selector?: Dynamic) => (canClosest(target) ? target.closest(selector) : null);
