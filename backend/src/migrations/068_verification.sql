-- v2.100.0: Telefon (Firebase SMS) ve e-posta (6 haneli kod) doğrulaması, kodla şifre sıfırlama.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(lower(email)) WHERE email IS NOT NULL;

-- E-postaya gönderilen kodlar: yalnızca özeti (HMAC) saklanır; 10 dakika geçerli, en fazla 5 deneme, tek kullanım.
CREATE TABLE IF NOT EXISTS email_codes (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  purpose VARCHAR(16) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  CONSTRAINT email_codes_purpose_check CHECK (purpose IN ('verify', 'reset'))
);
CREATE INDEX IF NOT EXISTS idx_email_codes_lookup ON email_codes(lower(email), purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_codes_expires ON email_codes(expires_at);
