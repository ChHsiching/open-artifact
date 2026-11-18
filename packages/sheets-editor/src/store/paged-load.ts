import type { LoadOutcome } from './requests.ts';
import type { WorkbookStore } from './workbook-node.ts';
import type { Json } from '@open-artifact/runtime/sheet-api';

/** A page of a load, as the engine takes it (`receiveLoadPage`): `next` is where the next page starts. */
export interface LoadPage {
  revision: number;
  v: number;
  ops: Json[];
  next: number | null;
}

export type LoadPageOutcome = LoadPage | 'pageOutOfDate' | 'calledOff' | { busyForMs: number } | null;

const OPS_PER_PAGE = 8;
const PAGES_BEFORE_YIELDING = 64;

/**
 * Loads the workbook's operations in one call and hands them to the engine a few at a time, letting the page run
 * between pages. A load dropped meanwhile (an edit was sent) is called off.
 */
export function createPagedLoader({
  store,
  isWanted,
  noteLoaded,
  letOthersRun,
}: {
  store: Pick<WorkbookStore, 'loadOps'>;
  isWanted: () => boolean;
  noteLoaded: () => void;
  letOthersRun: () => Promise<void>;
}) {
  let loaded: { revision: number; v: number; ops: Json[] } | null = null;
  let loadCount = 0;
  const pageOf = (start: number, { revision, v, ops }: { revision: number; v: number; ops: Json[] }): LoadPage => {
    const end = start + OPS_PER_PAGE;
    const next = end < ops.length ? end : null;
    if (next === null) loaded = null;
    return { revision, v, ops: ops.slice(start, end), next };
  };
  return {
    async loadPage(start: number): Promise<LoadPageOutcome> {
      const loadAtStart = loadCount;
      if (start > 0) {
        if (loaded === null) throw Error('a later page of a load with no operations');
        if ((start / OPS_PER_PAGE) % PAGES_BEFORE_YIELDING === 0) await letOthersRun();
        return loadCount === loadAtStart && loaded !== null ? pageOf(start, loaded) : 'calledOff';
      }
      loaded = null;
      const outcome: LoadOutcome = await store.loadOps();
      if (outcome === null || outcome === 'pageOutOfDate' || 'busyForMs' in outcome) return outcome;
      noteLoaded();
      if (loadCount !== loadAtStart || !isWanted()) return 'calledOff';
      loaded = outcome;
      return pageOf(0, outcome);
    },
    drop(): void {
      loadCount += 1;
      loaded = null;
    },
  };
}
