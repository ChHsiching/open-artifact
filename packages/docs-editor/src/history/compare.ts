/**
 * What changed between two versions of a tab, as one doc: the newer version with what it added marked `ins` and what
 * it dropped put back in place, marked `del`. The marks ride on `suggest` (id {@link CHANGE_ID}); the preview turns
 * them into its own highlighting, so nothing here is a real suggestion.
 *
 * Blocks are matched by id (versions and restores keep them). A text block's words are compared by their content,
 * since a block written whole gets new character ids. Blocks between matched ones that were replaced are paired up
 * when both hold text and share most of it, so a reworded paragraph reads as its changed words, not as a deleted and an
 * added one.
 */
import { type Block, type DocState, type Inline, isAtom, isText } from '@open-artifact/docs-core';

export const CHANGE_ID = 'version-change';

export type ChangeOp = 'ins' | 'del';

/** Character comparisons larger than this are shown as the whole text replaced. */
const MAX_CELLS = 400_000;

export function compareVersions(before: DocState, after: DocState): DocState {
  return { rev: after.rev, blocks: mergeBlocks(before.blocks, after.blocks) };
}

/** True when the compared doc shows any change. */
export function hasChanges(doc: DocState): boolean {
  const changed = (block: Block): boolean =>
    block.suggest?.id === CHANGE_ID || !!block.inline?.some(item => item.suggest?.id === CHANGE_ID) || !!block.children?.some(changed);
  return doc.blocks.some(changed);
}

function mergeBlocks(before: readonly Block[], after: readonly Block[]): Block[] {
  const out: Block[] = [];
  const anchors = commonById(before, after);
  let i = 0;
  let j = 0;
  for (const [oi, nj] of [...anchors, [before.length, after.length] as const]) {
    out.push(...mergeRun(before.slice(i, oi), after.slice(j, nj)));
    if (oi < before.length && nj < after.length) out.push(...matchBlock(before[oi]!, after[nj]!));
    i = oi + 1;
    j = nj + 1;
  }
  return out;
}

/** Blocks replaced between two matched ones: paired by position when both hold text, the rest dropped or added. */
function mergeRun(gone: readonly Block[], added: readonly Block[]): Block[] {
  const out: Block[] = [];
  for (let k = 0; k < Math.max(gone.length, added.length); k++) {
    const old = gone[k];
    const fresh = added[k];
    const merged = old && fresh && isText(old) && isText(fresh) ? mergeText(old, fresh, true) : null;
    if (merged) {
      out.push(merged);
      continue;
    }
    if (old) out.push(marked(old, 'del'));
    if (fresh) out.push(marked(fresh, 'ins'));
  }
  return out;
}

function matchBlock(old: Block, fresh: Block): Block[] {
  if (isText(old) && isText(fresh)) return [mergeText(old, fresh, false)!];
  if (old.children && fresh.children && old.type === fresh.type) return [{ ...fresh, children: mergeBlocks(old.children, fresh.children) }];
  if (!old.children && !fresh.children && !old.inline && !fresh.inline && old.type === fresh.type && JSON.stringify(old.attrs ?? {}) === JSON.stringify(fresh.attrs ?? {}))
    return [fresh];
  return [marked(old, 'del'), marked(fresh, 'ins')];
}

const itemKey = (item: Inline) => (isAtom(item) ? `a${item.atom}${JSON.stringify(item.attrs ?? {})}` : `c${item.ch}`);

/** A text block's words compared; `null` when `similar` is asked for and the two share less than half their words. */
function mergeText(old: Block, fresh: Block, similar: boolean): Block | null {
  const a = old.inline ?? [];
  const b = fresh.inline ?? [];
  const steps = diffSequences(a.map(itemKey), b.map(itemKey));
  if (similar && steps.filter(step => step.op === 'same').length * 2 < Math.max(a.length, b.length)) return null;
  const items: Inline[] = [];
  for (const step of steps) {
    if (step.op === 'same') items.push(b[step.b]!);
    else if (step.op === 'del') items.push(change(a[step.a]!, 'del'));
    else items.push(change(b[step.b]!, 'ins'));
  }
  return { ...fresh, inline: items };
}

const change = <T extends Inline>(item: T, op: ChangeOp): T => ({ ...item, suggest: { id: CHANGE_ID, op } });

/** A block and everything in it marked as added or dropped. */
function marked(block: Block, op: ChangeOp): Block {
  return {
    ...block,
    suggest: { id: CHANGE_ID, op },
    ...(block.inline ? { inline: block.inline.map(item => change(item, op)) } : {}),
    ...(block.children ? { children: block.children.map(child => marked(child, op)) } : {}),
  };
}

/** Index pairs of the blocks both lists hold (by id), in order: the longest such run. */
function commonById(before: readonly Block[], after: readonly Block[]): Array<readonly [number, number]> {
  const at = new Map<string, number>();
  before.forEach((block, index) => {
    if (!at.has(block.id)) at.set(block.id, index);
  });
  const pairs: Array<readonly [number, number]> = [];
  const seen = new Set<string>();
  after.forEach((block, index) => {
    const old = at.get(block.id);
    if (old !== undefined && !seen.has(block.id)) {
      seen.add(block.id);
      pairs.push([old, index]);
    }
  });
  return longestIncreasing(pairs);
}

/** The longest run of pairs whose first indexes increase (their second ones already do). */
function longestIncreasing(pairs: ReadonlyArray<readonly [number, number]>): Array<readonly [number, number]> {
  const tails: number[] = [];
  const back: number[] = new Array<number>(pairs.length).fill(-1);
  pairs.forEach(([value], index) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]!]![0] < value) lo = mid + 1;
      else hi = mid;
    }
    back[index] = lo > 0 ? tails[lo - 1]! : -1;
    tails[lo] = index;
  });
  const out: Array<readonly [number, number]> = [];
  for (let index = tails.length ? tails[tails.length - 1]! : -1; index >= 0; index = back[index]!) out.push(pairs[index]!);
  return out.reverse();
}

export type DiffStep = { op: 'same'; a: number; b: number } | { op: 'del'; a: number } | { op: 'ins'; b: number };

/** The steps from `a` to `b` keeping their longest common subsequence; deletions come before insertions at a change. */
export function diffSequences(a: readonly string[], b: readonly string[]): DiffStep[] {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const steps: DiffStep[] = [];
  for (let k = 0; k < head; k++) steps.push({ op: 'same', a: k, b: k });
  const midA = a.length - head - tail;
  const midB = b.length - head - tail;
  if (midA * midB > MAX_CELLS) {
    for (let k = 0; k < midA; k++) steps.push({ op: 'del', a: head + k });
    for (let k = 0; k < midB; k++) steps.push({ op: 'ins', b: head + k });
  } else {
    // lengths[x][y]: the common subsequence of a[head + x…] and b[head + y…].
    const width = midB + 1;
    const lengths = new Uint32Array((midA + 1) * width);
    for (let x = midA - 1; x >= 0; x--)
      for (let y = midB - 1; y >= 0; y--)
        lengths[x * width + y] = a[head + x] === b[head + y] ? lengths[(x + 1) * width + y + 1]! + 1 : Math.max(lengths[(x + 1) * width + y]!, lengths[x * width + y + 1]!);
    let x = 0;
    let y = 0;
    const pendingIns: DiffStep[] = [];
    const flush = () => steps.push(...pendingIns.splice(0));
    while (x < midA || y < midB) {
      if (x < midA && y < midB && a[head + x] === b[head + y]) {
        flush();
        steps.push({ op: 'same', a: head + x++, b: head + y++ });
      } else if (y < midB && (x === midA || lengths[x * width + y + 1]! >= lengths[(x + 1) * width + y]!)) {
        pendingIns.push({ op: 'ins', b: head + y++ });
      } else {
        steps.push({ op: 'del', a: head + x++ });
      }
    }
    flush();
  }
  for (let k = 0; k < tail; k++) steps.push({ op: 'same', a: a.length - tail + k, b: b.length - tail + k });
  return steps;
}
