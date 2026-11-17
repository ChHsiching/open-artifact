#!/usr/bin/env node
/**
 * frame-host: the type server of an original hosted artifact type — a
 * folder (`OPEN_ARTIFACT_TYPE_DIR`) whose index.html declares itself in an inline
 * `// artifact.json` block. The daemon derives this entry for such a type
 * (runtime `frame`); it can also be started by hand with `OPEN_ARTIFACT_TYPE_DIR` set.
 * Every artifact's page runs on its own origin, `<id>.frame.localhost:<port>`.
 *
 * Runs from source (`node packages/server-sdk/bin/frame-host.ts`) or as the
 * bundle `scripts/build.mjs --only frame` writes to `dist/daemon/frame-host/`.
 */
import { basename, resolve } from 'node:path';
import { frameActions, mountFrameSite, readDeclaration } from '../src/frame/index.ts';
import { serve, typeManifest } from '../src/serve.ts';

const dir = resolve(process.env.OPEN_ARTIFACT_TYPE_DIR ?? process.cwd());
const declaration = readDeclaration(dir);
if (!declaration) {
  process.stderr.write(`${dir}/index.html has no // artifact.json declaration: not an original artifact type.\n`);
  process.exit(2);
}
const manifest = typeManifest(dir);
await serve({
  mountSite: (root, ctx) => mountFrameSite(root, { ...ctx, typeDir: dir }),
  actions: frameActions,
  // The type id: the daemon passes it; by hand, the folder name (as the daemon would derive it).
  type: process.env.OPEN_ARTIFACT_TYPE ?? basename(dir),
  version: manifest.version ?? '0',
  contentHosts: true,
});
