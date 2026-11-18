-- 080: (1) Etkinlik bağlantıları: yönetici yalnızca bağlantı yapıştırır, uygulama açar; Coin'li H5 oyun sağlayıcısı
--          için imzalı sunucu-sunucu API'si (kullanıcı bilgisi / bakiye değişimi, tek seferlik sipariş numarasıyla).
--      (2) Bayi merkezi (Yoho "Coins Bayisi"): yönetimden düzenlenen toptan paketler + ödeme yöntemleri (ödeme bağlantısı),
--          gecikmeli (5 dk) teslim, satış istatistikleri.

-- ---------- (1) Etkinlikler ----------
CREATE TABLE IF NOT EXISTS activity_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(80) NOT NULL,
  subtitle VARCHAR(160) NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '🎮',                 -- emoji ya da görsel adresi (https:// veya /uploads/…)
  link_url TEXT NOT NULL DEFAULT '',               -- boşsa "Yakında" görünür
  open_mode VARCHAR(10) NOT NULL DEFAULT 'sheet' CHECK (open_mode IN ('sheet', 'full', 'browser')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  app_secret TEXT NOT NULL DEFAULT '',             -- Coin'li oyun sağlayıcısının imza anahtarı (boş = Coin API kapalı)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO activity_items(title, subtitle, icon, sort_order)
SELECT * FROM (VALUES
  ('Günlük Ödül', 'Her gün giriş yap, ödülünü al.', '🎁', 10),
  ('Şans Çarkı', 'Çarkı çevir, sürpriz ödüller kazan.', '🎡', 20),
  ('Haftalık Sıralama', 'Odanın en cömert destekçileri.', '🏆', 30)
) AS v(title, subtitle, icon, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM activity_items);

-- Sağlayıcının bakiye değişimleri: (etkinlik, sipariş no) tekildir → aynı istek iki kez gelirse ikinci kez uygulanmaz.
CREATE TABLE IF NOT EXISTS activity_orders (
  activity_id UUID NOT NULL REFERENCES activity_items(id) ON DELETE CASCADE,
  order_id VARCHAR(80) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  amount BIGINT NOT NULL,                          -- + kazanç, − harcama
  balance_after BIGINT NOT NULL,
  reason VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (activity_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_activity_orders_user ON activity_orders(user_id, created_at DESC);

-- ---------- (2) Bayi merkezi ----------
CREATE TABLE IF NOT EXISTS dealer_packages (
  code VARCHAR(40) PRIMARY KEY,
  coins BIGINT NOT NULL CHECK (coins > 0),
  price_try NUMERIC(14,2) NOT NULL CHECK (price_try >= 0),
  list_try NUMERIC(14,2) NOT NULL DEFAULT 0,
  label VARCHAR(80) NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO dealer_packages(code, coins, price_try, list_try, label, sort_order)
SELECT * FROM (VALUES
  ('Y_480K', 480000::bigint, 2500::numeric, 0::numeric, '480.000 Coin', 10),
  ('Y_960K', 960000, 5000, 0, '960.000 Coin', 20),
  ('Y_2880K', 2880000, 15000, 0, '2,88M Coin', 30),
  ('Y_4800K', 4800000, 25000, 0, '4,8M Coin', 40),
  ('Y_9600K', 9600000, 50000, 0, '9,6M Coin', 50),
  ('Y_19200K', 19200000, 100000, 0, '19,2M Coin', 60)
) AS v(code, coins, price_try, list_try, label, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM dealer_packages);

-- Ödeme yöntemleri: yönetici ödeme bağlantısını yapıştırır. Bağlantıda {price} {coins} {code} {ref} {dealer} yer
-- tutucuları kullanılabilir (talep oluşturulunca doldurulur).
CREATE TABLE IF NOT EXISTS dealer_pay_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(60) NOT NULL,
  icon TEXT NOT NULL DEFAULT '💳',
  url_template TEXT NOT NULL DEFAULT '',
  badge VARCHAR(30) NOT NULL DEFAULT '',          -- ör. "Çok kullanılan"
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dealer_topup_requests ADD COLUMN IF NOT EXISTS pay_method_id UUID REFERENCES dealer_pay_methods(id) ON DELETE SET NULL;
ALTER TABLE dealer_topup_requests ADD COLUMN IF NOT EXISTS price_try NUMERIC(14,2);
ALTER TABLE dealer_topup_requests ADD COLUMN IF NOT EXISTS ref_code VARCHAR(20);

-- Gecikmeli teslim: Coin bayiden hemen düşer, kullanıcıya deliver_at zamanında geçer (status 'scheduled' → 'done').
ALTER TABLE dealer_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(12) NOT NULL DEFAULT 'done';
ALTER TABLE dealer_transactions ADD COLUMN IF NOT EXISTS deliver_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_dealer_tx_scheduled ON dealer_transactions(deliver_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_dealer_tx_dealer_time ON dealer_transactions(dealer_id, created_at DESC);
