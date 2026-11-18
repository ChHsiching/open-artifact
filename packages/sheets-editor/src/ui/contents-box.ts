import type { Dynamic } from '../dynamic.ts';
import { jsx } from 'react/jsx-runtime';
export const ContentsBox = (props?: Dynamic) =>
  jsx('div', {
    ...props,
    className: 'contents',
  });
