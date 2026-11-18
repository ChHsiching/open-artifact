/** Adding pictures: from a paste, a drop or the file picker, uploaded to the host and put in as `media` atoms. */
import { blobRef } from '@open-artifact/docs-core';
import type { AssetRecord } from '@open-artifact/runtime';
import { announce } from '@open-artifact/editor-kit';
import { toast } from '@open-artifact/ui';
import type { Attrs, Node as PMNode } from 'prosemirror-model';
import { NodeSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { maybeSession } from '../app/session.ts';
import { getDocs } from '../app/store.ts';
import { currentView, useEditor } from '../editor/format.ts';
import { schema } from '../editor/schema.ts';
import { type FileVerdict, IMAGE_TYPES, judgeImageFile, pixelDims, placeholderBox, refusalMessage } from './geometry.ts';
import { addPending, liveUploads, markReplacing, pendingPos, removePending } from './pending.ts';
import { dropPlace } from './place.ts';

const { nodes } = schema;

/** True when this viewer may add pictures to the open doc. */
export function canAddImages(): boolean {
  return !!maybeSession()?.assets && getDocs().writable;
}

let serial = 0;
const nextId = () => `upload-${Date.now().toString(36)}-${(serial += 1)}`;

/** The pixel size of a picture file, or null when the browser can't read it. */
async function decodeDims(file: Blob): Promise<{ w: number; h: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return pixelDims(image.naturalWidth, image.naturalHeight);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function upload(file: File): Promise<AssetRecord> {
  const assets = maybeSession()?.assets;
  if (!assets) throw new Error('This doc can’t take uploads.');
  return assets.upload(file, file.name ? { name: file.name } : undefined);
}

/** The attrs of a picture just uploaded. */
function mediaAttrs(record: AssetRecord, file: File, dims: { w: number; h: number } | null): Attrs {
  return {
    blob: blobRef(record.id),
    mime: record.contentType || file.type || null,
    name: file.name ? file.name.slice(0, 512) : null,
    dims,
  };
}

/** The view of `tab`, while it is the one shown. */
function viewOf(tab: string): EditorView | null {
  const view = currentView();
  return view && !view.isDestroyed && useEditor.getState().tab === tab ? view : null;
}

/** Makes the selection a place inline content can go, adding an empty paragraph when it is on a block, and returns it. */
function inlinePlace(tr: Transaction): number {
  if (!tr.selection.empty) tr.deleteSelection();
  const { $from } = tr.selection;
  if ($from.parent.inlineContent && $from.parent.type !== nodes.codeBlock) return $from.pos;
  const paragraph = nodes.paragraph!.create();
  let at = $from.parent.type === nodes.codeBlock ? $from.after() : tr.selection.to;
  const $at = tr.doc.resolve(at);
  if (!$at.parent.canReplaceWith($at.index(), $at.index(), nodes.paragraph!)) at = $from.depth >= 1 ? $from.after(1) : tr.doc.content.size;
  tr.insert(at, paragraph);
  return at + 1;
}

/** Puts a picture in at `pos`: inline where text can go, else in a paragraph of its own after the block there. */
function insertMediaAt(tr: Transaction, pos: number, node: PMNode): void {
  const $pos = tr.doc.resolve(Math.min(pos, tr.doc.content.size));
  if ($pos.parent.inlineContent && $pos.parent.type !== nodes.codeBlock) {
    tr.insert($pos.pos, node);
    return;
  }
  const at = $pos.depth >= 1 ? $pos.after(1) : tr.doc.content.size;
  tr.insert(at, nodes.paragraph!.create(null, node));
}

function verdicts(files: readonly File[]): { taken: File[]; refused: FileVerdict[] } {
  const taken: File[] = [];
  const refused: FileVerdict[] = [];
  for (const file of files) {
    const verdict = judgeImageFile(file);
    if (verdict === 'ok') taken.push(file);
    else refused.push(verdict);
  }
  return { taken, refused };
}

function addedMessage(count: number): string {
  return count === 1 ? 'Image added' : `${count} images added`;
}

const failMessage = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Try again in a moment.');

/**
 * Uploads `files` and puts each picture in where the selection is (or at `at`), in the order given. While they
 * upload a box holds each one's place; one that fails is left out and a toast says why.
 */
export function addImageFiles(view: EditorView, files: readonly File[], at?: number): boolean {
  if (!canAddImages()) {
    toast.add({ title: 'You can’t add images to this doc' });
    return false;
  }
  const { taken, refused } = verdicts(files);
  const refusal = refusalMessage(refused);
  if (refusal) toast.add({ title: refusal });
  if (!taken.length) return refused.length > 0;
  const tab = useEditor.getState().tab;
  if (!tab) return false;

  const tr = view.state.tr;
  const pos = at === undefined ? inlinePlace(tr) : dropPlace(tr, at);
  const room = view.dom.clientWidth || 640;
  const ids = taken.map(() => nextId());
  for (const id of ids) liveUploads.add(id);
  addPending(tr, ids.map(id => ({ id, pos, box: placeholderBox(null, room) })));
  view.dispatch(tr.scrollIntoView());
  announce('Uploading…');

  const results = taken.map(async file => {
    const [dims, record] = await Promise.all([decodeDims(file), upload(file)]);
    return { file, dims, record };
  });
  // Each is awaited in turn below; this keeps a later one's failure from being reported as unhandled meanwhile.
  for (const result of results) result.catch(() => undefined);
  void (async () => {
    let added = 0;
    for (const [index, result] of results.entries()) {
      const id = ids[index]!;
      try {
        const { file, dims, record } = await result;
        const live = viewOf(tab);
        const place = live ? pendingPos(live.state, id) : null;
        if (!live || place === null) continue;
        const done = removePending(live.state.tr, [id]);
        insertMediaAt(done, place, nodes.media!.create(mediaAttrs(record, file, dims)));
        live.dispatch(done);
        added += 1;
      } catch (error) {
        toast.add({ title: 'Couldn’t upload the image', description: failMessage(error) });
        const live = viewOf(tab);
        if (live) live.dispatch(removePending(live.state.tr, [id]));
      } finally {
        liveUploads.delete(id);
      }
    }
    if (added) announce(addedMessage(added));
  })();
  return true;
}

/** Asks for picture files with the system's file picker; empty when none were chosen. */
function chooseFiles(multiple: boolean): Promise<File[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = [...IMAGE_TYPES].join(',');
    input.multiple = multiple;
    input.style.display = 'none';
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish([...(input.files ?? [])]));
    input.addEventListener('cancel', () => finish([]));
    document.body.append(input);
    input.click();
  });
}

/** Opens the file picker and puts the pictures chosen in at the cursor of the tab shown. */
export async function pickImage(): Promise<void> {
  if (!canAddImages()) {
    toast.add({ title: 'You can’t add images to this doc' });
    return;
  }
  const view = currentView();
  if (!view) return;
  const tab = useEditor.getState().tab;
  const files = await chooseFiles(true);
  const live = tab ? viewOf(tab) : null;
  if (!files.length || !live) return;
  addImageFiles(live, files);
  live.focus();
}

/** Opens the file picker and puts the picture chosen in place of the one at `pos`, keeping its size. */
export async function replaceImage(pos: number): Promise<void> {
  const view = currentView();
  const tab = useEditor.getState().tab;
  if (!view || !tab || !canAddImages()) return;
  const before = view.state.doc.nodeAt(pos);
  if (before?.type !== nodes.media) return;
  const [file] = await chooseFiles(false);
  if (!file) return;
  const verdict = judgeImageFile(file);
  if (verdict !== 'ok') {
    toast.add({ title: refusalMessage([verdict]) ?? 'That file can’t be added.' });
    return;
  }
  const live = viewOf(tab);
  const node = live?.state.doc.nodeAt(pos);
  if (!live || node?.type !== nodes.media || node.attrs.blob !== before.attrs.blob) {
    toast.add({ title: 'Couldn’t replace the image. It was changed or deleted.' });
    return;
  }
  const id = nextId();
  liveUploads.add(id);
  live.dispatch(markReplacing(live.state.tr, id, pos));
  announce('Uploading…');
  try {
    const [dims, record] = await Promise.all([decodeDims(file), upload(file)]);
    const now = viewOf(tab);
    const place = now ? pendingPos(now.state, id) : null;
    const target = place === null ? null : now?.state.doc.nodeAt(place);
    if (!now || place === null || target?.type !== nodes.media) {
      toast.add({ title: 'Couldn’t replace the image. It was deleted.' });
      return;
    }
    const tr = removePending(now.state.tr, [id]);
    tr.setNodeMarkup(place, undefined, { ...target.attrs, ...mediaAttrs(record, file, dims), src: null, url: null, crop: null, alt: null });
    tr.setSelection(NodeSelection.create(tr.doc, place));
    now.dispatch(tr);
    announce('Image replaced');
  } catch (error) {
    toast.add({ title: 'Couldn’t replace the image', description: failMessage(error) });
    const now = viewOf(tab);
    if (now) now.dispatch(removePending(now.state.tr, [id]));
  } finally {
    liveUploads.delete(id);
  }
}

/** The picture files among what was pasted or dropped. */
export function filesOf(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = [...data.files];
  if (files.length) return files;
  const out: File[] = [];
  for (const item of data.items) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) out.push(file);
  }
  return out;
}
