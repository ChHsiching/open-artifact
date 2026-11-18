import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDashboardLook } from '@open-artifact/data-core';
import {
  ADJUSTED_LOOK_LABEL,
  CUSTOM_LOOK_LABEL,
  DEFAULT_LOOK_LABEL,
  DEFAULT_TONES,
  DESIGN_SYSTEM_REQUEST,
  DESIGN_SYSTEM_SELECTION,
  designCardDetail,
  designCardName,
  firstFontName,
  swatchColor,
} from '../src/design/look-card.ts';

describe('design-system card', () => {
  it('names the design system, a custom look or the default one', () => {
    assert.equal(designCardName('Harbor', true), 'Harbor');
    assert.equal(designCardName(null, true), CUSTOM_LOOK_LABEL);
    assert.equal(designCardName(null, false), DEFAULT_LOOK_LABEL);
  });

  it('reads the first named font of a stack', () => {
    assert.equal(firstFontName('"Inter Display", Inter, sans-serif'), 'Inter Display');
    assert.equal(firstFontName("system-ui, 'Söhne', serif"), 'Söhne');
    assert.equal(firstFontName('serif'), undefined);
    assert.equal(firstFontName(undefined), undefined);
  });

  it('shows the display font, else the text font, else nothing', () => {
    const look = parseDashboardLook({ light: { ground: '#ffffff' }, fonts: { display: 'Georgia, serif', text: 'Inter, sans-serif' } });
    assert.equal(designCardDetail(look), 'Georgia');
    const textOnly = parseDashboardLook({ light: { ground: '#ffffff' }, fonts: { text: 'Inter, sans-serif' } });
    assert.equal(designCardDetail(textOnly), 'Inter');
    assert.equal(designCardDetail(null), undefined);
    assert.equal(designCardDetail(look, true), ADJUSTED_LOOK_LABEL);
  });

  it('colors the swatches from the look, else the defaults for the theme', () => {
    assert.equal(swatchColor(null, 'light', 'ground'), DEFAULT_TONES.light.ground);
    assert.equal(swatchColor(null, 'dark', 'chart-2'), DEFAULT_TONES.dark.charts[1]);
    const look = parseDashboardLook({ light: { ground: '#fafafa', text: '#111111' } });
    assert.equal(swatchColor(look, 'light', 'ground'), look?.tones.light?.ground);
    assert.notEqual(look?.tones.light, undefined);
    assert.equal(swatchColor(look, 'dark', 'ground'), DEFAULT_TONES.dark.ground);
  });

  it('asks the agent in the agreed words', () => {
    assert.equal(DESIGN_SYSTEM_REQUEST, 'Change the design system of this dashboard. Read reference/design-system.md first.');
    assert.deepEqual(DESIGN_SYSTEM_SELECTION.chip, { about: 'system' });
    assert.equal(DESIGN_SYSTEM_SELECTION.text, 'From the dashboard’s Design page, to change its design system. See reference/design-system.md.');
  });
});
