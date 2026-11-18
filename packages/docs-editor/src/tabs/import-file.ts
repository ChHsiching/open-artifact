/** A Markdown, Word or PDF file as a new tab: the file picker, the upload, and the toast that follows it. */
import type { DocImportNote } from '@open-artifact/runtime/doc-api';
import { toast } from '@open-artifact/ui';
import { session } from '../app/session.ts';
import { showTab } from '../app/start.ts';

const ACCEPT = '.md,.markdown,.docx,.pdf';
const IMPORTABLE = /\.(md|markdown|docx|pdf)$/i;

/** What stayed behind, in a line the person can act on. */
const notesLine = (notes: readonly DocImportNote[]) => notes.map(note => (note.count > 1 ? `${note.count} × ${note.what}` : note.what)).join('; ');

async function importOne(file: File): Promise<string | null> {
  const id = toast.add({ title: `Importing ${file.name}…`, type: 'loading', timeout: 0 });
  try {
    const answer = await session().doc.importFile(file.name, new Uint8Array(await file.arrayBuffer()));
    const first = answer.tabs[0];
    if (!first) {
      toast.update(id, { title: `Couldn't import ${file.name}.`, type: 'error', timeout: 4000 });
      return null;
    }
    const notes = notesLine(answer.notes ?? []);
    toast.update(id, {
      title: answer.tabs.length > 1 ? `Imported ${answer.tabs.length} tabs` : `Imported ${first.name}`,
      ...(notes ? { description: notes } : {}),
      type: 'success',
      timeout: 4000,
    });
    return first.id;
  } catch (error) {
    const why = error instanceof Error && error.message ? error.message : `Couldn't import ${file.name}.`;
    toast.update(id, { title: why, type: 'error', timeout: 4000 });
    return null;
  }
}

/** One at a time, in the order given, then to the first new tab. */
export async function importFiles(files: readonly File[]): Promise<void> {
  let first: string | null = null;
  for (const file of files.filter(item => IMPORTABLE.test(item.name))) {
    const tab = await importOne(file);
    first ??= tab;
  }
  if (first) showTab(first);
}

/** Opens the file picker. It hangs off the body, so a menu that closes when it opens does not take it along. */
export function pickFilesToImport(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPT;
  input.multiple = true;
  input.hidden = true;
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.remove();
    if (files.length) void importFiles(files);
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
  input.click();
}
