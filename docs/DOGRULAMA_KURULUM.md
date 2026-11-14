# SMS ve e-posta doğrulaması: kurulum (v2.100.0)

Kod tarafı hazır. Aşağıdaki ayarlar **APK yayınlamadan**, uygulamadaki **Yönetim > Uygulama ayarları** ekranından girilir.
Ayarlar girilmeden önce uygulama eskisi gibi çalışır (telefonla kayıt kodsuz).

## 1. Firebase (SMS kodu)

1. https://console.firebase.google.com → **Proje ekle** (ör. `trlive`).
2. Projeyi **Blaze (kullandıkça öde)** planına geçirin: Eylül 2024'ten beri SMS doğrulaması faturalandırma hesabı ister.
   Günde ilk 10 SMS ücretsizdir, sonrası ülkeye göre SMS başına ücretlidir. İsterseniz Google Cloud'da bütçe uyarısı kurun.
3. **Authentication > Sign-in method > Phone** → Etkinleştir.
   (İsteğe bağlı) **Settings > SMS region policy**: yalnızca hizmet verdiğiniz ülkelere izin verin (kötüye kullanımı azaltır).
4. **Proje ayarları (⚙) > Genel > Uygulamalarınız > Android** → uygulama ekle:
   - Paket adı: `com.trlive.tr_live`
   - SHA-1: `EF:6D:53:60:70:39:94:5A:82:EF:71:F4:FE:D9:4A:CD:16:8B:7F:38`
   - Uygulama eklendikten sonra **SHA sertifika parmak izi ekle** ile SHA-256'yı da ekleyin:
     `25:98:74:44:CB:93:2D:A8:89:A5:07:C7:C2:F5:23:A5:E2:FE:49:43:0C:86:5B:50:75:BE:15:F6:8A:10:B6:89`
   - `google-services.json` dosyasını indirmeniz **gerekmez**.
5. Aynı sayfadan şu 4 değeri **Yönetim > Uygulama ayarları > Telefon doğrulaması** alanlarına yazın ve kaydedin:
   - Proje kimliği (Project ID), ör. `trlive-12345`
   - Web API anahtarı (Web API Key, `AIza…`)
   - Android uygulama kimliği (App ID, `1:…:android:…`)
   - Proje numarası (Project number)

> Play Store'a yüklediğinizde Google uygulamayı kendi "uygulama imzalama anahtarı" ile yeniden imzalar.
> O zaman Play Console > Uygulama bütünlüğü sayfasındaki SHA-1 / SHA-256'yı da Firebase'e eklemeniz gerekir.

## 2. E-posta gönderimi (6 haneli kod)

Ücretsiz bir SMTP hesabı yeterli. Örnekler:

| Servis | Sunucu | Port | Doğrudan SSL |
|---|---|---|---|
| Brevo (günde 300 ücretsiz) | `smtp-relay.brevo.com` | 587 | Kapalı |
| Gmail (uygulama şifresi gerekir) | `smtp.gmail.com` | 465 | Açık |

**Yönetim > Uygulama ayarları > E-posta gönderimi** bölümüne sunucu, port, kullanıcı adı, şifre/anahtar ve gönderen
(ör. `TR Live <no-reply@alanadiniz.com>`) yazın, kaydedin, **Deneme e-postası gönder** ile kontrol edin.

## 3. Kalıcı imzalama anahtarı

`mobile/imza/upload.jks` + `mobile/imza/imza.properties` bu sürümle geldi. APK derlemesinin sonunda APK bu anahtarla
yeniden imzalanır. **Bu iki dosyayı güvenli bir yere yedekleyin:** kaybolursa Play Store'daki uygulama güncellenemez.
Bu sürümden önce kurulan APK'lar her derlemede farklı geçici anahtarla imzalanıyordu; telefondaki eski sürümü bir kez
kaldırıp yeni APK'yı kurmak gerekir. Sonraki sürümler üstüne kurulur.

> `.github/imzali/` klasöründeki eski (v2.79) imza taslakları **artık kullanılmamalı**: ayrı bir anahtar üretirler ve
> Firebase'e kaydedilen parmak izi tutmaz. Kalıcı anahtar yalnızca `mobile/imza` içindekidir.

## Uygulamada neler değişti

- Telefonla kayıt: Firebase ayarlıysa numara SMS koduyla doğrulanır (Android kodu çoğu zaman kendisi okur).
- Ayarlar > Hesap & Güvenlik: telefonu bağla / doğrula, e-posta ekle / doğrula.
- Giriş ekranı > **Şifremi unuttum**: SMS ya da e-posta koduyla yeni şifre (tüm cihazlardan çıkış yapılır).
