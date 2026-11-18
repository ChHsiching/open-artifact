import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import { jsx } from 'react/jsx-runtime';
export const DangerWarningIcon = ({ size = 'sm' }: Dynamic) =>
  jsx(Icon, {
    name: 'WarningFilled',
    size: size,
    className: 'text-fill-danger',
  });
