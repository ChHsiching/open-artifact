import { pathProblem } from '@open-artifact/design-system-core';
import { stashFresh, storedJson } from '@open-artifact/editor-kit';
import { dirtyPaths, fromDisk, useFiles } from '../state/files.ts';
import { artifactPath, session } from './session.ts';

interface Draft {
  at: number;
  edits: Record<string, string | null>;
}

/** A restored tab retains its unsent edits without mixing drafts from two simultaneous editors. */
export async function startRecovery(): Promise<void> {
  const { artifact } = session();
  const storage = storedJson<Draft>(`open-artifact:design-system:${artifact.id}:draft`, (value) => {
    const draft = value as Partial<Draft> | null;
    if (!draft || typeof draft.at !== 'number' || !stashFresh(draft.at, Date.now()) || !draft.edits || typeof draft.edits !== 'object') return null;
    if (Object.entries(draft.edits).some(([path, text]) => pathProblem(path) || path.startsWith('api/') || (text !== null && typeof text !== 'string'))) return null;
    return { at: draft.at, edits: draft.edits };
  }, () => window.sessionStorage);
  const stashed = storage.read();
  if (stashed && !useFiles.getState().readOnly) {
    for (const [path, mine] of Object.entries(stashed.edits)) {
      const state = useFiles.getState();
      const entry = state.listing[path];
      let theirs = state.server[path] ?? null;
      if (entry && theirs === null) {
        try {
          theirs = await artifact.readText(artifactPath(path));
        } catch {
          continue;
        }
        state.acknowledge({ [path]: { text: theirs, hash: entry.hash } });
      }
      if (mine === (theirs === null ? null : fromDisk(path, theirs))) continue;
      state.edit({ [path]: mine });
      state.addConflict({ path, mine, theirs, theirsHash: entry?.hash ?? null, recovered: true });
    }
  }
  const save = () => {
    const state = useFiles.getState();
    if (state.readOnly || state.preview !== null) return;
    const paths = dirtyPaths(state);
    if (paths.length) storage.write({ at: Date.now(), edits: Object.fromEntries(paths.map((path) => [path, state.texts[path] ?? null])) });
    else storage.clear();
  };
  save();
  useFiles.subscribe((state, prev) => {
    if (state.texts !== prev.texts || state.server !== prev.server) save();
  });
}
