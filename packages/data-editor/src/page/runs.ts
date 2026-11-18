import type { DashboardContent, Dataset, DatasetRun, FailureStatus, Parameters, ToolCall } from '@open-artifact/data-core';
import {
  MAX_ERROR_MESSAGE_CHARACTERS,
  getDatasetParameterNames,
  getSourceRuleProblems,
  isReportableRunFailure,
  parameterValuesEqual,
  sanitizeText,
  summarizeToolCallChain,
} from '@open-artifact/data-core';
import { getDatasetLoadKey, isFailedDatasetRun } from '../data/query-store.ts';
import type { PageFault } from './faults.ts';
import type { SourceMarkIssue } from './sources.ts';
import type { DrawingFault } from './validation.ts';

/** A live query's `{{filter}}`s with no rule that pins them (`needsRule`) or with a rule that can't be read (`badRule`). */
export interface ReportRuleProblems {
  needsRule?: string[];
  badRule?: string[];
}

export interface ReportSuccessfulRun extends ReportRuleProblems {
  status: 'ok';
  rows: number;
  truncated?: true;
  ms?: number;
  at: string;
  calls?: string;
  value?: boolean;
  /** The answer had this many text items and only the first was read. */
  onlyFirstOf?: number;
}

export interface ReportRunningRun extends ReportRuleProblems {
  status: 'running';
  at: string;
}

export interface ReportFailedRun extends ReportRuleProblems {
  status: FailureStatus;
  message: string;
  at: string;
  calc?: true;
  calls?: string;
}

export type ReportedDatasetRun = ReportSuccessfulRun | ReportRunningRun | ReportFailedRun;

/** `data/users/<viewer>/runs`: each source's last run as this viewer saw it, and what the page got wrong. */
export interface DashboardRunReport {
  params: string[];
  datasets: Record<string, ReportedDatasetRun>;
  marks?: SourceMarkIssue[];
  flagged?: number;
  errors?: PageFault[];
  drawings?: DrawingFault[];
}

/** The largest report (and shown page) written, in escaped JSON bytes. */
export const MAX_RUN_REPORT_BYTES = 262144;
export const MAX_REPORTED_DATASET_RUNS = 100;
/** The report of a page that reads no sources. */
export const EMPTY_RUN_REPORT: DashboardRunReport = { params: [], datasets: {} };

const INTERNAL_DATASET_ID_PATTERN = /^__.*__$/;
const JSON_HTML_ESCAPE_PATTERN = /[<>&]/g;
const JSON_LINE_ESCAPE_PATTERN = /[\u2028\u2029]/g;

/** The size of a value's JSON once `<`, `>`, `&` and line separators are escaped, in UTF-8 bytes. */
export function escapedJsonByteSize(value: unknown): number {
  const json = JSON.stringify(value) ?? '';
  const escapes = 5 * (json.match(JSON_HTML_ESCAPE_PATTERN)?.length ?? 0) + 3 * (json.match(JSON_LINE_ESCAPE_PATTERN)?.length ?? 0);
  return new TextEncoder().encode(json).length + escapes;
}

/** The first `max` names, then "and N more". */
export function limitReportedNames(names: readonly string[], max: number): string[] {
  return names.length <= max ? [...names] : [...names.slice(0, max), `and ${String(names.length - max)} more`];
}

/** At most 100 runs, failures first in the count (the order is kept). */
export function limitReportedDatasetRuns(entries: [string, ReportedDatasetRun][]): Record<string, ReportedDatasetRun> {
  let failures = Math.min(entries.filter(([, run]) => isReportableRunFailure(run)).length, MAX_REPORTED_DATASET_RUNS);
  let others = MAX_REPORTED_DATASET_RUNS - failures;
  return Object.fromEntries(entries.filter(([, run]) => (isReportableRunFailure(run) ? failures-- > 0 : others-- > 0)));
}

/** Adds the marks, the page errors and the drawing faults in turn, each only when the report still fits. */
export function attachRunReportExtras(
  report: DashboardRunReport,
  marks: readonly SourceMarkIssue[],
  flagged: number,
  errors: readonly PageFault[],
  drawings: readonly DrawingFault[],
): DashboardRunReport {
  const extras: (Partial<DashboardRunReport> | false)[] = [
    marks.length > 0 && { marks: [...marks], flagged },
    errors.length > 0 && { errors: [...errors] },
    drawings.length > 0 && { drawings: [...drawings] },
  ];
  return extras.reduce<DashboardRunReport>(
    (state, extra) => (extra === false || escapedJsonByteSize({ ...state, ...extra }) > MAX_RUN_REPORT_BYTES ? state : { ...state, ...extra }),
    report,
  );
}

/** The filters the viewer set to something other than the page's defaults, sorted. */
export function getChangedFilterNames(content: Pick<DashboardContent, 'params' | 'datasets'>, params: Parameters): string[] {
  return [...new Set([...Object.keys(content.params), ...content.datasets.flatMap(getDatasetParameterNames)])]
    .filter((name) => Object.hasOwn(params, name) && !parameterValuesEqual(params[name] ?? null, content.params[name] ?? null))
    .sort();
}

export const hasRunReportFindings = (report: DashboardRunReport): boolean =>
  report.marks !== undefined ||
  report.errors !== undefined ||
  report.drawings !== undefined ||
  Object.values(report.datasets).some((run) => run.needsRule !== undefined || run.badRule !== undefined || 'onlyFirstOf' in run);

export const isCleanRunReport = (report: DashboardRunReport): boolean =>
  !hasRunReportFindings(report) && Object.values(report.datasets).every((run) => run.status === 'ok');

export const isActionableRunReport = (report: DashboardRunReport): boolean =>
  hasRunReportFindings(report) || Object.values(report.datasets).some(isReportableRunFailure);

/**
 * The run report for the sources the page reads: each one's last run (rows, time, the calls behind it, or why it
 * failed), the filters changed, and what the page got wrong. Null while a source has not started, and when there is
 * nothing to report.
 */
export function buildDashboardRunReport(
  datasets: readonly Dataset[],
  changedFilters: readonly string[],
  runOf: (id: string) => DatasetRun,
  markIssues: readonly SourceMarkIssue[],
  flaggedCount: number,
  pageFaults: readonly PageFault[] = [],
  drawingFaults: readonly DrawingFault[] = [],
): DashboardRunReport | null {
  if (datasets.length === 0 && pageFaults.length === 0 && drawingFaults.length === 0) return null;
  const entries: [string, ReportedDatasetRun][] = [];
  let calculationPending = false;
  for (const dataset of datasets) {
    const run = runOf(dataset.id);
    if (run.status === 'idle' && getDatasetLoadKey(dataset) !== '') return null;
    if (INTERNAL_DATASET_ID_PATTERN.test(dataset.id)) continue;
    const ruleProblems = dataset.source.kind === 'query' ? getSourceRuleProblems(dataset.source) : [];
    const needsRule = limitReportedNames(
      ruleProblems.filter((problem) => problem.what === 'filter_without_rule').map((problem) => problem.filter),
      5,
    );
    const badRule = limitReportedNames(
      ruleProblems.filter((problem) => problem.what !== 'filter_without_rule').map((problem) => problem.filter),
      5,
    );
    const ruleFlags: ReportRuleProblems = {
      ...(needsRule.length === 0 ? {} : { needsRule }),
      ...(badRule.length === 0 ? {} : { badRule }),
    };
    if (dataset.source.kind === 'calc') {
      const inputs = dataset.source.inputs.map(runOf);
      if (run.status === 'running' && inputs.some((input) => input.status === 'idle' || input.status === 'running'))
        calculationPending = true;
      if (isFailedDatasetRun(run))
        entries.push([
          dataset.id,
          {
            status: run.status,
            message: sanitizeText(run.message, MAX_ERROR_MESSAGE_CHARACTERS),
            at: new Date(run.at).toISOString(),
            calc: true,
          },
        ]);
      continue;
    }
    if (run.status === 'running' && run.prev === null) {
      entries.push([dataset.id, { status: 'running', at: new Date(run.startedAt).toISOString(), ...ruleFlags }]);
      continue;
    }
    const last = run.status === 'running' ? run.prev : run;
    if (last === null || last.status === 'idle' || last.status === 'running') continue;
    const at = new Date(last.at).toISOString();
    const chain = summarizeToolCallChain(last.calls as readonly ToolCall[] | undefined);
    const calls = chain === '' ? {} : { calls: chain };
    if (last.status === 'ok') {
      entries.push([
        dataset.id,
        {
          status: 'ok',
          rows: last.table?.rows.length ?? 0,
          ...(last.table?.cut !== undefined ? { truncated: true as const } : {}),
          ms: last.ms,
          at,
          ...calls,
          ...(last.value !== undefined ? { value: true } : {}),
          ...(last.items === undefined ? {} : { onlyFirstOf: last.items }),
          ...ruleFlags,
        },
      ]);
      continue;
    }
    entries.push([
      dataset.id,
      {
        status: last.status,
        message: sanitizeText(
          last.message,
          Math.max(0, MAX_ERROR_MESSAGE_CHARACTERS - chain.length - needsRule.join().length - badRule.join().length),
        ),
        at,
        ...calls,
        ...ruleFlags,
      },
    ]);
  }
  const report = attachRunReportExtras(
    { params: limitReportedNames(changedFilters, 64), datasets: limitReportedDatasetRuns(entries) },
    markIssues,
    flaggedCount,
    pageFaults,
    drawingFaults,
  );
  return calculationPending && isCleanRunReport(report) ? null : report;
}
