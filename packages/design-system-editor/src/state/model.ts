/**
 * The design system as the page shows it, derived from the working copy:
 * the index, raw and normalized tokens, components, sections and assets.
 * Computed once per change of the files store.
 */

import {
  indexedUploads,
  type AssetRecord,
  listAssets,
  listComponents,
  listSections,
  normalizeSystemIndex,
  normalizeTokens,
  parseTokensFile,
  type AssetItem,
  type ComponentInfo,
  type DocSection,
  type NormalizedTokens,
  type RawTokens,
  type SystemIndex,
  type TileSize,
  type TokenNote,
} from '@open-artifact/design-system-core';
import { fileMap, useFiles, type FilesState } from './files.ts';

/** Everything the views read. */
export interface SystemModel {
  files: Map<string, string>;
  uploads: Map<string, AssetRecord>;
  index: SystemIndex;
  /** The index could not be parsed. */
  indexError: string | null;
  raw: RawTokens;
  /** `tokens.json` could not be parsed: token sections are read-only. */
  tokensError: string | null;
  tokens: NormalizedTokens;
  tokenNotes: TokenNote[];
  /** Components, without the cover. */
  components: ComponentInfo[];
  hasCover: boolean;
  readme: DocSection | null;
  sections: DocSection[];
  assets: { name: string; tile: TileSize; items: AssetItem[] }[];
  /** True when nothing has been made yet: the welcome page shows. */
  empty: boolean;
}

/** The cover's component folder. */
export const COVER = 'Cover';

let cache: { texts: FilesState['texts']; listing: FilesState['listing']; model: SystemModel } | null = null;

/** Derives the model (memoized on the store's texts and listing). */
export function deriveModel(state: Pick<FilesState, 'texts' | 'listing' | 'title'>): SystemModel {
  if (cache && cache.texts === state.texts && cache.listing === state.listing) return cache.model;
  const files = fileMap(state);

  let index: SystemIndex;
  let indexError: string | null = null;
  try {
    index = normalizeSystemIndex(JSON.parse(files.get('design-system.json') ?? '{}'));
  } catch (error) {
    index = normalizeSystemIndex({});
    indexError = `design-system.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (!index.title) index = { ...index, title: state.title };

  const { raw, error: tokensError } = parseTokensFile(files.get('tokens.json'));
  const { tokens, notes } = normalizeTokens(raw);
  const all = listComponents(files);
  const { readme, sections } = listSections(files);
  const assets = listAssets(index, files.keys());
  const components = all.filter((component) => component.name !== COVER);
  const uploads = indexedUploads(index);
  for (const path of files.keys()) uploads.delete(path);
  const model: SystemModel = {
    uploads,
    files,
    index,
    indexError,
    raw,
    tokensError,
    tokens,
    tokenNotes: notes,
    components,
    hasCover: all.length !== components.length,
    readme,
    sections,
    assets,
    empty:
      !tokens.colors.length &&
      !tokens.groups.length &&
      !tokens.spacing.length &&
      !tokens.radius.length &&
      !tokens.shadows.length &&
      !tokens.extras.some((family) => family.tokens.length) &&
      !tokens.fonts.length &&
      !sections.length &&
      ![...files.keys()].some((path) => path.startsWith('fonts/')) &&
      !all.length &&
      !assets.some((group) => group.items.length) &&
      !(readme && (files.get(readme.path) ?? '').trim()),
  };
  cache = { texts: state.texts, listing: state.listing, model };
  return model;
}

/** The model, re-rendering when files change. */
export function useModel(): SystemModel {
  const texts = useFiles((s) => s.texts);
  const listing = useFiles((s) => s.listing);
  const title = useFiles((s) => s.title);
  return deriveModel({ texts, listing, title });
}
