/**
 * One event stream for all the daemon's pages in a browser.
 *
 * A browser opens at most six HTTP/1.1 connections to one host. Every Shell
 * and home page used to hold its own `EventSource` on
 * `/api/open-artifact.events`, so six open pages (easy in a harness that keeps
 * artifact tabs and panels around) took every connection, and any other
 * request to the daemon, the Share panel's for one, waited forever.
 *
 * Now the pages elect one of them with a Web Lock: it holds the stream and
 * passes each message to the others on a `BroadcastChannel`. When it closes,
 * the lock goes to the next page waiting, which opens the stream.
 */

/** The parts of `EventSource` used here. */
export interface SourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  close(): void;
}

/** The parts of `BroadcastChannel` used here. */
export interface ChannelLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

/** The parts of `navigator.locks` used here. */
export interface LocksLike {
  request(name: string, options: { signal?: AbortSignal }, callback: () => Promise<unknown>): Promise<unknown>;
}

/** What {@link createSharedStream} runs on; tests pass fakes. */
export interface SharedStreamEnv {
  openSource: (url: string) => SourceLike;
  openChannel: (name: string) => ChannelLike;
  locks: LocksLike;
}

/** The browser's, or `null` where it lacks a lock manager or broadcast channels. */
export function browserEnv(): SharedStreamEnv | null {
  const locks = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { locks?: LocksLike }).locks;
  if (!locks || typeof BroadcastChannel === 'undefined' || typeof EventSource === 'undefined') return null;
  return {
    openSource: (url) => new EventSource(url) as unknown as SourceLike,
    openChannel: (name) => new BroadcastChannel(name) as unknown as ChannelLike,
    locks,
  };
}

/** A stream shared by the pages: `listen` adds a listener of raw `data:` strings and returns a function that removes it. */
export interface SharedStream {
  listen(listener: (data: string) => void): () => void;
}

/**
 * The stream of `url`, shared with the other pages of this origin. It joins the
 * election with the first listener and leaves it (closing the stream if it was
 * holding it) when the last one goes.
 */
export function createSharedStream(url: string, env: SharedStreamEnv): SharedStream {
  const name = `open-artifact.events ${url}`;
  const listeners = new Set<(data: string) => void>();
  let channel: ChannelLike | null = null;
  let abort: AbortController | null = null;
  let resign: (() => void) | null = null;

  const deliver = (data: string): void => {
    for (const listener of [...listeners]) {
      try {
        listener(data);
      } catch {
        // One listener's failure does not keep the message from the others.
      }
    }
  };

  const start = (): void => {
    channel = env.openChannel(name);
    channel.onmessage = (event) => {
      if (typeof event.data === 'string') deliver(event.data);
    };
    const own = new AbortController();
    abort = own;
    env.locks
      .request(name, { signal: own.signal }, async () => {
        // Granted after this page stopped listening: let the next page have it.
        if (own.signal.aborted) return;
        const source = env.openSource(url);
        source.onmessage = (event) => {
          // A broadcast does not come back to its sender: this page hears it here.
          deliver(event.data);
          channel?.postMessage(event.data);
        };
        await new Promise<void>((resolve) => (resign = resolve));
        source.close();
      })
      .catch(() => {
        // Aborted while waiting for the lock.
      });
  };

  const stop = (): void => {
    abort?.abort();
    abort = null;
    resign?.();
    resign = null;
    channel?.close();
    channel = null;
  };

  return {
    listen(listener) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        if (!listeners.delete(listener)) return;
        if (!listeners.size) stop();
      };
    },
  };
}

const streams = new Map<string, SharedStream>();

/** This page's shared stream of `url` (one per URL, whoever asks). */
export function sharedStream(url: string, env: SharedStreamEnv): SharedStream {
  let stream = streams.get(url);
  if (!stream) {
    stream = createSharedStream(url, env);
    streams.set(url, stream);
  }
  return stream;
}
