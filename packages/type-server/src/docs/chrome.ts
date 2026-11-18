/**
 * Headless Chrome over the DevTools protocol, with Node's own WebSocket: what a doc's PDF export prints in. No Puppeteer
 * or Playwright, nothing to install; the Chrome is the user's own (`$OPEN_ARTIFACT_CHROME`, else the usual places,
 * `findChrome` in ../snapshot.ts).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export { findChrome } from '../snapshot.ts';

export interface ConsoleEntry {
  type: string;
  text: string;
}

export type CdpParams = Record<string, unknown>;
export type CdpResult = Record<string, unknown>;

export interface Page {
  /** Navigate and wait for the load event. */
  navigate(url: string, timeoutMs?: number): Promise<void>;
  /** Evaluate in the page (promises awaited); the value comes back as JSON. A throw in the page throws here. */
  evaluate<T = unknown>(expression: string): Promise<T>;
  /** Console errors and uncaught exceptions in the page so far. */
  problems: ConsoleEntry[];
  /** A DevTools call on this page, and its events. */
  send(method: string, params?: CdpParams): Promise<CdpResult>;
  onEvent(method: string, fn: (params: CdpParams) => void): void;
}

export interface Browser {
  page(): Promise<Page>;
  close(): Promise<void>;
}

interface CdpMessage {
  id?: number;
  method?: string;
  sessionId?: string;
  result?: CdpResult;
  error?: { message: string };
  params?: CdpParams;
}

interface ExceptionDetails {
  text?: string;
  exception?: { description?: string };
}

interface RemoteValue {
  type?: string;
  value?: unknown;
  description?: string;
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

const exceptionText = (details: ExceptionDetails) => String(details.exception?.description ?? details.text);

export async function launchChrome(chrome: string, args: string[] = []): Promise<Browser> {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'open-artifact-docs-chrome-'));
  const child: ChildProcess = spawn(
    chrome,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      // Keep this temporary profile independent of the macOS login keychain.
      ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : []),
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-component-update',
      // A long export runs in a tab nobody looks at: keep its timers and frames at full speed.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--mute-audio',
      ...args,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const removeProfile = () => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  let endpoint: string;
  try {
    endpoint = await new Promise<string>((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error(`Chrome did not start in 30 s: ${text.slice(-400)}`)), 30000);
      child.stderr!.on('data', (chunk) => {
        text += chunk;
        const found = /DevTools listening on (ws:\/\/\S+)/.exec(text);
        if (found) {
          clearTimeout(timer);
          resolve(found[1]!);
        }
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Chrome exited (${code}): ${text.slice(-400)}`));
      });
    });
  } catch (error) {
    child.kill('SIGKILL');
    removeProfile();
    throw error;
  }
  const ws = new WebSocket(endpoint);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('could not connect to Chrome')), { once: true });
  });

  let nextId = 1;
  const pending = new Map<number, { resolve: (value: CdpResult) => void; reject: (error: Error) => void; method: string }>();
  const listeners = new Set<(message: CdpMessage) => void>();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (message.id !== undefined) {
      const waiting = pending.get(message.id);
      pending.delete(message.id);
      if (!waiting) return;
      if (message.error) waiting.reject(new Error(`${waiting.method}: ${message.error.message}`));
      else waiting.resolve(message.result ?? {});
    } else for (const listener of listeners) listener(message);
  });
  ws.addEventListener('close', () => {
    for (const waiting of pending.values()) waiting.reject(new Error('Chrome closed'));
    pending.clear();
  });
  const send = (method: string, params: CdpParams = {}, sessionId?: string) =>
    new Promise<CdpResult>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  async function page(): Promise<Page> {
    const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
    const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
    const problems: ConsoleEntry[] = [];
    let loaded = false;
    listeners.add((message) => {
      if (message.sessionId !== sessionId) return;
      const params = message.params ?? {};
      if (message.method === 'Page.loadEventFired') loaded = true;
      else if (message.method === 'Runtime.exceptionThrown') {
        problems.push({ type: 'exception', text: exceptionText(params.exceptionDetails as ExceptionDetails).split('\n').slice(0, 3).join(' | ') });
      } else if (message.method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'assert')) {
        const values = (params.args ?? []) as RemoteValue[];
        problems.push({ type: String(params.type), text: values.map((value) => value.value ?? value.description ?? value.type).join(' ').slice(0, 400) });
      }
    });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    return {
      problems,
      send: (method, params = {}) => send(method, params, sessionId),
      onEvent(method, fn) {
        listeners.add((message) => {
          if (message.sessionId === sessionId && message.method === method) fn(message.params ?? {});
        });
      },
      async navigate(url, timeoutMs = 30000) {
        loaded = false;
        await send('Page.navigate', { url }, sessionId);
        const until = Date.now() + timeoutMs;
        while (!loaded) {
          if (Date.now() > until) throw new Error(`the page did not load in ${Math.round(timeoutMs / 1000)} s`);
          await sleep(50);
        }
      },
      async evaluate<T = unknown>(expression: string): Promise<T> {
        const answer = (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)) as { result?: RemoteValue; exceptionDetails?: ExceptionDetails };
        if (answer.exceptionDetails) throw new Error(exceptionText(answer.exceptionDetails).split('\n')[0]);
        return answer.result?.value as T;
      },
    };
  }

  async function close(): Promise<void> {
    try {
      await Promise.race([send('Browser.close'), sleep(3000)]);
    } catch {
      /* already gone */
    }
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
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

  return { page, close };
}
