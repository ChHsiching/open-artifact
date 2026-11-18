/**
 * A markdown file as tabs. The doc's own markdown (markdown.ts) is what an agent writes, tight on purpose; a file from
 * elsewhere needs more: YAML front matter, setext headings, reference links, indented code, HTML comments, entities,
 * a legacy encoding. Those are turned into the doc's markdown here, and `lenient` has markdown.ts read the inline forms
 * (<br>, <b>, bare URLs, entities) that only such a file carries.
 *
 * An image comes along when its bytes are at hand: a data: URL, or a file beside the markdown (the CLI turns those into
 * data: URLs first, `inlineLocalImages`, since a page upload has only the one file). A web address isn't fetched: the
 * page can't show it anyway, and fetching it would tell that site the file was opened. It stays a link, and a path with
 * no file behind it stays its description.
 */
import fs from 'node:fs';
import path from 'node:path';
import { imageInfo, parseMarkdown } from '@open-artifact/docs-core';
import type { ImportedTab, ImportImages, ImportNotes } from './import.ts';

const TAB_LINE = /^<!--\s*tab:\s*(.*?)\s*-->\s*$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

/** UTF-8 with or without its mark, UTF-16 with one, else the legacy encoding Chinese files come in. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return new TextDecoder('gb18030').decode(bytes);
  }
}

/** Calls `outside` for the runs of lines not in a code fence; a fence's lines stay as they are. */
function outsideFences(lines: string[], outside: (run: string[]) => string[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (run.length) out.push(...outside(run));
    run = [];
  };
  for (const line of lines) {
    if (fence) {
      out.push(line);
      if (new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`).test(line)) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      flush();
      fence = open[1]!;
      out.push(line);
      continue;
    }
    run.push(line);
  }
  flush();
  return out;
}

/** `[text][ref]`, `[ref][]` and the `[ref]: url` lines that give them their address. */
function resolveReferences(lines: string[]): string[] {
  const definitions = new Map<string, string>();
  const kept: string[] = [];
  for (const line of lines) {
    const definition = /^ {0,3}\[([^\]^][^\]]*)\]:\s*<?(\S+?)>?(?:\s+["'(].*["')])?\s*$/.exec(line);
    if (definition) definitions.set(definition[1]!.trim().toLowerCase(), definition[2]!);
    else kept.push(line);
  }
  if (!definitions.size) return lines;
  const target = (ref: string) => definitions.get(ref.trim().toLowerCase());
  return kept.map(line =>
    line
      .replace(/(!?)\[([^\]]*)\]\[([^\]]*)\]/g, (whole, bang: string, text: string, ref: string) => {
        const href = target(ref || text);
        return href ? `${bang}[${text}](${href})` : whole;
      })
      .replace(/(!?)\[([^\]]+)\](?![[(:])/g, (whole, bang: string, text: string) => {
        const href = target(text);
        return href ? `${bang}[${text}](${href})` : whole;
      }),
  );
}

/** `Title` over `===` or `---`. A rule is a `---` under a blank line, and that stays one. */
function setextHeadings(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const previous = out[out.length - 1];
    const underline = /^ {0,3}(=+|-{2,})\s*$/.exec(line);
    if (underline && previous !== undefined && previous.trim() !== '' && !/^ {0,3}(#{1,6} |>|[-*+] |\d+[.)] |\|)/.test(previous) && !previous.includes('|')) {
      out[out.length - 1] = `${underline[1]![0] === '=' ? '#' : '##'} ${previous.trim()}`;
      continue;
    }
    out.push(line);
  }
  return out;
}

/** Four spaces in, after a blank line and outside a list: code, which the doc's markdown only writes fenced. */
function indentedCode(lines: string[]): string[] {
  const out: string[] = [];
  let inList = false;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const blankBefore = index === 0 || lines[index - 1]!.trim() === '';
    if (/^ {0,3}([-*+]|\d{1,9}[.)]) /.test(line)) inList = true;
    else if (line.trim() !== '' && !/^\s/.test(line)) inList = false;
    if (!inList && blankBefore && /^( {4}|\t)\s*\S/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && (/^( {4}|\t)/.test(lines[index]!) || lines[index]!.trim() === '')) body.push(lines[index++]!.replace(/^( {4}|\t)/, ''));
      while (body.length && body[body.length - 1]!.trim() === '') body.pop();
      out.push('```', ...body, '```', '');
      continue;
    }
    out.push(line);
    index++;
  }
  return out;
}

/** Comments are for whoever edits the file, and the doc's own (pending, embed) mean nothing in another doc. */
const withoutComments = (text: string) => text.replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*$/gm, '');

function frontMatter(text: string): { body: string; title?: string | undefined } {
  const match = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text);
  if (!match || !/^[A-Za-z_][\w -]*:/m.test(match[1]!)) return { body: text };
  const title = /^title:\s*["']?(.*?)["']?\s*$/m.exec(match[1]!)?.[1];
  return { body: text.slice(match[0].length), title: title || undefined };
}

function tidied(text: string): string {
  const lines = withoutComments(text).split('\n');
  return outsideFences(resolveReferences(lines), run => indentedCode(setextHeadings(run))).join('\n');
}

/** One tab per `<!-- tab: name -->` line, as a doc of several tabs exports. */
function splitTabs(text: string): { name?: string; text: string }[] {
  const parts: { name?: string; lines: string[] }[] = [{ lines: [] }];
  let fence = false;
  for (const line of text.split('\n')) {
    if (FENCE_OPEN.test(line)) fence = !fence;
    const tab = fence ? null : TAB_LINE.exec(line);
    if (tab) parts.push({ name: tab[1]!, lines: [] });
    else parts[parts.length - 1]!.lines.push(line);
  }
  const named = parts.filter(part => part.name !== undefined || part.lines.some(line => line.trim()));
  return named.map(part => ({ ...(part.name ? { name: part.name } : {}), text: part.lines.join('\n') }));
}

export function readMarkdown(bytes: Uint8Array, images: ImportImages, notes: ImportNotes): { title?: string | undefined; tabs: ImportedTab[] } {
  const text = decodeText(bytes).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const { body, title } = frontMatter(text);
  const image = (alt: string, src: string) => {
    const data = /^data:(image\/[\w.+-]+)?(;[^,]*)?,(.*)$/is.exec(src);
    if (data) {
      const raw = /;base64/i.test(data[2] ?? '') ? Buffer.from(data[3]!, 'base64') : Buffer.from(decodeURIComponent(data[3]!), 'utf8');
      const node = images.node(raw, { alt });
      if (node) return node.attrs as Record<string, unknown>;
      notes.add('image in a format the page cannot show, kept as its description');
      return null;
    }
    notes.add(/^https?:/i.test(src) ? 'image on the web, kept as a link' : "image whose file wasn't there, kept as its description");
    return null;
  };
  const tabs = splitTabs(body).map(part => {
    const markdown = tidied(part.text);
    return {
      ...(part.name ? { name: part.name } : {}),
      make: (ids: { take(): string }) => parseMarkdown(markdown, ids, {}, { lenient: true, image }),
    };
  });
  const heading = /^#\s+(.+?)\s*#*\s*$/m.exec(tidied(body))?.[1];
  return { title: title ?? heading?.replace(/[*_`~]/g, ''), tabs: tabs.length ? tabs : [{ make: () => [] }] };
}

const IMAGE = /(!\[[^\]]*\]\()\s*(?:<([^>\n]+)>|([^)\s]+))((?:\s+["'(][^)]*)?\))/g;
const MAX_IMAGE = 25 * 1024 * 1024;

/**
 * The CLI's step, before the file leaves for the server or the reader: pictures named by a path beside the markdown, as
 * data: URLs. Only under the markdown's own folder and only real pictures, so that a file from someone else can't pull
 * another of this computer's files into a doc that gets shared.
 */
export function inlineLocalImages(bytes: Uint8Array, file: string): Uint8Array {
  const text = decodeText(bytes);
  const folder = fs.realpathSync(path.dirname(file));
  let changed = false;
  const out = text.replace(IMAGE, (whole, open: string, angled: string | undefined, bare: string | undefined, close: string) => {
    const src = angled ?? bare ?? '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//') || src.startsWith('blob/')) return whole;
    try {
      const target = fs.realpathSync(path.resolve(folder, decodeURIComponent(src.split(/[?#]/)[0]!)));
      if (!target.startsWith(folder + path.sep) || fs.statSync(target).size > MAX_IMAGE) return whole;
      const image = fs.readFileSync(target);
      const info = imageInfo(image);
      if (!info) return whole;
      changed = true;
      return `${open}data:${info.mime};base64,${image.toString('base64')}${close}`;
    } catch {
      return whole;
    }
  });
  return changed ? Buffer.from(out, 'utf8') : bytes;
}
