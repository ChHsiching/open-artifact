/** Opening the ask card on the caret's line, sending what is asked to the agent, and following it while it writes. */
import { agentResultMessage, sendFailure, watchAgentStatus } from '@open-artifact/editor-kit';
import { toast } from '@open-artifact/ui';
import type { EditorView } from 'prosemirror-view';
import { docClient } from '../app/doc-client.ts';
import { maybeSession } from '../app/session.ts';
import { getDocs } from '../app/store.ts';
import { currentView, useEditor } from '../editor/format.ts';
import { ASK_TITLE, cleanAsk, lineAskContext, lineAskText } from './request.ts';
import { getAsk, setAsk } from './store.ts';

/** How long the card waits for the agent before it lets go. */
const WORKING_MS = 120_000;

/** Whether the person can ask the agent from the text: an agent that takes requests, and a doc they can write. */
export function canAskFromText(): boolean {
  const current = maybeSession();
  return !!current?.canAsk && !!current.agent && getDocs().writable;
}

/** The id of the top-level block holding a position. */
function blockAt(view: EditorView, pos: number): { id: string; empty: boolean } | null {
  const $pos = view.state.doc.resolve(pos);
  const node = $pos.depth ? $pos.node(1) : null;
  const id = node?.attrs.bid;
  return typeof id === 'string' && node ? { id, empty: node.textContent.trim() === '' } : null;
}

/** Opens the card on the caret's line, once what was typed is in the model (a new line has no id before). */
export async function openAsk(view: EditorView): Promise<boolean> {
  const tab = useEditor.getState().tab;
  if (!tab || !canAskFromText()) return false;
  if (getAsk().open && getAsk().open!.phase !== 'prompt') {
    toast.add({ title: 'Agent is busy with an earlier request.' });
    return false;
  }
  await docClient().settled();
  const now = currentView();
  if (!now || useEditor.getState().tab !== tab) return false;
  const block = blockAt(now, now.state.selection.from);
  if (!block) return false;
  setAsk({ open: { tab, block: block.id, phase: 'prompt' } });
  return true;
}

export function closeAsk(refocus = true): void {
  setAsk({ open: null });
  if (refocus) currentView()?.focus();
}

let stopWatching: (() => void) | null = null;

export async function sendAsk(ask: string): Promise<void> {
  const open = getAsk().open;
  const agent = maybeSession()?.agent;
  const view = currentView();
  if (!open || open.phase !== 'prompt' || !agent || !view) return;
  if (!cleanAsk(ask)) {
    toast.add({ title: 'Type what you want written, then press Enter.' });
    return;
  }
  let empty = false;
  view.state.doc.forEach(node => {
    if (node.attrs.bid === open.block) empty = node.textContent.trim() === '';
  });
  setAsk({ open: { ...open, phase: 'sending' } });
  const request = { tab: open.tab, block: open.block, empty, ask };
  try {
    const result = await agent.send({ title: ASK_TITLE, text: lineAskText(request), context: lineAskContext(request) }).catch(sendFailure);
    if (getAsk().open?.phase !== 'sending') return;
    if (result.status !== 'delivered') {
      closeAsk();
      toast.add(agentResultMessage(result, 'this doc'));
      return;
    }
    setAsk({ open: { ...open, phase: 'working' } });
    watchWork(open.block);
  } catch (error) {
    closeAsk();
    toast.add(agentResultMessage(sendFailure(error), 'this doc'));
  }
}

/** The card stays while the agent works, and goes when the line changes, the agent is done, or time is up. */
function watchWork(block: string): void {
  stopWatching?.();
  const agent = maybeSession()?.agent;
  let wasBusy = false;
  const startText = lineText(block);
  const finish = () => {
    stopWatching?.();
    stopWatching = null;
    if (getAsk().open?.phase === 'working') setAsk({ open: null });
  };
  const offStatus = watchAgentStatus(agent, status => {
    if (status.busy) wasBusy = true;
    else if (wasBusy) finish();
  });
  const offText = useEditor.subscribe(() => {
    if (lineText(block) !== startText) finish();
  });
  const timer = setTimeout(finish, WORKING_MS);
  stopWatching = () => {
    offStatus();
    offText();
    clearTimeout(timer);
  };
}

/** The text of a top-level block, or null once it is gone. */
function lineText(block: string): string | null {
  const doc = useEditor.getState().state?.doc;
  let text: string | null = null;
  doc?.forEach(node => {
    if (node.attrs.bid === block) text = node.textContent;
  });
  return text;
}

/** Escape while the agent writes: the card goes; what the agent still writes arrives as usual. */
export function stopAsk(): void {
  const working = getAsk().open?.phase === 'working';
  stopWatching?.();
  stopWatching = null;
  closeAsk();
  if (working) toast.add({ title: 'Stopped waiting', description: 'If Agent still writes here, its text arrives as usual.' });
}
