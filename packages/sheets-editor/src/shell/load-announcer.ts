import type { Dynamic } from '../dynamic.ts';
import { sheetLoadedText } from './sheet-status.ts';
export function createWordsOfLoad(announce?: Dynamic, page?: Dynamic, clock?: Dynamic) {
  let load: Dynamic = null;
  let generation: Dynamic = 0;
  let areWordsToCome: Dynamic = false;
  let listeners = new (Set as Dynamic)();
  let setWordsToCome = (next?: Dynamic) => {
    if (next === areWordsToCome) return;
    areWordsToCome = next;
    for (let listener of listeners as Dynamic) listener();
  };
  let clearWords = () => {
    announce('');
    setWordsToCome(false);
  };
  let after = (delayMs?: Dynamic, then?: Dynamic) => {
    let generationAtStart = generation;
    clock.setTimeout(() => {
      if (generation === generationAtStart) then();
    }, delayMs);
  };
  return {
    areWordsToCome: () => areWordsToCome,
    onChanged(listener?: Dynamic) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    loadIsOnItsWay(inWords?: Dynamic) {
      if (load !== null) {
        if (load.isInLine && load.inWords !== inWords) announce(inWords);
        load.inWords = inWords;
        return;
      }
      let nextLoad = {
        inWords: inWords,
        isInLine: false,
      };
      load = nextLoad;
      generation += 1;
      setWordsToCome(true);
      after(LOAD_WORDS_DELAY_MS, () => {
        if (page.isLoadUnseen()) return;
        nextLoad.isInLine = true;
        announce(nextLoad.inWords);
      });
    },
    loadHasStopped() {
      load = null;
      generation += 1;
      clearWords();
    },
    cellsAreDrawn() {
      if (load === null) return;
      load = null;
      generation += 1;
      if (page.isLoadUnseen()) return clearWords();
      after(LOADED_WORDS_DELAY_MS, () => {
        if (page.doCellsHaveKeyboard()) return clearWords();
        announce(sheetLoadedText());
        after(WORDS_TO_COME_END_MS, () => setWordsToCome(false));
        after(LOADED_WORDS_CLEAR_MS, () => announce(''));
      });
    },
    cellsTakeKeyboard() {
      if (load !== null) return;
      generation += 1;
      clearWords();
    },
  };
}
export const LOAD_WORDS_DELAY_MS = 2000;
export const LOADED_WORDS_DELAY_MS = 1000;
export const LOADED_WORDS_CLEAR_MS = 5000;
export const WORDS_TO_COME_END_MS = 1500;
export const NO_WORDS_OF_LOAD = {
  areWordsToCome: () => false,
  onChanged: () => () => {},
};
