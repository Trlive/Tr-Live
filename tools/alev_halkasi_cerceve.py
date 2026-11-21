# TR Live alevli çerçeve üreticisi (kendi çizimimiz): kalın parlak halka + gerçekçi yükselen alevler + kıvılcımlar.
# Kusursuz döngülü şeffaf hareketli WebP üretir; renkler, halka kalınlığı ve alev hareketi buradaki sabitlerle ayarlanır.
# Çıktı yönetim panelinden çerçeve olarak yüklenir (varsayılan oran 1.6 ile avatara tam oturur).
# Kullanım: python3 tools/alev_halkasi_cerceve.py fire 36 alev_halkasi.webp
#           python3 tools/alev_halkasi_cerceve.py blue 36 mavi_alev_halkasi.webp
import sys, os
import numpy as np
from PIL import Image, ImageDraw

KIND = sys.argv[1] if len(sys.argv) > 1 else 'fire'
N = int(sys.argv[2]) if len(sys.argv) > 2 else 36
OUT = sys.argv[3] if len(sys.argv) > 3 else f'{KIND}.webp'
S = 512
SCALE = float(os.environ.get('SCALE', '1.6'))  # tuval = avatar çapı x SCALE (1.6 = uygulamanın varsayılanı; yönetimden yüklenen çerçeveye tam oturur)
RA = S / SCALE / 2          # avatar yarıçapı
T = RA * 0.135              # halka kalınlığı (videodaki oran)
RIN = RA - 2                # halka iç kenarı avatarın kenarına biner
ROUT = RIN + T
RMID = (RIN + ROUT) / 2
P = 270.0                   # gürültünün dikey periyodu (px); döngüde tam katı kadar kayar → kusursuz döngü
rng = np.random.default_rng(11 if KIND == 'fire' else 23)

PAL = {
    # (ısı, R, G, B, opaklık)
    'fire': [(0.00, 60, 10, 0, 0.0), (0.12, 120, 22, 4, 0.30), (0.30, 205, 52, 6, 0.78), (0.50, 252, 108, 16, 1.0),
             (0.70, 255, 168, 36, 1.0), (0.86, 255, 222, 100, 1.0), (1.00, 255, 248, 214, 1.0)],
    'blue': [(0.00, 0, 8, 60, 0.0), (0.12, 8, 26, 125, 0.30), (0.30, 18, 66, 225, 0.78), (0.50, 28, 128, 255, 1.0),
             (0.70, 70, 186, 255, 1.0), (0.86, 150, 228, 255, 1.0), (1.00, 228, 250, 255, 1.0)],
}[KIND]
RING = {'fire': ((244, 98, 18), (255, 186, 46), (255, 120, 20)), 'blue': ((24, 104, 255), (140, 218, 255), (40, 130, 255))}[KIND]

lut_x = np.array([p[0] for p in PAL])
def palette(h):
    h = np.clip(h, 0, 1)
    return [np.interp(h, lut_x, np.array([p[i] for p in PAL])) for i in range(1, 5)]

def lattice(cx, cy):
    return rng.random((cy, cx)).astype(np.float32)

def vnoise(x, y, g):
    cy, cx = g.shape
    x0 = np.floor(x).astype(np.int64); y0 = np.floor(y).astype(np.int64)
    fx = x - x0; fy = y - y0
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    x0 %= cx; y0 %= cy; x1 = (x0 + 1) % cx; y1 = (y0 + 1) % cy
    return (g[y0, x0] * (1 - fx) + g[y0, x1] * fx) * (1 - fy) + (g[y1, x0] * (1 - fx) + g[y1, x1] * fx) * fy

yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
cx0 = cy0 = S / 2
dx = xx - cx0; dy = yy - cy0
r = np.sqrt(dx * dx + dy * dy)
th = np.arctan2(dy, dx)
up = np.clip(-np.sin(th), 0, 1)        # üst 1
down = np.clip(np.sin(th), 0, 1)       # alt 1

# Oktavlar (hücre px, dikey hücre sayısı → periyot P, genlik, döngüde kaç periyot kayar)
OCT = []
for cell, amp, sp in [(54, 0.44, 1), (27, 0.27, 2), (13.5, 0.18, 2), (6.75, 0.11, 3)]:
    ly = int(round(P / cell))
    OCT.append((lattice(int(S / cell) + 3, ly), cell, ly, amp, sp))
WARP = [lattice(int(S / 64) + 3, int(P / 67.5)), lattice(int(S / 64) + 3, int(P / 67.5))]

# Alev yüksekliği: üstte uzun (halka yarıçapının ~0.68'i), yanlarda orta, altta kısa
HK = (S / 2 - ROUT) / 96.6     # tuvaldeki boş alana göre (alevler kenarda kesilmesin)
H = (20 + 104 * up ** 1.1 + 50 * (1 - up) * (1 - down) + 14 * down) * HK
dout = r - ROUT
din = RIN - r

frames = []
for k in range(N):
    t = k / N
    # kıvrımlı alev için alan bükme (periyodik)
    wy = t * (P / 67.5) * 1
    wxv = (vnoise(xx / 64, yy / 67.5 + wy, WARP[0]) - 0.5) * 34
    wyv = (vnoise(xx / 64 + 7.3, yy / 67.5 + wy, WARP[1]) - 0.5) * 20
    n = np.zeros_like(xx)
    for g, cell, ly, amp, sp in OCT:
        # dikeyde uzun alev dilleri: yatayda daha sık
        n += amp * vnoise((xx + wxv) / cell * 2.0, (yy + wyv) / cell + t * ly * sp, g)
    # dışa doğru alev maskesi; içe doğru (avatarın üstüne) yalnız kısa alev dilleri
    m_out = np.clip(1 - np.maximum(dout, 0) / H, 0, 1)
    m_in = np.clip(1 - np.maximum(din, 0) / 5, 0, 1) * 0.6
    m = np.where(r >= RMID, m_out, m_in)
    # halkanın dibinde bile aralıklı diller (gürültü eşiği), uzaklaştıkça yalnız tepeler kalır
    base = 0.29 + 0.06 * down - 0.05 * up             # üstte daha yoğun, altta seyrek
    flame = np.clip((n - base - (1 - m) * 0.46) * 4.6, 0, 1) * np.clip(m * 5, 0, 1)
    # ısı: dilin gövdesi turuncu-sarı, tabanı açık sarı, uçlar kırmızı → koyu ve yarı saydam
    heat = flame ** 1.3 * (0.22 + 0.62 * m ** 1.4)
    # halka: kenarlar turuncu, orta çizgi açık; hafif dalgalanan parlaklık
    across = np.clip(1 - np.abs(r - RMID) / (T / 2), 0, 1)
    ripple = 0.92 + 0.08 * np.sin(2 * np.pi * (t * 3 + th * 4 / np.pi)) * np.sin(2 * np.pi * (t * 2 - th * 2 / np.pi))
    ring_a = np.clip((T / 2 + 1.2 - np.abs(r - RMID)) / 1.2, 0, 1)        # kenarları yumuşak (kenar yumuşatma)
    e, c, gcol = RING
    mix = across ** 0.8 * ripple
    ring_rgb = [e[i] + (c[i] - e[i]) * mix for i in range(3)]
    # ışıma yalnız dışa (avatarın kenarı net kalsın)
    glow_a = np.exp(-(np.maximum(r - ROUT, 0) / 8.0) ** 2) * 0.5 * (1 - ring_a) * (r > RMID)
    # alev rengi
    fr, fg, fb, fa = palette(heat)
    fa = fa * np.clip(flame * 1.6, 0, 1)
    # katmanlar: ışıma (altta) → halka → alev (üstte, halkanın önünde de yanar)
    out_rgb = np.zeros((S, S, 3), np.float32); out_a = np.zeros((S, S), np.float32)
    def over(rgb, a):
        global out_rgb, out_a
        na = a + out_a * (1 - a)
        for i in range(3):
            out_rgb[..., i] = (rgb[i] * a + out_rgb[..., i] * out_a * (1 - a)) / np.maximum(na, 1e-4)
        out_a = na
    over([np.full_like(xx, gcol[0]), np.full_like(xx, gcol[1]), np.full_like(xx, gcol[2])], glow_a)
    over(ring_rgb, ring_a)
    # halkanın önündeki alevler biraz daha saydam: halka görünür kalsın
    over([fr, fg, fb], fa * np.where(r < ROUT - 1, 0.45, 1.0))
    out_a = np.where(r < RIN - 22, 0, out_a)       # avatarın ortası tamamen şeffaf
    frames.append([out_rgb, out_a])

# kıvılcımlar
SP = rng.random((64, 5))
spark_col = palette(np.array(0.62))
for k in range(N):
    t = k / N
    rgb, a = frames[k]
    for (ang, ph, spd, sz, sway) in SP:
        a0 = -np.pi / 2 + (ang - 0.5) * 2.6           # çoğu üstte
        mult = 1 + int(spd * 3)
        life = (t * mult + ph) % 1.0
        rr = ROUT + 4 + life * (50 + 80 * spd) * HK
        px = cx0 + np.cos(a0) * rr + np.sin(life * 7 + sway * 20) * 8
        py = cy0 + np.sin(a0) * rr - life * (40 + 50 * spd) * HK
        rad = 0.8 + sz * 1.3
        al = np.clip((1 - life) ** 1.1 * 1.5, 0, 1) * np.clip(life * 8, 0, 1)
        x0, x1 = int(px - 5), int(px + 6); y0, y1 = int(py - 5), int(py + 6)
        if x0 < 0 or y0 < 0 or x1 >= S or y1 >= S:
            continue
        gy, gx = np.mgrid[y0:y1, x0:x1]
        s = np.exp(-((gx - px) ** 2 + (gy - py) ** 2) / (rad * rad)) * al
        sub_a = a[y0:y1, x0:x1]
        na = s + sub_a * (1 - s)
        for i in range(3):
            sub = rgb[y0:y1, x0:x1, i]
            rgb[y0:y1, x0:x1, i] = (float(spark_col[i]) * s + sub * sub_a * (1 - s)) / np.maximum(na, 1e-4)
        a[y0:y1, x0:x1] = na

# tuval kenarına yaklaşan alev / kıvılcım yumuşakça söner (kenarda kesik çizgi oluşmasın)
edge = np.minimum(np.minimum(xx, S - 1 - xx), np.minimum(yy, S - 1 - yy))
fade = np.clip(edge / 14.0, 0, 1)
ims = []
for rgb, a in frames:
    a = a * fade
    arr = np.dstack([np.clip(rgb, 0, 255), np.clip(a * 255, 0, 255)]).astype(np.uint8)
    ims.append(Image.fromarray(arr, 'RGBA'))
ims[0].save(OUT, save_all=True, append_images=ims[1:], duration=50, loop=0, quality=80, method=4)
print(OUT, os.path.getsize(OUT), len(ims))
