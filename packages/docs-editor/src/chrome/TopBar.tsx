/** The bar over the doc: its name and whether everything is saved. */
import { type ReactNode } from 'react';
import { useDocs } from '../app/store.ts';
import type { SyncStatus } from '../sync/tab-sync.ts';
import { DocTitle } from '../topbar/DocTitle.tsx';
import { Slot } from './Slot.tsx';

const STATUS_WORDS: Record<SyncStatus, string | null> = { saved: null, saving: 'Saving…', offline: 'Offline — changes will be saved when you reconnect', stopped: 'Changes can’t be saved' };

export function TopBar(): ReactNode {
  const status = useDocs(state => (state.activeTab ? state.saving[state.activeTab] : undefined));
  const words = status ? STATUS_WORDS[status] : null;
  return (
    <header className="flex h-12 flex-none items-center gap-3 border-b border-chrome-line bg-chrome px-3">
      <DocTitle />
      <div className="flex-1" />
      <div className="text-xs text-chrome-muted" role="status" aria-live="polite" data-save-status={status ?? 'saved'}>
        {words}
      </div>
      <Slot name="topBar" />
    </header>
  );
}
