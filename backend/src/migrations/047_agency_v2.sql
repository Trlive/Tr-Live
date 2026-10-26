-- v2.66: Ajans sistemi v2.
--  * 44 seviyeli yayıncı maaş tablosu (iki yöntem: toplam elmas / dönem sonu bakiye), seviye başına ajans primi ve ödüller
--    (VIP günü, yayıncı rozeti, özel ID).
--  * Ajans asistanları (davet ettikleri yayıncıların ajans priminden pay), ajans duyurusu.
--  * Transfer geçmişi (ajansa katılma, ajans değiştirme, ayrılma, çıkarılma; kaynak ajans / platform onayı).
--  * Davet merkezi: ajans önerme (yönetici onayı) ve davet edilen ajansın priminden pay.

CREATE TABLE IF NOT EXISTS host_pay_levels(
  level INT PRIMARY KEY CHECK (level BETWEEN 1 AND 60),
  required_days INT CHECK (required_days IS NULL OR required_days BETWEEN 0 AND 31),
  required_hours INT CHECK (required_hours IS NULL OR required_hours BETWEEN 0 AND 744),
  game_hours INT NOT NULL DEFAULT 0 CHECK (game_hours BETWEEN 0 AND 744),
  diamonds BIGINT NOT NULL CHECK (diamonds >= 0),
  salary1_cents BIGINT NOT NULL DEFAULT 0 CHECK (salary1_cents >= 0),
  salary2_cents BIGINT NOT NULL DEFAULT 0 CHECK (salary2_cents >= 0),
  agency_cents BIGINT NOT NULL DEFAULT 0 CHECK (agency_cents >= 0),
  vip_level INT CHECK (vip_level IS NULL OR vip_level BETWEEN 1 AND 11),
  vip_days INT NOT NULL DEFAULT 0 CHECK (vip_days BETWEEN 0 AND 365),
  badge VARCHAR(10) CHECK (badge IS NULL OR badge IN ('bronz','gumus','altin','super','ozel')),
  special_id_days INT NOT NULL DEFAULT 0 CHECK (special_id_days BETWEEN 0 AND 365),
  special_id_count INT NOT NULL DEFAULT 1 CHECK (special_id_count BETWEEN 1 AND 5)
);
INSERT INTO host_pay_levels(level, required_days, required_hours, game_hours, diamonds, salary1_cents, salary2_cents, agency_cents,
                            vip_level, vip_days, badge, special_id_days, special_id_count) VALUES
  (1, 22, 80, 5, 200000, 1000, 1500, 200, NULL, 0, NULL, 0, 1),
  (2, 22, 80, 5, 300000, 1500, 2300, 400, NULL, 0, NULL, 0, 1),
  (3, 22, 80, 5, 500000, 2600, 3900, 800, NULL, 0, NULL, 0, 1),
  (4, 22, 50, 5, 800000, 4000, 6000, 1500, NULL, 0, NULL, 0, 1),
  (5, 22, 50, 5, 1200000, 5800, 8600, 2500, 3, 10, NULL, 0, 1),
  (6, 22, 50, 5, 1600000, 6400, 9600, 3600, 3, 20, NULL, 0, 1),
  (7, 11, 40, 5, 2200000, 7500, 13200, 5100, 4, 10, NULL, 0, 1),
  (8, 11, 40, 5, 2800000, 9500, 16800, 6100, 4, 20, NULL, 0, 1),
  (9, 11, 40, 5, 3600000, 12500, 21600, 8100, 5, 10, 'bronz', 0, 1),
  (10, 11, 20, 5, 5000000, 17100, 30000, 11400, 5, 20, 'bronz', 0, 1),
  (11, 11, 20, 5, 6250000, 21300, 37500, 14300, 5, 20, 'bronz', 0, 1),
  (12, 11, 20, 5, 7500000, 27700, 47000, 15000, 5, 30, 'gumus', 0, 1),
  (13, 11, 20, 5, 10000000, 37300, 63000, 19400, 6, 10, 'gumus', 0, 1),
  (14, 11, 20, 5, 12500000, 47000, 79000, 24000, 6, 20, 'gumus', 10, 1),
  (15, 11, 20, 5, 15000000, 56500, 95000, 28500, 6, 20, 'gumus', 10, 1),
  (16, NULL, NULL, 5, 20000000, 78500, 135000, 35000, 6, 30, 'gumus', 10, 1),
  (17, NULL, NULL, 5, 25000000, 100600, 168800, 43700, 7, 10, 'altin', 10, 1),
  (18, NULL, NULL, 5, 30000000, 120500, 202500, 52500, 7, 20, 'altin', 10, 1),
  (19, NULL, NULL, 5, 35000000, 140000, 236200, 61300, 7, 20, 'altin', 10, 1),
  (20, NULL, NULL, 5, 40000000, 161000, 270000, 70000, 7, 25, 'altin', 10, 1),
  (21, NULL, NULL, 5, 45000000, 182500, 303800, 78700, 7, 30, 'altin', 10, 1),
  (22, NULL, NULL, 5, 50000000, 203500, 337500, 87500, 8, 10, 'altin', 20, 1),
  (23, NULL, NULL, 5, 75000000, 297100, 506200, 131300, 8, 10, 'super', 20, 1),
  (24, NULL, NULL, 5, 100000000, 393100, 675000, 175000, 8, 15, 'super', 20, 1),
  (25, NULL, NULL, 5, 125000000, 498500, 843800, 218700, 8, 15, 'super', 20, 1),
  (26, NULL, NULL, 5, 150000000, 594500, 1012500, 262500, 8, 20, 'super', 30, 1),
  (27, NULL, NULL, 5, 200000000, 786100, 1350000, 350000, 8, 20, 'super', 30, 1),
  (28, NULL, NULL, 5, 250000000, 987500, 1687500, 437500, 8, 25, 'ozel', 30, 1),
  (29, NULL, NULL, 5, 300000000, 1188100, 2025000, 525000, 8, 25, 'ozel', 30, 1),
  (30, NULL, NULL, 5, 350000000, 1400000, 2362500, 612500, 8, 30, 'ozel', 30, 1),
  (31, NULL, NULL, 5, 400000000, 1611000, 2700000, 700000, 9, 10, 'ozel', 30, 1),
  (32, NULL, NULL, 5, 450000000, 1803000, 3037500, 787500, 9, 20, 'ozel', 30, 1),
  (33, NULL, NULL, 5, 500000000, 2014500, 3375000, 875000, 9, 30, 'ozel', 30, 1),
  (34, NULL, NULL, 5, 550000000, 2215900, 3712500, 962500, 9, 30, 'ozel', 30, 1),
  (35, NULL, NULL, 5, 600000000, 2417400, 4050000, 1050000, 9, 30, 'ozel', 30, 1),
  (36, NULL, NULL, 5, 650000000, 2618800, 4387500, 1137500, 9, 30, 'ozel', 30, 1),
  (37, NULL, NULL, 5, 700000000, 2820300, 4725000, 1225000, 9, 30, 'ozel', 30, 1),
  (38, NULL, NULL, 5, 750000000, 3021700, 5062500, 1312500, 9, 30, 'ozel', 30, 1),
  (39, NULL, NULL, 5, 1000000000, 4029000, 6750000, 1750000, 9, 30, 'ozel', 30, 2),
  (40, NULL, NULL, 5, 1250000000, 5036200, 8437500, 2187500, 9, 30, 'ozel', 30, 2),
  (41, NULL, NULL, 5, 1500000000, 6043400, 10125000, 2625000, 9, 30, 'ozel', 30, 2),
  (42, NULL, NULL, 5, 1750000000, 7050700, 11812500, 3062500, 9, 30, 'ozel', 30, 2),
  (43, NULL, NULL, 5, 2000000000, 8057900, 13500000, 3500000, 9, 30, 'ozel', 30, 2),
  (44, NULL, NULL, 5, 2500000000, 10072400, 16875000, 4375000, 9, 30, 'ozel', 30, 2)

ON CONFLICT (level) DO NOTHING;

ALTER TABLE agency_settings
  ADD COLUMN IF NOT EXISTS valid_day_minutes INT NOT NULL DEFAULT 60 CHECK (valid_day_minutes BETWEEN 1 AND 1440),
  ADD COLUMN IF NOT EXISTS require_game_hours BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allow_balance_method BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS max_assistants INT NOT NULL DEFAULT 7 CHECK (max_assistants BETWEEN 0 AND 50),
  ADD COLUMN IF NOT EXISTS max_assistant_bps INT NOT NULL DEFAULT 5000 CHECK (max_assistant_bps BETWEEN 0 AND 10000),
  ADD COLUMN IF NOT EXISTS referral_bps INT NOT NULL DEFAULT 500 CHECK (referral_bps BETWEEN 0 AND 10000),
  ADD COLUMN IF NOT EXISTS transfer_wait_hours INT NOT NULL DEFAULT 72 CHECK (transfer_wait_hours BETWEEN 0 AND 720),
  ADD COLUMN IF NOT EXISTS agency_grades JSONB NOT NULL
    DEFAULT '[{"name":"D","min":"0"},{"name":"C","min":"50000000"},{"name":"B","min":"200000000"},{"name":"A","min":"1000000000"},{"name":"S","min":"3000000000"}]'::jsonb;

ALTER TABLE host_statements
  ADD COLUMN IF NOT EXISTS valid_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS game_seconds BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_diamonds BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level1 INT,
  ADD COLUMN IF NOT EXISTS level2 INT,
  ADD COLUMN IF NOT EXISTS salary1_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary2_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_method SMALLINT,
  ADD COLUMN IF NOT EXISTS consumed_diamonds BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rewards JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pay_note TEXT;

ALTER TABLE agency_statements
  ADD COLUMN IF NOT EXISTS commission_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assistant_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pay_note TEXT;

-- Asistan ve davet primi hesap özetleri (ödeme yönetimce elle yapılır, burada "ödendi" işaretlenir).
CREATE TABLE IF NOT EXISTS assistant_statements(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES payout_periods(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_bps INT NOT NULL DEFAULT 0,
  host_count INT NOT NULL DEFAULT 0,
  base_cents BIGINT NOT NULL DEFAULT 0,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','void')),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES users(id),
  pay_note TEXT,
  UNIQUE (period_id, agency_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_assistant_statements_user ON assistant_statements(user_id);

CREATE TABLE IF NOT EXISTS referral_statements(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES payout_periods(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  invited_agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  base_cents BIGINT NOT NULL DEFAULT 0,
  bps INT NOT NULL DEFAULT 0,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','void')),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES users(id),
  pay_note TEXT,
  UNIQUE (period_id, invited_agency_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_statements_agency ON referral_statements(agency_id);

-- Ajans asistanları. Davet 7 gün geçerlidir; bir kişi aynı anda tek ajansın asistanı olabilir.
CREATE TABLE IF NOT EXISTS agency_assistants(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_bps INT NOT NULL DEFAULT 0 CHECK (share_bps BETWEEN 0 AND 10000),
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','removed','cancelled','resigned')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  ended_by UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_assistant_open ON agency_assistants(agency_id, user_id) WHERE status IN ('pending','active');
CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_assistant_one ON agency_assistants(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_agency_assistant_agency ON agency_assistants(agency_id, status);

-- Yayıncıyı davet eden asistan (NULL: ajans sahibi). Asistan payı buna göre hesaplanır.
ALTER TABLE broadcasters ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id) ON DELETE SET NULL;
-- Maaş yöntemi tercihi: 0 = otomatik (yüksek olan), 1 = yalnızca Yöntem 1 (bakiyedeki elmaslar maaşa çevrilmesin).
ALTER TABLE broadcasters ADD COLUMN IF NOT EXISTS pay_method_pref SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE broadcasters DROP CONSTRAINT IF EXISTS broadcasters_pay_method_pref_check;
ALTER TABLE broadcasters ADD CONSTRAINT broadcasters_pay_method_pref_check CHECK (pay_method_pref IN (0, 1));
ALTER TABLE agency_requests ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS announcement TEXT,
  ADD COLUMN IF NOT EXISTS announcement_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assistants_can_announce BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS referrer_agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agencies_referrer ON agencies(referrer_agency_id) WHERE referrer_agency_id IS NOT NULL;

-- Transfer geçmişi. join: ajansa katıldı, transfer: ajans değiştirdi, leave: ayrıldı, removed: ajans çıkardı, admin: yönetim.
CREATE TABLE IF NOT EXISTS agency_transfers(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  to_agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('join','transfer','leave','removed','admin')),
  status VARCHAR(16) NOT NULL DEFAULT 'approved' CHECK (status IN ('pending_source','pending_platform','approved','rejected','cancelled')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_transfer_open ON agency_transfers(user_id) WHERE status IN ('pending_source','pending_platform');
CREATE INDEX IF NOT EXISTS idx_agency_transfer_from ON agency_transfers(from_agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agency_transfer_to ON agency_transfers(to_agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agency_transfer_auto ON agency_transfers(auto_at) WHERE status = 'pending_source';

-- Davet merkezi: bir ajansın önerdiği yeni ajans (yönetici onaylayınca açılır, davet eden ajans kaydedilir).
CREATE TABLE IF NOT EXISTS agency_applications(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referrer_agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  name VARCHAR(60) NOT NULL,
  note TEXT,
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_app_open ON agency_applications(user_id) WHERE status = 'pending';

-- Yayıncı rozeti ve özel ID (maaş ödülü ya da yönetim). Süresi geçen kayıt görünmez; özel ID numarası kişide kalır.
CREATE TABLE IF NOT EXISTS host_badges(
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  badge VARCHAR(10) NOT NULL CHECK (badge IN ('bronz','gumus','altin','super','ozel')),
  expires_at TIMESTAMPTZ NOT NULL,
  source VARCHAR(10) NOT NULL DEFAULT 'salary',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS special_ids(
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  special_id VARCHAR(10) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  source VARCHAR(10) NOT NULL DEFAULT 'salary',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_special_ids_value ON special_ids(special_id);

CREATE INDEX IF NOT EXISTS idx_mic_sessions_user_started ON mic_sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_room_game_players_user ON room_game_players(user_id);
