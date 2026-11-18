/**
 * A version as the preview draws it: a ProseMirror doc in the page's schema, and the highlighting of what changed as
 * decorations of its own (so the preview carries no suggestion marks or attrs for other parts of the page to find).
 */
import type { DocState } from '@open-artifact/docs-core';
import { Fragment, type Mark, type Node as PMNode } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { pmDocOf } from '../editor/binding.ts';
import { schema } from '../editor/schema.ts';
import { CHANGE_ID, type ChangeOp } from './compare.ts';

export interface ChangeRange {
  from: number;
  to: number;
  op: ChangeOp;
  /** A whole block (else words or an inline item). */
  block: boolean;
}

export interface PreviewDoc {
  doc: PMNode;
  changes: ChangeRange[];
}

const isChangeMark = (mark: Mark) => (mark.type === schema.marks.suggestIns || mark.type === schema.marks.suggestDel) && mark.attrs.suggestId === CHANGE_ID;

/** The doc to draw, with the ranges of what changed (from {@link compareVersions}' marks). */
export function previewDocOf(state: DocState): PreviewDoc {
  const marked = pmDocOf(state);
  const changes: ChangeRange[] = [];
  marked.descendants((node, pos) => {
    if (!node.isInline && node.attrs.suggestId === CHANGE_ID) {
      changes.push({ from: pos, to: pos + node.nodeSize, op: node.attrs.suggestOp === 'del' ? 'del' : 'ins', block: true });
      return true;
    }
    if (node.isInline) {
      const mark = node.marks.find(isChangeMark);
      if (mark) {
        const op: ChangeOp = mark.type === schema.marks.suggestDel ? 'del' : 'ins';
        const last = changes[changes.length - 1];
        if (last && !last.block && last.op === op && last.to === pos) last.to = pos + node.nodeSize;
        else changes.push({ from: pos, to: pos + node.nodeSize, op, block: false });
      }
    }
    return true;
  });
  return { doc: withoutChanges(marked), changes };
}

function withoutChanges(node: PMNode): PMNode {
  if (node.isText) return node.mark(node.marks.filter(mark => !isChangeMark(mark)));
  const marks = node.marks.filter(mark => !isChangeMark(mark));
  const attrs = node.attrs.suggestId === CHANGE_ID ? { ...node.attrs, suggestId: null, suggestOp: null } : node.attrs;
  if (node.isLeaf) return node.type.create(attrs, null, marks);
  const content: PMNode[] = [];
  node.forEach(child => content.push(withoutChanges(child)));
  return node.type.create(attrs, Fragment.from(content), marks);
}

/** Draws the changes: added words underlined in the added colour, dropped ones struck through, whole blocks barred. */
export function changesPlugin(changes: readonly ChangeRange[]): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const decorations = changes.map(change =>
          change.block
            ? Decoration.node(change.from, change.to, { class: `doc-version-block doc-version-block-${change.op}` })
            : Decoration.inline(change.from, change.to, { nodeName: change.op, class: `doc-version-${change.op}` }),
        );
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}
