/**
 * The workbook engine as the agent's code talks to it: requests and answers as plain objects. The engine itself
 * (`@open-artifact/wasm-sheets`) speaks JSON text; `engineOf` wraps it. Typed requests and answers can replace
 * `EngineMessage` later without changing the callers' shape.
 */

/** A request to the engine, or its answer. */
export type EngineMessage = Record<string, unknown>;

export const isObject = (value: unknown): value is EngineMessage => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A whole number from 0 below 2³², as the engine counts revisions and versions. */
export const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 2 ** 32;

/** One workbook in the engine. */
export interface EngineSession {
  answer(request: EngineMessage): EngineMessage;
  free(): void;
}

/** The engine: workbook sessions, and the requests that need no workbook. */
export interface Engine {
  session(): EngineSession;
  utility(request: EngineMessage): EngineMessage;
}

/** The engine's JSON-text interface (what `sheetsEngine()` gives). */
export interface EngineOfText {
  session(): { answerJson(request: string): string; free(): void };
  utilityJson(request: string): string;
}

const parsed = (text: string): EngineMessage => {
  const value: unknown = JSON.parse(text);
  return isObject(value) ? value : { kind: 'notAnObject', value };
};

/** The engine with its requests and answers as objects. */
export function engineOf(engine: EngineOfText): Engine {
  return {
    session() {
      const session = engine.session();
      return {
        answer: (request) => parsed(session.answerJson(JSON.stringify(request))),
        free: () => session.free(),
      };
    },
    utility: (request) => parsed(engine.utilityJson(JSON.stringify(request))),
  };
}

/** A string field of an answer, or undefined. */
export const stringOf = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
