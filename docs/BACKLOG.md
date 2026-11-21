# Sıradaki işler

Sahibinin 21 Kasım'da verdiği sıra. **Önce 11 ekran bitecek**, sonra aşağıdakiler.

## 0. Devam eden — SDUI v2 ile 11 ekran

Pilot (Yardım) bitti. Kalan: etkinlik listesi · etkinlik detayı · gelen kutusu ·
kampanya · ilişkiler · aile · ajans · bayi · ayarlar · başvuru formu · profil bölümleri.
Mimari kurallar: `docs/SDUI_LAYOUT_GUIDE.md`.

## 1. Ludo — zar

- **Atılan zarın sonucu ekranda GÖRÜNMÜYOR.** (hata)
- Zar görseli daha iyi olacak.
- **6 kuralı:** oyuncu 6 atarsa taş oynatılmayacak; tekrar zar atıp **2 ya da 3 sonucu
  birlikte** oynayacak.

## 2. Oyun hızı

TEK ve Ludo daha hızlı olacak (tur/animasyon süreleri).

## 3. Hediye sistemi — görsel kalite

- Hediyelerin **şeffaflık (alfa) kalitesi çok kötü**; bazıları ne olduğu anlaşılmayacak
  durumda. Bunu ben yapmışım, düzeltmek de bende.
- Sahibinin gönderdiği referans listesiyle karşılaştırılacak:
  SVGA oynatımı · Lottie oynatımı · alfa kanallı video desteği · **şeffaf arka plan
  testleri** · hediye boyutuna göre optimizasyon · ön yükleme · animasyon hata durumunda
  alternatif görsel · aynı anda birden fazla animasyon · çoklu efekt çakışma yönetimi ·
  düşük RAM cihazlarda test.
- Kural: bütün hediyeler aynı çözünürlük/dosya boyutunda olmamalı; efektin türüne göre
  uygun paket seçilmeli.
- **Neden kritik:** bu düzelmeden yüklenecek hediyeler de çöp olur.

## 4. Asset güvenliği (aynı belgeden)

Dosya türü yalnızca uzantıdan belirlenmemeli · MIME doğrulaması · zararlı dosya taraması ·
ZIP bombası koruması · arşiv açarken klasör dışına taşma engeli · paket indirmede imza
doğrulaması · yüklenen dosyalar güvenli alanda · özel dosyalar için süreli erişim bağlantısı.
