/**
 * One tab kept in step with the server.
 *
 * The page edits a shadow of the tab: the tab as the server will hold it once every op sent so far lands. Each edit is
 * diffed into ops against the shadow (diff.ts) and queued; one call is in flight at a time and carries everything
 * queued. Someone else's write (a frame, or a rev that jumped) makes the tab stale: once nothing is in flight the tab
 * is read again, the ops still queued are laid on top of it (an op the new tab refuses is dropped), and the editor is
 * told to show the result. Ids make the ops land where they were meant on a tab that moved on, so there is nothing to
 * transform.
 */
import { type DocState, Refusal, type Session, applyOps, docFromDisk, type DiskDoc } from '@open-artifact/docs-core';
import type { DocCallAnswer, DocMember, DocSuggestion, DocTabFrame, DocTabResponse } from '@open-artifact/runtime/doc-api';
import { type PageDiff, type TopWindow, diffPage, diffTop } from './diff.ts';
import type { PageNode } from './page.ts';

type Json = Record<string, unknown>;

export interface DocTransport {
  call(request: { sess: string; opId: string; member: DocMember }): Promise<DocCallAnswer>;
  read(tab: string): Promise<DocTabResponse>;
  /**
   * The server let the page's session go (its event stream closed for a while): takes a new one into the session the
   * tabs share. Answers false when the page may no longer write.
   */
  renew?(): Promise<boolean>;
}

/** `saved`: nothing waits; `saving`: a call is out; `offline`: the server can't be reached (it is tried again). */
export type SyncStatus = 'saved' | 'saving' | 'offline' | 'stopped';

/** Why the shadow changed under the editor. */
export type ShadowCause = 'remote' | 'refused' | 'local';

export interface TabSyncEvents {
  /** The editor shows this doc (it already shows every edit it made itself). */
  shadow(doc: DocState, cause: ShadowCause): void;
  status?(status: SyncStatus, detail?: string): void;
  suggestions?(suggestions: DocSuggestion[]): void;
  /** What a call answered, for the edits that wait on it (a decision's undo). */
  answered?(answer: DocCallAnswer & Json, ops: Json[]): void;
}

export interface TabSyncOptions {
  tab: string;
  /** The tab's body node, which the page writes through. */
  node: string;
  session: Session;
  transport: DocTransport;
  events: TabSyncEvents;
  /** How long before a call that could not reach the server is sent again, in ms. */
  retryMs?: number;
}

const DENIALS_BEFORE_GIVING_UP = 3;

export class TabSync {
  readonly tab: string;
  readonly node: string;
  private session: Session;
  private transport: DocTransport;
  private events: TabSyncEvents;
  private retryMs: number;
  private current: DocState;
  private queued: Json[][] = [];
  private sending: { opId: string; groups: number } | null = null;
  private reading = false;
  private stale = false;
  private stopped = false;
  private denials = 0;
  private dropped = false;
  private renewed = false;
  private renewing = false;
  private calls = 0;
  private rev: number;
  private waiters: Array<() => void> = [];
  private status: SyncStatus = 'saved';
  private held = false;

  constructor(options: TabSyncOptions, tab: DocTabResponse) {
    this.tab = options.tab;
    this.node = options.node;
    this.session = options.session;
    this.transport = options.transport;
    this.events = options.events;
    this.retryMs = options.retryMs ?? 2000;
    this.current = docFromDisk(tab.doc as unknown as DiskDoc);
    this.rev = tab.rev;
    this.events.suggestions?.(tab.suggestions);
  }

  /** The tab as the page shows it. */
  get shadow(): DocState {
    return this.current;
  }

  /** The rev of the tab the server last answered with. */
  get serverRev(): number {
    return this.rev;
  }

  get busy(): boolean {
    return this.queued.length > 0 || this.sending !== null || this.reading || this.renewing;
  }

  /** The editor changed the top-level blocks of `window`. Answers the ids the editor writes on its new blocks. */
  edit(window: TopWindow): PageDiff {
    return this.take(diffTop(this.current, window, this.session));
  }

  /** The editor's doc as a whole (tests, and an editor that can't say what changed). */
  editPage(page: PageNode): PageDiff {
    return this.take(diffPage(this.current, page, this.session));
  }

  /** Ops the page writes itself (a decision on a suggestion): the editor is shown what they make. */
  write(ops: Json[]): DocState {
    const { doc } = applyOps(this.current, ops, this.session);
    this.current = doc;
    this.queued.push(ops);
    this.events.shadow(doc, 'local');
    this.pump();
    return doc;
  }

  /** A frame of someone else's write to this tab. */
  heard(frame: DocTabFrame): void {
    if (frame.tab !== this.tab || (frame.sess && frame.sess === this.session.sess)) return;
    if (frame.rev <= this.rev && !this.sending) return;
    this.stale = true;
    this.pump();
  }

  /** The event stream came back after a gap: whatever was written meanwhile is read. */
  reconnected(): void {
    this.stale = true;
    this.pump();
  }

  /** Resolves once nothing is queued, out or being read. */
  settled(): Promise<void> {
    if (!this.busy && (!this.stale || this.held)) return Promise.resolve();
    return new Promise(done => this.waiters.push(done));
  }

  /**
   * While held, others' writes are not read in (the editor can't take them now: an input method is composing); the
   * page's own edits still go out. Letting go reads what came meanwhile.
   */
  hold(held: boolean): void {
    this.held = held;
    if (!held) this.pump();
  }

  stop(): void {
    this.stopped = true;
    this.setStatus('stopped');
  }

  private take(diff: PageDiff): PageDiff {
    if (diff.ops.length) {
      this.current = diff.shadow;
      this.queued.push(diff.ops);
      this.pump();
    }
    return diff;
  }

  private setStatus(status: SyncStatus, detail?: string): void {
    if (this.status === status && !detail) return;
    this.status = status;
    this.events.status?.(status, detail);
  }

  private pump(): void {
    if (this.stopped || this.sending || this.reading || this.renewing) return;
    if (this.stale && !this.held) {
      void this.reread();
      return;
    }
    if (!this.queued.length) {
      if (this.stale) return;
      this.setStatus('saved');
      const waiters = this.waiters.splice(0);
      for (const done of waiters) done();
      return;
    }
    const groups = this.queued.length;
    const ops = this.queued.flat();
    const opId = `${this.session.sess}.w${++this.calls}`;
    this.sending = { opId, groups };
    this.setStatus('saving');
    void this.send(opId, ops);
  }

  private async send(opId: string, ops: Json[]): Promise<void> {
    const member: DocMember = { verb: 'update', ref: { object: 'node', id: this.node }, payload: { ops } as DocMember['payload'] };
    let answer: DocCallAnswer & Json;
    try {
      answer = (await this.transport.call({ sess: this.session.sess, opId, member })) as DocCallAnswer & Json;
    } catch {
      // Unreachable: the same call again later (its opId makes a second landing a replay).
      this.setStatus('offline');
      setTimeout(() => {
        if (!this.stopped) void this.send(opId, ops);
      }, this.retryMs);
      return;
    }
    const sent = this.sending!;
    this.sending = null;
    if (answer.verdict === 'allow') {
      this.denials = 0;
      this.renewed = false;
      this.queued.splice(0, sent.groups);
      const rev = typeof answer.rev === 'number' ? answer.rev : undefined;
      if (rev !== undefined) {
        // A rev past ours plus this write: someone else wrote in between.
        if (rev > this.rev + (answer.noop ? 0 : 1)) this.stale = true;
        this.rev = Math.max(this.rev, rev);
      }
      // A restored undecide changes the tab beyond this write, and the page keeps no record of its decisions.
      if ((answer.undecided as { outcome?: string } | undefined)?.outcome === 'restored') this.stale = true;
      this.events.answered?.(answer, ops);
    } else if (answer.reason === 'not_your_session' && this.transport.renew && !this.renewed) {
      // Ids already minted under the old session still land: they are taken as given.
      this.renewed = true;
      this.renewing = true;
      const renewed = await this.transport.renew().catch(() => false);
      this.renewing = false;
      if (!renewed) return this.giveUp(answer.reason);
      this.stale = true;
    } else if (answer.reason === 'not_your_session' || answer.reason === 'not_writer') {
      return this.giveUp(answer.reason);
    } else {
      this.denials++;
      if (this.denials >= DENIALS_BEFORE_GIVING_UP) {
        this.queued = [];
        this.denials = 0;
        this.dropped = true;
      }
      this.stale = true;
    }
    this.pump();
  }

  /** Nothing queued can land: the page shows the tab as the server holds it, and writes no more. */
  private async giveUp(reason: string): Promise<void> {
    this.queued = [];
    await this.reread(true);
    this.stopped = true;
    this.setStatus('stopped', reason);
  }

  private async reread(dropped = false): Promise<void> {
    this.reading = true;
    this.stale = false;
    let tab: DocTabResponse;
    try {
      tab = await this.transport.read(this.tab);
    } catch {
      this.reading = false;
      this.stale = true;
      this.setStatus('offline');
      setTimeout(() => this.pump(), this.retryMs);
      return;
    }
    this.reading = false;
    dropped ||= this.dropped;
    this.dropped = false;
    const refused = this.rebase(docFromDisk(tab.doc as unknown as DiskDoc));
    this.rev = tab.rev;
    this.events.suggestions?.(tab.suggestions);
    this.events.shadow(this.current, refused || dropped ? 'refused' : 'remote');
    this.pump();
  }

  /** Lays the queued ops on the tab as read; answers whether any were refused (and dropped). */
  private rebase(doc: DocState): boolean {
    let next = doc;
    let refused = false;
    const kept: Json[][] = [];
    for (const ops of this.queued) {
      try {
        next = applyOps(next, ops, this.session).doc;
        kept.push(ops);
      } catch (error) {
        if (!(error instanceof Refusal)) throw error;
        refused = true;
      }
    }
    this.queued = kept;
    this.current = next;
    return refused;
  }
}
