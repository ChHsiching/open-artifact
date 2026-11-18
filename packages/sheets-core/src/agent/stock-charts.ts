/**
 * The page's stock charts (Insert chart: bar, stacked bar, line, pie): the code each widget is made with. The page
 * inserts these texts as they are, and the xlsx export knows a stock chart by its exact text (stockKindOf), so this
 * file is the one source of them.
 */

export type StockKind = 'bar' | 'stackedBar' | 'line' | 'pie';

export const STOCK_KINDS: readonly StockKind[] = ['bar', 'stackedBar', 'line', 'pie'];

/** The name of the one input a stock chart reads. */
export const STOCK_INPUT = 'rows';

export const STOCK_CHART_PROGRAMS: Readonly<Record<StockKind, string>> = {
  bar: `export default () => <sheet.Visualize data-component='bars' sources={{rows: {kind: 'ref', ref: 'input/rows', adapter: {kind: 'cells'}}, chartSize: {kind: 'data', data: [{width: 480, height: 280}]}, chartWords: {kind: 'data', data: [{locale: 'en-US', one: '# value isn’t a number and isn’t shown', other: '# values aren’t numbers and aren’t shown'}]}}}>{({rows, chartSize, chartWords}) => {
  const wide = chartSize.at(0).width, high = chartSize.at(0).height;
  const isNumber = c => typeof c.value === 'number';
  const isFilled = r => r.some(c => c.text !== '');
  const fit = (t, room) => 7.5 * t.length > room ? t.slice(0, Math.max(1, Math.floor(room / 7.5) - 1)) + '…' : t;
  const seen = rows.slice(0, 100).filter(isFilled);
  const hasHead = seen.length > 1 && !seen.at(0).some(isNumber);
  const head = hasHead ? seen.at(0) : null, probe = hasHead ? seen.slice(1) : seen, below = rows.filter(isFilled).slice(hasHead ? 1 : 0);
  const width = probe.length ? probe.at(0).length : 0;
  const isYear = c => isNumber(c) && Number.isInteger(c.value) && c.value > 1800 && c.value < 2200;
  const hasLabels = width > 1 && (!probe.some(r => isNumber(r.at(0))) || probe.every(r => isYear(r.at(0))));
  const all = Array.from({length: width}, (_, i) => i).filter(i => i >= (hasLabels ? 1 : 0) && probe.some(r => isNumber(r.at(i)))).map((i, k) => ({i, name: head ? head.at(i).text : '', tag: head ? fit(head.at(i).text, 135) : '', hue: 'var(--chart-categorical-' + (k % 8 + 1) + ')'}));
  const body = below.filter(r => hasLabels ? r.at(0).text !== '' : all.some(s => isNumber(r.at(s.i))));
  const label = (r, j) => hasLabels ? r.at(0).text : String(j + 1);
  const over = head && hasLabels ? head.at(0).text : '';
  const out = below.filter(r => !hasLabels || r.at(0).text !== '').flatMap(r => all.map(s => r.at(s.i))).filter(c => !isNumber(c) && c.text !== '').length;
  const said = chartWords.at(0), form = Object.entries(said).find(e => e.at(0) === new Intl.PluralRules(said.locale).select(out));
  const note = out === 0 ? '' : (form ? form.at(1) : said.other).split('#').join(out.toLocaleString(said.locale));
  const gray = 'var(--text-secondary)';
  const ends = body.length ? label(body.at(0), 0) + ' – ' + label(body.at(-1), body.length - 1) : '';
  const named = all.filter(s => s.name !== '').map(s => s.name);
  const title = (named.length > 1 ? named.slice(0, -1).join(', ') + ' and ' + named.at(-1) : named.join('')) + (named.length && over !== '' ? ' by ' + over : '');
  const sample = body.flatMap(r => all.map(s => r.at(s.i))).find(isNumber);
  const isPercent = !!sample && sample.text.endsWith('%'), sign = sample && ['$', '€', '£', '¥'].find(m => sample.text.startsWith(m) || sample.text.startsWith('-' + m)) || '';
  const round = (v, s) => (Math.round(v * 10) / 10).toLocaleString('en-US') + s;
  const plain = (v, places) => { const a = Math.abs(v); return a >= 1e9 ? round(v / 1e9, 'B') : a >= 1e6 ? round(v / 1e6, 'M') : a >= 1e4 ? round(v / 1e3, 'K') : v.toLocaleString('en-US', {maximumFractionDigits: places}); };
  const short = (v, places) => isPercent ? plain(v * 100, Math.max(0, places - 2)) + '%' : (v < 0 ? '-' : '') + sign + plain(Math.abs(v), places);
  const [off, setOff] = useState([]);
  const hasLegend = all.length > 1 && named.length === all.length;
  const legendAt = k => all.slice(0, k).reduce((a, b) => a + 36 + 7 * b.tag.length, 16);
  const scale = Math.max(1, Math.max(320, hasLegend ? legendAt(all.length) : 0) / wide, 200 / high), W = wide * scale, H = high * scale;
  const series = all.filter(s => !off.includes(s.i));
  const num = (r, s) => isNumber(r.at(s.i)) ? r.at(s.i).value : 0;
  const least = Math.min(0, ...body.flatMap(r => series.map(s => num(r, s)))), most = Math.max(0, ...body.flatMap(r => series.map(s => num(r, s)))) || (least < 0 ? 0 : 1);
  const span = most - least, p = 10 ** Math.floor(Math.log10(span / 4)), step = p * [1, 2, 2.5, 5, 10].find(m => m * p * 4 >= span);
  const ticks = Array.from({length: Math.ceil(most / step) - Math.floor(least / step) + 1}, (_, n) => (Math.floor(least / step) + n) * step);
  const places = Math.min(8, Math.max(0, 1 - Math.floor(Math.log10(step))));
  const drop = note === '' ? 0 : title === '' ? 30 : 18, y0 = (title === '' ? 20 : 52) + drop, foot = hasLegend ? 64 : 34.5;
  const printed = (r, s) => r.at(s.i).text.length <= 7 ? r.at(s.i).text : short(num(r, s), places);
  const roomy = (W - 32) / Math.max(1, body.length);
  const prints = all.length === 1 && series.length === 1 && body.every(r => !isNumber(r.at(all.at(0).i)) || 7 * printed(r, all.at(0)).length + 4 <= roomy);
  const left = prints ? 16 : 24 + 7.5 * Math.max(...ticks.map(t => short(t, places).length)), w = W - 16 - left, h = H - y0 - foot - (prints && least < 0 ? 16 : 0) - (prints ? 12 : 0), lift = prints ? 12 : 0, y = v => y0 + lift + h - h * (v - ticks.at(0)) / (ticks.at(-1) - ticks.at(0));
  const band = w / Math.max(1, body.length);
  const longest = 7 * Math.max(0, ...body.map((r, j) => label(r, j).length)), every = Math.ceil((longest + 8) / band);
  const thick = Math.max(1, Math.min(20, (band * 0.75 + 2) / Math.max(1, series.length) - 2));
  const lies = all.length === 1 && series.length === 1 && least === 0 && every > 1 && body.length <= Math.floor((H - y0 + drop - 16) / 22);
  const bar = (x, v, thick) => { const t = Math.abs(y(0) - y(v)), q = Math.min(4, thick / 4, t), up = v < 0 ? 1 : -1; return 'M' + x + ' ' + y(0) + 'v' + up * (t - q) + 'a' + q + ' ' + q + ' 0 0 ' + (v < 0 ? 0 : 1) + ' ' + q + ' ' + up * q + 'h' + (thick - 2 * q) + 'a' + q + ' ' + q + ' 0 0 ' + (v < 0 ? 0 : 1) + ' ' + q + ' ' + -up * q + 'v' + -up * (t - q) + 'z'; };
  const tips = body.length * series.length <= 400;
  if (lies) { const s = all.at(0), cut = t => t.length > 24 ? t.slice(0, 23) + '…' : t, names = 7 * Math.max(...body.map((r, j) => cut(label(r, j)).length)) + 8, row = (H - y0 - 16) / body.length, tall = Math.min(20, row - 6), far = W - 32 - names - 7 * Math.max(...body.map(r => isNumber(r.at(s.i)) ? printed(r, s).length : 0)) - 6, x0 = 16 + names;
    return <svg width='480' height='280' viewBox={'0 0 ' + W + ' ' + H} role='img' aria-label={[title || ends, note].filter(t => t !== '').join('. ')} fontSize='12'>
      {title !== '' && <text x='16' y='27' fontSize='14' fontWeight='500' fill='var(--text-primary)'>{fit(title, W - 32)}</text>}
      {note !== '' && <text x='16' y={title === '' ? 27 : 46} fill={gray}>{fit(note, (W - 32) * 7.5 / 6.5)}</text>}
      <line x1={x0} x2={x0} y1={y0} y2={H - 16} stroke='var(--chart-axis)'/>
      {body.map((r, j) => { const v = num(r, s), long = far * v / (most || 1), q = Math.min(4, tall / 4, long), at = y0 + j * row + (row - tall) / 2; return <g key={j}><text x={x0 - 8} y={at + tall / 2 + 4} textAnchor='end' fill={gray}>{cut(label(r, j))}</text>{isNumber(r.at(s.i)) && <Tooltip content={label(r, j)} detail={r.at(s.i).text}><path d={'M' + x0 + ' ' + at + 'h' + (long - q) + 'a' + q + ' ' + q + ' 0 0 1 ' + q + ' ' + q + 'v' + (tall - 2 * q) + 'a' + q + ' ' + q + ' 0 0 1 ' + -q + ' ' + q + 'h' + -(long - q) + 'z'} fill={s.hue}/></Tooltip>}{isNumber(r.at(s.i)) && <text x={x0 + long + 6} y={at + tall / 2 + 4} fill='var(--text-primary)'>{printed(r, s)}</text>}</g>; })}
    </svg>; }
  return <svg width='480' height='280' viewBox={'0 0 ' + W + ' ' + H} role='img' aria-label={[title || ends, note].filter(t => t !== '').join('. ')} fontSize='12'>
    {title !== '' && <text x='16' y='27' fontSize='14' fontWeight='500' fill='var(--text-primary)'>{fit(title, W - 32)}</text>}
    {note !== '' && <text x='16' y={title === '' ? 27 : 46} fill={gray}>{fit(note, (W - 32) * 7.5 / 6.5)}</text>}
    {hasLegend && all.map((s, k) => <g key={s.i} opacity={off.includes(s.i) ? 0.4 : 1} onClick={() => setOff(o => o.includes(s.i) ? o.filter(n => n !== s.i) : [...o, s.i])}><rect x={legendAt(k) - 4} y={H - 35} width={28 + 7 * s.tag.length} height='24' fill='transparent'/><rect x={legendAt(k)} y={H - 27.5} width='10' height='10' rx='2' fill={s.hue}/><text x={legendAt(k) + 16} y={H - 18.5} fill={gray}>{s.tag}</text></g>)}
    {prints ? <line x1={left} x2={W - 16} y1={y(0)} y2={y(0)} stroke='var(--chart-axis)'/> : ticks.map(t => <g key={t}><line x1={left} x2={W - 16} y1={y(t)} y2={y(t)} stroke={t ? 'var(--chart-grid)' : 'var(--chart-axis)'}/><text x={left - 8} y={y(t) + 4} textAnchor='end' fill={gray}>{short(t, places)}</text></g>)}
    {body.map((r, j) => <g key={j}>{series.map((s, k) => { const x = left + j * band + (band + 2) / 2 + (k - series.length / 2) * (thick + 2), v = num(r, s); if (!isNumber(r.at(s.i))) return null; const value = prints && <text x={x + thick / 2} y={v < 0 ? y(v) + 14 : y(v) - 5} textAnchor='middle' fill='var(--text-primary)'>{printed(r, s)}</text>; return tips ? <g key={s.i}><Tooltip content={label(r, j) + (s.name === '' ? '' : ', ' + s.name)} detail={r.at(s.i).text}><path d={bar(x, v, thick)} fill={s.hue}/></Tooltip>{value}</g> : <g key={s.i}><path d={bar(x, v, thick)} fill={s.hue}/>{value}</g>; })}</g>)}
    {body.map((r, j) => j % every === 0 && j * band + (every > 1 ? longest : 0) <= w && <text key={j} x={left + j * band + (every > 1 ? 0 : band / 2)} y={H - foot + 16} textAnchor={every > 1 ? 'start' : 'middle'} fill={gray}>{label(r, j)}</text>)}
  </svg>;
}}</sheet.Visualize>;`,
  stackedBar: `export default () => <sheet.Visualize data-component='stacked-bars' sources={{rows: {kind: 'ref', ref: 'input/rows', adapter: {kind: 'cells'}}, chartSize: {kind: 'data', data: [{width: 480, height: 280}]}, chartWords: {kind: 'data', data: [{locale: 'en-US', one: '# value isn’t a number and isn’t shown', other: '# values aren’t numbers and aren’t shown'}]}}}>{({rows, chartSize, chartWords}) => {
  const wide = chartSize.at(0).width, high = chartSize.at(0).height;
  const isNumber = c => typeof c.value === 'number';
  const isFilled = r => r.some(c => c.text !== '');
  const fit = (t, room) => 7.5 * t.length > room ? t.slice(0, Math.max(1, Math.floor(room / 7.5) - 1)) + '…' : t;
  const seen = rows.slice(0, 100).filter(isFilled);
  const hasHead = seen.length > 1 && !seen.at(0).some(isNumber);
  const head = hasHead ? seen.at(0) : null, probe = hasHead ? seen.slice(1) : seen, below = rows.filter(isFilled).slice(hasHead ? 1 : 0);
  const width = probe.length ? probe.at(0).length : 0;
  const isYear = c => isNumber(c) && Number.isInteger(c.value) && c.value > 1800 && c.value < 2200;
  const hasLabels = width > 1 && (!probe.some(r => isNumber(r.at(0))) || probe.every(r => isYear(r.at(0))));
  const all = Array.from({length: width}, (_, i) => i).filter(i => i >= (hasLabels ? 1 : 0) && probe.some(r => isNumber(r.at(i)))).map((i, k) => ({i, name: head ? head.at(i).text : '', tag: head ? fit(head.at(i).text, 135) : '', hue: 'var(--chart-categorical-' + (k % 8 + 1) + ')'}));
  const body = below.filter(r => hasLabels ? r.at(0).text !== '' : all.some(s => isNumber(r.at(s.i))));
  const label = (r, j) => hasLabels ? r.at(0).text : String(j + 1);
  const over = head && hasLabels ? head.at(0).text : '';
  const out = below.filter(r => !hasLabels || r.at(0).text !== '').flatMap(r => all.map(s => r.at(s.i))).filter(c => !isNumber(c) && c.text !== '').length;
  const said = chartWords.at(0), form = Object.entries(said).find(e => e.at(0) === new Intl.PluralRules(said.locale).select(out));
  const note = out === 0 ? '' : (form ? form.at(1) : said.other).split('#').join(out.toLocaleString(said.locale));
  const gray = 'var(--text-secondary)';
  const ends = body.length ? label(body.at(0), 0) + ' – ' + label(body.at(-1), body.length - 1) : '';
  const named = all.filter(s => s.name !== '').map(s => s.name);
  const title = (named.length > 1 ? named.slice(0, -1).join(', ') + ' and ' + named.at(-1) : named.join('')) + (named.length && over !== '' ? ' by ' + over : '');
  const sample = body.flatMap(r => all.map(s => r.at(s.i))).find(isNumber);
  const isPercent = !!sample && sample.text.endsWith('%'), sign = sample && ['$', '€', '£', '¥'].find(m => sample.text.startsWith(m) || sample.text.startsWith('-' + m)) || '';
  const round = (v, s) => (Math.round(v * 10) / 10).toLocaleString('en-US') + s;
  const plain = (v, places) => { const a = Math.abs(v); return a >= 1e9 ? round(v / 1e9, 'B') : a >= 1e6 ? round(v / 1e6, 'M') : a >= 1e4 ? round(v / 1e3, 'K') : v.toLocaleString('en-US', {maximumFractionDigits: places}); };
  const short = (v, places) => isPercent ? plain(v * 100, Math.max(0, places - 2)) + '%' : (v < 0 ? '-' : '') + sign + plain(Math.abs(v), places);
  const [off, setOff] = useState([]);
  const hasLegend = all.length > 1 && named.length === all.length;
  const legendAt = k => all.slice(0, k).reduce((a, b) => a + 36 + 7 * b.tag.length, 16);
  const scale = Math.max(1, Math.max(320, hasLegend ? legendAt(all.length) : 0) / wide, 200 / high), W = wide * scale, H = high * scale;
  const series = all.filter(s => !off.includes(s.i));
  const num = (r, s) => isNumber(r.at(s.i)) ? Math.max(0, r.at(s.i).value) : 0;
  const least = Math.min(0, 0), most = Math.max(0, ...body.map(r => series.reduce((a, s) => a + num(r, s), 0))) || (least < 0 ? 0 : 1);
  const span = most - least, p = 10 ** Math.floor(Math.log10(span / 4)), step = p * [1, 2, 2.5, 5, 10].find(m => m * p * 4 >= span);
  const ticks = Array.from({length: Math.ceil(most / step) - Math.floor(least / step) + 1}, (_, n) => (Math.floor(least / step) + n) * step);
  const places = Math.min(8, Math.max(0, 1 - Math.floor(Math.log10(step))));
  const drop = note === '' ? 0 : title === '' ? 30 : 18, y0 = (title === '' ? 20 : 52) + drop, foot = hasLegend ? 64 : 34.5;
  const left = 24 + 7.5 * Math.max(...ticks.map(t => short(t, places).length)), w = W - 16 - left, h = H - y0 - foot, y = v => y0 + h - h * (v - ticks.at(0)) / (ticks.at(-1) - ticks.at(0));
  const band = w / Math.max(1, body.length);
  const longest = 7 * Math.max(0, ...body.map((r, j) => label(r, j).length)), every = Math.ceil((longest + 8) / band);
  const thick = Math.max(1, Math.min(20, band * 0.75));
  const tips = body.length * series.length <= 400;
  const part = (x, from, to, onAxis) => { const t = Math.max(0, y(from) - y(to) - (onAxis ? 0 : 1)), q = Math.min(4, thick / 4, t / 2), b = onAxis ? 0 : q, at = y(from) - (onAxis ? 0 : 1); return 'M' + (x + b) + ' ' + at + 'a' + b + ' ' + b + ' 0 0 1 ' + -b + ' ' + -b + 'v' + -(t - q - b) + 'a' + q + ' ' + q + ' 0 0 1 ' + q + ' ' + -q + 'h' + (thick - 2 * q) + 'a' + q + ' ' + q + ' 0 0 1 ' + q + ' ' + q + 'v' + (t - q - b) + 'a' + b + ' ' + b + ' 0 0 1 ' + -b + ' ' + b + 'z'; };
  return <svg width='480' height='280' viewBox={'0 0 ' + W + ' ' + H} role='img' aria-label={[title || ends, note].filter(t => t !== '').join('. ')} fontSize='12'>
    {title !== '' && <text x='16' y='27' fontSize='14' fontWeight='500' fill='var(--text-primary)'>{fit(title, W - 32)}</text>}
    {note !== '' && <text x='16' y={title === '' ? 27 : 46} fill={gray}>{fit(note, (W - 32) * 7.5 / 6.5)}</text>}
    {hasLegend && all.map((s, k) => <g key={s.i} opacity={off.includes(s.i) ? 0.4 : 1} onClick={() => setOff(o => o.includes(s.i) ? o.filter(n => n !== s.i) : [...o, s.i])}><rect x={legendAt(k) - 4} y={H - 35} width={28 + 7 * s.tag.length} height='24' fill='transparent'/><rect x={legendAt(k)} y={H - 27.5} width='10' height='10' rx='2' fill={s.hue}/><text x={legendAt(k) + 16} y={H - 18.5} fill={gray}>{s.tag}</text></g>)}
    {ticks.map(t => <g key={t}><line x1={left} x2={W - 16} y1={y(t)} y2={y(t)} stroke={t ? 'var(--chart-grid)' : 'var(--chart-axis)'}/><text x={left - 8} y={y(t) + 4} textAnchor='end' fill={gray}>{short(t, places)}</text></g>)}
    {body.map((r, j) => <g key={j}>{series.map((s, k) => { const under = series.slice(0, k).reduce((a, b) => a + num(r, b), 0); if (!(num(r, s) > 0)) return null; const d = part(left + j * band + (band - thick) / 2, under, under + num(r, s), under === 0); return tips ? <Tooltip key={s.i} content={label(r, j) + (s.name === '' ? '' : ', ' + s.name)} detail={r.at(s.i).text}><path d={d} fill={s.hue}/></Tooltip> : <path key={s.i} d={d} fill={s.hue}/>; })}</g>)}
    {body.map((r, j) => j % every === 0 && j * band + (every > 1 ? longest : 0) <= w && <text key={j} x={left + j * band + (every > 1 ? 0 : band / 2)} y={y0 + h + 16} textAnchor={every > 1 ? 'start' : 'middle'} fill={gray}>{label(r, j)}</text>)}
  </svg>;
}}</sheet.Visualize>;`,
  line: `export default () => <sheet.Visualize data-component='lines' sources={{rows: {kind: 'ref', ref: 'input/rows', adapter: {kind: 'cells'}}, chartSize: {kind: 'data', data: [{width: 480, height: 280}]}, chartWords: {kind: 'data', data: [{locale: 'en-US', one: '# value isn’t a number and isn’t shown', other: '# values aren’t numbers and aren’t shown'}]}}}>{({rows, chartSize, chartWords}) => {
  const wide = chartSize.at(0).width, high = chartSize.at(0).height;
  const isNumber = c => typeof c.value === 'number';
  const isFilled = r => r.some(c => c.text !== '');
  const fit = (t, room) => 7.5 * t.length > room ? t.slice(0, Math.max(1, Math.floor(room / 7.5) - 1)) + '…' : t;
  const seen = rows.slice(0, 100).filter(isFilled);
  const hasHead = seen.length > 1 && !seen.at(0).some(isNumber);
  const head = hasHead ? seen.at(0) : null, probe = hasHead ? seen.slice(1) : seen, below = rows.filter(isFilled).slice(hasHead ? 1 : 0);
  const width = probe.length ? probe.at(0).length : 0;
  const isYear = c => isNumber(c) && Number.isInteger(c.value) && c.value > 1800 && c.value < 2200;
  const hasLabels = width > 1 && (!probe.some(r => isNumber(r.at(0))) || probe.every(r => isYear(r.at(0))));
  const all = Array.from({length: width}, (_, i) => i).filter(i => i >= (hasLabels ? 1 : 0) && probe.some(r => isNumber(r.at(i)))).map((i, k) => ({i, name: head ? head.at(i).text : '', tag: head ? fit(head.at(i).text, 135) : '', hue: 'var(--chart-categorical-' + (k % 8 + 1) + ')'}));
  const body = below.filter(r => hasLabels ? r.at(0).text !== '' : all.some(s => isNumber(r.at(s.i))));
  const label = (r, j) => hasLabels ? r.at(0).text : String(j + 1);
  const over = head && hasLabels ? head.at(0).text : '';
  const out = below.filter(r => !hasLabels || r.at(0).text !== '').flatMap(r => all.map(s => r.at(s.i))).filter(c => !isNumber(c) && c.text !== '').length;
  const said = chartWords.at(0), form = Object.entries(said).find(e => e.at(0) === new Intl.PluralRules(said.locale).select(out));
  const note = out === 0 ? '' : (form ? form.at(1) : said.other).split('#').join(out.toLocaleString(said.locale));
  const gray = 'var(--text-secondary)';
  const ends = body.length ? label(body.at(0), 0) + ' – ' + label(body.at(-1), body.length - 1) : '';
  const named = all.filter(s => s.name !== '').map(s => s.name);
  const title = (named.length > 1 ? named.slice(0, -1).join(', ') + ' and ' + named.at(-1) : named.join('')) + (named.length && over !== '' ? ' by ' + over : '');
  const sample = body.flatMap(r => all.map(s => r.at(s.i))).find(isNumber);
  const isPercent = !!sample && sample.text.endsWith('%'), sign = sample && ['$', '€', '£', '¥'].find(m => sample.text.startsWith(m) || sample.text.startsWith('-' + m)) || '';
  const round = (v, s) => (Math.round(v * 10) / 10).toLocaleString('en-US') + s;
  const plain = (v, places) => { const a = Math.abs(v); return a >= 1e9 ? round(v / 1e9, 'B') : a >= 1e6 ? round(v / 1e6, 'M') : a >= 1e4 ? round(v / 1e3, 'K') : v.toLocaleString('en-US', {maximumFractionDigits: places}); };
  const short = (v, places) => isPercent ? plain(v * 100, Math.max(0, places - 2)) + '%' : (v < 0 ? '-' : '') + sign + plain(Math.abs(v), places);
  const [off, setOff] = useState([]);
  const hasLegend = all.length > 1 && named.length === all.length;
  const legendAt = k => all.slice(0, k).reduce((a, b) => a + 36 + 7 * b.tag.length, 16);
  const scale = Math.max(1, Math.max(320, hasLegend ? legendAt(all.length) : 0) / wide, 200 / high), W = wide * scale, H = high * scale;
  const series = all.filter(s => !off.includes(s.i));
  const num = (r, s) => isNumber(r.at(s.i)) ? r.at(s.i).value : 0;
  const least = Math.min(0, ...body.flatMap(r => series.map(s => num(r, s)))), most = Math.max(0, ...body.flatMap(r => series.map(s => num(r, s)))) || (least < 0 ? 0 : 1);
  const span = most - least, p = 10 ** Math.floor(Math.log10(span / 4)), step = p * [1, 2, 2.5, 5, 10].find(m => m * p * 4 >= span);
  const ticks = Array.from({length: Math.ceil(most / step) - Math.floor(least / step) + 1}, (_, n) => (Math.floor(least / step) + n) * step);
  const places = Math.min(8, Math.max(0, 1 - Math.floor(Math.log10(step))));
  const drop = note === '' ? 0 : title === '' ? 30 : 18, y0 = (title === '' ? 20 : 52) + drop, foot = hasLegend ? 64 : 34.5;
  const left = 24 + 7.5 * Math.max(...ticks.map(t => short(t, places).length)), w = W - 16 - left, h = H - y0 - foot, y = v => y0 + h - h * (v - ticks.at(0)) / (ticks.at(-1) - ticks.at(0));
  const band = w / Math.max(1, body.length);
  const longest = 7 * Math.max(0, ...body.map((r, j) => label(r, j).length)), every = Math.ceil((longest + 8) / band);
  const at = j => left + j * band + band / 2;
  return <svg width='480' height='280' viewBox={'0 0 ' + W + ' ' + H} role='img' aria-label={[title || ends, note].filter(t => t !== '').join('. ')} fontSize='12'>
    {title !== '' && <text x='16' y='27' fontSize='14' fontWeight='500' fill='var(--text-primary)'>{fit(title, W - 32)}</text>}
    {note !== '' && <text x='16' y={title === '' ? 27 : 46} fill={gray}>{fit(note, (W - 32) * 7.5 / 6.5)}</text>}
    {hasLegend && all.map((s, k) => <g key={s.i} opacity={off.includes(s.i) ? 0.4 : 1} onClick={() => setOff(o => o.includes(s.i) ? o.filter(n => n !== s.i) : [...o, s.i])}><rect x={legendAt(k) - 4} y={H - 35} width={28 + 7 * s.tag.length} height='24' fill='transparent'/><rect x={legendAt(k)} y={H - 27.5} width='10' height='10' rx='2' fill={s.hue}/><text x={legendAt(k) + 16} y={H - 18.5} fill={gray}>{s.tag}</text></g>)}
    {ticks.map(t => <g key={t}><line x1={left} x2={W - 16} y1={y(t)} y2={y(t)} stroke={t ? 'var(--chart-grid)' : 'var(--chart-axis)'}/><text x={left - 8} y={y(t) + 4} textAnchor='end' fill={gray}>{short(t, places)}</text></g>)}
    {series.map(s => { const points = body.map((r, j) => ({r, j})).filter(o => isNumber(o.r.at(s.i))), last = points.at(-1); return <g key={s.i}><path d={points.map((o, n) => (n ? 'L' : 'M') + at(o.j) + ' ' + y(num(o.r, s))).join('')} fill='none' stroke={s.hue} strokeWidth='2' strokeLinejoin='round' strokeLinecap='round'/>{last && <circle cx={at(last.j)} cy={y(num(last.r, s))} r='4' fill={s.hue}/>}</g>; })}
    {body.length <= 400 && body.map((r, j) => <Tooltip key={j} content={label(r, j)} detail={series.filter(s => isNumber(r.at(s.i))).map(s => (s.name === '' ? '' : s.name + ' ') + r.at(s.i).text).join(', ')}><rect x={left + j * band} y={y0} width={band} height={h} fill='transparent'/></Tooltip>)}
    {body.map((r, j) => j % every === 0 && j * band + (every > 1 ? longest : 0) <= w && <text key={j} x={left + j * band + (every > 1 ? 0 : band / 2)} y={y0 + h + 16} textAnchor={every > 1 ? 'start' : 'middle'} fill={gray}>{label(r, j)}</text>)}
  </svg>;
}}</sheet.Visualize>;`,
  pie: `export default () => <sheet.Visualize data-component='a-ring' sources={{rows: {kind: 'ref', ref: 'input/rows', adapter: {kind: 'cells'}}, chartSize: {kind: 'data', data: [{width: 480, height: 280}]}, chartWords: {kind: 'data', data: [{locale: 'en-US', one: '# value isn’t a number and isn’t shown', other: '# values aren’t numbers and aren’t shown'}]}}}>{({rows, chartSize, chartWords}) => {
  const wide = chartSize.at(0).width, high = chartSize.at(0).height;
  const isNumber = c => typeof c.value === 'number';
  const isFilled = r => r.some(c => c.text !== '');
  const seen = rows.slice(0, 100).filter(isFilled);
  const hasHead = seen.length > 1 && !seen.at(0).some(isNumber);
  const head = hasHead ? seen.at(0) : null, probe = hasHead ? seen.slice(1) : seen, below = rows.filter(isFilled).slice(hasHead ? 1 : 0);
  const width = probe.length ? probe.at(0).length : 0;
  const isYear = c => isNumber(c) && Number.isInteger(c.value) && c.value > 1800 && c.value < 2200;
  const hasLabels = width > 1 && (!probe.some(r => isNumber(r.at(0))) || probe.every(r => isYear(r.at(0))));
  const all = Array.from({length: width}, (_, i) => i).filter(i => i >= (hasLabels ? 1 : 0) && probe.some(r => isNumber(r.at(i)))).map((i, k) => ({i, name: head ? head.at(i).text : '', hue: 'var(--chart-categorical-' + (k % 8 + 1) + ')'}));
  const body = below.filter(r => hasLabels ? r.at(0).text !== '' : all.some(s => isNumber(r.at(s.i))));
  const label = (r, j) => hasLabels ? r.at(0).text : String(j + 1);
  const over = head && hasLabels ? head.at(0).text : '';
  const out = below.filter(r => !hasLabels || r.at(0).text !== '').flatMap(r => all.slice(0, 1).map(s => r.at(s.i))).filter(c => !isNumber(c) && c.text !== '').length;
  const said = chartWords.at(0), form = Object.entries(said).find(e => e.at(0) === new Intl.PluralRules(said.locale).select(out));
  const note = out === 0 ? '' : (form ? form.at(1) : said.other).split('#').join(out.toLocaleString(said.locale));
  const gray = 'var(--text-secondary)';
  const fit = (t, room) => 7.5 * t.length > room ? t.slice(0, Math.max(1, Math.floor(room / 7.5) - 1)) + '…' : t;
  const ends = body.length ? label(body.at(0), 0) + ' – ' + label(body.at(-1), body.length - 1) : '';
  const first = all.at(0), num = r => first && isNumber(r.at(first.i)) ? Math.max(0, r.at(first.i).value) : 0;
  const only = first ? first.name + (first.name !== '' && over !== '' ? ' by ' + over : '') : '';
  const cut = t => t.length > 16 ? t.slice(0, 15) + '…' : t;
  const parts = body.map((r, j) => ({name: cut(label(r, j)), whole: label(r, j), text: first ? r.at(first.i).text : '', v: num(r)})).filter(o => o.v > 0).map((o, k) => ({...o, hue: 'var(--chart-categorical-' + (k % 8 + 1) + ')'}));
  const total = parts.reduce((a, b) => a + b.v, 0) || 1;
  const words = 7 * Math.max(0, ...parts.map(o => o.name.length + o.text.length + 1));
  const scale = Math.max(1, Math.max(320, 2 * words + 152) / wide, 200 / high), W = wide * scale, H = high * scale;
  const y0 = (only === '' ? 16 : 44) + (note === '' ? 0 : only === '' ? 30 : 18), R = Math.max(30, Math.min((W - 32 - 2 * words - 24) / 2, (H - y0 - 16 - 28) / 2)), cx = W / 2, cy = y0 + 14 + (H - y0 - 16 - 28) / 2;
  const turn = k => parts.slice(0, k).reduce((a, b) => a + b.v, 0) / total * 2 * Math.PI - Math.PI / 2;
  const on = (a, r) => (cx + r * Math.cos(a)) + ' ' + (cy + r * Math.sin(a));
  return <svg width='480' height='280' viewBox={'0 0 ' + W + ' ' + H} role='img' aria-label={[only || ends, note].filter(t => t !== '').join('. ')} fontSize='12'>
    {only !== '' && <text x='16' y='27' fontSize='14' fontWeight='500' fill='var(--text-primary)'>{fit(only, W - 32)}</text>}
    {note !== '' && <text x='16' y={only === '' ? 27 : 46} fill={gray}>{fit(note, (W - 32) * 7.5 / 6.5)}</text>}
    {parts.map((o, k) => { const a = turn(k), z = turn(k + 1) - (parts.length === 1 ? 0.0001 : 0), big = z - a > Math.PI ? 1 : 0, mid = (a + z) / 2, right = Math.cos(mid) >= 0; return <g key={k}><Tooltip content={o.whole} detail={o.text}><path d={'M' + on(a, R) + 'A' + R + ' ' + R + ' 0 ' + big + ' 1 ' + on(z, R) + 'L' + on(z, R * 0.6) + 'A' + R * 0.6 + ' ' + R * 0.6 + ' 0 ' + big + ' 0 ' + on(a, R * 0.6) + 'z'} fill={o.hue} stroke='var(--bg-primary)' strokeWidth='1'/></Tooltip><text x={cx + (R + 10) * Math.cos(mid)} y={cy + (R + 10) * Math.sin(mid) + 4} textAnchor={right ? 'start' : 'end'} fill={gray}>{o.name + ' ' + o.text}</text></g>; })}
  </svg>;
}}</sheet.Visualize>;`,
};
