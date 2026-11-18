#!/usr/bin/env node
/**
 * Publishes the packages staged in dist/npm/ (scripts/build-npm.mjs), dependencies first, skipping each version npm
 * already has, so a release publishes only the packages whose version went up and a failed run can run again.
 *
 * On GitHub Actions (.github/workflows/publish-npm.yml) npm signs in by trusted publishing (OIDC), with provenance;
 * on a computer it asks you to sign in on npmjs.com for each package (`--auth-type=web`).
 *
 *   node scripts/publish-npm.mjs              publish
 *   node scripts/publish-npm.mjs --dry-run    show what would be published
 *   node scripts/publish-npm.mjs --claim      make the workflow the trusted publisher of each package npm doesn't have
 *                                             yet, so the workflow can publish it (npm creates the package with a
 *                                             0.0.0-stage placeholder; npm asks you to sign in for each)
 *   node scripts/publish-npm.mjs --trust [<name>…]
 *                                             make the workflow each package's trusted publisher on npmjs.com (once per
 *                                             package, after its first publish; npm asks you to sign in for each)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist', 'npm');
const dryRun = process.argv.includes('--dry-run');
const ci = !!process.env.GITHUB_ACTIONS;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const order = execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-npm.mjs'), '--order'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
if (!order.length) {
  console.error('npm publish: dist/npm/ is empty; run node scripts/build-npm.mjs first');
  process.exit(1);
}

/** Whether npm has `name@version` already. */
function published(name, version) {
  const run = spawnSync(npm, ['view', `${name}@${version}`, 'version'], { encoding: 'utf8' });
  return run.status === 0 && run.stdout.trim() === version;
}

/** Whether npm has any version of `name`. */
function exists(name) {
  return spawnSync(npm, ['view', name, 'name'], { encoding: 'utf8' }).status === 0;
}

/** The repository and workflow npm trusts to publish. */
const TRUSTED = { repo: 'JimLiu/open-artifact', file: 'publish-npm.yml' };

const packages = order.map((folder) => ({ folder, ...JSON.parse(readFileSync(join(OUT, folder, 'package.json'), 'utf8')) }));

function trust(name) {
  console.log(`npm trust: ${name}`);
  const args = ['trust', 'github', name, '--file', TRUSTED.file, '--repo', TRUSTED.repo, '--allow-publish', '--yes', '--auth-type=web'];
  return spawnSync(npm, args, { stdio: 'inherit' }).status === 0;
}

if (process.argv.includes('--claim')) {
  const failed = [];
  for (const { name } of packages) {
    if (exists(name)) continue;
    if (dryRun) console.log(`npm claim: ${name} (dry run)`);
    else if (!trust(name)) failed.push(name);
  }
  if (failed.length) {
    console.error(`npm claim: not done for ${failed.join(' ')}; run again`);
    process.exit(1);
  }
  console.log('npm claim: done');
  process.exit(0);
}

if (process.argv.includes('--trust')) {
  const only = process.argv.slice(process.argv.indexOf('--trust') + 1).filter((arg) => !arg.startsWith('--'));
  const failed = [];
  for (const { name } of packages) {
    if (only.length && !only.includes(name)) continue;
    if (!trust(name)) failed.push(name);
  }
  if (failed.length) {
    console.error(`npm trust: not set for ${failed.join(' ')} (one already set fails too); run again with those names`);
    process.exit(1);
  }
  console.log('npm trust: done');
  process.exit(0);
}

let count = 0;
for (const { folder, name, version } of packages) {
  if (published(name, version)) {
    console.log(`npm publish: ${name}@${version} is already on npm`);
    continue;
  }
  console.log(`npm publish: ${name}@${version}${dryRun ? ' (dry run)' : ''}`);
  const args = ['publish', ...(dryRun ? ['--dry-run'] : []), ...(ci ? [] : ['--auth-type=web'])];
  const run = spawnSync(npm, args, { cwd: join(OUT, folder), stdio: 'inherit' });
  if (run.status !== 0) {
    console.error(`npm publish: ${name}@${version} failed; nothing after it was published`);
    process.exit(run.status ?? 1);
  }
  count++;
}
console.log(`npm publish: ${count} package${count === 1 ? '' : 's'} ${dryRun ? 'to publish' : 'published'}`);
