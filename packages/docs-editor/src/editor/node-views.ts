/** How the editor draws what plain DOM can't: check boxes, chips, pictures and blocks still being written. */
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView, NodeViewConstructor } from 'prosemirror-view';
import { getDocs } from '../app/store.ts';
import { schema } from './schema.ts';

/** The URL a picture's bytes are at. */
export function mediaSrc(attrs: Record<string, unknown>): string {
  const blob = typeof attrs.blob === 'string' ? attrs.blob : '';
  if (/^blob\/[A-Za-z0-9_-]{1,64}$/.test(blob)) return `/_blob/${blob.slice('blob/'.length)}`;
  const src = (attrs.src ?? attrs.url) as string | null;
  return typeof src === 'string' && /^(https?:|data:image\/|\/)/.test(src) ? src : '';
}

export function formatDate(ts: unknown): string {
  if (typeof ts !== 'string' || !ts) return 'Date';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(ts) ? new Date(`${ts}T00:00:00`) : new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** A dropdown chip's option: its name and color, or null when the list or option is gone. */
export function dropdownOption(enumId: unknown, index: unknown): { name: string; color: string | null } | null {
  const list = getDocs().project?.enums.find(item => item.id === enumId);
  if (!list || typeof index !== 'number') return null;
  const option = list.options[index];
  return option ? { name: option.name, color: option.color ?? null } : null;
}

class CheckItemView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private box: HTMLButtonElement;
  private node: PMNode;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.dom = document.createElement('li');
    this.box = document.createElement('button');
    this.box.type = 'button';
    this.box.className = 'doc-check';
    this.box.contentEditable = 'false';
    this.box.addEventListener('mousedown', event => event.preventDefault());
    this.box.addEventListener('click', () => {
      const pos = getPos();
      if (pos === undefined || !view.editable) return;
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, checked: !this.node.attrs.checked }));
    });
    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'doc-check-body';
    this.dom.append(this.box, this.contentDOM);
    this.draw();
  }

  private draw(): void {
    const checked = !!this.node.attrs.checked;
    if (this.node.attrs.bid) this.dom.dataset.bid = this.node.attrs.bid;
    this.dom.dataset.checked = String(checked);
    this.dom.className = 'doc-check-item';
    this.box.setAttribute('role', 'checkbox');
    this.box.setAttribute('aria-checked', String(checked));
    this.box.setAttribute('aria-label', checked ? 'Done' : 'Not done');
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type || node.attrs.checked === null) return false;
    this.node = node;
    this.draw();
    return true;
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    return mutation.target === this.box || this.box.contains(mutation.target as Node);
  }

  stopEvent(event: Event): boolean {
    return event.target === this.box;
  }
}

function chip(className: string, text: string, attrs: Record<string, string> = {}): HTMLElement {
  const dom = document.createElement('span');
  dom.className = `doc-chip ${className}`;
  dom.textContent = text;
  for (const [key, value] of Object.entries(attrs)) dom.setAttribute(key, value);
  return dom;
}

/** A picture's crop: the part kept, as fractions of the whole. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function cropOf(value: unknown): Crop | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y, w, h } = value as Record<string, unknown>;
  if (![x, y, w, h].every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  const crop = { x, y, w, h } as Crop;
  return crop.w > 0 && crop.h > 0 && crop.w <= 1 && crop.h <= 1 && (crop.w < 1 || crop.h < 1) ? crop : null;
}

class MediaView implements NodeView {
  dom: HTMLElement;
  private img: HTMLImageElement;
  private node: PMNode;

  constructor(node: PMNode) {
    this.node = node;
    this.dom = document.createElement('span');
    this.dom.className = 'doc-media';
    this.img = document.createElement('img');
    this.img.draggable = false;
    this.dom.append(this.img);
    this.draw();
  }

  private draw(): void {
    const { attrs } = this.node;
    const src = mediaSrc(attrs);
    if (this.img.getAttribute('src') !== src) this.img.src = src;
    this.img.alt = (attrs.alt as string | null) ?? '';
    const width = attrs.width as string | number | null;
    this.dom.dataset.size = typeof width === 'string' ? width : '';
    const crop = cropOf(attrs.crop);
    const dims = attrs.dims as { w?: number; h?: number } | null;
    this.dom.style.width = typeof width === 'number' ? `${width}px` : crop && !width && dims?.w ? `${Math.round(dims.w * crop.w)}px` : '';
    if (crop) {
      this.dom.classList.add('doc-media-cropped');
      const ratio = dims?.w && dims?.h ? (crop.w * dims.w) / (crop.h * dims.h) : crop.w / crop.h;
      Object.assign(this.dom.style, { aspectRatio: String(ratio) });
      Object.assign(this.img.style, { width: `${100 / crop.w}%`, height: `${100 / crop.h}%`, left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%` });
    } else {
      this.dom.classList.remove('doc-media-cropped');
      Object.assign(this.dom.style, { aspectRatio: '' });
      Object.assign(this.img.style, { width: '', height: '', left: '', top: '' });
    }
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.draw();
    return true;
  }

  selectNode(): void {
    this.dom.classList.add('doc-selected');
  }

  deselectNode(): void {
    this.dom.classList.remove('doc-selected');
  }
}

class AtomChipView implements NodeView {
  dom: HTMLElement;
  private node: PMNode;
  private draw: (node: PMNode) => HTMLElement;

  constructor(node: PMNode, draw: (node: PMNode) => HTMLElement) {
    this.node = node;
    this.draw = draw;
    this.dom = draw(node);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    const next = this.draw(node);
    this.dom.className = next.className;
    this.dom.textContent = next.textContent;
    for (const name of next.getAttributeNames()) this.dom.setAttribute(name, next.getAttribute(name)!);
    return true;
  }

  selectNode(): void {
    this.dom.classList.add('doc-selected');
  }

  deselectNode(): void {
    this.dom.classList.remove('doc-selected');
  }
}

const drawDate = (node: PMNode) => chip('doc-date', formatDate(node.attrs.ts), { 'data-date': String(node.attrs.ts ?? '') });

const drawMention = (node: PMNode) => {
  const { label, name, ref, principal } = node.attrs as Record<string, string | null>;
  const isTab = typeof ref === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}$/.test(ref);
  const tabName = isTab ? getDocs().project?.files.find(file => file.id === ref)?.name : null;
  const text = label ?? tabName ?? name ?? (principal === 'agent' ? 'agent' : (ref ?? 'someone'));
  return chip(isTab ? 'doc-mention doc-mention-tab' : 'doc-mention', `${isTab ? '' : '@'}${text}`, { 'data-mention': principal ?? ref ?? '' });
};

const drawDropdown = (node: PMNode) => {
  const option = dropdownOption(node.attrs.enum, node.attrs.index);
  const dom = chip('doc-dropdown', option?.name ?? 'Select', { 'data-color': option?.color ?? 'gray' });
  if (!option) dom.classList.add('doc-dropdown-unset');
  return dom;
};

const drawPending = (node: PMNode) => {
  const dom = document.createElement('div');
  dom.className = 'doc-pending';
  dom.textContent = (node.attrs.intent as string) || 'Writing…';
  if (node.attrs.bid) dom.dataset.bid = node.attrs.bid;
  return dom;
};

const drawEmbed = (node: PMNode) => {
  const dom = document.createElement('div');
  dom.className = 'doc-embed';
  const data = (node.attrs.data ?? {}) as Record<string, unknown>;
  dom.textContent = typeof data.title === 'string' ? data.title : 'Embedded content';
  if (node.attrs.bid) dom.dataset.bid = node.attrs.bid;
  return dom;
};

/** Node views the editor always has; more are added by the features that draw blocks themselves. */
export const baseNodeViews: Record<string, NodeViewConstructor> = {
  listItem: (node, view, getPos) => (node.attrs.checked === null ? (undefined as unknown as NodeView) : new CheckItemView(node, view, getPos)),
  media: node => new MediaView(node),
  date: node => new AtomChipView(node, drawDate),
  mention: node => new AtomChipView(node, drawMention),
  dropdown: node => new AtomChipView(node, drawDropdown),
  pending: node => new AtomChipView(node, drawPending),
  embed: node => new AtomChipView(node, drawEmbed),
};

export { schema };
