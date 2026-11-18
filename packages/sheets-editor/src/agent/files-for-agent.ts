import type { ImportFileResponse } from '@open-artifact/runtime';
import { translateMessage } from '../i18n/messages.ts';
import type { AgentStatusSource } from './activity.ts';

export type AgentFileSource = 'computer';

export interface FilesForAgent {
  /** The sources offered now; the same array until the offer changes (the page reads it with useSyncExternalStore). */
  offered(): readonly AgentFileSource[];
  onChanged(listener: () => void): () => void;
  ask(source: AgentFileSource): void;
  /** Hears how each import went (the page shows it as a toast): `isProblem` when nothing was sent. */
  onTold?(listener: (words: string, isProblem: boolean) => void): () => void;
}

export const AGENT_FILE_SOURCES: readonly AgentFileSource[] = Object.freeze(['computer']);
export const NO_AGENT_FILE_SOURCES: readonly AgentFileSource[] = Object.freeze([]);

export const NO_FILES_FOR_AGENT: FilesForAgent = {
  offered: () => NO_AGENT_FILE_SOURCES,
  onChanged: () => () => {},
  ask() {},
};

/** The server's limit on one upload (type-server's MAX_UPLOAD); a larger file is refused before it is sent. */
export const MAX_AGENT_FILE_BYTES = 25 * 1024 * 1024;

export const isXlsxFileName = (name: string): boolean => /\.xlsx$/i.test(name);

export interface FilesForAgentOptions {
  sheet: { importFile(file: Blob, name: string): Promise<ImportFileResponse> } | null;
  /** Whether the person may change the Sheet and send the agent requests (the server takes imports from the owner). */
  canImport: boolean;
  agent: AgentStatusSource | null;
  /** Tells the person how the import went, `isProblem` when nothing was sent (besides the page's `onTold`). */
  tell?(words: string, isProblem: boolean): void;
  document?: Document;
}

export const filesForAgentWords = {
  sent: (file: string) =>
    translateMessage({ defaultMessage: '{file} sent to Agent to import.', id: 'filesForAgent.sent' }, { file }),
  notXlsx: (file: string) =>
    translateMessage(
      { defaultMessage: 'Nothing was imported, because {file} isn’t an Excel file (.xlsx).', id: 'filesForAgent.notXlsx' },
      { file },
    ),
  tooLarge: (file: string) =>
    translateMessage({ defaultMessage: 'Nothing was imported, because {file} is too large.', id: 'filesForAgent.tooLarge' }, { file }),
  notAWorkbook: (file: string) =>
    translateMessage(
      { defaultMessage: 'Nothing was imported, because {file} isn’t an Excel workbook.', id: 'filesForAgent.notAWorkbook' },
      { file },
    ),
  notListening: () =>
    translateMessage({
      defaultMessage: 'Agent isn’t listening to this Sheet. Ask it to wait for requests here, then try again.',
      id: 'filesForAgent.notListening',
    }),
  notAllowed: () =>
    translateMessage({
      defaultMessage: 'Only someone who can edit this Sheet can import a file into it.',
      id: 'filesForAgent.notAllowed',
    }),
  notSent: (file: string) => translateMessage({ defaultMessage: '{file} couldn’t be sent. Try again.', id: 'filesForAgent.notSent' }, { file }),
};

const codeOf = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : null;

/** The words for an import the server turned away. */
export function refusedImportWords(error: unknown, file: string): string {
  const code = codeOf(error);
  if (code === 'not_writer' || code === 'not_granted') return filesForAgentWords.notAllowed();
  if (code === 'invalid') {
    const message = error instanceof Error ? error.message : '';
    return / over \d+ ?MB/i.test(message) ? filesForAgentWords.tooLarge(file) : filesForAgentWords.notAWorkbook(file);
  }
  return filesForAgentWords.notSent(file);
}

export function createFilesForAgent({ sheet, canImport, agent, tell, document: doc = document }: FilesForAgentOptions): FilesForAgent {
  if (sheet === null || !canImport || agent === null) return NO_FILES_FOR_AGENT;
  let offered = NO_AGENT_FILE_SOURCES;
  const listeners = new Set<() => void>();
  const updateOffer = (available: boolean): void => {
    const now = available ? AGENT_FILE_SOURCES : NO_AGENT_FILE_SOURCES;
    if (now === offered) return;
    offered = now;
    for (const listener of [...listeners]) listener();
  };
  const toldListeners = new Set<(words: string, isProblem: boolean) => void>();
  const tellAll = (words: string, isProblem: boolean): void => {
    tell?.(words, isProblem);
    for (const listener of [...toldListeners]) listener(words, isProblem);
  };
  updateOffer(agent.agentStatus()?.available ?? false);
  agent.onAgentStatus((status) => updateOffer(status.available));

  const importFile = async (file: File): Promise<void> => {
    if (!isXlsxFileName(file.name)) return tellAll(filesForAgentWords.notXlsx(file.name), true);
    if (file.size > MAX_AGENT_FILE_BYTES) return tellAll(filesForAgentWords.tooLarge(file.name), true);
    let answer: ImportFileResponse;
    try {
      answer = await sheet.importFile(file, file.name);
    } catch (error) {
      return tellAll(refusedImportWords(error, file.name), true);
    }
    if (answer.sentToAgent) tellAll(filesForAgentWords.sent(file.name), false);
    else tellAll(filesForAgentWords.notListening(), true);
  };

  let picker: HTMLInputElement | null = null;
  const filePicker = (): HTMLInputElement => {
    if (picker?.isConnected) return picker;
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.hidden = true;
    input.setAttribute('data-sheets-import', '');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) void importFile(file);
    });
    doc.body.append(input);
    return (picker = input);
  };

  return {
    offered: () => offered,
    onChanged(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    ask(source) {
      if (source === 'computer' && offered.includes('computer')) filePicker().click();
    },
    onTold(listener) {
      toldListeners.add(listener);
      return () => void toldListeners.delete(listener);
    },
  };
}
