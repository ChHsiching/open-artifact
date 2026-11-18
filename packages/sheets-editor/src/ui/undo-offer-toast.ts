import { useToasts } from '../kit/toast.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { useFollowed, useFollowedValueOf } from '../state/followed-values.ts';
import { jsx } from 'react/jsx-runtime';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { UncommentableToastText } from '../shell/ui-root.ts';
import { describeUndoOffer } from '../i18n/change-labels.ts';
export function ToastTitleText({ text: text }: Dynamic) {
  return useFollowed(text);
}
export function UndoToastButton({ label: label, isBusy: isBusy, onPressed: onPressed }: Dynamic) {
  return jsx(Button, {
    variant: 'secondary',
    size: 'sm',
    'aria-label': label,
    busy: useFollowed(isBusy),
    onClick: onPressed,
    children: sheetMessages.undo(),
  });
}
export function UndoToast({
  words: { title: title, undoLabel: undoLabel, ...toastOptions },
  isBeingTaken: isBeingTaken,
  onTaken: onTaken,
  onDismissed: onDismissed,
  onTakenDown: onTakenDown,
}: Dynamic) {
  let toasts = useToasts();
  let keptTitle = useFollowedValueOf(title);
  let keptIsBeingTaken = useFollowedValueOf(isBeingTaken);
  let addToast = React.useEffectEvent(
    () =>
      toasts.add({
        ...toastOptions,
        title: jsx(UncommentableToastText, {
          children: jsx(ToastTitleText, {
            text: keptTitle,
          }),
        }),
        action: jsx(UndoToastButton, {
          label: undoLabel,
          isBusy: keptIsBeingTaken,
          onPressed: () => onTaken(),
        }),
        onClose: ({ byUser: byUser }: Dynamic) => {
          if (byUser) onDismissed();
        },
      }),
  );
  let closeToast = React.useEffectEvent((toastId?: Dynamic) => {
    toasts.close(toastId);
    onTakenDown?.();
  });
  React.useEffect(() => {
    let toastId = addToast();
    return () => closeToast(toastId);
  }, []);
  return null;
}
export function undoOfferKey(offer?: Dynamic) {
  switch (offer.kind) {
    case 'sheetDeleted':
    case 'placedViewDeleted':
      return offer.name;
    case 'tableImportedIntoSheet':
      return `${offer.sheetName} ${offer.addedCount} ${offer.changedCount}`;
    case 'tableImportedAsNewSheet':
      return `${offer.sheetName} ${offer.rowCount}`;
    case 'mergeClearedCells':
    case 'filledByFinger':
    case 'clearedWithNoKeyboard':
      return offer.cells;
    case 'dropdownClearedCells':
      return `${offer.cells} ${offer.formulaCount} ${offer.otherCount}`;
    case 'optionsGoneClearedCells':
      return String(offer.count);
    case 'dropdownOptionDeleted':
      return `${offer.label} ${offer.cellCount} ${offer.onlyIn}`;
    case 'rowsDeleted':
    case 'columnsDeleted':
      return `${offer.first}:${offer.last}`;
    case 'sortedWithNoKeyboard':
      return `${offer.column} ${offer.direction}`;
    case 'sortChangedResults':
      return `${offer.column} ${offer.direction} ${offer.results.firstCell} ${offer.results.count} ${offer.results.errorCount}`;
    case 'moveOfColumnsChangedResults':
      return `${offer.count} ${offer.results.firstCell} ${offer.results.count} ${offer.results.errorCount}`;
    case 'replacedInCells':
      return `${offer.count} ${offer.leftCount}`;
    case 'textsConverted':
      return `${offer.count} ${offer.leftCount}`;
    case 'versionRestored':
      return String(offer.atMs);
  }
}
export function UndoOfferToast({ offer: offer, ...toastProps }: Dynamic) {
  return jsx(
    UndoToast,
    {
      words: describeUndoOffer(offer),
      isBeingTaken: false,
      ...toastProps,
    },
    `${offer.kind} ${undoOfferKey(offer)}`,
  );
}
