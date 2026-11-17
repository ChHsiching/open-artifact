/**
 * Version history: the panel (opened from the Shell's History command, or
 * the page's own button outside a Shell), read-only previews of a version,
 * restores, and notices when someone else's change overwrote the
 * viewer's ("Bring back"). Same shape as the Design editor's
 * `services/history.ts` (`available`, `open`, `previewing`, `canRestore`,
 * `historyCapability()`, `toggleHistory`, `previewVersion`,
 * `restoreVersion`); the preview itself swaps the files store into the
 * version, read-only (`services/sync.ts`).
 */

import type { HistoryCapability, HistoryNotice, HistoryVersion } from '@open-artifact/runtime';
import { toast } from '@open-artifact/ui';
import { create } from 'zustand';
import { useFiles } from '../state/files.ts';
import { session } from './session.ts';
import { enterPreview, exitPreview } from './sync.ts';

interface HistoryState {
  available: boolean;
  /** The panel is open. */
  open: boolean;
  /** The version shown read-only (`null`: the current files). */
  previewing: number | null;
  /** What the preview bar says about it. */
  previewLabel: string;
  loading: boolean;
  /** Someone else's change overwrote one of the viewer's. */
  notices: HistoryNotice[];
  /** The newest versions (for the code-sync diff). */
  versions: HistoryVersion[];
  canRestore: boolean;
  setOpen(open: boolean): void;
}

export const useHistory = create<HistoryState>()((set) => ({
  available: false,
  open: false,
  previewing: null,
  previewLabel: '',
  loading: false,
  notices: [],
  versions: [],
  canRestore: false,
  setOpen(open) {
    set({ open });
  },
}));

let capability: HistoryCapability | null = null;

/** The history capability, once {@link startHistory} found it. */
export function historyCapability(): HistoryCapability | null {
  return capability;
}

/** Re-reads the listing (versions and notices). */
async function refresh(): Promise<void> {
  const history = capability;
  if (!history) return;
  try {
    const listing = await history.list();
    useHistory.setState({ notices: listing.notices, versions: listing.versions, canRestore: listing.canRestore });
  } catch {
    // The next change tries again.
  }
}

/** Starts following the history, when the host keeps one. */
export function startHistory(): void {
  const history = session().history;
  if (!history) return;
  capability = history;
  useHistory.setState({ available: true });
  void refresh();
  let timer: ReturnType<typeof setTimeout> | null = null;
  history.onChange(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void refresh(), 300);
  });
}

/** Opens or closes the panel (closing it ends a preview). */
export function toggleHistory(open = !useHistory.getState().open): void {
  if (!useHistory.getState().available) return;
  useHistory.getState().setOpen(open);
  if (!open) void previewVersion(null);
}

/** A short label of a version for the preview bar. */
function versionLabel(version: HistoryVersion | undefined, n: number): string {
  if (!version) return `Version ${n}`;
  const when = new Date(version.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const who = version.author.kind === 'system' ? 'the original' : version.author.id === session().viewer.id ? 'you' : version.author.name;
  return `Version ${n} · ${when} · by ${who}`;
}

/** Shows version `n` read-only (`null`: back to the current files). */
export async function previewVersion(n: number | null): Promise<void> {
  if (n === null) {
    useHistory.setState({ previewing: null, previewLabel: '', loading: false });
    await exitPreview();
    return;
  }
  // The newest version is what the files hold: nothing to preview.
  const version = useHistory.getState().versions.find((v) => v.n === n);
  if (version?.current) {
    await previewVersion(null);
    return;
  }
  useHistory.setState({ loading: true });
  try {
    await enterPreview(n);
    useHistory.setState({ previewing: n, previewLabel: versionLabel(version, n), loading: false });
  } catch (error) {
    useHistory.setState({ loading: false });
    toast.add({ title: `Could not open version ${n}`, description: error instanceof Error ? error.message : String(error) });
  }
}

/** Restores version `n` (all files, or `paths` as artifact paths). */
export async function restoreVersion(n: number, paths?: string[]): Promise<void> {
  const history = capability;
  if (!history) return;
  try {
    await previewVersion(null);
    const result = await history.restore(n, paths);
    toast.add({ title: result.version === null ? 'Nothing to restore: the files already match' : `Restored version ${n}`, description: result.changed.length ? `${result.changed.length} files changed.` : undefined });
    void refresh();
  } catch (error) {
    toast.add({ title: 'Could not restore', description: error instanceof Error ? error.message : String(error) });
  }
}

/** "Bring back": restores the viewer's lost change to one path. */
export async function bringBack(notice: HistoryNotice): Promise<void> {
  if (useFiles.getState().readOnly && useFiles.getState().preview === null) {
    toast.add({ title: 'You cannot change this design system' });
    return;
  }
  await restoreVersion(notice.lost.n, [notice.path]);
  await dismissNotice(notice.id);
}

/** Hides a notice. */
export async function dismissNotice(id: string): Promise<void> {
  useHistory.setState((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) }));
  try {
    await capability?.dismissNotice(id);
  } catch {
    // Gone already.
  }
}

/**
 * The newest version written by the agent before the last code sync
 * changed the system, for "what changed since the last sync": the version
 * whose files include the index and that came from the agent.
 */
export function lastSyncVersion(versions: readonly HistoryVersion[]): HistoryVersion | null {
  return versions.find((version) => version.author.kind === 'agent' && version.files.some((file) => file.path === 'project/tokens.json' || file.path === 'project/design-system.json')) ?? null;
}

/** One file of {@link changesSinceSync}. */
export interface SyncChange {
  /** Project path. */
  path: string;
  before: string | null;
  after: string | null;
}

/**
 * What changed since the last code sync: each file a later version changed,
 * as the sync left it and as it is now. With no later change, what the
 * sync itself changed. `null` when there is no history or no sync yet.
 */
export async function changesSinceSync(): Promise<{ since: HistoryVersion; later: boolean; files: SyncChange[] } | null> {
  const history = capability;
  if (!history) return null;
  const { versions } = await history.list();
  const sync = lastSyncVersion(versions);
  if (!sync) return null;
  const project = (path: string): string | null => (path.startsWith('project/') ? path.slice(8) : null);
  const later = versions.filter((version) => version.n > sync.n);
  const files: SyncChange[] = [];
  const text = (promise: Promise<string>): Promise<string | null> => promise.catch(() => null);
  if (later.length) {
    const paths = [...new Set(later.flatMap((version) => version.files.map((file) => file.path)))].filter((path) => project(path) !== null && !/\.(png|jpe?g|gif|webp|woff2?|ttf|otf|ico)$/i.test(path));
    for (const path of paths.slice(0, 40)) {
      const [before, after] = await Promise.all([text(history.read(sync.n, path)), text(history.read(versions[0]!.n, path))]);
      if (before !== after) files.push({ path: project(path)!, before, after });
    }
  } else {
    for (const file of sync.files.slice(0, 40)) {
      if (project(file.path) === null) continue;
      const diff = await history.diff(sync.n, file.path).catch(() => null);
      if (diff && !diff.binary) files.push({ path: project(file.path)!, before: diff.before, after: diff.after });
    }
  }
  return { since: sync, later: later.length > 0, files };
}
