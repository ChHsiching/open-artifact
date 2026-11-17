/**
 * The inline declaration of an original artifact type: a type's index.html
 * carries, near the top of its first script, a block that starts with the
 * line comment `// artifact.json` and declares
 * `var key = "<type key>"; var capabilities = {...}; var monitoring = {...};`
 * in some order (a type may leave capabilities out). Only that block is read:
 * it ends at the next line comment. The literals are evaluated in an empty V8
 * context with a short timeout, never in this process's realm.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const MARKER = '// artifact.json';
const NAMES = ['key', 'capabilities', 'monitoring'] as const;

/** A capability's declared config: `true`, or an object of options. */
export type CapabilityDecl = boolean | Record<string, unknown>;

export interface Declaration {
  /** The type key, when the block names one. */
  key: string | null;
  /** cap → declared config. */
  capabilities: Record<string, CapabilityDecl>;
  monitoring: Record<string, unknown>;
}

/** Whether `html` carries an inline declaration at all (a line of its own). */
export const DECLARATION_LINE = /(^|\n)[ \t]*\/\/ artifact\.json[ \t]*\r?\n/;

/** The declaration in a type's index.html, or null when the page carries none. Throws when the block does not evaluate. */
export function parseDeclaration(html: string): Declaration | null {
  const at = html.indexOf(MARKER);
  if (at < 0) return null;
  const from = at + MARKER.length;
  const next = /\n[ \t]*\/\/ /g;
  next.lastIndex = from;
  const stop = next.exec(html);
  const block = html.slice(from, stop ? stop.index : Math.min(html.length, from + 64 * 1024));
  const sandbox = Object.create(null) as Record<string, unknown>;
  try {
    vm.runInNewContext(block, sandbox, { timeout: 250, displayErrors: false, contextCodeGeneration: { strings: false, wasm: false } });
  } catch (error) {
    throw new Error(`The artifact.json block of index.html does not evaluate: ${(error as Error)?.message ?? error}`);
  }
  const out: Record<string, unknown> = {};
  for (const name of NAMES) {
    let value = sandbox[name];
    // Plain data only, in this realm.
    try {
      value = value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown);
    } catch {
      value = undefined;
    }
    out[name] = value;
  }
  return {
    key: typeof out.key === 'string' ? out.key : null,
    capabilities: isObject(out.capabilities) ? (out.capabilities as Record<string, CapabilityDecl>) : {},
    monitoring: isObject(out.monitoring) ? out.monitoring : {},
  };
}

/** The declaration of the type folder `dir` (its index.html), or null. */
export function readDeclaration(dir: string): Declaration | null {
  let html: string;
  try {
    html = readFileSync(join(dir, 'index.html'), 'utf8');
  } catch {
    return null;
  }
  return parseDeclaration(html);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
