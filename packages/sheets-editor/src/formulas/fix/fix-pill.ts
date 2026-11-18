import { Popover } from '../../kit/popover.tsx';
import { Button } from '../../kit/button.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { jsxs, jsx } from 'react/jsx-runtime';
import { useLastNonNull, withListTabStops, isWithinPressGuard } from '../../ui/list-under-cell.ts';
import { useActHoldAtAnswer, isBeforeAnswerSeen } from '../../agent/answer-holds.ts';
import { swallowRestOfPress } from '../../ui/press-swallow.ts';
import { cancelEscapeDismissal } from './errors-notice.ts';
import { popupPropsUnderHeader } from '../../shell/bottom-insets.ts';
import { preventMouseDownDefault } from '../../ui/dom-events.ts';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
export function formulaBreakParts(formula?: Dynamic) {
  let startsAt: Dynamic = 0;
  return formula.split(/(?<=[,;+\-*/&^<>=])(?![<>=])/).map((partText?: Dynamic) => {
    let part = {
      startsAt: startsAt,
      text: partText,
    };
    startsAt += partText.length;
    return part;
  });
}
export function fixWaitingUnderPointer({ target: target, clientX: clientX }: Dynamic) {
  let fixWaiting = target instanceof Element ? target.closest('[data-fix-waits]') : null;
  let isBesideText = target instanceof Element && target.closest('.sheet-lines-beside-text') !== null;
  return fixWaiting === null || !isBesideText || clientX < fixWaiting.getBoundingClientRect().right ? fixWaiting : null;
}
export function createFixPointer(store?: Dynamic) {
  let cellPointedAt: Dynamic = null;
  let pending: Dynamic = null;
  let timer: Dynamic = null;
  let stopWaiting = () => {
    if (timer !== null) clearTimeout(timer);
    [timer, pending] = [null, null];
  };
  let pointAt = (cell?: Dynamic, at?: Dynamic) => {
    stopWaiting();
    cellPointedAt = cell;
    store.dispatch({
      kind: 'fixPointedAt',
      at: at,
    });
  };
  let pointAtLater = (cell?: Dynamic, at?: Dynamic) => {
    pending = {
      cell: cell,
      at: at,
    };
    timer ??= setTimeout(() => {
      if (pending !== null) pointAt(pending.cell, pending.at);
    }, FIX_POINTED_AT_DELAY_MS);
  };
  return {
    isOver(cell?: Dynamic, at?: Dynamic) {
      if (cell === cellPointedAt) stopWaiting();
      else if (cellPointedAt === null || cellPointedAt === undefined) pointAt(cell, at);
      else pointAtLater(cell, at);
    },
    isOnPill(isOnPill?: Dynamic) {
      if (isOnPill) stopWaiting();
      else if (cellPointedAt !== null) pointAtLater(null, null);
    },
    stop: stopWaiting,
    forget() {
      if (pending === null) cellPointedAt = undefined;
      else pointAt(pending.cell, pending.at);
    },
  };
}
export function useFixPointer(store?: Dynamic, pill?: Dynamic) {
  let fixPointer = React.useMemo(() => createFixPointer(store), [store]);
  React.useEffect(() => {
    if (pill === null) fixPointer.forget();
  }, [fixPointer, pill]);
  React.useEffect(() => fixPointer.stop, [fixPointer]);
  return fixPointer;
}
export function useWhenKeyCame(key?: Dynamic) {
  let keyCameRef = React.useRef({
    key: null,
    atMs: 0,
  });
  React.useLayoutEffect(() => {
    keyCameRef.current = nextKeyCame(keyCameRef.current, key, performance.now());
  });
  return keyCameRef;
}
export function FixPillShownView({ shown: shown }: Dynamic) {
  let isQuoted = shown.length > 1 && shown.startsWith(QUOTE_CHARACTER) && shown.endsWith(QUOTE_CHARACTER);
  return jsxs('span', {
    className: 'text-body me-auto flex max-w-48 min-w-0 pe-1 tabular-nums',
    children: [
      isQuoted &&
        jsx('span', {
          className: 'flex-none',
          children: QUOTE_CHARACTER,
        }),
      jsx('bdi', {
        className: isQuoted ? 'overflow-hidden text-ellipsis whitespace-pre' : 'truncate',
        children: isQuoted ? shown.slice(1, -1) : shown,
      }),
      isQuoted &&
        jsx('span', {
          className: 'flex-none',
          children: QUOTE_CHARACTER,
        }),
    ],
  });
}
export function FixPillView({
  cellKey: cellKey,
  shown: shown,
  formulaIfCut: formulaIfCut,
  cellHeight: cellHeight,
  came: came,
  anchor: anchor,
  side: side,
  hold: hold,
  onActHeld: onActHeld,
  onActedOn: onActedOn,
  onPointed: onPointed,
}: Dynamic) {
  let pillContent = React.useMemo(
    () =>
      shown === null
        ? null
        : {
            shown: shown,
            formulaIfCut: formulaIfCut,
            cellHeight: cellHeight,
          },
    [shown, formulaIfCut, cellHeight],
  );
  let contentShown = useLastNonNull(pillContent);
  let sideShown = useLastNonNull(side);
  let isFormulaShown = contentShown !== null && contentShown.formulaIfCut !== null;
  let keySeenAtPressRef = React.useRef(null);
  let heldAct = useActHoldAtAnswer({
    hold: hold,
    tellOfActHeld: onActHeld,
    isNoAct: () => false,
  });
  let actOn =
    (outcome?: Dynamic) =>
    (clickEvent?: Dynamic) => {
      if (!heldAct.isActRefused()) swallowRestOfPress(clickEvent, isInOpenFixPill);
      onActedOn(outcome, heldAct.howActBegan());
    };
  return withListTabStops(
    jsx(Popover.Root, {
      open: cellKey !== null,
      onOpenChange: cancelEscapeDismissal,
      children: jsxs(Popover.Popup, {
        ...popupPropsUnderHeader(),
        anchor: anchor,
        side: sideShown ?? 'right',
        align: isFormulaShown ? 'end' : 'center',
        alignOffset: isFormulaShown ? (contentShown.cellHeight - FIX_PILL_ROW_HEIGHT) / 2 : 0,
        sideOffset: FIX_PILL_SIDE_OFFSET,
        padding: 'none',
        initialFocus: false,
        finalFocus: false,
        keepFocus: true,
        'aria-hidden': true,
        'data-pill-of-fix': true,
        className:
          'flex flex-col before:absolute before:inset-y-0 before:-left-1 before:w-1 data-[side=left]:before:-right-1 data-[side=left]:before:left-auto',
        onMouseDown: preventMouseDownDefault,
        onPointerEnter: () => onPointed(true),
        onPointerLeave: () => onPointed(false),
        onPointerDownCapture: (pointerEvent?: Dynamic) => {
          heldAct.handlers.onPointerDownCapture(pointerEvent);
          keySeenAtPressRef.current = keySeenLongEnough(came.current, performance.now());
        },
        onPointerUpCapture: heldAct.handlers.onPointerUpCapture,
        onPointerCancelCapture: heldAct.handlers.onPointerCancelCapture,
        onClickCapture: (clickEvent?: Dynamic) => {
          heldAct.handlers.onClickCapture();
          if (!isSameNonNullKey(keySeenAtPressRef.current, cellKey)) clickEvent.stopPropagation();
          keySeenAtPressRef.current = null;
        },
        children: [
          contentShown !== null &&
            contentShown.formulaIfCut !== null &&
            jsx('div', {
              tabIndex: -1,
              className: 'text-body min-h-0 overflow-y-auto px-2 pt-2 font-mono wrap-anywhere',
              children: formulaBreakParts(contentShown.formulaIfCut).map(
                ({ startsAt: startsAt, text: partText }: Dynamic) =>
                  jsxs(
                    React.Fragment,
                    {
                      children: [partText, jsx('wbr', {})],
                    },
                    startsAt,
                  ),
              ),
            }),
          jsxs('div', {
            className: 'flex h-7 flex-none items-center justify-end gap-0.5 ps-2 pe-0.5 whitespace-nowrap',
            children: [
              jsx(FixPillShown, {
                shown: contentShown?.shown ?? '',
              }),
              jsx(Button, {
                variant: 'ghost',
                size: 'xs',
                iconOnly: true,
                icon: 'Check',
                tabIndex: -1,
                'aria-label': sheetMessages.keepThisFix(),
                onClick: actOn('kept'),
              }),
              jsx(Button, {
                variant: 'ghost',
                size: 'xs',
                iconOnly: true,
                icon: 'X',
                tabIndex: -1,
                'aria-label': sheetMessages.discardThisFix(),
                onClick: actOn('discarded'),
              }),
            ],
          }),
        ],
      }),
    }),
  );
}
export const FIX_PILL_SIDE_OFFSET = 4;
export const FIX_PILL_ROW_HEIGHT = 28;
export const FIX_POINTED_AT_DELAY_MS = 150;
export const pointClampedToRight = (element: Dynamic, { clientX: clientX, clientY: clientY }: Dynamic) => ({
  clientX: Math.min(clientX, element.getBoundingClientRect().right - 1),
  clientY: clientY,
});
export const nextKeyCame = (came?: Dynamic, key?: Dynamic, nowMs2?: Dynamic) => ({
  key: key,
  atMs: came.key === key ? came.atMs : nowMs2,
});
export const keySeenLongEnough = (came?: Dynamic, nowMs2?: Dynamic) => (isWithinPressGuard(came.atMs, nowMs2) ? null : came.key);
export const isInOpenFixPill = (target?: Dynamic) =>
  target instanceof Element && target.closest('[data-pill-of-fix][data-open]') !== null;
export const isSameNonNullKey = (keySeen?: Dynamic, cellKey?: Dynamic) => keySeen !== null && keySeen === cellKey;
export const fixFieldsOfKeyPress = (key?: Dynamic, pillState?: Dynamic, nowMs2?: Dynamic, isReadLate?: Dynamic) => ({
  ...((key === 'Enter' || key === 'Escape') && {
    pillOfFixSeen: keySeenLongEnough(pillState.cameForKeys, nowMs2),
    ...(isBeforeAnswerSeen(pillState.hold, nowMs2) && {
      hasBegunBeforeAnswerWasSeen: true,
    }),
  }),
  ...(isReadLate && {
    isReadLate: true,
  }),
});
export const QUOTE_CHARACTER = '"';
export const FixPillShown = React.memo(FixPillShownView);
export const FixPill = React.memo(FixPillView);
