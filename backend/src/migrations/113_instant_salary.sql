-- Ay içi maaş avansı (sahibinin kararı): yayıncı kotayı doldurunca maaşın bir kısmı ANINDA Fasulye olarak yatar;
-- ay sonunda gelir ve saate göre tam maaş hesaplanır, ödenen avans düşülerek kalanı yatırılır.
--
-- Bayrak KAPALI başlar (instant_salary_enabled = FALSE): panelden açılana kadar hiçbir şey ödenmez.
-- instant_salary_bps: avans oranı (baz puan; 5000 = hak edilen maaşın %50'si). Avans ayrıca, yayıncının dönem sonunda
-- ZATEN garanti aldığı tutarı (Yöntem 1 maaşı) aşamaz; bkz. wallet/instant_salary.rules.js.
CREATE TABLE IF NOT EXISTS salary_advances(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  cents BIGINT NOT NULL CHECK (cents > 0),
  entitled_cents BIGINT NOT NULL,   -- ödeme anındaki hak ediş (bilgi amaçlı)
  floor_cents BIGINT NOT NULL,      -- ödeme anındaki garanti tutar (bilgi amaçlı)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_period_id UUID REFERENCES payout_periods(id)  -- dönem kapanırken hangi dönemin maaşından düşüldü
);
CREATE INDEX IF NOT EXISTS idx_salary_advances_user ON salary_advances(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_salary_advances_open ON salary_advances(created_at) WHERE applied_period_id IS NULL;

-- Özetteki salary_cents artık AVANS DÜŞÜLMÜŞ kalan tutardır (cüzdana yatırma, bekleyen toplamlar ve ödeme uçları değişmeden
-- doğru tutarı kullanır). Avansın kendisi advance_cents'te görünür; toplam hak ediş = salary_cents + advance_cents.
ALTER TABLE host_statements ADD COLUMN IF NOT EXISTS advance_cents BIGINT NOT NULL DEFAULT 0;

ALTER TABLE agency_settings
  ADD COLUMN IF NOT EXISTS instant_salary_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS instant_salary_bps INT NOT NULL DEFAULT 5000 CHECK (instant_salary_bps BETWEEN 0 AND 10000);
