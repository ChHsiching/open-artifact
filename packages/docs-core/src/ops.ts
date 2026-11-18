/**
 * Writes to a tab: a list of ops applied in order, all or nothing.
 *
 * Two spellings arrive. The page sends some ops in its "row" spelling (`mark`, `block_split`, `block_join`,
 * `block_move`, `wrap` with `block`/`from`, `unwrap` with `block`, `attr`, `block_del`); normalizeOp turns them into
 * the final words (`format`, `split`, `join`, `move`, `wrap`, `unwrap`, `set`, `delete`), the same mapping the page
 * itself uses. The CLI writes the final words directly, and may also name places by text (`find`) or table cell
 * (`cell`), and send markdown.
 *
 * Every created block and inline item gets an id: first from the op's own `ids` (`{from, count}`, a list, or `id`),
 * then from the writing session's counter. The page predicts those counter ids, so the order matters: a block's own id,
 * then its inline items, then its children; typed text one id per code point.
 */
import { applyMark, atomTypeOf, blocksFromJson, inlineFromJson, type IdSource, textToInline, unknownTextColor } from './content.ts';
import { MarkdownError, type MarkdownContext, parseMarkdown, parseMarkdownInline, type Chips } from './markdown.ts';
import { afterDecide, beforeDecide, type Decision, type Undecided, undoDecision } from './decisions.ts';
import {
  type Block,
  type BlockPlace,
  type CharPlace,
  type DocState,
  type Inline,
  type Proposal,
  type SuggestionInfo,
  ancestors,
  blockHash,
  blockText,
  clone,
  findBlock,
  findChar,
  isAtom,
  isContainer,
  isText,
  newBlock,
  splitId,
  subtreeIds,
  walk,
  shapeProblems,
  type ShapeProblem,
  proposalIds,
  proposalParts,
  SUGGEST_ID,
  suggestionAsOf,
} from './model.ts';

export class Refusal extends Error {
  code: string;
  opIndex: number | undefined;
  extra: Record<string, unknown>;
  constructor(code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.opIndex = undefined;
    this.extra = extra;
  }
}

export interface Session {
  sess: string;
  next: number;
}

export interface OpResult {
  changed: boolean;
  minted?: string[];
  retired?: string[];
  /** A `decide` that took a suggestion: which, and how. */
  decided?: { suggestId: string; verdict: string };
  /** An `undecide`: what came back of the decision it took back, as the page reads it. */
  undecided?: Undecided;
}

export interface ApplyOptions {
  /** Agent writes (the CLI): replacing or deleting whole blocks needs `ifHash` + `ifRev`, or `force`. */
  guards?: boolean;
  /** The rev the request names (`ifRev`), checked with guards. */
  ifRev?: number;
  /** Chip definitions for markdown sources (`<?oa block k?>`), merged under each source's own `blocks`. */
  chips?: Chips;
  /** The writer (for `mention user: me`); chip keys → ids are collected in `markdown.keys`. */
  markdown?: MarkdownContext;
  /**
   * An agent's suggestion (`"suggest"` on the payload): every op proposes its change under this id, for the person to
   * accept or reject, instead of making it. `info` is recorded when the id is new.
   */
  suggest?: { id: string; info: SuggestionInfo };
  /** The page's writes: the decisions an `undecide` may take back (see decisions.ts), by suggestion id. */
  decisions?: (suggestId: string) => Decision | undefined;
  /**
   * The person a page's write is by (the server names them). A suggestion the page starts in Suggesting mode (`suggest`
   * on an op) is recorded as theirs, and the page adds only to suggestions of their own. Left out (the page applying its
   * own ops), a new one is recorded with no one's name until the tab is read again.
   */
  author?: string;
}

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && value !== '';

// ---- row spelling → final words (the page's own mapping) -------------------------------------------------------

const blocksTarget = (ids: string[]) => ({ kind: 'blocks', ids });
const charsTarget = (from: string, to: string) => ({ kind: 'chars', range: [from, to] });
const blockList = (value: unknown): string[] | null =>
  isId(value) ? [value] : isRecord(value) && value.kind === 'blocks' && Array.isArray(value.ids) && value.ids.length > 0 && value.ids.every(isId) ? (value.ids as string[]) : null;
const withDetach = (op: Json, out: Json) => (op.allowDetach === true ? { ...out, allowDetach: true } : out);

export function normalizeOp(op: Json): Json {
  switch (op.op) {
    case 'block_split': {
      if (!isId(op.at)) return op;
      const ids = [op.item, op.id].filter(isId);
      return {
        op: 'split',
        target: charsTarget(op.at, op.at),
        side: op.side === 'before' ? 'before' : 'after',
        ...(ids.length ? { ids } : {}),
        ...(op.tail !== undefined ? { tail: op.tail } : {}),
        ...(isId(op.resurrect) ? { resurrect: op.resurrect } : {}),
      };
    }
    case 'block_join': {
      const ids = Array.isArray(op.block) && op.block.every(isId) ? (op.block as string[]) : blockList(op.block);
      if (!ids || ids.length !== 2) return op;
      return withDetach(op, { op: 'join', target: blocksTarget(ids), ...(op.dir === 'forward' || op.dir === 'backward' ? { dir: op.dir } : {}) });
    }
    case 'block_move': {
      const ids = blockList(op.block);
      if (!ids) return op;
      const place = (id: string) => (id === 'root' ? { kind: 'root' } : blocksTarget([id]));
      const to =
        isId(op.parent) && (op.after === 'head' || op.after === undefined || op.after === 'end') && op.before === undefined
          ? { target: place(op.parent), side: op.after === 'head' ? 'start' : 'end' }
          : isId(op.after) && op.after !== 'head' && op.after !== 'end'
            ? { target: place(op.after), side: 'after' }
            : isId(op.before)
              ? { target: place(op.before), side: 'before' }
              : null;
      if (!to) return op;
      return withDetach(op, { op: 'move', target: blocksTarget(ids), to, ...(isId(op.id) ? { ids: [op.id] } : {}) });
    }
    case 'wrap': {
      if (isRecord(op.target) || !isRecord(op.in) || (op.block === undefined && op.from === undefined && !Array.isArray(op.members))) return op;
      const fromTo = op.members === undefined && op.block === undefined;
      const members = Array.isArray(op.members) ? (op.members as string[]) : blockList(fromTo ? op.from : op.block);
      if (!members) return op;
      const thru = fromTo && op.to !== members[0] ? op.to : undefined;
      const ids = Array.isArray(op.ids) ? op.ids.filter(isId) : [];
      return { op: 'wrap', target: blocksTarget(members), ...(thru !== undefined ? { thru } : {}), in: op.in, ...(ids.length ? { ids } : {}) };
    }
    case 'unwrap': {
      if (isRecord(op.target)) return op;
      const ids = blockList(op.block);
      if (!ids) return op;
      return withDetach(op, { op: 'unwrap', target: blocksTarget(ids), ...(isId(op.id) ? { ids: [op.id] } : {}) });
    }
    case 'mark': {
      const range = Array.isArray(op.range) ? op.range : isRecord(op.range) && op.range.kind === 'chars' ? (op.range.range as unknown[]) : null;
      if (!range || !isId(range[0]) || !isId(range[1]) || !isId(op.style) || typeof op.on !== 'boolean') return op;
      const spec = { type: op.style, ...(isRecord(op.attrs) && Object.keys(op.attrs).length ? { attrs: op.attrs } : {}) };
      return { op: 'format', target: charsTarget(range[0], range[1]), [op.on ? 'add' : 'remove']: [spec] };
    }
    case 'attr': {
      if (!isRecord(op.set)) return op;
      const target = isId(op.at) ? charsTarget(op.at, op.at) : blockList(op.block) ? blocksTarget(blockList(op.block)!) : null;
      return target ? withDetach(op, { op: 'set', target, attrs: op.set }) : op;
    }
    case 'block_del': {
      const ids = blockList(op.block);
      return ids ? withDetach(op, { op: 'delete', target: blocksTarget(ids) }) : op;
    }
    default:
      return op;
  }
}

// ---- ids -------------------------------------------------------------------------------------------------------

function explicitIds(op: Json): string[] {
  const ids = op.ids;
  if (isRecord(ids) && isId(ids.from)) {
    const start = splitId(ids.from);
    const count = Number(ids.count ?? 1);
    if (!start || !Number.isInteger(count) || count < 1) return [];
    return Array.from({ length: count }, (_, offset) => `${start.sess}.${start.n + offset}`);
  }
  if (Array.isArray(ids)) return ids.filter(isId);
  return isId(op.id) ? [op.id] : [];
}

class OpIds implements IdSource {
  minted: string[] = [];
  private queue: string[];
  private session: Session;
  private used: Set<string>;
  constructor(op: Json, session: Session, used: Set<string>) {
    this.queue = explicitIds(op);
    this.session = session;
    this.used = used;
  }
  take(): string {
    let id = this.queue.shift();
    if (id === undefined || this.used.has(id)) {
      do id = `${this.session.sess}.${this.session.next++}`;
      while (this.used.has(id));
    }
    const parts = splitId(id);
    if (parts && parts.sess === this.session.sess && parts.n >= this.session.next) this.session.next = parts.n + 1;
    this.used.add(id);
    this.minted.push(id);
    return id;
  }
}

// ---- the writer ------------------------------------------------------------------------------------------------

interface Point {
  block: Block;
  index: number;
}

export interface ApplyResult {
  doc: DocState;
  results: OpResult[];
  notices: Json[];
  changed: boolean;
  /** What each `decide` in the write changed, for an undo to take back; never part of the doc or the answer. */
  decisions: Decision[];
}

/** Applies ops to a copy of the doc. Throws a Refusal (with opIndex) and leaves the doc as it was. */
export function applyOps(source: DocState, ops: unknown[], session: Session, options: ApplyOptions = {}): ApplyResult {
  const doc = clone(source);
  const startNext = session.next;
  const used = new Set<string>();
  for (const { block } of walk(doc.blocks)) for (const id of subtreeIds(block)) used.add(id);
  const results: OpResult[] = [];
  const notices: Json[] = [];
  // Containers dropped because a write left them empty; a later op in the same write may still delete them.
  const pruned = new Set<string>();
  const decisions: Decision[] = [];
  // Suggestions the page started or added to in this write (`suggest` on an op).
  const proposed = new Set<string>();
  try {
    ops.forEach((raw, index) => {
      if (!isRecord(raw)) throw new Refusal('bad_op', `op ${index} is not an object`);
      try {
        results.push(new Writer(doc, normalizeOp(raw), session, used, options, notices, pruned, decisions, proposed).run());
      } catch (error) {
        const refusal = error instanceof MarkdownError ? new Refusal(error.code, error.message) : error;
        if (refusal instanceof Refusal && refusal.opIndex === undefined) refusal.opIndex = index;
        throw refusal;
      }
    });
    if (doc.blocks.length === 0) throw new Refusal('last_block', 'a tab keeps at least one block; replace the last block instead of deleting it');
    syncSuggestions(doc, options.suggest, proposed, options.author);
    // An agent's call is judged by what it leaves, not its steps. The page's own writes come from a document its schema
    // already holds to. A misfit that was there before this call doesn't stop the call (one may be mending it).
    if (options.guards && results.some(result => result.changed)) {
      const keyOf = (problem: ShapeProblem) => `${problem.id} ${problem.need} ${problem.got}`;
      const known = new Set(shapeProblems(source.blocks).map(keyOf));
      const problem = shapeProblems(doc.blocks).find(found => !known.has(keyOf(found)));
      if (problem) throw new Refusal('shape_mismatch', problem.message, { id: problem.id, need: problem.need, got: problem.got });
    }
  } catch (error) {
    session.next = startNext;
    throw error;
  }
  const changed = results.some(result => result.changed);
  if (changed) doc.rev = source.rev + 1;
  return { doc, results, notices, changed, decisions };
}

/**
 * The tab's suggestion records after a write: one for each suggestion with parts left, none for any without. One the
 * page started in this write is the author's.
 */
function syncSuggestions(doc: DocState, suggest: ApplyOptions['suggest'], proposed: ReadonlySet<string>, author: string | undefined): void {
  const open = proposalIds(doc.blocks);
  const records: Record<string, SuggestionInfo> = {};
  for (const id of open) {
    const known = doc.suggestions?.[id] ?? (suggest?.id === id ? suggest.info : undefined);
    records[id] = known ?? { by: proposed.has(id) ? (author ?? '') : '', at: new Date().toISOString() };
  }
  if (open.length) doc.suggestions = records;
  else delete doc.suggestions;
}

interface ProposalPart {
  id: string;
  block: boolean;
  sig: string;
}

/** Each open suggestion's parts in document order, with what a plain edit must leave as it is. */
function proposalSnapshot(blocks: Block[]): Map<string, ProposalPart[]> {
  const parts = new Map<string, ProposalPart[]>();
  const add = (suggestId: string, part: ProposalPart) => {
    const list = parts.get(suggestId);
    if (list) list.push(part);
    else parts.set(suggestId, [part]);
  };
  for (const { block, parent } of walk(blocks)) {
    if (block.suggest) add(block.suggest.id, { id: block.id, block: true, sig: JSON.stringify([block.id, parent?.id, block.type, block.attrs, block.suggest]) });
    for (const item of block.inline ?? []) if (item.suggest) add(item.suggest.id, { id: item.id, block: false, sig: JSON.stringify([block.id, item]) });
  }
  return parts;
}

/** A block node's attrs that name a suggestion, as the page writes a block it adds inside one. */
function suggestAttrs(value: Json): boolean {
  return isRecord(value.attrs) && ('suggestId' in value.attrs || 'suggestOp' in value.attrs);
}

/**
 * Whether any mark spec, inline node or block in an op is a suggestion's (`{type: 'suggest'}`, the row spelling's
 * `style`, or a block's `suggestId` / `suggestOp` attrs).
 */
function holdsSuggestMark(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (Array.isArray(value)) return value.some(item => holdsSuggestMark(item, depth + 1));
  if (!isRecord(value)) return false;
  if (value.type === 'suggest' || value.style === 'suggest' || suggestAttrs(value)) return true;
  return ['marks', 'content', 'source', 'with', 'from', 'add', 'remove'].some(key => holdsSuggestMark(value[key], depth + 1));
}

class Writer {
  private doc: DocState;
  private op: Json;
  private ids: OpIds;
  private used: Set<string>;
  private options: ApplyOptions;
  private notices: Json[];
  private retired: string[] = [];
  private decided: OpResult['decided'];
  private undecided: OpResult['undecided'];
  private pruned: Set<string>;
  private decisions: Decision[];
  private proposed: Set<string>;
  /** The suggestion this op proposes its change under: the agent's (on the payload) or the page's (on the op). */
  private proposal: string | null = null;
  constructor(
    doc: DocState,
    op: Json,
    session: Session,
    used: Set<string>,
    options: ApplyOptions,
    notices: Json[],
    pruned: Set<string>,
    decisions: Decision[],
    proposed: Set<string>,
  ) {
    this.pruned = pruned;
    this.decisions = decisions;
    this.proposed = proposed;
    this.doc = doc;
    this.op = op;
    this.ids = new OpIds(op, session, used);
    this.used = used;
    this.options = options;
    this.notices = notices;
  }

  run(): OpResult {
    // An agent's plain edit leaves open suggestions as they are: their words and blocks wait for the person's decision.
    const watch = this.options.guards && !this.options.suggest && this.op.op !== 'decide' && this.op.op !== 'undecide' ? proposalSnapshot(this.doc.blocks) : null;
    const changed = this.dispatch();
    if (watch?.size) this.leftAlone(watch);
    const result: OpResult = { changed };
    if (this.ids.minted.length) result.minted = this.ids.minted;
    if (this.retired.length) result.retired = this.retired;
    if (this.decided) result.decided = this.decided;
    if (this.undecided) result.undecided = this.undecided;
    return result;
  }

  private dispatch(): boolean {
    // Words typed inside words a suggestion adds take its mark on the page (the mark is inclusive): they join it.
    const joined = this.joinedSuggestion();
    // In Suggesting mode the page names its suggestion on the op (`suggest: "<id>"`), never as a mark in what it writes.
    const own = this.pageSuggestion();
    if (holdsSuggestMark(this.op))
      throw new Refusal(
        'suggest_not_here',
        this.options.guards ? 'a suggestion is "suggest": true on the update payload, not a mark' : 'a suggestion is "suggest": "<id>" on the op, not a mark; nothing was changed',
      );
    if (this.op.op === 'decide') return this.decide();
    if (this.op.op === 'undecide') return this.undecide();
    if (this.options.suggest) {
      this.proposal = this.options.suggest.id;
      return this.propose();
    }
    if (own) {
      this.proposal = own;
      this.proposed.add(own);
      return this.propose(true);
    }
    if (joined) {
      const changed = this.plain();
      this.tagMinted(joined);
      return changed;
    }
    return this.plain();
  }

  /**
   * The page's own suggestion (Suggesting mode): `suggest: "<id>"` on an insert, delete or replace proposes the change
   * under that id, as the person's, instead of making it. A new id starts a suggestion; an open one is added to only
   * when it is the writer's own (not someone else's, nor an agent's). Takes the field off the op and answers the id.
   */
  private pageSuggestion(): string | null {
    const id = this.op.suggest;
    if (id === undefined) return null;
    if (this.options.guards) throw new Refusal('suggest_not_here', 'a suggestion is "suggest": true on the update payload, not on an op');
    if (this.options.suggest || this.op.op === 'decide' || this.op.op === 'undecide') throw new Refusal('bad_op', 'this op takes no suggest');
    if (!isId(id) || !SUGGEST_ID.test(id)) throw new Refusal('bad_op', 'suggest on an op names the suggestion it is part of');
    const author = this.options.author;
    const info = this.doc.suggestions?.[id];
    if (author !== undefined && info && proposalIds(this.doc.blocks).includes(id) && (info.via === 'agent' || (info.by !== '' && info.by !== author)))
      throw new Refusal('not_yours', `${id} is someone else's suggestion; a suggestion of your own takes a new id`, { suggestId: id });
    const { suggest: _suggest, ...rest } = this.op;
    this.op = rest;
    return id;
  }

  /**
   * A page write that adds words or blocks inside an open suggestion's addition: words carry that suggestion's mark,
   * `{type: 'suggest', suggestId, op: 'ins'}`, and a block (Enter at the end of a suggested paragraph inserts the next
   * one) its `suggestId` and `suggestOp: 'ins'` attrs. Takes those off the op and answers the suggestion's id; null for
   * anything else.
   */
  private joinedSuggestion(): string | null {
    if (this.options.guards || (this.op.op !== 'insert' && this.op.op !== 'replace')) return null;
    const specs: Json[] = [];
    const collect = (value: unknown, depth: number): void => {
      if (depth > 12) return;
      if (Array.isArray(value)) value.forEach(item => collect(item, depth + 1));
      else if (isRecord(value)) {
        if (value.type === 'suggest') specs.push(isRecord(value.attrs) ? { ...value, ...value.attrs } : value);
        else if (suggestAttrs(value)) specs.push({ suggestId: (value.attrs as Json).suggestId, op: (value.attrs as Json).suggestOp });
        for (const key of ['marks', 'content', 'source', 'with', 'from']) collect(value[key], depth + 1);
      }
    };
    collect(this.op.source ?? this.op.with, 0);
    if (!specs.length) return null;
    const id = specs[0]!.suggestId;
    if (!isId(id) || specs.some(spec => spec.suggestId !== id || spec.op !== 'ins')) return null;
    if (!proposalIds(this.doc.blocks).includes(id)) return null;
    const strip = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(strip);
      if (!isRecord(value)) return value;
      const out: Json = {};
      for (const [key, item] of Object.entries(value)) {
        if (key === 'marks' && Array.isArray(item)) out[key] = item.filter(mark => !(isRecord(mark) && mark.type === 'suggest')).map(strip);
        else if (key === 'attrs' && isRecord(item) && value.type !== 'suggest') {
          const { suggestId: _id, suggestOp: _op, ...rest } = item;
          if (Object.keys(rest).length) out[key] = strip(rest);
        } else out[key] = strip(item);
      }
      return out;
    };
    this.op = strip(this.op) as Json;
    return id;
  }

  private plain(): boolean {
    switch (this.op.op) {
      case 'insert':
        return this.insert();
      case 'delete':
        return this.remove();
      case 'replace':
        return this.replace();
      case 'split':
        return this.split();
      case 'join':
        return this.join();
      case 'format':
        return this.format();
      case 'set':
        return this.set();
      case 'wrap':
        return this.wrap();
      case 'unwrap':
        return this.unwrap();
      case 'move':
        return this.move();
      default:
        throw new Refusal('unknown_op', `unknown op ${JSON.stringify(this.op.op)}`);
    }
  }

  // -- targets --

  private target(): Json {
    const target = this.op.target;
    if (!isRecord(target)) throw new Refusal('bad_target', 'the op has no target');
    return target;
  }

  private char(id: unknown): CharPlace {
    if (!isId(id)) throw new Refusal('bad_target', 'a chars range names two char ids');
    const place = findChar(this.doc, id);
    if (!place) throw new Refusal('char_gone', `char ${id} is not in the tab`, { id });
    return place;
  }

  private block(id: unknown): BlockPlace {
    if (!isId(id)) throw new Refusal('bad_target', 'a blocks target names block ids');
    const place = findBlock(this.doc, id);
    if (!place) throw new Refusal('block_gone', `block ${id} is not in the tab`, { id });
    return place;
  }

  /** A chars range (two ends, inclusive), from `range`, `runs`, `find` or a one-char `at`. */
  private charRange(target: Json): [CharPlace, CharPlace] {
    if (target.kind === 'find') return this.find(target);
    if (Array.isArray(target.runs) && target.runs.length) {
      const flat = (target.runs as unknown[]).flat(2).filter(isId);
      if (flat.length) return this.ordered(this.char(flat[0]), this.char(flat[flat.length - 1]));
    }
    const range = Array.isArray(target.range) ? target.range : null;
    if (!range) throw new Refusal('bad_target', 'a chars target needs range: [fromId, toId]');
    return this.ordered(this.char(range[0]), this.char(range[1] ?? range[0]));
  }

  private ordered(a: CharPlace, b: CharPlace): [CharPlace, CharPlace] {
    if (a.block === b.block) return a.index <= b.index ? [a, b] : [b, a];
    const order = this.textBlocks();
    return order.indexOf(a.block) <= order.indexOf(b.block) ? [a, b] : [b, a];
  }

  private textBlocks(): Block[] {
    return [...walk(this.doc.blocks)].map(place => place.block).filter(isText);
  }

  /** `{kind:'find', text, block?, nth?}`: the nth (1-based) match of the text, in one block or the whole tab. */
  private find(target: Json): [CharPlace, CharPlace] {
    const text = String(target.text ?? '');
    if (!text) throw new Refusal('bad_target', 'find needs text');
    const scope = target.block ?? target.in;
    const blocks = scope ? [this.block(isRecord(scope) ? (scope.ids as string[] | undefined)?.[0] ?? scope.id : scope).block].flatMap(b => [...walk([b])].map(p => p.block).filter(isText)) : this.textBlocks();
    const matches: Array<[Block, number]> = [];
    for (const block of blocks) {
      const chars = block.inline!.map(item => (isAtom(item) ? '￼' : item.ch));
      const joined = chars.join('');
      let from = 0;
      for (;;) {
        const at = joined.indexOf(text, from);
        if (at < 0) break;
        // indexOf counts UTF-16 units; convert to item indexes.
        const index = Array.from(joined.slice(0, at)).length;
        matches.push([block, index]);
        from = at + Math.max(text.length, 1);
      }
    }
    if (!matches.length) throw new Refusal('find_none', `no text matches ${JSON.stringify(text)}`, { text });
    const nth = target.nth === undefined ? 1 : Number(target.nth);
    if (target.nth === undefined && matches.length > 1)
      throw new Refusal('find_many', `${matches.length} places match ${JSON.stringify(text)}; add nth (1-based) or narrow with block`, { text, count: matches.length });
    const match = matches[nth - 1];
    if (!match) throw new Refusal('find_none', `match ${nth} of ${JSON.stringify(text)} does not exist (${matches.length} found)`, { text, count: matches.length });
    const [block, index] = match;
    const length = Array.from(text).length;
    return [
      { block, index, item: block.inline![index]! },
      { block, index: index + length - 1, item: block.inline![index + length - 1]! },
    ];
  }

  /** `{kind:'cell', table, row, col}` (0-based row and column) to the cell block. */
  private cell(target: Json): BlockPlace {
    const table = this.block(target.table ?? target.id).block;
    if (table.type !== 'table') throw new Refusal('cell_none', `${table.id} is not a table`);
    const row = table.children?.[Number(target.row)];
    const cell = row?.children?.[Number(target.col)];
    if (!cell) throw new Refusal('cell_none', `table ${table.id} has no cell at row ${target.row}, col ${target.col}`);
    return this.block(cell.id);
  }

  private targetBlocks(target: Json): BlockPlace[] {
    if (target.kind === 'cell') return [this.cell(target)];
    const ids = blockList(target) ?? (isId(target.id) ? [target.id] : null);
    if (!ids) throw new Refusal('bad_target', 'a blocks target needs ids');
    return ids.map(id => this.block(id));
  }

  // -- guards (agent writes) --

  private guard(places: BlockPlace[]): void {
    if (!this.options.guards || this.op.force === true) return;
    const ifHash = this.op.ifHash;
    const ifRev = this.op.ifRev ?? this.options.ifRev;
    if (ifHash === undefined || ifRev === undefined)
      throw new Refusal('missing_guard', 'replacing or deleting whole blocks needs ifHash (from an outline read) and ifRev, or force: true', {
        hashes: Object.fromEntries(places.map(place => [place.block.id, blockHash(place.block)])),
        rev: this.doc.rev,
      });
    const expected = isRecord(ifHash) ? ifHash : Object.fromEntries(places.map(place => [place.block.id, ifHash]));
    const stale = places.filter(place => expected[place.block.id] !== undefined && expected[place.block.id] !== blockHash(place.block));
    if (Number(ifRev) !== this.doc.rev && stale.length)
      throw new Refusal('guard_mismatch', `the block changed since rev ${ifRev}; read it again`, {
        rev: this.doc.rev,
        hashes: Object.fromEntries(stale.map(place => [place.block.id, blockHash(place.block)])),
      });
    if (Number(ifRev) === this.doc.rev && stale.length)
      throw new Refusal('guard_mismatch', 'ifHash does not match the block', { hashes: Object.fromEntries(stale.map(place => [place.block.id, blockHash(place.block)])) });
  }

  // -- content --

  private source(): Json {
    const source = this.op.source ?? this.op.with;
    if (!isRecord(source)) throw new Refusal('bad_source', 'the op needs source: {from: {kind: "inline", content}, as}');
    return source;
  }

  private sourceContent(source: Json): unknown {
    const from = source.from;
    if (isRecord(from)) return from.content ?? from.text ?? from.markdown;
    return source.content ?? source.text ?? source.markdown;
  }

  private sourceAs(source: Json): string {
    if (typeof source.as === 'string') return source.as;
    const from = isRecord(source.from) ? source.from : source;
    return typeof from.markdown === 'string' ? 'markdown' : typeof from.content === 'string' || typeof from.text === 'string' ? 'text' : 'blocks';
  }

  /** The source as inline items, or null when it is block content. */
  private sourceInline(source: Json): Inline[] | null {
    const as = this.sourceAs(source);
    const content = this.sourceContent(source);
    if (as === 'text') return textToInline(String(content ?? ''), this.ids);
    if (as === 'inline') return inlineFromJson(content, this.ids);
    if (as === 'markdown') {
      return parseMarkdownInline(String(content ?? ''), this.ids, this.chips(source), this.options.markdown);
    }
    return null;
  }

  private sourceBlocks(source: Json): Block[] {
    const as = this.sourceAs(source);
    const content = this.sourceContent(source);
    if (as === 'markdown') return parseMarkdown(String(content ?? ''), this.ids, this.chips(source), this.options.markdown);
    if (as === 'text') {
      // Plain text as blocks: one paragraph per line.
      return String(content ?? '')
        .split('\n')
        .map(line => {
          const block = newBlock('paragraph', this.ids.take());
          block.inline = textToInline(line, this.ids);
          return block;
        });
    }
    if (as === 'inline') {
      const block = newBlock('paragraph', this.ids.take());
      block.inline = inlineFromJson(content, this.ids);
      return [block];
    }
    return blocksFromJson(content, this.ids);
  }

  private chips(source: Json): Chips {
    const own = isRecord(source.blocks) ? (source.blocks as Chips) : isRecord(source.from) && isRecord(source.from.blocks) ? (source.from.blocks as Chips) : {};
    return { ...(this.options.chips ?? {}), ...own };
  }

  // -- tree edits --

  private removeBlock(place: BlockPlace): void {
    place.siblings.splice(place.siblings.indexOf(place.block), 1);
    this.retired.push(...subtreeIds(place.block));
    this.prune(place.parent);
  }

  /** After a removal: drop containers left empty (a cell gets an empty paragraph instead). */
  private prune(parent: Block | null): void {
    let current = parent;
    while (current && current.children && current.children.length === 0) {
      if (current.type === 'cell') {
        current.children.push(newBlock('paragraph', this.ids.take()));
        return;
      }
      const place = findBlock(this.doc, current.id);
      if (!place) return;
      place.siblings.splice(place.index, 1);
      this.retired.push(current.id);
      this.pruned.add(current.id);
      current = place.parent;
    }
  }

  private insertInline(point: Point, items: Inline[]): void {
    if (!point.block.inline) throw new Refusal('bad_target', `${point.block.type} ${point.block.id} holds no text`);
    point.block.inline.splice(point.index, 0, ...items);
  }

  // -- ops --

  private insert(): boolean {
    const target = this.target();
    const side = String(this.op.side ?? (target.kind === 'root' ? 'end' : 'after'));
    const source = this.source();
    if (target.kind === 'chars' || target.kind === 'find') {
      const [from, to] = this.charRange(target);
      const point: Point = side === 'before' ? { block: from.block, index: from.index } : { block: to.block, index: to.index + 1 };
      const items = this.sourceInline(source);
      if (items) {
        this.insertInline(point, items);
        return items.length > 0;
      }
      // Blocks at a char: split the block there and put them between the halves.
      const blocks = this.sourceBlocks(source);
      this.insertBlocksAtPoint(point, blocks);
      return blocks.length > 0;
    }
    if (target.kind === 'root') {
      const blocks = this.sourceBlocks(source);
      if (side === 'start') this.doc.blocks.unshift(...blocks);
      else this.doc.blocks.push(...blocks);
      return blocks.length > 0;
    }
    const places = this.targetBlocks(target);
    const anchor = side === 'before' || side === 'start' ? places[0]! : places[places.length - 1]!;
    const as = this.sourceAs(source);
    if ((side === 'start' || side === 'end') && isText(anchor.block) && as !== 'blocks') {
      const items = this.sourceInline(source);
      if (items) {
        this.insertInline({ block: anchor.block, index: side === 'start' ? 0 : anchor.block.inline!.length }, items);
        return items.length > 0;
      }
    }
    const blocks = this.sourceBlocks(source);
    if (side === 'start' || side === 'end') {
      if (!isContainer(anchor.block)) {
        // start/end of a text or leaf block: before or after it.
        anchor.siblings.splice(anchor.index + (side === 'end' ? 1 : 0), 0, ...blocks);
      } else {
        const children = anchor.block.children!;
        const fitted = this.fitChildren(anchor.block, blocks);
        if (side === 'start') children.unshift(...fitted);
        else children.push(...fitted);
      }
    } else {
      const fitted = anchor.parent ? this.fitChildren(anchor.parent, blocks) : blocks;
      anchor.siblings.splice(anchor.index + (side === 'before' ? 0 : 1), 0, ...fitted);
    }
    return blocks.length > 0;
  }

  /** Blocks going into a list become list items; into a table row, cells; elsewhere as they are. */
  private fitChildren(parent: Block, blocks: Block[]): Block[] {
    if (parent.type === 'list') {
      let wrapped = false;
      const fitted = blocks.flatMap(block => {
        if (block.type === 'listItem') return [block];
        if (block.type === 'list') return block.children ?? [];
        const item = newBlock('listItem', this.ids.take(), parent.attrs?.kind === 'check' ? { checked: false } : undefined);
        item.children = [block];
        wrapped = true;
        return [item];
      });
      if (wrapped) this.inDocumentOrder(fitted);
      return fitted;
    }
    return blocks;
  }

  /**
   * Deals the ids this op minted in `blocks` again in document order. The page numbers what it adds that way, a list
   * item before the paragraph in it (Enter at the end of a suggested item inserts `[{type: 'paragraph'}]` after it with
   * two ids, then types into the second); a list item wrapped here took its id after its paragraph's.
   */
  private inDocumentOrder(blocks: Block[]): void {
    const order = new Map(this.ids.minted.map((id, index) => [id, index]));
    const nodes: { id: string }[] = [];
    const visit = (block: Block): void => {
      if (order.has(block.id)) nodes.push(block);
      for (const item of block.inline ?? []) if (order.has(item.id)) nodes.push(item);
      block.children?.forEach(visit);
    };
    blocks.forEach(visit);
    const ids = nodes.map(node => node.id).sort((a, b) => order.get(a)! - order.get(b)!);
    nodes.forEach((node, index) => (node.id = ids[index]!));
  }

  private insertBlocksAtPoint(point: Point, blocks: Block[]): void {
    const place = findBlock(this.doc, point.block.id)!;
    const inline = point.block.inline!;
    if (point.index === 0) {
      place.siblings.splice(place.index, 0, ...blocks);
      return;
    }
    if (point.index >= inline.length) {
      place.siblings.splice(place.index + 1, 0, ...blocks);
      return;
    }
    const tail = newBlock(point.block.type, this.ids.take(), point.block.attrs);
    tail.inline = inline.splice(point.index);
    place.siblings.splice(place.index + 1, 0, ...blocks, tail);
  }

  private remove(): boolean {
    const target = this.target();
    if (target.kind === 'chars' || target.kind === 'find') {
      const [from, to] = this.charRange(target);
      this.deleteChars(from, to);
      return true;
    }
    // The page deletes a container its own move just emptied; here that container is already gone.
    const ids = blockList(target);
    if (ids && ids.every(id => this.pruned.has(id) && !findBlock(this.doc, id))) return false;
    const places = this.targetBlocks(ids ? { kind: 'blocks', ids: ids.filter(id => !(this.pruned.has(id) && !findBlock(this.doc, id))) } : target);
    this.guard(places);
    for (const place of places) {
      const current = findBlock(this.doc, place.block.id);
      if (current) this.removeBlock(current);
    }
    return places.length > 0;
  }

  /** Deletes the chars from one end to the other, inclusive; across blocks, the last block's rest joins the first. */
  private deleteChars(from: CharPlace, to: CharPlace): void {
    if (from.block === to.block) {
      this.retired.push(...from.block.inline!.splice(from.index, to.index - from.index + 1).map(item => item.id));
      return;
    }
    const order = this.textBlocks();
    const first = order.indexOf(from.block);
    const last = order.indexOf(to.block);
    this.retired.push(...from.block.inline!.splice(from.index).map(item => item.id));
    for (const block of order.slice(first + 1, last)) {
      const place = findBlock(this.doc, block.id);
      if (place) this.removeBlock(place);
    }
    this.retired.push(...to.block.inline!.splice(0, to.index + 1).map(item => item.id));
    this.joinBlocks(from.block, to.block);
  }

  /** Moves b's inline items to the end of a and removes b; b's later siblings in its list item follow a. */
  private joinBlocks(a: Block, b: Block): void {
    const bPlace = findBlock(this.doc, b.id);
    if (!bPlace) return;
    if (a.inline && b.inline) a.inline.push(...b.inline.splice(0));
    const aParent = findBlock(this.doc, a.id)?.parent ?? null;
    if (bPlace.parent && bPlace.parent !== aParent && bPlace.parent.type === 'listItem' && aParent?.type === 'listItem') {
      const rest = bPlace.siblings.splice(bPlace.index + 1);
      aParent.children!.push(...rest);
    }
    const again = findBlock(this.doc, b.id)!;
    again.siblings.splice(again.index, 1);
    this.retired.push(b.id);
    this.prune(again.parent);
  }

  private replace(): boolean {
    const target = this.target();
    const source = this.source();
    if (target.kind === 'chars' || target.kind === 'find') {
      const [from, to] = this.charRange(target);
      const block = from.block;
      const index = from.index;
      const items = this.sourceInline(source);
      if (!items) throw new Refusal('bad_source', 'replacing chars takes text, inline content or one-paragraph markdown');
      this.deleteChars(from, to);
      this.insertInline({ block, index }, items);
      return true;
    }
    const places = this.targetBlocks(target);
    // Filling a pending block (the plan planted for a section) needs no guard; anything else does.
    const pending = places.every(place => place.block.type === 'pending');
    if (!pending) this.guard(places);
    else for (const place of places) this.notices.push({ code: 'pending_ended', id: place.block.id, intent: place.block.attrs?.intent ?? '' });
    const only = places.length === 1 ? places[0]!.block : null;
    if (only && isText(only) && this.sourceAs(source) === 'text') {
      // Re-wording one text block: same block, same kind and level, new words.
      const items = this.sourceInline(source)!;
      this.retired.push(...only.inline!.map(item => item.id));
      only.inline = items;
      return true;
    }
    const blocks = this.sourceBlocks(source);
    if (!blocks.length) throw new Refusal('empty_source', 'replace with nothing is refused; delete the block instead');
    const first = places[0]!;
    const fitted = first.parent ? this.fitChildren(first.parent, blocks) : blocks;
    first.siblings.splice(first.index, 0, ...fitted);
    for (const place of places) {
      const current = findBlock(this.doc, place.block.id);
      if (current) {
        current.siblings.splice(current.index, 1);
        this.retired.push(...subtreeIds(current.block));
        this.prune(current.parent);
      }
    }
    return true;
  }

  private split(): boolean {
    const target = this.target();
    const [at] = this.charRange(target);
    const block = at.block;
    const cut = this.op.side === 'before' ? at.index : at.index + 1;
    const ids = explicitIds(this.op);
    const place = findBlock(this.doc, block.id)!;
    const atEnd = cut >= block.inline!.length;
    const parentItem = place.parent?.type === 'listItem' ? place.parent : null;
    const makeItem = ids.length >= 2 && parentItem;
    let item: Block | null = null;
    if (makeItem) item = newBlock('listItem', this.ids.take(), this.splitItemAttrs(parentItem));
    let attrs: Record<string, unknown> | undefined = atEnd ? undefined : block.attrs;
    if (block.type === 'codeBlock') attrs = block.attrs;
    if (isRecord(this.op.tail)) attrs = Object.fromEntries(Object.entries({ ...(attrs ?? {}), ...this.op.tail }).filter(([, value]) => value !== null && value !== undefined));
    // A suggestion on a block is not an attribute: the page names it in the tail's attrs when the block it splits is one a
    // suggestion adds. The new half is that suggestion's too.
    const proposal = this.tailProposal(block, attrs);
    if (attrs && ('suggestId' in attrs || 'suggestOp' in attrs)) {
      const { suggestId: _id, suggestOp: _op, ...rest } = attrs;
      attrs = Object.keys(rest).length ? rest : undefined;
    }
    const type = block.type === 'codeBlock' && atEnd && !isRecord(this.op.tail) ? 'codeBlock' : block.type;
    const tail = newBlock(type, this.ids.take(), attrs);
    if (proposal) tail.suggest = proposal;
    tail.inline = block.inline!.splice(cut);
    if (item && parentItem) {
      const itemPlace = findBlock(this.doc, parentItem.id)!;
      item.children = [tail, ...place.siblings.splice(place.index + 1)];
      itemPlace.siblings.splice(itemPlace.index + 1, 0, item);
    } else {
      place.siblings.splice(place.index + 1, 0, tail);
    }
    return true;
  }

  /** The suggestion the new half of a split block belongs to: the block's own added one, or an open one the tail names. */
  private tailProposal(block: Block, attrs: Record<string, unknown> | undefined): Proposal | undefined {
    if (block.suggest?.op === 'ins') return { ...block.suggest };
    const id = attrs?.suggestId;
    if (id === undefined || id === null) return undefined;
    if (!isId(id) || attrs?.suggestOp !== 'ins' || !proposalIds(this.doc.blocks).includes(id))
      throw new Refusal('suggest_not_here', this.options.guards ? 'a suggestion is "suggest": true on the update payload, not an attribute' : 'a suggestion is "suggest": "<id>" on the op, not an attribute; nothing was changed');
    return { id, op: 'ins' };
  }

  private splitItemAttrs(item: Block): Record<string, unknown> | undefined {
    if (item.attrs?.checked !== undefined) return { checked: false };
    return undefined;
  }

  private join(): boolean {
    const places = this.targetBlocks(this.target());
    if (places.length !== 2) throw new Refusal('bad_target', 'join takes two blocks');
    const [a, b] = [places[0]!.block, places[1]!.block];
    if (!isText(a) || !isText(b)) {
      // Joining into a non-text block (a rule, an embed) removes that block.
      const leaf = !isText(a) ? a : b;
      const place = findBlock(this.doc, leaf.id)!;
      this.removeBlock(place);
      return true;
    }
    if (this.op.dir === 'backward' && a.inline!.length === 0 && b.inline!.length > 0 && a.attrs === undefined) {
      // An empty block before: it goes, the second keeps its id.
      const place = findBlock(this.doc, a.id)!;
      this.removeBlock(place);
      return true;
    }
    this.joinBlocks(a, b);
    return true;
  }

  private format(): boolean {
    const target = this.target();
    const [from, to] = this.charRange(target);
    const add = Array.isArray(this.op.add) ? this.op.add : [];
    const remove = Array.isArray(this.op.remove) ? this.op.remove : [];
    for (const spec of add) {
      const color = unknownTextColor(spec);
      if (color !== undefined) throw new Refusal('bad_op', `textColor takes "color": red, yellow, green, teal or purple (got ${JSON.stringify(color)}); remove [{"type": "textColor"}] takes it off`);
    }
    const order = from.block === to.block ? [from.block] : this.textBlocks().slice(this.textBlocks().indexOf(from.block), this.textBlocks().indexOf(to.block) + 1);
    let changed = false;
    order.forEach((block, position) => {
      const inline = block.inline!;
      const start = position === 0 ? from.index : 0;
      const end = position === order.length - 1 ? to.index : inline.length - 1;
      for (let index = start; index <= end; index++) {
        const item = inline[index]!;
        let marks = item.marks;
        for (const spec of remove) marks = applyMark(marks, spec, false);
        for (const spec of add) marks = applyMark(marks, spec, true);
        if (JSON.stringify(marks ?? null) !== JSON.stringify(item.marks ?? null)) changed = true;
        if (marks) item.marks = marks;
        else delete item.marks;
      }
    });
    return changed;
  }

  private set(): boolean {
    const target = this.target();
    const attrs = isRecord(this.op.attrs) ? this.op.attrs : isRecord(this.op.set) ? this.op.set : null;
    if (!attrs) throw new Refusal('bad_op', 'set needs attrs');
    if (target.kind === 'chars') {
      const [at] = this.charRange(target);
      if (!isAtom(at.item)) throw new Refusal('bad_target', 'set on a char works on chips (a date, a mention, a dropdown, an image)');
      const next = { ...(at.item.attrs ?? {}) };
      for (const [key, value] of Object.entries(attrs)) {
        // The page names the chip it means (`{type: 'mention', label}`, the node's name on every chip it edits): a
        // check, not an attribute. A name we do not know is passed over.
        if (key === 'type') {
          const named = atomTypeOf(value);
          if (named && named !== at.item.atom) throw new Refusal('bad_target', `set names a ${named}; that char is a ${at.item.atom}`);
          continue;
        }
        const stored = key === 'value' && at.item.atom === 'date' ? 'ts' : key === 'user' && at.item.atom === 'mention' ? 'principal' : key;
        if (value === null || value === undefined) delete next[stored];
        else next[stored] = value;
      }
      at.item.attrs = next;
      return true;
    }
    let changed = false;
    for (const place of this.targetBlocks(target)) changed = this.setBlock(place.block, attrs) || changed;
    return changed;
  }

  /** Attribute changes, each applied to the block it belongs to: kind → the list, checked → the item, background → the cell. */
  private setBlock(block: Block, attrs: Json): boolean {
    let changed = false;
    const owner = (type: string): Block | null => {
      if (block.type === type) return block;
      const chain = ancestors(this.doc, block.id);
      for (let index = chain.length - 1; index >= 0; index--) if (chain[index]!.type === type) return chain[index]!;
      return null;
    };
    const put = (target: Block, key: string, value: unknown) => {
      const next = { ...(target.attrs ?? {}) };
      if (value === null || value === undefined || (key === 'heading' && !value)) delete next[key];
      else next[key] = value;
      if (JSON.stringify(next) !== JSON.stringify(target.attrs ?? {})) changed = true;
      if (Object.keys(next).length) target.attrs = next;
      else delete target.attrs;
    };
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'suggestId' || key === 'suggestOp')
        throw new Refusal('suggest_not_here', this.options.guards ? 'a suggestion is "suggest": true on the update payload, not an attribute' : 'a suggestion is "suggest": "<id>" on the op, not an attribute; nothing was changed');
      if (key === 'type') {
        changed = this.retype(block, String(value), attrs) || changed;
        continue;
      }
      if (key === 'kind') {
        const list = owner('list');
        if (!list) throw new Refusal('bad_target', `${block.id} is not in a list`);
        put(list, 'kind', value);
        for (const item of list.children ?? []) {
          if (value === 'check' && item.attrs?.checked === undefined) put(item, 'checked', false);
          if (value !== 'check' && item.attrs?.checked !== undefined) put(item, 'checked', null);
        }
        continue;
      }
      if (key === 'checked') {
        const item = owner('listItem');
        if (!item) throw new Refusal('bad_target', `${block.id} is not a list item`);
        put(item, 'checked', value === null ? null : !!value);
        continue;
      }
      if (key === 'background' || key === 'header' || key === 'align' || key === 'colwidth' || key === 'colspan' || key === 'rowspan') {
        const cell = owner('cell');
        if (cell) {
          put(cell, key, value);
          continue;
        }
      }
      put(block, key, value);
    }
    return changed;
  }

  private retype(block: Block, type: string, attrs: Json): boolean {
    if (type === block.type || (type === 'heading' && block.type === 'paragraph')) {
      if (type === 'heading') this.setBlock(block, { heading: attrs.level ?? 1 });
      return false;
    }
    if ((type === 'paragraph' || type === 'codeBlock') && isText(block)) {
      block.type = type;
      if (type === 'codeBlock') {
        block.attrs = attrs.language ? { language: attrs.language } : undefined;
        if (!block.attrs) delete block.attrs;
        // Plain text only (the schema): marks go, a line break becomes a new line. A chip stays, and the call is refused.
        block.inline = block.inline!.map(item => (isAtom(item) && item.atom === 'hardBreak' ? { id: item.id, ch: '\n' } : item));
        for (const item of block.inline) if (!isAtom(item)) delete item.marks;
      } else delete block.attrs;
      return true;
    }
    if (type === 'cell' || type === 'tableHeader' || type === 'tableCell') {
      return this.setBlock(block, { header: type === 'tableHeader' });
    }
    throw new Refusal('bad_op', `cannot turn a ${block.type} into ${type}`);
  }

  private wrap(): boolean {
    const places = this.targetBlocks(this.target());
    const first = places[0]!;
    let members = places.map(place => place.block);
    if (isId(this.op.thru)) {
      const last = this.block(this.op.thru);
      if (last.siblings !== first.siblings) throw new Refusal('bad_target', 'wrap takes sibling blocks');
      members = first.siblings.slice(first.index, last.index + 1);
    }
    if (members.some(block => !first.siblings.includes(block))) throw new Refusal('bad_target', 'wrap takes sibling blocks');
    const into = this.op.in as Json;
    const name = String(into.type ?? '');
    const attrs = isRecord(into.attrs) ? { ...into, ...into.attrs } : into;
    const indexes = members.map(block => first.siblings.indexOf(block)).sort((x, y) => x - y);
    const at = indexes[0]!;
    const isList = ['list', 'bulletList', 'orderedList', 'taskList', 'ul', 'ol'].includes(name);
    if (isList && members.every(block => block.type === 'listItem')) {
      // Indenting list items: they go into a new list at the end of the item before them.
      const before = first.siblings[at - 1];
      if (!before || before.type !== 'listItem') throw new Refusal('shape_mismatch', 'a list item indents only under the item before it');
      const kind = String(attrs.kind ?? first.parent?.attrs?.kind ?? 'bullet');
      for (const index of [...indexes].reverse()) first.siblings.splice(index, 1);
      const list = newBlock('list', this.ids.take(), { kind });
      list.children = members;
      before.children!.push(list);
      return true;
    }
    for (const index of indexes.reverse()) first.siblings.splice(index, 1);
    let wrapper: Block;
    if (name === 'blockquote') {
      wrapper = newBlock('blockquote', this.ids.take());
      wrapper.children = members;
    } else if (['list', 'bulletList', 'orderedList', 'taskList', 'ul', 'ol'].includes(name)) {
      const kind = String(attrs.kind ?? (name === 'orderedList' || name === 'ol' ? 'ordered' : name === 'taskList' ? 'check' : 'bullet'));
      wrapper = newBlock('list', this.ids.take(), { kind, ...(attrs.start && attrs.start !== 1 ? { start: attrs.start } : {}) });
      wrapper.children = members.flatMap(block => {
        if (block.type === 'listItem') return [block];
        if (block.type === 'list') return block.children ?? [];
        const item = newBlock('listItem', this.ids.take(), kind === 'check' ? { checked: false } : undefined);
        item.children = [block];
        return [item];
      });
    } else if (name === 'listItem') {
      wrapper = newBlock('listItem', this.ids.take());
      wrapper.children = members;
    } else throw new Refusal('bad_op', `cannot wrap in ${name || 'nothing'}`);
    first.siblings.splice(at, 0, wrapper);
    return true;
  }

  private unwrap(): boolean {
    const [place] = this.targetBlocks(this.target());
    if (!place) return false;
    let block = place.block;
    // A text block in a list item: lift the item.
    if (!isContainer(block) && place.parent?.type === 'listItem') block = place.parent;
    const current = findBlock(this.doc, block.id)!;
    if (block.type === 'listItem' && current.parent?.type === 'list') {
      const list = current.parent;
      const listPlace = findBlock(this.doc, list.id)!;
      const after = list.children!.splice(current.index + 1);
      list.children!.splice(current.index, 1);
      this.retired.push(block.id);
      const lifted = block.children ?? [];
      const out: Block[] = [...lifted];
      if (after.length) {
        const rest = newBlock('list', this.ids.take(), list.attrs);
        rest.children = after;
        out.push(rest);
      }
      listPlace.siblings.splice(listPlace.index + 1, 0, ...out);
      if (list.children!.length === 0) {
        const again = findBlock(this.doc, list.id)!;
        again.siblings.splice(again.index, 1);
        this.retired.push(list.id);
      }
      return true;
    }
    if (!isContainer(block)) throw new Refusal('bad_target', `${block.id} is not inside anything to unwrap`);
    const children = block.type === 'list' ? (block.children ?? []).flatMap(item => item.children ?? []) : (block.children ?? []);
    current.siblings.splice(current.index, 1, ...children);
    this.retired.push(block.id);
    if (block.type === 'list') for (const item of block.children ?? []) this.retired.push(item.id);
    this.prune(current.parent);
    return true;
  }

  private move(): boolean {
    const places = this.targetBlocks(this.target());
    const to = isRecord(this.op.to) ? this.op.to : null;
    if (!to || !isRecord(to.target)) throw new Refusal('bad_op', 'move needs to: {target, side}');
    const side = String(to.side ?? 'after');
    const moving = places.map(place => place.block);
    const destination = to.target.kind === 'root' ? null : this.targetBlocks(to.target)[0]!;
    if (destination && moving.some(block => block === destination.block || subtreeIds(block).includes(destination.block.id)))
      throw new Refusal('bad_target', 'cannot move a block next to or into itself');
    for (const block of moving) {
      const place = findBlock(this.doc, block.id)!;
      place.siblings.splice(place.index, 1);
      this.prune(place.parent);
    }
    if (!destination) {
      if (side === 'start') this.doc.blocks.unshift(...moving);
      else this.doc.blocks.push(...moving);
      return true;
    }
    const anchor = findBlock(this.doc, destination.block.id)!;
    if (side === 'start' || side === 'end') {
      const parent = anchor.block;
      if (!parent.children) throw new Refusal('bad_target', `${parent.id} holds no blocks`);
      const fitted = this.fitChildren(parent, moving);
      if (side === 'start') parent.children.unshift(...fitted);
      else parent.children.push(...fitted);
    } else {
      const fitted = anchor.parent ? this.fitChildren(anchor.parent, moving) : moving;
      anchor.siblings.splice(anchor.index + (side === 'before' ? 0 : 1), 0, ...fitted);
    }
    return true;
  }

  // -- suggestions --

  private get mine(): string {
    return this.proposal!;
  }

  private pending(id: string, suggestId: string): Refusal {
    return new Refusal('others_pending', `${id} is part of suggestion ${suggestId}, still open; it has to be accepted or rejected first`, { id, suggestId });
  }

  private inSuggestion(id: string, suggestId: string): Refusal {
    return new Refusal('in_suggestion', `${id} is inside suggestion ${suggestId}, still open; write before or after it`, { id, suggestId });
  }

  /**
   * A suggestion: insert, delete and replace are proposed, not made. An agent's has ifRev on the payload as its only
   * guard; the page's (`page`) names the ids of what it adds, as every page write does.
   */
  private propose(page = false): boolean {
    if (this.op.ifHash !== undefined || this.op.force !== undefined || (!page && (this.op.id !== undefined || this.op.ids !== undefined)))
      throw new Refusal('bad_op', 'a suggestion takes no ifHash, force or ids; ifRev on the payload is its only guard');
    const ifRev = this.options.ifRev;
    if (ifRev !== undefined && Number(ifRev) !== this.doc.rev) throw new Refusal('guard_mismatch', `the tab is at rev ${this.doc.rev}, not ${ifRev}; read it again`, { rev: this.doc.rev });
    switch (this.op.op) {
      case 'insert':
        return this.proposeInsert();
      case 'delete':
        return this.proposeDelete();
      case 'replace':
        return this.proposeReplace();
      case 'set': {
        // Where its own added blocks are still open, a suggestion may set their attributes (a heading level, a list kind).
        const target = this.target();
        const own = target.kind !== 'chars' && this.targetBlocks(target).every(place => place.block.suggest?.id === this.mine && place.block.suggest.op === 'ins');
        if (own) return this.set();
        break;
      }
    }
    throw new Refusal('op_not_proposable', `${JSON.stringify(this.op.op)} cannot be suggested; a suggestion inserts, deletes or replaces (format, move, split and join are plain edits)`);
  }

  /** Marks every block and inline item this op made as the suggestion's addition. */
  private tagMinted(id = this.mine): void {
    const minted = new Set(this.ids.minted);
    const tag: Proposal = { id, op: 'ins' };
    for (const { block } of walk(this.doc.blocks)) {
      if (minted.has(block.id)) block.suggest = tag;
      for (const item of block.inline ?? []) if (minted.has(item.id)) item.suggest = tag;
    }
  }

  /** A block words may be added to or struck in: plain, or this suggestion's own addition. */
  private openHost(block: Block): void {
    if (block.suggest && !(block.suggest.id === this.mine && block.suggest.op === 'ins')) throw this.inSuggestion(block.id, block.suggest.id);
  }

  private proposeInsert(): boolean {
    const changed = this.insert();
    const minted = new Set(this.ids.minted);
    for (const { block, parent } of walk(this.doc.blocks)) {
      if (minted.has(block.id)) {
        if (block.inline?.some(item => !minted.has(item.id)))
          throw new Refusal('op_not_proposable', 'a suggestion does not split a block; suggest the blocks before or after it, or words inside it');
        if (parent && !minted.has(parent.id)) this.openHost(parent);
        continue;
      }
      const inline = block.inline ?? [];
      for (let index = 0; index < inline.length; index++) {
        if (!minted.has(inline[index]!.id)) continue;
        this.openHost(block);
        let end = index;
        while (end < inline.length && minted.has(inline[end]!.id)) end++;
        const before = inline[index - 1]?.suggest;
        const after = inline[end]?.suggest;
        if (before && after && before.id === after.id && before.id !== this.mine) throw this.inSuggestion(inline[index - 1]!.id, before.id);
        index = end;
      }
    }
    this.tagMinted();
    return changed;
  }

  /** Strikes chars in one block; this suggestion's own added words go outright. Returns where added words after them go. */
  private strikeChars(from: CharPlace, to: CharPlace): { changed: boolean; at: number } {
    if (from.block !== to.block) throw new Refusal('op_not_proposable', 'a suggested change to words stays inside one block; suggest whole blocks with a blocks target');
    const block = from.block;
    this.openHost(block);
    const inline = block.inline!;
    for (let index = from.index; index <= to.index; index++) {
      const item = inline[index]!;
      if (item.suggest && item.suggest.id !== this.mine) throw this.pending(item.id, item.suggest.id);
    }
    let changed = false;
    const out = inline.slice(0, from.index);
    for (let index = from.index; index <= to.index; index++) {
      const item = inline[index]!;
      if (item.suggest?.op === 'ins') {
        this.retired.push(item.id);
        changed = true;
        continue;
      }
      if (!item.suggest) {
        item.suggest = { id: this.mine, op: 'del' };
        changed = true;
      }
      out.push(item);
    }
    const at = out.length;
    out.push(...inline.slice(to.index + 1));
    block.inline = out;
    return { changed, at };
  }

  /** Strikes whole blocks; this suggestion's own added blocks go outright. Refused over anyone else's open suggestion. */
  private strikeBlocks(places: BlockPlace[]): boolean {
    for (const place of places)
      for (const { block } of walk([place.block])) {
        if (block.suggest && block.suggest.id !== this.mine) throw this.pending(block.id, block.suggest.id);
        for (const item of block.inline ?? []) if (item.suggest && item.suggest.id !== this.mine) throw this.pending(item.id, item.suggest.id);
      }
    let changed = false;
    for (const place of places) {
      const current = findBlock(this.doc, place.block.id);
      if (!current) continue;
      if (current.block.suggest?.op === 'ins') {
        this.removeBlock(current);
        changed = true;
      } else changed = this.strikeTree(current.block) || changed;
    }
    return changed;
  }

  private strikeTree(block: Block): boolean {
    let changed = false;
    const del: Proposal = { id: this.mine, op: 'del' };
    if (!block.suggest) {
      block.suggest = del;
      changed = true;
    }
    if (block.inline) {
      block.inline = block.inline.filter(item => {
        if (item.suggest?.op !== 'ins') return true;
        this.retired.push(item.id);
        changed = true;
        return false;
      });
      for (const item of block.inline)
        if (!item.suggest) {
          item.suggest = del;
          changed = true;
        }
    }
    if (block.children) {
      block.children = block.children.filter(child => {
        if (child.suggest?.op !== 'ins') return true;
        this.retired.push(...subtreeIds(child));
        changed = true;
        return false;
      });
      for (const child of block.children) changed = this.strikeTree(child) || changed;
    }
    return changed;
  }

  private proposeDelete(): boolean {
    const target = this.target();
    if (target.kind === 'chars' || target.kind === 'find') {
      const [from, to] = this.charRange(target);
      return this.strikeChars(from, to).changed;
    }
    if (target.kind === 'cell') throw new Refusal('op_not_proposable', 'a cell stays; suggest deleting the blocks in it');
    return this.strikeBlocks(this.targetBlocks(target));
  }

  private proposeReplace(): boolean {
    const target = this.target();
    const source = this.source();
    if (target.kind === 'chars' || target.kind === 'find') {
      const [from, to] = this.charRange(target);
      const items = this.sourceInline(source);
      if (!items) throw new Refusal('bad_source', 'replacing chars takes text, inline content or one-paragraph markdown');
      return this.replaceWords(from.block, from.index, to.index, items);
    }
    const places = this.targetBlocks(target);
    const only = places.length === 1 ? places[0]!.block : null;
    if (target.kind !== 'cell' && only && isText(only) && this.sourceAs(source) === 'text')
      // Re-wording one text block: the same block keeps its kind and level; its words are struck and the new ones added.
      return this.replaceWords(only, 0, only.inline!.length - 1, this.sourceInline(source)!);
    const blocks = this.sourceBlocks(source);
    if (!blocks.length) throw new Refusal('empty_source', 'replace with nothing is refused; suggest deleting the block instead');
    if (target.kind === 'cell') {
      const cell = places[0]!.block;
      const old = (cell.children ?? []).map(child => findBlock(this.doc, child.id)!);
      cell.children!.push(...blocks);
      this.tagMinted();
      this.strikeBlocks(old);
      return true;
    }
    // The new blocks go after the last one replaced, then the replaced ones are struck.
    const last = places[places.length - 1]!;
    const fitted = last.parent ? this.fitChildren(last.parent, blocks) : blocks;
    last.siblings.splice(last.index + 1, 0, ...fitted);
    this.tagMinted();
    this.strikeBlocks(places);
    return true;
  }

  /** Strikes items from..to (inclusive; to < from for an empty block) and adds the new items after them. */
  private replaceWords(block: Block, from: number, to: number, items: Inline[]): boolean {
    const words = (list: Inline[]) => JSON.stringify(list.map(({ id: _id, suggest: _suggest, ...rest }) => rest));
    if (words(block.inline!.slice(from, to + 1)) === words(items)) {
      this.notices.push({ code: 'no_op', id: block.id, message: 'the new words are the words already there; nothing was suggested' });
      return false;
    }
    let at = from;
    if (to >= from) at = this.strikeChars({ block, index: from, item: block.inline![from]! }, { block, index: to, item: block.inline![to]! }).at;
    else this.openHost(block);
    for (const item of items) item.suggest = { id: this.mine, op: 'ins' };
    block.inline!.splice(at, 0, ...items);
    return true;
  }

  /**
   * Takes a suggestion: accept keeps its additions and drops what it struck; reject (or withdraw, by whoever made it) does
   * the opposite. Either way its parts become plain. An agent only withdraws its own, and names the suggestion as it read it.
   */
  private decide(): boolean {
    const id = this.op.suggestId;
    if (!isId(id) || !SUGGEST_ID.test(id)) throw new Refusal('bad_op', 'decide needs suggestId');
    const verdict = String(this.op.verdict ?? '');
    if (verdict !== 'accept' && verdict !== 'reject' && verdict !== 'withdraw') throw new Refusal('bad_op', 'decide takes verdict: accept, reject or withdraw');
    if (!proposalParts(this.doc.blocks, id).length) {
      this.notices.push({ code: 'nothing_open', suggestId: id });
      return false;
    }
    if (this.options.guards) {
      if (verdict !== 'withdraw' || this.doc.suggestions?.[id]?.via !== 'agent')
        throw new Refusal('decide_needs_a_person', `accepting or rejecting ${id} is the person's call; an agent withdraws only its own suggestion`, { suggestId: id });
      const asOf = suggestionAsOf(this.doc.blocks, id);
      if (this.op.asOf !== asOf) throw new Refusal('suggestion_changed', `${id} is not as it was read (or asOf is missing); read it again`, { suggestId: id, asOf });
    }
    const goes = verdict === 'accept' ? 'del' : 'ins';
    const taken = beforeDecide(this.doc.blocks, id, this.doc.suggestions);
    const emptied: Block[] = [];
    const settle = (blocks: Block[], parent: Block | null) => {
      for (let index = blocks.length - 1; index >= 0; index--) {
        const block = blocks[index]!;
        if (block.suggest?.id === id && block.suggest.op === goes) {
          blocks.splice(index, 1);
          this.retired.push(...subtreeIds(block));
          if (parent) emptied.push(parent);
          continue;
        }
        if (block.suggest?.id === id) delete block.suggest;
        if (block.inline) {
          block.inline = block.inline.filter(item => {
            if (item.suggest?.id !== id) return true;
            if (item.suggest.op === goes) {
              this.retired.push(item.id);
              return false;
            }
            delete item.suggest;
            return true;
          });
        }
        if (block.children) settle(block.children, block);
      }
    };
    settle(this.doc.blocks, null);
    for (const parent of emptied) if (findBlock(this.doc, parent.id)) this.prune(parent);
    if (this.doc.blocks.length === 0) this.doc.blocks.push({ ...newBlock('paragraph', this.ids.take()), inline: [] });
    this.decided = { suggestId: id, verdict };
    this.decisions.push(afterDecide(this.doc.blocks, id, verdict, taken));
    return true;
  }

  /**
   * The page's undo of a decision it made (`{op: 'undecide', suggestId, opId}`): the blocks the decide changed go back
   * as they were, where nothing was written since, and the suggestion is open again with who made it. The answer is
   * `undecided`: `restored` (with `kept` for blocks written since) or `not_restored` with why (`already_open`,
   * `all_written_since`, `journal_out_of_reach`). An agent takes back nothing: deciding is the person's.
   */
  private undecide(): boolean {
    const id = this.op.suggestId;
    if (!isId(id) || !SUGGEST_ID.test(id)) throw new Refusal('bad_op', 'undecide needs suggestId');
    if (this.options.guards) throw new Refusal('decide_needs_a_person', `taking back a decision on ${id} is the person's call`, { suggestId: id });
    const opId = isId(this.op.opId) ? this.op.opId : '';
    const decision = this.options.decisions?.(id);
    const notRestored = (why: string): false => {
      this.undecided = { suggestId: id, opId, ...(decision ? { verdict: decision.verdict } : {}), outcome: 'not_restored', why };
      return false;
    };
    if (proposalParts(this.doc.blocks, id).length) return notRestored('already_open');
    if (!decision || (opId && decision.opId && decision.opId !== opId)) return notRestored('journal_out_of_reach');
    const open = new Set(proposalIds(this.doc.blocks));
    const { restored, kept, removed } = undoDecision(this.doc.blocks, decision);
    if (!restored.length) return notRestored('all_written_since');
    const reopened = proposalIds(this.doc.blocks).filter(suggestId => !open.has(suggestId));
    const records = { ...(this.doc.suggestions ?? {}) };
    for (const suggestId of reopened) if (decision.infos[suggestId] && !records[suggestId]) records[suggestId] = structuredClone(decision.infos[suggestId]!);
    this.doc.suggestions = records;
    this.undecided = {
      suggestId: id,
      opId: decision.opId ?? opId,
      verdict: decision.verdict,
      outcome: 'restored',
      restored,
      ...(kept.length ? { kept } : {}),
      ...(removed.length ? { removed } : {}),
      reread: 'whole',
      reopened,
    };
    return true;
  }

  /** Refuses an agent's plain edit that changed an open suggestion's parts or wrote inside one. */
  private leftAlone(before: Map<string, ProposalPart[]>): void {
    const after = proposalSnapshot(this.doc.blocks);
    for (const [suggestId, parts] of before) {
      const now = after.get(suggestId) ?? [];
      const index = parts.findIndex((part, at) => part.sig !== now[at]?.sig);
      if (index < 0 && now.length === parts.length) continue;
      const part = parts[index < 0 ? parts.length - 1 : index]!;
      throw part.block ? this.pending(part.id, suggestId) : this.inSuggestion(part.id, suggestId);
    }
    const minted = new Set(this.ids.minted);
    for (const { block, parent } of walk(this.doc.blocks)) {
      if (minted.has(block.id) && parent?.suggest && !minted.has(parent.id)) throw this.inSuggestion(parent.id, parent.suggest.id);
      const inline = block.inline ?? [];
      for (let index = 0; index < inline.length; index++) {
        if (!minted.has(inline[index]!.id)) continue;
        if (block.suggest && !minted.has(block.id)) throw this.inSuggestion(block.id, block.suggest.id);
        let end = index;
        while (end < inline.length && minted.has(inline[end]!.id)) end++;
        const prior = inline[index - 1]?.suggest;
        const next = inline[end]?.suggest;
        if (prior && next && prior.id === next.id) throw this.inSuggestion(inline[index - 1]!.id, prior.id);
        index = end;
      }
    }
  }
}
