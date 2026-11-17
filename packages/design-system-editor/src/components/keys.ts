/** Keyboard shortcuts of the page. */

import { isApplePlatform, isTextField } from '@open-artifact/editor-kit';
import { useFiles } from '../state/files.ts';
import { useView } from '../state/view.ts';
import { flush } from '../services/sync.ts';
import { runCollabShortcut } from '../services/collab.ts';

const IS_MAC = isApplePlatform();

/** Installs the shortcuts; returns the uninstaller. */
export function installKeyboard(): () => void {
  const onKey = (event: KeyboardEvent): void => {
    const mod = IS_MAC ? event.metaKey : event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === 's') {
      event.preventDefault();
      void flush();
      return;
    }
    if (mod && key === 'k') {
      event.preventDefault();
      document.querySelector<HTMLInputElement>('[data-search]')?.focus();
      return;
    }
    if (isTextField(event.target)) return;
    if (mod && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) useFiles.getState().redoStep();
      else useFiles.getState().undoStep();
    } else if (mod && key === 'y') {
      event.preventDefault();
      useFiles.getState().redoStep();
    } else if (key === 'escape') {
      const view = useView.getState();
      if (view.composer) view.closeComposer();
      else if (runCollabShortcut({ key: event.key })) return;
      else view.setFocus(null);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
