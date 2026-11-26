#!/usr/bin/env python3
"""Global sea-surface temperature maps (actual temperature and compared with 1991-2020), for the SST page
(latest day and latest month) and the El Nino page (latest month next to the same month in 1982, 1997, 2015).

Source: NOAA OISST v2.1 at NOAA PSL (OPeNDAP), every 4th grid point of the 0.25 degree grid (a 1 degree sample),
the whole globe. Normals are NOAA PSL's own 1991-2020 long-term means (sst.mon.ltm / sst.day.mean.ltm), so no
30-year download is needed. Sea ice comes from NOAA's ice concentration in the same OISST product (icec):
a grid point with at least 15% ice cover is shown as sea ice, the usual threshold for counting ice.

Files in data/sst_map/ (each written only when it is missing or out of date, so most runs read only the
time axes of the files):
  month.json     the latest complete month in sst.mon.mean
  day.json       the latest day in this year's daily file (preliminary for about two weeks)
  past_MM.json   calendar month MM in 1982, 1997 and 2015, built once
Maps are text, one character per grid point, rows from south to north, each row from 0.125E eastwards:
  anomaly: 0.2 C steps from -9 to +9 C (ALPH; "alo": -9 in each file), actual temperature: 0.5 C steps from -2 to +36 C (ALPHT);
  ' ' = land or no data, '!' = sea ice.
"""
import json, os, sys, time
from datetime import date

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_nino34 import _load, refused, BUSY_FLAG   # same retry and back-off handling as the daily series

BASE = "https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2.highres/"
STRIDE = 4
PAST = (1982, 1997, 2015)
OUT = "data/sst_map"
ICE = 0.15
CHARS = "".join(chr(c) for c in range(35, 127) if chr(c) != "\\")
ALO = -9                                      # lowest anomaly code; was -6 until Nov 2026, when the El Nino ran past +6 C
ALPH, ALPHT = CHARS[:91], CHARS[:77]          # -9.0 ... +9.0 C by 0.2;  -2.0 ... +36.0 C by 0.5


def note(msg):
    print(msg, flush=True)
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::notice title=SST map::{msg}", flush=True)


def open_ds(name, **kw):
    import xarray as xr
    url = BASE + name
    for attempt in range(4):
        for engine in ("netcdf4", "pydap"):
            try:
                return xr.open_dataset(url, engine=engine, **kw)
            except Exception as e:
                last = e
                print(f"  open {name} with {engine} failed: {e}", flush=True)
        busy = refused(last)
        if attempt == 3 or (busy and attempt >= 1):   # PSL refusing or down: keep the maps as they are
            break
        time.sleep(60 * 2 ** attempt if busy else 8 * (attempt + 1))
    raise RuntimeError(f"could not open {name}")


def sub(ds, var):
    return ds[var].isel(lat=slice(0, None, STRIDE), lon=slice(0, None, STRIDE))


def grid_of(da):
    la, ln = da["lat"].values, da["lon"].values
    if la[0] > la[-1]:
        sys.exit("unexpected latitude order")
    return {"lat0": round(float(la[0]), 3), "lon0": round(float(ln[0]), 3), "step": round(float(ln[1] - ln[0]), 3),
            "nlat": int(len(la)), "nlon": int(len(ln))}


def get(da, i, j=None):
    """time steps i..j (inclusive) as an array (time, lat, lon); one step as (lat, lon)."""
    v = _load(da.isel(time=slice(i, (i if j is None else j) + 1))).values.astype(float)
    return v[0] if j is None else v


def check(what, a):
    v = a[np.isfinite(a)]
    msg = f"{what}: {v.size} of {a.size} ocean values, min {v.min() if v.size else 'n/a'}, max {v.max() if v.size else 'n/a'}"
    note(msg)
    if v.size < a.size * 0.5 or v.max() < 25 or v.max() > 40 or v.min() < -3 or a.size - v.size < 1000:
        sys.exit("implausible values: " + msg)


def enc(sst, clim, ice):
    """two strings (anomaly, actual temperature) for one map"""
    an, tp = [], []
    for s, c, i in zip(sst.ravel(), clim.ravel(), ice.ravel()):
        if not np.isfinite(s):
            an.append(" "); tp.append(" ")
        elif np.isfinite(i) and i >= ICE:
            an.append("!"); tp.append("!")
        else:
            an.append(" " if not np.isfinite(c) else ALPH[int(np.clip(round((s - c) / 0.2), -45, 45)) + 45])
            tp.append(ALPHT[int(np.clip(round((s + 2) / 0.5), 0, 76))])
    return "".join(an), "".join(tp)


def write(name, obj):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    with open(p + ".tmp", "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    os.replace(p + ".tmp", p)
    print("wrote", p, os.path.getsize(p), "bytes", flush=True)


def stored(name, key, grid):
    p = os.path.join(OUT, name)
    if not os.path.exists(p):
        return None
    d = json.load(open(p))
    return d.get(key) if d.get("grid") == grid and d.get("alo") == ALO else None   # older coding: rebuild


def ice_for(icec_da, months, ym):
    """ice concentration for month ym, or none (all open water) if the ice file does not have that month"""
    try:
        return get(icec_da, months.index(ym))
    except (ValueError, IndexError):
        note(f"no ice data for {ym}")
        return None


def monthly():
    ds = open_ds("sst.mon.mean.nc")
    sst = sub(ds, "sst")
    grid = grid_of(sst)
    ym = [str(m) for m in ds["time"].values.astype("datetime64[M]")]
    cur = ym[-1]
    need_cur = stored("month.json", "month", grid) != cur
    need_past = any(stored(f"past_{m:02d}.json", "base", grid) is None for m in range(1, 13))
    if not (need_cur or need_past):
        print("monthly maps up to date:", cur)
        return
    ltm = sub(open_ds("sst.mon.ltm.1991-2020.nc", decode_times=False), "sst")
    if ltm.sizes["time"] != 12:
        sys.exit("unexpected monthly normals file")
    ic = open_ds("icec.mon.mean.nc")
    icm = [str(m) for m in ic["time"].values.astype("datetime64[M]")]
    icec = sub(ic, "icec")
    zero = np.zeros((grid["nlat"], grid["nlon"]))
    if need_cur:
        m = int(cur[5:7])
        raw = get(sst, ym.index(cur))
        check(cur, raw)
        ice = ice_for(icec, icm, cur)
        clim = get(ltm, m - 1)
        la, ln = sst["lat"].values, sst["lon"].values
        box = (np.abs(la)[:, None] <= 5) & (ln[None, :] >= 190) & (ln[None, :] <= 240) & np.isfinite(raw)
        w = np.cos(np.deg2rad(la))[:, None] * np.ones_like(raw)
        note(f"{cur} Nino 3.4 anomaly on the map: {float(((raw - clim) * w)[box].sum() / w[box].sum()):+.2f} C")
        an, tp = enc(raw, clim, zero if ice is None else ice)
        write("month.json", {"month": cur, "alo": ALO, "grid": grid, "base": "1991-2020", "anom": an, "temp": tp})
    if need_past:
        clim = get(ltm, 0, 11)
        P = {}
        for y in PAST:
            i = ym.index(f"{y}-01")
            P[y] = get(sst, i, i + 11)
            check(str(y), P[y][9])
            P[y] = (P[y], [ice_for(icec, icm, f"{y}-{k + 1:02d}") for k in range(12)])
        for k in range(12):
            maps = {}
            for y in PAST:
                ice = P[y][1][k]
                an, tp = enc(P[y][0][k], clim[k], zero if ice is None else ice)
                maps[str(y)] = {"alo": ALO, "anom": an, "temp": tp}
            write(f"past_{k + 1:02d}.json", {"alo": ALO, "grid": grid, "base": "1991-2020", "maps": maps})


def daily():
    y = date.today().year
    for yr in (y, y - 1):     # early January: this year's file may not exist yet or still be empty
        try:
            ds = open_ds(f"sst.day.mean.{yr}.nc")
        except RuntimeError:
            continue
        if ds.sizes["time"]:
            break
    else:
        sys.exit("no daily file")
    sst = sub(ds, "sst")
    grid = grid_of(sst)
    days = ds["time"].values.astype("datetime64[D]")
    d = str(days[-1])
    if stored("day.json", "date", grid) == d:
        print("daily map up to date:", d)
        return
    raw = get(sst, len(days) - 1)
    check(d, raw)
    ltm = sub(open_ds("sst.day.mean.ltm.1991-2020.nc", decode_times=False), "sst")
    if ltm.sizes["time"] != 365:
        sys.exit("unexpected daily normals file")
    mo, dy = int(d[5:7]), int(d[8:10])
    doy = date(2001, mo, min(dy, 28) if mo == 2 else dy).timetuple().tm_yday   # 29 February uses 28 February
    clim = get(ltm, doy - 1)
    try:
        ic = open_ds(f"icec.day.mean.{d[:4]}.nc")
        it = [str(t) for t in ic["time"].values.astype("datetime64[D]")]
        ice = get(sub(ic, "icec"), it.index(d)) if d in it else get(sub(ic, "icec"), len(it) - 1)
    except Exception as e:
        note(f"no ice data for {d}: {e}")
        ice = np.zeros_like(raw)
    an, tp = enc(raw, clim, ice)
    write("day.json", {"date": d, "alo": ALO, "grid": grid, "base": "1991-2020", "anom": an, "temp": tp})


if __name__ == "__main__":
    # the maps need PSL's own normals, so there is no NCEI fallback; when PSL already refused the series earlier
    # in this run, keep the maps as they are instead of spending minutes on retries
    if os.path.exists(BUSY_FLAG):
        note("NOAA PSL is refusing or down in this run; maps kept as they are")
        sys.exit(0)
    what = sys.argv[1:] or ["monthly", "daily"]
    if "monthly" in what:
        monthly()
    if "daily" in what:
        daily()
