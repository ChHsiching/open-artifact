import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_RUN_REPORT_BYTES, escapedJsonByteSize } from '../src/page/runs.ts';
import { fitShownPageRecord, isSafeShownSvgValue, normalizeShownPageLines, sanitizeShownLink } from '../src/page/shown-page.ts';

describe('shown page', () => {
  it('keeps only plain web and mail links', () => {
    assert.equal(sanitizeShownLink(' https://example.com/a?b=1 '), 'https://example.com/a?b=1');
    assert.equal(sanitizeShownLink('mailto:team@example.com'), 'mailto:team@example.com');
    assert.equal(sanitizeShownLink('javascript:alert(1)'), undefined);
    assert.equal(sanitizeShownLink('https://user:pw@example.com'), undefined);
    assert.equal(sanitizeShownLink(`https://example.com/${'a'.repeat(2100)}`), undefined);
    assert.equal(sanitizeShownLink(42), undefined);
  });

  it('keeps SVG values with plain functions or local references', () => {
    assert.equal(isSafeShownSvgValue('translate(10, 20) rotate(45)'), true);
    assert.equal(isSafeShownSvgValue('url(#clip-1)'), true);
    assert.equal(isSafeShownSvgValue('url(https://example.com/x.svg)'), false);
    assert.equal(isSafeShownSvgValue('var(--x)'), false);
    assert.equal(isSafeShownSvgValue('a\\b'), false);
  });

  it('trims lines and drops empty ones', () => {
    assert.equal(normalizeShownPageLines('  <p>\n\n   a  \n</p>  '), '<p>\na\n</p>');
  });

  it('cuts the record until it fits the report size', () => {
    const base = { v: 1 as const, at: '2026-01-01T00:00:00.000Z', width: 1200, filters: {} };
    assert.deepEqual(fitShownPageRecord('<p>x</p>', base), { ...base, html: '<p>x</p>' });
    const fitted = fitShownPageRecord('<'.repeat(MAX_RUN_REPORT_BYTES), base);
    assert.equal(fitted.truncated, true);
    assert.ok(escapedJsonByteSize(fitted) <= MAX_RUN_REPORT_BYTES);
  });
});
