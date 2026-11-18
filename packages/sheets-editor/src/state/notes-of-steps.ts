import type { CellSelection } from '../selection/model.ts';
import type { PageState } from './initial-state.ts';
import type { PageEvent } from './event-reducer.ts';
import type { StepReversedOutcome } from '../store/workbook-sync.ts';
import type { PageEffect, UndoOrRedoEffect } from './transitions.ts';
import { givesNewRowsFormulas as givesNewRowsFormulasImported } from '../edits/insert-lines.ts';
export function notesOfStepsAfter(state: PageState, event: PageEvent): NotesOfSteps {
  let { notesOfSteps: notesOfSteps, activeCell: activeCell, selectionCorner: selectionCorner } = state;
  if (event.kind === 'takeBackAnswered')
    return event.outcome.kind === 'made'
      ? {
          ...notesOfSteps,
          undone: [],
          latest: null,
        }
      : notesOfSteps;
  if (event.kind === 'editAnswered') {
    if (event.outcome.kind !== 'editQueued') return notesOfSteps;
    let { step: step = null } = event.outcome;
    let { undoSelects: undoSelects = null, isSelectionGivenUp: isSelectionGivenUp } = event.ifQueued;
    let selected: SelectedAroundStep | null =
      undoSelects === null || isSelectionGivenUp === true
        ? null
        : {
            undo: undoSelects,
            redo: {
              activeCell: activeCell,
              selectionCorner: selectionCorner,
            },
          };
    let givesNewRowsFormulas = givesNewRowsFormulasImported(event.edit);
    let notesWithLatest: NotesOfSteps = {
      ...notesOfSteps,
      undone: [],
      latest: step,
    };
    if (step === null || (selected === null && !givesNewRowsFormulas)) return notesWithLatest;
    let note: NoteOfStep = {
      step: step,
      selected: selected,
      givesNewRowsFormulas: givesNewRowsFormulas,
    };
    return {
      ...notesWithLatest,
      notes: [...notesOfSteps.notes, note].slice(-MOST_NOTES_OF_STEPS),
    };
  }
  if (event.kind !== 'undoOrRedoAnswered') return notesOfSteps;
  let { direction: direction, outcome: outcome } = event;
  if (outcome.kind === 'refused' || outcome.kind === 'nothingLeft') return notesOfSteps;
  let stepsReversed = outcome.kind === 'made' ? (outcome.stepReversed ?? []) : [];
  let undone = direction === 'undo' ? notesOfSteps.undone.concat(stepsReversed) : notesOfSteps.undone.slice(0, -1);
  return {
    ...notesOfSteps,
    undone: undone,
    latest: null,
  };
}
export function answerAwaitedAfter(answerAwaited: AnswerAwaited, event: PageEvent, effects: readonly PageEffect[]): AnswerAwaited {
  for (let effect of effects) {
    if (effect.kind === 'undoOrRedo') return 'toUndoOrRedo';
    if (effect.kind === 'queueEdit' && effect.edit.kind === 'importTableAsNewSheet') return 'toImportAsNewSheet';
  }
  return event.kind === 'undoOrRedoAnswered' || (event.kind === 'editAnswered' && event.ifQueued.endsEntryAtOnce !== true) ? null : answerAwaited;
}
export function noteStepsAndAnswerAwaited(state: PageState, event: PageEvent, effects: readonly PageEffect[]): PageState {
  let notesOfSteps = notesOfStepsAfter(state, event);
  let answerAwaited = answerAwaitedAfter(state.answerAwaited, event, effects);
  return notesOfSteps === state.notesOfSteps && answerAwaited === state.answerAwaited
    ? state
    : {
        ...state,
        notesOfSteps: notesOfSteps,
        answerAwaited: answerAwaited,
      };
}
export const NO_NOTES_OF_STEPS: NotesOfSteps = {
  notes: [],
  undone: [],
  latest: null,
};
export const MOST_NOTES_OF_STEPS = 100;
export const noteOfStep = ({ notesOfSteps: notesOfSteps }: Pick<PageState, 'notesOfSteps'>, step: string | undefined): NoteOfStep | null =>
  notesOfSteps.notes.find((note) => note.step === step) ?? null;
export const selectionOfStepReversed = (
  state: Pick<PageState, 'notesOfSteps'>,
  direction: UndoOrRedoEffect['direction'],
  { stepReversed: stepReversed }: Pick<StepReversedOutcome, 'stepReversed'>,
): SelectedAroundStep[UndoOrRedoEffect['direction']] | null =>
  noteOfStep(state, stepReversed)?.selected?.[direction] ?? null;
export const isRedoGivingNewRowsFormulas = (state: Pick<PageState, 'notesOfSteps'>): boolean =>
  noteOfStep(state, state.notesOfSteps.undone.at(-1))?.givesNewRowsFormulas === true;
export interface SelectedAroundStep {
  undo: CellSelection;
  redo: Pick<CellSelection, 'activeCell' | 'selectionCorner'>;
}
export interface NoteOfStep {
  step: string;
  selected: SelectedAroundStep | null;
  givesNewRowsFormulas: boolean;
}
export interface NotesOfSteps {
  notes: NoteOfStep[];
  undone: string[];
  latest: string | null;
}
export type AnswerAwaited = 'toUndoOrRedo' | 'toImportAsNewSheet' | null;
