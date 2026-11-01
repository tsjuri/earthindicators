#!/usr/bin/env python3
"""Global temperature over the last 12,000 years (Temp12k) for the 12,000-year chart on the air page.

Kaufman et al. 2020, "Holocene global mean surface temperature, a multi-method reconstruction approach",
Scientific Data 7, 201 (doi:10.1038/s41597-020-0530-7): about 1,300 records from 679 sites (lake and sea floor
sediments, ice, peat, cave deposits, pollen), combined with five different statistical methods; the file used here
pools all five (500 ensemble members each) into percentiles. Values are degC relative to 1800-1900 (the 19th
century); ages are years before 1950. This is a finished study that will not change, so it is downloaded once and
kept in data/; run with --refetch to download it again. The page adds the measured temperature itself, from
data/temp_records_monthly.csv, so the modern part grows by itself.

  -> data/temp12k_global.csv  year (CE, negative = BCE, centre of the bin), p5, p50, p95 (degC vs 1800-1900)
"""
import csv, io, os, re, sys, urllib.request

URL = "https://www.ncei.noaa.gov/pub/data/paleo/reconstructions/kaufman2020/temp12k_allmethods_percentiles.csv"
RAW, OUT = "data/temp12k_allmethods_percentiles.csv", "data/temp12k_global.csv"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "earthindicators.org data update"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8-sig")


def main():
    if "--refetch" in sys.argv or not os.path.exists(RAW):
        txt = get(URL)
        if "global" not in txt.lower():
            sys.exit("downloaded file has no global columns; left the old file in place")
        open(RAW, "w").write(txt)
        print(f"  downloaded {URL}")
    rows = list(csv.reader(io.StringIO(open(RAW).read())))
    head = [h.strip() for h in rows[0]]
    print("  columns:", head)
    age_i = next(i for i, h in enumerate(head) if h.lower().startswith("age"))
    # global columns end in a percentile: global_5, global_median / global_50, global_95 (or 2.5 / 97.5)
    pc = {}
    for i, h in enumerate(head):
        m = re.match(r"(?i)^global(?:[ _-]?mean)?[ _-]+(median|[0-9.]+)(?:th)?$", h)
        if m:
            pc[50.0 if m.group(1).lower() == "median" else float(m.group(1))] = i
    if 50.0 not in pc or len(pc) < 3:
        sys.exit(f"could not find global percentile columns in {head}")
    lo, hi = min(pc), max(pc)
    print(f"  using percentiles {lo}, 50 and {hi}")
    data = []
    for r in rows[1:]:
        try:
            age = float(r[age_i]); v = [float(r[pc[k]]) for k in (lo, 50.0, hi)]
        except (ValueError, IndexError):
            continue
        data.append((age, *v))
    if max(d[0] for d in data) < 100:          # ages given in thousands of years
        data = [(a * 1000, *v) for a, *v in data]
    out = sorted(((round(1950 - a), *(round(x, 3) for x in v)) for a, *v in data), key=lambda d: d[0])
    if len(out) < 50 or out[0][0] > -9000:
        sys.exit(f"unexpected series ({len(out)} rows, starting {out[0][0] if out else None})")
    buf = io.StringIO(); w = csv.writer(buf, lineterminator="\n")
    w.writerow(["year", f"p{lo:g}", "p50", f"p{hi:g}"]); w.writerows(out)
    if not os.path.exists(OUT) or open(OUT).read() != buf.getvalue():
        open(OUT, "w").write(buf.getvalue()); print(f"  wrote {OUT} ({len(out)} rows)")
    pk = max(out, key=lambda d: d[2])
    print(f"  {out[0][0]} to {out[-1][0]}; warmest bin {pk[0]}: median {pk[2]} ({pk[1]} to {pk[3]}) degC vs 1800-1900")


if __name__ == "__main__":
    main()
