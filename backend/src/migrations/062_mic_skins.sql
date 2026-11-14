-- Özel mikrofon modu tasarımları (ör. Doğum günü): Coin ile süreli alınır ya da yönetimce hediye edilir.
-- Satın alınan / hediye edilen hak envanterde (inventory_items, item_type = 'mic_skin') süreyle tutulur.
CREATE TABLE IF NOT EXISTS mic_skins(
  key VARCHAR(20) PRIMARY KEY,
  label VARCHAR(60) NOT NULL,
  seat_count INT NOT NULL CHECK (seat_count BETWEEN 2 AND 30),  -- bu tasarımın mikrofon sayısı (sahip dahil)
  price_coins BIGINT NOT NULL CHECK (price_coins >= 0),
  duration_days INT NOT NULL CHECK (duration_days > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 100
);

-- Doğum günü: 25 mikrofon (sahip + ortada taçlı doğum günü koltuğu + 23 konuk), 500.000 Coin, 15 gün.
INSERT INTO mic_skins(key, label, seat_count, price_coins, duration_days, sort_order)
VALUES ('birthday', 'Doğum Günü', 25, 500000, 15, 10)
ON CONFLICT (key) DO NOTHING;

-- Odanın etkin tasarımı ve üstündeki yazı (ör. kimin doğum günü).
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS mic_skin VARCHAR(20);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS mic_skin_text VARCHAR(40);
