/**
 * Where a comment the agent starts on a doc hangs, from what the agent can say: a tab, and the words it is about as
 * they stand there (3–6 of them, exactly), a suggestion's id, or nothing (a note on the tab as a whole). The answer is
 * a thread's `anchor`, `label`, `detail` and `location` in the shape the page writes for one a person starts, so the
 * page marks those words and lists the thread with the others.
 */
import { type Block, type DocState, committed, isAtom, isText, walk } from '@open-artifact/docs-core';
import { DocStore, StoreError, docDirOf } from './store.ts';

type Json = Record<string, unknown>;

/** Why a comment's place can't be found; `data` says what would find it. */
export class CommentTargetError extends Error {
  readonly code: string;
  readonly data: Json;
  constructor(code: string, message: string, data: Json = {}) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

export interface CommentTargetInput {
  /** The tab: its id, its body's id or its name (the first tab when left out). */
  tab?: string | undefined;
  /** The words, exactly as the tab has them. */
  on?: string | undefined;
  /** Which of the places those words stand (1 = the first), when they stand in more than one. */
  nth?: number | undefined;
  /** The block (or a table, list or cell holding it) the words are in, when they stand in more than one place. */
  block?: string | undefined;
  /** A suggestion's id (`sg_…`): the comment is on its words. */
  suggestion?: string | undefined;
}

export interface CommentTarget {
  tab: string;
  anchor: string;
  label: string;
  detail: string;
  location: Json;
}

/** Longest quote a thread's label keeps (as the page's). */
const LABEL_MAX = 80;
/** Longest context the agent reads with a thread (as the page's). */
const DETAIL_MAX = 1200;
/** The most characters a thread hangs on (as the page's selection). */
const WORDS_MAX = 4096;
/** How many places an ambiguous answer lists. */
const PLACES_SHOWN = 10;
/** What a whole-tab note is labelled, as the page's comments list heads them. */
export const WHOLE_TAB_LABEL = 'Whole document';

const OBJECT = '￼';

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

function quoteLabel(words: string): string {
  const line = oneLine(words);
  return line.length > LABEL_MAX ? `${line.slice(0, LABEL_MAX - 1).trimEnd()}…` : line;
}

function quoteDetail(words: string, around: string): string {
  const quote = words.trim().slice(0, DETAIL_MAX);
  const context = around.trim();
  if (!context || context === quote) return `On “${quote}”`;
  return `On “${quote}” in: ${context.slice(0, DETAIL_MAX)}`;
}

const charsOf = (block: Block): string[] => (block.inline ?? []).map(item => (isAtom(item) ? OBJECT : item.ch));

interface Hit {
  block: Block;
  from: number;
  to: number;
}

/** The ids of a block and every block holding it, innermost first. */
function holders(doc: DocState): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const place of walk(doc.blocks)) out.set(place.block.id, [place.block.id, ...(place.parent ? (out.get(place.parent.id) ?? [place.parent.id]) : [])]);
  return out;
}

/** Every place the words stand in the tab as it reads now: exactly first, then ignoring case and runs of spaces. */
function findWords(doc: DocState, words: string): Hit[] {
  const blocks = [...walk(doc.blocks)].map(place => place.block).filter(isText);
  const scan = (fold: (ch: string) => string, wanted: string[]): Hit[] => {
    const hits: Hit[] = [];
    if (!wanted.length) return hits;
    for (const block of blocks) {
      const chars = charsOf(block);
      // Each char of the block, folded, with where it came from: a run of spaces folds to one.
      const folded: string[] = [];
      const from: number[] = [];
      for (let index = 0; index < chars.length; index++) {
        const ch = fold(chars[index]!);
        if (ch === ' ' && folded.at(-1) === ' ' && fold !== exact) continue;
        folded.push(ch);
        from.push(index);
      }
      for (let at = 0; at + wanted.length <= folded.length; at++) {
        if (!wanted.every((ch, offset) => folded[at + offset] === ch)) continue;
        const end = at + wanted.length - 1;
        // The last folded char is the run's first space: the hit ends on it.
        hits.push({ block, from: from[at]!, to: from[end]! });
        at = end;
      }
    }
    return hits;
  };
  const exactHits = scan(exact, Array.from(words));
  if (exactHits.length) return exactHits;
  const loose = (ch: string) => (/\s/.test(ch) ? ' ' : ch.toLowerCase());
  return scan(loose, Array.from(oneLine(words)).map(loose));
}
const exact = (ch: string) => ch;

/** The words of a hit, and the block's text around them. */
const hitWords = (hit: Hit) => charsOf(hit.block).slice(hit.from, hit.to + 1).join('');
const blockText = (block: Block) => charsOf(block).join('').replaceAll(OBJECT, '').trim();

/** Where a comment the agent starts on the doc in `artifactRoot` hangs. */
export function docCommentTarget(artifactRoot: string, input: CommentTargetInput): CommentTarget {
  let store: DocStore;
  let tab: string;
  let doc: DocState;
  try {
    store = DocStore.open(docDirOf(artifactRoot));
    tab = store.findTab(input.tab);
    doc = store.doc(tab);
  } catch (error) {
    if (error instanceof StoreError) throw new CommentTargetError(error.code === 'NO_TAB' || error.code === 'TAB_AMBIGUOUS' ? 'bad_tab' : 'not_a_doc', error.message);
    throw error;
  }
  const tabName = store.tab(tab).name;

  if (input.suggestion !== undefined) return suggestionTarget(doc, tab, input.suggestion);

  if (input.on === undefined) {
    if (input.nth !== undefined || input.block !== undefined) throw new CommentTargetError('bad_target', '--nth and --block pick among the places of --on words; give the words too');
    return { tab, anchor: JSON.stringify({ tab }), label: WHOLE_TAB_LABEL, detail: `On the tab “${tabName}” as a whole`, location: { tab } };
  }

  const words = input.on;
  if (!words.trim()) throw new CommentTargetError('bad_target', '--on takes the words the comment is about, exactly as the tab has them');
  if (words.length > WORDS_MAX) throw new CommentTargetError('bad_target', `--on is at most ${WORDS_MAX} characters; 3–6 words are enough`);
  const reading = committed(doc);
  let hits = findWords(reading, words);
  if (!hits.length) throw new CommentTargetError('not_found', `“${quoteLabel(words)}” is not in the tab “${tabName}” as it reads now; read it and copy the words as they stand`, { tab });
  if (input.block !== undefined) {
    const held = holders(reading);
    hits = hits.filter(hit => held.get(hit.block.id)?.includes(input.block!));
    if (!hits.length) throw new CommentTargetError('not_found', `“${quoteLabel(words)}” is not in block ${input.block}`, { tab, block: input.block });
  }
  if (input.nth !== undefined) {
    if (!Number.isInteger(input.nth) || input.nth < 1) throw new CommentTargetError('bad_target', '--nth is 1, 2, 3, …');
    if (input.nth > hits.length) throw new CommentTargetError('not_found', `“${quoteLabel(words)}” stands in ${hits.length} place(s), not ${input.nth}`, { tab, places: hits.length });
    hits = [hits[input.nth - 1]!];
  }
  if (hits.length > 1)
    throw new CommentTargetError(
      'ambiguous',
      `“${quoteLabel(words)}” stands in ${hits.length} places; give more words, --nth <n> or --block <id>`,
      { tab, places: hits.slice(0, PLACES_SHOWN).map((hit, index) => ({ nth: index + 1, block: hit.block.id, in: quoteLabel(blockText(hit.block)) })) },
    );
  const hit = hits[0]!;
  const inline = hit.block.inline!;
  const found = hitWords(hit);
  return {
    tab,
    anchor: JSON.stringify({ tab, range: [inline[hit.from]!.id, inline[hit.to]!.id] }),
    label: quoteLabel(found),
    detail: quoteDetail(found, blockText(hit.block)),
    location: { tab, block: hit.block.id },
  };
}

/** A comment on a suggestion: on its words (those it would add or take out), or its first block when it has none. */
function suggestionTarget(doc: DocState, tab: string, id: string): CommentTarget {
  const parts: Array<{ block: Block; index: number }> = [];
  const lines: string[] = [];
  const ops = new Set<string>();
  let firstBlock: Block | null = null;
  for (const { block } of walk(doc.blocks)) {
    if (block.suggest?.id === id) {
      firstBlock ??= block;
      ops.add(block.suggest.op);
    }
    let line = '';
    (block.inline ?? []).forEach((item, index) => {
      if (item.suggest?.id !== id) return;
      parts.push({ block, index });
      ops.add(item.suggest.op);
      if (!isAtom(item)) line += item.ch;
    });
    if (line) lines.push(line);
  }
  if (!parts.length && !firstBlock) throw new CommentTargetError('not_found', `no open suggestion ${id} in this tab; read the tab with --suggestions for the open ones`, { tab });
  const kind = ops.size > 1 ? 'change' : ops.has('del') ? 'take out' : 'add';
  if (parts.length) {
    const a = parts[0]!;
    const b = parts.at(-1)!;
    const text = lines.join('\n').trim() || 'A suggestion';
    return {
      tab,
      anchor: JSON.stringify({ tab, range: [a.block.inline![a.index]!.id, b.block.inline![b.index]!.id] }),
      label: quoteLabel(text),
      detail: `On a suggestion to ${kind} “${text.slice(0, DETAIL_MAX)}”`,
      location: { tab, block: a.block.id, suggestion: id },
    };
  }
  const block = firstBlock!;
  return { tab, anchor: JSON.stringify({ tab, block: block.id }), label: 'A suggested block', detail: `On a suggestion to ${kind} a block`, location: { tab, block: block.id, suggestion: id } };
}
