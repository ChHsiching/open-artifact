import type { Dynamic } from '../dynamic.ts';
import { MAX_CELLS_SEEN } from '../selection/cells-seen.ts';
import { commandsNameableFromWords, commandsFromWordsRequest, commandIdsAnswered } from './commands-from-words.ts';
export function commandScopeOfSelection({ areas: [onlyArea, ...otherAreas], cellsAre: cellsAre }: Dynamic) {
  if (
    !(
      onlyArea !== undefined &&
      otherAreas.length === 0 &&
      onlyArea.rowCount > 0 &&
      onlyArea.columnCount > 0 &&
      onlyArea.rowCount * onlyArea.columnCount <= MAX_CELLS_SEEN
    )
  )
    return 'none';
  if (cellsAre === 'date') return 'forDates';
  return cellsAre === 'number' || cellsAre === 'empty' ? 'all' : 'none';
}
export function makeAskForCommands(agentForCommands?: Dynamic, selectionInfo?: Dynamic) {
  let stop = () => agentForCommands.stop();
  return async (words?: Dynamic, commands?: Dynamic, signal?: Dynamic): Promise<Dynamic> => {
    let selection = selectionInfo();
    let nameableScope = commandsNameableFromWords(commands, commandScopeOfSelection(selection));
    let request = commandsFromWordsRequest(words, selection, nameableScope);
    if (request === null) return [];
    signal.throwIfAborted();
    signal.addEventListener('abort', stop, {
      once: true,
    });
    try {
      let reply = await agentForCommands.ask(request, () => {
        return;
      });
      if (reply.kind !== 'answered') throw Error(`no answer: ${reply.kind}`);
      return commandIdsAnswered(reply.answer, nameableScope);
    } finally {
      signal.removeEventListener('abort', stop);
    }
  };
}
