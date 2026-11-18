import { connectHost, createShellBridge, type HostCapabilities, type RoleAbilities, type ShellBridge } from '@open-artifact/editor-kit';
import type {
  AgentCapability,
  AgentRequest,
  AgentStatus,
  Peer,
  RoomCapability,
  SheetCapability,
  SheetPerson,
  ShellConnection,
  Viewer,
} from '@open-artifact/runtime';
import { personId } from '@open-artifact/sheets-core/person-ids';
import { isNonNullObject } from '../utils/objects.ts';
import { setAgentName } from '../agent/agent-name.ts';
import { startPageComments, type PageComments } from '../comments/page-comments.ts';

export const SHEETS_CAPABILITIES = ['sheet', 'room', 'comments', 'downloads', 'agent'] as const;

export type SheetsCapabilityName = (typeof SHEETS_CAPABILITIES)[number];

export interface PeerOfRoom {
  peer: string;
  by: string;
  name: string;
  isMe: boolean;
  kind: 'viewer' | 'agent';
  presence: Record<string, unknown>;
}

export interface RoomPeersEvent {
  peers: PeerOfRoom[];
}

export type AgentSendState = 'available' | 'rejected';

export interface PageRoom {
  presence(patch: Record<string, unknown>): Promise<void>;
  onPeers(listener: (event: RoomPeersEvent) => void, onGone?: () => void): () => void;
  canSendToAgentSession(): Promise<AgentSendState>;
  sendToAgentSession(payload: unknown): Promise<void>;
}

export interface PersonProfile {
  id: string;
  name: string;
  avatarUrl: string;
  color: string | null;
  isMe: boolean;
}

export interface PageUser {
  me(): Promise<{ id: string; name: string }>;
  profiles(ids: readonly string[]): Promise<Record<string, PersonProfile>>;
  search(query: string): Promise<PersonProfile[]>;
}

export interface PageCapabilities {
  user: PageUser;
  room: PageRoom | null;
  comments: PageComments | null;
}

/** What the page asks for by name; anything else is not to be had. */
export interface PageApi {
  use<K extends keyof PageCapabilities>(name: K): Promise<PageCapabilities[K] | null>;
  use(name: string): Promise<null>;
}

export interface SheetsHost {
  caps: HostCapabilities<SheetsCapabilityName>;
  viewer: Viewer;
  abilities: RoleAbilities;
  shell: ShellConnection | null;
  bridge: ShellBridge;
  page: PageApi;
  agentStatus(): AgentStatus | null;
  onAgentStatus(listener: (status: AgentStatus) => void): () => void;
}

export const VIEWER_PRESENCE_KEY = 'person';

export const MAX_REQUEST_TEXT = 10_000;
export const MAX_REQUEST_LABEL = 1_000;
export const MAX_REQUEST_CONTEXT = 4_000;

export function agentRequestOf(payload: unknown): AgentRequest | null {
  if (!isNonNullObject(payload)) return null;
  const { label, request, ...rest } = payload as Record<string, unknown>;
  const asked = typeof request === 'string' ? request.trim() : '';
  const pressed = rest.pressed;
  const text =
    asked ||
    (typeof pressed === 'string' && pressed.trim() !== ''
      ? pressed.trim()
      : rest.isSheetBlank === true
        ? 'Fill this blank sheet.'
        : typeof rest.chartId === 'string'
          ? 'About this chart.'
          : typeof rest.ruleNumber === 'number'
            ? 'About this conditional formatting rule.'
            : typeof rest.range === 'string'
              ? 'About these cells.'
              : '');
  if (text === '') return null;
  let context: Record<string, unknown> = { ...rest };
  let contextText = JSON.stringify(context);
  while (contextText.length > MAX_REQUEST_CONTEXT && Array.isArray(context.errors) && context.errors.length > 0) {
    const leftOut = typeof context.errorsLeftOut === 'number' ? context.errorsLeftOut : 0;
    context = { ...context, errors: context.errors.slice(0, -1), errorsLeftOut: leftOut + 1 };
    contextText = JSON.stringify(context);
  }
  const title = typeof label === 'string' ? label.trim().slice(0, MAX_REQUEST_LABEL) : '';
  return {
    text: text.slice(0, MAX_REQUEST_TEXT),
    ...(title !== '' && { title }),
    ...(contextText.length <= MAX_REQUEST_CONTEXT && contextText !== '{}' && { context }),
  };
}

const personSaidByPeer = (peer: Peer): string | null => {
  const said = peer.state[VIEWER_PRESENCE_KEY];
  return typeof said === 'string' && said !== '' ? said : null;
};

const personOfPeer = (peer: Peer): string => personSaidByPeer(peer) ?? peer.id;

const colorOfPeer = (peer: Peer): string | null => {
  const who = peer.state.who;
  return isNonNullObject(who) && typeof who.color === 'string' ? who.color : null;
};

/** The engine's id for the viewer: the one the server makes their edits under. */
function viewerPersonId(sheet: SheetCapability | null, viewer: Viewer): Promise<string> {
  const fallback = personId(viewer.id);
  if (sheet === null) return Promise.resolve(fallback);
  return sheet.read({ kind: 'snapshot' }).then(
    (answer) => ('viewer' in answer ? answer.viewer.personId : fallback),
    () => fallback,
  );
}

function createPageRoom(room: RoomCapability, agent: AgentCapability | null, meAsked: Promise<string>, peersHeard: (peers: Peer[]) => void): PageRoom {
  let self: string | null = null;
  const selfAsked = room.self().then((id) => (self = id));
  void meAsked.then((me) => room.presence({ [VIEWER_PRESENCE_KEY]: me })).catch(() => {});
  const peerOfRoom = (peer: Peer): PeerOfRoom => ({
    peer: peer.id,
    by: personOfPeer(peer),
    name: peer.name,
    isMe: peer.id === self,
    kind: peer.kind === 'agent' ? 'agent' : 'viewer',
    presence: peer.state,
  });
  return {
    presence: (patch) => room.presence(patch),
    onPeers(listener) {
      let stopped = false;
      const hear = (peers: Peer[]): void => {
        if (stopped) return;
        peersHeard(peers);
        listener({ peers: peers.map(peerOfRoom) });
      };
      const stop = room.onPeers((peers) => void selfAsked.then(() => hear(peers), () => hear(peers)));
      void selfAsked.then(() => room.peers()).then(hear, () => {});
      return () => {
        stopped = true;
        stop();
      };
    },
    async canSendToAgentSession() {
      if (agent === null) return 'rejected';
      const status = await agent.status();
      return status.available ? 'available' : 'rejected';
    },
    async sendToAgentSession(payload) {
      const request = agentRequestOf(payload);
      if (agent === null || request === null) throw Object.assign(new Error('No agent takes requests from this page.'), { code: 'agent_unavailable' });
      const result = await agent.send(request);
      if (result.status === 'failed')
        throw Object.assign(new Error('The agent could not take the request.'), { code: 'agent_unavailable' });
    },
  };
}

/** The people the page names, by the engine's ids for them: the viewer, those here now, and those the server knows. */
function createPageUser(viewer: Viewer, meAsked: Promise<string>, peers: () => Peer[], sheet: SheetCapability | null): PageUser {
  const peopleNamed = async (): Promise<Map<string, SheetPerson>> => {
    const answer = sheet === null ? null : await sheet.read({ kind: 'people' }).catch(() => null);
    return new Map(answer !== null && 'people' in answer ? answer.people.map((person) => [person.personId, person]) : []);
  };
  const profileOf = (id: string, me: string, people: Map<string, SheetPerson>): PersonProfile => {
    const peer = peers().find((candidate) => personOfPeer(candidate) === id);
    const person = people.get(id);
    const isMe = id === me;
    const color = peer === undefined ? (person?.color ?? null) : colorOfPeer(peer);
    return { id, name: isMe ? viewer.name : (peer?.name ?? person?.name ?? id), avatarUrl: '', color, isMe };
  };
  return {
    me: async () => ({ id: await meAsked, name: viewer.name }),
    async profiles(ids) {
      const [me, people] = await Promise.all([meAsked, peopleNamed()]);
      return Object.fromEntries(ids.map((id) => [id, profileOf(id, me, people)]));
    },
    async search(query) {
      const wanted = query.trim().toLowerCase();
      const [me, people] = await Promise.all([meAsked, peopleNamed()]);
      const ids = new Set([me, ...peers().flatMap((peer) => (peer.kind === 'person' ? (personSaidByPeer(peer) ?? []) : [])), ...people.keys()]);
      return [...ids].map((id) => profileOf(id, me, people)).filter((profile) => profile.name.toLowerCase().includes(wanted));
    },
  };
}

export async function connectSheetsHost(): Promise<SheetsHost> {
  const { caps, viewer, abilities, shell } = await connectHost(SHEETS_CAPABILITIES);
  const bridge = createShellBridge(() => shell);
  let peersNow: Peer[] = [];
  const meAsked = viewerPersonId(caps.sheet, viewer);
  const user = createPageUser(viewer, meAsked, () => peersNow, caps.sheet);
  const room =
    caps.room === null
      ? null
      : createPageRoom(caps.room, caps.agent, meAsked, (peers) => {
          peersNow = peers;
        });
  const capabilities: PageCapabilities = { user, room, comments: null };
  const page: PageApi = {
    use: async (name: string) => (name in capabilities ? capabilities[name as keyof PageCapabilities] : null),
  } as PageApi;
  let status: AgentStatus | null = null;
  const statusListeners = new Set<(status: AgentStatus) => void>();
  const hearStatus = (next: AgentStatus): void => {
    status = next;
    setAgentName(next.name);
    for (const listener of statusListeners) listener(next);
  };
  if (caps.agent !== null) {
    caps.agent.onStatus(hearStatus);
    await caps.agent.status().then(hearStatus, () => {});
  }
  const onAgentStatus = (listener: (status: AgentStatus) => void): (() => void) => {
    statusListeners.add(listener);
    return () => void statusListeners.delete(listener);
  };
  if (caps.comments !== null)
    capabilities.comments = startPageComments({ capability: caps.comments, abilities, bridge, agentStatus: status, onAgentStatus, window });
  return {
    caps,
    viewer,
    abilities,
    shell,
    bridge,
    page,
    agentStatus: () => status,
    onAgentStatus,
  };
}
