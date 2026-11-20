/**
 * A file dropped where nothing takes it (a read-only canvas, the panels,
 * the toolbars) would make the browser open the file in place of the
 * editor. This guard swallows such drops; a handler that takes the drop
 * has already prevented its default, and is left alone.
 */

/** The parts of a drag event the guard reads. */
export interface FileDragEvent {
  type: string;
  defaultPrevented: boolean;
  dataTransfer: { types: ArrayLike<string> | Iterable<string>; dropEffect: string } | null;
  preventDefault(): void;
}

/** The parts of a window the guard listens on. */
export interface FileDropWindow {
  addEventListener(type: 'dragover' | 'drop', listener: (event: FileDragEvent) => void): void;
  removeEventListener(type: 'dragover' | 'drop', listener: (event: FileDragEvent) => void): void;
}

/** True when the drag carries files from outside the page. */
export function carriesFiles(event: FileDragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/** Installs the guard; returns a function that removes it. */
export function guardFileDrops(win: FileDropWindow): () => void {
  const guard = (event: FileDragEvent) => {
    if (event.defaultPrevented || !carriesFiles(event)) return;
    event.preventDefault();
    if (event.type === 'dragover' && event.dataTransfer) event.dataTransfer.dropEffect = 'none';
  };
  win.addEventListener('dragover', guard);
  win.addEventListener('drop', guard);
  return () => {
    win.removeEventListener('dragover', guard);
    win.removeEventListener('drop', guard);
  };
}
