import { ContextMenu } from '../../kit/context-menu.tsx';
import { Menu } from '../../kit/menu.tsx';
import { AgentMark } from '../../kit/agent-mark.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import {
  handymanReducer,
  HANDYMAN_AT_REST,
  isHandymanEmptyHanded,
  handymanEnterAction,
  handymanSections,
  hasAnswerSettled,
  hasRuleSettled,
} from './handyman-state.ts';
import { commandsOfferedToAgent, commandsNamedByAgent } from '../search-menu/command-groups.ts';
import { RULE_FROM_WORDS_COMMAND, RULE_FROM_WORDS_COMMAND_ID, MAX_COMMANDS_NAMED } from '../commands-from-words.ts';
import { commandsFoundByWords } from '../search-menu/matching.ts';
import { toolSearchMessages } from '../../messages/tool-search-words.ts';
import { joinWithDots, CONDITIONAL_FORMATTING_WORDS, rulesReadyHint } from '../../messages/conditional-format.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { AgentWritingRow } from '../../agent/agent-rows.ts';
import { CommandRows } from '../menu-with-field.ts';
import { RuleOfferMenuItem } from '../../format/conditional/ask-list.ts';
export function useHandyman(
  askForCommands?: Dynamic,
  isMenuOpen?: Dynamic,
  anchor?: Dynamic,
  onRuleAskedInWords?: Dynamic,
  rules?: Dynamic,
) {
  let [state, dispatch] = React.useReducer(handymanReducer, HANDYMAN_AT_REST);
  let abortRef = React.useRef(null);
  let askCountRef = React.useRef(0);
  let [menuSeen, setMenuSeen] = React.useState({
    isMenuOpen: isMenuOpen,
    anchorOfMenu: anchor,
  });
  if (menuSeen.isMenuOpen !== isMenuOpen || menuSeen.anchorOfMenu !== anchor) {
    setMenuSeen({
      isMenuOpen: isMenuOpen,
      anchorOfMenu: anchor,
    });
    dispatch({
      kind: 'stopped',
    });
  }
  let isAsking = state.is === 'asking';
  React.useEffect(() => {
    if (isAsking) return;
    abortRef.current?.abort();
    abortRef.current = null;
  }, [isAsking]);
  React.useEffect(() => () => abortRef.current?.abort(), []);
  let ruleWords = state.is === 'answered' && state.makesRule ? state.words : null;
  React.useEffect(() => {
    if (ruleWords !== null) onRuleAskedInWords(ruleWords);
  }, [ruleWords, onRuleAskedInWords]);
  let isRuleOffered = rules !== null && rules.offer !== null;
  let isRuleNotWritten = rules !== null && !isRuleOffered && rules.agent !== 'writes' && rules.agent !== 'isIdle';
  React.useEffect(() => {
    if (isRuleOffered)
      dispatch({
        kind: 'ruleStands',
        as: {
          is: 'written',
          landedAtMs: nowMs(),
        },
      });
    else
      dispatch({
        kind: 'ruleStands',
        as: {
          is: isRuleNotWritten ? 'notWritten' : 'awaited',
        },
      });
  }, [isRuleOffered, isRuleNotWritten]);
  let isMouseRef = React.useRef(true);
  React.useEffect(() => {
    if (!isMenuOpen) return;
    let onPointerDown = ({ pointerType: pointerType }: Dynamic) => {
      isMouseRef.current = pointerType === 'mouse';
      if (pointerType !== 'mouse')
        dispatch({
          kind: 'pointerMoved',
        });
    };
    (document as Dynamic).addEventListener('pointerdown', onPointerDown, true);
    return () => (document as Dynamic).removeEventListener('pointerdown', onPointerDown, true);
  }, [isMenuOpen]);
  let heedsPointer = state.is !== 'answered' || state.heedsPointer;
  React.useEffect(() => {
    if (heedsPointer) return;
    let firstPoint: Dynamic = null;
    let onPointerMove = ({ clientX: clientX, clientY: clientY, movementX: movementX, movementY: movementY }: Dynamic) => {
      let hasMoved = movementX !== 0 || movementY !== 0 || (firstPoint !== null && (clientX !== firstPoint.x || clientY !== firstPoint.y));
      firstPoint ??= {
        x: clientX,
        y: clientY,
      };
      if (hasMoved)
        dispatch({
          kind: 'pointerMoved',
        });
    };
    (document as Dynamic).addEventListener('pointermove', onPointerMove);
    return () => (document as Dynamic).removeEventListener('pointermove', onPointerMove);
  }, [heedsPointer]);
  return {
    state: state,
    ask(words?: Dynamic, commands?: Dynamic, canMakeRule?: Dynamic) {
      abortRef.current?.abort();
      let { signal: signal } = (abortRef.current = new (AbortController as Dynamic)());
      let ask = (askCountRef.current += 1);
      dispatch({
        kind: 'asked',
        words: words,
        ask: ask,
      });
      let offered = [...commandsOfferedToAgent(commands), ...(canMakeRule ? [RULE_FROM_WORDS_COMMAND] : [])];
      askForCommands(words.trim(), offered, signal).then(
        (answer?: Dynamic) => {
          dispatch({
            kind: 'answered',
            ask: ask,
            atMs: nowMs(),
            isUnderMouse: isMouseRef.current,
            commands: commandsNamedByAgent(commands, answer),
            makesRule: canMakeRule && answer.includes(RULE_FROM_WORDS_COMMAND_ID),
            foundByWords: commandsFoundByWords(commands, words, toolSearchMessages.littleWords(), MAX_COMMANDS_NAMED),
          });
          return;
        },
        () =>
          dispatch({
            kind: 'gaveNoAnswer',
            ask: ask,
          }),
      );
    },
    stop: () =>
      dispatch({
        kind: 'stopped',
      }),
    noteTyped: (input?: Dynamic) =>
      dispatch({
        kind: 'typed',
        typed: input,
      }),
    noteRowTaken: (input?: Dynamic) =>
      dispatch({
        kind: 'rowTaken',
        id: input,
      }),
    noteRuleLetGo: () =>
      dispatch({
        kind: 'ruleLetGo',
      }),
  };
}
export function handymanStatusWords(state?: Dynamic, rules?: Dynamic, commandCountWords?: Dynamic) {
  switch (state.is) {
    case 'resting':
      return null;
    case 'asking':
      return toolSearchMessages.findingTools();
    case 'failed':
      return toolSearchMessages.couldNotSuggest();
    case 'answered': {
      if (isHandymanEmptyHanded(state)) return toolSearchMessages.noTool();
      let parts = state.commands.length > 0 ? [commandCountWords(state.commands.length)] : [];
      return joinWithDots(state.makesRule ? [...parts, handymanRuleWords(state, rules)] : parts);
    }
  }
}
export function handymanRuleWords({ rule: rule }: Dynamic, rules?: Dynamic) {
  if (rule.is === 'notWritten') return CONDITIONAL_FORMATTING_WORDS.rulesNotWritten();
  let offeredCount = rules?.offer?.each.length;
  return rule.is === 'awaited' || offeredCount === undefined ? CONDITIONAL_FORMATTING_WORDS.writingRules() : rulesReadyHint(offeredCount);
}
export function enterOnHandyman(
  { state: state, noteRowTaken: noteRowTaken }: Dynamic,
  takeCommand?: Dynamic,
  keepRule?: Dynamic,
  askAgain?: Dynamic,
) {
  let enterAction = handymanEnterAction(state, handymanSections(state, noteRowTaken), nowMs());
  if (enterAction.does === 'keepRule') keepRule();
  if (enterAction.does === 'askAgain') askAgain();
  if (enterAction.does !== 'take') return enterAction.does === 'finish' ? 'shut' : 'stay';
  takeCommand(enterAction.command, true);
  return enterAction.command.keepsOpen === true ? 'stay' : 'shut';
}
export function MenuFieldFocusKeeper({ isMenuOpen: isMenuOpen }: Dynamic) {
  let markerRef = React.useRef(null);
  let focusedRef = React.useRef(null);
  React.useEffect(() => {
    let menu = markerRef.current?.closest('[role="menu"]');
    let onFocusIn = ({ target: target }: Dynamic) => {
      focusedRef.current = target instanceof Element ? target : null;
    };
    menu?.addEventListener('focusin', onFocusIn);
    return () => menu?.removeEventListener('focusin', onFocusIn);
  }, []);
  React.useLayoutEffect(() => {
    let menu = markerRef.current?.closest('[role="menu"]');
    let doc = menu?.ownerDocument;
    let wasFocusedRemoved = focusedRef.current?.isConnected === false;
    let isFocusLost = doc?.activeElement === null || doc?.activeElement === doc?.body;
    if (isMenuOpen && wasFocusedRemoved && isFocusLost && doc?.hasFocus() === true)
      menu?.querySelector('input')?.focus({
        preventScroll: true,
      });
  });
  return jsx('span', {
    ref: markerRef,
    hidden: true,
  });
}
export function HandymanRows({
  handyman: handyman,
  rules: rules,
  onRuleKept: onRuleKept,
  onRuleStopped: onRuleStopped,
  onAskedAgain: onAskedAgain,
  isPointerCoarse: isPointerCoarse,
  describe: describe,
  hintOf: hintOf,
  onTaken: onTaken,
  wayOnToChat: wayOnToChat,
}: Dynamic) {
  let { state: state } = handyman;
  let sections = handymanSections(state, handyman.noteRowTaken);
  let does = handymanEnterAction(state, sections, Number.POSITIVE_INFINITY).does;
  let askAgainItem = jsx(SuggestToolsItem, {
    isUnderEnter: does === 'askAgain',
    onAsked: onAskedAgain,
  });
  let groupProps = {
    style:
      state.is === 'answered' && !state.heedsPointer
        ? {
            pointerEvents: 'none',
          }
        : undefined,
    onClickCapture(event?: Dynamic) {
      if (hasAnswerSettled(state, nowMs())) return;
      event.preventDefault();
      event.stopPropagation();
    },
  };
  return jsxs(Fragment, {
    children: [
      state.is === 'asking' &&
        jsx(AgentWritingRow, {
          words: {
            writes: toolSearchMessages.findingTools(),
            stop: CONDITIONAL_FORMATTING_WORDS.stop(),
          },
          isAmongRowsOfList: true,
          sizeOfWandInList: HANDYMAN_WAND_SIZE,
          onStopped: handyman.stop,
        }),
      isHandymanEmptyHanded(state) &&
        jsx('div', {
          className: 'px-md py-sm text-footnote text-muted',
          children: state.is === 'failed' ? toolSearchMessages.couldNotSuggest() : toolSearchMessages.noTool(),
        }),
      state.is === 'failed' && askAgainItem,
      sections.map(
        ({ heading: heading, commands: commands }: Dynamic) =>
          jsxs(
            ContextMenu.Group,
            {
              ...groupProps,
              children: [
                heading !== null &&
                  jsx(Menu.GroupLabel, {
                    children: heading,
                  }),
                jsx(CommandRows, {
                  commands: commands,
                  isPointerCoarse: isPointerCoarse,
                  describe: describe,
                  hintOf: hintOf,
                  onTaken: onTaken,
                  isRowUnderEnterLit: true,
                }),
              ],
            },
            heading ?? '',
          ),
      ),
      state.is === 'answered' &&
        state.makesRule &&
        rules !== null &&
        (rules.offer !== null || rules.agent !== 'isIdle') &&
        jsxs(ContextMenu.Group, {
          onClickCapture: (event?: Dynamic) => {
            if (rules.offer === null || hasRuleSettled(state, nowMs())) return;
            event.preventDefault();
            event.stopPropagation();
          },
          children: [
            jsx(Menu.GroupLabel, {
              children: CONDITIONAL_FORMATTING_WORDS.conditionalFormatting(),
            }),
            rules.offer !== null
              ? jsx(RuleOfferMenuItem, {
                  offer: rules.offer,
                  isUnderEnter: does === 'keepRule',
                  onKept: onRuleKept,
                })
              : rules.agent === 'writes'
                ? jsx(AgentWritingRow, {
                    words: {
                      writes: CONDITIONAL_FORMATTING_WORDS.writingRules(),
                      stop: CONDITIONAL_FORMATTING_WORDS.stop(),
                    },
                    isAmongRowsOfList: true,
                    sizeOfWandInList: HANDYMAN_WAND_SIZE,
                    onStopped: onRuleStopped,
                  })
                : jsxs(Fragment, {
                    children: [
                      jsx('div', {
                        className: 'px-md py-sm text-footnote text-muted',
                        children: CONDITIONAL_FORMATTING_WORDS.rulesNotWritten(),
                      }),
                      askAgainItem,
                    ],
                  }),
          ],
        }),
      isHandymanEmptyHanded(state) && wayOnToChat,
    ],
  });
}
export const nowMs = () => performance.now();
export const HANDYMAN_WAND_SIZE = 16;
export const SuggestToolsItem = ({ isUnderEnter: isUnderEnter, onAsked: onAsked }: Dynamic) =>
  jsx(ContextMenu.Item, {
    keepOpen: true,
    icon: jsx(AgentMark, {
      size: HANDYMAN_WAND_SIZE,
    }),
    ...(isUnderEnter && {
      className: 'sheet-row-under-enter',
    }),
    onClick: onAsked,
    children: toolSearchMessages.suggestTools(),
  });
