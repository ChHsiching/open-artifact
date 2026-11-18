import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { isBrowserReservedKey } from '../keys/key-press.ts';
export function createTypingHold({ store: store, afterMs: afterMs, onChange: onChange }: Dynamic) {
  let isHolding: Dynamic = false;
  let stopTimer: Dynamic = null;
  let setHolding = (holding?: Dynamic) => {
    stopTimer?.();
    if (isHolding !== holding) onChange(holding);
    isHolding = holding;
  };
  let holdUntilSettled = () => {
    setHolding(true);
    let isStopped: Dynamic = false;
    let clearTimer = afterMs(
      TYPING_HOLD_MS,
      () =>
        store.lookOnceEventsAreFinished(() => {
          if (!isStopped) setHolding(false);
        }),
    );
    stopTimer = () => {
      isStopped = true;
      clearTimer();
    };
  };
  return {
    keyOrTextCame: (where?: Dynamic) => {
      if (isHolding || (where === 'inPane' && store.isEventUnfinished())) holdUntilSettled();
      return isHolding;
    },
    keyThatMovesOrLeavesCame: (where?: Dynamic) => {
      if (!isHolding && where === 'inPane' && store.isEventUnfinished()) holdUntilSettled();
      return isHolding;
    },
    keyRepeated: (where?: Dynamic) => isHolding || (where === 'inPane' && store.isEventUnfinished()),
    pressBegan: () => setHolding(false),
    stop: () => stopTimer?.(),
  };
}
export function useTypingHoldForPanes({ store: store, paneRef: paneRef, always: always, isFieldToCome: isFieldToCome }: Dynamic) {
  let [takesNoTyping, setTakesNoTyping] = React.useState(false);
  React.useEffect(() => {
    let ownerDocument = always.current?.ownerDocument;
    let defaultView = ownerDocument?.defaultView;
    if (ownerDocument === undefined || defaultView === null || defaultView === undefined) return;
    let typingHold = createTypingHold({
      store: store,
      afterMs: (delayMs?: Dynamic, callback?: Dynamic) => {
        let timer = defaultView.setTimeout(callback, delayMs);
        return () => defaultView.clearTimeout(timer);
      },
      onChange: setTakesNoTyping,
    });
    let whereEventIs = ({ target: target }: Dynamic) =>
      target instanceof defaultView.Node && paneRef.current?.contains(target) === true && isFieldToCome() ? 'inPane' : 'elsewhere';
    let swallowEvent = (event?: Dynamic) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    let onKeyDown = (event?: Dynamic) => {
      if (MODIFIER_ONLY_KEY_PATTERN.test(event.key) || isBrowserReservedKey(event)) return;
      if (
        event.repeat
          ? typingHold.keyRepeated(whereEventIs(event))
          : MOVE_OR_LEAVE_KEY_PATTERN.test(event.key)
            ? typingHold.keyThatMovesOrLeavesCame(whereEventIs(event))
            : typingHold.keyOrTextCame(whereEventIs(event))
      )
        swallowEvent(event);
    };
    let onTextInput = (event?: Dynamic) => {
      if (event.cancelable && typingHold.keyOrTextCame(whereEventIs(event))) swallowEvent(event);
    };
    ownerDocument.addEventListener('keydown', onKeyDown, true);
    ownerDocument.addEventListener('paste', onTextInput, true);
    ownerDocument.addEventListener('beforeinput', onTextInput, true);
    for (let eventName of TYPING_HOLD_PRESS_EVENTS as Dynamic) ownerDocument.addEventListener(eventName, typingHold.pressBegan, true);
    return () => {
      typingHold.stop();
      ownerDocument.removeEventListener('keydown', onKeyDown, true);
      ownerDocument.removeEventListener('paste', onTextInput, true);
      ownerDocument.removeEventListener('beforeinput', onTextInput, true);
      for (let eventType of TYPING_HOLD_PRESS_EVENTS as Dynamic) ownerDocument.removeEventListener(eventType, typingHold.pressBegan, true);
    };
  }, [store, paneRef, always, isFieldToCome]);
  return takesNoTyping;
}
export const TYPING_HOLD_MS = 1000;
export const MODIFIER_ONLY_KEY_PATTERN =
  /^(?:Shift|Control|Meta|Alt|AltGraph|CapsLock|NumLock|ScrollLock|Fn|FnLock|Insert|Dead|Process|Unidentified)$/;
export const TYPING_HOLD_PRESS_EVENTS = ['pointerdown', 'click'];
export const MOVE_OR_LEAVE_KEY_PATTERN = /^(?:Tab|Escape|F6|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown)$/;
