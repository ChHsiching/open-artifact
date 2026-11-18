/** Draws a live block's source: CSV and Markdown at once, formulas and diagrams through renderers loaded on first use. */
import type mermaidApi from 'mermaid/dist/mermaid.core.mjs';
import type { LiveKind } from './languages.ts';
import { csvToHtml, markdownToHtml } from './render-text.ts';

export type LiveResult = { ok: true; html: string } | { ok: false; message: string };

export const EMPTY_TEXT: Record<LiveKind, string> = {
  csv: 'Empty table',
  latex: 'Empty formula',
  markdown: 'Empty markdown',
  mermaid: 'Empty diagram',
};

export const LOADING_TEXT: Partial<Record<LiveKind, string>> = {
  latex: 'Loading formula renderer…',
  mermaid: 'Rendering diagram…',
};

/** Whether the kind draws without loading anything. */
export const drawsAtOnce = (kind: LiveKind): boolean => kind === 'csv' || kind === 'markdown';

export function renderNow(kind: 'csv' | 'markdown', source: string): LiveResult {
  return { ok: true, html: kind === 'csv' ? csvToHtml(source) : markdownToHtml(source) };
}

async function renderLatex(source: string): Promise<LiveResult> {
  const [{ default: katex }] = await Promise.all([import('katex'), import('./katex-css.ts')]);
  try {
    return { ok: true, html: katex.renderToString(source, { displayMode: true, throwOnError: true }) };
  } catch (error) {
    if (error instanceof katex.ParseError) return { ok: false, message: error.rawMessage };
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

let mermaid: Promise<typeof mermaidApi> | null = null;
let mermaidTheme: string | null = null;
let queue: Promise<unknown> = Promise.resolve();
let serial = 0;

const isDark = () => {
  const root = document.documentElement;
  const theme = root.getAttribute('data-theme');
  return theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

async function renderMermaid(source: string): Promise<LiveResult> {
  mermaid ??= import('mermaid/dist/mermaid.core.mjs').then(module => module.default);
  const api = await mermaid;
  const theme = isDark() ? 'dark' : 'default';
  if (theme !== mermaidTheme) {
    api.initialize({ startOnLoad: false, securityLevel: 'strict', theme });
    mermaidTheme = theme;
  }
  const id = `code-diagram-${++serial}`;
  try {
    const { svg } = await api.render(id, source);
    return { ok: true, html: svg };
  } catch (error) {
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Draws a formula or diagram; diagrams one at a time, since the renderer keeps state while it works. */
export function renderLater(kind: 'latex' | 'mermaid', source: string): Promise<LiveResult> {
  if (kind === 'latex') return renderLatex(source).catch(error => ({ ok: false, message: String(error) }));
  const next = queue.then(() => renderMermaid(source)).catch((error: unknown) => ({ ok: false as const, message: String(error) }));
  queue = next;
  return next;
}
