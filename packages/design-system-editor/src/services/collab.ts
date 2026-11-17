/**
 * Collaboration glue, the counterpart of the Design editor's
 * `services/collab.ts`: starts comments, version history and presence, and
 * connects them to the Shell (its Comment and History buttons) and to the
 * keyboard (Esc leaves comment mode).
 */

import { collabAside, createCollab } from '@open-artifact/editor-kit';
import { useFiles } from '../state/files.ts';
import { canComment, startComments, useComments } from './comments.ts';
import { startHistory, toggleHistory, useHistory } from './history.ts';
import { startCollabPresence } from './presence.ts';

let started = false;

/** Starts comments, history and presence. Runs once, after the system loaded. */
export function startCollab(): void {
  if (started) return;
  started = true;
  void startComments();
  startHistory();
  void startCollabPresence().catch(() => undefined);
}

/**
 * The shared glue (`createCollab`, `@open-artifact/editor-kit`) over the
 * comments controller's store and this editor's history store. This editor
 * keeps its own shortcut handler ({@link runCollabShortcut}).
 */
const collab = createCollab({
  comments: { store: useComments, canComment },
  history: { store: useHistory, toggle: toggleHistory },
  adapter: { onSurface: () => true, readOnly: () => useFiles.getState().readOnly },
});

/** What the Shell draws for comments and history. */
export const collabChromeReport = collab.chromeReport;

/** Calls `report` whenever {@link collabChromeReport} may have changed. */
export const subscribeCollab = collab.subscribe;

/** Runs a Shell command that belongs to comments or history; returns whether it did. */
export const handleCollabCommand = collab.handleCommand;

/** The right-hand panel collaboration owns, if one is open. */
export { collabAside };

/** Opens or closes the comment list (closing the history panel). */
export const toggleCommentList = collab.toggleCommentList;

/** Opens or closes the history panel (closing the comment list). */
export const toggleHistoryPanel = collab.toggleHistoryPanel;

/** Esc leaves comment mode (after dropping a draft or closing a thread). Returns whether the key was taken. */
export function runCollabShortcut(press: { key: string }): boolean {
  const comments = useComments.getState();
  if (!comments.available || press.key !== 'Escape') return false;
  if (comments.draft) comments.setDraft(null);
  else if (comments.active) comments.setActive(null);
  else if (comments.on) comments.setOn(false);
  else return false;
  return true;
}
