import { Menu } from '../kit/menu.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { ToolbarMenu } from './format-toolbar.ts';
import { MenuTriggerButton } from './menu-trigger.ts';
import { figureForSelectionLabel, selectionSummaryLabel, figureWithValueLabel } from '../i18n/grid-action-labels.ts';
import { SUM_BAR_AGGREGATES } from '../state/transitions.ts';
import { formatNumberWithSigns } from '../format/number-signs.ts';
export function refreshFiguresWhenSettled(subscribe?: Dynamic, refresh?: Dynamic) {
  let delayTimer: Dynamic = setTimeout(refresh, FIGURES_REFRESH_DELAY_MS);
  let intervalTimer = setInterval(refresh, FIGURES_REFRESH_INTERVAL_MS);
  let unsubscribe = subscribe(() => {
    clearTimeout(delayTimer);
    delayTimer = setTimeout(refresh, FIGURES_REFRESH_DELAY_MS);
  });
  return () => {
    unsubscribe();
    clearTimeout(delayTimer);
    clearInterval(intervalTimer);
  };
}
export function FiguresMenu({
  all: all,
  onShow: onShow,
  onPicked: onPicked,
  onMenuOpenChange: onMenuOpenChange,
  whatHasCaretAfter: whatHasCaretAfter,
}: Dynamic) {
  let [isOpen, setIsOpen] = React.useState(false);
  let buttonRef = React.useRef(null);
  let isOpenRef = React.useRef(false);
  React.useLayoutEffect(
    () => () => {
      let current = isOpenRef.current;
      if (current) onMenuOpenChange(false, null);
      let { current: value } = buttonRef;
      if (!current && value !== value?.ownerDocument.activeElement) return;
      queueMicrotask(() => {
        let value2 = whatHasCaretAfter();
        if (value2 !== false)
          value2.focus({
            preventScroll: true,
          });
      });
    },
    [onMenuOpenChange, whatHasCaretAfter],
  );
  return jsx(ToolbarMenu, {
    isOpen: isOpen,
    button: jsx(MenuTriggerButton, {
      ref: buttonRef,
      variant: 'ghost',
      'aria-label': figureForSelectionLabel(onShow.words),
      chevron: 'toolbar',
      children: jsx('span', {
        className: 'tabular-nums',
        children: onShow.words,
      }),
    }),
    tooltip: null,
    onOpenChange: (input?: Dynamic, options?: Dynamic) => {
      isOpenRef.current = input;
      setIsOpen(input);
      onMenuOpenChange(input, options);
    },
    whatHasCaretAfter: whatHasCaretAfter,
    toolbar: buttonRef,
    side: 'top',
    children: jsx(Menu.Group, {
      'aria-label': selectionSummaryLabel(),
      children: all.map(
        ({ figure: figure, words: words }: Dynamic) =>
          jsx(
            Menu.Item,
            {
              checkedRole: 'radio',
              checked: figure === onShow.figure,
              onClick: () => onPicked(figure),
              children: jsx('span', {
                className: 'tabular-nums',
                children: words,
              }),
            },
            figure,
          ),
      ),
    }),
  });
}
export function useHasRoomForFigures(inPageRef?: Dynamic) {
  let [hasRoom, setHasRoom] = React.useState(true);
  React.useLayoutEffect(() => {
    let mediaQuery = inPageRef.current?.ownerDocument.defaultView?.matchMedia(FIGURES_ROOM_MEDIA_QUERY);
    if (mediaQuery === undefined) return;
    let update = () => setHasRoom(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [inPageRef]);
  return hasRoom;
}
export function FiguresOfSelectionDue({ store: store }: Dynamic) {
  React.useEffect(
    () =>
      refreshFiguresWhenSettled(
        store.subscribe,
        () =>
          store.dispatch({
            kind: 'figuresOfSelectionDue',
          }),
      ),
    [store],
  );
  return null;
}
export function SelectionFigures({
  kept: { figures: figures, areDue: areDue, ofCells: ofCells },
  signsOfNumbers: signsOfNumbers,
  store: store,
  inPage: inPage,
  ...menuProps
}: Dynamic) {
  let hasRoom = useHasRoomForFigures(inPage);
  let figuresDue = areDue
    ? jsx(
        FiguresOfSelectionDue,
        {
          store: store,
        },
        ofCells,
      )
    : null;
  let [pickedFigure, setPickedFigure] = React.useState('sum');
  if (!hasRoom) return null;
  let allFigures = SUM_BAR_AGGREGATES.flatMap((input?: Dynamic) => {
    let value = figures?.[input];
    return value === undefined
      ? []
      : [
          {
            figure: input,
            words: figureWords(input, value, signsOfNumbers),
          },
        ];
  });
  let shownFigure = allFigures.find(({ figure: figure }: Dynamic) => figure === pickedFigure) ?? allFigures.at(-1);
  if (shownFigure === undefined) return figuresDue;
  return jsxs(Fragment, {
    children: [
      figuresDue,
      jsx('div', {
        className: 'sheet-figures',
        children: jsx(FiguresMenu, {
          all: allFigures,
          onShow: shownFigure,
          onPicked: setPickedFigure,
          ...menuProps,
        }),
      }),
    ],
  });
}
export const FIGURES_REFRESH_DELAY_MS = 200;
export const FIGURES_REFRESH_INTERVAL_MS = 1000;
export const figureWords = (figure: Dynamic, { value: value, written: written }: Dynamic, signsOfNumbers?: Dynamic) =>
  figureWithValueLabel(figure, written ?? formatNumberWithSigns(value, signsOfNumbers));
export const FIGURES_ROOM_MEDIA_QUERY = '(min-width:500px)';
