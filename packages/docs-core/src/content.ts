/**
 * Content coming in with a write: ProseMirror-style JSON (what the page sends, `as: 'blocks'` / `as: 'inline'`),
 * turned into model blocks and inline items. Ids are taken from an IdSource in document order: a block's own id first,
 * then its inline items, then its children.
 */
import { type Atom, type AtomType, type Block, type BlockType, type Char, type DocState, type Inline, isAtom, MARK_ORDER, type Marks, CONTAINER_TYPES, sameMarks, TEXT_TYPES, textColorOf } from './model.ts';

export interface IdSource {
  take(): string;
}

/** Node names the page and the view XML use, mapped to model block types. */
const BLOCK_NAMES: Record<string, BlockType> = {
  p: 'paragraph',
  paragraph: 'paragraph',
  heading: 'paragraph',
  ul: 'list',
  ol: 'list',
  list: 'list',
  bulletList: 'list',
  orderedList: 'list',
  taskList: 'list',
  li: 'listItem',
  listItem: 'listItem',
  taskItem: 'listItem',
  blockquote: 'blockquote',
  pre: 'codeBlock',
  codeBlock: 'codeBlock',
  hr: 'horizontalRule',
  horizontalRule: 'horizontalRule',
  table: 'table',
  tr: 'tableRow',
  row: 'tableRow',
  tableRow: 'tableRow',
  td: 'cell',
  th: 'cell',
  cell: 'cell',
  tableCell: 'cell',
  tableHeader: 'cell',
  embed: 'embed',
  pending: 'pending',
};
const ATOM_NAMES: Record<string, AtomType> = {
  br: 'hardBreak',
  hardBreak: 'hardBreak',
  mention: 'mention',
  date: 'date',
  chipDate: 'date',
  dropdown: 'dropdown',
  chipDropdown: 'dropdown',
  media: 'media',
  image: 'media',
  img: 'media',
};
const MARK_NAMES: Record<string, keyof Marks> = {
  b: 'bold',
  strong: 'bold',
  bold: 'bold',
  i: 'italic',
  em: 'italic',
  italic: 'italic',
  s: 'strike',
  strike: 'strike',
  del: 'strike',
  code: 'code',
  a: 'link',
  link: 'link',
  u: 'underline',
  underline: 'underline',
  mark: 'highlight',
  highlight: 'highlight',
  textColor: 'textColor',
};

export const blockTypeOf = (name: unknown): BlockType | undefined => (typeof name === 'string' ? BLOCK_NAMES[name] : undefined);
export const atomTypeOf = (name: unknown): AtomType | undefined => (typeof name === 'string' ? ATOM_NAMES[name] : undefined);
export const markNameOf = (name: unknown): keyof Marks | undefined => (typeof name === 'string' ? MARK_NAMES[name] : undefined);

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A mark spec `{type, attrs?}` applied to a marks object (on: add, off: remove). */
export function applyMark(marks: Marks | undefined, spec: unknown, on: boolean): Marks | undefined {
  if (!isRecord(spec)) return marks;
  const name = markNameOf(spec.type);
  if (!name) return marks;
  const next: Marks = { ...(marks ?? {}) };
  if (!on) delete next[name];
  else if (name === 'link') next.link = String((isRecord(spec.attrs) ? spec.attrs.href : spec.href) ?? '');
  else if (name === 'highlight') next.highlight = String((isRecord(spec.attrs) ? spec.attrs.color : spec.color) ?? '');
  else if (name === 'textColor') {
    // The page sends `{type, color}` (or `attrs.color` in its row spelling) and knows five colours; any other is not a
    // colour it can draw, so it stays off (ops refuses one an agent asks for).
    const color = textColorOf(isRecord(spec.attrs) ? spec.attrs.color : spec.color);
    if (!color) return marks;
    next.textColor = color;
  } else (next as Record<string, unknown>)[name] = true;
  return Object.keys(next).length ? next : undefined;
}

/** A mark spec asking for a text colour the page doesn't have: the colour it asked for, as given. */
export function unknownTextColor(spec: unknown): string | undefined {
  if (!isRecord(spec) || markNameOf(spec.type) !== 'textColor') return undefined;
  const color = isRecord(spec.attrs) ? spec.attrs.color : spec.color;
  return textColorOf(color) ? undefined : String(color ?? '');
}

function marksOf(node: Json, base?: Marks): Marks | undefined {
  let marks = base ? { ...base } : undefined;
  if (Array.isArray(node.marks)) for (const mark of node.marks) marks = applyMark(marks, typeof mark === 'string' ? { type: mark } : mark, true);
  return marks && Object.keys(marks).length ? marks : undefined;
}

function atomAttrs(type: AtomType, attrs: Json): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  switch (type) {
    case 'hardBreak':
      return undefined;
    case 'mention':
      out.principal = attrs.principal ?? attrs.user ?? null;
      if (attrs.ref != null) out.ref = attrs.ref;
      if (attrs.label != null) out.label = attrs.label;
      if (attrs.name != null) out.name = attrs.name;
      if (attrs.email != null) out.email = attrs.email;
      break;
    case 'date':
      out.ts = attrs.ts ?? attrs.value ?? null;
      break;
    case 'dropdown':
      out.enum = attrs.enum ?? '';
      out.index = attrs.index ?? null;
      break;
    case 'media':
      for (const [key, value] of Object.entries(attrs)) if (value != null && !['bid', 'id', 'type', 'attrs', 'marks'].includes(key)) out[key] = value;
      break;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Inline JSON (`[{type:'text', text, marks}, {type:'mention', attrs}]`, or a bare string) to inline items. */
export function inlineFromJson(content: unknown, ids: IdSource, base?: Marks): Inline[] {
  if (typeof content === 'string') return textToInline(content, ids, base);
  const out: Inline[] = [];
  for (const node of Array.isArray(content) ? content : []) {
    if (typeof node === 'string') {
      out.push(...textToInline(node, ids, base));
      continue;
    }
    if (!isRecord(node)) continue;
    if (node.type === 'text') {
      out.push(...textToInline(String(node.text ?? ''), ids, marksOf(node, base)));
      continue;
    }
    const atom = atomTypeOf(node.type);
    if (atom) {
      const attrs = atomAttrs(atom, isRecord(node.attrs) ? { ...node, ...node.attrs } : node);
      const marks = marksOf(node, base);
      out.push({ id: ids.take(), atom, ...(attrs ? { attrs } : {}), ...(marks ? { marks } : {}) } satisfies Atom);
      continue;
    }
    const mark = markNameOf(node.type);
    if (mark) {
      out.push(...inlineFromJson(node.content, ids, applyMark(base, node, true)));
      continue;
    }
    if (Array.isArray(node.content)) out.push(...inlineFromJson(node.content, ids, base));
  }
  return out;
}

export function textToInline(text: string, ids: IdSource, marks?: Marks): Char[] {
  return Array.from(text).map(ch => ({ id: ids.take(), ch, ...(marks ? { marks: { ...marks } } : {}) }));
}

function blockAttrs(type: BlockType, name: string, attrs: Json): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const int = (value: unknown) => (value === undefined || value === null || value === '' ? null : Number.isInteger(Number(value)) ? Number(value) : null);
  switch (type) {
    case 'paragraph': {
      const heading = name === 'heading' ? (int(attrs.level) ?? 1) : int(attrs.heading);
      if (heading) out.heading = heading;
      break;
    }
    case 'list': {
      out.kind = attrs.kind ?? (name === 'orderedList' || name === 'ol' ? 'ordered' : name === 'taskList' ? 'check' : 'bullet');
      const start = int(attrs.start);
      if (start !== null && start !== 1) out.start = start;
      if (attrs.numbering) out.numbering = attrs.numbering;
      break;
    }
    case 'listItem':
      if (attrs.checked !== undefined && attrs.checked !== null) out.checked = attrs.checked === true || attrs.checked === 'true' || attrs.checked === '1' || attrs.checked === '';
      break;
    case 'codeBlock':
      if (attrs.language) out.language = attrs.language;
      break;
    case 'cell':
      if (name === 'th' || name === 'tableHeader' || attrs.header === true || attrs.header === '1' || attrs.header === 'true') out.header = true;
      for (const key of ['colspan', 'rowspan']) {
        const value = int(attrs[key]);
        if (value !== null && value !== 1) out[key] = value;
      }
      if (attrs.colwidth != null) out.colwidth = attrs.colwidth;
      if (attrs.align === 'center' || attrs.align === 'right') out.align = attrs.align;
      if (typeof attrs.background === 'string' && /^#[0-9a-f]{6}$/i.test(attrs.background)) out.background = attrs.background.toLowerCase();
      break;
    case 'pending':
      out.intent = String(attrs.intent ?? '');
      break;
    case 'embed':
      for (const [key, value] of Object.entries(attrs)) if (value != null && key !== 'bid' && key !== 'id') out[key] = value;
      break;
    default:
      break;
  }
  return out;
}

/**
 * Block JSON (`[{type:'paragraph', attrs, content}]`) to blocks. Unknown nodes are skipped. `made` hears which block
 * each node became, for a reader that knows more of a node than its JSON says (a Word file's bookmarks).
 */
export function blocksFromJson(content: unknown, ids: IdSource, made?: (node: Json, block: Block) => void): Block[] {
  const out: Block[] = [];
  for (const node of Array.isArray(content) ? content : [content]) {
    if (!isRecord(node)) continue;
    const name = String(node.type ?? '');
    const type = blockTypeOf(name);
    if (!type) {
      // Inline content at block level becomes a paragraph.
      if (name === 'text' || atomTypeOf(name)) {
        const block: Block = { id: ids.take(), type: 'paragraph', inline: [] };
        block.inline = inlineFromJson([node], ids);
        out.push(block);
      }
      continue;
    }
    const attrs = blockAttrs(type, name, isRecord(node.attrs) ? { ...node, ...node.attrs } : node);
    const block: Block = { id: ids.take(), type };
    if (Object.keys(attrs).length) block.attrs = attrs;
    if (TEXT_TYPES.has(type)) block.inline = inlineFromJson(node.content ?? node.text ?? [], ids);
    else if (CONTAINER_TYPES.has(type)) {
      block.children = blocksFromJson(node.content ?? [], ids, made);
      if (type === 'listItem' && node.checked !== undefined && block.attrs?.checked === undefined) block.attrs = { ...(block.attrs ?? {}), checked: !!node.checked };
    }
    made?.(node, block);
    out.push(block);
  }
  return out;
}

// ---- out: the editor's JSON ------------------------------------------------------------------------------------

/**
 * A tab as the editor's ProseMirror JSON (`{type: 'doc', content}`), the shape the page's own parser makes of the view
 * XML: `bid` is the block id, attrs as the editor names them, text runs merged by marks. The history preview reads a
 * past version in this form (`at/<rev>`).
 */
export function docToJson(doc: DocState): Json {
  return { type: 'doc', content: doc.blocks.map(blockToJson) };
}

function blockToJson(block: Block): Json {
  const a = block.attrs ?? {};
  const attrs: Json = { bid: block.id };
  const pick = (...keys: string[]) => {
    for (const key of keys) if (a[key] !== undefined && a[key] !== null) attrs[key] = a[key];
  };
  switch (block.type) {
    case 'paragraph':
      attrs.heading = typeof a.heading === 'number' ? a.heading : null;
      break;
    case 'list':
      pick('kind', 'start', 'numbering');
      break;
    case 'listItem':
      if (a.checked !== undefined) attrs.checked = a.checked === true;
      break;
    case 'codeBlock':
      pick('language');
      break;
    case 'cell':
      if (a.header === true) attrs.header = true;
      pick('colspan', 'rowspan', 'colwidth', 'align', 'background');
      break;
    case 'pending':
      attrs.intent = String(a.intent ?? '');
      break;
    case 'embed':
      pick('ref');
      break;
    default:
      break;
  }
  const node: Json = { type: block.type, attrs };
  const content = block.inline ? inlineToJson(block.inline) : block.children ? block.children.map(blockToJson) : [];
  if (content.length) node.content = content;
  return node;
}

function marksToJson(marks: Marks | undefined): Json[] {
  const out: Json[] = [];
  for (const key of MARK_ORDER) {
    const value = marks?.[key];
    if (value === undefined) continue;
    // The page's parser keeps no highlight colour; a text colour is the mark's whole point.
    out.push(key === 'link' ? { type: 'link', attrs: { href: value } } : key === 'textColor' ? { type: key, attrs: { color: value } } : { type: key });
  }
  return out;
}

function atomToJson(item: Atom): Json {
  const a = item.attrs ?? {};
  let attrs: Json | undefined;
  switch (item.atom) {
    case 'hardBreak':
      break;
    case 'mention':
      // As the view XML prints it: a person's label falls back to their name.
      {
        const label = a.label ?? (a.principal && !a.ref ? a.name : undefined);
        attrs = { principal: a.principal ?? null, ref: a.ref ?? null, ...(label != null ? { label } : {}) };
      }
      break;
    case 'date':
      attrs = { ts: a.ts ?? null };
      break;
    case 'dropdown':
      attrs = { enum: a.enum ?? '', index: typeof a.index === 'number' ? a.index : a.index == null ? null : Number(a.index) };
      break;
    case 'media':
      attrs = Object.fromEntries(Object.entries(a).filter(([, value]) => value !== undefined && value !== null));
      break;
  }
  const marks = marksToJson(item.marks);
  return { type: item.atom, ...(attrs ? { attrs } : {}), ...(marks.length ? { marks } : {}) };
}

function inlineToJson(inline: Inline[]): Json[] {
  const out: Json[] = [];
  let run: Char[] = [];
  const flush = () => {
    if (!run.length) return;
    const marks = marksToJson(run[0]!.marks);
    out.push({ type: 'text', text: run.map(item => item.ch).join(''), ...(marks.length ? { marks } : {}) });
    run = [];
  };
  for (const item of inline) {
    if (isAtom(item)) {
      flush();
      out.push(atomToJson(item));
      continue;
    }
    if (run.length && !sameMarks(run[0]!.marks, item.marks)) flush();
    run.push(item);
  }
  flush();
  return out;
}
