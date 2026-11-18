import type { Dynamic } from '../dynamic.ts';
import { isPromptDataTooLong } from '../agent/prompt-text.ts';
import { chartOfView } from '../charts/placed-views.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function toldCellsOfChartInput(cells?: Dynamic) {
  let [firstCount, lastCount] = [CHART_INPUT_FIRST_TEXTS, CHART_INPUT_LAST_TEXTS];
  let toldCells = cells.length <= firstCount + lastCount ? cells : [...cells.slice(0, firstCount), ...cells.slice(-lastCount)];
  return {
    count: cells.length,
    texts: toldCells.map(({ text: text }: Dynamic) => (text.length <= MAX_CHART_INPUT_TEXT_LENGTH ? text : null)),
  };
}
export function xlsxChartAsksInBatches(asks?: Dynamic) {
  let fitsInOneAsk = (batch?: Dynamic) => !isPromptDataTooLong(askToDescribeChartsForXlsx(batch).asked);
  let batches: Dynamic = [];
  for (let ask of asks as Dynamic) {
    if (!fitsInOneAsk([ask])) continue;
    let lastBatch = batches.at(-1);
    if (lastBatch !== undefined && fitsInOneAsk([...lastBatch, ask])) lastBatch.push(ask);
    else batches.push([ask]);
  }
  return batches.map(askToDescribeChartsForXlsx);
}
export function readXlsxChartDescriptions(answer: Dynamic, { viewIdByShortName: viewIdByShortName }: Dynamic) {
  let charts = isChartAnswerObject(answer) ? answer.charts : null;
  let chartList = Array.isArray(charts) ? charts : [];
  let descriptionsByViewId = new (Map as Dynamic)();
  for (let chart of chartList as Dynamic) {
    let shortName = isChartAnswerObject(chart) ? chart.id : null;
    let viewId = typeof shortName === 'string' ? viewIdByShortName.get(shortName) : undefined;
    if (!isChartAnswerObject(chart) || viewId === undefined || descriptionsByViewId.has(viewId)) continue;
    let description = chart.description;
    let isDescriptionValid = description !== undefined && isNestedNoDeeperThan(MAX_CHART_DESCRIPTION_DEPTH, description);
    descriptionsByViewId.set(viewId, {
      viewId: viewId,
      description: isDescriptionValid ? description : null,
    });
  }
  return [...descriptionsByViewId.values()];
}
export function chartsOfWorkbookForXlsx(reads: WorkbookReads) {
  return [
    ...new (Set as Dynamic)(
      reads
        .listSheets()
        .flatMap(({ sheetId: sheetId }: Dynamic) => reads.placementsIn(sheetId).map(({ viewId: viewId }: Dynamic) => viewId)),
    ),
  ].flatMap((viewId?: Dynamic) => {
    let view = reads.viewAsItStands(viewId);
    let chartSource = chartOfView(view);
    if (view === null || chartSource.kind === 'none') return [];
    return [
      {
        viewId: viewId,
        name: view.view.name,
        nodeId: chartSource.nodeId,
        inputs: chartSource.inputs,
      },
    ];
  });
}
export function describeChartsForXlsx(
  charts: Dynamic,
  { agent: agent, viewerAllowsAgent: viewerAllowsAgent, codeOfChart: codeOfChart, afterMs: afterMs, isFileStillWanted: isFileStillWanted }: Dynamic,
) {
  let descriptions: Dynamic = [];
  let isDone: Dynamic = false;
  let isOver = () => isDone;
  let isStillWanted = () => !isOver() && isFileStillWanted();
  let askInTurn = async ([ask, ...restOfAsks]: Dynamic): Promise<Dynamic> => {
    if (ask === undefined || !isStillWanted()) return;
    let reply = await agent.ask(ask.asked, () => {});
    if (isOver() || reply.kind === 'stopped' || reply.kind === 'notToBeHad') return;
    if (reply.kind === 'answered') (descriptions.push as Dynamic)(...readXlsxChartDescriptions(reply.answer, ask));
    await askInTurn(restOfAsks);
  };
  let askAll = async (): Promise<Dynamic> => {
    let chartsWithCode = await Promise.all(
      charts.map(async ({ nodeId: nodeId, ...chart }: Dynamic): Promise<Dynamic> => {
        let code = await codeOfChart(nodeId);
        return code === null
          ? []
          : [
              {
                ...chart,
                code: code,
              },
            ];
      }),
    );
    await askInTurn(xlsxChartAsksInBatches(chartsWithCode.flat()).slice(0, MAX_XLSX_CHART_ASKS));
  };
  return new (Promise as Dynamic)((resolve?: Dynamic, reject?: Dynamic) => {
    let finish = () => {
      isDone = true;
      resolve([...descriptions]);
    };
    let finishAfterMs = (ms?: Dynamic) =>
      afterMs(ms, () => {
        if (!isOver()) agent.stop();
        finish();
      });
    let start = async (): Promise<Dynamic> => {
      let describedLocally = (globalThis as Dynamic).__agentSheetsLocal?.chartsForXlsx;
      if (typeof describedLocally === 'function') {
        let told = await describedLocally();
        if (!isStillWanted()) return;
        let asked = new Set(charts.map(({ viewId: viewId }: Dynamic) => viewId));
        for (let chart of told as Dynamic)
          if (asked.has(chart?.viewId))
            descriptions.push({
              viewId: chart.viewId,
              description: chart.description ?? null,
            });
        return;
      }
      if (!(await agent.isAvailable()) || !isStillWanted()) return;
      if (!(await viewerAllowsAgent()) || !isStillWanted()) return;
      finishAfterMs(XLSX_CHART_DESCRIBING_MS);
      await askAll();
    };
    finishAfterMs(XLSX_CHART_PERMISSION_WAIT_MS);
    start().then(finish, reject);
  });
}
export const XLSX_CHART_DESCRIPTION_PROMPT = `The data is a JSON list of charts from a spreadsheet. Each has an "id", a "name", its "code" and its "inputs". The code is a JavaScript module that draws an SVG picture from the inputs. Each input is a grid of cells, {value, text} each, bound to a range of the spreadsheet: the rows from the top, each a list of cells from the left. Of each input you are told its first row and its first column as they are now: how many cells it has ("count") and their "texts". Of more than 40 cells you are told the first 30 and the last 10. A null stands for a text that is too long to tell.

The spreadsheet is being saved as an .xlsx file. For each chart, describe the file's own kind of chart that shows the same thing, in the closed grammar below. A description names inputs, never cells and never numbers. A program checks it against the cells and writes the file's chart from it.

Description =
    {"kind":"bar", "direction":"vertical"|"horizontal", "stacking":Stacking, "data":Data}
  | {"kind":"line", "stacking":Stacking, "data":Data}
  | {"kind":"area", "stacking":Stacking, "data":Data}
  | {"kind":"pie", "data":Data}        slices that meet in the middle, exactly one series
  | {"kind":"doughnut", "data":Data}   slices of a ring, each drawn between an inner and an outer radius, exactly one series
  | {"kind":"scatter", "data":Data}    the categories are the numbers that say how far along each point lies
  | {"kind":"none", "why":"worksOutItsNumbersInCode"|"noSuchKind"}
Stacking = "none" | "stacked" | "stackedToTheWhole"
Data =
    {"from":"table", "input":NAME, "seriesAre":"columns"|"rows", "labelsLeftOut":[TEXT, ...]}
      One input holds everything. Its first row holds headings and its first column holds labels.
  | {"from":"lists", "categories":NAME, "series":[NAME, ...], "firstCellIsAHeading":true|false}
      Each input is one column or one row of cells.

Rules:
- "seriesAre" says what one color, one line or one pie stands for: a column of the table, named by its heading, or a row of it, named by its label.
- "labelsLeftOut" lists the exact texts of every heading and every label whose column or row the chart does not draw, such as "Total". If the code picks out one column by its heading, list all the other headings. Rows with a blank label, and columns or rows with no number in them, are left out anyway: do not list those. If the chart does not draw a column or row whose heading or label you are not told, answer {"kind":"none","why":"noSuchKind"}.
- "firstCellIsAHeading" is true if the code skips the first cell of each list, or uses it as a name.
- Points that lie along dates or times are "line", whether or not a line joins them, and even if the code places them by how far apart the dates are. A cell that shows a date or a time holds no number, which "scatter" needs.
- "stackedToTheWhole" is for stacks that are all as long, where each part is its share of the whole.
- If the main marks (the bars, lines, areas, slices or points) show numbers that the code works out and that no cell holds, such as counts, sums, averages or bins, answer {"kind":"none","why":"worksOutItsNumbersInCode"}. Scaling a cell's number to fit the picture is not working out a number. Nor is a share that "stackedToTheWhole" or a pie shows by itself.
- If the main marks show the cells' own numbers and something beside them is worked out, such as a line at the average or a printed total, describe the main marks and leave the rest out.
- If no kind above shows the same thing, such as one big number, a heat map, a gauge or a timeline, answer {"kind":"none","why":"noSuchKind"}.
- Leave out whatever else the grammar has no word for, such as a target line or a caption, and describe the rest.

Answer with only this JSON, with one item for each chart, in the order given: {"charts":[{"id":ID,"description":Description}, ...]}`;
export const CHART_INPUT_FIRST_TEXTS = 30;
export const CHART_INPUT_LAST_TEXTS = 10;
export const MAX_CHART_INPUT_TEXT_LENGTH = 60;
export const chartToldForXlsx = ({ name: name, code: code, inputs: inputs }: Dynamic, id?: Dynamic) => ({
  id: id,
  name: name,
  inputs: Object.fromEntries(
    Object.entries(inputs).map(
      ([inputName, cells]: Dynamic) => [
        inputName,
        {
          firstRow: toldCellsOfChartInput(cells[0] ?? []),
          firstColumn: toldCellsOfChartInput(cells.flatMap((row?: Dynamic) => row.slice(0, 1))),
        },
      ],
    ),
  ),
  code: code,
});
export const askToDescribeChartsForXlsx = (charts?: Dynamic) => {
  let named = charts.map(
    (chart?: Dynamic, index?: Dynamic) => ({
      chart: chart,
      shortName: `c${index + 1}`,
    }),
  );
  return {
    asked: {
      words: XLSX_CHART_DESCRIPTION_PROMPT,
      data: JSON.stringify(named.map(({ chart: chart, shortName: shortName }: Dynamic) => chartToldForXlsx(chart, shortName))),
    },
    viewIdByShortName: new (Map as Dynamic)(named.map(({ chart: chart, shortName: shortName }: Dynamic) => [shortName, chart.viewId])),
  };
};
export const isChartAnswerObject = (value?: Dynamic) => typeof value === 'object' && value !== null;
export const MAX_CHART_DESCRIPTION_DEPTH = 3;
export const isNestedNoDeeperThan = (depth?: Dynamic, value?: Dynamic) =>
  !isChartAnswerObject(value) || (depth > 0 && Object.values(value).every((child?: Dynamic) => isNestedNoDeeperThan(depth - 1, child)));
export const XLSX_CHART_DESCRIBING_MS = 45000;
export const XLSX_CHART_PERMISSION_WAIT_MS = 900000;
export const MAX_XLSX_CHART_ASKS = 4;
