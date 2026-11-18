import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSharedStream, type ChannelLike, type LocksLike, type SharedStreamEnv, type SourceLike } from '../src/lib/shared-events.ts';

/** A browser's worth of fakes: an exclusive lock manager, broadcast channels and event sources. */
function fakeBrowser() {
  const sources: (SourceLike & { url: string; closed: boolean; emit(data: string): void })[] = [];
  const channels = new Map<string, Set<ChannelLike>>();
  const held = new Set<string>();
  const waiting = new Map<string, (() => void)[]>();

  const locks: LocksLike = {
    async request(name, options, callback) {
      if (held.has(name)) {
        await new Promise<void>((resolve, reject) => {
          const queue = waiting.get(name) ?? [];
          queue.push(resolve);
          waiting.set(name, queue);
          options.signal?.addEventListener('abort', () => {
            waiting.set(name, (waiting.get(name) ?? []).filter((r) => r !== resolve));
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      }
      held.add(name);
      try {
        return await callback();
      } finally {
        held.delete(name);
        waiting.get(name)?.shift()?.();
      }
    },
  };

  /** One page: its own channels, the browser's locks and sources. */
  const page = (): SharedStreamEnv => ({
    locks,
    openSource(url) {
      const source = {
        url,
        closed: false,
        onmessage: null as SourceLike['onmessage'],
        close() {
          this.closed = true;
        },
        emit(data: string) {
          if (!this.closed) this.onmessage?.({ data } as MessageEvent<string>);
        },
      };
      sources.push(source);
      return source;
    },
    openChannel(name) {
      const peers = channels.get(name) ?? new Set<ChannelLike>();
      channels.set(name, peers);
      const channel: ChannelLike = {
        onmessage: null,
        postMessage(message) {
          for (const peer of peers) if (peer !== channel) peer.onmessage?.({ data: message } as MessageEvent<unknown>);
        },
        close() {
          peers.delete(channel);
        },
      };
      peers.add(channel);
      return channel;
    },
  });

  const open = () => sources.filter((s) => !s.closed);
  return { page, sources, open };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createSharedStream', () => {
  it('opens one stream for all the pages and hands it on when its page stops', async () => {
    const browser = fakeBrowser();
    const a = createSharedStream('/api/open-artifact.events', browser.page());
    const b = createSharedStream('/api/open-artifact.events', browser.page());
    const c = createSharedStream('/api/open-artifact.events', browser.page());
    const seen: Record<string, string[]> = { a: [], b: [], c: [] };

    const stopA = a.listen((data) => seen.a!.push(data));
    const stopB = b.listen((data) => seen.b!.push(data));
    const stopC = c.listen((data) => seen.c!.push(data));
    await tick();
    assert.equal(browser.open().length, 1, 'three pages, one stream');

    browser.open()[0]!.emit('one');
    assert.deepEqual(seen, { a: ['one'], b: ['one'], c: ['one'] });

    stopA();
    await tick();
    assert.equal(browser.sources[0]!.closed, true);
    assert.equal(browser.open().length, 1, 'the next page took over');
    browser.open()[0]!.emit('two');
    assert.deepEqual(seen, { a: ['one'], b: ['one', 'two'], c: ['one', 'two'] });

    stopC();
    stopB();
    await tick();
    assert.equal(browser.open().length, 0);
  });

  it('opens it once for several listeners on one page, and again after they all left', async () => {
    const browser = fakeBrowser();
    const stream = createSharedStream('/events', browser.page());
    const seen: string[] = [];
    const stop1 = stream.listen((data) => seen.push(`1:${data}`));
    const stop2 = stream.listen((data) => seen.push(`2:${data}`));
    await tick();
    assert.equal(browser.sources.length, 1);
    browser.open()[0]!.emit('x');
    assert.deepEqual(seen, ['1:x', '2:x']);
    stop1();
    stop2();
    await tick();
    assert.equal(browser.open().length, 0);
    const stop3 = stream.listen((data) => seen.push(`3:${data}`));
    await tick();
    assert.equal(browser.open().length, 1);
    stop3();
  });

  it('lets a page that stops while waiting drop out of the line', async () => {
    const browser = fakeBrowser();
    const a = createSharedStream('/events', browser.page());
    const b = createSharedStream('/events', browser.page());
    const stopA = a.listen(() => {});
    const stopB = b.listen(() => {});
    await tick();
    stopB();
    stopA();
    await tick();
    assert.equal(browser.sources.length, 1, 'the page that left never opened one');
    assert.equal(browser.open().length, 0);
  });
});
