/**
 * Typed helpers for the daemon's Library API (`/api/open-artifact.*`), as the Shell and
 * the home page call it from the daemon's own origin: reads are `GET`,
 * writes are `POST` with a JSON body (same-origin writes need no token).
 */

import {
  LIBRARY_ROUTES,
  type ArtifactDetail,
  type ArtifactView,
  type AskRequest,
  type CreateArtifactRequest,
  type LibraryEvent,
  type OpenArtifactErrorCode,
  type ShareRequest,
  type ShareView,
  type ShellBoot,
  type TypesResponse,
  type UpdateArtifactRequest,
} from '@open-artifact/protocol';
import { BOOT_TIMEOUT_MS } from '../shell/preboot.ts';
import { browserEnv, sharedStream, type SharedStreamEnv } from './shared-events.ts';

/** A failed Library API call: the daemon's `{ code, message, fix? }` and the HTTP status. */
export class ApiError extends Error {
  /** The protocol error code (`not_found`, `unsupported`…). */
  readonly code: OpenArtifactErrorCode;
  /** HTTP status of the answer (0 when the request did not reach the daemon). */
  readonly status: number;
  /** What the caller can do about it, when the daemon said. */
  readonly fix: string | undefined;

  constructor(code: OpenArtifactErrorCode, message: string, status: number, fix?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fix = fix;
  }
}

/** The `fetch` the helpers use; tests pass a fake. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * `POST /api/open-artifact.artifacts.ask`'s answer: how the message reached the owner
 * session (`live` or `wait`: delivered; `inbox`: waits for its next turn).
 * Not in `@open-artifact/protocol` yet.
 */
export interface AskResult {
  via: 'live' | 'wait' | 'inbox' | (string & {});
  status?: string;
}

/** `POST /api/open-artifact.artifacts.delete`'s answer. Not in `@open-artifact/protocol` yet. */
export interface DeleteResult {
  deleted: string;
  /** The folder, which stays on disk. */
  folderKept: string;
}

/** `POST /api/open-artifact.artifacts.open`'s answer (used by the Shell's dev boot). Not in `@open-artifact/protocol` yet. */
export interface OpenResult {
  view_url: string;
  page: string;
  page_url: string;
  shownInHarness?: boolean;
}

/** The Library API calls the Shell and the home page make. */
export interface LibraryApi {
  /** `GET artifacts`: every artifact. */
  artifacts(): Promise<ArtifactView[]>;
  /** `GET artifact?id=`: one artifact with its folder size. */
  artifact(id: string): Promise<ArtifactDetail>;
  /** `GET types`: the installed types and their roots. */
  types(): Promise<TypesResponse>;
  /** `GET artifact.share?id=`: sharing state; throws `unsupported` for a type that cannot share. */
  share(id: string): Promise<ShareView>;
  /** `POST artifact.share`: changes sharing and answers the new state. */
  setShare(request: ShareRequest): Promise<ShareView>;
  /** `POST artifacts.create`. */
  create(request: CreateArtifactRequest): Promise<ArtifactView>;
  /** `POST artifacts.update`: rename or pin. */
  update(request: UpdateArtifactRequest): Promise<ArtifactView>;
  /** `POST artifacts.duplicate`: the copy. */
  duplicate(id: string, name?: string): Promise<ArtifactView>;
  /** `POST artifacts.delete`: drops the record, keeps the folder. */
  remove(id: string): Promise<DeleteResult>;
  /** `POST artifacts.restore`: brings back a record just deleted. */
  restore(id: string): Promise<ArtifactView>;
  /** `POST artifacts.ask`: a message to the owner agent. */
  ask(request: AskRequest): Promise<AskResult>;
  /** `POST artifacts.open`: starts the page without telling a harness. */
  open(id: string): Promise<OpenResult>;
  /**
   * `GET artifacts.boot?id=`: the Shell's finished boot, once the page is open (which can take a while: up to
   * {@link BOOT_TIMEOUT_MS}). `fresh` opens the page again instead of taking the open the Shell's page started.
   */
  boot(id: string, options?: { fresh?: boolean }): Promise<ShellBoot>;
  /** The URL of the event stream. */
  readonly eventsUrl: string;
  /** `GET artifact.archive?id=`: the artifact's folder as a .zip (`HEAD` checks it can be zipped). */
  archiveUrl(id: string): string;
  /** The URL of a type's icon. */
  typeIconUrl(id: string): string;
}

/** Options of {@link createLibraryApi}. */
export interface LibraryApiOptions {
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Daemon base URL; empty for the page's own origin. */
  base?: string;
}

/** Reads an answer body as JSON, or `{}` when it is not JSON. */
async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** How long a read (`GET`) waits for the daemon's answer. */
export const READ_TIMEOUT_MS = 15_000;

/** A Library API answer: its JSON, or an {@link ApiError} with the daemon's `{ code, message, fix }`. */
export async function answerOf<T>(response: Response): Promise<T> {
  const out = await bodyOf(response);
  if (!response.ok) {
    const code = typeof out.code === 'string' ? out.code : 'error';
    const message = typeof out.message === 'string' ? out.message : `HTTP ${response.status}`;
    throw new ApiError(code, message, response.status, typeof out.fix === 'string' ? out.fix : undefined);
  }
  return out as T;
}

/** Creates the Library API helpers. */
export function createLibraryApi(options: LibraryApiOptions = {}): LibraryApi {
  const base = (options.base ?? '').replace(/\/$/, '');
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const url = (route: string, query?: Record<string, string>): string =>
    `${base}/api/open-artifact.${route}${query ? `?${new URLSearchParams(query)}` : ''}`;

  async function call<T>(route: string, request: { query?: Record<string, string>; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
    const init: RequestInit =
      request.body === undefined
        ? { cache: 'no-store' }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) };
    // A read that never answers (the browser's connections to the daemon all taken, a daemon stuck) fails
    // after a while instead of leaving its caller waiting forever.
    if (request.body === undefined && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
      init.signal = AbortSignal.timeout(request.timeoutMs ?? READ_TIMEOUT_MS);
    let response: Response;
    try {
      response = await doFetch(url(route, request.query), init);
    } catch (error) {
      throw new ApiError('connect_failed', error instanceof Error ? error.message : String(error), 0);
    }
    return answerOf<T>(response);
  }

  return {
    async artifacts() {
      const out = await call<{ artifacts?: ArtifactView[] }>(LIBRARY_ROUTES.artifacts);
      return Array.isArray(out.artifacts) ? out.artifacts : [];
    },
    artifact: (id) => call<ArtifactDetail>(LIBRARY_ROUTES.artifact, { query: { id } }),
    async types() {
      const out = await call<Partial<TypesResponse>>(LIBRARY_ROUTES.types);
      return { roots: Array.isArray(out.roots) ? out.roots : [], types: Array.isArray(out.types) ? out.types : [] };
    },
    share: (id) => call<ShareView>(LIBRARY_ROUTES.share, { query: { id } }),
    setShare: (request) => call<ShareView>(LIBRARY_ROUTES.share, { body: request }),
    create: (request) => call<ArtifactView>(LIBRARY_ROUTES.create, { body: request }),
    update: (request) => call<ArtifactView>(LIBRARY_ROUTES.update, { body: request }),
    duplicate: (id, name) => call<ArtifactView>(LIBRARY_ROUTES.duplicate, { body: { id, ...(name && { name }) } }),
    remove: (id) => call<DeleteResult>(LIBRARY_ROUTES.delete, { body: { id } }),
    restore: (id) => call<ArtifactView>(LIBRARY_ROUTES.restore, { body: { id } }),
    ask: (request) => call<AskResult>(LIBRARY_ROUTES.ask, { body: request }),
    open: (id) => call<OpenResult>(LIBRARY_ROUTES.open, { body: { id, host: false } }),
    boot: (id, options) => call<ShellBoot>(LIBRARY_ROUTES.boot, { query: options?.fresh ? { id, fresh: '1' } : { id }, timeoutMs: BOOT_TIMEOUT_MS }),
    eventsUrl: url(LIBRARY_ROUTES.events),
    archiveUrl: (id) => url(LIBRARY_ROUTES.archive, { id }),
    typeIconUrl: (id) => url('type.icon', { id }),
  };
}

/** The pages' API: the daemon is their own origin. */
export const api: LibraryApi = createLibraryApi();

/** The `message` of any thrown value. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const EVENT_TYPES = new Set(['artifacts/changed', 'types/changed', 'harness/changed', 'wake/state']);

/** One `data:` line of `/api/open-artifact.events` → the event, or `null` when it is not one. */
export function parseLibraryEvent(data: string): LibraryEvent | null {
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== 'object') return null;
    const type = (value as { type?: unknown }).type;
    return typeof type === 'string' && EVENT_TYPES.has(type) ? (value as LibraryEvent) : null;
  } catch {
    return null;
  }
}

/** The constructor {@link subscribeLibraryEvents} uses; tests pass a fake. */
export type EventSourceLike = new (url: string) => {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  close(): void;
};

/**
 * Listens to the daemon's event stream (`GET /api/open-artifact.events`). Returns a
 * function that stops listening. The pages of this origin share one stream
 * (shared-events.ts), so they do not use up the browser's six connections to
 * the daemon; a given `EventSource`, or a browser without Web Locks, gets a
 * stream of its own. Without `EventSource` it does nothing.
 */
export function subscribeLibraryEvents(
  onEvent: (event: LibraryEvent) => void,
  options: { url?: string; EventSource?: EventSourceLike; shared?: SharedStreamEnv | null } = {},
): () => void {
  const url = options.url ?? api.eventsUrl;
  const onData = (data: string): void => {
    const event = parseLibraryEvent(data);
    if (event) onEvent(event);
  };
  const env = options.shared !== undefined ? options.shared : options.EventSource ? null : browserEnv();
  if (env) return sharedStream(url, env).listen(onData);
  const Source = options.EventSource ?? (typeof EventSource === 'undefined' ? null : (EventSource as unknown as EventSourceLike));
  if (!Source) return () => {};
  let source: InstanceType<EventSourceLike>;
  try {
    source = new Source(url);
  } catch {
    return () => {};
  }
  source.onmessage = (message) => onData(message.data);
  return () => source.close();
}
