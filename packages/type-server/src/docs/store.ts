/**
 * A doc on disk, in the artifact's `doc/` folder:
 *
 *   doc/doc.json         the manifest: id, name, tabs (id → name, order, content node), dropdown enums
 *   doc/tabs/<tab>.json  one tab's content: {rev, blocks}, text kept as runs
 *   doc/.sessions.json   writing sessions and their id counters (the page predicts ids from them)
 *   doc/history/<tab>/   the tab's versions: who wrote each (a person or the agent), when, and its content
 *
 * The server holds one DocStore for as long as the artifact is open and is then the only writer; without a server the
 * CLI opens one per command. Every write lands on disk before it is answered.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  type Block,
  type DiskDoc,
  type DocState,
  type HistoryIndex,
  type Session,
  type Writer,
  HISTORY_DIR,
  HISTORY_INDEX,
  docFromDisk,
  docToDisk,
  emptyIndex,
  newBlock,
  recordWrite,
} from '@open-artifact/docs-core';

export const MANIFEST_FILE = 'doc.json';
export const TABS_DIR = 'tabs';
export const SESSIONS_FILE = '.sessions.json';
export const DOC_DIR = 'doc';
export const DOC_FORMAT = 'open-artifact-docs';

export interface Tab {
  name: string;
  /** Sort key: tabs are shown in the string order of these. */
  order: string;
  /** The content node's id (the page reads and writes the tab through it). */
  node: string;
  /** The tab this one sits under in the tab list. */
  subtabOf?: string;
}

export interface EnumOption {
  name: string;
  order: number;
  disabled?: boolean;
  /** The chip's colour, as the page's chip menu names it. */
  color?: string;
}
export interface EnumDef {
  name: string;
  options: EnumOption[];
}

export interface Manifest {
  format: typeof DOC_FORMAT;
  version: 1;
  id: string;
  name: string;
  created: string;
  updated: string;
  /** Bumped on every write anywhere in the doc. */
  head: number;
  tabs: Record<string, Tab>;
  enums: Record<string, EnumDef>;
  /** How the page shows the doc: fonts (headingFont, textFont), where the tabs go (tabsLocation) and the like. The page owns the keys. */
  display?: Record<string, unknown>;
}

interface SessionRecord {
  next: number;
  kind: 'page' | 'cli';
  created: string;
}
interface SessionsFile {
  sessions: Record<string, SessionRecord>;
  /** The session the CLI writes with. */
  cli?: string;
}

const MAX_PAGE_SESSIONS = 200;

export class StoreError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** A short random id: 8 hex, a dash, 4 hex (tabs, nodes, enums). */
export const shortId = () => {
  const hex = randomBytes(6).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8)}`;
};
/**
 * A session id: a letter, then 10 base-36 characters. Block ids are `<session>.<n>` and the page only takes ids whose
 * session starts with a letter (the range of an Edit with Agent request is checked against it).
 */
const sessionId = () => {
  const bytes = randomBytes(11);
  return Array.from(bytes, (byte, at) => (at === 0 ? 10 + (byte % 26) : byte % 36).toString(36)).join('');
};

/**
 * Tab sort keys, the page's way: base-62 strings compared as plain strings, a new key the midpoint of its neighbours,
 * never ending in "0" (the page skips such keys when it picks a neighbour to move or copy a tab next to).
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const isKey = (key: string) => /^[0-9A-Za-z]*$/.test(key);

function midKey(a: string, b: string): string {
  let same = 0;
  while (same < a.length && same < b.length && a[same] === b[same]) same++;
  if (same > 0) return a.slice(0, same) + midKey(a.slice(same), b.slice(same));
  const low = a.length ? DIGITS.indexOf(a[0]!) : 0;
  const high = b.length ? DIGITS.indexOf(b[0]!) : DIGITS.length;
  if (high - low > 1) return DIGITS[Math.floor((low + high) / 2)]!;
  return a.length ? a[0]! + midKey(a.slice(1), '') : DIGITS[0]! + midKey('', b.slice(1));
}

/** A sort key between `before` and `after` (either may be missing). */
export function orderBetween(before: string | undefined, after: string | undefined): string {
  const tidy = (key: string) => (key.endsWith(DIGITS[0]!) ? key + DIGITS[31]! : key);
  if (before !== undefined && !isKey(before)) return `${before}V`;
  if (after !== undefined && !isKey(after)) after = undefined;
  if (before === undefined && after === undefined) return DIGITS[31]!;
  if (before === undefined) return tidy(midKey('', after!));
  if (after === undefined) return before < DIGITS[61]! ? tidy(midKey(before, DIGITS[61]!)) : before + DIGITS[31]!;
  return tidy(midKey(before, after));
}

/** A sort key after `last`: "V", then "k", "s", "w", … */
export const orderAfter = (last: string | undefined): string => orderBetween(last, undefined);

function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, text);
  fs.renameSync(temp, file);
}
const writeJson = (file: string, value: unknown) => writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);

export const isDocFolder = (root: string) => fs.existsSync(path.join(root, MANIFEST_FILE));

export class DocStore {
  readonly root: string;
  manifest: Manifest;
  private docs = new Map<string, DocState>();
  /** Each tab's history index as read or last written (null: none on disk). */
  private histories = new Map<string, HistoryIndex | null>();
  private sessionsFile: SessionsFile;
  private live = new Map<string, Session>();
  /** An open transaction: what to put back if it fails (begin / commit / rollback). */
  private nested = 0;
  private txn: { manifest: string; sessions: string; counters: Map<string, number>; files: Map<string, string | null> } | null = null;

  private constructor(root: string, manifest: Manifest, sessions: SessionsFile) {
    this.root = root;
    this.manifest = manifest;
    this.sessionsFile = sessions;
  }

  /** Opens the doc in `root`. */
  static open(root: string): DocStore {
    const file = path.join(root, MANIFEST_FILE);
    let manifest: Manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StoreError('NOT_A_DOC', `${root} holds no doc (no ${MANIFEST_FILE}); create one first.`);
      throw new StoreError('BAD_MANIFEST', `${file} is not readable JSON: ${(error as Error).message}`);
    }
    if (manifest.format !== DOC_FORMAT || typeof manifest.tabs !== 'object' || !manifest.tabs) throw new StoreError('BAD_MANIFEST', `${file} is not a docs manifest.`);
    manifest.enums ??= {};
    manifest.head ??= 1;
    let sessions: SessionsFile = { sessions: {} };
    try {
      sessions = JSON.parse(fs.readFileSync(path.join(root, SESSIONS_FILE), 'utf8')) as SessionsFile;
      sessions.sessions ??= {};
    } catch {}
    return new DocStore(root, manifest, sessions);
  }

  /**
   * Creates a doc in `root` (an empty or missing folder). `tabs` gives each tab's name and blocks; `fill` builds them
   * with the CLI session (so their ids come from its counter) after the manifest exists.
   */
  static create(root: string, name: string, fill: (store: DocStore, session: Session) => { id?: string | undefined; name: string; blocks: Block[] }[]): DocStore {
    if (isDocFolder(root)) throw new StoreError('DOC_EXISTS', `${root} already holds a doc.`);
    fs.mkdirSync(root, { recursive: true });
    const now = new Date().toISOString();
    const manifest: Manifest = { format: DOC_FORMAT, version: 1, id: randomUUID(), name, created: now, updated: now, head: 1, tabs: {}, enums: {} };
    const store = new DocStore(root, manifest, { sessions: {} });
    const session = store.cliSession();
    const tabs = fill(store, session);
    if (tabs.length === 0) throw new StoreError('NO_TABS', 'A doc has at least one tab.');
    let order: string | undefined;
    for (const tab of tabs) {
      order = orderAfter(order);
      store.addTab(tab.name, tab.blocks, order, false, tab.id);
    }
    store.saveManifest();
    store.saveSessions();
    return store;
  }

  get id(): string {
    return this.manifest.id;
  }

  /** Tab ids in display order. */
  tabIds(): string[] {
    return Object.entries(this.manifest.tabs)
      .sort(([, a], [, b]) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
      .map(([id]) => id);
  }

  tab(id: string): Tab {
    const tab = this.manifest.tabs[id];
    if (!tab) throw new StoreError('NO_TAB', `No tab ${id}.`);
    return tab;
  }

  /** The tab whose content node is `node`. */
  tabOfNode(node: string): string | null {
    for (const [id, tab] of Object.entries(this.manifest.tabs)) if (tab.node === node) return id;
    return null;
  }

  /** Finds a tab by id, or by name (case-insensitive) when no id matches. */
  findTab(key: string | undefined): string {
    const ids = this.tabIds();
    if (key === undefined || key === '') return ids[0]!;
    if (this.manifest.tabs[key]) return key;
    const byNode = this.tabOfNode(key);
    if (byNode) return byNode;
    const wanted = key.trim().toLowerCase();
    const named = ids.filter(id => this.manifest.tabs[id]!.name.trim().toLowerCase() === wanted);
    if (named.length === 1) return named[0]!;
    if (named.length > 1) throw new StoreError('TAB_AMBIGUOUS', `More than one tab is named "${key}"; use its id (${named.join(', ')}).`);
    throw new StoreError('NO_TAB', `No tab "${key}". Tabs: ${ids.map(id => `${id} (${this.manifest.tabs[id]!.name})`).join(', ')}.`);
  }

  doc(tabId: string): DocState {
    const cached = this.docs.get(tabId);
    if (cached) return cached;
    this.tab(tabId);
    const file = path.join(this.root, TABS_DIR, `${tabId}.json`);
    let disk: DiskDoc;
    try {
      disk = JSON.parse(fs.readFileSync(file, 'utf8')) as DiskDoc;
    } catch (error) {
      throw new StoreError('BAD_TAB', `${file} is not readable: ${(error as Error).message}`);
    }
    const doc = docFromDisk(disk);
    this.docs.set(tabId, doc);
    return doc;
  }

  // ---- transactions: a batch lands whole or not at all ----

  /**
   * Opens a transaction. One opened inside another joins it: its commit and rollback leave the outer one to decide,
   * and the outer rollback puts back everything since the outer begin().
   */
  begin(): void {
    if (this.txn) {
      this.nested++;
      return;
    }
    this.txn = {
      manifest: JSON.stringify(this.manifest),
      sessions: JSON.stringify(this.sessionsFile),
      counters: new Map([...this.live].map(([sess, session]) => [sess, session.next])),
      files: new Map(),
    };
  }

  commit(): void {
    if (this.nested > 0) {
      this.nested--;
      return;
    }
    this.txn = null;
  }

  /** Puts back the manifest, the sessions and every tab file written since begin(). */
  rollback(): void {
    if (this.nested > 0) {
      this.nested--;
      return;
    }
    const txn = this.txn;
    if (!txn) return;
    this.txn = null;
    for (const [file, text] of txn.files) {
      if (text === null) fs.rmSync(file, { force: true });
      else writeAtomic(file, text);
    }
    this.manifest = JSON.parse(txn.manifest) as Manifest;
    this.sessionsFile = JSON.parse(txn.sessions) as SessionsFile;
    for (const [sess, session] of [...this.live]) {
      const next = txn.counters.get(sess);
      if (next === undefined) this.live.delete(sess);
      else session.next = next;
    }
    this.docs.clear();
    this.histories.clear();
    this.saveManifest();
    writeJson(path.join(this.root, SESSIONS_FILE), this.sessionsFile);
  }

  /** Writes a tab file, remembering what it held when a transaction is open. */
  private writeTab(file: string, value: unknown): void {
    this.remember(file);
    writeJson(file, value);
  }

  private remember(file: string): void {
    if (!this.txn || this.txn.files.has(file)) return;
    let prior: string | null = null;
    try {
      prior = fs.readFileSync(file, 'utf8');
    } catch {}
    this.txn.files.set(file, prior);
  }

  /** Stores a tab's new content (and the counters of the session that wrote it); `writer` gets the version. */
  putDoc(tabId: string, doc: DocState, writer: Writer): void {
    this.tab(tabId);
    const file = path.join(this.root, TABS_DIR, `${tabId}.json`);
    const before = this.doc(tabId);
    let beforeAt = new Date().toISOString();
    try {
      beforeAt = fs.statSync(file).mtime.toISOString();
    } catch {}
    const recorded = recordWrite(this.history(tabId), before, beforeAt, doc, writer, new Date());
    const dir = this.historyDir(tabId);
    for (const [rev, state] of recorded.write) this.writeTab(path.join(dir, `${rev}.json`), docToDisk(state));
    for (const rev of recorded.remove) {
      const old = path.join(dir, `${rev}.json`);
      this.remember(old);
      fs.rmSync(old, { force: true });
    }
    this.writeTab(path.join(dir, HISTORY_INDEX), recorded.index);
    this.histories.set(tabId, recorded.index);
    this.writeTab(file, docToDisk(doc));
    this.docs.set(tabId, doc);
    this.touch();
    this.saveSessions();
  }

  // ---- history (history.ts) ----

  private historyDir(tabId: string): string {
    return path.join(this.root, HISTORY_DIR, tabId);
  }

  /** The tab's versions, oldest first (null: it has no history yet). */
  history(tabId: string): HistoryIndex | null {
    if (this.histories.has(tabId)) return this.histories.get(tabId)!;
    let index: HistoryIndex | null = null;
    try {
      const read = JSON.parse(fs.readFileSync(path.join(this.historyDir(tabId), HISTORY_INDEX), 'utf8')) as HistoryIndex;
      if (Array.isArray(read.versions)) index = { ...emptyIndex(), ...read };
    } catch {}
    this.histories.set(tabId, index);
    return index;
  }

  /** The tab as it stood at `rev`: the tab now, or a kept version's snapshot (null: not kept). */
  snapshot(tabId: string, rev: number): DocState | null {
    const now = this.doc(tabId);
    if (rev === now.rev) return now;
    try {
      return docFromDisk(JSON.parse(fs.readFileSync(path.join(this.historyDir(tabId), `${rev}.json`), 'utf8')) as DiskDoc);
    } catch {
      return null;
    }
  }

  /**
   * Puts the tab back as it was at `rev` (a kept version), as a new write: the version it makes says what it restored.
   * Nothing changes when the tab already holds that content.
   */
  restoreTab(tabId: string, rev: number, writer: Writer): { restored: boolean; rev: number } {
    const old = this.snapshot(tabId, rev);
    if (!old) throw new StoreError('NO_VERSION', `Tab ${tabId} keeps no version at rev ${rev}.`);
    const now = this.doc(tabId);
    if (JSON.stringify(docToDisk(old).blocks) === JSON.stringify(docToDisk(now).blocks)) return { restored: false, rev: now.rev };
    const doc: DocState = { rev: now.rev + 1, blocks: structuredClone(old.blocks), ...(old.suggestions ? { suggestions: structuredClone(old.suggestions) } : {}) };
    this.putDoc(tabId, doc, { ...writer, restoredFrom: rev });
    return { restored: true, rev: doc.rev };
  }

  /** Adds a tab after the last one (or at `order`); returns its id, a new one unless `id` is one picked already. */
  addTab(name: string, blocks: Block[], order?: string, save = true, id = shortId()): string {
    const last = this.tabIds().map(tab => this.manifest.tabs[tab]!.order).pop();
    this.manifest.tabs[id] = { name, order: order ?? orderAfter(last), node: shortId() };
    const doc: DocState = { rev: 1, blocks };
    this.writeTab(path.join(this.root, TABS_DIR, `${id}.json`), docToDisk(doc));
    this.docs.set(id, doc);
    if (save) {
      this.touch();
      this.saveSessions();
    }
    return id;
  }

  renameTab(id: string, name: string): void {
    this.tab(id).name = name;
    this.touch();
  }

  moveTab(id: string, order: string): void {
    this.tab(id).order = order;
    this.touch();
  }

  /** Puts a tab under another in the tab list (`parent` undefined takes it out again). */
  nestTab(id: string, parent: string | undefined): void {
    const tab = this.tab(id);
    if (parent === undefined) delete tab.subtabOf;
    else {
      this.tab(parent);
      for (let at: string | undefined = parent; at; at = this.manifest.tabs[at]?.subtabOf)
        if (at === id) throw new StoreError('TAB_LOOP', 'A tab cannot sit under itself or under a tab it holds.');
      tab.subtabOf = parent;
    }
    this.touch();
  }

  /** Removes a tab; its content file goes to <root>/tabs/.deleted/ so nothing is lost. */
  deleteTab(id: string): void {
    this.tab(id);
    if (Object.keys(this.manifest.tabs).length <= 1) throw new StoreError('LAST_TAB', 'A doc keeps at least one tab.');
    delete this.manifest.tabs[id];
    this.docs.delete(id);
    for (const tab of Object.values(this.manifest.tabs)) if (tab.subtabOf === id) delete tab.subtabOf;
    const file = path.join(this.root, TABS_DIR, `${id}.json`);
    const bin = path.join(this.root, TABS_DIR, '.deleted');
    try {
      this.remember(file);
      this.remember(path.join(bin, `${id}.json`));
      fs.mkdirSync(bin, { recursive: true });
      fs.renameSync(file, path.join(bin, `${id}.json`));
    } catch {}
    this.touch();
  }

  rename(name: string): void {
    this.manifest.name = name;
    this.touch();
  }

  /** Sets one display key, or the whole record when key is undefined; a value of undefined removes it. */
  setDisplay(key: string | undefined, value: unknown): void {
    if (key === undefined) {
      if (value === undefined) delete this.manifest.display;
      else this.manifest.display = { ...(value as Record<string, unknown>) };
    } else {
      const display = { ...this.manifest.display };
      if (value === undefined) delete display[key];
      else display[key] = value;
      if (Object.keys(display).length) this.manifest.display = display;
      else delete this.manifest.display;
    }
    this.touch();
  }

  addEnum(def: EnumDef): string {
    const id = shortId();
    this.manifest.enums[id] = def;
    this.touch();
    return id;
  }

  updateEnum(id: string, def: EnumDef): void {
    this.manifest.enums[id] = def;
    this.touch();
  }

  /** Bumps head and the updated time, and saves the manifest. */
  touch(): void {
    this.manifest.head += 1;
    this.manifest.updated = new Date().toISOString();
    this.saveManifest();
  }

  saveManifest(): void {
    writeJson(path.join(this.root, MANIFEST_FILE), this.manifest);
  }

  // ---- sessions ----

  private sessionOf(sess: string): Session | null {
    const live = this.live.get(sess);
    if (live) return live;
    const record = this.sessionsFile.sessions[sess];
    if (!record) return null;
    const session: Session = { sess, next: record.next };
    this.live.set(sess, session);
    return session;
  }

  /** A new session for a page connection. */
  mintSession(): Session {
    let sess = sessionId();
    while (this.sessionsFile.sessions[sess]) sess = sessionId();
    this.sessionsFile.sessions[sess] = { next: 0, kind: 'page', created: new Date().toISOString() };
    const pages = Object.entries(this.sessionsFile.sessions).filter(([, record]) => record.kind === 'page');
    // Old page sessions only hold counters for ids already written; drop the oldest beyond the cap.
    for (const [old] of pages.slice(0, Math.max(0, pages.length - MAX_PAGE_SESSIONS))) {
      delete this.sessionsFile.sessions[old];
      this.live.delete(old);
    }
    this.saveSessions();
    return this.sessionOf(sess)!;
  }

  session(sess: string): Session | null {
    return this.sessionOf(sess);
  }

  /** Whether a session is a page's (a person typing) or the CLI's (the agent). */
  sessionKind(sess: string): 'page' | 'cli' | null {
    return this.sessionsFile.sessions[sess]?.kind ?? null;
  }

  /** The session CLI writes use (made on first use). */
  cliSession(): Session {
    const existing = this.sessionsFile.cli ? this.sessionOf(this.sessionsFile.cli) : null;
    if (existing) return existing;
    let sess = sessionId();
    while (this.sessionsFile.sessions[sess]) sess = sessionId();
    this.sessionsFile.sessions[sess] = { next: 0, kind: 'cli', created: new Date().toISOString() };
    this.sessionsFile.cli = sess;
    return this.sessionOf(sess)!;
  }

  saveSessions(): void {
    for (const [sess, session] of this.live) {
      const record = this.sessionsFile.sessions[sess];
      if (record) record.next = session.next;
    }
    writeJson(path.join(this.root, SESSIONS_FILE), this.sessionsFile);
  }
}

/** The name a doc's first tab gets. */
export const FIRST_TAB_NAME = 'Tab 1';

/** The doc folder of an artifact. */
export const docDirOf = (artifactRoot: string) => path.join(artifactRoot, DOC_DIR);

/**
 * The files of a new doc (paths under `doc/`): one tab holding one empty paragraph, written with the CLI session so
 * the agent's first write takes its ids from the same counter.
 */
export function scaffoldDoc(title: string): Record<string, string> {
  const now = new Date().toISOString();
  const sess = sessionId();
  const tab = shortId();
  const manifest: Manifest = {
    format: DOC_FORMAT,
    version: 1,
    id: randomUUID(),
    name: title,
    created: now,
    updated: now,
    head: 1,
    tabs: { [tab]: { name: FIRST_TAB_NAME, order: orderAfter(undefined), node: shortId() } },
    enums: {},
  };
  const doc: DocState = { rev: 1, blocks: [newBlock('paragraph', `${sess}.0`)] };
  const sessions: SessionsFile = { sessions: { [sess]: { next: 1, kind: 'cli', created: now } }, cli: sess };
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  return { [MANIFEST_FILE]: json(manifest), [`${TABS_DIR}/${tab}.json`]: json(docToDisk(doc)), [SESSIONS_FILE]: json(sessions) };
}
