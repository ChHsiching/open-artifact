/**
 * Read aloud: a Listen button over the page's `[data-read]` region reads its text in the browser's voice, with a
 * player (play/pause, previous/next part, speed, close), a highlight on the part being read, and the
 * `[data-read-step]` / `[data-read-play]` / `[data-read-stage]` hooks of scroll stories. A piece that plays by itself
 * keeps its own controls: `[data-read-sound]` (the speaker: starts the voice at the step with `aria-current="true"`,
 * or ends it; carries `aria-pressed`), `[data-read-pause]` and `[data-read-move]`; the dashboard then draws no button
 * and no player. With no voice, nothing renders, `#dash-root` is marked `data-dash-read="unavailable"`, the page's
 * play / sound controls stay hidden (the speaker with `aria-pressed="false"`), and pause / move presses are left to
 * the page.
 */

import type { DashboardFile } from '@open-artifact/data-core';
import { announce } from '@open-artifact/editor-kit';
import { Button, IconButton, Menu, MenuCheckboxItem, Tooltip, toast } from '@open-artifact/ui';
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore, type ReactElement, type Ref } from 'react';
import { getScrollContainer } from '../edit/pieces.ts';
import {
  DASH_READ_ATTRIBUTE,
  DASH_READ_NOW_ATTRIBUTE,
  DASH_READ_PHASE_ATTRIBUTE,
  PAUSE_CONTROL_SELECTOR,
  READ_CONTROL_SELECTOR,
  READ_MOVE_ATTRIBUTE,
  READ_PAUSE_ATTRIBUTE,
  READ_PLAY_ATTRIBUTE,
  READ_PLAYING_CLASS,
  READ_SOUND_ATTRIBUTE,
  READ_STAGE_ATTRIBUTE,
  READ_START_CONTROL_SELECTOR,
  READ_STEP_ATTRIBUTE,
  findReadRoot,
  fitReadLines,
  getReadBlocks,
  hasLoadingSource,
  hasPlayOrSoundControl,
  type ReadBlock,
} from './blocks.ts';
import { RESTING_READER_STATE, createPageReader, type PageReader, type ReadVoice, type ReaderState } from './reader.ts';
import { dropSpeech, hasSpeechVoice, openSpeechVoice, useSpeechVoices, watchSpeechVoices } from './speech.ts';

export const LISTEN_LABEL = 'Listen';
export const READ_UNAVAILABLE_MESSAGE = 'Reading aloud isn’t available here.';
const FINISHED_MESSAGE = 'Finished reading.';
const PLACE_IN_READING_LABEL = 'Place in the reading';
export const READ_RATES = [0.8, 1, 1.2, 1.5];

const decimal = new Intl.NumberFormat();
export const formatReadRate = (rate: number): string => `${decimal.format(rate)}×`;
const formatReadPart = (nth: number): string => `Part ${decimal.format(nth)}`;
const formatReadPartOf = (nth: number, count: number): string => `Part ${decimal.format(nth)} of ${decimal.format(count)}`;

const READ_HIGHLIGHT_NAME = 'dash-listen';
const READ_HIGHLIGHT_CSS = `::highlight(${READ_HIGHLIGHT_NAME}) { background-color: rgb(217 119 87 / 0.18); }`;
const READ_SCROLL_TOP_GAP = 64;
const READ_SCROLL_BOTTOM_GAP = 160;
const READ_STAGE_SCROLL_GAP = 12;
const READ_AIR_GAP_PX = 12;
const READ_START_TIMEOUT_MS = 4000;
const READ_STAMP_ROUNDS = 20;
const READ_STAMP_WINDOW_MS = 200;
const PLAYER_MARK_SIZES = { fine: 24, coarse: 40 } as const;

/** The box over the region and the player's look. `#dash-root`'s own tokens don't reach it (it sits beside the root). */
const READ_ALOUD_CSS = `
.dash-listen{z-index:2;box-sizing:border-box;block-size:44px;margin-block:var(--dash-listen-top,0px) calc(-44px - var(--dash-listen-top,0px));pointer-events:none;padding-block-start:12px;position:relative}
.dash-listen[data-open]{position:sticky;top:-12px}
:root{--dash-listen-air:28px}
.dash-listen[data-air=true]{block-size:calc(44px + var(--dash-listen-air));margin-block-end:calc(-44px - var(--dash-listen-air) - var(--dash-listen-top,0px))}
.dash-listen[data-room]~#dash-root [data-read]{margin-block-start:44px}
.dash-listen[data-room][data-air=true]~#dash-root [data-read]{margin-block-start:calc(44px + var(--dash-listen-air))}
.dash-listen-region{box-sizing:border-box;max-inline-size:100%;margin-left:var(--dash-listen-left,0);inline-size:var(--dash-listen-width,100%);align-items:flex-start;display:flex}
.dash-listen-region>*{pointer-events:auto}
.dash-listen[data-open] .dash-listen-region{background:var(--color-canvas)}
.dash-listen-player{flex:auto;min-inline-size:0}
.dash-listen-note{flex:1 1 0;min-inline-size:0;margin:0;padding-inline:8px}
.dash-listen-places{forced-color-adjust:none;flex:1 1 0;align-self:stretch;min-inline-size:0;padding-inline:6px;display:flex;overflow:hidden}
.dash-listen-mark{flex:1 1 0;min-inline-size:0;position:relative;border:0;background:transparent;padding:0;cursor:pointer;border-radius:4px}
.dash-listen-mark:hover{background:var(--color-hover)}
.dash-listen-bar{background:var(--color-line-strong,var(--color-line));border-radius:999px;flex:1 1 0;align-self:center;block-size:3px}
.dash-listen-mark .dash-listen-bar{position:absolute;inset-block-start:calc(50% - 1.5px);inset-inline:2px}
.dash-listen-places>.dash-listen-bar{margin-inline:2px}
.dash-listen-bar[data-place=read]{background:var(--color-fg-muted)}
.dash-listen-bar[data-place=now]{background:var(--color-fg)}
.dash-listen[data-under]{block-size:var(--dash-listen-page,0px);margin-block:0 calc(-1 * var(--dash-listen-page,0px));padding-block-start:0;position:relative;top:0}
.dash-listen[data-under]:before{block-size:calc(var(--dash-listen-top,0px) + 16px);content:"";display:block}
.dash-listen[data-under][data-open] .dash-listen-region{background:0 0;position:sticky;inset-block:0 12px}
.dash-listen[data-room-under]~#dash-root [data-read]{margin-block-end:48px}
@media (pointer:coarse){
.dash-listen{block-size:64px;margin-block:var(--dash-listen-top,0px) calc(-64px - var(--dash-listen-top,0px))}
.dash-listen[data-air=true]{block-size:calc(64px + var(--dash-listen-air));margin-block-end:calc(-64px - var(--dash-listen-air) - var(--dash-listen-top,0px))}
.dash-listen[data-room]~#dash-root [data-read]{margin-block-start:64px}
.dash-listen[data-room][data-air=true]~#dash-root [data-read]{margin-block-start:calc(64px + var(--dash-listen-air))}
.dash-listen[data-room-under]~#dash-root [data-read]{margin-block-end:68px}
}
@media print{.dash-listen{display:none!important}}
`;

const subscribeNoReader = (): (() => void) => () => undefined;
const getRestingReaderState = (): ReaderState => RESTING_READER_STATE;
const preventReadMarkFocus = (event: { preventDefault(): void }): void => event.preventDefault();

const COARSE_POINTER_QUERY = '(pointer: coarse)';
function subscribeCoarsePointer(listener: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined;
  const query = matchMedia(COARSE_POINTER_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
const isCoarsePointer = (): boolean => typeof matchMedia === 'function' && matchMedia(COARSE_POINTER_QUERY).matches;
const useCoarsePointer = (): boolean => useSyncExternalStore(subscribeCoarsePointer, isCoarsePointer, () => false);

const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollerOf = (element: Element): Element | null => getScrollContainer(element) ?? element.ownerDocument.scrollingElement;

/** The browser's voice, once it lists one; dropping it turns read aloud off. */
function useSpeech(wanted: boolean): [ReadVoice | null, () => void] {
  const available = useSpeechVoices(hasSpeechVoice);
  const [voice, setVoice] = useState<ReadVoice | null>(null);
  useEffect(() => {
    if (wanted) watchSpeechVoices();
  }, [wanted]);
  useEffect(() => {
    if (!wanted || !available) return;
    const opened = openSpeechVoice();
    setVoice(opened);
    return () => {
      opened?.dispose();
      setVoice(null);
    };
  }, [wanted, available]);
  return [voice, dropSpeech];
}

/** How far below the element's top its first line of text starts (0 when it has no visible text). */
function measureFirstTextLineOffset(element: Element): number {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = element.ownerDocument.createRange();
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.height > 0 && node.nodeValue?.trim() !== '') return rect.top - element.getBoundingClientRect().top;
  }
  return 0;
}

function createReadRange({ first, last }: Pick<ReadBlock, 'first' | 'last'>): Range {
  const range = new Range();
  range.setStartBefore(first);
  range.setEndAfter(last);
  return range;
}

let readHighlightSheet: CSSStyleSheet | undefined;

function highlightReadBlock(block: ReadBlock | undefined): void {
  if (typeof Highlight !== 'function' || typeof CSS === 'undefined' || CSS.highlights === undefined) return;
  if (block?.first.isConnected !== true || !block.last.isConnected) {
    CSS.highlights.delete(READ_HIGHLIGHT_NAME);
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== readHighlightSheet);
    return;
  }
  if (readHighlightSheet === undefined) {
    readHighlightSheet = new CSSStyleSheet();
    readHighlightSheet.replaceSync(READ_HIGHLIGHT_CSS);
  }
  if (!document.adoptedStyleSheets.includes(readHighlightSheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, readHighlightSheet];
  CSS.highlights.set(READ_HIGHLIGHT_NAME, new Highlight(createReadRange(block)));
}

function scrollToReadBlock(block: ReadBlock, root: Element): void {
  const scroller = scrollerOf(root);
  if (scroller === null || !block.first.isConnected || !block.last.isConnected) return;
  const rect = createReadRange(block).getBoundingClientRect();
  const view = scroller === root.ownerDocument.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
  const top = view.top + READ_SCROLL_TOP_GAP;
  const bottom = view.bottom - READ_SCROLL_BOTTOM_GAP;
  if (block.step === undefined && rect.top >= top && rect.bottom <= bottom) return;
  const target = block.step !== undefined ? Math.min((view.top + view.bottom - rect.height) / 2, bottom - rect.height) : (top + bottom - rect.height) / 2;
  scroller.scrollTo({ top: scroller.scrollTop + rect.top - Math.max(top, target), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

function scrollReadStageIntoView(stage: Element, region: Element, root: Element): void {
  const scroller = scrollerOf(root);
  if (scroller === null) return;
  const stageRect = stage.getBoundingClientRect();
  const regionRect = region.getBoundingClientRect();
  const view = scroller === root.ownerDocument.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
  const regionEnd = regionRect.bottom + (parseFloat(getComputedStyle(region).marginBottom) || 0);
  const end = Math.max(stageRect.bottom, regionEnd);
  const top = view.top + READ_STAGE_SCROLL_GAP;
  const bottom = view.bottom - READ_STAGE_SCROLL_GAP - (parseFloat(getComputedStyle(scroller).paddingBlockEnd) || 0);
  const fits = (edge: number): boolean => edge - stageRect.top <= bottom - top;
  const by = fits(end) ? (end > bottom ? end - bottom : Math.min(0, stageRect.top - top)) : fits(regionEnd) ? stageRect.top - top : end - bottom;
  if (by !== 0) scroller.scrollTo({ top: scroller.scrollTop + by, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

/** Clicks a control on the page while comment mode lets clicks through (`data-comment-pass` on `root` meanwhile). */
function clickPastComments(root: Element, target: HTMLElement | null | undefined): void {
  root.setAttribute('data-comment-pass', '');
  target?.click();
  root.removeAttribute('data-comment-pass');
}

interface ReadAloudPlayerProps {
  s: ReaderState;
  reader: PageReader;
  toggle: Ref<HTMLButtonElement>;
  onClose(): void;
}

function ReadAloudPlayer({ s, reader, toggle, onClose }: ReadAloudPlayerProps): ReactElement {
  const playing = s.phase === 'starting' || s.phase === 'speaking';
  const placesRef = useRef<HTMLDivElement | null>(null);
  const [crowded, setCrowded] = useState(false);
  const hasNote = s.note !== undefined;
  const markSize = PLAYER_MARK_SIZES[useCoarsePointer() ? 'coarse' : 'fine'];
  // With no room for a button per part the marks are plain bars; otherwise each is a button that plays from that part.
  useLayoutEffect(() => {
    const places = placesRef.current;
    if (places === null || typeof ResizeObserver === 'undefined') return;
    const style = getComputedStyle(places);
    const measure = (): void =>
      setCrowded(places.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) < s.count * markSize);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(places);
    return () => observer.disconnect();
  }, [s.count, hasNote, markSize]);
  return (
    <div
      role="toolbar"
      aria-label={LISTEN_LABEL}
      className="dash-listen-player flex items-center gap-1 rounded-lg border border-line bg-surface p-1 text-fg shadow-popup"
    >
      <IconButton ref={toggle} label={playing ? 'Pause' : 'Play'} icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={playing ? reader.pause : reader.play} />
      <IconButton label="Previous part" icon={<ChevronLeft className="size-4" />} onClick={() => reader.step(-1)} />
      <IconButton label="Next part" icon={<ChevronRight className="size-4" />} onClick={() => reader.step(1)} />
      {s.note !== undefined ? (
        <p className="dash-listen-note text-xs text-fg-muted">{s.note}</p>
      ) : (
        <div
          ref={placesRef}
          className="dash-listen-places"
          role="progressbar"
          aria-label={PLACE_IN_READING_LABEL}
          aria-valuemin={1}
          aria-valuemax={s.count}
          aria-valuenow={s.at + 1}
          aria-valuetext={formatReadPartOf(s.at + 1, s.count)}
        >
          {Array.from({ length: s.count }, (_, index) => {
            const place = index < s.at || (index === s.at && s.phase === 'ended') ? 'read' : index === s.at ? 'now' : undefined;
            if (crowded) return <span key={index} className="dash-listen-bar" data-place={place} />;
            return (
              <Tooltip key={index} side="top" label={formatReadPartOf(index + 1, s.count)}>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={formatReadPart(index + 1)}
                  className="dash-listen-mark"
                  onMouseDown={preventReadMarkFocus}
                  onClick={() => reader.from(() => index)}
                >
                  <span className="dash-listen-bar" data-place={place} />
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}
      <Menu
        side="top"
        align="end"
        trigger={
          <Button variant="ghost" aria-label={`Speed, ${formatReadRate(s.rate)}`} className="tabular-nums">
            <span className="relative">
              <span className="invisible">{formatReadRate(1.5)}</span>
              <span className="absolute inset-0 text-center">{formatReadRate(s.rate)}</span>
            </span>
          </Button>
        }
      >
        {READ_RATES.map((rate) => (
          <MenuCheckboxItem key={rate} checked={rate === s.rate} closeOnClick onCheckedChange={() => reader.rate(rate)}>
            {formatReadRate(rate)}
          </MenuCheckboxItem>
        ))}
      </Menu>
      <IconButton label="Close" icon={<X className="size-4" />} onClick={onClose} />
    </div>
  );
}

export interface ReadAloudControlsProps {
  /** `#dash-root`; render these controls as its previous sibling. */
  root: HTMLElement;
  /** The page's files (a new set re-checks what there is to read). */
  files: readonly DashboardFile[];
  /** The page's `dash/meta.lang`: text with no `lang` of its own is read in it. */
  language?: string | null;
  /** Comments or an editor is open: nothing is read and what plays is paused. */
  off: boolean;
  /** The edit tool is on: a page without its own pause / move controls is not read. */
  editing?: boolean;
  /** The eyedropper tool is on (choosing a mark). */
  choosing?: boolean;
  /** The mark chosen (the reading pauses when it changes while choosing). */
  picked?: number | null;
}

/** The Listen button and player over the page's `[data-read]` region, and the page's own read controls. */
export function ReadAloudControls({ root, files, language, off, editing = false, choosing = false, picked = null }: ReadAloudControlsProps): ReactElement | null {
  const region = findReadRoot(root);
  const settled = region !== null && !hasLoadingSource(region);
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    if (region === null || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(rerender);
    observer.observe(region, { subtree: true, attributeFilter: ['data-dash-source-state'] });
    return () => observer.disconnect();
  }, [region]);
  const [voice, dropVoice] = useSpeech(region !== null);
  const gone = useCallback(() => {
    announce(READ_UNAVAILABLE_MESSAGE);
    dropVoice();
  }, [dropVoice]);
  const blocksRef = useRef<ReadBlock[]>([]);
  const languageRef = useRef(language);
  languageRef.current = language;
  const [reader, setReader] = useState<PageReader | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (voice === null) return;
    const next = createPageReader({
      voice,
      gone,
      finished: () => announce(FINISHED_MESSAGE),
      fits: fitReadLines,
      blocks: () => (blocksRef.current = getReadBlocks(findReadRoot(root) ?? root.ownerDocument.createElement('div'), root, languageRef.current)),
    });
    setReader(next);
    return () => {
      next.dispose();
      setReader(null);
    };
  }, [voice, gone, root]);
  const s = useSyncExternalStore(reader?.subscribe ?? subscribeNoReader, reader?.state ?? getRestingReaderState);
  // A page with a play or sound control reads from one part; any other needs two.
  const [hasBlocks, setHasBlocks] = useState(false);
  const minParts = hasPlayOrSoundControl(root) ? 1 : 2;
  useEffect(() => {
    setHasBlocks(settled && region !== null && reader !== null && getReadBlocks(region, root).length >= minParts);
  }, [settled, region, root, reader, files, minParts]);
  // A page with its own speaker (`[data-read-sound]`) ends the voice when the reader stops short: only an `ended`
  // that read everything stays open. With its own pause / move controls it keeps the voice even while the edit tool
  // is on, but not while a mark is being chosen; a page without them is not read while it is edited or chosen from.
  const ready = reader !== null && settled && hasBlocks;
  const hasSoundControl = root.querySelector(`[${READ_SOUND_ATTRIBUTE}]`) !== null;
  const hasPageControls = hasSoundControl && root.querySelector(`[${READ_PAUSE_ATTRIBUTE}], [${READ_MOVE_ATTRIBUTE}]`) !== null;
  const on = ready && !off && (!choosing || hasPageControls);
  const armed = on || (ready && hasPageControls && !editing);
  const endedEarly = hasSoundControl && s.phase === 'ended' && s.through !== true;
  const reading = armed && s.phase !== 'rest' && !endedEarly;
  const stageCandidate = region?.closest(`[${READ_STAGE_ATTRIBUTE}]`) ?? null;
  const stage = stageCandidate !== null && root.contains(stageCandidate) ? stageCandidate : null;
  const readerRef = useRef(reader);
  useLayoutEffect(() => void (readerRef.current = reader));
  // Pauses what plays: the reader's voice, else the page's own piece (its pause button).
  const pausePlaying = useCallback(() => {
    const phase = readerRef.current?.state().phase;
    if (phase === 'starting' || phase === 'speaking') readerRef.current?.pause();
    else clickPastComments(root, root.querySelector(`.${READ_PLAYING_CLASS}`)?.querySelector<HTMLElement>(PAUSE_CONTROL_SELECTOR));
  }, [root]);
  const endedHeldRef = useRef(false);
  const playedRef = useRef(false);
  // While a piece on a stage is edited by hand its reading is told `ended` for one microtask.
  const signalEnded = useCallback(() => {
    endedHeldRef.current = true;
    root.setAttribute(DASH_READ_PHASE_ATTRIBUTE, 'ended');
    queueMicrotask(() => {
      endedHeldRef.current = false;
      root.removeAttribute(DASH_READ_PHASE_ATTRIBUTE);
    });
  }, [root]);
  const editingStage = editing && stage !== null;
  useLayoutEffect(() => {
    if (editingStage && playedRef.current) signalEnded();
  }, [editingStage, signalEnded]);
  const [pagePlaying, setPagePlaying] = useState(false);
  const watchPlaying = stage !== null || hasPageControls || root.querySelector(PAUSE_CONTROL_SELECTOR) !== null;
  useEffect(() => {
    if (!watchPlaying || typeof MutationObserver === 'undefined') return;
    const check = (): void => {
      const playing = root.querySelector(`.${READ_PLAYING_CLASS}`) !== null;
      playedRef.current ||= playing;
      setPagePlaying(playing);
      if (playing && editingStage) signalEnded();
    };
    const observer = new MutationObserver(check);
    observer.observe(root, { subtree: true, attributeFilter: ['class'] });
    check();
    return () => observer.disconnect();
  }, [root, watchPlaying, editingStage, signalEnded]);
  const [speakerOff, setSpeakerOff] = useState(false);
  const speakerPressed = reading || (hasPageControls && !speakerOff && !pagePlaying);
  const [wasReading, setWasReading] = useState(false);
  if (reading !== wasReading) {
    setWasReading(reading);
    if (!reading && armed && (pagePlaying || s.note !== undefined)) setSpeakerOff(true);
  }
  useEffect(() => {
    if (!armed || endedEarly) reader?.close();
  }, [armed, endedEarly, reader]);
  // A reading that never gets going (the page's own speaker waits on the voice) is given up after a few seconds.
  useEffect(() => {
    if (!hasPageControls || reader === null || s.phase !== 'starting') return;
    const timer = setTimeout(() => void (reader.state().phase === 'starting' && reader.close()), READ_START_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hasPageControls, reader, s.phase, s.at]);
  useEffect(() => {
    if (off && (pagePlaying || s.phase === 'starting' || s.phase === 'speaking')) pausePlaying();
  }, [off, pagePlaying, s.phase, pausePlaying]);
  useEffect(() => {
    if (choosing) pausePlaying();
  }, [choosing, picked, pausePlaying]);
  const hasPlayControl = root.querySelector(`[${READ_PLAY_ATTRIBUTE}]`) !== null;
  const readState = !on ? 'unavailable' : reading ? 'reading' : 'ready';
  const phase = !reading ? null : s.phase === 'speaking' ? 'playing' : s.phase;
  const nowStep = reading ? (blocksRef.current.slice(0, s.at + 1).findLast((block) => block.step !== undefined)?.step ?? null) : null;
  const stamps = useRef({ rounds: 0, at: -Infinity });
  const nowStepRef = useRef<Element | null>(null);
  // A page that redraws its steps while it plays: the stamp goes to the step's new element, and after 20 such rounds
  // in a row (each within 200 ms of the last) no more stamps are written.
  const currentStep =
    nowStep === null || nowStep.isConnected || nowStep.id === ''
      ? nowStep
      : ([...root.querySelectorAll(`[${READ_STEP_ATTRIBUTE}]`)].find((step) => step.id === nowStep.id) ?? nowStep);
  const redrawn = currentStep !== nowStep && performance.now() - stamps.current.at < READ_STAMP_WINDOW_MS;
  const stampStep = redrawn && stamps.current.rounds >= READ_STAMP_ROUNDS ? nowStepRef.current : currentStep;
  useEffect(() => {
    if (!reading || region === null || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(rerender);
    observer.observe(region, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, [reading, region]);
  useLayoutEffect(() => {
    if (root.getAttribute(DASH_READ_ATTRIBUTE) !== readState) root.setAttribute(DASH_READ_ATTRIBUTE, readState);
    if (phase !== null) {
      if (root.getAttribute(DASH_READ_PHASE_ATTRIBUTE) !== phase) root.setAttribute(DASH_READ_PHASE_ATTRIBUTE, phase);
    } else if (!endedHeldRef.current) root.removeAttribute(DASH_READ_PHASE_ATTRIBUTE);
    if (nowStepRef.current !== stampStep) {
      nowStepRef.current?.removeAttribute(DASH_READ_NOW_ATTRIBUTE);
      stampStep?.setAttribute(DASH_READ_NOW_ATTRIBUTE, '');
      nowStepRef.current = stampStep;
      if (stampStep !== nowStep) stamps.current = { rounds: redrawn ? stamps.current.rounds + 1 : 1, at: performance.now() };
    }
    for (const control of root.querySelectorAll<HTMLElement>(READ_START_CONTROL_SELECTOR)) if (control.hidden === on) control.hidden = !on;
    for (const sound of root.querySelectorAll(`[${READ_SOUND_ATTRIBUTE}]`))
      if (sound.getAttribute('aria-pressed') !== String(speakerPressed)) sound.setAttribute('aria-pressed', String(speakerPressed));
  });
  useLayoutEffect(
    () => () => {
      root.removeAttribute(DASH_READ_ATTRIBUTE);
      root.removeAttribute(DASH_READ_PHASE_ATTRIBUTE);
      nowStepRef.current?.removeAttribute(DASH_READ_NOW_ATTRIBUTE);
      nowStepRef.current = null;
    },
    [root],
  );
  const pressedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!on || reader === null) return;
    // Whether no piece is playing as the press began (a capturing listener sees it before the page's own handlers).
    let atRest = true;
    const track = (): void => void (atRest = root.querySelector(`.${READ_PLAYING_CLASS}`) === null);
    const onPress = (event: Event): void => {
      const control = event.target instanceof Element ? event.target.closest<HTMLElement>(READ_CONTROL_SELECTOR) : null;
      if (
        control === null ||
        (event instanceof KeyboardEvent &&
          ((event.key !== 'Enter' && event.key !== ' ') || control.localName === 'button' || !control.matches(READ_START_CONTROL_SELECTOR)))
      )
        return;
      const phase = reader.state().phase;
      // Pause and move belong to the page until the voice has started, except on a page that plays by itself and
      // whose speaker is on: its first press brings the voice.
      if (phase === 'rest' && !(hasPageControls && atRest && !speakerOff) && !control.matches(READ_START_CONTROL_SELECTOR)) return;
      event.preventDefault();
      const current = (): number => blocksRef.current.findIndex((block) => block.step?.getAttribute('aria-current') === 'true');
      if (control.hasAttribute(READ_SOUND_ATTRIBUTE)) {
        setSpeakerOff(phase !== 'rest' || (hasPageControls && atRest && !speakerOff));
        if (phase !== 'rest') reader.close();
        else if (!(hasPageControls && atRest)) reader.from(current);
        return;
      }
      if (control.hasAttribute(READ_MOVE_ATTRIBUTE)) return reader.from(current, true);
      if (control.hasAttribute(READ_PAUSE_ATTRIBUTE)) {
        if (phase === 'rest') reader.from(current);
        else if (phase === 'starting' || phase === 'speaking') reader.pause();
        else reader.play();
        return;
      }
      pressedRef.current = control;
      const id = control.getAttribute(READ_PLAY_ATTRIBUTE);
      reader.from(() => (id === '' ? -1 : blocksRef.current.findIndex((block) => block.step?.id === id)));
    };
    for (const type of ['click', 'keydown']) {
      root.addEventListener(type, track, true);
      root.addEventListener(type, onPress);
    }
    return () => {
      for (const type of ['click', 'keydown']) {
        root.removeEventListener(type, track, true);
        root.removeEventListener(type, onPress);
      }
    };
  }, [on, reader, root, hasPageControls, speakerOff]);
  const listenRef = useRef<HTMLButtonElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const closedRef = useRef(false);
  useLayoutEffect(() => {
    const back =
      pressedRef.current?.isConnected === true ? pressedRef.current : (listenRef.current ?? root.querySelector<HTMLElement>(`[${READ_PLAY_ATTRIBUTE}]`));
    const fromStep = (pressedRef.current?.getAttribute(READ_PLAY_ATTRIBUTE) ?? '') !== '';
    if (reading ? !fromStep : closedRef.current) (reading ? toggleRef.current : back)?.focus({ preventScroll: true });
    closedRef.current = false;
  }, [reading, root]);
  // A page with its own speaker gets no Listen button and no player.
  const shown = ready && !hasSoundControl && (reading || !hasPlayControl);
  const place = (): void => {
    const box = boxRef.current;
    if (box === null || region === null) return;
    const regionRect = region.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    box.style.setProperty('--dash-listen-left', `${regionRect.left - rootRect.left}px`);
    box.style.setProperty('--dash-listen-width', `${regionRect.width}px`);
    box.style.setProperty('--dash-listen-page', `${rootRect.height}px`);
    box.style.setProperty(
      '--dash-listen-top',
      `${Math.max(0, stage === null ? regionRect.top - rootRect.top - box.offsetHeight : regionRect.bottom - rootRect.top)}px`,
    );
  };
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box === null || region === null || !shown) return;
    // `data-air`: the region's first line of text sits too close to its top, so the button keeps a gap above it.
    box.dataset.air ??= String(measureFirstTextLineOffset(region) < READ_AIR_GAP_PX);
    const [roomAttribute, otherAttribute, margin] =
      stage === null ? (['data-room', 'data-room-under', 'marginTop'] as const) : (['data-room-under', 'data-room', 'marginBottom'] as const);
    const current = box.hasAttribute(roomAttribute) ? 0 : parseFloat(getComputedStyle(region)[margin]);
    let needed: number;
    if (stage === null) needed = box.offsetHeight;
    else {
      box.setAttribute(roomAttribute, '');
      needed = parseFloat(getComputedStyle(region)[margin]);
    }
    box.toggleAttribute(roomAttribute, current >= 0 && current < needed);
    box.removeAttribute(otherAttribute);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(place);
    observer.observe(region);
    observer.observe(root);
    return () => observer.disconnect();
  }, [region, root, shown, stage]);
  useLayoutEffect(place);
  const nowBlock = reading && s.phase !== 'ended' && s.note === undefined ? blocksRef.current[s.at] : undefined;
  useEffect(() => {
    highlightReadBlock(stage === null ? nowBlock : undefined);
    if (stage === null && nowBlock !== undefined && (s.phase === 'starting' || s.phase === 'speaking')) scrollToReadBlock(nowBlock, root);
  }, [nowBlock, stage, s.phase, root]);
  useEffect(() => {
    if (reading && !hasSoundControl && stage !== null && region !== null) scrollReadStageIntoView(stage, region, root);
  }, [reading, hasSoundControl, stage, region, root]);
  useEffect(() => () => highlightReadBlock(undefined), []);
  // With the page's own speaker there is no player to show the note, so it goes up as a toast.
  useEffect(() => {
    if (s.note === undefined) return;
    if (hasSoundControl) toast.add({ title: s.note });
    else announce(s.note);
  }, [s.note, hasSoundControl]);
  if (!shown) return null;
  return (
    <div
      ref={boxRef}
      className="dash-listen"
      data-open={reading ? '' : undefined}
      data-under={stage !== null ? '' : undefined}
      data-uncommentable=""
      data-mc-chrome=""
    >
      <style>{READ_ALOUD_CSS}</style>
      <div className="dash-listen-region">
        {!on || reader === null ? null : reading ? (
          <ReadAloudPlayer
            s={s}
            reader={reader}
            toggle={toggleRef}
            onClose={() => {
              closedRef.current = true;
              reader.close();
            }}
          />
        ) : (
          <Button
            ref={listenRef}
            variant="secondary"
            icon={<Volume2 className="size-4" />}
            aria-label={LISTEN_LABEL}
            onClick={() => {
              pressedRef.current = null;
              reader.play();
            }}
          >
            {LISTEN_LABEL}
          </Button>
        )}
      </div>
    </div>
  );
}
