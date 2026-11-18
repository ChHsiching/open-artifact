import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { useIsTrueForVisibleMs, SAID_NOTICE_SHOWN_MS } from '../ui/save-status.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
export function withChartNotice(state?: Dynamic, id?: Dynamic, notice?: Dynamic) {
  let previous = state.ofEach.get(id) ?? null;
  if (previous?.words === notice?.words && previous?.ofCode === notice?.ofCode) return state;
  let ofEach = new (Map as Dynamic)(state.ofEach);
  if (notice === null) ofEach.delete(id);
  else ofEach.set(id, notice);
  return {
    ofEach: ofEach,
    said: notice?.words ?? state.said,
  };
}
export function CallWhenNoticeDue({ onDue: onDue }: Dynamic) {
  let isDue = useIsTrueForVisibleMs(true, SAID_NOTICE_SHOWN_MS);
  React.useEffect(() => {
    if (isDue) onDue();
  }, [isDue, onDue]);
  return null;
}
export function ChartNoticesProvider({ onToldOf: onToldOf, children: children }: Dynamic) {
  let [notices, setNotices] = React.useState(NO_CHART_NOTICES);
  let tell = React.useCallback(
    (id?: Dynamic, notice?: Dynamic) => {
      setNotices((state?: Dynamic) => withChartNotice(state, id, notice));
      onToldOf(id);
    },
    [onToldOf],
  );
  let clearSaid = React.useCallback(
    () =>
      setNotices(
        (state?: Dynamic) => ({
          ...state,
          said: null,
        }),
      ),
    [],
  );
  return jsxs(ChartNoticesContext, {
    value: tell,
    children: [
      jsx(LiveAnnouncer, {
        words: notices.said,
      }),
      notices.said !== null &&
        jsx(
          CallWhenNoticeDue,
          {
            onDue: clearSaid,
          },
          notices.said,
        ),
      children,
    ],
  });
}
export function ChartNoticeScope({ id: id, children: children }: Dynamic) {
  let tell = React.useContext(ChartNoticesContext);
  let tellOfView = React.useCallback((notice?: Dynamic) => tell(id, notice), [tell, id]);
  React.useEffect(() => () => tellOfView(null), [tellOfView]);
  return jsx(ChartNoticeOfViewContext, {
    value: tellOfView,
    children: children,
  });
}
export function ChartNoticeGate(props?: Dynamic) {
  let tellOfView = React.useContext(ChartNoticeOfViewContext);
  return jsx(ChartNoticeOfViewContext, {
    value: props.isHeardOf ? tellOfView : ignoreChartNotice,
    children: props.children,
  });
}
export function useChartNotice(words?: Dynamic, ofCode: Dynamic = null) {
  let tellOfView = React.useContext(ChartNoticeOfViewContext);
  React.useEffect(
    () =>
      tellOfView(
        words === null
          ? null
          : {
              words: words,
              ofCode: ofCode,
            },
      ),
    [tellOfView, words, ofCode],
  );
}
export function NoChartNotice() {
  useChartNotice(null);
  return null;
}
export const NO_CHART_NOTICES = {
  ofEach: new (Map as Dynamic)(),
  said: null,
};
export const ChartNoticesContext = React.createContext(() => {
  return;
});
export const ChartNoticeOfViewContext = React.createContext(() => {
  return;
});
export const ignoreChartNotice = () => {
  return;
};
