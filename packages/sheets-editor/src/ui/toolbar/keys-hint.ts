import { likelyHasKeyboard, subscribeSheetMedia } from '../../kit/platform.ts';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { isWithinToolbarOrContextBar } from '../toolbar-tooltip.ts';
import { jsx } from 'react/jsx-runtime';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
export function toolbarTabStopOf(toolbar?: Dynamic) {
  let tabStop = toolbar?.querySelector(TOOLBAR_TAB_STOP_SELECTOR) ?? null;
  if (tabStop !== null && isElementRendered(tabStop)) return tabStop;
  return [...(toolbar?.querySelectorAll('button:enabled') ?? [])].find(isElementRendered) ?? null;
}
export function describeToolbarTabStop(toolbar?: Dynamic, hintId?: Dynamic) {
  let ownerDocument = toolbar.ownerDocument;
  let view = ownerDocument.defaultView;
  if (view === null) return () => {};
  let removeHintFromOthers = (keptOn?: Dynamic) => {
    for (let element of toolbar.querySelectorAll(`[aria-describedby~="${hintId}"]`) as Dynamic) {
      if (element === keptOn) continue;
      let idsLeft = describedByIdsOf(element).filter((id?: Dynamic) => id !== hintId);
      if (idsLeft.length === 0) element.removeAttribute('aria-describedby');
      else element.setAttribute('aria-describedby', idsLeft.join(' '));
    }
  };
  let putHintOnTabStop = () => {
    let tabStop = toolbar.querySelector(TOOLBAR_TAB_STOP_SELECTOR);
    removeHintFromOthers(tabStop);
    if (tabStop !== null && !describedByIdsOf(tabStop).includes(hintId))
      tabStop.setAttribute('aria-describedby', [...describedByIdsOf(tabStop), hintId].join(' '));
  };
  let isCaretOutside: Dynamic = true;
  let noteCaret = (focused?: Dynamic) => {
    isCaretOutside = !isWithinToolbarOrContextBar(toolbar, focused);
    if (isCaretOutside) putHintOnTabStop();
    else removeHintFromOthers(focused);
  };
  let onFocusIn = () => noteCaret(ownerDocument.activeElement);
  let onWindowBlur = () => noteCaret(null);
  let observer = new (view.MutationObserver as Dynamic)(() => {
    if (isCaretOutside) putHintOnTabStop();
  });
  noteCaret(ownerDocument.activeElement);
  observer.observe(toolbar, {
    subtree: true,
    attributeFilter: ['tabindex'],
  });
  ownerDocument.addEventListener('focusin', onFocusIn);
  view.addEventListener('blur', onWindowBlur);
  return () => {
    observer.disconnect();
    ownerDocument.removeEventListener('focusin', onFocusIn);
    view.removeEventListener('blur', onWindowBlur);
    removeHintFromOthers(null);
  };
}
export function useToolbarArrowKeysHint() {
  let hintId = React.useId();
  let toolbarRef = React.useCallback((toolbar?: Dynamic) => describeToolbarTabStop(toolbar, hintId), [hintId]);
  if (!React.useSyncExternalStore(subscribeSheetMedia, likelyHasKeyboard, () => false))
    return {
      sentence: null,
      ofToolbar: {},
    };
  return {
    sentence: jsx('span', {
      id: hintId,
      hidden: true,
      children: sheetMessages.arrowKeysMoveBetweenTools(),
    }),
    ofToolbar: {
      ref: toolbarRef,
    },
  };
}
export const TOOLBAR_TAB_STOP_SELECTOR = '[tabindex="0"]:not(:disabled, [data-base-ui-focus-guard])';
export const isElementRendered = (element?: Dynamic) => element.getClientRects().length > 0;
export const describedByIdsOf = (element?: Dynamic) =>
  (element.getAttribute('aria-describedby') ?? '').split(' ').filter((id?: Dynamic) => id !== '');
