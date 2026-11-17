#!/usr/bin/env node
// End-to-end tests of the built artifact types. See e2e/README.md.
//
//   npm run e2e                               artifact-types/ (build first: npm run build)
//   npm run e2e -- --dir <path>               any copy of artifact-types/
//   npm run e2e -- --only design              some suites (file names in e2e/ without .test.mjs)
//   npm run e2e -- --no-browser               skip the Chrome checks
//   npm run e2e -- --keep                     keep the temporary folders
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const suites = fs.readdirSync(here).filter(f => f.endsWith('.test.mjs')).map(f => f.slice(0, -'.test.mjs'.length)).sort();
const env = { ...process.env };
let only = null;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const value = () => {
    const v = args[++i];
    if (!v) fail(`${arg} needs a value`);
    return v;
  };
  if (arg === '--dir') env.E2E_DIR = path.resolve(value());
  else if (arg === '--only') only = value().split(',').map(s => s.trim()).filter(Boolean);
  else if (arg === '--no-browser') env.E2E_BROWSER = '0';
  else if (arg === '--keep') env.E2E_KEEP = '1';
  else if (arg === '-h' || arg === '--help') {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'));
    console.log(`\nSuites: ${suites.join(', ')}`);
    process.exit(0);
  } else fail(`unknown option ${arg} (--help)`);
}

const dir = env.E2E_DIR ?? path.join(path.dirname(here), 'artifact-types');
if (!fs.existsSync(path.join(dir, 'design', 'SKILL.md'))) fail(`${dir} holds no built types`);
const unknown = (only ?? []).filter(s => !suites.includes(s));
if (unknown.length) fail(`no suite ${unknown.join(', ')} (there are ${suites.join(', ')})`);

const files = (only ?? suites).map(s => path.join(here, `${s}.test.mjs`));
console.log(`# e2e: ${dir}${env.E2E_BROWSER === '0' ? ' (no browser)' : ''}`);
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=2', '--test-reporter=spec', ...files], { env, stdio: 'inherit' });
process.exit(r.status ?? 1);

function fail(message) {
  console.error(`e2e: ${message}`);
  process.exit(2);
}
