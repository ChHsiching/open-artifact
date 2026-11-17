/**
 * Display strings for what the page reports: its actions' names and why an
 * action or export format is disabled.
 */

import type { ChromeAction, ChromeWhy } from '@open-artifact/protocol';
import { t, type MessageKey } from '../lib/i18n.ts';
import { humanize } from './model.ts';

const ACTION_NAME: Record<string, MessageKey> = {
  save_now: 'actionSaveNow',
  open_find: 'actionOpenFind',
  undo: 'actionUndo',
  redo: 'actionRedo',
  edit_page: 'actionEditPage',
  use_page: 'actionUsePage',
  comment_selection: 'actionCommentSelection',
  open_page_list: 'actionOpenPageList',
  hand_off_code: 'actionHandOffCode',
};

const WHY_TEXT: Record<ChromeWhy, MessageKey> = {
  older_version: 'whyOlderVersion',
  agent_working: 'whyAgentWorking',
  draft_open: 'whyDraftOpen',
  comments_on: 'whyCommentsOn',
  needs_agent: 'whyNeedsAgent',
  unsaved: 'whyUnsaved',
  other: 'whyOther',
};

/** A page action's name: the Shell's own for built-in ids, else the page's label, else the id. */
export function actionLabel(action: ChromeAction): string {
  const key = ACTION_NAME[action.id];
  return key ? t(key) : (action.label ?? humanize(action.id));
}

/** Why an action or format is disabled, for its tooltip. */
export function whyText(why: ChromeWhy | undefined, agent: string): string | undefined {
  return why ? t(WHY_TEXT[why], { agent }) : undefined;
}
