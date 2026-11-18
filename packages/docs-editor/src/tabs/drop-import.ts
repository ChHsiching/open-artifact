/**
 * A Markdown, text, Word or PDF file dropped on the doc becomes a new tab, as "Import file…" makes one (same upload,
 * same toasts). Dropped on the text, the editor's drop goes here first: pictures in the same drop go on to the picture
 * upload, and a drop of pictures alone is left to it. Dropped anywhere else on the page, the window takes it, so the
 * browser does not leave the doc to show the file. Only editors import.
 */
import { toast } from '@open-artifact/ui';
import { Plugin } from 'prosemirror-state';
import { useEffect } from 'react';
import { getDocs } from '../app/store.ts';
import { addImageFiles, filesOf } from '../images/upload.ts';
import { importFiles, isImportable } from './import-file.ts';

const canImport = (): boolean => getDocs().writable;

const hasFiles = (data: DataTransfer | null | undefined): boolean => !!data && [...data.types].includes('Files');

/** The editor's side: a drop on the text with files to import. */
export function dropImportPlugin(): Plugin {
  return new Plugin({
    props: {
      handleDrop(view, event, _slice, moved) {
        if (moved || view.dragging || !canImport()) return false;
        const files = filesOf(event.dataTransfer);
        const imported = files.filter(isImportable);
        if (!imported.length) return false;
        const rest = files.filter(file => !isImportable(file));
        if (rest.length) {
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          addImageFiles(view, rest, at ? at.pos : view.state.selection.to);
        }
        void importFiles(imported);
        return true;
      },
    },
  });
}

/**
 * The window's side: a drop of files anywhere but the text (the editor answers its own). Files the doc does not import
 * are kept from opening in place of the page.
 */
export function listenForDroppedFiles(target: Window): () => void {
  const over = (event: DragEvent) => {
    if (event.defaultPrevented || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = canImport() ? 'copy' : 'none';
  };
  const drop = (event: DragEvent) => {
    if (event.defaultPrevented || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    if (!canImport()) return;
    const files = filesOf(event.dataTransfer);
    const imported = files.filter(isImportable);
    if (imported.length) void importFiles(imported);
    else if (files.length) toast.add({ title: files.every(file => file.type.startsWith('image/')) ? 'To add a picture, drop it on the text.' : 'A doc imports Markdown (.md), text (.txt), Word (.docx) or PDF (.pdf) files.' });
  };
  target.addEventListener('dragover', over);
  target.addEventListener('drop', drop);
  return () => {
    target.removeEventListener('dragover', over);
    target.removeEventListener('drop', drop);
  };
}

/** Listens for files dropped on the page while the doc is open (drawn in the overlay slot; it shows nothing). */
export function DropImportTarget(): null {
  useEffect(() => listenForDroppedFiles(window), []);
  return null;
}
