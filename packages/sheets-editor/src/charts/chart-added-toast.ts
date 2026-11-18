import { useToasts } from '../kit/toast.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { undoableDoneText } from '../i18n/notice-labels.ts';
import { jsx } from 'react/jsx-runtime';
import { UncommentableToastText } from '../shell/ui-root.ts';
import { CHART_MESSAGES } from './chart-words.ts';
export function chartAddedAnnouncement(chartOutcome?: Dynamic, canAnnounce?: Dynamic) {
  if (chartOutcome?.is === 'notAdded') return chartNotAddedWords(chartOutcome.why);
  if (chartOutcome?.is !== 'added' || !canAnnounce) return null;
  return undoableDoneText(chartAddedWords(chartOutcome.atPress.kind === 'byAgent', chartOutcome.valuesNotShown ?? 0));
}
export function ChartToast({ title: title, onGone: onGone }: Dynamic) {
  let value = useToasts();
  let ref = React.useRef(false);
  let value2 = React.useEffectEvent(
    () => (
      (ref.current = false),
      value.add({
        title: jsx(UncommentableToastText, {
          children: title,
        }),
        onClose: ({ byUser: byUser }: Dynamic) => {
          if (!ref.current) onGone(byUser);
        },
      })
    ),
  );
  let value3 = React.useEffectEvent((input?: Dynamic) => {
    ref.current = true;
    value.close(input);
  });
  React.useEffect(() => {
    let value4 = value2();
    return () => value3(value4);
  }, []);
  return null;
}
export function ChartNotAddedToast({ why: why, onGone: onGone }: Dynamic) {
  return jsx(ChartToast, {
    title: chartNotAddedWords(why),
    onGone: onGone,
  });
}
export const chartAddedWords = (input?: Dynamic, options?: Dynamic) =>
  input ? CHART_MESSAGES.chartAddedByAgent() : options === 0 ? CHART_MESSAGES.chartAdded() : CHART_MESSAGES.chartAddedWithValuesNotShown(options);
export const chartNotAddedWords = (input?: Dynamic) =>
  (
    ({
      notMade: CHART_MESSAGES.chartNotAdded,
      codeRefused: CHART_MESSAGES.chartNotAdded,
      full: CHART_MESSAGES.noRoomForChart,
      notForPage: CHART_MESSAGES.chartCannotBeAdded,
      leftSheet: CHART_MESSAGES.chartStopped,
    }) as Dynamic
  )[input]();
export const undoOfferOfChartAdded = ({ nth: nth, atPress: atPress, valuesNotShown: valuesNotShown }: Dynamic) => ({
  key: `chart ${nth}`,
  title: chartAddedWords(atPress.kind === 'byAgent', valuesNotShown ?? 0),
  undoLabel: CHART_MESSAGES.undoChartAdded(),
});
