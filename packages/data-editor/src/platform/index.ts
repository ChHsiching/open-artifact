/** The page's platform: boot, presence, the viewer, uploads, the agent's activity and small page helpers. */

export { startDataPage, showUnavailable } from './boot.ts';
export { createPresenceReporter, useDashboardPresence, type DashboardPresenceInput, type PresenceReporter, type PresenceReporterOptions } from './presence.ts';
export { EDIT_COUNT_COALESCE_MS, getEditCount, recordDocumentEdit, subscribeEditCount } from './edit-count.ts';
export { getCurrentViewer, useCurrentViewer, type ViewerIdentity } from './viewer.ts';
export { useToolbarAnnouncements } from './announcements.ts';
export { deleteAsset, resolveStoredAssetUrl, uploadAsset, uploadDatasetBlob, type UploadedAsset, type UploadRefusal } from './assets.ts';
export { WORKING_GRACE_MS, useAgentActivity, watchAgentActivity, type AgentActivity, type AgentActivityState } from './agent-activity.ts';
export { applyPageLanguage, followColorScheme, textDirection } from './color-scheme.ts';
export { blockHeldKeyActivation } from './keys.ts';
export { getChangedMetadataPatch } from './metadata.ts';
