import { Tooltip, TooltipGroup } from '../kit/tooltip.tsx';
import { Icon } from '../kit/icon.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { ROW_HEADER_WIDTH } from './cell-metrics-values.ts';
import { cellPaddingBeside } from './cell-metrics.ts';
import { OUTLINE_LANE_SIZE, OUTLINE_MARK_SIZE } from './outline-groups.ts';
import { jsx, jsxs } from 'react/jsx-runtime';
import { lineGroupsLabel, showToLevelLabel, toggleGroupLabel } from '../messages/line-groups.ts';
import { zoomedStyle } from './zoom.ts';
import { preventMouseDownDefault } from '../ui/dom-events.ts';
export const groupLevelCount = (groups?: Dynamic) => groups?.size ?? 0;
export const groupMarginRoomStyle = ({ rows: rows, columns: columns }: Dynamic, zoom?: Dynamic) => ({
  '--sheet-room-for-row-groups': `${groupLevelCount(rows) * zoom}px`,
  '--sheet-room-for-column-groups': `${groupLevelCount(columns) * zoom}px`,
});
export const gridHeaderRoomStyle = (rowGroupsRoom?: Dynamic, zoom?: Dynamic, density?: Dynamic) => ({
  '--sheet-room-for-row-groups': `${rowGroupsRoom * zoom}px`,
  '--sheet-row-numbers-width': `${ROW_HEADER_WIDTH * zoom}px`,
  '--sheet-clear-before-text-of-cell': `${cellPaddingBeside(density) * zoom}px`,
});
export const groupMarginPosition = (of?: Dynamic, along?: Dynamic, across?: Dynamic) =>
  of === 'rows'
    ? {
        top: along,
        left: across,
      }
    : {
        left: along,
        top: across,
      };
export const groupLaneCenter = (lane?: Dynamic) => (lane + 0.5) * OUTLINE_LANE_SIZE;
export const GROUP_MARK_HALF_SIZE = OUTLINE_MARK_SIZE / 2;
export const groupBracketStart = ({ start: start, startsBeforeMark: startsBeforeMark }: Dynamic) =>
  startsBeforeMark ? start : start + GROUP_MARK_HALF_SIZE;
export const groupBracketEnd = ({ end: end, endsInView: endsInView }: Dynamic) => (endsInView ? end - 1 : end);
export const isSameMarginGroup = (group?: Dynamic, previous?: Dynamic) =>
  previous !== undefined &&
  group.key === previous.key &&
  group.groupIds.length === previous.groupIds.length &&
  group.lane === previous.lane &&
  group.isCollapsed === previous.isCollapsed &&
  group.markAt === previous.markAt &&
  group.first === previous.first &&
  group.last === previous.last &&
  group.line?.start === previous.line?.start &&
  group.line?.end === previous.line?.end &&
  group.line?.endsInView === previous.line?.endsInView &&
  group.line?.startsBeforeMark === previous.line?.startsBeforeMark;
export const areGroupMarginPropsEqual = (props?: Dynamic, previousProps?: Dynamic) =>
  props.zoom === previousProps.zoom &&
  props.ref === previousProps.ref &&
  props.onMarkPressed === previousProps.onMarkPressed &&
  props.onLevelChosen === previousProps.onLevelChosen &&
  props.margin.levelCount === previousProps.margin.levelCount &&
  props.margin.hasLevelButtons === previousProps.margin.hasLevelButtons &&
  props.margin.groups.length === previousProps.margin.groups.length &&
  props.margin.groups.every((group?: Dynamic, index?: Dynamic) => isSameMarginGroup(group, previousProps.margin.groups[index]));
export const GroupMargin = React.memo(function ({
  ref: ref,
  margin: margin,
  zoom: zoom,
  onMarkPressed: onMarkPressed,
  onLevelChosen: onLevelChosen,
}: Dynamic) {
  let { of: of, beforeBody: beforeBody, levelCount: levelCount, hasLevelButtons: hasLevelButtons, groups: groups } = margin;
  let tooltipSide = of === 'rows' ? 'right' : 'bottom';
  return jsx('fieldset', {
    ref: ref,
    'aria-label': lineGroupsLabel(of),
    className: 'sheet-group-margin',
    'data-of': of,
    children: jsx('div', {
      role: 'presentation',
      className: 'sheet-group-margin-zoomed',
      style: zoomedStyle(zoom),
      children: jsxs(TooltipGroup, {
        children: [
          jsx('div', {
            role: 'presentation',
            className: 'sheet-group-levels',
            style:
              of === 'rows'
                ? {
                    height: beforeBody,
                  }
                : {
                    width: beforeBody,
                  },
            children: Array.from<Dynamic, Dynamic>(
              {
                length: hasLevelButtons ? levelCount : 0,
              },
              (input?: Dynamic, index?: Dynamic) => index + 1,
            ).map(
              (level?: Dynamic) =>
                jsx(
                  Tooltip,
                  {
                    content: showToLevelLabel(of, level),
                    side: tooltipSide,
                    children: jsx('button', {
                      type: 'button',
                      tabIndex: -1,
                      className: 'sheet-group-level',
                      'aria-label': showToLevelLabel(of, level),
                      onMouseDown: preventMouseDownDefault,
                      onClick: () => onLevelChosen(of, level),
                      children: level,
                    }),
                  },
                  level,
                ),
            ),
          }),
          jsxs('div', {
            role: 'presentation',
            className: 'sheet-group-lanes',
            style:
              of === 'rows'
                ? {
                    top: beforeBody,
                  }
                : {
                    left: beforeBody,
                  },
            children: [
              groups.map(
                ({ key: key, lane: lane, line: line }: Dynamic) =>
                  line !== null &&
                  groupBracketEnd(line) > groupBracketStart(line) &&
                  jsx(
                    'div',
                    {
                      'aria-hidden': true,
                      className: 'sheet-group-bracket',
                      'data-ends-in-view': line.endsInView || undefined,
                      'data-starts-before-mark': line.startsBeforeMark || undefined,
                      style: {
                        ...groupMarginPosition(of, groupBracketStart(line), groupLaneCenter(lane)),
                        [of === 'rows' ? 'height' : 'width']: groupBracketEnd(line) - groupBracketStart(line),
                      },
                    },
                    key,
                  ),
              ),
              groups.map((group?: Dynamic) => {
                let label = toggleGroupLabel(
                  {
                    of: of,
                    ...group,
                  },
                  group.isCollapsed,
                );
                return jsx(
                  Tooltip,
                  {
                    content: label,
                    side: tooltipSide,
                    children: jsx('button', {
                      type: 'button',
                      tabIndex: -1,
                      className: 'sheet-group-mark',
                      'aria-label': label,
                      'aria-expanded': !group.isCollapsed,
                      style: groupMarginPosition(of, group.markAt, groupLaneCenter(group.lane)),
                      onMouseDown: preventMouseDownDefault,
                      onClick: () => onMarkPressed(of, group),
                      children: jsx(Icon, {
                        name: group.isCollapsed ? 'Add' : 'Minus',
                        size: 'xs',
                      }),
                    }),
                  },
                  group.key,
                );
              }),
            ],
          }),
        ],
      }),
    }),
  });
}, areGroupMarginPropsEqual);
