# The `.dc.html` artboard format

Read this before your first artboard. Everything the format supports is here: events, state,
conditionals and loops all work, so never fall back to a static design because you were unsure one of
them would.

An artboard is one self-contained HTML file: a template inside `<x-dc>` and a logic class that feeds it.
The page renders it with React; opened on its own in a browser, the file renders the same way.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Pricing</title>
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap">
  <style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; }
    a { color: #1d4ed8; } a:hover { color: #1e3a8a; }
  </style>
</helmet>
<main style="padding: 48px; display: flex; flex-direction: column; gap: 24px; background: {{ bg }}">
  <h1 style="margin: 0; font-size: 48px">Simple pricing</h1>
  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">
    <sc-for list="{{ plans }}" as="plan" hint-placeholder-count="3">
      <article style="padding: 24px; border-radius: 12px; background: #ffffff">
        <h2 style="margin: 0">{{ plan.name }}</h2>
        <p>{{ plan.price }}</p>
        <sc-if value="{{ plan.popular }}" hint-placeholder-val="{{ false }}"><span>Most popular</span></sc-if>
      </article>
    </sc-for>
  </div>
  <button type="button" onClick="{{ toggle }}" style="align-self: flex-start">{{ label }}</button>
</main>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1280,"height":800},"bg":{"editor":"color","default":"#f8fafc","options":["#f8fafc","#fef3c7","#ecfdf5"]}}'>
class Component extends DCLogic {
  state = { yearly: false };
  renderVals() {
    const yearly = this.state.yearly;
    return {
      bg: this.props.bg ?? '#f8fafc',
      plans: [
        { name: 'Free', price: '$0' },
        { name: 'Pro', price: yearly ? '$96/yr' : '$10/mo', popular: true },
        { name: 'Team', price: yearly ? '$240/yr' : '$25/mo' },
      ],
      label: yearly ? 'Show monthly' : 'Show yearly',
      toggle: () => this.setState({ yearly: !yearly }),
    };
  }
}
</script>
</body>
</html>
```

## The document

- `<html lang="…">` is the language of the copy; change it when the text is not English.
- `<title>` names the screen for assistive technology and is the artboard's name when `canvas.json`
  gives no `title`: a few words, different on each artboard.
- The `<head>` holds `<script src="./support.js"></script>` exactly. Never write `support.js`. An
  installed design system's `<link>` and `<script>` tags go right after it (`design-systems.md`).
- One `<x-dc>` … `</x-dc>` holds the template; one `<script type="text/x-dc" data-dc-script>` holds the
  logic. Both are required, even for a static artboard (`class Component extends DCLogic {}`).
- Path: under `project/`, segments starting with a letter, digit or `_`, then those and `.` `-`, ending
  in `.dc.html` (`Main.dc.html`, `flows/Checkout-2.dc.html`).

## Layout

- A STACK is a flex `<div>`: inline `display: flex` with `flex-direction`, `gap`, `justify-content`,
  `align-items`; `flex-grow`/`align-self` on children. A GRID is a CSS-grid `<div>`: `display: grid`,
  `grid-template-columns: repeat(N, minmax(0, 1fr))` and `gap`; children fill cells in source order.
  Write equal tracks in exactly that `repeat(N, minmax(0, 1fr))` form: the properties panel reads and
  writes it as a column count. People can wrap selections in a stack or grid and drag items out; gap
  spacing survives those edits, whitespace and per-element margins do not. Inline flow is for runs of
  text with the odd `<a>`, `<strong>`, `<em>`.
- A DIAGRAM (boxes joined by lines) is neither: separate absolutely placed elements, never one
  `<svg>` (the editor selects an `<svg>` as one block). Read `diagrams.md` first.
- Explorations are ARTBOARDS: one frame per `.dc.html`, placed by `canvas.json`. The canvas gives pan
  and zoom; nothing in a file switches modes. `"is_interactive": true` only on artboards whose controls
  really work (handlers, inputs, links): they get the Play mark. A clickable prototype is one artboard
  per screen, joined by links (below).
- A PAGE (landing page, dashboard, web app screen, scrolling explainer) has `"expand": "fill"` on its
  board and a fluid root: in the focused view it fills the window and scrolls like a page (without
  `fill` it is scaled to fit). Side menu plus content: a `flex-wrap: wrap` row, the content
  `flex: 999 1 560px; min-width: 0`, so the menu (never sticky, never `100vh`) stacks on a phone.
  Toolbars wrap; wide tables sit in an `overflow-x: auto` box. On the canvas `100vh` is the frame's `h`,
  so `vh` is only for a whole-screen app root; a hero followed by more content takes a px/rem
  `min-height`. Never a `%` root height: the root's parent has no set height, so it collapses.
  `repeat(N, minmax(0, 1fr))` keeps N columns at every width, so a PAGE's card grids use
  `repeat(auto-fit, minmax(min(<min>px, 100%), 1fr))` with `<min>` at most one column's width at `w`.
- LAYOUT GUIDES: a board may carry `"guides"`, at most 6, drawn over the artboard on the canvas only
  (never in Play or in the markup): `{"kind":"columns","count":12,"gutter":24,"margin":80}` (`align`
  `"stretch"` by default, dividing the width inside `margin`; `"start"|"center"|"end"` pack `count`
  tracks of `"size"` px, `"offset"` from that edge; `"count":"auto"` fits as many as possible),
  `{"kind":"rows",…}` (the same fields down the height; by default 8 px rows every 8), and
  `{"kind":"grid","size":8}`; each may add `"color"` (hex/rgb/hsl, alpha = strength) and
  `"hidden":true`. Add guides only where a grid really helps. On a board with guides, lay content on
  them: a stretch column guide is `display:grid; grid-template-columns: repeat(count, minmax(0,1fr));
  column-gap:<gutter>px; padding-inline:<margin>px`, children spanning tracks. Treat guide edits people
  make as the intended layout.

## The template

### Holes

`{{ path }}` is a dotted lookup into `renderVals()` (`{{ user.name }}`, `{{ $index }}`) or a literal
(`{{ true }}`, `{{ 3 }}`, `{{ 'text' }}`). Never an expression: `{{ a + b }}`, `{{ !x }}`,
`{{ fn() }}` fail. Compute in `renderVals()` and return the result by name.

### Attributes

`x="literal"` is a string; `x="{{ path }}"` passes the raw value (a number, function, ref, object);
`x="a {{ p }} b"` interpolates a string. `class`/`for` become `className`/`htmlFor`.

### Events

Event attributes are whole holes with React's camelCase names: `onClick="{{ pick }}"`, where `pick` is a
function from `renderVals()`. Selected states (swatches, size pills, tabs) are the usual pattern: keep
the selection in `state`, and for per-item handlers build them in `renderVals()` —
`items: xs.map((x) => ({ ...x, pick: () => this.setState({ picked: x.id }) }))` — then
`onClick="{{ item.pick }}"` inside the `<sc-for>`. A `<script>` inside the template never runs.

### Control flow

- `<sc-if value="{{ cond }}" hint-placeholder-val="{{ true }}">…</sc-if>` renders when the value is
  truthy.
- `<sc-for list="{{ items }}" as="item" hint-placeholder-count="3">…</sc-for>` repeats, with
  `{{ item.x }}` and `{{ $index }}` in scope.
- Always set the `hint-*` attributes: they are what shows while values are not ready yet.

### Conditional styling in a loop

Compute the varying piece per item in `renderVals()` (`selected`, `ringStyle`) and branch with
`<sc-if>` or bind the value. A hole in a style is fine for live state (a selection highlight) and for a
declared tweak (`{{ accent }}`); every other static color, size or font is written inline as a literal,
so it paints at once and the properties panel can edit it.

### Links between artboards

`<a href="Cart.dc.html">View cart</a>` moves Play to that artboard (on the canvas and in the focused
view; not while editing). The href is relative to this artboard; a leading `/` means the project root
(`/flows/Cart.dc.html`). Style the `<a>` itself as the button: a `<button>` inside it swallows the
click. `href="#id"` scrolls within the artboard; `https://…` opens a new tab. Each artboard keeps its
own `state`, so a flow that must share state across screens is ONE artboard: handlers set a `state`
field, `renderVals()` returns a flag per screen, and each screen sits in its own `<sc-if>`.

### Child components

- `<dc-import name="Card" item="{{ it }}" hint-size="320px,200px"></dc-import>` renders the sibling file
  `Card.dc.html` (also an artboard of its own, listed in `boards`). Every other attribute becomes a prop
  (kebab-case → camelCase; read as `this.props.item`; declare object or function props in the child's
  `data-props` with `"editor": null`). Avoid a prop called `name`: it picks the file. `hint-size`
  (`W,H` in CSS lengths) is the placeholder box until the child renders: match the child's root size.
  Works inside `<sc-for>`. Never self-closing; never a capitalized tag (`<Card/>`).
- `<x-import component-from-global-scope="Acme.Button" variant="primary">Save</x-import>` renders a
  React component from a global, an installed design system's bundle (`design-systems.md`). Content
  between the tags is its `children`.

### helmet

`<helmet>…</helmet>` moves its children into the document head: `<style>` and Google Fonts `<link>`s.
Keep page basics there (`body { margin: 0 }`, `a`/`a:hover` colors, `@font-face`, `@keyframes`, rules
with `url(…)`); everything else is inline style.

### Not allowed

`<iframe>`, `<object>`, `<embed>`, `<frame>`, `<frameset>`, `<portal>`. Anything that loads must be a
relative project file, Google Fonts (`https://fonts.googleapis.com/css2…`,
`https://fonts.gstatic.com/…`), an upload (`/_blob/<id>`), or a `data:` URL. No remote `url()` in
styles. Plain links (`<a href>`) may point anywhere.

## The logic

```js
class Component extends DCLogic {
  state = { open: false };
  componentDidMount() { /* timers, observers */ }
  renderVals() { return { open: this.state.open, toggle: () => this.setState({ open: !this.state.open }) }; }
}
```

- Classic JavaScript: no TypeScript, no `import`/`export`. It must be `class Component extends
  DCLogic`. `DCLogic` and `React` are globals.
- `DCLogic` is a React class component without `render()`: `this.props`, `this.state`,
  `this.setState`, `this.forceUpdate`, lifecycle methods, `React.createRef()` (bind a ref with
  `ref="{{ view }}"`). Never define `render()`.
- `renderVals()` returns what the template reads: flat values, arrays, handlers, refs. Throwing from it
  shows the message on the artboard, and the page offers to send it to you.
- `this.props` holds the `data-props` defaults, then what a person set in Tweaks or an importing artboard
  passed. Still read with a fallback (`this.props.x ?? 'Hello'`).

### data-props

The `data-props` attribute on the logic script is JSON declaring the props:

```json
{
  "$preview": { "width": 1280, "height": 800 },
  "accent": { "editor": "color", "default": "#2563eb", "options": ["#2563eb", "#16a34a", "#c2410c"] },
  "columns": { "editor": "int", "default": 3, "min": 1, "max": 6 },
  "density": { "editor": "range", "default": 1, "min": 0.75, "max": 1.5, "step": 0.05, "section": "Layout" },
  "dark": { "editor": "boolean", "default": false },
  "variant": { "editor": "enum", "default": "cards", "options": ["cards", "list"] },
  "onSave": { "editor": null, "tsType": "() => void" }
}
```

- Editors: `text`, `color` (3–4 hex `options` render swatches), `int`, `float`, `range` (`min`,
  `max`, `step`, `unit`), `boolean`, `enum` (`options`), or `null` for props that are not tweaks
  (callbacks, objects). `section` groups controls; `label` renames one. `default` seeds the control
  and `this.props`.
- `$preview` is the artboard's size: the board's `w`×`h` in `canvas.json`.
- **Tweaks are levers, not copy.** Every prop with an editor becomes a control in the Tweaks panel, so
  declare a few deliberate ones: switches (dark mode, density, a variant, an item count) and values
  that run through the whole design (one accent color, a spacing or type scale). No tweaks for labels
  or body copy unless asked: write copy as literal text so people retype it in place. No tweak for a
  color used once: people restyle that element in the properties panel.
- **Escaping.** It is an ordinary HTML attribute: entities decode before the JSON is parsed. Single-quote
  the attribute; inside, write `&amp;` for `&`, `&#39;` for `'`, and `\"` for a double quote in a JSON
  string. Nothing else needs escaping: raw UTF-8 (dashes, accents) is fine.
- **Multi-line text from a prop** renders as a text node, so `<br>` shows literally. Put `\n` in the
  value and `white-space: pre-line` on the element, or split it into one prop per line.

## Checking

`open-artifact check <root>` reports, per artboard: a bad path, a missing support script or template, invalid
`data-props`, a logic script without `class Component extends DCLogic` or with `import`/`export`,
unclosed tags, forbidden elements, holes that are not paths or literals, event attributes that are not
whole holes, remote URLs, `<sc-for>`/`<sc-if>`/`<dc-import>` without their required attributes, imports
of missing files, links to missing artboards. Warnings: no `<title>` or `lang`, a `render()` method,
missing placeholder hints.
