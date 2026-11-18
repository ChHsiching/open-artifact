/**
 * The page's connection to its host. Only `doc` is required: without
 * `comments`, `assets`, `agent`, `room` or `downloads` the matching features
 * are hidden.
 */
import type {
  AgentCapability,
  AssetsCapability,
  CommentsCapability,
  DocCapability,
  DownloadsCapability,
  RoomCapability,
  ShellConnection,
  Viewer,
} from '@open-artifact/runtime';
import { connectHost, sessionSlot, type RoleAbilities } from '@open-artifact/editor-kit';

export interface Session extends RoleAbilities {
  doc: DocCapability;
  comments: CommentsCapability | null;
  assets: AssetsCapability | null;
  agent: AgentCapability | null;
  room: RoomCapability | null;
  downloads: DownloadsCapability | null;
  viewer: Viewer;
  peerId: string;
  shell: ShellConnection | null;
}

const slot = sessionSlot<Session>();

export const session = slot.session;
export const maybeSession = slot.maybeSession;

export async function startSession(): Promise<Session> {
  const { caps, viewer, abilities, shell } = await connectHost(['doc', 'comments', 'assets', 'agent', 'room', 'downloads']);
  const { doc, comments, assets, agent, room, downloads } = caps;
  if (!doc) throw new Error('This page could not reach its doc. Open it again from your agent.');
  const peerId = (await room?.self().catch(() => null)) ?? viewer.id;
  return slot.set({ doc, comments, assets, agent, room, downloads: abilities.canSaveToHost ? downloads : null, viewer, peerId, ...abilities, shell });
}
