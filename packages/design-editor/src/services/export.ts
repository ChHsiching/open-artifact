/**
 * Exports of artboards, from the focused view's Export menu: PNG at 1× / 2×
 * (or at a screen width, full length), JPEG at 1× / 2×, PDF (one page per
 * artboard at its own size; a Flow artboard — `print: "flow"` — laid out at
 * its paper's width and cut into paper pages; every page with a selectable
 * text layer, its web links and an outline bookmark per artboard), the
 * artboard's HTML with what it uses as a .zip or as one self-contained file,
 * a frameless HTML page for Figma's capture extension, every artboard of the
 * page as one PDF or a .zip of PNGs, and the whole canvas as a folder of web
 * pages with an index and a README.
 *
 * Each export renders the artboard in a hidden frame of the size it needs,
 * so what the focused view shows (its width, its scroll, its state) does not
 * change the file.
 *
 * Packing (PNG re-compression, PDF assembly, zip) runs in the export Worker
 * (`@open-artifact/wasm-export`), so only rendering each artboard happens
 * on the page's thread.
 *
 * The Shell's Export tab runs the same exports ({@link runJob}); the formats
 * it lists come from `lib/export-formats.ts`.
 */

import type { BoardBoot } from '@open-artifact/dc';
import { boardsOnPage, pageOf, type BoardEntry } from '@open-artifact/design-core';
import { saveFile } from '@open-artifact/editor-kit';
import { toast } from '@open-artifact/ui';
import { groupLines, maxCaptureScale } from '@open-artifact/export-kit';
import { buildPdf, optimizePng, packZip, PT_PER_PX, type PdfPage, type ZipEntry } from '@open-artifact/wasm-export';
import type { ExportJob } from '../lib/export-formats.ts';
import { assetName, blobRefs, canvasIndexHtml, dataUrl, exportReadme, relativePath, rewriteRefs, standaloneDocument, TEXT_FILE, type ExportedBoard } from '../lib/export-html.ts';
import { dirOf, frameDocument } from '../lib/frame.ts';
import { flowPages, flowPaper, type PageSlice } from '../lib/pagination.ts';
import { pageBookmark, pageLinks, pageRuns } from '../lib/pdf-text.ts';
import { useDocument } from '../state/document.ts';
import { useView } from '../state/view.ts';
import { CAPTURE_LIMITS, captureHtml, pageImage } from './capture.ts';
import { documentBackground, documentBands, documentHeight, documentKeepBlocks, documentLinks, documentWords } from './print.ts';
import { artifactPath, projectPath, session } from './session.ts';

/* --------------------------------- sizes ---------------------------------- */

/** One PNG size of an artboard. */
export interface ScaleOption {
  scale: number;
  width: number;
  height: number;
  fits: boolean;
}

/** The PNG sizes of an artboard (1× and 2×), and whether each can be captured. */
export function pngOptions(width: number, height: number): ScaleOption[] {
  const max = maxCaptureScale(width, height, CAPTURE_LIMITS);
  return [1, 2].map((scale) => ({ scale, width: Math.round(width * scale), height: Math.round(height * scale), fits: scale <= max + 1e-9 }));
}

/** Artboards of a page in canvas position order (rows, top to bottom, then left to right). */
export function pageArtboards(page: string | null): string[] {
  const { canvas } = useDocument.getState();
  return boardsOnPage(canvas, page).sort((a, b) => {
    const A = canvas.boards[a]!;
    const B = canvas.boards[b]!;
    return A.y - B.y || A.x - B.x;
  });
}

/** The page an artboard is on. */
export function pageOfBoard(path: string): string | null {
  const { canvas } = useDocument.getState();
  const entry = canvas.boards[path];
  return entry ? pageOf(canvas, entry) : null;
}

/* ------------------------------ hidden frames ------------------------------ */

/** Absolute URLs the frame document needs (as BoardFrame). */
const urls = () => ({ runtime: new URL('support.js', location.href).toString(), project: new URL('project/', location.href).toString() });

const BOOT_TIMEOUT = 15000;

/**
 * Renders an artboard in a hidden frame of `width` × `height` and runs
 * `capture` on its document once it settled. `fullLength` grows the frame to
 * the page's full height first.
 */
async function withBoard<T>(path: string, size: { width: number; height: number; fullLength?: boolean }, capture: (doc: Document, width: number, height: number) => Promise<T>): Promise<T> {
  const source = useDocument.getState().boards[path]?.source;
  if (source == null) throw new Error('The artboard has not loaded.');
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  // In the viewport (browsers pause frames far off screen), but invisible.
  Object.assign(iframe.style, { position: 'fixed', left: '0', top: '0', width: `${size.width}px`, height: `${size.height}px`, border: '0', opacity: '0', pointerEvents: 'none', zIndex: '-1' });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The artboard took too long to render.')), BOOT_TIMEOUT);
      const boot: BoardBoot = {
        path,
        source,
        mode: 'play',
        props: useView.getState().overrides[path] ?? {},
        load: async (target) => useDocument.getState().boards[target]?.source ?? session().artifact.readText(artifactPath(target)),
        report: (event) => {
          if (event.type !== 'booted') return;
          clearTimeout(timer);
          resolve();
        },
      };
      iframe.__dcBoot = boot;
      iframe.srcdoc = frameDocument(path, source, urls());
      document.body.appendChild(iframe);
    });
    const doc = iframe.contentDocument!;
    await settle(doc);
    let height = size.height;
    if (size.fullLength) {
      height = Math.max(size.height, Math.ceil(doc.documentElement.scrollHeight));
      iframe.style.height = `${height}px`;
      await settle(doc);
      height = Math.max(height, Math.ceil(doc.documentElement.scrollHeight));
      iframe.style.height = `${height}px`;
    }
    return await capture(doc, size.width, height);
  } finally {
    iframe.remove();
  }
}

/** Waits for fonts, images and two frames of rendering. */
async function settle(doc: Document): Promise<void> {
  const view = doc.defaultView!;
  await Promise.race([
    Promise.all([
      doc.fonts?.ready,
      ...[...doc.images]
        .filter((image) => !image.complete)
        .map(
          (image) =>
            new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
            }),
        ),
    ]),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  await new Promise((resolve) => view.requestAnimationFrame(() => view.requestAnimationFrame(resolve)));
  await new Promise((resolve) => setTimeout(resolve, 60));
}

/* ---------------------------------- files ---------------------------------- */

const entryOf = (path: string): BoardEntry => {
  const entry = useDocument.getState().canvas.boards[path];
  if (!entry) throw new Error('This artboard is no longer on the canvas.');
  return entry;
};

/** A file name from a title (no path separators or reserved characters). */
function fileName(base: string, extension: string): string {
  const clean = base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Artboard';
  return `${clean}.${extension}`;
}

const boardName = (path: string): string => useDocument.getState().canvas.boards[path]?.title || path.replace(/^.*\//, '').replace(/\.dc\.html$/, '');

/** Hands a file to the host, or the browser, to save. */
async function save(name: string, data: Blob): Promise<void> {
  const saved = await saveFile(session().downloads, name, data, 10_000);
  if (saved.to === 'host') toast.add({ title: `Exported ${name}`, description: saved.savedTo });
}

const blobOf = (bytes: Uint8Array, type: string) => new Blob([bytes as Uint8Array<ArrayBuffer>], { type });

/* --------------------------------- exports --------------------------------- */

let busy = false;

/** True while an export runs. */
export const exportBusy = (): boolean => busy;

/**
 * Who asked for an export: the page's own menu (`page`), whose outcome the
 * page shows, or the Shell's Export tab (`shell`), which says itself when
 * one is busy or failed.
 */
export type ExportFrom = 'page' | 'shell';

/** What became of an export. */
export type ExportOutcome = { state: 'done' } | { state: 'busy' } | { state: 'failed'; reason: string };

/** Runs one export at a time, reporting failures. */
async function run(label: string, work: () => Promise<void>, from: ExportFrom = 'page'): Promise<ExportOutcome> {
  if (busy) {
    if (from === 'page') toast.add({ title: 'Still exporting…' });
    return { state: 'busy' };
  }
  busy = true;
  const progress = toast.add({ title: `Exporting ${label}…`, timeout: 0 });
  try {
    await work();
    return { state: 'done' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (from === 'page') toast.add({ title: `Couldn’t export ${label}`, description: reason });
    return { state: 'failed', reason };
  } finally {
    toast.close(progress);
    busy = false;
  }
}

/** Runs an export the Shell's Export tab asked for. */
export function runJob(job: ExportJob, from: ExportFrom = 'shell'): Promise<ExportOutcome> {
  switch (job.kind) {
    case 'png':
      return exportPng(job.path, job.scale, job.width, from);
    case 'pngAll':
      return exportAllPng(job.page, from);
    case 'jpeg':
      return exportJpeg(job.path, job.scale, from);
    case 'pdf':
      return exportPdf(job.path, from);
    case 'pdfAll':
      return exportAllPdf(job.page, from);
    case 'html':
      return exportHtmlZip(job.path, from);
    case 'single':
      return exportSingleHtml(job.path, from);
    case 'figma':
      return exportFigmaHtml(job.path, from);
    case 'site':
      return exportCanvasZip(from);
  }
}

/** The artboard as a PNG at its own size (`scale` 1 or 2), or at `width` wide and full length. */
export function exportPng(path: string, scale: number, width?: number, from?: ExportFrom): Promise<ExportOutcome> {
  return run('PNG', async () => {
    const entry = entryOf(path);
    const size = width ? { width, height: entry.h, fullLength: true } : { width: entry.w, height: entry.h };
    const blob = await withBoard(path, size, (doc, w, h) => pageImage(doc, w, h, { scale }));
    const suffix = width ? ` ${width}w` : '';
    await save(fileName(`${boardName(path)}${suffix}${scale > 1 ? `@${scale}x` : ''}`, 'png'), blobOf(await optimizePng(blob), 'image/png'));
  }, from);
}

/** The artboard as a JPEG at its own size (`scale` 1 or 2), on white. */
export function exportJpeg(path: string, scale: number, from?: ExportFrom): Promise<ExportOutcome> {
  return run('JPEG', async () => {
    const entry = entryOf(path);
    const blob = await withBoard(path, { width: entry.w, height: entry.h }, (doc, w, h) => pageImage(doc, w, h, { scale, type: 'image/jpeg' }));
    await save(fileName(`${boardName(path)}${scale > 1 ? `@${scale}x` : ''}`, 'jpg'), blob);
  }, from);
}

/** Most pages one PDF holds. */
const MAX_PDF_PAGES = 2000;

/**
 * PDF pages of artboards. A fixed artboard is one page at its size; a Flow
 * artboard is laid out at its paper's width, full length, and cut into
 * paper pages between lines (lib/pagination.ts). Every page carries the
 * words it shows as invisible text, its web links, and its artboard's first
 * page a bookmark.
 */
async function pdfPages(paths: readonly string[]): Promise<PdfPage[]> {
  const pages: PdfPage[] = [];
  for (const path of paths) {
    if (pages.length >= MAX_PDF_PAGES) break;
    const entry = entryOf(path);
    const title = boardName(path);
    const paper = flowPaper(entry);
    const width = paper?.width ?? entry.w;
    const pageHeight = paper?.height ?? entry.h;
    const scale = Math.min(2, maxCaptureScale(width, pageHeight, CAPTURE_LIMITS));
    const out = await withBoard(path, { width, height: paper ? paper.height : entry.h, fullLength: Boolean(paper) }, async (doc, w, h) => {
      const lines = groupLines(documentWords(doc));
      const links = documentLinks(doc);
      const slices: PageSlice[] = paper
        ? flowPages({ contentHeight: Math.max(h, documentHeight(doc)), bands: documentBands(doc), blocks: documentKeepBlocks(doc) }, paper.height)
        : [{ top: 0, bottom: entry.h, offset: 0 }];
      const background = paper ? documentBackground(doc) : '#ffffff';
      const made: PdfPage[] = [];
      for (const [index, slice] of slices.entries()) {
        const jpeg = await pageImage(doc, w, pageHeight, {
          scale,
          type: 'image/jpeg',
          top: slice.top - slice.offset,
          background,
          ...(paper ? { keep: { from: slice.offset, to: slice.offset + slice.bottom - slice.top } } : {}),
        });
        const bookmark = pageBookmark(title, index);
        made.push({
          jpeg,
          pixelWidth: Math.max(1, Math.round(w * scale)),
          pixelHeight: Math.max(1, Math.round(pageHeight * scale)),
          width: w * PT_PER_PX,
          height: pageHeight * PT_PER_PX,
          text: pageRuns(lines, slice, w, PT_PER_PX),
          links: pageLinks(links, slice, w, PT_PER_PX),
          ...(bookmark ? { bookmark } : {}),
        });
      }
      return made;
    });
    pages.push(...out.slice(0, MAX_PDF_PAGES - pages.length));
  }
  return pages;
}

/** The artboard as a PDF: one page at its size, or paper pages for a Flow artboard. */
export function exportPdf(path: string, from?: ExportFrom): Promise<ExportOutcome> {
  return run('PDF', async () => {
    const name = boardName(path);
    await save(fileName(name, 'pdf'), blobOf(await buildPdf(await pdfPages([path]), { title: name }), 'application/pdf'));
  }, from);
}

/** Every artboard of the page as one PDF, in canvas position order. */
export function exportAllPdf(page: string | null, from?: ExportFrom): Promise<ExportOutcome> {
  return run('PDF', async () => {
    const paths = pageArtboards(page);
    if (!paths.length) throw new Error('This page has no artboards.');
    const title = pageTitle(page);
    await save(fileName(title, 'pdf'), blobOf(await buildPdf(await pdfPages(paths), { title }), 'application/pdf'));
  }, from);
}

/** Every artboard of the page as PNGs (2× where it fits) in a .zip. */
export function exportAllPng(page: string | null, from?: ExportFrom): Promise<ExportOutcome> {
  return run('PNGs', async () => {
    const paths = pageArtboards(page);
    if (!paths.length) throw new Error('This page has no artboards.');
    const entries: ZipEntry[] = [];
    const taken = new Set<string>();
    for (const path of paths) {
      const entry = entryOf(path);
      const scale = maxCaptureScale(entry.w, entry.h, CAPTURE_LIMITS) >= 2 ? 2 : 1;
      const blob = await withBoard(path, { width: entry.w, height: entry.h }, (doc, w, h) => pageImage(doc, w, h, { scale }));
      let name = fileName(boardName(path), 'png');
      for (let n = 2; taken.has(name); n++) name = fileName(`${boardName(path)} ${n}`, 'png');
      taken.add(name);
      entries.push({ name, data: blob });
    }
    await save(fileName(pageTitle(page), 'zip'), blobOf(await packZip(entries, { optimizePng: true }), 'application/zip'));
  }, from);
}

function pageTitle(page: string | null): string {
  const { canvas, title } = useDocument.getState();
  const name = canvas.pages.find((p) => p.id === page)?.name;
  return canvas.pages.length > 1 && name ? `${title || 'Design'} - ${name}` : title || name || 'Design';
}

/* ---------------------------------- HTML ----------------------------------- */

/** Every project file (not the index), as project paths. */
async function projectFiles(): Promise<string[]> {
  const listing = await session().artifact.list();
  return Object.keys(listing)
    .map(projectPath)
    .filter((file): file is string => file !== null && file !== 'canvas.json');
}

/** A project file's current content: an artboard as edited here, other text as text, the rest as bytes. */
async function readProjectFile(file: string): Promise<Uint8Array | string> {
  const { artifact } = session();
  const source = useDocument.getState().boards[file]?.source;
  if (source != null) return source;
  return TEXT_FILE.test(file) || file.endsWith('.svg') ? artifact.readText(artifactPath(file)) : artifact.readBytes(artifactPath(file));
}

/**
 * The artboard and what it uses: artboards it imports (by component name),
 * styles, scripts, images by base name, following what
 * those use in turn.
 */
async function usedFiles(path: string): Promise<Map<string, Uint8Array | string>> {
  const files = await projectFiles();
  const entries = new Map<string, Uint8Array | string>();
  const queue = [path];
  while (queue.length) {
    const file = queue.shift()!;
    if (entries.has(file)) continue;
    let data: Uint8Array | string;
    try {
      data = await readProjectFile(file);
    } catch {
      continue;
    }
    entries.set(file, data);
    if (typeof data !== 'string') continue;
    for (const other of files) {
      if (entries.has(other)) continue;
      const base = other.replace(/^.*\//, '');
      const used = other.endsWith('.dc.html') ? data.includes(`name="${base.replace(/\.dc\.html$/, '')}"`) : data.includes(base);
      if (used) queue.push(other);
    }
  }
  return entries;
}

/** The board runtime's code. */
const runtimeCode = (): Promise<string> =>
  fetch(urls().runtime).then((response) => (response.ok ? response.text() : Promise.reject(new Error('The board runtime could not be read.'))));

/** Uploads (`/_blob/…`) the text files name, read from the host; `missing` lists those that could not be read. */
async function readUploads(files: ReadonlyMap<string, Uint8Array | string>): Promise<{ found: Map<string, { data: Uint8Array; type: string | null }>; missing: { ref: string; usedIn: string[] }[] }> {
  const usedIn = new Map<string, string[]>();
  for (const [name, data] of files) {
    if (typeof data !== 'string') continue;
    for (const ref of blobRefs(data)) usedIn.set(ref, [...(usedIn.get(ref) ?? []), name]);
  }
  const found = new Map<string, { data: Uint8Array; type: string | null }>();
  const missing: { ref: string; usedIn: string[] }[] = [];
  for (const [ref, names] of usedIn) {
    try {
      const response = await fetch(new URL(ref, location.href));
      if (!response.ok) throw new Error(String(response.status));
      found.set(ref, { data: new Uint8Array(await response.arrayBuffer()), type: response.headers.get('content-type') });
    } catch {
      missing.push({ ref, usedIn: names });
    }
  }
  return { found, missing };
}

/**
 * Files for a folder export: uploads copied under `assets/` and every text
 * file's references to them rewritten to relative paths.
 */
function withAssets(files: ReadonlyMap<string, Uint8Array | string>, uploads: Map<string, { data: Uint8Array; type: string | null }>): ZipEntry[] {
  const names = new Map([...uploads].map(([ref, upload]) => [ref, assetName(ref, upload.type)]));
  const entries: ZipEntry[] = [];
  for (const [name, data] of files) {
    if (typeof data !== 'string' || !names.size) {
      entries.push({ name, data });
      continue;
    }
    const refs = new Map([...names].map(([ref, asset]) => [ref, relativePath(dirOf(name), asset)]));
    entries.push({ name, data: rewriteRefs(data, refs) });
  }
  for (const [ref, upload] of uploads) entries.push({ name: names.get(ref)!, data: upload.data });
  return entries;
}

/** A free name for a file the export adds, next to the project's own. */
function freeName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  for (let n = 2; ; n++) {
    const next = `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
    if (!taken.has(next)) return next;
  }
}

/** An artboard as the README and index describe it. */
function exportedBoard(path: string): ExportedBoard {
  const { canvas } = useDocument.getState();
  const entry = canvas.boards[path];
  const page = entry ? pageOf(canvas, entry) : null;
  return { path, title: boardName(path), width: entry?.w ?? 0, height: entry?.h ?? 0, page: canvas.pages.find((p) => p.id === page)?.name ?? '' };
}

/**
 * The artboard's source with what it uses (artboards it imports, styles,
 * scripts, images, uploads under `assets/`), the board runtime and a
 * README, as a .zip. Served from a folder, `{name}.dc.html` runs as it does
 * here.
 */
export function exportHtmlZip(path: string, from?: ExportFrom): Promise<ExportOutcome> {
  return run('HTML', async () => {
    const files = await usedFiles(path);
    const uploads = await readUploads(files);
    const zipped = withAssets(files, uploads.found);
    const taken = new Set(zipped.map((entry) => entry.name));
    const runtime = `${dirOf(path)}support.js`;
    zipped.push({ name: runtime, data: await runtimeCode() });
    zipped.push({
      name: freeName('README.md', taken),
      data: exportReadme({
        title: boardName(path),
        boards: [exportedBoard(path)],
        resources: [...files.keys()].filter((file) => file !== path),
        assets: uploads.found.size,
        missing: uploads.missing,
        runtimes: [dirOf(path)],
      }),
    });
    await save(fileName(boardName(path), 'zip'), blobOf(await packZip(zipped), 'application/zip'));
  }, from);
}

/**
 * The artboard as ONE .html file that runs offline: the runtime inlined,
 * linked styles and scripts inlined, images, fonts and uploads as data URLs,
 * imported artboards served to the runtime from the page itself.
 */
export function exportSingleHtml(path: string, from?: ExportFrom): Promise<ExportOutcome> {
  return run('HTML', async () => {
    const files = await usedFiles(path);
    const source = files.get(path);
    if (typeof source !== 'string') throw new Error('The artboard has not loaded.');
    files.delete(path);
    const uploads = await readUploads(new Map([...files, [path, source]]));
    const urls = new Map([...uploads.found].map(([ref, upload]) => [ref, dataUrl(assetName(ref, upload.type), upload.data)]));
    const html = standaloneDocument({ path, source, files, uploads: urls, runtime: await runtimeCode() });
    if (uploads.missing.length) toast.add({ title: `${uploads.missing.length} uploaded file${uploads.missing.length === 1 ? '' : 's'} could not be included`, description: uploads.missing.map((m) => m.ref).join(', ') });
    await save(fileName(boardName(path), 'html'), new Blob([html], { type: 'text/html' }));
  }, from);
}

/**
 * The whole canvas as a folder of web pages: every project file (artboards
 * as edited here), uploads under `assets/`, the board runtime next to every
 * artboard folder, an `index.html` linking every artboard page by page, and
 * a README.
 */
export function exportCanvasZip(from?: ExportFrom): Promise<ExportOutcome> {
  return run('canvas', async () => {
    const { canvas, trash, boards } = useDocument.getState();
    const listed = await projectFiles();
    const names = [...new Set([...listed, ...Object.keys(boards).filter((path) => boards[path]?.source != null && path in canvas.boards)])].filter((file) => !trash.includes(file));
    if (!names.some((file) => file in canvas.boards)) throw new Error('This canvas has no artboards.');
    const files = new Map<string, Uint8Array | string>();
    for (const file of names) {
      try {
        files.set(file, await readProjectFile(file));
      } catch {
        // A file that went away while exporting is left out.
      }
    }
    const uploads = await readUploads(files);
    const zipped = withAssets(files, uploads.found);
    const taken = new Set(zipped.map((entry) => entry.name));
    const runtime = await runtimeCode();
    const folders = [...new Set(names.filter((file) => file.endsWith('.dc.html')).map(dirOf))].sort();
    for (const folder of folders) {
      const name = `${folder}support.js`;
      if (taken.has(name)) continue;
      zipped.push({ name, data: runtime });
      taken.add(name);
    }
    const pages = canvas.pages.length ? canvas.pages.map((p) => p.id) : [null];
    const ordered = pages.flatMap((page) => pageArtboards(page)).filter((path) => files.has(path));
    const exported = ordered.map(exportedBoard);
    const title = useDocument.getState().title || canvas.title || 'Design';
    const index = freeName('index.html', taken);
    taken.add(index);
    zipped.push({ name: index, data: canvasIndexHtml(title, exported) });
    zipped.push({
      name: freeName('README.md', taken),
      data: exportReadme({
        title,
        boards: exported,
        resources: names.filter((file) => !(file in canvas.boards)).sort(),
        assets: uploads.found.size,
        missing: uploads.missing,
        runtimes: folders,
      }).replace('`index.html`', `\`${index}\``),
    });
    await save(fileName(title, 'zip'), blobOf(await packZip(zipped), 'application/zip'));
  }, from);
}
/** The artboard as one HTML page without frames or scripts, every style inline: for Figma's capture extension. */
export function exportFigmaHtml(path: string, from?: ExportFrom): Promise<ExportOutcome> {
  return run('HTML', async () => {
    const entry = entryOf(path);
    const html = await withBoard(path, { width: entry.w, height: entry.h }, async (doc) => {
      const parts: string[] = [];
      for (const child of [...doc.body.children]) {
        if (/^(script|style|template|noscript)$/i.test(child.localName)) continue;
        parts.push(await captureHtml(child));
      }
      const style = doc.defaultView!.getComputedStyle(doc.body).backgroundColor;
      const background = style === 'transparent' || style === 'rgba(0, 0, 0, 0)' ? '#ffffff' : style;
      const title = boardName(path).replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));
      return `<!doctype html>\n<html lang="${doc.documentElement.lang || 'en'}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=${entry.w}">\n<title>${title}</title>\n</head>\n<body style="margin: 0; width: ${entry.w}px; min-height: ${entry.h}px; background: ${background}">\n${parts.join('\n')}\n</body>\n</html>\n`;
    });
    await save(fileName(`${boardName(path)} (Figma)`, 'html'), new Blob([html], { type: 'text/html' }));
  }, from);
}
