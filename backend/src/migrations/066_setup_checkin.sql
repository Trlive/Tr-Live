-- Yeni hesap kurulum adımı (kayıt ekranı) ve 7 günlük giriş ödülü.

-- Kayıt ekranındaki bayraklı ülke seçimi (ISO kodu, ör. TR).
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

-- Kurulum adımı (kayıt ekranı: fotoğraf, ad, cinsiyet, doğum günü, şifre, ülke). Mevcut hesaplar tamamlanmış sayılır;
-- bundan sonra açılan hesaplar kurulumu görür.
ALTER TABLE users ADD COLUMN IF NOT EXISTS setup_done BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ALTER COLUMN setup_done SET DEFAULT FALSE;

-- Günlük giriş: her gün bir kayıt (gün İstanbul saatine göre). Seri 1..7; 7. günden sonra yeniden 1.
CREATE TABLE IF NOT EXISTS daily_checkins(
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  streak INT NOT NULL CHECK (streak BETWEEN 1 AND 7),
  coins BIGINT NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_daily_checkins_day ON daily_checkins(day);
