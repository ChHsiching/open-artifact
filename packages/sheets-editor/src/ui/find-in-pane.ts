import { isSidePaneShownAsPane } from '../state/queries.ts';
import { closeFind } from './find.ts';
import type { PageState } from '../state/initial-state.ts';
export const closeFindWithReplaceInPane = (state: PageState) =>
  state.find?.isReplaceShown === true && isSidePaneShownAsPane(state) ? closeFind(state) : state;
