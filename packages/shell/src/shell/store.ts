/**
 * The Shell's store: the boot, what the library and the page report, the
 * host, and which of the bar's panels are open. Network calls live in
 * `actions.ts`; postMessage traffic in `bridge.ts`.
 */

import { create } from 'zustand';
import type { ArtifactDetail, ArtifactView, ChromeExportItem, ChromeReport, ShareView, ShellBoot } from '@open-artifact/protocol';
import { hasExportTab, type HostInfo, type SentMessage } from './model.ts';

/** Which tab of the Share panel shows. */
export type ShareTab = 'share' | 'export';

/** The Share panel's data. */
export interface ShareState {
  /** The sharing state, once loaded. */
  view: ShareView | null;
  /** The type cannot share (`409 unsupported`). */
  unsupported: boolean;
  /** The last failure, shown in the panel. */
  error: string;
  /** The page's export items; `null` while loading. */
  exports: ChromeExportItem[] | null;
  /** Which copy button shows "Copied" for a moment. */
  copied: string | null;
}

/** State of the Shell. */
export interface ShellState {
  /** What the daemon injected; `null` until known. */
  boot: ShellBoot | null;
  /** Set when no boot could be had. */
  bootError: string | null;
  /** The artifact as the library has it (owner status, pinned, size). */
  artifact: ArtifactDetail | null;
  /** What the page reports (chrome protocol). */
  report: ChromeReport;
  /** The embedding host, once it said hello. */
  host: HostInfo | null;
  /** Every artifact, for Switch artifact; `null` until loaded or after a change. */
  library: ArtifactView[] | null;
  /** The whole bar is hidden (`?toolbar=0`). */
  barHidden: boolean;
  /** The artifact menu is open. */
  menuOpen: boolean;
  /** The Share panel is open. */
  shareOpen: boolean;
  shareTab: ShareTab;
  /**
   * The Export tab was asked for before the page reported its formats: the
   * panel shows it as soon as they come (until it closes or the tab changes).
   */
  exportWanted: boolean;
  share: ShareState;
  /** The "Ask agent" pane is open. */
  askOpen: boolean;
  /** Messages sent from the ask pane. */
  sent: SentMessage[];
  /** The ask pane's status line. */
  askStatus: string;
  /** The title is being renamed in place. */
  renaming: boolean;
  /** The delete confirmation is open. */
  confirmingDelete: boolean;
}

/** Changes to the Shell's state. */
export interface ShellActions {
  setBoot(boot: ShellBoot | null, error?: string | null): void;
  setArtifact(artifact: ArtifactDetail | null): void;
  /** Merges a library answer (e.g. after `artifacts.update`) into the artifact. */
  mergeArtifact(patch: Partial<ArtifactDetail>): void;
  setReport(report: ChromeReport): void;
  setHost(host: HostInfo): void;
  setLibrary(library: ArtifactView[] | null): void;
  setBarHidden(hidden: boolean): void;
  setMenuOpen(open: boolean): void;
  /**
   * Opens the Share panel on a tab (Export only when it has rows: the
   * page's exports, or the folder's zip).
   * With `wait`, an Export tab the page has not reported formats for yet
   * shows once it does.
   */
  openShare(tab: ShareTab, options?: { wait?: boolean }): void;
  closeShare(): void;
  setShareTab(tab: ShareTab): void;
  patchShare(patch: Partial<ShareState>): void;
  setAskOpen(open: boolean): void;
  setSent(sent: SentMessage[]): void;
  setAskStatus(status: string): void;
  setRenaming(renaming: boolean): void;
  setConfirmingDelete(open: boolean): void;
  /** Closes every popup (a press went into the page's frame). */
  closePopups(): void;
}

const EMPTY_SHARE: ShareState = { view: null, unsupported: false, error: '', exports: null, copied: null };

/** The Shell's store. */
export const useShell = create<ShellState & ShellActions>()((set, get) => ({
  boot: null,
  bootError: null,
  artifact: null,
  report: {},
  host: null,
  library: null,
  barHidden: false,
  menuOpen: false,
  shareOpen: false,
  shareTab: 'share',
  exportWanted: false,
  share: EMPTY_SHARE,
  askOpen: false,
  sent: [],
  askStatus: '',
  renaming: false,
  confirmingDelete: false,

  setBoot: (boot, error = null) => set({ boot, bootError: error }),
  setArtifact: (artifact) => set({ artifact }),
  mergeArtifact: (patch) => {
    const current = get().artifact;
    if (current) set({ artifact: { ...current, ...patch } });
  },
  setReport: (report) =>
    set((state) => (state.exportWanted && state.shareOpen && hasExportTab(report) ? { report, shareTab: 'export', exportWanted: false } : { report })),
  setHost: (host) => set({ host }),
  setLibrary: (library) => set({ library }),
  setBarHidden: (barHidden) => set({ barHidden }),
  setMenuOpen: (menuOpen) => set(menuOpen ? { menuOpen, shareOpen: false } : { menuOpen }),
  openShare: (tab, options) =>
    set((state) => {
      const exportNow = tab === 'export' && hasExportTab(state.report);
      return {
        shareOpen: true,
        menuOpen: false,
        shareTab: exportNow ? 'export' : 'share',
        exportWanted: tab === 'export' && !exportNow && !!options?.wait,
        share: state.shareOpen ? state.share : { ...EMPTY_SHARE, view: state.share.view, unsupported: state.share.unsupported },
      };
    }),
  closeShare: () => set({ shareOpen: false, exportWanted: false }),
  setShareTab: (tab) => set((state) => ({ shareTab: tab === 'export' && !hasExportTab(state.report) ? 'share' : tab, exportWanted: false })),
  patchShare: (patch) => set((state) => ({ share: { ...state.share, ...patch } })),
  setAskOpen: (askOpen) => set({ askOpen }),
  setSent: (sent) => set({ sent }),
  setAskStatus: (askStatus) => set({ askStatus }),
  setRenaming: (renaming) => set({ renaming, menuOpen: false }),
  setConfirmingDelete: (confirmingDelete) => set({ confirmingDelete }),
  closePopups: () => set({ menuOpen: false, shareOpen: false, exportWanted: false }),
}));

/** The boot, for components that render only once it is known. */
export function useBoot(): ShellBoot {
  const boot = useShell((state) => state.boot);
  if (!boot) throw new Error('The Shell rendered before its boot.');
  return boot;
}
