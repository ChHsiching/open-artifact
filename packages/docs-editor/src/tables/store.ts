/** Which table menu is open, and where. */
import { create } from 'zustand';
import type { CellRef } from './table-menu.ts';

/** A point in `.doc-page` coordinates (the layer's). */
export interface PagePoint {
  left: number;
  top: number;
}

export interface TableMenuState {
  /** The right-click (or Menu key) cell menu. */
  context: (PagePoint & { ref: CellRef }) | null;
}

export const useTableMenu = create<TableMenuState>(() => ({ context: null }));

export const openContextMenu = (ref: CellRef, at: PagePoint): void => useTableMenu.setState({ context: { ref, ...at } });

export const closeContextMenu = (): void => useTableMenu.setState({ context: null });

/** A client point as `.doc-page` coordinates of the page `dom` is in. */
export function pagePoint(dom: Element, clientX: number, clientY: number): PagePoint | null {
  const page = dom.closest('.doc-page');
  if (!page) return null;
  const box = page.getBoundingClientRect();
  return { left: clientX - box.left, top: clientY - box.top };
}
