/** Which two versions a preview compares, and the words the bar and the change strip say about it. */
import type { DocVersion } from '@open-artifact/runtime/doc-api';
import { changeCountLabel } from './compare.ts';
import type { CompareWith, Preview, RestoreBase } from './store.ts';

/** What the previewed version is compared with. */
export type Against = 'previous' | 'current' | 'restored';

export interface CompareTarget {
  against: Against;
  /** The older side (`null`: nothing earlier to compare). */
  before: number | null;
  /** The newer side: the previewed version, or the tab as it is now when comparing with the current version. */
  after: number;
  /** The previewed version is a restore. */
  restore: boolean;
  /** A restore: the rev it brought back. */
  restoredFrom: number | null;
}

/**
 * The previous version shows what this version changed; the current version shows what changed since it (this version
 * is the older side); a restore can also be checked against the version it brought back (the two should match).
 */
export function compareTarget(preview: Preview, versions: readonly DocVersion[] | null, compareWith: CompareWith, restoreBase: RestoreBase): CompareTarget {
  const version = versions?.find(item => item.rev === preview.rev);
  const restoredFrom = preview.count === 1 && version?.restoredFrom !== undefined ? version.restoredFrom : null;
  const restore = restoredFrom !== null;
  if (restore && restoreBase === 'restored') return { against: 'restored', before: restoredFrom, after: preview.rev, restore, restoredFrom };
  const head = versions?.[0]?.rev;
  if (compareWith === 'current' && !preview.current && head !== undefined && head !== preview.rev)
    return { against: 'current', before: preview.rev, after: head, restore, restoredFrom };
  return { against: 'previous', before: preview.base, after: preview.rev, restore, restoredFrom };
}

/** Where the comparison stands. */
export type CompareState = { kind: 'off' } | { kind: 'loading' } | { kind: 'none' } | { kind: 'failed' } | { kind: 'shown'; count: number };

/** The bar's word on the comparison ("Nothing earlier to compare", "Identical to the restored version"…); `null`: none. */
export function compareStatus(target: CompareTarget, state: CompareState): string | null {
  switch (state.kind) {
    case 'off':
    case 'loading':
      return null;
    case 'none':
      return 'Nothing earlier to compare';
    case 'failed':
      return 'Couldn’t compare';
    case 'shown':
      if (state.count === 0) return target.against === 'previous' ? 'No changes' : `Identical to the ${target.against} version`;
      if (target.against === 'current') return 'Compared with the current version';
      if (target.against === 'restored') return 'Compared with the version it restored';
      return target.restore ? 'Compared with the version before the restore' : 'Compared with the previous version';
  }
}

/** "3 changes since this version" (against the current version), "1 change in this version" (the rest). */
export const changesLabel = (count: number, against: Against): string => `${changeCountLabel(count)} ${against === 'current' ? 'since' : 'in'} this version`;

/** The compare menu's readout. */
export const againstLabel = (against: Against): string => `vs ${against} version`;
