/**
 * Which nodes of a slide a change added or changed, for the stage's build
 * show of an edit (services/build-show.ts): it replays only those.
 */

import { pathKey, walkNodes, type Slide, type SlideNode } from '@open-artifact/slides-core';

/** A node on its own: everything but its children and where it was read from. */
function signature(node: SlideNode): string {
  const { origin: _origin, ...rest } = node;
  if (rest.kind === 'box') return JSON.stringify({ ...rest, children: undefined });
  return JSON.stringify(rest);
}

/**
 * The paths (`pathKey`) of the nodes of `after` that `before` did not have
 * as they are now. Nodes that only moved in the tree keep their signature
 * and are not counted; a node whose style or text changed is.
 */
export function changedNodePaths(before: Slide, after: Slide): Set<string> {
  const left = new Map<string, number>();
  walkNodes(before, (node) => {
    const key = signature(node);
    left.set(key, (left.get(key) ?? 0) + 1);
  });
  const changed = new Set<string>();
  walkNodes(after, (node, path) => {
    const key = signature(node);
    const n = left.get(key) ?? 0;
    if (n > 0) left.set(key, n - 1);
    else changed.add(pathKey(path));
  });
  return changed;
}
