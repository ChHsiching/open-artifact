import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentCapability, AgentStatus } from '@open-artifact/runtime';
import { useAgentActivity, watchAgentActivity } from '../src/platform/agent-activity.ts';

function fakeAgent(): { agent: AgentCapability; push: (status: AgentStatus) => void } {
  const listeners = new Set<(status: AgentStatus) => void>();
  const agent = {
    status: () => new Promise<AgentStatus>(() => undefined),
    onStatus: (listener: (status: AgentStatus) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as AgentCapability;
  return { agent, push: (status) => listeners.forEach((listener) => listener(status)) };
}

test('a busy mark with no available agent is not work', () => {
  useAgentActivity.setState({ activity: 'unknown' });
  const { agent, push } = fakeAgent();
  const stop = watchAgentActivity(agent);
  push({ available: false, busy: true, name: 'Agent' });
  assert.equal(useAgentActivity.getState().activity, 'idle');
  push({ available: true, busy: true, name: 'Agent' });
  assert.equal(useAgentActivity.getState().activity, 'working');
  stop();
});
