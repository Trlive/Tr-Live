# iPhone (iOS) sürümü

Uygulama aynı Flutter koduyla iPhone'da da çalışır. `ios/` klasörü depoda tutulmaz: GitHub Actions'ta
`flutter create` ile üretilir ve `mobile/native/ios/setup_ios.py` ile ayarlanır (Android'deki gibi).

## Test sürümü (Apple Developer hesabı olmadan)

1. GitHub → **Eylemler** → **iPhone (iOS) Test Derlemesi** → **Run workflow** (dal: main).
   * Yalnızca elle başlar. Gizli depoda Mac makinesi dakikayı **10 kat** sayar: bir derleme ~15–25 dk sürer,
     aylık ücretsiz kotadan ~150–250 dk düşer.
2. Bitince **Releases → Son iPhone - test** → `TR-Live.ipa` dosyasını bilgisayara indir.
3. Bilgisayara **Sideloadly** kur (Windows / Mac, ücretsiz; Windows'ta iTunes'un Apple sitesinden indirilen sürümü de gerekir).
4. iPhone'u kabloyla bağla, telefonda "Bu bilgisayara güven" de.
5. Sideloadly'de IPA'yı sürükle, kendi Apple kimliğini yaz, **Start**.
6. iPhone'da: **Ayarlar → Genel → VPN ve Aygıt Yönetimi** → Apple kimliğine **Güven**.
   iOS 16 ve üstünde ayrıca **Ayarlar → Gizlilik ve Güvenlik → Geliştirici Modu** açılmalı (telefon yeniden başlar).
7. Ücretsiz Apple kimliğiyle kurulum **7 gün** geçerlidir; sonra 5. adımı tekrarla (veriler silinmez).

## iPhone'a özel davranışlar

| Konu | Android | iPhone |
|---|---|---|
| Odadayken arka planda kalma | Bildirimli ön plan servisi | Arka plan ses izni (UIBackgroundModes: audio); servis/bildirim yok |
| Bildirim izni | Android 13+ penceresi | Odaya ilk girişte iOS izin penceresi |
| Telefondaki müzikleri otomatik tarama | Var | Yok; şarkılar **Dosyalar** uygulamasından seçilir |
| Kulaklık algılama, arama gelince sesi kesme, ekranı açık tutma, güzellik filtresi | Yerel kodla | iOS kendi yönetir / şimdilik kapalı |
| Bayi paneli, Coin yükleme sıralaması | Görünür | **Gizli** (App Store kuralı: uygulama dışı Coin satışı yok) |
| Güncelleme ekranındaki APK bağlantısı | Görünür | Gizli |

Paket kimliği: `com.trlive.trlive` · En düşük iOS: 14.0 · Yalnızca dikey ekran.

## App Store / TestFlight için (Apple Developer hesabı açılınca)

* **Apple Developer Program** (yıllık 99 $) → App Store Connect'te `com.trlive.trlive` kimliğiyle uygulama oluştur.
* İmzalı derleme için gereken sertifika / profil / App Store Connect API anahtarı **GitHub Secrets**'a eklenir
  (sohbete yapıştırılmaz); iş akışına imza ve TestFlight yükleme adımı eklenir.
* **Apple ile Giriş** zorunlu (Google / Facebook girişi olduğu için, kural 4.8): sunucu tarafı doğrulamayla eklenecek.
* **Coin**: iPhone'da satış yalnızca Apple uygulama içi satın alma ile olabilir (kural 3.1.1). Şu an iPhone'da satış ve
  bayi gizli; istenirse Apple ödemesi eklenir.
* **Şanslı hediye / şanslı çanta**: kazanma oranları satın almadan önce uygulamada gösterilmeli (kural 3.1.1).
* Hesap silme uygulama içinde var (kural 5.1.1(v)) ✓ · Kullanıcı engelleme ve şikâyet var (kural 1.2) ✓.
