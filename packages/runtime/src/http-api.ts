/**
 * The HTTP contract between an editor page and its local type server.
 *
 * Every route is relative to the artifact's page base (for example
 * `http://127.0.0.1:4720/design/<token>/`). Both the browser provider
 * ({@link ./local-provider.ts}) and the Node server (`@open-artifact/type-server`)
 * import these names and shapes, so the two sides cannot drift apart.
 */

import type {
  AgentDelivery,
  AgentRequest,
  AgentSendResult,
  AgentStatus,
  ArtifactErrorCode,
  CommentCreate,
  CommentThread,
  ConflictPath,
  DbChangeEvent,
  DbDocument,
  DbWrite,
  FileListing,
  FilesChangedEvent,
  HistoryChangeEvent,
  HistoryFileDiff,
  HistoryListing,
  HistoryRestoreResult,
  JsonRecord,
  JsonValue,
  Peer,
  PublishBatch,
  PublishResult,
  RoomMessage,
  Viewer,
} from './capabilities.ts';

/** Route paths, relative to the page base. */
export const API = {
  session: '_api/session',
  files: '_api/files',
  file: '_api/file',
  publish: '_api/publish',
  assets: '_api/assets',
  events: '_api/events',
  agentSend: '_api/agent/send',
  presence: '_api/presence',
  peers: '_api/peers',
  downloads: '_api/downloads',
  roomEmit: '_api/room/emit',
  dbGet: '_api/db/get',
  dbList: '_api/db/list',
  dbWrite: '_api/db/write',
  comments: '_api/comments',
  commentsCreate: '_api/comments/create',
  commentsReply: '_api/comments/reply',
  commentsResolve: '_api/comments/resolve',
  commentsMove: '_api/comments/move',
  commentsRemove: '_api/comments/remove',
  commentsSend: '_api/comments/send',
  history: '_api/history',
  historyFiles: '_api/history/files',
  historyFile: '_api/history/file',
  historyDiff: '_api/history/diff',
  historyRestore: '_api/history/restore',
  historyDismiss: '_api/history/dismiss',
} as const;

/** Root-relative prefix every upload is served under. */
export const BLOB_PREFIX = '/_blob/';

/** `GET _api/session` */
export interface SessionResponse {
  artifact: { id: string; title: string; type: string };
  viewer: Viewer;
  agent: AgentStatus;
  /** Stores the type keeps beside its files; absent ones are not offered (`db` / `comments` resolve `null`). */
  stores?: { db?: boolean; comments?: boolean; history?: boolean };
}

/** `GET _api/files` */
export interface FilesResponse {
  files: FileListing;
}

/** Header carrying the SHA-256 of a file returned by `GET _api/file`. */
export const SHA_HEADER = 'x-open-artifact-sha256';

/** `POST _api/publish` request body. */
export interface PublishRequest {
  files: PublishBatch;
  /** The publishing page's client id, so its own change events are not echoed back. */
  client: string;
}

/** `POST _api/publish` 200 body. */
export type PublishResponse = PublishResult;

/** Body of every non-2xx JSON answer. */
export interface ErrorResponse {
  code: ArtifactErrorCode;
  message: string;
  paths?: ConflictPath[];
}

/** `POST _api/agent/send` request body. */
export interface AgentSendRequest {
  request: AgentRequest;
  deliver: AgentDelivery;
}

/** `POST _api/agent/send` 200 body. */
export type AgentSendResponse = AgentSendResult;

/** `POST _api/presence` request body. */
export interface PresenceRequest {
  client: string;
  patch: Record<string, unknown>;
}

/** `GET _api/peers` */
export interface PeersResponse {
  peers: Peer[];
}

/** `POST _api/room/emit` request body. Relayed to every other client as a `room` event. */
export interface RoomEmitRequest {
  client: string;
  topic: string;
  data: JsonValue;
}

/** `GET _api/db/get?path=` 200 body. */
export interface DbGetResponse {
  data: JsonRecord | null;
}

/** `GET _api/db/list?collection=` 200 body. */
export interface DbListResponse {
  documents: DbDocument[];
}

/** `POST _api/db/write` request body. */
export interface DbWriteRequest {
  writes: DbWrite[];
  /** The writing page's client id, so the change is not echoed back to it. */
  client: string;
}

/** `GET _api/comments` 200 body, and the body of `POST _api/comments/remove`. */
export interface CommentsResponse {
  threads: CommentThread[];
}

/** `POST _api/comments/create` request body. */
export interface CommentCreateRequest {
  input: CommentCreate;
}

/** `POST _api/comments/reply` request body. */
export interface CommentReplyRequest {
  threadId: string;
  text: string;
}

/** `POST _api/comments/resolve` request body. */
export interface CommentResolveRequest {
  threadId: string;
  resolved: boolean;
}

/** `POST _api/comments/move` request body. */
export interface CommentMoveRequest {
  threadId: string;
  anchor: string;
  location?: JsonRecord;
}

/** `POST _api/comments/remove` request body. */
export interface CommentRemoveRequest {
  threadId: string;
  messageId?: string;
}

/** `POST _api/comments/send` request body. */
export interface CommentSendRequest {
  threadId: string;
}

/** 200 body of the comment routes that change one thread. */
export interface CommentThreadResponse {
  thread: CommentThread;
}

/** `GET _api/history` 200 body (versions newest first). */
export type HistoryResponse = HistoryListing;

/** `GET _api/history/files?n=` 200 body. */
export interface HistoryFilesResponse {
  files: FileListing;
}

/**
 * `GET _api/history/file?n=&path=` answers the raw bytes (with
 * {@link SHA_HEADER}); `GET _api/history/diff?n=&path=` a
 * {@link HistoryDiffResponse}.
 */
export type HistoryDiffResponse = HistoryFileDiff;

/** `POST _api/history/restore` request body. */
export interface HistoryRestoreRequest {
  n: number;
  /** Only these paths (default: every path). */
  paths?: string[];
  /** The restoring page's client id (it hears of the restore like every other page). */
  client?: string;
}

/** `POST _api/history/restore` 200 body. */
export type HistoryRestoreResponse = HistoryRestoreResult;

/** `POST _api/history/dismiss` request body. */
export interface HistoryDismissRequest {
  id: string;
}

/** Server-sent events on `GET _api/events?client=<id>`, by event name. */
export interface ServerEvents {
  /** Files changed by someone other than the subscribing client. */
  files: FilesChangedEvent;
  /** Agent availability changed. */
  agent: AgentStatus;
  /** The set of present peers changed. */
  peers: Peer[];
  /** Documents changed by someone other than the subscribing client (db-backed types). */
  db: DbChangeEvent;
  /** The full comment thread list, after any change (types with comments). */
  comments: CommentThread[];
  /** An ephemeral message from another client. */
  room: RoomMessage;
  /** A version was recorded (or grew). */
  history: HistoryChangeEvent;
}

export type ServerEventName = keyof ServerEvents;
