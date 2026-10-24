'use strict';
// NBA Picks dashboard: reads data.json (built from preview/review/learnings markdown). No backend.
const $ = s => document.querySelector(s);
const app = $('#app');
let DATA = null;
const state = { tab: (location.hash.slice(1) || localStorage.getItem('tab') || 'today'), day: null, rday: null };
const BETS_KEY = 'nba_bets_v1';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n, d = 1) => (n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toFixed(d).replace(/\.0+$/, '');
const sgn = (n, d = 1) => (n === null || n === undefined) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n), d);
const pctS = (w, l) => (w + l) ? Math.round(100 * w / (w + l)) + '%' : '—';
const dayLabel = iso => { const d = new Date(iso + 'T12:00:00+08:00'); return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }); };
const todayMYT = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const teamName = t => t ? (t.name || t.abbr) : '?';
const clean = s => String(s ?? '').replace(/^\*+\s*/, '').replace(/\*\*/g, '').trim();

function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 1800); }

async function load() {
  try {
    const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    DATA = await r.json();
  } catch (e) {
    app.innerHTML = '<div class="card">Could not load data.json (offline and not cached yet).</div>'; return;
  }
  const gen = DATA.generated_at ? new Date(DATA.generated_at) : null;
  $('#meta').innerHTML = gen ? `data ${esc(gen.toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} MYT` : '';
  state.day = DATA.latest_preview_date;
  state.rday = DATA.latest_review_date;
  render();
}

function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  if (!DATA) return;
  ({ today: renderToday, results: renderResults, track: renderTrack, bets: renderBets }[state.tab] || renderToday)();
  window.scrollTo(0, 0);
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; localStorage.setItem('tab', state.tab); render(); });

const getDay = date => DATA.days.find(d => d.date === date);

/* ---------------- TODAY ---------------- */
function edgeBadge(e) {
  if (e === null || e === undefined) return '<span class="edge neu">edge —</span>';
  const cls = e >= 2 ? 'pos' : e <= -2 ? 'neg' : 'neu';
  return `<span class="edge ${cls}" title="my win % minus Polymarket implied %">edge ${sgn(e)}</span>`;
}
function dots(n) { let s = '<span class="dots" title="confidence ' + n + '/10">'; for (let i = 1; i <= 10; i++) s += `<i class="${i <= n ? 'on' : ''}"></i>`; return s + '</span>'; }

function buyCard(b, day) {
  const pm = b.polymarket;
  const pmHtml = pm
    ? `<div class="pm">Polymarket: <b>${esc(pm.event)}</b>${pm.market && pm.market !== pm.event ? ` › <b>${esc(pm.market)}</b>` : ''} → buy <b>“${esc(pm.outcome)}”</b></div>`
    : `<div class="pm mut">Polymarket market: ${esc(b.matchup || '?')} — find “${esc(b.selection)}” (exact outcome name not in raw files)</div>`;
  const outcomeLabel = pm ? `${pm.market} — ${pm.outcome}` : `${b.matchup || ''} ${b.selection}`;
  return `<div class="buy">
    <div class="row sp"><div class="sel">${esc(b.selection)}</div>${b.tier ? `<span class="chip">${esc(b.tier)}</span>` : ''}</div>
    <div class="sm mut">${esc(b.matchup || '')}${b.my_pct ? ` · my ${fmt(b.my_pct)}%` : ''}</div>
    ${pmHtml}
    <div class="row sp" style="margin-top:6px">
      <div><div class="xs mut">max price (preview)</div><div class="price">≤ ${fmt(b.price)}¢</div></div>
      <div style="text-align:right"><div class="xs mut">size</div><div style="font-weight:700">${b.units !== null && b.units !== undefined ? fmt(b.units, 2) + 'u' : '—'}</div></div>
    </div>
    ${b.condition ? `<div class="cond">⚠ ${esc(b.condition)}</div>` : ''}
    <div style="margin-top:8px"><button class="btn sm" data-log='${esc(JSON.stringify({ date: day.date, outcome: outcomeLabel, price: b.price }))}'>＋ Log this bet</button></div>
  </div>`;
}

function gameCard(g, day) {
  const avoid = g.avoid && g.avoid.length;
  const pickName = g.pick ? teamName(g.pick) : '—';
  const pm = g.pm_pick_price;
  const buys = day.buys.filter(b => b.game_id === g.id);
  const res = g.result;
  return `<div class="card game ${avoid ? 'avoided' : ''}">
    <div class="row sp">
      <div class="teams">${esc(g.away.abbr)}<span class="at">@</span>${esc(g.home.abbr)}</div>
      <div class="tip">${g.tip_myt ? '⏰ ' + esc(g.tip_myt) + ' MYT' : ''}</div>
    </div>
    <div class="xs mut">${esc(g.away.city)} ${esc(g.away.name)} at ${esc(g.home.city)} ${esc(g.home.name)}${g.status_note ? ' · ' + esc(g.status_note) : ''}</div>
    <div class="pickline">
      <div class="pct">${g.win_pct !== null ? fmt(g.win_pct) + '%' : '—'}</div>
      <div style="flex:1">
        <div class="row sp"><span class="pickname">Pick: ${esc(pickName)}</span>${edgeBadge(g.edge)}</div>
        <div class="bar"><i style="width:${g.win_pct || 0}%"></i>${pm ? `<b style="left:${pm}%" title="Polymarket ${pm}¢"></b>` : ''}</div>
        <div class="row sp xs mut"><span>conf ${g.confidence ?? '—'}/10 ${g.confidence ? dots(g.confidence) : ''}</span><span>PM ${pm !== null ? fmt(pm) + '¢' : '—'}</span></div>
      </div>
    </div>
    <div class="row wrap" style="gap:5px">
      ${avoid ? '<span class="chip avoid">AVOID</span>' : ''}
      ${buys.map(b => `<span class="chip buy">BUY ${esc(b.selection)} ≤${fmt(b.price)}¢</span>`).join('')}
      ${(g.injury_flags || []).map(f => `<span class="chip inj">🩹 ${esc(f)}</span>`).join('')}
    </div>
    <div class="grid3">
      <div class="kv"><div class="k">Book ML</div><div class="v">${esc(g.dk_ml ? g.dk_ml.replace(/\s*\(opened[^)]*\)/, '').replace(/\s*(→|->).*$/, '') : '—')}</div></div>
      <div class="kv"><div class="k">Spread</div><div class="v">${esc(g.spread?.dk || '—')}</div></div>
      <div class="kv"><div class="k">Total</div><div class="v">${esc(g.total?.dk || '—')}</div></div>
    </div>
    ${res ? `<div class="card" style="margin:8px 0 0;padding:8px;background:var(--card2)"><b>${res.hit === true ? '✅' : res.hit === false ? '❌' : '•'} Final: ${esc(res.final_text || '?')}</b><div class="sm" style="margin-top:3px">${esc(clean(res.reason))}</div></div>` : ''}
    <details><summary>Details</summary><div class="det">
      ${avoid ? `<b class="lbl">Why avoid</b>${g.avoid.map(a => `<p>${esc(clean(a))}</p>`).join('')}` : ''}
      ${g.bet ? `<b class="lbl">Bet</b><p>${esc(clean(g.bet))}</p>` : ''}
      ${g.view ? `<b class="lbl">My view</b><p>${esc(clean(g.view))}</p>` : ''}
      ${g.injuries ? `<b class="lbl">Injuries</b><p>${esc(clean(g.injuries))}</p>` : ''}
      ${g.form ? `<b class="lbl">Form</b><p>${esc(clean(g.form))}</p>` : ''}
      ${g.sentiment ? `<b class="lbl">Sentiment</b><p>${esc(clean(g.sentiment))}</p>` : ''}
      <b class="lbl">Markets</b>
      <p>Book: ${esc(g.dk_ml || '—')}${g.dk_devig ? ` (de-vig ${esc(g.dk_devig.abbr)} ${fmt(g.dk_devig.pct)}%)` : ''}</p>
      <p>Polymarket: ${esc(g.pm_ml || '—')}</p>
      ${g.spread?.pm ? `<p>PM spread: ${esc(g.spread.pm)}</p>` : ''}
      ${g.total?.pm ? `<p>PM total: ${esc(g.total.pm)}</p>` : ''}
      ${g.sb_raw ? `<p>${esc(g.sb_raw)}</p>` : ''}
    </div></details>
  </div>`;
}

function listBlock(title, items) {
  items = (items || []).map(clean).filter(x => x && x !== '--');
  if (!items.length) return '';
  return `<h3>${esc(title)}</h3><ul class="plain">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function renderToday() {
  const day = getDay(state.day) || DATA.days[DATA.days.length - 1];
  if (!day) { app.innerHTML = '<div class="empty">No previews found.</div>'; return; }
  const games = [...day.games].sort((a, b) => (a.tip_iso || '').localeCompare(b.tip_iso || '') || a.n - b.n);
  const S = day.summary || {};
  const opts = [...DATA.days].reverse().map(d => `<option value="${d.date}" ${d.date === day.date ? 'selected' : ''}>${dayLabel(d.date)}${d.date === DATA.latest_preview_date ? ' (latest)' : ''}</option>`).join('');
  app.innerHTML = `
    <h2><span>${dayLabel(day.date)} <small>${games.length} games</small></span><select class="daysel" id="daysel">${opts}</select></h2>
    <div class="xs mut" style="margin:-4px 2px 8px">Preview written ${esc(day.written || '?')} · tip-offs in MYT · edge = my win % − Polymarket price</div>
    <h2><span>🟢 What to buy</span><small>${day.buys.length} plays</small></h2>
    ${day.buys.length ? `<div class="strip">${day.buys.map(b => buyCard(b, day)).join('')}</div>` : '<div class="card empty">No value plays in this preview.</div>'}
    ${(S.check_before || []).length ? `<div class="card"><div class="warn"><b>Check before tip:</b> ${esc(S.check_before.map(clean).join(' '))}</div></div>` : ''}
    <h2><span>Games</span></h2>
    ${games.map(g => gameCard(g, day)).join('')}
    <div class="card">
      ${listBlock('Top picks', S.top3)}
      ${listBlock('Underdogs worth a look', S.underdogs)}
      ${listBlock('Avoid', S.avoid)}
      ${listBlock('Season record (as of this preview)', S.season_record)}
      ${(day.lessons_applied || []).filter(x => x && x !== '--').length ? `<details><summary>Lessons applied today</summary>${listBlock('', day.lessons_applied)}</details>` : ''}
    </div>`;
  $('#daysel').onchange = e => { state.day = e.target.value; render(); };
  bindLogButtons();
}

function bindLogButtons() {
  document.querySelectorAll('[data-log]').forEach(btn => btn.onclick = () => {
    const p = JSON.parse(btn.dataset.log);
    state.prefill = p; state.tab = 'bets'; localStorage.setItem('tab', 'bets'); render();
  });
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
  const season = DATA.season || {};
  let dayHtml = '<div class="card empty">No reviews yet.</div>';
  if (day) {
    const gs = day.games.filter(g => g.result);
    const w = gs.filter(g => g.result.hit === true).length, l = gs.filter(g => g.result.hit === false).length;
    const R = day.review;
    const opts = [...reviewed].reverse().map(d => `<option value="${d.date}" ${d.date === day.date ? 'selected' : ''}>${dayLabel(d.date)}</option>`).join('');
    dayHtml = `
      <h2><span>Last graded: ${dayLabel(day.date)}</span><select class="daysel" id="rdaysel">${opts}</select></h2>
      <div class="stats" style="margin-bottom:10px">
        <div class="stat"><div class="v">${w}-${l}</div><div class="k">straight up</div></div>
        <div class="stat"><div class="v ${R.units > 0 ? 'pos' : R.units < 0 ? 'neg' : ''}">${R.units !== null && R.units !== undefined ? sgn(R.units) + 'u' : 'n/a'}</div><div class="k">units (review)</div></div>
        <div class="stat"><div class="v">${R.brier ? fmt(R.brier.me, 3) : '—'}</div><div class="k">Brier me${R.brier ? ` · DK ${fmt(R.brier.dk, 3)} · PM ${fmt(R.brier.pm, 3)}` : ''}</div></div>
      </div>
      <div class="card">${gs.map(g => `<div class="res">
          <div class="mk">${g.result.hit === true ? '✅' : g.result.hit === false ? '❌' : '•'}</div>
          <div style="flex:1;min-width:0">
            <div class="row sp"><span class="t">${esc(g.result.final_text || (g.away.abbr + ' @ ' + g.home.abbr))}</span><span class="xs mut">pick ${esc(g.pick ? g.pick.abbr : '?')} ${fmt(g.win_pct)}%</span></div>
            <div class="why">${esc(oneLine(g.result.reason || (g.result.grades || [])[0] || ''))}</div>
            <details><summary class="xs">Full grade</summary><div class="det">${(g.result.grades || []).map(x => `<p>${esc(clean(x))}</p>`).join('')}${g.result.how ? `<p class="mut">${esc(clean(g.result.how))}</p>` : ''}${g.result.notes ? `<p class="mut">${esc(clean(g.result.notes))}</p>` : ''}</div></details>
          </div></div>`).join('') || '<div class="empty">No graded games parsed.</div>'}
      </div>
      ${(R.day_summary || []).length ? `<div class="card">${listBlock('Day summary', R.day_summary)}</div>` : ''}
      ${(R.lessons || []).length ? `<div class="card"><details><summary>Lessons from this review</summary>${listBlock('', R.lessons)}</details></div>` : ''}`;
  }
  const rt = season.record_table || [];
  app.innerHTML = dayHtml + `
    <h2><span>Season record</span><small>from learnings.md</small></h2>
    <div class="card"><table><thead><tr><th>Category</th><th class="num">W-L</th><th class="num">Win%</th><th class="num">Units</th></tr></thead><tbody>
      ${rt.map(r => `<tr><td>${esc(r.category)}${r.notes ? `<div class="xs mut">${esc(r.notes)}</div>` : ''}</td><td class="num"><b>${esc(r.record || '—')}</b></td><td class="num">${r.w !== null && r.w !== undefined ? pctS(r.w, r.l) : '—'}</td><td class="num ${r.units > 0 ? 'pos' : r.units < 0 ? 'neg' : ''}">${r.units !== null && r.units !== undefined ? sgn(r.units) + 'u' : '—'}</td></tr>`).join('')}
    </tbody></table>
    ${season.brier ? `<div class="sm" style="margin-top:8px">Brier (lower is better, ${season.brier.games ?? '?'} games): me <b>${fmt(season.brier.me, 3)}</b> · DK ${fmt(season.brier.dk, 3)} · PM ${fmt(season.brier.pm, 3)}</div>` : ''}
    </div>
    ${(DATA.parse_warnings || []).length ? `<div class="card"><h3>Data notes</h3>${DATA.parse_warnings.map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}</div>` : ''}`;
  const sel = $('#rdaysel'); if (sel) sel.onchange = e => { state.rday = e.target.value; render(); };
}

/* ---------------- TRACK RECORD ---------------- */
function recordChart(per) {
  // bars: daily units (where stated); line: cumulative SU net wins (W-L)
  const W = 340, H = 170, P = { l: 30, r: 30, t: 14, b: 26 };
  const n = per.length; if (!n) return '';
  const cw = (W - P.l - P.r) / n;
  let cum = 0; const net = per.map(d => (cum += (d.su_w - d.su_l)));
  let cu = 0; const cumU = per.map(d => (cu += (d.units ?? 0)));
  const uMax = Math.max(1, ...per.map(d => Math.abs(d.units ?? 0)), ...cumU.map(Math.abs));
  const nMax = Math.max(1, ...net.map(Math.abs));
  const y0 = P.t + (H - P.t - P.b) / 2, half = (H - P.t - P.b) / 2;
  const yu = v => y0 - v / uMax * half, yn = v => y0 - v / nMax * half;
  let s = `<svg viewBox="0 0 ${W} ${H}"><line x1="${P.l}" x2="${W - P.r}" y1="${y0}" y2="${y0}" stroke="#30363d"/>`;
  per.forEach((d, i) => {
    const x = P.l + i * cw + cw * 0.2, bw = cw * 0.6;
    if (d.units === null || d.units === undefined) {
      s += `<text x="${x + bw / 2}" y="${y0 - 4}" text-anchor="middle">n/a</text>`;
    } else {
      const y = yu(d.units); s += `<rect x="${x}" y="${Math.min(y, y0)}" width="${bw}" height="${Math.max(1, Math.abs(y - y0))}" rx="2" fill="${d.units >= 0 ? '#3fb950' : '#f85149'}" opacity=".75"/>`;
      s += `<text x="${x + bw / 2}" y="${d.units >= 0 ? y - 3 : y + 10}" text-anchor="middle" style="fill:#c9d1d9">${sgn(d.units)}</text>`;
    }
    s += `<text x="${P.l + i * cw + cw / 2}" y="${H - 8}" text-anchor="middle">${d.date.slice(5)}</text>`;
  });
  const pts = net.map((v, i) => `${P.l + i * cw + cw / 2},${yn(v)}`).join(' ');
  s += `<polyline points="${pts}" fill="none" stroke="#f58220" stroke-width="2.5"/>`;
  net.forEach((v, i) => s += `<circle cx="${P.l + i * cw + cw / 2}" cy="${yn(v)}" r="3.5" fill="#f58220"/><text x="${P.l + i * cw + cw / 2 + 6}" y="${yn(v) - 5}" style="fill:#f58220">${v > 0 ? '+' : ''}${v}</text>`);
  s += `<text x="4" y="${P.t + 4}">u</text><text x="${W - 4}" y="${P.t + 4}" text-anchor="end" style="fill:#f58220">W−L</text></svg>`;
  return s;
}

function calibChart(cal) {
  const W = 300, H = 220, P = { l: 34, r: 12, t: 10, b: 30 }, lo = 50, hi = 100;
  const x = v => P.l + (v - lo) / (hi - lo) * (W - P.l - P.r), y = v => H - P.b - (v - 0) / 100 * (H - P.t - P.b);
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  [0, 25, 50, 75, 100].forEach(v => s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#21262d"/><text x="${P.l - 4}" y="${y(v) + 3}" text-anchor="end">${v}%</text>`);
  [50, 60, 70, 80, 90, 100].forEach(v => s += `<text x="${x(v)}" y="${H - 12}" text-anchor="middle">${v}%</text>`);
  s += `<line x1="${x(50)}" y1="${y(50)}" x2="${x(100)}" y2="${y(100)}" stroke="#8b949e" stroke-dasharray="4 4"/>`;
  cal.filter(c => c.n).forEach(c => {
    const r = 4 + Math.sqrt(c.n) * 2.2;
    s += `<line x1="${x(c.avg_pred)}" x2="${x(c.avg_pred)}" y1="${y(c.avg_pred)}" y2="${y(c.actual)}" stroke="${c.actual >= c.avg_pred ? '#3fb950' : '#f85149'}" stroke-width="1.5"/>`;
    s += `<circle cx="${x(c.avg_pred)}" cy="${y(c.actual)}" r="${r}" fill="#58a6ff" opacity=".8"/><text x="${x(c.avg_pred) + r + 3}" y="${y(c.actual) + 3}" style="fill:#c9d1d9">n=${c.n}</text>`;
  });
  s += `<text x="${(W + P.l) / 2}" y="${H - 1}" text-anchor="middle">my predicted win % →</text></svg>`;
  return s;
}

function renderTrack() {
  const T = DATA.track || {}; const per = T.per_day || [];
  const totW = per.reduce((a, d) => a + d.su_w, 0), totL = per.reduce((a, d) => a + d.su_l, 0);
  const stated = per.filter(d => d.units !== null && d.units !== undefined);
  const uSum = stated.reduce((a, d) => a + d.units, 0);
  const sr = (DATA.season?.record_table || []);
  const su = sr.find(r => /straight/i.test(r.category));
  const cal = T.calibration || [];
  app.innerHTML = `
    <h2><span>Over time</span><small>${per.length} graded days</small></h2>
    <div class="stats" style="margin-bottom:10px">
      <div class="stat"><div class="v">${su ? esc(su.record) : totW + '-' + totL}</div><div class="k">SU (learnings.md)</div></div>
      <div class="stat"><div class="v">${totW}-${totL}</div><div class="k">SU (graded games)</div></div>
      <div class="stat"><div class="v ${uSum >= 0 ? 'pos' : 'neg'}">${sgn(uSum)}u</div><div class="k">units, ${stated.length}/${per.length} days stated</div></div>
    </div>
    <div class="card">${recordChart(per)}
      <div class="legend"><span><i style="background:#3fb950"></i>units that day (from review)</span><span><i style="background:#f58220"></i>cumulative SU wins − losses</span></div>
      <div class="xs mut" style="margin-top:4px">“n/a” = the review didn't state a units figure; nothing is estimated.</div>
    </div>
    <div class="card"><table><thead><tr><th>Day</th><th class="num">SU</th><th class="num">Units</th><th class="num">Brier me / DK / PM</th></tr></thead><tbody>
      ${per.map(d => `<tr><td>${d.date.slice(5)}</td><td class="num">${d.su_w}-${d.su_l}${d.log?.su && (d.log.su[0] !== d.su_w || d.log.su[1] !== d.su_l) ? `<div class="xs warn">log: ${d.log.su[0]}-${d.log.su[1]}</div>` : ''}</td><td class="num">${d.units !== null && d.units !== undefined ? sgn(d.units) : 'n/a'}</td><td class="num">${d.brier ? `${fmt(d.brier.me, 3)} / ${fmt(d.brier.dk, 3)} / ${fmt(d.brier.pm, 3)}` : '—'}</td></tr>`).join('')}
    </tbody></table></div>

    <h2><span>Calibration</span><small>${T.graded_games ?? '?'} SU picks</small></h2>
    <div class="card">${calibChart(cal)}
      <table style="margin-top:8px"><thead><tr><th>My win %</th><th class="num">Picks</th><th class="num">Avg said</th><th class="num">Actually won</th></tr></thead><tbody>
      ${cal.map(c => `<tr><td>${esc(c.bucket)}</td><td class="num">${c.n}</td><td class="num">${c.n ? fmt(c.avg_pred) + '%' : '—'}</td><td class="num ${c.n ? (c.actual >= c.avg_pred ? 'pos' : 'neg') : ''}">${c.n ? `${c.hits}/${c.n} = ${fmt(c.actual)}%` : '—'}</td></tr>`).join('')}
      </tbody></table>
      <div class="xs mut" style="margin-top:4px">Dots above the dashed line = I was under-confident; below = over-confident. Small samples.</div>
    </div>

    <h2><span>Splits</span><small>straight-up picks</small></h2>
    <div class="card">${(T.splits || []).map(sp => `<h3>${esc(sp.name)}</h3>${sp.groups.map(g => {
      const p = (g.w + g.l) ? 100 * g.w / (g.w + g.l) : 0;
      return `<div class="split"><div class="lab"><span>${esc(g.label)}</span><span><b>${g.w}-${g.l}</b> <span class="mut">${pctS(g.w, g.l)}</span></span></div><div class="bar"><i style="width:${p}%;background:${p >= 50 ? '#3fb950' : '#f85149'}"></i></div></div>`;
    }).join('')}`).join('')}
    <div class="xs mut">Favorite/underdog by the pick side's Polymarket price (DraftKings de-vig if missing). “Above market” = my win % higher than the Polymarket price.</div></div>

    <h2><span>Active lessons</span><small>${(DATA.lessons || []).length}</small></h2>
    <div class="card">${(DATA.lessons || []).map(l => `<div class="lesson"><div class="lt">L${esc(l.n)}. ${esc(clean(l.title))}</div>${l.body ? `<div class="lb">${esc(clean(l.body))}</div>` : ''}</div>`).join('') || '<div class="empty">None parsed.</div>'}</div>

    <div class="card"><details><summary>Daily log (learnings.md)</summary><div class="det">${(DATA.daily_log || []).map(d => `<p><b>${esc(d.date)}</b> ${esc(clean(d.text))}</p>`).join('')}</div></details></div>`;
}

/* ---------------- MY BETS ---------------- */
const loadBets = () => { try { return JSON.parse(localStorage.getItem(BETS_KEY)) || []; } catch { return []; } };
const saveBets = b => localStorage.setItem(BETS_KEY, JSON.stringify(b));
function pnl(b) {
  const st = +b.stake || 0, pr = +b.price || 0;
  if (b.result === 'won') return pr > 0 && pr < 100 ? st * (100 / pr - 1) : 0;
  if (b.result === 'lost') return -st;
  if (b.result === 'cashout' && b.cashout !== undefined && b.cashout !== '') return (+b.cashout) - st;
  return 0;
}
function renderBets() {
  const bets = loadBets();
  const pf = state.prefill || {}; state.prefill = null;
  const settled = bets.filter(b => b.result === 'won' || b.result === 'lost');
  const won = bets.filter(b => b.result === 'won').length, lost = bets.filter(b => b.result === 'lost').length;
  const staked = settled.reduce((a, b) => a + (+b.stake || 0), 0);
  const open = bets.filter(b => b.result === 'pending');
  const openStake = open.reduce((a, b) => a + (+b.stake || 0), 0);
  const total = bets.reduce((a, b) => a + pnl(b), 0);
  const sorted = [...bets].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  app.innerHTML = `
    <h2><span>My bets</span><small>saved on this device only</small></h2>
    <div class="stats" style="margin-bottom:10px">
      <div class="stat"><div class="v ${total > 0 ? 'pos' : total < 0 ? 'neg' : ''}">${total >= 0 ? '+' : '−'}$${Math.abs(total).toFixed(2)}</div><div class="k">total P&amp;L</div></div>
      <div class="stat"><div class="v">${won}-${lost}</div><div class="k">record${settled.length ? ' · ROI ' + (staked ? sgn(100 * total / staked) + '%' : '—') : ''}</div></div>
      <div class="stat"><div class="v">${open.length}</div><div class="k">open · $${openStake.toFixed(2)} at risk</div></div>
    </div>
    <div class="card">
      <form id="betform" class="form">
        <label>Date<input type="date" name="date" value="${esc(pf.date || todayMYT())}" required></label>
        <label>Price (¢)<input type="number" name="price" step="0.1" min="0.1" max="99.9" inputmode="decimal" value="${esc(pf.price ?? '')}" required></label>
        <label class="full">Outcome<input name="outcome" placeholder="e.g. Rockets vs. Hawks — Hawks" value="${esc(pf.outcome || '')}" required></label>
        <label>Stake ($)<input type="number" name="stake" step="0.01" min="0" inputmode="decimal" required></label>
        <label>Result<select name="result"><option value="pending">Pending</option><option value="won">Won</option><option value="lost">Lost</option><option value="void">Void/refund</option></select></label>
        <button class="btn pri full" style="grid-column:1/-1" type="submit">Add bet</button>
      </form>
      <div class="xs mut" style="margin-top:6px">Win pays stake × (100 / price − 1). Loss = −stake. Void = 0.</div>
    </div>
    <div class="card">${sorted.map(b => {
      const p = pnl(b);
      return `<div class="bet">
        <div><div class="o">${esc(b.outcome)}</div><div class="xs mut">${esc(b.date)} · ${fmt(b.price)}¢ · $${(+b.stake).toFixed(2)} → pays $${(+b.price > 0 ? (+b.stake) * 100 / (+b.price) : 0).toFixed(2)}</div></div>
        <div style="text-align:right"><div class="${p > 0 ? 'pos' : p < 0 ? 'neg' : 'mut'}" style="font-weight:700">${b.result === 'pending' ? 'open' : (p >= 0 ? '+' : '−') + '$' + Math.abs(p).toFixed(2)}</div></div>
        <div class="row" style="grid-column:1/-1;gap:6px">
          <select data-res="${b.id}">${['pending', 'won', 'lost', 'void'].map(r => `<option ${b.result === r ? 'selected' : ''} value="${r}">${r}</option>`).join('')}</select>
          <button class="btn sm" data-del="${b.id}">Delete</button>
        </div></div>`;
    }).join('') || '<div class="empty">No bets yet. Tap “＋ Log this bet” on a play in Today, or add one above.</div>'}</div>
    <div class="row" style="gap:8px;justify-content:center;margin:8px 0 20px">
      <button class="btn sm" id="exp">Export JSON</button>
      <label class="btn sm" style="cursor:pointer">Import JSON<input type="file" id="imp" accept="application/json" hidden></label>
    </div>`;
  $('#betform').onsubmit = e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const all = loadBets();
    all.push({ id: Date.now(), date: f.date, outcome: f.outcome.trim(), price: +f.price, stake: +f.stake, result: f.result });
    saveBets(all); toast('Bet saved'); render();
  };
  document.querySelectorAll('[data-res]').forEach(s => s.onchange = () => { const all = loadBets(); const b = all.find(x => x.id == s.dataset.res); if (b) { b.result = s.value; saveBets(all); render(); } });
  document.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => { if (!confirm('Delete this bet?')) return; saveBets(loadBets().filter(x => x.id != btn.dataset.del)); render(); });
  $('#exp').onclick = () => {
    const blob = new Blob([JSON.stringify(loadBets(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nba-bets-' + todayMYT() + '.json'; a.click();
  };
  $('#imp').onchange = async e => {
    try { const arr = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(arr)) throw 0;
      const all = loadBets(); const ids = new Set(all.map(b => b.id)); arr.forEach(b => { if (!ids.has(b.id)) all.push(b); }); saveBets(all); toast('Imported'); render();
    } catch { alert('Not a valid bets export.'); }
  };
  if (pf.outcome) { const st = document.querySelector('[name=stake]'); st && st.focus(); }
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
load();
