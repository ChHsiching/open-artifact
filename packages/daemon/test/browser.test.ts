import { tempDir, until } from './helpers.ts';

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { SessionRef } from '@open-artifact/protocol';
import { startDaemon, type Daemon } from '../src/daemon.ts';

// Pages the agent opens go to this computer's browser for harnesses whose profile says `open: "browser"`.
let daemon: Daemon;
const browsed: string[] = [];
const workspace = tempDir('open-artifact-browser-ws-');
const plugin: SessionRef = { harness: 'claude-code', session: 'browser-test', workspace };
const plain: SessionRef = { harness: 'cli', session: null, workspace };
let boardView = '';

before(async () => {
  const shellDir = tempDir('open-artifact-shell-');
  daemon = await startDaemon({ port: 0, quiet: true, shellDir, homeDir: shellDir, browse: (url) => (browsed.push(url), true) });
});

after(() => daemon.close());

const create = async (caller: SessionRef, title: string) =>
  (await daemon.tools.call('Artifact', { action: 'publish', type_url: 'open-artifact://type/whiteboard', title, open: 'after_first_write' }, caller)) as Record<string, any>;

test('browser: open shows the page in the browser for a plugin harness, and nowhere for one without', async () => {
  const made = await create(plugin, 'Board');
  const opened = (await daemon.tools.call('Artifact', { action: 'open', url: made.url, panel: 'share' }, plugin)) as Record<string, any>;
  assert.equal(opened.opened, true);
  assert.equal(opened.opened_in, 'browser');
  assert.equal(browsed.at(-1), opened.view_url);
  assert.match(String(opened.view_url), /\/a\/art_.*\?panel=share$/);
  boardView = made.view_url;

  const count = browsed.length;
  const theirs = await create(plain, 'Plain board');
  assert.equal(theirs.open, undefined);
  assert.ok(theirs.note);
  const shown = (await daemon.tools.call('Artifact', { action: 'open', url: theirs.url }, plain)) as Record<string, any>;
  assert.equal(shown.opened, false);
  assert.equal(browsed.length, count);
});

test('browser: open "after_first_write" opens the page once the content lands', async () => {
  const made = await create(plugin, 'Later board');
  assert.equal(made.open, 'after_first_write');
  const count = browsed.length;
  writeFileSync(join(made.root, 'board.json'), '{}');
  await until(() => browsed.length > count, 8000);
  assert.equal(browsed.at(-1), made.view_url);
  // The first board was opened by hand: its wait for the first write was dropped, so it opened once.
  assert.equal(browsed.filter((u) => u.startsWith(boardView)).length, 1);
});
