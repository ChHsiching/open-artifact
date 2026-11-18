/**
 * Builds the chart frame into one self-contained document, `assets/chart-frame.txt`, which the page fetches and gives
 * a sandboxed frame as its `srcdoc`. The document's policy runs its one script by hash and loads nothing from anywhere:
 * the worker's code rides along as inert text, and the font and styles are inline.
 */
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { build as viteBuild, type Plugin, type Rollup } from 'vite';

const FRAME_FOLDER = fileURLToPath(new URL('./src/chart-frame/', import.meta.url));
const OUTPUT_FILE = 'assets/chart-frame.txt';
const WORKER_SCRIPT_ID = 'script-of-worker';

async function buildWorker(): Promise<string> {
  const { outputFiles } = await esbuild({
    entryPoints: [`${FRAME_FOLDER}worker.ts`],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    write: false,
  });
  const code = outputFiles[0]?.text;
  if (code === undefined) throw Error('the chart worker built to nothing');
  if (!code.includes('import(')) throw Error('the chart worker lost its import of the chart module');
  return code;
}

async function buildFrame(): Promise<{ script: string; style: string }> {
  const result = await viteBuild({
    configFile: false,
    root: FRAME_FOLDER,
    logLevel: 'warn',
    mode: 'production',
    plugins: [tailwindcss()],
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      target: 'es2022',
      minify: true,
      sourcemap: false,
      cssCodeSplit: false,
      assetsInlineLimit: () => true,
      modulePreload: false,
      rollupOptions: {
        input: `${FRAME_FOLDER}main.tsx`,
        output: { format: 'iife', inlineDynamicImports: true },
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          warn(warning);
        },
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((one) => ('output' in one ? one.output : []));
  const chunks = outputs.filter((output): output is Rollup.OutputChunk => output.type === 'chunk');
  const styles = outputs.filter((output): output is Rollup.OutputAsset => output.type === 'asset' && output.fileName.endsWith('.css'));
  const others = outputs.filter((output) => output.type === 'asset' && !output.fileName.endsWith('.css'));
  if (chunks.length !== 1 || styles.length !== 1 || others.length > 0)
    throw Error(`the chart frame built to ${outputs.map((output) => output.fileName).join(', ')}, not one script and one style`);
  const [chunk, style] = [chunks[0], styles[0]];
  if (chunk === undefined || style === undefined) throw Error('the chart frame built to nothing');
  return { script: chunk.code, style: String(style.source) };
}

/** Text that may sit inside a <script> or <style> element without ending it. */
const inertInElement = (text: string, element: 'script' | 'style'): string =>
  text.replace(new RegExp(`</(${element})`, 'gi'), '<\\/$1').replace(/<!--/g, '<\\!--');

const hashOf = (text: string): string => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

export function composeFrameDocument({ worker, script, style }: { worker: string; script: string; style: string }): string {
  const runs = inertInElement(script, 'script');
  const policy = [
    "default-src 'none'",
    `script-src ${hashOf(runs)} blob:`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    'worker-src blob:',
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
  return [
    '<!doctype html>',
    '<html><head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    '<meta name="referrer" content="no-referrer">',
    '<meta http-equiv="x-dns-prefetch-control" content="off">',
    '<title>Chart</title>',
    `<style>${inertInElement(style, 'style')}</style>`,
    '</head><body>',
    '<div id="chart"></div>',
    `<script type="text/plain" id="${WORKER_SCRIPT_ID}">${inertInElement(worker, 'script')}</script>`,
    `<script>${runs}</script>`,
    '</body></html>',
  ].join('');
}

/** Emits the chart frame's document beside the editor's assets. */
export function chartFramePage(): Plugin {
  return {
    name: 'sheets-chart-frame-page',
    apply: 'build',
    async generateBundle() {
      const [worker, { script, style }] = await Promise.all([buildWorker(), buildFrame()]);
      this.emitFile({ type: 'asset', fileName: OUTPUT_FILE, source: composeFrameDocument({ worker, script, style }) });
    },
  };
}
