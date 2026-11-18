import { leastUsedPeerColor, normalizePeerColor, peerColorFor } from '@open-artifact/editor-kit';

export const SHEETS_NEVER_GIVEN_COLORS: readonly string[] = ['#d25f25', '#257de0'];

export function peerColorOf(claimedColor: string | null | undefined, seed: unknown, rotation: string): string {
  const claimed = normalizePeerColor(claimedColor);
  const isClaimable = claimed !== undefined && !SHEETS_NEVER_GIVEN_COLORS.includes(claimed);
  return leastUsedPeerColor(peerColorFor(isClaimable ? claimed : seed, rotation), [], SHEETS_NEVER_GIVEN_COLORS);
}
