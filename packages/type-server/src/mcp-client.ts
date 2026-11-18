/**
 * A minimal MCP client: JSON-RPC 2.0 over stdio (newline-delimited) or over
 * Streamable HTTP (a POST per message, answered as JSON or as an event
 * stream, the session kept in `Mcp-Session-Id`). It does what the `mcp`
 * capability needs: `initialize`, `tools/list` (every page) and `tools/call`.
 *
 * Failures are {@link McpError}s carrying the capability's codes: a server
 * that cannot be started or reached is `server_not_connected`, HTTP 401/403
 * is `needs_reauth`, a JSON-RPC error or a missed deadline is
 * `upstream_error`. A tool that ran and failed (`isError`) is a result.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  MCP_CALL_TIMEOUT,
  type JsonRecord,
  type McpContent,
  type McpErrorCode,
  type McpToolInfo,
  type McpToolResult,
} from '@open-artifact/runtime/capabilities';

/** The MCP revision this client speaks. */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

/** How long starting a server and its `initialize` may take, ms. */
export const MCP_CONNECT_TIMEOUT_MS = 60_000;

/** Pages of `tools/list` followed at most. */
const MAX_TOOL_PAGES = 100;

/** Characters of a server's stderr kept for error messages. */
const STDERR_TAIL = 2000;

/** A failed connector call, with the capability's code. */
export class McpError extends Error {
  readonly code: McpErrorCode;
  readonly retryable?: boolean;

  constructor(code: McpErrorCode, message: string, retryable?: boolean) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    if (retryable) this.retryable = true;
  }
}

/** An HTTP session the server no longer knows: connect again and repeat once. */
class SessionExpired extends McpError {
  constructor(name: string) {
    super('upstream_error', `${name} ended its session.`, true);
  }
}

/** How one request may end early. */
export interface McpRequestControl {
  signal?: AbortSignal;
  /** Default {@link MCP_CALL_TIMEOUT}.defaultMs. */
  timeoutMs?: number;
}

/** Who this client says it is in `initialize`. */
export interface McpClientInfo {
  name: string;
  version: string;
}

const DEFAULT_CLIENT_INFO: McpClientInfo = { name: 'open-artifact', version: '0.1.0' };

type JsonRpcId = number | string;

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: JsonRpcId | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Resolves `promise`, or rejects with the signal's reason once it aborts. */
function raceSignal<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/** Keeps the fields of a `Tool` a page uses. */
function toolOf(value: unknown): McpToolInfo | null {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name) return null;
  return {
    name: value.name,
    ...(typeof value.title === 'string' ? { title: value.title } : {}),
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    ...(isRecord(value.inputSchema) ? { inputSchema: value.inputSchema as JsonRecord } : {}),
  };
}

/** A `CallToolResult`, with `content` always an array. */
function toolResultOf(name: string, value: unknown): McpToolResult {
  if (!isRecord(value)) throw new McpError('upstream_error', `${name} answered tools/call with something other than a result.`);
  const result: McpToolResult = { ...(value as Record<string, unknown>), content: Array.isArray(value.content) ? (value.content as McpContent[]) : [] };
  if (!isRecord(value.structuredContent)) delete result.structuredContent;
  if (value.isError !== true) delete result.isError;
  return result;
}

/**
 * The transport-independent part: request ids, answers, deadlines,
 * cancellation, the handshake and the two tool methods.
 */
export abstract class McpClient {
  /** The connector's name in the configuration. */
  readonly name: string;
  protected readonly clientInfo: McpClientInfo;
  /** The protocol version the server agreed to. */
  protected protocolVersion: string | null = null;
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, Pending>();
  private ready: Promise<void> | null = null;
  private tools: McpToolInfo[] | null = null;

  constructor(name: string, clientInfo: McpClientInfo = DEFAULT_CLIENT_INFO) {
    this.name = name;
    this.clientInfo = clientInfo;
  }

  /** Starts the transport (spawns the process); a no-op where nothing has to start. */
  protected abstract open(): Promise<void>;

  /**
   * Sends one message. Answers that come back with it (HTTP) go to
   * {@link deliver} before it resolves; `signal` ends a request it carries.
   */
  protected abstract transmit(message: JsonRpcMessage, signal: AbortSignal): Promise<void>;

  /** Whether {@link transmit} resolving means every answer to it was delivered (HTTP). */
  protected abstract readonly answersInline: boolean;

  /** Stops the transport and fails what is pending. */
  abstract close(): Promise<void>;

  /** Whether the handshake is done (or under way). */
  get connected(): boolean {
    return this.ready !== null;
  }

  /** Fails every pending request and forgets the session: the next call connects again. */
  protected reset(error: McpError): void {
    this.ready = null;
    this.tools = null;
    this.protocolVersion = null;
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const entry of pending) entry.reject(error);
  }

  /** Starts the server and runs the handshake once; concurrent callers share it. */
  connect(signal?: AbortSignal): Promise<void> {
    if (!this.ready) {
      const ready = this.handshake();
      this.ready = ready;
      ready.catch(() => {
        if (this.ready === ready) this.ready = null;
      });
    }
    return raceSignal(this.ready, signal);
  }

  private async handshake(): Promise<void> {
    await this.open();
    const result = await this.request(
      'initialize',
      { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: this.clientInfo },
      { timeoutMs: MCP_CONNECT_TIMEOUT_MS },
    );
    this.protocolVersion = isRecord(result) && typeof result.protocolVersion === 'string' ? result.protocolVersion : MCP_PROTOCOL_VERSION;
    await this.notify('notifications/initialized');
  }

  /** Every tool of the server, all pages of `tools/list` (kept until the server says the list changed). */
  async listTools(control: McpRequestControl = {}): Promise<McpToolInfo[]> {
    return this.session(control, async () => {
      if (this.tools) return this.tools;
      const tools: McpToolInfo[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_TOOL_PAGES; page++) {
        const result = await this.request('tools/list', cursor === undefined ? {} : { cursor }, control);
        if (!isRecord(result)) throw new McpError('upstream_error', `${this.name} answered tools/list with something other than a list.`);
        for (const tool of Array.isArray(result.tools) ? result.tools : []) {
          const info = toolOf(tool);
          if (info) tools.push(info);
        }
        cursor = typeof result.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined;
        if (cursor === undefined) break;
      }
      this.tools = tools;
      return tools;
    });
  }

  /** Calls one tool. */
  callTool(tool: string, args: Record<string, unknown>, control: McpRequestControl = {}): Promise<McpToolResult> {
    return this.session(control, async () => toolResultOf(this.name, await this.request('tools/call', { name: tool, arguments: args }, control)));
  }

  /** Connects, runs `task`, and once more after an HTTP session expired. */
  private async session<T>(control: McpRequestControl, task: () => Promise<T>): Promise<T> {
    await this.connect(control.signal);
    try {
      return await task();
    } catch (error) {
      if (!(error instanceof SessionExpired)) throw error;
      this.reset(error);
      await this.connect(control.signal);
      return task();
    }
  }

  /** Sends a request and waits for its answer, its deadline or its signal. */
  protected request(method: string, params: unknown, control: McpRequestControl = {}): Promise<unknown> {
    const id = this.nextId++;
    const timeoutMs = Math.max(1, Math.min(control.timeoutMs ?? MCP_CALL_TIMEOUT.defaultMs, MCP_CALL_TIMEOUT.maxMs));
    const { signal } = control;
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const transport = new AbortController();
      let settled = false;
      const finish = (): void => {
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        this.pending.delete(id);
        transport.abort();
      };
      const fail = (error: unknown): void => {
        if (settled) return;
        finish();
        reject(error);
      };
      const cancel = (reason: string): void => {
        this.notify('notifications/cancelled', { requestId: id, reason }).catch(() => undefined);
      };
      const onAbort = (): void => {
        if (settled) return;
        cancel('The page cancelled the call.');
        fail(signal!.reason);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        cancel('Timed out.');
        fail(new McpError('upstream_error', `${this.name} did not answer ${method} within ${Math.round(timeoutMs / 1000)} s.`, true));
      }, timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, {
        resolve: (value) => {
          if (settled) return;
          finish();
          resolve(value);
        },
        reject: fail,
      });
      this.transmit({ jsonrpc: '2.0', id, method, params }, transport.signal).then(() => {
        if (!settled && this.answersInline) fail(new McpError('upstream_error', `${this.name} sent no answer to ${method}.`));
      }, fail);
    });
  }

  /** Sends a notification. */
  protected notify(method: string, params?: unknown): Promise<void> {
    return this.transmit({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) }, AbortSignal.timeout(10_000));
  }

  /** Handles one message from the server: an answer, a request or a notification. */
  protected deliver(message: unknown): void {
    if (!isRecord(message)) return;
    if (typeof message.method === 'string') {
      const id = message.id;
      if (typeof id === 'number' || typeof id === 'string') void this.answer(id, message.method);
      else if (message.method === 'notifications/tools/list_changed') this.tools = null;
      return;
    }
    const id = message.id;
    if (typeof id !== 'number' && typeof id !== 'string') return;
    const entry = this.pending.get(id) ?? (typeof id === 'string' && /^\d+$/.test(id) ? this.pending.get(Number(id)) : undefined);
    if (!entry) return;
    if (isRecord(message.error)) {
      const text = typeof message.error.message === 'string' && message.error.message ? message.error.message : 'The connector refused the request.';
      entry.reject(new McpError('upstream_error', text));
    } else entry.resolve(message.result);
  }

  /** Answers a request from the server: `ping` and `roots/list`; anything else is not supported. */
  private async answer(id: JsonRpcId, method: string): Promise<void> {
    const reply: JsonRpcMessage =
      method === 'ping'
        ? { jsonrpc: '2.0', id, result: {} }
        : method === 'roots/list'
          ? { jsonrpc: '2.0', id, result: { roots: [] } }
          : { jsonrpc: '2.0', id, error: { code: -32601, message: `Not supported by this client: ${method}` } };
    try {
      await this.transmit(reply, AbortSignal.timeout(10_000));
    } catch {
      // The server went away; it gets no answer.
    }
  }
}

/** How to start a stdio server. */
export interface StdioServerConfig {
  command: string;
  args?: string[];
  /** Added to this process's environment. */
  env?: Record<string, string>;
  cwd?: string;
}

/** A server this process starts and talks to over its stdin and stdout. */
export class StdioMcpClient extends McpClient {
  protected readonly answersInline = false;
  private readonly config: StdioServerConfig;
  private readonly log: (line: string) => void;
  private child: ChildProcess | null = null;
  private stderr = '';

  constructor(name: string, config: StdioServerConfig, options: { log?: (line: string) => void; clientInfo?: McpClientInfo } = {}) {
    super(name, options.clientInfo);
    this.config = config;
    this.log = options.log ?? (() => undefined);
  }

  /** The running process's id, if any (tests). */
  get pid(): number | undefined {
    return this.child?.pid;
  }

  protected async open(): Promise<void> {
    if (this.child) return;
    this.stderr = '';
    const child = spawn(this.config.command, this.config.args ?? [], {
      ...(this.config.cwd ? { cwd: this.config.cwd } : {}),
      env: { ...process.env, ...(this.config.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
    } catch (error) {
      if (this.child === child) this.child = null;
      throw new McpError('server_not_connected', `Could not start ${this.name} (${this.config.command}): ${error instanceof Error ? error.message : String(error)}`);
    }
    child.on('error', (error) => this.log(`connector ${this.name}: ${error.message}`));
    child.stdin!.on('error', () => undefined);
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-STDERR_TAIL);
    });
    const lines = createInterface({ input: child.stdout!, crlfDelay: Infinity });
    lines.on('line', (line) => {
      const text = line.trim();
      if (!text) return;
      let message: unknown;
      try {
        message = JSON.parse(text);
      } catch {
        this.log(`connector ${this.name}: not JSON on stdout: ${text.slice(0, 200)}`);
        return;
      }
      if (Array.isArray(message)) for (const item of message) this.deliver(item);
      else this.deliver(message);
    });
    child.once('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      const why = this.stderr.trim().split('\n').slice(-3).join(' ').trim();
      this.reset(new McpError('server_not_connected', `${this.name} stopped (${code ?? signal ?? 'exit'})${why ? `: ${why}` : '.'}`, true));
    });
  }

  protected async transmit(message: JsonRpcMessage): Promise<void> {
    const stdin = this.child?.stdin;
    if (!stdin?.writable) throw new McpError('server_not_connected', `${this.name} is not running.`, true);
    stdin.write(`${JSON.stringify(message)}\n`);
  }

  async close(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.reset(new McpError('server_not_connected', `${this.name} was stopped.`, true));
    if (!child) return;
    child.stdin?.end();
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 2000);
    force.unref();
    child.once('exit', () => clearTimeout(force));
  }

  /** Kills the process at once (this process is exiting). */
  killNow(): void {
    this.child?.kill('SIGKILL');
  }
}

/** Where a Streamable HTTP server is. */
export interface HttpServerConfig {
  url: string;
  /** Sent with every request (e.g. `Authorization`). */
  headers?: Record<string, string>;
}

/** A server reached over Streamable HTTP. */
export class HttpMcpClient extends McpClient {
  protected readonly answersInline = true;
  private readonly config: HttpServerConfig;
  private sessionId: string | null = null;

  constructor(name: string, config: HttpServerConfig, options: { clientInfo?: McpClientInfo } = {}) {
    super(name, options.clientInfo);
    this.config = config;
  }

  protected async open(): Promise<void> {
    this.sessionId = null;
  }

  private headers(): Record<string, string> {
    return {
      ...(this.config.headers ?? {}),
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(this.sessionId ? { 'mcp-session-id': this.sessionId } : {}),
      ...(this.protocolVersion ? { 'mcp-protocol-version': this.protocolVersion } : {}),
    };
  }

  protected async transmit(message: JsonRpcMessage, signal: AbortSignal): Promise<void> {
    const hadSession = this.sessionId !== null;
    let response: Response;
    try {
      response = await fetch(this.config.url, { method: 'POST', headers: this.headers(), body: JSON.stringify(message), signal });
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      const cause = error instanceof Error ? ((error.cause as Error | undefined)?.message ?? error.message) : String(error);
      throw new McpError('server_not_connected', `Could not reach ${this.name} (${this.config.url}): ${cause}`, true);
    }
    const session = response.headers.get('mcp-session-id');
    if (session) this.sessionId = session;
    const { status } = response;
    if (status === 401 || status === 403) {
      await response.body?.cancel();
      throw new McpError('needs_reauth', `${this.name} refused its credentials (HTTP ${status}).`);
    }
    if (status === 404 && hadSession && message.method !== 'initialize') {
      await response.body?.cancel();
      this.sessionId = null;
      throw new SessionExpired(this.name);
    }
    if (status === 429) {
      await response.body?.cancel();
      throw new McpError('rate_limited', `${this.name} is busy (HTTP 429).`, true);
    }
    if (!response.ok) {
      const text = (await response.text().catch(() => '')).trim().slice(0, 300);
      throw new McpError('upstream_error', `${this.name} answered HTTP ${status}${text ? `: ${text}` : '.'}`, status >= 500);
    }
    if (message.id === undefined || message.method === undefined || status === 202 || !response.body) {
      await response.body?.cancel();
      return;
    }
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('text/event-stream')) return this.readStream(response.body, message.id!);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new McpError('upstream_error', `${this.name} answered with something other than JSON.`);
    }
    if (Array.isArray(body)) for (const item of body) this.deliver(item);
    else this.deliver(body);
  }

  /** Reads an event stream until the answer to `id` came (or the stream ends). */
  private async readStream(body: ReadableStream<Uint8Array>, id: JsonRpcId): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const answered = (message: unknown): boolean => isRecord(message) && message.method === undefined && (message.id === id || String(message.id) === String(id));
    try {
      for (;;) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = done ? '' : (events.pop() ?? '');
        for (const event of events) {
          const data = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).replace(/^ /, ''))
            .join('\n');
          if (!data) continue;
          let message: unknown;
          try {
            message = JSON.parse(data);
          } catch {
            continue;
          }
          const batch = Array.isArray(message) ? message : [message];
          for (const item of batch) this.deliver(item);
          if (batch.some(answered)) return;
        }
        if (done) return;
      }
    } finally {
      reader.cancel().catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    const session = this.sessionId;
    const headers = this.headers();
    this.sessionId = null;
    this.reset(new McpError('server_not_connected', `${this.name} was disconnected.`, true));
    if (!session) return;
    try {
      const response = await fetch(this.config.url, { method: 'DELETE', headers, signal: AbortSignal.timeout(2000) });
      await response.body?.cancel();
    } catch {
      // Best effort: the server ends idle sessions by itself.
    }
  }
}
