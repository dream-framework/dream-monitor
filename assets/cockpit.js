const URL = 'data/derived/world_snapshot.json';
let dreamOn = false;
const esc = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmt = (v,d=2) => v===null||v===undefined?'—':Number(v).toFixed(d);
const ago = ts => { if(!ts) return '—'; const s=Math.round((Date.now()-new Date(ts))/1000); return s<60?s+'s':s<3600?Math.round(s/60)+'m':Math.round(s/3600)+'h'; };

function spark(vals, color='#22d3ee') {
  if (!vals || !vals.length) return '';
  const w=100,h=20,step=w/(vals.length-1||1);
  const pts = vals.map((v,i)=>`${i*step},${h-v*(h/100)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1"/></svg>`;
}

function dreamBlock(feed) {
  if (!feed.dream) return '';
  const d = feed.dream;
  const cls = d.regime === 'EXTRACTION' ? 'ext' : d.regime === 'NATURAL' ? 'nat' : '';
  return `<div class="dream-overlay ${dreamOn?'show':''}">
    <span class="d-label">D=</span><span class="d-val ${cls}">${fmt(d.D,3)}</span>
    <span class="d-label"> R²=${fmt(d.r2,3)} ${d.regime}</span>
    ${d.retention_curve ? spark(d.retention_curve.map((v,i)=>v*100), d.regime==='EXTRACTION'?'#f87171':d.regime==='NATURAL'?'#4ade80':'#fbbf24') : ''}
  </div>`;
}

function render(s) {
  const f = s.feeds || {};
  const sm = s.summary || {};
  const ds = s.dream_summary || {};
  let html = `<div class="hdr">
    <div class="hdr-l"><span class="logo">D</span><div><strong>DREAM</strong> <small>World Observatory</small></div></div>
    <div class="hdr-r">
      <span class="stamp">${ago(s.generated_at)} ago</span>
      <span class="dot ${sm.ok_feeds>0?'ok':'err'}"></span>
      <button class="dream-toggle ${dreamOn?'on':''}" onclick="dreamOn=!dreamOn;render(snap)">DREAM</button>
      <button onclick="load()">↻</button>
    </div>
  </div>`;

  // KPIs
  html += `<div class="kpis">
    <div class="kpi"><span>Feeds</span><strong>${sm.total_feeds||0}</strong><small>${sm.ok_feeds||0} live</small></div>
    <div class="kpi g"><span>Natural</span><strong>${ds.natural||0}</strong><small>D<0.8</small></div>
    <div class="kpi r"><span>Extraction</span><strong>${ds.extraction||0}</strong><small>D>1</small></div>
    <div class="kpi a"><span>Threshold</span><strong>${ds.threshold||0}</strong><small>D≈1</small></div>
    <div class="kpi"><span>Quakes</span><strong>${f.earthquakes?.count||0}</strong><small>24h</small></div>
    <div class="kpi"><span>Flights</span><strong>${f.flights?(f.flights.count/1000).toFixed(1)+'k':'—'}</strong><small>airborne</small></div>
    <div class="kpi"><span>Crypto</span><strong>${f.crypto?.coins?.find(c=>c.symbol==='BTC')?.price?.toFixed(0)||'—'}</strong><small>BTC</small></div>
  </div>`;

  html += '<div class="grid">';

  // Earthquakes
  const eq = f.earthquakes || {};
  if (eq.status === 'ok') {
    html += `<div class="panel">${dreamBlock(eq)}
      <div class="p-head"><span class="p-title">🌍 Earthquakes</span><span class="p-cat">geophysical</span></div>
      <div class="p-body"><strong style="font-size:14px">${eq.count} events · max M${fmt(eq.max_mag,1)}</strong>
      ${spark(eq.sparkline, '#fbbf24')}
      ${(eq.latest||[]).slice(0,8).map(q=>`<div class="quake-row"><span class="quake-mag ${q.mag>=5?'m5':q.mag>=4.5?'m45':''}">M${fmt(q.mag,1)}</span><span class="quake-place">${esc(q.place)}</span><span class="quake-depth">${fmt(q.depth,0)}km</span></div>`).join('')}
      </div></div>`;
  } else { html += `<div class="panel fail"><div class="p-head"><span class="p-title">🌍 Earthquakes</span></div><div class="p-body">—</div></div>`; }

  // Flights
  const fl = f.flights || {};
  if (fl.status === 'ok') {
    html += `<div class="panel">${dreamBlock(fl)}
      <div class="p-head"><span class="p-title">✈️ Flights</span><span class="p-cat">aviation</span></div>
      <div class="p-body"><div class="flight-info"><span class="big">${fl.count.toLocaleString()}</span><span>aircraft airborne</span></div>
      ${(Object.entries(fl.bands||{})).map(([k,v])=>`<div class="band-row"><span>${k}</span><span>${v}</span></div>`).join('')}
      <div style="margin-top:4px;font-size:9px;color:var(--muted)">Top: ${(fl.top_origins||[]).slice(0,5).map(([c,n])=>`${c}(${n})`).join(', ')}</div>
      </div></div>`;
  } else { html += `<div class="panel fail"><div class="p-head"><span class="p-title">✈️ Flights</span></div><div class="p-body">—</div></div>`; }

  // Crypto
  const cr = f.crypto || {};
  if (cr.status === 'ok') {
    html += `<div class="panel">${dreamBlock(cr)}
      <div class="p-head"><span class="p-title">₿ Crypto</span><span class="p-cat">markets</span></div>
      <div class="p-body">${(cr.coins||[]).map(c=>`<div class="coin-row"><span class="coin-name">${esc(c.symbol)}</span><span class="coin-price">$${c.price>1?c.price.toLocaleString(undefined,{maximumFractionDigits:0}):c.price.toFixed(4)}</span><span class="coin-chg ${c.change_24h>=0?'up':'down'}">${c.change_24h>=0?'+':''}${fmt(c.change_24h,1)}%</span></div>`).join('')}
      ${spark(cr.sparkline, '#fbbf24')}</div></div>`;
  } else { html += `<div class="panel fail"><div class="p-head"><span class="p-title">₿ Crypto</span></div><div class="p-body">—</div></div>`; }

  // News
  const nw = f.news || {};
  if (nw.status === 'ok') {
    html += `<div class="panel">
      <div class="p-head"><span class="p-title">📰 News (GDELT)</span><span class="p-cat">news</span></div>
      <div class="p-body" style="max-height:200px;overflow-y:auto">${(nw.articles||[]).map(a=>`<div class="news-item"><a href="${esc(a.url)}" target="_blank">${esc(a.title)}</a><div class="meta">${esc(a.source)} · ${esc(a.country||'')}</div></div>`).join('')}</div></div>`;
  } else { html += `<div class="panel fail"><div class="p-head"><span class="p-title">📰 News</span></div><div class="p-body">—</div></div>`; }

  // Weather
  const wt = f.weather || {};
  if (wt.status === 'ok') {
    html += `<div class="panel">${dreamBlock(wt)}
      <div class="p-head"><span class="p-title">🌡️ Weather</span><span class="p-cat">environment</span></div>
      <div class="p-body">${(wt.cities||[]).map(w=>`<div class="wthr-row"><span class="wthr-city">${esc(w.city)}</span><span class="wthr-temp ${w.temp>30?'hot':w.temp<5?'cold':''}">${w.temp}°C</span><span style="color:var(--muted)">${w.wind}km/h</span></div>`).join('')}</div></div>`;
  } else { html += `<div class="panel fail"><div class="p-head"><span class="p-title">🌡️ Weather</span></div><div class="p-body">—</div></div>`; }

  // FX
  const fx = f.fx || {};
  if (fx.status === 'ok') {
    html += `<div class="panel">
      <div class="p-head"><span class="p-title">💱 FX Rates</span><span class="p-cat">markets</span></div>
      <div class="p-body">${(fx.rates||[]).map(r=>`<div class="fx-row"><span class="fx-pair">${esc(r.pair)}</span><span class="fx-rate">${fmt(r.rate,4)}</span></div>`).join('')}</div></div>`;
  } else { html += `<div class="panel fail"><div class="p-head"><span class="p-title">💱 FX</span></div><div class="p-body">—</div></div>`; }

  // Markets (FRED)
  const mk = f.markets || {};
  if (mk.status === 'ok') {
    html += `<div class="panel">
      <div class="p-head"><span class="p-title">📈 Markets</span><span class="p-cat">markets</span></div>
      <div class="p-body">${(mk.instruments||[]).map(m=>`<div class="coin-row"><span class="coin-name">${esc(m.name)}</span><span class="coin-price">${m.current>100?fmt(m.current,0):fmt(m.current,2)}</span>${spark(m.sparkline,'#22d3ee')}${m.dream?`<span style="font-size:8px;color:${m.dream.regime==='EXTRACTION'?'var(--bad)':m.dream.regime==='NATURAL'?'var(--good)':'var(--warn)'}">D=${fmt(m.dream.D,2)}</span>`:''}</div>`).join('')}</div></div>`;
  } else { html += `<div class="panel fail"><div class="p-head"><span class="p-title">📈 Markets</span></div><div class="p-body">—</div></div>`; }

  // Reddit
  const rd = f.reddit || {};
  if (rd.status === 'ok') {
    html += `<div class="panel">${dreamBlock(rd)}
      <div class="p-head"><span class="p-title">💬 Reddit</span><span class="p-cat">social</span></div>
      <div class="p-body" style="max-height:180px;overflow-y:auto">${(rd.posts||[]).slice(0,8).map(p=>`<div class="reddit-item"><a href="${esc(p.url)}" target="_blank">${esc(p.title)}</a><div class="reddit-meta">↑${p.score} · ${p.comments} comments</div></div>`).join('')}</div></div>`;
  } else { html += `<div class="panel fail"><div class="p-head"><span class="p-title">💬 Reddit</span></div><div class="p-body">—</div></div>`; }

  // Wikipedia
  const wk = f.wikipedia || {};
  if (wk.status === 'ok') {
    html += `<div class="panel">
      <div class="p-head"><span class="p-title">📚 Wikipedia</span><span class="p-cat">social</span></div>
      <div class="p-body" style="max-height:180px;overflow-y:auto"><strong>${wk.count} recent edits</strong>${(wk.edits||[]).slice(0,10).map(e=>`<div class="wiki-item">${esc(e.title)}</div>`).join('')}</div></div>`;
  } else { html += `<div class="panel fail"><div class="p-head"><span class="p-title">📚 Wikipedia</span></div><div class="p-body">—</div></div>`; }

  // Solar wind
  const sw = f.solar_wind || {};
  if (sw.status === 'ok') {
    html += `<div class="panel">${dreamBlock(sw)}
      <div class="p-head"><span class="p-title">☀️ Solar Wind</span><span class="p-cat">space</span></div>
      <div class="p-body"><strong style="font-size:18px">${fmt(sw.current,0)} km/s</strong>${spark(sw.sparkline,'#fbbf24')}</div></div>`;
  } else { html += `<div class="panel fail"><div class="p-head"><span class="p-title">☀️ Solar Wind</span></div><div class="p-body">—</div></div>`; }

  html += '</div>';
  html += `<footer>DREAM World Observatory · live data · S2 analysis overlay · not financial advice</footer>`;
  document.getElementById('app').innerHTML = html;
}

let snap = null;
async function load() {
  try {
    const r = await fetch(`${URL}?v=${Date.now()}`, {cache:'no-store'});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    snap = await r.json();
    render(snap);
  } catch(e) {
    document.getElementById('app').innerHTML = `<div style="padding:20px;color:var(--bad)">Error: ${esc(e.message)}</div>`;
  }
}

load();
setInterval(load, 60000);
