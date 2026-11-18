import type { Dynamic } from '../dynamic.ts';
import { isSameCell } from '../selection/model.ts';
import type { PageState } from '../state/initial-state.ts';
export function editEndsOnAnotherCell(state: PageState, next?: Dynamic, isComposing?: Dynamic) {
  if (state.mode.kind !== 'editing' || isComposing) return false;
  let { state: nextState, effects: effects } = next;
  if (effects.length > 0)
    return effects.some((effect?: Dynamic) => effect.kind === 'queueEdit' && asOneCellSelection(effect.ifQueued.select) !== null);
  return isOneCellSelection(nextState) && !isSameCell(nextState.activeCell, state.activeCell);
}
export const isOneCellSelection = ({ activeCell: activeCell, selectionCorner: selectionCorner }: Dynamic) =>
  isSameCell(activeCell, selectionCorner);
export const asOneCellSelection = (select?: Dynamic) =>
  typeof select === 'object' && select !== null && 'activeCell' in select && isOneCellSelection(select) ? select : null;
