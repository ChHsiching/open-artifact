/**
 * The Design's "All comments" panel: the shared one (`@open-artifact/editor-kit`, CommentList.tsx), under the corner
 * cards at the canvas' top right.
 */

import type { ReactNode } from 'react';
import { AllComments } from '@open-artifact/editor-kit/react';
import { useAgent } from '../../services/agent.ts';
import { designComments } from '../../services/comments.ts';

/** Where the panel starts: under the corner cards (12px from the top, 36px tall, 8px gap). */
const PANEL_TOP = 56;

/** The "All comments" panel, while it is open. */
export function CommentList(): ReactNode {
  const agent = useAgent((s) => s.status);
  return (
    <AllComments
      comments={designComments}
      agent={{ available: agent.available, name: agent.name, wakesIdle: agent.wakesIdle }}
      top={PANEL_TOP}
      hint="Press C, then click an element, an artboard or the canvas. Drag to comment on an area."
    />
  );
}
