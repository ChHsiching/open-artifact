import type { Dynamic } from '../dynamic.ts';
import { askAgentForChartCode } from './agent-edits.ts';
import { newChartRequest } from './chart-code-ask.ts';
import { STOCK_CHART_PROGRAMS } from './stock-programs.ts';
export async function addChartOfNode(nodeId?: Dynamic, add?: Dynamic, discard?: Dynamic): Promise<Dynamic> {
  let added = await add(nodeId);
  if (typeof added === 'object')
    return {
      nodeId: nodeId,
      ...added,
    };
  if (added !== 'unsure') discard(nodeId);
  return added === 'full' ? 'full' : 'notMade';
}
export function createChartWriterByAgent(charts?: Dynamic, agent?: Dynamic) {
  let writeNumber: Dynamic = 0;
  return {
    isToBeHad: async (): Promise<Dynamic> => charts.isToBeHad && (await agent.isAvailable()),
    async write(inputs?: Dynamic, asked?: Dynamic, mostUnits?: Dynamic): Promise<Dynamic> {
      writeNumber += 1;
      let thisWrite = writeNumber;
      let code = await askAgentForChartCode(agent, newChartRequest(inputs, asked, mostUnits));
      if (thisWrite !== writeNumber) return 'stopped';
      if (typeof code !== 'string') return code.whyNone;
      let preview = await charts.makePreview(code);
      if (thisWrite === writeNumber) return typeof preview === 'string' ? 'notChanged' : preview;
      if (typeof preview !== 'string') charts.discard(preview.nodeId);
      return 'stopped';
    },
    giveUp() {
      writeNumber += 1;
      agent.stop();
    },
    discard: (nodeId?: Dynamic) => charts.discard(nodeId),
  };
}
export async function insertChartWrittenByAgent(
  deps: Dynamic,
  inputs: Dynamic,
  { asked: asked, mostUnitsOfAsked: mostUnitsOfAsked }: Dynamic,
): Promise<Dynamic> {
  let preview = await deps.agent.write(inputs, asked, mostUnitsOfAsked);
  if (typeof preview === 'string') return preview;
  return addChartOfNode(preview.nodeId, deps.add, (nodeId?: Dynamic) => deps.agent.discard(nodeId));
}
export const NO_CHART_MAKER = {
  isToBeHad: false,
  make: () => Promise.resolve('notMade'),
};
export const createStockChartMaker = (charts?: Dynamic) => ({
  get isToBeHad() {
    return charts.isToBeHad;
  },
  async make(kind?: Dynamic, add?: Dynamic): Promise<Dynamic> {
    let preview = await charts.makePreview(STOCK_CHART_PROGRAMS[kind]);
    if (typeof preview === 'string') return preview === 'refused' ? 'codeRefused' : 'notMade';
    return addChartOfNode(preview.nodeId, add, (nodeId?: Dynamic) => charts.discard(nodeId));
  },
});
