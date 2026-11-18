/**
 * The static HTML copy of the page: its visible elements only, through a tag and attribute allow-list, canvases and
 * pictures as `data:` URLs, a `<select>` as the value it shows, the SVG definitions it uses, a strict CSP and a footer
 * that says when it was made. The copy is written as text while the page is walked, so the walk runs on any tree
 * shaped like the DOM (tests pass plain objects).
 */

import { getElementSourceIds } from '@open-artifact/data-core';
import {
  ALLOWED_HTML_ATTRIBUTES,
  ALLOWED_SVG_ATTRIBUTES,
  SHOWN_ALLOWED_TAGS,
  STOP_ATTRIBUTE,
  SVG_DEFINITION_TAGS,
  isSafeShownSvgValue,
  isVisibleForExport,
  sanitizeShownLink,
} from '../page/shown-page.ts';

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const words = (text: string): ReadonlySet<string> => new Set(text.split(/\s+/));

const VOID_TAGS = words('br col hr img wbr');
const ARIA_ATTRIBUTE_PATTERN = /^aria-[a-z0-9-]+$/;
const LOCAL_SVG_REFERENCE_PATTERN = /^url\(["']?#([^"')\s]+)["']?\)$/;

/** What the copy allows: no scripts, styles, frames, forms or outside addresses; pictures only as `data:` URLs. */
export const HTML_EXPORT_CONTENT_SECURITY_POLICY = "default-src 'none'; img-src data:; base-uri 'none'; form-action 'none'";
/** The page element's `lang` when nothing says otherwise; the copy drops it. */
export const DEFAULT_COPY_LANGUAGE = 'en';
export const PAGE_NOT_COPYABLE_MESSAGE = 'This page can’t be copied here.';

export interface CopyAttribute {
  readonly name: string;
  readonly localName: string;
  readonly value: string;
}

export interface CopyNode {
  readonly nodeType: number;
  readonly nodeValue: string | null;
}

/** The part of a DOM element the copy reads. */
export interface CopyElement extends CopyNode {
  readonly localName: string;
  readonly namespaceURI: string | null;
  readonly attributes: Iterable<CopyAttribute>;
  readonly childNodes: Iterable<CopyNode>;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
}

/** What the copy asks of the live page. */
export interface StaticCopyHooks {
  /** The element is drawn (hidden, `display: none`, invisible or transparent ones are not). */
  visible(element: CopyElement): boolean;
  /** A canvas or picture as a `data:` URL; throws when it can't be read (the element is left out). */
  picture(element: CopyElement): string;
  /** The text a `<select>` shows. */
  shown(element: CopyElement): string;
}

export interface StaticCopy {
  /** The sources marked on the copied elements. */
  marked: Set<string>;
  /** The copied page element. */
  html: string;
}

export const isCopyElement = (node: CopyNode): node is CopyElement => node.nodeType === ELEMENT_NODE;

const isSvgDefinition = (element: CopyElement): boolean =>
  element.namespaceURI === SVG_NAMESPACE && SVG_DEFINITION_TAGS.has(element.localName);
const isHrefAttribute = (attribute: CopyAttribute): boolean => attribute.localName === 'href' || attribute.name === 'xlink:href';
const isPicture = (element: CopyElement): boolean =>
  element.namespaceURI === XHTML_NAMESPACE && (element.localName === 'canvas' || element.localName === 'img');
const isSelect = (element: CopyElement): boolean => element.namespaceURI === XHTML_NAMESPACE && element.localName === 'select';

export function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
}

export function escapeHtmlAttribute(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/ /g, '&nbsp;');
}

/** The tag is one the copy keeps. */
export function isAllowedCopyTag(namespace: string | null, localName: string): boolean {
  return SHOWN_ALLOWED_TAGS[namespace ?? '']?.has(localName) === true;
}

/** An attribute the copy keeps on `element`: plain HTML ones, `aria-*`, safe SVG values and safe links. */
export function isAllowedCopyAttribute(attribute: CopyAttribute, element: CopyElement): boolean {
  if (element.hasAttribute(STOP_ATTRIBUTE) && (attribute.name === 'role' || attribute.name === 'aria-description')) return false;
  if (isHrefAttribute(attribute))
    return (
      attribute.value.startsWith('#') ||
      (element.namespaceURI === XHTML_NAMESPACE && element.localName === 'a' && sanitizeShownLink(attribute.value) !== undefined)
    );
  if (ALLOWED_SVG_ATTRIBUTES.has(attribute.name)) return isSafeShownSvgValue(attribute.value);
  return ALLOWED_HTML_ATTRIBUTES.has(attribute.name) || ARIA_ATTRIBUTE_PATTERN.test(attribute.name);
}

/** The local ids an attribute value points at (`#id`, `url(#id)`). */
function references(attribute: CopyAttribute): string[] {
  if (isHrefAttribute(attribute)) return attribute.value.startsWith('#') ? [attribute.value.slice(1)] : [];
  const match = LOCAL_SVG_REFERENCE_PATTERN.exec(attribute.value.trim());
  return match?.[1] === undefined ? [] : [match[1]];
}

interface CopyContext {
  hooks: StaticCopyHooks;
  marked: Set<string>;
  ids: Set<string>;
  refs: Set<string>;
}

function copyAttributes(element: CopyElement, context: CopyContext, skip?: (attribute: CopyAttribute) => boolean): string {
  let text = '';
  for (const attribute of element.attributes) {
    if (skip?.(attribute) === true || !isAllowedCopyAttribute(attribute, element)) continue;
    if (attribute.name === 'id' && attribute.value !== '') context.ids.add(attribute.value);
    for (const id of references(attribute)) context.refs.add(id);
    text += ` ${attribute.name}="${escapeHtmlAttribute(attribute.value)}"`;
  }
  return text;
}

function isCopied(element: CopyElement, inDefinitions: boolean, hooks: StaticCopyHooks): boolean {
  return isAllowedCopyTag(element.namespaceURI, element.localName) && (inDefinitions || isSvgDefinition(element) || hooks.visible(element));
}

function copyElement(
  element: CopyElement,
  context: CopyContext,
  inDefinitions: boolean,
  skip?: (attribute: CopyAttribute) => boolean,
  tail?: () => string,
): string | null {
  const definitions = inDefinitions || isSvgDefinition(element);
  let attributes: string;
  let picture: string | null = null;
  try {
    attributes = copyAttributes(element, context, skip);
    if (isPicture(element)) picture = context.hooks.picture(element);
  } catch {
    return null;
  }
  if (!definitions) for (const id of getElementSourceIds(element)) context.marked.add(id);
  if (picture !== null) return `<img${attributes} src="${escapeHtmlAttribute(picture)}">`;
  if (isSelect(element)) return `<output${attributes}>${escapeHtmlText(context.hooks.shown(element))}</output>`;
  const tag = element.localName;
  if (element.namespaceURI === XHTML_NAMESPACE && VOID_TAGS.has(tag)) return `<${tag}${attributes}>`;
  let children = '';
  for (const child of element.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      if (!definitions) children += escapeHtmlText(child.nodeValue ?? '');
      continue;
    }
    if (!isCopyElement(child) || !isCopied(child, definitions, context.hooks)) continue;
    children += copyElement(child, context, definitions) ?? '';
  }
  return `<${tag}${attributes}>${children}${tail?.() ?? ''}</${tag}>`;
}

function* descendants(element: CopyElement): Generator<CopyElement> {
  for (const child of element.childNodes)
    if (isCopyElement(child)) {
      yield child;
      yield* descendants(child);
    }
}

/** The SVG definitions under `root` the copy points at but left out (inside hidden parts), as one `<svg>`. */
function copyReferencedDefinitions(root: CopyElement, context: CopyContext): string {
  const left = new Set<CopyElement>();
  for (const element of descendants(root)) {
    const id = element.getAttribute('id') ?? '';
    if (isSvgDefinition(element) && id !== '' && !context.ids.has(id)) left.add(element);
  }
  let copied = '';
  for (let added = left.size > 0; added; ) {
    added = false;
    for (const definition of left) {
      if (!context.refs.has(definition.getAttribute('id') ?? '')) continue;
      left.delete(definition);
      for (const inner of descendants(definition)) left.delete(inner);
      const copy = copyElement(definition, context, true);
      if (copy === null) continue;
      copied += copy;
      added = true;
    }
  }
  return copied === '' ? '' : `<svg>${copied}</svg>`;
}

/** The page element as static HTML, and the sources marked on what was copied. Throws when the page can't be copied. */
export function copyStaticPage(root: CopyElement, hooks: StaticCopyHooks): StaticCopy {
  if (!isCopied(root, false, hooks)) throw new Error(PAGE_NOT_COPYABLE_MESSAGE);
  const context: CopyContext = { hooks, marked: new Set(), ids: new Set(), refs: new Set() };
  const skipLanguage = (attribute: CopyAttribute): boolean => attribute.name === 'lang' && attribute.value === DEFAULT_COPY_LANGUAGE;
  const html = copyElement(root, context, false, skipLanguage, () => copyReferencedDefinitions(root, context));
  if (html === null) throw new Error(PAGE_NOT_COPYABLE_MESSAGE);
  return { marked: context.marked, html };
}

/** "Nov 17, 2026, 3:04 PM PST" in the viewer's locale. */
export function formatExportDateTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** The footer line under the copy. */
export function staticCopyNote(title: string, when: string): string {
  return `A copy of “${title}” as it was on ${when}. Its numbers do not update.`;
}

/** The whole document around a copied page element. */
export function staticHtmlDocument(page: string, title: string, at: number, formatDate: (at: number) => string = formatExportDateTime): string {
  return (
    '<!doctype html>\n' +
    '<html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(HTML_EXPORT_CONTENT_SECURITY_POLICY)}">` +
    `<title>${escapeHtmlText(title)}</title></head>` +
    `<body>${page}<footer>${escapeHtmlText(staticCopyNote(title, formatDate(at)))}</footer></body></html>`
  );
}

function isDisplayContents(element: Element): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style?.display === 'contents' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
}

function rasterize(element: Element): string {
  if (element instanceof HTMLCanvasElement) return element.toDataURL();
  if (!(element instanceof HTMLImageElement)) throw new Error('not a picture');
  const ratio = element.ownerDocument.defaultView?.devicePixelRatio ?? 1;
  const canvas = element.ownerDocument.createElement('canvas');
  canvas.width = Math.round(element.clientWidth * ratio);
  canvas.height = Math.round(element.clientHeight * ratio);
  canvas.getContext('2d')?.drawImage(element, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL();
}

/** How the copy reads a live page. */
export const DOM_COPY_HOOKS: StaticCopyHooks = {
  visible: (element) => element instanceof Element && (isVisibleForExport(element) || isDisplayContents(element)),
  picture: (element) => {
    if (!(element instanceof Element)) throw new Error('not a picture');
    return rasterize(element);
  },
  shown: (element) =>
    element instanceof HTMLSelectElement ? [...element.selectedOptions].map((option) => option.textContent).join(', ') : '',
};

/** Static copies need `checkVisibility` to tell what is drawn. */
export function canCopyStaticPage(): boolean {
  return typeof Element !== 'undefined' && typeof Element.prototype.checkVisibility === 'function';
}

export interface StaticHtmlCopyOptions {
  root: Element;
  title: string;
  at: number;
}

/** The live page as a static HTML document, and the sources marked on what it shows. */
export function buildStaticHtmlCopy({ root, title, at }: StaticHtmlCopyOptions): StaticCopy {
  const copy = copyStaticPage(root, DOM_COPY_HOOKS);
  return { marked: copy.marked, html: staticHtmlDocument(copy.html, title, at) };
}
