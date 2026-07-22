#!/usr/bin/env python3
"""DREAM World Observatory v4 — proven data sources from working repos."""
import os,json,time,urllib.request,csv,io,re,xml.etree.ElementTree as ET
from datetime import datetime,timezone
import numpy as np
from scipy.optimize import curve_fit

OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'data','derived')
os.makedirs(OUT,exist_ok=True)

def fetch(url,timeout=30,hdrs=None):
    try:
        h={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        if hdrs:h.update(hdrs)
        req=urllib.request.Request(url,headers=h)
        with urllib.request.urlopen(req,timeout=timeout) as r:return r.read()
    except Exception as e:print(f'    err:{e}');return None

def fetch_yahoo(symbol, interval='1d', period='1y'):
    """Yahoo Finance chart API — proven to work from GitHub Actions."""
    url=f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range={period}&interval={interval}&includePrePost=false&events=history'
    d=fetch(url,timeout=20)
    if not d:return None
    try:
        j=json.loads(d)
        ts=j['chart']['result'][0]['timestamp']
        closes=j['chart']['result'][0]['indicators']['quote'][0]['close']
        vals=[c for c in closes if c is not None]
        return vals
    except:return None

def s2(t,A,l,D):return A*np.exp(-np.power(np.maximum(t,1e-6)/max(l,1e-6),D))
def expf(t,A,l):return A*np.exp(-t/max(l,1e-6))
def powf(t,A,a):return A*np.power(np.maximum(t,1e-6),-a)
def aicc(rss,n,k):
    if n-k-1<=0:return 1e9
    return n*np.log(rss/n)+2*k+(2*k*(k+1))/(n-k-1)
def acf(values,max_lag=None):
    v=np.array(values,dtype=float);v=v[~np.isnan(v)]-np.mean(v[~np.isnan(v)]);n=len(v)
    if n<10:return None
    if max_lag is None:max_lag=min(n//4,100)
    max_lag=min(max_lag,n//4)
    if max_lag<5:return None
    var=np.dot(v,v)/n
    if var==0:return None
    return[float(np.dot(v[:n-l],v[l:])/(n*var))for l in range(max_lag)]
def dream_analysis(values):
    a=acf(values)
    if not a or len(a)<6:return None
    t=np.arange(len(a));R=np.array(a)
    if R[0]>0:R=R/R[0]
    n=len(t);ss_tot=np.sum((R-np.mean(R))**2)
    if ss_tot==0:return None
    results={}
    try:
        p,_=curve_fit(s2,t,R,p0=[1,t[n//2],0.5],bounds=([.01,1e-3,.01],[2,1e6,10]),maxfev=10000)
        rss=np.sum((R-s2(t,*p))**2);results['S2']={'D':float(p[2]),'lam':float(p[1]),'rss':rss,'k':3,'aicc':aicc(rss,n,3),'r2':1-rss/ss_tot}
    except:pass
    try:
        p,_=curve_fit(expf,t,R,p0=[1,t[n//2]],bounds=([.01,1e-3],[2,1e6]),maxfev=10000)
        rss=np.sum((R-expf(t,*p))**2);results['EXP']={'rss':rss,'k':2,'aicc':aicc(rss,n,2)}
    except:pass
    try:
        p,_=curve_fit(powf,t,R,p0=[1,.5],bounds=([.01,.01],[2,10]),maxfev=10000)
        rss=np.sum((R-powf(t,*p))**2);results['POWER']={'rss':rss,'k':2,'aicc':aicc(rss,n,2)}
    except:pass
    if'S2'not in results:return None
    s2a=results['S2']['aicc'];alts={k:v['aicc']for k,v in results.items()if k!='S2'}
    best_alt=min(alts.values())if alts else 1e9;best_alt_name=min(alts,key=alts.get)if alts else''
    delta=s2a-best_alt
    if delta<=-2:verdict='S2_WINS'
    elif delta<=2:verdict='S2_TIES'
    else:verdict='S2_LOSES'
    D=results['S2']['D'];regime='EXTRACTION'if D>1 else('NATURAL'if D<0.8 else'THRESHOLD')
    t_fit=np.linspace(0,max(t),50);R_fit=s2(t_fit,1,results['S2']['lam'],D)
    return{'D':round(D,4),'lambda_q':round(results['S2']['lam'],2),'r2':round(float(results['S2']['r2']),4),'regime':regime,'verdict':verdict,'delta_aicc':round(float(delta),2),'best_alt':best_alt_name,'model_aicc':{k:round(v['aicc'],1)for k,v in results.items()},'retention_curve':[round(x,4)for x in a[:30]],'fit_curve':[round(x,4)for x in R_fit],'n_points':n,'model_note':f'S2 {"beats" if verdict=="S2_WINS" else "ties" if verdict=="S2_TIES" else "loses to"} {best_alt_name} (delta={delta:.1f})'}
def spark(vals,n=50):
    if not vals:return[]
    v=vals[-n:];mn,mx=min(v),max(v);rng=mx-mn or 1
    return[round((x-mn)/rng*100)for x in v]
def parse_rss(xml_bytes,max_items=20):
    articles=[]
    try:
        root=ET.fromstring(xml_bytes.decode('utf-8',errors='ignore'))
        for item in root.findall('.//item')[:max_items]:
            articles.append({'title':(item.findtext('title','')or'')[:100],'url':item.findtext('link',''),'date':item.findtext('pubDate',''),'source':''})
        if not articles:
            ns='{http://www.w3.org/2005/Atom}'
            for entry in root.findall(f'.//{ns}entry')[:max_items]:
                link_el=entry.find(f'{ns}link');link=link_el.get('href','')if link_el is not None else''
                articles.append({'title':(entry.findtext(f'{ns}title','')or'')[:100],'url':link,'date':entry.findtext(f'{ns}published',''),'source':''})
    except:pass
    return articles

import urllib.parse
NOW=datetime.now(timezone.utc).isoformat()
snap={'generated_at':NOW,'feeds':{}}

# 1 USGS earthquakes
print('USGS...')
d=fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.csv',timeout=45)
if d:
    rows=list(csv.reader(io.StringIO(d.decode())));quakes=[];mags=[]
    for r in rows[1:]:
        try:
            mag=float(r[4])
            if not np.isnan(mag) and mag>=2.0:quakes.append({'mag':mag,'lat':float(r[1]),'lon':float(r[2]),'depth':float(r[3]),'place':r[13][:60],'time':r[0]});mags.append(mag)
        except:pass
    quakes.sort(key=lambda x:-x['mag'])
    snap['feeds']['earthquakes']={'name':'Earthquakes','category':'geophysical','status':'ok','count':len(quakes),'latest':quakes[:25],'max_mag':max(mags)if mags else 0,'sparkline':spark(mags),'dream':dream_analysis(mags)}
    print(f'  ok {len(quakes)}')
else:snap['feeds']['earthquakes']={'name':'Earthquakes','status':'failed'}

# 2 NOAA space weather — Kp index + solar flux
print('NOAA Kp...')
d=fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',timeout=30)
if d:
    try:
        j=json.loads(d)
        kp_vals=[float(r['Kp']) for r in j if 'Kp' in r]
        snap['feeds']['space_weather']={'name':'Space Weather (Kp)','category':'space','status':'ok','current':kp_vals[-1] if kp_vals else 0,'unit':'Kp','count':len(kp_vals),'sparkline':spark(kp_vals),'dream':dream_analysis(kp_vals)}
        print(f'  ok {len(kp_vals)} Kp points')
    except Exception as e:print(f'    err:{e}');snap['feeds']['space_weather']={'name':'Space Weather','status':'failed'}
else:snap['feeds']['space_weather']={'name':'Space Weather','status':'failed'}

print('NOAA Solar Flux...')
d=fetch('https://services.swpc.noaa.gov/products/10cm-flux-30-day.json',timeout=30)
if d:
    try:
        j=json.loads(d)
        flux_vals=[float(r['flux']) for r in j if 'flux' in r]
        snap['feeds']['solar_flux']={'name':'Solar Flux (F10.7)','category':'space','status':'ok','current':flux_vals[-1] if flux_vals else 0,'unit':'sfu','count':len(flux_vals),'sparkline':spark(flux_vals),'dream':dream_analysis(flux_vals)}
        print(f'  ok {len(flux_vals)} flux points')
    except:snap['feeds']['solar_flux']={'name':'Solar Flux','status':'failed'}
else:snap['feeds']['solar_flux']={'name':'Solar Flux','status':'failed'}

# 3 Yahoo Finance markets — PROVEN TO WORK
print('Yahoo Finance...')
market_symbols=[
    ('^GSPC','S&P 500'),('^NDX','Nasdaq 100'),('^DJI','Dow Jones'),('^VIX','VIX'),
    ('^FTSE','FTSE 100'),('^GDAXI','DAX'),('^N225','Nikkei 225'),('^HSI','Hang Seng'),
    ('CL=F','Crude Oil'),('GC=F','Gold'),('NG=F','Natural Gas'),('SI=F','Silver'),
]
markets=[]
for sym,name in market_symbols:
    vals=fetch_yahoo(sym)
    if vals and len(vals)>=10:
        markets.append({'name':name,'symbol':sym,'current':round(vals[-1],2),'n':len(vals),'sparkline':spark(vals),'dream':dream_analysis(vals)})
        print(f'  {name}: ok ({len(vals)})')
    time.sleep(0.2)
if markets:
    snap['feeds']['markets']={'name':'Markets','category':'markets','status':'ok','instruments':markets}
else:snap['feeds']['markets']={'name':'Markets','status':'failed'}

# 4 FX
print('FX...')
d=fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CNY,RUB,BRL,INR,KRW',timeout=20)
if d:
    try:
        j=json.loads(d);rates=j.get('rates',{});fx=[{'pair':f'USD/{k}','rate':v}for k,v in rates.items()]
        snap['feeds']['fx']={'name':'FX Rates','category':'markets','status':'ok','rates':fx,'date':j.get('date','')}
        print(f'  ok {len(fx)}')
    except:snap['feeds']['fx']={'name':'FX','status':'failed'}
else:snap['feeds']['fx']={'name':'FX','status':'failed'}

# FX History via Yahoo Finance (more reliable)
print('FX History (Yahoo)...')
eur_vals=fetch_yahoo('EURUSD=X')
if eur_vals and len(eur_vals)>=10:
    snap['feeds']['fx_history']={'name':'FX History','category':'markets','status':'ok','n_days':len(eur_vals),'sparkline':spark(eur_vals),'dream':dream_analysis(eur_vals),'current':round(eur_vals[-1],4)}
    print(f'  ok {len(eur_vals)} days')
else:snap['feeds']['fx_history']={'name':'FX History','status':'failed'}

# 5 OpenSky
print('OpenSky...')
d=fetch('https://opensky-network.org/api/states/all',timeout=60)
if not d:d=fetch('https://opensky-network.org/api/states/all',timeout=60)
if d:
    try:
        j=json.loads(d);states=j.get('states',[]);bands={'N Hemisphere':0,'S Hemisphere':0,'Tropics':0};altitudes=[];countries={}
        for s in states:
            try:
                lat=s[6];alt=s[7]or 0;orig=s[2]or'?'
                if lat is not None:
                    if lat>23.5:bands['N Hemisphere']+=1
                    elif lat<-23.5:bands['S Hemisphere']+=1
                    else:bands['Tropics']+=1
                if alt and alt>0:altitudes.append(float(alt))
                countries[orig]=countries.get(orig,0)+1
            except:pass
        snap['feeds']['flights']={'name':'Flights','category':'aviation','status':'ok','count':len(states),'bands':bands,'top_origins':sorted(countries.items(),key=lambda x:-x[1])[:10],'sparkline':spark(altitudes),'dream':dream_analysis(altitudes)}
        print(f'  ok {len(states)}')
    except:snap['feeds']['flights']={'name':'Flights','status':'failed'}
else:snap['feeds']['flights']={'name':'Flights','status':'failed'}

# 6 News RSS
print('News...')
all_news=[]
for name,url in[('BBC','http://feeds.bbci.co.uk/news/world/rss.xml'),('Al Jazeera','https://www.aljazeera.com/xml/rss/all.xml')]:
    d=fetch(url,timeout=15)
    if d:
        articles=parse_rss(d,10)
        for a in articles:a['source']=name
        all_news.extend(articles)
        print(f'  {name}:{len(articles)}')
    time.sleep(0.2)
all_news=all_news[:25]
snap['feeds']['news']={'name':'Global News','category':'news','status':'ok','count':len(all_news),'articles':all_news}if all_news else{'name':'News','status':'failed'}

# 7 Weather
print('Weather...')
cities=[('New York',40.71,-74.01),('London',51.51,-0.13),('Tokyo',35.68,139.69),('Moscow',55.76,37.62),('Beijing',39.90,116.40),('Mumbai',19.08,72.88),('Sao Paulo',-23.55,-46.63),('Sydney',-33.87,151.21),('Cairo',30.04,31.24),('Lagos',6.52,3.38),('Dubai',25.20,55.27),('Singapore',1.35,103.82),('Berlin',52.52,13.40),('Paris',48.85,2.35),('Istanbul',41.01,28.98)]
weather=[]
for city,lat,lon in cities:
    d=fetch(f'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,wind_speed_10m,relative_humidity_2m,precipitation&timezone=auto',timeout=10)
    if d:
        try:
            j=json.loads(d);c=j.get('current',{});weather.append({'city':city,'temp':round(c.get('temperature_2m',0)),'wind':round(c.get('wind_speed_10m',0)),'humidity':c.get('relative_humidity_2m',0),'precip':c.get('precipitation',0),'lat':lat,'lon':lon})
        except:pass
    time.sleep(0.1)
if weather:
    # Also fetch 30-day historical temps for NYC for DREAM time series
    hd=fetch('https://archive-api.open-meteo.com/v1/archive?latitude=40.78&longitude=-73.97&start_date=2024-06-01&end_date=2024-12-31&daily=temperature_2m_max&timezone=auto',timeout=20)
    hist_temps=[]
    if hd:
        try:
            hj=json.loads(hd);hist_temps=hj.get('daily',{}).get('temperature_2m_max',[])
        except:pass
    temps=[w['temp']for w in weather]
    snap['feeds']['weather']={'name':'Weather','category':'environment','status':'ok','cities':weather,'sparkline':spark(temps),'dream':dream_analysis(hist_temps)if len(hist_temps)>=10 else dream_analysis(temps)}
    print(f'  ok {len(weather)}')
else:snap['feeds']['weather']={'name':'Weather','status':'failed'}

# 8 Reddit RSS
print('Reddit...')
d=fetch('https://www.reddit.com/r/worldnews/top.rss?limit=25&t=day',timeout=15)
if d:
    posts=parse_rss(d,15);reddit=[{'title':p['title'][:100],'url':p['url'],'date':p.get('date','')}for p in posts]
    snap['feeds']['reddit']={'name':'Reddit','category':'social','status':'ok','posts':reddit};print(f'  ok {len(reddit)}')
else:snap['feeds']['reddit']={'name':'Reddit','status':'failed'}

# 9 Wikipedia
print('Wikipedia...')
d=fetch('https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rcprop=title|user|timestamp|sizes&rclimit=30&format=json&rctype=edit',timeout=20)
if d:
    try:
        j=json.loads(d);changes=j.get('query',{}).get('recentchanges',[]);wiki=[{'title':c.get('title','')[:70],'user':c.get('user',''),'time':c.get('timestamp',''),'size':c.get('newlen',0)}for c in changes[:20]];sizes=[c['size']for c in wiki]
        snap['feeds']['wikipedia']={'name':'Wikipedia','category':'social','status':'ok','count':len(changes),'edits':wiki,'sparkline':spark(sizes),'dream':dream_analysis(sizes)};print(f'  ok {len(changes)}')
    except:snap['feeds']['wikipedia']={'name':'Wikipedia','status':'failed'}
else:snap['feeds']['wikipedia']={'name':'Wikipedia','status':'failed'}

# 10 HackerNews
print('HackerNews...')
d=fetch('https://hacker-news.firebaseio.com/v0/topstories.json',timeout=15)
if d:
    try:
        ids=json.loads(d)[:12];hn=[];scores=[]
        for id in ids:
            sd=fetch(f'https://hacker-news.firebaseio.com/v0/item/{id}.json',timeout=10)
            if sd:
                item=json.loads(sd);hn.append({'title':item.get('title','')[:80],'url':item.get('url',''),'score':item.get('score',0),'comments':item.get('descendants',0)});scores.append(item.get('score',0))
            time.sleep(0.1)
        snap['feeds']['hackernews']={'name':'Hacker News','category':'tech','status':'ok','count':len(hn),'stories':hn,'sparkline':spark(scores),'dream':dream_analysis(scores)};print(f'  ok {len(hn)}')
    except:snap['feeds']['hackernews']={'name':'Hacker News','status':'failed'}
else:snap['feeds']['hackernews']={'name':'Hacker News','status':'failed'}

# 11 GitHub trending
print('GitHub...')
d=fetch('https://api.github.com/search/repositories?q=stars:>1000+pushed:>2024-07-01&sort=stars&order=desc&per_page=10',timeout=20,hdrs={'Accept':'application/vnd.github.v3+json'})
if d:
    try:
        j=json.loads(d);repos=[{'name':r['full_name'],'stars':r['stargazers_count'],'lang':r.get('language',''),'desc':r.get('description','')[:80],'url':r['html_url']}for r in j.get('items',[])];stars=[r['stars']for r in repos]
        snap['feeds']['github']={'name':'GitHub Trending','category':'tech','status':'ok','count':len(repos),'repos':repos,'sparkline':spark(stars),'dream':dream_analysis(stars)};print(f'  ok {len(repos)}')
    except:snap['feeds']['github']={'name':'GitHub','status':'failed'}
else:snap['feeds']['github']={'name':'GitHub','status':'failed'}

# Summary
ok=sum(1 for f in snap['feeds'].values()if f.get('status')=='ok');total=len(snap['feeds'])
snap['summary']={'total_feeds':total,'ok_feeds':ok,'failed_feeds':total-ok}
dream_ok=[f for f in snap['feeds'].values()if f.get('dream')];extraction=[f for f in dream_ok if f['dream']['regime']=='EXTRACTION'];natural=[f for f in dream_ok if f['dream']['regime']=='NATURAL']
snap['dream_summary']={'analyzed':len(dream_ok),'extraction':len(extraction),'natural':len(natural),'threshold':len(dream_ok)-len(extraction)-len(natural)}
path=os.path.join(OUT,'world_snapshot.json')
with open(path,'w')as f:json.dump(snap,f,indent=2,ensure_ascii=False)
print(f'\nDone:{ok}/{total} feeds,DREAM:{len(dream_ok)} analyzed,{len(extraction)} extraction,{len(natural)} natural')
