import { isPlainObject, type CachedToolResult, type McpToolResult, type UnknownRecord } from '@open-artifact/data-core';
import { sha256Hex } from './hash.ts';
import { stableStringify } from './util.ts';

const DAY_MS = 86_400_000;
/** A cached answer is kept at least a day, so a page opened again soon shows it while it loads. */
export const TOOL_CACHE_MIN_GC_MS = DAY_MS;
/** Nothing is kept longer than a week. */
export const TOOL_CACHE_MAX_AGE_MS = 7 * DAY_MS;
/** Answers bigger than this (as JSON text) aren't kept: browser storage is small. */
export const TOOL_CACHE_MAX_ENTRY_CHARS = 1_000_000;

const KEY_PREFIX = 'open-artifact-data:tool-cache:';
const ENTRY_VERSION = 1;

/** How long a tool's answers are kept for answers reused up to `ms` old: at least a day, at most a week. */
export function getToolCacheGcTime(ms: number): number {
  return Math.min(TOOL_CACHE_MAX_AGE_MS, Math.max(TOOL_CACHE_MIN_GC_MS, ms));
}

export interface ToolResultCache {
  /** The answer stored for this call at most `maxAgeMs` ago, marked with `cache.storedAt`. */
  read(connector: string, tool: string, args: UnknownRecord, maxAgeMs: number): CachedToolResult | null;
  write(connector: string, tool: string, args: UnknownRecord, result: McpToolResult): void;
  /** Drops every answer of this cache's scope. */
  clear(): void;
}

export interface ToolResultCacheOptions {
  storage?: () => Storage | undefined;
  /** Separates the answers of one dashboard from another's (its address). */
  scope?: string;
  now?: () => number;
}

interface StoredEntry {
  v: number;
  at: number;
  result: McpToolResult;
}

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function parseEntry(text: string | null): StoredEntry | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!isPlainObject(value) || value.v !== ENTRY_VERSION || typeof value.at !== 'number' || !isPlainObject(value.result))
      return null;
    return { v: ENTRY_VERSION, at: value.at, result: value.result as McpToolResult };
  } catch {
    return null;
  }
}

function storageKeys(storage: Storage, prefix: string): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key !== null && key.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

/** A tool answer cache in browser storage: every read and write is guarded, so a full or blocked storage only means no cache. */
export function createToolResultCache({ storage = defaultStorage, scope = '', now = Date.now }: ToolResultCacheOptions = {}): ToolResultCache {
  const prefix = `${KEY_PREFIX}${scope}:`;
  const keyOf = (connector: string, tool: string, args: UnknownRecord): string =>
    prefix + sha256Hex(stableStringify([connector, tool, args]) ?? '');
  let pruned = false;
  const prune = (target: Storage, dropAll = false): void => {
    try {
      const time = now();
      for (const key of storageKeys(target, KEY_PREFIX)) {
        const entry = parseEntry(target.getItem(key));
        if (dropAll || entry === null || time - entry.at > TOOL_CACHE_MAX_AGE_MS || entry.at > time + DAY_MS) target.removeItem(key);
      }
    } catch {
      return;
    }
  };
  const open = (): Storage | undefined => {
    let target: Storage | undefined;
    try {
      target = storage();
    } catch {
      return undefined;
    }
    if (target !== undefined && !pruned) {
      pruned = true;
      prune(target);
    }
    return target;
  };
  return {
    read(connector, tool, args, maxAgeMs) {
      const target = open();
      if (target === undefined) return null;
      try {
        const entry = parseEntry(target.getItem(keyOf(connector, tool, args)));
        if (entry === null) return null;
        const age = now() - entry.at;
        if (age > Math.min(maxAgeMs, TOOL_CACHE_MAX_AGE_MS) || age < -DAY_MS) return null;
        return { result: { ...entry.result, cache: { storedAt: entry.at } }, at: entry.at };
      } catch {
        return null;
      }
    },
    write(connector, tool, args, result) {
      const target = open();
      if (target === undefined || result.isError === true) return;
      const { cache: _cache, ...answer } = result;
      let text: string;
      try {
        text = JSON.stringify({ v: ENTRY_VERSION, at: now(), result: answer });
      } catch {
        return;
      }
      if (text.length > TOOL_CACHE_MAX_ENTRY_CHARS) return;
      const key = keyOf(connector, tool, args);
      try {
        target.setItem(key, text);
      } catch {
        prune(target, true);
        try {
          target.setItem(key, text);
        } catch {
          return;
        }
      }
    },
    clear() {
      const target = open();
      if (target === undefined) return;
      try {
        for (const key of storageKeys(target, prefix)) target.removeItem(key);
      } catch {
        return;
      }
    },
  };
}
