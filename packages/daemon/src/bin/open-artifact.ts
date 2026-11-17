#!/usr/bin/env node
/**
 * `open-artifact`: the Open Artifact command line.
 *
 *   open-artifact daemon run [--port <n>] | ensure | status | stop
 *   open-artifact mcp [--harness <name>] [--channel]     stdio MCP server, bridged to the daemon (--channel: push comment notices, claude/channel)
 *   open-artifact types [list] [--workspace <dir>]
 *   open-artifact artifact '<json args>'                 the Artifact tool; also: open-artifact data '<json>', open-artifact comments '<json>'
 *   open-artifact open <url|id>                          print the view url (and ask the owner's harness to show it)
 *   open-artifact wait [--timeout <ms>]                  wait for this session's next messages (OPEN_ARTIFACT_SESSION / --session)
 *   open-artifact hook <event> [--harness <name>]        harness hooks: SessionStart, UserPromptSubmit, Stop
 *   open-artifact watch [--harness <name>]               print a line whenever comments wait for this session (a harness monitor)
 *   open-artifact chatgpt [--port <n>] [--workspace <dir>] [--rotate]   the tools over HTTP for ChatGPT on the web (behind an HTTPS tunnel)
 *   open-artifact home                                   print the Open Artifact home folder
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { createInterface } from 'node:readline';
import type { DaemonState, SessionRef, ToolCallResult } from '@open-artifact/protocol';
import { api, ensureDaemon, readDaemon } from '../client.ts';
import { harnessProfile } from '../harness.ts';
import { openArtifactHome } from '../paths.ts';
import { loadSettings } from '../settings.ts';
import { TypeRegistry } from '../types.ts';

const argv = process.argv.slice(2);

const USAGE = `open-artifact daemon run [--port <n>] | ensure | status | stop
open-artifact mcp [--harness <name>] [--channel]     stdio MCP server, bridged to the daemon (--channel: push comment notices, claude/channel)
open-artifact types [list] [--workspace <dir>]
open-artifact artifact '<json args>'                 the Artifact tool; also: open-artifact data '<json>', open-artifact comments '<json>'
open-artifact open <url|id>                          print the view url (and ask the owner's harness to show it)
open-artifact wait [--timeout <ms>]                  wait for this session's next messages (OPEN_ARTIFACT_SESSION / --session)
open-artifact hook <event> [--harness <name>]        harness hooks: SessionStart, UserPromptSubmit, Stop
open-artifact watch [--harness <name>]               print a line whenever comments wait for this session (a harness monitor)
open-artifact chatgpt [--port <n>] [--workspace <dir>] [--rotate]   the tools over HTTP for ChatGPT on the web (behind an HTTPS tunnel)
open-artifact home                                   print the Open Artifact home folder`;

/** Takes `--name <value>` out of the arguments. */
function flag(name: string): string | undefined;
function flag(name: string, fallback: string): string;
function flag(name: string, fallback?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = argv[i + 1];
  argv.splice(i, 2);
  return value ?? fallback;
}

const out = (value: unknown): void => void process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);

function die(message: string, code = 1): never {
  process.stderr.write(`open-artifact: ${message}\n`);
  process.exit(code);
}

/** The session id from the harness profile's own environment variable, if it names one. */
function sessionFromEnv(harness: string): string | undefined {
  const variable = harnessProfile(harness).sessionEnv;
  return process.env.OPEN_ARTIFACT_SESSION ?? (variable ? process.env[variable] : undefined);
}

/** Who this command runs for: `--session`, `OPEN_ARTIFACT_SESSION`, or the harness's own variable. */
function caller(): SessionRef {
  const harness = flag('harness') ?? process.env.OPEN_ARTIFACT_HARNESS ?? 'cli';
  const session = flag('session') ?? sessionFromEnv(harness) ?? null;
  return { harness, session, workspace: flag('workspace') ?? process.cwd() };
}

/** This process's ancestors' pids (a hook's parent may be a shell the harness started). */
function ancestors(start = process.ppid, depth = 4): number[] {
  const pids: number[] = [];
  let pid = start;
  for (let i = 0; i < depth && pid > 1; i++) {
    pids.push(pid);
    try {
      pid = Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).trim());
    } catch {
      break;
    }
  }
  return pids;
}

async function tool(name: string, json: string | undefined): Promise<void> {
  let args: Record<string, unknown>;
  try {
    args = json ? (JSON.parse(json) as Record<string, unknown>) : {};
  } catch {
    die(`${name}: the argument is JSON, like '{"action": "list", "scope": "types"}'`);
  }
  const who = caller();
  const state = await ensureDaemon();
  const result = await api<ToolCallResult>(state, 'tools.call', { name, arguments: args, caller: who });
  out(result);
  if (result?.error) process.exitCode = 1;
}

/** The note a channel-mode bridge adds to the MCP `instructions`. */
const CHANNEL_NOTE =
  'Messages that arrive as <channel source="open-artifact" …> say that the person sent comments or requests from an artifact\'s page. Call ArtifactComments {action: "read", url} with the url they name: its result carries the messages. Then handle them as any "[Artifact comment sent to agent]" message.';

/**
 * Channel mode (`open-artifact mcp --channel`, for harnesses whose MCP client takes server-pushed messages, such as
 * Claude Code's `claude/channel`): watches the daemon's events and, when a comment or request for this session lands
 * in its inbox, pushes a short notice telling the agent to read it. The notice carries no comment text and takes
 * nothing from the inbox, so where the harness drops it (channels off) the messages still reach the agent through
 * its hooks or its next Open Artifact call.
 */
function watchWakes(options: {
  harness: string;
  session: string | undefined;
  daemon: () => Promise<DaemonState>;
  notify: (artifact: { url: string; title: string }) => void;
  depth?: number;
}): void {
  const pids = ancestors(process.ppid, options.depth ?? 2);
  let mine: SessionRef | null = options.session ? { harness: options.harness, session: options.session, workspace: process.cwd() } : null;
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const resolveMine = async (state: DaemonState): Promise<SessionRef | null> => {
    if (mine) return mine;
    const body = await api<{ session?: SessionRef | null }>(state, 'session.resolve', { pids }).catch(() => ({ session: null }));
    if (body.session?.session) mine = body.session;
    return mine;
  };
  const notice = async (state: DaemonState, id: string): Promise<void> => {
    const [me, artifact] = await Promise.all([
      resolveMine(state),
      api<{ url?: string; title?: string; owner?: { harness?: string; session?: string | null } | null }>(state, 'artifact', undefined, { query: { id } }).catch(() => null),
    ]);
    if (!me?.session || !artifact?.url || artifact.owner?.harness !== me.harness || artifact.owner?.session !== me.session) return;
    options.notify({ url: artifact.url, title: String(artifact.title ?? 'an artifact').replace(/\s+/g, ' ').slice(0, 120) });
  };
  const connect = async (): Promise<void> => {
    for (;;) {
      try {
        const state = await options.daemon();
        await resolveMine(state);
        const response = await fetch(new URL('/api/open-artifact.events', state.url), { headers: { Authorization: `Bearer ${state.token}` } });
        if (!response.ok || !response.body) throw new Error(`events: ${response.status}`);
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          buffer += decoder.decode(chunk, { stream: true });
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = block
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trim())
              .join('\n');
            if (!data) continue;
            let event: { type?: string; artifactId?: string; via?: string };
            try {
              event = JSON.parse(data) as typeof event;
            } catch {
              continue;
            }
            // Only what waits in an inbox: a live delivery or a wait that took it needs no notice.
            if (event.type !== 'wake/state' || event.via !== 'inbox' || !event.artifactId) continue;
            const id = event.artifactId;
            // Several comments sent at once make one notice.
            clearTimeout(pending.get(id));
            pending.set(
              id,
              setTimeout(() => {
                pending.delete(id);
                void notice(state, id);
              }, 1500),
            );
          }
        }
      } catch {
        // The daemon went away or restarted: try again shortly.
      }
      await new Promise((done) => setTimeout(done, 3000));
    }
  };
  void connect();
}

/** The one-line notice of comments waiting for the agent (it carries no comment text, so it cannot be forged from a page). */
function wakeNotice(url: string, title: string): string {
  return `The person sent comments or requests from the artifact "${title}". Call ArtifactComments {action: "read", url: "${url}"} to receive them, then handle them.`;
}

/**
 * `open-artifact watch [--harness <name>]`: prints one line per comment notice for this session, for as long as it
 * runs (a harness's background monitor, such as a Claude Code plugin monitor, turns each line into a notification).
 * The session is OPEN_ARTIFACT_SESSION / the profile's variable, else the one a hook registered for an ancestor
 * process. It waits for a daemon rather than starting one.
 */
async function watch(): Promise<void> {
  const harness = flag('harness', process.env.OPEN_ARTIFACT_HARNESS ?? 'mcp');
  const session = sessionFromEnv(harness);
  const daemon = async (): Promise<DaemonState> => {
    for (;;) {
      const state = await readDaemon();
      if (state) return state;
      await new Promise((done) => setTimeout(done, 5000));
    }
  };
  watchWakes({ harness, session, daemon, depth: 4, notify: ({ url, title }) => out(`Open Artifact: ${wakeNotice(url, title)}`) });
}

async function mcpBridge(): Promise<void> {
  const harness = flag('harness', process.env.OPEN_ARTIFACT_HARNESS ?? 'mcp');
  const channel = argv.includes('--channel') || process.env.OPEN_ARTIFACT_CHANNEL === '1';
  if (argv.includes('--channel')) argv.splice(argv.indexOf('--channel'), 1);
  const session = sessionFromEnv(harness);
  let state: DaemonState = await ensureDaemon();
  const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${state.token}`,
    'X-Open-Artifact-Harness': harness,
    'X-Open-Artifact-Workspace': encodeURIComponent(process.cwd()),
    'X-Open-Artifact-PPID': ancestors(process.ppid, 2).join(','),
    ...(session ? { 'X-Open-Artifact-Session': session } : {}),
  });
  const write = (line: string): void => void process.stdout.write(`${line}\n`);
  let watching = false;
  const send = async (line: string): Promise<void> => {
    let message: { id?: unknown; method?: string };
    try {
      message = JSON.parse(line) as { id?: unknown; method?: string };
    } catch {
      return;
    }
    if (channel && message.method === 'notifications/initialized' && !watching) {
      watching = true;
      watchWakes({
        harness,
        session,
        daemon: async () => (state = (await readDaemon()) ?? (await ensureDaemon())),
        notify: ({ url, title }) =>
          write(
            JSON.stringify({
              jsonrpc: '2.0',
              method: 'notifications/claude/channel',
              params: { content: wakeNotice(url, title), meta: { artifact_url: url, kind: 'artifact_comments' } },
            }),
          ),
      });
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(`${state.url}/mcp`, { method: 'POST', headers: headers(), body: JSON.stringify(message) });
        if (response.status === 202) return;
        let text = await response.text();
        if (channel && message.method === 'initialize' && text) {
          // Declare the channel and say what its messages mean.
          try {
            const reply = JSON.parse(text) as { result?: { capabilities?: Record<string, unknown>; instructions?: string } };
            if (reply.result) {
              const capabilities = reply.result.capabilities ?? {};
              capabilities.experimental = { ...((capabilities.experimental as object) ?? {}), 'claude/channel': {} };
              reply.result.capabilities = capabilities;
              reply.result.instructions = `${reply.result.instructions ?? ''}\n\n${CHANNEL_NOTE}`.trim();
              text = JSON.stringify(reply);
            }
          } catch {
            // not JSON: pass it on as it is
          }
        }
        if (text) write(text.replace(/\n/g, ' '));
        return;
      } catch {
        state = await ensureDaemon();
      }
    }
    if (message.id !== undefined) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32002, message: 'The open-artifact daemon is not reachable.' } })}\n`);
    }
  };
  const lines = createInterface({ input: process.stdin });
  // Calls run concurrently (a wait must not hold the rest); answers go out as they come.
  lines.on('line', (line) => {
    if (line.trim()) void send(line);
  });
  lines.on('close', () => setTimeout(() => process.exit(0), 50));
}

/** A harness hook: registers the session and hands it what waited. */
async function hook(event: string | undefined): Promise<void> {
  if (!event) die('hook <event>');
  let input: Record<string, unknown> = {};
  try {
    const text = readFileSync(0, 'utf8');
    input = text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    input = {};
  }
  const harness = flag('harness', process.env.OPEN_ARTIFACT_HARNESS ?? 'mcp');
  const session = (input.session_id ?? input.sessionId ?? input.conversation_id ?? sessionFromEnv(harness) ?? null) as string | null;
  const roots = Array.isArray(input.workspace_roots) ? (input.workspace_roots as unknown[]) : [];
  const workspace = String(input.cwd ?? roots[0] ?? process.cwd());
  const canonical = HOOK_EVENTS[event] ?? event;
  const running = await readDaemon();
  if (!running && canonical !== 'SessionStart') return;
  const state = running ?? (await ensureDaemon());
  const body = await api<{ messages?: string[] }>(state, 'hook', { event: canonical, harness, session, workspace, pids: ancestors(process.ppid, 4) }).catch(() => ({ messages: [] }));
  const messages = body.messages ?? [];
  if (!messages.length) return;
  const answer = hookAnswer(event, messages.join('\n\n'), input);
  if (answer) out(answer);
}

/**
 * Each harness's own hook event names, as the daemon's (Claude Code's and Codex's names are the daemon's own):
 * Cursor `sessionStart` `postToolUse` `stop`; GitHub Copilot `sessionStart` `userPromptTransformed` `postToolUse`
 * `agentStop`. Not Cursor's `beforeSubmitPrompt` or Copilot's `userPromptSubmitted`: their output never reaches the
 * model, and the daemon hands a hook the messages it waits with, so a plugin must not install them.
 */
const HOOK_EVENTS: Record<string, string> = {
  sessionStart: 'SessionStart',
  userPromptTransformed: 'UserPromptSubmit',
  postToolUse: 'UserPromptSubmit',
  stop: 'Stop',
  agentStop: 'Stop',
};

/** What a hook prints so its harness gives the model the waiting messages, in that harness's own shape. */
function hookAnswer(event: string, text: string, input: Record<string, unknown>): unknown {
  switch (event) {
    case 'Stop': // Claude Code, Codex
    case 'agentStop': // GitHub Copilot: another turn, with the reason as its prompt
      return { decision: 'block', reason: text };
    case 'stop': // Cursor: sent as the next message
      return { followup_message: text };
    case 'sessionStart': // Cursor reads additional_context, GitHub Copilot additionalContext
    case 'postToolUse':
      return { additional_context: text, additionalContext: text };
    case 'userPromptTransformed': // GitHub Copilot: what the model sees of the prompt
      return { modifiedTransformedPrompt: `${String(input.transformedPrompt ?? input.prompt ?? '')}\n\n${text}` };
    default: // Claude Code and Codex: SessionStart, UserPromptSubmit, PostToolUse
      return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
  }
}

/** `open-artifact chatgpt`: the ChatGPT connector, until stopped. */
async function chatgpt(): Promise<void> {
  const { chatgptSecret, serveChatGpt } = await import('../chatgpt.ts');
  const port = Number(flag('port', '4891'));
  const workspace = resolvePath(flag('workspace') ?? process.cwd());
  const secret = chatgptSecret(argv.includes('--rotate'));
  const server = await serveChatGpt({
    port,
    workspace,
    secret,
    daemon: async () => (await readDaemon()) ?? (await ensureDaemon()),
    log: (line) => process.stderr.write(`${line}\n`),
  });
  const local = `http://127.0.0.1:${port}/mcp/${secret}`;
  out(
    [
      `Open Artifact for ChatGPT, at ${local}`,
      `New artifacts go under ${workspace}/artifacts/.`,
      '',
      'To add it to ChatGPT on the web:',
      `1. Put it behind HTTPS, e.g. OpenAI's Secure MCP Tunnel or \`cloudflared tunnel --url http://127.0.0.1:${port}\`.`,
      `2. In ChatGPT (chatgpt.com/plugins), add a custom MCP server: the tunnel's https URL followed by /mcp/${secret}, with no authentication.`,
      '3. In a chat, pick the app and ask for a deck, design or board.',
      '',
      'The secret path is the only key: share it with no one; --rotate makes a new one. Stop with Ctrl-C.',
    ].join('\n'),
  );
  const stop = (): void => {
    server.close();
    process.exit(0);
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, stop);
}

async function daemon(sub: string | undefined): Promise<void> {
  switch (sub) {
    case 'run': {
      const { startDaemon } = await import('../daemon.ts');
      const port = flag('port');
      const running = await startDaemon(port !== undefined ? { port: Number(port) } : {});
      running.on('exit', () => process.exit(0));
      const stop = (): void => {
        running.close();
        process.exit(0);
      };
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, stop);
      process.on('uncaughtException', (error) => running.log(`uncaught: ${error?.stack ?? error}`));
      process.on('unhandledRejection', (error) => running.log(`unhandled: ${(error as Error)?.stack ?? error}`));
      process.stderr.write(`open-artifact daemon at ${running.origin}\n`);
      return;
    }
    case 'ensure': {
      const { token: _token, ...shown } = await ensureDaemon();
      return out(shown);
    }
    case 'status': {
      const state = await readDaemon();
      if (!state) return out({ running: false, home: openArtifactHome() });
      const { token: _token, ...shown } = state;
      return out({ running: true, home: openArtifactHome(), ...shown, ...(await api<object>(state, 'harnesses')) });
    }
    case 'stop': {
      const state = await readDaemon();
      if (!state) return out({ running: false });
      process.kill(state.pid, 'SIGTERM');
      return out({ stopped: state.pid });
    }
    default:
      die('daemon run | ensure | status | stop');
  }
}

function types(): void {
  const registry = new TypeRegistry(loadSettings);
  const workspace = flag('workspace') ?? process.cwd();
  out(
    registry.list(workspace, { includeShadowed: true }).map((t) => ({
      id: t.id,
      title: t.title,
      scope: t.scope,
      runtime: t.runtime,
      runnable: t.runnable,
      enabled: t.enabled,
      shadowedBy: t.shadowedBy,
      dir: t.dir,
      problems: t.problems,
    })),
  );
  registry.close();
}

async function main(): Promise<void> {
  const [command, sub] = argv.splice(0, 2);
  switch (command) {
    case 'daemon':
      return daemon(sub);
    case 'mcp':
      if (sub) argv.unshift(sub);
      return mcpBridge();
    case 'types':
      if (sub && sub !== 'list') argv.unshift(sub);
      return types();
    case 'artifact':
      return tool('Artifact', sub);
    case 'data':
      return tool('ArtifactData', sub);
    case 'comments':
      return tool('ArtifactComments', sub);
    case 'open':
      if (!sub) die('open <open-artifact://artifact/… | art_…>');
      return tool('Artifact', JSON.stringify({ action: 'open', url: sub }));
    case 'wait': {
      if (sub) argv.unshift(sub);
      const timeout = Number(flag('timeout', '600000'));
      return tool('ArtifactComments', JSON.stringify({ action: 'wait', timeout_ms: timeout }));
    }
    case 'hook':
      return hook(sub);
    case 'watch':
      if (sub) argv.unshift(sub);
      return watch();
    case 'chatgpt':
      if (sub) argv.unshift(sub);
      return chatgpt();
    case 'home':
      return out(openArtifactHome());
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      return out(USAGE);
    default:
      die(`unknown command ${command}; open-artifact help`);
  }
}

main().catch((error: unknown) => die((error as Error)?.message ?? String(error)));
