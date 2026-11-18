/**
 * Links inside a doc (the page's `hrefFragment`). The page's link box writes `#<block id>~<slug>` for a heading
 * (`#<block id>` when the heading's words make no ASCII slug) and `#<tab id>` for a tab; it follows those, a bare
 * `#<block id>`, and `#<slug>` by its own rule or GitHub's, in the link's tab first. The exports find here what such a
 * link points at, by the same rules, and name the headings of a markdown file as GitHub does; an import finds there
 * which heading of the file a link names, to point it at that heading's new id.
 */
import { type Block, isAtom, walk } from './model.ts';

/** A block id as the page knows one, and what may follow it (`~<slug>`, a hint for when the block is gone). */
const BLOCK_ID = /^([A-Za-z0-9]{1,16}\.\d{1,8})(?:~(.*))?$/;
const OLD_BLOCK_ID = /^(bk_[0-9a-f]{6})(?:[-~](.*))?$/;
/** The slug the page puts after a heading's id. */
const SLUG_HINT = /^[A-Za-z0-9._-]{1,80}$/;
/** A place in another tab, as the page follows one: `<tab id>.<heading>`, the heading as a link in that tab names it. */
const TAB_PLACE = /^([0-9a-f]{8}-[0-9a-f]{4})\.(.+)$/;

const headingLevel = (block: Block) => {
  const level = Number(block.attrs?.heading);
  return block.type === 'paragraph' && Number.isInteger(level) && level >= 1 ? Math.min(level, 6) : 0;
};

/** A heading's words as the page slugs them: its characters only (no chips), at most 120 and 240 bytes. */
function pageWords(block: Block): string {
  let words = (block.inline ?? []).map(item => (isAtom(item) ? '' : item.ch)).join('').trim().slice(0, 120);
  while (words.length * 3 > 240 && Buffer.byteLength(words) > 240) words = words.slice(0, -1);
  return words.trim();
}

/** The page's slug of a heading: lower case, letters, digits, spaces and hyphens, spaces as one hyphen. */
export const pageSlug = (words: string) =>
  words
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-');

/** GitHub's: lower case, without punctuation but `-` and `_`, each space a hyphen. */
export const githubSlug = (words: string) => words.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '').replace(/ /g, '-');

/** Names in a list made unique as the page and GitHub both do: the second `a` is `a-1`. */
export function uniqueSlugs(): (slug: string) => string {
  const taken = new Set<string>();
  return slug => {
    if (!slug) return '';
    let name = slug;
    for (let count = 1; taken.has(name); count++) name = `${slug}-${count}`;
    taken.add(name);
    return name;
  };
}

/** The link the page writes to a block: `#<id>~<slug>` for a heading whose slug is plain ASCII, else `#<id>`. */
export function blockHref(block: Block, slug?: string): string {
  const hint = slug ?? (headingLevel(block) ? pageSlug(pageWords(block)) : '');
  return SLUG_HINT.test(hint) ? `#${block.id}~${hint}` : `#${block.id}`;
}

/**
 * The link to a block of another tab, which the page follows by the tab's id (`#<tab id>.<block id>~<slug>`): a block id
 * alone it looks for in the link's own tab only.
 */
export const tabBlockHref = (tabId: string, block: Block) => `#${tabId}.${blockHref(block).slice(1)}`;

export interface AnchorTab {
  /** Its file id, which a link to the tab names. */
  id?: string | undefined;
  blocks: Block[];
}

/** What a link points at: a tab, and a block in it unless it is the tab's start. */
export interface LinkTarget {
  tab: number;
  block?: Block;
}

export interface AnchorOptions {
  /**
   * The tabs are one markdown file's: its headings go by the names GitHub gives them, unique across the whole file
   * (the export's, `exportMarkdown`), and those come before the page's own slugs.
   */
  file?: boolean;
}

/** The blocks and headings of some tabs, to find what an in-doc link points at. */
export class DocAnchors {
  private tabs: AnchorTab[];
  private blocks = new Map<string, LinkTarget>();
  /** Per tab: each heading by its page slug and its GitHub slug, the first heading of a name winning. */
  private slugs: Map<string, Block>[];
  /** A markdown file's headings by the names GitHub gives them across the file. */
  private named = new Map<string, LinkTarget>();

  constructor(tabs: AnchorTab[], options: AnchorOptions = {}) {
    this.tabs = tabs;
    const fileWide = options.file ? uniqueSlugs() : null;
    this.slugs = tabs.map((tab, index) => {
      const slugs = new Map<string, Block>();
      const page = uniqueSlugs();
      const github = uniqueSlugs();
      for (const { block, parent } of walk(tab.blocks)) {
        this.blocks.set(block.id, { tab: index, block });
        if (!headingLevel(block)) continue;
        const words = pageWords(block);
        if (fileWide) {
          // As the export names them: by all their words, and not in a table, whose cells hold no headings in markdown.
          const all = (block.inline ?? []).map(item => (isAtom(item) ? '' : item.ch)).join('').trim();
          const name = parent?.type === 'cell' ? '' : fileWide(githubSlug(all));
          if (name && !this.named.has(name)) this.named.set(name, { tab: index, block });
          const slug = page(pageSlug(words));
          if (slug && !slugs.has(slug)) slugs.set(slug, block);
          continue;
        }
        for (const slug of [page(pageSlug(words)), github(githubSlug(words))]) if (slug && !slugs.has(slug)) slugs.set(slug, block);
      }
      return slugs;
    });
  }

  /** What `href` points at, looking in tab `from` first; null for any other link, or one to nothing here. */
  resolve(href: string | undefined, from = 0): LinkTarget | null {
    if (!href?.startsWith('#') || href.length < 2 || href.length > 513) return null;
    let fragment = href.slice(1);
    try {
      fragment = decodeURIComponent(fragment);
    } catch {
      // As it is.
    }
    const place = TAB_PLACE.exec(fragment);
    const placeTab = place ? this.tabs.findIndex(entry => entry.id !== undefined && entry.id === place[1]) : -1;
    // A heading of another tab; the tab's start when that tab doesn't have it.
    if (placeTab >= 0) return this.find(place![2]!, [placeTab], true) ?? { tab: placeTab };
    return this.find(fragment, [from, ...this.tabs.map((_, index) => index).filter(index => index !== from)], false);
  }

  /** What a fragment names in the tabs of `order`, the first that has it. */
  private find(fragment: string, order: number[], only: boolean): LinkTarget | null {
    const id = BLOCK_ID.exec(fragment) ?? OLD_BLOCK_ID.exec(fragment);
    if (id) {
      const hit = this.blocks.get(id[1]!);
      if (hit && (!only || order.includes(hit.tab))) return hit;
      // A heading that is gone: its slug may still name one.
      if (!id[2]) return null;
      fragment = id[2];
    }
    // A tab, as the link box writes it, or as a tab chip names it in markdown (`file/<id>`).
    const tabId = fragment.replace(/^file\//, '');
    const tab = only ? -1 : this.tabs.findIndex(entry => entry.id !== undefined && entry.id === tabId);
    if (tab >= 0) return { tab };
    const slug = fragment.toLowerCase();
    const named = this.named.get(slug);
    if (named && (!only || order.includes(named.tab))) return named;
    for (const index of order) {
      const block = this.slugs[index]?.get(slug);
      if (block) return { tab: index, block };
    }
    return null;
  }
}
