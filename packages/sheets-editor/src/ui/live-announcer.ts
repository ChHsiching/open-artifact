import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx } from 'react/jsx-runtime';
export function nextSayings(sayings: Dynamic, { words: words, timesSaid = 0 }: Dynamic) {
  let saying =
    typeof words === 'string' && words !== ''
      ? {
          sayingKey: `${timesSaid} ${words}`,
          words: words,
        }
      : null;
  if ((sayings.now?.sayingKey ?? null) === (saying?.sayingKey ?? null)) return sayings;
  let count = sayings.count + 1;
  return {
    now:
      saying === null
        ? null
        : {
            id: count,
            ...saying,
          },
    before: sayings.now ?? sayings.before,
    count: count,
  };
}
export function LiveAnnouncer(announcement?: Dynamic) {
  let [sayings, setSayings] = React.useState(() => nextSayings(NO_SAYINGS, announcement));
  let nextSayings2 = nextSayings(sayings, announcement);
  if (nextSayings2 !== sayings) setSayings(nextSayings2);
  let beforeId = sayings.before?.id;
  React.useEffect(() => {
    if (beforeId === undefined) return;
    let timeoutId = setTimeout(
      () =>
        setSayings(
          (current?: Dynamic) =>
            current.before?.id === beforeId
              ? {
                  ...current,
                  before: null,
                }
              : current,
        ),
      OLD_SAYING_KEEP_MS,
    );
    return () => clearTimeout(timeoutId);
  }, [beforeId]);
  return jsx('div', {
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'false',
    className: 'sr-only',
    children: [nextSayings2.before, nextSayings2.now].map(
      (saying?: Dynamic) =>
        saying !== null &&
        jsx(
          'p',
          {
            children: saying.words,
          },
          saying.id,
        ),
    ),
  });
}
export const OLD_SAYING_KEEP_MS = 1000;
export const NO_SAYINGS = {
  now: null,
  before: null,
  count: 0,
};
