/** Derived values the Shell's components share. */

import type { ArtifactView } from '@open-artifact/protocol';
import { t } from '../lib/i18n.ts';
import { agentNameOf, canOpenSession, isWorking, ownerState, type OwnerState } from './model.ts';
import { useShell } from './store.ts';

/** What the Shell calls the agent: the host's name, else the boot's, else "Agent". */
export function useAgentName(): string {
  const host = useShell((state) => state.host);
  const boot = useShell((state) => state.boot);
  return agentNameOf(host, boot, t('agent'));
}

/** The artifact's title: the library's (it follows renames), else the boot's. */
export function useTitle(): string {
  return useShell((state) => state.artifact?.title || state.boot?.title || '');
}

/** The owner session, as the library reports it. */
export function useOwner(): ArtifactView['owner'] {
  return useShell((state) => state.artifact?.owner ?? null);
}

/** The agent is working. */
export function useWorking(): boolean {
  const owner = useOwner();
  const report = useShell((state) => state.report);
  return isWorking(owner, report);
}

/** The owner status chip's state. */
export function useOwnerState(): OwnerState {
  const owner = useOwner();
  const report = useShell((state) => state.report);
  return ownerState(owner, report);
}

/** The host can show the owner session. */
export function useCanOpenSession(): boolean {
  const host = useShell((state) => state.host);
  const owner = useOwner();
  return canOpenSession(host, owner);
}
