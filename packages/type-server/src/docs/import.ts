/**
 * A Markdown, Word or PDF file as tabs of a doc: the CLI's `import` and the page's Import file both end up here. What
 * the readers write is what the page's schema holds (a final `shapeProblems` check keeps it so), and images go where
 * the artifact keeps its uploads (blobs.ts).
 *
 * The readers don't touch the store. Each returns what the file holds, and blocks get their ids here, from the session
 * that writes them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { type Block, blobRef, blockHref, blocksFromJson, DocAnchors, type DocState, type IdSource, imageInfo, newBlock, safeHref, shapeProblems, tabBlockHref, walk } from '@open-artifact/docs-core';
import { blobIdOf, putDocBlob } from './blobs.ts';
import type { Changes } from './calls.ts';
import { readDocx } from './import-docx.ts';
import { readMarkdown } from './import-markdown.ts';
import { readPdf } from './import-pdf.ts';
import { DocStore, MANIFEST_FILE, shortId, StoreError } from './store.ts';

export type Json = Record<string, unknown>;

export const IMPORT_FORMATS = ['markdown', 'docx', 'pdf'] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];
/** As the page's own limit on an upload, with room for a PDF's fonts. */
export const IMPORT_MAX_BYTES = 64 * 1024 * 1024;

/** Why a file was not imported. `code` is for the page's message and the CLI's answer. */
export class ImportRefusal extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface ImportNote {
  /** What it is about, in a few words: the page and the CLI show them as they are. */
  what: string;
  count: number;
}

/** What didn't come across whole, counted, for the person to know. */
export class ImportNotes {
  private counts = new Map<string, ImportNote>();

  add(what: string, count = 1): void {
    const note = this.counts.get(what);
    if (note) note.count += count;
    else this.counts.set(what, { what, count });
  }

  list(): ImportNote[] {
    return [...this.counts.values()];
  }
}

export interface ImageOptions {
  alt?: string | undefined;
  name?: string | undefined;
  /** The size it is shown at, when the file says so; else its size in pixels. */
  dims?: { w: number; h: number } | undefined;
}

/** A reader's images: kept until the import writes them, each answered with the `media` node that shows it. */
export class ImportImages {
  readonly blobs = new Map<string, Uint8Array>();

  /** The node, or null when the bytes are not a picture the page can show. */
  node(bytes: Uint8Array, options: ImageOptions = {}): Json | null {
    const info = imageInfo(bytes);
    if (!info) return null;
    const id = blobIdOf(bytes);
    this.blobs.set(id, bytes);
    const dims = options.dims ?? (info.width && info.height ? { w: info.width, h: info.height } : undefined);
    return {
      type: 'media',
      attrs: {
        blob: blobRef(id),
        mime: info.mime,
        ...(options.name ? { name: options.name.slice(0, 512) } : {}),
        ...(options.alt ? { alt: options.alt } : {}),
        ...(dims ? { dims } : {}),
      },
    };
  }
}

export interface ImportedTab {
  /** A name of its own (a markdown file's `<!-- tab: … -->`); else it goes by the file's. */
  name?: string;
  /** Its blocks, given the ids they are to take. */
  make(ids: IdSource): Block[];
}

export interface Imported {
  format: ImportFormat;
  /** The title the file gives itself, for a doc made from it. */
  title?: string | undefined;
  /** The file's name without its extension. */
  name: string;
  tabs: ImportedTab[];
  images: ImportImages;
  notes: ImportNotes;
}

/** A reader's blocks, as the page's ProseMirror-style JSON (content.ts). */
export const fromJson = (content: Json[]) => (ids: IdSource) => blocksFromJson(content, ids);

const baseName = (name: string) => path.basename(name).replace(/\.[A-Za-z0-9]{1,8}$/, '').replace(/[\u0000-\u001f/\\]+/g, ' ').trim() || 'Imported';

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd', 'txt']);

/** By the name for text, which has no header, and for the rest by what the bytes are. */
export function formatOf(name: string, bytes: Uint8Array): ImportFormat {
  const head = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 1024)).toString('latin1');
  const extension = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';
  // First: a markdown file may well talk about PDFs in its first lines.
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown';
  if (head.includes('%PDF-')) return 'pdf';
  if (head.startsWith('PK\x03\x04')) {
    if (extension === 'docx' || extension === '') return 'docx';
    throw new ImportRefusal('bad_format', `${path.basename(name)} isn't a file to import: a doc takes Markdown (.md), text (.txt), Word (.docx) or PDF (.pdf).`, 415);
  }
  // An old Word file, or a .docx with a password: both are this kind of container.
  if (head.startsWith('\xd0\xcf\x11\xe0')) throw new ImportRefusal('old_word', `${path.basename(name)} is an old Word file or has a password. Save it as a .docx without one, then import that.`, 415);
  throw new ImportRefusal('bad_format', `${path.basename(name)} isn't a file to import: a doc takes Markdown (.md), text (.txt), Word (.docx) or PDF (.pdf).`, 415);
}

export async function readImport(name: string, bytes: Uint8Array): Promise<Imported> {
  const format = formatOf(name, bytes);
  const images = new ImportImages();
  const notes = new ImportNotes();
  const base = { format, name: baseName(name), images, notes };
  if (format === 'markdown') return { ...base, ...readMarkdown(bytes, images, notes) };
  if (format === 'docx') return { ...base, ...readDocx(bytes, images, notes) };
  return { ...base, ...(await readPdf(bytes, images, notes)) };
}

/**
 * Links only to where a reader should go: a web address, as the exports judge them (a file's `javascript:` stays
 * words), or a heading of the file. A markdown file names its headings as GitHub does (`#risks`, the second
 * `#risks-1`), as the export writes them, or as the page does; such a link gets the heading's new id as the page's link
 * box writes it (`#<block id>~risks`), with its tab's id in front when the heading is in another tab. One to a heading
 * the file doesn't have keeps its words.
 */
function settleLinks(tabs: { id: string; blocks: Block[] }[]): void {
  const anchors = new DocAnchors(tabs, { file: true });
  tabs.forEach(({ blocks }, index) => {
    for (const { block } of walk(blocks)) {
      for (const item of block.inline ?? []) {
        const link = item.marks?.link;
        if (link === undefined || safeHref(link)) continue;
        const target = anchors.resolve(link, index);
        if (target) {
          const tab = tabs[target.tab]!;
          item.marks!.link = target.tab === index ? blockHref(target.block ?? tab.blocks[0]!) : target.block ? tabBlockHref(tab.id, target.block) : `#${tab.id}`;
          continue;
        }
        delete item.marks!.link;
        if (!Object.keys(item.marks!).length) delete item.marks;
      }
    }
  });
}

const firstHeading = (blocks: Block[]) => {
  const first = blocks.find(block => block.type === 'paragraph' && block.attrs?.heading);
  return first?.inline?.map(item => ('ch' in item ? item.ch : '')).join('').trim() || undefined;
};

/** The tabs' blocks, checked against what the page can open: one misfit anywhere and it refuses the whole tab. */
/** Each with the id its tab is to take, which a link from another tab names. */
function makeTabs(imported: Imported, ids: IdSource): { id: string; name?: string | undefined; blocks: Block[] }[] {
  const tabs = imported.tabs.map(tab => {
    const blocks = tab.make(ids);
    if (!blocks.length) blocks.push(newBlock('paragraph', ids.take()));
    return { id: shortId(), name: tab.name, blocks };
  });
  settleLinks(tabs);
  for (const { blocks } of tabs) {
    const problem = shapeProblems(blocks)[0];
    if (problem) throw new ImportRefusal('bad_shape', `The file came out in a shape the page can't open: ${problem.message}`);
  }
  return tabs;
}

/** A name no other tab has, as the page numbers its own. */
function freeName(store: DocStore, wanted: string): string {
  const taken = new Set(store.tabIds().map(id => store.tab(id).name));
  const name = wanted.slice(0, 200).trim() || 'Imported';
  if (!taken.has(name)) return name;
  for (let number = 2; ; number++) if (!taken.has(`${name} ${number}`)) return `${name} ${number}`;
}

/** Nothing written yet: one empty paragraph, as a new doc's first tab. */
const isBlank = (doc: DocState) => doc.blocks.length === 1 && doc.blocks[0]!.type === 'paragraph' && !doc.blocks[0]!.inline?.length && !doc.blocks[0]!.attrs?.heading;

export interface ImportAnswer {
  ok: true;
  format: ImportFormat;
  /** The new tabs, in order. */
  tabs: { id: string; name: string }[];
  bytes: number;
  images: number;
  notes: ImportNote[];
}

/**
 * New tabs in a doc, after the last one. A doc that holds nothing yet (one blank tab) has that tab give way, so importing
 * into a new doc doesn't leave an empty tab in front of the file.
 */
export function importIntoDoc(store: DocStore, imported: Imported, options: { tabName?: string | undefined; bytes: number }): { answer: ImportAnswer; changes: Changes } {
  store.assertUnlocked();
  const session = store.cliSession();
  const ids: IdSource = { take: () => `${session.sess}.${session.next++}` };
  const tabs = makeTabs(imported, ids);
  // The doc is the artifact's `doc/` folder; its images are the artifact's uploads.
  for (const bytes of imported.images.blobs.values()) putDocBlob(path.dirname(store.root), bytes);
  const blank = store.tabIds().length === 1 && isBlank(store.doc(store.tabIds()[0]!)) ? store.tabIds()[0]! : null;
  const made: { id: string; name: string }[] = [];
  store.begin();
  try {
    for (const tab of tabs) {
      const name = freeName(store, tab.name ?? (tabs.length === 1 && options.tabName ? options.tabName : imported.name));
      made.push({ id: store.addTab(name, tab.blocks, undefined, true, tab.id), name });
    }
    if (blank) store.deleteTab(blank);
    store.commit();
  } catch (error) {
    store.rollback();
    throw error;
  }
  store.saveSessions();
  return {
    answer: { ok: true, format: imported.format, tabs: made, bytes: options.bytes, images: imported.images.blobs.size, notes: imported.notes.list() },
    changes: { project: true, tabs: made.map(tab => tab.id) },
  };
}

/** What office tools leave in a file's title when nobody wrote one. */
const JUNK_TITLE = /^(untitled|document\d*|microsoft word\b|microsoft powerpoint\b|presentation\d*|.*\.(docx?|pdf|pptx?|indd)$)/i;

/** A new doc's name: what the person says; a markdown file's own title; the first heading; a title worth having; the file's name. */
function docNameOf(imported: Imported, tabs: { blocks: Block[] }[], given: string | undefined): string {
  const title = imported.title?.trim();
  if (given?.trim()) return given.trim();
  if (imported.format === 'markdown' && title) return title;
  return firstHeading(tabs[0]?.blocks ?? []) ?? (title && !JUNK_TITLE.test(title) ? title : imported.name);
}

/** A doc made from the file, in `root` (an artifact's `doc/` folder) that holds none. */
export function docFromImport(root: string, imported: Imported, options: { name?: string | undefined; bytes: number }): ImportAnswer & { created: { id: string; name: string; root: string } } {
  let tabs: { id: string; name?: string | undefined; blocks: Block[] }[] = [];
  let store: DocStore;
  try {
    store = DocStore.create(root, options.name?.trim() || imported.name, (_store, session) => {
      const ids: IdSource = { take: () => `${session.sess}.${session.next++}` };
      tabs = makeTabs(imported, ids);
      return tabs.map((tab, index) => ({ id: tab.id, name: tab.name ?? (tabs.length === 1 ? 'Tab 1' : `Tab ${index + 1}`), blocks: tab.blocks }));
    });
  } catch (error) {
    if (error instanceof StoreError) throw new ImportRefusal(error.code.toLowerCase(), error.message, 409);
    fs.rmSync(path.join(root, MANIFEST_FILE), { force: true });
    throw error;
  }
  store.rename(docNameOf(imported, tabs, options.name));
  for (const bytes of imported.images.blobs.values()) putDocBlob(path.dirname(root), bytes);
  return {
    ok: true,
    format: imported.format,
    created: { id: store.id, name: store.manifest.name, root },
    tabs: store.tabIds().map(id => ({ id, name: store.tab(id).name })),
    bytes: options.bytes,
    images: imported.images.blobs.size,
    notes: imported.notes.list(),
  };
}
