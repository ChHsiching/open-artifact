/**
 * Connectors: the MCP servers the owner set up on this computer, whose tools
 * the owner's pages call through the `mcp` capability.
 *
 * They are configured in `connectors.json` beside `settings.json`
 * (`$OPEN_ARTIFACT_CONNECTORS`, else `$OPEN_ARTIFACT_HOME/connectors.json`,
 * else `~/.agents/open-artifact/connectors.json`), in the usual
 * `mcpServers` shape:
 *
 *     { "mcpServers": {
 *         "files": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/Data"] },
 *         "tracker": { "url": "https://mcp.example.com/mcp", "headers": { "Authorization": "Bearer ${TRACKER_TOKEN}" } }
 *     } }
 *
 * `${NAME}` (or `${NAME:-default}`) in a string is read from the
 * environment; `"disabled": true` keeps a server listed but off. The file is
 * read again when it changes. Stdio servers start on first use, are reused,
 * start again after they stop, and are stopped with {@link ConnectorsHost.close}.
 */

import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { McpServerEntry, McpToolResult } from '@open-artifact/runtime/capabilities';
import { HttpMcpClient, McpError, StdioMcpClient, type McpClient, type McpClientInfo, type McpRequestControl } from './mcp-client.ts';

/** A server this computer starts. */
export interface StdioConnectorConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  disabled?: boolean;
}

/** A server reached over Streamable HTTP. */
export interface HttpConnectorConfig {
  url: string;
  headers?: Record<string, string>;
  /** `http` or `streamable-http` (the default); `sse` (the older transport) is not supported. */
  type?: string;
  disabled?: boolean;
}

export type ConnectorConfig = StdioConnectorConfig | HttpConnectorConfig;

/** The file's shape. */
export interface ConnectorsFile {
  mcpServers: Record<string, ConnectorConfig>;
}

/** How long listing one server's tools may take, ms. */
const LIST_TIMEOUT_MS = 30_000;

/** Expands a leading `~`. */
function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}

/** Where the connectors are configured. */
export function connectorsFile(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OPEN_ARTIFACT_CONNECTORS) return resolve(expandHome(env.OPEN_ARTIFACT_CONNECTORS));
  return join(resolve(expandHome(env.OPEN_ARTIFACT_HOME || '~/.agents/open-artifact')), 'connectors.json');
}

/** Replaces `${NAME}` and `${NAME:-default}` with the environment's values. */
export function expandVariables(text: string, env: NodeJS.ProcessEnv = process.env): string {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_match, name: string, fallback: string | undefined) => env[name] ?? fallback ?? '');
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function stringMap(value: unknown, what: string, env: NodeJS.ProcessEnv): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${what} must be an object of strings.`);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') throw new Error(`${what}.${key} must be a string.`);
    out[key] = expandVariables(item, env);
  }
  return out;
}

/** Checks and expands one server's entry; throws a readable message when it is unusable. */
export function connectorConfigOf(value: unknown, env: NodeJS.ProcessEnv = process.env): ConnectorConfig {
  if (!isRecord(value)) throw new Error('A server entry must be an object.');
  const disabled = value.disabled === true ? { disabled: true } : {};
  if (typeof value.command === 'string' && value.command) {
    if (value.args !== undefined && (!Array.isArray(value.args) || value.args.some((arg) => typeof arg !== 'string'))) throw new Error('args must be a list of strings.');
    if (value.cwd !== undefined && typeof value.cwd !== 'string') throw new Error('cwd must be a string.');
    const envVars = stringMap(value.env, 'env', env);
    return {
      command: expandVariables(value.command, env),
      ...(Array.isArray(value.args) ? { args: (value.args as string[]).map((arg) => expandVariables(arg, env)) } : {}),
      ...(envVars ? { env: envVars } : {}),
      ...(typeof value.cwd === 'string' ? { cwd: resolve(expandHome(expandVariables(value.cwd, env))) } : {}),
      ...disabled,
    };
  }
  if (typeof value.url === 'string' && value.url) {
    if (value.type === 'sse') throw new Error('The older SSE transport is not supported; use the server\'s Streamable HTTP endpoint.');
    const url = expandVariables(value.url, env);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Not a URL: ${url}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error(`Not an http(s) URL: ${url}`);
    const headers = stringMap(value.headers, 'headers', env);
    return { url, ...(headers ? { headers } : {}), ...(typeof value.type === 'string' ? { type: value.type } : {}), ...disabled };
  }
  throw new Error('A server needs a command (stdio) or a url (Streamable HTTP).');
}

/** One configured server: its config, or why it cannot be used. */
type Entry = { config: ConnectorConfig; key: string; error?: undefined } | { config?: undefined; key: string; error: string };

/** Reads the file's servers. A missing file has none; a broken one throws. */
export function parseConnectors(text: string, env: NodeJS.ProcessEnv = process.env): Map<string, Entry> {
  const data = JSON.parse(text) as unknown;
  if (!isRecord(data)) throw new Error('connectors.json must hold an object.');
  const servers = data.mcpServers ?? {};
  if (!isRecord(servers)) throw new Error('mcpServers must be an object.');
  const out = new Map<string, Entry>();
  for (const [name, value] of Object.entries(servers)) {
    try {
      const config = connectorConfigOf(value, env);
      out.set(name, { config, key: JSON.stringify(config) });
    } catch (error) {
      out.set(name, { key: `error:${JSON.stringify(value)}`, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return out;
}

/** Options of {@link ConnectorsHost}. */
export interface ConnectorsHostOptions {
  /** The configuration file (default {@link connectorsFile}). */
  file?: string;
  log?: (line: string) => void;
  clientInfo?: McpClientInfo;
}

/** The connectors of one type server: configuration, running clients, and the two calls pages make. */
export class ConnectorsHost {
  readonly file: string;
  private readonly log: (line: string) => void;
  private readonly clientInfo: McpClientInfo | undefined;
  private entries = new Map<string, Entry>();
  private readonly clients = new Map<string, { key: string; client: McpClient }>();
  /** `mtime:size` of the file last read (`missing` when absent). */
  private stamp: string | null = null;
  private fileError: string | null = null;
  private readonly onExit = (): void => {
    for (const { client } of this.clients.values()) if (client instanceof StdioMcpClient) client.killNow();
  };

  constructor(options: ConnectorsHostOptions = {}) {
    this.file = options.file ?? connectorsFile();
    this.log = options.log ?? (() => undefined);
    this.clientInfo = options.clientInfo;
    process.on('exit', this.onExit);
  }

  /** Reads the file again when it changed, and stops clients whose server changed or went. */
  private refresh(): void {
    let stamp = 'missing';
    try {
      const stats = statSync(this.file);
      stamp = `${stats.mtimeMs}:${stats.size}`;
    } catch {
      // No file: no connectors.
    }
    if (stamp === this.stamp) return;
    this.stamp = stamp;
    let next = new Map<string, Entry>();
    this.fileError = null;
    if (stamp !== 'missing') {
      try {
        next = parseConnectors(readFileSync(this.file, 'utf8'));
      } catch (error) {
        this.fileError = `${this.file} could not be read: ${error instanceof Error ? error.message : String(error)}`;
        this.log(`connectors: ${this.fileError}`);
      }
    }
    this.entries = next;
    for (const [name, running] of [...this.clients]) {
      if (next.get(name)?.key === running.key) continue;
      this.clients.delete(name);
      void running.client.close();
    }
  }

  /** The client of a usable, enabled server; throws `server_not_connected` otherwise. */
  private clientOf(server: string): McpClient {
    this.refresh();
    const entry = this.entries.get(server);
    if (!entry) {
      const why = this.fileError ?? `No connector named "${server}" is set up in ${this.file}.`;
      throw new McpError('server_not_connected', why);
    }
    if (entry.error !== undefined) throw new McpError('server_not_connected', `${server}: ${entry.error}`);
    if (entry.config.disabled) throw new McpError('server_not_connected', `${server} is turned off in ${this.file}.`);
    const running = this.clients.get(server);
    if (running?.key === entry.key) return running.client;
    const config = entry.config;
    const client =
      'command' in config
        ? new StdioMcpClient(server, config, { log: this.log, ...(this.clientInfo ? { clientInfo: this.clientInfo } : {}) })
        : new HttpMcpClient(server, config, this.clientInfo ? { clientInfo: this.clientInfo } : {});
    this.clients.set(server, { key: entry.key, client });
    return client;
  }

  /** The configured server names. */
  names(): string[] {
    this.refresh();
    return [...this.entries.keys()];
  }

  /** Calls a tool of `server`. */
  callTool(server: string, tool: string, args: Record<string, unknown>, control: McpRequestControl = {}): Promise<McpToolResult> {
    try {
      return this.clientOf(server).callTool(tool, args, control);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** Every server (or only `server`, when it is set up), connected ones with their tools. */
  async listTools(server?: string): Promise<McpServerEntry[]> {
    this.refresh();
    const names = server === undefined ? [...this.entries.keys()] : this.entries.has(server) ? [server] : [];
    return Promise.all(names.map((name) => this.describe(name)));
  }

  private async describe(name: string): Promise<McpServerEntry> {
    const entry = this.entries.get(name);
    if (!entry || entry.error !== undefined) return { server: name, kind: 'connector', authStatus: 'error', error: entry?.error ?? 'Not set up.' };
    if (entry.config.disabled) return { server: name, kind: 'connector', authStatus: 'disconnected' };
    try {
      const tools = await this.clientOf(name).listTools({ timeoutMs: LIST_TIMEOUT_MS, signal: AbortSignal.timeout(LIST_TIMEOUT_MS + 5000) });
      return { server: name, kind: 'connector', authStatus: 'connected', tools };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof McpError && error.code === 'needs_reauth') return { server: name, kind: 'connector', authStatus: 'needs_auth', error: message };
      return { server: name, kind: 'connector', authStatus: 'error', error: message };
    }
  }

  /** Stops every server this host started. */
  async close(): Promise<void> {
    process.off('exit', this.onExit);
    const running = [...this.clients.values()];
    this.clients.clear();
    await Promise.all(running.map(({ client }) => client.close()));
  }
}
