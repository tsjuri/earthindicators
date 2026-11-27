# Earth Indicators

Live climate indicators in plain words, at **[earthindicators.org](https://earthindicators.org)**.

Each page shows one of Earth's vital signs, updated automatically from the agencies that measure it:

| Page | Data |
|---|---|
| Global air temperature | Copernicus ERA5 |
| Sea surface temperature | NOAA OISST |
| Coral reef heat stress, on the sea surface page | NOAA Coral Reef Watch |
| El Niño (Niño 3.4) | NOAA OISST |
| Hurricane season energy (ACE), on the El Niño page | NOAA NCEI IBTrACS |
| Pacific Decadal Oscillation | NOAA NCEI |
| Solar cycle (sunspots) | WDC-SILSO, Royal Observatory of Belgium |
| Ocean heat content | NOAA NCEI |
| Sea level | NASA |
| Sea ice extent | NSIDC Sea Ice Index |
| Land ice (Greenland, Antarctica) | NASA JPL GRACE/GRACE-FO |
| Glaciers | WGMS via Copernicus Climate Data Store |
| Sea ice volume | Copernicus Marine (Mercator GLORYS12; CryoSat-2 + SMOS) |
| Northern Hemisphere snow cover, on the sea ice page | NOAA snow cover record (Rutgers Global Snow Lab) |
| Wildfires (CO₂ from fires) | Copernicus / JRC Global Wildfire Information System |
| CO₂ (Mauna Loa) | NOAA Global Monitoring Laboratory |
| Methane | NOAA Global Monitoring Laboratory |
| Earth's energy imbalance | NASA CERES |
| Water cycle (water vapor in the air) | Copernicus ERA5 |
| World temperature, four more records (air page) | NASA GISTEMP, NOAAGlobalTemp, HadCRUT5, Berkeley Earth |
| Land and ocean carbon sinks, on the slow signals page | Global Carbon Budget |

**[Common claims, answered](https://earthindicators.org/claims.html)**: short answers to the claims people run into most, using live numbers from the data pages. Every answer has its own link.

## How it works

- Plain HTML, CSS and JavaScript. No build step; GitHub Pages serves the files as they are.
- GitHub Actions workflows (`.github/workflows/`) download fresh data from each agency on a schedule and commit it to `data/`.
- `indicators.js` calculates every live number shown outside the charts, so the front page, the claims page and the "In short" boxes always agree.

## Translations

Pages are written in English. `i18n.js` swaps the text for another language in the browser, using a dictionary per language (`i18n/nl.js`): every paragraph, heading, button, chart label and tooltip is looked up whole, with numbers, dates and month names as placeholders, so a translation keeps working when the numbers change. Numbers get the local decimal comma. Anything without a translation stays English; open a page with `?lang=nl&i18n=missing` and check `EI_MISSING` in the browser console for what is still missing. The language is chosen with the button in the header or `?lang=nl` in a link. Dutch covers every page; the preview images for social media stay English.

## Where the numbers come from

**[How the numbers are made](https://earthindicators.org/methods.html)** gives, for every chart, the exact dataset and version (with DOI), the files downloaded, the processing steps, the code and the checks.

The files in `data/` are of two kinds:

- **Agency files, unchanged**: CO₂ and methane (NOAA GML), ocean heat content (`h22-*.dat`, NOAA NCEI), sea level (NASA-SSH, NOAA LSA), sea ice extent (NSIDC Sea Ice Index v4), PDO (NOAA NCEI), sunspot numbers (WDC-SILSO), Greenland and Antarctica ice mass (`grace_*.txt`, NASA JPL). Derived numbers (trends, running means, growth rates) are calculated in the browser by each page's own script.
- **Series calculated here** from gridded agency data:
  - `scripts/build_nino34.py`: El Niño and sea surface temperature, area-weighted averages of NOAA OISST v2.1 (`*_daily_sst.csv`, `oisst2.1_*_sst_day.json`).
  - `scripts/build_era5.py` and `build_era5_regions.py`: air temperature from Copernicus ERA5 (`era5_*`). In `era5_t2_global_daily.csv` the `source` column marks each day as Copernicus's published value (`c3s`, final, or `c3s-prelim`, from Copernicus's live series, about 2 days behind real time) or calculated here (`cds`, only if the live series can't be read).
  - `scripts/build_glaciers.py`: world glacier mass change per year (`glaciers_global.csv`), added up from the WGMS/Copernicus grid.
  - `scripts/build_seaice_volume.py`: sea ice volume for both poles from Copernicus Marine thickness and concentration grids, model (`seaice_volume_glorys.csv`) and satellite (`seaice_volume_cs2smos.csv`).
  - `scripts/build_ace.py`: hurricane season energy (ACE) for the North Atlantic and Northeast Pacific, added up from every 6-hourly storm position in NOAA IBTrACS (`ace_daily.csv`, one row per storm per day).
  - `scripts/build_era5_tcwv.py`: global water vapor in the air (total column water vapor), monthly since 1940, from Copernicus ERA5 monthly averages (`era5_tcwv_monthly.csv`).
  - `scripts/build_snow.py`: Northern Hemisphere snow-covered land per week from NOAA's snow cover record (`snow_nh_weekly.csv`); identical to Rutgers' published tables.
  - `scripts/build_coral.py`: daily count of coral reef regions at each bleaching alert level, from NOAA Coral Reef Watch's ~210 virtual stations (`coral_alert_daily.csv`, `coral_baa.csv`).
  - `scripts/build_fires.py`: weekly CO₂ from fires per region from the GWIS API (`fires_weekly.csv`; GWIS's values, saved as published).
  - `scripts/build_temp_records.py`: four monthly world temperature records as published (`temp_records_monthly.csv`).
  - `scripts/build_ceres.py`: NASA CERES EBAF-TOA Ed4.2.1 global monthly means (`ceres_ebaf_global.csv`), taken from the file's own global-mean variables.

Calculated series are checked against independently published ones; the results are saved as `data/nino34_check.txt`, `data/era5_seam_check.txt` and `data/era5_overlap_check.txt` and shown on the methods page.
