import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDashboardLook,
  contrastRatio,
  dashChartToken,
  getDesignSystemName,
  isDarkColor,
  parseCssColor,
  parseDashboardLook,
  parseFontStack,
  parseLookLength,
  parseLookTone,
  relativeLuminance,
} from '../src/index.ts';

const CLAY = {
  system: { name: 'Clay' },
  light: {
    ground: '#f6f1e9', card: '#ffffff', text: '#2b2620', muted: '#7a6f62', border: '#e6dfd3',
    good: '#006300', warning: '#734500', bad: '#8e2626',
    charts: ['#d97757', '#3d3929', '#c2b280', '#788c5d', '#6a9bcc', '#8b5d7d', '#c9952b', '#5f6b73'],
  },
  dark: {
    ground: '#14110d', card: '#221d17', text: '#f0efec', muted: '#898781', border: '#272726',
    good: '#0ca30c', warning: '#db9300', bad: '#ec7e7e',
    charts: ['#e08363', '#c9c2b3', '#b98e5a', '#93a877', '#7eaddb', '#a97a9b', '#d8a747', '#8d9aa3'],
  },
  tweaks: { palette: 'Ocean', font: 'Serif' },
};

describe('colors', () => {
  it('parses CSS colors to hex', () => {
    assert.equal(parseCssColor('#FFF'), '#ffffff');
    assert.equal(parseCssColor('rgb(255, 0, 0)'), '#ff0000');
    assert.equal(parseCssColor('not a color'), undefined);
  });

  it('measures luminance and contrast', () => {
    assert.equal(relativeLuminance('#ffffff'), 1);
    assert.equal(relativeLuminance('#000000'), 0);
    assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
    assert.equal(contrastRatio('#777777', '#777777'), 1);
    assert.equal(isDarkColor('#14110d'), true);
    assert.equal(isDarkColor('#f6f1e9'), false);
  });
});

describe('dash/look', () => {
  it('reads a whole look, and its tweaks do not get in the way', () => {
    const look = parseDashboardLook(CLAY);
    assert.ok(look !== null);
    assert.equal(look.tones.light?.ground, '#f6f1e9');
    assert.equal(look.tones.dark?.text, '#f0efec');
    assert.equal(look.tones.light?.charts.filter(Boolean).length, 8);
    assert.equal(getDesignSystemName(CLAY), 'Clay');
  });

  it('drops a theme whose ground is on the wrong side', () => {
    assert.equal(parseLookTone({ ground: '#101010' }, 'light'), undefined);
    assert.equal(parseDashboardLook({ light: { ground: '#101010' } }), null);
  });

  it('replaces text too faint to read and drops faint chart colors', () => {
    const tone = parseLookTone({ ground: '#ffffff', text: '#eeeeee', charts: ['#fafafa', '#1d4e89', '#1d4e8a'], good: '#f0fff0' }, 'light');
    assert.ok(tone !== undefined);
    assert.equal(tone.text, '#000000');
    assert.ok(contrastRatio(tone.muted, tone.ground) >= 3);
    assert.deepEqual(tone.charts, [undefined, '#1d4e89', undefined]);
    assert.equal(tone.status.good, undefined);
  });

  it('clamps lengths and checks font stacks', () => {
    assert.equal(parseLookLength('100px', 0, 32), '32px');
    assert.equal(parseLookLength('0.5rem', 0, 32), '8px');
    assert.equal(parseLookLength(6, 0, 32), '6px');
    assert.equal(parseLookLength('big', 0, 32), undefined);
    assert.equal(parseFontStack("'Inter', sans-serif"), '"Inter",sans-serif');
    assert.equal(parseFontStack('url(x)'), undefined);
  });

  it('applies the look as the page tokens on #dash-root', () => {
    const applied = applyDashboardLook({ ...CLAY, corners: '6px', fonts: { text: 'Inter, sans-serif' } });
    assert.equal(applied.system, 'Clay');
    assert.equal(applied.colors, 8);
    assert.match(applied.css, /#dash-root/);
    assert.match(applied.css, /--dash-page-bg:#f6f1e9/);
    assert.match(applied.css, new RegExp(`${dashChartToken(1)}:#d97757`));
    assert.match(applied.css, /--dash-radius:6px/);
    assert.match(applied.css, /--font-sans:"Inter",sans-serif/);
    for (const [property] of applied.css.matchAll(/--[a-z0-9-]+(?=:)/g)) assert.match(property, /^--(dash|color|font|t)-/);
    assert.deepEqual(applyDashboardLook(null), { css: '', look: null, system: null, colors: 8 });
  });
});
