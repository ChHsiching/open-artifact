/**
 * What the viewer is looking at: the section, the focused item, search,
 * the composer. Not saved.
 */

import { create } from 'zustand';

/** Left-nav sections. Extra token families use `family:<key>`. */
export type SectionId = 'overview' | 'colors' | 'typography' | 'spacing' | 'radius' | 'shadow' | 'components' | 'assets' | 'files' | `family:${string}`;

/** Something the viewer pointed at, for "Send to agent" and the view context. */
export interface Focus {
  kind: 'token' | 'style' | 'component' | 'asset' | 'section' | 'file' | 'cover';
  name: string;
  /** The family of a token (`color`, `spacing`…). */
  family?: string;
}

export interface ViewState {
  section: SectionId;
  focus: Focus | null;
  search: string;
  /** An anchor to scroll to once the section renders. */
  anchor: string | null;
  composer: boolean;
  /** Text prefilled into the composer. */
  draft: string;
  /** The color theme the swatches show first. */
  theme: string | null;
  /** The file open in the Files section. */
  file: string | null;

  go(section: SectionId, anchor?: string | null): void;
  setFocus(focus: Focus | null): void;
  setSearch(search: string): void;
  clearAnchor(): void;
  openComposer(draft?: string): void;
  closeComposer(): void;
  setTheme(theme: string | null): void;
  openFile(path: string | null): void;
}

export const useView = create<ViewState>()((set) => ({
  section: 'overview',
  focus: null,
  search: '',
  anchor: null,
  composer: false,
  draft: '',
  theme: null,
  file: null,

  go(section, anchor = null) {
    set({ section, anchor: anchor ?? `ds-page-${section}`, search: '' });
  },
  setFocus(focus) {
    set({ focus });
  },
  setSearch(search) {
    set({ search });
  },
  clearAnchor() {
    set({ anchor: null });
  },
  openComposer(draft = '') {
    set({ composer: true, draft });
  },
  closeComposer() {
    set({ composer: false, draft: '' });
  },
  setTheme(theme) {
    set({ theme });
  },
  openFile(file) {
    set({ section: 'files', file, search: '', anchor: null, focus: file ? { kind: 'file', name: file } : null });
  },
}));

/** A stable DOM id for an anchor. */
export const anchorId = (kind: string, name: string): string => `ds-${kind}-${encodeURIComponent(name)}`;

/** The section and anchor that show an item. */
export function focusTarget(focus: Focus): { section: SectionId; anchor: string | null } {
  switch (focus.kind) {
    case 'token': {
      const family = focus.family ?? 'color';
      if (family === 'type') return { section: 'typography', anchor: null };
      const section: SectionId = family === 'color' ? 'colors' : family === 'spacing' || family === 'radius' || family === 'shadow' ? family : `family:${family}`;
      return { section, anchor: anchorId('token', focus.name) };
    }
    case 'style':
      return { section: 'typography', anchor: anchorId('style', focus.name) };
    case 'component':
      return { section: 'components', anchor: anchorId('component', focus.name) };
    case 'asset':
      return { section: 'assets', anchor: anchorId('asset', focus.name) };
    case 'section':
      return { section: focus.name.startsWith('assets/') ? 'assets' : 'overview', anchor: anchorId('section', focus.name) };
    case 'file':
      return { section: 'files', anchor: null };
    case 'cover':
      return { section: 'overview', anchor: null };
  }
}
