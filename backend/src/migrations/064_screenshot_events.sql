-- Uygulama içinde alınan ekran görüntüleri (cihaz bildirdiğinde): kim, hangi ekranda, hangi oda / profil.
-- Yönetim panelinde listelenir. Görüntünün kendisi alınmaz; yalnızca olay kaydı tutulur. 90 gün sonra silinir.
CREATE TABLE IF NOT EXISTS screenshot_events(
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  screen VARCHAR(40) NOT NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  platform VARCHAR(10),
  app_version VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_screenshot_events_time ON screenshot_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshot_events_user ON screenshot_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshot_events_target ON screenshot_events(target_user_id, created_at DESC);
