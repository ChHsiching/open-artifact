/** A query's arguments as the Sources panel shows and edits them. */

import {
  fillDatasetParameters,
  getDatasetParameterNames,
  getExactParameterPlaceholder,
  getSqlToolSpec,
  parseDataset,
  parseStoredQueryArgs,
  type Dataset,
  type Parameters,
  type QuerySource,
  type SqlQuoteMode,
} from '@open-artifact/data-core';
import { stableStringify } from '../data/util.ts';
import { ONLY_QUERY_ARGS_MESSAGE, notValidJsonMessage, nothingSetsMessage } from './words.ts';

export type QueryArguments = Record<string, unknown>;

/** A typed argument: its value, or why it doesn't parse. */
export type EditedArgument = { value: unknown } | { invalid: string };

export interface QueryArgumentView {
  name: string;
  text: string;
  /** The argument is a string (else JSON shown as text). */
  isText: boolean;
  long: boolean;
  /** The page's filter the whole argument is (`{{region}}`), else `null`. */
  param: string | null;
  /** "sql" for the SQL argument, "json" for a non-string one, else the dataset's `langs` entry. */
  lang: string | null;
  quotes?: SqlQuoteMode;
}

/** Arguments longer than this are shown in a box of their own. */
export const LONG_QUERY_ARGUMENT_CHARACTERS = 80;

/** Each argument as shown; `langs` (the dataset's) names the code language of a string argument. */
export function getQueryArgumentViews(request: QuerySource, langs?: Readonly<Record<string, string>>): QueryArgumentView[] {
  const spec = getSqlToolSpec(request);
  const args = parseStoredQueryArgs({ args: request.template ?? request.args });
  const langOf = (name: string, isText: boolean): string | null => {
    if (name === spec?.sqlArg) return 'sql';
    if (!isText) return 'json';
    return langs !== undefined && Object.hasOwn(langs, name) ? (langs[name] ?? null) : null;
  };
  return Object.entries(args).map(([name, value]): QueryArgumentView => {
    const isText = typeof value === 'string';
    const text = typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? '');
    const lang = langOf(name, isText);
    const sql = name === spec?.sqlArg;
    return {
      name,
      text,
      isText,
      long: sql || (isText && lang !== null) || text.includes('\n') || text.length > LONG_QUERY_ARGUMENT_CHARACTERS,
      param: typeof value === 'string' ? getExactParameterPlaceholder(value, request) : null,
      lang,
      ...(sql && spec.quotes !== undefined ? { quotes: spec.quotes } : {}),
    };
  });
}

/** Stored arguments (JSON text) as an object; `{}` when they aren't one. */
export function parseQueryEditArguments(text: string): QueryArguments {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as QueryArguments) : {};
  } catch {
    return {};
  }
}

/** An argument as it is typed: a string as it is, anything else as indented JSON. */
export function editableArgumentText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/** What was typed for an argument: text for a string argument, JSON for any other. */
export function parseEditedArgument(stored: unknown, typed: string): EditedArgument {
  if (typeof stored === 'string') return { value: typed };
  try {
    return { value: JSON.parse(typed) as unknown };
  } catch (error) {
    return { invalid: notValidJsonMessage(error instanceof Error ? error.message : String(error)) };
  }
}

/** The filter a string argument is bound to (`{{region}}`), else `null`. */
export function getArgumentParameterBinding(value: unknown): string | null {
  return typeof value === 'string' ? getExactParameterPlaceholder(value) : null;
}

/** Two arguments' JSON texts hold the same value (keys in any order). */
export function jsonArgumentsEqual(left: string, right: string): boolean {
  try {
    return stableStringify(JSON.parse(left)) === stableStringify(JSON.parse(right));
  } catch {
    return false;
  }
}

/** Two shown arguments are the same: the same text, or two JSON values that are equal. */
export function argumentViewsEqual(left: QueryArgumentView, right: QueryArgumentView): boolean {
  return left.text === right.text || (!left.isText && !right.isText && jsonArgumentsEqual(left.text, right.text));
}

/**
 * The fields a saved version would fill in: each argument the query still has, isn't bound to a filter, and differs
 * from it now; `null` when there are none.
 */
export function getRestorableArgumentValues(text: string, stored: QueryArguments): Record<string, string | undefined> | null {
  const saved = parseQueryEditArguments(text);
  const values: Record<string, string | undefined> = {};
  for (const name of Object.keys(saved)) {
    if (
      Object.hasOwn(stored, name) &&
      getArgumentParameterBinding(stored[name]) === null &&
      stableStringify(saved[name]) !== stableStringify(stored[name])
    )
      values[name] = editableArgumentText(saved[name]);
  }
  return Object.keys(values).length === 0 ? null : values;
}

export function hasRestorableArguments(previous: string, current: string): boolean {
  return getRestorableArgumentValues(previous, parseQueryEditArguments(current)) !== null;
}

/** The query with other arguments (its rules kept), or `null` when it isn't a query. */
export function datasetWithQueryArgs(dataset: Dataset, args: unknown): Dataset | null {
  if (dataset.source.kind !== 'query') return null;
  const { source } = dataset;
  const rules = source.rules ?? (source.rulesRefused === true ? source.refusedRules : undefined);
  return parseDataset(dataset.id, {
    source: {
      kind: source.call === true ? 'call' : 'query',
      connector: source.connector,
      tool: source.tool,
      args,
      ...(rules === undefined ? {} : { rules }),
    },
  });
}

/** The query with the typed arguments and the page's filters filled in, or why it can't run. */
export function datasetWithEditedArgs(dataset: Dataset, args: unknown, params: Parameters): Dataset | string {
  const edited = datasetWithQueryArgs(dataset, args);
  if (edited === null || edited.source.kind !== 'query') return ONLY_QUERY_ARGS_MESSAGE;
  const missing = getDatasetParameterNames(edited).find((name) => !Object.hasOwn(params, name));
  return missing === undefined ? fillDatasetParameters(edited, params) : nothingSetsMessage(missing);
}
