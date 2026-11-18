import { useUiWindow } from '../kit/theme.tsx';
import { Tooltip } from '../kit/tooltip.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { useCoveredUnderCells, popupCollisionPadding } from '../shell/bottom-insets.ts';
import { MODIFIER_KEYS } from '../state/escape.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { LiveAnnouncer } from './live-announcer.ts';
import { shortcutListMessages, shortcutActionLabel } from '../messages/shortcut-labels.ts';
import { shortcutKeysFor } from '../keys/shortcut-list.ts';
export function leaveCellsHintReducer(state?: Dynamic, happening?: Dynamic) {
  if (state.hint === 'over' && state.said === 'heard') return state;
  if (happening === 'pointerUsed' || happening === 'steppedOutOfCells')
    return {
      ...state,
      tabsInARow: 0,
      hint: 'over',
      said: 'heard',
    };
  if (happening === 'wordsStoodLongEnough')
    return state.said === 'now'
      ? {
          ...state,
          said: 'heard',
        }
      : state;
  if (happening === 'restedFromTab')
    return state.tabsInARow >= 2 && state.said === 'notYet'
      ? {
          ...state,
          said: 'now',
          timesSaid: state.timesSaid + 1,
        }
      : state;
  let wasSaidNow = state.said === 'now';
  let nextSaid = wasSaidNow ? (state.timesSaid >= 3 ? 'heard' : 'notYet') : state.said;
  if (happening === 'tabFromCellToCell') {
    let tabsInARow = state.tabsInARow + 1;
    let nextHint = state.hint === 'over' ? 'over' : tabsInARow >= 2 ? 'due' : 'notYet';
    return {
      ...state,
      tabsInARow: tabsInARow,
      hint: nextHint,
      said: nextSaid,
    };
  }
  let hint = happening === 'anythingElseWithHintInSight' || state.hint === 'over' ? 'over' : 'notYet';
  return state.tabsInARow === 0 && hint === state.hint && !wasSaidNow
    ? state
    : {
        ...state,
        tabsInARow: 0,
        hint: hint,
        said: nextSaid,
      };
}
export const LEAVE_CELLS_HINT_START = {
  tabsInARow: 0,
  hint: 'notYet',
  said: 'notYet',
  timesSaid: 0,
};
export const CELLS_AREA_SELECTOR = '.sheet-rows, [data-is-waiting]';
export const LEAVE_CELLS_REST_MS = 1500;
export const LEAVE_CELLS_WORDS_MS = 4000;
export const LeaveCellsHint = React.memo(function ({
  cells: cells,
  doesEscapeStepOut: doesEscapeStepOut,
  isCardUnderCell: isCardUnderCell,
  hasEscapeSteppedOut: hasEscapeSteppedOut,
}: Dynamic) {
  let canHintShow = doesEscapeStepOut && !isCardUnderCell;
  let [hintState, tellHint] = React.useReducer(leaveCellsHintReducer, LEAVE_CELLS_HINT_START);
  let barRoom = useCoveredUnderCells();
  let pageWindow = useUiWindow();
  let isHintDone = hintState.hint === 'over' && hintState.said === 'heard';
  if (hasEscapeSteppedOut && !isHintDone) tellHint('steppedOutOfCells');
  let isHintShown = hintState.hint === 'due' && canHintShow;
  React.useEffect(() => {
    if (isHintDone || pageWindow === undefined) return;
    let isInCells = (target?: Dynamic) => target instanceof pageWindow.Element && target.matches(CELLS_AREA_SELECTOR);
    let onAnythingElse = () => tellHint(isHintShown ? 'anythingElseWithHintInSight' : 'anythingElse');
    let onKeyDownCapture = (event?: Dynamic) => {
      if (event.key !== 'Tab' && !MODIFIER_KEYS.has(event.key)) onAnythingElse();
    };
    let onKeyDown = (event?: Dynamic) => {
      if (event.key !== 'Tab') return;
      if (event.defaultPrevented && isInCells(event.target)) tellHint('tabFromCellToCell');
      else onAnythingElse();
    };
    let onPointerUsed = () => tellHint('pointerUsed');
    let onFocusIn = (event?: Dynamic) => {
      if (!isInCells(event.target)) onAnythingElse();
    };
    let onBlur = () => tellHint('anythingElse');
    let controller = new (AbortController as Dynamic)();
    let { signal: signal } = controller;
    pageWindow.addEventListener('keydown', onKeyDownCapture, {
      capture: true,
      signal: signal,
    });
    pageWindow.addEventListener('keydown', onKeyDown, {
      signal: signal,
    });
    pageWindow.addEventListener('pointerdown', onPointerUsed, {
      capture: true,
      signal: signal,
    });
    pageWindow.addEventListener('wheel', onPointerUsed, {
      capture: true,
      passive: true,
      signal: signal,
    });
    pageWindow.addEventListener('focusin', onFocusIn, {
      signal: signal,
    });
    pageWindow.addEventListener('blur', onBlur, {
      signal: signal,
    });
    return () => controller.abort();
  }, [pageWindow, isHintDone, isHintShown]);
  React.useEffect(() => {
    if (hintState.tabsInARow < 2 || hintState.said !== 'notYet' || !canHintShow) return;
    let timer = pageWindow?.setTimeout(() => tellHint('restedFromTab'), LEAVE_CELLS_REST_MS);
    return () => pageWindow?.clearTimeout(timer);
  }, [hintState, canHintShow, pageWindow]);
  let isSaidNow = hintState.said === 'now';
  React.useEffect(() => {
    if (!isSaidNow) return;
    let timer = pageWindow?.setTimeout(() => tellHint('wordsStoodLongEnough'), LEAVE_CELLS_WORDS_MS);
    return () => pageWindow?.clearTimeout(timer);
  }, [isSaidNow, pageWindow]);
  return jsxs(Fragment, {
    children: [
      jsx(LiveAnnouncer, {
        words: isSaidNow && shortcutListMessages.keysThatLeaveCells(),
        timesSaid: hintState.timesSaid,
      }),
      hintState.hint !== 'over' &&
        jsx(Tooltip, {
          content: shortcutActionLabel('leaveCells'),
          shortcut: shortcutKeysFor('leaveCells'),
          open: isHintShown,
          anchor: () => cells.current?.querySelector('.sheet-active-cell-outline') ?? null,
          side: 'bottom',
          align: 'start',
          collisionPadding: popupCollisionPadding(barRoom),
        }),
    ],
  });
});
