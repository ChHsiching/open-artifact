/**
 * A PDF as a tab. A PDF says where glyphs stand, not what they are, so how much comes back depends on the file:
 *
 * - A tagged PDF (Chrome's and so this type's own PDF exports, Word's, most made today) names its headings, paragraphs, lists,
 *   tables, figures, bold, code and links in a structure tree. That is read as it stands (`Tagged`).
 * - Any other is read from its layout: lines by position, headings by font size, lists by their markers, tables by
 *   columns that line up (`Layout`). The notes say it was guessed.
 * - One with no text at all is scanned pages, and is refused: there is nothing to edit until it has been through OCR.
 *
 * Pictures come out as PNG (PDF.js hands over pixels). What a PDF has no record of doesn't come back: underlines and
 * highlights are drawn shapes, a chart drawn in lines is not a picture.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { crc32 } from '../archive.ts';
import { fromJson, ImportRefusal, type ImportedTab, type ImportImages, type ImportNotes, type Json } from './import.ts';

// ---- PDF.js, loaded when it is needed --------------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Dynamic = any;
type PdfJs = { getDocument: Dynamic; OPS: Record<string, number> };

let loading: Promise<PdfJs> | null = null;

/**
 * PDF.js is far larger than the rest of the server, so it loads only when a PDF is imported: `pdf-reader.mjs` beside a
 * built bundle, else the source module. Loading it prints a warning about a canvas it only wants for drawing: not on
 * this server's output.
 */
function loadPdfJs(): Promise<PdfJs> {
  loading ??= (async () => {
    const log = console.log;
    const warn = console.warn;
    console.log = () => {};
    console.warn = () => {};
    try {
      const built = new URL('./pdf-reader.mjs', import.meta.url);
      // Not a literal: a bundle leaves the reader to a file of its own.
      const reader = fs.existsSync(fileURLToPath(built)) ? built.href : new URL('./pdf-reader.ts', import.meta.url).href;
      return (await import(reader)) as PdfJs;
    } catch (error) {
      loading = null;
      throw error;
    } finally {
      console.log = log;
      console.warn = warn;
    }
  })();
  return loading;
}

/** The character maps older PDFs' fonts name: `pdf-cmaps/` beside a built bundle, else PDF.js's own. */
function cMapDir(): string {
  const beside = fileURLToPath(new URL('./pdf-cmaps/', import.meta.url));
  if (fs.existsSync(beside)) return beside;
  try {
    return `${path.join(path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'cmaps')}${path.sep}`;
  } catch {
    return beside;
  }
}

// ---- runs of text -----------------------------------------------------------------------------------------------------

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
  font: string;
}

interface Run extends TextItem {
  bold?: boolean | undefined;
  italic?: boolean | undefined;
  code?: boolean | undefined;
  link?: string | undefined;
}

/** A picture among the runs of a paragraph. */
interface MediaRun {
  media: Json;
}

type Piece = Run | MediaRun;
const isMedia = (piece: Piece): piece is MediaRun => 'media' in piece;

const MONO = /mono|courier|consol|menlo|monaco|code|typewriter/i;
const BOLD = /bold|black|heavy|semibold|demi/i;
const ITALIC = /italic|oblique/i;

/**
 * CJK text often comes out of a PDF's font in the radicals' code points, which look the same and search as nothing: 行
 * as U+2F8F, 长 as U+2ED3. Those and the compatibility ideographs go back to the ordinary characters, and nothing else
 * changes. Kangxi radicals have their mapping in NFKC; the supplement's are Unicode's EquivalentUnifiedIdeograph.txt.
 */
const RADICALS = new Map(Array.from('⺁厂⺂乛⺃乚⺄乙⺅亻⺆冂⺇𠘨⺈刀⺉刂⺊卜⺋㔾⺌小⺍小⺎兀⺏尣⺐尢⺑𡯂⺒巳⺓幺⺔彑⺕𫜹⺖忄⺗心⺘扌⺙攵⺛旡⺜日⺝月⺞歺⺟母⺠民⺡氵⺢氺⺣灬⺤爫⺥爫⺦丬⺧牛⺨犭⺩王⺪𤴔⺫目⺬示⺭礻⺮𥫗⺯糹⺰纟⺱罓⺲罒⺳㓁⺴冗⺵𦉫⺶羊⺷𦍌⺸𦍋⺹耂⺺肀⺻聿⺼肉⺽𦥑⺾艹⺿艹⻀艹⻁虎⻂衤⻃覀⻄西⻅见⻆角⻇𧢲⻈讠⻉贝⻊𧾷⻋车⻌辶⻍辶⻎辶⻏邑⻐钅⻑長⻒镸⻓长⻔门⻕𨸏⻖阝⻗雨⻘青⻙韦⻚页⻛风⻜飞⻝食⻞𩙿⻟飠⻠饣⻡𩠐⻢马⻣骨⻤鬼⻥鱼⻦鸟⻧卤⻨麦⻩黄⻪黾⻫斉⻬齐⻭歯⻮齿⻯竜⻰龙⻱龜⻲亀⻳龟'.matchAll(/(.)(.)/gu), match => [match[1]!, match[2]!] as const));
const clean = (text: string) => text.replace(/[\u2e80-\u2fdf\uf900-\ufaff]/g, ch => RADICALS.get(ch) ?? ch.normalize('NFKC'));

/** A wrapped line takes a space only between words in a script that puts spaces between them. */
const wantsSpace = (before: string, after: string) => /[\p{L}\p{N},.;:!?)\]%'"’”]$/u.test(before) && /^[\p{L}\p{N}(["'‘“]/u.test(after) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u.test(before) && !/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(after);

/** The room what starts a line would have taken on the line before: a word whole, or one character of a script that breaks anywhere. */
function firstWordWidth(run: { str: string; width: number; size: number }): number {
  const text = run.str.replace(/^\s+/, '');
  const word = /^[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/u.exec(text)?.[0];
  const each = run.str.length ? run.width / run.str.length : run.size / 2;
  return word ? word.length * each : run.size;
}

const marksOf = (run: Run, plain: boolean): Json[] => [
  ...(run.bold && !plain ? [{ type: 'bold' }] : []),
  ...(run.italic ? [{ type: 'italic' }] : []),
  ...(run.code ? [{ type: 'code' }] : []),
  ...(run.link ? [{ type: 'link', attrs: { href: run.link } }] : []),
];

/**
 * Runs in reading order as a paragraph's inline nodes. A line that stops well short of the longest one was ended on
 * purpose, a line break; a line that fills its width just wrapped.
 */
function inlineFrom(pieces: Piece[], options: { plain?: boolean } = {}): Json[] {
  const runs = pieces.filter((piece): piece is Run => !isMedia(piece) && piece.str !== '');
  const right = runs.reduce((most, run) => Math.max(most, run.x + run.width), 0);
  const out: Json[] = [];
  let last: Run | null = null;
  let tail = '';
  const push = (text: string, run: Run) => {
    if (!text) return;
    if (run.code && text.trim() && text !== text.trim()) {
      // A code mark shows its edges: the spaces around it stay outside.
      const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
      if (lead) push(lead, { ...run, code: false });
      push(body!, run);
      if (trail) push(trail, { ...run, code: false });
      return;
    }
    const marks = marksOf(run, options.plain === true);
    const previous = out[out.length - 1];
    if (previous?.type === 'text' && JSON.stringify(previous.marks ?? []) === JSON.stringify(marks)) previous.text = String(previous.text) + text;
    else out.push({ type: 'text', text, ...(marks.length ? { marks } : {}) });
    tail = text;
  };
  for (const piece of pieces) {
    if (isMedia(piece)) {
      out.push(piece.media);
      last = null;
      tail = '';
      continue;
    }
    if (piece.str === '') continue;
    const text = clean(piece.str);
    if (last) {
      const newLine = Math.abs(piece.y - last.y) > Math.max(last.size, piece.size) * 0.5;
      if (newLine) {
        // Room left for what starts the next line, so it was put there on purpose.
        if (right - (last.x + last.width) > firstWordWidth(piece) + last.size) out.push({ type: 'hardBreak' });
        else if (wantsSpace(tail, text)) push(' ', last);
      } else if (piece.x - (last.x + last.width) > last.size * 0.15 && !/\s$/.test(tail) && !/^\s/.test(text) && wantsSpace(tail, text)) push(' ', last);
    }
    push(text, piece);
    last = piece;
  }
  return trimInline(out);
}

function trimInline(nodes: Json[]): Json[] {
  const out = nodes.filter((node, index) => node.type !== 'hardBreak' || (index > 0 && index < nodes.length - 1));
  const first = out[0];
  if (first?.type === 'text') first.text = String(first.text).replace(/^\s+/, '');
  const last = out[out.length - 1];
  if (last?.type === 'text') last.text = String(last.text).replace(/\s+$/, '');
  return out.filter(node => node.type !== 'text' || node.text !== '');
}

const wordsOf = (nodes: Json[]) => nodes.map(node => (typeof node.text === 'string' ? node.text : '')).join('');

/** Runs as code lines, with what indents them, in the only form a code block has: plain text. */
function codeFrom(runs: Run[], pageRight: number): string {
  const left = runs.reduce((least, run) => Math.min(least, run.x), Number.POSITIVE_INFINITY);
  const lines: { text: string; x: number; y: number; size: number; end: number }[] = [];
  for (const run of runs) {
    if (run.str === '') continue;
    const line = lines[lines.length - 1];
    if (line && Math.abs(run.y - line.y) <= run.size * 0.5) {
      line.text += clean(run.str);
      line.end = Math.max(line.end, run.x + run.width);
    } else lines.push({ text: clean(run.str), x: run.x, y: run.y, size: run.size, end: run.x + run.width });
  }
  let out = '';
  lines.forEach((line, index) => {
    const previous = lines[index - 1];
    // A monospaced character is about 0.6 of the size wide, and a wide one takes the whole of it; a wide character can
    // wrap anywhere, a word only whole. So a line wrapped where what starts the next one would not have fitted before
    // the edge: the page's text edge, less about the padding of a code box.
    const word = /^\P{Script=Han}+?(?=\s|$|\p{Script=Han})/u.exec(line.text)?.[0] ?? '';
    const wanted = (word ? word.length * 0.6 : 1) * line.size;
    // A line that ends a statement ended there, however near the edge: splitting a long line costs less than joining two.
    const wrapped = previous && line.x <= left + line.size * 0.5 && !/[;,{}()[\]]\s*$/.test(previous.text) && previous.end + wanted + previous.size * 0.6 > pageRight - previous.size * 1.5;
    if (wrapped) out += (wantsSpace(out, line.text) ? ' ' : '') + line.text;
    else {
      // Spaces a PDF leaves out still indent the line.
      const indent = /^\s/.test(line.text) ? 0 : Math.round((line.x - left) / (line.size * 0.6));
      out += `${index ? '\n' : ''}${' '.repeat(Math.max(0, indent))}${line.text}`;
    }
  });
  return out.split('\n').map(line => line.replace(/\s+$/, '')).join('\n');
}

// ---- a page's parts ---------------------------------------------------------------------------------------------------

interface PageImage {
  id: string;
  mcid: number | null;
  /** Its top on the page, for reading order where there are no tags. */
  y: number;
  /** The size it is shown at, in PDF points. */
  shown: { w: number; h: number };
}

const multiply = (a: number[], b: number[]) => [a[0]! * b[0]! + a[2]! * b[1]!, a[1]! * b[0]! + a[3]! * b[1]!, a[0]! * b[2]! + a[2]! * b[3]!, a[1]! * b[2]! + a[3]! * b[3]!, a[0]! * b[4]! + a[2]! * b[5]! + a[4]!, a[1]! * b[4]! + a[3]! * b[5]! + a[5]!];

/** Each picture a page paints: what marks it, and where. Masks and stencils are parts of a drawing, not pictures. */
function imagesOf(list: Dynamic, OPS: Record<string, number>): PageImage[] {
  const out: PageImage[] = [];
  const marks: (number | null)[] = [];
  const saved: number[][] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  list.fnArray.forEach((fn: number, index: number) => {
    const args = list.argsArray[index];
    switch (fn) {
      case OPS.save:
        saved.push(ctm);
        break;
      case OPS.restore:
        ctm = saved.pop() ?? ctm;
        break;
      case OPS.transform:
        ctm = multiply(ctm, args);
        break;
      case OPS.beginMarkedContent:
        marks.push(null);
        break;
      case OPS.beginMarkedContentProps:
        marks.push(typeof args?.[1] === 'number' ? args[1] : null);
        break;
      case OPS.endMarkedContent:
        marks.pop();
        break;
      case OPS.paintImageXObject:
      case OPS.paintImageXObjectRepeat:
        out.push({
          id: String(args[0]),
          mcid: [...marks].reverse().find(mark => mark !== null) ?? null,
          y: Math.max(ctm[5]!, ctm[5]! + ctm[3]!),
          shown: { w: Math.abs(ctm[0]!) + Math.abs(ctm[2]!), h: Math.abs(ctm[1]!) + Math.abs(ctm[3]!) },
        });
        break;
      default:
        break;
    }
  });
  return out;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

/** Decoded pixels as a PNG. `kind` is PDF.js's: 1 is one bit a pixel, 2 is RGB, 3 is RGBA. */
function encodePng(image: { width: number; height: number; kind: number; data: Uint8Array | Uint8ClampedArray }): Buffer | null {
  const { width, height, kind, data } = image;
  const stride = kind === 1 ? Math.ceil(width / 8) : kind === 2 ? width * 3 : kind === 3 ? width * 4 : 0;
  if (!stride || data.length < stride * height) return null;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row++) raw.set(data.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = kind === 1 ? 1 : 8;
  header[9] = kind === 1 ? 0 : kind === 2 ? 2 : 6;
  return Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

/** Bigger than this is a scan or a poster, and takes a long time to encode for what it adds to a doc. */
const MAX_PIXELS = 50_000_000;
/** Smaller than this, shown or stored, is a rule, a bullet or a logo's corner. */
const MIN_SIDE = 8;

class PageReader {
  page: Dynamic;
  images: ImportImages;
  notes: ImportNotes;
  /** Text by marked content: `p<page>_mc<n>`. */
  text = new Map<string, Run[]>();
  /** All the text, in stream order. */
  runs: Run[] = [];
  placed: PageImage[] = [];
  private links = new Map<string, string>();
  private linkBoxes: { rect: number[]; url: string }[] = [];
  private prefix: string;

  constructor(page: Dynamic, images: ImportImages, notes: ImportNotes) {
    this.page = page;
    this.images = images;
    this.notes = notes;
    this.prefix = `p${page.ref?.num ?? ''}R${page.ref?.gen ? page.ref.gen : ''}_mc`;
  }

  async load(OPS: Record<string, number>): Promise<void> {
    const list = await this.page.getOperatorList();
    this.placed = imagesOf(list, OPS);
    for (const annotation of await this.page.getAnnotations()) {
      if (annotation.subtype !== 'Link' || !annotation.url) continue;
      this.links.set(`pdfjs_internal_id_${annotation.id}`, annotation.url);
      this.linkBoxes.push({ rect: annotation.rect, url: annotation.url });
    }
    const content = await this.page.getTextContent({ includeMarkedContent: true });
    const stack: (string | null)[] = [];
    for (const item of content.items) {
      if (item.type === 'beginMarkedContentProps' || item.type === 'beginMarkedContent') {
        stack.push(item.id ?? null);
        continue;
      }
      if (item.type === 'endMarkedContent') {
        stack.pop();
        continue;
      }
      if (typeof item.str !== 'string' || (item.str === '' && !item.hasEOL)) continue;
      const transform = item.transform as number[];
      const font = this.fontName(item.fontName);
      const run: Run = {
        str: item.str,
        x: transform[4]!,
        y: transform[5]!,
        width: item.width,
        size: Math.hypot(transform[2]!, transform[3]!) || item.height || 10,
        font,
        ...(BOLD.test(font) ? { bold: true } : {}),
        ...(ITALIC.test(font) ? { italic: true } : {}),
        ...(MONO.test(font) ? { code: true } : {}),
      };
      this.runs.push(run);
      const id = [...stack].reverse().find(Boolean);
      if (id) {
        const list = this.text.get(id);
        if (list) list.push(run);
        else this.text.set(id, [run]);
      }
    }
  }

  /** How far right the page's text reaches. */
  get right(): number {
    return this.runs.reduce((most, run) => Math.max(most, run.x + run.width), 0);
  }

  private fontName(id: string): string {
    try {
      return String(this.page.commonObjs.get(id)?.name ?? '');
    } catch {
      return '';
    }
  }

  linkOf(id: string): string | undefined {
    return this.links.get(id);
  }

  /**
   * A run with the links over it, for a PDF with no tags to say. PDF.js joins the words of a line into one run, so a link
   * box may cover only part of it: the part is found by width, as near as even spacing gets, and kept to whole words.
   */
  withLinks(run: Run): Run[] {
    const y = run.y + run.size / 3;
    const box = this.linkBoxes.find(({ rect }) => y >= rect[1]! && y <= rect[3]! && rect[0]! < run.x + run.width && rect[2]! > run.x);
    if (!box || !run.str.length || !run.width) return [run];
    const each = run.width / run.str.length;
    const snap = (at: number) => {
      const near = Math.max(0, Math.min(run.str.length, Math.round(at)));
      for (const step of [0, -1, 1, -2, 2]) if (/\s/.test(run.str[near + step] ?? '') || near + step === 0 || near + step === run.str.length) return near + step;
      return near;
    };
    const from = snap((box.rect[0]! - run.x) / each);
    const to = snap((box.rect[2]! - run.x) / each);
    if (to <= from) return [run];
    const part = (start: number, end: number, link?: string): Run => ({ ...run, str: run.str.slice(start, end), x: run.x + start * each, width: (end - start) * each, ...(link ? { link } : {}) });
    return [part(0, from), part(from, to, box.url), ...this.withLinks(part(to, run.str.length))].filter(piece => piece.str);
  }

  private async pixels(id: string): Promise<Dynamic> {
    const store = id.startsWith('g_') ? this.page.commonObjs : this.page.objs;
    return await new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), 5000);
      try {
        store.get(id, (image: unknown) => {
          clearTimeout(timer);
          resolve(image);
        });
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  /** A painted picture as a `media` node; null when it can't be, and the notes say so if it mattered. */
  async mediaOf(image: PageImage, figure?: { alt?: string | undefined }): Promise<Json | null> {
    const pixels = await this.pixels(image.id);
    if (!pixels?.data || !pixels.width || !pixels.height) {
      this.notes.add('picture PDF.js could not decode, left out');
      return null;
    }
    if (pixels.width * pixels.height > MAX_PIXELS) {
      this.notes.add('very large picture, left out');
      return null;
    }
    // A picture the file itself calls a figure is one, however small.
    if (!figure && (pixels.width < MIN_SIDE || pixels.height < MIN_SIDE || image.shown.w < MIN_SIDE || image.shown.h < MIN_SIDE)) return null;
    const png = encodePng(pixels);
    if (!png) {
      this.notes.add('picture PDF.js could not decode, left out');
      return null;
    }
    // A PDF point is 1/72 of an inch, and a CSS pixel 1/96.
    const dims = { w: Math.round((image.shown.w * 96) / 72), h: Math.round((image.shown.h * 96) / 72) };
    return this.images.node(png, { alt: figure?.alt, dims });
  }

  imageMarked(id: string): PageImage | undefined {
    return this.placed.find(image => image.mcid !== null && `${this.prefix}${image.mcid}` === id);
  }
}

// ---- tagged: read the structure tree ---------------------------------------------------------------------------------

interface StructNode {
  role?: string;
  type?: string;
  id?: string;
  alt?: string;
  children?: StructNode[];
}

const HEADING = /^H([1-6])$/;
const TEXT_ROLES = /^(P|H|H[1-6]|Caption|Title|Lbl|LBody|TOCI)$/;
const BLOCK_ROLES = /^(P|H|H[1-6]|L|LI|Table|TR|TH|TD|THead|TBody|TFoot|Figure|BlockQuote|Caption|Title|TOC|TOCI|Form|Formula)$/;
const CHECK_MARKS = /^\s*([☐□❏☑☒✓✔■])\s*$/;
const isDone = (mark: string) => /[☑☒✓✔■]/.test(mark);

class Tagged {
  private reader: PageReader;
  private notes: ImportNotes;
  private blockCache = new Map<StructNode, boolean>();

  constructor(reader: PageReader, notes: ImportNotes) {
    this.reader = reader;
    this.notes = notes;
  }

  /** Holds something that stands as a block: such a node can't be one paragraph. */
  private hasBlocks(node: StructNode): boolean {
    let known = this.blockCache.get(node);
    if (known === undefined) {
      known = (node.children ?? []).some(child => BLOCK_ROLES.test(child.role ?? '') || this.hasBlocks(child));
      this.blockCache.set(node, known);
    }
    return known;
  }

  /** The runs under a node, carrying the marks its roles give them. */
  private async collect(node: StructNode, marks: Partial<Run>, out: Piece[]): Promise<void> {
    if (node.type === 'content') {
      for (const run of this.reader.text.get(node.id ?? '') ?? []) out.push({ ...run, ...marks });
      return;
    }
    if (node.type === 'annotation' || node.type) return;
    if (node.role === 'Figure') {
      const media = await this.figure(node);
      if (media) out.push({ media });
      return;
    }
    const next: Partial<Run> = { ...marks };
    if (node.role === 'Strong') next.bold = true;
    if (node.role === 'Em') next.italic = true;
    if (node.role === 'Code') next.code = true;
    if (node.role === 'Link') {
      const annotation = node.children?.find(child => child.type === 'annotation');
      const href = annotation?.id ? this.reader.linkOf(annotation.id) : undefined;
      if (href) next.link = href;
    }
    for (const child of node.children ?? []) await this.collect(child, next, out);
  }

  private async figure(node: StructNode): Promise<Json | null> {
    const parts: StructNode[] = [];
    const gather = (item: StructNode) => {
      if (item.type === 'content') parts.push(item);
      (item.children ?? []).forEach(gather);
    };
    gather(node);
    for (const part of parts) {
      const image = this.reader.imageMarked(part.id ?? '');
      if (image) {
        const media = await this.reader.mediaOf(image, { alt: node.alt });
        if (media) return media;
      }
    }
    return null;
  }

  private paragraph(pieces: Piece[], heading = 0): Json | null {
    const content = inlineFrom(pieces, { plain: heading > 0 });
    if (!content.length) return null;
    return { type: 'paragraph', ...(heading ? { attrs: { heading } } : {}), content };
  }

  /** Blocks under a node, in order: inline content between them gathers into paragraphs. */
  async flow(node: StructNode): Promise<Json[]> {
    const out: Json[] = [];
    let buffer: Piece[] = [];
    const finish = () => {
      const paragraph = this.paragraph(buffer);
      if (paragraph) out.push(paragraph);
      buffer = [];
    };
    const children = node.children ?? [];
    for (const [index, child] of children.entries()) {
      const role = child.role ?? '';
      if (child.type) {
        await this.collect(child, {}, buffer);
        continue;
      }
      if (role === 'TOC') {
        this.notes.add('table of contents left out: the headings make their own', 1);
        continue;
      }
      if (role === 'Figure') {
        finish();
        const media = await this.figure(child);
        if (media) out.push({ type: 'paragraph', content: [media] });
        else if (child.alt) {
          this.notes.add('drawing that is not a picture, kept as its description');
          out.push({ type: 'paragraph', content: [{ type: 'text', text: child.alt, marks: [{ type: 'italic' }] }] });
        }
        continue;
      }
      if (role === 'L') {
        finish();
        const list = await this.list(child);
        if (list) out.push(list);
        continue;
      }
      if (role === 'Table') {
        finish();
        const table = await this.table(child);
        if (table) out.push(table);
        continue;
      }
      if (role === 'BlockQuote') {
        finish();
        const content = await this.flow(child);
        if (content.length) out.push({ type: 'blockquote', content });
        continue;
      }
      // Code with nothing beside it is a block of code; among words it is a mark on them.
      const after = children.slice(index + 1).find(other => this.textIn(other));
      const alone = !this.hasText(buffer) && (!after || BLOCK_ROLES.test(after.role ?? '') || this.hasBlocks(after));
      const code = alone && !this.hasBlocks(child) ? this.soleCode(child) : null;
      if (code) {
        const pieces: Piece[] = [];
        await this.collect(code, {}, pieces);
        const text = codeFrom(pieces.filter((piece): piece is Run => !isMedia(piece)), this.reader.right);
        if (text.trim()) out.push({ type: 'codeBlock', content: [{ type: 'text', text }] });
        continue;
      }
      if (TEXT_ROLES.test(role) && !this.hasBlocks(child)) {
        finish();
        const pieces: Piece[] = [];
        await this.collect(child, {}, pieces);
        const heading = role === 'Title' ? 1 : Number(HEADING.exec(role)?.[1] ?? (role === 'H' ? 1 : 0));
        const paragraph = this.paragraph(pieces, heading);
        if (paragraph) out.push(paragraph);
        continue;
      }
      if (this.hasBlocks(child)) {
        finish();
        out.push(...(await this.flow(child)));
        continue;
      }
      await this.collect(child, {}, buffer);
    }
    finish();
    return out;
  }

  /** The Code node that holds all of this node's text: itself, or under wrappers with no other text. */
  private soleCode(node: StructNode): StructNode | null {
    if (node.role === 'Code') return node;
    if (TEXT_ROLES.test(node.role ?? '') || node.type) return null;
    const worded = (node.children ?? []).filter(child => this.textIn(child));
    return worded.length === 1 ? this.soleCode(worded[0]!) : null;
  }

  private hasText(pieces: Piece[]): boolean {
    return pieces.some(piece => isMedia(piece) || piece.str.trim() !== '');
  }

  private textIn(node: StructNode): boolean {
    if (node.type === 'content') return (this.reader.text.get(node.id ?? '') ?? []).some(run => run.str.trim() !== '');
    return (node.children ?? []).some(child => this.textIn(child));
  }

  private async list(node: StructNode): Promise<Json | null> {
    const items: Json[] = [];
    let kind: 'bullet' | 'ordered' | 'check' | null = null;
    let start: number | undefined;
    for (const item of (node.children ?? []).filter(child => !child.type)) {
      if (item.role === 'L') {
        // A list right inside a list: it belongs to the item above.
        const nested = await this.list(item);
        if (nested && items.length) ((items[items.length - 1] as { content: Json[] }).content).push(nested);
        else if (nested) items.push({ type: 'listItem', content: [{ type: 'paragraph' }, nested] });
        continue;
      }
      const children = item.children ?? [];
      const label = children.find(child => child.role === 'Lbl');
      // A page's tree names the whole list, with nothing in the items that stand on other pages.
      const labelText = label ? this.plainText(label).trim() : '';
      const rest = children.filter(child => child !== label);
      // The page's own checklist marks: the box comes before the item, with no role of its own.
      const box = rest.find(child => CHECK_MARKS.test(this.plainText(child)));
      const body = box ? rest.filter(child => child !== box) : rest;
      if (!labelText && !box && !body.some(child => this.textIn(child) || this.figureIn(child))) continue;
      if (kind === null) {
        kind = box || CHECK_MARKS.test(labelText) ? 'check' : /^[(（]?(\d+|[a-zA-Z]|[ivxlcdm]+)[.)）、]?$/i.test(labelText) ? 'ordered' : 'bullet';
        if (kind === 'ordered') {
          const number = /\d+/.exec(labelText)?.[0];
          if (number && Number(number) !== 1) start = Number(number);
        }
      }
      const content = await this.flow({ role: 'LBody', children: body });
      if (content[0]?.type !== 'paragraph') content.unshift({ type: 'paragraph' });
      const mark = box ? this.plainText(box) : labelText;
      items.push({
        type: 'listItem',
        ...(kind === 'check' ? { attrs: { checked: isDone(mark) } } : {}),
        ...(!label && !box ? { _continued: true } : {}),
        content,
      });
    }
    if (!items.length) return null;
    return { type: 'list', attrs: { kind: kind ?? 'bullet', ...(start ? { start } : {}) }, content: items };
  }

  private figureIn(node: StructNode): boolean {
    return node.role === 'Figure' || (node.children ?? []).some(child => this.figureIn(child));
  }

  private plainText(node: StructNode): string {
    if (node.type === 'content') return (this.reader.text.get(node.id ?? '') ?? []).map(run => clean(run.str)).join('');
    return (node.children ?? []).map(child => this.plainText(child)).join('');
  }

  private async table(node: StructNode): Promise<Json | null> {
    const rows: StructNode[] = [];
    const gather = (item: StructNode) => {
      for (const child of item.children ?? []) {
        if (child.role === 'TR') rows.push(child);
        else if (child.role === 'THead' || child.role === 'TBody' || child.role === 'TFoot') gather(child);
      }
    };
    gather(node);
    const content: Json[] = [];
    for (const row of rows) {
      // As with a list: rows that stand on other pages are named here too, empty.
      if (!this.textIn(row) && !this.figureIn(row)) continue;
      const cells: Json[] = [];
      for (const cell of (row.children ?? []).filter(child => child.role === 'TH' || child.role === 'TD')) {
        const blocks = cellContent(await this.flow({ role: 'Div', children: cell.children ?? [] }));
        cells.push({ type: 'cell', ...(cell.role === 'TH' ? { attrs: { header: true } } : {}), content: cell.role === 'TH' ? blocks.map(unbold) : blocks });
      }
      if (cells.length) content.push({ type: 'tableRow', content: cells });
    }
    return content.length ? { type: 'table', content: squared(content) } : null;
  }
}

function cellContent(blocks: Json[]): Json[] {
  const out: Json[] = [];
  for (const block of blocks) {
    if (block.type === 'paragraph' || block.type === 'list') out.push(block);
    else if (block.type === 'codeBlock') out.push({ type: 'paragraph', content: ((block.content as Json[]) ?? []).map(item => ({ ...item, marks: [{ type: 'code' }] })) });
    else if (block.type === 'blockquote') out.push(...cellContent((block.content as Json[]) ?? []));
  }
  return out.length ? out : [{ type: 'paragraph' }];
}

/** A header cell is bold by being one. */
function unbold(block: Json): Json {
  if (block.type !== 'paragraph') return block;
  return { ...block, content: ((block.content as Json[]) ?? []).map(item => (Array.isArray(item.marks) ? { ...item, marks: (item.marks as Json[]).filter(mark => mark.type !== 'bold') } : item)) };
}

/** Every row as wide as the widest: a PDF doesn't record merged cells, and the editor wants a full grid. */
function squared(rows: Json[]): Json[] {
  const width = Math.max(...rows.map(row => (row.content as Json[]).length));
  for (const row of rows) {
    const cells = row.content as Json[];
    while (cells.length < width) cells.push({ type: 'cell', content: [{ type: 'paragraph' }] });
  }
  return rows;
}

// ---- across pages ----------------------------------------------------------------------------------------------------

const textOfBlock = (block: Json | undefined): string => {
  if (!block) return '';
  if (typeof block.text === 'string') return block.text;
  return ((block.content as Json[]) ?? []).map(textOfBlock).join(' ');
};

/** A sentence cut by the page's end: long enough to have been running, and no mark that ends one. */
const endsCut = (text: string) => text.length >= 30 && !/[.。!！?？:：;；"”’)）\]】]\s*$/.test(text);

/** A numbered list at the top of a page is the one above going on only if its numbers do. */
function listGoesOn(last: Json, next: Json): boolean {
  if ((last.attrs as Json).kind !== 'ordered' || (next.content as Json[])[0]?._continued) return true;
  const expected = Number((last.attrs as Json).start ?? 1) + (last.content as Json[]).length;
  return Number((next.attrs as Json).start ?? 1) === expected;
}

/** Whatever a page break split back together: a list, a table, a paragraph. The tree doesn't say; the shapes do. */
function joinPages(pages: Json[][]): Json[] {
  const out: Json[] = [];
  for (const page of pages) {
    for (let index = 0; index < page.length; index++) {
      const block = page[index]!;
      const last = out[out.length - 1];
      if (index > 0 || !last || last.type !== block.type) {
        out.push(block);
        continue;
      }
      if (block.type === 'list' && (last.attrs as Json).kind === (block.attrs as Json).kind && listGoesOn(last, block)) {
        const items = last.content as Json[];
        for (const item of block.content as Json[]) {
          if (item._continued && items.length) {
            const target = items[items.length - 1]!.content as Json[];
            const more = item.content as Json[];
            const tail = target[target.length - 1];
            if (tail?.type === 'paragraph' && more[0]?.type === 'paragraph') {
              tail.content = [...((tail.content as Json[]) ?? []), ...((more[0].content as Json[]) ?? [])];
              target.push(...more.slice(1));
            } else target.push(...more);
          } else items.push(item);
        }
        continue;
      }
      if (block.type === 'table') {
        const rows = last.content as Json[];
        const next = block.content as Json[];
        const width = (rows[0]?.content as Json[])?.length;
        if ((next[0]?.content as Json[])?.length === width) {
          // A header row printed again at the top of the page is not a new row.
          const repeated = textOfBlock(rows[0]) === textOfBlock(next[0]);
          rows.push(...(repeated ? next.slice(1) : next));
          continue;
        }
      }
      if (block.type === 'paragraph' && !last.attrs && !block.attrs && endsCut(textOfBlock(last))) {
        const before = textOfBlock(last);
        const after = textOfBlock(block);
        const joined = (last.content as Json[]) ?? [];
        if (wantsSpace(before, after)) joined.push({ type: 'text', text: ' ' });
        joined.push(...((block.content as Json[]) ?? []));
        last.content = joined;
        continue;
      }
      out.push(block);
    }
  }
  const strip = (blocks: Json[]) => {
    for (const block of blocks) {
      delete block._continued;
      if (Array.isArray(block.content)) strip(block.content as Json[]);
    }
  };
  strip(out);
  return out;
}

// ---- no tags: read the layout ----------------------------------------------------------------------------------------

interface Line {
  runs: Run[];
  x: number;
  y: number;
  end: number;
  size: number;
  text: string;
  bold: boolean;
  mono: boolean;
  /** Pieces split by a gap wider than words have: table columns, when several lines agree. */
  columns: { x: number; runs: Run[] }[];
  page: number;
}

const BULLET_LINE = /^\s*([•◦▪▫‣●○■□·∙*\-–—\uf0b7\uf0a7\uf076\uf0d8\uf0fc\uf0a8])\s*(?=\S)/;
const CHECK_LINE = /^\s*([☐□☑☒✓✔])\s+/;
const NUMBER_LINE = /^\s*(?:(\d{1,3})[.)、]|[(（](\d{1,3})[)）]|([a-zA-Z])[.)])\s*/;
const PAGE_NUMBER = /^\W*(?:page\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?\W*$|^第\s*\d+\s*页/i;

function linesOf(runs: Run[], page: number): Line[] {
  const lines: Line[] = [];
  let current: Run[] = [];
  const finish = () => {
    const words = current.filter(run => run.str.trim() !== '');
    if (words.length) {
      const columns: { x: number; runs: Run[] }[] = [];
      let lastEnd = Number.NEGATIVE_INFINITY;
      for (const run of current) {
        const gap = run.x - lastEnd;
        if (!columns.length || (gap > run.size * 1.8 && run.str.trim() !== '')) columns.push({ x: run.x, runs: [] });
        columns[columns.length - 1]!.runs.push(run);
        if (run.str.trim() !== '') lastEnd = run.x + run.width;
      }
      const size = Math.max(...words.map(run => run.size));
      lines.push({
        runs: current,
        x: words[0]!.x,
        y: words[0]!.y,
        end: Math.max(...words.map(run => run.x + run.width)),
        size,
        text: clean(current.map(run => run.str).join('')).trim(),
        bold: words.every(run => run.bold),
        mono: words.every(run => run.code),
        columns,
        page,
      });
    }
    current = [];
  };
  for (const run of runs) {
    if (run.str === '') continue;
    const last = current[current.length - 1];
    if (last && (Math.abs(run.y - last.y) > Math.max(run.size, last.size) * 0.5 || run.x < last.x - run.size * 2)) finish();
    current.push(run);
  }
  finish();
  return lines;
}

/** Text in the top or bottom of the page that comes back page after page is a running head; so is a lone page number. */
function withoutRunningHeads(pages: Line[][], heights: number[]): Line[][] {
  const seen = new Map<string, number>();
  const key = (line: Line) => line.text.replace(/\d+/g, '#').toLowerCase();
  const inMargin = (line: Line, height: number) => line.y > height * 0.9 || line.y < height * 0.1;
  pages.forEach((lines, index) => {
    for (const text of new Set(lines.filter(line => inMargin(line, heights[index]!)).map(key))) seen.set(text, (seen.get(text) ?? 0) + 1);
  });
  const enough = Math.max(2, Math.ceil(pages.length / 2));
  return pages.map((lines, index) => lines.filter(line => !inMargin(line, heights[index]!) || ((seen.get(key(line)) ?? 0) < enough && !PAGE_NUMBER.test(line.text))));
}

function mostCommonSize(lines: Line[]): number {
  const weights = new Map<number, number>();
  for (const line of lines) {
    const size = Math.round(line.size * 2) / 2;
    weights.set(size, (weights.get(size) ?? 0) + line.text.length);
  }
  return [...weights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
}

class Layout {
  private body: number;
  private headingSizes: number[];
  private readers: PageReader[];

  constructor(pages: Line[][], readers: PageReader[]) {
    const lines = pages.flat();
    this.body = mostCommonSize(lines);
    this.headingSizes = [...new Set(lines.filter(line => line.size >= this.body * 1.12 && line.text.length <= 160).map(line => Math.round(line.size * 2) / 2))].sort((a, b) => b - a).slice(0, 5);
    this.readers = readers;
  }

  private headingOf(line: Line): number {
    if (line.size >= this.body * 1.12 && line.text.length <= 160) return this.headingSizes.indexOf(Math.round(line.size * 2) / 2) + 1 || 1;
    // A short line all in bold, at the size of the text, that doesn't read as a sentence.
    if (line.bold && line.text.length <= 80 && !/[.。:：;；,，]$/.test(line.text)) return Math.min(this.headingSizes.length + 1, 6);
    return 0;
  }

  private withLinks(line: Line): Run[] {
    const reader = this.readers[line.page]!;
    return line.runs.flatMap(run => reader.withLinks(run));
  }

  /** Lines that keep the same columns, two or more of them, at least two rows. */
  private tableAt(lines: Line[], start: number): number {
    const first = lines[start]!;
    if (first.columns.length < 2) return 0;
    let count = 1;
    for (let index = start + 1; index < lines.length; index++) {
      const line = lines[index]!;
      if (line.columns.length !== first.columns.length || line.page !== first.page) break;
      if (!line.columns.every((column, at) => Math.abs(column.x - first.columns[at]!.x) <= Math.max(first.size * 2, 18))) break;
      count++;
    }
    return count >= 2 ? count : 0;
  }

  private table(lines: Line[]): Json {
    const header = lines[0]!.bold;
    const rows = lines.map((line, rowIndex) => ({
      type: 'tableRow',
      content: line.columns.map(column => {
        const content = inlineFrom(column.runs, { plain: header && rowIndex === 0 });
        return { type: 'cell', ...(header && rowIndex === 0 ? { attrs: { header: true } } : {}), content: [{ type: 'paragraph', ...(content.length ? { content } : {}) }] };
      }),
    }));
    return { type: 'table', content: rows };
  }

  async page(lines: Line[], placed: PageImage[], reader: PageReader): Promise<Json[]> {
    const out: Json[] = [];
    const pending = [...placed].sort((a, b) => b.y - a.y);
    const right = lines.reduce((most, line) => Math.max(most, line.end), 0);
    let paragraph: { lines: Line[]; x: number } | null = null;
    let list: { node: Json; items: Json[]; kind: string; x: number; lastLine: Line } | null = null;
    let code: Line[] = [];
    const closeParagraph = () => {
      if (paragraph) {
        const content = inlineFrom(paragraph.lines.flatMap(line => this.withLinks(line)));
        if (content.length) out.push({ type: 'paragraph', content });
      }
      paragraph = null;
    };
    const closeCode = () => {
      if (code.length) out.push({ type: 'codeBlock', content: [{ type: 'text', text: codeFrom(code.flatMap(line => line.runs), right) }] });
      code = [];
    };
    const closeAll = () => {
      closeParagraph();
      closeCode();
      list = null;
    };
    const placeImages = async (before: number) => {
      while (pending.length && pending[0]!.y > before) {
        const media = await reader.mediaOf(pending.shift()!);
        if (media) {
          closeAll();
          out.push({ type: 'paragraph', content: [media] });
        }
      }
    };

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!;
      await placeImages(line.y);
      const previous = lines[index - 1];
      const gap = previous ? previous.y - line.y : 0;
      const lineHeight = Math.max(line.size, previous?.size ?? 0) * 1.7;
      let rows = line.size < this.body * 1.12 ? this.tableAt(lines, index) : 0;
      // A bold header's columns may have come as one run: its words, when they count as many as the columns under it.
      if (!rows && line.bold && line.columns.length === 1 && this.tableAt(lines, index + 1)) {
        const words = line.text.split(/\s+/);
        if (words.length === lines[index + 1]!.columns.length) {
          line.columns = words.map((str, at) => ({ x: lines[index + 1]!.columns[at]!.x, runs: [{ ...line.runs[0]!, str }] }));
          rows = this.tableAt(lines, index);
        }
      }
      const heading = rows ? 0 : this.headingOf(line);
      const check = CHECK_LINE.exec(line.text);
      const bullet = BULLET_LINE.exec(line.text);
      const number = NUMBER_LINE.exec(line.text);
      if (heading) {
        closeAll();
        const content = inlineFrom(this.withLinks(line), { plain: true });
        if (content.length) out.push({ type: 'paragraph', attrs: { heading }, content });
        continue;
      }
      if (line.mono) {
        closeParagraph();
        list = null;
        code.push(line);
        continue;
      }
      closeCode();
      if (rows) {
        closeAll();
        out.push(this.table(lines.slice(index, index + rows)));
        index += rows - 1;
        continue;
      }
      if (check || bullet || number) {
        closeParagraph();
        const kind = check ? 'check' : bullet ? 'bullet' : 'ordered';
        const runs = this.withLinks(line);
        const marker = (check ?? bullet ?? number)![0];
        const stripped = stripMarker(runs, marker);
        const content = inlineFrom(stripped);
        const item: Json = { type: 'listItem', ...(check ? { attrs: { checked: isDone(check[1]!) } } : {}), content: [{ type: 'paragraph', ...(content.length ? { content } : {}) }] };
        const current = list as { node: Json; items: Json[]; kind: string; x: number; lastLine: Line } | null;
        if (current && current.kind === kind && Math.abs(current.x - line.x) <= line.size) {
          current.items.push(item);
          current.lastLine = line;
        } else {
          const start = Number(number?.[1] ?? number?.[2] ?? 1);
          const node: Json = { type: 'list', attrs: { kind, ...(kind === 'ordered' && start !== 1 ? { start } : {}) }, content: [item] };
          out.push(node);
          list = { node, items: node.content as Json[], kind, x: line.x, lastLine: line };
        }
        continue;
      }
      const open = list as { items: Json[]; x: number; lastLine: Line } | null;
      if (open && line.x > open.x + line.size * 0.5 && gap <= lineHeight && gap > 0) {
        // More of the item above: under its text, not under its marker.
        const items = open.items;
        const target = ((items[items.length - 1]!.content as Json[])[0] as Json);
        const content = (target.content as Json[]) ?? [];
        const more = inlineFrom(this.withLinks(line));
        if (wantsSpace(wordsOf(content), wordsOf(more))) content.push({ type: 'text', text: ' ' });
        content.push(...more);
        target.content = content;
        open.lastLine = line;
        continue;
      }
      list = null;
      const shortBefore = previous && previous.end + firstWordWidth(line.runs[0]!) + previous.size < right;
      const sameParagraph = paragraph && gap > 0 && gap <= lineHeight && Math.abs(line.size - previous!.size) <= line.size * 0.1 && !shortBefore && line.x <= (paragraph as { x: number }).x + line.size * 0.8;
      if (!sameParagraph) {
        closeParagraph();
        paragraph = { lines: [], x: line.x };
      }
      (paragraph as unknown as { lines: Line[] }).lines.push(line);
    }
    closeAll();
    await placeImages(Number.NEGATIVE_INFINITY);
    return out;
  }
}

/** The runs of a list line without their marker, which may span runs. */
function stripMarker(runs: Run[], marker: string): Run[] {
  let left = marker.length;
  const out: Run[] = [];
  for (const run of runs) {
    if (left <= 0) {
      out.push(run);
      continue;
    }
    if (run.str.length <= left) {
      left -= run.str.length;
      continue;
    }
    out.push({ ...run, str: run.str.slice(left) });
    left = 0;
  }
  return out;
}

// ---- the file ---------------------------------------------------------------------------------------------------------

function refusalFor(error: unknown): ImportRefusal | null {
  const name = (error as { name?: string })?.name ?? '';
  if (name === 'PasswordException') return new ImportRefusal('pdf_password', 'This PDF has a password. Save a copy without it, then import that.');
  if (name === 'InvalidPDFException' || name === 'FormatError') return new ImportRefusal('not_pdf', "This file can't be read as a PDF: it may be damaged.");
  return null;
}

export async function readPdf(bytes: Uint8Array, images: ImportImages, notes: ImportNotes): Promise<{ title?: string | undefined; tabs: ImportedTab[] }> {
  const { getDocument, OPS } = await loadPdfJs();
  // PDF.js takes the buffer for its own.
  const data = new Uint8Array(bytes);
  const cMapUrl = cMapDir();
  const task = getDocument({ data, cMapUrl, cMapPacked: true, disableFontFace: true, fontExtraProperties: true, isEvalSupported: false, useSystemFonts: false, verbosity: 0 });
  let document: Dynamic;
  try {
    document = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => {});
    throw refusalFor(error) ?? error;
  }
  try {
    const readers: PageReader[] = [];
    const trees: (StructNode | null)[] = [];
    const heights: number[] = [];
    let empty = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const reader = new PageReader(page, images, notes);
      await reader.load(OPS);
      readers.push(reader);
      heights.push(page.view[3] - page.view[1]);
      trees.push(((await page.getStructTree()) as StructNode | null) ?? null);
      if (!reader.runs.some(run => run.str.trim())) empty++;
    }
    const total = readers.reduce((sum, reader) => sum + reader.runs.reduce((chars, run) => chars + run.str.length, 0), 0);
    if (!total) throw new ImportRefusal('pdf_no_text', 'This PDF holds no text: its pages look like scans. Run it through OCR first, or tell an agent to read the pages and write the doc.');
    if (empty) notes.add('page with no text (a scan or a picture)', empty);

    // How much of the text the tree accounts for: a tree over a little of it is a stub, and the layout reads better.
    const covered = readers.reduce((sum, reader, index) => {
      const ids = new Set<string>();
      const visit = (node: StructNode) => {
        if (node.type === 'content' && node.id) ids.add(node.id);
        (node.children ?? []).forEach(visit);
      };
      if (trees[index]) visit(trees[index]!);
      return sum + [...ids].reduce((chars, id) => chars + (reader.text.get(id) ?? []).reduce((n, run) => n + run.str.length, 0), 0);
    }, 0);

    let content: Json[];
    if (covered / total >= 0.6) {
      const pages: Json[][] = [];
      for (let index = 0; index < readers.length; index++) pages.push(trees[index] ? await new Tagged(readers[index]!, notes).flow(trees[index]!) : []);
      content = joinPages(pages);
    } else {
      notes.add('PDF with no structure tags: headings, lists and tables were guessed from the layout', 1);
      const lines = withoutRunningHeads(readers.map((reader, index) => linesOf(reader.runs, index)), heights);
      const layout = new Layout(lines, readers);
      const pages: Json[][] = [];
      for (let index = 0; index < readers.length; index++) pages.push(await layout.page(lines[index]!, readers[index]!.placed, readers[index]!));
      content = joinPages(pages);
    }
    const meta = await document.getMetadata().catch(() => null);
    const title = typeof meta?.info?.Title === 'string' && meta.info.Title.trim() ? (meta.info.Title as string).trim() : undefined;
    return { title, tabs: [{ make: fromJson(content) }] };
  } finally {
    await task.destroy().catch(() => {});
  }
}
