import type { Dynamic } from '../dynamic.ts';
import type { PageState } from '../state/initial-state.ts';
export function carryFormulaOfAgentDiscarded(previousState: Dynamic, state: PageState) {
  let { lastDone: lastDone } = state;
  return previousState.lastDone?.what === 'formulaOfAgentDiscarded' && lastDone?.what === 'sheetShown'
    ? {
        ...state,
        lastDone: {
          ...lastDone,
          isFormulaOfAgentDiscarded: true,
        },
      }
    : state;
}
export const dropFormulaOfAgentDiscarded = (state: PageState) =>
  state.lastDone?.what === 'formulaOfAgentDiscarded'
    ? {
        ...state,
        lastDone: null,
      }
    : state;
