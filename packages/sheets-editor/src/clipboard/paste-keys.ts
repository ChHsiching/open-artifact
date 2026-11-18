import type { Dynamic } from '../dynamic.ts';
export function createPasteKeyTracker(target?: Dynamic, now: Dynamic = () => performance.now()) {
  let lastKey: Dynamic = null;
  let onKeyDown = ({ key: key, shiftKey: shiftKey, ctrlKey: ctrlKey, metaKey: metaKey, repeat: repeat }: Dynamic) => {
    let isModifiedCharacter = key.length === String.fromCodePoint(key.codePointAt(0) ?? 0).length && (ctrlKey || metaKey);
    let mayPaste = isModifiedCharacter || key === 'Insert' || key === 'Paste';
    lastKey = {
      wentDownAt: now(),
      isWithoutFormatting: isModifiedCharacter && shiftKey,
      mayPaste: mayPaste,
      isHeldDown: repeat && mayPaste,
    };
  };
  let forgetKey = () => {
    lastKey = null;
  };
  let recentKey = () => (lastKey !== null && now() - lastKey.wentDownAt < 1000 ? lastKey : null);
  target.addEventListener('keydown', onKeyDown, true);
  target.addEventListener('pointerdown', forgetKey, true);
  target.addEventListener('blur', forgetKey);
  return {
    isWithoutFormatting: () => recentKey()?.isWithoutFormatting === true,
    isHeldDown: () => recentKey()?.isHeldDown === true,
    isByKey: () => recentKey()?.mayPaste === true,
    stop() {
      target.removeEventListener('keydown', onKeyDown, true);
      target.removeEventListener('pointerdown', forgetKey, true);
      target.removeEventListener('blur', forgetKey);
    },
  };
}
