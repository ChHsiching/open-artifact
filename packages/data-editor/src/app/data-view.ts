/**
 * What the chrome reads of the data: the sources the page uses, those that
 * need attention, whether any is a live query, whether loading shows (held
 * on a moment so it doesn't flash), and the refresh tooltip's freshness.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getSourceRuleProblems, type Dataset, type DatasetRun } from '@open-artifact/data-core';
import type { PageCheckUnruled } from '../page/check.ts';
import { IDLE_DATASET_RUN, getLastSuccessfulRun } from '../data/query-store.ts';
import { formatTimeAgo, getOldestDatasetUpdate, isJustNow, needsDatasetAttention, partitionUsedDatasets } from '../data/status.ts';
import { formatShortDateTime } from '../sources/result.ts';
import { usePageRuntime, type PageSnapshot } from '../page/runtime.ts';
import { useDatasets } from '../state/datasets.ts';
import { STALE_NUMBERS_TIP } from './words.ts';

export const LOADING_MIN_MS = 900;

/** True while `flag` is, and at least `minMs` once it turned on. */
export function useMinimumOnFlag(flag: boolean, minMs: number): boolean {
  const [since, setSince] = useState<number | null>(flag ? Date.now() : null);
  const [held, setHeld] = useState(flag);
  useEffect(() => {
    if (flag) {
      setSince((value) => value ?? Date.now());
      setHeld(true);
      return;
    }
    if (since === null) return;
    const left = minMs - (Date.now() - since);
    const done = (): void => {
      setHeld(false);
      setSince(null);
    };
    if (left <= 0) {
      done();
      return;
    }
    const timer = setTimeout(done, left);
    return () => clearTimeout(timer);
  }, [flag, minMs, since]);
  return flag || held;
}

/** "Data as of now (…)." / "Data as of 5 min ago (…).", and the stale note. */
export function freshnessTips(at: number | null, stale: boolean, now: number): string[] {
  if (at === null) return [];
  const when = formatShortDateTime(at);
  return [isJustNow(at, now) ? `Data as of now (${when}).` : `Data as of ${formatTimeAgo(at, now)} (${when}).`, ...(stale ? [STALE_NUMBERS_TIP] : [])];
}

export interface DashboardData {
  used: Dataset[];
  attention: Dataset[];
  hasLiveQueries: boolean;
  loadingVisible: boolean;
  firstLoadVisible: boolean;
  tips: string[];
  runOf: (id: string) => DatasetRun;
}

export function useDashboardData(): DashboardData {
  const datasets = useDatasets((state) => state.datasets);
  const runs = useDatasets((state) => state.runs);
  const requested = useDatasets((state) => state.requested);
  const loading = useDatasets((state) => state.loading);
  const now = useDatasets((state) => state.now);
  const derived = useMemo(() => {
    const runOf = (id: string): DatasetRun => runs.get(id) ?? IDLE_DATASET_RUN;
    const used = partitionUsedDatasets([...datasets], requested).used;
    const attention = used.filter((dataset) => needsDatasetAttention(dataset, runOf(dataset.id), now));
    const queries = used.filter((dataset) => dataset.source.kind === 'query');
    const freshness = getOldestDatasetUpdate(used, runOf, now);
    const firstLoad = loading.some((id) => getLastSuccessfulRun(runOf(id)) === null);
    return { runOf, used, attention, hasLiveQueries: queries.length > 0, tips: freshnessTips(freshness.at, freshness.stale, now), firstLoad };
  }, [datasets, runs, requested, loading, now]);
  const loadingVisible = useMinimumOnFlag(loading.length > 0, LOADING_MIN_MS);
  const firstLoadVisible = useMinimumOnFlag(derived.firstLoad, LOADING_MIN_MS);
  return {
    used: derived.used,
    attention: derived.attention,
    hasLiveQueries: derived.hasLiveQueries,
    loadingVisible,
    firstLoadVisible,
    tips: derived.tips,
    runOf: derived.runOf,
  };
}

const NO_SNAPSHOT_SUBSCRIPTION = (): (() => void) => () => undefined;

/** The mounted page's snapshot (`null` while none is mounted). */
export function usePageSnapshot(): PageSnapshot | null {
  const page = usePageRuntime((state) => state.page);
  return useSyncExternalStore(page === null ? NO_SNAPSHOT_SUBSCRIPTION : page.subscribe, () => page?.snapshot() ?? null);
}

const RULE_WHATS = new Set<PageCheckUnruled['what']>(['filter_without_rule', 'rule_unreadable', 'rule_not_portable']);

/** The filters of live queries with no rule that pins them, for the page check. */
export function unruledFilters(used: readonly Dataset[]): PageCheckUnruled[] {
  return used.flatMap((dataset) =>
    dataset.source.kind !== 'query'
      ? []
      : getSourceRuleProblems(dataset.source).map((problem) => ({
          dataset: dataset.id,
          filter: problem.filter,
          ...(RULE_WHATS.has(problem.what as PageCheckUnruled['what']) ? { what: problem.what as PageCheckUnruled['what'] } : {}),
        })),
  );
}
