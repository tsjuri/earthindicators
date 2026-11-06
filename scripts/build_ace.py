#!/usr/bin/env python3
"""Accumulated Cyclone Energy (ACE) per storm per day, in every basin, from NOAA IBTrACS v04r01.

  build_ace.py                 download the basin files and write the outputs below
  build_ace.py --local DIR     use the ibtracs.<basin>.list.v04r01.csv files already in DIR

Outputs
  data/ace_daily.csv    date, basin, storm id, name, ace: one row per storm per day on which it added ACE.
                        Basins (IBTrACS codes): NA North Atlantic, EP Northeast Pacific (east of 180°), WP West Pacific,
                        NI North Indian, SI South Indian, SP South Pacific, SA South Atlantic.
                        NA and EP from 1971, the others from 1981 (routine satellite coverage everywhere; before that
                        the Southern Hemisphere and Indian Ocean records are patchy).
  data/ace_meta.json    source files and the newest observation in each basin (the "data through" date).
  data/ace_check.txt    season totals compared with published values.

How ACE is counted (the NHC/CSU convention)
  For every 6-hourly fix (00, 06, 12, 18 UTC) at which the storm is a tropical or subtropical storm or a hurricane
  (USA_STATUS TS, SS, HU or HR; for JTWC's areas also TY typhoon, ST super typhoon and TC tropical cyclone) with
  maximum sustained wind of at least 34 kt, add wind² / 10,000 (wind in knots, USA_WIND: the 1-minute mean from NHC
  best track, or in the West Pacific, Indian Ocean and Southern Hemisphere from the US Joint Typhoon Warning Center,
  JTWC, as CSU's global ACE does; for the current season, the operational data). Other agencies (JMA, IMD, BoM...)
  use 10-minute winds, which are lower, so their numbers are not mixed in.
  Each fix counts on its own date and in the basin it was in at that moment (BASIN column), so a storm that crosses
  from the Atlantic into the Pacific, or across the date line, counts in each basin only for its time there.
  Interpolated points (3-hourly, or USA intensity filled in, IFLAG 'P' or 'I'), special landfall times and spur tracks
  are not counted. Rows are de-duplicated on storm id and time, because a storm appears in both basin files.
"""
import csv, io, json, os, sys, urllib.request
from collections import defaultdict

BASE = "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/"
BASINS = ["NA", "EP", "WP", "NI", "SI", "SP", "SA"]
FILES = {b: f"ibtracs.{b}.list.v04r01.csv" for b in ["NA", "EP", "WP", "NI", "SI", "SP", "SA"]}
FIRST_YEAR = {"NA": 1971, "EP": 1971}   # routine satellite coverage in the eastern Pacific; elsewhere:
FIRST_YEAR_OTHER = 1981
OUT, META, CHECK = "data/ace_daily.csv", "data/ace_meta.json", "data/ace_check.txt"
STATUS = {"TS", "SS", "HU", "HR", "TY", "ST", "TC"}

# published season totals (10^4 kt^2), for the check only: Atlantic from NOAA HURDAT2 as listed by CSU and NOAA,
# Northeast Pacific (east + central) from NHC/CPHC best track. Differences of a few units can come from
# rounding and from how subtropical stages are counted. West Pacific: JTWC-based totals as listed by CSU/Wikipedia.
PUBLISHED = {"NA": {2005: 245.3, 2017: 224.9, 2004: 226.9, 1995: 227.1},
             "EP": {2018: 318.1, 1992: 294.3, 2015: 287.0},
             "WP": {1997: 570.4, 2004: 480.6, 2015: 462.9}}
NAMES = {"NA": "North Atlantic", "EP": "Northeast Pacific", "WP": "West Pacific"}


def rows(text):
    rd = csv.DictReader(io.StringIO(text))
    for r in rd:
        if not r.get("SEASON", "").strip().isdigit():   # the second line of each file holds units, not data
            continue
        yield r


def load(local):
    out = {}
    for b, f in FILES.items():
        if local:
            with open(os.path.join(local, f), encoding="utf-8", errors="replace") as fh:
                out[b] = fh.read()
        else:
            print("downloading", BASE + f, flush=True)
            req = urllib.request.Request(BASE + f, headers={"User-Agent": "earthindicators.org data update"})
            out[b] = urllib.request.urlopen(req, timeout=300).read().decode("utf-8", "replace")
    return out


def main():
    local = sys.argv[2] if len(sys.argv) == 3 and sys.argv[1] == "--local" else None
    texts = load(local)
    seen, ace = set(), defaultdict(float)          # (date, basin, sid) -> ace
    names, latest = {}, {b: "" for b in BASINS}
    skipped = defaultdict(int)                     # (basin, status) -> fixes of 34 kt or more left out, for the check
    for text in texts.values():
        for r in rows(text):
            basin = r["BASIN"].strip()
            if basin not in latest:
                continue
            t = r["ISO_TIME"].strip()              # YYYY-MM-DD HH:mm:ss
            latest[basin] = max(latest[basin], t)
            sid = r["SID"].strip()
            if (sid, t) in seen:
                continue
            seen.add((sid, t))
            if int(t[:4]) < FIRST_YEAR.get(basin, FIRST_YEAR_OTHER) or "spur" in r["TRACK_TYPE"].lower():
                continue
            hh, mm = int(t[11:13]), t[14:16]
            if hh % 6 or mm != "00":
                continue
            fl = (r.get("IFLAG") or " ")[0]
            if fl in ("P", "I"):
                continue
            try:
                w = float(r["USA_WIND"])
            except ValueError:
                continue
            if w < 34:
                continue
            st = r["USA_STATUS"].strip().upper()
            if st not in STATUS:
                skipped[(basin, st)] += 1
                continue
            ace[(t[:10], basin, sid)] += w * w / 1e4
            names[sid] = r["NAME"].strip().title().replace("Not_Named", "Unnamed")

    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", newline="") as fh:
        wr = csv.writer(fh, lineterminator="\n")
        wr.writerow(["date", "basin", "sid", "name", "ace"])
        for (d, b, s), v in sorted(ace.items()):
            wr.writerow([d, b, s, names.get(s, ""), f"{v:.4f}"])

    totals = defaultdict(float)
    for (d, b, s), v in ace.items():
        totals[(b, int(d[:4]))] += v
    lines = ["Season ACE calculated here from IBTrACS, compared with published season totals.", ""]
    worst = 0.0
    for b, ref in PUBLISHED.items():
        for y, p in sorted(ref.items()):
            c = totals.get((b, y), 0.0)
            worst = max(worst, abs(c - p) / p)
            lines.append(f"{NAMES[b]} {y}: here {c:.1f}, published {p:.1f}, "
                         f"difference {c - p:+.1f} ({(c - p) / p * 100:+.1f}%)")
    lines += ["", f"Largest difference: {worst * 100:.1f}%.", "",
              "Fixes of 34 kt or more left out because of their status (EX extratropical, LO low, DB disturbance, ...):"]
    lines += [f"  {b} {st or '(blank)'}: {n}" for (b, st), n in sorted(skipped.items())]
    yrs = sorted({y for (_, y) in totals})
    lines += ["", "Calendar-year ACE, all basins together:"]
    lines += [f"  {y}: {sum(v for (b, yy), v in totals.items() if yy == y):.1f}" for y in yrs if y >= FIRST_YEAR_OTHER]
    with open(CHECK, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    print("\n".join(lines))

    meta = {"source": {b: BASE + f for b, f in FILES.items()},
            "latest": {b: v[:16] for b, v in latest.items()}}
    with open(META, "w") as fh:
        json.dump(meta, fh, indent=1)
    print(f"wrote {OUT}: {len(ace)} storm-days; newest fixes {meta['latest']}")
    if worst > 0.05 or len(ace) < 20000:
        sys.exit("check failed: season totals differ from published values by more than 5%, or too few rows")


if __name__ == "__main__":
    main()
