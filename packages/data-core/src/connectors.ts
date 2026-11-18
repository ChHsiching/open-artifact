import type { QueryConnector, SqlToolSpec } from './connector-types.ts';
import type { QuerySource, UnknownRecord } from './types.ts';
import { isPlainObject } from './text.ts';

/** The governed BigQuery connector: `bigquery_query` takes SQL in `sql`; answers are its XML result. */
export const GOVERNED_BIGQUERY_CONNECTOR: QueryConnector = {
  query: {
    bigquery_query: { sqlArg: 'sql', quotes: 'backslash' },
    semantic_query: {},
  },
  reads: 'governed',
};

/** The connectors whose query tools are known, by connector name. */
export const KNOWN_QUERY_CONNECTORS: Readonly<Record<string, QueryConnector>> = {
  BigQuery: GOVERNED_BIGQUERY_CONNECTOR,
  'Google Cloud BigQuery': {
    query: { execute_sql_readonly: { sqlArg: 'query', quotes: 'backslash' } },
    reads: 'bigquery',
  },
};

export function getKnownConnector(name: string): QueryConnector | null {
  return Object.hasOwn(KNOWN_QUERY_CONNECTORS, name) ? (KNOWN_QUERY_CONNECTORS[name] ?? null) : null;
}

/** The known-connector description of a query's connector; a `kind: "call"` source has none (it is connector-agnostic). */
export function getSourceConnectorSpec(source: Pick<QuerySource, 'call' | 'connector'>): QueryConnector | null {
  return source.call ? null : getKnownConnector(source.connector);
}

/** The SQL description of one of a known connector's query tools (`undefined` for a tool that doesn't take SQL). */
export function getConnectorSqlTool(spec: QueryConnector | null | undefined, tool: string): SqlToolSpec | undefined {
  const query = spec?.query;
  const found = query !== undefined && Object.hasOwn(query, tool) ? query[tool] : undefined;
  return found?.sqlArg === undefined ? undefined : (found as SqlToolSpec);
}

export function getSqlToolSpec(source: Pick<QuerySource, 'call' | 'connector' | 'tool'>): SqlToolSpec | undefined {
  return getConnectorSqlTool(getSourceConnectorSpec(source), source.tool);
}

/** A query's stored `args` as an object (empty when they aren't one). */
export function parseStoredQueryArgs(source: Pick<QuerySource, 'args'>): UnknownRecord {
  try {
    const value: unknown = JSON.parse(source.args);
    return isPlainObject(value) ? value : {};
  } catch {
    return {};
  }
}
