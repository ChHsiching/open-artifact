/** What the tab list is doing: which tab is being renamed or deleted, what is folded, and a write in flight. */
import { create } from 'zustand';

export interface Renaming {
  id: string;
  draft: string;
}

export interface TabsUiState {
  /** The tab picker's list is open. */
  pickerOpen: boolean;
  renaming: Renaming | null;
  /** The tab whose delete is being confirmed. */
  deleting: string | null;
  /**
   * Rows opened or shut by their toggle: an open row shows its subtabs and, for the open tab, its headings. A row
   * not listed is open when it has subtabs.
   */
  expanded: Record<string, boolean>;
  /** A tab write is on its way: the list's actions wait for it. */
  busy: boolean;
  /** The last write that failed, in words. */
  error: string | null;
}

export const useTabsUi = create<TabsUiState>(() => ({
  pickerOpen: false,
  renaming: null,
  deleting: null,
  expanded: {},
  busy: false,
  error: null,
}));

export const setTabsUi = useTabsUi.setState;
export const getTabsUi = useTabsUi.getState;

/** Opens a row so its subtabs show. */
export const expandRow = (id: string) => setTabsUi(state => (state.expanded[id] === false ? { expanded: { ...state.expanded, [id]: true } } : state));
