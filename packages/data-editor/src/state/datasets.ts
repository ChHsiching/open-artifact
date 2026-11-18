/**
 * The dashboard's data as the page and panels see it: every source's run, which sources the page asked for, the
 * filter values in effect, and each source's status. The data engine (`../data/engine.ts`) fills it.
 */

import { create } from 'zustand';
import {
  EMPTY_PARAMS,
  type CalculationReport,
  type DashboardNotice,
  type Dataset,
  type DatasetRun,
  type DatasetStatus,
  type Parameters,
} from '@open-artifact/data-core';

export interface DatasetsState {
  /** Every listed source's run by id (a calculation's from its inputs). */
  runs: ReadonlyMap<string, DatasetRun>;
  /** The sources the page read or the viewer opened, in the order they were asked for. */
  requested: readonly string[];
  /** The stored `dash/params` with this viewer's choices laid over them, every filter a query uses included. */
  params: Parameters;
  /** This viewer's own filter choices. */
  overrides: Parameters;
  /** The dashboard's sources with the page's calculations after them. */
  datasets: readonly Dataset[];
  /** The page's calculations by id, as they last reported. */
  reports: ReadonlyMap<string, CalculationReport>;
  statuses: ReadonlyMap<string, DatasetStatus>;
  /** The dashboard's notice about the sources the page uses. */
  notice: DashboardNotice | null;
  /** The toolbar's words: loading, or when the data was last updated. */
  toolbar: string | null;
  /** Ids of the requested sources still loading. */
  loading: readonly string[];
  /** The time statuses were computed at. */
  now: number;
  /** Grows with every change. */
  version: number;
}

export function initialDatasetsState(): DatasetsState {
  return {
    runs: new Map(),
    requested: [],
    params: EMPTY_PARAMS,
    overrides: EMPTY_PARAMS,
    datasets: [],
    reports: new Map(),
    statuses: new Map(),
    notice: null,
    toolbar: null,
    loading: [],
    now: Date.now(),
    version: 0,
  };
}

/** A fresh datasets store (one per engine; tests make their own). */
export function createDatasetsStore() {
  return create<DatasetsState>(() => initialDatasetsState());
}

export type DatasetsStore = ReturnType<typeof createDatasetsStore>;

export const useDatasets: DatasetsStore = createDatasetsStore();
