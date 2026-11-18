/** What the picture tools do to the picture they were opened on: size, alt text, copy, delete, resize and crop. */
import { announce } from '@open-artifact/editor-kit';
import { toast } from '@open-artifact/ui';
import type { Attrs, Node as PMNode } from 'prosemirror-model';
import { NodeSelection, Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { selectedMedia } from '../editor/commands.ts';
import { currentView, useEditor } from '../editor/format.ts';
import { cropOf, mediaSrc } from '../editor/node-views.ts';
import { schema } from '../editor/schema.ts';
import { ALT_MAX, type CropRect, FULL_CROP, type ImageSize, cleanAlt, pixelDims, sameCrop, sizeLabel, storedCrop, widthAfterCrop } from './geometry.ts';
import { type ImageTarget, getImages, setImages } from './store.ts';

/** The picture selected in the tab shown. */
export function selectedTarget(): ImageTarget | null {
  const { state, tab } = useEditor.getState();
  const found = state && tab ? selectedMedia(state) : null;
  return found && tab ? { tab, pos: found.pos, blob: found.node.attrs.blob } : null;
}

/**
 * The picture a tool was opened on, if it is still there: same tab and same bytes. It is looked for where it was, then
 * as the picture selected, then as the nearest picture with those bytes, so an edit elsewhere in the doc doesn't lose it.
 */
export function findTarget(target: ImageTarget): { view: EditorView; node: PMNode; pos: number } | null {
  const view = currentView();
  if (!view || view.isDestroyed || useEditor.getState().tab !== target.tab || !target.blob) return null;
  const { doc, selection } = view.state;
  const matches = (node: PMNode | null | undefined) => node?.type === schema.nodes.media && node.attrs.blob === target.blob;
  const there = target.pos >= 0 && target.pos < doc.content.size ? doc.nodeAt(target.pos) : null;
  if (there && matches(there)) return { view, node: there, pos: target.pos };
  if (selection instanceof NodeSelection && matches(selection.node)) return { view, node: selection.node, pos: selection.from };
  let best: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (matches(node) && (!best || Math.abs(pos - target.pos) < Math.abs(best.pos - target.pos))) best = { node, pos };
    return !node.isInline;
  });
  const found = best as { node: PMNode; pos: number } | null;
  return found ? { view, ...found } : null;
}

/** The element the editor draws a picture with. */
export function mediaElement(view: EditorView, pos: number): HTMLElement | null {
  const dom = view.nodeDOM(pos);
  return dom instanceof HTMLElement ? dom : null;
}

/** Changes a picture's attrs and keeps it selected. */
function update(view: EditorView, pos: number, attrs: Attrs): void {
  const node = view.state.doc.nodeAt(pos)!;
  const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  view.dispatch(tr);
}

export function setImageSize(target: ImageTarget, size: ImageSize): void {
  const found = findTarget(target);
  if (!found) {
    toast.add({ title: 'Couldn’t set the image size. The image was changed or deleted.' });
    return;
  }
  if (found.node.attrs.width !== size) update(found.view, found.pos, { width: size });
  announce(`Image size set to ${sizeLabel(size)}`);
  found.view.focus();
}

export function resizeImage(target: ImageTarget, width: number): void {
  const found = findTarget(target);
  if (!found || found.node.attrs.width === width) return;
  update(found.view, found.pos, { width });
}

export function deleteImage(target: ImageTarget): void {
  const found = findTarget(target);
  if (!found) return;
  const { view, node, pos } = found;
  const tr = view.state.tr.delete(pos, pos + node.nodeSize);
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size))));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  announce('Image deleted');
}

export function openAltText(target: ImageTarget): void {
  const found = findTarget(target);
  if (!found) return;
  setImages({ alt: { ...target, text: typeof found.node.attrs.alt === 'string' ? found.node.attrs.alt.slice(0, ALT_MAX) : '' } });
}

/** Saves alt text; false when there was nothing to save. */
export function saveAltText(target: ImageTarget, text: string): boolean {
  const alt = cleanAlt(text);
  if (!alt) return false;
  const found = findTarget(target);
  if (!found) {
    toast.add({ title: 'Couldn’t save alt text. The image was deleted.' });
    return true;
  }
  if (found.node.attrs.alt !== alt) update(found.view, found.pos, { alt: alt.slice(0, ALT_MAX) });
  found.view.focus();
  announce('Alt text saved');
  return true;
}

/** A picture's pixel size: what the browser decoded, else what the doc says. */
function naturalOf(node: PMNode, img: HTMLImageElement | null): { w: number; h: number } | null {
  if (img && img.naturalWidth > 0) return pixelDims(img.naturalWidth, img.naturalHeight);
  const dims = node.attrs.dims as { w?: unknown; h?: unknown } | null;
  return dims && typeof dims.w === 'number' && typeof dims.h === 'number' ? pixelDims(dims.w, dims.h) : null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = src;
  return image.decode().then(() => image);
}

/** The picture as PNG bytes, cut to its crop. */
async function pngOf(src: string, crop: CropRect | null): Promise<Blob> {
  const image = await loadImage(src);
  const part = crop ?? FULL_CROP;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * part.w));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * part.h));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');
  context.drawImage(image, image.naturalWidth * part.x, image.naturalHeight * part.y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('No PNG'))), 'image/png'));
}

export function copyImage(target: ImageTarget): void {
  const found = findTarget(target);
  if (!found) return;
  const src = mediaSrc(found.node.attrs);
  if (!src || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    toast.add({ title: 'Couldn’t copy the image' });
    return;
  }
  // The bytes are handed over as a promise, so the write still counts as part of the click.
  const item = new ClipboardItem({ 'image/png': pngOf(src, cropOf(found.node.attrs.crop)) });
  navigator.clipboard.write([item]).then(
    () => announce('Image copied'),
    () => toast.add({ title: 'Couldn’t copy the image' }),
  );
}

/* ---------------------------------- crop ---------------------------------- */

/** Starts crop mode on the selected picture; false when it can't be cropped now. */
export function startCrop(target: ImageTarget): boolean {
  const found = findTarget(target);
  if (!found || getImages().crop) return false;
  const { view, node, pos } = found;
  const dom = mediaElement(view, pos);
  const page = view.dom.closest('.doc-page');
  const img = dom?.querySelector('img') ?? null;
  const natural = naturalOf(node, img);
  const src = mediaSrc(node.attrs);
  if (!dom || !page || !natural || !src) {
    toast.add({ title: 'Can’t crop the image yet. Try again in a moment.' });
    return false;
  }
  const box = dom.getBoundingClientRect();
  const origin = page.getBoundingClientRect();
  if (!box.width) return false;
  const entry = cropOf(node.attrs.crop) ?? FULL_CROP;
  const width = box.width / entry.w;
  const height = (width * natural.h) / natural.w;
  setImages({
    crop: {
      ...target,
      pos,
      src,
      natural,
      frame: { left: box.left - origin.left - entry.x * width, top: box.top - origin.top - entry.y * height, width, height },
      entry,
      rect: { ...entry },
    },
  });
  announce('Crop mode: drag an edge of the image to crop it. Enter keeps the crop, Escape cancels it.');
  return true;
}

function endCrop(): void {
  const session = getImages().crop;
  setImages({ crop: null });
  const found = session ? findTarget(session) : null;
  found?.view.focus();
}

export function cancelCrop(): void {
  if (!getImages().crop) return;
  endCrop();
  announce('Crop cancelled');
}

/** Keeps the crop set in crop mode. */
export function applyCrop(): void {
  const session = getImages().crop;
  if (!session) return;
  const found = findTarget(session);
  const crop = storedCrop(session.rect);
  const before = storedCrop(session.entry);
  if (!found) {
    endCrop();
    toast.add({ title: 'Couldn’t apply the crop' });
    return;
  }
  if (sameCrop(crop, before)) {
    endCrop();
    announce('Crop unchanged');
    return;
  }
  const { node } = found;
  const dims = naturalOf(node, null) ? node.attrs.dims : session.natural;
  update(found.view, found.pos, { crop, dims, width: widthAfterCrop(node.attrs.width, session.frame.width, crop) });
  endCrop();
  announce(crop ? 'Image cropped' : 'Crop removed');
}

export function setCropRect(rect: CropRect): void {
  const session = getImages().crop;
  if (session) setImages({ crop: { ...session, rect } });
}
