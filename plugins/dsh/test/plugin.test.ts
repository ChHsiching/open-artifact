/**
 * The server half against a fake DSH context and a fake daemon client: tool parameter schemas, tool calls, session
 * attach and status, the wake message and where `wake.deliver` puts it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { HarnessClientOptions } from '@open-artifact/daemon/client';
import { AGENT_PROMPT, TOOL_SCHEMAS, WAKE_SOURCE_KIND, type ToolInputSchema, type WakeDeliverParams, type WakeSource } from '@open-artifact/protocol';
import type { DshAgent, DshContext, DshEvents, DshQuestionWait, DshRoute, DshSkillProvider, DshToolDefinition, DshUserMessage } from '../src/server/dsh.ts';
import { dshParameters, setup, ToolError, wakeMessage, type HarnessClientLike } from '../src/server/index.ts';

// ---------------------------------------------------------------- fakes

type Call = { name: string; args: Record<string, unknown>; caller: unknown };

/** A daemon client that records what it is asked. */
function fakeClient(answer: (call: Call) => unknown = () => ({ ok: true })) {
  const log = { connected: 0, closed: 0, attach: [] as unknown[], status: [] as unknown[], calls: [] as Call[] };
  let options: HarnessClientOptions | undefined;
  const client = {
    async connect() {
      log.connected++;
    },
    async attach(params: unknown) {
      log.attach.push(params);
      return {};
    },
    async status(params: unknown) {
      log.status.push(params);
      return {};
    },
    async callTool(name: string, args: Record<string, unknown>, caller: unknown) {
      const call = { name, args, caller };
      log.calls.push(call);
      return answer(call);
    },
    close() {
      log.closed++;
    },
  } as unknown as HarnessClientLike;
  const create = (o: HarnessClientOptions) => {
    options = o;
    return client;
  };
  return { log, create, options: () => options! };
}

/** A DSH agent that records what it is handed. */
function fakeAgent(id: string, status: string, withCancel = true) {
  const got = { followup: [] as DshUserMessage[], inject: [] as DshUserMessage[], cancel: [] as unknown[] };
  const agent: DshAgent = {
    id,
    status,
    session: {},
    followup: (m) => void got.followup.push(m),
    inject: (m) => void got.inject.push(m),
    ...(withCancel ? { cancel: (cause: unknown, options: unknown) => void got.cancel.push([cause, options]) } : {}),
  } as DshAgent;
  return { agent, got };
}

interface FakeHost {
  agents?: Map<string, DshAgent>;
  resolveAgent?: (id: string) => DshAgent | undefined;
  waits?: Map<DshAgent, Map<string, DshQuestionWait>>;
  cwd?: string;
}

/** A DSH context with the services the plugin reads. */
function fakeContext(host: FakeHost = {}) {
  const tools = new Map<string, DshToolDefinition>();
  const routes: DshRoute[] = [];
  const skills: DshSkillProvider[] = [];
  const sections: unknown[] = [];
  const listeners: { [K in keyof DshEvents]?: DshEvents[K][] } = {};
  const disposers: Array<() => void> = [];
  const services: Record<string, unknown> = {
    agents: { get: (id: string) => host.agents?.get(id) },
    sessionController: host.resolveAgent ? { resolveAgent: host.resolveAgent } : undefined,
    userQuestions: { waits: { get: (agent: DshAgent) => host.waits?.get(agent) } },
    workingDirectory: { ensure: async () => host.cwd ?? '/work' },
    systemPrompt: { section: (s: unknown) => sections.push(s) },
  };
  const ctx: DshContext = {
    tools: { register: (tool) => tools.set(tool.name, tool) },
    get: (name) => services[name],
    on: (name, listener) => {
      (listeners[name] ??= [] as never[]).push(listener as never);
      return () => {};
    },
    inject: (deps, callback) =>
      callback(
        (deps.includes('skills')
          ? { skills: { registerProvider: (provider: () => DshSkillProvider) => skills.push(provider()) } }
          : { connection: { fetch: { register: (route: DshRoute) => routes.push(route) } } }) as never,
      ),
    effect: (execute) => void disposers.push(execute()),
    logger: { warn: () => {}, info: () => {} },
  };
  const emit = <K extends keyof DshEvents>(name: K, ...args: Parameters<DshEvents[K]>) => {
    for (const listener of listeners[name] ?? []) (listener as (...a: unknown[]) => void)(...args);
  };
  return { ctx, tools, routes, skills, sections, emit, dispose: () => disposers.forEach((d) => d()) };
}

const source = (over: Partial<WakeSource> = {}): WakeSource => ({
  kind: WAKE_SOURCE_KIND,
  artifactId: 'a1',
  url: 'open-artifact://artifact/a1',
  title: 'Landing page',
  root: '/work/landing',
  viewUrl: 'http://127.0.0.1:4100/a/a1/',
  threads: [{ id: 't1', where: 'Hero', text: 'Bigger, please' }],
  requests: [],
  summary: 'A comment on Landing page',
  ...over,
});

const wake = (session: string | null): WakeDeliverParams => ({
  session,
  workspace: '/work',
  artifact: 'open-artifact://artifact/a1',
  artifactId: 'a1',
  text: '[Open Artifact]\nA comment on Landing page: Bigger, please',
  source: source(),
});

const deliver = (options: HarnessClientOptions, params: WakeDeliverParams) => options.handlers!['wake.deliver']!(params);

// ---------------------------------------------------------------- tests

describe('dshParameters', () => {
  it('keeps primitive properties and loosens objects and arrays to described, untyped values', () => {
    const schema: ToolInputSchema = {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'What to do', enum: ['a', 'b'] },
        count: { type: 'integer' },
        args: { type: 'object', description: 'Anything' },
        files: { type: 'array', description: 'Paths', items: { type: 'string' } },
      },
      required: ['action'],
    } as ToolInputSchema;
    assert.deepEqual(dshParameters(schema), {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'What to do', enum: ['a', 'b'] },
        count: { type: 'integer' },
        args: { description: 'Anything' },
        files: { description: 'Paths' },
      },
      required: ['action'],
    });
  });

  it('turns every protocol tool schema into one DSH takes', () => {
    for (const [tool, schema] of Object.entries(TOOL_SCHEMAS)) {
      const out = dshParameters(schema);
      assert.equal(out.type, 'object', tool);
      assert.deepEqual(Object.keys(out.properties), Object.keys(schema.properties), tool);
      for (const prop of Object.values(out.properties)) {
        assert.ok(prop.type === undefined || ['string', 'number', 'integer', 'boolean'].includes(prop.type), tool);
      }
      if (schema.required?.length) assert.deepEqual(out.required, [...schema.required]);
      else assert.equal(out.required, undefined);
    }
  });
});

describe('wakeMessage', () => {
  it('is a frozen user message whose source is the structured copy, marked as a notice', () => {
    const message = wakeMessage({ text: 'hello', source: source() });
    assert.equal(message.role, 'user');
    assert.deepEqual(message.content, [{ type: 'text', text: 'hello' }]);
    assert.equal(message.source.kind, WAKE_SOURCE_KIND);
    assert.equal(message.source.form, 'notice');
    assert.equal(message.source.summary, 'A comment on Landing page');
    assert.equal((message.source as Record<string, unknown>).artifactId, 'a1');
    assert.ok(Object.isFrozen(message) && Object.isFrozen(message.source) && Object.isFrozen(message.content));
    assert.notEqual(wakeMessage({ text: 'x' }).id, message.id);
  });

  it('summarises by the first line that is not a bracketed header when the source has no summary', () => {
    const message = wakeMessage({ text: '[Open Artifact]\n\nPlease fix the header\nmore', source: null });
    assert.equal(message.source.summary, 'Please fix the header');
    assert.equal(message.source.kind, WAKE_SOURCE_KIND);
  });
});

describe('setup', () => {
  it('registers the three tools, the prompt section and the page routes, and connects while applied', () => {
    const { ctx, tools, routes, skills, sections, dispose } = fakeContext();
    const client = fakeClient();
    setup(ctx, {}, { createClient: client.create });
    assert.deepEqual(skills.map((s) => s.name), ['dsh-open-artifact']);
    assert.ok(routes.some((r) => r.path === '/api/open-artifact.artifacts.host-opens'));
    assert.deepEqual([...tools.keys()].sort(), Object.keys(TOOL_SCHEMAS).sort());
    assert.deepEqual(sections, [{ name: 'open-artifact', order: 900, text: AGENT_PROMPT, interpolate: false }]);
    assert.ok(routes.length > 0 && routes.every((r) => r.path.startsWith('/api/open-artifact.artifacts')));
    const options = client.options();
    assert.equal(options.harness, 'dsh');
    assert.equal(options.autoStart, true);
    assert.deepEqual(options.caps, { wake: { resume: true }, open: true, agentName: 'Agent' });
    assert.equal(client.log.connected, 1);
    dispose();
    assert.equal(client.log.closed, 1);
  });

  it('calls a tool as the session, attaching the session once with its folder', async () => {
    const { ctx, tools } = fakeContext({ cwd: '/work/s1' });
    const client = fakeClient(() => ({ content: 'done' }));
    setup(ctx, {}, { createClient: client.create });
    const exec = { agent: { id: 's1', status: 'running' } };
    const out = await tools.get('Artifact')!.execute({ action: 'list' }, exec);
    await tools.get('ArtifactData')!.execute(undefined, exec);
    assert.deepEqual(out, { content: 'done' });
    assert.deepEqual(client.log.attach, [{ session: 's1', workspace: '/work/s1', status: 'running' }]);
    assert.deepEqual(client.log.calls, [
      { name: 'Artifact', args: { action: 'list' }, caller: { session: 's1', workspace: '/work/s1' } },
      { name: 'ArtifactData', args: {}, caller: { session: 's1', workspace: '/work/s1' } },
    ]);
  });

  it("throws the daemon's error with its fix and code", async () => {
    const { ctx, tools } = fakeContext();
    const client = fakeClient(() => ({ error: { code: 'not_found', message: 'No such artifact.', fix: 'List them first.' } }));
    setup(ctx, {}, { createClient: client.create });
    await assert.rejects(tools.get('Artifact')!.execute({ action: 'read' }, { agent: { id: 's1' } }), (error: unknown) => {
      assert.ok(error instanceof ToolError);
      assert.equal(error.code, 'not_found');
      assert.equal(error.message, 'No such artifact. List them first.');
      return true;
    });
  });

  it("passes an attached session's agent status on, and nobody else's", async () => {
    const { ctx, tools, emit } = fakeContext();
    const client = fakeClient();
    setup(ctx, {}, { createClient: client.create });
    emit('agent/status', { agent: { id: 's1' }, status: 'idle' });
    assert.deepEqual(client.log.status, []);
    await tools.get('Artifact')!.execute({}, { agent: { id: 's1', status: 'running' } });
    emit('agent/status', { agent: { id: 's1' }, status: 'idle' });
    emit('agent/status', { agent: { id: 's1' }, status: 'thinking' });
    emit('agent/status', { agent: { id: 's2' }, status: 'idle' });
    assert.deepEqual(client.log.status, [{ session: 's1', workspace: '/work', status: 'idle' }]);
  });
});

describe('wake.deliver', () => {
  it('wakes an idle agent with a new turn', async () => {
    const { agent, got } = fakeAgent('s1', 'idle');
    const { ctx } = fakeContext({ agents: new Map([['s1', agent]]) });
    const client = fakeClient();
    setup(ctx, {}, { createClient: client.create });
    assert.deepEqual(await deliver(client.options(), wake('s1')), { status: 'resumed' });
    assert.equal(got.followup.length, 1);
    assert.equal(got.inject.length, 0);
    assert.equal(got.followup[0]!.source.kind, WAKE_SOURCE_KIND);
    assert.equal(got.followup[0]!.content[0]!.text, wake('s1').text);
    // Woken, the session is attached as running.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(client.log.attach, [{ session: 's1', workspace: '/work', status: 'running' }]);
  });

  it('hands a busy agent the message at its next step', async () => {
    const { agent, got } = fakeAgent('s1', 'running');
    const { ctx } = fakeContext({ agents: new Map([['s1', agent]]) });
    const client = fakeClient();
    setup(ctx, {}, { createClient: client.create });
    assert.deepEqual(await deliver(client.options(), wake('s1')), { status: 'delivered' });
    assert.equal(got.inject.length, 1);
    assert.equal(got.followup.length, 0);
    assert.equal(got.cancel.length, 0);
  });

  it('ends a blocking question: the turn is cancelled, keeping the inbox, and the message starts the next', async () => {
    const { agent, got } = fakeAgent('s1', 'running');
    const { ctx, emit } = fakeContext({ agents: new Map([['s1', agent]]) });
    const client = fakeClient();
    setup(ctx, {}, { createClient: client.create });
    emit('session/event', agent.session!, { type: 'tool/call', data: { name: 'ask_user_question', callId: 'c1' } });
    assert.deepEqual(await deliver(client.options(), wake('s1')), { status: 'resumed' });
    assert.deepEqual(got.cancel, [[{ kind: 'user' }, { keepInbox: true }]]);
    assert.equal(got.followup.length, 1);
    assert.equal(got.inject.length, 0);
  });

  it('no longer counts a question once it is answered', async () => {
    const { agent, got } = fakeAgent('s1', 'running');
    const { ctx, emit } = fakeContext({ agents: new Map([['s1', agent]]) });
    const client = fakeClient();
    setup(ctx, {}, { createClient: client.create });
    emit('session/event', agent.session!, { type: 'tool/call', data: { name: 'ask_user_question', callId: 'c1' } });
    emit('session/event', agent.session!, { type: 'tool/result', data: { message: { toolCallId: 'c1' } } });
    assert.deepEqual(await deliver(client.options(), wake('s1')), { status: 'delivered' });
    assert.equal(got.cancel.length, 0);
  });

  it('ends a timed question as its timeout would, and the turn reads the message next', async () => {
    const { agent, got } = fakeAgent('s1', 'running');
    const closed: unknown[] = [];
    const timeout = { kind: 'timeout' };
    const waits = new Map([[agent, new Map<string, DshQuestionWait>([['q1', { timeout, close: (reason) => closed.push(reason) }]])]]);
    const { ctx } = fakeContext({ agents: new Map([['s1', agent]]), waits });
    const client = fakeClient();
    setup(ctx, {}, { createClient: client.create });
    assert.deepEqual(await deliver(client.options(), wake('s1')), { status: 'resumed' });
    assert.deepEqual(closed, [timeout]);
    assert.equal(got.inject.length, 1);
    assert.equal(got.cancel.length, 0);
  });

  it('resumes a session with no live agent through the session controller', async () => {
    const { agent, got } = fakeAgent('s9', 'idle');
    const { ctx } = fakeContext({ resolveAgent: (id) => (id === 's9' ? agent : undefined) });
    const client = fakeClient();
    setup(ctx, {}, { createClient: client.create });
    assert.deepEqual(await deliver(client.options(), wake('s9')), { status: 'resumed' });
    assert.equal(got.followup.length, 1);
  });

  it('fails when there is no agent, so the daemon keeps the message in the inbox', async () => {
    const { ctx } = fakeContext();
    const client = fakeClient();
    setup(ctx, {}, { createClient: client.create });
    await assert.rejects(async () => deliver(client.options(), wake('gone')), /no agent/);
    await assert.rejects(async () => deliver(client.options(), wake(null)), /no agent/);
  });
});
