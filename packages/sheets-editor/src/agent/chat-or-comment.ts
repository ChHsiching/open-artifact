import type { Dynamic } from '../dynamic.ts';
import { isCoarsePointerNow } from '../app/media-queries.ts';
import { doesSelectionShowError } from './ask-agent-menu.ts';
export function isChatBesidePage(viewOf?: Dynamic, host?: Dynamic, isPointerCoarse: Dynamic = isCoarsePointerNow()) {
  if (host.chatWithAgent.isBesidePage()) return true;
  if (!host.isInStaffTrials() || isPointerCoarse) return false;
  let { isToBeHad: isChatToBeHad, isKeptFromLeaving: isChatKeptFromLeaving } = host.chatWithAgent;
  if (isChatToBeHad() === true && !isChatKeptFromLeaving()) return true;
  let view = viewOf();
  return view !== null && askAgentViaForView(view, host, isPointerCoarse) === 'comment';
}
export const isCommentToAgentOffered = (where?: Dynamic) =>
  where.isFieldOnTop && where.isChatToBeHad === false && where.isCommentOffered && !where.doCellsShowError && where.couldCommentGoToAgent;
export const canAskAgentHere = (where?: Dynamic) => where.isChatToBeHad !== false || isCommentToAgentOffered(where);
export const askAgentVia = (where?: Dynamic, preferred: Dynamic = 'chat') =>
  isCommentToAgentOffered(where) ||
  (preferred === 'comment' && where.isFieldOnTop && where.isChatToBeHad === true && where.isCommentOffered && !where.doCellsShowError)
    ? 'comment'
    : 'chat';
export const shouldEnterCommentForAgent = (where?: Dynamic, askedAbout?: Dynamic, page?: Dynamic) =>
  askAgentVia(where) === 'comment' &&
  page.selected?.sheetNumber === askedAbout.sheetNumber &&
  page.selected.range === askedAbout.range &&
  (page.place === 'inCells' || page.place === 'pausedAtCells' || (page.place === 'inMenu' && page.isInMenuThatPressShut)) &&
  page.hasPauseHeld &&
  !page.isEventUnfinished &&
  page.areCellsInView;
export const whatAskFieldDoes = (field?: Dynamic) => {
  if (field.isPlaceToAsk && field.isAgentToBeHadForTools) return 'tools';
  return field.canAskAgent ? 'agent' : 'nothing';
};
export const askAgentViaForView = (
  view: Dynamic,
  { isInStaffTrials: isInStaffTrials, chatWithAgent: chatWithAgent, comments: comments }: Dynamic,
  isPointerCoarse: Dynamic = isCoarsePointerNow(),
) => {
  let isChatKeptFromLeaving = chatWithAgent.isKeptFromLeaving();
  let where = {
    isFieldOnTop: isInStaffTrials() && !isPointerCoarse,
    isChatToBeHad: chatWithAgent.isToBeHad() ?? (isChatKeptFromLeaving || null),
    isCommentOffered: view.isCommentOffered,
    doCellsShowError: doesSelectionShowError({
      ...view,
      selectedRange: null,
    }),
    couldCommentGoToAgent: comments.couldSendToAgentWhenLastAnswered(),
  };
  return askAgentVia(where, isChatKeptFromLeaving ? 'comment' : 'chat');
};
export const watchAgentAskedUnderAt = (controller?: Dynamic, host?: Dynamic, askInChat?: Dynamic, isPointerCoarse?: Dynamic) =>
  controller.onAgentAskedUnderAt((isAlreadyAnswered?: Dynamic) => {
    if (askAgentViaForView(controller.getView(), host, isPointerCoarse) !== 'comment') return askInChat();
    if (!isAlreadyAnswered)
      controller.dispatch({
        kind: 'commentChosen',
        isForAgent: true,
      });
    return;
  });
