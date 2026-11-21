# TR Live — Mimari Denetim (ARCHITECTURE_AUDIT)

**İlk sürüm:** v2.130.0 · **Güncellendi:** v2.131.1 · **Tarih:** 21 Kasım 2026
**Durum:** hibrit mimariye geçiş öncesi temel denetim · **P0 tamamlandı** (hazırlık ortamı bilinçli olarak kurulmadı)

Bu belge hibrit mimariye geçmeden önce yapılan **zorunlu ilk adımdır**. Amacı, kodda neyin
gerçekten var olduğunu ölçmek ve her maddeyi dört karardan birine bağlamaktır. Bu belge
tamamlanmadan kod yapısı değiştirilmez.

Buradaki her bulgu **kaynak kodun okunmasıyla** çıkarılmıştır; varsayım yoktur. Her satırın
yanında kanıt dosyası vardır. Doğrulanamayan konular 12. bölümde ayrıca listelenir.

## Karar anahtarı

| İşaret | Anlamı |
|---|---|
| 🟢 **KORUNACAK** | Çalışıyor ve hedef mimariye uygun. Dokunulmayacak. |
| 🟡 **GELİŞTİRİLECEK** | Çalışıyor ama hedefe yetmez. Üstüne eklenecek. |
| 🔴 **DÜZELTİLECEK** | Bugün risk veya hata var. Önce bu kapatılacak. |
| 🔵 **EKLENECEK** | Yok. Sıfırdan yapılacak. |

Öncelik: **P0** geçişten önce · **P1** geçişle birlikte · **P2** geçişten sonra · **P3** büyüme.

## Mimari ilke (bu belgenin ve sonraki tüm işlerin kuralı)

> **Minimum yerel kod, maksimum dinamik içerik — ancak ses, görüntü, kimlik doğrulama, güvenlik ve
> finansal işlemler güvenilir native/backend katmanlarında kalır.**

Sınır şöyle çizilir:

| Katman | Nerede çalışır | Örnek |
|---|---|---|
| **Görünüm** | WebView / sunucudan gelen yapılandırma | Oyun ekranı, etkinlik sayfası, kampanya, bayi ekranı, cüzdan ekranının **görseli** |
| **Karar** | Yalnızca backend | Bakiye düşme, hediye gönderme, Elmas kazanma, oyun sonucu, çekim onayı |
| **Donanım ve oturum** | Yalnızca native (Flutter/Kotlin/Swift) | Mikrofon, kamera, LiveKit bağlantısı, oturum anahtarının saklanması |

Değişmez kural: **istemci — Flutter da olsa WebView de olsa — kendi başına bakiye üretemez ve bir
finansal işlemi kesinleştiremez.** Bu belgedeki [F-01](#f-01) bulgusu tam olarak bu kuralın
çiğnendiği yerdi ve kaldırıldı.

Pratikte bu, büyük platformların yaptığının aynısıdır: oyunlar, etkinlikler ve yardımcı ekranlar
web katmanına taşınır; hediye gönderimi ve cüzdan kararları sunucuda kalır. Oyun ekranının
WebView olması, oyunun **sonucunu** oyunun belirleyeceği anlamına gelmez — sonucu yine sunucu üretir.

---

## 1. Yönetici özeti

TR Live, "yeniden yazılması gereken bir prototip" değil. Ölçülen hâliyle **modüler, testli ve
güvenlik katmanları kurulmuş** bir sistem. Bu denetimin en önemli sonucu şudur:

> Elimizdeki plan, mevcut kodun bir kısmını olduğundan zayıf varsayıyor. "Backend'i modülerleştir"
> gibi bazı maddeler **zaten yapılmış**; "Oracle'a geç", "NestJS'e geç", "mikroservise böl" gibi
> bazıları ise bu ölçekte **zarar verir**. Yapılacak iş, baştan yazmak değil, **beş gerçek boşluğu
> kapatmak**tır.

### Bugün en çok risk taşıyan beş şey

| # | Bulgu | Neden kritik | Karar |
|---|---|---|---|
| 1 | ~~Eski oyun API'si sonucu istemciden alıyor~~ | Oyuncu kendi kazancını belirleyebiliyordu. | ✅ Kapandı (v2.131.0) — [F-01](#f-01) |
| 2 | Oyun paketleri sunucuda tam yetkiyle çalışıyor | Yetki daraltıldı (v2.147.0): paket yalnızca kendi tablolarını görür. Ayrı süreçte çalıştırma (adım 3) kaldı. | 🟢 — [O-01](#o-01) |
| 3 | ~~Bakiye ile işlem defteri arasında mutabakat yok~~ | Kaçak sessizce kalırdı. | ✅ Kapandı (v2.131.0) — [F-02](#f-02) |
| 4 | Tek sunucu örneği sınırı (bellek içi durum) | İkinci sunucu açıldığı an oda/soket/limit bozulur. | 🟡 P1 — [G-01](#g-01) |
| 5 | Medya dosyaları PostgreSQL içinde | Veritabanı şişer, maliyet ve yedek süresi büyür, CDN yok. | 🟡 P1 — [V-02](#v-02) |

### Bugün en güçlü beş şey (korunacak)

1. **Para işlemleri atomik.** 104 transaction, 111 satır kilidi, sıralı kilitleme ile deadlock
   koruması, BigInt ile tam sayı aritmetiği. (`backend/src/routes/gifts.js:166-178`)
2. **19 para ucunda idempotency.** Aynı istek iki kez giderse para iki kez gitmiyor.
   (`backend/src/idempotency.js`)
3. **Gerçek test altyapısı.** 33 birim test dosyası + 2.038 satırlık uçtan uca test; içinde **766
   doğrulama**, bunların **100'ü yetki reddi senaryosu** ("başkasının bakiyesi görünmemeli" gibi).
   (`backend/e2e/api.e2e.js`)
4. **Katmanlı güvenlik.** nginx + fail2ban + uygulama içi WAF + 127 uç bazlı hız sınırı +
   oturum/cihaz yönetimi + çalıntı token tespiti.
5. **Veri bütünlüğü kısıtları.** 132 tablo, 226 yabancı anahtar, 182 CHECK, 38 UNIQUE,
   190 alanın tamamı `TIMESTAMPTZ` (yerel saat karmaşası yok).

---

## 2. Envanter (ölçülen gerçek sayılar)

| Katman | Dosya | Satır | Not |
|---|---:|---:|---|
| Backend (`backend/src`) | 286 | 25.210 | 38 rota dosyası, 50 servis dosyası |
| Mobil (`mobile/lib`) | 120 | 47.709 | 34 ekran, 4 dil (tr/en/ar/hi) |
| Web paneller (`web/panel/src`) | 105 | 13.066 | 47 sayfa (admin / ajans / bayi) |
| Dağıtım (`deploy`) | 21 | 254 | docker-compose, nginx, ufw, fail2ban, livekit, yedek |

**API:** 449 uç · **Veritabanı:** 132 tablo, 133 indeks, 87 migration ·
**Test:** 33 backend testi + 2.038 satır e2e (766 doğrulama) + 4 Flutter testi · **CI:** 6 iş akışı

Kodda **0 adet TODO/FIXME** ve taramada **gömülü gizli anahtar bulunmadı**. Bu, terk edilmiş
yarım iş olmadığını gösterir.

### En büyük dosyalar (bölünmesi gerekenler)

| Dosya | Satır | Değerlendirme |
|---|---:|---|
| `mobile/lib/screens/room_screen.dart` | 5.359 | 🔴 Tek ekranda oda, mikrofon, hediye, PK, oyun, sohbet. Bakımı en zor yer. |
| `backend/src/routes/admin.js` | 2.306 | 🟡 128 uç tek dosyada. Çalışıyor ama bölünmeli. |
| `mobile/lib/widgets/room_pk.dart` | 1.799 | 🟡 |
| `mobile/lib/screens/family_screen.dart` | 1.490 | 🟡 |
| `backend/src/routes/rooms.js` | 1.195 | 🟡 43 uç. |

Buna karşılık `backend/src/server.js` yalnızca **353 satır**: kurulum, rota bağlama ve kapanış.
İş mantığı rotalara ve servislere dağılmış durumda. **Planın "tek dosyada monolit" varsayımı
bu kod için doğru değil.**

---

## 3. Bulgular — Mimari ve kod yapısı

<a id="a-01"></a>
### A-01 · Backend modülerliği — 🟢 KORUNACAK

**Mevcut:** 38 rota + 50 servis dosyası; `server.js` yalnızca birleştirme yapıyor. Rota =
HTTP/doğrulama, servis = iş mantığı ayrımı büyük ölçüde uygulanmış.
**Hedef:** Modüler monolit. **Zaten bu.**
**Yapılacak:** Yeniden yazım **yok**. Sadece `admin.js` (2.306 satır) ve `rooms.js` (1.195 satır)
konularına göre bölünecek.
**Tamamlanma:** Hiçbir rota dosyası 800 satırı geçmiyor; testler aynı sonucu veriyor.

**Durum (v2.133.0):** Modül standardı yazıldı (`docs/MODULE_STANDARD.md`) ve finansal olmayan
14 modül taşındı (34 dosya): `auth, user, room, chat, music, game, family, relation, event,
store, feed, analytics, moderation, system`. Taşıma sırasında mantığa dokunulmadı; güvenlik ağı
olarak `tools/route_map.mjs` + `test/route_map.test.js` eklendi (49 bağlama, 467 adres — taşımadan
sonra birebir aynı). `routes/` altında 9 dosya kaldı: finansal modüller (`gifts`, `usd`, `dealers`,
`agencies`, `agency_center`, `luckybag`) ve `admin.js` (2.391) + `admin_panel.js`. Bunlar bilerek
sonraya bırakıldı — hata maliyeti en yüksek alan, desen diğer yerlerde oturduktan sonra taşınır.

<a id="a-02"></a>
### A-02 · Express → NestJS geçişi — 🟢 KORUNACAK (geçiş YAPILMAYACAK)

**Mevcut:** Express 5, ham SQL, `ws`. Testli ve çalışıyor.
**Karar:** Framework değiştirmek kullanıcıya hiçbir şey kazandırmaz; 25 bin satırı yeniden yazma
riski getirir. **Gerçek bir ihtiyaç doğana kadar yapılmayacak.** (`docs/YOL_HARITASI.md` ile aynı yönde.)

<a id="a-03"></a>
### A-03 · Mobil mimari ve durum yönetimi — 🟡 GELİŞTİRİLECEK · P1

**Mevcut:** Durum yönetimi kütüphanesi yok; **520 `setState` çağrısı**; `room_screen.dart` 5.359 satır.
`Session` sınıfı 31 satırlık bir `ValueNotifier` sarmalayıcısı (`mobile/lib/services/session.dart`).
**Risk:** Yeni özellik eklemek bu ekranda giderek pahalılaşıyor; hata ayıklaması zor.
**Yapılacak:** `room_screen.dart` parçalara ayrılacak (mikrofon ızgarası, hediye katmanı, sohbet,
PK, oyun yuvası ayrı widget + ayrı denetleyici). Kütüphane seçimi (provider/riverpod) **zorunlu değil**;
önce dosya bölünmesi yapılacak, kütüphane ihtiyacı o zaman ölçülecek.
**Tamamlanma:** Hiçbir Dart dosyası 1.200 satırı geçmiyor; `flutter analyze` temiz; oda ekranı
davranışı birebir aynı.

<a id="a-04"></a>
### A-04 · Web paneller — 🟢 KORUNACAK

**Mevcut:** Next.js statik panel, 47 sayfa, merkezi `api.ts` üzerinden `Authorization: Bearer`.
Oturum anahtarı **sessionStorage**'da (sekme kapanınca siliniyor) — `localStorage`'a göre doğru tercih.
**Yapılacak:** Yok. Panel zaten merkezi API'ye bağlı.

---

## 4. Bulgular — Kimlik, oturum, yetki

<a id="k-01"></a>
### K-01 · Oturum sistemi — 🟢 KORUNACAK

**Mevcut:** 1 saatlik erişim token'ı + 60 günlük yenileme token'ı; yenileme token'ı veritabanında
yalnızca SHA-256 özeti olarak; her kullanımda değişiyor; **çalıntı token tespiti** (eski token 15 dk
toleranstan sonra kullanılırsa oturum kapanıyor); kullanıcı başına 10 cihaz; uzaktan çıkış;
`token_version` ile toplu geçersizleştirme. (`backend/src/services/sessions.js`)
**Değerlendirme:** Bu, pek çok ticari uygulamadan daha iyi. Korunacak.

<a id="k-02"></a>
### K-02 · Eski 30 günlük token yolu — 🟡 GELİŞTİRİLECEK · P2

**Mevcut:** Cihaz bilgisi göndermeyen eski APK'lar hâlâ 30 günlük tek token alıyor
(`backend/src/routes/auth.js:25`). Uzun ömürlü token, çalınırsa 30 gün geçerli.
**Yapılacak:** Zorunlu güncelleme eşiği cihaz oturumlu sürümün üstüne çekildikten sonra bu yol
tamamen kaldırılacak.
**Tamamlanma:** `signToken` kodda kalmıyor.

<a id="k-03"></a>
### K-03 · Yetki modeli (RBAC) — 🟡 GELİŞTİRİLECEK · P2

**Mevcut:** `users.system_role` üç değer alıyor: `user`, `support`, `admin`
(`backend/src/migrations/004_profile_wip_agency.sql:26`). Oda, aile, ajans ve bayi yetkileri
kendi tablolarında sahiplik kontrolüyle çözülüyor (`rooms.js` içinde 24 sahiplik kontrolü).
**Boşluk:** Planın istediği `Roles / Permissions / UserRoles` izin matrisi yok. Bugün "yardımcı
admine yalnızca şikâyet ekranını aç" gibi ince ayar yapılamıyor; ya tam admin ya destek.
**Yapılacak:** Rol → izin tablosu eklenecek, mevcut üç rol bu tabloya taşınacak (davranış
değişmeden), sonra ince izinler açılacak.
**Tamamlanma:** Yeni bir izin eklemek kod değişikliği değil, panel kaydı gerektiriyor.

<a id="k-04"></a>
### K-04 · Yönetici işlemlerinde ikinci onay ve 2FA — 🟢 2FA ✅ KAPANDI (v2.143.0) · ikinci onay P2

**Mevcut:** Yönetici işlemleri kayda geçiyor (`financial_audit_logs`, 13 dosya yazıyor) ama
**2FA yok**, **hassas işlemde ikinci onay yok**, **yönetici paneli için IP kısıtı yok** (kodda
`ADMIN_IP` benzeri bir kontrol bulunamadı).
**Risk:** Tek bir admin şifresi ele geçerse sınırsız Coin yüklenebilir.
**Yapılacak:** (a) Admin girişinde TOTP; (b) belirli eşiğin üstündeki Coin yüklemesi ve çekim
onayında ikinci yönetici onayı; (c) panel için isteğe bağlı IP listesi.
**Tamamlanma:** Tek yöneticinin tek başına yapabileceği azami parasal etki tanımlı ve sınırlı.

---

## 5. Bulgular — Finans (Coin / Diamond / Hil Coin)

<a id="f-00"></a>
### F-00 · İşlem bütünlüğü — 🟢 KORUNACAK

**Mevcut (hediye akışı, `backend/src/routes/gifts.js`):**
- Tek transaction içinde: gönderen kilitleniyor, bakiye düşüyor, alıcılar artıyor,
  `gift_transactions` ve `wallet_transactions` yazılıyor.
- Deadlock koruması: ilgili tüm kullanıcı satırları **tek sorguda, `ORDER BY id` ile** kilitleniyor
  (satır 166-168). Bu, çok alıcılı hediyelerde kilitlenmeyi önleyen doğru yöntemdir.
- Para `BigInt` ile hesaplanıyor; kayan nokta hatası yok.
- 19 para ucunda `Idempotency-Key` desteği; başarısız işlemde anahtar siliniyor, tekrar denenebiliyor.

**Değerlendirme:** Planın 6.2'de istediği maddelerin çoğu karşılanıyor. Korunacak.

<a id="f-01"></a>
### F-01 · Eski oyun API'si sonucu istemciden alıyor — ✅ **KAPANDI** (v2.131.0)

**Kanıt:** `backend/src/routes/activities.js:255-284`
```
POST /api/activity-play/:id/settle   { token, roundId, multiplier }  → ödeme = bahis × çarpan
```
Çarpanı **istemci gönderiyor**. Sunucu yalnızca üst sınırı (`max_multiplier`) kontrol ediyor.
Oyun biletini eline geçiren biri her turda azami çarpanı göndererek kasayı boşaltabilir.

**Bugün neden patlamıyor:** `activity_items.coin_play` varsayılanı `FALSE`
(`migrations/082_silver_and_activity_rounds.sql:21`) ve bu yol yalnızca o bayrak açıksa çalışıyor.
Yani **şu an kapalı**. Ayrıca imzalı, sunucudan sunucuya çalışan güvenli bir alternatif zaten var
(`providerRouter`, HMAC-SHA256 + `app_secret`).

**Yapıldı (v2.131.0):** `/bet` ve `/settle` uçları, `coin_play` bayrağı ve bahis/çarpan sınırı
sütunları kaldırıldı (migration `091_remove_client_settle.sql`). `playRouter`'da yalnızca salt
okunur `/me` kaldı. TRGame SDK'sındaki `bet/settle/play` çağrıları, sebebi açıklayan bir hata
döndürür (sessizce başarısız olmaz). Panelde Coin bahsi alanları kaldırıldı, yerine sunucu
otoriter iki yolu anlatan uyarı kondu. Geçmiş turlar (`activity_rounds`) denetim için duruyor.
**Doğrulama:** `test/activity_games.test.js` — kaynak kodda `playRouter` altında `/:id/me`
dışında uç kalmadığını ve `coin_play` geçmediğini sınar.
**Sonuç:** Coin ile oynanan oyun artık yalnızca iki yoldan çalışır: oyun paketi (motor sunucuda)
ya da imzalı sağlayıcı API'si.

<a id="f-02"></a>
### F-02 · Mutabakat (bakiye ↔ işlem defteri) — ✅ **KAPANDI** (v2.131.0)

**Mevcut:** Bakiye `users.coins` / `users.diamonds` sütunlarında tutuluyor; hareketler ayrıca
`wallet_transactions` tablosuna yazılıyor. İkisini **karşılaştıran hiçbir kontrol yok** — kodda
"mutabakat/reconcile" araması boş döndü.
**Risk:** Bir uçta defter yazılmayı atlasa veya bir hata bakiyeyi defterden farklı değiştirse,
bu **hiçbir zaman fark edilmez**. Para sisteminde en tehlikeli durum budur: kayıp sessizdir.
**Önce ölçüldü:** Bakiyeyi değiştiren **28 kod yolunun tamamı**, aynı transaction içinde işaretli
bir `wallet_transactions` satırı yazıyor (harcama eksi, kazanç artı). Yani defter eksiksiz ve
mutabakat anlamlı. Bu doğrulanmadan mutabakat yazılsaydı her gün yanlış alarm verirdi.
**Yapıldı (v2.131.0):** `services/reconcile.js` + migration `092_wallet_reconcile.sql`.
Kullanıcı başına doğrulanan eşitlik:
`users.coins - taban.coins == Σ(tüm defter) - taban.led_coins`.
Taban bir kez alınır ve o andaki bakiyeyle o andaki defter toplamını **birlikte** saklar; iki taraf
da tek sorguda okunduğu için araya giren hediye iki tarafta da görünür ya da iki tarafta da
görünmez — zaman penceresinden doğan yanlış alarm yok. Günde bir otomatik çalışır, panelden elle
de çalıştırılır. Fark bulunursa `financial_audit_logs`'a `reconcile_mismatch` alarmı yazılır ve
kayıt siz kapatana kadar her çalışmada görünmeye devam eder.
**Doğrulama:** `test/reconcile.test.js` — kurallara uyan hareketi geçiriyor, defter yazılmadan
yapılan bakiye değişimini (700 Coin) yakalıyor, alarmı yazıyor, yalnızca bozuk kullanıcıyı
işaretliyor.
**Panel:** Mali kayıtlar → **Mutabakat**. Açık fark varsa sayfanın üstünde kırmızı uyarı çıkar.

### Basım bütçeleri (v2.131.0 — plandan sonra eklendi)

Sıfırdan üretilen (satın alınmamış) Coin artık kategoriye ve aylık bütçeye bağlı:
**Yazılım testi · Etkinlik ödülü · Kullanıcı telafisi · Pazarlama.**

Neden ayrı tutuluyor: basılan Coin hediye edilince yayıncının elmasına, elmas da çekim talebiyle
gerçek paraya dönüşür. Yani "bedava verilen" Coin şirketin gerçek maliyetidir ve gelir tablosunu
satın alınan Coin'den ayırmadan okumak yanıltıcıdır. `coin_issuances` tablosu "kim, ne zaman,
kime, hangi bütçeden, neden" sorusunu cevaplar; aylık sınır bu maliyetin tek kontrolüdür
(migration `093_coin_budgets.sql`, panel: Mali kayıtlar → **Basım bütçesi**).

Yönetici Coin yüklerken bütçe seçmezse kayıt eskisi gibi "Yönetici düzenlemesi" kalır — çünkü her
yükleme basım değildir, bir kısmı satın alma karşılığıdır.


<a id="f-03"></a>
### F-03 · Üç hesap ayrımı — 🟢 KORUNACAK

**Mevcut:** Coin, Diamond ve dolar cüzdanı (`usd_transactions`, `usd_withdrawals`,
`usd_coin_exchanges`) ayrı tablolarda; karıştırılmamış. Planın 6.1'deki şartı karşılanıyor.

<a id="f-04"></a>
### F-04 · Mağaza ödemesi (Google Play / Apple) — 🔵 EKLENECEK · P1

**Mevcut:** Sunucu tarafında makbuz doğrulaması yok; Coin yükleme bayi üzerinden yapılıyor.
**Risk:** Uygulama içi satın alma başlatıldığı anda, doğrulamasız bir akış sahte makbuzla
bedava Coin demektir. Ayrıca Play/App Store kuralları uygulama içi dijital ürün satışında
kendi ödeme sistemlerini zorunlu tutuyor.
**Yapılacak:** Play Billing + App Store Server API ile **sunucu tarafı** makbuz doğrulaması,
her satın alma için benzersiz referans, tekrar gelen webhook'ta işlem tekrarı olmaması.
**Not:** Bu madde hukuki tarafı da olan bir iştir; mağaza hesabı açılmadan koda başlanmamalı.

<a id="f-05"></a>
### F-05 · Çekim sistemi — 🟡 GELİŞTİRİLECEK · P2

**Mevcut:** Çekim talebi, yönetici onayı/reddi, ödeme kaydı, idempotency var
(`backend/src/routes/usd.js`, `services/usd_wallet.js`, `services/payouts.js`).
**Boşluk:** KYC/kimlik doğrulama akışı kodda yok; çekim limitleri ve komisyon kuralları
sabit koda yakın.
**Yapılacak:** KYC ekranı + belge saklama (süreli), limitlerin panelden yönetimi.
**Uyarı:** Çekim, kripto ve yayıncı geliri Türkiye'de vergi ve ödeme kuruluşu mevzuatına tabidir.
Teknik olarak bakiye yazabilmek, o parayı her yöntemle ödeyebileceğin anlamına gelmez. Bu madde
**mali müşavir/avukat onayı olmadan** canlıya alınmamalı.

---

## 6. Bulgular — Veritabanı

<a id="v-01"></a>
### V-01 · Şema ve bütünlük — 🟢 KORUNACAK

132 tablo, 226 yabancı anahtar, 182 CHECK, 38 UNIQUE, 133 indeks (kısmi indeksler dahil:
`idx_gift_tx_agency_time ... WHERE receiver_agency_id IS NOT NULL`). Tarih alanlarının
**tamamı `TIMESTAMPTZ`** (190 kullanım, 0 adet saat dilimsiz `TIMESTAMP`). Sıcak tabloların
hepsinde zaman + sahip indeksi var.
**Karar:** PostgreSQL **korunacak**. Oracle'a veya dağıtık veritabanına geçmek için teknik bir
gerekçe yok; "Bigo TiDB kullanıyor" bir gerekçe değildir.

<a id="v-02"></a>
### V-02 · Medya dosyaları veritabanında — 🟢 ✅ KAPANDI (v2.137.0)

**Kanıt:** `migrations/018_media_files.sql` — profil fotoğrafı, kapak, gönderi görselleri
`media_files` tablosunda **BYTEA** olarak; `/media/:id` ucu bunları Node üzerinden veriyor
(`server.js:106-122`, bellek içi önbellekle).
**Neden böyle yapılmış:** Barındırma diski her dağıtımda sıfırlandığı için görseller kayboluyordu.
Doğru bir acil çözümdü.
**Neden kalmamalı:** Her görsel veritabanı boyutunu, yedek süresini ve maliyeti artırıyor;
her görsel isteği uygulama sunucusunun CPU'sunu ve bağlantı havuzunu yiyor; CDN yok.
**Yapılacak:** Cloudflare R2 (veya eşdeğeri) + CDN. Adresler değişmeyecek: `/media/:id` yönlendirme
yapacak, böylece eski uygulama sürümleri bozulmayacak. Geçiş tek betikle, çift yazma dönemiyle.
**Tamamlanma:** `media_files` tablosu boş; görseller CDN'den geliyor; veritabanı boyutu düşüyor.

<a id="v-03"></a>
### V-03 · Yedek ve geri yükleme provası — ✅ **KAPANDI** (v2.131.1)

**Mevcut:** `deploy/backup.sh` — günlük `pg_dump`, gzip, 14 gün saklama, cron ile.
**Boşluk:** **Geri yükleme hiç denenmemiş.** Denenmemiş yedek, yedek değildir. Ayrıca sürekli
arşivleme (WAL/PITR) yok: son yedekten sonraki saatler kaybolur.
**Yapıldı (v2.131.1):**
- `deploy/backup.sh` artık yedeği aldıktan sonra **doğruluyor**: gzip bütünlüğü, dump'ın tamamlandığını
  gösteren bitiş satırı, şüpheli küçüklük kontrolü ve SHA-256 özeti. Yarım kalan dosya `.partial`
  olarak kalır, geçerli yedeğin üzerine yazmaz.
- `deploy/restore_test.sh` (yeni): en son yedeği **geçici** bir veritabanına geri yükler, kritik
  tabloları ve kullanıcı sayısını denetler, **bakiye ↔ defter mutabakatını yedek üzerinde de** sınar,
  geri yükleme süresini yazar ve geçici veritabanını siler. Üretime dokunmaz. Ayda bir cron.
- `deploy/README.md`'ye cron satırları ve sunucu dışı kopya uyarısı eklendi.
**Doğrulama:** Prova gerçek PostgreSQL üzerinde uçtan uca çalıştırıldı (yedek al → doğrula →
geçici veritabanına yükle → 143 tablo, 92 migration, mutabakat farkı 0 → temizle).
**Kalan:** Sunucu dışı kopya ve PITR hâlâ operasyonel bir karar — P1'de ele alınacak.

<a id="v-04"></a>
### V-04 · Migration disiplini — 🟢 KORUNACAK

87 migration, `schema_migrations` tablosu, advisory lock ile aynı anda iki sürecin çalışmasını
engelleme, her dosya kendi transaction'ında (`backend/src/migration_runner.js`). Doğru kurulmuş.

---

## 7. Bulgular — Gerçek zamanlı katman

<a id="g-01"></a>
### G-01 · Tek sunucu örneği sınırı — 🟡 GELİŞTİRİLECEK · P1

**Kanıt:** `backend/src/realtime.js:79` — *"Tek sunucu örneği için bellek içi hub. Birden fazla
örnek çalıştırılacaksa Redis pub/sub gerekir."* Aynı durum `combo.js:2` ve hız sınırlayıcı için
de geçerli. Kod bunu zaten dürüstçe belgelemiş.
**Sonuç:** Bugün sistem **tek sunucu örneğiyle sınırlı**. İkinci örnek açılırsa: odadaki mesajlar
yalnızca aynı örnekteki kullanıcılara gider, hız sınırları ikiye katlanır, combo sayacı bozulur.
**Yapılacak:** Redis pub/sub (hub), Redis tabanlı hız sınırı ve önbellek. Bu, ölçeklenmenin
**tek önkoşulu**.
**Tamamlanma:** İki örnek aynı anda çalışırken aynı odadaki iki kullanıcı farklı örneklere düşse
bile mesajlar, hediye şeritleri ve limitler doğru çalışıyor.

<a id="g-02"></a>
### G-02 · WebSocket protokolü — 🟡 GELİŞTİRİLECEK · P2

**Mevcut:** Kimlik doğrulamalı bağlantı, oda aboneliğinde üyelik kontrolü, 8 KB mesaj sınırı,
kullanıcı başına 5 / IP başına 300 bağlantı, kalp atışı, kapanışta 1012 ile düzgün kapatma.
**Boşluk:** Planın 8.2'de istediği **sıra numarası (sequence) yok**. Bağlantı koptuğunda
kaçırılan olaylar yeniden gönderilmiyor; uygulama tam durumu yeniden çekiyor.
**Yapılacak:** Olaylara artan sıra numarası + yeniden bağlanınca "şu numaradan sonrasını ver".
**Tamamlanma:** Ağ 10 sn kopup döndüğünde oda durumu tam yeniden yüklenmeden tutarlı kalıyor.

<a id="g-03"></a>
### G-03 · LiveKit token güvenliği — 🟢 KORUNACAK

**Kanıt:** `backend/src/livekit.js` — token yalnızca sunucuda üretiliyor, 2 saat ömürlü, tek odaya
bağlı, `canPublish` ayrı kontrol ediliyor, **`canPublishData: false`** (veri kanalı kapalı; olaylar
kendi WebSocket'imizden gidiyor). Planın 7.1'deki şartlarının tamamı karşılanıyor.

<a id="g-04"></a>
### G-04 · LiveKit webhook'ları — 🔵 EKLENECEK · P2

**Mevcut:** Kodda LiveKit webhook işleyicisi **yok**.
**Risk:** Ses sunucusu tarafında bir katılımcı düşerse, uygulama veritabanındaki koltuk durumu
gerçekle ayrışabilir ("hayalet koltuk").
**Yapılacak:** `room_started/finished`, `participant_joined/left` olayları işlenecek; her olay
benzersiz kimliğiyle kaydedilip **tekrarı tanınacak** (LiveKit teslimat garantisi vermez,
aynı olayı iki kez gönderebilir).
**Tamamlanma:** Ses bağlantısı kopan kullanıcının koltuğu en geç 30 sn içinde serbest kalıyor.

---

## 8. Bulgular — Oyun platformu ve WebView

<a id="o-01"></a>
### O-01 · Oyun paketleri tam yetkiyle çalışıyor — 🟡 adım 1 ✅ (v2.131.1) · adım 2 ✅ (v2.147.0) · adım 3 P2

**Mevcut:** Panelden yüklenen oyun paketi, sunucu sürecinin **içinde** çalışıyor ve kendisine
`query`, `tx`, cüzdan ve hub veriliyor (`backend/src/services/plugins.js`). Yükleme yetkisi
yalnızca süper adminde ve paket dosyaları veritabanında saklanıyor — bu kısım doğru.
**Risk:** Kötü niyetli ya da hatalı bir paket, **veritabanının tamamına** erişebilir; kendi
tablosunun dışına yazabilir. Bugün paketleri biz üretiyoruz, ama bu model "oyun paketi satın al,
yükle" senaryosunda kabul edilemez.
**Yapılacak (kademeli):**
1. ✅ **Yapıldı (v2.131.1):** Paket yükleme ekranında açık uyarı; her paketin SHA-256 özeti ve
   yükleyen yönetici `game_plugins`'e yazılıyor; yükleme / açma / kapatma / yeniden başlatma /
   kaldırma `game_plugin_audit` tablosuna düşüyor ve panelde "Paket kayıtları" tablosunda görünüyor.
   Aynı dosya ikinci kez yüklenirse ("içerik değişmemiş") uyarılıyor; yeni sürüm yüklenince
   değiştirilen sürümün özeti kayda geçiyor. Test: `test/plugin_audit.test.js`.
2. **P1:** Pakete verilen arayüzün daraltılması: ham `query`/`tx` yerine yalnızca kendi tablolarına
   ve cüzdana erişen dar bir API.
3. **P2:** Paketin ayrı bir süreçte (worker) çalıştırılması; çökerse ana sunucuyu etkilememesi.
**Tamamlanma:** Bir paket, kendi tabloları ve cüzdan API'si dışında hiçbir veriye erişemiyor.

<a id="o-02"></a>
### O-02 · Oyun paketlerinin koddan ayrılması — 🟢 KORUNACAK

Oyun kodu ana depoda bulunmuyor; paket olarak yükleniyor (v2.130.0). Bu, hem satış modelini
hem de "ana kodu sat, oyunları ayrı sat" ayrımını koruyor. Hibrit mimaride de aynı kalacak.

<a id="o-03"></a>
### O-03 · WebView alan adı kısıtı yok — 🟢 ✅ KAPANDI (v2.139.0)

**Kanıt:** `mobile/lib/widgets/external_webview.dart:84-92` — `onNavigationRequest`
`http`, `https`, `about`, `data`, `blob` şemalarının **tamamına** izin veriyor; alan adı listesi yok.
**Risk:** Oyun sayfası WebView'ı başka bir adrese yönlendirebilir; düz `http` de kabul ediliyor.
**İyi tarafı:** JavaScript köprüsü (`TrLiveBridge`) yalnızca `close` komutunu kabul ediyor —
en az yetki ilkesi doğru uygulanmış.
**Yapılacak:** Yalnızca kendi alan adımız + panelden tanımlı beyaz liste; `http` reddedilecek.
**Tamamlanma:** Beyaz liste dışına çıkmaya çalışan sayfa engelleniyor ve olay kayda geçiyor.

<a id="o-04"></a>
### O-04 · Ortak oyun protokolü — 🔵 EKLENECEK · P2

Planın 11.1'de istediği Game Registry / Lobby / Matchmaking / Session / Reconnect / Anti-Cheat
katmanı **ortak bir çerçeve olarak yok**; her oyun kendi mantığını kuruyor (Ludo, TEK, paketler).
İkiden fazla oyun olduğu için artık ortak çerçeve mantıklı.
**Yapılacak:** Oyun paketi SDK'sı: oturum, tur, hamle, zaman aşımı, yeniden bağlanma ve sonuç
kaydı tek yerden. **Not:** Bu iş, O-01'deki dar API ile birlikte yapılmalı; ikisi aynı arayüz.

---

## 9. Bulgular — Güvenlik ve moderasyon

<a id="s-01"></a>
### S-01 · SQL enjeksiyonu — 🟢 KORUNACAK

Tüm değerler parametreli (`$1, $2`). Dinamik SQL var ama değişken olan kısımlar **yalnızca
kod içindeki sabit listelerden** geliyor (`sets.join()`, sabit tablo adları, `COLS` dizisi).
Kullanıcı girdisinin tablo/sütun adına dönüştüğü bir yer bulunmadı.

<a id="s-02"></a>
### S-02 · Yetki (IDOR) kontrolleri — 🟢 KORUNACAK

`me.js` içinde 63 kez `req.user.id` (başkasının kimliği parametreden alınmıyor), `rooms.js`
içinde 24 sahiplik/üyelik kontrolü, başka kullanıcı okunurken engellenen kişiler SQL'de
filtreleniyor ve hassas alanlar seçilmiyor. e2e testinde **100 yetki reddi senaryosu** var;
içlerinde "başkasının bakiyesi görünmemeli", "odada olmayan hediye gönderemez",
"üye sahibi atamaz" gibi açık IDOR testleri bulunuyor.

<a id="s-03"></a>
### S-03 · Mobil güvenlik: token saklama — 🟡 GELİŞTİRİLECEK · P2

**Mevcut:** Erişim ve yenileme token'ları `SharedPreferences` içinde düz metin
(`mobile/lib/services/auth_service.dart:24-41`). Köklü olmayan cihazda uygulama özel alanı
korumalıdır; köklü cihazda okunabilir.
**Yapılacak:** Android Keystore / iOS Keychain destekli güvenli depolama.
**Tamamlanma:** Token'lar işletim sistemi anahtar deposunda.

<a id="s-04"></a>
### S-04 · `sslPinning` ve `blockRooted` ayarları boşta — 🟢 ✅ KAPANDI (v2.143.0)

**Kanıt:** `backend/src/services/app_config.js:47-50` — iki ayar tanımlı ve kodda şu not var:
*"İstemci henüz okumuyor (varsayılan kapalı, davranış değişmez)."* Mobil tarafta `sslPinning`
veya `blockRooted` geçen **tek satır bile yok**.
**Risk:** Panelde görünen ama hiçbir şey yapmayan güvenlik ayarı, **yanlış güven** yaratır.
Yönetici "SSL pinning açık" sanır.
**Yapılacak:** İki yoldan biri — ya uygulamada gerçekten uygulanacak, ya panelden kaldırılacak.
Önerim: önce panelden kaldır (yanlış güveni bitir), kendi alan adına geçtikten sonra gerçek
pinning'i ekle (sertifika değişiminde uygulamayı kilitlememek için yedek pin'le birlikte).

<a id="s-05"></a>
### S-05 · CORS varsayılanı açık — 🟢 ✅ KAPANDI (v2.143.0)

**Kanıt:** `backend/src/config.js:33` — `CORS_ORIGIN` tanımlı değilse varsayılan `*`.
Token `Authorization` başlığıyla taşındığı için tarayıcıdan oturum çalınması riski düşük,
ama gereksiz geniş.
**Yapılacak:** Üretimde `*` reddedilecek (`validateConfig` içinde kontrol), panel ve oyun
adresleri açıkça listelenecek.

<a id="s-06"></a>
### S-06 · Moderasyon — 🟢 ✅ KAPANDI (v2.144.0) · itiraz akışı P2

**Mevcut:** Şikâyet, engelleme, oda yasağı, metin filtresi (link/telefon), otomatik susturma,
yönetici kayıtları, hesap silme ve veri saklama temizliği var.
**Boşluk:** Tek bir **moderasyon kuyruğu ekranı** yok; şikâyetler ve otomatik ihlaller ayrı yerlerde.
Yüklenen görseller için içerik kontrolü yok.
**Yapılacak:** Tek kuyruk ekranı (şikâyet + otomatik ihlal + tekrar eden kullanıcı), tek tıkla
aksiyon, itiraz akışı. Görsel kontrolü P2.

**Yapıldı (v2.144.0):** Şikâyetler ekranına **Kuyruk** sekmesi eklendi: açık şikâyetler hedef
kullanıcıya göre gruplanıyor, risk puanına göre sıralanıyor (ayrı şikâyetçi sayısı × 10, ağır
nedenler × 25, otomatik ihlal × 3, bekleme süresi × 0,5 — üst sınırlı). Kullanıcı dosyası
(açık şikâyetler + kanıt + otomatik ihlaller + geçmiş kararlar) tek ekranda; karar bütün açık
şikâyetleri birlikte kapatıyor ve `moderation_actions`'a yazılıyor.

**Ayrıca bulunan ve kapatılan boşluk:** şikâyet edilen içerik saklanmıyordu — yalnızca mesaj
kimliği. Mesaj silinince moderatör neyin şikâyet edildiğini göremiyordu. Artık şikâyet anında
kopya alınıyor (`reports.evidence`) ve panelde "mesaj silinmiş — şikâyet anındaki kopya"
etiketiyle gösteriliyor.

**Ayrıca:** askıya alma mantığı `modules/users/ban.service.js`'e çıkarıldı. Yönetim rotası ve
moderasyon kuyruğu aynı servisi çağırıyor; oturum iptali / bağlantı kesme / oda kapatma yan
etkilerinin ikinci bir kopyada unutulması riski kalktı.

**Kalan (P2):** itiraz akışı, yüklenen görseller için içerik kontrolü.
**Mağaza şartı:** Apple ve Google, kullanıcı içeriği barındıran uygulamalarda şikâyet, engelleme
ve etkin moderasyon istiyor. Bu madde **yayın engelidir**, sonraya bırakılamaz.

<a id="s-07"></a>
### S-07 · Bağımlılık güvenliği CI'da yok — 🟢 ✅ KAPANDI (v2.143.0)

**Mevcut:** CI'da sözdizimi kontrolü (`npm run check`), testler, e2e, `flutter analyze` var;
**`npm audit` / bağımlılık taraması yok**.
**Yapılacak:** CI'ya bağımlılık taraması; kritik açıkta derleme kırılacak.

---

## 10. Bulgular — İşletim, gözlemlenebilirlik, test

<a id="i-01"></a>
### I-01 · CI/CD — 🟢 KORUNACAK

6 iş akışı: backend testleri + e2e, Flutter analiz + test + sürüm tutarlılığı, APK derleme,
zip ile güncelleme, veritabanı taşıma, Figma görselleri. Zip yükleyince sunucu kendini
güncelliyor ve APK derlemesi tetikleniyor. Bu, tek kişilik ekip için doğru kurgu.

<a id="sdui-v2"></a>
### SDUI v2 — 🟢 altyapı ✅ (v2.148.0) · 12 ekranın taşınması sürüyor

**Durum (ölçüldü, v2.147.1):** 34 ekranın **1'i** (ana ekran) SDUI kullanıyordu; SDUI yalnızca
sekme sırası/görünürlüğü ve 3 bölüm türünü sürüyordu. Yani hibrit altyapı vardı, hibrit
İÇERİK yoktu.

**v2.148.0'da kurulan:** genel bileşen ağacı (yerleşim · bölüm · liste · form · detay · durum),
taslak/yayın ayrımı, kademeli açılış (%), en düşük uygulama sürümü, sürüm geçmişi ve geri alma.
Pilot: Yardım / Müşteri Hizmetleri ekranı.

**Üç güvenlik kararı:**
1. `api` eylemi **serbest adres ALMAZ**, yalnızca izinli ad. Ad → uç eşlemesi hem sunucuda hem
   uygulamada KODDADIR. Serbest adres olsaydı, düzeni kaydedebilen biri bütün telefonlara
   istediği yere istek attırabilirdi — SDUI o noktada uzaktan kod çalıştırmaya dönüşürdü.
2. Form doğrulaması **yalnızca kullanıcı rahatlığıdır**; formu alan uç kuralları kendi
   doğrular ve düzenden gelenlere hiç bakmaz.
3. Eski uygulamaya çizemeyeceği düğüm **hiç gönderilmez** (sunucu süzer) ve uygulama
   tanımadığını **atlar**. İki kat, çünkü tek kat yeterli olsaydı yanlış tek bir `minApp`
   kaydı eski telefonlarda boş ekran demekti.

**Yerel kalanlar (ilkeye göre, taşınmayacak):** ses/görüntü odaları, mikrofon-kamera, LiveKit,
giriş ve oturum, cüzdan/Coin/Elmas/çekim, satın alma doğrulaması, gerçek zamanlı mesajlaşma
çekirdeği, kritik moderasyon.

**Kalan:** 11 ekranın düzeninin yazılması ve kademeli yayını. Oda ekranının 5.142 satırının
çözümü SDUI değil — durumu denetleyiciye çıkaran refaktör (bkz. docs/MODULE_STANDARD.md).

---
<a id="i-02"></a>
### I-02 · Gözlemlenebilirlik — ✅ Kapandı (v2.147.0)

**Mevcut:** Panelde canlı sistem ekranı (CPU, bellek, çalışma süresi, veritabanı gecikmesi,
bağlantı havuzu, veritabanı boyutu), güvenlik olay kaydı, **mobil hata kayıtlarının sunucuya
toplanması** (`/api/client-errors`).
**Boşluk:** Yapılandırılmış log yok (77 adet `console.error`), metrik dışa aktarımı
(Prometheus/OpenTelemetry) yok, **alarm yok** (bir şey bozulduğunda kimse haber almıyor),
SLO tanımı yok.
**Yapıldı (v2.147.0):** Üçü de, denetimde yazıldığı sırayla.
1. **Yapılandırılmış log** (`infrastructure/observability/log.js`): tek satır JSON, sabit alan
   adları, hassas alanlar maskeli. Hata ara katmanı ve yavaş/hatalı istekler buraya yazıyor.
2. **Metrik** (`infrastructure/observability/metrics.js` + `middleware/observability/timing.js`):
   uç bazında p50/p95/p99, 4xx/5xx, en yavaş SQL. Ölçüm anahtarı gerçek yol değil ROTA DESENİ
   (kardinalite patlaması olmasın). Panel: **Yönetim → Ölçümler**.
3. **Alarm** (`modules/system/alerts.service.js`, tablo `alerts`): API hata oranı, havuz
   doluluğu, p95 gecikme, mutabakat farkı, mutabakatın hiç çalışmaması, ödenmemiş hak ediş.
   Beş dakikada bir değerlendirilir; açılır ve düzelince kendi kapanır. Bildirim yalnızca
   AÇILIRKEN gider (alarm yorgunluğu). Aynı kural açıkken ikinci satır açılmaz.

**Sınır:** Ölçümler bellekte ve tek sunucu örneği içindir (bkz. G-01); ikinci örnek açıldığı
gün Prometheus'a taşınmalı. Kalıcı olan tek şey alarmlardır.

<a id="i-03"></a>
### I-03 · Yük testi — 🟢 araç ✅ (v2.145.0) · gerçek koşu sende

**Mevcut:** Yük testi aracı veya senaryosu **yok** (k6/artillery/autocannon izi bulunamadı).
**Sonuç:** Sistemin kaç eşzamanlı kullanıcı kaldırdığı **bilinmiyor**. Plandaki
"10.000 eşzamanlı kullanıcı" bir hedef değil, şu an bir tahmindir.
**Yapılacak:** Önce 100 → 500 → 1.000 profilleri; API gecikmesi (P95/P99), hata oranı,
veritabanı havuzu ve bellek ölçülecek. LiveKit tarafı **ayrı** ölçülecek (toplam kullanıcı değil,
oda başına yayıncı/dinleyici sayısı önemlidir).
**Tamamlanma:** "Şu anki sunucu şu kadar eşzamanlı kullanıcıyı şu gecikmeyle kaldırıyor"
cümlesi ölçümle yazılabiliyor.

<a id="i-04"></a>
### I-04 · Hazırlık (staging) ortamı — ⬜ **BİLİNÇLİ OLARAK YAPILMIYOR** (21 Kasım 2026 kararı)

**Karar:** Hazırlık ortamı kurulmayacak; değişiklikler doğrudan canlıya gidecek. Maliyet ve hız
gerekçesiyle alınmış bir sahip kararıdır.

**Bunun bedeli, açıkça:** Hatalı bir geçiş adımı doğrudan canlı kullanıcıyı vurur. Geri dönüş
yedekten olur ve son yedekten sonraki veri kaybolur.

**Bu yüzden bundan sonraki her riskli adım şu üç kuralla yapılacak** — bu kurallar hazırlık
ortamının yerini tutmaz ama hasarı sınırlar:

1. **Panelden kapatılabilir olacak.** Redis, medya→CDN, SDUI gibi her yeni yol bir bayrak arkasında
   gelir; bozulursa APK beklemeden, dağıtım beklemeden panelden eski yola dönülür.
2. **Önce yan yana çalışacak (çift yazma).** Yeni yol eskisinin yerine geçmeden önce ikisi birlikte
   çalışır ve sonuçları karşılaştırılır. Eski yol, yenisi kanıtlanana kadar silinmez.
3. **Her riskli dağıtımdan önce yedek + prova.** `deploy/backup.sh` ve `deploy/restore_test.sh`
   çalıştırılmadan geçiş adımı başlatılmaz ([V-03](#v-03)).

**Tekrar değerlendirme:** Kullanıcı sayısı arttığında ya da ilk ciddi canlı hatada bu karar
yeniden ele alınmalı. O zamana kadar yukarıdaki üç kural pazarlık konusu değildir.

<a id="i-05"></a>
### I-05 · API sürümleme ve sözleşme — 🟡 GELİŞTİRİLECEK · P2

**Mevcut:** `/v1/` yok; OpenAPI yok. Ama koddan üretilen `docs/generated/api.md` (tüm uçlar,
yetki ve hız sınırlarıyla) var — bu, hiç belgesi olmayan projelerden iyi durumda.
**Boşluk:** Geriye uyumluluk bugün "zorunlu güncelleme" ile yönetiliyor; bu, kullanıcıyı
güncellemeye zorlayan sert bir yöntem.
**Yapılacak:** OpenAPI üretimi (mevcut üreticinin üstüne), sonra yeni uçlarda `/v1/`.

<a id="i-06"></a>
### I-06 · Push bildirimi — 🔵 EKLENECEK · P1

**Mevcut:** Gerçek push **yok**. `/api/push/latest` ile uygulama açıkken yoklama yapılıyor
(son 3 gün, genel duyurular). FCM/APNs izi bulunamadı.
**Neden önemli:** Canlı yayın uygulamasında "takip ettiğin yayıncı yayında", "sana hediye geldi",
"mesajın var" bildirimleri geri dönüşün ana kaynağıdır. Bu, teknik bir eksik değil, **büyüme eksiği**.
**Yapılacak:** Firebase projesi (zaten `firebase_core` ve `firebase_auth` bağımlılıkları var),
FCM + APNs, kullanıcı bazlı hedefleme, bildirim tercihleri.

---

## 11. Planla gerçeğin karşılaştırması

Elindeki plan iyi hazırlanmış ama **kodu görmeden** yazılmış. Aşağıda her ana maddenin gerçek karşılığı var.

| Plandaki madde | Gerçek durum | Karar |
|---|---|---|
| "Backend'i modüler hâle getir" | 38 rota + 50 servis dosyası; `server.js` 353 satır | 🟢 **Zaten yapılmış** |
| "Express'i hemen değiştirme, modüler monolit hedefle" | Doğru teşhis | 🟢 Aynı fikirdeyiz |
| "PostgreSQL'i koru, Oracle'a geçme" | Doğru | 🟢 Aynı fikirdeyiz |
| "Mikroservise bölme" | Doğru | 🟢 Aynı fikirdeyiz |
| 3.3 Merkezi hata yönetimi | Merkezi hata ara katmanı + PostgreSQL hata eşlemesi var | 🟢 Var |
| 3.4 Idempotency | 19 para ucunda var | 🟢 Var |
| 3.4 Rate limit | 127 uç bazlı sınır + IP sınırı + WAF | 🟢 Var |
| 3.4 UTC saklama | 190 alanın tamamı `TIMESTAMPTZ` | 🟢 Var |
| 3.4 API sürümleme, OpenAPI | Yok (üretilmiş `api.md` var) | 🟡 I-05 |
| 4. Oturum ve yetkilendirme | Cihaz oturumu, yenileme token'ı, çalıntı tespiti var; izin matrisi yok | 🟡 K-03 |
| 5.3 Veri bütünlüğü (FK, CHECK, transaction) | 226 FK, 182 CHECK, 104 transaction, 111 satır kilidi | 🟢 Var |
| 5.4 Yedek ve kurtarma | Yedek var, **geri yükleme provası yok** | 🟡 V-03 |
| 6.2 İşlem defteri | Var; **mutabakat yok** | 🔵 F-02 |
| 6.4 Mağaza ödeme doğrulaması | Yok | 🔵 F-04 |
| 7.1 LiveKit token güvenliği | Tamamı karşılanıyor | 🟢 Var |
| 7.2 Koltuk sistemi | Var (atomik koltuk değişimi, kilit, moderatör yetkileri) | 🟢 Var |
| 8. WebSocket olay sistemi | Var; sıra numarası ve çoklu sunucu yok | 🟡 G-01, G-02 |
| 10. WebView + JSBridge | Köprü dar (sadece `close`) ✅; alan adı listesi yok ❌ | 🔴 O-03 |
| 11. Ortak oyun protokolü | Her oyun kendi mantığında | 🔵 O-04 |
| 12. Asset Manager + CDN | Medya veritabanında, CDN yok | 🟡 V-02 |
| 14. Paneller | 47 sayfa, merkezi API'ye bağlı | 🟢 Var |
| 15.1 API güvenliği | Büyük kısmı var (WAF, limit, IDOR testleri, TLS) | 🟢 Var |
| 15.2 Mobil güvenlik | Token düz depolamada; pinning/root yok | 🟡 S-03, 🔴 S-04 |
| 15.3 Kullanıcı güvenliği | Şikâyet/engel/ban var; tek kuyruk yok | 🟡 S-06 |
| 15.4 Yönetici denetimi | Kayıt var; **ikinci onay ve 2FA yok** | 🔵 K-04 |
| 16. Alan adları, dağıtım | Tek sunucu + docker-compose + nginx + LiveKit | 🟡 G-01, I-04 |
| 17. Gözlemlenebilirlik | Log + uç bazında metrik + alarm ✅ (v2.147.0); SLO tanımı hâlâ yok | 🟢 I-02 |
| 18. Yük testleri | Yok | 🔵 I-03 |
| 19. Mağaza uygunluğu | Hukuki metinler, hesap silme, veri temizliği var; moderasyon kuyruğu ve ödeme eksik | 🟡 S-06, F-04 |

### Planda olmayan ama gereken maddeler

Bunlar plana hiç girmemiş; denetimde çıktı ve bazıları kritiktir:

1. **[F-01] İstemciden kazanç alan eski oyun ucu** — en ciddi finansal açık. Planda yok.
2. **[O-01] Oyun paketlerinin sunucuda tam yetkiyle çalışması** — planın oyun bölümü bu modeli bilmiyor.
3. **[F-02] Mutabakat** — plan "günlük mutabakat raporu" diyor ama bugünkü yokluğunu bilmiyor; bu P0.
4. **[I-06] Push bildirimi (FCM)** — planda hiç geçmiyor. Büyüme için en önemli eksiklerden.
5. **[V-02] Görsellerin veritabanında olması** — plan CDN'i "eklenecek" diyor, mevcut durumun
   maliyetini bilmiyor.
6. **APK imza anahtarı yönetimi** — planda yok. **Bu anahtar kaybolursa uygulama Play Store'da
   bir daha güncellenemez.** Yedeği ayrı ve güvenli yerde, en az iki kopya.
7. **[S-04] Çalışmayan güvenlik ayarları** — panelde var, uygulamada yok. Yanlış güven kaynağı.
8. **Oyun paketi satış ayrımı** — ana kodda oyun kodu bulunmaması bir iş kararıdır; hibrit
   mimaride de korunmalı, mimari belgelerine yazılmalı.
9. **Kademeli yayın (staged rollout) ve geri dönüş** — zip ile anında tam dağıtım yapılıyor;
   hatalı sürüm herkese aynı anda gidiyor.
10. **Çok dillilik yükü** — 4 dil (tr/en/ar/hi) var; Arapça sağdan sola düzen testi yapılmamış.

---

## 12. Doğrulanamayanlar (dürüst sınırlar)

Bu denetimin kapsamadığı, bilerek "bilinmiyor" dediğim konular:

- **Canlı sunucunun gerçek durumu.** GitHub bağlantısı bu oturumda kurulamadı; denetim
  **yerel v2.130.0 kaynağı** üzerinden yapıldı. Depoda elle yapılmış bir değişiklik varsa kapsam dışıdır.
- **Üretim veritabanının gerçek boyutu, tablo satır sayıları ve yavaş sorguları.** Şema okundu,
  canlı veriye bakılmadı. `EXPLAIN ANALYZE` ile indeks doğrulaması yapılmadı.
- **Gerçek yük altındaki davranış.** Hiç yük testi yok (I-03). Kapasite hakkında bu belgede
  hiçbir sayı verilmemiştir; verilseydi uydurma olurdu.
- **Mobil uygulamanın cihaz üstü davranışı.** Kod okundu; gerçek telefonda ses kalitesi,
  pil tüketimi, düşük bellekli cihaz davranışı ölçülmedi.
- **Bağımlılıkların bilinen açıkları.** Tarama aracı çalıştırılmadı (S-07).
- **Hukuki uygunluk.** Çekim, kripto, sanal para ve şans oyunu kuralları bu belgenin konusu değildir;
  avukat/mali müşavir görüşü gerekir.

---

## 13. Sıralı yol haritası

Sıra bağımlılığa göredir; atlanırsa sonraki adım boşa gider.

### P0 — Hibrit geçişe başlamadan önce ✅ **tamamlandı**

1. ~~**[F-01]** İstemciden kazanç alan `/api/activity-play` yolunu kaldır.~~ ✅ v2.131.0
2. ~~**[F-02]** Mutabakat işi ve paneli.~~ ✅ v2.131.0
3. ~~**[V-03]** Yedekten geri yükleme provası.~~ ✅ v2.131.1
4. ~~**[O-01 adım 1]** Oyun paketi yüklemesinde özet kaydı + denetim kaydı + uyarı.~~ ✅ v2.131.1
5. ~~**[I-04]** Hazırlık ortamı.~~ ⬜ Kurulmayacak (21 Kasım kararı). Yerine: her riskli adım
   panelden kapatılabilir bayrak arkasında, çift yazmayla ve dağıtım öncesi yedek provasıyla.

### P1 — Hibrit geçişle birlikte

6. **[G-01]** Redis: hub pub/sub, hız sınırı, önbellek. *(Çoklu sunucunun önkoşulu.)*
7. **[V-02]** Medya → R2 + CDN geçişi.
8. **[O-03]** WebView beyaz listesi · **[S-04]** çalışmayan güvenlik ayarlarının temizlenmesi ·
   **[S-05]** CORS sıkılaştırma.
9. **[K-04]** Yönetici 2FA + hassas işlemde ikinci onay.
10. **[S-06]** Moderasyon kuyruğu *(mağaza yayın şartı)*.
11. **[I-03]** Yük testi profilleri · **[S-07]** bağımlılık taraması.
12. **[A-03]** `room_screen.dart` bölünmesi · **[O-01 adım 2]** paket API'sinin daraltılması.
13. **[I-06]** Push bildirimi (FCM/APNs).

### P2 — Geçişten sonra

14. **[K-03]** İzin matrisi · **[K-02]** eski token yolunun kaldırılması.
15. **[G-02]** WebSocket sıra numarası · **[G-04]** LiveKit webhook'ları.
16. ~~**[I-02]** Yapılandırılmış log → metrik → alarm~~ ✅ v2.147.0 · **[I-05]** OpenAPI.
17. **[O-04]** Ortak oyun protokolü · **[O-01 adım 3]** paketin ayrı süreçte çalışması.
18. **[S-03]** Token'ların anahtar deposuna taşınması · **[F-05]** KYC ve çekim limitleri.

### P3 — Büyüme olursa

19. Çoklu bölge, dağıtık veritabanı değerlendirmesi, olay akışı (event streaming), veri ambarı.
    **Bugün bunlara başlamak erken ve pahalıdır.**

---

## 14. Tamamlanma kriterleri (bu denetimin kapanma şartı)

- [ ] P0'daki beş madde kapandı.
- [ ] Her maddenin karşılığı kodda doğrulandı ve testle korundu.
- [ ] Bu belge, kapanan maddeler işaretlenerek güncellendi.
- [ ] `docs/YOL_HARITASI.md` ile bu belge arasında çelişki kalmadı.

---

## 15. İlgili belgeler

Bu belge tek başına durmaz; projede zaten olan şunlarla birlikte okunur:

| Belge | Ne anlatır |
|---|---|
| [MIMARI.md](MIMARI.md) | Sistem bileşenleri ve istek akışı |
| [GUVENLIK.md](GUVENLIK.md) | Çalışan güvenlik katmanlarının tam listesi |
| [EKONOMI.md](EKONOMI.md) | Coin / Diamond akışının iş kuralları |
| [VERITABANI.md](VERITABANI.md) | Veritabanı seçimi ve ayarları |
| [YETKILER.md](YETKILER.md) | Rol ve yetki tablosu |
| [YOL_HARITASI.md](YOL_HARITASI.md) | Faz faz yapılacaklar ve bilinçli yapılmayanlar |
| [TEST_PLANI.md](TEST_PLANI.md) | Otomatik testler ve elle kontrol listesi |
| [generated/api.md](generated/api.md) | Koddan üretilen tam uç listesi (yetki + hız sınırı) |
| [generated/database.md](generated/database.md) | Koddan üretilen tam şema |

> **Denetim notu:** Plan, "GitHub'da ayrı bir `belgeler/` klasörü aç" diyor. Projede zaten
> `docs/` var ve bir kısmı koddan otomatik üretiliyor. İkinci bir belge ağacı açmak, belgelerin
> ikiye bölünüp ikisinin de güncelliğini yitirmesine yol açar. Bu yüzden bu belge `docs/` içine
> kondu; plandaki diğer belgeler de aynı klasöre, aynı dilde eklenecek.
