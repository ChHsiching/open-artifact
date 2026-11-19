#!/usr/bin/env node
/**
 * Builds dsh-open-artifact. DSH links a plugin folder in place and installs none of its dependencies, so everything
 * the plugin runs is in these files:
 *
 *   lib/index.js   the server half (src/server/index.ts), one Node ESM file with the protocol and the daemon client in it
 *   lib/client.js  the browser half (src/client/index.tsx), CommonJS in the app's `window.__ModuleLoader__.load`
 *                  wrapper, with React and the app's platform modules left to the loader
 *   vendor/        the daemon (`open-artifact.mjs`), the built Shell and home pages, frame-host (the type server from dist/daemon/frame-host), the harness profiles and the built-in types;
 *                  a piece that is not there is skipped with a warning
 *   LICENSE, NOTICE the repository's license files, copied here so the npm package carries them
 *
 * The page's CSS is plain CSS in src/client/styles.ts, on the app's own design tokens, with every class prefixed.
 *
 *   node plugins/dsh/scripts/build.mjs
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** The modules the app's loader provides to a client bundle; nothing else may stay a `require`. */
const PLATFORM_MODULES = ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'];

const warn = (message) => console.warn(`dsh-open-artifact build: ${message}`);
const log = (message) => console.log(`dsh-open-artifact build: ${message}`);

// ---------------------------------------------------------------- bundles

function buildServer() {
  buildSync({
    entryPoints: [join(root, 'src', 'server', 'index.ts')],
    outfile: join(root, 'lib', 'index.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'warning',
    banner: { js: `// ${pkg.name} ${pkg.version}: the DSH plugin (server half). Built by scripts/build.mjs; do not edit.` },
  });
}

/** The client bundle in the app's module loader wrapper. */
function buildClient() {
  const result = buildSync({
    entryPoints: [join(root, 'src', 'client', 'index.tsx')],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'cjs',
    target: 'es2022',
    jsx: 'automatic',
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'warning',
    external: PLATFORM_MODULES,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const body = result.outputFiles[0].text
    .split('\n')
    .filter((line) => !/^\/\/ (src|scripts|\.\.\/|node_modules)\//.test(line))
    .map((line) => (line ? `\t\t${line}` : line))
    .join('\n');
  const out = [
    `// ${pkg.name} ${pkg.version}: the DSH plugin (browser half). Built by scripts/build.mjs; do not edit.`,
    'window.__ModuleLoader__.load({',
    `\tid: ${JSON.stringify(pkg.name)},`,
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    body,
    '\t\treturn module.exports;',
    '\t},',
    '});',
    '',
  ].join('\n');
  const stray = [...out.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]).filter((id) => !PLATFORM_MODULES.includes(id));
  if (stray.length > 0) throw new Error(`lib/client.js requires modules the app does not provide: ${[...new Set(stray)].join(', ')}`);
  writeFileSync(join(root, 'lib', 'client.js'), out);
}

// ---------------------------------------------------------------- vendor

const isDir = (path) => existsSync(path) && statSync(path).isDirectory();

/** Copies a folder into vendor/, leaving out node_modules; warns when it is not there. */
function vendorCopy(from, to, what) {
  if (!isDir(from)) return warn(`${what}: ${relative(repo, from)} is not there; skipped.`);
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true, filter: (path) => basename(path) !== 'node_modules' });
}

function buildVendor() {
  const vendor = join(root, 'vendor');
  mkdirSync(vendor, { recursive: true });
  const entry = join(repo, 'packages', 'daemon', 'src', 'bin', 'open-artifact.ts');
  if (!existsSync(entry)) warn('the daemon: packages/daemon/src/bin/open-artifact.ts is not there; vendor/open-artifact.mjs skipped.');
  else {
    try {
      buildSync({
        entryPoints: [entry],
        outfile: join(vendor, 'open-artifact.mjs'),
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node22',
        charset: 'utf8',
        legalComments: 'none',
        logLevel: 'silent',
        // Bundled ESM still meets CommonJS dependencies that call require().
        banner: { js: "import { createRequire as __openArtifactCreateRequire } from 'node:module'; const require = __openArtifactCreateRequire(import.meta.url);" },
      });
    } catch (error) {
      rmSync(join(vendor, 'open-artifact.mjs'), { force: true });
      warn(`the daemon did not bundle; vendor/open-artifact.mjs skipped: ${error.message.split('\n')[0]}`);
    }
  }
  vendorCopy(join(repo, 'dist', 'daemon', 'shell'), join(vendor, 'shell'), 'the Shell');
  vendorCopy(join(repo, 'dist', 'daemon', 'home'), join(vendor, 'home'), 'the home page');
  // The daemon looks for it next to itself: vendor/frame-host/frame-host.mjs.
  vendorCopy(join(repo, 'dist', 'daemon', 'frame-host'), join(vendor, 'frame-host'), 'frame-host');
  vendorCopy(join(repo, 'packages', 'daemon', 'harnesses'), join(vendor, 'harnesses'), 'the harness profiles');
  vendorCopy(join(repo, 'artifact-types', 'design'), join(vendor, 'artifact-types', 'design'), 'the design type');
  vendorCopy(join(repo, 'artifact-types', 'whiteboard'), join(vendor, 'artifact-types', 'whiteboard'), 'the whiteboard type');
  vendorCopy(join(repo, 'artifact-types', 'data'), join(vendor, 'artifact-types', 'data'), 'the data type');
  vendorCopy(join(repo, 'artifact-types', 'sheets'), join(vendor, 'artifact-types', 'sheets'), 'the sheets type');
  vendorCopy(join(repo, 'artifact-types', 'slides'), join(vendor, 'artifact-types', 'slides'), 'the slides type');
  vendorCopy(join(repo, 'artifact-types', 'design-system'), join(vendor, 'artifact-types', 'design-system'), 'the design-system type');
  vendorCopy(join(repo, 'artifact-types', 'docs'), join(vendor, 'artifact-types', 'docs'), 'the docs type');
}

// ---------------------------------------------------------------- main

/** The whole build; `--no-vendor` leaves vendor/ as it is. */
async function main() {
  mkdirSync(join(root, 'lib'), { recursive: true });
  for (const file of ['LICENSE', 'NOTICE']) cpSync(join(repo, file), join(root, file));
  buildServer();
  log('lib/index.js');
  buildClient();
  log('lib/client.js');
  if (process.argv.includes('--no-vendor')) log('vendor/ skipped (--no-vendor)');
  else {
    buildVendor();
    log('vendor/');
  }
}

// Run as a script; imported (to check the CSS scoping), it only exports.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
