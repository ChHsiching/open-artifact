/**
 * Whole-project checks of a Design System artifact. Paths are relative to
 * `project/`. Binary files are passed with an empty string as content; only
 * their paths matter here.
 */

import { normalizeTokens } from './tokens.ts';
import {
  COMPONENT_NAME,
  MAX_SECTIONS,
  fileRole,
  hasMarker,
  listSections,
  normalizeSystemIndex,
  parseBundleHeader,
  parseCardMarker,
  pathProblem,
} from './system.ts';

/** A finding tied to a file. */
export interface SystemDiagnostic {
  file: string;
  level: 'error' | 'warning' | 'info';
  message: string;
}

/** Size caps of text files, bytes. */
const CAPS: Record<string, number> = {
  readme: 200 * 1024,
  tokens: 512 * 1024,
  bundle: 6 * 1024 * 1024,
  'bundle-css': 2 * 1024 * 1024,
  library: 2 * 1024 * 1024,
  'component-preview': 256 * 1024,
  'component-readme': 64 * 1024,
  'component-source': 512 * 1024,
};

/** Embeds a preview may not use. */
const PREVIEW_EMBEDS = /<(iframe|frame|object|embed|portal|noscript)\b/i;

/** Checks a design system's files. */
export function checkDesignSystem(files: ReadonlyMap<string, string>): SystemDiagnostic[] {
  const out: SystemDiagnostic[] = [];
  const add = (file: string, level: SystemDiagnostic['level'], message: string): void => {
    out.push({ file, level, message });
  };

  // The index.
  const indexText = files.get('design-system.json');
  let namespace = '';
  if (indexText === undefined) {
    add('design-system.json', 'error', 'project/design-system.json is missing: the page treats the system as empty.');
  } else {
    try {
      const raw = JSON.parse(indexText) as unknown;
      if (!hasMarker(raw)) add('design-system.json', 'error', 'The index has no createdOnFiles or convertedFrom marker; the page opens read-only.');
      const index = normalizeSystemIndex(raw);
      namespace = index.namespace;
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(index.namespace)) add('design-system.json', 'error', `namespace "${index.namespace}" must be a JS identifier.`);
      if ((raw as Record<string, unknown>).layout !== 'files') add('design-system.json', 'error', '"layout" must be "files".');
      for (const [key, group] of Object.entries(index.assetGroups)) {
        for (const [fileKey, record] of Object.entries(group.files)) {
          if (!record || typeof record.blob !== 'string' || typeof record.name !== 'string') {
            add('design-system.json', 'error', `assetGroups.${key}.files.${fileKey} needs name, blob, size and type.`);
          }
        }
      }
      if (index.lastChange && (typeof index.lastChange.by !== 'string' || typeof index.lastChange.at !== 'string')) {
        add('design-system.json', 'warning', 'lastChange needs "by" and "at".');
      }
    } catch (error) {
      add('design-system.json', 'error', `design-system.json is not valid JSON: ${String(error)}`);
    }
  }

  // Tokens.
  const tokensText = files.get('tokens.json');
  if (tokensText === undefined) {
    add('tokens.json', 'warning', 'No tokens.json: Colors, Typography and Spacing show empty.');
  } else {
    try {
      const { notes } = normalizeTokens(JSON.parse(tokensText));
      for (const note of notes) add('tokens.json', note.level, note.message);
    } catch (error) {
      add('tokens.json', 'error', `tokens.json is not valid JSON: ${String(error)}`);
    }
  }

  // Bundle.
  const bundle = files.get('components/bundle.js');
  if (bundle !== undefined) {
    if (/<\/script/i.test(bundle) || /<!--/.test(bundle)) add('components/bundle.js', 'warning', 'bundle.js contains "</script" or "<!--"; consumers that inline it will break.');
    if (/^\s*(import|export)\s/m.test(bundle)) add('components/bundle.js', 'error', 'bundle.js must be one classic script: no import or export.');
    const header = parseBundleHeader(bundle);
    if (header?.namespace && namespace && header.namespace !== namespace) {
      add('components/bundle.js', 'warning', `Bundle header namespace "${header.namespace}" differs from the index namespace "${namespace}".`);
    }
  }

  // Every file.
  for (const [path, content] of files) {
    const problem = pathProblem(path);
    if (problem) add(path, 'error', `Path ${problem}.`);
    const role = fileRole(path);
    const cap = CAPS[role];
    if (cap !== undefined && new TextEncoder().encode(content).length > cap) add(path, 'error', `Larger than ${Math.round(cap / 1024)} KB.`);
    if (role === 'component-preview') {
      if (!parseCardMarker(content)) add(path, 'warning', 'Line 1 should be the <!-- @dsCard group="…" height=N --> marker.');
      if (PREVIEW_EMBEDS.test(content)) add(path, 'error', 'Previews may not use iframe, frame, object, embed, portal or noscript.');
      for (const match of content.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) {
        const url = match[1]!;
        if (/fonts\.(googleapis|gstatic)\.com/.test(url)) continue;
        if (!/@\d+\.\d+\.\d+|\/\d+\.\d+\.\d+\//.test(url)) add(path, 'warning', `Pin ${url.slice(0, 80)} to an exact version.`);
      }
    }
    if (path.startsWith('components/') && role === 'other') {
      const folder = path.split('/')[1]!;
      if (!COMPONENT_NAME.test(folder) && folder !== 'lib' && folder !== 'src') add(path, 'warning', `components/${folder} is not a JS identifier; it is not a component.`);
    }
    if (role === 'font' && !/\.(woff2?|ttf|otf|ttc)$/i.test(path)) add(path, 'warning', 'fonts/ holds font binaries only.');
  }

  const { overflow } = listSections(files);
  if (overflow.length) add(overflow[0]!, 'info', `More than ${MAX_SECTIONS} sections; ${overflow.length} stay files.`);
  if (!files.has('components/Cover/preview.html')) add('components/Cover/preview.html', 'info', 'No cover: Overview opens with the brand book.');
  return out;
}
