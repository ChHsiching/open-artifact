import type { ShellConnection } from '@open-artifact/runtime';
import { hashForPage, pageFromHash, pageLink } from '@open-artifact/editor-kit';

export type CopyLinkOutcome = null | 'refused' | 'noAnswer';

export interface SheetLinks {
  /** The sheet a link opened the page on, the first time this tab sees that link. */
  takeSheetOfNewLink(): string | null;
  sheetOnShowIs(sheetId: string | null, byTab: boolean): void;
  copyLinkTo(sheetId: string): Promise<CopyLinkOutcome>;
  onSheetAskedFor(showSheet: ((sheetId: string) => void) | null): void;
}

export const OLD_SHEET_ANCHOR_PREFIX = 'sheet-';
export const LINK_HANDED_STORAGE_KEY = 'sheets-link-handed';
/** The sheet this tab last put in its address: a reload on it is not a new link, so the kept place wins. */
export const SHEET_SAID_STORAGE_KEY = 'sheets-sheet-said';
export const ANCHOR_REPORT_DELAY_MS = 250;

export function sheetIdOfHash(hash: string): string | null {
  const fragment = hash.replace(/^#/, '');
  if (fragment.startsWith(OLD_SHEET_ANCHOR_PREFIX) && fragment.length > OLD_SHEET_ANCHOR_PREFIX.length && !fragment.includes('='))
    return fragment.slice(OLD_SHEET_ANCHOR_PREFIX.length);
  return pageFromHash(hash);
}

export function createSheetAnchorLinks(win: Window, storage: () => Storage, shell: ShellConnection | null = null): SheetLinks {
  let showSheet: ((sheetId: string) => void) | null = null;
  let reportTimer: number | undefined;
  let copying = false;
  shell?.onCommand(command => {
    if (command.cmd === 'goto_sheet') showSheet?.(command.page);
  });
  const readStored = (key: string): string | null => {
    try {
      return storage().getItem(key);
    } catch {
      return null;
    }
  };
  const writeStored = (key: string, value: string): void => {
    try {
      storage().setItem(key, value);
    } catch {}
  };
  const writeHash = (sheetId: string | null): void => {
    const hash = hashForPage(win.location.hash, sheetId);
    if (hash === win.location.hash || (hash === '' && win.location.hash === '')) return;
    try {
      win.history.replaceState(win.history.state, '', `${win.location.pathname}${win.location.search}${hash}`);
    } catch {}
  };
  win.addEventListener('hashchange', () => {
    const sheetId = sheetIdOfHash(win.location.hash);
    if (sheetId !== null) showSheet?.(sheetId);
  });
  return {
    takeSheetOfNewLink() {
      const sheetId = sheetIdOfHash(win.location.hash);
      if (sheetId === null) return null;
      const wasSeenBefore = [LINK_HANDED_STORAGE_KEY, SHEET_SAID_STORAGE_KEY].some((key) => readStored(key) === sheetId);
      writeStored(LINK_HANDED_STORAGE_KEY, sheetId);
      return wasSeenBefore ? null : sheetId;
    },
    sheetOnShowIs(sheetId) {
      win.clearTimeout(reportTimer);
      reportTimer = win.setTimeout(() => {
        if (sheetId !== null) writeStored(SHEET_SAID_STORAGE_KEY, sheetId);
        writeHash(sheetId);
        shell?.currentSheetPage(sheetId);
      }, ANCHOR_REPORT_DELAY_MS);
    },
    async copyLinkTo(sheetId) {
      if (copying) return null;
      copying = true;
      try {
        if (shell) { shell.copySheetLink(sheetId); return null; }
        await win.navigator.clipboard.writeText(pageLink(win.location.href, sheetId));
        return null;
      } catch {
        return 'refused';
      } finally {
        copying = false;
      }
    },
    onSheetAskedFor(show) {
      showSheet = show;
    },
  };
}
