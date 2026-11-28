-- Bayi API'si (v2.154.0): bayi kendi sisteminden API anahtarıyla, kendi stoğundan kullanıcı ID'sine Coin yükler.
-- Anahtarın kendisi saklanmaz (yalnızca SHA-256 özeti); bayiye oluşturulurken bir kez gösterilir.
ALTER TABLE dealer_accounts ADD COLUMN IF NOT EXISTS api_enabled BOOLEAN NOT NULL DEFAULT FALSE; -- yönetici açar
CREATE TABLE IF NOT EXISTS dealer_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealer_accounts(id),
  prefix VARCHAR(24) NOT NULL UNIQUE,          -- listede görünen kısım (trk_XXXXXXXX)
  secret_hash CHAR(64) NOT NULL UNIQUE,
  label VARCHAR(60) NOT NULL DEFAULT '',
  ip_allow TEXT[] NOT NULL DEFAULT '{}',       -- boşsa her IP (önerilmez)
  daily_limit BIGINT NOT NULL DEFAULT 0 CHECK (daily_limit >= 0), -- 24 saatte en çok Coin; 0 = sınırsız
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  last_ip TEXT,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dealer_api_keys_dealer ON dealer_api_keys(dealer_id);
-- API ile yapılan yüklemeler: bayinin sipariş numarası (client_order_id) bayi başına benzersiz → aynı istek iki kez Coin yüklemez.
CREATE TABLE IF NOT EXISTS dealer_api_orders (
  dealer_id UUID NOT NULL REFERENCES dealer_accounts(id),
  client_order_id VARCHAR(64) NOT NULL,
  key_id UUID NOT NULL REFERENCES dealer_api_keys(id),
  user_id UUID NOT NULL REFERENCES users(id),
  coins BIGINT NOT NULL CHECK (coins > 0),
  transaction_id UUID REFERENCES dealer_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (dealer_id, client_order_id)
);
CREATE INDEX IF NOT EXISTS idx_dealer_api_orders_key_time ON dealer_api_orders(key_id, created_at);
