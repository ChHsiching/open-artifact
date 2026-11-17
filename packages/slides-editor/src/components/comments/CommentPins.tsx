/**
 * Comment pins on the stage: the shared pins, card and composer
 * (`@open-artifact/editor-kit`, CommentViews.tsx) placed on the slide on
 * stage. Pins sit where the thread was placed (a point on the slide), else at
 * the top-right corner of its element, else at the slide's corner. The stage
 * itself starts new threads (Stage.tsx), so only the pins are shared.
 */

import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { nodeAt, SLIDE_WIDTH, type Slide } from '@open-artifact/slides-core';
import { CommentPins as SharedPins } from '@open-artifact/editor-kit/react';
import type { PinPlace, Point } from '@open-artifact/editor-kit';
import { useAgent } from '../../services/agent.ts';
import { anchorOf, anchorPath, elementAnchor, slidesComments, useComments, type SlideAnchor } from '../../services/comments.ts';
import { elementOf, measure } from '../stage/geometry.ts';
import { pickAt, type StageContext } from '../stage/gestures.ts';
import { useStageGesture } from '../stage/store.ts';

/** Where an anchor's pin goes, in slide coordinates. */
function pinPoint(ctx: StageContext, slide: Slide, anchor: SlideAnchor): Point {
  if (anchor.x !== undefined && anchor.y !== undefined) return { x: anchor.x, y: anchor.y };
  const path = anchorPath(slide, anchor);
  const el = path && nodeAt(slide, path) ? elementOf(ctx.root, path) : null;
  if (el) {
    const r = measure(ctx.root, el, ctx.scale);
    return { x: r.x + r.w, y: r.y };
  }
  return { x: SLIDE_WIDTH - 48, y: 48 };
}

/** The room a card has from the slide's top-left corner to the stage's far edges (screen px). */
function stageRoom(ctx: StageContext): { width: number; height: number } {
  const box = ctx.root.getBoundingClientRect();
  const stage = ctx.root.closest('[data-open-artifact-stage]')?.getBoundingClientRect();
  return stage ? { width: stage.right - box.left, height: stage.bottom - box.top } : { width: box.width, height: box.height };
}

/** Pins, the active card and the composer for the slide on stage. */
export function CommentPins({ ctx, slide }: { ctx: StageContext; slide: Slide }): ReactNode {
  const threads = useComments((s) => s.threads);
  const draft = useComments((s) => s.draft);
  const tick = useStageGesture((s) => s.layoutTick);
  const agent = useAgent((s) => s.status);
  const [layout, setLayout] = useState<{ points: Map<SlideAnchor, Point>; viewport: { width: number; height: number } }>(() => ({
    points: new Map(),
    viewport: { width: 0, height: 0 },
  }));

  // Pins are measured on the rendered slide, after it laid out.
  useLayoutEffect(() => {
    const points = new Map<SlideAnchor, Point>();
    for (const thread of threads) {
      const anchor = anchorOf(thread);
      if (anchor.slide === ctx.slideId) points.set(anchor, pinPoint(ctx, slide, anchor));
    }
    if (draft?.slide === ctx.slideId) points.set(draft, pinPoint(ctx, slide, draft));
    setLayout({ points, viewport: stageRoom(ctx) });
  }, [ctx, slide, threads, draft, tick]);

  const place = useCallback(
    (anchor: SlideAnchor): PinPlace | null => {
      const world = anchor.slide === ctx.slideId ? layout.points.get(anchor) : undefined;
      return world ? { world, state: 'ok' } : null;
    },
    [ctx.slideId, layout],
  );
  // A dragged pin lands on the element under its tip, at that point.
  const anchorAt = useCallback(
    (world: Point): SlideAnchor => {
      const box = ctx.root.getBoundingClientRect();
      const path = pickAt(ctx, slide, box.left + world.x * ctx.scale, box.top + world.y * ctx.scale, []);
      return elementAnchor(slide, path, world);
    },
    [ctx, slide],
  );
  const camera = useMemo(() => ({ x: 0, y: 0, zoom: ctx.scale }), [ctx.scale]);

  return (
    <div data-open-artifact-comment-ui className="contents">
      <SharedPins<SlideAnchor>
        comments={slidesComments}
        camera={camera}
        viewport={layout.viewport}
        place={place}
        anchorAt={anchorAt}
        agent={{ available: agent.available, name: agent.name }}
        piles={false}
      />
    </div>
  );
}
