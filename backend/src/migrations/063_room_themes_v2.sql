-- Oda temaları v2: görselli katalog (küçük resim + tam ekran), yeni hafif hareket efektleri, yönetimden silinen temalar
-- (is_deleted: yeniden eklenmez), kullanıcıya özel tema için oda bağlantısı. Görseller açılışta samples/themes'ten yüklenir.
ALTER TABLE room_themes ADD COLUMN IF NOT EXISTS thumb_url TEXT;
ALTER TABLE room_themes ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE room_themes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE room_themes DROP CONSTRAINT IF EXISTS room_themes_effect_check;
ALTER TABLE room_themes ADD CONSTRAINT room_themes_effect_check
  CHECK (effect IN ('none', 'aurora', 'stars', 'bubbles', 'embers', 'snow', 'fireflies', 'petals', 'meteors'));

-- Coin'siz (sade) temalar: iki yeni tasarım.
INSERT INTO room_themes(key, label, colors, effect, price_coins, sort_order) VALUES
  ('mosque', 'Gece Camii', '["#3A1A5E","#8A3A9E","#5A2A7A"]', 'none', 0, 12),
  ('dunes',  'Çöl',        '["#2C6A7E","#3C7F8F","#2A5F70"]', 'none', 0, 13)
ON CONFLICT (key) DO NOTHING;

-- Coin'li temalar: hareketsiz özel tasarımlar (14 gün) ve hafif hareketli olanlar.
INSERT INTO room_themes(key, label, colors, effect, price_coins, duration_days, sort_order) VALUES
  ('midnight', 'Gece Yarısı',    '["#02030A","#0A1230","#18306B","#2E5BC4"]', 'none',      29990, 14, 20),
  ('emerald',  'Zümrüt',         '["#021510","#06382B","#0D6B50"]',           'none',      29990, 14, 21),
  ('amethyst', 'Ametist',        '["#10051F","#2C0F55","#5B21B6"]',           'none',      34990, 14, 22),
  ('romance',  'Romantik',       '["#1A0420","#5A0F3A","#24061A"]',           'none',      34990, 14, 23),
  ('stage',    'Sahne',          '["#020818","#062A6B","#03102E"]',           'none',      39990, 14, 24),
  ('neoncity', 'Retro Neon',     '["#0A0220","#3A0A5E","#FF4D8D"]',           'none',      39990, 14, 25),
  ('copper',   'Altın Işık',     '["#0D0602","#2A1405","#9A5A12"]',           'none',      44990, 14, 26),
  ('milkyway', 'Samanyolu',      '["#03040C","#0D1030","#3A2A48"]',           'none',      49990, 14, 27),
  ('bubbles',  'Derin Mavi',     '["#0E86B3","#064A6B","#011018"]',           'bubbles',   69990, 14, 30),
  ('embers',   'Kor Ateş',       '["#0C0402","#3A0F05","#8A2A0A"]',           'embers',    69990, 14, 31),
  ('fireflies','Ateş Böcekleri', '["#03100C","#0F3A2A","#1D5A3A"]',           'fireflies', 69990, 14, 32),
  ('aurora',   'Kutup Işığı',    '["#020B14","#06304A","#0C6B7A"]',           'aurora',    76990, 14, 33),
  ('starfall', 'Yıldız Kayması', '["#04030F","#120B36","#2A1763"]',           'meteors',   76990, 14, 34),
  ('winter',   'Kar Gecesi',     '["#050B1C","#18305A","#4A6A9A"]',           'snow',      76990, 14, 35),
  ('sakura',   'Sakura',         '["#0B0A24","#2A1A4A","#4A2050"]',           'petals',    76990, 7,  36),
  ('cosmos',   'Kozmos',         '["#02010A","#07031A","#3D7BFF"]',           'stars',     99990, 14, 37)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, colors = EXCLUDED.colors, effect = EXCLUDED.effect,
  price_coins = EXCLUDED.price_coins, duration_days = EXCLUDED.duration_days, sort_order = EXCLUDED.sort_order;

UPDATE room_themes SET label = 'Gün Batımı' WHERE key = 'sunset';

-- Özel tema: hangi odada kullanıldığı (oda görseli rooms.theme_image_url'e yazılır; süre bitince oda varsayılana döner).
CREATE INDEX IF NOT EXISTS idx_custom_themes_active ON custom_room_themes(user_id, expires_at) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_inventory_room_theme ON inventory_items(user_id, item_key) WHERE item_type = 'room_theme';
