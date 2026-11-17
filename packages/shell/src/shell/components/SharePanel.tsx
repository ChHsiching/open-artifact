/**
 * The Share button and its panel, laid out like share dialog: a popover with a caret under the button.
 *
 * - **Share**: the people with access (the owner, then each guest who
 *   joined, online first, with a role menu and Remove), general access (this
 *   computer, or anyone on the network with a link) and a link per role to
 *   copy, turn on or off, or reset (`artifact.share`).
 * - **Export**: "send a link instead", the page's formats (`formats`, run
 *   with `export_format`) or a v1 page's downloads (`chrome_exports`), and
 *   last the whole folder as a zip (`artifact.archive`).
 *
 * Escape closes the confirm box, then an open menu, then the panel.
 */

import { Menu as BaseMenu } from '@base-ui/react/menu';
import { Popover as BasePopover } from '@base-ui/react/popover';
import type { ShareGuest, ShareRole, ShareView } from '@open-artifact/protocol';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  Download,
  Eye,
  File,
  FileText,
  Folder,
  Image,
  Link,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Network,
  Pencil,
  Presentation,
  Share2,
  Trash2,
  TriangleAlert,
  Users,
  Video,
  X,
} from 'lucide-react';
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Button, IconButton, Segmented, cn } from '@open-artifact/ui';
import { ago, avatarColor, formatKind, initials, type FormatKind } from '../../lib/format.ts';
import { t, type MessageKey } from '../../lib/i18n.ts';
import { command, exportFormat, requestExports } from '../bridge.ts';
import { copyShareLink, downloadArchive, refreshShare, shellLink } from '../actions.ts';
import { useAgentName, useTitle } from '../hooks.ts';
import { whyText } from '../labels.ts';
import { ROLES, exportEntries, hasExportTab, isShared, leastRole, offersArchive, shownAddresses, sortedGuests } from '../model.ts';
import { useBoot, useShell } from '../store.ts';

const ROLE_NAME: Record<ShareRole, MessageKey> = { editor: 'roleEditor', commenter: 'roleCommenter', viewer: 'roleViewer' };
const LINK_TITLE: Record<ShareRole, MessageKey> = { editor: 'linkEditor', commenter: 'linkCommenter', viewer: 'linkViewer' };
const ROLE_NOTE: Record<ShareRole, MessageKey> = { editor: 'noteEditor', commenter: 'noteCommenter', viewer: 'noteViewer' };
const ROLE_ICON: Record<ShareRole, ReactNode> = {
  editor: <Pencil className="size-4" />,
  commenter: <MessageSquare className="size-4" />,
  viewer: <Eye className="size-4" />,
};

/** A coloured file tile. */
function FileTile({ color, text, size, y }: { color: string; text: string; size: number; y: number }) {
  return (
    <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
      <rect width="22" height="22" rx="5" fill={color} />
      <text x="11" y={y} textAnchor="middle" fontSize={size} fontWeight="700" fontFamily="ui-sans-serif, system-ui, sans-serif" fill="#fff">
        {text}
      </text>
    </svg>
  );
}

const FORMAT_ICON: Record<FormatKind, ReactNode> = {
  folder: <Folder className="size-[18px]" />,
  pdf: <FileTile color="#e0342b" text="PDF" size={8} y={14.6} />,
  document: <FileTile color="#2b579a" text="W" size={11} y={15.4} />,
  slides: <Presentation className="size-[18px]" />,
  image: <Image className="size-[18px]" />,
  html: <Code className="size-[18px]" />,
  video: <Video className="size-[18px]" />,
  text: <FileText className="size-[18px]" />,
  file: <File className="size-[18px]" />,
};

// ---- layers over the panel: menus and the confirm box ----------------------------------------------------------------

/** A confirm box over the panel. */
interface AskSpec {
  title: string;
  body: string;
  ok: string;
  run: () => void;
}

/** What the panel's menus and buttons tell the panel, so Escape closes the top layer only. */
interface Layers {
  /** A menu opened or closed (`reason`: Base UI's). */
  menu(id: string, open: boolean, reason?: string): void;
  ask(spec: AskSpec): void;
}

const LayersContext = createContext<Layers>({ menu: () => {}, ask: (spec) => spec.run() });

/** One row of a panel menu: a label, a note under it, a tick for the current choice. */
interface PanelMenuItem {
  key: string;
  label: string;
  sub?: string;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
}

/** A menu of the panel: under its trigger, its rows with notes. */
function PanelMenu({ trigger, items, align = 'end' }: { trigger: ReactElement<Record<string, unknown>>; items: PanelMenuItem[]; align?: 'start' | 'end' }) {
  const layers = useContext(LayersContext);
  const id = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => () => layers.menu(id, false), [layers, id]);
  const radio = items.some((item) => item.checked !== undefined);
  return (
    <BaseMenu.Root
      open={open}
      modal={false}
      onOpenChange={(next, details) => {
        setOpen(next);
        layers.menu(id, next, details.reason);
      }}
    >
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner side="bottom" align={align} sideOffset={6} collisionPadding={12} className="z-[1001]">
          <BaseMenu.Popup
            data-share-menu=""
            className="min-w-[200px] max-w-[min(340px,calc(100vw-24px))] rounded-xl bg-surface p-1.5 text-[13px] text-fg shadow-popup outline-none transition-opacity duration-100 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          >
            {items.map((item) => (
              <BaseMenu.Item
                key={item.key}
                disabled={item.disabled}
                onClick={item.run}
                {...(radio ? { role: 'menuitemradio', 'aria-checked': !!item.checked } : {})}
                className="flex w-full cursor-default select-none items-center gap-4 rounded-lg py-2 pl-3 pr-2.5 text-left outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-45"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn('truncate', item.danger && 'text-danger')}>{item.label}</span>
                  {item.sub ? <span className="text-xs text-fg-muted">{item.sub}</span> : null}
                </span>
                {radio ? <span className="flex w-[18px] shrink-0 justify-center text-accent">{item.checked ? <Check className="size-4" /> : null}</span> : null}
              </BaseMenu.Item>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

/** The confirm box, over the whole panel. */
function Confirm({ spec, onDone }: { spec: AskSpec; onDone: (yes: boolean) => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  // After the menu that asked hands focus back to its trigger.
  useEffect(() => {
    const frame = requestAnimationFrame(() => cancel.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={spec.title}
      className="absolute inset-0 z-[2] grid place-items-center rounded-2xl bg-surface/85 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDone(false);
      }}
    >
      <div className="w-full max-w-[360px] rounded-xl bg-surface p-[18px] shadow-popup">
        <h3 className="m-0 mb-1.5 text-[15px] font-semibold">{spec.title}</h3>
        <p className="m-0 mb-4 text-fg-muted">{spec.body}</p>
        <div className="flex justify-end gap-2">
          <Button ref={cancel} size="lg" onClick={() => onDone(false)}>
            {t('cancel')}
          </Button>
          <Button size="lg" variant="danger" onClick={() => onDone(true)}>
            {spec.ok}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- small parts ---------------------------------------------------------------------------------------------------

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 mt-[18px] text-[13px] text-fg-muted">{children}</div>;
}

function Circle({ children, dim }: { children: ReactNode; dim?: boolean }) {
  return <div className={cn('grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-fg', dim && 'opacity-50')}>{children}</div>;
}

const ROW = 'flex min-h-12 items-center gap-3 py-1';
const PILL = 'border-transparent bg-surface-2 px-3 text-[13px] hover:bg-hover';

/** "Copy link", then "Copied" in green for a moment. */
function CopyButton({ which, url }: { which: string; url: string }) {
  const copied = useShell((state) => state.share.copied === which);
  return (
    <Button
      size="lg"
      variant="ghost"
      icon={copied ? <Check className="size-3.5" /> : <Link className="size-3.5" />}
      className={cn(PILL, copied && 'text-success')}
      disabled={!url}
      onClick={() => void copyShareLink(which, url)}
    >
      {copied ? t('copied') : t('copyLink')}
    </Button>
  );
}

/** A select-looking button that opens a panel menu: its value and a chevron. */
function selectTrigger(label: string, props: Record<string, unknown> = {}, wide = false): ReactElement<Record<string, unknown>> {
  return (
    <Button
      size="lg"
      variant="ghost"
      className={cn('gap-1.5 px-2.5 font-normal data-[popup-open]:bg-hover', wide && '-ml-2.5 max-w-full font-medium')}
      {...props}
    >
      <span className="truncate">{label}</span>
      <ChevronDown className="size-3.5 shrink-0 text-fg-muted" />
    </Button>
  );
}

// ---- the Share tab -------------------------------------------------------------------------------------------------

function OwnerRow() {
  const boot = useBoot();
  const name = boot.userName || t('you');
  return (
    <div className={ROW}>
      <div className="grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white" style={{ background: avatarColor(`local${name}`) }}>
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate">
          {name}
          {boot.userName ? <span className="text-fg-muted"> {t('you')}</span> : null}
        </div>
        <div className="truncate text-xs text-fg-muted">{t('thisComputer')}</div>
      </div>
      <span className="inline-flex h-8 items-center gap-1.5 px-2.5 text-fg-subtle">
        {t('owner')}
        <ChevronDown className="size-3.5" />
      </span>
    </div>
  );
}

/** Someone who joined: online or when last seen, their role, Remove. */
function GuestRow({ guest, view }: { guest: ShareGuest; view: ShareView }) {
  const layers = useContext(LayersContext);
  const status = guest.online ? t('online') : guest.active ? t('seenAgo', { when: ago(guest.seen ?? guest.joined) }) : t('guestPaused');
  return (
    <div className={ROW} data-share-guest={guest.id}>
      <div
        className={cn('relative grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white', !guest.active && 'opacity-55 grayscale')}
        style={{ background: avatarColor(guest.id) }}
      >
        {initials(guest.name)}
        {guest.online ? <span aria-hidden className="absolute -bottom-px -right-px size-2.5 rounded-full border-2 border-surface bg-success" /> : null}
      </div>
      <div className={cn('min-w-0 flex-1', !guest.active && 'opacity-70')}>
        <div className="truncate">{guest.name}</div>
        <div className={cn('truncate text-xs', guest.online ? 'text-success' : 'text-fg-muted')}>{status}</div>
      </div>
      <PanelMenu
        trigger={selectTrigger(t(ROLE_NAME[guest.role]), { 'aria-label': t('changeRole', { name: guest.name }) })}
        items={ROLES.map((role) => {
          const on = !!view.links[role]?.on;
          return {
            key: role,
            label: t(ROLE_NAME[role]),
            ...(on ? {} : { sub: t('roleLinkOff') }),
            checked: role === guest.role,
            disabled: !on,
            run: () => {
              if (role !== guest.role) void refreshShare({ guests: { [guest.id]: role } });
            },
          };
        })}
      />
      <IconButton
        label={t('removeGuest', { name: guest.name })}
        title={t('remove')}
        noTooltip
        size="lg"
        icon={<Trash2 className="size-4" />}
        onClick={() =>
          layers.ask({
            title: t('removeTitle', { name: guest.name }),
            body: t('removeBody'),
            ok: t('remove'),
            run: () => void refreshShare({ guests: { [guest.id]: null } }),
          })
        }
      />
    </div>
  );
}

/** General access: this computer only, or anyone on the network with a link; where it can be opened. */
function GeneralAccess({ view }: { view: ShareView }) {
  const addresses = shownAddresses(view);
  const where = view.lan ? (view.addresses?.length ? t('onNetworkAt', { addresses: addresses.join(' · ') }) : t('noAddress')) : t('whereOff');
  const port = view.port ? `:${view.port}` : '';
  return (
    <div className={cn(ROW, 'items-start')}>
      <Circle>{view.lan ? <Network className="size-4" /> : <Lock className="size-4" />}</Circle>
      <div className="min-w-0 flex-1">
        <PanelMenu
          align="start"
          trigger={selectTrigger(view.lan ? t('onLan') : t('onlyThisComputer'), { 'aria-label': t('generalAccess') }, true)}
          items={[
            { key: 'here', label: t('onlyThisComputer'), sub: t('onlyHereSub'), checked: !view.lan, run: () => view.lan && void refreshShare({ lan: false }) },
            { key: 'lan', label: t('onLan'), sub: t('onLanSub'), checked: view.lan, run: () => !view.lan && void refreshShare({ lan: true }) },
          ]}
        />
        <div className="break-words text-xs text-fg-muted">{where}</div>
        {view.lan && view.tailnet ? <div className="mt-0.5 break-words text-xs text-fg-muted">{t('onTailnet', { address: `${view.tailnet.address}${port}` })}</div> : null}
      </div>
    </div>
  );
}

/** A role's link: Copy link when on, Turn on when off, and its ⋯ menu. */
function LinkRow({ role, view }: { role: ShareRole; view: ShareView }) {
  const layers = useContext(LayersContext);
  const link = view.links[role];
  if (!link) return null;
  const tailnet = view.lan && view.tailnet ? view.tailnet.links[role] : undefined;
  const items: PanelMenuItem[] = [
    ...(link.on && tailnet
      ? [{ key: 'tailnet', label: t('copyTailnet'), sub: t('copyTailnetNote', { address: view.tailnet!.address }), run: () => void copyShareLink(role, tailnet) }]
      : []),
    link.on
      ? { key: 'off', label: t('turnOffLink'), sub: t('turnOffNote'), run: () => void refreshShare({ links: { [role]: false } }) }
      : { key: 'on', label: t('turnOnLink'), run: () => void refreshShare({ links: { [role]: true } }) },
    {
      key: 'reset',
      label: t('resetLink'),
      sub: t('resetNote'),
      danger: true,
      run: () =>
        layers.ask({
          title: t('resetTitle', { role: t(LINK_TITLE[role]) }),
          body: t('resetBody'),
          ok: t('resetLink'),
          run: () => void refreshShare({ reset: [role] }),
        }),
    },
  ];
  return (
    <div className={ROW} title={link.on ? link.url : undefined} data-share-link={role}>
      <Circle dim={!link.on}>{ROLE_ICON[role]}</Circle>
      <div className={cn('min-w-0 flex-1', !link.on && 'opacity-50')}>
        <div className="truncate">{t(LINK_TITLE[role])}</div>
        <div className="truncate text-xs text-fg-muted">{link.on ? t(ROLE_NOTE[role]) : t('linkOff')}</div>
      </div>
      {link.on ? (
        <CopyButton which={role} url={link.url ?? ''} />
      ) : (
        <Button size="lg" variant="ghost" className={PILL} onClick={() => void refreshShare({ links: { [role]: true } })}>
          {t('turnOn')}
        </Button>
      )}
      <PanelMenu
        items={items}
        trigger={<IconButton label={t('moreFor', { role: t(LINK_TITLE[role]) })} title={t('more')} noTooltip size="lg" icon={<MoreHorizontal className="size-4" />} />}
      />
    </div>
  );
}

function ShareTab() {
  const boot = useBoot();
  const { view, unsupported } = useShell((state) => state.share);
  if (!view) {
    return (
      <>
        <Label>{t('peopleWithAccess')}</Label>
        <OwnerRow />
        {unsupported ? (
          <>
            <Label>{t('generalAccess')}</Label>
            <div className={ROW}>
              <Circle>
                <Lock className="size-4" />
              </Circle>
              <div className="min-w-0 flex-1">
                <div>{t('onlyThisComputer')}</div>
                <div className="text-xs text-fg-muted">{t('cannotShare', { type: boot.typeTitle })}</div>
              </div>
              <CopyButton which="page" url={shellLink()} />
            </div>
          </>
        ) : (
          <div className="py-2 text-xs text-fg-muted">{t('loading')}</div>
        )}
      </>
    );
  }
  const guests = sortedGuests(view);
  return (
    <>
      <Label>{t('peopleWithAccess')}</Label>
      <OwnerRow />
      <Label>{t('joinedPeople')}</Label>
      {guests.length ? guests.map((guest) => <GuestRow key={guest.id} guest={guest} view={view} />) : <div className="pb-0.5 pt-1.5 text-xs text-fg-muted">{t('noneJoined')}</div>}
      <Label>{t('generalAccess')}</Label>
      <GeneralAccess view={view} />
      <Label>{t('inviteLinks')}</Label>
      {ROLES.map((role) => (
        <LinkRow key={role} role={role} view={view} />
      ))}
      {view.lan ? (
        <p data-share-security="" className="mb-0 mt-1.5 text-xs text-fg-muted">
          {t('plainHttp')}
        </p>
      ) : null}
    </>
  );
}

// ---- the Export tab ------------------------------------------------------------------------------------------------

/** One export row: its tile, name and note, and a download arrow or, when it asks first, a chevron. */
function ExportRow({
  kind,
  label,
  description,
  disabled,
  reason,
  more,
  onPick,
}: {
  kind: FormatKind;
  label: string;
  description?: string | undefined;
  disabled?: boolean | undefined;
  reason?: string | undefined;
  more?: boolean | undefined;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? reason : undefined}
      data-export-row={label}
      className="flex w-full items-center gap-3 rounded-[10px] px-2 py-1.5 text-left outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-45 disabled:hover:bg-transparent"
      onClick={() => {
        useShell.getState().closeShare();
        onPick();
      }}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line">{FORMAT_ICON[kind]}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        {description ? <span className="text-xs text-fg-muted">{description}</span> : null}
      </span>
      {more ? <ChevronRight className="size-4 shrink-0 text-fg-muted" /> : <Download className="size-[18px] shrink-0 text-fg-muted" />}
    </button>
  );
}

/** The page's rows, then the folder's zip. */
function ExportRows() {
  const report = useShell((state) => state.report);
  const exports = useShell((state) => state.share.exports);
  const agent = useAgentName();
  const entries = exportEntries(report);
  const v1 = !entries.length && !!report.exports;
  return (
    <div className="-mx-2 mt-2.5">
      {report.hasContent === false ? <div className="px-2 py-2 text-xs text-fg-muted">{t('nothingToExport')}</div> : null}
      {entries.map((entry) => (
        <ExportRow
          key={entry.key}
          kind={formatKind(entry.kind)}
          label={entry.label}
          description={entry.description ?? (entry.interactive ? t('exportOptions') : undefined)}
          disabled={entry.disabled}
          reason={entry.disabledReason ?? whyText(entry.why, agent)}
          more={entry.more}
          onPick={() => exportFormat(entry)}
        />
      ))}
      {v1 && exports === null ? <div className="px-2 py-2 text-xs text-fg-muted">{t('loading')}</div> : null}
      {v1
        ? (exports ?? []).map((item) => (
            <ExportRow
              key={item.label}
              kind={formatKind(item.label)}
              label={item.label}
              description={item.description}
              disabled={item.disabled}
              reason={item.disabledReason}
              more={item.more}
              onPick={() => command({ cmd: 'export', label: item.label })}
            />
          ))
        : null}
      {offersArchive(report) ? (
        <ExportRow kind="folder" label={t('archiveLabel')} description={t('archiveDescription')} onPick={() => void downloadArchive()} />
      ) : null}
    </div>
  );
}

/** The page's warning about sharing it (`shareNotice`). */
function ShareNotice() {
  const notice = useShell((state) => state.report.shareNotice);
  if (!notice) return null;
  return (
    <div role="note" className="mt-3 flex gap-2.5 rounded-lg border border-line bg-surface-2 p-3 text-xs">
      <TriangleAlert className="mt-px size-3.5 shrink-0 text-danger" />
      <p className="m-0 whitespace-pre-wrap break-words">{notice.text}</p>
    </div>
  );
}

function ExportTab() {
  const { view, unsupported } = useShell((state) => state.share);
  const store = useShell.getState();
  const role = view ? leastRole(view) : null;
  const note = view
    ? !role
      ? t('allLinksOff')
      : view.lan
        ? t('joinsAs', { role: t(ROLE_NAME[role]).toLowerCase() })
        : t('whereOff')
    : unsupported
      ? t('onlyHereLink')
      : '';
  return (
    <>
      <div className="mt-3.5 flex gap-3 rounded-[14px] bg-surface-2 p-4">
        <Users className="mt-0.5 size-4 shrink-0 text-fg-muted" />
        <div className="min-w-0">
          <h3 className="m-0 text-sm font-semibold">{t('sendingTitle')}</h3>
          <p className="mb-3 mt-1 text-fg-muted">{t('sendingBody')}</p>
          <div className="flex flex-wrap gap-2">
            {view ? (
              <Button size="lg" variant="primary" icon={<Users className="size-3.5" />} onClick={() => store.setShareTab('share')}>
                {t('invitePeople')}
              </Button>
            ) : null}
            {view && role ? <CopyButton which={role} url={view.links[role]?.url ?? ''} /> : null}
            {!view ? <CopyButton which="page" url={shellLink()} /> : null}
          </div>
          {note ? <p className="mb-0 mt-2.5 text-xs text-fg-muted">{note}</p> : null}
        </div>
      </div>
      <ExportRows />
    </>
  );
}

/** Loads a v1 page's export items into the panel. */
async function loadExports(): Promise<void> {
  const items = await requestExports();
  if (useShell.getState().shareOpen) useShell.getState().patchShare({ exports: items });
}

// ---- the button and the popover ------------------------------------------------------------------------------------

/** The Share panel's popover and its button: the share icon, "Share", and a green dot while it is shared on the network. */
export function SharePanel() {
  const title = useTitle();
  const open = useShell((state) => state.shareOpen);
  const tab = useShell((state) => state.shareTab);
  const error = useShell((state) => state.share.error);
  const unsupported = useShell((state) => state.share.unsupported);
  const view = useShell((state) => state.share.view);
  const artifact = useShell((state) => state.artifact);
  const report = useShell((state) => state.report);
  const store = useShell.getState();
  const shared = isShared(view, report, artifact);
  const [asking, setAsking] = useState<AskSpec | null>(null);
  const menus = useRef(new Set<string>());
  const menuEscapedAt = useRef(0);
  const askingRef = useRef<AskSpec | null>(null);
  askingRef.current = asking;

  const layers = useRef<Layers>({
    menu(id, isOpen, reason) {
      if (isOpen) menus.current.add(id);
      else menus.current.delete(id);
      if (!isOpen && reason === 'escape-key') menuEscapedAt.current = performance.now();
    },
    ask: (spec) => setAsking(spec),
  }).current;

  // While open: load, then poll every 4 s (guests come and go), unless the type cannot share.
  useEffect(() => {
    if (!open) {
      setAsking(null);
      return;
    }
    void refreshShare();
    if (unsupported) return;
    const timer = setInterval(() => void refreshShare(), 4000);
    return () => clearInterval(timer);
  }, [open, unsupported]);

  // A v1 page's downloads, once it reports it has some (a page with `formats` lists them in its report).
  const v1Exports = !!report.exports && !report.formats?.length;
  useEffect(() => {
    if (open && v1Exports) void loadExports();
  }, [open, v1Exports]);
  const exportTab = hasExportTab(report);

  const onOpenChange = (next: boolean, details: BasePopover.Root.ChangeEventDetails): void => {
    if (next) return store.openShare('share');
    switch (details.reason) {
      case 'escape-key':
        // The top layer first: the confirm box, then a menu (which closes itself), then the panel.
        if (askingRef.current) return setAsking(null);
        if (menus.current.size || performance.now() - menuEscapedAt.current < 250) return;
        break;
      case 'outside-press': {
        const target = details.event.target;
        if (target instanceof Element && target.closest('[data-share-menu]')) return;
        break;
      }
      case 'focus-out':
        // Focus moves into the panel's menus (outside the popup); a press elsewhere closes it.
        return;
      default:
        break;
    }
    store.closeShare();
  };

  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Trigger
        render={
          <Button
            size="lg"
            variant="ghost"
            title={shared ? `${t('share')} · ${t('sharedOnNetwork')}` : t('share')}
            aria-label={t('share')}
            className="gap-1.5 px-2 font-normal data-[popup-open]:bg-hover"
            icon={<Share2 className="size-4" />}
          >
            <span className="max-sm:hidden">{t('share')}</span>
            {shared ? <span aria-hidden data-share-dot="" className="size-1.5 shrink-0 rounded-full bg-success max-sm:absolute max-sm:right-1 max-sm:top-1" /> : null}
          </Button>
        }
      />
      <BasePopover.Portal>
        <BasePopover.Positioner side="bottom" align="end" sideOffset={10} collisionPadding={12} className="z-[1000]">
          <BasePopover.Popup
            aria-label={t('shareTitle')}
            className="relative flex max-h-[min(var(--available-height),calc(100vh-24px))] w-[min(460px,calc(100vw-24px))] origin-[var(--transform-origin)] flex-col rounded-2xl bg-surface text-[13px] text-fg shadow-popup outline-none transition-[opacity,transform] duration-100 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
          >
            <BasePopover.Arrow className="size-3.5 rotate-45 rounded-tl-[3px] border-l border-t border-line bg-surface data-[side=bottom]:-top-[7px]" />
            <LayersContext.Provider value={layers}>
              <div className="min-h-0 overflow-auto overscroll-contain px-5 pb-5 pt-[18px]">
                <div className="mb-1.5 flex items-center gap-3">
                  <h2 className="m-0 min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em]">{title || t('shareTitle')}</h2>
                  <IconButton label={t('close')} icon={<X className="size-[18px]" />} size="lg" noTooltip onClick={() => store.closeShare()} />
                </div>
                {exportTab ? (
                  <Segmented
                    aria-label={t('share')}
                    className="mt-2.5 h-8"
                    value={tab}
                    onChange={(next) => store.setShareTab(next)}
                    options={[
                      { value: 'share', label: t('share') },
                      { value: 'export', label: t('export') },
                    ]}
                  />
                ) : null}
                <ShareNotice />
                {tab === 'export' && exportTab ? <ExportTab /> : <ShareTab />}
                {error ? (
                  <div role="alert" className="mt-3 text-xs text-danger">
                    {error}
                  </div>
                ) : null}
              </div>
              {asking ? (
                <Confirm
                  spec={asking}
                  onDone={(yes) => {
                    setAsking(null);
                    if (yes) asking.run();
                  }}
                />
              ) : null}
            </LayersContext.Provider>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
