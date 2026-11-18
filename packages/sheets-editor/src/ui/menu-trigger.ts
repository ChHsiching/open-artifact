import { Menu } from '../kit/menu.tsx';
import { Icon } from '../kit/icon.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import { jsx, jsxs } from 'react/jsx-runtime';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { zoomPercent } from '../grid/zoom.ts';
export function MenuCaret({ room: room, className: className }: Dynamic) {
  let size = `calc(${room / 16}rem * var(--ui-rem-scale, 1))`;
  return jsx('span', {
    className: `inline-flex shrink-0 items-center justify-center ${className}`,
    style: {
      width: size,
      height: size,
    },
    children: jsx(Icon, {
      customIcon: {
        name: 'caretDownSmall',
        viewBox: 16,
        paths: [
          {
            d: 'M6 7L8 9L10 7',
            strokeWidth: 1.25,
          },
        ],
      },
      size: 'sm',
    }),
  });
}
export function MenuTriggerButton({ ref: ref, id: id, children: children, chevron: chevron, ...buttonProps }: Dynamic) {
  return jsx(Menu.Trigger, {
    id: id,
    disabled: buttonProps.disabled,
    render: jsxs(Button, {
      ref: ref,
      ...buttonProps,
      children: [children, MENU_CARETS[chevron]],
    }),
  });
}
export function ZoomPercent({ zoom: zoom }: Dynamic) {
  return jsx('span', {
    className: 'sheet-zoom-percent tabular-nums',
    'data-widest': sheetMessages.zoomPercent(100),
    children: sheetMessages.zoomPercent(zoomPercent(zoom)),
  });
}
export const MENU_CARETS = {
  toolbar: MenuCaret({
    room: 12,
    className: '-mx-0.5 text-muted',
  }),
  barAtSelection: MenuCaret({
    room: 16,
    className: 'opacity-60',
  }),
  tab: MenuCaret({
    room: 12,
    className: 'text-muted',
  }),
  chipInCell: MenuCaret({
    room: 12,
    className: 'sheet-chip-caret align-top',
  }),
};
