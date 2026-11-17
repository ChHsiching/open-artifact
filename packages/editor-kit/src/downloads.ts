/**
 * Saving files: through the host's `downloads` capability (it saves on the
 * sharing computer and says where), else as a browser download. Every
 * editor's exports and file downloads end here. No DOM until called.
 */

import type { DownloadsCapability } from '@open-artifact/runtime';

/** How long a browser download's object URL stays valid by default: time for the browser to start reading it. */
export const OBJECT_URL_KEEP_MS = 60_000;

/** Clicks a hidden download link for `url`. */
export function browserDownloadUrl(url: string, name: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
}

/** Starts a browser download of `data`; its object URL is revoked after `keepMs`. */
export function browserDownload(name: string, data: Blob, keepMs = OBJECT_URL_KEEP_MS): void {
  const url = URL.createObjectURL(data);
  browserDownloadUrl(url, name);
  setTimeout(() => URL.revokeObjectURL(url), keepMs);
}

/** Where {@link saveFile} put a file. */
export type SavedFile = { to: 'host'; savedTo?: string } | { to: 'browser' };

/**
 * Saves `data` through `downloads` when the host grants it, else as a
 * browser download. Rejects when the host refuses the file.
 */
export async function saveFile(downloads: DownloadsCapability | null | undefined, name: string, data: Blob, keepMs?: number): Promise<SavedFile> {
  if (downloads) {
    const { savedTo } = await downloads.save({ name, data });
    return savedTo === undefined ? { to: 'host' } : { to: 'host', savedTo };
  }
  browserDownload(name, data, keepMs);
  return { to: 'browser' };
}
