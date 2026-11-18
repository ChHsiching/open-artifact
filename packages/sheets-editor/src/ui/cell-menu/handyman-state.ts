import type { Dynamic } from '../../dynamic.ts';
import { groupCommandsByHeading } from '../search-menu/command-groups.ts';
import { commandToRunForQuery } from '../search-menu/matching.ts';
export function withCommandsOfNow(handyman?: Dynamic, commands?: Dynamic, whyNotOf?: Dynamic) {
  if (handyman.is !== 'answered') return handyman;
  let commandById = new (Map as Dynamic)(commands.map((input?: Dynamic) => [input.id, input]));
  let withCurrent = (input?: Dynamic) =>
    input.map(
      (input2?: Dynamic) =>
        commandById.get(input2.id) ?? {
          ...input2,
          whyNot: whyNotOf(input2.label),
          ...(input2.isTicked !== undefined && {
            isTicked: false,
          }),
        },
    );
  return {
    ...handyman,
    commands: withCurrent(handyman.commands),
    foundByWords: withCurrent(handyman.foundByWords),
  };
}
export function handymanReducer(state?: Dynamic, action?: Dynamic) {
  switch (action.kind) {
    case 'asked':
      return {
        is: 'asking',
        words: action.words.trim(),
        ask: action.ask,
      };
    case 'answered': {
      if (state.is !== 'asking' || state.ask !== action.ask) return state;
      let { commands: value, makesRule: makesRule, foundByWords: foundByWords, atMs: atMs, isUnderMouse: isUnderMouse } = action;
      return {
        is: 'answered',
        words: state.words,
        commands: value,
        makesRule: makesRule,
        foundByWords: foundByWords,
        landedAtMs: atMs,
        heedsPointer: !isUnderMouse,
        taken: new (Set as Dynamic)(),
        rule: {
          is: 'awaited',
        },
      };
    }
    case 'gaveNoAnswer':
      return state.is === 'asking' && state.ask === action.ask
        ? {
            is: 'failed',
            words: state.words,
          }
        : state;
    case 'stopped':
      return HANDYMAN_AT_REST;
    case 'typed':
      return state.is === 'resting' || state.words === action.typed.trim() ? state : HANDYMAN_AT_REST;
    case 'pointerMoved':
      return state.is === 'answered' && !state.heedsPointer
        ? {
            ...state,
            heedsPointer: true,
          }
        : state;
    case 'ruleStands':
      return state.is === 'answered' && state.makesRule
        ? {
            ...state,
            rule: action.as,
          }
        : state;
    case 'ruleLetGo':
      if (state.is !== 'answered' || !state.makesRule) return state;
      return state.commands.length === 0
        ? HANDYMAN_AT_REST
        : {
            ...state,
            makesRule: false,
            rule: {
              is: 'awaited',
            },
          };
    case 'rowTaken': {
      if (state.is !== 'answered') return state;
      let matches = [...state.taken].filter((input?: Dynamic) => commandFamilyId(input) !== commandFamilyId(action.id));
      return {
        ...state,
        taken: new (Set as Dynamic)([...matches, action.id]),
      };
    }
  }
}
export function handymanSections(handyman?: Dynamic, onRowTaken?: Dynamic) {
  let sections = handymanCommandGroups(handyman, onRowTaken);
  let enterAction = handymanEnterAction(handyman, sections, Number.POSITIVE_INFINITY);
  if (enterAction.does !== 'take') return sections;
  return sections.map(
    ({ heading: heading, commands: commands }: Dynamic) => ({
      heading: heading,
      commands: commands.map(
        (input?: Dynamic) =>
          input === enterAction.command
            ? Object.assign({}, input, {
                isUnderEnter: true,
              })
            : input,
      ),
    }),
  );
}
export function handymanCommandGroups(handyman?: Dynamic, onRowTaken?: Dynamic) {
  if (handyman.is !== 'answered') return [];
  if (isHandymanEmptyHanded(handyman)) return groupCommandsByHeading(handyman.foundByWords);
  if (!doesHandymanAnswerSeveral(handyman)) return groupCommandsByHeading(handyman.commands);
  return groupCommandsByHeading(
    handyman.commands.map(
      (input?: Dynamic) =>
        KEEPS_MENU_OPEN_COMMAND_PATTERNS.some((input2?: Dynamic) => input2.test(input.id))
          ? Object.assign({}, input, {
              keepsOpen: true,
              ...(!DECIMAL_PLACES_COMMAND_PATTERN.test(input.id) && {
                isTicked: isHandymanCommandTicked(handyman, input),
              }),
              run() {
                if (isHandymanCommandTicked(handyman, input)) return;
                onRowTaken(input.id);
                input.run();
              },
            })
          : input,
    ),
  );
}
export function handymanEnterAction(handyman?: Dynamic, sections?: Dynamic, nowMs2?: Dynamic) {
  if (handyman.is === 'failed')
    return {
      does: 'askAgain',
    };
  if (handyman.is !== 'answered' || !hasAnswerSettled(handyman, nowMs2))
    return {
      does: 'nothing',
    };
  if (isHandymanEmptyHanded(handyman))
    return {
      does: 'nothing',
    };
  let commands = sections.flatMap(({ commands: commands2 }: Dynamic) => commands2);
  let takenFamilies = new (Set as Dynamic)([...handyman.taken].map(commandFamilyId));
  let isOfSeveral = doesHandymanAnswerSeveral(handyman);
  let takeable = commands.filter(
    ({ id: id, isTicked: isTicked, whyNot: whyNot }: Dynamic) =>
      whyNot === null && !takenFamilies.has(commandFamilyId(id)) && !(isOfSeveral && isTicked === true),
  );
  if (takeable.length === 0 && shouldAskHandymanAgain(handyman))
    return {
      does: 'askAgain',
    };
  if (takeable.length === 0 && handyman.makesRule)
    return {
      does: hasRuleSettled(handyman, nowMs2) ? 'keepRule' : 'nothing',
    };
  if (takeable.length === 0 && commands.length > 0)
    return {
      does: handyman.taken.size > 0 ? 'finish' : 'nothing',
    };
  let command = commandToRunForQuery(takeable, null);
  return command === null
    ? {
        does: 'nothing',
      }
    : {
        does: 'take',
        command: command,
      };
}
export const ANSWER_SETTLE_MS = 540;
export const ENTER_MEANING_GRACE_MS = 300;
export const HANDYMAN_AT_REST = {
  is: 'resting',
};
export const commandFamilyId = (id?: Dynamic) => {
  let parts = id.split('.');
  return parts.length > 2 ? parts.slice(0, -1).join('.') : id;
};
export const KEEPS_MENU_OPEN_COMMAND_PATTERNS = [
  /^(menu|bar)\.(bold|italic|underline|strikethrough)$/,
  /^bar\.(wrapText|showGridlines|moreDecimalPlaces|fewerDecimalPlaces)$/,
  /^bar\.(align|alignVertically|fontSize|textColor|fillColor|borders)\./,
  /^bar\.numberFormat\.(?!customFormat$)/,
];
export const DECIMAL_PLACES_COMMAND_PATTERN = /^bar\.(more|fewer)DecimalPlaces$/;
export const isHandymanCommandTicked = (handyman: Dynamic, { id: id, isTicked: isTicked }: Dynamic) =>
  !DECIMAL_PLACES_COMMAND_PATTERN.test(id) && (isTicked === true || handyman.taken.has(id));
export const isHandymanEmptyHanded = (input?: Dynamic) =>
  input.is === 'failed' || (input.is === 'answered' && input.commands.length === 0 && !input.makesRule);
export const doesHandymanAnswerSeveral = (input?: Dynamic) =>
  input.is === 'answered' &&
  new (Set as Dynamic)(input.commands.map(({ id: id }: Dynamic) => commandFamilyId(id))).size + (input.makesRule ? 1 : 0) > 1;
export const hasAnswerSettled = (handyman?: Dynamic, nowMs2?: Dynamic) =>
  handyman.is !== 'answered' || nowMs2 - handyman.landedAtMs >= ANSWER_SETTLE_MS;
export const hasRuleSettled = (handyman?: Dynamic, nowMs2?: Dynamic) =>
  handyman.is === 'answered' && handyman.rule.is === 'written' && nowMs2 - handyman.rule.landedAtMs >= ANSWER_SETTLE_MS;
export const shouldAskHandymanAgain = (input?: Dynamic) =>
  input.is === 'failed' || (input.is === 'answered' && input.makesRule && input.rule.is === 'notWritten');
export const isCommandAskedAgain = (asked: Dynamic, { commandId: commandId, label: label, words: words }: Dynamic) =>
  asked?.commandId === commandId && asked.label === label && asked.words === words;
export const enterOnTypedCommand = (asked?: Dynamic, entered?: Dynamic, isMeaningSettled?: Dynamic) => {
  if (entered.isWeighty && !entered.isItsLabelAlone && !isCommandAskedAgain(asked, entered)) return 'asks';
  return isMeaningSettled ? 'takes' : 'drops';
};
export const doesKeyDropAskedAgain = (key?: Dynamic, isRepeat?: Dynamic) =>
  key !== 'Enter' && !isRepeat && !/^(Shift|Control|Alt|Meta)$/.test(key);
export const NO_ENTER_MEANING = {
  kind: 'none',
  sinceMs: Number.NEGATIVE_INFINITY,
  inPlaceOf: 'none',
};
export const nextEnterMeaning = (meaning?: Dynamic, kind?: Dynamic, nowMs2?: Dynamic) => {
  if (meaning.kind === kind) return meaning;
  let followsAsk = meaning.kind === 'none' && meaning.inPlaceOf === 'ask' && nowMs2 - meaning.sinceMs < ENTER_MEANING_GRACE_MS;
  return {
    kind: kind,
    sinceMs: nowMs2,
    inPlaceOf: followsAsk ? 'ask' : meaning.kind,
  };
};
export const isEnterMeaningSettled = ({ kind: kind, sinceMs: sinceMs, inPlaceOf: inPlaceOf }: Dynamic, nowMs2?: Dynamic) =>
  kind !== 'command' || inPlaceOf !== 'ask' || nowMs2 - sinceMs >= ENTER_MEANING_GRACE_MS;
