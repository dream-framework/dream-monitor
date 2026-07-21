const URL='data/derived/world_snapshot.json';
let dreamOn=false; let snap=null;
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmt=(v,d=2)=>v===null||v===undefined?'—':Number(v).toFixed(d);
const ago=ts=>{if(!ts)return'—';const s=Math.round((Date.now()-new Date(ts))/1000);return s<60?s+'s':s<3600?Math.round(s/60)+'m':Math.round(s/3600)+'h';};

function spark(vals,color='#22d3ee'){
  if(!vals||!vals.length)return'';
  const w=100,h=24,step=w/(vals.length-1||1);
  const pts=vals.map((v,i)=>`${i*step},${h-v*(h/100)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
}

function dreamGraph(d){
  if(!d||!d.retention_curve||!d.retention_curve.length)return'';
  const w=200,h=70,pad=6;
  const acf=d.retention_curve;
  const fit=d.fit_curve||[];
  const maxT=acf.length;
  const x=i=>pad+(i/(maxT-1))*(w-2*pad);
  const y=v=>h-pad-v*(h-2*pad);
  let acfPts=acf.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
  let fitPts='';
  if(fit.length){
    const fitStep=(maxT-1)/(fit.length-1);
    fitPts=fit.map((v,i)=>`${x(i*fitStep)},${y(v)}`).join(' ');
  }
  const color=d.regime==='EXTRACTION'?'#f87171':d.regime==='NATURAL'?'#4ade80':'#fbbf24';
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <line x1="0" y1="${h/2}" x2="${w}" y2="${h/2}" stroke="#1a2238" stroke-width="0.5" stroke-dasharray="2"/>
    <polyline points="${acfPts}" fill="none" stroke="${color}" stroke-width="1" opacity="0.5"/>
    ${fitPts?`<polyline points="${fitPts}" fill="none" stroke="${color}" stroke-width="2"/>`:''}
  </svg>`;
}

function dreamBlock(dream){
  if(!dream)return'';
  const d=dream;
  const cls=d.regime==='EXTRACTION'?'ext':d.regime==='NATURAL'?'nat':'thr';
  const vcls=d.verdict==='S2_WINS'?'win':d.verdict==='S2_TIES'?'tie':'lose';
  const ma=d.model_aicc||{};
  const s2cls=ma.S2&&(!ma.EXP||ma.S2<ma.EXP)&&(!ma.POWER||ma.S2<ma.POWER)?'win':'';
  const expcls=ma.EXP&&ma.EXP<ma.S2?'lose':'';
  const powcls=ma.POWER&&ma.POWER<ma.S2?'lose':'';
  return `<div class="dream-panel ${dreamOn?'show':''}">
    <div class="dp-graph">${dreamGraph(d)}</div>
    <div class="dp-stats">
      <div class="dp-row"><span>D</span><strong class="${cls}">${fmt(d.D,3)}</strong></div>
      <div class="dp-row"><span>λq</span><strong>${fmt(d.lambda_q,1)}</strong></div>
      <div class="dp-row"><span>R²</span><strong>${fmt(d.r2,3)}</strong></div>
      <div class="dp-row"><span>Regime</span><strong class="${cls}">${d.regime}</strong></div>
    </div>
    <div class="dp-models">
      <div class="dp-row ${s2cls}"><span>S2</span><strong>${ma.S2??'—'}</strong></div>
      <div class="dp-row ${expcls}"><span>EXP</span><strong>${ma.EXP??'—'}</strong></div>
      <div class="dp-row ${powcls}"><span>POWER</span><strong>${ma.POWER??'—'}</strong></div>
    </div>
    <div class="dp-verdict ${vcls}">${d.verdict.replace(/_/g,' ')} · ΔAICc=${fmt(d.delta_aicc,1)}</div>
    <div class="dp-note">${esc(d.model_note)}</div>
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
    <div class="kpi"><span>Quakes</span><strong>${f.earthquakes?.count||0}</strong><small>24h</small></div>
    <div class="kpi"><span>Flights</span><strong>${f.flights?(f.flights.count/1000).toFixed(1)+'k':'—'}</strong><small>airborne</small></div>
  </div><div class="grid">`;

  // Earthquakes
  const eq=f.earthquakes||{};
  h+=eq.status==='ok'?`<div class="panel">${dreamBlock(eq.dream)}
    <div class="p-head"><span class="p-title">🌍 Earthquakes</span><span class="p-cat">geo</span></div>
    <div class="p-body"><strong>${eq.count} events · max M${fmt(eq.max_mag,1)}</strong>${spark(eq.sparkline,'#fbbf24')}
    ${(eq.latest||[]).slice(0,10).map(q=>`<div class="quake-row"><span class="quake-mag ${q.mag>=5?'m5':q.mag>=4.5?'m45':''}">M${fmt(q.mag,1)}</span><span class="quake-place">${esc(q.place)}</span><span class="quake-depth">${fmt(q.depth,0)}km</span></div>`).join('')}
    </div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">🌍 Earthquakes</span></div></div>`;

  // Markets
  const mk=f.markets||{};
  h+=mk.status==='ok'?`<div class="panel">
    <div class="p-head"><span class="p-title">📈 Markets</span><span class="p-cat">markets</span></div>
    <div class="p-body">${(mk.instruments||[]).map(m=>{
      const dr=m.dream||{};const cls=dr.regime==='EXTRACTION'?'ext':dr.regime==='NATURAL'?'nat':'thr';
      return `<div class="coin-row"><span class="coin-name">${esc(m.name)}</span><span class="coin-price">${m.current>100?fmt(m.current,0):fmt(m.current,2)}</span>${spark(m.sparkline,dr.regime==='EXTRACTION'?'#f87171':dr.regime==='NATURAL'?'#4ade80':'#22d3ee')}<span class="coin-d ${cls}">D=${fmt(dr.D,2)}</span></div>`;
    }).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">📈 Markets</span></div></div>`;

  // DREAM analysis panel for markets (shows when DREAM toggle is ON)
  if(mk.status==='ok'&&(mk.instruments||[]).some(m=>m.dream)){
    const instWithDream=(mk.instruments||[]).filter(m=>m.dream);
    h+=`<div class="panel">
      <div class="p-head"><span class="p-title">🔬 Market DREAM</span><span class="p-cat">analysis</span></div>
      <div class="p-body">${instWithDream.slice(0,3).map(m=>dreamBlock(m.dream)).join('')}
      ${instWithDream.length>3?`<div class="meta">${instWithDream.length-3} more — toggle individual instruments</div>`:''}
      </div></div>`;
  }

  // Flights
  const fl=f.flights||{};
  h+=fl.status==='ok'?`<div class="panel">${dreamBlock(fl.dream)}
    <div class="p-head"><span class="p-title">✈️ Flights</span><span class="p-cat">aviation</span></div>
    <div class="p-body"><div class="flight-info"><span class="big">${(fl.count||0).toLocaleString()}</span><span>aircraft airborne</span></div>
    ${Object.entries(fl.bands||{}).map(([k,v])=>`<div class="band-row"><span>${k}</span><span>${v}</span></div>`).join('')}
    <div class="meta">Top: ${(fl.top_origins||[]).slice(0,6).map(([c,n])=>`${c}(${n})`).join(', ')}</div>
    </div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">✈️ Flights</span></div></div>`;

  // News
  const nw=f.news||{};
  h+=nw.status==='ok'?`<div class="panel">
    <div class="p-head"><span class="p-title">📰 News</span><span class="p-cat">news</span></div>
    <div class="p-body scroll">${(nw.articles||[]).slice(0,12).map(a=>`<div class="news-item"><a href="${esc(a.url)}" target="_blank">${esc(a.title)}</a><div class="meta">${esc(a.source||'')} ${esc(a.date||'')}</div></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">📰 News</span></div></div>`;

  // Weather
  const wt=f.weather||{};
  h+=wt.status==='ok'?`<div class="panel">${dreamBlock(wt.dream)}
    <div class="p-head"><span class="p-title">🌡️ Weather</span><span class="p-cat">env</span></div>
    <div class="p-body scroll">${(wt.cities||[]).map(w=>`<div class="wthr-row"><span class="wthr-city">${esc(w.city)}</span><span class="wthr-temp ${w.temp>30?'hot':w.temp<5?'cold':''}">${w.temp}°C</span><span style="color:var(--muted)">${w.wind}km/h ${w.humidity}%</span></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">🌡️ Weather</span></div></div>`;

  // FX
  const fx=f.fx||{};
  h+=fx.status==='ok'?`<div class="panel">
    <div class="p-head"><span class="p-title">💱 FX Rates</span><span class="p-cat">markets</span></div>
    <div class="p-body">${(fx.rates||[]).map(r=>`<div class="fx-row"><span class="fx-pair">${esc(r.pair)}</span><span class="fx-rate">${fmt(r.rate,4)}</span></div>`).join('')}<div class="meta">as of ${esc(fx.date)}</div></div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">💱 FX</span></div></div>`;

  // FX History (with DREAM)
  const fxh=f.fx_history||{};
  h+=fxh.status==='ok'?`<div class="panel">${dreamBlock(fxh.dream)}
    <div class="p-head"><span class="p-title">💱 FX History</span><span class="p-cat">markets</span></div>
    <div class="p-body"><strong>USD/EUR ${fxh.n_days||0} days</strong>${spark(fxh.sparkline,'#22d3ee')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">💱 FX History</span></div></div>`;

  // Reddit
  const rd=f.reddit||{};
  h+=rd.status==='ok'?`<div class="panel">
    <div class="p-head"><span class="p-title">💬 Reddit</span><span class="p-cat">social</span></div>
    <div class="p-body scroll">${(rd.posts||[]).slice(0,10).map(p=>`<div class="reddit-item"><a href="${esc(p.url)}" target="_blank">${esc(p.title)}</a></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">💬 Reddit</span></div></div>`;

  // Wikipedia
  const wk=f.wikipedia||{};
  h+=wk.status==='ok'?`<div class="panel">${dreamBlock(wk.dream)}
    <div class="p-head"><span class="p-title">📚 Wikipedia</span><span class="p-cat">social</span></div>
    <div class="p-body scroll"><strong>${wk.count} recent edits</strong>${(wk.edits||[]).slice(0,12).map(e=>`<div class="wiki-item">${esc(e.title)} <span style="color:var(--muted)">${esc(e.user)}</span></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">📚 Wikipedia</span></div></div>`;

  // HackerNews
  const hn=f.hackernews||{};
  h+=hn.status==='ok'?`<div class="panel">${dreamBlock(hn.dream)}
    <div class="p-head"><span class="p-title">🔧 Hacker News</span><span class="p-cat">tech</span></div>
    <div class="p-body scroll">${(hn.stories||[]).slice(0,10).map(s=>`<div class="news-item"><a href="${esc(s.url)||'#'}" target="_blank">${esc(s.title)}</a><div class="meta">↑${s.score} · ${s.comments} comments</div></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">🔧 Hacker News</span></div></div>`;

  // GitHub
  const gh=f.github||{};
  h+=gh.status==='ok'?`<div class="panel">${dreamBlock(gh.dream)}
    <div class="p-head"><span class="p-title">⚡ GitHub Trending</span><span class="p-cat">tech</span></div>
    <div class="p-body scroll">${(gh.repos||[]).slice(0,10).map(r=>`<div class="news-item"><a href="${esc(r.url)}" target="_blank">${esc(r.name)}</a><div class="meta">★${r.stars} ${esc(r.lang||'')}</div></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">⚡ GitHub</span></div></div>`;

  h+=`</div><footer>DREAM World Observatory · live data · S2 analysis overlay · not financial advice</footer>`;
  document.getElementById('app').innerHTML=h;
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
