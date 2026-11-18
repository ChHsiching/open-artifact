import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { getKeptOffCount } from '../app/keys-off-cells.ts';
import { ANNOUNCEMENT_HOLD_MS } from './agent-said-announcer.ts';
import { jsx } from 'react/jsx-runtime';
import { LiveAnnouncer } from '../ui/live-announcer.ts';
import { cellsAddedToMessageText } from '../i18n/menu-labels.ts';
import { MountedToast } from '../ui/mounted-toast.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { LAST_DONE_SETTLE_MS } from '../ui/last-done-announcer.ts';
export function trackCellsAddedToChat(chatWithAgent?: Dynamic) {
  let newestAdded: Dynamic = null;
  let addedCount: Dynamic = 0;
  let pressCount: Dynamic = 0;
  let values = new (Set as Dynamic)();
  let value = (input?: Dynamic, options?: Dynamic, context?: Dynamic) => {
    pressCount += 1;
    let state = {
      cells: input,
      press: pressCount,
    };
    let value2 = context();
    let value3 = (input2?: Dynamic) => {
      let value4 = newestAdded;
      newestAdded = newerPressOf(value4, state, input2);
      if (newestAdded === value4) return;
      addedCount = options ? state.press : 0;
      for (let value5 of values as Dynamic) value5();
    };
    value2.then(value3, () => {});
    return value2;
  };
  return {
    openAboutCells: (input?: Dynamic) => value(input.range, false, () => chatWithAgent.openAboutCells(input)),
    openWithWhatWasPressed: (input?: Dynamic, options?: Dynamic, context?: Dynamic, value2?: Dynamic) =>
      value(options.range, true, () => chatWithAgent.openWithWhatWasPressed(input, options, context, value2)),
    subscribe(input?: Dynamic) {
      values.add(input);
      return () => void values.delete(input);
    },
    newestAdded: () => newestAdded,
    newestThatTellsPress: () => addedCount,
  };
}
export function whenKeyboardPlaceSettles(
  { subscribe: subscribe, getView: getView }: Dynamic,
  options?: Dynamic,
  context?: Dynamic,
  value?: Dynamic,
) {
  let startView: Dynamic = getView();
  let value2: Dynamic = options();
  let value3: Dynamic = context();
  let index: Dynamic = 0;
  let value4: Dynamic;
  let value5 = () => {
    let [items, items2] = [value2, value3];
    value2 = options();
    value3 = context();
    index = value2 === items && value3 === items2 && value2 !== 'inMenu' && value2 !== 'beforeNotice' ? index + 1 : 0;
    if (index < SETTLE_POLLS_NEEDED) {
      value4 = setTimeout(value5, SETTLE_POLL_MS);
      return;
    }
    value7();
    value(value2 === 'pausedAtCells');
  };
  let value6 = () => {
    clearTimeout(value4);
    index = 0;
    value4 = setTimeout(value5, SETTLE_POLL_MS);
  };
  let value7 = subscribe(() => {
    let { nameBoxText: value8, mode: value9 } = getView();
    if (value8 === startView.nameBoxText && value9 === startView.mode) return;
    startView = {
      nameBoxText: value8,
      mode: value9,
    };
    value6();
  });
  value6();
  return () => {
    value7();
    clearTimeout(value4);
  };
}
export function CellsAddedAnnouncer({ store: store, chat: chat, placeOfKeyboard: placeOfKeyboard }: Dynamic) {
  let value = React.useSyncExternalStore(chat.subscribe, chat.newestAdded, chat.newestAdded);
  let [value2, value3] = React.useState(null);
  let value4 = React.useEffectEvent(placeOfKeyboard);
  React.useEffect(() => {
    if (value === null) return;
    let value5: Dynamic;
    let value6 = whenKeyboardPlaceSettles(
      store,
      () => value4(),
      getKeptOffCount,
      (input?: Dynamic) => {
        value3({
          ...value,
          isPauseToBeTold: input,
        });
        value5 = setTimeout(() => value3(null), ANNOUNCEMENT_HOLD_MS);
      },
    );
    return () => {
      value6();
      clearTimeout(value5);
    };
  }, [store, value]);
  return jsx(LiveAnnouncer, {
    words: value2 !== null && cellsAddedToMessageText(value2.cells, value2.isPauseToBeTold),
    timesSaid: value2?.press ?? 0,
  });
}
export function whenUnfocusedFor(isFocused?: Dynamic, onUnfocusedLong?: Dynamic) {
  let lastFocusedAt: Dynamic = Date.now();
  let timer = setInterval(() => {
    if (isFocused()) lastFocusedAt = Date.now();
    if (Date.now() - lastFocusedAt < UNFOCUSED_DISMISS_MS) return;
    clearInterval(timer);
    onUnfocusedLong();
  }, SETTLE_POLL_MS);
  return () => clearInterval(timer);
}
export function AddedToMessageToast({
  store: store,
  chat: chat,
  placeOfKeyboard: placeOfKeyboard,
  hasWindowFocus: hasWindowFocus,
  isAgentWorking: isAgentWorking,
  onGone: onGone,
}: Dynamic) {
  let value = React.useSyncExternalStore(chat.subscribe, chat.newestThatTellsPress, chat.newestThatTellsPress);
  let [value2, value3] = React.useState(0);
  let [value4, value5] = React.useState(0);
  let value6 = React.useEffectEvent(placeOfKeyboard);
  React.useEffect(
    () =>
      value === 0
        ? undefined
        : whenKeyboardPlaceSettles(
            store,
            () => value6(),
            getKeptOffCount,
            () => value3(value),
          ),
    [store, value],
  );
  let [value7, value8] = React.useState(isAgentWorking);
  if (isAgentWorking !== value7) {
    value8(isAgentWorking);
    if (isAgentWorking) value5(Math.max(value4, value));
  }
  let value9 = value !== 0 && value === value2 && value > value4;
  let value10 = React.useEffectEvent(hasWindowFocus);
  React.useEffect(
    () =>
      value9
        ? whenUnfocusedFor(
            () => value10(),
            () => value5((input?: Dynamic) => Math.max(input, value)),
          )
        : undefined,
    [value9, value],
  );
  if (!value9) return null;
  return jsx(
    MountedToast,
    {
      words: sheetMessages.addedToYourMessage(),
      staysUntilClosed: false,
      onOver: () => {
        value5((input?: Dynamic) => Math.max(input, value));
        onGone();
      },
      onTakenDown: onGone,
    },
    value,
  );
}
export const newerPressOf = (input?: Dynamic, options?: Dynamic, context?: Dynamic) =>
  context && options.press > (input?.press ?? 0) ? options : input;
export const SETTLE_POLL_MS = 100;
export const SETTLE_POLLS_NEEDED = Math.ceil(LAST_DONE_SETTLE_MS / SETTLE_POLL_MS);
export const UNFOCUSED_DISMISS_MS = 6000;
