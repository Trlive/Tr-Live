-- v2.103.0: Şanslı hediye havuzları (Yoho / Bigo tarzı). Her şanslı hediyenin kendi havuzu vardır; gönderimlerin payı
-- buraya girer, kazançlar buradan ödenir. Bakiyeler 1/10000 Coin birimindedir.
CREATE TABLE IF NOT EXISTS lucky_pools (
  gift_id UUID PRIMARY KEY REFERENCES gifts(id) ON DELETE CASCADE,
  base_balance BIGINT NOT NULL DEFAULT 0 CHECK (base_balance >= 0),
  jackpot_balance BIGINT NOT NULL DEFAULT 0 CHECK (jackpot_balance >= 0),
  total_in BIGINT NOT NULL DEFAULT 0,      -- gönderimlerden giren (1/10000 Coin)
  total_out BIGINT NOT NULL DEFAULT 0,     -- ödenen kazanç (1/10000 Coin)
  seeded BIGINT NOT NULL DEFAULT 0,        -- yönetimin eklediği (1/10000 Coin)
  jackpot_hits BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
