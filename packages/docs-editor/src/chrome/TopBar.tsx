/**
 * The bar over the doc: its name and whether everything is saved.
 *
 * The save state is only shown when something needs the person's attention: edits that aren't saved, a connection
 * being retried, or a page that may no longer save. Opening, saving, syncing and saved are said to screen readers only.
 * Words the server would not take are named in a notice.
 */
import { toast } from '@open-artifact/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { useDocShell } from '../app/shell.ts';
import { useDocs } from '../app/store.ts';
import { type SyncStatus, onUnsavedWords } from '../sync/tab-sync.ts';
import { droppedNotice } from '../saving/words.ts';
import { DocTitle } from '../topbar/DocTitle.tsx';
import { Slot } from './Slot.tsx';

type SaveChip = SyncStatus | 'opening' | 'readOnly';

/** What the chip says on screen; the states left out are not shown. */
const SHOWN: Partial<Record<SaveChip, string>> = {
  unsaved: 'Unsaved changes',
  reconnecting: 'Reconnecting…',
  stopped: 'Changes can’t be saved',
};

/** What screen readers are told. */
const SPOKEN: Record<SaveChip, string> = {
  opening: 'Opening…',
  saving: 'Saving…',
  syncing: 'Syncing…',
  saved: 'All changes saved',
  unsaved: 'Unsaved changes',
  reconnecting: 'Reconnecting…',
  stopped: 'Changes can’t be saved',
  readOnly: 'Read only',
};

/** How long a quiet state has to last before it is read out, so typing doesn't set off "Saving…, saved" each time. */
const QUIET_SPEAK_MS = 1000;

function useSaveChip(): SaveChip {
  const phase = useDocs(state => state.phase.kind);
  const writable = useDocs(state => state.writable);
  const status = useDocs(state => (state.activeTab ? state.saving[state.activeTab] : undefined));
  if (phase !== 'ready') return 'opening';
  if (status === 'stopped') return 'stopped';
  // The title's access badge already shows "View only" or "Can comment" on screen.
  if (!writable) return 'readOnly';
  return status ?? 'saved';
}

export function TopBar(): ReactNode {
  const framed = useDocShell(state => state.draws.has('formats'));
  const chip = useSaveChip();
  const shown = SHOWN[chip] ?? null;
  const [spoken, setSpoken] = useState(SPOKEN[chip]);

  useEffect(() => {
    if (shown) {
      setSpoken(SPOKEN[chip]);
      return;
    }
    const timer = setTimeout(() => setSpoken(SPOKEN[chip]), QUIET_SPEAK_MS);
    return () => clearTimeout(timer);
  }, [chip, shown]);

  useEffect(
    () =>
      onUnsavedWords((words, _tab, reason) => {
        toast.add(droppedNotice(words, reason));
      }),
    [],
  );

  if (framed) return <span className="sr-only" role="status">{spoken}</span>;
  return (
    <header className="flex h-12 flex-none items-center gap-3 border-b border-chrome-line bg-chrome px-3">
      <DocTitle />
      <div className="flex-1" />
      <div className="text-xs text-chrome-muted" data-save-status={chip}>
        <span className="sr-only" role="status" aria-live="polite">
          {spoken}
        </span>
        {shown ? (
          <span aria-hidden className="inline-flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${chip === 'reconnecting' ? 'bg-chrome-muted' : 'bg-amber-500'}`} />
            {shown}
          </span>
        ) : null}
      </div>
      <Slot name="topBar" />
    </header>
  );
}
