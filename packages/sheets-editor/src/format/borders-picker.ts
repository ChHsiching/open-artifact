import { Menu, menuItemVariants } from '../kit/menu.tsx';
import { Popover } from '../kit/popover.tsx';
import { useRovingToolbar } from '../kit/roving-toolbar.ts';
import { useDensity } from '../kit/theme.tsx';
import { Icon, LeadingIcon } from '../kit/icon.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { jsx, jsxs } from 'react/jsx-runtime';
import { createPenPickerHoverIntent } from './border-pen-hover.ts';
import { ARROW_KEY_FOCUS_STEPS, nearestElementInDirection } from './color-picker/swatches.ts';
import { useTooltipHeldAsPaneOpens } from '../ui/side-pane/held-tooltip.ts';
import { useBottomInset, popupCollisionPadding } from '../shell/bottom-insets.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { borderMenuMessages, borderColorButtonLabel, borderThicknessButtonLabel, borderStyleLabel, borderEdgesLabel } from '../i18n/format-labels.ts';
import { preventMouseDownDefault, wrapTabFocusInBar } from '../ui/dom-events.ts';
import { blockRepeatedEnterOrSpace } from '../ui/repeated-key-guards.ts';
import { fillPaintStyle } from '../grid/cell-drawing.ts';
import { shownCellColor } from './cell-colors.ts';
import { COLOR_POPUP_PADDING, SheetColorPicker } from './color-picker.ts';
import { CONTEXT_BAR_PART_ATTRIBUTE } from '../ui/toolbar-tooltip.ts';
import { BORDER_LINE_STYLES, BORDER_EDGE_CHOICES } from './borders.ts';
import { swallowRestOfPress } from '../ui/press-swallow.ts';
import { useCoarseBarIconSize } from '../ui/bar-buttons.ts';
export function borderChoiceIcon(choice?: Dynamic) {
  let icon = jsx(Icon, {
    name: BORDER_CHOICE_ICONS[choice],
    size: 'md',
  });
  if (choice !== 'clear') return icon;
  let slashPath = `M${BORDER_PICTURE_MEDIUM.near} ${BORDER_PICTURE_MEDIUM.near}L${BORDER_PICTURE_MEDIUM.far} ${BORDER_PICTURE_MEDIUM.far}`;
  return jsxs('span', {
    className: 'sheet-border-picture',
    children: [icon, borderPictureIcon(BORDER_PICTURE_MEDIUM, 'md', 'BordersSlash', slashPath)],
  });
}
export function BorderPenRow({ icon: icon, label: label, opensList: opensList, isChecked: isChecked, ...buttonProps }: Dynamic) {
  return jsxs('button', {
    type: 'button',
    ...buttonProps,
    className: menuItemVariants({
      className: 'hover:bg-fill-ghost-hover focus-visible:shadow-focus data-[popup-open]:bg-fill-ghost-hover',
    }),
    children: [
      jsx(LeadingIcon, {
        icon: icon,
      }),
      jsx('span', {
        className: 'min-w-0 flex-1 truncate text-start',
        children: label,
      }),
      isChecked !== undefined &&
        jsx('span', {
          className: 'ms-md -me-1 flex shrink-0',
          style: {
            color: 'var(--ui-fill-accent)',
          },
          children: jsx(LeadingIcon, {
            icon:
              isChecked &&
              jsx(Icon, {
                name: 'Check',
                size: 'auto',
                bold: true,
              }),
          }),
        }),
      opensList &&
        jsx('span', {
          className: 'ms-md -me-1 flex shrink-0 text-muted',
          children: jsx(LeadingIcon, {
            icon: jsx(Icon, {
              name: 'CaretRight',
              size: 'sm',
            }),
          }),
        }),
    ],
  });
}
export function useBorderPenPickers(containerRef?: Dynamic) {
  let [open, setOpen] = React.useState(null);
  let hover = React.useMemo(
    () =>
      createPenPickerHoverIntent({
        onChanged: setOpen,
        after(input?: Dynamic, options?: Dynamic) {
          let value = setTimeout(options, input);
          return {
            cancel: () => clearTimeout(value),
          };
        },
      }),
    [],
  );
  React.useEffect(() => () => hover.stop(), [hover]);
  let colorPopupRef = React.useRef(null);
  let stylePopupRef = React.useRef(null);
  let openByRest = open?.isHeld === false ? open.picker : null;
  React.useEffect(() => {
    let value = containerRef.current?.ownerDocument;
    if (openByRest === null || value === undefined) return;
    let value2 = ({ clientX: clientX, clientY: clientY }: Dynamic) => {
      let value3 = (openByRest === 'color' ? colorPopupRef : stylePopupRef).current?.getBoundingClientRect();
      if (value3 === undefined) return;
      let [items, items2] = [
        Math.max(value3.left - clientX, 0, clientX - value3.right),
        Math.max(value3.top - clientY, 0, clientY - value3.bottom),
      ];
      hover.pointerDistanceFromPicker(Math.hypot(items, items2));
    };
    value.addEventListener('pointermove', value2);
    return () => value.removeEventListener('pointermove', value2);
  }, [openByRest, hover, containerRef]);
  return {
    wasHeld: () => hover.wasHeld(),
    rootOf: (input?: Dynamic) => ({
      open: open?.picker === input,
      onOpenChange: (input2?: Dynamic) => (input2 ? hover.openedByPressOrKey(input) : hover.shutByDesignSystem(input)),
    }),
    rowOf(input?: Dynamic) {
      let value = (input2?: Dynamic) => ReactDOM.flushSync(() => hover.rowAboutToOpenIt(input, input2));
      return {
        onPointerMove: (input2?: Dynamic) => isFinePointerEvent(input2) && hover.pointerOnRow(input, input2.clientX, input2.clientY),
        onPointerLeave: (input2?: Dynamic) => isFinePointerEvent(input2) && hover.pointerOffRow(input),
        onClickCapture: () => value('pressOrClick'),
        ...(input === 'style' && {
          onMouseDownCapture: ({ button: button }: Dynamic) => button === 0 && value('pressOrClick'),
          onKeyDownCapture: ({ key: key }: Dynamic) => (key === 'ArrowDown' || key === 'ArrowUp') && value('arrowKey'),
        }),
      };
    },
    popupOf: (input?: Dynamic) => ({
      ref: input === 'color' ? colorPopupRef : stylePopupRef,
      onPointerEnter: (input2?: Dynamic) => isFinePointerEvent(input2) && hover.pointerOnPicker(input),
      onPointerLeave: (input2?: Dynamic) => isFinePointerEvent(input2) && hover.pointerOffPicker(input),
      onPointerDown: () => hover.held(input),
      onFocus: () => hover.held(input),
    }),
  };
}
export function moveFocusUpDownInBorders(event?: Dynamic) {
  let { key: key, target: target, currentTarget: currentTarget } = event;
  let step = key === 'ArrowUp' || key === 'ArrowDown' ? ARROW_KEY_FOCUS_STEPS.get(key) : undefined;
  if (step === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
  let items = [...currentTarget.querySelectorAll('button')];
  let match = items.find((input?: Dynamic) => input === target);
  if (match === undefined || match.getAttribute('aria-expanded') === 'true') return;
  event.preventDefault();
  event.stopPropagation();
  let matches = items.filter((input?: Dynamic) => input !== match);
  nearestElementInDirection(match, matches, step)?.focus({
    preventScroll: true,
    focusVisible: true,
  });
}
export function BordersPicker(props?: Dynamic) {
  let {
    pen: pen,
    whatColorPickerShows: whatColorPickerShows,
    whatHasCaretAfter: whatHasCaretAfter,
    areGridlinesHidden: areGridlinesHidden,
  } = props;
  let { onChosen: onChosen, onPenChanged: onPenChanged, onGridlinesToggled: onGridlinesToggled } = props;
  let penRef = React.useRef(null);
  let { wasHeld: wasHeld, rootOf: rootOf, rowOf: rowOf, popupOf: popupOf } = useBorderPenPickers(penRef);
  let wasOpenedByKeyRef = React.useRef(false);
  let focusProps = {
    initialFocus(input?: Dynamic) {
      wasOpenedByKeyRef.current = input === 'keyboard';
      return wasOpenedByKeyRef.current;
    },
    finalFocus() {
      if (wasOpenedByKeyRef.current) return true;
      return wasHeld() && whatHasCaretAfter();
    },
  };
  let toolbarFocus = useRovingToolbar();
  let gridlinesRef = React.useRef(null);
  let allBordersRef = React.useRef(null);
  let barHint = useTooltipHeldAsPaneOpens();
  let onFocusLeavingGridlines = (input?: Dynamic) => {
    let { target: value, relatedTarget: value2, currentTarget: value3 } = input;
    if (value !== gridlinesRef.current || value3.contains(value2)) return;
    if (value3.closest('[data-presentation="sheet"]') === null) allBordersRef.current?.focus();
  };
  let bottomInset = useBottomInset();
  let placement = {
    anchor: penRef,
    side: 'inline-end',
    align: 'end',
    collisionPadding: popupCollisionPadding(bottomInset),
  };
  return jsxs('div', {
    className: 'sheet-borders-picker',
    role: 'toolbar',
    'aria-label': sheetMessages.borders(),
    ...toolbarFocus,
    onKeyDownCapture: moveFocusUpDownInBorders,
    onPointerEnter: barHint.end,
    onFocus: (input?: Dynamic) => {
      toolbarFocus.onFocus(input);
      onFocusLeavingGridlines(input);
    },
    children: [
      jsx('div', {
        className: 'sheet-gridlines-choice',
        children: jsx(BorderPenRow, {
          ref: gridlinesRef,
          opensList: false,
          icon: null,
          isChecked: !areGridlinesHidden,
          label: borderMenuMessages.showGridlines(),
          'aria-pressed': !areGridlinesHidden,
          onMouseDown: preventMouseDownDefault,
          onKeyDown: blockRepeatedEnterOrSpace,
          onClick: onGridlinesToggled,
        }),
      }),
      jsxs('div', {
        ref: penRef,
        className: 'sheet-border-pen',
        children: [
          jsxs(Popover.Root, {
            ...rootOf('color'),
            children: [
              jsx(Popover.Trigger, {
                render: jsx(BorderPenRow, {
                  opensList: true,
                  icon: jsx('span', {
                    className: 'sheet-color-bar sheet-border-pen-swatch',
                    'data-has-fill': pen.color.kind !== 'none' || undefined,
                    style: fillPaintStyle(shownCellColor('textColor', pen.color)),
                  }),
                  label: borderMenuMessages.color(),
                  'aria-label': borderColorButtonLabel(pen.color),
                  ...rowOf('color'),
                }),
              }),
              jsx(Popover.Popup, {
                ...popupOf('color'),
                ...placement,
                padding: COLOR_POPUP_PADDING,
                'aria-label': borderMenuMessages.borderColor(),
                ...focusProps,
                keepFocus: true,
                onKeyDown: wrapTabFocusInBar,
                ...{
                  [CONTEXT_BAR_PART_ATTRIBUTE]: true,
                },
                children: jsx(SheetColorPicker, {
                  property: 'textColor',
                  color: pen.color,
                  whatIsColored: {
                    kind: 'cells',
                    otherColor: null,
                  },
                  whatItShows: whatColorPickerShows,
                  onChosen: (input?: Dynamic) =>
                    onPenChanged({
                      color: input,
                    }),
                  onDone: () => rootOf('color').onOpenChange(false),
                }),
              }),
            ],
          }),
          jsxs(Menu.Root, {
            modal: false,
            ...rootOf('style'),
            children: [
              jsx(Menu.Trigger, {
                render: jsx(BorderPenRow, {
                  opensList: true,
                  icon: borderStyleIcon(pen.style),
                  label: borderMenuMessages.style(),
                  'aria-label': borderThicknessButtonLabel(pen.style),
                  ...rowOf('style'),
                }),
              }),
              jsx(Menu.Popup, {
                ...popupOf('style'),
                ...placement,
                collisionAvoidance: BORDER_STYLE_POPUP_COLLISION,
                ...focusProps,
                onMouseDown: preventMouseDownDefault,
                onKeyDownCapture: blockRepeatedEnterOrSpace,
                ...{
                  [CONTEXT_BAR_PART_ATTRIBUTE]: true,
                },
                children: jsx(Menu.Group, {
                  'aria-label': borderMenuMessages.borderStyle(),
                  children: BORDER_LINE_STYLES.map(
                    (input?: Dynamic) =>
                      jsx(
                        Menu.Item,
                        {
                          icon: borderStyleIcon(input),
                          checkedRole: 'radio',
                          checked: pen.style === input,
                          onClick: (input2?: Dynamic) => {
                            swallowRestOfPress(input2);
                            onPenChanged({
                              style: input,
                            });
                          },
                          children: borderStyleLabel(input),
                        },
                        input,
                      ),
                  ),
                }),
              }),
            ],
          }),
        ],
      }),
      jsx('div', {
        className: 'sheet-border-choices',
        children: [...BORDER_EDGE_CHOICES, 'clear'].map(
          (input?: Dynamic) =>
            jsx(
              Button,
              {
                ...(input === 'all' && {
                  ref: allBordersRef,
                  ...barHint.ofButton,
                }),
                variant: 'ghost',
                iconOnly: true,
                'aria-label': borderEdgesLabel(input),
                tooltipSide: 'top',
                icon: borderChoiceIcon(input),
                onClick: () => onChosen(input),
              },
              input,
            ),
        ),
      }),
    ],
  });
}
export const BORDER_CHOICE_ICONS = {
  all: 'BorderAll',
  inner: 'BorderInner',
  innerHorizontal: 'BorderInnerHorizontal',
  innerVertical: 'BorderInnerVertical',
  outer: 'BorderOuter',
  left: 'BorderLeft',
  top: 'BorderTop',
  right: 'BorderRight',
  bottom: 'BorderBottom',
  clear: 'BorderClear',
};
export const BORDER_PICTURE_SMALL = {
  viewBox: 16,
  near: 2.125,
  far: 13.875,
  reach: 3.2,
  strokeWidth: 1.25,
};
export const BORDER_PICTURE_MEDIUM = {
  viewBox: 20,
  near: 3.125,
  far: 16.875,
  reach: 3.2,
  strokeWidth: 1.25,
};
export const BORDER_PICTURE_LARGE = {
  viewBox: 24,
  near: 3.75,
  far: 20.25,
  reach: 4.2,
  strokeWidth: 1.5,
};
export const BORDER_CORNER_CURVE = [
  [0.6497, 0],
  [0.4747, 0],
  [0.3413, 0.0678],
  [0.2234, 0.1278],
  [0.1278, 0.2234],
  [0.0678, 0.3413],
  [0, 0.4747],
  [0, 0.6497],
  [0, 1],
];
export const borderLineAt = ({ viewBox: viewBox, near: near, far: far }: Dynamic, edge?: Dynamic) =>
  (
    ({
      top: {
        isAcross: true,
        at: near,
      },
      horizontal: {
        isAcross: true,
        at: viewBox / 2,
      },
      bottom: {
        isAcross: true,
        at: far,
      },
      left: {
        isAcross: false,
        at: near,
      },
      vertical: {
        isAcross: false,
        at: viewBox / 2,
      },
      right: {
        isAcross: false,
        at: far,
      },
    }) as Dynamic
  )[edge];
export const BORDER_PICTURE_LINES = ['top', 'bottom', 'left', 'right', 'horizontal', 'vertical'];
export const roundTo3 = (value?: Dynamic) => Number(value.toFixed(3));
export const borderCornerPath = ({ near: near, reach: reach }: Dynamic, x?: Dynamic, y?: Dynamic) => {
  let [stepX, stepY] = [x === near ? reach : -reach, y === near ? reach : -reach];
  let controlPoints = BORDER_CORNER_CURVE.map(
    ([input, input2]: Dynamic) => `${roundTo3(x + stepX * input)} ${roundTo3(y + stepY * input2)}`,
  );
  return `M${roundTo3(x + stepX)} ${y}C${controlPoints.join(' ')}`;
};
export const borderLinesPath = (picture?: Dynamic, edges?: Dynamic, strongEdges?: Dynamic) =>
  edges
    .map((edge?: Dynamic) => {
      let { viewBox: viewBox, near: near, far: far, reach: reach, strokeWidth: strokeWidth } = picture;
      let { isAcross: isAcross, at: position } = borderLineAt(picture, edge);
      let meetsStrongCorner = (input?: Dynamic) =>
        position !== viewBox / 2 && strongEdges.includes(input) === strongEdges.includes(edge);
      let meetsGap = (input?: Dynamic) => strongEdges.includes(input) && !strongEdges.includes(edge);
      let [middle, gap] = [viewBox / 2, 2 * strokeWidth];
      let [startEdge, crossEdge, endEdge] = isAcross ? ['left', 'vertical', 'right'] : ['top', 'horizontal', 'bottom'];
      let start = near + (meetsStrongCorner(startEdge) ? reach : meetsGap(startEdge) ? gap : 0);
      let end = far - (meetsStrongCorner(endEdge) ? reach : meetsGap(endEdge) ? gap : 0);
      let linePath = (input?: Dynamic, options?: Dynamic) =>
        isAcross ? `M${roundTo3(input)} ${position}H${roundTo3(options)}` : `M${position} ${roundTo3(input)}V${roundTo3(options)}`;
      let path = meetsGap(crossEdge) ? linePath(start, middle - gap) + linePath(middle + gap, end) : linePath(start, end);
      if (!isAcross) return path;
      let corners = [
        meetsStrongCorner(startEdge) ? borderCornerPath(picture, near, position) : '',
        meetsStrongCorner(endEdge) ? borderCornerPath(picture, far, position) : '',
      ];
      return `${path}${corners.join('')}`;
    })
    .join('');
export const borderPictureIcon = (picture?: Dynamic, size?: Dynamic, name?: Dynamic, path?: Dynamic) =>
  jsx(Icon, {
    customIcon: {
      name: name,
      viewBox: picture.viewBox,
      paths: [
        {
          d: path,
          strokeWidth: picture.strokeWidth,
        },
      ],
    },
    size: size,
  });
export const BorderPicture = React.memo(function ({ strong: strong, size: size }: Dynamic) {
  let isComfortable = useDensity() === 'comfortable';
  let picture = size === 'lg' ? BORDER_PICTURE_LARGE : isComfortable ? BORDER_PICTURE_MEDIUM : BORDER_PICTURE_SMALL;
  if (strong.length === 0)
    return jsx('span', {
      className: 'sheet-border-picture sheet-border-picture-none',
      children: borderPictureIcon(picture, size, 'BordersNone', borderLinesPath(picture, BORDER_PICTURE_LINES, BORDER_PICTURE_LINES)),
    });
  return jsxs('span', {
    className: 'sheet-border-picture',
    children: [
      strong.length < BORDER_PICTURE_LINES.length &&
        jsx('span', {
          className: 'sheet-border-picture-faint',
          children: borderPictureIcon(
            picture,
            size,
            'BordersFaint',
            borderLinesPath(
              picture,
              BORDER_PICTURE_LINES.filter((input?: Dynamic) => !strong.includes(input)),
              strong,
            ),
          ),
        }),
      borderPictureIcon(picture, size, 'BordersStrong', borderLinesPath(picture, strong, strong)),
    ],
  });
});
export const BordersOfBlockIcon = React.memo(
  function ({ lines: lines }: Dynamic) {
    let size = useCoarseBarIconSize() ?? 'auto';
    return jsx(BorderPicture, {
      strong: BORDER_PICTURE_LINES.filter((input?: Dynamic) => lines[input] === 'all'),
      size: size,
    });
  },
  (input?: Dynamic, options?: Dynamic) =>
    BORDER_PICTURE_LINES.every((input2?: Dynamic) => input.lines[input2] === options.lines[input2]),
);
export const BORDER_STYLE_ICON_PATHS = {
  thin: [
    {
      d: 'M1 7.5H15',
      strokeWidth: 1,
    },
  ],
  medium: [
    {
      d: 'M1 8H15',
      strokeWidth: 2,
    },
  ],
  thick: [
    {
      d: 'M1 7.5H15',
      strokeWidth: 3,
    },
  ],
  dashed: [
    {
      d: 'M1 7.5h3M6.5 7.5h3M12 7.5h3',
      strokeWidth: 1,
    },
  ],
  dotted: [
    {
      d: 'M1 7.5h1M4 7.5h1M7 7.5h1M10 7.5h1M13 7.5h1',
      strokeWidth: 1,
    },
  ],
  double: [
    {
      d: 'M1 6.5H15M1 8.5H15',
      strokeWidth: 1,
    },
  ],
};
export const borderStyleIcon = (style?: Dynamic) =>
  jsx(Icon, {
    customIcon: {
      name: `BorderStyle-${style}`,
      viewBox: 16,
      paths: BORDER_STYLE_ICON_PATHS[style],
    },
    size: 'sm',
  });
export const BORDER_STYLE_POPUP_COLLISION = {
  fallbackAxisSide: 'end',
};
export const isFinePointerEvent = ({ pointerType: pointerType, currentTarget: currentTarget }: Dynamic) =>
  pointerType !== 'touch' && currentTarget.ownerDocument.defaultView?.matchMedia('(pointer:coarse)').matches !== true;
