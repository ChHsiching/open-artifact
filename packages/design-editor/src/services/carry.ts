/**
 * What copied elements carry so they look the same elsewhere.
 *
 * An element's template source can depend on its artboard: class styles
 * from the helmet, loops and conditions over the artboard's data, values
 * (`{{name}}`), imported components. Pasted into another artboard (or
 * another app) that context is missing and those parts render empty or
 * unstyled. So a copy also carries:
 *
 * - the rendered markup of elements whose source depends on the artboard
 *   (read from the live page: loops expanded, conditions and values
 *   resolved, components inlined), keeping the source's own attributes
 *   where they stand on their own;
 * - the artboard's style rules that apply to the copied elements.
 */

import { escapeAttribute, escapeText, VOID_ELEMENTS, type HtmlElement, type TemplateModel } from '@open-artifact/dc';

const TID_ATTRIBUTE = 'data-dc-tpl';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** True when an element's source depends on its artboard's data or components. */
export function dependsOnArtboard(source: string): boolean {
  return /\{\{|<(sc-[a-z-]+|dc-import|x-import)\b/i.test(source);
}

/** Breaks `{{` so rendered text never reads as a template value. */
const unhole = (text: string) => text.replace(/\{\{/g, '{​{').replace(/\}\}/g, '}​}');

/** Attributes the runtime and editor add to rendered elements. */
const runtimeAttribute = (name: string) => name.startsWith('data-dc-') || name === TID_ATTRIBUTE;

/** An element's own source tag, when it can be reused as is (no values, not a template tag). */
function sourceOpenTag(model: TemplateModel, element: Element): string | null {
  const tid = element.getAttribute(TID_ATTRIBUTE);
  const source: HtmlElement | undefined = tid === null ? undefined : model.elements[Number(tid)];
  if (!source || source.tag !== element.localName) return null;
  const open = model.text.slice(source.start, source.openEnd);
  return open.includes('{{') ? null : open;
}

/**
 * The rendered markup of a live element, as template HTML. Inside the
 * artboard's own elements the source tags are kept; component boundaries
 * are unwrapped into what they render.
 */
export function renderedMarkup(model: TemplateModel, root: Element): string {
  const walk = (node: Node, own: boolean): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = (node.parentNode as Element | null)?.localName;
      const text = node.textContent ?? '';
      return parent === 'style' ? text : unhole(escapeText(text));
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    if (el.hasAttribute('data-dc-boundary')) return [...el.childNodes].map((child) => walk(child, false)).join('');
    const tag = el.localName;
    if (tag === 'script' || tag === 'template') return '';
    if (el.namespaceURI === SVG_NS && tag === 'svg') {
      const copy = el.cloneNode(true) as Element;
      for (const inner of [copy, ...copy.querySelectorAll('*')]) for (const attr of [...inner.attributes]) if (runtimeAttribute(attr.name)) inner.removeAttribute(attr.name);
      return unhole(copy.outerHTML);
    }
    const open =
      (own ? sourceOpenTag(model, el) : null) ??
      `<${tag}${[...el.attributes]
        .filter((attr) => !runtimeAttribute(attr.name) && !attr.name.startsWith('hint-'))
        .map((attr) => ` ${attr.name}="${unhole(escapeAttribute(attr.value))}"`)
        .join('')}>`;
    if (VOID_ELEMENTS.has(tag)) return open;
    return `${open}${[...el.childNodes].map((child) => walk(child, own)).join('')}</${tag}>`;
  };
  return walk(root, true);
}

/* ---------------------------------- css ---------------------------------- */

/** States and parts a selector may name that a still element does not match. */
const DYNAMIC = /::?(?:hover|focus-visible|focus-within|focus|active|visited|link|checked|disabled|enabled|placeholder-shown|before|after|placeholder|marker|selection|first-line|first-letter|backdrop|file-selector-button)\b/gi;

/** A selector that tests whether the rule styles an element in any state. */
function stateless(selector: string): string {
  return selector
    .split(',')
    .map((part) => {
      const bare = part.replace(DYNAMIC, '').trim();
      return !bare || /[>+~]$/.test(bare) ? `${bare} *`.trim() : bare;
    })
    .join(', ');
}

type Rule = CSSRule & { selectorText?: string; cssRules?: CSSRuleList; name?: string };

/**
 * The style rules of an artboard's template styles that apply to the
 * rendered elements, each as one CSS text (fonts and keyframes they use
 * included). Rules the runtime adds are left out.
 */
export function carriedCss(roots: readonly Element[]): string[] {
  const doc = roots[0]?.ownerDocument;
  if (!doc) return [];
  const elements = roots.flatMap((root) => [root, ...root.querySelectorAll('*')]);
  const applies = (selector: string) => {
    let test: string;
    try {
      test = stateless(selector);
      return elements.some((el) => el.matches(test));
    } catch {
      return false;
    }
  };
  const fonts: string[] = [];
  const keyframes: Rule[] = [];
  const pick = (rules: CSSRuleList): string[] => {
    const out: string[] = [];
    for (const rule of [...rules] as Rule[]) {
      if (rule.selectorText !== undefined) {
        if (applies(rule.selectorText)) out.push(rule.cssText);
      } else if (rule.type === CSSRule.FONT_FACE_RULE) fonts.push(rule.cssText);
      else if (rule.type === CSSRule.KEYFRAMES_RULE) keyframes.push(rule);
      else if (rule.cssRules) {
        // @media, @supports, @container, @layer blocks: kept with what applies inside.
        const inner = pick(rule.cssRules);
        const head = rule.cssText.slice(0, rule.cssText.indexOf('{')).trim();
        if (inner.length && head) out.push(`${head} {\n${inner.map((text) => `  ${text}`).join('\n')}\n}`);
      }
    }
    return out;
  };
  const kept: string[] = [];
  for (const style of doc.querySelectorAll<HTMLStyleElement>(`style[${TID_ATTRIBUTE}]`)) {
    try {
      if (style.sheet) kept.push(...pick(style.sheet.cssRules));
    } catch {
      // An unreadable sheet: nothing to carry from it.
    }
  }
  if (!kept.length) return [];
  const text = kept.join('\n');
  const usedFonts = fonts.filter((font) => {
    const family = /font-family:\s*["']?([^;"']+)/i.exec(font)?.[1]?.trim();
    return family && text.includes(family);
  });
  const usedKeyframes = keyframes.filter((rule) => rule.name && new RegExp(`\\b${rule.name.replace(/[^\w-]/g, '')}\\b`).test(text)).map((rule) => rule.cssText);
  return [...usedFonts, ...kept, ...usedKeyframes];
}

/**
 * The carried rules a target artboard still needs, as helmet markup: rules
 * it already has are dropped, and so are rules for selectors it styles its
 * own way (its own design wins over the copied one).
 */
export function helmetFor(css: readonly string[] | undefined, target: Document | null | undefined): string | undefined {
  if (!css?.length) return undefined;
  const have = new Set<string>();
  const selectors = new Set<string>();
  if (target) {
    const collect = (rules: CSSRuleList) => {
      for (const rule of [...rules] as Rule[]) {
        have.add(rule.cssText);
        if (rule.selectorText !== undefined) selectors.add(rule.selectorText);
        else if (rule.cssRules) collect(rule.cssRules);
      }
    };
    for (const style of target.querySelectorAll<HTMLStyleElement>(`style[${TID_ATTRIBUTE}]`)) {
      try {
        if (style.sheet) collect(style.sheet.cssRules);
      } catch {
        // Unreadable: treated as empty.
      }
    }
  }
  const needed = css.filter((text) => {
    if (have.has(text)) return false;
    const selector = /^([^@{][^{]*)\{/.exec(text)?.[1]?.trim();
    return !(selector && selectors.has(selector));
  });
  return needed.length ? `<style>\n${needed.join('\n')}\n</style>` : undefined;
}
