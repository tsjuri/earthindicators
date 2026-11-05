// Sea-surface temperature maps (SST page and El Niño page), drawn from data/sst_map (scripts/build_sst_map.py).
// Each map is a Chart.js chart whose hidden x/y axes are the map's own flat coordinates (Robinson projection,
// centered on 160°W like Climate Reanalyzer's map), so the site's zoom (drag a rectangle, pinch, double-click to
// reset), "Add to image" and share links work on maps as on any other chart. A plugin paints the map pixel by pixel:
// each screen pixel is turned back into a latitude and longitude, and colored from the 1° grid, blending the four
// nearest ocean points so the 1° steps do not show. Land comes from Natural Earth (data/land_110m.json).
(function () {
  const LON0 = 200;                                   // center of the map, °E (160°W): the Pacific in the middle
  const D = 180 / Math.PI, KX = 0.8487, KY = 1.3523 * D;
  // Robinson's table, every 5° of latitude: X = relative length of the parallel, Y = distance from the equator
  const RX = [1, .9986, .9954, .99, .9822, .973, .96, .9427, .9216, .8962, .8679, .835, .7986, .7597, .7186, .6732, .6213, .5722, .5322];
  const RY = [0, .062, .124, .186, .248, .31, .372, .434, .4958, .5571, .6176, .6769, .7346, .7903, .8435, .8936, .9394, .9761, 1];
  const tab = (T, a) => { const f = Math.min(a, 89.9999) / 5, i = Math.floor(f); return T[i] + (T[i + 1] - T[i]) * (f - i); };
  const latOfY = yy => { let i = 0; while (i < 17 && RY[i + 1] < yy) i++; return 5 * (i + (yy - RY[i]) / (RY[i + 1] - RY[i])); };
  const lam = lon => ((lon - LON0) % 360 + 540) % 360 - 180;
  const proj = (lon, lat, l = lam(lon)) => { const a = Math.abs(lat); return [KX * tab(RX, a) * l, Math.sign(lat) * KY * tab(RY, a)]; };
  const unproj = (x, y) => {                          // flat map point -> [lon °E 0–360, lat], or null outside the globe
    const yy = Math.abs(y) / KY; if (yy > 1) return null;
    const lat = Math.sign(y) * latOfY(yy), l = x / (KX * tab(RX, Math.abs(lat)));
    return Math.abs(l) > 180 ? null : [((LON0 + l) % 360 + 360) % 360, lat];
  };
  const FULL = { x0: -KX * 180 - 2, x1: KX * 180 + 2, y0: -KY - 1.5, y1: KY + 1.5 };
  const RATIO = (FULL.x1 - FULL.x0) / (FULL.y1 - FULL.y0);

  // ---- colors: compared with normal (blue–red, as before) and actual temperature (like Climate Reanalyzer's scale)
  const SCALES = {
    anom: { lo: -6, hi: 6, // up to ±2 °C stays pale, so a broadly warm ocean doesn't look alarming; the steps are steepest between ±2 and ±3 °C,
      // so a +3 °C coastal arm still stands out from a +1.5 °C background
      stops: [[-5.5, '#0b2654'], [-4, '#18498a'], [-3, '#2f6fae'], [-2.5, '#5a9bcc'], [-2, '#92c5de'], [-1, '#cfe3ef'], [-.3, '#eef4f8'], [0, '#f7f7f7'], [.3, '#fbefe9'], [1, '#fbd6c3'], [2, '#f4a582'], [2.5, '#e0664f'], [3, '#c62a2e'], [4, '#8f0a28'], [5.5, '#5a0018']],
      ticks: [-5, -2.5, 0, 2.5, 5], label: 'cooler / warmer than 1991–2020:', fmt: v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + (v === 5 ? ' °C' : '') },
    temp: { lo: -2, hi: 36, stops: [[-2, '#f3eef5'], [0, '#cfa9d3'], [2, '#8e3f99'], [3.5, '#5d0d6d'], [5, '#c13bd3'], [7, '#7b3bd0'], [9, '#3a2fa6'], [11, '#2a52b8'], [13, '#6e9fe0'], [15, '#b6e4f4'],
      [17, '#7fc3a6'], [19, '#3f994b'], [21, '#2e8a2b'], [23, '#a8cc5a'], [25, '#f5ee8a'], [27, '#f2a443'], [29, '#d8452a'], [31, '#a2141b'], [32.5, '#5a0a0a'], [34, '#2c0505'], [35, '#8b5b5b'], [36, '#ecdddd']],
      ticks: [0, 5, 10, 15, 20, 25, 30, 35], label: 'sea-surface temperature:', fmt: v => v + (v === 35 ? ' °C' : '') }
  };
  const hex = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
  const colorAt = (S, v) => {
    const st = S.stops; if (v <= st[0][0]) return hex(st[0][1]); if (v >= st[st.length - 1][0]) return hex(st[st.length - 1][1]);
    let i = 1; while (st[i][0] < v) i++;
    const [a, ca] = st[i - 1], [b, cb] = st[i], t = (v - a) / (b - a), A = hex(ca), B = hex(cb);
    return A.map((x, k) => Math.round(x + (B[k] - x) * t));
  };
  const LUTN = 1024;
  Object.values(SCALES).forEach(S => { S.lut = new Uint8Array(LUTN * 3);
    for (let k = 0; k < LUTN; k++) S.lut.set(colorAt(S, S.lo + (S.hi - S.lo) * k / (LUTN - 1)), k * 3); });
  const css = S => v => `rgb(${colorAt(S, v).join(',')})`;

  // ---- data: one character per grid point (see scripts/build_sst_map.py)
  const CH = Array.from({ length: 92 }, (_, i) => String.fromCharCode(35 + i)).filter(c => c !== '\\').join('');
  function decode(s, lo, st) {                         // -> values (NaN = land or sea ice), ice flags
    const v = new Float32Array(s.length), ice = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) { const c = s[i];
      if (c === ' ') v[i] = NaN; else if (c === '!') { v[i] = NaN; ice[i] = 1; } else v[i] = lo + CH.indexOf(c) * st; }
    return { v, ice };
  }
  // a map object: {grid, anom, temp, ice, label}; anom and temp are Float32Arrays
  function makeMap(grid, codes, label) {
    const a = decode(codes.anom, -6, .2), t = decode(codes.temp, -2, .5);
    return { grid, anom: a.v, temp: t.v, ice: a.ice, label };
  }
  const json = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });

  // ---- land mask, 0.25° (1440 × 720, west edge at 180°), filled from the Natural Earth rings
  let landP = null;
  function land() {
    return landP || (landP = json('data/land_110m.json').then(L => {
      const W = 1440, H = 720, c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'); x.fillStyle = '#000';
      L.rings.forEach(r => {
        const p = []; let prev = null;
        for (let i = 0; i < r.length; i += 2) { let lo = r[i]; if (prev != null) lo += Math.round((prev - lo) / 360) * 360; p.push([lo, r[i + 1]]); prev = lo; }
        const back = p[0][0] - p[p.length - 1][0], total = p[p.length - 1][0] - p[0][0] + back - Math.round(back / 360) * 360;
        if (Math.abs(total) > 180) {                   // goes all the way round the globe (Antarctica): close it over the pole
          const pole = p.reduce((s, q) => s + q[1], 0) < 0 ? -90 : 90; p.push([p[p.length - 1][0], pole], [p[0][0], pole]);
        }
        [-360, 0, 360].forEach(sh => { x.beginPath(); p.forEach(([lo, la], k) => { const X = (lo + sh + 180) * 4, Y = (90 - la) * 4; k ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.closePath(); x.fill(); });
      });
      const d = x.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
      for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
      return m;
    }).catch(e => { console.warn('land outline not loaded', e); return null; }));
  }

  const latLab = v => v === 0 ? 'Eq' : Math.abs(v) + '°' + (v < 0 ? 'S' : 'N');
  const lonLab = v => { v = ((Math.round(v) % 360) + 360) % 360; return v === 0 ? '0°' : v < 180 ? v + '°E' : v === 180 ? '180°' : (360 - v) + '°W'; };
  const sg = (v, d = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);

  // value at a point: nearest grid point for the readout; blended (ocean points only) for the picture
  function cell(G, lon, lat) {
    const i = ((Math.round((lon - G.lon0) / G.step) % G.nlon) + G.nlon) % G.nlon, j = Math.max(0, Math.min(G.nlat - 1, Math.round((lat - G.lat0) / G.step)));
    return j * G.nlon + i;
  }

  // ---- boxes drawn on the map: [label, lat south, lat north, lon west °E, lon east °E]
  //      optional 6th item: {dash, lw, below} (dash pattern, line width, label under the box instead of above it)
  const NINO34 = ['Niño 3.4', -5, 5, 190, 240];
  const NINO4 = ['Niño 4', -5, 5, 160, 210, { dash: [2, 3], lw: 1.2, below: true }];
  const NINO3 = ['Niño 3', -5, 5, 210, 270, { dash: [2, 3], lw: 1.2, below: true }];
  const NINO12 = ['Niño 1+2', -10, 0, 270, 280, { dash: [2, 3], lw: 1.2, below: true }];

  function chart(id, o) {
    o = o || {};
    let M = null, kind = o.kind || 'anom', mask = null, cache = null, hov = null;
    land().then(m => { mask = m; cache = null; if (ch && M) ch.draw(); });
    const home = o.home ? fitBox(planeBox(o.home)) : null;

    function paint(ch, a, sx, sy) {
      const s = Math.min(window.devicePixelRatio || 1, 1.5), w = Math.max(1, Math.round((a.right - a.left) * s)), h = Math.max(1, Math.round((a.bottom - a.top) * s));
      const key = [sx.min, sx.max, sy.min, sy.max, w, h, kind, THEME.dark, !!mask, M && M.label].join();
      if (cache && cache.key === key) return cache.c;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'), img = x.createImageData(w, h), px = img.data, S = SCALES[kind], V = M[kind], ICE = M.ice, G = M.grid;
      const LAND = THEME.dark ? [70, 70, 70] : [128, 128, 128], ICEC = THEME.dark ? [196, 204, 212] : [240, 244, 248];
      const k = (LUTN - 1) / (S.hi - S.lo);
      for (let j = 0; j < h; j++) {
        const y = sy.max - (j + .5) / h * (sy.max - sy.min), yy = Math.abs(y) / KY; if (yy > 1) continue;
        const lat = Math.sign(y) * latOfY(yy), xf = KX * tab(RX, Math.abs(lat));
        const gy = (lat - G.lat0) / G.step, j0 = Math.max(0, Math.min(G.nlat - 1, Math.floor(gy))), j1 = Math.min(G.nlat - 1, j0 + 1), fy = Math.max(0, Math.min(1, gy - j0));
        const nj = Math.max(0, Math.min(G.nlat - 1, Math.round(gy))), my = Math.max(0, Math.min(719, Math.floor((90 - lat) * 4)));
        for (let i = 0; i < w; i++) {
          const l = (sx.min + (i + .5) / w * (sx.max - sx.min)) / xf; if (l < -180 || l > 180) continue;
          const lon = ((LON0 + l) % 360 + 360) % 360, q = (j * w + i) * 4; let col;
          if (mask && mask[my * 1440 + Math.min(1439, Math.floor(((lon >= 180 ? lon - 360 : lon) + 180) * 4))]) col = LAND;
          else {
            const gx = (lon - G.lon0) / G.step, f0 = Math.floor(gx), fx = gx - f0, i0 = ((f0 % G.nlon) + G.nlon) % G.nlon, i1 = (i0 + 1) % G.nlon;
            const ni = ((Math.round(gx) % G.nlon) + G.nlon) % G.nlon;
            if (ICE[nj * G.nlon + ni]) col = ICEC;
            else {
              let sw = 0, sv = 0, v, wt;
              v = V[j0 * G.nlon + i0]; wt = (1 - fx) * (1 - fy); if (v === v) { sw += wt; sv += v * wt; }
              v = V[j0 * G.nlon + i1]; wt = fx * (1 - fy); if (v === v) { sw += wt; sv += v * wt; }
              v = V[j1 * G.nlon + i0]; wt = (1 - fx) * fy; if (v === v) { sw += wt; sv += v * wt; }
              v = V[j1 * G.nlon + i1]; wt = fx * fy; if (v === v) { sw += wt; sv += v * wt; }
              if (sw > 1e-6) { const t = Math.max(0, Math.min(LUTN - 1, Math.round((sv / sw - S.lo) * k))) * 3; px[q] = S.lut[t]; px[q + 1] = S.lut[t + 1]; px[q + 2] = S.lut[t + 2]; px[q + 3] = 255; continue; }
              col = ICE[j0 * G.nlon + i0] || ICE[j1 * G.nlon + i1] ? ICEC : LAND;
            }
          }
          px[q] = col[0]; px[q + 1] = col[1]; px[q + 2] = col[2]; px[q + 3] = 255;
        }
      }
      x.putImageData(img, 0, 0);
      cache = { key, c }; return c;
    }

    const line = (ctx, sx, sy, pts) => { ctx.beginPath(); pts.forEach(([lo, la], k) => { const [X, Y] = proj(lo, la); const a = sx.getPixelForValue(X), b = sy.getPixelForValue(Y); k ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); };
    const meridian = (L, n = 60) => Array.from({ length: n + 1 }, (_, k) => [L, -90 + 180 * k / n]);
    const parallel = (la, a = LON0 - 179.999, b = LON0 + 179.999, n = 120) => Array.from({ length: n + 1 }, (_, k) => [a + (b - a) * k / n, la]);

    const plug = { id: 'sstmap',
      beforeDatasetsDraw(ch) {
        if (!M) return;
        const { ctx, chartArea: a, scales: { x: sx, y: sy } } = ch;
        ctx.save(); ctx.beginPath(); ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top); ctx.clip();
        ctx.imageSmoothingEnabled = true; ctx.drawImage(paint(ch, a, sx, sy), a.left, a.top, a.right - a.left, a.bottom - a.top);
        // grid lines and labels: every 30° on the whole map, closer when zoomed in
        const span = sx.max - sx.min, g = span > 200 ? 30 : span > 90 ? 20 : span > 40 ? 10 : 5;
        ctx.strokeStyle = THEME.dark ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.18)'; ctx.lineWidth = .7; ctx.setLineDash([2, 3]);
        for (let la = -90 + g; la < 90; la += g) { line(ctx, sx, sy, parallel(la)); ctx.stroke(); }
        for (let L = Math.ceil((LON0 - 180) / g) * g; L <= LON0 + 180; L += g) { line(ctx, sx, sy, meridian(L)); ctx.stroke(); }
        ctx.setLineDash([]); ctx.strokeStyle = THEME.mut; ctx.lineWidth = 1;
        line(ctx, sx, sy, [...meridian(LON0 - 179.999), ...meridian(LON0 + 179.999).reverse()]); ctx.closePath(); ctx.stroke();
        // boxes (dashed), e.g. Niño 3.4
        (o.boxes || []).forEach(([n, s, nn, w, e, bo]) => {
          bo = bo || {};
          ctx.strokeStyle = THEME.ink; ctx.lineWidth = bo.lw || 1.5; ctx.setLineDash(bo.dash || [5, 3]);
          line(ctx, sx, sy, [...parallel(s, w, e, 20), ...parallel(nn, w, e, 20).reverse()]); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
          const [X, Y] = proj(w, bo.below ? s : nn); ctx.font = (bo.below ? '600 10px' : '600 11px') + ' system-ui,sans-serif'; ctx.fillStyle = THEME.ink;
          ctx.textBaseline = bo.below ? 'top' : 'bottom'; ctx.fillText(n, sx.getPixelForValue(X) + 3, sy.getPixelForValue(Y) + (bo.below ? 2 : -2));
        });
        // labels: latitudes on the left edge, longitudes along the bottom edge (inside the map)
        ctx.font = '10px system-ui,sans-serif'; ctx.fillStyle = THEME.mut;
        const halo = THEME.dark ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.75)';
        const txt = (t, X, Y) => { ctx.strokeStyle = halo; ctx.lineWidth = 3; ctx.strokeText(t, X, Y); ctx.fillText(t, X, Y); };
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        for (let la = -90 + g; la < 90; la += g) {
          const Y = sy.getPixelForValue(proj(LON0, la)[1]); if (Y < a.top + 8 || Y > a.bottom - 8) continue;
          const xl = Math.max(a.left + 3, sx.getPixelForValue(proj(LON0 - 180, la, -180)[0]) + 3); txt(latLab(la), xl, Y);
        }
        const yb = Math.max(sy.min, -KY * .985) + (sy.max - sy.min) * .025, pb = unproj(0, yb), latB = pb ? pb[1] : 0;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        for (let L = Math.ceil((LON0 - 180) / g) * g + g; L < LON0 + 180; L += g) {
          const X = sx.getPixelForValue(proj(L, latB)[0]); if (X < a.left + 18 || X > a.right - 18) continue;
          txt(lonLab(L), X, Math.min(a.bottom - 2, sy.getPixelForValue(proj(L, latB)[1]) - 2));
        }
        if (hov) { const [X, Y] = proj(hov[0], hov[1]); ctx.strokeStyle = THEME.ink; ctx.lineWidth = 2; ctx.strokeRect(sx.getPixelForValue(X) - 4, sy.getPixelForValue(Y) - 4, 8, 8); }
        ctx.restore();
      },
      afterDraw(ch) {                                 // color bar above the map
        const S = SCALES[kind], { ctx, chartArea: a } = ch, w = Math.min(280, a.right - a.left - 150), x0 = a.right - w, y0 = 6, col = css(S);
        if (w < 60) return;
        ctx.save();
        for (let k = 0; k < w; k++) { ctx.fillStyle = col(S.ticks[0] + (S.ticks[S.ticks.length - 1] - S.ticks[0]) * k / (w - 1)); ctx.fillRect(x0 + k, y0, 1.2, 9); }
        ctx.strokeStyle = THEME.mut; ctx.lineWidth = .5; ctx.strokeRect(x0, y0, w, 9);
        ctx.fillStyle = THEME.ink; ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const t0 = S.ticks[0], t1 = S.ticks[S.ticks.length - 1];
        S.ticks.forEach(v => ctx.fillText(S.fmt(v), x0 + (v - t0) / (t1 - t0) * w, y0 + 11));
        ctx.textAlign = 'right'; ctx.fillText(S.label, x0 - 8, y0 + 1); ctx.restore();
      } };

    const zoomed = () => mapView(ch);
    const ch = new Chart(document.getElementById(id), { type: 'scatter', plugins: [plug], data: { datasets: [{ data: [], pointRadius: 0 }] },
      options: { animation: false, maintainAspectRatio: true, aspectRatio: 1.78, layout: { padding: { top: 30 } },
        onHover: (e, el, c) => {
          const { x: sx, y: sy } = c.scales, a = c.chartArea, rd = o.readout || (() => {});
          const p = M && !(e.type === 'mouseout' || e.x < a.left || e.x > a.right || e.y < a.top || e.y > a.bottom) && unproj(sx.getValueForPixel(e.x), sy.getValueForPixel(e.y));
          if (!p) { if (hov) { hov = null; rd(''); c.draw(); } return; }
          const G = M.grid, i = cell(G, p[0], p[1]), L = G.lon0 + (i % G.nlon) * G.step, B = G.lat0 + Math.floor(i / G.nlon) * G.step, t = M.temp[i], an = M.anom[i];
          hov = [L, B];
          rd(`${latLab(Math.round(B * 10) / 10)} ${lonLab(L)}: ` + (M.ice[i] ? 'sea ice' : t !== t ? 'land' :
            kind === 'temp' ? `${t.toFixed(1)} °C` + (an === an ? ` (${sg(an)} °C compared with 1991–2020)` : '') : (an === an ? `${sg(an)} °C compared with 1991–2020` : '') + ` (${t.toFixed(1)} °C)`));
          c.draw();
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false },
          zoom: { limits: { x: { min: FULL.x0, max: FULL.x1, minRange: 12 }, y: { min: FULL.y0, max: FULL.y1, minRange: 6 } },
            // the zoom plugin draws its rectangle before the chart's content by default, where this map would paint
            // over it: draw it last, and in black/white so it shows on any color. The rectangle follows the pointer
            // freely; mapView then widens it to the map's shape, so everything inside it stays in view.
            zoom: { mode: 'xy', drag: { maintainAspectRatio: false, drawTime: 'afterDraw', backgroundColor: 'rgba(255,255,255,.28)', borderColor: THEME.dark ? '#fff' : '#111', borderWidth: 2 }, onZoomComplete: zoomed },
            pan: { mode: 'xy', onPanComplete: zoomed } } },
        scales: { x: { type: 'linear', display: false, min: (home || FULL).x0, max: (home || FULL).x1 }, y: { type: 'linear', display: false, min: (home || FULL).y0, max: (home || FULL).y1 } } } });
    ch.$home = home || FULL; ch.$group = [ch];
    ch.$set = (map, k) => { if (map) M = map; if (k) kind = k; cache = null; hov = null; (o.readout || (() => {}))(''); ch.draw(); };
    ch.$kind = () => kind;
    return ch;
  }

  // a lon/lat box ([lon west °E, lon east °E, lat south, lat north]) as a box in the flat map's coordinates
  function planeBox([w, e, s, n]) {
    const lat0 = s <= 0 && n >= 0 ? 0 : Math.abs(s) < Math.abs(n) ? s : n, lw = lam(w), le = lam(e) <= lw ? lam(e) + 360 : lam(e);
    const x0 = proj(0, lat0, lw)[0], x1 = proj(0, lat0, Math.min(180, le))[0];
    return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: proj(LON0, s)[1], y1: proj(LON0, n)[1] };
  }
  // widen a box to the map's shape (so the map is not stretched) and keep it on the map
  function fitBox(b) {
    let { x0, x1, y0, y1 } = b;
    if ((x1 - x0) / (y1 - y0) < RATIO) { const c = (x0 + x1) / 2, h = (y1 - y0) * RATIO / 2; x0 = c - h; x1 = c + h; }
    else { const c = (y0 + y1) / 2, h = (x1 - x0) / RATIO / 2; y0 = c - h; y1 = c + h; }
    const fit = (a, z, lo, hi) => { const d = Math.min(z - a, hi - lo); if (a < lo) { a = lo; z = lo + d; } if (z > hi) { z = hi; a = hi - d; } return [a, z]; };
    [x0, x1] = fit(x0, x1, FULL.x0, FULL.x1); [y0, y1] = fit(y0, y1, FULL.y0, FULL.y1);
    return { x0, x1, y0, y1 };
  }
  // after a zoom, pan or reset on one map (resetZoom ends up here too: the zoom plugin calls onZoomComplete),
  // or a view button: show the same area, in the map's shape, on every map of its group
  let busy = false;
  function mapView(src, want) {
    if (busy) return; busy = true;
    try {
      const { x, y } = src.scales, b = fitBox(want || { x0: x.min, x1: x.max, y0: y.min, y1: y.max }), H = src.$home;
      const home = Math.abs(b.x0 - H.x0) + Math.abs(b.x1 - H.x1) + Math.abs(b.y0 - H.y0) + Math.abs(b.y1 - H.y1) < .5;
      const zs = Chart.defaults.plugins.zoom && Chart.defaults.plugins.zoom.zoom && Chart.defaults.plugins.zoom.zoom.onZoomComplete;
      src.$group.forEach(c => { if (home) c.resetZoom('none'); else { c.zoomScale('x', { min: b.x0, max: b.x1 }, 'none'); c.zoomScale('y', { min: b.y0, max: b.y1 }, 'none'); } if (zs) zs({ chart: c }); });
      (src.$onview || (() => {}))(home ? 'home' : null);
    } finally { busy = false; }
  }
  // maps that always show the same area, and buttons (data-v = a key of views) that move them
  function link(charts, buttons, views, homeKey) {
    charts.forEach(c => { c.$group = charts; });
    const bs = buttons ? [...document.querySelectorAll(buttons)] : [];
    const mark = v => bs.forEach(b => b.classList.toggle('on', b.dataset.v === v));
    charts.forEach(c => { c.$onview = v => { mark(v === 'home' ? homeKey : null); }; });
    bs.forEach(b => b.onclick = () => { const v = views[b.dataset.v]; mapView(charts[0], v ? planeBox(v) : FULL); mark(b.dataset.v); });
  }

  window.SSTMap = { chart, link, makeMap, json, NINO34, NINO4, NINO3, NINO12, planeBox };
})();
