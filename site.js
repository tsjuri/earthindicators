// Shared script for every tracker page: navigation, export button placement, back-to-top button, chart legends,
// small-screen axis labels and JPG export. Load it right after <nav class="nav" id="nav">.
// To add a page: add one line to PAGES. Nothing else needs to change.
(function () {
  // ---- fresh data: every page draws its charts from files in data/, which the browser would otherwise keep for up to
  //      10 minutes (GitHub Pages' cache time) after an update. 'no-cache' makes it ask the server each time; an
  //      unchanged file is answered with a short "not modified", so this costs almost nothing.
  if (window.fetch && !window.fetch.eiFresh) {
    const f0 = window.fetch.bind(window);
    window.fetch = function (u, o) {
      const url = typeof u === 'string' ? u : (u && u.url) || '';
      if (/^(\.?\/)?data\//.test(url) || url.indexOf(location.origin + '/data/') === 0) o = Object.assign({ cache: 'no-cache' }, o);
      return f0(u, o);
    };
    window.fetch.eiFresh = true;
  }
  // ---- prior-year bands (range of prior years, middle 80%): the key above a chart turns each band on and off, like
  //      the legend does for lines. The choice is kept on the chart's box, so it survives a redraw (region switches).
  //      Key 3 is "Every year": each prior year as its own thin line, off until the reader turns it on.
  const boxOn = (b, k) => !b ? k != 3 : k == 3 ? b.dataset.band3 === 'on' : b.dataset['band' + k] !== 'off';
  window.bandOn = (ch, k) => boxOn(ch && ch.canvas && ch.canvas.closest('.box'), k);
  //      "Range of prior years" and "Every year" show the same thing two ways, so turning one on turns the other off.
  //      The middle 80% can stay on with "Every year", but is then drawn faint, behind the lines (bandColor).
  const setBand = (box, k, on) => {
    box.dataset['band' + k] = on ? 'on' : 'off';
    const b = box.querySelector('.bandkey [data-band="' + k + '"]');
    if (b) { b.classList.toggle('off', !on); b.setAttribute('aria-pressed', on); }
  };
  document.addEventListener('click', e => {
    const t = e.target.closest('.bandkey [data-band]'); if (!t) return;
    const box = t.closest('.box'), k = t.dataset.band, on = !boxOn(box, k);
    setBand(box, k, on);
    if (on && k == 3) setBand(box, 1, false);
    if (on && k == 1) setBand(box, 3, false);
    const cv = box.querySelector('canvas'), ch = cv && window.Chart && Chart.getChart(cv); if (ch) ch.update();
  });
  // fill color of band k (1 = range, 2 = middle 80%) for this chart: the middle 80% fades while "Every year" is on
  window.bandColor = (ch, k) => {
    const c = k == 1 ? THEME.band1 : THEME.band2;
    if (k != 2 || !bandOn(ch, 3)) return c;
    const n = parseInt(c.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + (THEME.dark ? .5 : .4) + ')';
  };
  // every year as a line, colored from blue (oldest) through purple to orange (newest), under the highlighted years
  // and the current year. Pointing at a line (tapping on a phone) makes it stand out and names its year.
  // Pages add it to a band chart's plugins: yearLines([1982, 1983, ...], [values of 1982, values of 1983, ...]).
  const yearColor = (f, a) => 'hsla(' + (210 + 190 * f) % 360 + ',' + (THEME.dark ? 70 : 60) + '%,' + (THEME.dark ? 66 : 48) + '%,' + a + ')';
  window.yearColor = yearColor;
  window.yearLines = (years, rows, fmt) => ({ id: 'yearLines',
    // the pointed-at year is named at the bottom of the chart's own tooltip
    beforeInit(ch) { ch.$years = { years, rows };   // for the CSV download
      const t = ((ch.config.options.plugins ??= {}).tooltip ??= {}), cb = (t.callbacks ??= {}), f0 = cb.footer;
      cb.footer = items => { const h = bandOn(ch, 3) && ch.$yl; if (!h) return f0 ? f0(items) : '';
        const v = rows[h.k][h.i]; return 'Highlighted line: ' + years[h.k] + ', ' + (fmt ? fmt(v) : (v >= 0 ? '+' : '') + v.toFixed(2) + ' °C'); }; },
    beforeEvent(ch, { event: e }) {
      if (!bandOn(ch, 3)) { ch.$yl = null; return; }
      const was = ch.$yl;
      if (e.type === 'mouseout') ch.$yl = null;
      else if (e.x != null) {
        const { x, y } = ch.scales, i = Math.round(x.getValueForPixel(e.x));
        let best = null, d = 8;   // within 8 px of a line
        rows.forEach((r, k) => { const v = r[i]; if (v == null) return; const dd = Math.abs(y.getPixelForValue(v) - e.y); if (dd < d) { d = dd; best = { k, i } } });
        ch.$yl = best;
      }
      if (JSON.stringify(was) !== JSON.stringify(ch.$yl)) ch.$ylDirty = true;
    },
    afterEvent(ch, args) { if (ch.$ylDirty) { ch.$ylDirty = false; args.changed = true; } },
    // with "Every year" on, the range band (and the hidden lines that set the axis) is off: keep every year's line on
    // the chart by stretching the vertical axis to them, within the part of the x axis in view (zoom)
    afterDataLimits(ch, { scale }) {
      if (scale.axis !== 'y' || !bandOn(ch, 3)) return;
      const x = ch.scales.x, i0 = x && isFinite(x.min) ? Math.max(0, Math.floor(x.min)) : 0, i1 = x && isFinite(x.max) ? Math.ceil(x.max) : Infinity;
      let lo = Infinity, hi = -Infinity;
      rows.forEach(r => { for (let i = i0; i < r.length && i <= i1; i++) { const v = r[i]; if (v != null && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } } });
      if (lo > hi) return;
      const o = ch.options.scales.y || {};
      if (o.min == null) scale.min = Math.min(scale.min, lo);
      if (o.max == null) scale.max = Math.max(scale.max, hi);
    },
    beforeDatasetsDraw(ch) {
      if (!bandOn(ch, 3)) return;
      const { ctx, scales: { x, y }, chartArea: A } = ch, n = years.length, h = ch.$yl;
      ctx.save(); ctx.beginPath(); ctx.rect(A.left, A.top, A.right - A.left, A.bottom - A.top); ctx.clip();
      const line = (r, c, w) => { ctx.beginPath(); let on = false;
        r.forEach((v, i) => { if (v == null) { on = false; return; } const px = x.getPixelForValue(i), py = y.getPixelForValue(v); on ? ctx.lineTo(px, py) : ctx.moveTo(px, py); on = true; });
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); };
      rows.forEach((r, k) => { if (!h || h.k !== k) line(r, yearColor(n > 1 ? k / (n - 1) : 1, h ? .25 : THEME.dark ? .75 : .6), 1); });
      if (h) line(rows[h.k], THEME.ink, 2);
      ctx.restore();
    } });
  // the "Every year" switch is added to every band key (the band keys themselves are written in each page)
  const addYearKey = () => document.querySelectorAll('.bandkey').forEach(k => {
    if (k.querySelector('[data-band="3"]')) return;
    k.insertAdjacentHTML('beforeend', ' &nbsp; <button type="button" class="bk off" data-band="3" aria-pressed="false" title="Show every prior year as its own line">' +
      '<span style="display:inline-block;width:22px;height:10px;background:linear-gradient(90deg,' + yearColor(0, 1) + ',' + yearColor(.5, 1) + ',' + yearColor(1, 1) + ')"></span> Every year (older → newer)</button>');
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addYearKey); else Promise.resolve().then(addYearKey);   // after THEME (below) exists
  // ---- embedded chart (another site shows one chart in an iframe): <page>?embed=<canvas id>[&theme=light|dark]
  //      shows only that chart, with a link back here; no menus, footer or other sections. Built by the "Embed" button.
  const QS = new URLSearchParams(location.search), EMBED = QS.get('embed');
  if (EMBED) document.documentElement.classList.add('embed');
  // ---- theme: 'light', 'dark', or automatic (follows the device). The choice is stored in this browser only.
  //      An embedded chart uses the theme in its link (default: automatic), whatever was chosen on this site.
  const THEMES = ['auto', 'light', 'dark'];
  const stored = EMBED ? (['light', 'dark'].includes(QS.get('theme')) ? QS.get('theme') : 'auto')
    : (() => { try { return localStorage.getItem('ei-theme') || 'auto'; } catch (e) { return 'auto'; } })();
  const dark = stored === 'dark' || (stored === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  if (stored !== 'auto') document.documentElement.dataset.theme = stored; else delete document.documentElement.dataset.theme;
  // A reader who picks light gets light: "only light" is the standard opt-out from a browser's own forced dark mode
  // (Brave's night mode, Chrome's "auto dark mode for web contents"), which otherwise repaints the page dark anyway.
  if (stored === 'light') {
    document.documentElement.style.colorScheme = 'only light';
    const m = document.querySelector('meta[name="color-scheme"]'); if (m) m.content = 'only light';
  }
  // colors for charts; pages read window.THEME, so grids, bands and dark lines stay visible in both themes
  window.THEME = dark
    ? { dark, ink: '#e9e4d8', mut: '#a8a090', axis: '#a8a090', grid: 'rgba(255,255,255,.14)', band1: '#26313e', band2: '#3b4f66', clim: '#cfc8b8', fill0: 'rgba(40,30,25,.6)',
        deep1: '#ff8a80', deep2: '#7fb3e8', bar: '#6f8fb3', trend: '#9cc2ec', card: '#1d1a15', zero: 'rgba(255,255,255,.55)', thin: '#4f6580' }
    : { dark, ink: '#1c1c1c', mut: '#555', axis: '#737373', grid: 'rgba(120,120,120,.32)', band1: '#dce6f0', band2: '#a9c0d8', clim: '#333', fill0: 'rgba(255,245,240,.6)',
        deep1: '#7a0000', deep2: '#0f3f6b', bar: '#8fa9c4', trend: '#1f3f66', card: '#fff', zero: 'rgba(0,0,0,.6)', thin: '#b8c7d9' };
  const themeLabel = { auto: 'Theme: automatic (follows your device)', light: 'Theme: light', dark: 'Theme: dark' };
  const themeIcon = t => t === 'light'
    ? '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    : t === 'dark'
    ? '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>';

  const GH = 'https://github.com/tsjuri/earthindicators';
  const PAGES = [
    ['index.html',     'Overview'],
    ['claims.html',    'Common claims', 'nb-claims'],   // third field: extra class for a nav button that stands out
    ['air.html',       'Air temp'],
    ['nino.html',      'El Niño'],
    ['pdo.html',       'PDO'],
    ['sun.html',       'The Sun'],
    ['sst.html',       'Sea surface temp'],
    ['ohc.html',       'Ocean heat'],
    ['sea-level.html', 'Sea level'],
    ['sea-ice.html',   'Sea ice & snow'],
    ['land-ice.html',  'Land ice'],
    ['co2.html',       'CO₂'],
    ['ch4.html',       'Methane'],
    ['ghg.html',       'Other gases'],
    ['eei.html',       'Energy imbalance'],
    ['water.html',     'Water cycle'],
    ['corals.html',    'Coral reefs'],
    ['wildfires.html', 'Wildfires'],
    ['slow.html',      'Slow signals'],
    ['boundaries.html','Planetary boundaries'],
    ['models.html',    'Climate models'],
  ];

  // Indicators dropdown: one column per group (same story as the overview page), side by side on computers.
  // A page in PAGES that is missing here gets an "Other" column, so a new page never disappears from the menu.
  const MENU_GROUPS = [
    ['Getting Hotter',  ['air.html', 'sst.html', 'ohc.html']],
    ['The Cause',       ['co2.html', 'ch4.html', 'ghg.html', 'eei.html']],
    ['What It Is Doing',['sea-level.html', 'sea-ice.html', 'land-ice.html', 'water.html', 'wildfires.html', 'corals.html']],
    ['Natural Swings',  ['nino.html', 'pdo.html', 'sun.html']],
    ['Yearly Data',     ['slow.html', 'boundaries.html']],
    ['Models',          ['models.html']],
  ];
  { const listed = MENU_GROUPS.flatMap(g => g[1]);
    const rest = PAGES.map(p => p[0]).filter(f => !['index.html', 'claims.html'].includes(f) && !listed.includes(f));
    if (rest.length) MENU_GROUPS.push(['Other', rest]); }

  // ---- site header: logo, name and tagline, with the menu next to it (a hamburger menu on narrow screens).
  //      A slim copy (.mini) slides in at the top when the reader scrolls back up, and hides again when scrolling down.
  const here = location.pathname.split('/').pop() || 'index.html';
  const main = document.querySelector('main');
  const nav = document.getElementById('nav');            // old button row: now only a holder for the export button
  if (main && !EMBED && !document.querySelector('.site-head')) {
    const link = ([href, label], cls) => '<a href="' + href + '"' + (cls ? ' class="' + cls + '"' : '') +
      (href === here ? ' aria-current="page"' : '') + '>' + label + '</a>';
    const ind = PAGES.filter(p => !['index.html', 'claims.html'].includes(p[0]));
    const onInd = ind.some(p => p[0] === here);
    const claimIcon = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 5.6c.2-.7.8-1 1.4-.9.7.1 1.1.6 1 1.2-.1.7-1.2.8-1.3 1.6M8.1 8.8v.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    const headHTML = (cls, menuId) =>
      '<header class="site-head' + cls + '">' +
      '<a class="brand" href="index.html" aria-label="Earth Indicators, overview"><img src="img/logo.svg" alt="" width="56" height="52">' +
      '<span><span class="wm">Earth Indicators</span><span class="tag">Earth’s vital signs, measured</span></span></a>' +
      '<button class="burger" type="button" aria-expanded="false" aria-controls="' + menuId + '" aria-label="Menu">' +
      '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
      '<nav class="menu" id="' + menuId + '" aria-label="Site">' +
      link(PAGES[0]) +
      '<div class="dd"><button class="dd-btn' + (onInd ? ' on' : '') + '" type="button" aria-expanded="false">Indicators' +
      '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<div class="dd-list"><span class="dd-label">Indicators</span>' + MENU_GROUPS.map(([h, hrefs]) =>
        '<div class="dd-col"><span class="dd-h">' + h + '</span>' + hrefs.map(f => link(PAGES.find(p => p[0] === f))).join('') + '</div>').join('') +
      '</div></div>' +
      link([PAGES[1][0], claimIcon + PAGES[1][1]], 'm-claims') +
      '</nav><button class="search-btn" type="button" title="Search the site (/)" aria-label="Search the site">' +
      '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m12.8 12.8 4.4 4.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>' +
      '<button class="theme-btn" type="button" title="' + themeLabel[stored] + '" aria-label="' + themeLabel[stored] + '">' + themeIcon(stored) + '</button></header>';
    // dropdown and hamburger behavior, for either header
    const wire = head => {
      const burger = head.querySelector('.burger'), dd = head.querySelector('.dd'), ddBtn = head.querySelector('.dd-btn');
      const setDd = open => { dd.classList.toggle('open', open); ddBtn.setAttribute('aria-expanded', open); };
      const setMenu = open => { head.classList.toggle('open', open); burger.setAttribute('aria-expanded', open); };
      ddBtn.addEventListener('click', e => { e.stopPropagation(); setDd(!dd.classList.contains('open')); });
      burger.addEventListener('click', () => setMenu(!head.classList.contains('open')));
      document.addEventListener('click', e => { if (!dd.contains(e.target)) setDd(false); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') { setDd(false); setMenu(false); } });
      return { close: () => { setDd(false); setMenu(false); } };
    };
    main.insertAdjacentHTML('afterbegin', headHTML('', 'menu'));
    // theme button: auto -> light -> dark -> auto. Reloads the page so the charts are redrawn in the new colors.
    document.addEventListener('click', e => {
      const b = e.target.closest('.theme-btn'); if (!b) return;
      const next = THEMES[(THEMES.indexOf(stored) + 1) % THEMES.length];
      try { if (next === 'auto') localStorage.removeItem('ei-theme'); else localStorage.setItem('ei-theme', next); } catch (err) {}
      location.reload();
    });
    const head = main.querySelector('.site-head');
    wire(head);

    // ---- site search (magnifying glass, or the / key). The index, search.json, is built by scripts/build_search.py
    //      from the pages: each page, each chart section and each answer on the claims page. It is only downloaded
    //      the first time someone opens the search. Every word typed must appear; matches in titles rank first.
    let sx = null, sData = null, sAct = 0;
    const norm = t => (t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();   // ₂ → 2, ñ → n
    const esc = t => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const openSearch = () => {
      if (!sx) {
        document.body.insertAdjacentHTML('beforeend', '<div class="srch" hidden><div class="srch-box" role="dialog" aria-modal="true" aria-label="Search the site">' +
          '<div class="srch-in"><input type="search" placeholder="Search the site, e.g. glacier, El Niño, 1998" aria-label="Search the site" autocomplete="off" spellcheck="false">' +
          '<button type="button" class="srch-x" aria-label="Close search">×</button></div><ol class="srch-res"></ol><p class="srch-msg"></p></div></div>');
        sx = document.body.lastElementChild;
        const inp = sx.querySelector('input'), res = sx.querySelector('.srch-res');
        const close = () => { sx.hidden = true; document.documentElement.classList.remove('srch-on'); };
        sx.addEventListener('click', e => { if (e.target === sx || e.target.closest('.srch-x') || e.target.closest('.srch-res a')) close(); });
        inp.addEventListener('input', () => runSearch(inp.value));
        inp.addEventListener('keydown', e => {
          const items = res.querySelectorAll('a');
          if (e.key === 'Escape') { close(); return; }
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
            e.preventDefault(); sAct = (sAct + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; markAct(true);
          }
          if (e.key === 'Enter' && items[sAct]) { e.preventDefault(); close(); location.href = items[sAct].href; }
        });
        fetch('search.json').then(r => r.json()).then(d => {
          sData = d.map(e => ({ ...e, nt: norm(e.t), na: norm(e.a), nx: norm(e.x), np: norm(e.p) }));
          runSearch(inp.value);
        }).catch(() => { sx.querySelector('.srch-msg').textContent = 'The search could not be loaded. Try again later.'; });
      }
      sx.hidden = false; document.documentElement.classList.add('srch-on');
      const inp = sx.querySelector('input'); inp.focus(); inp.select();
    };
    const markAct = scroll => sx.querySelectorAll('.srch-res a').forEach((a, i) => {
      a.classList.toggle('act', i === sAct); a.setAttribute('aria-selected', String(i === sAct));
      if (i === sAct && scroll) a.scrollIntoView({ block: 'nearest' });
    });
    function runSearch(q) {
      const res = sx.querySelector('.srch-res'), msg = sx.querySelector('.srch-msg');
      const words = norm(q).split(/[^a-z0-9.%°-]+/).map(w => w.replace(/^[.-]+|[.-]+$/g, ''))
        .map(w => w.replace(/vapour/, 'vapor').replace(/colour/, 'color').replace(/(metre|litre|centre)/, m => m.slice(0, -2) + 'er')
          .replace(/tonne/, 'ton').replace(/^grey/, 'gray').replace(/sulph/, 'sulf').replace(/(model|label)led/, '$1ed'))   // British spellings
        .filter(w => w.length > 1 || /\d/.test(w));
      sAct = 0;
      if (!words.length) { res.replaceChildren(); msg.textContent = sData ? 'Charts, sections and answers to common claims, on every page.' : 'Loading…'; return; }
      if (!sData) { msg.textContent = 'Loading…'; return; }
      const hits = [];
      sData.forEach((e, i) => {
        let sc = 0;
        for (const w of words) {
          const inT = e.nt.includes(w), inA = e.na.includes(w), inP = e.np.includes(w), inX = e.nx.includes(w);
          if (!inT && !inA && !inP && !inX) return;
          sc += (inT ? 6 : 0) + (inP ? 4 : 0) + (inA ? 3 : 0) + (inX ? 1 : 0) + (new RegExp('(^|[^a-z0-9])' + w.replace(/[.%°-]/g, '\\$&')).test(e.nt) ? 2 : 0);
        }
        hits.push([sc + (e.u.includes('#') ? 0 : 1), i, e]);
      });
      hits.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      // highlight: find the words in an accent-free copy of the text, then mark the same stretch of the original,
      // so "nino" marks "Niño" and "co2" marks "CO₂"
      const hl = t => {
        let n = ''; const at = [];
        for (let i = 0; i < t.length; i++) for (const c of norm(t[i])) { n += c; at.push(i); }
        const rs = [];
        for (const w of words) for (let k = n.indexOf(w); k >= 0; k = n.indexOf(w, k + w.length)) rs.push([at[k], at[k + w.length - 1] + 1]);
        rs.sort((a, b) => a[0] - b[0]);
        let out = '', pos = 0;
        for (const [a, b] of rs) { if (b <= pos) continue; const s0 = Math.max(a, pos);
          out += esc(t.slice(pos, s0)) + '<mark>' + esc(t.slice(s0, b)) + '</mark>'; pos = b; }
        return out + esc(t.slice(pos));
      };
      // snippet: a bit of the text around the first word found (the text is matched without accents, so search that)
      const snip = e => {
        let at = -1; for (const w of words) { const k = e.nx.indexOf(w); if (k >= 0 && (at < 0 || k < at)) at = k; }
        if (at < 0) return e.x.slice(0, 150) + (e.x.length > 150 ? '…' : '');
        const a = Math.max(0, at - 50), b = Math.min(e.x.length, at + 110);
        return (a ? '…' : '') + e.x.slice(a, b) + (b < e.x.length ? '…' : '');
      };
      res.replaceChildren(...hits.slice(0, 20).map(([, , e]) => {
        const li = document.createElement('li');
        li.innerHTML = '<a href="' + esc(e.u) + '" role="option"><b>' + hl(e.t) + '</b><span class="srch-p">' + esc(e.p) +
          (e.u.includes('#') ? '' : ' · page') + '</span>' + (e.x ? '<span class="srch-s">' + hl(snip(e)) + '</span>' : '') + '</a>';
        return li;
      }));
      msg.textContent = hits.length ? (hits.length > 20 ? 'First 20 of ' + hits.length + ' results' : '') : 'Nothing found. Try another word, or fewer words.';
      markAct(false);
    }
    document.addEventListener('click', e => { if (e.target.closest('.search-btn')) { e.preventDefault(); openSearch(); } });
    document.addEventListener('keydown', e => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || (sx && !sx.hidden)) return;
      const t = e.target; if (t.closest('input,textarea,select,[contenteditable="true"]')) return;
      e.preventDefault(); openSearch();
    });

    // slim header: shown when scrolling up (past the real header), hidden when scrolling down or back at the top
    document.body.insertAdjacentHTML('beforeend', '<div class="mini-wrap" aria-hidden="true">' + headHTML(' mini', 'menu-mini') + '</div>');
    const wrap = document.body.lastElementChild, mini = wrap.querySelector('.site-head'), miniCtl = wire(mini);
    wrap.inert = true;                                     // not reachable with Tab while hidden
    let lastY = window.scrollY, ticking = false;
    const setMini = on => { if (wrap.classList.contains('show') === on) return;
      wrap.classList.toggle('show', on); wrap.inert = !on; wrap.setAttribute('aria-hidden', !on); if (!on) miniCtl.close(); };
    window.addEventListener('scroll', () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY, past = head.getBoundingClientRect().bottom < 0;
        if (mini.classList.contains('open')) { lastY = y; ticking = false; return; }   // its menu is open: stay until it is closed
        if (!past) setMini(false);
        else if (y < lastY - 6) setMini(true);            // scrolling up
        else if (y > lastY + 6) setMini(false);           // scrolling down
        if (Math.abs(y - lastY) > 6) lastY = y;
        ticking = false;
      });
    }, { passive: true });
  }

  // ---- visitor statistics: GoatCounter (no cookies, no personal data; dashboard at earthindicators.goatcounter.com).
  //      It ignores visits from localhost, so testing on your own computer is not counted.
  const gcReady = new Promise(ok => {
    const s = document.createElement('script');
    s.async = true; s.src = 'https://gc.zgo.at/count.js';
    s.dataset.goatcounter = 'https://earthindicators.goatcounter.com/count';
    if (EMBED) s.dataset.goatcounterSettings = '{"no_onload":true}';   // an embed is counted below, not as a page view
    s.onload = ok; document.head.appendChild(s);
  });
  // events on the claims page: which answers are opened, copied, and reached through a shared link
  const gcEvent = (path, title) => gcReady.then(() => window.goatcounter && window.goatcounter.count &&
    window.goatcounter.count({ path, title, event: true }));
  if (EMBED) gcEvent('embed/' + here.replace('.html', '') + '-' + EMBED, document.referrer ? new URL(document.referrer).hostname : 'embed');
  if (here === 'claims.html') {
    const title = id => { const h = document.querySelector('#' + CSS.escape(id) + ' summary'); return h ? h.textContent.trim() : id; };
    const hookClaims = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      if (h && document.getElementById(h)) gcEvent('claim-link/' + h, title(h));          // arrived through a shared link
      document.querySelectorAll('details.claim').forEach(d => {
        d.addEventListener('toggle', () => { if (d.open) gcEvent('claim-open/' + d.id, title(d.id)); });
        const b = d.querySelector('.cp'); if (b) b.addEventListener('click', () => gcEvent('claim-copy/' + d.id, title(d.id)));
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookClaims); else hookClaims();
  }

  const START = 2026, now = new Date().getFullYear(), years = now > START ? START + '–' + now : String(START);   // 2026, then 2026–2027, …
  // ---- stretch the tagline's letter-spacing so it is exactly as wide as the site name (depends on fonts and screen size)
  const fitTag = () => {
    const wm = document.querySelector('.site-head .wm'), tag = document.querySelector('.site-head .tag');
    if (!wm || !tag) return;
    tag.style.letterSpacing = '0'; tag.style.marginRight = '0'; tag.style.fontSize = '';
    const w = wm.getBoundingClientRect().width, t = tag.getBoundingClientRect().width, n = tag.textContent.length;
    if (t > w) {   // the tagline is the wider one (phones): make its letters a little smaller, never squeeze them together
      tag.style.fontSize = (parseFloat(getComputedStyle(tag).fontSize) * w / t * 0.995) + 'px'; return;
    }
    if (n > 1) { const ls = (w - t) / (n - 1); tag.style.letterSpacing = ls + 'px'; tag.style.marginRight = -ls + 'px'; }   // widen it to the name's width
  };
  fitTag();
  if (document.fonts) document.fonts.ready.then(fitTag);
  window.addEventListener('resize', fitTag);

  // ---- footer (added once the whole page has loaded: this script runs near the top of <main>, before the content exists)
  // footer menu: every page, so readers who reach the bottom can go straight on to the next one
  const footNav = () => {
    const a = ([href, label]) => '<a href="' + href + '"' + (href === here ? ' aria-current="page"' : '') + '>' + label + '</a>';
    const ind = PAGES.filter(p => !['index.html', 'claims.html'].includes(p[0]));
    return '<nav class="foot-nav" aria-label="Site, footer">' +
      '<div><h2>Earth Indicators</h2>' + a(PAGES[0]) + a(PAGES[1]) + a(['methods.html', 'How the numbers are made']) +
      '<a href="' + GH + '">Source code on GitHub</a></div>' +
      '<div class="ind"><h2>Indicators</h2>' + ind.map(a).join('') + '</div></nav>';
  };
  const addFoot = () => { if (main && !EMBED && !document.querySelector('.site-foot')) main.insertAdjacentHTML('beforeend', '<footer class="site-foot">' + footNav() + '<p>© ' + years + ' Earth Indicators. Text and charts are licensed under ' +
      '<a href="https://creativecommons.org/licenses/by/4.0/" rel="license">CC BY 4.0</a>: share and adapt them freely, with credit to Earth Indicators and a link to this site. ' +
      'The logo and drawings are not included in that license. Drawings by Jolanda: a dying dandelion, for what is happening to our planet, and in the logo its seeds blowing in the wind, held in a heart, for life, love and care.</p>' +
      '<p>The data comes from NOAA, NASA, NSIDC and the Copernicus Climate Change Service and stays under their terms. <a href="methods.html">How the numbers are made</a> lists the exact datasets, processing steps and checks for every chart; all code is <a href="' + GH + '">public on GitHub</a>. <a href="https://earthindicators.goatcounter.com">Visitor statistics</a> are public, counted without cookies.</p></footer>'); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addFoot); else addFoot();

  // ---- export button: pages put #exp inside the nav; move it to its own row under the nav so it reads as an action, not a page link
  const exp = document.getElementById('exp');
  if (exp && nav && !EMBED) {
    const bar = document.createElement('div'); bar.className = 'tools';
    nav.after(bar); bar.appendChild(exp);
    exp.className = 'act';
    exp.innerHTML = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 1.5v8.5M4.5 6.5 8 10l3.5-3.5M2 11.5v2.5h12v-2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Export charts as JPG</span>';
    exp.title = 'Download all charts on this page as one image';
  }

  // ---- "Data and method" line on data pages: exact dataset, what this site does, links to the full method, code and data.
  //      Full details per indicator live in methods.html (anchor = page name without .html).
  const HOW = {
    'air.html': ['Copernicus ERA5 daily 2 m temperature (<a href="https://doi.org/10.24381/cds.4991cf48">doi:10.24381/cds.4991cf48</a>). Four more records, monthly: NASA GISTEMP v4, NOAA NOAAGlobalTemp v6.1, Met Office HadCRUT5 and Berkeley Earth.',
      'World history is Copernicus\'s published series; newer days and the regions are averaged here from the ERA5 grid with the same method, and checked against Copernicus. The other four records are shown on the same baseline as ERA5 (each record\'s own 1991–2020 monthly means, plus 0.88 °C).',
      ['scripts/build_era5.py', 'scripts/build_era5_regions.py', 'scripts/build_temp_records.py'], ['data/era5_t2_global_daily.csv', 'data/temp_records_monthly.csv']],
    'nino.html': ['NOAA OISST v2.1 daily sea surface temperature (<a href="https://doi.org/10.25921/RE9P-PT57">doi:10.25921/RE9P-PT57</a>). Hurricanes: NOAA NCEI IBTrACS v04r01 (<a href="https://doi.org/10.25921/82ty-9e16">doi:10.25921/82ty-9e16</a>).',
      'Averaged here over 5°S–5°N, 170°W–120°W (area-weighted) and checked against Climate Reanalyzer\'s independent series. Hurricane energy (ACE) is added up here from every 6-hourly storm position and checked against published season totals.',
      ['scripts/build_nino34.py', 'scripts/build_ace.py'], ['data/nino34_daily_sst.csv', 'data/ace_daily.csv']],
    'sst.html': ['NOAA OISST v2.1 daily sea surface temperature (<a href="https://doi.org/10.25921/RE9P-PT57">doi:10.25921/RE9P-PT57</a>). Marine heatwaves: calculated here from OISST (Hobday et al. 2016 definition).',
      'Averaged here over each region, area-weighted, with the same code as the El Niño page. Marine heatwaves: the share of the ocean in a heatwave is calculated here.',
      ['scripts/build_nino34.py', 'scripts/build_mhw.py'], ['data/world_daily_sst.csv', 'data/mhw_daily.csv']],
    'corals.html': ['Heat stress: NOAA Coral Reef Watch Daily 5km Regional Virtual Stations, version 3.1. Bleaching surveys: Global Coral Bleaching Database (van Woesik and Kratochwill 2022, <a href="https://doi.org/10.1038/s41597-022-01121-y">doi:10.1038/s41597-022-01121-y</a>). Global events: NOAA Coral Reef Watch, NOAA Climate.gov, GCRMN 2020. Great Barrier Reef: AIMS Annual Summary Report of Coral Reef Condition 2025/2026.',
      'Coral: the daily bleaching alert level of each reef region, as published; the shares of regions at each level are counted here. Surveys: the shares of each year\'s surveys with bleaching are counted here. Events and Great Barrier Reef: as published.',
      ['corals.html', 'scripts/build_coral.py', 'scripts/build_coral_obs.py'], ['data/coral_alert_daily.csv', 'data/coral_bleaching_obs.csv']],
    'ohc.html': ['NOAA NCEI Global Ocean Heat Content, 0–700 m and 0–2000 m.',
      'NOAA\'s values are shown unchanged; trends and heating rates are calculated by this page.', ['ohc.html'], 'data/h22-w0-2000m.dat'],
    'sea-level.html': ['NASA-SSH Global Mean Sea Level, version 1 (<a href="https://doi.org/10.5067/NSIND-GMSV1">doi:10.5067/NSIND-GMSV1</a>).',
      'NASA\'s values are shown with the average seasonal cycle removed; trends are calculated by this page.', ['sea-level.html'], 'data/NASA_SSH_GMSL_INDICATOR.txt'],
    'sea-ice.html': ['Extent: NSIDC Sea Ice Index, version 4 (<a href="https://doi.org/10.7265/a98x-0f50">doi:10.7265/a98x-0f50</a>). Second extent record for the standard-deviation chart: JAXA AMSR2 via NIPR ViSHOP (Japan). Volume: Copernicus Marine, Mercator GLORYS12 ocean reanalysis and CryoSat-2 + SMOS satellite thickness. Snow: NOAA Climate Data Record of Northern Hemisphere Snow Cover Extent (Rutgers Global Snow Lab, <a href="https://doi.org/10.7289/V5N014G9">doi:10.7289/V5N014G9</a>).',
      'NSIDC\'s daily extent, shown as a 5-day mean; anomalies and standard deviations are calculated by this page. Volume (thickness × concentration × area) is calculated here from the Copernicus grids. Snow-covered land area per week is added up here from NOAA\'s weekly snow maps (it matches Rutgers\' published tables).',
      ['sea-ice.html', 'scripts/build_seaice_volume.py', 'scripts/build_snow.py'], ['data/N_seaice_extent_daily_v4.0.csv', 'data/seaice_volume_glorys.csv', 'data/seaice_volume_cs2smos.csv', 'data/snow_nh_weekly.csv']],
    'co2.html': ['NOAA Global Monitoring Laboratory, Mauna Loa daily mean CO₂. History: Antarctic ice-core composite (Bereiter et al. 2015) and the CenCO2PIP 66-million-year reconstruction (2023).',
      'NOAA\'s daily values are shown unchanged; monthly means, trend and growth are calculated by this page. The history records are shown as published.', ['co2.html', 'scripts/build_co2_history.py'], ['data/co2_daily_mlo.txt', 'data/co2_icecore_bereiter2015.csv', 'data/co2_cenozoic_cenco2pip2023.csv']],
    'ch4.html': ['NOAA Global Monitoring Laboratory, globally averaged marine surface methane.',
      'NOAA\'s monthly means, trend and annual increases are shown unchanged.', ['ch4.html'], 'data/ch4_mm_gl.txt'],
    'ghg.html': ['NOAA Global Monitoring Laboratory: Annual Greenhouse Gas Index (warming effect of each gas) and the yearly global means behind it; globally averaged monthly nitrous oxide. HFC-23 after 2007: AGAGE (Prinn et al. 2018, <a href="https://doi.org/10.5194/essd-10-985-2018">doi:10.5194/essd-10-985-2018</a>).',
      'NOAA\'s values are shown unchanged; the shares, changes since 1990 and peaks are calculated by this page.', ['ghg.html', '.github/workflows/update-ghg.yml'], ['data/aggi_AGGI_Table.csv', 'data/aggi_NOAA_Annual_Mean_MoleFractions.csv', 'data/n2o_mm_gl.txt', 'data/n2o_gr_gl.txt']],
    'land-ice.html': ['Ice sheets: NASA JPL GRACE/GRACE-FO mascon time series, release 06.3 v4: Greenland (<a href="https://doi.org/10.5067/TEMSC-GT634">doi:10.5067/TEMSC-GT634</a>) and Antarctica (<a href="https://doi.org/10.5067/TEMSC-AT634">doi:10.5067/TEMSC-AT634</a>). Glaciers: WGMS gridded glacier mass change, Copernicus Climate Data Store (<a href="https://doi.org/10.24381/cds.ba597449">doi:10.24381/cds.ba597449</a>). Greenland ice core: Kobashi et al. 2011 (<a href="https://doi.org/10.1029/2011GL049444">doi:10.1029/2011GL049444</a>) and Alley 2000 (<a href="https://doi.org/10.1016/S0277-3791(99)00062-1">doi:10.1016/S0277-3791(99)00062-1</a>), via NOAA paleoclimatology; measured summit temperature: Copernicus ERA5.',
      'NASA\'s monthly mass values are shown relative to the first 12 months; trends, yearly changes and the sea-level equivalent (362 Gt = 1 mm) are calculated by this page; the world glacier total per year is added up from the grid by this site. The ice-core reconstructions are shown as published; the ERA5 summit series is shifted so its 2001–2010 average matches the ice-core value for that decade, and the 10-year comparisons are calculated by this page.', ['land-ice.html', 'scripts/build_glaciers.py', 'scripts/build_greenland_icecore.py'], ['data/grace_greenland.txt', 'data/grace_antarctica.txt', 'data/glaciers_global.csv', 'data/gisp2_kobashi2011.csv', 'data/gisp2_alley2000.csv', 'data/greenland_summit_era5.csv']],
    'pdo.html': ['NOAA NCEI Pacific Decadal Oscillation index, based on ERSST.',
      'NOAA\'s monthly values are shown unchanged; the 12-month and decade averages are calculated by this page.', ['pdo.html'], 'data/pdo_ncei.dat'],
    'sun.html': ['WDC-SILSO, Royal Observatory of Belgium, International Sunspot Number version 2 (<a href="https://doi.org/10.24414/qnza-ac80">doi:10.24414/qnza-ac80</a>).',
      'SILSO\'s monthly and 13-month smoothed values are shown unchanged; cycle minima and maxima and the yearly averages are calculated by this page.', ['sun.html'], ['data/SN_m_tot_V2.0.csv', 'data/SN_ms_tot_V2.0.csv']],
    'eei.html': ['NASA CERES EBAF-TOA Edition 4.2.1 (<a href="https://doi.org/10.5067/TERRA-AQUA-NOAA20/CERES/EBAF-TOA_L3B004.2.1">doi:10.5067/TERRA-AQUA-NOAA20/CERES/EBAF-TOA_L3B004.2.1</a>).',
      'NASA\'s own global monthly means; the imbalance is absorbed solar minus outgoing longwave radiation. Running means are calculated by this page. Cleaner air section: sulfur dioxide emissions from CEDS (Hoesly et al., Community Emissions Data System, <a href="https://doi.org/10.5281/zenodo.15059443">doi:10.5281/zenodo.15059443</a>), added up here for the world, China, India, the US, the EU and UK, and international shipping.', ['scripts/build_ceres.py', 'scripts/build_so2.py'], ['data/ceres_ebaf_global.csv', 'data/so2_ceds.csv']],
    'water.html': ['Copernicus Climate Change Service, ERA5 monthly averaged data on single levels (<a href="https://doi.org/10.24381/cds.f17050d7">doi:10.24381/cds.f17050d7</a>): total column water vapor and 2 m air temperature. Soil moisture: ERA5 hourly data (root-zone soil water and soil temperature) from Google\'s ARCO-ERA5 copy; NASA SMAP L4 (satellite check). Land water storage: NASA JPL GRACE/GRACE-FO mascons RL06.3. Rainfall: NASA GPM IMERG v07 daily.',
      'Global means (weighted by area) are calculated here from the ERA5 grids; normals, records, trends and the water-vapor-per-°C slope are calculated by this page. Soil moisture: drought and flash-drought shares are calculated here from the ERA5 grids (scripts/build_soil.py).', ['water.html', 'scripts/build_soil.py', 'scripts/build_soil_check.py', 'scripts/build_smap.py', 'scripts/build_grace_tws.py', 'scripts/build_imerg.py', 'scripts/build_era5_tcwv.py'], ['data/soil_pentad.csv', 'data/soil_yearly.csv', 'data/soil_smap_check.csv', 'data/grace_tws_monthly.csv', 'data/imerg_yearly.csv', 'data/era5_tcwv_monthly.csv', 'data/era5_t2_regions_monthly.csv']],
    'wildfires.html': ['Global Wildfire Information System (GWIS), Copernicus Emergency Management Service / European Commission Joint Research Centre: weekly CO₂ emissions from fires per country and region, from 2003 (<a href="https://gwis.jrc.ec.europa.eu/apps/gwis.statistics/seasonaltrend">GWIS statistics portal</a>).',
      'GWIS\'s weekly values are shown unchanged; the running totals, averages, ranges and ranks are calculated by this page.', ['scripts/build_fires.py'], ['data/fires_weekly.csv']],
    'boundaries.html': ['Planetary Health Check 2026, Planetary Boundaries Science Lab, Potsdam Institute for Climate Impact Research (<a href="https://www.planetaryhealthcheck.org">planetaryhealthcheck.org</a>). CO₂: NOAA Global Monitoring Laboratory, Mauna Loa.',
      'The report\'s values (Table 7.1) are shown unchanged, except CO₂, which is the latest 12-month Mauna Loa average; the zone scaling of the bars is done by this page.', ['boundaries.html'], ['data/planetary_boundaries.json', 'data/co2_mm_mlo.txt']],
    'slow.html': ['Fossil CO₂: Global Carbon Project, fossil CO₂ emissions dataset (Andrew and Peters, Zenodo). Ocean pH: Hawaii Ocean Time-series, Station ALOHA. AMOC: RAPID-MOCHA-WBTS array at 26.5°N (<a href="https://rapid.ac.uk/">rapid.ac.uk</a>). Red List Index: IUCN and BirdLife International, via the UN SDG database (indicator 15.5.1). Tree cover loss: University of Maryland and Global Forest Watch, via Our World in Data. Crop yields: FAO, FAOSTAT. Cherry blossom: Y. Aono, via the GMU cherry blossom prediction competition. Permafrost: CALM thaw depth network (measured); PERMOS, Swiss boreholes (measured); ESA Permafrost_cci ground temperature (modelled). Carbon sinks: Global Carbon Budget (Friedlingstein et al., Global Carbon Project), via openclimatedata\'s CSV copy.',
      'Emissions, pH and the Red List Index are shown unchanged; RAPID\'s twice-daily transports are averaged here to months. Trends, 12-month averages and changes are calculated by this page.', ['scripts/build_slow.py', 'scripts/build_permafrost.py', 'pfmap.js'], ['data/fossil_co2_global.csv', 'data/permafrost_calm.csv', 'data/permafrost_permos.csv', 'data/permafrost_cci.csv', 'data/permafrost_map.json', 'data/hot_surface_ph.csv', 'data/amoc_rapid_monthly.csv', 'data/redlist_index_world.csv', 'data/tree_cover_loss_world.csv', 'data/fao_crop_yields_world.csv', 'data/kyoto_cherry_blossom.csv', 'data/carbon_sinks_global.csv']],
    'models.html': ['Past projections: Hausfather et al. 2020 (<a href="https://doi.org/10.1029/2019GL085378">doi:10.1029/2019GL085378</a>). Climate models: CMIP6, one run per model, as averaged by N. Swart (CCCma). Projections: IPCC AR6 WG1 Table SPM.1. Carbon budget and greenhouse-gas forcing: Indicators of Global Climate Change 2025 (<a href="https://doi.org/10.5194/essd-18-3889-2026">doi:10.5194/essd-18-3889-2026</a>). Outlooks: WMO decadal update 2026, UNEP Emissions Gap Report 2025. Measurements: Copernicus ERA5; NASA GISTEMP v4 for the Hansen 2025 test. Winter sea ice: the 27 models of Fu, Osman &amp; Aquino-López 2026 (<a href="https://doi.org/10.1038/s41561-026-02123-w">doi:10.1038/s41561-026-02123-w</a>) and NSIDC Sea Ice Index v4. Sea level: NASA-SSH and IPCC AR6 WG1 SPM B.5.3.',
      'Published projections, verdicts and budgets are shown unchanged; measured warming rates, yearly ERA5 means and the CMIP6 percentiles across models are calculated here.', ['models.html', 'scripts/build_models.py', 'scripts/build_fu2026_march_sie.py'], ['data/models_old.json', 'data/models_march_sie_fu2026.csv', 'data/models_cmip6.csv', 'data/models_outlook.json', 'data/models_hansen_temp.csv', 'data/models_whatittakes.json']],
  };
  const how = HOW[here];
  if (how && nav && !EMBED) {
    const [src, what, code, file] = how, name = f => f.split('/').pop();
    const box = document.createElement('section'); box.className = 'how';
    box.innerHTML = '<h2>Data and method</h2><p><b>Source:</b> ' + src + ' ' + what + '</p><p class="links">' +
      '<a href="methods.html#' + here.replace('.html', '') + '">Full method and checks</a>' +
      code.map(c => '<a href="' + GH + '/blob/main/' + c + '">Code: ' + name(c) + '</a>').join('') +
      [].concat(file).map(f => '<a href="' + f + '">Data: ' + name(f) + '</a>').join('') + '</p>';   // one data file or several
    (document.querySelector('.tools') || nav).after(box);
  }

  // ---- "In short" box on data pages. The text lives in inshort.js, the live numbers in indicators.js.
  const page = location.pathname.split('/').pop() || 'index.html';
  const load = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  let eiP = null; const eiLoad = () => window.EI ? Promise.resolve() : (eiP ||= load('indicators.js'));   // loaded once, shared
  if (nav && !EMBED && !['index.html', 'claims.html'].includes(page)) {
    load('inshort.js').then(() => {
      const it = window.IN_SHORT && window.IN_SHORT[page];
      if (!it) return;
      return eiLoad().then(() => {
        const box = document.createElement('section'); box.className = 'inshort';
        const live = t => t.replace(/\{(\w+\.\w+)\}/g, '<span class="live" data-k="$1">…</span>');
        box.innerHTML = '<h2>In short</h2>' + it.text.map(t => '<p>' + live(t) + '</p>').join('') +
          (it.units ? '<p class="units"><b>In everyday terms:</b> ' + live(it.units) + '</p>' : '') +
          (it.claims && it.claims.length ? '<div class="rel"><span>Related claims, answered:</span><ul>' + it.claims.map(c => '<li><a href="claims.html#' + c + '">' + (window.CLAIMS[c] || c) + '</a></li>').join('') + '</ul></div>' : '') +
          '<p class="stamp"></p>';
        (document.querySelector('.tools') || nav).after(box);
        const ids = [...new Set([...box.querySelectorAll('[data-k]')].map(e => e.dataset.k.split('.')[0]))];
        EI.fill(box);
        Promise.allSettled(ids.map(id => EI.get(id).then(r => r.src + ', data through ' + r.through))).then(R => {
          box.querySelector('.stamp').textContent = [...new Set(R.filter(r => r.status === 'fulfilled').map(r => r.value))].join('; ');
        });
      });
    }).catch(e => console.error('In short box:', e));
  }

  // ---- back-to-top button, appears after scrolling down a bit
  const top = document.createElement('button');
  top.type = 'button'; top.id = 'totop'; top.textContent = '↑'; if (EMBED) top.hidden = true;
  top.title = 'Back to top'; top.setAttribute('aria-label', 'Back to top');
  document.body.appendChild(top);
  // its outline fills up (clockwise) with how far down the page the reader is
  const toggle = () => {
    top.classList.toggle('show', window.scrollY > 400);
    const h = document.documentElement.scrollHeight - window.innerHeight;
    top.style.setProperty('--p', h > 0 ? Math.min(1, window.scrollY / h).toFixed(3) : 0);
  };
  window.addEventListener('scroll', toggle, { passive: true }); window.addEventListener('resize', toggle); toggle();

  // ---- links to other websites open in a new tab (also links added later by page scripts)
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && a.hostname && a.hostname !== location.hostname && !a.target) { a.target = '_blank'; a.rel = 'noopener'; }
  }, true);
  top.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // ---- several charts, from any pages, combined into one JPG. "Add to image" stores a snapshot of the chart as it
  //      looks then (zoom, region, switches, hidden lines) in this browser; the tray at the bottom combines them.
  const MAXP = 6, PK = 'ei-picks', LK = 'ei-picks-layout';
  // layout: 'wide' (more columns, e.g. 3×2) or 'tall' (fewer columns, e.g. 2×3), remembered in this browser.
  // For 1 or 4 charts both give the same grid (1, 2×2), so no choice is offered there.
  const lay = {
    get() { try { return localStorage.getItem(LK) === 'tall' ? 'tall' : 'wide'; } catch (e) { return 'wide'; } },
    set(v) { try { localStorage.setItem(LK, v); } catch (e) {} },
    cols(n, v) { return v === 'tall' ? (n <= 3 ? 1 : 2) : (n <= 3 ? n : n === 4 ? 2 : 3); },
    name(n, v) { const c = this.cols(n, v); return c + '×' + Math.ceil(n / c); },
    choice(n) { return this.cols(n, 'wide') !== this.cols(n, 'tall'); }
  };
  const picks = {
    labels: [],
    list() { try { return JSON.parse(localStorage.getItem(PK) || '[]'); } catch (e) { return []; } },
    save(l) { try { localStorage.setItem(PK, JSON.stringify(l)); return true; } catch (e) { return false; } },
    refresh() { this.labels.forEach(f => f()); tray(); },
    toggle(key, box, cv, page, label) {
      let l = this.list();
      if (l.some(i => i.k === key)) { this.save(l.filter(i => i.k !== key)); return this.refresh(); }
      if (l.length >= MAXP) { alert('An image holds up to ' + MAXP + ' charts. Remove one first.'); return; }
      const ch = window.Chart && Chart.getChart(cv), h2 = box.querySelector('h2');
      if (!ch || !h2 || !window.siteRender) return;
      const c = siteRender([[ch, h2, /Middle 80% of prior years/.test(box.textContent) ? 1 : 0]]);
      const s = Math.min(1, 1400 / c.width), o = document.createElement('canvas');
      o.width = Math.round(c.width * s); o.height = Math.round(c.height * s);
      o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
      l.push({ k: key, p: page, t: h2.textContent, d: o.toDataURL('image/jpeg', .85), h: c.chartTop / c.height, e: c.chartEnd / c.height });
      if (!this.save(l)) { alert('This browser has no room to store more charts. Remove one, or make the image now.'); return; }
      gcEvent('chart-pick/' + key, h2.textContent);
      this.refresh();
    },
    move(i, d) { const l = this.list(), j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; this.save(l); this.refresh(); },
    remove(i) { const l = this.list(); l.splice(i, 1); this.save(l); this.refresh(); },
    async make() {
      const l = this.list(); if (!l.length) return;
      const imgs = await Promise.all(l.map(i => new Promise(ok => { const m = new Image(); m.onload = () => ok(m); m.onerror = () => ok(null); m.src = i.d; })));
      const W = 2400, pad = 40, gap = 32, capH = 40, footH = 64, n = l.length, cols = lay.cols(n, lay.get());
      const cw = (W - 2 * pad - (cols - 1) * gap) / cols, rows = [];
      for (let k = 0; k < n; k += cols) rows.push(imgs.slice(k, k + cols).map((m, j) => [m, l[k + j]]));
      const rh = rows.map(r => Math.max(...r.map(([m]) => m ? m.height * cw / m.width : 0)) + capH);
      const H = pad + rh.reduce((a, b) => a + b, 0) + gap * (rows.length - 1) + footH;
      const o = document.createElement('canvas'); o.width = W; o.height = H;
      const x = o.getContext('2d'), F = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      x.fillStyle = THEME.card; x.fillRect(0, 0, W, H); x.textBaseline = 'top';
      let y = pad;
      rows.forEach((r, ri) => {
        r.forEach(([m, it], j) => {
          const cx = pad + (j + (cols - r.length) / 2) * (cw + gap);   // a short last row is centered
          if (m) {
            // title and legend stay at the top, the page line at the bottom; the plot is centered between them
            // (charts in one row differ in height). Picks stored before this change have no h/e: whole image centered.
            const s = cw / m.width, t = Math.round(m.height * (it.h || 0)), b = Math.round(m.height * (it.e || 1));
            const top = t * s, ph = (b - t) * s, off = (rh[ri] - capH - top - ph) / 2;
            if (t) x.drawImage(m, 0, 0, m.width, t, cx, y, cw, top);
            x.drawImage(m, 0, t, m.width, b - t, cx, y + top + off, cw, ph);
          }
          x.font = '22px ' + F; x.fillStyle = THEME.mut;
          x.fillText('earthindicators.org/' + it.p + '.html', cx + 16, y + rh[ri] - capH + 6);
        });
        y += rh[ri] + gap;
      });
      y = H - footH + 16; x.strokeStyle = THEME.grid; x.beginPath(); x.moveTo(pad, y - 8); x.lineTo(W - pad, y - 8); x.stroke();
      x.font = '600 26px ' + F; x.fillStyle = THEME.ink; x.fillText('Earth Indicators · earthindicators.org', pad, y);
      x.font = '22px ' + F; x.fillStyle = THEME.mut; x.textAlign = 'right';
      x.fillText('Free to share with credit (CC BY 4.0)', W - pad, y + 4);
      made = o.toDataURL('image/jpeg', .9); saveMade();
      gcEvent('chart-pick-make/' + n, n + ' charts');
      // the page cannot tell whether the download was saved or canceled, so: empty the queue, and keep the
      // finished image on offer ("Download again") until the tray is closed or the page is left
      this.save([]); this.refresh();
    }
  };
  let trayEl = null, made = null, listOpen = false;
  // the picked charts, in image order (left to right, row by row), each with move up/down and remove
  function drawList(l) {
    const box = trayEl.querySelector('.plist'); box.hidden = !listOpen || !l.length;
    trayEl.querySelector('.pcount').setAttribute('aria-expanded', String(!box.hidden));
    if (box.hidden) return;
    const btn = (txt, label, off, fn) => { const e = document.createElement('button'); e.type = 'button'; e.className = 'nb';
      e.textContent = txt; e.title = label; e.setAttribute('aria-label', label); e.disabled = off; e.onclick = fn; return e; };
    box.replaceChildren(...l.map((it, i) => {
      const row = document.createElement('div'); row.className = 'prow';
      const im = new Image(); im.src = it.d; im.alt = '';
      const tx = document.createElement('div'), b = document.createElement('b'), sm = document.createElement('small');
      b.textContent = (i + 1) + '. ' + it.t; sm.textContent = [it.p, ...it.k.split(' · ').slice(1)].join(' · ');
      tx.append(b, sm);
      row.append(im, tx, btn('↑', 'Move up', i === 0, () => picks.move(i, -1)),
        btn('↓', 'Move down', i === l.length - 1, () => picks.move(i, 1)), btn('✕', 'Remove from image', false, () => picks.remove(i)));
      return row;
    }));
  }
  const saveMade = () => { const a = document.createElement('a'); a.download = 'earth-indicators-charts.jpg'; a.href = made;
    document.body.appendChild(a); a.click(); a.remove(); };
  function tray() {
    const n = picks.list().length;
    if (!n && !made) { if (trayEl) trayEl.hidden = true; return; }
    if (!trayEl) {
      trayEl = document.createElement('div'); trayEl.className = 'ptray';
      trayEl.innerHTML = '<div class="plist" hidden></div><button type="button" class="nb pcount" aria-expanded="false"></button>' +
        '<button type="button" class="nb playout"></button><div class="pbtns"><button type="button" class="nb pmake"></button><button type="button" class="nb pclear"></button></div>';
      trayEl.querySelector('.pcount').onclick = () => { listOpen = !listOpen; tray(); };
      trayEl.querySelector('.playout').onclick = () => { lay.set(lay.get() === 'tall' ? 'wide' : 'tall'); tray(); };
      trayEl.querySelector('.pmake').onclick = () => n2() ? picks.make() : made && saveMade();
      trayEl.querySelector('.pclear').onclick = () => {
        if (n2()) { if (confirm('Remove all charts from your image?')) { picks.save([]); picks.refresh(); } }
        else { made = null; tray(); } };
      document.body.appendChild(trayEl);
    }
    trayEl.hidden = false;
    const ready = !n && made;   // just made, queue empty: offer the same image again
    const pc = trayEl.querySelector('.pcount');
    pc.textContent = ready ? 'Image made. Not saved?' : n + (n === 1 ? ' chart' : ' charts') + ' picked (max ' + MAXP + ') ' + (listOpen ? '▴' : '▾');
    pc.disabled = !!ready; pc.title = ready ? '' : (listOpen ? 'Hide' : 'Show') + ' the charts in your image';
    drawList(ready ? [] : picks.list());
    const lb = trayEl.querySelector('.playout'), v = lay.get(), o = v === 'tall' ? 'wide' : 'tall';
    lb.hidden = !!ready || !lay.choice(n);
    if (!lb.hidden) { lb.textContent = 'Layout ' + lay.name(n, v) + ' ⇄';
      lb.title = 'Switch to ' + lay.name(n, o) + ' (' + o + ')'; lb.setAttribute('aria-label', 'Image layout ' + lay.name(n, v) + ', ' + v + '. ' + lb.title); }
    trayEl.querySelector('.pmake').textContent = ready ? 'Download again' : 'Make image';
    trayEl.querySelector('.pclear').textContent = ready ? 'Close' : 'Clear';
    if (n) made = null;           // a new pick starts a new image
  }
  const n2 = () => picks.list().length;
  window.addEventListener('storage', e => { if (e.key === PK) picks.refresh(); });   // picked in another tab
  if (!EMBED) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tray); else tray(); }

  // ---- one share link per chart, like the claims page: every box with a chart gets a "Copy link to this chart"
  //      button. The link goes to s/<page>-<canvas id>.html, a small page with that chart's own preview image
  //      (made daily by scripts/build_chart_cards.py), which sends readers on to <page>#ch-<canvas id>.
  const stem = page.replace(/\.html$/, '');
  // switch settings in a link: the index of the selected button in each switch that applies to a chart, page-wide
  // switches first (e.g. the region on the air page), then the chart's own; "3.1" = 4th button, then 2nd button
  const segsFor = box => (box.hasAttribute('data-own-switches') ? [] : [...document.querySelectorAll('main .seg')].filter(g => !g.closest('.box'))).concat([...box.querySelectorAll('.seg')]);   // data-own-switches: a chart the page-wide switches do not change (the SST map)
  const segCode = box => segsFor(box).map(g => [...g.querySelectorAll('.nb')].findIndex(b => b.classList.contains('on'))).join('.');
  let segDefault = null;   // every switch as the page first set it, captured just before the reader's first click on one
  document.addEventListener('click', e => { if (!segDefault && e.target.closest('.seg')) segDefault = new Map(
    [...document.querySelectorAll('main .box')].map(b => [b, segCode(b)])); }, true);
  async function applySegs(box, code) {
    const want = code.split('.').map(Number);
    for (let i = 0; i < want.length; i++) {
      const g = segsFor(box)[i], b = g && g.querySelectorAll('.nb')[want[i]];
      if (b && !b.hidden && !b.classList.contains('on')) { b.click(); await new Promise(r => setTimeout(r, 120)); }
    }
  }
  // share pages made for other switch settings (s/<page>-<chart>_<code>.html, with their own preview image)
  let variants = new Set(), versions = {};
  if (nav && !['index.html', 'claims.html', 'methods.html'].includes(page)) {
    fetch('s/variants.json').then(r => r.ok ? r.json() : []).then(l => { variants = new Set(l); }).catch(() => {});
    // fingerprint of each preview image: put on the link as ?v=..., so a newly drawn preview gets a new address
    // and X, WhatsApp etc. fetch it instead of reusing the picture they cached for the link earlier
    fetch('s/versions.json').then(r => r.ok ? r.json() : {}).then(o => { versions = o || {}; }).catch(() => {});
  }
  // ---- "Data through" stamp under a chart: how recent its data is and where it comes from, from the same shared
  //      numbers as the In short boxes (indicators.js). Charts not listed get no stamp: static records, yearly
  //      charts whose title already says the last year, maps that name their own date, and charts with a switch
  //      between records with different dates. A page can also set data-through on a chart's box itself.
  const STAMP = {
    'air.html': { c1: 'air', c2: 'air', c3: 'air', c4: 'air' },
    'sst.html': { c1: 'sst', c2: 'sst', c3: 'sst' },
    'nino.html': { c1: 'nino', c2: 'nino', c3: 'nino' },
    'ohc.html': { c1: 'ohc' },
    'sea-level.html': { c1: 'sl', c2: 'sl' },
    'sea-ice.html': { c1: 'ice', c2: 'ant', c3: 'ice', c4: 'ice', c7: 'ice' },
    'land-ice.html': { c1: 'land' },
    'co2.html': { c1: 'co2', c2: 'co2', c3: 'co2', c5: 'co2' },
    'ch4.html': { c1: 'ch4', c3: 'ch4', c4: 'ch4' },
    'ghg.html': { c1: 'ghg', c4: 'ghg', c5: 'ghg' },
    'eei.html': { c1: 'eei', c2: 'eei', c5: 'eei' },
    'water.html': { c1: 'wv', c2: 'wv', c4: 'wv' },
    'corals.html': { c1: 'coral', c2: 'coral' },
    'sun.html': { c1: 'sun', c3: 'sun' },
    'pdo.html': { c1: 'pdo', c2: 'pdo', c3: 'pdo' },
    'slow.html': { c1: 'amoc', c2: 'rli', c3: 'fossil', c4: 'ph', c5: 'trees', c8: 'blossom' },
  };
  function stampFor(box, cv, bar) {
    const id = (STAMP[page] || {})[cv.id];
    let s = null;
    const show = t => { if (!t && !s) return; if (!s) { s = document.createElement('span'); s.className = 'cstamp'; bar.prepend(s); }
      s.textContent = t ? 'Data through ' + t : ''; };
    if (box.dataset.through) show(box.dataset.through);
    new MutationObserver(() => show(box.dataset.through)).observe(box, { attributes: true, attributeFilter: ['data-through'] });
    if (id) eiLoad().then(() => EI.get(id)).then(r => { if (!box.dataset.through) show(r.through + ' · ' + r.src); }).catch(() => {});
  }

  // ---- "Embed" panel under a chart: the iframe code, with the chart's switches as set now and a choice of theme
  function embedPanel(box, cv, bar, eb) {
    let p = box.querySelector('.embedp');
    if (p) { p.remove(); eb.setAttribute('aria-expanded', 'false'); return; }
    p = document.createElement('div'); p.className = 'embedp';
    p.innerHTML = '<p>Paste this code into a web page to show this chart there. It updates by itself whenever the data here does, ' +
      'and links back to this page. Free to use with credit (CC BY 4.0), which the chart carries.</p>' +
      '<div class="views">Theme: <button type="button" class="nb on" data-t="">Reader\'s device</button><button type="button" class="nb" data-t="light">Light</button><button type="button" class="nb" data-t="dark">Dark</button></div>' +
      '<textarea readonly rows="3" aria-label="Embed code"></textarea><div class="cbar"><button type="button" class="nb ecopy">Copy code</button></div>';
    let theme = '';
    const code = () => { const c = segCode(box), d = segDefault ? segDefault.get(box) : c;
      const src = location.origin + '/' + page + '?embed=' + encodeURIComponent(cv.id) + (theme ? '&theme=' + theme : '') + (c && c !== d && !/-1/.test(c) ? '#~' + c : '');
      const h = Math.min(900, Math.max(320, Math.round(box.querySelector('.wrap') ? box.offsetHeight + 24 : 480)));
      const t = ((box.querySelector('h2') || {}).textContent || '').replace(/"/g, '&quot;');
      return '<iframe src="' + src + '" title="Earth Indicators: ' + t + '" width="100%" height="' + h + '" style="border:0;max-width:1000px" loading="lazy"></iframe>'; };
    const ta = p.querySelector('textarea'), upd = () => { ta.value = code(); };
    p.querySelector('.views').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return;
      theme = b.dataset.t; p.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b)); upd(); });
    p.querySelector('.ecopy').onclick = e => { const b = e.target; upd();
      const done = () => { b.textContent = 'Code copied'; setTimeout(() => b.textContent = 'Copy code', 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); }); else ta.select();
      gcEvent('chart-embed/' + stem + '-' + cv.id, (box.querySelector('h2') || {}).textContent || stem); };
    ta.addEventListener('focus', () => ta.select());
    // the code follows the switches while the panel is open (the chart's own, and page-wide ones like the region)
    const follow = e => { if (!p.isConnected) return document.removeEventListener('click', follow, true);
      if (e.target.closest('.seg') && !p.contains(e.target)) setTimeout(upd, 0); };
    document.addEventListener('click', follow, true);
    upd(); bar.after(p); eb.setAttribute('aria-expanded', 'true');
  }
  // embed mode: everything on the page but the one chart is hidden; its switches are set as in the link
  function embedOnly(code) {
    const cv = document.getElementById(EMBED), box = cv && cv.closest('.box');
    if (!box) { document.querySelector('main').innerHTML = '<p style="padding:16px">This chart is no longer on <a href="' + location.origin + '/' + page + '" target="_blank" rel="noopener">Earth Indicators</a>.</p>'; return; }
    for (let el = box; el && el.tagName !== 'MAIN'; el = el.parentElement)
      [...el.parentElement.children].forEach(c => { if (c !== el && !['SCRIPT', 'STYLE'].includes(c.tagName)) c.style.display = 'none'; });
    for (let el = box.parentElement; el && el.tagName !== 'MAIN'; el = el.parentElement) { el.hidden = false; el.classList.remove('hide'); }
    if (code && /^[0-9.]+$/.test(code)) { let n = 0;
      const go = () => { const h = box.querySelector('h2'); if (h && h.textContent) applySegs(box, code); else if (++n < 60) setTimeout(go, 250); };
      window.addEventListener('load', go); }
  }

  // ---- a chart's numbers as CSV: one row per point on the x axis, one column per series the chart shows (lines hidden
  //      in the legend are left out; band edges are in while their band is on; with "Every year" on, every year too).
  //      A few lines starting with # say what the file is; spreadsheet programs show them as the first rows.
  function chartCSV(ch, box) {
    const q = v => { const s = String(v ?? ''); return /[",\n#]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const num = v => v == null || (typeof v === 'number' && !isFinite(v)) ? '' : typeof v === 'number' ? String(+v.toPrecision(7)) :
      Array.isArray(v) ? v.map(num).join(' to ') : v;
    const labels = ch.data.labels || [], xs = [], rows = new Map(), cols = [];
    const row = x => { const k = String(x); if (!rows.has(k)) { rows.set(k, {}); xs.push(x); } return rows.get(k); };
    const add = (name, data, isObj) => {
      let n = name || (cols.length ? 'series ' + (cols.length + 1) : 'value'); while (cols.includes(n)) n += ' (2)'; cols.push(n);
      data.forEach((p, i) => { if (p == null) return;
        const o = isObj || (typeof p === 'object' && !Array.isArray(p));
        const x = o ? p.x : labels[i], y = o ? p.y : p; if (x == null) return; row(x)[n] = y; });
    };
    labels.forEach(row);                                          // keep the axis order of category charts
    ch.data.datasets.forEach((d, i) => { if (ch.isDatasetVisible(i)) add(d.label, d.data || []); });
    const yl = ch.$years; if (yl && bandOn(ch, 3)) yl.years.forEach((y, k) => { if (!cols.includes(String(y))) add(String(y), yl.rows[k]); });   // highlighted years are in already
    if (!labels.length) xs.sort((a, b) => (+a) - (+b));
    const sx = ch.options.scales && ch.options.scales.x, day = sx && sx.ticks && sx.ticks.callback === window.dayTick;
    const used = xs.filter(x => cols.some(c => rows.get(String(x))[c] != null));
    const axTitle = a => a && a.title && a.title.display && a.title.text ? [].concat(a.title.text).join(' ') : '';
    const sw = [...box.querySelectorAll('.seg .nb.on')].map(e => e.textContent.trim()).concat(
      box.hasAttribute('data-own-switches') ? [] : [...document.querySelectorAll('main .seg')].filter(g => !g.closest('.box')).map(g => (g.querySelector('.nb.on') || {}).textContent || '').filter(Boolean));
    const src = HOW[here] ? HOW[here][0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
    const head = ['# Earth Indicators: ' + ((box.querySelector('h2') || {}).textContent || '').trim(),
      '# ' + location.origin + location.pathname + '#' + box.id,
      ...(sw.length ? ['# Settings: ' + [...new Set(sw)].join(', ')] : []),
      ...(axTitle(ch.options.scales && ch.options.scales.y) ? ['# Values: ' + axTitle(ch.options.scales.y)] : []),
      ...(src ? ['# Source: ' + src] : []),
      '# Downloaded ' + new Date().toISOString().slice(0, 10) + '. Free to share with credit to Earth Indicators (CC BY 4.0); the data stays under its providers\' terms.'];
    const xName = day ? 'day_of_year' : axTitle(sx) || (used.every(x => /^\d{4}$/.test(x)) ? 'year' : used.every(x => /^\d{4}-\d\d$/.test(x)) ? 'month' :
      used.every(x => typeof x === 'number' && x > 1000 && x < 2300) ? 'decimal_year' : 'x');
    const lines = [[xName, ...(day ? ['date'] : []), ...cols].map(q).join(',')];
    used.forEach(x => { const r = rows.get(String(x));
      lines.push([q(typeof x === 'number' ? +x.toPrecision(9) : x), ...(day ? [q(window.dayTick.call({ max: 366, min: 365 }, +x))] : []), ...cols.map(c => q(num(r[c])))].join(',')); });
    return head.map(l => l.replace(/[\r\n]+/g, ' ')).join('\n') + '\n' + lines.join('\n') + '\n';
  }
  if (nav && !['index.html', 'claims.html', 'methods.html'].includes(page)) {
   const shareSetup = () => {
    document.querySelectorAll('main .box').forEach(box => {
      const cv = box.querySelector('canvas[id]');
      if (!cv || box.querySelector('.cbar')) return;
      if (!box.id) box.id = 'ch-' + cv.id;
      // the link carries the switches as set now, unless they are still as the page opened (the preview image
      // always shows that default version; opening the link restores the reader's settings)
      const link = n => location.origin + '/s/' + n + '.html' + (versions[n] ? '?v=' + versions[n] : '');
      const urlNow = () => { const c = segCode(box), d = segDefault ? segDefault.get(box) : c, base = stem + '-' + cv.id;
        if (!c || c === d || /-1/.test(c)) return link(base);
        // a variant with its own preview if there is one; otherwise the default preview, and the page restores the settings
        return variants.has(base + '_' + c) ? link(base + '_' + c) : link(base) + '#' + c; };
      const bar = document.createElement('div'); bar.className = 'cbar';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'nb'; b.textContent = 'Copy link to this chart';
      b.onclick = () => {
        const url = urlNow(), done = () => { b.textContent = 'Link copied'; setTimeout(() => b.textContent = 'Copy link to this chart', 2000); };
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('Copy this link:', url)); else prompt('Copy this link:', url);
        gcEvent('chart-copy/' + stem + '-' + cv.id, (box.querySelector('h2') || {}).textContent || stem);
      };
      if (!EMBED) bar.appendChild(b);
      // the key includes the switches as they are set now (region, baseline, data source...), so the same chart
      // can be added once per setting, e.g. Arctic and Antarctic volume side by side in one image
      const pb = document.createElement('button'); pb.type = 'button'; pb.className = 'nb pick';
      const key = () => [stem + '-' + cv.id, ...[...box.querySelectorAll('.seg .nb.on')].map(e => e.textContent.trim())].join(' · ');
      const label = () => { const on = picks.list().some(i => i.k === key()); pb.textContent = on ? 'In your image ✓' : 'Add to image'; pb.classList.toggle('on', on); };
      pb.onclick = () => picks.toggle(key(), box, cv, stem, label);
      box.addEventListener('click', e => { if (e.target.closest('.seg')) setTimeout(label, 0); });   // after the page has switched
      label(); picks.labels.push(label);
      if (!EMBED) bar.appendChild(pb);
      // the numbers behind the chart, as it is set now (region, switches, bands): data-no-csv on a box leaves it out (maps)
      if (!box.hasAttribute('data-no-csv')) {
        const cb = document.createElement('button'); cb.type = 'button'; cb.className = 'nb'; cb.textContent = 'Data (CSV)';
        cb.title = 'The numbers in this chart, as a spreadsheet file';
        cb.onclick = () => { const ch = window.Chart && Chart.getChart(cv); if (!ch) return;
          const name = key().replace(/ · /g, '-').replace(/[^\w.-]+/g, '_').toLowerCase() + '.csv';
          const a = document.createElement('a'); a.download = name;
          a.href = URL.createObjectURL(new Blob(['﻿' + chartCSV(ch, box)], { type: 'text/csv;charset=utf-8' }));
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          gcEvent('chart-csv/' + stem + '-' + cv.id, (box.querySelector('h2') || {}).textContent || stem); };
        if (EMBED) bar.appendChild(cb); else bar.insertBefore(cb, pb);
      }
      // "Embed": code for showing this chart, live, on another website (an iframe of this page in embed mode)
      if (!EMBED) {
        const eb = document.createElement('button'); eb.type = 'button'; eb.className = 'nb'; eb.textContent = 'Embed';
        eb.title = 'Show this chart, kept up to date, on your own website'; eb.setAttribute('aria-expanded', 'false');
        eb.onclick = () => embedPanel(box, cv, bar, eb);
        bar.appendChild(eb);
      } else {
        const a = document.createElement('a'); a.className = 'nb'; a.href = location.origin + '/' + page + '#' + box.id; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = 'Earth Indicators ↗'; a.title = 'The full page, with more charts and how the numbers are made'; bar.appendChild(a);
      }
      stampFor(box, cv, bar);
      box.appendChild(bar);
    });
    if (EMBED) embedOnly(decodeURIComponent(location.hash.slice(1)).split('~')[1]);
    // arriving from a shared link: charts appear only after their data has loaded, so wait for the box to show
    const [h, code] = decodeURIComponent(location.hash.slice(1)).split('~');
    if (h) {
      let n = 0;
      const go = () => {
        const el = document.getElementById(h) || document.getElementById('ch-' + h);
        if (el && el.offsetParent !== null && el.querySelector('h2') && el.querySelector('h2').textContent) {
          (code && /^[0-9.]+$/.test(code) ? applySegs(el, code) : Promise.resolve())
            .then(() => setTimeout(() => el.scrollIntoView({ block: 'start' }), 150));
        } else if (++n < 60) setTimeout(go, 250);
      };
      window.addEventListener('load', go);
    }
   };
   if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', shareSetup); else shareSetup();
  }

  // ---- section menu on wide screens: the page's sections down the empty right-hand side, as a timeline whose dot
  //      turns red for the section being read. Built from the page itself, so new sections appear in it by themselves;
  //      rebuilt when page scripts show sections or fill in chart titles after their data has loaded.
  if (nav && !EMBED && page !== 'claims.html') {            // the overview gets one too: its five groups
    const side = document.createElement('nav');
    side.className = 'secnav'; side.setAttribute('aria-label', 'Sections on this page');
    document.body.appendChild(side);
    const main = document.querySelector('main');
    const shown = el => el && el.offsetParent !== null && el.getClientRects().length > 0;
    // short label: up to the first colon; if still long, up to the first comma; then cut at a word
    const short = t => {
      t = t.replace(/\s+/g, ' ').trim();
      if (t.indexOf(':') > 0) t = t.slice(0, t.indexOf(':'));
      if (t.length > 34 && t.indexOf(',') > 0) t = t.slice(0, t.indexOf(','));
      if (t.length > 40) t = t.slice(0, 38).replace(/\s+\S*$/, '') + '…';
      return t;
    };
    let items = [];
    const build = () => {
      const found = [], seen = new Set();
      const add = (target, label, full) => {
        if (!target || seen.has(target) || !label || !shown(target)) return;
        seen.add(target); found.push({ target, label, full: full || label });
      };
      add(document.querySelector('.inshort'), 'In short');
      const sec = [...main.querySelectorAll('h2.sec')];
      if (sec.length) sec.forEach(h => add(h.closest('section') || h, short(h.textContent), h.textContent));   // pages grouped in sections
      else main.querySelectorAll('h2').forEach(h => {                                                         // otherwise every chart and heading
        if (h.closest('.inshort, .how, .site-head, .foot-nav, .secnav')) return;
        const box = h.closest('.box') || h;                         // data-nav="…" on a box sets its menu label by hand
        add(box, box.dataset.nav || short(h.textContent), h.textContent.trim());
      });
      add(document.querySelector('.how'), 'Data and method');
      found.sort((a, b) => a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      const key = found.map(f => f.label).join('|');
      if (key === side.dataset.key) return;
      side.dataset.key = key; items = found;
      side.innerHTML = '<ol>' + found.map((f, i) => '<li><a href="#" data-i="' + i + '" title="' + f.full.replace(/"/g, '&quot;') + '"><span></span>' + f.label + '</a></li>').join('') + '</ol>';
      mark();
    };
    // the section being read: the last one whose top has passed 35% of the window height (the first at the top)
    const mark = () => {
      if (!items.length) return;
      let cur = 0;
      items.forEach((f, i) => { if (f.target.getBoundingClientRect().top < window.innerHeight * 0.35) cur = i; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = items.length - 1;   // at the very bottom
      side.querySelectorAll('a').forEach((a, i) => a.classList.toggle('on', i === cur));
    };
    side.addEventListener('click', e => {
      const a = e.target.closest('a'); if (!a) return;
      e.preventDefault();
      const f = items[+a.dataset.i]; if (f) f.target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    let tick = false, wait;
    window.addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(() => { tick = false; mark(); }); } }, { passive: true });
    window.addEventListener('resize', mark);
    new MutationObserver(recs => { if (recs.every(r => side.contains(r.target))) return; clearTimeout(wait); wait = setTimeout(build, 250); })
      .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    build();
  }

  // ---- everything below needs Chart.js. Pages may load it with "defer" (the overview does, so the page can be drawn
  //      before the chart library arrives): then this part waits until the deferred scripts have run, and pages wait
  //      for window.chartReady before drawing charts. With a normal script tag it all runs straight away, as before.
  const chartSetup = () => {
  if (!window.Chart) return;
  if (dark) {                            // light mode keeps Chart.js's own defaults
    // axis: in the light theme a middle grey, readable on white and also when a browser's forced night mode
    // (e.g. Brave) darkens the page behind the chart, which it can't recolor
    Chart.defaults.color = THEME.axis;
    Chart.defaults.borderColor = THEME.grid;
    document.documentElement.classList.add('charts-dark');   // printing flips these charts back to light (site.css)
  }

  // ---- small screens: diagonal x-axis labels so they never overlap
  const NARROW = 640, fixedTicks = new WeakMap();
  function rotate(ch, w) {
    const x = ch.config.options.scales && ch.config.options.scales.x;
    if (!x) return;
    const t = x.ticks || (x.ticks = {});
    if (!fixedTicks.has(ch)) fixedTicks.set(ch, t.autoSkip === false);   // charts that show only selected labels (months, years)
    if (fixedTicks.get(ch)) { const r = w < NARROW ? 45 : 0; t.minRotation = r; t.maxRotation = r; }
    else t.maxRotation = 45;                                            // auto-skipping axes: rotate up to 45° when needed
  }

  // ---- HTML legends in a left-aligned grid (replaces Chart.js's centered canvas legend)
  const LG = new WeakMap();
  function items(ch) {
    const st = LG.get(ch);
    // bars get a filled box in their own color; bars colored per value (e.g. positive/negative) get a box split
    // in two showing both colors; lines get a line sample
    return ch.data.datasets.map((ds, i) => {
      const bar = (ds.type || ch.config.type) === 'bar', bg = ds.backgroundColor;
      const cols = Array.isArray(bg) ? [...new Set(bg)] : null;
      const fill = typeof bg === 'string' ? bg : cols && cols.length > 1 ? `linear-gradient(90deg,${cols[0]} 50%,${cols[1]} 50%)` : cols ? cols[0] : null;
      return { text: ds.label, datasetIndex: i, hidden: !ch.isDatasetVisible(i),
        color: typeof ds.borderColor === 'string' ? ds.borderColor : '#888', fill,
        line: !bar && (ds.borderWidth === undefined || ds.borderWidth > 0), dash: !!(ds.borderDash && ds.borderDash.length),
        // the line's own dash pattern; datasets drawn only as points (showLine: false) get their point shape instead
        dashArr: ds.borderDash && ds.borderDash.length ? ds.borderDash.slice() : null,
        point: !bar && ds.showLine === false ? { style: typeof ds.pointStyle === 'string' ? ds.pointStyle : 'circle',
          fill: typeof bg === 'string' ? bg : 'none' } : null }; })
      .filter(it => it.text && (!st.filter || st.filter(it, ch.data)));
  }
  // a point marker for the legend: circle, triangle, square (rect), diamond (rectRot), centered in a 26x12 box
  function svgPoint(it) {
    const c = it.color, f = it.point.fill, a = ' stroke="' + c + '" stroke-width="2" fill="' + f + '"';
    const sh = { triangle: '<polygon points="13,1.5 18.5,10.5 7.5,10.5"' + a + '/>', rect: '<rect x="8.5" y="1.5" width="9" height="9"' + a + '/>',
      rectRot: '<polygon points="13,0.8 18.2,6 13,11.2 7.8,6"' + a + '/>' }[it.point.style] || '<circle cx="13" cy="6" r="4.3"' + a + '/>';
    return '<svg viewBox="0 0 26 12" width="26" height="12" aria-hidden="true">' + sh + '</svg>';
  }
  function renderLegend(ch) {
    const st = LG.get(ch); if (!st) return;
    st.items = items(ch);
    const sig = JSON.stringify(st.items);
    if (sig === st.sig) return; st.sig = sig;
    st.box.innerHTML = '';
    st.items.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = 'Click to show or hide'; b.setAttribute('aria-pressed', String(!it.hidden));
      if (it.hidden) b.className = 'off';
      const sw = document.createElement('span');
      if (it.point) { sw.className = 'sv'; sw.innerHTML = svgPoint(it); }
      else if (it.line) { sw.className = 'sv'; sw.innerHTML = '<svg viewBox="0 0 26 12" width="26" height="12" aria-hidden="true"><line x1="1" y1="6" x2="25" y2="6" stroke="' + it.color +
        '" stroke-width="3"' + (it.dashArr ? ' stroke-dasharray="' + it.dashArr.join(' ') + '"' : '') + '/></svg>'; }
      else { sw.className = 'bx'; sw.style.background = it.fill || it.color; }
      const tx = document.createElement('span'); tx.className = 'tx'; tx.textContent = it.text;
      b.append(sw, tx);
      b.onclick = () => { ch.setDatasetVisibility(it.datasetIndex, !ch.isDatasetVisible(it.datasetIndex)); ch.update(); };
      st.box.appendChild(b);
    });
  }

  // the invisible lines behind each band (used for its tooltip values) follow the band's on/off switch
  Chart.register({ id: 'bandKeys', beforeUpdate(ch) {
    const box = ch.canvas.closest('.box'); if (!box) return;
    ch.data.datasets.forEach(d => { const k = /^Prior-year (max|min)$/.test(d.label) ? 1 : /^(90th|10th) percentile$/.test(d.label) ? 2 : 0;
      if (k) d.hidden = box.dataset['band' + k] === 'off'; });
  } });
  Chart.register({
    id: 'siteCommon',
    beforeInit(ch) {
      rotate(ch, ch.canvas.parentNode ? ch.canvas.parentNode.clientWidth : 1000);
      const o = ch.config.options, p = o.plugins || (o.plugins = {}), l = p.legend || (p.legend = {});
      if (l.display === false) return;          // charts that hide their legend keep it hidden
      l.display = false;
      const box = document.createElement('div'); box.className = 'lgd';
      const wrap = ch.canvas.parentNode; wrap.parentNode.insertBefore(box, wrap);
      LG.set(ch, { box, filter: l.labels && l.labels.filter });
    },
    resize(ch, args) { rotate(ch, args.size.width); },
    afterUpdate: renderLegend,
    afterInit(ch) { if (ch.resetZoom) ch.canvas.addEventListener('dblclick', () => ch.resetZoom()); },
    afterDestroy(ch) { const st = LG.get(ch); if (st) { st.box.remove(); LG.delete(ch); } }
  });

  // ---- day-of-year axes (index 0 = 1 January, 365 days): month names on the whole year, and real dates once a
  //      chart is zoomed in to a few weeks, so a zoomed axis never ends up with no labels or labels outside the chart.
  //      Category axes: ticks.callback = dayTick (with autoSkip off). Linear axes: also afterBuildTicks = dayTicks.
  const DMS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], DML = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayStep = span => span > 100 ? 0 : span > 45 ? 7 : span > 20 ? 3 : span > 8 ? 2 : 1;   // 0 = month starts only
  const dayName = i => { let m = 11; while (DMS[m] > i) m--; return DML[m] + ' ' + (i - DMS[m] + 1); };
  window.dayTick = function (v) {
    const i = Math.round(v), st = dayStep(this.max - this.min);
    if (!st) return DMS.includes(i) ? DML[DMS.indexOf(i)] : '';
    return i % st === 0 ? dayName(i) : '';
  };
  window.dayTicks = ax => {
    const st = dayStep(ax.max - ax.min), t = [];
    if (!st) DMS.forEach(v => { if (v >= ax.min && v <= ax.max) t.push({ value: v }); });
    else for (let v = Math.ceil(ax.min / st) * st; v <= ax.max; v += st) t.push({ value: v });
    ax.ticks = t;
  };

  // ---- zoom: drag a rectangle with the mouse, or pinch with two fingers on a phone or tablet. Shift-drag (mouse) or a
  //      sideways swipe (touch) moves a zoomed chart; double-click or the "Reset zoom" button shows the whole chart again.
  //      Needs hammer.js and chartjs-plugin-zoom, loaded right after Chart.js (not on the overview, whose charts are static).
  //      On touch screens the chart's vertical axis stays as it is, so a pinch only stretches time.
  const touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  if (window.ChartZoom) {
    if (window.Hammer) Hammer.defaults.touchAction = 'pan-y';      // an up-and-down swipe over a chart still scrolls the page
    const zoomState = ({ chart: ch }) => {                         // show "Reset zoom" only while the chart is zoomed or moved
      const wrap = ch.canvas.parentNode;
      let b = wrap.querySelector(':scope > .zreset');
      if (!b) {
        b = document.createElement('button'); b.type = 'button'; b.className = 'nb zreset'; b.textContent = 'Reset zoom';
        b.onclick = () => ch.resetZoom(); wrap.appendChild(b);
      }
      const zoomed = ch.isZoomedOrPanned();
      b.hidden = !zoomed;
      // a fixed tick step (every 5 years, say) leaves a zoomed-in axis with one tick or none, and Chart.js would label the
      // zoomed edges with long decimals. While zoomed, ticks are put at round values inside the visible range (whole
      // numbers only if the page's step was whole); after a reset the page's own step is used again.
      const sx = ch.options.scales && ch.options.scales.x;
      if (sx && sx.ticks && (sx.ticks.stepSize != null || STEP.has(ch))) {
        if (!STEP.has(ch)) STEP.set(ch, sx.ticks.stepSize);
        const st = STEP.get(ch);
        if (zoomed !== !!sx.afterBuildTicks) {
          sx.ticks.stepSize = zoomed ? undefined : st;
          sx.afterBuildTicks = zoomed ? ax => {
            const raw = (ax.max - ax.min) / (innerWidth < 600 ? 5 : 9), p = Math.pow(10, Math.floor(Math.log10(raw)));
            let step = [1, 2, 5, 10].map(m => m * p).find(v => v >= raw);
            if (st >= 1) step = Math.max(1, Math.round(step));
            const t = []; for (let v = Math.ceil(ax.min / step) * step; v <= ax.max + 1e-9; v += step) t.push({ value: +v.toFixed(6) });
            ax.ticks = t;
          } : undefined;
          ch.update('none');
        }
      }
    };
    const STEP = new WeakMap();
    Chart.helpers.merge(Chart.defaults.plugins.zoom, {
      limits: { x: { min: 'original', max: 'original', minRange: 2 }, y: { min: 'original', max: 'original' } },   // x: at least 2 units (years, months, days)
      zoom: { mode: touch ? 'x' : 'xy', wheel: { enabled: false }, pinch: { enabled: true },
        drag: { enabled: true, threshold: 8, backgroundColor: 'rgba(31,111,181,.12)', borderColor: 'rgba(31,111,181,.7)', borderWidth: 1 },
        onZoomComplete: zoomState },
      pan: { enabled: true, mode: touch ? 'x' : 'xy', modifierKey: 'shift', threshold: 10, onPanComplete: zoomState }
    });
    const addHint = () => document.querySelectorAll('.hint').forEach(h => h.insertAdjacentText('beforeend', touch
      ? ' Tap a chart to see its values; pinch to zoom in.'
      : ' Drag across a chart to zoom in, shift-drag to move it, double-click to zoom out.'));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addHint); else addHint();
  }

  // ---- touch screens: values appear on a tap, not whenever a finger slides over a chart while scrolling,
  //      and the tooltip goes away when the page scrolls or the reader taps somewhere else
  if (touch && window.Chart) {
    Chart.defaults.events = ['click'];
    const clear = () => Object.values(Chart.instances).forEach(ch => {
      if (!ch.tooltip || !ch.tooltip.getActiveElements().length) return;
      ch.setActiveElements([]); ch.tooltip.setActiveElements([], { x: 0, y: 0 }); ch.update('none');
    });
    window.addEventListener('scroll', clear, { passive: true });
    document.addEventListener('touchstart', e => { if (!(e.target instanceof HTMLCanvasElement)) clear(); }, { passive: true });
  }

  // ---- JPG export of several charts with their titles and legends
  // sections: [[chart, titleElementId, showBandKey], ...]
  // titles can be an element id or the element itself
  window.siteRender = function (sections) {
    const r = sections[0][0].currentDevicePixelRatio || 1, pad = 16 * r, tH = 24 * r, kH = 22 * r, gap = 20 * r, rowH = 18 * r;
    const W = Math.max(...sections.map(s => s[0].canvas.width)) + pad * 2;
    const leg = sections.map(([ch]) => { const st = LG.get(ch); return st ? items(ch).filter(i => !i.hidden) : []; });
    const F = 'px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    // legend items flow left to right with their measured width and wrap to a new row when the line is full
    // (fixed columns let long labels run into each other)
    const mx = document.createElement('canvas').getContext('2d'); mx.font = 12 * r + F;
    const flow = leg.map(L => { let lx = pad, row = 0; return L.map(it => {
      const w = 29 * r + mx.measureText(it.text).width;
      if (lx > pad && lx + w > W - pad) { lx = pad; row++; }
      const at = { lx, row }; lx += w + 22 * r; return at; }); });
    const rows = flow.map(f => f.length ? f[f.length - 1].row + 1 : 0);
    const H = pad * 2 + gap * (sections.length - 1) + sections.reduce((h, [ch, , key], n) =>
      h + tH + (key ? kH : 0) + (rows[n] ? rows[n] * rowH + 6 * r : 0) + ch.canvas.height, 0);
    const o = document.createElement('canvas'); o.width = W; o.height = H;
    const x = o.getContext('2d'), font = (px, b) => x.font = (b ? '600 ' : '') + px * r + F;
    x.fillStyle = THEME.card; x.fillRect(0, 0, W, H); x.textBaseline = 'top';
    let y = pad;
    sections.forEach(([ch, tid, key], n) => {
      if (n) y += gap;
      font(15, 1); x.fillStyle = THEME.ink; x.fillText((typeof tid === 'string' ? document.getElementById(tid) : tid).textContent, pad, y); y += tH;
      font(12);
      if (key) {   // only what is switched on in the chart's band key
        let kx = pad;
        [[bandColor(ch, 1), 'Range of prior years (min–max)', 1], [bandColor(ch, 2), 'Middle 80% of prior years', 2], [null, 'Every prior year (older → newer)', 3]].forEach(([c, t, k]) => {
          if (!bandOn(ch, k)) return;
          if (c) x.fillStyle = c;
          else { const g = x.createLinearGradient(kx, 0, kx + 14 * r, 0); [0, .5, 1].forEach(f => g.addColorStop(f, yearColor(f, 1))); x.fillStyle = g; }
          x.fillRect(kx, y + 2 * r, 14 * r, 10 * r); x.fillStyle = THEME.mut; x.fillText(t, kx + 20 * r, y);
          kx += 20 * r + x.measureText(t).width + 18 * r;
        });
        y += kH;
      }
      leg[n].forEach((it, k) => {
        const lx = flow[n][k].lx, ly = y + flow[n][k].row * rowH;
        if (it.point) {
          const cx = lx + 11 * r, cy = ly + 7 * r, q = 4.5 * r; x.strokeStyle = it.color; x.lineWidth = 2 * r; x.setLineDash([]); x.beginPath();
          if (it.point.style === 'triangle') { x.moveTo(cx, cy - q); x.lineTo(cx + q, cy + q * .8); x.lineTo(cx - q, cy + q * .8); x.closePath(); }
          else if (it.point.style === 'rect') x.rect(cx - q, cy - q, 2 * q, 2 * q);
          else if (it.point.style === 'rectRot') { x.moveTo(cx, cy - q); x.lineTo(cx + q, cy); x.lineTo(cx, cy + q); x.lineTo(cx - q, cy); x.closePath(); }
          else x.arc(cx, cy, q, 0, 2 * Math.PI);
          if (it.point.fill !== 'none') { x.fillStyle = it.point.fill; x.fill(); } x.stroke(); }
        else if (it.line) { x.strokeStyle = it.color; x.lineWidth = 3 * r; x.setLineDash(it.dashArr ? it.dashArr.map(v => v * r) : it.dash ? [4 * r, 3 * r] : []);
          x.beginPath(); x.moveTo(lx, ly + 7 * r); x.lineTo(lx + 22 * r, ly + 7 * r); x.stroke(); x.setLineDash([]); }
        else { x.fillStyle = it.fill || it.color; x.fillRect(lx, ly + 2 * r, 22 * r, 11 * r); }
        x.fillStyle = THEME.mut; x.fillText(it.text, lx + 29 * r, ly);
      });
      if (rows[n]) y += rows[n] * rowH + 6 * r;
      o.chartTop = y; x.drawImage(ch.canvas, pad, y); y += ch.canvas.height; o.chartEnd = y;
    });
    return o;
  };
  window.siteExport = function (sections, filename) {
    const o = siteRender(sections);
    const a = document.createElement('a'); a.download = filename; a.href = o.toDataURL('image/jpeg', .92);
    document.body.appendChild(a); a.click(); a.remove();
  };
  };
  window.chartReady = new Promise(done => {
    const go = () => { chartSetup(); done(); };
    if (window.Chart || document.readyState !== 'loading') go(); else document.addEventListener('DOMContentLoaded', go);
  });
})();
