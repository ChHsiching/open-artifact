import type { EngineMessage } from './engine.ts';

/**
 * A refusal of one of the agent's calls: `code` is its word for it (`data.refusal` of the answer), `extra` goes in
 * `data` beside it, and `hint` says what to do next.
 */
export class AgentError extends Error {
  readonly code: string;
  readonly extra: EngineMessage;
  readonly hint?: string;

  constructor(code: string, message: string, extra: EngineMessage = {}, hint?: string) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.extra = extra;
    if (hint !== undefined) this.hint = hint;
  }
}

/** A refusal as the agent reads it: `{detail, data: {refusal, …}, hint?}`. */
export interface RefusalBody {
  detail: string;
  data: EngineMessage & { refusal: string };
  hint?: string;
}

export function refusalBody(error: AgentError): RefusalBody {
  return { detail: error.message, data: { refusal: error.code, ...error.extra }, ...(error.hint !== undefined ? { hint: error.hint } : {}) };
}

/** A refusal body read back (from a server's answer), or null when it is none. */
export function refusalOf(body: unknown): AgentError | null {
  if (typeof body !== 'object' || body === null) return null;
  const { detail, data, hint } = body as { detail?: unknown; data?: unknown; hint?: unknown };
  if (typeof data !== 'object' || data === null) return null;
  const { refusal, ...extra } = data as EngineMessage;
  if (typeof refusal !== 'string') return null;
  return new AgentError(refusal, typeof detail === 'string' ? detail : refusal, extra, typeof hint === 'string' ? hint : undefined);
}

/**
 * A refusal of one of the agent's calls as it leaves the store: its body is what the agent reads (the command line
 * prints it on stderr, the HTTP layer sends it as the error body).
 */
export class SheetRefusalError extends Error {
  readonly body: RefusalBody;

  constructor(body: RefusalBody) {
    super(body.detail);
    this.name = 'SheetRefusalError';
    this.body = body;
  }

  static of(error: AgentError): SheetRefusalError {
    return new SheetRefusalError(refusalBody(error));
  }

  get refusal(): string {
    return this.body.data.refusal;
  }
}
