import { Dialog } from '../kit/dialog.tsx';
import { Form } from '../kit/form.tsx';
import { Combobox } from '../kit/combobox.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { translateMessage } from '../i18n/messages.ts';
import { localeMessages, localeChoices, labelMatchesSearch } from '../messages/locale.ts';
import { timeZoneMessages, timeZoneOptions, pickedOrWorkbookSetting } from './locale-time-zone-pick.ts';
import { jsx, jsxs } from 'react/jsx-runtime';
import { popupPropsUnderHeader } from '../shell/bottom-insets.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
export function useLastPick(pick?: Dynamic) {
  let [lastPick, setLastPick] = React.useState(null);
  if (pick !== null && pick !== lastPick) setLastPick(pick);
  return pick ?? lastPick;
}
export function preventRepeatedEnter(keyEvent?: Dynamic) {
  if (keyEvent.key === 'Enter' && keyEvent.repeat) keyEvent.preventDefault();
}
export const localeTimeZoneDialogMessages = {
  search: () =>
    translateMessage({
      defaultMessage: 'Search',
      id: 'WtbUItQA+Q',
    }),
  noMatches: () =>
    translateMessage({
      defaultMessage: 'No matches',
      id: '8/k7bhQvXz',
    }),
  apply: () =>
    translateMessage({
      defaultMessage: 'Apply',
      id: 'X+HoQGASXX',
    }),
};
export const PICK_DIALOG_TEXTS = {
  locale: {
    title: localeMessages.locale,
    description: localeMessages.whatGoesByIt,
  },
  timeZone: {
    title: timeZoneMessages.timeZone,
    description: timeZoneMessages.whatGoesByIt,
  },
};
export const LocaleTimeZoneDialog = React.memo(function ({
  pick: pick,
  whatHasCaretAfter: whatHasCaretAfter,
  onPicked: onPicked,
  onEntered: onEntered,
  onDropped: onDropped,
}: Dynamic) {
  let pickShown = useLastPick(pick);
  let { of: pickOf, all: all, ofWorkbook: ofWorkbook } = pickShown ?? {};
  let ofBrowser = pickShown?.of === 'timeZone' ? pickShown.ofBrowser : null;
  let pickItems = React.useMemo(
    () => (all === undefined ? [] : pickOf === 'locale' ? localeChoices(all) : timeZoneOptions(all, ofBrowser, ofWorkbook ?? null)),
    [pickOf, all, ofBrowser, ofWorkbook],
  );
  let comboboxBoxRef = React.useRef(null);
  let initialFocus = React.useCallback(() => comboboxBoxRef.current?.querySelector('[role="combobox"]'), []);
  let onOpenChange = React.useCallback(
    (open?: Dynamic) => {
      if (!open) onDropped();
    },
    [onDropped],
  );
  let onChosen = React.useCallback(
    (chosen?: Dynamic) => {
      if (chosen !== null && pickOf !== undefined) onPicked(pickOf, chosen);
    },
    [onPicked, pickOf],
  );
  if (pickShown === null) return null;
  let title = PICK_DIALOG_TEXTS[pickShown.of].title();
  return jsx(Dialog.Root, {
    open: pick !== null,
    onOpenChange: onOpenChange,
    children: jsx(Dialog.Popup, {
      size: 'sm',
      initialFocus: initialFocus,
      finalFocus: whatHasCaretAfter,
      children: jsxs(Form, {
        className: 'contents',
        onSubmit: onEntered,
        onKeyDown: preventRepeatedEnter,
        children: [
          jsx(Dialog.Header, {
            description: PICK_DIALOG_TEXTS[pickShown.of].description(),
            children: title,
          }),
          jsx('div', {
            ref: comboboxBoxRef,
            'data-initial-focus': true,
            children: jsx(Combobox, {
              ...popupPropsUnderHeader(),
              'aria-label': title,
              searchable: true,
              items: pickItems,
              filter: labelMatchesSearch,
              autoHighlight: true,
              value: pickedOrWorkbookSetting(pickShown),
              onChange: onChosen,
              searchPlaceholder: localeTimeZoneDialogMessages.search(),
              emptyMessage: localeTimeZoneDialogMessages.noMatches(),
            }),
          }),
          jsxs(Dialog.Footer, {
            align: 'end',
            children: [
              jsx(Dialog.Close, {
                render: jsx(Button, {
                  variant: 'secondary',
                  children: sheetMessages.cancel(),
                }),
              }),
              jsx(Button, {
                type: 'submit',
                variant: 'primary',
                children: localeTimeZoneDialogMessages.apply(),
              }),
            ],
          }),
        ],
      }),
    }),
  });
});
