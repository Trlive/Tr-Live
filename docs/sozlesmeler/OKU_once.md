# Sözleşmeler: yapılan düzeltmeler, kararlar, imza usulü

> **Taslakların yeri:** `backend/src/modules/contracts/drafts/` (sunucu imajına girsin diye buraya taşındı). Yayımlama web panelinde:
> **Sistem → Sözleşmeler** — tür seç, metni düzenle, sürüm ver, yayımla. `[KARAR]` notu kalmış metin yayımlanamaz; yayımlanan sürüm
> ve onay kayıtları değiştirilemez (veritabanı engeller). Sözleşmelerin tarafı olan işletmeci bilgisi: uygulama ayarı `contractCompany`.

## Sahibin kararları (sürüm 1.2)

| Konu | Karar | Metne / sisteme etkisi |
|---|---|---|
| İmza usulü | **İşlemle birlikte tek dokunuşla kabul** (v2.152.21; rakiplerdeki gibi). SMS ve PDF yok | Yayıncı sözleşmesi ajans davetini kabul ederken (düğmenin altında not ve bağlantı), ajans ve bayi sözleşmesi panel ilk açılırken "Okudum, kabul ediyorum" ile. Kayıt: sürüm, gösterilen metnin SHA-256 özeti, zaman, işlem, IP, cihaz; veritabanında değiştirilemez. Sözleşmeler 1.3'te son madde buna göre. |
| Bayilik modeli | **Toptan alım-satım (bugünkü model):** bayi TR LIVE'den toptan Coin alır, kendi adına müşteriye satar, Coin'i müşterinin ID'sine yükler, kazancı alış-satış farkıdır | Bayilik sözleşmesi bu modele göre baştan yazıldı. Bayi müşteriye karşı satıcıdır (fatura/fiş, tüketici hakları, ters ibraz riski). Play kuralı: bayi uygulama içinde satış reklamı, fiyat, IBAN, iletişim paylaşamaz. |
| Sözleşmenin tarafı olan şirket | **Henüz belli değil** | Alan boş; sistemde ayar olarak tutulacak. |
| Kendine hediye | **Sınırla** | Dönemde sayılan toplam Diamond'ın en çok %20'si (başkalarından gelenin dörtte biri). Sistemde uygulandı (v2.152.20): maaş, avans, ajans primi ve yayıncı ekranı aynı kuralı kullanıyor. Sözleşmede Yayıncı 6.3 ve Ajans 6.2. |

## Kalan açık kararlar (metinlerde `[KARAR: …]`)

- Bayilik: azami perakende fiyat uygulanacak mı; hacim primi olacak mı (oran, ödeme şekli); fesihte kalan stoğun satış süresi ve iade kesintisi; bölge bayisi seviyesi eklenecek mi (sistem bugün 2 seviye).
- Yayıncı: GVK 20/B istisnası (mali müşavir); KVKK md. 9 yurt dışı aktarım işlemleri (avukat).
- Tüm metinler: tacir taraflar için yetkili mahkeme şehri.

---

## Üç metinde ortak düzeltmeler

| Eksik / sorun (1.0) | 1.1'de |
|---|---|
| "Haksız kazancın geri alınması" yalnızca bir cümleydi (usul, süre, sıra yok) | Ayrı madde: gerekçeli bildirim → 15 gün itiraz → 30 günde karar → önce ödenmemiş bakiyeden, sonra sonraki kazançlardan mahsup → kalan için iade; 180 günlük tespit süresi (kasıt/dolandırıcılık hariç) |
| Dolandırıcılıktan doğan zarar için sorumluluk hükmü yoktu | Yasak işlemler listesi + kusur oranında tazmin |
| Politika değişikliği tek taraflı ve bildirimsizdi | 15 gün önceden bildirim, ileriye dönük uygulama, kabul etmeyene derhâl fesih hakkı |
| Fesih vardı ama hesabın ve bakiyelerin akıbeti yoktu | "Sona ermenin sonuçları" ve veri saklama/silme hükmü |
| Yetkili mahkeme belirsizdi | Tacir olan ajans/bayi ile: zorunlu arabuluculuk (TTK 5/A) + seçilmiş mahkeme (HMK 17) + elektronik kayıtların delil sayılması (HMK 193). Yayıncıda (genellikle tacir değil) yetki seçimi yapılamaz; kanuni yetki + iş ilişkisi doğarsa iş mahkemesi |
| Gizlilik süresi yoktu | Sözleşme süresince ve sonrasında 2 yıl |
| Mücbir sebep, sorumluluğun sınırı, devir yasağı yoktu | Eklendi (TBK 115 saklı) |
| Tanımlar yoktu | Coin, Diamond, Fasulye, Avans, Dönem, Politikalar tanımlandı |
| "Fikri haklar ilgili hak sahiplerine aittir" (sahip belirsiz) | TR LIVE'e ait; tersine mühendislik ve değiştirilmiş uygulama yasağı |
| KVKK yalnızca genel atıf | Yurt dışı aktarım (md. 9) uyarısı; ajans ve bayi için **veri işleyen** hükmü ve Veri İşleme Eki |
| Yürürlük "güvenli e-imza"ya bağlıydı | "İmza Usulü" ekine bağlandı (aşağıdaki karara göre doldurulacak) |

## Sözleşmeye özel düzeltmeler

**Yayıncı:** 18 yaş şartı; KYC + doğrulanmış telefon ödeme şartı (sistemde zaten var); **kendine hediye kuralı** (sistemdeki gerçek
davranışla çelişmesin diye açık karar); **avans ve avans fazlasının mahsubu** (sistem ay içi avans ödüyor); Fasulye; iade/ters ibraz için
en çok 60 günlük bekleme; ajansın yayıncının kazancına dokunamayacağı; izleyiciden platform dışı para isteme yasağı.

**Ajans:** asistan işlemlerinden ajans sahibinin sorumluluğu; ajanslık/kayıt bedeli alma yasağı; yayıncı devri; referans ajansın
kendisinin prim doğurmaması; iş ilişkisi riskinin ajans sahibinde kalması.

**Coin bayilik:** en çok değişen metin.
- **Saadet zinciri koruması (6502 s. Kanun md. 81):** giriş ücreti ve stok zorunluluğu yasak, bayi kazandırmak komisyon doğurmaz, komisyon yalnızca gerçek satıştan, zincir toplamına üst sınır, kendine satış yasağı.
- **Komisyon tabanı** "Net Tahsilat" (mağaza payı ve KDV sonrası).
- **Kullanıcı eşleştirme kuralları** (referans kodu, süre, tek bayi).
- **Bekleme süresi:** iade/ters ibraz için.
- **Bayi panelinde asgari kişisel veri.**
- **Geçiş hükmü:** bkz. karar 2.

## Açık kararlar

1. **Sözleşmenin tarafı hangi şirket?** Uygulamadaki gizlilik metni "TR Live LLC (ABD)" diyor. Vergi kesintisi, KVKK temsilcisi ve uygulanacak hukuk buna bağlı.
2. **Mevcut bayilik modeli ne olacak?** Bugün bayiler Coin stoğu tutup kullanıcıya yüklüyor ve parayı platform dışında alıyor. Yeni sözleşme bunu yasaklıyor (Google Play kuralı ve 6493 s. Kanun gereği). Seçenekler: (a) eski model belirli bir tarihte kapanır, stoklar iade/dönüştürülür; (b) eski model yalnızca Play dışı APK'da ayrı sözleşmeyle sürer.
3. **Bayi seviye sayısı** (sistem bugün 2 kat destekliyor), eşleştirme süresi (önerilen 7 gün / 12 ay), bekleme süresi (önerilen 45 gün), zincir toplam üst sınırı.
4. **Kendine hediye** sözleşmede açıkça kabul mü edilecek, yoksa sistemde mi kapatılacak?
5. **İmza usulü** (aşağıda).

## İmza usulü: seçenekler

| | A) Herkese güvenli e-imza (5070) | B) Uygulama içi onay + SMS kodu | C) Karma (önerilen) |
|---|---|---|---|
| Nasıl | Kişi kendi nitelikli sertifikasıyla (e-imza kartı veya mobil imza) imzalar; imza sağlayıcısı API'si | Metin uygulamada gösterilir, sonuna kadar kaydırılır, kutu işaretlenir, telefona gelen tek kullanımlık kodla onaylanır; metnin özeti, sürüm, zaman, IP, cihaz, telefon kaydedilir; PDF üretilir ve zaman damgası eklenir | Yayıncı, referans ortağı ve alt bayi → B. Ajans sahibi, ana ve bölge bayi → A |
| Hukuki güç | En güçlü: elle atılan imzayla eşdeğer, senet niteliğinde | Bu sözleşmeler için kanunda yazılı şekil şartı olmadığı değerlendirildiğinden geçerli kurulur; ispat gücü A'dan zayıftır (elektronik kayıt, delil başlangıcı) — **avukatınıza teyit ettirin** | Para miktarı büyük ve tacir olan taraflarda en güçlü ispat; kalabalık yayıncı tarafında sürtünmesiz kayıt |
| Kullanıcı için | Kişinin e-imzası olmalı: e-imza kartı (yıllık ücretli, kart okuyucu) ya da kendi adına kayıtlı Türk hattında mobil imza (ücretli, operatörden açılır). Yabancı uyruklu ve çoğu yayıncıda yoktur | 1 dakika, ücretsiz, her telefonda | Yalnızca az sayıdaki ajans/bayi için ek adım |
| Maliyet | İmza başına sağlayıcı ücreti + entegrasyon | SMS ücreti (Firebase kodu zaten var); zaman damgası küçük bir ücret | İkisinin toplamı, ama A az kişide |
| Risk | **Yayıncı kaydını fiilen durdurur:** e-imzası olmayan yayıncı sözleşme imzalayamaz, maaş alamaz | Uyuşmazlıkta ispat yükü TR LIVE'de | — |
| Bende geliştirilebilir mi | Kısmen: sağlayıcı seçimi ve sözleşmesi sizde; entegrasyonu ben yaparım | Tamamen (aşağıdaki sistem) | Tamamen; A kısmı sağlayıcı seçilince |

**Önerim: C.** Ekran görüntüsündeki "herkese güvenli e-imza" önerisi hukuken en güçlü yol, ama yayıncıların çoğunda nitelikli e-imza
yoktur ve bu, kayıt sürecini durdurur. Güçlü ispatın asıl gerektiği yer büyük tutarların döndüğü ajans ve bayi tarafıdır.

## B usulünün sistemde kurulumu (karar sonrası)

- **Sözleşme şablonları:** tür, sürüm, metin, SHA-256 özeti; yayımlanan sürüm değiştirilemez, değişiklik yeni sürüm demektir.
- **İmza kayıtları:** kullanıcı, şablon sürümü, metin özeti, onay zamanı, IP, cihaz, doğrulanmış telefon, SMS doğrulama kimliği, üretilen PDF'in özeti; kayıtlar yalnızca eklenir, silinmez.
- **PDF:** imza bilgileri ve metin özetiyle sunucuda üretilir, değişmez depoya yazılır, kullanıcı ve yönetim panelinden indirilebilir; isteğe bağlı nitelikli zaman damgası.
- **Kapılar:** güncel yayıncı sözleşmesi imzalanmadan yayıncı başvurusu onaylanmaz ve maaş/avans yatmaz; ajans ve bayi panelleri imza olmadan açılmaz; yeni sürümde yeniden imza istenir, eski sürümle doğmuş haklar korunur.
- **Yönetim paneli:** kim hangi sürümü ne zaman imzaladı, imzalamayanlar listesi, PDF indirme.
