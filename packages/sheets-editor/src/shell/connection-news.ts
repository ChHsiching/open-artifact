import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** What is wrong with the connection to the sheet, for the save status to tell. */
export interface ConnectionProblem {
  inWords: string;
  /** The problem is expected to pass on its own. */
  mayPass: boolean;
  asksForReload: boolean;
  areEditsUnsaved: boolean;
}

export interface ConnectionNews {
  store: StoreApi<{ problem: ConnectionProblem | null }>;
  now(): ConnectionProblem | null;
  tell(problem: ConnectionProblem | null): void;
}

const isSameProblem = (a: ConnectionProblem | null, b: ConnectionProblem | null): boolean =>
  a?.inWords === b?.inWords && a?.mayPass === b?.mayPass && a?.asksForReload === b?.asksForReload && a?.areEditsUnsaved === b?.areEditsUnsaved;

export function createConnectionNews(): ConnectionNews {
  const store = createStore<{ problem: ConnectionProblem | null }>()(() => ({ problem: null }));
  return {
    store,
    now: () => store.getState().problem,
    tell(problem) {
      if (!isSameProblem(problem, store.getState().problem)) store.setState({ problem });
    },
  };
}

const problemOf = (state: { problem: ConnectionProblem | null }): ConnectionProblem | null => state.problem;

export const useConnectionProblem = (news: ConnectionNews): ConnectionProblem | null => useStore(news.store, problemOf);
