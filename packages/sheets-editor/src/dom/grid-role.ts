import type { Dynamic } from '../dynamic.ts';
export const isGridOrGridPopupTrigger = (element?: Dynamic) =>
  element.getAttribute('role') === 'grid' || element.getAttribute('aria-haspopup') === 'grid';
