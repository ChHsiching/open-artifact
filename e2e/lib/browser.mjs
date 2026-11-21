// Headless Chrome over the DevTools protocol, with Node's own WebSocket: no Playwright, nothing to install.
//
// findChrome() → the Chrome to run (E2E_CHROME, else the usual places), or null when there is none.
// launch() → a browser; browser.load(url, {ready}) opens a tab and returns once `ready` (an expression) is truthy in
// the page or in any of its frames, sandboxed and out-of-process ones too. `page.problems` is what went wrong on the
// way, in the page and its frames: uncaught exceptions, console errors, failed requests and HTTP errors; `page.urls`
// every URL it requested. Both keep filling while the page stays open.
// An editor that shows its crash card, or whose React root went empty after it had drawn something (what React
// leaves after an uncaught render error with no error boundary; see findCrash), is a problem too, `crashed: …`,
// reported the moment it happens; `page.crashed()` looks at every frame now, and `crashes()` hands over the crashes on
// every page of every browser in this process not yet handed over (editor.mjs's failOnCrash fails the case with them).
// A tab whose renderer crashed, or that Chrome let go of while the page was still in use, is a problem too (`tab gone:
// …`); a call on a tab that is gone fails with what became of it (closed by the test, crashed, let go of, Chrome gone).
// Input goes through the DevTools protocol as real events: `page.click`, `page.clickTimes` (2 = a word, 3 = a
// paragraph), `page.rightClick` (a context menu), `page.hover` (the mouse over a point, nothing pressed), `page.type`
// (keys, to whatever has focus), `page.press` (a named key or a shortcut) and `page.typeIme` (composed text, as pinyin
// sends it). E2E_HEADFUL=1 runs Chrome with a window, to watch a case; the default is headless.
//
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function findChrome() {
  if (process.env.E2E_CHROME) return fs.existsSync(process.env.E2E_CHROME) ? process.env.E2E_CHROME : null;
  return CANDIDATES.find(p => fs.existsSync(p)) ?? null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Whether the editor in this frame crashed, or null. Run in the frame (it is passed in as source, so it closes over
 * nothing). An editor with an error boundary (design, slides) shows a card marked `data-testid="<type>-crashed"`
 * instead of what failed to render. One without renders into `#root`, where an uncaught render error unmounts the whole
 * tree and leaves `#root` empty: the whole page is blank and cannot be used. A root that never drew anything yet (still
 * loading) is not a crash; one that drew and then went empty is. Artboard frames have no `#root` and are passed over.
 */
function findCrash() {
  if (typeof document === 'undefined') return null;
  const card = document.querySelector('[data-testid$="-crashed"]');
  if (card) return `the editor showed its crash card, ${card.getAttribute('data-testid')} (in ${location.href.slice(0, 160)})`;
  const root = document.getElementById('root');
  if (!root) return null;
  const drawn = Symbol.for('open-artifact e2e root drawn');
  if (root.childElementCount > 0) {
    globalThis[drawn] = true;
    return null;
  }
  return globalThis[drawn] ? `the editor's React root went empty, as an uncaught render error leaves it (in ${location.href.slice(0, 160)})` : null;
}

/** Why a call on a tab that crashed or was let go of fails (it would otherwise wait for an answer that never comes). */
const TAB_GONE = 'the tab went away';

/** The binding a frame calls with findCrash's answer (Runtime.addBinding: a function on its global object). */
const CRASH_BINDING = '__openArtifactE2ePageCrashed';

/** Installed in every frame's main world: tell CRASH_BINDING once when findCrash first answers. */
function watchCrash(binding, find) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  const key = Symbol.for('open-artifact e2e crash watch');
  if (globalThis[key]) return;
  Object.defineProperty(globalThis, key, { value: true });
  const observer = new MutationObserver(() => check());
  const check = () => {
    const what = find();
    if (what === null) return;
    observer.disconnect();
    globalThis[binding]?.(what);
  };
  observer.observe(document, { subtree: true, childList: true });
  check();
}

const CRASH_FIND = `(${findCrash})()`;
const CRASH_WATCH = `(${watchCrash})(${JSON.stringify(CRASH_BINDING)}, ${findCrash})`;

/** `promise`, or `fallback` once `ms` have gone by (a page held by a dialog never answers an evaluate). */
const within = (promise, ms, fallback) => Promise.race([promise, sleep(ms).then(() => fallback)]);

const pagesOpen = new Set(); // every browser's open pages
const pagesStuck = new WeakSet(); // ones that did not answer crashes(): not asked again
const crashLog = []; // crashes on any page, open or closed, not yet handed over by crashes()

/**
 * Every crash on any page in this process (`crashed: …`, as in its `problems`) since the last call, closed pages' too.
 * Each open page is looked at now (one that does not answer, held by a dialog, is passed over from then on), and a
 * crash is handed over once.
 */
export async function crashes() {
  for (const page of [...pagesOpen]) {
    if (pagesStuck.has(page)) continue;
    if ((await within(page.crashed().then(() => true, () => true), 3000, false)) === false) pagesStuck.add(page);
  }
  return crashLog.splice(0);
}

export async function launch({ chrome = findChrome(), width = 1440, height = 900 } = {}) {
  if (!chrome) throw new Error('no Chrome found (set E2E_CHROME)');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'open-artifact-e2e-chrome-'));
  // 2026-11-02: stderr goes to a file, not a pipe. Chrome's crash handler and Google's updater inherit it and can outlive
  // Chrome by minutes; while one held a pipe open, the test file could not exit, however its cases went.
  const stderr = path.join(profile, 'chrome-stderr.log');
  const fd = fs.openSync(stderr, 'a');
  const child = spawn(chrome, [
    ...(process.env.E2E_HEADFUL ? [] : ['--headless=new']), '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    // Keep the test profile independent of the macOS login keychain.
    ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : []),
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-sync', '--disable-component-update', '--mute-audio', 'about:blank',
  ], { stdio: ['ignore', 'ignore', fd] });
  fs.closeSync(fd);
  // A test file that is signalled runs no `after` hook, so the browser goes when the process does (see target.mjs).
  const removeProfile = () => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  const atExit = () => {
    child.kill('SIGKILL');
    removeProfile();
  };
  process.on('exit', atExit);
  let ws;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const text = () => fs.readFileSync(stderr, 'utf8');
      const settle = (fn, value) => {
        clearInterval(poll);
        clearTimeout(timer);
        child.off('exit', onExit);
        fn(value);
      };
      const onExit = code => settle(reject, new Error(`Chrome exited (${code}): ${text().slice(-500)}`));
      const poll = setInterval(() => {
        const m = /DevTools listening on (ws:\/\/\S+)/.exec(text());
        if (m) settle(resolve, m[1]);
      }, 50);
      const timer = setTimeout(() => settle(reject, new Error(`Chrome did not start: ${text().slice(-500)}`)), 20000);
      child.on('exit', onExit);
    });
    ws = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('could not connect to Chrome')), { once: true });
    });
  } catch (e) {
    process.off('exit', atExit);
    atExit();
    throw e;
  }

  let chromeExit = null; // {code, signal, at} once Chrome is gone
  let closingAt = null; // when browser.close() was called
  child.on('exit', (code, signal) => (chromeExit = { code, signal, at: Date.now() }));
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  const pages = new Set(); // this browser's open pages (also in pagesOpen)
  ws.addEventListener('message', event => {
    const msg = JSON.parse(String(event.data));
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (!p) return;
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
    } else {
      for (const fn of listeners) fn(msg);
    }
  });
  // Once the connection to Chrome is gone, nothing more will answer: what was waiting fails, and so does what comes later.
  const CLOSED = 'the connection to Chrome closed';
  ws.addEventListener('close', () => {
    for (const p of pending.values()) p.reject(new Error(`${p.method}: ${CLOSED}`));
    pending.clear();
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    if (ws.readyState !== WebSocket.OPEN) return reject(new Error(`${method}: ${CLOSED}`));
    const id = nextId++;
    pending.set(id, { resolve, reject, method, sessionId });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  /** Fail what waits on a session that will not answer any more (a crashed tab never does). */
  const dropSession = (sessionId, why) => {
    for (const [id, p] of pending) {
      if (p.sessionId !== sessionId) continue;
      pending.delete(id);
      p.reject(new Error(`${p.method}: ${why}`));
    }
  };

  /**
   * Open `url` in a new tab. `ready`: an expression, true in the page or one of its frames once it is up.
   * `ignore`: regexps for problems that are expected. `userAgent`: the tab's user agent, in its requests and
   * `navigator.userAgent` (a host browser that is not Chrome). Returns {problems, evaluate, evaluateAll,
   * crashed, click, close}.
   */
  async function load(url, { ready = 'true', timeout = 30000, settle = 1000, ignore = [], userAgent } = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: top } = await send('Target.attachToTarget', { targetId, flatten: true });
    const sessions = new Set([top]);
    const contexts = new Map(); // `${session} ${contextId}` → {session, id}
    const requests = new Map();
    const urls = new Set();
    const problems = [];
    const crashesSeen = new Set();
    const openedAt = Date.now();
    let closedAt = null; // when page.close() was called
    let gone = null; // {why, at}: the tab crashed or Chrome let go of it
    let loaded = false;
    const add = text => {
      if (!ignore.some(re => re.test(text))) problems.push(text);
    };
    /** A crash findCrash saw, once per page: a problem, and in crashLog for crashes(). */
    const noteCrash = what => {
      if (typeof what !== 'string' || crashesSeen.has(what)) return;
      crashesSeen.add(what);
      const text = `crashed: ${what}`;
      if (ignore.some(re => re.test(text))) return;
      problems.push(text);
      crashLog.push(text);
    };
    /** The tab crashed, or Chrome let go of it, while the page was still in use: a problem, and why for a later call. */
    const noteGone = why => {
      if (gone || closedAt || closingAt) return;
      gone = { why, at: Date.now() };
      add(`tab gone: ${why}`);
      dropSession(top, TAB_GONE);
    };
    const enable = session => Promise.all([
      // Before Runtime.enable, so the frames' contexts have it by the time CRASH_WATCH goes into them.
      send('Runtime.addBinding', { name: CRASH_BINDING }, session),
      send('Runtime.enable', {}, session),
      send('Inspector.enable', {}, session),
      send('Log.enable', {}, session),
      send('Network.enable', {}, session),
      send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, session),
    ]).catch(() => {});
    const onEvent = msg => {
      const session = msg.sessionId;
      const p = msg.params;
      // The tab's own session is attached from the browser, so Chrome says it let go of it there.
      if (session === undefined && msg.method === 'Target.detachedFromTarget' && p.sessionId === top) noteGone('Chrome detached from the tab');
      if (!sessions.has(session)) return;
      switch (msg.method) {
        case 'Inspector.targetCrashed':
          if (session === top) noteGone('its renderer crashed');
          break;
        case 'Inspector.detached':
          if (session === top) noteGone(`Chrome detached from the tab (${p.reason})`);
          break;
        case 'Target.attachedToTarget':
          // A frame in a process of its own (a sandboxed iframe, a worker): watch it like the page.
          sessions.add(p.sessionId);
          enable(p.sessionId);
          break;
        case 'Target.detachedFromTarget':
          sessions.delete(p.sessionId);
          break;
        case 'Page.loadEventFired':
          loaded = true;
          break;
        case 'Runtime.executionContextCreated':
          contexts.set(`${session} ${p.context.id}`, { session, id: p.context.id });
          // A frame's own world (not an isolated one): watch it for a crash from now on.
          if (p.context.auxData?.isDefault) send('Runtime.evaluate', { expression: CRASH_WATCH, contextId: p.context.id }, session).catch(() => {});
          break;
        case 'Runtime.bindingCalled':
          if (p.name === CRASH_BINDING) noteCrash(p.payload);
          break;
        case 'Runtime.executionContextDestroyed':
          contexts.delete(`${session} ${p.executionContextId}`);
          break;
        case 'Runtime.executionContextsCleared':
          for (const [key, c] of contexts) if (c.session === session) contexts.delete(key);
          break;
        case 'Runtime.exceptionThrown': {
          const d = p.exceptionDetails;
          add(`exception: ${(d.exception?.description ?? d.text).split('\n').slice(0, 3).join(' | ')}`);
          break;
        }
        case 'Runtime.consoleAPICalled':
          if (p.type === 'error' || p.type === 'assert') {
            add(`console.${p.type}: ${p.args.map(a => a.value ?? a.description ?? a.type).join(' ')}`.slice(0, 400));
          }
          break;
        case 'Log.entryAdded':
          // Network errors are reported below, with their URL.
          if (p.entry.level === 'error' && p.entry.source !== 'network') add(`log: ${p.entry.text}`.slice(0, 400));
          break;
        case 'Network.requestWillBeSent':
          requests.set(p.requestId, p.request.url);
          urls.add(p.request.url);
          break;
        case 'Network.responseReceived':
          if (p.response.status >= 400) add(`HTTP ${p.response.status}: ${p.response.url}`);
          break;
        case 'Network.loadingFailed':
          if (!p.canceled) add(`failed (${p.errorText}): ${requests.get(p.requestId) ?? p.requestId}`);
          break;
      }
    };
    listeners.add(onEvent);

    /**
     * `send` on the tab's own session. A call on a tab that is gone ("Session with given id not found") fails with what
     * became of it, so a case that dies on one says whether the test closed the tab, it crashed, or Chrome let go of it.
     */
    const onTop = async (method, params) => {
      if (gone) throw await whyGone(new Error(`${method}: ${TAB_GONE}`));
      return send(method, params, top).catch(async e => {
        throw /Session with given id not found|No session with given id|Target closed|connection to Chrome closed|the tab went away/i.test(e.message) ? await whyGone(e) : e;
      });
    };
    async function whyGone(e) {
      const now = Date.now();
      const ago = at => `${now - at} ms ago`;
      const facts = [`opened ${ago(openedAt)} (${url})`];
      facts.push(closedAt ? `page.close() was called ${ago(closedAt)}` : 'page.close() was not called');
      facts.push(gone ? `${gone.why}, ${ago(gone.at)}` : 'Chrome sent no word of the tab crashing or being let go of');
      if (closingAt) facts.push(`browser.close() was called ${ago(closingAt)}`);
      if (chromeExit) facts.push(`Chrome exited (${chromeExit.signal ?? chromeExit.code}) ${ago(chromeExit.at)}`);
      else {
        const targets = await within(send('Target.getTargets').then(r => r.targetInfos, () => null), 2000, null);
        facts.push(targets === null ? 'Chrome did not answer Target.getTargets' : targets.some(t => t.targetId === targetId) ? 'the tab is still open in Chrome' : 'the tab is no longer open in Chrome');
      }
      const recent = problems.slice(-8);
      return new Error(`${e.message}\n  what became of the tab:\n    ${facts.join('\n    ')}${recent.length ? `\n  last problems:\n    ${recent.join('\n    ')}` : ''}`, { cause: e });
    }

    /** Evaluate in every frame's main world; one value per frame that answered. */
    async function evaluateAll(expression) {
      const out = [];
      for (const { session, id } of [...contexts.values()]) {
        try {
          const params = { expression, contextId: id, returnByValue: true, awaitPromise: true };
          const r = await (session === top ? onTop('Runtime.evaluate', params) : send('Runtime.evaluate', params, session));
          if (!r.exceptionDetails) out.push(r.result?.value);
        } catch {}
      }
      return out;
    }
    /**
     * What the first frame fallen to its error boundary shows (see findCrash), or null. Looks now, in every frame; the
     * watch in each frame reports the same into `problems` by itself, a moment after it shows.
     */
    async function crashed() {
      const found = (await evaluateAll(CRASH_FIND)).filter(v => typeof v === 'string');
      for (const what of found) noteCrash(what);
      return found[0] ?? null;
    }
    /** Evaluate in the page itself. */
    async function evaluate(expression) {
      const r = await onTop('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`${expression}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result?.value;
    }
    /** Wait until `expression` is truthy in some frame; false after `ms`. */
    async function waitFor(expression, ms = timeout) {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        if ((await evaluateAll(`Boolean(${expression})`)).includes(true)) return true;
        await sleep(200);
      }
      return false;
    }
    /**
     * Click with the real mouse at (x, y) in the page's viewport: Chrome finds the frame there, out-of-process ones too.
     * `{meta: true}` holds Command (Control on other systems' shortcuts: `{ctrl: true}`), as ⌘-click on a link does.
     */
    async function click(x, y, { ctrl = false, meta = false, shift = false } = {}) {
      const modifiers = (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
      await onTop('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
      for (const type of ['mousePressed', 'mouseReleased']) await onTop('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, modifiers });
    }
    /** Move the real mouse to (x, y) and press nothing: what shows on hover (a card's buttons) shows. */
    async function hover(x, y) {
      await onTop('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    }
    /** Click with the real mouse's right button at (x, y): the page gets a contextmenu event, as from a person. */
    async function rightClick(x, y) {
      await onTop('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      for (const type of ['mousePressed', 'mouseReleased']) await onTop('Input.dispatchMouseEvent', { type, x, y, button: 'right', buttons: 2, clickCount: 1 });
    }
    /** Click with the real mouse `count` times in a row (2 selects a word, 3 a paragraph). */
    async function clickTimes(x, y, count) {
      await onTop('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      for (let n = 1; n <= count; n++) {
        for (const type of ['mousePressed', 'mouseReleased']) await onTop('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: n });
      }
    }
    /** Type with the real keyboard: a key down and up for each character, to whatever has focus. */
    async function type(text) {
      for (const ch of text) {
        await onTop('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch });
        await onTop('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      }
    }
    /**
     * Press a key that is not a character (Escape, Enter, an arrow…), or a letter with Control or Command held
     * (`{ctrl: true}`, `{meta: true}`, either with `shift`: a shortcut, such as Command-Z on a Mac): a key down and up, to
     * whatever has focus. `commands` names the editing commands the key runs (`['copy']`, `['paste']`): on a Mac the
     * menu, not the key, copies and pastes, so Command-C needs them to reach the page as a copy.
     */
    async function press(key, { ctrl = false, meta = false, shift = false, commands } = {}) {
      const letter = /^[a-z]$/.test(key) && (ctrl || meta);
      const keyCode = letter ? key.toUpperCase().charCodeAt(0) : { Backspace: 8, Tab: 9, Enter: 13, Escape: 27, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46 }[key];
      if (!keyCode) throw new Error(`press: no key code for ${key}`);
      const code = letter ? `Key${key.toUpperCase()}` : key;
      const modifiers = (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
      const text = key === 'Enter' && !ctrl && !meta ? '\r' : undefined;
      await onTop('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers, text, ...(commands ? { commands } : {}) });
      await onTop('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers });
    }
    /** Type through an input method: the text is composed in steps and then committed, as pinyin does (the keys come as 229). */
    async function typeIme(text) {
      let composing = '';
      for (const ch of text) {
        composing += ch;
        await onTop('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Process', windowsVirtualKeyCode: 229 });
        await onTop('Input.imeSetComposition', { text: composing, selectionStart: composing.length, selectionEnd: composing.length });
        await onTop('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      }
      await onTop('Input.insertText', { text: composing });
    }
    /** A raw DevTools call on the page's own session (benchmarks: Input, Performance, Memory). */
    const cdp = (method, params = {}) => send(method, params, top);
    const page = { problems, urls, evaluate, evaluateAll, crashed, waitFor, click, clickTimes, rightClick, hover, type, typeIme, press, close, cdp };
    async function close() {
      closedAt ??= Date.now();
      pagesOpen.delete(page);
      pages.delete(page);
      listeners.delete(onEvent);
      await send('Target.closeTarget', { targetId }).catch(() => {});
    }

    try {
      await send('Page.enable', {}, top);
      await enable(top);
      if (userAgent) await send('Emulation.setUserAgentOverride', { userAgent }, top);
      pagesOpen.add(page);
      pages.add(page);
      await send('Page.navigate', { url }, top);
      const until = Date.now() + timeout;
      while (!loaded && Date.now() < until) await sleep(100);
      if (!loaded) problems.push(`no load event after ${timeout} ms`);
      else if (!(await waitFor(ready, until - Date.now()))) problems.push(`not ready after ${timeout} ms: ${ready}`);
      await sleep(settle);
      return page;
    } catch (e) {
      await close();
      throw e;
    }
  }

  async function close() {
    closingAt ??= Date.now();
    process.off('exit', atExit);
    for (const page of pages) pagesOpen.delete(page);
    // Chrome answers before it goes; one that never answers is killed below.
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 3000);
      send('Browser.close').catch(() => {}).finally(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    ws.close();
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3000);
      child.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    removeProfile();
  }

  /** Let pages download into `dir` (headless Chrome refuses downloads until told where they go). */
  const downloadsTo = dir => send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  /** Cancel every download without a word to the page, as some embedded browsers do. */
  const dropDownloads = () => send('Browser.setDownloadBehavior', { behavior: 'deny' });

  return { load, close, downloadsTo, dropDownloads, pid: child.pid };
}
