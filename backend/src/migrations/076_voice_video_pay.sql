-- Sesli ve görüntülü yayın için ayrı maaş hesabı (v2.110.0).
-- * host_pay_levels: SESLİ oda tablosu olarak kalır (ajans primi de bu tablodan, yayıncının TOPLAM elmasına göre hesaplanır).
-- * host_pay_levels_video: GÖRÜNTÜLÜ yayın tablosu; başlangıçta sesli tablonun kopyasıdır, panelden ayrı düzenlenir.
-- * Elmas ve süre, hediyenin alındığı / mikrofona çıkılan odanın türüne (rooms.room_type) göre iki tarafta ayrı sayılır;
--   iki maaş ayrı hesaplanıp toplanır. split_by_room_type = FALSE yapılırsa eski davranışa (tek havuz) dönülür.
-- * Görüntülü tarafa özgü üç kural (0 = kural kapalı): günde sayılan en fazla süre, en kısa geçerli oturum ve
--   "elması tutan ama gün/saat şartı tutmayan seviye yüzde kaç kesintiyle ödensin".
CREATE TABLE IF NOT EXISTS host_pay_levels_video (LIKE host_pay_levels INCLUDING ALL);
INSERT INTO host_pay_levels_video SELECT * FROM host_pay_levels ON CONFLICT DO NOTHING;

ALTER TABLE agency_settings
  ADD COLUMN IF NOT EXISTS split_by_room_type BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS video_daily_cap_minutes INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_min_session_minutes INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_shortfall_cut_bps INT NOT NULL DEFAULT 0;

-- Cüzdan dönemi: bu dönemin özetleri "ödendi" yapılırken tutar dolar cüzdanına yatırılır (eski dönemlerde ödeme
-- platform dışında yapılır, yalnızca işaretlenir). Kimlik doğrulaması (KYC) onaylı olmayan yayıncının maaşı dönem
-- kapanışında yatmaz; admin KYC'yi onaylayıp özeti ödeyince cüzdana geçer.
ALTER TABLE payout_periods ADD COLUMN IF NOT EXISTS wallet_mode BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE host_statements
  ADD COLUMN IF NOT EXISTS audio_seconds BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audio_diamonds BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audio_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_seconds BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_diamonds BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_level INT,
  ADD COLUMN IF NOT EXISTS video_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_shortfall BOOLEAN NOT NULL DEFAULT FALSE;
