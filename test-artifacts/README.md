# Test artifacts

Ready-made artifacts for trying the editors by hand. Open one of these instead of making a fresh one for each test.
There is a folder per type, a folder per artifact, and next to each artifact the script that builds it
(`<name>.gen.mjs`).

Build first (`npm run build`).

## The home page

```bash
npm run test-artifacts                    # serves the home page at http://127.0.0.1:4790/ (Ctrl+C stops it)
npm run test-artifacts -- --port 4800     # on another port
```

It runs a daemon of its own, with its home folder in `test-artifacts/.home/` (out of git), so your real Open Artifact
library is left alone. Every artifact in this folder is in its library: the home page lists them, and a click opens
one in the Shell, where you can edit it, comment and share as usual. Rename, pin and delete on the home page change
only that library; deleting never deletes the folder, and the next start adds it back. A new artifact made in this
folder shows up at the next start.

## One artifact, without the daemon

To try one with its type's own CLI instead (the type server alone, the way an agent's skill opens it):

```bash
node test-artifacts/open.mjs                                  # lists the test artifacts
node test-artifacts/open.mjs whiteboard/elements              # opens one and prints its URL
node test-artifacts/open.mjs whiteboard/elements --stop       # stops its server
```

Stop it before opening the same artifact from the home page, so two servers don't write to one folder.

## Start over

Edits and comments made on the page change the artifact's `db/`. To get the original back, run its script again: it
replaces `db/` and runs the type's `check`.

```bash
node test-artifacts/whiteboard/elements.gen.mjs     # or: node test-artifacts/open.mjs whiteboard/elements --reset
```

`git checkout -- test-artifacts/<path>` works too. After changing a script, run it and commit the result with it.

What the editor writes into the folder while it runs (`_agent/`, `history/`, `.artifact.json`, its own `.gitignore`)
stays out of git.

## What's here

| Path | What it has |
|---|---|
| `whiteboard/elements` | One of every element kind, style and option: the twelve shapes, hollow and stroked shapes, left-aligned text, notes and a sticker, arrows (labelled, dashed, two-headed, dot end, no head, with bends, free end), text in every size with wrapping and a placeholder, pen strokes, a table with fills and heat colours, an HTML embed you can vote in, link cards, a timer, pictures (linked and cropped) and an SVG drawing in each of the seven styles |
