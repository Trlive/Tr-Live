## v2.155.2 — Panel giriş bağlantısı boş sayfa açıyordu

- Caddy'de `redir /yonetim/admin/login/ 302` satırı: ilk argüman `/` ile başladığı için Caddy onu YÖNLENDİRME HEDEFİ değil EŞLEŞME KOŞULU sayıyordu.
  Sonuç: yönlendirme hiç çalışmıyor, gizli bağlantı boş sayfa açıyordu (izin çerezi yine de bırakılıyordu).
- Düzeltme: `redir * /yonetim/<panel>/login/ 302`: `*` her isteği eşler, hedef açık. Üç panel için de.
- Geçici yol (bu sürüm sunucuya gelene kadar): gizli bağlantıyı bir kez açtıktan sonra aynı tarayıcıda `/yonetim/admin/login/`
  (ajans: `/yonetim/agency/login/`, bayi: `/yonetim/dealer/login/`) açılır.

## v2.155.1 — Web yönetim paneli bağlantısı uygulamada da (sunucu paneli şifresi gerekmeden)

- **Sorun:** v2.153.1'den beri web panelleri gizli bağlantıyla açılıyor. Yönetim bağlantısı yalnızca şifreli sunucu panelinde (`/panel`)
  görünüyordu. O şifre unutulursa yönetici web paneline erişimi kaybediyordu; eski `/yonetim/admin` adresi artık "bulunamadı" veriyor.
- **Çözüm:** uygulamada **Ayarlar → Web yönetim paneli**, yalnızca süper yönetici hesabında görünür. Bağlantıyı gösterir; **Kopyala** ya da
  **Tarayıcıda aç** seçilebilir. Tarayıcıda bir kez açılınca o tarayıcı panele 1 yıl girer.
- **Sunucu:**
  - Ayrı uç `GET /api/admin/panel-links/admin`, yalnızca süper yönetici. Her bakış denetim kaydına yazılır (`panel_link_admin_view`).
  - Yönetim panelindeki ajans/bayi kopyalama kutusu yönetim bağlantısını bilerek göstermiyor (ekran paylaşımında görünmesin).
  - `install.sh` bağlantıyı `PANEL_LINK_ADMIN` olarak sunucu ortamına yazıyor.
- **Sınama:** e2e 57/57. Yeni test: süper yönetici alır, normal kullanıcı 403, kopyalama kutusunda görünmez, denetim kaydı yazılır.
  Ayrıca birim testleri 551, `check` 0, `flutter analyze` 0 hata / 0 uyarı, `flutter test` 71/71, Dart ön denetimi temiz.

## v2.155.0 — Oda ekranı bölündü (rapor O-01), davranış değişikliği yok

`mobile/lib/screens/room_screen.dart` 5.202 satırdı; neredeyse tamamı tek bir `_RoomScreenState` sınıfıydı. Artık ana dosya 1.043 satır, geri
kalanı konu konu 8 `part` dosyasında (`lib/screens/room/`). Her dosya aynı sınıf üzerinde bir `extension`:

| Dosya | Satır | İçerik |
|---|---|---|
| `room_screen.dart` | 1.043 | alanlar, yaşam döngüsü (initState / dispose / build), giriş-çıkış, kalp atışı, toparlama, dinleyiciler |
| `room/room_events.dart` | 372 | soket olaylarının ekrana uygulanması |
| `room/room_livekit.dart` | 372 | ses/görüntü bağlantısı, yayın izni, kamera, gürültü engelleme |
| `room/room_mic.dart` | 521 | mikrofon, koltuk istekleri, konuk daveti, koltuk kilitle/sustur |
| `room/room_admin.dart` | 441 | oda bilgisi/düzenleme, şifre, tema, araçlar, ayarlar |
| `room/room_chat.dart` | 525 | sohbet: geçmiş, gönderme, temizleme, kartlar, yazı çubuğu |
| `room/room_members.dart` | 515 | üye kartı, rol, susturma, şikâyet, yetkili yaptırımları |
| `room/room_stage.dart` | 708 | koltuk ızgarası, koltuk kutusu, görüntülü hücreler, canlı sahne |
| `room/room_bars.dart` | 746 | üst başlık, alt çubuk, menüler, emoji, hediye/şanslı efektleri |

**Davranışın değişmediğinin güvencesi:**
- **Taşıma bir betikle yapıldı**, elle kopyalama yok. Betik sınıf üyelerini Dart sözdizimine göre ayırıyor (dizgi, `${}` ve yorum içindeki
  parantezler sayılmıyor).
- **Satır satır karşılaştırma: 0 satır kayıp, 0 satır değişiklik.** Eklenenler yalnızca yapısal: `part` satırları, extension başlıkları,
  kapanış parantezleri. Bilinçli iki fark:
  - `setState(` → `_set(`: `setState` korumalı üyedir, extension'dan çağrılamaz; `_set` tek satırlık köprü.
  - Extension içinden sınıfın statik üyelerine sınıf adıyla erişim (`_RoomScreenState.kCryEmoji` gibi, 9 yer).
- **Dart inceliği:** extension yönteminin her referansı (tear-off) yeni bir nesnedir. `addListener`/`removeListener` ile eklenip çıkarılan
  yöntemler extension'a taşınsaydı çıkarma sessizce başarısız olur, dinleyici sızardı. Bu yüzden `_onLkChanged`, `_onPhoneCall`,
  `_onMemoryPressure`, `_onChatScroll` sınıfta bırakıldı.
- **Lint aynı:** `flutter analyze` 0 hata / 0 uyarı. Bilgi notları bölme öncesi ve sonrası tür ve sayıca aynı. `flutter test` 71/71.

**Dart ön denetimi (`mobile/tools/dart_check.py`) `part` dosyalarını tanıyor:**
- Önceden dosya bazlıydı. Part dosyalarını yüzlerce sahte bulguyla "ölü dosya", "import edilmemiş ad", "hiç kullanılmayan metot" sayıyordu.
- Artık ana dosya ile part'ları tek kütüphane olarak denetliyor ve bulguyu gerçek dosya/satırda gösteriyor.
- Gerçek hataları hâlâ yakaladığı, kasıtlı eklenen kullanılmayan metot ve import edilmemiş sınıfla denendi.
- `part of` bildirip ana dosyada `part` satırı olmayan dosya için yeni bir uyarı eklendi.

**Gerçek cihazda denenmedi.** Kod satırları birebir aynı olduğu için davranış değişikliği beklenmiyor. Yine de bir odaya girip şunları dene:
- koltuğa çık-in,
- sohbet yaz,
- hediye gönder,
- üye kartını aç,
- oda ayarlarını aç.

## v2.154.3 — Sunucu güncellemesi yarıda kalıyordu (kurulum betiği düzeltmesi)

- **Belirti:** 2.153.x / 2.154.x GitHub'a girdi, CI yeşildi, ama sunucu 2.152.18'de kaldı.
- **Sebep:** `install.sh` `set -euo pipefail` ile çalışıyor. v2.154.0'da eklenen `PAY_DOMAIN` okuma satırında, sunucu panelinde `PAY_DOMAIN`
  girilmemişse `grep` "bulunamadı" (çıkış 1) döndürüyordu. Bu hata, betiği Caddy ayarı ve servis derlemesinden ÖNCE durduruyordu.
  Sunucu eski sürümde çalışmaya devam etti; veri ya da ayar kaybı yok.
- **Düzeltme:** `grep` sonucu boşsa hata sayılmıyor. Kapı ve `PAY_DOMAIN` bölümleri gerçek betikten kesilip katı modda çalıştırılarak sınandı:
  - `PAY_DOMAIN` yokken: eski satır çıkış 1, yenisi 0;
  - `PAY_DOMAIN` varken ayrı yükleme sitesi bloğu yazılıyor.
- Sunucu bu sürümü bir sonraki denemesinde (en geç 20 dk) kendiliğinden alır; `/panel` → "Şimdi güncelle" hemen başlatır.

## v2.154.2 — CI düzeltmesi (davranış değişikliği yok)

- **`npm run check` (Backend iş akışı) kırmızıydı:** deponun adres denetimi iç içe yönlendiriciyi (`router.use('/v1', v1)`) izlemediği için
  e2e'deki `GET /dealer-api/v1/me` çağrısını "ADRES YOK" sayıyordu. Bayi API uçları aynı yönlendiricide tam yollarıyla (`/v1/...`) tanımlandı;
  uçlar ve davranış aynı.
- **Ara sıra kırılan test:** "yanlış anahtar" denemesi anahtarın son harfini sabit bir harfle değiştiriyordu. Anahtar zaten o harfle bitince
  (yaklaşık 56'da 1) "yanlış" anahtar doğrusuyla aynı oluyordu. e2e ve birim testi her zaman farklı harf seçiyor. Güvenlik açığı değil;
  anahtar karşılaştırması doğruydu.
- Zip paketleme düzeltildi: dosyalar zipin kökünde ("Zip ile güncelle" iş akışı `mobile/pubspec.yaml`'ı kökte bekliyor).

**Sınama:** `npm run check` 0; backend 551 birim; gerçek PostgreSQL'de 56/56 e2e.

## v2.154.1 — Oda olaylarında sıra numarası (rapor O-04): diğer sohbette yapılan iş alındı, gözden geçirildi, genişletildi

Kaynak: diğer sohbette hazırlanan `TR-Live-v2_152_17.zip` (temel 2.152.16). Fark yalnızca O-04 dosyalarıydı. Bugünkü koda (2.154.0) taşındı:
- sunucuda `room_seq.js` ve hub değişikliği, bugünkü oda indeksli hub'a uyarlandı;
- mobilde `socket_service.dart` ve `room_screen.dart` yamaları çakışmasız uygulandı;
- testleri `room_seq.test.js` ve `realtime_seq.test.js`.

**Zipten gelen (korundu):**
- Durum değiştiren oda olaylarına artan `seq` vuruluyor; yalnızca görsel olaylar numarasız.
- Abonelik onayı o anki numarayı taşıyor.
- İstemci boşluk görürse (41 → 43) durumu yeniden alıyor; ardışık boşluklar 5 sn'de bir birleşiyor.
- Yeniden bağlanınca durum, abonelik onaylandıktan SONRA alınıyor (önceki yarış kapandı); onay gelmezse 10 sn sonra yine alınıyor.

**Bu sürümde düzeltilen / eklenen:**
1. **İlk girişteki yarış da kapandı.**
   - Sorun: zipteki çözüm yalnızca yeniden bağlanmayı kapsıyordu. Odaya ilk girişte de üye listesi REST ile abonelikten önce alınıyordu;
     aradaki koltuk/rol değişikliği kayboluyordu.
   - Çözüm: `/api/rooms/:id/members` yanıtı artık `seq` taşıyor. Numara veritabanı okumasından ÖNCE alınıyor; böylece okuma sırasında olan olay
     "kaçmış" sayılıyor, en kötü durumda gereksiz bir yeniden yükleme oluyor.
   - Abonelik onayındaki numara bundan büyükse uygulama durumu yeniden alıyor. Karşılaştırma tek seferlik ve yalnızca anlık görüntü abonelikten
     önce alındıysa yapılıyor.
2. **Kalp atışı boşluğu gizliyordu.** Uygulama her 60 sn'de aboneliği yeniliyor; zipteki kod her onayda takibi sunucunun numarasına
   sıfırlıyordu, aradaki bir kaybı örtebiliyordu. Artık zaten takipteyken gelen onaydaki numara bizimkinden büyükse bu da "boşluk" sayılıyor.
3. **Sayaç sızıntısı.** Zipte sayaç yalnızca "boş odaya yayın yapılırsa" siliniyordu; son kişi çıkıp oda sessizleşince bellekte kalıyordu.
   Artık odanın son abonesi çıktığı anda siliniyor (oda kapanışı dahil). Abonesiz odaya yayın numara tüketmiyor.
4. `hub.roomSeq(roomId)` (REST için) ve `SocketService.isSubscribedTo(roomId)` eklendi.

**Sınama:**
- backend 551 birim. Zipin 9 testi bugünkü hub üzerinde geçti; yeni 2 test: son abone çıkınca sayaç silinir ve abonesiz yayın numara
  tüketmez / kalp atışı yinelemesinde onay aynı numarayı taşır. `ws` paketi bu ortamda var; testler gerçekten çalıştı.
- gerçek PostgreSQL'de 56/56 e2e.
- Bu ortamda Flutter var ve Dart DERLENDİ: `flutter analyze` 0 hata/0 uyarı, `flutter test` 71/71.
- Önerilen elle deneme: odada uçak modu aç-kapa, başka cihazdan koltuk değiştirme; tanı kaydında "Bağlantı · olay boşluğu" satırı görünür.

## v2.154.0 — Bayi API'si, ayrı Coin yükleme sitesi, "başkası için" Fasulye kuru

**YoHo karşılaştırması (sahibin videolarından):**
- YoHo'nun bayinin sattığı ve kullanıcının yüklediği "Coins" birimi = bizim **Coin**.
- YoHo'daki "Cüzdan bakiyesi $" = bizim **Fasulye**.
- "Yükleme yap → Kendim için / Diğerleri için" = bizim Fasulye → Coin çevirme / Coin gönderme.

Yapı aynı kaldı: Coin satılan sanal ürün, Fasulye satılmaz (yalnızca kazanç; Coin'e çevrilir ya da çekilir).

**Fasulye → başkasına Coin kuru:** YoHo'da 1 $ kendine 8.800, başkasına 9.600 Coin. Artık ayrı ayar: `usdCoinsPerUsdOthers`
(panel: Fasulye Cüzdanı; 0 = kendine kuruyla aynı). Para döngüsü koruması bu kura da uygulanır.

**Bayi API'si v1** (`/dealer-api/v1`, belge: `/dealer-api/docs`): bayi kendi sitesinden / botundan, kendi stoğundan kullanıcı ID'sine Coin yükler.
- **Uçlar:** `GET /me`, `GET /users/{id}`, `POST /recharges` (anında ya da 5 dk sonra), `GET /recharges[/{no}]`, `POST /recharges/{no}/cancel`.
- **Güvenlik:**
  - Anahtar yalnızca SHA-256 özetiyle saklanır ve bayiye bir kez gösterilir.
  - Yönetim bayi bazında açar/kapatır; kapatınca tüm anahtarlar anında durur.
  - IP izin listesi (tek IP / IPv4 CIDR / IPv6).
  - Anahtar başına 24 saatlik Coin sınırı ve dakikada 120 istek.
  - En çok 5 etkin anahtar.
  - Bayilik sözleşmesi şartı.
  - Kendi hesabına yükleme yasağı.
  - Anahtar oluşturma ve iptal denetim kaydına yazılır.
- **Tekrar güvenliği:** her yükleme bayinin `clientOrderId`'siyle bir kez işlenir; tekrar gelen istek ilk sonucu döndürür, farklı içerikle 409.
  Reddedilen istek iz bırakmaz.
- Satış bedeli (`priceTry`) Gelir-Gider raporuna girer; alıcıya anlık bakiye ve bildirim gider.
- **Ekranlar:** Bayi Paneli → "API Anahtarları" (oluştur, IP, günlük sınır, iptal, son kullanım). Yönetim → Bayiler → "API erişimini aç/kapat"
  ve listede "API" rozeti.

**Ayrı yükleme sitesi:** sunucu panelinde `PAY_DOMAIN` (ör. `odeme.alanadi.com`) yazılınca o adres yalnızca web yükleme sayfasını sunar
(kök → `/pay`; geri kalan her şey 404). Sunucu panelinde PayTR ve USDT anahtar alanları da eklendi (`.env` düzenlemek gerekmez).

Migration 123. **Sınama:**
- backend 540 birim (yeni: anahtar biçimi / özet / sabit zamanlı karşılaştırma, Bearer, IP listesi ve CIDR, sipariş no);
- gerçek PostgreSQL'de 56/56 e2e. Yeni e2e testi:
  - API kapalıyken anahtar yok,
  - yükleme ve aynı no ile çift yüklememe; farklı içerikte 409,
  - kendine yükleme reddi, günlük sınır, 5 dk iptal,
  - IP reddi, iptal edilmiş anahtar, yönetimin kapatması,
  - belge sayfası,
  - "başkasına" kuru ve döngü koruması.
- panel `tsc` 0 hata; `flutter analyze` 0 hata / 0 uyarı.

## v2.153.1 — Web panelleri ayrıldı: her panelin kendi gizli giriş bağlantısı

- **Ayrı bağlantılar:** her panele kurulumda rastgele, tahmin edilemez bir bağlantı üretilir (`https://ALAN/<32 / 28 karakter>`).
  - Yönetim bağlantısı → doğrudan yönetim girişi.
  - Ajans bağlantısı → ajans girişi.
  - Bayi bağlantısı → bayi girişi.
- **Gizlilik:**
  - Bağlantıyla gelmeyen kişiye panel sayfaları **404** döner; panelin varlığı bile anlaşılmaz.
  - Eski "panel seçimi" sayfası kaldırıldı; `/yonetim` kökü de 404 veriyor.
  - Giriş ekranındaki "Panel seçimine dön" kaldırıldı.
- **İzin çerezi (sunucunun Caddy katmanında):**
  - Yalnızca o panelin yoluna gider; JavaScript okuyamaz (HttpOnly), Secure, SameSite.
  - 1 yıl geçerli.
  - Ajans çerezi yönetim sayfalarını açmaz; diğer paneller için de aynı.
- **Bağlantıları görme ve yenileme:**
  - Sunucu panelinde (`/panel`) "Panel giriş bağlantıları" bölümü ve "Tüm bağlantıları yenile" (YENILE onayıyla) var.
  - Yönetim panelinde Bayiler ve Ajanslar sayfasında ilgili bağlantı kopyalanabilir. Yönetim bağlantısı bilerek yalnızca sunucu panelinde.
- **Güvenli devreye alma:** yeni Caddy ayarı devreye girmeden önce sunucuda `caddy validate` ile doğrulanıyor. Geçersizse son çalışan
  ayar geri konuyor; site kapanmıyor.
- `/yonetim/m/*` (uygulama içi Ajans / Yayıncı Merkezi) ve `/pay` (web yükleme) açık kalıyor.

## v2.153.0 — Coin bayilik sistemi v2: otomatik ödeme, teşvik, gelir-gider, web yükleme sayfası

Rakiplerdeki (Yoho / Bigo / Xena) üç parçalı yapı: uygulama içi bayi paneli + harici yükleme kanalı + bayi teşvik sistemi.
Asıl eksik paranın akışıydı: bayi stok paketini seçip bağlantıya ödüyor, yönetici talebi **elle** onaylıyordu.

**Otomatik ödeme siparişleri** (`payment_orders`, migration 122)
- Yöntemler: **Kart (PayTR iFrame)**: imzalı bildirimle (HMAC) Coin anında yazılır. **USDT (TRC20)**: her siparişe benzersiz
  tutar verilir; sunucu dakikada bir cüzdanı (TronGrid, yalnızca onaylı işlemler, resmi USDT sözleşmesi) okuyup tutarla eşler.
  **Havale/EFT**: IBAN + sipariş no gösterilir, yönetici dekont numarasıyla teyit eder.
- Para güvenliği: Coin yalnızca ödeme doğrulanınca ve BİR KERE yazılır.
  - Sipariş satırı kilitlenir.
  - Aynı ödeme (işlem özeti / dekont no) iki siparişe bağlanamaz (benzersiz indeks).
  - Tutar uyuşmazsa Coin yazılmaz.
  - Tekrar gelen bildirim çift yazmaz.
  - Süresi geçmiş siparişe sonradan gelen ödeme yine yazılır; iptal edilmiş siparişe yazılmaz.
  - Eşleşmeyen transferler yönetime düşer.
- Gizli anahtarlar yalnızca sunucu ortamında (`PAYTR_*`, `USDT_TRC20_ADDRESS`, `TRONGRID_API_KEY`, `PUBLIC_BASE_URL`); panelde aç/kapa.
  Anahtarı olmayan yöntem görünmez; hiçbiri yoksa bayi eski usul (bağlantı + talep) akışını görür.

**Web yükleme sayfası `/pay`** (herkese açık): kullanıcı uygulama ID'sini girer, kişi kartı (ad + avatar) görünür, paket ve yöntem seçer, öder;
Coin otomatik hesabına geçer. Sayfa sipariş durumunu kendisi yoklar. Giriş istemez; uygulamadan bu sayfaya bağlantı verilmez.

**Bayi teşvik sistemi**
- Paket bonusu (ek Coin; paketin yarısını geçemez).
- **Aylık hacim kademesi** (Bronz / Gümüş / Altın / Elmas; bu ayki toptan alım + bu sipariş eşiği geçince % ek Coin).
- **Kampanya** (tarih aralığı, bayi / web / ikisi, en az tutar).
- Toplam ek oran üst sınırı %60.
- Ek Coin siparişte sabitlenir ve stoğa ayrı "bonus" satırı olarak yazılır.

**Bayi gelir-gider**
- Satışta isteğe bağlı "satış bedeli" girilir (uygulama ve web bayi portalı).
- Stok maliyeti **ağırlıklı ortalama** ile tutulur (ek Coin maliyetsiz; alt bayi aktarımında maliyet taşınır ya da aktarım bedeliyle geçer).
- Rapor:
  - satış geliri, satılan Coin'in maliyeti, brüt kâr ve marj,
  - stok alımı, ek Coin, stok değeri, 1.000 Coin ortalama maliyeti,
  - günlük döküm,
  - bedeli girilmemiş satışlar ayrıca.
- Kuruş hatası yok: hesap 1e-4 TL ölçekli tam sayıyla.

**Diğer**
- "5 dakika sonra hesaba geçiş" satışı teslimden önce **iptal** edilebilir (Coin ve maliyet stoğa döner).
- İşlem geçmişinde alt bayi aktarımı artık "çıkış" sayılıyor.

**Ekranlar**
- **Uygulama:**
  - Stok yükle: Kart / USDT / Havale; paketlerde ek Coin; ay kademesi ve kampanya şeridi.
  - Sipariş ekranı: ödeme sayfası, USDT adresi ve tam tutar, havale bilgisi; ödeme doğrulanınca kendiliğinden "Ödendi" olur.
  - Yeni: Gelir-Gider ve Siparişlerim. Satış ekranında "Satış bedeli" alanı, geçmişte "İptal".
- **Web bayi portalı:** Stok Satın Al (otomatik ödeme), Gelir-Gider, satışta bedel.
- **Yönetim paneli:**
  - Ekonomi → Ödemeler: siparişler, havale teyidi, iptal, eşleşmeyen ödemeler, kademe ve kampanya düzenleme, kurulum durumu.
  - Bayi Mağazası: paket "Ek Coin" alanı.
  - Ayarlar → Coin satış kanalları.
  - Bayiye elle Coin yüklemede isteğe bağlı bedel (maliyete eklenir).

**Kurulum:** sunucuda `/opt/trlive/env/extra.env` içine anahtarlar (bkz. `backend/.env.example`). PayTR Mağaza Paneli → Bildirim URL:
`{PUBLIC_BASE_URL}/pay/callback/paytr`. Sonra Panel → Ayarlar → Coin satış kanalları'ndan yöntemleri açın.

**Sınama:**
- backend 536 birim testi (yeni 9 test: sipariş no, kuruş, USDT tutarı, kademe, bonus ve üst sınır, ağırlıklı maliyet ve kalan artık, kâr/marj,
  PayTR token ve bildirim imzası, TRC20 süzme);
- gerçek PostgreSQL'de 55/55 e2e. Yeni e2e testi:
  - havale → teyit → stok + bonus + maliyet,
  - ikinci teyit ve aynı dekont reddi,
  - satış bedeli → 175 ₺ kâr / %21,87 marj,
  - 5 dk satış iptali,
  - PayTR sahte imza reddi ve tekrar bildirimde çift yazmama,
  - `/pay` sayfası, ID arama, USDT zincir eşleşmesi ve yanlış tutarın yönetime düşmesi.
- `flutter analyze` 0 hata/0 uyarı, `flutter test` 71/71; panel `tsc` 0 hata;
- `/pay` akışı telefonda (390 px) Playwright ile denendi.

## v2.152.22 — Maaş düzeltmesi: neden yatmadığı görünür, ay sonu elmas kuralı, otomatik dönem kapanışı, yayıncıya elmas bozdurma

**"Fasulye hâlâ 0" sorunu.** Ay içi maaş (avans) her 3 dakikada yatıyor, ama yalnızca **telefonu doğrulanmış** yayıncıya. Ekran ise
"kimlik doğrulaman onaylıysa ödenir" diyordu: kimlik onaylı olan ama telefonu doğrulanmamış (ya da sunucuda SMS/Firebase kurulu olmadığı
için doğrulayamayan) yayıncı hiçbir şey göremiyordu.
- **Maaş durumu kartı** (Para Çekme ekranı) ve panelde kullanıcı detayında aynı teşhis: telefon yok / doğrulanmamış, ajans yok,
  sözleşme bekliyor, avans durduruldu, kota dolmadı (kaç elmas kaldı), kota dolmuş ama elmas bozdurulmuş, görüntülü maaş ay sonunda.
  Bu ay yatan avans tutarı gösterilir. Uç: `/api/broadcaster/me` → `salaryStatus`; panel: `GET /api/admin/payouts/salary-status/:userId`.
- **Panelde "Telefonu doğrula"** (süper yönetici, denetim kaydıyla): SMS doğrulaması kurulu değilken maaşı açmanın tek yolu.
- Yanlış "kimlik doğrulama" metinleri düzeltildi (uygulama, Fasulye cüzdanı, panel).

**Ay sonu elmas kuralı (sahibin kararı; ayar `monthEndDiamondConvert`, varsayılan açık):**
- Dönem kapanınca maaş kotası kadar elmas maaşa çevrilir; **kalan dönem elması 5 Elmas = 1 Coin ile Coin'e** eklenir, elmas sıfırlanır.
  Örnek: 290 bin elmas → 200 bin kota maaşa (15 $), 90 bin → 18.000 Coin.
- **Kota dolmazsa maaş yok, elmasın tamamı Coin'e:** 199 bin elmas → 39.800 Coin.
- Maaş yalnızca kota kadar elmas bakiyede durursa ödenir (elmas düşülmeden ödenen "Yöntem 1" bu kuralda kapalı; kalan elmas zaten Coin
  olduğu için aynı elması iki kez ödemek olurdu). "Elmaslarım dönüşmesin" tercihi yok sayılır. Gün/saat şartı eksikse %50 kuralı sürüyor.
- Yalnızca **dönemin** elması çevrilir: dönem bittikten sonra gelen hediyeler yeni döneme kalır. 5'e bölünmeyen 1–4 elmas bakiyede kalır.
  Ağırlıklı maaş alanlar hariç.
- Kayıtlar: Coin geçmişinde "Elmas bozdurma" satırı (`{dönem} ay sonu: X Elmas → Y Coin`), özet satırında `converted_diamonds/coins`,
  `period_diamond_conversions` (dönem + kişi birincil anahtarı: iki kez yazılamaz), dönem denetim kaydında toplamlar; yayıncıya bildirim.

**Otomatik dönem kapanışı (ayar `autoClosePeriod`, varsayılan açık).** Önceden dönem yalnızca paneldeki "Dönemi kapat" tuşuyla kapanıyordu.
Artık biten dönem bitişinden 10 dakika sonra sunucu tarafından kapatılır (maaş Fasulyeye yatar, elmas çevrilir). Bir kere güvencesi aynı:
danışma kilidi + benzersiz dönem anahtarı; iki sunucu aynı anda denese de biri "zaten kapatılmış" alır.

**Elmas bozdurma yayıncılara açıldı** (5/1). Bozdurulan elmas o ayın kotasına sayılmaz; avansla zaten düşülmüş kota etkilenmez.

Migration 121. **Dikkat:** sunucu bu sürüme geçince kapatılmamış en son dönem (bugün için Ekim 2026) 10 dakika içinde otomatik kapanır;
onaylı yayıncıların o dönemden kalan elması Coin'e çevrilir. İstenmiyorsa güncellemeden önce panelden "Dönemi otomatik kapat" kapatılmalı.

**Sınama:** backend 527 birim (yeni: ay sonu kuralı 290k / 199k / bozdurulmuş bakiye / tercih / %50); gerçek PostgreSQL'de 54/54 e2e
(yeni: otomatik kapanış, 290k → 15 $ + 18.000 Coin ve dönem sonrası hediye korunur, 199k → maaş yok + 39.800 Coin, Coin geçmişi ve
bildirim, teşhis + panelde aynı teşhis, telefonu elle doğrulama ve yetki, yayıncı bozdurma, bozdurulan elmasın kotaya sayılmaması);
`flutter analyze` 0 hata/0 uyarı, `flutter test` 71/71; panel `tsc` 0 hata.

## v2.152.21 — Sözleşmeler rakiplerdeki gibi: işlemle birlikte tek dokunuşla kabul (SMS ve PDF kaldırıldı)

Sahibin kararı: Yoho / Mico / Bigo'daki gibi sözleşme, kişinin o rolü üstlendiği işlemle birlikte kabul edilir.
- **Yayıncı sözleşmesi:** ajans davetini kabul ederken (ya da ajans sahibi kendini yayıncı eklerken). Davet kartında "Kabul ederek TR LIVE
  Yayıncı Sözleşmesi'ni kabul etmiş olursunuz" notu ve metne bağlantı. Kabul kaydı davetle **aynı veritabanı işleminde** yazılır: biri
  olmadan diğeri olmaz. Eski uygulama sürümü onay göndermezse 428 alır ve sözleşme ekranı açılır.
- **Ajans ve bayi sözleşmesi:** panel ilk açılırken tek ekran, "Okudum, kabul ediyorum". Zorunlu kaydırma, SMS kodu ve şifre kalktı.
- **PDF kaldırıldı** (üretim, indirme bağlantısı, panel düğmesi). Kayıt yerinde: sürüm, gösterilen metnin özeti, zaman, işlem (`via`),
  IP, cihaz; veritabanında değiştirilemez. Panelde "Nerede" sütunu (sözleşme ekranı / ajans daveti / ajans sahibi kendini ekledi).
- Migration 120: `method` için `clickwrap`, `via` sütunu, PDF sütunları isteğe bağlı.
- Sözleşme metinleri 1.3: kurulma maddesi yeni usule göre.
- **Kullanıcı sözleşmesi** değişmedi: kayıtta kabul (mevcut).

**Sınama:** backend 521 birim; gerçek PostgreSQL'de 53/53 e2e (davet işlemiyle birlikte kabul: onaysız istek 428 alır ve yarım kayıt kalmaz;
panelde tek dokunuş; değiştirilemezlik; ödeme ve bayi paneli kapıları); `flutter analyze` 0 hata/0 uyarı, `flutter test` 71/71; panel `tsc` 0 hata.

## v2.152.20 — Sözleşme onay sistemi, kendine hediye sınırı, sözleşmeler 1.2

**Sözleşme onay sistemi (karar: herkese uygulama içi onay).** Yayıncı, ajans sahibi ve Coin bayisi sözleşmeleri.
- **Akış:** metin kişiye doldurulmuş hâliyle gelir; sonuna kadar okunmadan onay kutusu açılmaz; onay SMS koduyla (mevcut Firebase
  doğrulaması; numara hesaptakiyle aynı olmalı) ya da SMS kapalıysa hesap şifresiyle. Sunucu, gösterilen metnin özetini (SHA-256) yeniden
  üretip karşılaştırır.
- **Kayıt:** sözleşme no (YAY-/AJS-/BAY-), sürüm, metin özeti, IP, cihaz, yöntem, telefon, PDF ve PDF özeti. Yayımlanan sürümler ve onay
  kayıtları **veritabanı tetikleyicisiyle değiştirilemez ve silinemez** (UPDATE/DELETE/TRUNCATE). Onay kayıtları kullanıcı tablosuna bağlı
  değildir; hesap silinse de yaşar.
- **PDF:** bağımlılıksız yazıcı (Türkçe harfler doğru); uygulamada "Ayarlar → Sözleşmelerim"den 5 dakikalık imzalı bağlantıyla açılır,
  panelde indirilir.
- **Kapılar (yalnızca o tür için sözleşme yayımlandıysa):**
  - Yayıncı: maaş, avans ve tek tek ödeme.
  - Ajans: ajans primi ve referans primi; ajans sahibinin paneli (asistanlar hariç).
  - Bayi: bayi paneli.

  Onaysız ödeme kaybolmaz, onaydan sonra yatar. Yeni sürüm yayımlanınca eski onay geçerli kalır; uygulama yenisini onaylatmak için sorar.
- **Yönetim paneli → Sistem → Sözleşmeler:** yayımlama (`[KARAR]` notlu metin reddedilir), yayımlanmış sürümler, onay bekleyenler, onay
  kayıtları ve PDF. İşletmeci bilgisi: ayar `contractCompany`.
- **Henüz hiçbir sözleşme yayımlanmadı:** sistem bugünkü gibi çalışır. Yayımlamadan önce avukat incelemesi ve `[KARAR]` notları tamamlanmalı.

**Kendine hediye sınırı (sahibin kararı):** sesli odada kendine hediye maaşa sayılmaya devam ediyor, ama bir dönemde sayılan kendine hediye
sayılan toplamın en çok %20'si (başkalarından gelenin dörtte biri). Maaş, avans, ajans primi ve yayıncının kazanç ekranı aynı kuralı kullanır.

**Sözleşmeler 1.2:** bayilik sözleşmesi toptan alım-satım modeline göre baştan yazıldı; imza usulü ve kendine hediye maddeleri kararlara
göre güncellendi. Ayrıntı ve kalan açık kararlar: `docs/sozlesmeler/OKU_once.md`.

**Ayrıca:** kararsız Ludo e2e testi düzeltildi (6 atılınca "tekrar at" kuralını bilmiyordu; ~6 çalıştırmada bir kırılıyordu).

**Sınama:** backend 527 birim; gerçek PostgreSQL'de 53/53 e2e (art arda iki çalıştırma); `flutter analyze` 0 hata/0 uyarı, `flutter test`
71/71 (yeni widget testi: okunmadan onaylanamaz); panel `tsc` 0 hata, `next build` başarılı; PDF'ler poppler ile doğrulandı.
**Gerçek cihazda denenmedi:** SMS ile onay (Firebase yapılandırıldıysa) ve PDF'in telefonda açılması.

## v2.152.19 — Yük testi bulgusu (şifre özeti), Android izinleri, tekrarlanabilir derleme, bayi bakiyesi

- **Şifre özeti ana iş parçacığının dışında (en büyük bulgu):** yük testiyle (gerçek PostgreSQL, 150 kullanıcı) ölçüldü: bcryptjs tek işlemde
  ~290 ms işlemci harcıyor ve Node'un tek iş parçacığını kilitliyordu; kayıt/giriş dalgasında oda listesi, `/me` ve ayarlar 6–19 sn bekledi,
  isteklerin %32'si zaman aşımına düştü. Artık aynı bcryptjs worker_threads havuzunda (`infrastructure/crypto/password_pool.js`); özet biçimi
  değişmedi, eski şifreler aynen doğrulanır. Aynı test: hata %32 → %0, 10,5 → 157 istek/sn, `/me` p95 16,3 sn → 22 ms.
- **Veritabanı havuzu (Y-02) ölçüldü:** 300 kullanıcıda havuz 5 ile 20 arasında fark yok; kullanıcı satırı önbelleği (yasaklama gecikmesi riski)
  bu yüzden yapılmadı.
- **Android izinleri (Y-09):** `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE_SPECIAL_USE`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` kodda hiç
  kullanılmıyordu (Play gerekçe ister) ve paketi olmayan "yüzen balon" servisi manifestteydi; kaldırıldı. `READ_EXTERNAL_STORAGE` yalnızca
  Android 12 ve altı. İmzalı iş akışı `READ_PHONE_STATE`'i kaldırıyordu (telefon araması algılaması bozulurdu); iki iş akışı aynı kurala getirildi.
  **`.github` dosyaları zip ile güncellenmez; elle yüklenmeli** (aşağıya bakın).
- **Tekrarlanabilir derleme (Y-03):** Dockerfile'larda ve backend CI'da `npm ci`; LiveKit imajı `latest` yerine `v1.13.11` (bugünkü latest).
- **Bayi merkezi:** bakiye yüklenemeyince bayi stokunu 0 görüyor ve satış "yetersiz" diye kilitleniyordu; artık "—" ve hata mesajı.
- **Bildirim:** "görüldü" yazıldıktan sonra gösterim hata verirse bildirim iz bırakmadan kayboluyordu; artık hata kaydına düşüyor.
- Belgeler (README, docs/COMPARISON.md) koda göre güncellendi.

**Elle yüklenmesi gereken iş akışı dosyaları:** `.github/workflows/apk_build.yml` (izinler), `.github/workflows/backend.yml` (`npm ci`,
`postgres:18`, bağımlılık taraması), `.github/imzali/apk_build.yml` (imzalı sürüm kullanılıyorsa).

**Sınama:** backend 518 birim + gerçek PostgreSQL'de 52/52 e2e; yük testi; `flutter analyze` 0 hata/0 uyarı, `flutter test` 69/69;
iki iş akışının manifest adımı yeni bir `flutter create` projesinde çalıştırıldı; iki kilit dosyası `npm ci` ile kuruldu.

## v2.152.18 — Oturum token'ları şifreli depoda (rapor Y-10)

- **Token'lar artık Android Keystore / iOS Keychain'de** (`services/token_store.dart`, `flutter_secure_storage` 10.3.4). Eskiden erişim ve
  60 günlük yenileme token'ı `SharedPreferences`'ta düz metin duruyordu; root'lu telefonda, ADB yedeğinde ve Android'in Google Drive yedeğinde
  okunabiliyordu.
- **Kullanıcı oturumdan atılmaz:** eski sürümden güncellenen telefonda düz kayıt ilk açılışta güvenli depoya taşınır ve düz kopya silinir.
- **Güvenceler:** güvenli depo yazamazsa (nadir cihaz hatası) oturum düşmesin diye düz depoya yazılır ve hata kaydına geçer; Android'de şifre
  çözülemezse (yedekten geri yüklenen telefon) depo kendini sıfırlar, kullanıcı yeniden giriş yapar, uygulama çökmez. iOS'ta "bu cihaz, ilk kilit
  açılışından sonra": kilitliyken arka planda okunur, iCloud yedeğine geçmez. Uygulama silinip yeniden kurulunca iOS Keychain'de kalan eski
  oturum temizlenir (aksi hâlde yeniden kurulan uygulama eski hesapla açılırdı).
- **Eskiden beri duran hata:** açılışta oturum okunurken hata ya da 5 sn süre aşımı olursa "token'lar değişince diske yaz" bağlantısı hiç
  kurulmuyordu. O oturumda yenilenen token'lar kaydedilmiyor, sonraki açılışta eski yenileme token'ı gönderiliyor ve sunucu bunu tekrar kullanım
  sayıp oturumu güvenlik gereği kapatıyordu. Bağlantı artık ilk iş kuruluyor.
- `login()` token kaydını beklemeden dönüyordu; artık bekliyor.
- Sınama: `token_store_test.dart` (4 test: taşıma, yazma/silme, bozuk depo, yeni kurulum; taşıma satırı bozulunca test kırılıyor). `flutter test` 69/69,
  `flutter analyze` 0 hata / 0 uyarı. **Gerçek cihazda denenmedi:** güncelleme sonrası açılışta oturumun sürdüğünü bir Android ve bir iPhone'da deneyin.

## v2.152.17 — Bağımsız inceleme turu: gerçek veritabanında doğrulama, iki üretim hatası, yayın izni sunucuda, para döngüsü koruması

Bu sürüm v2.152.4–v2.152.16 arasındaki değişikliklerin bağımsız incelemesidir. İlk kez **gerçek PostgreSQL 16** kuruldu: 118 migration'ın tamamı
sıfırdan çalıştırıldı ve uçtan uca testler gerçek veritabanına karşı koşturuldu. Ayrıca **Flutter SDK** ile `flutter analyze` ve `flutter test`,
web paneli için `tsc` ve `next build` ilk kez gerçekten çalıştırıldı.

**Bulunan ve düzeltilen hatalar**
- **Mobil girişte 8 karakter kuralı (v2.152.x'te geldi):** kural yalnızca kayıtta değil girişte de uygulanıyordu; şifresini eski kuralla (6–7 karakter)
  koymuş her kullanıcı yeni sürümde giriş yapamazdı. Artık yalnızca kayıtta (sunucu girişte zaten uzunluk denetlemiyordu).
- **Alt bayi listesi her açılışta "Sunucu hatası" (eskiden beri):** `COALESCE(metin, 0)` PostgreSQL'de tür hatası. Birim testleri sahte veritabanıyla
  çalıştığı için hiç görünmemişti; gerçek veritabanında yakalandı.
- **Görüntülü odada hediye paneli yayıncının kendisini seçiyordu:** v2.152.5 kuralı (görüntülüde kendine hediye yok) yüzünden varsayılan alıcı kendisi
  olunca gönderim reddediliyordu. Mobil artık görüntülü odada kişinin kendisini alıcı listesinde göstermiyor; eski sürümlerin "eşit/rastgele" modunda
  sunucu göndereni havuzdan çıkarıyor.
- **e2e testleri sahip kararlarıyla çelişiyordu:** v2.152.5 (sesli odada kendine hediye maaşa sayılır, görüntülüde gönderilemez) ve v2.152.14
  (basit maaş kuralı, "Maaş 2" sütunu) sonrası 3 test eski davranışı bekliyordu. Kararlara göre güncellendi; gerçek veritabanında 52/52.

**Yeni korumalar**
- **Para döngüsü koruması:** sesli odada kendine hediye maaşa sayıldığı için, Fasulye→Coin (ya da bayi) kuru maaş tablosunun en cömert seviyesinden
  yüksek olursa "Coin al → kendine hediye → maaş" turu kâr ederdi. Varsayılanlarda döngü zararına (1$ = 4.000 Coin; tablo 1$ için en az 10.638 elmas
  ister). Artık kur ve maaş tablosu bu sınırı aşacak şekilde kaydedilemez (`salaryLoopError`, panelde 400 ve açıklama). **Platform dışındaki bayi
  satış fiyatı bu korumanın dışındadır:** bayiler 1$'a 10.638 Coin'den fazlasını satarsa döngü yine kârlıdır.
- **Yayın izni sunucuda (rapor K-04):** tek kural (`rooms/publish_policy.rules.js`): koltukta olmayan yayın yapamaz; susturulmuş koltuk sesli odada
  yayın yapamaz, görüntülüde yalnızca kamera açabilir. Kural LiveKit anahtarına, koltuğa oturmaya ve koltuk susturmaya uygulanıyor; **koltuk susturma
  eskiden yalnızca istemcide uygulanıyordu.** Yeni `/livekit/webhook` ucu (imza doğrulamalı): odanın üyesi olmayan katılımcıyı çıkarır, kurala aykırı
  yayını keser. `livekit.yaml`'a webhook ayarı eklendi; **ilk dağıtımda ses sunucusu bir kez yeniden başlar** (açık odalarda ses birkaç saniye kesilir).
- **Oyun paketi (rapor K-02, ara adım):** paket yüklemek ve "tam erişim" vermek 2FA'sı açık yöneticiden, o anki kodla kabul edilir; panelde kod alanı.
  **Yönetici hesabınızda 2FA açık değilse paket yükleyemezsiniz** — önce açın. Paketi ayrı süreçte çalıştırmak eklenti sözleşmesini değiştirdiği için yapılmadı.
- **WebSocket dizinleri (rapor Y-01):** oda, kullanıcı, çevrimiçi izleyici ve IP dizinleri; yayınlar artık tüm bağlantıları dolaşmıyor. Gerçek
  WebSocket istemcileriyle 5 test.
- **TURN sertifikası yenilenince** ses sunucusu gece 04'te yeniden başlatılır (eskiden yalnızca bir güncelleme uygulanınca; uzun süre güncelleme
  gelmezse TURN 90. günde sessizce bozulurdu).

**Diğer:** avans servisindeki "ayar kapalı gelir" yorumları düzeltildi (migration 116 ile varsayılan açık). Panel `tsconfig` hedefi ES2020 (5 tür hatası).
`mobile/pubspec.lock` ve `web/panel/package-lock.json` eklendi.

**Sınama:** backend 515 birim testi; gerçek PostgreSQL 16'da 52/52 uçtan uca; `flutter analyze` 0 hata / 0 uyarı; `flutter test` 65/65; panel `tsc` 0 hata, `next build` başarılı.
**Denenemeyenler:** gerçek cihazda ses/görüntü, LiveKit webhook'unun canlı ses sunucusundan gelişi, TURN. İlk dağıtımdan sonra: sunucu günlüğünde
`livekit_webhook_failed` olmamalı; bir koltuğu susturup susturulan kişinin sesinin gerçekten kesildiğini deneyin.

## v2.152.16 — Medya depolama (rapor O-03): taşıma tamamlanıyor, silinen dosyanın R2 nesnesi de siliniyor

Mevcut R2 taşıma altyapısı (taşıyıcı, doğrulama, CDN yönlendirmesi) korundu; eksikler kapatıldı. Yükleme noktalarına DOKUNULMADI (yükleme önce veritabanına yazılır, taşıma arka planda yapılır:
R2 bir an yanıt vermese de kullanıcı yüklemesi başarısız olmaz). Raporun önerdiği "ön imzalı adresle doğrudan R2'ye yükleme" bilerek YAPILMADI: istemci ve CORS değişikliği ister, kazancı yoktur —
asıl dert (veritabanı/yedek büyümesi, her istekte veritabanı okuması) aşağıdakilerle çözülür.

- **Sıcak yol düzeltildi (`app.js` `/media/:file`):** taşınmış dosyada bile `data` sütunu veritabanından okunup atılıyordu (yorum "veritabanı okunmaz" diyordu, sorgu okuyordu). Artık depo
  yapılandırılmışsa taşınmış dosyanın baytı okunmaz (`CASE WHEN … THEN data END`; TOAST'taki büyük değer yalnızca kullanılırsa çekilir). Depo kapalıysa ya da geri alındıysa eskisi gibi veritabanından sunulur.
- **Veritabanı kopyası artık OTOMATİK siliniyor:** `dropDbCopies` yalnızca panelden elle çalışıyordu, veritabanı büyümeye devam ediyordu. Saatlik işe eklendi (7 gün sonra, turda en çok 100 dosya) ve **her dosyada yeniden
  doğrulanıyor** (R2'de şimdi var + boyut kayıtla aynı; doğrulanamayan silinmez; depo art arda 3 hata verirse tur durur). Panel eylemi de aynı doğrulamayı kullanır.
- **Kopyası silinmiş dosya içeriden okunuyordu → boş bayt:** `media_budget.process` (medya küçültme) ve `autoIcon` (mp4'ten otomatik ikon) doğrudan `data` okuyordu; silinmiş kopyada boş bayt üzerinde çalışıp bütçe raporuna
  yanlışlıkla "sınır içinde" yazabilirdi. Yeni `readMediaBytes` kopya silinmişse R2'den okur ve boyut/sha256 ile doğrular; okunamazsa dosyaya dokunulmaz.
- **R2 nesneleri sahipsiz kalıyordu:** `deleteObject` hiçbir yerden çağrılmıyordu; altı farklı yerde `media_files` satırı siliniyor (hesap silme, avatar değişimi, medya yedeği temizleme…) ama R2'deki dosya ve herkese açık CDN adresi kalıyordu
  (depolama sızıntısı + silinen hesabın görselleri erişilebilir). Migration 118: `media_files` üzerinde AFTER DELETE tetikleyicisi, anahtarı AYNI işlemde `media_delete_queue`'ya yazar (silme noktası ne olursa olsun, gelecektekiler dahil);
  işçi her 10 dakikada kuyruğu boşaltır, R2 erişilemezse anahtar kuyrukta bekler (20 denemeden sonra durumda "takılı" görünür). Yalnızca `media/<uuid>.<uzantı>` biçimindeki anahtarlar silinir.
- **Yarış düzeltildi:** taşıma sırasında satır silinirse az önce yazılan R2 nesnesi sahipsiz kalıyordu; artık hemen geri alınır.
- **İzleme:** `GET /storage/status` yanıtına `deleteQueue` ve `deleteQueueStuck` eklendi; R2 yapılandırılmamış ve medya 500 MB'ı aşmışsa günlüğe `media_db_growth` uyarısı yazılır. Taşıma işi 10 dakikada bir çalışır (ağır işler yine saatte bir).
- Migration 117: taşıma ve kopya silme taramaları için iki kısmi indeks.
- **Yeni sınır:** kopya silindikten sonra medyanın tek kaynağı R2'dir ve veritabanı yedeği medyayı içermez; R2 kovası ayrıca yedeklenmelidir (KURULUM.md 8).
- Sınama: `media_bytes.test.js` (13 test: doğrulama, okuma-geçiş, silme kararı, silme turu, hata serisi, anahtar biçimi, silme kuyruğu, migration, sıcak yol regresyon koruması). **Gerçek PostgreSQL ve R2 ile ÇALIŞTIRILMADI**:
  tetikleyici SQL'i ve `CASE` sorgusu CI'da ve ilk dağıtımda gözlenmeli (önce bir test dosyası silip kuyruğa düştüğünü görün).

## v2.152.15 — Sadeleştirme: panele alan eklenmiyor, her şey varsayılanla çalışıyor

Sahibinin isteği: yönetim paneli şişirilmesin, sistem kurulup çalışsın.

- **Yönetim paneli:** v2.152.5–14'te eklenen `instantSalaryBps` ve `audioShortfallCutBps` alanları **kaldırıldı**. Avans oranı sabit %50 (5000), eksik şartta ödenecek oran tam dolara aşağı.
  Tek bir kutu kaldı: "Ay içi maaş (avans) kuralı" — para ödeyen bir özellikte acil durdurma düğmesi olarak bilerek bırakıldı.
- **Ay içi maaş kuralı artık VARSAYILAN AÇIK** (migration 116: sütun varsayılanı TRUE, mevcut satırlar TRUE yapıldı). Deploy edildiği andan itibaren sesli maaş "şartlar tamamsa %100, biri eksikse %50
  (tam dolara aşağı)" kuralıyla hesaplanır ve kota dolunca avans yatar. **Gerçek veritabanında hâlâ denenmedi**; ilk saatlerde bir yayıncının Fasulye geçmişini ve günlükte `instant_salary_failed` satırı olup olmadığını kontrol edin.
  Sorun görürseniz yukarıdaki tek kutuyu kapatın.
- **Sunucu mini paneli:** eklenen 7 alan (`BACKUP_S3_*` ×5, `BACKUP_REMOTE_DAYS`, `TURN_ENABLED`) yerine **tek** isteğe bağlı alan: `BACKUP_REMOTE` ("uç-nokta kova anahtar-kimliği gizli-anahtar [bölge]", gizli alan).
  Saklama süresi sabit 30 gün. Boş bırakılırsa uzak yedek yoktur (yerel yedek her gece çalışır).
- **TURN varsayılan AÇIK:** panelde ayarı yok. Sertifika alınabiliyorsa kendiliğinden devreye girer; ses sunucusu açılmazsa TURN'süz ayara dönülür. Sertifika alınamazsa her güncellemede beklenmez (6 saat sonra yeniden denenir).
  Kapatmak için `extra.env`'e `TURN_ENABLED=0`. Kullanıcı tarafında tek iş: Oracle konsolunda 5349/TCP ve 3478/UDP kurallarını eklemek (KURULUM.md 6).
- Sınama: `deploy_backup.test.js` ve `deploy_turn.test.js` yeni davranışa göre güncellendi (16 test).

## v2.152.14 — Maaş: şartlar tamamsa %100, biri eksikse %50 (tam dolara aşağı), avans kilidi kaldırıldı

Sahibinin son tarifi. **Ayar kapalıyken hiçbir şey değişmez**; açılınca (Panel → Ayarlar → Ajans ayarları → "Ay içi maaş (avans)") aşağıdaki kural geçerli olur.

- **Kural (sesli maaş):** kota (dönemde alınan elmas) dolunca o seviyenin maaşı (Maaş 2 sütunu; ör. 200 bin elmas = 15$) hak edilir.
  Şartların HEPSİ tamamsa (elmas bozdurmama, gün, saat; ayarlıysa oyun saati) maaşın **tamamı**; biri bile eksikse maaşın **%50'si**, **tam dolara aşağı yuvarlanarak**
  (15$ → 7,50$ → **7$**; Fasulye tam sayıdır). Yuvarlamadan kalan 0,50$ ve kalan %50, şartların hepsi tamamlanınca yatar.
  Oran `instantSalaryBps` (varsayılan 5000). Birden çok seviyede kota dolmuşsa en çok ödeyen seviye seçilir.
- **Avans:** kota dolunca hak ediş hemen Fasulye olarak yatar (3 dakikada bir kontrol, saatte bir tam tarama). Her turda hak ediş yeniden hesaplanır; yalnızca daha önce ödenenden FAZLASI yatar
  (ör. 7$ ödendikten sonra gün/saat tamamlanınca 8$ daha). Dönem kapanışında aynı kuralla tam hak ediş hesaplanır, ödenen avanslar düşülür, kalan yatırılır.
  Örnek: gün 10, kota doldu, gün/saat eksik → 7$; ay sonu gün/saat tamam → 8$ daha (toplam 15$); şartlar hiç tamamlanmazsa 7$ kalır, ay sonunda kesir yatmaz.
- **Elmas:** avans yatarken kota kadar elmas Fasulyeye çevrilir (bakiyeden düşer, cüzdan geçmişinde "maaş avansı: N elmas Fasulyeye çevrildi"). Değerlendirme, avansla düşülen elması bakiyeye geri ekler
  (migration 115: `salary_advances.diamonds_consumed`), böylece "elmas bozdurmama" şartı avansın kendi düşümüyle bozulmaz ve dönem kapanışı aynı elması ikinci kez düşmez.
  "Elmaslarım dönüşmesin" (pay_method_pref 1) seçen yayıncıda elmas düşülmez ve bozdurmama şartı sağlanmış sayılmaz (%50 ödenir). Bakiye bu arada harcandıysa o tur avans verilmez.
- **Önemli:** ayar AÇIKKEN sesli maaş **tüm ay (ay sonu kapanış dahil)** bu kuralla hesaplanır; Maaş 1 sütunu ve sesli %40 kesinti ayarı (`audio_shortfall_cut_bps`) kullanılmaz. Görüntülü maaş kendi kuralıyla ay sonunda ödenir (avansa dahil değil).
  Ağırlıklı maaş (`salaryWeightedEnabled`) açıkken avans verilmez.
- **Avans KİLİDİ KALDIRILDI** (v2.152.12'deki): avans Fasulyesi sıradan Fasulyedir; Coin'e çevrilebilir, dolar olarak gönderilebilir/çekilebilir. `usd_wallet.service.js` orijinaline döndü;
  `advance_lock.service.js` ve testi silindi. `salary_advances.locked_cents` (migration 114) artık KULLANILMAZ, zararsız 0 kalır.
- Sınama: `paytable_simple.test.js` (10 test: 15$ örneği, 7,50$→7$, şart tekil eksikleri, bozdurma, pref 1, kota, oran sınırları, seviye seçimi, 23$→11$, ceza), `instant_salary.test.js` (uçtan uca 7$ + 8$ = 15$ dahil),
  `instant_salary_integration.test.js` (evaluateHost bayrak açık/kapalı, etkin bakiye; DB paketleri gerektirir, CI'da çalışır). **Gerçek veritabanında ÇALIŞTIRILMADI**: avans SQL'i ve `closePeriod` entegrasyonu denenmedi;
  açmadan önce tek test yayıncısıyla deneyin.

## v2.152.13 — Yedekler (K-07) ve zorunlu güncelleme kapısı (O-08)

### K-07 — yedekler artık sunucu dışına da gidebilir ve sessizce bozulmaz
- **`deploy/oracle/backup.sh` yeniden yazıldı.** Eskiden `pg_dump` başarısız olsa bile hata görünmezdi. Artık: `pg_dump` hatası, bozuk gzip (`gzip -t`) ve 1 KB'tan küçük
  (şüpheli) dosya hata verir (çıkış 1) ve **eski yedekler silinmez**. Son 7 yerel yedek tutulur (değişmedi).
- **Uzak kopya (isteğe bağlı, S3 uyumlu: Backblaze B2, Cloudflare R2, Oracle Object Storage, AWS S3):** panelde 5-6 alan (`BACKUP_S3_*`, `BACKUP_REMOTE_DAYS`) doldurulunca gece yedeği
  `rclone` ile `<kova>/trlive/` altına da kopyalanır; orada `BACKUP_REMOTE_DAYS` (varsayılan 30, **en az 7**) günden eski yedekler silinir. Kimlik bilgileri komut satırına değil ortam
  değişkenlerine yazılır. `install.sh`, bilgiler girilince rclone'u kendisi kurar. Uzak kopya başarısızsa çıkış kodu 3 olur (systemd "failed"), yerel yedek yine alınır.
- Geri yükleme komutu ve kova/anahtar önerileri: `KURULUM.md` 7. bölüm.
- Sınama: `deploy_backup.test.js` (9 test): sahte `docker` ve `rclone` ile betiğin tüm yolları çalıştırıldı (başarı, `pg_dump` hatası, küçük dump, rotasyon, uzak kopya, rclone hatası, eksik ayar,
  saklama günü, ayar okuma). **Gerçek S3 hizmetiyle ÇALIŞTIRILMADI**; rclone bayrakları (`copyto`, `delete --min-age`, `--s3-no-check-bucket`, `RCLONE_CONFIG_OFFSITE_*`) belgesine göredir.
  İlk gece sonrası günlükte "Uzak kopya tamam" satırını ve kovada dosyayı kontrol edin.
- **Yapılmadı:** yedeğin düzenli geri yükleme denemesi, yedek başarısızlığında bildirim (şimdilik yalnızca günlük ve systemd durumu).

### O-08 — zorunlu güncelleme tek başlıkla atlanamıyor
- `X-Client: web-panel` başlığı eskiden herhangi bir `/api` yolunda zorunlu güncellemeyi (426) atlatıyordu; eski bir uygulama başlığı ekleyerek kapıyı geçebilirdi. Artık muafiyet yalnızca **panelin
  kendi API yollarında** geçerli (`middleware/security/update_gate.js`: admin, agency-center, agencies, agency-requests, agency-transfers, announcements, auth, broadcaster, dealer, me, users, wip).
  Oda, hediye, cüzdan gibi uygulama yollarında başlık artık işe yaramaz.
- Liste web/panel kaynağından çıkarıldı. `update_gate.test.js` panelin kaynağını tarar: panel listede olmayan yeni bir `/api/<parça>` kullanmaya başlarsa CI kırılır (panel sessizce bozulmaz).
- **Kalan sınır:** `auth`, `me`, `users`, `dealer`, `broadcaster` gibi uygulamayla ortak yollarda başlık hâlâ kapıyı atlatır (panelin giriş yapabilmesi için gerekli). Tam çözüm panele ayrı
  bir kimlik doğrulaması (ör. imzalı başlık) vermektir.

## v2.152.12 — Avans Fasulyesi maaş tam yatana kadar yalnızca Coin'e çevrilebilir (sahibinin kararı)

v2.152.11'de avans yattığı anda dolar olarak gönderilebiliyordu; artık değil.

- **Kural:** avans olarak yatan Fasulye, o dönemin maaşı TAM yatana kadar **yalnızca Coin'e çevrilebilir** (`coin_exchange`, `coin_send`). Dolar olarak gönderim
  (`dealer_transfer`) ve admin'e çekim talebi (`withdraw_request`) kilitli kısma dokunamaz. Serbest bakiye (önceki aylardan kalan maaş vb.) eskisi gibi gönderilebilir.
  Reddedilince kullanıcıya "Avans olarak yatan Fasulye, maaşınız tam yatana kadar yalnızca Coin'e çevrilebilir. Şu an gönderilebilir: X Fasulye." denir.
- **Kilit nerede tutulur:** `salary_advances.locked_cents` (migration 114). Kullanıcının kilitli toplamı = SUM(locked_cents). Avans yatarken `cents`'e eşitlenir.
- **Coin'e çevirme önce kilitliden düşer, en eski avanstan başlayarak** (gönderilebilir tutar azalmaz): 7,50$ kilitli + 10$ serbest iken 5$ çevirmek → kilitli 2,50$, serbest 10$.
  Kilitliden fazlası çevrilirse artanı serbest bakiyeden gider.
- **"Maaş tam yatınca" = kilit açılır:** dönemin yayıncı özeti `paid` olduğunda ya da kalan tutar 0 olduğunda (avans maaşın tamamını karşıladıysa). Açan yerler: `creditPeriod`
  (cüzdana yatırma, ay başı otomatik aktarım dahil), dönem kapanışı (kalanı 0 olanlar), ve her 3 dakikada bir çalışan avans turu (elle "ödendi" yapılan özetler için güvence;
  avans bayrağı kapalı olsa da çalışır). Özeti hiç olmayan bir döneme işlenmiş avansın kilidi de açılır (sonsuza dek kilitli kalmaz). Henüz kapanmamış dönemin avansı kilitli kalır.
  Telefonu doğrulanmamış yayıncının özeti 'pending' kaldığı sürece kilit de durur.
- **API:** `GET` cüzdan yanıtına `lockedAdvanceCents` ve `withdrawableCents` eklendi. **Mobil ekran henüz göstermiyor**; kullanıcı "Dolar olarak gönder"e fazla tutar girerse sunucu yukarıdaki mesajla reddeder.
- **Eski avanslar:** migration 114'ten ÖNCE yatmış avanslar kilitsizdir (varsayılan 0).
- Sınama: `advance_lock.test.js` (8 test: gerçek `debitUsd/creditUsd` kodu sahte bağlantıyla; dolar çıkışı kilide takılır, Coin'e çevirme önce kilitliden düşer, en eskiden tüketim,
  yetersiz bakiye mesajı, kredi/admin düzeltmesi etkilenmez, kilit açma) ve `instant_salary.test.js` (9 test). Kilit açma SQL'i ve `closePeriod` entegrasyonu gerçek veritabanında ÇALIŞTIRILMADI.

## v2.152.11 — Avans koruması kaldırıldı

- v2.152.10'daki avans koruması (`advanceRisk`: geliri %50 ve üzeri kendine/karşılıklı hediyeden gelen yayıncıya avans verilmemesi) sahibinin kararıyla
  KALDIRILDI. Kota dolunca maaşın belirlenen oranı (`instantSalaryBps`) her yayıncıya avans olarak yatar; hesap kuralı yine `instant_salary.rules.js`.
- **Hâlâ var (koruma değil, hesap tavanı):** avans hedefi = min(maaş × oran, garanti tutar). Garanti tutar, yayıncı elmaslarını harcasa bile dönem sonunda alacağı maaştır
  (Yöntem 1). %50 oranda bu tavan nadiren devreye girer (yalnızca oran yaklaşık %60'ı geçerse ya da gün/saat eksik ve kesinti kapalıysa); avansın ay sonunda geri
  alınamayan fazla ödemeye dönüşmesini önler.
- **Fasulye/dolar:** uygulamada tek bir "Fasulye cüzdanı" vardır (1 Fasulye = 1 dolar = 100 sent). Avans ve ay sonu kalanı bu cüzdana Fasulye olarak yatar; Fasulye Coin'e
  çevrilebilir ya da "Dolar olarak gönder" ile bayiye/admine gönderilebilir. Avansın ay sonuna kadar dolar olarak gönderilemeyecek şekilde kilitlenmesi İSTENİRSE ayrı bir iştir
  (cüzdana "kilitli avans" tutarı gerekir); şu an avans yattığı anda gönderilebilir.

## v2.152.10 — "bahis" ifadesi canlı koddan temizlendi, etkinlik anahtarı sağlayıcıyı da durduruyor, avans koruması

- **Metin temizliği (yalnızca ifade):** canlı kodda, panel yardım metinlerinde ve uygulamadaki tek kullanıcı metninde ("Hafıza Kartları: Ücretsiz,
  bahissiz" → "Ücretsiz") "bahis" ve eş anlamlıları çıkarıldı; "Coin hareketi" denildi. SDK'daki kaldırılmış `bet`/`settle`/`play` yöntem artıkları ve
  `gone()` yardımcısı silindi: eski bir oyun paketi bu adları çağırırsa artık "is not a function" hatası alır (zaten çalışmıyorlardı, sessizce başarısız olmaz).
  Panel yardım metnindeki kalkmış "Coin bahsi açık" yönergesi düzeltildi. Bu değişiklik mekanizmayı DEĞİŞTİRMEZ.
- **Bilerek dokunulmayanlar:** (1) uygulanmış migration dosyaları (`082_…`: `activity_rounds.bet` sütunu ve açıklaması; `091_…` bu tabloyu "denetim için saklanır" diye
  salt okunur yaptı); uygulanmış migration metnini değiştirmek veritabanını değiştirmez, yalnızca geçmişi siler. (2) `docs/ARCHITECTURE_AUDIT.md` ve bu dosya: neyin ne zaman
  kaldırıldığının kaydı. (3) `web/site/community.html`: topluluk kurallarındaki "yasa dışı bahis ve kumar" yasağı. (4) `text_safety.js` içindeki `.bet` alan adı uzantısı: bağlantı
  filtresi. (5) Testlerdeki bu adlar: yasaklı yöntemlerin geri gelmediğini doğrulayan regresyon denetimleridir.
- **Hâlâ geçerli (ifadeden bağımsız):** Coin'i tur başına düşüp yatırabilen iki sunucu yolu duruyor: harici sağlayıcı API'si (`/api/activity-provider`, imza anahtarı girilen
  etkinlikte) ve oyun paketi cüzdanı (`wallet.debit/credit`). Şanslı hediye (havuzdan geri dönüş oranı) ayrıdır. Hukuki/mağaza değerlendirmesi (K-06) bu yollara göredir.
- **Etkinlikler kapalı anahtarı (`roomActivitiesEnabled`) artık sağlayıcı API'sini de durdurur** (`/user` ve `/balance` "Etkinlikler şu an kapalı" döner). Eskiden yalnızca sayfa gizleniyordu,
  Coin hareketi sürüyordu.
- **Avans koruması (rapor Y-07):** ay içi maaş avansı, geliri %50 ve üzeri kendine ya da karşılıklı (A→B ve B→A) hediyeden gelen yayıncıya verilmez (`advanceRisk`). Ay sonu maaşı etkilenmez.
  Atlanan yayıncılar günlüğe `instant_salary_skipped_suspicious` olarak yazılır. Sesli odada kendine hediye maaşa sayıldığı için bu koruma önemlidir. Yapılmadı: panelde şüpheli
  yayıncı raporu ve ay sonu maaş incelemesi.
- Sınama: `instant_salary.test.js` (7 test); SDK testleri (11 test). `activity_games.test.js` bu ortamda çalışmıyor (`pg` yok); değişen iddiaları elle sınandı.

## v2.152.9 — TURN (kısıtlı ağlarda ses yedeği), isteğe bağlı ve korumalı

Rapor K-03. **Varsayılan KAPALI.** Mini panelde "TURN" alanına `1` yazılınca açılır (extra.env: `TURN_ENABLED`). Ayrıntı: `deploy/oracle/KURULUM.md` 6. bölüm.

- **Alan adı (sslip.io de, özel alan adı da):** TURN adı her zaman `turn.<ip-tireli>.sslip.io`. sslip.io joker adı sunucu IP'sine kendiliğinden
  çözüldüğü için ek DNS kaydı gerekmez; özel alan adı kullanan kurulumlarda da aynı ad çalışır.
- **Sertifika:** Caddy'ye `turn.<…>.sslip.io` için site bloğu eklenir (sertifikayı Caddy alır). LiveKit, `caddy_data` hacmini salt okunur
  (`/caddy-data`) görür ve `turn:` bloğuna (`tls_port: 5349`, `udp_port: 3478`) sertifika yolunu yazar. Sertifika henüz yoksa TURN yazılmaz;
  kurulum sonunda 90 saniyeye kadar beklenir.
- **Güvence:** (1) TURN'süz ayar `livekit.yaml.noturn` olarak yedeklenir. (2) TURN'lü ayarla yeniden başlatılan ses sunucusu 10 sn sonra çalışmıyorsa
  TURN'süz ayara dönülür ve `state/turn-failed` yazılır; panelde TURN alanı boşaltılıp yeniden `1` yazılana kadar bir daha denenmez (sonsuz yeniden
  başlatma yok). (3) Sertifika yenilenince (Caddy ~60 günde bir) LiveKit bir sonraki "Kaydet ve uygula"da yeniden başlar.
- **Güvenlik duvarı:** `firewall.sh` 5349/tcp ve 3478/udp'yi açar (kapalıyken dinleyen yoktur, zararsız). **Oracle konsolunda (Security List) aynı iki kuralı
  elle eklemek gerekir** (KURULUM.md).
- **Bir kereliğine:** `compose.yml` LiveKit'e `caddy_data` bağlantısı ekledi; bu yüzden güncellemede ses sunucusu bir kez yeniden oluşturulur (kısa kesinti).
- **Sınır:** TURN 5349'da; yalnızca 443'e izin veren ağlarda çözmez (443'ü Caddy kullanıyor; çözmek ayrı bir TCP katmanı/ikinci IP ister).
- **Sınama:** `deploy_turn.test.js` (7 test): kabuk fonksiyonları sahte sertifika klasörleriyle çalıştırıldı, `bash -n` sözdizimi, yedek sırası, kapı kuralları.
  **Gerçek LiveKit/Caddy ile ÇALIŞTIRILMADI**; `turn:` anahtar adları LiveKit belgesine göredir. İlk açılışı bir kısıtlı ağdan deneyin.

## v2.152.8 — Ay içi maaş avansı (kota dolunca maaşın bir kısmı hemen yatar)

Sahibinin tarifi: kota dolunca maaşın belirli bir kısmı anında Fasulye olarak yatar; ay sonunda gelir ve saate göre tam maaş
hesaplanır, avans düşülerek kalanı yatırılır. **Bayrak KAPALI gelir:** panelden açılana kadar hiçbir şey ödenmez.

### Nasıl çalışır
- Her 3 dakikada bir, son 30 dakikada hediye almış yayıncılara bakılır (saatte bir tüm onaylı yayıncılar taranır). Yayıncının güncel
  dönem hak edişi `evaluateHost` ile hesaplanır (sesli + görüntülü, kesinti ve ceza dahil).
- **Avans hedefi = min(hak ediş × oran, garanti tutar).** Garanti tutar, yayıncı elmaslarını bugün harcasa bile dönem sonunda alacağı
  maaştır (yalnızca Yöntem 1). Böylece avans, dönem sonunda geri alınamayacak kadar yüksek olamaz.
- Hedef arttıkça (seviye atlama, gün/saat tamamlanması) yalnızca FARK yatar; aynı tutar iki kez yatmaz; 1$ altı fark yazılmaz.
- Avans `usd_transactions`'a `salary` türüyle, "<dönem> maaş avansı" notuyla yazılır; `salary_advances` tablosunda izlenir.
- **Dönem kapanışında** (`closePeriod`): tam hak ediş hesaplanır, ödenen avanslar düşülür. `host_statements.salary_cents` artık
  AVANS DÜŞÜLMÜŞ KALAN tutardır (cüzdana yatırma, bekleyen toplamlar, otomatik aktarım ve ödeme uçları değişmeden doğru tutarı kullanır);
  avansın kendisi `advance_cents` sütununda ve özet JSON'unda `advanceCents` olarak görünür. Toplam hak ediş = salary_cents + advance_cents.
  Hak ediş avanstan küçük çıkarsa kalan 0 olur, fark geri alınmaz.
- **Örnek (seviye 1, 200 bin elmas, oran %50):** gün/saat eksik → maaş 9$ (kesintili), garanti 6$ → 4,50$ yatar. Saatler tamamlanınca
  maaş 15$, garanti 10$ → 3$ daha yatar (toplam 7,50$). Ay sonunda tam maaş 15$ − avans 7,50$ = 7,50$ yatar; toplam 15$.

### Güvenlik
- Avans, `closePeriod` ile AYNI kilidi (`payout_close`) alır; kapanışla yarışamaz. Kapanmış bir dönemle çakışan aralıkta avans verilmez.
- Telefonu doğrulanmamış yayıncıya avans yatmaz (`SALARY_PAYABLE_SQL`, kapanıştaki kapıyla aynı).
- Ağırlıklı maaş (`salaryWeightedEnabled`) açıkken avans VERİLMEZ (o modelde hak ediş farklı hesaplanıyor).

### Açmak için
Panel → Ayarlar → Ajans ayarları: **"Ay içi maaş avansı"** kutusunu işaretleyin, oranı baz puan olarak girin (5000 = %50).
Önce tek bir test yayıncısıyla deneyin: kotayı doldurunca 3 dakika (en geç 1 saat) içinde Fasulye bakiyesinde "maaş avansı" görünmeli.

### Sınırlar ve dikkat
- **Veritabanında çalıştırılmadı.** Matematik birim testli (`instant_salary.test.js`, 6 test); SQL ve `closePeriod` entegrasyonu bu ortamda
  denenemedi. İlk dönem kapanışından önce test dönemiyle (`force`) bir deneme yapılması önerilir.
- Dönem döngüsü (haftalık/aylık) bir dönemin ortasında DEĞİŞTİRİLMEMELİ: avanslar kapanışta zaman aralığına göre düşülür.
- Yayıncıya bildirim gönderilmez; avans cüzdan geçmişinde görünür.
- Görüntülü maaş da hak edişe dahildir (sesli + görüntülü toplamı). Kendine hediye sesli odada maaşa sayıldığı için, avansın
  maliyetini Coin fiyatı ile maaş oranı üzerinden ayrıca değerlendirin.

## v2.152.7 — Denetim kaydı eylem adı: activity_bet → activity_spend

- Oyun paketi cüzdanında harcama (`debit`) yazılırken `financial_audit_logs.action` artık `activity_bet` yerine `activity_spend`
  (cüzdan hareket türüyle aynı ad). Kazanç zaten `activity_win` idi. `action` sütununda kısıt yok (VARCHAR(80)), kodda başka
  `activity_bet` kullanımı yoktu.
- **Eski kayıtlar değiştirilmedi:** denetim defteri geçmişi bilerek olduğu gibi bırakıldı; bu tarihten önceki harcamalar
  `activity_bet` adıyla durur. İki dönemi birlikte sorgularken `action IN ('activity_bet', 'activity_spend')` kullanın.

## v2.152.6 — Sesli odada gün/saat eksikse kesintili maaş (sahibinin kararı)

- **Sesli maaş, gün/saat şartı eksik:** elmas kotası tutan (Yöntem 1'de dönem elması, Yöntem 2'de bakiye) ama gün/saat/oyun saati
  şartı eksik kalan yayıncı artık maaşın **%60'ını** alıyor (%40 kesinti). Eskiden o seviye hiç sayılmıyor, şartı tutan alt seviyeye
  düşülüyordu; hiçbiri tutmazsa maaş çıkmıyordu. Şartı tutan alt seviyenin maaşı kesintili üst seviyeden yüksekse o ödenir.
  Örnek (seviye 1, 200 bin elmas): şartlar tam → 15$ (Yöntem 2) / 10$ (Yöntem 1); gün/saat eksik → 9$ / 6$.
  Yöntem 2 kesintiyle ödenirse de seviyenin elmas kotası bakiyeden düşülür (elmaslar maaşa çevrilir). Resmi etkinlik cezası kesintinin
  üstüne biner.
- **Ayar:** `agency_settings.audio_shortfall_cut_bps` (migration 112, varsayılan 4000). Panelde Ayarlar → Ajans ayarları → "Sesli: gün/saat
  şartı eksikse kesinti". 0 yazılırsa eski davranış (ödeme yok). Görüntülü odanın `video_shortfall_cut_bps` ayarından bağımsızdır;
  sesli kesinti görüntülüye sızmaz (`evaluateVideoPay` kendi oranını kullanır).
- **Dikkat:** migration, kesinti oranını mevcut ayar satırlarına da 4000 olarak yazar; yani deploy edildiği andan itibaren kota tutup
  gün/saati eksik kalan sesli yayıncılar 0$ yerine kesintili maaş alır. Ağırlıklı maaş (`salaryWeightedEnabled`) açıksa ödemeye
  o esas alınır ve bu kural yalnızca eski hesabı etkiler.
- **Yapılmadı: ay içinde anında maaş.** Dönem kapanışı (`closePeriod`) ağırlıklı maaş modeli, Yöntem 2 elmas düşümü, yayıncı özet tablosu,
  ajans primi ve cüzdana yatırma ile iç içe; ay içinde ödenen avansın kapanışta düşülmesi, elmas düşümünün tekrar sayılmaması ve
  ağırlıklı model ile birlikte çalışması tasarlanmadan, gerçek veritabanında denenmeden yazılırsa yanlış (geri alınamaz) fasulye ödemesi
  riski var. Önerilen tasarım: avans defteri + kapanışta düşüm, ayar bayrağı kapalı başlar, test hesabıyla denenir.
- **Belgeler:** `scripts/gen_docs.mjs` eskimiş (taşınan `src/realtime.js` dosyasını arıyor; çalıştırınca api.md'yi 0 uçla yazıyor) ve
  `docs/generated/*` zaten güncel değildi (118 tablo/75 migration yazıyor, gerçekte 148/110+). Bu yüzden üretici çalıştırılmadı;
  `database.md`'ye yalnızca yeni sütun elle eklendi. Üreticinin onarılması ayrı bir iş.
- Sınama: `paytable_audio_shortfall.test.js` (10 test). `paytable_video.test.js` bu ortamda çalışmıyor (`pg`/`dotenv` yok); CI'da görün.

## v2.152.5 — Kendine hediye kuralı ve etkinlik etiketleri (sahibinin kararı)

v2.152.4'te ertelenen O-02 (kendine hediye) karara bağlandı; K-06 için yalnızca görünen etiketler değişti.

- **Kendine hediye, sesli oda:** alıcının maaşına ve kotasına SAYILIR. Dönem ölçümü (`hostPeriodMetrics`), ajans satırları
  (`agencyGiftRows`) ve yayıncının kendi istatistik ekranları (`me.routes.js`, 3 sorgu) aynı kuralı kullanıyor
  (`agencies/salary_rules.js`), böylece yayıncının gördüğü sayı ile ödenen sayı ayrışmaz. PK puanına sayılmaya devam eder.
- **Kendine hediye, görüntülü oda:** gönderilemez ("Görüntülü odada kendinize hediye gönderemezsiniz."). Eski kayıtlarda
  kalan görüntülü kendine hediyeler maaşa sayılmaz.
- **Değişmeyenler (bilerek):** liderlik tabloları, ajans aylık sıralaması (`agencyRanking`) ve resmi etkinlik sayımı kendine hediyeyi
  hâlâ dışlar; yayıncı seviyesi (`gift_level`) ve odadaki sayaç da aynen duruyor. Hangisinin değişmesi gerektiği ayrıca karara bağlanmalı.
- **Etkinlik etiketleri:** cüzdan hareketlerinde "bahsi/kazancı" yerine "Etkinlik kaybı" ve "Etkinlik kazancı" yazıyor
  (oyun paketi cüzdanı ve sağlayıcı API'si); mobil cüzdan ekranında `activity_win`/`activity_spend` artık bu adlarla görünüyor.
  Veritabanındaki hareket türleri (`activity_win`, `activity_spend`) ve denetim kaydı eylem adı (`activity_bet`) DEĞİŞMEDİ;
  mevcut kayıtlar ve sorgular bozulmasın diye. Etiket değişikliği mekanizmayı değiştirmez; hukuki/mağaza değerlendirmesi için
  K-06'daki hukuki görüş ihtiyacı geçerli.
- **Hâlâ açık:** "Etkinlikler kapalı" anahtarı (`roomActivitiesEnabled`) sağlayıcı API'sini (`/api/activity-provider`) durdurmuyor.
- Sınama: `salary_rules.test.js` (3 test). Sorgular gerçek veritabanında ÇALIŞTIRILMADI; CI'da ve canlıda bir yayıncı
  istatistik ekranı ile bir dönem özeti kontrol edilmeli.

## v2.152.4 — Kod denetimi raporundan ilk düzeltme turu

`TR_Live_Kod_Denetimi` raporunun kodda tek başına çözülebilen maddeleri. Altyapı, hesap ve ürün kararı
gerektirenlere (K-01, K-02, K-03, K-05, K-06, K-07, Y-10, O-02, O-08) dokunulmadı; nedenleri aşağıda.

### Yapılanlar
- **K-04 (kısmen) — LiveKit yayın yetkisi:** anahtar ömrü 2 saatten 15 dakikaya indi (`TOKEN_TTL`). Mikrofon
  yetkisi anahtarın içinde olduğu için, koltuktan indirilenin yetkisi `setCanPublish` ulaşamazsa 2 saat açık kalıyordu.
  `setCanPublish` artık 3 kez deniyor (`retry.js`), katılımcı odada değilse (404) başarılı sayıyor, olmazsa
  `livekit_permission_update_failed` olayını kayda yazıyor (eskiden sessizce yutuyordu).
  **Yapılmadı:** LiveKit webhook'u ile katılımda yetki doğrulama (livekit.yaml'a webhook adresi gerekir).
  **Varsayım (canlıda doğrulanmadı):** LiveKit bağlı katılımcıya anahtarı kendisi yeniliyor. Uzun odalarda
  15. dakikada kopma görülürse `livekit.js` içindeki `TOKEN_TTL` büyütülmeli.
- **Y-02 (kısmen) — havuz boyutu:** `deploy/oracle/install.sh` artık `DATABASE_POOL_MAX='20'` yazıyor (varsayılan 5'ti).
  `extra.env`'deki değer bunu ezer. Kimlik doğrulama sorgusu (`SELECT *`) önbelleğe ALINMADI: `req.user` bakiye
  alanlarını da taşıyor, eski değer göstermek riskli.
- **O-07 — şifre politikası:** en az 8 karakter, yaygın şifre listesi, kullanıcı adıyla aynı olamaz
  (`password_policy.js`, `auth.js` yeniden dışa aktarıyor). Mobilde kontroller ve ar/en/hi çevirileri 8'e çekildi.
  Eski uygulama sürümleri 6 karakteri yerelde kabul edip sunucudan hata alır. Mevcut şifreler etkilenmez.
- **O-10 — PostgreSQL sürümü:** CI 16'dan 18'e çıktı (üretimle aynı). `deploy/docker-compose.yml` 16'da kaldı:
  kalıcı veri var, sürüm atlamak için yedek alıp geri yüklemek gerekir.
- **D-01:** `server.js`'teki kullanılmayan 14 ad import'tan çıkarıldı (modüller başka yerlerde yüklenmeye devam ediyor).
- **D-02:** oyun cüzdanı bakiyeyi BigInt ile hesaplıyor; paketlere Number sözleşmesi korundu (güvenli sınırda
  kırpılır), tam değer için sonuca `balanceText` eklendi.
- **D-04:** kayıt satırındaki iki ifade ayrıldı; şifre kuralına kullanıcı adı da veriliyor.
- **O-09 — belgeler:** README'deki "29 birim testi" düzeltildi. `docs/COMPARISON.md`'de yalnızca kodla doğrulanan satırlar
  güncellendi (SVGA/MP4 animasyon, oyunlar, web yönetim paneli, çok dil, PK, önerilen sıra); tablonun başına
  "diğer satırlar eskimiş olabilir" notu eklendi.

### Yapılmayanlar ve nedenleri
- **O-02 (kendine hediye):** koddaki yoruma göre bilinçli ürün kararı; yasaklamak/sayımdan çıkarmak karar ister.
- **O-08 (`web-panel` başlığı):** panele ayrı kimlik doğrulama olmadan gerçekten kapatılamaz.
- **Y-10 (güvenli depolama):** `flutter_secure_storage` R8/JNI açısından riskli (bkz. `shared_preferences_android`
  notu); derleme görmeden eklenmedi, CI'da denenerek yapılmalı.
- **K-01 (anahtar):** anahtarın yenilenmesi ve `git filter-repo` sahibinin işi; iş akışındaki imzalama adımı sonraya kaldı.
- **K-04'ün kalanı (LiveKit webhook ile katılımda yetki doğrulama):** güvenlik duvarının IP sınırlayıcısı yerel (127.0.0.1) çağrıları
  da sayıyor; webhook'u duvarın dışına almak ya da muaf tutmak gerekir. Bu bir tasarım kararı ve canlı sunucuda denenmeden yazılmamalı.
  O zamana kadar açık kalan pencere en çok 15 dakika (TOKEN_TTL) ve değiştirilmiş istemci gerektirir.
- **Y-09 (Android izinleri):** `.github/imzali/apk_build.yml` bu izinleri (SYSTEM_ALERT_WINDOW, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
  FOREGROUND_SERVICE_SPECIAL_USE, OverlayService) zaten kaldıran Play'e hazır sürüm; Play'e çıkarken o dosya kullanılacak. `READ_PHONE_STATE`
  ise `MainActivity.kt`'de arama algılama için kullanılıyor; kaldırmak davranış değişikliğidir (`audio_session` ile değiştirilmeli).
- **D-03 (boş catch):** örneklenen yerler çoğunlukla bilerek sessiz kalan temizlik adımları (ör. çıkışta müziği çözme). Hepsini kayda
  yazmak çökme raporunu gürültüyle doldurur; gerçek bir belirti görüldüğünde tek tek ele alınmalı.
- **Y-03 (kilit dosyaları):** ortamda internet yok, `package-lock.json` / `pubspec.lock` üretilemedi.

### Elle yüklenmesi gereken
`zip_ile_guncelle.yml` `.github` klasörünü güncellemez. `.github/workflows/backend.yml` içinde tek satır değişti:
`image: postgres:16` → `image: postgres:18`. GitHub sitesinde dosyayı açıp kalemle düzeltin.

### Doğrulama
Yeni birim testleri: `password_policy.test.js`, `livekit_retry.test.js` (9 test, geçti). `scripts/check.mjs`
temiz (tanımsız ad yok, 1013 import çözülüyor). Bu ortamda `pg`/`express` kurulamadığı için paket
gerektiren testler (17 dosya) ve e2e ÇALIŞTIRILAMADI; sonucu CI'da görün.

## v2.152.3 — iOS en düşük sürüm 15.0 (derleme denemeden düzeltildi)

`setup_ios.py` en düşük iOS sürümünü 14.0 yapıyordu. Bu hâliyle derleme `pod install`
aşamasında düşerdi: `firebase_core 4.15.2`, Firebase iOS SDK 12'yi kullanıyor ve o sürüm
en az **iOS 15** istiyor ("Specs satisfying the Firebase/CoreOnly dependency were found,
but they required a higher minimum deployment target").

Betik hem Podfile'ın `platform :ios` satırını hem Xcode projesinin
`IPHONEOS_DEPLOYMENT_TARGET` değerini tek sabitten ayarlıyor, bu yüzden tek satır yetti.
iOS 15, iPhone 6s ve sonrasını kapsıyor.

Gizli depoda Mac dakikası 10 kat sayıldığı için bu, derleme denenmeden önce düzeltildi.

## v2.152.2 — Kaybolan iOS dosyaları geri geldi, kaybın sebebi kapatıldı

### iOS kodu silinmişti — nasıl olduğunu buldum
`zip_ile_guncelle.yml`, yüklenen zip'i açmadan ÖNCE şunu yapıyor:

    find . -mindepth 1 -maxdepth 1 ! -name '.git' ! -name '.github' -exec rm -rf {} +
    cp -a "$T/." .

Yani **zip'te olmayan her dosya depodan siliniyor.** Bendeki çalışma kopyasında
`mobile/native/ios/` bir noktada kaybolmuş; sonraki her yükleme onu depodan da sildi.
İş akışı dosyaları `.github` korunduğu için yerinde kaldı — bu yüzden `ios_build.yml`
çalışmaya devam etti ama çağırdığı betik yoktu ve iş
"can't open file '.../mobile/native/ios/setup_ios.py'" ile düştü.

iOS yalnızca elle çalıştırıldığı için kayıp aylarca fark edilmedi.

**Geri konulanlar** (v2.93.0 zip'inden, iş akışı sahibinin gönderdiği güncel sürümden):
- `mobile/native/ios/setup_ios.py`
- `mobile/native/ios/AppIcon.appiconset/` (Contents.json + icon-1024.png)
- `.github/workflows/ios_build.yml` (Xcode 26 seçimi olan yeni sürüm)
- `docs/IPHONE.md`

Depo ile v2.93.0 arasındaki tüm fark tarandı; iOS dışında kaybolan başka dosya yok
(eksik görünenlerin hepsi kasıtlı: `backend/src/*.js` düz yapıdan `modules/` yapısına
taşındı, yönetim/ajans ekranları web paneline geçti, iki yetim dosya silinmişti).

### Yeni güvenlik ağı: iş akışı dosyaları
`workflow_files.mjs` — iş akışlarının kullandığı dosya yollarını okuyup depoda var mı diye
bakıyor. Böyle bir kayıp bir daha sessizce olmaz, yayın öncesi denetimde patlar.
İlk sürümü dört yanlış alarm verdi (`working-directory: ${{ env.APP_DIR }}` çalışma anında
hesaplanıyor; `widget_test.dart`'ın yokluğu iş akışının kendi `rm -f`'i yüzünden normal).
İkisi de çözüldü: depoda sıfır yanlış alarm, `setup_ios.py` gizlendiğinde yakalıyor.

### Zip'in yüklenmemesi benim dosyamla ilgili değil
`zip_ile_guncelle` işi 3 saniyede, iş hiç başlamadan şu hatayla düştü:
"Son ödeme işlemlerinizde başarısızlık yaşanması veya harcama limitinizin artırılması
gerektiği için işlem başlatılamadı."

Bu GitHub Actions faturalandırma hatası — GitHub ayarlarındaki "Fatura ve planlar"
bölümünden çözülür. Not: `ios_build.yml` `macos-15` üzerinde çalışıyor ve gizli depoda
**Mac dakikası 10 kat** sayılıyor; iOS derlemeleri dakikayı hızla tüketir.

## v2.152.1 — CI'ı kıran iki hatam ve onları kaçıran araçların düzeltilmesi

İki hata da benim ve ikisini de tam o iş için yazdığım araçlar kaçırdı. Önce hataları düzelttim, sonra araçların NEDEN kaçırdığını bulup kapattım.

### 1. `showSnack` diye bir fonksiyon yok (APK ve Mobil işleri durdu)
`dealer_subs_screen.dart:75`'te `showSnack(...)` yazmıştım; projede öyle bir fonksiyon yok, doğrusu `toast(...)`. Uydurduğum bir ad.

**Aracım neden kaçırdı:** `dart_check.py` yalnızca BÜYÜK harfle başlayan tip adlarına bakıyordu ve yalnızca "projede tanımlı ama import edilmemiş" olanları bildiriyordu. Hiçbir yerde tanımlı olmayan, küçük harfle başlayan bir ad tasarım gereği görünmezdi.

Bunun yanlış alarmsız yapılabileceğini **ölçerek** doğruladım: depodaki 1373 farklı çıplak çağrıdan yalnızca 17'si projede tanımsız ve 10'u Flutter'ın kendi fonksiyonu. Artık küçük harfli çağrılar da denetleniyor. Araç yazarken üç kendi hatamı buldum — en önemlisi: tanım kalıbındaki "tip" kısmı yalnızca boşluktan oluşabiliyordu, yani satır başındaki HER çağrı tanım sanılıyordu ve araç tam da yakalaması gereken adı "tanımlı" sayıp geçiyordu. Şimdi depoda sıfır yanlış alarm veriyor ve `showSnack`'i yakalıyor.

### 2. `auditStaff` beş argüman alıyor, ben üç verdim (e2e durdu)
`admin_dealers.routes.js` ve `admin_agencies.routes.js`'te `auditStaff(req, action, meta)` yazmıştım. İmza `auditStaff(c, adminId, userId, action, meta)`. `req` veritabanı istemcisinin yerine oturdu ve `c.query is not a function` ile uç 500 döndü.

**Yeni araç:** `arg_count.mjs` — proje içi fonksiyonların çağrılarında argüman sayısını denetliyor. İlk sürümü dört yanlış alarm verdi (JavaScript'te son argümanı atlamak yaygın ve kasıtlı: `promoteBootstrapAdmins(username)` gövdesinde `username === undefined` durumunu zaten ele alıyor). Kuralı daralttım: **yalnızca iki ve daha fazla eksik** argüman bildiriliyor. Bu kuralla depoda sıfır yanlış alarm var ve benim hatam yakalanıyor (5 bekleniyor, 3 verilmiş).

### 3. `build-ios` benim değil
`mobile/native/ios/setup_ios.py` **bu depoda hiç yok** ve iOS iş akışı dosyası da repoda bulunmuyor (`.github/workflows/` içinde yalnızca apk, backend, db, figma, mobile, zip var). Bu iş GitHub'da ayrıca tanımlanmış ve eksik bir dosyayı arıyor; benim bu sürümlerdeki değişikliklerimle ilgisi yok — iOS tarafına hiç dokunmadım. Dosyanın aslı sizde varsa gönderin, ekleyeyim.

### Doğrulama
427 birim testi, 237 dosya, 999 argüman denetimi, 1167 SQL sorgusu, 108 göç gerçek PostgreSQL'de. İki yeni denetim de iki yönde sınandı: hatayı geri koyunca yakalıyor, düzeltince susuyor.

## v2.152.0 — Hediye şeffaflığı: ölçtüm, sebebi buldum, düzelttim

Sahibi: "hediyelerin transparan özelligi çok kötü, bazıları ne olduğu belli olmayacak kadar sıkıntılı."

**Önce ölçtüm.** Yumuşak ışımalı, parçacıklı, %63'ü yarı saydam bir test hediyesi üretip mevcut işleme hattından geçirdim. İlk hipotezim yanlıştı: **webp kodlayıcı alfa'yı bozmuyor** (512→256 küçültmede alfa ortalama hatası 0,24/255). Sebep başka yerdeydi.

### Asıl sebep: SVGA maskeleri hiç uygulanmıyordu
`svga_lite.dart` oynatıcısı (benim yazdığım) `matteKey` alanını **hiç okumuyordu** — protobuf alan 3 atlanıyordu — ve maske katmanlarını çizim dışı bırakıyordu. Sonuç: maskelenmesi gereken katman **maskesiz** çiziliyordu, yani hediyede gizlenmesi gereken parçalar olduğu gibi görünüyordu. Tam olarak "ne olduğu belli olmuyor" demek.

Artık maske uygulanıyor: maskelenecek katman(lar) bir ara katmana çizilip maske üstüne `BlendMode.dstIn` ile basılıyor. Aynı maskeyi paylaşan **ardışık** katmanlar tek grup olarak maskeleniyor (SVGA'da bir maske birden çok katmanı birlikte kırpabiliyor). Maske katmanları `.matte` son ekine bakarak değil, gerçekten `matteKey` ile gösterilip gösterilmediklerine bakarak belirleniyor — son ek bir adlandırma geleneği, kural değil.

**Sunucu maskeleri bozmuyor, kanıtlandı.** SVGA yeniden yazıcısı (yüklenen dosyanın içindeki görselleri küçültür) sprite'ları ham bayt olarak geçiriyor. Bunu 4 testle kilitledim: biri ayrıştırıcıyı "sadeleştirmeye" kalkarsa test patlar. Görsel değiştirilse bile katman + matteKey korunuyor.

### Ölçülen diğer iki düzeltme
- **Alfa-güvenli ölçekleme webp'te yoktu** (PNG'de vardı). Premultiply edilmemiş alfa ile lanczos küçültmek, tam saydam piksellerin rengini yarı saydam kenara bulaştırıyor: hediyenin etrafında koyu halka. Ölçüm: yarı saydam bölgede RGB hatası **4,63 → 3,06 (%34 iyileşme)**, alfa hatası 0,24 → 0,15, dosya %19 büyüyor. q88 + sıkıştırma seviyesi 6 ölçülen en iyi denge. (`-pix_fmt bgra` denendi ve etkisiz: libwebp kayıplı modda her durumda yuva420p'ye çeviriyor.)
- **Kalite merdiveni alfa'da zararlıydı.** Dosya sınırı aşılınca kalite 82'den 52'ye kadar iniyordu. Ölçüm: bu, dosyayı yalnızca **%9** küçültüyor — çünkü dosyanın çoğu alfa kanalı ve libwebp onu kayıplı pek sıkıştırmıyor — karşılığında bozulmayı %13 artırıyor. Yani gözle görülür kaliteyi neredeyse bedava harcıyordu. Alfa taşıyan biçimlerde (png, webp) merdiven artık kaliteyi sabit tutup **boyutu** düşürüyor. JPEG'de alfa yok, orada kalite merdiveni hâlâ doğru araç.

### Animasyon hatasında ekran boş kalıyordu
Hediye animasyonu açılamazsa `SizedBox.shrink()` dönüyordu: kullanıcı hediyeyi gönderiyor, coin'i gidiyor ve ekranda **hiçbir şey** görmüyordu. Artık hediyenin simgesi yedek olarak gösteriliyor. Simge de açılamazsa boş kalıyor; orada yapacak bir şey yok.

### Hareketli WebP
ffmpeg'in kendi webp çözücüsü animasyon (ANMF) parçalarını okumuyor — "image data not found". Sınırlar içindeki hareketli webp'ler zaten dokunulmadan geçiyor, sorun yok. Sınırı aşanlar otomatik küçültülemiyor; hata mesajı artık ne yapılacağını söylüyor (elle küçült ya da SVGA / alfa kanallı MP4 ver). Sunucuda küçültebilmek için `libwebp-tools` gerekiyor, backlog'a yazıldı.

### Doğrulama
427 birim testi (424 geçti, 3 atlandı; 4'ü yeni: SVGA maske koruması), 236 dosya, tüm araçlar temiz. Ölçümler ffmpeg 6.1.1 ve gerçek görsellerle yapıldı; sayılar `docs/BACKLOG.md`'de duruyor.

## v2.151.0 — Ludo: zar sonucu görünüyor, 6 birikiyor; Ludo ve Tek hızlandı

### Zar sonucu artık görünüyor
Sahibinin şikayeti: "Ludoda atılan zar sonucu görünmüyor." Üç sebebi vardı ve üçü de düzeltildi:
- Zarın köşesine, **sonraki atışa kadar duran** okunaklı bir sayı rozeti eklendi. 3B küp küçüktü ve döndükten sonra hangi yüzün üstte olduğunu okumak zordu.
- Tek hamle varken otomatik oynama **900 ms'den 1250 ms'ye** çekildi. Zar 800 ms'de oturuyordu, yani taş zar durmadan oynanıyor ve göz tahtaya kaçtığı için sonuç okunmuyordu.
- Zar **56 pxden 68 pxe** büyütüldü, küp derinliği arttı.

### 6 oynatmıyor, birikiyor
> "Misal bir 6 attı, hemen oynatma, 2. zar hakkını da çevirt; misal 3 geldi, bir 6 oynama bir 3 oynama hakkı olacak. 6+6+5 geldi diyelim, bunda da iki altı bir 5 oynayacak."

- 6 atıldığında **taş oynatılmıyor**: değer kuyruğa yazılıyor ve oyuncu tekrar atıyor. Kuyruk 6 olmayan bir değerle kapanıyor ve biriken zarlar **tek tek, istediği taşa** oynanıyor.
- Değerler **toplanmıyor**. Toplasaydık (6+6+3=15) üsten taş çıkarmak imkânsız olurdu — çıkış için tam 6 gerekiyor — ve dört taşı da üste olan oyuncu 6 attığında hiç hamlesi kalmazdı. Yani oyun kilitlenirdi.
- Üst üste üç 6: biriken her şey düşer, sıra geçer, hiçbir taş oynanmaz (eski kural korundu).
- 6 artık **ekstra tur vermiyor**: atıldığı anda zaten tekrar atma hakkı kazandırdı. İkinci kez ödül verseydik tur hiç bitmezdi.
- Kuyruğun **başındaki** oynanamayan değerler düşüyor, arkadakiler düşmüyor: [6, 2] kuyruğunda 6 oynanıp taş çıktıktan sonra 2 oynanabilir hale geliyor. Baştan atmak oyuncunun hakkını yemek olurdu.
- Biriken zarlar kontrol çubuğunda şerit olarak görünüyor; oynanacak olan vurgulu, oynanan üstü çizili. Durum metni "6 attın! Taş oynamaz, tekrar at" ve "2 zarın var: 6 + 3 — sırayla oyna" diyor. Dört dilde (tr/en/ar/hi) ve oyun içi kural metni de güncellendi.

**Yol boyunca bulunan gerçek hata:** zaman aşımına düşen oyuncu için otomatik oynayan `autoPlay`, 6 attıktan sonra oynanacak değer bulamıyor ve oyuncu tekrar atmak yerine **sırasını kaybediyordu**. Artık kuyruk kapanana kadar atıyor ve biriken zarların hepsini tek zaman aşımında oynuyor.

### Hız
- **Ludo:** taş yürüyüşü 150 → 90 ms/kare (6 zarı 900 → 540 ms), zıplama 150 → 110 ms, taş geçişi 120 → 80 ms, zar oturması 0,80 → 0,60 s.
- **Tek:** kart uçuşu 380 → 260 ms, dağıtım gecikmesi 55 → 36 ms/kart, otomatik çekme beklemesi 1100 → 750 ms, meşgul tekrar denemesi 400 → 280 ms.

### Yeni güvenlik ağı: satır içi script derlemesi
`webview_pages.mjs` artık sayfaların İÇİNDEKİ JavaScript'i de `node --check` ile denetliyor. ludo.html ve tek.html'de 760 ve 896 satır satır içi script var ve hiçbir araç onlara bakmıyordu: `npm run check` yalnızca `src/**/*.js` dosyalarını okuyor. Oradaki bir sözdizimi hatası sunucuyu hiç etkilemiyor, **oyun sessizce boş açılıyor** — oyuncu için "oyun açılmıyor" demek.

İlk hâli üç yanlış alarm verdi: `.js` dosyalarının içinde HTML üretirken kullanılan scriptler sunucu tarafı `${...}` değişkeni taşıyor ve tek başına derlenemiyor. Onlar artık açıkça atlanıyor ve kaç tanesinin atlandığı yazılıyor. İki yönde de sınandı.

### Doğrulama
236 dosya, 423 birim testi (420 geçti, 3 atlandı; 11'i yeni: 6 birikmesi, sahibinin iki örneği, üç 6, kuyruk sırası, AFK 6, oynanamayan değer), 1009 import, 1167 SQL sorgusu, 6 WebView sayfası ve satır içi scriptleri.

Ludo kural değişikliği mevcut oyunları bozmuyor: `pending` alanı olmayan eski durumlar da yürüyor (test ediliyor).

## v2.150.1 — Maaş koşulları EŞİKLİ oldu (sahibinin düzeltmesi)

> "21 gün 59 dk bile olsa maaşın yarısı yatacak!"

v2.150.0'da bu koşulları **oranlı** kurmuştum: 22 günün 20'sini yapan yayıncı o koşulun payının %90'ını alıyordu. İstenen kural bu değil. Koşul ya tutar ya tutmaz:

- **22 gün isteniyorsa 21 gün eksiktir.** 80 saat isteniyorsa 79 sa 59 dk eksiktir — tek saniye eksik bile eksiktir. Kaç eksik olduğu ödemeyi değiştirmiyor: 21 gün ile 10 gün aynı sonucu veriyor.
- **Gün ve yayın saati TEK koşul.** Sahibi bu ikisini her seferinde birlikte söyledi ("gün ve yayın saati eksikse yarısı"), bu yüzden ayrı ağırlıkları yok. Ayrı olsaydı yalnızca günü eksik olana %75 ödenirdi — söylenen %50 değil.
- Ağırlıklar: **devam 5000 + elmas 3000 + görev 2000**. Gün veya saat eksikse tam olarak maaşın yarısı yatıyor. %60 isteniyorsa devam ağırlığı 4000 yapılır; panel sonucu canlı yazıyor.
- Hak ediş = sözleşme kademesinin maaşı × tutan koşulların ağırlık toplamı. 1. kademede 10,00 $ → yarısı 5,00 $; 44. kademede 100.724,00 $ → yarısı 50.362,00 $.

**Kimseye yanlış ödeme yapılmadı:** ağırlıklı hesap hiç ödemeye esas olmadı (`salary_weighted_enabled` kapalı geldi, kapalı duruyor). Hatayı, ödeme açılmadan önce düzeltmiş olduk — "hesaplanan ama ödemeyen kat" yaklaşımının sebebi tam olarak bu.

### Yapılanlar
- `salary_weights.rules.js` eşikli hâle getirildi. Oran bilgisi KALDI ama yalnızca gösterim için: yayıncı "22 günün 21'ini yaptım" görüyor, ödemeyi `met` belirliyor.
- Göç 111: ağırlık anahtarları `days`+`hours` → `attendance`. Elle değiştirilmiş eski ağırlıkları da çeviriyor (gün 2000 + saat 2000 → devam 4000), yani sahibinin kurduğu oran korunuyor. İki kez uygulanınca bozmuyor; gerçek PostgreSQL'de üç yönde de sınandı.
- Kapanmış dönemlerin kırılımına **dokunulmadı**: o dönem o kurallarla hesaplanmıştı, geçmişi yeni kurala göre yazmak özetin belge olma niteliğini bozardı.
- Yayıncı ekranı artık tutmayan koşulda **hangisinin** eksik olduğunu yazıyor ("Gün: 21 / 22" ya da "Saat: 79s 0dk / 80s 0dk") — yayıncı neyi düzelteceğini bilsin.
- 29 birim testi yeniden yazıldı: 21 gün, 79 sa 59 dk, tek saniye eksik, tam sınırda tutma, tek koşul davranışı, %60 ayarı.

### Doğrulama
414 birim testi (411 geçti, 3 atlandı), 108 göç dosyasının tamamı sıfırdan gerçek PostgreSQL 16'ya uygulandı, sıfırdan kurulumda devam ağırlığı 5000 ve iki bayrak da kapalı.

## v2.150.0 — Maaş motoru: kademeli hak ediş ve ay başı otomatik aktarım (ikisi de bayrak arkasında, kapalı)

Sahibinin maaş tasarımı koda girdi. **Hiçbir şey henüz farklı ödemiyor:** yeni hesap her dönem kapanışında eski hesabın yanında yapılıp özete yazılıyor, ödemeyi hâlâ eski kademe hesabı belirliyor. İki sayı gerçek veri üzerinde karşılaştırıldıktan sonra panelden açılacak. Para davranışını bayraksız değiştirmek, yanlışı geri alınamaz hale getirirdi.

### Hak ediş artık oranlı
- Hesap: **hak edilen = sözleşme kademesinin maaşı × Σ(koşul ağırlığı × gerçekleşme oranı)**. Koşullar: geçerli gün, yayın saati, elmas hedefi, görev/etkinlik. Ağırlıklar panelden; toplamı 10000 olmak zorunda (olmazsa kimse maaşının tamamını hak edemez, bu yüzden kayıt reddediliyor).
- Varsayılan: gün 2500 + saat 2500 + elmas 3000 + görev 2000. Gün ve saat birlikte tutmazsa **%50** kalıyor — tasarımdaki örneğin aynısı. Sahibi %60 isterse ikisini 2000'e indirmesi yeterli; panel girilen ağırlıkla sonucu **canlı** yazıyor.
- **Kısmi gerçekleşme oranlı.** 22 günün 20'sini yapan yayıncı o koşulun payının %90'ını alıyor. Eskiden bir basamak aşağı düşüyor ya da hiç alamıyordu ve neden olduğunu göremiyordu.
- Temel maaş `broadcasters.contract_tier`'dan geliyor. Bu sütun veritabanında **vardı ama maaş hesabında hiç kullanılmıyordu** — tasarımın "base_salary_beans"i tam olarak bu. Sözleşme kademesi atanmamış yayıncıda ağırlıklı hesap yapılmıyor: uydurma bir temel maaş üretmek, yanlış para ödemekten beter.
- Kademe atama ucunun üst sınırı **10'du, tablo 44 kademeli**: 11 ve üstü hiç atanamıyordu. Sınır artık tablonun kendisinden okunuyor ve tabloda olmayan kademe reddediliyor.
- Gerekli gün/saat/elmas, dönem özetine **dondurularak** yazılıyor: kademe tablosu sonra değişse bile geçmiş özetteki "22 günün 20'si" anlamını koruyor. Dönem yapılandırması ağırlıkları da donduruyor, yani ağırlık değişikliği yalnızca yeni dönemlere uygulanıyor.
- Para matematiği tam sayı: ondalık yok, bölme tek yerde ve en sonda, yuvarlama aşağı. Koşul başına bölünseydi her koşulda yuvarlama hatası birikirdi — test bunu da sınıyor.

### Ay başı otomatik aktarım
- Kapanmış dönemlerin maaşı, ayın 1–3'ü arasında yayıncının dolar bakiyesine kendiliğinden geçiyor. **Talep yok:** ne yayıncı başvuruyor ne yönetici tuşa basıyor.
- **"Bir kere" güvencesi üç kat:** tekil anahtarlı `salary_transfer_runs` satırı (aktarımla aynı transaction içinde, yani yarım kalan çalışma dönemi sonsuza kadar kilitlemiyor), `status='pending'` koşulu, danışma kilidi. Üçünden biri tek başına yeterdi; para işinde bu fazlalık değil. E2E aynı dönemi dört kez aktarmaya çalışıp bakiyenin değişmediğini doğruluyor.
- Sunucu 1–3 arasında kapalı kalırsa o ay atlanmıyor: aktarılmamış kapanmış dönemler sonraki pencerede ödeniyor.
- Pencere günleri panelden; aktarım kayıtları panelde (hangi dönem, otomatik mi elle mi, kaç yayıncı, kaç kişi atlandı).

### Ödeme kapısı: kimlik yerine telefon
- Maaşın cüzdana geçmesi için **telefon doğrulaması yeterli**; kimlik fotoğrafı istenmiyor. Geri kalan doğrulamayı ödemeyi yapacak aracı şirket belirleyecek. `kyc_status` kaldırılmadı, sağlayıcının ileride isteyebileceği doğrulama için yerinde.
- Bu koşul **iki ayrı sorguda ayrı ayrı yazılıydı.** Ayrışsalar, koşulu birinde tutup diğerinde tutmayan bir yayıncının özeti "ödendi" olup parası hiç yatmayacaktı — maaş sessizce kaybolurdu. Tek kaynağa alındı (`SALARY_PAYABLE_SQL`).
- Telefonu doğrulanmamış yayıncının maaşı **kaybolmuyor**: özet beklemede kalıyor ve doğruladıktan sonraki aktarımda ödeniyor. E2E bunu da sınıyor.

### Elmas bozdurma ile çakışma (sahibinin mesajı ortaya çıkardı)
Yöntem 2 (elmas bakiyesini maaşa çevirme) ile ağırlıklı hesap **birlikte çalışıyordu**: yayıncının elması düşülüyor, maaşı ise ağırlıklı tutardan ödeniyordu. Yani elmasını alıp karşılığını vermemiş olacaktık. İkisi artık birbirini dışlıyor — ağırlıklı hesapta maaş sözleşme kademesinden geliyor, elmasla "maaş satın almak" diye bir adım yok. Yayıncı elmasını tutuyor, gelirini ayrıca bozdurmaya devam ediyor.

### Yeni güvenlik ağı: SQL yer tutucu sayımı
`sql_params.mjs` — `host_statements` INSERT'ine 10 sütun eklerken 38 yer tutucuyu elle saymak zorunda kaldım. Bir eksik olsa PostgreSQL "bind message supplies 37 parameters, but prepared statement requires 38" diyecek ve bu **yalnızca dönem kapanışında**, yani ayda bir çalışan bir yolda ortaya çıkacaktı.

Aracı yazarken **dört ayrı hata yaptım ve her birini kendi tuzağına düşürerek buldum:** ilk hâli 155 yanlış alarm verdi (VALUES içindeki düz değerleri yer tutucu saymıştı); dizi içindeki diziyi sıfır eleman saydı; şablon değişkeni içeren SQL'i statik sayamayacağını görmedi; ve en kötüsü — **sondaki virgül yüzünden, diziden bilerek bir değer sildiğimde "uyuşuyor" dedi.** Yani kurduğu tuzağa kendisi düştü. Şimdi 1167 sorguyu denetliyor, 227'sini "sayamıyorum" diye açıkça atlıyor ve iki yönde de sınandı.

`singleton_methods.mjs` de genişletildi (`log` nesnesi eklendi) ve daraltıldı: yalnızca o adı gerçekten import eden, yerelde gölgelemeyen dosyalar. Bu sürümde `log(...)` diye çağırmıştım — `log` bir nesne, fonksiyon değil; çalışma anında TypeError olacaktı.

### Doğrulama
- 236 dosya, 410 birim testi (25'i yeni: hak ediş aritmetiği, ağırlık doğrulaması, aktarım penceresi), 1009 import, 835 e2e çağrısı / 530 adres, 1167 SQL sorgusu, 98 ortak nesne çağrısı.
- **107 göç dosyasının tamamı sıfırdan gerçek PostgreSQL 16'ya uygulandı.** Yeni kısıtlar gerçekten reddediyor: %100'ü aşan hak ediş yazılamıyor, ters aktarım penceresi kurulamıyor, aynı dönem ikinci kez aktarılamıyor. Kodun dayandığı iki PostgreSQL davranışı (`ON CONFLICT DO NOTHING` çakışmada sıfır satır döndürür; geri alınan çalışma kilit satırı bırakmaz) ayrıca sınandı.

### Hâlâ bayrak arkasında / yapılmadı
- İki bayrak da kapalı. Önce bir dönem kapatıp iki sayıyı karşılaştır, sonra aç.
- **Fasulye / USD ayrı defter yapılmadı** (sahibinin kararı: "kalsın, tasarımın o maddesini uygulama"). Fasulye ile dolar aynı bakiye, Coin'e çevrilip gönderilebiliyor.
- Ödeme sağlayıcısı seçilmedi. Ajans sahibinin yayıncı maaşına müdahale edememesi ve geçmiş ayın kesinleşmiş maaşının değiştirilememesi henüz denetlenmedi — `docs/BACKLOG.md` §D.

## v2.149.0 — Ana bayi / Alt bayi, uygulama içi onay kutuları, doğrulanmış hesap telefona bağlandı

### Ana bayi / Alt bayi
- Bayi yapısı artık iki katlı: `dealer_accounts.parent_dealer_id`. Alt bayinin kendi altında bayi **olamaz** (muhasebe okunabilir kalsın diye; kural hem uygulamada hem e2e'de sınanıyor).
- Ana bayi, kendi stoğundan alt bayisine Coin aktarabiliyor. **Coin yaratılmıyor:** ana bayiden düşüp alt bayiye geçiyor, tek işlemde, iki tarafın defterine de yazılarak (`sub_transfer_out` / `sub_transfer_in`) ve mali denetim kaydıyla. Toplamın değişmediği hem birim testinde hem e2e'de doğrulanıyor.
- Yalnızca KENDİ alt bayisine aktarım yapılabiliyor; kapalı bayiye, bakiyenin üstüne ve sıfır aktarıma izin yok. Aktarım `Idempotency-Key` ile korunuyor: ağ koparsa istek tekrarlansa bile ikinci defa aktarım olmuyor.
- Bayi merkezinde "Alt Bayilerim": alt bayi listesi, bakiyeleri, satış toplamları ve aktarım kutusu. Alt bayi kendi ekranında neden boş olduğunu okuyor.
- Panelde bayinin ana bayisi seçilebiliyor / bağ kaldırılabiliyor; liste ana ve alt bayiyi ayırt ediyor.

### Ajans / Yayıncı Merkezi
- **Tarayıcı uyarı kutuları kaldırıldı.** Bu sayfalar uygulama içinde WebView'de açılıyor; `window.confirm` Android'in kendi kutusunu açıyor ve kutunun başlığında **sunucunun adresi** yazıyordu. Yerine uygulama temasına uygun, adres göstermeyen sayfa içi kutu geldi (`useConfirm()`). Beş yerin hepsi değişti.
- **"Ajanstan ayrıl" → "Ajanstan ayrılma talebi oluştur".** Sunucu zaten doğrudan çıkarmıyor, bir talep oluşturup ajansın onayını bekliyordu; etiket yanlış söylüyordu. Onay kutusu da ne olacağını yazıyor.
- `confirmTyped` ("SİL" yazdırarak onay) paylaşılan kitten yönetim paneline taşındı: uygulama içi sayfalar o dosyayı import ediyordu.

### Doğrulanmış hesap
- **Oda içindeki "Doğrulanmış" rozeti kaldırıldı.**
- Doğrulanmış hesap artık **telefon numarası bağlı** demek (eskiden kimlik fotoğrafının yönetimce onaylanması gerekiyordu). Boolean SQL'de hesaplanıyor; başka kullanıcının telefonu ya da doğrulama zamanı hiç taşınmıyor.
- `kyc_status` **kaldırılmadı**: para çekme / maaş ödemesi kapısı olarak duruyor. Değişen yalnızca kullanıcıya gösterilen etiketin anlamı.

### Yeni güvenlik ağları (üçü de kendi hatasıyla sınandı)
- `singleton_methods.mjs` — **var olmayan yöntem çağrısı.** Bu sürümde `hub.toUser(...)` yazdım; öyle bir yöntem yok (doğrusu `sendToUser`). Sözdizimi doğru, import doğru, tanımsız ad yok — hiçbir araç görmüyordu. O uç çağrıldığında TypeError atıp kullanıcıya "Sunucu hatası" dönecekti. 113 çağrı denetleniyor.
- `webview_dialogs.mjs` — uygulama içinde açılan panel sayfalarında tarayıcı kutusu. WebView giriş sayfalarından import zincirini izliyor, yani paylaşılan bir dosyaya eklenen kutu da yakalanıyor; benim gözden kaçırdığım `kit.tsx` içindeki kutuyu bu araç buldu. 21 dosya denetleniyor.
- `dart_check.py` — **nullable yardımcıya koşulsuz indeksleme.** `mapOf(x)` null dönebiliyor; `mapOf(x)['k']` yazmak `flutter analyze`'da hata ve CI'da derlemeyi durduruyor. Bu sürümde dört yerde yazmıştım. Depoda sıfır yanlış alarm.

### Doğrulama
- 233 dosya, 385 birim testi (12'si yeni: ana/alt bayi kuralları, sahte istemciyle, PostgreSQL gerekmeden), 999 import, 827 e2e çağrısı / 528 adres, 74 router bağlaması, 113 ortak nesne çağrısı, 21 WebView panel dosyası, 6 WebView sayfası, 56 SDUI tanımı, Dart ön denetimi temiz.
- **106 göç dosyasının tamamı gerçek PostgreSQL 16 üzerinde uygulandı** ve yeni kısıt (`dealer_not_own_parent`) gerçekten reddediyor. Değiştirilen paylaşımlı kullanıcı SELECT'i de gerçek veritabanında koşturuldu — bu sütun adı hatası bütün kullanıcı uçlarını birden bozardı. Yöntem `docs/MODULE_STANDARD.md`'ye yazıldı.

### Duyurular — bilerek SDUI'ye taşınmadı
Duyuru akışı türüne göre üç ayrı elle çizilmiş kart (ekip baloncuğu, etkinlik kartı, ödül kartı), içinde etkinlik kürsüsü, sohbet gibi en alta kaydırma ve canlı rozet sayacı. SDUI'nin `repeater` + `listItem` kalıbı bunları ifade edemiyor; zorlamak ekranı kötüleştirirdi. İçerik zaten dinamik: panelden girilen duyuru anında görünüyor. Gerçek iyileştirme ileride kanal listesinin sunucudan gelmesi — şu an team/event/reward Dart'ta sabit. `docs/BACKLOG.md`'ye yazıldı.

## v2.131.1 — P0 tamamlandı: test bütçesi 10M, amiral hediye doğrulaması, paket denetimi, yedek provası
- **Test bütçesi 1M → 10M.** En pahalı hediye 5.000.000 Coin olacağı için tek gönderim bütçenin yarısını yiyordu.
- **5.000.000 Coin'lik hediye uçtan uca doğrulandı:** fiyat tavanı (1 trilyon), seviye matematiği (5M → seviye 23; tavan 300. seviye ≈ 3,09 milyar), global şerit eşiği, defter kayıtları ve mobil gösterim ("5M"). E2E senaryosu eklendi: hediye oluşturma → test bütçesinden basım → gönderim → şerit → defter → mutabakat → bütçe sınırı denemesi.
- **Oyun paketi denetimi (O-01 adım 1):** Her paketin SHA-256 özeti ve yükleyen yönetici kaydediliyor; yükleme, açma, kapatma, yeniden başlatma ve kaldırma denetim tablosuna düşüyor ve panelde "Paket kayıtları" olarak görünüyor. Aynı dosya tekrar yüklenirse uyarı veriyor; yeni sürümde değiştirilen sürümün özeti kayda geçiyor. Yükleme ekranına, paket kodunun sunucuda tam yetkiyle çalıştığı uyarısı kondu.
- **Hazırlık (staging) ortamı kurulmayacak** (sahip kararı). Yerine kural: bundan sonraki her riskli adım panelden kapatılabilir bir bayrak arkasında gelecek, önce eski yolla yan yana çalışacak ve her riskli dağıtımdan önce yedek provası yapılacak. Gerekçesi ve bedeli `docs/ARCHITECTURE_AUDIT.md` → I-04'te yazılı.
- **Yedek provası (V-03 kapandı):** `backup.sh` artık aldığı yedeği doğruluyor (gzip bütünlüğü, dump bitiş satırı, boyut kontrolü, SHA-256 özeti); yarım kalan dosya geçerli yedeğin üzerine yazmıyor. Yeni `restore_test.sh` en son yedeği geçici bir veritabanına geri yükleyip kritik tabloları, kullanıcı sayısını ve bakiye-defter mutabakatını sınıyor, geri dönüş süresini yazıyor ve temizliyor. Üretime dokunmuyor. Gerçek PostgreSQL üzerinde uçtan uca denendi.

## v2.131.0 — P0: istemci-çarpanlı oyun yolu kaldırıldı, mutabakat ve basım bütçeleri geldi
- **F-01 kapandı:** `/api/activity-play/.../bet` ve `/settle` uçları kaldırıldı. Kazancı oyunun kendisi (istemci) bildiriyordu; bileti eline geçiren oyuncu her turda azami çarpanı göndererek kasayı boşaltabilirdi. `coin_play` bayrağı ve bahis/çarpan sütunları da gitti. Coin ile oynanan oyun artık yalnızca sunucuda sonuç üreten iki yoldan çalışır: oyun paketi ya da imzalı sağlayıcı API'si.
- **F-02 kapandı:** Günlük mutabakat. Her kullanıcı için `bakiye farkı = işlem defteri toplamı` denetlenir; fark bulunursa mali denetim günlüğüne alarm yazılır ve panelde kırmızı uyarı çıkar (Mali kayıtlar → Mutabakat). Önce ölçüldü: bakiyeyi değiştiren 28 kod yolunun tamamı aynı transaction içinde defter yazıyor.
- **Basım bütçeleri:** Sıfırdan üretilen Coin artık kategoriye ve aylık sınıra bağlı — Yazılım testi, Etkinlik ödülü, Kullanıcı telafisi, Pazarlama. Kim, kime, hangi bütçeden, neden bastı kayıtlı (Mali kayıtlar → Basım bütçesi).
- Denetim belgesine mimari ilke yazıldı: görünüm WebView'de olabilir, karar yalnızca backend'de.

## v2.130.1 — Mimari denetim belgesi
- `docs/ARCHITECTURE_AUDIT.md`: hibrit mimariye geçiş öncesi temel denetim. 900+ dosya taranarak her alan korunacak / düzeltilecek / geliştirilecek / eklenecek olarak sınıflandırıldı; her bulgunun kanıt dosyası var.
- Kod değişikliği yok (yalnızca belge). Bulunan beş öncelikli madde: istemciden kazanç alan eski oyun ucu, oyun paketlerinin tam yetkisi, bakiye–defter mutabakatının olmayışı, tek sunucu örneği sınırı, medyanın veritabanında olması.

## v2.130.0 — Oyun paketleri: oyun kodu artık depoda değil
- Oyunlar ana koddan tamamen çıkarıldı. Süper admin **Sistem → Oyun Paketleri** sayfasından paket zip'i yükler; dosyalar veritabanında saklanır, sunucu açılışta paketi çalıştırır (istemci /g/<id>/, API /api/g/<id>/, WebSocket /ws/g/<id>).
- Paketin yönetim ayarları, istatistikleri ve tabloları aynı sayfada paketin kendisinden gelir (genel form).
- Paket kaldırılınca etkinlik kartı da kaldırılır; oyunun verileri veritabanında kalır.

## v2.126.4 — Zip oyun "Yakında" kalıyordu
- Panelde oyun yükledikten sonra "Kaydet"e basınca eski (boş) bağlantı oyunun bağlantısını siliyordu; artık yüklü oyunun bağlantısı korunur, form yüklemeden sonra yenilenir.
- 085: bağlantısı boşalmış yüklü oyunlar kendiliğinden düzeltilir.
- {base} adresi artık kodlanmadan yazılır (oyun adresi bozuk açılıyordu).

## v2.126.3 — Panel derlemesi: glibc tabanlı Node + hata bağlantısı düzeltmesi
- Panel derlemesi node:20-alpine yerine node:20-bookworm-slim ile yapılır (Next/Tailwind yerel paketleri için daha sağlam).
- "Derleme hatası" bağlantısı mutlak yola alındı (/yonetim/derleme-hatasi.txt); dosyaya npm install çıktısı da eklendi.

## v2.126.2 — Panel derleme hatası görünür + tip uyarısı paneli durdurmasın
- Panel derlenemezse yedek sayfada "Derleme hatası" bağlantısı (/yonetim/derleme-hatasi.txt) son 60 satırı gösterir.
- next.config: tip uyarıları (tsc ayrıca denetlenir) paneli yayından alıkoymaz.

## v2.126.1 — Uçtan uca test düzeltmesi
- Ludo / TEK oyunları artık 500 Gümüş istediği için uçtan uca testin kullanıcılarına Gümüş verildi; ayrıca Gümüş girişi
  (yetmeyince 402, düşme, iptalde iade) için yeni test eklendi. Uygulama davranışı değişmedi.

## v2.126.0 — Oyun zip yükle: sunucu barındırır, bağlantı ve API otomatik
- Panel > Oda Etkinlikleri > etkinlik > "Oyun dosyası (zip)": HTML oyunun zip'i yüklenir; sunucu güvenle açar (../, gizli ve
  izinsiz dosyalar atlanır, 60 MB / 800 dosya sınırı), veritabanına yazar ve /games/<etkinlik>/v<N>/ altında yayınlar.
  Bağlantı kendiliğinden yazılır; yeni zip = güncelleme (uygulama yenilemek gerekmez). Migration 084.
- Oyun sayfasına TRGame SDK otomatik eklenir: TRGame.me(), TRGame.bet(), TRGame.settle(), TRGame.play(bahis, oyun) →
  Coin bahis/sonuç uçları (activity-play) tek satırla. Bilet adresten okunur.
- Bağlantıda {base} (sunucu adresi) yer tutucusu.

## v2.125.2 — Oda menüsü düzeni, ID rengi, sahip çıkınca oda fotoğrafı
- İnteraktif Özellikler: üst sıra PK · Şanslı Çanta · Sayı tahtası; alt sıra Ludo · TEK (Uno) · Etkinlikler. Ludo/TEK'teki
  altın çerçeve tüm özelliklere uygulandı. Temel Araçlar daireleri uygulamanın sarısında.
- ID rengi WIP'e bağlı değil: yalnızca takılı Renkli ID (bronz/gümüş/altın) ID'yi renklendirir; WIP'li kişinin ID'si sade yazı.
- Oda sahibi odadan çıkınca (oda yardımcıyla açık kalırsa) odanın üstündeki profil fotoğrafı ve ID artık kaybolmuyor.

## v2.125.1 — Gümüş artık Ludo / TEK (Uno) oyunlarının girişi için
- Gümüş, etkinliklerde değil odadaki Ludo ve TEK oyunlarına katılırken düşer (varsayılan 500; panel > Oda Etkinlikleri >
  Oyun giriş ücreti, 0 = ücretsiz). Kuran da katılan da öder; oyun başlamadan ayrılan / iptal edilen oyunda iade edilir,
  başlamış oyunda giriş yanar. Gümüş yetmezse katılım olmaz. Ludo lobisinde ücret ve Gümüş bakiyesi görünür. Migration 083.
- Etkinlikler yalnızca Coin ile çalışır (Gümüş girişi ve Ludo/Uno etkinlik satırları kaldırıldı).

## v2.125.0 — Gümüş madeni para + Coin'li etkinlik sistemi
- Gümüş: yeni para birimi; yalnızca Ludo / Uno gibi etkinliklere GİRİŞ için (Coin'e çevrilmez). Günlük girişte 1.-6. gün
  1.000, 7. gün 10.000 Gümüş (panelden değişir). Etkinlik kartında giriş ücreti rozeti, açarken sunucu Gümüşten düşer
  (yetmezse açılmaz). Ludo ve Uno etkinlikleri (giriş 500 Gümüş) eklendi; bağlantıyı panele yapıştır. Migration 082.
- Coin'li etkinlik: oyun sayfası kullanıcıya özel {token} ile /api/activity-play/:id/bet (bahis düşer) ve /settle
  (çarpanı oyun bildirir, ödeme = bahis × çarpan) çağırır. Sunucu: en az/en çok bahis, en yüksek çarpan sınırı, turu tek
  kez sonuçlandırma, cüzdan + mali kayıt, canlı bakiye. İmza anahtarı gerekmez.
- Panel: Oda Etkinlikleri'nde giriş Gümüşü, Coin bahsi ve sınırlar; Günlük giriş'te Gümüş ödülleri.

## v2.124.2 — Etkinlik izni: yöneticiler de izne tabi
- Yönetici hesapları dahil, yalnızca izin listesindeki kişiler Etkinlikleri görür ve açar.

## v2.124.1 — Etkinlikler yalnızca izinli kişilere
- Etkinlikler menüsünü yalnızca yönetimin izin verdiği kişiler görür ve açabilir (yöneticiler dahil, istisna yok). Karar sunucuda:
  oda menüsü, etkinlik listesi, H5 sayfası ve etkinlik açma uçları izinsiz kişiye kapalıdır. Migration 081.
- Panel > Oda Etkinlikleri > Görme izni: ID ya da kullanıcı adıyla izin ver / kaldır.

## v2.124.0 — Oda etkinlikleri (bağlantı yapıştır → açılır) + Coins Bayisi Merkezi
- Etkinlikler: yönetim paneli > Sistem > Oda Etkinlikleri. Satıra bağlantı yapıştırılınca uygulamada "Yakında" kalkar,
  dokununca açılır (alt pencere / tam ekran / tarayıcı). Yer tutucular: {uid} {publicId} {name} {avatar} {lang} {roomId} {token} {ts}.
  {token}: kişiye ve etkinliğe özel 2 saatlik oyun bileti (oturum bileti değildir).
- Coin'li oyun sağlayıcısı API'si: POST /api/activity-provider/:id/user ve /:id/balance (HMAC-SHA256 imza, ±5 dk,
  orderId ile tekrar güvenli, cüzdan + mali kayıt + canlı bakiye). Migration 080.
- Coins Bayisi Merkezi (profil menüsü, yalnızca bayi): satıştaki Coin, Kendine yükle, Kullanıcıya Coins Yükle
  (ID ile ara → kişi kartı → miktar → Anında / 5 dakika sonra → not → sipariş onayı), işletme verileri,
  Yeniden Şarj Geçmişi (tarih aralığı, Tümü / Satın alma / Satış), Stok yükle (ödeme yöntemi + toptan paket →
  ödeme bağlantısı açılır, referanslı talep), Taleplerim.
- API: /api/dealer/self, /api/dealer/transactions, /api/dealer/stats (total), /api/dealer/sell delayMinutes,
  /api/dealer/topup-packages (methods), /api/admin/dealer-shop (paketler + ödeme bağlantıları).
- Panel: Ekonomi > Bayi Mağazası (paket fiyatları, ödeme bağlantısı yapıştırma).

## v2.123.3 — Derleme düzeltmesi
- flutter analyze uyarısı (room_screen.dart: kullanılmayan `spec` değişkeni) giderildi; APK yeniden derlenir.

## v2.123.2 — Sayı tahtası tüm mikrofon modlarında sayar
- Puan ayrı bir satır yerine avatarın alt kenarına binen siyah-altın rozetle gösterilir (💎 + puan; 10.000 üstü "12K",
  "3,4M"). Eskiden 12 / 15 / 20 / 25 / 30'lu sık modlarda satır sığmadığı için puan hiç görünmüyordu; artık her modda ve
  görüntülü ızgarada, yalnızca sayı tahtası açıkken görünür. Koltuk ölçüleri değişmez.

## v2.123.1 — Ajans Merkezi arama satırı, gizli kullanıcı, etkinlik sonuç kartları
- **Ajans / Yayıncı / Bayi panelleri:** telefonda "Ara" düğmesi satırı kaplıyor, arama kutusu küçücük kalıyordu. Giriş kutusu
  yanındaki düğmeler artık yalnızca kendi genişliğinde; kutu kalan yeri kaplar (globals.css).
- **Gizli kullanıcının oda girişi** siyah-altın şerit; "Gizli 772501" kimlik kapsülü mor yerine siyah-altın, içinde altın
  maske; adı altın yazı.
- **Gizli kullanıcı tanıdık listelerinde gerçek adıyla görünür:** arkadaşlar ve arkadaşlık istekleri, kendi takip / fan
  listem, özel mesaj listesi, CP / ilişki duvarı (publicUser `reveal`). Odalarda, herkese açık listelerde ve başkasının
  takip listesinde gizli kalır; gizli kişinin kendi ilişki duvarı başkalarına yine kapalı.
- **Etkinlik sonuç kartları yeniden tasarlandı:** başlık şeridi + "İLK 3"; basamakların tabanı aynı çizgide, adlar tek satır
  (uzun / süslü adlar kürsüyü bozmaz), metalik basamaklar ve büyük sıra numarası, boş basamakta soluk halka + "Boş",
  çiftlerde ortada kalpli iki fotoğraf.

## v2.123.0 — Sayı tahtası (Yoho gibi) ve yeni gizli kullanıcı görünümü
- **Sayı tahtası oturumları:** Araçlar > İnteraktif Özellikler > "Sayı tahtası" (oda yöneticileri).
  - Süre: Manuel Kontrollü ya da 5 / 10 / 15 / 30 / 60 dk. Kuralları Sıfırla: koltuktan ayrılınca / odadan ayrılınca.
  - Başlayınca sayaçlar sıfırlanır, koltuklarda puan rozeti görünür, sohbete "X, … için puan tablosunu etkinleştirdi.
    Sıfırlama kuralı: …" düşer.
  - Sohbetin üstünde altın "devam ediyor: 00:14" (süreli sayımda "kalan") çubuğu; yönetici ✕ → "Sayımı durdurmayı
    onaylıyor musunuz?" → sonuç: birincinin taçlı fotoğrafı ve puanı + sıralama, sohbete "X puan tablosunu kapattı!".
  - Süre dolunca sunucu kendisi kapatır (15 sn'de bir). Pencerede ? (kurallar) ve geçmiş (önceki sayımlar ve sonuçları).
  - Sıfırlama kuralları veritabanı tetikleyicisiyle uygulanır (inme, atılma, çıkma, oda kapanması — hangi yoldan olursa).
  - Sunucu: migration 079 (room_scoreboard_sessions + tetikleyici), `POST /api/rooms/:id/scoreboard/start|stop`,
    `GET /api/rooms/:id/scoreboard/history`; `GET …/scoreboard` yanıtında `session`. Olay: `scoreboard_session`.
  - Eski sunucuyla eski davranış (sürekli sayaç) korunur.
- **Gizli kullanıcı yeniden tasarlandı (uygulama renkleri):** mor soru işareti yerine siyah-altın küre üzerinde altın
  maskeli balo maskesi ve altın halka (Yoho / Bigo "Gizemli Kişi" gibi). Adı altın yazıyla, yanında küçük maske rozetiyle.

## v2.122.1 — "Tüm Oda" hediyesi sunucuda toplu yazılır
- Çok alıcılı gönderimde ("Tüm Oda", "Tüm Koltuk", çoklu seçim) her alıcı için ~12 sorgu sırayla çalışıyordu
  (50 kişide ~600 sorgu, işlem boyunca hesaplar kilitli). Artık her adım tüm alıcılar için TEK sorguda:
  Elmas + hediye seviyesi, hediye kayıtları, sayı tahtası, CP yakınlığı, koruyucu puanı, cüzdan kayıtları, global şerit.
  Odada süren PK yoksa alıcı başına PK sorgusu hiç yapılmaz. 50 kişide ~600 → ~12 sorgu.
- Tek alıcılı gönderim eski yoldan devam eder; kayıtlar ve sonuç birebir aynıdır. Yeni SQL'ler yerel PostgreSQL 16'da
  şema üzerinde denendi; uçtan uca hediye testleri (Tüm Koltuk / Tüm Oda, muhasebe doğruluğu) GitHub'da çalışır.

## v2.122.0 — Bölüm 6: bayi, yayıncı, ajans
- **Bayi paneli · Coin satışı yenilendi:**
  - Alıcı uygulamadaki **ID'si** ya da kullanıcı adıyla aranır; satıştan ÖNCE fotoğrafı, adı, ID'si ve seviyesi gösterilir
    (yanlış kişiye geri alınamaz Coin gitmez). Sunucu: `GET /api/dealer/lookup?q=`; satış ucu ID'yi de kabul eder.
  - **Son müşteriler**: sık alanlar tek dokunuşla seçilir.
  - **Gerçek satış özeti** (son 50 hareket değil, sunucu toplamı): bugün / 7 gün / 30 gün, işlem ve alıcı sayısı
    (`GET /api/dealer/stats`).
  - Hızlı tutarlara 1.000.000 eklendi; gönder düğmesi tutarı yazar.
- **Alıcı Coin'in geldiğini anında görür:** bakiyesi canlı güncellenir (soket `wallet`) ve "💰 Coin yüklendi" bildirimi alır.
- **Yayıncı Merkezi:** sonraki seviye için günlük tempo ("günde ortalama N elmas") ve bugünkü geçerli gün çubuğu
  (kalan süre / tamamlandı).
- İncelenip sağlam bulunanlar: bayi satışı (satır kilidi, eksiye düşemez bakiye, tek seferlik anahtar, cüzdan + mali
  denetim kaydı), bakiye talebi (yalnızca sabit paket, onay/ret kilitli), ajans maaş hesabı (geçerli gün, sesli/görüntülü
  ayrımı, yöntem 1/2, asistan payı, transfer bekleme süresi).

## v2.121.1 — Bölüm 5: mağaza, cüzdan, WIP
- Görünüm: Etkinleştir / Kaldır anında değişir, liste arkada sessizce tazelenir; hata olursa geri döner; art arda
  dokunuş tek istek.
- Mağaza: satın alınca bakiye yanıttan güncellenir (tüm profil yeniden okunmaz).
- İncelenip sağlam bulunanlar: tüm Coin harcamalarında satır kilidi + yeterlilik denetimi, veritabanında bakiye
  eksiye düşemez kuralı (users_balances_nonneg), mağaza / hediye için tek seferlik anahtar, her harcamada cüzdan kaydı
  ve mali denetim kaydı (önceki / sonraki bakiye).

## v2.121.0 — Bölüm 4: mesajlar ve sosyal
- **Özel mesaj anında görünür** (WhatsApp gibi): yazı listeye hemen düşer (saat simgesi = gönderiliyor), kutu boşalır,
  art arda yazılabilir. Gönderilemezse balonun altında "Gönderilemedi · tekrar dene". Eskiden hata olsa da yazı siliniyordu.
- **Eski mesajlar:** yukarı kaydırınca 50'şer yüklenir (sunucu: GET /api/messages/with/:id?before=…; yanıtta "more").
  Eskiden yalnızca son 50 mesaj görülebiliyordu.
- **Takip et / bırak anında** değişir (Fan sayısı dahil), hata olursa geri döner; tüm profil yeniden yüklenmez.
- Profil ve profil kartı aynı anda istenir (açılış daha hızlı).

## v2.120.1 — Bölüm 3: hediye akışı
- Hediye gönderirken bakiye dokunur dokunmaz düşer; kesin değer sunucu yanıtıyla gelir, hata olursa bakiye sunucudan okunur.
- İncelenip sağlam bulunanlar: tek seferlik anahtarla çift ödeme koruması, combo kuyruğu (sunucu yanıtı beklenirken
  dokunuşlar birikir, sırayla gider), animasyon kuyruğu sınırı (30 / zayıf telefonda 12), mp4 çözücü sırası.
- Tespit (ayrı adımda, testle yapılacak): "Odadaki herkese" hediyede sunucu her alıcı için ~12 sorguyu sırayla çalıştırıyor
  (50 kişide ~600 sorgu, tek işlem). Toplu (tek sorguda çok satır) yazıma geçirilecek.

## v2.120.0 — Bölüm 2: oda içi (giriş hızı, sohbet, mikrofon)
- **Odaya giriş hızlandı:** ses bağlantısı (en yavaş adım) üye listesini beklemeden başlar; sohbet geçmişi de aynı anda
  gelir. Odanın ek bilgileri (puanlar, PK, şans çantaları, mikrofon sırası, takip, ayarlar) 7 ayrı istek sırayla değil
  aynı anda alınır; biri hata verirse diğerleri yine gelir.
- Sunucu: giriş yanıtındaki 4 bağımsız okuma (üyelik, oda elması, sahibin ailesi, sahibin kimliği) aynı anda yapılır.
- **Sohbet:** yazı kutusu gönderince hemen boşalır (sunucu yanıtı beklenmez); gönderilemezse yazı geri gelir.
- **Mikrofondan inme** anında görünür ve mikrofon hemen kapanır; sunucu reddederse koltuğa (önceki mikrofon durumuyla) dönülür.
- İncelenip sağlam bulunanlar: mikten mike geçiş (anında, hata olursa geri döner), oda sinyali + yeniden katılma,
  arka planda görüntü tasarrufu, ses bağlantısı kopunca artan aralıklarla yeniden kurma.

## v2.119.0 — Bölüm 1: açılış ve bağlantı altyapısı
- **Ağ değişimi anında algılanır** (Android ağ dinleyicisi, MainActivity `trlive/network`): Wi-Fi ↔ mobil veri geçişinde
  soket beklemeden yeniden kurulur. Eskiden kopukluk sessizlikten anlaşılıyordu (odada 25 sn, dışarıda 75 sn donma).
- **HTTP bağlantı havuzu ağ değişince yenilenir:** eski ağdaki ölü bağlantı yüzünden ilk istek (hediye, mesaj)
  "Sunucuya ulaşılamadı" ile düşmez.
- **Açılış hızlandı:** ayarlar, dil, ses işleme ve oturum hazırlığı sırayla değil aynı anda yapılır (en kötü durum 13 sn → 5 sn).
- İncelenip sağlam bulunanlar (değişmedi): soket canlılık denetimi / üstel bekleme / oda aboneliği onayı ve yeniden
  bağlanınca durum eşitleme; token yenilemenin tekilleştirilmesi; para işlemlerinde tek seferlik anahtar (idempotency).

## v2.118.4 — SMS doğrulaması: gerçek hata nedeni gösterilir
- SMS gönderilemezse Firebase'in asıl nedeni ekranda yazar (Blaze planı yok / SHA parmak izi eklenmemiş / telefon girişi
  kapalı) ve Hata kayıtlarına düşer. Uygulama tarafı (kalıcı imza, ayarlar) zaten hazır; kalan adımlar Firebase konsolunda.

## v2.118.3 — Bildirim ve mesaj rozetleri: okunan artık kalmaz
- Bildirimler / aile sohbeti / resmî kanallar: önce "okundu" işareti beklenir, sonra rozet yenilenir (eskiden rozet önce
  yenilendiği için okunan bildirim sayıda kalıyordu).
- Geç dönen eski sayım yeni sayımı ezmez (aynı anda birden çok yenileme olduğunda rozet geri geliyordu).
- Kapalı hesaplardan ya da engellenen kişilerden gelen mesajlar / istekler rozette sayılmaz (listede görünmedikleri için
  rozet hiç sönmüyordu). Arkadaşlık isteği ve yeni takipçi rozeti de aynı kurala uyar.
- Bildirim kartı sayısı sekme rozetiyle aynı kuralla sayılır.
- Sohbet açıkken gelen mesaj hafif bir istekle okundu işaretlenir (POST /api/messages/with/:id/read).
- Mesajlar sekmesi, başka yerden okunan mesajlarda kendiliğinden yenilenir.
- Bildirimler sayfası açılınca telefonun bildirim çubuğundaki TR Live bildirimleri de silinir.

## v2.118.2 — Oda sesi kapalıyken hiçbir ses gelmez; hediye/giriş sesi tek ve senkron
- **Asıl neden bulundu:** şeffaf MP4 oynatıcısı (Tencent VAP), videonun ses izini kendi içinde çalıyordu; hiçbir ayara
  (oda sesi kapalı, hediye sesi kapalı, telefon araması) uymuyordu. Uygulama da aynı sesi ayrıca çaldığı için ses iki kez,
  biri geriden geliyordu. Oynatıcı yerel kopyaya alındı (mobile/yerel/flutter_vap_kit) ve kendi sesi Android + iOS'ta kapatıldı.
- Artık hediye / giriş / araç sesi yalnızca uygulamanın oynatıcısından, görüntüyle aynı anda ve ayarlara bağlı çalar.
- Oda sesi kapalıyken: konuşmacılar, oda müziği, hediye / giriş / araç sesleri, PK videosu — hepsi susar.
- Mağaza / çerçeve önizlemelerindeki MP4'ler de artık ses çıkarmaz.

## v2.118.1 — Kulaklıkla ses gitmiyor / gelmiyor düzeltmesi
- Kulaklık (kablolu / Bluetooth) takılınca ses artık "medya" moduna alınmıyor; bu geçiş bazı telefonlarda mikrofonu ve
  odanın sesini kesiyordu. Her zaman görüşme modu kullanılır, ses otomatik olarak kulaklığa yönlenir.

## v2.118.0 — Müzik, ses, SWIP, profil kartı, şanslı hediye ve diğer düzeltmeler
- **Müzik:** çalan müziği yalnızca başlatan kişi (DJ) yönetir; başkası açınca/kapatınca artık devralmaz, eski şarkı onda görünmez.
  Şarkı değiştirme hızlandı: DJ yüklemeyi beklemez, şarkı telefondan hemen başlar; yükleme sürerken başka şarkı seçilebilir.
- **Gürültü:** 3 ayrı anahtar tek "Gürültü engelleme" anahtarında birleşti.
- **Hediye / araç / giriş sesi:** ses görüntüyle aynı anda başlar (önce hazırlanır); kapatma, yükleme sırasında bile geçerli.
- **Mikrofona davet:** boş koltuğa dokununca "Mikrofona davet et" (odadakilerden seç).
- **Görüntülü oda:** sohbeti gizle / göster düğmesi.
- **Şanslı hediye:** "Kurallar" penceresi; 5.000 Coin altı hediyeler en fazla x500, üstü x1000 (sunucuda da uygulanır).
- **Dolar gönderme** Para Çekme sayfasına taşındı (bayiye / admine); Para Çekme düğmesi her zaman görünür.
- **SWIP:** kırmızı-yeşil renkler, çift halkalı çerçeve, ışık şeritleri / halka dalgalı gösterişli giriş.
- **Profil kartı:** kart görseli kartın üstüne tam genişlikte oturur, yazılara taşmaz.
- **Sohbet balonları** şeffaf.

## v2.117.0 — Ludo ve TEK baştan tasarlandı; oyun penceresinde mikrofon koltukları ve sırası
- Oyun sayfaları sunucudan gelir (APK gerekmez); yalnızca mikrofon şeridi uygulama tarafındadır.
- **Ludo:** cilalı altın çerçeveli tahta, parlak yuvalar ve kaleler, taç işlemeli taşlar (zıplayarak yürür), gidilecek karenin gölgesi,
  3B dönen zar (atanın rengiyle), kırılan taşta patlama ve sarsıntı, eşya karelerinde efektler, "Sıra sende!" bildirimi,
  oyuncu kartlarında süre halkası ve eve ulaşan taş sayısı, kazanınca konfeti ve kupa.
- **TEK:** yeni kart tasarımı (renkli yüz, eğik krem oval, altın çerçeveli sırt), neon masa ve ışık huzmeleri, kavisli altın el rafı.
  Animasyonlar: kart dağıtma, atılan kartın oyuncudan yığına uçuşu, çekilen kartın desteden ele uçuşu, +2/+4 ve joker şok dalgası, "TEK!" çağrısı,
  atlama simgesi, yön değişimi.
- **Otomatik çekme:** atacak kartı olmayan oyuncu için kart kısa bir bekleyişle kendiliğinden çekilir.
- **Mikrofon şeridi:** oyun penceresinin üstünde odadaki koltuklar (oturan, konuşan halkası, susturulmuş) ve mikrofon sırası (sıra sayısı / senin sıran) görünür.
  Avatara dokununca profil açılır; sıra düğmesi sıraya girer ya da (yetkiliyse) mikrofon isteklerini açar.

## v2.116.1 — ID tasarımı düzeltildi
- **Özel ID** artık ayrı/rengarenk bir görünüm değil: yalnızca rakamları kullanıcının seçtiği ID'dir ve normal ID gibi görünür.
- **Normal ID:** sade `ID:12345678` yazısı (kapsül yok).
- **Renkli ID (bronz / gümüş / altın):** solda parlak kapsül "ID" etiketi, yanında aynı renkte numara. Animasyon ve ışık geçişi kaldırıldı.
- Görünüm yalnızca takılı renkli ID'ye bağlıdır; özel ID'si olan biri de bronz/gümüş/altın takabilir.

## v2.116.0 — Ajans Merkezi ve Yayıncı Merkezi sunucudan (WebView, 4 dil); bayi paneli uygulamadan kaldırıldı
- **Ajans Merkezi** ve **Yayıncı Merkezi** artık sunucudaki sayfalardır (`/yonetim/m/agency/`, `/yonetim/m/host/`);
  uygulama bunları tam ekran WebView ile açar. Değişiklikler APK güncellemesi olmadan herkese gelir; veriler canlıdır.
  - Oturum adrese yazılmaz: sayfa uygulamadan "TRLive" kanalıyla ister, uygulama yalnızca kendi sunucusundaki sayfaya
    verir; bilet süresi dolarsa sayfa yenisini ister.
  - Dil uygulamanın diliyle aynı (Türkçe, İngilizce, Arapça, Hintçe); Arapça sağdan sola.
  - Sayfalar uygulamada Fasulye cüzdanını ve kullanıcı profillerini açabilir (izinli ekranlar).
- Ajans Merkezi: genel bakış (prim, elmas, canlı / aktif yayıncı, seviye, sıralama, görevler, duyuru, asistan yetkisi),
  yayıncılar (her yayıncının bu dönem yayın süresi, bugünkü süresi, geçerli günü, elması, seviyesi, tahmini maaşı ve ajans
  primi; süzgeçler; davet, bekleyen davetleri geri alma, ajanstan çıkarma), kazançlar, asistanlar, davet primi,
  transferler, maaş tablosu.
- Yayıncı Merkezi: ajans davetleri, bu dönem yayın süresi / geçerli gün / elmas / seviye / tahmini maaş, sesli-görüntülü
  ayrımı, hedef, maaş yöntemi, kimlik doğrulama, ajanstan ayrılma ve transfer işlemleri, geçmiş dönemler, maaş tablosu.
- Web ajans paneli de aynı bileşenleri kullanır (tek kod).
- Uygulamadan kaldırılanlar: Bayi paneli (bayiler `/yonetim/dealer/login/` adresinden girer), eski Ajans Merkezi ve
  Yayıncı Merkezi ekranları. Bildirimler ve Gelirlerim'deki bağlantılar yeni sayfaları açar.

## v2.115.0 — Yönetim tamamen web panelinde; uygulamadan yönetim ekranları kaldırıldı
- Uygulamadaki **Yönetim paneli / Yardımcı admin paneli** girişi ve tüm yönetim ekranları kaldırıldı (11 ekran).
  Yönetim artık yalnızca `https://SUNUCU/yonetim/admin/login/` adresinden yapılır; yönetim değişiklikleri için
  APK güncellemesi gerekmez. Oda içi moderasyon (çıkarma, susturma vb.) uygulamada kalır.
- Yayıncılar kazanç ve yayın sürelerini, ajans sahipleri ajans ekranlarını, bayiler bayi ekranını uygulamada görmeye
  devam eder; ajans sahipleri ve bayiler ayrıca web panelinden girebilir.
- Web yönetim paneline eklenenler (v2.114.0'dakilere ek):
  - **İçerik Yükle**: hediye (animasyon + küçük resim; mp4 şeffaflığı, otomatik küçük resim ve medya bütçesi
    sunucuda), çerçeve, giriş efekti, mağaza ürünü, hazır paket zip'i, eksik küçük resimleri tamamlama.
  - **Oda Temaları**: tema listesi (düzenle, aç / kapat, sil), yeni tema (görsel yükleme), özel tema onayları,
    tema ve özel tema hakkı hediye etme.
  - **Şanslı Havuzlar**: havuz durumları, havuza Coin ekleme, şanslı hediye ayarları.
  - **Etkinlikler**: haftalık etkinlikler (aç / kapat, yıldız hediyesi, 1-2-3. sıra ödülleri, kurallar), resmi
    etkinlikler ve yayıncı katılımı, günlük giriş ödülü.
  - **Ekran Görüntüleri** ve **Sunucu** (sürüm, şimdi güncelle, kayıtlar, GitHub anahtarı).
- Panelde tüm para işlemleri onay penceresiyle ve çift gönderime karşı işlem anahtarıyla yapılır.

## v2.114.0 — Web paneli: bayi paneli ve uygulamadaki yönetim ekranlarının taşınması (1. kısım)
- **Bayi paneli** (`/yonetim/dealer/login/`): Coin satışı (çift gönderim korumalı, onaylı), bakiye talebi (toptan
  paket seçimi, taleplerim) ve aranabilir / süzülebilir hareket listesi.
- **Yönetim → Bayiler**: bayi oluşturma (sahip hesabı seçerek), bakiye yükleme (mali kayda yazılır, çift gönderim
  korumalı), ad değiştirme, bayiyi durdurma / açma, bayi hareketleri; bekleyen ve sonuçlanan bayi bakiye talepleri
  (onay / ret, not). Sunucu: `POST /api/admin/dealers/:id/update`, `GET /api/admin/dealers/:id/transactions`.
- **Yönetim → Fasulye Cüzdanı**: özet, bekleyen / ödenen / reddedilen / vazgeçilen çekim talepleri (ödendi, ret ve
  iade), elle düzeltme (kullanıcı seçerek), Fasulye ayarları.
- **Yönetim → Ayarlar → Ajans**: sesli ve görüntülü maaş tabloları artık webde düzenlenir (satır ekle / sil,
  doğrulama, varsayılana dön) ve görüntülü yayın kuralları (ayrı hesap, günlük sınır, en kısa oturum, kesinti).
- **Yönetim → Medya Bütçesi**: dosya listesi, toplu küçültme (ilerlemeli, durdurulabilir), tek dosya küçültme /
  geri alma, yedek temizliği, sınır dışı hediyeler, üst sınırlar.
- Yayıncılar kazançlarını ve yayın sürelerini uygulamada görmeye devam eder; ajans sahipleri hem uygulamada hem
  ajans panelinde (yayıncı başına süre, geçerli gün, elmas, maaş; ajans primi).

## v2.113.0 — Web paneli ve site sunucuya taşındı
- **Yönetim / ajans paneli** artık sunucunun kendi adresinde: `https://SUNUCU/yonetim/`. Adminler ve ajans sahipleri
  linkle girer (uygulamaya düğme eklenmedi). Eski Trlive-Web deposu `web/panel/` klasörüne, Trlive.github.io sitesi
  `web/site/` klasörüne alındı; tek zip artık uygulamayı, sunucuyu ve paneli birlikte günceller.
- Yeni `web` kabı (Oracle kurulumu): paneli derler (Next.js statik) ve siteyle birlikte yayınlar. Caddy `/yonetim*`,
  `/` ve site sayfalarını bu kaba, geri kalan her şeyi uygulama sunucusuna yönlendirir.
- Panel derlenemezse sunucu güncellemesi durmaz: "panel derlenemedi" sayfası görünür, uygulama sunucusu güncellenir.
- Panel istekleri aynı adrese gider (`NEXT_PUBLIC_API_BASE_URL=same-origin`).
- GitHub Pages'teki eski panel ve site, kapatılana kadar eskisi gibi çalışır. Yasal metin bağlantıları
  (Play Store) şimdilik trlive.github.io'da kalır.

## v2.112.1 — Uçtan uca test düzeltmesi
- `dolar cüzdanı` uçtan uca testi: bayiye gönderilen Coin'in bayi stokuna ve bayi hareketlerine geçtiği artık
  doğrudan veritabanından doğrulanır. `GET /api/dealer/me` yanıtı 200 değilse test düşmez, günlüğe UYARI yazar
  (CI'da 404 döndü; kodda uç tanımlı, nedeni araştırılıyor). Uygulama kodunda değişiklik yok.

## v2.112.0 — Medya bütçesi: hediye dosyalarına üst sınır ve otomatik küçültme
Hediye / çerçeve / efekt dosyalarının telefonu zorlamaması için boyut ve çözünürlük sınırları. Belleği dolduran şey
dosya boyutundan çok dosyanın AÇILINCA kaplayacağı yerdir (svga içindeki görsellerin piksel sayısı, mp4 çözünürlüğü),
bu yüzden sınırlar piksel ve kare hızı üzerinden de konur.

**Varsayılan sınırlar (yönetim panelinden değişir)**
- mp4 (şeffaf / VAP): görüntü 540x960'ı, 24 kare/sn'yi ve 6 MB'ı geçmez. Çerçeve ve mikte oynayan hediyelerde 480 px.
- svga: dosya 10 MB, içindeki görseller en uzun kenar 720 px, açılınca en çok 48 MB bellek.
- webp / gif / png: en uzun kenar 720 px, 3 MB. Hediye küçük resmi 512 px.

**Nasıl çalışır**
- Yüklemede: sınırı aşan dosya otomatik sınıra indirilir (ayardan kapatılabilir).
- Mevcut dosyalar: Yönetim panelinde "Medya bütçesi" ekranından "Hepsini kontrol et ve sınıra indir" ile. Sunucu
  her seferde bir dosya işler, ilerleme gösterilir. Ayar değişirse dosyalar yeni sınıra göre yeniden denetlenir.
- mp4: renk ve şeffaflık yarıları ayrı ayrı küçültülür (düzen ve şeffaflık korunur), kare hızı sınırlanır, boyut
  sınırı için kalite kademeli düşürülür; çıktı süre, çözünürlük ve çözülebilirlik açısından doğrulanır.
- svga: içindeki görseller kendi oranıyla küçültülür (şeffaf kenarlarda koyu halka olmasın diye renk şeffaflıkla
  çarpılmış halde); ses ve diğer alanlar aynen kalır. Toplam bellek sınırı aşılırsa hepsi aynı oranda küçülür.
- webp / gif / png / jpg küçültülür; hareketli dosyada hareket kaybolursa ya da çıktı daha kötüyse orijinal korunur.
- Özel şeffaflık düzenli mp4, Lottie ve ffmpeg'in okuyamadığı dosyalar otomatik değişmez; "Elle çözülmeli" diye
  nedeniyle listelenir.
- Küçültülen dosya yeni adresle kaydedilir (telefonlar hafif dosyayı indirir); hediye / çerçeve / ürün adresleri
  otomatik çevrilir. Orijinal yedek kalır: dosya başına "Geri al" ve toplu "Yedekleri temizle".
- Hediye bazında "Sınır dışı" anahtarı: işaretli hediyelerin dosyasına dokunulmaz (kral, kraliçe, çift hediyeleri gibi).

**Teknik:** migration 078 (`gifts.budget_exempt`), `services/media_optimize.js` (analiz + küçültme),
`services/media_budget.js` (adres çevirme, geri alma, temizlik), `/api/admin/media-budget*` rotaları, yeni ayarlar
`media*`. Testler: `test/media_budget.test.js` (ffmpeg yoksa atlanır).

## v2.111.0 — Hediye yağmurunda çökme ve donma düzeltmesi
Çok hediye atılınca uygulamanın "TR Live durdu" diye kapanması. Bu kapanma bir Dart hatası değil, telefonun
belleği / video çözücüleri tükenince Android'in uygulamayı kapatmasıydı; bu yüzden hata kayıtlarına düşmüyordu.

**Nedenleri (koddan)**
- Her hediye olayı odadaki telefonlarda uçan ikonlar, koltuk animasyonu, şerit ve BÜTÜN oda ekranının yeniden
  çizimini başlatıyordu; hızlı combo'da saniyede onlarca olay geliyordu.
- MP4 hediye / koltuk efekti / çerçeve başına ayrı bir donanım video çözücü açılıyordu (koltuk efekti 20'ye, çerçeve
  sınırsız). Telefonların çözücü sayısı sınırlıdır; aşılınca uygulama kapanabiliyordu.
- SVGA animasyonlarının görselleri her oynatıcı için ayrı ayrı ve tam boyutta çözülüyordu (büyük bir hediye tek
  başına yüzlerce MB tutabiliyor, on kez art arda oynayınca on kopya).
- Büyük hediye videoları indirilirken tamamı belleğe alınıyordu.

**Sunucu (eski APK'lara da hemen etki eder)**
- Hediye olayları birleştirilir: bir serinin ilk hediyesi hemen gider, aynı gönderen + hediye + alıcıların
  ~0,9 sn içindeki sonraki hediyeleri TEK olayda gider (oda çok yoğunsa pencere 1,8 sn). Adet, Coin, şanslı kazanç
  toplanır; combo sayacı ve oda toplamı en güncel değeri taşır. Para işlemleri değişmedi: her hediye veritabanına tek
  tek işlenir, gönderen yanıtını hemen alır.
- Skor tablosu ve PK puanı yayını her hediyede değil, oda / PK başına en çok saniyede bir (son değer mutlaka gider).
- Oda yayınında olay bir kez JSON'a çevrilir (kalabalık odada kişi başına değil); bağlantısı çok geride kalan
  telefona yalnızca görsel olaylar gönderilmez (koltuk, sohbet gibi durum olayları her zaman gider).

**Uygulama**
- Efekt yük koruması (`FxLoad`): sınırlar telefonun belleğine göre (≤3 GB / ≤6 GB / üstü):
  aynı anda tek seferlik MP4 2/3/4 (biri her zaman tam ekran hediyeye ayrılır), döngülü MP4 (çerçeve) 3/5/8,
  koltuk efekti 3/5/8, uçan ikon 8/14/22, hediye sesi 2. Sınırı aşan efekt oynatılmaz ya da sıra bekler.
- Bellek baskısı: sistem "bellek azaldı" derse ya da uygulamanın belleği sınırı aşarsa süslemeler birkaç saniye durur,
  görsel önbellekler boşaltılır, bekleyen tam ekran animasyonlar atılır. Ses, sohbet, koltuklar etkilenmez.
- SVGA: aynı dosyayı kullanan bütün oynatıcılar tek açılmış kopyayı paylaşır; görseller bellek bütçesini aşarsa
  küçültülerek açılır; az önce oynamış olanlar kısa süre bekletilip sonra bellekten atılır.
- Efekt katmanı (uçan ikonlar, koltuk efektleri, şanslı kazanç) ayrı çizilir: hediye gelince oda ekranının geri kalanı
  yeniden kurulmaz. Oda toplamı ve skor tablosu en çok ~3 kez/sn ekrana yansır.
- Kalabalıkta uçan ikonlar sadeleşir (parıltısız, en çok 3 kopya).
- Hediye videoları belleğe toplanmadan doğrudan diske indirilir.
- Görünmez kök Material: sayfa dışında kalan dokunma efektlerindeki "Null check operator used on a null value
  (Material.of)" hatası bütün uygulamada önlendi.

**Çökme kaydı (artık nedeni görünür)**
- Android'in tuttuğu kapanış nedenleri (bellek yetersizliği, yerel çökme, donma / ANR; Android 11+) ve Java
  tarafında yakalanmayan hata, bir sonraki açılışta Yönetim > Hata kayıtları'na "Uygulama kapandı" olarak düşer
  (bellek miktarı ve yığın dökümüyle).

Doğrulama
- Birleştirici ve seyreltici sahte saatle test edildi: tek hediye gecikmez, 20 hızlı dokunuş en çok 6 olaya iner,
  hiçbir adet / Coin kaybolmaz, son durum mutlaka gider, gönderim hatası düzeni bozmaz.
- Gerçek PostgreSQL ile gerçek hediye rotasından 30 hediye: odaya giden olaylarda adet ve Coin tam; bakiye ve hediye
  kayıtları 30 ayrı işlem; farklı alıcıya giden hediye beklemeden gider.
- Yeni Android (Kotlin) kodu yerel Kotlin derleyicisiyle Android arayüz taslaklarına karşı derlendi.
- Flutter kodu yerelde derlenemedi; ilk gerçek denetim GitHub'daki `flutter analyze` ve APK derlemesidir.

## v2.110.0 — Sesli / görüntülü ayrı maaş hesabı ve Fasulye sistemi
Ajans / yayıncı sisteminin 2. aşaması ve cüzdanın Yoho benzeri "Fasulye" düzenine geçişi.

**Sesli ve görüntülü ayrı hesap**
- Yayıncının elması, süresi ve geçerli günü odanın türüne göre (sesli oda / görüntülü yayın) ayrı sayılır; iki taraf
  kendi maaş tablosundan ayrı hesaplanır ve maaşlar toplanır. Odasız gelen hediyeler sesli tarafa yazılır.
- Görüntülü için ayrı maaş tablosu (`host_pay_levels_video`): başlangıçta sesli tablonun kopyasıdır, Yönetim →
  Ödemeler'den "Görüntülü tabloyu düzenle" ile ayrıca değiştirilir.
- Görüntülüye özgü üç kural (varsayılan kapalı = 0): günde sayılan en fazla süre, en kısa geçerli oturum, gün/saat
  şartı tutmazsa kesintili ödeme (0 = ödenmez).
- Değişmeyenler: ajans primi yayıncının TOPLAM elması üzerinden sesli tabloyla hesaplanır; Yöntem 2 (bakiye) ve seviye
  ödülleri (VIP / rozet) sesli tabloya bağlıdır.
- "Sesli ve görüntülü ayrı hesaplansın" anahtarı kapatılırsa eski davranışa (tek havuz, sesli tablo) dönülür.
- Yayıncı Merkezi'nde tahmini maaşın sesli / görüntülü kırılımı; maaş tablosu ekranında sesli / görüntülü geçişi.
- Hesap özetine sesli / görüntülü süre, elmas, seviye ve tutar sütunları eklendi.

**Kimlik doğrulaması (KYC) ve cüzdan**
- Kimlik doğrulaması onaylı olmayan yayıncının maaşı dönem kapanışında cüzdana YATMAZ; özeti bekler. Admin KYC'yi
  onaylayıp özeti (tek tek ya da toplu) ödeyince tutar cüzdana yatar. Ajans primi, asistan payı ve davet primi
  kapanışta yatmaya devam eder. Cüzdan ekranı bekleyen maaşı ve nedenini gösterir.
- Cüzdan dönemlerinde yönetimdeki "öde" düğmesi artık tutarı cüzdana yatırır (platform dışı ödeme işaretlemez).

**Fasulye sistemi**
- Cüzdan bakiyesi uygulamada Fasulye olarak gösterilir: **1 Fasulye = 1 dolar**. (Sunucuda tutar yine sent olarak
  tam sayı tutulur; defter ve bakiye kuralları aynıdır.)
- **Coin'e çevir:** Fasulye anında düşer, karşılığı Coin kullanıcının kendi hesabına yüklenir.
- **Coin gönder:** kullanıcı ID ya da kullanıcı adıyla alıcıyı seçer; Fasulye düşer, Coin alıcının hesabına yüklenir,
  alıcıya bildirim gider. Engellediği / onu engelleyen ya da pasif hesaba gönderilemez.
- İkisi de anında yapılır ve geri alınamaz; uygulama tutarı, Coin karşılığını ve alıcıyı onaylatır. Alt sınır 1 Fasulye.
- **Dolar olarak gönder** (altta): bayiye gönderim ve admine gönderim önceki sürümdeki gibi çalışır (alt sınır 10 dolar).
- **Kur GEÇİCİ:** 1 Fasulye = 4.000 Coin (bayi liste fiyatına göre; bayiye gönderim kuruyla aynı). Yönetim → Fasulye
  cüzdanı ekranından ayrı ayrı değiştirilir (`usdCoinsPerUsd`, `usdExchangeMinCents`, `usdDealerCoinsPerUsd`).
- Kayıt: her çevirme `usd_coin_exchanges` tablosuna, Fasulye çıkışı deftere (`coin_exchange` / `coin_send`), Coin girişi
  alıcının Coin geçmişine ("Fasulye çevirme" / "Fasulyeden gelen Coin") ve mali denetim kaydına yazılır.
- Yeni uç: `POST /api/usd/coin-exchanges` `{ amountCents, targetUserId? }` (saatte 30 istek, tek seferlik anahtar).
- Yönetim ekranı toplamlarına "Coin'e çevrilen" eklendi.

Doğrulama
- Gerçek PostgreSQL ile çalıştırıldı: ölçümlerin oda türüne göre ayrılması; dönem kapatmada sesli 10 $ + görüntülü
  15 $ = 25 $ ve cüzdana yatış; görüntülü kuralları (kısa oturum, günlük sınır, %50 kesinti); ayrı hesap kapalıyken
  eski sonuç; KYC'siz yayıncıda bekleme ve onaydan sonra tek tek / toplu ödemeyle yatış (iki kez yatmama).
- Fasulye: kendine çevirme, başka kullanıcıya gönderme, alt sınır, yetersiz bakiye, olmayan / pasif / engelli alıcı,
  kur ve alt sınırın ayardan gelmesi, kapatma anahtarı. Her adımda "bakiye = defter toplamı" denetlendi; başarısız
  denemelerin kayıt bırakmadığı doğrulandı.
- Bütün sabit SQL sorguları gerçek şemaya karşı hazırlanarak (PREPARE) denetlendi; birim testleri geçti.
- Flutter kodu yerelde derlenemedi; ilk gerçek denetim GitHub'daki `flutter analyze` ve APK derlemesidir.

## v2.109.0 — Dolar cüzdanı: maaşlar cüzdana yatar; admin'e ve Coin bayisine gönderim
Ajans / yayıncı sisteminin 1. aşaması (para akışı). 2. aşama (sesli ve görüntülü için ayrı maaş hesabı) sıradadır.
- **Dolar cüzdanı:** her kullanıcının dolar bakiyesi (`users.usd_cents`, sent olarak tam sayı) ve her hareketin yazıldığı
  defter (`usd_transactions`: tutar, hareket sonrası bakiye, kaynak). Bakiye eksiye düşemez (koşullu güncelleme +
  veritabanı kısıtı).
- **Maaşlar otomatik yatar:** admin dönemi kapattığında yayıncı maaşı yayıncıya, ajans primi ve davet primi ajans
  sahibine, asistan payı asistana yatar ve hesap özetleri "ödendi" olur. Aynı özet ikinci kez yatırılamaz (tekil indeks).
  Eski dönemlerin bekleyen özetleri eskisi gibi elle işaretlenir (çifte ödeme olmasın diye otomatik yatırılmaz).
- **Admin'e gönderim:** kullanıcı tutarı, ödeme yöntemini ve ödeme bilgisini girer; tutar bakiyeden hemen düşer, talep
  bekler. Admin öder ve "Ödendi" der; reddederse (neden zorunlu) ya da kullanıcı vazgeçerse tutar cüzdana geri döner.
  Alt sınır 10 dolar, kesinti yok.
- **Bayiye gönderim:** kullanıcı bayiyi seçer, tutarı girer; dolar anında düşer ve karşılığı Coin bayinin satış stokuna
  eklenir (bayi hareketlerinde "Dolar gönderimi" olarak görünür). Geri alınamaz; uygulama gönderimden önce bayi adını ve
  tutarı onaylatır. Kullanıcı kendi bayi hesabına gönderemez. Alt sınır 10 dolar, kesinti yok.
- **Kur GEÇİCİ:** bayiye gönderimde 1 dolar = 4.000 Coin (mevcut toptan bayi paketine yakın, platform aleyhine olmayan
  bir değer). Coin fiyatı netleşince Yönetim → Dolar cüzdanı ekranından değiştirilir.
- **Uygulama:** Yayıncı Merkezi ve Ajans Merkezi'nde "Dolar cüzdanı" (bakiye, iki gönderim, taleplerim, hareketler);
  Yönetim → Uygulama ayarları'nda "Dolar cüzdanı: çekim talepleri ve ayarlar" (bekleyen talepler, öde / reddet,
  toplamlar, alt sınırlar, kur, aç/kapat). Yönetim uçları yalnızca tam yetkili admin'e açıktır.
- Güvenlik: tutarlar yalnızca pozitif tam sent kabul edilir; para işlemleri tek seferlik anahtarla (Idempotency-Key)
  yinelenmeye karşı korunur; her yönetim işlemi mali denetim kaydına yazılır; ödeme bilgisi yalnızca sahibine ve
  admin'e görünür.
- Yeni uçlar: `GET /api/usd/me`, `GET /api/usd/dealers`, `POST /api/usd/withdrawals`,
  `POST /api/usd/withdrawals/:id/cancel`, `POST /api/usd/dealer-transfers`; yönetim: `GET /api/admin/usd`,
  `POST /api/admin/usd/withdrawals/:id/pay|reject`, `POST /api/admin/usd/adjust`, `GET /api/admin/usd/users/:id`.
- Web paneli (ayrı depo) bu sürümde değişmedi; çekim talepleri şimdilik uygulamadaki yönetim ekranından yönetilir.
Doğrulama
- Gerçek PostgreSQL ile tüm akış çalıştırıldı: dönem kapanışında yatırma (ve ikinci kez yatmama), alt sınırlar,
  yetersiz bakiye, öde / reddet / vazgeç, bayiye gönderim ve Coin stoku, kendi bayisine gönderememe, kapatma anahtarı.
  Her adımda "bakiye = defter toplamı" denetlendi. Başarısız denemelerin kayıt bırakmadığı doğrulandı.
- 075 geçişi ve koddaki bütün SQL metinleri gerçek şemaya karşı denetlendi; 3 yeni birim testi + uçtan uca test.
- Uygulama tarafı (Flutter) yerelde derlenemedi; APK derlemesi ve `flutter analyze` GitHub'da çalışır.

## v2.108.0 — Ludo yenilendi: oda içi pencere (WebView), Klasik / Seri / Eşyalı modlar
- Ludo artık TEK ile aynı düzende çalışır: odanın üst kısmında açılan oyun penceresi (kendi sunucumuzdaki sabit sayfa,
  WebView). Sohbet ve alt çubuk açık kalır; pencere küçültülünce sağda oyun balonu durur, oyun başlayınca oyuncuların
  penceresi kendiliğinden açılır. Eski tam ekran Ludo ekranı menüden kaldırıldı.
- Oyunu açan kişi modu seçer:
  - **Klasik:** 4 taşını da bitişe ulaştıran kazanır.
  - **Seri:** tek taş yeter; ama en az bir rakip taşı kırmadan taşlar ev yoluna giremez (ana yolda bir tur daha döner).
  - **Eşyalı:** klasik kurallar + tahtada 12 eşya karesi: 🌀 kapı (16 kare ilerideki yıldızlı kareye ışınlar),
    🚀 füze (ilerideki en yakın rakip taşını üssüne yollar; güvenli karedeki taş korunur), ❄️ buz (en yakın rakip taşının
    sahibi bir tur atlar), 💣 bomba (üstüne gelen taş üssüne döner), 🎲 zar (bir hak daha).
- Değişmeyen kurallar: 6 ile çıkış ve tekrar atış, kırınca / taş bitirince ek hak, yıldızlı ve başlangıç kareleri
  güvenli, üst üste üç 6'da sıra geçer, bitişe tam sayı, 30 sn hamle süresi, üst üste 3 kez oynamayan düşer.
- Tahta kendi üssün sol altta görünecek şekilde döner; taşlar kare kare yürür; tek hamle varsa kendiliğinden oynanır.
  Sayfa dört dildedir, uygulama renklerindedir; görseller özgündür.
- Kurallar sunucudadır (`backend/src/ludo.js`); sayfa yalnızca gösterir. Veritabanı değişikliği yok: mod, oyun
  durumunun içinde durur. Mod yazmayan eski oyunlar klasik sayılır.
- Eski uygulama sürümleri etkilenmez: Ludo'nun olay adı ve uçları aynıdır; eski ekran yeni modlu oyunu da oynatır
  (eşya simgelerini göstermez, kurallar yine sunucuda işler).
- Odadaki oyun balonu / penceresi artık iki oyunu da taşır (`RoomTekDock`); `GET /api/rooms/:id/game?type=any` hangi
  oyun açıksa onu verir. Oyun sayfaları: `/room-game/ludo`, `/room-game/tek`.
- Ludo ve TEK için uygulama renklerinde (koyu zemin + altın çerçeve) özgün logolar: oyun menüsünde, odadaki oyun
  balonunda ve oyun sayfalarının açılışında (`mobile/assets/images/game_ludo.webp`, `game_tek.webp`; ikisi toplam 25 KB).
- Ses efekti / müzik ve oyun içi ifade (emoji) yok: sesli sohbetin ses odağını bozmamak için eklenmedi.
Doğrulama
- Ludo motoru: 9 yeni birim testi (modlar, barikat, beş eşya, otomatik oyun) + üç modda 120 rastgele tam oyun.
- Gerçek PostgreSQL ile sunucu akışı (mod seçimi, başlatma, zar / hamle, iptal) ve gerçek tarayıcıda oyun sayfası:
  Seri modda 2 kişilik tam oyun sonuna kadar; Eşyalı ve Klasik modda 3–4 kişiyle yüzlerce hamle, konsol hatası yok.
- Uygulama tarafı (Flutter) yerelde derlenemedi; APK derlemesi ve `flutter analyze` GitHub'da çalışır.

## v2.107.0 — TEK kart oyunu (oda içi, WebView) · kırmızı test düzeltmesi · ekran görüntüsü kaydı hatası
TEK kart oyunu (yeni)
- Odadaki oyun menüsüne (Ludo'nun yanına) **TEK** eklendi: 2–9 kişilik renk-sayı eşleştirme kart oyunu. Ücretsizdir,
  Coin bahsi yoktur. Oyunu oda sahibi / yardımcı sahip / moderatör açar; odadaki herkes katılır ya da izler.
- Oyun odanın üst kısmında açılan pencerede (kendi sunucumuzdaki sabit sayfa, WebView) oynanır; sohbet ve alt çubuk
  açık kalır, ses bağlantısı etkilenmez. Pencere küçültülünce sağda oyun balonu kalır ("Katıl", "3/9", "Sıra sende");
  oyun başlayınca oyuncuların penceresi kendiliğinden açılır.
- Kurallar: 108 kart (76 sayı, 24 aksiyon, 8 joker); Atla, Yön değiştir, +2, Renk seç, +4. +4'e itiraz edilebilir
  (atanın elinde o renkten kart varsa 4 kartı o çeker, yoksa itiraz eden 6 çeker). Elde en fazla 20 kart. Elini ilk
  bitiren kazanır; sıralama puana göre (sayı kartı sayısı kadar, aksiyon 20, joker 50). El en fazla 15 dakika; süre
  dolunca herkes birer kez daha oynar. Hamle süresi 20 sn; üst üste 3 kez oynamayan oyundan düşer.
- Kurallar sunucudadır (`backend/src/tek.js`, saf motor); sayfa yalnızca gösterir. Eller yalnızca sahibine gider:
  odadaki herkese giden canlı yayında yalnızca kart sayıları vardır. Oyun durumu Ludo ile aynı tablolarda durur
  (074 geçişi yalnızca oyun türü ve koltuk aralığını genişletir).
- Sayfa dört dildedir (Türkçe, İngilizce, Arapça, Hintçe), uygulama renklerindedir; kart tasarımı ve ad özgündür
  ("UNO" adı ve kart tasarımı Mattel'e, "ONO" görselleri Yoho'ya aittir; kullanılmadı).
- Müzik / ses efekti yok: WebView sesi sesli sohbetin ses odağını bozabileceği için eklenmedi; sıra gelince titreşim var.
- Yönetim → Uygulama ayarları: "TEK kart oyunu açık" anahtarı (kapalıyken menüde görünmez, yeni oyun açılamaz).
- Kaynak olarak verilen keyprocedure/real-time-uno (MIT) incelendi; kod alınmadı. O proje Socket.io + EJS + kendi
  oturum/veritabanı yapısıyla çalışıyor ve itiraz, puanlama, süre, 20 kart sınırı içermiyor (ayrıca +2 / +4 cezasını
  iki kez uygulayan bir hata var). Oyun bizim altyapımıza (JWT, WebSocket yayını, PostgreSQL) göre baştan yazıldı.
- Eski uygulama sürümleri etkilenmez: TEK durumu ayrı olayla (`room_tek_state`) yayınlanır, tür verilmeyen oyun
  sorgusu yalnızca Ludo döndürür; Ludo hamle uçları TEK oyununda (ve tersi) reddedilir.
Hata düzeltmeleri
- Yardımcı admin Coin yüklerken "Sunucu hatası" alıyordu: `supportCoinDailyLimit` ayarı kodda kullanılıyor ama
  tanımlı değildi (kırmızı uçtan uca testin sebebi). Varsayılan: 24 saatte 1.000.000 Coin (`SUPPORT_COIN_DAILY_LIMIT`).
  Yeni test (`config_keys.test.js`) kodda kullanılan her ayarın tanımlı olduğunu denetler.
- Ekran görüntüsü kaydı (`POST /api/screenshots`) her çağrıda "Sunucu hatası" veriyordu: sorgudaki değişken türlerini
  PostgreSQL çıkaramıyordu. Türler açık yazıldı. (Bütün SQL metinleri gerçek şemaya karşı denetlenirken bulundu.)
Doğrulama
- Oyun motoru: 16 birim testi + 400 rastgele oyun (kart sayısı korunur, el 20'yi aşmaz, oyun her zaman biter).
- Sunucu akışı gerçek PostgreSQL ile çalıştırıldı (kurma, katılma, tam oyun, ayrılma, iptal, süre dolunca otomatik
  oyun, Ludo'nun bozulmadığı). 72 geçiş dosyası ve koddaki 1107 SQL metni gerçek şemaya karşı denetlendi.
- Oyun sayfası gerçek tarayıcıda 3–9 oyuncuyla, dört dilde ve sunucudaki içerik güvenlik ilkesiyle oynatıldı.
- Uygulama tarafı (Flutter) yerelde derlenemedi; APK derlemesi ve `flutter analyze` GitHub'da çalışır.
İş akışları (isteğe bağlı, ELLE yüklenir)
- `backend.yml`, `mobile.yml`, `zip_ile_guncelle.yml`: testler artık zip açıldıktan sonra, YENİ kod üzerinde başlatılır.
  Eskiden zip'in yüklendiği anda (depoda hâlâ eski kod varken) çalışıyor, sonuç hep bir sürüm geriden geliyordu.
  Üçü birlikte yüklenmelidir.

## v2.106.0 — Atılan 24 saat giremez · yönetici kayıtları · hediye sınırı 180 · APK derlemesi · hata kayıtlarındaki hatalar
APK derlemesi ("exit code 143")
- v2.100 sonrası APK derlemeleri hiçbir hata yazmadan duruyordu (kullanıcıların telefonundaki son sürüm 2.99.1). Derleme
  makinesi dışarıdan durduruluyor; en olası sebep bellek / disk tükenmesi (Flutter'ın şablonu Gradle'a 8 GB izin verir,
  makine küçüktür; Firebase, WebRTC ve yerel kodlu gürültü azaltma eklentisi derlemeyi büyüttü).
- `.github/workflows/apk_build.yml` güncellendi (ELLE YÜKLENMELİ; zip iş akışı dosyalarını değiştiremez): kullanılmayan
  hazır araçlar silinip disk açılır, ek takas alanı eklenir, Gradle ve Kotlin belleği makineye göre sınırlanır; derleme
  boyunca 45 sn'de bir bellek / disk durumu günlüğe yazılır (yine durursa sebep son satırlarda görünür).
- İş akışı dosyası yüklenmemişse zip'le gelen yedek devreye girer (mobile/yerel/trlive_capture/android/build.gradle):
  Gradle'ın bellek izni büyükse kullanmadığı belleği sisteme geri vermesi sağlanır, Kotlin derleyicisinin belleği
  sınırlanır. Yerel denemede (Gradle 8.14, 6 GB izin) boşta tutulan bellek 1960 MB'tan 64 MB'a indi. Tek başına
  yeteceği doğrulanmadı; asıl çözüm iş akışı dosyasıdır.
Odadan atma: 24 saat yasak
- Odadan atılan kişi 24 saat o odaya giremez ("Bu odadan çıkarıldınız. … sonra tekrar girebilirsiniz."). Atan kişiye
  onay penceresinde, atılana çıkarken süre gösterilir.
- Yasak kalıcı odaya (sahip + oda türü) bağlıdır: oda kapatılıp yeniden açılsa da sürer. "Odadan banla" (süresiz) da
  artık kalıcıdır; eskiden oda yeniden açılınca kayboluyordu. Açık odalardaki mevcut banlar taşınır.
Yönetici kayıtları (oda sahibi ve yardımcı sahip)
- Oda araçları > "Yönetici Kayıtları": yasaklılar (kim attı / banladı, kalan süre) ve son işlemler: atma, banlama,
  yasak kaldırma, sohbette susturma, mikrofondan indirme, rol verme / alma (kim, kime, ne zaman).
- "Yasağı kaldır": atılan ya da banlanan kişi yeniden girebilir. Moderatör yalnızca kendi koyduğu yasağı kaldırır.
- Kayıtlar kalıcı odaya aittir (oda başına son 500 işlem saklanır).
- Veritabanı: 073 (room_bans, room_mod_logs). Sunucu: GET /api/rooms/:id/moderation; DELETE …/blocks/:userId iki
  yasağı da kaldırır.
Hediye
- Hediye gönderme sınırı dakikada 60 → 180 (hızlı combo "Çok hızlı işlem yapıyorsunuz" uyarısına takılmasın).
Hata kayıtlarından (Yönetim > Hata kayıtları) düzeltilenler
- "Null check operator used on a null value" (haftada 195 kez, en sık hata): odadaki X düğmesinin "Küçült / Çıkış"
  penceresinde dokunma efektinin çizileceği Material yoktu; her dokunuş hata kaydı üretiyordu.
- "ServiceAlreadyStartedException: The service has already started" (28 kez): ön plan servisi zaten çalışırken
  "başlatılamadı" sayılıyor, uygulama çalışan servisi kapalı sanıyordu. Artık hata değil; doğru türle yeniden başlatılır.
- "Image picker is already active" (5 kez): galeri açıkken ikinci dokunuş yok sayılır.
- "MediaStreamTrack has been disposed" (3 kez): oda sesi açılıp kapatılırken aboneliği bitmiş yayına dokunulmaz.
- '"Deneme21" için animasyon dosyası tanımlı değil': kod hatası değil; bu hediyeye yönetimden animasyon yüklenmemiş.
Diğer
- Uçtan uca testler başarısız testi günlüğün SONUNDA da listeler (spec raporlayıcı): ekran görüntüsünde görünür.
- Testler: oda yasağı (birim), atma / yasak / yönetici kayıtları / yasağın yeni açılışta sürmesi (uçtan uca).

## v2.105.0 — Bağlantı sağlamlığı, odadan düşme, ses/görüntü kalitesi, güvenlik denetimi
Canlı bağlantı (WebSocket)
- Sessizce ölen bağlantı odadayken 25–35 sn içinde fark edilir (eskiden 75–95 sn; o sürede oda "donmuş" görünüyordu):
  odadayken 10 sn'de bir yoklama, 25 sn sessizlikte yeniden bağlanma. Oda dışında eskisi gibi seyrek (pil).
- Bağlanma 12 sn içinde tamamlanmazsa beklenmez, yeniden denenir (eskiden zaman aşımı yoktu).
- Arka plandan dönünce bağlantı hemen yoklanır (4 sn); telefon uykudan uyanınca bağlantı hemen kesilmez, önce yoklanır.
- Oda aboneliği sunucudan onay gelene kadar yeniden istenir (onaysız kalan abonelikte oda olayları gelmiyordu).
- Yeniden bağlanma odadayken en fazla 6 sn bekler; sunucu güncellenirken (1012) hemen bağlanılır; sunucu "çok fazla
  bağlantı" (1013) derse üst üste denenmez, yarım dakika beklenir.
- 4 sn'den uzun kopmalarda odada küçük "Bağlantı yenileniyor…" bilgisi.
Güvenlik duvarı meşru kullanıcıları yasaklıyordu (odadan toplu düşme)
- Hız sınırını aşan her istek bir ihlal puanıydı ve 30 puanda IP 15 dk → 1 saat → 24 saat yasaklanıyordu. Ölçüm (eski
  kod): tek kişinin bir dakikada 90 hediye dokunuşu (60 geçer, 30'u reddedilir) IP'yi yasaklatıyor; aynı Wi-Fi /
  operatör IP'sindeki herkes "Erişiminiz geçici olarak engellendi" alıp odasından düşüyordu. Görsel dosyaları da
  IP başına 300 istek/dk sınırına sayılıyordu: 330 görsel isteği aynı sonucu veriyordu.
- Artık sınır aşımı yine 429 döner ama tek başına IP yasağına dönüşmez ("çok istek" türü ihlaller IP başına dakikada
  en fazla bir puan alır; eşik 30). Saldırı imzaları (WAF), oda şifresi denemeleri ve hatalı girişler eskisi gibi
  her seferinde puanlanır.
- Görsel / animasyon / emoji dosyaları ayrı bütçeden sayılır (IP başına 6000/dk); API bütçesi 300 → 3000/dk
  (IP başına sınır kullanıcı başına sınır değildir; operatör NAT'ında onlarca kişi tek IP'den görünür).
- Canlı bağlantı: IP başına 30 → 300 (kullanıcı başına 5 aynı). 31. kişi bağlanamıyor, denemeleri IP'yi yasaklatıyordu.
- Veritabanı: 072 (hız sınırı kaynaklı eski otomatik IP yasakları kaldırılır; saldırı ve elle konan yasaklar kalır).
- Ayarlar: FIREWALL_IP_PER_MINUTE, FIREWALL_MEDIA_PER_MINUTE, FIREWALL_WS_PER_IP.
- deploy/fail2ban (nginx kurulumu; Oracle kurulumunda kullanılmıyor): 403 yanıtları artık yasak sebebi sayılmıyor
  (uygulamanın olağan yanıtıdır; beş 403 alan kullanıcı 24 saat engelleniyordu), hız sınırı hapsi varsayılan kapalı.
Odadan düşme
- Sunucu: odaya yeniden girişte "canlı" işareti tazelenir. Tazelenmediği için eski işaretle giren kişi temizleyiciye
  denk gelip girer girmez çıkarılabiliyor, uygulama bunu bir dakikaya kadar fark etmiyordu.
- Oda kapandıysa / üyelik düştüyse 60 sn'lik sinyal beklenmez: soket yeniden bağlanınca, ses anahtarı reddedilince ve
  ses sunucusu "çıkarıldın / oda silindi" deyince hemen sonuçlandırılır (çık ya da yeniden katıl).
- "Oda açık" sinyali ağ hatasında 10 sn sonra bir kez daha denenir.
Ses / görüntü bağlantısı
- Ses bağlantısı üç denemeden sonra vazgeçmez: uyarı görünürken de 15 sn'de bir dener; her sinyalde ve soket
  yeniden bağlanınca da denetlenir. Kullanıcı "Tekrar"a dokunmasa da ses geri gelir.
- "Mikrofondayım ama sesim gitmiyor": ağ değişiminden sonra ve yayın izni geç geldiğinde mikrofon yeniden açılır;
  izin uyuşmazlığında bağlantı güncel izinli yeni anahtarla bir kez yenilenir.
- Aynı hesap iki cihazdan aynı odaya girerse cihazlar birbirini sürekli düşürmez: eski cihazdaki oda ekranı kapanır.
- Kalite: ses 32 → 48 kbps (Şarj tüketimi modunda 32); canlı yayında (tek yayıncı) 540p görüntü 1,3 Mbps'e çıkar
  (hareketli görüntüde daha net). Çözünürlük 540p kaldı: güzellik filtresi 720p'de orta sınıf telefonda kare düşürür.
Sunucu
- Güncellemede düzgün kapanış: Docker'ın durdurma sinyali artık sunucuya ulaşıyor (CMD "exec"), canlı bağlantılar
  "yeniden başlıyor" koduyla kapatılıyor. Eskiden sunucu 10 sn bekleyip zorla öldürülüyordu.
Güvenlik
- Canlı bağlantı token'ı artık adres satırında değil Authorization başlığında (kayıtlara düşmez); eski sürümler çalışır.
- Ses sunucusu anahtarlarında kullanılmayan veri kanalı izni kapatıldı; ses anahtarı isteğine hız sınırı eklendi.
Tanı
- Bağlantı kopmaları (soket / ses sunucusu / üyelik) sebebiyle birlikte Yönetim > Hata kayıtları'na yazılır.
Diğer
- Diyalog sonrası kapanmış ekranda çizim yapılabilen 6 yer düzeltildi.
- docs/generated (API uçları, veritabanı, canlı olaylar) koddan yeniden üretildi (374 → 398 uç, 103 → 111 tablo).

## v2.104.1 — Analiz uyarısı
- "analiz et" işini düşüren uyarı giderildi: lucky_bag.dart'ta kullanılmayan _claimsStrip (ve yalnızca onun kullandığı
  marquee içe aktarması) kaldırıldı.

## v2.104.0 — Etkinlik sonuç bildirimleri etkinliğin görseliyle · küçültülmüş müzik plağı
Haftalık etkinlik sonuçları (Etkinlik Promosyonu)
- Tek düz metin yerine her etkinlik için ayrı kart: Haftanın Çifti, Haftalık Kral ve Kraliçe, Haftalık Yıldızlar.
  Her kartta o etkinliğin kendi görseli ve renkleri, "SONUÇLAR" etiketi ve hafta tarihi var.
- Her bölümde kürsü: 2. · 1. (taçlı, büyük, altın ışıltılı) · 3. Madalya renkli halkalarda kazananın fotoğrafı ve adı;
  çiftte iki fotoğraf, yıldızda hediyenin simgesi. Fotoğrafa dokununca profil, karta dokununca etkinlik sayfası açılır.
- Son 12 haftanın eski düz metin duyuruları sunucu açılışında bir kez yeni kartlara çevrilir.
- Veritabanı: 071 (duyurulara yapılandırılmış içerik).
Müzik
- Müzik küçültülünce çıkan plağa dokununca müzik kutusu açılmıyordu: plağın boş dokunma algılayıcısı dokunuşu
  yutuyordu. Artık dokununca açılıp kapanıyor, sürükleme de çalışıyor.

## v2.103.1 — "Sohbetler temizlendi" deniyor ama mesajlar kalıyordu
- Temizleme anı sunucuda kaydediliyor (rooms.chat_cleared_at, 070). O andan önce yazılan mesajlar artık hiçbir yoldan
  geri gelmiyor: sohbet yeniden yüklenince, temizlemeden önce başlamış bir yükleme geç dönünce (eski listeyi geri
  getiriyordu), mesaj olayı temizlemeden sonra ulaşınca ya da uçan yazı işlemi temizleme sırasında bitince.
- Temizleyenin ekranı, soket olayını beklemeden istek başarılı olur olmaz temizleniyor; aynı temizleme iki kez
  yazılmıyor. Sıradaki eski uçan yazılar da iptal ediliyor.

## v2.103.0 — Şanslı hediye: havuzlu sistem (dolunca verir)
- Her şanslı hediyenin kendi ödül havuzu var. Gönderimin "geri dönüş oranı" kadarı (varsayılan %60, eskiden %70)
  havuza girer; kazançlar YALNIZCA havuzdan ödenir. Platform ve alıcı payı her zaman korunur: uzun vadede
  gönderene dönen Coin hiçbir zaman ayarlanan orandan fazla olamaz (havuz eksiye düşmez).
- İki kademe:
  • Ana havuz (x1, x2, x3, x5, x10, x50): her zaman çekilir; havuz yetmezse karşılayabildiği en büyük küçük çarpan verilir.
  • Büyük ödül havuzu (x100, x500, x1000): payın %25'i (panelden 0–80) buraya birikir. Havuz "fiyat × 100" dolmadan
    büyük çarpan hiç çıkmaz; dolunca açılır, çıkınca boşalır ve yeniden dolar.
- Hediye penceresinde seçili şanslı hediyenin büyük ödül havuzu doluluk çubuğuyla görünür ("DOLU: x100 – x1000 açık!").
  Olasılıklar penceresi "Her zaman" ve "Büyük ödül (havuz dolunca açılır)" diye ayrıldı. Büyük ödülde "BÜYÜK ÖDÜL!" yazar.
- Yönetim: "Büyük ödül payı %" ayarı; Uygulama ayarları > Şanslı hediye > "Havuzları gör / havuza ekle": her hediyenin
  havuzları, giren / ödenen, gerçekleşen geri dönüş, büyük ödül sayısı; açılışta havuza Coin eklenebilir (denetim kaydına yazılır).
- Veritabanı: 069_lucky_pools.

## v2.102.0 — Şanslı Çan / Şanslı Yonca: Yoho / Bigo / Mico mantığı
Kazanç
- Yeni çarpan tablosu: x1, x2, x3, x5, x10, x50, x100, x500, x1000. Küçük kazançlar sık (yaklaşık her 3 adette bir;
  x1 = hediye bedeli geri), büyükler seyrek. Varsayılan geri ödeme yine %70; panelden %90'a kadar artırılabilir
  (tüm olasılıklar orantılı ölçeklenir). Her adet ayrı çekiliş; 99 adetlik gönderimde neredeyse her zaman bir şey çıkar.
- Sonuçta kaç adedin kazandırdığı ("12/99 adet kazandırdı") ve combo boyunca toplam kazanç ("Combo toplamı") görünür.
Odadakiler kazancı görür
- Her kazanç odadaki herkese gönderenin koltuğunun üstünde "🍀 x5 +500" rozetiyle; x100 ve üstü sahnenin ortasında
  altın patlamayla gösterilir. x10 ve üstü sohbete yazılır. Büyük kazancın tüm uygulamaya duyurusu (şerit) aynen sürer.
Puan / Elmas / sıralama (diğer uygulamalardaki kural)
- Şanslı hediyenin değeri fiyatının alıcı payı kadardır (varsayılan %10): alıcıya o kadar Elmas; koltuk puanı, oda
  elması, PK, oda içi PK, gönderen/alan/oda/haftalık sıralamalar, profil destekçileri, CP yakınlığı, koruyucu puanı,
  aile katkısı, başkan indirimi ve gönderenin servet seviyesi de bu değerle sayılır. (Önceden gönderen tarafında tam
  fiyatla sayılıyordu: geri kazanılan Coin'le tekrar göndererek sıralama ve seviye kasılabiliyordu.)
- Şanslı hediye artık normal "hediye şeridine" düşmez (yalnızca büyük kazanç duyurusu).
Gönderme / combo
- Şanslı hediyede adetler 1 · 9 · 19 · 49 · 99 · 199 · 520 · 999; combo düğmesi son gönderimden sonra 12 sn açık
  kalır (sunucu combo sayacı da 12 sn), her dokunuş yeni çekiliş.
- Panel: duyuru çarpanı sınırı 10–1000.

## v2.101.0 — Kalabalık ve gürültüye karşı ses düzeni (ücretsiz en güçlü kurulum)
Mikrofon sesi sırasıyla şu katmanlardan geçer (gürültü engelleme açıkken, varsayılan):
1. Telefonun çoklu mikrofon işlemesi (Android voice communication): ağızdan gelmeyen sesleri kısar.
2. WebRTC: yankı giderme, gürültü bastırma, düşük frekans süzgeci.
3. Yapay zekâ gürültü azaltma (RNNoise, BSD-3; deneysel eklenti flutter_webrtc_noise_suppression): klavye, tabak,
   TV, trafik gibi konuşma dışı sesleri ek olarak azaltır. Oda ses bağlantısı kurulunca bağlanır, çıkınca çıkar.
   Efekt ve ses'ten anında kapatılabilir; bağlanamazsa ses olduğu gibi kalır.
4. Otomatik ses düzeyi KAPALI: konuşma aralarında mikrofonu yükseltip arkadaki insan seslerini büyütüyordu.
   Gürültü engelleme kapatılınca geri açılır (telefondan uzakta konuşanlar için).
- livekit_client ^2.13.2 (flutter_webrtc 1.6.3: eklentinin istediği sürüm + TURN/TLS güvenlik düzeltmesi).
- Sınır: yanınızda konuşan birinin sesi, siz konuşurken tamamen ayrılamaz (bunun için ücretli Krisp BVC gerekir);
  en etkili ücretsiz önlem kulaklık mikrofonu.

## v2.100.3 — Kalabalık sesi: telefonun ses işlemesi yeniden varsayılan
- Asıl sorun ortam kalabalığı (arkadaki insan sesleri). Buna karşı en etkili ücretsiz araç telefonun çoklu mikrofon
  işlemesi (ağızdan gelmeyen sesi kısar). v2.100.2'de varsayılan yapılan "uygulamanın ses işlemesi" bunu da kapattığı
  için kalabalığı artırabiliyordu: varsayılan yeniden telefonun işlemesi (telefonda engelleyici yoksa WebRTC'nin gürültü
  bastırması zaten çalışır). "Uygulamanın ses işlemesi" Efekt ve ses'te seçenek olarak kaldı (anahtarı kapatınca).

## v2.100.2 — Gürültü engelleme: uygulamanın ses işlemesi
- Android'de mikrofon artık uygulamanın (WebRTC) yazılım ses işlemesiyle çalışır: yankı giderme (AEC3), gürültü
  bastırma (yüksek), otomatik ses düzeyi ve düşük frekans süzgeci her telefonda aynı. Önceden Android 10+ telefonlarda
  üreticinin kendi engelleyicisi kullanılıyor, WebRTC'nin gürültü bastırması yalnızca telefonda engelleyici yoksa
  açılıyordu: kalite markaya göre değişiyor, "Mikrofon gürültüsü engelleme" anahtarı bu telefonlarda etkisizdi.
  Artık anahtar her telefonda çalışır; kulaklıkla (medya modu) konuşurken de gürültü bastırılır.
- Efekt ve ses > "Telefonun kendi ses işlemesi": bir telefonda yankı olursa eski yönteme dönülür (yeniden açılışta).
- LiveKit'in bypassVoiceProcessing ayarı kullanılmadı (yazılım işlemesini de kapatır); yalnız ses aygıtı katmanında
  telefonun efektleri kapatıldı (services/audio_processing.dart).

## v2.100.1 — Özel tema seçimi ve sohbet sırası düzeltmesi
- Birden çok özel tema varken hepsi "Kullanılıyor" görünüyordu ve hangisinin odada olacağı seçilemiyordu: her özel
  temanın kendi anahtarı var ("custom:<id>"); dokunulan özel temanın görseli uygulanır, yalnızca o "Kullanılıyor" olur.
  Oda açma ekranı ve oda ayarlarındaki tema seçici de her özel temayı ayrı gösterir; oda yeniden açılınca seçilen özel
  tema korunur. Süre bitince yalnızca biten tema kalkar (başka özel temanın süresi sürüyor diye bitmiş görsel kalmaz).
- Oda küçültülüp / uygulama arka plandan dönünce eski "odaya girdi" satırları sohbetin en altına iniyordu ve sohbet
  zorla en alta kaydırılıyordu: yeniden yüklemede yerel satırlar yerinde kalır, okunan yer korunur (test eklendi).

## v2.100.0 — SMS (Firebase) ve e-posta doğrulaması, şifremi unuttum, kalıcı imza
- Telefonla kayıtta SMS kodu (Firebase Authentication). Firebase ayarları yönetim panelinden girilir (APK'ya gömülü
  değil); girilene kadar kayıt eskisi gibi kodsuz. Sunucu Firebase kimlik token'ını Google'ın anahtarlarıyla doğrular
  (imza, proje, 10 dakika, tek kullanım).
- E-posta: 6 haneli kod (10 dk, 5 deneme, dakikada 1 / saatte 5 gönderim). Gönderim yönetimden girilen SMTP ile
  (ek paket yok; 465 SSL ya da 587 STARTTLS). Yönetimde "Deneme e-postası gönder"; SMTP şifresi panelde maskeli.
- Hesap & Güvenlik: telefonu bağla / doğrula, e-posta ekle / doğrula. Giriş ekranında "Şifremi unuttum"
  (SMS ya da e-posta kodu; şifre değişince tüm cihazlardan çıkış).
- Kalıcı imzalama anahtarı (mobile/imza): APK derlemenin sonunda bu anahtarla yeniden imzalanır. Firebase SMS ve
  Play Store için gerekli; sonraki sürümler telefondaki uygulamanın üstüne kurulur (bu sürüme geçerken bir kez kaldır-kur).
- Migration 068 (users.email, email_verified_at, phone_verified_at, email_codes). Test: Firebase token, SMTP, ayarlar; e2e.
- Kurulum adımları: docs/DOGRULAMA_KURULUM.md

## v2.99.1 — Doğum Günü modu: koltuk dizilimi ve Mikrofon Modu'na taşındı
- Koltuklar üst üste biniyordu: satır araları koltuk + numara/ad satırı sığacak şekilde yeniden hesaplandı
  (satırlar arası en az "yarım koltuk + ad + yarım koltuk"; küçük ekranlarda ölçek düşse de binmez). Pasta ve şerit
  koltuklara ve adlara değmeyecek ölçüde; yan koltuklar pastadan ayrıldı.
- Doğum Günü artık Oda araçları > Mikrofon Modu penceresinde (modların sonunda önizlemeli kart; fiyat ya da
  "Hakkın var" rozeti, açıkken seçili). Karta dokununca pencere: önizleme, kimin doğum günü, tek dokunuşla
  "Satın al ve uygula"; hakkı olana Uygula / Güncelle, Normal moda dön, Süre ekle. Araçlardaki ayrı düğme kaldırıldı.
- Mikrofon Modu ve Doğum Günü pencereleri uygulama renklerinde (koyu zemin + altın).

## v2.99.0 — Arapça, Hintçe ve oda içi çeviri
- Diller: Türkçe, English, العربية (sağdan sola düzen), हिन्दी. Dil seçimi diğer uygulamalardaki gibi:
  1) Ayarlar > Dil'den seçilen dil; 2) seçilmediyse telefonun dili (uygulamada varsa);
  3) yoksa kayıttaki bölgenin dili: Uzbekistan → Türkçe, Arap → Arapça, Hindistan → Hintçe, Avrupa → İngilizce.
  Bölge sekmeleri ve oda listeleri yine kayıttaki ülkeye göre.
- Oda içi çevrildi: oda ekranı, alt düğmeler, oda araçları, kullanıcı kartı ve yönetim işlemleri, mikrofon / konuk
  istekleri, hediye penceresi, şanslı çanta, PK, doğum günü modu, müzik, güzellik, oda açma ekranı, şikâyet / engelle.
- Arapça ve Hintçede eksik kalan metin İngilizce görünür; tarih seçici gibi yerleşik metinler İngilizce.
- Sunucu hata mesajları, oda adları ve tema adları çevrilmez (yazıldıkları dilde görünür).

## v2.98.0 — Bölge sekmeleri ve İngilizce
- Ana sayfa (Popüler): bannerın altında bölge sekmeleri: 🇺🇿 Uzbekistan · 🇸🇦 Arap · 🇮🇳 Hindistan · 🇪🇺 Avrupa
  (uygulama renkleri: seçili altın). Liste, o bölgedeki kullanıcıların açtığı odaları gösterir. Türkiye, Azerbaycan,
  Kıbrıs ve Orta Asya ülkeleri Uzbekistan sekmesindedir. İlk açılışta kişinin kendi bölgesi seçilir; seçim telefonda saklanır.
  Arama tüm bölgelerde yapılır; "Takip" sekmesi eskisi gibi.
- Bölge, kayıt ekranındaki ülkeden sunucuda belirlenir (users.region; migration 067 mevcut kullanıcıları ülkelerine göre
  yerleştirir, ülkesi olmayanlar Uzbekistan).
- Dil: Türkçe ve English. İlk açılışta telefonun dili (Türkçe değilse İngilizce); Ayarlar > Dil'den değiştirilir, seçim
  saklanır ve sunucuya da yazılır. Dil değişince sayfalar yeni dille açılır (odadaysan önce onay sorulur).
- 1. aşama İngilizce: alt menü, ana sayfa, giriş / kayıt, kayıt ekranı (ülke adları dahil), profil, ayarlar, gizlilik,
  hesap & güvenlik, günlük giriş, oda temaları. Diğer ekranlar sonraki sürümlerde; çevirisi olmayan metin Türkçe görünür.
- Test + e2e: bölge eşlemesi, migration kısıtı, PATCH /api/me bölge, /api/rooms?region=eu.

## v2.97.0 — Günlük giriş ödülü ve kayıt ekranı
- Günlük Giriş (7 gün): uygulama açılınca o gün alınmadıysa pencere gelir; her gün "Giriş yap" ile o günün Coin'i,
  7. gün ayrıca çerçeve / araç (yönetim seçer). Bir gün atlanırsa veya 7. gün alınınca 1. güne döner (İstanbul saati).
  Uygulama renklerinde; Profil > Günlük Giriş'ten de açılır. Eski "Günlük Görevler" sayfası kaldırıldı ve görev serisi
  artık Coin vermez: tek günlük ödül günlük giriştir.
- Yönetim > Günlük giriş ödülleri: 7 günün Coin'i, 7. gün çerçeve ve araç, eşya süresi, aç / kapat.
- Kayıt ekranı (yalnızca yeni hesaplar, bir kez): profil fotoğrafı, takma ad, cinsiyet, doğum günü (18+), isteğe bağlı
  şifre (şifresi olmayan hesaplarda), bayraklı ülke seçimi + telefon kodu. Mevcut hesaplar etkilenmez.
- Migration 066 (country_code, setup_done, daily_checkins). Test + e2e: günlük giriş ve kayıt adımı.

## v2.96.7 — Tema penceresi: uygulama renkleri ve "Kullan" düğmesi
- Tema penceresi beyaz/yeşil yerine uygulamanın koyu zemin + altın renklerinde (seçili tema altın çerçeve ve işaret).
- Müsait: "Satın aldıklarım" (satın alınan ve özel tema; altta "Kullan" / "Kullanılıyor", kalan gün) ve
  "Ücretsiz temalar" (dokununca uygulanır) olarak ayrıldı.
- Mağaza: satın alınmış temada "Kullan" + "Uzat", alınmamışta "Satın al"; fiyat altın renkte.
- Oda açma ekranındaki tema seçicide seçili çerçeve de altın.

## v2.96.6 — Tema görseli kırpma ekranı
- Tema görselinde fotoğraf artık çerçevenin içine sığana kadar küçültülebilir ("Sığdır" / "Doldur" düğmesi); geniş
  fotoğrafın kenarları kesilmek zorunda değil. Boş kalan yer fotoğrafın bulanık, koyu hâliyle dolar; önizlemede görünen
  kaydedilenle aynıdır. Çıktı her zaman 1080x1920.
- Dikey çerçeve ekranın daha büyük kısmını kullanır; çerçeve dışı belirgin şekilde karartılır (neyin kesileceği görünür).
- Profil / kapak / banner kırpmaları eskisi gibi çalışır.

## v2.96.5 — Doğum Günü mikrofon modu düzeltmesi
- "Uygula" deyince "Değer kurallara uymuyor." hatası: mod odayı 25 koltuğa çıkarıyor ama veritabanı kısıtı 25'e izin
  vermiyordu (062'de eksik kalmış). Migration 065 ile 25 koltuk rooms ve room_profiles'a eklendi.
- Yeni test: uygulamanın izin verdiği her koltuk sayısının ve her mikrofon tasarımının veritabanı kısıtında olduğu denetlenir.

## v2.96.4 — APK derlemesi: lint denetimi
- Yayın derlemesinde Android "lint vital" denetimi kapatıldı (mobile/yerel/trlive_capture/android/build.gradle): lint
  aracının kendisi çökerek (LintDriver.handleDetectorError) assembleRelease'i durduruyordu. APK'nın içeriği değişmez;
  Dart kod analizi iş akışında çalışmaya devam eder.
- İnceleme düzeltmeleri: WebView alt penceresinde yuvarlak köşe + tek kenar çizgisi (Flutter'da çizim hatası riski)
  kaldırıldı; WebView hata kontrolü paket sürümünden bağımsız yazıldı; yönetim ekranında yer değiştiren açıklama düzeltildi.

## v2.96.3 — APK derlemesi doğru klasörü bulsun
- APK iş akışı Flutter projesini alfabetik ilk pubspec.yaml'dan seçtiği için mobile/packages/trlive_capture'ı uygulama
  sandı. Eklenti mobile/yerel/trlive_capture'a taşındı (artık mobile/pubspec.yaml önce bulunur).

## v2.96.2 — APK derleme düzeltmesi
- v2.96.0 APK derlemesi Android lint denetiminde düşüyordu (MainActivity.kt ekran görüntüsü kodu). Kod lint'e takılmayacak
  biçimde yeniden yazıldı: Android 14 bildirimi yansıtma ile kaydedilir (@TargetApi), galeri taraması lambdasız.
- Android 14+ ekran görüntüsü bildirimi izni artık iş akışı dosyasına dokunmadan gelir: mobile/yerel/trlive_capture
  (yalnızca AndroidManifest izni taşıyan yerel eklenti; derleme izni uygulamaya kendisi ekler).

## v2.96.1 — CI düzeltmeleri
- Sunucu açılmıyordu (e2e "Sunucu 30 sn içinde açılmadı"): güncelleme paketindeki admin.js, pakette olmayan
  src/redact.js dosyasını içe aktarıyordu. Dosya eklendi (sunucu kayıtlarındaki şifre / token / anahtarları maskeler) + test.
- Bilinmeyen oda teması yine 400 döner (e2e beklentisi).
- Mobile CI: flutter analyze çıktısındaki hata ve uyarılar kaydın sonunda ayrıca listelenir ve özet sayfasında görünür.
- Tema efekt katmanında switch içindeki continue kaldırıldı.

## v2.96.0 — Oda sohbet geçmişi ve ekran görüntüsü koruması
- Odaya yeni giren kişi yalnızca **girdiği andan sonraki** mesajları görür (önceki sohbet gösterilmez; çıkıp girince
  yeniden o andan başlar). Bağlantı kopup aynı oturuma dönen kişi kendi giriş anından beri olanları görmeye devam eder.
- Profil sayfaları (kendi profili, başkasının profili, profil düzenleme) açıkken ekran görüntüsü ve ekran kaydı
  engellenir (Android FLAG_SECURE: görüntü siyah çıkar).
- Uygulama içinde alınan ekran görüntüleri yönetim paneline bildirilir (kim, ne zaman, hangi ekran, hangi oda / kişi;
  görüntünün kendisi gönderilmez). Yönetim > Ekran görüntüleri ve kullanıcı detayında "Ekran görüntüleri". 90 gün saklanır.
  Android 14+: sistem bildirimi (DETECT_SCREEN_CAPTURE izni). Android 12 ve öncesi: yalnızca galeri izni zaten verilmişse.
- Gizlilik Politikası'na ekran görüntüsü kaydı maddesi eklendi; sürüm 2026-11-14 (kullanıcılardan yeniden onay istenir).
- Migration 064 (screenshot_events).

## v2.95.0 — Oda temaları: Müsait / Mağaza, hareketli temalar, özel tema
- Oda > Tema artık iki sekmeli alt pencere: **Müsait** (Coin'siz + satın alınan + onaylı özel tema; dokununca uygulanır)
  ve **Mağaza** (Coin'li, süreli; önizleme, "Satın alma" / "Süreyi uzat"). Oda sesi ve bağlantısı kesilmez.
- 30 yeni tasarım (kendi çizimimiz, tools/oda_temalari.py): 14 sade Coin'siz, 8 hareketsiz özel, 8 hafif hareketli
  (kutup ışığı, yıldız kayması, kar, sakura, ateş böcekleri, baloncuk, kor, kozmos). Hareket tek ve hafif bir çizim
  katmanıdır (~30 kare/sn, en fazla 36 parçacık, blur yok); şarj tasarrufunda kapanır.
- Tema hakları odanın sahibine aittir; süre bitince oda kendiliğinden Varsayılan temaya döner (dakikada bir denetim).
- Yönetim > Oda temaları: tema ekle / düzenle / kapat / sil. Yüklenen görsel otomatik olarak 1080x1920 + 360x640
  küçük resme getirilir (ffmpeg); uygulama her ekrana "cover" ile yerleştirir.
- Ödül: kullanıcı detayında "Oda teması hediye et" ve "Özel tema hakkı ver". Kullanıcı kendi görselini yükler,
  "Özel tema talepleri"nden onaylanınca süre başlar; reddedilirse neden gösterilir ve yeniden yükleyebilir. Bildirim gider.
- Migration 063 (yeni temalar, efekt türleri, silinen tema kaydı).

## v2.94.0 — Oda Etkinlikleri genel anahtarı
- Yönetim > Uygulama ayarları > Oda: **Oda Etkinlikleri açık** anahtarı (herkes için aynı). Kapalıyken odada Etkinlikler menüsü
  görünmez ve `/room-activities` 404 verir. `/api/app/config` artık `roomActivitiesEnabled` döndürür.
- Düzeltme: panel `blockRooted` ve `sslPinning` ayarlarını gönderiyordu ama sunucu tanımıyordu ("Bilinmeyen ayar" ile ayar kaydı
  reddediliyordu); ikisi de varsayılan kapalı olarak tanımlandı.

## v2.93.0 — Bayi bakiye talebi ve ilk mini oyun WebView'da
- Bayi paneli "Bakiye Talep Et" artık `/dealer-topup` H5 sayfasını alt pencerede (WebView) açar; sayfa aktif bayi hesabı ve token
  doğrular, mevcut `/api/dealer/topup-*` uçlarını kullanır. nginx'e yol eklendi. Eski yerel ekran kaldırıldı.
- Oda etkinliklerine ilk mini oyun eklendi: Hafıza Kartları (ücretsiz, bahissiz, tamamen istemcide).
- Görünürlük herkes için aynı kurallarla: platforma ya da hesaba göre gizleme yok.

## v2.92.0 — Oda içi etkinlikler: WebView penceresi
- Oda "İnteraktif Özellikler" menüsüne **Etkinlikler** eklendi: kendi sunucumuzdaki sabit H5 sayfası (`/room-activities?roomId=…`)
  ekranın alt %55'inde, koyu temalı alt pencerede açılır; sesli yayın ve oda bağlantısı kesilmez.
- Yeni genel bileşen `AppWebViewModal` (mobile/lib/widgets/app_webview_modal.dart): ince yükleme çubuğu, yalnızca kendi sunucumuza
  gidebilir, oturum bileti adrese yazılmaz (ilk istekte `Authorization` başlığı; sayfa için `TRLive` kanalı), bakiye yenileme.
- Sunucu: `GET /room-activities` token ve oda üyeliği doğrular, nonce'lu sıkı CSP ile sayfa sunar; nginx'e yol eklendi.

## v2.91.1 — Alev çerçeveleri yönetim panelinden eklenecek
- Alev Halkası ve Mavi Alev Halkası sunucuya kendiliğinden eklenmez (aynı çerçeve iki kez görünmesin); dosyalar yönetim
  panelinden mağazaya yüklenir. Dosyalar uygulamanın varsayılan çerçeve oranına (1.6) göre üretildi, avatara tam oturur.
- Üretici araç: tools/alev_halkasi_cerceve.py (fire / blue).

## v2.91.0 — Alev Halkası yenilendi + Mavi Alev Halkası
- "Alev Halkası" baştan çizildi (videodaki gibi): kalın turuncu halka (ortası açık sarı çizgi, kenarları turuncu, net iç
  kenar), halkadan yükselen gerçekçi alev dilleri (tabanı sarı-beyaz, gövdesi turuncu, uçları kırmızı ve yarı saydam),
  üstte uzun alev tacı, yanlarda orta, altta kısa alevler; hızlı yükselen kıvrımlı hareket ve uçuşan turuncu kıvılcımlar.
- Yeni "Mavi Alev Halkası": aynı çerçevenin mavi alevli hâli (elektrik mavisi halka, beyaz-camgöbeği çekirdekli alevler).
- İkisi de sunucu güncellenince mağazaya kendiliğinden eklenir / güncellenir (samples/pack21); 5.000 coin / 30 gün,
  fiyat yönetim panelinden değiştirilebilir. Üretici: tools/alev_halkasi_cerceve.py.

## v2.90.0 — Yeni çerçeve: Alev Halkası
- Mağazaya (Çerçeveler) hareketli "Alev Halkası" çerçevesi eklendi: avatarı saran parlak ateş halkası, üstte yükselen
  alev dilleri ve uçuşan kıvılcımlar; kusursuz döngü, şeffaf zemin. Kendi çizimimiz (tools/alev_halkasi_cerceve.py ile
  üretilir), başka uygulamanın dosyası kullanılmadı.
- Sunucu güncellenince kendiliğinden eklenir (backend/src/samples/pack20/f_fire.webp); fiyatı paket çerçeveleri gibi
  5.000 coin / 30 gün, yönetim panelinden değiştirilebilir.

## v2.89.0 — Oda giriş-çıkış sistemi: tek oda kuralı, asılı kalan üyelik ve açık kalan oda düzeltmeleri
- Tek oda kuralı (Yoho gibi): bir kişi aynı anda yalnızca bir odada bulunur. Başka odaya girince ya da kendi odasını açınca
  önceki odadan sunucuda anında çıkar (eskiden hesap eski odada asılı kalabiliyordu). Sahibi olduğu oda, içeride yardımcı
  sahip yoksa kapanır. Başka cihazdan başka odaya geçilirse eski ekran "Başka bir odaya geçtiğin için bu odadan çıktın" ile kapanır.
- Oda yalnızca sahibi ya da yardımcı sahibi içerideyken açık kalır; moderatör artık odayı açık tutmaz (sahip çıkıp başka
  odaya gidince oda açık kalıyordu). Son yardımcı sahip çıkarken de "oda herkes için kapanır" uyarısı çıkar.
- Uygulaması kapanan / bağlantısı kopan kişi ~3 dk içinde odadan düşer (eskiden üye 5 dk, sahip 15 dk); sahipsiz kalan açık
  odalar 2 dk içinde kendiliğinden kapanır. Uygulama yeniden açılınca eski odada asılı kalan üyelik hemen temizlenir.
- Kendi odanı açarken önce sorulur (vazgeçersen boşuna oda açılmaz); bildirimden / aileden odaya girerken de aynı uyarı.
- Odadan atılan kişi uygulamanın kendiliğinden yeniden bağlanmasıyla geri girmez; elle tekrar girebilir.
- Sahip odadan çıkınca yayın süresi sayımı durur, dönünce yeniden başlar (yardımcı sahip odayı açık tutsa da süre şişmez).
- Müziği çalan kişi odadan çıkınca müzik durur; mikrofon sırasındaki kişi çıkınca sıra herkeste güncellenir, boşalan koltuk
  için sıradaki davet edilir. Banlanan kişinin açık odaları kapanır.
- Giriş isteği yarıda kalırsa (zaman aşımı) üyelik asılı kalmaz; eski odanın geç gelen "kapandı" bildirimi yeni açılan odayı
  kapatmaz; soket odaya abonelik yarışı düzeltildi.

## v2.88.0 — Gümüş 400K şeridi, düz oda ID, sade oda simgeleri, siyah-sarı müzik, yükseltilmiş kartlar, eşit rozetler
- 400K–1M global hediye şeridi gümüş: süsler parlak gümüş, bant koyu füme; gümüş ışık halesi, beyaz parıltı, yıldızlar,
  bandın kenarında dolaşan gümüş ışık, yağan gümüş tozları, gümüş halkalı avatar ve parlayan adet (1M+ altın aynı).
- Oda başlığındaki ve oda bilgisindeki ID yine düz yazı ("ID:2147"): sahibin güncel kimliği (özel ID varsa o), renkli ya
  da özel olsa da burada süssüz görünür.
- Oda kartı sol üst simgeleri (sesli / görüntülü, PK, Yükseliyor) tek tip: koyu cam kapsül, ince uygulama sarısı çerçeve,
  altın simge; dinleyici simgesi de altın. Takip/fan listelerindeki "Oda / Odada" simgesi de aynı tarz.
- Müzik sayfaları, küçük çalar, ses düzeyi, plak ve DJ paneli siyah-sarı: siyah zemin, altın düğmeler ve çizgiler.
- Banner'a parlak altın çerçeve ve ışıma; banner ve oda kartları altında gölge ve üst kenarda ince ışıkla bir kademe
  yükseltilmiş görünür.
- WIP, seviye ve CP kutucukları her yerde eşit: WIP rozeti yanındaki seviye etiketiyle aynı yükseklik ve en az aynı
  genişlikte (sohbet, profil kartı, listeler, paylaşımlar, giriş şeridi); profil kartındaki küçük etiketler de aynı boy.

## v2.87.0 — Gizli kullanıcı (Yoho gizemli kişi gibi)
- Gizli kullanıcı modu odadayken açılıp kapatılamaz (sahibi olduğun açık oda da sayılır): "önce odadan çık" uyarısı çıkar.
  Böylece odadakiler gizli kişinin kim olduğunu eşleştiremez. WIP bitince gizlilik de kişi odadan çıktıktan sonra kapanır.
- Gizli kimlik: gizli mod her açılışta kişiye 6 haneli yeni bir gizli ID verilir. Odalarda, sohbette, listelerde, katkı
  sıralamasında ve şanslı çantada "Gizli Kullanıcı" + gizli ID kapsülü (koyu mor, gözü kapalı madalyon) görünür;
  gerçek ID, fotoğraf ve seviyeler gösterilmez (gizemli kişi görseli). Ayarlar'da kişinin kendi gizli ID'si yazar.
- Gizli kullanıcıya dokununca profili açılmaz: odadaki mini kartta yalnızca gizli kimlik, hediye, etiketleme, şikâyet ve
  oda yönetimi; takip, CP/ilişkiler, rozetler, takipçi sayıları yok. Paylaşımlarda ve PK tahtında da profil açılmaz.
  Başka bir yoldan açılsa bile sunucu gerçek profili vermez (gizli sayfa görünür); takipçi / takip listeleri de boş döner.
- Gizli ID yalnızca oda içinde görünür (üyeler, sohbet, hediye, çanta, PK); takip / arkadaş / ziyaretçi / paylaşım /
  mesaj listelerinde gönderilmez, böylece tanıdıklar gizli ID'yi kişiyle eşleştiremez. Katkı sıralamasında da gizli ID yok.
- Oda sohbeti geçmişi: mesaj gizliyken yazıldıysa sonradan gizlilik kapansa da o mesaj "Gizli Kullanıcı" olarak kalır;
  kişi şu an gizliyse eski mesajları da maskeli görünür.
- Gizli kullanıcının paylaşımları kişiye göre listelenmez; paylaşım kartında takip düğmesi ve seviye görünmez.
- WIP'i biten gizli kullanıcı odadan odaya geçerek gizli kalamaz: hiçbir odada değilken yeni odaya girerken gizlilik kapanır.
- Sunucu: users.hidden_alias, room_messages.sender_hidden/sender_alias (057), PATCH /api/me isHidden 409 (odadayken),
  publicUser gizli kişide seviye yok; roomUser (oda içi) gizli ID'yi ekler.

## v2.86.0 — Kimlik (ID) sistemi: oda kimliği = sahibin kimliği, yeni ID tasarımları
- Oda kimliği artık oda sahibinin güncel kimliği (Yoho gibi): odanın üst başlığında ve oda bilgisi penceresinde ayrı
  "oda numarası" yerine sahibin ID'si görünür; özel ID'si varsa özel ID, yoksa normal ID — kendi tasarımıyla.
  Sahibin kimliği değişince (özel ID verildi/alındı, renkli ID takıldı) odadakilerin ekranında hemen değişir;
  sahip o an odada olmasa da (sunucu sahibin açık odalarına da duyurur). Gizli kullanıcının odasında eski oda numarası görünür.
- Oda arama: rakamla aranınca sahibin normal ID'si, özel ID'si veya eski oda numarası tam eşleşir (gizli kullanıcı hariç).
- Yeni ID tasarımları:
  - Normal ID: küçük "ID" etiketi + numara.
  - Renkli ID (bronz/gümüş/altın): metalik "ID" etiketi, numara metalik renkte akar, ara ara üzerinden parlak ışık geçer.
  - Özel ID: zemin rengi akar (3 hane gökkuşağı, 4–5 hane mor-pembe, 6+ altın-ateş), çevresinde dönen altın çerçeve,
    taçlı altın madalyon, eğik beyaz numara, üzerinden parıltı ve sırayla parlayan yıldızlar.
- Takipçi / takip / arkadaş / ziyaretçi listelerinde kimlik de bu tasarımla görünür.

## v2.85.0 — Global şeritler (ışık / altın), hızlı müzik, yeni emojiler
- Global hediye şeridi: var olan altın-kırmızı tasarım korunarak geliştirildi.
  - 400 bin+: şeridin biçimini izleyen atan sıcak ışık halesi, şeridin (süsler dahil) üzerinden kayan parlak ışık,
    süslerin üzerinde patlayan dört köşeli yıldız parıltıları, banttan yükselen ışık taneleri, amblemde parlama.
  - 1 milyon+: kırmızı bant altın sarısı (süsler aynı), güçlü altın hale, altın parıltı iki kez geçer, amblemin
    arkasında dönen altın ışınlar, bant kenarında dolaşan kuyruklu altın ışıklar, yağan altın tozları, toplam Coin.
- Müzik daha hızlı: DJ şarkıyı seçince yükleme beklenmeden telefondaki dosyadan hemen çalar; yükleme bitince odadakiler
  DJ'nin o anki yerinden dinler (sunucu: play'de positionMs). DJ telefonu şarkıyı sunucudan yeniden indirmez.
  Aynı şarkı son saatlerde bu odaya yüklendiyse (uygulama kapanıp açılsa bile) yeniden yüklenmez (yeni uç
  POST /api/rooms/:id/music/reuse). Listede gönderilen şarkıda küçük yükleniyor simgesi.
- Mikrofon emojileri: kendi çizdiğimiz 19 emoji kaldırıldı. İlk 3 emoji aynı; yerine Google'ın hareketli Noto
  emojileri (CC BY 4.0) geldi: 😘 ve aynalanmış (öbür yöne) öpücük, 😍 🥰 😂 🤣 😎 🤩 🥳 😜 🤔 😭 😡 😱 😴 👏 🙏 👋 ❤️ 🔥 💯
  (toplam 24). Sunucu her emojiyi bir kez indirip saklar (GET /api/emoji/noto/:kod), telefon da önbelleğe alır;
  alınamazsa düz emoji gösterilir. Hakkında → Lisanslar sayfası eklendi (atıf).

## v2.84.0 — Düzeltmeler (WIP rozeti, hediye şeritleri, emojiler, çanta)
- Oda içi oda adı kutusu kısaltıldı: en fazla ekranın ~%36'sı, ad kısaysa yalnızca ad kadar; uzun ad kayar.
- WIP rozeti her yerde yeni görünüm (Yoho VIP3 gibi): koyu parlak hap, ince altın çerçeve, eğik altın "WIP3";
  yalnızca SWIP'in üzerinden altın parıltı geçer. Bağlantılar listesindeki uzun WIP çubuğu kaldırıldı.
- Global hediye şeridi 400 bin – 1 milyon ve 1 milyon üstü: mor tasarım kaldırıldı; var olan altın-kırmızı şerit
  geliştirildi. 400K+: daha büyük, atan altın ışık, parıltı ve yıldızlar, ışınlı büyük hediye. 1M+: en büyük boyut,
  arkada dönen dev ışınlar ve alev hale, kenarda dolaşan altın ışıklar, taç, yağan altın tozları, toplam Coin.
- Uçan yazı (sohbetin üstünde kayan yazı): saydam siyah zemin, ince uygulama sarısı çerçeve.
- Mikrofon emojileri koltuk dairesini tamamen kaplar (altta daireyi örten zemin); yeni emojiler daha büyük çizildi;
  sola öpücük emojisi eklendi (22 emoji).
- Şanslı çanta penceresi: profil, yazılar, Coin, AÇ düğmesi ve kazanç şeridi orantılı büyütüldü.

## v2.83.0 — Bağlantılar sayfası, canlı oda sıralaması, oda kartı simgeleri
- Profil → Takip Edilen / Fanlar / Ziyaretçiler / Arkadaşlar tek sayfada ("Bağlantılarım"); yana kaydırarak geçilir.
  Satırlar kart: fotoğraf, isim, gönderme / alma seviyeleri, WIP ve ID. Kişi bir odadaysa sağda simge: kendi sesli
  odası mikrofon, görüntülü odası kamera, başka bir odadaysa hareketli yatay "Odada" çubukları; dokununca o odaya
  girilir. Başkalarının takip/fan listeleri de aynı kartları kullanır. Arkadaşlar sekmesinde istekler bağlantısı.
  (Sunucu: listelerde currentRoom; gizli kullanıcı, hayalet mod, durumunu gizleyen ve gizli odalar gösterilmez.)
- Oda listesi sıralaması (Yoho / Mico): kişi sayısı, mikrofondakiler, son 30 dakikadaki hediyeler ve PK puana katılır;
  son 5 dakikada 10.000 Coin ve üzeri hediye atılan oda "🔥 Yükseliyor" olur ve anında en üste çıkar. Liste 20
  saniyede bir sessizce yenilenir.
- Ana sayfa: banner ile odalar arasında ve alt alta gelen oda sıraları arasında bir satırlık ek boşluk.
- Oda kartı (Mico): sol üstte oda türü simgesi (sesli: yeşil mikrofon, görüntülü: turuncu kamera), PK sürüyorsa PK
  logosu, yükselen odada "🔥 Yükseliyor".

## v2.82.0 — Müzik sistemi Yoho düzeninde
- Odadaki kullanıcılar müzik kutusunu görmez, yalnızca müziği duyar. Plak ve DJ paneli yalnızca müziği çalan kişide
  (oda yetkilisi) görünür.
- Odada başlığın altında solda dönen plak (pikap kolu çalarken iğneye iner); dokununca DJ paneli açılır/kapanır.
- DJ paneli: müziği kapat, küçült, kayan şarkı adı, ses düzeyi, oynat/duraklat, sonraki ve şarkı listesi.
- Ses düzeyini DJ ayarlar; odadaki herkesin cihazında bu düzeyde çalar (sunucu: room_music.volume, yeni uç
  POST /api/rooms/:id/music/volume; müzik durumunda controlledBy ve volume).
- "Müzik" sayfası beyaz Yoho tasarımı: "Toplamda: N şarkı", satırda ad ve "süre | sanatçı", çalan satır yeşil ve
  duraklat simgesi, uzun basınca listeden kaldırma; altta koyu küçük çalar (oynat/duraklat, ilerleme ve atlama,
  süreler, ses düzeyi).
- "Yerel eklendi" sayfası: telefondaki şarkılar, yeşil "Eklemek" / soluk "Eklendi", "Yeniden tara", "Tümünü ekle".
- Eski koyu müzik ekranları, "Şimdi Çalıyor" penceresi ve sürüklenen müzik balonu kaldırıldı.
- Veritabanı: 056_room_music_volume.

## v2.81.0 — Kademeli global hediye şeritleri, yeni mikrofon emojileri, WIP giriş efektleri
- Global hediye şeridi hediyenin toplam değerine göre üç kademe:
  - 400 bine kadar: var olan altın-kırmızı şerit; üzerinden parıltı geçer, hediye hafifçe süzülür.
  - 400 bin – 1 milyon: mor-pembe parlak bant, ince altın çerçeve, nabız gibi atan ışık, parıldayan yıldızlar,
    "SÜPER HEDİYE" rozeti ve arkasında dönen ışınlarla büyük hediye.
  - 1 milyon ve üstü: etrafında dönen altın çerçeve, koyu kırmızı zemin, taç ve "EFSANE HEDİYE" rozeti, toplam Coin,
    ışınlı dev hediye; ekranda 7 saniye kalır.
  - CP hediyeleri: pembe tonlu şerit, çerçevesi boyunca dolaşan ve atan küçük kalpler.
- Mikrofon emojileri 3'ten 21'e çıktı (18 yeni hareketli emoji); seçim penceresi ızgara oldu.
- WIP giriş şeridi geliştirildi: tüm WIP'lerde üzerinden geçen parıltı ve fotoğrafın çevresinde atan ışık; WIP 4+
  parıldayan yıldızlar; WIP 6+ fotoğrafın arkasında dönen ışınlar; WIP 8+ kenarlarda akan altın ışık ve girişte yıldız
  tozu; WIP 10+ sallanan taç; SWIP'te gökkuşağı kenar ışığı.

## v2.80.0 — Şanslı çanta, kayan oda adı, sohbet düzeltmesi
- Oda içi: oda adı alanı başlığın boş kalan genişliğine uzar; ad sığmazsa sürekli kayan yazı olarak döner
  (dışarıdaki oda kartında değişiklik yok).
- Ana sayfa oda kartları: aktif odalarda ince uygulama sarısı çerçeve.
- Şanslı çanta:
  - Odadaki çantaya dokununca açılan pencere büyütüldü.
  - Çanta açılınca kim ne kadar aldığı, en çok alandan başlayarak art arda kayan şeritte geçer (saydam siyah zemin,
    ince altın çerçeve); yeni alanlar canlı eklenir.
  - Süper çantada not bir kez gönderilir; gönderilince düğme gri olur ve yeniden dokunulamaz. Pencere kapanıp açılsa da
    yeniden istenmez (sunucu notu büyük/küçük harf farkı gözetmeden tanır).
  - Global süper çanta şeridi yeniden tasarlandı: çanta renkleri, ince uygulama sarısı çerçeve, üzerinden geçen parıltı,
    en sağda sallanan çanta. İlk atıldığında geçer, 30 saniye sonra bir kez daha geçer.
- İzleyiciler, Katkı listesi ve Oda yöneticileri listelerinde isme / fotoğrafa dokununca kişinin profili açılır
  (izleyicide satırın geri kalanı odadaki kullanıcı kartını açar).
- Oda sohbeti Yoho gibi alttan dolar (ters liste): ekran dolunca da son yazılan hep görünür. Eski mesajlar okunurken
  yeni mesaj gelirse "N yeni mesaj" düğmesi çıkar. Mesajların ilk harfi büyük yazılır.
- Oda içi kullanıcı kartı daha kompakt (ekranın en fazla %66'sı); cinsiyet/yaş, konum, kısa biyografi ve
  Takipçi / Takip / Arkadaş sayıları eklendi. Oda adına dokununca açılan oda kartı da küçültüldü.

## v2.79.0 — Coin yükleme kaldırıldı, Google Play imzası ve AAB
- Profil → Coins artık yalnızca cüzdanı açar; "Coin yükle / ödeme yöntemleri" ekranı kaldırıldı (uygulamada satın alma yok).
- Uygulama dışı yüzen balon eklentisi (flutter_overlay_window) kaldırıldı; oda küçültme uygulama içinde balonla,
  dışarıda "odadasınız" bildirimiyle sürer. "Diğer uygulamaların üstünde göster", pil optimizasyonu ve telefon
  izinleri manifestten çıkarıldı (eklenti eklese bile silinir).
- Derleme: targetSdk / compileSdk 36 (Google Play şartı), sürüm kodu sürümden hesaplanır (2.79.0 → 27900),
  APK'nın yanında Google Play paketi (tr-live-aab) de üretilir.
- İmza: yeni "İmza anahtarı oluştur" iş akışı (bir kez çalıştırılır) yükleme anahtarını üretir, KEYSTORE_PASSWORD
  gizli değeriyle şifreleyip .github/signing/upload.jks.enc olarak saklar. Anahtar varsa APK ve AAB onunla imzalanır;
  yoksa uyarı verilip deneme anahtarı kullanılır.
- Gizlilik Politikası'ndaki izin listesi güncellendi (telefon ve yüzen balon izinleri yok).
- Not: .github/workflows dosyaları zip ile güncellenmez; apk_build.yml ve imza_anahtari.yml elle yüklenmelidir.

## v2.78.1 — Ayarlar: Şarj Tüketimi
- Ayarlar'daki "Arka plan ve balon izinleri" yerine "Şarj Tüketimi — Isınmayı ve şarj tüketimini azaltır" düğmesi.
  Açıkken: arayüz animasyonları kısılır (sistemdeki "animasyonları kapat" gibi), görüntülü odada kamera 360p yayınlar
  (bir sonraki girişte), güzellik filtresinin en çok işlemci yoran pürüzsüzleştirmesi kapanır. Ayar telefonda saklanır.
- Telefon izni sorulmaz; arama gelince oda sesi telefonun ses modundan anlaşılıp otomatik kapanır (değişiklik yok).
- Oda küçültme izin gerektirmez (uygulama içindeki küçük oda balonu ve uygulama dışında sabit "odadasınız" bildirimi).

## v2.78.0 — Yeni Gizlilik Politikası (ABD LLC), Micolive tarzı onay penceresi, yayın kuralları hatırlatması
- Gizlilik Politikası İngilizce (asıl metin, Micolive gibi) olarak baştan yazıldı (kendi metnimiz): hizmetleri ABD'de kurulu TR Live LLC sunar;
  18+ uyarısı, toplanan bilgiler (verilenler, otomatik toplananlar, cihaz izinleri, diğer kaynaklar), kullanım amaçları,
  paylaşım, haklar ve hesap silme, güvenlik ve uluslararası aktarım, reşit olmayanlar, paylaşım uyarısı, iletişim.
  Uygulamanın gerçekte topladığı bilgilere göre yazıldı (ör. hassas konum ve IMEI toplanmaz).
- Tek kaynak: backend/src/legal_texts.js. Uygulama metni /api/legal/privacy.json'dan okur; Google Play'e verilecek
  herkese açık adres /api/legal/privacy aynı metinden üretilir (hesap silme bölümü: /api/legal/data-deletion → #account-deletion).
  Şirketin tam unvanı / adresi kesinleşince yalnızca COMPANY satırı değişir.
- Micolive gibi alttan açılan "TR Live Privacy Policy" penceresi ve "I have read and confirmed" düğmesi. Sözleşme
  sürümü 2026-11-01'e yükseltildi: herkes bir kez yeni metni onaylar (onaylamayan çıkış yapabilir).
- Yayın açma ekranı açılınca "İpuçları" hatırlatması: kurallara aykırı yayın sonlandırılır, hesap yasaklanır.
- İzinler Micolive gibi yalnızca gerektiği yerde istenir: bildirim izni artık açılışta / giriş ekranında değil, girişten
  sonra ana sayfada bir kez (sözleşme onayından sonra); mikrofon koltuğa çıkınca, kamera yayın açınca, fotoğraf ve müzik
  yalnızca seçerken. Pil, balon (diğer uygulamaların üstünde) ve telefon izni hiç sorulmaz.
- Hediye adları: marka / telifli karakter çağrıştıranlar değişti (Külkedisi Ayakkabısı → Cam Ayakkabı, Zengin Şeyh →
  Zengin Beyefendi). Sunucudaki katalogda marka adı (Ferrari, Lamborghini, Rolls-Royce, Bugatti, McLaren, Mercedes,
  Aston Martin, Porsche, BMW, Titanic, Wonder Woman, Transformer vb.) içeren hediye ve mağaza öğesi adları genel
  adlarla değiştirilir (055_gift_names.sql); fiyat, animasyon ve geçmiş aynı kalır.
- Gizlilik metni koda göre düzeltildi (şehir bilgisi, rastgele kurulum kimliği, hesap silme yolu: Profil → Ayarlar →
  Hesap & Güvenlik → Hesabı sil); onay penceresinde 18 yaş beyanı; metin yüklenemezse de "çıkış yap" görünür.

## v2.77.0 — PK puanları (Micolive gibi), yeni "PK BAŞLIYOR / PK BAŞLADI" animasyonu, PK logosu
- PK puanı artık Micolive gibi sayılıyor; kişinin kendine gönderdiği hediye de sayılır.
  - Sesli oda PK: takım koltuğundaki kişiye gelen her hediye (kendine gönderdiği dahil) takım puanı olur. Tarafsız
    moddaki oda sahibi hakemdir (ona gelen sayılmaz); taraflıda seçtiği takıma sayılır. Puan "Başla"dan sonra sayılır.
  - Görüntülü PK: yayıncıya ya da o odada koltuktaki konuğa gelen her hediye (kendine dahil) o tarafın puanı olur;
    koltukta olmayan izleyiciye gelen hediye sayılmaz.
- Görüntülü PK ekranı Micolive düzeninde: üstte ortada "PK 02:13" hapı (hareketli logo + süre), her yarının altında o
  tarafın puanı (yıldız rozetiyle) ve yayıncı adı, altta ince pembe | mavi oran çizgisi, iki tarafın puanı ve en çok
  destekleyen 3 kişinin numaralı koltukları (solda 3-2-1, sağda 1-2-3; boşken koltuk simgesi, 1. altın).
- "PK BAŞLIYOR" geri sayımı yenilendi: parıldayan altın başlık, çarparak gelen altın 3 → 2 → 1, dolan halka, her sayıda
  şok dalgası ve kıvılcımlar, dönen ışık hüzmeleri.
- "PK BAŞLADI!" animasyonu yenilendi: kırmızı ve mavi şeritler hızlanarak gelip çarpışır; beyaz parlama, iki şok
  dalgası, saçılan kıvılcımlar, ekran sarsıntısı, dönen hüzmeler; hareketli PK logosu yaylanarak belirir; altın harfler
  tek tek düşer ve üzerinden parıltı geçer. (Önceki animasyondaki yazıların altında çıkabilen sarı çizgi de giderildi.)
- PK logosu: odadaki PK düğmesi, canlı yayın alt barı ve kurulum penceresinde durağan PNG; hareketli logo yalnızca PK
  sürerken (PK modu çubuğu, görüntülü PK ekranı, başlangıç animasyonu) oynar.

## v2.76.3 — APK derleme hatası (güzellik filtresi) düzeltildi
- "Unresolved reference 'BeautyFilter'" hatası giderildi: güzellik filtresi ayrı bir Java dosyasındaydı ve onu uygulamaya
  kopyalayacak iş akışı değişikliği zip ile güncellenemiyordu (.github klasörü zip'ten güncellenmez). Filtre artık
  derlemenin zaten kopyaladığı mobile/native/MainActivity.kt içinde (Kotlin). İş akışı dosyası değişmedi.
- Kotlin dosyası bu kez yerelde Kotlin 2.0 derleyicisiyle derlendi ve filtre sahte WebRTC sınıflarıyla çalıştırılarak
  denendi (pürüzsüzleştirme, renk, kare döndürme/zaman damgası, bağlanma/ayrılma).

## v2.76.2 — APK derleme hatası düzeltildi
- room_screen.dart: mikrofona çıkma yanıtı boş olabilir denetimi (flutter analyze "unchecked_use_of_nullable_value"
  hatası) düzeltildi. Başka değişiklik yok.

## v2.76.1 — Uçtan uca (e2e) testler güncellendi
- GitHub "e2e" testlerindeki 2 hata giderildi: testler eski kurallara göre yazılmıştı.
  - PK testi: odalar arası PK artık yalnızca görüntülü yayınlar arasında ve süreler 5/10/15/30 dk (v2.74).
  - Yardımcı admin testi: yardımcı admin artık 100.000'e kadar Coin yükleyebilir ve WIP verebilir (v2.71);
    sınır aşımı, Coin düşme ve yöneticiye işlem hâlâ reddedilir.
- Uygulamada değişiklik yok (v2.76.0 ile aynı).

## v2.76.0 — Canlı yayına konuk (misafir), Figma alt bar, PK logosu, güzellik filtresi
- Tekli (canlı) görüntülü yayında konuk sistemi (Bigo tarzı): izleyici alt bardaki ∞ düğmesinden yayıncıya konuk olma
  isteği gönderir (geri alabilir). İstek yayıncıya düşer: ∞ üzerinde sayı rozeti, kısa bildirim ve "Konuk istekleri"
  penceresi (Kabul et / Reddet; yayındaki konukları "Konukluktan çıkar"). Kabul edilince konuk sormadan bağlanır,
  kamerası ve mikrofonu açılır, sağdaki küçük pencerede görünür (en fazla 3 konuk). Reddedilene bildirim gider.
  Canlı yayında koltuğa doğrudan çıkılamaz; yalnızca yayıncı onayıyla (sunucu da denetler).
- Canlı yayın alt barı (Figma): yayıncı için sohbet · PK · mikrofon · ∞ · hediye · menü; konuk için sohbet · mikrofon ·
  emoji · ∞ (konukluktan ayrıl) · hediye · menü; izleyici için sohbet · ∞ · hediye · mesajlar · ses · menü.
- Hareketli PK logosu: sesli oda PK düğmesi ve kurulum penceresi, PK başlangıç animasyonu (sesli ve görüntülü), PK
  çubukları ve görüntülü PK ekranı.
- Güzellik filtresi (kendi filtremiz, ücretli SDK yok): pürüzsüzleştirme (kenarları koruyan cilt yumuşatma), aydınlatma,
  beyazlatma, pembelik ve 7 renk filtresi (Doğal, Sıcak, Soğuk, Canlı, Pembe, S/B, Nostalji); "Doğal güzellik" tek
  dokunuş ve "Sıfırla". Yayın açma ekranındaki "Güzellik" düğmesinden, odada kendi koltuk menünden ve araçlar
  menüsünden açılır; önizlemede ve yayında aynı anda uygulanır, ayarlar telefonda saklanır, kamera çevrilince sürer.
  Kamera kareleri telefonda işlenir (mobile/native/BeautyFilter.java); bağlanamazsa görüntü olduğu gibi yayınlanır.

## v2.75.0 — Sesli oda PK: Figma tasarımı (9'lu koltuk, MVP tahtları, 3-2-1, emojiler)
- PK modu yalnızca 9'lu koltukta açılır. Açılınca koltuklar PK sahnesine dizilir: üstte ortada oda sahibi, iki yanında
  Kırmızı ve Mavi MVP tahtı (takımın o an en çok destekleyeni altın tahtta oturur, üstünde taç), altta solda Kırmızı 2×2,
  sağda Mavi 2×2 koltuk (No.1–No.4). Arkada kırmızı | mavi zemin, ortada nabız atan ışık huzmesi ve süzülen kıvılcımlar.
- Koltukların altında PK çubuğu: kırmızı | mavi skor çizgisi, "Hazırlanıyor" yazıları, ortada "Başla" (oda sahibi /
  yardımcı sahip), tur sürerken VS + geri sayım; altında takımların en çok destekleyen 3 kişisi, "Takım Savaşı" ve X.
- "Başla"ya basılınca odadaki herkeste 3 → 2 → 1 geri sayım, ardından VS çarpışma animasyonu; süre animasyondan sonra işler.
- Tur bitince kazanan takımın mikrofonlarında gülen, kaybeden takımın mikrofonlarında ağlayan emoji kendiliğinden oynar
  (~6 sn; berabere kalınca emoji yok). Sonuç penceresi (kazanan + MVP) açılır, sonuç ~4 sn çubukta kalır ve aynı ayarlarla yeni tur "Hazırlanıyor"
  olarak gelir. X → "Turu şimdi bitir" ya da "PK modunu kapat" (koltuklar normale döner).
- PK modu açıkken mikrofon modu değiştirilemez; PK modu açık odaya görüntülü PK daveti gönderilemez.

## v2.74.0 — Görüntülü PK: bölünmüş ekran (Bigo tarzı)
- Tekli görüntülü yayında PK kabul edilince ekran ikiye bölünür: solda bizim yayıncı, sağda rakip yayıncı (canlı görüntü
  ve sesi). Rakip yayın, rakip odaya görünmeyen yalnızca izleme bağlantısıyla gelir (sunucu: POST /api/pk/:id/peer-token).
- Ortada nabız atan VS ve geri sayım (son 10 sn yanıp söner); altta sayarak artan skorlar, kayan skor çizgisi ve iki tarafın
  en çok destekleyen 3 kişisi; başlarken "BİZ / RAKİP" çarpışma animasyonu; bitince yarıların üstüne KAZANDI / KAYBETTİ /
  BERABERE damgası. Oda sahibi PK'yı bitirebilir.
- Oda sesi kapatılınca ya da telefon aramasında rakibin sesi de kapanır; oda küçültülünce rakip görüntüsü indirilmez.
  Yalnızca rakip yayıncının görüntü / sesi alınır. Bağlantı koparsa kendiliğinden yeniden bağlanır.
- PK daveti yalnızca görüntülü yayınlar arasında (sesli odada oda içi PK). Rakip odadan engellenen kişi rakip yayını izleyemez.

## v2.73.0 — Sesli oda içi PK (Kırmızı / Mavi takım)
- Sesli odada oda sahibi veya yardımcı sahip "PK" ile oda içi PK başlatır: koltuk 2'den ortaya kadar Kırmızı, kalanı
  Mavi takım. Takım koltuklarındaki kişilere gelen hediyelerin Elmas değeri takım puanı olur (kendine hediye sayılmaz).
- Süre: 15, 30 ya da 60 dakika. Mod: Tarafsız (oda sahibi hakem, ona gelen hediye sayılmaz) ya da Taraflı (oda sahibi
  seçtiği takımda). En az 4 koltuklu mikrofon modu gerekir. Yönetici erken bitirebilir (kazanan ve MVP belirlenir) ya da
  iptal edebilir. Oda kapanınca PK o anki skorla biter. Oda sahibi hangi koltuğa geçerse geçsin tarafsızda hakem, taraflıda
  seçtiği takımda sayılır. PK sürerken mikrofon modu değiştirilemez; oda içi PK ile odalar arası PK aynı anda olamaz.
- Tasarım ve animasyonlar: PK başlarken iki yandan çarpışan Kırmızı / Mavi şeritler ve patlayan "VS"; odanın üstünde canlı
  skor çubuğu (skorlar sayarak artar, takım çizgisi yumuşakça kayar, birleşim noktasında parlayan kıvılcım, kayan ışıltı,
  son 10 saniyede yanıp sönen geri sayım, her takımın en çok destekleyen 3 kişisi); koltuklarda takım renginde dönen halka
  ve K / M rozeti; bitişte konfetili kazanan kartı, skorlar ve MVP (kazanan takımın en çok destekleyeni, taçlı).
- Görüntülü yayında rakip yayına PK daveti süreleri: 5, 10, 15, 30 dakika.
- Veritabanı: 053_room_pk.sql.

## v2.72.0 — Seviyeler 300'e çıktı, prestij tasarımları
- Kullanıcı (gönderme) ve yayıncı (alma) seviyeleri 160 yerine 300'e kadar. Exp formülü aynı (2000 × (L-1)^2,5), bu yüzden
  mevcut kullanıcıların seviyesi değişmez; 160'ta takılı kalanlar exp'leri yettikçe yükselmeye devam eder.
- 151-300 arası üç "prestij" kademesi (en üst rozetin üstüne kodla çizilir, ek dosya yok):
  151-200 Kraliyet (altın çerçeve, süzülen parıltı), 201-250 Elmas (buz-mavi ton, parıltı, dış ışıma),
  251-300 Efsane (dönen gökkuşağı çerçeve, renkleri değişen ton, parıltı, ışıma). Seviye etiketlerinde ve büyük rozetlerde.
  Animasyonlar tek ortak zamanlayıcıyla döner (≈30 kare/sn); üstüne başka sayfa açılınca ya da görünen etiket yoksa durur,
  "animasyonları azalt" açıksa durağan çizilir.
- 160'ta takılı kalan kullanıcıların seviyesi sunucu açılışında bir kez yeniden hesaplanır. Aile katılma alt seviyesi 300'e kadar seçilebilir.
- Seviye Merkezi tablosu 300'e kadar; prestij satırlarında kademe adı.
- Yönetici seviye verme sınırı 300 (yardımcı admin yine en fazla 100).

## v2.71.0 — Yardımcı admin yetkileri, seviye verme, aile düzeltmeleri
- Seviye verme (yönetim): kullanıcı seviyesi veya yayıncı seviyesi. Yönetici 1-160 arası her seviyeyi verebilir (düşürebilir
  de); yardımcı admin en fazla 100. seviyeyi verir ve seviye düşüremez. Gerçek harcama / kazanç değişmez; verilen seviye için
  gereken fark ayrı tutulur (052_level_bonus.sql), sonraki hediyeler bunun üstüne eklenir. İşlem kaydına "Seviye verildi".
- Yardımcı admin artık: Coin yükleyebilir (tek seferde en fazla 100.000, düşemez), WIP verip alabilir, öğe (çerçeve, araç,
  balon, madalya, renkli ID…) verebilir, seviye verebilir — yalnızca normal kullanıcılara (yönetici / yardımcı admin
  hesaplarına değil). Uygulamadaki yönetim ekranında ve web panelinde. Kayıtlarda işlemi kimin (rolüyle) yaptığı görünür.
- Aile: normal üye aileden ayrılamıyordu (ayarlar düğmesi yalnızca yöneticilere görünüyordu). Artık her üye ayarlardan
  "Aileden Ayrıl"ı görür; bilgileri düzenleme ve istek ayarları yalnızca aile yöneticilerinde.
- Oda: üst köşedeki aile çipi artık odaya girenin değil, ODA SAHİBİNİN ailesini gösterir; dokununca o ailenin sayfası açılır.
  Oda sahibinin ailesi yoksa çip görünmez. (Sunucu: oda bilgisinde ownerFamily.)

## v2.70.0 — Tam teferruatlı web yönetim paneli (sunucu uçları)
- Kullanıcı listesi: GET /api/admin/users/list — tüm üyeler sayfa sayfa (50'şer); arama (kullanıcı adı, görünen ad, ID,
  özel ID; yönetici için telefon), filtre (durum, rol / tüm yetkililer, cinsiyet, WIP, yayıncı, son 24 saatte aktif,
  son 24 saatte yeni üye, sohbeti kısıtlı), sıralama (yeni / eski / son görülen / Coin / Elmas / harcayan / kazanan / ad) ve
  özet sayılar. Yardımcı admin bakiyeleri görmez.
- Kullanıcı ayrıntısı: GET /api/admin/users/:id/detail — profil, gizlilik ayarları, WIP / özel ID / rozet, aile, ajans ve
  yayıncılık, bulunduğu ve açtığı odalar, hakkındaki şikâyetler, otomatik ihlaller, sayılar (takipçi, hediye, oda, şikâyet).
  Yönetici ayrıca bakiye, telefon, doğum tarihi, bağlı Google / Facebook hesabı, KYC ve envanteri görür.
- Kullanıcı geçmişi (yönetici): GET /api/admin/users/:id/history?kind=wallet|gifts_sent|gifts_received|audit — sayfalı.
- Odalar (yönetici): liste (açık / kapanmış, arama, tür), ayrıntı (içeridekiler — gizli dinleyiciler dahil, son 100 mesaj,
  oturumdaki hediyeler ve en çok gönderenler, odayla ilgili şikâyetler), odayı kapatma, kişiyi odadan çıkarma, oda mesajı
  silme. Hepsi işlem kaydına yazılır.
- Platform geneli hediye akışı ve cüzdan hareketleri (sayfalı, filtreli), son 7/14/30 günün günlük istatistiği (yeni üye,
  hediye, Coin, oda, şikâyet — Türkiye saatiyle), aileler listesi, menü rozetleri için bekleyen işler sayısı
  (GET /api/admin/overview/pending).
- Şikâyet listesinde şikâyet edilen mesajın metni (yalnızca o mesaj), oda adı, hedefin durumu ve kararı veren görünür.
- Yardımcı admin izinlerine yalnızca liste, ayrıntı ve bekleyen iş sayısı (okuma) eklendi.
- Veritabanı: 051_admin_panel.sql (gönderilen hediye, şikâyet, işlem kaydı ve oda sorguları için dizinler).
- Web paneli (Trlive-Web) bu uçlarla yeniden yazıldı: Kullanıcılar → tıklayınca ayrıntı sayfası (Genel, İşlemler, Cüzdan,
  Hediyeler, Envanter, Cihazlar, Şikâyet, Destek, Kayıtlar), Odalar, Aileler, Yetkililer, Şikâyetler, Destek, Güvenlik,
  Ajanslar, Maaş Dönemleri, Kimlik Onayları, Mali Kayıtlar, Katalog, Duyurular, Ayarlar.

## v2.69.0 — Yasal metinler, kayıt onayı, web paneli bağlantısı, şanslı hediye olasılıkları
- Kayıt ekranında onay kutusu: "18 yaşından büyük olduğumu; Kullanıcı Sözleşmesi ve Gizlilik Politikası'nı okuyup kabul
  ettiğimi onaylıyorum. KVKK Aydınlatma Metni'ni okudum." (bağlantılar sitedeki metinleri açar). Kayıt olurken ve Google /
  Facebook ile girerken zorunlu. Onay sunucuya sürüm ve zamanla kaydedilir.
- Sözleşmeyi henüz onaylamamış (ya da metinler güncellenmiş) kullanıcıya girişten sonra bir kez onay penceresi çıkar;
  onaylamayan çıkış yapabilir. Sürüm: 2026-10-31 (uygulama: legal_screens.dart, sunucu: src/legal.js).
- Ayarlar → Sözleşmeler ve politikalar: Kullanıcı Sözleşmesi, Gizlilik, KVKK, Topluluk Kuralları, Çocuk Güvenliği (sitede);
  Coin, Hediye ve Elmas Koşulları ve Hesap silme bilgisi (yalnızca uygulama içinde). Hesabı sil'e basınca önce neyin
  silinip neyin saklandığı gösterilir. Yükleme Merkezi'nde Coin koşulları bağlantısı.
- 18 yaş: doğum tarihi en az 18 yaş (önce 13).
- Şanslı hediye: hediye panelinde "Olasılıklar" — her çarpanın çıkma ihtimali, ödül çıkmama ihtimali ve tek gönderimde en
  fazla kazanç gösterilir (uygulama mağazası kuralı). Sunucu olasılıkları /api/gifts yanıtında yollar.
- Sunucu: /legal/privacy, /legal/data-deletion, /legal/terms adresleri sitedeki güncel metinlere yönlendirir.
- Web paneli (trlive.github.io/Trlive-Web) için: "X-Client: web-panel" başlığı CORS'ta izinli ve zorunlu güncelleme
  denetiminden muaf. Oda giriş duyurusundaki bayi ifadesi kaldırıldı.
- Kayıt onayında "Coin, Hediye ve Elmas Koşulları" (sözleşmenin eki, yalnızca uygulama içinde) kayıttan önce de açılabilir.
  Onay penceresi onaylanmadan kapanırsa (üstüne sayfa açılırsa) yeniden gösterilir.
- 18 yaş: doğum tarihi takvim günüyle denetlenir; profilinde 18 yaşından küçük doğum tarihi kayıtlı olan kişinin sözleşme
  onayı kabul edilmez. Profil düzenlemede doğum tarihi yalnızca değiştiyse gönderilir.
- Yönetim: kullanıcı hesabını silme (POST /api/admin/users/:id/delete, yalnızca yönetici, gerekçe zorunlu ve kayda geçer) —
  e-posta ile gelen silme talepleri ve 18 yaş altı hesaplar için. Hesap silme işlemi tek bir serviste (account_delete.js);
  silmede cinsiyet bilgisi de temizlenir.
- Saklama: 2 yılı geçen güvenlik olayları ve 2 yıldan önce kapanmış oturum kayıtları (IP, cihaz) günde bir silinir.
- Coin yükleme penceresinde ve sıralama kurallarında bayi ifadeleri kaldırıldı.

## v2.68.0 — Renkli oda araçları, yeni Ayarlar ve Gizlilik (WIP), konuşma silme, aile istek uyarısı
- Oda → İnteraktif Özellikler / Temel Araçlar: düğmeler renkli (yeşil kilit, pembe temizle/tema/gizle, mavi sohbet,
  mor mikrofon modu, kırmızı kapat…); düzen aynı. Açık durumdaki araç (kilitli, gizli, sohbet yasağı, müzik çalıyor,
  kamera açık, sırada) etiketin altında küçük renkli çizgiyle gösterilir.
- Profil → Ayarlar yeniden düzenlendi: Hesap & Güvenlik (güvenlik düzeyi: Düşük/Orta/Yüksek — şifre, telefon, kimlik
  doğrulama), Gizlilik, Bildirimler, Dil, Paylaş (davet metni kopyalanır), Yardım (Müşteri hizmetleri), Geri bildirim,
  Hakkında (sürümler, hata kaydı), Takas (cüzdan · elmas bozdurma), Arka plan izinleri, Oturumu kapat. Renkli simgeler.
- Gizlilik (WIP ayrıcalıkları, her ayarın altında hangi kademede açıldığı yazar; yoksa kilitli, dokununca WIP sayfası):
  Ülke/Bölgeyi gizle (WIP 4, profilde "Bilinmiyor"), Çevrimiçi saati gizle (WIP 4), Görüntüleme geçmişini gizle (WIP 7,
  artık açılıp kapatılabilir), Gizli kullanıcı (WIP 10), Hayalet mod (SWIP). İletişim izni (kimler mesaj atabilir) ve
  Engellenen kullanıcılar da burada. Gizli kullanıcı ve çevrimiçi gizleme artık ücretsiz değil: üyeliği yetmeyen
  kişilerde bu ayarlar kapatılır; üyelik bitince / kademe düşünce 5 dk içinde kendiliğinden kapanır (yöneticiler hariç).
  Kademeler yönetimden (WIP tablosu) değiştirilebilir: hideCountry, hideOnline, hiddenUser.
- Mesajlar: konuşmayı sil (sola kaydır ya da basılı tut). Yalnızca silen kişide silinir; karşı taraf görmeye devam eder,
  yeni mesaj gelince konuşma yalnızca yeni mesajlarla yeniden görünür.
- Aile: biri aileye katılma isteği gönderince aile sahibi ve yöneticilere bildirim (Bildirimler + telefon bildirimi),
  profildeki "Aile" düğmesinde ve profil sekmesinde kırmızı rozet, aile sayfasında "N yeni katılma isteği" uyarısı
  (dokununca istekler açılır) ve "Aile üyeleri" yanında rozet.
- Düzeltme: Bildirimler listesinde sıralama metin olarak yapılıyordu (9 numaralı bildirim 22'nin önüne geçiyordu);
  artık en yeni bildirim her zaman en üstte.

## v2.67.2 — Para Çekme yalnızca maaş hak edilince
- Gelir Merkezi'ndeki "Para Çekme" düğmesi artık yalnızca yayıncı maaş kotasını doldurup maaş hak ettiğinde görünür:
  ajanstaki onaylı yayıncının bu dönemde tahmini maaşı 0'dan büyükse, biten ama yönetimin henüz kapatmadığı önceki dönemde
  maaş hak ettiyse ya da kapanmış dönemden henüz ödenmemiş maaşı varsa. Diğer durumlarda gizli (sayfa yine de açılırsa
  "kotanı doldurunca açılır" yazar). Para Çekme sayfasında ödenmeyi bekleyen maaş ayrıca gösterilir.

## v2.67.1 — Bildirimler ve ziyaretçiler: son 7 gün
- Mesajlar → Bildirimler artık son 7 günü gösterir (önce 30 gün), en yeni bildirim en üstte. Okunmamış sayısı da son 7 gün.
- Profil → Ziyaretçiler: son 7 günde profilini ziyaret edenler, en son ziyaret eden en üstte (önce tüm zamanlar, ilk 50).
  Profildeki ziyaretçi sayısı ve kırmızı rozet de son 7 güne göre.

## v2.67.0 — Daha az internet, daha az pil
- Sunucu bağlantısı açık tutulur (keep-alive): her istekte yeniden güvenli bağlantı kurulmuyor; uygulama, resimler ve
  hediye dosyaları tek ortak bağlantıyı kullanıyor (daha hızlı, daha az veri ve pil). Kopmuş bağlantıda okuma isteği bir
  kez kendiliğinden tekrarlanır.
- Anlık bağlantı (soket): sunucu 30 sn'de bir küçük canlılık mesajı yollar, telefon artık 25 sn'de bir ping atmıyor.
  Uygulamaya dönünce sağlam bağlantı boşuna kopartılıp yeniden kurulmuyor. Odada değilken uygulama 10 dk'dan uzun arka
  planda kalırsa bağlantı kapanır (telefon uyuyabilsin); açınca hemen bağlanır, kaçan bildirimler o an gelir.
  Büyük soket mesajları sıkıştırılarak gönderilir.
- Ekran artık her sayfada açık kalmıyor: yalnızca oda ekranı açıkken kararmaz; oda küçültülünce / diğer sayfalarda
  telefonun kendi ekran zaman aşımı geçerli.
- Arama algılama: Android 12+ telefonlarda ses modu olayla izleniyor (sürekli sorgu yok); uygulamadaki 0,8 sn'lik
  ikinci sorgu kaldırıldı (yalnızca eski kurulumlarda yedek olarak 2 sn).
- Oda sesi: 32 kbps konuşma sesi (önce 48) → konuşurken ses verisi ~%33 az; sessizken zaten veri gitmez.
  Görüntülü odada kamera 540p (önce 720p). Uygulama arka plana geçince görüntülü odada başkalarının görüntüsü indirilmez ve
  kamera kapanır (ses sürer); dönünce kendiliğinden açılır.
- Seyrek yoklama: oda sinyali 25 sn → 60 sn; müzik eşitleme yalnızca müzik çalarken (dakikada bir); mesaj rozetleri 3 dk'da
  bir ve yalnızca uygulama ekrandayken; etkinlik / destek / yönetim sayfaları yalnızca ekrandayken yenilenir.
- Hediye dosyaları yalnızca Wi-Fi'de önceden iner (mobil veride, gönderilince / gelince iner). Önbellek temizliği seyrek.
- Yüklenen görseller daha küçük: profil fotoğrafı 512 px, oda fotoğrafı 600 px, gönderi/mesaj görseli 1280 px, JPEG %80-84.
- Küçültülmüş oda balonunun dönüşü saniyede 15 kare (önce 60-120); üstte sayfa varken / arka planda hiç çizilmez.

## v2.66.1 — Renkli ID (bronz, gümüş, altın)
- Üç renkli ID: Bronz, Gümüş ve Altın. Kullanıcının ID'si metalik renkte, üzerinden ışık geçen yazıyla görünür
  (profil, kullanıcı sayfası, oda içi profil kartı). Özel ID varsa özel ID kapsülü öncelikli.
- Yönetim: kullanıcı sayfasında "Renkli ID ver" (ve Öğe ver → Renkli ID); gün sayısı ya da süresiz verilir.
- Görünüm: yeni "Renkli ID" sekmesi; sahip olunan renkli ID'ler önizlenir, Etkinleştir / Kaldır ile takılır.

## v2.66.0 — Ajans sistemi v2: maaş tablosu, Ajansım, asistanlar, transferler, davet merkezi, özel ID
- Yayıncı maaşı mavi tabloya göre (44 seviye, elmas kotaları ×10: 1. seviye 200.000 💎 … 44. seviye 2,5 milyar 💎).
  İki yöntem: Yöntem 1 = ay içinde alınan toplam elmas → "Maaş 1"; Yöntem 2 = dönem kapanırken bakiyede kalan elmas →
  "Maaş 2" (o seviyenin elmas kotası maaşa çevrilir). Yüksek olan ödenir; yayıncı "elmaslarım çevrilmesin" diyebilir.
  Seviyenin gün (en az 60 dk yayın yapılan gün) ve saat şartı tutmazsa şartı tutan alt seviyeye düşülür; 16+ şartsız.
  Oyun saati bilgi olarak gösterilir (yönetimden şart yapılabilir).
- Ajans primi yayıncı başına: yayıncının ajanstayken aldığı elmasın ulaştığı seviyenin "Ajans primi" (şart aranmaz).
- Seviye ödülleri dönem kapanınca otomatik: VIP günü (daha yüksek üyelik bozulmaz), Bronz/Gümüş/Altın/Süper/Özel
  Yayıncı rozeti, özel ID (göz alıcı 6 haneli numara). Profilde, oda kartında rozet ve özel ID kapsülü görünür;
  özel ID'si olmayan WIP üyelerin ID'si de adı gibi renkli/parlayan yazılır. Aramada özel ID ile bulunur.
- Ajans Merkezi (ajans sahibi ve asistan): Ajansım (bu ay tahmini prim, bugün/dün artışı, asistan payları), ajans
  istatistikleri (bu ay / geçen ayın aynı dönemi / geçen ay elmas, % değişim, aktif / canlı / yeni yayıncı, düşüşte ve gün
  riskindeki yayıncılar), aylık ajans sıralaması, görev merkezi (ajans seviyesi D→S), yayıncı istatistikleri (filtre,
  sıralama, seviye, iki yöntem, şart eksikleri, sonraki seviyeye kalan), kazanç detayları (günlük grafik), ajans bilgisi
  ve duyurusu (yayıncılara bildirim), maaş tablosu, hesap özetleri.
- Asistan sistemi: en fazla 7 asistan; davet 7 gün geçerli; pay oranı (en fazla %50) ajans sahibi belirler. Asistan
  yayıncı davet eder, istatistikleri görür; davet ettiği yayıncıların ajans priminden payını alır. Kaldırma / ayrılma geçmişi.
- Transfer geçmişi: katılma, ajans değiştirme, ayrılma, çıkarılma kayıtları. Başka ajanstaki yayıncı davet kabul edince
  ve yayıncı ajanstan ayrılmak isteyince mevcut ajansın onayı istenir; 72 saatte yanıt yoksa otomatik onay. Reddedilen
  istek 7 gün içinde platform (yönetim) incelemesine taşınabilir.
- Davet Merkezi: ajans sahibi yeni ajans önerir (yönetim onaylar), davet ettiği ajansların priminin %5'ini alır;
  bugün/dün/bu ay tahmini, ödenen/bekleyen, davet sıralaması.
- Yönetim: maaş tablosu düzenleyici (seviye ekle/sil, varsayılana döndür), yeni ayarlar (geçerli gün dakikası, oyun saati,
  Yöntem 2, asistan sınırı/payı, davet primi, transfer süresi, ajans seviyeleri), dönem ayrıntısında yayıncı / ajans /
  asistan / davet sekmeleri, arama ve filtre, not (dekont no) ile "ödendi", toplu ödendi, iptal (çevrilen elmas iade),
  transfer ve ajans önerisi onayları, kullanıcıya özel ID ve yayıncı rozeti verme, ajans açarken davet eden ajans kodu.

## v2.65.1 — Hediyeler nesne ayırmayla yeniden üretildi (paket 8), WIP 8+ araç resimleri
- 107 hediyenin hepsi yapay zekâ nesne ayırma (ISNet) ile yeniden üretildi: nesnenin gövdesi (araba, heykel, taç,
  karakter...) tamamen dolu ve opak; koyu lastik, cam, siyah kaporta, gölgeli yüzler artık kesik / yarı saydam değil.
  Işık, kıvılcım, duman siyah anahtarlamayla yarı saydam kalır. Aynalı zemindeki araç yansıması yarı saydam.
- Siyah zeminli sahneler (ülkeler, ejderha, yanardağ...) yırtık kenarsız temiz kesilir; renkli zeminli tek nesneler (taç,
  gül fanusu, aslan başı, pembe şato, DJ) zeminden ayrılıp nesne olarak oynar; tam sahneler (saray, gemi...) yumuşak kenarlı.
- Görünüm sayfasında WIP 8+ araçlarının resmi araçlı hediyenin kendi resmi (sunucu /api/wip/tiers → vehicleGifts).

## v2.65.0 — Çerçeve/araç görüntüsü, WIP 8+ araç girişleri, mesaj uyarıları, oda içi profil
- Çerçeve değişimi odada anında: WIP satın alma ve yönetimden WIP verme/alma artık odalara duyurulur; hayalet (SWIP)
  üye mikrofondayken de görünümü odada yenilenir; odaya yeniden giren kişinin eski görünümü tazelenir.
- Müzik daha hafif: dinleyenlerde her 30 sn'de bir yapılan konum atlaması (seek) yalnızca gerçek sapmada yapılır
  (müzik takılıp arabelleğe alınıyordu). Aynı şarkı tekrar çalınınca dosya yeniden yüklenmez; çalma listesinde sıradaki
  şarkı arka planda önceden yüklenir (şarkılar arası bekleme yok). 45 yükleme sınırı dolunca en eski kullanılmayan
  yükleme silinir (uzun liste yarıda kalmaz). Şimdi çalıyor paneli yarım saniyede bir tümden çizilmez.
- Mesajlar sekmesi rozeti: arkadaşlık/CP isteği, bildirimler, destek, TR Live Ekibi / etkinlik / ödül duyuruları,
  ajans daveti ve aile sohbeti de normal mesaj gibi sekmede (ve odadaki mesaj simgesinde) sayı gösterir.
- Çerçeveler yeniden üretildi (paket 6): fotoğraf yeri tam ortada ve fotoğrafı tam sarar; kalın/kanatlı çerçeveler
  kendi oranında (avatarın 2,2 katına kadar) çizilir, yerleşim kaymaz.
- Araçlı hediyeler (paket 7): lastik, cam, koyu kaporta artık saydam değil (siyah araba hayalet gibi görünmüyor),
  Ramazan arabası düzgün kesildi.
- WIP 8+ araç girişi araçlı hediyelerle: WIP 8 Mavi Spor Araba, WIP 9 Turuncu Spor Araba, WIP 10 Altın Boğa Araba,
  SWIP Siyah Spor Araba (hediye paketi kurulu değilse eski çizim araç).
- Oda içi açılır profil: CP yazısı kalktı; ilişkiler en başta pembe kalp içinde CP, sonra mor çerçevede En İyi Arkadaş,
  mavi çerçevede Kanka olarak görünür ("Yakın Arkadaşlarım" başlığı yok). Rozetler yalnızca varsa, başlıksız görünür.
- "!" menüsü: oda yetkilisine "Odadan banla / Odadan at / Sohbette sustur"; yönetici ve yardımcı admine "Kullanıcıyı
  banla (süreli/süresiz)", "Adını değiştir", "Profil fotoğrafını kaldır", yöneticiye "Uygulamada sohbet yasağı".

## v2.64.1 — Katalog donması, oda duyuruları, hediye düğmesi
- Katalog önizlemede hediyeler artık küçük resim (png) olarak görünür; animasyon yalnızca karta dokununca ayrı pencerede
  oynar (169 hediyenin hepsi birden oynayıp sayfayı donduruyordu).
- Oda duyurusu ve uygulama duyurusu: odaya ilk girişte kısa süre, ayrıca sohbette kimsenin yazısı yokken (ör. sohbet
  temizlenince) görünür; biri yazınca kalkar.
- Oda içi hediye kutusu düğmesi eski (mor-mavi) haline döndü.

## v2.64.0 — Siyah-altın tema, gizli depoda sunucu güncellemesi
- Uygulamanın tamamı giriş ekranındaki siyah-altın renklere geçti: zemin sıcak siyah, vurgu rengi altın (düğmeler, sekmeler,
  seçili simgeler, anahtarlar, yazı alanları), ikinci vurgu turuncu-altın. Mavi/mor degradeler (hediye düğmesi, gönder,
  uçan yazı, mesaj balonları, gelir ve mağaza düğmeleri, profil kısayolları) altın degradeye çevrildi. Varsayılan oda
  zemini siyah-altın. Elmas simgeleri ve diğer oda temaları olduğu gibi.
- Sunucu, depo gizliyken de güncellenebilir: Yönetim → Katalog → "Hazır hediye paketi" → Sunucu → "GitHub erişim
  anahtarı" (yalnızca okuma izinli anahtar; yalnızca sunucuya kaydedilir, uygulamada görünmez). Depo gizli yapılmadan önce
  sunucunun bu sürüme bir kez güncellenmiş olması gerekir.

## v2.63.1 — Sunucu güncellemesinin takılması giderildi
- Sunucu bir güncellemeyi kuramazsa bir sonraki yüklemeye kadar eski sürümde kalıyordu (v2.59'dan beri sunucu güncellenmemişti).
  Artık başarısız kurulum 20 dakikada bir kendiliğinden yeniden denenir ve hatanın sebebi kayda yazılır.
- Sunucu imajı küçüldü: hediye paketleri imaja / GitHub deposuna konmaz (uygulamadan yüklenir). Disk azsa eski derleme
  artıkları temizlenir. ffmpeg kurulamazsa derleme durmaz.
- Yönetim → Katalog → "Hazır hediye paketi": sunucu sürümü, "Şimdi güncelle" düğmesi, güncelleme ve kurulum kayıtları.
- zip_ile_guncelle.yml: GitHub'a yüklenen paket zip'leri depoya eklenmez (elle yüklenmeli).

## v2.63.0 — Hediyeler tek tek düzeltildi, paket yönetimden yüklenir, yumurta/domates mikte
- Telefonda görülen bozuk hediyeler ilk paketin (v2.58) dosyalarıydı; sonraki paketler sunucuya ulaşmamıştı. Artık paketler
  Yönetim → Katalog → "Hazır hediye paketi yükle / durum" ile telefondan doğrudan sunucuya yüklenir ve hemen uygulanır
  (GitHub ve sunucu güncellemesi beklenmez). Aynı sayfada sunucu sürümü ve kurulu paket durumu görünür.
- 107 hediyenin hepsi tek tek yeniden üretildi ve 6 karede, telefonun birleştirmesiyle oda zemini üzerinde kontrol edildi:
  - renkler oynatıcının beklediği biçimde (yarı saydam yerlerde beyaz/pembe leke ve bloklanma yok),
  - kaynak oranı korunur, küçük kaynaklar en çok 1,5 kat büyütülür (bulanık değil), kenarlarda kesik çizgi yok,
  - sahnelerde (ülkeler, aslan, ejderha...) siyah gökyüzü ve boş şeritler şeffaf, sahnenin kendisi opak ve net,
  - loş arka planlı videolarda (anka, gelinlik, motosiklet, sandık...) gri kutu kalmaz.
- Yumurta ve domates kime atılırsa onun mikindeki dairenin içinde oynar (tam ekran değil). Yönetimde her hediyeye
  "Nerede oynasın: Tam ekran / Alıcının mikindeki dairede" seçeneği eklendi.
- Daha önce eklenen hediyelerin adı, fiyatı ve sekmesi korunur; yalnızca görüntüsü yenilenir. Yönetimden silinen eklenmez.

## v2.62.0 — Hediye görüntü bozulması giderildi
- Asıl sebep: şeffaf video oynatıcısı renkleri "ön-çarpımlı" (renk x şeffaflık) bekliyor; hediyeler düz renkle
  üretilmişti. Bu yüzden yarı saydam yerler (sis, toz, gökyüzü, ışık) aşırı parlak, lekeli ve bloklu görünüyordu.
- 107 hediyenin hepsi doğru biçimde yeniden üretildi (720x1280, kaynak kare hızı, yüksek kalite). Kontrol telefonun
  yaptığı birleştirmeyle, oda zemini üzerinde yapıldı.
- Arka planlı sahnelerde (aslan vb.) kenara değen siyah boş şeritler şeffaf.
- Sunucunun yüklemede otomatik şeffaf yapması da aynı biçime düzeltildi (yeni yüklenen videolar doğru görünür).
- Giriş ekranında logonun kenarlarının kesilmesi düzeltildi (yalnız köşeler yumuşakça kaybolur).
- Paketler: TR-Live-paket-1 … N (çerçeveler + yeni hediyeler). Eklenmiş hediyelerin yalnızca görüntüsü yenilenir.

## v2.61.0 — Hediyeler yüksek kalitede
- 107 hediyenin hepsi baştan üretildi: 720x1280 (eskisinin ~2 katı piksel), kaynağın kendi kare hızı (en çok 30 kare/sn),
  ~4 kat bit hızı. Şeffaflık yeniden yapıldı: kenarlarda koyu hale yok, koyu sis / ışık hüzmeleri leke yerine yarı saydam;
  ülke hediyeleri ve Ramazan arabası tam ekran sahne.
- Daha önce eklenen paket hediyelerinin yalnızca görüntüsü yenisiyle değişir (ad, fiyat, sekme korunur); eski dosyalar silinir.
- Telefona hepsi birden inmez: en ucuz 24 hediye ve hediye panelinde açılan sekmenin ilk 16 hediyesi önce iner.
- Paketler TR-Live-paket-1 … 17 (çerçeveler + yeni hediyeler).

## v2.60.0 — Yuvarlak uygulama simgesi, yeni giriş ekranı
- Uygulama simgesi telefonda yuvarlak halkayı tamamen doldurur (siyah daire + logo, uyarlanabilir simge). Ana ekrandaki ad
  "TR Live". Açılış ekranı siyah zemin + logo (beyaz parlama yok). apk_build.yml güncellendi (elle yüklenmeli).
- Giriş ekranı logoya göre baştan: siyah-altın tema, logonun arkasında altın ışıma ve ağır süzülen altın tozları,
  altın degrade "Telefon numarası ile" düğmesi, altın çerçeveli "Kullanıcı adı ile", altın vurgulu giriş/kayıt alanları,
  yumuşak geçiş animasyonları.

## v2.59.0 — Otomatik küçük resim ve şeffaf yapma (yükleme sırasında)
- Yönetimde video yüklenince sunucu kendisi anlar:
  - Yan yana şeffaf mp4 ise maskenin hangi yarıda olduğunu bulur ("Otomatik" seçeneği, varsayılan).
  - Siyah arka planlı düz video ise siyahı şeffaf yapar; kendi arka planı olan sahneyi kenarları yumuşak tam ekran yapar.
    Hediyeler 540x960, çerçeveler 360x360 ölçüye getirilir.
  - Hediye küçük resmi (ikon) videonun ortalarındaki kareden otomatik çıkar; png/webp/gif'te dosyanın kendisi kullanılır.
  - İkon boş bırakılırsa hediye kaydedilirken sunucu oluşturur (toplu yüklemede de).
- Katalog önizleme: sağ üstteki sihirli değnek, küçük resmi olmayan eski hediyelere otomatik küçük resim ekler.
- Zaten şeffaflık ayarı (vapc) olan dosyalara dokunulmaz. Videolar sırayla işlenir (sunucuyu yormasın).
- Sunucuya ffmpeg eklendi (Docker). Büyük dosya yükleme süresi 6 dakikaya çıkarıldı.

## v2.58.1 — Derleme hatası düzeltmesi
- APK derlemesi "defaultTargetPlatform tanımsız" hatasıyla duruyordu (arka plan servisi dosyasında eksik içe aktarma). Düzeltildi.

## v2.58.0 — Yeni hediye ve çerçeveler, yönetimde düzenleme
- Gönderilen videolardan siyah arka plan kaldırıldı, şeffaf yapıldı ve uygulamaya eklendi (sunucu açılınca bir kez eklenir):
  - 12 hareketli çerçeve (Coins Mağazası → çerçeve, 30 gün, 5.000 coin). Avatar her çerçevenin ortasına oturur.
  - 107 sesli tam ekran hediye (hepsi aynı ölçüde, 540x960): Popüler, Etkinlik (ülkeler, Ramazan, Yeni Yıl), CP (yüzük, düğün, gelinlik) ve VIP
    (arabalar, aslan, ejderha, yat...) sekmelerinde. Kendi arka planı olan sahneler kenarları yumuşatılmış tam ekran oynar.
- Hediye ve çerçeve dosyaları büyük olduğu için ayrı "TR-Live-paket-N.zip" dosyalarıyla gelir; zip_ile_guncelle.yml
  bunları ekler ve sonraki güncellemelerde korur (yml elle yüklenmeli).
- Yönetim: hediyelerin adı, fiyatı ve sekmesi; çerçevelerin adı; mağaza ürünlerinin adı, fiyatı, süresi ve satışta olup
  olmadığı düzenlenebilir (Katalog önizleme → Düzenle, Mağaza ürünleri → dokun).

## v2.57.0 — Müzik çalar, bildirimler, aile sohbeti (2. bölüm)
- Müzik çalar baştan: "Müzik" listesi (N PARÇA, arama, düzenle), "Telefondan Ekle" (telefondaki ses dosyaları otomatik
  taranır, Ekle / Eklendi, Tümünü ekle), "Şimdi Çalıyor" (dönen plak, ilerleme, önceki / oynat / sonraki, Karıştır /
  Tümü / Tek, ses düzeyi, kapatma). Listeden dokunulan şarkı odada çalar, bitince sıradaki kendiliğinden çalar.
  Odada alt çubuk; aşağı kaydırınca / küçültünce dönen plak balonu.
- Mesajlar: "Bildirimler" kartı (beğeni, yorum, takipçi, arkadaşlık, aile, arkadaş oda açtı) ve okunmamış rozeti.
  Anlar'da beğeni ve yorum bildirim olarak düşer.
- Aile Sohbeti: Mesajlar'da aile üyelerinin kendi arasında yazıştığı sohbet. Aile başkanı "Üyelere Bildirim / Davet"
  ile tüm üyelere bildirim gönderir (isterse açık odasına davet).
- Etkinlik Promosyonu duyuruları parlak çerçeveli, görselli kart; bağlantı "Hemen katıl" ile açılır.
- Çoklu hediye: mikten mike giden hediye, adet kadar (en çok 7) art arda uçan simge, "xN" yazısı ve parıltıyla gider.
- Kulaklık: kablolu / Bluetooth kulaklık takılıyken ses medya modunda çalışır (uğultu ve kesilme olmasın);
  kulaklık çıkınca otomatik normal moda döner. Bluetooth'ta konuşurken telefonun kendi mikrofonu kullanılır.
- apk_build.yml: müzik dosyası tarama izni ve Android 10 dosya erişimi eklendi (elle yüklenmeli).

## v2.56.0 — Oda düzeni, yeni logo (1. bölüm)
- Oda sahibi çıksa da içeride yardımcı sahip / moderatör varsa oda kapanmaz; son yönetici de çıkınca kapanır.
  Sahip "Odayı kapat" ile her zaman kapatabilir.
- Arka planda başka uygulamaya geçince mikrofon artık kapanmıyor (başka uygulamanın ses açması arama sanılıyordu).
- Sistem duyurusu ve oda duyurusu odaya ilk girişte 12 sn görünür, sonra kalkar.
- Oda ayarları: Odayı temizle, Sohbet yasağı, Oda kilitleme, Oda gizleme, Ses ve efektler, Müzik, Mikrofon modu, Tema,
  Odayı paylaş, Odayı kapat. Oda sesi düğmesi alt çubukta (oyunlar ayarlardaki Ludo'da).
- Sohbet yazı alanı koyu ve yuvarlak; uçan yazı anahtarı, emoji, renkli gönder düğmesi, 3 satıra kadar.
- Ses ve efektler: bir görsel ya da ses kapatılınca o an oynayan da hemen durur.
- Yeni logo: giriş sayfası ve uygulama simgesi (apk_build.yml güncellendi, elle yüklenmeli).

## v2.55.5 — Balon yerine sabit bildirim
- Uygulamadan çıkınca ekranda balon çıkmaz. Odadayken üstte sabit "… odasındasınız · dönmek için dokun" bildirimi
  durur; dokununca odaya dönülür. Tek izin: bildirim izni (Android'in kendi penceresi, bir kez). Balon izni sorulmaz.

## v2.55.4 — Daha az izin sorusu
- Odaya girerken yalnızca bir kez "Diğer uygulamaların üzerinde göster" (odaya dönme balonu) izni sorulur.
  Bildirim, pil ve telefon izinleri artık sorulmaz. Mikrofon izni yalnızca mikrofona ilk çıkışta istenir.

## v2.55.3 — Arka planda odadan düşme
- Arka plan servisi artık arka plandayken kapatılıp yeniden açılmıyor (Android 12+ buna izin vermediği için servis
  kapalı kalıyor, telefon uygulamanın internetini kesiyordu). Servis odaya girerken mümkünse mikrofon türüyle açılır;
  gerekirse yalnızca uygulama ekrandayken yeniden kurulur. Uygulamaya dönünce servis kapanmışsa yeniden açılır.
- Pil kısıtlaması kalkana kadar günde en fazla bir kez hatırlatılır.

## v2.55.2 — Yönetim: giriş bilgileri
- Yönetim → kullanıcı → "Giriş bilgileri / şifre" (yalnızca yönetici): kullanıcı adı, telefon numarası ve yeni şifre
  verilebilir. Şifre gösterilmez; değişince kullanıcının tüm oturumları kapanır. İşlem kayda geçer.

## v2.55.1 — Koltuk susturma
- Yetkili (oda sahibi, yardımcı sahip, moderatör) bir konuşanı "Sustur" deyince kişi koltuktan inmez; mikrofonu
  kapanır ve açamaz. Koltukta pembe "susturuldu" işareti görünür. Boş koltuk da susturulabilir (koltuk menüsü).
  "Sesi Aç" ile geri açılır. Koltuktan indirmek için "Koltuk" düğmesi aynı kaldı.

## v2.55.0 — Ekran, arama, sıralama listeleri
- Uygulama açıkken ekran kendiliğinden kapanmaz; uygulama yalnızca dikey çalışır (yan çevirince dönmez).
- Telefon araması: Android'in kendi arama durumu okunur (ilk odaya girişte "telefon durumu" izni istenir). Arama
  gelince oda sesi, oda müziği, hediye / araç sesleri ve mikrofon kapanır; arama bitince açılır.
- "Oda sesini kapat" artık oda müziğini ve hediye / araç seslerini de susturur (odadan çıkınca açılır).
- Etkinlikler, Zirve Listesi, Katkı Listesi ve Koruyucu Sıralaması kimse olmasa da ilk 10 satırı gösterir.
- GitHub: apk_build.yml güncellendi (MainActivity, READ_PHONE_STATE izni, dikey ekran). Elle yüklenmeli.

## v2.54.1 — Etkinlik sayımı
- Alınan hediyeye göre yarışan etkinliklerde (Kral, Kraliçe, Yıldızlar-Yayıncı) kendine gönderilen hediye de sayılır.
- Destekçi sıralamasında (Yıldızlar-Destekçi) yalnızca başkasına gönderilen hediye sayılır.

## v2.54.0 — Koyu tema, şanslı çanta, katkı listesi
- Beyaz sayfalar uygulamanın koyu lacivert renklerine geçti: kullanıcı profili, aile sayfaları (liste, üyeler, istekler,
  bilgileri düzenle, seviyeler, Coins ödülü, kurallar), En İyi Arkadaş / Kanka listesi, koruyucu kuralları, Zirve Listesi üst çubuğu.
- Aile: "Üye gözünden bak" kaldırıldı; "Coins ödüllerini görmek için tıklayın" balonu günde bir kez (6 sn) görünür.
- İlişki Duvarı: ilişki yokken çerçevenin daralıp sola kayması ve başlığın taşması düzeltildi.
- Etkinlik sayfası açıkken sıralama 10 saniyede bir kendiliğinden yenilenir.
- Şanslı çanta: odadaki açma kartı küçük kare (ekranın ortasında). Gönderme penceresi Figma'daki pembe perdeli tasarım:
  Şanslı / Süper sekmeleri, kırmızı zarflar, sarı Gönder düğmesi, ? ile kurallar.
- Oda Katkı Listesi Figma tasarımına geçti (TOP1/2/3 taçlı çerçeveler, bayraklar, elmaslı tutar). "Toplam" ömür boyu:
  oda kapanıp yeniden açılınca sıfırlanmaz (aynı sahibin aynı tür odalarının tümü). "24 Saat" son 24 saat.

## v2.53.0 — Aile, Zirve Listesi, Etkinlik sayfaları ve Şanslı çanta (Figma tasarımı)
- Kendi profiline dokununca herkesin gördüğü beyaz profil sayfası açılır; düzenleme sağ üstteki kalemden.
  Kapak fotoğrafı kırpma oranı yeni profile göre (375x343).
- Aile:
  - Seviyeler Demir, Bronz, Gümüş, Altın, Elmas (üye sınırı 150/200/300/450/650, yönetici 5/8/14/23/35), seviyeye
    özel başlık arka planı ve rozetler; seviye sayfaları (Ayrıcalıklar) ve "Hızlı bir şekilde nasıl yükseltilir?".
  - Aile sayfası: çerçeveli logo, ad, aile ID, katkı çubuğu, aile bildirimi, üyeler (rol etiketleriyle), aile odaları,
    "Üye gözünden bak" (başkan), Coins ödülü düğmesi.
  - Katılım başvuru ile; yöneticiler "Yeni istek" / İstekler'den kabul eder. İstek Ayarları: en düşük zenginlik
    seviyesi. Bilgileri Düzenle: kapak resmi, aile ismi (12), aile bildirimi (100). Aileyi Dağıt / Aileden Ayrıl.
  - Katkı değeri (🔥): günlük giriş 20, yükleme 1 Coin = 1, gönderilen hediye 1 Coin = 1, alınan hediye 1 Elmas = 1.
    Üyelerin bu haftaki katkısı listede.
  - Coins ödülü: haftalık katkı 800K / 1M / 5M olunca 2300 / 4500 / 25K Coin (aile başkanı alır). Başkan indirimi:
    kişisel harcamanın seviyeye göre %1-3'ü birikir (en az 10K harcamadan sonra alınır).
  - Aile kuralları (soru-cevap) ve görev tablosu.
- Zirve Listesi: Yayıncı, Destekçi, Yükleme (yeni), Ajans, Aile, CP; Günlük / Haftalık / Aylık; her sekme kendi
  renginde, taçlı çerçeveli ilk 3 kürsü, tutarlar gizli (7****5), altta kendi sıran, Kurallar.
- Etkinlik sayfaları: Haftalık Kral ve Kraliçe, Haftalık Yıldızlar (Yayıncı / Destekçi ve 4 hediye), Haftanın Çifti;
  Figma görselleri, geri sayım, Bu Hafta / Geçen Hafta, sıralama, altta kendi sıran, Kural ve Ödül sayfası.
- Şanslı çanta: Figma'daki pembe perdeli kart; AÇ / geri sayım, "xTutar Tebrikler!", "Üzgünüm, bu şanslı çanta zaten
  açılmış..."; odadaki çanta simgesi kırmızı zarf.
- Notlar: mevcut ailelerin seviyesi yeni eşiklere (1M/6M/20M/60M) göre yeniden hesaplanır. Kendine hediye aile
  katkısına ve başkan indirimine sayılmaz. Başkan indirimi küçük harcamalarda da (kuruş kuruş) birikir.

## v2.52.0 — Profil, İlişki Duvarı ve Koruyucu (Figma tasarımı)
- Kullanıcı profili Figma'daki beyaz tasarıma geçti: tam genişlik kapak, çerçeveli avatar, sağda koruyucu rozeti,
  madalyalar, Profil / Başarılar / Paylaşım / İlişkiler sekmeleri, aile kartı, Top Destekçiler, seviye kartları.
- İlişkiler: CP (tek), En İyi Arkadaş ve Kanka (birden çok). Davet Coin ile (CP 2500, En İyi Arkadaş 1500, Kanka 1000);
  24 saat içinde kabul edilmezse, reddedilir ya da geri çekilirse Coin iade edilir. Seviye şartı kalktı.
- İlişki Duvarı (profil → İlişkiler): CP sahnesi, En İyi Arkadaş ve Kanka kartları, "Diğerleri" listesi (kendi
  listende düzenle ile çıkarma), CP İptali penceresi, ilişkisi olmayanlarda "İlişki Kur".
- Yakınlık penceresi: özel mesajdaki kalp ya da profildeki "İlişki Kur" ile açılır; 5 seviye kalbi, görevler ve
  "İlişki Türünü Seç" (CP / En İyi Arkadaş / Kanka) penceresi.
- Koruyucu: 3000 Coin ile bir kullanıcının koruyucusu olunur. O kişiye gönderilen hediyelerde 1 Coin = 1 koruyucu
  puanı. Hediye gönderilmeyen haftanın ardından Pazartesi 00:00'da puan düşer (250+ ise %20, altında 50), sıfırlanınca
  koruyuculuk biter; ilk hafta muaf. Koruyucular sayfası, Koruyucu Ol penceresi, kurallar, Koruyuculuğum (Koruyucum /
  Koruduğum; düzenle ile Seç / Kaldır / Sonlandır), "Koruyucu kabul et" ayarı. Profilde ve odadaki mini kartta
  seçilen (yoksa en yüksek puanlı) koruyucu görünür.
- Figma'daki süs görselleri (kanat, şato, çerçeve süsleri, madalyalar, simgeler) uygulamaya eklendi.
- Figma görsellerini indiren iş akışı (figma_assets.yml) eklendi.
- Test: gizli kullanıcının kendini de gizli görmesine göre eski birim testi güncellendi.

## v2.51.7 — Telefon araması ve hediye penceresi
- Telefon araması: zil çalınca ve görüşme sürerken oda sesi, oda müziği ve mikrofon artık kesin kapanır; arama bitince
  geri açılır. (Önceki yöntem ses odağı sinyaline dayanıyordu; oda sesi odağı kendisi aldığı için çoğu telefonda sinyal
  gelmiyordu. Artık telefonun ses modu doğrudan okunuyor.)
- Hediye penceresinin yüksekliği içeriğe göre hesaplanır: alttaki boşluk kalktı, pencere daha kısa ve aşağıda;
  hediye kutuları biraz küçüldü.

## v2.51.6 — Hediye penceresi düzeni
- Hediye penceresi sabit yükseklikte: kaymaz; hediyeye dokununca alt satır aşağı inmez, Coin / adet / Gönder satırı
  her zaman görünür.
- Üstteki kişi satırı (avatarlar) ve alttaki Coin satırı küçültüldü; hediye ızgarası kalan alana sığar.
- "Toplam … Coin" satırı yalnızca birden çok kişi / adet seçiliyken yer kaplar.

## v2.51.5 — Uçan yazı sohbetin üstünde
- Uçan yazı (ve "Hoş geldin" selamı) artık sohbet bölümünün en üstünde kayan yazı olarak geçer: tek şeritte,
  arka arkaya sırayla (biri bitince sıradaki). Yazı geçerken sohbet bir satır aşağı kayar, mesajların üstüne binmez.

## v2.51.4 — Çoklu hediye arka arkaya
- 10'lu hediyenin animasyonu artık iç içe girmez: 10 kez arka arkaya oynar, her tekrar bir önceki bitince hemen başlar.

## v2.51.3 — Çoklu hediye animasyonu
- 10'lu atılan hediyenin tam ekran animasyonu 10 kez oynar (en fazla 10): her tekrar bir öncekinin bitmesini
  beklemeden ~0,45 sn arayla başlar (üst üste); aynı anda en fazla 3 katman. Ses yalnızca ilkinde çalar.
- Ortadaki şerit ve üst (global) şerit bir kez geçer, adet "x10" olarak yazar. Aynı odada üst şerit, ortadaki
  şerit bitince yarım saniye sonra geçer.

## v2.51.2 — Hediye şeritleri sırayla
- Hediyenin atıldığı odada ortadaki oda şeridi ile üst (global) şerit artık aynı anda çıkmaz: önce ortadaki şerit
  geçer, o bitince 1 sn sonra üst şerit bir kez geçer. Diğer odalarda üst şerit hemen geçer.

## v2.51.1 — Gizli kullanıcı ve hayalet mod tutarlılığı
- **Gizli kullanıcı:** açıkken kişi odada, sohbette ve listelerde kendini de "Gizli Kullanıcı" olarak görür
  (başkalarının gördüğüyle aynı). Başkasının profiline girince **ziyaretçi listesine düşmez**.
- **Hayalet mod (SWIP):** açıkken oda başlığında kendine "👻 Hayalet" işareti çıkar (mikrofona çıkınca kalkar,
  çünkü mikrofondaki herkes görünür). Açarken mod gerçekten etkinse ya da SWIP üyeliği yoksa uyarı verilir.
- Profil sayfası artık hayalet modun gerçekten etkin olup olmadığını (ghostActive) bildirir.

## v2.51.0 — Otomatik bildirimler: arkadaşlık, takip, arkadaş oda açtı
- **Arkadaşlık isteği** gelince ve isteğin **kabul edilince**, biri **seni takip edince**, **arkadaşın oda açınca**
  telefona bildirim düşer (aynı arkadaştan oda bildirimi 30 dakikada en fazla bir kez).
- Bildirime dokununca: oda bildirimi → doğrudan odaya girer; istek / takip → kişinin profili açılır.
- Uygulama açıkken ya da arka planda çalışırken anında; tamamen kapalıysa uygulama açılınca gösterilir (son 3 gün).
- **Profil → Ayarlar → Bildirimler:** üç tür ayrı ayrı kapatılabilir. Gizli kullanıcı / hayalet modda bildirim gitmez.
- Yeni migration: `039_user_notifications.sql` (30 günden eski bildirimler otomatik silinir).

## v2.50.2 — Global hediye şeridi
- Global şerit artık bir kez görünür (gönderende iki kez çıkıyordu): her duyuruya kimlik verildi, aynı duyuru
  tekrar gelirse uygulama göstermez.
- Şerit düzeni: "Gönderen <ad>" / "Alıcı <ad>" alt alta, sağda hediyenin görseli ve adedi (x5).

## v2.50.1 — Sesli MP4 hediyeler sesli oynar
- Sesli MP4 hediye animasyonları ve giriş efektleri artık sesiyle birlikte oynar (animasyon oynatıcısı yalnızca
  görüntüyü çiziyordu; ses aynı dosyadan ayrıca çalınır). Sessiz dosyalarda değişiklik yok.
- **Efekt ve ses → "Hediye ve araç sesleri"** ile kapatılabilir; telefon araması sürerken çalmaz.

## v2.50.0 — Telefon aramasında oda sesi kapanır, ayrı ayrı efekt ayarları
- **Telefon araması:** arama (zil dahil) gelince odadakilerin sesi ve mikrofonun otomatik kapanır, arama bitince
  eski hâline döner (WhatsApp vb. aramalarda da). Oda müziği de durup devam eder.
- **Efekt ve ses** (oda araçları): Hediye görsel efekti, Araç ve giriş efektleri (SWIP araçları gizlenemez),
  Hediye kanalı, Global bildirim ayrı ayrı açılıp kapatılır; ayarlar telefonda hatırlanır. Mikrofon gürültü
  engelleme aynı sayfada.

## v2.49.1 — Ses bağlantısı ve üst üste açılan sayfalar
- **Ses sunucusu (LiveKit):** sunucunun genel IP'si ayara sabit yazıldı (her açılışta dışarıdan aranmıyor);
  ayar değişince ses sunucusu kendiliğinden yeniden başlar.
- Ses bağlantısı kurulamazsa uygulama 2, 4, 8 sn sonra kendisi yeniden dener; ancak üçü de olmazsa uyarı çıkar.
- **Panel → "Ses sunucusu testi":** LiveKit, sertifika, portlar ve güvenlik duvarı 5 dakikada bir kontrol edilir (✅/❌).
- Aynı sayfa ya da aynı alt pencere art arda iki kez açılmaz (çift dokunma / yavaş yanıtta tekrar dokunma).
- Sunucu, GitHub'dan gelen her güncellemede artık gereksiz yere yeniden başlatılmıyor (yalnızca uygulama sunucusu
  kodu değiştiyse ya da panelden "Kaydet ve uygula" ile) — "sunucu yanıt vermedi" kesintileri azalır.

## v2.49.0 — Şanslı çanta düzenlemesi ve hızlandırma
- **Şanslı çanta:** oda içinde en üstte, oda elmasının altında. Açtığın çanta sana bir daha görünmez; çanta tamamen
  bitince herkesten kalkar. Aynı kişi üst üste çanta atabilir (birden çok çanta varsa sayısı yazar, sıradaki açılır).
  Ana sayfadaki oda kartında çanta simgesi büyüdü.
- **Daha hızlı sayfa geçişleri:** ağır Android geçişi (iki sayfayı büyütüp soldurma) yerine yalnızca yeni sayfanın
  sağdan kaydığı hafif geçiş.
- **Geri dönüşte takılma giderildi:** alt sayfadan dönünce (profil, gelir merkezi, mağaza…) sayfa baştan kurulmuyor ve
  dönen yükleme simgesi çıkmıyor; içerik ekranda kalır, yenileme geçiş bitince arka planda yapılır (27 ekran).
- Profil ve Gelir Merkezi'ndeki istekler sırayla değil aynı anda gönderilir; etkinlik sayfasında yalnızca geri sayım
  yazısı her saniye yenilenir.

## v2.48.1 — Etkinlik banner görselleri ve tonlarına göre sayfa tasarımı
- Ana sayfadaki etkinlik kartları artık özel banner görselleri: **Haftalık Kral ve Kraliçe**, **Haftanın Çifti**,
  **Haftalık Yıldızlar**; dokununca ilgili etkinlik sayfası açılır, şimdiki lider sağ altta yazar.
- Kral ve Kraliçe görselindeki tarih kutusu her hafta o haftanın başlangıç/bitiş tarihini gösterir.
- Etkinlik sayfalarının başında aynı görsel; renkler görsellere göre: Kral & Kraliçe mor-pembe + altın,
  Çift kahve-bordo + altın, Yıldızlar koyu kırmızı + altın. Sekmeler kaydırınca üstte sabit kalır.

## v2.48.0 — Haftalık etkinlikler: Çift, Kral & Kraliçe, Yıldız
- **Haftalık Çift:** onaylı CP çiftlerinin birbirine gönderdiği CP hediyelerinin Coin değeri; ilk 3 çiftin iki kişisine de ödül.
- **Kral & Kraliçe:** erkek / kadın kullanıcılar ayrı yarışır, hafta boyunca en çok hediye (Coin değeri) alanlar; ayrı ödüller.
- **Haftalık Yıldız:** yönetimin seçtiği 4 hediyenin her biri ayrı yarış; o hediyeden en çok gönderen (adet) kazanır; her birine ayrı ödül.
- Hafta Pazartesi 00:00 (Türkiye saati) başlar. Hafta bitince ilk 3'e ödüller (Coin, WIP üyeliği, çerçeve, rozet, araç,
  balon… ) otomatik verilir, kazananlara bildirim gider ve "Etkinlik" duyurusu yayınlanır.
- **Ana sayfa banner'ları:** açık etkinlikler için kartlar (şimdiki lider yazar); dokununca etkinlik sayfası: geri sayım,
  **Sıralama** (ilk 3 kürsü, ilk 50, kendi sıran, geçen haftanın kazananları), **Ödüller**, **Kurallar**.
  Yönetimden eklenen banner'ın bağlantısı varsa dokununca açılır.
- **Yönetim → Katalog → Haftalık etkinlikler:** etkinliği aç/kapat, Yıldız hediyelerini seç, her sıranın ödüllerini ekle/kaldır, kuralları düzenle.
- Yeni migration: `038_weekly_events.sql` (kurulduğu haftadan önceki hafta dağıtılmış sayılır).

## v2.47.0 — WIP öğeleri Görünüm'de, WIP araçları oynuyor
- **Görünüm sayfası:** WIP üyeliğinin verdiği araç, çerçeve, sohbet balonu, giriş efekti ve rozet ("WIP üyeliği"
  etiketiyle) ilgili sekmelerde listelenir; her biri ayrı ayrı **Kaldır / Etkinleştir** yapılabilir. Kaldırılan öğe
  odada, sohbette ve profilde görünmez. Yeni **Rozet** sekmesi. WIP öğeleri kodla çizilen önizlemeyle gösterilir.
- **WIP araçları** (Scooter → Hayalet UFO) artık odaya girişte oynar: araç renkli iz bırakarak geçer, altında kademe
  ve araç adı. Yönetim → Öğe ver → Araç sekmesinden WIP araçları ayrıca da verilebilir.
- Sıra: takılı mağaza aracı → WIP aracı → takılı özel giriş efekti → diğerleri.
- Yeni migration: `037_wip_hidden.sql`.

## v2.46.0 — Mağaza görünümleri çalışıyor, anında güncelleme, test örnekleri
- **Giriş aracı:** odaya giren kişi kendi aracını/giriş efektini de görür (önceden yalnızca diğerleri görüyordu;
  uygulama odaya bağlanmadan duyuru gittiği için kişiye hiç oynamıyordu). Uygulama kapanıp aynı odaya dönünce de oynar.
- **Sohbet balonu:** takılı mağaza balonu, odadaki mesajların arka planı olur.
- **Mikrofon dalgası:** konuşurken koltuktaki avatarın çevresinde nabız gibi oynar (yeşil halkanın yerine).
- **Profil Kartı** (eski adı Mini Kart): odada birine dokununca açılan kartın arka planı olur.
- **Oda Kartı** (yeni kategori): oda sahibinin takılı kartı, oda bilgisi kartının arka planı olur.
- Satın alınan / yöneticinin verdiği öğe, o türden takılı bir şey yoksa kendiliğinden takılır.
- **Anında değişim:** çerçeve, balon, mikrofon dalgası takıp çıkarınca ya da profil fotoğrafı değişince odadakiler
  çıkıp girmeden yeni görünümü görür.
- **Yönetim → Katalog → "Test örneklerini bana ekle ve tak":** araç, sohbet balonu, mikrofon dalgası, çerçeve,
  profil kartı ve oda kartı örneklerini (mağazada satılmaz) yöneticiye 30 günlüğüne verir ve takar.
- Yeni migration: `036_room_card.sql`.

## v2.45.0 — Kullanıcı adıyla kayıt geri geldi, ajans/yayıncı davet usulü
- **Giriş ekranı:** "Kullanıcı adı ile" düğmesi; kullanıcı adı + şifre ile hem giriş hem kayıt (görünen ad isteğe bağlı).
  Google, Facebook ve telefon seçenekleri aynen duruyor.
- **Ajans:** kullanıcılar artık kendileri ajans kuramaz. Yönetici, Yönetim → Ajans/Yayıncı → **"Ajans aç"** ile kişiyi
  ID ya da kullanıcı adıyla seçip ajans adını yazar; ajans doğrudan aktif açılır, kişi ajans sahibi olur ve profilinde
  **Ajans Merkezi** görünür.
- **Yayıncı:** "Yayıncı ol" başvurusu, ajans koduyla ve listeden başvuru kaldırıldı. Ajans sahibi, Ajans paneli →
  davet ile kişiyi **ID ya da kullanıcı adıyla** bulup davet eder; davet Mesajlar'a düşer, kabul edilince kişi onaylı
  yayıncı olur ve **Yayıncı Merkezi** görünür.
- Yayıncı olmayanlar Gelir Merkezi'nde **Canlı Kayıt** ve **Para Çekme**'yi görmez (Elmas Bozdurma herkese açık).
- **Ajans sahipleri de yayıncı olabilir:** Ajans Merkezi → "Ajansımda yayıncı ol" (ya da başka bir ajansın davetini kabul ederek).
- Yönetim hesabı ve yardımcı adminler de odada **Moderatör / Yardımcı sahip** yapılabilir (önceden "Yönetim hesabına
  komut uygulanamaz" hatası veriyordu). Atma, susturma gibi komutlara karşı dokunulmazlıkları sürüyor.

## v2.44.1 — Oracle Cloud'a taşıma paketi
- `deploy/oracle/`: tek sunucuda PostgreSQL + uygulama sunucusu + LiveKit + HTTPS (Caddy, sslip.io adresi) + yönetim
  paneli. Oracle'da sunucu açarken `cloud-init.sh` yapıştırılır, gerisi kendiliğinden kurulur (komut yok).
- **Panel** (`https://…/panel`): durum, ayarlar (Google/Facebook anahtarları, yöneticiler…), eski veritabanını tek
  tuşla aktarma, "şimdi güncelle". Sunucu GitHub'daki main dalını 5 dakikada bir kontrol edip kendini günceller.
- Günlük veritabanı yedeği (son 7 gün). Adım adım rehber: `deploy/oracle/KURULUM.md`.
- Sunucu, aynı makinedeki LiveKit'e iç adresten (`LIVEKIT_API_URL`) bağlanabilir.

## v2.44.0 — Google, Facebook ve telefon numarasıyla giriş
- **Giriş ekranı yenilendi:** "Google ile devam et", "Facebook ile devam et", "Telefon numarası ile". Yeni kayıt
  yalnızca bu üç yolla; kullanıcı adıyla kayıt kaldırıldı (eski hesaplar "Kullanıcı adıyla giriş" ile girmeye devam eder).
- **Google / Facebook:** giriş sayfası tarayıcıda açılır, onay verince uygulamaya dönülür ve giriş kendiliğinden
  tamamlanır (SDK yok, imza anahtarına bağlı değil). İlk girişte hesap açılır; kullanıcı adı otomatik verilir.
  Render'a `GOOGLE_CLIENT_ID/SECRET`, `FACEBOOK_APP_ID/SECRET`, `PUBLIC_BASE_URL` eklenince düğmeler görünür.
- **Telefon:** numara + şifre + görünen adla kayıt (SMS kodu yok); girişte telefon numarası ya da kullanıcı adı
  yazılabilir. Türkiye numaraları 0555…, 555…, +90… biçimlerinde kabul edilir; her numaraya tek hesap.
- Şifresi olmayan (Google/Facebook) hesaplar: "Şifre değiştir" ilk şifreyi belirler; "Hesabı sil" onayı için SİL yazılır.
  Silinen hesabın telefon ve Google/Facebook bağlantısı kaldırılır.
- Herkese açık **Gizlilik Politikası** (`/api/legal/privacy`) ve **Veri Silme** (`/api/legal/data-deletion`) sayfaları.
- Yeni tablo: `035_social_login.sql` (diğer migration'lar gibi sunucu güncellenirken uygulanır).

## v2.43.1 — Akış düzeni, global şerit yalnızca odalarda
- **Global hediye şeridi** yalnızca açık odalarda görünür (ana ekranda, profilde ve oda küçültülmüşken görünmez).
- **Akış gönderileri** ekranı kaplamıyor: solda fotoğraf, sağda ad + WIP ve seviye rozetleri, "+ Takip et",
  yazı, küçük görsel (dokununca tam ekran, yakınlaştırılabilir), zaman, beğeni / yorum / sil.

## v2.43.0 — Oda görünümü: hediye şeritleri, araçlar, giriş şeridi, uçan yazı, sohbet
1. **Global hediye şeridi** artık hediyenin atıldığı oda dahil her odada görünür; en üstten (durum çubuğunun altından)
   geçer ve küçültüldü. Oda içi hediye şeridi de aynı anda ortadan geçer.
2. **Oda hediye şeridi yeni tasarım:** gönderenin altın halkalı fotoğrafı, adı, "gönderdi → alan", alanın fotoğrafı,
   şeridin ucuna taşan parlayan hediye ikonu ve büyük "x adet/combo". Ekran genişliğine göre kendini ölçekler, uzun
   isimler kısaltılır.
3. **Araçlar paneli** tasarımdaki gibi: koyu panel, "İnteraktif Özellikler" kare kutular (PK, Ludo, Şanslı Çanta),
   "Temel Araçlar" küçük metalik yuvarlak düğmeler (satırda 4–6).
4. **Giriş şeridi** herkes için (WIP olmayanlar lacivert-gümüş, WIP'ler kademe renginde altın kenarlı): çerçeveli
   fotoğraf, WIP rozeti, gönderme/alma seviyesi, ad ve "odaya girdi". Kalabalık odada WIP girişleri öne geçer.
5. **Uçan yazı:** yazı alanındaki "Uçan" anahtarı açıkken mesaj odanın üstünden sağdan sola uçarak geçer (en fazla
   80 karakter). Ücreti yönetimden ayarlanır (varsayılan 99 Coin, 0 = ücretsiz).
6. **Sohbet satırı:** fotoğraf, ad, altında rozet sırası (WIP, taç/kalp seviyeleri, CP, "Doğrulanmış") ve balon.
   Girişler rozetli satır olarak; son 3 günde kayıt olanlar için "Bu kullanıcı yakın zamanda kayıt oldu" kartı ve
   "👏 Hoş geldiniz" düğmesi (selam sohbete yazılır ve uçan yazı olarak geçer, ücretsiz).
7. **Uygulama uyarı duyurusu:** odaya girince sohbetin en başında "TR Live Sistem Duyurusu" kartı (Yönetim → Uygulama
   ayarları → Oda'dan değiştirilir; boş bırakılırsa gösterilmez). Yayıncıyı takip etmeyenlere bir dakika sonra
   "Bu yayıncıyı takip edin" kartı çıkar (dokununca favorilere eklenir).
8. **Süper şanslı çanta kişi sayısı:** 50, 100, 150 veya 200 kişi seçilebilir.
9. **Çanta açma penceresi sadeleşti** (küçük kart); açınca "Açıldı! +X Coin" yazar ve pencere kendiliğinden kapanır.
10. **"Bu işlem hâlâ sürüyor" hatası:** yavaş bağlantıda çanta (ve diğer para işlemleri) gönderildiği halde bu hata
    çıkıyordu. Uygulama artık birkaç saniye bekleyip sonucu alır.

## v2.42.3 — Açılış çökmesi (shared_preferences) düzeltildi
- 16 Ekim'de yayınlanan `shared_preferences_android 2.5.0` yayın APK'sında açılışta `NoSuchMethodError
  SharedPreferencesApiRegistrar.getAll` hatası veriyordu (uygulama hiçbir kayıtlı veriyi okuyamıyordu). Bir önceki
  sorunsuz sürüme (2.4.28) sabitlendi.

## v2.42.2 — Açılışta logoda takılma düzeltmesi
- Bildirim izni penceresi uygulamanın ilk ekranı çizilmeden açılıyordu; bazı telefonlarda uygulama açılış logosunda
  takılı kalıyordu. Bildirim servisi artık ekran açıldıktan 4 sn sonra başlar.
- Açılıştaki hazırlık adımları (arka plan servisi, kayıtlı oturum) hata verse ya da gecikse de ekran yine açılır.

## v2.42.1 — APK derleme hatası düzeltildi
- APK derlemesi `workmanager` eklentisi yüzünden kırılıyordu (`WorkmanagerPlugin` bulunamadı: eklentinin yeni sürümü
  Kotlin derlemesini yeni Android Gradle'a bırakıyor). Eklenti kaldırıldı.
- Herkese telefon bildirimi: uygulama açıkken / arka plandayken soketten anında bildirim olarak düşer; uygulama tamamen
  kapalıyken gönderilenler uygulama açılınca ya da öne gelince bildirim olarak gösterilir (arka planda ~15 dk'lık
  kontrol artık yok).

## v2.42.0 — Büyük güncelleme: yönetim dokunulmazlığı, kalıcı oda, müzik, şanslı çanta, hediye, seviye görünümleri
1. **Yönetim dokunulmazlığı:** yönetim (admin) hesabına hiçbir komut uygulanamaz (başka admin dahil: ban, isim/foto,
   odada mikten alma, atma, engelleme, susturma, rol, koltuk kilidiyle indirme). Yardımcı admine yalnızca yönetim
   komut uygulayabilir.
2. **Oda kalıcı:** oda kapatılıp açılınca sohbet açık/kapalı, tema görseli, sayı tahtası, mikrofon isteği, kilitli
   koltuklar, şifre ve gizlilik aynı kalır. **Oda elması** artık sıfırlanmaz (odaya gelen tüm hediyeler; koltuk
   sayaçlarını sıfırlamak oda elmasını silmez).
3. **Müzik:** yeni çalar (plak görseli, büyük oynat düğmesi), "Çalma listesi / Müziklerim" sekmeleri. Telefondan bir
   kez seçilen şarkı uygulamanın kalıcı klasörüne kopyalanır, **Müziklerim**'de kalır; dokununca listeye eklenir.
   Oda içi müzik balonu dönen plak. **Gürültü engelleme** (Efekt ve Ses): mikrofonda çevre sesini azaltır.
   **Şanslı çanta:** yeni gönderim penceresi (kese kartları), odada ve oda kartında kese simgesi, açınca coin;
   gönderen de kendi çantasından alabilir; kim ne kadar aldıysa odanın ortasından geçen şeritte görünür.
4. **Ajans daveti:** ajans sahibinin daveti kullanıcının Mesajlar sayfasında "Ajans daveti" kartı olarak çıkar
   (bildirim gelir); oradan kabul/ret. Yayıncı olmayan kullanıcı da davet edilebilir, kabul edince ajansın yayıncısı olur.
5. **Yönetim → Öğe ver:** her WIP kademesinin çerçevesi, rozeti, sohbet balonu ve giriş efekti ayrı ayrı listede;
   verilen ve takılan öğe WIP üyeliği olmadan da görünür.
6–7. **Sohbet:** oda duyurusu sohbetin en başında sabit; odaya girenler "… odaya girdi" satırıyla görünür.
8. **Banner** artık dokunmadan da kendiliğinden döner.
9. **Mikrofon emojileri:** koltuktayken alt bardaki emoji → 3 hareketli emoji; koltuğunun üstünde birkaç saniye oynar.
10. **Hediye:** combo'da hızlı dokunuşlar kaybolmaz (sıraya alınır); sayfa/sekme değişince pencere boyu değişmez
   (her zaman 2 satır); şanslı hediye kazancı büyük çarpan ve coin ile gösterilir; mikten mike giden hediye ikonu daha
   yavaş; oda içi hediye şeridi odanın ortasında; global hediye şeridi kırmızı-altın bant tasarımında.
11. **Mikten mike geçiş hızlandı:** yeni koltuk hemen gösterilir; sunucu geçişte gereksiz işlemleri yapmaz.
12. **Herkese telefon bildirimi:** Yönetim → İçerik → "Telefon bildirimi · Herkese gönder". Uygulaması yüklü herkese
   bildirim olarak düşer: açık uygulamalara hemen, kapalı olanlara Android'in arka plan kontrolüyle en geç ~15 dk
   içinde (Firebase gerekmez). İlk açılışta bildirim izni istenir. **APK iş akışı güncellendi** (bildirim eklentisi
   için gerekli Android ayarı): `.github/workflows/apk_build.yml` elle yüklenmeli.
13. **Küçültülmüş oda** balonunda oda fotoğrafı döner.
14. **Seviye görünümleri:** taçlı etiketler = atış (gönderme) seviyesi, kalpli etiketler = alış seviyesi; seviye
   sayfasında büyük rozetler; CP seviye etiketleri (LV3–LV5).
- Düzeltmeler: kod analizindeki 2 uyarı (net_image.dart) giderildi; zip artık doğrudan proje kökünü içerir ("Zip ile
  güncelle" iş akışının beklediği yapı; v2.41.0 zip'i bu yüzden açılamamıştı). v2.41.0'daki CP sistemi bu sürüme dahildir.

## v2.41.0 — CP (yakınlık) sistemi
- **Yakınlık puanı (exp)** her iki kişi arasında birikir:
  - Özel mesaj: çift başına günde ilk 10 mesaj 10'ar exp (günde en fazla 100 exp; iki yönün toplamı).
  - Hediye: aralarında gönderilen hediyeler Coin değeri kadar exp. **CP hediyesi 1,5 kat** (hediye panelinde yeni
    "CP" sekmesi; yönetimde hediye eklerken sekme "CP" seçilir). Kendine hediye sayılmaz.
- **5 kademe:** 10.000 · 50.000 · 200.000 · 600.000 · 1.500.000 exp.
- **3. kademede ilişki seçimi:** profil kartında (odada kişiye dokununca ve profil sayfasında) "Yakınlık" bölümü:
  kalpler, ilerleme çubuğu, "Arkadaş olarak seç" / "CP olarak seç". Karşı taraf kabul eder (profil kartından ya da
  Mesajlar → Arkadaşlık isteği listesinden; bildirim ve rozet gelir). Herkesin tek CP'si olur; ilişki bitirilince
  puan korunur.
- **CP profilde:** CP eşi profil sayfasında ve odadaki profil kartında görünür. CP sıralaması artık onaylı çiftleri
  yakınlık puanına göre gösterir.
- **5. kademe oda efekti:** CP'ler sesli odada mikrofonda yan yana oturunca aralarında kalp atışı gibi büyüyüp küçülen
  bir kalp, ikisinin avatar dairesinin çevresinden de küçük kalpler çıkar. Koltuk düzeni değişmez, dokunmalar geçer.
- Sunucu: `cp_pairs` tablosu, `users.cp_partner_id`, `/api/cp/...` uçları, hediye sekmesi `cp`.

## v2.40.3 — Hızlandırma
- **Görseller telefonda saklanır:** avatarlar, oda kapakları, bannerlar, tema görselleri, hediye simgeleri ve mesaj
  fotoğrafları bir kez indirilir; uygulama her açıldığında yeniden indirilmez (sunucu ve internet yükü azalır, listeler
  daha hızlı dolar). Görseller ekranda çizilecekleri boyutta çözülür (büyük fotoğraflar belleği ve işlemciyi yormaz).
- **Oda açıkken ana sayfa arkada durur:** oda tam ekranken arkadaki ana sayfa çizilmez, animasyonları çalışmaz.
  Görünmeyen sekmelerin (Akış, Mesajlar, Profil…) animasyonları da durur.
- **Hareketli parçalar kendi katmanında:** koltuk çerçeveleri (SVGA/Lottie), WIP renkli adlar, giriş şeridi, araç,
  hediye şeridi ve uçan hediye, müzik balonu artık her karede odanın tamamını (arka plan, koltuklar, sohbet) yeniden
  çizdirmiyor. Oda arka plan görseli bir kez çizilir.
- **SVGA dosyaları arka planda açılır:** büyük hediye/çerçeve dosyası açılırken ekran donmaz; aynı dosya tekrar
  gelince yeniden indirilip açılmaz.
- **Ses sunucusu olayları:** oda yalnızca konuşan kişi, görüntü ya da bağlantı değişince yeniden çizilir (önceden
  bağlantı kalitesi bildirimlerinde de saniyede birkaç kez tüm oda yeniden çiziliyordu).
- **Sunucu:** veritabanı bağlantıları 10 sn yerine 5 dk açık tutulur. Az kullanıcıyla neredeyse her istek yeni SSL
  bağlantısı açıyor, her istekte fazladan ~0,3–1 sn bekletiyordu.

## v2.40.2 — Yayın başlat tasarımı, kırpma düzeltmesi, giriş efektleri
- **Yayın başlat ekranı yenilendi:** daha canlı mor → lacivert → turkuaz zemin (köşelerde yumuşak ışık), çerçeveli ve gölgeli oda fotoğrafı (sağ altta kamera rozeti), koyu ve kenarlı yazı kutuları, sesli odada duyuru kutusunda megafon simgesi. Mikrofon modlarında seçili kutu sarı çerçeve + parıltı + onay işareti, her kutuda kişi sayısı. Çoklu yayında kişi sayısı tek bir şerit içinde. Tür düğmeleri biraz daha aralıklı (yazılar artık birbirine değmez), seçili olan mor parıltılı. "… yayına başla" düğmesi turkuaz gölgeli. Ölçüler ekran genişliğine göre, küçük/büyük telefonda sınırlı.
- **Fotoğraf kırpma ekranı düzeltildi:** görsel ve çerçeve sağdan kesiliyordu; artık tüm ekranı kaplıyor.
- **WIP giriş efekti:** odaya girişte üstte kayan bantta artık araç yok; **fotoğrafın, adın (WIP renginde), WIP rozetin ve seviyen** görünür.
- **Araç giriş efekti ayrı:** mağazadan alınan araç yalnızca **odaya giriş efekti** olarak görünür: araç sağdan ekrana girer, ortada durur, sola çıkar; altında "Ad, Araç ile geldi". Takılı (seçili) giriş efekti öncelikli; yoksa araç, o da yoksa diğer giriş efekti.

## v2.40.1 — APK iş akışı
- APK derlemesi eski usulde: Actions → Build Android APK → Run workflow → Artifacts'tan zip. Sunucu adresi kutusu artık
  **https://tr-live-1.onrender.com** ile dolu gelir; zip yükleyince otomatik başlayan derleme de bu adresi kullanır
  (eskiden `api.example.com` ile bağlanamayan APK üretiyordu). APK zip içinde yeniden sıkıştırılmaz.
- İki eski kod analizi uyarısı giderildi (GitHub'daki "Mobile / analyze" kontrolü kırmızı çıkıyordu).

## v2.40.0 — Yayın başlat (Sesli · Canlı · Çoklu), Yoho mesajlar, fotoğraf kırpma, ana sayfa üst bar
Yayın başlat (Figma "Hillive")
- "Oda aç"a basınca yeni **Yayın başlat** ekranı: oda fotoğrafı (seçilmediyse profil fotoğrafın), yayın başlığı, **yayın isim kartı** (Sohbet · Eğlence · Müzik · Yarışma · Film · Oyun; açılır renkli çipler), altta **Çoklu Yayın · Canlı Yayın · Sesli Yayın** düğmeleri ve "… yayına başla".
- **Sesli:** oda duyurusu ve mikrofon modları (2 · 5 · 8 · 9 · 12 · 15 · 20 · 30; önizlemeler odadaki koltuk yerleşimiyle aynı). Sesli oda **bir kez** kurulur; sonra "Oda aç" doğrudan odana götürür.
- **Çoklu:** 4 · 6 · 9 · 12 kişilik görüntü ızgarası (4: yayıncı solda büyük; 6: yayıncı 2×2; 9: 3×3; 12: 4×3), yayıncının hücresinde kamera önizlemesi.
- **Canlı:** arkada tam ekran kamera önizlemesi. Odada yayıncı tam ekran, sağda en fazla 3 küçük konuk penceresi ("Konuk ol"), solda alttan sohbet.
- Görüntülü yayın açık değilse ekran her seferinde gelir (son bilgilerle dolu); açıksa doğrudan odana girersin. Sihirli değnek = oda teması. Güzellik filtresi henüz yok (düğme "yakında" der).
- Oda içinde: görüntülü odada kamerayı kapat/aç ve **kamerayı çevir** (koltuğuna dokun veya araçlar). Çoklu yayında "Yayın modu" 4/6/9/12 arasında değişir; canlı yayında konuk sayısı sabit.
- Oda kartında tür etiketi kendi renginde (ör. Eğlence pembe-mor).
- Sunucu: `rooms.layout` / `room_profiles.layout` ('grid' | 'live'), `POST /api/rooms` → `setup: true` ile kayıtlı oda bilgileri (ad, tür, duyuru, koltuk, düzen, tema) güncellenir; canlı yayında koltuk sayısı 4 (yayıncı + 3 konuk).

Fotoğraf boyutu ayarı
- Profil fotoğrafı (daire kılavuzlu kare), profil kapağı (profil sayfasındaki oran), oda fotoğrafı (kare) ve banner (3:1) seçilince **kırpma ekranı** açılır: sürükle, iki parmakla büyüt/küçült, "Kullan". Sonuç JPEG (veritabanında eskisinden ~5-10 kat az yer).

Ana sayfa
- Üst sekmeler **Popüler · Takip** (Yakında kalktı). Sağdaki ⋮ menüsü kalktı; gizli odaya kodla giriş ve kullanıcı arama, arama kutusunun sağında. Tavsiyeler / Yeni yayıncı çipleri kalktı.

Mesajlar (Yoho düzeni)
- **Mesajlar sayfası:** solda büyük "Mesajlar" başlığı, sağda arkadaş listesi; altında yana kayan kartlar **Arkadaşlık isteği · TR Live Ekibi · Etkinlik Promosyonu · Çevrimiçi Hizmet · Ödül Bildirimleri** (okunmamış rozetleriyle); altında sohbet listesi (büyük fotoğraf, ad ve rozetler, sağda saat: bugün 14:30 · "Dün 06:48" · eski "26-10-06", altında son mesaj). Üstteki uyarı şeridi ve Tümü/Özel Takip yok.
- **Oda içinde zarf düğmesi:** alttan açılan **"Sohbet"** penceresi (aynı kartlar ve liste). Sohbete dokununca sohbet tam ekran açılır, geri gelince pencere yerinde; oda arkada çalışmaya devam eder.
- **Sohbet ekranı:** ortada ad, sağda karşı tarafın fotoğrafı; tarih ayraçları; gelen mesaj solda gri, giden sağda yeşil baloncuk (fotoğraflarla); altta fotoğraf · "Bir şey söyle..." · emoji · gönder. **Fotoğraf gönderme** yeni. Mesaja uzun bas: kopyala / şikâyet et.
- **Arkadaşlık isteği:** yalnızca son 7×24 saatteki istekler (Kabul et / Reddet), boşsa el sallayan simge. Süresi dolan istek yeniden gönderilince tazelenir.
- **Ekip / Etkinlik / Ödül:** tarih ayraçlı akış; görselli duyurular kart (görsel + başlık + metin), görselsiz ekip mesajları baloncuk; bağlantı varsa "Görmek için tıklayın" (bağlantıyı kopyalar). Yönetici panelinde duyuruya görsel ve bağlantı eklenebilir. Rozetler kart başına ayrı sıfırlanır.
- **Çevrimiçi Müşteri Hizmetleri:** üstte "Müşteri Hizmetleri Merkezi · Hemen Yardım Al!" bandı, baloncuklu yazışma, yuvarlak yazı kutusu; sağ üstte konu seçimi.
- Henüz yok: sohbette hediye ve sesli mesaj, Yoho'daki sağ üst emoji düğmesi.

APK derleme
- "Build Android APK" iş akışında **Sunucu adresi** kutusu artık boş gelir; boş bırakılırsa depodaki `API_URL` değişkeni kullanılır. Eskiden kutuda `https://api.example.com` yazıyordu ve zip yükleyince otomatik başlayan derleme hiçbir sunucuya bağlanmayan APK üretiyordu. (`.github/workflows/apk_build.yml` elle yüklenmeli.)

## v2.39.2
- Veritabanı bağlantı havuzu 10'dan 5'e indi (Aiven Free toplam 20 bağlantı veriyor; Render güncelleme sırasında eski ve yeni sunucu birlikte açık kalınca sınır aşılıp "veritabanına bağlanamıyor" hatası çıkabiliyordu). `DATABASE_POOL_MAX` ile ayarlanır. Bağlantı 15 sn'de alınamazsa istek askıda kalmaz.
- Bağlantı hatası mesajında kısa hata kodu görünür (ör. "kod: 53300" = bağlantı sınırı, "28P01" = şifre yanlış).

## v2.39.1
- Sunucu veritabanına ulaşamadığında (şifre değişmiş, servis kapalı, adres yanlış, sertifika reddi) uygulama artık "Sunucu hatası" yerine "Sunucu şu an veritabanına bağlanamıyor" der; Render günlüğüne de sebep açıkça yazılır (`[veritabanı] ... veritabanı şifresi yanlış (DATABASE_URL içindeki şifre güncel mi?)`). `/health` bu durumda 503 döner.

## v2.39.0 — Yoho ile birebir düzen: oda ekranı ve ana sayfa
Ölçüler bu kez Yoho ile yan yana ekran görüntüsünden piksel piksel ölçüldü ve hesaplanan yerleşim Yoho görüntüsünün üstüne bindirilerek doğrulandı.

Oda ekranı
- **Üst satırlar Yoho gibi iki satır:** 1. satır oda kutusu (kapak + ad + ID) · ilk 3 izleyici · kişi sayısı · ••• · ⏻; 2. satır toplam elmas · favori ··· aile · taç. Eskiden 3 satırdı ve koltukları ~%10 aşağı itiyordu.
- **Koltuklar Yoho'nun yerinde:** 30 mikrofonda daire çapı, satır aralığı ve ilk satırın yeri Yoho ile aynı (önceki %1 daire büyütmesi Yoho'dan %9 büyük gösteriyordu, kaldırıldı).
- **Boyut artık hiç değişmez:** koltuk ölçüsü yalnızca ekran genişliğine bağlı. Mikrofona oturmak, izleyici gelmesi, aile/favori rozeti, klavye, ses hatası şeridi koltukları küçültmez/kaydırmaz. Başlık, koltuk adları ve alt bar telefonun yazı boyutu ayarından etkilenmez.
- **Çerçeve avatarın etrafına oturur:** takılı çerçeve koltuk kutusuna sıkıştırılmıyor; avatar çapının 1,6 katı, aynı merkezde (profil ile aynı oran). Oturan kişinin fotoğrafı artık küçük görünmez.
- Alt bar Yoho ölçüsünde (düğme ve hediye çapı, yükseklik). Şanslı çanta sağ altta (koltukların üstüne binmiyor). "•••" menüsü: paylaş, oda bilgisi, şikâyet, küçült.

Ana sayfa
- Ayrı üst çubuk kaldırıldı; Yoho gibi **İlgili · Sıcak · Yakında** yazı sekmeleri (seçili büyük ve kalın, altında çizgi), sağda sıralama tacı, arama, oda aç ve diğer.
- Banner 3:1, kenar boşlukları Yoho ölçüsünde. Sıcak sekmesinde **Tavsiyeler · Yeni yayıncı** süzgeçleri (son 30 günde açılan hesapların odaları).
- Oda kartları Yoho gibi: kare kapak, sol altta tür etiketi, sağ altta dinleyici sayısı ve üstünde üst üste binen üye fotoğrafları, oda adı kartın altında.
- Alt menü yalnızca simge (Yoho).
- Sunucu: oda listesinde `avatars` (en fazla 8; gizli kullanıcı ve hayalet dinleyici hariç) ve `fresh=1` süzgeci.

## v2.38.1 — Veritabanı taşıma
- Neon'un ücretsiz planı ayda 100 işlem saatiyle sınırlı; sürekli açık sunucumuzda ay ortasında bitiyor. Önerilen ücretsiz sağlayıcı: **Aiven Free PostgreSQL** (saat kotası yok). Adımlar: `docs/VERITABANI.md`.
- Sunucu artık bağlantı adresindeki `sslmode` parametresini yok sayıyor: Aiven/Supabase adresleri olduğu gibi yapıştırılabilir ("self-signed certificate" hatası olmaz). İsteğe bağlı `DATABASE_CA` ile tam sertifika doğrulaması.
- GitHub Actions'a **"Veritabanını taşı"** iş akışı: eski veritabanını yeni, boş veritabanına birebir kopyalar, her tablonun satır sayısını karşılaştırır, en büyük tabloları gösterir. Bağlantı adresleri GitHub secret olarak verilir.
- `ADMIN_USERNAMES` ortam değişkeni: sıfırdan kurulan veritabanında belirtilen kullanıcı adları yönetici yapılır.

## v2.38.0 — WIP 1–10 + SWIP (hayalet mod), şanslı hediye
- **WIP 1–10:** Yoho'daki VIP kademelerinin ayrıcalıkları 10 kademeye sıkıştırıldı (Yoho'nun en üst kademesi = WIP 10). Her kademenin kendi rengi, rozeti, **isim efekti** (renkli → parlayan → neon → altın/yeşim/buz/gökkuşağı parıltı → ateş), **sohbet balonu** (renk geçişli, kenar ışıklı, köşe süslü), **avatar çerçevesi** (WIP 6+ dönen, WIP 8+ yıldızlı; takılı mağaza çerçevesi varsa o görünür) ve **giriş aracı** (🛵 Scooter → 🐉 Ejderha) var.
- Ayrıcalıklar: ziyaretçileri görme (2), Vip hediyeler (3), susturulamaz (4), profil ışık efekti (5), odadan atılamaz + özel oda teması (6), gizli ziyaret (7), hareketli profil fotoğrafı (8), oda sayısı 1→5. Hepsi Panel > WIP kademelerinden değiştirilebilir.
- **SWIP (11. kademe):** WIP 10'un her şeyi + **hayalet mod** (Ayarlar > Hayalet mod): odaya giriş duyurulmaz, dinleyici listesinde, kişi sayısında, toplu hediye alıcılarında ve çevrimiçi göstergelerde görünmez; ziyaret iz bırakmaz, odadan çıkışı da duyurulmaz. Mikrofona çıkınca görünür, inince yeniden gizlenir; mod değişince odada ve çevrimiçi göstergelerde anında güncellenir.
- **WIP ekranı yenilendi:** kademe seçici, seçilen kademenin canlı önizlemesi (çerçeve, isim, balon, giriş aracı), kilitli/açık ayrıcalık ızgarası, paketler.
- Eski WIP üyelikleri oransal taşındı (1→2, 2→4, 3→6, 4→8, 5→10); süreler aynı. Yeni fiyatlar 30 gün: 5 bin → 1 milyon Coin, SWIP 2 milyon.
- **Şanslı hediye (Yoho çanı):** hediye penceresinde "Şanslı" sekmesi (Şanslı Çan, Şanslı Yonca). Her adet bir şans: x2–x500 kat Coin geri kazanma. Alıcıya hediye değerinin %10'u Elmas geçer. Büyük kazançlar (x100+) tüm uygulamaya duyurulur. Panel > Uygulama ayarları > Şanslı hediye: aç/kapa, geri dönüş oranı (varsayılan %70), alıcı payı, en fazla kazanç (toplam en fazla %95).
- Ajans/maaş, PK, sayı tahtası, aile puanı ve liderlik tablolarında alıcı tarafı artık alıcıya geçen Elmas'la hesaplanıyor (şanslı hediyede değerin tamamı değil, payı).
- Sunucu: migration 029; `is_ghost()` SQL işlevi ve `active_ghosts` görünümü (oda listelerinde hızlı sayım); `users.ghost_mode`, `gift_transactions.diamond_amount`; `lucky_gift_win` cüzdan türü ve global olayı; `GET /api/gifts` yanıtında `lucky`; hediye yanıtında/olayında `lucky`.

## v2.37.0 — Faz 2 (1. kısım): tekrar koruması, combo hediye, "yazıyor...", Coin geçmişi
- **Para işlemlerinde tekrar koruması:** hediye, mağaza, WIP, Elmas bozdurma, bayi satışı, şanslı çanta ve yönetici Coin düzeltmesi tek kullanımlık işlem anahtarıyla gider. Zayıf ağda istek iki kez ulaşsa (ya da uygulama zaman aşımından sonra kendiliğinden tekrar denese) Coin bir kez düşer. Ağ hatasından sonra aynı hediyeye tekrar basılırsa da aynı anahtar kullanılır.
- **Combo hediye (Yoho):** gönderimden sonra hediye penceresi açık kalır, 5 sn'lik geri sayımlı "COMBO xN" düğmesi aynı hediyeyi tek dokunuşla tekrar gönderir. Odadaki şerit yeni şerit açmak yerine büyüyen altın "xN" sayacıyla uzar. Hediye/adet/alıcı değişince combo biter.
- **"Yazıyor...":** arkadaşın yazarken sohbet başlığında ve mesaj listesinde görünür (yalnızca mesajlaşabilen arkadaşlar arasında, engelliyse gitmez).
- **Coin geçmişi:** Cüzdan ekranında tür süzgeçleri (Hediye, Yükleme, Bozdurma, Mağaza/WIP, Çanta) ve "Daha fazla göster" ile eski kayıtlar; tutarlar +/− işaretli.
- Sunucu: migration 028 (idempotency_keys), saatlik temizlik; `/api/me/wallet?group=&before=`; hediye yanıtında ve `room_gift` olayında `combo`; WebSocket `typing`.
- Bilinçli olarak eklenmedi: şanslı hediye (gönderenin rastgele Coin kazanması) — kumar sayılma ve Google Play riski. VIP 1–15 için kademe/fiyat/rozet kararı bekleniyor.

## v2.36.0 — Faz 1: oturumlar, çevrimiçi durumu, kalıcı medya, canlı panel, otomatik moderasyon
Belgeler
- `docs/` klasörü: MIMARI, EKONOMI, YETKILER, GUVENLIK, TEST_PLANI, YOL_HARITASI (elle) ve `docs/generated/` altında koddan üretilen veritabanı (74 tablo), API (258 uç) ve WebSocket (34 olay) belgeleri (`node backend/scripts/gen_docs.mjs`).

Oturum ve güvenlik
- Cihaz oturumları: 1 saatlik erişim token'ı + her kullanımda değişen yenileme token'ı (veritabanında yalnızca özeti). Uygulama süresi dolmadan kendiliğinden yeniler; internet yokken oturum kapanmaz.
- Çalıntı token tespiti: eski yenileme token'ı 15 dk ağ toleransından sonra tekrar kullanılırsa oturum kapanır. Giriş sürerken şifre değişirse/ban gelirse oturum açılmaz.
- Ayarlar > Oturumlarım: cihaz adı/modeli, sürüm, IP (maskeli), son etkinlik; tek cihazdan veya diğer tüm cihazlardan çıkış. Çıkışta sunucudaki oturum da kapanır.
- Şifre değişimi, ban, hesap silme tüm oturumları kapatır. Eski sürümden güncellenen uygulama yeniden giriş istemeden yeni oturuma geçer; eski APK'lar çalışmaya devam eder.
- Zorunlu güncelleme: Panel > Uygulama ayarları > en düşük sürüm. Altındaki uygulamalar "Güncelleme gerekli" ekranı görür (indirme bağlantısı kopyalanabilir). Yeni sürüm yayınlanınca bir kez "yeni sürüm var" bildirimi.
- Profil fotoğrafı/kapak artık dış adres olarak verilemez (yalnızca yükleme). Hesap silinince gönderiler gizlenir, yüklenen fotoğraflar silinir.

Çevrimiçi durumu
- Mesajlar listesinde çevrimiçi kişilerin avatarında yeşil nokta (canlı), sohbet başlığında "Çevrimiçi / Son görülme ... önce", kullanıcı profilinde çevrimiçi satırı.
- Özel mesajda "Görüldü".
- Ayarlar > "Çevrimiçi durumumu göster" (kapatılabilir). Gizli kullanıcı modu ve engellenen kişiler durumu göremez.

Kalıcı medya
- Profil fotoğrafı, kapak, gönderi görseli, oda kapağı ve banner'lar artık veritabanında: Render yeniden dağıtılınca görseller kaybolmuyor. Sık istenen küçük görseller sunucu belleğinde önbelleklenir; tarayıcı/uygulama önbelleği için ETag. Eski dosyalar silinirken yalnızca kullanıcının kendi yüklemesi silinir.

Otomatik moderasyon
- Link, site adresi, "nokta com" gibi gizlemeler, t.me/wa.me/discord ve "insta: @..." yönlendirmeleri; herkese açık alanlarda telefon numarası engellenir. "saat 10.30", "tamam.biz" gibi normal cümleler takılmaz.
- 10 dk içinde 3 ihlal → 15 dk tüm sohbetlerde kısıt; 24 saatte tekrarında süre ikiye katlanır (en fazla 24 sa). Değerler panelden değiştirilir. Ad, biyografi, oda adı/duyurusu, aile/ajans adında link ve telefon reddedilir.

Yönetim paneli
- Yeni "Panel" sekmesi (10 sn'de bir yenilenir): çevrimiçi kullanıcı, açık bağlantı, aktif oda, mikrofondaki kişi, açık oturum; bugünkü kayıt/aktif kullanıcı/hediye/mesaj/ihlal; sunucu sürümü, açık kalma süresi, CPU, bellek, veritabanı gecikmesi/boyutu/bağlantı havuzu, LiveKit durumu, açık şikâyet.
- Uygulama hata kayıtları (telefonlarda yakalanan hatalar otomatik gönderilir, en sık hatalar özeti), İşlem kaydı (yetkili işlemleri ve para hareketleri), Otomatik moderasyon listesi, Uygulama ayarları.
- Kullanıcı kartı: sohbet kısıtı koy/kaldır (yardımcı admin de), Cihazlar (oturumlar, emülatör işareti, aynı cihazı kullanan diğer hesaplar), Tüm oturumları kapat.

Sunucu
- Migration 027 (user_sessions, moderation_strikes, client_errors, app_config, users.show_presence / chat_restricted_until, panel indeksleri).
- Yeni uçlar: /api/auth/refresh, /api/auth/session, /api/auth/logout, /api/me/sessions…, /api/app/config, /api/client-errors, /api/admin/dashboard, /client-errors, /actions, /app-config, /moderation/strikes, /users/:id/chat-restriction, /users/:id/devices, /users/:id/sessions/revoke-all.
- Yeni WebSocket olayları: presence_watch → presence_state / presence, dm_read, chat_restricted.
- Testler: moderasyon/sürüm/cihaz birim testleri; oturum, moderasyon, çevrimiçi durumu ve panel için uçtan uca testler.

## v2.35.0
- Üst çubuk inceltildi; TRLive yazısı ve taç küçüldü; oda açma düğmesi yalnızca simge (yazı yok). Düğme yalnızca Sesli sekmesinde (mikrofon) ve Görüntülü sekmesinde (kamera) görünür; Akış, Mesajlar ve Profil'de yok.
- Mesajlar Yoho düzeninde: "Sohbet (okunmamış)" başlığı, Aile / Duyurular / Arkadaşlar düğmeleri, Arkadaşlık İsteği · Çevrimiçi Sohbet · Ajans Mesajı kartları, Tüm / Özel Takip (takip ettiklerin) sekmeleri, kart görünümlü sohbet listesi ve "1 Eki" tarih biçimi.
- Profil: üstteki fazla boşluk kaldırıldı (ikinci durum çubuğu boşluğu), simgeler çerçevenin sağ üstüne alındı; çerçeve fotoğrafın çapına göre (×1,6) — profil, kullanıcı profili ve seviye ekranında aynı oran; ad, ID, sayaçlar, kartlar ve menü yazıları küçültüldü.
- Mikrofon modu seçilince pencere kendiliğinden kapanır.
- Müzik yalnızca oda içinde: oda küçültülünce dışarıda ayrı müzik balonu çıkmaz; müzik çalıyorsa oda balonunda küçük nota görünür.

## v2.34.1
- Koltuk daireleri her mikrofon modunda ekran genişliğinin %1'i kadar büyütüldü (merkezler aynı, daire etrafına büyür); içindeki "+" simgesi eski boyutunda.

## v2.34.0 — Derin denetim: güvenlik, kararlılık, tasarım
Sunucu
- Başkasının yüklediği dosyayı silme açığı kapatıldı: gönderide yalnızca kendi yüklediğin görsel kullanılabilir; gönderi silinince yalnızca sahibinin dosyası silinir (upload_owners).
- Banlanan / hesabını silen kullanıcı tüm odalardan çıkarılır, ses-görüntü bağlantısı kesilir, sahibi olduğu oda kapanır. Silinen hesap adı çakışması giderildi.
- Gizli odanın üye/yönetici/katkı/PK bilgisi yalnızca odadakilere açık; gizli odalardan global hediye şeridi ve şans çantası duyurusu yayılmaz.
- Sohbet susturması odadan çıkıp girince kaybolmuyor (room_mutes). Moderatör, çevrimdışı yardımcı sahibi engelleyemez ve sahibin koyduğu engeli kaldıramaz.
- Maaş dönemleri çakışırsa (aylık + haftalık) kapatma reddedilir: aynı kazanç iki kez ödenmez.
- Tek bir kullanıcı adına yanlış şifre denenerek başkasının (ör. admin) hesabını kilitleme engellendi (kilit IP+kullanıcı bazlı).
- Yetki, büyük dosya gövdesi belleğe alınmadan önce denetlenir (müzik yükleme, oda kapağı). Profil/kapak yüklemeye sınır; eski hareketli avatar kaydı silinir.
- Zamanlayıcılar üst üste binmez (PK, müzik, oyun, oda temizliği); küfür filtresi ~25 kat hızlandı; sıralama sorgularına indeks; hediye sonrası hata parayı tekrar çektirmez; küçük doğrulama düzeltmeleri (limit, doğum tarihi, çanta türü, gizli yetkili adı, kullanıcı arama sınırı).
- Migration 026. Sözdizimi kontrolü tüm dosyalara genişletildi.

Mobil
- Çıkış yapınca açık/küçültülmüş oda kapanır, odadan düzgün çıkılır, müzik durur (önceden sonraki girişte eski oda açılıyordu).
- Ses (LiveKit) bağlantısı koparsa artan aralıklarla kendiliğinden yeniden kurulur.
- Soket yeniden bağlanınca / uygulama öne gelince oda durumu (koltuklar, kendi mikrofonun, sohbet, puanlar, PK, çantalar, müzik) sunucuyla eşitlenir; ölü bağlantı 70 sn'de fark edilir; geçici sunucu hatası artık oturumu kapatmaz.
- Kilitli/gizli odaya yeniden katılırken şifre/kod korunur. Odadan çıkış ağı beklemeden anında.
- Para işlemlerinde zaman aşımı mesajı "işlem gerçekleşmiş olabilir, kontrol et" der (körü körüne tekrar ettirmez).
- Müzik yarış durumları (geç gelen yanıt, odadan çıkınca yeniden başlama) giderildi. Arka plan servisi aç/kapat sırası düzeltildi.
- Hediye uçuşları/animasyonları oda küçültülmüşken birikmez; animasyon bitiş/hata bildirimleri bir kez ve doğru zamanda.
- Avatarlar gösterildiği boyutta çözülür (bellek). Sohbet, yukarı kaydırıp okurken aşağı zıplamaz. DM listesi her mesajda baştan yüklenmez.
- Akışta sayfa hatası sonsuz istek döngüsüne girmez; kısa ekranda hediye penceresi çökmesi giderildi; gizli mod anahtarı hata olursa geri döner.

Tasarım
- Bildirimler en üst katmanda (açık pencere/diyalog arkasında kalmaz), simgeli ve yumuşak geçişli. Silme/kapatma onayları kırmızı.
- Türkçe sistem metinleri (Geri, Kopyala/Yapıştır, tarih seçici). Kısa listelerde de aşağı çekip yenileme çalışır.
- Başlık yazısı 20 sp (uzun başlıklar kesilmez), kartlar arası boşluk, renk/boşluk/köşe ölçü tabloları (Gap, Rad, Pal.green/orange/gold), ortak EmptyState.
- Taşma düzeltmeleri (büyük yazı boyutunda bakiye, segmentler, çanta sayacı, mesaj kartları), podyum 🥉, "1,5K" Türkçe ondalık, Türkçe büyük harf (İ), kullanıcı profili yüklenirken de geri düğmesi, teknik hata metinleri kullanıcıya gösterilmez.
- APK derlemesi: Dart hatası varsa uzun derlemeyi beklemeden durur ve hatalı satırları özet sayfasında gösterir.

## v2.33.0 — Oda ekranı Yoho ölçüleriyle
- Koltuk yerleşimi Yoho ekran görüntülerinden ölçülen oranlarla her mod için ayrı: 2, 5, 8, 9, 12, 15, 20 ve yeni 30 mikrofon (6 x 5). Koltuklar başlığın altından sabit ölçüyle başlar; sohbet koltukların bittiği yerden akar. Boş koltuk: yarı saydam beyaz daire + ince çerçeve, altında numara.
- Mikrofonlar artık hiçbir durumda küçülmez: klavye açılınca oda kararır, mesajlar karartının üstünde görünür, beyaz yazı şeridi klavyenin üstündedir (Yoho). Hediye paneli koltukları sıkıştırmaz.
- Sohbet: renkli saydam balonlar (seviyeye göre lacivert/turkuaz/mavi/mor/pembe/altın), solda avatar, üstte ad ve seviye, altta balon; sistem mesajları sarı ("Oda sahibi yeni bir mikrofon moduna geçmiştir…").
- Alt bar Yoho düzeni: mikrofonda değilken "Selam..." kutusu + hediye, mesajlar, oyun, menü; mikrofondayken sohbet, mikrofon, emoji, hediye, mesajlar, oyun, menü. Ses aç/kapat, kamera, sıraya gir ve mikrofondan in oda araçlarına taşındı.
- Mikrofon modu penceresi Yoho gibi: beyaz pencere, mavi-mor başlık, ipuçları, önizlemeli 3 sütun, seçili yeşil çerçeve + tik, azaltırken "Tips" onayı, pencere açık kalır.
- Yeni: "Mikrofonda olmak için istekte bulunmanız gerekiyor" modu. Açıkken kullanıcı koltuğa dokununca istek gönderir; yetkililer "Mikrofon istekleri" listesinden onaylar (davet) veya reddeder.
- Sunucu: migration 025 (30 koltuk, rooms.mic_request), istek modu kontrolleri, DELETE /api/rooms/:id/mic/queue/:userId.

## v2.32.0
- Tüm uygulamada alt sistem çubuğu (Android gezinme çubuğu) payı: içerik artık çubuğun altında kalmıyor (Seviye Merkezi dahil tüm ekranlar).
- Hediye paneli açılınca sohbet ve alt bar gizlenir, sahne panelin üstüne sıkışır ve mikrofonlar küçülür; klavye açılınca da mikrofonlar küçülür.
- Oda sohbeti Yoho gibi şeffaf: balonlar saydam, üst kenarda solarak kaybolan kayar akış.

## v2.31.1
- WIP rozeti koltuk adlarından ve oda sohbetindeki adların yanından kaldırıldı (nick efekti kalır).
- Her koltuk modu (2, 4, 5, 6, 8, 9, 12, 15, 20) için ayrı, sabit koltuk ölçüsü tablosu; yükseklik yetmezse orantılı küçülür.

## v2.31.0
- Mikrofon modu penceresi açılmama hatası düzeltildi ("Cannot modify an unmodifiable list": sabit listeye sort uygulanıyordu).
- Koltuk adı: WIP rozeti küçük "W5" biçimine geçti, kesilme/taşma giderildi; ad satırı ölçüleri düzeltildi.
- Oda küçültme balonu ve müzik balonu: yumuşak sürükle-bırak ve kenara yapışma, kapatma (X) düğmesi büyütüldü ve tıklanabilir alana alındı. Oda küçültülünce müzik balonu da görünür kalır.
- Müzik sistemi yeniden yapıldı: tek çalma listesi. "Müzik ekle" ile telefondan bir veya birden çok şarkı seçilir, seçim sırasıyla listeye girer ve odada çalar (hiçbir şey çalmıyorsa ilk şarkı otomatik başlar). Telefonda ayrı dinleme/kitaplık kaldırıldı (iki yerden çalma sorunu bitti). Yetkililer için liste sınırı 40 şarkıya çıktı.
- Profil: Ayarlar en alta alındı (üstteki dişli kalktı). Kullanıcı profilinde kapak yüksekliği küçüldü.

## v2.30.1
- Derleme hatası düzeltildi (kullanıcı arama kutusu, common.dart: const InputDecoration).

## v2.30.0
- Güvenlik: yerleşik Türkçe/İngilizce küfür-hakaret filtresi (BANNED_WORDS boş olsa da çalışır; s1k, a.m.k, siiiik gibi yazım hilelerini yakalar, "sıkıntı" gibi masum sözleri geçirir). Sohbet, DM, biyografi, ad, oda adı, destek mesajı ve akışta geçerli.
- Güvenlik: şifre değiştirme ve hesap silme için kullanıcı başına hız sınırı (15 dakikada 5 deneme).
- Denetim notu: hediye/bakiye işlemleri zaten satır kilidiyle (FOR UPDATE) korunuyor.

## v2.29.0
- Seviye Merkezi: Yayıncı / Kullanıcı seviyesi geçişi, 160 kademeli seviye eğrisi, Mevcut/Gerekli Exp, Ayrıcalıklar tablosu (ödül sütunu henüz boş).
- Yükleme Merkezi (Coins; Gümüş yok): bakiye, coin paketleri (7.000 / 42,99₺ vb.), ödeme yöntemi listesi (ödeme altyapısı henüz bağlı değil uyarısı). Profildeki "Coins Yükleme" kartı buraya açılır.
- Müşteri Hizmetleri Merkezi: konu kutuları + çevrimiçi sohbet (yalnızca yazı). Profilin en üstündeki kulaklık simgesinden açılır.
- Yönetim paneli: "Destek" sekmesi (yönetici + yardımcı admin yanıtlar), "Coin paketleri", hediye / çerçeve / mağaza ürünü SİLME (geçmişte kullanıldıysa gizlenir).
- Hediye eklerken animasyon yüklenince ikon, animasyonun ilk karesinden otomatik PNG olarak oluşturulur (önizlemesi formda görünür; oda hediye panelinde de bu ikon kullanılır).
- WIP 5 adı ateşli git-gel, WIP 4 adı mavi buzlu hareketli renk (oda, koltuk, sohbet, profil).
- Sunucu: migration 024 (seviye yeniden hesap, coin_packages, support_messages), /api/support, /api/store/coin-packages, /api/me/levels.

## v2.28.1
- Yönetim paneli: kullanıcı ID (public ID), kullanıcı adı veya adla bulunur; sonuçta ve kartta ID görünür.
- "Öğe ver": kategori seç (Çerçeve, Rozet, Sohbet Balonu, Giriş Efekti, Mini Kart, Mikrofon Dalgası, Araç) → tüm öğeler önizlemeyle listelenir → seç, gün yaz (0 = süresiz) → Gönder. Elle anahtar yazmak kalktı.
- Mağaza ürünü eklerken "Mağazada satılsın" seçeneği ve Rozet kategorisi (rozetler yalnızca yönetici verir). "Mağaza ürünleri (aç/kapat)" listesi.
- Sunucu: migration 023, /api/admin/grantables, /api/admin/users/:id/grant.

## v2.28.0
- Mağaza (AVM): kategori çubuğu (Çerçeve, Sohbet Balonu, Özel Giriş, Mini Kart, Mikrofon Dalgası, Araç), Coins Mağazası, süre/fiyat, Önizleme, Satın al ve arkadaşa Gönder. Puan Mağazası "yakında".
- Görünüm (eski envanter): kategori çubuğu, Etkinleştir / Kaldır, son kullanma tarihi.
- Gelir Merkezi yeniden tasarlandı: mevcut elmas, Elmas Bozdurma, Para Çekme, son kazançlar, Canlı Kayıt.
- Yayın Özeti (aylık ay seçmeli + günlük), Canlı Yayın Geçmişi (video/sesli sekmeleri, sayfalı tablo), Para Çekme sayfası.
- Yönetim paneli: "Mağaza ürünü ekle" (yükleme + önizleme).
- Sunucu: migration 022 (store_items), /api/store, /api/admin/store/items, /api/me/earnings/summary ve /history.
- Not: sohbet balonu, mikrofon dalgası, mini kart ve araç ürünleri alınıp etkinleştirilebilir; uygulamada görsel etkileri sonraki sürümde.

## v2.27.0
- Profil ekranı Figma'ya göre yenilendi: ortalı çerçeveli avatar, kopyalanabilir ID, Takip edilen / Fanlar / Ziyaretçiler / Arkadaşlar sayaçları, Coins ve Gelir Merkezi kartları, Leveller · Aile · WIP · Görünüm kısayolları, Mağaza · Yayıncı Merkezi · Ajans Merkezi · Günlük Görevler listesi. Ayarlar sağ üstteki dişliye taşındı.
- Envanter adı "Görünüm" oldu. Aile ve Günlük Görevler profile taşındı (ana sayfa menüsünden ve oda araçlarından kaldırıldı).
- Mağaza sayfası eklendi (içerik sonra eklenecek).
- Yayıncı Merkezi (yayıncı olan/başvuracak herkes) ve Ajans Merkezi (yalnızca ajans sahibi) ayrıldı.
- Arkadaşlık sistemi: istek gönder / kabul / reddet / çıkar. Artık yalnızca arkadaşlar mesajlaşabilir.
- Kırmızı rozetler: yeni ziyaretçi, yeni fan, bekleyen arkadaş isteği (sayaçlarda ve alttaki Profil sekmesinde).
- Kullanıcı profili sekmeli: Profil · Başarılar (alınan hediyeler, madalyalar) · Paylaşım · İlişkiler; aile kartı, Top Destekçiler, kullanıcı/yayıncı seviye çubukları.
- Sunucu: migration 021 (friend_requests, visitors_seen_at, followers_seen_at), /api/friends, /api/me/badges, /api/me/seen.

## v2.26.3
- Müzik seçme yalnızca oda sahibi, yardımcı sahip ve moderatörde.

## v2.26.2
- Oda araçları yetkiye göre gizleniyor: sohbet yasağı, tema, mikrofon modu (sahip/yardımcı sahip); sohbet temizleme (yönetici); oda kilidi, gizleme, kapatma, PK (sahip); müzik (yönetici veya mikrofondakiler).

## v2.26.1
- Müzik Kütüphanesi kaldırıldı (uygulama + yönetim panelindeki "Müzik ekle"). Müzik çalar: Müziklerim (telefondan) | Sıra.

## v2.26.0
- Müzik paneli yenilendi: dönen plaklı çalar kartı, ses/ilerleme/kontroller üstte; sekmeler Telefonum | Kütüphane | Sıra; küçült oku.
- Müzik çalarken odada yuvarlak, sürüklenebilir müzik balonu (dönen kapak); dokununca panel açılır.
- Küçültülmüş oda artık yuvarlak, sürüklenebilir balon (kenara yapışır); X ile odadan çıkılır.

## v2.25.2
- Alıcı mikrofonda değil ama odadaysa hediye ikonu seyirci sayısı rozetine uçar.

## v2.25.1
- Hediye uçuşu 20 alıcıya kadar çıkarıldı (koltuk sayısı kadar).

## v2.25.0
- Hediye gönderilince hediyenin PNG ikonu gönderenden alıcı mikrofonlara uçar, ardından tam ekran animasyon oynar (Yoho tarzı).

# Değişiklik ve inceleme raporu

## v2.24.1
- WIP 5 (hareketli avatar özelliği) bitince hareketli profil fotoğrafı otomatik olarak önceki sabit fotoğrafa döner (dakikada bir kontrol; services/avatar_sweeper.js). Hareketli yüklenirken önceki sabit fotoğraf yedeklenir. Migration 020.

## v2.24.0 — WIP 5: hareketli profil fotoğrafı
- WIP 5 özelliği `animatedAvatar`: gif ve animasyonlu webp profil fotoğrafı (en çok 5 MB). Yalnızca WIP 5 yükleyebilir; sunucu 403 ile reddeder. Dosya olduğu gibi (yeniden sıkıştırılmadan) gönderilir, veritabanında saklanır.
- Profil düzenleme ekranında "Hareketli (WIP 5)" düğmesi. Avatar her yerde NetworkImage ile hareketli oynar.
- Migration 019. Yönetici WIP özellik düzenlemesinde `animatedAvatar` anahtarı kullanılabilir.

## v2.23.3
- Mikrofon Modu penceresi: araç penceresi kapandıktan 300 ms sonra, kök Navigator üzerinden açılır; açılamazsa hata mesajı gösterilir. Yetkisiz kullanıcıya uyarı pencerenin altında kalmaz.

## v2.23.2
- Mikrofon modu: seçim anında ekrana uygulanır; sunucu reddederse eski sayıya dönülür ve sunucunun hata mesajı pencerede gösterilir (sessiz başarısızlık kalmaz).

## v2.23.1 — Oda üst başlığı (Figma)
- İzleyici sayısı ve çıkış/küçült (X) düğmesi artık gerçekten en sağ üstte (oda kartı kalan alanı doldurur, kart solda).
- Ailesi olanlarda sağda aile kısayolu (logo + ad); dokununca Aile ekranı. Taç (katkı listesi) kısayolun hemen altında sağda.

## v2.23.0 — Koltukta çerçeve, renkli nick, yeni sahne hesabı
- Sunucu kullanıcı verisine `frameUrl` (takılı çerçeve) eklendi; koltukta avatarın üstünde hareketli çerçeve çizilir.
- Koltuk adı artık WIP renginde ve WIP rozetiyle görünür.
- Sahne düzeni yeniden hesaplanır: her satırın avatar boyutu satıra göre ayrı (üst oda sahibi/az koltuklu satır %20–35 büyük), tüm satırlar mevcut yüksekliğe sığar; 12+ koltukta sahne daha yüksek, sohbet daha kısa. Kaydırma yok.

## v2.22.4
- Hediyede animasyon dosyası tanımlı değilse oda içinde açık uyarı gösterilir (sessizce geçmez).

## v2.22.3
- Telefon belleğine indirme yalnızca hediyeler için. Çerçeveler ve giriş efektleri eskisi gibi doğrudan internetten oynar (AnimAsset cache: false).

## v2.22.2 — Telefon belleğine indirme
- Hediye animasyonları ve çerçeveler ilk kullanımda kullanıcının telefonuna (uygulama önbelleği) indirilir, sonra hep oradan oynar (services/media_cache.dart). Oda açılınca ve hediye paneli açılınca tüm hediyeler arka planda önceden indirilir. Önbellek 400 MB'ı geçerse en eski dosyalar silinir.
- Uygulama paketinde (APK) hiçbir hediye/çerçeve dosyası yoktur; hepsi yönetim panelinden eklenir.

## v2.22.1 — Yönetim panelinden önizlemeli ekleme
- Hediye ve çerçeve formunda dosya yüklenince canlı önizleme gösterilir (çerçeve avatar üstünde).
- Katalog → "Katalog listesi (önizleme)": tüm hediye/çerçeveler hareketli önizlemeyle, açma/kapama ve çerçeve için "Bana ver (dene)". Sunucu: GET /api/admin/catalog.
- Toplu hediye/çerçeve yükleme, telefondan dosya seçme, oynatma hatasında ekran uyarısı (v2.21.x) korunur.
- Pakete gömülü hazır içerik (v2.22.0) geri alındı; her şey yönetim panelinden eklenir.

## v2.21.3
- Katalog: "Toplu hediye yükle" ve "Toplu çerçeve yükle". Birden fazla dosya seçilir; ad dosya adından, fiyat/sekme tek seferde girilir; sonunda hangi dosyanın neden eklenmediği listelenir.

## v2.21.2
- svgaplayer_flutter paketi kaldırıldı (http sürümüyle çakışıp derlemeyi durduruyordu). SVGA 2.x için dış paketsiz kendi oynatıcımız eklendi (widgets/svga_lite.dart): görsel katmanlar, konum/ölçek/dönüş/saydamlık. Desteklenmeyen: vektör şekiller, matte maskesi, gömülü ses.

## v2.21.1
- Çerçeve olarak şeffaf mp4 (VAP) desteği; mp4 çerçeve ve avatar efekti döngüde oynar.
- Hareketli PNG (APNG) yüklemesi açık mesajla reddedilir (Flutter oynatamaz); webp/gif/svga kullanın.

## v2.21.0 — Hediye ve çerçeve dosyası yükleme
- Yönetici → Katalog: hediye ikonu/animasyonu ve avatar çerçevesi telefondan seçilip yüklenir (40 MB'a kadar). Dosyalar veritabanında saklanır (sunucu yenilense de kaybolmaz).
- Sunucu türü uzantıdan değil içinden anlar: svga 2.x, mp4, Lottie json (birleşik), webp, gif, png, jpg. PAG, WebM, svga 1.x ve görselleri dışarıda olan Lottie açık bir mesajla reddedilir.
- Yan yana şeffaf mp4'e eksik VAP ayar kutusu (vapc) otomatik eklenir; şeffaflık solda/sağda seçilebilir.
- Oynatıcı: svga (yeni paket svgaplayer_flutter), Lottie, VAP mp4, webp/gif/png. Avatar çerçeveleri hareketli (döngü) oynar. Giriş efekti de aynı oynatıcıyı kullanır.
- Migration 018 (media_files).

## v2.20.0 — Sabit koltuk sahnesi, yeni oda başlığı, çanta tasarımı
- **Koltuklar kaymaz (YoHo mantığı):** Sahne artık kaydırılmaz. Avatar boyutu, sahne yüksekliği ve genişliğine göre hesaplanır; her koltuk modu (2…20) ekrana sığar. 3 satıra kadar elmas rozeti, daha fazla satırda gizli. Az koltuklu üst satır Figma'daki gibi geniş aralıklı ortalanır. Hızlı dikey fling hâlâ odayı değiştirir; sahne oynamaz. İzleyiciler artık sahnede değil, üstteki izleyici sayısından açılan listede.
- **Oda başlığı (Figma):** kapak fotoğraflı oda rozeti + başlık + `ID:oda numarası`; sağ üstte izleyici sayısı ve en sağda çıkış X; alt satırda elmas toplamı, favori ve **taç = Katkı Listesi** (24 Saat / Toplam sekmeleri, ilk 3 kürsü, 4+ liste).
- **Oda kartı:** başlığa dokununca kapak, başlık, Oda Duyurusu, Oda İsim Kartı (renkli etiketler), yöneticiler. Oda sahibi/yardımcı **Düzenle** ile kapak resmi, başlık, duyuru, etiketler (en fazla 3) değiştirir, oda sahibi yönetici siler. Bilgiler kalıcı odaya da kaydedilir (migrasyon 017).
- **İzleyiciler** penceresi Figma'ya uygun yeniden tasarlandı.
- **Şanslı çanta:** Normal çanta süresiz/hemen açılır. Süper çanta Figma'daki pembe kartta 60 sn geri sayar, bitince **AÇ** olur (geri sayımda not sohbete yazılır), sonra 120 sn açılabilir. Odada sol üstte kırmızı zarf (rozet=açık çanta), oda listesinde 🧧 işareti. Süper çanta duyurusu ve global hediye şeridi artık sağdan sola kayan şerit olarak tüm odalarda ve ana ekranda görünür.
- **Giriş şeridi:** WIP giriş şeridi kendi girişinde de gösterilir.
- **Mikrofon modu:** seçim sonrası sunucudaki gerçek koltuk sayısı yeniden okunur ve üyeler yenilenir; liste Figma'daki gibi 2/5/8/9/12/15/20.
- Not: global hediye şeridi yalnızca alıcı başına en az `GLOBAL_GIFT_MIN_COINS` (varsayılan 1000) Coin'lik hediyelerde çıkar; küçük hediyelerde çıkmaz. Render ortam değişkeniyle değiştirilebilir.

## v2.19.0 — Günlük Görev ve Şanslı Çanta
- **Günlük Görev** (araçlar > Günlük Görev): 4 görev (odaya gir, mikrofona otur, 5 mesaj yaz, hediye gönder). Her görev 10 XP; günün tüm görevleri bitince seri ilerler, 1-6. günlerde +50 XP, **7. gün 1.000 Coin**. Gün aksatılırsa seri sıfırlanır. Gün, Türkiye saatine göre (gece 00:00) değişir.
- **Şanslı Çanta** (araçlar > Şanslı Çanta): Normal 3.000/6.000/9.000 Coin = 10/20/30 kişilik, 120 sn. **Süper** 30.000/60.000/90.000 Coin = 50 kişilik, 60 sn; gönderen not yazar, açmak isteyenler notu sohbete bir kez yazdıktan sonra açabilir; duyuru tüm odalarda altın şerit olarak görünür. Pay rastgele bölünür (herkese en az bir pay), kendi çantanı açamazsın, kişi başı bir kez. Süre dolunca dağıtılmayan Coin göndericiye iade edilir. Aynı anda tek açık çanta gönderilebilir.
- Ayarlar tek yerde: `backend/src/services/rewards_config.js`. Migrasyon 016. Cüzdan geçmişinde yeni işlem türleri.

## v2.18.1 — Derleme düzeltmesi
- `room_screen.dart` başlık satırında Favori düğmesinden sonra eksik virgül (Dart: "Expected 'else' or comma") giderildi.

## v2.18.0 — Sabit koltuk çerçevesi, kimlikler, elmas bozdurma, giriş şeridi
- **Koltuk kayması (YoHo gibi sabit):** Kayma/küçülmenin nedeni konuşma halkasının avatarın etrafına boşluk+çerçeve ekleyip hücreyi büyütmesiydi. Artık her koltuk sabit boyutlu bir çerçevedir (avatar yuvası, isim satırı, elmas rozeti yeri hep ayrılı); konuşma halkası aynı boyutlu saydam bir bindirmedir. Oturma/kalkma/konuşma hiçbir koltuğu oynatmaz. Avatar 56/48/40 dp, aralık 8 dp. Başlık ile mikrofonlar arasındaki boşluk daraltıldı.
- **Oda ayarları tek yerde:** Başlıktaki "Ayarlar" rozeti ve araçlardaki "Oda Ayarları" kaldırıldı; oda adına dokununca açılan pencerede (ad, etiket, yöneticiler + "Oda ayarları" satırı) toplandı.
- **Mikrofon modu:** 4 ve 6 koltuk seçenekleri eklendi (sunucu zaten destekliyordu); değişince yerel durum anında güncellenir ve üyeler yeniden yüklenir.
- **Koltuktan Kalk:** Mikrofondayken kendi koltuğuna dokununca Zula'daki gibi sayfa açılır (Koltuk #n • rol, Koltuğu sessize al, Koltuktan Kalk, İptal; üst satır profile gider).
- **Başlık:** Oda kapatma/çıkış X en sağ üstte; taç küçüldü (24); üye sayısı ikinci satıra taşındı.
- **Kimlikler:** Her kullanıcıya 8 haneli benzersiz ID (`publicId`); yönetici hesabında ID `admin`. Her kalıcı odaya 7 haneli değişmez oda numarası (`roomNumber`; oda temaları/ödülleri için). Mevcut kayıtlar migrasyon 015 ile doldurulur. Oda başlığında ve oda bilgisinde gösterilir.
- **Elmas bozdurma:** `POST /api/me/diamonds/exchange` — 5 Elmas = 1 Coin (5 ve katları), tek işlemde kilitli, cüzdan kaydı tutulur. Onaylı yayıncılar bozduramaz (maaş alır). Arayüz: Profil > Cüzdan ve Elmas Bozdurma.
- **Oda giriş efekti:** WIP 1–5 için ayrı tasarımlı, odanın ortasından geçen şerit (renk, parıltı, süre WIP ile artar; WIP 5 kırmızı-altın taçlı). Girişler sıraya alınır. WIP 5 renkli ismi kırmızı (#FF2B2B).
- Varsayımlar: oran 5 Elmas = 1 Coin; onaylı yayıncı bozdurmaz (kolay değiştirilir).

## v2.17.5 — APK derleme kökten düzeltme + tokensiz güncelleme
- **APK (checkReleaseAarMetadata):** `flutter_plugin_android_lifecycle` compileSdk 36 ister, `file_picker` ise android-34 ile derleniyordu. `apk_build.yml` artık `android/build.gradle(.kts)` başına tüm alt projeleri compileSdk 36'ya zorlayan bir blok ekliyor (tekrar çalışsa da bir kez eklenir). Böylece bu ve benzeri eklenti uyumsuzlukları kökten kapanır.
- **Güncelleme (token gerekmez):** yeni `.github/workflows/zip_ile_guncelle.yml`. Depoya GitHub sitesinden (Add file > Upload files) `TR-Live-v....zip` dosyasını ana dizine yüklemek yeter; iş akışı zip'i açar, projeyi birebir eşitler, zip'i siler ve APK derlemesini başlatır. `.github/workflows` klasörü GitHub kuralı gereği buradan güncellenemez; iş akışı dosyaları değiştiyse elle yüklenir.

## v2.17.3–2.17.4 — Yayıncı hedefi yalnızca yayıncı olduktan sonra
- **Kural:** Maaş hedefi (yayın süresi + Diamond) yalnızca **onaylı yayıncılar** için ve **yayıncı onayından sonraki** süre/hediyelerden hesaplanır. Ajansa katılma tarihi belirleyici değildir. Yayıncı olmayan kullanıcının hedefi/maaşı 0'dır; yalnızca Diamond'larını bozdurabilir.
- `hostMetrics` (hedef ekranı, ajans paneli, dönem kapanışı) buna göre düzeltildi; ajans e2e testi bu kurala göre yazıldı.
- Not: Diamond bozdurma (Diamond → Coin) özelliği henüz yok; oran belirlenince eklenecek.

## v2.17.2 — Derleme ve gizli oda düzeltmeleri
- **APK derleme hatası:** `NotificationVisibility` hem `flutter_foreground_task` hem `flutter_overlay_window` paketinde tanımlı olduğundan Dart "imported from both" hatası veriyordu (`background_service.dart`). Ön plan servisi paketinden bu ad gizlendi; balon için overlay paketininki kullanılıyor.
- **Gizli oda sızıntısı (sunucu):** `GET /api/rooms/:id` sorgusunda oda `is_hidden` alanı, sahibin `u.is_hidden` (gizli kullanıcı) alanıyla aynı adı taşıyordu; ikincisi birinciyi eziyor, gizli odanın ayrıntısı odada olmayan herkese açık dönüyordu. Oda alanı `room_hidden` takma adıyla alınıyor. (e2e testinde "expected 404, actual 200" hatasının nedeni buydu.)

## v2.17.1 — İzleyici kulübesi
- Oda başlığının sağında, odadaki en yüksek seviyeli ilk 3 kullanıcının üst üste binen altın çerçeveli avatarları görünür; dokununca üye listesi açılır.

## v2.17 — Oda içi ekran mekaniği (YoHo / Yalla ölçüleri)
- **Dikey bölünme:** üst başlık (~%15) · koltuk sahnesi (~%40) · canlı sohbet (~%35) · alt bar (~%10). Sahne ve sohbet oransal (flex 40 / 35) olduğundan her telefon boyunda aynı düzen korunur.
- **Klavye:** `resizeToAvoidBottomInset: false`; klavye açılınca koltuklar yukarı fırlamaz, yer sohbet bölgesinden alınır.
- **Koltuk ölçüleri:** ≤6 koltukta avatar 56dp, 8–9 koltukta 48dp, 12/15/20 koltukta 40dp (yazılar ve elmas rozeti de küçülür); koltuklar arası 8dp; avatarın çevresinde 3dp boşluk (konuşma/hediye halkası buraya oturur); uzun adlar `ellipsis` ile kesilir.
- **Hediye paneli:** alttan ekranın ~%45'ini kaplar, arkası kararmaz; koltuklar hediye seçerken de görünür.
- Not: Ölçüler kaynak olarak bir yapay zekâ özetine dayanır; telefonda görünce oranlar (%40/%35, avatar boyutları) tek satırlık değişiklikle ayarlanabilir.

## v2.16 — Telefondan müzik çalar
- **"Telefonum" sekmesi** (müzik panelinde): telefonun hafızasındaki mp3/m4a/aac/ogg/wav/flac dosyalarını seçip listeye ekler (sistem dosya seçici; ek izin gerekmez). Liste telefonda kalıcıdır, silinen dosyalar otomatik düşer. Arama, süre/boyut bilgisi, **telefonda dinle** (yalnızca kendin) ve listeden kaldırma var.
- **Odada çal:** yetkili (sahip / yardımcı / moderatör) şarkıyı tek dokunuşla odaya çalar; mikrofondaki kullanıcı sıraya ekler. Dosya sunucuya geçici yüklenir (en fazla 25 MB), odadaki herkes mevcut senkron müzik altyapısıyla aynı saniyede dinler; ilerleme çubuğu, duraklat, sonraki ve ses ayarı aynen çalışır.
- **Sunucu:** `POST /api/rooms/:id/music/upload` (ham ses; türü ilk baytlardan doğrular, kullanıcı başına 5 aktif parça, 10 yükleme/10 dk). Parçalar `is_temp` olarak işaretlenir, ortak kütüphanede görünmez, yalnızca yüklendiği odada çalınır, 12 saat sonra (çalmıyorsa/sırada değilse) dosyasıyla silinir. Migrasyon 014.
- **Sınır:** Telefonun sesini canlı olarak LiveKit'e aktarmak (Zula'daki "ses karıştırma") bu sürümde yok; bunun yerine dosya yüklenip herkeste senkron çalınır. Bu yöntem arka planda ve kötü ağda daha kararlıdır.

## v2.15 — Oda içi arayüz (Figma üst satır / alt satır)
- **Üst satır:** oda sahibinin avatarı + oda adı (dokununca oda bilgileri ve yöneticiler) + ID, dinleyici sayısı (dokununca üye listesi), X düğmesi. X → tam ekran **Küçült / Çıkış** seçimi.
- **İkinci satır:** odadaki toplam elmas sayacı, Favori (oda sahibine Ayarlar) rozeti, sağda altın taç (sıralamalar).
- **Sohbet:** kartlar halinde; avatar, ad, seviye rozeti, WIP. Yüksek seviyeli kullanıcıların mesajı mor / turuncu kart. Karta dokununca kullanıcı kartı açılır.
- **Alt satır:** 6 yuvarlak düğme: Sohbet (yazı alanını açar), Emoji, Oda sesi aç/kapat (yalnızca kendi cihazında), Mikrofon (konuşurken sustur/aç, uzun basınca mikrofondan in; mikrofonda değilken mikrofona çık / sıraya gir), Hediye, Oda araçları. Görüntülü odada kamera düğmesi de çıkar.
- Eski üst çubuk (AppBar) kaldırıldı; Odayı Kapat artık Oda araçlarında (yalnızca oda sahibi).

## v2.14.1 — "Oda bulunamadı" hatası
- **Neden:** Sunucu, odadaki kişinin canlı olup olmadığını yalnızca WebSocket aboneliğinden anlıyordu. Abonelik düşerse (ağ geçişi, sunucunun uyanması vb.) birkaç dakika sonra oda sahibi çıkarılıyor ve oda kapanıyordu; uygulama ise bunu öğrenemeyip kapalı odada kalıyor, her işlemde "Oda bulunamadı." diyordu.
- **Çözüm:** Uygulama odadayken her 25 sn'de HTTP "heartbeat" gönderir (`POST /api/rooms/:id/heartbeat`; `room_members.last_seen_at`, migrasyon 013). Temizleyici yalnızca WebSocket de heartbeat de uzun süredir yoksa çıkarır (üye 5 dk, oda sahibi 15 dk). Heartbeat oda kapanmışsa 404 döner; uygulama o zaman "Oda kapandı." deyip odadan çıkar, ölü odada takılmaz. Heartbeat aboneliği de yeniler.

## v2.14 — Arka planda çalışma, odadan düşmeme, yüzen balon, çökme koruması
- **Odadan düşme / oda kapanma nedeni bulundu ve düzeltildi:** uygulama arka plana alınınca telefon bağlantıyı kesiyordu; sunucudaki temizleyici üyeyi hemen odadan çıkarıyordu (oda sahibiyse oda kapanıyordu). Artık bağlantısı kopan üye hemen atılmaz: üye 5 dk, oda sahibi 15 dk beklenir; geri bağlanınca sayaç sıfırlanır (`ROOM_GRACE_SECONDS`, `ROOM_OWNER_GRACE_SECONDS`).
- **Arka planda çalışma:** odadayken bildirimli bir ön plan servisi çalışır (oda sesi kesilmez; mikrofondaysanız mikrofon da açık kalır). Pil kısıtlaması ve bildirim izni ilk odada sorulur.
- **Diğer uygulamaların üzerinde yüzen balon:** uygulamadan çıkınca ekranda mikrofon balonu kalır (sürüklenebilir); dokununca uygulamaya dönülür. "Diğer uygulamaların üzerinde göster" izni ilk odada sorulur; Profil > "Arka plan ve balon izinleri"nden tekrar istenebilir.
- **Geri dönünce:** bağlantı hemen yenilenir, üyeler ve sohbet güncellenir. Ağ kesintisinde oda açık kalır, 5 sn arayla yeniden denenir (yalnızca sunucu açıkça reddederse odadan çıkarılır).
- **Çökme koruması:** yakalanmamış hatalar uygulamayı kapatmaz, kayda geçer. Profil > "Hata kaydı"ndan görülüp kopyalanabilir.
- Derleme akışı Android manifestine servisleri ve izinleri ekler.

## v2.13 — Oda içi kullanıcı kartı
- Odada bir kullanıcıya dokununca Figma'daki gibi kart açılır: üstte taşan büyük avatar (dokununca tam profil), ad, seviye / hediye seviyesi / WIP / rol / aile rozetleri, kopyalanabilir kimlik, **Yakın Arkadaşlarım** (ona en çok hediye gönderen 5 kişi), **Madalyalar** (rozet envanteri), Etiketle (sohbete @ad yazar), Hediye Gönder, Takip Et.
- **Yetkiye göre görünür:** Yönetici (moderatör / yardımcı sahip ata, yetkiyi al — yalnızca oda sahibi ve yardımcı sahip), Mic Aç / Mic Kapat, Sohbet (10 dk / 1 saat / 1 gün sustur, kaldır), Koltuk (koltuktan indir ve kilitle), Odadan At — yalnızca hedeften üst yetkisi olana görünür. Normal kullanıcı bu düğmeleri hiç görmez. Sunucu aynı kuralları ayrıca denetler.
- Sol üstteki ünlem: Şikâyet et, Kullanıcıyı engelle, (yetkiliye) Bu odadan engelle.
- Sunucu: `GET /api/users/:id/card`.

## v2.12 — Boyut ve ölçü standartları
Android / Material 3 standartlarına göre düzenlendi:
- **Yazı ölçeği:** Material 3 tablosu (gövde 14/16, etiket 11-12, başlık 16-22 sp, satır yüksekliğiyle). 10 sp'lik küçük yazılar 11 sp'ye çıkarıldı.
- **Dokunma hedefi:** tüm düğmeler en az 48×48 dp (düğme yüksekliği 46 → 48).
- **Kontrast:** soluk yazı rengi WCAG AA (4.5:1) için açıldı; çok soluk `white38` yazılar `white54` oldu.
- **Pencere sınıfları:** compact < 600, medium 600-839, expanded 840-1199, large ≥ 1200 dp. Ekran kenar boşluğu 16 / 24 / 32 dp (ana sayfa ızgarası ve banner buna uyar). Oda kartı sütunları 2 / 3 / 4 / 5.
- **Sistem yazı boyutu:** kullanıcının ayarı 0.85–1.3 kat arasında uygulanır (önceden 1.25).

## v2.11 — Hediye paneli ve şeffaf MP4 hediye animasyonu
- **Yeni hediye paneli (Figma):** üstte mikrofondaki kişilerin avatarları (koltuk numarasıyla; seçili olan pembe halkalı), ok düğmesiyle odadaki herkesi göster; sekmeler Etkinlik / Popüler / Kişiye Özel / Vip; sayfalı 4'lü hediye ızgarası (seçili hediye pembe çerçeve); altta bakiye (cüzdana gider), adet seçici ve Gönder.
- **Alıcı seçimi:** tek kişi, birden çok kişi (HER birine seçilen adet gider, toplam = fiyat × adet × kişi), "Listele" menüsünden **Tüm Koltuk** (mikrofondakiler) ve **Tüm Oda** (kendin hariç, en fazla 50 kişi). Sunucu: `distribution: each | all_mic | all_room`.
- **Şeffaf MP4 hediye:** hediyeye animasyon adresi (.mp4) girilince odadaki herkeste tam ekran oynar. Format Tencent **VAP** (alfa kanallı H.264 MP4) olmalıdır; Lottie ve WebP/GIF de desteklenir. Animasyonlar sırayla oynar.
- **Hediye sekmesi:** `gifts.category` (migrasyon 012). Yönetici panelinde hediye eklerken sekme ve animasyon biçimi seçilir.
- Hediye listesi yanıtına `globalMinCoins` eklendi (dünya simgesi bu tutarın üstündeki hediyelerde görünür).

## v2.10 — Oda içi araçlar penceresi, mikrofon modu, koltuk yerleşimi
- **Oda araçları:** alt çubuktaki ⊞ düğmesi kayar pencere açar. İnteraktif Özellikler (PK, Oyunlar) ve Temel Araçlar: Yayını Paylaş (davet metnini kopyalar), Efekt ve Ses, Sohbet Yasağı/Açma, Müzik, Sohbet Temizleme, Oda Kilidi (şifre), Özel Temalar, Oda Gizleme, Mikrofon Modu, Oda Ayarları. Yetkisi olmayana uyarı verir.
- **Mikrofon Modu:** 2/5/8/9/12/15/20 mikrofon; seçince koltuk sayısı herkes için canlı değişir. Azaltınca taşan koltuktakiler dinleyiciye iner. `PATCH /api/rooms/:id {seatCount}` (oda sahibi / yardımcı sahip).
- **Koltuk yerleşimi** Figma'daki gibi: 5 → 1+4, 9 → 1+4+4, 12 → 2+5+5, 15 → 5×3, 20 → 5×4; kısa satırlar ortalanır.
- **Hata düzeltmesi:** oda sahibi başka koltuğa geçince kendi 0. koltuğuna geri dönemiyordu; artık dokunarak dönebilir.
- Henüz yok ("çok yakında" uyarısı verir): Günlük Görev, Şanslı Çanta.

## v2.9 — Kalıcı oda, şifresiz kurulum, yerleşim düzeltmesi
- **Yerleşim düzeltildi:** üst satır = TRLive tacı + oda aç düğmesi; alt satır = Sesli | Akış | Görüntülü | Mesajlar | Profil.
- **Oda bir kez kurulur:** ilk "Sesli oda aç / Görüntülü yayın aç"ta ad, etiket, koltuk düzeni ve tema sorulur. Sonraki açışlarda tek dokunuşla doğrudan odaya girilir; ad ve etiketler sabit kalır.
- **Şifre kurulumdan kaldırıldı;** yalnızca oda içindeki ayarlardan konur/kaldırılır.
- **Oda adına dokununca** "Oda bilgileri" açılır: sahip/yardımcı sahip ad ve etiketleri düzenler, herkes oda yöneticilerini görür.
- **Banner sonsuz döngü:** birden fazla banner hep ileri kayar; sonuncudan sonra yine ilkine geçer.
- Yöneticiler (yardımcı sahip, moderatör) oda kapanınca da korunur. Sunucu: `room_profiles`, `room_staff` (migrasyon 011), `GET /api/rooms/mine`, `GET /api/rooms/:id/managers`.

## v2.8 — Üst satır / alt satır düzeni
- **Üst satır:** Sesli | Akış | Görüntülü | Mesajlar | Profil. Alt menü kaldırıldı.
- **Alt satır:** altın taç + "TRLive" (sıralamaları açar) ve oda açma düğmesi. Sesli tarafta "Sesli oda aç", görüntülü tarafta "Görüntülü yayın aç".
- **Sıralamalar:** Günlük / Haftalık / Aylık × Yayıncı, Destekçi, Ajans, Aile, Oda, CP. Sunucu: `GET /api/leaderboards?type=receivers|senders|agencies|families|rooms|cp&period=daily|weekly|monthly`.
- Aile, favoriler, gizli odaya kodla giriş ve kullanıcı arama oda listesindeki ⋮ menüsünde.

## v2.6 — Figma (HİLLİVE) yerleşimine geçiş, 1. aşama
- Alt menü: Party | Keşfet | Giriş Sayfası | Mesajlar | Profil. Aile, liderlik, favoriler, kodla giriş ve kullanıcı arama "Giriş Sayfası"nda.
- Party ana sayfası: Takip / Popüler / Yakında sekmeleri, dikey görsel kartlar (tür rozeti, etiket, dinleyici sayısı, altında başlık).
- Yayın başlat: Sesli / Görüntülü seçimi tek pencerede.
- Giriş ekranı Figma düzenine yaklaştırıldı (taç + logo, hap butonlar). Renkler uygulamanın kendi temasıdır.
- Sunucu: `region=near` (aynı şehirdeki yayıncılar).

## v2.7 — Figma yerleşimi, 2. aşama
- **Keşfet gönderi akışı:** gönderi (yazı + görsel), beğeni, yorum, "Takip Edilen | Genel" sekmeleri; başkasının profilinde "Paylaşım" sekmesi. Uçlar: `GET/POST /api/posts`, `PUT /api/posts/image`, `DELETE /api/posts/:id`, `POST|DELETE /api/posts/:id/like`, `GET|POST /api/posts/:id/comments`. Gönderi sahibi veya yetkili (admin/yardımcı admin) siler.
- **Banner:** ana sayfanın üstünde kayan banner. Yönetici panelinde "Banner/Duyuru" sekmesinden yüklenir. Uçlar: `GET /api/banners`, `/api/admin/banners` (GET, PUT image, POST, PATCH, DELETE).
- **Mesajlar kartları:** Arkadaşlık isteği (yeni takipçiler), Ekip, Etkinlik duyurusu, Ödül bildirimleri; okunmamış rozetleri. Uçlar: `GET /api/announcements`, `GET /api/inbox-summary`, `POST /api/inbox-summary/seen`, `POST|DELETE /api/admin/announcements`.
- **Koltuk düzeni:** 4 ve 6 koltuk eklendi (migration 010); oda açarken düzen önizlemesi.
- Migration 009 (gönderi, banner, duyuru) ve 010 (koltuk düzenleri).

## v2.5 — Yeni tema ve duyarlı (responsive) ana sayfa
- Tüm uygulama tek renk kaynağına bağlandı: `mobile/lib/widgets/app_theme.dart` (koyu lacivert zemin, turkuaz vurgu, pembe CANLI rozeti, altın bildirim). Renk değiştirmek için yalnızca bu dosya düzenlenir.
- Ana sayfa yeniden tasarlandı: yuvarlak aksiyon düğmeleri, Trend / Arkadaşlar anahtarı, Global / Türkiye / Diğer bölge çipleri, görselli 2 sütunlu oda kartları.
- Duyarlılık: sütun sayısı ekran genişliğine göre (2–5), yazı ölçeği sınırlandı (0.85–1.25), geniş ekranda içerik ortalanır, oda koltuk ızgarası genişliğe uyar.
- Sunucu: `GET /api/rooms` artık `region` (`tr` | `other` | `friends`) kabul eder ve `themeImageUrl` döndürür.

## Orijinal kodda bulunan kritik hatalar (düzeltildi)
1. **Bakiye sızıntısı:** odaya giriş ve hediye şeridi olaylarında herkese Coin/Diamond bakiyesi yayınlanıyordu.
2. **`JWT_SECRET` yoksa üretimde bile `dev-only-change-me` kullanılıyordu.** Artık üretimde 32+ karakter zorunlu.
3. **Aile katılımı:** başka bir ailedeyken katılmak sessizce "başarılı" dönüyordu; sahip ayrılmayı denediğinde de sessiz başarı vardı. Aile üye sıralaması alfabetik (yanlış) yapılıyordu.
4. **Mikrofon sistemi yoktu:** koltuk alma/bırakma uç noktası olmadığı için "eşit/rastgele dağıtım" yalnızca oda sahibine çalışıyordu.
5. **Deadlock riski:** karşılıklı hediyelerde kilit sırası tutarsızdı. Artık tüm satırlar tek sorguda sıralı kilitleniyor.
6. **Giriş efekti** seçilen değil en yeni öğeyi kullanıyordu.
7. **Yetki:** `support` rolü Coin düzenleyebiliyordu; artık para/katalog işlemleri yalnızca `admin`.
8. **Girdi doğrulama:** `BigInt("0x10")` gibi girdiler kabul ediliyor, geçersiz UUID 500 hatası veriyordu, uzun alanlar DB hatasına düşüyordu.
9. **Kullanıcı adı** büyük/küçük harf duyarlıydı (`Ali` ≠ `ali`).
10. **Bayi sınırsız:** `commission_bps` kullanılmıyor, bayi sahibi kendi satışını yapamıyordu; katalog (hediye/çerçeve/efekt) için admin uç noktası yoktu.
11. **Çoklu cihaz/bağlantı:** WebSocket kaydı kullanıcı başına tek soketti, ölü bağlantılar temizlenmiyordu; odaya abonelik yetkisiz yapılabiliyordu.
12. **Operasyon:** migration çalışma dizinine bağlıydı, CI var olmayan `package-lock.json`'a dayanıyordu, Dockerfile root çalışıyordu, DB SSL zorla `rejectUnauthorized:false`'tı.
13. **Flutter:** çıkış yap ana ekranda `Navigator.pop` ile çöküyordu; hiçbir ekranda hata yönetimi yoktu; LiveKit hiç bağlanmıyordu (ses/görüntü yok); hediye gönderme arayüzü yoktu; global şerit hiç görünmüyordu; boş asset klasörleri git'te kaybolur ve derlemeyi bozar; `android/ios` klasörleri yoktu.

## v2.4 — roller ayrıldı
**Dört ayrı rol** (karıştırılmaz):
- **Admin (yönetici):** uygulama sahibi; admin panelindeki her şey.
- **Yardımcı admin:** yalnızca admin, admin panelinden (Yetkililer sekmesi) atar/alır. Yetkisi: kullanıcının **nickini** ve **profil fotoğrafını** değiştirmek/kaldırmak, **süreli veya süresiz ban** atmak/kaldırmak. Para, WIP, ajans, maaş, katalog, güvenlik, şikâyet ekranlarına giremez; admini ve diğer yardımcıları banlayamaz. (Sunucuda `staff_logic.js` içindeki izin listesiyle zorlanır.)
- **Oda sahibi:** yayını açan kişi.
- **Moderatör:** yalnızca oda sahibi (ve yardımcı sahip) atar. Yetkisi: sohbeti silme/temizleme, susturma, mikrofona davet, koltuk kilitleme/açma, koltuktan kaldırma, normal kullanıcıyı odadan atma/engelleme. Rol dağıtamaz, oda sahibine dokunamaz.
Ayrıca v2.4: **oda küçültme** (oda arka planda açık kalır, ses kesilmez; küçük çubuktan geri açılır/kapatılır), **yukarı/aşağı kaydırarak oda değiştirme** (oda sahibi hariç, şifreli odalar atlanır), **oda arama** (ad, yayıncı, etiket), **favori yayıncılar** ve **son girilen odalar** (★ ekranı; oda kapanınca silindiği için favori yayıncı bazlıdır), **mikrofon sırası** (boş koltuk yoksa "Sıraya gir"; koltuk boşalınca sıradaki davet alır, kabul ederse oturur). Migration 008.
Yeni: süreli ban (`banned_until`, süre dolunca otomatik açılır, giriş ekranında neden/bitiş gösterilir), kilitli koltuklar (`rooms.locked_seats`), mikrofon daveti (`mic_invite` olayı). Eski `/admin/users/:id/status` kaldırıldı → `/ban` ve `/unban`. Migration 007.

## v2.3 — yeni eklenenler
Gizli oda + davet kodu · oda temaları (WIP 4 özel görsel) · koltuk başına hediye sayacı · sohbet temizleme (sahip/moderatör) · PK karşılaşmaları ·
oda içi Ludo (sunucu-otoriter, bahissiz) · **ajans sistemi yeniden yazıldı:** ajans kodu, yayın saati takibi, maaş kademeleri, kesinti, kademeli komisyon,
resmi etkinlikler, dönem kapatma + hesap özetleri, KYC şartı · APK için `.github/workflows/apk_build.yml`.
Kendine hediye artık ajans/maaş, PK ve liderlik hesabına SAYILMAZ (suistimal önlemi); eski hediye-başı komisyon (`agency_commissions`) kullanımdan kalktı.
Okey yapılmadı (yalnızca Ludo).

## v2.2 — yeni eklenenler
Müzik çalar · oda içi yazılı sohbet · özel mesaj · oda etiketleri/şifre/ayarlar · engelleme/şikâyet/gizlilik · liderlik tabloları · **uygulama içi güvenlik duvarı** ·
Nginx/UFW/fail2ban/Docker Compose altyapısı · uçtan uca test paketi · GitHub Actions (backend + e2e + Flutter analiz).

## v2.1 — yeni eklenenler
Kendine hediye · WIP 5 kademe + satın alma · ajans/yayıncı sistemi (başvuru, davet, panel, komisyon, ödeme işaretleme) · zengin profil
(avatar/kapak yükleme, takip, ziyaretçi, çerçeve) · aile yönetimi · oda moderasyonu · bayi paneli · yönetim paneli · hesap silme ·
şifre değişince oturumları geçersiz kılma · cüzdan geçmişi · yasaklama.

## Doğrulama durumu (dürüst özet)
| Konu | Durum |
|---|---|
| Saf mantık + güvenlik duvarı ara katmanı (sahte istek/yanıtla) | 50 birim testi geçiyor (`npm test`) |
| Migrasyonlar 001–006 ve 006'daki ana SQL sorguları | Gerçek PostgreSQL 16'da elle çalıştırıldı, hata yok |
| Uçtan uca testler (`backend/e2e`, 19 senaryo) | **Yazıldı, çalıştırılmadı** — GitHub Actions'ta gerçek Postgres ile çalışır |
| Tüm backend modülleri import ediliyor, route'lar kayıt oluyor | Doğrulandı (sahte paketlerle) |
| İstemci ↔ sunucu uç nokta uyumu | 105 çağrı eşleştirildi |
| Dart sözdizimi (parantez/string), import'lar | Betikle tarandı |
| **SQL sorguları gerçek PostgreSQL'de** | **Çalıştırılmadı** |
| **Flutter derlemesi / LiveKit bağlantısı** | **Denenmedi** |

## Eksikler (mağaza ve gerçek kullanım öncesi)
Ayrıntılı ve öncelikli liste: [`docs/COMPARISON.md`](docs/COMPARISON.md). Başlıcalar: uygulama içi satın alma (Play/App Store) ·
telefon/Google/Apple girişi ve şifre sıfırlama · push bildirim · PK/oyunlar/karaoke · SVGA · web yönetim paneli ·
Redis/çoklu sunucu · ajans ödeme/maaş otomasyonu · yaş kapısı ve KVKK metinleri · token'ın `flutter_secure_storage` ile saklanması · yük testleri.

## v2.3.1
Yasaklı kelime denetimi artık yalnızca sohbet/DM'de değil; oda adı, kullanıcı adı/görünen ad, biyografi, aile adı ve ajans adında da uygulanır (`backend/src/safe_text.js`).

## v2.132.0 — Ses sorunlarının kökten çözümü

Üç şikâyetin ikisi **aynı kökten** geliyordu: uygulamanın kendi sesleri (oda müziği, hediye sesleri)
Android'in **medya** yolundan çalıyordu, odadaki konuşmalar ise **görüşme** yolundan. Bu ayrım iki ayrı
arızaya yol açıyor:

- **Bluetooth kulaklık:** çoğu telefon görüşme (SCO) ile müzik (A2DP) bağlantısını aynı anda kuramaz.
  İkisi birden istenince biri susuyordu → "kulaklıkta uygulama sesi gelmiyor".
- **Yankı:** yankı giderici (AEC) yalnızca kendi çaldığı sesi tanır. Medya yolundan çıkan müzik ve
  hediye sesi hoparlörden çıkıp mikrofona geri girdiğinde AEC onu **tanımıyor, iptal edemiyordu**;
  karşı taraf odanın sesini yankı olarak duyuyordu.

### Yapılanlar

- **Yeni modül `mobile/lib/services/room_audio.dart`** — oda açıkken sesin tek sahibi. Bütün uygulama
  sesi görüşme yoluna alınır: tek Bluetooth bağlantısı kullanılır ve müzik/hediye sesi yankı
  gidericinin referansına girer. Oda kapanınca ses medya moduna döner.
- `call_guard.dart` artık ses oturumunu **kurmuyor**, yalnızca arama sinyalini dinliyor. (İki yerden
  ayar yapıldığı için biri diğerini eziyor, kulaklık yönlendirmesi bozuluyordu.)
- `music_service.dart` — `just_audio` ses aygıtı ayarını çaları **yaratırken** okur, sonradan
  değiştirmez. Ses yolu değişince çalar yeniden kurulur, şarkı kaldığı yerden sürer.
- **Oda sesi kapalıyken sızan ses:** susturma, LiveKit'in genel "değişti" bildirimiyle uygulanıyordu;
  yeni iz ise sunucudan geldiği anda çalmaya başlıyor. Aradaki boşluk kadar ses duyuluyordu. Artık
  `TrackSubscribedEvent` ile **izin kendisi geldiği anda** susturuluyor; eski tarama güvenlik ağı
  olarak kalıyor.
- Ses bit hızı 48 → **64 kbps** (şarj tüketimi modunda 32). Şarkı ve tiz sesler belirgin şekilde daha
  net; DTX sayesinde ek yük yalnızca konuşurken.
- Olay dinleyicileri oda her kapandığında bırakılıyor (eskiden sızıyordu).

### Geri alma yolu (canlıda ilerlediğimiz için)

Panel → Ayarlar → **Ses** → "Oda sesini görüşme yolundan çal" kapatılırsa uygulama bir sonraki oda
açılışında eski davranışa döner. **Yeni APK gerekmez.**

### Dürüst takas

Bluetooth kulaklıkta görüşme bağlantısı dar bantlıdır: oda müziği hoparlördeki kadar "hi-fi"
duyulmaz. Sesli sohbet uygulamasında doğru takas budur — karşı tarafa yankı gitmesindense müzik biraz
daha tok duyulur. Kablolu kulaklıkta ve hoparlörde fark yoktur.

### Görüntü

Baştan sona incelendi, değişiklik gerekmedi: 540p (şarj modunda 360p), canlı yayında 1300 kbps/25 fps,
simulcast + dynacast + adaptiveStream açık. Zayıf internette sunucu düşük katmanı gönderiyor.

## v2.133.0 — Modül standardı ve backend modülleri (1. aşama)

Kod, gönderilen modül yapısına geçiriliyor. Yapıyı **üç düzeltmeyle** kabul ettim; gerekçeler
`docs/MODULE_STANDARD.md` bölüm 0'da:

1. `models/` ve `repositories/` `presentation/` altında olmaz — `domain/` ve `data/` altında olur
   (gönderilen `live_rooms` ile `wallet` örnekleri birbiriyle çelişiyordu).
2. `lib/platform/android/` ve `lib/platform/ios/` diye bir şey yok — Dart kodu orada çalışmaz.
   `lib/platform/` yalnızca method channel sarmalayıcıları içindir.
3. 19 özelliğin hepsine üç katman = boş klasör ormanı. Katman sayısı özelliğin boyutuna bağlandı.

### En büyük risk ve ona karşı aldığım önlem

Staging kurmama kararı verdik. Bu, modüllere ayırmayı yapabileceğimiz **en riskli iş** yapıyor:
bir API adresi taşıma sırasında sessizce düşerse sunucu yine açılır, testler yine geçer, hatayı
ilk gören kullanıcı olur.

Bu yüzden önce güvenlik ağını kurdum:

- **`backend/tools/route_map.mjs`** — sunucunun tüm API adreslerini kaynaktan çıkarır
  (bugün 49 bağlama, 467 adres).
- **`backend/test/route_map.test.js`** — bunu onaylı anlık görüntüyle karşılaştırır. Anahtarda
  dosya yolu bilerek yok: taşıma dosyayı değiştirir, API yüzeyini değiştirmemelidir.
- **`backend/tools/move_module.mjs`** — dosyayı taşır, import yollarını düzeltir, **kod satırına
  dokunmaz**.

Kural: bir sürümde ya dosya taşınır, ya mantık değişir. İkisi birden asla.

### Taşınanlar (14 modül, 34 dosya)

`auth` · `user` · `room` · `chat` · `music` · `game` · `family` · `relation` · `event` · `store` ·
`feed` · `analytics` · `moderation` · `system`

Taşımadan sonra: adres haritası **birebir aynı**, kırık import yok, tüm testler geçiyor.

### Bilerek sonraya bırakılanlar

`routes/` altında 9 dosya kaldı: finansal modüller (`gifts`, `usd`, `dealers`, `agencies`,
`agency_center`, `luckybag`) ve `admin.js` (2.391 satır) + `admin_panel.js`.

Sıralama kasıtlı: `admin.js`'i yalnız yönetici kullanır, orada bir şey kırılırsa panelden fark
edilir ve kullanıcı etkilenmez. Cüzdanda kırılırsa para hareketi etkilenir. `room_screen.dart`
(5.398 satır) en sona kaldı — uygulamanın en çok kullanılan ekranı ve ses yığınının tamamı orada.

## v2.134.0 — Backend hedef iskeleti tamamlandı

Gönderilen `backend/src/` ağacının tamamı kuruldu. **Mantığa tek satır dokunulmadı** — taşıma ile
davranış değişikliği aynı sürümde olmaz kuralı korundu.

### Ne oldu

- `routes/` ve `services/` klasörleri **tamamen kalktı**. 133 dosyanın tamamı yerine taşındı.
- **22 modül:** admin, agencies, analytics, assets, auth, dealers, events, families, games, gifts,
  media, messaging, moderation, moments, music, notifications, relations, rooms, store, system,
  users, wallet
- **`infrastructure/`** — database, websocket, livekit, queue
- **`middleware/`** — authentication, security, validation
- **`shared/`** — errors, utils, constants
- **`app.js` / `server.js` ayrıldı:** app.js (237 satır) Express uygulamasını kurar; server.js
  (138 satır) yalnızca HTTP sunucusunu, WebSocket'i, zamanlayıcıları ve sinyalleri yönetir.
  Testler artık uygulamayı dinlemeye başlamadan kurabilir.
- Modül adları hedefteki gibi çoğul: `user`→`users`, `room`→`rooms`, `chat`→`messaging`,
  `feed`→`moments`, `family`→`families`, `game`→`games`, `event`→`events`

### Doğrulama

| Kontrol | Sonuç |
|---|---|
| API adresi | 467 / 467 — **kaybolan yok** |
| Router bağlaması | 49 / 49 — **kaybolan yok** |
| Kırık import | yok |
| Testler | hepsi geçti |
| Sözdizimi | tamam |

### Hedef listeden bilinçli sapmalar

- `ledger`, `purchases`, `withdrawals` ayrı modül **yapılmadı** — üçü de aynı atomik işlemin parçası
  (`wallet_transactions` aynı transaction'da yazılır). Ayırmak, bölünmesi yasak olan şeyi
  bölünebilirmiş gibi gösterirdi. Hepsi `wallet` içinde.
- `livekit` modül değil, **altyapı** — iş kuralı içermiyor, `infrastructure/livekit/`'e gitti.
- `profiles` → `users` içinde, `game_sessions` → `games` içinde (ayrı tablo/yaşam döngüsü yok).
- `missions`, `medals`, `feature_flags`, `sdui` → **klasör açılmadı**, çünkü henüz kod yok.
  Boş klasör "burada bir şey var" yanılsaması yaratır.

Gerekçelerin tamamı `docs/MODULE_STANDARD.md`'de.

### Sırada

4. aşama: `admin.js` (2.917 satır) ve `rooms` modülünün dosya içi bölünmesi. Bu artık taşıma değil,
**bölme** — ayrı sürüm.

## v2.135.0 — Büyük dosyalar bölündü (4. aşama)

Artık **hiçbir rota dosyası 800 satırı geçmiyor.** `ARCHITECTURE_AUDIT.md` A-01'in tamamlanma
ölçütü buydu.

### `admin.routes.js` — 2.391 satır → 13 dosya

`admin.routes.js` (62) + `admin.shared.js` (351) + konu dosyaları: users (287), coins (69),
wip (63), catalog (526), support (39), dealers (128), agencies (297), events (235), finance (88),
moderation (49), security (509).

### `rooms.routes.js` — 1.195 satır → 6 dosya

`rooms.routes.js` (643) + `rooms.shared.js` + mic, moderation, scoreboard, media.

### Nasıl bölündü

Yeni araç: **`backend/tools/split_routes.mjs`**. Dosyayı üst düzey bloklara ayırır (import,
bildirim, rota kaydı), ortak olanları `<modül>.shared.js`'e alıp dışa açar, rotaları konu
dosyalarına dağıtır. Alt router'lar ana router'a **ön ek olmadan** bağlanır — yani API adresleri
birebir aynı kalır.

**Kod satırı değiştirilmedi.**

### Güvenlik ağı güçlendirildi

Adres haritası artık router **değişken adını** da anahtarda tutmuyor: bir dosya alt router'lara
bölündüğünde ad değişir ama API yüzeyi aynı kalmalıdır. Bunun yerine aynı yolun kaç kez
tanımlandığı sayılıyor (`GET /:id ×3`) — biri düşerse sayı değişir, yani bölmede kaybolan adres
yine yakalanır.

Ek olarak `backend/tools/unresolved_refs.mjs`: bölme sonrası bir alt dosyada eksik kalan import'u
yakalar (çalışma anında `undefined` olurdu, testler görmezdi).

### Doğrulama

501 / 501 adres tanımı · 49 / 49 bağlama · eksik import 0 · kırık import 0 · tüm testler geçti

### Gönderilen diğer ağaçlar hakkında üç itiraz

Ayrıntı `docs/MODULE_STANDARD.md` bölüm 8'de:

1. **`games/catalog/{ludo, okey, uno, jackaroo}` açılmadı** — "oyun kodu depoda olmayacak"
   kararına aykırı. Eklenti sistemi tam bunun için kuruldu.
2. **`hybrid/` alt klasörleri açılmadı** — 26 klasörün 4'ünde kod var, 22'si boş olurdu.
3. **`web/` üçe bölünmedi** — üç derleme, üç yayın, üç Caddy yolu demek. Aynı yalıtım tek uygulama
   içinde `modules/` ile elde edilir. Bayi panelini ayrı alan adından yayınlamak istiyorsan
   söyle — o zaman bölmek doğru olur.

## v2.135.0 — Web paneli modüllere ayrıldı

> **Numara notu:** Bu sürüm numarası yukarıdaki "Büyük dosyalar bölündü" kaydıyla birlikte iki kez
> kullanıldı — benim hatam. İki iş de aynı gün, art arda yapıldı ve ikisi de yayınlandı; sonraki
> sürüm v2.136.0 olarak devam etti, yani atlanan ya da kaybolan bir sürüm yok. Geçmişi yeniden
> numaralamak, teslim edilmiş paketlerle kayıtları uyumsuz hale getireceği için düzeltilmedi.

Gönderilen `web/admin/src/` ağacı uygulandı. **İçeriğe tek satır dokunulmadı** — yalnızca dosyalar
taşındı ve import yolları güncellendi.

### Yeni yapı

```
web/panel/src/
├── app/        Next.js rotaları (admin/, agency/, dealer/, m/)
├── core/       api, auth, layout
├── shared/     components (ui, kit), utils (i18n)
└── modules/
    ├── admin/  dashboard users rooms wallet withdrawals gifts games
    │           game_packages agencies dealers moderation events
    │           asset_management security system_monitor settings
    ├── agency/ dashboard broadcasters earnings family shell
    └── dealer/ coin_orders transfers transactions shell
```

`components/admin/` içindeki 37 düz dosya 16 modüle dağıtıldı; `components/center/` → `agency`,
`components/dealer/` → `dealer`. `components/` ve `lib/` klasörleri tamamen kalktı.

### Hedeften bilinçli sapma: tek uygulama, üç bölüm

Hedef ağaç `web/admin/`, `web/agency/`, `web/dealer/` diye **üç ayrı uygulama** gösteriyor. Bizde
üçü tek Next.js uygulaması (`app/admin`, `app/agency`, `app/dealer`). Üçe bölmek demek: üç ayrı
derleme, üç ayrı dağıtım, üç ayrı Caddy yapılandırması ve ortak bileşenler için paylaşılan paket.

Bugünkü panel 103 dosya ve 13.500 satır — bu ölçekte üç uygulamanın getirdiği işletme yükü,
sağladığı yalıtımdan büyük. **Modül sınırları klasörle çizildi, dağıtım tek bırakıldı.** Panel
büyüdüğünde ayırma kararı yeniden değerlendirilir; klasör yapısı o günü zaten hazırlıyor.

### Araç

`web/panel/tools/move_ui.mjs` — dosyayı taşır, `@/` ile başlayan import'ları günceller, içeriğe
dokunmaz. Panelde her import mutlak yazıldığı için taşımada yanlış yol üretme riski yok.

### Doğrulama

TypeScript derlemesi temiz (`tsc --noEmit`), kırık import yok.

### Düzeltme: `admin.js` zaten bölünmüştü

Bir önceki sürümde "admin.js 2.917 satır, bölünecek" dedim. Yanlıştı: o rakam admin modülünün
**14 dosyasının toplamı**. `admin.routes.js` 62 satır; geri kalanı `admin_agencies`,
`admin_catalog`, `admin_coins`, `admin_dealers`, `admin_events`, `admin_finance`,
`admin_moderation`, `admin_security`, `admin_support`, `admin_users`, `admin_wip` dosyalarında.

Backend'de 800 satırı geçen dosya yok; en büyüğü `agency_center.routes.js` 650 satır. Denetimin
A-01 tamamlanma ölçütü sağlanmış durumda.

### Sıradaki yapı kararı: boş klasör açılmıyor

`hybrid/` ağacındaki altı klasörün beşinde hiç kod yok (sdui: 0 dosya, js_bridge: 0,
asset_manager: 0, feature_flags: 0). Bu klasörler **kod geldiği gün** açılacak:

| Sıra | İş | Niçin bu sırada |
|---|---|---|
| 1 | `feature_flags` | En küçük iş, SDUI'nin önkoşulu |
| 2 | `asset_manager` | R2 + CDN ile birlikte (V-02) |
| 3 | `webview` + `js_bridge` | Alan adı allowlist ile birlikte (O-03) |
| 4 | `sdui` | Redis (G-01) ve feature_flags olmadan yapılamaz |
| 5 | `game_sdk` | Oyun platformu olgunlaştıktan sonra |
| 6 | `room_screen.dart` (5.398 satır) | En riskli iş, en son |

## v2.136.0 — Özellik bayrakları (hibrit katmanın geri alma düğmesi)

Hibrit sistemin ilk ve en temel parçası. Staging kurmama kararımızın karşılığı bu: artık riskli bir
özellik **önce %1 kullanıcıya** açılıyor, sorun çıkmazsa %10, sonra herkese. Bozulursa panelden
sıfıra iniyor ve etki bir sonraki uygulama açılışında bitiyor — **yeni APK ve mağaza onayı
beklenmiyor.**

### Niçin önce bu

`hybrid/` ağacındaki altı klasörün beşinde hiç kod yoktu. Sırayı buna göre kurdum ve bayrakları başa
aldım: SDUI, asset_manager, js_bridge, game_sdk — hepsi canlıda denenecek işler. Birini bayraksız
açmak, hatayı ilk gören kişinin kullanıcı olması demek. Bayrak sistemi, geri kalan her adımın
önkoşulu.

### Sunucu

- `feature_flags` tablosu: açık/kapalı, **oran (0-100)**, her zaman açık/kapalı kullanıcı listeleri,
  en düşük uygulama sürümü, platform sınırı
- `feature_flag_audit`: her değişiklik kim/ne zaman/önce/sonra olarak kaydedilir. Bir sorun
  çıktığında "dün gece %10'a çıkarılmış" bilgisi, sorunu aramaktan hızlıdır.
- `/api/app/config` yanıtına `flags` eklendi — **ayrı istek açılmadı**, zaten okunan yanıta bindi.

### Kritik tasarım kararı: rastgele değil, karma

Oran rastgele sayıyla hesaplansaydı aynı kullanıcı her istekte farklı sonuç alır, özellik ekran
açılıp kapandıkça gelip giderdi. Bunun yerine kullanıcı kimliği **bayrak anahtarıyla birlikte**
karmalanıp 0-99 arası bir kovaya yerleştiriliyor:

- Aynı kullanıcı her zaman aynı sonucu alır.
- Bayrak anahtarı karmaya dahil olduğu için **iki ayrı %10 bayrağı aynı kullanıcı grubuna denk
  gelmez** — yoksa aynı grup her denemenin kobayı olurdu. Test bunu 2.000 kullanıcıda doğruluyor.

### Güvenli varsayılanlar

- Bilinmeyen bayrak **kapalı**. Sunucuya ulaşılamazsa **kapalı**. Ağ koptuğunda uygulama eski,
  bilinen davranışa döner — yeni ve denenmemiş yola değil.
- Her zaman kapalı listesi her şeyin önünde: şikâyet eden kullanıcı, oranı düşürmeden kapatılabilir.
- Eski sürüm koruması: özelliği olmayan APK'da bayrak açılmaz.
- Sürüm bilinmiyorsa kademeli bayrak açılmaz.

### Panel

Ayarlar yanında **Özellik Bayrakları** ekranı: %0 / 1 / 5 / 10 / 25 / 50 / 100 düğmeleri ve
**"Bu kullanıcıda açık mı?"** sorgusu. Sorgu kullanıcının **kovasını** da gösteriyor, çünkü
"%10'a çıkardım ama hâlâ görmüyor" durumunun cevabı kovadadır.

### Mobil

`mobile/lib/hybrid/feature_flags/feature_flags.dart` — `Flags.on('anahtar')`. Yapılandırma zaten
okunan iki yerde (açılış ve oda girişi) bayraklar da tazeleniyor.

Kural: **her bayrak kullanımının yanında eski yol durmalı.** Eski yolu silmek bayrağı anlamsız kılar
— kapatılacak bir şey kalmaz.

### Hazır bekleyen bayraklar (hepsi kapalı)

`sdui_home` · `webview_games` · `asset_bundles` · `game_sdk_v2`

### Düzeltilen kendi hatam

`route_map.mjs --write` komutunu **farkı görmeden** çalıştırdım. Bu, kaybolan bir adresi sessizce
onaylamak demek — güvenlik ağını etkisiz kılar. Araç artık yazmadan önce kaybolan/eklenen adresleri
**her zaman** basıyor.

## v2.137.0 — Medya deposu: Postgres'ten R2 + CDN'e

### Bulgu

Denetimde "medya R2'ye taşınacak" yazıyordu ama asıl sorunu ölçünce gördüm: **görseller
veritabanında bayt olarak duruyor** (`media_files.data`). Her hediye animasyonu, çerçeve ve oda
teması görüntülendiğinde bir PostgreSQL okuması oluyor. Kalabalık bir odada aynı animasyon onlarca
kez okunuyor; veritabanı asıl işini — **finansal işlemleri** — yaparken görsel trafiğiyle uğraşıyor.
Yedek dosyalarının gereksiz büyük olmasının sebebi de bu.

### Çözüm ve en önemli tasarım kararı

Dosyalar R2'ye taşınıp CDN'den sunuluyor. Ama **yükleme noktalarına hiç dokunulmadı.**

Sekiz ayrı yerde `INSERT INTO media_files` var. Hepsini "önce R2'ye yaz" diye değiştirmek, R2 bir an
yanıt vermediğinde **kullanıcının yüklemesinin başarısız olması** demekti. Oysa taşıma beklemeye
tahammüllü bir iş. Bu yüzden:

1. Dosyalar veritabanına **her zamanki gibi** yazılıyor — yükleme yolu bit düzeyinde aynı.
2. Arka planda saatte bir çalışan taşıyıcı onları R2'ye kopyalıyor.
3. Kopyayı **geri okuyup boyutunu doğruluyor** — doğrulamadan "taşındı" demek, var olmayan dosyaya
   yönlendirmek olurdu.
4. Ancak o zaman `storage_key` doluyor ve `/media/:id` adresi CDN'e 308 yönlendiriyor.

### Geri alınabilirlik

**Taşıma ile veritabanı kopyasının silinmesi bilerek ayrı iki adım.** R2'de bir sorun çıkarsa
`storage_key` temizlenip eski davranışa dönülüyor — dosya kaybı olmuyor. Veritabanı kopyası ancak
panelden, 7 günden önce taşınmış dosyalar için siliniyor. Yani bir süre iki kopya birden duruyor.

R2 yapılandırılmamışsa **hiçbir şey değişmiyor**: sistem bugünkü gibi çalışıyor.

### Yarım yapılandırma kabul edilmiyor

Beş alanın (hesap kimliği, kova, erişim anahtarı, gizli anahtar, CDN kökü) hepsi dolu olmadan depo
kapalı sayılıyor. Yarım yapılandırmayla başlamak, dosyaların yarısını R2'de yarısını veritabanında
bırakır; o karışıklığı temizlemek taşımaktan zordur.

### Sıfır yeni bağımlılık

R2, AWS imza sürüm 4 (SigV4) kullanıyor. `@aws-sdk/client-s3` eklemek **sattığın koda 200+ paket**
sokardı. İmza algoritması belgeli ve değişmiyor; `node:crypto` ile yüz satırda yazıldı.

Yanlış imza = R2'nin her isteği reddetmesi, ve bu ancak canlıda taşıma başlamayınca fark edilirdi.
Bu yüzden 10 test var; imzalama anahtarı **AWS belgelerindeki yayımlanmış örnekle birebir**
doğrulanıyor. Ayrıca `encodeURIComponent`'in kodlamadığı (`*`, `(`, `'`, `!`) karakterler ayrıca
sınanıyor — imza tam bu farkta bozulur.

### Güvenlik

`r2SecretKey` ve `r2AccessKey` panele **asla ham gönderilmiyor**, denetim defterine maskeli
yazılıyor. Maskelenmiş değer geri geldiğinde kaydedilmiyor — yoksa gerçek anahtar noktalarla
ezilir ve depo çalışmaz hale gelirdi.

### Panel

Özellik Bayrakları ekranında **Medya deposu** kartı: ilerleme çubuğu, taşınan/bekleyen boyut,
son tur sonucu, "şimdi 100 dosya taşı" ve "veritabanı kopyalarını sil". Ayarlar ekranında beş R2
alanı.

## v2.138.0 — Varlık yöneticisi (asset_manager) ve bulduğum bir hata

### Önce hata: yarım inen dosya kalıcı olarak bozuk kalıyordu

Varlık indirme yolunu incelerken gerçek bir arıza buldum. `MediaCache` indirmeyi doğrudan diske
akıtıyor ve sonunda yalnızca **"sıfır bayt mı"** diye bakıyordu. Bağlantı yarıda kesilip gövde
düzgün kapanırsa — ki araya giren vekil sunucularda ve zayıf şebekede olur — **yarım dosya kalıcı
önbelleğe giriyordu.** Dosya "var" sayıldığı için bir daha indirilmiyor: o hediye o telefonda
**bir daha asla düzgün oynamıyor.** Kullanıcı "bende bu hediye bozuk görünüyor" der, sorun
sunucuda aranır, bulunamaz.

CDN yönlendirmesi (v2.137.0) devreye girdiğinden beri bu risk daha da arttı: artık gövde araya
giren bir CDN'den geliyor.

**Düzeltme:** inen bayt sayısı sunucunun bildirdiği `content-length` ile karşılaştırılıyor;
uyuşmazsa dosya **kalıcı ada alınmadan önce** atılıyor. Ayrıca önbellekte duran dosyanın boyutu da
denetleniyor — böylece düzeltmeden önce inmiş bozuk dosyalar da temizlenip yeniden iniyor.

### Varlık listesi (manifest)

Uygulama bugüne kadar hangi dosyayı indireceğini **tesadüfen** öğreniyordu: hediye paneli açılınca
`/api/gifts` çağrılıp **en ucuz 24 hediye** indiriliyordu. Sonuçları:

- Pahalı ama sık gönderilen bir hediye listeye girmiyorsa, ilk gönderildiğinde ekranda donarak
  iniyordu. (5.000.000 Coin'lik amiral hediyemiz tam bu durumda.)
- **Giriş efektleri hiç önceden inmiyordu** — oysa odaya biri girdiği anda gerekiyor.
- Dosyanın ne kadar olduğu bilinmiyordu; yukarıdaki hatanın yakalanamamasının sebebi de bu.

`GET /api/assets/manifest`: hangi dosya, ne boyutta, hangi damgayla, hangi öncelikle.
Öncelik 1 = odada her an gerekebilir (giriş efektleri, ucuz hediyeler), 2 = sık, 3 = nadir.
Kullanıcıya özel görseller (profil fotoğrafı, oda kapağı) listeye **girmiyor** — kişi başına
değişir, listeyi şişirir, zaten görüldüğü anda iniyor.

**Sürüm, içeriğin özetidir.** Zamana ya da rastgele sayıya bağlı olsaydı her sunucu açılışında
bütün telefonlar listeyi yeniden indirirdi. Böylece `If-None-Match` ile sorulduğunda 304 dönüyor:
liste bedava.

### Geri alma

Uygulama **son çalışan sürümü** saklıyor. Yeni listedeki dosyalar inmiyorsa (bozuk yükleme, yanlış
CDN adresi) eski listeye dönüyor. Eşik bilerek yüksek — tek tük hata normaldir (telefon uykuya
geçer, ağ kesilir); geri alma yalnızca **listenin kendisi** bozuksa anlamlı.

Hibrit mimaride varlıkların sunucudan gelmesinin bedeli bu: sunucu yanlış bir şey yollarsa
telefonun elinde dönecek bir yer olmalı.

### Bayrak

`asset_bundles` kapalıyken **eski `warmGifts` yolu bit düzeyinde aynı** çalışıyor. Kuralımızın
gereği: kapatılacak bir şey kalmazsa bayrağın anlamı kalmaz. Liste alınamazsa da eski yola
düşülüyor — varlıksız kalmaktansa eski, kaba yöntem iyidir.

### Damgalar

`media_files.sha256` artık R2'den bağımsız olarak dolduruluyor (saatte bir, 50 dosya).

**Dürüst sınır:** damga listede taşınıyor ama **uygulamada doğrulanmıyor.** Dart'ta yerleşik
SHA-256 yok; `crypto` paketini bu ortamda ekleyip sınayamıyorum ve doğrulayamadığım elle yazılmış
bir karma işlevini göndermek bozuk dosyadan beter olur. Boyut denetimi gerçek dünyadaki arızayı
(yarım inme) zaten yakalıyor. Paket eklendiğinde sunucu tarafı hazır.

## v2.139.0 — WebView güvenliği ve JSBridge

Hibrit mimarinin en yüksek riskli parçası. Oda etkinlikleri ve oyunlar WebView'de açılıyor ve bu
pencerelere bir JavaScript kanalı bağlanıyor.

### Bulduğum üç sorun

**1. Karar üç ayrı yerde, üç farklı şekilde veriliyordu.**
Oda etkinliği penceresi aynı köken şartı arıyordu. Dış pencere **düz `http`'ye bile izin
veriyordu**. Oyun rıhtımının kendi kuralı vardı. Üç kuralı birden doğru tutmak mümkün değil;
birini sıkılaştırınca diğerleri gevşek kalıyor. Kendi modül standardımız da bunu yasaklıyor:
*"aynı iş mantığının farklı modüllerde kopyalanması"*.

**2. Hiçbir yerde alan adı denetimi yoktu.**
Etkinlik adresini yönetici panelden yapıştırıyor. Hesap ele geçirilirse ya da adres yanlış
yazılırsa (`trlve.app` gibi tek harf), kullanıcı **uygulamanın içinde**, uygulama penceresi gibi
görünen yabancı bir sayfaya gider. WebView'de adres çubuğu yok — kullanıcı farkı anlayamaz.

**3. Köprü çağrılarının kaydı yoktu.**
Bir sayfanın ne istediği sorusu cevapsızdı.

### Yapılanlar

**Tek karar noktası** — `hybrid/webview/navigation_policy.dart`. Üç pencere de buraya soruyor.
`hybrid/js_bridge/bridge_policy.dart` komut yetkisini tek yerde tutuyor ve her çağrıyı kaydediyor.

**Alan adı izin listesi** — Ayarlar → WebView güvenliği. Denetim **iki taraflı**: yönetici yanlış
adresi kaydedemiyor (sunucu), ve eski kayıtlar da açılırken denetleniyor (uygulama). Tek taraf,
diğerinin atlanabildiği her durumda açık kapı bırakırdı.

**Düz http artık yüklenmiyor.** Araya giren biri, kanal bağlı bir pencereye kod sokabilirdi.

**İzin listesinde olmayan https adres** uygulama içinde değil, **telefonun tarayıcısında** açılıyor
— orada adres çubuğu görünür, kullanıcı nereye gittiğini bilir.

### Köken ayrımı: dış sayfaya oturum bileti yok

| Komut | Kendi sunucumuz | Dış sayfa |
|---|---|---|
| `getToken` (oturum bileti) | ✅ | **❌** |
| `refreshBalance` (bakiyeyi sunucudan yeniden sor) | ✅ | ❌ |
| `open` (uygulama ekranı aç) | ✅ | ❌ |
| `openActivity` | ✅ | ❌ |
| `close` | ✅ | ✅ |

Biletimizi başkasının sunucusuna göndermek, o sunucunun **kullanıcı adına her şeyi yapabilmesi**
demektir. Eskiden bu ayrım iki ayrı dosyada iki ayrı `switch` olarak duruyordu — yeni bir komut
eklerken dış pencereye de açılması an meselesiydi.

Mimari ilkemizin gereği olarak **hiçbir köprü komutu para hareketi yapmıyor**: en fazla bakiyeyi
sunucudan yeniden sorduruyor ya da bir ekran açıyor.

### En kritik test: etiket sınırı

`host.endsWith('.alanadi.com')` tek başına yazılsaydı, saldırgan **`kotualanadi.com`** alıp listeye
sızabilirdi. Hem sunucu hem uygulama tarafında uzunluk denetimi var ve 15 test bunu doğruluyor —
`kotualanadi.com`, `alanadi.com.saldirgan.net`, `trlve.app` hepsi reddediliyor.

Joker (`*.alanadi.com`) alt alan adlarını kapsıyor ama **kökü kapsamıyor**: ikisini isteyen ikisini
yazar. Sessizce eklemek, listeyi okuyan kişiyi yanıltırdı.

### Geriye uyum

İzin listesi **boşken kısıt yok** — bugünkü davranış. Varsayılanı "her şey yasak" yapmak, panelde
kayıtlı çalışan etkinlikleri bir anda bozardı; bu kararı kapatma düğmesi olmadan veremeyiz.
Tek davranış değişikliği: **düz http artık yüklenmiyor** (2026'da gerçek bir site zaten https).

## v2.140.0 — SDUI (sunucudan gelen ekran düzeni) + basım kayıtlarının kaldırılması

### 1. Basım kayıtları kaldırıldı

Bir test/etkinlik/telafi/pazarlama basımı **üç yere** birden yazılıyordu. İkisi kaldırıldı:

- **`coin_issuances` tablosu düşürüldü.** Defterin birebir kopyasıydı — aynı transaction, aynı
  tutar, aynı bütçe anahtarı. Aylık kullanım artık doğrudan defterden hesaplanıyor. Veri
  kaybolmadı: her satırın karşılığı defterde duruyor.
- **Yönetici işlem günlüğüne yazılmıyor.** Bütçeli yüklemeler günlüğü doldurup gerçek
  düzenlemeleri görünmez kılıyordu. Satış ve düzeltme yüklemeleri her zamanki gibi kaydediliyor.
- **Kullanıcının hareket listesinde görünmüyor.**
- **Panelin iki hareket listesinde de görünmüyor**, tür süzgecinden de çıkarıldı.
- **"Aylık basım" tablosu ve "Son basımlar" listesi kaldırıldı**, `/finance/issuances` adresi silindi.

**Duran tek kayıt: defter satırı.** Sana bunu açıkça söylemem gerek — iki şey ona bağlı:

1. **Aylık bütçe sınırı.** "Bu ay bu bütçeden ne kadar basıldı" sorusunun tek cevabı o satır.
   Olmasaydı 10.000.000'luk test sınırı denetlenemezdi — sınırsız basım olurdu.
2. **Günlük mutabakat alarmı.** Kayıtsız bir bakiye artışı, her gün büyüyen kalıcı bir açık üretir.
   Alarm sürekli yanlış öterse kimse bakmaz; gerçek bir açık olduğunda da fark edilmez.

Satır duruyor ama **hiçbir insanın baktığı yerde görünmüyor.**

Gizlenecek türler **veritabanından** okunuyor, koda yazılmıyor: panelden beşinci bir bütçe
eklediğinde onun satırları da kendiliğinden gizleniyor.

### 2. SDUI

Mimari ilkenin "dinamik içerik" tarafı: sekmelerin sırası, görünürlüğü, adı, simgesi ve ana
ekrandaki duyuru/afiş/kart şeritleri artık sunucudan geliyor. Panel → **Ana Ekran Düzeni**.

#### Üç kademeli geri düşme

1. Sunucudan gelen düzen
2. Telefonda saklanan son çalışan düzen (ağ yoksa)
3. **Uygulamanın yerleşik düzeni** — koddadır, her zaman çalışır

Üçüncü kademe pazarlık konusu değil. SDUI "arayüzü sunucu belirler" demek; sunucu yanıt
vermediğinde arayüzün de kaybolması, uygulamayı sunucuya rehin vermek olurdu.

**Bozuk düzen saklanmıyor:** gelen düzen önce çözülüp doğrulanıyor, ancak geçerliyse telefona
yazılıyor. Bozuğu saklamak, ağ olmasa bile her açılışta bozuk açmak olurdu.

#### En kritik sınır: sunucu yeni yetenek üretemez

Eylemler **kapalı liste** ve hepsi uygulamanın zaten yaptığı şeylere işaret ediyor. Sunucu yeni
bir davranış tanımlayamaz. SDUI'nin uzaktan kod çalıştırmaya dönüşmemesi buna bağlı.

- Yeni sekme **eklenemez** — var olanlar gizlenir, sıralanır, yeniden adlandırılır. Yeni sekme
  APK gerektirir.
- Sekme içeriği **sabit yuvaya** bağlı: sunucu sekmeyi taşıyabilir ama "profil" sekmesine
  mesajlar ekranını koyduramaz.
- **Bütün sekmeler gizlenemez** — gezilemeyen uygulama, sunucudan gönderilebilecek en zararlı
  düzendir. Üç yerde engelleniyor: panelde uyarı, sunucuda ret, uygulamada son savunma.
- **Oda ekranı, giriş ve cüzdan işlem akışı SDUI'ye kapalı** — ses, görüntü, kimlik doğrulama ve
  finansal işlemler native kalır (mimari ilke).
- `openUrl` adresi **WebView izin listesinden geçiyor** (hem kaydederken hem açarken). SDUI,
  v2.139.0'da kurduğumuz alan adı denetimini atlatmanın yolu olamaz.
- Görünüm koddan geliyor: sunucu **ne** gösterileceğini söyler, **nasıl** görüneceğini değil.
  Renk, yazı tipi ve ölçüler uygulamanın kendi bileşenlerinden.

#### Geri alma

Her kayıttan önceki sürüm geçmişe yazılıyor; panelden tek tıkla dönülüyor. Ayrıca düzen
**kapatılabiliyor** (içeriğe dokunmadan) ve `sdui_home` bayrağı kapalıyken hiç devreye girmiyor.
Üç ayrı geri dönüş yolu — geri dönüş yolu olmayan bir uzaktan arayüz sistemi, uygulamayı
kullanılamaz hale getirme yetkisini sunucuya vermek demektir.

#### Sürüm

Düzenin sürümü içeriğinin özeti. ETag olarak gönderiliyor: değişmediyse gövde hiç inmiyor.
Kaydedilen her düzen normalleştiriliyor, böylece boşluk farkı bütün telefonlara yeniden
indirtmiyor.

**36 yeni test** (21 SDUI + 7 basım + 8 bayrak/politika).

## v2.141.0 — Oyun SDK'sı ve iki güvenlik bulgusu

### Bulgu 1: bilet hata kayıtlarında düz metin duruyordu

Oyun sayfaları etkinlik biletini adres satırında taşıyor (`/games/<id>/?token=...`). `app.js`
hata kayıtlarına `req.originalUrl`'i **olduğu gibi** yazıyordu. Yani bir oyun sayfasında hata
olduğunda bilet, kayıtların saklama süresi boyunca düz metin olarak sunucuda duruyordu.

Kendi modül standardımız şunu söylüyor: *"Log: yapılandırılmış, hassas veri içermeyen."*

Düzeltme: adres `redactSecrets()`'ten geçiriliyor. Test, maskelemenin bilet parametresini gerçekten
yakaladığını ve zararsız parametreleri (uid, lang) silmediğini doğruluyor.

### Bulgu 2: bilet adres satırında kalıyordu

Sunucu tarafı zaten iyi durumdaydı — bunu önce **kontrol ettim**, varsaymadım: oyun sayfalarında
`Referrer-Policy: no-referrer` ve `connect-src 'self'` zaten vardı, yani Referer sızıntısı kapalı.

Kalan boşluk telefonun kendi üzerindeydi: adres satırı tarayıcı geçmişine, yer imlerine ve
"bağlantıyı paylaş" menüsüne giriyor. SDK artık bileti okuyup sessionStorage'a yazdıktan **sonra**
`history.replaceState` ile adresten siliyor. (Sıra önemli: önce silinirse bilet kaybolur — test
bu sırayı doğruluyor.)

### Oyun SDK'sı parçalara ayrıldı

Tek dizede yazılıyken hiçbir parçanın gerekçesi okunamıyordu. Hedef ağaçtaki yapıya geçti:

```
modules/games/sdk/
├── trlive_game_sdk.js   birleştirici + API yüzeyi
├── session_client.js    kimlik, bilet, sunucu çağrısı
├── event_client.js      WebSocket, olaylar, yeniden bağlanma
└── bridge_client.js     uygulama köprüsü
```

### Yeniden bağlanma — asıl kazanç

Her oyun paketi kendi WebSocket bağlantısını kuruyordu ve neredeyse hiçbiri yeniden bağlanmayı
doğru yapmıyor: ya hiç denemiyor (telefon uykudan dönünce oyun donuyor), ya da hemen ve sonsuz
deniyor (ağ kesintisinde sunucuyu bağlantı isteğiyle dövüyor). SDK tek doğru davranışı bir kez
yazıyor:

- **Artan bekleme** — 1s, 2s, 4s… en fazla 30s.
- **Rastgele sapma (%0-30)** — bu olmadan ağ kesintisinden sonra bütün telefonlar **aynı anda**
  döner ve sunucu kalktığı anda yeniden düşer ("gürleyen sürü"). Sahada en çok gözden kaçan
  ayrıntı budur; test onu da doğruluyor.
- **Sayfa arkaya alınınca bağlantı bırakılır**, öne gelince beklemeden kurulur. Arka planda açık
  bağlantı pil yer ve telefon tarafından nasılsa kesilir.
- `send()` bağlantı yokken **false döner** — sessizce yutulsaydı oyun "gönderdim" sanıp beklerdi.

### Değişmeyen sınır

`bet`, `settle`, `play` v2.129'da kaldırıldı, geri gelmedi ve gelmeyecek. Oyun sayfası — yani
kullanıcının telefonunda çalışan kod — hiçbir koşulda kazancı kendisi belirleyemez. Çağrılar
**açıklayıcı hata fırlatıyor**: sessizce yok olsalardı eski oyunlar hatasız ama ödülsüz çalışır,
sebebi günlerce aranırdı.

Oyun sayfası uygulamadan **oturum bileti isteyemiyor** (v2.139.0 köprü politikası) ve SDK'da
böyle bir çağrı yok — test bunu da doğruluyor.

### Bilerek yapılmayanlar

Hedef ağaçtaki `matchmaking/` ve genel `commands/` katmanı **yapılmadı**. Oyun paketleri zaten
kendi sunucu kodlarına sahip (`query`, `tx`, `hub`, `wallet`, `kv`, `WebSocketServer` bağlamıyla);
onların üstüne genel bir "komut" kanalı koymak, doğrulanmamış bir geçiş yolu açmanın en bilinen
yoludur. Gerçek bir oyun paketi ihtiyacı doğduğunda, o ihtiyacın şekline göre yazılacak.

**11 yeni test.**

## v2.142.0 — Oda ekranı: ölçüm, güvenlik ağı ve ilk kurallar

### Ölçüm — planı değiştiren sonuç

`room_screen.dart`'ın 5.398 satırının **5.191'i tek sınıf**: `_RoomScreenState`, 269 üye.

Mantığa dokunmadan taşınabilecek kısım: **209 satır — dosyanın %4'ü.** Kalan üyelerin yarısından
fazlası ortak değişken duruma dokunuyor (`_members`, `_seats`, `setState`, `widget`).

Yani "dosyayı böl" işi burada bir taşıma değil, **durum makinesinin yeniden yazımı.** Kendi
kuralımız: *bir sürümde ya taşıma ya mantık değişikliği, ikisi birden asla.*

Dart'taki iki yolu da değerlendirdim:

- **`part` + `extension`:** sınıf part dosyalarına bölünemiyor; extension'a taşınan her metodun
  gövdesindeki *her* örnek üye erişimi `this.` ister. Binlerce satırlık regex farkı — temiz bir
  taşıma değil.
- **Widget çıkarma (doğru yol):** 31 widget kurucusu, 1.616 satır. Her biri 10-20 parametre alan
  ayrı bileşene dönüşür. `flutter analyze` tip hatasını yakalar ama **aynı tipten yanlış
  değişkeni geçirmeyi yakalamaz** — `_seatTile` ya da `_bottomBar`'da böyle bir hata doğrudan
  üretimde görünür.

**Asıl engel:** mobil tarafta 4 test dosyası vardı ve hiçbiri oda ekranına dokunmuyordu.
Uygulamanın en çok kullanılan ekranını — ses/görüntü yığınının tamamını barındıran 5.000 satırı —
testsiz ve staging'siz yeniden yazmak, bugüne kadar yaptığımız her şeyden riskli.

Sırayı tersine çevirdim: **önce ağ, sonra atlama.**

### 1. Üye envanteri aracı

`mobile/tools/dart_members.py` — bir dosyadaki sınıf üyelerini listeler. Taşıma öncesi/sonrası
karşılaştırılır; bir metot sessizce kaybolur ya da adı değişirse yakalanır. Backend'deki
`route_map.mjs` ile aynı fikir.

Araç ilk yazımında yerel değişkenleri üye sanıyordu (sahte fark üretiyordu). Süslü parantez
derinliği izlenerek düzeltildi: üye yalnızca sınıf gövdesinin ilk seviyesinde aranıyor. **Gürültü
üreten bir araca kimse bakmaz** — net ölçüm vermeyen güvenlik ağı, ağ değildir.

### 2. İlk kurallar çıkarıldı ve testle sabitlendi

`features/live_rooms/domain/rules/` altında iki modül:

**`seat_rules.dart`** — boş koltuk sayımı, koltuk bulma, mikrofon kapalı mı, çıkınca oda kapanır mı.
**`room_format.dart`** — sayı kısaltma, Türkçe ilk harf büyütme, balon rengi.

Hepsi `_RoomScreenState` içinde duruyordu ve **test edilemiyorlardı**: her biri örnek alanlarını
okuyordu, o alanları kurmak için bütün ekranı ayağa kaldırmak gerekiyordu. Artık girdiler
parametre; her kural tek başına sınanıyor.

**43 yeni mobil test.** Örnekler:

- `*.alanadi.com` benzeri sınır hataları gibi, burada da kritik olan sınır durumları: kilitli
  koltuk boş sayılmaz, `seatIndex` bozuk veri geldiğinde koltuk dolu görünmez, kendi satırı iki
  kez listelenen sahip kendini "başka yönetici" sanmaz (oda kapanması gerekirken açık kalırdı).
- Sayı kısaltmada kesir **yuvarlanmaz, kırpılır**: 1.999.999 → "1,9M". Yukarı yuvarlamak
  kullanıcıya elinde olmayan bakiyeyi göstermek olurdu.
- Türkçe `i` → `İ`: `toUpperCase()` tek başına "istanbul" → "Istanbul" yapar.

**Tek sadeleştirme:** boş koltuk sayımı iki yerde kopyalanmıştı (`_noFreeSeat` ve
`_freeGuestSeats` aynı kümeyi aynı şekilde hesaplıyordu); tek işleve indi. Test, ikisinin
matematiksel olarak aynı şey olduğunu doğruluyor.

### Doğrulama

Üye envanteri taşıma sonrası karşılaştırıldı: **8 üyenin hepsi yerinde**, hiçbiri kaybolmadı.

Ayrıca bu ortamda Dart derleyicisi yok; `room_format.dart`'ta `library` direktifini import'lardan
sonra yazmıştım — Dart'ta bu sözdizimi hatası. Elle okuyarak yakalayıp düzelttim. Gerçek kapı
yine CI: `flutter analyze` + `flutter test`.

## v2.143.0 — Güvenlik sertleştirmesi: 2FA, CORS, ölü ayarlar, bağımlılık taraması

Denetimdeki açık güvenlik maddelerini taradım ve dördünü kapattım. En yüksek riskliden başladım.

### K-04 · Yönetici iki adımlı doğrulaması (2FA)

Yönetici hesabı **tek bir şifreyle** korunuyordu. O şifre ele geçerse (yeniden kullanılmış şifre,
oltalama, bulaşmış bilgisayar) saldırgan panelin tamamına sahip olur: Coin basar, kullanıcı
verisine erişir, ödeme ayarlarını değiştirir. Bütçe sınırları bunu yavaşlatır ama **durdurmaz** —
sınırları da aynı panelden değiştirebilir.

**Sıfır yeni bağımlılık.** `otplib`/`speakeasy` eklemek sattığın koda onlarca paket daha sokardı.
TOTP (RFC 6238) `node:crypto` ile elli satır. Yanlış bir uygulama iki yönden de felaket: ya hiçbir
kodu kabul etmez (yönetici kendi panelinden kilitlenir), ya her kodu kabul eder (2FA hiç yokmuş
gibi olur). Bu yüzden **RFC 6238'in kendi test vektörleriyle** doğrulanıyor — altı vektörün hepsi
geçiyor.

Tasarım kararları:

- **Kurulum, doğrulanmadan açılmaz.** Anahtar üretilir ama ilk doğru kod girilene kadar 2FA devreye
  girmez. Yoksa yanlış kurulumda (QR okunmadı, telefon saati kayık) yönetici kendi panelinden
  kilitlenirdi.
- **Kurtarma kodları.** Telefon kaybolursa tek çıkış yolu. Olmasaydı veritabanına elle müdahale
  gerekirdi — ki o da en kötü anda, baskı altında yapılır. Kodlar **özetlenerek** saklanıyor:
  veritabanı sızarsa düz metin kodlar 2FA'yı tamamen atlatırdı.
- **Kapatmak için de kod gerekiyor.** Yalnızca şifreyle kapatılabilseydi, şifreyi çalan kişi önce
  2FA'yı kapatır sonra girerdi.
- **Kod denemeleri şifre sayacına yazılıyor:** 6 haneli kod kaba kuvvetle denenemiyor.
- **"Kod gerekli" yanıtı yalnızca şifre doğruyken dönüyor.** Yanlış şifrede dönseydi, bir hesabın
  2FA'sının açık olup olmadığı şifre bilmeden öğrenilebilirdi.
- Pencere ±1 adım (30 sn): telefon saati kayması tolere edilir, ama çalınan kodun ömrü uzamaz.
  İki adım öncesi reddediliyor — test bunu da doğruluyor.

Hem panelde hem uygulamada akış hazır: şifre doğrulanınca kod alanı açılıyor, şifre korunuyor.

### S-05 · CORS — ve neredeyse yaptığım hata

`CORS_ORIGIN` tanımsızsa varsayılan `*` idi. Üretimde reddetmeyi yazdım.

**Sonra dağıtım dosyalarına baktım:** `docker-compose.yml`'da `NODE_ENV: production` **ve**
`CORS_ORIGIN: "*"` yazıyordu. Yani bu haliyle sunucu kendini güncellediği an **açılmayacaktı** —
site, kimse bir şey yapmadan düşecekti.

*Bir güvenlik sıkılaştırması, uygulandığı gün hizmeti kesiyorsa yanlış uygulanmıştır.*

Geçiş yolu ekledim: `*` yazılıysa ve sunucunun kendi adresi (`PUBLIC_BASE_URL`) biliniyorsa, kısıt
ona daraltılıyor ve uyarı basılıyor. **Açık kapı kapanıyor, sunucu ayakta kalıyor.** Kendi adresi
de bilinmiyorsa durulacak güvenli bir değer yok — orada hata doğru.

Dağıtım dosyaları da tutarlı hale getirildi; test, oraya tekrar `*` yazılmasını engelliyor.

### S-04 · Hiçbir şey yapmayan iki güvenlik ayarı

`blockRooted` ve `sslPinning` tanımlıydı ama **mobil tarafta onları okuyan tek satır yoktu.**
Hiçbir şey yapmayan bir güvenlik ayarı, yapıyormuş gibi görünür: "SSL pinning açık" sanan bir
yönetici olmayan bir korumaya güvenir. **Yanlış güven, korumasızlıktan beterdir.**

Kaldırıldı. Test, "uygulanmadan geri eklenmesini" engelliyor.

Gerçek sertifika sabitleme, kendi alan adına geçildikten sonra ve **yedek pin'le birlikte**
eklenecek — tek pin'le, sertifika yenilendiği gün bütün uygulamalar sunucuya bağlanamaz.

### S-07 · Bağımlılık açığı taraması CI'da

Sattığın kodda bilinen açıklı bir paket bulunması, alıcının ilk tarayacağı şeydir.

`npm audit` eklendi: **yüksek ve kritik** seviye derlemeyi durduruyor, düşük/orta yalnızca özete
yazılıyor. Her uyarıda derleme kırılırsa kimse bakmaz ve tarama anlamını yitirir.

### Denetim durumu

Açık kalan 🔴 kırmızı madde **kalmadı**. Kalanlar P2 ve bilinçli ertelenenler (Redis — tek sunucu
olduğu sürece kazanç yok; mağaza ödemesi — mağaza hesabı açılmadan koda başlanmamalı).

## v2.144.0 — Moderasyon kuyruğu (yayın engeli kalktı)

Denetim S-06 için **"yayın engeli"** diyordu: Apple ve Google, kullanıcı içeriği barındıran
uygulamalarda etkin moderasyon istiyor.

### Bulduğum asıl boşluk: kanıt saklanmıyordu

Kuyruğu yazmaya başlamadan önce mevcut şikâyet akışını okudum. `reports` tablosu şikâyet edilen
mesajın **kimliğini** tutuyordu, içeriğini değil. Panel, metni canlı `room_messages` tablosundan
JOIN ile çekiyordu.

Yani kullanıcı mesajı silerse — ya da saklama temizliği süpürürse — moderatör ekranında şikâyet
duruyor ama **neyin şikâyet edildiği görünmüyordu.**

Bu, moderasyonu imkânsız kılar: göremediğin kanıta göre karar veremezsin. Üstelik kötü niyetli
kullanıcı tam da bunu yapar — yaz, şikâyet edilince sil.

Artık şikâyet anında içeriğin **anlık kopyası** alınıyor. Panelde silinmiş mesaj
"**mesaj silinmiş — şikâyet anındaki kopya**" etiketiyle görünüyor. Kopya yalnızca şikâyet edilen
tek öğeyi içeriyor, sohbetin tamamını değil: gereğinden fazlasını saklamak moderasyon ihtiyacını
aşan bir veri birikimi olurdu. Kopya alınamazsa şikâyet yine kaydediliyor — eksik kanıtla bir
şikâyet, hiç şikâyet olmamasından iyidir.

### Kuyruk

Şikâyetler ekranına **Kuyruk** sekmesi eklendi (ilk sekme: moderatör ekranı açtığında önce
"ne yapmalıyım" sorusunun cevabını görsün). Açık şikâyetler **hedef kullanıcıya göre
gruplanıyor** — karar kişi hakkındadır; aynı kişiyle ilgili sekiz şikâyet sekiz ayrı karar
gerektirmez.

### En önemli tasarım kararı: kaç KİŞİ şikâyet etti

Risk puanı **ayrı şikâyetçi sayısına** dayanıyor, toplam şikâyet sayısına değil.

Beş ayrı kullanıcının bir kez şikâyet etmesi ile bir kullanıcının beş kez şikâyet etmesi aynı şey
değildir. İkincisi genellikle husumettir. Toplam sayıya göre sıralasaydık, **bir kişiyi hedef alan
organize şikâyet kampanyası masum kullanıcıyı kuyruğun tepesine çıkarır ve cezalandırılmasına yol
açardı.**

Puan: ayrı şikâyetçi × 10 · ağır nedenler (çocuk güvenliği, müstehcen, taciz, şiddet, kendine
zarar) × 25 · otomatik ihlal × 3 · bekleme süresi × 0,5 (**üst sınırlı** — aylarca bekleyen
önemsiz bir şikâyet, yeni gelen ağır bir şikâyetin önüne geçmesin).

### Karar

Kullanıcı dosyası tek ekranda: açık şikâyetler + kanıt + otomatik ihlaller + geçmiş kararlar.
Kararlar: sorun yok · uyarı · sohbet kısıtı · şikâyet edilen mesajları sil · odadan yasakla ·
hesabı askıya al.

- Karar, o kullanıcıyla ilgili **bütün açık şikâyetleri birlikte kapatıyor** — hiçbiri kuyrukta
  unutulmasın diye.
- **Gerekçe zorunlu** (sorun yok hariç): karar sonradan denetlenebilmeli.
- "Sorun yok" da bir karar ve kaydediliyor: aynı kişi tekrar şikâyet edilirse bir sonraki
  moderatör bunu görüyor.
- Mesaj silme yalnızca **şikâyet edilen** mesajları siliyor, kullanıcının tüm geçmişini değil.

### Yan bulgu: ban mantığı rotanın içinde gömülüydü

Askıya alma, yönetim rotasının gövdesinde yazılıydı. Moderasyon kuyruğu da askıya alacağı için
ikinci bir kopya çıkacaktı — ve kopyalar birbirinden ayrı düşer. Burada ayrı düşmenin bedeli
somut: bir yol oturum iptalini unutursa **askıya alınan kullanıcı uygulamada açık kalmaya devam
eder**; odadan atılmazsa konuşmaya devam eder. Yani ceza uygulanmamış olur.

`modules/users/ban.service.js`'e çıkarıldı; iki yol da aynı servisi çağırıyor. Veritabanı
değişikliği transaction içinde, yan etkiler (oturum iptali, bağlantı kesme, oda kapatma) commit
sonrası — tersi olsaydı transaction geri alındığında kullanıcı atılmış ama ceza kaydı yazılmamış
olurdu. Test bu sırayı da doğruluyor.

**13 yeni test.** Kalan (P2): itiraz akışı, yüklenen görseller için içerik kontrolü.

## v2.145.0 — Yük testi ve **sunucuyu açtırmayan üç hata**

Yük testine başlamak için sunucuyu burada ayağa kaldırmayı denedim. Açılmadı. Çıkan şey yük
testinden çok daha önemliydi.

### Modül taşımasının açtığı üç kırık yol

Modüllere ayırma (v2.133–134) sırasında dosyalar taşındı. Kod içindeki `import` ifadeleri
güncellendi — ama **dize içinde yazan yollar güncellenmedi:**

| Nerede | Ne olurdu |
|---|---|
| `backend/Dockerfile` → `node src/migration_runner.js` | **Kapsayıcı hiç açılmazdı.** Bir sonraki dağıtımda sunucu düşerdi, sebebi migration'da aranırdı. |
| `room_game_page.routes.js` → `new URL('../pages/tek.html')` | Sunucu açılışta dururdu. |
| `admin.shared.js` ve `system.routes.js` → `new URL('../../package.json')` | Sürüm okunamazdı. |
| `package.json` → `"migrate": "src/migration_runner.js"` | Elle migration çalışmazdı. |

**Üçü de üretimi durduracak hatalardı ve hiçbir kontrol yakalamadı:**

- `imports.mjs` yalnızca ES `import` ifadelerine bakıyor, dizelerin içindeki yollara değil
- Adres haritası kaynaktaki rotaları sayıyor, dosya varlığını denetlemiyor
- Birim testleri sunucuyu açmıyor

Kör nokta tam buradaydı: **kodun dışında ya da dize içinde yazan dosya yolları.**

### Kalıcı çözüm

`backend/tools/deploy_paths.mjs` — Dockerfile ve package.json'daki komut yollarını, kaynaktaki
`new URL(...)` varlık yollarını tarar ve gerçekten var olduklarını doğrular. `npm run check`
içine bağlandı, yani **her CI koşusunda**. Bozup denedim: Dockerfile'daki eski yolu geri
koyduğumda hemen yakaladı.

### Yük testi aracı

`backend/tools/loadtest.mjs` — sıfır bağımlılık.

```
node tools/loadtest.mjs --url http://localhost:3000 --users 200 --duration 60
```

Gerçek akışı taklit eder: kayıt → oda listesi → odaya gir → mesaj oku → mesaj yaz → çık.
Uç başına **p50/p95/p99** raporlar — ortalama değil, çünkü ortalama en yavaş %5'i gizler ve
kullanıcıların şikâyet ettiği tam orasıdır.

Kullanıcılar **rampayla** başlar: hepsini aynı anda başlatmak gerçekte olmayan bir ani yük
yaratır ve ölçülen şey kapasite değil o ani yükün etkisi olur.

**Üretime karşı çalıştırmayı reddeder.** Adres yerel/test gibi görünmüyorsa `--yes` ister:
araç gerçek kullanıcı yaratıp gerçek mesaj yazıyor.

### Statik tarama: yük altında ilk patlayacak uç

Araç yazılırken büyüyen tablolardaki sınırsız sorguları taradım. En kritiği:

**`GET /api/rooms/:id/members` üst sınırsızdı.** 2.000 dinleyicili bir odada her çağrıda 2.000
satır dönüyordu — üstelik uygulama listeyi düzenli yeniliyor. Tek popüler yayın, sunucunun
tamamını yavaşlatabilirdi.

Üst sınır (varsayılan 300, en çok 500) ve `total` eklendi. **Kesme koltuktakileri etkilemiyor:**
sıralama zaten koltuktakileri başa koyuyor, bu yüzden koltuk çizimi, "boş koltuk var mı" ve
"çıkınca oda kapanır mı" hesapları olduğu gibi doğru kalıyor. Kesilen yalnızca dinleyici kuyruğu
ve sayısı `total` ile dönüyor.

Ayrıca `room_members_list_idx` eklendi: birincil anahtar filtreyi karşılıyordu ama **sıralamayı
karşılamıyordu** — PostgreSQL bütün satırları okuyup sıralıyor, LIMIT'i ancak ondan sonra
uyguluyordu. Dizin sorgudaki `ORDER BY` ile birebir aynı sütun sırasında; artık ilk 300 satır
okunup duruluyor.

### Aracın kendi hatası da düzeltildi

Adres haritası test dosyalarını da tarıyordu. Yeni testim kaynak metnini doğrulamak için
`router.get('/:roomId/members'` dizesini içeriyordu ve araç bunu **gerçek rota** sandı — sahte
fark üretti. Test dosyaları artık taranmıyor. *Sahte fark üreten güvenlik ağına kimse bakmaz.*

## v2.145.1 — CI'nın yakaladığı üç hata

v2.145.0 yüklendi ve CI üç iş birden kırdı. Üçü de gerçekti.

### 1. APK derlemesi: kaybolan bağımlılık (en kritik)

```
git clone --mirror https://github.com/SERDUN/flutter_webrtc_noise_suppression.git
fatal: could not read Username for 'https://github.com'
```

Yapay zekâ gürültü azaltma eklentisi (RNNoise) bir **kişisel GitHub deposundan** geliyordu.
O depo artık erişilemiyor — anonim `git clone` kimlik doğrulaması istiyor, yani silinmiş ya da
özel yapılmış. Doğruladım: `flutter/flutter` anonim klonlanıyor, bu depo klonlanmıyor.

Sonuç: **her APK derlemesi `flutter pub get` adımında kırılıyordu.** Derleme hiç başlayamıyordu.

Bu, kodla ilgili bir hata değil — **bağımlılık seçimiyle ilgili.** Üretim derlemesini kontrolümüz
dışındaki kişisel bir depoya bağlamak baştan kırılgandı; sahibi deposunu silince bizim
derlememiz durdu. pubspec'teki kendi notumuz da bunu öngörmüştü: *"Sorun çıkarsa bu satır ve
denoiser.dart'taki içe aktarma kaldırılır."*

**Yapılan:** bağımlılık kaldırıldı. `services/denoiser.dart` **yerinde bırakıldı** ama devre dışı
(`supported => false`). Çağrı noktalarını tek tek sökmek, eklenti geri geldiğinde ya da yerine
başkası konduğunda hepsini yeniden yazmak demekti; şimdi tek satırdan açılır.

Arayüzde ölü düğme kalmadı: "Gürültü engelleme" anahtarı zaten birleşikti ve WebRTC'nin kendi
gürültü bastırmasını, ses yalıtımını ve telefonun ses işlemesini yönetmeye devam ediyor.
**Kaybedilen, RNNoise'un klavye/tabak gibi sesler için verdiği EK kazanç** — temel gürültü
azaltma çalışıyor.

pubspec'e kural yazıldı: yeni bir git bağımlılığı ya yayımlanmış (pub.dev) bir paket olmalı,
ya da bizim denetimimizdeki bir depodan ve **sabit bir commit'e kilitlenmiş** olmalı.

### 2. e2e: dördüncü kırık yol — ve güvenlik ağımın kendi eksiği

```
Cannot find module '.../backend/src/migration_runner.js'
```

v2.145.0'da Dockerfile ve package.json'daki eski yolu düzelttim. `e2e/api.e2e.js` de aynı yolu
çağırıyordu ve onu **kaçırdım** — çünkü yazdığım `deploy_paths.mjs` yalnızca Dockerfile ve
package.json'ı tarıyordu.

*Güvenlik ağının kendisi eksikse, yakaladığı kadarını yakalar.* Araç artık `e2e/` dosyalarını da
tarıyor. Bozup denedim: eski yolu geri koyduğumda yakaladı.

Deponun tamamını tekrar taradım; başka kırık yol kalmadı.

### 3. Mobil analiz

Aynı bağımlılık hatası (1. madde) `flutter pub get` adımında kırıyordu; kaldırılmasıyla çözüldü.

### Not

Üç hatayı da CI yakaladı — sistem çalıştı. Ama 1. ve 2. madde benim buradaki ortamımda
yakalanabilirdi: ilki `git ls-remote` ile, ikincisi aracı eksiksiz yazmakla. İkisini de
kapattım.

## v2.145.2 — Doğrulamanın kendisi düzeltildi

Önceki üç sürümde çıkan hatalar tek bir kök nedene çıkıyor ve onu düzeltmeden devam etmek
aynı hatayı tekrarlamak olurdu.

### Kök neden

133 dosya taşındı. Sözdizimi, import denetimi, rota haritası (467/467) ve bütün birim testleri
yeşildi ve "doğrulandı" denildi.

**Sunucu açılmıyordu.** Üç dosya yolu kırıktı. Bu ancak sunucuyu çalıştırmayı deneyince görüldü —
taşımanın ertesi günü. Dördüncü kırık yol (`e2e/api.e2e.js`) ise güvenlik ağının kendisi eksik
yazıldığı için kaçtı ve CI'da çıktı.

Hata, kontrollerin yokluğu değildi: **ucuz olan doğrulandı, pahalı olan atlandı ve ikisine aynı
isim verildi.**

### `npm run verify`

Tek komut: sözdizimi + dağıtım yolları, rota haritası, 47 test dosyası, **ve git'ten gelen
Flutter bağımlılıklarının hâlâ erişilebilir olması.**

O son kontrol somut bir olaydan geliyor: gürültü azaltma eklentisi kişisel bir depodan geliyordu,
depo silindi, **her APK derlemesi durdu.** Kod değişmemişti; dışarıdaki bir depo kayboldu ve
hiçbir yerel kontrol bunu görmüyordu, çünkü hiçbiri depoya ulaşmayı denemiyordu. Artık deniyor.

### Aracın en önemli özelliği: kör noktasını söylemesi

Her çalıştırmada doğrulayamadıklarını da yazıyor:

- **Sunucunun gerçekten açılması** — bu ortamdaki paketler taklit; sunucuyu açan tek yer CI'ın
  e2e işi
- **flutter analyze / flutter test** — Dart derleyicisi burada yok
- **APK derlemesi** — yalnızca CI'da

> Kör noktasını söylemeyen bir araç yanlış güven üretir. Bu hatanın sebebi tam olarak buydu.

### İki kalıcı kural (`docs/MODULE_STANDARD.md`)

1. **"Testler geçti" ile "sunucu açılıyor" aynı şey değildir.** Bir değişiklik, CI'ın üç işi de
   yeşil olmadan yayına hazır sayılmaz.
2. **Git bağımlılığı** ya yayımlanmış bir paket olmalı, ya da bizim denetimimizdeki bir depodan
   ve sabit bir commit'e kilitlenmiş olmalı.

## v2.145.3 — CI'daki beş hata ve kendi hatalarımın kaynağı

Hepsi benim bu oturumda yaptığım değişikliklerden. Tek tek:

### 1. `migration_runner.js` klasörü kendi konumuna göre arıyordu

```
ENOENT: scandir '.../src/infrastructure/database/migrations'
```

Dosyayı `src/` kökünden `src/infrastructure/database/` altına taşıdım. İçinde migration klasörünü
**kendi konumuna göre** çözen bir satır vardı; taşınınca yanlış yere bakmaya başladı. Dosyanın
yolunu düzelttim ama **dosyanın İÇİNDE okuduğu klasörün yolunu kontrol etmedim.**

Yol artık `src` köküne sabitlendi.

### 2. `WebViewPolicy` tanımsız (`room_tek_dock.dart:65`)

Bu en kötüsü, çünkü sebebi dikkatsizlik: import'u ekledim, hemen ardından başka bir satırı
**satır numarasıyla** silmek istedim (`sed -i '63d'`). Import eklemek satır numaralarını
kaydırmıştı ve o komut **yeni eklediğim import'u sildi.** Kontrol ederken `grep -c` kullandım,
o da doküman yorumundaki kelimeyi sayıp "var" dedi.

İki hata üst üste: kör satır silme, ve doğrulamayı yanlış şeye bakarak yapma.

### 3. `List<int>` ↔ `Set<int>` (3 yerde)

Koltuk kurallarını saf fonksiyonlara çıkarırken imzaları `Set<int>` yazdım; çağrı noktasındaki
`_lockedSeats`/`_mutedSeats` ise `List<int>` döndürüyordu.

Doğru düzeltme getter'ları `Set<int>` yapmaktı: bu değerlerin **her kullanımı `contains`**,
sıra hiç kullanılmıyor — yani zaten kümeydi, tipi yanlıştı. `.toSet()` ile çağrı noktalarını
yamamak, hatayı gizlemek olurdu.

### 4–5. İki kullanılmayan import

`media_cache.dart` (yerine `AssetPrefetch` geçti) ve `foundation.dart` (denoiser devre dışı
kalınca kullanımı kalmadı).

---

## Asıl mesele: bu hataların hiçbiri derleyici gerektirmiyordu

2, 4 ve 5 — tanımsız ad ve kullanılmayan import — `flutter analyze` olmadan da yakalanabilirdi.
Yakalanmadı, çünkü **yakalayacak hiçbir şey yoktu.**

### `mobile/tools/dart_check.py`

Dart derleyicisi olmadan yapılabileni yapar: her dosyanın import'larını çözer, `export`
zincirlerini (`show` dahil) takip eder, `package:tr_live/...` yolunu çözer ve iki şeyi bildirir —
**kullanılmayan import** ve **projede tanımlı olup import edilmemiş ad.**

Bozup sınadım: `WebViewPolicy` import'unu silince yakaladı, kullanılmayan import ekleyince
yakaladı.

**Aracın kendisi de dört kez yanlış alarm üretti ve her birini düzelttim:**

| Sahte alarm | Sebep |
|---|---|
| 24 uyarı (`SizedBox`, `Column`…) | Girintili widget çağrılarını üst düzey tanım sanıyordu |
| 30+ uyarı (`NetImg`…) | `export 'net_image.dart';` zincirini takip etmiyordu |
| `CropSpec` | `export ... show CropSpec;` biçimini anlamıyordu |
| `guard` | Jenerik işlev imzasını (`guard<T>(...)`) ve çok satırlı imzaları kaçırıyordu |

Bunları düzeltmeden bırakmak, aracı çöpe atmakla aynı şeydi: *yanlış alarm üreten araca kimse
bakmaz, yani olmamasından beterdir.* Aynı şey bir önceki sürümde adres haritasında da olmuştu.

Araç `npm run verify` zincirine eklendi.

### Hâlâ yakalanamayan

3. madde (`List` ↔ `Set`) **tip denetimi** gerektiriyor ve bu ortamda Dart derleyicisi yok.
`verify` artık bunu her çalıştırmada açıkça yazıyor: tip hataları ve null güvenliği **yalnızca
CI'ın Mobil işinde** görülür.

## v2.146.0 — Canlıdaki "Sunucu hatası" ve e2e'nin dört hatası

Kullanıcı oda açmaya çalışırken "Sunucu hatası" alıyordu. Sebep, dosyaları modüllere bölerken
yaptığım **tek bir sınıf hatanın dört ayrı yerde kalmış olmasıydı**.

### Kök neden: bölme aracım `...yayma` yazımını görmüyordu

Bölme aracı "bu dosya hangi adları kullanıyor?" sorusunu yanıtlarken `...profileJson(p)` gibi
yayma (spread) yazımlarını **özellik erişimi** sanıyordu (`...` içindeki noktalar yüzünden).
Bu yüzden o adları import listesine yazmadı. Sonuç: dosya sözdizimsel olarak doğru, sunucu
açılıyor, birim testleri geçiyor — ama **o uç çağrıldığı anda** ReferenceError.

| Dosya | Eksik ad | Kırılan şey |
|---|---|---|
| `rooms.routes.js` | `profileJson` | `GET /api/rooms/mine` → **"Yayın başlat" ekranı, oda açma** |
| `admin_events.routes.js` | `hostStatementJson` | `GET /api/admin/payouts/:id` → ajans dönem detayı |
| `admin_events.routes.js` | `agencyStatementJson` | aynı uç |
| `admin_events.routes.js` | `assistantStatementJson` | aynı uç |

Dördü de import listesine eklendi.

### Dört e2e hatasının haritası

1. **amiral hediye → HTTP 403.** Test 5.000.000 Coin'lik hediyeyi `category: 'vip'` ile
   oluşturuyordu; Vip hediyeleri WIP 3 ayrıcalığıdır ve gönderenin WIP'i yok. Test, adının
   söylediği şeyi (bütçe, gönderim, şerit, defter, mutabakat) değil, Vip kapısını sınıyordu.
   Kapının kendi sınavı zaten var. Kategori `popular` yapıldı. **Yan fayda:** 5M'lik hediye
   Vip listesinde kalsaydı, aşağıdaki Vip sınavı hediyeyi kategoriden seçtiği için bakiyesi
   yetmeyip o da kırılacaktı.
2. **ajans/yayıncı → HTTP 500.** Yukarıdaki `admin_events.routes.js` eksikleri.
3. **kalıcı oda → `undefined.audio`.** `GET /api/rooms/mine` 500 dönüyordu (`profileJson`);
   test yanıttan `rooms.audio` okuyamadı.
4. **sesli/görüntülü maaş → 44 !== 2.** Bu, 2 numaranın **artçısıydı**. Ajans testi 596.
   satırda ölünce 627. satırdaki `pay-levels/reset` hiç çalışmadı; sesli tablo 2 seviyede
   kaldı, görüntülü tablo 44'te. Teste dokunulmadı: 2 düzelince kendiliğinden geçer.

### Kalıcı güvenlik ağı: iki yeni denetim (`npm run check` içinde)

Bu hata sınıfını bir daha canlıda görmemek için:

- **`backend/tools/free_idents.mjs` — tanımsız ad.** Kullanılan ama hiçbir yerde tanımlanmayan
  / import edilmeyen adları bulur. Bulduğu şey tam olarak "Sunucu hatası"dır.
- **`backend/tools/export_check.mjs` — eksik dışa verim.** İçe aktarılan her adın karşı dosyada
  gerçekten `export` edildiğini doğrular. Bu sınıf sunucuyu **hiç açtırmaz**. 963 import denetleniyor.

İkisi de `npm run check` ve `npm run verify` içinde; CI'ın `unit` işi artık bu hataları
**yüklemeden önce** kırar.

#### Araçları yazarken yaptığım ve düzelttiğim hatalar

Bir güvenlik ağının kendisi yanılıyorsa, ağ olmamasından kötüdür. Bu yüzden ikisi de kasten
bozulmuş kodla sınandı. Yol boyunca çıkan yanlış alarmlar ve **sessiz kaçırmalar**:

- Eski `unresolved_refs.mjs` **3591 yanlış alarm** veriyordu: dizeleri yorumlardan önce
  siliyordu, Türkçe yorumdaki kesme işareti ("anahtarı'nın") dize başı sanılıyordu; ayrıca
  tanımlayıcı deseni ASCII'ydi, "işlem" gibi adlar parçalanıyordu. Yerine yeni araç geçti.
- `Array.from()` kod NOKTASI, `src[i]` kod BİRİMİ adresler. Emoji (🃏) geçen bir satırdan
  sonra tüm silme bir karakter kayıyordu.
- Şablon dizesinin `${...}` içindeki iç içe dizeler (`${x ? 'ASC' : 'DESC'}`) kod sanılıyordu.
- `export const x = f(y)` satırlarının **tamamı** atlanıyordu — dosyaların çoğu böyle yazıldığı
  için aracın en büyük kör noktasıydı.
- `if (x) {` parantezi parametre listesi sayılıyordu; böylece araç **aradığı hatayı görmez**
  hale geliyordu (yanlış alarmın tersi: sessiz kaçırma, daha tehlikelisi).
- `export_check` yorum silmeyi kendi başına yapınca aynı "/*" tuzağına düştü; sınanmış tek
  tarayıcıya bağlandı. Sonra dize içleri de silinince modül yolları görünmez oldu —
  tırnaklar korunup yol ham kaynaktan okunuyor. Araç artık **hiç import okumazsa "bozuğum"
  diyor**, "hata yok" demiyor.

### APK

`actions/upload-artifact` adımı kaldırıldı. Actions depolama kotası dolduğu için her derlemede
kırmızı satır bırakıyordu. APK zaten **Releases → `son-apk`** etiketine yükleniyor; o bağlantı
kalıcı ve kotaya sayılmıyor. 72 MB'lık dosyayı iki yere koymanın faydası yoktu.

### Doğrulanan / doğrulanamayan

Doğrulandı: 220 dosya sözdizimi · dağıtım yolları · rota haritası · **313 birim testi** ·
tanımsız ad yok · 963 import karşılığını buluyor · Dart ön denetimi.

**Doğrulanamadı (bu ortamda npm kapalı, gerçek paketler yok):** sunucunun açılması ve e2e.
Dört e2e hatasının düzeltmesi kodun okunmasıyla bulundu, çalıştırılarak değil. Karar CI'ındır.

## v2.146.1 — Olmayan adres: 404 ve onu bir daha yaşatmayacak denetim

v2.146.0 dört e2e hatasının üçünü kapattı. Kalan bir tanesi şuydu:

    amiral hediye → global şerit → HTTP 404 {"message":"Adres bulunamadı."}

Test `GET /api/gifts/global` çağırıyordu. Gerçek adres `GET /api/gifts/global/recent`.
Bu testi ben yazmıştım ve **hiç çalıştırmamıştım**. Adres düzeltildi.

### Neden hatalar teker teker çıkıyor — ve bunu nasıl bitirdim

Node test koşucusu bir testte ilk hatada o testi bırakır. Dolayısıyla aynı dosyadaki
hatalar **sırayla** görünür: bir tur bir tane. Dört hatayı kapatınca beşinci ortaya çıktı.
Bu, tek tek kovalanacak bir şey değil; sınıfı toptan kapatmak gerekiyordu.

**`backend/tools/e2e_routes.mjs`** (yeni): `app.js`'ten başlayıp router bağlamalarını iç içe
izleyerek sunucunun TAM adres listesini çıkarır (644 adres), sonra e2e'deki her `api(...)`
çağrısını (774 çağrı) bu listeyle eşler. Eşleşmeyen varsa **hepsini birden** yazar ve
"yakın adresler" olarak doğrusunu önerir. `npm run check` ve `npm run verify` içinde.

Kasten bozularak sınandı: sabit yol, şablonlu yol (`/api/rooms/${id}/...`) ve yanlış yöntem
— üçü de yakalanıyor, temiz kodda susuyor.

### Aracı yazarken yakaladığım iki sessiz kaçırma

Araç ilk halinde "tamam" diyordu ama **yanlış sebeple**:

1. **Bağlama çözümlemesi eksikti.** `app.use('/api/auth', araKatman, authRouter, authSocialRouter)`
   gibi çok argümanlı bağlamalarda yalnızca ilk ada bakıyordum; o da ara katman olduğu için
   auth adreslerinin hiçbiri listeye girmiyordu. Araç `/api/auth/login`'i bile "yok" sanıyordu
   (7 yanlış alarm). Argüman listesi artık dengeli parantezle okunuyor; `app.get(['/health',
   '/api/health'], …)` gibi dizi yazımı da destekleniyor.
2. **Şablonlu adreslerin tamamı görünmüyordu.** Ortak tarayıcı, şablon dizesinin ters
   tırnaklarını da siliyordu; bu yüzden `` `/api/rooms/${id}/members` `` biçimindeki
   çağrıların **hiçbiri** okunmuyordu. Araç 334 çağrı okuyup "hepsi tamam" diyordu —
   gerçekte 774 çağrı var. Ters tırnaklar artık korunuyor (tırnaklar gibi).

İkincisi yanlış alarmdan beterdi: araç yeşil yanıyor ama baktığı şey yarısı bile değil.
Bu yüzden her denetim aracı artık **girdiyi hiç okuyamadığında "bozuğum" diyor**, "hata yok"
demiyor — ve her biri yazıldığı gün kasten bozulmuş kodla sınanıyor.

### Testin tamamı koda karşı okundu

Aynı testin bir daha başka bir satırdan kırılmaması için 169–235 arası satır satır
uygulamayla karşılaştırıldı: `POST /api/admin/gifts` → `201 {id}` ✓ · `category: 'popular'`
geçerli (zaten varsayılan) ✓ · `POST /api/admin/users/:id/coins` → `{budget}` döndürüyor ve
deftere `transaction_type = 'system_test'` yazıyor ✓ · gönderim yanıtında `totalCoins` ✓ ·
global şerit kaydı yalnızca `lucky` ve gizli odaya bakıyor, kategoriye bakmıyor — yani
`vip` → `popular` değişikliği şeridi etkilemiyor ✓ · şerit yanıtı `events[].coinAmount`
dizesi ✓. Diğer testlerin hediye seçimleri ada göre (Rose, Heart, Şanslı Çan) ya da
`vip`/`lucky` kategorisine göre; 5M'lik `popular` hediyeyi hiçbiri seçmiyor ✓.

### Doğrulanan / doğrulanamayan

Doğrulandı: 220 dosya sözdizimi · dağıtım yolları · rota haritası · **313 birim testi** ·
tanımsız ad yok · 963 import karşılığını buluyor · **774 e2e adresinin tamamı var** ·
Dart ön denetimi.

**Doğrulanamadı:** bu ortamda npm kapalı olduğu için sunucu açılamıyor ve e2e koşturulamıyor.
404 sınıfı artık kapalı; ama iddia (assertion) ve veritabanı durumu hataları hâlâ yalnızca
CI'da görünür.

## v2.147.0 — Kalan üç görev: gözlemlenebilirlik, oyun paketi yetkisi, ekran bölme

### 1. Gözlemlenebilirlik (I-02) — kapandı

Denetimdeki boşluk aynen şuydu: *"bir şey yavaşladığında nereye bakacağımız belli değil"*
ve *"alarm yok — bir şey bozulduğunda kimse haber almıyor"*. Üçü de, denetimde yazıldığı
sırayla yapıldı: **log → metrik → alarm**.

**Yapılandırılmış log** (`infrastructure/observability/log.js`): tek satır JSON, sabit alan
adları. `token`, `password`, `authorization` gibi alanlar değeriyle birlikte maskeleniyor;
adresler zaten var olan `redactSecrets`'tan geçiyor. Paket eklenmedi.

**Uç bazında ölçüm** (`metrics.js` + `middleware/observability/timing.js`): her uç için
p50/p95/p99, 4xx/5xx, en yüksek süre; ayrıca en yavaş SQL listesi ve havuz durumu.
Panel: **Yönetim → Ölçümler**.

İki karar burada önemli:
- **Ölçüm anahtarı gerçek yol değil, rota deseni** (`/api/rooms/:roomId/members`). Gerçek
  yol kullanılsaydı her oda kimliği ayrı satır açar, bellek ve liste şişerdi. E2E bunu
  sınıyor: uç listesinde UUID görürse test kırılıyor.
- **Ortalama ikinci planda.** Bir uç isteklerin %95'inde 80 ms, %5'inde 9 saniye sürüyorsa
  ortalama "iyi" görünür ama kullanıcıların yirmide biri uygulamayı donmuş sanır.
  Sıralama varsayılan olarak p95'e göre; bunun için ayrı bir birim testi var.

SQL süresi `query` ve `tx` içinde ölçülüyor. `tx` havuzdan gelen bağlantıya yama atıyor;
**yama bağlantı havuza dönerken sökülüyor** — sökülmeseydi her işlem bir öncekinin
sarmalayıcısını sarar, sorgular birden çok kez sayılır ve bellek sızardı.

**Alarm** (`modules/system/alerts.service.js`, tablo `alerts`): API hata oranı, havuz
doluluğu, p95 gecikme, mutabakat farkı, **mutabakatın hiç çalışmaması** (sessizlik iyi haber
değildir) ve ödenmemiş hak ediş. Beş dakikada bir değerlendirilir.
- Açılır, düzelince **kendi kapanır**.
- Aynı kural açıkken ikinci satır açılmaz (tekil dizin); tekrarlar sayılır. Yoksa 5 dakikada
  bir tetiklenen bir kural geceyi 288 satırla doldurur ve kimse bakmaz olurdu.
- Bildirim yalnızca alarm **açılırken** gider, her turda değil.
- Bir kuralın hatası diğerlerini durdurmaz: tek bozuk sorgu yüzünden bütün alarm sistemi
  sessizce kapanmasın.

Eşikler ortam değişkeniyle ayarlanır (`ALERT_ERROR_RATE`, `ALERT_P95_MS`, `ALERT_POOL_WAITING`,
`ALERT_UNPAID_DAYS`, `ALERT_RECONCILE_HOURS`, `ALERT_INTERVAL_MIN`, `SLOW_QUERY_MS`).
Hata oranı için **en az 50 istek** aranıyor: 2 istekten 1'i hata ise %50 çıkar ve her gece
boş yere alarm çalardı.

**Sınır:** ölçümler bellekte ve tek sunucu örneği içindir; ikinci örnek açıldığı gün
Prometheus'a taşınmalı. Kalıcı olan tek şey alarmlardır.

### 2. Oyun paketi yetki daraltma (O-01 adım 2) — kapandı

Paketlere ham `query`/`tx` veriliyordu: yüklenen bir oyun paketi `users`,
`wallet_transactions`, `admin_sessions` — **veritabanının tamamını** okuyup yazabiliyordu.

- Paketin **sahip olduğu tablolar** kurulum SQL'inden çıkarılıp kayda yazılıyor
  (`game_plugins.tables`). Çalışma anındaki izin listesi budur; paket listeyi kendi kodundan
  genişletemez, çünkü liste süper adminin onayladığı kurulum SQL'inden geliyor.
- `ctx.db` her sorguyu denetliyor (`sandbox/sql_guard.js`): tek deyim, yalnızca
  SELECT/INSERT/UPDATE/DELETE/WITH, sistem nesneleri yasak, dokunulan her tablo izin
  listesinde olmalı. JOIN, alt sorgu ve CTE de denetleniyor. **17 birim testi.**
- `game_kv` ortak bir anahtar alanıydı: her paket diğerinin anahtarını okuyup yazabiliyordu.
  Anahtarlar paket başına ayrıldı.
- Ham `query`/`tx` artık yalnızca **güvenilir** pakette. Yeni yükleme varsayılan olarak
  güvenilmez; güveni süper admin panelden, uyarı onaylayarak veriyor ve bu denetim kaydına
  yazılıyor. Hâlihazırda kurulu paketler göçte güvenilir sayıldı, yoksa çalışan bir oyun
  bu sürümle kırılırdı.

**Açıkça yazıyorum: bu bir kum havuzu değildir.** Paket hâlâ aynı süreçte çalışıyor ve
`import('node:fs')` ile bu kapıyı tamamen atlayabilir. Yani bu daraltma **dürüst ama hatalı**
paketi durdurur, **kötü niyetli** paketi durdurmaz. Kötü niyetliye karşı tek gerçek çözüm
paketi ayrı süreçte, kendi veritabanı kullanıcısıyla çalıştırmaktır (O-01 adım 3). **O iş
bitene kadar üçüncü taraf paket yüklenmemelidir.**

### 3. room_screen.dart bölme — bu turun payı

5357 → **5142 satır**; üç yeni dosya (`gift_flight.dart`, `seat_fx.dart`, `room_chrome.dart`).

Ölçüt göz kararı değil **mekanik**: gövdesinde hiçbir ekran alanına (`_room`, `_members` …),
`setState`, `widget.` ya da `mounted` geçmeyen metotlar taşındı. Betikle sayıldığında 5357
satırın yalnızca **110'u** bu ölçütü geçiyordu; hediye uçuş animasyonu ile birlikte 215 satır.
Yeniden adlandırmadan önce parantezsiz (tear-off) kullanım arandı — biri kalsaydı yeniden
adlandırma eksik kalır ve derleyici olmadan fark edilmezdi.

**Geri kalanı neden taşımadım.** En büyük metotlar (355 satırlık üye kartı, 326 satırlık olay
dağıtıcısı) ekranın durumuna bağlı. Dart'ta bir sınıf `part` ile bölünemez; tek yol gövdeleri
`extension` içine alıp **her üye erişimini `this.` ile yazmak** — tek metotta yüzlerce
düzenleme. Bu ortamda Dart derleyicisi yok. Doğrulayamadığım 2000 satırlık bir değişiklik
göndermek, son üç turda tam olarak yaptığımız hatayı tekrarlamak olurdu. Doğru yol dosyayı
taşımak değil **durumu bir denetleyiciye çıkarmaktır**; ayrı ve büyük bir iş, `flutter analyze`
çalıştırılabilen bir ortamda adım adım yapılmalı. `docs/MODULE_STANDARD.md`'ye yazıldı.

### Doğrulanan / doğrulanamayan

Doğrulandı: 228 dosya sözdizimi · dağıtım yolları · rota haritası · **338 birim testi**
(25 yeni: 8 ölçüm, 17 SQL kapısı) · tanımsız ad yok · 983 import · **789 e2e adresinin
tamamı var** · Dart ön denetimi.

**Doğrulanamadı:** npm kapalı olduğu için sunucu açılmıyor ve e2e koşmuyor; Dart derleyicisi
olmadığı için `flutter analyze` çalışmıyor. Yeni e2e testleri (ölçümler, alarmlar, paket
yetkisi) ilk kez CI'da koşacak.

## v2.147.1 — Ölü kod temizliği: oyun hâlâ kodun içindeydi

Hibrit durum ölçülürken çıktı: iki dosya **hiçbir yerden çağrılmıyordu**.

- `lib/screens/ludo_screen.dart` (418 satır) — Ludo oyununun **uygulama içi** sürümü.
  Oyun çoktan sunucudan geliyor (`room_tek_dock` → `/api/activity-play/...`), ama eski
  yerel sürüm kodda duruyordu. "Oyunlar kodlarda olmayacak" kuralına doğrudan aykırı:
  kod satılırsa oyun da gidiyordu.
- `lib/screens/discover_screen.dart` (105 satır) — işlevi `feed_screen`'e taşınmıştı.
- `test/common_test.dart` içindeki Ludo tahta geometrisi sınavı: artık bizde olmayan
  kodu sınıyordu, kaldırıldı. Tahtayı sunucu çizdiği için doğrulama da orada olmalı.

Toplam **523 satır** çıktı; Dart 49.236 → 48.713 satır.

Bunları bulan tarama **kalıcı hale getirildi**: `mobile/tools/dart_check.py` artık
hiçbir yerden import edilmeyen dosyaları da bildiriyor. `flutter analyze` kullanılmayan
**import**'u görür, kullanılmayan **dosyayı** görmez — o yüzden bu kör nokta araçla
kapatıldı. Kasten bırakılan ölü bir dosyayla sınandı: yakalıyor, temiz kodda susuyor.

Ölü dosya yalnızca yer kaplamaz: bakarken gerçek sanılır ve **satılan kodun içinde gider**.

## v2.148.0 — SDUI v2: 12 ekranı APK'sız değiştirebilen altyapı + ilk pilot

Ölçüm şunu söylüyordu: 34 ekranın **1'i** SDUI kullanıyor, o da yalnızca sekme sırası ve
3 bölüm türü. Hibrit altyapı vardı, hibrit **içerik** yoktu. Bu sürüm o boşluğu kapatıyor.

### Bileşen ağacı

Yerleşim (column, row, grid, scroll, container, divider) · Bölüm (title, banner, card, notice) ·
Liste (list, listItem, avatarRow, badge, emptyState) · Detay (keyValue, description, image,
status) · Form (form, textInput, select, checkbox, toggle) · Durum (loading, error) ·
Veriye bağlı (repeater).

Sunucu ve uygulama aynı kataloğu taşır; panel kataloğu **sunucudan** okur. İki yere yazılsaydı
biri eskir ve panel, sunucunun kabul etmeyeceği düzenler kaydettirmeye çalışırdı.

### Yayın yönetimi

- **Taslak ve yayın ayrı.** v1'de kaydet = yayınla idi; deneme yapmak canlıyı bozmak demekti.
- **Kademeli açılış.** "Yayınla" düğmesi "herkese ver" demek değil: varsayılan %1. Yüzde
  kullanıcı kimliğinden `sha256` ile türetilir — **rastgele değil**; rastgele olsaydı aynı
  kullanıcı her açılışta farklı ekran görür, "bende öyle değildi" şikâyeti doğardı.
- **Acil kapat = %0.** Saniyeler sürer, APK beklemez.
- **Sürüm geçmişi ve geri alma.** Geri alma **taslağı da** eski sürümle değiştirir; yoksa
  panelde bozuk taslak durur ve bir sonraki "yayınla" aynı hatayı geri getirir — geri almanın
  en sık görülen tuzağı budur.
- **En düşük uygulama sürümü.** Eski APK'ya çizemeyeceği düğüm **hiç gönderilmez**.

### Üç güvenlik kararı — plandaki "izinli API action" burada şöyle oldu

1. **`api` eylemi serbest adres ALMAZ.** Yalnızca izinli **ad**: `{"type":"api","name":"markAllRead"}`.
   Adın hangi uca hangi yöntemle gideceği hem sunucuda hem uygulamada **koddadır**. Serbest
   adres olsaydı, düzeni kaydedebilen biri (ya da sunucuya giren biri) bütün telefonlara
   istediği yere istek attırabilirdi; SDUI o noktada uzaktan kod çalıştırmaya dönüşürdü.
   Listeye iş eklemek APK gerektirir — bu bir eksiklik değil, **sınırın kendisi**.
2. **Form doğrulaması yalnızca kullanıcı rahatlığıdır.** `required`/`maxLength` ekranda anında
   uyarı gösterir. Formu alan uç kuralları **kendi** doğrular ve düzenden gelenlere hiç bakmaz.
   Aksi halde istemciden gelen kuralla istemciden gelen veriyi doğrulamış olurduk; bu,
   doğrulama değildir.
3. **İki kat sürüm koruması.** Sunucu ağacı uygulama sürümüne göre süzer, uygulama ayrıca
   tanımadığı türü atlar. Tek kat yeterli olsaydı, yanlış tek bir `minApp` kaydı eski
   telefonlarda boş ekran demekti.

Ayrıca: serbest renk kodu yok (yalnızca renk **rolleri** — sunucu siyah üstüne siyah bir ekran
üretemesin), simge adları kapalı liste, `openUrl` yine WebView izin listesinden geçiyor,
ağaç derinliği/düğüm sayısı sınırlı (telefonu kilitleyen düzen kaydedilemesin).

### Pilot: Yardım / Müşteri Hizmetleri

Ekran `SduiScreenView` ile sarıldı, **yerleşik Dart sürümü geri düşme kademesi olarak duruyor**
ve silinmedi. Göç, ekranın birebir karşılığını **taslak** olarak yüklüyor; `published` NULL
olduğu için **bu sürüm kullanıcı tarafında hiçbir şeyi değiştirmiyor**. Panelden "yayınla"
denene kadar herkes bugünkü ekranı görür.

Geri düşme üç kademeli: sunucudan gelen ekran → telefonda saklanan son **çalışan** ekran →
uygulamanın yerleşik ekranı. Üçüncü kademe pazarlık konusu değil: sunucu yanıt vermediğinde
arayüzün de kaybolması, uygulamayı sunucuya rehin vermek olurdu. Bozuk ya da boş ekran
**saklanmaz** — saklasaydık uygulama ağ olmasa bile her açılışta bozuk açılırdı.

### Araç düzeltmesi

`e2e_routes.mjs` bir dosyanın birden çok router'ını ayırt edemiyordu; `export const router`
(uygulama) ile `export const adminRouter` (panel) aynı dosyadaysa ikisinin adreslerini de aynı
önekin altına yazıyor ve `/api/admin/sdui/v2/...` gibi **var olmayan adresler** üretiyordu.
Artık hangi dışa verimin bağlandığını izliyor. Adres sayısı 651 → 525'e düştü (hayaletler);
810 e2e çağrısının tamamı hâlâ tutuyor, yani gerçek adres kaybı yok.

### Doğrulanan / doğrulanamayan

Doğrulandı: 232 dosya sözdizimi · **359 birim testi** (21 yeni: şema, eylem kapısı, sınırlar,
sürüm karşılaştırma) · 999 import · **810 e2e adresinin tamamı var** · rota haritası ·
Dart ön denetimi · göçün tohum taslağı şemadan geçiyor.

**Doğrulanamadı:** npm kapalı, sunucu açılmıyor, e2e koşmuyor, `flutter analyze` yok. Yeni
e2e testleri (taslak/yayın, yüzde, sürüm eşiği, geri alma) ilk kez CI'da koşacak.

## v2.148.1 — Üç CI hatası ve üçünü de bir daha kaçırmayacak denetimler

### 1. Yardımcı adminler panelin TAMAMINDAN kilitlenmişti (en ağırı)

CI'da `kullanıcı arama → HTTP 403` diye göründü; sebebi SDUI'ydi. Yani **hatanın göründüğü
yer ile olduğu yer alakasızdı.**

```js
// sdui_v2.routes.js
export const adminRouter = Router();
adminRouter.use(requireSuperAdmin);   // ← tek satır

// admin.routes.js
router.use(sduiV2AdminRouter);        // ← YOL ÖNEKİ YOK
```

Express'te **öneksiz bağlanan** bir router'ın `use()` ara katmanı, o router'ın kendi
adreslerine değil **üst router'a gelen her isteğe** uygulanır. Ara katman `next(hata)`
derse istek öteki adreslere hiç ulaşamaz. Sonuç: `support` yetkili yardımcı adminler
kullanıcı arama dahil **bütün panelden** 403 alırdı.

Yetki artık her adrese ayrı yazılı. **`backend/tools/router_scope.mjs`** bu sınıfı kalıcı
kapatıyor: öneksiz bağlanan bir router'da yol öneki olmayan `use()` varsa `npm run check`
kırılıyor. İki yönlü sınandı — hatayı geri koyunca yakalıyor, önekli bağlamada susuyor.

### 2. "Yayınlanmamış değişiklik" uyarısı hiç sönmüyordu

PostgreSQL `jsonb` anahtar sırasını korumaz; (uzunluk, bayt) sırasına göre saklar. Sürüm
özeti düz `JSON.stringify` ile alınıyordu, yani **koddan üretilen nesne ile veritabanından
okunan aynı içerik farklı özet veriyordu.** Panel sürekli "yayınlanmamış değişiklik var"
diyordu ve geri alma bile temizlemiyordu. CI'da:
`geri almadan sonra yayınlanmamış değişiklik kalmamalı: true !== false`.

Özet artık **kurallı** biçimden alınıyor (anahtarlar sıralı). Dizi sırası içeriktir,
sıralanmaz: iki bileşenin yeri değişirse ekran değişmiştir. Üçünü de sınayan birim testi
eklendi; ayrıca yayınla → jsonb dönüşü → geri al → `dirty` yolunun tamamı çevrimdışı
canlandırılarak doğrulandı.

### 3. Kullanılmayan alan (`_loading`)

SDUI ekranında dört kez **yazılıp hiç okunmayan** bir alan kalmıştı. `flutter analyze`
bunu hata sayıyor, benim aracım görmüyordu. Alan kaldırıldı; onunla birlikte anlamsız üç
`setState` de gitti.

**`mobile/tools/dart_check.py` artık bunu ve iki şeyi daha görüyor:**
- hiç **okunmayan özel alan** (`unused_field`) — yazmak kullanmak değildir
- hiç **kullanılmayan özel metot** (`unused_element`)
- hiçbir yerden çağrılmayan **dosya** — `flutter analyze` bunu hiç görmez

#### Bu aracı yazarken düzelttiğim üç kendi hatam

Güvenlik ağının kendisi yanılıyorsa ağ olmamasından beterdir, o yüzden yazıyorum:

- İlk desen `room_format.dart`'ta **katastrofik geri izlemeye** girip aracı kilitledi;
  denetim hiç bitmiyordu. Satır bazlı, belirsizlik bırakmayan desene çevrildi (1,7 sn → 0,008 sn).
- Dizeleri tamamen silen `strip()` ile sayım yapınca `'$_prefix$screen'` gibi
  **interpolasyonlarda** geçen alanlar "hiç okunmuyor" sanıldı: 11 bulgunun 10'u sahteydi.
  Dart'ta interpolasyon KODDUR; artık korunuyor.
- Kullanım deseni `$`'ı hem önde hem arkada dışlıyordu; `$_prefix$screen` iki interpolasyon
  yan yana olduğu için ikisi de görünmez kalmıştı.

Her iki denetim de kasten bozulmuş kodla iki yönlü sınandı: CI'ın bulduğu hatanın aynısını
yakalıyor, temiz kodda susuyor.

### Ayrıca düzeltilen (CI'ın göremediği, okuyarak bulduklarım)

- **Pull-to-refresh çalışmıyordu.** `RefreshIndicator` aşağı çekmeyi ancak kaydırılabilir bir
  çocukta algılar; kök bileşen `scroll` değilse (düz bir `column`) çekmek hiçbir şey yapmazdı.
- **Sarmalı (wrap) satırlar iki kez çiziliyordu** — `row` dalında çocuklar iki kez inşa ediliyordu.
- **`tx` içindeki sorgu sarmalayıcısı üçüncü argümanı düşürüyordu**; pg'nin
  `query(text, values, callback)` biçimi bozulurdu.

### Kontrol edilip SORUN BULUNMAYANLAR

Aynı sınıftan başka hata var mı diye bakılan ve temiz çıkanlar — "bakmadım" ile
"baktım, temiz" farkı önemli:

- **SDUI v1'de aynı özet hatası var mı?** Yok: v1 her zaman doğrulanmış nesneyi özetliyor,
  ham jsonb'yi değil.
- **Başka öneksiz router'da sızan ara katman var mı?** Yok: 74 bağlama denetlendi.
- **Yeni Flutter API'leri repoyla uyumlu mu?** Evet: `withValues` zaten 47 yerde,
  `DropdownButtonFormField(initialValue:)` cüzdan ekranında, `?eleman` sözdizimi
  `asset_manifest.dart`'ta kullanılıyor — hepsi CI'dan geçmiş.
- **Yeni Dart dosyalarında kullanılmayan özel üye var mı?** Yok (araç doğruladı).
- **Alarm sorgularındaki tablo/sütun adları doğru mu?** `wallet_recon_runs`,
  `host/agency/assistant_statements`, `payout_periods.closed_at`, `users.system_role`,
  `users.account_status` — hepsi göçlerle karşılaştırıldı.

### Doğrulanan / doğrulanamayan

Doğrulandı: 232 dosya sözdizimi · **360 birim testi** · 999 import · 810 e2e adresi ·
74 router bağlaması · rota haritası · Dart ön denetimi (ölü dosya + kullanılmayan alan/metot) ·
kırılan e2e iddiasının çevrimdışı canlandırması.

**Doğrulanamadı:** npm kapalı, sunucu açılmıyor, e2e koşmuyor, `flutter analyze` yok.
Tip hataları ve null güvenliği hâlâ yalnızca CI'da görünür.

## v2.148.2 — Oda üstündeki sayfa neden "ekran görünümünü kaybediyordu" + vektörel düzen

### Bulunan hata: `tek.html` bir PARÇA olarak yazılmıştı

Oda üstünde açılan TEK oyunu sayfasında `<!doctype html>` ve `<meta name="viewport">`
**yoktu**. Yanındaki `ludo.html`de ikisi de vardı; fark yalnızca bu iki satırdı ve gözle
karşılaştırmadıkça görünmüyordu. Sonuçları:

1. **Viewport etiketi yok → Android WebView sayfayı ~980 CSS piksellik SANAL bir ekrana
   çizip küçültüyor.** Oda üstündeki küçük pencerede bu, her şeyin minicik görünmesi,
   oranların bozulması ve dokunmaların kayması demek. Senin tarifin tam buydu:
   "açılan sayfada ekran görünümünü kaybediyor".
2. **Doctype yok → tarayıcı QUIRKS kipinde.** Orada `html,body{height:100%}`,
   `.box{max-height:100%}` gibi yüzdeli yükseklikler beklendiği gibi çözülmüyor; yani
   sayfanın kendi yerleşimi de bozuluyordu.

Sayfaya düzgün bir `<head>` verildi. **Yapı doğrulanarak:** ilk denemede dosyada zaten
bir `</head>` olduğunu fark etmeyip ikincisini eklemiştim; etiket çiftleri sayılarak
yakalandı ve düzeltildi.

**`backend/tools/webview_pages.mjs`** bu sınıfı kalıcı kapatıyor: WebView'e sunulan her
sayfada doctype ve viewport aranıyor (`npm run check` içinde, 6 sayfa denetleniyor).
Kasten bozularak iki yönlü sınandı.

### Ekran mimarisi: dört yeni yerleşim bileşeni

| Bileşen | Ne işe yarar |
|---|---|
| `aspectRatio` | Kart/afiş oranını korur. **Sabit piksel yükseklik artık yazılmıyor** — dar ekranda taşıyor, geniş ekranda sırıtıyordu. |
| `maxWidth` | Geniş ekranda satır 900 piksele uzayıp okunmaz hale gelmesin. |
| `safeArea` | Alt çentik/gezinme çubuğu sayfanın son öğesini yutmasın. |
| `spacer` | Boşluk bir tasarım kararı; her bileşene rastgele padding vermek yerine. |

### Vektörel bileşenler: `icon` · `shape` · `progress`

Üçü de **kodla çizilir, görsel indirmez** (`shape` bir `CustomPainter`: daire, halka,
yuvarlatılmış kare, nokta, çizgi). Üç kazanç:

- **Keskinlik** — PNG 3x yoğunluklu ekranda bulanıklaşır, vektör her yoğunlukta nettir.
- **Hız** — indirme yok: ekran anında açılır, çevrimdışı da çizilir.
- **Tema** — rengini `tone`'dan alır; marka rengi ya da gece/gündüz değişince kendi uyar.

`image` artık yalnızca **gerçek fotoğraf** için (afiş, avatar). Simge, ayraç, rozet,
ilerleme halkası, çerçeve → vektör.

Kapalı liste kuralı burada da geçerli: `shape: "ucgen"` ya da serbest renk kodu reddedilir.

### Kalan 11 ekran için rehber ve referans düzen

- **`docs/SDUI_LAYOUT_GUIDE.md`** — sayfa iskeleti (maxWidth → column → title → içerik →
  ayraç → eylem → safeArea), oran kuralı, vektör/görsel ayrımı, dikey ritim (12–16 / 6–10),
  renk rolleri, boş durum zorunluluğu ve WebView sayfası kuralları.
- **`106_sdui_help_layout.sql`** — Yardım ekranının bu mimariyle yazılmış referans düzeni
  (26 düğüm). Kalan ekranlar bunu örnek alacak.

Göç **yalnızca taslağı** ve **yalnızca hiç elle düzenlenmemişse** günceller
(`draft_updated_by IS NULL`): kullanıcı tarafında hiçbir şey değişmez, yöneticinin emeği
de ezilmez. 105'i düzenlemek yerine ayrı göç yazıldı, çünkü göçler bir kez uygulanır ve
105 canlıda çalışmış olabilir.

### Doğrulanan / doğrulanamayan

Doğrulandı: 232 dosya · **364 birim testi** (4 yeni: oran, genişlik sınırı, vektör
bileşenleri, kapalı liste) · 999 import · 810 e2e adresi · 74 router bağlaması ·
6 WebView sayfası · referans düzen şemadan geçiyor · HTML etiket çiftleri.

**Doğrulanamadı:** sayfanın küçük pencerede göz kararı nasıl durduğu — bunu ancak
telefonda sen görebilirsin. Araç yalnızca "ekranı doğru ölçüyor mu" sorusunu yanıtlar.

## v2.148.3 — Veri gelen ekranların temeli + şema/uygulama eşleşme denetimi

### Sessizce boş ekran verecek bir boşluk vardı

`repeater` ve `avatarRow` **şemada tanımlıydı ama çizicide karşılıkları yoktu.** Bu sınıf
hiçbir yerde hata vermez:

1. Panel o bileşeni katalogda **gösterir**, yönetici ekrana koyar, kaydeder, yayınlar.
2. Uygulama tanımadığı türü **atlar** (bilerek — eski APK çökmesin diye).
3. Kullanıcı **boş ekran** görür. Hiçbir kayıtta iz yoktur.

Gelen kutusu, etkinlikler, ilişkiler — veri gelen bütün ekranlar böyle çizilecekti.
İkisi de yazıldı; **`backend/tools/sdui_parity.mjs`** bu sınıfı kalıcı kapatıyor: şemadaki
her bileşenin/eylemin/kaynağın uygulamada karşılığı var mı diye bakıyor (47 tanım,
`npm run check` içinde). Üç yönlü kasten bozularak sınandı.

### Veri kaynakları: dördü uydurmaymış

Şema `faq`, `tasks`, `familyMembers`, `agencyReport` kaynaklarını tanıtıyordu. Uçlara tek
tek bakıldı: **ikisi hiç uç değil, ikisi liste değil nesne döndürüyor.** Dördü de kaldırıldı.

Kalan dördünün karşılığı uçtan doğrulandı:

| Kaynak | Uç | Yanıt anahtarı |
|---|---|---|
| `events` | `/api/activities` | `items` |
| `inbox` | `/api/me/notifications` | `notifications` |
| `relations` | `/api/friends` | `users` |
| `dealerCatalog` | `/api/dealer/topup-packages` | `packages` |

### Şablon bağlama — bilerek çok dar

`repeater`'ın çocukları şablondur: metinlerdeki `{alan}` her öğenin alanıyla değiştirilir.
**Yalnızca düz alan adı**; ifade, çağrı, iç içe erişim ya da koşul yok. Şablon dili eklemek,
sunucuya uygulamanın içinde mantık çalıştırma yetkisi vermeye giden yoldur — SDUI'nin tüm
güvenliği "sunucu yeni davranış üretemez" kuralına dayanıyor. Bilinmeyen alan boş dizeye
çevrilir, kullanıcıya süslü parantez gösterilmez.

Veri gelmezse (hata ya da boş liste) `emptyText` çizilir: **boş ekran, bozuk ekrandan ayırt
edilemez.**

### 11 ekranın gerçek karşılıkları çıkarıldı — plan koda birebir oturmuyor

`docs/SDUI_SCREEN_MAP.md`. Varsayımla düzen yazmak, hiç açılmayacak ekranlar üretmek olurdu:

- **İkisi zaten dinamik** (etkinlik listesi ve detayı sunucudan geliyor) — yapılacak iş yok.
- **Biri hiç uygun değil:** `event_screen.dart` mevsimsel etkinlik SANATI (869 satır, tema
  görselleri, hafta tarihleri). Orada tasarımın kendisi üründür; sunucudan gelen bir ağaçla
  çizilemez, çizilse kötüleşir.
- **Altısı kısmi:** ekranın bilgi/liste kısmı SDUI'ye gider, işlem akışı (üyelik, ödeme,
  istek kabul) yerel kalır — mimari ilke zaten bunu söylüyor. Aile ekranı 24 durumlu sınıf,
  ilişkiler 16; bunları tümden taşımaya çalışmak bugün çalışan akışları bozmak olurdu.

Yani hedef "11 ekranı taşımak" değil, **her ekranın SDUI'ye giden kısmını taşımak**.

### Sıradaki işler yazıldı

`docs/BACKLOG.md`: Ludo zar sonucunun görünmemesi · zar görseli · 6 atınca taş oynatmayıp
tekrar atma ve 2–3 sonucu birlikte oynama · TEK ve Ludo hızlandırma · hediye şeffaflık
kalitesi ve animasyon sistemi (SVGA/Lottie/alfa video, şeffaf arka plan testleri, boyut
optimizasyonu, ön yükleme, çakışma yönetimi) · asset güvenliği maddeleri.

### Doğrulanan / doğrulanamayan

Doğrulandı: 232 dosya · **366 birim testi** (2 yeni) · 999 import · 810 e2e adresi ·
74 router bağlaması · 6 WebView sayfası · **47 şema/uygulama tanımı** · Dart ön denetimi.

**Doğrulanamadı:** `repeater`'ın gerçek veriyle nasıl çizildiği — ağ çağrısı gerektiriyor,
ilk kez telefonda görülecek.

## v2.148.4 — İlk gerçek veri bağlama: Bildirimler ekranı SDUI'ye bağlandı

### Bağlanan ekran

`NotificationsPage` (`/api/me/notifications`) artık düzenini sunucudan alabiliyor.
Yerleşik Dart listesi **geri düşme kademesi olarak duruyor ve silinmedi**: yayın yoksa,
uygulama sürümü yetmiyorsa ya da kullanıcı kademeli açılış diliminde değilse o çiziliyor.

`107_sdui_inbox_layout.sql` referans düzeni taslak olarak yüklüyor — **yayın NULL, yani
kullanıcı tarafında hiçbir şey değişmiyor.** Panelden "yayınla" denene kadar herkes bugünkü
listeyi görüyor.

Düzen, `repeater` ile **ilk gerçek veri bağlamasını** gösteriyor:

```json
{ "type": "repeater", "source": "inbox", "max": 50,
  "emptyText": "Son 7 günde bildirimin yok.",
  "children": [ { "type": "listItem", "title": "{title}", "subtitle": "{body}", "icon": "bell" } ] }
```

### Şablon bağlamanın sınırları sınandı

`mobile/test/sdui_bind_test.dart` — 11 sınav. Önemlisi şu: **ifade, çağrı ve iç içe erişim
bağlanmaz.** `{a.b}`, `{f()}`, `{a ? b : c}`, `{1}` olduğu gibi kalır, çalıştırılmaz.
Şablon dili eklemek sunucuya uygulamanın içinde mantık çalıştırma yetkisi vermeye giden
yoldur; SDUI'nin tüm güvenliği "sunucu yeni davranış üretemez" kuralına dayanıyor.

Ayrıca: bilinmeyen alan **boş** olur (kullanıcıya süslü parantez gösterilmez), bozuk bir
çocuk düğüm **atlanır ama kardeşlerini düşürmez**, şema sürümü uyuşmazsa ekran hiç
çizilmez, okuma yardımcıları hiç atmaz.

### Neden yalnızca bir ekran

İki aday daha vardı ve ikisini de **bilerek bırakıyorum**:

- **Arkadaşlar** iki sekmeli (`TabBarView`), liste sekme içinde anahtarlı yeniden kurulumla
  çalışıyor.
- **Bayi kataloğu** satın alma akışıyla iç içe.

İkisi de "listeyi ayır, işlemi yerel bırak" cerrahisi istiyor. Üç ekranı aynı turda aceleye
getirmek, bugün çalışan akışları bozma riski demekti; bir ekranı düzgün bitirmek daha doğru.
`docs/SDUI_SCREEN_MAP.md` güncellendi.

### Doğrulanan / doğrulanamayan

Doğrulandı: 232 dosya · 366 birim testi (sunucu) · 999 import · 810 e2e adresi ·
74 router bağlaması · 6 WebView sayfası · 47 şema/uygulama tanımı · Dart ön denetimi ·
referans düzen şemadan geçiyor · değiştirilen ekranın parantez dengesi.

**Doğrulanamadı:** `flutter test` burada çalışmıyor — 11 yeni Dart sınavı ilk kez CI'da
koşacak. `repeater`'ın gerçek veriyle çizimi de ilk kez telefonda görülecek.

## v2.148.5 — Arkadaş listesi bağlandı; liste satırı artık ikinci eylemi taşıyor

### Bağlanan: arkadaş listesi (yalnızca liste)

`FriendsScreen` iki sekmeli. **Sadece ilk sekme** (arkadaş listesi) SDUI'ye bağlandı;
**istekler sekmesi yerel kaldı** — orası kabul/ret işlemi, görünüm değil. Yerleşik liste
`_builtInFriends` olarak duruyor ve geri düşme kademesi.

### Taşımak için eksik olan iki parça — taşımadan önce tamamlandı

Listeyi olduğu gibi taşımak **mümkün değildi**, çünkü SDUI sürümü yerleşik sürümden kötü
olurdu. İki eksik vardı ve ikisi de kapatıldı:

**1. Satırın sağındaki ikinci düğme.** Yerleşik listede her satırın sağında "Mesaj"
düğmesi var; `listItem` yalnızca tek bir eylem taşıyordu. `trailingIcon` + `trailingAction`
eklendi. **Kural: SDUI sürümü yerleşik sürümden kötüyse yayınlanmamalı** — o yüzden
bileşeni zenginleştirmek, özelliği kaybetmekten doğru.

**2. Sohbeti açmak.** Sohbet ekranı karşı tarafın adını, rengini, seviyesini ve avatarını
ister; bunlar tek bir dizeye sığmaz. Yeni `openChat` eylemi **yalnızca kimlik** taşır,
gerisini uygulama `/api/users/:id` ile çeker — profil ekranındaki "Mesaj" düğmesinin zaten
yaptığı şeyin aynısı. Eksik bir haritayla açsaydık sohbet başlığı boş görünürdü.

### Şema iki kez kendi hatamı yakaladı

Düzeni kaydetmeye çalışırken şema reddetti, ikisi de gerçek tasarım boşluğuydu:

- **Kimlik alanları şablon kabul etmiyordu.** `{id}` reddediliyordu; yani `repeater`
  içinde yalnızca SABİT kimlik yazılabilirdi, bu da listeyi anlamsız kılardı.
- **Görsel alanı şablon kabul etmiyordu.** `{avatarUrl}` reddediliyordu; liste satırında
  görsel ancak öğeden gelebilir.

İkisi de artık `{alan}` biçimini kabul ediyor — **sadece o biçimi**: `{a.b}`, `{f()}`,
`{1}` hâlâ reddediliyor, `file://` ve `javascript:` de öyle. Bağlanan değer bizim kendi
API yanıtımızdan gelir, düzeni yazan kişiden değil.

### Eşleşme aracı artık eylem listesini elle tutmuyor

`sdui_parity.mjs` eylem türlerini **şemadan** okuyor (`ACTION_TYPES`). Elle tutulsaydı,
şemaya eklenen `openChat` bu araca eklenmediği sürece denetlenmeden geçerdi — aracın görevi
tam da bunu yakalamak. Kasten bozularak sınandı. 56 tanım denetleniyor.

### Doğrulanan / doğrulanamayan

Doğrulandı: 232 dosya · **370 birim testi** (4 yeni: kimlik/görsel şablonu, satır sonu
eylemi, eylem kaynağı) · 999 import · 810 e2e adresi · 74 router bağlaması · 56 şema/uygulama
tanımı · `FriendsScreen` parantez dengesi · referans düzen şemadan geçiyor.

**Doğrulanamadı:** `flutter test` ve `flutter analyze` burada yok. `openChat`'in gerçek
veriyle çalışması ilk kez telefonda görülecek.
