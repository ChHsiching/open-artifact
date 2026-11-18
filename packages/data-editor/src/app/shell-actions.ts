/**
 * The page's actions in the Shell's report (`actions`), which several parts
 * declare: sync's `save_now`, the edit tool's `edit_page` / `use_page`.
 * Each part sets its own list under a key; the report holds them all, in
 * the order the keys were first set. Also reports the agent's status.
 */

import { create } from 'zustand';
import type { ChromeReport } from '@open-artifact/runtime';
import { agentChrome } from '@open-artifact/editor-kit';
import { useAgentActivity } from '../platform/agent-activity.ts';
import { setShellReport } from '../services/shell.ts';
import { useDocument } from '../state/document.ts';

export type ChromeAction = NonNullable<ChromeReport['actions']>[number];

/** The Shell lists at most this many actions. */
export const MAX_CHROME_ACTIONS = 18;

export const useChromeActions = create<{ parts: ReadonlyMap<string, readonly ChromeAction[]> }>()(() => ({ parts: new Map() }));

/** Sets the actions one part declares (`null` or none: it declares nothing). */
export function setChromeActions(part: string, actions: readonly ChromeAction[] | null): void {
  const parts = new Map(useChromeActions.getState().parts);
  if (actions === null || actions.length === 0) {
    if (!parts.has(part)) return;
    parts.delete(part);
  } else parts.set(part, actions);
  useChromeActions.setState({ parts });
}

/** Every part's actions, first declared first, each id once. */
export function mergeChromeActions(parts: ReadonlyMap<string, readonly ChromeAction[]>): ChromeAction[] {
  const seen = new Set<string>();
  const out: ChromeAction[] = [];
  for (const actions of parts.values())
    for (const action of actions) {
      if (seen.has(action.id) || out.length >= MAX_CHROME_ACTIONS) continue;
      seen.add(action.id);
      out.push(action);
    }
  return out;
}

/** `save_now`: offered while changes wait to be stored. */
export function saveNowAction(pending: number): ChromeAction {
  return pending > 0 ? { id: 'save_now' } : { id: 'save_now', disabled: true };
}

/** Reports the actions and the agent's status to the Shell as they change. Returns a stop function. */
export function startChromeActions(): () => void {
  const reportActions = (): void => {
    const actions = mergeChromeActions(useChromeActions.getState().parts);
    setShellReport({ actions: actions.length === 0 ? undefined : actions });
  };
  const reportAgent = (): void => {
    const { available, activity } = useAgentActivity.getState();
    setShellReport({ agent: agentChrome({ available, busy: activity === 'working' }) });
  };
  const declareSave = (): void => setChromeActions('sync', useDocument.getState().canWrite ? [saveNowAction(useDocument.getState().pending)] : null);
  const stops = [
    useChromeActions.subscribe(reportActions),
    useAgentActivity.subscribe(reportAgent),
    useDocument.subscribe((state, previous) => {
      if (state.pending !== previous.pending || state.canWrite !== previous.canWrite) declareSave();
    }),
  ];
  declareSave();
  reportActions();
  reportAgent();
  return () => {
    for (const stop of stops) stop();
    setChromeActions('sync', null);
    setShellReport({ actions: undefined, agent: undefined });
  };
}
