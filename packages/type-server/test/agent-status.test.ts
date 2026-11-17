import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TypeApi } from '@open-artifact/server-sdk';
import { agentStatus } from '../src/agent.ts';

test("agent status: the daemon's name for the agent, and whether an idle one is woken", async () => {
  const root = await mkdtemp(join(tmpdir(), 'oa-agent-status-'));
  let asked = 0;
  const daemon = {
    presence: async (id: string) => {
      asked++;
      return id === 'art_cursor'
        ? { presence: 'offline', canSend: true, canSendSession: true, busy: false, agentName: 'Cursor', wakesIdle: false }
        : { presence: 'offline', canSend: true, canSendSession: true, busy: false, agentName: 'Codex', wakesIdle: true };
    },
  } as unknown as TypeApi;
  assert.deepEqual(await agentStatus(root, daemon, false, 'art_cursor'), { available: true, busy: false, name: 'Cursor', wakesIdle: false });
  assert.deepEqual(await agentStatus(root, daemon, true, 'art_codex'), { available: true, busy: true, name: 'Codex' });
  await agentStatus(root, daemon, false, 'art_cursor');
  assert.equal(asked, 2, 'kept for a few seconds, not asked on every refresh');

  const failing = { presence: async () => Promise.reject(new Error('down')) } as unknown as TypeApi;
  assert.deepEqual(await agentStatus(root, failing, false, 'art_gone'), { available: true, busy: false, name: 'Agent' });
  assert.deepEqual(await agentStatus(root, null, false), { available: false, busy: false, name: 'Agent' });
});
