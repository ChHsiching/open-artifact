# Open Artifact for Antigravity

For Google Antigravity (the `agy` CLI and the Antigravity app). Slide decks, design canvases and whiteboards as
folders of files that open in one local page where you view, edit and comment: `/open-artifact slides …`,
`design …` or `whiteboard …`. Needs Node.js 22 or later.

## Install

```bash
agy plugin install /path/to/open-artifacts/dist/plugins/antigravity
```

Check it with `agy plugin validate ./dist/plugins/antigravity` and `agy plugin list`. Without the CLI, copy the folder
to `~/.gemini/config/plugins/open-artifact/`. Restart Antigravity after installing: it loads a plugin's MCP server at
startup (the skill and hooks are picked up by new conversations). Antigravity asks you to allow each Open Artifact
tool call until you choose to always allow it.

## What it adds

- `mcp_config.json`: the `Artifact`, `ArtifactData` and `ArtifactComments` tools (stdio, through the local daemon),
  namespaced by Antigravity as `open-artifact_open-artifact`;
- `skills/open-artifact/`: the skill, carrying the daemon;
- `hooks.json`: `SessionStart`, `PreInvocation` and `Stop`.

## Send to agent

Comments sent from the page reach the agent at session start, before its next model call (`PreInvocation`, so also
in the middle of a turn), or, when they arrive as it finishes, by keeping it going (`Stop` with
`decision: "continue"`). The hooks add them as system messages.

While the conversation is idle, the daemon starts a turn in it with the app's own command line
(`agentapi send-message <conversation> <text>`, found at `~/.gemini/antigravity/bin/agentapi`, or set
`OPEN_ARTIFACT_ANTIGRAVITY_AGENTAPI`), pointed at the running app by its hub file in
`~/.gemini/antigravity/daemon/`; that turn's hooks then hand over the comments. When the app is not running, the
comments wait for the conversation's next turn.
