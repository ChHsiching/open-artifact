import { Menu } from '../../kit/menu.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { disabledByViewOnly } from '../why-not.ts';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { swallowRestOfPress } from '../press-swallow.ts';
import { copiedSheetNameAffixes } from '../../i18n/sheet-names.ts';
import { MenuItemWithWhyOff } from '../menu-item-why-off.ts';
import { offerKeyboardWhenReady } from '../keyboard-handoff.ts';
import { whenBlurredToNothing } from '../../grid/focus-left.ts';
export function SheetTabMenuItems({
  sheet: { sheetId: sheetId, canBeDeleted: canBeDeleted, isShown: isShown },
  isOnlySheet: isOnlySheet,
  placeAmongTabs: placeAmongTabs,
  viewOnlyBecause: viewOnlyBecause,
  onRenameChosenInList: onRenameChosenInList,
  dispatch: dispatch,
}: Dynamic) {
  let editAction = disabledByViewOnly(viewOnlyBecause);
  let deleteAction =
    editAction.disabled || canBeDeleted
      ? editAction
      : {
          disabled: true,
          disabledReason: isOnlySheet ? sheetMessages.onlySheet() : null,
        };
  let canEdit = viewOnlyBecause !== 'readOnly';
  return jsxs(Fragment, {
    children: [
      canEdit &&
        jsx(Menu.Item, {
          icon: 'Edit',
          ...editAction,
          keepOpen: onRenameChosenInList !== undefined,
          onClick: (input?: Dynamic) => {
            if (onRenameChosenInList !== undefined) swallowRestOfPress(input);
            onRenameChosenInList?.();
            dispatch({
              kind: 'sheetRenameChosen',
              sheetId: sheetId,
            });
          },
          children: sheetMessages.renameSheet(),
        }),
      canEdit &&
        jsx(Menu.Item, {
          icon: 'Copy',
          ...editAction,
          onClick: () =>
            dispatch({
              kind: 'sheetDuplicateChosen',
              sheetId: sheetId,
              wordsAroundName: copiedSheetNameAffixes(),
            }),
          children: sheetMessages.duplicateSheet(),
        }),
      jsx(Menu.Item, {
        icon: 'Link',
        ...(isShown
          ? {
              shortcut: 'alt+cmd+l',
            }
          : {}),
        onClick: () =>
          dispatch({
            kind: 'sheetLinkCopyChosen',
            sheetId: sheetId,
          }),
        children: sheetMessages.copyLinkToSheet(),
      }),
      canEdit &&
        placeAmongTabs !== undefined &&
        jsxs(Fragment, {
          children: [
            jsx(Menu.Item, {
              icon: 'ArrowLeft',
              ...(placeAmongTabs.index === 0 ? DISABLED_WITHOUT_REASON : editAction),
              onClick: () =>
                dispatch({
                  kind: 'sheetMoveChosen',
                  sheetId: sheetId,
                  toIndex: placeAmongTabs.index - 1,
                }),
              children: sheetMessages.moveSheetLeft(),
            }),
            jsx(Menu.Item, {
              icon: 'ArrowRight',
              ...(placeAmongTabs.index === placeAmongTabs.count - 1 ? DISABLED_WITHOUT_REASON : editAction),
              onClick: () =>
                dispatch({
                  kind: 'sheetMoveChosen',
                  sheetId: sheetId,
                  toIndex: placeAmongTabs.index + 1,
                }),
              children: sheetMessages.moveSheetRight(),
            }),
          ],
        }),
      canEdit &&
        jsx(MenuItemWithWhyOff, {
          variant: 'danger',
          icon: 'Trash',
          disabled: deleteAction.disabled,
          whyOff: deleteAction.disabledReason,
          onClick: () =>
            dispatch({
              kind: 'sheetDeleteChosen',
              sheetId: sheetId,
            }),
          children: sheetMessages.deleteSheet(),
        }),
    ],
  });
}
export function SheetNameField({ renaming: { typed: typed, refused: refused }, whyNotId: whyNotId, dispatch: dispatch }: Dynamic) {
  let fieldRef = React.useRef(null);
  let focusField = React.useEffectEvent(() => {
    let field = fieldRef.current;
    if (field === null) return;
    let dropRename = () =>
      dispatch({
        kind: 'sheetRenameDropped',
      });
    return offerKeyboardWhenReady(
      field,
      () => {
        field.focus({
          preventScroll: true,
        });
        if (field.ownerDocument.activeElement !== field) dropRename();
      },
      {
        keys: {
          onShut: dropRename,
        },
        onGivenUp: dropRename,
      },
    );
  });
  let isComposingRef = React.useRef(false);
  React.useEffect(() => focusField(), []);
  return jsx('input', {
    ref: fieldRef,
    className: 'sheet-name-field',
    'aria-label': sheetMessages.sheetName(),
    'aria-invalid': refused !== null,
    'aria-describedby': refused === null ? undefined : whyNotId,
    spellCheck: false,
    autoComplete: 'off',
    autoCorrect: 'off',
    value: typed,
    onChange: ({ target: target }: Dynamic) =>
      dispatch({
        kind: 'sheetNameTyped',
        text: target.value,
      }),
    onFocus: ({ currentTarget: currentTarget }: Dynamic) => {
      if (!isComposingRef.current) currentTarget.select();
      isComposingRef.current = true;
    },
    onBlur: ({ relatedTarget: relatedTarget, currentTarget: currentTarget }: Dynamic) => {
      if (relatedTarget !== null)
        dispatch({
          kind: 'sheetNameLeft',
          mayComeBack: false,
        });
      else
        whenBlurredToNothing(
          currentTarget,
          () =>
            dispatch({
              kind: 'sheetNameLeft',
              mayComeBack: true,
            }),
        );
    },
    onMouseDown: (input?: Dynamic) => input.stopPropagation(),
    onKeyDown: (event?: Dynamic) => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.repeat || (event.key !== 'Enter' && event.key !== 'Escape')) return;
      event.preventDefault();
      dispatch({
        kind: event.key === 'Enter' ? 'sheetNameEntered' : 'sheetRenameDropped',
      });
    },
  });
}
export const DISABLED_WITHOUT_REASON = {
  disabled: true,
  disabledReason: null,
};
