/** Platform key labels and the text-field test every editor's shortcuts use. Pure. */

/** True on Apple platforms (⌘ instead of Ctrl in labels and shortcuts). */
export function isApplePlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

/** The platform's modifier key, as shortcuts are written. */
export const MOD = isApplePlatform() ? '⌘' : 'Ctrl+';
/** The platform's option key. */
export const ALT = MOD === '⌘' ? '⌥' : 'Alt+';
/** The platform's shift key. */
export const SHIFT = MOD === '⌘' ? '⇧' : 'Shift+';

/** The platform's modifier label, read now. */
export function modKey(): string {
  return isApplePlatform() ? '⌘' : 'Ctrl+';
}

/** True when a key or clipboard event goes to a text field (input, textarea, select or editable text). */
export function isTextField(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)));
}
