#!/usr/bin/env node
// Write the fixture dashboard into <root> through a type CLI:
//   node load.mjs <cli.mjs> <root>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [cli, root] = process.argv.slice(2);
if (!cli || !root) {
  console.error('usage: node load.mjs <cli.mjs> <root>');
  process.exit(2);
}
const run = (args, input) => execFileSync(process.execPath, [cli, ...args], { cwd: here, input, encoding: 'utf8' });
const upload = file => {
  const out = run(['upload', root, path.join(here, file)]);
  const url = /\/_blob\/[A-Za-z0-9._-]+/.exec(out)?.[0];
  if (!url) throw new Error(`upload printed no url: ${out}`);
  return url;
};
const urls = { $signups: upload('signups.csv'), $regions: upload('regions.json') };
let batch = fs.readFileSync(path.join(here, 'dashboard.json'), 'utf8');
for (const [key, url] of Object.entries(urls)) batch = batch.replaceAll(`"${key}"`, JSON.stringify(url));
process.stdout.write(run(['write-db', root, '-'], batch));
