/** The editor's side of pictures: upload boxes, picture files pasted or dropped into the text, and Enter into a selected picture's bar. */
import { NodeSelection, Plugin } from 'prosemirror-state';
import { IMAGE_TYPES } from './geometry.ts';
import { pendingPlugin } from './pending.ts';
import { addImageFiles, canAddImages, filesOf } from './upload.ts';

/** True when pasted HTML says more than the picture beside it (an office app puts both on the clipboard). */
function htmlHasText(html: string): boolean {
  if (!html.trim()) return false;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, '') !== '';
}

const isImage = (file: File) => IMAGE_TYPES.has(file.type.toLowerCase());

function filesPlugin(): Plugin {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const files = filesOf(event.clipboardData);
        if (!files.some(isImage) || !canAddImages()) return false;
        if (files.every(isImage) && htmlHasText(event.clipboardData?.getData('text/html') ?? '')) return false;
        event.preventDefault();
        return addImageFiles(view, files);
      },
      handleDrop(view, event, _slice, moved) {
        if (moved || view.dragging) return false;
        const files = filesOf(event.dataTransfer);
        if (!files.length || !canAddImages()) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        event.preventDefault();
        return addImageFiles(view, files, at ? at.pos : view.state.selection.to);
      },
    },
  });
}

/** Enter on a selected picture moves into its bar's controls. */
function enterBarPlugin(): Plugin {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return false;
        const { selection } = view.state;
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'media') return false;
        const control = view.dom.ownerDocument.querySelector<HTMLElement>('[data-image-bar] button:not([disabled])');
        if (!control) return false;
        event.preventDefault();
        control.focus();
        return true;
      },
    },
  });
}

export function imagePlugins(): Plugin[] {
  return [pendingPlugin(), filesPlugin(), enterBarPlugin()];
}
