/**
 * Page side of the Open Artifact Shell ("chrome") protocol.
 *
 * When a page runs inside the Shell (an iframe named `open-artifact-shell` whose URL
 * carries `open_artifact_shell=<shell origin>`), the Shell draws the shared top bar
 * (title, comments, share, export…). The page reports what it can do with
 * `chrome_report` and answers the Shell's commands. Outside the Shell the
 * page draws its own controls; {@link connectShell} then returns `null`.
 *
 * Messages only go to, and are only accepted from, the origin named by
 * `open_artifact_shell`.
 */

import {
  CHROME_PROTOCOL,
  type ChromeCommand,
  type ChromeDraw,
  type ChromeExportItem,
  type ChromeExportState,
  type ChromeReport,
} from '@open-artifact/protocol';

export type { ChromeCommand, ChromeDraw, ChromeExportItem, ChromeExportState, ChromeReport };

/** A connected Shell. */
export interface ShellConnection {
  /** The Shell's origin. */
  readonly origin: string;
  /**
   * What the Shell draws for the page (its last `chrome_hello`). While it
   * has `saved`, the page leaves its own save badge out. Empty until the
   * Shell says hello, and for Shells older than `draws`.
   */
  readonly draws: ReadonlySet<ChromeDraw>;
  /** Called after each `chrome_hello` (the Shell's `draws` may have changed). */
  onHello(handler: (draws: ReadonlySet<ChromeDraw>) => void): () => void;
  /** Answers an `export_format` command: `started`, then `done` or `declined` (or at once `busy`/`unsupported`). */
  exportState(request: string, state: ChromeExportState, reason?: string): void;
  /** Sends the full report; call again whenever any part changes. */
  report(report: ChromeReport): void;
  /** Handles commands; return the export items for `exports`. */
  onCommand(handler: (command: ChromeCommand) => ChromeExportItem[] | void): () => void;
  /**
   * Handles `files_changed`. Return `true` when the page applied the change
   * itself; otherwise the Shell reloads the frame after a second.
   */
  onFilesChanged(handler: (paths: string[]) => boolean): () => void;
  /** Stops listening. */
  dispose(): void;
}

/** Protocol version spoken by this module. */
export const SHELL_PROTOCOL = CHROME_PROTOCOL;

/** Reads the Shell origin from the page URL, or `null` when not inside a Shell. */
export function shellOrigin(href: string = location.href): string | null {
  if (typeof window === 'undefined' || window.parent === window) return null;
  const value = new URL(href).searchParams.get('open_artifact_shell');
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Connects to the Shell, or returns `null` when the page is standalone. */
export function connectShell(): ShellConnection | null {
  const origin = shellOrigin();
  if (!origin) return null;

  let lastReport: ChromeReport = {};
  let draws: ReadonlySet<ChromeDraw> = new Set();
  const helloHandlers = new Set<(draws: ReadonlySet<ChromeDraw>) => void>();
  const commandHandlers = new Set<(command: ChromeCommand) => ChromeExportItem[] | void>();
  const filesHandlers = new Set<(paths: string[]) => boolean>();

  const post = (message: Record<string, unknown>): void => {
    window.parent.postMessage({ openArtifact: message.openArtifact, ...message }, origin);
  };

  const onMessage = (event: MessageEvent): void => {
    if (event.origin !== origin || event.source !== window.parent) return;
    const data = event.data as { openArtifact?: unknown } | null;
    if (!data || typeof data !== 'object' || typeof data.openArtifact !== 'string') return;

    switch (data.openArtifact) {
      case 'chrome_hello': {
        const said = (data as { draws?: unknown }).draws;
        draws = new Set(Array.isArray(said) ? (said.filter((d) => typeof d === 'string') as ChromeDraw[]) : []);
        for (const handler of helloHandlers) handler(draws);
        post({ openArtifact: 'chrome_report', protocol: SHELL_PROTOCOL, report: lastReport });
        break;
      }
      case 'chrome_cmd': {
        const command = data as unknown as ChromeCommand & { openArtifact: string };
        for (const handler of commandHandlers) {
          const items = handler(command);
          if (command.cmd === 'exports' && items) {
            post({ openArtifact: 'chrome_exports', id: command.id, items });
          }
        }
        break;
      }
      case 'files_changed': {
        const paths = Array.isArray((data as { paths?: unknown }).paths) ? ((data as { paths: string[] }).paths) : [];
        let handled = false;
        for (const handler of filesHandlers) handled = handler(paths) || handled;
        if (handled) post({ openArtifact: 'files_changed_ok' });
        break;
      }
      default:
        break;
    }
  };
  window.addEventListener('message', onMessage);

  return {
    origin,
    get draws() {
      return draws;
    },
    onHello(handler) {
      helloHandlers.add(handler);
      return () => helloHandlers.delete(handler);
    },
    exportState(request, state, reason) {
      post({ openArtifact: 'chrome_export', request, state, ...(reason ? { reason } : {}) });
    },
    report(report) {
      lastReport = report;
      post({ openArtifact: 'chrome_report', protocol: SHELL_PROTOCOL, report });
    },
    onCommand(handler) {
      commandHandlers.add(handler);
      return () => commandHandlers.delete(handler);
    },
    onFilesChanged(handler) {
      filesHandlers.add(handler);
      return () => filesHandlers.delete(handler);
    },
    dispose() {
      window.removeEventListener('message', onMessage);
      commandHandlers.clear();
      filesHandlers.clear();
      helloHandlers.clear();
    },
  };
}
