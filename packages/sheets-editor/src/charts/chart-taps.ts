import type { Dynamic } from '../dynamic.ts';
export function createChartTapTracker() {
  let tap: Dynamic = null;
  let listeners = new (Map as Dynamic)();
  return {
    cameDown({ pointerId: pointerId, isTrusted: isTrusted }: Dynamic, chartOn?: Dynamic, charts?: Dynamic) {
      let chart = charts.find(({ placementId: placementId }: Dynamic) => placementId === chartOn?.placementId);
      tap =
        isTrusted && chartOn !== null && chart !== undefined
          ? {
              pointerId: pointerId,
              on: chartOn,
              stood: chart.box,
            }
          : null;
    },
    forget() {
      tap = null;
    },
    letGo(
      { pointerId: pointerId, isTrusted: isTrusted, button: button }: Dynamic,
      { isTap: isTap, areEventsFinished: areEventsFinished, charts: charts }: Dynamic,
    ) {
      if (tap?.pointerId !== pointerId) return null;
      let { on: chartOn, stood: stoodAt } = tap;
      tap = null;
      let chart = charts.find(({ placementId: placementId }: Dynamic) => placementId === chartOn.placementId);
      let isChartSelected = chart?.isSelected === true && (!chart.isHeld || chart.isHeldOnTheSpot);
      let isChartUnmoved = chart?.box.left === stoodAt.left && chart.box.top === stoodAt.top;
      return isTrusted && button === 0 && isTap && areEventsFinished && isChartSelected && isChartUnmoved ? chartOn : null;
    },
    hear(topic?: Dynamic, listener?: Dynamic) {
      listeners.set(topic, listener);
      return () => {
        if (listeners.get(topic) === listener) listeners.delete(topic);
      };
    },
    tell: (topic?: Dynamic, told?: Dynamic) => listeners.get(topic)?.(told),
  };
}
