-- Oda temaları: yönetim panelinden eklenip çıkarılan katalog + kullanıcıya özel tema (Yoho gibi: ödülle hak verilir,
-- kullanıcı kendi görselini yükler, yönetim onaylayınca verilen süre boyunca kullanılır).

CREATE TABLE IF NOT EXISTS room_themes(
  key VARCHAR(20) PRIMARY KEY,                 -- rooms.theme sütunu VARCHAR(20)
  label VARCHAR(60) NOT NULL,
  colors JSONB NOT NULL DEFAULT '[]',          -- ["#RRGGBB", ...] degrade (görsel yoksa / görselin altında)
  image_url TEXT,                              -- isteğe bağlı tam ekran arka plan (hareketli webp/gif de olabilir)
  effect VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (effect IN ('none', 'aurora', 'stars', 'bubbles', 'embers')),
  price_coins BIGINT NOT NULL DEFAULT 0 CHECK (price_coins >= 0),   -- 0 = Coin'siz (herkes kullanır)
  duration_days INT NOT NULL DEFAULT 30 CHECK (duration_days > 0),  -- satın alınınca kaç gün kullanılır
  sort_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Coin'siz (basit) temalar: mevcut 8 tema + 4 yeni sade tema.
INSERT INTO room_themes(key, label, colors, effect, price_coins, sort_order) VALUES
  ('default',  'Varsayılan',  '["#0E0B07","#1A140A"]', 'none', 0, 0),
  ('neon',     'Neon',        '["#12002B","#00334E","#3A0050"]', 'none', 0, 1),
  ('galaxy',   'Galaksi',     '["#05051A","#1B1347","#3B1E6E"]', 'none', 0, 2),
  ('sunset',   'Gün batımı',  '["#2B0E1F","#7A2B3A","#B5542E"]', 'none', 0, 3),
  ('forest',   'Orman',       '["#06170F","#0F3B25","#1C5A3A"]', 'none', 0, 4),
  ('royal',    'Kraliyet',    '["#1A1033","#3B2470","#8A6A1F"]', 'none', 0, 5),
  ('ocean',    'Okyanus',     '["#021A2B","#05445E","#0B6E8A"]', 'none', 0, 6),
  ('rose',     'Gül',         '["#2B0A1C","#6B1F45","#B04A78"]', 'none', 0, 7),
  ('graphite', 'Grafit',      '["#0D0F12","#1B1F26","#2A303A"]', 'none', 0, 8),
  ('mint',     'Nane',        '["#06201C","#0B4A40","#127A66"]', 'none', 0, 9),
  ('plum',     'Erik',        '["#180A24","#3A1556","#5E2A86"]', 'none', 0, 10),
  ('dusk',     'Alacakaranlık','["#0B1220","#1F2D4F","#3C4E86"]', 'none', 0, 11)
ON CONFLICT (key) DO NOTHING;

-- Coin ile alınan temalar: önce hareketsiz özel tasarımlar, sonra hafif hareketli olanlar.
INSERT INTO room_themes(key, label, colors, effect, price_coins, duration_days, sort_order) VALUES
  ('midnight', 'Gece Yarısı',   '["#02030A","#0A1230","#18306B","#2E5BC4"]', 'none', 20000, 30, 20),
  ('emerald',  'Zümrüt',        '["#021510","#06382B","#0D6B50","#34D399"]', 'none', 20000, 30, 21),
  ('amethyst', 'Ametist',       '["#10051F","#2C0F55","#5B21B6","#C084FC"]', 'none', 25000, 30, 22),
  ('copper',   'Bakır Altın',   '["#1A0B04","#4A2108","#9A5A12","#FFC43D"]', 'none', 30000, 30, 23),
  ('aurora',   'Kutup Işığı',   '["#020B14","#06304A","#0C6B7A","#5CF2C0"]', 'aurora', 60000, 30, 30),
  ('starfall', 'Yıldız Yağmuru','["#04030F","#120B36","#2A1763"]', 'stars', 50000, 30, 31),
  ('bubbles',  'Baloncuk',      '["#02121E","#064A6B","#0E86B3","#7DD3FC"]', 'bubbles', 50000, 30, 32),
  ('embers',   'Kor',           '["#0C0402","#3A0F05","#8A2A0A","#FF8A3D"]', 'embers', 70000, 30, 33)
ON CONFLICT (key) DO NOTHING;

-- Kullanıcıya özel tema: yönetim "hak" verir (granted), kullanıcı görselini yükler (pending), yönetim onaylar (approved;
-- süre onay anında başlar) ya da reddeder (rejected → kullanıcı yeni görsel yükleyebilir, hak korunur).
CREATE TABLE IF NOT EXISTS custom_room_themes(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  days INT NOT NULL CHECK (days > 0),          -- onaydan sonra kullanım süresi (gün)
  image_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'granted' CHECK (status IN ('granted', 'pending', 'approved', 'rejected', 'expired')),
  review_note TEXT,
  granted_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_themes_user ON custom_room_themes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_themes_pending ON custom_room_themes(status, created_at) WHERE status = 'pending';
