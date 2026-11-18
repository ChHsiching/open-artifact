/** How the suggestion cards sit right of the text when there is no margin column. */

/** A margin card's width, and its distance from the text. */
export const CARD_WIDTH = 280;
export const CARD_OFFSET = 20;

/** Whether the cards fit right of the text inside the scroll area. */
export function marginFits(textRight: number, scrollerRight: number): boolean {
  return scrollerRight - textRight >= CARD_OFFSET + CARD_WIDTH + 12;
}
