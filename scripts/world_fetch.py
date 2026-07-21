#!/usr/bin/env python3
"""
DREAM World Observatory — Live world snapshot + full DREAM S2 analysis.
Each feed gets: raw data + ACF + S2 fit + AICc gate (S2 vs EXP vs POWER) + retention curve.
"""
import os, json, time, urllib.request, csv, io
from datetime import datetime, timezone
import numpy as np
from scipy.optimize import curve_fit

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'derived')
os.makedirs(OUT, exist_ok=True)

def fetch(url, timeout=30, hdrs=None):
    try:
        h = {'User-Agent': 'DREAM-Observatory/1.0'}
        if hdrs: h.update(hdrs)
        req = urllib.request.Request(url, headers=h)
        with urllib.request.urlopen(req, timeout=timeout) as r: return r.read()
    except: return None

def s2(t,A,l,D): return A*np.exp(-np.power(np.maximum(t,1e-6)/max(l,1e-6),D))
def expf(t,A,l): return A*np.exp(-t/max(l,1e-6))
def powf(t,A,a): return A*np.power(np.maximum(t,1e-6),-a)

def aicc(rss,n,k):
    if n-k-1<=0: return 1e9
    return n*np.log(rss/n)+2*k+(2*k*(k+1))/(n-k-1)

def acf(values, max_lag=None):
    v=np.array(values,dtype=float)
    v=v[~np.isnan(v)]-np.mean(v[~np.isnan(v)])
    n=len(v)
    if n<10: return None
    if max_lag is None: max_lag=min(n//4,100)
    max_lag=min(max_lag,n//4)
    if max_lag<5: return None
    var=np.dot(v,v)/n
    if var==0: return None
    return [float(np.dot(v[:n-l],v[l:])/(n*var)) for l in range(max_lag)]

def dream_analysis(values):
    """Full S2 analysis with AICc gate. Returns D, r2, AICc, model comparison, retention curve."""
    a = acf(values)
    if not a or len(a)<6: return None
    t=np.arange(len(a)); R=np.array(a)
    if R[0]>0: R=R/R[0]
    n=len(t); ss_tot=np.sum((R-np.mean(R))**2)
    if ss_tot==0: return None

    results={}
    # S2
    try:
        p,_=curve_fit(s2,t,R,p0=[1,t[n//2],0.5],bounds=([.01,1e-3,.01],[2,1e6,10]),maxfev=10000)
        rss=np.sum((R-s2(t,*p))**2)
        results['S2']={'D':float(p[2]),'lam':float(p[1]),'rss':rss,'k':3,'aicc':aicc(rss,n,3),'r2':1-rss/ss_tot}
    except: pass
    # EXP
    try:
        p,_=curve_fit(expf,t,R,p0=[1,t[n//2]],bounds=([.01,1e-3],[2,1e6]),maxfev=10000)
        rss=np.sum((R-expf(t,*p))**2)
        results['EXP']={'rss':rss,'k':2,'aicc':aicc(rss,n,2)}
    except: pass
    # POWER
    try:
        p,_=curve_fit(powf,t,R,p0=[1,.5],bounds=([.01,.01],[2,10]),maxfev=10000)
        rss=np.sum((R-powf(t,*p))**2)
        results['POWER']={'rss':rss,'k':2,'aicc':aicc(rss,n,2)}
    except: pass

    if 'S2' not in results: return None
    s2a=results['S2']['aicc']
    alts={k:v['aicc'] for k,v in results.items() if k!='S2'}
    best_alt=min(alts.values()) if alts else 1e9
    best_alt_name=min(alts,key=alts.get) if alts else ''
    delta=s2a-best_alt

    if delta<=-2: verdict='S2_WINS'
    elif delta<=2: verdict='S2_TIES'
    else: verdict='S2_LOSES'

    D=results['S2']['D']
    regime='EXTRACTION' if D>1 else('NATURAL' if D<0.8 else 'THRESHOLD')

    # Retention curve points (for graphing)
    t_fit=np.linspace(0,max(t),50)
    R_fit=s2(t_fit,1,results['S2']['lam'],D)

    return {
        'D':round(D,4),'lambda_q':round(results['S2']['lam'],2),
        'r2':round(float(results['S2']['r2']),4),'regime':regime,
        'verdict':verdict,'delta_aicc':round(float(delta),2),
        'best_alt':best_alt_name,
        'model_aicc':{k:round(v['aicc'],1) for k,v in results.items()},
        'retention_curve':[round(x,4) for x in a[:30]],
        'fit_curve':[round(x,4) for x in R_fit],
        'n_points':n,
        'model_note':f'S2 {"beats" if verdict=="S2_WINS" else "ties" if verdict=="S2_TIES" else "loses to"} {best_alt_name} (ΔAICc={delta:.1f})',
    }

def spark(vals,n=50):
    if not vals: return []
    v=vals[-n:]; mn,mx=min(v),max(v); rng=mx-mn or 1
    return [round((x-mn)/rng*100) for x in v]

NOW=datetime.now(timezone.utc).isoformat()
snap={'generated_at':NOW,'feeds':{}}

# ═══ USGS EARTHQUAKES ═══
print('📡 USGS...')
d=fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.csv',timeout=45)
if d:
    rows=list(csv.reader(io.StringIO(d.decode())))
    quakes=[];mags=[]
    for r in rows[1:]:
        try:
            mag=float(r[4])
            if not np.isnan(mag) and mag>=2.0:
                quakes.append({'mag':mag,'lat':float(r[1]),'lon':float(r[2]),'depth':float(r[3]),'place':r[13][:60],'time':r[0]})
                mags.append(mag)
        except: pass
    quakes.sort(key=lambda x:-x['mag'])
    snap['feeds']['earthquakes']={'name':'Earthquakes','category':'geophysical','status':'ok',
        'count':len(quakes),'latest':quakes[:25],'max_mag':max(mags) if mags else 0,
        'sparkline':spark(mags),'dream':dream_analysis(mags)}
    print(f'  ✓ {len(quakes)} quakes')
else: snap['feeds']['earthquakes']={'name':'Earthquakes','status':'failed'}

# ═══ NOAA SOLAR WIND ═══
print('📡 NOAA...')
d=fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json',timeout=30)
if d:
    try:
        j=json.loads(d)
        speeds=[float(r[1]) for r in j[1:] if r[1] and float(r[1])>0]
        snap['feeds']['solar_wind']={'name':'Solar Wind','category':'space','status':'ok',
            'current':speeds[-1] if speeds else 0,'unit':'km/s','count':len(speeds),
            'sparkline':spark(speeds),'dream':dream_analysis(speeds)}
        print(f'  ✓ {len(speeds)} pts')
    except: snap['feeds']['solar_wind']={'name':'Solar Wind','status':'failed'}
else: snap['feeds']['solar_wind']={'name':'Solar Wind','status':'failed'}

# ═══ CRYPTO ═══
print('📡 CoinGecko...')
d=fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,dogecoin,cardano,polkadot,chainlink&order=market_cap_desc&per_page=7&page=1&sparkline=false&price_change_percentage=24h',timeout=30)
if d:
    try:
        coins=json.loads(d)
        crypto=[{'name':c['name'],'symbol':c['symbol'].upper(),'price':c['current_price'],
            'change_24h':round(c.get('price_change_percentage_24h',0),2),'market_cap':c.get('market_cap',0)} for c in coins]
        prices=[c['price'] for c in crypto if c['name']=='Bitcoin']
        snap['feeds']['crypto']={'name':'Crypto','category':'markets','status':'ok',
            'coins':crypto,'sparkline':spark(prices),'dream':dream_analysis(prices)}
        print(f'  ✓ {len(crypto)} coins')
    except: snap['feeds']['crypto']={'name':'Crypto','status':'failed'}
else: snap['feeds']['crypto']={'name':'Crypto','status':'failed'}

# ═══ FX ═══
print('📡 FX...')
d=fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CNY,RUB,BRL,INR',timeout=20)
if d:
    try:
        j=json.loads(d); rates=j.get('rates',{})
        fx=[{'pair':f'USD/{k}','rate':v} for k,v in rates.items()]
        snap['feeds']['fx']={'name':'FX Rates','category':'markets','status':'ok','rates':fx,'date':j.get('date','')}
        print(f'  ✓ {len(fx)} pairs')
    except: snap['feeds']['fx']={'name':'FX','status':'failed'}
else: snap['feeds']['fx']={'name':'FX','status':'failed'}

# ═══ OPENSKY ═══
print('📡 OpenSky...')
d=fetch('https://opensky-network.org/api/states/all',timeout=45)
if d:
    try:
        j=json.loads(d); states=j.get('states',[])
        bands={'N Hemisphere':0,'S Hemisphere':0,'Tropics':0}
        altitudes=[];countries={}
        for s in states:
            try:
                lat=s[6];alt=s[7] or 0;orig=s[2] or '?'
                if lat is not None:
                    if lat>23.5: bands['N Hemisphere']+=1
                    elif lat<-23.5: bands['S Hemisphere']+=1
                    else: bands['Tropics']+=1
                if alt and alt>0: altitudes.append(float(alt))
                countries[orig]=countries.get(orig,0)+1
            except: pass
        snap['feeds']['flights']={'name':'Flights','category':'aviation','status':'ok',
            'count':len(states),'bands':bands,
            'top_origins':sorted(countries.items(),key=lambda x:-x[1])[:10],
            'sparkline':spark(altitudes),'dream':dream_analysis(altitudes)}
        print(f'  ✓ {len(states)} aircraft')
    except: snap['feeds']['flights']={'name':'Flights','status':'failed'}
else: snap['feeds']['flights']={'name':'Flights','status':'failed'}

# ═══ GDELT NEWS ═══
print('📡 GDELT...')
d=fetch('https://api.gdeltproject.org/api/v2/doc/doc?query=protest+OR+conflict+OR+strike+OR+election&mode=ArtList&maxrecords=30&format=json&sort=DateDesc&timespan=24h',timeout=45)
if d:
    try:
        j=json.loads(d); articles=j.get('articles',[])
        news=[{'title':a.get('title','')[:100],'url':a.get('url',''),'source':a.get('domain',''),
               'date':a.get('seendate',''),'country':a.get('country',''),'lang':a.get('language','')} for a in articles[:20]]
        snap['feeds']['news']={'name':'Global News','category':'news','status':'ok','count':len(articles),'articles':news}
        print(f'  ✓ {len(articles)} articles')
    except: snap['feeds']['news']={'name':'News','status':'failed'}
else: snap['feeds']['news']={'name':'News','status':'failed'}

# ═══ REDDIT ═══
print('📡 Reddit...')
d=fetch('https://www.reddit.com/r/worldnews/top.json?limit=25&t=day',timeout=20,hdrs={'Accept':'application/json'})
if d:
    try:
        j=json.loads(d); posts=j.get('data',{}).get('children',[])
        reddit=[{'title':p['data'].get('title','')[:100],'score':p['data'].get('score',0),
                 'comments':p['data'].get('num_comments',0),'url':'https://reddit.com'+p['data'].get('permalink','')} for p in posts[:15]]
        scores=[p['score'] for p in reddit]
        snap['feeds']['reddit']={'name':'Reddit','category':'social','status':'ok',
            'posts':reddit,'sparkline':spark(scores),'dream':dream_analysis(scores)}
        print(f'  ✓ {len(reddit)} posts')
    except: snap['feeds']['reddit']={'name':'Reddit','status':'failed'}
else: snap['feeds']['reddit']={'name':'Reddit','status':'failed'}

# ═══ WEATHER ═══
print('📡 Weather...')
cities=[('New York',40.71,-74.01),('London',51.51,-0.13),('Tokyo',35.68,139.69),
        ('Moscow',55.76,37.62),('Beijing',39.90,116.40),('Mumbai',19.08,72.88),
        ('São Paulo',-23.55,-46.63),('Sydney',-33.87,151.21),('Cairo',30.04,31.24),
        ('Lagos',6.52,3.38),('Dubai',25.20,55.27),('Singapore',1.35,103.82)]
weather=[]
for city,lat,lon in cities:
    d=fetch(f'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,wind_speed_10m,relative_humidity_2m&timezone=auto',timeout=10)
    if d:
        try:
            j=json.loads(d);c=j.get('current',{})
            weather.append({'city':city,'temp':round(c.get('temperature_2m',0)),'wind':round(c.get('wind_speed_10m',0)),
                           'humidity':c.get('relative_humidity_2m',0),'lat':lat,'lon':lon})
        except: pass
    time.sleep(0.1)
if weather:
    temps=[w['temp'] for w in weather]
    snap['feeds']['weather']={'name':'Weather','category':'environment','status':'ok',
        'cities':weather,'sparkline':spark(temps),'dream':dream_analysis(temps)}
    print(f'  ✓ {len(weather)} cities')
else: snap['feeds']['weather']={'name':'Weather','status':'failed'}

# ═══ FRED MARKETS ═══
print('📡 FRED...')
fred=[('SP500','S&P 500'),('VIXCLS','VIX'),('DCOILWTICO','WTI Oil'),('DGS10','10Y Treasury'),
      ('FEDFUNDS','Fed Funds'),('DEXUSEU','USD/EUR'),('GOLDAMGBD228NLBM','Gold')]
markets=[]
for sid,name in fred:
    d=fetch(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}',timeout=20)
    if d:
        rows=list(csv.reader(io.StringIO(d.decode())))
        vals=[]
        for r in rows[1:]:
            try:
                v=float(r[1])
                if not np.isnan(v): vals.append(v)
            except: pass
        if vals:
            markets.append({'name':name,'id':sid,'current':vals[-1],'n':len(vals),
                           'sparkline':spark(vals),'dream':dream_analysis(vals)})
    time.sleep(0.2)
if markets:
    snap['feeds']['markets']={'name':'Markets','category':'markets','status':'ok','instruments':markets}
    print(f'  ✓ {len(markets)} instruments')
else: snap['feeds']['markets']={'name':'Markets','status':'failed'}

# ═══ WIKIPEDIA ═══
print('📡 Wikipedia...')
d=fetch('https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rcprop=title|user|timestamp|sizes&rclimit=30&format=json&rctype=edit',timeout=20)
if d:
    try:
        j=json.loads(d)
        changes=j.get('query',{}).get('recentchanges',[])
        wiki=[{'title':c.get('title','')[:70],'user':c.get('user',''),'time':c.get('timestamp',''),'size':c.get('newlen',0)} for c in changes[:20]]
        sizes=[c['size'] for c in wiki]
        snap['feeds']['wikipedia']={'name':'Wikipedia','category':'social','status':'ok',
            'count':len(changes),'edits':wiki,'sparkline':spark(sizes),'dream':dream_analysis(sizes)}
        print(f'  ✓ {len(changes)} edits')
    except: snap['feeds']['wikipedia']={'name':'Wikipedia','status':'failed'}
else: snap['feeds']['wikipedia']={'name':'Wikipedia','status':'failed'}

# ═══ OPENAQ AIR QUALITY ═══
print('📡 OpenAQ...')
d=fetch('https://api.openaq.org/v3/latest?limit=20&parameter=pm25',timeout=20)
if d:
    try:
        j=json.loads(d)
        results=j.get('results',[])
        aq=[{'city':r.get('location',''),'value':r.get('measurements',[{}])[0].get('value',0),'unit':r.get('measurements',[{}])[0].get('unit','µg/m³')} for r in results[:15] if r.get('measurements')]
        vals=[a['value'] for a in aq]
        snap['feeds']['air_quality']={'name':'Air Quality','category':'environment','status':'ok',
            'stations':aq,'sparkline':spark(vals),'dream':dream_analysis(vals)}
        print(f'  ✓ {len(aq)} stations')
    except: snap['feeds']['air_quality']={'name':'Air Quality','status':'failed'}
else: snap['feeds']['air_quality']={'name':'Air Quality','status':'failed'}

# ═══ SUMMARY ═══
ok=sum(1 for f in snap['feeds'].values() if f.get('status')=='ok')
total=len(snap['feeds'])
snap['summary']={'total_feeds':total,'ok_feeds':ok,'failed_feeds':total-ok}
dream_ok=[f for f in snap['feeds'].values() if f.get('dream')]
extraction=[f for f in dream_ok if f['dream']['regime']=='EXTRACTION']
natural=[f for f in dream_ok if f['dream']['regime']=='NATURAL']
snap['dream_summary']={'analyzed':len(dream_ok),'extraction':len(extraction),
    'natural':len(natural),'threshold':len(dream_ok)-len(extraction)-len(natural)}

path=os.path.join(OUT,'world_snapshot.json')
with open(path,'w') as f: json.dump(snap,f,indent=2,ensure_ascii=False)
print(f'\n✓ {path}')
print(f'  Feeds: {ok}/{total} | DREAM: {len(dream_ok)} analyzed, {len(extraction)} extraction, {len(natural)} natural')
