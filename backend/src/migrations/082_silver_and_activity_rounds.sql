-- 082: (1) Gümüş madeni para: yalnızca Ludo / Uno gibi etkinliklere GİRİŞ için; Coin'e çevrilmez, satılmaz.
--      (2) Etkinliklerde Coin'li tur sistemi: oyun sayfası bahis açar, sonucu (çarpan) bildirir; giriş/çıkış sunucuda.
ALTER TABLE users ADD COLUMN IF NOT EXISTS silver BIGINT NOT NULL DEFAULT 0 CHECK (silver >= 0);

CREATE TABLE IF NOT EXISTS silver_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  type          VARCHAR(40) NOT NULL,       -- daily_checkin | activity_entry | admin_grant
  reference     TEXT,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_silver_tx_user ON silver_transactions(user_id, created_at DESC);

ALTER TABLE daily_checkins ADD COLUMN IF NOT EXISTS silver BIGINT NOT NULL DEFAULT 0;

ALTER TABLE activity_items
  ADD COLUMN IF NOT EXISTS entry_silver   BIGINT        NOT NULL DEFAULT 0 CHECK (entry_silver >= 0),
  ADD COLUMN IF NOT EXISTS coin_play      BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS min_bet        BIGINT        NOT NULL DEFAULT 100 CHECK (min_bet >= 1),
  ADD COLUMN IF NOT EXISTS max_bet        BIGINT        NOT NULL DEFAULT 100000 CHECK (max_bet >= 1),
  ADD COLUMN IF NOT EXISTS max_multiplier NUMERIC(8,2)  NOT NULL DEFAULT 50 CHECK (max_multiplier >= 0);

CREATE TABLE IF NOT EXISTS activity_rounds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activity_items(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bet         BIGINT NOT NULL CHECK (bet > 0),
  payout      BIGINT,
  multiplier  NUMERIC(8,2),
  status      VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_activity_rounds_user ON activity_rounds(user_id, status, created_at DESC);
