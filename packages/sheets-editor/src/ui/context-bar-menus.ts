import type { Dynamic } from '../dynamic.ts';
import { isPaneMenuOfContextBar } from '../state/context-bar.ts';
export function contextBarMenuHandlers({
  store: store,
  noted: noted,
  note: note,
  onCardAsked: onCardAsked,
}: Dynamic) {
  let afterEventsSettle = (then?: Dynamic) => {
    let notedMenu = noted.current;
    if (notedMenu === null) return;
    store.lookOnceEventsAreFinished(() => {
      if (noted.current !== notedMenu) return;
      if (store.getView().contextBarMenu !== null) return;
      noted.current = null;
      note(false, null);
      then();
    });
  };
  let handlers = {
    onOpenChange(menu?: Dynamic, isOpen?: Dynamic, finalFocus?: Dynamic, filterBarOf?: Dynamic) {
      if (isOpen) noted.current = menu;
      else if (noted.current === menu) noted.current = null;
      store.dispatch({
        kind: 'contextBarMenuChanged',
        menu: menu,
        isOpen: isOpen,
        ...(filterBarOf !== undefined && {
          ofFilterBarFor: filterBarOf,
        }),
      });
      note(noted.current !== null, isOpen ? null : finalFocus);
      if (!isOpen) return;
      let opensInPane = menu === 'conditionalFormatting' && !store.getView().doRulesOpenInCard;
      if (isPaneMenuOfContextBar(menu) && !opensInPane) onCardAsked();
    },
    onRulesAskedByRow(_rowKind?: Dynamic, isFromPane?: Dynamic) {
      if (!isFromPane && store.getView().conditionalFormats?.drawnAs !== 'pane') return handlers.onOpenChange('conditionalFormatting', true, null);
      store.dispatch({
        kind: 'conditionalFormatsAsked',
        by: 'menu',
      });
    },
    onNoMenuInState: () => afterEventsSettle(() => {}),
  };
  return handlers;
}
