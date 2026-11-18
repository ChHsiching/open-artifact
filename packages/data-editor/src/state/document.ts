/**
 * The dashboard as stored: every document of the store by path, the parsed
 * content the page runs, and whether this viewer may write. The live sync
 * (`../sync/`) fills it; everything else reads it.
 */

import { create } from 'zustand';
import { EMPTY_DASHBOARD_CONTENT, type DashboardContent, type UnknownRecord } from '@open-artifact/data-core';

export type DocumentStatus = 'connecting' | 'ready' | 'offline' | 'unavailable';

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'failed';

export interface DocumentState {
  status: DocumentStatus;
  /** Every shared document by store path (`dash/meta`, `datasets/sales`, `files/index.html`…), as stored. */
  documents: ReadonlyMap<string, UnknownRecord>;
  /** This viewer's own documents under `data/users/<uid>/`, by name (`check`, `runs`, `history-sales`…). */
  ownDocuments: ReadonlyMap<string, UnknownRecord>;
  /** `dash/meta.title`. */
  title: string;
  /** The content the page runs (`parseDashboardContent` of the documents). */
  content: DashboardContent;
  canWrite: boolean;
  /** Why the viewer cannot write, when they cannot. */
  readOnlyReason: string | null;
  save: SaveState;
  /** The last write error, shown until the next successful write. */
  saveError: string | null;
  /** The sync status in words (`Syncing…`, `All changes synced · 10:42.`, `Showing your saved copy…`). */
  saveMessage: string;
  /** What to do about the status, when there is something. */
  saveHint: string | null;
  /** Retrying may help (`retrySync`). */
  retryable: boolean;
  /** Documents with changes not yet stored. */
  pending: number;
  /** Why a change cannot be stored (too large…), while it stays unsent. */
  refusal: string | null;
}

export const useDocument = create<DocumentState>(() => ({
  status: 'connecting',
  documents: new Map(),
  ownDocuments: new Map(),
  title: '',
  content: EMPTY_DASHBOARD_CONTENT,
  canWrite: false,
  readOnlyReason: null,
  save: 'saved',
  saveError: null,
  saveMessage: '',
  saveHint: null,
  retryable: false,
  pending: 0,
  refusal: null,
}));
