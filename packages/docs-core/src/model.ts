/**
 * The document model of a docs tab, and its two printed forms: the view XML the page reads, and the JSON kept on disk.
 *
 * A tab's content is a tree of blocks. Text blocks (paragraph, codeBlock) hold inline items: one per code point of text
 * (a Char) or one per atom (a hard break, a mention, a date, a dropdown, an image). Every block and every inline item
 * has an id `<sess>.<n>`: the session that wrote it and that session's counter. The page predicts the ids of what it
 * types from its own session's counter, so the server mints in the same order (see ids.ts).
 */
import { sha256Hex } from '@open-artifact/live-store';

const utf8 = new TextEncoder();
const sha256Of = (text: string) => sha256Hex(utf8.encode(text));

export interface Marks {
  bold?: true;
  italic?: true;
  strike?: true;
  code?: true;
  underline?: true;
  /** A highlight: its color ('' for the default one). */
  highlight?: string;
  /** A link: its href. */
  link?: string;
  /** A text colour: one of TEXT_COLORS, the five the page's colour menu offers. */
  textColor?: string;
}
export const MARK_ORDER = ['bold', 'italic', 'strike', 'code', 'underline', 'highlight', 'link', 'textColor'] as const;
export type MarkName = (typeof MARK_ORDER)[number];

/**
 * The text colours, by name, with the colour the page draws each in on a light page. Printing and
 * Word take these; the page keeps only the name, and drops a colour it doesn't know.
 */
export const TEXT_COLORS: Record<string, string> = { red: '8e2626', yellow: '734500', green: '006300', teal: '065f49', purple: '4a3aa7' };
/** `red`, `Red`: the colour's name as the page spells it; undefined for anything else. */
export const textColorOf = (value: unknown): string | undefined => {
  const name = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Object.hasOwn(TEXT_COLORS, name) ? name : undefined;
};

/**
 * A part of an open suggestion: words or blocks proposed to go in (`ins`, not in the doc yet), or words or blocks in the
 * doc proposed to go (`del`). Every item of a suggested block carries it too: a block proposed whole has all its words
 * proposed with it, which is how the page tells a new paragraph from a new paragraph break.
 */
export interface Proposal {
  id: string;
  op: 'ins' | 'del';
}
/** An open suggestion: who laid it (the person's address) and when; `via: 'agent'` = an agent laid it. */
export interface SuggestionInfo {
  by: string;
  at: string;
  via?: string;
}
/** A suggestion id, as the page takes one. */
export const SUGGEST_ID = /^[A-Za-z0-9_.~-]{1,64}$/;
export const sameProposal = (a: Proposal | undefined, b: Proposal | undefined) => a?.id === b?.id && a?.op === b?.op;

export interface Char {
  id: string;
  ch: string;
  marks?: Marks;
  suggest?: Proposal;
}
export type AtomType = 'hardBreak' | 'mention' | 'date' | 'dropdown' | 'media';
export interface Atom {
  id: string;
  atom: AtomType;
  attrs?: Record<string, unknown>;
  marks?: Marks;
  suggest?: Proposal;
}
export type Inline = Char | Atom;
export const isAtom = (item: Inline): item is Atom => 'atom' in item;

export type TextType = 'paragraph' | 'codeBlock';
export type ContainerType = 'list' | 'listItem' | 'blockquote' | 'table' | 'tableRow' | 'cell';
export type LeafType = 'horizontalRule' | 'pending' | 'embed';
export type BlockType = TextType | ContainerType | LeafType;
export const TEXT_TYPES = new Set<string>(['paragraph', 'codeBlock']);
export const CONTAINER_TYPES = new Set<string>(['list', 'listItem', 'blockquote', 'table', 'tableRow', 'cell']);
export const LEAF_TYPES = new Set<string>(['horizontalRule', 'pending', 'embed']);

export interface Block {
  id: string;
  type: BlockType;
  attrs?: Record<string, unknown>;
  /** Text blocks only. */
  inline?: Inline[];
  /** Container blocks only. */
  children?: Block[];
  suggest?: Proposal;
}

export interface DocState {
  rev: number;
  blocks: Block[];
  /** The tab's open suggestions, by id; their parts are on the blocks and items. */
  suggestions?: Record<string, SuggestionInfo>;
}

export const isText = (block: Block) => TEXT_TYPES.has(block.type);
export const isContainer = (block: Block) => CONTAINER_TYPES.has(block.type);

export function newBlock(type: BlockType, id: string, attrs?: Record<string, unknown>): Block {
  const block: Block = { id, type };
  if (attrs && Object.keys(attrs).length) block.attrs = { ...attrs };
  if (TEXT_TYPES.has(type)) block.inline = [];
  else if (CONTAINER_TYPES.has(type)) block.children = [];
  return block;
}

// ---- walking ---------------------------------------------------------------------------------------------------

export interface BlockPlace {
  block: Block;
  parent: Block | null;
  /** The array holding the block: the doc's blocks or the parent's children. */
  siblings: Block[];
  index: number;
  depth: number;
}

export function* walk(blocks: Block[], parent: Block | null = null, depth = 0): Generator<BlockPlace> {
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!;
    yield { block, parent, siblings: blocks, index, depth };
    if (block.children) yield* walk(block.children, block, depth + 1);
  }
}

export function findBlock(doc: DocState, id: string): BlockPlace | null {
  for (const place of walk(doc.blocks)) if (place.block.id === id) return place;
  return null;
}

export interface CharPlace {
  block: Block;
  index: number;
  item: Inline;
}

export function findChar(doc: DocState, id: string): CharPlace | null {
  for (const { block } of walk(doc.blocks)) {
    if (!block.inline) continue;
    const index = block.inline.findIndex(item => item.id === id);
    if (index >= 0) return { block, index, item: block.inline[index]! };
  }
  return null;
}

/** The parent chain of a block, outermost first (not including the block). */
export function ancestors(doc: DocState, id: string): Block[] {
  const chain: Block[] = [];
  const visit = (blocks: Block[]): boolean => {
    for (const block of blocks) {
      if (block.id === id) return true;
      if (block.children) {
        chain.push(block);
        if (visit(block.children)) return true;
        chain.pop();
      }
    }
    return false;
  };
  return visit(doc.blocks) ? chain : [];
}

/** Every id in a subtree: the block's, its inline items', its children's. */
export function subtreeIds(block: Block): string[] {
  const ids = [block.id];
  for (const item of block.inline ?? []) ids.push(item.id);
  for (const child of block.children ?? []) ids.push(...subtreeIds(child));
  return ids;
}

export function blockText(block: Block): string {
  if (block.inline) return block.inline.map(item => (isAtom(item) ? (item.atom === 'hardBreak' ? '\n' : '￼') : item.ch)).join('');
  return (block.children ?? []).map(blockText).join('\n');
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function sameMarks(a: Marks | undefined, b: Marks | undefined): boolean {
  for (const key of MARK_ORDER) if ((a?.[key] ?? undefined) !== (b?.[key] ?? undefined)) return false;
  return true;
}

// ---- suggestions -----------------------------------------------------------------------------------------------

/** Every part of one suggestion, in document order: the blocks and the inline items that carry it. */
export function proposalParts(blocks: Block[], id: string): Array<Block | Inline> {
  const parts: Array<Block | Inline> = [];
  for (const { block } of walk(blocks)) {
    if (block.suggest?.id === id) parts.push(block);
    for (const item of block.inline ?? []) if (item.suggest?.id === id) parts.push(item);
  }
  return parts;
}

/** The ids of the suggestions that have parts in these blocks, in the order their first parts stand. */
export function proposalIds(blocks: Block[]): string[] {
  const ids = new Set<string>();
  for (const { block } of walk(blocks)) {
    if (block.suggest) ids.add(block.suggest.id);
    for (const item of block.inline ?? []) if (item.suggest) ids.add(item.suggest.id);
  }
  return [...ids];
}

/** A suggestion's fingerprint as it stands now (`asOf`): it moves only when one of its own parts changes. */
export function suggestionAsOf(blocks: Block[], id: string): string {
  const parts = proposalParts(blocks, id).map(part =>
    'type' in part
      ? ['block', part.id, part.suggest!.op, part.type, part.attrs ?? null]
      : isAtom(part)
        ? ['atom', part.id, part.suggest!.op, part.atom, part.attrs ?? null, part.marks ?? null]
        : ['char', part.id, part.suggest!.op, part.ch, part.marks ?? null],
  );
  return sha256Of(JSON.stringify(parts)).slice(0, 32);
}

/**
 * The tab as it reads with no suggestion taken: proposed words and blocks left out, words and blocks proposed to go
 * kept as plain ones. Exports, printing, the history's preview and the find bar read this; the page and an agent's
 * view read the suggestions themselves.
 */
export function committed(doc: DocState): DocState {
  if (!proposalIds(doc.blocks).length) return doc;
  const plain = <T extends Inline>(item: T): T => {
    if (!item.suggest) return item;
    const { suggest: _suggest, ...rest } = item;
    return rest as T;
  };
  const keep = (blocks: Block[]): Block[] =>
    blocks.flatMap(block => {
      if (block.suggest?.op === 'ins') return [];
      const { suggest: _suggest, ...out } = block;
      if (block.inline) out.inline = block.inline.filter(item => item.suggest?.op !== 'ins').map(plain);
      if (block.children) {
        out.children = keep(block.children);
        // A container left with nothing: everything in it was proposed. A cell keeps an empty paragraph.
        if (!out.children.length && block.children.length) {
          if (block.type !== 'cell') return [];
          out.children = [newBlock('paragraph', `${block.id}.0`)];
        }
      }
      return [out];
    });
  const blocks = keep(doc.blocks);
  return { rev: doc.rev, blocks: blocks.length ? blocks : [newBlock('paragraph', `${doc.blocks[0]!.id}.0`)] };
}

// ---- shape -----------------------------------------------------------------------------------------------------

/**
 * What the page's editor schema lets each block hold (its `content` expressions; `need` quotes them). The page checks a
 * whole tab against the schema when it opens it, and one misfit anywhere makes it refuse the tab: no text, read-only,
 * "This page is older than the document's format". So a write that would leave one is refused (`shape_mismatch`, with
 * `need` and `got`): applyOps checks what an agent's call leaves behind.
 */
export interface ShapeProblem {
  id: string;
  need: string;
  got: string;
  message: string;
}

const BLOCKS = new Set<string>(['paragraph', 'codeBlock', 'list', 'blockquote', 'table', 'horizontalRule', 'pending', 'embed']);
const WORDS: Record<string, string> = {
  paragraph: 'paragraph',
  codeBlock: 'code block',
  list: 'list',
  listItem: 'list item',
  blockquote: 'quote',
  table: 'table',
  tableRow: 'table row',
  cell: 'table cell',
  horizontalRule: 'rule',
  pending: 'pending block',
  embed: 'embed',
};
const wordsOf = (type: string) => WORDS[type] ?? type;

function typesOf(children: Block[]): string {
  return children.length ? [...new Set(children.map(child => child.type))].join(', ') : 'nothing';
}

export function shapeProblems(blocks: Block[]): ShapeProblem[] {
  const problems: ShapeProblem[] = [];
  const misfit = (id: string, need: string, got: string, message: string) => problems.push({ id, need, got, message });
  /** Children that must all be blocks (a list item, a table row or a cell only stands in its own parent). */
  const blocksIn = (children: Block[], where: string) => {
    for (const child of children) {
      if (!BLOCKS.has(child.type)) misfit(child.id, 'block', child.type, `A ${wordsOf(child.type)} can't stand on its own in ${where}: it belongs in its ${child.type === 'listItem' ? 'list' : child.type === 'tableRow' ? 'table' : 'table row'}. (${child.id})`);
    }
  };
  const visit = (block: Block) => {
    const children = block.children ?? [];
    const got = typesOf(children);
    switch (block.type) {
      case 'codeBlock': {
        const inline = block.inline ?? [];
        if (inline.some(isAtom)) misfit(block.id, 'text', 'a chip or a line break', `A code block holds plain text only: no chips, and a new line is a line break in the text itself. (${block.id})`);
        else if (inline.some(item => item.marks)) misfit(block.id, 'text', 'marks', `A code block holds plain text only: no bold, links or other marks. (${block.id})`);
        break;
      }
      case 'list':
        if (!children.length || children.some(child => child.type !== 'listItem')) misfit(block.id, 'listItem+', got, `A list holds list items, at least one. (${block.id} holds ${got})`);
        break;
      case 'listItem':
        if (children[0]?.type !== 'paragraph') misfit(block.id, 'paragraph block*', got, `A list item starts with a paragraph; other blocks can follow it. (${block.id} holds ${got})`);
        else blocksIn(children, 'a list item');
        break;
      case 'blockquote':
        if (!children.length) misfit(block.id, 'block+', got, `A quote holds at least one block. (${block.id})`);
        else blocksIn(children, 'a quote');
        break;
      case 'table':
        if (!children.length || children.some(child => child.type !== 'tableRow')) {
          misfit(block.id, 'tableRow+', got, `A table holds rows, at least one: a new row is {"type": "tableRow"} with every cell spelled, at the end of the table. (${block.id} holds ${got})`);
        }
        break;
      case 'tableRow':
        if (!children.length || children.some(child => child.type !== 'cell')) misfit(block.id, 'cell+', got, `A table row holds cells, at least one. (${block.id} holds ${got})`);
        break;
      case 'cell': {
        const other = children.find(child => child.type !== 'paragraph' && child.type !== 'list');
        if (!children.length || other) {
          misfit(block.id, '(paragraph | list)+', got, `A table cell holds paragraphs and lists only, at least one. ${other ? `Put the ${wordsOf(other.type)} before or after the table${other.type === 'codeBlock' ? ', or write it as `code` in the cell' : ''}. ` : ''}(${block.id} holds ${got})`);
        }
        break;
      }
      default:
        break;
    }
    children.forEach(visit);
  };
  blocksIn(blocks, 'the tab');
  blocks.forEach(visit);
  return problems;
}

// ---- ids -------------------------------------------------------------------------------------------------------

export function splitId(id: string): { sess: string; n: number } | null {
  const match = /^(.+)\.(\d+)$/.exec(id);
  return match ? { sess: match[1]!, n: Number(match[2]) } : null;
}

const follows = (prev: string, next: string) => {
  const a = splitId(prev);
  const b = splitId(next);
  return !!a && !!b && a.sess === b.sess && b.n === a.n + 1;
};

// ---- view XML --------------------------------------------------------------------------------------------------

const escapeAttr = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&apos;').replaceAll('"', '&quot;');
const escapeText = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function attrString(attrs: Record<string, unknown>): string {
  let out = '';
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    const text = value === true ? '1' : Array.isArray(value) ? value.join(',') : typeof value === 'object' ? JSON.stringify(value) : String(value);
    out += ` ${key}='${escapeAttr(text)}'`;
  }
  return out;
}

function markAttrs(marks: Marks | undefined): Record<string, unknown> {
  if (!marks) return {};
  const names: string[] = [];
  const attrs: Record<string, unknown> = {};
  for (const key of MARK_ORDER) {
    const value = marks[key];
    if (value === undefined) continue;
    if (key === 'link') {
      names.push('link');
      attrs.href = value;
    } else if (key === 'highlight') {
      names.push('highlight');
      if (value) attrs.color = value;
    } else if (key !== 'textColor') names.push(key);
  }
  return names.length ? { marks: names.join(' '), ...attrs } : {};
}

/**
 * A text colour is not in `marks` (a run's `color` is its highlight's): the page reads it as an element around the runs,
 * `<textColor color='red'><t …>…</t><t …>…</t></textColor>`.
 * `pieces` are printed runs and chips with their colours; neighbours of one colour share one element.
 */
function colored(pieces: { xml: string; color: string | undefined }[]): string {
  let out = '';
  for (let index = 0; index < pieces.length; ) {
    const { color } = pieces[index]!;
    let end = index + 1;
    while (end < pieces.length && pieces[end]!.color === color) end++;
    const xml = pieces
      .slice(index, end)
      .map(piece => piece.xml)
      .join('');
    out += color ? `<textColor color='${color}'>${xml}</textColor>` : xml;
    index = end;
  }
  return out;
}

const colorOf = (item: Inline) => textColorOf(item.marks?.textColor);

function atomXml(item: Atom): string {
  const attrs: Record<string, unknown> = { id: item.id, ...markAttrs(item.marks) };
  const a = item.attrs ?? {};
  switch (item.atom) {
    case 'hardBreak':
      return `<hardBreak${attrString(attrs)}/>`;
    case 'mention':
      return `<mention${attrString({ ...attrs, principal: a.principal ?? undefined, ref: a.ref ?? undefined, label: a.label ?? (a.principal && !a.ref ? a.name : undefined) ?? undefined, name: a.name ?? undefined, email: a.email ?? undefined })}/>`;
    case 'date':
      return `<date${attrString({ ...attrs, ts: a.ts ?? undefined })}/>`;
    case 'dropdown':
      return `<dropdown${attrString({ ...attrs, enum: a.enum ?? undefined, index: a.index ?? undefined })}/>`;
    case 'media':
      return `<media${attrString({ ...attrs, ...a })}/>`;
  }
}

interface Piece {
  xml: string;
  color: string | undefined;
  suggest: Proposal | undefined;
}

/**
 * Printed runs and chips with the suggestions they belong to; neighbours of one suggestion share one element. The page
 * reads `<suggest suggestId='…' op='ins'>…</suggest>` (and needs it on every word of a suggested block); an agent reads
 * `<ins s='…'>…</ins>` and `<del s='…'>…</del>`, left out inside a block that is itself suggested by the same one.
 */
function proposed(pieces: Piece[], form: 'page' | 'agent', around: Proposal | undefined): string {
  let out = '';
  for (let index = 0; index < pieces.length; ) {
    const { suggest } = pieces[index]!;
    let end = index + 1;
    while (end < pieces.length && sameProposal(pieces[end]!.suggest, suggest)) end++;
    const inner = colored(pieces.slice(index, end));
    if (!suggest || (form === 'agent' && sameProposal(suggest, around))) out += inner;
    else if (form === 'page') out += `<suggest suggestId='${escapeAttr(suggest.id)}' op='${suggest.op}'>${inner}</suggest>`;
    else out += `<${suggest.op} s='${escapeAttr(suggest.id)}'>${inner}</${suggest.op}>`;
    index = end;
  }
  return out;
}

function inlineXml(inline: Inline[], form: 'page' | 'agent', around: Proposal | undefined): string {
  const pieces: Piece[] = [];
  let index = 0;
  while (index < inline.length) {
    const item = inline[index]!;
    if (isAtom(item)) {
      pieces.push({ xml: atomXml(item), color: colorOf(item), suggest: item.suggest });
      index++;
      continue;
    }
    let text = item.ch;
    let end = index + 1;
    while (end < inline.length) {
      const next = inline[end]!;
      if (isAtom(next) || !follows(inline[end - 1]!.id, next.id) || !sameMarks(item.marks, next.marks) || !sameProposal(item.suggest, next.suggest)) break;
      text += next.ch;
      end++;
    }
    pieces.push({ xml: `<t${attrString({ id: item.id, ...markAttrs(item.marks) })}>${escapeText(text)}</t>`, color: colorOf(item), suggest: item.suggest });
    index = end;
  }
  return proposed(pieces, form, around);
}

/** A short content hash of a block (its printed form without ids), for guards: `ifHash`. */
export function blockHash(block: Block): string {
  return sha256Of(blockXml(block, { ids: false })).slice(0, 8);
}

interface XmlOptions {
  ids?: boolean;
  hashes?: boolean;
  /** How suggestions print: as the page reads them (the default), or as an agent's view shows them (see proposed). */
  form?: 'page' | 'agent';
}

/** `around`: the suggestion of the block this one stands in (an agent's view names a suggested block once, at its top). */
export function blockXml(block: Block, options: XmlOptions = {}, around?: Proposal): string {
  // Without ids (a hash) suggestions print as an agent's view has them.
  const form = options.ids === false ? 'agent' : (options.form ?? 'page');
  const attrs: Record<string, unknown> = {};
  if (options.ids !== false) attrs.id = block.id;
  if (options.hashes) attrs.h = blockHash(block);
  Object.assign(attrs, block.attrs ?? {});
  // A suggested block is named once, at the top of what it adds or strikes (the page counts every block that carries it
  // as one more block on the card); the words inside carry it all the way down.
  if (block.suggest && !sameProposal(block.suggest, around))
    Object.assign(attrs, form === 'page' ? { suggestId: block.suggest.id, suggestOp: block.suggest.op } : { suggest: block.suggest.op, s: block.suggest.id });
  const open = `<${block.type}${attrString(attrs)}`;
  const inside = block.suggest ?? around;
  if (block.inline) {
    const inner = options.ids === false ? inlinePlain(block.inline, inside) : inlineXml(block.inline, form, inside);
    return `${open}>${inner}</${block.type}>`;
  }
  if (block.children) return `${open}>${block.children.map(child => blockXml(child, options, inside)).join('')}</${block.type}>`;
  return `${open}/>`;
}

function inlinePlain(inline: Inline[], around: Proposal | undefined): string {
  return proposed(
    inline.map(item => {
      if (isAtom(item)) return { xml: `<${item.atom}${attrString({ ...markAttrs(item.marks), ...(item.attrs ?? {}) })}/>`, color: colorOf(item), suggest: item.suggest };
      const marks = markAttrs(item.marks);
      return { xml: Object.keys(marks).length ? `<t${attrString(marks)}>${escapeText(item.ch)}</t>` : escapeText(item.ch), color: colorOf(item), suggest: item.suggest };
    }),
    'agent',
    around,
  );
}

export function docXml(doc: DocState, options: XmlOptions = {}): string {
  return `<doc rev='${doc.rev}' complete='1'>${doc.blocks.map(block => blockXml(block, options)).join('')}</doc>`;
}

// ---- disk ------------------------------------------------------------------------------------------------------

/** On disk a text block's inline items are runs: consecutive ids with the same marks, as one string. */
type DiskInline =
  | { id: string; text: string; marks?: Marks; suggest?: Proposal }
  | { id: string; atom: AtomType; attrs?: Record<string, unknown>; marks?: Marks; suggest?: Proposal };
interface DiskBlock {
  id: string;
  type: BlockType;
  attrs?: Record<string, unknown>;
  inline?: DiskInline[];
  children?: DiskBlock[];
  suggest?: Proposal;
}
export interface DiskDoc {
  rev: number;
  blocks: DiskBlock[];
  suggestions?: Record<string, SuggestionInfo>;
}

function inlineToDisk(inline: Inline[]): DiskInline[] {
  const out: DiskInline[] = [];
  for (const item of inline) {
    if (isAtom(item)) {
      out.push({ id: item.id, atom: item.atom, ...(item.attrs ? { attrs: item.attrs } : {}), ...(item.marks ? { marks: item.marks } : {}), ...(item.suggest ? { suggest: item.suggest } : {}) });
      continue;
    }
    const last = out[out.length - 1];
    if (last && 'text' in last) {
      const lastId = splitId(last.id);
      const id = splitId(item.id);
      if (lastId && id && lastId.sess === id.sess && id.n === lastId.n + Array.from(last.text).length && sameMarks(last.marks, item.marks) && sameProposal(last.suggest, item.suggest)) {
        last.text += item.ch;
        continue;
      }
    }
    out.push({ id: item.id, text: item.ch, ...(item.marks ? { marks: item.marks } : {}), ...(item.suggest ? { suggest: item.suggest } : {}) });
  }
  return out;
}

function inlineFromDisk(inline: DiskInline[]): Inline[] {
  const out: Inline[] = [];
  for (const run of inline) {
    if ('atom' in run) {
      out.push({ id: run.id, atom: run.atom, ...(run.attrs ? { attrs: run.attrs } : {}), ...(run.marks ? { marks: run.marks } : {}), ...(run.suggest ? { suggest: { ...run.suggest } } : {}) });
      continue;
    }
    const start = splitId(run.id);
    Array.from(run.text).forEach((ch, offset) => {
      out.push({ id: start ? `${start.sess}.${start.n + offset}` : run.id, ch, ...(run.marks ? { marks: { ...run.marks } } : {}), ...(run.suggest ? { suggest: { ...run.suggest } } : {}) });
    });
  }
  return out;
}

function blockToDisk(block: Block): DiskBlock {
  const out: DiskBlock = { id: block.id, type: block.type };
  if (block.attrs && Object.keys(block.attrs).length) out.attrs = block.attrs;
  if (block.inline) out.inline = inlineToDisk(block.inline);
  if (block.children) out.children = block.children.map(blockToDisk);
  if (block.suggest) out.suggest = block.suggest;
  return out;
}

function blockFromDisk(block: DiskBlock): Block {
  const out: Block = { id: block.id, type: block.type };
  if (block.attrs) out.attrs = block.attrs;
  if (TEXT_TYPES.has(block.type)) out.inline = inlineFromDisk(block.inline ?? []);
  if (CONTAINER_TYPES.has(block.type)) out.children = (block.children ?? []).map(blockFromDisk);
  if (block.suggest) out.suggest = { ...block.suggest };
  return out;
}

const withSuggestions = (suggestions: Record<string, SuggestionInfo> | undefined) => (suggestions && Object.keys(suggestions).length ? { suggestions: structuredClone(suggestions) } : {});
export const docToDisk = (doc: DocState): DiskDoc => ({ rev: doc.rev, blocks: doc.blocks.map(blockToDisk), ...withSuggestions(doc.suggestions) });
export const docFromDisk = (disk: DiskDoc): DocState => ({ rev: disk.rev, blocks: disk.blocks.map(blockFromDisk), ...withSuggestions(disk.suggestions) });
