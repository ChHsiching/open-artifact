import type { McpCapability, McpServerEntry } from '@open-artifact/runtime';
import {
  isPlainObject,
  type CachePolicy,
  type CachedToolResult,
  type McpToolResult,
  type ToolCallOptions,
  type UnknownRecord,
} from '@open-artifact/data-core';
import type { ToolResultCache } from './tool-cache.ts';
import { stableStringify } from './util.ts';

export interface ConnectorTool {
  name: string;
  description?: string;
}

/** Tool calls through the page's `mcp` capability, with answers kept in a local cache. */
export interface McpToolClient {
  /**
   * Calls a connector's tool. With `options.cache` an answer stored within `staleTime` is used as is (marked with
   * `cache.storedAt`) unless `refresh` asks for a fresh one; a fresh answer is stored. Identical calls in flight
   * share one answer. Rejects like the capability.
   */
  call(connector: string, tool: string, args: UnknownRecord, options?: ToolCallOptions): Promise<McpToolResult>;
  /** Hears, once and soon, an answer stored for this call within `policy.gcTime`; returns a stop function. */
  watch(connector: string, tool: string, args: UnknownRecord, policy: CachePolicy, onCached: (cached: CachedToolResult) => void): () => void;
  /** The connectors the host knows, or `null` when it can't list them. */
  listServers(server?: string): Promise<McpServerEntry[] | null>;
  /** The tools of one connected connector, or of every connected one. */
  listTools(server?: string): Promise<ConnectorTool[]>;
}

export interface McpToolClientOptions {
  mcp: () => McpCapability | null;
  cache?: ToolResultCache | null;
}

/** What a call rejects with when the page has no `mcp` capability (a viewer who isn't the owner). */
export const MCP_UNAVAILABLE_ERROR = Object.freeze({
  code: 'not_granted',
  message: 'The mcp capability is not available to this view.',
});

function toToolResult(result: unknown): McpToolResult {
  return isPlainObject(result) ? { ...result } : { content: [] };
}

export function createMcpToolClient({ mcp, cache = null }: McpToolClientOptions): McpToolClient {
  const capability = (): McpCapability => {
    const found = mcp();
    if (found === null) throw { ...MCP_UNAVAILABLE_ERROR };
    return found;
  };
  const listServers = async (server?: string): Promise<McpServerEntry[] | null> => {
    const found = mcp();
    if (found === null || typeof found.listTools !== 'function') return null;
    const answer: unknown = await found.listTools(server);
    const servers = isPlainObject(answer) ? answer.servers : undefined;
    return Array.isArray(servers) ? (servers as McpServerEntry[]) : null;
  };
  const inFlight = new Map<string, Promise<McpToolResult>>();
  return {
    async call(connector, tool, args, options) {
      const policy = options?.cache;
      if (cache !== null && policy !== undefined && policy.refresh !== true && policy.staleTime !== undefined && policy.staleTime > 0) {
        const cached = cache.read(connector, tool, args, policy.staleTime);
        if (cached !== null) return cached.result;
      }
      const key = stableStringify([connector, tool, args]) ?? '';
      let flight = inFlight.get(key);
      if (flight === undefined) {
        const started = Promise.resolve()
          .then(() => capability().callTool(connector, tool, args))
          .then(toToolResult)
          .finally(() => {
            if (inFlight.get(key) === started) inFlight.delete(key);
          });
        flight = started;
        inFlight.set(key, flight);
      }
      const result = await flight;
      if (cache !== null && policy !== undefined && result.isError !== true) cache.write(connector, tool, args, result);
      return { ...result };
    },
    watch(connector, tool, args, policy, onCached) {
      let stopped = false;
      if (cache !== null && policy.refresh !== true)
        queueMicrotask(() => {
          if (stopped) return;
          const cached = cache.read(connector, tool, args, policy.gcTime);
          if (cached !== null) onCached(cached);
        });
      return () => {
        stopped = true;
      };
    },
    listServers,
    async listTools(server) {
      const servers = await listServers(server);
      if (servers === null) return [];
      const tools: ConnectorTool[] = [];
      for (const entry of servers as unknown[]) {
        if (!isPlainObject(entry)) continue;
        const matches = server === undefined ? entry.kind !== 'artifact' : entry.server === server;
        if (!matches || entry.authStatus !== 'connected' || !Array.isArray(entry.tools)) continue;
        for (const item of entry.tools as unknown[]) {
          if (!isPlainObject(item)) continue;
          const { name, description } = item;
          if (typeof name === 'string' && name.length > 0)
            tools.push({ name, ...(typeof description === 'string' ? { description } : {}) });
        }
      }
      return tools;
    },
  };
}
