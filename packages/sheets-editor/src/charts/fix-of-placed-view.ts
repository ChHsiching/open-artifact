import { AgentMark } from '../kit/agent-mark.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import { usePressGuard } from '../ui/ask-agent-to-fix-button.ts';
import { askSentToChatWords, chartMessages } from '../messages/charts.ts';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
export function PlacedViewFixOffer(words?: Dynamic) {
  let { noticeCame: noticeCame, ask: ask, giveChartCaret: giveChartCaret } = React.use(PlacedViewFixContext);
  let hasWords = words !== null;
  let canAsk = hasWords && ask !== null;
  React.useEffect(() => {
    if (hasWords) noticeCame(canAsk);
  }, [hasWords, canAsk, noticeCame]);
  if (words === null || ask === null) return null;
  return jsx(
    AskAgentToFixView,
    {
      words: words,
      ask: ask,
      giveChartCaret: giveChartCaret,
    },
    words,
  );
}
export function AskAgentToFixView({ words: words, ask: ask, giveChartCaret: giveChartCaret }: Dynamic) {
  let [answer, setAnswer] = React.useState({
    became: null,
    nth: 0,
  });
  let pressGate = usePressGuard();
  let buttonRef = React.useRef(null);
  React.useLayoutEffect(() => {
    let button = buttonRef.current;
    let ownerDocument = button?.ownerDocument;
    return () => {
      if (ownerDocument !== undefined && ownerDocument.activeElement === button && ownerDocument.hasFocus()) giveChartCaret();
    };
  }, [giveChartCaret]);
  let answerWords = answer.became === null ? null : askSentToChatWords(answer.became);
  return jsxs('div', {
    className: 'flex flex-col items-center gap-xs pt-xs',
    children: [
      jsx('span', {
        className: `${FIX_OF_PLACED_VIEW_CLASS} inline-flex`,
        children: jsx(Button, {
          ref: buttonRef,
          variant: 'secondary',
          size: 'sm',
          icon: jsx(AgentMark, {
            size: 14,
          }),
          tabIndex: 0,
          onPointerDown: pressGate.noteDown,
          onClick: () => {
            if (!pressGate.isTaken()) return;
            setAnswer(
              ({ nth: nth }: Dynamic) => ({
                became: null,
                nth: nth + 1,
              }),
            );
            ask(words).then(
              (became?: Dynamic) =>
                setAnswer(
                  ({ nth: nth }: Dynamic) => ({
                    became: became,
                    nth: nth,
                  }),
                ),
            );
          },
          children: chartMessages.askAgentToFix(),
        }),
      }),
      jsx('p', {
        'aria-hidden': true,
        className: 'min-h-[1lh] text-footnote text-secondary',
        children: answerWords,
      }),
      jsx(LiveAnnouncer, {
        words: answerWords,
        timesSaid: answer.nth,
      }),
    ],
  });
}
export const FIX_OF_PLACED_VIEW_CLASS = 'sheet-fix-of-placed-view';
export const LEAST_VIEW_SIZE_FOR_FIX = {
  width: 240,
  height: 128,
};
export const isViewBigEnoughForFix = (size?: Dynamic) =>
  size.width >= LEAST_VIEW_SIZE_FOR_FIX.width && size.height >= LEAST_VIEW_SIZE_FOR_FIX.height;
export const PlacedViewFixContext = React.createContext({
  noticeCame: () => {},
  ask: null,
  giveChartCaret: () => {},
});
