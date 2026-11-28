# Rakiplerle karşılaştırma ve yol haritası

> **Gözden geçirme notu (v2.152.19):** satırlar kodla karşılaştırılarak güncellendi (giriş yöntemleri, şifre sıfırlama, günlük ödül/görevler, Elmas/Fasulye çekimi, yasal sayfalar, kendine hediye kuralı, ölçek). "Giriş efekti" satırı doğrulanmadı. Güncel eksik listesi: kod denetimi raporu ve CHANGES.md.

**Kaynak notu.** Yoho için uygulama mağazası sayfalarında yer alan özellik açıklamalarına baktım (oda içi yazılı sohbet,
özel sohbet, konu etiketleri, oda gizliliği, oyunlar, karaoke/müzik, ülkeye özel hediyeler, SVIP, onur madalyaları,
liderlik tabloları, kullanıcı içeriği moderasyonu). **Zula Live için resmi bir kaynak bulamadım**; bu yüzden onun adına
iddiada bulunmuyorum. Zula/Bigo gibi sesli oda uygulamalarında yaygın olan özellikler (PK, SVGA animasyonlu hediyeler,
ajans maaş/hedef portalı, oyun merkezi, VIP, web yönetim paneli) için sektör şablonlarını ölçüt aldım.
Bu uygulamaların iç mimarisini bilmiyorum; aşağıdaki karşılaştırma **özellik düzeyindedir**.

| Özellik | TR Live | Not |
|---|---|---|
| Sesli oda + mikrofon koltukları | ✅ | LiveKit |
| Görüntülü oda | ✅ | LiveKit |
| Oda içi yazılı sohbet | ✅ | susturma, silme, kapatma, flood/yasaklı kelime filtresi |
| Özel mesaj | ✅ | sesli mesaj yok |
| Müzik çalar | ✅ | senkron çalma, lisanslı kütüphane. Karaoke (söz/skor) yok |
| Hediyeler, Coin/Diamond, global şerit | ✅ | animasyon: Lottie, SVGA, şeffaf MP4 (VAP), GIF/WebP, PNG |
| Kendine hediye | ✅ | sesli odada maaşa/kotaya sayılır (sahibin kararı), görüntülü odada gönderilemez; liderlik dışı. Para döngüsüne karşı kur koruması var (`salaryLoopError`) |
| Liderlik tabloları | ✅ | günlük/haftalık/aylık/tümü; gönderen, alan, aile |
| Aile | ✅ | seviye, rol, puan. Aile görevleri/savaşları yok |
| WIP (10 kademe + SWIP hayalet) | ✅ | Yoho VIP ayrıcalıkları sıkıştırıldı |
| Şanslı hediye | ✅ | x2–x500, oran panelden |
| Ajans / yayıncı | ✅ | kod, panel, hedefli maaş kademeleri, kademeli komisyon, dönem kapatma. **Ödeme platform dışında; KYC manuel; oranlar örnek** |
| Profil (takip, ziyaretçi, çerçeve, kapak) | ✅ | |
| Oda etiketleri, şifreli oda | ✅ | |
| Şikâyet, engelleme, gizlilik | ✅ | manuel inceleme ve moderasyon kuyruğu; otomatik görsel/ses moderasyonu yok |
| Uygulama içi güvenlik duvarı | ✅ | WAF-lite; DDoS için Cloudflare gerekir |
| Giriş efekti | 🟡 | Lottie; SVGA yok |
| Uygulama içi satın alma (Play/App Store) | ❌ | **Coin satışının ana yolu; makbuz doğrulama gerekir** |
| Telefon/Google/Facebook girişi, şifre sıfırlama, e-posta doğrulama | ✅ | SMS doğrulaması Firebase ile (isteğe bağlı) |
| Apple ile giriş | ❌ | **iOS'ta Google/Facebook girişi varken App Store kuralı 4.8 gereği zorunlu** |
| Push bildirim (FCM/APNs) | ❌ | bildirimler yalnızca uygulama açıkken / açılınca (soket + yoklama) |
| PK savaşları | ✅ | iki oda, süreli, skor + destekçi listesi |
| Oyunlar (Ludo, kart, şans çarkı…) | 🟡 | Ludo, TEK kart oyunu ve panelden yüklenen oyun paketleri var. Coin'i etkinlik kazancı/kaybı olarak hareket ettirebilen altyapı da var (harici sağlayıcı API'si, oyun paketi cüzdanı); hukuki/mağaza riski için bkz. kod denetimi K-06; Okey/Uno yok |
| Görevler, günlük ödül, onur madalyaları | ✅ | günlük giriş ödülü, günlük görevler, rozetler. Bedava Coin bütçesi (`coin_budgets`) sınırlı |
| Maaş / Fasulye (dolar) çekimi, KYC | 🟡 | dolar cüzdanı, çekim talebi, ay içi avans var; ödeme platform dışında, KYC manuel; vergi için hukuki danışmanlık gerekir |
| Yaş doğrulama / 18+ politikası, gizlilik politikası, KVKK | 🟡 | sözleşme, gizlilik, KVKK, çocuk güvenliği sayfaları var; 18+ yalnızca beyan |
| Web yönetim paneli | ✅ | `web/panel` (Next.js, `/yonetim`); mobil içi panel de duruyor |
| Çok dil, ülke/dil keşfi | 🟡 | arayüz Türkçe + İngilizce, Arapça, Hintçe çevirisi (`mobile/lib/l10n`); ülke/dil keşfi yok |
| Ölçek: Redis, çoklu sunucu, LiveKit cluster, CDN, izleme | 🟡 | tek sunucu; medya için isteğe bağlı R2/CDN, TURN, uzak yedek, yönetim panelinde izleme. Redis/çoklu sunucu yok |

## Gerçekçi konum
Çekirdek döngü ve yönetim/güvenlik temeli var: **çalışan bir MVP**. Bigo/Yoho/Zula'nın asıl farkı; ölçek (milyonlarca
eşzamanlı kullanıcı), gelir altyapısı (IAP, ödeme, ajans maaşları), oyunlaştırma (PK, oyunlar, görevler), içerik
moderasyonu otomasyonu ve yüzlerce kişilik ekip emeğidir. Bu kod tabanıyla **kapalı beta (yüzlerce kullanıcı)**
yapılabilir; "o seviyede" olmak için aşağıdaki yol haritası aylar sürer.

## Önerilen sıra
1. Gerçek cihazda ses/müzik/kamera testi; GitHub Actions'ın çalıştığından emin olun (Kasım 2026'da işler başlamıyordu).
2. Apple ile giriş; yaş kapısının beyan dışında doğrulanması.
3. Google Play Billing / StoreKit + sunucu tarafı makbuz doğrulama (Coin satışı).
4. FCM/APNs push; sesli mesaj.
5. Karaoke. (PK savaşları ve SVGA/MP4 hediye animasyonu artık var.)
6. Otomatik moderasyon (görsel/ses); Redis ve çoklu sunucu. (Web yönetim paneli artık var.)
7. Ajans maaş/hedef sistemi + Diamond çekimi (hukuki/vergi danışmanlığıyla).
