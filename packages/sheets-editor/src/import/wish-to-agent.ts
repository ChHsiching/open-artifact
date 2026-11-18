import { ChatComposer } from '../kit/chat-composer.tsx';
import { WorkingMark } from '../kit/agent-mark.tsx';
import { ShimmerText } from '../kit/shimmer-text.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { isImportPlanComing } from './import-review.ts';
import { jsx, jsxs } from 'react/jsx-runtime';
import { importReviewMessages, agentReasonWords } from './csv-file.ts';
import { namesOfStoodSettings } from './settings-aside.ts';
import { namesListedWithMore } from './destination.ts';
export function wishToPutBack({ agent: agent }: Dynamic) {
  if (agent.kind === 'isAsked') return '';
  return agent.kind === 'hasFailed' ? agent.wish : null;
}
export function wishDraftFor(draft?: Dynamic, open?: Dynamic) {
  let putBack = wishToPutBack(open);
  if (draft !== null && draft.ofPlan === open.plan && draft.put === putBack) return draft;
  let keptWish = draft !== null && draft.ofPlan === open.plan ? draft.wish : '';
  return {
    wish: putBack ?? keptWish,
    ofPlan: open.plan,
    put: putBack,
  };
}
export function createTypedKeeper() {
  let lastTyped: Dynamic = null;
  return {
    last: () => lastTyped,
    keep: (typed?: Dynamic) => void (lastTyped = typed),
  };
}
export function WishToAgentComposer({
  open: open,
  isPlayed: isPlayed,
  typedKept: typedKept,
  fieldRef: fieldRef,
  buttonsRef: buttonsRef,
  onWished: onWished,
  onAwaitedNoLonger: onAwaitedNoLonger,
}: Dynamic) {
  let [draft, setDraft] = React.useState(() => wishDraftFor(typedKept.last(), open));
  let draftNow = wishDraftFor(draft, open);
  if (draftNow !== draft) setDraft(draftNow);
  React.useEffect(() => typedKept.keep(draftNow));
  let { wish: wish } = draftNow;
  let isOff = open.agent.kind === 'isAsked' || isImportPlanComing(open);
  let sendWish = () => {
    if (!isOff && !isPlayed && wish.trim() !== '') onWished(wish);
  };
  let onWishKeyDown = (event?: Dynamic) => {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (!isOff && wish === '') return;
    event.stopPropagation();
    event.preventDefault();
    if (isOff) onAwaitedNoLonger();
    else
      setDraft({
        ...draftNow,
        wish: '',
      });
  };
  return jsx(ChatComposer, {
    'aria-label': importReviewMessages.wish(),
    busy: isOff,
    form: 'reply',
    cardClassName: '[--cmp-font-size:var(--ui-font-size-body)]',
    editorRef: fieldRef,
    editor: {
      value: wish,
      onChange: (typedWish?: Dynamic) =>
        setDraft({
          ...draftNow,
          wish: typedWish,
        }),
      placeholder: importReviewMessages.wish(),
      minLines: 1,
      maxHeight: '5.5rem',
      skipAutofocus: true,
      readOnly: isOff || isPlayed,
      onSubmit: sendWish,
      onKeyDownCapture: onWishKeyDown,
    },
    children: jsx(ChatComposer.Actions, {
      send:
        (isOff || wish.trim() !== '') &&
        jsx(ChatComposer.PrimaryAction, {
          ref: buttonsRef,
          onKeyDownCapture: onWishKeyDown,
          onClickCapture: (input?: Dynamic) => {
            if (input.detail > 1) input.stopPropagation();
          },
          state: isOff ? 'busy' : 'idle',
          sendLabel: importReviewMessages.sendWish(),
          stopLabel: importReviewMessages.stop(),
          onSend: sendWish,
          onStop: onAwaitedNoLonger,
        }),
    }),
  });
}
export function AgentReadingMark({ children: children }: Dynamic) {
  return jsxs('span', {
    className: 'flex items-center gap-1.5',
    children: [
      jsx('span', {
        className: 'flex w-3 shrink-0 justify-center',
        children: jsx(WorkingMark, {
        }),
      }),
      jsx(ShimmerText, {
        children: children,
      }),
    ],
  });
}
export function WishOutcomeLine({ open: open, leftUndoneRef: leftUndoneRef }: Dynamic) {
  let { agent: agent } = open;
  let hasWishInFlight = wishInFlight(open) !== null;
  let isLeftUndone = isWishLeftUndone(open);
  let stoodNames = 'stood' in agent ? namesOfStoodSettings(open, agent) : [];
  let isPlanStood = agent.kind === 'hasPlanned' && stoodNames.length > 0;
  let stoodList = namesListedWithMore(stoodNames);
  return jsxs('output', {
    className:
      hasWishInFlight || isLeftUndone || open.isAnAnswerInDoubt || isPlanStood
        ? '-mx-1 flex min-h-5 w-fit max-w-[calc(100%+0.5rem)] items-center rounded px-1 text-footnote [overflow-wrap:anywhere] leading-snug text-secondary focus-visible:shadow-focus focus-visible:outline-hidden'
        : 'sr-only',
    ...(isLeftUndone && {
      ref: leftUndoneRef,
      tabIndex: -1,
    }),
    children: [
      hasWishInFlight &&
        agent.kind === 'isAsked' &&
        jsx('span', {
          className: 'ps-px',
          children: jsx(AgentReadingMark, {
            children: importReviewMessages.agentChangesThePlan(),
          }),
        }),
      ((hasWishInFlight && agent.kind === 'hasFailed') || isLeftUndone) && importReviewMessages.wishFailed(),
      agent.kind === 'hasPlanned' && open.isAnAnswerInDoubt && importReviewMessages.answerStands(),
      isPlanStood && importReviewMessages.theirSettingsWereKept(stoodList),
      agent.kind === 'hasChangedNothing' &&
        (agent.why !== null
          ? agentReasonWords(agent.why)
          : stoodNames.length > 0
            ? importReviewMessages.wishMetWhatTheySet(stoodList)
            : importReviewMessages.wishChangedNothing()),
    ],
  });
}
export const IMPORT_FILE_NAME_MAX_CHARS = 100;
export const wishInFlight = ({ agent: agent }: Dynamic) =>
  agent.kind === 'hasPlanned' || agent.kind === 'isNotToBeHad' || agent.kind === 'isToBeAsked' || agent.kind === 'wasStopped' ? null : agent.wish;
export const isWishLeftUndone = ({ agent: agent }: Dynamic) => agent.kind === 'isNotToBeHad' && agent.leftUndone === 'wish';
export const hasFirstPlanFailed = ({ agent: agent, isPlanByAgent: isPlanByAgent }: Dynamic) =>
  !isPlanByAgent && (agent.kind === 'hasFailed' || agent.kind === 'wasStopped');
export const isFirstPlanLeftUndone = ({ agent: agent }: Dynamic) =>
  agent.kind === 'isNotToBeHad' && agent.leftUndone === 'firstPlan';
