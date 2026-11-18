/**
 * A tiny stdio MCP server for the connector tests: newline-delimited JSON-RPC
 * on stdin/stdout. Tools: `echo` (answers its arguments), `fail` (a tool
 * error), `boom` (a JSON-RPC error), `slow` (never answers; records its
 * cancellation), `cancelled` (the ids cancelled so far), `ask` (pings the
 * client first), `pid`, `env` (FAKE_GREETING) and `crash` (exits).
 */

import { createInterface } from 'node:readline';

const send = (message: unknown): void => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

const tools = [
  { name: 'echo', description: 'Answers its arguments.', inputSchema: { type: 'object' } },
  { name: 'fail', description: 'Fails as a tool.' },
  { name: 'boom', description: 'Fails as a protocol error.' },
  { name: 'slow' },
  { name: 'cancelled' },
  { name: 'ask' },
  { name: 'pid' },
  { name: 'env' },
  { name: 'crash' },
];

const cancelled: unknown[] = [];
let initialized = false;
let pingSeq = 0;
const waiting = new Map<string, () => void>();

const text = (value: unknown): { content: { type: 'text'; text: string }[] } => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });

function callTool(id: unknown, name: string, args: Record<string, unknown>): void {
  switch (name) {
    case 'echo':
      return send({ jsonrpc: '2.0', id, result: { ...text(args), structuredContent: args } });
    case 'fail':
      return send({ jsonrpc: '2.0', id, result: { ...text('It did not work.'), isError: true } });
    case 'boom':
      return send({ jsonrpc: '2.0', id, error: { code: -32000, message: 'Boom' } });
    case 'slow':
      return;
    case 'cancelled':
      return send({ jsonrpc: '2.0', id, result: { ...text(cancelled), structuredContent: { cancelled, initialized } } });
    case 'ask': {
      const pingId = `ping-${++pingSeq}`;
      waiting.set(pingId, () => send({ jsonrpc: '2.0', id, result: text('pong received') }));
      return send({ jsonrpc: '2.0', id: pingId, method: 'ping' });
    }
    case 'pid':
      return send({ jsonrpc: '2.0', id, result: { ...text(String(process.pid)), structuredContent: { pid: process.pid } } });
    case 'env':
      return send({ jsonrpc: '2.0', id, result: text(process.env.FAKE_GREETING ?? '') });
    case 'crash':
      process.stderr.write('fake server: crashing on purpose\n', () => process.exit(3));
      return;
    default:
      return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${name}` } });
  }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line) as { id?: unknown; method?: string; params?: Record<string, unknown>; result?: unknown };
  if (message.method === undefined) {
    // An answer to one of our requests.
    const done = waiting.get(String(message.id));
    waiting.delete(String(message.id));
    done?.();
    return;
  }
  switch (message.method) {
    case 'initialize':
      return send({
        jsonrpc: '2.0',
        id: message.id,
        result: { protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'fake', version: '1.0.0' } },
      });
    case 'notifications/initialized':
      initialized = true;
      return;
    case 'notifications/cancelled':
      cancelled.push(message.params?.requestId);
      return;
    case 'tools/list': {
      const second = message.params?.cursor === 'page-2';
      return send({ jsonrpc: '2.0', id: message.id, result: second ? { tools: tools.slice(3) } : { tools: tools.slice(0, 3), nextCursor: 'page-2' } });
    }
    case 'tools/call':
      return callTool(message.id, String(message.params?.name), (message.params?.arguments ?? {}) as Record<string, unknown>);
    default:
      if (message.id !== undefined) send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } });
  }
});
