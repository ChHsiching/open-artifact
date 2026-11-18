import type { Dynamic } from '../dynamic.ts';
import { createHoverOpenTimer, MOUSE_STILL_SLOP } from '../comments/mouse-around.ts';
export function createPenPickerHoverIntent(options?: Dynamic) {
  let current: Dynamic = null;
  let rowUnderPointer: Dynamic = null;
  let rowShutByPress: Dynamic = null;
  let firstPointerPlace: Dynamic = null;
  let nearestDistance: Dynamic = null;
  let wasHeldBefore: Dynamic = false;
  let setCurrent = (input?: Dynamic) => {
    current = input;
    if (input !== null) wasHeldBefore = input.isHeld;
    options.onChanged(input);
  };
  let createPickerTimer = (input?: Dynamic) =>
    createHoverOpenTimer({
      open() {
        if (current?.isHeld === true) return;
        stopTimers();
        nearestDistance = null;
        setCurrent({
          picker: input,
          isHeld: false,
        });
      },
      shut: () => (current?.picker === input && !current.isHeld ? setCurrent(null) : undefined),
      restMs: PEN_PICKER_REST_MS,
      leaveMs: PEN_PICKER_LEAVE_MS,
      after: options.after,
    });
  let timers = {
    color: createPickerTimer('color'),
    style: createPickerTimer('style'),
  };
  let stopTimers = () => {
    timers.color.stop();
    timers.style.stop();
  };
  let hasPointerMoved2 = (input?: Dynamic, options2?: Dynamic) => {
    if (firstPointerPlace === 'hasMoved') return true;
    if (firstPointerPlace !== null && (firstPointerPlace.x !== input || firstPointerPlace.y !== options2)) {
      firstPointerPlace = 'hasMoved';
      return true;
    }
    firstPointerPlace = {
      x: input,
      y: options2,
    };
    return false;
  };
  let pointerOnPicker = (input?: Dynamic, options2?: Dynamic) => {
    nearestDistance = options2 ? null : 1 / 0;
    if (options2) timers[input].entered();
    else timers[input].left();
  };
  let shutPicker = (input?: Dynamic) => {
    stopTimers();
    if (rowUnderPointer === input) rowShutByPress = input;
    if (current !== null) setCurrent(null);
  };
  return {
    pointerOnRow(input?: Dynamic, options2?: Dynamic, context?: Dynamic) {
      rowUnderPointer = input;
      if (!hasPointerMoved2(options2, context) || rowShutByPress === input) return;
      if (current?.picker === input) pointerOnPicker(input, true);
      else timers[input].restedOn(options2, context);
    },
    pointerOffRow(input?: Dynamic) {
      rowUnderPointer = null;
      rowShutByPress = null;
      if (current?.picker === input) pointerOnPicker(input, false);
      else timers[input].movedOff();
    },
    pointerOnPicker: (input?: Dynamic) => (current?.picker === input ? pointerOnPicker(input, true) : undefined),
    pointerOffPicker: (input?: Dynamic) => (current?.picker === input ? pointerOnPicker(input, false) : undefined),
    pointerDistanceFromPicker(input?: Dynamic) {
      if (current === null || current.isHeld || nearestDistance === null) return;
      if (input > nearestDistance - MOUSE_STILL_SLOP) return;
      nearestDistance = input;
      timers[current.picker].entered();
      timers[current.picker].left();
    },
    held(input?: Dynamic) {
      if (current?.picker === input && !current.isHeld)
        setCurrent({
          picker: input,
          isHeld: true,
        });
    },
    openedByPressOrKey(input?: Dynamic) {
      stopTimers();
      setCurrent({
        picker: input,
        isHeld: true,
      });
    },
    shutByDesignSystem(input?: Dynamic) {
      if (current?.picker === input) shutPicker(input);
    },
    rowAboutToOpenIt(input?: Dynamic, options2?: Dynamic) {
      if (options2 === 'arrowKey' || current?.isHeld !== true) shutPicker(input);
    },
    wasHeld: () => wasHeldBefore,
    stop: stopTimers,
  };
}
export const PEN_PICKER_REST_MS = 100;
export const PEN_PICKER_LEAVE_MS = 300;
