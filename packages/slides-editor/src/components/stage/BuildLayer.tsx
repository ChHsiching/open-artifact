/**
 * The build show on the stage (services/build-show.ts): the agent's cursor
 * and the outlines of what it draws, over the slide, in stage pixels.
 */

import { useRef, type ReactNode } from 'react';
import { BuildShowLayer } from '@open-artifact/editor-kit/react';
import type { BuildPoint } from '@open-artifact/editor-kit';
import { useSlideBuild } from '../../services/build-show.ts';
import { useAgent } from '../../services/agent.ts';

export function SlideBuildLayer({ scale, current }: { scale: number; current: string | null }): ReactNode {
  const show = useSlideBuild((s) => (s.slideId === current ? s.show : null));
  const idle = useSlideBuild((s) => s.idle);
  const name = useAgent((s) => s.status.name);
  const k = useRef(scale);
  k.current = scale;
  const place = useRef((p: BuildPoint): BuildPoint => ({ x: p.x * k.current, y: p.y * k.current })).current;
  const zoom = useRef((): number => k.current).current;
  return <BuildShowLayer show={show} idle={idle} place={place} zoom={zoom} name={name || 'Agent'} />;
}
