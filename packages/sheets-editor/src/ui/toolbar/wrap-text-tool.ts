import { Icon } from '../../kit/icon.tsx';
import type { Dynamic } from '../../dynamic.ts';
import { jsx } from 'react/jsx-runtime';
import { sheetMessages } from '../../i18n/sheet-messages.ts';
export const wrapTextIcon = (size?: Dynamic) =>
  jsx(Icon, {
    name: 'TextWrap',
    size: size < 20 ? 'sm' : 'md',
  });
export const wrapTextTool = () => ({
  id: 'wrapText',
  icon: wrapTextIcon,
  label: sheetMessages.wrapText(),
  canAct: true,
  whyNot: null,
});
