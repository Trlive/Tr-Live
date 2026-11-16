-- Dolar cüzdanı (v2.109.0): yayıncı ve ajans sahiplerinin kazandığı maaş / primler artık sistemde bakiye olarak durur.
-- Her hareket usd_transactions defterine yazılır (tutar işaretli: + giriş, − çıkış; balance_after = hareket sonrası bakiye).
-- Cüzdandan iki çıkış vardır: admin'e çekim talebi (usd_withdrawals) ve Coin bayisine gönderim (usd_dealer_transfers).
-- Tutarlar sent (1 dolar = 100) olarak tam sayı tutulur; kesirli hesap yapılmaz.
ALTER TABLE users ADD COLUMN IF NOT EXISTS usd_cents BIGINT NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_usd_cents_nonneg') THEN
    ALTER TABLE users ADD CONSTRAINT users_usd_cents_nonneg CHECK (usd_cents >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS usd_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(30) NOT NULL CHECK (type IN ('salary', 'agency_bonus', 'assistant_share', 'referral_bonus',
    'withdraw_request', 'withdraw_refund', 'dealer_transfer', 'admin_adjust')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  ref_type VARCHAR(30),
  ref_id UUID,
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usd_tx_user ON usd_transactions(user_id, created_at DESC);
-- Bir hesap özeti (maaş / prim) cüzdana yalnızca BİR kez yatırılabilir; bir çekim talebi yalnızca bir kez iade edilebilir.
CREATE UNIQUE INDEX IF NOT EXISTS uq_usd_tx_once ON usd_transactions(type, ref_id)
  WHERE type IN ('salary', 'agency_bonus', 'assistant_share', 'referral_bonus', 'withdraw_request', 'withdraw_refund', 'dealer_transfer');

CREATE TABLE IF NOT EXISTS usd_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  method VARCHAR(60) NOT NULL,
  account TEXT NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected', 'cancelled')),
  admin_note TEXT,
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usd_wd_status ON usd_withdrawals(status, created_at);
CREATE INDEX IF NOT EXISTS idx_usd_wd_user ON usd_withdrawals(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usd_dealer_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  dealer_id UUID NOT NULL REFERENCES dealer_accounts(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  coins_per_usd BIGINT NOT NULL CHECK (coins_per_usd > 0),
  coins BIGINT NOT NULL CHECK (coins > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usd_dt_user ON usd_dealer_transfers(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usd_dt_dealer ON usd_dealer_transfers(dealer_id, created_at DESC);
