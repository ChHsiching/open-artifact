import { Toolbar } from '../kit/toolbar.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { restoreOfVersion } from './version-history-pane.ts';
import { versionHistoryMessages, versionTimeText } from './version-text.ts';
import { useStartOfToday } from './cell-history-popover.ts';
import { LAST_DONE_SETTLE_MS } from '../ui/last-done-announcer.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
import { swallowRestOfPress } from '../ui/press-swallow.ts';
export function earlierVersionBarActions({ history: versionHistory, look: look, onAct: onAct }: Dynamic) {
  let lookedVersion =
    versionHistory.versions?.find(({ firstRevision: firstRevision }: Dynamic) => firstRevision === look.firstRevision) ?? null;
  let restore =
    lookedVersion === null
      ? null
      : restoreOfVersion({
          version: lookedVersion,
          isTakingBack: versionHistory.isTakingBack,
          onAct: onAct,
        });
  return {
    restore:
      lookedVersion === null || restore === null
        ? null
        : {
            ...restore,
            go: () =>
              onAct({
                kind: 'restore',
                revision: lookedVersion.revision,
                isFromBar: true,
              }),
          },
    goBack: () =>
      onAct({
        kind: 'endLook',
        isFromBar: true,
      }),
  };
}
export function earlierVersionAnnouncement(look?: Dynamic, nowMs2?: Dynamic, isEarlierVersionLeft?: Dynamic) {
  if (look === null) return isEarlierVersionLeft ? versionHistoryMessages.currentVersionSaid() : null;
  return look.isOpening ? versionHistoryMessages.openingVersion() : versionHistoryMessages.earlierVersionSaid(versionTimeText(look.atMs, nowMs2));
}
export function EarlierVersionAnnouncer({ look: look, isEarlierVersionLeft: isEarlierVersionLeft }: Dynamic) {
  let nowMs2 = useStartOfToday();
  let [isLeftStill, setIsLeftStill] = React.useState(isEarlierVersionLeft);
  if (look !== null && isLeftStill) setIsLeftStill(false);
  let announcement = earlierVersionAnnouncement(look, nowMs2, isLeftStill);
  let [said, setSaid] = React.useState(null);
  React.useEffect(() => {
    let timer = setTimeout(() => setSaid(announcement), LAST_DONE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [announcement]);
  return jsx(LiveAnnouncer, {
    words: said,
  });
}
export const EARLIER_VERSION_BAR_RESTORE_WIDTH = 340;
export const pressAndFocus =
  (action?: Dynamic) =>
  (event?: Dynamic) => {
    swallowRestOfPress(event);
    event.currentTarget.focus({
      preventScroll: true,
    });
    action();
  };
export const EarlierVersionBar = React.memo(function (props?: Dynamic) {
  let { look: look, barRef: barRef, onRoomForRestore: onRoomForRestore } = props;
  let onGoneWithKeyboardEvent = React.useEffectEvent(props.onGoneWithKeyboard);
  let nowMs2 = useStartOfToday();
  let [barWidthRem, setBarWidthRem] = React.useState(1 / 0);
  React.useLayoutEffect(() => {
    let [bar, defaultView] = [barRef.current, barRef.current?.ownerDocument.defaultView];
    if (bar === null || defaultView === null || defaultView === undefined) return;
    let ownerDocument = bar.ownerDocument;
    let measure = () => {
      let rootFontSize = Number.parseFloat(defaultView.getComputedStyle(ownerDocument.documentElement).fontSize);
      let widthRem = (bar.getBoundingClientRect().width * 16) / rootFontSize;
      setBarWidthRem(widthRem);
      onRoomForRestore(widthRem >= EARLIER_VERSION_BAR_RESTORE_WIDTH);
    };
    measure();
    let resizeObserver = new (defaultView.ResizeObserver as Dynamic)(measure);
    resizeObserver.observe(bar);
    return () => {
      resizeObserver.disconnect();
      onRoomForRestore(false);
      if (bar.contains(ownerDocument.activeElement)) onGoneWithKeyboardEvent();
    };
  }, [barRef, onRoomForRestore]);
  let { restore: restore, goBack: goBack } = earlierVersionBarActions(props);
  let isWide = barWidthRem >= 556;
  let isMedium = barWidthRem >= 464;
  let atText = look.isOpening ? null : versionTimeText(look.atMs, nowMs2);
  let barTitle = look.isOpening ? versionHistoryMessages.openingVersion() : versionHistoryMessages.viewOnly();
  return jsx(Toolbar, {
    ref: barRef,
    flush: true,
    className: 'w-140 max-w-full py-0',
    label: versionHistoryMessages.title(),
    divider: false,
    onKeyDownCapture: (event?: Dynamic) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) goBack();
    },
    onKeyDown: props.onKeyDown,
    actions: jsxs(Fragment, {
      children: [
        isWide
          ? jsx(Button, {
              variant: 'ghost',
              onClick: pressAndFocus(goBack),
              children: versionHistoryMessages.backToEditing(),
            })
          : jsx(Button, {
              variant: 'ghost',
              iconOnly: true,
              icon: 'X',
              'aria-label': versionHistoryMessages.backToEditing(),
              onClick: pressAndFocus(goBack),
            }),
        restore !== null &&
          barWidthRem >= EARLIER_VERSION_BAR_RESTORE_WIDTH &&
          jsx(Button, {
            variant: 'secondary',
            busy: restore.isBusy,
            disabled: restore.isOff,
            onClick: pressAndFocus(restore.go),
            children: versionHistoryMessages.restore(),
          }),
      ],
    }),
    children: jsxs('div', {
      'aria-hidden': true,
      className: 'flex h-control min-w-0 flex-1 items-center gap-2 overflow-hidden ps-2 pe-1 whitespace-nowrap',
      children: [
        isMedium &&
          atText !== null &&
          jsx('span', {
            className: 'text-body text-primary tabular-nums',
            children: atText,
          }),
        jsx('span', {
          className: 'text-caption text-secondary',
          children: barTitle,
        }),
      ],
    }),
  });
});
