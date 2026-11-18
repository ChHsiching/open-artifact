/**
 * Hand-edit mode around the page editor: the pencil, the edit bar's Save,
 * Cancel, Undo and Redo, the dialogs (make editable, discard, save before
 * asking), and saving the edited page.
 *
 * The page editor registers a {@link PageEditSession}; Save hands its HTML
 * to {@link saveEditedPage}, which reads the stored page fresh first. When
 * someone else saved the page since the edit began, the save stops and a
 * notice says so; the next Save overwrites that change (the history keeps
 * it), Cancel shows it.
 */

import { create } from 'zustand';
import { announce } from '@open-artifact/editor-kit';
import { documentSha256 } from '@open-artifact/live-store/doc-hash';
import { toast } from '@open-artifact/ui';
import { DASHBOARD_ENTRY_FILENAME, DASHBOARD_ENTRY_PATH } from '@open-artifact/data-core';
import { useAgentActivity } from '../platform/agent-activity.ts';
import { maybeSession } from '../services/session.ts';
import { useDocument } from '../state/document.ts';
import { getShownInputs, isPencilFree, setEditingShown } from '../state/shown.ts';
import { holdLeaveLosesWork, writeFile } from '../sync/index.ts';
import { EDIT_OFF, changedElsewhere, reduceEditState, type EditAnswer, type EditDialogKind, type EditEvent, type EditState } from './edit-state.ts';
import { sendPageRequest } from './request.ts';
import { STATUS_MS } from './draft-state.ts';
import {
  CANCEL_AND_ASK_MESSAGE,
  CHANGES_DISCARDED_LABEL,
  EDIT_ACCESS_LOST_MESSAGE,
  EDIT_BEHIND_MESSAGE,
  EDIT_WAITING_MESSAGE,
  MAKE_EDITABLE_REQUEST,
  NOTHING_TO_REDO_LABEL,
  NOTHING_TO_UNDO_LABEL,
  READY_TO_EDIT_LABEL,
  SAVE_FAILED_MESSAGE,
  SAVED_LABEL,
  TRY_AGAIN_LABEL,
  describeUneditablePage,
} from './words.ts';

export type { EditAnswer, EditDialogKind, EditState } from './edit-state.ts';

/** The page editor's side of an edit, registered while edit mode is on. */
export interface PageEditSession {
  /** The page's HTML as edited now. */
  text(): string;
  /** Unsaved changes. */
  count(): number;
  /** Puts the page back as stored. */
  revert(): void;
  /** False when `html` would not read back as the same page once stored. */
  readsBack?(html: string): boolean;
  canUndo?(): boolean;
  canRedo?(): boolean;
  /** Undoes one step; returns what it undid ("typing"…), or `null` when nothing was. */
  undo?(): string | null;
  redo?(): string | null;
  /** Calls `listener` after each change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export type SaveOutcome = 'saved' | 'unchanged' | 'behind' | 'readonly' | 'failed';

export interface EditFlowState extends EditState {
  count: number;
  canUndo: boolean;
  canRedo: boolean;
  /** A short status line ("Saved", "Changes discarded"), cleared after a few seconds. */
  status: string | null;
  /** The agent was asked to make the page editable: `asked`, then `working` once it started. */
  converting: 'asked' | 'working' | null;
  /** The stored page changed since the edit began; the behind notice shows. */
  behind: boolean;
}

export const useEditFlow = create<EditFlowState>()(() => ({
  ...EDIT_OFF,
  count: 0,
  canUndo: false,
  canRedo: false,
  status: null,
  converting: null,
  behind: false,
}));

/** How long a save waits for the dashboard to show the saved page, ms. */
export const EDIT_ECHO_MS = 5000;

let current: PageEditSession | null = null;
let unsubscribe: () => void = () => {};
/** The stored page when the edit began, and the text this edit last saved. */
let base: string | null = null;
let saved: string | null = null;
/** The text whose save stopped because the stored page had changed. */
let stopped: string | null = null;
/** Changes the session made, and how many it had made when a save stopped (the behind notice shows until the next). */
let changes = 0;
let stoppedAt = -1;
let editableCheck: () => boolean = () => true;
let misparsed = false;
let afterAsk: () => void = () => {};
let releaseLeave: (() => void) | null = null;
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let behindToast: string | null = null;

/** The stored entry page's text, or `null` without one. */
export function storedEntryText(): string | null {
  return useDocument.getState().content.files.find((file) => file.name === DASHBOARD_ENTRY_FILENAME)?.text ?? null;
}

function dispatch(event: EditEvent): EditState {
  const was = useEditFlow.getState();
  const next = reduceEditState({ phase: was.phase, dialog: was.dialog }, event);
  if (next.phase !== was.phase || next.dialog !== was.dialog) useEditFlow.setState(next);
  setEditingShown(next.phase !== 'off');
  if (next.phase === 'off') {
    stopped = null;
    refreshBehind();
  }
  return next;
}

function say(words: string | null): void {
  if (statusTimer !== undefined) clearTimeout(statusTimer);
  statusTimer = undefined;
  useEditFlow.setState({ status: words });
  if (words === null) return;
  announce(words);
  statusTimer = setTimeout(() => useEditFlow.setState({ status: null }), STATUS_MS);
}

function failToast(reason: string): void {
  toast.add({ title: `${SAVE_FAILED_MESSAGE} ${reason}`, timeout: 10_000 });
}

function refreshBehind(): void {
  const state = useEditFlow.getState();
  const behind =
    state.count > 0 && state.phase === 'editing' && (changedElsewhere(storedEntryText(), base, saved) || (stopped !== null && stoppedAt === changes));
  if (behind !== state.behind) useEditFlow.setState({ behind });
  if (behind && behindToast === null) behindToast = toast.add({ title: EDIT_BEHIND_MESSAGE, timeout: 0 });
  else if (!behind && behindToast !== null) {
    toast.close(behindToast);
    behindToast = null;
  }
}

function readSession(): void {
  const count = current?.count() ?? 0;
  useEditFlow.setState({ count, canUndo: current?.canUndo?.() ?? false, canRedo: current?.canRedo?.() ?? false });
  if (count > 0 && releaseLeave === null) releaseLeave = holdLeaveLosesWork();
  else if (count === 0 && releaseLeave !== null) {
    releaseLeave();
    releaseLeave = null;
  }
  refreshBehind();
}

/** The page editor starts (or with `null`, ends) its side of the edit. */
export function registerPageEditSession(session: PageEditSession | null): void {
  unsubscribe();
  current = session;
  unsubscribe =
    session === null
      ? () => {}
      : session.subscribe(() => {
          changes += 1;
          if (useEditFlow.getState().status !== null) say(null);
          readSession();
        });
  readSession();
  if (session === null && useEditFlow.getState().phase === 'editing') dispatch({ type: 'leave', dirty: false });
}

/**
 * The pencil: turns edit mode on, or asks to have the agent make the page
 * editable when `editable` says it can't be edited by hand (`misparsed`:
 * its HTML does not read back the same).
 */
export function startPageEdit(options: { editable: () => boolean; misparsed?: boolean }): void {
  editableCheck = options.editable;
  misparsed = options.misparsed ?? false;
  say(null);
  useEditFlow.setState({ converting: null });
  base = storedEntryText();
  saved = null;
  stopped = null;
  dispatch({ type: 'pencil', editable: options.editable() });
}

/** Leaves edit mode when nothing is unsaved. */
export function leavePageEdit(): void {
  dispatch({ type: 'leave', dirty: useEditFlow.getState().count > 0 });
}

/** The bar's Cancel: asks before discarding unsaved changes. */
export function cancelPageEdits(): void {
  dispatch({ type: 'cancel', dirty: useEditFlow.getState().count > 0 });
}

/** The bar's Save. */
export function savePageEdits(): Promise<SaveOutcome> {
  return current === null ? Promise.resolve('failed') : saveEditedPage(current.text());
}

function waitForEntry(text: string): Promise<void> {
  return new Promise((resolve) => {
    let stop = (): void => {};
    const timer = setTimeout(() => done(), EDIT_ECHO_MS);
    const done = (): void => {
      clearTimeout(timer);
      stop();
      resolve();
    };
    if (storedEntryText() === text) return done();
    stop = useDocument.subscribe(() => {
      if (storedEntryText() === text) done();
    });
  });
}

function errorCode(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : 'unavailable';
}

function stopBehind(html: string): SaveOutcome {
  stopped = html;
  stoppedAt = changes;
  dispatch({ type: 'failed' });
  refreshBehind();
  return 'behind';
}

/**
 * Saves the edited page. Reads the stored page first: when someone else
 * changed it since the edit began, the save stops (`behind`) unless the
 * behind notice already showed, or `beforeAsk` (the save before asking the
 * agent) says to go on.
 */
export async function saveEditedPage(html: string, options: { beforeAsk?: boolean } = {}): Promise<SaveOutcome> {
  const state = useEditFlow.getState();
  if (state.phase !== 'editing' || state.dialog !== null) return 'failed';
  if (current?.readsBack?.(html) === false) {
    failToast(CANCEL_AND_ASK_MESSAGE);
    return 'failed';
  }
  if (html === storedEntryText()) {
    dispatch({ type: 'save' });
    dispatch({ type: 'saved' });
    say(SAVED_LABEL);
    return 'unchanged';
  }
  const doc = useDocument.getState();
  if (!doc.canWrite) {
    failToast(doc.readOnlyReason ?? TRY_AGAIN_LABEL);
    return 'readonly';
  }
  const mayReplace = state.behind || options.beforeAsk === true;
  dispatch({ type: 'save' });
  try {
    const db = maybeSession()?.db;
    if (db === undefined) throw Object.assign(new Error('no store'), { code: 'unavailable' });
    const record = await db.get(DASHBOARD_ENTRY_PATH);
    const fresh = record === null ? null : typeof record.text === 'string' ? record.text : '';
    const replaces = record === null ? base !== null : changedElsewhere(fresh, base, saved);
    if (replaces && !mayReplace) return stopBehind(html);
    await writeFile(DASHBOARD_ENTRY_FILENAME, html, { ifMatch: record === null ? null : documentSha256(record) });
    saved = html;
    stopped = null;
    await waitForEntry(html);
    dispatch({ type: 'saved' });
    say(SAVED_LABEL);
    return 'saved';
  } catch (error) {
    const code = errorCode(error);
    if (code === 'conflict' && !mayReplace) return stopBehind(html);
    dispatch({ type: 'failed' });
    failToast(
      code === 'not_writer' || code === 'not_granted' || code === 'readonly'
        ? EDIT_ACCESS_LOST_MESSAGE
        : code === 'unavailable' || code === 'resource_exhausted' || code === 'conflict'
          ? TRY_AGAIN_LABEL
          : CANCEL_AND_ASK_MESSAGE,
    );
    return 'failed';
  }
}

/**
 * Asks the agent once unsaved hand edits are dealt with: with none, `send`
 * runs now; otherwise "Save your changes first?" opens and `send` runs after
 * Save and ask (once saved) or Discard and ask.
 */
export function askWithEdits(send: () => void): void {
  afterAsk = send;
  if (dispatch({ type: 'ask', dirty: useEditFlow.getState().count > 0 }).dialog === null) send();
}

/** Answers the open dialog. */
export function answerEdit(choice: EditAnswer): void {
  const was = useEditFlow.getState();
  const dialog = was.dialog;
  const next = dispatch({ type: 'answer', choice });
  if ((next.phase === was.phase && next.dialog === was.dialog) || choice === 'stay' || dialog === null) return;
  if (dialog === 'convert') {
    useEditFlow.setState({ converting: 'asked' });
    void sendPageRequest({ title: 'Make editable', request: MAKE_EDITABLE_REQUEST, selection: describeUneditablePage(misparsed) }).then((handed) => {
      if (!handed) useEditFlow.setState({ converting: null });
    });
    return;
  }
  if (dialog === 'ask' && choice === 'confirm') {
    const send = afterAsk;
    void savePageEdits().then((outcome) => {
      if (outcome === 'saved' || outcome === 'unchanged') send();
    });
    return;
  }
  current?.revert();
  if (dialog === 'ask') afterAsk();
  say(CHANGES_DISCARDED_LABEL);
}

function step(forward: boolean): void {
  if (current === null || useEditFlow.getState().phase !== 'editing') return;
  const could = forward ? (current.canRedo?.() ?? false) : (current.canUndo?.() ?? false);
  const verb = forward ? (current.redo?.() ?? null) : (current.undo?.() ?? null);
  if (verb === null) {
    if (!could) say(forward ? NOTHING_TO_REDO_LABEL : NOTHING_TO_UNDO_LABEL);
    return;
  }
  say(`${forward ? 'Redid' : 'Undid'} ${verb}`);
}

export function undoPageEdit(): void {
  step(false);
}

export function redoPageEdit(): void {
  step(true);
}

/** Follows the stored page and the agent (for the behind notice and "Ready to edit"). Returns a stop function. */
export function startEditFlow(): () => void {
  const stops = [
    useDocument.subscribe((state, previous) => {
      if (state.content !== previous.content) refreshBehind();
    }),
    useAgentActivity.subscribe((state, previous) => {
      const { converting } = useEditFlow.getState();
      if (converting === 'asked' && state.activity === 'working') {
        useEditFlow.setState({ converting: 'working' });
        announce(EDIT_WAITING_MESSAGE);
      } else if (converting === 'working' && previous.activity === 'working' && state.activity !== 'working') {
        useEditFlow.setState({ converting: null });
        if (!isPencilFree(getShownInputs()) || !editableCheck()) return;
        startPageEdit({ editable: editableCheck });
        say(READY_TO_EDIT_LABEL);
      }
    }),
  ];
  return () => {
    for (const stop of stops) stop();
    if (statusTimer !== undefined) clearTimeout(statusTimer);
    if (behindToast !== null) toast.close(behindToast);
    behindToast = null;
    releaseLeave?.();
    releaseLeave = null;
  };
}
