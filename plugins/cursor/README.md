# Open Artifact for Cursor

Slide decks, design canvases, whiteboards, spreadsheets, data dashboards and design systems as folders of files that open in one local page where you view, edit
and comment. Type `/open-artifact slides …`, `design …`, `whiteboard …`, `sheets …` or `data …` in the agent chat.

## Install

Copy the built plugin into Cursor's local plugins and reload:

```bash
mkdir -p ~/.cursor/plugins/local && cp -R /path/to/open-artifacts/dist/plugins/cursor ~/.cursor/plugins/local/open-artifact
```

then run **Developer: Reload Window**. A team can instead import the repository as a team marketplace
(`.cursor-plugin/marketplace.json` in `dist/plugins/`).

## What it adds

- `mcp.json`: the `Artifact`, `ArtifactData` and `ArtifactComments` tools (stdio, through the local daemon);
- `skills/open-artifact/`: the skill, carrying the daemon;
- `hooks/hooks.json`: `sessionStart`, `postToolUse` and `stop`.

## Send to agent

Comments sent from the page reach the agent at the start of a chat, after any tool call it makes (as added context,
which also ties a resumed chat's Open Artifact calls to it), or at the end of its turn as a follow-up message (up to 10
in a row). Cursor's hooks cannot add them to the message you send, so while the agent is idle they arrive during or
at the end of its next turn; say "check the comments" to have them read at once. Cursor offers no way to start a turn in an idle chat from outside
(nothing like `codex queue`), so the daemon cannot wake it. The page says so: a comment sent while Cursor idles reads "Cursor gets this on
its next turn: send it a message to start one" (the profile's `wakesIdle: false`; Copilot and ChatGPT read the same).

The Cursor CLI (`cursor-agent -p`) runs the plugin's `sessionStart` (for a new chat, not on `--resume`) and
`postToolUse` hooks, but not `stop`: there, comments come with the next tool call, in tool results, and through `wait`.

Cursor's auto-review (Smart Mode) may stop an `ArtifactComments` reply it takes for a write to an outside service. The
tools say they work only on this computer's artifact folders (`openWorldHint: false`); if a reply is still stopped,
approve it on the card Cursor shows, or tell the agent to reply in the thread.
