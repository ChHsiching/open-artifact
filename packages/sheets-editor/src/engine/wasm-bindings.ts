import { instantiateSheetsEngine, type SheetsEngine } from '@open-artifact/wasm-sheets';
import type { AnswerOf, SessionRequest, UtilityAnswerOf, UtilityRequest } from '@open-artifact/sheets-core';

/** Anything that answers the requests of a workbook's session, typed by the request's kind. */
export interface SessionAnswers {
  answer<R extends SessionRequest>(request: R): AnswerOf<R>;
}

/** One workbook in the engine: a request in, its answer out. */
export interface WorkbookCore extends SessionAnswers {
  answerJson(requestJson: string): string;
}

/** The engine's requests that need no workbook. */
export interface SheetsUtilities {
  answer<R extends UtilityRequest>(request: R): UtilityAnswerOf<R>;
}

const engineOf = (module: WebAssembly.Module | BufferSource): SheetsEngine => instantiateSheetsEngine(module);

export async function createWorkbookSessionCore(module: WebAssembly.Module | BufferSource): Promise<WorkbookCore> {
  const session = engineOf(module).session();
  return {
    answer: (request) => JSON.parse(session.answerJson(JSON.stringify(request))),
    answerJson: (requestJson) => session.answerJson(requestJson),
  };
}

export async function createSheetsUtilities(module: WebAssembly.Module | BufferSource): Promise<SheetsUtilities> {
  const engine = engineOf(module);
  return {
    answer: (request) => JSON.parse(engine.utilityJson(JSON.stringify(request))),
  };
}
