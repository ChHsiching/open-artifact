import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { pressedCellsOf } from './chat-with-agent.ts';
import { whenKeyboardPlaceSettles, whenUnfocusedFor } from './added-to-message-notices.ts';
import { getKeptOffCount } from '../app/keys-off-cells.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { MountedToast } from '../ui/mounted-toast.ts';
export function AgentUnavailableToast({
  store: store,
  chat: chat,
  placeOfKeyboard: placeOfKeyboard,
  hasWindowFocus: hasWindowFocus,
  isSaidElsewhere: isSaidElsewhere,
  standInFor: standInFor,
  onToastUp: onToastUp,
  onGone: onGone,
}: Dynamic) {
  let [timesRefused, setTimesRefused] = React.useState(0);
  let [timesReady, setTimesReady] = React.useState(0);
  let [timesDismissed, setTimesDismissed] = React.useState(0);
  let isSaidElsewhereNow = React.useEffectEvent(isSaidElsewhere);
  let standInForNow = React.useEffectEvent(standInFor);
  let placeOfKeyboardNow = React.useEffectEvent(placeOfKeyboard);
  React.useEffect(
    () =>
      chat.onPressRefused((refusedPress?: Dynamic, pressContext?: Dynamic) => {
        if (isSaidElsewhereNow(refusedPress)) return;
        let standIn = pressedCellsOf(refusedPress);
        if (standIn === null || !standInForNow(standIn, pressContext)) setTimesRefused((times?: Dynamic) => times + 1);
      }),
    [chat],
  );
  React.useEffect(
    () =>
      timesRefused === 0
        ? undefined
        : whenKeyboardPlaceSettles(
            store,
            () => placeOfKeyboardNow(),
            getKeptOffCount,
            () => setTimesReady(timesRefused),
          ),
    [store, timesRefused],
  );
  let isToastUp = timesRefused !== 0 && timesRefused === timesReady && timesRefused !== timesDismissed;
  let hasWindowFocusNow = React.useEffectEvent(hasWindowFocus);
  React.useEffect(
    () =>
      isToastUp
        ? whenUnfocusedFor(
            () => hasWindowFocusNow(),
            () => setTimesDismissed(timesRefused),
          )
        : undefined,
    [isToastUp, timesRefused],
  );
  let onToastUpNow = React.useEffectEvent(onToastUp);
  React.useEffect(() => {
    if (isToastUp) onToastUpNow();
  }, [isToastUp]);
  return jsxs(Fragment, {
    children: [
      jsx(LiveAnnouncer, {
        words: isToastUp && sheetMessages.agentNotToBeHad(),
        timesSaid: timesRefused,
      }),
      isToastUp &&
        jsx(
          MountedToast,
          {
            words: sheetMessages.agentNotToBeHad(),
            staysUntilClosed: false,
            onOver: () => {
              setTimesDismissed(timesRefused);
              onGone();
            },
            onTakenDown: onGone,
          },
          timesRefused,
        ),
    ],
  });
}
