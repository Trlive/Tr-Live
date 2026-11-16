-- Fasulye sistemi (v2.110.0): dolar cüzdanındaki bakiye uygulamada "Fasulye" olarak gösterilir (1 Fasulye = 1 dolar = 100 sent).
-- Fasulye Coin'e çevrilebilir: kullanıcı kendine çevirir ya da başka bir kullanıcıya Coin olarak gönderir. İşlem anında
-- yapılır ve geri alınamaz. Her çevirme usd_coin_exchanges tablosuna, Fasulye çıkışı usd_transactions defterine,
-- Coin girişi wallet_transactions (Coin geçmişi) tablosuna yazılır.
ALTER TABLE usd_transactions DROP CONSTRAINT IF EXISTS usd_transactions_type_check;
ALTER TABLE usd_transactions ADD CONSTRAINT usd_transactions_type_check CHECK (type IN ('salary', 'agency_bonus', 'assistant_share',
  'referral_bonus', 'withdraw_request', 'withdraw_refund', 'dealer_transfer', 'admin_adjust', 'coin_exchange', 'coin_send'));

-- Aynı kaynak (özet / talep / gönderim / çevirme) deftere yalnızca BİR kez yazılabilir.
DROP INDEX IF EXISTS uq_usd_tx_once;
CREATE UNIQUE INDEX IF NOT EXISTS uq_usd_tx_once ON usd_transactions(type, ref_id)
  WHERE type IN ('salary', 'agency_bonus', 'assistant_share', 'referral_bonus', 'withdraw_request', 'withdraw_refund',
    'dealer_transfer', 'coin_exchange', 'coin_send');

CREATE TABLE IF NOT EXISTS usd_coin_exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),          -- Fasulyesi düşen kullanıcı
  target_user_id UUID NOT NULL REFERENCES users(id),   -- Coin'i alan kullanıcı (kendine çevirmede user_id ile aynı)
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  coins_per_usd BIGINT NOT NULL CHECK (coins_per_usd > 0),
  coins BIGINT NOT NULL CHECK (coins > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usd_ce_user ON usd_coin_exchanges(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usd_ce_target ON usd_coin_exchanges(target_user_id, created_at DESC);
