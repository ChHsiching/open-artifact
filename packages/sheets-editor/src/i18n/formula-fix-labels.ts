import type { Dynamic } from '../dynamic.ts';
import { truncateShownValue } from '../messages/formula-writing.ts';
import { translateMessage } from './messages.ts';
import { sheetMessages } from './sheet-messages.ts';
import { errorCountLabel } from './grid-action-labels.ts';
export function shortenedFixValue(shown?: Dynamic) {
  let truncated = truncateShownValue(shown);
  if (truncated === shown || !shown.startsWith('"')) return truncated;
  let inner = truncated.slice(1, -1);
  if (shown === `"${inner}"`) return shown;
  return `"${(/"*$/.exec(inner)?.[0].length ?? 0) % 2 === 1 ? inner.slice(0, -1) : inner}…"`;
}
export function agentFixLabel(formula?: Dynamic, shown?: Dynamic, withKeyHint?: Dynamic) {
  let fix =
    shown === ''
      ? translateMessage(
          {
            defaultMessage: 'Agent’s fix, not kept yet: {formula}',
            id: 'FuxBmMZKKG',
          },
          {
            formula: formula,
          },
        )
      : translateMessage(
          {
            defaultMessage: 'Agent’s fix, not kept yet: {formula}. It comes to {value}',
            id: '9qk6Ixx+Ux',
          },
          {
            formula: formula,
            value: shortenedFixValue(shown),
          },
        );
  if (!withKeyHint) return fix;
  return translateMessage(
    {
      defaultMessage: '{fix}. Press Enter to keep it, or Escape to discard it.',
      id: 'ziEtWxgv8e',
    },
    {
      fix: fix,
    },
  );
}
export function agentWritingFixesText(shownWhere?: Dynamic) {
  switch (shownWhere) {
    case 'inRows':
      return translateMessage({
        defaultMessage: 'Agent is writing fixes for the formulas with errors. In the list, Enter or Escape stops Agent.',
        id: 'usTx7VxuAv',
      });
    case 'elsewhere':
      return translateMessage({
        defaultMessage: 'Agent is writing fixes for the formulas with errors. To stop Agent, press F6 or Shift+F6 until you reach the list.',
        id: '7D5yT0oBz6',
      });
    case 'outsideFrame':
      return translateMessage({
        defaultMessage: 'Agent is writing fixes for the formulas with errors.',
        id: 'jh1v9qBI4A',
      });
  }
}
export function agentWroteFixesText(count?: Dynamic, shownWhere?: Dynamic) {
  switch (shownWhere) {
    case 'inRows':
      return translateMessage(
        {
          defaultMessage:
            '{count, plural, one {Agent wrote # fix, shown on its cell. In the list, Enter keeps it and Escape discards it.} other {Agent wrote # fixes, shown on their cells. In the list, Enter keeps all and Escape discards all.}}',
          id: 'mrRwunjyCl',
        },
        {
          count: count,
        },
      );
    case 'elsewhere':
      return translateMessage(
        {
          defaultMessage:
            '{count, plural, one {Agent wrote # fix, shown on its cell. To keep or discard it, press F6 or Shift+F6 until you reach the list.} other {Agent wrote # fixes, shown on their cells. To keep or discard them, press F6 or Shift+F6 until you reach the list.}}',
          id: 'lbWfdDxRQf',
        },
        {
          count: count,
        },
      );
    case 'outsideFrame':
      return translateMessage(
        {
          defaultMessage: '{count, plural, one {Agent wrote # fix, shown on its cell.} other {Agent wrote # fixes, shown on their cells.}}',
          id: '9ETa7oz3Tx',
        },
        {
          count: count,
        },
      );
  }
}
export function fixFailureText(why?: Dynamic) {
  switch (why) {
    case 'noFormula':
      return translateMessage({
        defaultMessage: 'Agent couldn’t find a fix for this formula',
        id: '5zFNBDvMLg',
      });
    case 'callFailed':
      return translateMessage({
        defaultMessage: 'Couldn’t reach Agent. Try again.',
        id: '8TPAywnuTQ',
      });
    case 'rateLimited':
      return translateMessage({
        defaultMessage: 'Agent is temporarily unavailable. Try again later.',
        id: 'xx9coA5Lgk',
      });
    case 'tooLarge':
      return translateMessage({
        defaultMessage: 'This Sheet is too large for Agent to fix here',
        id: '+zJ7yAP6rl',
      });
    case 'other':
      return translateMessage({
        defaultMessage: 'Agent couldn’t fix this formula',
        id: 'jSpbeA2Xbe',
      });
  }
}
export function fixFailureWithButtonText(why?: Dynamic) {
  return why === 'callFailed'
    ? translateMessage(
        {
          defaultMessage: '{title} {button}',
          id: 'gj/OD+pcj7',
        },
        {
          title: fixFailureText(why),
          button: sheetMessages.askAgentToFix(),
        },
      )
    : translateMessage(
        {
          defaultMessage: '{title}. {button}',
          id: 'AYfC4VSNz5',
        },
        {
          title: fixFailureText(why),
          button: sheetMessages.askAgentToFix(),
        },
      );
}
export const errorsWithFixButtonText = (errors?: Dynamic, button?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: '{errors}. {button}',
      id: 'pHwxuKGCP9',
    },
    {
      errors: errorCountLabel(errors),
      button: button ? sheetMessages.fixErrors() : sheetMessages.askAgentToFix(),
    },
  );
