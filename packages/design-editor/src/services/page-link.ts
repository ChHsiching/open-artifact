/**
 * Pages in the address bar for the Design editor: the store-free mechanics
 * are @open-artifact/editor-kit's page-link.ts (`syncPageHistory`, `pageLink`); this wires them to
 * the view and document stores.
 */

import { toast } from '@open-artifact/ui';
import { useDocument } from '../state/document.ts';
import { useView } from '../state/view.ts';
import { pageFromHash, pageLink, syncPageHistory } from '@open-artifact/editor-kit';

const exists = (page: string): boolean => useDocument.getState().canvas.pages.some((p) => p.id === page);

/** The page named in the address when it exists on the canvas. */
export function pageInAddress(): string | null {
  const page = pageFromHash(location.hash);
  return page && exists(page) ? page : null;
}

let started = false;

/** Keeps the address in step with the page shown. Call after the launch page is set. */
export function startPageHistory(): void {
  if (started) return;
  started = true;
  syncPageHistory({
    current: () => useView.getState().page,
    show: (page) => useView.getState().setPage(page),
    exists,
    fallback: () => useDocument.getState().canvas.pages[0]?.id ?? null,
    subscribe: (listener) => useView.subscribe((state, prev) => state.page !== prev.page && listener(state.page)),
  });
}

/** Copies a link to a page (default: the current one). */
export async function copyPageLink(page: string | null = useView.getState().page): Promise<void> {
  const link = pageLink(location.href, page);
  try {
    await navigator.clipboard.writeText(link);
    toast.add({ title: 'Page link copied' });
  } catch {
    toast.add({ title: 'Could not copy the link', description: link });
  }
}
