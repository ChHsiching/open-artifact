/**
 * The page's calls to its Host routes (src/server/routes.ts). Paths are fetched relative to the document, as the app's
 * own pages call their routes, so the page works under whatever prefix the app is served at.
 */
import { PATHS, type ArtifactList, type DeleteAnswer, type OpenAnswer, type PageArtifact } from '../shared/routes.ts';

/** A route path as the page fetches it. */
export const routeUrl = (path: string, params?: Record<string, string>): string =>
  `${path.slice(1)}${params ? `?${new URLSearchParams(params)}` : ''}`;

/** One route call: its JSON answer, or a throw with the route's words. */
async function call<T>(path: string, params: Record<string, string>, init: RequestInit = { method: 'POST' }): Promise<T> {
  const response = await fetch(routeUrl(path, params), init);
  const body = (await response.json().catch(() => ({}))) as T & { error?: unknown };
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`);
  return body;
}

/** The routes, as functions. Replaceable in tests. */
export interface PageApi {
  list(): Promise<ArtifactList>;
  open(id: string): Promise<OpenAnswer>;
  preview(id: string): Promise<string | null>;
  update(id: string, patch: { title?: string; pinned?: boolean }): Promise<PageArtifact>;
  remove(id: string): Promise<DeleteAnswer>;
  restore(trash: string): Promise<PageArtifact>;
  saveThumbnail(id: string, version: string, jpeg: Uint8Array): Promise<string | null>;
  /** The thumbnail's address, for an `<img>`. */
  thumbnailUrl(id: string, version: string): string;
  /** The library's events; the returned function stops them. Null where the browser has no EventSource. */
  events(onEvent: () => void, onError: () => void): (() => void) | null;
}

/** The routes over `fetch`. */
export const httpApi: PageApi = {
  async list() {
    const response = await fetch(routeUrl(PATHS.list), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as Partial<ArtifactList>;
    return {
      artifacts: Array.isArray(body.artifacts) ? body.artifacts.filter((a) => a && typeof a.id === 'string') : [],
      types: Array.isArray(body.types) ? body.types.filter((t) => t && typeof t.id === 'string') : [],
    };
  },
  open: (id) => call<OpenAnswer>(PATHS.open, { id }),
  preview: async (id) => (await call<{ url?: unknown }>(PATHS.preview, { id })).url as string | null,
  update: (id, patch) => call<PageArtifact>(PATHS.update, { id }, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }),
  remove: (id) => call<DeleteAnswer>(PATHS.delete, { id }),
  restore: (trash) => call<PageArtifact>(PATHS.restore, { trash }),
  async saveThumbnail(id, version, jpeg) {
    const out = await call<{ thumbnail?: unknown }>(PATHS.thumbnail, { id, v: version }, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body: jpeg as Uint8Array<ArrayBuffer>,
    });
    return typeof out.thumbnail === 'string' ? out.thumbnail : null;
  },
  thumbnailUrl: (id, version) => routeUrl(PATHS.thumbnail, { id, v: version }),
  events(onEvent, onError) {
    if (typeof EventSource === 'undefined') return null;
    const source = new EventSource(routeUrl(PATHS.events));
    source.onmessage = () => onEvent();
    source.onerror = () => onError();
    return () => source.close();
  },
};
