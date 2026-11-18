import type { Dynamic } from '../dynamic.ts';
import { dropUnfinishedTestBeingAdded } from '../format/conditional/pane-state.ts';
import { isNothingOpenButPane } from '../state/edit-refusals.ts';
import { hasUnsavedSidePaneTyping } from '../chips/dropdown-pane-edits.ts';
import { undoFormatAsTableChosenLast } from '../tables/format-as-table.ts';
import { withNoEffects } from '../state/transitions.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function stepsToRedoAfterEvent(stepsToRedo?: Dynamic, event?: Dynamic) {
  if (event.kind === 'editAnswered') return event.outcome.kind === 'editQueued' ? 0 : stepsToRedo;
  if (event.kind === 'takeBackAnswered') return event.outcome.kind === 'made' ? 0 : stepsToRedo;
  if (event.kind === 'editsDropped') return 0;
  if (event.kind !== 'undoOrRedoAnswered') return stepsToRedo;
  let { direction: direction, outcome: outcome } = event;
  if (outcome.kind === 'made') return direction === 'undo' ? stepsToRedo + 1 : Math.max(0, stepsToRedo - 1);
  if (direction === 'undo' || outcome.kind === 'refused') return stepsToRedo;
  return outcome.kind === 'nothingLeft' ? 0 : Math.max(0, stepsToRedo - 1);
}
export function whyUndoRedoUnavailable(state: PageState, viewOnlyBecause?: Dynamic) {
  if (viewOnlyBecause !== null) return null;
  let whyUnavailable = (hasSteps?: Dynamic) =>
    !hasSteps ? 'nothingLeft' : isSomethingUnderWay(state) ? 'somethingUnderWay' : null;
  return {
    undo: whyUnavailable(
      state.stepsToUndo > 0 ||
        state.areStepsToUndoLost ||
        state.entriesUnanswered.length > 0 ||
        dropUnfinishedTestBeingAdded(state) !== null ||
        state.formatAsTableChosenLast !== null,
    ),
    redo: whyUnavailable(state.stepsToRedo > 0),
  };
}
export const isQueueEditOfOneAct = (effect?: Dynamic) => effect.kind === 'queueEdit';
export const isSomethingUnderWay = (state: PageState) =>
  state.mode.kind === 'editing' || !isNothingOpenButPane(state) || hasUnsavedSidePaneTyping(state);
export const undoFormatAsTableIfChosenLast = (state: PageState, reads: ReadsWithTextMeasurer) => {
  let undone = undoFormatAsTableChosenLast(state, reads);
  return undone === null ? null : withNoEffects(undone);
};
export const undoOrRedo = (state: PageState, direction?: Dynamic, context?: Dynamic) =>
  (direction === 'undo' ? (dropUnfinishedTestBeingAdded(state) ?? undoFormatAsTableIfChosenLast(state, context.reads)) : null) ?? {
    state: state,
    effects: [
      {
        kind: 'undoOrRedo',
        direction: direction,
      },
    ],
  };
export const undoOrRedoIfFree = (state: PageState, direction?: Dynamic, context?: Dynamic) =>
  isSomethingUnderWay(state) ? withNoEffects(state) : undoOrRedo(state, direction, context);
