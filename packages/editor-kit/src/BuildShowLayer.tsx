/**
 * The build show's layer (see `build-show.ts`): the agent's cursor, the
 * outline of each block as it is drawn in (with its size while a box is
 * dragged out), a ripple where the cursor presses, and, between shows, the
 * place the agent works on next. It draws nothing the pointer can reach.
 *
 * One animation frame loop moves everything through refs; React renders only
 * when the show or the waiting place changes.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { cursorAt, outlinesAt, type BuildIdle, type BuildPoint, type BuildShowView } from './build-show.ts';

export interface BuildShowLayerProps {
  show: BuildShowView | null;
  /** Null hides the cursor once no show runs. */
  idle: BuildIdle | null;
  /** This layer's units → px from the layer's top-left corner; read every frame. */
  place: (point: BuildPoint) => BuildPoint;
  /** Px per unit; read every frame. */
  zoom: () => number;
  /** The agent's name, on the cursor. */
  name: string;
  className?: string;
}

const OUTLINES = 3;
/** How quickly the cursor drifts to where it waits (per ms). */
const DRIFT = 1 / 220;

/** The agent's arrow. */
function Arrow(): ReactNode {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className="block drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]">
      <path d="M3 2.2 L18.4 9.6 L11.3 11.4 L8.2 18.3 Z" fill="var(--color-accent)" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function BuildShowLayer({ show, idle, place, zoom, name, className }: BuildShowLayerProps): ReactNode {
  const cursor = useRef<HTMLDivElement>(null);
  const ripple = useRef<HTMLDivElement>(null);
  const waiting = useRef<HTMLDivElement>(null);
  const outlines = useRef<(HTMLDivElement | null)[]>([]);
  const badges = useRef<(HTMLSpanElement | null)[]>([]);
  const live = useRef({ show, idle, place, zoom });
  live.current = { show, idle, place, zoom };
  /** Where the cursor is drawn, in units; null until it first shows. */
  const at = useRef<BuildPoint | null>(null);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(64, now - last);
      last = now;
      const { show, idle, place, zoom } = live.current;
      const z = zoom();
      const t = show ? now - show.startedAt : 0;
      const running = show !== null && t <= show.plan.end + 400;
      let pressed = false;
      let pressStep = -1;
      let pressAge = Infinity;
      if (running) {
        const c = cursorAt(show.plan, t);
        at.current = { x: c.x, y: c.y };
        pressed = c.pressed;
        if (c.step >= 0) {
          const s = show.plan.steps[c.step]!;
          if (t >= s.at) {
            pressStep = c.step;
            pressAge = t - s.at;
          }
        }
      } else if (idle) {
        const wander = { x: idle.at.x + (Math.sin(now / 900) * 10) / z, y: idle.at.y + (Math.sin(now / 1300 + 1) * 7) / z };
        const from = at.current ?? wander;
        const u = 1 - Math.exp(-dt * DRIFT);
        at.current = { x: from.x + (wander.x - from.x) * u, y: from.y + (wander.y - from.y) * u };
      }
      const shown = running || idle !== null;
      const el = cursor.current;
      if (el) {
        if (at.current) {
          const p = place(at.current);
          el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        }
        el.style.opacity = shown && at.current ? '1' : '0';
        el.dataset.pressed = pressed ? 'true' : 'false';
      }
      const ring = ripple.current;
      if (ring) {
        if (pressStep >= 0 && pressAge < 420 && running) {
          const s = show!.plan.steps[pressStep]!;
          const p = place(s.from);
          const u = pressAge / 420;
          ring.style.opacity = String(0.55 * (1 - u));
          ring.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${0.4 + 1.2 * u})`;
        } else ring.style.opacity = '0';
      }
      const boxes = running ? outlinesAt(show!.plan, t).slice(-OUTLINES) : [];
      for (let i = 0; i < OUTLINES; i++) {
        const box = outlines.current[i];
        const badge = badges.current[i];
        const o = boxes[i];
        if (!box) continue;
        if (!o) {
          box.style.opacity = '0';
          continue;
        }
        const dragged = o.kind === 'box' || o.kind === 'media' || o.kind === 'frame';
        const w = o.rect.w * (dragged ? o.grow : 1);
        const h = o.rect.h * (dragged ? o.grow : 1);
        const tl = place({ x: o.rect.x, y: o.rect.y });
        box.style.opacity = String(o.alpha);
        box.style.transform = `translate(${tl.x}px, ${tl.y}px)`;
        box.style.width = `${Math.max(1, w * z)}px`;
        box.style.height = `${Math.max(1, (o.kind === 'text' ? o.rect.h : h) * z)}px`;
        box.dataset.kind = o.kind;
        if (badge) {
          badge.textContent = dragged && o.grow < 1 ? `${Math.round(w)} × ${Math.round(h)}` : '';
          badge.style.display = badge.textContent ? '' : 'none';
        }
      }
      const wait = waiting.current;
      if (wait) {
        const r = !running ? idle?.rect : undefined;
        if (r) {
          const tl = place({ x: r.x, y: r.y });
          wait.style.display = '';
          wait.style.transform = `translate(${tl.x}px, ${tl.y}px)`;
          wait.style.width = `${r.w * z}px`;
          wait.style.height = `${r.h * z}px`;
        } else wait.style.display = 'none';
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div aria-hidden className={`oa-build-show pointer-events-none absolute inset-0 overflow-visible ${className ?? ''}`}>
      <div ref={waiting} className="oa-build-wait absolute left-0 top-0 rounded-[3px]" style={{ display: 'none' }} />
      {Array.from({ length: OUTLINES }, (_, i) => (
        <div key={i} ref={(el) => void (outlines.current[i] = el)} className="oa-build-outline absolute left-0 top-0" style={{ opacity: 0 }}>
          <span ref={(el) => void (badges.current[i] = el)} className="oa-build-badge" style={{ display: 'none' }} />
        </div>
      ))}
      <div ref={ripple} className="oa-build-ripple absolute left-0 top-0" style={{ opacity: 0 }} />
      <div ref={cursor} className="oa-build-cursor absolute left-0 top-0" style={{ opacity: 0 }}>
        <Arrow />
        <span className="oa-build-name">{name}</span>
      </div>
    </div>
  );
}
