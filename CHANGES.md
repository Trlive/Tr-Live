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
