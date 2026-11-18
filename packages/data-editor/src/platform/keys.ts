/** Keeps a held Enter or Space from activating whatever takes the focus next: only the first press of a hold counts. */
export function blockHeldKeyActivation(target: Window): () => void {
  let pressed: EventTarget | null = null;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!event.repeat) pressed = event.target;
    else if ((event.key === 'Enter' || event.key === ' ') && event.target !== pressed) event.preventDefault();
  };
  target.addEventListener('keydown', onKeyDown, true);
  return () => target.removeEventListener('keydown', onKeyDown, true);
}
