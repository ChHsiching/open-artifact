/**
 * The Shell: the daemon's page at `/a/<id>` that frames an artifact page
 * and draws the shared top bar (title, comments, share, export, ask agent).
 *
 * Two `postMessage` protocols meet in it, each keyed by an `open-artifact` field:
 *
 * - **chrome** (Shell ⇄ artifact page, in the iframe named
 *   {@link SHELL_FRAME_NAME}): the page reports what it can do and answers
 *   commands. The page side is `connectShell()` in `@open-artifact/runtime`.
 * - **capability broker** (also Shell ⇄ page): `window.openartifact`
 *   calls travel to the Shell, which runs them against the page's backend
 *   and answers. This is the design of frame runtime
 *   (`__frame_cap*` messages): the page asks for a capability
 *   (`cap_want` → `cap_grant`, with per-capability config so some methods
 *   need no round trip), calls it (`cap` → `cap_r`), the Shell can ask for
 *   more time (`cap_ack`), pushes events (`cap_ev`), and cuts calls that a
 *   restarted broker may never have run (`cap_rewired`, keyed by `gen`).
 *   A page whose Shell does not answer `cap_want` falls back to its own
 *   backend, so older Shells keep working.
 * - **host** (Shell ⇄ the host app that embeds the Shell, e.g. a harness's
 *   own artifact pane): the host offers sessions and a toolbar; the Shell
 *   asks it to start or open sessions.
 *
 * Messages only go to, and are only accepted from, the origin each side
 * named.
 */

/** Name of the iframe the Shell puts the artifact page in. */
export const SHELL_FRAME_NAME = 'open-artifact-shell';

/** URL parameters the Shell adds to the page URL. */
export const SHELL_PARAMS = {
  /** The Shell's origin. */
  shell: 'open_artifact_shell',
  /** The artifact id. */
  id: 'open_artifact_id',
  /** A comment thread to open on load. */
  comment: 'comment',
  /** A panel of the Shell to open on load: `share` (the Share panel) or `export` (its Export tab). */
  panel: 'panel',
} as const;

/** Version of the chrome protocol. */
export const CHROME_PROTOCOL = 1;

// ---- chrome: Shell ⇄ page ----------------------------------------------------------------------------------------

/** The page's save state. */
export type ChromeSaved = 'saved' | 'saving' | 'unsaved' | 'reconnecting' | 'readonly';

/** Why a page action or export format is disabled. */
export type ChromeWhy = 'older_version' | 'agent_working' | 'draft_open' | 'comments_on' | 'needs_agent' | 'unsaved' | 'other';

/**
 * A page action the Shell offers (its menu, its save indicator). Built-in
 * ids the Shell names itself: `save_now`, `open_find`, `undo`, `redo`,
 * `edit_page`, `use_page`, `comment_selection`, `open_page_list`,
 * `hand_off_code`; `chat_toggle` is not shown (the Shell has Ask).
 * Other ids show `label`.
 */
export interface ChromeAction {
  /** `^[a-z][a-z0-9_-]{0,31}$` */
  id: string;
  label?: string;
  disabled?: boolean;
  why?: ChromeWhy;
}

/** An export format the Shell lists in its Export tab (run with `export_format`). */
export interface ChromeFormat {
  /** `^[a-z0-9]{1,8}$`, e.g. `pdf`, `pptx`, `png`. */
  format: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  why?: ChromeWhy;
  /** Why it is disabled, in the page's own words (at most 160 characters); wins over `why`. */
  disabledReason?: string;
  /** The page asks the person for options before exporting. */
  interactive?: boolean;
  /** The row opens something first (a dialog) instead of downloading at once: a chevron for the download arrow. `interactive` shows it too. */
  more?: boolean;
  /** Kinds of the format (e.g. one slide or all; at most 16); each is its own entry. */
  variants?: { id: string; label?: string; disabled?: boolean; disabledReason?: string }[];
}

/**
 * What the Shell draws for the page, sent with `chrome_hello`. A page whose
 * Shell draws `saved` hides its own save badge; one whose Shell does not
 * (an older Shell sends no `draws`) keeps drawing it.
 */
export type ChromeDraw = 'saved' | 'actions' | 'formats' | 'shareNotice';

/** What the Shell draws, in the order it sends them. */
export const CHROME_DRAWS: readonly ChromeDraw[] = ['saved', 'actions', 'formats', 'shareNotice'];

/**
 * What became of an `export_format` request:
 * `started` (the page took it), `done` (the file was saved), `busy`
 * (another export is running, or the last was under 250 ms ago),
 * `unsupported` (the format or variant is not offered, or is disabled),
 * `declined` (the page refused or the person cancelled), `failed`.
 */
export type ChromeExportState = 'started' | 'done' | 'busy' | 'unsupported' | 'declined' | 'failed';

export const CHROME_REQUEST = /^[A-Za-z0-9_-]{16,64}$/;

/** What the page reports to the Shell. Every part is optional. */
export interface ChromeReport {
  comments?: { available: boolean; on: boolean; open: boolean; count: number; pageButton: boolean };
  agent?: { available: boolean; listening: boolean; busy: boolean };
  /** The page has a version history panel. */
  history?: boolean;
  /** The page can be shared. */
  share?: boolean;
  /** The page is currently shared on the LAN. */
  shareOn?: boolean;
  /** The page has export items (fetched with the `exports` command). */
  exports?: boolean;
  /** Save state; absent while the page has none (loading, or nothing to save). */
  saved?: ChromeSaved;
  /** Leaving now loses work: the Shell asks before closing. */
  leaveLosesWork?: boolean;
  /** Page actions (at most 18). */
  actions?: ChromeAction[];
  /**
   * Export formats (at most 8, each with at most 16 variants). A Shell that
   * draws `formats` lists these and runs them with `export_format`; older
   * Shells use `exports`. The Shell adds the whole folder as a zip after
   * them (`artifact.archive`) on any page that is not read-only.
   */
  formats?: ChromeFormat[];
  /** A warning shown in the Share panel (at most 2000 characters). */
  shareNotice?: { text: string; tone: 'warning' };
  /** `false`: the page is empty, so there is nothing to export yet. */
  hasContent?: boolean;
}

/** One export entry shown by the Shell's Export tab. */
export interface ChromeExportItem {
  label: string;
  description?: string;
  disabled?: boolean;
  /** Why it is disabled, in the page's words. */
  disabledReason?: string;
  /** Asks something first instead of downloading at once (a chevron). */
  more?: boolean;
}

/** Commands the Shell sends to the page. */
export type ChromeCommand =
  | { cmd: 'comments_mode'; on?: boolean }
  | { cmd: 'comments_list'; open?: boolean }
  | { cmd: 'history' }
  | { cmd: 'exports'; id: string }
  | { cmd: 'export'; label: string }
  /** Runs a declared, enabled action. */
  | { cmd: 'action'; id: string }
  /**
   * Exports a declared format (and variant). `request` matches
   * {@link CHROME_REQUEST}; the page answers with `chrome_export`.
   */
  | { cmd: 'export_format'; request: string; format: string; variant?: string };

// ---- capability broker: page → Shell → backend ------------------------------------------------------------------

/** Version of the capability broker protocol. */
export const CAP_PROTOCOL = 1;

/** Capability names: lower-case, like `__frame_cap_want` check. */
export const CAP_NAME = /^[a-z][a-z0-9]{0,23}$/;

/** Message of a call the Shell refuses because it was sent under an older `gen`. */
export const STALE_MESSAGE = 'not run: the artifact was updated';

/**
 * Message of a call cut by `cap_rewired`. The call may or may not have
 * reached the backend, so the page must re-read before retrying a write.
 */
export const REWIRED_MESSAGE = 'may not have run: the artifact was updated before this call was answered';

/** A rejected call, as `ArtifactError` fields. */
export interface CapError {
  code: string;
  message: string;
  /** Conflicting paths of a `conflict`. */
  paths?: unknown[];
}

/** Capability messages, Shell → page. */
export type CapToPage =
  /**
   * The answer to `cap_want`. `ok: false`: this view may not use the
   * capability (`use()` resolves to `null`). `config` carries what the page
   * may know without asking again (the artifact id, the viewer).
   */
  | { openArtifact: 'cap_grant'; cap: string; ok: boolean; gen: number; config?: Record<string, unknown> }
  /** The answer to `cap`: a result or an error. */
  | { openArtifact: 'cap_r'; id: string; result?: unknown; error?: CapError }
  /** The call is alive but slow (consent, a large upload): suspend its timeout. */
  | { openArtifact: 'cap_ack'; id: string }
  /** An event of a granted capability (`artifact`/`files`, `agent`/`status`, `room`/`peers`). */
  | { openArtifact: 'cap_ev'; cap: string; event: string; data: unknown }
  /**
   * The broker was rewired (a new backend, a new page base): calls sent
   * under another `gen` will not be answered and reject with
   * {@link REWIRED_MESSAGE}. `caps`, when present, lists the capabilities
   * the broker still serves; pending calls to any other are cut too.
   */
  | { openArtifact: 'cap_rewired'; gen: number; caps?: string[] };

/** Capability messages, page → Shell. */
export type CapToShell =
  /**
   * Asks for a capability. `base` is the page's own API base (its directory
   * URL); the Shell only uses it when it is on the page frame's origin.
   */
  | { openArtifact: 'cap_want'; cap: string; protocol: number; base: string }
  /**
   * A call. Sent with `includeUserActivation` where the browser supports it,
   * so the Shell can tell a click from a script (agent turns need a click).
   */
  | { openArtifact: 'cap'; id: string; cap: string; method: string; args: unknown[]; gen: number };

/** Shell → page. */
export type ShellToPage =
  /** `draws`: what this Shell draws for the page (absent from older Shells). */
  | { openArtifact: 'chrome_hello'; draws?: ChromeDraw[] }
  | ({ openArtifact: 'chrome_cmd' } & ChromeCommand)
  /** Files of the artifact changed on disk (agent writes). */
  | { openArtifact: 'files_changed'; paths: string[] }
  | CapToPage;

/** Page → Shell. */
export type PageToShell =
  | { openArtifact: 'chrome_report'; protocol: number; report: ChromeReport }
  | { openArtifact: 'chrome_exports'; id: string; items: ChromeExportItem[] }
  /** What became of an `export_format` request (`started`, then `done` or `declined`; or at once `busy`/`unsupported`). */
  | { openArtifact: 'chrome_export'; request: string; state: ChromeExportState; reason?: string }
  /** The page applied `files_changed` itself; the Shell does not reload it. */
  | { openArtifact: 'files_changed_ok' }
  | CapToShell;

// ---- host: Shell ⇄ embedding host --------------------------------------------------------------------------------

/** What the host can do for the Shell. */
export interface HostCaps {
  /** The host can start and open agent sessions. */
  sessions?: boolean;
  /** The host draws its own toolbar: the Shell hides its close button. */
  toolbar?: boolean;
}

/** Host → Shell. */
export type HostToShell = { openArtifact: 'host_hello'; caps: HostCaps; agentName?: string };

/** Shell → host. */
export type ShellToHost =
  /** Sent to `*` on load when the Shell is framed; the host answers with `host_hello`. */
  | { openArtifact: 'shell_hello'; version: string; artifact: string; id: string; title: string; type: string }
  /** The Shell took `host_hello` (sent to the host's origin). */
  | { openArtifact: 'shell_ready'; artifact: string }
  /** Start a new agent session with this prompt about the artifact. */
  | { openArtifact: 'new_session'; prompt: string; artifact: string }
  /** Show the session that owns the artifact. */
  | { openArtifact: 'open_session'; session: string | null; harness: string }
  /** Close the Shell's pane. */
  | { openArtifact: 'close' }
  /** A comment was sent to the agent; the host may show the session. */
  | { openArtifact: 'comment_summon'; text: string };

/** Any message of either Shell protocol. */
export type ShellMessage = ShellToPage | PageToShell | HostToShell | ShellToHost;

/** True for an object with a string `open-artifact` field. */
export function isShellMessage(value: unknown): value is ShellMessage {
  return !!value && typeof value === 'object' && typeof (value as { openArtifact?: unknown }).openArtifact === 'string';
}
