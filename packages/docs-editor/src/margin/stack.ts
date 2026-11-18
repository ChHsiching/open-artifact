/** Where the margin's cards go: each beside its words, pushed down so none overlap, the open one level with its words. */

export interface StackItem {
  id: string;
  /** The top of its words, in the coordinates the cards are drawn in. */
  top: number;
  height: number;
}

/** Space between two cards. */
export const CARD_GAP = 8;

/**
 * Each card's top. Cards keep the order of their words. Without an open card each goes as high as its words allow;
 * the open one sits level with its words, the cards after it are pushed down and the cards before it pushed up.
 */
export function stackCards(items: readonly StackItem[], active: string | null, gap = CARD_GAP): Map<string, number> {
  const sorted = items
    .map((item, order) => ({ item, order }))
    .sort((a, b) => a.item.top - b.item.top || a.order - b.order)
    .map(({ item }) => item);
  const tops = new Map<string, number>();
  const at = active ? sorted.findIndex(item => item.id === active) : -1;
  const pushDown = (from: number, floor: number) => {
    for (const item of sorted.slice(from)) {
      const top = Math.max(item.top, floor);
      tops.set(item.id, top);
      floor = top + item.height + gap;
    }
  };
  if (at === -1) {
    pushDown(0, -Infinity);
    return tops;
  }
  const open = sorted[at]!;
  tops.set(open.id, open.top);
  pushDown(at + 1, open.top + open.height + gap);
  let ceiling = open.top - gap;
  for (const item of sorted.slice(0, at).reverse()) {
    const top = Math.min(item.top, ceiling - item.height);
    tops.set(item.id, top);
    ceiling = top - gap;
  }
  return tops;
}

export interface MarkerRow {
  top: number;
  ids: string[];
}

/** The cards whose words start on about the same line share one marker, in the order of their words. */
export function markerRows(items: ReadonlyArray<{ id: string; top: number }>, within = 12): MarkerRow[] {
  const rows: MarkerRow[] = [];
  for (const item of [...items].sort((a, b) => a.top - b.top)) {
    const last = rows.at(-1);
    if (last && item.top - last.top < within) last.ids.push(item.id);
    else rows.push({ top: item.top, ids: [item.id] });
  }
  return rows;
}
