/** The home page's store: the library, the types, the host and the open dialogs. */

import { create } from 'zustand';
import type { ArtifactView, TypeView, TypesResponse } from '@open-artifact/protocol';
import type { HomeHost } from './host.ts';

/** The home page's tabs. */
export type HomeTab = 'artifacts' | 'types';

/** State of the home page. */
export interface HomeState {
  tab: HomeTab;
  /** Every artifact; `null` until loaded. */
  artifacts: ArtifactView[] | null;
  /** The types and their roots; `null` until loaded. */
  types: TypesResponse | null;
  /** The last load failure. */
  error: string | null;
  /** The embedding host, once it said hello. */
  host: HomeHost | null;
  /** The type the create dialog makes, while it is open. */
  creating: TypeView | null;
  /** The artifact the rename dialog renames, while it is open. */
  renaming: ArtifactView | null;
  /** The artifact just deleted, while its undo shows. */
  undo: { id: string; title: string } | null;
}

/** Changes to the home page's state. */
export interface HomeActions {
  setTab(tab: HomeTab): void;
  setArtifacts(artifacts: ArtifactView[]): void;
  setTypes(types: TypesResponse): void;
  setError(error: string | null): void;
  setHost(host: HomeHost): void;
  setCreating(type: TypeView | null): void;
  setRenaming(artifact: ArtifactView | null): void;
  setUndo(undo: HomeState['undo']): void;
}

const TAB_KEY = 'open-artifact.tab';

function savedTab(): HomeTab {
  try {
    return localStorage.getItem(TAB_KEY) === 'types' ? 'types' : 'artifacts';
  } catch {
    return 'artifacts';
  }
}

/** The home page's store. */
export const useHome = create<HomeState & HomeActions>()((set) => ({
  tab: savedTab(),
  artifacts: null,
  types: null,
  error: null,
  host: null,
  creating: null,
  renaming: null,
  undo: null,

  setTab: (tab) => {
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      // Not remembered; fine.
    }
    set({ tab });
  },
  setArtifacts: (artifacts) => set({ artifacts }),
  setTypes: (types) => set({ types }),
  setError: (error) => set({ error }),
  setHost: (host) => set({ host }),
  setCreating: (creating) => set({ creating }),
  setRenaming: (renaming) => set({ renaming }),
  setUndo: (undo) => set({ undo }),
}));
