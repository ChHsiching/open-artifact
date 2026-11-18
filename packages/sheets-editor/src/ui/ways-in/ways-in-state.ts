import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { getBottomSafeAreaInset, subscribeBottomInsets } from '../../shell/bottom-insets.ts';
export function useWaysInWaitedFor(store?: Dynamic, waysIn?: Dynamic, isWaitPutOff?: Dynamic) {
  React.useEffect(() => {
    if (waysIn !== 'areToCome' || isWaitPutOff || isFrameCapture(document)) return;
    let timer = setTimeout(
      () =>
        store.dispatch({
          kind: 'waysInWaitedFor',
        }),
      WAYS_IN_WAIT_MS,
    );
    return () => clearTimeout(timer);
  }, [store, waysIn, isWaitPutOff]);
}
export function useEscapeSendsWaysInAway(store?: Dynamic, isActive?: Dynamic) {
  React.useEffect(() => {
    if (!isActive) return;
    let onKeyDown = (event?: Dynamic) => {
      if (event.key === 'Escape' && (document as Dynamic).activeElement === (document as Dynamic).body)
        store.dispatch({
          kind: 'waysInSentAway',
        });
    };
    (document as Dynamic).addEventListener('keydown', onKeyDown);
    return () => (document as Dynamic).removeEventListener('keydown', onKeyDown);
  }, [store, isActive]);
}
export function waysInFocusFate(situation?: Dynamic) {
  if (situation.isButtonInPage) return 'asItIs';
  return situation.isCaretOnBody && situation.hasFrameFocus && !situation.areWaysInDue ? 'toCells' : 'leftAlone';
}
export function createWaysInFocusKeeper() {
  let rememberedButton: Dynamic = null;
  let pageParts: Dynamic = null;
  let mutationObserver: Dynamic = null;
  let remember = (button?: Dynamic) => {
    rememberedButton = button;
    mutationObserver?.disconnect();
    let ownerDocument = button?.ownerDocument;
    let defaultView = ownerDocument?.defaultView ?? null;
    mutationObserver = defaultView === null ? null : new (defaultView.MutationObserver as Dynamic)(settleFocus);
    if (ownerDocument !== undefined)
      mutationObserver?.observe(ownerDocument.body, {
        childList: true,
        subtree: true,
      });
  };
  let settleFocus = () => {
    if (rememberedButton === null || pageParts === null) return;
    let ownerDocument = rememberedButton.ownerDocument;
    let fate = waysInFocusFate({
      isButtonInPage: rememberedButton.isConnected,
      isCaretOnBody: ownerDocument.activeElement === ownerDocument.body,
      hasFrameFocus: ownerDocument.hasFocus(),
      areWaysInDue: pageParts.areWaysInDue(),
    });
    if (fate === 'asItIs') return;
    remember(null);
    if (fate === 'toCells') pageParts.giveToCells();
  };
  return {
    remember: remember,
    goBy(parts?: Dynamic) {
      pageParts = parts;
    },
  };
}
export function useWaysInFocusKeeping({ findWaysIn: findWaysIn, ...pageParts }: Dynamic) {
  let [focusKeeper] = React.useState(createWaysInFocusKeeper);
  React.useEffect(() => focusKeeper.goBy(pageParts));
  React.useEffect(() => () => focusKeeper.remember(null), [focusKeeper]);
  let wayInOf = (target?: Dynamic) => {
    let waysIn = findWaysIn();
    let defaultView = waysIn?.ownerDocument.defaultView ?? null;
    return defaultView !== null && target instanceof defaultView.Element && waysIn?.contains(target) === true ? target : null;
  };
  return {
    onFocus: ({ target: target }: Dynamic) => focusKeeper.remember(wayInOf(target)),
    onBlur: ({ relatedTarget: relatedTarget }: Dynamic) => focusKeeper.remember(wayInOf(relatedTarget)),
  };
}
export function waysInRoom(lastRoom?: Dynamic, areDue?: Dynamic, offered?: Dynamic) {
  if (!areDue) return 'waysInAreNotDue';
  if (lastRoom === 'hasRoom' || typeof offered === 'function') return 'hasRoom';
  return lastRoom === 'hasNoRoom' || offered === null ? 'hasNoRoom' : 'notSettled';
}
export function waysInShown(lastRoom: Dynamic, { areDue: areDue, mayBeSeen: mayBeSeen, offered: offered }: Dynamic) {
  let room = waysInRoom(lastRoom, areDue, offered);
  return {
    room: room,
    areSeen: areDue && mayBeSeen && room !== 'notSettled',
    askAgent: room === 'hasRoom' || room === 'notSettled' ? (offered ?? 'awaited') : null,
  };
}
export function useWaysInShown(situation?: Dynamic) {
  let [lastRoom, setLastRoom] = React.useState('waysInAreNotDue');
  let { room: room, ...shown } = waysInShown(lastRoom, situation);
  if (room !== lastRoom) setLastRoom(room);
  return shown;
}
export function useWaysInOutOfSightReport(store?: Dynamic, areOutOfSight?: Dynamic) {
  React.useEffect(
    () =>
      store.dispatch({
        kind: 'waysInOutOfSightChanged',
        are: areOutOfSight,
      }),
    [store, areOutOfSight],
  );
}
export function useAgentAskedFromWaysIn({
  areWaysInDue: areWaysInDue,
  isDraftWaiting: isDraftWaiting,
  doCellsTakeNoText: doCellsTakeNoText2,
}: Dynamic) {
  let [askStep, setAskStep] = React.useState('no');
  let nextStep = agentAskStep(askStep, {
    areWaysInDue: areWaysInDue,
    isDraftWaiting: isDraftWaiting,
  });
  if (nextStep !== askStep) setAskStep(nextStep);
  let forgetAsk = React.useCallback(() => setAskStep('no'), []);
  let isAgentAsked = nextStep === 'asked' || nextStep === 'drafted';
  React.useEffect(() => {
    if (nextStep !== 'pressed') return;
    let timer = setTimeout(() => setAskStep('asked'), AGENT_ASK_PRESSED_MS);
    return () => clearTimeout(timer);
  }, [nextStep]);
  React.useEffect(() => {
    if (!isAgentAsked) return;
    let latestScroll: Dynamic = getBottomSafeAreaInset();
    let stopWatching = subscribeBottomInsets(() => {
      let scrolledTo = getBottomSafeAreaInset();
      if (scrolledTo < latestScroll - ANNOUNCEMENT_SCROLL_SLACK) forgetAsk();
      latestScroll = Math.max(latestScroll, scrolledTo);
    });
    (document as Dynamic).addEventListener('pointerdown', forgetAsk, true);
    (document as Dynamic).addEventListener('keydown', forgetAsk, true);
    return () => {
      stopWatching();
      (document as Dynamic).removeEventListener('pointerdown', forgetAsk, true);
      (document as Dynamic).removeEventListener('keydown', forgetAsk, true);
    };
  }, [isAgentAsked, forgetAsk]);
  let didCellsTakeNoTextRef = React.useRef(false);
  React.useEffect(() => {
    if (didCellsTakeNoTextRef.current && !doCellsTakeNoText2 && (document as Dynamic).hasFocus()) forgetAsk();
    didCellsTakeNoTextRef.current = doCellsTakeNoText2;
  }, [doCellsTakeNoText2, forgetAsk]);
  React.useEffect(() => {
    if (nextStep !== 'drafted' || isDraftWaiting) return;
    let timer = setTimeout(forgetAsk, DRAFTED_ASK_LINGER_MS);
    return () => clearTimeout(timer);
  }, [nextStep, isDraftWaiting, forgetAsk]);
  return {
    isAgentAsked: isAgentAsked,
    noteAgentAsked: React.useCallback(() => setAskStep('pressed'), []),
  };
}
export const isFrameCapture = (doc?: Dynamic) => doc.documentElement.hasAttribute('data-frame-capture');
export const WAYS_IN_WAIT_MS = 800;
export const areAnnouncementsUnderWay = () => getBottomSafeAreaInset() > 0;
export const useAnnouncementsUnderWay = () =>
  React.useSyncExternalStore(subscribeBottomInsets, areAnnouncementsUnderWay, () => false);
export const DRAFTED_ASK_LINGER_MS = 1500;
export const AGENT_ASK_PRESSED_MS = 500;
export const ANNOUNCEMENT_SCROLL_SLACK = 40;
export const agentAskStep = (askStep: Dynamic, { areWaysInDue: areWaysInDue, isDraftWaiting: isDraftWaiting }: Dynamic) => {
  if (!areWaysInDue) return 'no';
  return askStep === 'asked' && isDraftWaiting ? 'drafted' : askStep;
};
