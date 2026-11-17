/**
 * The `/open-artifact` skill. A person types `/open-artifact slides a deck about our Q3 results` (or a tile of the Open
 * Artifact page puts it in a new session's input): DSH loads a user-invocable skill whose name is a `/name` word of
 * what the person sends, so the agent reads skills/open-artifact/SKILL.md, which says the next word is the type and how
 * to make one with the Artifact tool, followed by the types the daemon has installed now.
 */
import { readFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { TypeView } from '@open-artifact/protocol';
import type { DshSkillCandidate, DshSkillProvider } from './dsh.ts';

/** The skill's name: the `/open-artifact` word. */
export const SKILL_NAME = 'open-artifact';
/** The registry's rank for packaged skills (`BUNDLED_SKILL_RANK` in @deepseek-ai/dsh-skill). */
export const BUNDLED_SKILL_RANK = 600;

const DESCRIPTION =
  'Make a new artifact of one Open Artifact type (design, slides, whiteboard, design-system, …) with the Artifact tool. Usage: /open-artifact <type> <what to make>.';

/** One installed type, as the skill lists it. */
export interface SkillType {
  id: string;
  title: string;
  description?: string;
}

/** The types a new artifact can be made of: installed, on, runnable. */
export function creatableTypes(types: readonly Partial<TypeView>[]): SkillType[] {
  return types
    .filter((t) => typeof t.id === 'string' && t.enabled !== false && t.runnable !== false && !t.shadowedBy && !t.problems?.length)
    .map((t) => ({ id: t.id!, title: t.title || t.id!, ...(t.description ? { description: t.description } : {}) }));
}

/** SKILL.md without its front matter. */
export function skillBody(raw: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
  return (match ? raw.slice(match[0].length) : raw).trim();
}

/** The section after the SKILL.md: the installed types, or how to find them when the daemon could not say. */
export function typesSection(types: readonly SkillType[] | null): string {
  if (types === null) {
    return '## Installed types\n\nThe list could not be read just now: call `Artifact {action: "quickstart", intent: "<the type id>"}` to see the installed types.';
  }
  if (types.length === 0) return '## Installed types\n\nNone is installed: tell the person, and do not make one.';
  const flat = (text: string) => text.replace(/\s+/g, ' ').trim();
  const firstSentence = (text: string) => {
    const end = flat(text).search(/[.!?。！？](\s|$)/);
    return end >= 0 ? flat(text).slice(0, end + 1) : flat(text);
  };
  const lines = types.map((t) => `- \`${t.id}\`: ${flat(t.title)}${t.description ? `. ${firstSentence(t.description)}` : ''}`);
  return `## Installed types\n\n${lines.join('\n')}`;
}

/** Options of {@link skillProvider}. */
export interface SkillProviderOptions {
  /** The plugin folder, which holds skills/open-artifact/SKILL.md. */
  packageRoot: string;
  /** The daemon's types; a throw lists none and says how to find them. */
  types(signal?: AbortSignal): Promise<readonly Partial<TypeView>[]>;
  /** The provider's name in the registry. */
  provider?: string;
}

/** The skill provider DSH's skill registry takes. */
export function skillProvider({ packageRoot, types, provider = 'dsh-open-artifact' }: SkillProviderOptions): DshSkillProvider {
  const directory = join(packageRoot, 'skills', SKILL_NAME);
  const candidate: DshSkillCandidate = {
    name: SKILL_NAME,
    description: DESCRIPTION,
    invocation: { modelInvocable: false, userInvocable: true },
    provider,
    source: 'bundled',
    rank: BUNDLED_SKILL_RANK,
    path: join(directory, 'SKILL.md'),
    resourceBase: { kind: 'directory', path: directory.split(sep).join('/') },
  };
  return {
    name: provider,
    list: () => Promise.resolve([candidate]),
    async get(asked, options) {
      const { rank: _rank, ...summary } = asked.name === SKILL_NAME ? asked : candidate;
      const raw = await readFile(candidate.path, { encoding: 'utf8', ...(options?.signal ? { signal: options.signal } : {}) });
      let listed: SkillType[] | null;
      try {
        listed = creatableTypes(await types(options?.signal));
      } catch {
        listed = null;
      }
      return { ...summary, content: `${skillBody(raw)}\n\n${typesSection(listed)}\n` };
    },
  };
}
