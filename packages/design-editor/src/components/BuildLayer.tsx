/**
 * The build show on the canvas (services/build.ts): the agent's cursor and
 * the outlines of what it draws, in screen space over the artboards.
 */

import type { ReactNode } from 'react';
import { BuildShowLayer } from '@open-artifact/editor-kit/react';
import type { BuildPoint } from '@open-artifact/editor-kit';
import { useBuild } from '../services/build.ts';
import { useAgent } from '../services/agent.ts';
import { useView } from '../state/view.ts';

/** World → screen with the view store's camera (the layer around it makes up for the engine's lead). */
const place = (p: BuildPoint): BuildPoint => {
  const { camera } = useView.getState();
  return { x: p.x * camera.zoom + camera.x, y: p.y * camera.zoom + camera.y };
};
const zoom = (): number => useView.getState().camera.zoom;

export function BuildLayer(): ReactNode {
  const show = useBuild((s) => s.show);
  const idle = useBuild((s) => s.idle);
  const name = useAgent((s) => s.status.name);
  const canvas = useView((s) => s.mode === 'canvas');
  if (!canvas) return null;
  return <BuildShowLayer show={show} idle={idle} place={place} zoom={zoom} name={name || 'Agent'} />;
}
