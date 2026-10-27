#!/usr/bin/env python3
"""Cut company logos out of their background squares so they can float on the page.

Logos from LinkedIn come as 200x200 pictures with the background baked in (ING's
orange, Nike's black). This finds that background from the picture's border and
makes it transparent with soft edges. A light mark on a colored background (the
white Nike swoosh on black) is recolored to the background color, so it still shows
on a light page. Pictures whose background is not one flat color are reported, not
guessed at.

Usage: python3 scripts/make_logos.py [employer ...]    # no names = every employer
"""
import io, json, math, os, sys, urllib.request, hashlib
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAP = os.path.join(ROOT, "src/lib/company-logos.json")          # employer -> source url (kept as the source of truth)
OUT_MAP = os.path.join(ROOT, "src/lib/company-logos-local.json")  # employer -> /logos/<file>.png, or the source url when it could not be cut out (the only map the app reads)
OUT_DIR = os.path.join(ROOT, "public/logos")
MAX_SIDE = 256


def lum(c):
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255


def dist(a, b):
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=30).read()))


def smooth(x, lo, hi):
    if x <= lo:
        return 0.0
    if x >= hi:
        return 1.0
    t = (x - lo) / (hi - lo)
    return t * t * (3 - 2 * t)


def cutout(img):
    """Returns (RGBA image, note) or (None, reason)."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    # Already transparent (site icons): just trim.
    corners = [px[0, 0][3], px[w - 1, 0][3], px[0, h - 1][3], px[w - 1, h - 1][3]]
    if max(corners) < 40:
        return trim(img), "already transparent"
    # Composite on white for the colour maths.
    flat = Image.new("RGB", (w, h), (255, 255, 255))
    flat.paste(img, mask=img.split()[3])
    fp = flat.load()
    border = [fp[x, 0] for x in range(w)] + [fp[x, h - 1] for x in range(w)] + [fp[0, y] for y in range(h)] + [fp[w - 1, y] for y in range(h)]
    rs = sorted(c[0] for c in border)
    gs = sorted(c[1] for c in border)
    bs = sorted(c[2] for c in border)
    B = (rs[len(rs) // 2], gs[len(gs) // 2], bs[len(bs) // 2])
    near = sum(1 for c in border if dist(c, B) < 36) / len(border)
    if near < 0.85:
        res, note = adaptive(img)
        if res is None:
            res, note = picture(img)
        return res, note
    light_bg = lum(B) > 0.82
    dmap = [[dist(fp[x, y], B) for x in range(w)] for y in range(h)]
    # Background mask: everything near B and connected to the border; for a light
    # background also the enclosed bits (the hole in an 'o' is white on white anyway).
    thr = 42
    bg = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if dmap[y][x] < thr and not bg[y][x]:
                bg[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if dmap[y][x] < thr and not bg[y][x]:
                bg[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and not bg[ny][nx] and dmap[ny][nx] < thr:
                    bg[ny][nx] = True
                    q.append((nx, ny))
    if light_bg:
        for y in range(h):
            for x in range(w):
                if dmap[y][x] < thr:
                    bg[y][x] = True
    # Mean colour of the solid foreground.
    fg = [fp[x, y] for y in range(h) for x in range(w) if not bg[y][x] and dmap[y][x] > 90]
    if len(fg) < 30:
        fg = [fp[x, y] for y in range(h) for x in range(w) if not bg[y][x]]
    if len(fg) < 30:
        return None, "nothing left after removing the background"
    F = tuple(sum(c[i] for c in fg) // len(fg) for i in range(3))
    knockout = (not light_bg) and lum(F) > 0.78   # light mark on a coloured or dark square
    span = max(dist(F, B), 1)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            if bg[y][x]:
                # Soft edge: pixels just outside the threshold fade in.
                continue
            d = dmap[y][x]
            a = smooth(d, 20, 75)
            if a <= 0:
                continue
            if knockout:
                a = min(1.0, d / span)
                op[x, y] = (B[0], B[1], B[2], int(255 * a))
            else:
                r, g, b = fp[x, y]
                op[x, y] = (r, g, b, int(255 * a))
    # Anti-alias the hard mask edge a little.
    return trim(out), ("light mark recoloured to the brand colour" if knockout else "background removed")


def adaptive(img):
    """For a background that is a smooth gradient, not one flat colour: grow the background inwards from the border, step by step, stopping at any sharp edge."""
    img = img.convert("RGBA")
    w, h = img.size
    flat = Image.new("RGB", (w, h), (255, 255, 255))
    flat.paste(img, mask=img.split()[3])
    fp = flat.load()
    bg = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            bg[y][x] = True
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not bg[y][x]:
                bg[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not bg[ny][nx] and dist(fp[x, y], fp[nx, ny]) < 11:
                bg[ny][nx] = True
                q.append((nx, ny))
    kept = [fp[x, y] for y in range(h) for x in range(w) if not bg[y][x]]
    if len(kept) < 40 or len(kept) > 0.85 * w * h:
        return None, "adaptive method found no clear mark"
    F = tuple(sum(c[i] for c in kept) // len(kept) for i in range(3))
    light_share = sum(1 for c in kept if lum(c) > 0.8) / len(kept)
    if lum(F) > 0.8 or light_share > 0.4:
        return None, "light mark on a coloured square, kept as the picture"
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            if bg[y][x]:
                continue
            # Edge pixels next to the background fade in by how different they are from it.
            near = [fp[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < w and 0 <= y + dy < h and bg[y + dy][x + dx]]
            a = 1.0 if not near else max(smooth(dist(fp[x, y], n), 18, 80) for n in near)
            r, g, b = fp[x, y]
            op[x, y] = (r, g, b, int(255 * a))
    return trim(out), "gradient background removed"


def picture(img):
    """Last resort: keep the picture, without its white margin."""
    img = img.convert("RGBA")
    w, h = img.size
    flat = Image.new("RGB", (w, h), (255, 255, 255))
    flat.paste(img, mask=img.split()[3])
    box = flat.point(lambda v: 255 if v < 240 else 0).convert("L").getbbox()
    if not box:
        return None, "blank picture"
    out = img.crop(box)
    s = MAX_SIDE / max(out.size)
    return out.resize((max(1, round(out.width * s)), max(1, round(out.height * s))), Image.LANCZOS), "kept as the picture"


def trim(img):
    a = img.split()[3].point(lambda v: 255 if v > 20 else 0)
    box = a.getbbox()
    if not box:
        return None
    x0, y0, x1, y1 = box
    if (x1 - x0) < 8 or (y1 - y0) < 8:
        return None
    img = img.crop((max(0, x0 - 1), max(0, y0 - 1), min(img.width, x1 + 1), min(img.height, y1 + 1)))
    s = MAX_SIDE / max(img.size)
    if s != 1:
        img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    return img


def main():
    src = json.load(open(MAP))
    names = sys.argv[1:] or list(src.keys())
    os.makedirs(OUT_DIR, exist_ok=True)
    local = json.load(open(OUT_MAP)) if os.path.exists(OUT_MAP) and sys.argv[1:] else {}
    report = {"ok": 0, "transparent": 0, "recoloured": 0, "fallback": []}  # fallback = kept as the picture or failed
    for i, name in enumerate(names):
        url = src[name]
        try:
            res, note = cutout(fetch(url))
        except Exception as e:  # network or decode
            res, note = None, f"error: {e}"
        if res is None:
            local[name] = url
            report["fallback"].append((name, note))
        else:
            fname = hashlib.md5(name.encode()).hexdigest()[:10] + ".png"
            res.save(os.path.join(OUT_DIR, fname), optimize=True)
            local[name] = "/logos/" + fname
            report["ok"] += 1
            report["transparent"] += note == "already transparent"
            report["recoloured"] += note.startswith("light mark")
            if note.startswith("kept as the picture"):
                report["fallback"].append((name, note))
        if (i + 1) % 100 == 0:
            print(f"  {i + 1}/{len(names)}", flush=True)
    json.dump(local, open(OUT_MAP, "w"), ensure_ascii=False)
    print(json.dumps({k: (v if k != "fallback" else len(v)) for k, v in report.items()}))
    if report["fallback"]:
        print("fallback (kept as original picture):")
        for n, why in report["fallback"][:40]:
            print("  ", n, "-", why)


if __name__ == "__main__":
    main()
