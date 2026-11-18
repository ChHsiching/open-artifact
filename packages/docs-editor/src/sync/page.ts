/**
 * The page's form of a tab: the editor's JSON (`{type: 'doc', content}`), where every block carries its id as `bid`
 * and characters carry none. The editor's schema writes exactly these names, so `node.toJSON()` is a page doc and a
 * page doc is what the editor reads.
 */
import { type Atom, type AtomType, type Block, type DocState, type Inline, isAtom, MARK_ORDER, type Marks, type Proposal, applyMark, sameMarks, sameProposal } from '@open-artifact/docs-core';

export type PageAttrs = Record<string, unknown>;

export interface PageMark {
  type: string;
  attrs?: PageAttrs;
}

export interface PageNode {
  type: string;
  attrs?: PageAttrs;
  content?: PageNode[];
  text?: string;
  marks?: PageMark[];
}

/** The marks an open suggestion draws: words proposed to go in, and words proposed to go. */
export const SUGGEST_INS = 'suggestIns';
export const SUGGEST_DEL = 'suggestDel';

export const TEXT_BLOCKS = new Set(['paragraph', 'codeBlock']);
export const ATOMS = new Set<string>(['hardBreak', 'mention', 'date', 'dropdown', 'media']);

/** The attrs a picture keeps on the page; any others stay on the server as they are. */
export const MEDIA_ATTRS = ['blob', 'src', 'url', 'alt', 'name', 'mime', 'dims', 'crop', 'width'] as const;

const isRecord = (value: unknown): value is PageAttrs => typeof value === 'object' && value !== null && !Array.isArray(value);
const present = (value: unknown) => value !== null && value !== undefined;

// ---- model → page ------------------------------------------------------------------------------------------------

export function docToPage(doc: DocState): PageNode {
  return { type: 'doc', content: doc.blocks.map(blockToPage) };
}

export function blockToPage(block: Block): PageNode {
  const attrs: PageAttrs = { bid: block.id, ...blockAttrsOf(block) };
  if (block.suggest) Object.assign(attrs, { suggestId: block.suggest.id, suggestOp: block.suggest.op });
  const node: PageNode = { type: block.type, attrs };
  const content = block.inline ? inlineToPage(block.inline) : block.children ? block.children.map(blockToPage) : [];
  if (content.length) node.content = content;
  return node;
}

/** A block's own attrs as the page names them (no id, no suggestion). */
function blockAttrsOf(block: Block): PageAttrs {
  const a = block.attrs ?? {};
  const out: PageAttrs = {};
  const pick = (...keys: string[]) => {
    for (const key of keys) if (present(a[key])) out[key] = a[key];
  };
  switch (block.type) {
    case 'paragraph':
      if (typeof a.heading === 'number') out.heading = a.heading;
      break;
    case 'list':
      out.kind = a.kind ?? 'bullet';
      pick('start', 'numbering');
      break;
    case 'listItem':
      if (a.checked !== undefined && a.checked !== null) out.checked = a.checked === true;
      break;
    case 'codeBlock':
      pick('language');
      break;
    case 'cell':
      if (a.header === true) out.header = true;
      pick('colspan', 'rowspan', 'colwidth', 'align', 'background');
      break;
    case 'pending':
      out.intent = String(a.intent ?? '');
      break;
    case 'embed':
      // An embed is drawn from what it holds, never edited on the page: its attrs ride as one value.
      out.data = Object.fromEntries(Object.entries(a).filter(([, value]) => present(value)));
      break;
    default:
      break;
  }
  return out;
}

export function marksToPage(marks: Marks | undefined, suggest?: Proposal): PageMark[] {
  const out: PageMark[] = [];
  for (const key of MARK_ORDER) {
    const value = marks?.[key];
    if (value === undefined) continue;
    if (key === 'link') out.push({ type: 'link', attrs: { href: value } });
    else if (key === 'highlight') out.push({ type: 'highlight', attrs: { color: value || null } });
    else if (key === 'textColor') out.push({ type: 'textColor', attrs: { color: value } });
    else out.push({ type: key });
  }
  if (suggest) out.push({ type: suggest.op === 'ins' ? SUGGEST_INS : SUGGEST_DEL, attrs: { suggestId: suggest.id } });
  return out;
}

function atomToPage(item: Atom): PageNode {
  const attrs = atomAttrsOf(item.atom, item.attrs ?? {});
  const marks = marksToPage(item.marks, item.suggest);
  return { type: item.atom, ...(Object.keys(attrs).length ? { attrs } : {}), ...(marks.length ? { marks } : {}) };
}

/** An atom's attrs as the page names them. */
export function atomAttrsOf(atom: AtomType, a: PageAttrs): PageAttrs {
  const out: PageAttrs = {};
  switch (atom) {
    case 'hardBreak':
      break;
    case 'mention':
      for (const key of ['principal', 'ref', 'label', 'name', 'email']) if (present(a[key])) out[key] = a[key];
      break;
    case 'date':
      if (present(a.ts)) out.ts = a.ts;
      break;
    case 'dropdown':
      out.enum = a.enum ?? '';
      out.index = typeof a.index === 'number' ? a.index : a.index == null ? null : Number(a.index);
      break;
    case 'media':
      for (const key of MEDIA_ATTRS) if (present(a[key])) out[key] = a[key];
      break;
  }
  return out;
}

function inlineToPage(inline: Inline[]): PageNode[] {
  const out: PageNode[] = [];
  let run: Inline[] = [];
  const flush = () => {
    if (!run.length) return;
    const first = run[0]!;
    const marks = marksToPage(first.marks, first.suggest);
    out.push({ type: 'text', text: run.map(item => (isAtom(item) ? '' : item.ch)).join(''), ...(marks.length ? { marks } : {}) });
    run = [];
  };
  for (const item of inline) {
    if (isAtom(item)) {
      flush();
      out.push(atomToPage(item));
      continue;
    }
    if (run.length && !sameLook(run[0]!, item)) flush();
    run.push(item);
  }
  flush();
  return out;
}

const sameLook = (a: Inline, b: Inline) => sameMarks(a.marks, b.marks) && sameProposal(a.suggest, b.suggest);

// ---- page items ---------------------------------------------------------------------------------------------------

/** One character or atom of a page text block, as the model would hold it (no id). */
export type PageItem =
  | { kind: 'char'; ch: string; marks?: Marks; suggest?: Proposal }
  | { kind: 'atom'; atom: AtomType; attrs: PageAttrs; marks?: Marks; suggest?: Proposal };

/** The model's marks and suggestion of a page node's marks. */
export function marksFromPage(marks: readonly PageMark[] | undefined): { marks?: Marks; suggest?: Proposal } {
  let out: Marks | undefined;
  let suggest: Proposal | undefined;
  for (const mark of marks ?? []) {
    if (mark.type === SUGGEST_INS || mark.type === SUGGEST_DEL) {
      const id = mark.attrs?.suggestId;
      if (typeof id === 'string' && id) suggest = { id, op: mark.type === SUGGEST_INS ? 'ins' : 'del' };
      continue;
    }
    const spec = mark.type === 'highlight' ? { type: 'highlight', attrs: { color: mark.attrs?.color ?? '' } } : mark;
    out = applyMark(out, spec, true);
  }
  return { ...(out ? { marks: out } : {}), ...(suggest ? { suggest } : {}) };
}

export function pageItems(node: PageNode): PageItem[] {
  const out: PageItem[] = [];
  for (const child of node.content ?? []) {
    const { marks, suggest } = marksFromPage(child.marks);
    const extra = { ...(marks ? { marks } : {}), ...(suggest ? { suggest } : {}) };
    if (child.type === 'text') {
      for (const ch of Array.from(child.text ?? '')) out.push({ kind: 'char', ch, ...extra });
    } else if (ATOMS.has(child.type)) {
      out.push({ kind: 'atom', atom: child.type as AtomType, attrs: atomAttrsOf(child.type as AtomType, child.attrs ?? {}), ...extra });
    }
  }
  return out;
}

/** A model item as a page item. */
export function itemOf(item: Inline): PageItem {
  const extra = { ...(item.marks ? { marks: item.marks } : {}), ...(item.suggest ? { suggest: item.suggest } : {}) };
  return isAtom(item) ? { kind: 'atom', atom: item.atom, attrs: atomAttrsOf(item.atom, item.attrs ?? {}), ...extra } : { kind: 'char', ch: item.ch, ...extra };
}

/** What lines two items up: the same character, or an atom of the same kind. */
export const itemKey = (item: PageItem) => (item.kind === 'char' ? `c${item.ch}` : `a${item.atom}`);

/** The text a block's items read as (an atom is one object character). */
export const itemsText = (items: readonly PageItem[]) => items.map(item => (item.kind === 'char' ? item.ch : '￼')).join('');

/** Page items as the inline JSON an op carries; an addition to an open suggestion keeps its mark, so it joins it. */
export function itemsToJson(items: readonly PageItem[]): PageAttrs[] {
  const out: PageAttrs[] = [];
  const markJson = (item: PageItem) => {
    const marks: PageAttrs[] = marksToPage(item.marks).map(mark => ({ ...mark }));
    if (item.suggest?.op === 'ins') marks.push({ type: 'suggest', attrs: { suggestId: item.suggest.id, op: 'ins' } });
    return marks;
  };
  for (const item of items) {
    const marks = markJson(item);
    if (item.kind === 'atom') {
      out.push({ type: item.atom, ...(Object.keys(item.attrs).length ? { attrs: item.attrs } : {}), ...(marks.length ? { marks } : {}) });
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) last.text = `${String(last.text)}${item.ch}`;
    else out.push({ type: 'text', text: item.ch, ...(marks.length ? { marks } : {}) });
  }
  return out;
}

/** A page block as the block JSON an op carries: no ids, an open suggestion's addition named so it joins it. */
export function blockToJson(node: PageNode, shell = false): PageAttrs {
  const { bid: _bid, suggestId, suggestOp, ...attrs } = node.attrs ?? {};
  const given = node.type === 'embed' && isRecord(attrs.data) ? attrs.data : attrs;
  const own = Object.fromEntries(Object.entries(given).filter(([, value]) => present(value)));
  if (suggestOp === 'ins' && typeof suggestId === 'string') Object.assign(own, { suggestId, suggestOp });
  const out: PageAttrs = { type: node.type, ...(Object.keys(own).length ? { attrs: own } : {}) };
  if (TEXT_BLOCKS.has(node.type)) {
    const items = pageItems(node).map(item => (item.suggest?.op === 'del' ? withoutSuggest(item) : item));
    const content = itemsToJson(items);
    if (content.length) out.content = content;
  } else if (!shell && node.content?.length) out.content = node.content.map(child => blockToJson(child));
  return out;
}

const withoutSuggest = (item: PageItem): PageItem => {
  const { suggest: _suggest, ...rest } = item;
  return rest as PageItem;
};

// ---- comparing ----------------------------------------------------------------------------------------------------

const DEFAULTS: Record<string, PageAttrs> = {
  list: { kind: 'bullet', start: 1 },
  cell: { header: false, colspan: 1, rowspan: 1, align: 'left' },
};

/** A page node with nothing that doesn't change how it reads: null attrs, defaults, empty marks, split text runs. */
export function canonical(node: PageNode, ids = true): PageNode {
  if (node.type === 'text') {
    const marks = canonicalMarks(node.marks);
    return { type: 'text', text: node.text ?? '', ...(marks.length ? { marks } : {}) };
  }
  const defaults = DEFAULTS[node.type] ?? {};
  const attrs: PageAttrs = {};
  const given = ATOMS.has(node.type) ? atomAttrsOf(node.type as AtomType, node.attrs ?? {}) : (node.attrs ?? {});
  for (const key of Object.keys(given).sort()) {
    const value = given[key];
    if (!present(value) || (!ids && key === 'bid') || defaults[key] === value) continue;
    if (node.type === 'paragraph' && key === 'heading' && !value) continue;
    attrs[key] = value;
  }
  if (node.type === 'list' && attrs.kind === undefined) attrs.kind = 'bullet';
  const out: PageNode = { type: node.type, ...(Object.keys(attrs).length ? { attrs } : {}) };
  const marks = canonicalMarks(node.marks);
  if (marks.length) out.marks = marks;
  const content: PageNode[] = [];
  for (const child of node.content ?? []) {
    const next = canonical(child, ids);
    const last = content[content.length - 1];
    if (next.type === 'text' && last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(next.marks ?? [])) last.text = `${last.text}${next.text}`;
    else if (next.type !== 'text' || next.text) content.push(next);
  }
  if (content.length) out.content = content;
  return out;
}

function canonicalMarks(marks: readonly PageMark[] | undefined): PageMark[] {
  const { marks: model, suggest } = marksFromPage(marks);
  return marksToPage(model, suggest).map(mark => (mark.type === 'highlight' && !mark.attrs?.color ? { type: 'highlight' } : mark));
}

export const samePage = (a: PageNode, b: PageNode, ids = true) => JSON.stringify(canonical(a, ids)) === JSON.stringify(canonical(b, ids));

/** Text blocks of a page doc in document order, with their place. */
export function* pageTextBlocks(node: PageNode, path: number[] = []): Generator<{ node: PageNode; path: number[] }> {
  for (let index = 0; index < (node.content ?? []).length; index++) {
    const child = node.content![index]!;
    if (TEXT_BLOCKS.has(child.type)) yield { node: child, path: [...path, index] };
    else if (!ATOMS.has(child.type) && child.type !== 'text') yield* pageTextBlocks(child, [...path, index]);
  }
}

export const bidOf = (node: PageNode): string | null => {
  const bid = node.attrs?.bid;
  return typeof bid === 'string' && bid ? bid : null;
};

export const isRecordAttrs = isRecord;
