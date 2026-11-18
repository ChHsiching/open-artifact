/** The `via` an edit stamp carries when the agent made the change. */
export const AGENT_EDIT_VIA = 'agent';

/** One stored document (a dataset, a page file, `dash/meta`, `dash/params`) as its data. */
export type VersionDocument = Record<string, unknown>;

/** The `edit` stamp of a document: a person's (`by`, `byAt`) and / or the agent's (`via`, `at`), as epoch milliseconds. */
export interface DocumentEditStamp {
  by?: string;
  byAt?: number;
  via?: string;
  at?: number;
}

/** Documents to write (path, data) and paths to delete, in order. */
export interface DocumentWritePlan {
  write: [string, VersionDocument][];
  remove: string[];
}
