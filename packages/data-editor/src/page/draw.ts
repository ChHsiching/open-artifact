/**
 * `dash.draw` drawings: the page's top `data-draw` elements, drawn by the spec registered under their name.
 */

export const DRAW_ATTRIBUTE = 'data-draw';
export const DRAW_STATE_ATTRIBUTE = 'data-dash-draw-state';

/** The `display` values of an element that has no box of its own to hold the height of. */
const NO_BOX_DISPLAY_PATTERN = /^(inline|contents|ruby.*|table|inline-table|table-.+)$/;

/** What `dash.draw(name, …)` takes once normalized: a bare function is `{update}`. */
export interface PageDrawSpec {
  mount?: (element: Element) => unknown;
  update?: (element: Element, made: unknown) => void;
  unmount?: (element: Element, made: unknown) => void;
}

export interface PageDrawingsHost {
  /** Runs page code (a draw's mount/update/unmount) under the one-writer guard. */
  run(fn: () => void): void;
  threw(name: string, error: unknown): void;
  drawn(): void;
}

/** The `data-draw` elements of the mounted page and the `dash.draw` specs that draw them. */
export interface PageDrawings {
  /** Registers a spec; true when the name is new. */
  define(name: string, spec: PageDrawSpec): boolean;
  names(): Set<string>;
  /** Draws every connected drawing not under `[hidden]` (only `name`'s when given). */
  pass(name?: string): void;
  stop(): void;
}

/** `dash.draw`'s second argument: a function is `{update}`; else `{mount, update, unmount}`, at least one a function. */
export function toDrawSpec(input: unknown): PageDrawSpec | null {
  if (typeof input === 'function') return { update: input as PageDrawSpec['update'] };
  if (typeof input !== 'object' || input === null) return null;
  const { mount, update, unmount } = input as Record<string, unknown>;
  const parts = [mount, update, unmount];
  if (parts.every((part) => part === undefined) || parts.some((part) => part !== undefined && typeof part !== 'function'))
    return null;
  return {
    mount: mount as PageDrawSpec['mount'],
    update: update as PageDrawSpec['update'],
    unmount: unmount as PageDrawSpec['unmount'],
  };
}

/** `root` and its `data-draw` descendants that no other drawing holds. */
export function findTopDrawings(root: Element): Element[] {
  const isTop = (element: Element): boolean => (element.parentElement?.closest(`[${DRAW_ATTRIBUTE}]`) ?? null) === null;
  return [root, ...root.querySelectorAll(`[${DRAW_ATTRIBUTE}]`)].filter(
    (element) => element.hasAttribute(DRAW_ATTRIBUTE) && isTop(element),
  );
}

/**
 * Runs `dash.draw` specs on the page's top `data-draw` elements: on each pass, when an element's own width changes
 * (not the page's), when a `hidden` above it comes off, and unmounts what leaves the page. A drawing that has been
 * drawn before is redrawn with its box held at the height it had, so the page does not jump.
 */
export function createPageDrawings(root: Element, host: PageDrawingsHost): PageDrawings {
  const specs = new Map<string, PageDrawSpec>();
  const mounted = new Map<Element, { spec: PageDrawSpec; made: unknown }>();
  const widths = new WeakMap<Element, number>();
  const drawnBefore = new WeakSet<Element>();
  const widthChanged = (element: Element): boolean => element.clientWidth !== widths.get(element);
  const nameOf = (element: Element): string => element.getAttribute(DRAW_ATTRIBUTE) ?? '';

  const resizeObserver = new ResizeObserver((entries) => {
    const targets = entries.map((entry) => entry.target);
    const gone = targets.filter((element) => !element.isConnected);
    const resized = widthChanged(root) ? [] : targets.filter((element) => element.isConnected && widthChanged(element));
    widths.set(root, root.clientWidth);
    for (const element of gone) unmount(element);
    for (const element of resized) widths.set(element, element.clientWidth);
    draw(resized.filter((element) => element.clientWidth > 0));
    if (gone.length + resized.length > 0) host.drawn();
  });

  function shownDrawings(records: MutationRecord[]): Element[] {
    const targets = records
      .map((record) => record.target)
      .filter((target): target is Element => target instanceof Element && target.isConnected && !target.hasAttribute('hidden'));
    return [...new Set(targets.flatMap(findTopDrawings))].filter((element) => specs.has(nameOf(element)));
  }

  const hiddenObserver = new MutationObserver((records) => {
    const shown = shownDrawings(records);
    draw(shown);
    if (shown.length > 0) host.drawn();
  });

  function findHeldBox(element: Element): HTMLElement | null {
    for (let current: Element | null = element; current instanceof HTMLElement && current !== root; current = current.parentElement) {
      const { display } = getComputedStyle(current);
      if (display === 'none') return null;
      if (!NO_BOX_DISPLAY_PATTERN.test(display)) return current;
    }
    return null;
  }

  function holdHeights(elements: Element[]): ((property: string) => void) | null {
    const releases: ((property: string) => void)[] = [];
    const held = [...new Set(elements.map(findHeldBox))].flatMap((box) =>
      box === null ? [] : [{ box, height: getComputedStyle(box).height }],
    );
    for (const { box, height } of held) {
      if (!(Number.parseFloat(height) > 0)) continue;
      const hadStyle = box.hasAttribute('style');
      for (const [property, value] of [
        ['min-height', height],
        ['overflow-anchor', 'none'],
      ] as const) {
        const before = { value: box.style.getPropertyValue(property), rank: box.style.getPropertyPriority(property) };
        box.style.setProperty(property, value, 'important');
        const applied = box.style.getPropertyValue(property);
        releases.push((only) => {
          if (
            only === property &&
            box.style.getPropertyValue(property) === applied &&
            box.style.getPropertyPriority(property) === 'important'
          )
            box.style.setProperty(property, before.value, before.rank);
        });
      }
      releases.push((only) => {
        if (only === 'overflow-anchor' && !hadStyle && (box.getAttribute('style') ?? '') === '') box.removeAttribute('style');
      });
    }
    return releases.length === 0 ? null : (only) => releases.forEach((release) => release(only));
  }

  function unmount(element: Element): void {
    resizeObserver.unobserve(element);
    widths.delete(element);
    drawnBefore.delete(element);
    const entry = mounted.get(element);
    if (entry === undefined) return;
    mounted.delete(element);
    try {
      host.run(() => entry.spec.unmount?.(element, entry.made));
    } catch (error) {
      host.threw(nameOf(element), error);
    }
  }

  const isShown = (element: Element): boolean => element.isConnected && element.closest('[hidden]') === null;

  function drawOne(element: Element): boolean {
    const name = nameOf(element);
    const spec = specs.get(name);
    if (spec === undefined || !isShown(element)) return false;
    try {
      host.run(() => {
        if (!mounted.has(element) && (spec.mount ?? spec.unmount) !== undefined) {
          if (spec.mount !== undefined) element.replaceChildren();
          mounted.set(element, { spec, made: spec.mount?.(element) });
        }
        spec.update?.(element, mounted.get(element)?.made);
      });
      element.removeAttribute(DRAW_STATE_ATTRIBUTE);
    } catch (error) {
      host.threw(name, error);
      unmount(element);
      element.replaceChildren();
      element.setAttribute(DRAW_STATE_ATTRIBUTE, 'error');
    }
    return true;
  }

  function draw(elements: Element[]): void {
    const seen = new Set<Element>();
    const drawn = new Set<Element>();
    const shown = elements.filter(isShown);
    const release = shown.every((element) => drawnBefore.has(element)) ? holdHeights(shown) : null;
    if (release !== null) root.getBoundingClientRect();
    try {
      for (
        let batch = elements;
        batch.length > 0;
        batch = shownDrawings(hiddenObserver.takeRecords()).filter((element) => !drawn.has(element))
      ) {
        for (const element of batch) {
          seen.add(element);
          if (drawOne(element)) drawn.add(element);
        }
        for (const element of drawn) drawnBefore.add(element);
      }
    } finally {
      if (release !== null) root.getBoundingClientRect();
      release?.('min-height');
      for (const element of seen) {
        if (!widths.has(element)) resizeObserver.observe(element);
        widths.set(element, element.clientWidth);
      }
      widths.set(root, root.clientWidth);
      release?.('overflow-anchor');
    }
  }

  return {
    define(name, spec) {
      if (specs.size === 0) hiddenObserver.observe(root, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
      const isNew = !specs.has(name);
      specs.set(name, spec);
      return isNew;
    },
    names: () => new Set(specs.keys()),
    pass(name) {
      if (specs.size === 0) return;
      for (const element of [...mounted.keys()]) if (!root.contains(element)) unmount(element);
      draw(
        findTopDrawings(root).filter((element) => specs.has(nameOf(element)) && (name === undefined || nameOf(element) === name)),
      );
    },
    stop() {
      for (const element of [...mounted.keys()]) unmount(element);
      specs.clear();
      resizeObserver.disconnect();
      hiddenObserver.disconnect();
    },
  };
}
