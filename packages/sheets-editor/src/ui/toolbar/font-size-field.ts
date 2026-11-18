import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { typeASizeLabel, FontSizeItems, fontSizeRangeMessage } from './text-menus.ts';
import { jsx } from 'react/jsx-runtime';
import { fontSizesMatchingTyped, SMALLEST_FONT_SIZE, LARGEST_FONT_SIZE } from '../../format/toolbar-size-choices.ts';
import { menuMatchCountChooseRowWords } from '../../messages/command-search.ts';
export function useFontSizeField(props?: Dynamic) {
  let [typed, setTyped] = React.useState('');
  let [isEntered, setIsEntered] = React.useState(false);
  return {
    name: typeASizeLabel(),
    typed: typed,
    onTyped(text?: Dynamic) {
      setIsEntered(false);
      setTyped(text);
    },
    isOverNumbers: true,
    hasRowsAtRest: true,
    renderRowsFor: (text?: Dynamic) =>
      text.trim() === ''
        ? null
        : jsx(FontSizeItems, {
            ...props,
            typed: text,
          }),
    onEntered(text?: Dynamic) {
      let [size] = fontSizesMatchingTyped(text);
      if (size === undefined || isEntered) return 'stay';
      setIsEntered(true);
      props.onChosen({
        fontSizeInPoints: size,
      });
      return 'shut';
    },
    saidOf(text?: Dynamic, isCounted: Dynamic = true) {
      if (text.trim() === '' || isEntered) return false;
      let sizes = fontSizesMatchingTyped(text);
      if (sizes.length === 0) return fontSizeRangeMessage(SMALLEST_FONT_SIZE, LARGEST_FONT_SIZE);
      return isCounted && menuMatchCountChooseRowWords(sizes.length, String(sizes[0]));
    },
  };
}
