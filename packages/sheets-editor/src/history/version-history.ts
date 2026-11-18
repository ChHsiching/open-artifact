import type { Dynamic } from '../dynamic.ts';
import { versionHistoryOfPane } from '../state/queries.ts';
import { withNoEffects, clearPassingNotice } from '../state/transitions.ts';
import { commitEntryInPlaceIfEditing } from '../editor/commit-entry.ts';
import { showChangedPlace } from '../state/edit-answers.ts';
import { editRefusalReason } from '../model/refusals.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export let lastShownVersionHistory: Dynamic;
export function askForVersions(state: PageState, history2?: Dynamic, of?: Dynamic) {
  let askId = state.versionHistoryAskCount + 1;
  let { firstRevision } = (of === 'older' ? history2.versions?.at(-1) : null) ?? {};
  let before = firstRevision === undefined ? null : { firstRevision };
  return {
    state: {
      ...state,
      versionHistoryAskCount: askId,
      sidePane: {
        kind: 'versionHistory',
        history: {
          ...history2,
          whyNotRead: of === versionsAskedOf(history2) ? history2.whyNotRead : null,
          awaited: {
            askId: askId,
            of: of,
            atChangeCount: state.saving === 'allSaved' ? state.workbookChangeCount : null,
          },
        },
      },
    },
    effects: [
      {
        kind: 'readVersions',
        askId: askId,
        before: before,
      },
    ],
  };
}
export function toggleVersionHistory(state: PageState) {
  let history2 = versionHistoryOfPane(state);
  if (history2 !== null)
    return {
      state: {
        ...state,
        sidePane: null,
      },
      effects:
        history2.look === null
          ? []
          : [
              {
                kind: 'endLookAtVersion',
                pane: null,
                thenRestore: null,
                isByPerson: true,
              },
            ],
    };
  return askForVersions(
    {
      ...state,
      menu: null,
      dropdown: null,
    },
    {
      versions: null,
      hasOlder: false,
      whyNotRead: null,
      awaited: null,
      readAtChangeCount: null,
      authorsLookedUp: new (Set as Dynamic)(),
      authorsAwaited: new (Set as Dynamic)(),
      looksInVainInARow: 0,
      look: null,
      picked: null,
      isCaretForCells: false,
      pickedLast: null,
    },
    'newest',
  );
}
export function mergeNewestVersions(history2: Dynamic, { versions: versions, hasOlder: hasOlder }: Dynamic) {
  let oldestNew = versions.at(-1);
  let olderKept =
    oldestNew === undefined ? [] : (history2.versions ?? []).filter(({ revision: revision }: Dynamic) => revision < oldestNew.firstRevision);
  return olderKept.length === 0
    ? {
        versions: versions,
        hasOlder: hasOlder,
      }
    : {
        versions: [...versions, ...olderKept],
        hasOlder: history2.hasOlder,
      };
}
export function versionsAnswered(state: PageState, askId?: Dynamic, answer?: Dynamic) {
  let history2 = versionHistoryOfPane(state);
  if (history2 === null || history2.awaited?.askId !== askId) return withNoEffects(state);
  let { of: awaitedOf, atChangeCount: atChangeCount } = history2.awaited;
  let historyAnswered = {
    ...history2,
    awaited: null,
  };
  if (answer.kind === 'notRead') {
    let isNewestAgain = awaitedOf === 'newest' && history2.versions !== null;
    return withNoEffects(
      setVersionHistoryPane(
        state,
        isNewestAgain
          ? {
              ...historyAnswered,
              readAtChangeCount: atChangeCount,
              looksInVainInARow: history2.looksInVainInARow + 1,
            }
          : {
              ...historyAnswered,
              whyNotRead: answer.why,
            },
      ),
    );
  }
  let { versions: versions, hasOlder: hasOlder } = answer;
  let authorsToLookUp2 = authorsToLookUp(
    state,
    history2,
    versions.flatMap(({ authors: authors }: Dynamic) => authors),
  );
  let historyRead = {
    ...historyAnswered,
    whyNotRead: null,
    authorsLookedUp: new (Set as Dynamic)([...history2.authorsLookedUp, ...authorsToLookUp2]),
    authorsAwaited: new (Set as Dynamic)([...history2.authorsAwaited, ...authorsToLookUp2]),
  };
  return {
    state: setVersionHistoryPane(
      state,
      awaitedOf === 'older'
        ? {
            ...historyRead,
            versions: [...(history2.versions ?? []), ...versions],
            hasOlder: hasOlder,
          }
        : {
            ...historyRead,
            ...mergeNewestVersions(history2, answer),
            readAtChangeCount: atChangeCount,
            looksInVainInARow: 0,
          },
    ),
    effects:
      authorsToLookUp2.length === 0
        ? []
        : [
            {
              kind: 'lookUpPeople',
              userIds: authorsToLookUp2,
            },
          ],
  };
}
export function withoutAuthors(authors?: Dynamic, arrived?: Dynamic) {
  if (!arrived.some((userId?: Dynamic) => authors.has(userId))) return authors;
  let kept = new (Set as Dynamic)(authors);
  for (let userId of arrived as Dynamic) kept.delete(userId);
  return kept;
}
export function versionAuthorsArrived(state: PageState, userIds?: Dynamic) {
  let history2 = versionHistoryOfPane(state);
  if (history2 === null) return state;
  let awaited = withoutAuthors(history2.authorsAwaited, userIds);
  return awaited === history2.authorsAwaited
    ? state
    : setVersionHistoryPane(state, {
        ...history2,
        authorsAwaited: awaited,
      });
}
export function isVersionHistoryBehind(state: PageState) {
  let history2 = versionHistoryOfPane(state);
  return (
    history2 !== null &&
    history2.versions !== null &&
    history2.awaited === null &&
    state.takingBack === null &&
    history2.look === null &&
    history2.looksInVainInARow < MOST_LOOKS_IN_VAIN &&
    history2.readAtChangeCount !== state.workbookChangeCount &&
    state.saving === 'allSaved'
  );
}
export function refreshVersionHistory(state: PageState) {
  let history2 = versionHistoryOfPane(state);
  return history2 !== null && isVersionHistoryBehind(state) ? askForVersions(state, history2, 'newest') : withNoEffects(state);
}
export function askForEditsThatTakeBack(state: PageState, takingBack?: Dynamic) {
  let askId = state.versionHistoryAskCount + 1;
  let { what: what, timesMovedOn: timesMovedOn } = takingBack;
  return {
    state: {
      ...clearPassingNotice(state),
      versionHistoryAskCount: askId,
      takingBack: {
        ...takingBack,
        askId: askId,
      },
    },
    effects: [
      {
        kind: 'readEditsThatTakeBack',
        askId: askId,
        asked:
          what.kind === 'allSinceVersion'
            ? {
                kind: 'allSince',
                revision: what.version.revision,
              }
            : {
                kind: 'only',
                ranges: what.edits,
              },
        afterMs: timesMovedOn === 0 ? 0 : TAKE_BACK_RETRY_MS,
      },
    ],
  };
}
export function dropStaleTakingBack(state: PageState) {
  if (state.takingBack === null) return state;
  let { what: what } = state.takingBack;
  return (what.kind === 'allSinceVersion' ? versionHistoryOfPane(state) !== null : state.undoOfTurnOffered?.edits === what.edits)
    ? state
    : {
        ...state,
        takingBack: null,
      };
}
export function startTakingBack(state: PageState, workbook: ReadsWithTextMeasurer, what?: Dynamic) {
  if (state.takingBack !== null) return withNoEffects(state);
  let committed = commitEntryInPlaceIfEditing(state, workbook);
  let asked = askForEditsThatTakeBack(committed?.state ?? state, {
    what: what,
    timesMovedOn: 0,
  });
  return {
    state: asked.state,
    effects: [...(committed?.effects ?? []), ...asked.effects],
  };
}
export function lookAtVersion(state: PageState, history2?: Dynamic, revision?: Dynamic) {
  let version = history2.versions?.find((version2?: Dynamic) => version2.revision === revision);
  if (version === undefined || state.takingBack !== null) return withNoEffects(state);
  if (history2.look?.awaited?.version.revision === revision) return withNoEffects(state);
  let askId = state.versionHistoryAskCount + 1;
  let historyLooking = {
    ...history2,
    look: {
      shown: history2.look?.shown ?? null,
      awaited: {
        askId: askId,
        version: version,
      },
    },
    picked: version.firstRevision,
    isCaretForCells: false,
    pickedLast: null,
  };
  return {
    state: {
      ...clearPassingNotice(state),
      versionHistoryAskCount: askId,
      notice: null,
      sidePane: {
        kind: 'versionHistory',
        history: historyLooking,
      },
    },
    effects: [
      {
        kind: 'lookAtVersion',
        askId: askId,
        revision: revision,
        pane: historyLooking,
      },
    ],
  };
}
export function carrySessionIntoState(state: PageState, history2: Dynamic, { profilesById: profilesById, ...session }: Dynamic) {
  let carried = {
    ...state,
    ...session,
    areStepsToUndoLost: false,
    profilesById: new (Map as Dynamic)([...profilesById, ...state.profilesById]),
  };
  if (history2 === null) return carried;
  let authorsLookedUp = new (Set as Dynamic)(history2.authorsLookedUp);
  for (let userId of history2.authorsAwaited as Dynamic) authorsLookedUp.delete(userId);
  return {
    ...carried,
    sidePane: {
      kind: 'versionHistory',
      history: {
        ...history2,
        awaited: null,
        readAtChangeCount: null,
        authorsLookedUp: authorsLookedUp,
        authorsAwaited: new (Set as Dynamic)(),
      },
    },
    timesSidePaneAsked: state.timesSidePaneAsked + 1,
  };
}
export function endVersionLook(state: PageState) {
  let history2 = versionHistoryOfPane(state);
  return history2 === null
    ? state
    : setVersionHistoryPane(state, {
        ...history2,
        look: null,
      });
}
export function endLookEffects(previousState: Dynamic, state: PageState, effects?: Dynamic, event?: Dynamic) {
  return !((versionHistoryOfPane(previousState)?.look ?? null) !== null && (versionHistoryOfPane(state)?.look ?? null) === null) ||
    effects.some(({ kind: kind }: Dynamic) => kind === 'endLookAtVersion')
    ? effects
    : [
        ...effects,
        {
          kind: 'endLookAtVersion',
          pane: versionHistoryOfPane(state),
          thenRestore: null,
          ...(event.kind === 'keyPressed' && {
            isByPerson: true,
          }),
        },
      ];
}
export function versionLookAnswered(state: PageState, askId?: Dynamic, failure?: Dynamic) {
  let history2 = versionHistoryOfPane(state);
  let awaited = history2?.look?.awaited ?? null;
  if (history2 === null || history2.look === null || awaited?.askId !== askId) return withNoEffects(state);
  if (failure === null)
    return withNoEffects(
      setVersionHistoryPane(state, {
        ...history2,
        look: {
          shown: awaited.version,
          awaited: null,
        },
      }),
    );
  let { shown: shownBefore } = history2.look;
  let historyAfter = setVersionHistoryPane(
    state,
    shownBefore === null
      ? {
          ...history2,
          look: null,
        }
      : {
          ...history2,
          look: {
            shown: shownBefore,
            awaited: null,
          },
          picked: shownBefore.firstRevision,
        },
  );
  return withNoEffects(
    failure === 'calledOff'
      ? historyAfter
      : {
          ...historyAfter,
          notice: {
            kind: 'versionNotShown',
            why: failure,
          },
        },
  );
}
export function versionHistoryActed(state: PageState, workbook: ReadsWithTextMeasurer, action?: Dynamic) {
  let history2 = versionHistoryOfPane(state);
  if (history2 === null) return withNoEffects(state);
  switch (action.kind) {
    case 'look': {
      let value = commitEntryInPlaceIfEditing(state, workbook);
      if (value === null) return lookAtVersion(state, history2, action.revision);
      let value2 = lookAtVersion(value.state, history2, action.revision);
      return {
        state: value2.state,
        effects: [...value.effects, ...value2.effects],
      };
    }
    case 'endLook': {
      if (history2.look === null)
        return withNoEffects(
          setVersionHistoryPane(state, {
            ...history2,
            picked: null,
          }),
        );
      let state2 = paneWithLookEnded(history2, action, history2.picked);
      return {
        state: setVersionHistoryPane(state, state2),
        effects: [
          {
            kind: 'endLookAtVersion',
            pane: state2,
            thenRestore: null,
          },
        ],
      };
    }
    case 'restore': {
      let value = history2.versions?.find((version?: Dynamic) => version.revision === action.revision);
      if ((history2.look?.shown ?? null) !== null) {
        let state2 = paneWithLookEnded(history2, action, value?.firstRevision ?? history2.picked);
        return {
          state: setVersionHistoryPane(state, state2),
          effects: [
            {
              kind: 'endLookAtVersion',
              pane: state2,
              thenRestore: action.revision,
            },
          ],
        };
      }
      return value === undefined
        ? withNoEffects(state)
        : startTakingBack(state, workbook, {
            kind: 'allSinceVersion',
            version: value,
          });
    }
    case 'showOlder':
      return history2.hasOlder && history2.awaited?.of !== 'older' ? askForVersions(state, history2, 'older') : withNoEffects(state);
    case 'tryAgain': {
      let value = versionsAskedOf(history2);
      return history2.whyNotRead === null || history2.awaited?.of === value ? withNoEffects(state) : askForVersions(state, history2, value);
    }
  }
}
export function takeBackFailed(state: PageState, { what: what }: Dynamic, why?: Dynamic) {
  let stateCleared = {
    ...state,
    takingBack: null,
    lastDone: null,
  };
  if (what.kind === 'allSinceVersion')
    return {
      ...stateCleared,
      notice: {
        kind: 'versionNotTakenBack',
        why: why === 'changedSince' ? 'refused' : why,
      },
    };
  return {
    ...stateCleared,
    undoOfTurnOffered: RETRYABLE_TAKE_BACK_FAULTS.has(why) ? state.undoOfTurnOffered : null,
    isUndoOfTurnNotToBeHad: state.isUndoOfTurnNotToBeHad || FATAL_TAKE_BACK_FAULTS.has(why),
    notice: {
      kind: 'turnOfAgentNotUndone',
      why: why,
    },
  };
}
export function retryTakingBack(state: PageState, takingBack?: Dynamic) {
  let timesMovedOn = takingBack.timesMovedOn + 1;
  return timesMovedOn < MOST_TIMES_MOVED_ON
    ? askForEditsThatTakeBack(state, {
        ...takingBack,
        timesMovedOn: timesMovedOn,
      })
    : withNoEffects(takeBackFailed(state, takingBack, 'storeMovedOn'));
}
export function editsThatTakeBackRead(state: PageState, workbook: ReadsWithTextMeasurer, askId?: Dynamic, answer?: Dynamic) {
  let { takingBack: takingBack } = state;
  if (takingBack === null || takingBack.askId !== askId) return withNoEffects(state);
  let committed = commitEntryInPlaceIfEditing(state, workbook);
  if (committed !== null && committed.effects.length > 0) {
    let value = retryTakingBack(committed.state, takingBack);
    return {
      state: value.state,
      effects: [...committed.effects, ...value.effects],
    };
  }
  if (committed !== null) return editsThatTakeBackRead(committed.state, workbook, askId, answer);
  if (answer.kind === 'read') {
    let { builtOnRevision: value, edits: value2 } = answer;
    let { what: what } = takingBack;
    let offerIfMade =
      what.kind === 'allSinceVersion'
        ? {
            kind: 'versionRestored',
            atMs: what.version.atMs,
            isSaved: false,
          }
        : null;
    return {
      state: state,
      effects: [
        {
          kind: 'queueEditsThatTakeBack',
          askId: askId,
          builtOnRevision: value,
          edits: value2,
          offerIfMade: offerIfMade,
        },
      ],
    };
  }
  switch (answer.why) {
    case 'storeMovedOn':
      return retryTakingBack(state, takingBack);
    case 'unknownRevision': {
      let value = takeBackFailed(state, takingBack, 'refused');
      let value2 = versionHistoryOfPane(value);
      return value2 === null || takingBack.what.kind !== 'allSinceVersion' ? withNoEffects(value) : askForVersions(value, value2, 'newest');
    }
    case 'changedSince':
    case 'storeDoesNotKnowHow':
    case 'recordDoesNotMatch':
    case 'tookTooLong':
    case 'busy':
    case 'noAnswer':
    case 'refused':
    case 'tooMuch':
    case 'notAccepted':
      return withNoEffects(takeBackFailed(state, takingBack, answer.why));
  }
}
export function takeBackAnswered(state: PageState, workbook: ReadsWithTextMeasurer, { askId: askId, outcome: outcome, offerIfMade: offerIfMade }: Dynamic) {
  let takingBack = state.takingBack?.askId === askId ? state.takingBack : null;
  let stateCleared =
    takingBack === null
      ? state
      : {
          ...state,
          takingBack: null,
        };
  if (outcome.kind === 'made') {
    let value = {
      ...clearPassingNotice(stateCleared),
      dragging: null,
    };
    let changedOnSheet = outcome.changed?.sheetId === value.sheetId ? outcome.changed : null;
    return withNoEffects({
      ...value,
      lastDone: offerIfMade === null ? showChangedPlace(value, workbook, 'undone', changedOnSheet).lastDone : null,
      undoOffer: offerIfMade,
      undoOfTurnOffered: null,
    });
  }
  if (takingBack === null) return withNoEffects(state);
  switch (outcome.kind) {
    case 'builtOnAnotherRevision':
      return retryTakingBack(state, takingBack);
    case 'refused': {
      let value = editRefusalReason(outcome.refusal);
      return withNoEffects(
        value === 'fault'
          ? takeBackFailed(state, takingBack, value)
          : {
              ...stateCleared,
              notice: {
                kind: 'editRefused',
                why: value,
                asked: 'otherEdit',
              },
            },
      );
    }
    case 'nothingToChange':
      return withNoEffects(takeBackFailed(state, takingBack, outcome.kind));
  }
}
export function authorShown(author?: Dynamic, profilesById?: Dynamic, awaitedAuthors?: Dynamic) {
  if (author.kind === 'agent') return author;
  let { name = '', avatarUrl = '' } = profilesById.get(author.userId) ?? {};
  return {
    ...author,
    name: name === '' && awaitedAuthors.has(author.userId) ? null : name,
    avatarUrl: avatarUrl,
  };
}
export function versionLookShown(look?: Dynamic) {
  let version = look?.awaited?.version ?? look?.shown ?? null;
  if (look === null || version === null) return null;
  let { firstRevision: firstRevision, atMs: atMs } = version;
  return {
    firstRevision: firstRevision,
    atMs: atMs,
    isOpening: look.awaited !== null,
  };
}
export function shownVersionHistory(state: PageState) {
  let [history2, { profilesById: profilesById }] = [versionHistoryOfPane(state), state];
  if (history2 === null) return null;
  let behindAtChangeCount = isVersionHistoryBehind(state) ? state.workbookChangeCount : null;
  let { takingBack: takingBack } = state;
  let versionBeingRestored = takingBack?.what.kind === 'allSinceVersion' ? takingBack.what.version : null;
  if (
    lastShownVersionHistory?.pane === history2 &&
    lastShownVersionHistory.takingBack === takingBack &&
    lastShownVersionHistory.profilesById === profilesById &&
    lastShownVersionHistory.behindAtChangeCount === behindAtChangeCount
  )
    return lastShownVersionHistory.shown;
  let shown = {
    versions:
      history2.versions?.map(
        (version?: Dynamic, index?: Dynamic) => ({
          revision: version.revision,
          firstRevision: version.firstRevision,
          atMs: version.atMs,
          authors: version.authors.map((author?: Dynamic) => authorShown(author, profilesById, history2.authorsAwaited)),
          isCurrent: index === 0,
          isBeingRestored: versionBeingRestored?.firstRevision === version.firstRevision,
        }),
      ) ?? null,
    whyNotRead: history2.whyNotRead,
    hasOlder: history2.hasOlder,
    awaited: history2.awaited?.of ?? null,
    isTakingBack: takingBack !== null,
    look: versionLookShown(history2.look),
    picked: history2.picked,
    isCaretForCells: history2.isCaretForCells,
    pickedLast: history2.pickedLast,
    behindAtChangeCount: behindAtChangeCount,
  };
  lastShownVersionHistory = {
    pane: history2,
    takingBack: takingBack,
    profilesById: profilesById,
    behindAtChangeCount: behindAtChangeCount,
    shown: shown,
  };
  return shown;
}
export const MOST_LOOKS_IN_VAIN = 3;
export const MOST_TIMES_MOVED_ON = 3;
export const TAKE_BACK_RETRY_MS = 1000;
export const setVersionHistoryPane = (state: PageState, history2?: Dynamic) =>
  history2 === versionHistoryOfPane(state)
    ? state
    : {
        ...state,
        sidePane: {
          kind: 'versionHistory',
          history: history2,
        },
      };
export const versionsAskedOf = ({ versions: versions }: Dynamic) => (versions === null ? 'newest' : 'older');
export const authorsToLookUp = (
  { profilesById: profilesById }: Dynamic,
  { authorsLookedUp: authorsLookedUp }: Dynamic,
  authors?: Dynamic,
) =>
  [...new (Set as Dynamic)(authors.flatMap((author?: Dynamic) => (author.kind === 'person' ? [author.userId] : [])))].filter(
    (userId?: Dynamic) => !authorsLookedUp.has(userId) && (profilesById.get(userId)?.name ?? '') === '',
  );
export const paneWithLookEnded = (
  history2: Dynamic,
  { isFromBar: isFromBar, isByPointer: isByPointer }: Dynamic,
  pickedLast?: Dynamic,
) => ({
  ...history2,
  look: null,
  picked: null,
  isCaretForCells: isFromBar === true || isByPointer === true,
  pickedLast: pickedLast,
});
export const RETRYABLE_TAKE_BACK_FAULTS = new (Set as Dynamic)(['busy', 'noAnswer', 'storeMovedOn']);
export const FATAL_TAKE_BACK_FAULTS = new (Set as Dynamic)(['storeDoesNotKnowHow', 'recordDoesNotMatch', 'tookTooLong']);
lastShownVersionHistory = null;
