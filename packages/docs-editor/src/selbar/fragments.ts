/**
 * Links inside the doc. A heading is linked as `#<block id>~<slug>` (`#<block id>` when its words make no plain
 * slug), a tab as `#<tab id>`, a heading of another tab as `#<tab id>.<block id>~<slug>`; a bare `#<slug>` names a
 * heading of the open tab by its words.
 */
import { pageSlug } from '@open-artifact/docs-core';
import type { Node as PMNode } from 'prosemirror-model';

const BLOCK_ID = /^([A-Za-z0-9]{1,16}\.\d{1,8})(?:~(.*))?$/;
const TAB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}$/;
const TAB_PLACE = /^([0-9a-f]{8}-[0-9a-f]{4})\.(.+)$/;
const SLUG_HINT = /^[A-Za-z0-9._-]{1,80}$/;

export interface DocHeading {
  bid: string;
  level: number;
  text: string;
  slug: string;
  /** Where the heading starts in the tab. */
  pos: number;
}

export interface DocTab {
  id: string;
  name: string;
}

/** A heading's words as they are slugged: its characters only (no chips), at most 120. */
export function headingWords(node: PMNode): string {
  return node.textBetween(0, node.content.size, '', '').trim().slice(0, 120).trim();
}

export function headingHref(bid: string, words: string): string {
  const slug = pageSlug(words);
  return SLUG_HINT.test(slug) ? `#${bid}~${slug}` : `#${bid}`;
}

export const tabHref = (id: string) => `#${id}`;

/** The headings of a tab, in order. */
export function docHeadings(doc: PMNode): DocHeading[] {
  const out: DocHeading[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.attrs.heading && typeof node.attrs.bid === 'string') {
      const text = headingWords(node);
      if (text) out.push({ bid: node.attrs.bid, level: Math.min(Number(node.attrs.heading), 6), text, slug: pageSlug(text), pos });
      return false;
    }
    return node.isBlock && !node.isTextblock;
  });
  return out.slice(0, 200);
}

/** What a typed `#…` or `/…` matches: headings by slug start or words, tabs by name. */
export function matchTargets(query: string, headings: readonly DocHeading[], tabs: readonly DocTab[]): { headings: DocHeading[]; tabs: DocTab[] } {
  const words = query.trim().slice(1).toLowerCase();
  if (!words) return { headings: [...headings], tabs: [...tabs] };
  return {
    headings: headings.filter(heading => heading.slug.startsWith(words) || heading.text.toLowerCase().includes(words)),
    tabs: tabs.filter(tab => tab.name.toLowerCase().includes(words)),
  };
}

/** What an in-doc link names: a tab, a block (with the slug it was linked by), or a heading's slug. */
export interface DocPlace {
  tab?: string;
  block?: string;
  slug?: string;
}

export function parseDocHref(href: string): DocPlace | null {
  if (!href.startsWith('#') || href.length < 2 || href.length > 513) return null;
  let fragment = href.slice(1);
  try {
    fragment = decodeURIComponent(fragment);
  } catch {
    // As it is.
  }
  const place = TAB_PLACE.exec(fragment);
  if (place) return { tab: place[1]!, ...inTab(place[2]!) };
  const tab = fragment.replace(/^file\//, '');
  if (TAB_ID.test(tab)) return { tab };
  return inTab(fragment);
}

function inTab(fragment: string): DocPlace {
  const id = BLOCK_ID.exec(fragment);
  if (id) return id[2] ? { block: id[1]!, slug: id[2].toLowerCase() } : { block: id[1]! };
  return { slug: fragment.toLowerCase() };
}

/** Where in a tab's doc a place is: the block by its id, else the first heading its slug names. */
export function findPlace(doc: PMNode, place: DocPlace): number | null {
  let found: number | null = null;
  if (place.block) {
    doc.descendants((node, pos) => {
      if (found !== null) return false;
      if (node.attrs.bid === place.block) found = pos;
      return true;
    });
    if (found !== null) return found;
  }
  if (!place.slug) return null;
  const heading = docHeadings(doc).find(item => item.slug === place.slug);
  return heading ? heading.pos : null;
}
