import { Popover } from '../kit/popover.tsx';
import { Button } from '../kit/button.tsx';
import { Icon } from '../kit/icon.tsx';
import { OverflowTooltip, Tooltip, TooltipGroup } from '../kit/tooltip.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { usePopupGivenUpOnBlur } from '../ui/popup-given-up-on-blur.ts';
import { usePopupFieldFocus } from '../ui/popup-field-focus.ts';
import { useBottomInsetWhileOpen, popupCollisionPadding } from '../shell/bottom-insets.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import {
  filterMessages,
  editSortLabel,
  describeFilterLineAlternatives,
  editFilterLineLabel,
  sortMessages,
  removeFilterLineLabel,
  rowsInViewOfAllText,
  alsoHidesCellsText,
} from './filter-messages.ts';
import { sortAndFilterMessages, sortedByWords } from './sort-filter-labels.ts';
import { wrapTabFocusInBar, preventMouseDownDefault } from '../ui/dom-events.ts';
import { CONTEXT_BAR_PART_ATTRIBUTE } from '../ui/toolbar-tooltip.ts';
import { SortFilterCardList } from './sort-filter-card.ts';
import { lookAgainDelay, LOOK_AGAIN_MAX_DELAY_MS } from '../history/cell-history-popover.ts';
import { joinMessageParts } from '../i18n/messages.ts';
import { ContentsBox } from '../ui/contents-box.ts';
import { WordsWithColumnNames } from '../ui/card-rows.ts';
export function SortFilterCardPopover({
  cardToAdd: {
    card: card,
    besideTable: besideTable,
    hangsBesideTable: hangsBesideTable,
    clearAtFoot: clearAtFoot,
    onDrawn: onDrawn,
    onOpenChange: onOpenChange,
    ...listProps
  },
  onColumnAsked: onColumnAsked,
  whatHasCaretAfterCard: whatHasCaretAfterCard,
  timesPressed: timesPressed,
  crossPressed: crossPressed,
}: Dynamic) {
  let addButtonRef = React.useRef(null);
  let isOpen = card !== null;
  let [lastCard, setLastCard] = React.useState(card);
  if (card !== null && card !== lastCard) setLastCard(card);
  let [isBesideTable, setBesideTable] = React.useState(hangsBesideTable);
  if (isOpen && hangsBesideTable !== isBesideTable) setBesideTable(hangsBesideTable);
  let timesPressedRef = React.useRef(null);
  let shut = React.useCallback(() => onOpenChange(false, null), [onOpenChange]);
  let { isGivenUp: isGivenUp, holdPopup: holdPopup, noteFocus: noteFocus } = usePopupGivenUpOnBlur(isOpen, shut);
  let popupRef = React.useRef(null);
  let setPopup = React.useCallback(
    (popup?: Dynamic) => {
      popupRef.current = popup;
      holdPopup(popup);
      onDrawn(popup);
    },
    [holdPopup, onDrawn],
  );
  let initialFocus = usePopupFieldFocus({
    isOpen: isOpen && !isGivenUp,
    popup: popupRef,
    shut: shut,
  });
  let collisionPadding = useBottomInsetWhileOpen(isOpen, false, crossPressed === null);
  React.useLayoutEffect(() => {
    if (isOpen && popupRef.current !== null) onDrawn(popupRef.current);
  }, [isOpen, onDrawn]);
  return jsxs(Fragment, {
    children: [
      crossPressed !== null &&
        jsx(Button, {
          ref: addButtonRef,
          variant: 'ghost',
          size: 'xs',
          iconOnly: true,
          flush: true,
          icon: jsx(Icon, {
            name: 'Add',
            size: 'xs',
          }),
          className: 'text-accent',
          'aria-label': filterMessages.addFilter(),
          tooltip: true,
          'aria-haspopup': 'dialog',
          'aria-expanded': isOpen,
          onClick: (event?: Dynamic) => {
            if (isClickRightAfterCrossPress(crossPressed.current, event)) return;
            timesPressedRef.current = !isOpen && event.detail === 0 ? timesPressed() : null;
            onOpenChange(!isOpen, event.nativeEvent);
          },
        }),
      jsx(Popover.Root, {
        open: isOpen && !isGivenUp,
        onOpenChange: (willOpen: Dynamic, { event: event, reason: reason }: Dynamic) => {
          let isInsideAddButton = event.target instanceof Node && addButtonRef.current?.contains(event.target);
          if (willOpen || isInsideAddButton === true) return;
          let isOnOwnFilterButton = event.target instanceof Element && event.target.closest(OWN_FILTER_BUTTON_SELECTOR) !== null;
          if (reason === 'outside-press' && isOnOwnFilterButton) return;
          if (reason === 'outside-press') timesPressedRef.current = null;
          onOpenChange(false, event);
        },
        children: jsx(Popover.Popup, {
          ref: setPopup,
          anchor: isBesideTable ? besideTable : addButtonRef,
          side: 'bottom',
          align: 'start',
          ...(isBesideTable && {
            collisionAvoidance: SORT_FILTER_COLLISION_AVOIDANCE,
          }),
          collisionPadding: popupCollisionPadding(Math.max(collisionPadding, clearAtFoot)),
          padding: 'none',
          'aria-label': sortAndFilterMessages.sortAndFilter(),
          initialFocus: initialFocus,
          finalFocus: () => {
            let pressCount = timesPressedRef.current;
            timesPressedRef.current = null;
            return openerOwedOrOtherwise({
              owed:
                pressCount === null
                  ? null
                  : {
                      opener: addButtonRef.current,
                      presses: pressCount,
                    },
              pressesNow: timesPressed(),
              otherwise: whatHasCaretAfterCard(),
            });
          },
          onFocus: noteFocus,
          onKeyDown: wrapTabFocusInBar,
          ...{
            [CONTEXT_BAR_PART_ATTRIBUTE]: true,
          },
          children:
            lastCard !== null &&
            jsx(SortFilterCardList, {
              card: lastCard,
              ...listProps,
              onColumnAsked: (tableKey?: Dynamic, columnIndex?: Dynamic) => {
                if (crossPressed === null || addButtonRef.current !== null) onColumnAsked(tableKey, columnIndex, addButtonRef.current);
              },
            }),
        }),
      }),
    ],
  });
}
export function useOwnFilterLookAgain(
  { sheetId: sheetId, behindAsOf: behindAsOf, dayAwaitedSinceTry: dayAwaitedSinceTry }: Dynamic,
  onLookAgain?: Dynamic,
) {
  let behindSinceRef = React.useRef(null);
  React.useEffect(() => {
    if (behindAsOf === null) {
      behindSinceRef.current = null;
      return;
    }
    behindSinceRef.current ??= performance.now();
    let timer = setTimeout(
      () => {
        behindSinceRef.current = null;
        onLookAgain(sheetId);
      },
      lookAgainDelay(performance.now() - behindSinceRef.current),
    );
    return () => clearTimeout(timer);
  }, [sheetId, behindAsOf, onLookAgain]);
  React.useEffect(() => {
    if (dayAwaitedSinceTry === null) return;
    let timer = setTimeout(() => onLookAgain(sheetId), LOOK_AGAIN_MAX_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sheetId, dayAwaitedSinceTry, onLookAgain]);
}
export const OWN_FILTER_BUTTON_SELECTOR = '.sheet-own-filter-button';
export const isEventInsideCurrentTarget = ({ currentTarget: currentTarget, target: target }: Dynamic) =>
  target instanceof Node && currentTarget.contains(target);
export const SORT_FILTER_COLLISION_AVOIDANCE = {
  side: 'none',
  align: 'shift',
  fallbackAxisSide: 'none',
};
export const isElementFocused = (element?: Dynamic) =>
  element.ownerDocument.activeElement === element && element.ownerDocument.hasFocus();
export const isFilterBarAskOpen = (sheetView?: Dynamic) =>
  sheetView.rowsAskedFor?.isOfFilterBar === true && (sheetView.tableThatFilterBarAddsTo !== null || sheetView.rowsAskedFor.isFilterNotDrawnYet);
export const openerOwedOrOtherwise = (caretReturn?: Dynamic) =>
  caretReturn.otherwise !== false && caretReturn.owed?.presses === caretReturn.pressesNow && caretReturn.owed.opener !== null
    ? caretReturn.owed.opener
    : caretReturn.otherwise;
export const whatHasCaretAfterOwnFilterCard = (sheetView?: Dynamic, caretMemory2?: Dynamic) =>
  openerOwedOrOtherwise({
    owed: sheetView.ownFilterBar === null ? null : caretMemory2.owedAfterBack,
    pressesNow: caretMemory2.pressesNow,
    otherwise: sheetView.ownFilterList === null && caretMemory2.afterMenu(),
  });
export const nextRefreshOfferSeen = (seen?: Dynamic, sheetId?: Dynamic, isOffered?: Dynamic) =>
  seen.sheetId === sheetId && seen.isOffered === isOffered
    ? seen
    : {
        sheetId: sheetId,
        isOffered: isOffered,
        hasComeInView: isOffered && seen.sheetId === sheetId,
      };
export const nonBreakingExceptAfterCommas = (words?: Dynamic) => words.replace(/(?<!,) /g, ' ');
export const isClickRightAfterCrossPress = (crossPressed?: Dynamic, click?: Dynamic) =>
  crossPressed !== null &&
  click.timeStamp - crossPressed.timeStamp < 1000 &&
  Math.hypot(click.clientX - crossPressed.clientX, click.clientY - crossPressed.clientY) < 24;
export const FILTER_LINE_PRESS_WINDOW_MS = 1500;
export const OwnFilterBarView = React.memo(function ({
  bar: bar,
  cardToAdd: cardToAdd,
  whatHasCaretAfterCard: whatHasCaretAfterCard,
  onColumnAsked: onColumnAsked,
  columnOpen: columnOpen,
  timesPressed: timesPressed,
  onLineRemoved: onLineRemoved,
  onSortRemoved: onSortRemoved,
  onSortMadeForEveryone: onSortMadeForEveryone,
  onRefreshed: onRefreshed,
  onCleared: onCleared,
  onLookAgain: onLookAgain,
  onGoingWithCaret: onGoingWithCaret,
  onKeyDown: onKeyDown,
  className: className,
  style: style,
  ref: ref,
}: Dynamic) {
  let crossPressWordsRef = React.useRef(null);
  let crossPressedRef = React.useRef(null);
  let caretGoesOnRef = React.useCallback(
    (button?: Dynamic) =>
      () => {
        if (isElementFocused(button)) onGoingWithCaret();
      },
    [onGoingWithCaret],
  );
  useOwnFilterLookAgain(bar, onLookAgain);
  let forYouOnlyId = React.useId();
  let {
    sheetId: sheetId,
    isNothingAsked: isNothingAsked,
    records: records,
    cellsBesideOutOfView: cellsBesideOutOfView,
    isRefreshOffered: isRefreshOffered,
  } = bar;
  let hasCounts = isNothingAsked || records !== null || cellsBesideOutOfView !== '';
  let isFilterTried = cardToAdd?.card?.isFilterTried === true;
  let [linesKept, setLinesKept] = React.useState(bar.lines);
  if (!isFilterTried && linesKept !== bar.lines) setLinesKept(bar.lines);
  let lines = isFilterTried ? linesKept : bar.lines;
  let { sort: sort } = bar;
  let sortShown =
    sort === null
      ? null
      : {
          ...sort,
          words: sortedByWords(sort.said),
        };
  let chips = [
    ...(sortShown === null
      ? []
      : [
          {
            ...sortShown,
            key: 'sort',
            words: [
              {
                setApart: sortShown.words,
              },
            ],
            edit: editSortLabel(sortShown.words),
            onRemoved: () => onSortRemoved(sortShown.tableKey),
          },
        ]),
    ...lines.map(({ tableKey: tableKey, lineIndex: lineIndex, line: line, c: c }: Dynamic) => {
      let lineWords = describeFilterLineAlternatives(line);
      return {
        key: `${tableKey} ${lineIndex}`,
        tableKey: tableKey,
        c: c,
        words: lineWords,
        edit: editFilterLineLabel(joinMessageParts(lineWords)),
        onRemoved: () => onLineRemoved(tableKey, lineIndex),
      };
    }),
  ];
  let [refreshSeen, setRefreshSeen] = React.useState({
    sheetId: sheetId,
    isOffered: isRefreshOffered,
    hasComeInView: false,
  });
  let refreshNow = nextRefreshOfferSeen(refreshSeen, sheetId, isRefreshOffered);
  if (refreshNow !== refreshSeen) setRefreshSeen(refreshNow);
  return jsx('fieldset', {
    ref: ref,
    'aria-label': sort === null ? filterMessages.filter() : sortMessages.bar(!isNothingAsked),
    'aria-describedby': forYouOnlyId,
    className: `sheet-own-filter-bar ${className}`,
    style: style,
    children: jsx(ContentsBox, {
      onMouseDown: (mouseEvent?: Dynamic) => {
        if (isEventInsideCurrentTarget(mouseEvent)) preventMouseDownDefault(mouseEvent);
      },
      onKeyDown: (keyEvent?: Dynamic) => {
        if (isEventInsideCurrentTarget(keyEvent)) onKeyDown(keyEvent);
      },
      children: jsxs('div', {
        className: 'sheet-own-filter-parts',
        children: [
          jsx('span', {
            className: 'sheet-own-filter-glyph',
            children: jsx(Icon, {
              name: 'Filter',
              customSize: 14,
            }),
          }),
          jsxs('div', {
            className: 'sheet-own-filter-asked',
            children: [
              chips.length > 0 &&
                jsx('ul', {
                  className: 'sheet-own-filter-lines scroll-fade-x',
                  children: chips.map(
                    ({ key: key, tableKey: tableKey, words: words, c: c, edit: edit, onRemoved: onRemoved }: Dynamic) =>
                      jsxs(
                        'li',
                        {
                          className: 'sheet-own-filter-line rounded-chip bg-tint-blue text-caption font-medium text-accent',
                          children: [
                            c === null
                              ? jsx(OverflowTooltip, {
                                  className: 'sheet-own-filter-line-words min-w-0',
                                  children: jsx(WordsWithColumnNames, {
                                    words: words,
                                  }),
                                })
                              : jsx('button', {
                                  type: 'button',
                                  className: 'sheet-own-filter-line-edit outline-none focus-visible:shadow-focus focus-visible:outline-hidden',
                                  'aria-haspopup': 'dialog',
                                  'aria-expanded': columnOpen?.tableKey === tableKey && columnOpen.c === c,
                                  'aria-label': edit,
                                  onClick: ({ currentTarget: currentTarget }: Dynamic) => onColumnAsked(tableKey, c, currentTarget),
                                  children: jsx(OverflowTooltip, {
                                    className: 'sheet-own-filter-line-words min-w-0',
                                    children: jsx(WordsWithColumnNames, {
                                      words: words,
                                    }),
                                  }),
                                }),
                            jsx(Button, {
                              ref: caretGoesOnRef,
                              variant: 'ghost',
                              size: 'xxs',
                              iconOnly: true,
                              icon: jsx(Icon, {
                                name: 'X',
                                size: 'xs',
                              }),
                              className: 'sheet-own-filter-line-remove',
                              'aria-label': removeFilterLineLabel(joinMessageParts(words)),
                              onPointerDown: ({ clientX: clientX, clientY: clientY, timeStamp: timeStamp }: Dynamic) => {
                                crossPressWordsRef.current = {
                                  words: joinMessageParts(words),
                                  atMs: timeStamp,
                                };
                                crossPressedRef.current = {
                                  clientX: clientX,
                                  clientY: clientY,
                                  timeStamp: timeStamp,
                                };
                              },
                              onClick: ({ timeStamp: timeStamp }: Dynamic) => {
                                let crossPress = crossPressWordsRef.current;
                                crossPressWordsRef.current = null;
                                if (
                                  !(crossPress !== null && timeStamp - crossPress.atMs < FILTER_LINE_PRESS_WINDOW_MS) ||
                                  crossPress.words === joinMessageParts(words)
                                )
                                  onRemoved();
                              },
                            }),
                          ],
                        },
                        key,
                      ),
                  ),
                }),
              cardToAdd !== null &&
                jsx('div', {
                  className: 'sheet-own-filter-acts',
                  children: jsx(SortFilterCardPopover, {
                    cardToAdd: cardToAdd,
                    onColumnAsked: onColumnAsked,
                    whatHasCaretAfterCard: whatHasCaretAfterCard,
                    timesPressed: timesPressed,
                    crossPressed: crossPressedRef,
                  }),
                }),
              hasCounts &&
                jsxs('ul', {
                  className: 'sheet-own-filter-said',
                  children: [
                    isNothingAsked &&
                      jsx('li', {
                        className: 'sheet-listed-row sheet-own-filter-count',
                        children: filterMessages.allRows(),
                      }),
                    records !== null &&
                      jsx('li', {
                        className: 'sheet-listed-row sheet-own-filter-count tabular-nums',
                        children: rowsInViewOfAllText(records),
                      }),
                    cellsBesideOutOfView !== '' &&
                      jsx('li', {
                        className: 'sheet-listed-row',
                        children: nonBreakingExceptAfterCommas(alsoHidesCellsText(cellsBesideOutOfView)),
                      }),
                  ],
                }),
            ],
          }),
          jsx('span', {
            id: forYouOnlyId,
            className: 'sheet-own-filter-for-whom',
            children: jsxs('span', {
              children: [
                jsx(Icon, {
                  name: 'Lock',
                  size: 'xs',
                }),
                sort === null ? filterMessages.filteredForYouOnly() : sortMessages.forYouOnly(!isNothingAsked),
              ],
            }),
          }),
          jsxs(TooltipGroup, {
            children: [
              isRefreshOffered &&
                jsx(Tooltip, {
                  content: sort === null ? filterMessages.refreshFilter() : sortMessages.refresh(!isNothingAsked),
                  children: jsx(Button, {
                    ref: caretGoesOnRef,
                    variant: 'primary',
                    size: 'xs',
                    className: 'sheet-own-filter-refresh',
                    'data-has-come-in-view': refreshNow.hasComeInView ? '' : undefined,
                    onAnimationEnd: ({ target: target, currentTarget: currentTarget }: Dynamic) => {
                      if (target === currentTarget)
                        setRefreshSeen({
                          ...refreshNow,
                          hasComeInView: false,
                        });
                    },
                    onClick: () => onRefreshed(sheetId),
                    children: filterMessages.refresh(),
                  }),
                }),
              sort?.canBeForEveryone === true &&
                onSortMadeForEveryone !== null &&
                jsx(Tooltip, {
                  content: sortMessages.whatSortForEveryoneDoes(),
                  children: jsx(Button, {
                    ref: caretGoesOnRef,
                    variant: 'ghost',
                    size: 'xs',
                    className: 'text-accent',
                    onClick: (clickEvent?: Dynamic) => {
                      if (!isClickRightAfterCrossPress(crossPressedRef.current, clickEvent)) onSortMadeForEveryone(sort.tableKey);
                    },
                    children: sortMessages.sortForEveryone(),
                  }),
                }),
            ],
          }),
          jsx(Button, {
            ref: caretGoesOnRef,
            variant: 'ghost',
            size: 'xs',
            flush: 'both',
            className: 'text-accent',
            'aria-label': sort === null ? filterMessages.clearAllFilters() : sortMessages.clearAll(!isNothingAsked),
            onClick: (clickEvent?: Dynamic) => {
              if (!isClickRightAfterCrossPress(crossPressedRef.current, clickEvent)) onCleared(sheetId);
            },
            children: filterMessages.clearAll(),
          }),
        ],
      }),
    }),
  });
});
