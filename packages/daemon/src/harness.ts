/**
 * The Harness API: adapters (plugins inside agent harnesses) connect over a
 * WebSocket at `/__harness` and speak JSON-RPC 2.0 both ways; adapters that
 * cannot hold a socket long-poll over HTTP instead (protocol `POLL_ROUTES`).
 *
 * - adapter → daemon: `hello`, `session.attach`, `session.status`,
 *   `session.detach`, `session.rename`, `tools.list`, `tools.call`,
 *   `agent.wrote`, `artifact.open`, `inbox.take`, `inbox.wait`, `subscribe`;
 * - daemon → adapter: `wake.deliver`, `host.open`, and `event`
 *   notifications after `subscribe`.
 *
 * The hub also keeps the harness profiles (`harnesses/<name>.json`): what the
 * daemon knows about a harness before its adapter connects.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HARNESS_NAME,
  OpenArtifactError,
  RPC_ERRORS,
  errorBody,
  type AdapterCaps,
  type AdapterInfo,
  type AdapterToDaemon,
  type AttachParams,
  type DaemonToAdapter,
  type HarnessEvent,
  type HarnessInfo,
  type HarnessProfile,
  type HarnessesResponse,
  type HelloParams,
  type HelloResult,
  type InboxMessage,
  type OwnerStatus,
  type RpcRequest,
  type RpcResponse,
  type SessionParams,
  type SessionRef,
  type SessionStatus,
  type ToolCallResult,
  type ToolDefinition,
  type WakeDeliverStatus,
  type WakePayload,
} from '@open-artifact/protocol';
import type { Inbox } from './inbox.ts';
import { files, readJson, writeJson } from './paths.ts';
import { sessionKeyOf } from './store.ts';
import type { WebSocketConnection } from './ws.ts';

/** How long the daemon waits for an adapter to answer a call, ms. */
const CALL_TIMEOUT_MS = 30_000;
/** How long a polling adapter counts as live after its last wait ended, ms. */
const POLL_GRACE_MS = Number(process.env.OPEN_ARTIFACT_POLL_GRACE_MS ?? 20_000);
/** The longest one poll is held open, ms. */
const POLL_MAX_MS = 60_000;
/** The longest `inbox.wait`, ms. */
const INBOX_WAIT_MAX_MS = 3_600_000;

// ---- profiles ----------------------------------------------------------------------------------------------------

/**
 * The profiles shipped with the daemon: `$OPEN_ARTIFACT_HARNESS_PROFILES`, else
 * `harnesses/` beside `src/`.
 */
export function shippedProfilesDir(): string {
  return process.env.OPEN_ARTIFACT_HARNESS_PROFILES || resolve(dirname(fileURLToPath(import.meta.url)), '..', 'harnesses');
}

/** The profile of a harness nobody described: a plain MCP client. */
export function defaultProfile(name: string): HarnessProfile {
  return { name, title: name, agentName: 'Agent', level: 'L1', entry: 'mcp', wake: ['inbox'] };
}

/**
 * A harness's profile: `<open-artifact home>/harnesses/<name>.json` (the person's own),
 * else the shipped one, else {@link defaultProfile}.
 */
export function harnessProfile(name: string): HarnessProfile {
  if (!HARNESS_NAME.test(name)) return defaultProfile(name);
  for (const dir of [files.harnesses(), shippedProfilesDir()]) {
    const found = readJson<Partial<HarnessProfile> | null>(join(dir, `${name}.json`), null);
    if (found && typeof found === 'object') return { ...defaultProfile(name), ...found, name };
  }
  return defaultProfile(name);
}

/**
 * Opens a link in this computer's browser: `open` on macOS, `start` on Windows, `xdg-open` elsewhere. False where
 * there is no screen to open it on (Linux without a display) or `$OPEN_ARTIFACT_BROWSER` is `none`, `off` or `0`.
 */
export function systemBrowse(url: string): boolean {
  if (/^(none|off|0|false)$/i.test(process.env.OPEN_ARTIFACT_BROWSER ?? '')) return false;
  if (!/^https?:\/\//.test(url)) return false;
  const platform = process.platform;
  if (platform !== 'darwin' && platform !== 'win32' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return false;
  const [command, args] = platform === 'darwin' ? ['open', [url]] : platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// ---- connections -------------------------------------------------------------------------------------------------

type DaemonCall = <M extends keyof DaemonToAdapter>(method: M, params: DaemonToAdapter[M]['params']) => Promise<DaemonToAdapter[M]['result']>;

/** An adapter's connection: a WebSocket or an HTTP poller. */
export interface AdapterConnection {
  readonly id: string;
  harness: string | null;
  caps: AdapterCaps;
  /** Said hello with the right token. */
  authed: boolean;
  /** Takes `event` notifications. */
  subscribed: boolean;
  readonly polling: boolean;
  /** Sessions attached through it, by key. */
  readonly sessions: Map<string, SessionRef>;
  /** Calls the adapter. */
  call: DaemonCall;
  /** Sends a notification. */
  notify(method: string, params: unknown): void;
  /** Fails pending calls and ends open waits. */
  close(): void;
  /** Closes the transport too. */
  terminate(code?: number): void;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** A WebSocket adapter. */
class SocketConnection implements AdapterConnection {
  readonly id = randomBytes(6).toString('hex');
  harness: string | null = null;
  caps: AdapterCaps = {};
  authed = false;
  subscribed = false;
  readonly polling = false;
  readonly sessions = new Map<string, SessionRef>();

  private readonly hub: HarnessHub;
  private readonly ws: WebSocketConnection;
  private readonly pending = new Map<string, PendingCall>();
  private nextId = 1;

  constructor(hub: HarnessHub, ws: WebSocketConnection) {
    this.hub = hub;
    this.ws = ws;
    ws.handlers = {
      message: (text) => void this.onMessage(text),
      close: () => this.hub.dropConnection(this),
    };
  }

  private send(message: RpcRequest | RpcResponse | { jsonrpc: '2.0'; id: null; error: { code: number; message: string } }): void {
    try {
      this.ws.sendText(JSON.stringify(message));
    } catch {
      /* the socket is going away; close handles it */
    }
  }

  call: DaemonCall = (method, params) => {
    const id = `d${this.nextId++}`;
    return new Promise((resolveCall, rejectCall) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectCall(new OpenArtifactError('timeout', `${method} timed out`));
      }, CALL_TIMEOUT_MS);
      timer.unref?.();
      this.pending.set(id, { resolve: resolveCall as (value: unknown) => void, reject: rejectCall, timer });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  };

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  private async onMessage(text: string): Promise<void> {
    let message: Partial<RpcRequest & RpcResponse>;
    try {
      message = JSON.parse(text);
    } catch {
      this.send({ jsonrpc: '2.0', id: null, error: { code: RPC_ERRORS.parse, message: 'Parse error' } });
      return;
    }
    if (!message || typeof message !== 'object') return;
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(String(message.id));
      if (!pending) return;
      this.pending.delete(String(message.id));
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new OpenArtifactError(message.error.data?.code ?? String(message.error.code), message.error.message ?? 'error'));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method !== 'string') return;
    try {
      const result = await this.hub.handle(this, message.method, (message.params ?? {}) as Record<string, unknown>);
      if (message.id !== undefined) this.send({ jsonrpc: '2.0', id: message.id, result: result ?? null });
    } catch (error) {
      if (message.id === undefined) return;
      const body = errorBody(error);
      const code = body.code === 'method_not_found' ? RPC_ERRORS.methodNotFound : RPC_ERRORS.server;
      this.send({ jsonrpc: '2.0', id: message.id, error: { code, message: body.message, data: body } });
    }
  }

  close(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new OpenArtifactError('disconnected', 'The adapter disconnected.'));
    }
    this.pending.clear();
  }

  terminate(code = 1001): void {
    this.ws.close(code);
  }
}

type PollWaiter = (items: InboxMessage[]) => void;

/**
 * An adapter that long-polls over HTTP: `POST /api/open-artifact.session.attach`, then
 * `POST /api/open-artifact.session.wait` again and again. It is one session's
 * connection: wakes wait in it until the next poll takes them, and go to the
 * inbox if it goes quiet.
 */
class PollConnection implements AdapterConnection {
  readonly id = `poll-${randomBytes(6).toString('hex')}`;
  harness: string | null;
  caps: AdapterCaps;
  authed = true;
  subscribed = false;
  readonly polling = true;
  readonly sessions = new Map<string, SessionRef>();
  /** Wakes not taken by a poll yet. */
  readonly queue: InboxMessage[] = [];
  /** The open poll's resolver. */
  waiter: PollWaiter | null = null;
  lastSeen = Date.now();

  constructor(harness: string, caps: AdapterCaps) {
    this.harness = harness;
    this.caps = { ...caps, wake: caps.wake ?? {} };
  }

  notify(): void {
    /* polling adapters take no events */
  }

  call: DaemonCall = async (method, params) => {
    if (method !== 'wake.deliver') throw new OpenArtifactError('unsupported', `${method} is not available to a polling adapter.`);
    const wake = params as DaemonToAdapter['wake.deliver']['params'];
    this.queue.push({ kind: 'wake', text: wake.text, source: wake.source, artifact: wake.artifact, artifactId: wake.artifactId, at: new Date().toISOString() });
    const open = !!this.waiter;
    this.flush();
    const status: WakeDeliverStatus = open ? 'delivered' : 'queued';
    return { status } as never;
  };

  private flush(): void {
    if (!this.waiter || !this.queue.length) return;
    const done = this.waiter;
    this.waiter = null;
    done(this.queue.splice(0));
  }

  /** The next wakes, or `[]` after `timeoutMs`. One poll at a time: a new one ends the old with `[]`. */
  wait(timeoutMs: number): Promise<InboxMessage[]> {
    this.lastSeen = Date.now();
    this.waiter?.([]);
    if (this.queue.length) return Promise.resolve(this.queue.splice(0));
    return new Promise((resolveWait) => {
      const finish: PollWaiter = (items) => {
        clearTimeout(timer);
        if (this.waiter === finish) this.waiter = null;
        this.lastSeen = Date.now();
        resolveWait(items);
      };
      const timer = setTimeout(() => finish([]), Math.max(1000, Math.min(timeoutMs, POLL_MAX_MS)));
      timer.unref?.();
      this.waiter = finish;
    });
  }

  /** Quiet past the grace period with no poll open: the session went away without saying so. */
  get stale(): boolean {
    return !this.waiter && Date.now() - this.lastSeen > POLL_GRACE_MS;
  }

  close(): void {
    this.waiter?.([]);
    this.waiter = null;
  }

  terminate(): void {
    this.close();
  }
}

// ---- the hub -----------------------------------------------------------------------------------------------------

/** What the hub needs from the agent tools. */
export interface ToolRunner {
  definitions(): ToolDefinition[];
  call(name: string, args: Record<string, unknown>, caller: SessionRef): Promise<ToolCallResult>;
  agentWrote(caller: SessionRef, paths: string[]): { artifacts: string[] };
}

/** Options of {@link HarnessHub}. */
export interface HarnessHubOptions {
  /** The daemon token adapters say in `hello`. */
  token: string;
  version: string;
  tools: ToolRunner;
  inbox: Inbox;
  log: (line: string) => void;
  /** `artifact.open`: show an artifact for a caller. */
  openArtifact: (url: string, caller: SessionRef) => Promise<{ opened: boolean; view_url?: string }>;
  /** Opens a link in this computer's browser (for harnesses whose profile says `open: "browser"`); `null`: never. */
  browse?: ((url: string) => boolean) | null;
}

/** A session the daemon saw attach. */
export interface LiveSession {
  ref: SessionRef;
  /** The connection it is attached through; `null` after it went away. */
  conn: AdapterConnection | null;
  status: SessionStatus | 'detached';
  attachedAt: string;
}

/** Remembered session data in `sessions.json`. */
interface KnownSession extends SessionRef {
  title?: string;
  seenAt: string;
}

/** Fields a polling adapter sends with `session.*`. */
export interface PollParams extends AttachParams {
  harness?: string;
  agentName?: string;
  timeoutMs?: number;
}

/** Adapters, attached sessions, and routing to them. Emits `changed` when any of it changes. */
export class HarnessHub extends EventEmitter<{ changed: [] }> {
  /** Every open connection. */
  readonly connections = new Set<AdapterConnection>();
  /** Attached sessions by key. */
  readonly sessions = new Map<string, LiveSession>();

  private readonly options: HarnessHubOptions;
  /** Process ids registered by hooks and attaches → their session. */
  private readonly pids = new Map<number, SessionRef>();
  private readonly known: Record<string, KnownSession>;
  /** Polling connections by session key. */
  private readonly polls = new Map<string, PollConnection>();
  private readonly sweep: ReturnType<typeof setInterval>;

  constructor(options: HarnessHubOptions) {
    super();
    this.options = options;
    this.known = readJson<{ sessions?: Record<string, KnownSession> } | null>(files.sessions(), {})?.sessions ?? {};
    this.sweep = setInterval(() => {
      for (const conn of this.polls.values()) if (conn.stale) this.dropConnection(conn);
    }, 5000);
    this.sweep.unref?.();
  }

  // ---- WebSocket adapters ----

  /** Takes an accepted WebSocket as an adapter connection. */
  accept(ws: WebSocketConnection): AdapterConnection {
    const conn = new SocketConnection(this, ws);
    this.connections.add(conn);
    return conn;
  }

  /** Forgets a connection; a poller's untaken wakes go to the inbox. */
  dropConnection(conn: AdapterConnection): void {
    if (!this.connections.has(conn)) return;
    conn.close();
    this.connections.delete(conn);
    if (conn instanceof PollConnection) {
      for (const [key, c] of this.polls) if (c === conn) this.polls.delete(key);
      const key = [...conn.sessions.keys()][0];
      for (const item of conn.queue.splice(0)) if (key) this.options.inbox.append(key, item);
    }
    for (const [key, session] of this.sessions) if (session.conn === conn) this.sessions.set(key, { ...session, conn: null, status: 'detached' });
    this.emit('changed');
    this.options.log(`adapter ${conn.harness ?? '?'} disconnected`);
  }

  // ---- polling adapters ----

  /** A polling adapter's session: its connection, made or found. What waited in the inbox goes with the answer. */
  pollAttach(params: PollParams): { key: string; inbox: InboxMessage[] } {
    const harness = String(params.harness ?? '');
    if (!HARNESS_NAME.test(harness)) throw new OpenArtifactError('invalid_argument', 'harness: the harness name (body field or X-Open-Artifact-Harness header).');
    const ref: SessionRef = { harness, session: params.session ?? null, workspace: params.workspace ?? null };
    if (!ref.session) throw new OpenArtifactError('invalid_argument', 'session.attach needs session (and workspace).');
    const key = this.remember(ref, params.title ? { title: params.title } : {})!;
    let conn = this.polls.get(key);
    if (!conn) {
      conn = new PollConnection(harness, { wake: {}, ...(params.agentName ? { agentName: params.agentName } : {}) });
      this.polls.set(key, conn);
      this.connections.add(conn);
      this.options.log(`adapter ${harness} polling for ${key}`);
    }
    conn.lastSeen = Date.now();
    conn.sessions.set(key, ref);
    this.sessions.set(key, { ref, conn, status: params.status === 'running' ? 'running' : 'idle', attachedAt: new Date().toISOString() });
    if (params.pid) this.registerPid(params.pid, ref);
    this.emit('changed');
    return { key, inbox: this.options.inbox.take(key) };
  }

  private pollOf(params: PollParams): { key: string; conn: PollConnection } {
    const key = sessionKeyOf({ harness: String(params.harness ?? ''), session: params.session ?? null, workspace: params.workspace ?? null });
    const conn = key ? this.polls.get(key) : undefined;
    if (!key || !conn) throw new OpenArtifactError('unknown_session', 'Attach the session first (POST /api/open-artifact.session.attach).', { status: 404 });
    return { key, conn };
  }

  /** One long poll: the next wakes for the session, or `[]` after the timeout or when `signal` aborts. */
  async pollWait(params: PollParams, signal?: AbortSignal): Promise<{ messages: InboxMessage[] }> {
    const { conn } = this.pollOf(params);
    const waiting = conn.wait(Number(params.timeoutMs) || 25_000);
    // The caller hung up: end this poll (not a newer one), so a wake is not handed to a request nobody reads.
    const mine = conn.waiter;
    signal?.addEventListener('abort', () => (conn.waiter === mine ? mine?.([]) : undefined), { once: true });
    return { messages: await waiting };
  }

  /** A polling session's agent status. */
  pollStatus(params: PollParams): { ok: true } {
    const { key } = this.pollOf(params);
    const session = this.sessions.get(key);
    if (session) session.status = params.status === 'running' ? 'running' : 'idle';
    this.emit('changed');
    return { ok: true };
  }

  /** A polling session ends. */
  pollDetach(params: PollParams): { ok: true } {
    try {
      this.dropConnection(this.pollOf(params).conn);
    } catch {
      /* already gone */
    }
    return { ok: true };
  }

  // ---- sessions ----

  private persist(): void {
    writeJson(files.sessions(), { sessions: this.known });
  }

  /** Remembers a session in `sessions.json`; returns its key. */
  remember(ref: SessionRef, extra: { title?: string } = {}): string | null {
    const key = sessionKeyOf(ref);
    if (!key) return null;
    this.known[key] = { ...(this.known[key] ?? {}), ...ref, ...extra, seenAt: new Date().toISOString() };
    this.persist();
    return key;
  }

  /** A session ref registered for one of these process ids (hooks, attaches). */
  byPid(pids: number[]): SessionRef | null {
    for (const pid of pids) {
      const ref = this.pids.get(Number(pid));
      if (ref) return ref;
    }
    return null;
  }

  /** Maps a process id to a session, so MCP calls from its children map to it. */
  registerPid(pid: number, ref: SessionRef): void {
    if (Number(pid) > 1) this.pids.set(Number(pid), ref);
  }

  /** What the harness calls its agent: the connected adapter's word, else the profile's. */
  agentNameOf(harness: string | null | undefined): string {
    if (!harness) return 'Agent';
    for (const conn of this.connections) {
      if (conn.authed && conn.harness === harness && typeof conn.caps.agentName === 'string' && conn.caps.agentName) return conn.caps.agentName;
    }
    return harnessProfile(harness).agentName || 'Agent';
  }

  /** Live state of a session. */
  statusOf(ref: SessionRef | null | undefined): { live: boolean; status: OwnerStatus } {
    const session = ref ? this.sessions.get(sessionKeyOf(ref) ?? '') : undefined;
    if (!session?.conn) return { live: false, status: 'offline' };
    return { live: true, status: session.status === 'running' ? 'running' : 'idle' };
  }

  /** `GET /api/open-artifact.harnesses`. */
  info(): HarnessesResponse {
    const adapters: AdapterInfo[] = [...this.connections]
      .filter((c) => c.authed && c.harness)
      .map((c) => ({ id: c.id, harness: c.harness!, caps: c.caps, sessions: [...c.sessions.keys()], polling: c.polling }));
    const sessions: HarnessesResponse['sessions'] = [...this.sessions.entries()].map(([key, s]) => {
      const title = this.known[key]?.title;
      return {
        key,
        ...s.ref,
        status: s.conn ? (s.status === 'running' ? 'running' : 'idle') : 'offline',
        live: !!s.conn,
        ...(title ? { title } : {}),
      };
    });
    const names = new Set<string>([...adapters.map((a) => a.harness), ...sessions.map((s) => s.harness)]);
    const harnesses: HarnessInfo[] = [...names].sort().map((name) => {
      const profile = harnessProfile(name);
      return {
        name,
        title: profile.title,
        agentName: this.agentNameOf(name),
        connected: adapters.some((a) => a.harness === name),
        sessions: sessions.filter((s) => s.harness === name).map(({ live: _live, ...s }) => s),
      };
    });
    return { harnesses, adapters, sessions };
  }

  /** The connection that can act for `ref` now. */
  connectionFor(ref: SessionRef): AdapterConnection | null {
    const session = this.sessions.get(sessionKeyOf(ref) ?? '');
    if (session?.conn) return session.conn;
    // The harness's adapter is up but the session is not attached: an adapter that can resume sessions takes it.
    for (const conn of this.connections) if (conn.authed && conn.harness === ref.harness && conn.caps.wake?.resume) return conn;
    return null;
  }

  /** Live delivery: the adapter's answer, or `null` when no adapter can take it. */
  async deliver(ref: SessionRef, payload: WakePayload): Promise<WakeDeliverStatus | null> {
    const conn = this.connectionFor(ref);
    if (!conn?.caps.wake) return null;
    const result = await conn.call('wake.deliver', { session: ref.session ?? null, workspace: ref.workspace ?? null, ...payload });
    return result?.status ?? null;
  }

  /** Whether the caller's harness can show an artifact (`host.open`). */
  canOpen(ref: SessionRef | null): boolean {
    return !!ref && !!this.connectionFor(ref)?.caps.open;
  }

  /** Whether the caller's profile has pages shown in this computer's browser when its app cannot show them. */
  private browserFor(ref: SessionRef | null): boolean {
    return !!ref && !!this.options.browse && harnessProfile(ref.harness).open === 'browser';
  }

  /** Whether the daemon can show an artifact for the caller: in its app, or in the browser its profile names. */
  canShow(ref: SessionRef | null): boolean {
    return this.canOpen(ref) || this.browserFor(ref);
  }

  /**
   * Shows an artifact for the caller, for the agent: in its app (`host.open`), else in this computer's browser when
   * the harness's profile says `open: "browser"`. Not for the person's own clicks, whose page is already in front of
   * them. `null` when it was shown nowhere.
   */
  async show(ref: SessionRef | null, params: { url: string; view_url: string; title?: string }): Promise<'app' | 'browser' | null> {
    if (await this.hostOpen(ref, params)) return 'app';
    if (this.browserFor(ref) && this.options.browse?.(params.view_url)) return 'browser';
    return null;
  }

  /** Asks the caller's harness to show an artifact (`host.open`), when it can. */
  async hostOpen(ref: SessionRef | null, params: { url: string; view_url: string; title?: string }): Promise<boolean> {
    const conn = ref ? this.connectionFor(ref) : null;
    if (!ref || !conn?.caps.open) return false;
    const result = await conn.call('host.open', { session: ref.session ?? null, ...params }).catch(() => null);
    return !!result?.opened;
  }

  /** Sends an event to every subscribed adapter. */
  broadcast(event: HarnessEvent): void {
    for (const conn of this.connections) if (conn.authed && conn.subscribed) conn.notify('event', event);
  }

  private callerOf(conn: AdapterConnection, params: SessionParams & { caller?: SessionParams }): SessionRef {
    const caller = params.caller ?? {};
    return {
      harness: conn.harness ?? 'unknown',
      session: caller.session ?? params.session ?? null,
      workspace: caller.workspace ?? params.workspace ?? null,
    };
  }

  /** Answers one adapter call. */
  async handle(conn: AdapterConnection, method: string, raw: Record<string, unknown>): Promise<unknown> {
    if (method === 'hello') {
      const params = raw as unknown as HelloParams;
      if (params.token !== this.options.token) throw new OpenArtifactError('unauthorized', 'Bad token: read it from daemon.json.');
      if (typeof params.harness !== 'string' || !HARNESS_NAME.test(params.harness)) throw new OpenArtifactError('invalid_argument', 'hello needs a harness name.');
      conn.authed = true;
      conn.harness = params.harness;
      conn.caps = params.caps ?? {};
      this.options.log(`adapter ${conn.harness} connected (${JSON.stringify(conn.caps)})`);
      this.emit('changed');
      const hello: HelloResult = { protocol: 1, daemon: this.options.version, connection: conn.id };
      return hello;
    }
    if (!conn.authed || !conn.harness) throw new OpenArtifactError('unauthorized', 'Say hello first.');
    const harness = conn.harness;
    switch (method as keyof AdapterToDaemon) {
      case 'session.attach': {
        const params = raw as AttachParams;
        const ref: SessionRef = { harness, session: params.session ?? null, workspace: params.workspace ?? null };
        const key = this.remember(ref, params.title ? { title: params.title } : {});
        if (!key) throw new OpenArtifactError('invalid_argument', 'session.attach needs session or workspace.');
        this.sessions.set(key, { ref, conn, status: params.status ?? 'idle', attachedAt: new Date().toISOString() });
        conn.sessions.set(key, ref);
        if (params.pid) this.registerPid(params.pid, ref);
        this.emit('changed');
        // What waited for this session goes with the answer.
        return { key, inbox: this.options.inbox.take(key) };
      }
      case 'session.status': {
        const params = raw as unknown as SessionParams & { status: SessionStatus };
        const session = this.sessions.get(sessionKeyOf({ harness, session: params.session ?? null, workspace: params.workspace ?? null }) ?? '');
        if (session) session.status = params.status === 'running' ? 'running' : 'idle';
        this.emit('changed');
        return { ok: true };
      }
      case 'session.detach': {
        const params = raw as unknown as SessionParams;
        const key = sessionKeyOf({ harness, session: params.session ?? null, workspace: params.workspace ?? null });
        if (key) {
          this.sessions.delete(key);
          conn.sessions.delete(key);
        }
        this.emit('changed');
        return { ok: true };
      }
      case 'session.rename': {
        const params = raw as unknown as SessionParams & { title: string };
        this.remember({ harness, session: params.session ?? null, workspace: params.workspace ?? null }, { title: String(params.title ?? '') });
        this.emit('changed');
        return { ok: true };
      }
      case 'tools.list':
        return { tools: this.options.tools.definitions() };
      case 'tools.call': {
        const params = raw as unknown as AdapterToDaemon['tools.call']['params'];
        return this.options.tools.call(String(params.name), params.arguments ?? {}, this.callerOf(conn, params));
      }
      case 'agent.wrote': {
        const params = raw as unknown as AdapterToDaemon['agent.wrote']['params'];
        const paths = Array.isArray(params.paths) ? params.paths.filter((p): p is string => typeof p === 'string') : [];
        return { ok: true, ...this.options.tools.agentWrote(this.callerOf(conn, params), paths) };
      }
      case 'artifact.open': {
        const params = raw as unknown as AdapterToDaemon['artifact.open']['params'];
        return this.options.openArtifact(String(params.url), this.callerOf(conn, params));
      }
      case 'inbox.take': {
        const key = sessionKeyOf(this.callerOf(conn, raw));
        return { messages: key ? this.options.inbox.take(key) : [] };
      }
      case 'inbox.wait': {
        const params = raw as AdapterToDaemon['inbox.wait']['params'];
        const key = sessionKeyOf(this.callerOf(conn, params));
        if (!key) throw new OpenArtifactError('invalid_argument', 'inbox.wait needs session or workspace.');
        const timeout = Math.min(Number(params.timeoutMs) || 600_000, INBOX_WAIT_MAX_MS);
        return { messages: await this.options.inbox.wait(key, timeout) };
      }
      case 'subscribe':
        conn.subscribed = (raw as { on?: boolean }).on !== false;
        return { ok: true };
      default:
        throw new OpenArtifactError('method_not_found', `Unknown method ${method}.`);
    }
  }

  /** Closes every connection. */
  close(): void {
    clearInterval(this.sweep);
    for (const conn of this.connections) {
      conn.close();
      conn.terminate(1001);
    }
    this.connections.clear();
  }
}
