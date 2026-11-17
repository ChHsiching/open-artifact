# Open Artifact

English · [简体中文](README.zh-CN.md)

> **Formerly `baoyu-design`.** This project started as
> [baoyu-design](https://github.com/JimLiu/baoyu-design) (the old URL redirects here), which brought claude.ai-style
> Artifact types to local coding agents as one skill per type. Open Artifact rebuilds them as an open, agent-agnostic
> format: one local daemon, one page frame, one `/open-artifact` skill, and a plugin for each agent app.

**Open Artifact lets any coding agent make things people can open, edit and comment on, not just files.** You ask
your agent for a slide deck, a UI design, a design system or a whiteboard. The agent writes a plain folder of files.
A local page opens it in a real editor, where you can fix a title, move a sticky note, leave comments, and export. Then
"Send to agent" sends your comments back to the agent's session.

Everything runs on your machine. No account, no upload, no specific model or vendor.

```
  you ──"/open-artifact slides a 6-slide pitch"──▶ agent (Claude Code, Codex, Cursor, Copilot, …)
                                                     │ writes files
                                                     ▼
                                           ./my-deck/project/deck.json + slides/*.html
                                                     │ served by the local daemon
                                                     ▼
  you ◀── edit · comment · export (PDF/PPTX/PNG/HTML) ── http://127.0.0.1:<port>/a/<id>
   └──────────────── "Send to agent" ──────────────▶ comments arrive back in the agent's session
```

## Artifact types

| Type | What you get | Folder marker | Exports |
|---|---|---|---|
| [Slides](artifact-types/slides/SKILL.md) | A 1920×1080 deck: slide rail, overview, speaker notes, builds, transitions, presenter mode | `project/deck.json` | PDF, PPTX, HTML, PNG |
| [Design](artifact-types/design/SKILL.md) | An infinite canvas of live `.dc.html` artboards: screens, components, click-through prototypes, notes, pages | `project/canvas.json` | PNG, JPEG, PDF, HTML |
| [Design System](artifact-types/design-system/SKILL.md) | A brand book: tokens, colors with contrast checks, type specimens, live component previews, assets. Designs and decks can install it | `project/design-system.json` | — |
| [Whiteboard](artifact-types/whiteboard/SKILL.md) | A shared infinite board: stickies, shapes, arrows, ink, images, tables, embeds, live cursors, timer | `db/board/meta.json` | PNG |

Each type folder is a self-contained skill: `SKILL.md` tells the agent how to write it, `reference/` documents the
file format, `artifact-type.json` describes it to hosts, and `scripts/` (built) holds the CLI and editors.

## Quick start

Requires **Node.js 22.18+**.

```bash
npm ci
npm run build
```

Then pick the way you want to use it.

### 1. As a plugin in your agent app (recommended)

```bash
node scripts/build-plugins.mjs      # writes dist/plugins/, a marketplace folder
```

For Claude Code:

```bash
claude plugin marketplace add ./dist/plugins
claude plugin install open-artifact@open-artifact
```

Then, in a session:

```text
/open-artifact slides a 6-slide pitch for this repo
/open-artifact design three landing page options for a coffee shop
/open-artifact whiteboard a retro board for last sprint
```

The plugin adds the `Artifact`, `ArtifactData` and `ArtifactComments` MCP tools, the skill, and hooks that bring
page comments back into the session. Codex / ChatGPT desktop, Cursor, GitHub Copilot, ChatGPT on the web and
DeepSeek Harness have their own plugins. See [plugins/README.md](plugins/README.md).

### 2. As a skill for any other agent

Copy or point your agent at [`skills/open-artifact/`](skills/open-artifact/SKILL.md) (built by
`build-plugins.mjs`, or alone with `node scripts/build-skill.mjs`). It carries the daemon, and the agent drives it
from the command line:

```bash
node skills/open-artifact/scripts/open-artifact.mjs artifact '{"action":"list","scope":"types"}'
```

### 3. One type on its own

Every built type folder runs by itself, without the daemon:

```bash
node artifact-types/design/scripts/cli.mjs open ./my-design --type design   # starts a local server, prints the URL
node artifact-types/design/scripts/cli.mjs wait ./my-design                 # blocks until someone presses "Send to agent"
```

Other commands: `check`, `generate`, `upload`, `context`, `comments`, `history`, `share`, `status`, `stop`, … Run the
CLI with no arguments for the full list.

## Development

```bash
npm run build        # editors, support.js, the CLI, the Shell and the DSH plugin → dist/ and artifact-types/*/scripts/
npm run typecheck
npm test             # unit tests (node --test)
npm run e2e          # end-to-end: drives the built types with the CLI and Chrome, see e2e/README.md
```

The Rust crates in `crates/` compile to WebAssembly. Their output is committed under `packages/wasm-*/generated/`,
so you only need Rust when you change a crate:

```bash
node scripts/build-wasm.mjs   # needs cargo + wasm32-unknown-unknown, wasm-bindgen, wasm-opt
```

## Repository layout

| Path | Contents |
|---|---|
| `artifact-types/` | The four types as skills: `SKILL.md`, `reference/`, `artifact-type.json`. |
| `skills/open-artifact/` | The one `/open-artifact <type>` skill; `vendor/` (built) carries the daemon. |
| `plugins/` | The skill packaged per agent app, with hooks and MCP config ([README](plugins/README.md)). |
| **Platform** | |
| `packages/daemon` | The `open-artifact` daemon: type registry, artifact library, agent tools, MCP, wake routing, the Harness API. |
| `packages/shell` | The daemon's pages: the Shell frame around every artifact, and the home page. |
| `packages/protocol` | Typed contracts shared by the daemon, harness adapters, type servers, the Shell and pages. |
| `packages/runtime` | `window.openartifact`, the capability API pages use (files, uploads, user, agent, presence, downloads). |
| `packages/type-server`, `packages/server-sdk` | The per-type local server and `cli.mjs`; shared server code. |
| **Types** | |
| `packages/slides-core`, `slides-editor` | Slides model (HTML subset, `deck.json`) and editor. |
| `packages/design-core`, `design-editor`, `dc` | Design model (`canvas.json`), editor, and the `.dc.html` artboard format. |
| `packages/design-system-core`, `design-system-editor` | Design System model (token grammar, CSS compiler) and editor. |
| `packages/whiteboard-core`, `whiteboard-editor` | Whiteboard model (schema, live sync, geometry) and editor. |
| **Shared** | |
| `packages/ui`, `editor-kit`, `export-kit` | UI kit (Base UI + Tailwind), what editors share (comments, history, presence…), browser-side exports. |
| `packages/canvas-engine`, `wasm-*`, `crates/` | WebGL2 canvas engine and the Rust/WebAssembly crates behind it, exports and whiteboard geometry. |
| `e2e/` | End-to-end tests. |
| `scripts/` | `build.mjs`, `build-plugins.mjs`, `build-skill.mjs`, `build-wasm.mjs`. |

## License

[Apache License 2.0](LICENSE). Copyright 2026 Jim Liu 宝玉; see [NOTICE](NOTICE).
