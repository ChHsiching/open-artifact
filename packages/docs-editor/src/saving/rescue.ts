/**
 * An undo or redo whose write was lost halts its tab (tab-sync.ts) and asks here whether to restore the saved tab to
 * what the page shows: one write, refused if the tab changed since. The dialog (RescueDialog.tsx) shows where it stands.
 */
import { create } from 'zustand';
import { type RescueOutcome, type TabSync, onUndoLost } from '../sync/tab-sync.ts';
import type { RescueState } from './words.ts';

interface RescueStore {
  /** The halted tab's sync, while the dialog is up. */
  sync: TabSync | null;
  state: RescueState;
}

export const useRescue = create<RescueStore>(() => ({ sync: null, state: 'asking' }));

/** Listens for a halted tab; answers how to stop. */
export function listenForLostUndo(): () => void {
  return onUndoLost(sync => {
    if (useRescue.getState().sync) return;
    useRescue.setState({ sync, state: 'asking' });
  });
}

/** Sends the restore; the dialog shows how it ended. */
export async function restoreFromPage(): Promise<RescueOutcome | null> {
  const { sync, state } = useRescue.getState();
  if (!sync || state !== 'asking') return null;
  useRescue.setState({ state: 'restoring' });
  let outcome: RescueOutcome;
  try {
    outcome = await sync.rescue();
  } catch {
    outcome = 'not_seen';
  }
  useRescue.setState({ state: outcome });
  return outcome;
}

/** Closes the dialog (not once the doc is restored: the page must reload). */
export function closeRescue(): void {
  if (useRescue.getState().state === 'restored' || useRescue.getState().state === 'restoring') return;
  useRescue.setState({ sync: null, state: 'asking' });
}
