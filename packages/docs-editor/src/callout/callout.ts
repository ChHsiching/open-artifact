/**
 * Callouts: a quote whose first line starts with ℹ️, ✅ or ⚠️ is drawn as a coloured panel (info, success, warning).
 * Nothing in the doc marks it but the emoji, so Markdown round-trips it. The panel's icon button changes the kind
 * (it rewrites the emoji) and its × removes the panel.
 */
import { closeHistory } from 'prosemirror-history';
import type { Node as PMNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, Selection, TextSelection, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { schema } from '../editor/schema.ts';

const { nodes } = schema;

export type CalloutKind = 'info' | 'success' | 'warning';

interface KindInfo {
  kind: CalloutKind;
  emoji: string;
  label: string;
  buttonName: string;
  icon: string;
}

const svg = (body: string, size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const CALLOUT_KINDS: readonly KindInfo[] = [
  { kind: 'info', emoji: 'ℹ️', label: 'Info', buttonName: 'Info panel — change type', icon: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>' },
  { kind: 'success', emoji: '✅', label: 'Success', buttonName: 'Success panel — change type', icon: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>' },
  {
    kind: 'warning',
    emoji: '⚠️',
    label: 'Warning',
    buttonName: 'Warning panel — change type',
    icon: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  },
];

const X_ICON = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const TICK_ICON = '<path d="M20 6 9 17l-5-5"/>';

const kindInfo = (kind: CalloutKind) => CALLOUT_KINDS.find(each => each.kind === kind)!;

const LEAD = /^(ℹ️|✅️?|⚠️)( ?)/u;
const BY_EMOJI: Record<string, CalloutKind> = { 'ℹ': 'info', '✅': 'success', '⚠': 'warning' };

export interface CalloutLead {
  kind: CalloutKind;
  emoji: string;
  /** The emoji and the space after it, in positions. */
  leadLen: number;
}

/** The quote's callout kind, from the emoji its first line starts with. */
export function calloutKind(node: PMNode | null | undefined): CalloutLead | null {
  if (!node || node.type !== nodes.blockquote) return null;
  const first = node.firstChild;
  if (!first || first.type !== nodes.paragraph || !first.firstChild?.isText) return null;
  const match = LEAD.exec(first.textBetween(0, Math.min(first.content.size, 8), '￼', '￼'));
  if (!match) return null;
  const emoji = match[1]!;
  return { kind: BY_EMOJI[emoji.replace(/️/g, '')]!, emoji, leadLen: match[0].length };
}

/** Rewrites the callout's emoji to another kind's. */
export function changeCalloutKind(view: EditorView, pos: number, kind: CalloutKind): boolean {
  if (!view.editable) return false;
  const lead = calloutKind(view.state.doc.nodeAt(pos));
  if (!lead) return false;
  if (lead.kind === kind) return true;
  const at = pos + 2;
  view.dispatch(view.state.tr.insertText(`${kindInfo(kind).emoji} `, at, at + lead.leadLen).scrollIntoView());
  return true;
}

export function deleteCallout(state: EditorState, pos: number): Transaction | null {
  const node = state.doc.nodeAt(pos);
  if (!node || !calloutKind(node)) return null;
  const tr = closeHistory(state.tr).delete(pos, pos + node.nodeSize);
  const $pos = tr.doc.resolve(tr.mapping.map(pos));
  tr.setSelection(Selection.findFrom($pos, 1, true) ?? Selection.findFrom($pos, -1, true) ?? Selection.near($pos, 1));
  return tr.scrollIntoView();
}

export function removeCallout(view: EditorView, pos: number): boolean {
  if (!view.editable) return false;
  const node = view.state.doc.nodeAt(pos);
  const lead = calloutKind(node);
  if (!node || !lead) return false;
  const { selection } = view.state;
  if (selection.from < pos || selection.to > pos + node.nodeSize) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 2 + lead.leadLen)));
  const tr = deleteCallout(view.state, pos);
  if (!tr) return false;
  view.dispatch(tr);
  view.focus();
  return true;
}

/** The position of the quote a control sits in. */
function calloutPos(view: EditorView, control: HTMLElement): number | null {
  const quote = control.closest('blockquote');
  if (!quote || !view.dom.contains(quote)) return null;
  let pos: number;
  try {
    pos = view.posAtDOM(quote, 0) - 1;
  } catch {
    return null;
  }
  return view.state.doc.nodeAt(pos)?.type === nodes.blockquote ? pos : null;
}

let closeMenu: (() => void) | null = null;

/** The kind menu under the panel's icon. */
function openKindMenu(view: EditorView, button: HTMLElement): void {
  closeMenu?.();
  const at = () => (button.isConnected ? calloutPos(view, button) : null);
  const start = at();
  const current = start === null ? null : (calloutKind(view.state.doc.nodeAt(start))?.kind ?? null);
  const doc = view.dom.ownerDocument;
  const menu = doc.createElement('div');
  menu.className = 'doc-callout-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'Panel type');
  const rows: HTMLElement[] = [];
  const close = (refocus: boolean) => {
    menu.remove();
    button.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('mousedown', outside, true);
    if (closeMenu === done) closeMenu = null;
    if (refocus) view.focus();
  };
  const done = () => close(false);
  const choose = (kind: CalloutKind) => {
    close(true);
    const pos = at();
    if (pos !== null) changeCalloutKind(view, pos, kind);
  };
  for (const info of CALLOUT_KINDS) {
    const row = doc.createElement('div');
    row.className = 'row';
    row.setAttribute('role', 'option');
    row.tabIndex = -1;
    row.dataset.kind = info.kind;
    row.setAttribute('aria-selected', String(info.kind === current));
    row.innerHTML = `${svg(info.icon, 16)}<span>${info.label}</span>${info.kind === current ? `<span class="tick">${svg(TICK_ICON, 14)}</span>` : ''}`;
    row.addEventListener('mousedown', event => event.preventDefault());
    row.addEventListener('click', () => choose(info.kind));
    rows.push(row);
    menu.append(row);
  }
  menu.addEventListener('keydown', event => {
    const index = rows.indexOf(doc.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (index + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      rows[next]!.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (index >= 0) choose(rows[index]!.dataset.kind as CalloutKind);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close(false);
      button.focus();
    }
  });
  const outside = (event: MouseEvent) => {
    if (!menu.contains(event.target as Node) && event.target !== button) close(false);
  };
  doc.addEventListener('mousedown', outside, true);
  doc.body.append(menu);
  const box = button.getBoundingClientRect();
  const own = menu.getBoundingClientRect();
  const below = box.bottom + 4;
  const top = below + own.height <= window.innerHeight - 8 ? below : Math.max(8, box.top - 4 - own.height);
  const left = Math.max(8, Math.min(box.left, window.innerWidth - own.width - 8));
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  button.setAttribute('aria-expanded', 'true');
  (rows.find(row => row.dataset.kind === current) ?? rows[0])!.focus();
  closeMenu = done;
}

function kindControl(view: EditorView, kind: CalloutKind, writable: boolean): HTMLElement {
  const info = kindInfo(kind);
  const doc = view.dom.ownerDocument;
  const control = doc.createElement(writable ? 'button' : 'span');
  control.className = 'doc-callout-kind';
  control.contentEditable = 'false';
  control.dataset.calloutIcon = kind;
  control.innerHTML = svg(info.icon, 20);
  if (!writable) {
    control.setAttribute('aria-hidden', 'true');
    return control;
  }
  (control as HTMLButtonElement).type = 'button';
  control.setAttribute('aria-haspopup', 'listbox');
  control.setAttribute('aria-expanded', 'false');
  control.setAttribute('aria-label', info.buttonName);
  control.dataset.testid = 'callout-kind';
  control.addEventListener('mousedown', event => event.preventDefault());
  control.addEventListener('click', event => {
    event.preventDefault();
    if (calloutPos(view, control) !== null) openKindMenu(view, control);
  });
  return control;
}

function removeControl(view: EditorView): HTMLElement {
  const doc = view.dom.ownerDocument;
  const control = doc.createElement('button');
  control.type = 'button';
  control.className = 'doc-callout-x';
  control.contentEditable = 'false';
  control.setAttribute('aria-label', 'Delete callout');
  control.title = 'Delete callout';
  control.dataset.testid = 'callout-x';
  control.innerHTML = svg(X_ICON, 16);
  const run = (event: Event) => {
    event.preventDefault();
    const pos = calloutPos(view, control);
    if (pos !== null) removeCallout(view, pos);
  };
  control.addEventListener('mousedown', event => event.preventDefault());
  control.addEventListener('click', run);
  control.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.stopPropagation();
    run(event);
  });
  return control;
}

function calloutDecorations(doc: PMNode, writable: boolean): DecorationSet {
  const out: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) return false;
    if (node.type !== nodes.blockquote) return true;
    const lead = calloutKind(node);
    if (!lead) return true;
    const info = kindInfo(lead.kind);
    out.push(Decoration.node(pos, pos + node.nodeSize, { class: 'doc-callout', 'data-callout': lead.kind, role: 'note', 'aria-label': info.label }));
    const from = pos + 2;
    const emojiEnd = from + lead.emoji.length;
    out.push(Decoration.inline(from, emojiEnd, { class: 'doc-callout-lead' }));
    if (lead.leadLen > lead.emoji.length) out.push(Decoration.inline(emojiEnd, from + lead.leadLen, { class: 'doc-callout-gap' }));
    const end = pos + node.nodeSize - 1;
    out.push(
      Decoration.widget(end, view => kindControl(view, lead.kind, writable), {
        side: 1,
        key: `callout-kind:${lead.kind}:${writable ? 1 : 0}`,
        ignoreSelection: true,
        stopEvent: () => true,
      }),
    );
    if (writable) out.push(Decoration.widget(end, view => removeControl(view), { side: 1, key: 'callout-x', ignoreSelection: true, stopEvent: () => true }));
    return true;
  });
  return out.length ? DecorationSet.create(doc, out) : DecorationSet.empty;
}

/** The callout around the caret. */
function calloutAtSelection(state: EditorState): { pos: number; node: PMNode } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type === nodes.blockquote) return calloutKind(node) ? { pos: $from.before(depth), node } : null;
  }
  return null;
}

const key = new PluginKey<DecorationSet>('callout');

export function calloutPlugin(writable: () => boolean): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => calloutDecorations(state.doc, writable()),
      apply: (tr, old, _old, state) => (tr.docChanged || tr.getMeta(key) ? calloutDecorations(state.doc, writable()) : old),
    },
    view: () => ({ destroy: () => closeMenu?.() }),
    props: {
      decorations(state) {
        const set = key.getState(state) ?? DecorationSet.empty;
        const here = calloutAtSelection(state);
        return here ? set.add(state.doc, [Decoration.node(here.pos, here.pos + here.node.nodeSize, { class: 'has-caret' })]) : set;
      },
    },
  });
}
