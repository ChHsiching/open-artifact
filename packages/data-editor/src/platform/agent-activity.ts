/**
 * Whether the agent is working on this artifact, from the `agent`
 * capability's status: `unknown` until the host says, `working` while an
 * available agent is busy (a busy mark with no agent to do the work is not
 * work), `idle` once it has been quiet for {@link WORKING_GRACE_MS} (a short
 * pause between two steps is not the end of its work).
 */

import { create } from 'zustand';
import type { AgentCapability, AgentStatus } from '@open-artifact/runtime';
import { watchAgentStatus } from '@open-artifact/editor-kit';

export type AgentActivity = 'unknown' | 'working' | 'idle';

/** How long the agent must be quiet before it counts as idle. */
export const WORKING_GRACE_MS = 2000;

export interface AgentActivityState {
  activity: AgentActivity;
  /** An agent can receive requests. */
  available: boolean;
  /** Its display name. */
  name: string;
  /** `false`: an idle agent is not woken by a request (it waits until the person next talks to it). */
  wakesIdle: boolean;
}

export const useAgentActivity = create<AgentActivityState>()(() => ({ activity: 'unknown', available: false, name: 'Agent', wakesIdle: true }));

/** Follows the agent's status into {@link useAgentActivity}; returns a stop function. */
export function watchAgentActivity(agent: AgentCapability | null | undefined): () => void {
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const clearIdle = (): void => {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    idleTimer = undefined;
  };
  const stop = watchAgentStatus(agent, (status: AgentStatus) => {
    useAgentActivity.setState({ available: status.available, name: status.name, wakesIdle: status.wakesIdle !== false });
    if (status.busy && status.available) {
      clearIdle();
      useAgentActivity.setState({ activity: 'working' });
      return;
    }
    if (useAgentActivity.getState().activity !== 'working') {
      useAgentActivity.setState({ activity: 'idle' });
      return;
    }
    if (idleTimer === undefined) {
      idleTimer = setTimeout(() => {
        idleTimer = undefined;
        useAgentActivity.setState({ activity: 'idle' });
      }, WORKING_GRACE_MS);
    }
  });
  return () => {
    clearIdle();
    stop();
  };
}
