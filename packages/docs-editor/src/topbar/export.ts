/** Making a file of the doc or of its open tab, and saving it where the host keeps downloads (else the browser). */
import { saveFile } from '@open-artifact/editor-kit';
import type { DocExportFormat, DocPaper } from '@open-artifact/runtime/doc-api';
import { toast } from '@open-artifact/ui';
import { session } from '../app/session.ts';
import { getDocs } from '../app/store.ts';
import { getTopBar, setTopBar } from './store.ts';
import { type ExportNoteLike, FORMAT_NAMES, notesText } from './words.ts';

export interface ExportChoice {
  format: DocExportFormat;
  /** The open tab only, or every tab. */
  scope: 'tab' | 'doc';
  paper?: DocPaper;
}

export const exportKey = (choice: ExportChoice) => `${choice.scope}:${choice.format}:${choice.paper ?? ''}`;

export async function exportDoc(choice: ExportChoice): Promise<boolean> {
  if (getTopBar().exporting) return false;
  const { activeTab } = getDocs();
  const kind = FORMAT_NAMES[choice.format];
  const what = choice.scope === 'tab' ? 'this tab' : 'the document';
  if (choice.scope === 'tab' && !activeTab) return false;
  setTopBar({ exporting: exportKey(choice) });
  try {
    const { doc, downloads } = session();
    const file = await doc.exportFile({ format: choice.format, ...(choice.scope === 'tab' && activeTab ? { tab: activeTab } : {}), ...(choice.paper ? { paper: choice.paper } : {}) });
    const bytes = new Uint8Array(file.bytes);
    const saved = await saveFile(downloads, file.name, new Blob([bytes], { type: file.mime }));
    const where = saved.to === 'host' && saved.savedTo ? `Saved to ${saved.savedTo}.` : undefined;
    const notes = notesText(file.notes as readonly ExportNoteLike[]);
    toast.add({ title: `Exported as ${kind}`, description: [notes, where].filter(Boolean).join(' ') || undefined });
    return true;
  } catch {
    toast.add({ title: `Couldn’t export as ${kind}`, description: `Couldn’t export ${what} as ${kind}. Try again in a moment.` });
    return false;
  } finally {
    setTopBar({ exporting: null });
  }
}
