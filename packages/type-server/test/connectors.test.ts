/**
 * Connectors: the MCP client over stdio (against `fake-mcp-server.ts`) and
 * over Streamable HTTP (against a small in-test server), the configuration
 * file, and the owner-only `_api/mcp/*` routes.
 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ConnectorsHost, HttpMcpClient, McpError, StdioMcpClient, connectorsFile, createTypeServer, expandVariables, parseConnectors, type TypeServer } from '../src/index.ts';

const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'fake-mcp-server.ts');
const fake = (env?: Record<string, string>): { command: string; args: string[]; env?: Record<string, string> } => ({
  command: process.execPath,
  args: [FAKE],
  ...(env ? { env } : {}),
});

const rejectsWith = async (promise: Promise<unknown>, code: string, message?: RegExp): Promise<McpError> => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof McpError, `expected an McpError, got ${String(error)}`);
    assert.equal(error.code, code, error.message);
    if (message) assert.match(error.message, message);
    return error;
  }
  assert.fail(`expected ${code}`);
};

describe('MCP client over stdio', () => {
  let client: StdioMcpClient;

  before(() => {
    client = new StdioMcpClient('fake', fake({ FAKE_GREETING: 'hello' }));
  });

  after(async () => {
    await client.close();
  });

  it('initializes and lists every page of tools', async () => {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name),
      ['echo', 'fail', 'boom', 'slow', 'cancelled', 'ask', 'pid', 'env', 'crash'],
    );
    assert.deepEqual(tools[0], { name: 'echo', description: 'Answers its arguments.', inputSchema: { type: 'object' } });
    const state = await client.callTool('cancelled', {});
    assert.equal((state.structuredContent as { initialized: boolean }).initialized, true);
  });

  it('calls tools and keeps a tool error a result', async () => {
    const echoed = await client.callTool('echo', { q: 'rows', n: 3 });
    assert.deepEqual(echoed.structuredContent, { q: 'rows', n: 3 });
    assert.deepEqual(echoed.content, [{ type: 'text', text: '{"q":"rows","n":3}' }]);
    assert.equal(echoed.isError, undefined);
    const failed = await client.callTool('fail', {});
    assert.equal(failed.isError, true);
    assert.equal(failed.content[0]?.type, 'text');
    assert.deepEqual((await client.callTool('env', {})).content, [{ type: 'text', text: 'hello' }]);
  });

  it('maps a JSON-RPC error to upstream_error', async () => {
    await rejectsWith(client.callTool('boom', {}), 'upstream_error', /Boom/);
    await rejectsWith(client.callTool('nope', {}), 'upstream_error', /Unknown tool/);
  });

  it('answers the server\'s own requests (ping)', async () => {
    assert.deepEqual((await client.callTool('ask', {})).content, [{ type: 'text', text: 'pong received' }]);
  });

  it('times out, and cancels the call on the server', async () => {
    const error = await rejectsWith(client.callTool('slow', {}, { timeoutMs: 150 }), 'upstream_error', /did not answer tools\/call within/);
    assert.equal(error.retryable, true);
    const { structuredContent } = await client.callTool('cancelled', {});
    assert.equal((structuredContent as { cancelled: unknown[] }).cancelled.length, 1);
  });

  it('stops when its signal aborts', async () => {
    const controller = new AbortController();
    const call = client.callTool('slow', {}, { signal: controller.signal });
    setTimeout(() => controller.abort(new Error('stop')), 50);
    await assert.rejects(call, /stop/);
    const { structuredContent } = await client.callTool('cancelled', {});
    assert.equal((structuredContent as { cancelled: unknown[] }).cancelled.length, 2);
  });

  it('starts again after the server stopped', async () => {
    const before = (await client.callTool('pid', {})).structuredContent as { pid: number };
    await rejectsWith(client.callTool('crash', {}), 'server_not_connected', /crashing on purpose/);
    const after = (await client.callTool('pid', {})).structuredContent as { pid: number };
    assert.notEqual(after.pid, before.pid);
  });

  it('says when the command cannot start', async () => {
    const missing = new StdioMcpClient('missing', { command: join(tmpdir(), 'no-such-mcp-server') });
    await rejectsWith(missing.listTools(), 'server_not_connected', /Could not start missing/);
    await missing.close();
  });
});

describe('MCP client over Streamable HTTP', () => {
  let server: Server;
  let url: string;
  let sessions = 0;
  let active: string | null = null;
  const seen: { method: string; session: string | undefined; version: string | undefined }[] = [];

  const read = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  };

  before(async () => {
    server = createServer(async (req, res) => {
      if (req.headers.authorization !== 'Bearer good') {
        res.writeHead(401).end();
        return;
      }
      if (req.method === 'DELETE') {
        active = null;
        res.writeHead(200).end();
        return;
      }
      const message = await read(req);
      const method = String(message.method ?? '');
      const session = req.headers['mcp-session-id'] as string | undefined;
      seen.push({ method, session, version: req.headers['mcp-protocol-version'] as string | undefined });
      if (method === 'initialize') {
        active = `s${++sessions}`;
        res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': active });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'http', version: '1' } } }));
        return;
      }
      if (session !== active) {
        res.writeHead(404).end();
        return;
      }
      if (message.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      if (method === 'tools/list') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'search' }] } }));
        return;
      }
      // tools/call answers as an event stream, a notification first.
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 1 } })}\n\n`);
      const args = (message.params as { arguments: unknown }).arguments;
      res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'found' }], structuredContent: args } })}\n\n`);
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/mcp`;
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  });

  it('keeps the session, reads JSON and event-stream answers', async () => {
    const client = new HttpMcpClient('http', { url, headers: { Authorization: 'Bearer good' } });
    assert.deepEqual(await client.listTools(), [{ name: 'search' }]);
    const result = await client.callTool('search', { q: 'x' });
    assert.deepEqual(result, { content: [{ type: 'text', text: 'found' }], structuredContent: { q: 'x' } });
    const calls = seen.filter((s) => s.method !== 'initialize');
    assert.ok(calls.every((s) => s.session === 's1' && s.version === '2025-06-18'));
    assert.deepEqual(
      seen.map((s) => s.method),
      ['initialize', 'notifications/initialized', 'tools/list', 'tools/call'],
    );
    // The server forgets the session: the client connects again once.
    active = 'gone';
    assert.equal((await client.callTool('search', { q: 'y' })).content[0]?.type, 'text');
    assert.equal(sessions, 2);
    await client.close();
    assert.equal(active, null);
  });

  it('maps 401 to needs_reauth and an unreachable server to server_not_connected', async () => {
    await rejectsWith(new HttpMcpClient('http', { url }).listTools(), 'needs_reauth', /HTTP 401/);
    const closed = new HttpMcpClient('gone', { url: 'http://127.0.0.1:9/mcp' });
    await rejectsWith(closed.listTools(), 'server_not_connected', /Could not reach gone/);
  });
});

describe('connectors.json', () => {
  it('lives beside settings.json, or where the environment says', () => {
    assert.equal(connectorsFile({ OPEN_ARTIFACT_HOME: '/tmp/oa' }), '/tmp/oa/connectors.json');
    assert.equal(connectorsFile({ OPEN_ARTIFACT_CONNECTORS: '/etc/c.json', OPEN_ARTIFACT_HOME: '/tmp/oa' }), '/etc/c.json');
    assert.match(connectorsFile({}), /\.agents\/open-artifact\/connectors\.json$/);
  });

  it('reads stdio and HTTP servers, with variables, and says what is wrong with the rest', () => {
    const env = { TOKEN: 't0k' };
    assert.equal(expandVariables('a ${TOKEN} ${MISSING:-b} ${NONE}', env), 'a t0k b ');
    const servers = parseConnectors(
      JSON.stringify({
        mcpServers: {
          files: { command: 'node', args: ['s.js', '${TOKEN}'], env: { K: '${TOKEN}' } },
          tracker: { url: 'https://example.com/mcp', headers: { Authorization: 'Bearer ${TOKEN}' } },
          old: { url: 'https://example.com/sse', type: 'sse' },
          odd: { args: [] },
        },
      }),
      env,
    );
    assert.deepEqual(servers.get('files')?.config, { command: 'node', args: ['s.js', 't0k'], env: { K: 't0k' } });
    assert.deepEqual(servers.get('tracker')?.config, { url: 'https://example.com/mcp', headers: { Authorization: 'Bearer t0k' } });
    assert.match(servers.get('old')?.error ?? '', /SSE transport is not supported/);
    assert.match(servers.get('odd')?.error ?? '', /needs a command/);
    assert.throws(() => parseConnectors('{'));
  });

  it('lists servers, reloads the file when it changes, and stops what went', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'open-artifact-connectors-'));
    const file = join(dir, 'connectors.json');
    const host = new ConnectorsHost({ file });
    try {
      assert.deepEqual(await host.listTools(), []);
      await rejectsWith(host.callTool('fake', 'echo', {}), 'server_not_connected', /No connector named "fake"/);
      await writeFile(file, JSON.stringify({ mcpServers: { fake: fake(), off: { ...fake(), disabled: true }, bad: { command: '' } } }));
      const listed = await host.listTools();
      assert.deepEqual(
        listed.map((s) => [s.server, s.authStatus, s.tools?.length ?? 0]),
        [
          ['fake', 'connected', 9],
          ['off', 'disconnected', 0],
          ['bad', 'error', 0],
        ],
      );
      assert.deepEqual((await host.listTools('fake')).map((s) => s.server), ['fake']);
      assert.deepEqual(await host.listTools('nobody'), []);
      const pid = ((await host.callTool('fake', 'pid', {})).structuredContent as { pid: number }).pid;
      await rejectsWith(host.callTool('off', 'echo', {}), 'server_not_connected', /turned off/);
      // A changed entry starts a new process.
      await writeFile(file, JSON.stringify({ mcpServers: { fake: fake({ FAKE_GREETING: 'again' }) } }));
      assert.deepEqual((await host.callTool('fake', 'env', {})).content, [{ type: 'text', text: 'again' }]);
      assert.notEqual(((await host.callTool('fake', 'pid', {})).structuredContent as { pid: number }).pid, pid);
      await writeFile(file, '{ not json');
      await rejectsWith(host.callTool('fake', 'echo', {}), 'server_not_connected', /could not be read/);
    } finally {
      await host.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('the mcp page routes', () => {
  let dir: string;
  let server: TypeServer;
  let host: ConnectorsHost;
  let page: string;
  let id: string;
  const secret = 'test-secret';
  const guest = (cookie = '', init: RequestInit = {}): RequestInit => ({
    ...init,
    redirect: 'manual',
    headers: { 'x-test-guest': '1', ...(cookie ? { cookie } : {}), ...((init.headers as Record<string, string>) ?? {}) },
  });
  const call = (body: unknown, init: RequestInit = {}): Promise<Response> =>
    fetch(new URL('_api/mcp/call', page), { ...init, method: 'POST', headers: { 'content-type': 'application/json', ...((init.headers as Record<string, string>) ?? {}) }, body: JSON.stringify(body) });

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'open-artifact-mcp-routes-'));
    const assets = join(dir, 'assets');
    await mkdir(join(assets, 'editors', 'whiteboard'), { recursive: true });
    await writeFile(join(assets, 'editors', 'whiteboard', 'index.html'), '<!doctype html><title>Whiteboard</title>');
    await writeFile(join(assets, 'support.js'), '/* runtime */');
    await writeFile(join(dir, 'connectors.json'), JSON.stringify({ mcpServers: { fake: fake() } }));
    host = new ConnectorsHost({ file: join(dir, 'connectors.json') });
    server = createTypeServer({
      assetsDir: assets,
      secret,
      idleMs: 0,
      lanAddresses: () => [],
      isLocal: (req) => req.headers['x-test-guest'] === undefined,
      connectors: host,
    });
    await server.listen();
    const opened = await server.open({ root: join(dir, 'Board'), type: 'whiteboard', title: 'Board' });
    page = opened.url;
    id = opened.id;
  });

  after(async () => {
    await server.stop();
    await host.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('lets the owner list and call tools', async () => {
    const listed = (await (await fetch(new URL('_api/mcp/tools?server=fake', page))).json()) as { servers: { server: string; kind: string; authStatus: string; tools: { name: string }[] }[] };
    assert.equal(listed.servers.length, 1);
    assert.equal(listed.servers[0]!.kind, 'connector');
    assert.equal(listed.servers[0]!.authStatus, 'connected');
    assert.ok(listed.servers[0]!.tools.some((t) => t.name === 'echo'));
    const ok = await call({ server: 'fake', tool: 'echo', args: { a: 1 } });
    assert.equal(ok.status, 200);
    assert.deepEqual(((await ok.json()) as { structuredContent: unknown }).structuredContent, { a: 1 });
    const failed = await call({ server: 'fake', tool: 'fail', args: {} });
    assert.equal(((await failed.json()) as { isError: boolean }).isError, true);
  });

  it('answers failures with the connector codes', async () => {
    const missing = await call({ server: 'nobody', tool: 'echo', args: {} });
    assert.equal(missing.status, 404);
    assert.equal(((await missing.json()) as { code: string }).code, 'server_not_connected');
    const boom = await call({ server: 'fake', tool: 'boom', args: {} });
    assert.deepEqual(await boom.json(), { code: 'upstream_error', message: 'Boom' });
    const slow = await call({ server: 'fake', tool: 'slow', args: {}, timeoutMs: 100 });
    const body = (await slow.json()) as { code: string; retryable?: boolean };
    assert.equal(body.code, 'upstream_error');
    assert.equal(body.retryable, true);
    assert.equal((await call({ server: 'fake', args: {} })).status, 400);
  });

  it('cancels the call when the page gives up on it', async () => {
    const before = ((await (await call({ server: 'fake', tool: 'cancelled', args: {} })).json()) as { structuredContent: { cancelled: unknown[] } }).structuredContent.cancelled.length;
    await assert.rejects(call({ server: 'fake', tool: 'slow', args: {} }, { signal: AbortSignal.timeout(100) }));
    let count = before;
    for (let i = 0; i < 50 && count === before; i++) {
      await new Promise((done) => setTimeout(done, 20));
      count = ((await (await call({ server: 'fake', tool: 'cancelled', args: {} })).json()) as { structuredContent: { cancelled: unknown[] } }).structuredContent.cancelled.length;
    }
    assert.equal(count, before + 1);
  });

  it('refuses guests, whatever their role', async () => {
    const share = await fetch(new URL('/__open-artifact/share', page), {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id, lan: true }),
    });
    const view = (await share.json()) as { links: Record<string, { url: string }> };
    const join = await fetch(view.links.editor!.url, guest('', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'name=Eve' }));
    const cookie = join.headers.get('set-cookie')!.split(';')[0]!;
    const tools = await fetch(new URL('_api/mcp/tools', page), guest(cookie));
    assert.equal(tools.status, 403);
    assert.equal(((await tools.json()) as { code: string }).code, 'not_granted');
    const called = await fetch(
      new URL('_api/mcp/call', page),
      guest(cookie, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ server: 'fake', tool: 'echo', args: {} }) }),
    );
    assert.equal(called.status, 403);
    assert.equal(((await called.json()) as { code: string }).code, 'not_granted');
  });
});
