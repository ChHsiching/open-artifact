/** Places in the page that features fill: they register at load, before the first render. */
import type { ComponentType } from 'react';

/** Where a feature's view is drawn. */
export type SlotName =
  /** Over the text, inside the scrolling page, positioned against `.doc-page`. */
  | 'layer'
  /** Beside the page on the right, e.g. comments or history. */
  | 'rail'
  /** Before the page, e.g. tabs shown on the left. */
  | 'aside'
  /** Over the scrolling area, fixed in place, e.g. the find bar. */
  | 'float'
  /** The top bar's controls, right of the name. */
  | 'topBar'
  /** The bar under the top bar: the tab, fonts, width and insert controls. */
  | 'pageBar'
  /** Dialogs and sheets, outside the layout. */
  | 'overlay';

interface SlotEntry {
  key: string;
  order: number;
  view: ComponentType;
}

const slots = new Map<SlotName, SlotEntry[]>();

/** Draws `view` in `slot`, ordered by `order` (lower first). Registering the same key again replaces it. */
export function fillSlot(slot: SlotName, key: string, view: ComponentType, order = 0): void {
  const entries = (slots.get(slot) ?? []).filter(entry => entry.key !== key);
  entries.push({ key, order, view });
  entries.sort((a, b) => a.order - b.order);
  slots.set(slot, entries);
}

export function slotViews(slot: SlotName): readonly SlotEntry[] {
  return slots.get(slot) ?? [];
}
