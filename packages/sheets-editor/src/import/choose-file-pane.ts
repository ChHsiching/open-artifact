import { Dialog } from '../kit/dialog.tsx';
import { DropZone, useDropZone } from '../kit/drop-zone.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { noticeText } from '../i18n/notice-labels.ts';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { ImportGhostGrid, ImportWarningHeadline } from './destination.ts';
import { csvFileMessages } from './csv-file.ts';
import { chooseFileLabel } from '../i18n/ui-labels.ts';
export function scrollChildIntoBox(box?: Dynamic, child?: Dynamic) {
  if (box === null || child === null) return;
  let { top: boxTop, bottom: boxBottom } = box.getBoundingClientRect();
  let childBounds = child.getBoundingClientRect();
  if (childBounds.top < boxTop) box.scrollTop += childBounds.top - boxTop;
  else if (childBounds.bottom + CHOOSE_BUTTON_SCROLL_MARGIN_PX > boxBottom)
    box.scrollTop += childBounds.bottom + CHOOSE_BUTTON_SCROLL_MARGIN_PX - boxBottom;
}
export function wordsOfFileRefusal(fileAwaited?: Dynamic) {
  if (fileAwaited.kind === 'fileNotImported') return FILE_NOT_IMPORTED_WORDS[fileAwaited.why]();
  if (fileAwaited.kind === 'editRefused' && fileAwaited.why === 'noRoomInWorkbook')
    return {
      headline: fileAwaitedMessages.noRoom(),
      wayOn: fileAwaitedMessages.smallerFile(),
    };
  if (fileAwaited.kind === 'editRefused' && fileAwaited.why === 'textTooLong')
    return {
      headline: fileAwaitedMessages.cellTooLong(),
      wayOn: fileAwaitedMessages.shortenText(),
    };
  return {
    headline: noticeText(fileAwaited),
    wayOn: fileAwaitedMessages.whatToChoose(),
  };
}
export function ChooseFilePane({
  fileAwaited: { whyNot: whyNot, refusedCount: refusedCount },
  chooseRef: chooseRef,
  onChoose: onChoose,
  onDropped: onDropped,
}: Dynamic) {
  let refusalWords = whyNot === null ? null : wordsOfFileRefusal(whyNot);
  let filePicker = useDropZone({
    pickerPath: {
      mode: 'external',
      control: chooseRef,
    },
    onFiles: ({ accepted: [file], notices: notices }: Dynamic) => {
      let isFolder = notices.some(({ code: code }: Dynamic) => code === 'folder-not-allowed');
      onDropped(file ?? (isFolder ? 'folder' : 'notRead'));
    },
  });
  let refusalShown = filePicker.dragState === 'on-target' ? null : refusalWords;
  let paneRef = React.useRef(null);
  let scrollToChoose = React.useCallback(() => scrollChildIntoBox(paneRef.current, chooseRef.current), [chooseRef]);
  React.useLayoutEffect(scrollToChoose, [scrollToChoose]);
  let scrollToChild = React.useCallback(
    (child?: Dynamic) => {
      scrollChildIntoBox(paneRef.current, child);
      scrollToChoose();
    },
    [scrollToChoose],
  );
  return jsxs('div', {
    ...filePicker.getZoneProps({
      className: 'relative -mx-[var(--ui-pad-xl)] flex min-h-0 flex-1 flex-col overflow-hidden border-t border-[color:var(--ui-border-line,var(--ui-border))]',
    }),
    children: [
      jsx(ImportGhostGrid, {
        isGray: refusalShown !== null,
      }),
      jsxs('div', {
        ref: paneRef,
        className:
          'relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_minmax(min-content,1fr)] justify-items-center overflow-y-auto scroll-fade-y px-xl text-center',
        children: [
          jsxs('div', {
            className: 'row-start-2 flex flex-col items-center gap-sm',
            children: [
              refusalShown !== null
                ? jsxs(Dialog.Description, {
                    render: jsx('div', {}),
                    className: 'm-0 flex flex-col items-center gap-sm',
                    children: [
                      jsx(ImportWarningHeadline, {
                        children: refusalShown.headline,
                      }),
                      jsx('p', {
                        className: 'm-0 text-body text-secondary',
                        children: refusalShown.wayOn,
                      }),
                    ],
                  })
                : jsxs(Fragment, {
                    children: [
                      jsx('p', {
                        className: 'm-0 text-body font-medium text-primary',
                        children: filePicker.dragState === 'on-target' ? csvFileMessages.letGo() : csvFileMessages.whatComesHere(),
                      }),
                      jsx(Dialog.Description, {
                        children: csvFileMessages.whatToChoose(),
                      }),
                    ],
                  }),
              jsx(Button, {
                ref: chooseRef,
                variant: 'primary',
                icon: 'Upload',
                onClick: onChoose,
                onFocus: ({ currentTarget: currentTarget }: Dynamic) => {
                  if (currentTarget.matches(':focus-visible')) scrollToChoose();
                },
                children: chooseFileLabel(),
              }),
            ],
          }),
          jsx('output', {
            'aria-live': 'polite',
            className: 'row-start-3',
            children:
              whyNot !== null &&
              jsx(
                'span',
                {
                  ref: scrollToChild,
                  className: 'sr-only',
                  children: noticeText(whyNot),
                },
                refusedCount,
              ),
          }),
        ],
      }),
      jsx(DropZone.Overlay, {
        dragState: filePicker.dragState,
      }),
    ],
  });
}
export const CHOOSE_BUTTON_SCROLL_MARGIN_PX = 8;
export const fileAwaitedMessages = csvFileMessages;
export const FILE_NOT_IMPORTED_WORDS = {
  tooLarge: () => ({
    headline: fileAwaitedMessages.tooLarge(),
    wayOn: fileAwaitedMessages.smallerFile(),
  }),
  notRead: () => ({
    headline: fileAwaitedMessages.notRead(),
    wayOn: fileAwaitedMessages.tryAgain(),
  }),
  folder: () => ({
    headline: fileAwaitedMessages.isFolder(),
    wayOn: fileAwaitedMessages.chooseCsvOrTsv(),
  }),
  notText: () => ({
    headline: fileAwaitedMessages.notCsv(),
    wayOn: fileAwaitedMessages.saveAsCsv(),
  }),
  empty: () => ({
    headline: fileAwaitedMessages.isEmpty(),
    wayOn: fileAwaitedMessages.whatToChoose(),
  }),
};
