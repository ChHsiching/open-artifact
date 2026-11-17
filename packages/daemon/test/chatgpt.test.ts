import { tempDir } from './helpers.ts';

import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { DaemonState } from '@open-artifact/protocol';
import { CARD_URI, chatgptSecret, serveChatGpt } from '../src/chatgpt.ts';
import { readDaemon } from '../src/client.ts';
import { startDaemon, type Daemon } from '../src/daemon.ts';

let daemon: Daemon;
let server: Server;
let base: string;
const workspace = tempDir('open-artifact-chatgpt-ws-');

before(async () => {
  const shellDir = tempDir('open-artifact-shell-');
  daemon = await startDaemon({ port: 0, quiet: true, shellDir, homeDir: shellDir });
  const state = (await readDaemon()) as DaemonState;
  const secret = chatgptSecret();
  server = await serveChatGpt({ port: 0, workspace, secret, daemon: async () => state, log: () => undefined });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp/${secret}`;
});

after(() => {
  server.close();
  daemon.close();
});

let id = 1;
async function rpc(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}, url = base) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as { result?: Record<string, any>; error?: { message: string } } | null };
}

test('chatgpt: the secret is kept, and only its path answers', async () => {
  assert.equal(chatgptSecret(), chatgptSecret());
  assert.equal((await rpc('ping', {}, {}, base.replace(/[^/]+$/, 'wrong'))).status, 404);
  assert.equal((await rpc('ping', {}, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await rpc('ping', {}, { Origin: 'https://chatgpt.com' })).status, 200);
  assert.equal((await fetch(base)).status, 405);
});

test('chatgpt: initialize, the tools with ShowArtifact, and the card resource', async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
  assert.ok(init.body?.result?.capabilities.resources);
  assert.match(String(init.body?.result?.instructions), /no file tools/);
  const tools = (await rpc('tools/list')).body?.result?.tools as Array<{ name: string; _meta?: Record<string, unknown> }>;
  assert.deepEqual(tools.map((t) => t.name), ['Artifact', 'ArtifactData', 'ArtifactComments', 'ShowArtifact']);
  assert.equal(tools.at(-1)?._meta?.['openai/outputTemplate'], CARD_URI);
  const card = (await rpc('resources/read', { uri: CARD_URI })).body?.result?.contents[0];
  assert.equal(card.mimeType, 'text/html;profile=mcp-app');
  assert.match(card.text, /sendFollowUpMessage/);
});

test('chatgpt: publish with files, read, and ShowArtifact as harness chatgpt in the workspace', async () => {
  const call = async (name: string, args: Record<string, unknown>) => (await rpc('tools/call', { name, arguments: args })).body?.result as { content: Array<{ text: string }>; structuredContent?: Record<string, unknown> };
  const made = JSON.parse((await call('Artifact', { action: 'publish', type_url: 'open-artifact://type/design', title: 'Web deck' })).content[0]!.text);
  const record = daemon.store.require(String(made.url).split('/').pop()!);
  assert.deepEqual(record.owner, { harness: 'chatgpt', session: null, workspace });
  await call('Artifact', { action: 'publish', url: made.url, files: { 'notes.txt': 'hi' } });
  assert.equal(JSON.parse((await call('Artifact', { action: 'read', url: made.url, path: 'notes.txt' })).content[0]!.text).content, 'hi');
  const shown = await call('ShowArtifact', { url: made.url });
  assert.equal(shown.structuredContent?.title, 'Web deck');
  assert.equal(shown.structuredContent?.type, 'design');
  assert.match(String(shown.structuredContent?.view_url), /\/a\/art_/);
});
