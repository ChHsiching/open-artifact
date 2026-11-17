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
  type TypesResponse,
  type UpdateArtifactRequest,
} from '@open-artifact/protocol';

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
  duplicate(id: string): Promise<ArtifactView>;
  /** `POST artifacts.delete`: drops the record, keeps the folder. */
  remove(id: string): Promise<DeleteResult>;
  /** `POST artifacts.restore`: brings back a record just deleted. */
  restore(id: string): Promise<ArtifactView>;
  /** `POST artifacts.ask`: a message to the owner agent. */
  ask(request: AskRequest): Promise<AskResult>;
  /** `POST artifacts.open`: starts the page without telling a harness. */
  open(id: string): Promise<OpenResult>;
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

/** Creates the Library API helpers. */
export function createLibraryApi(options: LibraryApiOptions = {}): LibraryApi {
  const base = (options.base ?? '').replace(/\/$/, '');
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const url = (route: string, query?: Record<string, string>): string =>
    `${base}/api/open-artifact.${route}${query ? `?${new URLSearchParams(query)}` : ''}`;

  async function call<T>(route: string, request: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
    const init: RequestInit =
      request.body === undefined
        ? { cache: 'no-store' }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) };
    let response: Response;
    try {
      response = await doFetch(url(route, request.query), init);
    } catch (error) {
      throw new ApiError('connect_failed', error instanceof Error ? error.message : String(error), 0);
    }
    const out = await bodyOf(response);
    if (!response.ok) {
      const code = typeof out.code === 'string' ? out.code : 'error';
      const message = typeof out.message === 'string' ? out.message : `HTTP ${response.status}`;
      throw new ApiError(code, message, response.status, typeof out.fix === 'string' ? out.fix : undefined);
    }
    return out as T;
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
    duplicate: (id) => call<ArtifactView>(LIBRARY_ROUTES.duplicate, { body: { id } }),
    remove: (id) => call<DeleteResult>(LIBRARY_ROUTES.delete, { body: { id } }),
    restore: (id) => call<ArtifactView>(LIBRARY_ROUTES.restore, { body: { id } }),
    ask: (request) => call<AskResult>(LIBRARY_ROUTES.ask, { body: request }),
    open: (id) => call<OpenResult>(LIBRARY_ROUTES.open, { body: { id, host: false } }),
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
 * function that stops listening. Without `EventSource` it does nothing.
 */
export function subscribeLibraryEvents(
  onEvent: (event: LibraryEvent) => void,
  options: { url?: string; EventSource?: EventSourceLike } = {},
): () => void {
  const Source = options.EventSource ?? (typeof EventSource === 'undefined' ? null : (EventSource as unknown as EventSourceLike));
  if (!Source) return () => {};
  let source: InstanceType<EventSourceLike>;
  try {
    source = new Source(options.url ?? api.eventsUrl);
  } catch {
    return () => {};
  }
  source.onmessage = (message) => {
    const event = parseLibraryEvent(message.data);
    if (event) onEvent(event);
  };
  return () => source.close();
}
