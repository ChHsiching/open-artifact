import { useUiWindow } from '../kit/theme.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { NO_LIST_ANSWER_TIMES, listAnswerSettlesAtMs, reportTimeAfterNextPaint, isWithinClickAfterUp } from '../ui/list-under-cell.ts';
import { jsx, Fragment } from 'react/jsx-runtime';
import { ANSWER_HOLD_KINDS } from '../format/answer-holds.ts';
export function createAnswerSeenTimer(view?: Dynamic, onAnswerSeen?: Dynamic, shownDelayMs: Dynamic = 0) {
  let answerTiming: Dynamic = NO_LIST_ANSWER_TIMES;
  let lastActs: Dynamic = null;
  let landedAnswerId: Dynamic = null;
  let shownAnswerId: Dynamic = null;
  let seenTimer: Dynamic;
  let scheduleSeen = () => {
    view.clearTimeout(seenTimer);
    let [answerId, seenAtMs] = [landedAnswerId, listAnswerSettlesAtMs(answerTiming)];
    if (answerId !== null && seenAtMs !== Number.POSITIVE_INFINITY)
      seenTimer = view.setTimeout(
        () =>
          onAnswerSeen({
            answerId: answerId,
            actsHeld: lastActs?.actsHeld ?? 0,
            sinceMs: seenAtMs,
          }),
        seenAtMs - view.performance.now(),
      );
  };
  return {
    noteActs({ answerId: answerId, actsHeld: actsHeld }: Dynamic) {
      if (lastActs?.answerId === answerId && lastActs.actsHeld === actsHeld) return;
      lastActs = {
        answerId: answerId,
        actsHeld: actsHeld,
      };
      answerTiming = {
        ...answerTiming,
        lastActAtMs: view.performance.now(),
      };
      scheduleSeen();
    },
    answerLanded(answerId?: Dynamic) {
      landedAnswerId = answerId;
      let isShownAlready = shownAnswerId === answerId;
      if (isShownAlready) scheduleSeen();
      let stopWatchingFrame = isShownAlready
        ? () => {}
        : reportTimeAfterNextPaint(view, (shownAtMs?: Dynamic) => {
            answerTiming = {
              ...answerTiming,
              answerShownAtMs: shownAtMs + shownDelayMs,
            };
            if (shownAtMs !== Number.POSITIVE_INFINITY) shownAnswerId = answerId;
            scheduleSeen();
          });
      return () => {
        landedAnswerId = null;
        stopWatchingFrame();
        view.clearTimeout(seenTimer);
      };
    },
  };
}
export function createActTracker() {
  let pointerAct: Dynamic = null;
  let pointerCount: Dynamic = 0;
  let keyAct: Dynamic = null;
  let wasKeyLast: Dynamic = false;
  let hasBegunTooSoon: Dynamic = false;
  return {
    pointerWentDown(act?: Dynamic) {
      pointerCount += 1;
      let nth = pointerCount;
      pointerAct = {
        ...act,
        letGoAtMs: null,
        nth: nth,
      };
      return (letGoAtMs?: Dynamic) => {
        if (pointerAct?.nth !== nth) return;
        pointerAct = {
          ...pointerAct,
          letGoAtMs: letGoAtMs,
        };
        wasKeyLast = false;
      };
    },
    pointerWasLetGo(button?: Dynamic, letGoAtMs?: Dynamic) {
      let wasAct = pointerAct?.isNoAct === false;
      pointerAct =
        button !== 0 || pointerAct === null
          ? null
          : {
              ...pointerAct,
              letGoAtMs: letGoAtMs,
            };
      wasKeyLast = false;
      return wasAct;
    },
    pointerWasCalledOff() {
      pointerAct = null;
    },
    keyWentDown(key?: Dynamic, wasHeld?: Dynamic, nowMs2?: Dynamic) {
      hasBegunTooSoon = wasHeld;
      if (key === 'Enter')
        keyAct = {
          wasHeld: wasHeld,
          letGoAtMs: nowMs2,
        };
      if (key === ' ')
        keyAct = {
          wasHeld: wasHeld,
          letGoAtMs: null,
        };
      if (key === 'Enter') wasKeyLast = true;
    },
    keyWasLetGo(key?: Dynamic, letGoAtMs?: Dynamic) {
      if (key !== ' ' || keyAct === null) return;
      keyAct = {
        ...keyAct,
        letGoAtMs: letGoAtMs,
      };
      wasKeyLast = true;
    },
    clicked(nowMs2?: Dynamic) {
      let isByKey = keyAct !== null && (pointerAct === null || (keyAct.letGoAtMs !== null && (pointerAct.letGoAtMs === null || wasKeyLast)));
      let act = isByKey ? keyAct : pointerAct;
      hasBegunTooSoon = act !== null && act.wasHeld && (act.letGoAtMs === null || isWithinClickAfterUp(act.letGoAtMs, nowMs2));
      if (isByKey) keyAct = null;
      else pointerAct = null;
    },
    hasBegunTooSoon: () => hasBegunTooSoon,
  };
}
export function actHoldHandlers(
  tracker: Dynamic,
  { hold: hold, tellOfActHeld: tellOfActHeld, isNoAct: isNoAct }: Dynamic,
  { nowMs: nowMs2, oncePointerIsLetGo: oncePointerIsLetGo }: Dynamic,
) {
  let isHolding = hold !== null && hold.stands !== 'seen';
  let noteActHeld = () => {
    if (isHolding) tellOfActHeld();
  };
  return {
    handlers: {
      onPointerDownCapture({ target: target, timeStamp: timeStamp }: Dynamic) {
        let act = {
          wasHeld: isBeforeAnswerSeen(hold, eventTimeOrNow(timeStamp, nowMs2())),
          isNoAct: isNoAct(target),
        };
        let onLetGo = tracker.pointerWentDown(act);
        oncePointerIsLetGo(target, () => onLetGo(nowMs2()));
        if (!act.isNoAct) noteActHeld();
      },
      onPointerUpCapture({ button: button }: Dynamic) {
        if (tracker.pointerWasLetGo(button, nowMs2())) noteActHeld();
      },
      onPointerCancelCapture: tracker.pointerWasCalledOff,
      onClickCapture: () => tracker.clicked(nowMs2()),
      onKeyDownCapture({ key: key, repeat: repeat, timeStamp: timeStamp }: Dynamic) {
        if (repeat) return;
        tracker.keyWentDown(key, isBeforeAnswerSeen(hold, eventTimeOrNow(timeStamp, nowMs2())), nowMs2());
      },
      onKeyUpCapture: ({ key: key }: Dynamic) => tracker.keyWasLetGo(key, nowMs2()),
    },
    noteKeyThatTakesNothing: noteActHeld,
    howActBegan: () =>
      tracker.hasBegunTooSoon()
        ? {
            hasBegunBeforeAnswerWasSeen: true,
          }
        : {},
    isActRefused: () => isHolding || tracker.hasBegunTooSoon(),
  };
}
export function useActHoldAtAnswer(options?: Dynamic) {
  let [tracker] = React.useState(createActTracker);
  return actHoldHandlers(tracker, options, BROWSER_ACT_CLOCK);
}
export const ANSWER_SEEN_DELAY_MS = {
  numberFormat: 0,
  fixes: 300,
  rowsAskedFor: 300,
};
export const answerSeenTimerFor = (holdAt?: Dynamic, view?: Dynamic, store?: Dynamic) =>
  createAnswerSeenTimer(
    view,
    (seen?: Dynamic) =>
      store.dispatch({
        kind: 'agentsAnswerSeen',
        at: holdAt,
        ...seen,
      }),
    ANSWER_SEEN_DELAY_MS[holdAt],
  );
export const AnswerSeenWatcher = React.memo(function ({
  at: holdAt,
  answerId: answerId,
  stands: stands,
  actsHeld: actsHeld,
  store: store,
}: Dynamic) {
  let pageWindow = useUiWindow();
  let seenTimer = React.useMemo(
    () => (pageWindow === undefined ? null : answerSeenTimerFor(holdAt, pageWindow, store)),
    [pageWindow, holdAt, store],
  );
  React.useLayoutEffect(() => (stands === 'landed' ? seenTimer?.answerLanded(answerId) : undefined), [seenTimer, stands, answerId]);
  React.useEffect(
    () =>
      seenTimer?.noteActs({
        answerId: answerId,
        actsHeld: actsHeld,
      }),
    [seenTimer, answerId, actsHeld],
  );
  return null;
});
export const AgentsAnswerHolds = ({ holds: holds, store: store }: Dynamic) =>
  jsx(Fragment, {
    children: ANSWER_HOLD_KINDS.map((holdAt?: Dynamic) => {
      let hold = holds[holdAt];
      if (hold === null) return null;
      let { answerId: answerId, stands: stands, actsHeld: actsHeld } = hold;
      return jsx(
        AnswerSeenWatcher,
        {
          at: holdAt,
          answerId: answerId,
          stands: stands,
          actsHeld: actsHeld,
          store: store,
        },
        holdAt,
      );
    }),
  });
export const EVENT_TIME_TOLERANCE_MS = 1e4;
export const eventTimeOrNow = (eventAtMs?: Dynamic, nowMs2?: Dynamic) =>
  nowMs2 - eventAtMs >= 0 && nowMs2 - eventAtMs < EVENT_TIME_TOLERANCE_MS ? eventAtMs : nowMs2;
export const eventTimeMs = ({ timeStamp: timeStamp }: Dynamic) => eventTimeOrNow(timeStamp, performance.now());
export const isBeforeAnswerSeen = (hold?: Dynamic, atMs?: Dynamic) =>
  hold !== null && (hold.seenSinceMs === null || atMs < hold.seenSinceMs);
export const BROWSER_ACT_CLOCK = {
  nowMs: () => performance.now(),
  oncePointerIsLetGo(target?: Dynamic, onLetGo?: Dynamic) {
    (target instanceof Node ? target.ownerDocument?.defaultView : null)?.addEventListener('pointerup', onLetGo, {
      once: true,
      capture: true,
    });
  },
};
