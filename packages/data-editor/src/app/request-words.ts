/** What the page's notices ask the agent, and the selection each request carries about where it came from. */

import type { Dataset } from '@open-artifact/data-core';
import type { RequestSelection } from '../drafts/request.ts';

export const ASK_REQUESTS = {
  whyLoad: 'Why didn’t this load?',
  whyLoadSeveral: 'Why didn’t these load?',
  whyRun: 'Why didn’t this run?',
  fixPage: 'Fix this page.',
} as const;

const isSingleCalculation = (failed: readonly Dataset[]): boolean => failed.length === 1 && failed[0]?.source.kind === 'calc';

/** The question asked about failed sources. */
export function sourceFailureQuestion(failed: readonly Dataset[]): string {
  if (isSingleCalculation(failed)) return ASK_REQUESTS.whyRun;
  return failed.length === 1 ? ASK_REQUESTS.whyLoad : ASK_REQUESTS.whyLoadSeveral;
}

/** The selection a "Why didn't this load?" request carries: the sources (or the one calculation) that failed. */
export function describeSourceFailures(failed: readonly Dataset[]): RequestSelection {
  const names = failed.map((dataset) => dataset.title || dataset.id);
  if (isSingleCalculation(failed)) {
    const name = names[0] ?? '';
    return {
      label: name,
      chip: { about: 'calc', name },
      text: `From the dashboard’s sources. This calculation (dash.calc in the page’s code) didn’t run:\ncalculation: ${name} (${failed[0]?.id ?? ''})`,
    };
  }
  const lines = failed.map((dataset, index) => `source: ${names[index] ?? dataset.id} (${dataset.id})`);
  return {
    label: names.length === 1 ? (names[0] ?? '') : `${names.length} sources`,
    chip: names.length === 1 ? { about: 'source', name: names[0] ?? '' } : { about: 'sources', count: names.length },
    text: ['From the dashboard’s sources. These didn’t load:', ...lines].join('\n'),
  };
}

/** The selection a "Fix this page." request carries: the page files whose code stopped. */
export function describeCodeFailure(files: readonly string[]): RequestSelection {
  const lines = files.map((file) => `file: ${file}`);
  return {
    label: 'Page',
    chip: { about: 'code' },
    text: [`From the dashboard’s page. Its code stopped${lines.length === 0 ? '.' : ' in:'}`, ...lines].join('\n'),
  };
}
