import { Menu } from '../kit/menu.tsx';
import { Skeleton } from '../kit/skeleton.tsx';
import { Surface } from '../kit/surface.tsx';
import { TextLink } from '../kit/text-link.tsx';
import { Button } from '../kit/button.tsx';
import { Spinner } from '../kit/spinner.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactDOM from 'react-dom';
import { jsxs, jsx } from 'react/jsx-runtime';
import { gridHeaderRoomStyle } from '../grid/group-margin.ts';
import { MenuTriggerButton, ZoomPercent } from '../ui/menu-trigger.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { zoomPercent } from '../grid/zoom.ts';
import { versionHistoryMessages } from '../history/version-text.ts';
import { PlaceholderPattern } from './pattern.ts';
import { preventMouseDownDefault } from '../ui/dom-events.ts';
import { renderInPlaceholderRoot } from '../shell/ui-root.ts';
import { readStoredDensity } from '../app/density-preference.ts';
import { afterNextFrameOrTimeout } from '../utils/next-frame.ts';
import { COLUMN_HEADER_HEIGHT } from '../grid/cell-metrics.ts';
import { ROW_HEADER_WIDTH, defaultRowHeightAtDensity } from '../grid/cell-metrics-values.ts';
import { translateMessage } from '../i18n/messages.ts';
export function SheetPlaceholder({
  density: density,
  zoom: zoom,
  notice: notice,
  partLoaded = null,
  doesButtonTakeFocus = false,
  atEndOfSheetBar: atEndOfSheetBar,
}: Dynamic) {
  let isWaiting = notice === null;
  return jsxs('div', {
    className: 'relative flex h-full flex-col',
    style: {
      ...placeholderSizeStyle(density, zoom),
      ...gridHeaderRoomStyle(0, zoom, density),
    },
    children: [
      jsx('div', {
        className: 'sheet-formula-row justify-end',
        'aria-hidden': true,
        inert: true,
        children:
          isWaiting &&
          jsxs('div', {
            className: 'sheet-view-tools',
            children: [
              jsx(Menu.Root, {
                children: jsx(MenuTriggerButton, {
                  variant: 'ghost',
                  'aria-label': sheetMessages.zoomButton(zoomPercent(zoom)),
                  chevron: 'toolbar',
                  disabled: true,
                  children: jsx(ZoomPercent, {
                    zoom: zoom,
                  }),
                }),
              }),
              jsx(Button, {
                variant: 'ghost',
                iconOnly: true,
                icon: 'History',
                'aria-label': versionHistoryMessages.title(),
                disabled: true,
              }),
            ],
          }),
      }),
      jsxs('div', {
        className: `min-h-0 flex-1 ${isWaiting ? 'sheet-grid sheet-placeholder-grid' : 'sheet-placeholder-blank relative mt-px'}`,
        children: [
          isWaiting &&
            jsxs('div', {
              className: 'sheet-placeholder-cells',
              children: [
                jsx(Skeleton, {
                  decorative: true,
                  className: 'size-full rounded-none',
                }),
                jsx('div', {
                  className: 'sheet-placeholder-part',
                  style: {
                    transform: `scaleX(${partLoaded ?? 0})`,
                  },
                  'aria-hidden': true,
                }),
                jsx(PlaceholderPattern, {}),
              ],
            }),
          notice !== null &&
            jsx('div', {
              className: 'absolute inset-x-0 z-1 flex h-0 justify-center items-start',
              style: placeholderNoticeStyle(density),
              children: jsxs(Surface, {
                elevation: 'popover',
                className: 'sheet-placeholder-notice',
                children: [
                  jsx('span', {
                    'aria-hidden': true,
                    children: notice.inWords,
                  }),
                  notice.wayOut !== null &&
                    jsx(
                      TextLink,
                      {
                        'data-way-out': notice.wayOut.kind,
                        ref: doesButtonTakeFocus ? focusWayOutRef : undefined,
                        onClick: notice.wayOut.take,
                        'aria-label': notice.wayOut.kind === 'restoreSheet' ? restoreSheetLabel() : undefined,
                        children: notice.wayOut.kind === 'restoreSheet' ? restoreLabel() : retryLabel(),
                      },
                      notice.wayOut.kind,
                    ),
                ],
              }),
            }),
        ],
      }),
      isWaiting &&
        jsx('div', {
          className: 'sheet-placeholder-marks absolute inset-x-0 top-1/2 z-1 flex h-0 items-center justify-center',
          'aria-hidden': true,
          children: jsx('span', {
            className: 'sheet-placeholder-ring',
            children: jsx(Spinner, {
              size: 'lg',
            }),
          }),
        }),
      jsxs('div', {
        className: `sheet-bar ${isWaiting ? '' : 'sheet-bar-under-notice'}`,
        children: [
          isWaiting &&
            jsxs('div', {
              className: 'contents',
              'aria-hidden': true,
              inert: true,
              children: [
                jsx(Button, {
                  variant: 'ghost',
                  iconOnly: true,
                  icon: 'Add',
                  className: 'sheet-add-sheet',
                  'aria-label': sheetMessages.addSheet(),
                  disabled: true,
                }),
                jsx(Menu.Root, {
                  children: jsx(MenuTriggerButton, {
                    variant: 'ghost',
                    icon: 'ListBullet',
                    'aria-label': sheetMessages.allSheets(),
                    chevron: 'toolbar',
                    disabled: true,
                    children: null,
                  }),
                }),
                jsx('div', {
                  className: 'sheet-scroller -mx-1',
                  children: jsx(Skeleton, {
                    decorative: true,
                    width: '4.5rem',
                    className: 'h-control',
                  }),
                }),
              ],
            }),
          jsx('div', {
            role: 'presentation',
            className: 'ms-auto flex flex-none',
            onMouseDown: preventMouseDownDefault,
            children: atEndOfSheetBar,
          }),
        ],
      }),
    ],
  });
}
export function createSheetPlaceholder(mount?: Dynamic, onError?: Dynamic, atEndOfSheetBar?: Dynamic, getZoom?: Dynamic) {
  let ownerDocument = mount.ownerDocument;
  let root: Dynamic = null;
  let isFirstShow: Dynamic = true;
  let hasFailed: Dynamic = false;
  let pendingTakeOff: Dynamic = null;
  let wayOutFocused: Dynamic = null;
  let onceOffCallbacks = new (Set as Dynamic)();
  let pendingUnmount: Dynamic = null;
  let setLeaving = (isLeaving?: Dynamic) => {
    mount.inert = isLeaving;
    mount.toggleAttribute('data-is-leaving', isLeaving);
  };
  let setOverCells = (isOver?: Dynamic) => void mount.toggleAttribute('data-is-over-cells', isOver);
  return {
    show(notice?: Dynamic, partLoaded: Dynamic = null) {
      pendingTakeOff = null;
      pendingUnmount = null;
      setLeaving(false);
      setOverCells(false);
      if (hasFailed) return false;
      wayOutFocused = ownerDocument.activeElement?.getAttribute('data-way-out') ?? wayOutFocused;
      let takesFocus =
        notice !== null &&
        notice.wayOut !== null &&
        notice.wayOut.kind === wayOutFocused &&
        ownerDocument.hasFocus() &&
        ownerDocument.activeElement === ownerDocument.body;
      if (notice !== null) wayOutFocused = null;
      root ??= ReactDOMClient.createRoot(mount, {
        onUncaughtError(error?: Dynamic) {
          hasFailed = true;
          onError(error);
        },
      });
      let shownRoot = root;
      let render = () =>
        shownRoot.render(
          renderInPlaceholderRoot(
            jsx(SheetPlaceholder, {
              density: readStoredDensity(),
              zoom: getZoom(),
              notice: notice,
              partLoaded: partLoaded,
              doesButtonTakeFocus: takesFocus,
              atEndOfSheetBar: atEndOfSheetBar,
            }),
          ),
        );
      if (isFirstShow || takesFocus) ReactDOM.flushSync(render);
      else render();
      isFirstShow = false;
      return !hasFailed;
    },
    takeOffAfterNextPaint() {
      if (root === null || pendingTakeOff !== null || pendingUnmount !== null || ownerDocument.defaultView === null) return;
      let token: Dynamic = {};
      pendingTakeOff = token;
      setOverCells(true);
      afterNextFrameOrTimeout(ownerDocument.defaultView, () => {
        if (pendingTakeOff !== token) return;
        pendingTakeOff = null;
        wayOutFocused = null;
        let token2: Dynamic = {};
        pendingUnmount = token2;
        setLeaving(true);
        let callbacks = [...onceOffCallbacks];
        onceOffCallbacks.clear();
        for (let callback of callbacks as Dynamic) callback();
        let unmount = () => {
          if (pendingUnmount !== token2) return;
          pendingUnmount = null;
          root?.unmount();
          root = null;
          setLeaving(false);
          setOverCells(false);
        };
        let animationsFinished = ownerDocument.hidden
          ? []
          : mount.getAnimations().map(({ finished: finished }: Dynamic) => finished);
        Promise.allSettled(animationsFinished).then(unmount);
      });
    },
    onceOff(callback?: Dynamic) {
      if (root === null || pendingUnmount !== null) callback();
      else onceOffCallbacks.add(callback);
      return () => void onceOffCallbacks.delete(callback);
    },
  };
}
export const PLACEHOLDER_COLUMN_WIDTH = 104;
export const placeholderSizeStyle = (density?: Dynamic, zoom?: Dynamic) => ({
  '--sheet-placeholder-headers-height': `${COLUMN_HEADER_HEIGHT * zoom}px`,
  '--sheet-placeholder-headers-width': `${ROW_HEADER_WIDTH * zoom}px`,
  '--sheet-placeholder-row-height': `${defaultRowHeightAtDensity(density) * zoom}px`,
  '--sheet-placeholder-column-width': `${PLACEHOLDER_COLUMN_WIDTH * zoom}px`,
});
export const placeholderNoticeStyle = (density?: Dynamic) => ({
  top: COLUMN_HEADER_HEIGHT + Math.floor(1.5 * defaultRowHeightAtDensity(density)),
});
export const retryLabel = () =>
  translateMessage({
    defaultMessage: 'Retry',
    id: 'yJNyDdQ5L1',
  });
export const restoreLabel = () =>
  translateMessage({
    defaultMessage: 'Restore',
    id: '1Up89JNrlW',
  });
export const restoreSheetLabel = () =>
  translateMessage({
    defaultMessage: 'Restore Sheet',
    id: 'zo8CbDva1h',
  });
export const focusWayOutRef = (element?: Dynamic) =>
  element?.focus({
    preventScroll: true,
  });
