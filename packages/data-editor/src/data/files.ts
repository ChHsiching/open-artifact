import {
  STORED_FILE_URL_PATTERN,
  SYSTEM_CLOCK,
  fileLoaderAnswer,
  isPlainObject,
  parseFileAnswer,
  withResultMetadata,
  type DataFileFormat,
  type DatasetLoader,
  type FetchedDataFile,
  type LoadFailure,
  type LoadResult,
  type PollClock,
  type Table,
  type WordedMessage,
} from '@open-artifact/data-core';
import { finalizeQueryResult, runFileLoader } from './queries.ts';

/** A stored file is given this long to arrive. */
export const FILE_FETCH_TIMEOUT_MS = 120_000;

export const NO_READABLE_ROWS: WordedMessage = {
  message: 'The file has no rows this dashboard can read.',
  wording: { code: 'fileNoRows' },
};

const EMPTY_FILE_TABLE: Table = Object.freeze({ columns: [], rows: [] }) as Table;

export interface FileEnvironment {
  fetch?: typeof fetch;
  /** The address `_blob/<id>` paths resolve against (the page's); left as a root path when there is none. */
  base?: () => string | undefined;
  clock?: PollClock;
  timeoutMs?: number;
}

/** Whether a url is a file stored with the dashboard (`/_blob/<id>`) or a browser `blob:` url. */
export function isStoredAssetUrl(url: string): boolean {
  return STORED_FILE_URL_PATTERN.test(url);
}

/** Where a stored file is fetched from: a `blob:` url as it is, a `_blob/<id>` path at the origin's root. */
export function resolveStoredFileUrl(url: string, base?: string): string {
  if (url.startsWith('blob:')) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  if (base === undefined) return path;
  try {
    return new URL(path, base).href;
  } catch {
    return path;
  }
}

function defaultBase(): string | undefined {
  const href = globalThis.location?.href;
  return typeof href === 'string' ? href : undefined;
}

/** Fetches a stored data file's text; a failed load says why. */
export async function fetchDataFileText(url: string, env: FileEnvironment = {}): Promise<FetchedDataFile | LoadFailure> {
  if (!isStoredAssetUrl(url))
    return {
      ok: false,
      kind: 'refused',
      message: 'This file isn’t stored in the dashboard, so it can’t be read.',
      wording: { code: 'fileNotStored' },
    };
  const fetcher = env.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.timeoutMs ?? FILE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(resolveStoredFileUrl(url, (env.base ?? defaultBase)()), {
      credentials: 'same-origin',
      signal: controller.signal,
    });
    const status = String(response.status);
    if (!response.ok)
      return { ok: false, kind: 'failed', message: `Couldn’t load the file (${status}).`, wording: { code: 'fileStatus', status } };
    const blob = await response.blob();
    return { text: await blob.text(), bytes: blob.size };
  } catch {
    return { ok: false, kind: 'failed', message: 'Couldn’t load the file.', wording: { code: 'fileFailed' } };
  } finally {
    clearTimeout(timeout);
  }
}

/** Loads an attached file: its rows, its value, or what its loader makes of its text; a JSON file's `meta` labels its table. */
export async function loadDatasetFile(
  url: string,
  format: DataFileFormat,
  loader?: DatasetLoader,
  env: FileEnvironment = {},
): Promise<LoadResult> {
  const clock = env.clock ?? SYSTEM_CLOCK;
  const startedAt = clock.now();
  const fetched = await fetchDataFileText(url, env);
  if ('ok' in fetched) return fetched;
  const elapsed = (): number => Math.round(clock.now() - startedAt);
  const answer = fileLoaderAnswer(fetched.text, format);
  const withFileMetadata = (table: Table): Table =>
    table.meta === undefined && isPlainObject(answer) ? withResultMetadata(table, answer.meta) : table;
  if (loader !== undefined) {
    const result = finalizeQueryResult(await runFileLoader(answer, loader), elapsed());
    return result.ok ? { ...result, table: withFileMetadata(result.table), bytes: fetched.bytes } : result;
  }
  const parsed = parseFileAnswer(fetched.text, format);
  if (parsed === null) return { ok: false, kind: 'failed', ...NO_READABLE_ROWS };
  return {
    ok: true,
    table: withFileMetadata('table' in parsed ? parsed.table : EMPTY_FILE_TABLE),
    ...('value' in parsed ? { value: parsed.value } : {}),
    ms: elapsed(),
    bytes: fetched.bytes,
  };
}
