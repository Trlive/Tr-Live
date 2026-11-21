# SDUI ekran düzeni rehberi

Kalan 11 ekran yazılırken uyulacak kurallar. Amaç tek: **ekran her telefonda aynı
oranlarda, aynı mantıkla dursun.** Referans düzen: `migrations/106_sdui_help_layout.sql`.

## 1. Sayfa iskeleti — her ekran aynı sırayla kurulur

```
maxWidth (600)
  └─ column (padding 14, gap 10)
       ├─ title            ← ne olduğunu bir bakışta söyler
       ├─ içerik           ← grid / list / form / detay
       ├─ shape(line)      ← bölüm ayracı
       ├─ eylem            ← sayfanın asıl işi
       └─ safeArea(bottom) ← alt çentiğin altında içerik kalmasın
```

**`maxWidth` neden ilk?** Geniş ekranda (tablet, katlanabilir) bir satır 900 piksele
uzarsa okunmaz. 600 sınırı satırı insan gözünün rahat takip ettiği genişlikte tutar.

**`safeArea(bottom)` neden son?** Gezinme çubuğu ve çentik, sayfanın son öğesini yutar.
Bunu her ekranda tek tek düşünmek yerine iskelete koyuyoruz.

## 2. Sabit yükseklik YASAK — oran kullanılır

Sabit piksel yükseklik veren bir kart dar ekranda taşar, geniş ekranda sırıtır.

```json
{ "type": "aspectRatio", "w": 16, "h": 9, "children": [ { "type": "image", "url": "..." } ] }
```

Afişler 16:9, kare kartlar 1:1, dikey kartlar 3:4. Yükseklik yazmayın; **oran yazın**.

## 3. Süs ve simge için GÖRSEL DEĞİL, VEKTÖR

`icon`, `shape`, `progress` kodla çizilir. Üç kazanç:

- **Keskinlik.** PNG, 3x yoğunluklu ekranda bulanıklaşır; vektör her yoğunlukta nettir.
- **Hız.** İndirme yok: ekran anında açılır, çevrimdışı da çizilir.
- **Tema.** Rengini `tone`'dan alır; marka rengi ya da gece/gündüz değişince kendi uyar.

`image` yalnızca **gerçek fotoğraf** içindir (afiş, avatar, ürün). Simge, çerçeve, ayraç,
rozet, ilerleme halkası → vektör.

| İstenen | Doğru | Yanlış |
|---|---|---|
| Konu simgesi | `icon` | 24×24 PNG |
| Bölüm ayracı | `shape: line` | 1px çizgi görseli |
| Yüzde göstergesi | `progress: ring` | animasyonlu GIF |
| Yuvarlak çerçeve | `shape: ring` | çerçeve PNG'si |
| Etkinlik afişi | `image` + `aspectRatio` | — |

## 4. Boşluk bir karardır

`spacer` kullanın, her bileşene rastgele `padding` vermeyin. Dikey ritim: bölüm arası
**12–16**, bölüm içi **6–10**. İki farklı değer yeter; üçüncüsü dağınıklıktır.

## 5. Renk: serbest kod yok, ROL var

`tone`: `default · muted · primary · success · warning · danger · gold`. Serbest renk kodu
şema tarafından reddedilir — sunucunun siyah üstüne siyah bir ekran üretebilmesi
istenmiyor, ve tema tek yerden değişebilsin.

## 6. Boş durum ve hata her ekranda olmalı

Veri gelmediğinde boş ekran gösteren sayfa, bozuk sayfadan ayırt edilemez.
`repeater` kullanırken `emptyText` yazın ya da `emptyState` bileşeni koyun.

## 7. WebView sayfaları (oda içi etkinlikler)

Oda üstünde açılan sayfalar **küçük bir pencerede** çalışır, tam ekranda değil.

- `<!doctype html>` ve `<meta name="viewport" content="width=device-width,initial-scale=1">`
  **zorunludur**. Biri eksikse Android WebView sayfayı ~980px sanal ekrana çizip küçültür
  ve sayfa "ekran görünümünü kaybeder". `tek.html`de tam bu olmuştu (v2.148.2).
- Yükseklik `100%` ile alınır; sabit piksel verilmez. Pencere 300–500 px arası olabilir.
- `@media (max-height: ...)` ile alçak pencereye uyum yazın.
- `tools/webview_pages.mjs` bu kuralı `npm run check` içinde denetler.
