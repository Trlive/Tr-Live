# TR Live — Modül standardı

Bu belge, kodun bundan sonra nasıl düzenleneceğini tanımlar. Bir dosyanın nereye konacağı tartışma
konusu olmaktan çıkar: burada yazar.

**İlke (mimari ilkeyle aynı):** minimum yerel kod, maksimum dinamik içerik; ancak **ses, görüntü,
kimlik doğrulama, güvenlik ve finansal işlemler** güvenilir native/backend katmanlarında kalır.

---

## 0. Önce dürüst değerlendirme

Önerilen yapı doğru ve sektör standardı (feature-first + katmanlı). Kabul ediyorum. **Üç düzeltmeyle:**

### Düzeltme 1 — `models/` ve `repositories/` presentation altında olmaz

Gönderilen `live_rooms` örneğinde `models/` ve `repositories/` `presentation/`'ın altındaydı; `wallet`
örneğinde ise doğru yerde (`domain/` ve `data/`). İkisi aynı olmalı, yoksa altı ay sonra hangi
özellikte hangi kuralın geçtiğini kimse bilmez. **Karar:** `models/` → `domain/`, `repositories/` →
`data/`. Her özellikte, istisnasız.

### Düzeltme 2 — `lib/platform/android/` ve `lib/platform/ios/` diye bir şey yok

Dart kodu orada çalışmaz. Native kod projenin kökündeki `android/` ve `ios/` klasörlerinde durur
(bizde `mobile/native/MainActivity.kt`). `lib/platform/` yalnızca **method channel sarmalayıcıları**
içindir — yani Dart tarafındaki ince arayüz. **Karar:** `lib/platform/` tek klasör, alt dallara
ayrılmaz; içinde yalnızca kanal sarmalayıcıları olur.

### Düzeltme 3 — 19 özellik × 3 katman = boş klasör ormanı

Kendi notun doğru: *"Her modülde bu dosyaların hepsi bulunmak zorunda değil. Gereksiz dosya üretmek
yerine ihtiyaca göre."* Bu kuralı yazılı hale getiriyorum:

| Özelliğin boyutu | Yapı |
|---|---|
| < 300 satır | Tek klasör, düz dosyalar. Katman yok. |
| 300–1.500 satır | `presentation/` + `data/`. `domain/` ancak iş kuralı varsa. |
| > 1.500 satır | Tam üç katman. |

`live_rooms` (5.398 satır) ve `wallet` tam yapıyı hak ediyor. `medals` ya da `missions` hak etmiyor.

---

## 1. En büyük risk: bunu canlıda yapıyoruz

Staging kurmama kararı verdik (`ARCHITECTURE_AUDIT.md` I-04). Bu, modüllere ayırmayı **yapabileceğimiz
en riskli iş** haline getiriyor: 5.398 satırlık `room_screen.dart`'ı tek seferde parçalamak, hatayı
ilk gören kişinin kullanıcı olması demektir.

Bu yüzden kural:

> **Her adım tek başına yayınlanabilir ve tek başına geri alınabilir olacak. Hiçbir adımda "taşıma"
> ile "davranış değişikliği" aynı sürümde olmayacak.**

Yani bir sürümde ya dosya taşınır (mantık bitine dokunulmaz), ya mantık değişir. İkisi birden asla.
Bir şey bozulursa hangisinin bozduğu tartışma konusu olmaz.

### Yayın öncesi kural (21 Kasım 2026, bir hatadan sonra yazıldı)

Modüllere ayırma sırasında 133 dosya taşındı. Sözdizimi, import denetimi, rota haritası ve bütün
birim testleri yeşildi. **Ama sunucu açılmıyordu** — üç dosya yolu kırıktı ve bu ancak sunucuyu
çalıştırmayı deneyince görüldü. Dördüncüsü de güvenlik ağının kendisi eksik yazıldığı için
kaçtı; CI yakaladı.

Buradan çıkan kural:

> **"Testler geçti" ile "sunucu açılıyor" aynı şey değildir.**
> Bir değişiklik, CI'ın üç işi de (backend, e2e, Mobil) yeşil olmadan yayına hazır sayılmaz.
> `npm run verify` yerel kontrolleri toplar ve **doğrulayamadıklarını da yazar** — kör noktasını
> söylemeyen araç yanlış güven üretir, bu hatanın sebebi tam olarak buydu.

İkinci kural, dışarıdaki bağımlılıklar için:

> Git'ten gelen bir bağımlılık ya yayımlanmış (pub.dev / npm) bir paket olmalı, ya da **bizim
> denetimimizdeki** bir depodan ve **sabit bir commit'e kilitlenmiş** olmalı. Kişisel bir depoya
> bağlı kalmak, o depo silindiği gün bütün derlemelerin durması demektir — bu da yaşandı.

### Güvenlik ağı: adres haritası

`backend/tools/route_map.mjs` sunucunun **tüm** API adreslerini kaynaktan çıkarır
(bugün: 49 bağlama, 467 adres). `backend/test/route_map.test.js` bunu onaylı anlık görüntüyle
karşılaştırır.

Taşıma sırasında bir adres düşerse test kırmızı yanar — sunucu yine açılır, diğer testler yine geçer,
ama bu test tutar. Anahtarda dosya yolu bilerek yok: taşıma dosyayı değiştirir, API yüzeyini
değiştirmemelidir.

Bilerek adres eklendiğinde/kaldırıldığında: `node tools/route_map.mjs --write`

### Taşıma aracı

`backend/tools/move_module.mjs` dosyayı modül klasörüne alır, kendi göreli import'larını yeni
derinliğe göre düzeltir ve o dosyayı import eden **her** dosyayı (src, test, e2e) günceller.
**Kod satırlarına dokunmaz** — bu yüzden taşımadan sonra adres haritası birebir aynı çıkmalıdır.

```
node tools/move_module.mjs chat routes/chat.js chat.routes.js
```

Her taşıma grubundan sonra çalıştırılan üç kontrol:
`node tools/route_map.mjs` (adres kaybı), `node gen/imports.mjs src` (kırık import), tüm testler.

---

## 2. Backend modül yapısı

```
backend/src/modules/<modul>/
├── <modul>.routes.js        API adresleri
├── <modul>.controller.js    Gelen isteği yönetmek (istek → servis → yanıt)
├── <modul>.service.js       İş mantığı
├── <modul>.repository.js    Veritabanı işlemleri
├── <modul>.validation.js    Gelen veriyi kontrol etmek
├── <modul>.events.js        Modül olayları
├── <modul>.permissions.js   Yetkiler
├── <modul>.constants.js     Sabitler
└── tests/
```

**Hepsi zorunlu değil.** Bir modülde controller ile service'i ayırmak değer katmıyorsa ayrılmaz
(örn. `music`: routes + service yeter). Boş dosya üretmek, karmaşayı azaltmaz, artırır.

### Hedef iskelet

```
backend/src/
├── app.js                 Express uygulaması (ara katman + rota + hata yakalayıcı)
├── server.js              Açılış/kapanış: HTTP, WebSocket, zamanlayıcı, sinyal
├── config.js
├── modules/               22 modül
├── infrastructure/        database, websocket, livekit, queue
├── middleware/            authentication, security, validation
├── shared/                errors, utils, constants
└── migrations/
```

### Modül listesi (22 — kurulu)

`admin` `agencies` `analytics` `assets` `auth` `dealers` `events` `families` `games` `gifts`
`media` `messaging` `moderation` `moments` `music` `notifications` `relations` `rooms` `store`
`system` `users` `wallet`

Hedef listeden sapmalar ve nedeni:
- `wallet` içinde `ledger`, `purchases`, `withdrawals` **ayrı modül değil**. Üçü de aynı atomik
  işlemin parçası (`wallet_transactions` aynı transaction'da yazılır). Ayırmak, bölünmesi yasak
  olan bir şeyi bölünebilirmiş gibi gösterir.
- `game_sessions` → `games` içinde. Oturum, oyunun kendi yaşam döngüsü.
- `profiles` → `users` içinde (`profile.service.js`). Ayrı tablo değil, aynı kullanıcı kaydı.
- `livekit` → `infrastructure/livekit/`. Bu bir modül değil, altyapı — iş kuralı içermiyor.
- `missions`, `medals`, `feature_flags`, `sdui` → henüz kod yok. Klasör açılmadı: boş klasör,
  "burada bir şey var" yanılsaması yaratır.
- `music` listede yok ama kod var (492 satır, oda müziği). Kendi modülü — `rooms`'a katmak
  3.223 satırlık modülü daha da büyütürdü.

---

## 3. Mobil yapı

```
mobile/lib/
├── app/          app.dart, bootstrap.dart, router.dart, app_lifecycle.dart
├── core/         config, constants, errors, networking, security, storage,
│                 theme, localization, utils, widgets
├── shared/       models, widgets, animations, services, extensions
├── features/     <özellik>/presentation|domain|data  (bkz. Düzeltme 3)
├── hybrid/       sdui, webview, js_bridge, game_sdk, asset_manager, feature_flags
└── platform/     yalnızca method channel sarmalayıcıları (bkz. Düzeltme 2)
```

Büyük bir özelliğin tam yapısı:

```
features/live_rooms/
├── presentation/
│   ├── screens/      room_screen.dart
│   ├── widgets/      room_header, mic_grid, audience_list, room_chat, gift_overlay,
│   │                 gift_ribbon, room_toolbar, room_bottom_bar, room_pk,
│   │                 room_game_overlay, room_entry_effect
│   └── controllers/  room_controller, room_members_controller, room_mic_controller,
│                     room_chat_controller, room_event_controller
├── domain/
│   ├── models/
│   └── rules/
├── data/
│   ├── repositories/
│   └── datasources/
└── live_rooms_module.dart
```

---

## 4. Modüller arası iletişim

### İzin verilen
- Tanımlı API ya da servis arayüzü üzerinden iletişim
- Yetkili repository ya da service kullanımı
- Tipi ve şeması belli olaylar
- Ortak modeller ve sözleşmeler
- Test edilebilir bağımlılıklar

### İzin verilmeyen
- Bir modülün başka modülün veritabanı tablolarını gelişigüzel değiştirmesi
- WebView'ın doğrudan Coin ya da Diamond güncellemesi
- Oyun paketinin backend'in tüm veritabanına erişmesi
- Yetki kontrolü yapılmadan admin işlemi
- Her modülün kendine özel, kontrolsüz Redis anahtarları üretmesi
- Aynı iş mantığının farklı modüllerde kopyalanması

### Örnek: hediye gönderme

```
Gift (istek) → Wallet (atomik işlem) → Ledger (kayıt)
                                          ↓
                         işlem BAŞARIYLA bittikten SONRA
                                          ↓
                              Realtime Event (animasyon)
```

Hediye animasyonu başarısız olsa bile finansal kayıt kaybolmaz. **Finansal işlem ile anlık görsel
olay birbirinden ayrıdır.** Bizde bu zaten böyle (`wallet_transactions` aynı transaction içinde
yazılır, soket olayı commit sonrası yayılır); modül sınırı bunu görünür kılar.

---

## 5. Standartlar

| Kural | Standart |
|---|---|
| Modül adı | İngilizce, küçük harf, anlamlı |
| Dosya adı | `snake_case` |
| API | Versiyonlu, doğrulamalı |
| Yetki | Backend'de kontrol |
| Finans | Atomik işlem + ledger |
| Realtime | Tanımlı event sözleşmesi |
| SDUI | Şema doğrulaması + fallback |
| WebView | HTTPS + allowlist |
| Asset | Sürüm + hash + cache |
| Test | Modül testi + entegrasyon testi |
| Log | Yapılandırılmış, hassas veri içermeyen |
| Hata yönetimi | Standart hata formatı |
| Sürüm | Geri döndürülebilir değişiklik |

---

## 6. Finansal kurallar (en korunan alan)

- Coin, Diamond ve Hil Coin birbirinden ayrı
- Hiçbir WebView oyununa doğrudan cüzdan yetkisi verilmez
- Kullanıcı cihazından gelen bakiye değeri doğru kabul edilmez
- Coin transferleri atomik
- Her finansal işlemin benzersiz işlem kimliği var
- Tekrar gönderilen aynı isteğin ikinci kez para hareketi üretmesi engellenir (`Idempotency-Key`)
- Finansal kayıt **silinerek** düzeltilmez; ters kayıt + açıklama ile düzeltilir
- Redis finansal kayıtların asıl kaynağı olamaz
- Bakiye ile ledger kayıtları düzenli karşılaştırılır (günlük mutabakat — F-02)
- Oyun ödüllerinin sonucu backend tarafından doğrulanır (F-01)

---

## 7. Uygulama sırası — hiçbir şeyi kırmadan

Sıra, **risk artan** yönde. Her aşama ayrı sürüm.

| # | Aşama | Niçin bu sırada | Durum |
|---|---|---|---|
| 0 | Adres haritası + bu belge | Güvenlik ağı olmadan taşıma yapılmaz | ✅ |
| 1 | Backend: klasör iskeleti + referans modül (`music`) | Desen bir modülde kanıtlanır | ✅ |
| 2 | Backend: finansal olmayan modüller taşınır | Hata maliyeti düşük | ✅ 14 modül, 34 dosya |
| 3 | Backend: tam iskelet + finansal modüller + `app.js`/`server.js` | Desen kanıtlandı | ✅ |
| 4 | Backend: `admin.js` (2.391) ve `rooms.routes.js` (1.195) bölündü | Dosya içi bölme — taşıma değil | ✅ |
| 5 | `web/panel` modülleştirilir | Gerçek kod var, kullanıcıyı etkilemez | ⬜ |
| 6 | Mobil: `core/` + `shared/` iskeleti | Kullanıcıya dokunmaz | ⬜ |
| 7 | Mobil: küçük özellikler | Desen kanıtlanır | ⬜ |
| 8 | Mobil: `room_screen.dart` bölünür | **Ölçüldü: mekanik taşıma mümkün değil** — aşağıya bak | 🔵 başladı |

### 8. aşamanın ölçümü (v2.142.0)

`room_screen.dart`'ın 5.398 satırının 5.191'i tek sınıf: `_RoomScreenState`, 269 üye.

Mantığa dokunmadan taşınabilecek kısım **209 satır, dosyanın %4'ü**. Kalan üyelerin yarısından
fazlası ortak değişken duruma (`_members`, `_seats`, `setState`, `widget`) dokunuyor. Yani bu iş
bir **taşıma değil, durum makinesinin yeniden yazımı** — ve kuralımız ikisini aynı sürümde
yapmayı yasaklıyor.

Dart'ta iki yol değerlendirildi:

| Yol | Niçin olmadı |
|---|---|
| `part` + `extension` | Sınıf part dosyalarına bölünemiyor. Extension'a taşınan her metodun gövdesindeki *her* örnek üye erişimi `this.` ister — binlerce satırlık regex farkı. Temiz taşıma değil. |
| Widget çıkarma | Doğru yol, ama her bileşen 10-20 parametre alır. `flutter analyze` tip hatasını yakalar, **aynı tipten yanlış değişkeni geçirmeyi yakalamaz** — `_seatTile`/`_bottomBar`'da bu doğrudan üretimde görünür. |

**Asıl engel test yokluğuydu:** mobil tarafta 4 test dosyası vardı, hiçbiri oda ekranına
dokunmuyordu. Sıra bu yüzden tersine çevrildi:

1. Üye envanteri aracı (`tools/dart_members.py`) — taşımada kaybolan metodu yakalar ✅
2. Kuralları saf fonksiyonlara çıkar + testle sabitle (sürüyor)
3. Testler yerleştikçe widget'ları çıkar, her sürümde bir grup

**Neden admin.js finansal modüllerden önce:** admin.js'i yalnız yönetici kullanır. Orada bir şey
kırılırsa panelden fark edilir, kullanıcı etkilenmez. Cüzdanda kırılırsa para hareketi etkilenir.

**Neden room_screen.dart en son:** 5.398 satır, uygulamanın en çok kullanılan ekranı ve ses/görüntü
yığınının tamamı orada. Desen diğer yerlerde oturmadan buraya dokunulmaz.


---

## 8. Gönderilen diğer ağaçlar — sıralama ve üç itiraz

`hybrid/`, `games/`, `web/admin`, `web/agency`, `web/dealer` ağaçları için kararım:

### İtiraz 1 — `games/catalog/{ludo, okey, uno, jackaroo, casual}` AÇILMAYACAK

Bu ağaç, daha önce verdiğin karara doğrudan aykırı:

> *"Ötekiler içinde kodlarda görünmeyecek şekilde olacak... asla kodlarda bişey olmayacak!"*

Oyun kodunu depodan çıkarmak için eklenti sistemini kurduk: oyun paketi zip olarak panelden yüklenir,
veritabanında (`game_plugins`, `game_plugin_files`) saklanır, çalışırken geçici klasöre açılır.
`games/catalog/ludo/` klasörü açmak oyun kodunu depoya **geri** koymak demek. Kodu satıyorsun;
alıcı oyunları da almış olur.

`games/packages/` ve `games/admin/` ise zaten var — ama klasör olarak değil, olması gerektiği gibi:
`packages` → veritabanı + sha256 + imza kaydı, `admin` → panelin Oyun Paketleri ekranı
(yükleme, sürüm, denetim kaydı, kaldırma).

`games/sdk/` gerçek: `activity_games.service.js` SDK'yı oyun sayfasına enjekte ediyor. Oyun paketi
biçimi belgelendiğinde ayrı dosyalara çıkarılacak.

### İtiraz 2 — `hybrid/` alt klasörleri kod gelince açılacak

| Klasör | Durum |
|---|---|
| `webview/` | Kısmen var (oyun sayfaları WebView'da açılıyor) |
| `game_sdk/` | Kısmen var (sunucu tarafında enjekte ediliyor) |
| `sdui/` | **Kod yok** |
| `asset_manager/` | **Kod yok** |
| `feature_flags/` | **Kod yok** (sunucu tarafı `app_config` var) |
| `js_bridge/` | **Kod yok** |

26 boş klasör açmak, "burada bir şey var" yanılsaması yaratır ve altı ay sonra hangisinin gerçek
olduğunu kimse bilmez. Her biri, kodu yazıldığı sürümde açılacak.

### İtiraz 3 — `web/admin`, `web/agency`, `web/dealer` üç ayrı uygulama olmayacak

Bugün tek bir Next.js uygulaması var: `web/panel`, içinde `components/{admin, center, dealer}`.
Üçe bölmek demek: üç ayrı derleme, üç ayrı yayın, üç ayrı Caddy yolu, üç ayrı oturum yönetimi.

Amacın **modül yalıtımı** ise bunu tek uygulama içinde de elde ederiz:
`web/panel/src/modules/{admin, agency, dealer}/...`. Aynı yalıtım, tek yayın.

Üçe bölmenin gerçek gerekçesi ancak şu olurdu: bayi panelini ayrı alan adından, ayrı sunucudan
yayınlamak istemek (saldırı yüzeyini ayırmak). Bunu istiyorsan söyle — o zaman bölmek doğru olur,
ama maliyeti yayın tarafında, kod tarafında değil.

### Sıralama

Yukarıdaki tabloda: 5 → `web/panel` modülleştirme, 6-8 → mobil. Gerekçe aynı: hata maliyeti düşükten
yükseğe. Panel kırılırsa yönetici görür; `room_screen.dart` kırılırsa 
uygulamanın en çok kullanılan ekranı kırılır.

## Dosya bölerken: import listesi elle değil, denetimle

Bir dosyayı modüllere bölerken "hangi adlar kullanılıyor?" sorusunu desenle yanıtlamak
güvenilir değildir. `...yayma(x)` yazımı dört ayrı yerde gözden kaçtı ve canlıda
"Sunucu hatası" olarak çıktı (v2.146.0).

Kural: bölmeden sonra **`npm run check` çalıştırılmadan** hiçbir bölme bitmiş sayılmaz.
İki denetim bu işi yapar:

- `tools/free_idents.mjs` — kullanılan ama tanımlı/import olmayan ad → o uç "Sunucu hatası".
- `tools/export_check.mjs` — import edilen ama dışa verilmeyen ad → sunucu hiç açılmaz.

## Güvenlik ağı yazarken

Yanlış alarm veren araç, araçsızlıktan kötüdür: kimse bakmaz. **Sessiz kaçırma ondan da
kötüdür:** araç yeşil yanar, hata canlıya gider.

Bu yüzden her denetim aracı, yazıldığı gün **kasten bozulmuş kodla** sınanır:
1. Temiz kodda susmalı.
2. Hatanın her biçimi (düz çağrı, yayma, çok satırlı import, `export const` gövdesi)
   ayrı ayrı denenmeli ve her biri yakalanmalı.
3. Araç girdiyi hiç okuyamadıysa "hata yok" değil **"bozuğum"** demeli ve çıkış kodu
   vermeli (`export_check.mjs`: hiç import okunmazsa 2 ile çıkar).
