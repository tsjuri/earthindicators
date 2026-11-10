#!/usr/bin/env python3
"""Data for the models page (models.html): past projections checked against what happened, and what comes next.

The sources are published archives that do not change from day to day, so this runs by hand (and again when a source
publishes a new edition, e.g. the yearly carbon-budget update each June). It writes:
  data/models_old.json     the 17 projections from 1970-2007 that Hausfather et al. (2020) checked: projected warming rate
                           over each test period and the paper's verdict; Hansen's 1988 scenarios A, B and C (temperature
                           and greenhouse-gas forcing); measured greenhouse-gas forcing since 1958 (IGCC)
  data/models_cmip6.csv    CMIP6 climate models, historical runs continued with the middle scenario SSP2-4.5: yearly
                           global air temperature above 1850-1900, smallest, 17th percentile, median, 83rd, largest
  data/models_outlook.json IPCC AR6 projections by scenario (Table SPM.1), remaining carbon budgets (IGCC), WMO 5-year
                           outlook and UNEP's estimate for current policies, each with its source

Run from the repo root: python scripts/build_models.py
"""
import csv, io, json, os, statistics, urllib.request

RAW = "https://raw.githubusercontent.com/"
OLD = RAW + "hausfath/OldModels/master/"
CMIP = RAW + "swartn/cmip6-gmst-anoms/master/cmip6_{}_gmst_swartn_gmst_anoms.csv"
IGCC = RAW + "ClimateIndicator/data/main/data/base/"


def get(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def rows(url):
    return list(csv.DictReader(io.StringIO(get(url).decode("utf-8"))))


# ---- 1. old projections (Hausfather, Drake, Abbott & Schmidt 2020, GRL, doi:10.1029/2019GL085378; MIT license)
NAMES = {  # paper's id -> label on the site, year published
    "manabe_1970": ("Manabe 1970", 1970), "mitchell_1970": ("Mitchell 1970", 1970), "benson_1970": ("Benson 1970", 1970),
    "rasool_schneider_1971": ("Rasool & Schneider 1971", 1971), "sawyer_1972": ("Sawyer 1972", 1972),
    "broecker_1975": ("Broecker 1975", 1975), "nordhaus_1977": ("Nordhaus 1977", 1977),
    "schneider_thompson_1981": ("Schneider & Thompson 1981", 1981), "hansen_1981_1": ("Hansen 1981, scenario 1", 1981),
    "hansen_1981_2a": ("Hansen 1981, scenario 2a", 1981), "hansen_1988_a": ("Hansen 1988, scenario A", 1988),
    "hansen_1988_b": ("Hansen 1988, scenario B", 1988), "hansen_1988_c": ("Hansen 1988, scenario C", 1988),
    "far_ebm_best": ("IPCC 1990 (first report)", 1990), "manabe_stouffer_1993": ("Manabe & Stouffer 1993", 1993),
    "sar_ebm_best": ("IPCC 1995 (second report)", 1995), "tar_ebm_best": ("IPCC 2001 (third report)", 2001),
    "ar4_mmm_best": ("IPCC 2007 (fourth report)", 2007),
}


def old_models():
    trend = {r["model"]: float(r["coef"]) for r in rows(OLD + "data/interim/single_model_trends.csv") if r["dtype"] == "model_time"}
    out = []
    for r in rows(OLD + "data/interim/model_obs_time_diffs.csv"):
        m = r["model"]
        if m not in NAMES:
            continue
        y0, y1 = json.loads(r["timeframe"])
        out.append({"id": m, "label": NAMES[m][0], "pub": NAMES[m][1], "from": y0, "to": y1,
                    "rate": round(trend[m] * 10, 3),                        # projected warming, °C per decade
                    "match": float(r["coef_low"]) <= 0 <= float(r["coef_high"])})   # paper: difference not significant
    out.sort(key=lambda x: (x["pub"], x["label"]))
    assert len(out) == 18, len(out)
    return out


def hansen():
    # forcing (1958-2017): the Hausfather et al. digitization; temperature (1958-2019): RealClimate's file (Gavin
    # Schmidt), which matches it to 2017 and adds 2018-2019, where Hansen's 1988 model runs end
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(get(OLD + "data/raw/model_temp_data/Model%20timeseries.xlsx")), data_only=True)
    ws = wb["Individual papers"]
    col = {h: i for i, h in enumerate(c.value for c in ws[1])}
    F, T0 = {k: {} for k in "ABC"}, {k: {} for k in "ABC"}
    for row in ws.iter_rows(min_row=2, values_only=True):
        y = row[col["Year"]]
        for k in "ABC":
            f, t = row[col[f"Hansen_1988_{k}_F"]], row[col[f"Hansen_1988_{k}_T"]]
            if isinstance(f, (int, float)) and 1958 <= y <= 2017:
                F[k][y], T0[k][y] = round(f, 4), t
    try:
        raw = get("https://www.realclimate.org/data/scen_ABC_temp.data").decode()
        open("reference/h88/scen_ABC_temp.data", "w").write(raw)          # keep the copy up to date
    except Exception as e:
        print("RealClimate not reachable, using the saved copy:", e)
        raw = open("reference/h88/scen_ABC_temp.data").read()
    T = {k: {} for k in "ABC"}
    for line in raw.splitlines():
        p = line.split()
        if len(p) == 4 and p[0].isdigit():
            for k, v in zip("ABC", p[1:]):
                T[k][int(p[0])] = float(v)
    ty, fy = sorted(T["A"]), sorted(F["A"])
    assert ty[0] == 1958 and ty[-1] == 2019 and fy[-1] == 2017
    for k in "ABC":                                                     # the two copies agree where they overlap
        assert all(abs(T[k][y] - T0[k][y]) < 0.002 for y in fy), k
    return {"years": ty, **{k + "_T": [T[k][y] for y in ty] for k in "ABC"},
            "F_years": fy, **{k + "_F": [F[k][y] for y in fy] for k in "ABC"}}


def igcc_ghg_forcing():
    # well-mixed greenhouse gases, the forcing Hansen's scenarios describe; change since 1958 (W/m²)
    R = {int(float(r["time"])): float(r["wmghg"]) for r in rows(IGCC + "effective_radiative_forcing/ERF_best_aggregates.csv")}
    ys = [y for y in sorted(R) if y >= 1958]
    return {"years": ys, "F": [round(R[y] - R[1958], 4) for y in ys]}


# ---- 2. CMIP6 (Neil Swart, CCCma: one run, r1i1p1f1, per model; tas above 1850-1900; Open Government License - Canada)
def cmip6():
    def load(exp):
        R = list(csv.reader(io.StringIO(get(CMIP.format(exp)).decode("utf-8"))))
        names = R[0][2:]
        return {int(r[1]): {n: float(v) for n, v in zip(names, r[2:]) if v.strip()} for r in R[1:]}
    H, F = load("historical"), load("ssp245")
    # only models with every year in both experiments, so the spread is drawn from the same models throughout
    full = lambda D: set.intersection(*(set(v) for v in D.values()))
    models = sorted(full(H) & full(F))
    assert set(range(1850, 2015)) <= set(H) and set(range(2015, 2101)) <= set(F)
    out = []
    for y in range(1850, 2101):
        src = H if y <= 2014 else F
        v = sorted(src[y][m] for m in models)
        q = statistics.quantiles(v, n=6, method="inclusive")         # sixths: 1/6 ≈ 17th, 5/6 ≈ 83rd percentile
        out.append([y, len(v), v[0], q[0], statistics.median(v), q[4], v[-1]])
    return models, out


# ---- 3. what comes next
def budgets():
    # Lamboll et al., IGCC 2025 (Forster et al. 2026, ESSD 18, 3889): remaining CO2 budget from 1 January 2026, GtCO2,
    # by warming level and likelihood (50% and 67%); MAGICC, the paper's central setup (human-induced warming 1.24 °C)
    B = {}
    for r in rows(IGCC + "carbon_budget/budget_normal_magicc_True_fair_False_esf_7.1pm26.7_likeli_0.6827_nonCO2pc50.0_GtCO2"
                  "_permaf_False_zecsd_0.0_asym_False_hdT_1.24NonlinNonCO2_all_None_recEm213.csv"):
        t = round(float(r["dT_targets"]), 1)
        if 1.5 <= t <= 2.0:
            B[t] = {"p50": round(float(r["0.5"])), "p67": round(float(r["0.67"]))}
    return [{"t": t, **B[t]} for t in sorted(B)]


AR6C4 = RAW + "chrisroadmap/ar6/main/data_input/chapter4_assessed_ranges/assessed_ssp{}_{}.nc"


def ar6_series():
    # IPCC AR6 WG1 Chapter 4 assessed global surface temperature change (central estimate and 5-95% range) per scenario,
    # as files in Chris Smith's AR6 repository (MIT). Each value is a 20-year average relative to 1995-2014; the value for
    # year Y covers Y-10 to Y+9 (2091 = 2081-2100, matching Table SPM.1). Plus 0.85 °C, the AR6 assessed warming from
    # 1850-1900 to 1995-2014, gives °C above 1850-1900. Needs the netCDF4 package.
    import netCDF4, tempfile, os
    out, years = {}, None
    for s, name in (("119", "SSP1-1.9"), ("126", "SSP1-2.6"), ("245", "SSP2-4.5"), ("370", "SSP3-7.0"), ("585", "SSP5-8.5")):
        out[name] = {}
        for q, key in (("central", "mid"), ("05", "lo"), ("95", "hi")):
            with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as f:
                f.write(get(AR6C4.format(s, q)))
            D = netCDF4.Dataset(f.name)
            var = [v for v in D.variables if v != "time"][0]
            ys = [t.year for t in netCDF4.num2date(D["time"][:], D["time"].units, D["time"].calendar)]
            vals = [round(float(x) + 0.85, 3) for x in D[var][:]]
            D.close(); os.unlink(f.name)
            assert years in (None, ys); years = ys
            out[name][key] = vals
    # check against Table SPM.1 (2021-2040, 2041-2060, 2081-2100): central estimates agree to the table's rounding;
    # the 5-95% edges in these files can be up to 0.1 °C narrower than the table's (assessed and rounded separately)
    for p, lab in enumerate((2031, 2051, 2091)):
        i = years.index(lab)
        for k, v in AR6.items():
            for key, j, tol in (("mid", 0, 0.051), ("lo", 1, 0.1), ("hi", 2, 0.1)):
                assert abs(out[k][key][i] - v[p][j]) <= tol, (k, lab, key, out[k][key][i], v[p][j])
    return {"mid_year": [y - 0.5 for y in years], "scenarios": out,   # middle of each 20-year window
            "source": "IPCC AR6 WG1 Chapter 4, assessed global surface temperature change (Lee et al. 2021); files: github.com/chrisroadmap/ar6"}


def ghg_emissions():
    # total greenhouse gas emissions by gas, billion metric tons CO2-equivalent (GWP100), Lamb et al. for IGCC 2025
    R = {int(float(r["year"])): r for r in rows(IGCC + "greenhouse_gas_emissions/greehouse_gas_emissions_co2eq.csv")}
    keys = (("CO2-FFI", "co2_fossil"), ("CO2-LULUCF", "co2_land"), ("CH4", "ch4"), ("N2O", "n2o"), ("F-gases", "fgas"))
    # F-gases are only in the data from 1990; earlier years keep the other four and leave F-gases blank (None)
    ys = [y for y in sorted(R) if all(R[y][k].strip() for k, _ in keys[:4])]
    assert ys[0] == 1970 and ys[-1] >= 2024 and ys == list(range(ys[0], ys[-1] + 1)), ys[:3]
    assert all(R[y]["F-gases"].strip() for y in ys if y >= 1990)
    num = lambda v: round(float(v), 3) if v.strip() else None
    return {"years": ys, **{n: [num(R[y][k]) for y in ys] for k, n in keys},
            "source": "Lamb et al., greenhouse gas emissions for the Indicators of Global Climate Change 2025 (Forster et al. 2026); CO2-equivalent with 100-year global warming potentials",
            "url": "https://github.com/ClimateIndicator/data"}


AR6 = {  # IPCC AR6 WG1 SPM, Table SPM.1: best estimate and very likely range, °C above 1850-1900
    "SSP1-1.9": [[1.5, 1.2, 1.7], [1.6, 1.2, 2.0], [1.4, 1.0, 1.8]],
    "SSP1-2.6": [[1.5, 1.2, 1.8], [1.7, 1.3, 2.2], [1.8, 1.3, 2.4]],
    "SSP2-4.5": [[1.5, 1.2, 1.8], [2.0, 1.6, 2.5], [2.7, 2.1, 3.5]],
    "SSP3-7.0": [[1.5, 1.2, 1.8], [2.1, 1.7, 2.6], [3.6, 2.8, 4.6]],
    "SSP5-8.5": [[1.6, 1.3, 1.9], [2.4, 1.9, 3.0], [4.4, 3.3, 5.7]],
}


# a few values from Hansen's table (landocean_1880_full.txt, °C vs 1880-1920), to check the conversion from NASA's file
H_CHECK = {"1880-01": 0.14, "1880-02": 0.04, "1880-03": 0.19, "1881-04": 0.32, "1882-01": 0.49,
           "2023-09": 1.73, "2024-02": 1.72, "2024-07": 1.44, "2025-01": 1.70, "2025-07": 1.26}


def hansen_temp():
    # Hansen's temperature measure: NASA GISTEMP v4 land-ocean index relative to 1880-1920 (his group's table at
    # columbia.edu/~jeh1/Data/Temperature/new_tables/landocean_1880_full.txt). That server refuses scripted downloads,
    # so the same numbers are made from NASA's own file (relative to 1951-1980) by subtracting the 1880-1920 average,
    # and checked against values from Hansen's table. Written as month,anomaly.
    req = urllib.request.Request("https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv",
                                 headers={"User-Agent": "Mozilla/5.0 (earthindicators.org data update)"})
    text = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
    M = {}
    for line in text.splitlines():
        p = line.split(",")
        if p[0].isdigit() and len(p[0]) == 4:
            for k, v in enumerate(p[1:13]):
                if v.strip() not in ("***", ""):
                    M[f"{p[0]}-{k + 1:02d}"] = float(v)
    base = [M[m] for m in M if 1880 <= int(m[:4]) <= 1920]
    one = sum(base) / len(base)                                         # one shift for all months
    per = {k: sum(M[m] for m in M if 1880 <= int(m[:4]) <= 1920 and m[5:] == f"{k:02d}") / 41 for k in range(1, 13)}
    errs = {"one shift": max(abs(M[m] - one - v) for m, v in H_CHECK.items()),
            "per month": max(abs(M[m] - per[int(m[5:])] - v) for m, v in H_CHECK.items())}
    os.makedirs("reference", exist_ok=True)
    open("reference/hansen_temp_check.txt", "w").write(f"largest difference from Hansen's table: {errs}\nlast month {max(M)}\n")
    way = min(errs, key=errs.get)
    assert errs[way] <= 0.015, errs                                     # tables are rounded to 0.01
    out = [(m, M[m] - (one if way == "one shift" else per[int(m[5:])])) for m in sorted(M)]
    with open("data/models_hansen_temp.csv", "w") as f:
        f.write(f"# NASA GISTEMP v4 land-ocean index, °C relative to 1880-1920 ({way}), from https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv; matches Hansen's table landocean_1880_full.txt within {errs[way]:.3f} °C\n")
        f.write("month,anom\n" + "".join(f"{m},{v:.3f}\n" for m, v in out))
    print("wrote data/models_hansen_temp.csv through", out[-1][0], errs)


def main():
    old = {"source": "Hausfather, Drake, Abbott & Schmidt (2020), Geophysical Research Letters 47, e2019GL085378",
           "doi": "https://doi.org/10.1029/2019GL085378", "data": "https://github.com/hausfath/OldModels",
           "projections": old_models(), "hansen1988": hansen(), "hansen1988_source": "Temperature 1958-2019: https://www.realclimate.org/data/scen_ABC_temp.data; forcing: Hausfather et al. 2020", "ghg_forcing": igcc_ghg_forcing(),
           "forcing_source": "Forster et al. (2026), Indicators of Global Climate Change 2025, ESSD; https://github.com/ClimateIndicator/data"}
    json.dump(old, open("data/models_old.json", "w"), separators=(",", ":"))

    models, C = cmip6()
    with open("data/models_cmip6.csv", "w", newline="") as f:
        f.write("# CMIP6, one run per model (r1i1p1f1), historical to 2014 then SSP2-4.5; global air temperature (tas) above 1850-1900, °C\n")
        f.write("# " + str(len(models)) + " models: " + " ".join(models) + "\n")
        f.write("# source: Neil Swart, CCCma, https://github.com/swartn/cmip6-gmst-anoms (doi:10.5281/zenodo.3986584 badge in repo)\n")
        w = csv.writer(f)
        w.writerow(["year", "n", "min", "p17", "median", "p83", "max"])
        for r in C:
            w.writerow([r[0], r[1]] + [f"{x:.3f}" for x in r[2:]])

    outlook = {
        "ar6": {"periods": ["2021–2040", "2041–2060", "2081–2100"], "scenarios": AR6,
                "source": "IPCC AR6 Working Group I, Summary for Policymakers, Table SPM.1 (2021)",
                "url": "https://www.ipcc.ch/report/ar6/wg1/chapter/summary-for-policymakers/"},
        "ar6_series": ar6_series(),
        "budget": {"from": "2026-01-01", "levels": budgets(),
                   "emissions": {"year": 2024, "fossil": 38.6, "land": 4.6},   # GtCO2, same paper, section 2
                   "source": "Forster et al. (2026), Indicators of Global Climate Change 2025, Earth System Science Data 18, 3889",
                   "url": "https://doi.org/10.5194/essd-18-3889-2026"},
        "wmo": {"period": "2026–2030", "one_year_above_15": 91, "mean_above_15": 75, "new_record": 86, "year_above_2": 1,
                "range": [1.3, 1.9], "published": "2026-05-28",
                "source": "WMO Global Annual to Decadal Climate Update 2026–2035", "url": "https://wmo.int/node/38645"},
        # Hansen's chart "Global Surface Temperature (Base Period 1880-1920)", version with data through September 2026:
        # projected next El Nino peak of the 12-month running mean, read from the chart image (3000 px; axes calibrated
        # on the gridlines to 0.003 °C and 0.03 yr). Frozen here: the chart is redrawn every month.
        "hansen_chart": {"data_through": "2026-09", "peak": {"x": 2027.21, "lo": 1.65, "hi": 1.75},
                         "low": {"x": 2026.54, "lo": 1.40, "hi": 1.45},
                         "url": "https://www.columbia.edu/~jeh1/Data/Temperature/"},
        # Hansen's recent dated predictions, in his own measure (NASA GISTEMP, 1880-1920); the page scores them each month
        "hansen_sources": {
            "paper": {"title": "Hansen et al. 2025, Global warming has accelerated (Environment)", "url": "https://doi.org/10.1080/00139157.2025.2434494"},
            "post": {"title": "Hansen, Kharecha, Morgan & Vest, Beware media hype. It's not the El Nino! (Climate Uncensored)", "url": "https://jimehansen.substack.com/p/beware-media-hype-its-not-the-el"},
            "chart": {"title": "Hansen's monthly temperature chart, data through September 2026", "url": "https://www.columbia.edu/~jeh1/Data/Temperature/"}},
        "hansen_tests": [
            {"id": "end2024", "made": "February 2025", "src": "paper", "text": "The 12-month average will still be above +1.5 °C at the end of 2024."},
            {"id": "barely2025", "made": "February 2025", "src": "paper", "text": "In 2025 it will at most barely fall below +1.5 °C."},
            {"id": "near15", "made": "February 2025", "src": "paper", "text": "It will not fall much below +1.5 °C, but stay near or above it for the next few years."},
            {"id": "augdec", "made": "23 July 2026", "src": "post", "text": "August to December 2026 will each be warmer than the same month in 2024."},
            {"id": "record2026", "made": "23 July 2026", "src": "post", "text": "2026 will be the warmest year on record."},
            {"id": "peak2027", "made": "October 2026", "src": "chart", "text": "The coming El Niño will lift the 12-month average to 1.65–1.75 °C around early 2027."},
            {"id": "hotter2027", "made": "23 July 2026", "src": "post", "text": "2027 will be warmer still than 2026."}],
        "ghg": ghg_emissions(),
        # earlier "required" paths, as percentage changes from each report's own base year (so they can be applied to this
        # site's emissions series without mixing different inventories), and UNEP's estimate for full delivery of the pledges
        "ghg_old_paths": [
            {"made": 2010, "target": "2 °C", "base": 2009, "points": [[2020, -8.3]],
             "note": "about 44 GtCO2e in 2020 against about 48 in 2009", "src": "UNEP Emissions Gap Report 2010",
             "url": "https://www.unep.org/resources/emissions-gap-report-2010"},
            {"made": 2019, "target": "2 °C", "base": 2019, "rate": -2.7, "to": 2030,
             "note": "2.7% less every year from 2020 to 2030", "src": "UNEP Emissions Gap Report 2019",
             "url": "https://www.unep.org/resources/emissions-gap-report-2019"},
            {"made": 2019, "target": "1.5 °C", "base": 2019, "rate": -7.6, "to": 2030,
             "note": "7.6% less every year from 2020 to 2030", "src": "UNEP Emissions Gap Report 2019",
             "url": "https://www.unep.org/resources/emissions-gap-report-2019"}],
        # UNEP Emissions Gap Report 2026, "The point of return": all cuts from 2025 levels (ES p. viii; full report section 4.3,
        # p. 31). These are the paths still open now; the IPCC AR6 paths from 2019 below are shown as missed (grey).
        "ghg_pledges": {"base": 2025, "points": [[2030, -5, -8], [2035, -11, -15], [2040, -20, -27]], "src": "UNEP Emissions Gap Report 2026", "note": "full delivery of all national pledges (NDCs), cut from 2025 levels", "url": "https://wedocs.unep.org/handle/20.500.11822/50038"},
        # points: [year, median %, range low %, range high %]; from_2019: the same cuts relative to 2019 (report footnote 4, p. 31)
        "unep_return": {"base": 2025, "points": [[2030, -18, -15, -36], [2035, -45, -30, -60], [2040, -69, -60, -76]], "from_2019": [[2030, -14], [2035, -42], [2040, -67]],
                        "src": "UNEP Emissions Gap Report 2026", "label": "lowest possible 1.5 °C overshoot", "note": "peak warming about 1.7–1.8 °C around mid-century; about an even chance of being back at or below 1.5 °C by 2100; needs roughly 320 billion metric tons of CO₂ removed from the air this century", "url": "https://wedocs.unep.org/handle/20.500.11822/50038"},
        "unep_2c": {"base": 2025, "points": [[2030, -11, 0, -23], [2035, -24, -9, -51], [2040, -37, -26, -73]], "from_2019": [[2030, -5], [2035, -19], [2040, -33]],
                    "src": "UNEP Emissions Gap Report 2026", "label": "below 2 °C (at least two in three)", "note": "peak warming about 1.9 °C with a two-in-three chance", "url": "https://wedocs.unep.org/handle/20.500.11822/50038"},
        # IPCC AR6 Synthesis Report, Table SPM.1: GHG emission reductions from 2019 (%), median [5th-95th percentile].
        # Shown as missed paths since UNEP's 2026 report: they assumed cuts from about 2020 that did not happen.
        "ipcc_ghg_paths": {"base": 2019, "years": [2030, 2035, 2040, 2050],
            "1.5": {"label": "1.5 °C (>50% chance, no or limited overshoot)", "mid": [43, 60, 69, 84], "lo": [34, 49, 58, 73], "hi": [60, 77, 90, 98]},
            "2": {"label": "2 °C (>67% chance)", "mid": [21, 35, 46, 64], "lo": [1, 22, 34, 53], "hi": [42, 55, 63, 77]},
            "source": "IPCC AR6 Synthesis Report (2023), Summary for Policymakers, Table SPM.1",
            "url": "https://www.ipcc.ch/report/ar6/syr/summary-for-policymakers/"},
        "unep": {"current_policies": 2.8, "ndcs": [2.6, 2.7], "ndcs_netzero": 2.1, "published": "2026-10-21", "source": "UNEP Emissions Gap Report 2026", "url": "https://wedocs.unep.org/handle/20.500.11822/50038"},
    }
    json.dump(outlook, open("data/models_outlook.json", "w"), ensure_ascii=False, indent=1)
    print("wrote data/models_old.json, data/models_cmip6.csv (", len(models), "models ), data/models_outlook.json")


if __name__ == "__main__":
    import sys
    if "--hansen-temp" in sys.argv:      # weekly: only Hansen's monthly temperature table
        hansen_temp()
    else:
        main()
        try:
            hansen_temp()
        except Exception as e:
            print("Hansen temperature table not updated:", e)
