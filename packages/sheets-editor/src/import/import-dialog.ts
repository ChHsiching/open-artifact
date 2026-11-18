import { Banner } from '../kit/banner.tsx';
import { Dialog } from '../kit/dialog.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { importPlanSoFar, isImportPlanComing, whyNoAgentForImport, openImportQuestionIds, openImportQuestionCount } from './import-review.ts';
import { importProgressMessages, describeFileLines, importReviewMessages, csvFileMessages, agentUnavailableForImportWords } from './csv-file.ts';
import { importPlacesLeft, importDestinationOf } from './import-flow.ts';
import { keyColumnName, sheetToImportInto, ImportCannotShow } from './destination.ts';
import { importRefusalWords, importPlanSummary, importNotes, importMessages, isImportChangeless } from '../messages/import.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { ImportChangesTable } from './preview-table.ts';
import {
  hasFirstPlanFailed,
  isFirstPlanLeftUndone,
  IMPORT_FILE_NAME_MAX_CHARS,
  createTypedKeeper,
  AgentReadingMark,
  isWishLeftUndone,
  WishOutcomeLine,
  WishToAgentComposer,
} from './wish-to-agent.ts';
import {
  previewBeingReadLabel,
  readyToApplyWords,
  PICTURE_BOX_CLASS,
  SCROLLS_AROUND_PICTURE_ATTRIBUTE,
  importDialogLabels,
} from './import-picture.ts';
import { truncateToCleanText } from './import-basics.ts';
import { importRecordCount } from './bring-in.ts';
import { refusalMessageKey } from '../model/refusals.ts';
import { useCompactLayout } from '../app/media-queries.ts';
import { usePlanArrivalFlash } from './plan-arrival-flash.ts';
import { focusIfStillWanted, pendingFocusTarget } from './picture-lines-and-focus.ts';
import { useFocusRescue } from '../ui/focus-rescue.ts';
import {
  PICTURE_BOX_ENABLED_BUTTONS_SELECTOR,
  IMPORT_PANE_ENABLED_BUTTONS_SELECTOR,
  ImportReviewInDialog,
  SettledAnnouncer,
} from './review-in-dialog.ts';
import { offerKeyboardWhenReady } from '../ui/keyboard-handoff.ts';
import { ContentsBox } from '../ui/contents-box.ts';
import { ChooseFilePane } from './choose-file-pane.ts';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { DiscardImportDialog } from './discard-import-dialog.ts';
export function agentAtWorkWords(open?: Dynamic, columnsReadCount: Dynamic = null) {
  let { plan: plan, isTableFound: isTableFound, columnsReadCount: columnsRead } = importPlanSoFar(open);
  if (!isTableFound) return importProgressMessages.tableSought();
  return (columnsReadCount ?? columnsRead) < plan.columns.length || importPlacesLeft(open).length === 0
    ? importProgressMessages.columnsBeingRead()
    : importProgressMessages.placeSought();
}
export function mergeKeyColumnName(open?: Dynamic) {
  let destination = importDestinationOf(open);
  return destination.kind === 'sheet' && destination.how.kind === 'mergeByKey' ? keyColumnName(open, destination.how.keyColumnIndex) : null;
}
export function refusalWordsOfImportProposal(open?: Dynamic) {
  if (isImportWithoutRoom(open)) return noRoomWords();
  if (isImportPlanComing(open) || open.intoSheet?.kind !== 'refused') return null;
  return importRefusalWords(open.intoSheet.refusal, sheetToImportInto(open)?.table.name ?? '', mergeKeyColumnName(open));
}
export function importOutcomeWords(open?: Dynamic) {
  let { intoSheet: intoSheet } = open;
  return intoSheet?.kind === 'changes' ? importPlanSummary(intoSheet, sheetToImportInto(open)?.table.name ?? '') : '';
}
export function importChangesWarning(open?: Dynamic) {
  let destinationSheet = sheetToImportInto(open);
  return !isImportPlanComing(open) && open.intoSheet?.kind === 'changes' && destinationSheet !== undefined
    ? importNotes(open.intoSheet, destinationSheet.table.name)
    : null;
}
export function importOutcomeSaid(open?: Dynamic) {
  if (isImportWithoutRoom(open))
    return {
      atTheFoot: '',
      heard: noRoomWords(),
    };
  if (importDestinationOf(open).kind === 'newSheet') return null;
  let outcomeWords = isImportPlanComing(open) ? describeFileLines(open.table) : importOutcomeWords(open);
  let changesWarning = importChangesWarning(open);
  let shownWords = importWarningWords(open) ?? outcomeWords;
  return {
    atTheFoot: outcomeWords,
    heard: changesWarning === null ? shownWords : [shownWords, changesWarning.words].join(' '),
  };
}
export function importConfirmLabel(open?: Dynamic) {
  let destination = importDestinationOf(open);
  if (destination.kind === 'newSheet' || isImportPlanComing(open)) return importReviewMessages.import();
  switch (destination.how.kind) {
    case 'addRows':
      return importMessages.addRows();
    case 'mergeByKey':
      return importMessages.merge();
    case 'replaceRows':
      return importMessages.replace();
  }
}
export function importBannerElement(open?: Dynamic) {
  let banner = importBannerOf(importRefusalBannerWords(open), importChangesWarning(open));
  return banner === null
    ? null
    : jsx(Banner, {
        variant: banner.variant,
        role: 'none',
        children: banner.words,
      });
}
export function ImportChangesInBox(props?: Dynamic) {
  let { open: open, hasBanner: hasBanner } = props;
  let destinationSheet = sheetToImportInto(open);
  let intoSheet = destinationSheet === undefined ? null : open.intoSheet;
  let bannerElement = hasBanner ? importBannerElement(open) : null;
  return jsxs('div', {
    className: 'sheet-import-changes-in-box',
    children: [
      isImportWithoutRoom(open) &&
        jsx(ImportCannotShow, {
          headline: csvFileMessages.noRoom(),
          wayOn: csvFileMessages.smallerFile(),
        }),
      intoSheet?.kind === 'changes' &&
        destinationSheet !== undefined &&
        jsx('section', {
          'aria-label': importMessages.previewOfChanges(),
          className: 'sheet-import-preview scroll-fade scroll-fade-hide-top scroll-fade-hide-left flex-1',
          'data-is-empty': intoSheet.rows.length === 0 || undefined,
          children: jsx(ImportChangesTable, {
            changes: intoSheet,
          }),
        }),
      bannerElement !== null &&
        jsx('div', {
          className: 'shrink-0 px-xl py-md',
          children: bannerElement,
        }),
    ],
  });
}
export function ImportProposalInBox({ form: form, open: open, hasBanner: hasBanner }: Dynamic) {
  if (!form.cannotBeDrawn)
    return (
      form.proposal ??
      jsx(ImportChangesInBox, {
        open: open,
        hasBanner: hasBanner,
      })
    );
  return jsx('div', {
    className: 'sheet-import-changes-in-box',
    children: jsx(ImportCannotShow, {
      headline: importReviewMessages.previewNotShown(),
      wayOn: null,
    }),
  });
}
export function wordOfAgentForImport(open?: Dynamic) {
  let wasStopped = open.agent.kind === 'wasStopped';
  let whyNoAgent = whyNoAgentForImport(open);
  if ((hasFirstPlanFailed(open) && !wasStopped) || isFirstPlanLeftUndone(open)) return importReviewMessages.firstPlanFailed();
  if (wasStopped) return importReviewMessages.stopped();
  return whyNoAgent === null ? null : agentUnavailableForImportWords(whyNoAgent);
}
export function importSummaryWords(open?: Dynamic, isWordOfAgentShown?: Dynamic) {
  if (isImportPlanComing(open) || isWordOfAgentShown)
    return previewBeingReadLabel(truncateToCleanText(open.table.fileName, IMPORT_FILE_NAME_MAX_CHARS));
  let outcomeHeard =
    importOutcomeSaid(open)?.heard ??
    readyToApplyWords(open.newSheet?.name ?? importPlanSoFar(open).plan.sheetName, importRecordCount(open), openImportQuestionIds(open).length);
  let wordOfAgent = wordOfAgentForImport(open);
  return wordOfAgent === null ? outcomeHeard : [wordOfAgent, outcomeHeard].join(' ');
}
export const isNewSheetWithoutRoom = (open?: Dynamic) => !isImportPlanComing(open) && open.newSheet?.hasRoom === false;
export const isImportWithoutRoom = (open?: Dynamic) =>
  isNewSheetWithoutRoom(open) ||
  (!isImportPlanComing(open) && open.intoSheet?.kind === 'refused' && refusalMessageKey(open.intoSheet.refusal) === 'noRoomInWorkbook');
export const noRoomWords = () => [csvFileMessages.noRoom(), csvFileMessages.smallerFile()].join(' ');
export const importRefusalBannerWords = (open?: Dynamic) => (isImportWithoutRoom(open) ? null : refusalWordsOfImportProposal(open));
export const importWarningWords = (open?: Dynamic) =>
  refusalWordsOfImportProposal(open) ??
  (!isImportPlanComing(open) && open.intoSheet?.kind === 'changes' && isImportChangeless(open.intoSheet) ? importOutcomeWords(open) : null);
export const importBannerOf = (refusalWords?: Dynamic, changesWarning?: Dynamic) =>
  refusalWords === null
    ? changesWarning
    : {
        words: refusalWords,
        variant: 'danger',
      };
export const isWishComposerShown = (open?: Dynamic) =>
  isImportPlanComing(open) || (open.isPlanByAgent && open.agent.kind !== 'isNotToBeHad');
export const importDialogPopupSize = (hasImport?: Dynamic) => ({
  size: hasImport ? '3xl' : '2xl',
  className: `${hasImport ? 'max-h-[64rem] max-w-[110rem]' : 'max-h-[37.5rem] max-[640px]:max-h-[64rem]'} h-[calc(100dvh-max(4rem,2*var(--desktop-titlebar-inset,0px)))] w-[calc(100vw-4rem)] overflow-hidden max-[640px]:h-[calc(100dvh-max(1rem,2*var(--desktop-titlebar-inset,0px)))] max-[640px]:w-[calc(100vw-1rem)]`,
});
export const importDialogCloseKind = (isEscapeKey?: Dynamic, isKeyRepeat?: Dynamic, isOnGrid?: Dynamic) =>
  isKeyRepeat ? 'stays' : isEscapeKey || isOnGrid ? 'isEscaped' : 'isDropped';
export const isPictureBoxElement = (element?: Dynamic) => element?.classList?.contains(PICTURE_BOX_CLASS) === true;
export const IMPORT_SAID_AT_START = {
  of: null,
  words: false,
  times: 0,
};
export const canImportBeConfirmed = (open?: Dynamic) =>
  !isImportPlanComing(open) &&
  importRecordCount(open) > 0 &&
  (open.newSheet?.hasRoom === true || (open.intoSheet?.kind === 'changes' && !isImportChangeless(open.intoSheet)));
export const ImportDialog = React.memo(function ({
  importOfAFile: importOfAFile,
  fileAwaited: fileAwaited,
  whatHasCaretAfter: whatHasCaretAfter,
  onConfirmed: onConfirmed,
  onDropped: onDropped,
  onEscaped: onEscaped,
  onKept: onKept,
  onFileAsked: onFileAsked,
  onFileDropped: onFileDropped,
  chooseButtonRef: chooseButtonRef,
  isKeyboardLeftOutside: isKeyboardLeftOutside,
  wasKeyPressedLast: wasKeyPressedLast,
  onCaretOwed: onCaretOwed,
  onGrid: onGrid,
  ...dialogProps
}: Dynamic) {
  let [lastImport, setLastImport] = React.useState(null);
  if (importOfAFile !== null && importOfAFile !== lastImport) setLastImport(importOfAFile);
  if (fileAwaited !== null && lastImport !== null) setLastImport(null);
  let importShown = importOfAFile ?? lastImport;
  let [fileAwaitedShown, setFileAwaitedShown] = React.useState(fileAwaited);
  if (fileAwaited !== null && fileAwaited !== fileAwaitedShown) setFileAwaitedShown(fileAwaited);
  let keepButtonRef = React.useRef(null);
  let isOpen = importOfAFile !== null;
  let [onGridShown, setOnGridShown] = React.useState(onGrid);
  if ((isOpen || fileAwaited !== null) && onGridShown !== onGrid) setOnGridShown(onGrid);
  let isOnGrid = onGridShown !== null;
  let isCompact = useCompactLayout();
  let caretOwedToPopupRef = React.useRef(false);
  let giveCaretBack = React.useCallback(
    (element?: Dynamic) => {
      caretOwedToPopupRef.current = element === popupRef.current;
      onCaretOwed(element);
    },
    [onCaretOwed],
  );
  let isRevealPlaying = onGridShown !== null && onGridShown.columnsRevealed !== null;
  let planArrivalFlash = usePlanArrivalFlash({
    isOpen: importOfAFile !== null,
    isAwaited: importShown !== null && (isImportPlanComing(importShown) || isRevealPlaying),
    isWishOut: importShown?.agent.kind === 'isAsked' && importShown.agent.wish !== null,
    plansHeardCount: importShown?.plansHeardCount ?? 0,
  });
  let isPlanDrawn = onGridShown === null || onGridShown.isPlanDrawn;
  let isKeepButtonFirst = () =>
    importOfAFile !== null && canImportBeConfirmed(importOfAFile) && isPlanDrawn && !planArrivalFlash.isOnNow();
  let firstFocusTarget = () => (isKeepButtonFirst() ? keepButtonRef.current : popupRef.current);
  let scrollToKeepButton = () => {
    let scroller = keepButtonRef.current?.closest(`[${SCROLLS_AROUND_PICTURE_ATTRIBUTE}]`);
    scroller?.scrollTo({
      top: scroller.scrollHeight,
    });
  };
  let focusElement = (element?: Dynamic) => {
    caretOwedToPopupRef.current = element !== null && element === popupRef.current;
    let isFocusVisible2 = !caretOwedToPopupRef.current && wasKeyPressedLast();
    element?.focus({
      preventScroll: true,
      focusVisible: isFocusVisible2,
    });
    if (caretOwedToPopupRef.current || element === null || element.ownerDocument.activeElement !== element) return;
    if (element === keepButtonRef.current) scrollToKeepButton();
    else if (isCompact)
      element.scrollIntoView({
        block: 'nearest',
      });
  };
  let wasKeepButtonFirstRef = React.useRef(false);
  let wasReadyRef = React.useRef(false);
  React.useLayoutEffect(() => {
    let isKeepButtonFirstNow = isKeepButtonFirst();
    let hasKeepButtonBecomeFirst = isKeepButtonFirstNow && !wasKeepButtonFirstRef.current;
    wasKeepButtonFirstRef.current = isKeepButtonFirstNow;
    let isReadyNow = importOfAFile !== null && !isImportPlanComing(importOfAFile) && !isRevealPlaying && isPlanDrawn;
    let hasBecomeReady = isReadyNow && !wasReadyRef.current;
    wasReadyRef.current = isReadyNow;
    let [popup, keepButtonElement] = [popupRef.current, keepButtonRef.current];
    if ((!hasKeepButtonBecomeFirst && !hasBecomeReady) || !caretOwedToPopupRef.current) return;
    if (popup === null || popup.ownerDocument.activeElement !== popup) return;
    if (hasBecomeReady) scrollToKeepButton();
    if (hasKeepButtonBecomeFirst && !focusIfStillWanted(keepButtonElement, isKeyboardLeftOutside, giveCaretBack)) focusElement(keepButtonElement);
  });
  let tableRef = React.useRef(importOfAFile?.table ?? null);
  React.useLayoutEffect(() => {
    let table = importOfAFile?.table ?? null;
    let hasTableChanged = table !== null && tableRef.current !== null && table !== tableRef.current;
    tableRef.current = table;
    let keepButtonElement = keepButtonRef.current;
    if (hasTableChanged && !isKeepButtonFirst() && keepButtonElement?.ownerDocument.activeElement === keepButtonElement)
      focusElement(popupRef.current);
  });
  let wasOpenRef = React.useRef(false);
  let isFileAwaited = fileAwaited !== null;
  React.useLayoutEffect(() => {
    let focusTarget = isOpen ? firstFocusTarget() : chooseButtonRef.current;
    let hasOpened = isOpen !== wasOpenRef.current && (isOpen || isFileAwaited);
    wasOpenRef.current = isOpen;
    if (hasOpened && !focusIfStillWanted(focusTarget, isKeyboardLeftOutside, giveCaretBack)) focusElement(focusTarget);
  });
  let wasOnGridRef = React.useRef(isOnGrid);
  React.useLayoutEffect(() => {
    if (wasOnGridRef.current === isOnGrid) return;
    wasOnGridRef.current = isOnGrid;
    let focusTarget = firstFocusTarget();
    if (isOpen && !focusIfStillWanted(focusTarget, isKeyboardLeftOutside, giveCaretBack)) focusElement(focusTarget);
  });
  let popupRef = React.useRef(null);
  let wishFieldRef = React.useRef(null);
  let wishButtonsRef = React.useRef(null);
  let leftUndoneRef = React.useRef(null);
  let [typedKeeper] = React.useState(createTypedKeeper);
  let isCaretInWishFieldRef = React.useRef(false);
  let isCaretInWishAreaRef = React.useRef(false);
  let wasCompactRef = React.useRef(isCompact);
  React.useLayoutEffect(() => {
    if (wasCompactRef.current === isCompact) return;
    wasCompactRef.current = isCompact;
    let wishField = wishFieldRef.current?.getElement();
    if (!isCaretInWishFieldRef.current || wishField === null || wishField === undefined) return;
    isCaretInWishFieldRef.current = false;
    let { activeElement: activeElement, body: body } = wishField.ownerDocument;
    if (activeElement !== null && activeElement !== body) return;
    wishField.focus({
      preventScroll: true,
    });
    if (isCompact)
      wishField.scrollIntoView({
        block: 'nearest',
      });
    if (wishField instanceof HTMLTextAreaElement) wishField.setSelectionRange(wishField.value.length, wishField.value.length);
  }, [isCompact]);
  let focusRescueProps = useFocusRescue(() => {
    let pictureBoxButton = popupRef.current?.querySelector(PICTURE_BOX_ENABLED_BUTTONS_SELECTOR);
    let paneButton = [...(popupRef.current?.querySelectorAll(IMPORT_PANE_ENABLED_BUTTONS_SELECTOR) ?? [])].find(
      (button?: Dynamic) => button.getClientRects().length > 0,
    );
    let wishTarget = isCaretInWishAreaRef.current
      ? ((isCompact ? null : wishFieldRef.current?.getElement()) ?? leftUndoneRef.current)
      : null;
    isCaretInWishAreaRef.current = false;
    let focusTarget =
      wishTarget ??
      pictureBoxButton ??
      wishButtonsRef.current?.querySelector('button') ??
      (isCompact ? paneButton : null) ??
      wishFieldRef.current?.getElement() ??
      paneButton;
    if (focusTarget === undefined) return;
    let focusIfLost = () => {
      let activeElement = focusTarget.ownerDocument.activeElement;
      if (activeElement !== null && activeElement !== popupRef.current && activeElement !== focusTarget.ownerDocument.body) return;
      focusTarget.focus({
        preventScroll: true,
      });
      if (isCompact)
        focusTarget.scrollIntoView({
          block: 'nearest',
        });
    };
    offerKeyboardWhenReady(focusTarget, focusIfLost, {
      onGivenUp: focusIfLost,
    });
  });
  React.useEffect(() => {
    if (!isOnGrid || !isOpen) return;
    let onMouseDown = (event?: Dynamic) => {
      if (!isPictureBoxElement(event.target)) return;
      event.preventDefault();
      caretOwedToPopupRef.current = false;
      popupRef.current?.focus({
        preventScroll: true,
        focusVisible: false,
      });
    };
    (document as Dynamic).addEventListener('mousedown', onMouseDown, true);
    return () => (document as Dynamic).removeEventListener('mousedown', onMouseDown, true);
  }, [isOnGrid, isOpen]);
  let caretBeforeDiscardRef = React.useRef(null);
  let whatHasCaretAfterDiscard = React.useCallback(() => {
    let caretTarget = pendingFocusTarget(
      caretBeforeDiscardRef.current,
      isOpen ? popupRef.current : null,
      isKeyboardLeftOutside,
      onCaretOwed,
    );
    caretBeforeDiscardRef.current = null;
    if (caretTarget === false || caretTarget.tabIndex >= 0) return caretTarget;
    caretTarget.focus({
      preventScroll: true,
    });
    return false;
  }, [isOpen, isKeyboardLeftOutside, onCaretOwed]);
  let leftToCheckId = React.useId();
  let hasSettingsLeftToCheck = importShown !== null && !isImportPlanComing(importShown) && openImportQuestionCount(importShown) > 0;
  let warningId = React.useId();
  let warning = importShown === null ? null : importWarningWords(importShown);
  let describedBy = [...(warning === null ? [] : [warningId]), ...(hasSettingsLeftToCheck ? [leftToCheckId] : [])];
  let keepArea = (open?: Dynamic) =>
    jsxs(Fragment, {
      children: [
        hasSettingsLeftToCheck &&
          jsx('span', {
            id: leftToCheckId,
            hidden: true,
            children: importReviewMessages.settingsLeftToCheck(openImportQuestionCount(open)),
          }),
        warning !== null &&
          jsx('span', {
            id: warningId,
            hidden: true,
            children: warning,
          }),
        keepButton(open),
      ],
    });
  let keepButton = (open?: Dynamic) =>
    jsx(Button, {
      ref: keepButtonRef,
      variant: 'primary',
      'aria-disabled': !canImportBeConfirmed(open),
      'aria-describedby': describedBy.length > 0 ? describedBy.join(' ') : undefined,
      className: `min-w-28 flex-none ${canImportBeConfirmed(open) && !planArrivalFlash.isOn && isPlanDrawn ? '' : 'opacity-50'}`,
      onKeyDown: (event?: Dynamic) => {
        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
      },
      onClick: () => {
        if (canImportBeConfirmed(open) && !planArrivalFlash.isOnNow() && isPlanDrawn) onConfirmed(open.plansHeardCount);
      },
      children:
        onGridShown !== null && (onGridShown.proposal !== null || importDestinationOf(open).kind === 'newSheet')
          ? importDialogLabels.apply()
          : importConfirmLabel(open),
    });
  let sayable =
    importOfAFile === null || !isOnGrid
      ? null
      : {
          table: importOfAFile.table,
          plansHeardCount: importOfAFile.plansHeardCount,
          isAwaited: isImportPlanComing(importOfAFile) || isRevealPlaying,
        };
  let [saidState, setSaidState] = React.useState(IMPORT_SAID_AT_START);
  let isSameSaid =
    saidState.of?.table === sayable?.table &&
    saidState.of?.plansHeardCount === sayable?.plansHeardCount &&
    saidState.of?.isAwaited === sayable?.isAwaited;
  let summaryWords = importOfAFile !== null && isOnGrid && importSummaryWords(importOfAFile, isRevealPlaying);
  if (isSameSaid && saidState.words !== false && saidState.words !== summaryWords)
    setSaidState({
      ...saidState,
      words: false,
    });
  if (!isSameSaid)
    setSaidState({
      of: sayable,
      words: summaryWords,
      times: saidState.times + (sayable?.isAwaited === true && saidState.of?.table === sayable.table ? 0 : 1),
    });
  return jsx(Dialog.Root, {
    open: isOpen || fileAwaited !== null,
    disablePointerDismissal: isOpen,
    onOpenChange: (willOpen: Dynamic, { reason: reason, event: event }: Dynamic) => {
      if (willOpen) return;
      let isKeyRepeat = event instanceof KeyboardEvent && event.repeat;
      let closeKind = importDialogCloseKind(reason === 'escape-key', isKeyRepeat, isOnGrid);
      if (closeKind === 'stays') return;
      if (closeKind === 'isDropped') return onDropped();
      let activeElement = popupRef.current?.ownerDocument.activeElement;
      let isCaretInPopup = activeElement instanceof HTMLElement && popupRef.current?.contains(activeElement) === true;
      caretBeforeDiscardRef.current = isCaretInPopup ? activeElement : null;
      return onEscaped(isOnGrid && (typedKeeper.last()?.wish.trim() ?? '') !== '');
    },
    onOpenChangeComplete: (isOpenAfter?: Dynamic) => {
      if (isOpenAfter) return;
      setLastImport(null);
      setFileAwaitedShown(null);
    },
    children: jsxs(Dialog.Popup, {
      ref: popupRef,
      ...importDialogPopupSize(importShown !== null),
      onPointerDownCapture: () => void (caretOwedToPopupRef.current = false),
      initialFocus: () => {
        if (isOpen) {
          let focusTarget = firstFocusTarget();
          if (!focusIfStillWanted(focusTarget, isKeyboardLeftOutside, giveCaretBack)) focusElement(focusTarget);
          return false;
        }
        let chooseButton = chooseButtonRef.current;
        let focusOptions = {
          preventScroll: true,
          focusVisible: (fileAwaited?.refusedCount ?? 0) > 0 ? wasKeyPressedLast() : fileAwaited?.isAskedByKey === true,
        };
        chooseButton?.focus(focusOptions);
        if (chooseButton?.ownerDocument.activeElement !== chooseButton) chooseButton?.focus(focusOptions);
        return false;
      },
      finalFocus: whatHasCaretAfter,
      children: [
        importShown !== null &&
          onGridShown !== null &&
          jsxs('div', {
            role: 'presentation',
            className: `flex min-h-0 flex-1 flex-col ${isCompact ? '-mx-[var(--ui-pad-xl)] -mb-[var(--ui-pad-xl)] overflow-y-auto px-xl pb-xl' : ''}`,
            ...{
              [SCROLLS_AROUND_PICTURE_ATTRIBUTE]: isCompact || undefined,
            },
            ...focusRescueProps,
            children: [
              jsx(Dialog.Header, {
                className: 'mb-0 after:hidden',
                children: importDialogLabels.importCsv(),
              }),
              jsx(ImportReviewInDialog, {
                open: importShown,
                isInTabs: isCompact,
                picture: isOpen ? onGridShown.picture : null,
                zoom: onGridShown.zoom,
                proposal: jsx(ImportProposalInBox, {
                  form: onGridShown,
                  open: importShown,
                  hasBanner: !isCompact,
                }),
                errorForPicture: onGridShown.cannotBeDrawn
                  ? importReviewMessages.previewNotShown()
                  : onGridShown.proposal === null && isImportWithoutRoom(importShown)
                    ? csvFileMessages.noRoom()
                    : null,
                underBothTabs: onGridShown.proposal === null ? importBannerElement(importShown) : null,
                outcome: importOutcomeSaid(importShown),
                shimmer: onGridShown.shimmer,
                columnsRevealed: onGridShown.columnsRevealed,
                lastRow: onGridShown.lastRow,
                isPlanDrawn: onGridShown.isPlanDrawn,
                hasPictureLinesUnfolded: onGridShown.hasLinesUnfolded,
                onRoomMeasured: onGridShown.onRoomMeasured,
                keepButton: keepArea(importShown),
                agentAtWork: jsx(AgentReadingMark, {
                  children: agentAtWorkWords(importShown, onGridShown.columnsRevealed),
                }),
                agentAtWorkInWords: agentAtWorkWords(importShown, onGridShown.columnsRevealed),
                wishToAgent:
                  isWishComposerShown(importShown) || isWishLeftUndone(importShown)
                    ? jsxs(ContentsBox, {
                        onFocus: (event?: Dynamic) => {
                          let target = event.target;
                          isCaretInWishAreaRef.current = true;
                          isCaretInWishFieldRef.current = target === wishFieldRef.current?.getElement();
                        },
                        onBlur: () => {
                          isCaretInWishAreaRef.current = false;
                          isCaretInWishFieldRef.current = false;
                        },
                        children: [
                          jsx(WishOutcomeLine, {
                            open: importShown,
                            leftUndoneRef: leftUndoneRef,
                          }),
                          isWishComposerShown(importShown) &&
                            jsx('div', {
                              className: 'px-px',
                              children: jsx(WishToAgentComposer, {
                                open: importShown,
                                isPlayed: onGridShown.columnsRevealed !== null,
                                typedKept: typedKeeper,
                                fieldRef: wishFieldRef,
                                buttonsRef: wishButtonsRef,
                                onWished: dialogProps.onWished,
                                onAwaitedNoLonger: dialogProps.onAwaitedNoLonger,
                              }),
                            }),
                        ],
                      })
                    : null,
                onDiscarded: onDropped,
                wordOfAgent: wordOfAgentForImport(importShown),
                onAskedAgain: hasFirstPlanFailed(importShown) ? dialogProps.onAskedAgain : null,
                onKindsWanted: dialogProps.onKindsWanted,
                onAnswered: dialogProps.onAnswered,
                onDestinationPicked: dialogProps.onDestinationPicked,
                onChangedByHand: dialogProps.onChangedByHand,
                onColumnsPointedAt: onGridShown.onColumnsPointedAt,
                onNoRowPointedAt: onGridShown.onNoRowPointedAt,
                onColumnWanted: onGridShown.onColumnWanted,
                firstTextCells: onGridShown.firstTextCells,
                columnsUnfolded: onGridShown.columnsUnfolded,
                onLeftOutShown: onGridShown.onLeftOutShown,
              }),
            ],
          }),
        importShown === null &&
          fileAwaitedShown !== null &&
          jsxs(Fragment, {
            children: [
              jsx(Dialog.Header, {
                children: importReviewMessages.titleWithNoFile(),
              }),
              jsx(ChooseFilePane, {
                fileAwaited: fileAwaitedShown,
                chooseRef: chooseButtonRef,
                onChoose: onFileAsked,
                onDropped: onFileDropped,
              }),
              jsx(Dialog.Footer, {
                align: 'end',
                children: jsx(Dialog.Close, {
                  render: jsx(Button, {
                    variant: 'secondary',
                    children: sheetMessages.cancel(),
                  }),
                }),
              }),
            ],
          }),
        jsx(DiscardImportDialog, {
          isAsked: importOfAFile?.isDiscardAsked === true,
          whatHasCaretAfter: whatHasCaretAfterDiscard,
          onKept: onKept,
          onDropped: onDropped,
        }),
        jsx(SettledAnnouncer, {
          words: saidState.words,
          timesSaid: saidState.times,
          inPageOf: popupRef,
          isFocusYetToMove:
            importOfAFile !== null && canImportBeConfirmed(importOfAFile) && !isRevealPlaying && (planArrivalFlash.isOn || !isPlanDrawn),
        }),
      ],
    }),
  });
});
