/**
 * The reader behind the Listen button and the page's own read controls: it loads the parts to read, hands them to a
 * voice one reading at a time (at most 100 lines and some 30 minutes; Next reads on), and follows where the voice is.
 */

export const READ_FAILED_MESSAGE = 'Can’t read aloud right now. Try again in a bit.';
export const READ_CAP_NOTE =
  'That’s as much as one reading takes. The rest is on the page; Next reads on, though the voice may first need a while.';

/** Ends of a reading that say nothing to the reader. */
const QUIET_READ_END_CODES = ['hidden', 'interrupted', 'time_limit', 'stopped', 'replaced'];

export interface VoiceLine {
  id: string;
  text: string;
  language?: string;
}

/** Why a reading stopped: `unavailable` takes read aloud away; the quiet codes end it without a note. */
export interface VoiceFailure {
  code: string;
  reason?: string;
}

export type VoiceState = 'idle' | 'starting' | 'speaking' | 'paused';

/** What reads the lines out. `speak` settles once every line is said, or rejects with a {@link VoiceFailure}. */
export interface ReadVoice {
  speak(lines: VoiceLine[], options: { rate: number }): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  setRate?(rate: number): Promise<void>;
  onLine(listener: (event: { id?: string }) => void): () => void;
  onState(listener: (event: { state: VoiceState; reason?: string }) => void): () => void;
}

export type ReaderPhase = 'rest' | 'starting' | 'speaking' | 'paused' | 'ended';

export interface ReaderState {
  phase: ReaderPhase;
  at: number;
  count: number;
  rate: number;
  note?: string;
  /** Set on `ended` when everything was read; an `ended` without it was refused or cut short. */
  through?: boolean;
}

export interface ReaderLine {
  text: string;
  language?: string;
}

export interface PageReaderInput {
  voice: ReadVoice;
  blocks(): readonly ReaderLine[];
  /** The voice is gone for good. */
  gone(): void;
  finished(): void;
  /** How many of the lines (from the first) one reading takes; all of them by default. */
  fits?(texts: string[]): number;
}

export interface PageReader {
  state(): ReaderState;
  subscribe(listener: () => void): () => void;
  play(): void;
  /** Plays from the part `pick` returns; `force` restarts it even when that part is the one being read. */
  from(pick: () => number, force?: boolean): void;
  pause(): void;
  step(by: number): void;
  rate(rate: number): void;
  close(): void;
  dispose(): void;
}

export const RESTING_READER_STATE: ReaderState = { phase: 'rest', at: 0, count: 0, rate: 1 };

const ignoreRejection = (promise: Promise<unknown> | undefined): void => void promise?.catch(() => undefined);

const isVoiceFailure = (value: unknown): value is VoiceFailure =>
  typeof value === 'object' && value !== null && typeof (value as { code?: unknown }).code === 'string';

export function createPageReader({ voice, blocks, gone, finished, fits = (texts) => texts.length }: PageReaderInput): PageReader {
  let state: ReaderState = RESTING_READER_STATE;
  let lines: ReaderLine[] = [];
  let turn = 0;
  let sent = false;
  // The line one reading stopped before (0: none): a restart below it keeps to the lines already loaded.
  let cap = 0;
  const listeners = new Set<() => void>();

  const publish = (phase: ReaderPhase, at = state.at, note?: string, through?: boolean): void => {
    state = {
      phase,
      at,
      count: lines.length,
      rate: state.rate,
      ...(note !== undefined ? { note } : {}),
      ...(through === true ? { through } : {}),
    };
    for (const listener of [...listeners]) listener();
  };
  const isActive = (): boolean => state.phase === 'starting' || state.phase === 'speaking' || state.phase === 'paused';
  const halt = (phase: ReaderPhase, at = state.at, note?: string): void => {
    turn += 1;
    if (isActive()) ignoreRejection(voice.stop());
    sent = false;
    if (phase !== 'paused') cap = 0;
    if (state.phase !== phase || state.at !== at || state.note !== note) publish(phase, at, note);
  };
  const fail = ({ code, reason }: VoiceFailure): void => {
    const why = (code === 'stopped' ? reason : code) ?? '';
    if (why === 'not_granted' || why === 'unavailable') {
      halt('rest', 0);
      gone();
      return;
    }
    if (why === 'viewer_stopped') {
      halt('rest', 0);
      return;
    }
    halt('ended', state.at, QUIET_READ_END_CODES.includes(why) ? undefined : READ_FAILED_MESSAGE);
  };
  const speak = (at: number): void => {
    const mine = ++turn;
    sent = true;
    publish('starting', at);
    const end = Math.min(at + fits(lines.slice(at).map((line) => line.text)), at < cap ? cap : Infinity);
    cap = end;
    voice
      .speak(
        lines.slice(at, end).map(({ text, language }, index) => ({
          id: `${mine}:${at + index}`,
          text,
          ...(language !== undefined ? { language } : {}),
        })),
        { rate: state.rate },
      )
      .then(
        () => {
          if (mine !== turn) return;
          sent = false;
          if (end < lines.length) {
            halt('ended', end - 1, READ_CAP_NOTE);
            return;
          }
          cap = 0;
          publish('ended', lines.length - 1, undefined, true);
          finished();
        },
        (failure: unknown) => {
          if (mine !== turn) return;
          fail(isVoiceFailure(failure) ? failure : { code: 'failed' });
        },
      );
  };
  const playFrom = (pick: () => number, force = false): void => {
    if (!isActive()) lines = blocks().map(({ text, language }) => ({ text, ...(language !== undefined ? { language } : {}) }));
    const at = pick();
    if (at >= 0 && at < lines.length && (force || !(isActive() && at === state.at))) speak(at);
    else if (force) return;
    else if (state.phase === 'paused') {
      if (sent) ignoreRejection(voice.resume());
      else speak(state.at);
    } else if (!isActive() && lines.length > 0) speak(0);
  };
  const unsubscribes = [
    voice.onLine(({ id }) => {
      const [mine, at] = (id ?? '').split(':');
      if (isActive() && Number(mine) === turn) publish(state.phase, Number(at));
    }),
    voice.onState(({ state: voiceState, reason }) => {
      if (voiceState === 'idle') {
        if (reason === 'not_granted' || reason === 'unavailable' || reason === 'viewer_stopped') fail({ code: reason });
        return;
      }
      if (sent && isActive()) publish(voiceState);
    }),
  ];

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    play: () => playFrom(() => -1),
    from: playFrom,
    pause() {
      const mine = turn;
      if (!isActive()) return;
      // A pause the voice refuses still pauses the reader.
      if (sent) voice.pause().catch(() => void (mine === turn && isActive() && halt('paused')));
      else halt('paused');
    },
    step(by) {
      if (state.phase === 'rest') return;
      const at = state.at + (state.phase === 'ended' && by < 0 ? 0 : by);
      if (at >= lines.length) halt('ended', lines.length - 1);
      else speak(Math.max(0, at));
    },
    rate(rate) {
      state = { ...state, rate };
      publish(state.phase, state.at, state.note, state.through);
      ignoreRejection(voice.setRate?.(rate));
    },
    close: () => halt('rest', 0),
    dispose() {
      for (const unsubscribe of unsubscribes) unsubscribe();
      halt('rest', 0);
    },
  };
}
