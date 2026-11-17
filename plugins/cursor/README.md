# Open Artifact for Cursor

Slide decks, design canvases and whiteboards as folders of files that open in one local page where you view, edit
and comment. Type `/open-artifact slides …`, `design …` or `whiteboard …` in the agent chat.

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
- `hooks/hooks.json`: `sessionStart` and `stop`.

## Send to agent

Comments sent from the page reach the agent at the start of a chat, or at the end of its turn as a follow-up message
(up to 10 in a row). Cursor's hooks cannot add them to the message you send, so while the agent is idle they arrive at
the end of its next turn; say "check the comments" to have them read at once. The Cursor CLI (`cursor-agent`) does not
run plugin hooks: there, comments come back in tool results and through `wait`.
