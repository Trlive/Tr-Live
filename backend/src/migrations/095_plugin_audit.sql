-- O-01 (adım 1): Oyun paketi yükleme denetimi.
-- Paketin kodu sunucu sürecinin içinde çalışır; kim hangi paketi yükledi ve yüklenen dosya tam
-- olarak hangi dosyaydı sorusu kayıt altına alınır. sha256, aynı paketin tekrar yüklenip
-- yüklenmediğini ve beklenen dosya olup olmadığını kanıtlar.
ALTER TABLE game_plugins
  ADD COLUMN IF NOT EXISTS sha256       TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_by  UUID REFERENCES users(id);

CREATE TABLE IF NOT EXISTS game_plugin_audit(
  id          BIGSERIAL PRIMARY KEY,
  plugin_id   TEXT NOT NULL,
  action      TEXT NOT NULL,              -- install | enable | disable | restart | remove
  admin_id    UUID REFERENCES users(id),
  version     TEXT,
  sha256      TEXT,
  files       INT,
  bytes       BIGINT,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_plugin_audit_time ON game_plugin_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_audit_plugin ON game_plugin_audit(plugin_id, created_at DESC);
