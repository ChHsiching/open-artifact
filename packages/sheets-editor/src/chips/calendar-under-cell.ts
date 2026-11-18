import { FieldError, FieldRoot } from '../kit/field.tsx';
import { TextInput } from '../kit/text-input.tsx';
import { Calendar } from '../kit/calendar.tsx';
import { Popover } from '../kit/popover.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { timeTypedAs, secondsOfTime } from './time-of-day.ts';
import { enterTimeHint, timeValueLabel } from '../i18n/grid-action-labels.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { offerKeyboardWhenReady } from '../ui/keyboard-handoff.ts';
import { comboboxAriaProps } from '../ui/list-under-cell.ts';
import { isoDayOfDate, EARLIEST_ISO_DAY, LATEST_ISO_DAY } from './calendar.ts';
import { useCoveredUnderCells, popupCollisionPadding } from '../shell/bottom-insets.ts';
import { useOnPhone } from '../app/media-queries.ts';
import { DOUBLE_TAP_GAP_MS } from '../selection/finger-taps.ts';
import { calendarLabel } from '../i18n/ui-labels.ts';
export function wrapTabInCalendar(event?: Dynamic) {
  if (event.key !== 'Tab') return;
  let focusables = [...event.currentTarget.querySelectorAll('button:enabled, [tabindex="0"], input:enabled')];
  let [edgeElement, wrapTo] = event.shiftKey ? [focusables.at(0), focusables.at(-1)] : [focusables.at(-1), focusables.at(0)];
  if (edgeElement !== event.currentTarget.ownerDocument.activeElement) return;
  event.preventDefault();
  wrapTo?.focus({
    preventScroll: true,
  });
}
export function swallowKeyEvent(event?: Dynamic) {
  event.preventDefault();
  event.stopPropagation();
}
export function CalendarTimeRow({
  time: time,
  timeNotEnteredRef: timeNotEnteredRef,
  onTodayChosen: onTodayChosen,
  onTimeChosen: onTimeChosen,
  onShut: onShut,
}: Dynamic) {
  let [typedTime, setTypedTime] = React.useState(null);
  let [isTimeRefused, setIsTimeRefused] = React.useState(false);
  let timeInputRef = React.useRef(null);
  let timeButtonRef = React.useRef(null);
  let rowRef = React.useRef(null);
  let isTyping = typedTime !== null;
  let isFocusMovingRef = React.useRef(false);
  let isLeavingByTabRef = React.useRef(false);
  React.useEffect(() => {
    if (!isFocusMovingRef.current) return;
    isFocusMovingRef.current = false;
    (isTyping ? timeInputRef : timeButtonRef).current?.focus({
      preventScroll: true,
    });
  }, [isTyping]);
  React.useEffect(() => {
    let rowDocument = rowRef.current?.ownerDocument;
    let onPointerDownOutside = ({ target: target }: Dynamic) => {
      let timeNotEntered = timeNotEnteredRef.current;
      let dialog = rowRef.current?.closest('[role="dialog"]');
      let isInsideDialog = target instanceof Node && dialog?.contains(target) === true;
      if (timeNotEntered === null || isInsideDialog) return;
      timeNotEnteredRef.current = null;
      onTimeChosen(timeNotEntered, 'pressOutside');
    };
    rowDocument?.addEventListener('pointerdown', onPointerDownOutside, true);
    return () => rowDocument?.removeEventListener('pointerdown', onPointerDownOutside, true);
  }, [timeNotEnteredRef, onTimeChosen]);
  React.useEffect(
    () => () => {
      timeNotEnteredRef.current = null;
    },
    [timeNotEnteredRef],
  );
  let typeTime = (timeText?: Dynamic) => {
    let typedTimeParsed = timeTypedAs(timeText ?? '');
    let heldTime = timeTypedAs(time.held);
    let isSameAsHeld = typedTimeParsed !== null && heldTime !== null && secondsOfTime(typedTimeParsed) === secondsOfTime(heldTime);
    timeNotEnteredRef.current = isSameAsHeld ? null : typedTimeParsed;
    setIsTimeRefused(false);
    setTypedTime(timeText);
  };
  let startTyping = (timeText?: Dynamic) => {
    isFocusMovingRef.current = true;
    typeTime(timeText);
  };
  let timeRefusal = isTimeRefused ? enterTimeHint(time.example.replace(' ', ' ')) : null;
  return jsxs(FieldRoot, {
    invalid: isTimeRefused,
    className: 'sheet-divider-over-group w-0 min-w-full pt-sm',
    children: [
      jsxs('div', {
        ref: rowRef,
        className: 'flex items-center justify-between',
        children: [
          jsx(Button, {
            variant: 'secondary',
            size: 'sm',
            onClick: onTodayChosen,
            children: sheetMessages.today(),
          }),
          typedTime === null
            ? jsx(Button, {
                ref: timeButtonRef,
                variant: 'ghost',
                size: 'sm',
                'aria-label': timeValueLabel(time.held),
                onClick: () => startTyping(time.held),
                onKeyDown: (event?: Dynamic) => {
                  if (!(event.key.length === 1 && event.key !== ' ') || event.ctrlKey || event.metaKey) return;
                  event.preventDefault();
                  event.stopPropagation();
                  startTyping(event.key);
                },
                children: time.held,
              })
            : jsx(TextInput, {
                ref: timeInputRef,
                size: 'sm',
                fullWidth: false,
                className: 'w-24 text-end',
                'aria-label': sheetMessages.time(),
                autoComplete: 'off',
                autoCapitalize: 'off',
                autoCorrect: 'off',
                spellCheck: false,
                value: typedTime,
                onFocus: ({ currentTarget: currentTarget }: Dynamic) => {
                  if (typedTime === time.held) currentTarget.select();
                },
                onChange: ({ target: target }: Dynamic) => typeTime(target.value),
                onBlur: () => {
                  if (isLeavingByTabRef.current) typeTime(null);
                  isLeavingByTabRef.current = false;
                },
                onKeyDown: (event?: Dynamic) => {
                  if (event.key !== 'Tab') event.stopPropagation();
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                  let timeNotEntered = timeNotEnteredRef.current;
                  if (event.key === 'Escape') startTyping(null);
                  if (event.key === 'Tab') {
                    isLeavingByTabRef.current = true;
                    if (timeNotEntered !== null) onTimeChosen(timeNotEntered, 'tabKey');
                  }
                  if (event.key !== 'Enter') return;
                  if (timeNotEntered !== null) onTimeChosen(timeNotEntered, 'enterKey');
                  else if (timeTypedAs(typedTime) === null) setIsTimeRefused(true);
                  else onShut();
                },
              }),
        ],
      }),
      timeRefusal !== null &&
        jsx(FieldError, {
          match: true,
          children: timeRefusal,
        }),
      jsx('p', {
        role: 'alert',
        className: 'sr-only',
        children: timeRefusal,
      }),
    ],
  });
}
export function CalendarKeyWatcher(props?: Dynamic) {
  let markerRef = React.useRef(null);
  let [doesDayTakeKeys] = React.useState(props.doesDayTakeIt);
  let { isShut: isShut } = props;
  let onShutEvent = React.useEffectEvent(props.onShut);
  let onKeyBroughtItEvent = React.useEffectEvent(props.onKeyBroughtIt);
  React.useEffect(() => {
    let calendarBox = markerRef.current?.parentElement ?? null;
    if (calendarBox === null || !doesDayTakeKeys || isShut) return;
    let focusDay = () =>
      calendarBox.querySelector('[role="grid"] [tabindex="0"]')?.focus({
        preventScroll: true,
      });
    let isInsideCalendar = ({ target: target }: Dynamic) =>
      target instanceof Node && calendarBox.closest(`#${CALENDAR_UNDER_CELL_ID}`)?.contains(target) === true;
    return offerKeyboardWhenReady(calendarBox, focusDay, {
      keys: {
        onShut: onShutEvent,
        handOn: (input?: Dynamic) => {
          if (!isInsideCalendar(input)) onKeyBroughtItEvent(input);
        },
      },
    });
  }, [doesDayTakeKeys, isShut]);
  return jsx('span', {
    ref: markerRef,
    hidden: true,
  });
}
export function nextCalendarUnderCellState(
  state: Dynamic,
  { calendar: calendar, isEntryOpen: isEntryOpen, timesAsked: timesAsked }: Dynamic,
  isKeyboardLeftOutside?: Dynamic,
) {
  let isAskedAgain = calendar !== null && timesAsked > state.timesAsked;
  let keepsCaretOnDays = state.calendar !== null && isEntryOpen === state.isEntryOpen && state.isCaretOnDays;
  let isCaretOnDays = isAskedAgain || (calendar !== null && keepsCaretOnDays);
  let doesDayTakeKeys = doesCalendarDayTakeKeys({
    isEntryOpen: isEntryOpen,
    timesAsked: timesAsked,
    isCaretOnDays: isCaretOnDays,
  });
  let isGivenUp = calendar !== null && (state.isGivenUp || doesDayTakeKeys) && isKeyboardLeftOutside();
  let shownFrom = calendar === null || isGivenUp ? state : calendar;
  let isReopened = state.isGivenUp && !isGivenUp;
  return {
    calendar: calendar,
    day: shownFrom.day,
    time: shownFrom.time,
    timesOpened: state.timesOpened + (calendar !== null && (state.calendar === null || isReopened) ? 1 : 0),
    dayThatCameWithTime: state.calendar === null ? null : state.dayThatCameWithTime,
    isCaretOnDays: isCaretOnDays,
    timesAnswered: state.timesAnswered + (isAskedAgain && !isGivenUp ? 1 : 0),
    isGivenUp: isGivenUp,
    isEntryOpen: isEntryOpen,
    timesAsked: timesAsked,
  };
}
export const CALENDAR_UNDER_CELL_ID = 'calendar-under-cell';
export const CALENDAR_REOPEN_DELAY_MS = 50;
export const CALENDAR_GIVE_UP_EVENTS = ['focus', 'pointerdown', 'click', 'keydown'];
export const calendarCellComboboxProps = (isOpen?: Dynamic, cellChip?: Dynamic) =>
  cellChip !== null
    ? comboboxAriaProps(true, cellChip)
    : {
        role: 'combobox',
        'aria-haspopup': 'dialog',
        'aria-expanded': isOpen,
        ...(isOpen && {
          'aria-controls': CALENDAR_UNDER_CELL_ID,
        }),
      };
export const doesCalendarDayTakeKeys = ({
  isEntryOpen: isEntryOpen,
  timesAsked: timesAsked,
  isCaretOnDays: isCaretOnDays,
}: Dynamic) => !isEntryOpen || (timesAsked > 0 && isCaretOnDays);
export const initialCalendarUnderCellState = ({ isEntryOpen: isEntryOpen, timesAsked: timesAsked }: Dynamic) => ({
  calendar: null,
  day: null,
  time: null,
  timesOpened: 0,
  dayThatCameWithTime: null,
  isCaretOnDays: false,
  timesAnswered: 0,
  isGivenUp: false,
  isEntryOpen: isEntryOpen,
  timesAsked: timesAsked,
});
export const CalendarUnderCell = React.memo(function ({
  popupRef: popupRef,
  calendar: calendar,
  anchor: anchor,
  isEntryOpen: isEntryOpen,
  timesAsked: timesAsked,
  whatHasCaretAfter: whatHasCaretAfter,
  isKeyboardLeftOutside: isKeyboardLeftOutside,
  onGivenUp: onGivenUp,
  onShut: onShut,
  onDayChosen: onDayChosen,
  onTimeChosen: onTimeChosen,
  onKeyDown: onKeyDown,
  onKeyBroughtCaret: onKeyBroughtCaret,
}: Dynamic) {
  let [calendarState, setCalendarState] = React.useState(
    () =>
      initialCalendarUnderCellState({
        isEntryOpen: isEntryOpen,
        timesAsked: timesAsked,
      }),
  );
  if (!(calendar === calendarState.calendar && isEntryOpen === calendarState.isEntryOpen && timesAsked === calendarState.timesAsked))
    setCalendarState(
      nextCalendarUnderCellState(
        calendarState,
        {
          calendar: calendar,
          isEntryOpen: isEntryOpen,
          timesAsked: timesAsked,
        },
        isKeyboardLeftOutside,
      ),
    );
  let { isGivenUp: isGivenUp } = calendarState;
  React.useEffect(() => {
    if (!isGivenUp || calendar === null) return;
    let giveUp = () => onGivenUp(calendar);
    giveUp();
    let controller = new (AbortController as Dynamic)();
    for (let eventType of CALENDAR_GIVE_UP_EVENTS as Dynamic)
      (window as Dynamic).addEventListener(eventType, giveUp, {
        capture: true,
        signal: controller.signal,
      });
    return () => controller.abort();
  }, [isGivenUp, calendar, onGivenUp]);
  let onKeyDownInCalendar = React.useCallback(
    (input?: Dynamic) => {
      wrapTabInCalendar(input);
      onKeyDown(input);
    },
    [onKeyDown],
  );
  let isKeyFreshRef = React.useRef(false);
  let onBlurInCalendar = React.useCallback(({ currentTarget: currentTarget, relatedTarget: relatedTarget }: Dynamic) => {
    if (relatedTarget instanceof Node && !currentTarget.contains(relatedTarget)) isKeyFreshRef.current = false;
  }, []);
  let swallowHeldKeys = React.useCallback((input?: Dynamic) => {
    if (!input.repeat) isKeyFreshRef.current = true;
    else if (!isKeyFreshRef.current) swallowKeyEvent(input);
  }, []);
  let noteCaretOnDays = React.useCallback(
    () =>
      setCalendarState(
        (input?: Dynamic) =>
          input.isCaretOnDays
            ? input
            : {
                ...input,
                isCaretOnDays: true,
              },
      ),
    [],
  );
  let noteCaretLeftDays = React.useCallback(({ currentTarget: currentTarget, relatedTarget: relatedTarget }: Dynamic) => {
    if (!(relatedTarget instanceof Node && currentTarget.contains(relatedTarget)))
      setCalendarState(
        (input?: Dynamic) =>
          input.isCaretOnDays
            ? {
                ...input,
                isCaretOnDays: false,
              }
            : input,
      );
  }, []);
  let timeNotEnteredRef = React.useRef(null);
  let chooseDay = React.useCallback((input?: Dynamic) => onDayChosen(input, timeNotEnteredRef.current), [onDayChosen]);
  let chooseToday = React.useCallback(() => chooseDay(isoDayOfDate(new (Date as Dynamic)())), [chooseDay]);
  let chooseTime = React.useCallback(
    (time?: Dynamic, how?: Dynamic) => {
      let today2 = isoDayOfDate(new (Date as Dynamic)());
      if (how === 'tabKey')
        setCalendarState(
          (input?: Dynamic) =>
            input.day === null
              ? {
                  ...input,
                  dayThatCameWithTime: today2,
                }
              : input,
        );
      onTimeChosen(time, today2, how === 'enterKey' ? 'shuts' : 'stays');
    },
    [onTimeChosen],
  );
  let onOpenChange = React.useCallback(
    (input?: Dynamic) => {
      if (!input) onShut();
    },
    [onShut],
  );
  let coveredUnderCells = useCoveredUnderCells();
  let isOnPhone2 = useOnPhone();
  let { timesOpened: timesOpened } = calendarState;
  let [shownTimesOpened, setShownTimesOpened] = React.useState(timesOpened);
  let isReopenHeld = isOnPhone2 && shownTimesOpened !== timesOpened;
  React.useEffect(() => {
    if (!isReopenHeld) return;
    let showReopened = () => setShownTimesOpened(timesOpened);
    let timer: Dynamic = setTimeout(showReopened, DOUBLE_TAP_GAP_MS);
    let controller = new (AbortController as Dynamic)();
    let listenerOptions = {
      capture: true,
      signal: controller.signal,
    };
    (window as Dynamic).addEventListener('pointerdown', () => clearTimeout(timer), listenerOptions);
    let restartTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(showReopened, CALENDAR_REOPEN_DELAY_MS);
    };
    for (let eventType of ['pointerup', 'pointercancel'] as Dynamic) (window as Dynamic).addEventListener(eventType, restartTimer, listenerOptions);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isReopenHeld, timesOpened]);
  let calendarKey = `${timesOpened} ${calendarState.timesAnswered} ${calendarState.day === calendarState.dayThatCameWithTime ? null : calendarState.day}`;
  return jsx(Popover.Root, {
    open: calendar !== null && !calendarState.isGivenUp && !isReopenHeld,
    onOpenChange: onOpenChange,
    children: jsx(Popover.Popup, {
      ref: popupRef,
      id: CALENDAR_UNDER_CELL_ID,
      anchor: anchor,
      align: 'start',
      collisionPadding: popupCollisionPadding(coveredUnderCells),
      padding: 'sm',
      'aria-label': calendarLabel(),
      initialFocus: false,
      finalFocus: whatHasCaretAfter,
      keepFocus: true,
      onFocusCapture: onBlurInCalendar,
      onKeyDownCapture: swallowHeldKeys,
      onKeyDown: onKeyDownInCalendar,
      children: jsxs('div', {
        className: 'flex flex-col gap-sm',
        children: [
          jsxs('div', {
            className: 'contents',
            onFocus: noteCaretOnDays,
            onBlur: noteCaretLeftDays,
            children: [
              jsx(
                Calendar,
                {
                  'aria-label': sheetMessages.dateToPick(),
                  value: calendarState.day,
                  onChange: chooseDay,
                  minDate: EARLIEST_ISO_DAY,
                  maxDate: LATEST_ISO_DAY,
                },
                calendarKey,
              ),
              jsx(
                CalendarKeyWatcher,
                {
                  doesDayTakeIt:
                    !calendarState.isGivenUp &&
                    doesCalendarDayTakeKeys({
                      ...calendarState,
                      isEntryOpen: isEntryOpen,
                      timesAsked: timesAsked,
                    }),
                  isShut: calendar === null || calendarState.isGivenUp,
                  onShut: onShut,
                  onKeyBroughtIt: onKeyBroughtCaret,
                },
                `after ${calendarKey}`,
              ),
            ],
          }),
          calendarState.time === null
            ? jsx('div', {
                className: 'sheet-divider-over-group pt-sm',
                children: jsx(Button, {
                  variant: 'secondary',
                  size: 'sm',
                  onClick: chooseToday,
                  children: sheetMessages.today(),
                }),
              })
            : jsx(
                CalendarTimeRow,
                {
                  time: calendarState.time,
                  timeNotEnteredRef: timeNotEnteredRef,
                  onTodayChosen: chooseToday,
                  onTimeChosen: chooseTime,
                  onShut: onShut,
                },
                calendarState.timesOpened,
              ),
        ],
      }),
    }),
  });
});
