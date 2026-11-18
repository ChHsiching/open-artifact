import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HTML_EXPORT_CONTENT_SECURITY_POLICY,
  PAGE_NOT_COPYABLE_MESSAGE,
  SVG_NAMESPACE,
  XHTML_NAMESPACE,
  copyStaticPage,
  escapeHtmlAttribute,
  escapeHtmlText,
  isAllowedCopyAttribute,
  staticHtmlDocument,
  type CopyAttribute,
  type CopyElement,
  type CopyNode,
  type StaticCopyHooks,
} from '../src/export/static-html.ts';

interface FakeElement extends CopyElement {
  hidden?: boolean;
  picture?: string | Error;
  shownText?: string;
}

function el(
  localName: string,
  attributes: Record<string, string> = {},
  children: (CopyNode | string)[] = [],
  options: { ns?: string; hidden?: boolean; picture?: string | Error; shownText?: string } = {},
): FakeElement {
  const list: CopyAttribute[] = Object.entries(attributes).map(([name, value]) => ({ name, localName: name.replace(/^.*:/, ''), value }));
  return {
    nodeType: 1,
    nodeValue: null,
    localName,
    namespaceURI: options.ns ?? XHTML_NAMESPACE,
    attributes: list,
    childNodes: children.map((child) => (typeof child === 'string' ? { nodeType: 3, nodeValue: child } : child)),
    getAttribute: (name) => attributes[name] ?? null,
    hasAttribute: (name) => Object.hasOwn(attributes, name),
    ...(options.hidden ? { hidden: true } : {}),
    ...(options.picture !== undefined ? { picture: options.picture } : {}),
    ...(options.shownText !== undefined ? { shownText: options.shownText } : {}),
  };
}

const svg = (localName: string, attributes: Record<string, string> = {}, children: (CopyNode | string)[] = [], hidden = false): FakeElement =>
  el(localName, attributes, children, { ns: SVG_NAMESPACE, hidden });

const hooks: StaticCopyHooks = {
  visible: (element) => (element as FakeElement).hidden !== true,
  picture: (element) => {
    const picture = (element as FakeElement).picture;
    if (picture === undefined || picture instanceof Error) throw picture ?? new Error('none');
    return picture;
  },
  shown: (element) => (element as FakeElement).shownText ?? '',
};

describe('static HTML copy', () => {
  it('escapes text and attribute values', () => {
    assert.equal(escapeHtmlText('a < b & c > d e'), 'a &lt; b &amp; c &gt; d&nbsp;e');
    assert.equal(escapeHtmlAttribute('say "hi" & <go>'), 'say &quot;hi&quot; &amp; <go>');
  });

  it('keeps allowed tags and attributes and drops the rest', () => {
    const root = el('div', { id: 'dash-root', lang: 'en', class: 'x', style: 'color:red', onclick: 'alert(1)', 'aria-label': 'Page' }, [
      el('p', { title: 'T', 'data-x': '1' }, ['Hello ', el('b', {}, ['world'])]),
      el('script', {}, ['alert(1)']),
      el('iframe', { src: 'https://example.com' }),
      el('a', { href: 'https://example.com/a' }, ['ok']),
      el('a', { href: 'javascript:alert(1)' }, ['bad']),
    ]);
    const { html } = copyStaticPage(root, hooks);
    assert.equal(
      html,
      '<div id="dash-root" aria-label="Page"><p title="T">Hello <b>world</b></p><a href="https://example.com/a">ok</a><a>bad</a></div>',
    );
  });

  it('keeps a page language other than the default', () => {
    assert.equal(copyStaticPage(el('div', { lang: 'fr' }, ['Bonjour']), hooks).html, '<div lang="fr">Bonjour</div>');
  });

  it('leaves out hidden elements and collects the sources marked on what is copied', () => {
    const root = el('div', {}, [
      el('span', { 'data-source': 'sales orders' }, ['1']),
      el('span', { 'data-source': 'secret' }, ['2'], { hidden: true }),
    ]);
    const copy = copyStaticPage(root, hooks);
    assert.equal(copy.html, '<div><span>1</span></div>');
    assert.deepEqual([...copy.marked].sort(), ['orders', 'sales']);
  });

  it('turns pictures into data images, a select into its shown text, and drops pictures it cannot read', () => {
    const root = el('div', {}, [
      el('canvas', { width: '10', height: '5' }, [], { picture: 'data:image/png;base64,AAA' }),
      el('img', { alt: 'Logo' }, [], { picture: new Error('tainted') }),
      el('select', { 'aria-label': 'Region' }, [el('option', {}, ['West'])], { shownText: 'West' }),
      el('br'),
    ]);
    assert.equal(
      copyStaticPage(root, hooks).html,
      '<div><img width="10" height="5" src="data:image/png;base64,AAA"><output aria-label="Region">West</output><br></div>',
    );
  });

  it('keeps safe SVG values and local references only', () => {
    const element = svg('path');
    assert.equal(isAllowedCopyAttribute({ name: 'd', localName: 'd', value: 'M0 0L1 1' }, element), true);
    assert.equal(isAllowedCopyAttribute({ name: 'fill', localName: 'fill', value: 'url(#g)' }, element), true);
    assert.equal(isAllowedCopyAttribute({ name: 'fill', localName: 'fill', value: 'url(https://x.test/a.svg)' }, element), false);
    assert.equal(isAllowedCopyAttribute({ name: 'href', localName: 'href', value: '#mark' }, svg('use')), true);
    assert.equal(isAllowedCopyAttribute({ name: 'href', localName: 'href', value: 'https://x.test/a.svg' }, svg('use')), false);
  });

  it('adds the SVG definitions the copy uses from hidden parts, without their text', () => {
    const gradient = svg('linearGradient', { id: 'g' }, [svg('stop', { offset: '0', 'stop-color': '#fff' }), 'ignored']);
    const unused = svg('clipPath', { id: 'unused' }, [svg('rect', { width: '1' })]);
    const root = el('div', {}, [
      svg('svg', {}, [svg('defs', {}, [gradient, unused])], true),
      svg('svg', { viewBox: '0 0 10 10' }, [svg('rect', { width: '10', fill: 'url(#g)' })]),
    ]);
    assert.equal(
      copyStaticPage(root, hooks).html,
      '<div><svg viewBox="0 0 10 10"><rect width="10" fill="url(#g)"></rect></svg><svg><linearGradient id="g"><stop offset="0" stop-color="#fff"></stop></linearGradient></svg></div>',
    );
  });

  it('refuses a page it cannot copy', () => {
    assert.throws(() => copyStaticPage(el('div', {}, [], { hidden: true }), hooks), new RegExp(PAGE_NOT_COPYABLE_MESSAGE));
  });

  it('wraps the copy in a document with a strict policy and a dated footer', () => {
    const document = staticHtmlDocument('<div>x</div>', 'Sales <Q3>', 0, () => 'Jan 1, 1970');
    assert.ok(document.startsWith('<!doctype html>\n<html><head><meta charset="utf-8">'));
    assert.ok(document.includes(`content="${escapeHtmlAttribute(HTML_EXPORT_CONTENT_SECURITY_POLICY)}"`));
    assert.ok(document.includes('<title>Sales &lt;Q3&gt;</title>'));
    assert.ok(document.endsWith('<footer>A copy of “Sales &lt;Q3&gt;” as it was on Jan 1, 1970. Its numbers do not update.</footer></body></html>'));
  });
});
