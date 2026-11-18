# Open Artifact for Claude Code

Slide decks, design canvases, whiteboards, spreadsheets, data dashboards and design systems as folders of files that open in one local page where you view, edit
and comment. Type `/open-artifact slides a 6-slide pitch for this repo` (or `design …`, `whiteboard …`, `sheets …`, `data …`).

## Install

From a built `dist/plugins/` folder (`node scripts/build-plugins.mjs` in the repository):

```bash
claude plugin marketplace add /path/to/open-artifacts/dist/plugins
claude plugin install open-artifact@open-artifact
```

To try it in one session without installing: `claude --plugin-dir /path/to/open-artifacts/dist/plugins/claude-code`.

## What it adds

| Part | File | Does |
|---|---|---|
| MCP server `open-artifact` | `.mcp.json` | the `Artifact`, `ArtifactData` and `ArtifactComments` tools, through the local daemon |
| Skill `/open-artifact` | `skills/open-artifact/` | how to pick the type, create, fill, check and show an artifact; carries the daemon |
| Hooks | `hooks/hooks.json` | SessionStart, UserPromptSubmit and Stop: comments sent from the page reach Claude at session start, with your next message, or keep its turn going when they arrive while it works |
| Monitor | `monitors/monitors.json` | while the session is open, a notice whenever comments wait for it, so Claude reads them without you asking |

## Send to agent

Press "Send to agent" (or "Ask Claude") on the page. The comments reach the session that made the artifact: right
away if Claude is working (the Stop hook continues its turn), as a monitor notice if the session is idle, or with your
next message. Monitors run in interactive sessions only.

**Channels (optional).** Claude Code's channels push messages into a running session. To use one instead of the
monitor, add `"--channel"` to the server's `args` in `.mcp.json` and start Claude Code with
`claude --dangerously-load-development-channels plugin:open-artifact@open-artifact` (a research preview).
