/**
 * The page's side of the doc: its writing session, one sync per open tab, and the doc's name, tabs and dropdown lists
 * as the server announces them.
 */
import type { DocState, Session as WriteSession } from '@open-artifact/docs-core';
import type { DocCapability } from '@open-artifact/runtime';
import type { DocCallAnswer, DocEnum, DocFile, DocFrame, DocMember, DocProject, DocSessionResponse } from '@open-artifact/runtime/doc-api';
import { TabBinding } from '../editor/binding.ts';
import { type DocTransport, type ShadowCause, TabSync } from '../sync/tab-sync.ts';
import { getDocs, orderedTabs, setDocs, useDocs } from './store.ts';

type Json = Record<string, unknown>;

export interface OpenTab {
  id: string;
  sync: TabSync;
  binding: TabBinding;
}

export interface ShadowListener {
  (tab: string, doc: DocState, cause: ShadowCause): void;
}

export class DocClient {
  readonly doc: DocCapability;
  /** The writing session every tab's sync shares; renewed in place. */
  readonly writer: WriteSession;
  private readonly opening = new Map<string, Promise<OpenTab>>();
  private readonly open = new Map<string, OpenTab>();
  private readonly shadowListeners = new Set<ShadowListener>();
  private readonly answerListeners = new Set<(tab: string, answer: DocCallAnswer & Json, ops: Json[]) => void>();
  private stopFrames: () => void = () => undefined;
  private calls = 0;
  private renewing: Promise<boolean> | null = null;

  private constructor(doc: DocCapability, started: DocSessionResponse) {
    this.doc = doc;
    this.writer = { sess: started.sess ?? 'reader', next: started.next };
    this.adopt(started);
  }

  static async start(doc: DocCapability): Promise<DocClient> {
    const client = new DocClient(doc, await doc.session());
    client.stopFrames = doc.onFrame(frame => client.heard(frame));
    return client;
  }

  get writable(): boolean {
    return getDocs().writable;
  }

  /** A tab's sync and binding, opened on first use. */
  tab(id: string): Promise<OpenTab> {
    const known = this.opening.get(id);
    if (known) return known;
    const made = this.openTab(id);
    this.opening.set(id, made);
    made.catch(() => this.opening.delete(id));
    return made;
  }

  /** A tab that is open already. */
  openTabOf(id: string): OpenTab | null {
    return this.open.get(id) ?? null;
  }

  onShadow(listener: ShadowListener): () => void {
    this.shadowListeners.add(listener);
    return () => this.shadowListeners.delete(listener);
  }

  onAnswer(listener: (tab: string, answer: DocCallAnswer & Json, ops: Json[]) => void): () => void {
    this.answerListeners.add(listener);
    return () => this.answerListeners.delete(listener);
  }

  /** A call on the doc itself (its name, tabs, dropdown lists). Rejects with the refusal's words when it is denied. */
  async call(request: { member: DocMember } | { batch: DocMember[] }): Promise<Json> {
    const answer = await this.doc.call({ sess: this.writer.sess, opId: `${this.writer.sess}.p${++this.calls}`, ...request });
    if (answer.verdict === 'deny') {
      if (answer.reason === 'not_your_session' && (await this.renew())) return this.call(request);
      throw new CallDenied(answer.reason, answer.detail);
    }
    return answer as Json;
  }

  /** Lets every write sent so far land. */
  async settled(): Promise<void> {
    await Promise.all([...this.open.values()].map(tab => tab.sync.settled()));
  }

  stop(): void {
    this.stopFrames();
    for (const tab of this.open.values()) {
      tab.sync.stop();
      tab.binding.detach();
    }
    this.open.clear();
    this.opening.clear();
  }

  private async openTab(id: string): Promise<OpenTab> {
    const file = await listedFile(id);
    if (!file) throw new Error(`no tab ${id}`);
    const read = await this.doc.read(id);
    const transport: DocTransport = {
      call: request => this.doc.call(request),
      read: tab => this.doc.read(tab),
      renew: () => this.renew(),
    };
    let binding: TabBinding | null = null;
    const sync = new TabSync(
      {
        tab: id,
        node: file.content.id,
        session: this.writer,
        transport,
        events: {
          shadow: (doc, cause) => {
            binding?.showShadow(doc);
            for (const listener of this.shadowListeners) listener(id, doc, cause);
          },
          status: status => setDocs(state => ({ saving: { ...state.saving, [id]: status } })),
          suggestions: suggestions => setDocs(state => ({ suggestions: { ...state.suggestions, [id]: suggestions } })),
          answered: (answer, ops) => {
            for (const listener of this.answerListeners) listener(id, answer, ops);
          },
        },
      },
      read,
    );
    binding = new TabBinding(sync, { writable: this.writable });
    const open = { id, sync, binding };
    this.open.set(id, open);
    return open;
  }

  private heard(frame: DocFrame): void {
    switch (frame.kind) {
      case 'tab':
        this.open.get(frame.tab)?.sync.heard(frame);
        return;
      case 'project':
        this.setProject(frame.project);
        return;
      case 'enums':
        this.setEnums(frame.enums);
        return;
      case 'stream':
        void this.reconnected();
        return;
    }
  }

  /** The event stream opened again: the session may be gone, and writes may have been missed. */
  private async reconnected(): Promise<void> {
    await this.renew();
    for (const tab of this.open.values()) tab.sync.reconnected();
  }

  /** Takes the session again: the same one while the server still holds it, else a new one. */
  private renew(): Promise<boolean> {
    this.renewing ??= (async () => {
      try {
        const answer = await this.doc.session();
        if (answer.sess === this.writer.sess) this.writer.next = Math.max(this.writer.next, answer.next);
        else if (answer.sess) {
          this.writer.sess = answer.sess;
          this.writer.next = answer.next;
        }
        this.adopt(answer);
        return answer.sess !== null;
      } catch {
        return false;
      } finally {
        this.renewing = null;
      }
    })();
    return this.renewing;
  }

  private adopt(answer: DocSessionResponse): void {
    setDocs({ me: answer.me, writable: answer.writable && answer.sess !== null, commentable: answer.commentable });
    for (const tab of this.open.values()) tab.binding.setWritable(answer.writable && answer.sess !== null);
    this.setProject(answer.project);
  }

  private setProject(project: DocProject): void {
    const enums = project.enums ?? getDocs().project?.enums ?? [];
    const next = { ...project, enums };
    const active = getDocs().activeTab;
    const files = orderedTabs(next.files);
    const stillThere = active && files.some(file => file.id === active);
    setDocs({ project: next, ...(stillThere ? {} : { activeTab: files[0]?.id ?? null }) });
    for (const [id, tab] of this.open) {
      if (files.some(file => file.id === id)) continue;
      tab.sync.stop();
      tab.binding.detach();
      this.open.delete(id);
      this.opening.delete(id);
    }
  }

  private setEnums(enums: DocEnum[]): void {
    const project = getDocs().project;
    if (!project) return;
    const byId = new Map(project.enums.map(item => [item.id, item]));
    for (const item of enums) byId.set(item.id, item);
    setDocs({ project: { ...project, enums: [...byId.values()] } });
  }
}

export class CallDenied extends Error {
  readonly reason: string;
  constructor(reason: string, detail: string) {
    super(detail || reason);
    this.reason = reason;
  }
}

let current: DocClient | null = null;

export const docClient = (): DocClient => {
  if (!current) throw new Error('the doc is not open yet');
  return current;
};

export const setDocClient = (client: DocClient) => {
  current = client;
};

const LISTING_WAIT_MS = 5000;

/** The tab `id` once the doc lists it: a tab just made may be named before the doc's new listing arrives. */
function listedFile(id: string): Promise<DocFile | null> {
  const find = () => getDocs().project?.files.find(item => item.id === id) ?? null;
  const now = find();
  if (now) return Promise.resolve(now);
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      stop();
      resolve(find());
    }, LISTING_WAIT_MS);
    const stop = useDocs.subscribe(() => {
      const file = find();
      if (!file) return;
      clearTimeout(timer);
      stop();
      resolve(file);
    });
  });
}
