# API uçları

> Otomatik üretildi: `node backend/scripts/gen_docs.mjs`. Elle düzenlemeyin.

Kimlik: **🔒** giriş gerekli · **👑** yalnızca yönetici · **🛠** yönetici + yardımcı admin (destek) · **⏱** hız sınırı adı

**Toplam 369 uç.**

## system.js  (`/api`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/app/config` | açık |  | Uygulama açılışında okunur: zorunlu/isteğe bağlı güncelleme bilgisi. Giriş gerektirmez. |
| GET | `/api/push/latest` | açık | push_poll | Herkese açık duyuru olduğu için giriş gerektirmez. [after]: telefonda gösterilen son bildirimin numarası. |
| POST | `/api/client-errors` | (isteğe bağlı) | client_errors | Giriş ekranındaki hatalar da gönderilebilsin diye oturum zorunlu değildir; IP başına sınırlıdır. |
| GET | `/api/legal/privacy` | açık |  | (tek kaynak). Eski adresler bozulmasın diye bu adresler siteye yönlendirir. |
| GET | `/api/legal/data-deletion` | açık |  |  |
| GET | `/api/legal/terms` | açık |  |  |

## auth_social.js  (`/api/auth`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/auth/providers` | açık |  |  |
| POST | `/api/auth/oauth/start` | açık | oauth_start |  |
| GET | `/api/auth/oauth/:provider/callback` | açık | oauth_cb |  |
| POST | `/api/auth/oauth/poll` | açık | oauth_poll | Uygulama sonucu birkaç saniyede bir sorar. Tamamlandıysa oturum bir kez verilir ve istek silinir. |

## me.js  (`/api/me`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/me` | 🔒 |  |  |
| PATCH | `/api/me` | 🔒 |  |  |
| GET | `/api/me/notifications/pending` | 🔒 |  | Uygulama kapalıyken gelenler: telefon açılınca son gösterilen numaradan sonrakiler alınır (en fazla 20). |
| GET | `/api/me/notifications` | 🔒 |  | Mesajlar → Bildirimler: son 7 günün bildirimleri, en yeni en üstte (sayfalı). |
| GET | `/api/me/notifications/unread` | 🔒 |  | Okunmamış bildirim sayısı (Mesajlar'daki rozet). |
| POST | `/api/me/notifications/seen` | 🔒 |  |  |
| GET | `/api/me/notify-prefs` | 🔒 |  |  |
| PUT | `/api/me/notify-prefs` | 🔒 |  |  |
| PUT | `/api/me/avatar` | 🔒 | avatar_upload |  |
| PUT | `/api/me/cover` | 🔒 | cover_upload |  |
| POST | `/api/me/password` | 🔒 | password |  |
| DELETE | `/api/me` | 🔒 | acct_delete | Mağaza kuralları gereği uygulama içinden hesap silme. |
| GET | `/api/me/sessions` | 🔒 |  | ---- Cihaz oturumları ("Oturumlarım") ---- |
| DELETE | `/api/me/sessions/:id` | 🔒 | session_revoke |  |
| POST | `/api/me/sessions/revoke-others` | 🔒 | session_revoke | geçersiz olur. Bu cihaz yeni bir erişim token'ı alır. |
| POST | `/api/me/accept-terms` | 🔒 |  | Kullanıcı Sözleşmesi ve Gizlilik Politikası onayı (kayıtta ve metinler güncellenince). Sürüm ve zaman saklanır. |
| POST | `/api/me/kyc/request` | 🔒 |  |  |
| POST | `/api/me/diamonds/exchange` | 🔒 | diamond_exchange |  |
| GET | `/api/me/wallet` | 🔒 |  |  |
| GET | `/api/me/earnings/summary` | 🔒 |  |  |
| GET | `/api/me/earnings/history` | 🔒 |  | Canlı yayın geçmişi (video/sesli): mikrofonda geçirilen oturumlar ve o oturumda alınan elmas. |
| GET | `/api/me/levels` | 🔒 |  | Seviye Merkezi: kullanıcı seviyesi (gönderilen coin) ve yayıncı seviyesi (alınan elmas), 300 kademe. |
| GET | `/api/me/badges` | 🔒 |  | Kırmızı rozetler (yeni ziyaretçi, yeni takipçi, bekleyen arkadaş isteği). |
| POST | `/api/me/seen` | 🔒 |  | Liste açılınca rozet sıfırlanır. |
| GET | `/api/me/visitors` | 🔒 |  | Profil ziyaretçileri: son 7 gün, en son ziyaret eden en üstte. Liste WIP kademesine bağlı (viewVisitors). |

## users.js  (`/api/users`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/users/search` | 🔒 | user_search | Gizli kullanıcılar aramada çıkmaz. |
| GET | `/api/users/:userId/card` | 🔒 |  | Oda içi profil kartı: "Yakın Arkadaşlarım" (bu kişiye en çok hediye gönderen 5 kişi) ve "Madalyalar" (rozetler). |
| GET | `/api/users/:userId` | 🔒 |  |  |
| POST | `/api/users/:userId/follow` | 🔒 | follow |  |
| DELETE | `/api/users/:userId/follow` | 🔒 |  |  |
| GET | `/api/users/:userId/followers` | 🔒 |  |  |
| GET | `/api/users/:userId/following` | 🔒 |  |  |

## inventory.js  (`/api/inventory`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/inventory` | 🔒 |  |  |
| POST | `/api/inventory/equip` | 🔒 |  |  |
| POST | `/api/inventory/unequip` | 🔒 |  |  |
| GET | `/api/inventory/catalog/frames` | 🔒 |  |  |
| GET | `/api/inventory/catalog/entrance-effects` | 🔒 |  |  |

## rooms.js  (`/api/rooms`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/rooms` | (isteğe bağlı) |  | ---------- Liste ve ayrıntı ---------- |
| GET | `/api/rooms/mine` | 🔒 |  | Kayıtlı odalarım ve şu an açık olanlar. |
| POST | `/api/rooms` | 🔒 | room_create | setup gönderilmeyen eski istekler kayıtlı bilgilere dokunmaz (gövdedeki ad yok sayılır). |
| GET | `/api/rooms/:roomId/managers` | 🔒 |  | Oda yöneticileri (oda kapalıyken de kalıcı). Oda sahibi ilk sırada. |
| GET | `/api/rooms/favorites` | 🔒 |  |  |
| GET | `/api/rooms/recent` | 🔒 |  |  |
| POST | `/api/rooms/hosts/:userId/favorite` | 🔒 | favorite |  |
| DELETE | `/api/rooms/hosts/:userId/favorite` | 🔒 |  |  |
| GET | `/api/rooms/hosts/:userId/favorite` | 🔒 |  |  |
| GET | `/api/rooms/:roomId` | 🔒 |  |  |
| POST | `/api/rooms/by-code` | 🔒 | room_code | Gizli odaya davet koduyla ulaşılır. Kaba kuvvet denemelerine karşı sıkı sınır vardır. |
| POST | `/api/rooms/:roomId/join` | 🔒 | room_join |  |
| PATCH | `/api/rooms/:roomId` | 🔒 | room_settings | Oda ayarları: ad, etiketler, şifre, sohbet açık/kapalı (oda sahibi ve yardımcı sahip). |
| PUT | `/api/rooms/:roomId/cover` | 🔒 | room_cover | Oda kapak fotoğrafı (oda sahibi / yardımcı sahip). |
| DELETE | `/api/rooms/:roomId/staff/:userId` | 🔒 | moderate | Yönetici silme: odada olmasa da kalıcı yönetici listesinden çıkarır (yalnızca oda sahibi). |
| GET | `/api/rooms/:roomId/contributions` | 🔒 |  | (oda kapanıp açılınca liste sıfırlanmaz). |
| POST | `/api/rooms/:roomId/leave` | 🔒 |  |  |
| POST | `/api/rooms/:roomId/close` | 🔒 |  |  |
| GET | `/api/rooms/:roomId/members` | 🔒 |  |  |
| POST | `/api/rooms/:roomId/heartbeat` | 🔒 | heartbeat | Uygulamadan düzenli gelen "oda açık" sinyali: üyeyi canlı tutar ve oda arada kapanmışsa istemciye hemen 404 döner. |
| POST | `/api/rooms/:roomId/mic/take` | 🔒 | mic | ---------- Mikrofon / koltuk ---------- |
| POST | `/api/rooms/:roomId/mic-emoji` | 🔒 | mic_emoji | Mikrofon emojisi: koltuktaki kişi 3 hareketli emojiden birini gönderir, koltuğunda birkaç saniye oynar. |
| GET | `/api/rooms/:roomId/mic/queue` | 🔒 |  | ---------- Mikrofon sırası ---------- |
| POST | `/api/rooms/:roomId/mic/queue` | 🔒 | mic_queue |  |
| DELETE | `/api/rooms/:roomId/mic/queue` | 🔒 |  |  |
| DELETE | `/api/rooms/:roomId/mic/queue/:userId` | 🔒 |  | Yetkili: mikrofon isteğini reddeder (kullanıcıyı sıradan çıkarır). |
| POST | `/api/rooms/:roomId/mic/leave` | 🔒 |  |  |
| POST | `/api/rooms/:roomId/members/:userId/mic-off` | 🔒 | moderate |  |
| POST | `/api/rooms/:roomId/members/:userId/kick` | 🔒 | moderate |  |
| POST | `/api/rooms/:roomId/members/:userId/block` | 🔒 | moderate |  |
| DELETE | `/api/rooms/:roomId/blocks/:userId` | 🔒 |  |  |
| POST | `/api/rooms/:roomId/seats/:index/lock` | 🔒 | moderate | Koltuk kilitle / aç (oda sahibi ve moderatörler). Dolu koltuk kilitlenirse oturan kişi koltuktan indirilir (yetki yeterliyse). |
| POST | `/api/rooms/:roomId/seats/:index/mute` | 🔒 | moderate | mikrofon açılmaz (uygulama kapatır) ve koltukta "susturuldu" işareti görünür. Boş koltuk da susturulabilir. |
| POST | `/api/rooms/:roomId/members/:userId/mic-invite` | 🔒 | mic_invite | Mikrofona davet: davet edilen kişi kabul ederse mic/take ile oturur. |
| POST | `/api/rooms/:roomId/members/:userId/role` | 🔒 | moderate |  |
| GET | `/api/rooms/:roomId/scoreboard` | 🔒 |  | ---------- Hediye sayı tahtası (mikrofon koltuğu başına) ---------- |
| POST | `/api/rooms/:roomId/scoreboard/reset` | 🔒 | scoreboard_reset |  |
| POST | `/api/rooms/:roomId/livekit-token` | 🔒 |  | ---------- LiveKit ---------- |

## chat.js  (`/api/rooms`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| POST | `/api/rooms/:roomId/messages` | 🔒 | chat10s, chat1m |  |
| GET | `/api/rooms/:roomId/messages` | 🔒 |  |  |
| DELETE | `/api/rooms/:roomId/messages` | 🔒 | chat_clear | Sohbeti temizle: yalnızca oda sahibi, yardımcı sahip ve moderatör. |
| DELETE | `/api/rooms/:roomId/messages/:messageId` | 🔒 |  |  |
| POST | `/api/rooms/:roomId/members/:userId/chat-mute` | 🔒 | moderate | Sohbette susturma: 0 = susturmayı kaldır, en fazla 24 saat. |

## messages.js  (`/api/messages`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/messages/unread-count` | 🔒 |  |  |
| GET | `/api/messages/alerts` | 🔒 |  |  |
| GET | `/api/messages/conversations` | 🔒 |  |  |
| GET | `/api/messages/with/:userId` | 🔒 |  | Konuşma geçmişi (en yeni 50, eskiden yeniye). Karşı tarafın mesajları okundu işaretlenir. |
| DELETE | `/api/messages/with/:userId` | 🔒 |  | Konuşmayı sil: yalnızca benim tarafımda; o ana kadarki mesajlar bana görünmez (karşı taraf görmeye devam eder). |
| PUT | `/api/messages/image` | 🔒 | dm_image | Sohbete fotoğraf: önce yüklenir, dönen adres mesajla gönderilir. |
| POST | `/api/messages/with/:userId` | 🔒 | dm10s, dm1h |  |

## friends.js  (`/api/friends`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/friends` | 🔒 |  | Arkadaş listesi |
| GET | `/api/friends/requests` | 🔒 |  | Bana gelen bekleyen istekler |
| POST | `/api/friends/request/:userId` | 🔒 | friendreq | Arkadaşlık isteği gönder (karşı taraf zaten istek göndermişse otomatik kabul olur) |
| POST | `/api/friends/accept/:userId` | 🔒 |  |  |
| POST | `/api/friends/decline/:userId` | 🔒 |  |  |
| DELETE | `/api/friends/:userId` | 🔒 |  | Arkadaşlıktan çıkar veya gönderdiğim bekleyen isteği geri çek |

## cp.js  (`/api/cp`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/cp/requests` | 🔒 |  | Bana gelen bekleyen ilişki davetleri |
| GET | `/api/cp/with/:userId` | 🔒 |  | Bir kişiyle yakınlık durumu |
| POST | `/api/cp/with/:userId/request` | 🔒 | cpreq | İlişki daveti (Coin ile). Karşı taraf aynı türde davet göndermişse doğrudan kabul edilir (bu durumda Coin alınmaz). |
| POST | `/api/cp/with/:userId/accept` | 🔒 |  |  |
| POST | `/api/cp/with/:userId/decline` | 🔒 |  | Gelen daveti reddet ya da gönderdiğim daveti geri çek: Coin gönderene iade edilir. |
| POST | `/api/cp/with/:userId/end` | 🔒 |  | İlişkiyi bitir (yakınlık puanı korunur) |
| GET | `/api/cp/wall/:userId` | 🔒 |  |  |
| GET | `/api/cp/wall/:userId/:kind` | 🔒 |  |  |

## guardian.js  (`/api/guardians`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/guardians/of/:userId` | 🔒 |  | Bir kişinin koruyucuları (sıralama) ve benim durumum |
| POST | `/api/guardians/of/:userId/join` | 🔒 | guardjoin | Koruyucu ol (Coin ile) |
| POST | `/api/guardians/of/:userId/leave` | 🔒 |  | Koruyuculuğumu bitir |
| POST | `/api/guardians/remove/:guardianId` | 🔒 |  | Profil sahibi bir koruyucusunu çıkarır |
| GET | `/api/guardians/mine` | 🔒 |  | Koruyuculuğum: koruyucularım ve koruduklarım |
| POST | `/api/guardians/show/:guardianId` | 🔒 |  | Profilde gösterilecek koruyucuyu seç (profil sahibi) |
| PUT | `/api/guardians/settings` | 🔒 |  | Koruyucu açık / kapalı |

## store.js  (`/api/store`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/store/coin-packages` | 🔒 |  | Yükleme Merkezi paketleri |
| GET | `/api/store/items` | 🔒 |  |  |
| POST | `/api/store/buy` | 🔒 | store_buy | Satın al (kendin için) veya "Gönder" (başka bir kullanıcıya hediye). Süre: ürünün gün sayısı; aynı ürün tekrar alınırsa süre uzar. |

## support.js  (`/api/support`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/support/messages` | 🔒 |  | Kendi müşteri hizmetleri yazışmam (son 200). Okunmamış destek yanıtları okundu olur. |
| GET | `/api/support/unread` | 🔒 |  |  |
| POST | `/api/support/messages` | 🔒 | support10s, support1h |  |

## leaderboards.js  (`/api/leaderboards`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/leaderboards` | 🔒 |  | Kendine gönderilen hediyeler sıralamaya dahil edilmez (kendi kendine puan basmayı önlemek için). |

## families.js  (`/api/families`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/families/rules` | 🔒 |  | Kurallar ve seviye tablosu (Aile kuralları / seviye sayfaları) |
| GET | `/api/families` | 🔒 |  |  |
| GET | `/api/families/mine` | 🔒 |  |  |
| GET | `/api/families/:familyId` | 🔒 |  |  |
| POST | `/api/families` | 🔒 | family_create |  |
| PATCH | `/api/families/:familyId` | 🔒 |  | Bilgileri Düzenle: aile adı (en fazla 12) ve aile bildirimi (en fazla 100) |
| PUT | `/api/families/:familyId/logo` | 🔒 |  | Kapak resmi (aile logosu) yükleme: ham bayt (png, jpeg, webp), en fazla 3 MB |
| PUT | `/api/families/:familyId/settings` | 🔒 |  | İstek Ayarları: başvuranın en düşük zenginlik (gönderme) seviyesi |
| POST | `/api/families/:familyId/join` | 🔒 | family_join | Aileye katıl: başvuru (yönetici onaylar). Seviye şartı ve kontenjan kontrol edilir. |
| POST | `/api/families/:familyId/join/cancel` | 🔒 |  | Başvuruyu geri çek |
| GET | `/api/families/:familyId/requests` | 🔒 |  | İstekler (yönetici) |
| POST | `/api/families/:familyId/requests/:userId/:action` | 🔒 |  |  |
| POST | `/api/families/:familyId/leave` | 🔒 |  |  |
| GET | `/api/families/:familyId/members` | 🔒 |  | Aile üyeleri: rol ve bu haftaki katkı |
| POST | `/api/families/:familyId/members/:userId/kick` | 🔒 |  |  |
| POST | `/api/families/:familyId/members/:userId/role` | 🔒 |  |  |
| POST | `/api/families/:familyId/transfer` | 🔒 |  |  |
| DELETE | `/api/families/:familyId` | 🔒 |  |  |
| GET | `/api/families/:familyId/rewards` | 🔒 |  | ---------- Coins ödülü (haftalık katkı) ve başkan indirimi ---------- |
| POST | `/api/families/:familyId/rewards/:tier/claim` | 🔒 |  | Haftalık ödülü al (aile başkanı; Coin başkana geçer) |
| POST | `/api/families/:familyId/cashback/claim` | 🔒 |  | Başkan indirimini al (kişisel harcama en az 10K olmalı) |
| GET | `/api/families/:familyId/chat` | 🔒 |  |  |
| POST | `/api/families/:familyId/chat` | 🔒 | family_chat |  |
| GET | `/api/families/:familyId/chat/unread` | 🔒 |  | Okunmamış aile mesajı sayısı (Mesajlar'daki rozet) ve okundu işareti. |
| POST | `/api/families/:familyId/chat/seen` | 🔒 |  |  |
| POST | `/api/families/:familyId/notice` | 🔒 | family_notice | Sahibin açık bir odası varsa bildirime eklenir: dokunan üye odaya girer. |

## wip.js  (`/api/wip`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/wip/tiers` | 🔒 |  | Kademeler ve satın alınabilir paketler. |
| GET | `/api/wip` | 🔒 |  |  |
| POST | `/api/wip/purchase` | 🔒 | wip_buy | düşük seviye aktifken satın alınamaz. |

## dealers.js  (`/api/dealer`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/dealer/me` | 🔒 |  |  |
| POST | `/api/dealer/sell` | 🔒 | dealer_sell | Bayi kendi bakiyesinden kullanıcıya Coin satar. Alıcı kullanıcı adı veya kimlik ile bulunur. |

## admin.js  (`/api/admin`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/admin/me/permissions` | 🛠 |  |  |
| GET | `/api/admin/users` | 🛠 |  | ---------------- Kullanıcı arama ve durum ---------------- |
| POST | `/api/admin/users/:userId/ban` | 🛠 |  | Süreli veya süresiz ban. hours yoksa/0 ise süresiz. |
| POST | `/api/admin/users/:userId/delete` | 👑 |  | Kişinin kendi silmesiyle aynı işlem yapılır; gerekçe kayıt altına alınır. |
| POST | `/api/admin/users/:userId/unban` | 🛠 |  |  |
| POST | `/api/admin/users/:userId/display-name` | 🛠 |  | Kullanıcının görünen adını (nick) değiştirir. Yasaklı kelime denetimi uygulanmaz (yetkili işlemi) ama uzunluk denetlenir. |
| POST | `/api/admin/users/:userId/avatar` | 🛠 |  | Profil fotoğrafını kaldırır (avatarUrl boş) veya https adresiyle değiştirir. |
| POST | `/api/admin/users/:userId/staff-role` | 👑 |  | Yardımcı admin atama/alma: yalnızca yönetici, admin panelinden. |
| GET | `/api/admin/staff` | 👑 |  |  |
| POST | `/api/admin/users/:userId/coins` | 🛠 |  | Yönetici: sınırsız ekler / düşer. Yardımcı admin: yalnızca normal kullanıcıya, tek seferde en fazla 100.000 Coin yükler (düşemez). |
| POST | `/api/admin/users/:userId/level` | 🛠 |  | Yönetici: 1-300 arası her seviye (düşürebilir de). Yardımcı admin: yalnızca normal kullanıcıya, en fazla 100. seviye ve yalnızca yükseltir. |
| POST | `/api/admin/users/:userId/wip` | 🛠 |  | ---------------- WIP ---------------- |
| DELETE | `/api/admin/users/:userId/wip` | 🛠 |  |  |
| PATCH | `/api/admin/wip/tiers/:level` | 👑 |  |  |
| POST | `/api/admin/wip/plans` | 👑 |  |  |
| POST | `/api/admin/users/:userId/inventory` | 🛠 |  | ---------------- Envanter ---------------- |
| GET | `/api/admin/support/threads` | 🛠 |  | ---------------- Müşteri hizmetleri (admin + yardımcı admin) ---------------- |
| GET | `/api/admin/support/:userId` | 🛠 |  |  |
| POST | `/api/admin/support/:userId/reply` | 🛠 |  |  |
| GET | `/api/admin/coin-packages` | 👑 |  | ---------------- Coin paketleri (yönetici) ---------------- |
| POST | `/api/admin/coin-packages` | 👑 |  |  |
| POST | `/api/admin/coin-packages/:id/active` | 👑 |  |  |
| GET | `/api/admin/grantables` | 🛠 |  | Yönetici "öğe ver" listesi: kategoriye göre tüm katalog öğeleri. |
| POST | `/api/admin/users/:userId/grant` | 🛠 |  | Seçilen katalog öğesini kullanıcıya ver. days boş/0 = süresiz. |
| POST | `/api/admin/store/samples` | 👑 |  |  |
| POST | `/api/admin/asset-pack` | 👑 |  |  |
| GET | `/api/admin/server/status` | 👑 |  |  |
| POST | `/api/admin/server/git-token` | 👑 |  | Anahtar yalnızca sunucuya yazılır; geri okunamaz (dosya yalnız yazılabilir). Boş gönderilirse silinir. |
| POST | `/api/admin/server/update` | 👑 |  |  |
| GET | `/api/admin/asset-pack/status` | 👑 |  |  |
| POST | `/api/admin/media` | 👑 |  |  |
| POST | `/api/admin/gifts/fill-icons` | 👑 |  |  |
| POST | `/api/admin/gifts` | 👑 |  |  |
| POST | `/api/admin/frames` | 👑 |  |  |
| POST | `/api/admin/entrance-effects` | 👑 |  |  |
| GET | `/api/admin/store/items` | 👑 |  |  |
| POST | `/api/admin/store/items` | 👑 |  |  |
| POST | `/api/admin/store/items/:id/active` | 👑 |  |  |
| DELETE | `/api/admin/gifts/:id` | 👑 |  |  |
| DELETE | `/api/admin/store/items/:id` | 👑 |  |  |
| DELETE | `/api/admin/frames/:id` | 👑 |  |  |
| GET | `/api/admin/catalog` | 👑 |  |  |
| POST | `/api/admin/catalog/:kind/:id/active` | 👑 |  |  |
| POST | `/api/admin/gifts/:id/edit` | 👑 |  |  |
| POST | `/api/admin/frames/:id/edit` | 👑 |  |  |
| POST | `/api/admin/store/items/:id/edit` | 👑 |  |  |
| GET | `/api/admin/dealers` | 👑 |  | ---------------- Bayi (yalnızca yönetici) ---------------- |
| POST | `/api/admin/dealers` | 👑 |  |  |
| POST | `/api/admin/dealers/:dealerId/coins` | 👑 |  |  |
| POST | `/api/admin/dealers/:dealerId/sell` | 👑 |  |  |
| GET | `/api/admin/agencies` | 🛠 |  | ---------------- Ajans ve yayıncı ---------------- |
| POST | `/api/admin/agencies` | 👑 |  | Yönetici bir kullanıcıyı (ID / kullanıcı adı ile seçilir) ajans sahibi yapar; ajans doğrudan aktif açılır. |
| POST | `/api/admin/agencies/:agencyId/referrer` | 👑 |  | Davet eden ajans (Davet Merkezi primi) sonradan ayarlanır / kaldırılır. |
| POST | `/api/admin/agencies/:agencyId/status` | 👑 |  | Komisyon para etkisi taşıdığı için yalnızca yönetici. |
| GET | `/api/admin/broadcasters` | 🛠 |  |  |
| POST | `/api/admin/broadcasters/:userId/status` | 🛠 |  |  |
| GET | `/api/admin/agency-config` | 🛠 |  | ---------------- Ajans ayarları ve maaş tablosu ---------------- |
| PUT | `/api/admin/agency-config` | 👑 |  |  |
| PUT | `/api/admin/pay-levels` | 👑 |  |  |
| POST | `/api/admin/pay-levels/reset` | 👑 |  |  |
| POST | `/api/admin/agencies/:agencyId/commission-override` | 👑 |  |  |
| POST | `/api/admin/broadcasters/:userId/contract` | 👑 |  |  |
| GET | `/api/admin/agency-transfers` | 🛠 |  | ---------------- Transferler (platform incelemesi) ---------------- |
| POST | `/api/admin/agency-transfers/:id/decide` | 👑 |  |  |
| GET | `/api/admin/agency-applications` | 🛠 |  | ---------------- Ajans başvuruları (Davet Merkezi önerileri) ---------------- |
| POST | `/api/admin/agency-applications/:id/decide` | 👑 |  |  |
| GET | `/api/admin/users/:userId/marks` | 🛠 |  | ---------------- Özel ID ve yayıncı rozeti ---------------- |
| POST | `/api/admin/users/:userId/special-id` | 👑 |  |  |
| DELETE | `/api/admin/users/:userId/special-id` | 👑 |  |  |
| POST | `/api/admin/users/:userId/host-badge` | 👑 |  |  |
| DELETE | `/api/admin/users/:userId/host-badge` | 👑 |  |  |
| POST | `/api/admin/events` | 🛠 |  | ---------------- Resmi etkinlikler, dönem kapatma, KYC ---------------- |
| GET | `/api/admin/events` | 🛠 |  |  |
| POST | `/api/admin/events/:id/attendance` | 🛠 |  |  |
| POST | `/api/admin/payouts/close` | 👑 |  | Dönemi kapat (hesap özetleri üretir). period boş ise bir önceki dönem. |
| GET | `/api/admin/payouts` | 🛠 |  |  |
| GET | `/api/admin/payouts/:id` | 🛠 |  |  |
| POST | `/api/admin/statements/:kind/:id/pay` | 👑 |  | Yayıncı maaşı için KYC onayı şarttır. |
| POST | `/api/admin/payouts/:id/pay-all` | 👑 |  | Toplu "ödendi": dönemin bekleyen özetleri (yayıncıda KYC onayı olmayanlar atlanır). |
| POST | `/api/admin/statements/:kind/:id/void` | 👑 |  | Özeti iptal et (hatalı / şüpheli). Yöntem 2 ile maaşa çevrilen elmaslar yayıncıya iade edilir. |
| GET | `/api/admin/kyc` | 🛠 |  |  |
| POST | `/api/admin/users/:userId/kyc` | 👑 |  |  |
| GET | `/api/admin/finance/audit` | 👑 |  |  |
| POST | `/api/admin/music/tracks` | 👑 |  | Telif: yalnızca kullanım hakkına sahip olduğunuz parçaları ekleyin; lisans notu zorunludur. |
| GET | `/api/admin/music/tracks` | 👑 |  |  |
| GET | `/api/admin/reports` | 🛠 |  | ---------------- Şikâyetler (admin + support) ---------------- |
| POST | `/api/admin/reports/:id/resolve` | 🛠 |  |  |
| GET | `/api/admin/security/events` | 👑 |  | ---------------- Güvenlik duvarı (yalnızca yönetici) ---------------- |
| GET | `/api/admin/security/blocks` | 👑 |  |  |
| POST | `/api/admin/security/blocks` | 👑 |  |  |
| DELETE | `/api/admin/security/blocks/:ip` | 👑 |  |  |
| GET | `/api/admin/weekly-events` | 👑 |  | ---------- Haftalık etkinlikler (Çift, Kral/Kraliçe, Yıldız): açık/kapalı, yıldız hediyesi, ödüller, kurallar ---------- |
| PUT | `/api/admin/weekly-events/:kind` | 👑 |  |  |
| GET | `/api/admin/banners` | 🛠 |  | ---------- Banner ve duyuru yönetimi (yalnızca yönetici) ---------- |
| PUT | `/api/admin/banners/image` | 🛠 |  |  |
| POST | `/api/admin/banners` | 🛠 |  |  |
| PATCH | `/api/admin/banners/:id` | 🛠 |  |  |
| DELETE | `/api/admin/banners/:id` | 🛠 |  |  |
| PUT | `/api/admin/announcements/image` | 🛠 |  | Duyuru kartı görseli (Mesajlar > Ekip / Etkinlik / Ödül). |
| GET | `/api/admin/push` | 👑 |  | uygulama açılınca telefon bildirimi olarak düşer. |
| POST | `/api/admin/push` | 👑 | admin_push |  |
| POST | `/api/admin/announcements` | 🛠 |  |  |
| DELETE | `/api/admin/announcements/:id` | 🛠 |  |  |
| GET | `/api/admin/dashboard` | 👑 |  |  |
| GET | `/api/admin/client-errors` | 👑 |  |  |
| DELETE | `/api/admin/client-errors` | 👑 |  |  |
| GET | `/api/admin/actions` | 👑 |  | Yönetici/yardımcı admin işlemleri ve para hareketleri tek listede: kim, ne zaman, kime, ne yaptı. |
| GET | `/api/admin/app-config` | 👑 |  |  |
| PUT | `/api/admin/app-config` | 👑 |  |  |
| GET | `/api/admin/moderation/strikes` | 👑 |  |  |
| POST | `/api/admin/users/:userId/chat-restriction` | 🛠 |  | Sohbet kısıtı: dakika (0 = kaldır). Yardımcı admin de kullanabilir (yalnızca normal kullanıcılara). |
| GET | `/api/admin/users/:userId/devices` | 👑 |  | Cihazlar: kullanıcının oturumları ve aynı cihazı kullanan diğer hesaplar (çoklu hesap / hile tespiti). |
| GET | `/api/admin/users/:userId/credentials` | 👑 |  | Kullanıcı adı, telefon ve şifre. Şifre hiçbir zaman gösterilmez; yalnızca yenisi verilebilir. |
| POST | `/api/admin/users/:userId/credentials` | 👑 |  | Şifre değişince kullanıcının tüm oturumları kapanır (yeni şifreyle yeniden giriş yapar). |
| POST | `/api/admin/users/:userId/sessions/revoke-all` | 👑 |  | Kullanıcının tüm cihazlarındaki oturumları kapatır (hesap çalındı şüphesi vb.). |

## events.js  (`/api/events`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/events` | 🔒 |  | Banner'lar ve sayfa başlığı için özet: hangi etkinlik açık, her birinin şimdiki lideri. |
| GET | `/api/events/:kind` | 🔒 |  |  |

## feed.js  (`/api`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/banners` | açık |  | ---------- Banner'lar ---------- |
| GET | `/api/announcements` | 🔒 |  |  |
| GET | `/api/inbox-summary` | 🔒 |  | (users.inbox_seen); hiç açılmamış türde eski ortak okunma zamanı (announcements_seen_at) geçerlidir. |
| POST | `/api/inbox-summary/seen` | 🔒 |  | Kart açılınca o türün rozeti sıfırlanır; tür verilmezse (eski sürüm) hepsi. |
| GET | `/api/posts` | (isteğe bağlı) |  | ---------- Gönderi akışı ---------- |
| PUT | `/api/posts/image` | 🔒 | post_image |  |
| POST | `/api/posts` | 🔒 | post_create |  |
| DELETE | `/api/posts/:id` | 🔒 |  |  |
| POST | `/api/posts/:id/like` | 🔒 | post_like |  |
| DELETE | `/api/posts/:id/like` | 🔒 |  |  |
| GET | `/api/posts/:id/comments` | (isteğe bağlı) |  |  |
| POST | `/api/posts/:id/comments` | 🔒 | post_comment |  |

## gifts.js  (`/api`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/gifts` | 🔒 |  |  |
| GET | `/api/gifts/global/recent` | 🔒 |  | Uygulama açılışında şeridi doldurmak için son global hediyeler. |
| POST | `/api/rooms/:roomId/gifts/send` | 🔒 | gift | - Kendine hediye; ajans/maaş hesabına ve liderlik tablolarına SAYILMAZ (suistimali önlemek için). PK puanına SAYILIR (Micolive gibi). |

## agencies.js  (`/api`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/agencies` | 🔒 |  | ---------------- Ajans ---------------- |
| POST | `/api/agencies` | 🔒 |  | Ajansı yalnızca yönetici açar (Yönetim → Ajans/Yayıncı → "Ajans aç" ya da Davet Merkezi önerisini onaylar). |
| GET | `/api/agencies/mine` | 🔒 |  |  |
| PATCH | `/api/agencies/:agencyId` | 🔒 |  |  |
| GET | `/api/agencies/:agencyId/dashboard` | 🔒 |  | Ajans paneli (v2.65 ve öncesi uygulamalar için; yeni uygulama /api/agency-center kullanır). |
| GET | `/api/agencies/:agencyId/statements` | 🔒 |  |  |
| GET | `/api/agencies/by-code/:code` | 🔒 |  | Ajans koduyla ajans bilgisi. |
| POST | `/api/agencies/apply-by-code` | 🔒 |  |  |
| GET | `/api/agencies/:agencyId/requests` | 🔒 |  |  |
| POST | `/api/agencies/:agencyId/invite` | 🔒 |  |  |
| POST | `/api/agencies/:agencyId/apply` | 🔒 |  |  |
| POST | `/api/agency-requests/:requestId/respond` | 🔒 |  | Davet eden değil, karşı taraf yanıtlar: davete kullanıcı, (eski) başvuruya ajans sahibi. |
| POST | `/api/agencies/:agencyId/self-join` | 🔒 |  | Ajans sahibi kendi ajansında yayıncı olabilir (davet beklemeden). |
| POST | `/api/agencies/:agencyId/broadcasters/:userId/remove` | 🔒 |  |  |
| POST | `/api/broadcaster/apply` | 🔒 |  | ---------------- Yayıncı ---------------- |
| GET | `/api/broadcaster/me` | 🔒 |  |  |
| POST | `/api/broadcaster/pay-pref` | 🔒 |  |  |
| GET | `/api/broadcaster/statements` | 🔒 |  |  |
| GET | `/api/broadcaster/requests` | 🔒 |  |  |
| GET | `/api/broadcaster/transfers` | 🔒 |  |  |
| POST | `/api/broadcaster/leave-agency` | 🔒 |  | Ajanstan ayrılma: bekleme süresi varsa ajans onayı (ya da süre dolunca otomatik) gerekir. |
| POST | `/api/agency-transfers/:id/respond` | 🔒 |  | Kaynak ajans sahibi bekleyen transferi onaylar / reddeder. |
| POST | `/api/agency-transfers/:id/escalate` | 🔒 |  | Reddedilen transferi yayıncı platform (yönetim) incelemesine taşır. |
| POST | `/api/agency-transfers/:id/cancel` | 🔒 |  |  |

## agency_center.js  (`/api`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/agency-center/me` | açık |  | ---------------- Rol / giriş ---------------- |
| GET | `/api/agency-center/pay-table` | açık |  |  |
| GET | `/api/agency-center/:agencyId/home` | açık |  | ---------------- Ajansım ---------------- |
| GET | `/api/agency-center/:agencyId/hosts` | açık |  | ---------------- Yayıncı istatistikleri ---------------- |
| GET | `/api/agency-center/:agencyId/earnings` | açık |  | ---------------- Kazanç ayrıntısı ---------------- |
| POST | `/api/agency-center/:agencyId/announcement` | açık |  | ---------------- Duyuru ve ayarlar ---------------- |
| POST | `/api/agency-center/:agencyId/settings` | açık |  |  |
| POST | `/api/agency-center/:agencyId/invite` | açık |  | Yayıncı daveti (ajans sahibi ya da asistan). |
| POST | `/api/agency-center/:agencyId/invites/:requestId/cancel` | açık |  |  |
| GET | `/api/agency-center/:agencyId/assistants` | açık |  | ---------------- Asistanlar ---------------- |
| POST | `/api/agency-center/:agencyId/assistants/invite` | açık |  |  |
| POST | `/api/agency-center/:agencyId/assistants/:id/share` | açık |  |  |
| POST | `/api/agency-center/:agencyId/assistants/:id/remove` | açık |  |  |
| GET | `/api/agency-assistant/invites` | açık |  | Davet edilen kişi: bekleyen asistan davetleri ve yanıt. |
| POST | `/api/agency-assistant/invites/:id/respond` | açık |  |  |
| POST | `/api/agency-assistant/resign` | açık |  |  |
| GET | `/api/agency-center/:agencyId/transfers` | açık |  | ---------------- Transfer geçmişi ---------------- |
| GET | `/api/agency-center/:agencyId/invite-center` | açık |  | ---------------- Davet merkezi ---------------- |
| POST | `/api/agency-center/:agencyId/referrals` | açık |  | Yeni ajans önerisi (yönetici onaylayınca açılır; davet eden ajans olarak kaydedilir). |
| POST | `/api/agency-center/:agencyId/referrals/:id/cancel` | açık |  |  |

## music.js  (`/api`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/music/tracks` | 🔒 |  | Müzik kütüphanesi (yalnızca yönetici tarafından eklenen, lisansı kayıtlı parçalar). |
| POST | `/api/rooms/:roomId/music/upload` | 🔒 |  |  |
| GET | `/api/rooms/:roomId/music` | 🔒 |  |  |
| POST | `/api/rooms/:roomId/music/queue` | 🔒 | music_queue |  |
| DELETE | `/api/rooms/:roomId/music/queue/:itemId` | 🔒 |  |  |
| POST | `/api/rooms/:roomId/music/play` | 🔒 | music_ctl |  |
| POST | `/api/rooms/:roomId/music/pause` | 🔒 | music_ctl |  |
| POST | `/api/rooms/:roomId/music/seek` | 🔒 | music_ctl |  |
| POST | `/api/rooms/:roomId/music/next` | 🔒 | music_ctl |  |
| POST | `/api/rooms/:roomId/music/stop` | 🔒 | music_ctl |  |

## luckybag.js  (`/api`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/lucky-bags/config` | 🔒 |  |  |
| GET | `/api/rooms/:roomId/lucky-bags` | 🔒 |  |  |
| POST | `/api/rooms/:roomId/lucky-bags` | 🔒 | lucky_send |  |
| POST | `/api/lucky-bags/:id/claim` | 🔒 | lucky_claim |  |
| GET | `/api/me/daily` | 🔒 |  | Günlük görevler |

## pk.js  (`/api`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| POST | `/api/pk/challenge` | 🔒 | pk | Meydan okuma: yalnızca kendi odanızın sahibi başka bir odaya PK daveti gönderir. |
| POST | `/api/pk/:id/respond` | 🔒 | pk |  |
| POST | `/api/pk/:id/cancel` | 🔒 |  | Bekleyen daveti geri çek (davet eden) veya süren PK'yı erken bitir (iki oda sahibinden biri). |
| GET | `/api/rooms/:roomId/pk` | 🔒 |  |  |
| GET | `/api/pk/rooms` | 🔒 |  | PK için aday odalar: açık, PK'sı olmayan, gizli olmayan odalar. |
| POST | `/api/pk/:id/peer-token` | 🔒 | pk_peer | Uygulama bununla rakip yayına ikinci bir bağlantı açar; bölünmüş ekranın sağında rakip yayıncı görünür ve sesi duyulur. |
| POST | `/api/rooms/:roomId/room-pk` | 🔒 | pk |  |
| POST | `/api/room-pk/:id/start` | 🔒 | pk | "Başla": Hazırlanıyor durumundaki turu başlatır (3-2-1 ve VS animasyonu herkeste oynar). |
| POST | `/api/room-pk/:id/end` | 🔒 | pk |  |
| GET | `/api/rooms/:roomId/room-pk` | 🔒 |  |  |

## games.js  (`/api`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/rooms/:roomId/game` | 🔒 |  |  |
| POST | `/api/rooms/:roomId/games` | 🔒 | game_create | Oyun kurma: oda sahibi / yardımcı sahip / moderatör. Ücretsizdir, Coin bahsi yoktur. |
| POST | `/api/games/:id/join` | 🔒 | game |  |
| POST | `/api/games/:id/leave` | 🔒 |  |  |
| POST | `/api/games/:id/start` | 🔒 |  |  |
| POST | `/api/games/:id/cancel` | 🔒 |  |  |
| POST | `/api/games/:id/roll` | 🔒 | game_move |  |
| POST | `/api/games/:id/move` | 🔒 | game_move |  |

## safety.js  (`/api`)

| Yöntem | Yol | Kimlik | ⏱ | Not |
|---|---|---|---|---|
| GET | `/api/blocks` | 🔒 |  | ---------------- Kullanıcı engelleme ---------------- |
| POST | `/api/blocks/:userId` | 🔒 | block |  |
| DELETE | `/api/blocks/:userId` | 🔒 |  |  |
| POST | `/api/reports` | 🔒 | report | ---------------- Şikâyet ---------------- |
