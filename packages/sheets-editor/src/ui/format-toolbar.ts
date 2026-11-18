import { Menu } from '../kit/menu.tsx';
import { Popover } from '../kit/popover.tsx';
import { Toolbar } from '../kit/toolbar.tsx';
import { Button } from '../kit/button.tsx';
import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { usePopupRoomAtFoot, popupPropsUnderHeader } from '../shell/bottom-insets.ts';
import { isTrustedEscapeClose } from '../app/page-guards.ts';
import { swallowPressAfterItemPress, swallowPressAfterTriggerPress, swallowRestOfPress } from './press-swallow.ts';
import { menuTakesCaretOnSmallTouch } from './menu-initial-focus.ts';
import { isTouchBelowSm, useCoarsePointerMedia } from '../app/media-queries.ts';
import { isGridOrGridPopupTrigger } from '../dom/grid-role.ts';
import { toolbarTabStopOf, useToolbarArrowKeysHint } from './toolbar/keys-hint.ts';
import { CONTEXT_BAR_PART_ATTRIBUTE, ToolbarTooltip } from './toolbar-tooltip.ts';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { TypedSearchAnnouncer } from './search-announcer.ts';
import { preventMouseDownDefault, wrapTabFocusInBar } from './dom-events.ts';
import { blockRepeatedEnterOrSpace } from './repeated-key-guards.ts';
import { MenuWithField } from './menu-with-field.ts';
import { useBarIcon, useBarIconSize, BarIconButton, useCoarseBarIconSize, BarSeparator } from './bar-buttons.ts';
import { SplitTool } from './split-tool.ts';
import { disabledWithWhyNot } from './why-not.ts';
import { MenuTriggerButton } from './menu-trigger.ts';
import { usePopupGivenUpOnBlur } from './popup-given-up-on-blur.ts';
import { sheetMessages, textStyleLabel } from '../i18n/sheet-messages.ts';
import { colorButtonLabel, numberFormatChoiceLabel, bordersButtonLabel, textWrappingButtonLabel } from '../i18n/format-labels.ts';
import { COLOR_POPUP_PADDING, SheetColorPicker } from '../format/color-picker.ts';
import {
  COLOR_TOOL_ICONS,
  MERGE_TOOL_ICONS,
  INSERT_ROW_COLUMN_TOOLS,
  CHECKBOX_SETTING_TOOLS,
  TEXT_TOGGLE_ICONS,
} from './search-menu/bar-commands.ts';
import { fillPaintStyle } from '../grid/cell-drawing.ts';
import { shownCellColor } from '../format/cell-colors.ts';
import { NO_COLOR } from '../model/colors.ts';
import { useBarTooltipSide, DecimalPlacesButton } from './toolbar/decimal-places.ts';
import {
  useFoldedTools,
  TOOLS_OF_BAR,
  TOOLBAR_LINES,
  toolNeighbours,
  BarTool,
  BAR_FORM_ATTRIBUTE,
  barForm,
  BarToolsProvider,
} from './toolbar/fold.ts';
import { useSwipedToolRow } from './toolbar/swiped-row.ts';
import { contextToolSlotCount, contextToolsThatFit, contextToolsLeftOver, CONTEXT_TOOLS_IN_ORDER } from './toolbar/context-tools.ts';
import { cellControlsInMenuOrder, numberFormatIconOf, NumberFormatMenuItems, CONTEXT_TOOL_OF_CELL_CONTROL } from './toolbar/number-format-menu.ts';
import { useCustomFormatList, CustomFormatListAnnouncer } from '../format/custom-format-row.ts';
import { numberFormatSearchField } from '../format/number-format-search.ts';
import { useFontSizeField } from './toolbar/font-size-field.ts';
import { TOOLS_WITH_PICKERS, submenuOrWhyOff, isMoreMenuEmpty, MoreToolsMenu } from './toolbar/more-menu.ts';
import { oneRangeActOfCommand } from '../selection/several-ranges.ts';
import { oneRangeNeededText } from '../i18n/notice-labels.ts';
import { SUM_BAR_AGGREGATES } from '../state/transitions.ts';
import { figureNameLabel, insertLinesLabel, insertChipLabel } from '../i18n/grid-action-labels.ts';
import { MenuItemWithWhyOff } from './menu-item-why-off.ts';
import { sortAndFilterMessages } from '../tables/sort-filter-labels.ts';
import { CHART_MESSAGES } from '../charts/chart-words.ts';
import { toolUnavailableText } from '../i18n/chip-labels.ts';
import { DockedBarChoices } from './docked-bar.ts';
import {
  formatToggleShortcut,
  TEXT_ALIGN_ICONS,
  AlignMenuItems,
  FontSizeItems,
  isWrapTextOn,
  wrapTextToggled,
  textWrappingOf,
  TextWrappingItems,
} from './toolbar/text-menus.ts';
import { summarizeAreaBorders } from '../grid/borders.ts';
import { BordersOfBlockIcon, BordersPicker } from '../format/borders-picker.ts';
import { CONDITIONAL_FORMATTING_WORDS } from '../messages/conditional-format.ts';
import { numberFormatButtonLabel, fontSizeButtonLabel, fontSizeText } from '../i18n/menu-labels.ts';
import { DECIMAL_PLACE_CHANGES } from '../format/decimal-places.ts';
export let insertColumnsTool: Dynamic;
export let insertRowsTool: Dynamic;
export function useToolbarPopupFocus({
  isOpen: isOpen,
  side: side,
  onOpenChange: onOpenChange,
  whatHasCaretAfter: whatHasCaretAfter,
  opensListUnderCell = () => false,
  isPickerInItsPlace = false,
  toolbar: toolbar,
  anchor: anchor,
  isAskedByKey = () => false,
  isAskedByKeyFromCells = () => false,
  takesCaretAtOnce = false,
  isMenu = false,
}: Dynamic) {
  let takesCaretNow = takesCaretAtOnce && !isMenu;
  let aboveComposer = usePopupRoomAtFoot(isOpen && side === 'top', () => toolbar.current, takesCaretNow);
  let pressedTargetRef = React.useRef(null);
  let wasOpenedByKeyRef = React.useRef(false);
  let wasAskedFromCellsRef = React.useRef(false);
  let wasOutsidePressRef = React.useRef(false);
  let closeOnUnmount = React.useEffectEvent(() => {
    if (isOpen) onOpenChange(false, null);
  });
  React.useEffect(() => () => closeOnUnmount(), []);
  let [timesLeftOpen, setTimesLeftOpen] = React.useState(0);
  let leaveOnBlur = React.useEffectEvent((event?: Dynamic) => {
    if (!isOpen || takesCaretNow) return;
    setTimesLeftOpen((times?: Dynamic) => times + 1);
    onOpenChange(false, event);
  });
  React.useEffect(() => {
    let view = toolbar.current?.ownerDocument.defaultView ?? null;
    if (view === null) return;
    let onBlur = (event?: Dynamic) => leaveOnBlur(event);
    view.addEventListener('blur', onBlur);
    return () => view.removeEventListener('blur', onBlur);
  }, [toolbar]);
  return {
    timesLeftOpen: timesLeftOpen,
    wasOpenedByKey: () => wasOpenedByKeyRef.current,
    aboveComposer: aboveComposer ?? popupPropsUnderHeader(),
    onRootOpenChange: (open: Dynamic, { reason: reason, event: event }: Dynamic) => {
      pressedTargetRef.current = isTrustedEscapeClose(reason, event) ? event.target : null;
      wasOutsidePressRef.current = reason === 'outside-press';
      swallowPressAfterItemPress(reason, event);
      if (menuTakesCaretOnSmallTouch(toolbar.current) || (takesCaretNow && isTouchBelowSm())) swallowPressAfterTriggerPress(reason, event);
      onOpenChange(open, event);
    },
    initialFocus: (openedBy?: Dynamic) => {
      pressedTargetRef.current = null;
      wasOutsidePressRef.current = false;
      wasAskedFromCellsRef.current = isAskedByKeyFromCells();
      wasOpenedByKeyRef.current = openedBy === 'keyboard' || isAskedByKey() || wasAskedFromCellsRef.current;
      if (wasOpenedByKeyRef.current || takesCaretAtOnce) return true;
      return menuTakesCaretOnSmallTouch(toolbar.current);
    },
    finalFocus: () => {
      if (isPickerInItsPlace && !wasOpenedByKeyRef.current) return false;
      let caretAfter = whatHasCaretAfter();
      if (wasAskedFromCellsRef.current) return caretAfter;
      let pressedTarget = pressedTargetRef.current;
      let goesBackToGrid = wasOpenedByKeyRef.current && !wasOutsidePressRef.current && isCaretBackToGrid(caretAfter, opensListUnderCell());
      let caretGoesElsewhere = (pressedTarget !== null && pressedTarget !== caretAfter) || goesBackToGrid;
      let isNotGridElement = caretAfter !== false && !isGridOrGridPopupTrigger(caretAfter);
      let isTakenAtOnce = takesCaretAtOnce && !wasOpenedByKeyRef.current;
      if (!caretGoesElsewhere || isTakenAtOnce || (isNotGridElement && !wasOpenedByKeyRef.current)) return caretAfter;
      if (!wasOpenedByKeyRef.current) return anchor?.current ?? true;
      return toolbarTabStopOf(toolbar.current) ?? true;
    },
  };
}
export function ToolbarMenu({
  isOpen: isOpen,
  button: button,
  tooltip: tooltip,
  isTooltipShut = false,
  side: side,
  tooltipSide = side,
  placedBy: placedBy,
  isOfContextBar: isOfContextBar,
  field: field,
  children: children,
  ...rest
}: Dynamic) {
  let isCoarsePointer2 = useCoarsePointerMedia();
  let {
    timesLeftOpen: timesLeftOpen,
    onRootOpenChange: onRootOpenChange,
    wasOpenedByKey: wasOpenedByKey,
    aboveComposer: aboveComposer,
    ...focusProps
  } = useToolbarPopupFocus({
    isOpen: isOpen,
    side: side,
    ...rest,
    ...(field !== undefined && {
      takesCaretAtOnce: !isCoarsePointer2,
      isMenu: true,
    }),
  });
  let popupProps = {
    side: side,
    ...aboveComposer,
    ...placedBy,
    ...focusProps,
    [CONTEXT_BAR_PART_ATTRIBUTE]: isOfContextBar,
  };
  let typed = field?.typed ?? '';
  let [shownTyped, setShownTyped] = React.useState(typed);
  if (isOpen && shownTyped !== typed) setShownTyped(typed);
  return jsxs(
    Menu.Root,
    {
      modal: false,
      open: isOpen,
      onOpenChange: onRootOpenChange,
      onOpenChangeComplete: (isNowOpen?: Dynamic) => {
        if (!isNowOpen) setShownTyped('');
      },
      children: [
        field !== undefined &&
          jsx(TypedSearchAnnouncer, {
            typed: field.typed,
            found: (item?: Dynamic) => isOpen && field.saidOf(field.typed, item),
          }),
        tooltip === null
          ? button
          : jsx(ToolbarTooltip, {
              name: tooltip,
              side: tooltipSide,
              isShut: isOpen || isTooltipShut,
              children: button,
            }),
        field === undefined
          ? jsx(Menu.Popup, {
              ...popupProps,
              onMouseDown: preventMouseDownDefault,
              onKeyDownCapture: blockRepeatedEnterOrSpace,
              children: children,
            })
          : jsx(MenuWithField, {
              ...popupProps,
              isAtTool: true,
              ...field.handlers,
              field: {
                ...field,
                renderRowsFor: (typedNow?: Dynamic, ...restArgs: Dynamic[]) =>
                  (field.renderRowsFor as Dynamic)(isOpen ? typedNow : shownTyped, ...restArgs),
                takesCaretAtFirst: isOpen,
                onShutByEnter: () => rest.onOpenChange(false, null),
              },
              onMouseDownCapture: (event?: Dynamic) => {
                if (event.target instanceof HTMLInputElement) event.stopPropagation();
              },
              onKeyDownCapture: (event?: Dynamic) => {
                field.handlers?.onKeyDownCapture(event);
                if (field.takeKeyFirst?.(event) === true) {
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                blockRepeatedEnterOrSpace(event);
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                let clearsTyped = event.key === 'Escape' && field.typed.trim() !== '';
                let leavesByTab = event.key === 'Tab' && !wasOpenedByKey();
                if (!clearsTyped && !leavesByTab) return;
                event.preventDefault();
                event.stopPropagation();
                if (leavesByTab) {
                  rest.onOpenChange(false, null);
                  return;
                }
                field.onTyped('');
                event.currentTarget.querySelector('input')?.focus({
                  preventScroll: true,
                });
              },
              children: children,
            }),
      ],
    },
    timesLeftOpen,
  );
}
export function SplitToolButton({
  icon: icon,
  label: label,
  shortcut: shortcut,
  pressed: pressed,
  whyNot: whyNot,
  leavesFocusToSheet: leavesFocusToSheet,
  onPress: onPress,
  listLabel: listLabel,
  side: side,
  tooltipSide = side,
  children: children,
  ...rest
}: Dynamic) {
  let anchorRef = React.useRef(null);
  let setAnchor = React.useCallback((element?: Dynamic) => {
    anchorRef.current = element;
  }, []);
  let iconOf = useBarIcon();
  let hasFace = !useCoarsePointerMedia() || whyNot !== null;
  return jsxs(SplitTool, {
    ref: setAnchor,
    label: label,
    hasFace: hasFace,
    children: [
      hasFace &&
        jsx(ToolbarTooltip, {
          name: label,
          shortcut: shortcut,
          side: tooltipSide,
          isShut: rest.isOpen || whyNot !== null,
          children: jsx(Button, {
            variant: 'ghost',
            iconOnly: true,
            icon: iconOf(icon, pressed),
            'aria-label': label,
            tooltip: false,
            ...(shortcut !== undefined && {
              shortcut: shortcut,
            }),
            ...(pressed !== undefined && {
              pressed: pressed,
            }),
            ...disabledWithWhyNot(label, whyNot, tooltipSide),
            onClick: onPress,
          }),
        }),
      jsx(ToolbarMenu, {
        ...rest,
        isOfContextBar: true,
        side: side,
        tooltipSide: tooltipSide,
        placedBy: {
          align: 'start',
          anchor: anchorRef,
        },
        ...(leavesFocusToSheet === true && {
          opensListUnderCell: () => true,
        }),
        tooltip: listLabel,
        button: jsx(MenuTriggerButton, {
          variant: 'ghost',
          'aria-label': listLabel,
          chevron: 'barAtSelection',
          ...disabledWithWhyNot(listLabel, whyNot, tooltipSide),
          ...(hasFace
            ? {
                className: 'w-4 px-0',
              }
            : {
                icon: iconOf(icon, pressed),
                ...(pressed !== undefined && {
                  pressed: pressed,
                }),
                className: 'ps-2.5 pe-1.5',
              }),
          children: null,
        }),
        children: children,
      }),
    ],
  });
}
export function ToolbarPopover({
  isOpen: isOpen,
  name: name,
  buttonLabel: buttonLabel,
  icon: icon,
  whyNot: whyNot,
  isLit: isLit,
  padding = 'sm',
  anchor: anchor,
  side: side,
  tooltipSide = side,
  children: children,
  ...rest
}: Dynamic) {
  let iconOf = useBarIcon();
  let {
    timesLeftOpen: timesLeftOpen,
    onRootOpenChange: onRootOpenChange,
    initialFocus: initialFocus,
    finalFocus: finalFocus,
    aboveComposer: aboveComposer,
  } = useToolbarPopupFocus({
    isOpen: isOpen,
    side: side,
    ...(anchor !== undefined && {
      anchor: anchor,
    }),
    ...rest,
  });
  let {
    isGivenUp: isGivenUp,
    holdPopup: holdPopup,
    noteFocus: noteFocus,
  } = usePopupGivenUpOnBlur(isOpen && rest.takesCaretAtOnce === true, () => rest.onOpenChange(false, null));
  let setPopup = holdPopup;
  return jsxs(
    Popover.Root,
    {
      open: isOpen && !isGivenUp,
      onOpenChange: onRootOpenChange,
      children: [
        anchor === undefined &&
          jsx(ToolbarTooltip, {
            name: name,
            side: tooltipSide,
            isShut: isOpen || whyNot !== null,
            children: jsx(Popover.Trigger, {
              disabled: whyNot !== null,
              render: jsx(Button, {
                variant: 'ghost',
                iconOnly: true,
                'aria-label': buttonLabel,
                tooltip: false,
                icon: typeof icon === 'string' ? iconOf(icon, isLit) : icon,
                ...disabledWithWhyNot(buttonLabel, whyNot, tooltipSide),
                ...(isLit !== undefined && {
                  pressed: isLit,
                }),
              }),
            }),
          }),
        jsx(Popover.Popup, {
          ref: setPopup,
          ...(anchor !== undefined && {
            anchor: anchor,
          }),
          side: side,
          ...aboveComposer,
          ...(rest.takesCaretAtOnce === true && {
            align: anchor === undefined ? 'start' : 'end',
            collisionAvoidance: {
              side: 'none',
              align: 'shift',
              fallbackAxisSide: 'none',
            },
          }),
          padding: padding,
          'aria-label': name,
          initialFocus: initialFocus,
          finalFocus: finalFocus,
          keepFocus: true,
          onFocus: noteFocus,
          ...{
            [CONTEXT_BAR_PART_ATTRIBUTE]: true,
          },
          onMouseDown: (event?: Dynamic) => event.stopPropagation(),
          onKeyDown: wrapTabFocusInBar,
          children: children,
        }),
      ],
    },
    timesLeftOpen,
  );
}
export function ColorToolPopover({
  property: property,
  shared: shared,
  whatColorPickerShows: whatColorPickerShows,
  onChosen: onChosen,
  ...rest
}: Dynamic) {
  let iconSize = useBarIconSize();
  let [color, otherColor] = property === 'fillColor' ? [shared.fillColor, shared.font.color] : [shared.font.color, shared.fillColor];
  return jsx(ToolbarPopover, {
    ...rest,
    name: property === 'fillColor' ? sheetMessages.cellColor() : sheetMessages.textColor(),
    buttonLabel: colorButtonLabel(property, color),
    padding: COLOR_POPUP_PADDING,
    icon: jsxs('span', {
      className: 'sheet-color-glyph',
      children: [
        jsx(Icon, {
          name: COLOR_TOOL_ICONS[property],
          size: iconSize,
        }),
        jsx('span', {
          className: 'sheet-color-bar',
          'data-has-fill': (color !== null && color.kind !== 'none') || undefined,
          'data-is-mixed': color === null || undefined,
          style: fillPaintStyle(color === null ? null : shownCellColor(property, color, otherColor ?? NO_COLOR)),
        }),
      ],
    }),
    children: jsx(SheetColorPicker, {
      property: property,
      color: color,
      whatIsColored: {
        kind: 'cells',
        otherColor: otherColor,
      },
      whatItShows: whatColorPickerShows,
      onChosen: onChosen,
      onDone: () => rest.onOpenChange(false, null),
    }),
  });
}
export function HideableBarTool({ isShown: isShown, hasNoButtonWhileHidden = false, children: children }: Dynamic) {
  let wrapperRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let wrapper = wrapperRef.current;
    if (isShown || wrapper === null || !wrapper.contains(wrapper.ownerDocument.activeElement)) return;
    let section = wrapper.closest('.sheet-section-of-bar');
    let enabledButtons = Array.from<Dynamic>(section?.querySelectorAll('[data-tool]:not([hidden]) button:enabled') ?? []);
    let isAfter = (button?: Dynamic) => (wrapper.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    (enabledButtons.find(isAfter) ?? enabledButtons.at(-1) ?? section?.previousElementSibling?.querySelector('button'))?.focus({
      preventScroll: true,
    });
  }, [isShown]);
  if (!isShown && !CAN_CHECK_VISIBILITY && !hasNoButtonWhileHidden) return null;
  return jsx('span', {
    ref: wrapperRef,
    hidden: !isShown,
    className: 'contents',
    children: children,
  });
}
export const CHEVRON_BUTTON_PADDING = {
  className: 'not-pointer-coarse:ps-2 not-pointer-coarse:pe-1 not-pointer-coarse:[@media(hover:hover)]:pe-0',
};
export const FONT_SIZE_BUTTON_PADDING = {
  className: `${CHEVRON_BUTTON_PADDING.className} not-pointer-coarse:[@media(hover:hover)]:ps-1`,
};
export const TOOLBAR_POPUP_SIDE = 'top';
export const isCaretBackToGrid = (caretAfter?: Dynamic, opensListUnderCell?: Dynamic) =>
  caretAfter !== false && isGridOrGridPopupTrigger(caretAfter) && !opensListUnderCell;
export const isKeyboardActivation = (event?: Dynamic) =>
  event?.type === 'keydown' || (event?.type === 'click' && 'detail' in event && event.detail === 0);
export const CAN_CHECK_VISIBILITY = typeof Element === 'undefined' || 'checkVisibility' in (Element as Dynamic).prototype;
export const MergeCellsButton = React.memo(function ({ change: change, whyNot: whyNot, onChosen: onChosen }: Dynamic) {
  let tooltipSide = useBarTooltipSide();
  let choose = React.useCallback(() => onChosen(change), [change, onChosen]);
  return jsx(BarIconButton, {
    icon: MERGE_TOOL_ICONS[change],
    label: sheetMessages[change](),
    tooltipSide: tooltipSide,
    whyNot: whyNot,
    onClick: choose,
  });
});
export const LINE_OF_TEXT_TOGGLES = ['underline', 'strikethrough'];
export const MoreOfRowCaret = ({ at: at }: Dynamic) =>
  jsx('span', {
    'aria-hidden': true,
    className: 'sheet-more-of-row',
    'data-at': at,
    children: jsx(Icon, {
      name: at === 'start' ? 'CaretLeft' : 'CaretRight',
      size: 'sm',
    }),
  });
export const FOLDED_CHOICE_LABELS = {
  align: sheetMessages.align,
  fontSize: sheetMessages.fontSize,
  numberFormat: sheetMessages.numberFormat,
  textColor: sheetMessages.textColor,
  fillColor: sheetMessages.cellColor,
};
export const INSERT_TOOL_OF_CHIP = {
  dropdown: 'insertDropdown',
  person: 'insertPerson',
  date: 'insertDate',
  checkbox: 'insertCheckbox',
};
[insertColumnsTool, insertRowsTool] = INSERT_ROW_COLUMN_TOOLS;
export const FormattingToolbar = React.memo(function ({
  ref: ref,
  whyNoToolForCells: whyNoToolForCells,
  formatOfSelection: formatOfSelection,
  formatOfSelection: {
    shared: shared,
    togglesOn: togglesOn,
    numberFormat: numberFormat,
    decimalPlaces: decimalPlaces,
    formatsThatFit: formatsThatFit,
    alignmentOfActiveCellAsDrawn: alignmentOfActiveCellAsDrawn,
    bordersOfBlock: bordersOfBlock,
    areBordersOfBlockFromSample: areBordersOfBlockFromSample,
    checkboxesToSet: checkboxesToSet,
  },
  sectionShows: sectionShows,
  onSectionRestedOn: onSectionRestedOn,
  arePeopleSelected: arePeopleSelected,
  selectedRowCount: selectedRowCount,
  selectedColumnCount: selectedColumnCount,
  canMergeSelection: canMergeSelection,
  canUnmergeSelection: canUnmergeSelection,
  isOneRangeNeeded: isOneRangeNeeded,
  onMergeChangeChosen: onMergeChangeChosen,
  onCheckboxesSet: onCheckboxesSet,
  onSheetChangeChosen: onSheetChangeChosen,
  canWriteFigures: canWriteFigures,
  onFigureChosen: onFigureChosen,
  isPaneOfDropdownOpen: isPaneOfDropdownOpen,
  onPaneOfDropdownAsked: onPaneOfDropdownAsked,
  openMenu: openMenu,
  isSwipedRow: isSwipedRow,
  isEntryOpen: isEntryOpen,
  isSheetMenuOpen: isSheetMenuOpen,
  onFormatChosen: onFormatChosen,
  onChosenByOwnTool: onChosenByOwnTool,
  workbookInFormatMenu: workbookInFormatMenu,
  formatInList: formatInList,
  borderPen: borderPen,
  onBordersChosen: onBordersChosen,
  onBorderPenChanged: onBorderPenChanged,
  areGridlinesHidden: areGridlinesHidden,
  onGridlinesToggled: onGridlinesToggled,
  whatColorPickerShows: whatColorPickerShows,
  onMenuOpenChange: onMenuOpenChange,
  howPickerWasAskedInCellsMenu: howPickerWasAskedInCellsMenu,
  onSheetMenuAsked: onSheetMenuAsked,
  areConditionalFormatsOpen: areConditionalFormatsOpen,
  onConditionalFormatsAsked: onConditionalFormatsAsked,
  isPickerAskedByKeyRef: isPickerAskedByKeyRef,
  cardOfConditionalFormats: cardOfConditionalFormats,
  cardOfChart: cardOfChart,
  cardOfSortAndFilter: cardOfSortAndFilter,
  isSortAndFilterOnBar: isSortAndFilterOnBar2,
  whyNoChart: whyNoChart,
  whatHasCaretAfterMenu: whatHasCaretAfterMenu,
  onKeyDown: onKeyDown,
  comment: comment = null,
  inserts: inserts,
  onInsertChosen: onInsertChosen,
}: Dynamic) {
  let tooltipSide = useBarTooltipSide();
  let barSize = useCoarseBarIconSize();
  let isPointerCoarse = useCoarsePointerMedia();
  let barIcon = useBarIcon();
  let scrollerRef = React.useRef(null);
  let toolsOffBar = useFoldedTools({
    scroller: scrollerRef,
    isBusy: openMenu !== null || isSheetMenuOpen,
    isSwipedRow: isSwipedRow,
  });
  let closeMenu = React.useCallback((isOpen?: Dynamic) => onMenuOpenChange(isOpen, false, null), [onMenuOpenChange]);
  let {
    choicesInPlace: choicesInPlace,
    goBackToTools: goBackToTools,
    showAllChoices: showAllChoices,
    noteFocusAsChoicesGo: noteFocusAsChoicesGo,
    ofScroller: ofScroller,
  } = useSwipedToolRow({
    isSwipedRow: isSwipedRow,
    isEntryOpen: isEntryOpen,
    openMenu: openMenu,
    scrollerRef: scrollerRef,
    closeMenu: closeMenu,
  });
  let menuOpenOnBar = choicesInPlace === null ? openMenu : null;
  let sectionRoom = contextToolSlotCount(toolsOffBar, isSwipedRow);
  let fitOptions = React.useMemo(
    () => ({
      isByFinger: isPointerCoarse,
      hasSortAndFilter: isSortAndFilterOnBar2,
      formatsThatFit: formatsThatFit,
    }),
    [isPointerCoarse, isSortAndFilterOnBar2, formatsThatFit],
  );
  let sectionTools = React.useMemo(
    () => contextToolsThatFit(sectionShows, sectionRoom, fitOptions),
    [sectionShows, sectionRoom, fitOptions],
  );
  let foldedTools = React.useMemo(
    () =>
      contextToolsLeftOver(sectionShows, sectionRoom, fitOptions).filter(
        (tool?: Dynamic) => !(tool === 'wrapText' && sectionShows === 'mergedOnly'),
      ),
    [sectionShows, sectionRoom, fitOptions],
  );
  let barTools = React.useMemo(() => TOOLS_OF_BAR.filter((tool?: Dynamic) => !toolsOffBar.includes(tool)), [toolsOffBar]);
  let toolsWithButton = React.useMemo(() => [...barTools, ...sectionTools], [barTools, sectionTools]);
  let barToolsWithEnd = React.useMemo(() => [...barTools, ...CONTEXT_TOOLS_IN_ORDER], [barTools]);
  let moreButtonRef = React.useRef(null);
  let clickedToolRef = React.useRef(null);
  let sectionRef = React.useCallback(
    (section?: Dynamic) => {
      let restState = {
        pointer: false,
        focus: false,
      };
      let noteRest = (change?: Dynamic) => {
        Object.assign(restState, change);
        onSectionRestedOn(restState.pointer || restState.focus);
      };
      let controller = new (AbortController as Dynamic)();
      let listen = (type?: Dynamic, restOf?: Dynamic) =>
        section.addEventListener(type, (event?: Dynamic) => noteRest(restOf(event)), {
          signal: controller.signal,
        });
      listen(
        'pointerenter',
        () => ({
          pointer: true,
        }),
      );
      listen(
        'pointerleave',
        () => ({
          pointer: false,
        }),
      );
      listen(
        'focusin',
        () => ({
          focus: true,
        }),
      );
      listen(
        'focusout',
        (event?: Dynamic) => ({
          focus: section.contains(
            event instanceof FocusEvent && event.relatedTarget instanceof Node ? event.relatedTarget : section.ownerDocument.activeElement,
          ),
        }),
      );
      return () => {
        controller.abort();
        noteRest({
          pointer: false,
          focus: false,
        });
      };
    },
    [onSectionRestedOn],
  );
  let opensListUnderCellRef = React.useRef(false);
  let onInsertChosenNoting = React.useCallback(
    (chip?: Dynamic) => {
      opensListUnderCellRef.current = chip === 'dropdown';
      onInsertChosen(chip);
    },
    [onInsertChosen],
  );
  let inPlaceOfFormat = React.useMemo(() => cellControlsInMenuOrder(inserts), [inserts]);
  let numberFormatChoice = arePeopleSelected ? 'person' : numberFormat.choice;
  let numberFormatName = arePeopleSelected ? 'person' : numberFormat.name;
  let hasCellControl = shared.cellControl?.kind !== 'none';
  let formatList = useCustomFormatList(formatInList, !hasCellControl);
  let formatField = numberFormatSearchField({
    written: formatList,
    choiceOfSelection: numberFormatChoice,
    inPlaceOfFormat: inPlaceOfFormat,
    onInsertChosen: onInsertChosenNoting,
    areFormatsOnOffer: formatsThatFit.includes('general'),
    doesFormatTakeControlOff: hasCellControl,
    onChosen: onFormatChosen,
    workbookInFormatMenu: workbookInFormatMenu,
    patternOfSelection: shared.numberFormat?.pattern ?? null,
    isPointerCoarse: isPointerCoarse,
  });
  let fontSizeField = useFontSizeField({
    shared: shared,
    onChosen: onFormatChosen,
  });
  let pickerAnchorOf = (tool?: Dynamic) =>
    !toolsWithButton.includes(tool)
      ? {
          anchor: moreButtonRef,
          isAskedByKey: () => howPickerWasAskedInCellsMenu() === null && isPickerAskedByKeyRef.current,
          isAskedByKeyFromCells: () => howPickerWasAskedInCellsMenu() === 'key',
        }
      : {
          isAskedByKeyFromCells: () => howPickerWasAskedInCellsMenu() === 'key',
        };
  let isPickerOfMoreOpen = [...TOOLS_WITH_PICKERS, 'sort'].some(
    (tool?: Dynamic) => tool === openMenu && !toolsWithButton.includes(tool),
  );
  let hasComment = comment !== null;
  let barRows = React.useMemo(
    () =>
      TOOLBAR_LINES.map(
        (row?: Dynamic) =>
          row.flatMap((tool?: Dynamic) => {
            if (tool === 'section') return sectionTools;
            return toolsOffBar.includes(tool) ? [] : [tool];
          }),
      ),
    [toolsOffBar, sectionTools],
  );
  let besides = React.useMemo(() => toolNeighbours(barRows, hasComment ? 'tool' : 'end'), [barRows, hasComment]);
  let separatorBefore = (tool?: Dynamic) => {
    let rowIndex = TOOLBAR_LINES.findIndex((row?: Dynamic) => row.includes(tool));
    let rowsShown = barRows.map(({ length: rowLength }: Dynamic) => rowLength > 0);
    return jsx(BarSeparator, {
      isHidden: rowsShown[rowIndex] !== true || !rowsShown.slice(0, rowIndex).includes(true),
    });
  };
  let whyNoFigure = canWriteFigures
    ? null
    : selectedColumnCount > 1
      ? sheetMessages.oneColumnNeededForFigure()
      : sheetMessages.noRoomForFigure();
  let whyNoSheetChange = (change?: Dynamic) => {
    let range = isOneRangeNeeded ? oneRangeActOfCommand(change) : null;
    return range === null ? null : oneRangeNeededText(range);
  };
  let returnCaret = () => {
    let caretAfter = whatHasCaretAfterMenu();
    if (caretAfter !== false)
      caretAfter.focus({
        preventScroll: true,
      });
  };
  let notingListUnderCell =
    (act?: Dynamic) =>
    () => {
      opensListUnderCellRef.current = true;
      act();
    };
  let figureItems = SUM_BAR_AGGREGATES.map(
    (figure?: Dynamic) =>
      jsx(
        Menu.Item,
        {
          onClick: notingListUnderCell(() => onFigureChosen(figure)),
          children: figureNameLabel(figure),
        },
        figure,
      ),
  );
  let countOf = (of?: Dynamic) => (of === 'columns' ? selectedColumnCount : selectedRowCount);
  let sheetChangeItems = ({ of: of, first: first, second: second }: Dynamic, withIcons?: Dynamic) =>
    [first, second].map(
      ({ change: change, icon: icon, inWords: inWords }: Dynamic) =>
        jsx(
          MenuItemWithWhyOff,
          {
            ...(withIcons && {
              icon: icon,
            }),
            disabled: whyNoSheetChange(change) !== null,
            whyOff: whyNoSheetChange(change),
            onClick: () => onSheetChangeChosen(change),
            children: inWords(countOf(of)),
          },
          change,
        ),
    );
  let sheetChangeSubmenu = (item?: Dynamic) =>
    submenuOrWhyOff(
      insertLinesLabel(item.of, countOf(item.of)),
      whyNoSheetChange(item.first.change),
      jsx(Fragment, {
        children: sheetChangeItems(item, false),
      }),
    );
  let whyNoWrap = sectionShows === 'mergedOnly' ? sheetMessages.mergedCellsDoNotWrap() : null;
  let onNumberFormatTool = (format?: Dynamic) => {
    onFormatChosen({
      numberFormatChoice: format,
    });
    onChosenByOwnTool(format);
  };
  let rowWhileFolded = (format?: Dynamic) => {
    switch (format) {
      case 'currency':
      case 'percent':
        return jsx(Menu.Item, {
          onClick: () => onNumberFormatTool(format),
          children: numberFormatChoiceLabel(format),
        });
      case 'sum':
        return submenuOrWhyOff(
          sheetMessages.calculations(),
          whyNoFigure,
          jsx(Fragment, {
            children: figureItems,
          }),
        );
      case 'insertColumns':
        return sheetChangeSubmenu(insertColumnsTool);
      case 'insertRows':
        return sheetChangeSubmenu(insertRowsTool);
      case 'sort':
        return jsx(Menu.Item, {
          onClick: (event?: Dynamic) => {
            swallowRestOfPress(event);
            isPickerAskedByKeyRef.current = event.detail === 0;
            onMenuOpenChange('sort', true, null);
          },
          children: sortAndFilterMessages.sortAndFilter(),
        });
      case 'optionsOfDropdown':
        return jsx(Menu.Item, {
          checked: isPaneOfDropdownOpen,
          onClick: onPaneOfDropdownAsked,
          children: sheetMessages.optionsOfDropdownInFull(),
        });
      case 'checkAll':
      case 'uncheckAll': {
        let { isChecking: isChecking, inWords: inWords, whyNot: whyNot } = CHECKBOX_SETTING_TOOLS[format];
        return jsx(MenuItemWithWhyOff, {
          disabled: whyNot(checkboxesToSet) !== null,
          whyOff: whyNot(checkboxesToSet),
          onClick: () => onCheckboxesSet(isChecking),
          children: inWords(),
        });
      }
    }
  };
  let whyNoChartNow = whyNoToolForCells ?? whyNoChart;
  let chartTool = jsx(BarTool, {
    tool: 'chart',
    isDrawnWithNoButton: true,
    children: jsx(ToolbarPopover, {
      ...pickerAnchorOf('chart'),
      isOpen: openMenu === 'chart',
      whyNot: whyNoChartNow,
      name: CHART_MESSAGES.insertChart(),
      buttonLabel: CHART_MESSAGES.insertChart(),
      icon: 'Chart',
      padding: 'none',
      takesCaretAtOnce: true,
      side: TOOLBAR_POPUP_SIDE,
      tooltipSide: tooltipSide,
      onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => {
        if (isOpen || !(event instanceof MouseEvent && event.detail > 1)) onMenuOpenChange('chart', isOpen, event);
      },
      whatHasCaretAfter: whatHasCaretAfterMenu,
      toolbar: scrollerRef,
      children: cardOfChart,
    }),
  });
  let sortTool = jsx(ToolbarPopover, {
    ...pickerAnchorOf('sort'),
    isOpen: openMenu === 'sort',
    whyNot: whyNoToolForCells,
    name: sortAndFilterMessages.sortAndFilter(),
    buttonLabel: sortAndFilterMessages.sortAndFilter(),
    icon: 'Filter',
    padding: 'none',
    takesCaretAtOnce: true,
    side: TOOLBAR_POPUP_SIDE,
    tooltipSide: tooltipSide,
    onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => {
      if (isOpen || !(event instanceof MouseEvent && event.detail > 1)) onMenuOpenChange('sort', isOpen, event);
    },
    whatHasCaretAfter: whatHasCaretAfterMenu,
    toolbar: scrollerRef,
    children: cardOfSortAndFilter,
  });
  let sectionTool = (tool?: Dynamic, children?: Dynamic) =>
    jsx(
      BarTool,
      {
        tool: tool,
        isDrawn: sectionTools.includes(tool),
        children: jsx(HideableBarTool, {
          isShown: sectionTools.includes(tool),
          children: children,
        }),
      },
      tool,
    );
  let insertTool = ({ what: what, icon: icon, label: label, fits: fits, whyNotNow: whyNotNow }: Dynamic, toolLabel?: Dynamic) =>
    jsx(BarIconButton, {
      icon: icon,
      label: toolLabel,
      tooltipSide: tooltipSide,
      whyNot: whyNoToolForCells ?? (fits ? (whyNotNow ?? null) : toolUnavailableText(label)),
      onClick: () => {
        onInsertChosen(what);
        returnCaret();
      },
    });
  let menuPropsOf = (menu?: Dynamic) => ({
    isOpen: openMenu === menu,
    onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => onMenuOpenChange(menu, isOpen, event),
    whatHasCaretAfter: whatHasCaretAfterMenu,
    toolbar: scrollerRef,
    side: TOOLBAR_POPUP_SIDE,
    tooltipSide: tooltipSide,
  });
  let [lineOfText, setLineOfText] = React.useState('underline');
  let whyNoMergeOfRange = isOneRangeNeeded ? oneRangeNeededText('mergeCells') : sheetMessages.moreCellsNeededToMerge();
  let moreMenuState = {
    folded: foldedTools,
    withButton: toolsWithButton,
    isFontSizeUnderAlign: toolsWithButton.includes('align') && !isSwipedRow,
    format: formatOfSelection,
    canUnmergeSelection: canUnmergeSelection,
    whyNoMerge: canMergeSelection ? null : whyNoMergeOfRange,
  };
  let tooltipPropsOf = (tool?: Dynamic) => disabledWithWhyNot(tool, whyNoToolForCells, tooltipSide);
  let toolbarSentence = useToolbarArrowKeysHint();
  return jsx('div', {
    ref: scrollerRef,
    className: 'sheet-scroller scroll-fade-x',
    'data-size': barSize,
    ...{
      [BAR_FORM_ATTRIBUTE]: barForm(toolsOffBar, isSwipedRow),
    },
    ...ofScroller,
    children: jsxs('div', {
      ref: ref,
      role: 'presentation',
      className: 'sheet-row-of-tools w-max min-w-full',
      onKeyDown: onKeyDown,
      children: [
        toolbarSentence.sentence,
        isSwipedRow &&
          jsx(MoreOfRowCaret, {
            at: 'start',
          }),
        jsxs(Toolbar, {
          ...toolbarSentence.ofToolbar,
          flush: true,
          className: 'py-0',
          label: choicesInPlace === null ? sheetMessages.formatting() : FOLDED_CHOICE_LABELS[choicesInPlace](),
          divider: false,
          children: [
            choicesInPlace !== null &&
              jsx(DockedBarChoices, {
                of: choicesInPlace,
                shared: shared,
                numberFormatOfSelection: numberFormat.choice,
                examplesOfNumberFormats: workbookInFormatMenu.examples,
                onChosen: onFormatChosen,
                onBack: goBackToTools,
                onAllAsked: showAllChoices,
                onGoing: noteFocusAsChoicesGo,
              }),
            jsxs(BarToolsProvider, {
              ofBar: barToolsWithEnd,
              besides: besides,
              isHidden: choicesInPlace !== null,
              children: [
                ['bold', 'italic'].map(
                  (tool?: Dynamic) =>
                    jsx(
                      BarTool,
                      {
                        tool: tool,
                        children: jsx(BarIconButton, {
                          icon: TEXT_TOGGLE_ICONS[tool].icon,
                          label: textStyleLabel(tool),
                          shortcut: formatToggleShortcut(tool),
                          tooltipSide: tooltipSide,
                          pressed: togglesOn[tool],
                          whyNot: whyNoToolForCells,
                          onClick: () =>
                            onFormatChosen({
                              toggle: tool,
                            }),
                        }),
                      },
                      tool,
                    ),
                ),
                isSwipedRow &&
                  LINE_OF_TEXT_TOGGLES.map(
                    (toggle?: Dynamic) =>
                      jsx(
                        BarIconButton,
                        {
                          icon: TEXT_TOGGLE_ICONS[toggle].icon,
                          label: textStyleLabel(toggle),
                          tooltipSide: tooltipSide,
                          pressed: togglesOn[toggle],
                          whyNot: whyNoToolForCells,
                          onClick: () =>
                            onFormatChosen({
                              toggle: toggle,
                            }),
                        },
                        toggle,
                      ),
                  ),
                jsx(BarTool, {
                  tool: 'underline',
                  children: jsx(SplitToolButton, {
                    icon: TEXT_TOGGLE_ICONS[lineOfText].icon,
                    label: textStyleLabel(lineOfText),
                    shortcut: formatToggleShortcut(lineOfText),
                    pressed: togglesOn[lineOfText],
                    whyNot: whyNoToolForCells,
                    onPress: () =>
                      onFormatChosen({
                        toggle: lineOfText,
                      }),
                    listLabel: sheetMessages.underlineOrStrikethrough(),
                    isOpen: openMenu === 'lineOfText',
                    onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => onMenuOpenChange('lineOfText', isOpen, event),
                    whatHasCaretAfter: whatHasCaretAfterMenu,
                    toolbar: scrollerRef,
                    side: TOOLBAR_POPUP_SIDE,
                    tooltipSide: tooltipSide,
                    children: LINE_OF_TEXT_TOGGLES.map(
                      (toggle?: Dynamic) =>
                        jsx(
                          Menu.Item,
                          {
                            icon: TEXT_TOGGLE_ICONS[toggle].icon,
                            checked: togglesOn[toggle],
                            shortcut: formatToggleShortcut(toggle),
                            onClick: () => {
                              setLineOfText(toggle);
                              onFormatChosen({
                                toggle: toggle,
                              });
                            },
                            children: textStyleLabel(toggle),
                          },
                          toggle,
                        ),
                    ),
                  }),
                }),
                jsx(BarTool, {
                  tool: 'align',
                  children: jsx(ToolbarMenu, {
                    isOpen: menuOpenOnBar === 'align',
                    isOfContextBar: true,
                    button: jsx(MenuTriggerButton, {
                      variant: 'ghost',
                      icon: barIcon(TEXT_ALIGN_ICONS[alignmentOfActiveCellAsDrawn]),
                      'aria-label': sheetMessages.align(),
                      ...CHEVRON_BUTTON_PADDING,
                      ...tooltipPropsOf(sheetMessages.align()),
                      chevron: 'barAtSelection',
                      children: null,
                    }),
                    tooltip: sheetMessages.align(),
                    onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => onMenuOpenChange('align', isOpen, event),
                    whatHasCaretAfter: whatHasCaretAfterMenu,
                    toolbar: scrollerRef,
                    side: TOOLBAR_POPUP_SIDE,
                    tooltipSide: tooltipSide,
                    children: jsx(AlignMenuItems, {
                      shared: shared,
                      onChosen: onFormatChosen,
                      hasRowsWithLists: true,
                    }),
                  }),
                }),
                separatorBefore('textColor'),
                ['textColor', 'fillColor'].map(
                  (tool?: Dynamic) =>
                    jsx(
                      BarTool,
                      {
                        tool: tool,
                        isDrawnWithNoButton: true,
                        children: jsx(ColorToolPopover, {
                          ...pickerAnchorOf(tool),
                          property: tool,
                          whyNot: whyNoToolForCells,
                          isOpen: menuOpenOnBar === tool,
                          shared: shared,
                          whatColorPickerShows: whatColorPickerShows,
                          onChosen: (color?: Dynamic) =>
                            onFormatChosen(
                              tool === 'fillColor'
                                ? {
                                    fillColor: color,
                                  }
                                : {
                                    textColor: color,
                                  },
                            ),
                          onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => onMenuOpenChange(tool, isOpen, event),
                          whatHasCaretAfter: whatHasCaretAfterMenu,
                          toolbar: scrollerRef,
                          side: TOOLBAR_POPUP_SIDE,
                          tooltipSide: tooltipSide,
                        }),
                      },
                      tool,
                    ),
                ),
                jsx(BarTool, {
                  tool: 'borders',
                  isDrawnWithNoButton: true,
                  children: jsx(ToolbarPopover, {
                    ...pickerAnchorOf('borders'),
                    isOpen: openMenu === 'borders',
                    whyNot: whyNoToolForCells,
                    name: sheetMessages.borders(),
                    buttonLabel: bordersButtonLabel(summarizeAreaBorders(bordersOfBlock, areBordersOfBlockFromSample)),
                    icon: jsx(BordersOfBlockIcon, {
                      lines: bordersOfBlock,
                    }),
                    side: TOOLBAR_POPUP_SIDE,
                    tooltipSide: tooltipSide,
                    onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => onMenuOpenChange('borders', isOpen, event),
                    whatHasCaretAfter: whatHasCaretAfterMenu,
                    toolbar: scrollerRef,
                    children: jsx(BordersPicker, {
                      pen: borderPen,
                      whatColorPickerShows: whatColorPickerShows,
                      whatHasCaretAfter: whatHasCaretAfterMenu,
                      onChosen: onBordersChosen,
                      onPenChanged: onBorderPenChanged,
                      areGridlinesHidden: areGridlinesHidden,
                      onGridlinesToggled: onGridlinesToggled,
                    }),
                  }),
                }),
                jsx(BarTool, {
                  tool: 'conditionalFormatting',
                  isDrawnWithNoButton: true,
                  children: jsx(ToolbarPopover, {
                    ...pickerAnchorOf('conditionalFormatting'),
                    isOpen: openMenu === 'conditionalFormatting',
                    whyNot: null,
                    name: CONDITIONAL_FORMATTING_WORDS.conditionalFormatting(),
                    buttonLabel: CONDITIONAL_FORMATTING_WORDS.conditionalFormatting(),
                    icon: 'ConditionalFormat',
                    isLit: areConditionalFormatsOpen,
                    padding: 'none',
                    takesCaretAtOnce: true,
                    side: TOOLBAR_POPUP_SIDE,
                    tooltipSide: tooltipSide,
                    onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => {
                      if (isOpen && areConditionalFormatsOpen) onConditionalFormatsAsked('button');
                      else onMenuOpenChange('conditionalFormatting', isOpen, event);
                    },
                    whatHasCaretAfter: whatHasCaretAfterMenu,
                    toolbar: scrollerRef,
                    children: cardOfConditionalFormats,
                  }),
                }),
                chartTool,
                separatorBefore('numberFormat'),
                jsxs(BarTool, {
                  tool: 'numberFormat',
                  children: [
                    jsx(ToolbarMenu, {
                      isOpen: menuOpenOnBar === 'numberFormat',
                      isOfContextBar: true,
                      button: jsx(MenuTriggerButton, {
                        variant: 'ghost',
                        icon: barIcon(numberFormatIconOf(numberFormatName).icon),
                        'aria-label': numberFormatButtonLabel(numberFormatName),
                        ...CHEVRON_BUTTON_PADDING,
                        ...tooltipPropsOf(numberFormatButtonLabel(numberFormatName)),
                        chevron: 'barAtSelection',
                        children: null,
                      }),
                      tooltip: sheetMessages.numberFormat(),
                      onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => {
                        if (isOpen) opensListUnderCellRef.current = false;
                        onMenuOpenChange('numberFormat', isOpen, event);
                      },
                      opensListUnderCell: () => opensListUnderCellRef.current,
                      whatHasCaretAfter: whatHasCaretAfterMenu,
                      toolbar: scrollerRef,
                      side: TOOLBAR_POPUP_SIDE,
                      tooltipSide: tooltipSide,
                      field: {
                        ...formatField,
                        handlers: formatList.handlers,
                      },
                      children: jsx(NumberFormatMenuItems, {
                        choiceOfSelection: numberFormatChoice,
                        inPlaceOfFormat: inPlaceOfFormat,
                        onInsertChosen: onInsertChosenNoting,
                        formatsThatFit: formatsThatFit,
                        onChosen: onFormatChosen,
                        workbookInFormatMenu: workbookInFormatMenu,
                      }),
                    }),
                    jsx(CustomFormatListAnnouncer, {
                      list: formatList,
                    }),
                  ],
                }),
                sectionRoom === 0 && sortTool,
                sectionRoom !== 0 &&
                  jsxs('span', {
                    ref: sectionRef,
                    className: 'sheet-section-of-bar',
                    onClickCapture: (event?: Dynamic) => {
                      let toolElement = event.target instanceof Element && event.target.closest('[data-tool]');
                      if (event.detail < 2) clickedToolRef.current = toolElement;
                      else if (toolElement !== clickedToolRef.current) event.stopPropagation();
                    },
                    children: [
                      jsx(BarTool, {
                        tool: 'sort',
                        isDrawn: sectionTools.includes('sort'),
                        children: jsx(HideableBarTool, {
                          isShown: sectionTools.includes('sort'),
                          hasNoButtonWhileHidden: true,
                          children: sortTool,
                        }),
                      }),
                      inserts.map(
                        (chip?: Dynamic) => sectionTool(INSERT_TOOL_OF_CHIP[chip.what], insertTool(chip, insertChipLabel(chip.what))),
                      ),
                      sectionTool(
                        'fontSize',
                        jsx(ToolbarMenu, {
                          isOpen: menuOpenOnBar === 'fontSize',
                          isOfContextBar: true,
                          button: jsx(MenuTriggerButton, {
                            variant: 'ghost',
                            'aria-label': fontSizeButtonLabel(shared.font.size),
                            ...FONT_SIZE_BUTTON_PADDING,
                            ...tooltipPropsOf(fontSizeButtonLabel(shared.font.size)),
                            chevron: 'barAtSelection',
                            children: jsx('span', {
                              className: 'sheet-font-size-of-selection',
                              'data-widest': '00',
                              'data-is-mixed': shared.font.size === null || undefined,
                              children: fontSizeText(shared.font.size),
                            }),
                          }),
                          tooltip: sheetMessages.fontSize(),
                          onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => onMenuOpenChange('fontSize', isOpen, event),
                          whatHasCaretAfter: whatHasCaretAfterMenu,
                          toolbar: scrollerRef,
                          side: TOOLBAR_POPUP_SIDE,
                          tooltipSide: tooltipSide,
                          ...(!isPointerCoarse && {
                            field: fontSizeField,
                          }),
                          children: jsx(FontSizeItems, {
                            shared: shared,
                            onChosen: onFormatChosen,
                          }),
                        }),
                      ),
                      sectionTool(
                        'optionsOfDropdown',
                        jsx(ToolbarTooltip, {
                          name: sheetMessages.optionsOfDropdownInFull(),
                          side: tooltipSide,
                          children: jsx(Button, {
                            variant: 'ghost',
                            'aria-label': sheetMessages.optionsOfDropdownInFull(),
                            pressed: isPaneOfDropdownOpen,
                            onClick: onPaneOfDropdownAsked,
                            children: sheetMessages.optionsOfDropdown(),
                          }),
                        }),
                      ),
                      ['checkAll', 'uncheckAll'].map((tool?: Dynamic) => {
                        let { isChecking: isChecking, icon: icon, inWords: inWords, whyNot: whyNot } = CHECKBOX_SETTING_TOOLS[tool];
                        return sectionTool(
                          tool,
                          jsx(BarIconButton, {
                            icon: icon,
                            label: inWords(),
                            tooltipSide: tooltipSide,
                            whyNot: whyNoToolForCells ?? whyNot(checkboxesToSet),
                            onClick: () => onCheckboxesSet(isChecking),
                          }),
                        );
                      }),
                      DECIMAL_PLACE_CHANGES.map(
                        (step?: Dynamic) =>
                          sectionTool(
                            `${step}DecimalPlaces`,
                            jsx(DecimalPlacesButton, {
                              step: step,
                              decimalPlaces: decimalPlaces,
                              whyNoToolForCells: whyNoToolForCells,
                              onChosen: onFormatChosen,
                            }),
                          ),
                      ),
                      ['currency', 'percent'].map(
                        (format?: Dynamic) =>
                          sectionTool(
                            format,
                            jsx(BarIconButton, {
                              icon: format === 'currency' ? 'DollarSign' : 'PercentSign',
                              label: numberFormatChoiceLabel(format),
                              tooltipSide: tooltipSide,
                              whyNot: whyNoToolForCells,
                              onClick: () => onNumberFormatTool(format),
                            }),
                          ),
                      ),
                      sectionTool(
                        'sum',
                        jsx(SplitToolButton, {
                          ...menuPropsOf('sum'),
                          icon: 'Sigma',
                          label: figureNameLabel('sum'),
                          whyNot: whyNoToolForCells ?? whyNoFigure,
                          onPress: () => {
                            onFigureChosen('sum');
                            returnCaret();
                          },
                          leavesFocusToSheet: true,
                          listLabel: sheetMessages.moreCalculations(),
                          children: figureItems,
                        }),
                      ),
                      INSERT_ROW_COLUMN_TOOLS.map((insertTool2?: Dynamic) => {
                        let { of: of, insert: insert, first: first } = insertTool2;
                        let count = countOf(of);
                        return sectionTool(
                          insert,
                          jsx(SplitToolButton, {
                            ...menuPropsOf('insert'),
                            isOpen: openMenu === 'insert' && sectionTools.includes(insert),
                            icon: first.icon,
                            label: first.inWords(count),
                            whyNot: whyNoToolForCells ?? whyNoSheetChange(first.change),
                            onPress: () => onSheetChangeChosen(first.change),
                            listLabel: insertLinesLabel(of, count),
                            children: sheetChangeItems(insertTool2, true),
                          }),
                        );
                      }),
                      sectionTool(
                        'wrapText',
                        isPointerCoarse
                          ? jsx(BarIconButton, {
                              icon: 'TextWrap',
                              label: sheetMessages.wrapText(),
                              tooltipSide: tooltipSide,
                              pressed: isWrapTextOn(shared),
                              whyNot: whyNoToolForCells ?? whyNoWrap,
                              onClick: () => onFormatChosen(wrapTextToggled(shared)),
                            })
                          : jsx(ToolbarMenu, {
                              isOpen: menuOpenOnBar === 'textWrapping',
                              isOfContextBar: true,
                              button: jsx(MenuTriggerButton, {
                                variant: 'ghost',
                                icon: barIcon('TextWrap'),
                                'aria-label': textWrappingButtonLabel(textWrappingOf(shared)),
                                ...CHEVRON_BUTTON_PADDING,
                                ...disabledWithWhyNot(textWrappingButtonLabel(textWrappingOf(shared)), whyNoToolForCells ?? whyNoWrap, tooltipSide),
                                chevron: 'barAtSelection',
                                children: null,
                              }),
                              tooltip: sheetMessages.textWrapping(),
                              onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => onMenuOpenChange('textWrapping', isOpen, event),
                              whatHasCaretAfter: whatHasCaretAfterMenu,
                              toolbar: scrollerRef,
                              side: TOOLBAR_POPUP_SIDE,
                              tooltipSide: tooltipSide,
                              children: jsx(TextWrappingItems, {
                                shared: shared,
                                onChosen: onFormatChosen,
                                hasHeading: false,
                              }),
                            }),
                      ),
                      inserts.map((tool?: Dynamic) => {
                        let toolInfo = CONTEXT_TOOL_OF_CELL_CONTROL[tool.what];
                        return toolInfo !== undefined && sectionTool(toolInfo, insertTool(tool, tool.label));
                      }),
                      sectionTool(
                        'mergeCells',
                        jsx(MergeCellsButton, {
                          change: 'mergeCells',
                          whyNot: whyNoToolForCells ?? (canMergeSelection ? null : whyNoMergeOfRange),
                          onChosen: onMergeChangeChosen,
                        }),
                      ),
                      sectionTool(
                        'unmergeCells',
                        jsx(MergeCellsButton, {
                          change: 'unmergeCells',
                          whyNot: whyNoToolForCells,
                          onChosen: onMergeChangeChosen,
                        }),
                      ),
                    ],
                  }),
                jsx(BarTool, {
                  tool: 'more',
                  children: jsx(ToolbarMenu, {
                    isOpen: openMenu === 'more',
                    isOfContextBar: 'more',
                    button: jsx(Menu.Trigger, {
                      render: jsx(Button, {
                        ref: moreButtonRef,
                        variant: 'ghost',
                        iconOnly: true,
                        icon: barIcon('DotsHorizontal'),
                        tooltip: false,
                        'aria-label': sheetMessages.more(),
                        className: isPickerOfMoreOpen || isSheetMenuOpen ? 'bg-fill-ghost-hover' : undefined,
                      }),
                    }),
                    tooltip: sheetMessages.more(),
                    isTooltipShut: isPickerOfMoreOpen || isSheetMenuOpen,
                    onOpenChange: (isOpen?: Dynamic, event?: Dynamic) => {
                      if (isOpen && moreButtonRef.current !== null && isMoreMenuEmpty(moreMenuState))
                        return onSheetMenuAsked(moreButtonRef.current, isKeyboardActivation(event));
                      if (isOpen) opensListUnderCellRef.current = false;
                      return onMenuOpenChange('more', isOpen, event);
                    },
                    opensListUnderCell: () => opensListUnderCellRef.current,
                    isPickerInItsPlace: isPickerOfMoreOpen,
                    whatHasCaretAfter: whatHasCaretAfterMenu,
                    toolbar: scrollerRef,
                    side: TOOLBAR_POPUP_SIDE,
                    tooltipSide: tooltipSide,
                    children: jsx(MoreToolsMenu, {
                      ...moreMenuState,
                      rowWhileFolded: rowWhileFolded,
                      onFormatChosen: onFormatChosen,
                      onMergeChangeChosen: onMergeChangeChosen,
                      onPickerAsked: (picker?: Dynamic, isByKey?: Dynamic) => {
                        isPickerAskedByKeyRef.current = isByKey;
                        if (picker === 'conditionalFormatting') onConditionalFormatsAsked('menu');
                        else onMenuOpenChange(picker, true, null);
                      },
                      inserts: inserts,
                      onInsertChosen: onInsertChosenNoting,
                      whyNoChart: whyNoChartNow,
                      onSheetMenuAsked: (tool?: Dynamic) => {
                        if (moreButtonRef.current !== null) onSheetMenuAsked(moreButtonRef.current, tool);
                      },
                    }),
                  }),
                }),
                comment !== null &&
                  jsx('span', {
                    'data-before': 'tool',
                    'data-after': 'end',
                    className: 'flex flex-none',
                    children: comment,
                  }),
              ],
            }),
          ],
        }),
        isSwipedRow &&
          jsx(MoreOfRowCaret, {
            at: 'end',
          }),
      ],
    }),
  });
});
