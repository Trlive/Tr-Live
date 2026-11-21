-- Alarmlar: bir şey bozulduğunda kimsenin haberi olmaması (denetim I-02) kapatılıyor.
--
-- Ölçümler bellekte tutuluyor (sunucu yeniden başlayınca sıfırlanır); ALARM ise kalıcı
-- olmak zorunda: gece 03:00'te açılıp kapanan bir sorunun sabah görülebilmesi gerekir.
CREATE TABLE IF NOT EXISTS alerts (
  id            BIGSERIAL PRIMARY KEY,
  alert_key     TEXT NOT NULL,                 -- kural kimliği: 'api_error_rate', 'db_pool' ...
  severity      TEXT NOT NULL DEFAULT 'warn',  -- 'warn' | 'critical'
  title         TEXT NOT NULL,
  detail        JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hit_count     INTEGER NOT NULL DEFAULT 1,
  resolved_at   TIMESTAMPTZ,
  acked_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  acked_at      TIMESTAMPTZ
);

-- Aynı kural AÇIKKEN ikinci satır açılmasın: tekrarlar hit_count ile sayılır.
-- Yoksa 5 dakikada bir tetiklenen bir kural geceyi 288 satırla doldurur ve panel
-- okunmaz hale gelir (alarm yorgunluğu).
CREATE UNIQUE INDEX IF NOT EXISTS alerts_open_key ON alerts(alert_key) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS alerts_recent ON alerts(started_at DESC);
