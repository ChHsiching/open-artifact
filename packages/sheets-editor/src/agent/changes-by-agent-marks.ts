import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx } from 'react/jsx-runtime';
import { AGENT_CHANGE_FADE_MS } from './changes-by-agent.ts';
import { agentFlagName } from '../i18n/menu-labels.ts';
export function useSheenDelayStyle(sweeps?: Dynamic) {
  let [sheen, setSheen] = React.useState(
    () => ({
      sweeps: sweeps,
      delayMs: sheenDelayMs(),
    }),
  );
  if (sheen.sweeps !== sweeps)
    setSheen({
      sweeps: sweeps,
      delayMs: sheenDelayMs(),
    });
  return sweeps
    ? {
        '--sheet-sheen-delay': `${sheen.delayMs}ms`,
      }
    : {};
}
export function ChangeByAgentMark({ keyOfMark: keyOfMark, place: place, isHidden = false, ...outlineProps }: Dynamic) {
  return jsx('div', {
    'aria-hidden': true,
    className: 'sheet-room-of-change-by-agent',
    'data-mark': keyOfMark,
    'data-is-hidden': isHidden || undefined,
    style: place,
    children: jsx(
      ChangeByAgentOutline,
      {
        ...outlineProps,
      },
      outlineProps.fadeBeginsAtMs,
    ),
  });
}
export function ChangeByAgentOutline(props?: Dynamic) {
  let { fadeBeginsAtMs: fadeBeginsAtMs, nameStands: nameStands, isWithoutSheen = false } = props;
  let [fadeDelayMs] = React.useState(() => (fadeBeginsAtMs === null ? null : fadeBeginsAtMs - performance.now()));
  let fadeStyle =
    fadeDelayMs === null
      ? {
          animationName: 'none',
        }
      : {
          animationDuration: `${AGENT_CHANGE_FADE_MS}ms`,
          animationDelay: `${fadeDelayMs}ms`,
        };
  let outlineStyle = {
    ...useSheenDelayStyle(fadeBeginsAtMs === null),
    ...fadeStyle,
  };
  if (nameStands === undefined)
    return jsx('div', {
      className: 'sheet-outline-of-other sheet-change-by-agent',
      'data-has-sheen': (fadeBeginsAtMs === null && !isWithoutSheen) || undefined,
      style: outlineStyle,
    });
  return jsx('div', {
    className: 'sheet-name-flags-of-others sheet-change-by-agent',
    'data-stands': nameStands,
    style: fadeStyle,
    children: jsx('div', {
      children: jsx('span', {
        children: jsx('bdi', {
          children: agentFlagName(),
        }),
      }),
    }),
  });
}
export const SHEEN_PERIOD_MS = 2000;
export const sheenDelayMs = () => -(performance.now() % SHEEN_PERIOD_MS);
