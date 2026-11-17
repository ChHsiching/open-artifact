/**
 * The capability broker end to end: the page's `createShellProvider`
 * (runtime) talking to the Shell's broker over fake windows, with a fake
 * backend behind the Shell.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { REWIRED_MESSAGE, STALE_MESSAGE, type CapToPage, type CapToShell } from '@open-artifact/protocol';
import { ArtifactError, createRuntime, createShellProvider, isArtifactError, type CapabilityProvider } from '@open-artifact/runtime';
import { brokerGen, call, resetBroker, rewire, want, type PagePost } from '../src/shell/broker.ts';

const SHELL = 'http://127.0.0.1:4800';
const PAGE = 'http://127.0.0.1:4720';
const BASE = `${PAGE}/design/tok/`;

type Listener = (event: unknown) => void;

interface Harness {
  provider: CapabilityProvider;
  sent: CapToShell[];
  /** What the backend saw. */
  calls: Array<{ method: string; args: unknown[] }>;
  /** Fires the backend's `files` listeners. */
  emitFiles(data: unknown): void;
  post: PagePost;
  /** The next calls from the page carry no click. */
  setActivation(active: boolean | null): void;
  /** Stops the Shell from answering. */
  mute(): void;
}

const saved = { window: (globalThis as { window?: unknown }).window, location: (globalThis as { location?: unknown }).location };
afterEach(() => {
  (globalThis as { window?: unknown }).window = saved.window;
  (globalThis as { location?: unknown }).location = saved.location;
  resetBroker();
});
beforeEach(() => resetBroker());

function harness(options: { fallback?: CapabilityProvider; answer?: boolean } = {}): Harness {
  const pageListeners = new Set<Listener>();
  const calls: Harness['calls'] = [];
  const filesListeners = new Set<(data: unknown) => void>();
  let activation: boolean | null = null;
  let answering = options.answer ?? true;
  const sent: CapToShell[] = [];

  const backend: CapabilityProvider = {
    get(name) {
      const record = (method: string) => (...args: unknown[]) => {
        calls.push({ method: `${name}.${method}`, args });
        return Promise.resolve(method === 'readBytes' ? new Uint8Array([1, 2, 3]) : method === 'list' ? { 'project/a': { sha256: 'x', size: 1 } } : { ok: method, args });
      };
      switch (name) {
        case 'artifact':
          return {
            id: 'art-1',
            title: record('title'),
            list: record('list'),
            readText: record('readText'),
            readBytes: record('readBytes'),
            publish: async (batch: unknown) => {
              calls.push({ method: 'artifact.publish', args: [batch] });
              throw new ArtifactError('conflict', 'stale', [{ path: 'project/a', expected: 'x', actual: 'y' }]);
            },
            onChange: (listener: (data: unknown) => void) => {
              filesListeners.add(listener);
              return () => filesListeners.delete(listener);
            },
          } as never;
        case 'user':
          return { me: async () => ({ id: 'owner', name: 'You', role: 'owner' }) } as never;
        case 'agent':
          return { send: record('send'), status: record('status'), onStatus: () => () => {} } as never;
        default:
          return null;
      }
    },
  };
  resetBroker(() => backend);

  const pageWindow = {
    postMessage(message: unknown) {
      queueMicrotask(() => {
        for (const listener of pageListeners) listener({ source: shellWindow, origin: SHELL, data: structuredClone(message) });
      });
    },
  };
  const post: PagePost = (message) => pageWindow.postMessage(message);
  const shellWindow = {
    postMessage(message: CapToShell) {
      sent.push(message);
      if (!answering) return;
      const event = { source: pageWindow, origin: PAGE, data: structuredClone(message), ...(activation === null ? {} : { userActivation: { isActive: activation } }) };
      if (message.openArtifact === 'cap_want') void want(message, PAGE, post);
      else void call(message, event as unknown as MessageEvent, post);
    },
  };
  (globalThis as { window?: unknown }).window = {
    parent: shellWindow,
    addEventListener: (_type: string, fn: Listener) => pageListeners.add(fn),
    removeEventListener: (_type: string, fn: Listener) => pageListeners.delete(fn),
  };
  (globalThis as { location?: unknown }).location = { href: BASE };
  const provider = createShellProvider({
    origin: SHELL,
    target: shellWindow as unknown as Window,
    fallback: options.fallback ?? { get: () => null },
    wantTimeoutMs: 50,
  });
  return {
    provider,
    sent,
    calls,
    post,
    emitFiles: (data) => {
      for (const listener of filesListeners) listener(data);
    },
    setActivation: (active) => {
      activation = active;
    },
    mute: () => {
      answering = false;
    },
  };
}

test('a granted capability runs through the Shell', async () => {
  const h = harness();
  const runtime = createRuntime(h.provider);
  const artifact = await runtime.use('artifact');
  assert.ok(artifact);
  assert.equal(artifact.id, 'art-1');
  assert.deepEqual(await artifact.list(), { 'project/a': { sha256: 'x', size: 1 } });
  const bytes = await artifact.readBytes('project/a');
  assert.deepEqual([...bytes], [1, 2, 3]);
  assert.deepEqual(h.calls.map((c) => c.method), ['artifact.list', 'artifact.readBytes']);
  const want = h.sent.find((m) => m.openArtifact === 'cap_want');
  assert.deepEqual(want, { openArtifact: 'cap_want', cap: 'artifact', protocol: 1, base: BASE });
});

test('user.me is answered from the grant, without a call', async () => {
  const h = harness();
  const user = await createRuntime(h.provider).use('user');
  assert.deepEqual(await user!.me(), { id: 'owner', name: 'You', role: 'owner' });
  assert.equal(h.sent.filter((m) => m.openArtifact === 'cap').length, 0);
});

test('errors come back as ArtifactError with their paths', async () => {
  const h = harness();
  const artifact = await createRuntime(h.provider).use('artifact');
  await assert.rejects(artifact!.publish({ 'project/a': { content: 'x', ifMatch: 'x' } }), (error: unknown) => {
    assert.ok(isArtifactError(error, 'conflict'));
    assert.deepEqual((error as ArtifactError).paths, [{ path: 'project/a', expected: 'x', actual: 'y' }]);
    return true;
  });
});

test('an ungranted capability resolves to null', async () => {
  const h = harness();
  assert.equal(await createRuntime(h.provider).use('downloads'), null);
});

test('a base on another origin is refused', async () => {
  resetBroker(() => ({ get: () => ({}) as never }));
  const answers: CapToPage[] = [];
  await want({ openArtifact: 'cap_want', cap: 'artifact', protocol: 1, base: 'http://evil.example/' }, PAGE, (m) => answers.push(m));
  assert.equal(answers[0]?.openArtifact, 'cap_grant');
  assert.equal((answers[0] as { ok: boolean }).ok, false);
});

test('only listed methods run', async () => {
  const h = harness();
  await createRuntime(h.provider).use('artifact');
  const answers: CapToPage[] = [];
  await call({ openArtifact: 'cap', id: 'x1', cap: 'artifact', method: 'constructor', args: [], gen: brokerGen() }, null, (m) => answers.push(m));
  assert.equal((answers[0] as { error?: { code: string } }).error?.code, 'invalid');
});

test('events of a granted capability reach the page', async () => {
  const h = harness();
  const artifact = await createRuntime(h.provider).use('artifact');
  const seen: unknown[] = [];
  artifact!.onChange((event) => seen.push(event));
  h.emitFiles({ changes: { 'project/a': 'y' }, author: 'agent' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(seen, [{ changes: { 'project/a': 'y' }, author: 'agent' }]);
});

test('agent.send without a click is staged, with one it is sent', async () => {
  const h = harness();
  const agent = await createRuntime(h.provider).use('agent');
  h.setActivation(false);
  await agent!.send({ text: 'fix it' });
  h.setActivation(true);
  await agent!.send({ text: 'fix it' }, { deliver: 'send' });
  assert.deepEqual(
    h.calls.map((c) => c.args[1]),
    [{ deliver: 'stage' }, { deliver: 'send' }],
  );
});

test('a rewire cuts pending calls and the Shell refuses the old generation', async () => {
  const h = harness();
  const artifact = await createRuntime(h.provider).use('artifact');
  h.mute();
  const pending = artifact!.title();
  rewire(h.post);
  await assert.rejects(pending, (error: unknown) => isArtifactError(error, 'unavailable') && (error as Error).message === REWIRED_MESSAGE);
  const answers: CapToPage[] = [];
  await call({ openArtifact: 'cap', id: 'old', cap: 'artifact', method: 'title', args: [], gen: brokerGen() - 1 }, null, (m) => answers.push(m));
  assert.deepEqual(answers[0], { openArtifact: 'cap_r', id: 'old', error: { code: 'unavailable', message: STALE_MESSAGE } });
});

test('a Shell that never grants leaves the page on its fallback', async () => {
  const fallback = { get: (name: string) => (name === 'user' ? ({ me: async () => ({ id: 'fb', name: 'Fallback', role: 'owner' }) } as never) : null) };
  const h = harness({ fallback: fallback as CapabilityProvider, answer: false });
  const user = await createRuntime(h.provider).use('user');
  assert.equal((await user!.me()).id, 'fb');
});
