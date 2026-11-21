/** Moving between the selection toolbar's buttons with the arrow keys, Home and End. */

/**
 * The button a key moves focus to, from the one at `index` among `count`: the arrows step and wrap around, Home and
 * End go to either end. `null` for any other key, or when focus isn't on one of the buttons.
 */
export function getToolbarKeyTarget(key: string, index: number, count: number): number | null {
  if (index < 0 || index >= count) return null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
