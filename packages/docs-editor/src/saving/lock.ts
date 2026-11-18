/** Locking the doc from the page: only an owner may, and while it is locked nobody can edit it. */
import type { DocMember } from '@open-artifact/runtime/doc-api';
import { toast } from '@open-artifact/ui';
import { docClient } from '../app/doc-client.ts';
import { maybeSession } from '../app/session.ts';
import { LOCK_MENU_WORDS } from './words.ts';

/** The call that locks the doc (`true`) or unlocks it: a patch of the project's `locked` record. Pure. */
export function lockMember(locked: boolean, note?: string): DocMember {
  const patch = locked ? { op: 'set', path: ['locked'], ...(note ? { value: { note } } : {}) } : { op: 'delete', path: ['locked'] };
  return { verb: 'update', object: 'project', payload: { kind: 'patch', patch: [patch] } } as DocMember;
}

/** Whether the person may lock and unlock the doc: owners only. */
export const mayLock = (): boolean => maybeSession()?.viewer.role === 'owner';

/** Locks or unlocks the doc; every open page hears it through the project. */
export async function setLocked(locked: boolean): Promise<void> {
  try {
    await docClient().call({ member: lockMember(locked) });
    toast.add({ title: locked ? LOCK_MENU_WORDS.locked : LOCK_MENU_WORDS.unlocked });
  } catch (error) {
    toast.add({ title: 'Couldn’t change the lock', description: error instanceof Error ? error.message : String(error), type: 'error' });
  }
}
