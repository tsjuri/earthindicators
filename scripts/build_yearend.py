#!/usr/bin/env python3
"""Year-end projection for the models page: where this year and next year are likely to finish (ERA5 world air temperature).

Method (in the spirit of Zeke Hausfather's year-end estimates, kept to measured inputs only):
  * Monthly ERA5 world anomalies from data/era5_t2_global_daily.csv (complete months only), against each month's
    1991-2020 mean; yearly values weighted by days; + 0.88 °C for "above 1850-1900" (Copernicus's yearly offset).
  * ENSO = NOAA CPC's Relative Oceanic Niño Index (RONI: Niño 3.4 minus the tropical-mean SST anomaly, 1950 onward),
    for the latest 3-month season available this year. El Niño warms the world with a lag of a few months, so the
    latest season tells a lot about the next 12 months.
  * This year:  year total  = a + b * (year so far) + c * ENSO                 fitted on every earlier year from 1950
  * Next year:  next year   = a + b * (year so far) + c * ENSO + d * year      fitted on every earlier pair of years
    using the same months and the same ENSO season in every year.
  * 90% range = regression prediction interval (t distribution). Chances by simulation from those ranges.
  * Check: the same method re-run for each past year with that year left out (how often the outcome fell in the range).
Zeke uses ENSO model forecasts (a 14-model plume); those are no longer published as data (IRI stopped; NMME gives only
images), so this uses the latest measured ENSO state instead, which is a projection from measurements, not a forecast
from models.

Writes data/models_yearend.json. Run from the repo root: python scripts/build_yearend.py [RONI file]
If RONI cannot be downloaded, it falls back to the site's own daily Niño 3.4 SST (from 1982, plain anomaly).
"""
import csv, datetime as dt, json, math, os, random, sys, urllib.request

RONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt"
SEAS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]  # season i ends in month i+2
PI = 0.88
OUT = "data/models_yearend.json"


def months_era5():
    S = {}
    for r in csv.DictReader(open("data/era5_t2_global_daily.csv")):
        d, v = r["date"], r["temp"]
        if not v:
            continue
        k = (int(d[:4]), int(d[5:7]))
        a = S.setdefault(k, [0.0, 0])
        a[0] += float(v); a[1] += 1
    M = {}
    for (y, m), (s, n) in S.items():
        dim = (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.date(y, m, 1)).days
        if n == dim:
            M[(y, m)] = s / n
    clim = {m: sum(M[(y, m)] for y in range(1991, 2021)) / 30 for m in range(1, 13)}
    return {k: v - clim[k[1]] for k, v in M.items()}


def dim(y, m):
    return (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.date(y, m, 1)).days


def wmean(A, y, m1, m2):
    if any((y, m) not in A for m in range(m1, m2 + 1)):
        return None
    w = [dim(y, m) for m in range(m1, m2 + 1)]
    return sum(A[(y, m)] * w[i] for i, m in enumerate(range(m1, m2 + 1))) / sum(w)


def roni(path):
    txt = open(path).read() if path and os.path.exists(path) else None
    if txt is None:
        try:
            with urllib.request.urlopen(RONI_URL, timeout=60) as r:
                txt = r.read().decode()
        except Exception as e:
            print("RONI download failed:", e)
            return None
    E = {}
    for l in txt.splitlines():
        p = l.split()
        if len(p) >= 3 and p[0] in SEAS and p[1].isdigit():
            try:
                E[(int(p[1]), SEAS.index(p[0]))] = float(p[-1])
            except ValueError:
                pass
    if len(E) < 600 or min(y for y, _ in E) > 1950:
        print("RONI file not as expected; rows:", len(E))
        return None
    return E


def nino_fallback():
    S = {}
    for r in csv.DictReader(open("data/nino34_daily_sst.csv")):
        k = (int(r["date"][:4]), int(r["date"][5:7]))
        a = S.setdefault(k, [0.0, 0]); a[0] += float(r["sst"]); a[1] += 1
    M = {k: s / n for k, (s, n) in S.items() if n >= 28}
    clim = {m: sum(M[(y, m)] for y in range(1991, 2021)) / 30 for m in range(1, 13)}
    A = {k: v - clim[k[1]] for k, v in M.items()}
    E = {}
    for y in range(1982, 2100):
        for i in range(11):  # DJF..OND, labelled by the year they end in (DJF 2026 = Dec 2025-Feb 2026), like CPC
            ks = [(y, e) if e >= 1 else (y - 1, e + 12) for e in (i, i + 1, i + 2)]
            if all(k in A for k in ks):
                E[(y, i)] = sum(A[k] for k in ks) / 3
    return E


def ols(X, Y):
    """Least squares with intercept. Returns coef, residual sd, (X'X)^-1, n, k."""
    n, k = len(Y), len(X[0]) + 1
    Z = [[1.0] + list(r) for r in X]
    XtX = [[sum(Z[r][i] * Z[r][j] for r in range(n)) for j in range(k)] for i in range(k)]
    XtY = [sum(Z[r][i] * Y[r] for r in range(n)) for i in range(k)]
    inv = invert(XtX)
    b = [sum(inv[i][j] * XtY[j] for j in range(k)) for i in range(k)]
    res = [Y[r] - sum(b[i] * Z[r][i] for i in range(k)) for r in range(n)]
    s = math.sqrt(sum(e * e for e in res) / (n - k))
    return b, s, inv, n, k


def invert(A):
    n = len(A); M = [row[:] + [float(i == j) for j in range(n)] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c])); M[c], M[p] = M[p], M[c]
        pv = M[c][c]; M[c] = [v / pv for v in M[c]]
        for r in range(n):
            if r != c:
                f = M[r][c]; M[r] = [M[r][j] - f * M[c][j] for j in range(2 * n)]
    return [row[n:] for row in M]


def tq(df):  # 95th percentile of t (one side of a 90% range), good to 3 decimals for df >= 10
    z = 1.6449
    return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2)


def predict(X, Y, x):
    b, s, inv, n, k = ols(X, Y)
    z = [1.0] + list(x)
    mu = sum(b[i] * z[i] for i in range(k))
    lev = sum(z[i] * inv[i][j] * z[j] for i in range(k) for j in range(k))
    se = s * math.sqrt(1 + lev)
    return mu, se, n - k


def main():
    A = months_era5()
    Y = max(y for y, _ in A)
    m = max(mm for yy, mm in A if yy == Y)
    if m == 12:
        print("Year complete; nothing to project"); Y += 0  # still useful for next year
    ann = {y: wmean(A, y, 1, 12) for y in range(1940, Y + (m == 12))}
    ann = {y: v for y, v in ann.items() if v is not None}
    ytd = {y: wmean(A, y, 1, m) for y in range(1940, Y + 1)}

    E, src = roni(sys.argv[1] if len(sys.argv) > 1 else None), "RONI"
    if E is None:
        E, src = nino_fallback(), "Niño 3.4 (OISST)"
    # latest season ending in or before month m of this year (DJF..OND end in Feb..Dec of the year they are labelled with)
    cands = [i for i in range(11) if i + 2 <= m and (Y, i) in E]
    if not cands:
        sys.exit("No ENSO season for this year yet")
    si = max(cands)
    yrs = [y for y in range(1940, Y) if y in ann and ytd.get(y) is not None and (y, si) in E]

    # this year
    X1 = [[ytd[y], E[(y, si)]] for y in yrs]; Y1 = [ann[y] for y in yrs]
    mu1, se1, df1 = predict(X1, Y1, [ytd[Y], E[(Y, si)]])
    # next year
    yrs2 = [y for y in yrs if y + 1 in ann]
    X2 = [[ytd[y], E[(y, si)], y] for y in yrs2]; Y2 = [ann[y + 1] for y in yrs2]
    mu2, se2, df2 = predict(X2, Y2, [ytd[Y], E[(Y, si)], Y])

    # check: leave each past year out, count outcomes inside the 90% range
    def loo(X, Yv, q):
        hit = 0; errs = []
        for i in range(len(Yv)):
            mu, se, df = predict(X[:i] + X[i + 1:], Yv[:i] + Yv[i + 1:], X[i])
            hit += abs(Yv[i] - mu) <= q(df) * se; errs.append(abs(Yv[i] - mu))
        return hit / len(Yv), sorted(errs)[len(errs) // 2]
    c1, e1 = loo(X1, Y1, tq); c2, e2 = loo(X2, Y2, tq)

    # chances (simulation; this year's and next year's errors drawn independently)
    prior = sorted(ann.items(), key=lambda t: -t[1])
    rec_y, rec = prior[0]; sec = prior[1][1]
    random.seed(1); N = 200000; r1 = r2 = rk2 = 0
    for _ in range(N):
        a = mu1 + se1 * random.gauss(0, 1) * math.sqrt(df1 / max(df1 - 2, 1))
        b = mu2 + se2 * random.gauss(0, 1) * math.sqrt(df2 / max(df2 - 2, 1))
        r1 += a > rec; rk2 += sec < a <= rec; r2 += b > max(rec, a)
    q1, q2 = tq(df1), tq(df2)
    f = lambda v: round(v + PI, 3)
    out = {
        "made": dt.date.today().isoformat(),
        "year": Y, "through_month": m, "enso": {"source": src, "season": SEAS[si], "value": round(E[(Y, si)], 2)},
        "offset": PI,
        "annual": [[y, f(ann[y])] for y in sorted(ann)],
        "ytd": f(ytd[Y]),
        "record": [rec_y, f(rec)], "second": [prior[1][0], f(sec)],
        "this": {"median": f(mu1), "lo": f(mu1 - q1 * se1), "hi": f(mu1 + q1 * se1),
                 "p_record": round(r1 / N, 3), "p_second": round(rk2 / N, 3)},
        "next": {"median": f(mu2), "lo": f(mu2 - q2 * se2), "hi": f(mu2 + q2 * se2), "p_record": round(r2 / N, 3)},
        "check": {"this": {"years": len(Y1), "inside90": round(c1, 3), "median_miss": round(e1, 3)},
                  "next": {"years": len(Y2), "inside90": round(c2, 3), "median_miss": round(e2, 3)}},
    }
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print(json.dumps({k: v for k, v in out.items() if k != "annual"}, indent=1))


main()
