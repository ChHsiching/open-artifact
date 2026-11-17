# Open Artifact plugins

One skill, `open-artifact`, and a plugin for each agent app that carries it. Every plugin runs the same local
Open Artifact daemon: one artifact server and one page frame (the Shell at `http://127.0.0.1:<port>/a/<id>`) for
every type, with each type's own editor and comments inside. `/open-artifact slides …` makes a deck,
`/open-artifact design …` a design canvas, `/open-artifact whiteboard …` a board.

| Folder | For | Gives the agent | Comments sent from the page reach the agent |
|---|---|---|---|
| [`claude-code/`](claude-code/README.md) | Claude Code (CLI, desktop, IDE) | MCP tools, skill, hooks, monitor | at session start, with the person's next message, at the end of a turn (the turn goes on), and while the session idles (monitor) |
| [`codex/`](codex/README.md) | Codex (CLI, app) and ChatGPT desktop | MCP tools, skill, hooks | at session start, with the next message, at the end of a turn; an idle thread gets a message queued with `codex queue` |
| [`cursor/`](cursor/README.md) | Cursor (editor) | MCP tools, skill, hooks | at session start, and at the end of a turn as a follow-up message |
| [`copilot/`](copilot/README.md) | GitHub Copilot CLI, VS Code agent mode (Copilot harness) | MCP tools, skill, hooks | at session start, with the next message (CLI), at the end of a turn |
| [`antigravity/`](antigravity/README.md) | Google Antigravity (`agy` CLI, app) | MCP tools, skill, hooks | at session start, before each model call, at the end of a turn (the turn goes on); an idle conversation is started with `agentapi send-message` |
| [`dsh/`](dsh/package.json) | DeepSeek Harness | native tools, the Open Artifact sidebar page, comment cards, `/open-artifact` | right away: a new turn when the session idles, added to the running turn otherwise (a full adapter, L3) |
| [`chatgpt/`](chatgpt/README.md) | ChatGPT on the web | MCP tools over HTTPS, a card | in the next tool result, or when the person presses "Send comments to ChatGPT" on the card |
| [`../skills/open-artifact/`](../skills/open-artifact/SKILL.md) | any other agent that reads skills | the command line | in the result of any call, or by `wait` |

Whatever the app, comments also come back in the `messages` of any Open Artifact tool result, and an agent can
wait for them (`ArtifactComments {action: "wait"}`).

Pages open where the person already is: in the app itself when its adapter can show them (DeepSeek Harness), else
in the agent app's built-in browser (Codex, Cursor, Claude, Antigravity, VS Code), which the agent opens with the page's
`view_url`. The daemon opens the computer's browser only when the agent asks it to (`Artifact {action: "open"}`), which
it does when it has no browser of its own.

## Build

```bash
npm ci && npm run build            # the Shell, frame-host and the types' editors (dist/, artifact-types/*/scripts/)
node scripts/build-plugins.mjs     # builds the skill, then dist/plugins/<name>/ and the marketplace files
```

`dist/plugins/` is then a marketplace folder for Claude Code (`.claude-plugin/marketplace.json`), Codex
(`.agents/plugins/marketplace.json`), Cursor (`.cursor-plugin/marketplace.json`) and the Copilot CLI
(`.github/plugin/marketplace.json`), with one installable folder per
plugin. Each plugin carries the skill with the daemon vendored in `skills/open-artifact/vendor/` (about 40 MB, most
of it the types' editors); it needs Node.js 22 or later on the computer.

`node scripts/build-plugins.mjs --only codex` builds one; `--no-skill` reuses the built skill.

`dsh/` is different: it is an npm workspace package (`dsh-open-artifact`) with its own build, `node plugins/dsh/scripts/build.mjs`
(run by `npm run build`), which writes `lib/` and vendors the daemon into `vendor/`. DeepSeek Harness installs it from
that folder; `build-plugins.mjs` leaves it alone.

## How a plugin reaches the daemon

- **MCP server:** `node <plugin>/skills/open-artifact/scripts/open-artifact.mjs mcp --harness <name>`, a stdio
  bridge to the daemon's `/mcp`, which it starts when none runs.
  The `--harness` it names wins over the session variables of other agent apps (`CLAUDECODE`, `CODEX_THREAD_ID`), which
  an app started from inside another agent's session inherits.
- **Hooks:** `… open-artifact.mjs hook <event> --harness <name>` registers the session (and its processes, so the MCP
  bridge's calls are tied to it) and prints the messages that wait, in the app's own hook format: Claude Code and
  Codex `hookSpecificOutput.additionalContext` and Stop `decision: "block"`; Cursor `additional_context` and stop
  `followup_message`; Copilot `additionalContext`, `userPromptTransformed` → `modifiedTransformedPrompt`, and
  `agentStop` `decision: "block"`; Antigravity `injectSteps` system messages and Stop `decision: "continue"`.
- **Harness profiles** (`packages/daemon/harnesses/<name>.json`) give the page the agent's name ("Ask Claude",
  "Ask Codex", …) and the session variable.

## What was checked

| | |
|---|---|
| Claude Code 2.1.318 | `claude plugin validate` passes for the plugin and the marketplace. A headless run with `--plugin-dir` lists the types through the plugin's MCP tools; with a page request queued for the session, the SessionStart hook handed it to Claude, which edited the board. |
| GitHub Copilot CLI 1.0.105 | A run with `--plugin-dir`: the plugin's MCP server and hooks load (`${PLUGIN_ROOT}` expands in the hook command); a queued page request reached Copilot, which edited the board. With 1.0.112, `copilot plugin marketplace add ./dist/plugins` and `copilot plugin install open-artifact@open-artifact` (under a scratch `HOME`) enable the Copilot plugin from `dist/plugins/copilot`. |
| Antigravity 2.32.1 (app) | Installed by copying `dist/plugins/antigravity` to `~/.gemini/config/plugins/open-artifact/` (no `agy` CLI here, so no `agy plugin validate`), conversations started with the app's `agentapi`. The skill is listed; after an app restart the MCP server loads as `open-artifact_open-artifact` and `Artifact {action: "list", scope: "types"}` returns the types (Antigravity asks the person to allow the call). With page messages queued for the conversation, `SessionStart` started the daemon and registered the `conversationId`, `PreInvocation` added them as a system message, and `Stop` kept the turn going once with them as its reason. |
| Codex 0.169.0-alpha.11.1 (in ChatGPT.app) | `codex plugin marketplace add dist/plugins` and `codex plugin add open-artifact@open-artifact`; runs with `codex exec --approve-for-me`. The MCP server loads, the skill is read from the plugin, and a whiteboard was made in the run's folder (`artifacts/<slug>`), owned by the thread. Codex starts the MCP server in the plugin's folder and names only the thread (`_meta.threadId`) on each call, so the daemon takes the thread's folder from its hook, or, before the hooks are trusted, from the thread's rollout file (`~/.codex/sessions/…/rollout-…-<thread>.jsonl`). A page comment sent to the agent waited for the thread; `codex exec resume <thread>` read it, renamed the note and replied, resolving the thread. In the ChatGPT desktop app, a comment sent from a deck while its thread was idle was queued with `codex queue` and ran at once: Codex changed the title and replied. The hooks were not run here (they need trust in `/hooks`). |
| Cursor | Not installed here: the hook output for its events was checked by running the hook command with Cursor's input; the plugin manifest follows its documentation. |
| ChatGPT | The connector was driven over MCP (initialize, tools, the card resource, publish with files, read, ShowArtifact, comments in the next result, a wrong path, a foreign Origin); the card was rendered with a stand-in `window.openai`. Not tried in ChatGPT itself. |
