import { AgentMark } from '../kit/agent-mark.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { useFollowed } from '../state/followed-values.ts';
import { jsx } from 'react/jsx-runtime';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { isWithinClickAfterUp, isWithinPressGuard } from './list-under-cell.ts';
export function usePressGuard() {
  let mountedAtRef = React.useRef(0);
  React.useLayoutEffect(() => {
    mountedAtRef.current = performance.now();
  }, []);
  let downAtRef = React.useRef(null);
  return {
    noteDown: () => {
      downAtRef.current = performance.now();
    },
    isTaken: () => {
      let isTaken = isPressTaken(mountedAtRef.current, downAtRef.current, performance.now());
      downAtRef.current = null;
      return isTaken;
    },
  };
}
export function AskAgentToFixButton({ agent: agent, onPress: onPress }: Dynamic) {
  let fixState = useFollowed(agent);
  let pressGuard = usePressGuard();
  if (fixState === 'notOffered') return null;
  let isUsable = fixState === 'inUse' || fixState === 'fixesHere';
  return jsx(Button, {
    variant: 'secondary',
    size: 'sm',
    icon: jsx(AgentMark, {
      size: 14,
      ...(!isUsable && {
        color: 'currentColor',
      }),
    }),
    'aria-disabled': !isUsable,
    className: isUsable ? '' : 'opacity-disabled',
    onPointerDown: pressGuard.noteDown,
    onClick: () => {
      if (pressGuard.isTaken() && isUsable) onPress(fixState === 'fixesHere');
    },
    children: fixState === 'fixesHere' || fixState === 'fixesHereOutOfUse' ? sheetMessages.fixErrors() : sheetMessages.askAgentToFix(),
  });
}
export const agentFixStateOf = (source?: Dynamic, isAvailable?: Dynamic, fixesHere: Dynamic = 'no') => {
  if (fixesHere !== 'no') return fixesHere === 'now' ? 'fixesHere' : 'fixesHereOutOfUse';
  return source === null ? 'notOffered' : isAvailable ? 'inUse' : 'outOfUse';
};
export const isPressTaken = (mountedAtMs?: Dynamic, downAtMs?: Dynamic, nowMs2?: Dynamic) =>
  downAtMs === null || !isWithinClickAfterUp(downAtMs, nowMs2) || !isWithinPressGuard(mountedAtMs, downAtMs);
