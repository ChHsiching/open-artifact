import { useToasts } from '../../kit/toast.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { subscribeToFocusIn, announceWhenSettled } from '../../ui/settled-announcers.ts';
import { jsx } from 'react/jsx-runtime';
import { LiveAnnouncer } from '../../ui/live-announcer.ts';
import { useFollowedValueOf, useFollowed } from '../../state/followed-values.ts';
import { agentFixStateOf, AskAgentToFixButton } from '../../ui/ask-agent-to-fix-button.ts';
import { DangerWarningIcon } from '../../ui/warning-icon.ts';
import { UncommentableToastText } from '../../shell/ui-root.ts';
import { errorCountLabel } from '../../i18n/grid-action-labels.ts';
import { errorsWithFixButtonText } from '../../i18n/formula-fix-labels.ts';
export function areFixesOnOffer(fixes?: Dynamic) {
  let stage = fixes?.stage;
  return stage === 'offered' || stage === 'undecided';
}
export function ErrorsAtOpeningAnnouncer({ store: store, wordsOfLoad: wordsOfLoad, inPageOf: inPageOf, isToastUp: isToastUp }: Dynamic) {
  let [errorsWords, setErrorsWords] = React.useState(null);
  React.useEffect(() => {
    if (!isToastUp) return;
    let stopAnnouncing = announceErrorsAtOpening(store, wordsOfLoad, setErrorsWords, subscribeToFocusIn(inPageOf));
    return () => {
      stopAnnouncing();
      setErrorsWords(null);
    };
  }, [store, wordsOfLoad, inPageOf, isToastUp]);
  return jsx(LiveAnnouncer, {
    words: errorsWords,
  });
}
export function ErrorsAtOpeningToast({
  count: count,
  onAgentAsked: onAgentAsked,
  onDismissed: onDismissed,
  onTakenDown: onTakenDown,
  cells: cells,
  canAttach: canAttach,
  fixedHere: fixedHere,
}: Dynamic) {
  let toaster = useToasts();
  let agentForCells = useFollowedValueOf(agentFixStateOf(cells, canAttach, fixedHere));
  let shownCount = useFollowedValueOf(count);
  let showToast = React.useEffectEvent(
    () =>
      toaster.add({
        title: jsx(ErrorCountToastTitle, {
          count: shownCount,
        }),
        icon: jsx(DangerWarningIcon, {
          size: 'md',
        }),
        action: jsx(AskAgentToFixButton, {
          agent: agentForCells,
          onPress: (howAsked?: Dynamic) => onAgentAsked(howAsked),
        }),
        onClose: ({ byUser: byUser }: Dynamic) => {
          if (byUser) onDismissed();
        },
      }),
  );
  let closeToast = React.useEffectEvent((toastId?: Dynamic) => {
    toaster.close(toastId);
    onTakenDown();
  });
  React.useEffect(() => {
    let toastId = showToast();
    return () => closeToast(toastId);
  }, []);
  return null;
}
export const ErrorCountToastTitle = ({ count: count }: Dynamic) =>
  jsx(UncommentableToastText, {
    children: errorCountLabel(useFollowed(count)),
  });
export const errorsAtOpeningWords = ({ count: count, cells: cells }: Dynamic, options?: Dynamic) =>
  cells === null && !options ? errorCountLabel(count) : errorsWithFixButtonText(count, options);
export const announceErrorsAtOpening = (store?: Dynamic, wordsOfLoad?: Dynamic, say?: Dynamic, subscribeToFocus?: Dynamic) =>
  announceWhenSettled(
    (onChange?: Dynamic) => {
      let unsubscribes = [store.subscribe(onChange), wordsOfLoad.onChanged(onChange)];
      return () => unsubscribes.forEach((input?: Dynamic) => input());
    },
    () => {
      let { errorsAtOpening: errorsAtOpening, fixesOnCells: fixesOnCells, nameBoxText: nameBoxText, mode: mode } = store.getView();
      return {
        words:
          errorsAtOpening !== null && !wordsOfLoad.areWordsToCome() ? errorsAtOpeningWords(errorsAtOpening, areFixesOnOffer(fixesOnCells)) : null,
        about: errorsAtOpening?.sheetId ?? null,
        nameBoxText: nameBoxText,
        mode: mode,
      };
    },
    say,
    subscribeToFocus,
  );
