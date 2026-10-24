'use strict';
// NBA Picks dashboard. Reads data.json (built from preview/review/learnings markdown + Polymarket Data API). No backend.
const $ = s => document.querySelector(s);
const app = $('#app');
let DATA = null;
const TABS = ['today', 'results', 'track', 'account'];
let saved = localStorage.getItem('tab'); if (saved === 'bets') saved = 'account';
const state = { tab: TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : (TABS.includes(saved) ? saved : 'today'), day: null, rday: null, acctView: null };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const has = v => v !== null && v !== undefined && !(typeof v === 'number' && isNaN(v));
const fmt = (n, d = 1) => !has(n) ? '—' : Number(n).toFixed(d).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
const sgn = (n, d = 1) => !has(n) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n), d);
const money = n => !has(n) ? '—' : (n < 0 ? '−$' : n > 0 ? '+$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = n => !has(n) ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cls = n => !has(n) ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '';
const pct = (w, l) => (w + l) ? Math.round(100 * w / (w + l)) + '%' : '—';
const dayLabel = iso => new Date(iso + 'T12:00:00+08:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' });
const shortDay = iso => new Date(iso + 'T12:00:00+08:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' });
const mytTime = iso => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' MYT';
const clean = s => String(s ?? '').replace(/^\*+\s*/, '').replace(/\*\*/g, '').trim();
const list = items => (items || []).map(clean).filter(x => x && x !== '--');
const getDay = date => DATA.days.find(d => d.date === date);

async function load() {
  try {
    const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    DATA = await r.json();
  } catch (e) { app.innerHTML = '<div class="card">Could not load data (offline and nothing cached yet).</div>'; return; }
  $('#meta').textContent = DATA.generated_at ? 'updated ' + mytTime(DATA.generated_at) : '';
  state.day = DATA.latest_preview_date; state.rday = DATA.latest_review_date;
  render();
}
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  if (!DATA) return;
  ({ today: renderToday, results: renderResults, track: renderTrack, account: renderAccount }[state.tab])();
  installHint();
  window.scrollTo(0, 0);
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; localStorage.setItem('tab', state.tab); history.replaceState(null, '', '#' + state.tab); render(); });

/* shared bits */
function edgeChip(e) {
  if (!has(e)) return '<span class="edge neu">—</span>';
  const c = e >= 3 ? 'val' : e > 0 ? 'lean' : 'neu';
  return `<span class="edge ${c}" title="edge = my win % − Polymarket price">${sgn(e)}</span>`;
}
const dots = n => { if (!has(n)) return ''; let s = '<span class="dots" title="confidence ' + n + '/10">'; for (let i = 1; i <= 10; i++) s += `<i class="${i <= n ? 'on' : ''}"></i>`; return s + '</span>'; };
const fold = (title, inner, open = false, extra = '') => inner ? `<details class="fold card" ${open ? 'open' : ''}><summary><span>${title}</span>${extra}</summary><div class="foldbody">${inner}</div></details>` : '';
const ul = items => { items = list(items); return items.length ? `<ul class="plain">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''; };
const tile = (v, k, c = '', sub = '') => `<div class="tile"><div class="v ${c}">${v}</div><div class="k">${k}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
const daySwitch = (dates, cur, id) => `<div class="pills" id="${id}">${dates.map(d => `<button class="pill ${d === cur ? 'on' : ''}" data-d="${d}">${shortDay(d)}</button>`).join('')}</div>`;
function bindPills(id, fn) { document.querySelectorAll(`#${id} .pill`).forEach(b => b.onclick = () => fn(b.dataset.d)); const on = document.querySelector(`#${id} .pill.on`); on && on.scrollIntoView({ inline: 'center', block: 'nearest' }); }

/* ---------------- TODAY ---------------- */
function betRow(b) {
  const pm = b.polymarket;
  const outcome = pm ? pm.outcome : b.selection;
  const market = pm ? pm.market : (b.matchup || '');
  return `<div class="betrow">
    <div class="br1"><span class="out">${esc(outcome)}</span><span class="buyat">≤ ${fmt(b.price)}¢</span></div>
    <div class="br2"><span>${esc(market)}${pm ? '' : ' <span class="mut">(' + esc(b.selection) + ')</span>'}</span><span class="stake">${has(b.units) ? fmt(b.units, 2) + 'u' : 'stake —'}</span></div>
    ${b.condition ? `<div class="br3">⚠ ${esc(b.condition)}</div>` : ''}
  </div>`;
}
function gameRow(g, day) {
  const avoid = g.avoid && g.avoid.length;
  const buys = day.buys.filter(b => b.game_id === g.id);
  const inj = (g.injury_flags || []).length;
  const r = g.result;
  const icons = [buys.length ? '<span class="ic val" title="value bet">$</span>' : '', inj ? '<span class="ic inj" title="injury news">🩹</span>' : '', avoid ? '<span class="ic avd" title="avoid">⛔</span>' : '', r ? `<span title="result">${r.hit === true ? '✅' : r.hit === false ? '❌' : ''}</span>` : ''].join('');
  const odds = [
    ['Moneyline', g.dk_ml, g.pm_ml], ['Spread', g.spread?.dk, g.spread?.pm], ['Total', g.total?.dk, g.total?.pm]
  ].filter(x => x[1] || x[2]);
  const sec = (t, v) => v ? `<div class="sec"><div class="lbl">${t}</div><p>${esc(clean(v))}</p></div>` : '';
  return `<details class="game ${avoid ? 'avoid' : ''} ${buys.length ? 'hasbet' : ''}">
    <summary>
      <div class="g1"><span class="tm">${esc(g.tip_myt || '')}</span><span class="mu">${esc(g.away.abbr)} <span class="at">@</span> ${esc(g.home.abbr)}</span><span class="icons">${icons}</span>${edgeChip(g.edge)}</div>
      <div class="g2"><span><b>${esc(g.pick ? g.pick.name || g.pick.abbr : '—')}</b> ${has(g.win_pct) ? fmt(g.win_pct) + '%' : ''}</span><span class="mut">PM ${has(g.pm_pick_price) ? fmt(g.pm_pick_price) + '¢' : '—'}</span>${dots(g.confidence)}</div>
    </summary>
    <div class="gbody">
      ${r ? `<div class="sec res-in">${r.hit === true ? '✅' : r.hit === false ? '❌' : ''} <b>Final ${esc(r.final_text || '')}</b><p>${esc(clean(r.reason))}</p></div>` : ''}
      ${buys.length ? `<div class="sec"><div class="lbl">Bet</div>${buys.map(b => `<div class="minibet">${esc(b.polymarket ? b.polymarket.outcome + ' — ' + b.polymarket.market : b.selection)} · ≤${fmt(b.price)}¢${has(b.units) ? ' · ' + fmt(b.units, 2) + 'u' : ''}</div>`).join('')}</div>` : ''}
      ${avoid ? `<div class="sec"><div class="lbl">Why avoid</div>${g.avoid.map(a => `<p>${esc(clean(a))}</p>`).join('')}</div>` : ''}
      ${inj ? `<div class="sec"><div class="lbl">Injury watch</div><div class="chips">${g.injury_flags.map(f => `<span class="chip inj">${esc(f)}</span>`).join('')}</div></div>` : ''}
      ${odds.length ? `<div class="sec"><div class="lbl">Odds</div><table class="odds"><tr><th></th><th>Sportsbook</th><th>Polymarket</th></tr>${odds.map(o => `<tr><td>${o[0]}</td><td>${esc(o[1] || '—')}</td><td>${esc(o[2] || '—')}</td></tr>`).join('')}</table></div>` : ''}
      ${sec('My view', g.view)}${sec('Bet note', g.bet)}${sec('Injuries', g.injuries)}${sec('Form', g.form)}${sec('Sentiment', g.sentiment)}
      <div class="xs mut">${esc(g.away.city)} ${esc(g.away.name)} at ${esc(g.home.city)} ${esc(g.home.name)} · confidence ${g.confidence ?? '—'}/10</div>
    </div>
  </details>`;
}
function renderToday() {
  const day = getDay(state.day) || DATA.days[DATA.days.length - 1];
  if (!day) { app.innerHTML = '<div class="empty">No previews yet.</div>'; return; }
  const S = day.summary || {};
  const games = [...day.games].sort((a, b) => (a.tip_iso || '').localeCompare(b.tip_iso || '') || a.n - b.n);
  const isLatest = day.date === DATA.latest_preview_date;
  app.innerHTML = `
    ${daySwitch(DATA.days.map(d => d.date), day.date, 'tdays')}
    <div class="hdr"><div><div class="h1">${dayLabel(day.date)}</div><div class="xs mut">${games.length} games · times in MYT</div></div>${isLatest ? '' : '<span class="chip">past day</span>'}</div>
    <div class="card bets">
      <div class="ctitle">💰 ${isLatest ? "Tonight's bets" : 'Bets that day'} <span class="mut">${day.buys.length}</span></div>
      ${day.buys.length ? day.buys.map(betRow).join('') : '<div class="empty">No bets — nothing cleared the bar.</div>'}
      <div class="xs mut" style="margin-top:6px">Buy on Polymarket at or below the price shown (preview price). u = units.</div>
    </div>
    <div class="ctitle" style="margin:14px 2px 6px">🏀 Games <span class="mut xs">tap for details · chip = my edge vs Polymarket</span></div>
    <div class="card glist">${games.map(g => gameRow(g, day)).join('')}</div>
    <div class="legend"><span><span class="edge val">+3</span> value</span><span><span class="edge lean">+1</span> slight edge</span><span><span class="edge neu">−2</span> no edge</span><span>⛔ avoid</span><span>🩹 injury news</span></div>
    ${fold('⚠ Check before tip-off', ul(S.check_before), false)}
    ${fold('⭐ Top picks', ul(S.top3))}
    ${fold('🐶 Underdogs worth a look', ul(S.underdogs))}
    ${fold('⛔ Avoid list', ul(S.avoid))}
    ${fold('📚 Lessons applied today', ul(day.lessons_applied))}
    ${fold('📊 Season record (as of this preview)', ul(S.season_record))}`;
  bindPills('tdays', d => { state.day = d; render(); });
}

/* ---------------- RESULTS ---------------- */
function oneLine(reason) {
  let s = clean(reason);
  const m = s.match(/(?:HIT|MISS|✅|❌)[.:,!]?\s*(?:—|-|–)?\s*(.*)$/);
  if (m && m[1]) s = m[1];
  const cut = s.search(/(?<=[a-z0-9)%"”])\.\s/i);
  s = cut > 20 ? s.slice(0, cut + 1) : s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function renderResults() {
  const reviewed = DATA.days.filter(d => d.review);
  const day = getDay(state.rday) || reviewed[reviewed.length - 1];
  if (!day) { app.innerHTML = '<div class="empty">No graded days yet.</div>'; return; }
  const gs = day.games.filter(g => g.result).sort((a, b) => (a.tip_iso || '').localeCompare(b.tip_iso || '') || a.n - b.n);
  const hits = gs.filter(g => g.result.hit === true), miss = gs.filter(g => g.result.hit === false);
  const R = day.review;
  // best call: correct pick with the biggest edge over the market (else the lowest-% correct pick); worst miss: highest-% miss
  const best = [...hits].sort((a, b) => ((b.edge ?? -99) - (a.edge ?? -99)) || ((a.win_pct ?? 99) - (b.win_pct ?? 99)))[0];
  const worst = [...miss].sort((a, b) => (b.win_pct ?? 0) - (a.win_pct ?? 0))[0];
  const gname = g => `${g.pick ? g.pick.name || g.pick.abbr : '?'} ${fmt(g.win_pct)}%`;
  const rt = DATA.season?.record_table || [];
  app.innerHTML = `
    ${daySwitch(reviewed.map(d => d.date), day.date, 'rdays')}
    <div class="card dayhead">
      <div class="h1">${dayLabel(day.date)}</div>
      <div class="tiles t3">
        ${tile(`${hits.length}-${miss.length}`, 'picks right', '', pct(hits.length, miss.length))}
        ${tile(has(R.units) ? sgn(R.units) + 'u' : 'n/a', 'bets (units)', cls(R.units), has(R.units) ? '' : 'not stated')}
        ${tile(R.brier ? fmt(R.brier.me, 3) : '—', 'Brier (me)', '', R.brier ? `market ${fmt(R.brier.pm, 3)}` : '')}
      </div>
      ${best ? `<div class="callout good">🎯 <b>Best call:</b> ${esc(gname(best))}${has(best.edge) ? ` (market ${fmt(best.pm_pick_price)}¢)` : ''} — ${esc(best.result.final_text || '')}</div>` : ''}
      ${worst ? `<div class="callout bad">💥 <b>Worst miss:</b> ${esc(gname(worst))} — ${esc(worst.result.final_text || '')}</div>` : ''}
    </div>
    <div class="card glist">${gs.map(g => {
      const r = g.result;
      return `<details class="rrow ${r.hit === true ? 'hit' : r.hit === false ? 'miss' : ''}">
        <summary><span class="mk">${r.hit === true ? '✅' : r.hit === false ? '❌' : '•'}</span>
          <span class="sc">${esc(r.final_text || g.away.abbr + ' @ ' + g.home.abbr)}</span>
          <span class="pk">picked <b>${esc(g.pick ? g.pick.abbr : '?')}</b> ${fmt(g.win_pct)}%</span></summary>
        <div class="gbody"><p class="lead">${esc(oneLine(r.reason || (r.grades || [])[0] || ''))}</p>
          ${(r.grades || []).map(x => `<p>${esc(clean(x))}</p>`).join('')}${r.notes ? `<p class="mut">${esc(clean(r.notes))}</p>` : ''}</div>
      </details>`; }).join('') || '<div class="empty">No graded games parsed.</div>'}</div>
    ${fold('📝 What I took from the night', ul(R.day_summary))}
    ${fold('📚 Lessons from this review', ul(R.lessons))}
    ${fold('📊 Season record (learnings.md)', `<table><tbody>${rt.map(r => `<tr><td>${esc(r.category)}</td><td class="num"><b>${esc(r.record || '—')}</b></td><td class="num ${cls(r.units)}">${has(r.units) ? sgn(r.units) + 'u' : ''}</td></tr>`).join('')}</tbody></table>`)}
    ${(DATA.parse_warnings || []).length ? fold('⚠ Data notes', DATA.parse_warnings.map(w => `<p class="warn">${esc(w)}</p>`).join('')) : ''}`;
  bindPills('rdays', d => { state.rday = d; render(); });
}

/* ---------------- TRACK ---------------- */
function unitsChart(series) {
  if (!series || !series.length) return '';
  const W = 340, H = 140, P = { l: 8, r: 8, t: 18, b: 22 };
  const vals = [0, ...series.map(s => s.cum)];
  const mn = Math.min(...vals), mx = Math.max(...vals), span = (mx - mn) || 1;
  const n = series.length;
  const x = i => P.l + (n === 1 ? (W - P.l - P.r) / 2 : i * (W - P.l - P.r) / (n - 1));
  const y = v => P.t + (mx - v) / span * (H - P.t - P.b);
  const pts = series.map((s, i) => `${x(i)},${y(s.cum)}`);
  const up = series[n - 1].cum >= 0;
  let s = `<svg viewBox="0 0 ${W} ${H}"><line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" stroke="#30363d" stroke-dasharray="3 3"/>`;
  s += `<polygon points="${x(0)},${y(0)} ${pts.join(' ')} ${x(n - 1)},${y(0)}" fill="${up ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)'}"/>`;
  s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${up ? '#3fb950' : '#f85149'}" stroke-width="3" stroke-linejoin="round"/>`;
  series.forEach((p, i) => {
    s += `<circle cx="${x(i)}" cy="${y(p.cum)}" r="${p.units === null ? 3 : 4.5}" fill="${p.units === null ? '#8b949e' : up ? '#3fb950' : '#f85149'}"/>`;
    s += `<text x="${x(i)}" y="${y(p.cum) - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" style="fill:#e6edf3;font-weight:700">${p.units === null ? 'n/a' : sgn(p.cum)}</text>`;
    s += `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${shortDay(p.date)}</text>`;
  });
  return s + '</svg>';
}
function renderTrack() {
  const T = DATA.track || {}, G = T.glance || {};
  const rec = G.record || {}, l7 = G.last7, st = G.streak;
  const off = (DATA.season?.record_table || []).find(r => /straight/i.test(r.category));
  const B = G.brier;
  const insightRow = i => {
    const p = i.n ? i.w / i.n : 0, tone = p >= 0.6 ? 'pos' : p < 0.5 ? 'neg' : '';
    return `<div class="ins"><div class="it">${esc(i.text)}</div><div class="iv ${tone}"><b>${i.w}/${i.n}</b> hit <span class="mut">${i.pct}%</span></div><div class="bar"><i style="width:${p * 100}%" class="${tone}"></i></div></div>`;
  };
  let brierLine = '';
  if (B && has(B.me) && has(B.pm)) {
    const better = B.me < Math.min(B.pm, B.dk ?? 9);
    brierLine = `<div class="ins"><div class="it">Probability accuracy (Brier, lower = better)</div><div class="iv">${better ? '<span class="pos">I\'m sharper than the market</span>' : '<span class="mut">market slightly sharper</span>'}</div><div class="xs mut">me ${fmt(B.me, 3)} · Polymarket ${fmt(B.pm, 3)} · DraftKings ${fmt(B.dk, 3)} (${B.games ?? '?'} games)</div></div>`;
  }
  const cal = T.calibration || [];
  app.innerHTML = `
    <div class="tiles t2">
      ${tile(`${rec.w ?? 0}-${rec.l ?? 0}`, 'season picks', '', `${rec.pct ?? '—'}% right`)}
      ${tile(has(G.units_total) ? sgn(G.units_total) + 'u' : '—', 'units on bets', cls(G.units_total), `${G.units_days_stated}/${G.units_days_total} days reported`)}
      ${tile(l7 ? `${l7.w}-${l7.l}` : '—', 'last 7 days', '', l7 ? `${has(l7.units) ? sgn(l7.units) + 'u · ' : ''}${l7.days} game days` : '')}
      ${tile(st ? `${st.type}${st.len}` : '—', 'current streak', st ? (st.type === 'W' ? 'pos' : 'neg') : '', st ? `${st.len} ${st.type === 'W' ? 'right' : 'wrong'} in a row` : '')}
    </div>
    <div class="card"><div class="ctitle">Units over time <span class="mut xs">cumulative, from daily reviews</span></div>${unitsChart(G.units_series)}
      ${G.units_days_stated < G.units_days_total ? '<div class="xs mut">Grey dot = that review gave no units figure (counted as nothing, not estimated).</div>' : ''}</div>
    <div class="card"><div class="ctitle">What's working</div>${(G.insights || []).map(insightRow).join('')}${brierLine}</div>
    ${(G.value_bets || []).length ? `<div class="card"><div class="ctitle">Value bets</div>${G.value_bets.map(v => `<div class="ins"><div class="it">${esc(v.category)}</div><div class="iv"><b>${esc(v.record)}</b> ${has(v.units) ? `<span class="${cls(v.units)}">${sgn(v.units)}u</span>` : ''}</div></div>`).join('')}</div>` : ''}
    ${fold('More detail', `
      <div class="lbl">By day</div>
      <table><tr><th>Day</th><th class="num">Picks</th><th class="num">Units</th><th class="num">Brier me/PM</th></tr>${(T.per_day || []).map(d => `<tr><td>${shortDay(d.date)}</td><td class="num">${d.su_w}-${d.su_l}</td><td class="num ${cls(d.units)}">${has(d.units) ? sgn(d.units) : 'n/a'}</td><td class="num">${d.brier ? fmt(d.brier.me, 3) + ' / ' + fmt(d.brier.pm, 3) : '—'}</td></tr>`).join('')}</table>
      <div class="lbl" style="margin-top:12px">Calibration (did my % match reality?)</div>
      <table><tr><th>I said</th><th class="num">Picks</th><th class="num">Avg</th><th class="num">Won</th></tr>${cal.map(c => `<tr><td>${esc(c.bucket)}</td><td class="num">${c.n}</td><td class="num">${fmt(c.avg_pred)}%</td><td class="num ${c.actual >= c.avg_pred ? 'pos' : 'neg'}">${fmt(c.actual)}%</td></tr>`).join('')}</table>
      ${off && rec.w !== undefined && off.record !== `${rec.w}-${rec.l}` ? `<p class="warn">learnings.md says ${esc(off.record)} straight up; the review grades add up to ${rec.w}-${rec.l}. See Results → Data notes.</p>` : ''}`)}
    ${fold(`📚 Active lessons (${(DATA.lessons || []).length})`, (DATA.lessons || []).map(l => `<div class="lesson"><div class="lt">L${esc(l.n)}. ${esc(clean(l.title))}</div>${l.body ? `<div class="lb">${esc(clean(l.body))}</div>` : ''}</div>`).join(''))}`;
}

/* ---------------- MY POLYMARKET ---------------- */
function renderAccount() {
  const A = DATA.my_account || { connected: false };
  if (!A.connected) {
    app.innerHTML = `<div class="card connect">
      <div style="font-size:42px">🔗</div>
      <div class="h1">Connect your Polymarket account</div>
      <p class="mut">Once your Polymarket wallet address is added, this tab updates daily with your real record: wins/losses, net P&amp;L, ROI, open positions and recent settled bets.</p>
      <p class="sm">Where to find it: polymarket.com → your profile → copy the wallet address (starts with <b>0x</b>). It's read-only and public — no login or keys needed.</p>
      ${A.error ? `<p class="warn">${esc(A.error)}</p>` : ''}
    </div>`;
    return;
  }
  const views = ['nba', 'all'].filter(v => A[v]);
  const vk = views.includes(state.acctView) ? state.acctView : (A.default_view || 'all');
  const V = A[vk], S = V.summary;
  const daily = (V.daily || []).slice(-14);
  const dmax = Math.max(1, ...daily.map(d => Math.abs(d.pnl)));
  app.innerHTML = `
    <div class="hdr"><div><div class="h1">My Polymarket</div><div class="xs mut">${esc(A.address_short)} · ${A.fetched_at ? 'synced ' + mytTime(A.fetched_at) : ''}${A.stale ? ' · <span class="warn">stale</span>' : ''}</div></div>
      <div class="seg">${views.map(v => `<button data-v="${v}" class="${v === vk ? 'on' : ''}">${v === 'nba' ? 'NBA' : 'All'}</button>`).join('')}</div></div>
    ${A.error ? `<div class="card warn">${esc(A.error)}</div>` : ''}
    <div class="tiles t2">
      ${tile(`${S.w}-${S.l}`, 'settled W-L', '', pct(S.w, S.l) + ' won')}
      ${tile(money(S.net_pnl), 'net P&L (settled)', cls(S.net_pnl), 'on ' + usd(S.settled_cost) + ' staked')}
      ${tile(has(S.roi_pct) ? sgn(S.roi_pct) + '%' : '—', 'ROI', cls(S.roi_pct))}
      ${tile(String(S.open_count), 'open positions', '', `worth ${usd(S.open_value)} <span class="${cls(S.open_unrealized)}">(${money(S.open_unrealized)})</span>`)}
    </div>
    ${daily.length ? `<div class="card"><div class="ctitle">Daily P&amp;L <span class="mut xs">settled, MYT dates</span></div><div class="dbars">${daily.map(d => `<div class="db"><div class="dbv ${cls(d.pnl)}">${money(d.pnl).replace('.00', '')}</div><div class="dbw"><i class="${d.pnl >= 0 ? 'up' : 'dn'}" style="height:${Math.max(3, 60 * Math.abs(d.pnl) / dmax)}px"></i></div><div class="dbd">${shortDay(d.date)}</div><div class="xs mut">${d.w}-${d.l}</div></div>`).join('')}</div></div>` : ''}
    <div class="card"><div class="ctitle">Open positions <span class="mut">${S.open_count}</span></div>
      ${V.open_positions.length ? V.open_positions.map(p => `<div class="prow"><div class="pt"><b>${esc(p.outcome)}</b> · ${esc(p.title)}</div><div class="pv"><span class="mut">avg ${fmt(p.avg_price * 100)}¢ → now ${fmt(p.cur_price * 100)}¢</span><span>${usd(p.current_value)} <span class="${cls(p.pnl)}">${money(p.pnl)}</span></span></div></div>`).join('') : '<div class="empty">No open positions.</div>'}
      ${S.open_count > V.open_positions.length ? `<div class="xs mut">Showing top ${V.open_positions.length} by value.</div>` : ''}</div>
    <div class="card"><div class="ctitle">Recently settled</div>
      ${V.settled_recent.length ? V.settled_recent.map(s => `<div class="prow"><div class="pt">${s.result === 'won' ? '✅' : s.result === 'lost' ? '❌' : '➖'} <b>${esc(s.outcome)}</b> · ${esc(s.title)}</div><div class="pv"><span class="mut">${s.date ? shortDay(s.date) + ' · ' : ''}avg ${fmt(s.avg_price * 100)}¢ · ${usd(s.cost)}${s.unredeemed ? ' · unclaimed' : ''}</span><span class="${cls(s.pnl)}"><b>${money(s.pnl)}</b></span></div></div>`).join('') : '<div class="empty">Nothing settled yet.</div>'}</div>
    <div class="xs mut" style="margin:4px 4px 16px">${has(A.portfolio_value) ? 'Total position value (all markets): ' + usd(A.portfolio_value) + '. ' : ''}${esc(A.notes || '')}${A.truncated ? ' History capped to the most recent records.' : ''}</div>`;
  document.querySelectorAll('.seg button').forEach(b => b.onclick = () => { state.acctView = b.dataset.v; render(); });
}

/* ---------------- iPhone install hint ---------------- */
function installHint() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!ios || standalone || localStorage.getItem('hideInstall')) return;
  const inApp = /FBAN|FBAV|Instagram|Line\/|Twitter|XApp|GSA\//i.test(navigator.userAgent);
  const div = document.createElement('div'); div.className = 'card install';
  div.innerHTML = `<b>📲 Add to Home Screen</b><div class="sm">${inApp ? 'This in-app browser can’t install apps. Open this page in <b>Safari</b> first.' : 'Tap the <b>Share</b> button <span class="shareic">⬆︎</span> (bottom bar in Safari, or ⋯ menu), scroll down, then tap <b>Add to Home Screen</b> → <b>Add</b>.'}</div><button class="x" aria-label="dismiss">✕</button>`;
  div.querySelector('.x').onclick = () => { localStorage.setItem('hideInstall', '1'); div.remove(); };
  app.prepend(div);
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {}));
load();
