import type { Dynamic } from '../dynamic.ts';
import { isNonNullObject } from '../utils/objects.ts';
import { isViewId } from './view-context.ts';
export async function askCanSendToAgentSession(room?: Dynamic): Promise<Dynamic> {
  let canSend = room?.canSendToAgentSession;
  if (typeof canSend !== 'function') return null;
  try {
    return await canSend.call(room);
  } catch (fault: Dynamic) {
    let code = isNonNullObject(fault) ? fault.code : null;
    return code === 'capability_removed' || code === 'invalid_argument' ? null : 'rejected';
  }
}
export function createChatWithAgent(
  getAgent?: Dynamic,
  reportFault?: Dynamic,
  leavingLosesWork?: Dynamic,
  sleep: Dynamic = (ms?: Dynamic) => new (Promise as Dynamic)((resolve?: Dynamic) => void setTimeout(resolve, ms)),
  keepKeysOffCells: Dynamic = () => () => false,
  hasUserActivation2: Dynamic = 'userActivation' in MessageEvent.prototype,
) {
  let room: Dynamic = null;
  let toBeHad: Dynamic = null;
  let isNotBeside: Dynamic = false;
  let availableIfSummoned: Dynamic = false;
  let summonHold: Dynamic = null;
  let lookNumber: Dynamic = 0;
  let lookApplied: Dynamic = 0;
  let changeCount: Dynamic = 0;
  let scheduledLook: Dynamic = null;
  let lookAgainIndex: Dynamic = 0;
  let subscribers = new (Set as Dynamic)();
  let pressRefusedListeners = new (Set as Dynamic)();
  let notifyPressRefused = (payload?: Dynamic, wasWithWords?: Dynamic) => {
    for (let listener of pressRefusedListeners as Dynamic)
      try {
        listener(payload, wasWithWords);
      } catch {
        reportFault(Error('onPressRefused fault'));
      }
  };
  let takesWords: Dynamic = false;
  let setToBeHad = (isToBeHad?: Dynamic) => {
    if (isToBeHad === true) {
      if (scheduledLook?.is !== 'forWork') scheduledLook = null;
      lookAgainIndex = 0;
    }
    let takesWordsNow = isToBeHad === true && !isNotBeside && hasUserActivation2;
    if (isToBeHad === toBeHad && takesWordsNow === takesWords) return;
    if (isToBeHad !== null && isToBeHad !== toBeHad) changeCount += 1;
    toBeHad = isToBeHad;
    takesWords = takesWordsNow;
    for (let subscriber of subscribers as Dynamic) subscriber();
  };
  let dropAfterSilence = async (): Promise<Dynamic> => {
    let changeAtStart = changeCount;
    await sleep(CHAT_SEND_TIMEOUT_MS);
    if (changeAtStart !== changeCount) return;
    setToBeHad(false);
    planNextLook(false);
  };
  let openRoom = async (agent?: Dynamic): Promise<Dynamic> => {
    try {
      let use = isNonNullObject(agent) ? agent.use : null;
      let roomCapability = typeof use === 'function' ? await use.call(agent, 'room') : null;
      return isNonNullObject(roomCapability) && roomCapability.available !== false ? roomCapability : null;
    } catch {
      reportFault(Error('agent.use fault: room'));
      return null;
    }
  };
  let look = async (dropsWhenUnavailable?: Dynamic, isForWork: Dynamic = false): Promise<Dynamic> => {
    lookNumber += 1;
    let thisLook = lookNumber;
    let openedRoom = await openRoom(getAgent());
    if (thisLook === lookNumber) room = openedRoom;
    let sendState = await askCanSendToAgentSession(openedRoom);
    if (thisLook < lookApplied) return;
    lookApplied = thisLook;
    isNotBeside = sendState !== 'available';
    if (sendState !== 'rejected') availableIfSummoned = sendState === 'available_if_summoned';
    let planAgain = !dropsWhenUnavailable && !isForWork;
    if (sendState === 'available' || sendState === null) return setToBeHad(sendState !== null);
    if (leavingLosesWork()) {
      if (toBeHad === true) {
        setToBeHad(null);
        dropAfterSilence();
      }
      return void planNextLook(planAgain);
    }
    if (sendState === 'available_if_opened' || (sendState === 'available_if_summoned' && summonHold === null)) return setToBeHad(true);
    if (dropsWhenUnavailable) setToBeHad(false);
    return void planNextLook(planAgain);
  };
  let onceLeavingIsSafe = () =>
    new (Promise as Dynamic)((resolve?: Dynamic) => {
      let check = () => {
        if (leavingLosesWork()) sleep(LEAVE_CHECK_INTERVAL_MS).then(check);
        else resolve();
      };
      check();
    });
  let scheduleLook = async (lookKind?: Dynamic, waitFor?: Dynamic): Promise<Dynamic> => {
    let scheduled = {
      is: lookKind,
    };
    scheduledLook = scheduled;
    await waitFor;
    if (scheduledLook !== scheduled) return;
    scheduledLook = null;
    await look(lookKind !== 'forWork', lookKind === 'forWork');
  };
  let planNextLook = async (isFresh?: Dynamic): Promise<Dynamic> => {
    if (isFresh && scheduledLook?.is !== 'first') {
      if (scheduledLook?.is === 'later') scheduledLook = null;
      lookAgainIndex = 0;
    }
    if (scheduledLook !== null) return;
    if (leavingLosesWork()) {
      await scheduleLook('forWork', onceLeavingIsSafe());
      return;
    }
    let delayMs = LOOK_AGAIN_DELAYS_MS[lookAgainIndex];
    lookAgainIndex += 1;
    if (delayMs !== undefined) await scheduleLook(lookAgainIndex === 1 ? 'first' : 'later', sleep(delayMs));
  };
  let sendToSession = async (payload?: Dynamic, sendOptions?: Dynamic, skipsKeyGuard: Dynamic = false): Promise<Dynamic> => {
    let sendToAgentSession = room?.sendToAgentSession;
    let maySummon = availableIfSummoned && !leavingLosesWork();
    let isQuietWhenUnavailable = isNotBeside && leavingLosesWork();
    let releaseKeys: Dynamic = null;
    try {
      if (typeof sendToAgentSession !== 'function') return false;
      releaseKeys = skipsKeyGuard ? null : keepKeysOffCells();
      await (sendOptions === undefined ? sendToAgentSession.call(room, payload) : sendToAgentSession.call(room, payload, sendOptions));
      return true;
    } catch (fault: Dynamic) {
      let code = isNonNullObject(fault) ? fault.code : null;
      let keysWereHeld = (code === 'agent_unavailable' || code === 'invalid_argument') && (releaseKeys?.() ?? false);
      if (code === 'agent_unavailable' && maySummon) {
        let hold: Dynamic = {};
        summonHold = hold;
        sleep(SUMMON_UNAVAILABLE_HOLD_MS).then(() => {
          if (summonHold === hold) summonHold = null;
          return;
        });
        setToBeHad(false);
      }
      if (code === 'agent_unavailable' && !isQuietWhenUnavailable) notifyPressRefused(payload, keysWereHeld);
      if (code !== 'invalid_argument') return look(false).then(() => false);
      let isOfWords = 'request' in payload && !skipsKeyGuard;
      reportFault(Error(`sendToAgentSession fault: invalid_argument${isOfWords ? ' of words' : ''}`));
      if (!isOfWords) setToBeHad(false);
      return false;
    }
  };
  let withAnswerTimeout = (sending?: Dynamic) => Promise.race([sending, sleep(CHAT_SEND_TIMEOUT_MS).then(() => false)]);
  let deliverToSession = async (payload?: Dynamic, deliver?: Dynamic, withPresence?: Dynamic): Promise<Dynamic> => {
    let sendToAgentSession = room?.sendToAgentSession;
    if (typeof sendToAgentSession !== 'function') return 'failed';
    try {
      let sendOptions = withPresence
        ? {
            deliver: deliver,
          }
        : {
            deliver: deliver,
            attachPresence: false,
          };
      let sent = sendToAgentSession.call(room, payload, sendOptions);
      return (await withAnswerTimeout(Promise.resolve(sent).then(() => true))) ? 'taken' : 'failed';
    } catch (sendOptions: Dynamic) {
      let sent = isNonNullObject(sendOptions) ? sendOptions.code : null;
      if (sent === 'rate_limited') return 'tooSoon';
      if (sent !== 'invalid_argument') look(false);
      else if (withPresence) reportFault(Error('sendToAgentSession fault: invalid_argument of words'));
      else {
        reportFault(Error('sendToAgentSession fault: invalid_argument'));
        setToBeHad(false);
      }
      return 'failed';
    }
  };
  let sendAboutChartTo = (sendsNow?: Dynamic, label?: Dynamic, chartId?: Dynamic, sheetNumber?: Dynamic, askWords?: Dynamic) => {
    let request = cleanAskWords(askWords);
    let payload = {
      label: label,
      chartId: chartId,
      sheetNumber: sheetNumber,
      request: request,
    };
    if (!isViewId(chartId) || request === '') reportFault(Error('sendAboutChart fault: no id or no words'));
    else if (takesWords && !isNotBeside) return deliverToSession(payload, 'send', sendsNow);
    else if (toBeHad === true && !(isNotBeside && leavingLosesWork()))
      return sendsNow
        ? deliverToSession(payload, 'stage', true)
        : withAnswerTimeout(
            sendToSession(
              payload,
              {
                attachPresence: false,
              },
              true,
            ),
          ).then((sent?: Dynamic) => (sent ? 'taken' : 'failed'));
    return Promise.resolve('failed');
  };
  let chartSendInFlight: Dynamic = null;
  let startChartSend = (...args: Dynamic[]) => {
    let became = (sendAboutChartTo as Dynamic)(false, ...args).catch(() => 'failed');
    let inFlight = {
      chartId: args[1],
      became: became,
    };
    chartSendInFlight = inFlight;
    became
      .then((outcome?: Dynamic) => (outcome === 'taken' ? sleep(CHART_SEND_SETTLE_MS) : undefined))
      .then(() => {
        if (chartSendInFlight === inFlight) chartSendInFlight = null;
        return;
      });
    return became;
  };
  return {
    isToBeHad: () => toBeHad,
    isBesidePage: () => toBeHad === true && !isNotBeside,
    isKeptFromLeaving: () => isNotBeside && leavingLosesWork(),
    subscribe(listener?: Dynamic) {
      subscribers.add(listener);
      return () => void subscribers.delete(listener);
    },
    look() {
      if (toBeHad === null) dropAfterSilence();
      return look(false);
    },
    openAboutBlankSheet: (label?: Dynamic, sheetNumber?: Dynamic) =>
      sendToSession({
        label: label,
        isSheetBlank: true,
        sheetNumber: sheetNumber,
      }),
    openAboutChart(label?: Dynamic, chartId?: Dynamic, sheetNumber?: Dynamic) {
      if (isViewId(chartId))
        return sendToSession({
          label: label,
          chartId: chartId,
          sheetNumber: sheetNumber,
        });
      reportFault(Error('openAboutChart fault: not in the form of an id'));
      return Promise.resolve(false);
    },
    openAboutRule: (label: Dynamic, { ruleNumber: ruleNumber, ruleCount: ruleCount, sheetNumber: sheetNumber }: Dynamic) =>
      sendToSession(
        {
          label: label,
          ruleNumber: ruleNumber,
          ruleCount: ruleCount,
          sheetNumber: sheetNumber,
        },
        {
          attachPresence: false,
        },
      ),
    openAboutCells: (cells?: Dynamic) =>
      isNotBeside && leavingLosesWork()
        ? Promise.resolve(false)
        : sendToSession(
            {
              label: cells.range,
              ...cells,
            },
            {
              attachPresence: false,
            },
          ),
    openWithWhatWasPressed: (label?: Dynamic, extras?: Dynamic, pressed?: Dynamic, basePayload?: Dynamic) =>
      isNotBeside && leavingLosesWork()
        ? Promise.resolve(false)
        : sendToSession(
            {
              ...basePayload,
              label: label,
              ...extras,
              pressed: pressed,
            },
            {
              attachPresence: false,
            },
          ),
    onPressRefused(listener?: Dynamic) {
      pressRefusedListeners.add(listener);
      return () => void pressRefusedListeners.delete(listener);
    },
    takesWordsAtOnce: () => takesWords,
    sendAboutChart: (...args: Dynamic[]) => (sendAboutChartTo as Dynamic)(true, ...args),
    async sendPressAboutChart(...args: Dynamic[]): Promise<Dynamic> {
      let releaseKeys = keepKeysOffCells();
      let outcome = await ((chartSendInFlight?.chartId === args[1] ? chartSendInFlight.became : null) ??
        (startChartSend as Dynamic)(...args));
      if (outcome !== 'taken') releaseKeys(true);
      return outcome;
    },
  };
}
export const MAX_ASK_WORDS_LENGTH = 1000;
export const UNSHOWN_CHARACTERS_PATTERN =
  /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\p{Noncharacter_Code_Point}\u2800\uFFFD\u{16FE4}]/gu;
export const collapseWhitespace = (text?: Dynamic) => text.replaceAll(/\s+/gu, ' ').trim();
export const hasUnshownCharacters = (text?: Dynamic) => text.replaceAll(UNSHOWN_CHARACTERS_PATTERN, '') !== text;
export const cleanAskWords = (text?: Dynamic) =>
  collapseWhitespace(collapseWhitespace(text).slice(0, MAX_ASK_WORDS_LENGTH).replaceAll(UNSHOWN_CHARACTERS_PATTERN, ''));
export const pressedCellsOf = ({ sheetNumber: sheetNumber, range: range, pressed: pressed }: Dynamic) =>
  typeof sheetNumber === 'number' && typeof range === 'string' && pressed === undefined
    ? {
        sheetNumber: sheetNumber,
        range: range,
      }
    : null;
export const NO_CHAT_WITH_AGENT = {
  isToBeHad: () => false,
  isBesidePage: () => false,
  isKeptFromLeaving: () => false,
  subscribe: () => () => {},
  look: () => Promise.resolve(),
  openAboutBlankSheet: () => Promise.resolve(false),
  openAboutChart: () => Promise.resolve(false),
  openAboutRule: () => Promise.resolve(false),
  openAboutCells: () => Promise.resolve(false),
  openWithWhatWasPressed: () => Promise.resolve(false),
  onPressRefused: () => () => {},
  takesWordsAtOnce: () => false,
  sendAboutChart: () => Promise.resolve('failed'),
  sendPressAboutChart: () => Promise.resolve('failed'),
};
export const CHAT_SEND_TIMEOUT_MS = 4000;
export const LOOK_AGAIN_DELAYS_MS = [2500, 5000, 1e4, 20000];
export const LEAVE_CHECK_INTERVAL_MS = 250;
export const SUMMON_UNAVAILABLE_HOLD_MS = 60000;
export const CHART_SEND_SETTLE_MS = 1000;
