-- 084: Yönetim panelinden zip ile yüklenen HTML oyunlar. Dosyalar veritabanında durur (sunucu yeniden kurulsa da kaybolmaz).
CREATE TABLE IF NOT EXISTS activity_games (
  activity_id UUID PRIMARY KEY REFERENCES activity_items(id) ON DELETE CASCADE,
  version     INT  NOT NULL,
  files       INT  NOT NULL,
  bytes       BIGINT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS activity_game_files (
  activity_id UUID NOT NULL REFERENCES activity_items(id) ON DELETE CASCADE,
  version     INT  NOT NULL,
  path        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  data        BYTEA NOT NULL,
  PRIMARY KEY (activity_id, version, path)
);
