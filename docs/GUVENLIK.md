# Güvenlik

Bu belge uygulamada **şu an çalışan** korumaları ve bilinçli olarak açık kalanları listeler.

## Kimlik ve oturum

| Koruma | Ayrıntı |
|---|---|
| Şifre | bcrypt (maliyet 12), en az 6 karakter, en fazla 72 bayt. v2.92: yeni şifrede en yaygın şifreler (123456, qwerty, sifre123, takım adları …), tek karakter tekrarı ve kullanıcı adıyla aynı şifre reddedilir (mevcut şifrelerle giriş etkilenmez) |
| Giriş kilidi | 5 hatalı denemeden sonra IP+kullanıcı adı için geçici kilit; kullanıcı yoksa da bcrypt çalışır (yanıt süresinden kullanıcı adı sızmaz) |
| Cihaz oturumu (v2.36) | Girişte 1 saatlik erişim token'ı + yenileme token'ı. Yenileme token'ı veritabanında yalnızca SHA-256 özeti olarak tutulur, her kullanımda değişir |
| Çalıntı token tespiti | Eski bir yenileme token'ı 15 dakikalık ağ toleransından sonra tekrar kullanılırsa oturum kapatılır ve o cihazın soketi kesilir |
| Uzaktan çıkış | Ayarlar > Oturumlarım: cihaz listesi, tek cihazdan çıkış, "diğer tüm cihazlardan çıkış" (eski uygulama sürümlerinin token'ları da geçersiz olur) |
| Toplu geçersizleştirme | Şifre değişimi, ban, hesap silme ve yönetici "oturumları kapat" → `token_version` artar, tüm oturumlar kapanır, soketler kesilir |
| Oturum sınırı | Kullanıcı başına en fazla 10 açık cihaz oturumu; aynı cihazdan yeniden giriş eski oturumun yerini alır |
| Yarış koşulu | Giriş sürerken şifre değişir veya ban gelirse yeni oturum açılmaz (kayıt token sürümü kontrolüyle yazılır); eski tip token yalnızca bir kez yükseltilebilir |
| Eski sürüm uyumu | Cihaz bilgisi göndermeyen eski APK'lar 30 günlük tek token alır; uygulama güncellenince yeniden giriş istemeden cihaz oturumuna geçer |
| Gizli anahtarlar (v2.92) | `NODE_ENV` yalnızca `development`/`test` ise varsayılan geliştirme anahtarı kullanılır; boş bırakılmışsa sunucu üretim sayılır: `JWT_SECRET` en az 32 karakter ve örnek değer (`CHANGE_ME` …) olamaz, LiveKit anahtarları örnek değerdeyse sunucu açılmaz |
| Yönetici atama — `ADMIN_USERNAMES` (v2.92) | Kayıt anında yalnızca sistemde hiç aktif yönetici yokken (ilk kurulum) yönetici yapılır. Açılışta listedeki ad, o ad listeye **eklenmeden önce** açılmış hesaba ve yalnızca **bir kez** yetki verir (`bootstrap_admins`): yöneticinin adı değişir / hesabı silinirse boşa çıkan adı alan kişi yönetici olamaz; listede olup henüz alınmamış adı kapan da olamaz. Listeden çıkarıp yeniden eklemek, adı kapmış hesabı yönetici yapmaz (ad bir hesapta durdukça kaydı silinmez). Yönetici yokken bile, ad daha önce başka bir hesaba yetki vermişse kayıtla yönetici olunmaz. Reddedilen deneme güvenlik kaydına düşer |
| Zorunlu güncelleme (v2.36) | Yönetim paneli > Uygulama ayarları > En düşük sürüm. Altındaki sürümler 426 alır ve "Güncelleme gerekli" ekranı görür. Yönetici kendi sürümünden yüksek değer giremez (kendini kilitlemesin) |

## Ağ ve istek katmanı

* **Güvenlik duvarı:** IP yasağı (kalıcı, veritabanında), IP başına dakikalık sınır, kötü davranış puanı eşiği aşılınca otomatik yasak, yönetici panelinden elle IP engeli.
* **WAF kuralları (URL ve User-Agent):** yol gezintisi, null bayt, SQL enjeksiyonu kalıpları, XSS kalıpları, komut enjeksiyonu, tarayıcı/araç imzaları (sqlmap, nikto ...).
* **Gövde denetimi:** JSON en fazla 100 KB, en fazla 8 seviye derinlik / 2000 düğüm, `__proto__`/`constructor`/`prototype` anahtarları reddedilir.
* **Uç bazlı hız sınırları** (giriş, kayıt, sohbet, DM, hediye, yükleme, rapor ...) — tam liste: [generated/api.md](generated/api.md) "⏱" sütunu. Token yenileme IP sınırına sayılmaz (operatör NAT'ı arkasındaki binlerce kullanıcı aynı IP'yi paylaşır).
* **WebSocket:** kullanıcı başına 5, IP başına 30 bağlantı; 10 sn'de 40 mesaj; mesaj en fazla 8 KB; oda aboneliği üyelik doğrulamasıyla.
* **Başlıklar:** helmet (HSTS 1 yıl, nosniff, frame koruması), `X-Powered-By` kapalı, API yanıtları önbelleğe alınmaz.
* **Hatalar:** 5xx ayrıntısı istemciye gitmez; PostgreSQL hata kodları genel Türkçe mesaja çevrilir.

## Veri ve para

* Tüm sorgular parametreli (SQL enjeksiyonu yok).
* Para işlemleri tek veritabanı işleminde, satır kilitli, bakiye eksiye düşemez (kısıt). Ayrıntı: [EKONOMI.md](EKONOMI.md).
* Tekrar koruması (v2.37): para harcayan istekler tek kullanımlık anahtarla gelir; aynı istek iki kez gelse bile bir kez işlenir.
* Yardımcı admin Coin yükleme sınırları (v2.92): tek seferde 100.000, saatte 30 yükleme ve **24 saatte toplam** `SUPPORT_COIN_DAILY_LIMIT` (varsayılan 2.000.000; sunucu panelinden değişir, `0` = yardımcı admin Coin yükleyemez). Sınırlar işlem kaydından sayılır: sunucu yeniden başlasa da sıfırlanmaz, aynı anda gönderilen iki istekle aşılamaz. Yönetimin koyduğu (süresi dolmamış) banı yardımcı admin kaldıramaz ve yeni bir banla değiştiremez (kısaltıp kaldırma yolu kapalı).
* Yönetici hesabı uygulamadan silinemez (ele geçirilen oturumla yönetim kaybedilmesin, boşa çıkan ad başkasına geçmesin).
* Ses/görüntü (LiveKit) anahtarı 20 dakika geçerlidir (eskiden 2 saat): odadan atılan / engellenen kişi elindeki eski anahtarla odaya en fazla bu süre içinde doğrudan girebilir; bağlı kalan kişinin bağlantısı kesilmez.
* Kullanıcı bakiyesi başkalarına gösterilmez.
* Gizli kullanıcı (v2.92.1, Yoho "gizemli kişi"): yalnızca **odalarda** (üyeler, koltuk, oda sohbeti, hediye, çanta, PK, oyun,
  oda katkı listesi) "Gizli Kullanıcı" + gizli ID; tüm uygulamaya giden hediye / şans şeritlerinde ve sıralamalarda (destekçiler,
  haftalık etkinlikler, liderlik tabloları) "Gizli Kullanıcı" (gizli ID'siz). Mesajlar, akış, yorumlar, profil, arama, arkadaş,
  takip, aile, CP ve koruyucuda kişi kendi kimliğiyle görünür; ama gizli modda olduğu, gizli ID'si, çevrimiçi durumu ve hangi
  odada olduğu (takip / favori / son odalar / aile odaları listeleri dahil) gösterilmez: odadaki gizli kimlikle eşleştirilemez.
  Gizli sahibin odası adıyla aranamaz, son odalara yazılmaz, favoriye eklenemez. Toplam sıralamalar kişinin şu anki
  gizliliğine göre gösterilir. Bilinen sınır: oda verilerinde kullanıcının iç kimliği (UUID) durur; uygulama bunu göstermez ama trafiği inceleyen teknik biri
  eşleştirebilir.
* **Yüklenen dosyalar:** içerik baytlarından tür tespiti (uzantıya güvenilmez); APNG, zip, eski SVGA, harici dosyalı Lottie reddedilir; boyut sınırları. v2.36'dan itibaren görseller veritabanında (`media_files`) — sunucu yeniden dağıtılınca kaybolmaz. Kullanıcı yalnızca kendi yüklediği dosyayı silebilir; yönetici varlıkları kullanıcı işlemiyle asla silinmez.
* Profil fotoğrafı dış adres olarak verilemez (görenlerin IP'si başka sunucuya sızmasın); yalnızca yükleme.
* Hesap silme: kişisel alanlar boşaltılır, gönderiler gizlenir, yüklenen fotoğraflar silinir, tüm oturumlar kapanır.

## İçerik ve moderasyon

| Koruma | Ayrıntı |
|---|---|
| Görünmez karakterler | Yön değiştirme (RTL override), sıfır genişlikli ve kontrol karakterleri temizlenir |
| Küfür filtresi | Yerleşik Türkçe/İngilizce kök listesi + `BANNED_WORDS`; yazım hileleri (s1k, a.m.k, siiiik) yakalanır |
| Spam | Aynı karakter/kelime tekrarı |
| Link / reklam (v2.36) | http(s), www, alan adları (Türkçe cümlelerde yanlış alarm vermeyecek uzantı listesiyle), "nokta com" gizlemeleri, t.me / wa.me / discord.gg, "insta: @..." yönlendirmeleri |
| Telefon numarası (v2.36) | Türkiye cep (operatör önekleriyle) ve + ile başlayan numaralar; herkese açık alanlarda (özel mesaj hariç) |
| Otomatik kısıt (v2.36) | Spam yalnızca reddedilir, ihlal sayılmaz. Varsayılan: 10 dk içinde 3 ihlal (link/telefon/küfür) → 15 dk tüm sohbetlerde kısıt; 24 saat içinde tekrarlarsa süre ikiye katlanır (en fazla 24 sa). Yönetim panelinden ayarlanır |
| Herkese açık metinler | Ad, biyografi, oda adı/duyurusu, aile/ajans adı: küfür, link ve telefon reddedilir |
| Şikâyet / engelleme | Kullanıcı, mesaj ve oda şikâyeti; engellenen kişi mesaj atamaz, çevrimiçi durumunu göremez |
| Yetkili işlem kaydı | Ban, nick/fotoğraf değişikliği, bakiye düzeltme, kısıt, ayar değişikliği ... kim, ne zaman, kime (Panel > İşlem kaydı) |

## Mobil

* Token'lar uygulamanın kendi saklama alanında (SharedPreferences). Çıkışta sunucudaki oturum da kapatılır.
* Android bulut yedeği kapalı (v2.92, `android:allowBackup="false"`): oturum anahtarları Google yedeğine kopyalanıp başka telefona geri yüklenmez. Android 12+ bazı telefonlarda kullanıcının kendi başlattığı telefondan telefona aktarım yine veri taşıyabilir (kilidi açık telefon gerekir).
* Dart kodu derlenmiş makine kodu olarak gelir; uygulamada kaynak haritası (source map) yoktur. Kod karıştırma (obfuscate) bilerek açılmadı: telefondan gelen hata kayıtları okunamaz hâle gelirdi.
* Cihaz kimliği kuruluma özel rastgele değerdir; telefonun donanım kimliği okunmaz.
* Emülatörden açılan oturumlar panelde "EMÜLATÖR" olarak işaretlenir (engellenmez).
* Uygulama hataları yerelde saklanır ve sunucuya gönderilir (kullanıcı verisi içermez: yalnızca hata metni, ekran adı, sürüm, cihaz modeli).

## Bilinçli olarak açık kalanlar

| Konu | Neden / plan |
|---|---|
| SSL pinning | Render sertifikası değişince uygulama kilitlenirdi. Kendi alan adına geçince eklenecek |
| Root tespiti | Ek paket gerektirir; önce emülatör işaretlemesiyle başlandı |
| Token'ların şifreli saklanması (Keystore) | `flutter_secure_storage` eklenince; şu an uygulama alanı yalnızca uygulamaya açık |
| İki aşamalı doğrulama / telefonla giriş | SMS sağlayıcısı gerekir |
| Çoklu sunucu örneği | Hız sınırları ve WebSocket hub bellek içi; Redis gerekir (yol haritası) |
| Yedek | Render ücretli planında günlük yedek; `deploy/backup.sh` kendi sunucu için |

## Sunucu (Oracle kurulumu)

* Sunucu paneli (`/panel`): HTTP Basic (en az 10 karakter şifre), IP başına 15 dakikada 8 hatalı deneme. v2.92: sayfa
  betik çalıştırmaz (CSP), başka siteden form gönderimi `Sec-Fetch-Site` / `Origin` / `Referer` ile reddedilir.
* Kurulumda üretilen panel şifresi yalnızca sunucu konsoluna yazılır; kurulum kaydına yazılmaz (v2.92). Eski kayıtlardaki
  şifre satırı her güncelleme kontrolünde silinir; uygulamadaki "Sunucu" sayfası kayıtları göstermeden önce şifre, anahtar,
  token ve bağlantı adresi şifrelerini gizler.
* Gizli anahtarlar kurulumda rastgele üretilir (`/opt/trlive/env`, yalnızca root okur). Konteynerler bulut meta-veri
  adresine erişemez; LiveKit yönetim portu (7880) dışarıya kapalıdır.
* Sunucu GitHub'daki `main` dalını 5 dakikada bir indirip uygular: **GitHub hesabında iki aşamalı doğrulama açık olmalıdır**
  (depoya yazabilen kişi sunucuya da kod gönderebilir).

## CI (GitHub Actions)

* Backend ve Mobile iş akışları depoyu yalnızca okur (`permissions: contents: read`).
* Backend iş akışı `npm audit` ile bilinen açığı olan paketleri özet sayfasında gösterir (derlemeyi durdurmaz).
