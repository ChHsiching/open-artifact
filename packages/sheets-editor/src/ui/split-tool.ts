import type { Dynamic } from '../dynamic.ts';
import { jsx } from 'react/jsx-runtime';
export function SplitTool({ ref: ref, label: label, hasFace: hasFace, children: children }: Dynamic) {
  return hasFace
    ? jsx('fieldset', {
        ref: ref,
        'aria-label': label,
        'data-has-face': true,
        className: 'sheet-split-tool m-0 flex min-w-0 flex-none border-0 p-0',
        children: children,
      })
    : jsx('span', {
        ref: ref,
        className: 'sheet-split-tool flex flex-none',
        children: children,
      });
}
