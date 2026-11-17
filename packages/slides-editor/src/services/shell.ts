/**
 * The bridge to an Open Artifact Shell framing this page. The editor
 * reports its agent status, save state, page actions, export formats and
 * comments; the Shell sends commands back (actions, exports, comment mode).
 * File changes are merged live by the sync service, so the Shell never
 * reloads the frame under the viewer.
 */

import type { ChromeReport } from '@open-artifact/runtime';
import { agentChrome, chromeReporter, openMessageCount } from '@open-artifact/editor-kit';
import { create } from 'zustand';
import { isDirty, useDeck, type SaveState } from '../state/deck.ts';
import { useView } from '../state/view.ts';
import { useAgent } from './agent.ts';
import { redo, undo } from './commands.ts';
import { useComments } from './comments.ts';
import { writingShortfall, type WritingProgress } from './creation.ts';
import { exportBusy, runExport, type ExportRequest } from './exports.ts';
import { playableSlides } from './present.ts';
import { session } from './session.ts';
import { flush, retryNow } from './sync.ts';

type ChromeAction = NonNullable<ChromeReport['actions']>[number];
type ChromeFormat = NonNullable<ChromeReport['formats']>[number];
type ChromeSaved = NonNullable<ChromeReport['saved']>;

/** Export dialogs the editor opens itself (the PDF options). */
interface ExportUi {
  /** A pending PDF request from the Shell (its request id), or a local one (null). */
  pdf: { request: string | null } | null;
  /** A pending web page request, the same way. */
  html: { request: string | null } | null;
  /** The last run: what the export could not do. */
  notes: { name: string; notes: string[] } | null;
  /** An export asked for while the agent is still writing the deck, waiting for "Download anyway". */
  partial: { request: ExportRequest; shellRequest: string | null; progress: WritingProgress } | null;
  running: boolean;
  openPdf(request: string | null): void;
  closePdf(): void;
  openHtml(request: string | null): void;
  closeHtml(): void;
  setNotes(notes: ExportUi['notes']): void;
}

/** A Shell PowerPoint variant as a request. */
export function pptxRequest(variant: string | undefined): ExportRequest {
  switch (variant) {
    case 'basic':
      return { format: 'pptx', fonts: 'basic' };
    case 'embed':
      return { format: 'pptx', fonts: 'embed' };
    case 'pictures':
      return { format: 'pptx', fonts: 'current', pictures: true };
    default:
      return { format: 'pptx', fonts: 'current' };
  }
}

/** The export dialogs' state. */
export const useExportUi = create<ExportUi>()((set) => ({
  pdf: null,
  html: null,
  notes: null,
  partial: null,
  running: false,
  openPdf(request) {
    set({ pdf: { request } });
  },
  closePdf() {
    set({ pdf: null });
  },
  openHtml(request) {
    set({ html: { request } });
  },
  closeHtml() {
    set({ html: null });
  },
  setNotes(notes) {
    set({ notes });
  },
}));

/** The Shell's save state of ours. */
function savedOf(save: SaveState): ChromeSaved {
  switch (save) {
    case 'saved':
      return 'saved';
    case 'saving':
      return 'saving';
    case 'dirty':
      return 'unsaved';
    case 'offline':
      return 'reconnecting';
    case 'readonly':
      return 'readonly';
  }
}

/** The export formats offered. */
export function exportFormats(): ChromeFormat[] {
  const deck = useDeck.getState();
  const empty = deck.status !== 'ready' || playableSlides().length === 0;
  const disabled = empty || exportBusy();
  return [
    { format: 'pdf', label: 'PDF', description: 'One page per slide, with selectable text', interactive: true, disabled },
    {
      format: 'pptx',
      label: 'PowerPoint',
      description: 'Editable slides',
      disabled,
      variants: [
        { id: 'current', label: 'PowerPoint, current fonts' },
        { id: 'embed', label: 'PowerPoint, embedded fonts' },
        { id: 'basic', label: 'PowerPoint, basic fonts' },
        { id: 'pictures', label: 'PowerPoint, slides as pictures' },
      ],
    },
    { format: 'html', label: 'Web page (.html)', description: 'A self-contained page that presents the deck', disabled },
    { format: 'png', label: 'Current slide as image (.png)', disabled: disabled || !useView.getState().current },
  ];
}

/** The page actions offered. */
function actions(): ChromeAction[] {
  const deck = useDeck.getState();
  return [
    { id: 'undo', disabled: deck.undo.length === 0 || deck.readOnly },
    { id: 'redo', disabled: deck.redo.length === 0 || deck.readOnly },
    { id: 'open_find' },
    { id: 'save_now', disabled: !isDirty(deck) || deck.readOnly },
    { id: 'present', label: 'Present', disabled: playableSlides().length === 0 },
  ];
}

/**
 * Runs an export the Shell or the toolbar asked for. While the agent is
 * still writing the deck, the person is first asked whether to download the
 * slides written so far (`confirmed` skips the question).
 */
export async function startExport(request: ExportRequest, shellRequest: string | null = null, confirmed = false): Promise<void> {
  const shell = session().shell;
  if (exportBusy()) {
    if (shellRequest) shell?.exportState(shellRequest, 'busy');
    return;
  }
  const writing = writingShortfall();
  if (writing && !confirmed) {
    // A question already open is answered no: the newer request takes its place.
    const waiting = useExportUi.getState().partial;
    if (waiting?.shellRequest) shell?.exportState(waiting.shellRequest, 'declined', 'Another download was asked for.');
    useExportUi.setState({ partial: { request, shellRequest, progress: writing } });
    return;
  }
  if (shellRequest) shell?.exportState(shellRequest, 'started');
  useExportUi.setState({ running: true });
  try {
    const result = await runExport(request, undefined, { writing: writing ?? undefined });
    if (shellRequest) shell?.exportState(shellRequest, 'done');
    useExportUi.getState().setNotes(result.notes.length ? { name: result.name, notes: result.notes } : null);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (shellRequest) shell?.exportState(shellRequest, 'failed', reason);
    useExportUi.getState().setNotes({ name: 'Download failed', notes: [reason] });
  } finally {
    useExportUi.setState({ running: false });
  }
}

/** Answers the "only x of y slides so far" question. */
export function answerPartialExport(download: boolean): void {
  const waiting = useExportUi.getState().partial;
  if (!waiting) return;
  useExportUi.setState({ partial: null });
  if (download) void startExport(waiting.request, waiting.shellRequest, true);
  else if (waiting.shellRequest) session().shell?.exportState(waiting.shellRequest, 'declined', 'The deck is still being written.');
}

/** Starts reporting to the Shell, if there is one. */
export function startShellBridge(): void {
  const shell = session().shell;
  if (!shell) return;
  const report = chromeReporter(shell, () => {
    const deck = useDeck.getState();
    const comments = useComments.getState();
    return {
      agent: agentChrome(useAgent.getState().status),
      exports: false,
      ...(deck.status === 'ready' ? { saved: savedOf(deck.save) } : {}),
      leaveLosesWork: isDirty(deck) && deck.save !== 'saved',
      actions: actions(),
      formats: exportFormats(),
      ...(comments.available
        ? { comments: { available: true, on: comments.on, open: comments.listOpen, count: openMessageCount(comments.threads), pageButton: false } }
        : {}),
    };
  });
  report();
  useAgent.subscribe(report);
  useDeck.subscribe(report);
  useComments.subscribe(report);
  useView.subscribe((state, previous) => {
    if (state.current !== previous.current) report();
  });
  useExportUi.subscribe(report);
  shell.onFilesChanged(() => true);
  shell.onCommand((command) => {
    switch (command.cmd) {
      case 'exports':
        return [];
      case 'action':
        switch (command.id) {
          case 'undo':
            undo();
            break;
          case 'redo':
            redo();
            break;
          case 'open_find':
            useView.getState().toggle('findOpen', true);
            break;
          case 'save_now':
            retryNow();
            void flush();
            break;
          case 'present': {
            const start = useView.getState().current ?? playableSlides()[0];
            if (start) useView.getState().present({ start, speaker: false });
            break;
          }
        }
        return;
      case 'comments_mode': {
        const comments = useComments.getState();
        comments.setOn(command.on ?? !comments.on);
        return;
      }
      case 'comments_list': {
        const comments = useComments.getState();
        comments.setListOpen(command.open ?? !comments.listOpen);
        return;
      }
      case 'export_format': {
        const { request, format, variant } = command;
        if (format === 'pdf' || format === 'html') {
          if (exportBusy()) shell.exportState(request, 'busy');
          else if (format === 'pdf') useExportUi.getState().openPdf(request);
          else useExportUi.getState().openHtml(request);
          return;
        }
        if (format === 'pptx') void startExport(pptxRequest(variant), request);
        else if (format === 'png') {
          const id = useView.getState().current;
          if (id) void startExport({ format: 'png', slideId: id }, request);
          else shell.exportState(request, 'unsupported');
        } else shell.exportState(request, 'unsupported');
        return;
      }
      default:
        return;
    }
  });
}
