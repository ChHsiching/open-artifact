import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { WORKING_CARD_SIZE, workingLineAt } from './turn-of-agent.ts';
import { agentBubbleTips, agentIsWorkingText } from '../i18n/agent-turn-labels.ts';
import { useCoarsePointer } from '../app/media-queries.ts';
import { frameSchedulerOf } from '../grid/frame-scheduler.ts';
import { jsx, jsxs } from 'react/jsx-runtime';
export function createSeededRandom(input?: Dynamic) {
  let value: Dynamic = input >>> 0;
  return () => {
    value = (value + 1831565813) >>> 0;
    let value2: Dynamic = Math.imul(value ^ (value >>> 15), value | 1);
    value2 ^= value2 + Math.imul(value2 ^ (value2 >>> 7), value2 | 61);
    return ((value2 ^ (value2 >>> 14)) >>> 0) / 4294967296;
  };
}
export function cursorPositionAt(input?: Dynamic, options?: Dynamic, context?: Dynamic) {
  let { x: value, y: value2 }: Dynamic = input;
  for (let value3 of options as Dynamic) {
    let value4 = (context - value3.t0) / value3.T;
    if (value4 <= 0) continue;
    let value5 = cursorMotionEase(value4);
    value += value3.dx * value5;
    value2 += value3.dy * value5;
    let value6 = Math.hypot(value3.dx, value3.dy);
    if (value6 > 0 && value3.bend !== 0 && value4 < 1) {
      let value7 = (value3.bend * cursorBendEnvelope(value4)) / value6;
      value += -value3.dy * value7;
      value2 += value3.dx * value7;
    }
  }
  return {
    x: value,
    y: value2,
  };
}
export function createCursorMotion(input?: Dynamic, options?: Dynamic, context?: Dynamic, value?: Dynamic, extra?: Dynamic) {
  let value2 = context.x - options.x;
  let value3 = context.y - options.y;
  let value4 = Math.hypot(value2, value3);
  let value5 = input() < 0.75 ? 0.05 + 0.08 * input() : -(0.05 + 0.06 * input());
  let value6 = (input() - 0.5) * 0.1;
  let state = {
    t0: value,
    T: 0.9 + 0.25 * input() + Math.min(0.2, value4 / 600),
    dx: value2 * (1 + value5) - value3 * value6,
    dy: value3 * (1 + value5) + value2 * value6,
    bend: extra * (0.1 + 0.1 * input()) * value4,
  };
  return [
    state,
    {
      t0: value + (0.7 + 0.08 * input()) * state.T,
      T: 0.5 + 0.2 * input(),
      dx: value2 - state.dx,
      dy: value3 - state.dy,
      bend: 0,
    },
  ];
}
export function createCursorIntroPath(input: Dynamic, { rx: rx, ry: ry }: Dynamic, context: Dynamic = false) {
  let value = input() < 0.65 ? 1 : -1;
  let value2 = context
    ? {
        x: 0,
        y: 0,
      }
    : {
        x: (input() - 0.5) * 0.3 * rx,
        y: (input() - 0.3) * 0.4 * ry,
      };
  let value3 = input() < 0.7 ? value : -value;
  let value4 = value3 === value ? 0 : 0.2;
  let state = {
    x: value * (0.72 + 0.2 * input()) * rx,
    y: (0.65 - value4 + 0.3 * input()) * ry,
  };
  if (input() < 0.6)
    return {
      from: state,
      strokes: createCursorMotion(input, state, value2, 0, value3),
      rest: value2,
    };
  let state2 = {
    x: value2.x + value * (0.1 + 0.3 * input()) * rx,
    y: value2.y - (0.4 + 0.4 * input()) * ry,
  };
  let state3 = {
    t0: 0,
    T: 0.85 + 0.2 * input(),
    dx: state2.x - state.x,
    dy: state2.y - state.y,
    bend: value3 * 0.12 * Math.hypot(state2.x - state.x, state2.y - state.y),
  };
  return {
    from: state,
    strokes: [state3, ...createCursorMotion(input, state2, value2, (0.5 + 0.1 * input()) * state3.T, -value3)],
    rest: value2,
  };
}
export function createCursorIdleMotion(
  input: Dynamic,
  options: Dynamic,
  { rx: rx, ry: ry }: Dynamic,
  value?: Dynamic,
  extra: Dynamic = false,
) {
  let value2 = (input2?: Dynamic, options2?: Dynamic) => Math.min(options2, Math.max(-options2, input2));
  let value3: Dynamic = options;
  let value4: Dynamic = -1;
  for (let index: Dynamic = 0; index < 8 && value4 < 30; index++) {
    let value6 = input() * 2 * Math.PI;
    let value7 = 30 + 50 * input();
    let state = {
      x: value2(options.x + value7 * Math.cos(value6), 0.62 * rx),
      y: value2(options.y + 0.6 * value7 * Math.sin(value6), 0.5 * ry),
    };
    let value8 = Math.hypot(state.x - options.x, state.y - options.y);
    if (value8 > value4) {
      value4 = value8;
      value3 = state;
    }
  }
  let value5 = createCursorMotion(input, options, value3, value, input() < 0.5 ? 1 : -1);
  if (!extra)
    return {
      strokes: value5,
      rest: value3,
    };
  return {
    strokes: [...value5, ...createCursorMotion(input, value3, options, cursorMotionEndTime(value5) + 1 + 2 * input(), input() < 0.5 ? 1 : -1)],
    rest: options,
  };
}
export function runAgentCursorMotion(
  view?: Dynamic,
  frames?: Dynamic,
  area?: Dynamic,
  cursorElement?: Dynamic,
  bubbleElement?: Dynamic,
  widthBubbleElement?: Dynamic,
  isReducedMotion?: Dynamic,
) {
  let { clientWidth: areaWidth, clientHeight: areaHeight }: Dynamic = area;
  let { offsetWidth: bubbleWidth }: Dynamic = widthBubbleElement;
  let roamRadii = () => ({
    rx: Math.max(0, (areaWidth - Math.max(WORKING_CARD_SIZE.width, AGENT_CURSOR_BUBBLE_GAP + bubbleWidth) - 2 * AGENT_CURSOR_MARGIN) / 2),
    ry: Math.max(0, (areaHeight - WORKING_CARD_SIZE.height - 2 * AGENT_CURSOR_MARGIN) / 2),
  });
  let random = createSeededRandom(Math.random() * 4294967296);
  let introPath = createCursorIntroPath(random, roamRadii());
  let { from: from, strokes: strokes }: Dynamic = introPath;
  let shownAt: Dynamic = null;
  let velocity: Dynamic = {
    x: 0,
    y: 0,
  };
  let timeSeconds: Dynamic = AGENT_CURSOR_START_TIME;
  let lastFrameMs: Dynamic = null;
  let frameRequest: Dynamic = null;
  let idleTimer: Dynamic;
  let step = (nowMs2?: Dynamic) => {
    let elapsedSeconds = lastFrameMs === null ? 0 : Math.min(0.05, Math.max(0, (nowMs2 - lastFrameMs) / 1000));
    lastFrameMs = nowMs2;
    timeSeconds += elapsedSeconds;
    let { rx: rx, ry: ry } = roamRadii();
    let pathPoint = isReducedMotion ? introPath.rest : cursorPositionAt(from, strokes, timeSeconds);
    let targetX = AGENT_CURSOR_MARGIN + rx + Math.min(rx, Math.max(-rx, pathPoint.x));
    let targetY = AGENT_CURSOR_MARGIN + ry + Math.min(ry, Math.max(-ry, pathPoint.y));
    let shown: Dynamic =
      isReducedMotion || shownAt === null
        ? {
            x: targetX,
            y: targetY,
          }
        : shownAt;
    for (let secondsLeft: Dynamic = elapsedSeconds; secondsLeft > 0; secondsLeft -= AGENT_CURSOR_STEP_SECONDS) {
      let stepSeconds = Math.min(AGENT_CURSOR_STEP_SECONDS, secondsLeft);
      velocity = {
        x: velocity.x + (AGENT_CURSOR_SPRING.stiffness * (targetX - shown.x) - AGENT_CURSOR_SPRING.damping * velocity.x) * stepSeconds,
        y: velocity.y + (AGENT_CURSOR_SPRING.stiffness * (targetY - shown.y) - AGENT_CURSOR_SPRING.damping * velocity.y) * stepSeconds,
      };
      shown = {
        x: shown.x + velocity.x * stepSeconds,
        y: shown.y + velocity.y * stepSeconds,
      };
    }
    let isMoving =
      !isReducedMotion &&
      (timeSeconds < cursorMotionEndTime(strokes) ||
        Math.abs(targetX - shown.x) + Math.abs(targetY - shown.y) > 0.05 ||
        Math.abs(velocity.x) + Math.abs(velocity.y) > 1);
    if (!isMoving) {
      shown = {
        x: targetX,
        y: targetY,
      };
      velocity = {
        x: 0,
        y: 0,
      };
    }
    shownAt = shown;
    placeElementAt(cursorElement, targetX, targetY);
    placeElementAt(bubbleElement, shown.x, shown.y);
    return isMoving;
  };
  let startFrames = () => {
    lastFrameMs = null;
    frameRequest = frames.requestAnimationFrame(onFrame);
  };
  let onFrame = (nowMs2?: Dynamic) => {
    if (step(nowMs2)) {
      frameRequest = frames.requestAnimationFrame(onFrame);
      return;
    }
    frameRequest = null;
    idleTimer = view.setTimeout(
      () => {
        from = cursorPositionAt(from, strokes, timeSeconds);
        ({ strokes: strokes } = createCursorIdleMotion(random, from, roamRadii(), timeSeconds));
        startFrames();
      },
      (AGENT_CURSOR_IDLE_MIN_SECONDS + AGENT_CURSOR_IDLE_SPREAD_SECONDS * random()) * 1000,
    );
  };
  let resizeObserver = new (view.ResizeObserver as Dynamic)(() => {
    ({ clientWidth: areaWidth, clientHeight: areaHeight } = area);
    ({ offsetWidth: bubbleWidth } = widthBubbleElement);
    if (frameRequest !== null) return;
    shownAt = null;
    step(lastFrameMs ?? view.performance.now());
  });
  resizeObserver.observe(area);
  resizeObserver.observe(widthBubbleElement);
  step(view.performance.now());
  if (!isReducedMotion) startFrames();
  return () => {
    if (frameRequest !== null) frames.cancelAnimationFrame(frameRequest);
    view.clearTimeout(idleTimer);
    resizeObserver.disconnect();
  };
}
export function useWorkingLineIndex(lineCount?: Dynamic) {
  let [lineIndex, setLineIndex] = React.useState(0);
  React.useEffect(() => {
    let startMs = performance.now();
    let timer: Dynamic;
    let tick = () => {
      let line = workingLineAt(performance.now() - startMs, lineCount);
      setLineIndex(line.line);
      timer = setTimeout(tick, Math.max(50, line.forMs));
    };
    tick();
    return () => clearTimeout(timer);
  }, [lineCount]);
  return lineIndex;
}
export function AgentAtWork({ style: style }: Dynamic) {
  let areaRef = React.useRef(null);
  let cursorRef = React.useRef(null);
  let bubbleRef = React.useRef(null);
  let widthBubbleRef = React.useRef(null);
  let lines = agentBubbleTips(useCoarsePointer());
  let lineIndex = useWorkingLineIndex(lines.length);
  React.useLayoutEffect(() => {
    let [area, cursor, bubble] = [areaRef.current, cursorRef.current, bubbleRef.current];
    let widthBubble = widthBubbleRef.current;
    let view = area?.ownerDocument.defaultView ?? null;
    let frames = frameSchedulerOf(area);
    if (area === null || cursor === null || bubble === null || widthBubble === null) return;
    if (view === null || frames === null) return;
    let reducedMotionQuery = view.matchMedia('(prefers-reduced-motion:reduce)');
    let stopMotion: Dynamic = runAgentCursorMotion(view, frames, area, cursor, bubble, widthBubble, reducedMotionQuery.matches);
    let restartMotion = () => {
      stopMotion();
      stopMotion = runAgentCursorMotion(view, frames, area, cursor, bubble, widthBubble, reducedMotionQuery.matches);
    };
    reducedMotionQuery.addEventListener('change', restartMotion);
    return () => {
      reducedMotionQuery.removeEventListener('change', restartMotion);
      stopMotion();
    };
  }, []);
  return jsx('div', {
    'aria-hidden': true,
    className: 'sheet-agent-at-work',
    style: style,
    children: jsxs('div', {
      ref: areaRef,
      children: [
        jsx('span', {
          ref: widthBubbleRef,
          className: 'sheet-bubble-of-agent',
          'data-is-for-width': true,
          children: lines.map(
            (line?: Dynamic) =>
              jsx(
                'span',
                {
                  children: line,
                },
                line,
              ),
          ),
        }),
        jsx('span', {
          ref: bubbleRef,
          className: 'sheet-bubble-of-agent',
          children: jsx(AgentWordsCrossfade, {
            words: lines[lineIndex] ?? agentIsWorkingText(),
          }),
        }),
        jsx('svg', {
          ref: cursorRef,
          width: '16',
          height: '16',
          viewBox: '0 0 16 16',
          children: jsx('path', {
            d: 'M1.64838 2.00811C1.39707 1.20393 2.19198 0.468453 2.97425 0.781363L13.5673 5.01857C14.4224 5.36064 14.3996 6.57901 13.5322 6.88879L9.87018 8.19667C9.33014 8.38954 8.89887 8.80494 8.6859 9.33737L7.06512 13.3893C6.71565 14.263 5.46282 14.2143 5.18216 13.3162L1.64838 2.00811Z',
            fill: 'currentColor',
            strokeWidth: '1.2',
            strokeLinejoin: 'round',
          }),
        }),
      ],
    }),
  });
}
export const clampCursorProgress = (input?: Dynamic) => (input < 0 ? 0 : input > 1 ? 1 : input);
export const cursorMotionEase = (input?: Dynamic) => {
  let value = Math.pow(clampCursorProgress(input), 0.86);
  return value * value * value * (10 + value * (6 * value - 15));
};
export const cursorBendEnvelope = (input?: Dynamic) => {
  let value = clampCursorProgress(input) * (1 - clampCursorProgress(input));
  return 16 * value * value;
};
export const cursorMotionEndTime = (input?: Dynamic) =>
  input.reduce((input2?: Dynamic, options?: Dynamic) => Math.max(input2, options.t0 + options.T), 0);
export const AGENT_CURSOR_MARGIN = 8;
export const AGENT_CURSOR_BUBBLE_GAP = 12;
export const AGENT_CURSOR_SPRING = {
  stiffness: 1600,
  damping: 76,
};
export const AGENT_CURSOR_STEP_SECONDS = 0.008;
export const AGENT_CURSOR_IDLE_MIN_SECONDS = 12;
export const AGENT_CURSOR_IDLE_SPREAD_SECONDS = 14;
export const AGENT_CURSOR_START_TIME = 0.18;
export const placeElementAt = (element?: Dynamic, x?: Dynamic, y?: Dynamic) => {
  element.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`;
};
export const AgentWordsCrossfade = React.memo(function ({ words: words }: Dynamic) {
  let [pair, setPair] = React.useState({
    first: words,
    second: '',
    isFirstShown: true,
  });
  let [measured, setMeasured] = React.useState(null);
  let measureRef = React.useRef(null);
  if ((pair.isFirstShown ? pair.first : pair.second) !== words)
    setPair(
      pair.isFirstShown
        ? {
            ...pair,
            second: words,
            isFirstShown: false,
          }
        : {
            ...pair,
            first: words,
            isFirstShown: true,
          },
    );
  let measureWidth = React.useCallback(() => {
    let width = (measureRef.current?.offsetWidth ?? 0) + 1;
    if (width === 1) return;
    setMeasured(
      (previous?: Dynamic) =>
        previous?.width === width
          ? previous
          : {
              width: width,
              isNarrower: previous !== null && width < previous.width,
            },
    );
  }, []);
  React.useLayoutEffect(measureWidth);
  React.useEffect(() => {
    let element = measureRef.current;
    let view = element?.ownerDocument.defaultView ?? null;
    if (element === null || view === null) return;
    let resizeObserver = new (view.ResizeObserver as Dynamic)(measureWidth);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [measureWidth]);
  return jsxs('span', {
    className: 'sheet-words-of-agent',
    'data-is-narrower': measured?.isNarrower === true,
    style: {
      width: measured?.width,
    },
    children: [
      jsx('span', {
        ref: measureRef,
        children: words,
      }),
      jsx('span', {
        'data-is-shown': pair.isFirstShown,
        children: pair.first,
      }),
      jsx('span', {
        'data-is-shown': !pair.isFirstShown,
        children: pair.second,
      }),
    ],
  });
});
