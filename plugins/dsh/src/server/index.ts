/**
 * dsh-open-artifact: the DeepSeek Harness (DSH) adapter of Open Artifact, a level-3 harness integration.
 *
 * - Tools: `Artifact`, `ArtifactData` and `ArtifactComments`, registered in `ctx.tools`. Each call goes to the daemon
 *   over the Harness API with the calling session as the caller: `{ session: <agent id>, workspace: <its folder> }`.
 * - Wake: the daemon calls `wake.deliver` when a person sends a comment or a request from an artifact's page; the
 *   message reaches the session's agent as wake.ts describes. A session with no live agent is resumed through the
 *   session controller when the host has one. When none of that works the call fails and the daemon keeps the message
 *   in the session's inbox, which the session's next tool call carries.
 *   What waited in the inbox while no agent could take it comes with the session's attach and is delivered the same way.
 * - Open: the daemon calls `host.open` when the agent opens an artifact (or its share or export panel); the browser
 *   half shows the Shell in the session's Browser in the right sidebar (host-open.ts).
 * - Status: an attached session's agent going `running` and back to `idle` is passed on, so an artifact's Shell shows
 *   the agent working only while it is.
 * - System prompt: one short section saying the tools exist.
 * - Skill: `/open-artifact <type> …` makes an artifact of that type (skill.ts).
 * - Routes: the Open Artifact page's (routes.ts). The page itself is the browser half (`lib/client.js`, from src/client).
 *
 * The daemon starts on first use from the vendored entry (vendor.ts); every harness on this computer shares it.
 */
import { HarnessClient, type HarnessClientOptions } from '@open-artifact/daemon/client';
import { AGENT_PROMPT, LIBRARY_ROUTES, TOOL_DESCRIPTIONS, TOOL_SCHEMAS, WAKE_SOURCE_KIND, type ToolInputSchema, type ToolName } from '@open-artifact/protocol';
import {
  service,
  type DshAgent,
  type DshAgents,
  type DshContentPart,
  type DshContext,
  type DshSkillsContext,
  type DshParameter,
  type DshParameters,
  type DshSessionController,
  type DshSessions,
  type DshSystemPrompt,
  type DshToolExecution,
  type DshUserQuestions,
  type DshWorkingDirectory,
} from './dsh.ts';
import { HostOpens } from './host-open.ts';
import { HARNESS, libraryApi, registerRoutes } from './routes.ts';
import { updateChecker, type PluginManager } from './updates.ts';
import { skillProvider } from './skill.ts';
import { daemonOptions, PACKAGE_NAME, packageRoot } from './vendor.ts';
import { deliverWake, QuestionTracker, timedWaits, wakeMessage } from './wake.ts';

export { wakeMessage } from './wake.ts';

/** Cordis plugin identity. */
export const name = 'open-artifact';

/** Services the plugin needs before it applies. `workingDirectory`: the session's folder, as the built-in tools get it. */
export const inject = ['tools', 'workingDirectory'];

/** The source kind of a wake message: the structured copy of the event the browser half draws a card for. */
export const SOURCE_KIND = WAKE_SOURCE_KIND;

/** The plugin's config (`cordis.patch.yml`). */
export interface Config {
  /** What the Shell calls the agent. Default `Agent`. */
  agentName?: string;
  /** Start the daemon when none runs. Default true. */
  autoStart?: boolean;
  /** The folder new artifacts go to when a session has none. */
  workspace?: string;
}

/** What {@link setup} can be given instead of the real thing, for tests. */
export interface SetupDeps {
  /** Makes the Harness API connection. */
  createClient?: (options: HarnessClientOptions) => HarnessClientLike;
  /** Registers the page's routes. */
  registerRoutes?: typeof registerRoutes;
  /** The `host.open` channel to the browser halves. */
  hostOpens?: HostOpens;
}

/** The part of the daemon client the plugin uses. */
export type HarnessClientLike = Pick<HarnessClient, 'connect' | 'attach' | 'status' | 'callTool' | 'close'>;

/**
 * DSH's tool parameter schemas are a subset of JSON Schema: free-form objects and arrays become untyped values, which
 * accept anything, with their description kept.
 */
export function dshParameters(schema: ToolInputSchema): DshParameters {
  const properties: Record<string, DshParameter> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const description = prop.description ? { description: prop.description } : {};
    if (prop.type === 'object' || prop.type === 'array') {
      properties[key] = description;
      continue;
    }
    properties[key] = {
      ...(prop.type ? { type: prop.type } : {}),
      ...description,
      ...(prop.enum ? { enum: [...prop.enum] } : {}),
    };
  }
  return { type: 'object', properties, ...(schema.required?.length ? { required: [...schema.required] } : {}) };
}

/** A tool's result as DSH shows it: the text, or the JSON. */
export function renderResult(_args: unknown, value: unknown): DshContentPart[] {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
}

/** An error a tool call throws for the daemon's `{ error }` answer, with its code. */
export class ToolError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
  }
}

/** Applies the plugin: the Cordis entry point. */
export function apply(ctx: DshContext, config: Config = {}): { client: HarnessClientLike; hostOpens: HostOpens } {
  return setup(ctx, config);
}

/** {@link apply}, with what it builds on replaceable. */
export function setup(ctx: DshContext, config: Config = {}, deps: SetupDeps = {}): { client: HarnessClientLike; hostOpens: HostOpens } {
  const log = (level: 'warn' | 'info', message: string) => ctx.logger?.[level]?.(`open-artifact: ${message}`);
  const daemon = daemonOptions();
  const library = libraryApi({ daemonOptions: daemon });
  const hostOpens = deps.hostOpens ?? new HostOpens();

  /**
   * The session's working folder, where the daemon puts new artifacts: what the built-in tools use, else the session
   * record, else `config.workspace`. Never the process's own folder, which in the desktop app is the profile's.
   */
  const cwdOf = async (exec: DshToolExecution | undefined): Promise<string | null> => {
    const wd = service<DshWorkingDirectory>(ctx, 'workingDirectory');
    if (exec?.agent && typeof wd?.ensure === 'function') {
      try {
        const dir = await wd.ensure(exec.agent, exec.signal);
        if (typeof dir === 'string' && dir) return dir;
      } catch (error) {
        log('warn', `no working folder for ${exec.agent.id}: ${(error as Error).message}`);
      }
    }
    const session = exec?.agent?.id;
    const record = session ? service<DshSessions>(ctx, 'sessions')?.get?.(session) : undefined;
    return record?.meta?.cwd ?? record?.cwd ?? config.workspace ?? null;
  };

  /** The session's live agent, or the one the session controller resumes. */
  const agentOf = async (session: string | null): Promise<DshAgent | undefined> => {
    if (!session) return undefined;
    const live = service<DshAgents>(ctx, 'agents')?.get?.(session);
    if (live) return live;
    const controller = service<DshSessionController>(ctx, 'sessionController');
    return typeof controller?.resolveAgent === 'function' ? await controller.resolveAgent(session) : undefined;
  };

  const questions = new QuestionTracker();
  const waitsOf = (agent: DshAgent) => {
    try {
      return timedWaits(service<DshUserQuestions>(ctx, 'userQuestions')?.waits?.get(agent));
    } catch {
      return [];
    }
  };

  /** session id → the workspaces it is attached with. */
  const attached = new Map<string, Set<string | null>>();
  /** `session|workspace` keys the daemon has (the client attaches them again on a reconnect). */
  const attachedKeys = new Set<string>();

  /** Whether the agent is asking the person something, and how its timed questions end early, for deliverWake. */
  const waitingOf = (agent: DshAgent) => ({
    asking: questions.asking(agent.session) || waitsOf(agent).length > 0,
    endTimedWaits: () => {
      const waits = waitsOf(agent);
      for (const wait of waits) wait.close(wait.timeout);
      return waits.length > 0;
    },
  });

  const createClient = deps.createClient ?? ((options: HarnessClientOptions) => new HarnessClient(options));
  const client = createClient({
    harness: HARNESS,
    caps: { wake: { resume: true }, open: true, agentName: config.agentName ?? 'Agent' },
    autoStart: config.autoStart !== false,
    daemon,
    log: (line) => log('warn', line),
    handlers: {
      async 'wake.deliver'(params) {
        const agent = await agentOf(params.session);
        if (!agent) throw new Error(`no agent for session ${params.session}`);
        const message = wakeMessage(params);
        // Woken, the session works again: attached, the Shell shows it live and working until it is idle.
        if (params.session) {
          const session = params.session;
          queueMicrotask(() => void track(session, params.workspace ?? null, 'running').catch((e: Error) => log('warn', `session.attach: ${e.message}`)));
        }
        return { status: deliverWake(agent, message, waitingOf(agent)) };
      },
      async 'host.open'(params) {
        return { opened: await hostOpens.open(params.session, params.view_url || params.url, params.title ?? '') };
      },
    },
  });

  /** Hands what waited in a session's inbox to its agent, as a wake would have. */
  const deliverInbox = async (session: string, messages: readonly { kind?: string; text?: string; source?: unknown }[] | undefined) => {
    const waiting = (messages ?? []).filter((m) => typeof m?.text === 'string' && m.text);
    if (waiting.length === 0) return;
    const agent = await agentOf(session);
    if (!agent) return log('warn', `${waiting.length} inbox message(s) for ${session} have no agent to go to`);
    for (const item of waiting) {
      deliverWake(agent, wakeMessage({ text: item.text!, source: (item.source ?? null) as Parameters<typeof wakeMessage>[0]['source'] }), waitingOf(agent));
    }
  };

  /**
   * Attaches the session (once per workspace) with its agent's status; `agent/status` keeps that current. A session is
   * attached by its first tool call, or by a wake that reaches it after the app restarted.
   */
  const track = async (session: string, workspace: string | null, status: string | undefined): Promise<void> => {
    const key = `${session}|${workspace ?? ''}`;
    if (attachedKeys.has(key)) return;
    attachedKeys.add(key);
    const workspaces = attached.get(session) ?? new Set<string | null>();
    workspaces.add(workspace);
    attached.set(session, workspaces);
    let inbox: Awaited<ReturnType<HarnessClientLike['attach']>>['inbox'] | undefined;
    try {
      ({ inbox } = await client.attach({ session, workspace, status: status === 'idle' ? 'idle' : 'running' }));
    } catch (error) {
      attachedKeys.delete(key);
      throw error;
    }
    await deliverInbox(session, inbox).catch((e: Error) => log('warn', `inbox: ${e.message}`));
  };

  if (typeof ctx.on === 'function') {
    ctx.on('session/event', (session, event) => questions.observe(session, event), { global: true });
    ctx.on(
      'agent/status',
      ({ agent, status } = {}) => {
        const workspaces = agent?.id ? attached.get(agent.id) : undefined;
        if (!agent?.id || !workspaces || (status !== 'idle' && status !== 'running')) return;
        for (const workspace of workspaces) {
          client.status({ session: agent.id, workspace, status }).catch((e: Error) => log('warn', `session.status: ${e.message}`));
        }
      },
      { global: true },
    );
  }

  const call = async (tool: ToolName, args: Record<string, unknown> | undefined, exec: DshToolExecution | undefined) => {
    const session = exec?.agent?.id ?? null;
    const caller = { session, workspace: await cwdOf(exec) };
    if (session) await track(session, caller.workspace, exec?.agent?.status);
    const out = await client.callTool(tool, args ?? {}, caller);
    if (out && typeof out.error === 'object' && out.error) {
      throw new ToolError([out.error.message, out.error.fix].filter(Boolean).join(' '), out.error.code);
    }
    return out;
  };

  for (const tool of Object.keys(TOOL_SCHEMAS) as ToolName[]) {
    ctx.tools.register({
      name: tool,
      description: TOOL_DESCRIPTIONS[tool],
      parameters: dshParameters(TOOL_SCHEMAS[tool]),
      output: { schema: {}, render: renderResult },
      execute: (args, exec) => call(tool, args, exec),
    });
  }

  const prompt = service<DshSystemPrompt>(ctx, 'systemPrompt');
  if (typeof prompt?.section === 'function') prompt.section({ name: 'open-artifact', order: 900, text: AGENT_PROMPT, interpolate: false });

  // Whether a newer release is out, for the page to offer (src/client/updates.tsx installs it).
  const updates = updateChecker([PACKAGE_NAME], () => service<PluginManager>(ctx, 'pluginManager'));

  // The page's routes, in a context of their own that goes with the app's route registry (the `connection` service).
  const routes = deps.registerRoutes ?? registerRoutes;
  ctx.inject?.(['connection'], (sub) => {
    try {
      routes({ register: (route) => sub.connection.fetch.register(route) }, { daemonOptions: daemon, library, hostOpens, updates });
    } catch (error) {
      log('warn', `the Open Artifact page's routes: ${(error as Error).message}`);
    }
  });

  // `/open-artifact <type> …`, in the app's skill registry when it has one.
  ctx.inject?.<DshSkillsContext>(['skills'], (sub) => {
    try {
      sub.skills.registerProvider(() =>
        skillProvider({
          packageRoot: packageRoot(),
          types: async (signal) => (await library.api<{ types?: unknown[] }>(LIBRARY_ROUTES.types, signal ? { signal } : {})).types as never[] ?? [],
        }),
      );
    } catch (error) {
      log('warn', `the /open-artifact skill: ${(error as Error).message}`);
    }
  });

  ctx.effect(() => {
    client.connect().catch((error: Error) => log('warn', `the daemon is not reachable yet (${error.message}); the first tool call starts it.`));
    return () => client.close();
  }, 'open-artifact: the daemon connection');

  return { client, hostOpens };
}
