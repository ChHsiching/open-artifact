/**
 * Whether this plugin has a newer release: the server half of updating it. The browser half (src/client/updates.tsx)
 * asks through the updates route and does the installing, through the app's plugin manager.
 *
 * It asks the registries the plugin manager asks, in the same order, for the version each calls `latest` and that
 * release's tarball. A plugin added from a folder (a `link:`, as in development), a tarball on disk or a git address is
 * the person's own to update, and is left out. What a registry said is kept for a while; what is installed is read each
 * time, so an update shows at once.
 */
import { isNewer, type PluginUpdate, type UpdateCheck } from '../shared/routes.ts';

/** What this needs of the app's plugin manager (`pluginManager`, the service the Plugins page calls). */
export interface PluginManager {
  listBundles(): Promise<readonly { name: string; version?: string; installed?: boolean; enabled?: boolean; source?: string; updatable?: boolean }[]>;
  registries(): Promise<{ registry?: string | null; fallbackRegistries?: readonly string[]; resolved?: string | null }>;
}

interface Release {
  version: string;
  tarball: string;
  registry: string;
}

/** A registry's answer for a package, as far as this reads it. */
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const NPM = 'https://registry.npmjs.org/';
/** One registry that does not answer stops holding things up after this long. */
const LOOKUP_MS = 8_000;
/** How long what a registry said is kept. */
export const FRESH_MS = 60 * 60_000;

/** The registry says where its tarballs are; a form the plugin manager would not take as a tarball is no use here. */
const TARBALL = /^https?:\/\/.+\.tgz$/i;

/** Installed by name from a registry, or by an earlier update from a registry's tarball. */
export function fromRegistry(name: string, source: string | undefined): boolean {
  return source !== undefined && (source.startsWith(`${name}@`) || TARBALL.test(source));
}

const withSlash = (url: string) => (url.endsWith('/') ? url : `${url}/`);

/** The registries the plugin manager asks, in its order. Reading pnpm's registry runs pnpm, so ask once per look. */
const registryPlan = (manager: PluginManager): Promise<string[]> =>
  manager
    .registries()
    .then(({ registry, fallbackRegistries, resolved }) => [...new Set([registry ?? resolved ?? NPM, ...(fallbackRegistries ?? [])].map(withSlash))]);

/** The latest release on one registry; null when it does not answer, or does not have the package. */
async function releaseOn(fetcher: Fetch, registry: string, name: string): Promise<Release | null> {
  try {
    const response = await fetcher(`${registry}${name}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(LOOKUP_MS),
    });
    if (!response.ok) return null;
    const doc = (await response.json()) as { 'dist-tags'?: { latest?: unknown }; versions?: Record<string, { dist?: { tarball?: unknown } } | undefined> };
    const version = doc['dist-tags']?.latest;
    const tarball = typeof version === 'string' ? doc.versions?.[version]?.dist?.tarball : undefined;
    return typeof tarball === 'string' && TARBALL.test(tarball) ? { version: version as string, tarball, registry } : null;
  } catch {
    return null;
  }
}

/**
 * Makes the updates route's answer.
 * @param names - The packages to look after: this plugin.
 * @param manager - The app's plugin manager, looked up each time; none (a profile-less run) means nothing to update.
 */
export function updateChecker(names: readonly string[], manager: () => PluginManager | undefined, fetcher: Fetch = fetch): () => Promise<UpdateCheck> {
  const known = new Map<string, { at: number; release: Promise<Release | null> }>();

  const releaseOf = (name: string, asked: () => Promise<string[]>): Promise<Release | null> => {
    const kept = known.get(name);
    if (kept !== undefined && Date.now() - kept.at < FRESH_MS) return kept.release;
    const release = (async () => {
      for (const registry of await asked()) {
        const found = await releaseOn(fetcher, registry, name);
        if (found !== null) return found;
      }
      return null;
    })();
    const entry = { at: Date.now(), release };
    known.set(name, entry);
    // Nothing answered: ask again next time rather than saying so for an hour.
    void release.then((found) => {
      if (found === null && known.get(name) === entry) known.delete(name);
    });
    return release;
  };

  return async () => {
    const service = manager();
    if (service === undefined) return { updates: [], failed: [] };
    const bundles = await service.listBundles();
    const ours = bundles.filter((b) => names.includes(b.name) && b.installed === true && typeof b.version === 'string' && fromRegistry(b.name, b.source));
    let plan: Promise<string[]> | undefined;
    const asked = () => (plan ??= registryPlan(service));
    const updates: PluginUpdate[] = [];
    const failed: string[] = [];
    await Promise.all(
      ours.map(async (bundle) => {
        const release = await releaseOf(bundle.name, asked);
        if (release === null) failed.push(bundle.name);
        else if (isNewer(release.version, bundle.version!)) {
          updates.push({
            name: bundle.name,
            version: bundle.version!,
            latest: release.version,
            spec: release.tarball,
            registry: release.registry,
            enabled: bundle.enabled !== false,
            native: bundle.updatable === true,
          });
        }
      }),
    );
    return { updates, failed };
  };
}
