/** The call that sets one key of the doc's display record. */
import type { DocMember } from '@open-artifact/runtime/doc-api';
import type { DocDisplay } from '../app/store.ts';

export const displayMember = <K extends keyof DocDisplay>(key: K, value: DocDisplay[K]): DocMember => ({
  verb: 'update',
  object: 'project',
  payload: { kind: 'patch', patch: [{ op: 'set', path: ['display', key], value }] },
});
