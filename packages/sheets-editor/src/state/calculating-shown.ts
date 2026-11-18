export function endCalculatingShown(calculatingShown: CalculatingShown): CalculatingShown {
  if (calculatingShown.kind === 'notUnderWay' || calculatingShown.isOver) return calculatingShown;
  return calculatingShown.wait === null
    ? CALCULATING_NOT_SHOWN
    : {
        ...calculatingShown,
        isOver: true,
      };
}
export function calculatingShownAfterWait(calculatingShown: CalculatingShown, wait: Wait): CalculatingShown {
  if (calculatingShown.kind === 'notUnderWay' || calculatingShown.wait !== wait) return calculatingShown;
  return calculatingShown.isOver
    ? CALCULATING_NOT_SHOWN
    : {
        ...calculatingShown,
        wait: null,
      };
}
export function calculatingToShow(calculatingShown: CalculatingShown, calculationTookTooLong: boolean): CalculatingToShow {
  if (calculatingShown.kind === 'underWay') return 'underWay';
  return calculationTookTooLong ? 'wrong' : 'done';
}
export const CALCULATING_NOT_SHOWN: CalculatingNotUnderWay = {
  kind: 'notUnderWay',
};
export const startCalculatingShown = (calculatingShown: CalculatingShown): CalculatingShown =>
  calculatingShown.kind === 'underWay' && !calculatingShown.isOver
    ? calculatingShown
    : {
        kind: 'underWay',
        isOver: false,
        wait: {
          ms: 500,
        },
      };
export const calculatingShownWait = (calculatingShown: CalculatingShown): Wait | null =>
  calculatingShown.kind === 'underWay' ? calculatingShown.wait : null;
export interface Wait {
  ms: number;
}
export interface CalculatingNotUnderWay {
  kind: 'notUnderWay';
}
export interface CalculatingUnderWay {
  kind: 'underWay';
  isOver: boolean;
  wait: Wait | null;
}
export type CalculatingShown = CalculatingNotUnderWay | CalculatingUnderWay;
/** What the calculating sign shows: still under way, or how the last calculation ended. */
export type CalculatingToShow = 'underWay' | 'wrong' | 'done';
