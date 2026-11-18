import { SegmentedControl } from '../kit/segmented-control.tsx';
import { Menu, menuItemVariants } from '../kit/menu.tsx';
import { cn } from '../kit/cn.ts';
import { Tooltip } from '../kit/tooltip.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { asThemeMode, THEME_CHOSEN_ATTRIBUTE, chooseSheetsTheme } from '../shell/root-theme.ts';
import { useDocumentElementAttribute } from '../dom/use-document-element-attribute.ts';
import { zoomPercent, ZOOM_STEPS, MAX_ZOOM, nextZoomStep, MIN_ZOOM, useZoom } from '../grid/zoom.ts';
import { useCoarsePointerMedia } from '../app/media-queries.ts';
import { ToolbarMenu } from './format-toolbar.ts';
import { MenuTriggerButton, ZoomPercent } from './menu-trigger.ts';
import { DensitySubmenu } from './density-menu.ts';
import { MenuItemWithWhyOff } from './menu-item-why-off.ts';
import { findBarMessages } from '../i18n/find-labels.ts';
import { REPLACE_SHORTCUT } from './find-bar.ts';
import { shortcutListMessages } from '../messages/shortcut-labels.ts';
import { LiveAnnouncer } from './live-announcer.ts';
import { toolSearchWords, toolLabelWithValue } from '../tools/search-words.ts';
import { swallowRestOfPress } from './press-swallow.ts';
export function moveFocusAcrossSegments(event?: Dynamic) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  let { previousElementSibling: previousSegment, nextElementSibling: nextSegment } = event.currentTarget;
  let isLeftToRight = getComputedStyle(event.currentTarget).direction === 'ltr';
  let segmentToFocus = (event.key === 'ArrowRight') === isLeftToRight ? nextSegment : previousSegment;
  if (segmentToFocus instanceof HTMLElement) segmentToFocus.focus();
  event.preventDefault();
}
export function SegmentedMenuRow({
  label: label,
  segments: segments,
  value: value,
  onChange: onChange,
  wasPointerPressedLast: wasPointerPressedLast,
}: Dynamic) {
  let labelId = React.useId();
  let rowRef = React.useRef(null);
  let [isFocusShown, setFocusShown] = React.useState(false);
  return jsxs('div', {
    ref: rowRef,
    className: (cn as Dynamic)(menuItemVariants(), 'justify-between'),
    children: [
      jsx('span', {
        id: labelId,
        children: label,
      }),
      jsxs(Menu.Group, {
        'aria-labelledby': labelId,
        className: 'relative',
        children: [
          jsx('div', {
            inert: true,
            children: jsx(SegmentedControl, {
              className: 'grid auto-cols-fr grid-flow-col',
              'aria-label': label,
              segments: segments.map(
                (segment?: Dynamic) =>
                  segment.icon === undefined
                    ? {
                        value: segment.value,
                        label: segment.name,
                      }
                    : {
                        value: segment.value,
                        icon: segment.icon,
                      },
              ),
              value: value,
              onChange: onChange,
            }),
          }),
          jsx('div', {
            className: 'absolute inset-px grid auto-cols-fr grid-flow-col',
            children: segments.map(
              (segment?: Dynamic) =>
                jsx(
                  Tooltip,
                  {
                    content: segment.icon === undefined ? undefined : segment.name,
                    anchor: rowRef,
                    side: 'left',
                    children: jsx(Menu.Item, {
                      keepOpen: true,
                      role: 'menuitemradio',
                      'aria-checked': segment.value === value,
                      'aria-label': segment.name,
                      label: segment.name,
                      className: (cn as Dynamic)(
                        'min-w-0 not-aria-checked:hover:bg-fill-ghost-hover data-[highlighted]:bg-transparent',
                        isFocusShown && 'focus:shadow-focus',
                      ),
                      onClick: () => onChange(segment.value),
                      onFocus: () => setFocusShown(!wasPointerPressedLast()),
                      onPointerDown: () => setFocusShown(false),
                      onPointerUp: ({ pointerType: pointerType, currentTarget: currentTarget }: Dynamic) => {
                        if (pointerType !== 'mouse')
                          currentTarget.focus({
                            preventScroll: true,
                            focusVisible: false,
                          });
                      },
                      onKeyDown: moveFocusAcrossSegments,
                    }),
                  },
                  segment.value,
                ),
            ),
          }),
        ],
      }),
    ],
  });
}
export function ThemeMenuRow({ wasPointerPressedLast: wasPointerPressedLast }: Dynamic) {
  return jsx(SegmentedMenuRow, {
    label: sheetMessages.sheetTheme(),
    segments: [
      {
        value: 'automatic',
        icon: 'Computer',
        name: sheetMessages.themeAutomatic(),
      },
      {
        value: 'light',
        icon: 'Sun',
        name: sheetMessages.themeLight(),
      },
      {
        value: 'dark',
        icon: 'Moon',
        name: sheetMessages.themeDark(),
      },
    ],
    value: asThemeMode(useDocumentElementAttribute(THEME_CHOSEN_ATTRIBUTE)) ?? 'automatic',
    onChange: (theme?: Dynamic) => chooseSheetsTheme((document as Dynamic).documentElement, theme === 'automatic' ? null : theme),
    wasPointerPressedLast: wasPointerPressedLast,
  });
}
export function useZoomSaid(gridZoom?: Dynamic) {
  let [zoomSaid, setZoomSaid] = React.useState(null);
  React.useEffect(() => {
    let settleTimer: Dynamic;
    let unsubscribe = gridZoom.subscribe(() => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => setZoomSaid(zoomPercent(gridZoom.now())), ZOOM_SAID_SETTLE_MS);
    });
    return () => {
      unsubscribe();
      clearTimeout(settleTimer);
    };
  }, [gridZoom]);
  React.useEffect(() => {
    if (zoomSaid === null) return;
    let hideTimer = setTimeout(() => setZoomSaid(null), ZOOM_SAID_SHOWN_MS);
    return () => clearTimeout(hideTimer);
  }, [zoomSaid]);
  return zoomSaid;
}
export function ViewMenu({
  gridZoom: gridZoom,
  side: side,
  onOpenChange: onOpenChange,
  whatHasCaretAfter: whatHasCaretAfter,
  wasPointerPressedLast: wasPointerPressedLast,
  onFitChartAsked: onFitChartAsked,
  areFormulasShown: areFormulasShown,
  isEntryOpen: isEntryOpen,
  onFormulasShownToggled: onFormulasShownToggled,
  density: density,
  onDensityChosen: onDensityChosen,
  undoAndRedo: undoAndRedo,
  onUndoOrRedoChosen: onUndoOrRedoChosen,
  onFindAsked: onFindAsked,
  onFindAndReplaceAsked: onFindAndReplaceAsked,
  onListOfKeysAsked: onListOfKeysAsked,
}: Dynamic) {
  let zoom = useZoom(gridZoom);
  let [isOpen, setIsOpen] = React.useState(false);
  let buttonRef = React.useRef(null);
  let findKind = findItemKind(useCoarsePointerMedia(), onFindAndReplaceAsked !== null);
  let zoomSaid = useZoomSaid(gridZoom);
  let isStepZoom = ZOOM_STEPS.some((step?: Dynamic) => zoomPercent(step) === zoomPercent(zoom));
  let setOpen = (isOpen2?: Dynamic, event?: Dynamic) => {
    setIsOpen(isOpen2);
    onOpenChange(isOpen2, event);
  };
  return jsxs(Fragment, {
    children: [
      jsxs(ToolbarMenu, {
        isOpen: isOpen,
        button: jsx(MenuTriggerButton, {
          ref: buttonRef,
          variant: 'ghost',
          'aria-label': sheetMessages.zoomButton(zoomPercent(zoom)),
          chevron: 'toolbar',
          onDoubleClick: ({ nativeEvent: nativeEvent }: Dynamic) => {
            gridZoom.set(1);
            setOpen(false, nativeEvent);
          },
          children: jsx(ZoomPercent, {
            zoom: zoom,
          }),
        }),
        tooltip: sheetMessages.zoom(),
        onOpenChange: (isOpen2?: Dynamic, event?: Dynamic) => {
          if (isOpen2 && event instanceof UIEvent && event.detail === 2) return;
          setOpen(isOpen2, event);
        },
        whatHasCaretAfter: whatHasCaretAfter,
        toolbar: buttonRef,
        side: side,
        children: [
          jsx(Menu.Item, {
            keepOpen: true,
            disabled: zoom >= MAX_ZOOM,
            onClick: () => gridZoom.set(nextZoomStep(zoom, 1)),
            children: sheetMessages.zoomIn(),
          }),
          jsx(Menu.Item, {
            keepOpen: true,
            disabled: zoom <= MIN_ZOOM,
            onClick: () => gridZoom.set(nextZoomStep(zoom, -1)),
            children: sheetMessages.zoomOut(),
          }),
          jsx(Menu.Item, {
            onClick: menuItemPicked(() => gridZoom.set(1)),
            children: sheetMessages.zoomReset(),
          }),
          onFitChartAsked !== null &&
            jsx(Menu.Item, {
              onClick: menuItemPicked(onFitChartAsked),
              children: sheetMessages.zoomToChart(),
            }),
          jsx(Menu.Separator, {}),
          jsxs(Menu.Group, {
            'aria-label': sheetMessages.zoom(),
            children: [
              !isStepZoom &&
                jsx(Menu.GroupLabel, {
                  children: jsx('span', {
                    className: 'tabular-nums',
                    children: sheetMessages.zoomNow(zoomPercent(zoom)),
                  }),
                }),
              ZOOM_STEPS.map(
                (step?: Dynamic) =>
                  jsx(
                    Menu.Item,
                    {
                      checkedRole: 'radio',
                      checked: zoomPercent(step) === zoomPercent(zoom),
                      onClick: menuItemPicked(() => gridZoom.set(step)),
                      children: sheetMessages.zoomPercent(zoomPercent(step)),
                    },
                    step,
                  ),
              ),
            ],
          }),
          jsx(Menu.Separator, {}),
          jsx(Menu.Item, {
            checkedRole: 'checkbox',
            checked: areFormulasShown,
            ...(!isEntryOpen && {
              shortcut: 'ctrl+`',
            }),
            onClick: menuItemPicked(onFormulasShownToggled),
            children: sheetMessages.showFormulas(),
          }),
          jsx(ThemeMenuRow, {
            wasPointerPressedLast: wasPointerPressedLast,
          }),
          jsx(DensitySubmenu, {
            density: density,
            onDensityChosen: onDensityChosen,
            picked: menuItemPicked,
          }),
          jsx(Menu.Separator, {}),
          undoAndRedo !== null &&
            jsxs(Fragment, {
              children: [
                jsx(MenuItemWithWhyOff, {
                  disabled: undoAndRedo.undo !== null,
                  whyOff: undoAndRedo.undo === null ? null : WHY_NO_UNDO_OR_REDO.undo[undoAndRedo.undo](),
                  shortcut: 'cmd+z',
                  onClick: menuItemPicked(() => onUndoOrRedoChosen('undo')),
                  children: sheetMessages.undoInZoomMenu(),
                }),
                jsx(MenuItemWithWhyOff, {
                  disabled: undoAndRedo.redo !== null,
                  whyOff: undoAndRedo.redo === null ? null : WHY_NO_UNDO_OR_REDO.redo[undoAndRedo.redo](),
                  shortcut: 'shift+cmd+z',
                  onClick: menuItemPicked(() => onUndoOrRedoChosen('redo')),
                  children: sheetMessages.redoInZoomMenu(),
                }),
                jsx(Menu.Separator, {}),
              ],
            }),
          findKind === 'find' &&
            jsx(Menu.Item, {
              onClick: menuItemPicked(onFindAsked),
              children: findBarMessages.find(),
            }),
          findKind === 'findAndReplace' &&
            onFindAndReplaceAsked !== null &&
            jsx(Menu.Item, {
              shortcut: REPLACE_SHORTCUT,
              onClick: menuItemPicked(onFindAndReplaceAsked),
              children: findBarMessages.findAndReplace(),
            }),
          jsx(Menu.Item, {
            shortcut: 'cmd+/',
            onClick: menuItemPicked(onListOfKeysAsked),
            children: shortcutListMessages.title(),
          }),
        ],
      }),
      jsx(LiveAnnouncer, {
        words: zoomSaid !== null && sheetMessages.zoomSaid(zoomSaid),
      }),
    ],
  });
}
export function viewCommands(view?: Dynamic, options?: Dynamic) {
  let zoom = options.gridZoom.now();
  let { onFitChartAsked: onFitChartAsked, onFindAndReplaceAsked: onFindAndReplaceAsked } = options;
  let zoomCommand = (direction?: Dynamic, label?: Dynamic, zoomTo?: Dynamic) => ({
    id: `view.${direction}`,
    label: label,
    otherWords: toolSearchWords(direction),
    icon: direction === 'zoomIn' ? 'ZoomIn' : 'ZoomOut',
    actsOn: 'view',
    whyNot: null,
    run: () => options.gridZoom.set(zoomTo),
  });
  return [
    ...(zoom < MAX_ZOOM ? [zoomCommand('zoomIn', sheetMessages.zoomIn(), nextZoomStep(zoom, 1))] : []),
    ...(zoom > MIN_ZOOM ? [zoomCommand('zoomOut', sheetMessages.zoomOut(), nextZoomStep(zoom, -1))] : []),
    ...(onFitChartAsked === null
      ? []
      : [
          {
            id: 'view.zoomToChart',
            label: sheetMessages.zoomToChart(),
            otherWords: toolSearchWords('zoomToChart'),
            icon: 'ZoomFit',
            actsOn: 'view',
            whyNot: null,
            run: onFitChartAsked,
          },
        ]),
    ...ZOOM_STEPS.map(
      (step?: Dynamic) => ({
        id: `view.zoom.${zoomPercent(step)}`,
        label: toolLabelWithValue(sheetMessages.zoom(), sheetMessages.zoomPercent(zoomPercent(step))),
        otherWords: step === 1 ? [...toolSearchWords('zoomToFullSize'), sheetMessages.zoomReset()] : toolSearchWords('zoom'),
        icon: null,
        isTicked: zoomPercent(step) === zoomPercent(zoom),
        actsOn: 'view',
        whyNot: null,
        run: () => options.gridZoom.set(step),
      }),
    ),
    {
      id: 'view.showFormulas',
      label: sheetMessages.showFormulas(),
      otherWords: toolSearchWords('showFormulas'),
      icon: null,
      ...(!view.isEntryOpen && {
        keys: 'ctrl+`',
      }),
      isTicked: view.areFormulasShown,
      actsOn: 'view',
      whyNot: null,
      run: options.onFormulasShownToggled,
    },
    ...THEME_CHOICES.map(
      ({ theme: theme, inId: inId, icon: icon, inWords: inWords, foundBy: foundBy }: Dynamic) => ({
        id: `view.theme.${inId}`,
        label: toolLabelWithValue(sheetMessages.sheetTheme(), inWords()),
        otherWords: toolSearchWords(foundBy),
        icon: icon,
        isTicked: view.theme === theme,
        actsOn: 'view',
        whyNot: null,
        run: () => options.onThemeChosen(theme),
      }),
    ),
    ...DENSITY_CHOICES.map(
      ({ density: density, inWords: inWords }: Dynamic) => ({
        id: `view.layout.${density}`,
        label: toolLabelWithValue(sheetMessages.layout(), inWords()),
        otherWords: toolSearchWords('layout', `layout.${density}`),
        icon: 'Layout',
        isTicked: view.density === density,
        actsOn: 'view',
        whyNot: null,
        run: () => options.onDensityChosen(density),
      }),
    ),
    ...(view.undoAndRedo === null ? [] : UNDO_REDO_CHOICES).map(
      ({ direction: direction, icon: icon, inWords: inWords, keys: keys }: Dynamic) => {
        let whyNotKey = view.undoAndRedo?.[direction] ?? null;
        return {
          id: `view.${direction}`,
          label: inWords(),
          otherWords: toolSearchWords(direction),
          icon: icon,
          keys: keys,
          actsOn: 'file',
          whyNot: whyNotKey === null ? null : WHY_NO_UNDO_OR_REDO[direction][whyNotKey](),
          isWeighty: true,
          run: () => options.onUndoOrRedoChosen(direction),
        };
      },
    ),
    {
      id: 'view.find',
      label: findBarMessages.find(),
      otherWords: toolSearchWords('find'),
      icon: 'Search',
      keys: 'cmd+f',
      actsOn: 'opens',
      home: 'topBar',
      whyNot: null,
      run: options.onFindAsked,
    },
    ...(onFindAndReplaceAsked === null
      ? []
      : [
          {
            id: 'view.findAndReplace',
            label: findBarMessages.findAndReplace(),
            otherWords: toolSearchWords('findAndReplace'),
            icon: 'Search',
            keys: REPLACE_SHORTCUT,
            actsOn: 'opens',
            home: 'pane',
            whyNot: null,
            run: onFindAndReplaceAsked,
          },
        ]),
    {
      id: 'view.keyboardShortcuts',
      label: shortcutListMessages.title(),
      otherWords: toolSearchWords('keyboardShortcuts'),
      icon: 'Keyboard',
      keys: 'cmd+/',
      actsOn: 'opens',
      whyNot: null,
      run: options.onListOfKeysAsked,
    },
  ];
}
export const ZOOM_SAID_SHOWN_MS = 5000;
export const ZOOM_SAID_SETTLE_MS = 250;
export const menuItemPicked =
  (act?: Dynamic) =>
  (event?: Dynamic) => {
    swallowRestOfPress(event);
    act();
  };
export const WHY_NO_UNDO_OR_REDO = {
  undo: {
    nothingLeft: sheetMessages.nothingToUndoYet,
    somethingUnderWay: sheetMessages.finishTypingFirst,
  },
  redo: {
    nothingLeft: sheetMessages.nothingToRedo,
    somethingUnderWay: sheetMessages.cancelTypingFirst,
  },
};
export const findItemKind = (isPointerCoarse?: Dynamic, canReplace?: Dynamic) =>
  isPointerCoarse ? 'find' : canReplace ? 'findAndReplace' : null;
export const THEME_CHOICES = [
  {
    theme: null,
    inId: 'automatic',
    icon: 'Computer',
    inWords: sheetMessages.themeAutomatic,
    foundBy: 'themeAutomatic',
  },
  {
    theme: 'light',
    inId: 'light',
    icon: 'Sun',
    inWords: sheetMessages.themeLight,
    foundBy: 'themeLight',
  },
  {
    theme: 'dark',
    inId: 'dark',
    icon: 'Moon',
    inWords: sheetMessages.themeDark,
    foundBy: 'themeDark',
  },
];
export const DENSITY_CHOICES = [
  {
    density: 'comfortable',
    inWords: sheetMessages.comfortable,
  },
  {
    density: 'compact',
    inWords: sheetMessages.compact,
  },
];
export const UNDO_REDO_CHOICES = [
  {
    direction: 'undo',
    icon: 'ArrowCounterClockwise',
    inWords: sheetMessages.undoInZoomMenu,
    keys: 'cmd+z',
  },
  {
    direction: 'redo',
    icon: 'ArrowClockwise',
    inWords: sheetMessages.redoInZoomMenu,
    keys: 'shift+cmd+z',
  },
];
