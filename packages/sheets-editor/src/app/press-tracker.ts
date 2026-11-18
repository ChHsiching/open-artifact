import type { Dynamic } from '../dynamic.ts';
export function createPressTracker(cellsElement?: Dynamic, nowMs2: Dynamic = () => performance.now()) {
  let pressStartedAt: Dynamic = null;
  let pressEndedAt: Dynamic = null;
  let wasPressCancelled: Dynamic = false;
  let afterPressRun: Dynamic = null;
  let pressCount: Dynamic = 0;
  let actedAt: Dynamic = null;
  let touchStartedAt: Dynamic = null;
  let wasTouchAct: Dynamic = false;
  let wasKeyAct: Dynamic = false;
  let focusLeftCount: Dynamic = 0;
  let caretLeftCount: Dynamic = 0;
  let onPressStart = (event?: Dynamic) => {
    pressStartedAt = nowMs2();
    if (event.type === 'pointerdown' || touchStartedAt === null) wasPressCancelled = false;
    pressCount += 1;
    if (event.type === 'pointerdown') touchStartedAt = 'pointerType' in event && event.pointerType === 'touch' ? pressStartedAt : null;
  };
  let onPressEnd = (event?: Dynamic) => {
    if (event.type === 'pointerup' && 'pointerType' in event && event.pointerType === 'touch' && touchStartedAt !== null) touchStartedAt = nowMs2();
    let runAfterPress = afterPressRun;
    if (pressStartedAt !== null && !wasPressCancelled) pressEndedAt = nowMs2();
    pressStartedAt = null;
    afterPressRun = null;
    runAfterPress?.();
  };
  let onBlur = () => {
    if (pressStartedAt !== null || touchStartedAt !== null) wasPressCancelled = true;
    pressStartedAt = null;
    pressEndedAt = null;
    afterPressRun = null;
    actedAt = null;
    wasKeyAct = false;
    focusLeftCount += 1;
    caretLeftCount += 1;
  };
  let onAct = (event?: Dynamic) => {
    if (event.type !== 'click') return void (wasKeyAct = true);
    if (wasPressCancelled && 'detail' in event && event.detail !== 0) {
      wasPressCancelled = false;
      touchStartedAt = null;
      return;
    }
    actedAt = nowMs2();
    wasTouchAct = 'detail' in event && event.detail !== 0 && touchStartedAt !== null && actedAt - touchStartedAt < 1000;
    touchStartedAt = null;
  };
  for (let eventType of PRESS_START_EVENTS as Dynamic) cellsElement.addEventListener(eventType, onPressStart, true);
  for (let eventType of PRESS_END_EVENTS as Dynamic) cellsElement.addEventListener(eventType, onPressEnd, true);
  for (let eventType of ACT_EVENTS as Dynamic) cellsElement.addEventListener(eventType, onAct, true);
  cellsElement.addEventListener('blur', onBlur);
  let isPressUnderWay = () => pressStartedAt !== null && nowMs2() - pressStartedAt < 1000;
  let focusLeftTo: Dynamic = null;
  let noteCaretLeft = () => {
    let leftTo = focusLeftTo;
    focusLeftTo = null;
    if (leftTo !== null && 'isConnected' in leftTo && leftTo.isConnected === true) caretLeftCount += 1;
  };
  let onFocusOut = (event?: Dynamic) => {
    noteCaretLeft();
    if ('relatedTarget' in event && event.relatedTarget === null && !isPressUnderWay()) focusLeftTo = event.target;
  };
  cellsElement.addEventListener('focusout', onFocusOut, true);
  return {
    afterPress(run?: Dynamic) {
      if (isPressUnderWay()) afterPressRun = run;
      else run();
    },
    isUnderWay: isPressUnderWay,
    timesBegun: () => pressCount,
    hasPersonActedSinceFocusLeft: (which: Dynamic = 'keysToo') =>
      (actedAt !== null && (wasTouchAct || nowMs2() - actedAt < 1000)) || (which === 'keysToo' && wasKeyAct) || isPressUnderWay(),
    noteActInShell(): void {
      actedAt = nowMs2();
      wasTouchAct = false;
    },
    hasPressJustEnded: () => pressEndedAt !== null && nowMs2() - pressEndedAt < 500,
    timesFocusLeft: () => focusLeftCount,
    timesCaretLeft() {
      noteCaretLeft();
      return caretLeftCount;
    },
    stop() {
      for (let eventType of PRESS_START_EVENTS as Dynamic) cellsElement.removeEventListener(eventType, onPressStart, true);
      for (let eventType of PRESS_END_EVENTS as Dynamic) cellsElement.removeEventListener(eventType, onPressEnd, true);
      for (let eventType of ACT_EVENTS as Dynamic) cellsElement.removeEventListener(eventType, onAct, true);
      cellsElement.removeEventListener('blur', onBlur);
      cellsElement.removeEventListener('focusout', onFocusOut, true);
    },
  };
}
export const PRESS_START_EVENTS = ['pointerdown', 'mousedown'];
export const PRESS_END_EVENTS = ['pointerup', 'pointercancel', 'mouseup', 'contextmenu', 'dragstart'];
export const ACT_EVENTS = ['click', 'keydown'];
export const QUICK_FOCUS_RETURN_MS = 1000;
