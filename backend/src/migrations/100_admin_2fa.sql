-- Yönetici iki adımlı doğrulaması (2FA).
--
-- ## Tehdit
--
-- Yönetici hesabı tek bir şifreyle korunuyordu. O şifre ele geçirilirse (yeniden kullanılmış
-- şifre, oltalama, bulaşmış bilgisayar) saldırgan panelin tamamına sahip olur: Coin basar,
-- kullanıcı verisine erişir, ödeme ayarlarını değiştirir. Bütçe sınırları bunu YAVAŞLATIR ama
-- durdurmaz — çünkü sınırları da aynı panelden değiştirebilir.
--
-- 2FA, çalınan şifreyi tek başına işe yaramaz hale getirir.
--
-- ## Niçin yalnızca yöneticiler
--
-- Normal kullanıcılara zorunlu 2FA, giriş yapamayan kullanıcı demek. Risk/fayda dengesi orada
-- tutmuyor. Yetkili hesaplarda tutuyor: sayıca az, kaybı büyük.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret    text,
  -- Kurulum tamamlanana kadar (ilk doğru kod girilene kadar) 2FA devrede DEĞİL: anahtarı
  -- kaydedip doğrulamadan açmak, yanlış kurulumda yöneticiyi kendi panelinden kilitler.
  ADD COLUMN IF NOT EXISTS totp_enabled_at timestamptz;

-- Kurtarma kodları. Telefon kaybolursa tek çıkış yolu.
--
-- Kurtarma kodu olmayan bir 2FA, telefonu kaybeden yöneticiyi kalıcı olarak kilitler ve
-- veritabanına elle müdahale gerektirir — ki o da en kötü anda, baskı altında yapılır.
--
-- Kodlar ÖZETLENEREK saklanır: veritabanı sızarsa düz metin kodlar 2FA'yı tamamen atlatırdı.
CREATE TABLE IF NOT EXISTS user_recovery_codes (
  id        bigserial PRIMARY KEY,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS recovery_codes_user_idx ON user_recovery_codes(user_id) WHERE used_at IS NULL;
-- Aynı kod iki kez kullanılamaz; eşzamanlı iki istek de aynı kodu tüketemez.
CREATE UNIQUE INDEX IF NOT EXISTS recovery_codes_unique ON user_recovery_codes(user_id, code_hash);
