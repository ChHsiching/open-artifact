/**
 * Others on the same tab, drawn in its text: each person's caret with their name (shown for a moment after it
 * moves, then on hover), their selection tinted in their color, a block they selected outlined; and the agent's caret
 * at the end of what it just wrote. Places are found again whenever peers move or the tab's text changes under them;
 * the page's own edits just map them along.
 */
import { AGENT_COLOR, inkOnPeerColor } from '@open-artifact/editor-kit';
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { docClient } from '../app/doc-client.ts';
import { useAgentPresence } from './agent-presence.ts';
import { AGENT_ENTRY, colorOf } from './people.ts';
import { agentCaretOf, blockRange, type DocsPresence, rangeOf } from './places.ts';
import { usePresence } from './presence.ts';

/** How long a caret's name shows after it moved, ms. */
export const LABEL_SHOWN_MS = 4000;

/** Selections are tinted with the peer's color at this alpha (hex). */
const SELECTION_ALPHA = '38';

const caretsKey = new PluginKey<DecorationSet>('peerCarets');

interface Caret {
  peer: string;
  name: string;
  color: string;
  agent: boolean;
  movedAt: number;
}

/** When each peer's published place last changed. */
const moves = new Map<string, { place: string; at: number }>();

function movedAt(peer: string, state: DocsPresence): number {
  const place = JSON.stringify([state.tab, state.sel, state.node]);
  const known = moves.get(peer);
  if (known?.place === place) return known.at;
  const at = Date.now();
  moves.set(peer, { place, at });
  return at;
}

function caretDom(caret: Caret): HTMLElement {
  const bar = document.createElement('span');
  bar.className = 'doc-peer-caret';
  bar.dataset.peer = caret.peer;
  if (caret.agent) bar.dataset.agent = '';
  bar.setAttribute('aria-hidden', 'true');
  bar.style.setProperty('--peer', caret.color);
  bar.style.setProperty('--peer-ink', inkOnPeerColor(caret.color));
  const label = bar.appendChild(document.createElement('span'));
  label.className = 'doc-peer-label';
  label.dataset.name = caret.name;
  const shown = Date.now() - caret.movedAt;
  if (shown >= LABEL_SHOWN_MS) label.classList.add('is-quiet');
  else label.style.animationDelay = `${-shown}ms`;
  return bar;
}

function caretWidget(pos: number, caret: Caret): Decoration {
  return Decoration.widget(pos, () => caretDom(caret), {
    key: `${caret.peer}|${caret.color}|${caret.name}|${caret.movedAt}`,
    peer: caret.peer,
    side: -1,
    marks: [],
    ignoreSelection: true,
  });
}

function drawnCaret(set: DecorationSet, peer: string): number | null {
  return set.find(undefined, undefined, spec => spec.peer === peer)[0]?.from ?? null;
}

function draw(doc: PMNode, tab: string, previous: DecorationSet): DecorationSet {
  const open = docClient().openTabOf(tab);
  if (!open) return DecorationSet.empty;
  const shadow = open.binding.shadow;
  const items: Decoration[] = [];
  const peers = usePresence.getState().peers;
  for (const peer of peers) {
    const state = peer.state;
    if (!state || state.tab !== tab) continue;
    const color = colorOf(peer);
    const at = movedAt(peer.id, state);
    if (state.sel) {
      const range = rangeOf(doc, shadow, state.sel, drawnCaret(previous, peer.id));
      if (!range) continue;
      if (range.to > range.from) items.push(Decoration.inline(range.from, range.to, { class: 'doc-peer-selection', style: `background-color: ${color}${SELECTION_ALPHA}` }));
      items.push(caretWidget(range.head, { peer: peer.id, name: peer.name, color, agent: peer.kind === 'agent', movedAt: at }));
    } else if (state.node) {
      const block = blockRange(doc, state.node);
      if (!block) continue;
      items.push(
        Decoration.node(block.from, block.to, {
          class: 'doc-peer-block',
          style: `--peer: ${color}; --peer-ink: ${inkOnPeerColor(color)}`,
          'data-peer': peer.id,
          'data-peer-name': peer.name,
        }),
      );
    }
  }
  const agent = useAgentPresence.getState();
  const agentPeer = peers.find(peer => peer.kind === 'agent');
  const agentDrawn = agentPeer?.state?.tab === tab && (agentPeer.state.sel !== null || agentPeer.state.node !== null);
  if (agent.wrote?.tab === tab && !agentDrawn) {
    const pos = agentCaretOf(doc, agent.wrote.blocks);
    const caret = { peer: agentPeer?.id ?? AGENT_ENTRY, name: agentPeer?.name ?? agent.name, color: AGENT_COLOR, agent: true, movedAt: agent.wrote.at };
    if (pos !== null) items.push(caretWidget(pos, caret));
  }
  return DecorationSet.create(doc, items);
}

function watchPeers(view: EditorView, tab: string): () => void {
  let queued = false;
  let gone = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const redraw = (): void => {
    if (queued || gone) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (gone) return;
      // Nothing is drawn into the text while an input method is composing in it.
      if (view.composing) {
        clearTimeout(retry);
        retry = setTimeout(redraw, 120);
        return;
      }
      const drawn = caretsKey.getState(view.state) ?? DecorationSet.empty;
      const set = draw(view.state.doc, tab, drawn);
      if (set === DecorationSet.empty && drawn === DecorationSet.empty) return;
      view.dispatch(view.state.tr.setMeta(caretsKey, set).setMeta('addToHistory', false));
    });
  };
  const stops = [
    usePresence.subscribe((state, before) => {
      if (state.peers !== before.peers) redraw();
    }),
    useAgentPresence.subscribe((state, before) => {
      if (state.wrote !== before.wrote || state.name !== before.name) redraw();
    }),
    docClient().onShadow(changed => {
      if (changed === tab) redraw();
    }),
  ];
  redraw();
  return () => {
    gone = true;
    clearTimeout(retry);
    stops.forEach(stop => stop());
  };
}

export function peerCaretsPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: caretsKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        const drawn = tr.getMeta(caretsKey) as DecorationSet | undefined;
        return drawn ?? (tr.docChanged ? set.map(tr.mapping, tr.doc) : set);
      },
    },
    props: {
      decorations: state => caretsKey.getState(state),
    },
    view(view) {
      const tab = view.dom.getAttribute('data-tab');
      const stop = tab ? watchPeers(view, tab) : () => undefined;
      return { destroy: stop };
    },
  });
}
