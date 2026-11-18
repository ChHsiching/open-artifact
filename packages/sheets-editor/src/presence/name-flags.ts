import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx } from 'react/jsx-runtime';
import { PEER_FLAG_REST_AFTER_MS } from './flags.ts';
import { PERSON_CHIP_GAP, PERSON_CHIP_END_PADDING, personChipsWidth } from '../grid/chip-metrics.ts';
import { CELL_TEXT_PADDING_X } from '../grid/cell-metrics.ts';
export function FlagsAtRest(props?: Dynamic) {
  return jsx(
    FlagsAtRestInner,
    {
      ...props,
    },
    props.lastMoveAtMs,
  );
}
export function FlagsAtRestInner({ lastMoveAtMs: lastMoveAtMs, isKeptUp: isKeptUp, children: children }: Dynamic) {
  let restsAtMs = lastMoveAtMs + PEER_FLAG_REST_AFTER_MS;
  let [isAtRest, setIsAtRest] = React.useState(() => performance.now() >= restsAtMs);
  React.useEffect(() => {
    if (isAtRest) return;
    let timer = setTimeout(() => setIsAtRest(true), restsAtMs - performance.now());
    return () => clearTimeout(timer);
  }, [isAtRest, restsAtMs]);
  return jsx('div', {
    'data-are-at-rest': (isAtRest && !isKeptUp) || undefined,
    children: children,
  });
}
export function countNamesThatFit({
  cellWidth: cellWidth,
  nameWidths: nameWidths,
  widthOfCount: widthOfCount,
  fontSizeInPoints: fontSizeInPoints,
  opensList: opensList,
}: Dynamic) {
  for (let shownCount: Dynamic = nameWidths.length; shownCount > 1; shownCount -= 1) {
    let foldedCount = nameWidths.length - shownCount;
    let countWidth = foldedCount === 0 ? 0 : PERSON_CHIP_GAP + 2 * PERSON_CHIP_END_PADDING + widthOfCount(foldedCount);
    let namesWidth = nameWidths.slice(0, shownCount).reduce((sum?: Dynamic, width?: Dynamic) => sum + width, 0);
    let listButtonWidth = personChipsWidth(shownCount, opensList, fontSizeInPoints);
    if (CELL_TEXT_PADDING_X + namesWidth + listButtonWidth + countWidth <= cellWidth) return shownCount;
  }
  return 1;
}
