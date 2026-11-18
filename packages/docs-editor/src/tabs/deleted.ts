/** The words and rows of "Deleted tabs" and its preview of a deleted tab: plain functions, no page state. */
import type { Block, DocState } from '@open-artifact/docs-core';

/** A deleted tab as the server lists it (`read project`, payload `{kind: 'deleted'}`). */
export interface DeletedTab {
  id: string;
  name: string;
  /** False when the doc no longer knows its old name and place. */
  known: boolean;
  deletedAt: string | null;
  by?: { id: string; name: string; agent?: true };
  returnsTo: 'place' | 'end';
  parent?: { id: string; name: string };
  /** Its first line of text: `''` when it holds none, null when its content can't be read (absent from older servers). */
  firstLine?: string | null;
  subtabs: DeletedTab[];
}

export const DELETED_TABS_WORDS = {
  title: 'Deleted tabs',
  list: 'Deleted tab list',
  loading: 'Loading deleted tabs',
  failed: 'Couldn’t load deleted tabs.',
  none: 'No deleted tabs to restore.',
  more: 'Show more deleted tabs',
  retry: 'Try again',
  restore: 'Restore tab',
  restoring: 'Restoring…',
  restored: 'Tab restored',
  already: 'That tab has already been restored.',
  note: 'Restoring brings a tab back with its comments and version history.',
  noText: 'No text in this tab',
  unread: 'Couldn’t load this tab’s text',
  rowAction: 'open preview',
  previewTitle: 'Deleted tab',
  previewLabel: 'preview',
  previewLoading: 'Loading this tab…',
  previewFailed: 'Couldn’t load this tab.',
  previewUndrawn: 'Couldn’t show a preview of this tab. You can still restore it.',
  embedNote: 'Charts and widgets aren’t shown in this preview. They come back when you restore the tab.',
  imageMiss: 'Image isn’t available',
  close: 'Close',
  restoreBase: 'Restoring brings this tab back with its comments and version history.',
  asNew: 'Restore as new tab',
  copyOnly: 'This tab couldn’t be restored with its comments and version history. To restore its content, choose “Restore as new tab”.',
  sizeLimit: 'This document is at its size limit, so the tab wasn’t restored. Delete some content, then try again.',
};

export const asNewTabNote = (name: string): string =>
  `Restoring adds this as a new tab named “${name}”. The deleted tab’s comments and version history aren’t restored.`;

/** What a failed restore leaves: the tab's gone from the list, its content can come back as a new tab, or neither. */
export type RestoreOutcome = 'back' | 'gone' | 'copyOnly' | 'failed';

/** How a refused restore reads (`code`: the server's refusal), and what it leaves the person able to do. */
export function restoreRefusal(code: string | null): { outcome: Exclude<RestoreOutcome, 'back'>; message: string | null } {
  if (code === 'already_restored' || code === 'absent') return { outcome: 'gone', message: DELETED_TABS_WORDS.already };
  if (code === 'doc_too_large' || code === 'container_rows') return { outcome: 'failed', message: DELETED_TABS_WORDS.sizeLimit };
  // The tab itself can't come back (its saved form won't go back in place): its words still can, as a new tab.
  if (code === 'unreadable') return { outcome: 'copyOnly', message: DELETED_TABS_WORDS.copyOnly };
  // Anything else (the doc locked, no answer): the server's words, nothing more to offer.
  return { outcome: 'failed', message: null };
}

/** How many deleted tabs the list shows at first, and how many more each "Show more" adds. */
export const DELETED_TABS_PAGE = 20;

/** What a restore of this tab does beyond the usual, in the words of the list. */
export function restoreNote(tab: DeletedTab, nested: boolean): string | null {
  if (nested) return 'Restored on its own, it will be added as the last tab. Restore the tab above to bring it back in its place.';
  if (!tab.known) return `It will be named “${tab.name}” and added as the last tab, because its old name and place aren’t known.`;
  if (tab.returnsTo === 'end') return 'It will be added as the last tab, because the tab it was under is gone.';
  const parts: string[] = [];
  if (tab.parent) parts.push(`It comes back under “${tab.parent.name}”.`);
  if (tab.subtabs.length) parts.push(`Its ${tab.subtabs.length === 1 ? 'subtab comes' : `${tab.subtabs.length} subtabs come`} back with it.`);
  return parts.length ? parts.join(' ') : null;
}

/** The preview's description: "{when}. {note}", the note saying what a restore brings back. */
export function previewDescription(tab: DeletedTab, nested: boolean, now = new Date(), asNew = false): string {
  const note = asNew ? asNewTabNote(tab.name) : [DELETED_TABS_WORDS.restoreBase, restoreNote(tab, nested)].filter(Boolean).join(' ');
  return tab.deletedAt ? `${deletedWhen(tab.deletedAt, now)}. ${note}` : note;
}

const DAY = 24 * 60 * 60 * 1000;

/** "Deleted today at 3:04 PM", "Deleted yesterday at …", "Deleted Tuesday at …", "Deleted Mar 3 at …". */
export function deletedWhen(at: string | null, now = new Date()): string {
  const when = at ? new Date(at) : null;
  if (!when || !Number.isFinite(when.getTime())) return 'Deleted, time unknown';
  const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(when)) / DAY);
  if (days <= 0) return `Deleted today at ${time}`;
  if (days === 1) return `Deleted yesterday at ${time}`;
  if (days < 7) return `Deleted ${when.toLocaleDateString(undefined, { weekday: 'long' })} at ${time}`;
  const sameYear = when.getFullYear() === now.getFullYear();
  return `Deleted ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })} at ${time}`;
}

/** A row's first line: the tab's text, "No text in this tab", or "Couldn't load this tab's text" (`text`: it has words). */
export function rowLine(tab: DeletedTab): { line: string; text: boolean } {
  if (typeof tab.firstLine === 'string' && tab.firstLine !== '') return { line: tab.firstLine, text: true };
  return { line: tab.firstLine === null ? DELETED_TABS_WORDS.unread : DELETED_TABS_WORDS.noText, text: false };
}

/** A row of the list: a deleted tab, how deep it sits (subtabs deleted with a tab are listed under it). */
export interface DeletedRow {
  tab: DeletedTab;
  depth: number;
}

/** The rows drawn, in order: the first `shown` deleted tabs, each followed by the subtabs deleted with it. */
export function deletedRows(tabs: DeletedTab[], shown: number): DeletedRow[] {
  const rows: DeletedRow[] = [];
  const add = (tab: DeletedTab, depth: number) => {
    rows.push({ tab, depth });
    for (const sub of tab.subtabs) add(sub, depth + 1);
  };
  for (const tab of tabs.slice(0, shown)) add(tab, 0);
  return rows;
}

/** Where up/down from row `index` goes among `count` rows (it stops at the ends). */
export function stepRow(index: number, count: number, key: string): number | null {
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return null;
  const next = index + (key === 'ArrowDown' ? 1 : -1);
  return next >= 0 && next < count ? next : index;
}

/** The tab holds charts or widgets, which the preview draws as a chip only. */
export function hasEmbeds(doc: DocState): boolean {
  const any = (blocks: Block[]): boolean => blocks.some(block => block.type === 'embed' || (!!block.children && any(block.children)));
  return any(doc.blocks);
}
