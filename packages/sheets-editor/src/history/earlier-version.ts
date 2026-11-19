import type { Dynamic } from '../dynamic.ts';
export function createEarlierVersionWorkbook(firstVersion?: Dynamic) {
  let version: Dynamic = firstVersion;
  let ownRowOrdersSeen = new (Map as Dynamic)();
  let sheetFollowed: Dynamic = null;
  let changeListeners = new (Set as Dynamic)();
  let hearings = new (Set as Dynamic)();
  let hearOnVersion =
    (listen?: Dynamic) =>
    (listener?: Dynamic) => {
      let hearing = {
        stop: ignoreWorkbookCall,
        hear: () => void (hearing.stop = listen(version.workbook, listener)),
      };
      hearing.hear();
      hearings.add(hearing);
      return () => {
        hearing.stop();
        hearings.delete(hearing);
      };
    };
  let hearChanged = hearOnVersion((input?: Dynamic, options?: Dynamic) => input.onChanged(options));
  return {
    workbook: {
      reads: () => version.workbook.reads(),
      refusalOfEveryEdit: () => EARLIER_VERSION_REFUSAL.refusal,
      queueEdit: (input?: Dynamic, options?: Dynamic) => options(EARLIER_VERSION_REFUSAL),
      undoOrRedo: (input?: Dynamic, options?: Dynamic) => options(EARLIER_VERSION_REFUSAL),
      queueEditsThatTakeBack: (input?: Dynamic, options?: Dynamic, context?: Dynamic) => context(EARLIER_VERSION_REFUSAL),
      seeRowsInOwnOrder(sheetId?: Dynamic, rows?: Dynamic, onSeen?: Dynamic) {
        ownRowOrdersSeen.set(sheetId, rows);
        version.workbook.seeRowsInOwnOrder(sheetId, rows, onSeen);
      },
      onChanged(listener?: Dynamic) {
        changeListeners.add(listener);
        let stopHearing = hearChanged(listener);
        return () => {
          changeListeners.delete(listener);
          stopHearing();
        };
      },
      isOnAnotherThread: true,
      areFormulasLeft: () => version.workbook.areFormulasLeft(),
      onFormulasLeftChanged: hearOnVersion((input?: Dynamic, options?: Dynamic) => input.onFormulasLeftChanged(options)),
      workOutFormulasLeft: () => version.workbook.workOutFormulasLeft(),
      questionsMissedCount: () => version.workbook.questionsMissedCount(),
      isAnswerAwaited: () => version.workbook.isAnswerAwaited(),
      onAnswersCame: hearOnVersion((input?: Dynamic, options?: Dynamic) => input.onAnswersCame(options)),
      onCauseOfErrorCame: hearOnVersion((input?: Dynamic, options?: Dynamic) => input.onCauseOfErrorCame(options)),
      readCellsToCopyAhead: (...input: Dynamic[]) => (version.workbook.readCellsToCopyAhead as Dynamic)(...input),
      onCellsToCopyRead: hearOnVersion((input?: Dynamic, options?: Dynamic) => input.onCellsToCopyRead(options)),
      tableAt: (...input: Dynamic[]) => (version.workbook.tableAt as Dynamic)(...input),
      followTablesOf(sheetId?: Dynamic) {
        sheetFollowed = sheetId;
        version.workbook.followTablesOf(sheetId);
      },
      tablesRead: () => version.workbook.tablesRead(),
      onTablesRead: hearOnVersion((input?: Dynamic, options?: Dynamic) => input.onTablesRead(options)),
      xlsxFile: (...input: Dynamic[]) => (version.workbook.xlsxFile as Dynamic)(...input),
      saving: () => 'allSaved',
      hasUnsavedEdits: () => false,
      unsavedEditCount: () => 0,
      onSavingChanged: noChangeListener,
      onEditsDropped: noChangeListener,
      revisionHeld: () => null,
      onEditsOfOthersMade: noChangeListener,
      onLoaded: noChangeListener,
      editStreamed: ignoreWorkbookCall,
      storeRevisionReported: ignoreWorkbookCall,
      timeTold: ignoreWorkbookCall,
      storeReconnected: ignoreWorkbookCall,
      storeClosed: ignoreWorkbookCall,
      availabilityStated: ignoreWorkbookCall,
      tabVisibilityChanged: ignoreWorkbookCall,
    },
    end: () => version.end(),
    show(nextVersion?: Dynamic) {
      for (let { stop: hearing } of hearings as Dynamic) hearing();
      version.end();
      version = nextVersion;
      for (let { hear: hearing } of hearings as Dynamic) hearing();
      for (let [sheetId, rows] of ownRowOrdersSeen as Dynamic) nextVersion.workbook.seeRowsInOwnOrder(sheetId, rows, ignoreWorkbookCall);
      if (sheetFollowed !== null) nextVersion.workbook.followTablesOf(sheetFollowed);
      for (let hearing of changeListeners as Dynamic) hearing('unasked');
    },
  };
}
export function createChartSends(changes?: Dynamic, made?: Dynamic, written?: Dynamic) {
  let sendingCount: Dynamic = 0;
  let sentCount: Dynamic = 0;
  let send = async (sendIt?: Dynamic): Promise<Dynamic> => {
    sendingCount += 1;
    sentCount += 1;
    try {
      return await sendIt();
    } finally {
      sendingCount -= 1;
    }
  };
  return {
    changes: {
      isToBeHad: () => changes.isToBeHad(),
      canAskAgent: () => changes.canAskAgent(),
      kindOf: (nodeId?: Dynamic) => changes.kindOf(nodeId),
      ask: (...input: Dynamic[]) => (changes.ask as Dynamic)(...input),
      giveUp: () => changes.giveUp(),
      discard: (input?: Dynamic) => changes.discard(input),
      pointAt: (...input: Dynamic[]) => send(() => (changes.pointAt as Dynamic)(...input)),
    },
    made: {
      get isToBeHad() {
        return made.isToBeHad;
      },
      make: (...input: Dynamic[]) => send(() => (made.make as Dynamic)(...input)),
    },
    written: {
      isToBeHad: () => written.isToBeHad(),
      write: (...input: Dynamic[]) => send(() => (written.write as Dynamic)(...input)),
      giveUp: () => written.giveUp(),
      discard: (input?: Dynamic) => written.discard(input),
    },
    isSending: () => sendingCount > 0,
    timesSent: () => sentCount,
  };
}
export function createEarlierVersionLooks(app?: Dynamic) {
  let looking: Dynamic = null;
  let paneAtFirst: Dynamic = null;
  let generation: Dynamic = 0;
  let endLook = (
    pane: Dynamic,
    { profilesById: profilesById, newsOfLoss: newsOfLoss }: Dynamic,
    thenRestore?: Dynamic,
    doCellsTakeCaret?: Dynamic,
  ) => {
    generation += 1;
    if (looking === null) return;
    looking.onShow.end();
    paneAtFirst = {
      pane: pane,
      kept: {
        ...looking.stepsOfOpenWorkbook,
        profilesById: profilesById,
        newsOfLoss: newsOfLoss,
      },
      thenRestore: thenRestore,
      doCellsTakeCaret: pane === null ? doCellsTakeCaret : pane.isCaretForCells,
    };
    looking = null;
    queueMicrotask(app.drawAgain);
  };
  return {
    async lookAt(revision?: Dynamic, pane?: Dynamic, readKept?: Dynamic): Promise<Dynamic> {
      generation += 1;
      let [generationAtStart, workbook, chartSendsAtStart] = [generation, app.own(), app.timesChartsWereSent()];
      let isStillAsked = () =>
        generationAtStart === generation && app.own() === workbook && app.timesChartsWereSent() === chartSendsAtStart;
      if (workbook === null) return 'noAnswer';
      if (app.isChartBeingSent()) return 'editsNotSaved';
      await app.untilSaved(workbook);
      if (!isStillAsked()) return 'calledOff';
      if (workbook.hasUnsavedEdits()) return 'editsNotSaved';
      let earlier = await app.history.asItWas(revision, isStillAsked);
      if (earlier.kind === 'notRead') return earlier.why;
      if (!isStillAsked() || workbook.hasUnsavedEdits()) earlier.version.end();
      if (!isStillAsked()) return 'calledOff';
      if (workbook.hasUnsavedEdits()) return 'editsNotSaved';
      let { profilesById: profilesById, newsOfLoss: newsOfLoss, ...steps } = readKept();
      earlier.version.onFailed(() => {
        if (looking?.shown === earlier.version)
          endLook(
            null,
            {
              profilesById: profilesById,
              newsOfLoss: newsOfLoss,
            },
            null,
            false,
          );
      });
      if (looking !== null) {
        looking.onShow.show(earlier.version);
        looking.shown = earlier.version;
        return null;
      }
      let shownBefore = pane.look?.awaited?.version ?? null;
      let stepsOfOpenWorkbook = {
        notesOfSteps: steps.notesOfSteps,
        rowsAddedAfterEntries: steps.rowsAddedAfterEntries,
        stepsToUndo: steps.stepsToUndo,
        stepsToRedo: steps.stepsToRedo,
      };
      looking = {
        of: workbook,
        onShow: createEarlierVersionWorkbook(earlier.version),
        shown: earlier.version,
        stepsOfOpenWorkbook: stepsOfOpenWorkbook,
      };
      paneAtFirst = {
        pane: {
          ...pane,
          look: {
            shown: shownBefore,
            awaited: null,
          },
        },
        kept: {
          ...stepsOfOpenWorkbook,
          profilesById: profilesById,
          newsOfLoss: newsOfLoss,
        },
        thenRestore: null,
        doCellsTakeCaret: false,
      };
      app.drawAgain();
      return null;
    },
    end: endLook,
    takePaneAtFirst() {
      let pane = paneAtFirst;
      paneAtFirst = null;
      return pane;
    },
    drawnInPlaceOf(workbook?: Dynamic) {
      if (looking !== null && looking.of !== workbook) {
        generation += 1;
        looking.onShow.end();
        looking = null;
        paneAtFirst = null;
      }
      return looking?.onShow.workbook ?? workbook;
    },
  };
}
export const EARLIER_VERSION_REFUSAL = {
  kind: 'refused',
  refusal: 'earlierVersionShown',
};
export const noChangeListener = () => () => {};
export const ignoreWorkbookCall = () => {};
