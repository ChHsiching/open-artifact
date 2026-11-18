/**
 * The page's connection to its host: installs `window.openartifact` (unless
 * a host already did) and resolves every capability the data page uses.
 *
 * Only `db` is required: the page is its document store. Without `mcp` the
 * connector datasets cannot load; without `agent`, `comments`, `room`,
 * `history` or `downloads` the matching features are hidden.
 */

import type {
  AgentCapability,
  AssetsCapability,
  CommentsCapability,
  DbCapability,
  DownloadsCapability,
  HistoryCapability,
  McpCapability,
  RoomCapability,
  ShellConnection,
  Viewer,
} from '@open-artifact/runtime';
import { connectHost, sessionSlot, type RoleAbilities } from '@open-artifact/editor-kit';

/** Everything the page talks to. Missing capabilities are `null`. */
export interface Session extends RoleAbilities {
  db: DbCapability;
  mcp: McpCapability | null;
  comments: CommentsCapability | null;
  assets: AssetsCapability | null;
  agent: AgentCapability | null;
  room: RoomCapability | null;
  downloads: DownloadsCapability | null;
  history: HistoryCapability | null;
  viewer: Viewer;
  peerId: string;
  shell: ShellConnection | null;
}

const slot = sessionSlot<Session>();

/** The session; throws before {@link startSession} resolved. */
export const session = slot.session;

/** The session, or `null` before it started. */
export const maybeSession = slot.maybeSession;

/** Connects to the host. Rejects when the document store is unavailable. */
export async function startSession(): Promise<Session> {
  const { caps, viewer, abilities, shell } = await connectHost(['db', 'mcp', 'comments', 'assets', 'agent', 'room', 'downloads', 'history']);
  const { db, mcp, comments, assets, agent, room, downloads, history } = caps;
  if (!db) throw new Error('This page could not reach its document store. Open it again from your agent.');
  const peerId = (await room?.self().catch(() => null)) ?? viewer.id;
  return slot.set({ db, mcp, comments, assets, agent, room, downloads: abilities.canSaveToHost ? downloads : null, history, viewer, peerId, ...abilities, shell });
}
