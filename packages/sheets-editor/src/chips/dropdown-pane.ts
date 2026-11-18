import { TextInput } from '../kit/text-input.tsx';
import { FieldRoot } from '../kit/field.tsx';
import { Switch } from '../kit/switch.tsx';
import { Menu } from '../kit/menu.tsx';
import { Popover } from '../kit/popover.tsx';
import { Tooltip, TooltipGroup } from '../kit/tooltip.tsx';
import { Button } from '../kit/button.tsx';
import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import {
  ELLIPSIS_INPUT_CLASSES,
  PaneTableButton,
  PaneRow,
  focusPaneStart,
  revealInSidePane,
  useSidePaneCaret,
  SidePane,
  PaneEmptyState,
  PaneSection,
  PaneButton,
  PANE_START_ATTRIBUTE,
  PaneSelect,
} from '../ui/side-pane/side-pane.ts';
import { dropdownPaneMessages } from '../i18n/format-labels.ts';
import { whenBlurredToNothing } from '../grid/focus-left.ts';
import { MenuTriggerButton } from '../ui/menu-trigger.ts';
import {
  dropdownPresetButtonLabel,
  dropdownPresetName,
  localizeDropdownPreset,
  reorderOptionLabel,
  removeOptionLabel,
  optionNumberLabel,
  optionColorButtonHeardAs,
  optionColorButtonLabel,
  optionColorName,
  optionAlreadyExistsText,
  dropdownCellsRefusalText,
  dropdownCellsButtonLabel,
  onlyCellsLabel,
} from '../i18n/chip-labels.ts';
import { DROPDOWN_OPTION_SETS } from './dropdown-presets.ts';
import { fillPaintStyle, textPaintStyle } from '../grid/cell-drawing.ts';
import { setSwatchColors, cachedOptionChipColors } from '../format/cell-colors.ts';
import { REORDER_LIFT_PROPS, useReorderRows } from '../ui/reorder-rows.ts';
import { labelsOfPastedText } from './dropdown-pane-edits.ts';
import { isCopiedFromSheets } from '../clipboard/formats.ts';
import { DROPDOWN_COLOR_CHOICES } from './dropdown-colors.ts';
import { colorsEqual, colorKey } from '../model/colors.ts';
import { popupPropsUnderHeader } from '../shell/bottom-insets.ts';
import { COLOR_POPUP_PADDING, SheetColorPicker } from '../format/color-picker.ts';
import { useCoarsePointer } from '../app/media-queries.ts';
import { preventMouseDownDefault } from '../ui/dom-events.ts';
import { describeWhyNot } from '../ui/why-not.ts';
import { ContentsBox } from '../ui/contents-box.ts';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
import { noticeText } from '../i18n/notice-labels.ts';
export function optionFieldIndexToFocus(fieldToFocus?: Dynamic, options?: Dynamic) {
  if (fieldToFocus === 'lastField') return options.length - 1;
  if (fieldToFocus === 'optionToCome') return options.at(-1)?.optionId === null ? options.length - 1 : -1;
  return options.findLastIndex(({ optionId: optionId }: Dynamic) => optionId !== null && !fieldToFocus.lastOptionNotAmong.has(optionId));
}
export function optionFieldArrowMove({ key: key, isWithAnotherKey: isWithAnotherKey }: Dynamic) {
  if (isWithAnotherKey) return null;
  if (key === 'ArrowUp') return 'goesToNameAbove';
  if (key === 'ArrowDown') return 'goesToNameBelow';
  return null;
}
export function doesOptionRowBlurEnter({
  isToCome: isToCome,
  isNamed: isNamed,
  wasInNameField: wasInNameField,
  goesTo: goesTo,
  isButtonPressed: isButtonPressed,
  isColorPickerOpen: isColorPickerOpen,
}: Dynamic) {
  if (!isToCome) return wasInNameField;
  if (isColorPickerOpen || goesTo === 'ownRow') return false;
  return goesTo === 'elsewhere' || (isNamed && !isButtonPressed);
}
export function DropdownCellsField({
  ownRange: ownRange,
  cellsTyped: cellsTyped,
  whyNotSaidBy: whyNotSaidBy,
  fieldRef: fieldRef,
  onAct: onAct,
  onEntered: onEntered,
}: Dynamic) {
  return jsx(TextInput, {
    ref: fieldRef,
    fullWidth: true,
    className: ELLIPSIS_INPUT_CLASSES,
    'aria-label': dropdownPaneMessages.cells(),
    'aria-describedby': whyNotSaidBy ?? undefined,
    autoComplete: 'off',
    autoCapitalize: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    value: cellsTyped ?? ownRange,
    slotEnd: jsx(PaneTableButton, {
      name: dropdownPaneMessages.useSelection(),
      onPressed: () =>
        onAct({
          kind: 'useSelection',
        }),
    }),
    onChange: (input?: Dynamic) =>
      onAct({
        kind: 'typeCells',
        text: input.target.value,
      }),
    onBlur: ({ relatedTarget: relatedTarget, currentTarget: currentTarget }: Dynamic) => {
      if (relatedTarget !== null)
        onAct({
          kind: 'enterCells',
        });
      else
        whenBlurredToNothing(
          currentTarget,
          () =>
            onAct({
              kind: 'enterCells',
            }),
        );
    },
    onKeyDown: (event?: Dynamic) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        onAct(
          {
            kind: 'enterCells',
          },
          (isEntered?: Dynamic) => {
            if (isEntered) onEntered();
          },
        );
      }
      if (event.key === 'Escape' && cellsTyped !== null) {
        event.preventDefault();
        event.stopPropagation();
        onAct({
          kind: 'dropTypedCells',
        });
      }
    },
  });
}
export function DropdownPresetMenu({ chosen: chosen, blankField: blankField, onAct: onAct }: Dynamic) {
  return jsxs(Menu.Root, {
    children: [
      jsx(MenuTriggerButton, {
        variant: 'ghost',
        size: 'xs',
        'aria-label': dropdownPresetButtonLabel(chosen),
        className: 'text-secondary',
        chevron: 'toolbar',
        children: chosen === 'custom' ? dropdownPaneMessages.customOptions() : dropdownPresetName(chosen),
      }),
      jsx(Menu.Popup, {
        align: 'end',
        finalFocus: () => blankField() ?? true,
        onKeyDownCapture: (event?: Dynamic) => {
          if (!event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          event.stopPropagation();
        },
        children: jsxs(Menu.Group, {
          'aria-label': dropdownPaneMessages.startFrom(),
          children: [
            DROPDOWN_OPTION_SETS.map(
              (presetSet?: Dynamic) =>
                jsx(
                  Menu.Item,
                  {
                    checked: chosen === presetSet.key,
                    checkedRole: 'radio',
                    checkPosition: 'trailing',
                    onClick: () =>
                      onAct({
                        kind: 'startFrom',
                        set: localizeDropdownPreset(presetSet),
                      }),
                    children: jsxs('span', {
                      className: 'flex min-w-32 items-center justify-between gap-4',
                      children: [
                        dropdownPresetName(presetSet.key),
                        jsx('span', {
                          'aria-hidden': true,
                          className: 'flex gap-[3px]',
                          children: presetSet.options.map(
                            ({ key: key, color: color }: Dynamic) =>
                              jsx(
                                'span',
                                {
                                  className: 'sheet-swatch sheet-swatch-of-set',
                                  'data-has-fill': true,
                                  style: fillPaintStyle(setSwatchColors(color)),
                                },
                                key,
                              ),
                          ),
                        }),
                      ],
                    }),
                  },
                  presetSet.key,
                ),
            ),
            jsx(Menu.Separator, {}),
            jsx(Menu.Item, {
              checked: chosen === 'custom',
              checkedRole: 'radio',
              checkPosition: 'trailing',
              onClick: () =>
                onAct({
                  kind: 'startFrom',
                  set: 'custom',
                }),
              children: dropdownPaneMessages.customOptions(),
            }),
          ],
        }),
      }),
    ],
  });
}
export function swallowHeldEnterAfterRemove(view?: Dynamic) {
  let keyEventTypes = ['keydown', 'keypress', 'keyup'];
  let swallowHeldEnter = (event?: Dynamic) => {
    if (event.type !== 'keypress' && !event.repeat)
      for (let eventType of keyEventTypes as Dynamic) view?.removeEventListener(eventType, swallowHeldEnter, true);
    else if (event.key === 'Enter') event.preventDefault();
  };
  for (let eventType of keyEventTypes as Dynamic) view?.addEventListener(eventType, swallowHeldEnter, true);
}
export function DropdownOptionRow({
  option: option,
  index: index,
  whyNameIsRefused: whyNameIsRefused,
  isBeingTyped: isBeingTyped,
  isAlone: isAlone,
  isLast: isLast,
  pressedLast: pressedLast,
  isPickerOpen: isPickerOpen,
  isOnTouch: isOnTouch,
  whatColorPickerShows: whatColorPickerShows,
  onAct: onAct,
  onOpenPickerChange: onOpenPickerChange,
  reorder: reorder,
  keysThatMoveSaidBy: keysThatMoveSaidBy,
  onRemoved: onRemoved,
  onNamesPasted: onNamesPasted,
  onArrowed: onArrowed,
  onEntered: onEntered,
}: Dynamic) {
  let { optionId: optionId } = option;
  let optionNumber = index + 1;
  let { className: className, ...rowProps } = reorder.ofRow(optionId, index);
  let nameRefusalId = React.useId();
  let isMovable = !isAlone && optionId !== null;
  let handleLabel = reorderOptionLabel(optionNumber, option.label);
  let reorderHandle = jsx(
    'span',
    {
      className: isMovable ? 'flex' : 'invisible flex',
      children: jsx(Tooltip, {
        content: handleLabel,
        ...(reorder.areTooltipsOfHandlesShut
          ? {
              open: false,
            }
          : {}),
        children: jsx(Button, {
          variant: 'ghost',
          ...(!isOnTouch && {
            size: 'xs',
          }),
          iconOnly: true,
          icon: jsx(Icon, {
            name: 'Reorder',
            size: 'xs',
            className:
              'text-muted group-hover/option:text-primary group-has-focus-visible/option:text-primary group-data-reorder/option:text-primary touch:text-primary',
          }),
          'aria-label': handleLabel,
          'aria-describedby': keysThatMoveSaidBy,
          tooltip: false,
          ...(isMovable && {
            'data-handle-of': optionId,
            ...reorder.ofHandle(optionId, index),
          }),
        }),
      }),
    },
    isMovable ? 'handle' : 'standIn',
  );
  return jsxs('li', {
    ...rowProps,
    'data-size': isOnTouch ? 'lg' : undefined,
    className: `group/option ${className} ${optionId === null ? 'starting:opacity-0' : ''}`,
    children: [
      optionId !== null &&
        jsx('span', {
          ...REORDER_LIFT_PROPS,
        }),
      jsxs('div', {
        role: 'presentation',
        onBlur: (event?: Dynamic) => {
          let row = event.currentTarget;
          if (!row.contains(event.target)) return;
          let [nextFocus, pressedLastElement] = [event.relatedTarget, pressedLast.current];
          if (
            !doesOptionRowBlurEnter({
              isToCome: optionId === null,
              isNamed: option.label.trim() !== '',
              wasInNameField: event.target instanceof HTMLInputElement,
              goesTo: nextFocus === null ? 'nothing' : row.contains(nextFocus) ? 'ownRow' : 'elsewhere',
              isButtonPressed: pressedLastElement instanceof Element && pressedLastElement.closest('button') !== null,
              isColorPickerOpen: isPickerOpen,
            })
          )
            return;
          let enterOption = () =>
            onAct({
              kind: 'enter',
              optionId: optionId,
              thenStartsOption: false,
            });
          if (event.relatedTarget !== null) enterOption();
          else whenBlurredToNothing(event.target, enterOption);
        },
        children: [
          jsx(TooltipGroup, {
            closeDelay: 0,
            children: jsxs(PaneRow, {
              trailing: jsx(TooltipGroup, {
                closeDelay: 0,
                children: jsx(Button, {
                  variant: 'ghost',
                  iconOnly: true,
                  icon: 'Minus',
                  'aria-label': removeOptionLabel(optionNumber, option.label),
                  className: 'text-secondary',
                  disabled: isAlone,
                  onClick: () =>
                    reorder.gliding(
                      (input?: Dynamic) =>
                        onAct(
                          {
                            kind: 'remove',
                            optionId: optionId,
                          },
                          input,
                        ),
                      (input?: Dynamic) => {
                        if (input) onRemoved(index);
                      },
                    ),
                }),
              }),
              children: [
                jsxs('span', {
                  className: 'flex shrink-0 items-center gap-0.5',
                  children: [
                    reorderHandle,
                    jsx(OptionColorButton, {
                      option: option,
                      number: optionNumber,
                      isPickerOpen: isPickerOpen,
                      isOnTouch: isOnTouch,
                      whatColorPickerShows: whatColorPickerShows,
                      onAct: onAct,
                      onOpenPickerChange: onOpenPickerChange,
                    }),
                  ],
                }),
                jsx(FieldRoot, {
                  invalid: whyNameIsRefused !== null,
                  className: 'min-w-0 flex-1',
                  children: jsx(TextInput, {
                    fullWidth: true,
                    'aria-label': optionNumberLabel(optionNumber),
                    'aria-describedby': whyNameIsRefused === null ? undefined : nameRefusalId,
                    placeholder: dropdownPaneMessages.option(),
                    autoComplete: 'off',
                    autoCorrect: 'off',
                    spellCheck: false,
                    value: option.label,
                    onChange: (input?: Dynamic) =>
                      onAct({
                        kind: 'type',
                        optionId: optionId,
                        label: input.target.value,
                      }),
                    onPaste: (event?: Dynamic) => {
                      let [firstName, ...otherNames] = labelsOfPastedText(
                        event.clipboardData.getData('text'),
                        isCopiedFromSheets(event.clipboardData.getData('text/html')),
                      );
                      if (firstName === undefined || otherNames.length === 0) return;
                      event.preventDefault();
                      let { value: fieldText, selectionStart: selectionStart, selectionEnd: selectionEnd } = event.currentTarget;
                      let pastedName =
                        fieldText.slice(0, selectionStart ?? fieldText.length) + firstName + fieldText.slice(selectionEnd ?? fieldText.length);
                      onNamesPasted([pastedName, ...otherNames]);
                    },
                    onKeyDown: (event?: Dynamic) => {
                      if (event.nativeEvent.isComposing || event.keyCode === 229) {
                        event.stopPropagation();
                        return;
                      }
                      if (event.key === 'Escape' && isBeingTyped) {
                        event.preventDefault();
                        event.stopPropagation();
                        onAct({
                          kind: 'dropTyped',
                        });
                        return;
                      }
                      let arrowMove = optionFieldArrowMove({
                        key: event.key,
                        isWithAnotherKey: event.altKey || event.ctrlKey || event.metaKey || event.shiftKey,
                      });
                      if (arrowMove !== null) {
                        if (onArrowed(index, arrowMove === 'goesToNameAbove' ? -1 : 1)) event.preventDefault();
                        return;
                      }
                      if (!(event.key === 'Enter' && !event.metaKey && !event.ctrlKey)) return;
                      event.preventDefault();
                      if (event.repeat || option.label.trim() === '') return;
                      if (!isLast) return onEntered(index);
                      reorder.gliding(
                        (input?: Dynamic) =>
                          onAct(
                            {
                              kind: 'enter',
                              optionId: optionId,
                              thenStartsOption: true,
                            },
                            input,
                          ),
                        (input?: Dynamic) => {
                          if (input) onEntered(index);
                        },
                      );
                    },
                  }),
                }),
              ],
            }),
          }),
          whyNameIsRefused !== null &&
            jsx('p', {
              id: nameRefusalId,
              className: 'ps-lg pe-md pb-1 text-footnote text-danger',
              children: whyNameIsRefused,
            }),
        ],
      }),
    ],
  });
}
export const optionRowKey = ({ optionId: optionId }: Dynamic) => optionId ?? 'toCome';
export const OptionColorButton = React.memo(function ({
  option: option,
  number: number,
  isPickerOpen: isPickerOpen,
  isOnTouch: isOnTouch,
  whatColorPickerShows: whatColorPickerShows,
  onAct: onAct,
  onOpenPickerChange: onOpenPickerChange,
}: Dynamic) {
  let { optionId: optionId, label: label, color: color } = option;
  let swatchPaints = cachedOptionChipColors(color);
  let triggerRef = React.useRef(null);
  let [isCustomColorOpen, setIsCustomColorOpen] = React.useState(false);
  if (!isPickerOpen && isCustomColorOpen) setIsCustomColorOpen(false);
  let isOpenChangeSwallowedRef = React.useRef(false);
  return jsxs(Fragment, {
    children: [
      jsxs(Menu.Root, {
        open: isPickerOpen && !isCustomColorOpen,
        onOpenChange: (isOpen?: Dynamic) => {
          let isSwallowed = isOpenChangeSwallowedRef.current;
          isOpenChangeSwallowedRef.current = false;
          if (!isSwallowed) onOpenPickerChange(isOpen ? optionRowKey(option) : null);
        },
        children: [
          jsx(Menu.Trigger, {
            render: jsx(Button, {
              ref: triggerRef,
              variant: 'ghost',
              ...(!isOnTouch && {
                size: 'sm',
              }),
              iconOnly: true,
              'aria-label': optionColorButtonHeardAs(number, color),
              'data-colors-option': true,
              tooltip: optionColorButtonLabel(number),
              icon: jsx('span', {
                className: 'sheet-swatch sheet-swatch-of-option',
                'data-has-fill': color.kind !== 'none' || undefined,
                style: {
                  ...fillPaintStyle(swatchPaints.fill),
                  ...textPaintStyle(swatchPaints.text),
                },
              }),
            }),
          }),
          jsxs(Menu.Popup, {
            align: 'start',
            onKeyDownCapture: (event?: Dynamic) => {
              if (!event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
              event.stopPropagation();
            },
            children: [
              jsx(Menu.Group, {
                'aria-label': optionColorButtonLabel(number),
                children: DROPDOWN_COLOR_CHOICES.map((colorChoice?: Dynamic) => {
                  let choicePaints = cachedOptionChipColors(colorChoice);
                  let colorName = optionColorName(colorChoice);
                  return jsx(
                    Menu.Item,
                    {
                      label: colorName,
                      checked: colorsEqual(color, colorChoice),
                      checkedRole: 'radio',
                      checkPosition: 'trailing',
                      onClick: () =>
                        onAct({
                          kind: 'setColor',
                          optionId: optionId,
                          color: colorChoice,
                        }),
                      children: jsxs('span', {
                        className: 'flex min-w-32 items-center gap-2',
                        children: [
                          jsx('span', {
                            'aria-hidden': true,
                            className: 'sheet-swatch sheet-swatch-of-option flex-none',
                            'data-has-fill': colorChoice.kind !== 'none' || undefined,
                            style: {
                              ...fillPaintStyle(choicePaints.fill),
                              ...textPaintStyle(choicePaints.text),
                            },
                          }),
                          colorName,
                        ],
                      }),
                    },
                    colorKey(colorChoice),
                  );
                }),
              }),
              jsx(Menu.Separator, {}),
              jsx(Menu.Item, {
                onClick: () => {
                  isOpenChangeSwallowedRef.current = true;
                  setIsCustomColorOpen(true);
                },
                children: jsxs('span', {
                  className: 'flex items-center gap-2',
                  children: [
                    jsx('span', {
                      className: 'grid w-4 place-items-center',
                      children: jsx(Icon, {
                        name: 'Palette',
                        size: 'sm',
                      }),
                    }),
                    dropdownPaneMessages.moreColors(),
                  ],
                }),
              }),
            ],
          }),
        ],
      }),
      jsx(Popover.Root, {
        open: isPickerOpen && isCustomColorOpen,
        onOpenChange: (input?: Dynamic) => {
          if (!input) onOpenPickerChange(null);
        },
        children: jsx(Popover.Popup, {
          ...popupPropsUnderHeader(),
          anchor: triggerRef,
          side: 'bottom',
          align: 'start',
          padding: COLOR_POPUP_PADDING,
          'aria-label': optionColorButtonLabel(number),
          finalFocus: () => triggerRef.current ?? true,
          children: jsx(SheetColorPicker, {
            property: 'fillColor',
            color: color,
            whatIsColored: {
              kind: 'option',
              label: label.trim() === '' ? dropdownPaneMessages.option() : label,
            },
            whatItShows: whatColorPickerShows,
            onChosen: (input?: Dynamic) =>
              onAct({
                kind: 'setColor',
                optionId: optionId,
                color: input,
              }),
            onDone: () => onOpenPickerChange(null),
          }),
        }),
      }),
    ],
  });
});
export const DropdownPane = React.memo(function ({
  isOpen: isOpen,
  editor: editor,
  timesAsked: timesAsked,
  paneRef: paneRef,
  takesNoTyping: takesNoTyping,
  paneWidth: paneWidth,
  onPaneWidthChange: onPaneWidthChange,
  onKeyDownInPane: onKeyDownInPane,
  whatHasCaretAfter: whatHasCaretAfter,
  wasPointerPressedLast: wasPointerPressedLast,
  whatColorPickerShows: whatColorPickerShows,
  onAct: onAct,
  onShut: onShut,
}: Dynamic) {
  let [openPickerOf, setOpenPickerOf] = React.useState(null);
  let isOnTouch = useCoarsePointer();
  if (editor === null && openPickerOf !== null) setOpenPickerOf(null);
  let optionsListRef = React.useRef(null);
  let addButtonRef = React.useRef(null);
  let caretTargetRef = React.useRef(null);
  let cellsFieldRef = React.useRef(null);
  let pressCountRef = React.useRef(0);
  let pressedLastRef = React.useRef(null);
  React.useEffect(() => {
    if (!isOpen) return;
    let paneDocument = paneRef.current?.ownerDocument;
    let notePress = ({ target: target }: Dynamic) => {
      pressCountRef.current += 1;
      pressedLastRef.current = target;
    };
    paneDocument?.addEventListener('pointerdown', notePress, true);
    paneDocument?.addEventListener('click', notePress, true);
    return () => {
      paneDocument?.removeEventListener('pointerdown', notePress, true);
      paneDocument?.removeEventListener('click', notePress, true);
    };
  }, [isOpen, paneRef]);
  let actAndKeepCaret = React.useCallback(
    (act?: Dynamic, onDone?: Dynamic) => {
      if (onDone === undefined) return onAct(act);
      let paneDocument = paneRef.current?.ownerDocument;
      let [pressCountBefore, focusedBefore] = [pressCountRef.current, paneDocument?.activeElement];
      return onAct(act, (isDone?: Dynamic) => {
        onDone(isDone);
        if (pressCountRef.current !== pressCountBefore && paneDocument?.activeElement !== focusedBefore) caretTargetRef.current = null;
      });
    },
    [onAct, paneRef],
  );
  let putCaretAtStart = () => {
    let blankField = [...(optionsListRef.current?.getElementsByTagName('input') ?? [])].find(
      (input?: Dynamic) => input.value === '',
    );
    if (blankField !== undefined)
      blankField.focus({
        preventScroll: true,
      });
    else
      focusPaneStart(paneRef.current, 'start', {
        isByPointer: wasPointerPressedLast(),
      });
  };
  React.useLayoutEffect(() => {
    let [caretTarget, optionsList] = [caretTargetRef.current, optionsListRef.current];
    caretTargetRef.current = null;
    if (caretTarget === null || optionsList === null) return;
    if (caretTarget === 'cellsField')
      return cellsFieldRef.current?.focus({
        preventScroll: true,
      });
    if (typeof caretTarget === 'object' && 'handleOf' in caretTarget) {
      let match = [...optionsList.querySelectorAll('[data-handle-of]')].find(
        (input?: Dynamic) => input.dataset.handleOf === caretTarget.handleOf,
      );
      match?.focus({
        preventScroll: true,
      });
      if (match !== undefined) revealInSidePane(paneRef.current, match);
      return;
    }
    let nameFields = optionsList.getElementsByTagName('input');
    if (typeof caretTarget === 'object' && 'colorButtonAt' in caretTarget) {
      let value = optionsList.querySelectorAll('[data-colors-option]');
      let value2 = value[caretTarget.colorButtonAt] ?? value[caretTarget.colorButtonAt - 1];
      let value3 = nameFields.length === 1 && !isOnTouch ? nameFields[0] : undefined;
      let focusTarget = value3 ?? value2 ?? addButtonRef.current;
      focusTarget?.focus({
        preventScroll: true,
        focusVisible: !wasPointerPressedLast(),
      });
      if (value3 !== undefined && value3 === value3.ownerDocument.activeElement) value3.setSelectionRange(value3.value.length, value3.value.length);
      if (focusTarget !== null) revealInSidePane(paneRef.current, focusTarget, true);
      return;
    }
    let fieldIndex = optionFieldIndexToFocus(caretTarget, editor?.options ?? []);
    if (caretTarget === 'optionToCome' && fieldIndex === -1) return;
    if (caretTarget !== 'lastField' && fieldIndex === -1) {
      let { nameTypedFor: value = null, nameTaken: value2 = null, refused: value3 = null } = editor ?? {};
      if (value !== null && value2 === null && value3 === null) caretTargetRef.current = optionsList.ownerDocument.hasFocus() ? caretTarget : null;
      return;
    }
    let fieldAt = nameFields[fieldIndex];
    let fieldTarget = fieldAt ?? addButtonRef.current;
    fieldTarget?.focus({
      preventScroll: true,
    });
    if (fieldAt !== undefined && fieldAt === fieldAt.ownerDocument.activeElement)
      fieldAt.setSelectionRange(fieldAt.value.length, fieldAt.value.length);
    if (fieldTarget !== null) revealInSidePane(paneRef.current, fieldTarget);
  });
  let optionCount = editor?.options.length ?? 0;
  let lastOptionCountRef = React.useRef(optionCount);
  React.useLayoutEffect(() => {
    if (lastOptionCountRef.current === optionCount) return;
    let isShrunk = optionCount < lastOptionCountRef.current;
    lastOptionCountRef.current = optionCount;
    let activeElement = optionsListRef.current?.ownerDocument.activeElement ?? null;
    if (activeElement !== null && optionsListRef.current?.contains(activeElement) === true)
      revealInSidePane(paneRef.current, activeElement, isShrunk);
  });
  let options = editor?.options ?? [];
  let optionIds = options.flatMap(({ optionId: optionId }: Dynamic) => (optionId === null ? [] : [optionId]));
  let reorder = useReorderRows({
    listRef: optionsListRef,
    keys: optionIds,
    onMoved: (optionId?: Dynamic, toIndex?: Dynamic, onDone?: Dynamic) =>
      actAndKeepCaret(
        {
          kind: 'move',
          optionId: optionId,
          toIndex: toIndex,
        },
        (isMoved?: Dynamic) => {
          if (isMoved)
            caretTargetRef.current = {
              handleOf: optionId,
            };
          onDone(isMoved);
        },
      ),
  });
  let keysHintId = React.useId();
  let optionColorsLabelId = React.useId();
  let cellsRefusalId = React.useId();
  useSidePaneCaret({
    isOpen: isOpen,
    timesAsked: timesAsked,
    paneRef: paneRef,
    putCaretWhereToStart: putCaretAtStart,
    whatHasCaretAfter: whatHasCaretAfter,
  });
  if (!isOpen) return null;
  let paneFrameProps = {
    ref: paneRef,
    title: dropdownPaneMessages.paneTitle(),
    takesNoTyping: takesNoTyping,
    width: paneWidth,
    onWidthChange: onPaneWidthChange,
    onClose: onShut,
    onKeyDown: onKeyDownInPane,
    wasPointerPressedLast: wasPointerPressedLast,
  };
  if (editor === null)
    return jsx(SidePane, {
      ...paneFrameProps,
      children: jsx(PaneEmptyState, {
        title: dropdownPaneMessages.selectCellWithDropdown(),
        hint: dropdownPaneMessages.optionsWillAppearHere(),
      }),
    });
  let {
    nameTypedFor: nameTypedFor,
    nameTaken: nameTaken,
    canAddOption: canAddOption,
    colorOfferedForEveryOption: colorOfferedForEveryOption,
    ownRange: ownRange,
    cellsRefused: cellsRefused,
    cellsTyped: cellsTyped,
    isMade: isMade,
    headerRow: headerRow,
    otherRanges: otherRanges,
    reach: reach,
    startedFrom: startedFrom,
    refused: refused,
  } = editor;
  let isHeadingRefused = cellsRefused?.why === 'headingIsNoOption';
  let rangesText = [ownRange, ...otherRanges].join(', ');
  let keepCaretInBlankOption = (event?: Dynamic) => {
    let lastOption = options.at(-1);
    if (optionIds.length === 0 || lastOption?.optionId !== null || lastOption.label.trim() !== '') return;
    let activeElement = event.currentTarget.ownerDocument.activeElement;
    if (optionsListRef.current?.lastElementChild?.contains(activeElement) === true) preventMouseDownDefault(event);
  };
  return jsxs(SidePane, {
    ...paneFrameProps,
    children: [
      jsxs(PaneSection, {
        title: dropdownPaneMessages.options(),
        actions: jsxs(Fragment, {
          children: [
            jsx(DropdownPresetMenu, {
              chosen: startedFrom,
              blankField: () =>
                [...(optionsListRef.current?.getElementsByTagName('input') ?? [])].find((input?: Dynamic) => input.value === '') ?? null,
              onAct: actAndKeepCaret,
            }),
            jsx(PaneButton, {
              ref: addButtonRef,
              variant: 'ghost',
              iconOnly: true,
              icon: 'Add',
              'aria-label': dropdownPaneMessages.addOption(),
              className: 'text-secondary',
              ...(startedFrom === 'custom' && {
                [PANE_START_ATTRIBUTE]: true,
              }),
              disabled: !canAddOption,
              disabledReason: describeWhyNot(dropdownPaneMessages.addOption(), canAddOption ? null : dropdownPaneMessages.mostOptionsReached()),
              onClick: () =>
                actAndKeepCaret(
                  {
                    kind: 'startOption',
                  },
                  (isStarted?: Dynamic) => {
                    if (isStarted) caretTargetRef.current = 'optionToCome';
                  },
                ),
            }),
          ],
        }),
        children: [
          jsx('ul', {
            ref: optionsListRef,
            className: 'flex flex-col',
            children: options.map(
              (option?: Dynamic, index?: Dynamic) =>
                jsx(
                  DropdownOptionRow,
                  {
                    option: option,
                    index: index,
                    whyNameIsRefused:
                      nameTaken !== null && nameTaken.ofOptionId === option.optionId ? optionAlreadyExistsText(nameTaken.label) : null,
                    isBeingTyped: nameTypedFor !== null && nameTypedFor.optionId === option.optionId,
                    isAlone: optionIds.length <= 1,
                    isLast: index === options.length - 1,
                    pressedLast: pressedLastRef,
                    isPickerOpen: openPickerOf === optionRowKey(option),
                    isOnTouch: isOnTouch,
                    whatColorPickerShows: whatColorPickerShows,
                    onAct: actAndKeepCaret,
                    onOpenPickerChange: setOpenPickerOf,
                    reorder: reorder,
                    keysThatMoveSaidBy: keysHintId,
                    onRemoved: (removedAt?: Dynamic) => {
                      caretTargetRef.current = {
                        colorButtonAt: removedAt,
                      };
                      swallowHeldEnterAfterRemove(optionsListRef.current?.ownerDocument.defaultView ?? null);
                    },
                    onNamesPasted: (labels?: Dynamic) => {
                      let optionIdsBefore = new (Set as Dynamic)(optionIds);
                      actAndKeepCaret(
                        {
                          kind: 'pasteNames',
                          optionId: option.optionId,
                          labels: labels,
                        },
                        (isPasted?: Dynamic) => {
                          if (isPasted)
                            caretTargetRef.current = {
                              lastOptionNotAmong: optionIdsBefore,
                            };
                        },
                      );
                    },
                    onArrowed: (index2?: Dynamic, step?: Dynamic) => {
                      let nextField = optionsListRef.current?.getElementsByTagName('input').item(index2 + step);
                      if (nextField === null || nextField === undefined) return false;
                      nextField.focus({
                        preventScroll: true,
                      });
                      nextField.setSelectionRange(nextField.value.length, nextField.value.length);
                      revealInSidePane(paneRef.current, nextField);
                      return true;
                    },
                    onEntered: (index2?: Dynamic) => {
                      let nameFields = optionsListRef.current?.getElementsByTagName('input');
                      let enteredField = nameFields?.item(index2) ?? null;
                      if (enteredField === null || enteredField !== enteredField.ownerDocument.activeElement) return;
                      let nextField = nameFields?.item(index2 + 1);
                      if (nextField === null || nextField === undefined) caretTargetRef.current = 'lastField';
                      else nextField.focus();
                    },
                  },
                  optionRowKey(option),
                ),
            ),
          }),
          jsx(ContentsBox, {
            onMouseDown: keepCaretInBlankOption,
            children: jsx(PaneRow, {
              label: dropdownPaneMessages.colors(),
              children: jsx(Switch, {
                'aria-labelledby': optionColorsLabelId,
                size: 'sm',
                checked: colorOfferedForEveryOption !== 'automatic',
                disabled: colorOfferedForEveryOption === null,
                onCheckedChange: (input?: Dynamic) =>
                  actAndKeepCaret({
                    kind: 'setColorOfEveryOption',
                    to: input ? 'automatic' : 'none',
                  }),
              }),
            }),
          }),
          jsx('span', {
            id: optionColorsLabelId,
            hidden: true,
            children: dropdownPaneMessages.optionColors(),
          }),
          jsx('span', {
            id: keysHintId,
            hidden: true,
            children: dropdownPaneMessages.keysThatMoveOption(),
          }),
          jsx(LiveAnnouncer, {
            words: nameTaken !== null && optionAlreadyExistsText(nameTaken.label),
          }),
          jsx(LiveAnnouncer, {
            words: refused !== null && noticeText(refused),
          }),
          jsx(LiveAnnouncer, {
            words: cellsRefused !== null && dropdownCellsRefusalText(cellsRefused),
            timesSaid: cellsRefused?.why === 'headingIsNoOption' ? cellsRefused.timesBefore : 0,
          }),
          refused !== null &&
            jsx(PaneRow, {
              children: jsx('p', {
                'aria-hidden': true,
                className: 'text-footnote text-danger',
                children: noticeText(refused),
              }),
            }),
        ],
      }),
      jsxs(PaneSection, {
        title: dropdownPaneMessages.appliesTo(),
        children: [
          jsx(PaneRow, {
            label: dropdownPaneMessages.cells(),
            children:
              otherRanges.length > 0
                ? jsx(PaneSelect, {
                    name: dropdownCellsButtonLabel(reach === 'everyCell' ? dropdownPaneMessages.everywhere() : onlyCellsLabel(ownRange)),
                    value: reach,
                    items: [
                      {
                        value: 'everyCell',
                        label: dropdownPaneMessages.everywhere(),
                        hint: rangesText,
                      },
                      {
                        value: 'ownStretch',
                        label: onlyCellsLabel(ownRange),
                      },
                    ],
                    onChange: (input?: Dynamic) =>
                      actAndKeepCaret({
                        kind: 'chooseReach',
                        reach: input,
                      }),
                  })
                : !isMade
                  ? jsx('span', {
                      className: 'truncate text-body text-primary',
                      children: ownRange,
                    })
                  : jsx(DropdownCellsField, {
                      ownRange: ownRange,
                      cellsTyped: cellsTyped,
                      whyNotSaidBy: cellsRefused === null || isHeadingRefused ? null : cellsRefusalId,
                      fieldRef: cellsFieldRef,
                      onAct: actAndKeepCaret,
                      onEntered: () => void (caretTargetRef.current = 'cellsField'),
                    }),
          }),
          headerRow !== null &&
            jsx(ContentsBox, {
              onMouseDown: keepCaretInBlankOption,
              children: jsx(PaneRow, {
                label: dropdownPaneMessages.headerRow(),
                children: jsx(Switch, {
                  size: 'sm',
                  checked: headerRow === 'on',
                  'aria-describedby': isHeadingRefused ? cellsRefusalId : undefined,
                  onCheckedChange: (input?: Dynamic) =>
                    actAndKeepCaret({
                      kind: 'setHeaderRow',
                      isOn: input,
                    }),
                }),
              }),
            }),
          cellsRefused !== null &&
            jsx(PaneRow, {
              label: '',
              children: jsx('p', {
                id: cellsRefusalId,
                className: 'text-footnote text-danger',
                children: dropdownCellsRefusalText(cellsRefused),
              }),
            }),
        ],
      }),
    ],
  });
});
