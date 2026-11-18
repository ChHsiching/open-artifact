import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { LIST_ANSWER_SETTLE_MS } from '../list-under-cell.ts';
export function useSpentInputGuard(options?: Dynamic) {
  let { box: boxRef, field: fieldRef, stands: stands } = options;
  let spentInputRef = React.useRef(NO_SPENT_INPUT);
  let buttonsStandingRef = React.useRef([]);
  let standsBeforeRef = React.useRef(stands);
  let lastPointerRef = React.useRef(null);
  let lastWheelTimeRef = React.useRef(-1 / 0);
  let recordButtonsStanding = React.useCallback(() => {
    buttonsStandingRef.current =
      stands === 'whileAgentWrites'
        ? [...(boxRef.current?.querySelectorAll(':is(button, [data-stands-for-button]):not([inert] *)') ?? [])].map(
            (input?: Dynamic) => ({
              button: input,
              stands: input.getBoundingClientRect(),
            }),
          )
        : [];
  }, [boxRef, stands]);
  React.useLayoutEffect(() => {
    if (standsBeforeRef.current === stands) return recordButtonsStanding();
    let stoodBefore = standsBeforeRef.current;
    standsBeforeRef.current = stands;
    let ownerDocument = boxRef.current?.ownerDocument;
    let activeElement = ownerDocument?.activeElement ?? null;
    let wasCaretInBox = activeElement === ownerDocument?.body || boxRef.current?.contains(activeElement) === true;
    spentInputRef.current = spentInputAfterAgentWrote({
      stoodBefore: stoodBefore,
      stands: stands,
      wasCaretOnWhatWent: wasCaretInBox && activeElement !== fieldRef.current,
      whereButtonsStood: buttonsStandingRef.current.flatMap((input?: Dynamic) => (input.button.isConnected ? [] : [input.stands])),
    });
    lastPointerRef.current = null;
    return recordButtonsStanding();
  });
  let takeSpentInput = React.useCallback(() => {
    let spentInput = spentInputRef.current;
    spentInputRef.current = NO_SPENT_INPUT;
    return spentInput;
  }, []);
  let forget = React.useCallback(() => void takeSpentInput(), [takeSpentInput]);
  return {
    isEnterSpent: () => takeSpentInput().isEnter,
    isPressSpent: (input?: Dynamic) => isStalePress(takeSpentInput(), input),
    forget: forget,
    onWheel: ({ timeStamp: timeStamp }: Dynamic) => {
      lastWheelTimeRef.current = timeStamp;
    },
    onScrolled: ({ timeStamp: timeStamp }: Dynamic) => {
      if (isScrollFromWheel(lastWheelTimeRef.current, timeStamp)) takeSpentInput();
    },
    onCaretLeft: ({ relatedTarget: relatedTarget }: Dynamic) => {
      if (relatedTarget instanceof Node && boxRef.current?.contains(relatedTarget) !== true) takeSpentInput();
    },
    onPointerMoved: (event?: Dynamic) => {
      if (event.pointerType !== 'mouse') return;
      let lastPointer = lastPointerRef.current;
      lastPointerRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      if (hasPointerMoved(lastPointer, event) && !isPressOnGoneButton(spentInputRef.current, event)) takeSpentInput();
    },
    onButtonsMoved: recordButtonsStanding,
  };
}
export const STANDS_FOR_BUTTON_PROPS = {
  'data-stands-for-button': true,
};
export const NO_SPENT_INPUT = {
  isEnter: false,
  isPressIn: [],
  hasAnswer: false,
};
export const isPointInsidePressRect = (
  { left: left, right: right, top: top, bottom: bottom }: Dynamic,
  { clientX: clientX, clientY: clientY }: Dynamic,
) => clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
export const isPressOnGoneButton = ({ isPressIn: isPressIn }: Dynamic, point?: Dynamic) =>
  isPressIn.some((rect?: Dynamic) => isPointInsidePressRect(rect, point));
export const isStalePress = (spentInput?: Dynamic, press?: Dynamic) =>
  isPressOnGoneButton(spentInput, press) &&
  ((press.isByMouse && spentInput.hasAnswer) || press.wentDownAtMs - press.shownAtMs < LIST_ANSWER_SETTLE_MS);
export const hasPointerMoved = (lastPointer?: Dynamic, event?: Dynamic) =>
  lastPointer !== null && (lastPointer.clientX !== event.clientX || lastPointer.clientY !== event.clientY);
export const WHEEL_SCROLL_WINDOW_MS = 300;
export const isScrollFromWheel = (wheelAtMs?: Dynamic, scrollAtMs?: Dynamic) => scrollAtMs - wheelAtMs < WHEEL_SCROLL_WINDOW_MS;
export const spentInputAfterAgentWrote = (change?: Dynamic) =>
  change.stoodBefore === 'whileAgentWrites'
    ? {
        isEnter: change.stands === 'withAnswer' && change.wasCaretOnWhatWent,
        isPressIn: change.whereButtonsStood,
        hasAnswer: change.stands === 'withAnswer',
      }
    : NO_SPENT_INPUT;
