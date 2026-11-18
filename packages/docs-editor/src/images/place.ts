/** Where a dropped picture goes in the doc. */
import type { Transaction } from 'prosemirror-state';
import { schema } from '../editor/schema.ts';

const { nodes } = schema;

/** Where dropped pictures go: at `at` where text can go, else in a new paragraph there. The selection is left alone. */
export function dropPlace(tr: Transaction, at: number): number {
  const $at = tr.doc.resolve(Math.max(0, Math.min(at, tr.doc.content.size)));
  if ($at.parent.inlineContent && $at.parent.type !== nodes.codeBlock) return $at.pos;
  let place = $at.parent.inlineContent ? $at.after() : $at.pos;
  const $place = tr.doc.resolve(place);
  if (!$place.parent.canReplaceWith($place.index(), $place.index(), nodes.paragraph!)) place = $at.depth >= 1 ? $at.after(1) : tr.doc.content.size;
  tr.insert(place, nodes.paragraph!.create());
  return place + 1;
}
