-- F-02: Bakiye ↔ işlem defteri mutabakatı.
-- Değişmez kural: her bakiye değişimi, aynı transaction içinde işaretli bir wallet_transactions
-- satırı yazar. Mutabakat bu kuralı her gün doğrular:
--     users.coins - baseline.coins  =  Σ(tüm defter) - baseline.led_coins
-- Taban (baseline) kullanıcı başına bir kez alınır; o andaki bakiye ve o andaki defter toplamı
-- birlikte saklanır. İki taraf da TEK sorguda okunduğu için araya giren işlemler iki tarafta da
-- görünür ya da iki tarafta da görünmez; zaman penceresi kaynaklı yanlış alarm olmaz.
CREATE TABLE IF NOT EXISTS wallet_recon_baseline(
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  coins         BIGINT NOT NULL,
  diamonds      BIGINT NOT NULL,
  led_coins     BIGINT NOT NULL,
  led_diamonds  BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_recon_runs(
  id            BIGSERIAL PRIMARY KEY,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  users_checked INT    NOT NULL DEFAULT 0,
  users_new     INT    NOT NULL DEFAULT 0,
  mismatches    INT    NOT NULL DEFAULT 0,
  coin_diff     BIGINT NOT NULL DEFAULT 0,
  diamond_diff  BIGINT NOT NULL DEFAULT 0,
  total_coins   BIGINT NOT NULL DEFAULT 0,
  total_diamonds BIGINT NOT NULL DEFAULT 0,
  manual        BOOLEAN NOT NULL DEFAULT FALSE,
  started_by    UUID REFERENCES users(id),
  failed        BOOLEAN NOT NULL DEFAULT FALSE,
  note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_recon_runs_time ON wallet_recon_runs(started_at DESC);

-- Fark bulunan kullanıcılar. Fark kendiliğinden kaybolmaz: incelenip "çözüldü" işaretlenir.
CREATE TABLE IF NOT EXISTS wallet_recon_items(
  id             BIGSERIAL PRIMARY KEY,
  run_id         BIGINT NOT NULL REFERENCES wallet_recon_runs(id) ON DELETE CASCADE,
  user_id        UUID   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_diff      BIGINT NOT NULL,
  diamond_diff   BIGINT NOT NULL,
  actual_coins   BIGINT NOT NULL,
  actual_diamonds BIGINT NOT NULL,
  resolved       BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by    UUID REFERENCES users(id),
  resolved_at    TIMESTAMPTZ,
  resolve_note   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recon_items_run ON wallet_recon_items(run_id);
CREATE INDEX IF NOT EXISTS idx_recon_items_open ON wallet_recon_items(created_at DESC) WHERE NOT resolved;
