import * as React from 'react';
import { cn } from './cn.ts';
import { useKitLabel } from './labels.tsx';
import { isApplePlatform } from './platform.ts';

type ModifierName = 'cmd' | 'command' | 'meta' | 'ctrl' | 'control' | 'alt' | 'option' | 'shift';

const MODIFIER_NAMES: readonly ModifierName[] = ['cmd', 'command', 'meta', 'ctrl', 'control', 'alt', 'option', 'shift'];
const MODIFIER_ORDER: readonly ModifierName[] = ['ctrl', 'control', 'alt', 'option', 'shift', 'cmd', 'command', 'meta'];

const isModifierName = (key: string): key is ModifierName => (MODIFIER_NAMES as readonly string[]).includes(key);

const MAC_MODIFIER_GLYPHS: Readonly<Record<ModifierName, string>> = {
  ctrl: '⌃',
  control: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
  cmd: '⌘',
  command: '⌘',
  meta: '⌘',
};

const PC_MODIFIER_LABELS: Readonly<Record<ModifierName, string>> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  cmd: 'Ctrl',
  command: 'Ctrl',
  meta: 'Ctrl',
};

const MAC_KEY_GLYPHS: Readonly<Record<string, string>> = {
  space: '␣',
  enter: '⏎',
  return: '⏎',
  delete: '⌫',
  backspace: '⌫',
  escape: 'Esc',
  esc: 'Esc',
  tab: '⇥',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  home: 'Home',
  end: 'End',
  insert: 'Insert',
  plus: '+',
};

const PC_KEY_LABELS: Readonly<Record<string, string>> = {
  ...MAC_KEY_GLYPHS,
  space: 'Space',
  delete: 'Backspace',
  backspace: 'Backspace',
  tab: 'Tab',
};

/** How a screen reader should say a glyph. */
const SPOKEN_KEYS: Readonly<Record<string, string>> = {
  cmd: 'Command',
  command: 'Command',
  meta: 'Command',
  ctrl: 'Control',
  control: 'Control',
  alt: 'Option',
  option: 'Option',
  shift: 'Shift',
  enter: 'Enter',
  return: 'Enter',
  space: 'Space',
  tab: 'Tab',
  delete: 'Delete',
  backspace: 'Delete',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
};

/** Key names as `aria-keyshortcuts` spells them. */
const ARIA_KEYS: Readonly<Record<string, string>> = {
  ctrl: 'Control',
  control: 'Control',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  enter: 'Enter',
  return: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  space: 'Space',
  tab: 'Tab',
  delete: 'Backspace',
  backspace: 'Backspace',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  insert: 'Insert',
};

const own = (table: Readonly<Record<string, string>>, key: string): string | undefined => (Object.hasOwn(table, key) ? table[key] : undefined);

function keyLabel(key: string, isApple: boolean): string {
  const named = own(isApple ? MAC_KEY_GLYPHS : PC_KEY_LABELS, key);
  if (named !== undefined) return named;
  if (/^f\d+$/.test(key) || key.length === 1) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Splits `"cmd+k g"` into its chords, `["cmd+k", "g"]`. */
export function splitShortcutChords(keys: string): string[] {
  const tidy = keys.trim().replace(/\s*\+\s*/g, '+');
  return tidy ? tidy.split(/\s+/) : [];
}

function parseChord(chord: string, isApple: boolean): { modifiers: ModifierName[]; keys: string[] } {
  const parts = chord
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const modifiers: ModifierName[] = [];
  const keys: string[] = [];
  for (const part of parts) {
    if (isModifierName(part)) modifiers.push(part);
    else keys.push(part);
  }
  const rank = (modifier: ModifierName): number =>
    MODIFIER_ORDER.indexOf(!isApple && (modifier === 'cmd' || modifier === 'command' || modifier === 'meta') ? 'ctrl' : modifier);
  modifiers.sort((a, b) => rank(a) - rank(b));
  return { modifiers, keys };
}

interface ShortcutKey {
  label: string;
  spoken?: string;
}

function formatChord(chord: string, isApple: boolean): ShortcutKey[] {
  const { modifiers, keys } = parseChord(chord, isApple);
  const glyphs = isApple ? MAC_MODIFIER_GLYPHS : PC_MODIFIER_LABELS;
  const described = (name: string, label: string): ShortcutKey => {
    if (/^[A-Za-z0-9 ]+$/.test(label)) return { label };
    const spoken = own(SPOKEN_KEYS, name);
    return spoken === undefined ? { label } : { label, spoken };
  };
  return [...modifiers.map((modifier) => described(modifier, glyphs[modifier])), ...keys.map((key) => described(key, keyLabel(key, isApple)))];
}

/** The `aria-keyshortcuts` value of a one-chord shortcut, or `undefined` for anything longer. */
export function parseSingleShortcut(keys: string, isApple: boolean): string | undefined {
  const [chord, ...more] = splitShortcutChords(keys);
  if (chord === undefined || more.length > 0) return undefined;
  const { modifiers, keys: plain } = parseChord(chord, isApple);
  if (plain.length !== 1) return undefined;
  const command = isApple ? 'Meta' : 'Control';
  const spell = (key: string): string =>
    key === 'cmd' || key === 'command' || key === 'meta'
      ? command
      : (own(ARIA_KEYS, key) ?? (/^f\d+$/.test(key) ? key.toUpperCase() : key.length === 1 ? key : key.charAt(0).toUpperCase() + key.slice(1)));
  return [...modifiers, ...plain].map(spell).join('+');
}

const KEYCAP_CLASSES =
  'inline-flex shrink-0 items-center justify-center h-[calc(1em+6px)] rounded-[var(--ui-keycap-radius,4px)] [color:var(--ui-shortcut-cap-ink)] bg-[color:var(--ui-shortcut-cap-fill)] border border-[color:var(--ui-shortcut-cap-line)] font-inherit [line-height:1]';

export function shortcutKeycapClassName(label: string | undefined): string {
  return `${KEYCAP_CLASSES} ${Array.from(label ?? '').length === 1 ? 'w-[calc(1em+6px)] px-0' : 'min-w-[calc(1em+6px)] px-[3px]'}`;
}

const TEXT_GLYPH_CLASSES = 'font-inherit [color:var(--ui-shortcut-cap-ink)]';

const VARIANT_CLASSES = {
  keycap: 'inline-flex shrink-0 items-center gap-[2px] text-caption',
  text: 'inline-flex shrink-0 items-baseline gap-[0.15em] text-caption',
} as const;

export interface ShortcutProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  keys: string;
  variant?: keyof typeof VARIANT_CLASSES;
  /** Drawn on a filled control, so the keys take its text color. */
  onFill?: boolean;
}

/** Shows a keyboard shortcut as keycaps, or as plain glyphs inside running text. */
export function Shortcut({ keys, variant = 'keycap', onFill = false, className, ...rest }: ShortcutProps): React.ReactElement {
  const isApple = isApplePlatform();
  const then = useKitLabel('sequenceThen');
  const chords = splitShortcutChords(keys).map((chord) => formatChord(chord, isApple));
  const joinsWithPlus = variant === 'text' && !isApple;
  return (
    <span
      {...rest}
      data-ui="Shortcut"
      data-variant={variant}
      className={cn(
        VARIANT_CLASSES[variant],
        chords.length === 1 && '[&:where(:root[dir=rtl]_:dir(rtl))]:flex-row-reverse',
        onFill && '[--ui-shortcut-cap-ink:currentColor]',
        className,
      )}
    >
      {chords.map((chord, chordIndex) => (
        <React.Fragment key={chordIndex}>
          {chordIndex > 0 && <span className="px-[2px] [color:var(--ui-shortcut-cap-ink)]">{then}</span>}
          {chord.map(({ label, spoken }, keyIndex) => (
            <React.Fragment key={keyIndex}>
              {joinsWithPlus && keyIndex > 0 && <span className="mx-[-0.15em] [color:var(--ui-shortcut-cap-ink)]">+</span>}
              <kbd className={variant === 'text' ? TEXT_GLYPH_CLASSES : shortcutKeycapClassName(label)}>
                {spoken === undefined ? (
                  label
                ) : joinsWithPlus ? (
                  spoken
                ) : (
                  <>
                    <span aria-hidden="true">{label}</span>
                    <span className="sr-only select-none">{spoken}</span>
                  </>
                )}
              </kbd>
            </React.Fragment>
          ))}
        </React.Fragment>
      ))}
    </span>
  );
}
