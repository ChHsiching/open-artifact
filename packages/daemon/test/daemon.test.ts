import { TEST_HOME, tempDir, until } from './helpers.ts';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import {
  HARNESS_PATH,
  HARNESS_SUBPROTOCOL,
  LIBRARY_ROUTES,
  artifactIdOf,
  type DaemonState,
  type ShellBoot,
  type ToolCallResult,
  type WakeDeliverParams,
} from '@open-artifact/protocol';
import { HarnessClient, api, readDaemon } from '../src/client.ts';
import { BOOT_PLACEHOLDER, startDaemon, type Daemon } from '../src/daemon.ts';
import { files } from '../src/paths.ts';
import { sessionKeyOf } from '../src/store.ts';

let daemon: Daemon;
let state: DaemonState;
const shellDir = tempDir('open-artifact-shell-');
const workspace = tempDir('open-artifact-ws-');

before(async () => {
  writeFileSync(join(shellDir, 'index.html'), `<!doctype html><title>shell</title><script>window.__OPEN_ARTIFACT_BOOT__ = ${BOOT_PLACEHOLDER};</script>`);
  daemon = await startDaemon({ port: 0, quiet: true, shellDir, homeDir: join(shellDir, 'no-home') });
  state = (await readDaemon())!;
});

after(() => daemon.close());

/** POST /mcp with the daemon token. */
async function mcp(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${state.url}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}`, ...headers },
    body: JSON.stringify(body),
  });
}

/** Creates a `design` artifact through the tools as `harness`/`session`. */
async function createDesign(title: string, session: string, harness = 'dsh'): Promise<string> {
  const made = await api<ToolCallResult>(state, 'tools.call', {
    name: 'Artifact',
    arguments: { action: 'publish', type_url: 'open-artifact://type/design', title },
    caller: { harness, session, workspace },
  });
  assert.equal(made.error, undefined, JSON.stringify(made.error));
  return artifactIdOf(String(made.url))!;
}

test('daemon.json and health', async () => {
  const written = JSON.parse(readFileSync(files.daemon(), 'utf8')) as DaemonState;
  assert.equal(written.port, daemon.port);
  assert.ok(files.daemon().startsWith(TEST_HOME));
  const health = await (await fetch(`${state.url}/__open-artifact/health`)).json();
  assert.deepEqual(health, { openArtifact: 1, version: written.version });
});

test('MCP: tools/list needs the token and lists the tools', async () => {
  const refused = await fetch(`${state.url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
  assert.equal(refused.status, 401);
  const response = await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { result: { tools: Array<{ name: string }> } };
  const names = body.result.tools.map((t) => t.name);
  for (const name of ['Artifact', 'ArtifactData', 'ArtifactComments']) assert.ok(names.includes(name), name);
});

test('Artifact quickstart and publish make a design artifact from the built-in root', async () => {
  const call = async (args: Record<string, unknown>): Promise<ToolCallResult> => {
    const response = await mcp(
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'Artifact', arguments: args } },
      { 'X-Open-Artifact-Harness': 'dsh', 'X-Open-Artifact-Session': 'mcp-1', 'X-Open-Artifact-Workspace': encodeURIComponent(workspace) },
    );
    const body = (await response.json()) as { result: { content: Array<{ text: string }>; isError: boolean } };
    assert.equal(body.result.isError, false, body.result.content[0]?.text);
    return JSON.parse(body.result.content[0]!.text) as ToolCallResult;
  };
  const quick = await call({ action: 'quickstart', intent: 'design' });
  const types = quick.types as Array<{ id: string; scope: string; type_url: string }>;
  assert.deepEqual(
    types.map((t) => t.id),
    ['design', 'slides', 'whiteboard'],
    'only allow-listed built-in types',
  );
  assert.equal(types[0]!.scope, 'builtin');

  const made = await call({ action: 'publish', type_url: types[0]!.type_url, title: 'Landing page' });
  const id = artifactIdOf(String(made.url))!;
  const record = daemon.store.require(id);
  assert.equal(record.type, 'design');
  assert.equal(record.typeSource, 'builtin');
  assert.ok(record.root.startsWith(join(workspace, 'artifacts')), record.root);
  assert.deepEqual(record.owner, { harness: 'dsh', session: 'mcp-1', workspace });
  assert.match(String(made.instructions), /# This artifact/);
  assert.ok(String(made.instructions).length > 500, 'carries the SKILL.md body');
});

test('MCP from a plugin folder: the session’s folder, from its hook or its Codex thread record', async () => {
  // Codex starts a plugin's MCP server in the plugin's folder: the bridge names no folder, only the thread in `_meta`.
  const call = async (thread: string, args: Record<string, unknown>): Promise<ToolCallResult> => {
    const response = await mcp(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'Artifact', arguments: args, _meta: { threadId: thread } } },
      { 'X-Open-Artifact-Harness': 'codex' },
    );
    const body = (await response.json()) as { result: { content: Array<{ text: string }>; isError: boolean } };
    assert.equal(body.result.isError, false, body.result.content[0]?.text);
    return JSON.parse(body.result.content[0]!.text) as ToolCallResult;
  };
  const publish = async (thread: string, title: string): Promise<string> => {
    const types = (await call(thread, { action: 'quickstart', intent: 'design' })).types as Array<{ type_url: string }>;
    const made = await call(thread, { action: 'publish', type_url: types[0]!.type_url, title });
    return daemon.store.require(artifactIdOf(String(made.url))!).root;
  };

  // A trusted hook said where the thread works.
  const hooked = tempDir('open-artifact-hooked-');
  await api(state, 'hook', { event: 'SessionStart', harness: 'codex', session: 'thread-hooked', workspace: hooked, pids: [] });
  // A later hook that does not know the folder keeps it.
  await api(state, 'hook', { event: 'Stop', harness: 'codex', session: 'thread-hooked', workspace: null, pids: [] });
  assert.ok((await publish('thread-hooked', 'Hooked')).startsWith(join(hooked, 'artifacts')));

  // No hook ran (Codex runs plugin hooks only once trusted): the thread's rollout file names its folder.
  const codexHome = tempDir('open-artifact-codex-');
  const rolled = tempDir('open-artifact-rolled-');
  const day = join(codexHome, 'sessions', '2026', '11', '17');
  mkdirSync(day, { recursive: true });
  writeFileSync(join(day, 'rollout-2026-11-17T10-00-00-thread-rolled.jsonl'), `${JSON.stringify({ type: 'session_meta', payload: { id: 'thread-rolled', cwd: rolled } })}\n{"type":"x"}\n`);
  process.env.CODEX_HOME = codexHome;
  try {
    assert.ok((await publish('thread-rolled', 'Rolled')).startsWith(join(rolled, 'artifacts')));
  } finally {
    delete process.env.CODEX_HOME;
  }
});

test('GET /a/<id> injects the boot object into the Shell', async () => {
  const id = await createDesign('</script><b>x</b>', 'boot-1');
  const response = await fetch(`${state.url}/a/${id}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(!html.includes(BOOT_PLACEHOLDER));
  assert.ok(!html.includes('</script><b>'), 'the title is escaped');
  const json = /window\.__OPEN_ARTIFACT_BOOT__ = (.*);<\/script>/.exec(html)![1]!;
  assert.ok(json.includes('\\u003c/script>'));
  const boot = JSON.parse(json) as ShellBoot;
  assert.equal(boot.id, id);
  assert.equal(boot.type, 'design');
  assert.equal(boot.empty, true, 'no project/canvas.json yet');
  assert.equal(boot.page, null);
  assert.match(String(boot.prompt), new RegExp(`^Take over artifact open-artifact://artifact/${id} \\(Design \\(canvas\\) "`));
  assert.match(String(boot.prompt), /call Artifact \{action: "adopt", url: "open-artifact:\/\/artifact\//);
  assert.equal(boot.agentName, 'Agent');
  assert.equal((await fetch(`${state.url}/a/art_nothere`)).status, 404);
  assert.equal((await fetch(`${state.url}/_open-artifact/shell/../daemon.json`)).status, 404);
  assert.equal((await fetch(`${state.url}/_open-artifact/shell/index.html`)).status, 200);
});

test('Harness API: hello with a bad token is refused', async () => {
  const ws = new WebSocket(`${state.url.replace(/^http/, 'ws')}${HARNESS_PATH}`, [HARNESS_SUBPROTOCOL]);
  await new Promise<void>((resolveOpen, rejectOpen) => {
    ws.addEventListener('open', () => resolveOpen(), { once: true });
    ws.addEventListener('error', () => rejectOpen(new Error('no connection')), { once: true });
  });
  const answer = new Promise<{ error?: { code: number; data?: { code?: string } } }>((resolveAnswer) =>
    ws.addEventListener('message', (event) => resolveAnswer(JSON.parse(String(event.data))), { once: true }),
  );
  ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'hello', params: { harness: 'dsh', caps: {}, token: 'wrong' } }));
  const reply = await answer;
  assert.ok(reply.error, 'an error answer');
  ws.close();
});

test('wake: delivered live to a connected HarnessClient', async () => {
  const delivered: WakeDeliverParams[] = [];
  const client = new HarnessClient({
    harness: 'dsh',
    caps: { wake: {} },
    autoStart: false,
    handlers: {
      'wake.deliver': (params) => {
        delivered.push(params);
        return { status: 'delivered' };
      },
    },
  });
  try {
    await client.connect();
    await client.attach({ session: 'live-1', workspace, status: 'idle' });
    const id = await createDesign('Live', 'live-1');
    const result = await api<{ via: string }>(state, LIBRARY_ROUTES.ask, { id, text: 'Please make it blue' });
    assert.equal(result.via, 'live');
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0]!.session, 'live-1');
    assert.equal(delivered[0]!.artifactId, id);
    assert.match(delivered[0]!.text, /Please make it blue/);
    assert.match(delivered[0]!.text, /sent to agent/i);
    const info = await api<{ sessions: Array<{ session: string; live: boolean }> }>(state, 'harnesses');
    assert.ok(info.sessions.some((s) => s.session === 'live-1' && s.live));
  } finally {
    client.close();
  }
});

test('wake: with no adapter connected it waits in the inbox', async () => {
  const id = await createDesign('Offline', 'gone-1');
  const result = await api<{ via: string }>(state, LIBRARY_ROUTES.ask, { id, text: 'Are you there?' });
  assert.equal(result.via, 'inbox');
  const key = sessionKeyOf({ harness: 'dsh', session: 'gone-1', workspace })!;
  const waiting = daemon.inbox.peek(key);
  assert.equal(waiting.length, 1);
  assert.match(waiting[0]!.text, /Are you there\?/);
  // The polling API hands it over on attach.
  const attached = await api<{ key: string; inbox: Array<{ text: string }> }>(state, 'session.attach', { harness: 'dsh', session: 'gone-1', workspace });
  assert.equal(attached.key, key);
  assert.equal(attached.inbox.length, 1);
  assert.equal(daemon.inbox.count(key), 0);
  await api(state, 'session.detach', { harness: 'dsh', session: 'gone-1', workspace });
});

test('Type API: wake with the type token', async () => {
  const id = await createDesign('Type wake', 'type-1');
  const url = `${state.url}/api/open-artifact.type.wake`;
  const body = JSON.stringify({ id, threads: [{ id: 'th_1', where: 'Board "Home"', messages: [{ from: 'user', text: 'Tighten the heading' }] }] });
  const refused = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` }, body });
  assert.equal(refused.status, 401, 'the daemon token is not a type token');
  const otherType = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${daemon.typeToken('other')}` }, body });
  assert.equal(otherType.status, 404, "another type's artifact is as good as none");
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${daemon.typeToken('design')}` }, body });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'inbox', via: 'inbox' });
  const waiting = daemon.inbox.peek(sessionKeyOf({ harness: 'dsh', session: 'type-1', workspace })!);
  assert.match(waiting.at(-1)!.text, /Tighten the heading/);
  assert.match(waiting.at(-1)!.text, /th_1/);

  const presence = await fetch(`${state.url}/api/open-artifact.type.presence?id=${id}`, { headers: { Authorization: `Bearer ${daemon.typeToken('design')}` } });
  assert.deepEqual(await presence.json(), { presence: 'offline', canSend: true, canSendSession: true, busy: false, agentName: 'Agent' });
});

test('Library API: writes need the token or the same origin', async () => {
  const id = await createDesign('Rename me', 'lib-1');
  const anonymous = await fetch(`${state.url}/api/open-artifact.${LIBRARY_ROUTES.update}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title: 'x' }) });
  assert.equal(anonymous.status, 403);
  const foreign = await fetch(`${state.url}/api/open-artifact.${LIBRARY_ROUTES.update}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
    body: JSON.stringify({ id, title: 'x' }),
  });
  assert.equal(foreign.status, 403);
  const renamed = await api<{ title: string; pinned: boolean }>(state, LIBRARY_ROUTES.update, { id, title: 'Renamed', pinned: true });
  assert.equal(renamed.title, 'Renamed');
  assert.equal(renamed.pinned, true);
  const list = await api<{ artifacts: Array<{ id: string }> }>(state, 'artifacts');
  assert.equal(list.artifacts[0]!.id, id, 'pinned first');
  // fetch cannot set Host: a plain request can (a DNS-rebound page would send its own name).
  const misdirected = await new Promise<number>((resolveStatus, rejectStatus) => {
    const req = request(`${state.url}/__open-artifact/health`, { headers: { Host: 'evil.example' } }, (res) => {
      res.resume();
      resolveStatus(res.statusCode ?? 0);
    });
    req.on('error', rejectStatus);
    req.end();
  });
  assert.equal(misdirected, 421);
});
