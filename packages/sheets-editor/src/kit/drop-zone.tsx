import * as React from 'react';
import { cn } from './cn.ts';
import { useUiWindow } from './theme.tsx';

export type DropZoneScope = 'zone' | 'page';

/** `idle`: no file is dragged here; `off-target`: a file is dragged elsewhere in the page; `on-target`: over this zone. */
export type DropZoneDragState = 'idle' | 'off-target' | 'on-target';

export type DropNoticeCode = 'folder-not-allowed' | 'file-read-error' | 'too-many-files';

export interface DropNotice {
  code: DropNoticeCode;
  count: number;
}

export interface DroppedFiles {
  /** The file dropped; a zone takes one file at a time. */
  accepted: File[];
  /** What was dropped but not taken. */
  notices: DropNotice[];
}

/** The page opens its own file picker; the zone only takes drops. */
export interface ExternalPickerPath {
  mode: 'external';
  control?: unknown;
}

export interface UseDropZoneOptions {
  /** `page` takes files dropped anywhere in the document that no zone claims. */
  scope?: DropZoneScope;
  disabled?: boolean;
  pickerPath?: ExternalPickerPath;
  onFiles: (files: DroppedFiles) => void;
}

export interface DropZoneProps {
  ref: (element: HTMLElement | null) => void;
  onDragEnter?: React.DragEventHandler<HTMLElement>;
  onDragOver?: React.DragEventHandler<HTMLElement>;
  onDrop?: React.DragEventHandler<HTMLElement>;
  'data-drag-over'?: true;
  'data-disabled'?: true;
}

export interface DropZoneHandle {
  dragState: DropZoneDragState;
  getZoneProps: <Props extends object>(props?: Props) => Omit<Props, keyof DropZoneProps> & DropZoneProps;
}

interface ZoneSnapshot {
  element: HTMLElement | null;
  page: boolean;
  disabled: boolean;
  receive: (dataTransfer: DataTransfer) => void;
}

type ZoneGetter = () => ZoneSnapshot;

const isFileDrag = (event: DragEvent): boolean => event.dataTransfer?.types.includes('Files') ?? false;

const isNode = (target: EventTarget | null): target is Node => target !== null && typeof (target as Partial<Node>).nodeType === 'number';

const asElement = (target: EventTarget | null): Element | null => {
  if (!isNode(target)) return null;
  return target.nodeType === 1 ? (target as Element) : target.parentElement;
};

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);

function contentEditableOf(element: Element | null): string | undefined {
  if (element === null || ['input', 'textarea', 'select', 'button'].includes(element.localName)) return undefined;
  return element.closest('[contenteditable]')?.getAttribute('contenteditable')?.toLowerCase();
}

function isEnabledFileInput(element: Element | null): boolean {
  return element !== null && element.localName === 'input' && (element as HTMLInputElement).type === 'file' && !element.matches(':disabled');
}

function isEditableTextField(element: Element | null): boolean {
  if (element === null) return false;
  const isTextField =
    element.localName === 'textarea' || (element.localName === 'input' && TEXT_INPUT_TYPES.has((element as HTMLInputElement).type));
  return isTextField && !(element as HTMLInputElement).readOnly && !element.matches(':disabled');
}

/** A drop the browser handles itself: a file input, rich editable text, or text dragged into a text field. */
function isNativeDropTarget(event: DragEvent): boolean {
  const element = asElement(event.target);
  const editable = contentEditableOf(element);
  if (isEnabledFileInput(element) || editable === '' || editable === 'true') return true;
  const types = event.dataTransfer?.types ?? [];
  const carriesText = types.includes('text/plain') || types.includes('text/uri-list');
  return carriesText && (isEditableTextField(element) || editable === 'plaintext-only');
}

function collectOneFile(dataTransfer: DataTransfer): DroppedFiles {
  const accepted: File[] = [];
  let folders = 0;
  let unreadable = 0;
  let extra = 0;
  const offer = (file: File | null): void => {
    if (file === null) unreadable += 1;
    else if (accepted.length > 0) extra += 1;
    else accepted.push(file);
  };
  const items = Array.from(dataTransfer.items ?? []).filter((item) => item.kind === 'file');
  if (items.length === 0) {
    for (const file of Array.from(dataTransfer.files ?? [])) offer(file);
  } else {
    for (const item of items) {
      const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
      if (entry?.isDirectory === true) folders += 1;
      else offer(item.getAsFile());
    }
  }
  const notices: DropNotice[] = [];
  if (folders > 0) notices.push({ code: 'folder-not-allowed', count: folders });
  if (unreadable > 0) notices.push({ code: 'file-read-error', count: unreadable });
  if (extra > 0) notices.push({ code: 'too-many-files', count: extra });
  return { accepted, notices };
}

interface ZoneEntry {
  notify: () => void;
  ownerDocument: Document;
}

class DropZoneRegistry {
  private zones = new Map<ZoneGetter, ZoneEntry>();
  private listeners = new Map<Document, AbortController>();
  private drag: Document | null = null;
  private over: ZoneGetter | null = null;
  private entered: EventTarget | null = null;

  private reset = (): void => {
    this.entered = null;
    this.set(null, null);
  };

  register(zone: ZoneGetter, notify: () => void, ownerDocument: Document): () => void {
    this.zones.set(zone, { notify, ownerDocument });
    this.syncListeners();
    return () => {
      this.zones.delete(zone);
      this.syncListeners();
      if (this.over === zone) this.set(this.drag, null);
    };
  }

  relocate(zone: ZoneGetter, ownerDocument: Document): void {
    const entry = this.zones.get(zone);
    if (entry === undefined || entry.ownerDocument === ownerDocument) return;
    entry.ownerDocument = ownerDocument;
    this.syncListeners();
  }

  stateOf(zone: ZoneGetter): DropZoneDragState {
    if (this.drag === null || this.zones.get(zone)?.ownerDocument !== this.drag) return 'idle';
    return this.over === zone ? 'on-target' : 'off-target';
  }

  claimDragOver(zone: ZoneGetter, event: DragEvent): boolean {
    if (!isFileDrag(event) || this.over !== zone) return false;
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
    return true;
  }

  claimDrop(zone: ZoneGetter, event: DragEvent): DataTransfer | null {
    if (!isFileDrag(event) || this.route(event) !== zone) return null;
    event.preventDefault();
    return event.dataTransfer;
  }

  /** The innermost enabled zone under the drag, else the page zone of the same document. */
  private route(event: DragEvent): ZoneGetter | null {
    const { target } = event;
    if (!isNode(target) || isEnabledFileInput(asElement(target))) return null;
    const targetDocument = target.ownerDocument ?? (target as Document);
    let innermost: ZoneGetter | null = null;
    let innermostElement: HTMLElement | null = null;
    let page: ZoneGetter | null = null;
    for (const [zone, { ownerDocument }] of this.zones) {
      const { element, page: isPage, disabled } = zone();
      if (disabled) continue;
      if (isPage) {
        if (ownerDocument === targetDocument) page = zone;
      } else if (element?.contains(target) === true && (innermostElement === null || innermostElement.contains(element))) {
        innermost = zone;
        innermostElement = element;
      }
    }
    return innermost ?? page;
  }

  private set(dragDocument: Document | null, over: ZoneGetter | null): void {
    if (dragDocument === this.drag && over === this.over) return;
    this.drag = dragDocument;
    this.over = over;
    for (const { notify } of this.zones.values()) notify();
  }

  private syncListeners(): void {
    const documents = new Set<Document>();
    for (const { ownerDocument } of this.zones.values()) documents.add(ownerDocument);
    for (const [ownerDocument, controller] of this.listeners) {
      if (documents.has(ownerDocument)) continue;
      controller.abort();
      this.listeners.delete(ownerDocument);
    }
    for (const ownerDocument of documents) {
      const view = ownerDocument.defaultView;
      if (view !== null && !this.listeners.has(ownerDocument)) this.listeners.set(ownerDocument, this.listen(ownerDocument, view));
    }
    if (this.drag !== null && !this.listeners.has(this.drag)) this.reset();
  }

  private listen(ownerDocument: Document, view: Window): AbortController {
    const controller = new AbortController();
    const capture = { capture: true, signal: controller.signal };
    const bubble = { signal: controller.signal };
    const onDragOver = (event: DragEvent): void => {
      if (!isFileDrag(event)) return;
      if (!isNativeDropTarget(event)) event.preventDefault();
      this.entered = event.composedPath()[0] ?? null;
      this.set(ownerDocument, this.route(event));
    };
    view.addEventListener('dragenter', onDragOver, capture);
    view.addEventListener('dragover', onDragOver, capture);
    view.addEventListener(
      'dragleave',
      (event) => {
        if (isFileDrag(event) && event.composedPath()[0] === this.entered) this.reset();
      },
      capture,
    );
    view.addEventListener(
      'drop',
      (event) => {
        if (!isFileDrag(event)) return;
        if (!isNativeDropTarget(event)) event.preventDefault();
        view.setTimeout(this.reset);
      },
      capture,
    );
    view.addEventListener('dragend', this.reset, capture);
    const onPageDragOver = (event: DragEvent): void => {
      if (!isFileDrag(event) || this.over?.().page !== true) return;
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
    };
    view.addEventListener('dragenter', onPageDragOver, bubble);
    view.addEventListener('dragover', onPageDragOver, bubble);
    view.addEventListener(
      'drop',
      (event) => {
        if (!isFileDrag(event) || event.dataTransfer === null) return;
        const zone = this.route(event)?.();
        if (zone?.page !== true) return;
        event.preventDefault();
        zone.receive(event.dataTransfer);
      },
      bubble,
    );
    return controller;
  }
}

const registry = new DropZoneRegistry();

/**
 * Takes one file dragged onto an element (`scope: 'zone'`) or anywhere on the page
 * (`scope: 'page'`). The innermost enabled zone under the pointer wins; drops into file inputs,
 * editable text and text fields are left to the browser.
 */
export function useDropZone({ scope = 'zone', disabled = false, onFiles }: UseDropZoneOptions): DropZoneHandle {
  const zoneRef = React.useRef<HTMLElement | null>(null);
  const latest = React.useRef({ scope, disabled, onFiles });
  latest.current = { scope, disabled, onFiles };

  const receive = React.useCallback((dataTransfer: DataTransfer) => {
    const files = collectOneFile(dataTransfer);
    if (latest.current.disabled || (files.accepted.length === 0 && files.notices.length === 0)) return;
    latest.current.onFiles(files);
  }, []);

  const getZone = React.useCallback<ZoneGetter>(
    () => ({ element: zoneRef.current, page: latest.current.scope === 'page', disabled: latest.current.disabled, receive }),
    [receive],
  );

  const ownerDocument = useUiWindow().document;
  // Disabled zones stay registered so file drags anywhere in the document still never open the file in the tab.
  const subscribe = React.useCallback(
    (notify: () => void) => registry.register(getZone, notify, zoneRef.current?.ownerDocument ?? ownerDocument),
    [getZone, ownerDocument],
  );
  const dragState = React.useSyncExternalStore(
    subscribe,
    (): DropZoneDragState => (disabled ? 'idle' : registry.stateOf(getZone)),
    (): DropZoneDragState => 'idle',
  );

  const setZoneElement = React.useCallback(
    (element: HTMLElement | null) => {
      zoneRef.current = element;
      if (element !== null) registry.relocate(getZone, element.ownerDocument);
    },
    [getZone],
  );

  const getZoneProps = React.useCallback(
    <Props extends object>(props?: Props): Omit<Props, keyof DropZoneProps> & DropZoneProps => {
      const own = (props ?? {}) as Props & Partial<DropZoneProps>;
      const zoneProps: DropZoneProps = { ref: setZoneElement, 'data-disabled': disabled || undefined };
      if (scope === 'zone') {
        const onZoneDragOver = (event: React.DragEvent<HTMLElement>): void => {
          if (registry.claimDragOver(getZone, event.nativeEvent)) event.stopPropagation();
        };
        zoneProps.onDragEnter = (event) => {
          onZoneDragOver(event);
          own.onDragEnter?.(event);
        };
        zoneProps.onDragOver = (event) => {
          onZoneDragOver(event);
          own.onDragOver?.(event);
        };
        zoneProps.onDrop = (event) => {
          const dataTransfer = registry.claimDrop(getZone, event.nativeEvent);
          if (dataTransfer !== null) {
            event.stopPropagation();
            receive(dataTransfer);
          }
          own.onDrop?.(event);
        };
        zoneProps['data-drag-over'] = dragState === 'on-target' || undefined;
      }
      return { ...own, ...zoneProps };
    },
    [disabled, dragState, getZone, receive, scope, setZoneElement],
  );

  return { dragState, getZoneProps };
}

export interface DropZoneOverlayProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> {
  dragState: DropZoneDragState;
  className?: string;
}

/** The ring and glow shown over a zone while a file is dragged onto it. Place it inside the zone, which must be positioned. */
function DropZoneOverlay({ dragState, className, ...props }: DropZoneOverlayProps): React.ReactElement {
  return (
    <div
      {...props}
      aria-hidden
      data-ui="DropZone"
      data-drag-over={dragState === 'on-target' || undefined}
      className={cn(
        'pointer-events-none absolute inset-0 z-10 rounded-[inherit] opacity-0 shadow-drop-ring',
        'transition-opacity duration-snap ease-out motion-reduce:transition-none data-[drag-over]:opacity-100',
        className,
      )}
    >
      <div className="absolute inset-0 rounded-[inherit] opacity-0 shadow-drop-glow transition-opacity duration-base ease-out motion-reduce:transition-none [[data-drag-over]>&]:opacity-100 [[data-drag-over]>&]:delay-100" />
    </div>
  );
}

export const DropZone = { Overlay: DropZoneOverlay };
