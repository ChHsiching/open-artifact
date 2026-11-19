import type { Dynamic } from '../dynamic.ts';
import { stockKindOfChartCode } from './widget-nodes.ts';
import { canSwapChartKind, readsRowsAlone } from './chart-kind-fit.ts';
export { canSwapChartKind, readsRowsAlone };
import { STOCK_CHART_PROGRAMS } from './stock-programs.ts';
import { chartEditRequest, isForChatAnswer, readChartCodeAnswer } from './chart-code-ask.ts';
import { nodeIdOfRef, nodeRefOf } from './placed-views.ts';
export async function editChartWithAgent(
  { charts: charts, agent: agent }: Dynamic,
  { nodeId: nodeId, inputs: inputs }: Dynamic,
  asked?: Dynamic,
  mostUnits?: Dynamic,
  wantedKind: Dynamic = null,
  isStopped: Dynamic = () => false,
): Promise<Dynamic> {
  let source = await charts.sourceOf(nodeId);
  if (isStopped()) return 'stopped';
  if (source === null) return 'notChanged';
  let stockKind = stockKindOfChartCode(source.code);
  if (wantedKind !== null && stockKind === wantedKind) return 'notChanged';
  let isKindSwap = wantedKind !== null && canSwapChartKind(inputs, wantedKind);
  if (isKindSwap) agent.stop();
  let newCode =
    (isKindSwap ? STOCK_CHART_PROGRAMS[wantedKind] : null) ??
    (await askAgentForChartCode(
      agent,
      chartEditRequest(
        {
          code: source.code,
          inputs: inputs,
        },
        asked,
        mostUnits,
      ),
    ));
  if (typeof newCode !== 'string') return newCode.whyNone;
  if (newCode.trim() === source.code.trim()) return 'notChanged';
  if (isStopped()) return 'stopped';
  let preview = await charts.makePreview(newCode);
  return typeof preview === 'string'
    ? 'notChanged'
    : {
        preview: preview.nodeId,
        pubOfFrom: source.pub,
      };
}
export async function askAgentForChartCode(agent?: Dynamic, request?: Dynamic): Promise<Dynamic> {
  if (request === null)
    return {
      whyNone: 'tooLarge',
    };
  let reply = await agent.ask(request, () => {
    return;
  });
  if (reply.kind === 'stopped')
    return {
      whyNone: 'stopped',
    };
  if (reply.kind === 'notToBeHad')
    return {
      whyNone: 'noAgent',
    };
  if (reply.kind === 'answered' && isForChatAnswer(reply.answer))
    return {
      whyNone: 'forChat',
    };
  return (
    (reply.kind === 'answered' ? readChartCodeAnswer(reply.answer) : null) ?? {
      whyNone: 'notChanged',
    }
  );
}
export function createChartEditsByAgent(charts?: Dynamic, agent?: Dynamic) {
  let askNumber: Dynamic = 0;
  return {
    /** Whether charts can be changed at all: a kind swap needs the page alone, any other change the agent too (canAskAgent). */
    isToBeHad: async (): Promise<Dynamic> => charts.isToBeHad,
    canAskAgent: async (): Promise<Dynamic> => charts.isToBeHad && (await agent.isAvailable()),
    /** The stock kind this chart's code is, or null: another chart's code, or one that could not be read. */
    async kindOf(nodeId?: Dynamic): Promise<Dynamic> {
      let source = await charts.sourceOf(nodeId);
      return source === null ? null : stockKindOfChartCode(source.code);
    },
    async ask(chartAsk?: Dynamic, asked?: Dynamic, mostUnits?: Dynamic, wantedKind?: Dynamic): Promise<Dynamic> {
      askNumber += 1;
      let thisAsk = askNumber;
      let outcome = await editChartWithAgent(
        {
          charts: charts,
          agent: agent,
        },
        chartAsk,
        asked,
        mostUnits,
        wantedKind,
        () => thisAsk !== askNumber,
      );
      if (thisAsk === askNumber) return outcome;
      if (typeof outcome === 'object') charts.discard(outcome.preview);
      return 'stopped';
    },
    giveUp() {
      askNumber += 1;
      agent.stop();
    },
    pointAt: (...input: Dynamic[]) => charts.pointAt(...input),
    discard: (nodeId?: Dynamic) => charts.discard(nodeId),
  };
}
export function createChartNodeCopier(charts?: Dynamic, reportFault?: Dynamic) {
  let copyNode = async (nodeId?: Dynamic): Promise<Dynamic> => {
    try {
      return await charts.copyOf(nodeId);
    } catch (fault: Dynamic) {
      reportFault(fault);
      return 'notNow';
    }
  };
  let discardCopies = (copies?: Dynamic) => {
    for (let { copy: copyRef } of copies as Dynamic) {
      let nodeId = nodeIdOfRef(copyRef);
      if (nodeId !== null) charts.discard(nodeId);
    }
  };
  let copyAll = async ([sourceRef, ...otherRefs]: Dynamic, copies?: Dynamic): Promise<Dynamic> => {
    if (sourceRef === undefined) return copies;
    let nodeId = nodeIdOfRef(sourceRef);
    let copied = nodeId === null ? 'never' : await copyNode(nodeId);
    if (typeof copied !== 'string')
      return copyAll(otherRefs, [
        ...copies,
        {
          source: sourceRef,
          copy: nodeRefOf(copied.nodeId),
        },
      ]);
    discardCopies(copies);
    return copied;
  };
  return {
    copy: (refs?: Dynamic) => copyAll(refs, []),
    discard: discardCopies,
  };
}
