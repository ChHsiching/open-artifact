import { Menu, menuItemVariants } from '../../kit/menu.tsx';
import { Icon } from '../../kit/icon.tsx';
import { Tooltip, TooltipGroup } from '../../kit/tooltip.tsx';
import { Button } from '../../kit/button.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { moreOptionsForSheetLabel, sheetMessages } from '../../i18n/sheet-messages.ts';
import { SheetTabMenuItems, SheetNameField } from './tab-menu.ts';
import { sheetNameRefusedText } from '../../i18n/notice-labels.ts';
import { defaultSheetName } from '../../i18n/sheet-names.ts';
import { swallowRestOfPress, swallowPressAfterItemPress } from '../press-swallow.ts';
import { createPressTracker } from '../../app/press-tracker.ts';
import { isSheetNameLeftForWindow, othersOnSheetDescription, TabCommentCount, TabFaces, OthersOnSheetText } from './tab-badges.ts';
import { sheetTabCommentsLabel } from '../../i18n/menu-labels.ts';
import { centerCheckedItemRef, MENU_MAX_VISIBLE_ITEMS } from '../menu-scroll.ts';
import { ListRowTooltip } from '../list-under-cell.ts';
import { usePopupRoomAtFoot } from '../../shell/bottom-insets.ts';
import { whenWindowBlurred } from '../../grid/focus-left.ts';
import { preventMouseDownDefault } from '../dom-events.ts';
import { AddSheetButton, isAddSheetBlankOnly, AddSheetMenuItems } from './add-sheet.ts';
import { isTrustedEscapeClose } from '../../app/page-guards.ts';
import { MenuTriggerButton } from '../menu-trigger.ts';
import { menuTakesCaretOnSmallTouch } from '../menu-initial-focus.ts';
import { SheetTabStrip } from './tab-strip.ts';
export function SheetRowMenu({
  sheet: sheet,
  placeAmongSheets: placeAmongSheets,
  isOnlySheet: isOnlySheet,
  viewOnlyBecause: viewOnlyBecause,
  onRenameChosen: onRenameChosen,
  dispatch: dispatch,
}: Dynamic) {
  let { name: sheetName, renaming: renaming } = sheet;
  let [isSubmenuOpen, setSubmenuOpen] = React.useState(false);
  let triggerRef = React.useRef(null);
  return jsxs(Menu.Submenu, {
    open: isSubmenuOpen,
    onOpenChange: setSubmenuOpen,
    children: [
      jsx(Menu.SubmenuTrigger, {
        ref: triggerRef,
        ...placeAmongSheets,
        'aria-label': moreOptionsForSheetLabel(sheetName),
        label: '',
        openOnHover: false,
        onClick: swallowPressInSheetPresentation,
        disabled: renaming !== null,
        className: `w-auto flex-none self-stretch ${renaming === null ? '' : 'invisible'}`,
        render: (triggerProps?: Dynamic) =>
          jsx('div', {
            ...triggerProps,
            children: jsx(Icon, {
              name: 'DotsHorizontal',
              size: 'sm',
            }),
          }),
        children: sheetName,
      }),
      jsx(Menu.Popup, {
        align: 'end',
        collisionAvoidance: SHEET_MENU_COLLISION_AVOIDANCE,
        finalFocus: () => findSheetRowNameField(triggerRef.current) ?? true,
        children: jsx(SheetTabMenuItems, {
          sheet: sheet,
          isOnlySheet: isOnlySheet,
          viewOnlyBecause: viewOnlyBecause,
          onRenameChosenInList: () => {
            setSubmenuOpen(false);
            onRenameChosen(sheet.sheetId);
          },
          dispatch: dispatch,
        }),
      }),
    ],
  });
}
export function SheetRowRenameField({ renaming: renaming, dispatch: dispatch }: Dynamic) {
  let whyNotId = React.useId();
  let { refused: refused } = renaming;
  return jsx('div', {
    role: 'presentation',
    className: menuItemVariants({
      className: 'col-start-1 row-start-1 min-w-0',
    }),
    children: jsxs('div', {
      role: 'presentation',
      className: 'flex min-w-0 flex-1 flex-col',
      children: [
        jsx(SheetNameField, {
          renaming: renaming,
          whyNotId: whyNotId,
          dispatch: dispatch,
        }),
        refused !== null &&
          jsx('p', {
            id: whyNotId,
            role: 'alert',
            className: 'text-footnote text-danger',
            children: sheetNameRefusedText(refused),
          }),
      ],
    }),
  });
}
export const blankSheetChooser =
  (dispatch?: Dynamic) =>
  () =>
    dispatch({
      kind: 'sheetAddChosen',
      nameStem: defaultSheetName(),
    });
export const dispatchFromSheetList =
  (listedSheets?: Dynamic, dispatch?: Dynamic) =>
  (event?: Dynamic) => {
    if (listedSheets.some(({ renaming: renaming }: Dynamic) => renaming !== null))
      dispatch({
        kind: 'sheetNameLeft',
      });
    dispatch({
      kind: 'sheetListOpened',
    });
    dispatch(event);
  };
export const isSameListedSheet = (sheet?: Dynamic, other?: Dynamic) =>
  sheet.sheetId === other?.sheetId &&
  sheet.name === other.name &&
  sheet.isShown === other.isShown &&
  sheet.holdsOpenEntry === other.holdsOpenEntry &&
  sheet.canBeDeleted === other.canBeDeleted &&
  sheet.isWhereAgentWorks === other.isWhereAgentWorks &&
  sheet.openCommentCount === other.openCommentCount &&
  sheet.renaming?.typed === other.renaming?.typed &&
  sheet.renaming?.refused === other.renaming?.refused &&
  sheet.facesOfOthers === other.facesOfOthers;
export const areSheetListPropsSame = (before?: Dynamic, after?: Dynamic) =>
  after.listedSheets.length === before.listedSheets.length &&
  after.listedSheets.every((sheet?: Dynamic, index?: Dynamic) => isSameListedSheet(sheet, before.listedSheets[index])) &&
  after.viewOnlyBecause === before.viewOnlyBecause &&
  after.whatHasCaretAfterList === before.whatHasCaretAfterList &&
  after.dispatch === before.dispatch;
export const areSheetListMenuPropsSame = (before?: Dynamic, after?: Dynamic) =>
  areSheetListPropsSame(before, after) && after.onRenameChosen === before.onRenameChosen;
export const areSheetPickerPropsSame = (before?: Dynamic, after?: Dynamic) =>
  areSheetListPropsSame(before, after) &&
  after.ref === before.ref &&
  after.isUnfinishedFormulaOpen === before.isUnfinishedFormulaOpen &&
  after.timesRenameBegunElsewhere === before.timesRenameBegunElsewhere &&
  after.onListOpenChange === before.onListOpenChange &&
  after.onKeyDown === before.onKeyDown &&
  after.isChosenForFormula === before.isChosenForFormula &&
  after.onImportChosen === before.onImportChosen &&
  after.lookOnceEventsAreFinished === before.lookOnceEventsAreFinished;
export const sheetListPositionProps = (listedSheets?: Dynamic, index?: Dynamic) => ({
  'aria-posinset': index + 1,
  'aria-setsize': listedSheets.length,
});
export const SHEET_MENU_COLLISION_AVOIDANCE = {
  fallbackAxisSide: 'start',
};
export const findSheetPickerNameField = (trigger?: Dynamic) =>
  trigger?.closest('.sheet-picker')?.querySelector('.sheet-name-field') ?? null;
export const withoutSheetRenaming = (listedSheets?: Dynamic) =>
  listedSheets.map(
    (sheet?: Dynamic) =>
      sheet.renaming === null
        ? sheet
        : {
            ...sheet,
            renaming: null,
          },
  );
export const swallowPressInSheetPresentation = (event?: Dynamic) => {
  if (event.currentTarget.closest('[data-presentation="sheet"]') !== null) swallowRestOfPress(event);
};
export const findSheetRowNameField = (trigger?: Dynamic) =>
  trigger?.closest('[data-sheet-row]')?.querySelector('.sheet-name-field') ?? null;
export const SheetListMenu = React.memo(function ({
  tabListRef: tabListRef,
  listedSheets: listedSheets,
  viewOnlyBecause: viewOnlyBecause,
  whatHasCaretAfterList: whatHasCaretAfterList,
  onRenameChosen: onRenameChosen,
  dispatch: dispatch,
}: Dynamic) {
  let groupRef = React.useRef(null);
  let renamingSheetId = listedSheets.find(({ renaming: renaming }: Dynamic) => renaming !== null)?.sheetId;
  let lastRenamingSheetIdRef = React.useRef(renamingSheetId);
  let isBlurringByPressRef = React.useRef(false);
  let pressTrackerRef = React.useRef(null);
  React.useEffect(() => {
    let defaultView = groupRef.current?.ownerDocument.defaultView ?? null;
    if (defaultView === null) return;
    let pressTracker = createPressTracker(defaultView);
    pressTrackerRef.current = pressTracker;
    return () => pressTracker.stop();
  }, []);
  React.useLayoutEffect(() => {
    let lastRenamingSheetId = lastRenamingSheetIdRef.current;
    lastRenamingSheetIdRef.current = renamingSheetId;
    let ownerDocument = groupRef.current?.ownerDocument;
    if (lastRenamingSheetId === undefined || renamingSheetId !== undefined) return;
    let wasBlurByPress = isBlurringByPressRef.current;
    isBlurringByPressRef.current = false;
    if (wasBlurByPress) return;
    if (ownerDocument === undefined || ownerDocument.activeElement !== ownerDocument.body || !ownerDocument.hasFocus()) return;
    (
      [...(groupRef.current?.querySelectorAll('[data-sheet-row]') ?? [])]
        .find((row?: Dynamic) => row.getAttribute('data-sheet-row') === lastRenamingSheetId)
        ?.querySelector('[role="menuitemradio"]') ?? tabListRef.current
    )?.focus({
      preventScroll: true,
    });
    if (ownerDocument.activeElement !== ownerDocument.body) return;
    let caretTarget = whatHasCaretAfterList();
    if (caretTarget !== false)
      caretTarget.focus({
        preventScroll: true,
      });
  });
  return jsx(Menu.Group, {
    ref: groupRef,
    'aria-label': sheetMessages.sheets(),
    onFocusCapture: () => {
      isBlurringByPressRef.current = false;
    },
    onBlurCapture: (event?: Dynamic) => {
      isBlurringByPressRef.current = isSheetNameLeftForWindow(event, pressTrackerRef.current?.isUnderWay() === true);
    },
    children: listedSheets.map(
      (sheet?: Dynamic, index?: Dynamic) =>
        jsxs(
          'div',
          {
            role: 'presentation',
            'data-sheet-row': sheet.sheetId,
            className: 'flex items-center gap-xs',
            children: [
              jsxs('div', {
                role: 'presentation',
                className: 'grid min-w-0 flex-1',
                children: [
                  jsx(Menu.Item, {
                    ...sheetListPositionProps(listedSheets, index),
                    ...othersOnSheetDescription(sheet.sheetId, sheet.facesOfOthers),
                    'aria-label': sheetTabCommentsLabel(sheet.name, sheet.openCommentCount),
                    ref: sheet.isShown ? centerCheckedItemRef : undefined,
                    className: `col-start-1 row-start-1 min-w-0 self-start ${sheet.renaming === null ? '' : 'invisible'}`,
                    checked: sheet.isShown,
                    checkedRole: 'radio',
                    checkPosition: 'trailing',
                    label: sheet.name,
                    onClick: () =>
                      dispatch({
                        kind: 'sheetChosen',
                        sheetId: sheet.sheetId,
                        isPickedInList: true,
                      }),
                    children: jsxs('span', {
                      className: 'flex items-center gap-sm',
                      children: [
                        jsx(ListRowTooltip, {
                          className: 'block max-w-64',
                          children: sheet.name,
                        }),
                        jsx(TabCommentCount, {
                          count: sheet.openCommentCount,
                        }),
                        sheet.facesOfOthers.length > 0 &&
                          jsx(TabFaces, {
                            faces: sheet.facesOfOthers,
                          }),
                      ],
                    }),
                  }),
                  sheet.renaming !== null &&
                    jsx(SheetRowRenameField, {
                      renaming: sheet.renaming,
                      dispatch: dispatch,
                    }),
                ],
              }),
              jsx(SheetRowMenu, {
                sheet: sheet,
                placeAmongSheets: sheetListPositionProps(listedSheets, index),
                isOnlySheet: listedSheets.length === 1,
                viewOnlyBecause: viewOnlyBecause,
                onRenameChosen: onRenameChosen,
                dispatch: dispatch,
              }),
            ],
          },
          sheet.sheetId,
        ),
    ),
  });
}, areSheetListMenuPropsSame);
export const SheetPicker = React.memo(function ({
  ref: ref,
  addSheetButton: addSheetButton,
  isUnfinishedFormulaOpen: isUnfinishedFormulaOpen,
  timesRenameBegunElsewhere: timesRenameBegunElsewhere,
  onListOpenChange: onListOpenChange,
  onKeyDown: onKeyDown,
  isChosenForFormula: isChosenForFormula,
  onImportChosen: onImportChosen,
  lookOnceEventsAreFinished: lookOnceEventsAreFinished,
  ...listProps
}: Dynamic) {
  let {
    listedSheets: listedSheets,
    viewOnlyBecause: viewOnlyBecause,
    whatHasCaretAfterList: whatHasCaretAfterList,
    dispatch: dispatch,
  } = listProps;
  let leaveSheetRenaming = () => {
    if (listedSheets.some(({ renaming: renaming }: Dynamic) => renaming !== null))
      dispatch({
        kind: 'sheetNameLeft',
      });
  };
  let dispatchFromAddMenu = (event?: Dynamic) => {
    leaveSheetRenaming();
    if (event.kind !== 'sheetChosen' || !isChosenForFormula(event.sheetId))
      dispatch({
        kind: 'sheetListOpened',
      });
    dispatch(event);
  };
  let addChoices = {
    onBlankChosen: blankSheetChooser(dispatchFromAddMenu),
    onImportChosen: onImportChosen,
  };
  let isAddingOff = isUnfinishedFormulaOpen || listedSheets.some(({ renaming: renaming }: Dynamic) => renaming !== null);
  let [isAddMenuOpen, setAddMenuOpen] = React.useState(false);
  let [isListOpen, setListOpen] = React.useState(false);
  let listButtonRef = React.useRef(null);
  let tabListRef = React.useRef(null);
  let [hasListTakenCaret, setListTakenCaret] = React.useState(false);
  let listClosedByKeyboardRef = React.useRef(false);
  let renameOnPickRef = React.useRef(false);
  let renamingSheetId = isListOpen ? listedSheets.find(({ renaming: renaming }: Dynamic) => renaming !== null)?.sheetId : undefined;
  let [lastRenamingSheetId, setLastRenamingSheetId] = React.useState(renamingSheetId);
  let [isRenamedSheetGone, setRenamedSheetGone] = React.useState(false);
  let setListOpenAndTell = (isOpen?: Dynamic, event?: Dynamic, byKeyboard?: Dynamic) => {
    listClosedByKeyboardRef.current = byKeyboard;
    setListOpen(isOpen);
    if (isOpen) setAddMenuOpen(false);
    setRenamedSheetGone(false);
    onListOpenChange(isOpen, event);
    if (isOpen) leaveSheetRenaming();
    dispatch({
      kind: isOpen ? 'sheetListOpened' : 'sheetListShut',
    });
  };
  let setAddMenuOpenAndTell = (isOpen?: Dynamic, event?: Dynamic) => {
    if (isOpen && isUnfinishedFormulaOpen) return;
    if (isOpen && isListOpen) setListOpenAndTell(false, event, false);
    setAddMenuOpen(isOpen);
    onListOpenChange(isOpen, event);
    if (!isOpen) return;
    leaveSheetRenaming();
    dispatch({
      kind: 'sheetListOpened',
    });
  };
  let chooseSheetAfterRename = React.useCallback(
    (sheetId?: Dynamic) => {
      if (!renameOnPickRef.current) return;
      listClosedByKeyboardRef.current = false;
      setListOpen(false);
      onListOpenChange(false, new (Event as Dynamic)('renamechosen'));
      dispatch({
        kind: 'sheetListShut',
      });
      dispatch({
        kind: 'sheetChosen',
        sheetId: sheetId,
        isPickedInList: true,
      });
    },
    [onListOpenChange, dispatch],
  );
  let popupRoom = usePopupRoomAtFoot(isListOpen, () => listButtonRef.current);
  if (renamingSheetId !== lastRenamingSheetId) {
    setLastRenamingSheetId(renamingSheetId);
    if (lastRenamingSheetId !== undefined && !listedSheets.some(({ sheetId: sheetId }: Dynamic) => sheetId === lastRenamingSheetId)) {
      setListOpen(false);
      setRenamedSheetGone(true);
    }
  }
  React.useLayoutEffect(() => {
    if (!isRenamedSheetGone) return;
    onListOpenChange(false, new (Event as Dynamic)('sheetgone'));
    dispatch({
      kind: 'sheetListShut',
    });
  }, [isRenamedSheetGone, onListOpenChange, dispatch]);
  let isRenaming = renamingSheetId !== undefined;
  React.useEffect(() => {
    let defaultView = listButtonRef.current?.ownerDocument.defaultView ?? null;
    if (!isListOpen || defaultView === null) return;
    let closeList = (event?: Dynamic) => {
      setListOpen(false);
      onListOpenChange(false, event);
      dispatch({
        kind: 'sheetListShut',
      });
    };
    let onWindowBlur = (event?: Dynamic) =>
      isRenaming ? whenWindowBlurred(defaultView.document, () => closeList(event)) : closeList(event);
    defaultView.addEventListener('blur', onWindowBlur);
    return () => defaultView.removeEventListener('blur', onWindowBlur);
  }, [isListOpen, isRenaming, onListOpenChange, dispatch]);
  return jsxs('div', {
    ref: ref,
    role: 'presentation',
    className: 'sheet-picker flex min-w-0 flex-1 items-center gap-md',
    onMouseDown: preventMouseDownDefault,
    onKeyDown: onKeyDown,
    children: [
      jsxs(TooltipGroup, {
        children: [
          viewOnlyBecause === 'earlierVersionShown' &&
            jsx(Button, {
              variant: 'ghost',
              iconOnly: true,
              icon: 'Add',
              'aria-label': sheetMessages.addSheet(),
              disabled: true,
            }),
          viewOnlyBecause === null &&
            jsx(AddSheetButton, {
              button: addSheetButton,
              isOpen: isAddMenuOpen,
              onOpenChange: setAddMenuOpenAndTell,
              whatHasCaretAfter: whatHasCaretAfterList,
              ...addChoices,
            }),
          jsxs(Menu.Root, {
            modal: false,
            open: isListOpen,
            highlightItemOnHover: listedSheets.every(({ renaming: renaming }: Dynamic) => renaming === null),
            onOpenChange: (isOpen: Dynamic, { reason: reason, event: event }: Dynamic) => {
              swallowPressAfterItemPress(reason, event);
              setListOpenAndTell(isOpen, event, isTrustedEscapeClose(reason, event));
            },
            children: [
              jsx(Tooltip, {
                content: sheetMessages.allSheets(),
                side: 'top',
                ...(isListOpen || isAddMenuOpen
                  ? {
                      open: false,
                    }
                  : {}),
                children: jsx(MenuTriggerButton, {
                  ref: listButtonRef,
                  variant: 'ghost',
                  icon: 'ListBullet',
                  'aria-label': sheetMessages.allSheets(),
                  chevron: 'toolbar',
                  children: null,
                }),
              }),
              jsx(Menu.Popup, {
                side: 'top',
                align: 'start',
                ...popupRoom,
                maxVisibleItems: MENU_MAX_VISIBLE_ITEMS,
                header: jsx(Fragment, {
                  children:
                    viewOnlyBecause === null &&
                    (isAddSheetBlankOnly()
                      ? jsx(Menu.Item, {
                          icon: 'Add',
                          disabled: isAddingOff,
                          onClick: addChoices.onBlankChosen,
                          children: sheetMessages.addSheet(),
                        })
                      : jsxs(Menu.Submenu, {
                          children: [
                            jsx(Menu.SubmenuTrigger, {
                              icon: 'Add',
                              onClick: swallowPressInSheetPresentation,
                              disabled: isAddingOff,
                              children: sheetMessages.addSheet(),
                            }),
                            jsx(Menu.Popup, {
                              onMouseDown: preventMouseDownDefault,
                              children: jsx(AddSheetMenuItems, {
                                ...addChoices,
                              }),
                            }),
                          ],
                        })),
                }),
                initialFocus: (openedBy?: Dynamic) => {
                  renameOnPickRef.current = openedBy !== 'keyboard' && menuTakesCaretOnSmallTouch(listButtonRef.current);
                  let takesCaret = openedBy === 'keyboard' || renameOnPickRef.current;
                  setListTakenCaret(takesCaret);
                  return takesCaret;
                },
                finalFocus:
                  hasListTakenCaret &&
                  !isRenamedSheetGone &&
                  (() => findSheetPickerNameField(listButtonRef.current) ?? (listClosedByKeyboardRef.current || whatHasCaretAfterList())),
                onMouseDown: preventMouseDownDefault,
                onKeyDownCapture: (event?: Dynamic) => {
                  if (event.target instanceof HTMLInputElement && event.key !== 'Tab') return;
                  let isRepeatedPress = (event.key === 'Enter' || event.key === ' ') && event.repeat;
                  if (event.key !== 'Tab' && !isRepeatedPress) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.key === 'Tab') setListOpenAndTell(false, event.nativeEvent, true);
                },
                children: jsx(SheetListMenu, {
                  ...listProps,
                  listedSheets: isListOpen ? listedSheets : withoutSheetRenaming(listedSheets),
                  tabListRef: tabListRef,
                  onRenameChosen: chooseSheetAfterRename,
                }),
              }),
            ],
          }),
          jsx(SheetTabStrip, {
            listedSheets: listedSheets,
            viewOnlyBecause: viewOnlyBecause,
            tabListRef: tabListRef,
            isListOpen: isListOpen,
            isAddMenuOpen: isAddMenuOpen,
            isUnfinishedFormulaOpen: isUnfinishedFormulaOpen,
            whatHasCaretAfterMenu: whatHasCaretAfterList,
            timesRenameBegunElsewhere: timesRenameBegunElsewhere,
            onMenuOpenChange: (isOpen?: Dynamic, event?: Dynamic) => {
              if (isOpen) setAddMenuOpen(false);
              onListOpenChange(isOpen, event);
            },
            dispatchAfterEntry: dispatchFromAddMenu,
            lookOnceEventsAreFinished: lookOnceEventsAreFinished,
            isChosenForFormula: isChosenForFormula,
            dispatch: dispatch,
          }),
        ],
      }),
      listedSheets.map(
        ({ sheetId: sheetId, facesOfOthers: facesOfOthers }: Dynamic) =>
          facesOfOthers.length > 0 &&
          jsx(
            OthersOnSheetText,
            {
              sheetId: sheetId,
              faces: facesOfOthers,
            },
            sheetId,
          ),
      ),
    ],
  });
}, areSheetPickerPropsSame);
