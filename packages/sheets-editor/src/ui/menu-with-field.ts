import { ContextMenu } from '../kit/context-menu.tsx';
import { Menu } from '../kit/menu.tsx';
import { useUiWindow } from '../kit/theme.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { listenForKeysToHandOff } from './keyboard-handoff.ts';
import { useCoarsePointerMedia } from '../app/media-queries.ts';
import { isCommandToConfirm } from './search-menu/matching.ts';
import { MenuItemWithWhyOff } from './menu-item-why-off.ts';
import { commandGroupMessages } from './search-menu/command-groups.ts';
import { AskAgentMenuItems } from '../agent/ask-agent-menu.ts';
export function createLateEnterTracker() {
  let compositionEndedAt: Dynamic = Number.NEGATIVE_INFINITY;
  return {
    compositionEnded: ({ timeStamp: timeStamp }: Dynamic) => {
      compositionEndedAt = timeStamp;
    },
    isLateEnter({ key: key, timeStamp: timeStamp }: Dynamic, vendor?: Dynamic) {
      let msSinceComposition = timeStamp - compositionEndedAt;
      compositionEndedAt = Number.NEGATIVE_INFINITY;
      return key === 'Enter' && isSafariLateEnter(msSinceComposition, vendor);
    },
  };
}
export function menuAlignForRoom(anchorStart?: Dynamic, anchorSize?: Dynamic, roomSize?: Dynamic, isRtl?: Dynamic) {
  let wideNeeded = MENU_NUDGE + WIDE_MENU_WIDTH + MENU_EDGE_GAP;
  let fitsAfter = anchorStart + wideNeeded <= roomSize;
  let fitsBefore = anchorStart + anchorSize - wideNeeded >= 0;
  let [prefersFirst, prefersSecond] = isRtl ? [fitsBefore, fitsAfter] : [fitsAfter, fitsBefore];
  if (prefersFirst || prefersSecond) return prefersFirst ? 'start' : 'end';
  let [roomAfter, roomBefore] = [roomSize - anchorStart, anchorStart + anchorSize];
  return (isRtl ? roomAfter > roomBefore : roomBefore > roomAfter) ? 'end' : 'start';
}
export function placeMenuWithField(anchor?: Dynamic, ownWindow?: Dynamic) {
  if (ownWindow === undefined || anchor === null || typeof anchor !== 'object' || !('getBoundingClientRect' in anchor) || 'nodeType' in anchor)
    return {
      anchor: anchor,
      align: 'start',
      widthOfWide: WIDE_MENU_WIDTH,
    };
  let isRtl = ownWindow.getComputedStyle(ownWindow.document.documentElement).direction === 'rtl';
  let { x: anchorX, width: anchorWidth } = anchor.getBoundingClientRect();
  let align = menuAlignForRoom(anchorX, anchorWidth, ownWindow.innerWidth, isRtl);
  let opensTowardStart = (align === 'start') === isRtl;
  return {
    align: align,
    widthOfWide: wideMenuWidth(opensTowardStart ? anchorX + anchorWidth : ownWindow.innerWidth - anchorX),
    anchor: {
      getBoundingClientRect() {
        let { x: x, y: y, width: width, height: height } = anchor.getBoundingClientRect();
        return new (DOMRect as Dynamic)(x + (opensTowardStart ? -MENU_NUDGE : MENU_NUDGE), y, width, height);
      },
    },
  };
}
export function holdMenuHeight(menu?: Dynamic, isHeld?: Dynamic, height: Dynamic = menu.getBoundingClientRect().height, rowsRoom?: Dynamic) {
  let holder = menu.parentElement;
  if (holder === null || isHeld === (holder.style.minBlockSize !== '')) return;
  holder.style.minBlockSize = isHeld ? `${height}px` : '';
  holder.style.pointerEvents = isHeld ? 'none' : '';
  menu.style.pointerEvents = isHeld ? 'auto' : '';
  if (isHeld && rowsRoom !== undefined) menu.style.setProperty('--sheet-room-for-rows', `${rowsRoom}px`);
  if (!isHeld) menu.style.removeProperty('--sheet-room-for-rows');
}
export function MenuRoomForRows(props?: Dynamic) {
  let { anchor: anchor, paddingAtFoot: paddingAtFoot, ownWindow: ownWindow } = props;
  let markerRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let menu = markerRef.current?.closest('[role="menu"]') ?? null;
    if (menu === null || ownWindow === undefined) return;
    let room = roomForRows(anchorBottom(anchor), ownWindow.innerHeight - paddingAtFoot);
    holdMenuHeight(menu, true, room);
    menu.style.setProperty('--sheet-room-for-rows', `${room}px`);
    return () => holdMenuHeight(menu, false);
  }, [anchor, paddingAtFoot, ownWindow]);
  return jsx('span', {
    ref: markerRef,
    hidden: true,
  });
}
export function MenuWidthOfWide({ width: width }: Dynamic) {
  let markerRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let menu = markerRef.current?.closest('[role="menu"]') ?? null;
    menu?.style.setProperty('--sheet-width-of-wide', `${width}px`);
    return () => void menu?.style.removeProperty('--sheet-width-of-wide');
  }, [width]);
  return jsx('span', {
    ref: markerRef,
    hidden: true,
  });
}
export function MenuFieldMaxLength({ mostUnits: mostUnits }: Dynamic) {
  let markerRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let field = markerRef.current?.closest('[role="menu"]')?.querySelector('input') ?? null;
    if (field !== null) field.maxLength = mostUnits;
  }, [mostUnits]);
  return jsx('span', {
    ref: markerRef,
    hidden: true,
  });
}
export function OnMenuOpened({ onOpened: onOpened }: Dynamic) {
  React.useLayoutEffect(onOpened, [onOpened]);
  return null;
}
export function MenuKeyboardTaker({ onShut: onShut, isRowToTakeKeyboard: isRowToTakeKeyboard }: Dynamic) {
  let markerRef = React.useRef(null);
  let shut = React.useEffectEvent(onShut);
  let isKeyForRow = React.useEffectEvent((event?: Dynamic) => isRowToTakeKeyboard && !isMenuFieldTypingKey(event));
  let isClipboardKeyForRow = React.useEffectEvent((event?: Dynamic) => isRowToTakeKeyboard && isClipboardKey(event));
  React.useLayoutEffect(() => {
    let menu = markerRef.current?.closest('[role="menu"]') ?? null;
    let field = menu?.querySelector('input') ?? null;
    if (menu === null || field === null || menu.contains(menu.ownerDocument.activeElement)) return;
    return listenForKeysToHandOff(menu.ownerDocument, {
      holds: (target?: Dynamic) => target instanceof Element && target.closest('[role="menu"]') !== null,
      takes: (event?: Dynamic) => !isClipboardKeyForRow(event),
      takeKeyboard(event?: Dynamic) {
        (isKeyForRow(event) ? menu : field).focus({
          preventScroll: true,
        });
        return menu.contains(menu.ownerDocument.activeElement);
      },
      handOn(event?: Dynamic) {
        if (!isKeyForRow(event) || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        menu.ownerDocument.activeElement?.dispatchEvent(new (KeyboardEvent as Dynamic)('keydown', event));
      },
      shut: shut,
    });
  }, []);
  return jsx('span', {
    ref: markerRef,
    hidden: true,
  });
}
export function pointerAtRest(restPoint?: Dynamic, point?: Dynamic) {
  if (restPoint === null) return null;
  if (restPoint === 'somewhere') return point;
  return Math.hypot(point.x - restPoint.x, point.y - restPoint.y) < POINTER_REST_DISTANCE ? restPoint : null;
}
export function menuFieldKeyAction(press?: Dynamic) {
  if (press.isOfInputMethod) return null;
  if (press.key === (press.isWrittenFromRight ? 'ArrowRight' : 'ArrowLeft') && press.isOnRowOfMenuItself) return 'backToField';
  if (press.isWithModifier) return null;
  if (press.key === 'ArrowUp' && press.isOnFirstRow && !press.isShiftHeld) return 'backToField';
  if (press.isOnRowWithOpenList && press.key.length === 1 && press.key !== ' ') return 'typeInField';
  if (!press.isAnythingTyped) return null;
  if (press.key === ' ' && !press.isInField) return 'typeSpace';
  if (press.key === 'ArrowDown' && press.isInField && press.isRowAfterLitRow && !press.isShiftHeld) return 'pastLitRow';
  if (press.key !== 'Enter' || press.isShiftHeld) return null;
  if (!press.isInField) return null;
  return press.isHeldDown ? 'nothing' : 'enter';
}
export function rowAfterLitRow(rows?: Dynamic) {
  let litIndex = rows.findIndex(({ classList: classList }: Dynamic) => classList.contains('sheet-row-under-enter'));
  return litIndex === -1 ? null : (rows[litIndex + 1] ?? null);
}
export function applyMenuFieldKeyAction(action?: Dynamic, event?: Dynamic, field?: Dynamic) {
  if (action !== 'typeInField') event.preventDefault();
  event.stopPropagation();
  if (action === 'typeSpace' || action === 'typeInField' || action === 'backToField')
    field?.focus({
      preventScroll: true,
    });
}
export function MenuWithField({
  field: field,
  isAtTool = false,
  isOpen = true,
  children: children,
  onKeyDownCapture: onKeyDownCapture,
  ...popupProps
}: Dynamic) {
  let [focusedField, setFocusedField] = React.useState(null);
  let compositionEndRef = React.useRef(Number.NEGATIVE_INFINITY);
  let heldMenuRef = React.useRef(null);
  let pointerRef = React.useRef(null);
  let restPointRef = React.useRef(null);
  let forgetPointer = React.useCallback(() => {
    pointerRef.current = null;
    restPointRef.current = null;
  }, []);
  let markPointerAtRest = (menu?: Dynamic, restPoint?: Dynamic) => {
    restPointRef.current = restPoint;
    menu.toggleAttribute(POINTER_AT_REST_ATTRIBUTE, restPoint !== null);
  };
  let ownWindow = useUiWindow();
  let isPointerCoarse = useCoarsePointerMedia();
  let { anchor: anchor } = popupProps;
  let [placement, setPlacement] = React.useState(null);
  if (
    placement === null ||
    placement.anchor !== anchor ||
    placement.ownWindow !== ownWindow ||
    placement.isAtTool !== isAtTool ||
    placement.isOpen !== isOpen
  )
    setPlacement({
      anchor: anchor,
      ownWindow: ownWindow,
      isAtTool: isAtTool,
      isOpen: isOpen,
      placed:
        !isOpen && placement !== null && placement.ownWindow === ownWindow && placement.isAtTool === isAtTool
          ? placement.placed
          : isAtTool
            ? null
            : placeMenuWithField(anchor, ownWindow),
    });
  let placed = placement !== null && placement.anchor === anchor ? placement.placed : null;
  let isNothingTyped = field === null || field.typed === '';
  let hasRowsAtRest = field?.hasRowsAtRest !== false;
  React.useLayoutEffect(() => {
    if (!isNothingTyped) return;
    if (heldMenuRef.current !== null && hasRowsAtRest) holdMenuHeight(heldMenuRef.current, false);
    pointerRef.current = null;
    restPointRef.current = null;
    heldMenuRef.current?.removeAttribute(POINTER_AT_REST_ATTRIBUTE);
  }, [isNothingTyped, hasRowsAtRest]);
  let renderOverride = React.use(MenuWithFieldRenderContext);
  if (renderOverride !== null)
    return renderOverride({
      field: field,
      atRest: children,
    });
  if (field === null)
    return jsx(ContextMenu.Popup, {
      ...popupProps,
      onKeyDownCapture: onKeyDownCapture,
      children: children,
    });
  let {
    name: name,
    typed: typed,
    onTyped: onTyped,
    takesCaretAtFirst: takesCaretAtFirst,
    renderRowsFor: renderRowsFor,
    onEntered: onEntered,
    onShutByEnter: onShutByEnter,
  } = field;
  let rowsFound = renderRowsFor(typed);
  let isKeyboardYetToCome = !(isAtTool && isPointerCoarse) && focusedField?.isConnected !== true;
  let takesCaretNow = takesCaretAtFirst && isKeyboardYetToCome;
  return jsx(
    Menu.SearchablePopup,
    {
      ...popupProps,
      ...(placed !== null && {
        align: placed.align,
        anchor: placed.anchor,
        sideOffset: -5,
      }),
      className: `sheet-menu-with-field ${isAtTool ? 'sheet-menu-at-tool' : ''} ${field.isOverNumbers === true ? 'sheet-menu-of-numbers' : ''}`,
      ...(!hasRowsAtRest &&
        rowsFound === null && {
          'data-is-field-alone': '',
        }),
      ...(isMenuWide({
        hasRowsFound: rowsFound !== null,
        hasRowsAtRest: hasRowsAtRest,
      }) && {
        'data-is-wide': '',
      }),
      onPointerMoveCapture: (event?: Dynamic) => {
        let { clientX: x, clientY: y } = event;
        pointerRef.current = {
          x: x,
          y: y,
        };
        markPointerAtRest(
          event.currentTarget,
          pointerAtRest(restPointRef.current, {
            x: x,
            y: y,
          }),
        );
        if (restPointRef.current !== null) event.stopPropagation();
      },
      onMouseMoveCapture: (event?: Dynamic) => {
        if (restPointRef.current !== null) event.stopPropagation();
      },
      onInputCapture: ({ currentTarget: menu, target: target }: Dynamic) => {
        markPointerAtRest(menu, pointerRef.current ?? 'somewhere');
        heldMenuRef.current = menu;
        if (isAtTool) return;
        let isFieldEmpty = target instanceof HTMLInputElement && target.value === '';
        holdMenuHeight(
          menu,
          !isFieldEmpty || !hasRowsAtRest,
          undefined,
          hasRowsAtRest && ownWindow !== undefined
            ? ownWindow.innerHeight - bottomPaddingOf(popupProps.collisionPadding) - menu.getBoundingClientRect().top
            : undefined,
        );
      },
      searchLabel: name,
      fieldFocusOnOpen: takesCaretAtFirst && !takesCaretNow,
      onFocus: (event?: Dynamic) => {
        popupProps.onFocus?.(event);
        let fieldElement = event.currentTarget.querySelector('input');
        if (event.target === fieldElement && event.relatedTarget instanceof Element && event.relatedTarget.closest('[role^="menuitem"]') !== null)
          markPointerAtRest(event.currentTarget, pointerRef.current ?? 'somewhere');
        if (event.target !== event.currentTarget) return setFocusedField(fieldElement);
        let cameFromOpenPopup = event.relatedTarget instanceof Element && event.relatedTarget.hasAttribute('data-popup-open');
        if (takesCaretNow || (typed !== '' && !cameFromOpenPopup && !isPointerCoarse))
          fieldElement?.focus({
            preventScroll: true,
          });
      },
      onPasteCapture: (event?: Dynamic) => {
        popupProps.onPasteCapture?.(event);
        if (typed === '') field.onPastedWithNothingTyped?.(event.nativeEvent);
      },
      query: typed,
      onQueryChange: onTyped,
      onCompositionEndCapture: ({ nativeEvent: nativeEvent }: Dynamic) => {
        compositionEndRef.current = nativeEvent.timeStamp;
      },
      onKeyDownCapture: (event?: Dynamic) => {
        let msSinceComposition = event.nativeEvent.timeStamp - compositionEndRef.current;
        compositionEndRef.current = Number.NEGATIVE_INFINITY;
        onKeyDownCapture?.(event);
        if (event.isPropagationStopped()) return;
        let fieldElement = event.currentTarget.querySelector('input');
        let rowAfterLit =
          event.key === 'ArrowDown' && !isPointerCoarse
            ? rowAfterLitRow([...event.currentTarget.querySelectorAll(ENABLED_MENU_ITEM_SELECTOR)])
            : null;
        let action = menuFieldKeyAction({
          key: event.key,
          isInField: event.target === fieldElement,
          isOnFirstRow:
            event.target === event.currentTarget.querySelector(ENABLED_MENU_ITEM_SELECTOR) ||
            event.target === event.currentTarget.querySelector(MENU_ITEM_SELECTOR),
          isRowAfterLitRow: rowAfterLit !== null,
          isOnRowWithOpenList: event.target instanceof Element && isRowWithOpenList(event.currentTarget, event.target),
          isOnRowOfMenuItself:
            event.target instanceof Element && event.target !== fieldElement && event.target.closest('[role="menu"]') === event.currentTarget,
          isWrittenFromRight: ownWindow?.getComputedStyle(event.currentTarget).direction === 'rtl',
          isAnythingTyped: rowsFound !== null,
          isWithModifier: event.altKey || event.ctrlKey || event.metaKey,
          isShiftHeld: event.shiftKey,
          isOfInputMethod:
            event.nativeEvent.isComposing ||
            event.keyCode === 229 ||
            (event.key === 'Enter' && isSafariLateEnter(msSinceComposition, (navigator as Dynamic).vendor)),
          isHeldDown: event.repeat,
        });
        if (action === null || (action === 'typeSpace' && field.isOverNumbers === true)) return;
        if (action === 'typeSpace') onTyped(`${typed} `);
        applyMenuFieldKeyAction(action, event, fieldElement);
        if (action === 'pastLitRow')
          rowAfterLit?.focus({
            focusVisible: true,
          });
        if (action !== 'enter') return;
        let entered = onEntered(typed);
        if (entered === 'shut') onShutByEnter();
        if (entered !== 'lightOutOfUse') return;
        event.currentTarget.querySelector(DISABLED_COMMAND_SELECTOR)?.focus({
          focusVisible: true,
        });
      },
      children: () =>
        jsxs(Fragment, {
          children: [
            placed !== null &&
              jsx(MenuWidthOfWide, {
                width: placed.widthOfWide,
              }),
            !hasRowsAtRest &&
              jsx(MenuRoomForRows, {
                anchor: popupProps.anchor,
                paddingAtFoot: bottomPaddingOf(popupProps.collisionPadding),
                ownWindow: ownWindow,
              }),
            jsx(OnMenuOpened, {
              onOpened: forgetPointer,
            }),
            field.mostUnits !== undefined &&
              jsx(MenuFieldMaxLength, {
                mostUnits: field.mostUnits,
              }),
            takesKeyboardAtOnce({
              ...field,
              isKeyboardYetToCome: isKeyboardYetToCome,
            }) &&
              jsx(MenuKeyboardTaker, {
                onShut: onShutByEnter,
                isRowToTakeKeyboard: field.isRowToTakeKeyboard === true,
              }),
            rowsFound ?? (hasRowsAtRest ? children : null),
          ],
        }),
    },
    placed?.align,
  );
}
export function CommandRows(props?: Dynamic) {
  let { commands: commands, isPointerCoarse: isPointerCoarse, describe: describe, onTaken: onTaken, onPointedAt: onPointedAt } = props;
  let { isRowUnderEnterLit = false, hintOf = null, isOneChoice = false } = props;
  let { idOfRowAskedAgain = null } = props;
  return jsx(Fragment, {
    children: commands.map((command?: Dynamic) => {
      let {
        id: id,
        label: label,
        icon: icon,
        keys: keys,
        isUnderEnter: isUnderEnter,
        isTicked: isTicked,
        whyNot: whyNot,
        keepsOpen: keepsOpen,
      } = command;
      let description = describe(command);
      let isAskedAgain = id === idOfRowAskedAgain;
      let isConfirmLit = isAskedAgain && isRowUnderEnterLit && isUnderEnter === true && isCommandToConfirm(command);
      let hint = whyNot === null && !isAskedAgain ? (hintOf?.(command) ?? null) : null;
      return jsx(
        MenuItemWithWhyOff,
        {
          'data-command': id,
          icon: icon,
          ...(keys !== undefined &&
            !isAskedAgain && {
              shortcut: keys,
            }),
          ...(hint !== null && {
            hint: hint,
          }),
          ...(isAskedAgain && {
            trailing: jsx('span', {
              className: 'sheet-enter-again -my-[0.125em] max-w-[160px] shrink-0 truncate py-[0.125em] text-footnote',
              children: commandGroupMessages.enterAgainToConfirm(),
            }),
          }),
          ...(isTicked !== undefined && {
            checked: isTicked,
          }),
          ...(isTicked !== undefined &&
            isOneChoice && {
              checkedRole: 'radio',
            }),
          ...(keepsOpen === true && {
            keepOpen: true,
          }),
          ...(description !== null && {
            description: description,
            descriptionDir: 'auto',
          }),
          ...(isConfirmLit && {
            variant: 'danger',
          }),
          ...(isRowUnderEnterLit &&
            isUnderEnter === true && {
              className: `sheet-row-under-enter${isConfirmLit ? ` ${ROW_ASKS_IN_RED_CLASSES}` : ''}`,
            }),
          disabled: whyNot !== null,
          whyOff: whyNot,
          isPointerCoarse: isPointerCoarse,
          ...(onPointedAt !== undefined && {
            onFocus: () => onPointedAt(command, true),
            onBlur: () => onPointedAt(command, false),
            onPointerMove: () => onPointedAt(command, true),
            onPointerLeave: () => onPointedAt(command, false),
          }),
          onClick: (event?: Dynamic) => onTaken(command, event.detail === 0),
          children: label,
        },
        id,
      );
    }),
  });
}
export const NOT_DISABLED_SELECTOR = ':not([aria-disabled="true"])';
export const MENU_ITEM_SELECTOR = '[role^="menuitem"]';
export const DISABLED_COMMAND_SELECTOR = '[data-command][aria-disabled="true"]';
export const ENABLED_MENU_ITEM_SELECTOR = `${MENU_ITEM_SELECTOR}${NOT_DISABLED_SELECTOR}`;
export const MenuWithFieldRenderContext = React.createContext(null);
export const isSafariLateEnter = (msSinceComposition?: Dynamic, vendor?: Dynamic) =>
  /Apple Computer/.test(vendor) && Math.abs(msSinceComposition) < 500;
export const anchorBottom = (anchor?: Dynamic) =>
  anchor !== null && typeof anchor === 'object' && 'getBoundingClientRect' in anchor ? anchor.getBoundingClientRect().bottom : 0;
export const bottomPaddingOf = (collisionPadding?: Dynamic) =>
  typeof collisionPadding === 'number' ? collisionPadding : (collisionPadding?.bottom ?? 5);
export const WIDE_MENU_WIDTH = 392;
export const NARROW_MENU_WIDTH = 272;
export const MENU_EDGE_GAP = 8;
export const MENU_NUDGE = 2;
export const isMenuWide = (state?: Dynamic) => state.hasRowsFound || !state.hasRowsAtRest;
export const wideMenuWidth = (room?: Dynamic) =>
  Math.min(Math.max(room - MENU_NUDGE - MENU_EDGE_GAP, NARROW_MENU_WIDTH), WIDE_MENU_WIDTH);
export const roomForRows = (top?: Dynamic, bottom?: Dynamic) => Math.min(Math.max(bottom - top, 300), 500);
export const isMenuFieldTypingKey = (event?: Dynamic) => {
  let hasCommandModifier = (event.metaKey || event.ctrlKey) && !event.altKey;
  let isOneCharacter = event.key.length === String.fromCodePoint(event.key.codePointAt(0) ?? 0).length;
  return /^(Escape|Backspace|Delete|Process|Dead|Unidentified)$/.test(event.key) || (isOneCharacter && !hasCommandModifier);
};
export const isClipboardKey = (event?: Dynamic) => {
  if (/^(Paste|Copy|Cut)$/.test(event.key)) return true;
  if (event.key === 'Insert') return event.shiftKey || event.ctrlKey;
  let letter = /^[\x20-\x7e]$/.test(event.key) ? event.key.toLowerCase() : event.code.replace(/^Key/, '').toLowerCase();
  let isClipboardLetter = event.shiftKey ? letter === 'v' : /^[acvx]$/.test(letter);
  return (event.ctrlKey || event.metaKey) && !event.altKey && isClipboardLetter;
};
export const takesKeyboardAtOnce = (field?: Dynamic) =>
  field.isKeyboardYetToCome && (field.takesCaretAtFirst || field.isRowToTakeKeyboard === true);
export const POINTER_REST_DISTANCE = 4;
export const POINTER_AT_REST_ATTRIBUTE = 'data-is-pointer-at-rest';
export const isRowWithOpenList = (menu?: Dynamic, row?: Dynamic) =>
  row.closest('[role="menu"]') === menu && row.getAttribute('aria-expanded') === 'true';
export const enabledCommandRow = (commandId?: Dynamic, root?: Dynamic) =>
  root.querySelector(`[data-command="${commandId}"]:not([aria-disabled="true"])`);
export const ROW_ASKS_IN_RED_CLASSES = [
  'sheet-row-asks-in-red',
  'bg-danger-soft',
  'text-danger',
].join(' ');
export const CommentNextRow = (props?: Dynamic) =>
  jsx(AskAgentMenuItems, {
    ...props,
    isCommentNext: true,
  });
