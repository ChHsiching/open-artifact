# Changelog

Every release of Open Artifact: the `@open-artifact/*` libraries, `@open-artifact/cli`, `dsh-open-artifact` and the
agent plugins. Since 0.9.0 they all share one version; before that `dsh-open-artifact` had its own (noted per release).

Each entry is written from the commits since the previous tag (`node scripts/changelog.mjs` lists them); see
[Releasing](README.md#releasing).

## [0.11.0] - 2026-11-20

Open live artifacts inside MCP conversations, with steadier whiteboards and more ways to style their content.

### Added

- In clients that support MCP Apps, `ShowArtifact` opens an interactive artifact in the conversation. The view can
  go full screen, open in a browser, or send comments back to the agent.
- Whiteboard drawings have seven styles in light and dark. Table cells support fills and heat maps by row or column.
  The drawing styles, fills and heat maps carry through to PNG exports.
- Whiteboard text can show a placeholder and starts editing with a click or tap. Link cards let you open, copy or
  edit a link, and F6 moves focus between the toolbars, board and panels.
- `npm run test-artifacts` opens a browser gallery of editable test artifacts, starting with a whiteboard that
  demonstrates all element types, styles and options.

### Changed

- The whiteboard skill documents drawing styles, text placeholders, table formatting and how agents coordinate
  edits on a shared board. Validation reports unknown drawing styles, how much to trim from oversized drawings,
  and claims that still mark an area as being worked on.
- Clicking a side dot on a whiteboard note or shape adds an adjacent item in available space. Read-only boards show
  a badge, and exported PNGs use the board title as the filename.
- Number fields snap to their step when dragged unless Alt is held. Color fields explain rejected values and
  announce hue and opacity values for screen readers.

### Fixed

- Whiteboard text stays visible and steady during pans and resizes. Panning survives a dropped pointer capture,
  and the board keeps fitting as its view changes size until you interact with it.
- Growing whiteboard text makes room below it. Resizing rotated notes or text keeps the anchored corner in place,
  and pasted text preserves bold, italics and links.
- Concurrent moves and resizes of a whiteboard group merge field by field. Merged table cells preserve their
  formatting, and drawings can include dashed arcs.
- Extra clicks on menus or dismissing a popover no longer activate controls underneath. Popovers configured to
  keep typed input stay open until dismissed, and stepping an empty number field starts from a valid value.
- Whiteboard crop mode can be canceled with Undo, and embedded pages receive keystrokes once you enter them.
- Type servers start without flashing a console window on Windows.

### Removed

- Whiteboards now use DOM rendering exclusively. The Whiteboard WebGL renderer and its
  `open_artifact_engine=off` URL switch are gone.

## [0.10.0] - 2026-11-20

Follow other viewers from the Shell, link-aware Design and Design System editing, and copying that works in the
Claude app's built-in browser.

### Added

- In Sheets, the Shell shows who else is viewing beside History; choose Follow to see what they see, and Stop to go
  back.
- Readable links to a place in a design: `#page-<id>`, `#artboard-<name>` (selects the artboard and brings it into
  view) and `#play-<name>` (runs it on the canvas). Agents give these links when a reply mentions an artboard or page.
- Hovering an element that sits in a link shows its address in Design, with Open for web and mail links; a selected
  element's link shows on the selection bar.
- In the Design System README, a link opens a card to open, copy, edit or remove it. ⌘Z (Ctrl+Z) undoes a change made
  in the card and ⇧⌘Z (Ctrl+Shift+Z, Ctrl+Y) makes it again; a modifier click opens a link while editing.
- A color typed into the Design System picker previews as you type; Escape puts the old color back.
- Without the Shell, the focused artboard view has its Export menu again, with the same formats as Share → Export.

### Changed

- "Send all to agent" sends every open comment at once, so the agent gets them as one message instead of one turn
  per comment.
- Design canvases no longer limit the number of notes; `canvas.json` just has to stay under 1 MiB.
- The Design skill places new, moved and resized artboards in clear space, moves neighbours out of the way when a
  frame grows, and starts from a design system's README.
- Design exports say why an upload could not be included and stop waiting sooner on font hosts that do not answer.
- Long menus fit in a short window and scroll.

### Fixed

- Copy as PNG, SVG or HTML, copying layers, and Design System copy buttons work in browsers that keep the clipboard
  from framed pages, such as the Claude app's built-in browser: the Shell writes the clipboard instead.
- Design shortcuts follow the physical key, so they work on any keyboard layout; Enter and Escape no longer end
  cropping or path drawing while you type in a field or compose with an input method.
- Property fields: font search works, Enter keeps focus, ⌘Z undoes, and starting a scrub first saves a number typed
  into another field.
- An image or video upload still lands on the right element when the artboard changed while it uploaded, and a file
  dropped where nothing takes it no longer replaces the editor.
- A component preview in a design system can no longer take focus away from the field you are editing before you use
  it.

## [0.9.2] - 2026-11-18

Install agent plugins from a prebuilt download and read release notes in DeepSeek Harness.

### Added

- GitHub Releases includes `open-artifact-plugins.zip` with Codex, Claude Code, Cursor, GitHub Copilot, Antigravity
  and the ChatGPT web connector. Download and extract the ZIP to install or upgrade without cloning or building.
- DeepSeek Harness shows release notes before you update and a What's New panel after updating. Select the installed
  version in the Open Artifact page footer to see the full changelog.

### Changed

- The installation guides explain how to move existing source-based installs to the release bundle or, for
  DeepSeek Harness, to the prebuilt npm package.

## [0.9.1] - 2026-11-18

Much smaller installs: the built-in types share one type server.

### Changed

- `@open-artifact/cli`, `dsh-open-artifact` and the agent plugins carry the type server once, in
  `vendor/type-server/`, instead of a whole copy (every editor included) in each built-in type; each type's
  `scripts/cli.mjs` runs the shared one. The npm packages go from 112 MB to 18 MB (330 MB to 50 MB unpacked), and a
  plugin folder from about 330 MB to 49 MB.
- Every release now has a CHANGELOG.md entry, which becomes its GitHub release notes; the publish workflow refuses a
  tag without one.

## [0.9.0] - 2026-11-18

One version for every package, with Docs and Sheets in every plugin.

### Added

- **Sheets**, a new artifact type: a workbook engine in Rust built as WebAssembly (`@open-artifact/wasm-sheets`),
  with `sheets-core` and `sheets-editor`.
- Sheets charts: Insert chart adds area, horizontal bar and scatter, exported to Excel as native charts; a chart's
  menu can change it to another kind that suits its cells, with no agent.
- **Docs**, a new built-in artifact type: a living document in tabs with headings, lists, tables, pictures, dates,
  mentions and dropdowns; suggested edits, comments and a version history per tab; imports Markdown, Word and PDF and
  exports Markdown, Word, PDF and HTML (`docs-core`, `docs-editor`, the docs type server and runtime doc API).
- Docs comments: the composer gets a "Send to agent" checkbox with an `@agent` tag.
- Every plugin's manifest and the marketplaces name Docs; the DSH skill knows the Docs type and vendors it; the npm
  CLI package lists Sheets.

### Changed

- The libraries, the CLI and `dsh-open-artifact` move to 0.9.0 together (`dsh-open-artifact` was 0.8.x, so the shared
  version starts above it), and the agent plugins' manifests follow.
- Docs tables fit the page: short cells stay on one line, columns hold while the caret is in a table, and a table cut
  off on the right is marked.
- Broader editing, comment and offline-recovery work across Docs, Sheets, Slides, Design, Design System and Whiteboard,
  with more editor tests.
- `publish-npm.mjs --claim` publishes a new package's staged version before trusting the workflow, since npm trusts
  only a package it has and refuses placeholder versions. `docs-core`, `sheets-core` and `wasm-sheets` get their first
  npm releases from the workflow.

### Fixed

- With six or more pages open on the daemon (easy in DeepSeek Harness), every other request queued forever and the
  Share panel stayed on "Loading...". The pages of an origin now share one library event stream (one holder elected
  with a Web Lock, messages passed on a BroadcastChannel); library reads time out after 15 s, and the Share panel's
  poll no longer piles up.

## [0.2.2] - 2026-11-17

`dsh-open-artifact` 0.8.2.

### Added

- Design System is a built-in type: every harness offers Design, Design System, Slides, Whiteboard and Data, and the
  skills and plugin descriptions name design systems.

### Changed

- A harness whose daemon is newer than the one running stops the old one and starts its own (connected harnesses
  reconnect), so upgrading a plugin brings its types and tools without stopping the daemon by hand.

## [0.2.1] - 2026-11-17

`dsh-open-artifact` 0.8.1.

### Fixed

- Design and Slides PNG, JPEG and PDF exports drew every `<img>` and CSS background picture blank; they now embed
  them again.
- Exported `<img>` pictures keep their `object-fit` and `object-position`, so cropped and stretched pictures are no
  longer letterboxed.

## [0.2.0] - 2026-11-17

`dsh-open-artifact` 0.8.0. The first release published from GitHub Actions.

### Added

- **Data**, a new artifact type: dashboards and reports from uploaded files, live queries on the owner's MCP
  connectors, and calculations, as plain HTML, CSS and d3 (`data-core`, `data-editor`, and the
  `open-artifact-data-rules` crate built as `@open-artifact/wasm-data-rules`). Every harness plugin ships it.
- `live-store`, the live document engine, taken out of `whiteboard-core` so Whiteboard and Data share it.
- An Antigravity plugin, with idle conversations woken for page comments through `agentapi send-message`.
- A Copilot CLI marketplace in `dist/plugins`, so Copilot installs its own plugin instead of the Claude Code one.
- Per-agent plugin install steps in the READMEs.
- npm publishing: `scripts/build-npm.mjs` stages the packages, `scripts/publish-npm.mjs` publishes them dependencies
  first, and the Publish to npm workflow runs on a `v*` tag by trusted publishing (OIDC). `--claim` sets the workflow
  as the trusted publisher of a package npm doesn't have yet.
- The focused view's Fill / Fit choice is kept across artboards and visits.

### Changed

- Idle Codex threads are woken for page comments (`codex queue`), and pages open in the agent app's own browser
  instead of a second copy in the computer's browser.
- Cursor gets page requests after each tool call (`postToolUse`), since it runs no session hooks on `--resume`.
- Copilot gets page messages in the prompt, which a resumed session keeps.
- The page says when an idle agent will not be woken (Cursor, Copilot, ChatGPT): comment cards and "Ask agent" toasts
  say the agent gets it on its next turn.
- One comment icon everywhere, and the whiteboard's foot toolbar reorganized with an "Ask <agent>" pill.
- The skill docs for Design, Design System, Slides and Whiteboard brought back to their original text, mapped to
  Open Artifact.

### Fixed

- Codex artifacts landed in the plugin's cache folder; they now go in the thread's folder.
- Cursor's auto-review blocked the agent's comment replies; the tools are marked local-only.
- The skill launcher no longer takes another agent's session id when an app is started from inside a Claude Code or
  Codex session.

## [0.1.0] - 2026-11-17

`dsh-open-artifact` 0.7.0. The initial version of Open Artifact (formerly baoyu-design), not tagged.

### Added

- Agent-agnostic artifact types (Slides, Design, Design System, Whiteboard) with their editors, the local daemon and
  Shell, and the `/open-artifact` skill.
- Plugins for Claude Code, Codex, Cursor, Copilot, ChatGPT and DeepSeek Harness.
- English and Chinese READMEs, under Apache-2.0.

[0.11.0]: https://github.com/JimLiu/open-artifact/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/JimLiu/open-artifact/compare/v0.9.2...v0.10.0
[0.9.2]: https://github.com/JimLiu/open-artifact/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/JimLiu/open-artifact/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/JimLiu/open-artifact/compare/v0.2.2...v0.9.0
[0.2.2]: https://github.com/JimLiu/open-artifact/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/JimLiu/open-artifact/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/JimLiu/open-artifact/compare/a6cd3e3...v0.2.0
[0.1.0]: https://github.com/JimLiu/open-artifact/commit/a6cd3e3
