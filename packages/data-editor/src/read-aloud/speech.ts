/**
 * The voice read aloud speaks with: the browser's own speech synthesis. Each line is said in the voice that best
 * matches its language, a sentence or so at a time (some voices stop on long utterances). Read aloud is offered
 * only once the browser lists a voice.
 */

import { create } from 'zustand';
import type { ReadVoice, VoiceLine, VoiceState } from './reader.ts';

/** The longest piece of a line handed to the browser at once. */
export const MAX_SPEECH_CHUNK_LENGTH = 240;

/** What voice picking reads of a `SpeechSynthesisVoice`. */
export interface SpeechVoiceInfo {
  lang: string;
  localService: boolean;
  default: boolean;
}

interface SpeechVoicesState {
  /** The browser has speech synthesis. */
  supported: boolean;
  voices: readonly SpeechSynthesisVoice[];
  /** A voice said it can't speak here; read aloud is off until the page reloads. */
  gone: boolean;
}

const speechSynthesisOrNull = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function' ? window.speechSynthesis : null;

/** The browser's voices, kept up to date while something reads them. */
export const useSpeechVoices = create<SpeechVoicesState>()(() => ({ supported: false, voices: [], gone: false }));

let watching = false;

/** Starts following the browser's list of voices (it often fills in after the page loads). */
export function watchSpeechVoices(): void {
  const synthesis = speechSynthesisOrNull();
  if (watching || synthesis === null) return;
  watching = true;
  const read = (): void => useSpeechVoices.setState({ supported: true, voices: synthesis.getVoices() });
  read();
  synthesis.addEventListener('voiceschanged', read);
}

/** Read aloud stays off: the voice said speech isn't available here. */
export function dropSpeech(): void {
  useSpeechVoices.setState({ gone: true });
}

export const hasSpeechVoice = (state: SpeechVoicesState): boolean => state.supported && !state.gone && state.voices.length > 0;

const normalizeTag = (tag: string): string => tag.replace(/_/g, '-').toLowerCase();

/**
 * The voice for `language`: one for exactly that tag, else for its language (`pt` for `pt-BR`), on-device voices
 * first, then the browser's default among them. Undefined when no voice speaks it (the browser then picks).
 */
export function pickSpeechVoice<T extends SpeechVoiceInfo>(voices: readonly T[], language: string | undefined): T | undefined {
  if (language === undefined) return undefined;
  const wanted = normalizeTag(language);
  const primary = wanted.split('-')[0] ?? wanted;
  const rank = (voice: T): number => (voice.localService ? 0 : 2) + (voice.default ? 0 : 1);
  const best = (pool: T[]): T | undefined => pool.sort((a, b) => rank(a) - rank(b))[0];
  return (
    best(voices.filter((voice) => normalizeTag(voice.lang) === wanted)) ??
    best(voices.filter((voice) => (normalizeTag(voice.lang).split('-')[0] ?? '') === primary))
  );
}

/** A line cut into pieces the browser says in one go: at sentence ends, else at a space, else mid-word. */
export function splitSpeechChunks(text: string, max = MAX_SPEECH_CHUNK_LENGTH): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const head = rest.slice(0, max + 1);
    let cut = 0;
    for (const match of head.matchAll(/[.!?…;:](?=\s)|[。！？；]/gu)) if (match.index < max) cut = match.index + match[0].length;
    if (cut < max / 3) cut = head.lastIndexOf(' ', max) + 1;
    if (cut < max / 3) cut = /[\uD800-\uDBFF]/.test(rest.charAt(max - 1)) ? max - 1 : max;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest !== '') chunks.push(rest);
  return chunks.filter((chunk) => chunk !== '');
}

/** The failure code a speech error ends a reading with. */
export function speechErrorCode(error: string): string {
  if (error === 'interrupted' || error === 'canceled') return 'interrupted';
  if (error === 'synthesis-unavailable') return 'unavailable';
  return 'failed';
}

interface Playing {
  lines: VoiceLine[];
  line: number;
  chunk: number;
  chunks: string[];
  utterance: SpeechSynthesisUtterance | null;
  paused: boolean;
  resolve(): void;
  reject(failure: { code: string; reason?: string }): void;
}

/**
 * A voice on the browser's speech synthesis. A pause stops the current piece and Play says it again, which every
 * browser does alike; a new speed applies from the next piece.
 */
export function createSpeechVoice(synthesis: SpeechSynthesis): ReadVoice & { dispose(): void } {
  const lineListeners = new Set<(event: { id?: string }) => void>();
  const stateListeners = new Set<(event: { state: VoiceState; reason?: string }) => void>();
  const emitState = (state: VoiceState, reason?: string): void => {
    for (const listener of [...stateListeners]) listener(reason === undefined ? { state } : { state, reason });
  };
  let rate = 1;
  let playing: Playing | null = null;

  const silence = (): void => {
    if (playing?.utterance) {
      playing.utterance.onstart = playing.utterance.onend = playing.utterance.onerror = null;
      playing.utterance = null;
    }
    synthesis.cancel();
  };
  const finish = (failure?: { code: string; reason?: string }): void => {
    const done = playing;
    if (done === null) return;
    silence();
    playing = null;
    if (failure === undefined) done.resolve();
    else done.reject(failure);
    emitState('idle', failure?.code === 'unavailable' ? 'unavailable' : undefined);
  };
  const say = (): void => {
    const current = playing;
    if (current === null || current.paused) return;
    const line = current.lines[current.line];
    if (line === undefined) return finish();
    if (current.chunk === 0) current.chunks = splitSpeechChunks(line.text);
    const text = current.chunks[current.chunk];
    if (text === undefined) {
      current.line += 1;
      current.chunk = 0;
      return say();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickSpeechVoice(synthesis.getVoices(), line.language);
    if (line.language !== undefined) utterance.lang = line.language;
    if (voice !== undefined) utterance.voice = voice;
    utterance.rate = rate;
    const first = current.chunk === 0;
    utterance.onstart = () => {
      if (playing !== current || current.utterance !== utterance) return;
      emitState('speaking');
      if (first) for (const listener of [...lineListeners]) listener({ id: line.id });
    };
    utterance.onend = () => {
      if (playing !== current || current.utterance !== utterance) return;
      current.utterance = null;
      current.chunk += 1;
      say();
    };
    utterance.onerror = (event) => {
      if (playing !== current || current.utterance !== utterance) return;
      finish({ code: speechErrorCode(event.error), reason: event.error });
    };
    current.utterance = utterance;
    if (synthesis.paused) synthesis.resume();
    synthesis.speak(utterance);
  };
  const onPageHide = (): void => finish({ code: 'hidden' });
  window.addEventListener('pagehide', onPageHide);

  return {
    speak(lines, options) {
      finish({ code: 'replaced' });
      rate = options.rate;
      return new Promise<void>((resolve, reject) => {
        playing = { lines, line: 0, chunk: 0, chunks: [], utterance: null, paused: false, resolve, reject };
        emitState('starting');
        say();
      });
    },
    async stop() {
      finish({ code: 'stopped' });
    },
    async pause() {
      if (playing === null || playing.paused) return;
      playing.paused = true;
      silence();
      emitState('paused');
    },
    async resume() {
      if (playing === null || !playing.paused) return;
      playing.paused = false;
      emitState('starting');
      say();
    },
    async setRate(next) {
      rate = next;
    },
    onLine(listener) {
      lineListeners.add(listener);
      return () => void lineListeners.delete(listener);
    },
    onState(listener) {
      stateListeners.add(listener);
      return () => void stateListeners.delete(listener);
    },
    dispose() {
      window.removeEventListener('pagehide', onPageHide);
      finish({ code: 'stopped' });
      lineListeners.clear();
      stateListeners.clear();
    },
  };
}

/** The browser's speech synthesis as a voice, or null when it has none. */
export function openSpeechVoice(): (ReadVoice & { dispose(): void }) | null {
  const synthesis = speechSynthesisOrNull();
  return synthesis === null ? null : createSpeechVoice(synthesis);
}
