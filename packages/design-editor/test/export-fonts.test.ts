import assert from 'node:assert/strict';
import { it } from 'node:test';
import { ExportFonts } from '../src/lib/export-fonts.ts';

it('embeds offline fonts for the text used, caches downloads and writes license notices', async () => {
  const calls: string[] = [];
  const fonts = new ExportFonts(async input => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith('https://fonts.googleapis.com')) return new Response("@font-face{font-family:'Source Serif 4';src:url(https://fonts.gstatic.com/a.woff2);unicode-range:U+0020-007F}@font-face{src:url(https://fonts.gstatic.com/unused.woff2);unicode-range:U+3040-309F}");
    return new Response(Uint8Array.of(1, 2));
  });
  const link = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4">';
  const points = new Set([65]);
  assert.match(await fonts.inline(link, points), /data:font\/woff2;base64,AQI=/);
  await fonts.inline(link, points);
  assert.equal(calls.length, 2);
  assert.match(await fonts.notice(), /Source Serif 4[\s\S]*Copyright[\s\S]*OPEN FONT LICENSE/i);
});
