/**
 * Edit with Agent: the selection toolbar's button opens a prompt over the selected words; what the person asks goes to
 * the agent with where the words are, and the words stay marked while it works, until its suggestion arrives.
 */
import { agentResultMessage, sendFailure, watchAgentStatus } from '@open-artifact/editor-kit';
import { proposalIds } from '@open-artifact/docs-core';
import { toast } from '@open-artifact/ui';
import { TextSelection } from 'prosemirror-state';
import { docClient } from '../app/doc-client.ts';
import { maybeSession } from '../app/session.ts';
import { getDocs, setDocs } from '../app/store.ts';
import { cellSelected, selectedMedia } from '../editor/commands.ts';
import { currentView, useEditor } from '../editor/format.ts';
import { useOpenSuggestions } from './model.ts';
import { showUi, targetOf } from './plugin.ts';
import { REWRITE_TITLE, rewriteContext, rewriteText } from './request.ts';
import { refusalOf, targetsOf } from './selection.ts';
import { getSuggest, setSuggest, useSuggest } from './store.ts';

/** How long the words stay marked when no suggestion comes back. */
const WORKING_MS = 120_000;

const say = (title: string, description?: string) => toast.add({ title, ...(description ? { description } : {}) });

/** The toolbar shows the button to the owner while an agent can take requests and the doc can be written. */
export function editWithAgentAvailable(): boolean {
  const current = maybeSession();
  if (!current?.canAsk || !current.agent || !getDocs().writable) return false;
  return getSuggest().agent?.available !== false;
}

export function openEditWithAgent(): void {
  const view = currentView();
  const tab = useEditor.getState().tab;
  if (!view || !tab || !editWithAgentAvailable()) return;
  const { state } = view;
  const { from, to, empty } = state.selection;
  if (empty || !(state.selection instanceof TextSelection) || selectedMedia(state) || cellSelected(state)) {
    say('Nothing to edit with Agent. The selection has no text.');
    return;
  }
  const refusal = refusalOf(state.doc, from, to);
  if (refusal) {
    say(refusal);
    return;
  }
  if (getSuggest().agent?.busy || getSuggest().rewrite?.phase === 'working') {
    say('Agent is busy with an earlier request.');
    return;
  }
  setSuggest({ rewrite: { phase: 'prompt', tab, from, to } });
  setDocs({ rewriting: true });
  showUi(view, { target: { from, to }, working: false });
}

/** Closes the prompt (or stops showing the agent at work); `refocus` puts the keyboard back on the selected words. */
export function closeEditWithAgent(refocus = false): void {
  const view = currentView();
  const range = view ? targetOf(view.state) : null;
  setSuggest({ rewrite: null });
  setDocs({ rewriting: false });
  if (!view) return;
  showUi(view, { target: null, working: false });
  if (refocus) {
    if (range && range.to <= view.state.doc.content.size) {
      try {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)).setMeta('addToHistory', false));
      } catch {
        // The words went meanwhile: the caret stays where it is.
      }
    }
    view.focus();
  }
}

/** Escape while the agent works: the page stops waiting (the agent may still answer, as a suggestion). */
export function stopEditWithAgent(): void {
  const working = getSuggest().rewrite?.phase === 'working';
  closeEditWithAgent(true);
  if (working) say('Stopped waiting', 'If Agent still edits the text, its change arrives as a suggestion to accept or reject.');
}

// ---- sending -------------------------------------------------------------------------------------------------

export async function sendEditWithAgent(ask: string): Promise<void> {
  const rewrite = getSuggest().rewrite;
  const agent = maybeSession()?.agent;
  const view = currentView();
  if (!rewrite || rewrite.phase !== 'prompt' || !agent || !view) return;
  if (!ask.trim()) {
    say('Type what you want changed, then press Enter.');
    return;
  }
  setSuggest({ rewrite: { ...rewrite, phase: 'sending' } });
  try {
    const open = await docClient().tab(rewrite.tab);
    await open.sync.settled();
    const range = targetOf(view.state);
    const targets = range ? targetsOf(view.state.doc, range.from, range.to, open.sync.shadow) : [];
    if (!targets.length) {
      closeEditWithAgent(true);
      say('Nothing to edit with Agent. The selection has no text.');
      return;
    }
    const request = { tab: rewrite.tab, ask, targets };
    const known = proposalIds(open.sync.shadow.blocks);
    const result = await agent.send({ title: REWRITE_TITLE, text: rewriteText(request), context: rewriteContext(request) }).catch(sendFailure);
    if (getSuggest().rewrite?.phase !== 'sending') return;
    if (result.status === 'delivered') {
      setSuggest({ rewrite: { ...rewrite, phase: 'working', known, sentAt: Date.now() } });
      showUi(view, { working: true });
      return;
    }
    closeEditWithAgent(true);
    toast.add(agentResultMessage(result, 'this doc', getSuggest().agent ?? undefined));
  } catch (error) {
    closeEditWithAgent(true);
    toast.add(agentResultMessage(sendFailure(error), 'this doc'));
  }
}

// ---- watching for the answer ---------------------------------------------------------------------------------

/** Follows the agent's status, and ends the working state when its suggestion arrives, it goes idle, or time is up. */
export function watchEditWithAgent(): void {
  let stopStatus: (() => void) | null = null;
  let wasBusy = false;
  let timer = 0;

  const startStatus = () => {
    if (stopStatus) return;
    const agent = maybeSession()?.agent;
    if (!agent) return;
    stopStatus = watchAgentStatus(agent, status => {
      setSuggest({ agent: status });
      const rewrite = getSuggest().rewrite;
      if (rewrite?.phase !== 'working') return;
      if (status.busy) wasBusy = true;
      else if (wasBusy) {
        wasBusy = false;
        closeEditWithAgent();
      }
    });
  };
  startStatus();
  if (!stopStatus) {
    const off = useEditor.subscribe(state => {
      if (!state.view) return;
      startStatus();
      if (stopStatus) off();
    });
  }

  useOpenSuggestions.subscribe(({ tab, cards }) => {
    const rewrite = getSuggest().rewrite;
    if (rewrite?.phase !== 'working' || tab !== rewrite.tab) return;
    const known = new Set(rewrite.known ?? []);
    const fresh = cards.find(card => !known.has(card.id));
    if (!fresh) return;
    closeEditWithAgent();
    setDocs({ focusedSuggestion: fresh.id });
  });

  let phase = getSuggest().rewrite?.phase ?? null;
  useSuggest.subscribe(({ rewrite }) => {
    const next = rewrite?.phase ?? null;
    if (next === phase) return;
    phase = next;
    window.clearTimeout(timer);
    if (next !== 'working') return;
    wasBusy = getSuggest().agent?.busy === true;
    timer = window.setTimeout(() => {
      if (getSuggest().rewrite?.phase !== 'working') return;
      closeEditWithAgent();
      say('Agent hasn’t answered yet', 'Its edit arrives as a suggestion to accept or reject.');
    }, WORKING_MS);
  });

  // Another tab shown: the prompt over this one's words closes.
  useEditor.subscribe((state, before) => {
    if (state.tab !== before.tab && getSuggest().rewrite) closeEditWithAgent();
  });
}
