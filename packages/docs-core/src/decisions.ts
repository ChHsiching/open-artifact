/**
 * Taking back a person's decision on a suggestion: the page's undo (⌘Z) after ✓ or ✕ on a card.
 *
 * With the door's `suggestUndecide` cap the page undoes a decision by asking the door, `{op: 'undecide', suggestId,
 * opId, sinceRev}` (`opId` names the decide's call), and draws what the door answers; it restores nothing itself. So a
 * decide records each top-level block that held a part of the suggestion, as it stood before and as the decide left
 * it, and an undecide puts back each one that still stands as the decide left it. A block written since (by anyone)
 * stays as it is, and the answer says so (`kept`, `written_since`); the page reads that as "reopened in part".
 *
 * The record lives with the server, not with the doc: it never reaches the file, exports, the view, hashes or the
 * history, and a server that restarts has none (the answer is `not_restored`, `journal_out_of_reach`).
 */
import { type Block, proposalIds, proposalParts, type SuggestionInfo } from './model.ts';

/** One top-level block a decide touched: before it (null for one the decide added) and its signature after (null: taken out). */
export interface DecisionTop {
  id: string;
  before: Block | null;
  after: string | null;
}

export interface Decision {
  suggestId: string;
  verdict: string;
  /** The decide call's opId, which the page's undecide names. */
  opId?: string;
  /** The suggestion records (who made each) of every suggestion open in those blocks before the decide. */
  infos: Record<string, SuggestionInfo>;
  /** The tab's top-level block ids before the decide, in order: where a block it took out goes back. */
  order: string[];
  tops: DecisionTop[];
}

/** How the undo answers the page: the `undecided` it reads off the door's answer. */
export type Undecided = Record<string, unknown> & { suggestId: string; outcome: 'restored' | 'not_restored' };

export const blockSig = (block: Block | null | undefined): string | null => (block ? JSON.stringify(block) : null);

/** The blocks a decide will touch, as they stand: call before it changes anything. */
export function beforeDecide(blocks: Block[], suggestId: string, suggestions: Record<string, SuggestionInfo> | undefined) {
  const holding = blocks.filter(top => proposalParts([top], suggestId).length > 0);
  const infos: Record<string, SuggestionInfo> = {};
  for (const id of proposalIds(holding)) if (suggestions?.[id]) infos[id] = structuredClone(suggestions[id]!);
  return { order: blocks.map(top => top.id), holding: holding.map(top => structuredClone(top)), infos };
}

/** The decision's record, once the decide has changed the blocks. */
export function afterDecide(blocks: Block[], suggestId: string, verdict: string, taken: ReturnType<typeof beforeDecide>): Decision {
  const byId = new Map(blocks.map(top => [top.id, top]));
  const tops: DecisionTop[] = taken.holding.map(before => ({ id: before.id, before, after: blockSig(byId.get(before.id)) }));
  const was = new Set(taken.order);
  // The decide adds a top-level block only when it emptied the tab: the empty paragraph a tab always keeps.
  for (const top of blocks) if (!was.has(top.id)) tops.push({ id: top.id, before: null, after: blockSig(top) });
  return { suggestId, verdict, infos: taken.infos, order: taken.order, tops };
}

/** Where a block the decide took out goes back: after the nearest block that stood before it and stands now. */
function placeOf(blocks: Block[], order: string[], id: string): number {
  const at = order.indexOf(id);
  for (let index = at - 1; index >= 0; index--) {
    const found = blocks.findIndex(top => top.id === order[index]);
    if (found >= 0) return found + 1;
  }
  for (let index = at + 1; index < order.length; index++) {
    const found = blocks.findIndex(top => top.id === order[index]);
    if (found >= 0) return found;
  }
  return Math.min(Math.max(at, 0), blocks.length);
}

/**
 * Puts back what the decide changed, in place, where nothing was written since. Answers which top-level blocks came
 * back (`restored`), which stayed because they changed since (`kept`) and which the decide had added and are gone
 * again (`removed`); nothing changes when no block can come back.
 */
export function undoDecision(blocks: Block[], decision: Decision) {
  const now = new Map(blocks.map(top => [top.id, top]));
  const back: DecisionTop[] = [];
  const kept: Array<{ blockId: string; why: string }> = [];
  for (const top of decision.tops) {
    if (blockSig(now.get(top.id)) === top.after) back.push(top);
    else kept.push({ blockId: top.id, why: 'written_since' });
  }
  const restored = back.filter(top => top.before !== null).map(top => top.id);
  if (!restored.length) return { restored, kept, removed: [] as string[] };
  for (const top of back) {
    if (!top.before) continue;
    const block = structuredClone(top.before);
    const index = blocks.findIndex(found => found.id === top.id);
    if (index >= 0) blocks[index] = block;
    else blocks.splice(placeOf(blocks, decision.order, top.id), 0, block);
  }
  const removed: string[] = [];
  for (const top of back) {
    if (top.before) continue;
    const index = blocks.findIndex(found => found.id === top.id);
    if (index >= 0 && blocks.length > 1) {
      blocks.splice(index, 1);
      removed.push(top.id);
    }
  }
  return { restored, kept, removed };
}

/** A tab's decisions the page may still take back, newest last; as many as the page keeps on its own undo list. */
export class DecisionJournal {
  private tabs = new Map<string, Map<string, Decision>>();
  static readonly LIMIT = 64;

  get(tabId: string, suggestId: string): Decision | undefined {
    return this.tabs.get(tabId)?.get(suggestId);
  }

  put(tabId: string, decision: Decision): void {
    let tab = this.tabs.get(tabId);
    if (!tab) this.tabs.set(tabId, (tab = new Map()));
    tab.delete(decision.suggestId);
    tab.set(decision.suggestId, decision);
    if (tab.size > DecisionJournal.LIMIT) tab.delete(tab.keys().next().value!);
  }

  drop(tabId: string, suggestId: string): void {
    this.tabs.get(tabId)?.delete(suggestId);
  }
}
