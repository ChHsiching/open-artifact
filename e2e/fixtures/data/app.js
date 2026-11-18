window.fx = {
  money: d3.format('$,.0f'),
  pct: d3.format('+.0%'),
  target: 17800,
};

dash.calc('growth', {
  title: 'Signup growth',
  description: 'Latest month against the month before.',
  inputs: ['signups'],
  fn: (signups) => {
    const rows = signups.slice(-2).map(r => Number(r.signups));
    return rows.length === 2 ? rows[1] / rows[0] - 1 : null;
  },
});

dash.calc('revenue_total', {
  title: 'Revenue total',
  description: 'Sum of revenue over the rows shown.',
  inputs: ['orders'],
  fn: (orders) => d3.sum(orders, r => Number(r.revenue)),
});

dash.loader('tickets', {
  description: 'One ticket per block: id | status | title.',
  fn: ({ items }) => items.filter(i => typeof i === 'string' && i.startsWith('T-')).map(i => {
    const [id, status, title] = i.split(' | ');
    return { id, status, title };
  }),
});

function showTab(name) {
  for (const page of document.querySelectorAll('[data-tab-page]')) page.hidden = page.dataset.tabPage !== name;
  for (const tab of document.querySelectorAll('[data-tab]')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
}
for (const tab of document.querySelectorAll('[data-tab]')) {
  tab.addEventListener('click', () => { showTab(tab.dataset.tab); dash.setLink(tab.dataset.tab); });
}
showTab(location.hash.slice(1) || 'revenue');
for (const button of document.querySelectorAll('#clear-filters')) button.addEventListener('click', () => dash.resetParams());

dash.draw('latest', el => {
  const d = dash.data('signups');
  const row = d.status === 'ok' ? d.data.find(r => r.month === '2026-10') : null;
  el.textContent = row ? row.signups : '—';
});

dash.draw('growth', el => {
  const g = dash.data('growth');
  el.textContent = g.status === 'ok' && g.data !== null ? fx.pct(g.data) : '—';
});

dash.draw('region', sel => {
  const g = dash.data('regions');
  sel.replaceChildren(new Option('All regions', ''), ...(g.status === 'ok' ? g.data : []).map(r => new Option(r.region)));
  sel.value = dash.params().region ?? '';
  sel.onchange = () => dash.setParams({ region: sel.value });
});

dash.draw('revenue-total', el => {
  const t = dash.data('revenue_total');
  el.textContent = t.status === 'ok' ? fx.money(t.data) : '—';
});

dash.draw('target-total', el => {
  const g = dash.data('regions');
  el.textContent = g.status === 'ok' ? fx.money(d3.sum(g.data, r => Number(r.target))) : '—';
});

dash.draw('orders-rows', body => {
  const d = dash.data('orders');
  body.replaceChildren();
  if (d.status !== 'ok') return;
  for (const row of d.data) {
    const tr = document.createElement('tr');
    tr.dataset.key = row.month;
    for (const key of ['region', 'month', 'revenue', 'orders']) {
      const td = document.createElement('td');
      td.textContent = key === 'revenue' ? fx.money(Number(row[key])) : row[key];
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
});

function barChart(el, rows, { x, y, color, onPick }) {
  el.replaceChildren();
  const width = el.clientWidth || 600;
  const height = 220;
  const margin = { top: 10, right: 10, bottom: 28, left: 48 };
  const sx = d3.scaleBand().domain(rows.map(x)).range([margin.left, width - margin.right]).padding(0.2);
  const sy = d3.scaleLinear().domain([0, d3.max(rows, y) || 1]).nice().range([height - margin.bottom, margin.top]);
  const svg = d3.select(el).append('svg').attr('width', width).attr('height', height).attr('aria-label', 'Bar chart');
  svg.append('g').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(sx));
  svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(sy).ticks(4));
  const tip = d3.select(el).append('div').attr('class', 'fx-tip').style('opacity', 0);
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', d => sx(x(d))).attr('width', sx.bandwidth())
    .attr('y', d => sy(y(d))).attr('height', d => sy(0) - sy(y(d)))
    .attr('fill', color)
    .on('pointermove', (event, d) => {
      const [px, py] = d3.pointer(event, el);
      tip.style('opacity', 1).style('left', `${px + 8}px`).style('top', `${py - 24}px`).text(`${x(d)}: ${y(d)}`);
    })
    .on('pointerleave', () => tip.style('opacity', 0))
    .on('click', (event, d) => onPick?.(d));
}

dash.draw('revenue-chart', el => {
  const d = dash.data('orders');
  if (d.status !== 'ok') { el.textContent = '—'; return; }
  const byMonth = d3.rollups(d.data, v => d3.sum(v, r => Number(r.revenue)), r => r.month).map(([month, revenue]) => ({ month, revenue }));
  barChart(el, byMonth, { x: r => r.month, y: r => r.revenue, color: dash.colors[0] });
});

window.fx.picked = null;
dash.draw('signups-chart', el => {
  const d = dash.data('signups');
  if (d.status !== 'ok') { el.textContent = '—'; return; }
  barChart(el, d.data, { x: r => r.month, y: r => Number(r.signups), color: dash.colors[1], onPick: r => { fx.picked = r.month; dash.draw('picked'); } });
});

dash.draw('picked', el => { el.textContent = fx.picked ?? '—'; });

dash.draw('tickets', list => {
  const d = dash.data('tickets');
  list.replaceChildren();
  if (d.status !== 'ok') return;
  for (const t of d.data.filter(r => r.status === 'open')) {
    const li = document.createElement('li');
    li.dataset.key = t.id;
    li.textContent = `${t.id}: ${t.title}`;
    list.appendChild(li);
  }
});

dash.draw('broken', el => {
  const d = dash.data('broken');
  el.textContent = d.status === 'ok' ? 'loaded' : d.status;
});
