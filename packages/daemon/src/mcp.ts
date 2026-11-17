/**
 * MCP over HTTP (`POST /mcp`, JSON answers) and the caller's identity.
 * `open-artifact mcp` bridges a stdio MCP client to it, adding the `X-Open-Artifact-*` headers.
 */

import type { IncomingMessage } from 'node:http';
import { RPC_ERRORS, type SessionRef, type ToolCallResult, type ToolDefinition } from '@open-artifact/protocol';

/** MCP protocol version answered when the client names none. */
export const MCP_PROTOCOL = '2025-06-18';

/** Headers the `open-artifact mcp` bridge sets. */
export const MCP_HEADERS = {
  harness: 'x-open-artifact-harness',
  session: 'x-open-artifact-session',
  workspace: 'x-open-artifact-workspace',
  /** Comma-separated ancestor process ids, to find a session a hook registered. */
  ppid: 'x-open-artifact-ppid',
} as const;

/** `_meta` fields an MCP client may pass to name its session. */
export interface McpMeta {
  harness?: string;
  sessionId?: string;
  threadId?: string;
  workspace?: string;
}

/** Finds a session from process ids (the Harness hub). */
export interface PidLookup {
  byPid(pids: number[]): SessionRef | null;
}

const header = (request: IncomingMessage, name: string): string | undefined => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/** Who calls: the headers the bridge sets, or `_meta` an MCP client passes. Plain clients are harness `mcp`. */
export function callerFromRequest(request: IncomingMessage, pids: PidLookup, meta: McpMeta = {}): SessionRef {
  const harness = String(header(request, MCP_HEADERS.harness) ?? meta.harness ?? 'mcp');
  const sessionHeader = header(request, MCP_HEADERS.session);
  const session = sessionHeader ? String(sessionHeader) : (meta.sessionId ?? meta.threadId ?? null);
  const workspaceHeader = header(request, MCP_HEADERS.workspace);
  let workspace: string | null = meta.workspace ?? null;
  if (workspaceHeader) {
    try {
      workspace = decodeURIComponent(workspaceHeader);
    } catch {
      workspace = workspaceHeader;
    }
  }
  const ppid = header(request, MCP_HEADERS.ppid);
  if (!session && ppid) {
    const ref = pids.byPid(ppid.split(',').map(Number).filter((n) => n > 1));
    if (ref) return { harness: ref.harness, session: ref.session, workspace: ref.workspace ?? workspace };
  }
  return { harness, session, workspace };
}

/** What {@link handleMcp} needs from the tools. */
export interface McpTools {
  definitions(): ToolDefinition[];
  instructions(workspace?: string | null): string;
  call(name: string, args: Record<string, unknown>, caller: SessionRef): Promise<ToolCallResult>;
}

/** A JSON-RPC message from an MCP client. */
export interface McpMessage {
  jsonrpc?: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown> & { _meta?: McpMeta; name?: string; arguments?: Record<string, unknown>; protocolVersion?: string };
}

/** A JSON-RPC answer. */
export interface McpReply {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/** One JSON-RPC message → its answer (`null` for a notification). */
export async function handleMcp(message: McpMessage, context: { tools: McpTools; caller: SessionRef; version: string }): Promise<McpReply | null> {
  const { id, method, params } = message ?? {};
  const reply = (result: unknown): McpReply | null => (id === undefined ? null : { jsonrpc: '2.0', id, result });
  const fail = (code: number, text: string): McpReply | null => (id === undefined ? null : { jsonrpc: '2.0', id, error: { code, message: text } });
  const { tools, caller, version } = context;
  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: params?.protocolVersion ?? MCP_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'open-artifact', version },
        instructions: tools.instructions(caller.workspace),
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: tools.definitions() });
    case 'tools/call': {
      const meta = params?._meta ?? {};
      const metaSession = meta.sessionId ?? meta.threadId;
      const who: SessionRef = { ...caller, ...(metaSession ? { session: metaSession } : {}) };
      const result = await tools.call(String(params?.name ?? ''), params?.arguments ?? {}, who);
      const isError = !!result?.error && Object.keys(result).filter((k) => k !== 'messages').length === 1;
      const { messages, ...rest } = result ?? {};
      const content = [{ type: 'text', text: JSON.stringify(rest, null, 2) }];
      // Messages that waited for this session: plain text after the result, as a person's message would read.
      for (const text of messages ?? []) content.push({ type: 'text', text });
      return reply({ content, isError });
    }
    default:
      if (id === undefined) return null;
      return fail(RPC_ERRORS.methodNotFound, `Method not found: ${method}`);
  }
}
