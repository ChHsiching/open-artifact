# Open Artifact for Codex and ChatGPT desktop

Slide decks, design canvases and whiteboards as folders of files that open in one local page where you view, edit
and comment. Ask for `/open-artifact slides …`, `design …` or `whiteboard …` (the skill is `open-artifact:open-artifact`).

## Install

```bash
codex plugin marketplace add /path/to/open-artifacts/dist/plugins
```

then install **Open Artifact** from `/plugins` in the Codex CLI or the Plugins tab of the Codex or ChatGPT desktop app
(or `codex plugin add open-artifact@open-artifact`), and start a new session. Codex runs plugin hooks only once you
approve them in `/hooks` (again after each update); the tools work before that.

New artifacts go under the thread's folder (`artifacts/<slug>`). Codex starts the MCP server in the plugin's own
folder, so the daemon looks the thread's folder up: from its hook, or from the thread's rollout file in
`~/.codex/sessions` (`$CODEX_HOME`).

## What it adds

- `mcp.json`: the `Artifact`, `ArtifactData` and `ArtifactComments` tools (stdio, through the local daemon);
- `skills/open-artifact/`: the skill, carrying the daemon;
- `hooks/hooks.json`: SessionStart, UserPromptSubmit and Stop.

## Send to agent

Comments sent from the page reach the thread that made the artifact at session start, with your next message, or,
when they arrive while Codex works, by keeping its turn going (the Stop hook). Without the hooks they come with the
thread's next Open Artifact tool call. Codex cannot be woken while idle: send
a message ("check the comments"), or let the agent wait for them (`ArtifactComments {action: "wait"}`).
