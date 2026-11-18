-- Wild King slotu (sunucu otoriter): oyuncu durumu, jackpot havuzu, spin kaydı.
CREATE TABLE IF NOT EXISTS wild_king_state(
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  free_left INT NOT NULL DEFAULT 0,
  free_total BIGINT NOT NULL DEFAULT 0,
  free_bet INT NOT NULL DEFAULT 0,
  prog INT NOT NULL DEFAULT 0,
  tickets INT NOT NULL DEFAULT 0,
  ticket_bets JSONB NOT NULL DEFAULT '[]',
  gamble_avail BIGINT NOT NULL DEFAULT 0,
  gamble JSONB,
  crazy JSONB,
  stops JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS wild_king_pool(
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total BIGINT NOT NULL DEFAULT 0,
  wag BIGINT NOT NULL DEFAULT 0,
  paid BIGINT NOT NULL DEFAULT 0,
  jp_paid BIGINT NOT NULL DEFAULT 0,
  spins BIGINT NOT NULL DEFAULT 0
);
INSERT INTO wild_king_pool(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS wild_king_spins(
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bet BIGINT NOT NULL,
  win BIGINT NOT NULL,
  jp_tier VARCHAR(10),
  jp_amount BIGINT NOT NULL DEFAULT 0,
  is_free BOOLEAN NOT NULL DEFAULT FALSE,
  top_sym SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wild_king_spins_created ON wild_king_spins(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wild_king_spins_jp ON wild_king_spins(jp_tier, id DESC) WHERE jp_tier IS NOT NULL;

-- Wild King etkinlik kartı (bir kez eklenir; başlık/simge/sırayı panelden değiştirebilirsiniz).
INSERT INTO activity_items(title, subtitle, icon, link_url, open_mode, sort_order)
SELECT 'Wild King', 'Slot: 50 çizgi, free spin ve jackpot.', '🦁', '{base}/g/wild/?token={token}&lang={lang}', 'full', 50
WHERE NOT EXISTS (SELECT 1 FROM activity_items WHERE link_url LIKE '%/g/wild/%');
ALTER TABLE wild_king_pool ADD COLUMN IF NOT EXISTS wins BIGINT NOT NULL DEFAULT 0;
