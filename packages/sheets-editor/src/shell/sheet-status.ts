import type { ConnectionProblem } from './connection-news.ts';
import type { Dynamic } from '../dynamic.ts';
import { translateMessage } from '../i18n/messages.ts';
export function connectionEndText(reason?: Dynamic) {
  switch (reason.kind) {
    case 'notInsideHost':
      return translateMessage({
        defaultMessage: 'Open this Sheet in the host.',
        id: 'n3KQNIsAs3',
      });
    case 'couldNotConnect':
      return translateMessage({
        defaultMessage: 'Couldn’t connect. Reload the page to try again.',
        id: 'VJLEbtJowZ',
      });
    case 'closedByShell':
      if (reason.shellReason.toLowerCase() === 'revoked')
        return translateMessage({
          defaultMessage: 'You no longer have access to this Sheet.',
          id: 'bygWrKntDk',
        });
      if (reason.shellReason.toLowerCase() === 'not_enabled')
        return translateMessage({
          defaultMessage: 'Sheet storage isn’t turned on for you yet. If you think it is, reload the page.',
          id: 'WKgGAadJH1',
        });
      return translateMessage(
        {
          defaultMessage: 'The connection was closed ({reason}). Reload the page to try again.',
          id: 'mA4Y/NaSoZ',
        },
        {
          reason: reason.shellReason,
        },
      );
    case 'closedByPage':
      return translateMessage({
        defaultMessage: 'Closed.',
        id: 'bx/r7vzAJ1',
      });
  }
}
export function connectionStateText(connection?: Dynamic) {
  switch (connection.kind) {
    case 'connecting':
      return translateMessage({
        defaultMessage: 'Connecting…',
        id: '/7ryJwLz1K',
      });
    case 'open':
      return translateMessage({
        defaultMessage: 'Connected.',
        id: '8lpg9pfpLy',
      });
    case 'reconnecting':
      return translateMessage({
        defaultMessage: 'Reconnecting…',
        id: '6cGmck2ETW',
      });
    case 'ended':
      return connectionEndText(connection.reason);
  }
}
export function contentProblemText(content?: Dynamic) {
  switch (content.kind) {
    case 'loading':
    case 'workbook':
      return null;
    case 'noContainer':
      return restoreStatusOf(content.restore).inWords;
    case 'notAWorkbook':
      return translateMessage({
        defaultMessage:
          'This Sheet holds another kind of content, such as a Agent Doc’s text, instead of a workbook, so this page can’t open it. Delete it and make a new one.',
        id: 'CSSPOkT9vb',
      });
    case 'notUnderstood':
      return translateMessage({
        defaultMessage: 'This page can’t read this Sheet’s storage: it isn’t laid out as a new Sheet’s is. Reload the page to try again.',
        id: 'Ab+RRMvP//',
      });
  }
}
export function workbookStateText(workbook?: Dynamic) {
  switch (workbook.kind) {
    case 'notOpened':
    case 'opening':
      return loadingStatusText();
    case 'open':
      return null;
    case 'empty':
      return translateMessage({
        defaultMessage: 'There’s nothing in this Sheet yet, and you can’t change it. Ask someone who can edit it to add to it.',
        id: 'NgP6QwtrVR',
      });
    case 'closed':
      return translateMessage({
        defaultMessage: 'This Sheet is unavailable right now. Try again later.',
        id: '/cj4f52tq7',
      });
    case 'failed':
      return translateMessage({
        defaultMessage: 'Couldn’t open this Sheet. Reload the page to try again.',
        id: 'yGVghZwsZG',
      });
  }
}
export function sharedCodeProblemText(sharedCode?: Dynamic) {
  switch (sharedCode.kind) {
    case 'loading':
    case 'answered':
    case 'notFetched':
      return null;
    case 'noWebAssembly':
      return translateMessage({
        defaultMessage: 'This editor needs WebAssembly, which is turned off in this browser. Turn it on, or open this Sheet in another browser.',
        id: '9JcTZsuH4j',
      });
    case 'failed':
      return translateMessage({
        defaultMessage: 'The editor didn’t load. Reload the page to try again.',
        id: 'fcWg3QduMo',
      });
  }
}
export function restoreStatusOf(restore?: Dynamic) {
  switch (restore) {
    case 'notOffered':
      return standingStatus(
        translateMessage({
          defaultMessage: 'This Sheet is no longer available.',
          id: 'oYes97jJc0',
        }),
      );
    case 'offered':
      return mayBeRestoredStatus(
        translateMessage({
          defaultMessage: 'This Sheet is no longer available. If it was deleted, you can restore it.',
          id: 'y/pD8/eUYp',
        }),
      );
    case 'underWay':
      return onItsWayStatus(
        translateMessage({
          defaultMessage: 'Restoring Sheet…',
          id: 'Wk0kB6llr5',
        }),
      );
    case 'failed':
      return mayBeRestoredStatus(
        translateMessage({
          defaultMessage: 'Couldn’t restore the Sheet. Try again in a moment.',
          id: 'oAAtCqAIrp',
        }),
      );
    case 'refused':
      return standingStatus(
        translateMessage({
          defaultMessage: 'You can no longer restore this Sheet.',
          id: 'aJm/wJWS++',
        }),
      );
  }
}
export function sheetStatusOf({ connection: connection, content: content, sharedCode: sharedCode, workbook: workbook }: Dynamic) {
  let isOpening = workbook.kind === 'notOpened' || workbook.kind === 'opening';
  let mayPass = isOpening || (workbook.kind === 'failed' && workbook.mayPass);
  let problemText = contentProblemText(content) ?? sharedCodeProblemText(sharedCode);
  if (connection.kind === 'ended' && connection.reason.kind !== 'closedByPage') {
    let mayPassOnEnd = mayPass || workbook.kind === 'closed';
    if (connection.reason.kind === 'couldNotConnect' && mayPassOnEnd && problemText === null) return mayPassStatus();
    return standingStatus(connectionStateText(connection));
  }
  if (content.kind === 'noContainer') return restoreStatusOf(content.restore);
  if (problemText !== null) return standingStatus(problemText);
  if (sharedCode.kind === 'notFetched') return mayPassStatus();
  if (connection.kind === 'ended') return standingStatus(connectionStateText(connection));
  if (connection.kind === 'reconnecting' && connection.isKeptOut === true && workbook.kind !== 'open')
    return mayPass ? mayPassStatus() : standingStatus(workbookStateText(workbook) ?? connectionStateText(connection));
  if (connection.kind !== 'open') return onItsWayStatus(connectionStateText(connection));
  if (content.kind === 'loading' || isOpening) return onItsWayStatus(loadingStatusText());
  if (mayPass) return mayPassStatus();
  return standingStatus(workbookStateText(workbook) ?? connectionStateText(connection));
}
export function sheetProblemSummary(state?: Dynamic): ConnectionProblem | null {
  let { connection: connection, workbook: workbook } = state;
  if (connection.kind === 'open') return null;
  let { inWords: inWords, kind: kind } = sheetStatusOf(state);
  let closedByPage = connection.kind === 'ended' && connection.reason.kind === 'closedByPage';
  return {
    inWords: inWords,
    mayPass: kind === 'onItsWay',
    asksForReload: kind === 'stands' && !closedByPage,
    areEditsUnsaved: workbook.kind === 'open' && workbook.workbook.hasUnsavedEdits(),
  };
}
export function mountSheetStatusAnnouncer(container?: Dynamic) {
  let statusElement = (document as Dynamic).createElement('p');
  statusElement.setAttribute('role', 'status');
  container.replaceChildren(statusElement);
  return (state?: Dynamic) => {
    let text = state === null ? '' : sheetStatusOf(state).inWords;
    if (statusElement.textContent !== text) statusElement.textContent = text;
  };
}
export const loadingStatusText = () =>
  translateMessage({
    defaultMessage: 'Loading…',
    id: 'woaALHtoAw',
  });
export const sheetLoadedText = () =>
  translateMessage({
    defaultMessage: 'Sheet loaded',
    id: 'EV45YxQ50D',
  });
export const latestContentFailedText = () =>
  translateMessage({
    defaultMessage: 'The latest content failed to load',
    id: 'eSLxF7tiiQ',
  });
export const onItsWayStatus = (inWords?: Dynamic) => ({
  inWords: inWords,
  kind: 'onItsWay',
});
export const mayPassStatus = () => ({
  inWords: latestContentFailedText(),
  kind: 'mayPass',
});
export const mayBeRestoredStatus = (inWords?: Dynamic) => ({
  inWords: inWords,
  kind: 'mayBeRestored',
});
export const standingStatus = (inWords?: Dynamic) => ({
  inWords: inWords,
  kind: 'stands',
});
