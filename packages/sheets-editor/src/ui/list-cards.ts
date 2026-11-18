import type { Dynamic } from '../dynamic.ts';
export function stepListIndex(index?: Dynamic, step?: Dynamic, count?: Dynamic) {
  if (count === 0) return null;
  if (index === null) return step === 1 ? 0 : count - 1;
  return (index + step + count) % count;
}
export function openCardAtRow(ofRow?: Dynamic, rows?: Dynamic, how?: Dynamic) {
  let [firstRow] = rows;
  if (firstRow === undefined) return null;
  let wentTo = how === 'restingPointer' ? null : (rows.find((row?: Dynamic) => row.isChosen) ?? firstRow).key;
  return {
    ofRow: ofRow,
    wentTo: wentTo,
  };
}
export function listCardOfRow(card?: Dynamic, rowsWithCards?: Dynamic, rowsOf?: Dynamic) {
  if (card === null || !rowsWithCards.includes(card.ofRow)) return null;
  let rows = rowsOf(card.ofRow);
  let highlightedIndex = rows.findIndex(({ key: key }: Dynamic) => key === card.wentTo);
  let { ofRow: ofRow, isAsOpened: isAsOpened } = card;
  return {
    ofRow: ofRow,
    rows: rows,
    highlightedRow: highlightedIndex === -1 ? null : highlightedIndex,
    ...(isAsOpened && {
      isAsOpened: isAsOpened,
    }),
  };
}
export const dropUndrawableCard = (cards?: Dynamic, state?: Dynamic, reads?: Dynamic) =>
  cards.card(state) !== null && cards.drawn(state, reads) === null ? cards.withCard(state, null) : state;
