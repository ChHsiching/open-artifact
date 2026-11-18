/** The top bar's own state: whether the doc's name is being edited, and which export is on its way. */
import { create } from 'zustand';

export interface TopBarState {
  renaming: boolean;
  /** The export being made, so its menu item reads "Exporting…" and another press waits. */
  exporting: string | null;
}

export const useTopBar = create<TopBarState>(() => ({ renaming: false, exporting: null }));

export const setTopBar = useTopBar.setState;
export const getTopBar = useTopBar.getState;
