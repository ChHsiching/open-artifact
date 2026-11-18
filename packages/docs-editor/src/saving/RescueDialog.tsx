import { Button, Dialog } from '@open-artifact/ui';
import { type ReactNode, useEffect } from 'react';
import { closeRescue, restoreFromPage, useRescue } from './rescue.ts';
import { rescueWords } from './words.ts';

export function RescueDialog(): ReactNode {
  const sync = useRescue(store => store.sync);
  const state = useRescue(store => store.state);

  useEffect(() => {
    if (!sync || state !== 'asking') return;
    // A printable key is the person going back to typing: the question can wait for the banner.
    const onKey = (event: KeyboardEvent) => {
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) closeRescue();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [sync, state]);

  if (!sync) return null;
  // The banner's “Restore the document…” stands while the tab is halted.
  const words = rescueWords(state, sync.needsRescue);
  const footer =
    state === 'asking' || state === 'restoring' ? (
      <>
        <Button disabled={state === 'restoring'} onClick={() => closeRescue()}>
          Cancel
        </Button>
        <Button variant="primary" data-testid="short-undo-rescue-confirm" disabled={state === 'restoring'} autoFocus onClick={() => void restoreFromPage()}>
          {state === 'restoring' ? 'Restoring…' : 'Restore'}
        </Button>
      </>
    ) : state === 'restored' ? (
      <Button variant="primary" autoFocus onClick={() => location.reload()}>
        Reload
      </Button>
    ) : (
      <Button variant="primary" autoFocus onClick={() => closeRescue()}>
        Close
      </Button>
    );

  return (
    <Dialog open onOpenChange={open => (open ? undefined : closeRescue())} title={words.title} footer={footer}>
      <p data-testid="short-undo-rescue-dialog" data-state={state} className="text-[13px] text-fg-muted">
        {words.body}
      </p>
    </Dialog>
  );
}
