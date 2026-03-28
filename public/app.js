// ─── Helpers ────────────────────────────────────────────────────────────────
const Q = s => document.querySelector(s);
const QQ = s => document.querySelectorAll(s);
const $ = (n, p = {}) => {
  const u = new URL('/api/' + n, location.origin);
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  return fetch(u).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); return d; });
};
const POST = (n, b) => fetch('/api/' + n, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());

const f = n => n != null && n !== 0 ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
const fi = n => n != null ? Number(n).toLocaleString('en-US') : '0';
const fp = n => n != null && n !== 0 ? Number(n).toFixed(1) + '%' : '-';
const esc = s => s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';

// ─── State ──────────────────────────────────────────────────────────────────
let S = { acct: null, date: 'last_7d', tab: 'health', drill: null };

// ─── Traffic Light (from paid-ads methodology) ──────────────────────────────
function tl(ad, targetCPA = 30) {
  if (!ad.spend) return { c: 'tl-l', t: 'Sin data', tip: 'Sin gasto aun' };
  const res = ad.results || 0;
  if (res === 0) {
    if (ad.spend > targetCPA * 1.5) return { c: 'tl-k', t: 'Kill', tip: `Gasto $${f(ad.spend)} sin resultados. Supera 1.5x tu CPA target.` };
    return { c: 'tl-l', t: 'Learning', tip: `Gastando $${f(ad.spend)} — necesita mas datos.` };
  }
  const cpr = ad.costPerResult;
  if (!cpr) return { c: 'tl-l', t: 'Learning', tip: '' };
  if (cpr <= targetCPA) return { c: 'tl-s', t: 'Escalar', tip: `Costo/${ ad.resultType || 'result'} $${f(cpr)} — por debajo del target. Subir presupuesto 20-30%.` };
  if (cpr <= targetCPA * 2) return { c: 'tl-w', t: 'Vigilar', tip: `Costo/${ ad.resultType || 'result'} $${f(cpr)} — subiendo. Preparar creativo de reemplazo.` };
  return { c: 'tl-k', t: 'Kill', tip: `Costo/${ ad.resultType || 'result'} $${f(cpr)} — muy por encima. Apagar y reasignar presupuesto.` };
}

function badge(s) {
  const u = (s||'').toUpperCase();
  if (u === 'ACTIVE') return '<span class="badge b-on">Activo</span>';
  if (u === 'PAUSED') return '<span class="badge b-off">Pausado</span>';
  return `<span class="badge b-oth">${u}</span>`;
}

function hColor(v) { return v >= 30 ? 'var(--g)' : v >= 20 ? 'var(--y)' : 'var(--r)'; }
function hdColor(v) { return v >= 15 ? 'var(--g)' : v >= 8 ? 'var(--y)' : 'var(--r)'; }
function cpaC(v) { return !v ? '' : v <= 30 ? 'g' : v <= 50 ? 'y' : 'r'; }

function toast(m, ok = true) {
  const e = document.createElement('div');
  e.className = `toast ${ok ? 'ok' : 'err'}`;
  e.textContent = m;
  Q('#toasts').appendChild(e);
  setTimeout(() => e.remove(), 3000);
}

// ─── Init ───────────────────────────────────────────────────────────────────
async function init() {
  try {
    const accts = await $('accounts');
    Q('#acct').innerHTML = accts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    S.acct = accts[0]?.id;
    load();
  } catch (e) { toast('Error: ' + e.message, false); }
}

Q('#acct').onchange = e => { S.acct = e.target.value; S.drill = null; load(); };
Q('#date').onchange = e => { S.date = e.target.value; load(); };
Q('#tabs').onclick = e => {
  if (!e.target.dataset.t) return;
  QQ('.tab').forEach(t => t.classList.remove('on'));
  e.target.classList.add('on');
  S.tab = e.target.dataset.t;
  S.drill = null;
  load();
};

window.reload = () => load();

async function load() {
  if (!S.acct) return;
  Q('#out').innerHTML = '<div class="spin">Cargando...</div>';
  Q('#kpis').innerHTML = '';
  Q('#bc').style.display = 'none';
  try {
    if (S.drill) { await loadDrill(); return; }
    switch (S.tab) {
      case 'health': await loadHealth(); break;
      case 'campaigns': await loadCampaigns(); break;
      case 'creatives': await loadCreatives(); break;
      case 'funnel': await loadFunnel(); break;
      case 'countries': await loadCountries(); break;
    }
  } catch (e) { Q('#out').innerHTML = `<div class="spin" style="color:var(--r)">Error: ${e.message}</div>`; }
}

// ─── HEALTH TAB (Overview simplificado) ─────────────────────────────────────
async function loadHealth() {
  const [ins, camps, ads] = await Promise.all([
    $('insights', { account: S.acct, date_preset: S.date }),
    $('campaigns', { account: S.acct, date_preset: S.date }),
    $('top-ads', { account: S.acct, date_preset: S.date }),
  ]);

  const i = ins[0] || {};
  const active = camps.filter(c => c.effective_status === 'ACTIVE');
  const spending = ads.filter(a => a.spend > 0);
  const withResults = spending.filter(a => (a.results || 0) > 0);
  const wasting = spending.filter(a => (a.results || 0) === 0);
  const wastedSpend = wasting.reduce((s, a) => s + a.spend, 0);
  const totalSpend = Number(i.spend || 0);
  const iRes = i.results || 0;
  const iType = i.resultType || 'resultados';
  const iCPR = i.costPerResult;

  Q('#kpis').innerHTML = `
    <div class="kpi ka"><div class="kpi-l">Gasto</div><div class="kpi-v">$${f(totalSpend)}</div></div>
    <div class="kpi kg"><div class="kpi-l">${iType.charAt(0).toUpperCase()+iType.slice(1)}</div><div class="kpi-v g">${fi(iRes)}</div></div>
    <div class="kpi ${iCPR && iCPR <= 30 ? 'kg' : 'ky'}"><div class="kpi-l">Costo/${iType}</div><div class="kpi-v ${cpaC(iCPR)}">${iCPR ? '$'+f(iCPR) : '-'}</div></div>
    <div class="kpi"><div class="kpi-l">ROAS</div><div class="kpi-v ${i.roas > 2 ? 'g' : ''}">${i.roas ? f(i.roas)+'x' : '-'}</div></div>
    <div class="kpi"><div class="kpi-l">Freq</div><div class="kpi-v ${i.frequency > 3 ? 'r' : ''}">${i.frequency ? Number(i.frequency).toFixed(1) : '-'}</div><div class="kpi-s">${i.frequency > 3 ? 'Audiencia saturada' : 'OK'}</div></div>
  `;

  let html = '';

  // ─── Smart Alerts ───
  const alerts = [];
  if (active.length === 0) alerts.push({ t: 'b', m: '<b>Sin campanas activas.</b> Todas tus campanas estan pausadas.' });
  if (totalSpend > 0 && iRes === 0) alerts.push({ t: 'r', m: '<b>Gastando sin resultados.</b> $' + f(totalSpend) + ' gastados sin resultados. Revisa tu embudo (tab Embudo).' });
  if (wastedSpend > 0) alerts.push({ t: 'y', m: `<b>${wasting.length} anuncios gastando sin resultados.</b> $${f(wastedSpend)} desperdiciados (${totalSpend > 0 ? (wastedSpend/totalSpend*100).toFixed(0) : 0}% del gasto). Considera pausarlos.` });
  if (i.frequency > 3) alerts.push({ t: 'y', m: `<b>Frecuencia alta (${Number(i.frequency).toFixed(1)}).</b> Tu audiencia esta viendo los anuncios demasiado. Necesitas creativos nuevos o audiencias mas amplias.` });
  if (withResults.length > 0) {
    const bestAd = withResults.sort((a,b) => (a.costPerResult||Infinity) - (b.costPerResult||Infinity))[0];
    alerts.push({ t: 'g', m: `<b>Mejor anuncio:</b> "${esc(bestAd.name)}" — $${f(bestAd.costPerResult)}/${bestAd.resultType}, ${bestAd.results} ${bestAd.resultType}. Considera escalarlo.` });
  }
  if (alerts.length === 0) alerts.push({ t: 'b', m: 'Sin datos suficientes para diagnosticar. Selecciona un rango de fecha con actividad.' });

  html += alerts.map(a => `<div class="alert alert-${a.t}">${a.m}</div>`).join('');

  // ─── Top 5 Performers ───
  const top5 = [...spending].sort((a,b) => (b.results||0) - (a.results||0)).slice(0, 5);
  if (top5.length) {
    html += `<div class="sec" style="margin-top:16px">Top Performers</div>`;
    html += `<div class="cards">${top5.map((a,i) => adCard(a,i)).join('')}</div>`;
  }

  // ─── Worst 5 (wasting money) ───
  if (wasting.length) {
    const worst5 = wasting.slice(0, 5);
    html += `<div class="sec" style="color:var(--r)">Apagar — Gastando sin Resultados</div>`;
    html += `<div class="cards">${worst5.map((a,i) => adCard(a,i+5,true)).join('')}</div>`;
  }

  // ─── Campaign summary ───
  const topCamps = [...camps].filter(c => c.spend > 0).sort((a,b) => b.spend - a.spend).slice(0, 8);
  if (topCamps.length) {
    html += `
      <div class="tw" style="margin-top:4px">
        <div class="tw-h">Campanas con gasto</div>
        <table><tr><th></th><th>Campana</th><th>Gasto</th><th>Tipo</th><th>Result</th><th>Costo</th><th>ROAS</th></tr>
        ${topCamps.map(c => `
          <tr style="cursor:pointer" onclick="drillCamp('${c.id}','${esc(c.name)}')">
            <td>${badge(c.effective_status)}</td>
            <td style="font-weight:500;max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}</td>
            <td class="n">$${f(c.spend)}</td>
            <td style="color:var(--dim);font-size:11px">${c.resultType||'-'}</td>
            <td class="n g">${c.results||0}</td>
            <td class="n ${cpaC(c.costPerResult)}">${c.costPerResult ? '$'+f(c.costPerResult) : '-'}</td>
            <td class="n">${c.roas ? f(c.roas)+'x' : '-'}</td>
          </tr>`).join('')}
        </table>
      </div>`;
  }

  if (!topCamps.length && !top5.length) {
    html += `<div style="text-align:center;padding:40px;color:var(--dim)">Sin gasto en este periodo. Prueba un rango de fecha mas amplio.</div>`;
  }

  Q('#out').innerHTML = html;
}

// ─── Ad Card ────────────────────────────────────────────────────────────────
function adCard(a, i, bad = false) {
  const t = tl(a);
  const rkC = i === 0 ? 'rk-1' : i === 1 ? 'rk-2' : i === 2 ? 'rk-3' : 'rk-n';
  return `
    <div class="card">
      <div class="card-img">
        <div class="card-rank ${rkC}">${i+1}</div>
        ${a.thumbnail ? `<img src="${a.thumbnail}" alt="">` : '<span class="no">Sin preview</span>'}
        <span class="card-tl ${t.c}">${t.t}</span>
      </div>
      <div class="card-b">
        <div class="card-n" title="${esc(a.name)}">${esc(a.name)}</div>
        <div class="card-c">${esc(a.campaign)}</div>
        ${bad ? `
          <div class="card-m">
            <div class="cm"><div class="cm-l">Gasto</div><div class="cm-v r">$${f(a.spend)}</div></div>
            <div class="cm"><div class="cm-l">Clicks</div><div class="cm-v">${fi(a.clicks)}</div></div>
            <div class="cm"><div class="cm-l">CTR</div><div class="cm-v">${fp(a.ctr)}</div></div>
          </div>
        ` : `
          <div class="card-m">
            <div class="cm"><div class="cm-l">${(a.resultType||'results').charAt(0).toUpperCase()+(a.resultType||'results').slice(1)}</div><div class="cm-v g">${a.results || 0}</div></div>
            <div class="cm"><div class="cm-l">Costo</div><div class="cm-v ${cpaC(a.costPerResult)}">${a.costPerResult ? '$'+f(a.costPerResult) : '-'}</div></div>
            <div class="cm"><div class="cm-l">ROAS</div><div class="cm-v">${a.roas ? f(a.roas)+'x' : '-'}</div></div>
          </div>
        `}
        <div class="card-m" style="margin-top:6px">
          <div class="cm"><div class="cm-l">Hook</div><div class="cm-v" style="color:${a.hookRate ? hColor(a.hookRate) : 'var(--dim)'}">${a.hookRate ? a.hookRate.toFixed(0)+'%' : '-'}</div></div>
          <div class="cm"><div class="cm-l">Hold</div><div class="cm-v" style="color:${a.holdRate ? hdColor(a.holdRate) : 'var(--dim)'}">${a.holdRate ? a.holdRate.toFixed(0)+'%' : '-'}</div></div>
          <div class="cm"><div class="cm-l">Freq</div><div class="cm-v ${a.frequency > 3 ? 'r' : ''}">${a.frequency ? a.frequency.toFixed(1) : '-'}</div></div>
        </div>
        <div class="card-acts">
          <button class="btn btn-sm btn-r" onclick="event.stopPropagation();doPause('${a.id}')">Pausar</button>
          <button class="btn btn-sm btn-g" onclick="event.stopPropagation();doActivate('${a.id}')">Activar</button>
        </div>
      </div>
    </div>`;
}

// ─── CREATIVES TAB ──────────────────────────────────────────────────────────
async function loadCreatives() {
  const ads = await $('top-ads', { account: S.acct, date_preset: S.date });
  const active = ads.filter(a => a.spend > 0);

  if (!active.length) {
    Q('#kpis').innerHTML = '';
    Q('#out').innerHTML = '<div style="text-align:center;padding:50px;color:var(--dim)">Sin anuncios con gasto. Prueba otro rango.</div>';
    return;
  }

  const avgHook = active.filter(a => a.hookRate).reduce((s,a,_,arr) => s + a.hookRate/arr.length, 0);
  const avgHold = active.filter(a => a.holdRate).reduce((s,a,_,arr) => s + a.holdRate/arr.length, 0);
  const hasVideo = active.some(a => a.hookRate);

  Q('#kpis').innerHTML = `
    <div class="kpi ka"><div class="kpi-l">Anuncios</div><div class="kpi-v">${active.length}</div></div>
    <div class="kpi"><div class="kpi-l">Hook Rate Prom</div><div class="kpi-v" style="color:${avgHook ? hColor(avgHook) : 'var(--dim)'}">${avgHook ? avgHook.toFixed(1)+'%' : '-'}</div><div class="kpi-s">Meta: >30%</div></div>
    <div class="kpi"><div class="kpi-l">Hold Rate Prom</div><div class="kpi-v" style="color:${avgHold ? hdColor(avgHold) : 'var(--dim)'}">${avgHold ? avgHold.toFixed(1)+'%' : '-'}</div><div class="kpi-s">Meta: >15%</div></div>
  `;

  // Diagnostic alerts
  let html = '';
  if (!hasVideo) {
    html += `<div class="alert alert-b"><b>Hook Rate / Hold Rate no disponible.</b> Estos datos se calculan de videos (3s views / impresiones). Si no hay video ads, estas metricas no aplican. Cuando actives video ads, los veras aqui automaticamente.</div>`;
  }
  if (avgHook > 0 && avgHook < 25) {
    html += `<div class="alert alert-r"><b>Hook Rate bajo (${avgHook.toFixed(1)}%).</b> Los primeros 3 segundos no enganchan. Cambia completamente los hooks de tus videos — no edites, reemplaza.</div>`;
  }
  if (avgHold > 0 && avgHold < 10) {
    html += `<div class="alert alert-y"><b>Hold Rate bajo (${avgHold.toFixed(1)}%).</b> El hook funciona pero la gente se va. Mantén el hook, reescribe lo que viene despues.</div>`;
  }

  // Top 5 cards
  const top5 = [...active].sort((a,b) => (b.results||0) - (a.results||0)).slice(0,5);
  if (top5.length && (top5[0].results||0) > 0) {
    html += `<div class="sec">Top 5 por Resultados</div><div class="cards">${top5.map((a,i) => adCard(a,i)).join('')}</div>`;
  }

  // Rankings side by side
  const byHook = active.filter(a => a.hookRate).sort((a,b) => b.hookRate - a.hookRate).slice(0,8);
  const byCPA = active.filter(a => a.costPerResult).sort((a,b) => (a.costPerResult||Infinity)-(b.costPerResult||Infinity)).slice(0,8);

  html += '<div class="g2">';

  if (byHook.length) {
    html += `<div class="tw"><div class="tw-h">Mejor Hook Rate</div><table><tr><th>#</th><th>Anuncio</th><th>Hook</th><th>Hold</th><th>Result</th></tr>
      ${byHook.map((a,i) => `<tr><td style="color:var(--dim)">${i+1}</td><td style="max-width:160px;overflow:hidden;text-overflow:ellipsis">${esc(a.name)}</td><td class="n" style="color:${hColor(a.hookRate)}">${a.hookRate.toFixed(1)}%</td><td class="n" style="color:${a.holdRate ? hdColor(a.holdRate) : 'var(--dim)'}">${a.holdRate ? a.holdRate.toFixed(1)+'%' : '-'}</td><td class="n g">${a.results||0} ${a.resultType||''}</td></tr>`).join('')}</table></div>`;
  }

  if (byCPA.length) {
    html += `<div class="tw"><div class="tw-h">Mejor CPA</div><table><tr><th>#</th><th>Anuncio</th><th>CPA</th><th>Result</th><th>Gasto</th></tr>
      ${byCPA.map((a,i) => `<tr><td style="color:var(--dim)">${i+1}</td><td style="max-width:160px;overflow:hidden;text-overflow:ellipsis">${esc(a.name)}</td><td class="n ${cpaC(a.costPerResult)}">$${f(a.costPerResult)}</td><td class="n g">${a.results||0} ${a.resultType||''}</td><td class="n">$${f(a.spend)}</td></tr>`).join('')}</table></div>`;
  }

  html += '</div>';

  // Full table
  html += `
    <div class="tw" style="margin-top:12px">
      <div class="tw-h"><span>Todos los Anuncios (${active.length})</span></div>
      <div style="overflow-x:auto"><table>
        <tr><th>Semaforo</th><th>Anuncio</th><th>Gasto</th><th>Hook</th><th>Hold</th><th>CTR</th><th>CPM</th><th>Freq</th><th>Result</th><th>CPA</th><th>ROAS</th><th></th></tr>
        ${[...active].sort((a,b) => b.spend - a.spend).map(a => {
          const t2 = tl(a);
          return `<tr>
            <td><span class="card-tl ${t2.c}" style="position:static" title="${esc(t2.tip)}">${t2.t}</span></td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;font-weight:500">${esc(a.name)}</td>
            <td class="n">$${f(a.spend)}</td>
            <td class="n" style="color:${a.hookRate ? hColor(a.hookRate) : 'var(--dim)'}">${a.hookRate ? a.hookRate.toFixed(1)+'%' : '-'}</td>
            <td class="n" style="color:${a.holdRate ? hdColor(a.holdRate) : 'var(--dim)'}">${a.holdRate ? a.holdRate.toFixed(1)+'%' : '-'}</td>
            <td class="n">${fp(a.ctr)}</td>
            <td class="n">$${f(a.cpm)}</td>
            <td class="n ${a.frequency > 3 ? 'r' : ''}">${a.frequency ? a.frequency.toFixed(1) : '-'}</td>
            <td class="n g">${a.results||0} <span style="font-size:10px;color:var(--dim)">${a.resultType||''}</span></td>
            <td class="n ${cpaC(a.costPerResult)}">${a.costPerResult ? '$'+f(a.costPerResult) : '-'}</td>
            <td class="n">${a.roas ? f(a.roas)+'x' : '-'}</td>
            <td><button class="btn btn-sm btn-r" onclick="doPause('${a.id}')">Pausar</button></td>
          </tr>`;
        }).join('')}
      </table></div>
    </div>`;

  Q('#out').innerHTML = html;
}

// ─── CAMPAIGNS TAB ──────────────────────────────────────────────────────────
async function loadCampaigns() {
  const camps = await $('campaigns', { account: S.acct, date_preset: S.date });
  const ts = camps.reduce((s,c) => s + c.spend, 0);
  const active = camps.filter(c => c.effective_status === 'ACTIVE');

  Q('#kpis').innerHTML = `
    <div class="kpi"><div class="kpi-l">Total</div><div class="kpi-v">${camps.length}</div><div class="kpi-s">${active.length} activas</div></div>
    <div class="kpi ka"><div class="kpi-l">Gasto</div><div class="kpi-v">$${f(ts)}</div></div>
    <div class="kpi kg"><div class="kpi-l">Resultados</div><div class="kpi-v g">${fi(camps.reduce((s,c) => s + (c.results||0), 0))}</div></div>
  `;

  const sorted = [...camps].sort((a,b) => b.spend - a.spend);
  Q('#out').innerHTML = `
    <div class="tw"><div class="tw-h">Campanas</div>
    <div style="overflow-x:auto"><table>
      <tr><th></th><th>Campana</th><th>Objetivo</th><th>Budget</th><th>Gasto</th><th>Tipo</th><th>Result</th><th>Costo</th><th>ROAS</th><th>CTR</th><th>Freq</th><th></th></tr>
      ${sorted.map(c => {
        const bud = c.daily_budget ? '$'+(c.daily_budget/100).toFixed(0)+'/d' : c.lifetime_budget ? '$'+(c.lifetime_budget/100).toFixed(0) : '-';
        return `<tr>
          <td>${badge(c.effective_status)}</td>
          <td><a href="#" onclick="drillCamp('${c.id}','${esc(c.name)}');return false" style="color:var(--text);text-decoration:none;font-weight:500;max-width:200px;display:block;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}</a></td>
          <td style="color:var(--dim);font-size:10px">${(c.objective||'').replace('OUTCOME_','')}</td>
          <td class="n">${bud}</td>
          <td class="n">$${f(c.spend)}</td>
          <td style="color:var(--dim);font-size:11px">${c.resultType||'-'}</td>
          <td class="n g">${c.results||0}</td>
          <td class="n ${cpaC(c.costPerResult)}">${c.costPerResult ? '$'+f(c.costPerResult) : '-'}</td>
          <td class="n">${c.roas ? f(c.roas)+'x' : '-'}</td>
          <td class="n">${fp(c.ctr)}</td>
          <td class="n ${c.frequency > 3 ? 'r' : ''}">${c.frequency ? c.frequency.toFixed(1) : '-'}</td>
          <td><div style="display:flex;gap:3px">
            ${c.effective_status==='ACTIVE' ? `<button class="btn btn-sm btn-r" onclick="doPause('${c.id}')">Pausar</button>` : `<button class="btn btn-sm btn-g" onclick="doActivate('${c.id}')">Activar</button>`}
            <button class="btn btn-sm btn-y" onclick="openBud('${c.id}')">$$</button>
          </div></td>
        </tr>`;
      }).join('')}
    </table></div></div>`;
}

// ─── FUNNEL TAB ─────────────────────────────────────────────────────────────
async function loadFunnel() {
  const d = await $('funnel', { account: S.acct, date_preset: S.date });

  const stages = [
    { l: 'Impresiones', v: d.impressions, c: 'var(--dim)' },
    { l: 'Clicks', v: d.clicks, c: 'var(--b)' },
    { l: 'Link Clicks', v: d.linkClicks, c: 'var(--accent)' },
    { l: 'LP Views', v: d.lpViews, c: '#a78bfa' },
    { l: 'Add to Cart', v: d.addToCart, c: 'var(--o)' },
    { l: 'Checkout', v: d.checkout, c: 'var(--y)' },
    { l: 'Compras', v: d.purchases, c: 'var(--g)' },
    { l: 'Leads', v: d.leads, c: 'var(--b)' },
    { l: 'Seguidores', v: d.pageLikes, c: '#818cf8' },
    { l: 'Video Views', v: d.videoViews, c: '#f472b6' },
    { l: 'Mensajes', v: d.messaging, c: '#34d399' },
    { l: 'Engagement', v: d.postEngagement, c: '#fbbf24' },
  ].filter(s => s.v > 0);

  const max = stages[0]?.v || 1;
  const lpDrop = d.linkClicks > 0 && d.lpViews > 0 ? ((d.linkClicks - d.lpViews) / d.linkClicks * 100) : 0;
  const atcRate = d.lpViews > 0 ? (d.addToCart / d.lpViews * 100) : 0;

  Q('#kpis').innerHTML = `
    <div class="kpi ka"><div class="kpi-l">Gasto</div><div class="kpi-v">$${f(d.spend)}</div></div>
    <div class="kpi ${lpDrop > 30 ? 'kr' : ''}"><div class="kpi-l">LP Drop-off</div><div class="kpi-v ${lpDrop > 30 ? 'r' : ''}">${lpDrop ? lpDrop.toFixed(0)+'%' : '-'}</div><div class="kpi-s">Meta: <30%</div></div>
    <div class="kpi"><div class="kpi-l">ATC Rate</div><div class="kpi-v ${atcRate < 5 ? 'y' : atcRate >= 10 ? 'g' : ''}">${atcRate ? atcRate.toFixed(1)+'%' : '-'}</div><div class="kpi-s">Meta: >10%</div></div>
  `;

  let html = '';
  // Diagnostics
  if (lpDrop > 30) html += `<div class="alert alert-r"><b>Pagina lenta o mala experiencia.</b> ${lpDrop.toFixed(0)}% de los clicks se pierden antes de ver la landing. Esto NO es problema del anuncio — optimiza la velocidad de tu pagina.</div>`;
  if (d.clicks > 0 && d.purchases === 0 && d.leads === 0 && d.pageLikes === 0 && d.messaging === 0) html += `<div class="alert alert-r"><b>Clicks sin conversiones.</b> El anuncio funciona, el problema esta despues del click. Revisa tu landing page y oferta.</div>`;
  if (d.addToCart > 0 && d.purchases === 0) html += `<div class="alert alert-y"><b>Carritos abandonados.</b> La gente agrega al carrito pero no compra. Revisa el checkout: velocidad, metodos de pago, confianza.</div>`;
  if (!stages.length) html += `<div style="text-align:center;padding:40px;color:var(--dim)">Sin datos de embudo. Prueba otro rango de fecha.</div>`;

  // Funnel bars
  if (stages.length) {
    html += `<div class="tw"><div class="tw-h">Embudo de Conversion</div>`;
    html += stages.map((s, i) => {
      const pct = s.v / max * 100;
      const drop = i > 0 ? ((stages[i-1].v - s.v) / stages[i-1].v * 100) : 0;
      return `<div class="funnel-row"><div class="f-label">${s.l}</div><div class="f-bar"><div class="f-fill" style="width:${pct}%;background:${s.c}"></div></div><div class="f-val" style="color:${s.c}">${fi(s.v)}</div><div class="f-drop">${i > 0 ? '-'+drop.toFixed(0)+'%' : ''}</div></div>`;
    }).join('');
    html += '</div>';
  }

  Q('#out').innerHTML = html;
}

// ─── COUNTRIES TAB ──────────────────────────────────────────────────────────
async function loadCountries() {
  const data = await $('countries', { account: S.acct, date_preset: S.date });
  const ts = data.reduce((s,r) => s + r.spend, 0);
  const tr2 = data.reduce((s,r) => s + (r.results||0), 0);

  Q('#kpis').innerHTML = `
    <div class="kpi"><div class="kpi-l">Paises</div><div class="kpi-v">${data.length}</div></div>
    <div class="kpi ka"><div class="kpi-l">Gasto</div><div class="kpi-v">$${f(ts)}</div></div>
    <div class="kpi kg"><div class="kpi-l">Resultados</div><div class="kpi-v g">${fi(tr2)}</div></div>
  `;

  if (!data.length) { Q('#out').innerHTML = '<div style="text-align:center;padding:40px;color:var(--dim)">Sin datos. Prueba otro rango.</div>'; return; }

  const mx = data[0]?.spend || 1;
  Q('#out').innerHTML = `
    <div class="tw"><div class="tw-h">Paises (mejor a peor CPA)</div><table>
      <tr><th>Pais</th><th>Gasto</th><th></th><th>Resultados</th><th>CPA</th><th>CTR</th><th>% Gasto</th></tr>
      ${data.map(r => `<tr>
        <td style="font-weight:600">${r.country}</td>
        <td class="n">$${f(r.spend)}</td>
        <td><span class="pbar"><i style="width:${(r.spend/mx*100)}%;background:var(--accent)"></i></span></td>
        <td class="n g">${r.results||0}</td>
        <td class="n ${cpaC(r.cpa)}">${r.cpa ? '$'+f(r.cpa) : '-'}</td>
        <td class="n">${r.ctr.toFixed(2)}%</td>
        <td class="n">${ts > 0 ? (r.spend/ts*100).toFixed(1) : 0}%</td>
      </tr>`).join('')}
    </table></div>`;
}

// ─── DRILL DOWN ─────────────────────────────────────────────────────────────
window.drillCamp = (id, name) => { S.drill = { t: 'adsets', id, name }; load(); };
window.drillAdset = (id, name, cid, cname) => { S.drill = { t: 'ads', id, name, cid, cname }; load(); };

async function loadDrill() {
  const { t, id, name, cid, cname } = S.drill;
  const bc = Q('#bc'); bc.style.display = 'flex';

  if (t === 'adsets') {
    bc.innerHTML = `<span onclick="S.drill=null;load()">Campanas</span><span class="sep">/</span><span class="cur">${esc(name)}</span>`;
    const data = await $('adsets', { campaign: id, date_preset: S.date });
    const sorted = [...data].sort((a,b) => b.spend - a.spend);
    Q('#kpis').innerHTML = `<div class="kpi"><div class="kpi-l">Ad Sets</div><div class="kpi-v">${data.length}</div></div><div class="kpi ka"><div class="kpi-l">Gasto</div><div class="kpi-v">$${f(data.reduce((s,a)=>s+a.spend,0))}</div></div>`;
    Q('#out').innerHTML = `<div class="tw"><div class="tw-h">${esc(name)}</div><table>
      <tr><th></th><th>Ad Set</th><th>Budget</th><th>Gasto</th><th>Tipo</th><th>Result</th><th>Costo</th><th>CTR</th><th>Freq</th><th></th></tr>
      ${sorted.map(s => {
        const bud = s.daily_budget ? '$'+(s.daily_budget/100).toFixed(0)+'/d' : s.lifetime_budget ? '$'+(s.lifetime_budget/100).toFixed(0) : 'CBO';
        return `<tr>
          <td>${badge(s.status)}</td>
          <td><a href="#" onclick="drillAdset('${s.id}','${esc(s.name)}','${id}','${esc(name)}');return false" style="color:var(--text);text-decoration:none;font-weight:500">${esc(s.name)}</a></td>
          <td class="n">${bud}</td><td class="n">$${f(s.spend)}</td>
          <td style="color:var(--dim);font-size:11px">${s.resultType||'-'}</td>
          <td class="n g">${s.results||0}</td>
          <td class="n ${cpaC(s.costPerResult)}">${s.costPerResult ? '$'+f(s.costPerResult) : '-'}</td>
          <td class="n">${fp(s.ctr)}</td>
          <td class="n ${s.frequency > 3 ? 'r' : ''}">${s.frequency ? s.frequency.toFixed(1) : '-'}</td>
          <td><div style="display:flex;gap:3px">${s.status==='ACTIVE' ? `<button class="btn btn-sm btn-r" onclick="doPause('${s.id}')">Pausar</button>` : `<button class="btn btn-sm btn-g" onclick="doActivate('${s.id}')">Activar</button>`}<button class="btn btn-sm btn-y" onclick="openBud('${s.id}')">$$</button></div></td>
        </tr>`;}).join('')}</table></div>`;
  }

  if (t === 'ads') {
    bc.innerHTML = `<span onclick="S.drill=null;load()">Campanas</span><span class="sep">/</span><span onclick="drillCamp('${cid}','${esc(cname)}')">${esc(cname)}</span><span class="sep">/</span><span class="cur">${esc(name)}</span>`;
    const data = await $('ads', { adset: id, date_preset: S.date });
    const sorted = [...data].sort((a,b) => b.spend - a.spend);
    Q('#kpis').innerHTML = `<div class="kpi"><div class="kpi-l">Ads</div><div class="kpi-v">${data.length}</div></div><div class="kpi ka"><div class="kpi-l">Gasto</div><div class="kpi-v">$${f(data.reduce((s,a)=>s+a.spend,0))}</div></div>`;
    Q('#out').innerHTML = `<div class="tw"><div class="tw-h">${esc(name)}</div><div style="overflow-x:auto"><table>
      <tr><th></th><th></th><th>Ad</th><th>Gasto</th><th>Tipo</th><th>Result</th><th>Costo</th><th>CTR</th><th>CPC</th><th>Freq</th><th></th></tr>
      ${sorted.map(a => {
        const thumb = a.creative?.thumbnail_url;
        return `<tr>
          <td>${thumb ? `<img class="thumb" src="${thumb}">` : ''}</td>
          <td>${badge(a.status)}</td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;font-weight:500">${esc(a.name)}</td>
          <td class="n">$${f(a.spend)}</td>
          <td style="color:var(--dim);font-size:11px">${a.resultType||'-'}</td>
          <td class="n g">${a.results||0}</td>
          <td class="n ${cpaC(a.costPerResult)}">${a.costPerResult ? '$'+f(a.costPerResult) : '-'}</td>
          <td class="n">${fp(a.ctr)}</td>
          <td class="n">$${f(a.cpc)}</td>
          <td class="n ${a.frequency > 3 ? 'r' : ''}">${a.frequency ? a.frequency.toFixed(1) : '-'}</td>
          <td>${a.status==='ACTIVE' ? `<button class="btn btn-sm btn-r" onclick="doPause('${a.id}')">Pausar</button>` : `<button class="btn btn-sm btn-g" onclick="doActivate('${a.id}')">Activar</button>`}</td>
        </tr>`;}).join('')}</table></div></div>`;
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────
window.doPause = async id => { if (!confirm('Pausar?')) return; try { await POST('pause',{id}); toast('Pausado'); load(); } catch(e) { toast(e.message,false); }};
window.doActivate = async id => { if (!confirm('Activar?')) return; try { await POST('activate',{id}); toast('Activado'); load(); } catch(e) { toast(e.message,false); }};
window.openBud = id => { Q('#bid').value = id; Q('#bamt').value = ''; Q('#bmod').classList.add('open'); };
window.saveBudget = async () => {
  const id = Q('#bid').value, amt = parseFloat(Q('#bamt').value);
  if (!amt || amt <= 0) { toast('Monto invalido',false); return; }
  try { await POST('budget',{id,amount:amt,type:'daily'}); toast('Budget -> $'+f(amt)+'/dia'); Q('#bmod').classList.remove('open'); load(); }
  catch(e) { toast(e.message,false); }
};

init();
