#!/usr/bin/env python3
"""
DREAM World Observatory — Live world snapshot fetcher.
Collects real-time data from 15+ free sources into a single snapshot.
DREAM S2 analysis is computed for each feed but stored separately —
the primary view is raw world data, DREAM is an overlay.
"""
import os, sys, json, time, urllib.request, urllib.parse, csv, io, re
from datetime import datetime, timezone, timedelta
import numpy as np
from scipy.optimize import curve_fit

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'derived')
os.makedirs(OUT, exist_ok=True)

def fetch(url, timeout=15, hdrs=None):
    try:
        h = {'User-Agent': 'DREAM-Observatory/1.0'}
        if hdrs: h.update(hdrs)
        req = urllib.request.Request(url, headers=h)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except: return None

def s2_func(t, A, lam, D):
    return A * np.exp(-np.power(np.maximum(t, 1e-6) / max(lam, 1e-6), D))

def acf(values, max_lag=None):
    v = np.array(values, dtype=float)
    v = v[~np.isnan(v)] - np.mean(v[~np.isnan(v)])
    n = len(v)
    if n < 10: return None
    if max_lag is None: max_lag = min(n // 4, 100)
    max_lag = min(max_lag, n // 4)
    if max_lag < 5: return None
    var = np.dot(v, v) / n
    if var == 0: return None
    return [np.dot(v[:n-l], v[l:]) / (n * var) for l in range(max_lag)]

def dream_analysis(values):
    """Compute S2 D value from a time series. Returns dict or None."""
    a = acf(values)
    if not a or len(a) < 6: return None
    t = np.arange(len(a))
    R = np.array(a)
    if R[0] > 0: R = R / R[0]
    try:
        popt, _ = curve_fit(s2_func, t, R, p0=[1, t[len(t)//2], 0.5],
                            bounds=([0.01, 1e-3, 0.01], [2, 1e6, 10]), maxfev=10000)
        D = float(popt[2])
        pred = s2_func(t, *popt)
        ss_res = np.sum((R - pred) ** 2)
        ss_tot = np.sum((R - np.mean(R)) ** 2)
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0
        regime = 'EXTRACTION' if D > 1 else ('NATURAL' if D < 0.8 else 'THRESHOLD')
        return {'D': round(D, 4), 'r2': round(float(r2), 4), 'regime': regime,
                'lambda_q': round(float(popt[1]), 2), 'retention_curve': [round(x, 4) for x in a[:30]]}
    except: return None

def sparkline(vals, n=50):
    if not vals: return []
    v = vals[-n:]
    mn, mx = min(v), max(v)
    rng = mx - mn or 1
    return [round((x - mn) / rng * 100) for x in v]

NOW = datetime.now(timezone.utc).isoformat()
snapshot = {'generated_at': NOW, 'feeds': {}}

# ═══ USGS EARTHQUAKES ═══
print('📡 USGS Earthquakes...')
d = fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.csv', timeout=10)
if d:
    rows = list(csv.reader(io.StringIO(d.decode())))
    quakes = []
    mags = []
    for r in rows[1:]:
        try:
            mag = float(r[4]); lat = float(r[1]); lon = float(r[2]); depth = float(r[3])
            place = r[13]; time_str = r[0]
            if not np.isnan(mag) and mag >= 2.5:
                quakes.append({'mag': mag, 'lat': lat, 'lon': lon, 'depth': depth, 'place': place[:50], 'time': time_str})
                mags.append(mag)
        except: pass
    quakes.sort(key=lambda x: -x['mag'])
    snapshot['feeds']['earthquakes'] = {
        'name': 'Earthquakes', 'category': 'geophysical', 'status': 'ok',
        'count': len(quakes), 'latest': quakes[:20],
        'max_mag': max(mags) if mags else 0,
        'sparkline': sparkline(mags),
        'dream': dream_analysis(mags) if len(mags) >= 10 else None,
    }
    print(f'  ✓ {len(quakes)} quakes, max M{max(mags) if mags else 0:.1f}')
else:
    snapshot['feeds']['earthquakes'] = {'name': 'Earthquakes', 'status': 'failed'}

# ═══ NOAA SOLAR WIND ═══
print('📡 NOAA Solar Wind...')
d = fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json', timeout=15)
if d:
    try:
        j = json.loads(d)
        speeds = [float(r[1]) for r in j[1:] if r[1] and float(r[1]) > 0]
        snapshot['feeds']['solar_wind'] = {
            'name': 'Solar Wind', 'category': 'space', 'status': 'ok',
            'current': speeds[-1] if speeds else 0, 'unit': 'km/s',
            'count': len(speeds), 'sparkline': sparkline(speeds),
            'dream': dream_analysis(speeds) if len(speeds) >= 10 else None,
        }
        print(f'  ✓ {len(speeds)} points, {speeds[-1]:.0f} km/s')
    except:
        snapshot['feeds']['solar_wind'] = {'name': 'Solar Wind', 'status': 'failed'}
else:
    snapshot['feeds']['solar_wind'] = {'name': 'Solar Wind', 'status': 'failed'}

# ═══ COINGECKO CRYPTO ═══
print('📡 Crypto (CoinGecko)...')
d = fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,dogecoin&order=market_cap_desc&per_page=4&page=1&sparkline=false&price_change_percentage=24h', timeout=15)
if d:
    try:
        coins = json.loads(d)
        crypto = []
        for c in coins:
            crypto.append({
                'name': c['name'], 'symbol': c['symbol'].upper(),
                'price': c['current_price'], 'change_24h': round(c.get('price_change_percentage_24h', 0), 2),
                'market_cap': c.get('market_cap', 0),
            })
        prices = [c['price'] for c in crypto if c['name'] == 'Bitcoin']
        snapshot['feeds']['crypto'] = {
            'name': 'Crypto Markets', 'category': 'markets', 'status': 'ok',
            'coins': crypto, 'sparkline': sparkline(prices),
            'dream': dream_analysis(prices) if prices and len(prices) >= 10 else None,
        }
        print(f'  ✓ {len(crypto)} coins')
    except:
        snapshot['feeds']['crypto'] = {'name': 'Crypto', 'status': 'failed'}
else:
    snapshot['feeds']['crypto'] = {'name': 'Crypto', 'status': 'failed'}

# ═══ FRANKFURTER FX ═══
print('📡 FX Rates (Frankfurter)...')
d = fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CNY,RUB', timeout=10)
if d:
    try:
        j = json.loads(d)
        rates = j.get('rates', {})
        fx_list = [{'pair': f'USD/{k}', 'rate': v} for k, v in rates.items()]
        snapshot['feeds']['fx'] = {
            'name': 'FX Rates', 'category': 'markets', 'status': 'ok',
            'rates': fx_list, 'date': j.get('date', ''),
        }
        print(f'  ✓ {len(fx_list)} pairs')
    except:
        snapshot['feeds']['fx'] = {'name': 'FX Rates', 'status': 'failed'}
else:
    snapshot['feeds']['fx'] = {'name': 'FX Rates', 'status': 'failed'}

# ═══ OPENSKY FLIGHTS ═══
print('📡 OpenSky Flights...')
d = fetch('https://opensky-network.org/api/states/all', timeout=10)
if d:
    try:
        j = json.loads(d)
        states = j.get('states', [])
        # Count by region (lat bands)
        bands = {'N Hemisphere': 0, 'S Hemisphere': 0, 'Tropics': 0}
        altitudes = []
        countries = {}
        for s in states:
            try:
                lat = s[6]
                alt = s[7] or 0
                orig = s[2] or '?'
                if lat is not None:
                    if lat > 23.5: bands['N Hemisphere'] += 1
                    elif lat < -23.5: bands['S Hemisphere'] += 1
                    else: bands['Tropics'] += 1
                if alt and alt > 0: altitudes.append(float(alt))
                countries[orig] = countries.get(orig, 0) + 1
            except: pass
        top_countries = sorted(countries.items(), key=lambda x: -x[1])[:10]
        snapshot['feeds']['flights'] = {
            'name': 'Global Flights', 'category': 'aviation', 'status': 'ok',
            'count': len(states), 'bands': bands,
            'top_origins': top_countries,
            'sparkline': sparkline(altitudes),
            'dream': dream_analysis(altitudes) if len(altitudes) >= 10 else None,
        }
        print(f'  ✓ {len(states)} aircraft airborne')
    except:
        snapshot['feeds']['flights'] = {'name': 'Flights', 'status': 'failed'}
else:
    snapshot['feeds']['flights'] = {'name': 'Flights', 'status': 'failed'}

# ═══ GDELT EVENTS ═══
print('📡 GDELT Events...')
d = fetch('https://api.gdeltproject.org/api/v2/doc/doc?query=protest%20OR%20conflict%20OR%20strike&mode=ArtList&maxrecords=20&format=json&sort=DateDesc&timespan=24h', timeout=10)
if d:
    try:
        j = json.loads(d)
        articles = j.get('articles', [])
        news = []
        for a in articles[:15]:
            news.append({
                'title': a.get('title', '')[:80],
                'url': a.get('url', ''),
                'source': a.get('domain', ''),
                'date': a.get('seendate', ''),
                'country': a.get('country', ''),
            })
        snapshot['feeds']['news'] = {
            'name': 'Global News (GDELT)', 'category': 'news', 'status': 'ok',
            'count': len(articles), 'articles': news,
        }
        print(f'  ✓ {len(articles)} articles')
    except:
        snapshot['feeds']['news'] = {'name': 'News', 'status': 'failed'}
else:
    snapshot['feeds']['news'] = {'name': 'News', 'status': 'failed'}

# ═══ REDDIT ═══
print('📡 Reddit...')
d = fetch('https://www.reddit.com/r/worldnews/top.json?limit=15&t=day', timeout=10, hdrs={'Accept': 'application/json'})
if d:
    try:
        j = json.loads(d)
        posts = j.get('data', {}).get('children', [])
        reddit = []
        for p in posts[:10]:
            pd = p['data']
            reddit.append({
                'title': pd.get('title', '')[:80],
                'score': pd.get('score', 0),
                'comments': pd.get('num_comments', 0),
                'url': 'https://reddit.com' + pd.get('permalink', ''),
            })
        scores = [p['score'] for p in reddit]
        snapshot['feeds']['reddit'] = {
            'name': 'Reddit r/worldnews', 'category': 'social', 'status': 'ok',
            'posts': reddit, 'sparkline': sparkline(scores),
            'dream': dream_analysis(scores) if len(scores) >= 10 else None,
        }
        print(f'  ✓ {len(reddit)} posts')
    except:
        snapshot['feeds']['reddit'] = {'name': 'Reddit', 'status': 'failed'}
else:
    snapshot['feeds']['reddit'] = {'name': 'Reddit', 'status': 'failed'}

# ═══ OPEN-METEO WEATHER ═══
print('📡 Weather (Open-Meteo)...')
cities = [
    ('New York', 40.71, -74.01), ('London', 51.51, -0.13), ('Tokyo', 35.68, 139.69),
    ('Moscow', 55.76, 37.62), ('Beijing', 39.90, 116.40), ('Mumbai', 19.08, 72.88),
    ('São Paulo', -23.55, -46.63), ('Sydney', -33.87, 151.21), ('Cairo', 30.04, 31.24),
    ('Lagos', 6.52, 3.38),
]
weather = []
for city, lat, lon in cities:
    d = fetch(f'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,wind_speed_10m&timezone=auto', timeout=15)
    if d:
        try:
            j = json.loads(d)
            c = j.get('current', {})
            weather.append({
                'city': city, 'temp': round(c.get('temperature_2m', 0)),
                'wind': round(c.get('wind_speed_10m', 0)),
                'lat': lat, 'lon': lon,
            })
        except: pass
    time.sleep(0.1)
if weather:
    temps = [w['temp'] for w in weather]
    snapshot['feeds']['weather'] = {
        'name': 'Global Weather', 'category': 'environment', 'status': 'ok',
        'cities': weather, 'sparkline': sparkline(temps),
        'dream': dream_analysis(temps) if len(temps) >= 10 else None,
    }
    print(f'  ✓ {len(weather)} cities')
else:
    snapshot['feeds']['weather'] = {'name': 'Weather', 'status': 'failed'}

# ═══ FRED MARKETS ═══
print('📡 FRED Markets...')
fred_series = [
    ('SP500', 'S&P 500'), ('VIXCLS', 'VIX'), ('DCOILWTICO', 'WTI Oil'),
    ('DGS10', '10Y Treasury'), ('FEDFUNDS', 'Fed Funds'),
]
markets = []
for sid, name in fred_series:
    d = fetch(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}', timeout=10)
    if d:
        rows = list(csv.reader(io.StringIO(d.decode())))
        vals = []
        for r in rows[1:]:
            try:
                v = float(r[1])
                if not np.isnan(v): vals.append(v)
            except: pass
        if vals:
            markets.append({'name': name, 'id': sid, 'current': vals[-1], 'sparkline': sparkline(vals),
                           'dream': dream_analysis(vals) if len(vals) >= 10 else None})
    time.sleep(0.2)
if markets:
    snapshot['feeds']['markets'] = {
        'name': 'Markets (FRED)', 'category': 'markets', 'status': 'ok',
        'instruments': markets,
    }
    print(f'  ✓ {len(markets)} instruments')
else:
    snapshot['feeds']['markets'] = {'name': 'Markets', 'status': 'failed'}

# ═══ WIKIPEDIA ═══
print('📡 Wikipedia...')
d = fetch('https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rcprop=title|user|timestamp|sizes&rclimit=20&format=json&rctype=edit', timeout=10)
if d:
    try:
        j = json.loads(d)
        changes = j.get('query', {}).get('recentchanges', [])
        wiki = [{'title': c.get('title', '')[:60], 'user': c.get('user', ''), 'time': c.get('timestamp', '')} for c in changes[:15]]
        snapshot['feeds']['wikipedia'] = {
            'name': 'Wikipedia Edits', 'category': 'social', 'status': 'ok',
            'count': len(changes), 'edits': wiki,
        }
        print(f'  ✓ {len(changes)} recent edits')
    except:
        snapshot['feeds']['wikipedia'] = {'name': 'Wikipedia', 'status': 'failed'}
else:
    snapshot['feeds']['wikipedia'] = {'name': 'Wikipedia', 'status': 'failed'}

# ═══ SUMMARY ═══
ok = sum(1 for f in snapshot['feeds'].values() if f.get('status') == 'ok')
total = len(snapshot['feeds'])
snapshot['summary'] = {'total_feeds': total, 'ok_feeds': ok, 'failed_feeds': total - ok}

# DREAM summary
dream_ok = [f for f in snapshot['feeds'].values() if f.get('dream')]
extraction = [f for f in dream_ok if f['dream']['regime'] == 'EXTRACTION']
natural = [f for f in dream_ok if f['dream']['regime'] == 'NATURAL']
snapshot['dream_summary'] = {
    'analyzed': len(dream_ok), 'extraction': len(extraction),
    'natural': len(natural), 'threshold': len(dream_ok) - len(extraction) - len(natural),
}

path = os.path.join(OUT, 'world_snapshot.json')
with open(path, 'w') as f:
    json.dump(snapshot, f, indent=2, ensure_ascii=False)
print(f'\n✓ Snapshot saved: {path}')
print(f'  Feeds: {ok}/{total} OK')
print(f'  DREAM analyzed: {len(dream_ok)}, extraction: {len(extraction)}, natural: {len(natural)}')
