import { useToasts } from '../kit/toast.tsx';
import { Progress } from '../kit/progress.tsx';
import { useUiWindow } from '../kit/theme.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { saveStatusText, savingChangesText, calculatingFormulasText, allChangesSavedText } from '../i18n/notice-labels.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { useFollowed, useFollowedValueOf } from '../state/followed-values.ts';
import { UncommentableToastText } from '../shell/ui-root.ts';
import { isEditRefusedForSaving } from '../state/queries.ts';
export function saveStatusCard(
  saving?: Dynamic,
  hasUnsavedEdits?: Dynamic,
  connectionNews?: Dynamic,
  isRetryLong: Dynamic = false,
  isEditingPaused: Dynamic = false,
) {
  let connectionCard =
    connectionNews === null
      ? null
      : {
          words: connectionNews.inWords,
          isAboutConnection: true,
          isAboutPause: false,
          isWarning: false,
          asksForReload: connectionNews.asksForReload,
          offersReload: connectionNews.asksForReload && !hasUnsavedEdits,
          waitMs: connectionNews.mayPass ? PASSING_CONNECTION_NOTICE_DELAY_MS : 0,
        };
  let words = saveStatusText(saving, hasUnsavedEdits, isRetryLong, isEditingPaused);
  if (words === null) return connectionCard;
  if (connectionNews !== null && !connectionNews.mayPass && !hasUnsavedEdits && saving === 'stopped') return connectionCard;
  let isAboutPause = saving === 'allSaved' || saving === 'saving';
  if (isAboutPause && connectionNews !== null && !connectionNews.mayPass) return connectionCard;
  let asksForReload = saving !== 'retrying' && !isAboutPause;
  return {
    words: words,
    isAboutConnection: false,
    isAboutPause: isAboutPause,
    isWarning: saving === 'retrying' && isRetryLong,
    asksForReload: asksForReload,
    offersReload: asksForReload && !hasUnsavedEdits,
    waitMs: saving === 'retrying' ? RETRYING_NOTICE_DELAY_MS : 0,
  };
}
export function isConnectionNewsCoveredBySaveCard(saving?: Dynamic, connectionNews?: Dynamic) {
  if (connectionNews === null || connectionNews.mayPass) return true;
  let card = saveStatusCard(saving, connectionNews.areEditsUnsaved, connectionNews);
  return card !== null && (card.isAboutConnection || (connectionNews.asksForReload && card.asksForReload));
}
export function nextAllSavedSay(allSavedSay?: Dynamic, situation?: Dynamic) {
  let isOwed = allSavedSay === 'owedInLine' || allSavedSay === 'owed';
  if (situation.saving === 'retrying') return isOwed ? allSavedSay : 'owedInLine';
  if (!isOwed) return situation.isCardDue || situation.saving !== 'allSaved' ? 'none' : allSavedSay;
  if (situation.wereEditsDropped) return 'none';
  if (situation.saving === 'saving') return allSavedSay;
  if (situation.saving !== 'allSaved') return 'none';
  return allSavedSay === 'owed' ? 'said' : 'saidInLine';
}
export function useIsTrueForVisibleMs(isTrue?: Dynamic, delayMs?: Dynamic) {
  let [isDue, setIsDue] = React.useState(false);
  let pageWindow = useUiWindow();
  React.useEffect(() => {
    if (!isTrue || pageWindow === undefined) return;
    let doc = pageWindow.document;
    let remainingMs: Dynamic = delayMs;
    let startedAt: Dynamic = 0;
    let timer: Dynamic = null;
    let restartTimer = () => {
      if (timer !== null) {
        pageWindow.clearTimeout(timer);
        timer = null;
        remainingMs -= pageWindow.performance.now() - startedAt;
      }
      if (doc.hidden) return;
      startedAt = pageWindow.performance.now();
      timer = pageWindow.setTimeout(() => setIsDue(true), remainingMs);
    };
    restartTimer();
    doc.addEventListener('visibilitychange', restartTimer);
    return () => {
      doc.removeEventListener('visibilitychange', restartTimer);
      if (timer !== null) pageWindow.clearTimeout(timer);
      setIsDue(false);
    };
  }, [isTrue, delayMs, pageWindow]);
  return isTrue && isDue;
}
export function SaveProgressBar({ fractionSaved: fractionSaved }: Dynamic) {
  return jsxs(Progress.Root, {
    value: useFollowed(fractionSaved),
    size: 'sm',
    'aria-label': savingChangesText(),
    className: 'flex items-center gap-md',
    children: [
      jsx(Progress.Track, {
        children: jsx(Progress.Indicator, {}),
      }),
      jsx(Progress.Value, {}),
    ],
  });
}
export function saveToastContent({
  words: words,
  isWarning: isWarning,
  areWordsDue: areWordsDue,
  under: under,
  isLongSaveTold: isLongSaveTold,
  isLongCalculationTold: isLongCalculationTold2,
  isAllSavedSaid: isAllSavedSaid,
}: Dynamic) {
  if (words !== null && areWordsDue)
    return {
      words: words,
      isWarning: isWarning,
      under: under,
    };
  if (under === 'bar')
    return {
      words: savingChangesText(),
      isWarning: false,
      under: under,
    };
  if (isLongCalculationTold2)
    return {
      words: calculatingFormulasText(),
      isWarning: false,
      under: 'barOfUnknownLength',
    };
  if (isLongSaveTold)
    return {
      words: savingChangesText(),
      isWarning: false,
      under: under,
    };
  return isAllSavedSaid
    ? {
        words: allChangesSavedText(),
        isWarning: false,
        under: 'nothing',
      }
    : null;
}
export function SaveStatusToast({
  card: card,
  fractionSaved: fractionSaved,
  isLongSaveTold: isLongSaveTold,
  isLongCalculationTold: isLongCalculationTold2,
  isAllSavedSaid: isAllSavedSaid,
  action: action,
  onUp: onUp,
  onBarUp: onBarUp,
}: Dynamic) {
  let toast = useToasts();
  let shownFraction = useFollowedValueOf(fractionSaved ?? 0);
  let pinToast = React.useEffectEvent((words?: Dynamic, isWarning?: Dynamic, under2?: Dynamic) => {
    toast.setPinned({
      title: jsx(UncommentableToastText, {
        children: words,
      }),
      variant: isWarning ? 'warning' : 'neutral',
      action:
        under2 === 'action'
          ? action
          : under2 === 'bar'
            ? jsx(SaveProgressBar, {
                fractionSaved: shownFraction,
              })
            : under2 === 'barOfUnknownLength'
              ? jsx(CalculatingProgressBar, {})
              : undefined,
    });
  });
  let callOnUp = React.useEffectEvent(() => onUp());
  let callOnBarUp = React.useEffectEvent(() => onBarUp());
  let unpinToast = React.useEffectEvent(() => toast.setPinned(null));
  let wordsDueAtRef = React.useRef(Number.POSITIVE_INFINITY);
  let pageWindow = useUiWindow();
  let under = action !== undefined ? 'action' : fractionSaved !== null ? 'bar' : 'nothing';
  let waitMs = isLongSaveTold && under !== 'bar' && card !== null ? 0 : card?.waitMs;
  let [cardWords, isCardWarning] = [card?.words ?? null, card?.isWarning ?? false];
  React.useEffect(() => {
    if (pageWindow === undefined) return;
    let now = pageWindow.performance.now();
    wordsDueAtRef.current = waitMs === undefined ? Number.POSITIVE_INFINITY : Math.min(wordsDueAtRef.current, now + waitMs);
    let showToast = (areWordsDue2?: Dynamic) => {
      let content = saveToastContent({
        words: cardWords,
        isWarning: isCardWarning,
        areWordsDue: areWordsDue2,
        under: under,
        isLongSaveTold: isLongSaveTold,
        isLongCalculationTold: isLongCalculationTold2,
        isAllSavedSaid: isAllSavedSaid,
      });
      if (content === null) unpinToast();
      else pinToast(content.words, content.isWarning, content.under);
      if (areWordsDue2) callOnUp();
    };
    let areWordsDue = cardWords !== null && wordsDueAtRef.current <= now;
    showToast(areWordsDue);
    if (cardWords === null || areWordsDue) return;
    let timer = pageWindow.setTimeout(() => showToast(true), wordsDueAtRef.current - now);
    return () => pageWindow.clearTimeout(timer);
  }, [pageWindow, cardWords, waitMs, under, isCardWarning, isLongSaveTold, isLongCalculationTold2, isAllSavedSaid]);
  let isBarShown = under === 'bar';
  React.useEffect(() => {
    if (isBarShown) callOnBarUp();
  }, [isBarShown]);
  React.useEffect(() => {
    if (isLongSaveTold) callOnBarUp();
  }, [isLongSaveTold]);
  React.useEffect(() => () => unpinToast(), []);
  return null;
}
export const RETRYING_NOTICE_DELAY_MS = 5000;
export const PASSING_CONNECTION_NOTICE_DELAY_MS = 7000;
export const LONG_SAVE_NOTICE_DELAY_MS = 2000;
export const LONG_RETRY_WARNING_MS = 90000;
export const SAID_NOTICE_SHOWN_MS = 6000;
export const isSavingStoppedRefusal = (notice?: Dynamic) => notice.kind === 'editRefused' && notice.why === 'savingStopped';
export const isNoticeApartFromSaveCard = (notice?: Dynamic, card?: Dynamic) =>
  !isEditRefusedForSaving(notice) ||
  card?.isAboutConnection === true ||
  (notice.kind === 'editRefused' && notice.why === 'editingPaused' && card?.isAboutPause !== true);
export const doesStepOutLeaveNotice = (action?: Dynamic, notice?: Dynamic, card?: Dynamic) =>
  action.kind === 'stepOutOfCells' && notice !== null && isNoticeApartFromSaveCard(notice, card);
export const areEditsNewlyDropped = ({ newsOfLoss: newsOfLoss }: Dynamic, keptNews?: Dynamic) =>
  newsOfLoss?.kind === 'editsDropped' && newsOfLoss !== keptNews;
export const lossNewsAtAllSaved = (kept: Dynamic, allSavedSay: Dynamic, { saving: saving, newsOfLoss: newsOfLoss }: Dynamic) =>
  saving === 'allSaved' && allSavedSay !== 'owedInLine' && allSavedSay !== 'owed' ? newsOfLoss : kept;
export const nextLongCalculationSay = (calculationSay?: Dynamic, view?: Dynamic, isWorkLeft?: Dynamic) => {
  if (view.isLongCalculationTold) return 'told';
  if (view.calculating !== 'done' || view.viewOnlyBecause !== null || isWorkLeft) return 'none';
  return calculationSay === 'told' ? 'endSaid' : calculationSay;
};
export const nextConnectionBackSay = (backSay?: Dynamic, connection?: Dynamic) => {
  if (connection.isReconnectingSaid) return 'told';
  if (!connection.isOpen || connection.isLineTaken) return 'none';
  return backSay === 'told' ? 'backSaid' : backSay;
};
export const nextIsLongSaveTold = (wasTold?: Dynamic, isSavingLong?: Dynamic, saving?: Dynamic) =>
  isSavingLong || (wasTold && (saving === 'saving' || saving === 'retrying'));
export const CalculatingProgressBar = () =>
  jsx(Progress.Root, {
    value: null,
    size: 'sm',
    'aria-label': calculatingFormulasText(),
  });
