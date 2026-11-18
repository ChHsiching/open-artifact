import type { Dynamic } from '../dynamic.ts';
import type { PageApi } from '../host/sheets-host.ts';
import { SHEETS_NEVER_GIVEN_COLORS } from './colors.ts';
import { isNonNullObject } from '../utils/objects.ts';
import { createPeerColorKeeper, normalizePeerColor, type PeerColorClaim } from '@open-artifact/editor-kit';
import { reportErrorSoftly } from '../engine/loader.ts';
import { isViewId } from '../agent/view-context.ts';
export function readOwnColor(storage?: Dynamic) {
  try {
    let color = storage().getItem(OWN_COLOR_STORAGE_KEY);
    return color === null || SHEETS_NEVER_GIVEN_COLORS.includes(color.toLowerCase()) ? null : color;
  } catch {
    return null;
  }
}
export function claimedColorOfPresence(presence?: Dynamic) {
  let who = presence[PRESENCE_WHO_KEY];
  return isNonNullObject(who) && typeof who.c === 'string' ? who.c : null;
}
export function peerOfRoom(peer?: Dynamic) {
  if (!isNonNullObject(peer)) return [];
  let { peer: peerId, by: by, isMe: isMe, sameTab: sameTab, kind: kind, presence: presence } = peer;
  if (typeof peerId !== 'string' || typeof by !== 'string' || kind !== 'viewer') return [];
  return [
    {
      peer: peerId,
      by: by,
      isMe: isMe === true,
      sameTab: sameTab === true,
      presence: isNonNullObject(presence) ? presence : {},
    },
  ];
}
interface RoomPeer {
  peer: string;
  by: string;
  isMe: boolean;
  sameTab: boolean;
  agent?: boolean;
  presence: Record<string, unknown>;
}

interface ColorRoom {
  peers?: () => unknown;
  onConnection?: (onChange: (connected: boolean) => void, onClose: () => void) => void;
}

export interface PeerColorKeeping {
  roomChanged(): void;
  dispose(): void;
}

function colorClaimOf(peer: RoomPeer): PeerColorClaim | undefined {
  const who = peer.presence[PRESENCE_WHO_KEY];
  if (!isNonNullObject(who)) return undefined;
  const color = normalizePeerColor((who as { c?: unknown }).c);
  const at = (who as { t?: unknown }).t;
  return color !== undefined && typeof at === 'number' && Number.isFinite(at)
    ? { key: peer.by, peer: peer.peer, own: peer.isMe, c: color, t: at }
    : undefined;
}

export function startPeerColorKeeper(
  room: ColorRoom,
  me: { userId: string; usualColor: string },
  publish: (claim: Record<string, unknown>) => void,
  storage: () => Storage,
): PeerColorKeeping | null {
  const { peers, onConnection } = room;
  if (typeof peers !== 'function') return null;
  const roomPeers = (): RoomPeer[] => {
    const listed = peers.call(room);
    return Array.isArray(listed) ? (listed.flatMap(peerOfRoom) as RoomPeer[]) : [];
  };
  let published: Record<string, unknown> = {};
  const keeper = createPeerColorKeeper({
    id: me.userId,
    peer: roomPeers().find((peer) => peer.sameTab)?.peer ?? '',
    neverGiven: SHEETS_NEVER_GIVEN_COLORS,
    publish(claim) {
      const entries = Object.entries({ ...published, ...claim });
      published = Object.fromEntries(entries.filter(([, value]) => value !== null));
      publish(published);
    },
    claims: () =>
      roomPeers().flatMap((peer) => (peer.sameTab || peer.agent === true ? [] : (colorClaimOf(peer) ?? []))),
    kept: {
      read: () => readOwnColor(storage) ?? (normalizePeerColor(me.usualColor) ?? null),
      write(color) {
        try {
          storage().setItem(OWN_COLOR_STORAGE_KEY, color);
        } catch {}
      },
    },
    now: Date.now,
    after(run, ms) {
      const timer = setTimeout(guardCallback(run), ms);
      return () => clearTimeout(timer);
    },
    every(run, ms) {
      const timer = setInterval(guardCallback(run), ms);
      return () => clearInterval(timer);
    },
  });
  let isDisposed = false;
  const dispose = (): void => {
    isDisposed = true;
    keeper.dispose();
  };
  try {
    if (typeof onConnection !== 'function') keeper.here();
    else
      onConnection.call(
        room,
        guardCallback((connected: boolean) => (connected ? keeper.here() : keeper.away())),
        guardCallback(dispose),
      );
  } catch (error) {
    dispose();
    throw error;
  }
  return { roomChanged: () => void (isDisposed || keeper.heard()), dispose };
}
export function readCellIds(cell?: Dynamic) {
  if (!isNonNullObject(cell)) return null;
  let { rowId: rowId, columnId: columnId } = cell;
  return typeof rowId === 'string' && typeof columnId === 'string'
    ? {
        rowId: rowId,
        columnId: columnId,
      }
    : null;
}
export function readPresenceSelection(selection?: Dynamic) {
  if (!isNonNullObject(selection) || typeof selection.sheetId !== 'string') return null;
  let { sheetId: sheetId } = selection;
  let [activeCell, selectionCorner] = [readCellIds(selection.activeCell), readCellIds(selection.selectionCorner)];
  if (activeCell === null || selectionCorner === null) return null;
  return {
    activeCell: {
      sheetId: sheetId,
      ...activeCell,
    },
    selectionCorner: {
      sheetId: sheetId,
      ...selectionCorner,
    },
  };
}
export function readPeerCursor(peer?: Dynamic) {
  if (!isNonNullObject(peer)) return null;
  let { peer: tabKey, by: userId, isMe: isMe, kind: kind, presence: presence } = peer;
  if (typeof tabKey !== 'string' || typeof userId !== 'string') return null;
  if (isMe !== false || kind !== 'viewer' || !isNonNullObject(presence)) return null;
  let cursor = presence[CURSOR_PRESENCE_KEY];
  let selection = readPresenceSelection(cursor);
  if (selection === null) return null;
  let at2 = isNonNullObject(cursor) && Number.isFinite(cursor.at) ? Number(cursor.at) : 0;
  return {
    heard: {
      tabKey: tabKey,
      userId: userId,
      colorClaimed: claimedColorOfPresence(presence),
      selection: selection,
    },
    at: at2,
  };
}
export function latestPeerCursor(cursors?: Dynamic) {
  let isLater = (one?: Dynamic, other?: Dynamic) =>
    one.at === other.at ? one.heard.tabKey > other.heard.tabKey : one.at > other.at;
  return cursors.reduce((latest?: Dynamic, next?: Dynamic) => (isLater(next, latest) ? next : latest)).heard;
}
export function selectionsOfOthersFrom(peers?: Dynamic) {
  let cursorsByUser = new (Map as Dynamic)();
  for (let cursor of peers.map(readPeerCursor) as Dynamic)
    if (cursor !== null) cursorsByUser.set(cursor.heard.userId, [...(cursorsByUser.get(cursor.heard.userId) ?? []), cursor]);
  return [...cursorsByUser.values()].map(latestPeerCursor);
}
export function peerTabEntries(peer?: Dynamic) {
  if (!isNonNullObject(peer)) return [];
  let { peer: tabKey, by: userId, isMe: isMe, kind: kind } = peer;
  return isMe === false && kind === 'viewer' && typeof tabKey === 'string' && typeof userId === 'string' ? [[tabKey, userId]] : [];
}
export function createRoomPresence(
  hostWindow: Window,
  page: PageApi,
  people?: Dynamic,
  storage: Dynamic = () => sessionStorage,
  now: Dynamic = Date.now,
) {
  let roomLoading: Dynamic = null;
  let loadRoom = () => (
    (roomLoading ??= (async (): Promise<Dynamic> => {
      try {
        let room = await page.use('room');
        return isNonNullObject(room) && room.available !== false ? room : null;
      } catch (value: Dynamic) {
        reportErrorSoftly(value, 'otherViewers');
        return null;
      }
    })()),
    roomLoading
  );
  let pending: Dynamic = {};
  let publishPresence = async (fields?: Dynamic): Promise<Dynamic> => {
    pending = {
      ...pending,
      ...fields,
    };
    let room = await loadRoom();
    let setPresence = room?.presence;
    if (Object.keys(pending).length === 0 || typeof setPresence !== 'function') return;
    let toSend = pending;
    pending = {};
    try {
      await setPresence.call(room, toSend);
    } catch (error: Dynamic) {
      if (isNonNullObject(error) && error.code === 'invalid_argument') reportErrorSoftly(error, 'otherViewers');
    }
  };
  let ownSelection: Dynamic = null;
  let timeAtPage: Dynamic = null;
  let markTimeAtPage = () => {
    timeAtPage = now();
    try {
      storage().setItem(TIME_AT_PAGE_STORAGE_KEY, String(timeAtPage));
    } catch {}
  };
  let readTimeAtPage = () => {
    try {
      let value = storage().getItem(TIME_AT_PAGE_STORAGE_KEY);
      return value === null || !Number.isFinite(Number(value)) ? null : Number(value);
    } catch {
      return null;
    }
  };
  let currentTimeAtPage = () => {
    let value = timeAtPage === null ? readTimeAtPage() : null;
    if (value !== null) timeAtPage = value + 1;
    if (hostWindow.document.hasFocus() || (timeAtPage === null && !hostWindow.document.hidden)) markTimeAtPage();
    timeAtPage ??= 0;
    return timeAtPage;
  };
  let publishCursor = () =>
    void publishPresence({
      [CURSOR_PRESENCE_KEY]: ownSelection === null ? null : cursorPresence(ownSelection, currentTimeAtPage()),
    });
  let isBlurred: Dynamic = true;
  let onFocus = () => {
    if (!isBlurred || !hostWindow.document.hasFocus()) return;
    isBlurred = false;
    markTimeAtPage();
    if (ownSelection !== null) publishCursor();
  };
  hostWindow.addEventListener('blur', () => void (isBlurred = true));
  hostWindow.addEventListener('focus', onFocus, true);
  let userByTab: Dynamic = new (Map as Dynamic)();
  let startColorKeeper = async (room?: Dynamic): Promise<Dynamic> => {
    try {
      let value = await people.viewer();
      let [profile] = value === null ? [] : await people.profiles([value.userId]);
      return startPeerColorKeeper(
        room,
        {
          userId: value?.userId ?? '',
          usualColor: profile?.color ?? '',
        },
        (colorClaim?: Dynamic) =>
          void publishPresence({
            [PRESENCE_WHO_KEY]: colorClaim,
          }),
        storage,
      );
    } catch (value: Dynamic) {
      reportErrorSoftly(value, 'otherViewers');
    }
  };
  return {
    tellOwnSelection(selection?: Dynamic) {
      ownSelection = selection;
      publishCursor();
    },
    tellAgentWhatIsSelected: (selected?: Dynamic) => void publishPresence(contextPresence(selected)),
    tellWhomViewFollows: (followed?: Dynamic) =>
      void publishPresence({
        [FOLLOW_PRESENCE_KEY]:
          followed === null
            ? null
            : {
                of: followed,
              },
      }),
    personWithTab: (tabKey?: Dynamic) => userByTab.get(tabKey) ?? null,
    onSelectionsChanged(onChange?: Dynamic) {
      let colorKeeper: Dynamic = null;
      let isStopped: Dynamic = false;
      let stopListening: Dynamic = null;
      let heardPeers = (peers?: Dynamic) => {
        try {
          userByTab = new (Map as Dynamic)(peers.flatMap(peerTabEntries));
          onChange(selectionsOfOthersFrom(peers));
          colorKeeper?.roomChanged();
        } catch (error: Dynamic) {
          reportErrorSoftly(error, 'otherViewers');
        }
      };
      (async (): Promise<Dynamic> => {
        let room = await loadRoom();
        let onPeers = room?.onPeers;
        if (isStopped || room === null || typeof onPeers !== 'function') return;
        let stopPeers = onPeers.call(
          room,
          (event?: Dynamic) => heardPeers(isNonNullObject(event) && Array.isArray(event.peers) ? event.peers : []),
          () => heardPeers([]),
        );
        if (typeof stopPeers === 'function') stopListening = () => void Reflect.apply(stopPeers, undefined, []);
        colorKeeper = await startColorKeeper(room);
        if (isStopped) colorKeeper?.dispose();
      })();
      return () => {
        isStopped = true;
        stopListening?.();
        colorKeeper?.dispose();
        colorKeeper = null;
      };
    },
  };
}
export const PRESENCE_WHO_KEY = 'who';
export const OWN_COLOR_STORAGE_KEY = 'sheets-own-color';
export const guardCallback =
  (callback?: Dynamic) =>
  (...args: Dynamic[]) => {
    try {
      (callback as Dynamic)(...args);
    } catch (error: Dynamic) {
      reportErrorSoftly(error, 'ownColor');
    }
  };
export const cursorPresence = ({ activeCell: activeCell, selectionCorner: selectionCorner }: Dynamic, at?: Dynamic) => ({
  sheetId: activeCell.sheetId,
  activeCell: {
    rowId: activeCell.rowId,
    columnId: activeCell.columnId,
  },
  selectionCorner: {
    rowId: selectionCorner.rowId,
    columnId: selectionCorner.columnId,
  },
  at: at,
});
export const CURSOR_PRESENCE_KEY = 'cursor';
export const FOLLOW_PRESENCE_KEY = 'follow';
export const CONTEXT_PRESENCE_KEY = 'context';
export const contextPresence = ({ byAddress: byAddress, chartId: chartId }: Dynamic) => ({
  [CONTEXT_PRESENCE_KEY]: {
    sheetNumber: byAddress?.sheetNumber ?? null,
    range: byAddress?.range ?? null,
    activeCell: byAddress?.activeCell ?? null,
    revision: byAddress?.revision ?? null,
    chartId: chartId !== null && isViewId(chartId) ? chartId : null,
  },
});
export const TIME_AT_PAGE_STORAGE_KEY = 'sheets-time-at-page';
