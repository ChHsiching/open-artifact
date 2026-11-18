import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { cellsSelectedText, severalRangesSelectedText, pointedCellText } from '../i18n/status-labels.ts';
import { jsx } from 'react/jsx-runtime';
import { LiveAnnouncer } from './live-announcer.ts';
export function useDelayedAnnouncement(cells?: Dynamic, wordsOf?: Dynamic) {
  let [words, setWords] = React.useState(null);
  let wordsOfEvent = React.useEffectEvent(wordsOf);
  React.useEffect(() => {
    let value = setTimeout(() => setWords(cells === null ? null : wordsOfEvent(cells)), SELECTION_ANNOUNCE_DELAY_MS);
    return () => clearTimeout(value);
  }, [cells]);
  return words;
}
export function SelectedRangeAnnouncer({ selectedRange: selectedRange }: Dynamic) {
  let summaryOf = () => selectedRange?.summary ?? null;
  let words = useDelayedAnnouncement(selectedRange?.cells ?? null, (input?: Dynamic) => {
    let value = selectedRange?.ofSeveral;
    return value === undefined ? cellsSelectedText(input, summaryOf(), selectedRange?.outOfSight) : severalRangesSelectedText(value, summaryOf());
  });
  return jsx(LiveAnnouncer, {
    words: words,
  });
}
export function PointedCellsAnnouncer({ pointedCells: pointedCells, isEntryOpen: isEntryOpen }: Dynamic) {
  let wasArrowHintSaidRef = React.useRef(false);
  React.useEffect(() => {
    if (!isEntryOpen) wasArrowHintSaidRef.current = false;
  }, [isEntryOpen]);
  let words = useDelayedAnnouncement(pointedCells?.cells ?? null, () => {
    if (pointedCells === null) return '';
    let value = pointedCells.doArrowsMoveIt && !wasArrowHintSaidRef.current;
    if (value) wasArrowHintSaidRef.current = true;
    return pointedCellText(pointedCells, value);
  });
  return jsx(LiveAnnouncer, {
    words: words,
  });
}
export const SELECTION_ANNOUNCE_DELAY_MS = 500;
