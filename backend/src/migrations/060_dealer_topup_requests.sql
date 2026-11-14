-- Bayi Bakiye Talep Akışı: aktif bayiler toptan paket seçip bakiye talebi oluşturur; yönetici (admin) onaylar/reddeder.
-- Onayda bayinin coin_balance'ı artar ve financial_audit_logs'a kaydedilir. Hiçbir gizleme/maskeleme yoktur; görünürlük
-- tamamen rol bazlıdır (yalnızca aktif bayi talep oluşturur, yalnızca admin inceler). Ödeme platform DIŞINDADIR
-- (ajans/ödeme modelindeki gibi): yönetici, bedelin tahsil edildiğini teyit ettikten sonra onaylar.
CREATE TABLE IF NOT EXISTS dealer_topup_requests(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_user_id UUID NOT NULL REFERENCES users(id),      -- talebi oluşturan bayi (hesap sahibi)
  dealer_id UUID REFERENCES dealer_accounts(id),           -- bakiyesi artırılacak bayi hesabı (talep anındaki aktif hesap)
  requested_coins BIGINT NOT NULL CHECK (requested_coins > 0),
  package_code VARCHAR(40),                                -- seçilen toptan paketin kodu (sunucudaki sabit listeden)
  reference_note TEXT,                                     -- bayinin notu (ör. havale referansı / açıklama)
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),                   -- inceleyen yönetici
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,                                        -- yöneticinin red/onay notu (isteğe bağlı)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Yönetici kuyruğu: en eski bekleyen talep önce.
CREATE INDEX IF NOT EXISTS idx_dealer_topup_pending ON dealer_topup_requests(status, created_at) WHERE status = 'pending';
-- Bayinin kendi geçmişi.
CREATE INDEX IF NOT EXISTS idx_dealer_topup_owner ON dealer_topup_requests(dealer_user_id, created_at DESC);
