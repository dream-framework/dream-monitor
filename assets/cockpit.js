const URL='data/derived/world_snapshot.json';
let dreamOn=false; let snap=null;
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmt=(v,d=2)=>v===null||v===undefined?'—':Number(v).toFixed(d);
const ago=ts=>{if(!ts)return'—';const s=Math.round((Date.now()-new Date(ts))/1000);return s<60?s+'s':s<3600?Math.round(s/60)+'m':Math.round(s/3600)+'h';};

function spark(vals,color='#22d3ee'){
  if(!vals||!vals.length)return'';
  const w=100,h=20,step=w/(vals.length-1||1);
  const pts=vals.map((v,i)=>`${i*step},${h-v*(h/100)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1"/></svg>`;
}

function dreamGraph(d){
  if(!d||!d.retention_curve||!d.retention_curve.length)return'';
  const w=120,h=50,pad=4;
  const acf=d.retention_curve;
  const fit=d.fit_curve||[];
  const maxT=acf.length;
  const x=i=>pad+(i/maxT)*(w-2*pad);
  const y=v=>h-pad-v*(h-2*pad);
  let acfPts=acf.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
  let fitPts='';
  if(fit.length){fitPts=fit.map((v,i)=>`${x(i*maxT/fit.length)},${y(v)}`).join(' ');}
  const color=d.regime==='EXTRACTION'?'#f87171':d.regime==='NATURAL'?'#4ade80':'#fbbf24';
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:50px">
    <polyline points="${acfPts}" fill="none" stroke="${color}" stroke-width="1" opacity="0.4"/>
    ${fitPts?`<polyline points="${fitPts}" fill="none" stroke="${color}" stroke-width="1.5"/>`:''}
  </svg>`;
}

function dreamBlock(feed){
  if(!feed.dream)return'';
  const d=feed.dream;
  const cls=d.regime==='EXTRACTION'?'ext':d.regime==='NATURAL'?'nat':'thr';
  const vcolor=d.verdict==='S2_WINS'?'var(--good)':d.verdict==='S2_TIES'?'var(--warn)':'var(--bad)';
  const ma=d.model_aicc||{};
  return `<div class="dream-panel ${dreamOn?'show':''}">
    <div class="dp-graph">${dreamGraph(d)}</div>
    <div class="dp-stats">
      <div class="dp-row"><span>D</span><strong class="dval-sm ${cls}">${fmt(d.D,4)}</strong></div>
      <div class="dp-row"><span>λq</span><strong>${fmt(d.lambda_q,2)}</strong></div>
      <div class="dp-row"><span>R²</span><strong>${fmt(d.r2,4)}</strong></div>
      <div class="dp-row"><span>Regime</span><strong class="${cls}">${d.regime}</strong></div>
    </div>
    <div class="dp-models">
      <div class="dp-row ${d.verdict==='S2_WINS'?'win':''}"><span>S2</span><strong>${ma.S2??'—'}</strong></div>
      <div class="dp-row"><span>EXP</span><strong>${ma.EXP??'—'}</strong></div>
      <div class="dp-row"><span>POWER</span><strong>${ma.POWER??'—'}</strong></div>
    </div>
    <div class="dp-verdict" style="color:${vcolor}">
      ${d.verdict.replace(/_/g,' ')} · ΔAICc=${fmt(d.delta_aicc,2)}
    </div>
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
    <div class="kpi"><span>BTC</span><strong>${f.crypto?.coins?.find(c=>c.symbol==='BTC')?.price?.toFixed(0)||'—'}</strong><small>USD</small></div>
  </div><div class="grid">`;

  // Earthquakes
  const eq=f.earthquakes||{};
  h+=eq.status==='ok'?`<div class="panel">${dreamBlock(eq)}
    <div class="p-head"><span class="p-title">🌍 Earthquakes</span><span class="p-cat">geo</span></div>
    <div class="p-body"><strong>${eq.count} events · max M${fmt(eq.max_mag,1)}</strong>${spark(eq.sparkline,'#fbbf24')}
    ${(eq.latest||[]).slice(0,10).map(q=>`<div class="quake-row"><span class="quake-mag ${q.mag>=5?'m5':q.mag>=4.5?'m45':''}">M${fmt(q.mag,1)}</span><span class="quake-place">${esc(q.place)}</span><span class="quake-depth">${fmt(q.depth,0)}km</span></div>`).join('')}
    </div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">🌍 Earthquakes</span></div><div class="p-body">—</div></div>`;

  // Flights
  const fl=f.flights||{};
  h+=fl.status==='ok'?`<div class="panel">${dreamBlock(fl)}
    <div class="p-head"><span class="p-title">✈️ Flights</span><span class="p-cat">aviation</span></div>
    <div class="p-body"><div class="flight-info"><span class="big">${(fl.count||0).toLocaleString()}</span><span>aircraft airborne</span></div>
    ${Object.entries(fl.bands||{}).map(([k,v])=>`<div class="band-row"><span>${k}</span><span>${v}</span></div>`).join('')}
    <div style="margin-top:4px;font-size:9px;color:var(--muted)">Top: ${(fl.top_origins||[]).slice(0,6).map(([c,n])=>`${c}(${n})`).join(', ')}</div>
    </div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">✈️ Flights</span></div><div class="p-body">—</div></div>`;

  // Crypto
  const cr=f.crypto||{};
  h+=cr.status==='ok'?`<div class="panel">${dreamBlock(cr)}
    <div class="p-head"><span class="p-title">₿ Crypto</span><span class="p-cat">markets</span></div>
    <div class="p-body">${(cr.coins||[]).map(c=>`<div class="coin-row"><span class="coin-name">${esc(c.symbol)}</span><span class="coin-price">${c.price>1?'$'+c.price.toLocaleString(undefined,{maximumFractionDigits:0}):'$'+c.price.toFixed(4)}</span><span class="coin-chg ${c.change_24h>=0?'up':'down'}">${c.change_24h>=0?'+':''}${fmt(c.change_24h,1)}%</span></div>`).join('')}
    ${spark(cr.sparkline,'#fbbf24')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">₿ Crypto</span></div><div class="p-body">—</div></div>`;

  // News
  const nw=f.news||{};
  h+=nw.status==='ok'?`<div class="panel">
    <div class="p-head"><span class="p-title">📰 News (GDELT)</span><span class="p-cat">news</span></div>
    <div class="p-body scroll">${(nw.articles||[]).slice(0,12).map(a=>`<div class="news-item"><a href="${esc(a.url)}" target="_blank">${esc(a.title)}</a><div class="meta">${esc(a.source)} · ${esc(a.country||'')}</div></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">📰 News</span></div><div class="p-body">—</div></div>`;

  // Weather
  const wt=f.weather||{};
  h+=wt.status==='ok'?`<div class="panel">${dreamBlock(wt)}
    <div class="p-head"><span class="p-title">🌡️ Weather</span><span class="p-cat">env</span></div>
    <div class="p-body">${(wt.cities||[]).map(w=>`<div class="wthr-row"><span class="wthr-city">${esc(w.city)}</span><span class="wthr-temp ${w.temp>30?'hot':w.temp<5?'cold':''}">${w.temp}°C</span><span style="color:var(--muted)">${w.wind}km/h ${w.humidity}%</span></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">🌡️ Weather</span></div><div class="p-body">—</div></div>`;

  // FX
  const fx=f.fx||{};
  h+=fx.status==='ok'?`<div class="panel">
    <div class="p-head"><span class="p-title">💱 FX Rates</span><span class="p-cat">markets</span></div>
    <div class="p-body">${(fx.rates||[]).map(r=>`<div class="fx-row"><span class="fx-pair">${esc(r.pair)}</span><span class="fx-rate">${fmt(r.rate,4)}</span></div>`).join('')}<div class="meta">as of ${esc(fx.date)}</div></div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">💱 FX</span></div><div class="p-body">—</div></div>`;

  // Markets
  const mk=f.markets||{};
  h+=mk.status==='ok'?`<div class="panel">
    <div class="p-head"><span class="p-title">📈 Markets (FRED)</span><span class="p-cat">markets</span></div>
    <div class="p-body">${(mk.instruments||[]).map(m=>`<div class="coin-row"><span class="coin-name">${esc(m.name)}</span><span class="coin-price">${m.current>100?fmt(m.current,0):fmt(m.current,2)}</span>${m.dream?`<span class="coin-chg ${m.dream.regime==='EXTRACTION'?'down':m.dream.regime==='NATURAL'?'up':''}">D=${fmt(m.dream.D,2)}</span>`:''}</div>${spark(m.sparkline,m.dream&&m.dream.regime==='EXTRACTION'?'#f87171':'#22d3ee')}`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">📈 Markets</span></div><div class="p-body">—</div></div>`;

  // Reddit
  const rd=f.reddit||{};
  h+=rd.status==='ok'?`<div class="panel">${dreamBlock(rd)}
    <div class="p-head"><span class="p-title">💬 Reddit</span><span class="p-cat">social</span></div>
    <div class="p-body scroll">${(rd.posts||[]).slice(0,10).map(p=>`<div class="reddit-item"><a href="${esc(p.url)}" target="_blank">${esc(p.title)}</a><div class="reddit-meta">↑${p.score} · ${p.comments} comments</div></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">💬 Reddit</span></div><div class="p-body">—</div></div>`;

  // Wikipedia
  const wk=f.wikipedia||{};
  h+=wk.status==='ok'?`<div class="panel">${dreamBlock(wk)}
    <div class="p-head"><span class="p-title">📚 Wikipedia</span><span class="p-cat">social</span></div>
    <div class="p-body scroll"><strong>${wk.count} recent edits</strong>${(wk.edits||[]).slice(0,12).map(e=>`<div class="wiki-item">${esc(e.title)} <span style="color:var(--muted)">${esc(e.user)}</span></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">📚 Wikipedia</span></div><div class="p-body">—</div></div>`;

  // Solar wind
  const sw=f.solar_wind||{};
  h+=sw.status==='ok'?`<div class="panel">${dreamBlock(sw)}
    <div class="p-head"><span class="p-title">☀️ Solar Wind</span><span class="p-cat">space</span></div>
    <div class="p-body"><strong style="font-size:18px">${fmt(sw.current,0)} km/s</strong>${spark(sw.sparkline,'#fbbf24')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">☀️ Solar Wind</span></div><div class="p-body">—</div></div>`;

  // Air quality
  const aq=f.air_quality||{};
  h+=aq.status==='ok'?`<div class="panel">${dreamBlock(aq)}
    <div class="p-head"><span class="p-title">🏭 Air Quality</span><span class="p-cat">env</span></div>
    <div class="p-body scroll">${(aq.stations||[]).slice(0,10).map(s=>`<div class="wthr-row"><span class="wthr-city">${esc(s.city)}</span><span class="wthr-temp ${s.value>50?'hot':''}">${s.value} ${s.unit}</span></div>`).join('')}</div></div>`:`<div class="panel fail"><div class="p-head"><span class="p-title">🏭 Air Quality</span></div><div class="p-body">—</div></div>`;

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
