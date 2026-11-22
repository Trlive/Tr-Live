# Sıradaki işler

Sahibinin 21 Kasım'da verdiği sıra. **Önce 11 ekran bitecek**, sonra aşağıdakiler.

## 0. Devam eden — SDUI v2 ile 11 ekran

Pilot (Yardım) bitti. Kalan: etkinlik listesi · etkinlik detayı · gelen kutusu ·
kampanya · ilişkiler · aile · ajans · bayi · ayarlar · başvuru formu · profil bölümleri.
Mimari kurallar: `docs/SDUI_LAYOUT_GUIDE.md`.

## 0.1 — 22 Kasım'da eklenenler (sıra: bunlar önce)

### A. Duyurular + Bayi

- **Bayi: Ana bayi / Alt bayi — BİTTİ (v2.149.0).** `dealer_accounts.parent_dealer_id`,
  en fazla iki kat, ana bayiden alt bayiye Coin aktarımı (Coin yaratmaz, iki tarafın
  defterine de yazar), bayi merkezinde "Alt Bayilerim", panelde ana bayi atama.
- **Duyurular: SDUI'ye TAŞINMADI — bilerek.** Duyuru akışı türüne göre üç ayrı elle
  çizilmiş kart (ekip baloncuğu, etkinlik kartı, ödül kartı), içinde `EventResultsCard`
  kürsüsü, sohbet gibi en alta kaydırma ve canlı rozet sayacı var. SDUI'nin `repeater` +
  `listItem` kalıbı bunların hiçbirini ifade edemiyor; zorlamak ekranı kötüleştirirdi.
  İçerik zaten dinamik: duyurular panelden girilip anında uygulamada görünüyor.
  Yapılabilecek gerçek iyileştirme ileride: **kanal listesinin sunucudan gelmesi**
  (şu an team/event/reward Dart'ta sabit; yeni kanal için uygulama sürümü gerekiyor).

### B. Ajans / Yayıncı bölümü

1. **Ham tarayıcı uyarısı — BİTTİ (v2.149.0).** Yayıncı Merkezi'nde "Ajanstan ayrıl" deyince Android'in
   kendi `confirm()` kutusu çıkıyor ve **sunucu adresini gösteriyor**
   (`"https://130-61-222-48.sslip.io" adresindeki sayfada şunlar belirtiliyor:`).
   Kullanıcıya altyapı adresi gösterilmemeli; uygulama içi kutu olacak.
2. **"Ajanstan ayrılma talebi oluştur" — BİTTİ (v2.149.0).** Doğrudan ayrılma yok;
   talep açılacak, ajans onaylayacak.

### C. Doğrulanmış hesap — BİTTİ (v2.149.0)
- Oda içindeki "Doğrulanmış" rozeti kaldırıldı (`badgeRow`, yalnızca oda ekranından çağrılıyor).
- `verified` artık **telefon bağlı** demek (eskiden kimlik onayı `kyc_status='approved'` idi).
- `kyc_status` KALDIRILMADI: para çekme / maaş ödemesi kapısı olarak duruyor. Uygulama
  kimlik fotoğrafı zaten istemiyordu (`/api/me/kyc/request` yalnızca incelemeye alıyor).

### D. Maaş sistemi — MOTOR KURULDU (v2.150.0), ÖDEMEYE ESAS DEĞİL

**Sahibinin netleştirdiği sistem (22 Kasım):** "Talep oluşturmaya gerek olmayacak. Kotasını
yapınca maaşı Fasulye olarak yatacak, ay sonu 1 Fasulye = 1 dolar dolara dönecek, kimlik
istemeyeceğiz. Fasulyenin hepsi yatmayacak: gün ve yayın saati eksikse yaptığı kotanın
yarısı yatacak, tüm koşullar sağlanınca hepsi. Tamamlanan ayı izleyen ay başı 1–3 arası
dolar hesaplarına otomatik aktarılacak." Ayrıca: "Gelirdeki elmas bozdurulabilir. Yayıncı
gelirini bozduysa ve gün/saat koşulu eksikse maaşın %50–60'ı yatar."

**Yapıldı:**
- `salary_weights.rules.js` — saf motor: hak ediş = sözleşme kademesinin maaşı ×
  Σ(koşul ağırlığı × gerçekleşme oranı). Tam sayı matematiği, tek bölme, aşağı yuvarlama.
  25 birim testi; aritmetik bağımsız olarak da doğrulandı.
- Temel maaş `broadcasters.contract_tier`'dan geliyor. Bu sütun VARDI ama maaş hesabında
  hiç kullanılmıyordu (ölü veri). Tasarımın "base_salary_beans"i tam olarak bu.
- Gerekli gün / saat / elmas, 44 kademeli tablonun kendisinden geliyor; her dönem
  özetine DONDURULARAK yazılıyor, kademe tablosu sonra değişse bile geçmiş özet okunabilir.
- **EŞİKLİ (v2.150.1 düzeltmesi).** Koşul ya tutar ya tutmaz; kısmi kredi yok. 22 gün
  isteniyorsa 21 gün eksiktir, 80 saat isteniyorsa 79 sa 59 dk eksiktir. Gün ve saat TEK
  koşul ("devam"), ağırlığı 5000 → biri eksikse tam olarak maaşın yarısı.
  v2.150.0'da oranlı kurmuştum, sahibi düzeltti; ödeme açılmadığı için kimseye yanlış
  ödeme yapılmadı.
- Ay başı otomatik aktarım: `salary_transfer.service.js`, saatte bir bakar, pencere
  içindeyse aktarır. **Bir kere** güvencesi üç kat: tekil anahtarlı `salary_transfer_runs`
  satırı (aynı transaction içinde), `status='pending'` koşulu, danışma kilidi.
- Ödeme kapısı **telefon doğrulaması** (kimlik fotoğrafı değil). Koşul tek yerde
  (`SALARY_PAYABLE_SQL`): iki sorguda ayrı yazılıydı, ayrışırsa özet "ödendi" olup para
  yatmayabilirdi. Telefonu doğrulanmamış yayıncının maaşı beklemede kalır, kaybolmaz.
- Yöntem 2 (elmas bakiyesini maaşa çevirme) ağırlıklı hesapla **birlikte çalışmıyor**:
  ikisi birlikte olsaydı yayıncının elması düşülüp karşılığı verilmemiş olurdu.
- Panel: ağırlık düzenleyici, girilen ağırlıkla "gün ve saat eksikse %kaç kalır"
  canlı önizlemesi, iki bayrak, aktarım penceresi, aktarım kayıtları.
- Yayıncı ekranı: hak ediş yüzdesi ve koşul kırılımı ("hangi koşul ne kaybettirdi").

**Henüz yapılmadı / bilinçli olarak dışarıda:**
- **İki bayrak da KAPALI.** Ağırlıklı hesap her dönem kapanışında yanında hesaplanıp
  özete yazılıyor ama maaşı hâlâ eski kademe hesabı ödüyor. Sahibi bir dönem kapatıp iki
  sayıyı gerçek veri üzerinde karşılaştırdıktan sonra açacak.
- **Sözleşme kademesi atanmamış yayıncıda** ağırlıklı hesap yapılmıyor (uydurma temel maaş
  üretmek yerine). Panelde kademe atama ucu var (`/api/admin/broadcasters/:id/contract`)
  ama üst sınırı 10; tablo 44 kademeli. **Düzeltilecek.**
- **Fasulye / USD ayrı defter YAPILMADI** — sahibinin kararı: "kalsın, tasarımın o
  maddesini uygulama". Bugünkü davranış sürüyor: Fasulye ile dolar aynı bakiye, Coin'e
  çevrilip başkasına gönderilebiliyor.
- Ödeme sağlayıcısı (Airwallex / Stripe Connect) seçilmedi; geri kalan doğrulamayı
  aracı şirket belirleyecek.
- Ajans sahibinin yayıncı maaşına müdahale edememesi: mevcut yetkiler denetlenmedi.
- Geçmiş ayın kesinleşmiş maaşını yöneticinin sessizce değiştiremediğinin doğrulanması.

## 1. Ludo ve hız — BİTTİ (v2.151.0)

- **Zar sonucu görünmüyordu.** Zarın köşesine, sonraki atışa kadar duran okunaklı bir sayı
  rozeti eklendi. Tek hamle varken otomatik oynama 900 ms'den 1250 ms'ye çekildi: zar
  oturmadan taş oynanıyor ve göz tahtaya kaçtığı için sonuç okunamıyordu.
- **Zar büyütüldü ve iyileştirildi** (56 → 68 px, daha derin küp).
- **6 OYNATMIYOR, BİRİKİYOR.** Sahibinin kuralı: "bir 6 attı, hemen oynatma, 2. zar hakkını
  da çevirt; 3 geldi → bir 6 bir 3 oynama hakkı. 6+6+5 → iki altı bir 5."
  Değerler TOPLANMIYOR, tek tek oynanıyor (toplasaydık 6+6+3=15 ile üsten taş çıkarmak
  imkânsız olurdu, oyun kilitlenirdi). Üst üste üç 6'da biriken her şey düşer, sıra geçer.
  Biriken zarlar kontrol çubuğunda şerit olarak görünüyor, oynanan üstü çizili.
- **Hız:** Ludo taş yürüyüşü 150 → 90 ms/kare, zıplama 150 → 110 ms, zar oturması
  0,80 → 0,60 s. Tek: kart uçuşu 380 → 260 ms, dağıtım gecikmesi 55 → 36 ms/kart,
  sıra beklemesi 1100 → 750 ms.
- **Yeni güvenlik ağı:** `webview_pages.mjs` artık sayfaların içindeki satır içi
  JavaScript'i de derleyip denetliyor. ludo.html ve tek.html'de 760-900 satır script var
  ve hiçbir araç onlara bakmıyordu; oradaki bir sözdizimi hatası sunucuyu etkilemiyor,
  oyun sessizce boş açılıyordu.

## 2. Oyun hızı

TEK ve Ludo daha hızlı olacak (tur/animasyon süreleri).

## Hediye sistemi — ÖLÇÜLDÜ ve DÜZELTİLDİ (v2.152.0)

Sahibi: "hediyelerin transparan özelligi çok kötü, bazıları ne olduğu belli olmayacak
kadar sıkıntılı, onları da sen yaptın."

**Önce ölçtüm, sonra düzelttim.** Yumuşak ışımalı ve parçacıklı bir test hediyesi üretip
(512 px, %63'ü yarı saydam) mevcut işleme hattından geçirdim:

- **Kodlayıcı alfa'yı bozmuyordu.** 512→256 küçültmede alfa ortalama hatası 0,24/255.
  Yani "ne olduğu belli olmuyor" un sebebi webp kodlaması DEĞİLDİ. İlk hipotezim buydu
  ve ölçüm onu çürüttü.
- **Asıl sebep: SVGA matte (maske) katmanları.** `svga_lite.dart` oynatıcısı `matteKey`
  alanını hiç okumuyordu (protobuf alan 3 atlanıyordu) ve maske katmanlarını atlıyordu:
  maskelenmesi gereken katman MASKESİZ çiziliyordu, yani hediyede gizlenmesi gereken
  parçalar olduğu gibi görünüyordu. Maske artık uygulanıyor (`saveLayer` + `BlendMode.dstIn`,
  aynı maskeyi paylaşan ardışık katmanlar tek grup olarak).
- **Sunucu maskeleri bozmuyor** — kanıtlandı: SVGA yeniden yazıcısı sprite'ları ham bayt
  olarak geçiriyor. 4 testle kilitlendi (`svga_matte.test.js`).
- **Alfa-güvenli ölçekleme webp'te YOKTU** (PNG'de vardı). Düz alfa ile lanczos küçültmek
  saydam kenara koyu halka bırakıyordu. Ölçüm: yarı saydam bölgede RGB hatası 4,63 → 3,06
  (%34 iyileşme), dosya %19 büyüyor.
- **Kalite merdiveni alfa'da zararlıydı.** Kaliteyi 82'den 52'ye indirmek dosyayı yalnızca
  %9 küçültüyor (dosyanın çoğu alfa kanalı) ama bozulmayı %13 artırıyor. Alfa taşıyan
  biçimlerde merdiven artık kaliteyi değil BOYUTU düşürüyor.
- **Animasyon hatasında ekran BOŞ kalıyordu** (`SizedBox.shrink()`): kullanıcı hediyeyi
  gönderiyor, coin'i gidiyor, hiçbir şey görmüyordu. Artık hediyenin simgesi yedek
  olarak gösteriliyor.
- **Hareketli WebP:** ffmpeg'in webp çözücüsü ANMF parçalarını okumuyor. Sınırlar içindeki
  dosyalar dokunulmadan geçiyor (sorun yok); sınırı aşanlar otomatik küçültülemiyor ve
  artık ne yapılacağını söyleyen bir hata veriyor.

### Hediye konusunda kalanlar
- Hareketli WebP'nin sunucuda küçültülebilmesi için `libwebp-tools` (anim_dump / img2webp)
  gerekiyor; Alpine imajına eklenip ayrı bir yol yazılmalı. Bugün elle küçültmek yeterli.
- SVGA'da hâlâ desteklenmeyenler: vektör şekiller, kırpma yolu (clip path), gömülü ses.
- Varlık güvenliği (uzantıya göre tür belirleme yok, MIME doğrulama, zararlı yazılım
  taraması, ZIP bomba koruması — `inflateSync` sınırı 768 MB, çok yüksek, düşürülmeli,
  çıkarmada yol aşımı, imza doğrulama, özel dosyalar için süreli bağlantı).
- Çok sayıda animasyonun aynı anda oynaması ve efekt çakışma yönetimi ölçülmedi;
  düşük RAM'li cihaz testi yapılmadı.

## 4. Asset güvenliği (aynı belgeden)

Dosya türü yalnızca uzantıdan belirlenmemeli · MIME doğrulaması · zararlı dosya taraması ·
ZIP bombası koruması · arşiv açarken klasör dışına taşma engeli · paket indirmede imza
doğrulaması · yüklenen dosyalar güvenli alanda · özel dosyalar için süreli erişim bağlantısı.
