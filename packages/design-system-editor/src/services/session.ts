/**
 * The page's connection to its host: installs `window.openartifact` (unless
 * a host already did) and resolves the capabilities the editor uses.
 */

import type {
  AgentCapability,
  ArtifactCapability,
  AssetsCapability,
  CommentsCapability,
  DownloadsCapability,
  HistoryCapability,
  RoomCapability,
  ShellConnection,
  Viewer,
} from '@open-artifact/runtime';
import { connectHost, sessionSlot } from '@open-artifact/editor-kit';

export { artifactPath, projectPath } from '@open-artifact/editor-kit';

/** Everything the editor talks to. Missing capabilities are `null`. */
export interface Session {
  artifact: ArtifactCapability;
  assets: AssetsCapability | null;
  agent: AgentCapability | null;
  room: RoomCapability | null;
  downloads: DownloadsCapability | null;
  comments: CommentsCapability | null;
  history: HistoryCapability | null;
  viewer: Viewer;
  canEdit: boolean;
  /** Only the owner sends requests to the agent (comments included) and saves downloads on this computer. */
  isOwner: boolean;
  /** The Open Artifact Shell framing this page, if any. */
  shell: ShellConnection | null;
}

const slot = sessionSlot<Session>();

/** The session, or `null` before it started (components that render early). */
export const maybeSession = slot.maybeSession;

/** The session; throws before {@link startSession} resolved. */
export const session = slot.session;

/** Connects to the host. Rejects when the artifact capability is unavailable. */
export async function startSession(): Promise<Session> {
  const { caps, viewer, abilities, shell } = await connectHost(['artifact', 'assets', 'agent', 'room', 'downloads', 'comments', 'history']);
  const { artifact, ...rest } = caps;
  if (!artifact) throw new Error('This page could not reach its artifact. Open it again from your agent.');
  // The owner alone may ask the agent and save on the sharing computer.
  return slot.set({ artifact, ...rest, viewer, canEdit: abilities.canEdit, isOwner: abilities.canAsk && abilities.canSaveToHost, shell });
}
