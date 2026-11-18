/** What typing turns into: Markdown's block and span marks, arrows and `:emoji:` names. */
import { gemoji } from 'gemoji';
import { InputRule, inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import type { MarkType } from 'prosemirror-model';
import type { Plugin } from 'prosemirror-state';
import { findWrapping } from 'prosemirror-transform';
import { schema } from './schema.ts';

const { nodes, marks } = schema;

const EMOJI = new Map<string, string>();
for (const entry of gemoji) for (const name of entry.names) EMOJI.set(name, entry.emoji);

export const emojiNamed = (name: string) => EMOJI.get(name) ?? null;

/** The text before the cursor matched `**words**` and the like: the words keep the mark, the signs go. */
function markRule(pattern: RegExp, type: MarkType): InputRule {
  return new InputRule(
    pattern,
    (state, match, start, end) => {
    const words = match[2];
    if (!words) return null;
    const $start = state.doc.resolve(start);
    if (!$start.parent.type.allowsMarkType(type)) return null;
    const lead = match[1] ?? '';
    const from = start + lead.length;
    const tr = state.tr.delete(from, end).insertText(words, from);
    tr.addMark(from, from + words.length, type.create());
    tr.removeStoredMark(type);
    return tr;
    },
    { inCodeMark: false },
  );
}

function textRule(pattern: RegExp, replace: string): InputRule {
  return new InputRule(pattern, (state, match, start, end) => state.tr.insertText(replace, start + (match[1] ?? '').length, end), { inCodeMark: false });
}

const headingRule = new InputRule(/^(#{1,6})\s$/, (state, match, start, end) => {
  const $start = state.doc.resolve(start);
  if ($start.parent.type !== nodes.paragraph) return null;
  return state.tr.delete(start, end).setNodeMarkup($start.before(), undefined, { ...$start.parent.attrs, heading: match[1]!.length });
});

const ruleRule = new InputRule(/^(?:---|___|\*\*\*)$/, (state, _match, start, end) => {
  const $start = state.doc.resolve(start);
  if ($start.parent.type !== nodes.paragraph || $start.depth !== 1) return null;
  const tr = state.tr.delete(start, end);
  const at = tr.mapping.map($start.before());
  tr.insert(at, nodes.horizontalRule!.create());
  return tr;
});

const emojiRule = new InputRule(/(^|[\s(])(:([a-z0-9_+-]+):)$/, (state, match, start, end) => {
  const emoji = emojiNamed(match[3]!);
  if (!emoji) return null;
  return state.tr.insertText(emoji, start + match[1]!.length, end);
}, { inCodeMark: false });

const checkRule = new InputRule(/^\s*\[([ xX]?)\]\s$/, (state, match, start, end) => {
  const tr = state.tr.delete(start, end);
  const range = tr.doc.resolve(start).blockRange();
  const wrapping = range && findWrapping(range, nodes.list!, { kind: 'check' });
  if (!range || !wrapping) return null;
  tr.wrap(range, wrapping);
  const item = tr.doc.nodeAt(range.start + 1);
  if (item?.type === nodes.listItem) tr.setNodeMarkup(range.start + 1, undefined, { ...item.attrs, checked: (match[1] ?? '').toLowerCase() === 'x' });
  return tr;
});

const codeFence = new InputRule(/^```([\w+#.-]*)\s$/, (state, match, start, end) => {
  const $start = state.doc.resolve(start);
  if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodes.codeBlock!)) return null;
  return state.tr.delete(start, end).setBlockType(start, start, nodes.codeBlock!, { language: match[1] || null });
});

export function docInputRules(): Plugin {
  const rules = [
    headingRule,
    wrappingInputRule(/^\s*([-+*])\s$/, nodes.list!, { kind: 'bullet' }),
    wrappingInputRule(
      /^(\d+)\.\s$/,
      nodes.list!,
      match => ({ kind: 'ordered', start: Number(match[1]) === 1 ? null : Number(match[1]) }),
      (match, node) => node.childCount + (node.attrs.start ?? 1) === Number(match[1]),
    ),
    checkRule,
    wrappingInputRule(/^\s*>\s$/, nodes.blockquote!),
    codeFence,
    ruleRule,
    markRule(/(^|[^*])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, marks.bold!),
    markRule(/(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, marks.italic!),
    markRule(/(^|[^_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, marks.italic!),
    markRule(/(^|[^~])~~([^~\s](?:[^~]*[^~\s])?)~~$/, marks.strike!),
    markRule(/(^|[^`])`([^`]+)`$/, marks.code!),
    textRule(/(^|[^-])-->$/, '→'),
    textRule(/(^|[^<])<--$/, '←'),
    textRule(/(^|[^<])<->$/, '↔'),
    emojiRule,
  ];
  return inputRules({ rules });
}
