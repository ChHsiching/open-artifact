/**
 * The layouts an empty doc can start from ("Start with a layout"): each is a title and the blocks under it. Hints are
 * not text: they are the grey words an empty line shows under a layout's heading until something is typed there.
 */
import type { Node as PMNode } from 'prosemirror-model';
import { type EditorState, Plugin, TextSelection, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { schema } from '../editor/schema.ts';

const { nodes } = schema;

export type LayoutBlock =
  | { t: 'date' }
  | { t: 'h2'; text: string }
  | { t: 'hint'; text: string }
  | { t: 'bullets' | 'numbers' | 'checks'; hints: string[] }
  | { t: 'table'; head: string[]; rows: number };

export interface Layout {
  id: string;
  title: string;
  blocks: LayoutBlock[];
}

const date: LayoutBlock = { t: 'date' };
const h2 = (text: string): LayoutBlock => ({ t: 'h2', text });
const hint = (text: string): LayoutBlock => ({ t: 'hint', text });
const list = (t: 'bullets' | 'numbers' | 'checks', ...hints: string[]): LayoutBlock => ({ t, hints });

export const LAYOUTS: readonly Layout[] = [
  {
    id: 'meeting_notes',
    title: 'Meeting notes',
    blocks: [
      date,
      h2('Attendees'),
      hint('Who was there'),
      h2('Agenda'),
      list('bullets', 'First topic'),
      h2('Notes'),
      hint('Decisions, open questions, and anything worth remembering'),
      h2('Action items'),
      list('checks', 'What needs to be done, who owns it, and by when'),
    ],
  },
  {
    id: 'project_plan',
    title: 'Project plan',
    blocks: [
      h2('Goal'),
      hint('What this project will achieve and why now'),
      h2('Scope'),
      list('bullets', 'What’s included', 'What’s not'),
      h2('Timeline'),
      { t: 'table', head: ['Milestone', 'Owner', 'Date'], rows: 3 },
      h2('Risks'),
      list('bullets', 'What could delay the project'),
    ],
  },
  {
    id: 'report',
    title: 'Report',
    blocks: [
      h2('Summary'),
      hint('The main finding, in two or three sentences'),
      h2('Background'),
      hint('What prompted this and what you looked at'),
      h2('Findings'),
      list('bullets', 'First finding'),
      h2('Recommendations'),
      list('numbers', 'What to do next'),
    ],
  },
  {
    id: 'proposal',
    title: 'Proposal',
    blocks: [
      h2('Problem'),
      hint('The problem to solve and who has it'),
      h2('Proposed solution'),
      hint('What you want to do'),
      h2('Cost and timeline'),
      hint('What it costs and how long it takes'),
      h2('Next steps'),
      list('checks', 'The decision you need and from whom'),
    ],
  },
  {
    id: 'status_update',
    title: 'Status update',
    blocks: [
      date,
      h2('Summary'),
      hint('The current status, in a sentence or two'),
      h2('Done'),
      list('bullets', 'What’s finished since the last update'),
      h2('Up next'),
      list('bullets', 'What’s planned'),
      h2('Blockers'),
      list('bullets', 'What’s blocking progress and who can help'),
    ],
  },
  {
    id: 'spec',
    title: 'Spec',
    blocks: [
      h2('Overview'),
      hint('What you’re building and why'),
      h2('Requirements'),
      list('bullets', 'What it must do'),
      h2('Design'),
      hint('How it works'),
      h2('Open questions'),
      list('numbers', 'What’s still undecided'),
    ],
  },
  {
    id: 'how_to_guide',
    title: 'How-to guide',
    blocks: [
      h2('Before you start'),
      list('bullets', 'What you’ll need'),
      h2('Steps'),
      list('numbers', 'First step'),
      h2('Troubleshooting'),
      hint('Common problems and how to fix them'),
    ],
  },
  {
    id: 'process_doc',
    title: 'Process doc',
    blocks: [
      h2('Purpose'),
      hint('What this process is for and when to use it'),
      h2('Who’s involved'),
      list('bullets', 'Role and what they’re responsible for'),
      h2('Steps'),
      list('numbers', 'First step'),
      h2('Exceptions'),
      hint('When the usual steps don’t apply'),
    ],
  },
  {
    id: 'project_brief',
    title: 'Project brief',
    blocks: [
      h2('Objective'),
      hint('What this work should achieve'),
      h2('Audience'),
      hint('Who it’s for'),
      h2('Key message'),
      hint('The one thing they should remember'),
      h2('Deliverables'),
      list('checks', 'What’s due and when'),
    ],
  },
  {
    id: 'study_guide',
    title: 'Study guide',
    blocks: [
      h2('Key concepts'),
      list('bullets', 'First concept'),
      h2('Terms to know'),
      { t: 'table', head: ['Term', 'Meaning'], rows: 3 },
      h2('Practice questions'),
      list('numbers', 'First question'),
    ],
  },
  {
    id: 'resume',
    title: 'Résumé',
    blocks: [
      h2('Summary'),
      hint('Who you are and what you do, in two or three lines'),
      h2('Experience'),
      list('bullets', 'Role, company, and dates'),
      h2('Education'),
      list('bullets', 'Degree, school, and year'),
      h2('Skills'),
      hint('Your strongest skills'),
    ],
  },
  {
    id: 'project_recap',
    title: 'Project recap',
    blocks: [
      h2('What we planned to do'),
      hint('The goal, in a sentence or two'),
      h2('What happened'),
      list('bullets', 'Key results'),
      h2('What we learned'),
      list('bullets', 'What worked and what didn’t'),
      h2('Next steps'),
      list('checks', 'What’s left to do and who owns it'),
    ],
  },
];

export const layoutById = (id: string): Layout | undefined => LAYOUTS.find(layout => layout.id === id);

/** "November 18, 2026": the date line a dated layout starts with. */
export const layoutDate = (now: Date): string => now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

/** A table column's width, so the columns fill the page's text width. */
export const columnWidth = (columns: number): number => Math.floor(672 / columns);

const LIST_KIND = { bullets: 'bullet', numbers: 'ordered', checks: 'check' } as const;

/** The layout's blocks as nodes, every hint an empty line. */
export function layoutNodes(layout: Layout, now: Date): PMNode[] {
  const paragraph = (text?: string, heading?: number) => nodes.paragraph!.create(heading ? { heading } : null, text ? schema.text(text) : null);
  return layout.blocks.map(block => {
    switch (block.t) {
      case 'date':
        return paragraph(layoutDate(now));
      case 'h2':
        return paragraph(block.text, 2);
      case 'hint':
        return paragraph();
      case 'table': {
        const colwidth = [columnWidth(block.head.length)];
        const row = (texts: (string | undefined)[], header: boolean) =>
          nodes.tableRow!.create(
            null,
            texts.map(text => nodes.cell!.create({ header, colwidth }, paragraph(text))),
          );
        return nodes.table!.create(null, [row(block.head, true), ...Array.from({ length: block.rows }, () => row(block.head.map(() => undefined), false))]);
      }
      default:
        return nodes.list!.create(
          { kind: LIST_KIND[block.t] },
          block.hints.map(() => nodes.listItem!.create(block.t === 'checks' ? { checked: false } : null, paragraph())),
        );
    }
  });
}

/** The doc has nothing under its title yet: the title, then at most one empty line. */
export function bodyIsEmpty(doc: PMNode): boolean {
  const title = doc.firstChild;
  if (!title || !title.isTextblock || doc.childCount > 2) return false;
  if (doc.childCount === 1) return true;
  const body = doc.child(1);
  return body.type === nodes.paragraph && body.content.size === 0 && !body.attrs.heading;
}

/** Everything under the title becomes the layout; an empty title takes the layout's name. The caret goes to the first empty line. */
export function applyLayout(state: EditorState, layout: Layout, now = new Date()): Transaction | null {
  const title = state.doc.firstChild;
  if (!title || !title.isTextblock) return null;
  const tr = state.tr.replaceWith(title.nodeSize, state.doc.content.size, layoutNodes(layout, now));
  if (title.content.size === 0) tr.insert(1, schema.text(layout.title));
  if (title.type !== nodes.paragraph || title.attrs.heading !== 1) tr.setNodeMarkup(0, nodes.paragraph, { ...title.attrs, heading: 1 });
  let caret: number | null = null;
  tr.doc.descendants((node, pos) => {
    if (caret !== null) return false;
    if (pos > 0 && node.isTextblock && node.content.size === 0) caret = pos + 1;
    return caret === null;
  });
  if (caret !== null) tr.setSelection(TextSelection.create(tr.doc, caret));
  return tr.scrollIntoView();
}

interface HintRun {
  kind: 'bullet' | 'ordered' | 'check' | null;
  hints: string[];
}

/** Each layout heading and the hints of the block under it. */
const HINTS: ReadonlyMap<string, HintRun> = (() => {
  const map = new Map<string, HintRun>();
  for (const layout of LAYOUTS)
    layout.blocks.forEach((block, index) => {
      const next = layout.blocks[index + 1];
      if (block.t !== 'h2' || !next || map.has(block.text)) return;
      if (next.t === 'hint') map.set(block.text, { kind: null, hints: [next.text] });
      else if (next.t === 'bullets' || next.t === 'numbers' || next.t === 'checks') map.set(block.text, { kind: LIST_KIND[next.t], hints: next.hints });
    });
  return map;
})();

const emptyLine = (node: PMNode | null | undefined) => !!node && node.type === nodes.paragraph && node.content.size === 0 && !node.attrs.heading;

/** How far down the doc a layout's hints are looked for. */
const HINT_BLOCKS = 100;

export function layoutHintDecorations(doc: PMNode): Decoration[] {
  const out: Decoration[] = [];
  const hintAt = (node: PMNode, pos: number, text: string) => out.push(Decoration.node(pos, pos + node.nodeSize, { class: 'doc-empty-hint doc-layout-hint', 'data-layout-hint': text }));
  let pos = 0;
  for (let index = 0; index + 1 < doc.childCount && index < HINT_BLOCKS; index++) {
    const block = doc.child(index);
    pos += block.nodeSize;
    const run = block.type === nodes.paragraph && block.attrs.heading === 2 ? HINTS.get(block.textContent) : undefined;
    if (!run) continue;
    const next = doc.child(index + 1);
    if (run.kind === null) {
      if (emptyLine(next)) hintAt(next, pos, run.hints[0]!);
      continue;
    }
    if (next.type !== nodes.list || next.attrs.kind !== run.kind) continue;
    next.forEach((item, offset, itemIndex) => {
      const text = run.hints[itemIndex];
      if (text !== undefined && item.childCount === 1 && emptyLine(item.firstChild)) hintAt(item.firstChild!, pos + 1 + offset + 1, text);
    });
  }
  return out;
}

/** The grey hints under a layout's headings, while their lines are empty. */
export function layoutHints(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    state: {
      init: (_config, state) => DecorationSet.create(state.doc, layoutHintDecorations(state.doc)),
      apply: (tr, old, _oldState, state) => (tr.docChanged ? DecorationSet.create(state.doc, layoutHintDecorations(state.doc)) : old),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
