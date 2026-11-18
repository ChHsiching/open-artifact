import type { Dynamic } from '../dynamic.ts';
import { canTellAgentSelection } from './view-context.ts';
import { hasOtherRanges } from '../selection/several-ranges.ts';
import { isSameCell } from '../selection/model.ts';
import type { PageState } from '../state/initial-state.ts';
export function settleAskOwedToAgent({ state: state, effects: effects }: Dynamic, workbook?: Dynamic, event?: Dynamic) {
  let canTellNow = canTellAgentSelection(state, workbook);
  if (effects.some(({ kind: kind }: Dynamic) => kind === 'askAgentAboutSelection')) {
    if (canTellNow)
      return {
        state: {
          ...state,
          askOwedToAgent: null,
        },
        effects: effects,
      };
    let { activeCell: activeCell, selectionCorner: selectionCorner, rangeWalked: rangeWalked } = state;
    return {
      state: {
        ...state,
        askOwedToAgent: {
          activeCell: activeCell,
          selectionCorner: selectionCorner,
          rangeWalked: rangeWalked,
        },
      },
      effects: effects.map(
        (effect?: Dynamic) =>
          effect.kind === 'askAgentAboutSelection'
            ? {
                kind: 'oweAgentAnAsk',
              }
            : effect,
      ),
    };
  }
  if (state.askOwedToAgent === null)
    return {
      state: state,
      effects: effects,
    };
  let stateWithoutAsk = {
    ...state,
    askOwedToAgent: null,
  };
  let isGivenUp = event.kind === 'askOwedToAgentGivenUp';
  if (isAskOwedToAgentStale(state) || (isGivenUp && event.by === 'person') || (isGivenUp && !canTellNow))
    return {
      state: stateWithoutAsk,
      effects: [
        ...effects,
        {
          kind: 'giveUpAskOwedToAgent',
        },
      ],
    };
  return canTellNow
    ? {
        state: stateWithoutAsk,
        effects: [
          ...effects,
          {
            kind: 'askAgentAboutSelection',
          },
        ],
      }
    : {
        state: state,
        effects: effects,
      };
}
export const isAskOwedToAgentStale = (state: PageState) =>
  state.askOwedToAgent === null ||
  state.mode.kind !== 'navigating' ||
  state.menu !== null ||
  hasOtherRanges(state) ||
  !isSameCell(state.activeCell, state.askOwedToAgent.activeCell) ||
  !isSameCell(state.selectionCorner, state.askOwedToAgent.selectionCorner) ||
  state.rangeWalked !== state.askOwedToAgent.rangeWalked;
