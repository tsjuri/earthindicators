#!/usr/bin/env python3
"""One share link per chart, with that chart as its link preview (like build_claim_cards.py does for claims).

X, Bluesky and others ignore the #part of a link and show one card per page. This script opens every data page in
a headless browser (Chromium, via Playwright), the same way a reader sees it in the light theme, and for every box
that holds a chart makes:
  og/s/<page>-<canvas id>.jpg   1200x630 preview: the chart as drawn on the site, with the site name above it
                                (JPEG, about a third of the size of a PNG, to keep the repository's history small)
  s/<page>-<canvas id>.html     a tiny page whose preview tags show that chart and its title; people who open it
                                are sent straight on to <page>.html#<box id>
Charts with switches (a page-wide region, or the chart's own region/baseline/band buttons) also get one preview
and share page per combination of settings: s/<page>-<canvas id>_<code>.html, where <code> is the selected button's
position in each switch, page-wide ones first, as site.js writes it (e.g. air-c1_3.0 = 4th region, 1st button of the
chart's own switch). The default settings keep the plain name. s/variants.json lists every variant, so site.js only
links to previews that exist. The "Copy link to this chart" buttons (site.js) copy the s/... link. Charts whose box is hidden (for example
because its data did not load) are skipped; files for charts that no longer exist are removed.

Run from the repo root: python scripts/build_chart_cards.py
  --libs DIR   serve the cdnjs chart libraries from local copies in DIR (only for testing without internet)
  --pages LIST only these pages, comma-separated (e.g. ch4.html,co2.html); other pages' share files are left alone
"""
import hashlib
import functools, html, io, itertools, json, os, re, sys, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image, ImageDraw, ImageFont

SITE = "https://earthindicators.org"
SKIP = {"index.html", "claims.html", "methods.html"}
W, H, HEAD = 1200, 630, 74
MAXV = 40   # most variants made for one chart; more combinations than this are linked without their own preview

# the same switch code as site.js: index of the selected button per switch, page-wide switches first
JS_SEGS = """box => (box.hasAttribute('data-own-switches') ? [] : [...document.querySelectorAll('main .seg')].filter(g => !g.closest('.box'))).concat([...box.querySelectorAll('.seg')])"""
JS_CODE = "box => (" + JS_SEGS + ")(box).map(g => [...g.querySelectorAll('.nb')].findIndex(b => b.classList.contains('on'))).join('.')"
UMBER, MUTED = (51, 43, 25), (95, 99, 104)


def pages():
    out = []
    for f in sorted(os.listdir(".")):
        if f.endswith(".html") and f not in SKIP:
            s = open(f, encoding="utf-8").read()
            if "<canvas" in s and "site.js" in s:
                out.append(f)
    return out


def serve():
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=os.getcwd()))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]


def font(path, size):
    for p in (path, "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()


def card(png):
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    logo = Image.open("img/logo-240.png").convert("RGBA").resize((52, 52))
    img.paste(logo, (28, 11), logo)
    d.text((92, 14), "Earth Indicators", font=font("fonts/PoiretOne-Regular.ttf", 36), fill=UMBER)
    f2 = font("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
    t = "earthindicators.org"
    d.text((W - 28 - d.textlength(t, font=f2), 26), t, font=f2, fill=MUTED)
    shot = Image.open(io.BytesIO(png)).convert("RGB")
    k = min((W - 40) / shot.width, (H - HEAD - 12) / shot.height)
    shot = shot.resize((round(shot.width * k), round(shot.height * k)), Image.LANCZOS)
    img.paste(shot, ((W - shot.width) // 2, HEAD + (H - HEAD - 12 - shot.height) // 2))
    return img


def share_page(name, title, desc, target, ver):
    # ?v=<fingerprint of the image>: a new address whenever the picture changes, so X, WhatsApp, Facebook etc.
    # fetch the new preview instead of showing the one they cached the first time the link was shared
    e = lambda x: html.escape(x, quote=True)
    url, img = f"{SITE}/s/{name}.html?v={ver}", f"{SITE}/og/s/{name}.jpg?v={ver}"
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)} | Earth Indicators</title>
<meta name="robots" content="noindex">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Earth Indicators">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{img}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="{W}">
<meta property="og:image:height" content="{H}">
<meta property="og:image:alt" content="Chart: {e(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="description" content="{e(desc)}">
<script>location.replace('../{target}'+(/^#[0-9.]+$/.test(location.hash)?'~'+location.hash.slice(1):''))</script>
<style>body{{font:17px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px}}</style>
</head><body>
<p><a href="../{target}">{e(title)}: see the chart on Earth Indicators</a></p>
</body></html>
"""


def main():
    from playwright.sync_api import sync_playwright
    libs = sys.argv[sys.argv.index("--libs") + 1] if "--libs" in sys.argv else None
    only = sys.argv[sys.argv.index("--pages") + 1] if "--pages" in sys.argv else ""
    only = {x.strip() if x.strip().endswith(".html") else x.strip() + ".html" for x in only.split(",") if x.strip()}
    todo = [f for f in pages() if not only or f in only]
    if only and not todo:
        sys.exit(f"none of these are chart pages: {', '.join(sorted(only))}")
    port = serve()
    os.makedirs("s", exist_ok=True); os.makedirs("og/s", exist_ok=True)
    made, variants, versions = set(), set(), {}
    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(viewport={"width": 1100, "height": 900}, device_scale_factor=1.25)
        ctx.add_init_script("try{localStorage.setItem('ei-theme','light')}catch(e){}")
        if libs:
            ctx.route(re.compile(r"https://cdnjs\.cloudflare\.com/.*"),
                      lambda r: r.fulfill(path=os.path.join(libs, r.request.url.rsplit("/", 1)[-1])))
        ctx.route(re.compile(r"https://gc\.zgo\.at/.*|https://.*goatcounter.*"), lambda r: r.abort())   # no visits counted
        for f in todo:
            pg = ctx.new_page()
            try:
                pg.goto(f"http://127.0.0.1:{port}/{f}", wait_until="networkidle", timeout=90000)
            except Exception as ex:
                print(f"{f}: page did not finish loading ({str(ex)[:120]}); using what is there", flush=True)
            pg.wait_for_timeout(2500)
            pg.add_style_tag(content=".cbar,.zreset,.secnav,#totop,.box > p{display:none!important}")   # chart and title only, no notes
            desc = pg.evaluate("(document.querySelector('meta[name=description]')||{}).content||''")
            boxes = pg.evaluate("""() => [...document.querySelectorAll('main .box')].map(b => {
                const c = b.querySelector('canvas[id]'), h = b.querySelector('h2');
                return c && {cid: c.id, id: b.id, title: h ? h.textContent.trim() : '', shown: b.offsetParent !== null && b.getClientRects().length > 0};
              }).filter(Boolean)""")
            stem = f[:-5]
            inflight = [0]
            pg.on("request", lambda r: inflight.__setitem__(0, inflight[0] + 1))
            for ev in ("requestfinished", "requestfailed"):
                pg.on(ev, lambda r: inflight.__setitem__(0, max(0, inflight[0] - 1)))

            def settle():
                """after a click: wait for any data it loads, then for the charts to be redrawn"""
                pg.wait_for_timeout(250)
                t = time.time()
                while inflight[0] and time.time() - t < 30:
                    pg.wait_for_timeout(100)
                pg.wait_for_timeout(250)

            def boxes_now():
                return pg.evaluate("""() => [...document.querySelectorAll('main .box')].map((b, i) => {
                    const c = b.querySelector('canvas[id]'), h = b.querySelector('h2');
                    return c && {i, cid: c.id, id: b.id, title: h ? h.textContent.trim() : '', ownOnly: b.hasAttribute('data-own-switches'),
                                 shown: b.offsetParent !== null && b.getClientRects().length > 0,
                                 code: (""" + JS_CODE + """)(b),
                                 own: [...b.querySelectorAll('.seg')].map(g => [...g.querySelectorAll('.nb')].map(x => !x.hidden))};
                  }).filter(Boolean)""")

            def click(sel_js):   # sel_js: JS expression returning the button to click (or null)
                done = pg.evaluate("() => { const b = " + sel_js + "; if (b && !b.hidden && !b.classList.contains('on')) { b.click(); return true } return false }")
                if done:
                    settle()

            page_segs = pg.evaluate("""() => [...document.querySelectorAll('main .seg')].filter(g => !g.closest('.box'))
                .map(g => [...g.querySelectorAll('.nb')].map(x => !x.hidden))""")
            page_default = pg.evaluate("""() => [...document.querySelectorAll('main .seg')].filter(g => !g.closest('.box'))
                .map(g => [...g.querySelectorAll('.nb')].findIndex(b => b.classList.contains('on')))""")
            defaults = {b["cid"]: b["code"] for b in boxes_now()}
            page_combos = [tuple(page_default)] + [c for c in itertools.product(*[[k for k, ok in enumerate(g) if ok] for g in page_segs])
                                                     if c != tuple(page_default)]

            def set_page(combo):
                for gi, k in enumerate(combo):
                    click(f"[...document.querySelectorAll('main .seg')].filter(g => !g.closest('.box'))[{gi}].querySelectorAll('.nb')[{k}]")

            def shoot(b, code):
                name = f"{stem}-{b['cid']}" if code == defaults.get(b["cid"]) else f"{stem}-{b['cid']}_{code}"
                if name in made or "-1" in code.split("."):
                    return
                el = pg.locator(f"canvas#{b['cid']}").locator("xpath=ancestor::div[contains(concat(' ',normalize-space(@class),' '),' box ')][1]")
                el.scroll_into_view_if_needed(); pg.wait_for_timeout(150)
                title = pg.evaluate(f"() => (document.querySelectorAll('main .box')[{b['i']}].querySelector('h2') || {{}}).textContent || ''").strip()
                card(el.screenshot()).save(f"og/s/{name}.jpg", quality=85, optimize=True, progressive=True)
                versions[name] = hashlib.sha1(open(f"og/s/{name}.jpg", "rb").read()).hexdigest()[:8]
                anchor = b["id"] or "ch-" + b["cid"]
                with open(f"s/{name}.html", "w", encoding="utf-8") as fh:
                    fh.write(share_page(name, title or b["title"], desc, f"{f}#{anchor}" + ("" if name == f"{stem}-{b['cid']}" else f"~{code}"), versions[name]))
                made.add(name)
                if name != f"{stem}-{b['cid']}":
                    variants.add(name)

            for pc in page_combos[:MAXV]:
                set_page(pc)
                for b in boxes_now():
                    if not b["shown"] or not b["title"]:
                        continue
                    if b["ownOnly"] and pc != page_combos[0]:   # the page-wide switches do not change this chart
                        continue
                    own = [[k for k, ok in enumerate(g) if ok] for g in b["own"]]
                    combos = list(itertools.product(*own)) if own else [()]
                    if len(combos) * (1 if b["ownOnly"] else len(page_combos)) > MAXV:
                        combos = combos[:max(1, MAXV // len(page_combos))]
                    start = [int(x) for x in b["code"].split(".")[0 if b["ownOnly"] else len(pc):]] if own else []
                    for oc in combos:
                        for gi, k in enumerate(oc):
                            click(f"document.querySelectorAll('main .box')[{b['i']}].querySelectorAll('.seg')[{gi}].querySelectorAll('.nb')[{k}]")
                        now = next((x for x in boxes_now() if x["i"] == b["i"]), None)
                        if now and now["shown"]:
                            shoot(now, now["code"])
                    for gi, k in enumerate(start):   # back to how this chart was
                        click(f"document.querySelectorAll('main .box')[{b['i']}].querySelectorAll('.seg')[{gi}].querySelectorAll('.nb')[{k}]")
            set_page(page_combos[0])
            print(f"{f}: {sum(1 for m in made if m.startswith(stem + '-'))} charts", flush=True)
            pg.close()
        br.close()
    if not made or (not only and len(made) < 10):
        sys.exit(f"only {len(made)} charts captured; keeping the previous share files")
    for x in os.listdir("og/s"):              # the earlier PNG previews
        if x.endswith(".png") and (not only or x.rsplit("-", 1)[0] + ".html" in todo):
            os.remove(os.path.join("og/s", x))
    for d, ext in (("s", ".html"), ("og/s", ".jpg")):
        for x in os.listdir(d):
            if x.endswith(ext) and x[:-len(ext)] not in made and (not only or x.rsplit("-", 1)[0] + ".html" in todo):
                os.remove(os.path.join(d, x))
    # list of variant share pages, read by site.js (kept for pages not redrawn in this run)
    vf, keep = "s/variants.json", []
    if only and os.path.exists(vf):
        keep = [v for v in json.load(open(vf)) if v.rsplit("-", 1)[0].split("_")[0] + ".html" not in todo]
    with open(vf, "w") as fh:
        json.dump(sorted(set(keep) | variants), fh, separators=(",", ":"))
    # image fingerprint per share link, read by site.js to put ?v=... on the copied link (kept for pages not redrawn)
    hf, old = "s/versions.json", {}
    if only and os.path.exists(hf):
        old = {k: v for k, v in json.load(open(hf)).items() if k.rsplit("-", 1)[0] + ".html" not in todo}
    with open(hf, "w") as fh:
        json.dump(dict(sorted({**old, **versions}.items())), fh, separators=(",", ":"))
    print(f"{len(made)} chart share links ({len(variants)} of them for other switch settings)")


if __name__ == "__main__":
    main()
