import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_READ_BLOCK_LENGTH,
  MAX_READ_BLOCKS,
  estimateReadSeconds,
  fitReadLines,
  normalizeReadLanguage,
  splitLongReadText,
  tidyReadText,
} from '../src/read-aloud/blocks.ts';
import { READ_CAP_NOTE, READ_FAILED_MESSAGE, createPageReader, type ReadVoice, type VoiceFailure, type VoiceLine, type VoiceState } from '../src/read-aloud/reader.ts';
import { pickSpeechVoice, speechErrorCode, splitSpeechChunks } from '../src/read-aloud/speech.ts';

describe('read aloud text', () => {
  it('tidies text as it is said', () => {
    assert.equal(tidyReadText('  Revenue [1] rose ,  sharply .  '), 'Revenue rose, sharply.');
    assert.equal(tidyReadText('West · East'), 'West. East');
    assert.equal(tidyReadText(': , Hello'), 'Hello');
    assert.equal(tidyReadText('Up;. Down'), 'Up. Down');
  });

  it('cuts long text at a sentence end, else a space, else mid-word', () => {
    const sentence = `${'a'.repeat(1499)}. `;
    const parts = splitLongReadText(sentence + 'b '.repeat(400));
    assert.equal(parts[0], `${'a'.repeat(1499)}.`);
    assert.ok(parts.every((part) => part.length <= MAX_READ_BLOCK_LENGTH));
    const words = splitLongReadText(`${'w '.repeat(1100)}`);
    assert.ok(words.length === 2 && words.every((part) => part.length <= MAX_READ_BLOCK_LENGTH));
    const solid = splitLongReadText('x'.repeat(4500));
    assert.deepEqual(
      solid.map((part) => part.length),
      [2000, 2000, 500],
    );
    assert.deepEqual(splitLongReadText('short'), ['short']);
  });

  it('does not split a surrogate pair', () => {
    const text = `${'x'.repeat(MAX_READ_BLOCK_LENGTH - 1)}😀tail`;
    const parts = splitLongReadText(text);
    assert.equal(parts[0]?.length, MAX_READ_BLOCK_LENGTH - 1);
    assert.ok(parts[1]?.startsWith('😀'));
  });

  it('fits a reading to 100 lines and some 30 minutes', () => {
    assert.equal(estimateReadSeconds(''), 5);
    assert.equal(estimateReadSeconds('x'.repeat(120)), 10);
    assert.equal(fitReadLines(['a', 'b']), 2);
    assert.equal(fitReadLines(Array.from({ length: 150 }, () => 'a')), MAX_READ_BLOCKS);
    assert.equal(fitReadLines(Array.from({ length: 20 }, () => 'x'.repeat(2000))), 10);
  });

  it('keeps only plausible language tags', () => {
    assert.equal(normalizeReadLanguage('pt-BR'), 'pt-BR');
    assert.equal(normalizeReadLanguage('zh-Hant-TW'), 'zh-Hant-TW');
    assert.equal(normalizeReadLanguage('english'), undefined);
    assert.equal(normalizeReadLanguage(3), undefined);
  });
});

describe('speech voice', () => {
  const voices = [
    { name: 'a', lang: 'en-US', localService: false, default: true },
    { name: 'b', lang: 'en_GB', localService: true, default: false },
    { name: 'c', lang: 'pt-PT', localService: true, default: false },
    { name: 'd', lang: 'pt-BR', localService: false, default: false },
  ];

  it('picks the voice for the language, on-device ones first', () => {
    assert.equal(pickSpeechVoice(voices, 'en-GB')?.name, 'b');
    assert.equal(pickSpeechVoice(voices, 'en')?.name, 'b');
    assert.equal(pickSpeechVoice(voices, 'pt-BR')?.name, 'd');
    assert.equal(pickSpeechVoice(voices, 'pt-AO')?.name, 'c');
    assert.equal(pickSpeechVoice(voices, 'fr'), undefined);
    assert.equal(pickSpeechVoice(voices, undefined), undefined);
  });

  it('cuts a line into pieces at sentence ends', () => {
    assert.deepEqual(splitSpeechChunks('One. Two.', 6), ['One.', 'Two.']);
    assert.deepEqual(splitSpeechChunks('short'), ['short']);
    const chunks = splitSpeechChunks('word '.repeat(200), 50);
    assert.ok(chunks.every((chunk) => chunk.length <= 50));
    assert.equal(chunks.join(' '), 'word '.repeat(200).trim());
  });

  it('maps speech errors to the reader’s codes', () => {
    assert.equal(speechErrorCode('interrupted'), 'interrupted');
    assert.equal(speechErrorCode('canceled'), 'interrupted');
    assert.equal(speechErrorCode('synthesis-unavailable'), 'unavailable');
    assert.equal(speechErrorCode('network'), 'failed');
  });
});

interface Spoken {
  lines: VoiceLine[];
  rate: number;
  resolve(): void;
  reject(failure: VoiceFailure): void;
}

function fakeVoice() {
  const spoken: Spoken[] = [];
  const lineListeners = new Set<(event: { id?: string }) => void>();
  const stateListeners = new Set<(event: { state: VoiceState; reason?: string }) => void>();
  const calls: string[] = [];
  let refusePause = false;
  const voice: ReadVoice = {
    speak(lines, { rate }) {
      calls.push('speak');
      return new Promise((resolve, reject) => spoken.push({ lines, rate, resolve, reject }));
    },
    async stop() {
      calls.push('stop');
    },
    async pause() {
      calls.push('pause');
      if (refusePause) throw new Error('no');
    },
    async resume() {
      calls.push('resume');
    },
    async setRate(rate) {
      calls.push(`rate ${rate}`);
    },
    onLine(listener) {
      lineListeners.add(listener);
      return () => void lineListeners.delete(listener);
    },
    onState(listener) {
      stateListeners.add(listener);
      return () => void stateListeners.delete(listener);
    },
  };
  return {
    voice,
    spoken,
    calls,
    line: (id: string) => lineListeners.forEach((listener) => listener({ id })),
    state: (state: VoiceState, reason?: string) => stateListeners.forEach((listener) => listener(reason === undefined ? { state } : { state, reason })),
    refusePause: () => void (refusePause = true),
    listening: () => lineListeners.size + stateListeners.size,
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function setup(texts: string[], fits?: (texts: string[]) => number) {
  const fake = fakeVoice();
  const events: string[] = [];
  const reader = createPageReader({
    voice: fake.voice,
    blocks: () => texts.map((text, index) => (index === 0 ? { text, language: 'fr' } : { text })),
    gone: () => events.push('gone'),
    finished: () => events.push('finished'),
    ...(fits ? { fits } : {}),
  });
  return { fake, events, reader };
}

describe('page reader', () => {
  it('reads every part and says when it is through', async () => {
    const { fake, events, reader } = setup(['One', 'Two', 'Three']);
    reader.play();
    assert.equal(reader.state().phase, 'starting');
    assert.equal(reader.state().count, 3);
    const [first] = fake.spoken;
    assert.deepEqual(
      first?.lines.map((line) => [line.text, line.language]),
      [
        ['One', 'fr'],
        ['Two', undefined],
        ['Three', undefined],
      ],
    );
    const turn = first?.lines[0]?.id.split(':')[0];
    fake.state('speaking');
    assert.equal(reader.state().phase, 'speaking');
    fake.line(`${turn}:1`);
    assert.equal(reader.state().at, 1);
    fake.line('999:2');
    assert.equal(reader.state().at, 1);
    first?.resolve();
    await settle();
    assert.deepEqual(reader.state(), { phase: 'ended', at: 2, count: 3, rate: 1, through: true });
    assert.deepEqual(events, ['finished']);
  });

  it('pauses, resumes and steps between parts', async () => {
    const { fake, reader } = setup(['One', 'Two', 'Three']);
    reader.play();
    fake.state('speaking');
    reader.pause();
    assert.deepEqual(fake.calls, ['speak', 'pause']);
    fake.state('paused');
    assert.equal(reader.state().phase, 'paused');
    reader.play();
    assert.equal(fake.calls.at(-1), 'resume');
    reader.step(1);
    assert.equal(reader.state().at, 1);
    assert.equal(fake.spoken.at(-1)?.lines[0]?.text, 'Two');
    reader.step(5);
    assert.equal(reader.state().phase, 'ended');
    assert.equal(reader.state().at, 2);
    reader.step(-1);
    assert.equal(reader.state().phase, 'starting');
    assert.equal(reader.state().at, 2);
  });

  it('pauses itself when the voice refuses to', async () => {
    const { fake, reader } = setup(['One', 'Two']);
    fake.refusePause();
    reader.play();
    reader.pause();
    await settle();
    assert.equal(reader.state().phase, 'paused');
    reader.play();
    assert.equal(fake.spoken.length, 2);
    assert.equal(reader.state().phase, 'starting');
  });

  it('plays from a chosen part, and only restarts the current one when forced', () => {
    const { fake, reader } = setup(['One', 'Two', 'Three']);
    reader.from(() => 2);
    assert.equal(fake.spoken.at(-1)?.lines[0]?.text, 'Three');
    reader.from(() => 2);
    assert.equal(fake.spoken.length, 1);
    reader.from(() => 2, true);
    assert.equal(fake.spoken.length, 2);
    reader.from(() => -1, true);
    assert.equal(fake.spoken.length, 2);
  });

  it('stops one reading at its cap and reads on from there', async () => {
    const { fake, reader } = setup(['A', 'B', 'C', 'D'], () => 2);
    reader.play();
    assert.deepEqual(
      fake.spoken[0]?.lines.map((line) => line.text),
      ['A', 'B'],
    );
    fake.spoken[0]?.resolve();
    await settle();
    assert.equal(reader.state().phase, 'ended');
    assert.equal(reader.state().note, READ_CAP_NOTE);
    assert.equal(reader.state().through, undefined);
    reader.step(1);
    assert.deepEqual(
      fake.spoken[1]?.lines.map((line) => line.text),
      ['C', 'D'],
    );
  });

  it('ends quietly when interrupted and with a note when it fails', async () => {
    const quiet = setup(['A', 'B']);
    quiet.reader.play();
    quiet.fake.spoken[0]?.reject({ code: 'interrupted' });
    await settle();
    assert.equal(quiet.reader.state().phase, 'ended');
    assert.equal(quiet.reader.state().note, undefined);

    const failed = setup(['A', 'B']);
    failed.reader.play();
    failed.fake.spoken[0]?.reject({ code: 'failed' });
    await settle();
    assert.equal(failed.reader.state().note, READ_FAILED_MESSAGE);
  });

  it('gives up for good when the voice is unavailable', async () => {
    const { fake, events, reader } = setup(['A', 'B']);
    reader.play();
    fake.state('idle', 'unavailable');
    assert.equal(reader.state().phase, 'rest');
    assert.deepEqual(events, ['gone']);
    fake.spoken[0]?.reject({ code: 'unavailable' });
    await settle();
    assert.deepEqual(events, ['gone']);
  });

  it('changes speed, and closes and lets go of the voice', () => {
    const { fake, reader } = setup(['A', 'B']);
    reader.play();
    reader.rate(1.5);
    assert.equal(reader.state().rate, 1.5);
    assert.ok(fake.calls.includes('rate 1.5'));
    reader.close();
    assert.equal(reader.state().phase, 'rest');
    assert.equal(fake.calls.at(-1), 'stop');
    reader.play();
    assert.equal(fake.spoken.at(-1)?.rate, 1.5);
    reader.dispose();
    assert.equal(fake.listening(), 0);
    assert.equal(reader.state().phase, 'rest');
  });

  it('does nothing with no parts', () => {
    const { fake, reader } = setup([]);
    reader.play();
    assert.equal(reader.state().phase, 'rest');
    assert.equal(fake.spoken.length, 0);
  });
});
