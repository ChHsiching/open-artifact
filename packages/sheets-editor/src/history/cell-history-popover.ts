import { SegmentedControl } from '../kit/segmented-control.tsx';
import { Popover } from '../kit/popover.tsx';
import { Avatar } from '../kit/avatar.tsx';
import { Skeleton, SkeletonGroup } from '../kit/skeleton.tsx';
import { Button } from '../kit/button.tsx';
import { Icon } from '../kit/icon.tsx';
import { AGENT_NAME } from '../agent/agent-name.ts';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { formatTimeOfDay, dayOfVersion, formatShortDate } from './version-text.ts';
import { translateMessage } from '../i18n/messages.ts';
import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { DrawnAndSaid } from '../agent/agent-rows.ts';
import { withDecimalSign } from '../format/number-signs.ts';
import { useBottomInsetWhileOpen, popupCollisionPadding } from '../shell/bottom-insets.ts';
export function formatEditTime(editTime?: Dynamic, now?: Dynamic) {
  let date = formatTimeOfDay(editTime);
  switch (dayOfVersion(editTime, now)) {
    case 'today':
      return translateMessage(
        {
          defaultMessage: 'Today, {time}',
          id: 'yJMGSYOCBa',
        },
        {
          time: date,
        },
      );
    case 'yesterday':
      return translateMessage(
        {
          defaultMessage: 'Yesterday, {time}',
          id: 'u2naB1N3Of',
        },
        {
          time: date,
        },
      );
    case null:
      return translateMessage(
        {
          defaultMessage: '{date}, {time}',
          id: 'mBGGMDtve+',
        },
        {
          date: formatShortDate(editTime, now),
          time: date,
        },
      );
  }
}
export function editAuthorName(author?: Dynamic) {
  if (author?.kind === 'agent') return AGENT_NAME;
  if (author?.name === null) return '';
  if (author !== null && author.name !== '') return author.name;
  return translateMessage({
    defaultMessage: 'Someone',
    id: 'ky2lEuxNDL',
  });
}
export function historyFaultNotice(whyNotRead?: Dynamic, scope?: Dynamic) {
  let unavailableTitle = scope === 'row' ? rowHistoryUnavailableTitle : cellHistoryUnavailableTitle;
  switch (whyNotRead) {
    case 'storeDoesNotKnowHow':
      return {
        title: translateMessage({
          defaultMessage: 'Edit history isn’t available yet',
          id: 'lMaqxAXeiW',
        }),
        hint: translateMessage({
          defaultMessage: 'Try again later.',
          id: 'PmDaCUh6pt',
        }),
        canTryAgain: false,
      };
    case 'recordDoesNotMatch':
      return {
        title: unavailableTitle(),
        canTryAgain: false,
      };
    case 'cellIsGone':
      return {
        title:
          scope === 'row'
            ? translateMessage({
                defaultMessage: 'This row was deleted.',
                id: 'YEYsL7kemJ',
              })
            : translateMessage({
                defaultMessage: 'This cell’s row or column was deleted.',
                id: 'TQKGkZ0s/Y',
              }),
        canTryAgain: false,
      };
    case 'answerIsTooLarge':
      return {
        title: unavailableTitle(),
        hint:
          scope === 'row'
            ? translateMessage({
                defaultMessage: 'This row has too much text to show here.',
                id: 'DAlwDLx1KM',
              })
            : translateMessage({
                defaultMessage: 'This cell has too much text to show here.',
                id: 'Rsbz13kse+',
              }),
        canTryAgain: false,
      };
    case 'tookTooLong':
      return {
        title: unavailableTitle(),
        hint: translateMessage({
          defaultMessage: 'This Sheet has too many edits to search.',
          id: 'LfbriAs9It',
        }),
        canTryAgain: false,
      };
    case 'busy':
    case 'noAnswer':
    case 'refused':
      return {
        title: translateMessage({
          defaultMessage: 'Couldn’t load edit history',
          id: '2L6D89n1bd',
        }),
        ...(whyNotRead === 'noAnswer' && {
          hint: translateMessage({
            defaultMessage: 'Check your connection, then try again.',
            id: '2J1b9ATDii',
          }),
        }),
        canTryAgain: true,
      };
  }
}
export function CellHistoryCellLine({
  cell: { held: input, address: input2, column: input3 },
  isNamed: isNamed,
  decimalSign: decimalSign,
}: Dynamic) {
  let value = input3.kind === 'named' ? input3.name : input3.letters;
  let value2 = isNamed ? 'col-start-3' : 'col-span-2 col-start-2';
  return jsxs(Fragment, {
    children: [
      isNamed &&
        jsx('bdi', {
          'aria-hidden': input.kind === 'nothing' ? true : undefined,
          title: value,
          className: 'col-start-2 line-clamp-3 text-footnote wrap-anywhere text-secondary',
          children: value,
        }),
      input.kind === 'nothing'
        ? jsx('span', {
            className: `${value2} text-body text-secondary`,
            children: jsx(DrawnAndSaid, {
              drawn: cellHistoryMessages.cleared(),
              said: cellHistoryMessages.clearedSaid(isNamed && input3.kind === 'named' ? input3.name : input2),
            }),
          })
        : jsx('bdi', {
            className: `${value2} min-w-0 text-body wrap-anywhere whitespace-pre-wrap text-primary`,
            children: textOfHeldValue(input, decimalSign),
          }),
    ],
  });
}
export function CellHistoryChange({
  change: { author: input, atMs: input2, cells: input3 },
  areCellsNamed: areCellsNamed,
  nowMs: nowMs2,
  decimalSign: decimalSign,
}: Dynamic) {
  let value = editAuthorName(input);
  return jsxs('li', {
    className: 'col-span-3 grid min-w-0 grid-cols-subgrid items-baseline',
    children: [
      jsx('span', {
        'aria-hidden': true,
        className: 'row-span-2 flex self-start pt-0.5',
        children:
          input?.kind === 'agent'
            ? jsx(Avatar, {
                size: 'xs',
                variant: 'agent',
                name: value,
              })
            : jsx(Avatar, {
                size: 'xs',
                name: value,
                src: input?.avatarUrl ?? '',
              }),
      }),
      jsxs('span', {
        className: 'col-span-2 flex min-h-[1lh] min-w-0 flex-wrap justify-between gap-x-sm text-footnote text-secondary',
        children: [
          jsx('span', {
            className: 'wrap-anywhere',
            children: value,
          }),
          jsx('span', {
            className: 'shrink-0 tabular-nums',
            children: formatEditTime(input2, nowMs2),
          }),
        ],
      }),
      input3.map(
        (input4?: Dynamic) =>
          jsx(
            CellHistoryCellLine,
            {
              cell: input4,
              isNamed: areCellsNamed,
              decimalSign: decimalSign,
            },
            input4.columnId,
          ),
      ),
    ],
  });
}
export function CellHistorySkeleton() {
  return jsx(SkeletonGroup, {
    label: cellHistoryMessages.loading(),
    className: 'flex flex-col gap-md',
    children: HISTORY_SKELETON_ROWS.map(
      (input?: Dynamic) =>
        jsxs(
          'div',
          {
            className: 'flex items-start gap-sm',
            children: [
              jsx(Skeleton, {
                className: 'size-5 shrink-0 rounded-full',
              }),
              jsxs('div', {
                className: 'flex flex-1 flex-col gap-xs',
                children: [
                  jsx(Skeleton, {
                    width: '70%',
                    className: 'text-footnote',
                  }),
                  jsx(Skeleton, {
                    width: '40%',
                    className: 'text-body',
                  }),
                ],
              }),
            ],
          },
          input,
        ),
    ),
  });
}
export function CellHistoryScopeSwitch({
  history: { scope: input, rowNumber: input2, address: input3 },
  onScopeChosen: onScopeChosen,
}: Dynamic) {
  let memo = React.useMemo(
    () => [
      {
        value: 'row',
        label: cellHistoryMessages.row(input2),
      },
      {
        value: 'cell',
        label: cellHistoryMessages.cell(input3),
      },
    ],
    [input2, input3],
  );
  return jsx(SegmentedControl, {
    value: input,
    segments: memo,
    'aria-label': cellHistoryMessages.scopeOfList(),
    onChange: onScopeChosen,
  });
}
export function CellHistoryList({
  history: { scope: input, changes: items, whyNotRead: input2, isAwaited: input3, areEarlierLeftOut: input4 },
  decimalSign: decimalSign,
  onTryAgain: onTryAgain,
}: Dynamic) {
  let value = useStartOfToday();
  let value2 = input2 === null ? null : historyFaultNotice(input2, input);
  let value3 = input3 && value2 !== null;
  let value4 =
    value2 ??
    (items?.length === 0 && !input4
      ? {
          title: cellHistoryMessages.neverEdited(input),
          hint: undefined,
        }
      : null);
  return jsxs(Fragment, {
    children: [
      items === null && value2 === null && jsx(CellHistorySkeleton, {}),
      jsxs('output', {
        className: 'flex flex-col gap-xs text-footnote text-secondary empty:-mt-[var(--ui-gap-md)]',
        children: [
          value4 !== null &&
            jsx('span', {
              className: 'text-body text-primary',
              children: value3 ? blankWhileAwaited(value4.title) : value4.title,
            }),
          value4?.hint !== undefined &&
            jsx('span', {
              children: value3 ? blankWhileAwaited(value4.hint) : value4.hint,
            }),
        ],
      }),
      value2?.canTryAgain === true &&
        jsx(Button, {
          variant: 'secondary',
          size: 'sm',
          className: 'self-start',
          busy: input3,
          busyLabel: cellHistoryMessages.loading(),
          onClick: onTryAgain,
          children: cellHistoryMessages.tryAgain(),
        }),
      items !== null &&
        items.length > 0 &&
        jsx('ul', {
          className: 'grid min-w-0 grid-cols-[auto_fit-content(40%)_minmax(0,1fr)] gap-x-sm gap-y-md',
          children: items.map(
            (input5?: Dynamic) =>
              jsx(
                CellHistoryChange,
                {
                  change: input5,
                  areCellsNamed: input === 'row',
                  nowMs: value,
                  decimalSign: decimalSign,
                },
                input5.revision,
              ),
          ),
        }),
      input4 &&
        jsx('span', {
          className: 'text-footnote text-secondary',
          children: cellHistoryMessages.olderNotShown(),
        }),
    ],
  });
}
export const cellHistoryMessages = {
  show: () =>
    translateMessage({
      defaultMessage: 'View history',
      id: '9MScxQ7nKk',
    }),
  title: () =>
    translateMessage({
      defaultMessage: 'Edit history',
      id: 'cc6TSri5h5',
    }),
  scopeOfList: () =>
    translateMessage({
      defaultMessage: 'Edits to show',
      id: 'Gyxfwc0xjE',
    }),
  row: (input?: Dynamic) =>
    translateMessage(
      {
        defaultMessage: 'Row {rowNumber}',
        id: '9Dx7eVQxnV',
      },
      {
        rowNumber: input,
      },
    ),
  cell: (input?: Dynamic) =>
    translateMessage(
      {
        defaultMessage: 'Cell {address}',
        id: 'cgQZorGEpY',
      },
      {
        address: input,
      },
    ),
  cleared: () =>
    translateMessage({
      defaultMessage: 'Cleared',
      id: 'FQjsp/Zu/b',
    }),
  clearedSaid: (input?: Dynamic) =>
    translateMessage(
      {
        defaultMessage: 'Cleared {cell}',
        id: 'TQjsd1H/DX',
      },
      {
        cell: input,
      },
    ),
  loading: () =>
    translateMessage({
      defaultMessage: 'Loading edit history…',
      id: 'i/na800t0t',
    }),
  neverEdited: (input?: Dynamic) =>
    input === 'row'
      ? translateMessage({
          defaultMessage: 'This row hasn’t been edited.',
          id: 'u3orwfuN0i',
        })
      : translateMessage({
          defaultMessage: 'This cell hasn’t been edited.',
          id: '/f2SP3+FfI',
        }),
  olderNotShown: () =>
    translateMessage({
      defaultMessage: 'Older edits aren’t shown.',
      id: 'dgtYhs9GGD',
    }),
  close: () =>
    translateMessage({
      defaultMessage: 'Close',
      id: '9m/DLH71Je',
    }),
  tryAgain: () =>
    translateMessage({
      defaultMessage: 'Try again',
      id: 'pEZeVF12w9',
    }),
};
export const cellHistoryUnavailableTitle = () =>
  translateMessage({
    defaultMessage: 'Edit history isn’t available for this cell',
    id: '4ZRTZgx+6O',
  });
export const rowHistoryUnavailableTitle = () =>
  translateMessage({
    defaultMessage: 'Edit history isn’t available for this row',
    id: '0qUDvqAri0',
  });
export const LOOK_AGAIN_MAX_DELAY_MS = 2000;
export const LOOK_AGAIN_WINDOW_MS = 1e4;
export const lookAgainDelay = (input?: Dynamic) => Math.max(0, Math.min(LOOK_AGAIN_MAX_DELAY_MS, LOOK_AGAIN_WINDOW_MS - input));
export const blankWhileAwaited = (input?: Dynamic) => (input === undefined ? '' : ' ');
export const noTodaySubscribe = () => () => {};
export const startOfToday = () => new (Date as Dynamic)().setHours(0, 0, 0, 0);
export const useStartOfToday = () => React.useSyncExternalStore(noTodaySubscribe, startOfToday, startOfToday);
export const HISTORY_SKELETON_ROWS = [0, 1, 2];
export const CELL_HISTORY_CARD_ATTRIBUTE = 'data-cell-history-card';
export const textOfHeldValue = (input?: Dynamic, options?: Dynamic) =>
  input.kind === 'written' ? input.text : withDecimalSign(String(input.value), options);
export const CellHistoryPopover = React.memo(function ({
  history: history2,
  anchor: anchor,
  decimalSign: decimalSign,
  whatHasCaretAfter: whatHasCaretAfter,
  onScopeChosen: onScopeChosen,
  onTryAgain: onTryAgain,
  onLookAgain: onLookAgain,
  onShut: onShut,
}: Dynamic) {
  let behindAtChangeCount = history2?.behindAtChangeCount ?? null;
  let behindSinceRef = React.useRef(null);
  React.useEffect(() => {
    if (behindAtChangeCount === null) {
      behindSinceRef.current = null;
      return;
    }
    behindSinceRef.current ??= performance.now();
    let value = setTimeout(onLookAgain, lookAgainDelay(performance.now() - behindSinceRef.current));
    return () => clearTimeout(value);
  }, [behindAtChangeCount, onLookAgain]);
  let [shownHistory, setShownHistory] = React.useState(history2);
  if (history2 !== null && history2 !== shownHistory) setShownHistory(history2);
  let collisionPad = useBottomInsetWhileOpen(history2 !== null, false);
  return jsx(Popover.Root, {
    modal: true,
    open: history2 !== null,
    onOpenChange: (input?: Dynamic) => {
      if (!input) onShut();
    },
    children: jsx(Popover.Popup, {
      ...{
        [CELL_HISTORY_CARD_ATTRIBUTE]: '',
      },
      anchor: anchor,
      align: 'start',
      collisionPadding: popupCollisionPadding(collisionPad),
      className: 'flex max-h-[min(360px,var(--available-height))] w-80 flex-col gap-md',
      finalFocus: whatHasCaretAfter,
      onKeyDown: (event?: Dynamic) => {
        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
      },
      children:
        shownHistory !== null &&
        jsxs(Fragment, {
          children: [
            jsxs('div', {
              className: 'flex min-w-0 items-center justify-between gap-sm',
              children: [
                jsx(Popover.Title, {
                  className: 'min-w-0 text-body-medium',
                  children: cellHistoryMessages.title(),
                }),
                jsx(Popover.Close, {
                  render: jsx(Button, {
                    variant: 'ghost',
                    size: 'sm',
                    iconOnly: true,
                    icon: jsx(Icon, {
                      name: 'X',
                      size: 'sm',
                    }),
                    'aria-label': cellHistoryMessages.close(),
                    tooltip: false,
                    className: 'shrink-0 text-secondary',
                  }),
                }),
              ],
            }),
            shownHistory.canRowBeRead &&
              jsx(CellHistoryScopeSwitch, {
                history: shownHistory,
                onScopeChosen: onScopeChosen,
              }),
            jsx(CellHistoryList, {
              history: shownHistory,
              decimalSign: decimalSign,
              onTryAgain: onTryAgain,
            }),
          ],
        }),
    }),
  });
});
