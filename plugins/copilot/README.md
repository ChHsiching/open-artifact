# Open Artifact for GitHub Copilot

For the Copilot CLI and VS Code agent mode (the Copilot harness). Slide decks, design canvases and whiteboards as
folders of files that open in one local page where you view, edit and comment: `/open-artifact slides …`,
`design …` or `whiteboard …`.

## Install

Copilot CLI:

```bash
copilot plugin install /path/to/open-artifacts/dist/plugins/copilot
```

(or try it in one session: `copilot --plugin-dir /path/to/open-artifacts/dist/plugins/copilot`).

VS Code: turn on `chat.plugins.enabled`, then run **Chat: Install Plugin from Source** and pick the
`dist/plugins/copilot` folder.

## What it adds

- `.mcp.json`: the `Artifact`, `ArtifactData` and `ArtifactComments` tools (stdio, through the local daemon);
- `skills/open-artifact/`: the skill, carrying the daemon;
- `hooks.json`: `sessionStart`, `userPromptTransformed` and `agentStop`.

## Send to agent

Comments sent from the page reach Copilot at session start, with your next message (CLI), or, when they arrive while
it works, by keeping its turn going (`agentStop`, up to 8 times in a row). The cloud agent loads no plugins.
