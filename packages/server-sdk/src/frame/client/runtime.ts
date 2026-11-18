/**
 * Frame Runtime of frame-host. Loaded first in an original page's <head>, on
 * the page's own origin. It defines `window.openartifact`: `use(name)` and the
 * granted capabilities. Every call is a `__frame_cap` postMessage to the inner
 * shell (the parent frame, whose origin the server wrote into
 * `window.__OPEN_ARTIFACT_FRAME`); the shell carries it to the local backend and
 * answers. Nothing here talks to the network by itself.
 *
 * Follows the frame runtime where a page can tell: the call envelope
 * and ids, `{code, message}` errors, per-capability timeouts and what they
 * do, acks (900 s once acked), `__frame_cap_rewired` with brokerGen, lazy
 * `__frame_cap_want` / `__frame_cap_grant`, the `user` config answered
 * locally. Deviations are marked "Here:".
 *
 * A plain script: types are imported, nothing else, so Node can serve it from
 * source with its types stripped, and esbuild builds it as one IIFE.
 */

import type { CapErrorBody, FrameBoot, FrameInit } from '../wire.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
type Fn = (...args: Any[]) => Any;

(() => {
  'use strict';
  const w = window as Any;
  if (w.openArtifact && w.openArtifact.__openArtifactFrame) return;

  const boot: Partial<FrameBoot> = w.__OPEN_ARTIFACT_FRAME || {};
  const SHELL = boot.shellOrigin || '';
  const parentWin = window.parent;
  const framed = !!SHELL && !!parentWin && parentWin !== window;
  const INIT_TIMEOUT_MS = 10_000;
  const WANT_TIMEOUT_MS = 10_000;
  const ACKED_MS = 900_000;
  const BUDGET_MAX_MS = 600_000;
  const REWIRED_MESSAGE = 'may not have run: the artifact was updated before this call was answered';
  const grants: string[] = Array.isArray(boot.grants) ? boot.grants.slice() : [];
  const stubs: string[] = Array.isArray(boot.stubs) ? boot.stubs.slice() : [];

  
  const TIMEOUTS: Record<string, [number, string | null, number]> = {
    downloads: [150_000, 'unavailable', 0],
    assets: [130_000, 'upstream_error', ACKED_MS],
    user: [20_000, null, 0],
    artifact: [130_000, 'upstream_error', 0],
    comments: [130_000, 'upstream_error', ACKED_MS],
    permissions: [130_000, 'upstream_error', ACKED_MS],
    room: [130_000, 'upstream_error', 0],
    db: [130_000, 'unavailable', 0],
  };
  
  const PREFIX: Record<string, string> = { downloads: 'd', assets: 'e', permissions: 'p', user: 'u', artifact: 's', room: 'r', comments: 'k', db: 'b' };
  /** Calls sent with the user's activation. */
  const ACTIVATED: Record<string, true> = { 'permissions.request': true, 'room.sendToAgentSession': true };

  interface Pending {
    cap: string;
    method: string;
    resolve(v: unknown): void;
    reject(e: unknown): void;
    timer: ReturnType<typeof setTimeout> | null;
  }

  let seq = 0;
  const salt = new Uint32Array(1);
  const pending = new Map<string, Pending>();
  let init: FrameInit | null = null;
  let initDone = false;
  let initWaiters: ((v: FrameInit | null) => void)[] = [];
  /** The broker generation this page knows (from init, a grant or a rewire). */
  let brokerGen: number | undefined;
  const configs: Record<string, Record<string, Any>> = Object.create(null);

  function post(msg: unknown, activation = false): void {
    if (!framed) return;
    try {
      // includeUserActivation: Chromium's, ignored elsewhere.
      if (activation) parentWin.postMessage(msg, { targetOrigin: SHELL, includeUserActivation: true } as WindowPostMessageOptions);
      else parentWin.postMessage(msg, SHELL);
    } catch {
      // the shell went away
    }
  }

  function frameError(code: unknown, message: unknown, extra?: Any, name?: string): Error {
    const err = new Error(typeof message === 'string' && message ? message : String(code || 'error')) as Error & Record<string, unknown>;
    err.name = name || 'FrameError';
    err.code = typeof code === 'string' && code ? code : 'upstream_error';
    if (extra && typeof extra === 'object') for (const k of Object.keys(extra)) if (k !== 'message' && k !== 'name' && k !== 'stack') err[k] = extra[k];
    return err;
  }

  function whenInit(): Promise<FrameInit | null> {
    if (initDone) return Promise.resolve(init);
    return new Promise((resolve) => initWaiters.push(resolve));
  }

  function finishInit(value: FrameInit | null): void {
    if (initDone) return;
    initDone = true;
    init = value;
    if (value) {
      if (typeof value.brokerGen === 'number') brokerGen = value.brokerGen;
      const caps = value.capabilities || {};
      for (const cap of Object.keys(caps)) configs[cap] = (caps[cap] && caps[cap]!.config) || {};
    }
    const list = initWaiters;
    initWaiters = [];
    for (const fn of list) fn(value);
  }

  function timeoutOf(cap: string, method: string): [number, string | null] {
    const t = TIMEOUTS[cap] || [130_000, 'upstream_error', 0];
    const budget = init && init.capBudgets && init.capBudgets[cap] ? init.capBudgets[cap]![method] : undefined;
    if (typeof budget === 'number' && budget > 0) return [Math.min(budget, BUDGET_MAX_MS) + 2000, t[1]];
    return [t[0], t[1]];
  }

  function arm(id: string, p: Pending, ms: number, code: string | null): void {
    if (p.timer) clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      if (!pending.delete(id)) return;
      if (code === null) p.resolve(null);
      else p.reject({ code, message: `${p.cap}.${p.method} did not answer in time.` });
    }, ms);
  }

  function call(cap: string, method: string, arg: unknown, errorName?: string, transfer?: Transferable[]): Promise<Any> {
    if (!framed) return Promise.reject(frameError('unavailable', 'This page is not inside its frame shell.', null, errorName));
    return new Promise((resolve, reject) => {
      crypto.getRandomValues(salt);
      const id = `${PREFIX[cap] || 'x'}${salt[0]!.toString(36)}.${++seq}`;
      const p: Pending = {
        cap,
        method,
        resolve: (v) => {
          if (p.timer) clearTimeout(p.timer);
          resolve(v);
        },
        reject: (e: Any) => {
          if (p.timer) clearTimeout(p.timer);
          if (boot.debug) post({ __open_artifact_console: true, level: 'warn', text: `${cap}.${method} → ${(e && e.code) || 'error'}: ${(e && e.message) || ''}` });
          reject(frameError(e && e.code, e && e.message, e, errorName));
        },
        timer: null,
      };
      pending.set(id, p);
      const [ms, code] = timeoutOf(cap, method);
      arm(id, p, ms, code);
      const msg: Record<string, unknown> = { __frame_cap: true, cap, id, method, args: [arg] };
      if (brokerGen !== undefined) msg.brokerGen = brokerGen;
      if (cap === 'assets') msg.holds = true;
      const activation = cap === 'comments' || ACTIVATED[`${cap}.${method}`] === true;
      try {
        if (transfer && transfer.length) parentWin.postMessage(msg, { targetOrigin: SHELL, transfer });
        else if (activation) parentWin.postMessage(msg, { targetOrigin: SHELL, includeUserActivation: true } as WindowPostMessageOptions);
        else parentWin.postMessage(msg, SHELL);
      } catch (e) {
        pending.delete(id);
        p.reject({ code: 'invalid_argument', message: String((e as Error)?.message || e) });
      }
    });
  }

  // ---- messages from the shell ------------------------------------------------------------------------------------

  const dbSubs = new Map<string, { deliver(d: Any): void; resubscribe(): void; revoke(): void }>();
  const roomHandlers = new Map<string, Set<Fn>>();
  const peerHandlers = new Set<Fn>();
  const connHandlers = new Set<Fn>();
  const wants = new Map<string, (grant: Any) => void>();
  let anchors: { callbacks: Any } | null = null;
  let commentsMode = false;

  window.addEventListener('message', (ev) => {
    if (ev.source !== parentWin || ev.origin !== SHELL) return;
    const d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.__frame_init && typeof d.__frame_init === 'object') return finishInit(d.__frame_init as FrameInit);
    if (d.__frame_cap_r === true) {
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      if (d.error != null) p.reject(d.error as CapErrorBody);
      else p.resolve(d.result);
      return;
    }
    if (d.__frame_cap_ack === true) {
      const p = pending.get(d.id);
      const t = p && TIMEOUTS[p.cap];
      if (p && t && t[2]) arm(d.id, p, t[2], t[1]);
      return;
    }
    if (d.__frame_cap_rewired === true) return onRewired(d);
    if (d.__frame_cap_grant === true) {
      const fn = wants.get(d.cap);
      if (fn) fn(d);
      return;
    }
    if (d.__frame_db_ev === true) {
      const sub = dbSubs.get(d.sub);
      if (sub) sub.deliver(d);
      return;
    }
    if (d.__frame_room_ev === true) return onRoomEvent(d);
    if (d.__open_artifact_comments === true) onCommentsEvent(d);
  });

  
  function onRewired(d: Any): void {
    const changed = d.brokerGen !== undefined && brokerGen !== undefined && d.brokerGen !== brokerGen;
    if (typeof d.brokerGen === 'number') brokerGen = d.brokerGen;
    const caps: string[] | null = Array.isArray(d.caps) ? d.caps : null;
    const gone = (cap: string): boolean => !!caps && caps.indexOf(cap) < 0 && !(cap === 'artifact' && caps.indexOf('self') >= 0);
    for (const [id, p] of [...pending]) {
      if (gone(p.cap) && p.cap === 'db') {
        pending.delete(id);
        p.reject({ code: 'revoked', message: 'The document store is no longer available to this artifact.' });
      } else if (changed) {
        pending.delete(id);
        if (p.cap === 'user') p.resolve(null);
        else p.reject({ code: p.cap === 'db' || p.cap === 'downloads' ? 'unavailable' : 'upstream_error', message: REWIRED_MESSAGE });
      }
    }
    if (gone('db')) for (const s of dbSubs.values()) s.revoke();
    else if (changed) for (const s of dbSubs.values()) s.resubscribe();
    if (gone('room')) {
      connected = false;
      for (const fn of connHandlers) safely(fn, false);
    }
  }

  function connect(): void {
    if (!framed) return finishInit(null);
    let tries = 0;
    // Here: `__frame_connect` repeats every 400 ms.
    const tick = (): void => {
      if (initDone) return;
      post({ __frame_connect: true, contract: boot.contract, key: boot.key });
      if (++tries * 400 < INIT_TIMEOUT_MS) setTimeout(tick, 400);
      else finishInit(null);
    };
    tick();
  }

  function safely(fn: Fn, ...args: unknown[]): void {
    try {
      fn(...args);
    } catch (e) {
      setTimeout(() => {
        throw e;
      });
    }
  }

  // ---- db -----------------------------------------------------------------------------------------------------------
  // Here: the db wire is this host's own (one object argument; subscriptions re-run by the shell, delivered as
  

  const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
  const enc = new TextEncoder();
  function segsOf(path: unknown, kind: 'doc' | 'collection'): string[] {
    if (typeof path !== 'string') throw new TypeError('A db path is a string.');
    const t = path.replace(/^\/+|\/+$/g, '');
    if (!t) throw new TypeError('An empty db path.');
    if (enc.encode(t).length > 1000) throw new TypeError('A db path is at most 1000 bytes.');
    const segs = t.split('/');
    if (segs.length > 16) throw new TypeError('A db path has at most 16 segments.');
    for (const s of segs) {
      if (!SEG.test(s) || s === '.' || s === '..' || enc.encode(s).length > 200) throw new TypeError(`Bad db path segment ${JSON.stringify(s)}.`);
    }
    if (kind === 'doc' && segs.length % 2 !== 0) throw new TypeError(`${t} names a collection, not a document.`);
    if (kind === 'collection' && segs.length % 2 !== 1) throw new TypeError(`${t} names a document, not a collection.`);
    return segs;
  }
  const clone = (v: unknown): Any => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  function fieldOf(data: Any, field: string): Any {
    let v = data;
    for (const k of String(field).split('.')) v = v && typeof v === 'object' ? v[k] : undefined;
    return v;
  }
  const META = Object.freeze({ fromCache: false, hasPendingWrites: false });

  function docSnap(ref: Any, data: Any): Any {
    return {
      id: ref.id,
      ref,
      exists: data !== undefined,
      metadata: META,
      data: () => clone(data),
      get: (field: string) => clone(fieldOf(data, field)),
    };
  }

  const dbCall = (method: string, arg: unknown): Promise<Any> => call('db', method, arg, 'DbError');

  function observer(next: Any, error?: Fn): { next: Fn; error: Fn } {
    if (next && typeof next === 'object') return { next: (next.next || (() => {})).bind(next), error: (next.error || (() => {})).bind(next) };
    return { next: next || (() => {}), error: error || (() => {}) };
  }

  function subscribe(kind: 'doc' | 'query', path: string, spec: unknown, onData: Fn, onError: Fn): () => void {
    if (dbSubs.size >= 64) throw frameError('resource_exhausted', 'At most 64 db subscriptions.', null, 'DbError');
    const id = `sub${++seq}`;
    let live = true;
    const start = (): void => {
      dbCall('subscribe', { sub: id, kind, path, spec }).catch((e) => {
        if (live) onError(e);
      });
    };
    dbSubs.set(id, {
      deliver: (d) => {
        if (!live) return;
        if (d.error) onError(frameError(d.error.code, d.error.message, null, 'DbError'));
        else onData(d);
      },
      resubscribe: start,
      revoke: () => {
        if (!live) return;
        live = false;
        dbSubs.delete(id);
        onError(frameError('revoked', 'The document store is no longer available to this artifact.', null, 'DbError'));
      },
    });
    start();
    return () => {
      if (!live) return;
      live = false;
      dbSubs.delete(id);
      dbCall('unsubscribe', { sub: id }).catch(() => {});
    };
  }

  let holder: string | null = null;
  const holderId = (): string => (holder ||= `tab-${Math.random().toString(36).slice(2, 10)}`);

  function docRef(path: string): Any {
    const segs = segsOf(path, 'doc');
    const full = segs.join('/');
    const ref: Any = {
      id: segs[segs.length - 1],
      path: full,
      get parent() {
        return collectionRef(segs.slice(0, -1).join('/'));
      },
      collection: (sub: string) => collectionRef(`${full}/${sub}`),
      get: () => dbCall('get', { path: full }).then((r) => docSnap(ref, r && r.exists ? r.data : undefined)),
      set: (data: unknown) => dbCall('set', { path: full, data: clone(data) }).then(() => {}),
      update: (data: unknown) => dbCall('update', { path: full, data: clone(data) }).then(() => {}),
      delete: () => dbCall('delete', { path: full }).then(() => {}),
      acquire: (opts: Any) => {
        const o = opts || {};
        return dbCall('acquire', { path: full, options: { holder: o.holder || holderId(), ttlMs: o.ttlMs === undefined ? 30000 : o.ttlMs, data: o.data } });
      },
      release: (h?: string) => dbCall('release', { path: full, holder: h || holderId() }),
      onSnapshot: (next: Any, error?: Fn) => {
        const o = observer(next, error);
        return subscribe('doc', full, null, (d) => o.next(docSnap(ref, d.exists ? d.data : undefined)), o.error);
      },
    };
    return ref;
  }

  interface QueryState {
    order: string[];
    text: Map<string, string>;
    data: Map<string, unknown>;
  }

  function querySnapshot(path: string, docs: { id: string; data: unknown }[], prev: QueryState | null): Any {
    const snaps = docs.map((d) => docSnap(docRef(`${path}/${d.id}`), d.data));
    const changes: Any[] = [];
    const nextIndex = new Map<string, number>();
    docs.forEach((d, i) => nextIndex.set(d.id, i));
    if (prev) {
      prev.order.forEach((id, i) => {
        if (!nextIndex.has(id)) changes.push({ type: 'removed', doc: docSnap(docRef(`${path}/${id}`), prev.data.get(id)), oldIndex: i, newIndex: -1 });
      });
    }
    docs.forEach((d, i) => {
      const before = prev ? prev.text.get(d.id) : undefined;
      if (before === undefined) changes.push({ type: 'added', doc: snaps[i], oldIndex: -1, newIndex: i });
      else if (before !== JSON.stringify(d.data)) changes.push({ type: 'modified', doc: snaps[i], oldIndex: prev!.order.indexOf(d.id), newIndex: i });
    });
    return {
      docs: snaps,
      size: snaps.length,
      empty: snaps.length === 0,
      metadata: META,
      forEach: (fn: Fn, thisArg?: unknown) => snaps.forEach(fn, thisArg),
      docChanges: () => changes.slice(),
    };
  }

  function stateOf(docs: { id: string; data: unknown }[]): QueryState {
    const s: QueryState = { order: [], text: new Map(), data: new Map() };
    for (const d of docs) {
      s.order.push(d.id);
      s.text.set(d.id, JSON.stringify(d.data));
      s.data.set(d.id, d.data);
    }
    return s;
  }

  const OPS = ['==', '!=', '<', '<=', '>', '>=', 'in', 'not-in', 'array-contains'];
  function query(path: string, spec: Any): Any {
    return {
      where: (field: string, op: string, value: unknown) => {
        if (OPS.indexOf(op) < 0) throw new TypeError(`where(): unknown operator ${op}`);
        return query(path, { ...spec, where: (spec.where || []).concat([{ field: String(field), op, value: clone(value) }]) });
      },
      orderBy: (field: string, dir?: string) => {
        if (spec.orderBy) throw new TypeError('One orderBy() per query.');
        return query(path, { ...spec, orderBy: { field: String(field), dir: dir === 'desc' ? 'desc' : 'asc' } });
      },
      limit: (n: number) => {
        if (!Number.isInteger(n) || n < 1 || n > 1000) throw new TypeError('limit() takes 1 to 1000.');
        return query(path, { ...spec, limit: n });
      },
      get: () => dbCall('query', { path, spec }).then((r) => querySnapshot(path, (r && r.docs) || [], null)),
      onSnapshot: (next: Any, error?: Fn) => {
        const o = observer(next, error);
        let prev: QueryState | null = null;
        return subscribe(
          'query',
          path,
          spec,
          (d) => {
            const docs = d.docs || [];
            const snap = querySnapshot(path, docs, prev);
            const first = prev === null;
            prev = stateOf(docs);
            if (first || snap.docChanges().length) o.next(snap);
          },
          o.error,
        );
      },
    };
  }

  function collectionRef(path: string): Any {
    const segs = segsOf(path, 'collection');
    const full = segs.join('/');
    const q = query(full, {});
    q.id = segs[segs.length - 1];
    q.path = full;
    Object.defineProperty(q, 'parent', { get: () => (segs.length > 1 ? docRef(segs.slice(0, -1).join('/')) : null) });
    q.doc = (id?: string) => docRef(`${full}/${id === undefined ? Math.random().toString(36).slice(2, 12) + Date.now().toString(36) : id}`);
    q.add = (data: unknown) => dbCall('add', { path: full, data: clone(data) }).then((r) => docRef(r.path));
    return q;
  }

  const db = {
    collection: (path: string) => collectionRef(path),
    doc: (path: string) => docRef(path),
  };

  // ---- artifact (self) ----------------------------------------------------------------------------------------------

  function bytesToB64(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
    return btoa(out);
  }

  async function encodeContent(value: unknown): Promise<Record<string, unknown>> {
    if (typeof value === 'string') return { text: value };
    if (value instanceof Blob) return { b64: bytesToB64(new Uint8Array(await value.arrayBuffer())), ...(value.type ? { contentType: value.type } : {}) };
    if (value instanceof ArrayBuffer) return { b64: bytesToB64(new Uint8Array(value)) };
    if (ArrayBuffer.isView(value)) return { b64: bytesToB64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    throw frameError('invalid_content', 'A file is a string, Blob or bytes.');
  }

  const isBytes = (v: unknown): boolean => v instanceof Blob || v instanceof ArrayBuffer || ArrayBuffer.isView(v);

  async function publish(files: unknown, opts?: Any): Promise<Any> {
    // Here: an html string has nothing to replace (index.html is the type's); the server answers read_only_path.
    if (typeof files === 'string') return call('artifact', 'publish', { html: files });
    if (!files || typeof files !== 'object') throw frameError('invalid_content', 'publish() takes a map of files.');
    const guards = opts && opts.ifMatch && typeof opts.ifMatch === 'object' ? opts.ifMatch : null;
    const paths = Object.keys(files);
    if (paths.length < 1 || paths.length > 256) throw frameError('too_large', 'publish() takes 1 to 256 paths.');
    const out: Record<string, unknown> = {};
    for (const p of paths) {
      const v = (files as Any)[p];
      const guard = guards && Object.prototype.hasOwnProperty.call(guards, p) ? { ifMatch: guards[p] } : {};
      if (v === null) out[p] = { delete: true, ...guard };
      else if (v && typeof v === 'object' && !isBytes(v)) {
        const g = 'ifMatch' in v ? { ifMatch: v.ifMatch } : guard;
        if (v.delete === true) out[p] = { delete: true, ...g };
        else out[p] = { ...(await encodeContent(v.content)), ...(v.contentType ? { contentType: v.contentType } : {}), ...g };
      } else out[p] = { ...(await encodeContent(v)), ...guard };
    }
    return call('artifact', 'publish', { files: out });
  }

  const self = {
    get id() {
      return (configs.artifact && configs.artifact.id) || boot.id;
    },
    publish,
    sync: () => call('artifact', 'sync', {}),
    metadata: (refs: unknown) => call('artifact', 'metadata', { refs: Array.isArray(refs) ? refs : [refs] }),
    search: (q: unknown, o?: Any) => call('artifact', 'search', { q: String(q || ''), ...(o || {}) }),
    edit: () => Promise.reject(frameError('capability_disabled', 'edit() is for live documents; publish the files instead.')),
  };

  // ---- assets, downloads, permissions --------------------------------------------------------------------------------

  const assets = {
    upload: (blob: unknown, opts?: Any) => {
      if (!(blob instanceof Blob)) return Promise.reject(frameError('invalid_request', 'upload() takes a Blob.'));
      return call('assets', 'upload', { blob, type: (opts && opts.type) || blob.type || '' });
    },
    list: () => call('assets', 'list', {}),
    delete: (ref: Any) => call('assets', 'delete', { ref: typeof ref === 'object' && ref ? ref.id || ref.url : ref }),
  };

  
  // shell, which asks before saving.
  const downloads = {
    save: (opts: Any) => {
      const o = opts || {};
      const filename = String(o.filename || 'download').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 200) || 'download';
      const data = o.data;
      const blob: Blob = data instanceof Blob ? data : new Blob([typeof data === 'string' || data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? (data as BlobPart) : JSON.stringify(data)]);
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        a.style.display = 'none';
        (document.body || document.documentElement).appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        if (typeof o.request === 'string') post({ __open_artifact_export_done: true, request: o.request });
        return Promise.resolve({ status: 'saved' });
      } catch (e) {
        return Promise.reject(frameError('unavailable', String((e as Error)?.message || e)));
      }
    },
  };

  // Here: answered in the page; the person on this computer holds every capability the type declared.
  function permissionState(name: string): Promise<string> {
    if (grants.indexOf(name === 'self' ? 'artifact' : name) >= 0) return Promise.resolve('granted');
    const perms = navigator.permissions;
    if (perms && typeof perms.query === 'function') {
      return perms.query({ name } as PermissionDescriptor).then(
        (s) => s.state,
        () => 'unavailable',
      );
    }
    return Promise.resolve('unavailable');
  }
  async function permissionMap(list: unknown[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    await Promise.all(list.map(async (n) => (out[String(n)] = await permissionState(String(n)))));
    return out;
  }
  const permissions = {
    state: (name?: unknown) => (name !== undefined ? permissionState(String(name)) : permissionMap(grants)),
    request: (names?: unknown) => permissionMap(names === undefined ? grants : Array.isArray(names) ? names : [names]),
    manage: () => Promise.resolve(),
  };

  // ---- user ----------------------------------------------------------------------------------------------------------
  // The grant's config supplies id, isOwner, canEdit, can and the colour; profile, email, profiles,
  // access and search go to the shell; every method swallows errors into a default.

  const FALLBACK_COLOR = '#c7c9d1';
  const userConfig = async (): Promise<Record<string, Any>> => {
    await whenInit();
    return configs.user || {};
  };
  let profileCache: Promise<Any> | null = null;
  const profile = (): Promise<Any> =>
    (profileCache ||= userConfig().then((c) =>
      c.profile === true
        ? call('user', 'profile', {}).catch(() => {
            profileCache = null;
            return {};
          })
        : {},
    ));
  const colorOf = (c: Record<string, Any>): string => (typeof c.color === 'string' && /^#[0-9a-f]{6}$/.test(c.color) ? c.color : FALLBACK_COLOR);
  const user = {
    id: () => userConfig().then((c) => (typeof c.id === 'string' ? c.id : null)),
    isOwner: () => userConfig().then((c) => c.owner === true),
    canEdit: () => userConfig().then((c) => c.canEdit === true),
    // Here: with no `can` list, the owner can do anything; otherwise permissions are checked.
    can: (permission: unknown) =>
      userConfig().then((c) => (Array.isArray(c.can) ? typeof permission === 'string' && c.can.indexOf(permission) >= 0 : c.owner === true ? typeof permission === 'string' && permission.length > 0 : null)),
    me: () =>
      Promise.all([userConfig(), profile(), user.email()]).then(
        ([c, p, email]) => ({ id: c.id ?? null, name: p.name ?? '', avatarUrl: p.avatarUrl ?? null, color: colorOf(c), email, isOwner: c.owner === true, canEdit: c.canEdit === true }),
        () => ({ id: null, name: '', avatarUrl: null, color: FALLBACK_COLOR, email: null, isOwner: false, canEdit: false }),
      ),
    name: () => profile().then((p) => p.name ?? '', () => ''),
    avatarUrl: () => profile().then((p) => p.avatarUrl ?? null, () => null),
    email: () => userConfig().then((c) => (c.email === true ? call('user', 'email', {}) : null)).catch(() => null),
    profiles: (ids: unknown) => call('user', 'profiles', { ids: Array.isArray(ids) ? ids : [ids] }).catch(() => ({})),
    access: (ids: unknown) => call('user', 'access', { ids: Array.isArray(ids) ? ids : [ids] }).catch(() => ({})),
    search: (q: unknown) => call('user', 'search', { q: String(q || '') }).catch(() => []),
  };

  // ---- room ----------------------------------------------------------------------------------------------------------

  let peersNow: Any[] = [];
  let connected = false;
  const senderOf = (d: Any): Any => {
    const mine = !!init && d.from === init.client;
    return { peer: d.from, by: d.by, isMe: mine, sameTab: mine, kind: 'user', guest: false };
  };
  function onRoomEvent(d: Any): void {
    if (d.kind === 'msg') {
      const set = roomHandlers.get(d.topic);
      if (set) for (const fn of set) safely(fn, clone(d.data), senderOf(d));
    } else if (d.kind === 'peers') {
      peersNow = (d.peers || []).map((p: Any) => ({ ...p, isMe: !!init && p.peer === init.client }));
      for (const fn of peerHandlers) safely(fn, peersNow.slice());
    } else if (d.kind === 'connection') {
      connected = !!d.connected;
      for (const fn of connHandlers) safely(fn, connected);
    }
  }
  function makeRoom(prefix: string): Any {
    const t = (topic: unknown): string => prefix + String(topic);
    return {
      emit: (topic: unknown, data: unknown) => call('room', 'emit', { topic: t(topic), data: clone(data) }),
      on: (topic: unknown, handler: Fn) => {
        const key = t(topic);
        if (!roomHandlers.has(key)) roomHandlers.set(key, new Set());
        roomHandlers.get(key)!.add(handler);
        return () => roomHandlers.get(key)?.delete(handler);
      },
      presence: (patch: unknown) => call('room', 'presence', { patch: clone(patch || {}) }),
      peers: () => peersNow.slice(),
      onPeers: (fn: Fn) => {
        peerHandlers.add(fn);
        return () => peerHandlers.delete(fn);
      },
      connected: () => connected,
      onConnection: (fn: Fn) => {
        connHandlers.add(fn);
        return () => connHandlers.delete(fn);
      },
      sendToAgentSession: (data: unknown, opts?: Any) => {
        const o = opts || {};
        const report: Fn = typeof o.onStatus === 'function' ? o.onStatus : () => {};
        report('sending');
        return call('room', 'sendToAgentSession', { data: clone(data), deliver: o.deliver === 'stage' ? 'stage' : 'send' }).then(
          (r) => {
            report('sent');
            return r;
          },
          (e) => {
            report('failed');
            throw e;
          },
        );
      },
      canSendToAgentSession: () => call('room', 'canSendToAgentSession', {}),
      join: (name: unknown) => makeRoom(`${prefix}${String(name)}/`),
    };
  }
  const room = makeRoom('');

  // ---- comments ------------------------------------------------------------------------------------------------------
  // Here: the composer, cards and list are the inner shell's; the page talks to them through `comments.*` calls and
  // `__open_artifact_comments` events rather than a side channel.

  function cssPath(start: Element | null): string {
    const parts: string[] = [];
    let el = start;
    while (el && el.nodeType === 1 && el !== document.documentElement && parts.length < 12) {
      if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) {
        parts.unshift(`#${el.id}`);
        break;
      }
      let i = 1;
      let sib = el.previousElementSibling;
      for (; sib; sib = sib.previousElementSibling) if (sib.tagName === el.tagName) i++;
      parts.unshift(`${el.tagName.toLowerCase()}:nth-of-type(${i})`);
      el = el.parentElement;
    }
    return parts.join(' > ');
  }
  function anchorFor(el: Element | null, ev?: MouseEvent): Any {
    if (!el || !el.getBoundingClientRect) return { path: '', x: 0.5, y: 0.5 };
    const r = el.getBoundingClientRect();
    const x = ev && r.width ? (ev.clientX - r.left) / r.width : 0.5;
    const y = ev && r.height ? (ev.clientY - r.top) / r.height : 0.5;
    return { path: cssPath(el), x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }
  function labelFor(el: Element | null): string {
    const text = String((el && (el.getAttribute('aria-label') || el.textContent)) || '')
      .replace(/\s+/g, ' ')
      .trim();
    return text ? text.slice(0, 80) : el ? el.tagName.toLowerCase() : 'the page';
  }
  /** A document point (or an element: its centre) as a viewport point. */
  function viewportPoint(at: Any): Any {
    if (!at) return null;
    if (typeof Element !== 'undefined' && at instanceof Element) {
      const r = at.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: (Number(at.x) || 0) - window.scrollX, y: (Number(at.y) || 0) - window.scrollY };
  }

  // ---- where pins go -------------------------------------------------------------------------------------------------
  // The shell draws the pins; the page reports where they go in viewport points, again whenever it scrolls or resizes
  // A page with custom anchors gives document points; for the fallback's
  // `{path, x, y}` anchors this script finds the element.

  /** The last `placed` map of custom anchors, in document points. */
  let placedDoc: Record<string, Any> | null = null;
  /** The threads the shell sent last. */
  let shellThreads: { id: string; anchor: Any; resolved: boolean; active: boolean }[] = [];
  /** The fallback composer's anchor, while it is open. */
  let fallbackDraft: Any = null;
  let placeFrame = 0;
  let placeQueued = false;
  let placeObserver: MutationObserver | null = null;

  function pinsShown(): boolean {
    if (anchors) return !!placedDoc && (commentsMode || (anchors.callbacks.pinsOutsideMode === true && shellThreads.length > 0));
    return fallbackOn;
  }
  function fallbackPoint(anchor: Any): Any {
    if (!anchor || typeof anchor !== 'object') return null;
    let el: Element | null = null;
    try {
      el = anchor.path ? document.querySelector(String(anchor.path)) : document.documentElement;
    } catch {
      el = null;
    }
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    const fx = Number.isFinite(anchor.x) ? anchor.x : 0.5;
    const fy = Number.isFinite(anchor.y) ? anchor.y : 0.5;
    return { x: r.left + r.width * fx, y: r.top + r.height * fy };
  }
  function sendPlaced(): void {
    placeQueued = false;
    placeFrame = 0;
    if (!pinsShown()) return;
    const map: Record<string, Any> = {};
    if (anchors) {
      for (const k of Object.keys(placedDoc || {})) map[k] = placedDoc![k] ? viewportPoint(placedDoc![k]) : null;
    } else {
      for (const t of shellThreads) map[t.id] = fallbackPoint(t.anchor);
      if (fallbackDraft) map.composer = fallbackPoint(fallbackDraft);
    }
    post({ __open_artifact_comments_placed: true, map });
  }
  /** A report soon: after the current task (a microtask), or on the next frame (scroll, resize, DOM changes). */
  function queuePlaced(frame = false): void {
    if (frame) {
      if (!placeFrame) placeFrame = requestAnimationFrame(sendPlaced);
      return;
    }
    if (placeQueued) return;
    placeQueued = true;
    queueMicrotask(sendPlaced);
  }
  const onPlaceMove = (): void => {
    if (pinsShown()) queuePlaced(true);
  };
  window.addEventListener('scroll', onPlaceMove, { capture: true, passive: true });
  window.addEventListener('resize', onPlaceMove);
  /** The fallback's pins follow the page's layout while comment mode is on. */
  function watchLayout(on: boolean): void {
    if (on && !placeObserver && typeof MutationObserver === 'function' && document.body) {
      placeObserver = new MutationObserver(onPlaceMove);
      placeObserver.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    } else if (!on && placeObserver) {
      placeObserver.disconnect();
      placeObserver = null;
    }
  }

  const sendListeners = new Set<Fn>();
  let fallbackOn = false;
  /** The editor kit's comment cursor (COMMENT_CURSOR in editor-kit's CommentViews.tsx), spelled out: this script imports nothing. */
  const COMMENT_CURSOR =
    'url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2728%27%20height=%2728%27%20viewBox=%270%200%2028%2028%27%3E%3Cpath%20d=%27M%202%2026%20L%202%2014%20A%2012%2012%200%201%201%2014%2026%20Z%27%20fill=%27%23000%27%20stroke=%27%23fff%27%20stroke-width=%272%27/%3E%3C/svg%3E") 2 26, crosshair';
  let cursorStyle: HTMLStyleElement | null = null;
  /** The outline of the element under the pointer while commenting, as in the editors. */
  let hoverBox: HTMLDivElement | null = null;
  let hoverFrame = 0;
  let hoverEvent: MouseEvent | null = null;
  function fallbackTarget(ev: Event): Element | null {
    const target = ev.target as Node | null;
    return target && target.nodeType === 1 ? (target as Element) : (target && target.parentElement) || null;
  }
  function paintHover(): void {
    hoverFrame = 0;
    const ev = hoverEvent;
    const el = ev ? fallbackTarget(ev) : null;
    if (!el || el === document.documentElement || el === document.body || !el.getBoundingClientRect) {
      if (hoverBox) hoverBox.style.display = 'none';
      return;
    }
    if (!hoverBox) {
      hoverBox = document.createElement('div');
      hoverBox.setAttribute('aria-hidden', 'true');
      Object.assign(hoverBox.style, {
        position: 'fixed',
        zIndex: '2147483647',
        pointerEvents: 'none',
        boxSizing: 'border-box',
        border: '2px solid rgba(245, 158, 11, 0.8)',
        borderRadius: '2px',
      });
      document.documentElement.append(hoverBox);
    }
    const r = el.getBoundingClientRect();
    Object.assign(hoverBox.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }
  function fallbackMove(ev: MouseEvent): void {
    hoverEvent = ev;
    if (!hoverFrame) hoverFrame = requestAnimationFrame(paintHover);
  }
  function fallbackLeave(): void {
    hoverEvent = null;
    if (hoverBox) hoverBox.style.display = 'none';
  }
  function fallbackClick(ev: MouseEvent): void {
    if (!commentsMode || anchors) return;
    ev.preventDefault();
    ev.stopPropagation();
    const el = fallbackTarget(ev);
    fallbackLeave();
    const anchor = anchorFor(el, ev);
    call('comments', 'compose', { anchor, at: { x: ev.clientX, y: ev.clientY }, label: labelFor(el), click: true })
      .then((r) => {
        fallbackDraft = r && r.opened ? anchor : null;
        queuePlaced();
      })
      .catch(() => {});
  }
  function setFallback(on: boolean): void {
    if (on === fallbackOn) return;
    fallbackOn = on;
    if (on) {
      document.addEventListener('click', fallbackClick, true);
      document.addEventListener('mousemove', fallbackMove, true);
      document.addEventListener('mouseleave', fallbackLeave);
      document.addEventListener('scroll', fallbackLeave, true);
      document.documentElement.style.cursor = COMMENT_CURSOR;
      // Elements with a cursor of their own too (a page whose CSP refuses this sheet keeps theirs).
      cursorStyle = document.createElement('style');
      cursorStyle.textContent = `*, *::before, *::after { cursor: ${COMMENT_CURSOR} !important; }`;
      document.head.append(cursorStyle);
      watchLayout(true);
      queuePlaced();
    } else {
      document.removeEventListener('click', fallbackClick, true);
      document.removeEventListener('mousemove', fallbackMove, true);
      document.removeEventListener('mouseleave', fallbackLeave);
      document.removeEventListener('scroll', fallbackLeave, true);
      document.documentElement.style.cursor = '';
      cursorStyle?.remove();
      cursorStyle = null;
      fallbackLeave();
      watchLayout(false);
      fallbackDraft = null;
    }
  }

  function onCommentsEvent(d: Any): void {
    const cb = anchors && anchors.callbacks;
    if (d.op === 'mode') {
      commentsMode = !!d.on;
      if (cb && typeof cb.mode === 'function') safely(() => cb.mode(commentsMode));
      else if (!anchors) setFallback(commentsMode);
      if (commentsMode) queuePlaced();
    } else if (d.op === 'threads') {
      shellThreads = (Array.isArray(d.threads) ? d.threads : []).map((t: Any) => ({ id: String(t.id), anchor: t.anchor, resolved: !!t.resolved, active: !!t.active }));
      if (cb && typeof cb.threads === 'function') safely(() => cb.threads(shellThreads.map((t) => ({ ...t }))));
      queuePlaced();
    } else if (d.op === 'reveal') {
      if (cb && typeof cb.reveal === 'function') safely(() => cb.reveal(d.id));
      else if (!anchors) revealFallback(d.id);
    } else if (d.op === 'composing') {
      if (d.state === false) fallbackDraft = null;
      if (cb && typeof cb.composing === 'function') safely(() => cb.composing(d.state === undefined ? null : d.state));
    } else if (d.op === 'move') {
      void answerMove(cb, d);
    } else if (d.op === 'send') {
      // The person sent a comment to the agent from the shell: a page that handles it itself says so (and, while its
      // listeners work, that it is on it, so the shell waits).
      if (sendListeners.size) post({ __open_artifact_comments_sent: true, ticket: d.ticket, pending: true });
      let chain: Promise<Any> = Promise.resolve({ handled: false });
      for (const fn of sendListeners) chain = chain.then((r) => (r && r.handled ? r : Promise.resolve(fn(d.payload)).catch(() => ({ handled: false }))));
      chain.then((r) => post({ __open_artifact_comments_sent: true, ticket: d.ticket, handled: !!(r && r.handled), reply: r && typeof r.reply === 'string' ? r.reply : undefined }));
    }
  }

  /** A fallback thread brought into view: its element scrolled to, then its pin follows. */
  function revealFallback(id: unknown): void {
    const t = shellThreads.find((x) => x.id === id);
    if (!t || !t.anchor || typeof t.anchor !== 'object') return;
    try {
      const el = t.anchor.path ? document.querySelector(String(t.anchor.path)) : null;
      el?.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch {
      // a path this page no longer has
    }
    queuePlaced(true);
  }

  /** A pin dropped at a viewport point: the page's `move` callback names the anchor there (within two seconds). */
  async function answerMove(cb: Any, d: Any): Promise<void> {
    const refuse = (): void => post({ __open_artifact_comments_moved: true, n: d.n, refused: true });
    if (!cb || typeof cb.move !== 'function' || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return refuse();
    try {
      const answer = await Promise.race([
        Promise.resolve(cb.move(String(d.id), { x: d.x + window.scrollX, y: d.y + window.scrollY })),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      if (!answer || typeof answer !== 'object' || typeof answer.anchor !== 'string') return refuse();
      post({
        __open_artifact_comments_moved: true,
        n: d.n,
        anchor: answer.anchor,
        ...(typeof answer.label === 'string' ? { label: answer.label } : {}),
        ...(typeof answer.detail === 'string' ? { detail: answer.detail } : {}),
      });
    } catch {
      refuse();
    }
  }

  // Escape in comment mode reaches the shell (cards, the list, then the mode close there).
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && commentsMode && !ev.defaultPrevented) post({ __frame_escape: true });
  });

  const comments = {
    openComposer: (opts?: Any) => {
      const el: Element | null = (opts && opts.element) || null;
      const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      return call('comments', 'compose', {
        anchor: el ? anchorFor(el) : { path: '', x: 0.5, y: 0.5 },
        at: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null,
        label: el ? labelFor(el) : 'the page',
      });
    },
    anchorFor: (el: Element) => anchorFor(el),
    create: (o: Any) => call('comments', 'create', { anchor: clone(o && o.anchor), text: o && o.text, label: o && o.label }).then((r) => ({ threadId: r.threadId, commentId: r.commentId })),
    reply: (a: Any, b?: string) => {
      const o = typeof a === 'object' && a ? a : { threadId: a, text: b };
      return call('comments', 'reply', { threadId: o.threadId, text: o.text }).then((r) => ({ threadId: r.threadId, commentId: r.commentId }));
    },
    resolve: (threadId: string, resolved?: boolean) => call('comments', 'resolve', { threadId, resolved: resolved !== false }).then(() => {}),
    delete: (threadId: string, commentId?: string) => call('comments', 'delete', { threadId, commentId }).then(() => {}),
    list: () => call('comments', 'list', {}).then((r) => r.threads),
    sendToAgent: (o: Any) => call('comments', 'sendToAgent', clone(o || {})),
    canSendToAgent: () => call('comments', 'canSendToAgent', {}),
    onSendToAgent: (fn: Fn) => {
      sendListeners.add(fn);
      return () => sendListeners.delete(fn);
    },
    customAnchors: (callbacks: Any) => {
      const mine = { callbacks: callbacks || {} };
      anchors = mine;
      placedDoc = null;
      setFallback(false);
      const ctl = {
        // While registered, compose is the viewer's click (the shell turns comment mode on, or closes what is open).
        compose: (anchor: unknown, at: Any, opts?: Any) => {
          const o = opts || {};
          return call('comments', 'compose', { anchor: clone(anchor), at: viewportPoint(at), label: o.label, detail: o.detail, area: !!o.area, click: true });
        },
        open: (id: string, at: Any) => call('comments', 'open', { id, at: viewportPoint(at) }),
        // Kept in document points: reported now, and again on every scroll and resize.
        placed: (map: Any) => {
          if (anchors !== mine) return;
          const doc: Record<string, Any> = {};
          for (const k of Object.keys(map || {})) {
            const v = map[k];
            doc[k] = v && typeof v === 'object' ? (typeof Element !== 'undefined' && v instanceof Element ? v : { x: Number(v.x), y: Number(v.y) }) : null;
          }
          placedDoc = doc;
          queuePlaced();
        },
        domAnchor: (el: Element, ev?: MouseEvent) => anchorFor(el, ev),
        exitMode: () => void call('comments', 'mode', { on: false }).catch(() => {}),
        release: () => {
          if (anchors === mine) {
            anchors = null;
            placedDoc = null;
            // Click-to-comment works again.
            setFallback(commentsMode);
          }
          call('comments', 'custom', { on: false }).catch(() => {});
        },
        areas: undefined,
      };
      return call('comments', 'custom', { on: true, pins: callbacks && callbacks.pinsOutsideMode === true, move: !!callbacks && typeof callbacks.move === 'function' }).then(() => ctl);
    },
  };

  // ---- stubs, use(), window.openartifact -----------------------------------------------------------------------------------

  /** A declared capability this host cannot serve: every method answers its error code. */
  function stub(name: string): Any {
    return new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined;
          if (prop === 'available') return true;
          return () => call(name, String(prop), {});
        },
      },
    );
  }

  // Here: no hot updates; `openArtifact.hot` is the inert shape a page can feature-test.
  const hot = Object.freeze({ data: undefined, from: null, gen: 0, signal: undefined, snapshot() {}, ready() {}, accept() {}, restart() {} });
  const namespaces: Record<string, Any> = { db, artifact: self, assets, downloads, user, permissions, room, comments };
  const mounted: Record<string, Any> = Object.create(null);
  
  function namespaceOf(key: string): Any {
    if (stubs.indexOf(key) >= 0) return (mounted[key] ||= stub(key));
    if (!namespaces[key]) return null;
    if (!mounted[key]) {
      const ns = Object.create(null);
      const src = namespaces[key];
      for (const k of Object.keys(src)) Object.defineProperty(ns, k, Object.getOwnPropertyDescriptor(src, k)!);
      delete ns.then;
      mounted[key] = Object.freeze(ns);
    }
    return mounted[key];
  }

  /** The `/_f/<ver>/` segment of this page: the `ver` of a `__frame_cap_want`. */
  const pageVer = ((/^\/_f\/([^/]{1,128})\//.exec(location.pathname) || [])[1] as string | undefined) || '0';

  function want(cap: string): Promise<Any> {
    return new Promise((resolve) => {
      const done = (value: Any): void => {
        clearTimeout(timer);
        wants.delete(cap);
        resolve(value);
      };
      const timer = setTimeout(() => done(null), WANT_TIMEOUT_MS);
      wants.set(cap, (g) => {
        if (typeof g.brokerGen === 'number') brokerGen = g.brokerGen;
        if (!g.grant || cap === 'network') return done(null);
        configs[cap] = (g.grant && g.grant.config) || {};
        done(namespaceOf(cap));
      });
      post({ __frame_cap_want: true, cap: cap === 'artifact' ? 'self' : cap, ver: pageVer });
    });
  }

  const slots = new Map<string, Promise<Any>>();
  const KNOWN = /^[a-z][a-z0-9]{0,23}$/;
  function use(name: unknown): Promise<Any> {
    if (typeof name !== 'string') return Promise.resolve(null);
    if (name === 'hot') return Promise.resolve(hot);
    const key = name === 'self' ? 'artifact' : name;
    if (!KNOWN.test(key) || (!namespaces[key] && stubs.indexOf(key) < 0)) return Promise.resolve(null);
    let slot = slots.get(key);
    if (!slot) {
      slot = whenInit().then((got) => {
        if (!got) return null;
        if (stubs.indexOf(key) >= 0) return namespaceOf(key);
        if (got.capabilities && got.capabilities[key]) return namespaceOf(key);
        if (got.capWants === true && Array.isArray(got.usable) && got.usable.indexOf(key) >= 0) return want(key);
        return null;
      });
      if (boot.debug) slot.then((ns) => ns || post({ __open_artifact_console: true, level: 'warn', text: `use(${name}) → null` }));
      slots.set(key, slot);
    }
    return slot;
  }

  const openArtifact: Record<string, unknown> = { __openArtifactFrame: true, contract: boot.contract, use };
  // Here: the declared capabilities are also direct properties from the start (the original pages read
  
  for (const g of grants) {
    const ns = namespaceOf(g);
    if (ns) openArtifact[g] = ns;
  }
  if (grants.indexOf('artifact') >= 0) openArtifact.self = namespaceOf('artifact');
  openArtifact.hot = hot;
  for (const s of stubs) openArtifact[s] = namespaceOf(s);
  Object.defineProperty(window, 'openArtifact', { value: Object.freeze(openArtifact), configurable: false, writable: false, enumerable: false });

  // OPEN_ARTIFACT_FRAME_DEBUG: the page's errors and warnings also go to the inner shell's console (a page on its own origin is
  // often out of reach of a developer tool attached to the top frame).
  if (boot.debug && framed) {
    const relay = (level: string, args: ArrayLike<unknown>): void => {
      const text = Array.prototype.map
        .call(args, (a: unknown) => {
          if (a instanceof Error) return a.stack || a.message;
          if (typeof a === 'string') return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' ')
        .slice(0, 4000);
      post({ __open_artifact_console: true, level, text });
    };
    for (const level of ['error', 'warn'] as const) {
      const orig = console[level];
      console[level] = (...args: unknown[]) => {
        relay(level, args);
        orig.apply(console, args);
      };
    }
    window.addEventListener('error', (ev) => relay('error', [ev.error || ev.message]));
    window.addEventListener('unhandledrejection', (ev) => relay('error', ['unhandled rejection:', ev.reason]));
  }

  // On leaving, the page's subscriptions end.
  window.addEventListener('pagehide', () => {
    for (const id of [...dbSubs.keys()]) dbCall('unsubscribe', { sub: id }).catch(() => {});
    dbSubs.clear();
  });

  connect();
  const signalReady = (): void => post({ __frame_ready: true, gate: 'init' });
  if (document.readyState === 'complete') setTimeout(signalReady, 0);
  else window.addEventListener('load', signalReady, { once: true });
})();
