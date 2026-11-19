import { TableView } from 'prosemirror-tables';
import type { ViewMutationRecord } from 'prosemirror-view';

/** A table drawn by the editor, whose wrapper the table plugin may mark as cut off (`data-clip`) without the editor reading it again. */
export class FitTableView extends TableView {
  override ignoreMutation(record: ViewMutationRecord): boolean {
    return (record.type === 'attributes' && record.target === this.dom && record.attributeName === 'data-clip') || super.ignoreMutation(record);
  }
}
