import { Combobox } from '../../kit/combobox.tsx';
import { useUiWindow } from '../../kit/theme.tsx';
import { Icon } from '../../kit/icon.tsx';
import { Tooltip } from '../../kit/tooltip.tsx';
import { Button } from '../../kit/button.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import {
  askFieldKeyAction,
  useFocusAskField,
  useClickGuardOnComingRows,
  agentRowHighlightProps,
  LineWhileAgentLooks,
  KeepOrDiscardBar,
} from '../../agent/agent-rows.ts';
import { scrollItemAboveBottom } from '../menu-scroll.ts';
import { useSpentInputGuard } from './spent-input-guard.ts';
import { NO_LIST_ANSWER_TIMES, reportTimeAfterNextPaint, isWithinClickAfterUp, isTooSoonAfterListAnswer } from '../list-under-cell.ts';
import { useCoarsePointer } from '../../app/media-queries.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { FieldShortcutButton } from './field-shortcut.ts';
import { LiveAnnouncer } from '../live-announcer.ts';
import { TypedSearchAnnouncer } from '../search-announcer.ts';
import { joinWithDots } from '../../messages/conditional-format.ts';
export function askListRowState(options?: Dynamic) {
  let areLive = options.stands === 'atRest';
  let highlighted = areLive ? options.highlighted : null;
  let usableRowIds = options.rows
    .filter(({ isOutOfUse: isOutOfUse }: Dynamic) => isOutOfUse !== true)
    .map(({ id: id }: Dynamic) => id);
  let filled = highlighted ?? (options.doesFirstRowAnswer ? (usableRowIds[0] ?? null) : null);
  let active = areLive ? filled : null;
  return {
    areLive: areLive,
    highlighted: highlighted,
    filled: filled,
    active: active,
    ofEnter: active !== null && usableRowIds.includes(active) ? active : null,
  };
}
export function isRowClickAllowed(options?: Dynamic) {
  let { isWhereStopStood = false, isLikeWhatStoodThere = false } = options;
  if (options.isHeld || (isWhereStopStood && !isLikeWhatStoodThere)) return false;
  if (options.by !== 'mouse' || options.isLitAsEnters || isLikeWhatStoodThere) return true;
  return options.lastMovedOnTo === null ? !options.haveRowsChanged : options.lastMovedOnTo.row === options.row;
}
export function askListKeyAction(event?: Dynamic, options?: Dynamic) {
  let {
    typed: typed,
    stands: stands,
    isRowPointedAt: isRowPointedAt,
    doesFirstRowAnswer: doesFirstRowAnswer,
    isListShut: isListShut,
  } = options;
  if (stands !== 'atRest' && event.key === 'Escape') return 'stepBack';
  if (stands !== 'atRest' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) return 'nothing';
  if (event.key === 'Enter' && options.isHeld) return 'nothing';
  if ((event.key === 'Home' || event.key === 'End') && typed !== '') return 'isOfField';
  let fieldAction = askFieldKeyAction(event, {
    typed: typed,
    stands: stands,
    isRowHighlighted: isRowPointedAt,
  });
  if (fieldAction === 'ask') return doesFirstRowAnswer ? 'takeRowOfEnter' : 'enter';
  return fieldAction === null && event.key === 'Enter' && isListShut ? 'takeRowOfEnter' : fieldAction;
}
export function nextArrowStop(key?: Dynamic, from?: Dynamic, fieldStop?: Dynamic, rowCount?: Dynamic) {
  if (rowCount === 0 || (key !== 'ArrowDown' && key !== 'ArrowUp')) return null;
  let isDown = key === 'ArrowDown';
  if (from === 'field') {
    if (fieldStop === 'none') return isDown ? 0 : 'field';
    return !isDown && fieldStop === 'first' ? rowCount - 1 : null;
  }
  if (isDown) return from === rowCount - 1 ? 'firstRow' : from + 1;
  return from === 0 ? 'field' : from - 1;
}
export function isRowTextClipped(box?: Dynamic, rowId?: Dynamic) {
  let row = box?.ownerDocument.getElementById(rowId) ?? null;
  if (box === null || row === null) return false;
  let { left: boxLeft, right: boxRight2 } = box.getBoundingClientRect();
  let viewportWidth = box.ownerDocument.documentElement.clientWidth;
  return (
    Math.max(boxLeft, viewportWidth - boxRight2) >= TOOLTIP_ROOM_PX &&
    [...row.querySelectorAll('*:not(.sr-only, [data-mark-of-row] *)')].some(
      (input?: Dynamic) => input.scrollWidth > input.clientWidth || input.scrollHeight > input.clientHeight,
    )
  );
}
export function stopKeyEvent(event?: Dynamic) {
  event.preventDefault();
  event.stopPropagation();
}
export function usePointAtRowFirst(listRef?: Dynamic, rowId?: Dynamic, onPointedAt?: Dynamic) {
  let onPointedAtEvent = React.useEffectEvent(onPointedAt);
  React.useLayoutEffect(() => {
    let list = listRef.current;
    let row = rowId === null ? null : (list?.ownerDocument.getElementById(rowId) ?? null);
    let view = list?.ownerDocument.defaultView ?? null;
    if (list === null || row === null || view === null) return;
    row.dispatchEvent(
      new (MouseEvent as Dynamic)('mousemove', {
        bubbles: true,
        movementX: 1,
      }),
    );
    onPointedAtEvent();
    let followedScrollTop: Dynamic = null;
    let resizeObserver = new (view.ResizeObserver as Dynamic)(() => {
      let scroller: Dynamic = row.parentElement;
      while (scroller !== null && scroller !== list && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement;
      if (scroller === null || scroller === list) return;
      if (followedScrollTop !== null && scroller.scrollTop !== followedScrollTop) return;
      scrollItemAboveBottom(row, scroller);
      followedScrollTop = scroller.scrollTop;
    });
    resizeObserver.observe(list);
    let stopFollowing = () => resizeObserver.disconnect();
    SCROLL_FOLLOW_STOP_EVENTS.forEach(
      (input?: Dynamic) =>
        list.addEventListener(input, stopFollowing, {
          once: true,
          passive: true,
        }),
    );
    return () => {
      stopFollowing();
      SCROLL_FOLLOW_STOP_EVENTS.forEach((input?: Dynamic) => list.removeEventListener(input, stopFollowing));
    };
  }, [listRef, rowId]);
}
export function AskOrPickList({
  nameOfField: nameOfField,
  nameOfList: nameOfList,
  placeholder: placeholder,
  text: text,
  idOfWhyFieldIsOutOfUse: idOfWhyFieldIsOutOfUse,
  isFieldLeftOut = false,
  mostCharacters: mostCharacters,
  stands: stands,
  hasAnswer = true,
  isAgentAtWork: isAgentAtWork,
  said: said,
  foundSaid: foundSaid,
  note: note,
  idOfAgentsNote = null,
  overList = NO_OVER_LIST_SECTIONS,
  sections: sections,
  inPlaceOfList: inPlaceOfList,
  doesFirstRowAnswer: doesFirstRowAnswer,
  rowPointedAtFirst: rowPointedAtFirst,
  foot: foot,
  wordsOfFoot: wordsOfFoot,
  isFootUnderRows = false,
  height: height,
  width: width,
  isUnderTitle = false,
  isKeyOfAnother: isKeyOfAnother,
  onTextChange: onTextChange,
  onCompositionBegun: onCompositionBegun,
  onRowPointedAt: onRowPointedAt,
  onRowTaken: onRowTaken,
  onEntered: onEntered,
  onKept: onKept,
  onSteppedBack: onSteppedBack,
}: Dynamic) {
  let boxRef = React.useRef(null);
  let searchFieldRef = React.useRef(null);
  let listRef = React.useRef(null);
  let noteRef = React.useRef(null);
  let fieldRef = isFieldLeftOut ? listRef : searchFieldRef;
  let focusField = useFocusAskField(fieldRef);
  let listId = React.useId();
  let [isInSheet, setIsInSheet] = React.useState(false);
  React.useLayoutEffect(() => {
    setIsInSheet((boxRef.current?.closest('[data-presentation="sheet"]') ?? null) !== null);
  }, []);
  let allRows =
    inPlaceOfList === undefined
      ? sections.flatMap((input?: Dynamic) => [...input.rows, ...(input.lateRows ?? []), ...(input.rowsUnderLateRows ?? [])])
      : [];
  let lateRowsRef = React.useRef(null);
  let lateRowsEaseIn = useClickGuardOnComingRows({
    rows: sections.flatMap(
      ({ lateRows = [], rowsUnderLateRows = [] }: Dynamic) =>
        [...lateRows, ...rowsUnderLateRows.filter(({ easesIn: easesIn }: Dynamic) => easesIn === true)].map(
          ({ id: id }: Dynamic) => ({
            key: id,
          }),
        ),
    ),
    whereRowsCome: lateRowsRef,
    easeInMs: ROW_EASE_IN_MS,
  });
  let [highlightedRow, setHighlightedRow] = React.useState(null);
  let [isRowTooltipOpen, setIsRowTooltipOpen] = React.useState(false);
  let baseHighlightedRef = React.useRef(null);
  let [lastStands, setLastStands] = React.useState(stands);
  let [lastIsFieldLeftOut, setLastIsFieldLeftOut] = React.useState(isFieldLeftOut);
  if (lastStands !== stands || lastIsFieldLeftOut !== isFieldLeftOut) {
    setLastStands(stands);
    setLastIsFieldLeftOut(isFieldLeftOut);
    setHighlightedRow(null);
  }
  let spentInputGuard = useSpentInputGuard({
    box: boxRef,
    field: fieldRef,
    stands: stands === 'whileAgentWrites' ? stands : hasAnswer ? 'withAnswer' : 'otherwise',
  });
  let standsRef = React.useRef(stands);
  let isFieldLeftOutRef = React.useRef(isFieldLeftOut);
  React.useLayoutEffect(() => {
    if (standsRef.current === stands && isFieldLeftOutRef.current === isFieldLeftOut) return;
    standsRef.current = stands;
    isFieldLeftOutRef.current = isFieldLeftOut;
    let ownerDocument = boxRef.current?.ownerDocument;
    let activeElement = ownerDocument?.activeElement ?? null;
    let wasCaretInBox = activeElement === ownerDocument?.body || boxRef.current?.contains(activeElement) === true;
    if (ownerDocument?.hasFocus() !== true || !wasCaretInBox) return;
    if (isFieldLeftOut)
      listRef.current?.focus({
        preventScroll: true,
      });
    else focusField();
  });
  let {
    areLive: areLive,
    highlighted: highlighted,
    filled: filled,
    active: active,
    ofEnter: rowOfEnter,
  } = askListRowState({
    stands: stands,
    highlighted: highlightedRow,
    doesFirstRowAnswer: doesFirstRowAnswer,
    rows: allRows,
  });
  let rowElementId = (input?: Dynamic) =>
    `${listId}-${String(allRows.findIndex((input2?: Dynamic) => input2.id === input))}`;
  let rowIdOfTarget = (target?: Dynamic) => {
    let option = target instanceof Element ? target.closest('[role="option"]') : null;
    return allRows.find(({ id: id }: Dynamic) => rowElementId(id) === option?.id)?.id ?? null;
  };
  let pointerStateRef = React.useRef({
    at: null,
    lastMovedOnTo: null,
    rowsAtFirst: allRows.map(({ id: id }: Dynamic) => id).join(),
    isPressing: false,
    wentDownAtMs: null,
  });
  let onPointerMoveCapture = (event?: Dynamic) => {
    spentInputGuard.onPointerMoved(event);
    if (event.pointerType !== 'mouse') return;
    let { at: lastAt } = pointerStateRef.current;
    let hasMoved = lastAt === null || lastAt[0] !== event.clientX || lastAt[1] !== event.clientY;
    pointerStateRef.current.at = [event.clientX, event.clientY];
    if (hasMoved)
      pointerStateRef.current.lastMovedOnTo = {
        row: rowIdOfTarget(event.target),
      };
  };
  let answerTimingRef = React.useRef(NO_LIST_ANSWER_TIMES);
  let lastActBeforePressRef = React.useRef(NO_LIST_ANSWER_TIMES.lastActAtMs);
  let wasPressOnFieldRef = React.useRef(false);
  let wasPressHeldRef = React.useRef(false);
  let heldEnterAtMsRef = React.useRef(null);
  let lastStandsRef = React.useRef(stands);
  let pageWindow = useUiWindow();
  React.useLayoutEffect(() => {
    let value = stands === 'withDraft' || lastStandsRef.current === 'whileAgentWrites';
    lastStandsRef.current = stands;
    if (!value) return;
    return reportTimeAfterNextPaint(pageWindow, (input?: Dynamic) => {
      answerTimingRef.current = {
        ...answerTimingRef.current,
        answerShownAtMs: input,
      };
    });
  }, [stands, pageWindow]);
  let agentRowIdsKey = [
    ...allRows.flatMap(({ id: id, isOfAgent: isOfAgent }: Dynamic) => (isOfAgent === true ? [id] : [])),
    ...(idOfAgentsNote === null ? [] : [idOfAgentsNote]),
  ].join(`
`);
  let seenAgentRowIdsRef = React.useRef(
    new (Set as Dynamic)(
      agentRowIdsKey.split(`
`),
    ),
  );
  let agentRowsEaseEndMsRef = React.useRef(Number.NEGATIVE_INFINITY);
  React.useLayoutEffect(() => {
    let agentRowIds =
      agentRowIdsKey === ''
        ? []
        : agentRowIdsKey.split(`
`);
    let hasNewAgentRow = agentRowIds.some((input?: Dynamic) => !seenAgentRowIdsRef.current.has(input));
    seenAgentRowIdsRef.current = new (Set as Dynamic)([...seenAgentRowIdsRef.current, ...agentRowIds]);
    if (!hasNewAgentRow) return;
    let prefersReducedMotion2 = pageWindow?.matchMedia('(prefers-reduced-motion:reduce)').matches === true;
    return reportTimeAfterNextPaint(pageWindow, (input?: Dynamic) => {
      agentRowsEaseEndMsRef.current = input + (prefersReducedMotion2 ? 0 : ROW_EASE_IN_MS);
    });
  }, [agentRowIdsKey, seenAgentRowIdsRef, agentRowsEaseEndMsRef, pageWindow]);
  let answerTiming = () => ({
    ...answerTimingRef.current,
    answerShownAtMs: Math.max(answerTimingRef.current.answerShownAtMs, agentRowsEaseEndMsRef.current),
  });
  let noteActAt = (input?: Dynamic) => {
    answerTimingRef.current = {
      ...answerTimingRef.current,
      lastActAtMs: input,
    };
  };
  let onScrollCapture = (event?: Dynamic) => {
    spentInputGuard.onScrolled(event);
    let { at: lastAt } = pointerStateRef.current;
    let elementAtPointer = lastAt === null ? null : (boxRef.current?.ownerDocument.elementFromPoint(...lastAt) ?? null);
    if (elementAtPointer !== null)
      pointerStateRef.current.lastMovedOnTo = {
        row: rowIdOfTarget(elementAtPointer),
      };
  };
  let onMouseUpCapture = (input?: Dynamic) => {
    if (rowIdOfTarget(input.target) !== null) input.stopPropagation();
  };
  let onClickCapture = (event?: Dynamic) => {
    let rowId = rowIdOfTarget(event.target);
    let {
      isPressing: isByMouse,
      lastMovedOnTo: lastMovedOnTo,
      rowsAtFirst: rowsAtFirst,
      wentDownAtMs: wentDownAtMs,
    } = pointerStateRef.current;
    pointerStateRef.current.isPressing = false;
    pointerStateRef.current.wentDownAtMs = null;
    if (event.target === fieldRef.current) return spentInputGuard.forget();
    let heldEnterAtMs = heldEnterAtMsRef.current;
    let isHeld =
      !(wentDownAtMs === null && heldEnterAtMs !== null && isWithinClickAfterUp(heldEnterAtMs, event.timeStamp)) &&
      (wentDownAtMs === null
        ? isTooSoonAfterListAnswer(answerTiming(), event.timeStamp)
        : isTooSoonAfterListAnswer(
            {
              ...answerTiming(),
              lastActAtMs: lastActBeforePressRef.current,
            },
            wentDownAtMs,
          ));
    heldEnterAtMsRef.current = null;
    noteActAt(event.timeStamp);
    let isWhereStopStood = spentInputGuard.isPressSpent({
      clientX: event.clientX,
      clientY: event.clientY,
      isByMouse: isByMouse,
      wentDownAtMs: wentDownAtMs ?? event.timeStamp,
      shownAtMs: answerTimingRef.current.answerShownAtMs,
    });
    wasPressHeldRef.current = isHeld || isWhereStopStood;
    if (event.target instanceof Node && noteRef.current?.contains(event.target) === true && (isHeld || isWhereStopStood)) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (rowId === null) return;
    if (
      isRowClickAllowed({
        by: isByMouse ? 'mouse' : 'other',
        row: rowId,
        lastMovedOnTo: lastMovedOnTo,
        haveRowsChanged: rowsAtFirst !== allRows.map(({ id: id }: Dynamic) => id).join(),
        isHeld: isHeld,
        isLitAsEnters: highlighted === null && rowId === filled,
        isWhereStopStood: isWhereStopStood,
        isLikeWhatStoodThere: allRows.some(
          ({ id: id, isLikeWhatStoodThere: isLikeWhatStoodThere }: Dynamic) => id === rowId && isLikeWhatStoodThere === true,
        ),
      })
    )
      return;
    event.preventDefault();
    event.stopPropagation();
  };
  let ofEnter = askListRowState({
    stands: stands,
    highlighted: null,
    doesFirstRowAnswer: doesFirstRowAnswer,
    rows: allRows,
  }).ofEnter;
  let [answerTakenWithText, setAnswerTakenWithText] = React.useState(null);
  if (answerTakenWithText !== null && answerTakenWithText !== text) setAnswerTakenWithText(null);
  let takeRow = (input?: Dynamic) => {
    if (input === ofEnter) setAnswerTakenWithText(text);
    onRowTaken(input);
  };
  let doesListGrow = doesAskListGrow({
    stands: stands,
    isFootUnderRows: isFootUnderRows,
  });
  let pointAtRow = (input?: Dynamic) => {
    setHighlightedRow(input);
    setIsRowTooltipOpen(false);
    onRowPointedAt(input !== null && allRows.some((input2?: Dynamic) => input2.id === input && input2.isOutOfUse !== true) ? input : null);
  };
  let isTouch = useCoarsePointer();
  let firstUsableRowId = allRows.find(({ isOutOfUse: isOutOfUse }: Dynamic) => isOutOfUse !== true)?.id;
  React.useLayoutEffect(() => {
    if (!isFieldLeftOut || isTouch || highlighted !== null || firstUsableRowId === undefined) return;
    boxRef.current?.ownerDocument.getElementById(rowElementId(firstUsableRowId))?.dispatchEvent(
      new (MouseEvent as Dynamic)('mousemove', {
        bubbles: true,
        movementX: 1,
      }),
    );
    if (baseHighlightedRef.current === firstUsableRowId) pointAtRow(firstUsableRowId);
  });
  usePointAtRowFirst(boxRef, rowPointedAtFirst === undefined || isTouch ? null : rowElementId(rowPointedAtFirst), () => {
    if (rowPointedAtFirst !== undefined && baseHighlightedRef.current === rowPointedAtFirst) pointAtRow(rowPointedAtFirst);
  });
  let moveBetweenArrowStops = (event?: Dynamic) => {
    let arrowStops = [...(boxRef.current?.querySelectorAll('[data-stop-of-arrows]:enabled') ?? [])];
    let stopIndex = arrowStops.findIndex((input?: Dynamic) => input === event.target);
    if (event.target instanceof HTMLButtonElement && event.target.closest('fieldset') !== null && isPagingKey(event.key)) {
      stopKeyEvent(event);
      return true;
    }
    if (stopIndex === -1 && event.target !== fieldRef.current) return false;
    let [firstRow] = allRows;
    let nextStop = nextArrowStop(
      event.key,
      stopIndex === -1 ? 'field' : stopIndex,
      highlighted === null ? 'none' : highlighted === firstRow?.id ? 'first' : 'other',
      stands === 'atRest' ? arrowStops.length : 0,
    );
    if (nextStop === null) return false;
    stopKeyEvent(event);
    if (typeof nextStop === 'number') {
      pointAtRow(null);
      arrowStops[nextStop]?.focus();
      arrowStops[nextStop]?.scrollIntoView({
        block: 'nearest',
      });
      return true;
    }
    fieldRef.current?.focus();
    if (nextStop === 'field' || firstRow === undefined) return true;
    let firstRowElement = boxRef.current?.ownerDocument.getElementById(rowElementId(firstRow.id));
    firstRowElement?.dispatchEvent(
      new (MouseEvent as Dynamic)('mousemove', {
        bubbles: true,
        movementX: 1,
      }),
    );
    if (baseHighlightedRef.current === firstRow.id) pointAtRow(firstRow.id);
    firstRowElement?.scrollIntoView({
      block: 'nearest',
    });
    return true;
  };
  let shownOverList = stands === 'atRest' ? overList : NO_OVER_LIST_SECTIONS;
  let withOverList = (input?: Dynamic) =>
    shownOverList.length === 0
      ? input
      : jsxs('div', {
          className: 'scroll-fade-y flex min-h-0 flex-1 flex-col overflow-y-auto',
          children: [
            shownOverList.map(
              ({ id: id, heading: heading, controls: controls }: Dynamic) =>
                jsxs(
                  'fieldset',
                  {
                    'aria-labelledby': `${listId}-${id}`,
                    className: 'm-0 flex min-w-0 shrink-0 flex-col border-0 p-0',
                    children: [
                      jsx('div', {
                        id: `${listId}-${id}`,
                        className: 'px-md pt-2 pb-1 text-footnote font-medium text-muted select-none',
                        children: heading,
                      }),
                      controls,
                      jsx(Combobox.Separator, {
                        className: 'forced-colors:bg-[CanvasText]',
                      }),
                    ],
                  },
                  id,
                ),
            ),
            input,
          ],
        });
  let onKeyDownCapture = (event?: Dynamic) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return event.stopPropagation();
    if (isKeyOfAnother?.(event) === true) return;
    if (moveBetweenArrowStops(event)) return;
    if (event.target !== fieldRef.current && event.key !== 'Escape') return;
    pointerStateRef.current.wentDownAtMs = null;
    pointerStateRef.current.isPressing = false;
    let isEnterSpent = event.key === 'Enter' && spentInputGuard.isEnterSpent();
    let isAgentsRowOfEnter =
      idOfAgentsNote !== null || allRows.some(({ id: id, isOfAgent: isOfAgent }: Dynamic) => id === rowOfEnter && isOfAgent === true);
    if (event.key !== 'Enter') spentInputGuard.forget();
    let isHeld =
      event.key === 'Enter' &&
      (isEnterSpent ||
        isTooSoonAfterListAnswer(highlighted === null && !isAgentsRowOfEnter ? answerTimingRef.current : answerTiming(), event.timeStamp));
    if (event.key === 'Enter') noteActAt(event.timeStamp);
    let keyAction = askListKeyAction(event, {
      typed: text,
      stands: stands,
      isRowPointedAt: highlighted !== null,
      doesFirstRowAnswer: rowOfEnter !== null,
      isListShut: isInSheet,
      isHeld: isHeld,
    });
    heldEnterAtMsRef.current = keyAction === null && event.key === 'Enter' ? event.timeStamp : null;
    if (keyAction === null) return;
    if (keyAction === 'isOfField') return event.stopPropagation();
    switch ((stopKeyEvent(event), keyAction)) {
      case 'nothing':
        return;
      case 'empty':
        return onTextChange('');
      case 'stepBack':
        focusField();
        return onSteppedBack();
      case 'keep':
        return onKept();
      case 'enter':
        return onEntered();
      case 'takeRowOfEnter':
        return rowOfEnter === null ? undefined : takeRow(rowOfEnter);
    }
  };
  let rowHighlightClass = (input?: Dynamic) => {
    if (highlighted !== null) return '';
    return input === filled ? agentRowHighlightProps.className : 'data-[highlighted]:bg-transparent!';
  };
  let renderRow = ({
    id: id,
    drawn: drawn,
    laysItselfOut = false,
    second: second,
    mark: mark,
    atEnd: atEnd,
    inFull: inFull,
    isChecked = false,
    isTicked: isTicked,
    isOutOfUse = false,
    easesIn = false,
  }: Dynamic) => {
    let item = jsx(
      Combobox.Item,
      {
        render: jsx('div', {
          id: rowElementId(id),
        }),
        value: id,
        'aria-selected': isChecked || undefined,
        'aria-checked': isTicked === 'some' ? 'mixed' : isTicked,
        disabled: isOutOfUse || !areLive,
        description: second,
        className: `${!areLive && !isOutOfUse ? 'opacity-100!' : ''} ${easesIn ? 'sheet-row-eases-in' : ''} ${rowHighlightClass(id)}`,
        children: jsxs('span', {
          className: `flex w-full items-center gap-2 ${laysItselfOut ? 'whitespace-normal' : ''}`,
          children: [
            mark !== undefined &&
              jsx('span', {
                'data-mark-of-row': '',
                className: 'contents',
                children: mark,
              }),
            laysItselfOut
              ? drawn
              : jsx('span', {
                  className: 'min-w-0 flex-1 truncate',
                  children: drawn,
                }),
            atEnd !== undefined &&
              jsx('span', {
                className: 'max-w-[60%] shrink-0 truncate text-footnote text-muted',
                children: atEnd,
              }),
            isChecked &&
              jsx('span', {
                className: 'flex shrink-0 text-accent',
                children: jsx(Icon, {
                  name: 'Check',
                  size: 'md',
                  bold: true,
                }),
              }),
          ],
        }),
      },
      id,
    );
    let tooltipText = inFull ?? (typeof drawn === 'string' ? drawn : undefined);
    return tooltipText === undefined
      ? item
      : jsx(
          Tooltip,
          {
            content: tooltipText,
            side: 'inline-end',
            sideOffset: 10,
            collisionAvoidance: {
              fallbackAxisSide: 'none',
            },
            hoverable: false,
            open: id === highlighted && isRowTooltipOpen,
            children: item,
          },
          id,
        );
  };
  let stepBack = () => {
    focusField();
    onSteppedBack();
  };
  return jsxs('div', {
    ref: boxRef,
    role: 'presentation',
    className: `flex max-h-[var(--available-height)] max-w-[var(--available-width)] flex-col p-[var(--ui-menu-gutter,0.25rem)] [[data-presentation=sheet]_&]:w-full! [[data-presentation=sheet]_&]:max-w-none ${isUnderTitle ? 'min-h-0' : ''}`,
    style:
      typeof height === 'string'
        ? {
            height: height,
            width: width,
          }
        : {
            maxHeight: `min(${height.atMost}, var(--available-height))`,
            width: width,
          },
    onKeyDownCapture: onKeyDownCapture,
    onCompositionStartCapture: onCompositionBegun,
    onPointerMoveCapture: onPointerMoveCapture,
    onWheelCapture: spentInputGuard.onWheel,
    onPointerCancelCapture: spentInputGuard.forget,
    onPointerDownCapture: (input?: Dynamic) => {
      pointerStateRef.current.isPressing = input.pointerType === 'mouse';
      pointerStateRef.current.wentDownAtMs = input.timeStamp;
      wasPressOnFieldRef.current = input.target === fieldRef.current;
      if (wasPressOnFieldRef.current) return;
      lastActBeforePressRef.current = answerTimingRef.current.lastActAtMs;
      noteActAt(input.timeStamp);
    },
    onPointerUpCapture: (input?: Dynamic) => {
      if (!wasPressOnFieldRef.current) noteActAt(input.timeStamp);
      if (input.button === 0) return;
      pointerStateRef.current.wentDownAtMs = null;
      pointerStateRef.current.isPressing = false;
    },
    onMouseUpCapture: onMouseUpCapture,
    onClickCapture: onClickCapture,
    onScrollCapture: onScrollCapture,
    children: [
      isInSheet &&
        !isFieldLeftOut &&
        jsx(FieldShortcutButton, {
          name: nameOfField,
          field: searchFieldRef,
        }),
      jsxs(Combobox.Root, {
        inline: true,
        open: !isInSheet,
        ...(isFieldLeftOut && {
          inputRef: makeInputReadOnly,
        }),
        filter: null,
        items: allRows.map(({ id: id }: Dynamic) => id),
        value: null,
        inputValue: text,
        onInputValueChange: (text2: Dynamic, { reason: reason }: Dynamic) => {
          if (reason !== 'input-change' && text2 !== '') return;
          onTextChange(text2);
        },
        onItemHighlighted: (rowId: Dynamic, { reason: reason }: Dynamic) => {
          baseHighlightedRef.current = rowId ?? null;
          if (reason === 'none' && rowId !== undefined && highlightedRow !== null && rowId !== highlightedRow) {
            boxRef.current?.ownerDocument.getElementById(rowElementId(highlightedRow))?.dispatchEvent(
              new (MouseEvent as Dynamic)('mousemove', {
                bubbles: true,
                movementX: 1,
              }),
            );
            if (baseHighlightedRef.current === highlightedRow) return;
          }
          let highlighted2 = reason === 'none' ? null : (rowId ?? null);
          setHighlightedRow(highlighted2);
          setIsRowTooltipOpen(highlighted2 !== null && isRowTextClipped(boxRef.current, rowElementId(highlighted2)));
          let isUsable = allRows.some((input?: Dynamic) => input.id === highlighted2 && input.isOutOfUse !== true);
          onRowPointedAt(isUsable ? highlighted2 : null);
        },
        onValueChange: (rowId?: Dynamic, details?: Dynamic) => {
          details.cancel();
          if (rowId !== null) takeRow(rowId);
        },
        children: [
          !isFieldLeftOut &&
            jsxs('div', {
              className: `relative -mx-[var(--ui-menu-gutter,0.25rem)] -mt-[var(--ui-menu-gutter,0.25rem)] sheet-divider-under-field shrink-0 ${inPlaceOfList === undefined ? 'mb-1' : ''}`,
              children: [
                jsx(Combobox.PopupSearch, {
                  ref: searchFieldRef,
                  'aria-label': nameOfField,
                  'aria-activedescendant': active === null ? undefined : rowElementId(active),
                  ...(inPlaceOfList !== undefined && {
                    'aria-expanded': false,
                    'aria-controls': undefined,
                  }),
                  'aria-describedby': idOfWhyFieldIsOutOfUse,
                  placeholder: placeholder,
                  readOnly: !areLive || idOfWhyFieldIsOutOfUse !== undefined,
                  maxLength: mostCharacters,
                  spellCheck: false,
                  onKeyDown: (input?: Dynamic) => {
                    if (isKeyOfAnother?.(input) === true) input.preventBaseUIHandler();
                  },
                  className: `m-0 w-full border-b-0 ${areLive && idOfWhyFieldIsOutOfUse === undefined ? '' : 'text-muted'}`,
                }),
                isAgentAtWork && jsx(LineWhileAgentLooks, {}),
              ],
            }),
          jsx(LiveAnnouncer, {
            words: said,
          }),
          foundSaid !== undefined &&
            jsx(TypedSearchAnnouncer, {
              typed: text,
              found: (input?: Dynamic) =>
                shouldAnnounceFound({
                  highlighted: highlighted,
                  rowThatAnswers: ofEnter,
                  isAnswerTaken: answerTakenWithText !== null,
                }) && foundSaid(input),
            }),
          jsx('div', {
            ref: noteRef,
            className: 'contents',
            children: note,
          }),
          inPlaceOfList === undefined
            ? withOverList(
                jsx(Combobox.List, {
                  ref: listRef,
                  'aria-label': nameOfList,
                  ...(isFieldLeftOut && {
                    tabIndex: 0,
                    'aria-activedescendant': active === null ? undefined : rowElementId(active),
                  }),
                  className: shownOverList.length > 0 ? 'max-h-none! flex-none! overflow-visible!' : doesListGrow ? undefined : 'flex-initial',
                  ...lateRowsEaseIn,
                  children: sections.map((section?: Dynamic, sectionIndex?: Dynamic) => {
                    let { id: sectionId, heading: heading, rows: rows, lateRows = [] } = section;
                    let lateRowsGroup =
                      section.lateRows !== undefined &&
                      jsx('div', {
                        ref: lateRowsRef,
                        role: 'presentation',
                        children: lateRows.map(
                          (input?: Dynamic) =>
                            renderRow({
                              ...input,
                              easesIn: true,
                            }),
                        ),
                      });
                    return heading === null
                      ? jsxs(
                          'div',
                          {
                            role: 'presentation',
                            children: [
                              sectionIndex > 0 &&
                                jsx(Combobox.Separator, {
                                  className: 'forced-colors:bg-[CanvasText]',
                                }),
                              rows.map(renderRow),
                              lateRowsGroup,
                              section.rowsUnderLateRows?.map(renderRow),
                            ],
                          },
                          sectionId,
                        )
                      : jsxs(
                          Combobox.Group,
                          {
                            children: [
                              sectionIndex > 0 &&
                                sections[sectionIndex - 1]?.heading !== null &&
                                jsx(Combobox.Separator, {
                                  className: 'forced-colors:bg-[CanvasText]',
                                }),
                              jsx(Combobox.GroupLabel, {
                                children: heading,
                              }),
                              rows.map(renderRow),
                              lateRowsGroup,
                              section.rowsUnderLateRows?.map(renderRow),
                            ],
                          },
                          sectionId,
                        );
                  }),
                }),
              )
            : jsx('div', {
                className: `scroll-fade-y min-h-0 overflow-y-auto pt-1 ${doesListGrow ? 'flex-1' : ''}`,
                children: inPlaceOfList,
              }),
          stands === 'atRest' &&
            foot !== null &&
            jsx(Combobox.Footer, {
              children: foot,
            }),
          stands === 'whileAgentWrites' &&
            inPlaceOfList === undefined &&
            jsx(Combobox.Footer, {
              className: `flex justify-end ${isFootUnderRows ? 'px-md pt-2 pb-1' : 'p-1'}`,
              children: jsx(Button, {
                variant: 'ghost',
                shortcut: 'esc',
                onClick: stepBack,
                children: wordsOfFoot.stop,
              }),
            }),
          stands === 'withDraft' &&
            jsx(Combobox.Footer, {
              className: isFootUnderRows ? 'px-md pt-2 pb-1' : 'p-1',
              children: jsx(KeepOrDiscardBar, {
                words: wordsOfFoot,
                onKept: () => {
                  if (wasPressHeldRef.current) return;
                  focusField();
                  onKept();
                },
                onDiscarded: stepBack,
              }),
            }),
        ],
      }),
    ],
  });
}
export const doesAskListGrow = (options?: Dynamic) => options.stands === 'atRest' || !options.isFootUnderRows;
export const NO_OVER_LIST_SECTIONS: Dynamic = [];
export const askListFoundSaid =
  (found?: Dynamic) =>
  (withRowOfEnter?: Dynamic) => {
    if (found === null) return false;
    let parts = [withRowOfEnter ? found.rowOfEnter : null, found.count, found.note].filter((input?: Dynamic) => input !== null);
    return parts.length > 0 && joinWithDots(parts);
  };
export const shouldAnnounceFound = (state?: Dynamic) =>
  (state.highlighted === null || state.highlighted === state.rowThatAnswers) && !state.isAnswerTaken;
export const labelWithCount = (label?: Dynamic, count?: Dynamic, isCountRead: Dynamic = true) =>
  jsxs('span', {
    className: 'flex items-baseline justify-between gap-2',
    children: [
      jsx('span', {
        children: label,
      }),
      count !== null &&
        jsx('span', {
          'aria-hidden': !isCountRead,
          className: 'font-normal tabular-nums',
          children: count,
        }),
    ],
  });
export const isPagingKey = (key?: Dynamic) => key === 'Home' || key === 'End' || key === 'PageUp' || key === 'PageDown';
export const ARROW_STOP_ATTRIBUTES = {
  'data-stop-of-arrows': '',
};
export const TOOLTIP_ROOM_PX = 256;
export const ROW_EASE_IN_MS = 240;
export const makeInputReadOnly = (input?: Dynamic) => input?.setAttribute('readonly', '');
export const SCROLL_FOLLOW_STOP_EVENTS = ['wheel', 'pointerdown', 'keydown', 'touchstart'];
