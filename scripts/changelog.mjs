#!/usr/bin/env node
/**
 * Helps write CHANGELOG.md from the commit history, and reads a release's notes back out of it.
 *
 *   node scripts/changelog.mjs [<from>] [<to>]
 *                         print the commits in <from>..<to> (default: the latest v* tag before <to>, and HEAD) as
 *                         Markdown, subject and body, without merges or Co-Authored-By lines: the raw material for the
 *                         next CHANGELOG.md entry
 *   node scripts/changelog.mjs --check <version>
 *                         exit 1 unless CHANGELOG.md has a "## [<version>]" section with something in it
 *   node scripts/changelog.mjs --notes <version>
 *                         print that section's body (the GitHub release notes)
 *
 * <version> may be given with or without the leading v (v0.9.0 or 0.9.0).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const args = process.argv.slice(2);

/** The body of CHANGELOG.md's "## [version]" section, or null when it has none. */
function section(version) {
  const v = version.replace(/^v/, '');
  const text = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${v}]`));
  if (start < 0) return null;
  let end = lines.findIndex((line, i) => i > start && (line.startsWith('## ') || /^\[[^\]]+\]: /.test(line)));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

for (const flag of ['--check', '--notes']) {
  const at = args.indexOf(flag);
  if (at < 0) continue;
  const version = args[at + 1];
  if (!version) {
    console.error(`changelog: ${flag} needs a version`);
    process.exit(2);
  }
  const body = section(version);
  if (!body) {
    console.error(`changelog: CHANGELOG.md has no entry for ${version}; write one from \`node scripts/changelog.mjs\``);
    process.exit(1);
  }
  if (flag === '--notes') console.log(body);
  process.exit(0);
}

const to = args[1] ?? 'HEAD';
let from = args[0];
if (!from) {
  try {
    from = git('describe', '--tags', '--abbrev=0', '--match', 'v*', `${to}^`);
  } catch {
    from = null; // no earlier tag: the whole history
  }
}
const range = from ? `${from}..${to}` : to;
const SEP = '\u001e';
const log = git('log', '--no-merges', '--reverse', `--format=%h%x1f%ad%x1f%s%x1f%b${SEP}`, '--date=short', range);

console.log(`# Commits ${from ? `since ${from}` : 'from the start'} (${range})\n`);
for (const entry of log.split(SEP)) {
  if (!entry.trim()) continue;
  const [hash, date, subject, body = ''] = entry.trim().split('\u001f');
  const text = body
    .split('\n')
    .filter((line) => !/^co-authored-by:/i.test(line.trim()))
    .join('\n')
    .trim();
  console.log(`## ${subject} (${hash}, ${date})\n`);
  if (text) console.log(`${text}\n`);
}
