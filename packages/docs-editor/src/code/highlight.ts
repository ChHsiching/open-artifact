/**
 * Syntax highlighting with highlight.js, loaded on first use with each grammar fetched when a block needs it. The
 * result is a list of classed ranges over the block's text, which the plugin turns into decorations.
 */
import type { HLJSApi, LanguageFn } from 'highlight.js';
import { AUTO_GRAMMARS } from './languages.ts';

export interface TokenRange {
  from: number;
  to: number;
  /** Space-separated token classes, e.g. `hljs-string`. */
  classes: string;
}

export interface Highlighted {
  ranges: TokenRange[];
  /** The grammar auto-detection chose (null when the block names its language, or nothing fit). */
  detected: string | null;
}

type GrammarModule = { default: LanguageFn };

const LOADERS: Readonly<Record<string, () => Promise<GrammarModule>>> = {
  bash: () => import('highlight.js/lib/languages/bash'),
  css: () => import('highlight.js/lib/languages/css'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  json: () => import('highlight.js/lib/languages/json'),
  latex: () => import('highlight.js/lib/languages/latex'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  python: () => import('highlight.js/lib/languages/python'),
  sql: () => import('highlight.js/lib/languages/sql'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  xml: () => import('highlight.js/lib/languages/xml'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
};

let core: HLJSApi | null = null;
let coreLoading: Promise<HLJSApi> | null = null;
const loaded = new Set<string>();
const loading = new Map<string, Promise<boolean>>();

function loadCore(): Promise<HLJSApi> {
  coreLoading ??= import('highlight.js/lib/core').then(module => {
    core = module.default;
    return core;
  });
  return coreLoading;
}

/** Whether the grammars `grammar` needs are loaded (all of auto-detection's for `auto`). */
export function grammarReady(grammar: string): boolean {
  if (!core) return false;
  return grammar === 'auto' ? AUTO_GRAMMARS.every(name => loaded.has(name)) : loaded.has(grammar);
}

/** Loads one grammar (or auto-detection's set); answers whether it can be used. */
export function loadGrammar(grammar: string): Promise<boolean> {
  if (grammar === 'auto') return Promise.all(AUTO_GRAMMARS.map(loadGrammar)).then(all => all.every(Boolean));
  const loader = LOADERS[grammar];
  if (!loader) return Promise.resolve(false);
  if (loaded.has(grammar)) return Promise.resolve(true);
  let pending = loading.get(grammar);
  if (!pending) {
    pending = Promise.all([loadCore(), loader()])
      .then(([hljs, module]) => {
        hljs.registerLanguage(grammar, module.default);
        loaded.add(grammar);
        return true;
      })
      .catch(() => false);
    loading.set(grammar, pending);
  }
  return pending;
}

/** Highlights `code` with a loaded grammar (or by detection, for `auto`); null when the grammar isn't loaded. */
export function highlight(code: string, grammar: string): Highlighted | null {
  if (!core || !grammarReady(grammar)) return null;
  if (!code) return { ranges: [], detected: null };
  if (grammar === 'auto') {
    const result = core.highlightAuto(code, [...AUTO_GRAMMARS]);
    const detected = result.language && (result.relevance ?? 0) > 2 ? result.language : null;
    return { ranges: detected ? htmlToRanges(result.value) : [], detected };
  }
  return { ranges: htmlToRanges(core.highlight(code, { language: grammar, ignoreIllegals: true }).value), detected: null };
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#x27': "'", '#39': "'" };

const decodeEntity = (name: string): string => {
  if (name in ENTITIES) return ENTITIES[name]!;
  if (name.startsWith('#x')) return String.fromCodePoint(parseInt(name.slice(2), 16));
  if (name.startsWith('#')) return String.fromCodePoint(parseInt(name.slice(1), 10));
  return `&${name};`;
};

/**
 * Reads highlight.js's HTML (nested `<span class>` and escaped text) as ranges over the plain text: each range is a
 * stretch of text with every class of the spans around it.
 */
export function htmlToRanges(html: string, keepPlain = false): TokenRange[] {
  const ranges: TokenRange[] = [];
  const open: string[] = [];
  let offset = 0;
  const push = (length: number) => {
    if (!length) return;
    const classes = open.filter(Boolean).join(' ');
    const last = ranges.at(-1);
    if (last && last.to === offset && last.classes === classes) last.to += length;
    else ranges.push({ from: offset, to: offset + length, classes });
    offset += length;
  };
  const tag = /<(\/?)span([^>]*)>|&(#?[a-z0-9]+);/gi;
  let at = 0;
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    push(match.index - at);
    at = match.index + match[0].length;
    if (match[3] !== undefined) push(decodeEntity(match[3]).length);
    else if (match[1]) open.pop();
    else open.push(/class="([^"]*)"/.exec(match[2] ?? '')?.[1] ?? '');
  }
  push(html.length - at);
  return keepPlain ? ranges : ranges.filter(range => range.classes);
}
