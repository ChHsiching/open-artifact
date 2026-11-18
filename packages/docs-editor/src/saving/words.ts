import type { SyncStatus } from '../sync/tab-sync.ts';

export type SaveBannerKind = 'offline' | 'unsaved' | 'stopped';

/** The banner a tab's save state calls for, if any: none while saving goes well. */
export function bannerFor(status: SyncStatus | undefined): SaveBannerKind | null {
  if (status === 'stopped') return 'stopped';
  if (status === 'unsaved') return 'unsaved';
  if (status === 'reconnecting') return 'offline';
  return null;
}

export const BANNER_WORDS: Record<SaveBannerKind, string> = {
  offline: 'Connection lost. Keep this tab open to sync changes when you go online.',
  unsaved: 'Some edits aren’t saved. They’re only on this page, so keep it open.',
  stopped:
    'Saving has stopped. Your recent edits are only on this page, and reloading may lose or change some of them. Copy what you need, then reload.',
};

export const RELOAD_WORDS = { title: 'Reload this page?', description: 'What it shows now may not come back. Copy what you need first.' };

// ---- a locked doc ----------------------------------------------------------------------------------------------------

export const LOCKED_WORDS = 'This document is locked; nobody can edit it until an owner unlocks it.';

export const READ_ONLY_WORDS = 'Read-only — locked file or view-only access';

/** The lock banner's title. */
export const lockedByWords = (name: string | undefined): string => (name ? `Locked by ${name}` : 'Locked');

export const LOCK_MENU_WORDS = { lock: 'Lock document', unlock: 'Unlock document', locked: 'Document locked', unlocked: 'Document unlocked' };

// ---- edits the server would not take ---------------------------------------------------------------------------------

export const TOO_LARGE_WORDS = {
  title: 'That change is over a size limit, so it wasn’t saved.',
  description: 'This document is at its size limit; remove something before adding more.',
};

/** The notice for edits a tab dropped: `words` they would have added, `reason` the refusal no retry gets past. Pure. */
export function droppedNotice(words: string, reason?: string): { title: string; description: string } {
  if (reason === 'doc_too_large') return TOO_LARGE_WORDS;
  if (reason === 'locked') return { title: words ? 'Some words weren’t saved' : 'Not saved', description: words ? `“${words}” wasn’t saved. ${LOCKED_WORDS}` : LOCKED_WORDS };
  return { title: 'Some words weren’t saved', description: `“${words}” couldn’t be saved: the text it went into had changed.` };
}

// ---- an undo or redo that couldn't be saved --------------------------------------

export type RescueState = 'asking' | 'restoring' | 'restored' | 'not_seen' | 'changed_since' | 'refused';

export const RESCUE_WORDS: Record<RescueState, { title: string; body: string }> = {
  asking: {
    title: 'Some text isn’t saved',
    body: 'Part of your last undo or redo couldn’t be saved, so some text is only on this screen, and a reload would lose it. Restore the saved document to what you see on this page? Everyone with access will see the restored version. The document as it is saved now stays in Version history.',
  },
  restoring: {
    title: 'Some text isn’t saved',
    body: 'Part of your last undo or redo couldn’t be saved, so some text is only on this screen, and a reload would lose it. Restore the saved document to what you see on this page? Everyone with access will see the restored version. The document as it is saved now stays in Version history.',
  },
  restored: { title: 'Document restored', body: 'Your text is saved again. Reload the page to keep editing.' },
  not_seen: {
    title: 'Don’t reload yet',
    body: 'The restore was sent, but this page can’t confirm that everything is back. The text here may be the only whole copy. Close this, copy what you need, then reload and check the document.',
  },
  changed_since: {
    title: 'Not restored',
    body: 'Something changed while you were deciding, so the document wasn’t restored. Some text is only on this screen. Copy what you need before you reload.',
  },
  refused: {
    title: 'Not restored',
    body: 'The document couldn’t be restored and wasn’t changed. Some text is only on this screen. Copy what you need before you reload.',
  },
};

export const RESCUE_RETRY_WORDS = ' To try again, use “Restore the document…” at the top of the page.';

/** What the rescue dialog says in `state`; `retry`: the banner's “Restore the document…” stands. Pure. */
export function rescueWords(state: RescueState, retry: boolean): { title: string; body: string } {
  const words = RESCUE_WORDS[state];
  return state === 'refused' && retry ? { title: words.title, body: `${words.body}${RESCUE_RETRY_WORDS}` } : words;
}
