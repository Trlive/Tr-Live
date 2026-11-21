-- Basım bütçeleri: satın alınmamış, sıfırdan üretilen Coin'in kaynağı ve aylık sınırı.
--
-- Neden gerekli: basılan Coin ekonomiye gerçek Coin olarak girer. Hediye edilince yayıncının
-- elmasına, elmas da çekim talebiyle gerçek paraya dönüşür. Yani "bedava verilen" Coin şirketin
-- gerçek maliyetidir. Bu tablo o maliyeti kategoriye ayırır, aylık sınırla kontrol eder ve
-- "kim, ne zaman, kime, neden bastı" sorusunu cevaplar.
CREATE TABLE IF NOT EXISTS coin_budgets(
  key            TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  monthly_limit  BIGINT NOT NULL DEFAULT 0,          -- 0 = sınırsız
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coin_budgets_limit_valid CHECK (monthly_limit >= 0)
);

-- Her basım kaydı: hangi bütçeden, kime, kim tarafından, neden.
CREATE TABLE IF NOT EXISTS coin_issuances(
  id          BIGSERIAL PRIMARY KEY,
  budget_key  TEXT NOT NULL REFERENCES coin_budgets(key),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id    UUID REFERENCES users(id),
  coins       BIGINT NOT NULL,
  period      TEXT NOT NULL,                          -- 'YYYY-MM' (Türkiye saati)
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coin_issuances_amount_valid CHECK (coins <> 0)
);
CREATE INDEX IF NOT EXISTS idx_issuance_budget_period ON coin_issuances(budget_key, period);
CREATE INDEX IF NOT EXISTS idx_issuance_user ON coin_issuances(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issuance_time ON coin_issuances(created_at DESC);

INSERT INTO coin_budgets(key, name, monthly_limit, note) VALUES
  ('system_test',      'Yazılım testi',      10000000, 'Test ve deneme için basılan Coin. En pahalı hediye 5.000.000 Coin olduğundan sınır onun birkaç katı tutuldu. Panelden değişir.'),
  ('event_reward',     'Etkinlik ödülü',     0,       'Turnuva ve uygulama içi etkinlik ödülleri.'),
  ('vip_compensation', 'Kullanıcı telafisi', 500000,  'Şikâyet üzerine verilen telafi.'),
  ('marketing',        'Pazarlama bütçesi',  0,       'Kampanya, çekiliş, iş birliği.')
ON CONFLICT (key) DO NOTHING;
