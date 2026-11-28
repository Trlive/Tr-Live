-- Coin bayilik sistemi v2 (v2.153.0): otomatik ödeme siparişleri, teşvikler, bayi gelir-gider.
--
-- 1) payment_orders: tek sipariş tablosu. İki tür:
--    * dealer : bayi stoğu (toptan paket) — ödeme onaylanınca dealer_accounts.coin_balance artar.
--    * user   : kullanıcı yüklemesi (web yükleme sayfası, uygulama ID'siyle) — ödeme onaylanınca users.coins artar.
--    Sağlayıcılar: paytr (kart, imzalı geri çağrı), usdt_trc20 (zincir üstü, benzersiz tutarla eşleşme), bank (havale/EFT,
--    yönetici teyidi). Coin YALNIZCA ödeme doğrulandığında ve BİR KERE yazılır (satır kilidi + durum + benzersiz provider_ref).
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no VARCHAR(32) NOT NULL UNIQUE,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('dealer', 'user')),
  user_id UUID NOT NULL REFERENCES users(id),           -- Coin'in yazılacağı kullanıcı (user) ya da bayi hesabı sahibi (dealer)
  dealer_id UUID REFERENCES dealer_accounts(id),
  buyer_user_id UUID REFERENCES users(id),              -- siparişi açan oturum (web'de anonim yükleme için NULL)
  package_code VARCHAR(64) NOT NULL,
  coins BIGINT NOT NULL CHECK (coins > 0),
  bonus_coins BIGINT NOT NULL DEFAULT 0 CHECK (bonus_coins >= 0),
  bonus_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_try NUMERIC(14,2) NOT NULL CHECK (price_try >= 0),  -- paketin TL bedeli (USDT'de de kayıt/kâr hesabı için)
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),    -- tahsil edilecek tutar: TRY → kuruş, USDT → 1e-6
  currency VARCHAR(8) NOT NULL CHECK (currency IN ('TRY', 'USDT')),
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('paytr', 'usdt_trc20', 'bank')),
  status VARCHAR(12) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'expired', 'cancelled')),
  provider_ref TEXT,
  pay_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  email VARCHAR(200),
  ip TEXT,
  note TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  decided_by UUID REFERENCES users(id),                 -- havale teyidi / iptal eden yönetici
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((kind = 'dealer') = (dealer_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_created ON payment_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_dealer ON payment_orders(dealer_id, created_at DESC) WHERE dealer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_open ON payment_orders(provider, created_at) WHERE status IN ('created', 'expired');
-- Aynı ödeme (işlem özeti, PayTR sipariş no, dekont no) iki siparişe sayılamaz.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_orders_ref ON payment_orders(provider, provider_ref) WHERE provider_ref IS NOT NULL;
-- USDT: açık siparişlerin tutarları benzersizdir (gelen transfer tutarıyla siparişe eşlenir).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_orders_usdt_amount ON payment_orders(amount_minor)
  WHERE provider = 'usdt_trc20' AND status = 'created';

-- Sağlayıcıdan gelen her geri çağrı / eşleşme ham hâliyle (denetim ve uyuşmazlık için).
CREATE TABLE IF NOT EXISTS payment_events (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID REFERENCES payment_orders(id),
  provider VARCHAR(20) NOT NULL,
  kind VARCHAR(30) NOT NULL,
  ok BOOLEAN NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(order_id, created_at);

-- 2) Teşvikler.
ALTER TABLE dealer_packages ADD COLUMN IF NOT EXISTS bonus_coins BIGINT NOT NULL DEFAULT 0;
-- Aylık hacim kademesi: bayinin bu ay ödediği toptan bedel (TL) eşiği geçince stok alımlarına ek Coin (baz puan).
CREATE TABLE IF NOT EXISTS dealer_tiers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(40) NOT NULL,
  min_month_try NUMERIC(14,2) NOT NULL CHECK (min_month_try >= 0),
  bonus_bps INT NOT NULL CHECK (bonus_bps BETWEEN 0 AND 3000),
  UNIQUE (min_month_try)
);
INSERT INTO dealer_tiers(name, min_month_try, bonus_bps)
SELECT * FROM (VALUES ('Bronz', 0::numeric, 0), ('Gümüş', 100000, 200), ('Altın', 500000, 400), ('Elmas', 1500000, 600)) AS v(n, m, b)
WHERE NOT EXISTS (SELECT 1 FROM dealer_tiers);
-- Dönemsel kampanya: belli tarihler arasında bayi stoğuna ve/veya web kullanıcı yüklemesine ek Coin.
CREATE TABLE IF NOT EXISTS dealer_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(80) NOT NULL,
  applies_to VARCHAR(10) NOT NULL CHECK (applies_to IN ('dealer', 'user', 'all')),
  bonus_bps INT NOT NULL CHECK (bonus_bps BETWEEN 1 AND 5000),
  min_price_try NUMERIC(14,2) NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

-- 3) Bayi gelir-gider: stok maliyeti (ağırlıklı ortalama) ve hareket başına alış/satış bedeli.
ALTER TABLE dealer_accounts ADD COLUMN IF NOT EXISTS stock_cost_try NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE dealer_transactions ADD COLUMN IF NOT EXISTS cost_try NUMERIC(18,4);   -- bu hareketle stoktan çıkan/giren maliyet
ALTER TABLE dealer_transactions ADD COLUMN IF NOT EXISTS price_try NUMERIC(14,2);  -- müşteriden alınan / ödenen bedel (bayinin girdiği)
ALTER TABLE dealer_transactions ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES payment_orders(id);
-- Var olan stok için maliyet bilinmiyor: onaylanmış toptan taleplerin bedelinden yaklaşık başlangıç (bakiyeyi aşmayacak şekilde).
UPDATE dealer_accounts d SET stock_cost_try = LEAST(x.try, x.try * d.coin_balance / NULLIF(x.coins, 0))
FROM (SELECT dealer_id, SUM(price_try) AS try, SUM(requested_coins) AS coins FROM dealer_topup_requests
      WHERE status = 'approved' AND dealer_id IS NOT NULL AND price_try IS NOT NULL GROUP BY dealer_id) x
WHERE x.dealer_id = d.id AND d.stock_cost_try = 0 AND d.coin_balance > 0;
