/**
 * A small WebSocket server side (RFC 6455) on Node built-ins only: text
 * frames, ping/pong and close. Type servers use it for the event streams of
 * mounted sites and for their own upgrades.
 */

import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

/** The GUID RFC 6455 appends to the client key. */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Largest frame accepted, bytes. Bigger frames close the connection with 1009. */
const MAX_FRAME = 16 * 1024 * 1024;

/** Interval of keep-alive pings, ms. */
const PING_MS = 25_000;

/** What a {@link WebSocketConnection} calls back. */
export interface WebSocketHandlers {
  /** A complete text (or binary, decoded as UTF-8) message arrived. */
  message?: (text: string) => void;
  /** The connection closed, from either side. Called once. */
  close?: () => void;
}

/** The `Sec-WebSocket-Accept` value for a client's `Sec-WebSocket-Key`. */
export function acceptKey(key: string): string {
  return createHash('sha1').update(key + GUID).digest('base64');
}

/**
 * Accepts an HTTP upgrade as a WebSocket. Answers `protocol` as the
 * subprotocol when the client asked for it. Returns the connection, or `null`
 * after refusing a request that is not a WebSocket handshake.
 */
export function acceptWebSocket(request: IncomingMessage, socket: Duplex, head: Buffer, protocol?: string): WebSocketConnection | null {
  const key = request.headers['sec-websocket-key'];
  if (typeof key !== 'string' || String(request.headers.upgrade).toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const asked = String(request.headers['sec-websocket-protocol'] ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const lines = ['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${acceptKey(key)}`];
  if (protocol && asked.includes(protocol)) lines.push(`Sec-WebSocket-Protocol: ${protocol}`);
  socket.write(`${lines.join('\r\n')}\r\n\r\n`);
  return new WebSocketConnection(socket, head);
}

/** One accepted WebSocket connection (server side: frames it sends are unmasked). */
export class WebSocketConnection {
  /** The underlying socket. */
  readonly socket: Duplex;
  /** Set once the connection closed. */
  closed = false;
  /** Callbacks; assign them right after accepting. */
  handlers: WebSocketHandlers = {};

  private buffer: Buffer;
  private fragments: Buffer[] = [];
  private readonly pinger: NodeJS.Timeout;

  /** Wraps an upgraded socket; `head` is what the upgrade event already read. */
  constructor(socket: Duplex, head?: Buffer) {
    this.socket = socket;
    this.buffer = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
    (socket as Duplex & { setNoDelay?: (on: boolean) => void }).setNoDelay?.(true);
    socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.read();
    });
    const end = (): void => this.finish();
    socket.on('close', end);
    socket.on('end', end);
    socket.on('error', end);
    if (this.buffer.length) setImmediate(() => this.read());
    this.pinger = setInterval(() => this.frame(0x9, Buffer.alloc(0)), PING_MS);
    this.pinger.unref();
  }

  /** Parses every complete frame in the buffer. */
  private read(): void {
    for (;;) {
      const b = this.buffer;
      if (b.length < 2) return;
      const fin = (b[0]! & 0x80) !== 0;
      const op = b[0]! & 0x0f;
      const masked = (b[1]! & 0x80) !== 0;
      let len = b[1]! & 0x7f;
      let at = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        len = Number(b.readBigUInt64BE(2));
        at = 10;
      }
      if (len > MAX_FRAME) return this.close(1009);
      const maskAt = at;
      if (masked) at += 4;
      if (b.length < at + len) return;
      let payload = b.subarray(at, at + len);
      if (masked) {
        const mask = b.subarray(maskAt, maskAt + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] = payload[i]! ^ mask[i & 3]!;
      }
      this.buffer = b.subarray(at + len);
      if (op === 0x8) return this.close(1000);
      if (op === 0x9) {
        this.frame(0xa, payload);
        continue;
      }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        this.fragments.push(payload);
        if (fin) {
          const text = Buffer.concat(this.fragments).toString('utf8');
          this.fragments = [];
          try {
            this.handlers.message?.(text);
          } catch {
            // A handler's error is its own.
          }
        }
      }
    }
  }

  /** Sends one unfragmented frame. */
  private frame(op: number, payload: Buffer): void {
    if (this.closed) return;
    const len = payload.length;
    let header: Buffer;
    if (len < 126) header = Buffer.from([0x80 | op, len]);
    else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | op;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | op;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch {
      this.finish();
    }
  }

  /** Sends a text message. */
  sendText(text: string): void {
    this.frame(0x1, Buffer.from(text, 'utf8'));
  }

  /** Sends a close frame with `code` and ends the connection. */
  close(code = 1000): void {
    if (this.closed) return;
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code, 0);
    this.frame(0x8, payload);
    this.finish();
  }

  /** Ends the socket and calls the close handler once. */
  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pinger);
    try {
      this.socket.end();
    } catch {
      // Already gone.
    }
    this.handlers.close?.();
  }
}
