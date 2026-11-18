import { Icon, resolveFilledIconName } from '../kit/icon.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx } from 'react/jsx-runtime';
import { ToolbarTooltip } from './toolbar-tooltip.ts';
import { disabledWithWhyNot } from './why-not.ts';
import { useCoarsePointerMedia } from '../app/media-queries.ts';
export function useBarIcon() {
  let iconSize = useCoarseBarIconSize();
  return React.useCallback(
    (iconName?: Dynamic, isPressed: Dynamic = false) =>
      iconSize === undefined
        ? iconName
        : jsx(Icon, {
            name: isPressed ? resolveFilledIconName(iconName) : iconName,
            size: iconSize,
          }),
    [iconSize],
  );
}
export function BarIconButton({ icon: icon, label: label, whyNot: whyNot, tooltipSide: tooltipSide, ...buttonProps }: Dynamic) {
  let renderIcon = useBarIcon();
  return jsx(ToolbarTooltip, {
    name: label,
    shortcut: buttonProps.shortcut,
    side: tooltipSide,
    isShut: whyNot !== null,
    children: jsx(Button, {
      ...buttonProps,
      icon: renderIcon(icon, buttonProps.pressed),
      variant: 'ghost',
      iconOnly: true,
      'aria-label': label,
      tooltip: false,
      ...disabledWithWhyNot(label, whyNot, tooltipSide),
    }),
  });
}
export const BarSeparator = ({ isHidden = false }: Dynamic) =>
  jsx('span', {
    'aria-hidden': true,
    'data-line-in-bar': true,
    hidden: isHidden,
    className: 'mx-0.5 h-[18px] flex-none border-l border-alpha-2',
  });
export const useCoarseBarIconSize = () => (useCoarsePointerMedia() ? 'lg' : undefined);
export const useBarIconSize = () => useCoarseBarIconSize() ?? 'md';
