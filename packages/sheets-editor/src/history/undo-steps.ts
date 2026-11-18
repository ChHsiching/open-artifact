import type { Dynamic } from '../dynamic.ts';
export function stepsToUndoAfter(count?: Dynamic, event?: Dynamic) {
  if (event.kind === 'editAnswered') return event.outcome.kind === 'editQueued' ? count + 1 : count;
  if (event.kind === 'takeBackAnswered') return event.outcome.kind === 'made' ? count + 1 : count;
  if (event.kind === 'editsDropped') return 0;
  if (event.kind !== 'undoOrRedoAnswered') return count;
  let { direction: direction, outcome: outcome } = event;
  if (outcome.kind === 'made') return direction === 'undo' ? Math.max(0, count - 1) : count + 1;
  if (direction === 'redo' || outcome.kind === 'refused') return count;
  return outcome.kind === 'nothingLeft' ? 0 : Math.max(0, count - 1);
}
