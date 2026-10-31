-- v2.71: Yönetimin verdiği seviye. Seviye toplam exp'ten hesaplanır (kullanıcı: gönderilen Coin, yayıncı: alınan Elmas);
-- verilen seviye için gereken fark bu sütunlarda tutulur, gerçek harcama / kazanç istatistikleri değişmez.
ALTER TABLE users ADD COLUMN IF NOT EXISTS level_exp_bonus BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS host_level_exp_bonus BIGINT NOT NULL DEFAULT 0;
