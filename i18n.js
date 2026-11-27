// Translations. Pages are written in English; this file swaps the text for another language in the browser.
// Load it in <head>, before anything else that writes text (it must run before site.js).
//
// How it works
//  - The language comes from ?lang=xx in the link, else from the reader's earlier choice (stored in this
//    browser), else English. English does nothing at all.
//  - The dictionary (i18n/<lang>.js) maps English text to the translation. Keys are written the way this
//    file normalizes text: whitespace collapsed, numbers and month/day names replaced by {0}, {1}, ...
//    so "+1.45 °C above 1850–1900" is stored as "{0} °C above {1}–{2}" and works for any number.
//    In a translation, {0} gives the number in local style (1,45) or the month in that language;
//    {0:raw} gives it exactly as in English (for names such as Niño 3.4).
//  - Text on the page: every "block" (an element holding only text and inline tags, like a paragraph, heading,
//    button or table cell) is looked up as a whole, so word order can change. Text added later by the page's
//    scripts is caught too. An element with an id inside a block is left alone (scripts fill it in) and is
//    translated as its own block.
//  - Text drawn in charts (titles, axes, labels, tooltips) is translated where it is drawn on the canvas.
//  - Anything without a translation stays in English. ?i18n=missing lists those in the browser console
//    (window.EI_MISSING), so new text can be added to the dictionary.
(function () {
  const LANGS = { en: 'English', nl: 'Nederlands' };
  // false: the language button only shows for readers who opened a page with ?lang=xx once (used while building a
  // translation). true: everyone sees it (Dutch went live on 26 Nov 2026).
  const PUBLIC = true;
  const QS = new URLSearchParams(location.search);
  let lang = (QS.get('lang') || '').toLowerCase();
  if (!LANGS[lang]) { try { lang = localStorage.getItem('ei-lang') || ''; } catch (e) { lang = ''; } }
  else if (!QS.has('embed')) { try { localStorage.setItem('ei-lang', lang); } catch (e) {} }
  // No link or earlier choice: the browser's own language list, first match (a Dutch browser gets Dutch). A choice of
  // English is stored too, so the button always wins over the browser setting.
  if (!LANGS[lang]) lang = ((navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''])
    .map(l => String(l).toLowerCase().split('-')[0]).find(l => LANGS[l])) || 'en';
  window.EI_LANG = lang;
  window.EI_LANG_BUTTON = PUBLIC || lang !== 'en' || QS.has('lang') || (() => { try { return localStorage.getItem('ei-lang-seen') === '1'; } catch (e) { return false; } })();
  if (window.EI_LANG_BUTTON && !PUBLIC) { try { localStorage.setItem('ei-lang-seen', '1'); } catch (e) {} }
  window.EI_LANGS = LANGS;
  window.EI_T = s => s;                           // pages may call EI_T(text); identity in English
  window.EI_SETLANG = l => {                      // used by the language button in the site header
    try { localStorage.setItem('ei-lang', l); } catch (e) {}
    const u = new URL(location.href); u.searchParams.delete('lang'); location.href = u.toString();
  };
  if (lang === 'en') return;

  document.documentElement.lang = lang;
  // the dictionary, loaded right now (before the page body), so text is translated as it appears
  document.write('<script src="i18n/' + lang + '.js"><\/script>');

  const MONTHS = 'January February March April May June July August September October November December'.split(' ');
  const DAYS = 'Monday Tuesday Wednesday Thursday Friday Saturday Sunday'.split(' ');
  const LOCAL = {
    nl: { months: 'januari februari maart april mei juni juli augustus september oktober november december'.split(' '),
          mon: 'jan feb mrt apr mei jun jul aug sep okt nov dec'.split(' '),
          days: 'maandag dinsdag woensdag donderdag vrijdag zaterdag zondag'.split(' '),
          dec: ',', thou: '.', ord: 'e' },
  }[lang];

  // tokens: numbers (with optional sign; 1,234.5 style), month and weekday names
  const NUM = '[+\\-−±]?(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
  const MON = '(?:January|February|March|April|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)';
  const DAY = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';   // not Mon/Sun...: 'The Sun' is a page
  const TOK = new RegExp(
    '(?<![\\p{L}])(' + MON + ' \\d{1,2}(?:, \\d{4})?)(?![\\p{L}\\p{N}])(?![.,]\\d)' +   // 1 date: Nov 23 / Nov 23, 2026 (not Jan 0.96)
    '|(?<![\\p{L}\\p{N}/])(\\d{4}/\\d{2})(?![\\p{N}/])' +                                     //   or a month: 2025/10
    '|(?<![\\p{L}\\p{N}_.,:/])(\\d+(?:st|nd|rd|th))(?![\\p{L}\\p{N}])' +                  // 2 ordinal: 82nd
    '|(?<![\\p{L}\\p{N}_.,:/])(' + NUM + ')(?!\\.\\d)(?!(?![MkK](?![\\p{L}\\p{N}]))[\\p{L}\\p{N}_/])' +   // 3 number (13.98M: number + M)
    '|(?<![\\p{L}])(' + MON + '|' + DAY + ')(?![\\p{L}])', 'gu');                        // 4 month or day name

  const fmtNum = s => {
    if (!/[.,]/.test(s)) return s;
    return s.replace(/,/g, '\u0001').replace(/\./g, LOCAL.dec).replace(/\u0001/g, LOCAL.thou);
  };
  const fmtDate = s => {
    const m = s.match(/^(\p{L}+) (\d{1,2})(?:, (\d{4}))?$/u); if (!m) return s;
    const full = MONTHS.indexOf(m[1]) >= 0 && m[1].length > 4;
    const i = MONTHS.findIndex(x => x.slice(0, 3) === m[1].slice(0, 3));
    return m[2] + ' ' + (full ? LOCAL.months[i] : LOCAL.mon[i]) + (m[3] ? ' ' + m[3] : '');
  };
  const fmtOrd = s => s.replace(/(st|nd|rd|th)$/, LOCAL.ord);
  const fmtWord = s => {
    let i = MONTHS.indexOf(s); if (i >= 0) return LOCAL.months[i];
    i = MONTHS.findIndex(m => m.slice(0, 3) === s.slice(0, 3)); if (i >= 0 && s.length <= 4) return LOCAL.mon[i];
    i = DAYS.indexOf(s); if (i >= 0) return LOCAL.days[i];
    return s;
  };
  // text (no tags) -> [key, values]
  // each value remembers its kind: d(ate), o(rdinal), n(umber), w(ord)
  // a number right after "Niño" is a name (Niño 3.4, Niño 1+2): kept exactly as it is
  const tokText = (s, vals) => s.replace(TOK, (m, d, ym, o, n, w, off, str) => {
    const name = n && /Niño (?:\d+\+)?$/.test(str.slice(Math.max(0, off - 9), off));
    vals.push({ v: m, k: d ? 'd' : ym || name ? 'r' : o ? 'o' : n ? 'n' : 'w' }); return '{' + (vals.length - 1) + '}'; });
  const fmtVal = x => x.k === 'r' ? x.v : x.k === 'd' ? fmtDate(x.v) : x.k === 'o' ? fmtOrd(x.v) : x.k === 'n' ? fmtNum(x.v) : fmtWord(x.v);
  const fill = (tr, vals) => tr.replace(/\{(\d+)(:raw)?\}/g, (m, i, raw) => {
    const x = vals[+i]; if (x == null) return m;
    return raw ? x.v : fmtVal(x);
  });
  const onlyTokens = k => !/\p{L}/u.test(k.replace(/<[^>]*>/g, '').replace(/\{\d+\}/g, ''));
  const norm = s => s.replace(/\s+/g, ' ').trim();

  let DICT = null;
  const dict = () => DICT || (DICT = window.EI_DICT || null);
  const missing = new Set();
  const COLLECT = QS.get('i18n') === 'missing';
  window.EI_MISSING = missing;

  // keys with {*}: the fixed part is translated, the variable part ({*}) sentence by sentence (names stay as they are)
  let WILD = null, quiet = false;          // quiet: a name list inside a {*} is not 'missing'
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function wild(k, vals) {
    const d = dict(); if (!d) return null;
    if (!WILD) WILD = Object.keys(d).filter(x => x.includes('{*}')).map(x => [new RegExp('^' + esc(x).replace('\\{\\*\\}', '([\\s\\S]*?)') + '$'), d[x]]);
    for (const [re, tr] of WILD) {
      const m = k.match(re); if (!m) continue;
      const eng = m[1].replace(/\{(\d+)\}/g, (x, i) => vals[+i] ? vals[+i].v : x);
      const part = eng.split(/(?<=[.!?])\s+/).map(p => { quiet = true; const t = tPlain(p); quiet = false; return t != null ? t : p.replace(TOK, (x, d1, ym, o, n) => n ? fmtNum(x) : x); }).join(' ');
      return fill(tr.replace('{*}', '\u0000'), vals).replace('\u0000', part);
    }
    return null;
  }
  // translate plain text (no markup); returns null if there is no translation
  const cache = new Map();
  const outs = new Set();                           // everything we have written (so copies of it are left alone)
  function tPlain(s) {
    if (cache.has(s)) return cache.get(s);
    if (outs.has(norm(s))) return s;
    const d = dict(); if (!d) return null;
    const n = norm(s); let out = null;
    if (d[n] != null) out = d[n];
    else {
      const vals = []; const k = tokText(n, vals);
      if (d[k] != null) out = fill(d[k], vals);
      else if (onlyTokens(k)) out = vals.length ? fill(k, vals) : null;
      else if ((out = wild(k, vals)) == null && COLLECT && !quiet) missing.add(k);
    }
    if (out != null && s !== n) {                  // keep the original's leading/trailing spaces
      const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0]; out = lead + out + trail;
    }
    if (cache.size > 5000) cache.clear();
    cache.set(s, out); if (out != null) { outs.add(norm(out)); cache.set(out, out); }
    return out;
  }
  window.EI_T = s => { const t = tPlain(String(s)); return t == null ? s : t; };

  // ---- page text
  const INLINE = new Set(['A', 'ABBR', 'B', 'BR', 'CODE', 'EM', 'I', 'MARK', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'WBR', 'Q', 'CITE', 'DFN', 'KBD', 'VAR', 'BDI', 'BDO', 'DATA']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'CANVAS', 'SVG', 'svg', 'INPUT', 'SELECT', 'IFRAME', 'TEMPLATE']);
  const OPAQUE = new Set(['SVG', 'IMG']);          // icons inside a button or link: kept as they are
  const tagU = el => el.tagName.toUpperCase();
  const isIsland = el => (el.id || el.hasAttribute('data-k')) && !el.hasAttribute('data-i18n-in');   // own block: scripts write into it
  const skipped = el => !!el.closest('[data-i18n="off"],[translate="no"]');
  // an element whose content is only text and inline elements (islands count as inline)
  function inlineOnly(el) {
    for (const c of el.children) {
      if (OPAQUE.has(tagU(c)) || isIsland(c)) continue;
      if (!INLINE.has(c.tagName) || !inlineOnly(c)) return false;
    }
    return true;
  }
  // serialize content, with islands' content left out and numbers/months tokenized
  function keyOf(el, vals) {
    let out = '';
    for (const c of el.childNodes) {
      if (c.nodeType === 3) out += tokText(c.data.replace(/[<>&]/g, x => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[x])), vals);
      else if (c.nodeType === 1) {
        const open = startTag(c);
        if (c.tagName === 'BR' || c.tagName === 'WBR') out += open;
        else out += open + (isIsland(c) || OPAQUE.has(tagU(c)) ? '' : keyOf(c, vals)) + '</' + c.tagName.toLowerCase() + '>';
      }
    }
    return out;
  }
  const startTag = e => '<' + e.tagName.toLowerCase() + (e.id ? ' id="' + e.id + '"' : '') + (e.hasAttribute('data-k') ? ' data-k="' + e.getAttribute('data-k') + '"' : '') + '>';
  const done = new WeakMap();                       // element -> the content we last wrote
  // put translated markup into el, keeping el's own child elements (scripts may hold on to them)
  function apply(el, html) {
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    const olds = [...el.children], used = new Set();
    const swap = (frag) => {
      for (const f of [...frag.children]) {
        const st = startTag(f);
        const o = olds.find(x => !used.has(x) && startTag(x) === st);
        if (o) {
          used.add(o);
          if (!isIsland(o) && o.tagName !== 'BR' && !OPAQUE.has(tagU(o))) { swapInto(o, f); }
          f.replaceWith(o);
        }
      }
    };
    const swapInto = (o, f) => {                    // o's content becomes f's content, keeping o's children
      const innerOld = [...o.children]; olds.push(...innerOld);
      swap(f);
      o.replaceChildren(...f.childNodes);
    };
    swap(tpl.content);
    el.replaceChildren(...tpl.content.childNodes);
  }
  const src = new WeakMap();                        // element -> its English content (before we translated it)
  function doBlock(el) {
    const cur = el.innerHTML, last = done.get(el);
    if (last === cur) return;
    const d = dict(); if (!d) return;
    let host = el;
    if (last != null && src.has(el) && cur.length > last.length && (cur.startsWith(last) || cur.endsWith(last))) {
      // a script added text to a block we already translated: translate English + addition as one
      const add = cur.startsWith(last) ? cur.slice(last.length) : cur.slice(0, cur.length - last.length);
      host = document.createElement('div');
      host.innerHTML = cur.startsWith(last) ? src.get(el) + add : add + src.get(el);
    } else if (outs.has(norm(el.textContent))) { done.set(el, cur); return; }
    const vals = []; const k = norm(keyOf(host, vals));
    let tr = d[k];
    if (tr == null && onlyTokens(k)) {               // just numbers/dates (or only islands): local style, nothing to look up
      if (vals.some(x => x.k !== 'n' || /[.,]/.test(x.v))) tr = k; else { done.set(el, el.innerHTML); return; }
    }
    let html = tr != null ? fill(tr, vals) : wild(k, vals);
    if (html == null) { if (COLLECT && k) missing.add(k); done.set(el, el.innerHTML); return; }
    if (!src.has(el) || host !== el) src.set(el, host.innerHTML);
    if (host !== el) el.innerHTML = host.innerHTML;     // back to English first, so apply() finds the original elements
    apply(el, html);
    done.set(el, el.innerHTML); outs.add(norm(el.textContent));
  }
  function attrs(el) {
    for (const a of ['title', 'aria-label', 'placeholder', 'alt']) {
      const v = el.getAttribute(a); if (!v || !/\p{L}/u.test(v)) continue;
      const t = tPlain(v); if (t != null && t !== v) el.setAttribute(a, t);
    }
    if (el.tagName === 'META' && /^(description|og:description|og:title|twitter:title|twitter:description)$/.test(el.getAttribute('name') || el.getAttribute('property') || '')) {
      const v = el.getAttribute('content'); const t = v && tPlain(v); if (t) el.setAttribute('content', t);
    }
  }
  // find the blocks in a subtree (or the block an element belongs to)
  function scan(root) {
    if (!dict()) return;
    if (root.nodeType === 3) root = root.parentElement;
    if (!root || root.nodeType !== 1 || SKIP.has(root.tagName) || skipped(root)) return;
    // the block this element sits in
    let b = root;
    while (b.parentElement && !isIsland(b) && INLINE.has(b.tagName) && inlineOnly(b.parentElement) && !SKIP.has(b.parentElement.tagName)) b = b.parentElement;
    const walk = el => {
      if (SKIP.has(el.tagName) || el.getAttribute('data-i18n') === 'off' || el.getAttribute('translate') === 'no') return;
      attrs(el);
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.data.trim());
      if (el.textContent.trim() && inlineOnly(el) && (own || el.children.length < 2)) {
        doBlock(el);
        el.querySelectorAll('[id]').forEach(x => { if (isIsland(x)) walk(x); });
        el.querySelectorAll('[title],[aria-label],[alt]').forEach(attrs);
        return;
      }
      for (const c of el.children) walk(c);
    };
    walk(b);
  }
  let queue = new Set(), sched = false;
  const flush = () => { sched = false; const q = queue; queue = new Set(); for (const n of q) if (n.isConnected) scan(n); };
  const mo = new MutationObserver(recs => {
    for (const r of recs) {
      if (r.type === 'childList') {
        let inl = false;
        for (const n of r.addedNodes) { queue.add(n); if (n.nodeType === 3 || INLINE.has(n.tagName)) inl = true; }
        for (const n of r.removedNodes) if (n.nodeType === 3 || INLINE.has(n.tagName)) inl = true;
        if (inl) queue.add(r.target);
      }
      else if (r.type === 'characterData') queue.add(r.target);
      else if (r.type === 'attributes') queue.add(r.target);
    }
    if (!sched) { sched = true; queueMicrotask(flush); }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder', 'alt'] });
  document.addEventListener('DOMContentLoaded', () => { scan(document.documentElement); });
  window.EI_RESCAN = () => scan(document.documentElement);

  // ---- text drawn on canvases (Chart.js: titles, ticks, labels, legends, tooltips)
  const C2D = CanvasRenderingContext2D.prototype;
  const ft = C2D.fillText, st = C2D.strokeText, mt = C2D.measureText;
  const tc = s => { if (typeof s !== 'string' || !s) return s; const t = tPlain(s); return t == null ? s : t; };
  C2D.fillText = function (s, ...a) { return ft.call(this, tc(s), ...a); };
  C2D.strokeText = function (s, ...a) { return st.call(this, tc(s), ...a); };
  C2D.measureText = function (s) { return mt.call(this, tc(s)); };
})();
