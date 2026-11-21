/**
 * The build show on the board (collab/build-show.ts): the agent's cursor and
 * the outlines of what it draws, in screen units above the board. Drawn in
 * board units and placed with the camera every frame, so it pans and zooms
 * with what it draws.
 */

import type { ReactNode } from 'react';
import { BuildShowLayer } from '@open-artifact/editor-kit/react';
import type { BuildPoint } from '@open-artifact/editor-kit';
import { boardToScreen } from '../lib/camera.ts';
import { useAgent } from '../services/agent.ts';
import { useCamera } from '../state/camera.ts';
import { useBoardBuild } from './build-show.ts';

const place = (point: BuildPoint): BuildPoint => boardToScreen(useCamera.getState().camera, point);
const zoom = (): number => useCamera.getState().camera.zoom;

export function BuildLayer(): ReactNode {
  const show = useBoardBuild((state) => state.show);
  const idle = useBoardBuild((state) => state.idle);
  const name = useAgent((state) => state.name);
  // Its own box: the overlay lets its children take the pointer, and this draws nothing that should.
  return (
    <div className="wb-build" aria-hidden="true">
      <BuildShowLayer show={show} idle={idle} place={place} zoom={zoom} name={name || 'Agent'} />
    </div>
  );
}
