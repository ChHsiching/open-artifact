/** What Edit with Agent sends the agent: the person's ask, where the selected words are, and the words themselves. */
import { fenceUntrusted } from '@open-artifact/runtime';
import type { RewriteTarget } from './store.ts';

export const REWRITE_TITLE = 'Edit with Agent';

export interface RewritePreset {
  key: 'shorter' | 'simplify' | 'grammar';
  label: string;
}

export const REWRITE_PRESETS: readonly RewritePreset[] = [
  { key: 'shorter', label: 'Make it shorter' },
  { key: 'simplify', label: 'Make it simpler' },
  { key: 'grammar', label: 'Fix spelling and grammar' },
];

export interface RewriteRequest {
  tab: string;
  ask: string;
  targets: readonly RewriteTarget[];
}

/** The selected words as one text: a paragraph break between blocks. */
export const selectedText = (targets: readonly RewriteTarget[]) => targets.map(target => target.text).join('\n');

export function rewriteText({ tab, ask, targets }: RewriteRequest): string {
  const places = targets.map(target => `- block ${target.block}: chars ${target.fromChar} to ${target.toChar}`);
  return [
    `Edit the selected words in tab ${tab} of this doc, as the person asks below.`,
    'Make the edit a suggestion (an update with "suggest": true) so they can accept or reject it. Change only the selected words, ' +
      'each range below as one chars target ({"kind": "chars", "range": [from, to]}), and leave the rest of the tab as it is.',
    places.join('\n'),
    `The person asks: ${ask.trim()}`,
    fenceUntrusted(selectedText(targets), { label: 'the selected words' }),
  ].join('\n\n');
}

export function rewriteContext({ tab, ask, targets }: RewriteRequest): Record<string, unknown> {
  return {
    tab,
    ask: ask.trim(),
    selection: targets.map(target => ({ block: target.block, range: [target.fromChar, target.toChar] })),
  };
}
