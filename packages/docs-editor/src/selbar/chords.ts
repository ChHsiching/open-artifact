/** Key chords as the tooltips show them: `Mod-Alt-m` is ⌘⌥M on Apple platforms and Ctrl+Alt+M elsewhere. */

const isApple = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

const APPLE: Record<string, string> = { Mod: '⌘', Alt: '⌥', Shift: '⇧', Ctrl: '⌃' };
const OTHER: Record<string, string> = { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Ctrl: 'Ctrl' };
const KEYS: Record<string, string> = { Enter: '↵', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space' };

/** A chord written as the editor's keymap writes it, shown for the platform. */
export function formatChord(chord: string, apple = isApple()): string {
  // `Mod-]` splits into `Mod` and `]`, `Mod--` into `Mod`, `` and `-`.
  const parts = chord.split('-');
  const key = parts.pop() || '-';
  const modifiers = parts.filter(part => part !== '');
  const names = apple ? APPLE : OTHER;
  const shown = KEYS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  const mods = modifiers.map(mod => names[mod] ?? mod);
  return apple ? mods.join('') + shown : [...mods, shown].join('+');
}
