/**
 * The chart frame: a sandboxed document that draws one chart. The page hands it a port; the chart's code runs in a
 * worker the frame starts, and the frame draws what the worker sends. The pointer's moves and presses come from the
 * page, since nothing in the frame takes them itself.
 */
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { TooltipGroup } from '../kit/tooltip.tsx';
import { CHART_FRAME_PORT_MESSAGE, type ChartFrameFault } from '../charts/frame-messages.ts';
import { VIEWER_FONT_ATTRIBUTE } from '../shell/root-theme.ts';
import { startWorkerHost } from './worker-host.ts';
import { WORKER_SCRIPT_ID, type ChartInputs, type ChartLook, type FrameToPage, type PageToFrame, type PointAt } from './messages.ts';
import './frame.css';

class FailsOnThrow extends React.Component<{ onThrown: () => void; children: React.ReactNode }, { hasThrown: boolean }> {
  override state = { hasThrown: false };
  static getDerivedStateFromError(): { hasThrown: boolean } {
    return { hasThrown: true };
  }
  override componentDidCatch(): void {
    this.props.onThrown();
  }
  override render(): React.ReactNode {
    return this.state.hasThrown ? null : this.props.children;
  }
}

interface HeldDrawing {
  read: () => { drawn: React.ReactNode } | null;
  subscribe: (listener: () => void) => () => void;
}

function Drawing({ held, onShown }: { held: HeldDrawing; onShown: () => void }): React.ReactNode {
  const now = React.useSyncExternalStore(held.subscribe, held.read, held.read);
  React.useEffect(() => {
    if (now !== null) onShown();
  }, [now, onShown]);
  return now?.drawn;
}

interface DrawnChart {
  inputsAre: (inputs: ChartInputs) => void;
  clear: () => void;
}

function drawChart(
  code: { artifact: string; scriptOfWorker: string },
  inputs: ChartInputs,
  container: HTMLElement,
  tell: { drawn: () => void; failed: (fault: ChartFrameFault) => void },
): DrawnChart | null {
  let latest: { drawn: React.ReactNode } | null = null;
  const listeners = new Set<() => void>();
  const host = startWorkerHost(code, {
    drawing(drawn) {
      latest = { drawn };
      for (const listener of listeners) listener();
    },
    failed: tell.failed,
  });
  if (host === null) return null;
  let hasToldDrawn = false;
  const onShown = (): void => {
    container.getBoundingClientRect();
    host.shown();
    if (!hasToldDrawn) tell.drawn();
    hasToldDrawn = true;
  };
  const held: HeldDrawing = {
    read: () => latest,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  const root = createRoot(container);
  root.render(
    <FailsOnThrow onThrown={() => tell.failed('threw')}>
      <TooltipGroup delay={0}>
        <div className="chart-root">
          <Drawing held={held} onShown={onShown} />
        </div>
      </TooltipGroup>
    </FailsOnThrow>,
  );
  const sayTheSize = (): void => host.say({ kind: 'size', size: { width: window.innerWidth, height: window.innerHeight } });
  window.addEventListener('resize', sayTheSize);
  sayTheSize();
  host.say({ kind: 'inputs', inputs });
  return {
    inputsAre: (next) => host.say({ kind: 'inputs', inputs: next }),
    clear() {
      window.removeEventListener('resize', sayTheSize);
      host.end();
      root.unmount();
    },
  };
}

function applyLook({ theme, viewerFont }: ChartLook): void {
  const root = document.documentElement;
  for (const [name, value] of [
    ['data-mode', theme],
    [VIEWER_FONT_ATTRIBUTE, viewerFont],
  ] as const)
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
}

const withAncestors = (element: Element | null): Element[] => (element === null ? [] : [element, ...withAncestors(element.parentElement)]);
const TAKES_ITS_OWN_PRESS = 'a, area, input, select, textarea, label, summary, [aria-haspopup]';

/** Plays the page's pointer in the frame: what it is over hears the events of a mouse moving and pressing there. */
function relayPointer(): { isAt: (at: PointAt | null) => void; hasPressedAt: (at: PointAt) => void } {
  let over: Element | null = null;
  const isAt = (at: PointAt | null): void => {
    const under = at === null ? null : document.elementFromPoint(at.x, at.y);
    const tell = (target: Element, what: string, bubbles: boolean, related: Element | null): void => {
      const init: MouseEventInit = { clientX: at?.x ?? 0, clientY: at?.y ?? 0, view: window, relatedTarget: related, bubbles, cancelable: bubbles, composed: true };
      target.dispatchEvent(new PointerEvent(`pointer${what}`, { ...init, pointerType: 'mouse', isPrimary: true }));
      target.dispatchEvent(new MouseEvent(`mouse${what}`, init));
    };
    if (under !== over) {
      const [left, entered] = [withAncestors(over), withAncestors(under)];
      if (over !== null) tell(over, 'out', true, under);
      for (const element of left) if (!entered.includes(element)) tell(element, 'leave', false, under);
      if (under !== null) tell(under, 'over', true, over);
      for (const element of [...entered].reverse()) if (!left.includes(element)) tell(element, 'enter', false, over);
      over = under;
    }
    if (under !== null) tell(under, 'move', true, null);
  };
  return {
    isAt,
    hasPressedAt(at) {
      isAt(at);
      if (over === null || over.closest(TAKES_ITS_OWN_PRESS) !== null) return;
      const init = { clientX: at.x, clientY: at.y, view: window, bubbles: true, cancelable: true };
      over.dispatchEvent(new PointerEvent('click', { ...init, composed: true, detail: 1, pointerType: 'mouse', isPrimary: true }));
      flushSync(() => {});
      isAt(null);
      isAt(at);
    },
  };
}

function listenToPage(port: MessagePort): void {
  const answer = (message: FrameToPage): void => port.postMessage(message);
  const leave = location.replace.bind(location, 'about:blank');
  let [hasBegun, hasFailed] = [false, false];
  let chart: DrawnChart | null = null;
  const fail = (fault: ChartFrameFault): void => {
    if (hasFailed) return;
    hasFailed = true;
    answer({ kind: 'failed', fault });
    chart?.clear();
  };
  window.addEventListener('error', ({ error }: ErrorEvent) => {
    if (error !== null && error !== undefined) fail('threw');
  });
  window.addEventListener('unhandledrejection', () => fail('threw'));
  window.addEventListener('focus', () => fail('tookCaret'), { capture: true });
  window.addEventListener('click', (event) => event.preventDefault(), { capture: true });
  const pointer = relayPointer();
  document.documentElement.dataset.density = 'compact';
  const container = document.getElementById('chart');
  const scriptOfWorker = document.getElementById(WORKER_SCRIPT_ID)?.textContent ?? undefined;
  port.addEventListener('message', ({ data }: MessageEvent<PageToFrame>) => {
    switch (data.kind) {
      case 'draw': {
        if (hasBegun || hasFailed || container === null) return;
        hasBegun = true;
        if (scriptOfWorker === undefined) return fail('threw');
        applyLook(data.look);
        chart = drawChart({ artifact: data.artifact, scriptOfWorker }, data.inputs, container, {
          drawn: () => void (hasFailed || answer({ kind: 'drawn' })),
          failed: fail,
        });
        return;
      }
      case 'inputsChanged':
        chart?.inputsAre(data.inputs);
        return;
      case 'lookChanged':
        applyLook(data.look);
        return;
      case 'pointerAt':
        pointer.isAt(data.at);
        return;
      case 'pressedAt':
        pointer.hasPressedAt(data.at);
        return;
      case 'leave':
        leave();
    }
  });
  port.start();
}

const takePort = ({ source, data, ports: [port] }: MessageEvent<unknown>): void => {
  if (source !== window.parent || data !== CHART_FRAME_PORT_MESSAGE || port === undefined) return;
  window.removeEventListener('message', takePort);
  listenToPage(port);
};

if (window.origin === 'null') window.addEventListener('message', takePort);
