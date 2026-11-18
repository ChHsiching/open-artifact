import { Menu } from '../../kit/menu.tsx';
import { useRovingToolbar } from '../../kit/roving-toolbar.ts';
import { Surface } from '../../kit/surface.tsx';
import { AgentMark } from '../../kit/agent-mark.tsx';
import { Icon } from '../../kit/icon.tsx';
import { Button } from '../../kit/button.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { FILE_UPLOAD_ICON, IMPORT_FILE_SOURCES, type ImportFileSource } from '../../import/file-sources.ts';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
import { importFileChoices } from '../../import/csv-file.ts';
import { AGENT_ASK_PRESSED_MS } from './ways-in-state.ts';
import { useCoarseBarIconSize } from '../bar-buttons.ts';
import { preventMouseDownDefault } from '../dom-events.ts';
import { ToolbarMenu } from '../format-toolbar.ts';
import { MenuTriggerButton } from '../menu-trigger.ts';
import { ANNOUNCEMENT_HOLD_MS } from '../../agent/agent-said-announcer.ts';
import { LiveAnnouncer } from '../live-announcer.ts';
import { translateMessage } from '../../i18n/messages.ts';
export interface WaysInImportChoice {
  icon: React.ReactNode;
  name: string;
  /** `'awaited'`: a way the agent offered before, kept in place (drawn disabled) while the offer is away for a moment. */
  onChosen: (() => void) | 'awaited';
}
export interface WaysInImportProps {
  onImportChosen: (choices: typeof importFileChoices) => void;
  filesForAgent?: readonly ImportFileSource[];
  onFileForAgentChosen?: (source: ImportFileSource) => void;
}
export function waysInImportChoices(
  kinds: readonly ImportFileSource[],
  { onImportChosen, filesForAgent = NO_FILES_FOR_AGENT, onFileForAgentChosen }: WaysInImportProps,
): WaysInImportChoice[] {
  let importIcon = jsx(Icon, {
    name: FILE_UPLOAD_ICON,
    size: 'sm',
  });
  if (kinds.length === 0)
    return [
      {
        icon: importIcon,
        name: sheetMessages.importFile(),
        onChosen: (): void => onImportChosen(importFileChoices),
      },
    ];
  return [
    ...importFileChoices.map((importKind) => ({
      icon: importIcon,
      name: importKind.inMenu(),
      onChosen: (): void => onImportChosen([importKind]),
    })),
    ...kinds.map((kind) => ({
      icon: IMPORT_FILE_SOURCES[kind].mark,
      name: IMPORT_FILE_SOURCES[kind].name(),
      onChosen: filesForAgent.includes(kind) ? (): void => onFileForAgentChosen?.(kind) : ('awaited' as const),
    })),
  ];
}
export function createFreshPaintClickGuard() {
  let drawnKey: Dynamic = null;
  let firstPaintAt: Dynamic = Number.POSITIVE_INFINITY;
  let isClickMeantFlag: Dynamic = null;
  let pointerDownAt: Dynamic = 0;
  let lastDroppedAt: Dynamic = Number.NEGATIVE_INFINITY;
  return {
    drawn(key?: Dynamic) {
      if (key !== drawnKey) firstPaintAt = Number.POSITIVE_INFINITY;
      drawnKey = key;
    },
    paintedAt(timeStamp?: Dynamic) {
      firstPaintAt = Math.min(firstPaintAt, timeStamp);
    },
    pointerWentDownAt(timeStamp?: Dynamic) {
      pointerDownAt = timeStamp;
      isClickMeantFlag = timeStamp - firstPaintAt >= WAYS_IN_FRESH_PAINT_MS;
    },
    isMouseDownDropped(clickCount?: Dynamic) {
      if ((clickCount === 2 || clickCount === 3) && pointerDownAt - lastDroppedAt > AGENT_ASK_PRESSED_MS) isClickMeantFlag = false;
      let isDropped = isClickMeantFlag === false;
      lastDroppedAt = isDropped ? Number.NEGATIVE_INFINITY : pointerDownAt;
      return isDropped;
    },
    pointerWasCanceled() {
      isClickMeantFlag = null;
    },
    isClickMeant(clickCount?: Dynamic) {
      let isMeant = clickCount === 0 || isClickMeantFlag !== false;
      isClickMeantFlag = null;
      return isMeant;
    },
  };
}
export function useWaysInOverflow(toolbar?: Dynamic) {
  let [overflows, setOverflows] = React.useState(false);
  let fullWidthRef = React.useRef(0);
  React.useLayoutEffect(() => {
    let sheetFoot = toolbar?.closest('.sheet-foot') ?? null;
    if (toolbar === null || sheetFoot === null || sheetFoot.parentElement === null) return;
    let measure = () => {
      let style = getComputedStyle(toolbar);
      if (!overflows) {
        let buttons = [...toolbar.querySelectorAll(':scope > button')];
        fullWidthRef.current =
          buttons.reduce((total?: Dynamic, button?: Dynamic) => total + button.getBoundingClientRect().width, 0) +
          (buttons.length - 1) * cssPixels(style, 'column-gap') +
          cssPixels(style, 'padding-left') +
          cssPixels(style, 'padding-right');
      }
      let roomForWaysIn = cssPixels(style, '--sheet-room-for-ways-in');
      if (roomForWaysIn > 0) setOverflows(fullWidthRef.current > roomForWaysIn);
    };
    measure();
    let resizeObserver = new (ResizeObserver as Dynamic)(measure);
    resizeObserver.observe(sheetFoot.parentElement);
    resizeObserver.observe(toolbar);
    let mutationObserver = new (MutationObserver as Dynamic)(measure);
    mutationObserver.observe(sheetFoot, {
      attributes: true,
      attributeFilter: ['style', 'data-keeps-room-of-pane'],
    });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [toolbar, overflows]);
  return overflows;
}
export function WaysInToolbar({
  ref: ref,
  onAskAgent: onAskAgent,
  onKeyDown: onKeyDown,
  whatHasCaretAfter: whatHasCaretAfter,
  onMenuOpenChange: onMenuOpenChange,
  ...addChoiceProps
}: Dynamic) {
  let barIconSize = useCoarseBarIconSize();
  let rovingToolbar = useRovingToolbar();
  let { ref: rovingRef } = rovingToolbar;
  let [toolbarElement, setToolbarElement] = React.useState(null);
  let toolbarRef = React.useCallback(
    (element?: Dynamic) => {
      setToolbarElement(element);
      ref(element);
      rovingRef(element);
    },
    [ref, rovingRef],
  );
  let [keptKinds, setKeptKinds] = React.useState<readonly ImportFileSource[] | null>(null);
  let kinds = keptFilesForAgent(keptKinds, addChoiceProps.filesForAgent ?? NO_FILES_FOR_AGENT);
  if (kinds !== keptKinds) setKeptKinds(kinds);
  let importChoices = waysInImportChoices(kinds, addChoiceProps);
  let isImportFolded = useWaysInOverflow(toolbarElement) && importChoices.length > 1;
  let drawnKey = [
    onAskAgent !== null,
    ...(isImportFolded ? [sheetMessages.importFile()] : importChoices.map(({ name: wayName }: Dynamic) => wayName)),
  ].join();
  let [isImportMenuOpen, setImportMenuOpen] = React.useState(false);
  let toolbarHolderRef = React.useRef(null);
  let [freshPaintGuard] = React.useState(createFreshPaintClickGuard);
  React.useEffect(() => {
    freshPaintGuard.drawn(drawnKey);
    let frame = requestAnimationFrame(freshPaintGuard.paintedAt);
    return () => cancelAnimationFrame(frame);
  }, [freshPaintGuard, drawnKey]);
  return jsxs(Surface, {
    elevation: 'panel',
    role: 'toolbar',
    'aria-label': typeof onAskAgent === 'function' ? sheetMessages.agentOrImportOffered() : sheetMessages.importOffered(),
    className: 'sheet-ways-in',
    'data-size': barIconSize,
    ...rovingToolbar,
    ref: toolbarRef,
    onKeyDown: (event?: Dynamic) => {
      onKeyDown(event);
      rovingToolbar.onKeyDown(event);
    },
    onMouseDown: preventMouseDownDefault,
    onPointerDownCapture: ({ timeStamp: timeStamp }: Dynamic) => freshPaintGuard.pointerWentDownAt(timeStamp),
    onPointerCancelCapture: freshPaintGuard.pointerWasCanceled,
    onMouseDownCapture: (event?: Dynamic) => {
      if (!freshPaintGuard.isMouseDownDropped(event.detail)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    onClickCapture: (event?: Dynamic) => {
      if (!freshPaintGuard.isClickMeant(event.detail)) event.stopPropagation();
    },
    children: [
      onAskAgent !== null &&
        jsx(Button, {
          variant: 'ghost',
          icon: jsx('span', {
            className: 'grid size-4 place-items-center',
            children: jsx(AgentMark, {
              size: 14,
            }),
          }),
          ...(onAskAgent === 'awaited'
            ? AWAITED_WAY_IN_PROPS
            : {
                onClick: onAskAgent,
              }),
          children: jsx('span', {
            className: 'font-normal',
            children: sheetMessages.askAgent(),
          }),
        }),
      isImportFolded
        ? jsx(ToolbarMenu, {
            isOpen: isImportMenuOpen,
            button: jsx(MenuTriggerButton, {
              ref: toolbarHolderRef,
              variant: 'ghost',
              icon: jsx(Icon, {
                name: FILE_UPLOAD_ICON,
                size: 'sm',
              }),
              chevron: 'toolbar',
              children: jsx('span', {
                className: 'font-normal',
                children: sheetMessages.importFile(),
              }),
            }),
            tooltip: null,
            onOpenChange: (isOpen?: Dynamic, details?: Dynamic) => {
              setImportMenuOpen(isOpen);
              onMenuOpenChange(isOpen, details);
            },
            whatHasCaretAfter: whatHasCaretAfter,
            toolbar: toolbarHolderRef,
            side: 'top',
            placedBy: {
              align: 'start',
            },
            children: importChoices.map(
              ({ icon: icon, name: wayName, onChosen: onChosen }: Dynamic) =>
                onChosen !== 'awaited' &&
                jsx(
                  Menu.Item,
                  {
                    icon: icon,
                    onClick: onChosen,
                    children: wayName,
                  },
                  wayName,
                ),
            ),
          })
        : importChoices.map(
            ({ icon: icon, name: wayName, onChosen: onChosen }: Dynamic) =>
              jsx(
                Button,
                {
                  variant: 'ghost',
                  icon: icon,
                  ...(onChosen === 'awaited'
                    ? AWAITED_WAY_IN_PROPS
                    : {
                        onClick: onChosen,
                      }),
                  children: jsx('span', {
                    className: 'font-normal',
                    children: wayName,
                  }),
                },
                wayName,
              ),
          ),
    ],
  });
}
export function WaysInHintAnnouncer({ areUp: areUp, canAskAgent: canAskAgent, wordsOfLoad: wordsOfLoad }: Dynamic) {
  let areWordsToCome = React.useSyncExternalStore(
    React.useCallback((onChange?: Dynamic) => wordsOfLoad.onChanged(onChange), [wordsOfLoad]),
    () => wordsOfLoad.areWordsToCome(),
    () => false,
  );
  let isHintDue = areUp && !areWordsToCome;
  let [isHintOver, setHintOver] = React.useState(false);
  React.useEffect(() => {
    if (!isHintDue) return;
    let timer = setTimeout(() => setHintOver(true), ANNOUNCEMENT_HOLD_MS);
    return () => {
      clearTimeout(timer);
      setHintOver(true);
    };
  }, [isHintDue]);
  return jsx(LiveAnnouncer, {
    words: isHintDue && !isHintOver && waysInF6Hint(canAskAgent),
  });
}
export const waysInF6Hint = (canAskAgent?: Dynamic) =>
  canAskAgent
    ? translateMessage({
        defaultMessage: 'Press F6 to ask Agent to fill this sheet, or to import a file.',
        id: 'r5UEkkYQT5',
      })
    : translateMessage({
        defaultMessage: 'Press F6 to import a file.',
        id: 'Bsw9ujQHVi',
      });
const NO_FILES_FOR_AGENT: readonly ImportFileSource[] = [];
/** The agent's file ways stay put once drawn while they're offered again soon (drawn as awaited meanwhile). */
export const keptFilesForAgent = (
  keptKinds: readonly ImportFileSource[] | null,
  filesForAgent: readonly ImportFileSource[],
): readonly ImportFileSource[] =>
  keptKinds !== null && (keptKinds.length > 0 || filesForAgent.length === 0) ? keptKinds : filesForAgent;
export const WAYS_IN_FRESH_PAINT_MS = 400;
export const cssPixels = (style?: Dynamic, property?: Dynamic) => {
  let pixels = Number.parseFloat(style.getPropertyValue(property));
  return Number.isNaN(pixels) ? 0 : pixels;
};
export const AWAITED_WAY_IN_PROPS = {
  className: 'invisible',
  disabled: true,
};
