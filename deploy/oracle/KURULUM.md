# Oracle Cloud'a taşıma (telefonla, komut yazmadan)

Kurulan: PostgreSQL, uygulama sunucusu, LiveKit (ses/görüntü, dakika sınırı yok), HTTPS (Caddy), yönetim paneli,
günlük yedek ve otomatik güncelleme (GitHub'a zip yükleyince sunucu 5 dakika içinde kendini günceller).
GitHub deposu herkese açık (public) kalmalı; sunucu kodu oradan indirir.

## 1. Sunucuyu aç
1. cloud.oracle.com → hesap aç (kart doğrulaması ister; Always Free ücretsizdir). Bölge: Frankfurt (ya da yakın bir Avrupa bölgesi).
2. Compute → Instances → **Create instance**
   - Image: varsayılan **Oracle Linux 9** ya da **Canonical Ubuntu 24.04** (ikisi de olur)
   - Shape: **Ampere – VM.Standard.A1.Flex**, 2 OCPU, 12 GB bellek
   - SSH keys: "Generate a key pair for me" → özel anahtarı indir ve sakla (normalde gerekmez).
   - En altta **Show advanced options → Management → Paste cloud-init script**: `deploy/oracle/cloud-init.sh`
     dosyasının tamamını yapıştır, içindeki şifreyi kendi şifrenle değiştir (en az 10 karakter, harf ve rakam).
   - **Create**. "Out of capacity" hatası alırsan birkaç saat sonra tekrar dene.
3. Sunucunun **Public IP address** değerini not al (ör. 130.61.12.34).

## 2. Portları aç (hemen, sunucu açılırken)
Instance sayfası → Primary VNIC → **Subnet** → Security Lists → Default Security List → **Add Ingress Rules**.
Her biri için Source CIDR `0.0.0.0/0`:
- IP Protocol **TCP**, Destination Port **80**
- IP Protocol **TCP**, Destination Port **443**
- IP Protocol **TCP**, Destination Port **7881**
- IP Protocol **UDP**, Destination Port **7882**

## 3. Paneli aç
15-20 dakika sonra tarayıcıda: `https://130-61-12-34.sslip.io/panel` (IP'deki noktalar tire olur).
Kullanıcı adı herhangi bir şey, şifre cloud-init'e yazdığın şifre. "Uygulama sunucusu: ✅ çalışıyor" görmelisin.
- Sayfa "güvenli değil" derse ya da açılmazsa: portlar geç açıldıysa güvenlik sertifikası 1 saate kadar gecikebilir.
- Şifre kabul edilmezse: Instance → **Console connection / Console history** bölümünde "TR LIVE PANEL SIFRESI"
  satırında otomatik üretilen şifre yazar (cloud-init şifresi uygun değilse üretilir).

## 4. Verileri taşı
Panel → **Eski veritabanını aktar** → Render'daki `DATABASE_URL` değerini (dışarıdan erişilebilen "External" adres)
yapıştır → AKTAR yaz → Verileri aktar. Bittiğinde "BAŞARILI: sayılar eşit" yazar. Kullanıcıların az olduğu bir
saatte yapın; aktarma sırasında uygulama birkaç dakika kapalı olur. (Odaya yüklenen müzik dosyaları taşınmaz.)
Panel → **Ayarlar**: Render'da olan `ADMIN_USERNAMES`, `GOOGLE_*`, `FACEBOOK_*` vb. değerleri buraya da girin.

## 5. Uygulamayı yeni sunucuya bağla
1. GitHub → depo → Settings → Secrets and variables → Actions → **Variables** → New repository variable:
   `API_URL` = `https://130-61-12-34.sslip.io`
2. Actions → "Build Android APK" → Run workflow (adres kutusunu boş bırak) → yeni APK'yı dağıt.
3. Eski uygulamalar için: **eski** sunucuda (Render) Yönetim → Uygulama ayarları → En düşük sürüm = yeni sürüm,
   indirme bağlantısı = yeni APK. Böylece eski uygulamalar "Güncelleme gerekli" der.
4. Her şey yolundaysa birkaç gün sonra Render'ı durdurabilirsin.

## 6. TURN: kısıtlı Wi-Fi ve operatör ağlarında ses (varsayılan açık)
**Neden:** Bazı okul, iş, otel Wi-Fi'ları ve bazı operatör ağları ses/görüntünün kullandığı UDP kapısını (7882) keser. O kişiler odaya girer ama ses gelmez.
TURN, sesi şifreli ek bir yoldan geçirir. **Panelde ayarı yok; sertifika alınabiliyorsa kendiliğinden devreye girer.**

Sizin yapacağınız tek şey: Oracle konsolunda 2. bölümdeki gibi (Source CIDR `0.0.0.0/0`) iki kural daha ekleyin:
- IP Protocol **TCP**, Destination Port **5349**
- IP Protocol **UDP**, Destination Port **3478**

- **Alan adı:** sslip.io ya da kendi alan adınız fark etmez. `turn.<ip-tireli>.sslip.io` adı kullanılır; ek DNS kaydı gerekmez. Sertifikayı Caddy kendisi alır
  (ilk güncellemede 90 saniyeye kadar beklenir; alınamazsa 6 saat sonra yeniden denenir, kurulum yavaşlamaz).
- **Güvence:** TURN'lü ayarla ses sunucusu açılmazsa otomatik olarak TURN'süz ayara dönülür (günlükte "UYARI" satırı) ve bir daha denenmez. Yeniden denemek için sunucuda
  `/opt/trlive/state/turn-failed` dosyasını silin.
- **Sertifika yenileme:** yaklaşık 60 günde bir; sonraki güncellemede ses sunucusu yeni sertifikayı alır.
- **Sınır:** TURN 5349 kapısında çalışır. Yalnızca 443'e izin veren ağlarda çözmez (443'ü Caddy kullanıyor).
- **Kapatmak** isterseniz sunucuda `/opt/trlive/env/extra.env` dosyasına `TURN_ENABLED=0` satırı ekleyin.

## 7. Yedekler: yerel ve (önerilen) uzak kopya
Yedek yalnızca sunucuda durursa sunucu kaybolunca (disk arızası, hesap kapanması) veri de kaybolur. Bu yüzden her gece alınan yedeğin bir kopyasını **başka bir yere** koyun.

- **Yerel yedek:** her gece `/opt/trlive/backups` altına, son 7 gün. Yedek alınamazsa ya da dosya bozuk/şüpheli küçükse hata verilir ve eski yedekler SİLİNMEZ.
- **Uzak kopya (isteğe bağlı):** S3 uyumlu bir depolama (Backblaze B2: ilk 10 GB ücretsiz, Cloudflare R2, Oracle Object Storage, AWS S3). Özel (herkese açık olmayan) bir kova açın;
  yalnızca o kovaya yazma ve silme yetkisi olan bir anahtar üretin. Panelde (`/panel`) **tek alanı** doldurup Kaydet'e basın, boşlukla ayırarak:
  `uç-nokta kova anahtar-kimliği gizli-anahtar [bölge]`
  Örnek: `https://s3.us-west-004.backblazeb2.com kovam 004abc... K004xyz... us-west-004`
  Kaydet'e basınca sunucu gerekli aracı (rclone) kendisi kurar. Uzak kopya ertesi gece yerel yedekle birlikte alınır ve orada 30 gün saklanır.
- **Başarısız olursa:** yerel yedek yine alınır; uzak kopya yüklenemediyse gece yedek işi "failed" görünür ve günlükte "HATA: uzak kopya yüklenemedi" yazar (bilgileri kontrol edin).
- **Geri yükleme (yeni, boş bir veritabanına):** yedek dosyasını sunucuya alıp
  `gunzip -c trlive-2026-11-30.sql.gz | docker exec -i trlive-postgres-1 psql -U trlive trlive`
  Çalışan bir veritabanının üzerine yüklemeden önce mutlaka güncel bir yedek alın.

## 8. Medya depolama (R2): veritabanı şişmesin
Avatar, hediye animasyonu, müzik gibi dosyalar önce veritabanına yazılır, arka plan işi onları Cloudflare R2'ye taşır. R2'yi yönetim panelinde bir kez yapılandırın
(hesap kimliği, kova, anahtarlar, herkese açık adres); gerisi otomatiktir:
- Taşınan dosya doğrulanır (R2'den geri okunur, boyut karşılaştırılır) ve `/media/…` adresi CDN'e yönlendirilir; sunucu ve veritabanı dosyayı artık okumaz.
- Taşımadan **7 gün sonra** veritabanındaki kopya silinir (her dosyada yeniden doğrulanır: R2'de şimdi var ve boyutu aynı olmalı). Böylece veritabanı ve yedekleri büyümez.
  Silinen alan yeniden kullanılır; dosya boyutunun küçülmesi için ayrıca `VACUUM FULL` gerekir (kesinti ister, şart değil).
- Dosya silinince (hesap silme, avatar değişimi, medya yedeği temizleme) R2'deki nesne de silinir: silme kuyruğu her 10 dakikada bir çalışır. R2 o an erişilemezse anahtar kuyrukta bekler.
- **Önemli:** kopya silindikten sonra medyanın tek kaynağı R2'dir; gece alınan veritabanı yedeği medyayı içermez. R2 kovasını düzenli olarak başka bir yere kopyalayın
  (örn. `rclone sync r2:kovam yedek:kovam`).
- R2 yapılandırılmazsa her şey eskisi gibi çalışır (dosyalar veritabanında kalır); medya 500 MB'ı aşınca günlükte `media_db_growth` uyarısı çıkar.

## 9. Web panel giriş bağlantıları (yönetim / ajans / bayi)

Her panelin kurulumda üretilen kendine özel, tahmin edilemez bir giriş bağlantısı vardır (`https://ALAN/<gizli kod>`).
Bağlantılar **sunucu panelinde** (`https://ALAN/panel`, şifreli) "Panel giriş bağlantıları" bölümündedir.

- **Yönetim paneli:** yalnızca siz. Yardımcı adminlere tek tek siz iletin.
- **Ajans paneli:** ajans sahipleri ve asistanları (yönetim panelinde Ajanslar sayfasında da kopyalanır).
- **Bayi paneli:** bayiler (yönetim panelinde Bayiler sayfasında da kopyalanır).

Bağlantı bir tarayıcıda bir kez açılınca o tarayıcı 1 yıl hatırlar. Bağlantı olmadan `/yonetim/admin`, `/yonetim/agency`,
`/yonetim/dealer` ve eski panel seçim sayfası **"bulunamadı" (404)** döner. Uygulama içi sayfalar (`/yonetim/m/...`) etkilenmez.
Bağlantı sızarsa: sunucu panelinde **YENILE** yazıp "Tüm bağlantıları yenile". Eski bağlantılar ve tarayıcılardaki eski izinler
geçersiz olur; şifreler ve oturumlar değişmez. Gizli bağlantı ek bir katmandır: asıl koruma hesap şifresi, iki adımlı doğrulama
ve sunucudaki yetki denetimidir.

## Notlar
- Google/Facebook girişinde yönlendirme adresleri yeni adresle (`https://…sslip.io/api/auth/oauth/google/callback`
  ve `…/facebook/callback`) güncellenmelidir. Google, sslip.io adreslerini yayın modunda kabul etmeyebilir; o
  durumda ucuz bir alan adı alınır (A kaydı ve `lk.` alt alanı sunucu IP'sini göstermeli) ve panelde "Alan adı"
  alanına yazılır. sslip.io adresi her zaman çalışmaya devam eder.
- Yedekler her gece sunucuda `/opt/trlive/backups` altında (son 7 gün); isteğe bağlı uzak kopya için 7. bölüm.
