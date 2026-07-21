const URL='data/derived/world_snapshot.json';
let dreamOn=false; let snap=null; let charts={};
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmt=(v,d=2)=>v===null||v===undefined?'—':Number(v).toFixed(d);
const ago=ts=>{if(!ts)return'—';const s=Math.round((Date.now()-new Date(ts))/1000);return s<60?s+'s':s<3600?Math.round(s/60)+'m':Math.round(s/3600)+'h';};

function spark(vals,color='#22d3ee'){
  if(!vals||!vals.length)return'';
  const w=100,h=24,step=w/(vals.length-1||1);
  const pts=vals.map((v,i)=>`${i*step},${h-v*(h/100)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
}

function dreamGraph(d, feedName){
  if(!d||!d.retention_curve||!d.retention_curve.length)return'';
  const w=240,h=90,pad=8;
  const acf=d.retention_curve;
  const fit=d.fit_curve||[];
  const n=acf.length;
  const x=i=>pad+(i/(n-1))*(w-2*pad);
  const y=v=>h-pad-Math.max(0,Math.min(1,v))*(h-2*pad);
  const color=d.regime==='EXTRACTION'?'#f87171':d.regime==='NATURAL'?'#4ade80':'#fbbf24';
  
  // ACF points as circles + line
  let acfPts=acf.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
  let acfDots=acf.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="1.5" fill="${color}" opacity="0.6"/>`).join('');
  
  // S2 fit curve
  let fitPath='';
  if(fit.length){
    const fitStep=(n-1)/(fit.length-1);
    fitPath=`<polyline points="${fit.map((v,i)=>`${x(i*fitStep)},${y(v)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.9"/>`;
  }
  
  // Labels
  const D=d.D.toFixed(3);
  const regimeColor=color;
  const narrate = d.regime==='EXTRACTION' 
    ? `D=${D} > 1: extraction regime — retention collapses super-exponentially`
    : d.regime==='NATURAL' 
    ? `D=${D} < 0.8: natural regime — slow, heavy-tailed decay`
    : `D=${D} ≈ 1: threshold zone — phase transition`;
  
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:90px" preserveAspectRatio="none">
    <!-- grid -->
    <line x1="0" y1="${h/2}" x2="${w}" y2="${h/2}" stroke="#1a2238" stroke-width="0.5" stroke-dasharray="3,3"/>
    <!-- ACF data -->
    <polyline points="${acfPts}" fill="none" stroke="${color}" stroke-width="1" opacity="0.4"/>
    ${acfDots}
    <!-- S2 fit -->
    ${fitPath}
    <!-- D label -->
    <text x="${pad}" y="${pad+4}" fill="${regimeColor}" font-size="11" font-family="monospace" font-weight="700">D=${D}</text>
    <text x="${pad}" y="${pad+16}" fill="#5a6783" font-size="8" font-family="sans-serif">${d.regime}</text>
    <!-- R² label -->
    <text x="${w-pad-40}" y="${pad+4}" fill="#5a6783" font-size="9" font-family="monospace" text-anchor="end">R²=${d.r2.toFixed(3)}</text>
    <!-- axis labels -->
    <text x="${pad}" y="${h-2}" fill="#3d4a63" font-size="7">lag→</text>
    <text x="2" y="${pad+4}" fill="#3d4a63" font-size="7">R(t)</text>
  </svg>
  <div style="font-size:9px;color:var(--m2);padding:2px 4px;background:var(--bg);border-radius:3px;margin-top:2px">${esc(narrate)}</div>`;
}

function dreamBlock(dream, feedName){
  if(!dream)return'';
  const d=dream;
  const cls=d.regime==='EXTRACTION'?'ext':d.regime==='NATURAL'?'nat':'thr';
  const vcls=d.verdict==='S2_WINS'?'win':d.verdict==='S2_TIES'?'tie':'lose';
  const ma=d.model_aicc||{};
  return `<div class="dream-panel ${dreamOn?'show':''}">
    <div class="dp-graph">${dreamGraph(d, feedName)}</div>
    <div class="dp-models">
      <div class="dp-row ${d.verdict==='S2_WINS'?'win':''}"><span>S2</span><strong>${ma.S2??'—'}</strong></div>
      <div class="dp-row"><span>EXP</span><strong>${ma.EXP??'—'}</strong></div>
      <div class="dp-row"><span>POWER</span><strong>${ma.POWER??'—'}</strong></div>
      <div class="dp-row"><span>ΔAICc</span><strong>${fmt(d.delta_aicc,1)}</strong></div>
    </div>
    <div class="dp-verdict ${vcls}">${d.verdict.replace(/_/g,' ')} · ${esc(d.model_note)}</div>
  </div>`;
}

function render(s){
  const f=s.feeds||{};const sm=s.summary||{};const ds=s.dream_summary||{};
  let h=`<div class="hdr"><div class="hdr-l"><span class="logo">D</span><div><strong>DREAM</strong> <small>World Observatory</small></div></div>
  <div class="hdr-r"><span class="stamp">${ago(s.generated_at)} ago</span><span class="dot ${sm.ok_feeds>0?'ok':'err'}"></span>
  <button class="dream-toggle ${dreamOn?'on':''}" onclick="dreamOn=!dreamOn;render(snap)">DREAM ${dreamOn?'ON':'OFF'}</button>
  <button onclick="load()">↻</button></div></div>`;

  h+=`<div class="kpis">
    <div class="kpi"><span>Feeds</span><strong>${sm.total_feeds||0}</strong><small>${sm.ok_feeds||0} live</small></div>
    <div class="kpi g"><span>Natural</span><strong>${ds.natural||0}</strong><small>D&lt;0.8</small></div>
    <div class="kpi r"><span>Extraction</span><strong>${ds.extraction||0}</strong><small>D&gt;1</small></div>
    <div class="kpi a"><span>Threshold</span><strong>${ds.threshold||0}</strong><small>D≈1</small></div>
  </div><div class="grid">`;

  // 1. NEWS (first)
  const nw=f.news||{};
  h+=nw.status==='ok'?`<div class="panel">
    <div class="p-head"><span class="p-title">📰 Global News</span><span class="p-cat">news</span></div>
    <div class="p-body scroll">${(nw.articles||[]).slice(0,12).map(a=>`<div class="news-item"><a href="${esc(a.url)}" target="_blank">${esc(a.title)}</a><div class="meta">${esc(a.source||'')} ${esc(a.date||'')}</div></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">📰 News</span></div></div>`;

  // 2. Markets (with inline D values)
  const mk=f.markets||{};
  h+=mk.status==='ok'?`<div class="panel">
    <div class="p-head"><span class="p-title">📈 Markets</span><span class="p-cat">markets</span></div>
    <div class="p-body">${(mk.instruments||[]).map(m=>{
      const dr=m.dream||{};const cls=dr.regime==='EXTRACTION'?'ext':dr.regime==='NATURAL'?'nat':'thr';
      const dColor=dr.regime==='EXTRACTION'?'#f87171':dr.regime==='NATURAL'?'#4ade80':'#fbbf24';
      return `<div class="coin-row" title="${dr.model_note||''}"><span class="coin-name">${esc(m.name)}</span><span class="coin-price">${m.current>100?fmt(m.current,0):fmt(m.current,2)}</span>${spark(m.sparkline,dColor)}<span class="coin-d ${cls}" title="D=${fmt(dr.D,3)} ${dr.regime}">${fmt(dr.D,2)}</span></div>`;
    }).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">📈 Markets</span></div></div>`;

  // 3. Markets DREAM (single graph per instrument, NOT 2)
  if(mk.status==='ok'&&(mk.instruments||[]).some(m=>m.dream)){
    const instWithDream=(mk.instruments||[]).filter(m=>m.dream);
    h+=`<div class="panel">
      <div class="p-head"><span class="p-title">🔬 S2 Analysis</span><span class="p-cat">DREAM</span></div>
      <div class="p-body scroll">
        <div style="margin-bottom:4px">
          <select id="dreamSelect" onchange="renderMarketDream()" style="background:var(--bg2);color:var(--fg);border:1px solid var(--border);border-radius:4px;padding:3px 6px;font-size:11px;width:100%">
            ${instWithDream.map((m,i)=>`<option value="${i}">${esc(m.name)} (D=${fmt(m.dream.D,2)})</option>`).join('')}
          </select>
        </div>
        <div id="marketDreamContent"></div>
      </div></div>`;
  }

  // 4. Weather
  const wt=f.weather||{};
  h+=wt.status==='ok'?`<div class="panel">${dreamBlock(wt.dream,'Weather')}
    <div class="p-head"><span class="p-title">🌡️ Weather</span><span class="p-cat">env</span></div>
    <div class="p-body scroll">${(wt.cities||[]).map(w=>`<div class="wthr-row"><span class="wthr-city">${esc(w.city)}</span><span class="wthr-temp ${w.temp>30?'hot':w.temp<5?'cold':''}">${w.temp}°C</span><span style="color:var(--muted)">${w.wind}km/h</span></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">🌡️ Weather</span></div></div>`;

  // 5. FX
  const fx=f.fx||{};
  h+=fx.status==='ok'?`<div class="panel">
    <div class="p-head"><span class="p-title">💱 FX Rates</span><span class="p-cat">markets</span></div>
    <div class="p-body">${(fx.rates||[]).map(r=>`<div class="fx-row"><span class="fx-pair">${esc(r.pair)}</span><span class="fx-rate">${fmt(r.rate,4)}</span></div>`).join('')}<div class="meta">${esc(fx.date)}</div></div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">💱 FX</span></div></div>`;

  // 6. FX History
  const fxh=f.fx_history||{};
  h+=fxh.status==='ok'?`<div class="panel">${dreamBlock(fxh.dream,'FX History')}
    <div class="p-head"><span class="p-title">📊 FX History</span><span class="p-cat">markets</span></div>
    <div class="p-body"><strong>USD/EUR ${fxh.n_days||0} days</strong>${spark(fxh.sparkline,'#22d3ee')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">📊 FX History</span></div></div>`;

  // 7. Space Weather
  const sw=f.space_weather||f.solar_wind||{};
  h+=sw.status==='ok'?`<div class="panel">${dreamBlock(sw.dream,'Space Weather')}
    <div class="p-head"><span class="p-title">☀️ Space Weather</span><span class="p-cat">space</span></div>
    <div class="p-body"><strong style="font-size:16px">Kp=${fmt(sw.current,1)}</strong>${spark(sw.sparkline,'#fbbf24')}<div class="meta">${sw.count} readings</div></div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">☀️ Space Weather</span></div></div>`;

  // 8. Solar Flux
  const sf=f.solar_flux||{};
  h+=sf.status==='ok'?`<div class="panel">${dreamBlock(sf.dream,'Solar Flux')}
    <div class="p-head"><span class="p-title">📡 Solar Flux</span><span class="p-cat">space</span></div>
    <div class="p-body"><strong style="font-size:16px">${fmt(sf.current,0)} sfu</strong>${spark(sf.sparkline,'#fbbf24')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">📡 Solar Flux</span></div></div>`;

  // 9. Flights
  const fl=f.flights||{};
  h+=fl.status==='ok'?`<div class="panel">${dreamBlock(fl.dream,'Flights')}
    <div class="p-head"><span class="p-title">✈️ Flights</span><span class="p-cat">aviation</span></div>
    <div class="p-body"><div class="flight-info"><span class="big">${(fl.count||0).toLocaleString()}</span><span>aircraft airborne</span></div>
    ${Object.entries(fl.bands||{}).map(([k,v])=>`<div class="band-row"><span>${k}</span><span>${v}</span></div>`).join('')}
    </div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">✈️ Flights</span><div class="meta">timeout — will retry next scan</div></div></div>`;

  // 10. Reddit
  const rd=f.reddit||{};
  h+=rd.status==='ok'?`<div class="panel">
    <div class="p-head"><span class="p-title">💬 Reddit</span><span class="p-cat">social</span></div>
    <div class="p-body scroll">${(rd.posts||[]).slice(0,10).map(p=>`<div class="reddit-item"><a href="${esc(p.url)}" target="_blank">${esc(p.title)}</a></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">💬 Reddit</span></div></div>`;

  // 11. Wikipedia
  const wk=f.wikipedia||{};
  h+=wk.status==='ok'?`<div class="panel">${dreamBlock(wk.dream,'Wikipedia')}
    <div class="p-head"><span class="p-title">📚 Wikipedia</span><span class="p-cat">social</span></div>
    <div class="p-body scroll"><strong>${wk.count} recent edits</strong>${(wk.edits||[]).slice(0,10).map(e=>`<div class="wiki-item">${esc(e.title)}</div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">📚 Wikipedia</span></div></div>`;

  // 12. Hacker News
  const hn=f.hackernews||{};
  h+=hn.status==='ok'?`<div class="panel">
    <div class="p-head"><span class="p-title">🔧 Hacker News</span><span class="p-cat">tech</span></div>
    <div class="p-body scroll">${(hn.stories||[]).slice(0,10).map(s=>`<div class="news-item"><a href="${esc(s.url)||'#'}" target="_blank">${esc(s.title)}</a><div class="meta">↑${s.score} · ${s.comments} comments</div></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">🔧 Hacker News</span></div></div>`;

  // 13. GitHub
  const gh=f.github||{};
  h+=gh.status==='ok'?`<div class="panel">
    <div class="p-head"><span class="p-title">⚡ GitHub</span><span class="p-cat">tech</span></div>
    <div class="p-body scroll">${(gh.repos||[]).slice(0,10).map(r=>`<div class="news-item"><a href="${esc(r.url)}" target="_blank">${esc(r.name)}</a><div class="meta">★${r.stars} ${esc(r.lang||'')}</div></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">⚡ GitHub</span></div></div>`;

  // 14. Earthquakes (LAST)
  const eq=f.earthquakes||{};
  h+=eq.status==='ok'?`<div class="panel">${dreamBlock(eq.dream,'Earthquakes')}
    <div class="p-head"><span class="p-title">🌍 Earthquakes</span><span class="p-cat">geo</span></div>
    <div class="p-body scroll"><strong>${eq.count} events · max M${fmt(eq.max_mag,1)}</strong>${spark(eq.sparkline,'#fbbf24')}
    ${(eq.latest||[]).slice(0,8).map(q=>`<div class="quake-row"><span class="quake-mag ${q.mag>=5?'m5':q.mag>=4.5?'m45':''}">M${fmt(q.mag,1)}</span><span class="quake-place">${esc(q.place)}</span><span class="quake-depth">${fmt(q.depth,0)}km</span></div>`).join('')}
    </div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">🌍 Earthquakes</span></div></div>`;

  h+=`</div><footer>DREAM World Observatory · live data · S2 retention analysis · not financial advice</footer>`;
  document.getElementById('app').innerHTML=h;
  
  // Render market dream selector content
  renderMarketDream();
}

function renderMarketDream(){
  if(!snap)return;
  const mk=snap.feeds?.markets;
  if(!mk||mk.status!=='ok')return;
  const instWithDream=(mk.instruments||[]).filter(m=>m.dream);
  if(!instWithDream.length)return;
  const sel=document.getElementById('dreamSelect');
  if(!sel)return;
  const idx=parseInt(sel.value)||0;
  const m=instWithDream[idx];
  const el=document.getElementById('marketDreamContent');
  if(el&&m.dream){
    el.innerHTML=dreamBlock(m.dream,m.name);
  }
}

async function load(){
  try{
    const r=await fetch(`${URL}?v=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    snap=await r.json();render(snap);
  }catch(e){
    document.getElementById('app').innerHTML=`<div style="padding:20px;color:var(--bad)">Error: ${esc(e.message)}</div>`;
  }
}
load();setInterval(load,60000);
