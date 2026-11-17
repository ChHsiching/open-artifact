/**
 * Files the page generates on save, for agents that use the system:
 *
 * - `api/README.md` and cards under `api/`: tokens, each component, assets.
 *   Short, factual and in one place, so an agent designing with the system
 *   reads a few small files instead of the whole project.
 * - A "How to use this system" block at the end of `README.md`, between
 *   markers, rewritten when what it lists changes and hidden in the page.
 *
 * Agents never write these; a write by an agent is replaced on the next save.
 */

import { componentProps } from './props.ts';
import { parseTokensFile } from './edit.ts';
import { buildManifest, listAssets, listComponents, listSections, normalizeSystemIndex, parseBundleHeader, type SystemIndex, type SystemManifest } from './system.ts';
import { compileTokensCss, normalizeTokens, type NormalizedTokens } from './tokens.ts';

/** Markers around the generated block of `README.md`. */
export const USAGE_START = '<!-- open-artifact:usage (generated, do not edit) -->';
export const USAGE_END = '<!-- /open-artifact:usage -->';

/** The README without its generated block. */
export function stripUsageBlock(readme: string): string {
  const start = readme.indexOf(USAGE_START);
  if (start < 0) return readme;
  const end = readme.indexOf(USAGE_END, start);
  const tail = end < 0 ? '' : readme.slice(end + USAGE_END.length);
  return `${readme.slice(0, start).trimEnd()}${tail.trim() ? `\n\n${tail.trim()}` : ''}\n`;
}

/** The README with `block` as its generated block (replacing any previous one). */
export function withUsageBlock(readme: string, block: string): string {
  const body = stripUsageBlock(readme).trimEnd();
  return `${body ? `${body}\n\n` : ''}${USAGE_START}\n${block.trim()}\n${USAGE_END}\n`;
}

/** What the generators read. */
export interface GenerateInput {
  index: SystemIndex;
  tokens: NormalizedTokens;
  /** Text files by project path (binary files may be present with any content). */
  files: ReadonlyMap<string, string>;
}

/** The global the bundle assigns, if there is a bundle. */
function bundleNamespace({ index, files }: GenerateInput): string | null {
  const bundle = files.get('components/bundle.js');
  if (bundle === undefined) return null;
  return parseBundleHeader(bundle)?.namespace || index.namespace;
}

/** The "How to use this system" block. */
export function usageBlock(input: GenerateInput): string {
  const { tokens } = input;
  const lines = ['## How to use this system', ''];
  lines.push('Load the compiled tokens; every token is a CSS custom property and every text style a class:', '');
  lines.push('```html', '<link rel="stylesheet" href="tokens.css">', '```', '');
  if (tokens.themes.length > 1) {
    lines.push(
      `Themes: ${tokens.themes.map((theme) => `\`${theme.id}\``).join(', ')}. The first applies by default; set \`data-theme="<id>"\` on any element to switch its subtree.`,
      '',
    );
  }
  const examples = [tokens.colors[0], tokens.spacing[0], tokens.radius[0]].filter(Boolean).map((token) => `\`var(--${token!.name})\``);
  if (examples.length) lines.push(`For example ${examples.join(', ')}.`, '');
  const style = tokens.groups[0]?.styles[0];
  if (style) lines.push(`Text styles are classes: \`<h1 class="${style.name}">\`.`, '');
  const namespace = bundleNamespace(input);
  // The cover is a picture of the system, not a component to use.
  const components = listComponents(input.files).filter((component) => !component.page && component.name !== 'Cover');
  const react = input.index.libraries.some((library) => /^react(-dom)?$/i.test(library.name));
  if (namespace && components.length) {
    lines.push(
      `Components are ${react ? 'React components' : 'exports'} on \`window.${namespace}\` after loading \`components/bundle.js\`${input.files.has('components/bundle.css') ? ' and `components/bundle.css`' : ''}:`,
      '',
      '```js',
      `const { ${components.slice(0, 3).map((component) => component.name).join(', ')} } = window.${namespace};`,
      '```',
      '',
    );
  }
  lines.push('Reference cards for agents are in `api/`: start with `api/README.md`.');
  return lines.join('\n');
}

/** Escapes a table cell. */
const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n+/g, ' ');

/** The token card. */
function tokensCard({ tokens }: GenerateInput): string {
  const lines = ['# Tokens', '', 'Every token is a CSS custom property defined by `tokens.css`.', ''];
  if (tokens.colors.length) {
    lines.push('## Colors', '');
    if (tokens.themes.length > 1) lines.push(`Themes: ${tokens.themes.map((t) => `\`${t.id}\` (${t.name})`).join(', ')}.`, '');
    lines.push(`| Token | ${tokens.themes.map((t) => t.name).join(' | ')} | Usage |`, `|---|${tokens.themes.map(() => '---|').join('')}---|`);
    for (const color of tokens.colors) {
      lines.push(`| \`--${color.name}\` | ${tokens.themes.map((t) => `\`${cell(color.declared[t.id] ?? color.declared[tokens.themes[0]!.id] ?? '')}\``).join(' | ')} | ${cell(color.usage ?? '')} |`);
    }
    lines.push('');
  }
  if (tokens.groups.length) {
    lines.push('## Text styles', '', '| Class | Family | Size / line height | Weight | Usage |', '|---|---|---|---|---|');
    for (const group of tokens.groups) {
      for (const style of group.styles) {
        lines.push(
          `| \`.${style.name}\` | ${cell(style.familyKey ? `var(--font-${style.familyKey})` : style.family ?? '')} | ${style.fontSize}${style.lineHeight ? ` / ${style.lineHeight}` : ''} | ${style.fontWeight ?? ''} | ${cell(style.usage ?? '')} |`,
        );
      }
    }
    lines.push('');
    const families = Object.entries(tokens.families);
    if (families.length) lines.push('Font families: ' + families.map(([key, stack]) => `\`--font-${key}\` = ${stack}`).join('; ') + '.', '');
  }
  const plain: [string, { name: string; value: string; usage?: string }[]][] = [
    ['Spacing', tokens.spacing],
    ['Radius', tokens.radius],
    ['Shadow', tokens.shadows.map((s) => ({ name: s.name, value: s.declared[tokens.themes[0]!.id] ?? '', ...(s.usage ? { usage: s.usage } : {}) }))],
    ...tokens.extras.map((family) => [family.title, family.tokens] as [string, { name: string; value: string; usage?: string }[]]),
  ];
  for (const [title, list] of plain) {
    if (!list.length) continue;
    lines.push(`## ${title}`, '', '| Token | Value | Usage |', '|---|---|---|');
    for (const token of list) lines.push(`| \`--${token.name}\` | \`${cell(token.value)}\` | ${cell(token.usage ?? '')} |`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** One component card. */
function componentCard(input: GenerateInput, name: string): string {
  const { files } = input;
  const namespace = bundleNamespace(input);
  const readme = files.get(`components/${name}/README.md`)?.trim();
  const declared = componentProps((path) => files.get(path), name);
  const lines = [`# ${name}`, ''];
  if (namespace) lines.push(`\`const { ${name} } = window.${namespace};\``, '');
  if (declared) {
    const { props, dts } = declared;
    if (props?.length) {
      lines.push('## Props', '', '| Prop | Type | Default | Description |', '|---|---|---|---|');
      for (const prop of props) {
        lines.push(`| \`${prop.name}${prop.optional ? '?' : ''}\` | \`${cell(prop.type)}\` | ${prop.defaultValue ? `\`${cell(prop.defaultValue)}\`` : ''} | ${cell(prop.doc ?? '')} |`);
      }
      lines.push('');
    } else {
      lines.push('## Declaration', '', '```ts', dts.trim(), '```', '');
    }
  }
  if (readme) lines.push('## Notes', '', readme.replace(/^#\s+[^\n]*\n+/, ''), '');
  lines.push(`Preview: \`components/${name}/preview.html\`.`);
  return `${lines.join('\n').trimEnd()}\n`;
}

/** The assets card. */
function assetsCard({ index, files }: GenerateInput): string {
  const lines = ['# Assets', ''];
  for (const group of listAssets(index, files.keys())) {
    lines.push(`## ${group.name}`, '');
    const note = files.get(`assets/${group.name}/README.md`)?.trim();
    if (note) lines.push(note.replace(/^#\s+[^\n]*\n+/, ''), '');
    for (const item of group.items) lines.push(`- ${item.path ? `\`${item.path}\`` : `\`/_blob/${item.blob}\` (${item.name})`}`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** Generates every `api/` card, keyed by project path. */
export function buildApiCards(input: GenerateInput): Record<string, string> {
  const cards: Record<string, string> = {};
  const components = listComponents(input.files).filter((component) => component.name !== 'Cover');
  const hasAssets = listAssets(input.index, input.files.keys()).some((group) => group.items.length);
  cards['api/tokens.md'] = tokensCard(input);
  for (const component of components) cards[`api/components/${component.name}.md`] = componentCard(input, component.name);
  if (hasAssets) cards['api/assets.md'] = assetsCard(input);

  const readme = [`# ${input.index.title || 'Design system'} — agent reference`, ''];
  readme.push('Generated by the design system page on save. Read these instead of the whole project.', '');
  readme.push('- `api/tokens.md`: every token and text style with its usage.');
  if (hasAssets) readme.push('- `api/assets.md`: logos, icons and images by group.');
  if (components.length) {
    readme.push('- Components:');
    for (const component of components) readme.push(`  - \`api/components/${component.name}.md\`${component.summary ? ` — ${component.summary}` : ''}`);
  }
  cards['api/README.md'] = `${readme.join('\n')}\n`;
  return cards;
}

/* -------------------------------------------------------------------------- */
/* All generated files                                                         */
/* -------------------------------------------------------------------------- */

/** What {@link generateSystemFiles} reads. */
export interface GenerateFilesInput {
  /** Project files by path: text files with their text; binary files may map to any string. */
  files: ReadonlyMap<string, string>;
  /** Title used when the index has none (the folder name). */
  fallbackTitle?: string;
}

/**
 * Every generated file as it should be now: `tokens.css`, `manifest.json`,
 * the `api/` cards and the README with its usage block. `null` removes a
 * file (an `api/` card of a component that is gone). Returns nothing when
 * there is no readable index.
 *
 * The page calls this on every save; `open-artifact generate` calls it for
 * agents that edited files with the page closed. Both write the same bytes.
 */
export function generateSystemFiles({ files, fallbackTitle }: GenerateFilesInput): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const indexText = files.get('design-system.json');
  if (indexText === undefined) return out;
  let index: SystemIndex;
  try {
    index = normalizeSystemIndex(JSON.parse(indexText));
  } catch {
    return out;
  }
  if (!index.title && fallbackTitle) index = { ...index, title: fallbackTitle };

  const { raw, error } = parseTokensFile(files.get('tokens.json'));
  const { tokens } = normalizeTokens(raw);
  const input: GenerateInput = { index, tokens, files };

  if (files.has('tokens.json') && !error) out['tokens.css'] = compileTokensCss(tokens, { title: index.title });

  let previous: Partial<SystemManifest> | undefined;
  try {
    previous = (JSON.parse(files.get('manifest.json') ?? 'null') as Partial<SystemManifest> | null) ?? undefined;
  } catch {
    previous = undefined;
  }
  out['manifest.json'] = `${JSON.stringify(buildManifest(index, files, previous), null, 2)}\n`;

  const cards = buildApiCards(input);
  for (const path of files.keys()) if (path.startsWith('api/') && !(path in cards)) out[path] = null;
  Object.assign(out, cards);

  const { readme } = listSections(files);
  if (readme) out[readme.path] = withUsageBlock(files.get(readme.path) ?? '', usageBlock(input));
  return out;
}
