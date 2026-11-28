-- Ay sonu elmas kuralı (sahibinin kararı, v2.152.22):
--  * Dönem kapanınca maaş kotası kadar elmas maaşa çevrilir (düşülür), kalan dönem elması 5 Elmas = 1 Coin ile Coin'e çevrilir.
--  * Kota dolmadıysa (bakiyede kota kadar elmas yoksa) maaş yatmaz, elmasın tamamı Coin'e çevrilir.
--  * Dönem, bittikten sonra sunucu tarafından kendiliğinden kapatılır (yönetici tuşuna gerek yok).
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS month_end_diamond_convert BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS auto_close_period BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE host_statements ADD COLUMN IF NOT EXISTS converted_diamonds BIGINT NOT NULL DEFAULT 0;
ALTER TABLE host_statements ADD COLUMN IF NOT EXISTS converted_coins BIGINT NOT NULL DEFAULT 0;
-- Hiç yayın/hediye olmadan da bakiyesi Coin'e çevrilen yayıncılar için ayrı kayıt (özet satırı oluşmaz).
CREATE TABLE IF NOT EXISTS period_diamond_conversions(
  period_id UUID NOT NULL REFERENCES payout_periods(id),
  user_id UUID NOT NULL REFERENCES users(id),
  diamonds BIGINT NOT NULL CHECK (diamonds > 0),
  coins BIGINT NOT NULL CHECK (coins > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (period_id, user_id)
);
