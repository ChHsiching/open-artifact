import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
export function lineKeysAfter(keysBefore?: Dynamic, lines?: Dynamic, isNewPage?: Dynamic) {
  let keysInOrder = [...keysBefore.values()];
  let kept = lines.map((line?: Dynamic, index?: Dynamic) => (isNewPage ? keysInOrder[index] : keysBefore.get(line)));
  let taken = new Set(kept);
  return new Map(
    lines.map((line?: Dynamic, index?: Dynamic) => {
      let key: Dynamic = kept[index] ?? line;
      if (kept[index] === undefined) while (taken.has(key)) key += ' again';
      return (taken.add(key), [line, key]);
    }),
  );
}
export function nextLineKeys(state?: Dynamic, lines?: Dynamic, pagesTurned?: Dynamic) {
  let isNewPage = pagesTurned !== state.pagesTurned;
  if (lines.length === state.lines.length && lines.every((line?: Dynamic, index?: Dynamic) => line === state.lines[index]) && !isNewPage)
    return state;
  return {
    lines: lines,
    pagesTurned: pagesTurned,
    keys: lineKeysAfter(state.keys, lines, isNewPage),
  };
}
export function useLineKeys(lines?: Dynamic, pagesTurned?: Dynamic, isOn?: Dynamic) {
  let [state, setState] = React.useState({
    lines: [],
    pagesTurned: pagesTurned,
    keys: NO_LINE_KEYS,
  });
  if (!isOn) return NO_LINE_KEYS;
  let next = nextLineKeys(state, lines, pagesTurned);
  if (next !== state) setState(next);
  return next.keys;
}
export const NO_LINE_KEYS = new Map();
export const keyOfLine = (key?: Dynamic, keys?: Dynamic, suffix: Dynamic = '') =>
  keys.size === 0 ? key : `${keys.get(key) ?? `${key} apart`}${suffix}`;
export const LIST_KEY_SUFFIX = '+list';
