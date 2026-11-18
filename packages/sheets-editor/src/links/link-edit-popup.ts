import { FieldError, FieldLabel, FieldRoot } from '../kit/field.tsx';
import { TextInput } from '../kit/text-input.tsx';
import { Popover } from '../kit/popover.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { flattenEnteredText } from '../format/shown-text.ts';
import { canRemoveLink, linkAddressProblem } from './link-form.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { linkEditMessages } from './link-hover-card.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { useBottomInsetWhileOpen, popupCollisionPadding } from '../shell/bottom-insets.ts';
import { PRESS_TOO_SOON_MS } from '../ui/list-under-cell.ts';
import { usePopupGivenUpOnBlur } from '../ui/popup-given-up-on-blur.ts';
import { IS_APPLE_PLATFORM } from '../ui/dom-events.ts';
import { isCommandHeld, latinKeyOf } from '../keys/key-press.ts';
export function LinkEditForm({ form: form, addressField: addressField, onSaved: onSaved, onShut: onShut }: Dynamic) {
  let shownText = flattenEnteredText(form.text);
  let [typedText, setTypedText] = React.useState(shownText);
  let text = typedText === shownText ? form.text : typedText;
  let [address, setAddress] = React.useState(form.address);
  let [addressError, setAddressError] = React.useState(null);
  let canSave = address.trim() !== '' || canRemoveLink(form, text);
  let save = () => {
    if (!canSave) return;
    let error = linkAddressProblem(address, form.inEntry !== undefined);
    setAddressError(error);
    if (error === null) onSaved(text, address);
  };
  let onFieldKeyDown = (event?: Dynamic) => {
    event.stopPropagation();
    if (event.key !== 'Enter' || isComposingKeyEvent(event)) return;
    event.preventDefault();
    save();
  };
  return jsxs('div', {
    className: 'flex flex-col gap-md',
    children: [
      jsxs(FieldRoot, {
        children: [
          jsx(FieldLabel, {
            children: linkEditMessages.text(),
          }),
          jsx(TextInput, {
            value: typedText,
            onChange: (input?: Dynamic) => setTypedText(input.target.value),
            onKeyDown: onFieldKeyDown,
            autoComplete: 'off',
          }),
        ],
      }),
      jsxs(FieldRoot, {
        invalid: addressError !== null,
        children: [
          jsx(FieldLabel, {
            children: linkEditMessages.link(),
          }),
          jsx(TextInput, {
            ref: addressField,
            value: address,
            onChange: (event?: Dynamic) => {
              setAddress(event.target.value);
              setAddressError(null);
            },
            onKeyDown: onFieldKeyDown,
            placeholder: linkEditMessages.pasteALink(),
            autoComplete: 'off',
            autoCapitalize: 'off',
            autoCorrect: 'off',
            spellCheck: false,
          }),
          addressError !== null &&
            jsx(FieldError, {
              match: true,
              children: jsx('span', {
                role: 'alert',
                children: addressError === 'tooLong' ? linkEditMessages.linkTooLong() : linkEditMessages.notALink(),
              }),
            }),
        ],
      }),
      jsxs('div', {
        className: 'flex justify-end gap-sm',
        children: [
          jsx(Button, {
            onClick: onShut,
            children: linkEditMessages.cancel(),
          }),
          jsx(Button, {
            variant: 'primary',
            disabled: !canSave,
            onClick: save,
            children: linkEditMessages.save(),
          }),
        ],
      }),
    ],
  });
}
export const editLinkLabel = sheetMessages.editLink;
export const LINK_FORM_ATTR = 'data-is-link-form';
export const LINK_POPUP_TAB_STOPS_SELECTOR = 'input,button:not(:disabled)';
export const isComposingKeyEvent = (event?: Dynamic) => event.nativeEvent.isComposing || event.keyCode === 229;
export const LinkEditPopup = React.memo(function ({
  form: form,
  anchor: anchor,
  whatHasCaretAfter: whatHasCaretAfter,
  onSaved: onSaved,
  onShut: onShut,
}: Dynamic) {
  let isOpen = form !== null;
  let [lastForm, setLastForm] = React.useState(form);
  if (form !== null && form !== lastForm) setLastForm(form);
  let bottomInset = useBottomInsetWhileOpen(isOpen, false);
  let [wasOpen, setWasOpen] = React.useState(false);
  let [isJustOpened, setJustOpened] = React.useState(false);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    setJustOpened(isOpen);
  }
  React.useEffect(() => {
    if (!isJustOpened) return;
    let timer = setTimeout(() => setJustOpened(false), PRESS_TOO_SOON_MS);
    return () => clearTimeout(timer);
  }, [isJustOpened]);
  let textFieldRef = React.useRef(null);
  let hasTextBeenFocusedRef = React.useRef(false);
  let initialFocus = React.useCallback(() => ((hasTextBeenFocusedRef.current = false), textFieldRef.current), []);
  let { isGivenUp: isGivenUp, holdPopup: holdPopup, noteFocus: noteFocus } = usePopupGivenUpOnBlur(isOpen, onShut);
  let onFieldFocus = ({ target: target }: Dynamic) => {
    noteFocus();
    if (!hasTextBeenFocusedRef.current && target === textFieldRef.current) textFieldRef.current.select();
    hasTextBeenFocusedRef.current = true;
  };
  let onPopupKeyDown = (event?: Dynamic) => {
    if (isComposingKeyEvent(event)) return;
    let isEnterTooSoon = event.key === 'Enter' && (event.repeat || isJustOpened);
    if (event.key === 'Escape' || isEnterTooSoon) {
      event.preventDefault();
      event.stopPropagation();
      return isEnterTooSoon ? undefined : onShut();
    }
    if (
      (IS_APPLE_PLATFORM ? event.metaKey : isCommandHeld(event)) &&
      !event.shiftKey &&
      !event.altKey &&
      latinKeyOf(event, true).toLowerCase() === 'k'
    )
      event.preventDefault();
    if (event.key !== 'Tab' || event.ctrlKey || event.metaKey) return;
    let tabStops = Array.from<Dynamic>(event.currentTarget.querySelectorAll(LINK_POPUP_TAB_STOPS_SELECTOR));
    let focusedIndex = tabStops.findIndex((element?: Dynamic) => element === element.ownerDocument.activeElement);
    let nextIndex = event.shiftKey ? Math.max(focusedIndex, 0) - 1 : focusedIndex + 1;
    event.preventDefault();
    event.stopPropagation();
    tabStops[(nextIndex + tabStops.length) % tabStops.length]?.focus();
  };
  return jsxs(Popover.Root, {
    open: isOpen && !isGivenUp,
    onOpenChange: (willOpen?: Dynamic) => {
      if (!willOpen && !isJustOpened) onShut();
    },
    children: [
      isOpen &&
        isJustOpened &&
        jsx('div', {
          role: 'presentation',
          className: 'fixed inset-0',
          onMouseDown: (event?: Dynamic) => event.preventDefault(),
          onPointerDown: (input?: Dynamic) => input.stopPropagation(),
        }),
      jsx(Popover.Popup, {
        ref: holdPopup,
        ...{
          [LINK_FORM_ATTR]: true,
        },
        anchor: anchor,
        side: 'top',
        align: 'start',
        sideOffset: 8,
        collisionPadding: popupCollisionPadding(bottomInset),
        'aria-label': lastForm?.hasLink === true ? editLinkLabel() : linkEditMessages.insertLink(),
        initialFocus: initialFocus,
        finalFocus: whatHasCaretAfter,
        onFocus: onFieldFocus,
        onKeyDownCapture: onPopupKeyDown,
        onBlur: ({ currentTarget: currentTarget, relatedTarget: relatedTarget }: Dynamic) => {
          if (!isJustOpened && relatedTarget !== null && !currentTarget.contains(relatedTarget)) onShut();
        },
        onMouseDownCapture: (event?: Dynamic) => {
          if (isJustOpened) event.preventDefault();
        },
        onClickCapture: (event?: Dynamic) => {
          if (!isJustOpened) return;
          event.preventDefault();
          event.stopPropagation();
        },
        className: 'w-90 max-w-[var(--available-width)]',
        children:
          lastForm !== null &&
          jsx(
            LinkEditForm,
            {
              form: lastForm,
              addressField: textFieldRef,
              onSaved: onSaved,
              onShut: onShut,
            },
            `${lastForm.cellId.sheetId} ${lastForm.cellId.rowId} ${lastForm.cellId.columnId} ${lastForm.inEntry?.start} ${lastForm.inEntry?.end}`,
          ),
      }),
    ],
  });
});
