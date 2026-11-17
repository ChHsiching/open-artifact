import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addFontFiles,
  addTypeGroup,
  addTypeStyle,
  firstFamily,
  freeFamilyKey,
  guessFontFace,
  hostedCandidates,
  removeTypeStyle,
  setFamilyStack,
  updateTypeGroup,
} from '../src/lib/type-edit.ts';

const raw = () => ({
  type: {
    fonts: [{ family: 'Brand', file: 'fonts/Brand.woff2', weight: '400', style: 'normal' }],
    families: { sans: 'Brand, sans-serif' },
    groups: [{ name: 'Body', family: 'sans', styles: [{ name: 'body', fontSize: 16, lineHeight: 1.5 }] }],
  },
});

describe('type sets and styles', () => {
  it('adds a set with a free name', () => {
    const first = addTypeGroup(raw(), 'Body');
    assert.equal(first.name, 'Body 2');
    assert.equal((first.raw.type as { groups: unknown[] }).groups.length, 2);
  });

  it('adds a style after the last one, copying its values', () => {
    const { raw: next, name } = addTypeStyle(raw(), 'Body', 'body');
    assert.equal(name, 'body-2');
    const styles = (next.type as { groups: { styles: Record<string, unknown>[] }[] }).groups[0]!.styles;
    assert.deepEqual(styles[1], { name: 'body-2', fontSize: 16, lineHeight: 1.5 });
  });

  it('makes the set when it is missing', () => {
    const { raw: next } = addTypeStyle(raw(), 'Display', 'display');
    const groups = (next.type as { groups: { name: string; styles: unknown[] }[] }).groups;
    assert.deepEqual(
      groups.map((g) => [g.name, g.styles.length]),
      [
        ['Body', 1],
        ['Display', 1],
      ],
    );
  });

  it('removes a style and updates a set', () => {
    const next = updateTypeGroup(removeTypeStyle(raw(), 'body'), 'Body', { family: null, name: 'Text' });
    assert.deepEqual((next.type as { groups: unknown[] }).groups, [{ name: 'Text', styles: [] }]);
  });

  it('starts a type family on a file without one', () => {
    const { raw: next, name } = addTypeStyle({}, 'Body');
    assert.equal(name, 'text');
    assert.deepEqual(next, { type: { fonts: [], families: {}, groups: [{ name: 'Body', styles: [{ name: 'text', fontSize: 16 }] }] } });
  });
});

describe('families and font files', () => {
  it('sets and removes stacks, with free keys', () => {
    const next = setFamilyStack(raw(), 'display', '"Playfair Display", serif');
    assert.equal((next.type as { families: Record<string, string> }).families.display, '"Playfair Display", serif');
    assert.equal(freeFamilyKey(next, 'Display'), 'display-2');
    assert.deepEqual((setFamilyStack(next, 'sans', null).type as { families: object }).families, { display: '"Playfair Display", serif' });
  });

  it('adds font files once', () => {
    const entry = { family: 'Brand', file: 'fonts/Brand.woff2', weight: '400', style: 'normal' as const };
    const next = addFontFiles(raw(), [entry, { ...entry, file: 'fonts/Brand-Bold.woff2', weight: '700' }]);
    assert.equal((next.type as { fonts: unknown[] }).fonts.length, 2);
  });
});

describe('guessFontFace', () => {
  it('reads weight and style from names', () => {
    assert.deepEqual(guessFontFace('Inter-SemiBoldItalic.woff2'), { family: 'Inter', weight: '600', style: 'italic' });
    assert.deepEqual(guessFontFace('fonts/SourceSerif4-Regular.ttf'), { family: 'Source Serif4', weight: '400', style: 'normal' });
    assert.deepEqual(guessFontFace('Brand_ExtraBold.otf'), { family: 'Brand', weight: '800', style: 'normal' });
    assert.deepEqual(guessFontFace('InterBold.woff2'), { family: 'Inter', weight: '700', style: 'normal' });
  });

  it('gives variable files the weight range', () => {
    assert.deepEqual(guessFontFace('Inter[wght].ttf'), { family: 'Inter', weight: '100 900', style: 'normal' });
    assert.deepEqual(guessFontFace('InterVariable-Italic.woff2'), { family: 'Inter', weight: '100 900', style: 'italic' });
  });
});

describe('hosted families', () => {
  it('skips files, system and generic families', () => {
    assert.equal(firstFamily('"Playfair Display", serif'), 'Playfair Display');
    assert.deepEqual(hostedCandidates(['Brand, sans-serif', '"Playfair Display", serif', 'Georgia, serif', 'system-ui', 'Inter, sans-serif'], ['Brand'], ['Georgia']), [
      'Inter',
      'Playfair Display',
    ]);
  });
});

describe('ensureFamily', () => {
  it('reuses a key whose stack starts with the family, else adds one', async () => {
    const { ensureFamily } = await import('../src/lib/type-edit.ts');
    assert.equal(ensureFamily(raw(), 'brand', 'Brand, sans-serif').key, 'sans');
    const added = ensureFamily(raw(), 'Playfair Display', '"Playfair Display", serif');
    assert.equal(added.key, 'playfair-display');
    assert.equal((added.raw.type as { families: Record<string, string> }).families['playfair-display'], '"Playfair Display", serif');
  });
});
