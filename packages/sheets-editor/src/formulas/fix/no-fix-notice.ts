import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { askAgentToFixSelection } from '../../agent/ask-agent-menu.ts';
import { useFollowedValueOf } from '../../state/followed-values.ts';
import { agentFixStateOf, AskAgentToFixButton } from '../../ui/ask-agent-to-fix-button.ts';
import { jsx } from 'react/jsx-runtime';
import { MountedToast } from '../../ui/mounted-toast.ts';
import { fixFailureText, fixFailureWithButtonText } from '../../i18n/formula-fix-labels.ts';
import { DangerWarningIcon } from '../../ui/warning-icon.ts';
import { LiveAnnouncer } from '../../ui/live-announcer.ts';
export async function askChatAfterNoFix(store?: Dynamic, chat?: Dynamic): Promise<Dynamic> {
  let noticeOfNoFix = store.getView().noticeOfNoFix;
  if (noticeOfNoFix === null || store.isEventUnfinished()) return false;
  store.dispatch({
    kind: 'chatAskedAfterNoFix',
  });
  if (store.getView().selectionByAddress?.range !== noticeOfNoFix.cells) return false;
  let isAsked = await askAgentToFixSelection(chat, store);
  if (isAsked)
    store.dispatch({
      kind: 'noticeOfNoFixPutAway',
    });
  return isAsked;
}
export function NoFixToast({
  why: why,
  isChatOffered: isChatOffered,
  canAttach: canAttach,
  onAgentAsked: onAgentAsked,
  onOver: onOver,
  onTakenDown: onTakenDown,
}: Dynamic) {
  let agentOffer = useFollowedValueOf(agentFixStateOf(isChatOffered ? '' : null, canAttach));
  let askButton = jsx(AskAgentToFixButton, {
    agent: agentOffer,
    onPress: () => onAgentAsked(),
  });
  return jsx(MountedToast, {
    words: fixFailureText(why),
    icon: jsx(DangerWarningIcon, {
      size: 'md',
    }),
    action: why === 'rateLimited' ? undefined : askButton,
    staysUntilClosed: why !== 'rateLimited',
    onOver: onOver,
    onTakenDown: onTakenDown,
  });
}
export const NoFixAnnouncer = React.memo(function ({ why: why, isChatOffered: isChatOffered }: Dynamic) {
  if (why === null)
    return jsx(LiveAnnouncer, {
      words: false,
    });
  let words = isChatOffered && why !== 'rateLimited' ? fixFailureWithButtonText(why) : fixFailureText(why);
  return jsx(LiveAnnouncer, {
    words: words,
  });
});
