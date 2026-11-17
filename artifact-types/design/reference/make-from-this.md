# Making something else from a canvas

Read this FIRST when asked for a deck, a document, a page in another tool, or another width of a page made
from artboards on this canvas.

## Which artboards, in which order

Use the artboards named or selected (`open-artifact context <root>`); with none named, every artboard on the page
in view. Read them in reading order: rows top to bottom, each row left to right (`project/canvas.json` `boards`
gives each one's `x`, `y`). An artboard is one part of the new thing: its `title` (or file name) names it, its
copy is the content, its look is the brief (colours, type, spacing carry over). Leave the artboards as they are:
never move, resize or edit one to make something from it.

## A deck or a document

Make it as an artifact of its own type (a Slides deck, a document), never a picture of the canvas: one slide or
section per artboard unless the content asks otherwise, the text retyped as text, the images uploaded into the
new artifact (`open-artifact upload` there, from this canvas's `_blobs/`). An installed design system goes along:
install it in the new artifact the same way, from its source folder.

Then hand it over on this canvas with a link card, as part of delivering what was asked, without being asked:

1. Read `project/canvas.json` again right before you write it; change only your one entry.
2. Add to `notes`, under a key not already there:
   `"deck1": {"kind": "link", "x": 0, "y": 680, "href": "<the new artifact's link>", "title": "Spring menu deck"}`.
   `href` is the link verbatim (a local page's url, or its folder path when it has no url); `title` its name; NO
   `text` (with `text` it becomes a sticky and the link is lost).
3. Place it on bare canvas 120 px under the artboard it was made from, left edges level (made from a row: under
   the row's first artboard). When something stands there, go down that column to the first bare ground, 120 px
   under the last artboard. Never right of the rightmost artboard: the next artboard goes there. It covers no
   artboard, title or note. On a canvas with pages, give it that artboard's `page`.
4. One card per artifact: none for one that already has a card, none for something unrelated to this canvas. No
   link to give: no card; say in your reply where the new artifact is.

## Another design tool

- **Figma**: the person opens the artboard (focused view) and picks **Export › HTML for Figma**: one HTML page, no
  frames or scripts, every style inline, ready for Figma's HTML capture plugin. Tell them the steps; you cannot
  run the export or the plugin yourself. Layers arrive as flat boxes and text; components and props do not.
- **Canva and other tools that import files**: **Export › PDF** (or every artboard of the page) or **PNG** for a
  picture. Canva imports a PDF as pages it can edit, swapping fonts it lacks. Never hand an import tool the
  canvas's local url: it is on this machine only.
- An artboard's HTML (**Export › HTML (.zip)** or **single file**) is what to give a developer or another page.

## A page at another width

A fluid PAGE (`expand: "fill"`) shows at its board's `w`. To show it at another width too, keep one source:
add an artboard that imports it, such as `project/Home-phone.dc.html` with a fixed 390 px root holding
`<dc-import name="Home" hint-size="390px,1600px"></dc-import>`, its `$preview` and `boards` entry 390 wide and as
tall as the page runs at that width (taller beats clipped). Place it beside the original on the same row. Edits
to `Home.dc.html` show in both. Never copy the page's markup into a second file: the two drift apart.
