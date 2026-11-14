#!/usr/bin/env python3
"""Oda tema görsellerini üretir (kendi çizimimiz; dış görsel kullanılmaz).

Çıktı: backend/src/samples/themes/<anahtar>.webp (1080x1920) ve <anahtar>_t.webp (360x640 küçük resim).
Coin'siz temalar sade (degrade + tek öğe), Coin'li temalar zengin (bulutsu, ışık, bokeh, katmanlı manzara).
Hareketli temaların hareketi uygulamada hafif bir efekt katmanıyla çizilir (görsel tek kare kalır, kasmaz).

Kullanım: python3 tools/oda_temalari.py [anahtar ...]
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1080, 1920
OUT = os.path.join(os.path.dirname(__file__), '..', 'backend', 'src', 'samples', 'themes')


# ---------------- yardımcılar ----------------
def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def vgrad(stops):
    """Dikey degrade. stops: [(konum 0..1, '#rrggbb'), ...]"""
    ys = np.linspace(0, 1, H, dtype=np.float32)
    pos = np.array([s[0] for s in stops], dtype=np.float32)
    cols = np.stack([hexrgb(s[1]) for s in stops])
    out = np.stack([np.interp(ys, pos, cols[:, c]) for c in range(3)], axis=1)
    return np.repeat(out[:, None, :], W, axis=1)


def glow(img, cx, cy, r, color, strength=1.0, sx=1.0, sy=1.0):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = ((xx - cx) / (r * sx)) ** 2 + ((yy - cy) / (r * sy)) ** 2
    a = np.exp(-d * 2.2)[..., None] * strength
    return img + a * hexrgb(color)


def screen(img, layer, alpha=1.0):
    a = img / 255.0
    b = np.clip(layer, 0, 255) / 255.0 * alpha
    return (1 - (1 - a) * (1 - b)) * 255.0


def noise(rng, scale, octaves=5, persist=0.55):
    """Değer gürültüsü (fbm), 0..1."""
    acc = np.zeros((H, W), np.float32)
    amp, tot, s = 1.0, 0.0, scale
    for _ in range(octaves):
        gw, gh = max(2, int(W / s)), max(2, int(H / s))
        g = Image.fromarray((rng.random((gh, gw)) * 255).astype(np.uint8))
        acc += np.asarray(g.resize((W, H), Image.BICUBIC), np.float32) / 255.0 * amp
        tot += amp
        amp *= persist
        s /= 2
    acc /= tot
    return (acc - acc.min()) / (acc.max() - acc.min() + 1e-6)


def stars(img, rng, n, ymax=1.0, big=0.04, tint=('#ffffff',), density=None):
    layer = np.zeros((H, W, 3), np.float32)
    glowl = np.zeros((H, W, 3), np.float32)
    for _ in range(n):
        x = rng.integers(0, W)
        y = int(rng.random() ** 1.3 * H * ymax)
        if density is not None and rng.random() > density[min(H - 1, y), x]:
            continue
        b = rng.random() ** 2.2
        c = hexrgb(tint[rng.integers(0, len(tint))])
        layer[y, x] += c * (0.35 + 0.65 * b)
        if rng.random() < big:
            glowl[y, x] += c * 6
    layer = np.asarray(Image.fromarray(np.clip(layer, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)), np.float32) * 2.2
    g = Image.fromarray(np.clip(glowl, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
    glow_arr = np.asarray(g, np.float32) * 3.0
    return screen(screen(img, layer), glow_arr)


def poly_layer(points_list, color, blur=0):
    im = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(im)
    for pts in points_list:
        d.polygon(pts, fill=255)
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(im, np.float32)[..., None] / 255.0, hexrgb(color)


def paint(img, mask_color, alpha=1.0):
    m, c = mask_color
    return img * (1 - m * alpha) + c * m * alpha


def mountains(rng, base, amp, rough=0.55, seed_pts=9):
    pts = np.array([base + rng.uniform(-amp, amp) for _ in range(seed_pts)])
    for _ in range(6):  # orta nokta kaydırma
        new = []
        a = amp * rough
        for i in range(len(pts) - 1):
            new += [pts[i], (pts[i] + pts[i + 1]) / 2 + rng.uniform(-a, a)]
        new.append(pts[-1])
        pts = np.array(new)
        amp *= rough
    xs = np.linspace(-20, W + 20, len(pts))
    return [list(zip(xs.tolist(), pts.tolist())) + [(W + 20, H), (-20, H)]]


def vignette(img, k=0.55):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.7)) ** 2)
    return img * (1 - np.clip(d - 0.35, 0, 1)[..., None] * k)


def blur_layer(arr, r):
    return np.asarray(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), np.float32)


def bokeh(img, rng, n, colors, rmin=10, rmax=60, ymin=0, ymax=1, alpha=0.35, blur=3):
    layer = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(n):
        r = rng.uniform(rmin, rmax)
        x = rng.uniform(0, W)
        y = rng.uniform(ymin * H, ymax * H)
        c = tuple(int(v * rng.uniform(0.4, 1.0)) for v in hexrgb(colors[rng.integers(0, len(colors))]))
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    arr = blur_layer(np.asarray(layer, np.float32), blur)
    return screen(img, arr, alpha)


def heart(cx, cy, s):
    pts = []
    for i in range(60):
        t = i / 60 * 2 * math.pi
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * s, cy - y * s))
    return pts


def pines(rng, base, hmin, hmax, count, spread=1.0):
    out = []
    for _ in range(count):
        x = rng.uniform(-40, W + 40)
        h = rng.uniform(hmin, hmax)
        w = h * 0.36 * spread
        y0 = base + rng.uniform(-20, 30)
        tiers = 4
        for t in range(tiers):
            top = y0 - h + t * h * 0.2
            bot = y0 - h * (0.55 - t * 0.15)
            ww = w * (0.45 + t * 0.2)
            out.append([(x, top), (x - ww, bot), (x + ww, bot)])
        out.append([(x - w * 0.08, y0 - h * 0.15), (x + w * 0.08, y0 - h * 0.15), (x + w * 0.08, y0 + 40), (x - w * 0.08, y0 + 40)])
    return out


def save(key, img):
    img = np.clip(img, 0, 255).astype(np.uint8)
    im = Image.fromarray(img)
    os.makedirs(OUT, exist_ok=True)
    im.save(os.path.join(OUT, f'{key}.webp'), 'WEBP', quality=80, method=6)
    im.resize((360, 640), Image.LANCZOS).save(os.path.join(OUT, f'{key}_t.webp'), 'WEBP', quality=78, method=6)
    print(key, os.path.getsize(os.path.join(OUT, f'{key}.webp')) // 1024, 'KB')


# ---------------- Coin'siz (sade) temalar ----------------
def t_default(rng):
    img = vgrad([(0, '#0e0b07'), (0.55, '#1a140a'), (1, '#0b0906')])
    img = glow(img, W * 0.5, H * 0.18, 520, '#3a2a0c', 0.8)
    return vignette(img)


def t_graphite(rng):
    img = vgrad([(0, '#0d0f12'), (0.6, '#1b1f26'), (1, '#2a303a')])
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    for i in range(-H, W, 90):
        d.line([(i, H), (i + H, 0)], fill=18, width=2)
    return vignette(img + np.asarray(m, np.float32)[..., None])


def t_neon(rng):
    img = vgrad([(0, '#12002b'), (0.5, '#140a3a'), (1, '#00334e')])
    lay = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(lay)
    for i, c in enumerate(['#ff2bd6', '#2be4ff', '#8a5cff']):
        r = 380 + i * 120
        d.arc([W / 2 - r, H * 0.42 - r, W / 2 + r, H * 0.42 + r], 200 + i * 15, 340 - i * 10, fill=tuple(hexrgb(c).astype(int)), width=6)
    arr = np.asarray(lay, np.float32)
    img = screen(img, blur_layer(arr, 14), 0.9)
    return screen(img, blur_layer(arr, 2), 0.8)


def t_galaxy(rng):
    img = vgrad([(0, '#05051a'), (0.6, '#1b1347'), (1, '#3b1e6e')])
    img = glow(img, W * 0.5, H * 0.45, 600, '#2a1c66', 0.5, sx=1.4)
    return stars(img, rng, 1600, big=0.05)

def t_sunset(rng):
    img = vgrad([(0, '#2b0e1f'), (0.35, '#7a2b3a'), (0.58, '#e07a3a'), (0.62, '#3a1a2a'), (1, '#140812')])
    img = glow(img, W / 2, H * 0.58, 260, '#ffb35a', 1.0)
    m, c = poly_layer([[(0, H * 0.6), (W, H * 0.6), (W, H), (0, H)]], '#1c0d18')
    img = paint(img, (m, c), 0.85)
    sun = Image.new('L', (W, H), 0)
    ImageDraw.Draw(sun).ellipse([W / 2 - 120, H * 0.6 - 240, W / 2 + 120, H * 0.6], fill=255)
    s = np.asarray(sun, np.float32)[..., None] / 255.0
    s[int(H * 0.6):] = 0
    img = img * (1 - s) + hexrgb('#ffcf7a') * s
    for i in range(14):  # su yansıması
        y = H * 0.61 + i * 18
        w = 200 - i * 12
        m2, c2 = poly_layer([[(W / 2 - w, y), (W / 2 + w, y), (W / 2 + w, y + 4), (W / 2 - w, y + 4)]], '#ffb35a')
        img = paint(img, (m2, c2), 0.5 - i * 0.03)
    return vignette(img)


def t_forest(rng):
    img = vgrad([(0, '#06170f'), (0.55, '#0f3b25'), (1, '#071a10')])
    img = glow(img, W * 0.7, H * 0.25, 300, '#d9f2c4', 0.35)
    img = paint(img, poly_layer(pines(rng, H * 0.78, 380, 620, 9), '#0a2617'))
    img = paint(img, poly_layer(pines(rng, H * 0.92, 520, 820, 7), '#04110a'))
    return vignette(img)


def t_ocean(rng):
    img = vgrad([(0, '#021a2b'), (0.5, '#05445e'), (1, '#0b6e8a')])
    lay = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(lay)
    for k in range(10):
        y0 = H * 0.55 + k * 75
        pts = [(x, y0 + 18 * math.sin(x / 90 + k)) for x in range(0, W + 10, 10)]
        d.line(pts, fill=40 + k * 6, width=3)
    return img + np.asarray(lay, np.float32)[..., None] * hexrgb('#7dd3fc') / 255.0


def t_rose(rng):
    img = vgrad([(0, '#2b0a1c'), (0.55, '#6b1f45'), (1, '#2b0a1c')])
    return bokeh(img, rng, 26, ['#ff8fc0', '#ffc0dc'], 30, 120, alpha=0.18, blur=10)


def t_royal(rng):
    img = vgrad([(0, '#1a1033'), (0.6, '#3b2470'), (1, '#4a3416')])
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    s = 90
    for y in range(0, H + s, s):
        for x in range(0, W + s, s):
            d.polygon([(x, y - s / 2), (x + s / 2, y), (x, y + s / 2), (x - s / 2, y)], outline=45)
    return vignette(img + np.asarray(m, np.float32)[..., None] * hexrgb('#ffd27a') / 255.0)


def t_mint(rng):
    img = vgrad([(0, '#06201c'), (0.5, '#0b4a40'), (1, '#127a66')])
    img = paint(img, poly_layer(mountains(rng, H * 0.72, 90, 0.5), '#0a3a32'), 0.9)
    img = paint(img, poly_layer(mountains(rng, H * 0.85, 60, 0.5), '#06241f'), 0.95)
    return img


def t_plum(rng):
    img = vgrad([(0, '#180a24'), (0.55, '#3a1556'), (1, '#5e2a86')])
    return bokeh(img, rng, 18, ['#c084fc'], 60, 180, alpha=0.14, blur=18)


def t_dusk(rng):
    img = vgrad([(0, '#0b1220'), (0.5, '#1f2d4f'), (0.8, '#3c4e86'), (1, '#1a2238')])
    img = stars(img, rng, 300, ymax=0.5)
    blds, wins = [], []
    x = -10
    while x < W:
        w = rng.uniform(60, 140)
        h = rng.uniform(180, 520)
        blds.append([(x, H * 0.8 - h), (x + w, H * 0.8 - h), (x + w, H), (x, H)])
        for wy in np.arange(H * 0.8 - h + 20, H * 0.8 - 10, 34):
            for wx in np.arange(x + 10, x + w - 14, 22):
                if rng.random() < 0.28:
                    wins.append([(wx, wy), (wx + 10, wy), (wx + 10, wy + 14), (wx, wy + 14)])
        x += w + rng.uniform(0, 8)
    img = paint(img, poly_layer(blds, '#0a0f1c'))
    img = paint(img, poly_layer(wins, '#ffd27a'), 0.55)
    return img


def t_mosque(rng):
    img = vgrad([(0, '#3a1a5e'), (0.55, '#8a3a9e'), (1, '#5a2a7a')])
    img = stars(img, rng, 160, ymax=0.45)
    cx, base = W / 2, H * 0.82
    shapes = []
    dome = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(dome)
    d.ellipse([cx - 230, base - 560, cx + 230, base - 160], fill=255)
    d.rectangle([cx - 240, base - 360, cx + 240, H], fill=255)
    for dx, r in [(-380, 120), (380, 120), (-560, 80), (560, 80)]:
        d.ellipse([cx + dx - r, base - 200 - r * 1.4, cx + dx + r, base - 200 + r * 0.6], fill=255)
        d.rectangle([cx + dx - r - 10, base - 210, cx + dx + r + 10, H], fill=255)
    for dx in (-300, 300):
        d.rectangle([cx + dx - 18, base - 820, cx + dx + 18, H], fill=255)
        d.polygon([(cx + dx - 26, base - 820), (cx + dx + 26, base - 820), (cx + dx, base - 920)], fill=255)
        d.rectangle([cx + dx - 30, base - 640, cx + dx + 30, base - 620], fill=255)
    d.rectangle([0, base, W, H], fill=255)
    d.line([(cx, base - 560), (cx, base - 640)], fill=255, width=8)
    m = np.asarray(dome, np.float32)[..., None] / 255.0
    img = img * (1 - m) + hexrgb('#4a2066') * m
    moon = Image.new('L', (W, H), 0)
    dm = ImageDraw.Draw(moon)
    dm.ellipse([W * 0.62, H * 0.12, W * 0.62 + 150, H * 0.12 + 150], fill=255)
    dm.ellipse([W * 0.62 + 45, H * 0.12 - 15, W * 0.62 + 195, H * 0.12 + 135], fill=0)
    mm = np.asarray(moon, np.float32)[..., None] / 255.0
    img = glow(img, W * 0.62 + 75, H * 0.12 + 75, 160, '#5a3a7a', 0.6)
    return img * (1 - mm) + hexrgb('#ffe9b0') * mm


def t_dunes(rng):
    img = vgrad([(0, '#2c6a7e'), (0.6, '#3c7f8f'), (1, '#2a5f70')])
    for k, (base, col, a) in enumerate([(0.62, '#356f80', 70), (0.72, '#2f6474', 90), (0.85, '#285868', 110)]):
        pts = [(x, H * base + a * math.sin(x / (260 + k * 60) + k * 2)) for x in range(-20, W + 30, 10)]
        img = paint(img, poly_layer([pts + [(W + 20, H), (-20, H)]], col))
    return img


# ---------------- Coin'li (zengin) temalar ----------------
def t_midnight(rng):
    img = vgrad([(0, '#02030a'), (0.45, '#0a1230'), (0.75, '#18306b'), (1, '#2e5bc4')])
    img = stars(img, rng, 1400, ymax=0.75, big=0.03)
    img = glow(img, W * 0.3, H * 0.2, 260, '#6d8bd9', 0.55)
    moon = Image.new('L', (W, H), 0)
    ImageDraw.Draw(moon).ellipse([W * 0.3 - 80, H * 0.2 - 80, W * 0.3 + 80, H * 0.2 + 80], fill=255)
    mm = np.asarray(moon.filter(ImageFilter.GaussianBlur(1.5)), np.float32)[..., None] / 255.0
    tex = noise(rng, 60, 3)[..., None]
    img = img * (1 - mm) + (hexrgb('#f3f1e6') * (0.82 + 0.18 * tex)) * mm
    for base, amp, col in [(0.66, 140, '#16224a'), (0.75, 120, '#0e1733'), (0.86, 90, '#070c1c')]:
        img = paint(img, poly_layer(mountains(rng, H * base, amp), col))
    img = glow(img, W / 2, H * 0.66, 500, '#2e5bc4', 0.25, sx=1.6, sy=0.3)
    return vignette(img)


def t_milkyway(rng):
    img = vgrad([(0, '#03040c'), (0.5, '#0d1030'), (0.75, '#3a2a48'), (0.88, '#d0704a'), (0.92, '#2a1a24'), (1, '#0a0608')])
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    band = np.exp(-(((xx - W * 0.5) * 0.8 + (yy - H * 0.45) * 0.45) / 230) ** 2)
    n = noise(rng, 220, 6)
    dust = band * (0.35 + n)
    img = screen(img, (dust[..., None] * hexrgb('#c9b6ff') * 0.55))
    img = screen(img, (np.clip(dust - 0.6, 0, 1)[..., None] * hexrgb('#ffd9b0') * 0.9))
    img = img * (1 - (np.clip(noise(rng, 90, 4) - 0.55, 0, 1) * band * 1.4)[..., None])  # karanlık toz
    img = stars(img, rng, 5200, ymax=0.9, big=0.02, density=np.clip(band * 1.2 + 0.25, 0, 1), tint=('#ffffff', '#cfe0ff', '#ffe6c8'))
    img = paint(img, poly_layer(mountains(rng, H * 0.9, 40, 0.45), '#07050a'))
    return vignette(img, 0.4)


def t_stage(rng):
    img = vgrad([(0, '#020818'), (0.5, '#062a6b'), (1, '#03102e')])
    lay = np.zeros((H, W, 3), np.float32)
    for x0, ang in [(W * 0.15, 0.32), (W * 0.85, -0.32), (W * 0.5, 0.0)]:
        m = Image.new('L', (W, H), 0)
        top = (x0, -40)
        bx = x0 + math.tan(ang) * H * 0.75
        ImageDraw.Draw(m).polygon([top, (bx - 260, H * 0.78), (bx + 260, H * 0.78)], fill=120)
        lay += np.asarray(m.filter(ImageFilter.GaussianBlur(40)), np.float32)[..., None] * hexrgb('#5ab4ff') / 255.0
    img = screen(img, lay, 0.9)
    cy = H * 0.8
    for i, (rx, ry, col, a) in enumerate([(430, 70, '#0a3a8a', 1), (330, 52, '#0f4fb0', 1), (230, 36, '#1a66d0', 1)]):
        m = Image.new('L', (W, H), 0)
        ImageDraw.Draw(m).ellipse([W / 2 - rx, cy - ry - i * 34, W / 2 + rx, cy + ry - i * 34], fill=255)
        mm = np.asarray(m, np.float32)[..., None] / 255.0
        img = img * (1 - mm) + hexrgb(col) * mm
        ring = Image.new('L', (W, H), 0)
        ImageDraw.Draw(ring).ellipse([W / 2 - rx, cy - ry - i * 34, W / 2 + rx, cy + ry - i * 34], outline=255, width=4)
        img = screen(img, blur_layer(np.asarray(ring, np.float32)[..., None] * hexrgb('#7fd4ff') / 255.0, 6), 1.0)
    img = glow(img, W / 2, cy - 80, 300, '#3aa0ff', 0.5, sy=0.5)
    return bokeh(img, rng, 40, ['#5ab4ff', '#9ad8ff'], 3, 9, ymin=0.6, ymax=0.95, alpha=0.8, blur=2)


def t_neoncity(rng):
    img = vgrad([(0, '#0a0220'), (0.45, '#3a0a5e'), (0.6, '#ff4d8d'), (0.62, '#1a0630'), (1, '#05010e')])
    img = stars(img, rng, 400, ymax=0.45)
    sun = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(sun)
    d.ellipse([W / 2 - 300, H * 0.61 - 560, W / 2 + 300, H * 0.61 + 40], fill=255)
    for i in range(7):
        y = H * 0.61 - 260 + i * 40
        d.rectangle([0, y, W, y + 6 + i * 2], fill=0)
    d.rectangle([0, H * 0.61, W, H], fill=0)
    sm = np.asarray(sun, np.float32)[..., None] / 255.0
    yy = np.linspace(0, 1, H)[:, None, None]
    suncol = (1 - yy) * hexrgb('#ffe36e') + yy * hexrgb('#ff3d7f')
    img = glow(img, W / 2, H * 0.48, 420, '#ff2b8a', 0.5)
    img = img * (1 - sm) + suncol * sm
    grid = Image.new('L', (W, H), 0)
    g = ImageDraw.Draw(grid)
    hz = H * 0.62
    for i in range(1, 22):
        y = hz + (H - hz) * (i / 21) ** 2.2
        g.line([(0, y), (W, y)], fill=200, width=3)
    for i in range(-14, 15):
        g.line([(W / 2 + i * 18, hz), (W / 2 + i * 260, H)], fill=200, width=3)
    ga = np.asarray(grid, np.float32)[..., None] * hexrgb('#ff4df0') / 255.0
    img = screen(img, blur_layer(ga, 8), 0.7)
    return screen(img, ga, 0.8)


def t_emerald(rng):
    img = vgrad([(0, '#021510'), (0.5, '#06382b'), (1, '#021a12')])
    n = noise(rng, 300, 6)
    img = screen(img, (n ** 2.2)[..., None] * hexrgb('#34d399') * 0.7)
    img = bokeh(img, rng, 70, ['#34d399', '#a7f3d0', '#10b981'], 8, 70, alpha=0.45, blur=6)
    img = stars(img, rng, 500, tint=('#d1fae5',))
    return vignette(img)


def t_amethyst(rng):
    img = vgrad([(0, '#10051f'), (0.5, '#2c0f55'), (1, '#12062a')])
    img = screen(img, (noise(rng, 280, 6) ** 2)[..., None] * hexrgb('#a855f7') * 0.55)
    lay = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(lay)
    for _ in range(26):
        cx, cy = rng.uniform(0, W), rng.uniform(H * 0.55, H * 1.05)
        h = rng.uniform(160, 520)
        w = h * rng.uniform(0.18, 0.3)
        tilt = rng.uniform(-0.4, 0.4)
        top = (cx + tilt * h, cy - h)
        col = tuple((hexrgb(['#c084fc', '#7c3aed', '#e9d5ff'][rng.integers(0, 3)]) * rng.uniform(0.35, 0.8)).astype(int))
        d.polygon([top, (cx - w, cy - h * 0.75), (cx - w, cy), (cx + w, cy), (cx + w, cy - h * 0.75)], fill=col)
        d.polygon([top, (cx, cy - h * 0.7), (cx, cy), (cx + w, cy), (cx + w, cy - h * 0.75)], fill=tuple(int(v * 1.25) for v in col))
    arr = np.asarray(lay, np.float32)
    img = screen(img, blur_layer(arr, 26), 0.7)
    img = screen(img, blur_layer(arr, 2), 0.45)
    return stars(img, rng, 500, ymax=0.7, tint=('#f3e8ff',))


def t_copper(rng):
    img = vgrad([(0, '#0d0602'), (0.5, '#2a1405'), (1, '#120802')])
    lay = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(lay)
    for i in range(7):
        x = rng.uniform(-200, W)
        d.polygon([(x, 0), (x + 90, 0), (x + 700, H), (x + 520, H)], fill=int(rng.uniform(20, 55)))
    img = screen(img, np.asarray(lay.filter(ImageFilter.GaussianBlur(30)), np.float32)[..., None] * hexrgb('#ffc43d') / 255.0)
    img = glow(img, W * 0.5, H * 0.3, 420, '#9a5a12', 0.6)
    img = bokeh(img, rng, 90, ['#ffc43d', '#ffe9a3', '#e6b13a'], 6, 46, alpha=0.55, blur=5)
    img = bokeh(img, rng, 220, ['#ffe9a3'], 1.5, 4, alpha=0.9, blur=1)
    return vignette(img)


def t_romance(rng):
    img = vgrad([(0, '#1a0420'), (0.5, '#5a0f3a'), (1, '#24061a')])
    img = glow(img, W / 2, H * 0.42, 520, '#ff4d8d', 0.35)
    lay = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(lay)
    for _ in range(38):
        s = rng.uniform(2.5, 11)
        col = tuple((hexrgb(['#ff6fa8', '#ff9ec7', '#ffd1e3'][rng.integers(0, 3)]) * rng.uniform(0.35, 0.9)).astype(int))
        d.polygon(heart(rng.uniform(0, W), rng.uniform(0, H), s), fill=col)
    arr = np.asarray(lay, np.float32)
    img = screen(img, blur_layer(arr, 7), 0.75)
    img = screen(img, blur_layer(arr, 1), 0.35)
    return vignette(bokeh(img, rng, 120, ['#ffd1e3'], 1.5, 4, alpha=0.8, blur=1))


def t_aurora(rng):
    img = vgrad([(0, '#020b14'), (0.6, '#06304a'), (1, '#03121c')])
    img = stars(img, rng, 1400, ymax=0.8, big=0.03)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    lay = np.zeros((H, W, 3), np.float32)
    for k, (cy, amp, freq, hgt, ca, cb, st) in enumerate([
            (0.40, 160, 330, 520, '#5cf2c0', '#7b5cff', 1.0),
            (0.30, 120, 250, 380, '#3dffa8', '#d14dff', 0.7)]):
        phase = rng.uniform(0, 6)
        base = H * cy + np.sin(xx / freq + phase) * amp + np.sin(xx / (freq * 0.37) + phase * 2) * amp * 0.25
        streak = np.asarray(Image.fromarray((rng.random((1, W // 5)) * 255).astype(np.uint8)).resize((W, 1), Image.BICUBIC), np.float32)[0] / 255.0
        streak2 = np.asarray(Image.fromarray((rng.random((1, W // 24)) * 255).astype(np.uint8)).resize((W, 1), Image.BICUBIC), np.float32)[0] / 255.0
        t = (base - yy) / hgt  # 0 tabanda, 1 tepede
        body = np.where(t >= 0, np.exp(-t * 2.4), np.exp(-(t * hgt / 26) ** 2)) * (t > -0.2)
        body *= (0.35 + 0.9 * streak[None, :] * streak2[None, :] * 1.6)
        tc = np.clip(t, 0, 1)[..., None]
        col = (1 - tc) * hexrgb(ca) + tc * hexrgb(cb)
        lay += body[..., None] * col * st
    img = screen(img, blur_layer(lay, 4), 0.95)
    img = screen(img, blur_layer(lay, 30), 0.5)
    for base, amp, c in [(0.72, 160, '#0a2230'), (0.84, 100, '#06141c')]:
        img = paint(img, poly_layer(mountains(rng, H * base, amp), c))
    img = paint(img, poly_layer(pines(rng, H * 0.95, 240, 420, 14), '#020a0e'))
    return img

def t_starfall(rng):
    img = vgrad([(0, '#04030f'), (0.55, '#120b36'), (0.85, '#2a1763'), (1, '#0a0618')])
    img = screen(img, (noise(rng, 320, 6) ** 2.5)[..., None] * hexrgb('#7c5cff') * 0.5)
    img = stars(img, rng, 2600, big=0.03, tint=('#ffffff', '#d8ccff'))
    img = paint(img, poly_layer(mountains(rng, H * 0.88, 70, 0.5), '#05030c'))
    return vignette(img)


def t_bubbles(rng):
    img = vgrad([(0, '#0e86b3'), (0.4, '#064a6b'), (1, '#011018')])
    lay = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(lay)
    for i in range(9):
        x = rng.uniform(0, W)
        d.polygon([(x - 40, 0), (x + 40, 0), (x + 260 + rng.uniform(-80, 80), H * 0.8), (x - 120, H * 0.8)], fill=int(rng.uniform(25, 60)))
    img = screen(img, np.asarray(lay.filter(ImageFilter.GaussianBlur(35)), np.float32)[..., None] * hexrgb('#bdf0ff') / 255.0)
    img = glow(img, W / 2, -100, 700, '#bdf0ff', 0.35, sx=1.3)
    img = bokeh(img, rng, 30, ['#9be8ff'], 4, 14, ymin=0.2, ymax=0.9, alpha=0.4, blur=2)
    img = paint(img, poly_layer(mountains(rng, H * 0.9, 50, 0.5), '#03141c'))
    return vignette(img)

def t_embers(rng):
    img = vgrad([(0, '#0c0402'), (0.6, '#3a0f05'), (1, '#8a2a0a')])
    smoke = noise(rng, 300, 6)
    img = screen(img, (smoke ** 2.5 * np.linspace(0.2, 1, H)[:, None])[..., None] * hexrgb('#ff6a1a') * 0.6)
    img = glow(img, W / 2, H * 1.02, 620, '#ff8a3d', 0.75, sx=1.4, sy=0.5)
    return vignette(bokeh(img, rng, 80, ['#ffb35a', '#ff6a1a'], 1.5, 5, ymin=0.4, alpha=0.9, blur=1.5))


def t_winter(rng):
    img = vgrad([(0, '#050b1c'), (0.55, '#18305a'), (1, '#4a6a9a')])
    img = stars(img, rng, 700, ymax=0.6)
    img = glow(img, W * 0.72, H * 0.17, 220, '#c8dcff', 0.45)
    moon = Image.new('L', (W, H), 0)
    ImageDraw.Draw(moon).ellipse([W * 0.72 - 70, H * 0.17 - 70, W * 0.72 + 70, H * 0.17 + 70], fill=255)
    mm = np.asarray(moon, np.float32)[..., None] / 255.0
    img = img * (1 - mm) + hexrgb('#eef4ff') * mm
    img = paint(img, poly_layer(mountains(rng, H * 0.68, 130), '#2a4470'))
    img = paint(img, poly_layer(pines(rng, H * 0.8, 300, 480, 10), '#16294a'))
    snow = [[(-20, H * 0.86), *[(x, H * 0.86 + 30 * math.sin(x / 200)) for x in range(0, W + 20, 20)], (W + 20, H), (-20, H)]]
    img = paint(img, poly_layer(snow, '#c9d8f0'))
    img = paint(img, poly_layer(pines(rng, H * 0.96, 420, 700, 6), '#0a1428'))
    return img


def t_sakura(rng):
    img = vgrad([(0, '#0b0a24'), (0.55, '#2a1a4a'), (1, '#4a2050')])
    img = stars(img, rng, 400, ymax=0.6)
    img = glow(img, W * 0.32, H * 0.3, 240, '#ffd6e8', 0.4)
    moon = Image.new('L', (W, H), 0)
    ImageDraw.Draw(moon).ellipse([W * 0.32 - 85, H * 0.3 - 85, W * 0.32 + 85, H * 0.3 + 85], fill=255)
    mm = np.asarray(moon, np.float32)[..., None] / 255.0
    img = img * (1 - mm) + hexrgb('#ffe8f2') * mm
    lay = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(lay)
    branch = Image.new('L', (W, H), 0)
    b = ImageDraw.Draw(branch)

    def grow(x, y, ang, ln, wd, depth):
        x2, y2 = x + math.cos(ang) * ln, y + math.sin(ang) * ln
        b.line([(x, y), (x2, y2)], fill=255, width=max(2, int(wd)))
        if depth <= 2:
            for _ in range(14):
                r = rng.uniform(9, 22)
                t = rng.random()
                px, py = x + (x2 - x) * t + rng.uniform(-45, 45), y + (y2 - y) * t + rng.uniform(-45, 45)
                col = tuple((hexrgb(['#ffb7d5', '#ff8fbf', '#ffd6e8'][rng.integers(0, 3)]) * rng.uniform(0.6, 1.0)).astype(int))
                d.ellipse([px - r, py - r, px + r, py + r], fill=col)
        if depth == 0:
            return
        for da in (-0.5, 0.42):
            grow(x2, y2, ang + da + rng.uniform(-0.25, 0.25), ln * rng.uniform(0.7, 0.82), wd * 0.66, depth - 1)

    grow(W + 30, H * 0.08, math.pi * 1.1, 300, 40, 6)
    grow(-30, H * 0.55, -0.35, 280, 36, 6)
    bm = np.asarray(branch, np.float32)[..., None] / 255.0
    img = img * (1 - bm) + hexrgb('#160a14') * bm
    arr = np.asarray(lay, np.float32)
    img = screen(img, blur_layer(arr, 12), 0.55)
    img = screen(img, blur_layer(arr, 1.2), 0.9)
    return vignette(img)

def t_fireflies(rng):
    img = vgrad([(0, '#03100c'), (0.55, '#0f3a2a'), (0.8, '#1d5a3a'), (1, '#06160e')])
    img = stars(img, rng, 600, ymax=0.5)
    img = glow(img, W * 0.65, H * 0.18, 200, '#e8ffd0', 0.35)
    img = paint(img, poly_layer(mountains(rng, H * 0.64, 90, 0.5), '#0c2e1f'))
    img = paint(img, poly_layer(mountains(rng, H * 0.74, 60, 0.5), '#082418'))
    grass = []
    for _ in range(520):
        x = rng.uniform(-10, W + 10)
        h = rng.uniform(90, 330)
        lean = rng.uniform(-70, 70)
        grass.append([(x - 6, H), (x + 6, H), (x + lean, H - h * 0.55 - 120)])
    img = paint(img, poly_layer([[(-10, H * 0.86), (W + 10, H * 0.84), (W + 10, H), (-10, H)]], '#03100a'))
    img = paint(img, poly_layer(grass, '#020a06'))
    img = bokeh(img, rng, 45, ['#d9ff7a', '#ffe36e'], 10, 22, ymin=0.45, ymax=0.92, alpha=0.55, blur=12)
    return bokeh(img, rng, 45, ['#f4ffb0'], 2, 4, ymin=0.45, ymax=0.92, alpha=1.0, blur=1.5)

def t_cosmos(rng):
    img = vgrad([(0, '#02010a'), (1, '#07031a')])
    n1, n2 = noise(rng, 360, 7), noise(rng, 260, 7)
    img = screen(img, (n1 ** 3)[..., None] * hexrgb('#ff3d9a') * 1.1)
    img = screen(img, (n2 ** 3)[..., None] * hexrgb('#3d7bff') * 1.1)
    img = screen(img, (np.clip(n1 * n2 - 0.35, 0, 1) * 2)[..., None] * hexrgb('#ffd59e'))
    img = img * (1 - (np.clip(noise(rng, 120, 5) - 0.62, 0, 1) * 1.6)[..., None])
    img = stars(img, rng, 4000, big=0.04, tint=('#ffffff', '#ffd6f0', '#cfe0ff'))
    img = glow(img, W * 0.55, H * 0.4, 160, '#fff1d6', 0.5)
    return vignette(img, 0.35)


THEMES = {
    'default': t_default, 'graphite': t_graphite, 'neon': t_neon, 'galaxy': t_galaxy, 'sunset': t_sunset,
    'forest': t_forest, 'ocean': t_ocean, 'rose': t_rose, 'royal': t_royal, 'mint': t_mint, 'plum': t_plum,
    'dusk': t_dusk, 'mosque': t_mosque, 'dunes': t_dunes,
    'midnight': t_midnight, 'milkyway': t_milkyway, 'stage': t_stage, 'neoncity': t_neoncity, 'emerald': t_emerald,
    'amethyst': t_amethyst, 'copper': t_copper, 'romance': t_romance,
    'aurora': t_aurora, 'starfall': t_starfall, 'bubbles': t_bubbles, 'embers': t_embers, 'winter': t_winter,
    'sakura': t_sakura, 'fireflies': t_fireflies, 'cosmos': t_cosmos,
}

if __name__ == '__main__':
    keys = sys.argv[1:] or list(THEMES)
    for i, k in enumerate(keys):
        save(k, THEMES[k](np.random.default_rng(1000 + list(THEMES).index(k))))
