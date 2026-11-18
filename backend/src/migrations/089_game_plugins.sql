-- Oyun paketleri: oyunların kodu depoda DEĞİL, panelden yüklenen paketlerde durur (dosyalar burada saklanır).
CREATE TABLE IF NOT EXISTS game_plugins(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  manifest JSONB NOT NULL DEFAULT '{}',
  files INT NOT NULL DEFAULT 0,
  bytes BIGINT NOT NULL DEFAULT 0,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS game_plugin_files(
  plugin_id TEXT NOT NULL REFERENCES game_plugins(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  data BYTEA NOT NULL,
  PRIMARY KEY(plugin_id, path)
);
