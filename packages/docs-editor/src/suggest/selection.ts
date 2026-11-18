/** The selection Edit with Agent takes: whether it can, and where its words are in the tab as the page holds it. */
import { type Block, type DocState, isAtom, walk } from '@open-artifact/docs-core';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '../editor/schema.ts';
import { touchesSuggestion } from './positions.ts';
import type { RewriteTarget } from './store.ts';

/** Why the selection can't be edited with Agent; null when it can. */
export function refusalOf(doc: PMNode, from: number, to: number): string | null {
  if (touchesSuggestion(doc, from, to)) return 'Agent can’t edit this text. Select other text to edit with Agent.';
  let plain = true;
  let text = '';
  doc.nodesBetween(from, to, (node, pos, parent) => {
    if (!plain) return false;
    if (node.type === schema.nodes.codeBlock || node.type === schema.nodes.cell || node.type === schema.nodes.table) {
      plain = false;
      return false;
    }
    if (node.isTextblock) {
      if (node.type !== schema.nodes.paragraph || parent?.type === schema.nodes.cell) plain = false;
      else text += node.textBetween(Math.max(0, from - pos - 1), Math.min(node.content.size, to - pos - 1), ' ', ' ');
      return false;
    }
    return true;
  });
  if (!plain) return 'Select only paragraphs, headings, list items, or quotes to edit with Agent.';
  if (!text.trim()) return 'Nothing to edit with Agent. The selection has no text.';
  return null;
}

/** How many model items (a char per code point, one per atom) come before `offset` in a text block. */
function itemsBefore(node: PMNode, offset: number): number {
  let index = 0;
  let pos = 0;
  for (let i = 0; i < node.childCount && pos < offset; i++) {
    const child = node.child(i);
    if (child.isText) {
      const take = Math.min(child.text!.length, offset - pos);
      index += [...child.text!.slice(0, take)].length;
      pos += take;
    } else {
      index += 1;
      pos += child.nodeSize;
    }
  }
  return index;
}

const itemText = (item: NonNullable<Block['inline']>[number]) => (isAtom(item) ? (item.atom === 'hardBreak' ? '\n' : '\uFFFC') : item.ch);

/** The selected words of each text block as the tab holds them: the block and the ids of its first and last char. */
export function targetsOf(doc: PMNode, from: number, to: number, shadow: DocState): RewriteTarget[] {
  const blocks = new Map<string, Block>();
  for (const { block } of walk(shadow.blocks)) blocks.set(block.id, block);
  const targets: RewriteTarget[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const start = Math.max(from, pos + 1) - pos - 1;
    const end = Math.min(to, pos + 1 + node.content.size) - pos - 1;
    const model = typeof node.attrs.bid === 'string' ? blocks.get(node.attrs.bid) : undefined;
    if (end <= start || !model?.inline) return false;
    const first = itemsBefore(node, start);
    const last = itemsBefore(node, end);
    const items = model.inline.slice(first, last);
    if (!items.length) return false;
    targets.push({ block: model.id, fromChar: items[0]!.id, toChar: items.at(-1)!.id, text: items.map(itemText).join('') });
    return false;
  });
  return targets.filter(target => target.text.trim());
}

