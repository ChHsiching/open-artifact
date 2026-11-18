/**
 * The daemon the plugin starts. DSH links a plugin folder in place and installs none of its dependencies, so the build
 * (scripts/build.mjs) puts what the daemon needs into `vendor/`:
 *
 *   vendor/open-artifact.mjs                    the daemon, one Node ESM file
 *   vendor/shell, vendor/home        the Shell and home pages, when built
 *   vendor/frame-host                the type server of original hosted artifact types (the daemon finds it next to open-artifact.mjs)
 *   vendor/harnesses                 the harness profiles
 *   vendor/artifact-types/design     the built-in types (data, design, design-system, slides, whiteboard)
 *
 * Every harness on this computer shares one daemon: whichever starts it first decides these folders.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnsureDaemonOptions } from '@open-artifact/daemon/client';

/** The package's name, as package.json and DSH know it. */
export const PACKAGE_NAME = 'dsh-open-artifact';

/**
 * The plugin folder: the nearest parent of this module whose package.json is this package's. This module runs from
 * `lib/index.js` once bundled and from `src/server/` in tests.
 */
export function packageRoot(from: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = from;
  for (;;) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string };
      if (pkg.name === PACKAGE_NAME) return dir;
    } catch {
      // no package.json here: look further up
    }
    const parent = dirname(dir);
    if (parent === dir) return resolve(from, '..');
    dir = parent;
  }
}

/** Where the vendored pieces are, under the plugin folder. */
export function vendorPaths(root: string = packageRoot()): { bin: string; shell: string; home: string; types: string; harnesses: string } {
  const vendor = join(root, 'vendor');
  return {
    bin: join(vendor, 'open-artifact.mjs'),
    shell: join(vendor, 'shell'),
    home: join(vendor, 'home'),
    types: join(vendor, 'artifact-types'),
    harnesses: join(vendor, 'harnesses'),
  };
}

/**
 * How to start the daemon when none runs: the vendored entry, with the vendored Shell, home page, built-in types and
 * harness profiles (`OPEN_ARTIFACT_SHELL_DIR`, `OPEN_ARTIFACT_HOME_DIR`, `OPEN_ARTIFACT_BUILTIN_TYPES`, `OPEN_ARTIFACT_HARNESS_PROFILES`) unless the environment
 * already names them. Without a vendored
 * entry the daemon client's own default applies (`$OPEN_ARTIFACT_DAEMON_BIN`).
 */
export function daemonOptions(root: string = packageRoot(), env: NodeJS.ProcessEnv = process.env): EnsureDaemonOptions {
  const paths = vendorPaths(root);
  const daemonEnv: NodeJS.ProcessEnv = { ...env };
  const folder = (name: string, dir: string) => {
    if (!daemonEnv[name] && existsSync(dir)) daemonEnv[name] = dir;
  };
  folder('OPEN_ARTIFACT_SHELL_DIR', paths.shell);
  folder('OPEN_ARTIFACT_HOME_DIR', paths.home);
  folder('OPEN_ARTIFACT_BUILTIN_TYPES', paths.types);
  folder('OPEN_ARTIFACT_HARNESS_PROFILES', paths.harnesses);
  return { env: daemonEnv, ...(existsSync(paths.bin) ? { bin: paths.bin } : {}) };
}
