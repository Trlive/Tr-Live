-- SDUI v2: ekran bazında bileşen ağacı, taslak/yayın ayrımı ve geri alma.
--
-- v1 (sdui_layouts) yalnızca ana ekranın sekmelerini sürüyordu ve tek kayıt + geçmiş
-- biçimindeydi. v2 genel bir ağaç saklıyor ve üç şeyi ekliyor:
--
--  1) TASLAK ve YAYIN ayrı. Yönetici düzeni kaydedip önizleyebiliyor; kullanıcılar
--     yalnızca yayınlanmışı görüyor. v1'de kaydet = yayınla idi, yani deneme yapmak
--     canlıyı bozmak demekti.
--  2) KADEMELİ AÇILIŞ. Yayınlanan sürüm önce %1'e gider. Oran, kullanıcı kimliğinden
--     sha256 ile türetilir — rastgele DEĞİL; yoksa aynı kullanıcı her açılışta farklı
--     ekran görür ve "bende öyle değildi" diye şikâyet gelir.
--  3) EN DÜŞÜK UYGULAMA SÜRÜMÜ. Eski APK'ya çizemeyeceği bileşen hiç gönderilmez.

CREATE TABLE IF NOT EXISTS sdui_screens (
  screen_id        text PRIMARY KEY CHECK (screen_id ~ '^[a-z][a-z0-9_]{1,30}$'),
  -- Taslak: panelde düzenlenen, yalnızca önizlemede görünen hâl.
  draft            jsonb NOT NULL DEFAULT '{"schemaVersion":2,"root":{"type":"column","children":[]}}'::jsonb,
  draft_updated_at timestamptz NOT NULL DEFAULT NOW(),
  draft_updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Yayın: kullanıcıların gördüğü hâl. NULL ise uygulama kendi yerleşik ekranını çizer.
  published        jsonb,
  -- İçerik özeti; uygulama ETag olarak kullanır. Zamana bağlı olsaydı içerik değişmeden
  -- sürüm değişir ve bütün telefonlar boşuna yeniden indirirdi.
  revision         text,
  published_at     timestamptz,
  published_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  -- 0 = kimse görmez (yayın hazır ama kapalı), 100 = herkes.
  rollout          smallint NOT NULL DEFAULT 0 CHECK (rollout BETWEEN 0 AND 100),
  -- Bu ekranı çizebilen en düşük uygulama sürümü. Altındaki sürümler yerleşik ekranı çizer.
  min_app          text NOT NULL DEFAULT '0.0.0',
  note             text NOT NULL DEFAULT ''
);

-- Yayınlanan her sürüm saklanır: yanlış bir ekran yayınlandığında tek adımda dönülür.
-- Geri dönüş yolu olmayan bir uzaktan arayüz sistemi, uygulamayı kullanılamaz hale getirme
-- yetkisini sunucuya vermek demektir.
CREATE TABLE IF NOT EXISTS sdui_screen_versions (
  id           bigserial PRIMARY KEY,
  screen_id    text NOT NULL,
  revision     text NOT NULL,
  payload      jsonb NOT NULL,
  rollout      smallint NOT NULL DEFAULT 0,
  min_app      text NOT NULL DEFAULT '0.0.0',
  note         text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS sdui_screen_versions_idx ON sdui_screen_versions(screen_id, id DESC);

-- Taşınacak 12 ekran boş taslakla açılır: panelde görünür, ama yayın NULL olduğu için
-- uygulama bugünkü yerleşik ekranını çizmeye devam eder. Yani bu göç hiçbir şeyi değiştirmez.
INSERT INTO sdui_screens(screen_id) VALUES
  ('help'), ('events'), ('event_detail'), ('inbox'), ('campaign'), ('relations'),
  ('family'), ('agency'), ('dealer'), ('settings'), ('apply_form'), ('profile_sections')
ON CONFLICT (screen_id) DO NOTHING;

-- Pilot ekran (Yardım / Müşteri Hizmetleri) için başlangıç TASLAĞI.
--
-- Yalnızca taslak: `published` NULL kaldığı için kullanıcılar hâlâ uygulamanın yerleşik
-- ekranını görüyor. Panelde "yayınla" denene kadar bu göç hiçbir şeyi değiştirmez.
-- Amaç, düzenleyiciyi boş sayfayla açmamak: mevcut ekranın birebir karşılığı hazır gelsin.
UPDATE sdui_screens SET draft = '{"schemaVersion": 2, "screenId": "help", "root": {"type": "column", "padding": 12, "gap": 4, "children": [{"type": "title", "text": "Konu seçin", "subtitle": "Size en hızlı şekilde yardımcı olalım"}, {"type": "grid", "columns": 2, "gap": 10, "children": [{"type": "card", "title": "Aile", "action": {"type": "openScreen", "screen": "support", "arg": "Aile"}}, {"type": "card", "title": "ACM ve Yayıncı Konuları", "action": {"type": "openScreen", "screen": "support", "arg": "ACM ve Yayıncı Konuları"}}, {"type": "card", "title": "Oyunlar", "action": {"type": "openScreen", "screen": "support", "arg": "Oyunlar"}}, {"type": "card", "title": "Etkinlikler", "action": {"type": "openScreen", "screen": "support", "arg": "Etkinlikler"}}, {"type": "card", "title": "Onaylamalar", "action": {"type": "openScreen", "screen": "support", "arg": "Onaylamalar"}}, {"type": "card", "title": "Özelden yapılan küfür ve hakaret", "action": {"type": "openScreen", "screen": "support", "arg": "Özelden yapılan küfür ve hakaret"}}, {"type": "card", "title": "VIP", "action": {"type": "openScreen", "screen": "support", "arg": "VIP"}}, {"type": "card", "title": "BCM", "action": {"type": "openScreen", "screen": "support", "arg": "BCM"}}]}, {"type": "divider", "padding": 10}, {"type": "listItem", "title": "Çevrimiçi müşteri hizmetleri", "icon": "chat", "tone": "gold", "action": {"type": "openScreen", "screen": "support"}}]}}'::jsonb
 WHERE screen_id = 'help';
