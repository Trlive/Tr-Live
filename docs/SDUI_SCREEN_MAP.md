# 11 ekranın gerçek karşılıkları

Plandaki ekran adları koddaki dosyalarla birebir örtüşmüyor. Varsayımla düzen yazmak,
hiç açılmayacak ekranlar üretmek demekti; bu yüzden önce eşleştirildi.

| Plandaki ad | Koddaki gerçek yer | Durum | Karar |
|---|---|---|---|
| Yardım / SSS | `support_screens.dart` → `CustomerServiceScreen` | ✅ bağlandı (v2.148.0) | SDUI |
| Etkinlik listesi | **Ayrı ekran değil** — etkinlikler zaten sunucudan geliyor (`/api/activities`), kart olarak çiziliyor ve WebView'de açılıyor | zaten dinamik | `repeater` ile kart listesi |
| Etkinlik detayı | WebView (etkinliğin kendi sayfası) | zaten dinamik | SDUI'ye gerek yok |
| **`event_screen.dart`** | Mevsimsel etkinlik SANATI (tema görseli, hafta tarihleri, kral/kraliçe) | 869 satır, görsel ağırlıklı | **SDUI'ye UYGUN DEĞİL** — tasarımın kendisi ekran |
| Duyuru / gelen kutusu | `inbox_screens.dart` → `OfficialChannelScreen` | 990 satır, 10 durumlu sınıf, kaydırma konumu + rozet sıfırlama | **kısmi**: duyuru listesi SDUI, sohbet akışı yerel |
| İlişkiler | `relations_screens.dart` → `RelationListScreen` | 917 satır, 16 durumlu sınıf | **kısmi**: liste SDUI, yakınlık/istek akışları yerel |
| Aile merkezi | `family_screen.dart` | 1490 satır, 24 durumlu sınıf | **kısmi**: tanıtım/kurallar SDUI, üyelik işlemleri yerel |
| Ajans merkezi | `income_screens.dart` | 424 satır | **uygun**: bilgi ve rapor görünümü |
| Bayi merkezi | `dealer_center_screen.dart` | 1006 satır | **kısmi**: katalog SDUI, satın alma yerel |
| Ayarlar | `settings_screens.dart` | 656 satır | **kısmi**: bilgi/yönlendirme satırları SDUI, anahtarlar yerel |
| Başvuru formu | ajans/bayi içinde, ayrı ekran değil | — | `form` bileşeniyle SDUI |
| Profil bölümleri | `profile_screen.dart` | 398 satır | **uygun**: bilgi kartları |

## Çıkarılan ders

Plan "12 ekranı SDUI'ye taşı" diyordu. Gerçekte:

- **İkisi zaten dinamik** (etkinlik listesi ve detayı sunucudan geliyor) — yapılacak iş yok.
- **Biri hiç uygun değil** (`event_screen`): orada tasarımın kendisi üründür; sunucudan
  gelen bir ağaçla çizilemez, çizilse de kötüleşir.
- **Altısı kısmi**: ekranın bilgi/liste kısmı SDUI'ye gider, işlem akışı (üyelik, ödeme,
  istek kabul) yerel kalır. Mimari ilke zaten bunu söylüyor.

Yani hedef "11 ekranı taşımak" değil, **her ekranın SDUI'ye giden kısmını taşımak**.
Ekranı tümden taşımaya çalışmak, bugün çalışan akışları bozmak olurdu.

## Sıra

1. Veri gelen listeler (`repeater` ile): ilişkiler · duyurular · bayi kataloğu
2. Bilgi ekranları: ajans merkezi · profil bölümleri
3. Form: ajans/bayi başvurusu
4. Kısmi: aile tanıtımı · ayarlar bilgi satırları
