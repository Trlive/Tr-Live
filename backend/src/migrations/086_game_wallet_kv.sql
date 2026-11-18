-- Gömülü oyunlar (Kedi Çarkı…): Coin işlemleri idempotent (txId) yazılır; oyun durumu/ayarları kv tablosunda tutulur.
CREATE TABLE IF NOT EXISTS game_wallet_tx(
  tx_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_game_wallet_tx_created ON game_wallet_tx(created_at);
CREATE TABLE IF NOT EXISTS game_kv(
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Kedi Çarkı etkinlik kartı (bir kez eklenir; başlık, simge ve sırayı panelden değiştirebilirsiniz).
INSERT INTO activity_items(title, subtitle, icon, link_url, open_mode, sort_order)
SELECT 'Kedi Çarkı', 'Yiyeceğe bahis yap, çark dönsün.', '🐱', '{base}/g/kedi/?token={token}&roomId={roomId}&lang={lang}', 'full', 40
WHERE NOT EXISTS (SELECT 1 FROM activity_items WHERE link_url LIKE '%/g/kedi/%');
