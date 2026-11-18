import type { Dynamic } from '../dynamic.ts';
import type { PageState } from '../state/initial-state.ts';
export function holdOneMoreAct(
  state?: Dynamic,
  holdKind?: Dynamic,
  { hasBegunBeforeAnswerWasSeen: hasBegunBeforeAnswerWasSeen }: Dynamic = {},
) {
  let hold = answerHoldOf(state, holdKind);
  if (hold === null || (hold.stands === 'seen' && hasBegunBeforeAnswerWasSeen !== true)) return state;
  let landed = hold.stands === 'seen' ? asLandedHold(hold) : hold;
  return ANSWER_HOLD_ACCESSORS[holdKind].set(state, {
    ...landed,
    actsHeld: hold.actsHeld + 1,
  });
}
export function markHoldSeen(state: Dynamic, holdKind: Dynamic, { answerId: answerId, actsHeld: actsHeld, sinceMs: sinceMs }: Dynamic) {
  let hold = answerHoldOf(state, holdKind);
  return hold?.stands === 'landed' && hold.answerId === answerId && hold.actsHeld === actsHeld
    ? ANSWER_HOLD_ACCESSORS[holdKind].set(state, {
        ...hold,
        stands: 'seen',
        seenSinceMs: sinceMs,
      })
    : state;
}
export const ANSWER_HOLD_KINDS = ['numberFormat', 'fixes', 'rowsAskedFor'];
export const newAwaitedHold = (answerId?: Dynamic) => ({
  answerId: answerId,
  stands: 'awaited',
  actsHeld: 0,
  seenSinceMs: null,
});
export const asLandedHold = (hold?: Dynamic) => ({
  ...hold,
  stands: 'landed',
  seenSinceMs: null,
});
export const isHoldReleased = (hold: Dynamic, { hasBegunBeforeAnswerWasSeen: hasBegunBeforeAnswerWasSeen }: Dynamic) =>
  hold === null || (hold.stands === 'seen' && hasBegunBeforeAnswerWasSeen !== true);
export const isHoldInForce = (hold?: Dynamic, act?: Dynamic) =>
  hold !== null && hold.stands !== 'awaited' && !isHoldReleased(hold, act);
export const ANSWER_HOLD_ACCESSORS = {
  numberFormat: {
    get: ({ customNumberFormat: customNumberFormat }: Dynamic) => customNumberFormat?.hold ?? null,
    set: (state: PageState, hold?: Dynamic) =>
      state.customNumberFormat === null
        ? state
        : {
            ...state,
            customNumberFormat: {
              ...state.customNumberFormat,
              hold: hold,
            },
          },
  },
  fixes: {
    get: ({ fixesOnCells: fixesOnCells }: Dynamic) => fixesOnCells.stage?.hold ?? null,
    set: (state: PageState, hold?: Dynamic) =>
      state.fixesOnCells.stage === null
        ? state
        : {
            ...state,
            fixesOnCells: {
              ...state.fixesOnCells,
              stage: {
                ...state.fixesOnCells.stage,
                hold: hold,
              },
            },
          },
  },
  rowsAskedFor: {
    get: ({ holdOnRowsFilteredByAgent: holdOnRowsFilteredByAgent }: Dynamic) => holdOnRowsFilteredByAgent,
    set: (state?: Dynamic, hold?: Dynamic) => ({
      ...state,
      holdOnRowsFilteredByAgent: hold,
    }),
  },
};
export const answerHoldOf = (state?: Dynamic, holdKind?: Dynamic) => ANSWER_HOLD_ACCESSORS[holdKind].get(state);
export const holdsOnAgentsAnswers = (state?: Dynamic) => ({
  numberFormat: answerHoldOf(state, 'numberFormat'),
  fixes: answerHoldOf(state, 'fixes'),
  rowsAskedFor: answerHoldOf(state, 'rowsAskedFor'),
});
