/**
 * What people do with comments: start a thread on the selection, a cell or a paragraph; reply, edit, react, resolve,
 * delete, copy a link; and open a thread where it is. Messages that @mention the agent are addressed to it and hand it
 * the thread.
 */
import type { CommentThread } from '@open-artifact/runtime';
import { COMMENT_TEXT_MAX } from '@open-artifact/editor-kit';
import { toast } from '@open-artifact/ui';
import type { EditorState } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { docClient } from '../app/doc-client.ts';
import { maybeSession } from '../app/session.ts';
import { showTab } from '../app/start.ts';
import { getDocs, setDocs } from '../app/store.ts';
import { currentView, useEditor } from '../editor/format.ts';
import { rangesOf as suggestionRanges } from '../suggest/positions.ts';
import type { SuggestionReplyTarget } from '../suggest/reply.ts';
import { type DocAnchor, anchorLocation, quoteDetail, quoteLabel, withoutPlace } from './anchor.ts';
import { blockIdAt, idsOfRange, textUnits, unitRange } from './anchor-map.ts';
import { AGENT_KEY, mentionsIn } from './mentions.ts';
import { rangesOf } from './plugin.ts';
import {
  type Composer,
  NEW_THREAD,
  agentName,
  canAskAgent,
  canComment,
  docComments,
  mentionCandidates,
  myName,
  putThread,
  setActive,
  setCommentUi,
  threadById,
  useCommentUi,
} from './store.ts';
import { commentLink, isOwn, reactedByMe } from './threads.ts';

const failed = (title: string) => (error: unknown) => {
  toast.add({ title, description: error instanceof Error ? error.message : String(error) });
};

const capability = () => maybeSession()?.comments ?? null;

/** The text as sent: trimmed, at most the longest a message may be. */
const bodyOf = (text: string) => text.trim().slice(0, COMMENT_TEXT_MAX);

/** Who a message is addressed to, from its @mentions. */
function addressees(text: string): string[] {
  const { threads } = docComments.store.getState();
  const { peers } = useCommentUi.getState();
  return mentionsIn(text, mentionCandidates(threads, peers, myName(), canAskAgent() ? { name: agentName() } : null));
}

/** Margin comments come back into view when a comment is started. */
function showMargin(): void {
  if (getDocs().comments === 'hidden') setDocs({ comments: 'margin' });
}

/** The words around a range: its paragraph, for the agent's context. */
function aroundText(state: EditorState, from: number, to: number): string {
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  if ($from.parent !== $to.parent || !$from.parent.isTextblock) return '';
  return $from.parent.textContent;
}

/** The most characters a thread hangs on; a longer selection keeps its beginning. */
const SELECTION_MAX = 4096;

/** Where a selection of more than {@link SELECTION_MAX} characters is cut, or `null` when it fits. */
function clampedEnd(state: EditorState, from: number, to: number): number | null {
  const units = textUnits(state.doc, from, to);
  let kept = 0;
  for (let index = 0; index < units.starts.length; index++) {
    if (units.starts[index] === -1) continue;
    if (kept === SELECTION_MAX) return unitRange(units, 0, index)?.to ?? null;
    kept += 1;
  }
  return null;
}

/** A composer for the words between two positions of the open tab (`null` when they have no words). */
function wordsComposer(view: EditorView, tab: string, from: number, until: number): Composer | null {
  const open = docClient().openTabOf(tab);
  if (!open) return null;
  const cut = clampedEnd(view.state, from, until);
  const to = cut ?? until;
  const range = idsOfRange(view.state.doc, open.binding.shadow, from, to);
  if (!range) return null;
  const words = view.state.doc.textBetween(from, to, '\n', ' ');
  const anchor: DocAnchor = { kind: 'words', tab, range, places: [] };
  return {
    anchor,
    label: quoteLabel(words),
    detail: quoteDetail(words, aroundText(view.state, from, to)),
    location: anchorLocation(anchor, blockIdAt(view.state.doc, from)),
    text: '',
    ...(cut !== null ? { clamped: true } : {}),
  };
}

/** A composer for the text block holding a position: on its words, or on the block itself while it has none. */
function blockComposer(view: EditorView, tab: string, pos: number): Composer | null {
  const $pos = view.state.doc.resolve(pos);
  const block = $pos.parent;
  if (!block.isTextblock) return null;
  const start = $pos.start();
  const end = $pos.end();
  if (block.content.size > 0) return wordsComposer(view, tab, start, end);
  const bid = block.attrs.bid as string | null;
  if (!bid) return null;
  const anchor: DocAnchor = { kind: 'block', tab, block: bid };
  return { anchor, label: 'Empty paragraph', location: anchorLocation(anchor, bid), text: '' };
}

/** A composer for a table cell. */
function cellComposer(view: EditorView, tab: string, selection: CellSelection): Composer | null {
  const cell = selection.$anchorCell.nodeAfter;
  const bid = cell?.attrs.bid as string | null | undefined;
  if (!cell || !bid) return null;
  const words = cell.textContent;
  const anchor: DocAnchor = { kind: 'cell', tab, cell: bid };
  return { anchor, label: words ? quoteLabel(words) : 'Table cell', detail: words ? quoteDetail(words, '') : 'An empty table cell', location: anchorLocation(anchor, bid), text: '' };
}

function openComposer(composer: Composer | null): boolean {
  if (!composer) {
    toast.add({ title: 'Couldn’t comment on this', description: 'Select some words, a table cell or a paragraph with text.' });
    return false;
  }
  showMargin();
  docComments.store.getState().setActive(null);
  setCommentUi({ composer, activePlace: null, editing: null });
  return true;
}

/** Waits until what was typed is in the model, so its words have ids; then the editor of `tab`, if still shown. */
async function settledView(): Promise<{ view: EditorView; tab: string } | null> {
  const tab = useEditor.getState().tab;
  if (!tab) return null;
  await docClient().settled();
  const view = currentView();
  if (!view || useEditor.getState().tab !== tab) return null;
  return { view, tab };
}

/** Whether the selection can take a comment: words, a cell. */
export function selectionCommentable(state: EditorState | null): boolean {
  if (!state || !canComment()) return false;
  if (state.selection instanceof CellSelection) return true;
  return !state.selection.empty;
}

/** A composer for the selection: its words, its first cell, or the paragraph of the caret. */
async function selectionComposer(): Promise<Composer | null | undefined> {
  if (!canComment()) return undefined;
  const found = await settledView();
  if (!found) return undefined;
  const { view, tab } = found;
  const { selection } = view.state;
  if (selection instanceof CellSelection) return cellComposer(view, tab, selection);
  if (selection.empty) return blockComposer(view, tab, selection.from);
  return wordsComposer(view, tab, selection.from, selection.to);
}

/** Starts a thread on the selection. */
export async function commentOnSelection(): Promise<boolean> {
  const composer = await selectionComposer();
  return composer === undefined ? false : openComposer(composer);
}

/** Starts a thread on a suggestion's words: a reply on its card. */
export async function commentOnSuggestion(target: SuggestionReplyTarget): Promise<boolean> {
  if (!canComment()) return false;
  const found = await settledView();
  if (!found || found.tab !== target.tab) return false;
  const { view, tab } = found;
  const ranges = suggestionRanges(view.state.doc, target.suggestId);
  const first = ranges[0];
  const last = ranges.at(-1);
  if (!first || !last) return openComposer(null);
  const from = first.block ? first.from + 1 : first.from;
  const to = last.block ? last.to - 1 : last.to;
  return openComposer(wordsComposer(view, tab, from, to) ?? blockComposer(view, tab, from));
}

/** Hands a thread to the agent when its newest message is addressed to it. */
async function handOver(thread: CommentThread, to: readonly string[]): Promise<void> {
  if (to.includes(AGENT_KEY) && canAskAgent()) await docComments.sendToAgent(thread.id);
}

/** Saves the composer's thread (or another new thread's); resolves whether it was saved. */
export async function createThread(text: string, composer: Composer | null = useCommentUi.getState().composer): Promise<boolean> {
  const comments = capability();
  const body = bodyOf(text);
  if (!comments || !composer || !body) return false;
  const to = addressees(body);
  try {
    const thread = await comments.create({
      anchor: docComments.adapter.serialize(composer.anchor),
      label: composer.label,
      ...(composer.detail ? { detail: composer.detail } : {}),
      location: composer.location,
      text: body,
      ...(to.length ? { to } : {}),
    });
    putThread(thread);
    if (useCommentUi.getState().composer === composer) setCommentUi({ composer: null });
    setActive(thread.id);
    await handOver(thread, to);
    return true;
  } catch (error) {
    failed('The comment could not be saved')(error);
    return false;
  }
}

/** Reacts to the selection: a thread whose only message is the emoji. */
export async function reactOnSelection(emoji: string): Promise<boolean> {
  const composer = await selectionComposer();
  if (!composer) {
    if (composer === null) openComposer(null);
    return false;
  }
  showMargin();
  return createThread(emoji, composer);
}

export async function reply(threadId: string, text: string): Promise<boolean> {
  const comments = capability();
  const body = bodyOf(text);
  if (!comments || !body) return false;
  const to = addressees(body);
  try {
    let thread = await comments.reply(threadId, body, to.length ? { to } : undefined);
    if (thread.status === 'resolved') thread = await comments.setResolved(threadId, false);
    putThread(thread);
    docComments.store.setState(state => {
      const { [threadId]: _sent, ...replies } = state.replies;
      return { replies };
    });
    await handOver(thread, to);
    return true;
  } catch (error) {
    failed('The reply could not be saved')(error);
    return false;
  }
}

export async function editMessage(threadId: string, messageId: string, text: string): Promise<boolean> {
  const comments = capability();
  const body = bodyOf(text);
  if (!comments || !body) return false;
  const to = addressees(body);
  try {
    const thread = await comments.edit(threadId, messageId, body, to.length ? { to } : undefined);
    putThread(thread);
    setCommentUi({ editing: null });
    if (thread.messages.at(-1)?.id === messageId) await handOver(thread, to);
    return true;
  } catch (error) {
    failed('The comment could not be changed')(error);
    return false;
  }
}

/** Adds the viewer's reaction to a message, or takes it back. */
export async function toggleReaction(threadId: string, messageId: string, emoji: string): Promise<void> {
  const comments = capability();
  const message = threadById(threadId)?.messages.find(item => item.id === messageId);
  if (!comments || !message || !canComment()) return;
  const mine = message.reactions?.some(reaction => reaction.emoji === emoji && reactedByMe(reaction, myName())) ?? false;
  try {
    putThread(await comments.react(threadId, messageId, emoji, !mine));
  } catch (error) {
    failed('The reaction could not be saved')(error);
  }
}

/** Deletes a whole thread (`messageId` left out) or one of its messages. */
export async function remove(threadId: string, messageId?: string): Promise<void> {
  const comments = capability();
  if (!comments) return;
  try {
    await comments.remove(threadId, messageId);
    if (!messageId) {
      docComments.store.setState(state => ({ threads: state.threads.filter(thread => thread.id !== threadId), active: state.active === threadId ? null : state.active }));
    } else {
      const thread = threadById(threadId);
      if (thread) putThread({ ...thread, messages: thread.messages.filter(message => message.id !== messageId) });
    }
  } catch (error) {
    failed('The comment could not be deleted')(error);
  }
}

export function resolve(threadId: string, resolved: boolean): Promise<void> {
  return docComments.resolve(threadId, resolved);
}

/**
 * A press on a reaction made on words: the viewer's own reaction is taken back (the thread goes, or is resolved when
 * they may not delete it, and stays while others joined in); anyone else's is joined or left.
 */
export async function pressReactionThread(thread: CommentThread, canDelete: boolean): Promise<void> {
  const root = thread.messages[0];
  if (!root || !canComment()) return;
  const emoji = root.text.trim();
  if (!isOwn(root.author, myName())) return toggleReaction(thread.id, root.id, emoji);
  const others = root.reactions?.find(reaction => reaction.emoji === emoji)?.authors.some(author => !isOwn(author, myName())) ?? false;
  if (others) {
    toast.add({ title: 'Others reacted too, so this stays. Resolve the thread to clear it.' });
    return;
  }
  if (canDelete) await remove(thread.id);
  else await resolve(thread.id, true);
}

export async function copyLink(thread: CommentThread): Promise<void> {
  const tab = docComments.anchorOf(thread).tab;
  try {
    await navigator.clipboard.writeText(commentLink(location.href, thread.id, tab));
    toast.add({ title: 'Link copied' });
  } catch {
    toast.add({ title: 'Couldn’t copy the link' });
  }
}

/** Takes a thread off one of its places: the words it was pasted onto, or its first words. */
export async function removePlace(thread: CommentThread, place: string | null): Promise<void> {
  const anchor = docComments.anchorOf(thread);
  const next = withoutPlace(anchor, place);
  if (next === anchor) return;
  await docComments.move(thread.id, next);
  setCommentUi({ activePlace: null });
  toast.add({ title: 'Comment removed from these words' });
}

function scrollElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-doc-scroll]');
}

/** Scrolls the open tab to a thread's words (a third of the way down the page). */
export function scrollToThread(id: string): boolean {
  const view = currentView();
  const scroller = scrollElement();
  if (!view || !scroller) return false;
  const range = rangesOf(view.state, id)[0];
  if (!range) return false;
  let top: number;
  try {
    top = view.coordsAtPos(Math.min(range.from + (range.kind === 'words' ? 0 : 1), view.state.doc.content.size)).top;
  } catch {
    return false;
  }
  const box = scroller.getBoundingClientRect();
  const target = top - box.top + scroller.scrollTop - scroller.clientHeight / 3;
  scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  return true;
}

/** Waits until the shown editor is `tab`'s and its marks are found (or a few seconds pass). */
function editorReady(tab: string): Promise<boolean> {
  const ready = () => useEditor.getState().tab === tab && !!useEditor.getState().view && useCommentUi.getState().placed.tab === tab;
  if (ready()) return Promise.resolve(true);
  return new Promise(resolveReady => {
    const stops: Array<() => void> = [];
    const done = (value: boolean) => {
      for (const stop of stops) stop();
      resolveReady(value);
    };
    const check = () => ready() && done(true);
    stops.push(useEditor.subscribe(check), useCommentUi.subscribe(check));
    const timer = setTimeout(() => done(false), 5000);
    stops.push(() => clearTimeout(timer));
  });
}

/** Opens a thread where it is: its tab shown, its words scrolled to, its card open. */
export async function revealThread(thread: CommentThread): Promise<void> {
  const tab = docComments.anchorOf(thread).tab;
  if (getDocs().comments === 'hidden') setDocs({ comments: 'margin' });
  if (tab && getDocs().project?.files.some(file => file.id === tab)) {
    showTab(tab);
    await editorReady(tab);
  }
  setActive(thread.id);
  // The card opened: the marks are drawn for it before the scroll measures them.
  requestAnimationFrame(() => requestAnimationFrame(() => scrollToThread(thread.id)));
}

/** Drops the composer's thread. */
export function cancelComposer(): void {
  setCommentUi({ composer: null });
  if (docComments.store.getState().active === NEW_THREAD) docComments.store.getState().setActive(null);
}
